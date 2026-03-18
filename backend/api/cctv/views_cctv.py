from typing import Dict, Optional

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from django.db import OperationalError, ProgrammingError
from django.db import transaction
from django.db.models import Max
from django.http import HttpResponse

import io
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib import colors

from .domain_cctv import (
    CCTVExam,
    CCTVCentreEntry,
    CCTVDVD,
    CCTVOutward,
    CCTVCopyCase,
)

from .serializers_cctv import (
    CCTVExamSerializer,
    CCTVCentreEntrySerializer,
    CCTVDVDSerializer,
    CCTVOutwardSerializer,
    CCTVCopyCaseSerializer,
)
from ..sheets_sync import import_cctv_centres_from_sheet, import_cctv_exams_from_sheet

from ..domain_core import Menu, Module, UserPermission

OFFICE_MODULE_NAME = "Office Management"
CCTV_MENU_NAME = "CCTV Monitoring"

DEFAULT_RIGHTS = {
    "can_view": False,
    "can_create": False,
    "can_edit": False,
    "can_delete": False,
}
FULL_RIGHTS = {k: True for k in DEFAULT_RIGHTS}


def _user_is_admin(user) -> bool:
    return bool(
        getattr(user, "is_superuser", False)
        or getattr(user, "is_staff", False)
        or user.groups.filter(name__iexact="Admin").exists()
    )


def _perm_to_dict(record: UserPermission) -> Dict[str, bool]:
    return {
        "can_view": bool(record.can_view),
        "can_create": bool(record.can_create),
        "can_edit": bool(record.can_edit),
        "can_delete": bool(record.can_delete),
    }


def _fetch_permission_from_db(user, menu_name: str) -> Optional[Dict[str, bool]]:
    try:
        module = Module.objects.filter(name__iexact=OFFICE_MODULE_NAME).first()
        if not module:
            return None
        menu = None
        if menu_name:
            menu = Menu.objects.filter(module=module, name__iexact=menu_name).first()
            if not menu:
                # Allow emoji/prefix variants like "📹 CCTV Monitoring"
                menu = Menu.objects.filter(module=module, name__icontains=menu_name).first()
        if menu:
            record = UserPermission.objects.filter(user=user, module=module, menu=menu).first()
            if record:
                return _perm_to_dict(record)
        module_level = UserPermission.objects.filter(user=user, module=module, menu__isnull=True).first()
        if module_level:
            return _perm_to_dict(module_level)
    except Exception:
        return None
    return None


def get_cctv_rights(user, menu_name: str) -> Dict[str, bool]:
    if not user or not user.is_authenticated:
        return DEFAULT_RIGHTS.copy()
    if _user_is_admin(user):
        return FULL_RIGHTS.copy()
    rights = _fetch_permission_from_db(user, menu_name)
    if rights:
        return rights
    return DEFAULT_RIGHTS.copy()


