from django.conf import settings
from django.template.loader import render_to_string
from django.http import HttpResponse, JsonResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework import viewsets, status, serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from pathlib import Path
import json
import re, logging
from django.db.models.functions import Lower
from .domain_letter import InstLetterMain, InstLetterStudent
from .models import Enrollment, MainBranch, SubBranch, Institute
from collections import OrderedDict
from .serializers_Letter import InstLetterMainSerializer, InstLetterStudentSerializer
from .search_utils import apply_fts_search

logger = logging.getLogger('api')

# --- REPORTLAB IMPORTS (lazy so we can recover if it was installed later) ---
REPORTLAB_AVAILABLE = False

# Placeholders so static analyzers know these names exist even before reportlab loads.
BytesIO = None  # type: ignore
A4 = None  # type: ignore
mm = None  # type: ignore
inch = None  # type: ignore
SimpleDocTemplate = None  # type: ignore
Paragraph = None  # type: ignore
Spacer = None  # type: ignore
Table = None  # type: ignore
TableStyle = None  # type: ignore
PageBreak = None  # type: ignore
Flowable = None  # type: ignore
getSampleStyleSheet = None  # type: ignore
ParagraphStyle = None  # type: ignore
colors = None  # type: ignore
qr = None  # type: ignore
Drawing = None  # type: ignore


def ensure_reportlab_available():
    """(Re)load reportlab lazily so a later pip install does not require restart."""
    global REPORTLAB_AVAILABLE
    if REPORTLAB_AVAILABLE:
        return True

    try:
        from io import BytesIO as _BytesIO
        from reportlab.lib.pagesizes import A4 as _A4  # type: ignore
        from reportlab.lib.units import mm as _mm, inch as _inch  # type: ignore
        from reportlab.platypus import (  # type: ignore
            SimpleDocTemplate as _SimpleDocTemplate,
            Paragraph as _Paragraph,
            Spacer as _Spacer,
            Table as _Table,
            TableStyle as _TableStyle,
            PageBreak as _PageBreak,
            Flowable as _Flowable,
        )
        from reportlab.lib.styles import getSampleStyleSheet as _getSampleStyleSheet, ParagraphStyle as _ParagraphStyle  # type: ignore
        from reportlab.lib import colors as _colors  # type: ignore
        from reportlab.graphics.barcode import qr as _qr  # type: ignore
        from reportlab.graphics.shapes import Drawing as _Drawing  # type: ignore
    except Exception:
        REPORTLAB_AVAILABLE = False
        return False

    globals().update({
        'BytesIO': _BytesIO,
        'A4': _A4,
        'mm': _mm,
        'inch': _inch,
        'SimpleDocTemplate': _SimpleDocTemplate,
        'Paragraph': _Paragraph,
        'Spacer': _Spacer,
        'Table': _Table,
        'TableStyle': _TableStyle,
        'PageBreak': _PageBreak,
        'Flowable': _Flowable,
        'getSampleStyleSheet': _getSampleStyleSheet,
        'ParagraphStyle': _ParagraphStyle,
        'colors': _colors,
        'qr': _qr,
        'Drawing': _Drawing,
    })
    REPORTLAB_AVAILABLE = True
    return True


# Attempt to load once at import time; failures will be retried on demand.
ensure_reportlab_available()

# --- Begin migrated logic from view_inst_verification.py ---

