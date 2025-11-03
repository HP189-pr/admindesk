from django.db import transaction
from django.http import JsonResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
import json

from .models import DocRec, Verification, MigrationRecord, ProvisionalRecord, InstVerificationMain, InstVerificationStudent


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
                        # Create or update InstVerificationMain (one-per-doc_rec)
                        main = InstVerificationMain.objects.filter(doc_rec=docrec).first()
                        main_fields = dict(
                            inst_veri_number = r.get('inst_veri_number') or None,
                            inst_veri_date = r.get('inst_veri_date') or None,
                            rec_inst_name = r.get('rec_inst_name') or None,
                            rec_inst_address_1 = r.get('rec_inst_address_1') or None,
                            rec_inst_address_2 = r.get('rec_inst_address_2') or None,
                            rec_inst_location = r.get('rec_inst_location') or None,
                            rec_inst_city = r.get('rec_inst_city') or None,
                            rec_inst_pin = r.get('rec_inst_pin') or None,
                            rec_inst_email = r.get('rec_inst_email') or None,
                            doc_types = r.get('doc_types') or None,
                            rec_by = r.get('rec_by') or None,
                            doc_rec_date = r.get('doc_rec_date') or None,
                            inst_ref_no = r.get('inst_ref_no') or None,
                            ref_date = r.get('ref_date') or None,
                            institute_id = r.get('institute_id') or None,
                        )
                        if not main:
                            main = InstVerificationMain.objects.create(doc_rec=docrec, **main_fields)
                            created = main
                        else:
                            # update provided fields on existing main
                            updated = False
                            for k, v in main_fields.items():
                                if v is not None and getattr(main, k, None) != v:
                                    setattr(main, k, v)
                                    updated = True
                            if updated:
                                main.save()
                            created = main

                        # Support nested students array in the uploaded row: create InstVerificationStudent rows
                        students = r.get('students') or r.get('student_rows') or []
                        student_created = False
                        if isinstance(students, list) and len(students) > 0:
                            for s in students:
                                try:
                                    # Avoid simple duplicates: check by doc_rec + enrollment or doc_rec + sr_no
                                    exists = None
                                    if s.get('enrollment'):
                                        exists = InstVerificationStudent.objects.filter(doc_rec=docrec, enrollment=s.get('enrollment')).first()
                                    if not exists and s.get('sr_no') is not None:
                                        exists = InstVerificationStudent.objects.filter(doc_rec=docrec, sr_no=s.get('sr_no')).first()
                                    if exists:
                                        # update some fields if provided
                                        changed = False
                                        for fld in ('student_name','type_of_credential','month_year','verification_status','institute_id','main_course_id','sub_course_id'):
                                            if s.get(fld.replace('_id','')) is not None:
                                                val = s.get(fld.replace('_id',''))
                                                if getattr(exists, fld.replace('_id',''), None) != val:
                                                    setattr(exists, fld.replace('_id',''), val)
                                                    changed = True
                                        if changed:
                                            exists.save()
                                    else:
                                        InstVerificationStudent.objects.create(
                                            doc_rec=docrec,
                                            sr_no = s.get('sr_no') or None,
                                            student_name = s.get('student_name') or None,
                                            type_of_credential = s.get('type_of_credential') or None,
                                            month_year = s.get('month_year') or None,
                                            verification_status = s.get('verification_status') or None,
                                            enrollment = s.get('enrollment') or None,
                                            institute_id = s.get('institute_id') or None,
                                            main_course_id = s.get('main_course') or None,
                                            sub_course_id = s.get('sub_course') or None,
                                        )
                                        student_created = True
                                except Exception:
                                    # continue on student-level errors
                                    pass

                        # If no nested students provided but student-level fields exist on the row, create one student record
                        else:
                            if r.get('student_name') or r.get('enrollment'):
                                try:
                                    InstVerificationStudent.objects.create(
                                        doc_rec=docrec,
                                        sr_no = r.get('sr_no') or None,
                                        student_name = r.get('student_name') or None,
                                        type_of_credential = r.get('type_of_credential') or None,
                                        month_year = r.get('month_year') or None,
                                        verification_status = r.get('verification_status') or None,
                                        enrollment = r.get('enrollment') or None,
                                        institute_id = r.get('institute_id') or None,
                                        main_course_id = r.get('main_course') or None,
                                        sub_course_id = r.get('sub_course') or None,
                                    )
                                    student_created = True
                                except Exception:
                                    pass

                        created = bool(created) or student_created

                    results.append({'row': i, 'status': 'ok', 'doc_rec_id': docrec.doc_rec_id, 'service_created': bool(created)})
            except Exception as e:
                results.append({'row': i, 'status': 'error', 'error': str(e)})

        return JsonResponse({'results': results})
