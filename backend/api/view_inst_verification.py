from django.conf import settings
from django.template.loader import render_to_string
from django.http import HttpResponse, JsonResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
import json
try:
    import pdfkit
except Exception:
    # pdfkit may not be installed in all environments (we still want debug mode to work)
    pdfkit = None

import re, logging

from .models import InstVerificationMain, InstVerificationStudent
from collections import OrderedDict
from .serializers import InstVerificationMainSerializer, InstVerificationStudentSerializer


class GenerateInstVerificationPDF(APIView):
    """Generate PDF for one or more inst verification records.

    Accepts POST JSON body: { "doc_recs": ["iv25000001", ...] } or { "doc_rec": "iv25000001" }
    Returns: application/pdf attachment with deterministic filename.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            payload = request.data if hasattr(request, 'data') else json.loads(request.body.decode('utf-8') or '{}')
        except Exception:
            payload = {}

        # DEBUG: log incoming payload and user to help diagnose missing header data during PDF generation
        try:
            if getattr(settings, 'DEBUG', False):
                logging.getLogger('api').info('GenerateInstVerificationPDF called by=%s payload=%s', getattr(request, 'user', None), payload)
        except Exception:
            pass

        # Allow callers to provide doc_recs (doc_rec IDs) OR iv_record_no / iv_record_nos
        doc_recs = payload.get('doc_recs') or payload.get('doc_rec') or []
        # Support shorthand numeric iv_record_no(s) in payload so caller can pass only the numeric id
        iv_nos = payload.get('iv_record_nos') or payload.get('iv_record_no') or payload.get('iv_no') or None
        if iv_nos:
            # normalize to list
            if not isinstance(iv_nos, list):
                iv_nos = [iv_nos]
            # append numeric iv_record_no values to doc_recs so existing resolution logic handles them
            extra = []
            for v in iv_nos:
                try:
                    extra.append(str(int(v)).strip())
                except Exception:
                    # ignore non-numeric values
                    pass
            if extra:
                if not isinstance(doc_recs, list):
                    doc_recs = [doc_recs]
                doc_recs = extra + list(doc_recs)
        if not isinstance(doc_recs, list):
            if doc_recs:
                doc_recs = [doc_recs]
            else:
                doc_recs = []

        pages = []
        debug_mode = (request.query_params.get('debug') == '1') or bool(payload.get('debug'))
        debug_results = []

        # Helper utilities for sanitizing template-bound data
        def _fmt_date(value):
            try:
                if not value:
                    return ''
                if isinstance(value, str):
                    return value
                return value.strftime('%d-%m-%Y')
            except Exception:
                return str(value) if value is not None else ''

        def _sanitize_template_field(val):
            try:
                if val is None:
                    return ''
                if isinstance(val, (list, tuple, set)):
                    cleaned = []
                    for item in val:
                        item_clean = _sanitize_template_field(item)
                        if item_clean:
                            cleaned.append(item_clean)
                    if not cleaned:
                        return ''
                    # preserve original order while deduping
                    return ', '.join(dict.fromkeys(cleaned))
                s = str(val).strip()
                if not s:
                    return ''
                if re.fullmatch(r"^\[\s*\]$", s):
                    return ''
                inner = re.sub(r'^\[\s*|\s*\]$', '', s).strip()
                inner = re.sub(r'^\[\s*|\s*\]$', '', inner).strip()
                if not inner:
                    return ''
                if re.fullmatch(r'\d+\.\d+', inner):
                    inner = inner.rstrip('0').rstrip('.')
                if re.fullmatch(r'\d+', inner) and len(inner) <= 2:
                    return ''
                if inner.lower() in ('nan', 'none', 'null', 'n/a'):
                    return ''
                if re.fullmatch(r'\[?\s*\]?$', s):
                    return ''
                return inner
            except Exception:
                return ''

        def _sanitize_student_row(row):
            if isinstance(row, OrderedDict):
                row = dict(row)
            if not isinstance(row, dict):
                return row
            for sk in (
                'student_name',
                'enrollment',
                'enrollment_no',
                'enrollment_no_text',
                'iv_degree_name',
                'type_of_credential',
                'verification_status',
                'month_year',
                'sr_no',
            ):
                row[sk] = _sanitize_template_field(row.get(sk))
            return row

        def _prepare_main(main_ser, main_obj):
            if isinstance(main_ser, OrderedDict):
                main_ser = dict(main_ser)
            if not isinstance(main_ser, dict):
                return main_ser

            for date_field in ('inst_veri_date', 'ref_date', 'doc_rec_date'):
                if date_field in main_ser:
                    main_ser[date_field] = _fmt_date(main_ser.get(date_field))
                else:
                    try:
                        main_ser[date_field] = _fmt_date(getattr(main_obj, date_field))
                    except Exception:
                        main_ser[date_field] = ''

            for key in (
                'rec_inst_sfx_name',
                'rec_inst_name',
                'rec_inst_address_1',
                'rec_inst_address_2',
                'rec_inst_location',
                'rec_inst_city',
                'rec_inst_pin',
                'rec_inst_email',
                'doc_types',
                'inst_ref_no',
                'rec_by',
            ):
                if main_ser.get(key) is None:
                    try:
                        main_ser[key] = getattr(main_obj, key) or ''
                    except Exception:
                        main_ser[key] = ''

            try:
                inst_obj = getattr(main_obj, 'institute', None)
                if inst_obj:
                    rec_name = main_ser.get('rec_inst_name') or ''
                    if (
                        rec_name == ''
                        or str(rec_name).strip().isdigit()
                        or str(getattr(inst_obj, 'institute_id', '')) == str(rec_name).strip()
                    ):
                        main_ser['rec_inst_name'] = getattr(inst_obj, 'institute_name', '') or main_ser.get('rec_inst_name', '')
                    if not main_ser.get('rec_inst_address_1'):
                        main_ser['rec_inst_address_1'] = (getattr(inst_obj, 'institute_address', '') or '').split('\n')[0]
                    if not main_ser.get('rec_inst_city'):
                        main_ser['rec_inst_city'] = getattr(inst_obj, 'institute_city', '') or ''
                    if not main_ser.get('rec_inst_sfx_name'):
                        main_ser['rec_inst_sfx_name'] = getattr(inst_obj, 'institute_campus', '') or ''
            except Exception:
                pass

            for field in (
                'rec_inst_sfx_name',
                'rec_inst_name',
                'rec_inst_address_1',
                'rec_inst_address_2',
                'rec_inst_location',
                'rec_inst_city',
                'rec_inst_pin',
                'rec_inst_email',
                'doc_types',
                'inst_ref_no',
                'rec_by',
                'inst_veri_number',
                'inst_veri_date',
                'ref_date',
                'doc_rec_date',
            ):
                main_ser[field] = _sanitize_template_field(main_ser.get(field))

            try:
                rname = main_ser.get('rec_inst_name', '')
                if isinstance(rname, str) and rname.strip().isdigit():
                    main_ser['rec_inst_name'] = ''
            except Exception:
                pass

            return main_ser

        # Resolve each requested doc_rec to a main_obj (keep attempts log) and group by iv_record_no
        groups = OrderedDict()
        resolved_docs = []
        for dr in doc_recs:
            # Normalize input
            dr = str(dr).strip()
            attempts = [dr]

            # If the caller supplied a plain numeric iv_record_no (e.g. 25001), treat
            # it as a request to fetch all InstVerificationMain rows having that
            # iv_record_no and process each. This lets frontend send a single value
            # like 25001 instead of separate year/number.
            if re.fullmatch(r"\d+", dr):
                try:
                    iv_int = int(dr)
                    mains_qs = InstVerificationMain.objects.filter(iv_record_no=iv_int)
                    if mains_qs.exists():
                        # Process each matched main as if the user had requested its doc_rec
                        for main_obj in mains_qs:
                            actual_doc_rec = getattr(getattr(main_obj, 'doc_rec', None), 'doc_rec_id', None) or ''
                            # serialize and format similar to the non-numeric branch below
                            main_ser = InstVerificationMainSerializer(main_obj).data
                            main_ser = _prepare_main(main_ser, main_obj)

                            # Match students by the exact DocRec FK from the main_obj so
                            # we only pick InstVerificationStudent rows that belong to
                            # this InstVerificationMain's DocRec. Avoid string-based
                            # matching to prevent incorrect/over-broad results.
                            students_qs = InstVerificationStudent.objects.filter(doc_rec=getattr(main_obj, 'doc_rec', None)).order_by('id')
                            students_ser = InstVerificationStudentSerializer(students_qs, many=True).data
                            students_ser = [_sanitize_student_row(s) for s in students_ser]
                            debug_results.append({
                                'requested': dr,
                                'doc_rec': actual_doc_rec,
                                'found': True,
                                'actual_doc_rec': actual_doc_rec,
                                'main': main_ser,
                                'students': students_ser,
                                'students_count': len(students_ser),
                            })

                            # Determine a canonical group key for this main. Prefer the
                            # numeric iv_record_no present on the serialized main or
                            # compute it from inst_veri_number. Fall back to the
                            # actual doc_rec to avoid grouping mismatches (for example
                            # when the input 'dr' is a variant that maps to a different
                            # stored iv number).
                            try:
                                iv_no = main_ser.get('iv_record_no') if isinstance(main_ser.get('iv_record_no', None), (int, str)) else None
                            except Exception:
                                iv_no = None
                            if not iv_no:
                                try:
                                    iv_no = InstVerificationMain.compute_iv_record_no_from_inst_veri(main_ser.get('inst_veri_number') or '')
                                except Exception:
                                    iv_no = None
                            group_key = str(iv_no) if iv_no is not None else (main_ser.get('inst_veri_number') or actual_doc_rec or dr)
                            if group_key not in groups:
                                groups[group_key] = {'mains': [], 'students': [], 'doc_recs': []}
                            groups[group_key]['mains'].append(main_ser)
                            groups[group_key]['doc_recs'].append(actual_doc_rec)
                            for s in students_ser:
                                if isinstance(s, dict):
                                    s_copy = dict(s)
                                    s_copy['_source_doc_rec'] = actual_doc_rec
                                    groups[group_key]['students'].append(s_copy)
                                else:
                                    groups[group_key]['students'].append({'data': s, '_source_doc_rec': actual_doc_rec})
                        # we've processed this numeric input; continue to next requested input
                        continue
                except Exception:
                    # fall through to the heuristic matching below if numeric handling fails
                    pass

            # Try to fetch main by doc_rec (doc_rec is stored on related DocRec model)
            main_qs = InstVerificationMain.objects.filter(doc_rec__doc_rec_id=dr)
            main_obj = main_qs.first()
            # If not found, try common variant formats (2-digit year, unpadded sequence, contains sequence)
            if not main_obj:
                # Try inputs like 'iv_2025_001' first
                m = re.match(r'^iv[_-]?(\d{4})[_-]?(\d+)$', dr, re.IGNORECASE)
                if m:
                    year4, seq = m.group(1), m.group(2)
                    year2 = year4[-2:]
                    # candidate: iv_YY_SEQ with same padding
                    cand1 = f'iv_{year2}_{seq}'
                    attempts.append(cand1)
                    main_obj = InstVerificationMain.objects.filter(doc_rec__doc_rec_id=cand1).first()
                    # candidate: iv_YYYY_unpadded
                    if not main_obj:
                        cand2 = f'iv_{year4}_{str(int(seq))}'
                        attempts.append(cand2)
                        main_obj = InstVerificationMain.objects.filter(doc_rec__doc_rec_id=cand2).first()
                    # candidate: endswith _SEQ (search any year)
                    if not main_obj:
                        cand3_qs = InstVerificationMain.objects.filter(doc_rec__doc_rec_id__iendswith=f'_{seq}')
                        if cand3_qs.exists():
                            main_obj = cand3_qs.first()
                            attempts.append(f'<any>_ {seq} (picked {main_obj.doc_rec.doc_rec_id if getattr(main_obj, "doc_rec", None) else "?"})')
                else:
                    # Try inputs like '2025 001', '25-001', '2025001' (year and sequence without iv_)
                    m2 = re.match(r'^(?:iv[_-]?)?(\d{2,4})[\s_-]?(0*)(\d+)$', dr, re.IGNORECASE)
                    if m2:
                        year_part = m2.group(1)
                        seq_zero_pad = (m2.group(2) or '') + m2.group(3)
                        seq = m2.group(3)
                        year4 = year_part if len(year_part) == 4 else (f'20{year_part}' if len(year_part) == 2 else year_part)
                        year2 = year4[-2:]
                        # Build candidates trying common paddings
                        cand_list = [f'iv_{year2}_{seq_zero_pad}', f'iv_{year4}_{seq_zero_pad}', f'iv_{year2}_{seq}', f'iv_{year4}_{str(int(seq))}']
                        for c in cand_list:
                            attempts.append(c)
                            main_obj = InstVerificationMain.objects.filter(doc_rec__doc_rec_id=c).first()
                            if main_obj:
                                break
                        # fallback: any doc_rec that endswith the sequence
                        if not main_obj:
                            try:
                                qs_end = InstVerificationMain.objects.filter(doc_rec__doc_rec_id__iendswith=f'_{str(int(seq))}')
                                if qs_end.exists():
                                    main_obj = qs_end.first()
                                    attempts.append(f'<any>_ {seq} (picked {main_obj.doc_rec.doc_rec_id if getattr(main_obj, "doc_rec", None) else "?"})')
                            except Exception:
                                pass
                    else:
                        # general contains search
                        try:
                            cand_qs = InstVerificationMain.objects.filter(doc_rec__doc_rec_id__icontains=dr)
                            if cand_qs.exists():
                                main_obj = cand_qs.first()
                                attempts.append(f'icontains:{dr} -> {main_obj.doc_rec.doc_rec_id if getattr(main_obj, "doc_rec", None) else "?"}')
                        except Exception:
                            pass
            if not main_obj:
                logging.getLogger('api').info('GenerateInstVerificationPDF: doc_rec not found, attempts=%s', attempts)
                # keep debug result for not-found but continue so grouping can still occur for others
                debug_results.append({'requested': dr, 'doc_rec': None, 'found': False, 'attempts': attempts, 'students': []})
                continue

            # We have a main_obj; serialize and fetch students
            main_ser = InstVerificationMainSerializer(main_obj).data
            main_ser = _prepare_main(main_ser, main_obj)
            # Use the actual doc_rec id from the found main_obj (safer if variant matched)
            actual_doc_rec = getattr(getattr(main_obj, 'doc_rec', None), 'doc_rec_id', None) or dr
            # Use the DocRec FK on the main_obj to fetch matching students. This
            # ensures the student rows are exactly those attached to the same
            # DocRec as the InstVerificationMain we found.
            students_qs = InstVerificationStudent.objects.filter(doc_rec=getattr(main_obj, 'doc_rec', None)).order_by('id')
            students_ser = InstVerificationStudentSerializer(students_qs, many=True).data
            students_ser = [_sanitize_student_row(s) for s in students_ser]
            # capture debug info
            debug_results.append({
                'requested': dr,
                'doc_rec': actual_doc_rec,
                'found': True,
                'actual_doc_rec': actual_doc_rec,
                'main': main_ser,
                'students': students_ser,
                'students_count': len(students_ser),
            })

            # Group by iv_record_no (prefer numeric iv_record_no), fallback to inst_veri_number or actual_doc_rec
            try:
                iv_no = main_ser.get('iv_record_no') if isinstance(main_ser.get('iv_record_no', None), (int, str)) else None
            except Exception:
                iv_no = None
            if not iv_no:
                # try model helper fallback
                try:
                    iv_no = InstVerificationMain.compute_iv_record_no_from_inst_veri(main_ser.get('inst_veri_number') or '')
                except Exception:
                    iv_no = None
            group_key = str(iv_no) if iv_no is not None else (main_ser.get('inst_veri_number') or actual_doc_rec or dr)

            if group_key not in groups:
                groups[group_key] = {'mains': [], 'students': [], 'doc_recs': []}
            groups[group_key]['mains'].append(main_ser)
            groups[group_key]['doc_recs'].append(actual_doc_rec)
            # attach source doc_rec on each student so we can trace origin; also avoid duplicates later
            for s in students_ser:
                if isinstance(s, dict):
                    s_copy = dict(s)
                    s_copy['_source_doc_rec'] = actual_doc_rec
                    groups[group_key]['students'].append(s_copy)
                else:
                    groups[group_key]['students'].append({'data': s, '_source_doc_rec': actual_doc_rec})

        # If debug mode requested, return JSON snapshot instead of generating PDF
        if debug_mode:
            return JsonResponse({'debug': True, 'results': debug_results}, status=200)

        # Render grouped pages: one page per iv_record_no (merge students)
        for gk, gval in groups.items():
            # pick representative main for header
            rep_main = None
            for m in gval['mains']:
                if m and isinstance(m, dict):
                    rep_main = m
                    break
            if not rep_main:
                rep_main = {'inst_veri_number': gk, 'rec_inst_name': '', 'doc_types': '', 'inst_ref_no': '', 'rec_by': '', 'inst_veri_date': ''}

            # merge students with simple dedupe by id or enrollment
            merged = []
            seen = set()
            for s in gval['students']:
                sid = None
                if isinstance(s, dict):
                    sid = s.get('id') or s.get('enrollment') or s.get('enrollment_no') or s.get('enrollment_no_text')
                # fallback to source+json
                if not sid:
                    sid = json.dumps(s, sort_keys=True)
                if sid in seen:
                    continue
                seen.add(sid)
                # remove internal marker before rendering
                if isinstance(s, dict) and '_source_doc_rec' in s:
                    s.pop('_source_doc_rec', None)
                merged.append(s)

            try:
                credential_header = ''
                for candidate in merged:
                    if isinstance(candidate, dict):
                        credential_header = _sanitize_template_field(candidate.get('type_of_credential'))
                        if credential_header:
                            break
                if not credential_header and isinstance(rep_main, dict):
                    credential_header = _sanitize_template_field(rep_main.get('type_of_credential'))
            except Exception:
                credential_header = ''

            page_html = render_to_string('pdf_templates/inst_verification_record.html', {
                'main': rep_main,
                'students': merged,
                'group_doc_recs': gval.get('doc_recs', []),
                'iv_record_no': gk,
                'credential_header': credential_header or 'Type of Credential',
            })
            try:
                if getattr(settings, 'DEBUG', False):
                    dbg = json.dumps({'group_key': gk, 'main_keys': list(rep_main.keys()), 'students_count': len(merged)})
                    if len(dbg) > 4000:
                        dbg = dbg[:4000] + '...'
                    page_html = f"<!-- GROUP_DEBUG:{dbg} -->\n" + page_html
            except Exception:
                pass
            pages.append(page_html)

        # Wrap pages into single HTML
        full_html = render_to_string('pdf_templates/batch_wrapper.html', {'pages': pages})

        options = {
            'page-size': 'A4',
            'encoding': 'UTF-8',
            'margin-top': '5cm',
            'margin-bottom': '6mm',
            'margin-left': '10mm',
            'margin-right': '6mm',
            'footer-center': 'Email: verification@ksv.ac.in    Contact No.: 9408801690 / 079-23244690',
            'footer-font-size': '10',
            'footer-spacing': '2',
            'enable-local-file-access': None,
        }

        config = None
        wkpath = getattr(settings, 'WKHTMLTOPDF_CMD', None)
        if pdfkit is None:
            return JsonResponse({
                'detail': 'PDF generation unavailable',
                'error': 'pdfkit library not installed',
                'html': full_html,
                'debug_results': debug_results,
            }, status=503)
        try:
            if wkpath:
                config = pdfkit.configuration(wkhtmltopdf=wkpath)
            pdf = pdfkit.from_string(full_html, False, options=options, configuration=config)
        except Exception as e:
            return JsonResponse({
                'detail': 'PDF generation failed',
                'error': str(e),
                'html': full_html,
                'debug_results': debug_results,
            }, status=500)

        # Choose filename: if the PDF contains a single grouped iv_record_no, use that number
        try:
            if groups and len(groups) == 1:
                single_key = next(iter(groups))
                filename = f"Verification_{single_key}.pdf"
            else:
                filename = f"Verification_Multiple_Records_{doc_recs[0] if doc_recs else 'batch'}.pdf"
        except Exception:
            filename = f"Verification_Multiple_Records_{doc_recs[0] if doc_recs else 'batch'}.pdf"

        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class SuggestDocRec(APIView):
    """Suggest existing doc_rec identifiers for a given year and number.

    GET parameters:
      - year: full year (e.g. 2025 or 25)
      - number: numeric part (e.g. 002 or 100)

    Returns JSON list of matching doc_rec strings found in DB.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        year = request.query_params.get('year', '').strip()
        number = request.query_params.get('number', '').strip()
        # Allow a single numeric iv_record_no (e.g. ?number=25001) without a year.
        if not year and not number:
            return JsonResponse({'detail': 'year or number query params required'}, status=400)
        # normalize
        y4 = year if len(year) == 4 else (f'20{year}' if len(year) == 2 else year)
        y2 = y4[-2:]
        try:
            int_num = int(number)
        except Exception:
            int_num = None
        num = number

        # If caller provided a single numeric iv_record_no (e.g. 25001), return all doc_rec ids matching it
        try:
            if (not year) and number and re.fullmatch(r"\d+", number):
                ivv = int(number)
                qs_iv = InstVerificationMain.objects.filter(iv_record_no=ivv)
                if qs_iv.exists():
                    found = [getattr(x.doc_rec, 'doc_rec_id', None) for x in qs_iv if getattr(x.doc_rec, 'doc_rec_id', None)]
                    # unique preserving order
                    found = [f for f in dict.fromkeys([x for x in found if x])]
                    return JsonResponse({'candidates': found})
        except Exception:
            pass

        # Build candidate list with multiple paddings (original, unpadded, 3-digit, 4-digit)
        seq_variants = []
        if int_num is not None:
            seq_variants = [num, str(int_num), f"{int_num:03d}", f"{int_num:04d}"]
        else:
            seq_variants = [num]

        candidates = []
        for seq in seq_variants:
            candidates.extend([
                f'iv_{y2}_{seq}',
                f'iv_{y4}_{seq}',
                f'IV_{y2}_{seq}',
                f'IV_{y4}_{seq}',
            ])

        # Also include raw numeric and mixed patterns
        candidates.extend([f'{y4}{num}', f'{y2}{num}', num])

        found = []
        # Exact matches first
        for c in dict.fromkeys(candidates):
            qs = InstVerificationMain.objects.filter(doc_rec__doc_rec_id__iexact=c)
            if qs.exists():
                found.extend([getattr(x.doc_rec, 'doc_rec_id', None) for x in qs if getattr(x.doc_rec, 'doc_rec_id', None)])

        # endswith matches for the numeric part (strip leading zeros when checking)
        if int_num is not None:
            ends_with_candidates = [f'_{int_num}', f'_{int_num:03d}', f'_{int_num:04d}']
        else:
            ends_with_candidates = [f'_{num}']

        for ew in ends_with_candidates:
            try:
                qs2 = InstVerificationMain.objects.filter(doc_rec__doc_rec_id__iendswith=ew)
                if qs2.exists():
                    found.extend([getattr(x.doc_rec, 'doc_rec_id', None) for x in qs2 if getattr(x.doc_rec, 'doc_rec_id', None)])
            except Exception:
                pass

        # broader contains search as last resort
        try:
            cand_qs = InstVerificationMain.objects.filter(doc_rec__doc_rec_id__icontains=num)
            if cand_qs.exists():
                found.extend([getattr(x.doc_rec, 'doc_rec_id', None) for x in cand_qs if getattr(x.doc_rec, 'doc_rec_id', None)])
        except Exception:
            pass

        # unique preserving order
        found = [f for f in dict.fromkeys([x for x in found if x])]
        return JsonResponse({'candidates': found})
