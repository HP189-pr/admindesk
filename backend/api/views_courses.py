"""Course, institute, and enrollment related viewsets.

Extracted from the transitional `views.py` to reduce its size and improve maintainability.

Includes:
  - ModuleViewSet
  - MenuViewSet
  - UserPermissionViewSet
  - MainBranchViewSet
  - SubBranchViewSet
  - InstituteViewSet
  - InstituteCourseOfferingViewSet
  - EnrollmentViewSet

All classes are re-exported via `views.py` for backward compatibility so existing imports
(`from api import views`) remain functional until routing is updated to import directly.
"""

from __future__ import annotations

from django.db import models
from django.db.models import Value, Q
from django.db.models.functions import Lower, Replace
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    Module, Menu, UserPermission, InstituteCourseOffering, Institute, MainBranch, SubBranch, Enrollment
)
from .serializers import (
    ModuleSerializer, MenuSerializer, UserPermissionSerializer, InstituteCourseOfferingSerializer,
    InstituteSerializer, MainBranchSerializer, SubBranchSerializer, EnrollmentSerializer
)


class ModuleViewSet(viewsets.ModelViewSet):
    queryset = Module.objects.all()
    serializer_class = ModuleSerializer


class MenuViewSet(viewsets.ModelViewSet):
    queryset = Menu.objects.all()
    serializer_class = MenuSerializer

    @action(detail=False, methods=["get"], url_path="by-module/(?P<module_id>[^/.]+)")
    def menus_by_module(self, request, module_id=None):  # pragma: no cover - simple data passthrough
        menus = self.queryset.filter(module_id=module_id)
        serializer = self.get_serializer(menus, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UserPermissionViewSet(viewsets.ModelViewSet):
    queryset = UserPermission.objects.all()
    serializer_class = UserPermissionSerializer


class MainBranchViewSet(viewsets.ModelViewSet):
    queryset = MainBranch.objects.all()
    serializer_class = MainBranchSerializer


class SubBranchViewSet(viewsets.ModelViewSet):
    queryset = SubBranch.objects.all()
    serializer_class = SubBranchSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        mcid = self.request.query_params.get("maincourse_id")
        if mcid:
            return qs.filter(maincourse_id__iexact=str(mcid).strip())
        return qs


class InstituteViewSet(viewsets.ModelViewSet):
    queryset = Institute.objects.all()
    serializer_class = InstituteSerializer


class InstituteCourseOfferingViewSet(viewsets.ModelViewSet):
    queryset = InstituteCourseOffering.objects.all().select_related("institute", "maincourse", "subcourse", "updated_by")
    serializer_class = InstituteCourseOfferingSerializer


class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = Enrollment.objects.all().select_related("institute", "subcourse", "maincourse", "updated_by")
    serializer_class = EnrollmentSerializer
    lookup_field = "enrollment_no"
    lookup_value_regex = r"[^/]+"  # allow string with dashes etc.

    def get_queryset(self):
        qs = super().get_queryset().order_by("-created_at")
        search = self.request.query_params.get("search", "").strip()
        if search:
            norm_q = ''.join(search.split()).lower().replace('-', '').replace('_', '')
            n_en = Replace(
                Replace(
                    Replace(
                        Replace(Lower(models.F('enrollment_no')), Value(' '), Value('')),
                        Value('-'), Value('')
                    ),
                    Value('_'), Value('')
                ),
                Value('/'), Value('')
            )
            n_temp = Replace(
                Replace(
                    Replace(
                        Replace(Lower(models.F('temp_enroll_no')), Value(' '), Value('')),
                        Value('-'), Value('')
                    ),
                    Value('_'), Value('')
                ),
                Value('/'), Value('')
            )
            n_name = Replace(
                Replace(
                    Replace(Lower(models.F('student_name')), Value(' '), Value('')),
                    Value('-'), Value('')
                ),
                Value('_'), Value('')
            )
            qs = qs.annotate(n_en=n_en, n_temp=n_temp, n_name=n_name).filter(
                Q(n_en__contains=norm_q) | Q(n_temp__contains=norm_q) | Q(n_name__contains=norm_q)
            )
        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        try:
            limit = int(request.query_params.get("limit", 10))
            page = int(request.query_params.get("page", 1))
            if limit <= 0:
                limit = 10
            if page <= 0:
                page = 1
        except ValueError:
            limit = 10
            page = 1
        total = queryset.count()
        start = (page - 1) * limit
        end = start + limit
        page_items = queryset[start:end]
        serializer = self.get_serializer(page_items, many=True)
        return Response({"items": serializer.data, "total": total})

    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user if self.request.user.is_authenticated else None)


__all__ = [
    'ModuleViewSet', 'MenuViewSet', 'UserPermissionViewSet', 'MainBranchViewSet', 'SubBranchViewSet',
    'InstituteViewSet', 'InstituteCourseOfferingViewSet', 'EnrollmentViewSet'
]
