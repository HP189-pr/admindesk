from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from django.utils import timezone
from django.conf import settings
from django.contrib.postgres.search import SearchVector
from .models import DocRec, Verification, MigrationRecord, ProvisionalRecord, InstLetterMain
from .models import PayBy, VerificationStatus
from .domain_transcript_generate import TranscriptRequest
from .domain_enrollment import Enrollment
from .domain_degree import StudentDegree
from .domain_mail_request import GoogleFormSubmission


@receiver(post_save, sender=DocRec)
def docrec_post_save(sender, instance: DocRec, created, **kwargs):
    """When a DocRec is created or updated, ensure a matching service row exists.
    We create placeholder rows for services that support nullable fields (Verification, InstLetterMain).
    For Migration/Provisional (which require unique numbers) we skip auto-creation unless
    the necessary identifiers are present in the DocRec or are passed via related payloads.
    """
    try:
        doc_rec_id = getattr(instance, 'doc_rec_id', None)
        if not doc_rec_id:
            return
        svc = _infer_apply_for_from_docrec_id(doc_rec_id)
        if svc == 'VR':
            # create a placeholder Verification if none exists for this DocRec
            try:
                exists = Verification.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists()
                if not exists:
                    vr = Verification(
                        enrollment_no=None,
                        student_name='',
                        doc_rec_date=getattr(instance, 'doc_rec_date', None) or timezone.now().date())
                    vr.doc_rec = instance
                    vr.status = 'IN_PROGRESS'
                    try:
                        vr.full_clean()
                    except Exception:
                        pass
                    try:
                        vr.save()
                    except Exception:
                        pass
            except Exception:
                pass
        elif svc == 'IV':
            try:
                exists = InstLetterMain.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists()
                if not exists:
                    iv = InstLetterMain(doc_rec=instance)
                    try:
                        iv.full_clean()
                    except Exception:
                        pass
                    try:
                        iv.save()
                    except Exception:
                        pass
            except Exception:
                pass
        # MG/PR/GT auto-creation skipped because models require unique identifiers (mg_number/prv_number)
    except Exception:
        pass


def _infer_apply_for_from_docrec_id(doc_rec_id: str):
    if not doc_rec_id:
        return None
    dc = str(doc_rec_id).strip().lower()
    if dc.startswith('vr'):
        return 'VR'
    if dc.startswith('iv'):
        return 'IV'
    if dc.startswith('pr'):
        return 'PR'
    if dc.startswith('mg'):
        return 'MG'
    if dc.startswith('gt'):
        return 'GT'
    return None


def _ensure_docrec_exists_and_sync(doc_rec_id: str, src_obj=None):
    """Ensure a DocRec with `doc_rec_id` exists. If not, create a minimal one.
    If `src_obj` has `doc_rec_remark` or `pay_rec_no`, copy them to DocRec.
    This function is best-effort and will swallow errors to avoid breaking
    the calling save operation.
    """
    if not doc_rec_id:
        return None
    try:
        dr = DocRec.objects.filter(doc_rec_id=doc_rec_id).first()
        if not dr:
            apply_for = _infer_apply_for_from_docrec_id(doc_rec_id) or 'VR'
            dr = DocRec(apply_for=apply_for, doc_rec_id=doc_rec_id, pay_by=PayBy.NA)
            # set dates to now to satisfy non-null constraints
            dr.doc_rec_date = timezone.now().date()
            try:
                dr.full_clean()
            except Exception:
                pass
            dr.save()
        # Sync remarks/pay_rec_no if source provides
        changed = False
        if src_obj is not None:
            try:
                src_rem = getattr(src_obj, 'doc_rec_remark', None)
                if src_rem is not None and getattr(dr, 'doc_rec_remark', None) != src_rem:
                    dr.doc_rec_remark = src_rem
                    changed = True
            except Exception:
                pass
            try:
                src_pay = getattr(src_obj, 'pay_rec_no', None)
                if src_pay is not None and getattr(dr, 'pay_rec_no', None) != src_pay:
                    dr.pay_rec_no = src_pay
                    changed = True
            except Exception:
                pass
        if changed:
            try:
                dr.save(update_fields=['doc_rec_remark', 'pay_rec_no', 'updatedat'])
            except Exception:
                try:
                    dr.save()
                except Exception:
                    pass
        return dr
    except Exception:
        return None


@receiver(post_save, sender=Verification)
def verification_post_save(sender, instance: Verification, created, **kwargs):
    # When Verification is saved, ensure the parent DocRec exists and copy key fields
    try:
        doc_rec_id = None
        if instance.doc_rec:
            doc_rec_id = getattr(instance.doc_rec, 'doc_rec_id', None)
        # If doc_rec field empty but final_no or pay_rec_no present, nothing to do
        if doc_rec_id:
            _ensure_docrec_exists_and_sync(doc_rec_id, src_obj=instance)
    except Exception:
        pass