class CctvPermissionMixin:
    cctv_menu_name: str = CCTV_MENU_NAME
    permission_action_map = {
        "list": "can_view",
        "retrieve": "can_view",
        "create": "can_create",
        "update": "can_edit",
        "partial_update": "can_edit",
        "destroy": "can_delete",
        "sync_from_sheet": "can_view",
        "assign_cc": "can_edit",
    }

    def _required_flag(self, action: Optional[str]) -> Optional[str]:
        if not action:
            return None
        return self.permission_action_map.get(action)

    def check_permissions(self, request):  # noqa: D401
        super().check_permissions(request)
        required = self._required_flag(getattr(self, "action", None))
        if required:
            rights = get_cctv_rights(request.user, self.cctv_menu_name)
            if not rights.get(required):
                raise PermissionDenied("You do not have permission to perform this action.")

    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except (OperationalError, ProgrammingError) as exc:
            return Response(
                {
                    "detail": "CCTV tables are not ready. Run migrations and retry.",
                    "error": str(exc),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


# ============================
# Exam
# ============================

class CCTVExamViewSet(CctvPermissionMixin, viewsets.ModelViewSet):
    queryset = CCTVExam.objects.all().order_by("exam_date")
    serializer_class = CCTVExamSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        queryset = CCTVExam.objects.all().order_by("exam_date")
        exam_year_session = (self.request.query_params.get("exam_year_session") or "").strip()
        if exam_year_session:
            queryset = queryset.filter(exam_year_session=exam_year_session)
        return queryset

    @action(detail=False, methods=["post"], url_path="sync-from-sheet")
    def sync_from_sheet(self, request):
        sheet_name = (request.data or {}).get("sheet_name") or request.query_params.get("sheet_name")
        if not sheet_name:
            return Response({"detail": "sheet_name is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            summary = import_cctv_exams_from_sheet(sheet_name=str(sheet_name).strip())
            return Response({"summary": summary})
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


# ============================
# Centre Entry (Auto DVD + CC)
# ============================

class CCTVCentreEntryViewSet(CctvPermissionMixin, viewsets.ModelViewSet):
    queryset = CCTVCentreEntry.objects.all()
    serializer_class = CCTVCentreEntrySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        queryset = CCTVCentreEntry.objects.all()
        exam_year_session = (self.request.query_params.get("exam_year_session") or "").strip()
        if exam_year_session:
            queryset = queryset.filter(exam__exam_year_session=exam_year_session)
        return queryset

    @action(detail=False, methods=["post"], url_path="sync-from-sheet")
    def sync_from_sheet(self, request):
        sheet_name = (request.data or {}).get("sheet_name") or request.query_params.get("sheet_name")
        if not sheet_name:
            return Response({"detail": "sheet_name is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            summary = import_cctv_centres_from_sheet(sheet_name=str(sheet_name).strip())
            return Response({"summary": summary})
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    def perform_create(self, serializer):
        centre = serializer.save()
        start = centre.start_number
        end = centre.end_number
        session = centre.session

        if start is not None and end is not None:
            for i in range(start, end + 1):
                CCTVDVD.objects.create(
                    centre=centre,
                    number=i,
                    label=f"{session}-{i}"
                )


# ============================
# DVD
# ============================

class CCTVDVDViewSet(CctvPermissionMixin, viewsets.ModelViewSet):
    queryset = CCTVDVD.objects.all()
    serializer_class = CCTVDVDSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        queryset = CCTVDVD.objects.all()
        exam_year_session = (self.request.query_params.get("exam_year_session") or "").strip()
        if exam_year_session:
            queryset = queryset.filter(centre__exam__exam_year_session=exam_year_session)
        return queryset

    @action(detail=False, methods=["post"], url_path="assign-cc")
    def assign_cc(self, request):
        data = request.data or {}
        centre_id = data.get("centre_id")
        try:
            total = int(data.get("total", 0))
        except (TypeError, ValueError):
            total = 0

        if not centre_id or total <= 0:
            return Response({"detail": "Invalid data."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            centre = CCTVCentreEntry.objects.select_for_update().get(id=centre_id)
            last = CCTVDVD.objects.aggregate(max_cc=Max("cc_number"))
            last_number = last["max_cc"] or 0

            start_number = last_number + 1
            end_number = last_number + total

            dvds = list(
                CCTVDVD.objects.filter(
                    centre=centre,
                    cc_number__isnull=True,
                ).order_by("id")[:total]
                )

            if not dvds:
                return Response(
                    {"detail": "No DVDs available for CC assignment."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if len(dvds) < total:
                return Response(
                    {"detail": "Not enough DVDs available for CC assignment."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            next_number = start_number
            for dvd in dvds:
                dvd.objection_found = True
                dvd.cc_number = next_number
                dvd.cc_label = f"CC-{next_number}"
                dvd.save()
                next_number += 1

            centre.cc_total = total
            centre.cc_start_label = f"CC-{start_number}"
            centre.cc_end_label = f"CC-{end_number}"
            centre.save()

        return Response(
            {
                "status": "CC assigned",
                "assigned": len(dvds),
                "cc_start": centre.cc_start_label,
                "cc_end": centre.cc_end_label,
                "total": total,
            }
        )


# ============================
# Outward
# ============================

class CCTVOutwardViewSet(CctvPermissionMixin, viewsets.ModelViewSet):
    queryset = CCTVOutward.objects.all()
    serializer_class = CCTVOutwardSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    @action(detail=True, methods=["get"], url_path="generate-pdf")
    def generate_pdf(self, request, pk=None):
        outward = self.get_object()

        def fmt_date(val):
            if not val:
                return ""
            s = str(val)
            if len(s) >= 10 and s[4] == "-":
                parts = s[:10].split("-")
                return f"{parts[2]}-{parts[1]}-{parts[0]}"
            return s

        dvd_label = outward.cc_start_label or ""
        last_date_str = fmt_date(outward.last_date)

        buf = io.BytesIO()

        doc = SimpleDocTemplate(
            buf,
            pagesize=A4,
            leftMargin=12.7 * mm,
            rightMargin=9.9 * mm,
            topMargin=6 * mm,
            bottomMargin=6 * mm,
        )

        # ── Styles ─────────────────────────────────────────────────────────────
        FONT_NORMAL = "Times-Roman"
        FONT_BOLD   = "Times-Bold"
        FONT_ITALIC = "Times-Italic"
        FS = 12

        base = ParagraphStyle(
            "Base",
            fontName=FONT_NORMAL,
            fontSize=FS,
            leading=FS * 1.35,
            spaceAfter=0,
            spaceBefore=0,
        )

        def S(**kw):
            return ParagraphStyle("_", parent=base, **kw)

        st_title    = S(fontName=FONT_BOLD, fontSize=15, alignment=TA_CENTER, spaceAfter=1, leading=18)
        st_h1       = S(fontName=FONT_BOLD, fontSize=12, alignment=TA_CENTER, spaceAfter=2, spaceBefore=1)
        st_norm     = S(spaceAfter=2)
        st_just     = S(alignment=TA_JUSTIFY, spaceAfter=3)
        st_right    = S(alignment=TA_RIGHT)
        st_list     = S(alignment=TA_JUSTIFY, leftIndent=18, firstLineIndent=-18, spaceAfter=2)
        st_italic_just = S(fontName=FONT_ITALIC, alignment=TA_JUSTIFY, spaceAfter=3)
        st_bold_norm = S(fontName=FONT_BOLD, spaceAfter=1)
        st_sig      = S(alignment=TA_RIGHT, spaceAfter=1, leading=FS * 1.4)
        st_subject  = S(fontName=FONT_BOLD, alignment=TA_CENTER, spaceAfter=4, spaceBefore=3)

        story = []
        SP = lambda h=3: Spacer(1, h * mm)
        HR = lambda: HRFlowable(width="100%", thickness=1, color=colors.black, spaceAfter=2 * mm, spaceBefore=1 * mm)

        # ── Title / Header ─────────────────────────────────────────────────────
        story.append(Paragraph("KADI SARVA VISHWAVIDYALAYA", st_title))
        story.append(Paragraph("Examination Department", st_h1))
        story.append(HR())

        # ── Ref No / Date — same line via two-column table ─────────────────────
        page_w = A4[0] - 12.7 * mm - 9.9 * mm
        ref_p  = Paragraph(f'<font name="{FONT_BOLD}">Ref No:</font>  {outward.outward_no or ""}', st_norm)
        date_p = Paragraph(f'<font name="{FONT_BOLD}">Date:</font>  {fmt_date(outward.outward_date)}', st_right)
        t = Table([[ref_p, date_p]], colWidths=[page_w * 0.55, page_w * 0.45])
        t.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(t)
        story.append(SP(3))

        # ── Addressee ──────────────────────────────────────────────────────────
        addr_lines = ["To,", "The Principal,"]
        if outward.college_name:
            addr_lines.append(outward.college_name)
        story.append(Paragraph("<br/>".join(addr_lines), st_norm))
        story.append(SP(3))

        # ── Subject ────────────────────────────────────────────────────────────
        story.append(Paragraph(
            "<u><b>Subject: Submission of CCTV Observation Report and CD for Verification</b></u>",
            st_subject,
        ))

        # ── Salutation ─────────────────────────────────────────────────────────
        story.append(Paragraph("Respected Sir/Madam,", st_norm))
        story.append(SP(2))

        # ── Body para 1 ────────────────────────────────────────────────────────
        story.append(Paragraph(
            f"With reference to the above subject, we have received the CCTV observation "
            f"report for your institution regarding the examination conducted in "
            f"<b>{outward.exam_on or ''}</b>. The report contains remarks indicating instances "
            f"such as students engaging in any type of irregularities during the examination.",
            st_just,
        ))

        # ── Body para 2 ────────────────────────────────────────────────────────
        story.append(Paragraph(
            "As per the instructions of the Honorable President of the University, "
            "you are requested to:",
            st_just,
        ))

        # ── Numbered list ──────────────────────────────────────────────────────
        items = [
            "Verify the report and identify the concerned student(s) involved in any noted irregularities.",
            "Call the student(s) and their parent(s) in person, show them the relevant CCTV footage, and obtain a written statement from the student and parent.",
            "The statement of parents &amp; Student(s) must be signed by the mentor and the principal with the date mentioned.",
            f"Submit a copy of the signed letter along with the report to the university by "
            f"<b>{last_date_str}</b>, addressed to Mr. Hitendra Patel, Examination Officer.",
            "Clearly mention in the report whether the student\u2019s case should be considered a copy "
            "case or not. If the student is involved in a copy case, ensure that proper CCTV footage "
            "evidence is available and documented.",
        ]
        for idx, item in enumerate(items, 1):
            story.append(Paragraph(f"{idx}.&nbsp;&nbsp;{item}", st_list))

        story.append(SP(2))

        # ── Additionally ───────────────────────────────────────────────────────
        story.append(Paragraph(
            "Additionally, after verification, the original report and CD enclosed with this "
            "letter must be returned to the university.",
            st_just,
        ))

        # ── Custom Note (if filled) ────────────────────────────────────────────
        if outward.note:
            story.append(SP(1))
            story.append(Paragraph(f"<b>Note:</b> {outward.note}", st_just))

        # ── Institutional Note ─────────────────────────────────────────────────
        story.append(SP(2))
        story.append(Paragraph(
            f"<i><b>Note:</b> If the CCTV observation report includes students from multiple "
            f"institutions, and any student from your institution is identified in the report, "
            f"kindly forward a copy of the report and CD to the respective institution. If no "
            f"student from your institution is identified, please submit a Nil report to the "
            f"university.</i>",
            st_italic_just,
        ))

        # ── Signature (right-aligned) ──────────────────────────────────────────
        story.append(SP(30))
        story.append(Paragraph("<b>Examination Controller</b>", st_sig))
        story.append(Paragraph("<b>Kadi Sarva Vishwavidyalaya</b>", st_sig))

        # ── Enclosures ─────────────────────────────────────────────────────────
        story.append(SP(2))
        story.append(HR())
        story.append(Paragraph("<b>Enclosures:</b>", st_bold_norm))
        story.append(Paragraph(f"1.&nbsp;&nbsp;DVD No(s).: {dvd_label}", st_norm))
        story.append(Paragraph(f"2.&nbsp;&nbsp;CCTV Observation Report No(s).: {outward.rep_nos or ''}", st_norm))

        doc.build(story)
        pdf_bytes = buf.getvalue()

        filename = f"{outward.cctv_record_no or 'CCTV_Letter'}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def perform_create(self, serializer):
        last_outward = CCTVOutward.objects.order_by("-id").first()
        next_outward = (
            int(last_outward.outward_no.split("-")[-1]) + 1
            if last_outward
            else 1
        )
        outward_no = f"KSV-SE-CCTV-{str(next_outward).zfill(3)}"

        last_record = CCTVOutward.objects.order_by("-id").first()
        next_record = (
            int(last_record.cctv_record_no.split("-")[-1]) + 1
            if last_record
            else 1
        )
        cctv_record_no = f"CCTV-REC-{str(next_record).zfill(4)}"

        serializer.save(outward_no=outward_no, cctv_record_no=cctv_record_no)


class CCTVCopyCaseViewSet(CctvPermissionMixin, viewsets.ModelViewSet):
    queryset = CCTVCopyCase.objects.select_related("outward").all()
    serializer_class = CCTVCopyCaseSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        queryset = super().get_queryset().filter(outward__case_found=True)
        outward_id = (self.request.query_params.get("outward") or "").strip()
        if outward_id:
            queryset = queryset.filter(outward_id=outward_id)
        return queryset
