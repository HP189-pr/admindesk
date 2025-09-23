from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views_pages import (
    EnrollmentViewSet,
    InstituteViewSet,
    MainBranchViewSet,
    SubBranchViewSet,
)

# Create a router and register viewsets for page-related APIs
router = DefaultRouter()
router.register(r'institutes', InstituteViewSet)
router.register(r'main-branches', MainBranchViewSet)
router.register(r'sub-branches', SubBranchViewSet)
router.register(r'enrollments', EnrollmentViewSet)

urlpatterns = [
   path('', include(router.urls)),
]
