from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone
from django.conf import settings
from .models import DocRec, Verification, MigrationRecord, ProvisionalRecord, InstVerificationMain
from .models import PayBy, VerificationStatus


@receiver(post_save, sender=DocRec)
def docrec_post_save(sender, instance: DocRec, created, **kwargs):
    """When a DocRec is created or updated, ensure a matching service row exists.
    We create placeholder rows for services that support nullable fields (Verification, InstVerificationMain).
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
                exists = InstVerificationMain.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists()
                if not exists:
                    iv = InstVerificationMain(doc_rec=instance)
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


@receiver(post_save, sender=InstVerificationMain)
def inst_veri_main_post_save(sender, instance: InstVerificationMain, created, **kwargs):
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
        InstVerificationMain.objects.filter(doc_rec__doc_rec_id=doc_rec_id).delete()
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
            InstVerificationMain.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists()
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
            InstVerificationMain.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists()
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
            InstVerificationMain.objects.filter(doc_rec__doc_rec_id=doc_rec_id).exists()
        )
        
        if not has_other_services:
            DocRec.objects.filter(doc_rec_id=doc_rec_id).delete()
    except Exception:
        pass


@receiver(post_delete, sender=InstVerificationMain)
def inst_verification_post_delete(sender, instance: InstVerificationMain, **kwargs):
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