@receiver(post_save, sender=MigrationRecord)
def migration_post_save(sender, instance: MigrationRecord, created, **kwargs):
    try:
        doc_rec_id = getattr(instance, 'doc_rec', None)
        if doc_rec_id:
            _ensure_docrec_exists_and_sync(doc_rec_id, src_obj=instance)
    except Exception:
        pass


@receiver(post_save, sender=ProvisionalRecord)
def provisional_post_save(sender, instance: ProvisionalRecord, created, **kwargs):
    try:
        doc_rec_id = getattr(instance, 'doc_rec', None)
        if doc_rec_id:
            _ensure_docrec_exists_and_sync(doc_rec_id, src_obj=instance)
    except Exception:
        pass


@receiver(post_save, sender=InstLetterMain)
def inst_veri_main_post_save(sender, instance: InstLetterMain, created, **kwargs):
    try:
        doc_rec_id = None
        if instance.doc_rec:
            doc_rec_id = getattr(instance.doc_rec, 'doc_rec_id', None)
        if doc_rec_id:
            _ensure_docrec_exists_and_sync(doc_rec_id, src_obj=instance)
    except Exception:
        pass


# ============================================================================
# DELETE SIGNALS - Automatic bidirectional sync on deletion
# ============================================================================

@receiver(post_delete, sender=DocRec)
def docrec_post_delete(sender, instance: DocRec, **kwargs):
    """When DocRec is deleted, automatically delete linked service records."""
    try:
        doc_rec_id = getattr(instance, 'doc_rec_id', None)
        if not doc_rec_id:
            return
        
        # Delete all linked service records
        Verification.objects.filter(doc_rec__doc_rec_id=doc_rec_id).delete()
        MigrationRecord.objects.filter(doc_rec=doc_rec_id).delete()
        ProvisionalRecord.objects.filter(doc_rec=doc_rec_id).delete()
        InstLetterMain.objects.filter(doc_rec__doc_rec_id=doc_rec_id).delete()
    except Exception:
        # Never raise from signal handler
        pass


@receiver(post_delete, sender=Verification)
def verification_post_delete(sender, instance: Verification, **kwargs):
    """When Verification is deleted, automatically delete linked DocRec if no other services reference it."""
    try:
        if not instance.doc_rec:
            return
        
        doc_rec_id = getattr(instance.doc_rec, 'doc_rec_id', None)
        if not doc_rec_id:
            return
        
        # Check if any other service records reference this DocRec
        has_other_services = (
            MigrationRecord.objects.filter(doc_rec=doc_rec_id).exists() or
            ProvisionalRecord.objects.filter(doc_rec=doc_rec_id).exists() or
            InstLetterMain.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists()
        )
        
        # Only delete DocRec if no other services reference it
        if not has_other_services:
            DocRec.objects.filter(doc_rec_id=doc_rec_id).delete()
    except Exception:
        pass


@receiver(post_delete, sender=MigrationRecord)
def migration_post_delete(sender, instance: MigrationRecord, **kwargs):
    """When Migration is deleted, automatically delete linked DocRec if no other services reference it."""
    try:
        doc_rec_id = getattr(instance, 'doc_rec', None)
        if not doc_rec_id:
            return
        
        # Check if any other service records reference this DocRec
        has_other_services = (
            Verification.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists() or
            ProvisionalRecord.objects.filter(doc_rec=doc_rec_id).exists() or
            InstLetterMain.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists()
        )
        
        if not has_other_services:
            DocRec.objects.filter(doc_rec_id=doc_rec_id).delete()
    except Exception:
        pass


@receiver(post_delete, sender=ProvisionalRecord)
def provisional_post_delete(sender, instance: ProvisionalRecord, **kwargs):
    """When Provisional is deleted, automatically delete linked DocRec if no other services reference it."""
    try:
        doc_rec_id = getattr(instance, 'doc_rec', None)
        if not doc_rec_id:
            return
        
        has_other_services = (
            Verification.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists() or
            MigrationRecord.objects.filter(doc_rec=doc_rec_id).exists() or
            InstLetterMain.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists()
        )
        
        if not has_other_services:
            DocRec.objects.filter(doc_rec_id=doc_rec_id).delete()
    except Exception:
        pass


