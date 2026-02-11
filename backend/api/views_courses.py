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
    Module, Menu, UserPermission, InstituteCourseOffering, Institute, MainBranch, SubBranch
)
from .serializers import (
    ModuleSerializer, MenuSerializer, UserPermissionSerializer, InstituteCourseOfferingSerializer,
    InstituteSerializer, MainBranchSerializer, SubBranchSerializer
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
    
    # Temporary debug helpers: capture incoming data and serializer errors
    def create(self, request, *args, **kwargs):
        try:
            print("DEBUG: UserPermissionViewSet.create called. request.data=", request.data)
        except Exception:
            print("DEBUG: UserPermissionViewSet.create - failed to print request.data")

        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            # Print errors to server console for immediate debugging
            try:
                print("DEBUG: UserPermission create errors:", serializer.errors)
            except Exception:
                pass
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        try:
            print("DEBUG: UserPermissionViewSet.update called. request.data=", request.data)
        except Exception:
            print("DEBUG: UserPermissionViewSet.update - failed to print request.data")

        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if not serializer.is_valid():
            try:
                print("DEBUG: UserPermission update errors:", serializer.errors)
            except Exception:
                pass
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        self.perform_update(serializer)
        return Response(serializer.data)


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


__all__ = [
    'ModuleViewSet', 'MenuViewSet', 'UserPermissionViewSet', 'MainBranchViewSet', 'SubBranchViewSet',
    'InstituteViewSet', 'InstituteCourseOfferingViewSet'
]
