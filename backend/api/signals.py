from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import DocRec, Verification, VerificationStatus


@receiver(post_save, sender=DocRec)
def create_service_for_docrec(sender, instance: DocRec, created, **kwargs):
    """Ensure a service row exists for new/updated DocRec entries.

    Auto-create a Verification when a DocRec with apply_for='VR' is saved
    and no Verification is already linked. This mirrors the behaviour of
    the `sync_docrec_services` management command but runs eagerly on save
    so admin/ORM-created DocRec rows become visible in the UI automatically.
    """
    try:
        apply_for = (getattr(instance, 'apply_for', '') or '').upper()
        if apply_for != 'VR':
            return

        # If a Verification already links to this DocRec, nothing to do
        exists = Verification.objects.filter(doc_rec__doc_rec_id=instance.doc_rec_id).exists()
        if exists:
            return

        # Create a minimal Verification row (best-effort)
        vr = Verification(
            enrollment=None,
            student_name='')
        vr.doc_rec = instance
        vr.status = VerificationStatus.IN_PROGRESS
        try:
            vr.full_clean()
        except Exception:
            # allow creation even if some validation rules are not met
            pass
        vr.save()
    except Exception:
        # never raise from a signal handler; keep it best-effort
        pass
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from django.conf import settings
from .models import DocRec, Verification, MigrationRecord, ProvisionalRecord, InstVerificationMain
from .models import PayBy


from django.db.models.signals import post_save


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
                        enrollment=None,
                        student_name='')
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
