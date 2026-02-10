from django.conf import settings
from django.template.loader import render_to_string
from django.http import HttpResponse, JsonResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from pathlib import Path
import json
import re, logging
from .domain_letter import InstLetterMain, InstLetterStudent
from .models import Enrollment, MainBranch, SubBranch, Institute
from collections import OrderedDict
from .serializers_Letter import InstLetterMainSerializer, InstLetterStudentSerializer
from .search_utils import apply_fts_search

# --- REPORTLAB IMPORTS (add once) ---
try:
    from io import BytesIO
    from reportlab.lib.pagesizes import A4  # type: ignore
    from reportlab.lib.units import mm, inch  # type: ignore
    from reportlab.platypus import (  # type: ignore
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        PageBreak,
        Flowable,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle  # type: ignore
    from reportlab.lib import colors  # type: ignore
    from reportlab.graphics.barcode import qr  # type: ignore
    from reportlab.graphics.shapes import Drawing  # type: ignore
    REPORTLAB_AVAILABLE = True
except Exception:
    REPORTLAB_AVAILABLE = False

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
                logging.getLogger('api').info('InstLetterPDF called by=%s payload=%s', getattr(request, 'user', None), payload)
        except Exception:
            pass

        # Allow callers to provide doc_recs (doc_rec IDs) OR iv_record_no / iv_record_nos
        doc_recs = payload.get('doc_recs') or payload.get('doc_rec') or []

        # Fetch records and group by inst_veri_number
        groups = OrderedDict()
        if doc_recs:
            if isinstance(doc_recs, str):
                doc_recs = [doc_recs]
            
            for doc_rec in doc_recs:
                try:
                    main = InstLetterMain.objects.filter(doc_rec=doc_rec).first()
                    if main:
                        main_data = InstLetterMainSerializer(main).data
                        key = main_data.get('inst_veri_number', doc_rec)
                        if key not in groups:
                            groups[key] = {'mains': [], 'students': []}
                        groups[key]['mains'].append(main_data)
                        
                        students = InstLetterStudent.objects.filter(doc_rec=doc_rec)
                        for student in students:
                            student_data = InstLetterStudentSerializer(student).data
                            student_data['_source_doc_rec'] = doc_rec
                            groups[key]['students'].append(student_data)
                except Exception as e:
                    logging.getLogger('api').exception('Error fetching record %s: %s', doc_rec, e)

        # ---------- REPORTLAB-BASED PDF GENERATION (FIXED) ----------
        if REPORTLAB_AVAILABLE:
            HEADER_FROM_TOP = 2.25 * inch  # 2.25 inch from top for Ref/Date
            HEADER_BLOCK_HEIGHT = 40 * mm  # Height of header block (issuer etc)

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
                    PAGE_WIDTH, PAGE_HEIGHT = A4
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
                        canvas.setFont("Helvetica", 11)
                        canvas.drawRightString(
                            PAGE_WIDTH - doc.rightMargin,
                            y_top,
                            main["inst_veri_date"]
                        )

                    # Issuer block (right aligned)
                    canvas.setFont("Helvetica-Bold", 11)
                    y = y_top - 8 * mm
                    for line in [
                        "Office of the Registrar,",
                        "Kadi Sarva Vishwavidyalaya,",
                        "Sector -15,",
                        "Gandhinagar- 382015",
                    ]:
                        canvas.drawRightString(PAGE_WIDTH - doc.rightMargin, y, line)
                        y -= 4 * mm

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
                            logging.getLogger('api').exception('QR draw failed')

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
                        topMargin=(2.25 * inch) + 40 * mm,  # body starts just below header
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

                    # Recipient block
                    if rep_main.get('rec_inst_name'):
                        story.append(Paragraph(f"<b>{rep_main.get('rec_inst_name')}</b>", normal))
                    if rep_main.get('rec_inst_address_1'):
                        story.append(Paragraph(rep_main.get('rec_inst_address_1'), normal))
                    story.append(Spacer(1, 2 * mm))  # tighter spacing

                    # Subject & Ref
                    doc_types = rep_main.get('doc_types') or "Certificate"
                    doc_label = doc_types if 'certificate' in str(doc_types).lower() else f"{doc_types} Certificate"
                    story.append(Paragraph(f"Sub: Educational Verification of <b>{doc_label}</b>.", sub_ref_style))
                    ref_frag = "Ref: Your Ref "
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
                    headers = ["Sr. No.", "Candidate Name", "Enrollment Number", "Branch", credential_header]
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
                    story.append(Spacer(1, 3 * mm))

                    # Remark and closing
                    story.append(Paragraph("<strong>Remark:</strong> The above record has been verified and found correct as per university records.", normal))
                    story.append(Spacer(1, 12))
                    story.append(Paragraph("Should you require any additional information or have further inquiries, please do not hesitate to reach out to us.", normal))
                    story.append(Spacer(1, 36))
                    story.append(Paragraph("Registrar", ParagraphStyle('sign', parent=styles['Normal'], fontSize=10)))

                    # Build document
                    doc.build(story, onFirstPage=header_cb, onLaterPages=header_cb)
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

    @action(detail=False, methods=["get"], url_path="search-rec-inst")
    def search_rec_inst(self, request):
        """Autocomplete for rec_inst_name by prefix (min 3 chars)."""
        q = request.query_params.get('q', '').strip()
        if len(q) < 3:
            return Response([], status=200)
        qs = self.queryset.filter(rec_inst_name__icontains=q)[:20]
        return Response([{ 'id': x.id, 'name': x.rec_inst_name } for x in qs], status=200)

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
    queryset = InstLetterStudent.objects.select_related('doc_rec', 'enrollment', 'institute', 'sub_course', 'main_course').order_by('-id')
    serializer_class = InstLetterStudentSerializer
    permission_classes = [IsAuthenticated]
    
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
    
    def create(self, request, *args, **kwargs):
        """Create student record with enrollment field resolution.
        
        If an enrollment identifier is provided, attempt to resolve the Enrollment
        and copy institute/main/subcourse fields onto the student record so that
        data created via API matches the behaviour of the bulk importer.
        """
        data = request.data.copy() if hasattr(request, 'data') else {}
        enr_key = data.get('enrollment') or data.get('enrollment_no') or data.get('enrollment_no_text')
        try:
            if enr_key:
                enr_obj = Enrollment.objects.filter(enrollment_no__iexact=str(enr_key).strip()).first()
                if enr_obj:
                    if getattr(enr_obj, 'institute', None):
                        data['institute'] = getattr(enr_obj.institute, 'id', None) or getattr(enr_obj.institute, 'pk', None)
                    if getattr(enr_obj, 'maincourse', None):
                        data['main_course'] = getattr(enr_obj.maincourse, 'id', None) or getattr(enr_obj.maincourse, 'pk', None)
                    if getattr(enr_obj, 'subcourse', None):
                        data['sub_course'] = getattr(enr_obj.subcourse, 'id', None) or getattr(enr_obj.subcourse, 'pk', None)
        except Exception:
            # best-effort: do not fail creation if sync fails
            pass
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        """Update student record with enrollment field resolution."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = request.data.copy() if hasattr(request, 'data') else {}
        enr_key = data.get('enrollment') or data.get('enrollment_no') or data.get('enrollment_no_text')
        try:
            if enr_key:
                enr_obj = Enrollment.objects.filter(enrollment_no__iexact=str(enr_key).strip()).first()
                if enr_obj:
                    if getattr(enr_obj, 'institute', None):
                        data['institute'] = getattr(enr_obj.institute, 'id', None) or getattr(enr_obj.institute, 'pk', None)
                    if getattr(enr_obj, 'maincourse', None):
                        data['main_course'] = getattr(enr_obj.maincourse, 'id', None) or getattr(enr_obj.maincourse, 'pk', None)
                    if getattr(enr_obj, 'subcourse', None):
                        data['sub_course'] = getattr(enr_obj.subcourse, 'id', None) or getattr(enr_obj.subcourse, 'pk', None)
        except Exception:
            pass
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)
