from django.conf import settings
from django.template.loader import render_to_string
from django.http import HttpResponse, JsonResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from pathlib import Path
import json

import re, logging

from .models import InstVerificationMain, InstVerificationStudent
from collections import OrderedDict
from .serializers import InstLetterMainSerializer, InstLetterstudentSerializer

# --- REPORTLAB IMPORTS (add once) ---
try:
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        PageBreak,
        Flowable,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.graphics.barcode import qr
    from reportlab.graphics.shapes import Drawing

    REPORTLAB_AVAILABLE = True
except Exception:
    REPORTLAB_AVAILABLE = False


class InstLetterPDF(APIView):
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
                logging.getLogger('api').info('InstLetterPDF called by=%s payload=%s', getattr(request, 'user', None), payload)
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
                            main_ser = InstLetterMainSerializer(main_obj).data
                            main_ser = _prepare_main(main_ser, main_obj)

                            # Match students by the exact DocRec FK from the main_obj so
                            # we only pick InstVerificationStudent rows that belong to
                            # this InstVerificationMain's DocRec. Avoid string-based
                            # matching to prevent incorrect/over-broad results.
                            doc_rec_obj = getattr(main_obj, 'doc_rec', None)
                            if doc_rec_obj:
                                students_qs = InstVerificationStudent.objects.filter(doc_rec=doc_rec_obj).order_by('id')
                                logging.getLogger('api').info(f'PDF Generation (numeric): Found {students_qs.count()} students for doc_rec={doc_rec_obj.doc_rec_id}')
                            else:
                                students_qs = InstVerificationStudent.objects.none()
                                logging.getLogger('api').warning(f'PDF Generation (numeric): No doc_rec_obj found for main_obj={main_obj.id}')
                            students_ser = InstLetterstudentSerializer(students_qs, many=True).data
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
            main_qs = InstVerificationMain.objects.filter(doc_rec__doc_rec_id__iexact=dr)
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
                logging.getLogger('api').info('InstLetterPDF: doc_rec not found, attempts=%s', attempts)
                # keep debug result for not-found but continue so grouping can still occur for others
                debug_results.append({'requested': dr, 'doc_rec': None, 'found': False, 'attempts': attempts, 'students': []})
                continue

            # We have a main_obj; serialize and fetch students
            main_ser = InstLetterMainSerializer(main_obj).data
            main_ser = _prepare_main(main_ser, main_obj)
            # Use the actual doc_rec id from the found main_obj (safer if variant matched)
            actual_doc_rec = getattr(getattr(main_obj, 'doc_rec', None), 'doc_rec_id', None) or dr
            # Use the DocRec FK on the main_obj to fetch matching students. This
            # ensures the student rows are exactly those attached to the same
            # DocRec as the InstVerificationMain we found.
            doc_rec_obj = getattr(main_obj, 'doc_rec', None)
            if doc_rec_obj:
                students_qs = InstVerificationStudent.objects.filter(doc_rec=doc_rec_obj).order_by('id')
                logging.getLogger('api').info(f'PDF Generation: Found {students_qs.count()} students for doc_rec={doc_rec_obj.doc_rec_id}')
            else:
                students_qs = InstVerificationStudent.objects.none()
                logging.getLogger('api').warning(f'PDF Generation: No doc_rec_obj found for main_obj={main_obj.id}')
            students_ser = InstLetterstudentSerializer(students_qs, many=True).data
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

        # ---------- REPORTLAB-BASED PDF GENERATION (preferred) ----------
        # Helper: build QR payload (compact deterministic format)
        def build_qr_payload(main, students):
            try:
                if not isinstance(students, (list, tuple)):
                    students = []
                if len(students) == 1:
                    candidate = students[0].get("student_name", "") if isinstance(students[0], dict) else ""
                elif len(students) == 0:
                    candidate = "N/A"
                else:
                    candidate = "Multiple Candidates"
            except Exception:
                candidate = "Multiple Candidates"

            inst_no = main.get("inst_veri_number", "") if isinstance(main, dict) else ""
            rec_inst = main.get("rec_inst_name", "") if isinstance(main, dict) else ""

            # cap to 200 chars to limit QR density
            payload = f"IV:{inst_no}|NAME:{candidate}|INST:{rec_inst}"
            return payload[:200]

        # Use canvas-scoped attributes (safer than module globals) via Flowable
        if REPORTLAB_AVAILABLE:
            class _SetCurrentMainFlowable(Flowable):
                def __init__(self, main, qr_text):
                    super().__init__()
                    self.main = main
                    self.qr_text = qr_text
                    self.width = 0
                    self.height = 0

                def draw(self):
                    # Attach state to the canvas object used for this PDF build (avoids cross-request globals)
                    try:
                        # self.canv is the canvas for the current document build
                        setattr(self.canv, '_rl_current_main', self.main)
                        setattr(self.canv, '_rl_current_qr_text', self.qr_text)
                    except Exception:
                        logging.getLogger('api').exception('Failed to set canvas attributes for header/footer')

            def draw_header_footer(canvas_obj, doc_obj):
                """Draw header/footer and QR using attributes attached to the canvas."""
                try:
                    canvas_obj.saveState()
                    current_main = getattr(canvas_obj, '_rl_current_main', {}) or {}
                    current_qr_text = getattr(canvas_obj, '_rl_current_qr_text', None)

                    # Header reference
                    canvas_obj.setFont("Helvetica-Bold", 12)
                    if current_main.get("inst_veri_number"):
                        canvas_obj.drawString(10 * mm, 282 * mm, f"Ref: KSV/{current_main['inst_veri_number']}")

                    # Header date (right)
                    if current_main.get("inst_veri_date"):
                        canvas_obj.setFont("Helvetica", 11)
                        canvas_obj.drawRightString(200 * mm, 282 * mm, current_main["inst_veri_date"])
                        canvas_obj.setFont("Helvetica-Bold", 12)

                    # Issuer info block (top-right)
                    canvas_obj.setFont("Helvetica-Bold", 9)
                    lines = [
                        "Office of the Registrar,",
                        "Kadi Sarva Vishwavidyalaya,",
                        "Sector -15, Gandhinagar",
                    ]
                    y_pos = 270 * mm
                    for line in lines:
                        canvas_obj.drawRightString(200 * mm, y_pos, line)
                        y_pos -= 4 * mm

                    # Footer centered
                    canvas_obj.setFont("Helvetica", 9)
                    footer = "Email: verification@ksv.ac.in | Contact: 9408801690"
                    canvas_obj.drawCentredString(A4[0] / 2.0, 10 * mm, footer)

                    # QR code bottom-right (inside margins)
                    if current_qr_text:
                        try:
                            qr_code = qr.QrCodeWidget(current_qr_text)
                            bounds = qr_code.getBounds()
                            width = bounds[2] - bounds[0]
                            height = bounds[3] - bounds[1]

                            size_mm = 25 * mm
                            d = Drawing(
                                size_mm,
                                size_mm,
                                transform=[size_mm / width, 0, 0, size_mm / height, 0, 0]
                            )
                            d.add(qr_code)

                            x = doc_obj.pagesize[0] - getattr(doc_obj, 'rightMargin', 15 * mm) - size_mm
                            y = getattr(doc_obj, 'bottomMargin', 15 * mm) + 5 * mm

                            d.drawOn(canvas_obj, x, y)
                        except Exception:
                            logging.getLogger('api').exception('QR draw failed')

                except Exception:
                    logging.getLogger('api').exception('Header/footer drawing failed')
                finally:
                    try:
                        canvas_obj.restoreState()
                    except Exception:
                        pass

            # Build PDF using ReportLab Platypus
            try:
                buffer = BytesIO()
                # margins chosen to approximate existing HTML layout (top, right, bottom, left)
                doc = SimpleDocTemplate(
                    buffer,
                    pagesize=A4,
                    leftMargin=15 * mm,
                    rightMargin=10 * mm,
                    topMargin=35 * mm,
                    bottomMargin=25 * mm,
                )
                styles = getSampleStyleSheet()
                normal = styles['Normal']
                normal.spaceAfter = 6
                normal.fontSize = 11
                normal.leading = 14
                bold = ParagraphStyle('Bold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11)
                story = []

                group_items = list(groups.items())
                for idx, (gk, gval) in enumerate(group_items):
                    # pick representative main
                    rep_main = None
                    for m in gval['mains']:
                        if m and isinstance(m, dict):
                            rep_main = m
                            break
                    if not rep_main:
                        rep_main = {'inst_veri_number': gk, 'rec_inst_name': '', 'doc_types': '', 'inst_ref_no': '', 'rec_by': '', 'inst_veri_date': ''}

                    # merge students with dedupe
                    merged = []
                    seen = set()
                    for s in gval['students']:
                        sid = None
                        if isinstance(s, dict):
                            sid = s.get('id') or s.get('enrollment') or s.get('enrollment_no') or s.get('enrollment_no_text')
                        if not sid:
                            sid = json.dumps(s, sort_keys=True)
                        if sid in seen:
                            continue
                        seen.add(sid)
                        if isinstance(s, dict) and '_source_doc_rec' in s:
                            s = dict(s)
                            s.pop('_source_doc_rec', None)
                        merged.append(s)

                    # set current main and QR for the pages that follow (scoped via canvas attributes)
                    qr_text = build_qr_payload(rep_main, merged)
                    story.append(_SetCurrentMainFlowable(rep_main, qr_text))

                    # Recipient block
                    if rep_main.get('rec_inst_name'):
                        story.append(Paragraph(f"<b>{rep_main.get('rec_inst_name')}</b>", normal))
                    if rep_main.get('rec_inst_address_1'):
                        story.append(Paragraph(rep_main.get('rec_inst_address_1'), normal))
                    story.append(Spacer(1, 4 * mm))

                    # Subject & Ref
                    doc_types = rep_main.get('doc_types') or "Certificate"
                    doc_label = doc_types if 'certificate' in str(doc_types).lower() else f"{doc_types} Certificate"
                    story.append(Paragraph(f"Sub: Educational Verification of <b>{doc_label}</b>.", normal))
                    ref_frag = "Ref: Your Ref "
                    if rep_main.get('inst_ref_no'):
                        ref_frag += f"<strong>{rep_main.get('inst_ref_no')}</strong> "
                    if rep_main.get('rec_by'):
                        ref_frag += f"<strong>{rep_main.get('rec_by')}</strong> "
                    if not rep_main.get('inst_ref_no') and not rep_main.get('rec_by'):
                        ref_frag += "<strong>N/A</strong>"
                    if rep_main.get('ref_date'):
                        ref_frag += f" Dated on <strong>{rep_main.get('ref_date')}</strong>"
                    story.append(Paragraph(ref_frag, normal))
                    story.append(Spacer(1, 6 * mm))

                    # Intro/body
                    story.append(Paragraph("Regarding the subject and reference mentioned above, I am delighted to confirm that upon thorough verification, the documents pertaining to the candidate in question have been meticulously examined and found to be valid as per our records.", normal))
                    story.append(Spacer(1, 6 * mm))

                    # Student table
                    table_data = []
                    headers = ["Sr. No.", "Candidate Name", "Enrollment Number", "Branch", rep_main.get('type_of_credential') or "Type of Credential"]
                    table_data.append(headers)
                    if merged:
                        for i, s in enumerate(merged):
                            name = s.get('student_name') if isinstance(s, dict) else ""
                            enroll = s.get('enrollment_no') or s.get('enrollment') or s.get('enrollment_no_text') if isinstance(s, dict) else ""
                            branch = s.get('iv_degree_name') or s.get('branch') if isinstance(s, dict) else ""
                            cred = s.get('month_year') or s.get('type_of_credential') if isinstance(s, dict) else ""
                            table_data.append([str(i+1), name, enroll, branch, cred])
                    else:
                        table_data.append(['', 'No student records found', '', '', ''])

                    col_widths = [16*mm, 70*mm, 40*mm, 40*mm, 34*mm]
                    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
                    tbl.setStyle(TableStyle([
                        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
                        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e8e8e8')),
                        ('ALIGN', (0,0), (-1,0), 'CENTER'),
                        ('VALIGN', (0,0), (-1,-1), 'TOP'),
                        ('ALIGN', (0,1), (0,-1), 'CENTER'),
                        ('ALIGN', (2,1), (2,-1), 'LEFT'),
                        ('LEFTPADDING', (1,1), (1,-1), 6),
                        ('RIGHTPADDING', (1,1), (1,-1), 6),
                    ]))
                    story.append(tbl)
                    story.append(Spacer(1, 8 * mm))

                    # Remark and closing
                    story.append(Paragraph("<strong>Remark:</strong> The above record has been verified and found correct as per university records.", normal))
                    story.append(Spacer(1, 12))
                    story.append(Paragraph("Should you require any additional information or have further inquiries, please do not hesitate to reach out to us.", normal))
                    story.append(Spacer(1, 36))
                    story.append(Paragraph("Registrar", ParagraphStyle('sign', parent=styles['Normal'], fontSize=10)))

                    # Add page break between groups, but not after the last one
                    if idx != len(group_items) - 1:
                        story.append(PageBreak())

                # Build document
                doc.build(story, onFirstPage=draw_header_footer, onLaterPages=draw_header_footer)
                pdf_bytes = buffer.getvalue()
                buffer.close()
            except Exception as e:
                logging.getLogger('api').exception('ReportLab generation failed: %s', e)
                pdf_bytes = None

            if pdf_bytes:
                # Choose filename: mimic existing logic
                try:
                    if groups and len(groups) == 1:
                        single_key = next(iter(groups))
                        filename = f"Verification_{single_key}.pdf"
                    else:
                        filename = f"Verification_Multiple_Records_{doc_recs[0] if doc_recs else 'batch'}.pdf"
                except Exception:
                    filename = f"Verification_Multiple_Records_{doc_recs[0] if doc_recs else 'batch'}.pdf"

                response = HttpResponse(pdf_bytes, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                return response

        # ---------- END REPORTLAB PATH ----------

        # Fallback: If no valid pages, render error template
        if not pages or all(not str(p).strip() for p in pages):
            error_html = render_to_string('pdf_templates/record_not_found.html', {
                'doc_rec': doc_recs,
                'attempts': resolved_docs,
            })
            pages = [error_html]

        # Wrap pages into single HTML (used for debug preview / html preview in error messages)
        full_html = render_to_string('pdf_templates/batch_wrapper.html', {'pages': pages})

        # Optional: return HTML with console logs for browser debugging instead of PDF
        debug_console = (request.query_params.get('debug_console') == '1') or bool(payload.get('debug_console'))
        if debug_console:
            try:
                dbg_data = {
                    'requested': doc_recs,
                    'groups': list(groups.keys()),
                    'debug_results': debug_results,
                }
                dbg_json = json.dumps(dbg_data)
                debug_script = f"<script>console.log('IV Debug:', {dbg_json});</script>"
                debug_banner = f"<div style='padding:12px;border:1px solid #ccc;background:#f8f8f8;font-family:monospace;font-size:12px;'>" \
                                f"<strong>IV Debug</strong><pre>{json.dumps(dbg_data, indent=2)}</pre></div>"
                debug_html = debug_script + debug_banner + full_html
                return HttpResponse(debug_html, content_type='text/html; charset=utf-8')
            except Exception:
                return HttpResponse(full_html, content_type='text/html; charset=utf-8')

        # If ReportLab is not available, return an error instructing to install it (include HTML preview for debugging)
        if not REPORTLAB_AVAILABLE:
            logging.getLogger('api').error('reportlab library not installed')
            return JsonResponse({
                'detail': 'PDF generation unavailable',
                'error': 'reportlab library not installed. Please install: pip install reportlab',
                'html_preview': full_html[:2000] + '...',
            }, status=503)

        # If we reached here, ReportLab was available but generation failed earlier
        logging.getLogger('api').error('PDF generation failed (ReportLab path)')
        return JsonResponse({
            'detail': 'PDF generation failed',
            'error': 'ReportLab generation returned no PDF bytes',
            'html_sample': full_html[:1000] + '...',
        }, status=500)


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


class DebugInstLetter(APIView):
    """Debug endpoint to check what students exist in database and return HTML."""
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        try:
            payload = request.data if hasattr(request, 'data') else json.loads(request.body.decode('utf-8') or '{}')
        except Exception:
            payload = {}

        iv_record_no = payload.get('iv_record_no') or payload.get('iv_no')
        
        response_data = {
            'search_params': {
                'iv_record_no': iv_record_no,
            },
            'main_records': [],
            'total_main': 0,
            'total_students': 0,
            'student_details': [],
        }

        # Try to find main records
        if iv_record_no:
            try:
                iv_int = int(iv_record_no)
                mains = InstVerificationMain.objects.filter(iv_record_no=iv_int)
                response_data['total_main'] = mains.count()
                
                for main in mains:
                    doc_rec_val = getattr(main.doc_rec, 'doc_rec_id', None) if main.doc_rec else None
                    response_data['main_records'].append({
                        'id': main.id,
                        'iv_record_no': main.iv_record_no,
                        'inst_veri_number': main.inst_veri_number,
                        'doc_rec_id': doc_rec_val,
                        'doc_rec_obj_id': main.doc_rec_id if main.doc_rec_id else None,
                    })
                    
                    # Now check for students
                    if main.doc_rec:
                        students = InstVerificationStudent.objects.filter(doc_rec=main.doc_rec)
                        response_data['total_students'] += students.count()
                        
                        for student in students:
                            response_data['student_details'].append({
                                'id': student.id,
                                'enrollment': str(student.enrollment) if student.enrollment else student.enrollment_no_text,
                                'student_name': student.student_name,
                                'doc_rec_id': student.doc_rec_id if student.doc_rec_id else None,
                            })
                        
                        # If ?html=1, render and return the HTML
                        if request.query_params.get('html') == '1':
                            main_ser = InstLetterMainSerializer(main).data
                            students_ser = InstLetterstudentSerializer(students, many=True).data
                            
                            page_html = render_to_string('pdf_templates/inst_verification_record.html', {
                                'main': main_ser,
                                'students': students_ser,
                                'group_doc_recs': [doc_rec_val],
                                'iv_record_no': str(iv_int),
                                'credential_header': 'Type of Credential',
                            })
                            return HttpResponse(page_html, content_type='text/html; charset=utf-8')
            except Exception as e:
                response_data['error'] = str(e)
                import traceback
                response_data['traceback'] = traceback.format_exc()

        return JsonResponse(response_data)
