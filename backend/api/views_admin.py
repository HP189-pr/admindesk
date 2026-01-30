from django.db import transaction
from django.http import JsonResponse
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
import json

from .models import DocRec, Verification, MigrationRecord, ProvisionalRecord, InstVerificationMain, InstVerificationStudent, Enrollment, Institute, MainBranch, SubBranch


@method_decorator(csrf_exempt, name='dispatch')
class UploadDocRecView(View):
    """
    Accepts JSON array POST of rows to create/sync DocRec and optional related service records.
    Expected JSON: { rows: [ { doc_rec_date, apply_for, pay_by, pay_rec_no_pre, pay_rec_no, pay_amount, doc_remark, service_type, service_fields... }, ... ] }
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
                    remark = r.get('doc_remark') or None

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
                            doc_remark=remark,
                        )
                    else:
                        # update mutable fields
                        docrec.pay_by = pay_by
                        docrec.pay_rec_no_pre = pay_rec_no_pre
                        docrec.pay_rec_no = pay_rec_no
                        docrec.pay_amount = pay_amount or 0
                        if remark is not None:
                            docrec.doc_remark = remark
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
                            rec_inst_sfx_name = r.get('rec_inst_sfx_name') or None,
                            study_mode = r.get('study_mode') or None,
                            iv_status = r.get('iv_status') or None,
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
                                    enr_obj = None
                                    enr_text = None
                                    if s.get('enrollment'):
                                        try:
                                            enr_obj = Enrollment.objects.filter(enrollment_no=str(s.get('enrollment')).strip()).first()
                                        except Exception:
                                            enr_obj = None
                                        if not enr_obj:
                                            enr_text = str(s.get('enrollment')).strip()
                                        else:
                                            exists = InstVerificationStudent.objects.filter(doc_rec=docrec, enrollment=enr_obj).first()
                                    else:
                                        exists = None
                                    if not exists and s.get('sr_no') is not None:
                                        exists = InstVerificationStudent.objects.filter(doc_rec=docrec, sr_no=s.get('sr_no')).first()
                                    if exists:
                                        # update some fields if provided
                                        changed = False
                                        for fld in ('student_name','type_of_credential','month_year','verification_status'):
                                            if s.get(fld) is not None:
                                                val = s.get(fld)
                                                if getattr(exists, fld, None) != val:
                                                    setattr(exists, fld, val)
                                                    changed = True
                                        # sync enrollment and related institute/main/subcourse when enrollment provided
                                        try:
                                            if enr_obj:
                                                if getattr(exists, 'enrollment', None) != enr_obj:
                                                    exists.enrollment = enr_obj
                                                    changed = True
                                                try:
                                                    if getattr(enr_obj, 'institute', None) and getattr(exists, 'institute', None) != enr_obj.institute:
                                                        exists.institute = enr_obj.institute
                                                        changed = True
                                                except Exception:
                                                    pass
                                                try:
                                                    if getattr(enr_obj, 'maincourse', None) and getattr(exists, 'main_course', None) != enr_obj.maincourse:
                                                        exists.main_course = enr_obj.maincourse
                                                        changed = True
                                                except Exception:
                                                    pass
                                                try:
                                                    if getattr(enr_obj, 'subcourse', None) and getattr(exists, 'sub_course', None) != enr_obj.subcourse:
                                                        exists.sub_course = enr_obj.subcourse
                                                        changed = True
                                                except Exception:
                                                    pass
                                                if getattr(exists, 'enrollment_no_text', None):
                                                    exists.enrollment_no_text = None
                                                    changed = True
                                        except Exception:
                                            pass
                                        if changed:
                                            exists.save()
                                    else:
                                        # Prepare institute/main/subcourse from enrollment if available
                                        inst_obj = None
                                        main_obj = None
                                        sub_obj = None
                                        if enr_obj:
                                            inst_obj = getattr(enr_obj, 'institute', None)
                                            main_obj = getattr(enr_obj, 'maincourse', None)
                                            sub_obj = getattr(enr_obj, 'subcourse', None)
                                        else:
                                            if s.get('institute_id'):
                                                try:
                                                    inst_obj = Institute.objects.filter(pk=s.get('institute_id')).first()
                                                except Exception:
                                                    inst_obj = None
                                            if s.get('main_course'):
                                                try:
                                                    main_obj = MainBranch.objects.filter(pk=s.get('main_course')).first()
                                                except Exception:
                                                    main_obj = None
                                            if s.get('sub_course'):
                                                try:
                                                    sub_obj = SubBranch.objects.filter(pk=s.get('sub_course')).first()
                                                except Exception:
                                                    sub_obj = None
                                        InstVerificationStudent.objects.create(
                                            doc_rec=docrec,
                                            sr_no = s.get('sr_no') or None,
                                            student_name = s.get('student_name') or None,
                                            type_of_credential = s.get('type_of_credential') or None,
                                            month_year = s.get('month_year') or None,
                                            verification_status = s.get('verification_status') or None,
                                            enrollment = enr_obj if enr_obj else None,
                                            enrollment_no_text = enr_text,
                                            institute = inst_obj,
                                            main_course = main_obj,
                                            sub_course = sub_obj,
                                        )
                                        student_created = True
                                except Exception:
                                    # continue on student-level errors
                                    pass

                        # If no nested students provided but student-level fields exist on the row, create one student record
                        else:
                            if r.get('student_name') or r.get('enrollment'):
                                try:
                                    # Try to resolve enrollment and copy related institute/main/subcourse
                                    enr_obj = None
                                    enr_text = None
                                    if r.get('enrollment'):
                                        try:
                                            enr_obj = Enrollment.objects.filter(enrollment_no=str(r.get('enrollment')).strip()).first()
                                        except Exception:
                                            enr_obj = None
                                        if not enr_obj:
                                            enr_text = str(r.get('enrollment')).strip()
                                    inst_obj = None
                                    main_obj = None
                                    sub_obj = None
                                    if enr_obj:
                                        inst_obj = getattr(enr_obj, 'institute', None)
                                        main_obj = getattr(enr_obj, 'maincourse', None)
                                        sub_obj = getattr(enr_obj, 'subcourse', None)
                                    else:
                                        if r.get('institute_id'):
                                            try:
                                                inst_obj = Institute.objects.filter(pk=r.get('institute_id')).first()
                                            except Exception:
                                                inst_obj = None
                                        if r.get('main_course'):
                                            try:
                                                main_obj = MainBranch.objects.filter(pk=r.get('main_course')).first()
                                            except Exception:
                                                main_obj = None
                                        if r.get('sub_course'):
                                            try:
                                                sub_obj = SubBranch.objects.filter(pk=r.get('sub_course')).first()
                                            except Exception:
                                                sub_obj = None
                                    InstVerificationStudent.objects.create(
                                        doc_rec=docrec,
                                        sr_no = r.get('sr_no') or None,
                                        student_name = r.get('student_name') or None,
                                        type_of_credential = r.get('type_of_credential') or None,
                                        month_year = r.get('month_year') or None,
                                        verification_status = r.get('verification_status') or None,
                                        enrollment = enr_obj if enr_obj else None,
                                        enrollment_no_text = enr_text,
                                        institute = inst_obj,
                                        main_course = main_obj,
                                        sub_course = sub_obj,
                                    )
                                    student_created = True
                                except Exception:
                                    pass

                        created = bool(created) or student_created

                    results.append({'row': i, 'status': 'ok', 'doc_rec_id': docrec.doc_rec_id, 'service_created': bool(created)})
            except Exception as e:
                results.append({'row': i, 'status': 'error', 'error': str(e)})

        return JsonResponse({'results': results})
