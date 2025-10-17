from django.db import transaction
from django.http import JsonResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
import json

from .models import DocRec, Verification, MigrationRecord, ProvisionalRecord, InstVerificationMain


@method_decorator(csrf_exempt, name='dispatch')
class UploadDocRecView(View):
    """
    Accepts JSON array POST of rows to create/sync DocRec and optional related service records.
    Expected JSON: { rows: [ { doc_rec_date, apply_for, pay_by, pay_rec_no_pre, pay_rec_no, pay_amount, doc_rec_remark, service_type, service_fields... }, ... ] }
    service_type may be one of: docrec, verification, provisional, migration, inst_verification
    """
    def post(self, request):
        try:
            payload = json.loads(request.body.decode('utf-8') or '{}')
        except Exception as e:
            return JsonResponse({'error': 'invalid json', 'detail': str(e)}, status=400)

        rows = payload.get('rows') or []
        if not isinstance(rows, list):
            return JsonResponse({'error': 'rows must be a list'}, status=400)

        results = []
        for i, r in enumerate(rows):
            try:
                with transaction.atomic():
                    # normalize fields
                    doc_date = r.get('doc_rec_date')
                    apply_for = r.get('apply_for')
                    pay_by = r.get('pay_by') or None
                    pay_rec_no_pre = r.get('pay_rec_no_pre') or None
                    pay_rec_no = r.get('pay_rec_no') or None
                    pay_amount = r.get('pay_amount')
                    remark = r.get('doc_rec_remark') or None

                    # find existing docrec by doc_rec_id if provided, else create
                    doc_rec_id_key = r.get('doc_rec_id')
                    docrec = None
                    if doc_rec_id_key:
                        docrec = DocRec.objects.filter(doc_rec_id=doc_rec_id_key).first()

                    if not docrec:
                        docrec = DocRec.objects.create(
                            doc_rec_date=doc_date,
                            apply_for=apply_for,
                            pay_by=pay_by,
                            pay_rec_no_pre=pay_rec_no_pre,
                            pay_rec_no=pay_rec_no,
                            pay_amount=pay_amount or 0,
                            doc_rec_remark=remark,
                        )
                    else:
                        # update mutable fields
                        docrec.pay_by = pay_by
                        docrec.pay_rec_no_pre = pay_rec_no_pre
                        docrec.pay_rec_no = pay_rec_no
                        docrec.pay_amount = pay_amount or 0
                        if remark is not None:
                            docrec.doc_rec_remark = remark
                        docrec.save()

                    # Optionally create service record
                    st = (r.get('service_type') or '').lower()
                    created = None
                    if st == 'verification':
                        created = Verification.objects.create(
                            doc_rec=docrec,
                            enrollment=r.get('enrollment') or None,
                            student_name=r.get('student_name') or '',
                            pay_rec_no=docrec.pay_rec_no or None,
                            status='IN_PROGRESS'
                        )
                    elif st == 'provisional':
                        created = ProvisionalRecord.objects.create(
                            doc_rec=docrec,
                            enrollment=r.get('enrollment') or None,
                            student_name=r.get('student_name') or '',
                            prv_number=r.get('prv_number') or None,
                        )
                    elif st == 'migration':
                        created = MigrationRecord.objects.create(
                            doc_rec=docrec,
                            enrollment=r.get('enrollment') or None,
                            student_name=r.get('student_name') or '',
                            mg_number=r.get('mg_number') or None,
                        )
                    elif st == 'inst_verification' or st == 'inst-verification':
                        created = InstVerificationMain.objects.create(
                            doc_rec=docrec,
                            rec_by=r.get('rec_by') or None,
                            rec_inst_name=r.get('rec_inst_name') or None,
                        )

                    results.append({'row': i, 'status': 'ok', 'doc_rec_id': docrec.doc_rec_id, 'service_created': bool(created)})
            except Exception as e:
                results.append({'row': i, 'status': 'error', 'error': str(e)})

        return JsonResponse({'results': results})