# All logic from view_inst_verification.py is copied here, with the following changes:
# - All InstVerificationMain -> InstLetterMain
# - All InstVerificationStudent -> InstLetterStudent
# - All InstLetterMainSerializer, InstLetterStudentSerializer from .serializers_Letter
# - All usages of .models and .serializers updated to .domain_Letter and .serializers_Letter

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
                logger.info('InstLetterPDF called by=%s payload=%s', getattr(request, 'user', None), payload)
        except Exception:
            pass

        # Allow callers to provide doc_recs (doc_rec IDs) OR iv_record_no / iv_record_nos
        raw_doc_recs = payload.get('doc_recs') or payload.get('doc_rec') or []
        doc_rec_ids = []
        if isinstance(raw_doc_recs, str):
            raw_doc_recs = raw_doc_recs.strip()
            if raw_doc_recs:
                doc_rec_ids.append(raw_doc_recs)
        elif isinstance(raw_doc_recs, (list, tuple, set)):
            for entry in raw_doc_recs:
                if entry is None:
                    continue
                value = str(entry).strip()
                if value:
                    doc_rec_ids.append(value)
        elif raw_doc_recs:
            value = str(raw_doc_recs).strip()
            if value:
                doc_rec_ids.append(value)

        iv_numbers = []
        iv_single = payload.get('iv_record_no')
        if iv_single not in (None, ''):
            iv_numbers.append(iv_single)
        iv_multi = payload.get('iv_record_nos') or []
        if isinstance(iv_multi, (list, tuple, set)):
            iv_numbers.extend(iv_multi)
        elif iv_multi not in (None, ''):
            iv_numbers.append(iv_multi)

        normalized_iv_numbers = []
        for raw_iv in iv_numbers:
            try:
                normalized_iv_numbers.append(int(str(raw_iv).strip()))
            except Exception:
                continue
        iv_requested = bool(normalized_iv_numbers)

        if normalized_iv_numbers:
            iv_map = {}
            qs = InstLetterMain.objects.filter(iv_record_no__in=normalized_iv_numbers).select_related('doc_rec')
            for main in qs:
                doc_rec = getattr(main, 'doc_rec', None)
                doc_id = getattr(doc_rec, 'doc_rec_id', None) or getattr(doc_rec, 'id', None)
                if not doc_id:
                    continue
                iv_map.setdefault(main.iv_record_no, []).append(str(doc_id))
            for iv_no in normalized_iv_numbers:
                for resolved in iv_map.get(iv_no, []):
                    doc_rec_ids.append(resolved)

        doc_rec_ids = [key for key in OrderedDict.fromkeys([val for val in doc_rec_ids if val])]
        try:
            if getattr(settings, 'DEBUG', False):
                logger.info('InstLetterPDF resolved %s doc_rec_ids (iv_requested=%s)', len(doc_rec_ids), iv_requested)
        except Exception:
            pass

        if not doc_rec_ids:
            if iv_requested:
                return JsonResponse({
                    'error': 'No records found',
                    'detail': 'Unable to resolve the provided iv_record_no values to DocRec IDs'
                }, status=404)
            return JsonResponse({
                'error': 'Missing document references',
                'detail': 'Provide at least one doc_rec / doc_recs or iv_record_no(s) entry to generate the letter'
            }, status=400)

        # Fetch records and group by inst_veri_number
        groups = OrderedDict()
        for doc_rec in doc_rec_ids:
            try:
                main = InstLetterMain.objects.filter(doc_rec__doc_rec_id=doc_rec).first()
                if main:
                    main_data = InstLetterMainSerializer(main).data
                    key = main_data.get('inst_veri_number', doc_rec)
                    if key not in groups:
                        groups[key] = {'mains': [], 'students': []}
                    groups[key]['mains'].append(main_data)
                    
                    students = InstLetterStudent.objects.filter(doc_rec__doc_rec_id=doc_rec)
                    for student in students:
                        student_data = InstLetterStudentSerializer(student).data
                        student_data['_source_doc_rec'] = doc_rec
                        groups[key]['students'].append(student_data)
            except Exception as e:
                logging.getLogger('api').exception('Error fetching record %s: %s', doc_rec, e)

        if not groups:
            return JsonResponse({
                'error': 'No records found',
                'detail': 'Ensure the supplied doc_rec or iv_record_no values exist and have associated InstLetterMain data'
            }, status=404)
        try:
            if getattr(settings, 'DEBUG', False):
                logger.info('InstLetterPDF grouped records: keys=%s', list(groups.keys()))
        except Exception:
            pass

        # ---------- REPORTLAB-BASED PDF GENERATION (FIXED) ----------
        reportlab_ready = ensure_reportlab_available()
        if reportlab_ready:
            PAGE_WIDTH, PAGE_HEIGHT = A4
            HEADER_FROM_TOP = 2.25 * inch  # 2.25 inch from top for Ref/Date
            HEADER_BLOCK_HEIGHT = 40 * mm  # Height of header block (issuer etc) - mm is available after ensure_reportlab_available()

            def build_qr_payload(main, students):
                try:
                    if len(students) == 1:
                        name = students[0].get("student_name", "")
                    elif len(students) > 1:
                        name = "Multiple Candidates"
                    else:
                        name = "N/A"
                except Exception:
                    name = "N/A"
                inst_no = main.get("inst_veri_number", "")
                inst = main.get("rec_inst_name", "")
                payload = f"IV:{inst_no}|NAME:{name}|INST:{inst}"
                return payload[:200]

            def draw_header_footer_factory(main, qr_text):
                def draw_header_footer(canvas, doc):
                    canvas.saveState()

                    y_top = PAGE_HEIGHT - HEADER_FROM_TOP

                    # Ref (left)
                    if main.get("inst_veri_number"):
                        canvas.setFont("Helvetica-Bold", 11)
                        canvas.drawString(
                            doc.leftMargin,
                            y_top,
                            f"Ref: KSV/{main['inst_veri_number']}"
                        )

                    # Date (right)
                    if main.get("inst_veri_date"):
                        canvas.setFont("Helvetica-Bold", 11)
                        canvas.drawRightString(
                            PAGE_WIDTH - doc.rightMargin,
                            y_top,
                            main["inst_veri_date"]
                        )

                    # Issuer block (right aligned)
                    canvas.setFont("Helvetica-Bold", 11)
                    y = y_top - 8 * mm if 'mm' in globals() else y_top - 22.4
                    for line in [
                        "Office of the Registrar,",
                        "Kadi Sarva Vishwavidyalaya,",
                        "Sector -15,",
                        "Gandhinagar- 382015",
                    ]:
                        canvas.drawRightString(PAGE_WIDTH - doc.rightMargin, y, line)
                        y -= 4 * mm if 'mm' in globals() else 11.2

                    # QR code (bottom right)
                    if qr_text:
                        try:
                            qr_code = qr.QrCodeWidget(qr_text)
                            bounds = qr_code.getBounds()
                            w = bounds[2] - bounds[0]
                            h = bounds[3] - bounds[1]
                            size = 25 * mm
                            d = Drawing(
                                size,
                                size,
                                transform=[size / w, 0, 0, size / h, 0, 0]
                            )
                            d.add(qr_code)
                            d.drawOn(
                                canvas,
                                PAGE_WIDTH - doc.rightMargin - size,
                                10 * mm
                            )
                        except Exception:
                            logger.exception('QR draw failed')

                    # Footer
                    canvas.setFont("Helvetica", 9)
                    canvas.drawCentredString(
                        PAGE_WIDTH / 2,
                        5 * mm,
                        "Email: verification@ksv.ac.in | Contact: 9408801690 / 079-23244690"
                    )
                    canvas.restoreState()
                return draw_header_footer

            try:
                styles = getSampleStyleSheet()
                normal = styles['Normal']
                normal.spaceAfter = 6
                normal.fontSize = 11
                normal.leading = 14
                bold = ParagraphStyle('Bold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11)
                sub_ref_style = ParagraphStyle(
                    'SubRef',
                    parent=normal,
                    leftIndent=0.7 * inch
                )
                pdf_bytes = None

                group_items = list(groups.items())
                for idx, (gk, gval) in enumerate(group_items):
                    buffer = BytesIO()
                    doc = SimpleDocTemplate(
                        buffer,
                        pagesize=A4,
                        leftMargin=15 * mm,
                        rightMargin=10 * mm,
                        topMargin=(2.25 * inch) + 20 * mm,  # body starts just below header
                        bottomMargin=25 * mm,
                    )
                    story = []

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

                    qr_text = build_qr_payload(rep_main, merged)
                    header_cb = draw_header_footer_factory(rep_main, qr_text)

                    # --- Address block ---
                    story.append(Spacer(1, -2 * mm))
                    address_lines = []
                    # rec_inst_name (bold)
                    rec_inst_name = str(rep_main.get('rec_inst_name') or '').strip()
                    if rec_inst_name:
                        address_lines.append(f"<b>{rec_inst_name}</b>")
                    # Address 1
                    addr1 = str(rep_main.get('rec_inst_address_1') or '').strip()
                    if addr1:
                        address_lines.append(addr1)

                    # Address 2
                    addr2 = str(rep_main.get('rec_inst_address_2') or '').strip()
                    if addr2:
                        address_lines.append(addr2)

                    # Location + City + Pin formatting
                    # DEBUG: Log the value of rec_inst_pin for troubleshooting
                    try:
                        logger.info('DEBUG rec_inst_pin value: %r', rep_main.get('rec_inst_pin'))
                    except Exception:
                        pass
                    location = str(rep_main.get('rec_inst_location') or '').strip()
                    city = str(rep_main.get('rec_inst_city') or '').strip() 
                    # Fix: Sometimes pin is not fetched due to key or type issues
                    pin = ''
                    # Try both 'rec_inst_pin' and 'rec_inst_pin_code' as possible keys
                    for pin_key in ('rec_inst_pin', 'rec_inst_pin_code'):
                        pin_val = rep_main.get(pin_key)
                        if pin_val is not None and str(pin_val).strip():
                            pin = str(pin_val).strip()
                            break
        
                    loc_city_part = ""

                    if location and city:
                        loc_city_part = f"{location}, {city}"
                    elif location:
                        loc_city_part = location
                    elif city:
                        loc_city_part = city

                    if pin:  
                        if loc_city_part:
                            loc_city_part = f"{loc_city_part}-{pin}"
                        else:
                            loc_city_part = pin

                    if loc_city_part:
                        address_lines.append(loc_city_part)

                    # Render without blank rows
                    # Use a ParagraphStyle with no spaceAfter and tight leading for address lines
                    address_style = ParagraphStyle('Address', parent=normal, spaceAfter=0, fontSize=11, leading=11)
                    for line in address_lines:
                        story.append(Paragraph(line, address_style))
                    # Add extra space after address block (city-pin line) before subject
                    story.append(Spacer(1, 6 * mm))  # Adjust 6*mm as needed for more/less space



                    # Subject & Ref
                    doc_types = rep_main.get('doc_types') or "Certificate"
                    doc_label = doc_types if 'certificate' in str(doc_types).lower() else f"{doc_types} Certificate"
                    story.append(Paragraph(f"<strong>Sub:</strong> Educational Verification of <b>{doc_label}</b>.", sub_ref_style))

                    ref_frag = "<strong>Ref:</strong> Your Ref "
                    if rep_main.get('inst_ref_no'):
                        ref_frag += f"<strong>{rep_main.get('inst_ref_no')}</strong> "
                    if rep_main.get('rec_by'):
                        ref_frag += f"<strong>{rep_main.get('rec_by')}</strong> "
                    if not rep_main.get('inst_ref_no') and not rep_main.get('rec_by'):
                        ref_frag += "<strong>N/A</strong>"
                    if rep_main.get('ref_date'):
                        ref_frag += f" Dated on <strong>{rep_main.get('ref_date')}</strong>"
                    story.append(Paragraph(ref_frag, sub_ref_style))
                    story.append(Spacer(1, 3 * mm))

                    # Intro/body
                    story.append(Paragraph("Regarding the subject and reference mentioned above, I am delighted to confirm that upon thorough verification, the documents pertaining to the candidate in question have been meticulously examined and found to be valid as per our records.", normal))
                    story.append(Spacer(1, 2 * mm))

                    # Student table
                    table_data = []
                    credential_header = "Type of Credential"
                    for s in merged:
                        val = s.get('type_of_credential')
                        if val and str(val).strip():
                            credential_header = str(val).strip()
                            break
                    headers = ["No.", "Candidate Name", "Enrollment Number", "Branch", credential_header]
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

                    col_widths = [12*mm, 70*mm, 40*mm, 40*mm, 29*mm]
                    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
                    tbl.setStyle(TableStyle([
                        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
                        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e8e8e8')),
                        ('ALIGN', (0,0), (-1,0), 'CENTER'),
                        ('VALIGN', (0,0), (-1,-1), 'TOP'),
                        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'), 
                        ('ALIGN', (0,1), (0,-1), 'CENTER'),
                        ('ALIGN', (2,1), (2,-1), 'LEFT'),
                        ('LEFTPADDING', (1,1), (1,-1), 6),
                        ('RIGHTPADDING', (1,1), (1,-1), 6),
                    ]))
                    story.append(tbl)
                    story.append(Spacer(1, 3 * mm))

                    # Remark and closing
                    story.append(Paragraph("<strong>Remark:</strong> The above record has been verified and found correct as per university records.", normal))
                    story.append(Spacer(1, 12))
                    story.append(Paragraph("Should you require any additional information or have further inquiries, please do not hesitate to reach out to us.", normal))
                    story.append(Spacer(1, 36))
                    sign_style = ParagraphStyle('sign', parent=styles['Normal'], fontSize=10)
                    story.append(Paragraph("<b>Registrar<br/>Kadi Sarva Vishwavidyalaya</b>", sign_style))
                    # Build document
                    doc.build(story, onFirstPage=header_cb, onLaterPages=header_cb)
                    pdf_bytes = buffer.getvalue()
                    buffer.close()
            except Exception as e:
                logger.exception('ReportLab generation failed: %s', e)
                pdf_bytes = None

            if pdf_bytes:
                # Choose filename: mimic existing logic
                try:
                    if groups and len(groups) == 1:
                        single_key = next(iter(groups))
                        filename = f"Verification_{single_key}.pdf"
                    else:
                        filename = f"Verification_Multiple_Records_{doc_rec_ids[0] if doc_rec_ids else 'batch'}.pdf"
                except Exception:
                    filename = f"Verification_Multiple_Records_{doc_rec_ids[0] if doc_rec_ids else 'batch'}.pdf"

                response = HttpResponse(pdf_bytes, content_type='application/pdf')
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
                return response
            else:
                try:
                    logger.error('InstLetterPDF produced no PDF bytes despite reportlab_ready, doc_rec_ids=%s', doc_rec_ids)
                except Exception:
                    pass
                return JsonResponse({
                    'error': 'Failed to generate PDF',
                    'detail': 'PDF generation failed or no data available'
                }, status=500)
        else:
            try:
                logger.error('InstLetterPDF requested but ReportLab unavailable')
            except Exception:
                pass
            return JsonResponse({
                'error': 'ReportLab not available',
                'detail': 'PDF generation library is not installed'
            }, status=500)

        # Fallback safety net: should not reach this point, but return a JSON error instead of None
        logger.error('InstLetterPDF reached unexpected fallthrough (doc_rec_ids=%s, groups=%s)', doc_rec_ids, list(groups.keys()))
        return JsonResponse({
            'error': 'Unexpected PDF generation failure',
            'detail': 'An unexpected state prevented PDF generation. Please retry or contact support.'
        }, status=500)


# ========== VIEWSETS ==========

class InstLetterMainViewSet(viewsets.ModelViewSet):
    """ViewSet for institutional verification main records (now called InstLetter).
    
    Handles CRUD operations for institutional verification letters.
    Frontend URLs use 'inst-verification-main' for backward compatibility.
    """
    queryset = InstLetterMain.objects.select_related('doc_rec', 'institute').order_by('-id')
    serializer_class = InstLetterMainSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        params = getattr(self.request, 'query_params', {})

        doc_rec_param = None
        iv_record_no_param = None
        inst_veri_number_param = None

        try:
            doc_rec_param = params.get('doc_rec') or params.get('doc_rec_id')
        except Exception:
            doc_rec_param = None
        try:
            iv_record_no_param = params.get('iv_record_no')
        except Exception:
            iv_record_no_param = None
        try:
            inst_veri_number_param = params.get('inst_veri_number')
        except Exception:
            inst_veri_number_param = None

        if doc_rec_param:
            qs = qs.filter(doc_rec__doc_rec_id=doc_rec_param)
        if iv_record_no_param:
            try:
                qs = qs.filter(iv_record_no=int(str(iv_record_no_param).strip()))
            except Exception:
                qs = qs.filter(iv_record_no=iv_record_no_param)
        if inst_veri_number_param:
            qs = qs.filter(inst_veri_number=inst_veri_number_param)

        search = params.get('search', '').strip() if hasattr(params, 'get') else ''
        if search:
            # Use PostgreSQL Full-Text Search (100× faster)
            # Falls back to normalized search if FTS not available
            qs = apply_fts_search(
                queryset=qs,
                search_query=search,
                search_fields=['search_vector'],  # FTS field
                fallback_fields=['inst_veri_number', 'rec_inst_name', 'inst_ref_no']
            )
        return qs

    def create(self, request, *args, **kwargs):
        inst_no = (request.data.get("inst_veri_number") or "").strip()
        iv_record_raw = request.data.get("iv_record_no")
        iv_record_no = None
        try:
            iv_record_no = int(str(iv_record_raw).strip()) if iv_record_raw is not None else None
        except Exception:
            iv_record_no = None

        existing = None
        if inst_no:
            existing = InstLetterMain.objects.filter(inst_veri_number=inst_no).order_by("-id").first()
        if not existing and iv_record_no is not None:
            existing = InstLetterMain.objects.filter(iv_record_no=iv_record_no).order_by("-id").first()

        if existing and not existing.doc_rec:
            serializer = self.get_serializer(existing, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data, status=status.HTTP_200_OK)

        return super().create(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="search-rec-inst")
    def search_rec_inst(self, request):
        """
        Autocomplete for rec_inst_name by prefix (min 3 chars).

        - Returns unique names (case-insensitive)
        - If an exact (iexact) match is found, include the latest address fields for that name
        Response shape: [{"name": "ABC Institute", "address": {..}} | {"name": "Another"}, ...]
        """
        q = request.query_params.get('q', '').strip()
        if len(q) < 3:
            return Response([], status=200)

        base_qs = self.queryset.exclude(rec_inst_name__isnull=True).exclude(rec_inst_name="")

        # Exact match (latest record wins for address fields)
        exact_record = (
            base_qs.filter(rec_inst_name__iexact=q)
            .order_by('-id')
            .first()
        )

        # Unique names containing the query (case-insensitive distinct)
        names_qs = (
            base_qs.filter(rec_inst_name__icontains=q)
            .annotate(name_lower=Lower('rec_inst_name'))
            .order_by('name_lower')
            .distinct('name_lower')
        )[:20]

        results = []
        for row in names_qs:
            name = row.rec_inst_name
            if not name:
                continue
            item = {"name": name}
            if exact_record and name.lower() == exact_record.rec_inst_name.lower():
                item["address"] = {
                    "rec_inst_address_1": exact_record.rec_inst_address_1 or "",
                    "rec_inst_address_2": exact_record.rec_inst_address_2 or "",
                    "rec_inst_location": exact_record.rec_inst_location or "",
                    "rec_inst_city": exact_record.rec_inst_city or "",
                    "rec_inst_pin": exact_record.rec_inst_pin or "",
                }
            results.append(item)

        return Response(results, status=200)

    @action(detail=False, methods=["post"], url_path="update-service-only")
    def update_service_only(self, request):
        """Update only the InstLetterMain record without modifying DocRec.
        
        Use this from the inst-verification page when editing service details only.
        Payload: { "id": 123, "inst_veri_number": "...", "rec_inst_name": "...", ... }
        """
        inst_verification_id = request.data.get("id")
        if not inst_verification_id:
            return Response({"error": "InstLetterMain id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            inst_verification = InstLetterMain.objects.get(id=inst_verification_id)
        except InstLetterMain.DoesNotExist:
            return Response({"error": "InstLetterMain not found"}, status=status.HTTP_404_NOT_FOUND)

        # Update with provided data
        serializer = InstLetterMainSerializer(inst_verification, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({
                "message": "InstLetterMain updated successfully",
                "id": inst_verification.id,
                "doc_rec_id": inst_verification.doc_rec.doc_rec_id if inst_verification.doc_rec else None
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()


class InstLetterStudentViewSet(viewsets.ModelViewSet):
    """ViewSet for institutional verification student records (now called InstLetter).
    
    Handles CRUD operations for students linked to institutional verification letters.
    Frontend URLs use 'inst-verification-student' for backward compatibility.
    """
    queryset = InstLetterStudent.objects.select_related('doc_rec', 'enrollment').order_by('-id')
    serializer_class = InstLetterStudentSerializer
    permission_classes = [IsAuthenticated]

    # Some older frontend builds (and some integrations) send redundant/legacy FK fields.
    # These are non-editable for this endpoint and should never block save operations.
    FK_TRIM_KEYS = (
        # Institute
        "institute",
        "institute_id",
        # Main course
        "main_course",
        "main_course_id",
        "maincourse",
        "maincourse_id",
        # Sub course
        "sub_course",
        "sub_course_id",
        "subcourse",
        "subcourse_id",
    )

    # Keys that may appear in serializer validation errors that we treat as non-fatal.
    FK_VALIDATION_FIELDS = tuple(
        key for key in (
            "institute_id",
            "main_course_id",
            "sub_course_id",
            "maincourse_id",
            "subcourse_id",
        )
        if key is not None
    )
    
    def get_queryset(self):
        """Allow filtering students by the parent doc_rec identifier.
        
        Supports query params:
          - doc_rec: the DocRec.doc_rec_id string (preferred)
          - doc_rec_id: alias for doc_rec
        Returns the base queryset filtered when these params are present.
        """
        qs = super().get_queryset()
        req = self.request
        if not req:
            return qs
        doc_rec_param = req.query_params.get('doc_rec') or req.query_params.get('doc_rec_id')
        if doc_rec_param:
            # doc_rec is a FK to DocRec using to_field='doc_rec_id', so filter via the related field
            return qs.filter(doc_rec__doc_rec_id=doc_rec_param)
        return qs

    def _serializer_with_fk_fallback(self, data, instance=None, partial=False):
        """
        Always strip foreign key fields before validation.
        Never allow invalid FK IDs to break student save.
        """
        cleaned = data.copy()
        for key in self.FK_TRIM_KEYS:
            cleaned.pop(key, None)
        serializer = self.get_serializer(instance, data=cleaned, partial=partial)
        serializer.is_valid(raise_exception=True)
        return serializer

    def _normalize_payload(self, request):
        raw_data = request.data.copy() if hasattr(request, 'data') else {}
        if hasattr(raw_data, 'dict'):
            data = raw_data.dict()
        elif hasattr(raw_data, 'items'):
            data = {k: raw_data[k] for k in raw_data}
        else:
            data = dict(raw_data or {})
        for key in self.FK_TRIM_KEYS:
            data.pop(key, None)
        return data

    def _resolve_enrollment_from_data(self, data):
        enr_key = data.get('enrollment') or data.get('enrollment_no') or data.get('enrollment_no_text')
        if not enr_key:
            return None
        typed = str(enr_key).strip()
        if not typed:
            return None
        try:
            return Enrollment.objects.filter(
                enrollment_no__iexact=typed
            ).select_related('institute', 'maincourse', 'subcourse').first()
        except Exception:
            return None

    def _apply_enrollment_relations(self, instance, enrollment_obj):
        if not instance or not enrollment_obj:
            return

        update_fields = []

        # Institute (safe)
        if enrollment_obj.institute_id:
            instance.institute_id = enrollment_obj.institute_id
            update_fields.append('institute')

        # Main course (use MainBranch object, not numeric ID)
        if enrollment_obj.maincourse:
            instance.main_course = enrollment_obj.maincourse
            update_fields.append('main_course')

        # Sub course (use SubBranch object, not numeric ID)
        if enrollment_obj.subcourse:
            instance.sub_course = enrollment_obj.subcourse
            update_fields.append('sub_course')

        if update_fields:
            instance.save(update_fields=update_fields)
    
    def create(self, request, *args, **kwargs):
        data = self._normalize_payload(request)
        try:
            serializer = self._serializer_with_fk_fallback(data)
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        except drf_serializers.ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, *args, **kwargs):
        """Update student record with enrollment field resolution."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = self._normalize_payload(request)
        try:
            logger.info("InstLetterStudent update payload_keys=%s", sorted(list(data.keys())))
        except Exception:
            pass
        enr_obj = self._resolve_enrollment_from_data(data)
        try:
            serializer = self._serializer_with_fk_fallback(data, instance=instance, partial=partial)
        except drf_serializers.ValidationError as exc:
            if getattr(settings, 'DEBUG', False):
                detail = exc.detail if isinstance(exc.detail, dict) else {"detail": exc.detail}
                detail["_payload_keys"] = sorted(list(data.keys()))
                detail["_debug_marker"] = "inst_letter_student_update"
                return Response(detail, status=status.HTTP_400_BAD_REQUEST)
            raise
        self.perform_update(serializer)
        enrollment_source = enr_obj or getattr(serializer.instance, 'enrollment', None)
        self._apply_enrollment_relations(serializer.instance, enrollment_source)
        return Response(serializer.data)


class SuggestDocRec(APIView):
    """Suggest next doc_rec ID for institutional letters based on year/number."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        year = request.GET.get('year', '')
        number = request.GET.get('number', '')
        
        # Simple suggestion logic - find the latest IV record and increment
        try:
            from django.db.models import Max
            latest = InstLetterMain.objects.filter(
                inst_veri_number__isnull=False
            ).exclude(
                inst_veri_number=''
            ).aggregate(Max('iv_record_no'))
            
            max_record_no = latest.get('iv_record_no__max') or 0
            suggested = f"IV{year}{int(number or max_record_no + 1):06d}"
            
            return JsonResponse({
                'suggested_doc_rec': suggested,
                'year': year,
                'number': number or (max_record_no + 1)
            })
        except Exception as e:
            return JsonResponse({
                'error': str(e),
                'suggested_doc_rec': f"IV{year}{number or '000001'}"
            }, status=400)


class DebugInstLetter(APIView):
    """Debug endpoint for institutional letter data (development only)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not settings.DEBUG:
            return JsonResponse({'error': 'Debug endpoint only available in DEBUG mode'}, status=403)
        
        return JsonResponse({
            'message': 'Debug endpoint for institutional letters',
            'total_records': InstLetterMain.objects.count(),
            'total_students': InstLetterStudent.objects.count(),
        })