@receiver(post_delete, sender=InstLetterMain)
def inst_verification_post_delete(sender, instance: InstLetterMain, **kwargs):
    """When InstVerification is deleted, automatically delete linked DocRec if no other services reference it."""
    try:
        if not instance.doc_rec:
            return
        
        doc_rec_id = getattr(instance.doc_rec, 'doc_rec_id', None)
        if not doc_rec_id:
            return
        
        has_other_services = (
            Verification.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists() or
            MigrationRecord.objects.filter(doc_rec=doc_rec_id).exists() or
            ProvisionalRecord.objects.filter(doc_rec=doc_rec_id).exists()
        )
        
        if not has_other_services:
            DocRec.objects.filter(doc_rec_id=doc_rec_id).delete()
    except Exception:
        pass


# ============================================================================
# TRANSCRIPT REQUEST SYNC
# ============================================================================
# Note: Transcript request sync is handled directly in TranscriptRequestViewSet.update()
# method, matching the pattern used by GoogleFormSubmissionViewSet (official mail requests).
# This ensures sync only happens on explicit user updates via the API, not on bulk
# operations or sheet imports.


# ============================================================================
# FULL-TEXT SEARCH (FTS) - AUTO-UPDATE SEARCH VECTORS
# ============================================================================
# Automatically update search_vector fields AFTER records are saved
# This ensures GIN indexes stay up-to-date for fast search
# Using post_save instead of pre_save to avoid F() expression errors on INSERT

@receiver(post_save, sender=Enrollment)
def update_enrollment_search_vector(sender, instance, **kwargs):
    """Auto-update search vector for Enrollment (case-insensitive)"""
    try:
        # Use update() to avoid recursion and allow F() expressions
        # Use 'simple' config for case-insensitive search and better prefix matching
        from django.contrib.postgres.search import SearchVector
        Enrollment.objects.filter(pk=instance.pk).update(
            search_vector=SearchVector('enrollment_no', 'temp_enroll_no', 'student_name', config='simple')
        )
    except Exception:
        pass  # Fail silently if search_vector field doesn't exist yet


@receiver(post_save, sender=Verification)
def update_verification_search_vector_post(sender, instance, **kwargs):
    """Auto-update search vector for Verification"""
    try:
        Verification.objects.filter(pk=instance.pk).update(
            search_vector=SearchVector(
                'enrollment_no', 'second_enrollment_id', 'student_name', 
                'final_no', 'pay_rec_no'
            )
        )
    except Exception:
        pass


@receiver(post_save, sender=DocRec)
def update_docrec_search_vector_post(sender, instance, **kwargs):
    """Auto-update search vector for DocRec"""
    try:
        DocRec.objects.filter(pk=instance.pk).update(
            search_vector=SearchVector('doc_rec_id', 'pay_rec_no', 'pay_rec_no_pre')
        )
    except Exception:
        pass


@receiver(post_save, sender=StudentDegree)
def update_studentdegree_search_vector_post(sender, instance, **kwargs):
    """Auto-update search vector for StudentDegree"""
    try:
        StudentDegree.objects.filter(pk=instance.pk).update(
            search_vector=SearchVector(
                'enrollment_no', 'student_name_dg', 'dg_sr_no',
                'degree_name', 'institute_name_dg', 'specialisation',
                'class_obtain', 'dg_contact', 'course_language',
                'dg_address', 'dg_rec_no', 'seat_last_exam'
            )
        )
    except Exception:
        pass


@receiver(post_save, sender=TranscriptRequest)
def update_transcriptrequest_search_vector_post(sender, instance, **kwargs):
    """Auto-update search vector for TranscriptRequest"""
    try:
        TranscriptRequest.objects.filter(pk=instance.pk).update(
            search_vector=SearchVector(
                'enrollment_no', 'student_name', 'trn_reqest_ref_no'
            )
        )
    except Exception:
        pass


@receiver(post_save, sender=GoogleFormSubmission)
def update_googleform_search_vector_post(sender, instance, **kwargs):
    """Auto-update search vector for GoogleFormSubmission"""
    try:
        GoogleFormSubmission.objects.filter(pk=instance.pk).update(
            search_vector=SearchVector(
                'enrollment_no', 'student_name', 'rec_institute_name', 
                'rec_official_mail', 'rec_ref_id'
            )
        )
    except Exception:
        pass


@receiver(post_save, sender=InstLetterMain)
def update_instverif_search_vector_post(sender, instance, **kwargs):
    """Auto-update search vector for InstLetterMain"""
    try:
        InstLetterMain.objects.filter(pk=instance.pk).update(
            search_vector=SearchVector(
                'inst_veri_number', 'rec_inst_name', 'inst_ref_no'
            )
        )
    except Exception:
        pass
