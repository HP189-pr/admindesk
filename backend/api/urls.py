"""File: backend/api/urls.py
API routing configuration.

Notes:
- Contains fallback when DRF/simplejwt unavailable (returns 503 guidance).
- After future view modularization, only import sources will change; router pattern remains.
- Keep route names stable to avoid frontend breakage.
"""

from django.urls import path, include
from django.http import HttpResponse

# Try to import DRF and API views; if unavailable, provide a friendly fallback.
try:
    from rest_framework.routers import DefaultRouter
    from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenVerifyView
    # Domain viewsets: course/enrollment now in views_courses; the rest still in transitional views
    from .views_courses import (
        ModuleViewSet, MenuViewSet, UserPermissionViewSet, InstituteCourseOfferingViewSet, MainBranchViewSet,
        SubBranchViewSet, InstituteViewSet, EnrollmentViewSet,
    )
    from .views_mail_request import GoogleFormSubmissionViewSet
    from .view_transcript_generate import TranscriptRequestViewSet
    from .views import (
        DocRecViewSet, VerificationViewSet, MigrationRecordViewSet, ProvisionalRecordViewSet,
        InstVerificationMainViewSet, InstVerificationStudentViewSet, StudentProfileViewSet, EcaViewSet,
        BulkUploadView, DataAnalysisView,
        
    )
    # Admin upload view
    from .views_admin import UploadDocRecView
    from .views_emp import EmpProfileViewSet
    # Auth / navigation / user management moved to views_auth
    from .views_auth import (
        HolidayViewSet, LoginView, ChangePasswordView, UserProfileView, VerifyPasswordView,
        VerifyAdminPanelPasswordView, CustomTokenObtainPairView, ProfilePictureView, CheckAdminAccessView,
        MyNavigationView, UserAPIView, UserDetailAPIView, AdminChangePasswordView,
    )
    # PDF generation view for inst verification
    from .view_inst_verification import GenerateInstVerificationPDF
    from .view_inst_verification import SuggestDocRec
    # Student search view
    from .views_student_search import StudentSearchViewSet
    # Degree management views
    from .views_degree import StudentDegreeViewSet, ConvocationMasterViewSet

    # Register router and API endpoints (normal path when DRF is installed)
    router = DefaultRouter()
    router.register(r'holidays', HolidayViewSet, basename='holidays')
    router.register(r'student-search', StudentSearchViewSet, basename='student-search')
    router.register(r'degrees', StudentDegreeViewSet, basename='degrees')
    router.register(r'convocations', ConvocationMasterViewSet, basename='convocations')
    router.register(r'modules', ModuleViewSet, basename='modules')  # ✅ Modules API
    router.register(r'menus', MenuViewSet, basename='menus')  # ✅ Menus API
    router.register(r'userpermissions', UserPermissionViewSet, basename='userpermissions')  # ✅ User Permissions API
    router.register(r'institute-course-offerings', InstituteCourseOfferingViewSet, basename='institute-course-offerings')
    router.register(r'mainbranch', MainBranchViewSet, basename='mainbranch')
    router.register(r'subbranch', SubBranchViewSet, basename='subbranch')
    router.register(r'institutes', InstituteViewSet, basename='institutes')
    router.register(r'enrollments', EnrollmentViewSet, basename='enrollments')
    router.register(r'docrec', DocRecViewSet, basename='docrec')
    router.register(r'verification', VerificationViewSet, basename='verification')
    router.register(r'migration', MigrationRecordViewSet, basename='migration')
    router.register(r'provisional', ProvisionalRecordViewSet, basename='provisional')
    router.register(r'inst-verification-main', InstVerificationMainViewSet, basename='inst-verification-main')
    router.register(r'inst-verification-student', InstVerificationStudentViewSet, basename='inst-verification-student')
    router.register(r'eca', EcaViewSet, basename='eca')
    router.register(r'student-profiles', StudentProfileViewSet, basename='student-profiles')
    router.register(r'mail-requests', GoogleFormSubmissionViewSet, basename='mail-requests')
    router.register(r'transcript-requests', TranscriptRequestViewSet, basename='transcript-requests')
    router.register(r'empprofile', EmpProfileViewSet, basename='empprofile')
    # Leave management endpoints
    from .views_emp import LeavePeriodListView, LeaveAllocationListView, MyLeaveBalanceView, LeaveTypeViewSet, LeavePeriodViewSet, SeedLeaveAllocationsView, LeaveTypeCompatView, LeaveTypeCompatDetailView, LeavePeriodCompatView, LeaveReportView, LeaveEntryViewSet, LeaveAllocationDetailView
    # Report views
    from .views_reports import LeaveBalanceReportView, RecomputeSnapshotsView, ActivatePeriodView
    router.register(r'leavetype', LeaveTypeViewSet, basename='leavetype')
    router.register(r'leaveperiods', LeavePeriodViewSet, basename='leaveperiods')
    # expose leave entry endpoints (normal and legacy-style)
    router.register(r'leaveentry', LeaveEntryViewSet, basename='leaveentry')
    router.register(r'leave_entry', LeaveEntryViewSet, basename='leave_entry')

    urlpatterns = [
        # Include all registered routes automatically
        path('', include(router.urls)),

        # JWT Token routes (custom and standard)
        path('backlogin/', CustomTokenObtainPairView.as_view(), name='backlogin'),
        path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
        path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
        path('token/verify/', TokenVerifyView.as_view(), name='token_verify'),

        # Custom login route
        path('userlogin/', LoginView.as_view(), name='userlogin'),
        path("check-admin-access/", CheckAdminAccessView.as_view(), name="check_admin_access"),

        # Change password
        path('change-password/', ChangePasswordView.as_view(), name='change-password'),
            # Admin change other user's password
            path('users/<int:user_id>/change-password/', AdminChangePasswordView.as_view(), name='admin-change-password'),

        # User profile management
        path('profile/', UserProfileView.as_view(), name="user-profile"),
        path('verify-password/', VerifyPasswordView.as_view(), name='verify-password'),
    path('verify-admin-panel-password/', VerifyAdminPanelPasswordView.as_view(), name='verify-admin-panel-password'),
        path('profile-picture/', ProfilePictureView.as_view(), name='profile-picture'),
    path('inst-verification/generate-pdf/', GenerateInstVerificationPDF.as_view(), name='inst-verification-generate-pdf'),
    path('inst-verification/suggest-doc-rec/', SuggestDocRec.as_view(), name='inst-verification-suggest-doc-rec'),
    path('my-navigation/', MyNavigationView.as_view(), name='my-navigation'),
    # `leaveperiods` is exposed via the router already; avoid duplicate explicit path
    # (keeps compatibility while preventing accidental URL collisions).
    # Note: leaveperiods is available both as router resource and legacy list-create; keep both for compatibility
    path('leave-allocations/', LeaveAllocationListView.as_view(), name='leave-allocations'),
    path('seed-leave-allocations/', SeedLeaveAllocationsView.as_view(), name='seed-leave-allocations'),
    path('leave-allocations/<int:pk>/', LeaveAllocationDetailView.as_view(), name='leave-allocation-detail'),
    path('leavetype-compat/', LeaveTypeCompatView.as_view(), name='leavetype-compat'),
    path('leavetype-compat/<int:pk>/', LeaveTypeCompatDetailView.as_view(), name='leavetype-compat-detail'),
    path('leaveperiods-compat/', LeavePeriodCompatView.as_view(), name='leaveperiods-compat'),
    path('my-leave-balance/', MyLeaveBalanceView.as_view(), name='my-leave-balance'),
    path('leave-report/', LeaveReportView.as_view(), name='leave-report'),
    # Admin-friendly endpoints
    path('recompute-snapshots/', RecomputeSnapshotsView.as_view(), name='recompute-snapshots'),
    path('admin/activate-period/', ActivatePeriodView.as_view(), name='admin-activate-period'),
    # Reports
    path('reports/leave-balance', LeaveBalanceReportView.as_view(), name='reports-leave-balance'),

        # User API endpoints
        path("users/", UserAPIView.as_view(), name="user-list-create"),
        path("users/<int:user_id>/", UserDetailAPIView.as_view(), name="user-detail"),
        path("modules/<int:module_id>/menus/", MenuViewSet.as_view({"get": "menus_by_module"}), name="menus-by-module"),
        # Bulk upload and data analysis endpoints
        path('bulk-upload/', BulkUploadView.as_view(), name='bulk-upload'),
        path('data-analysis/', DataAnalysisView.as_view(), name='data-analysis'),
    path('admin/upload-docrec/', UploadDocRecView.as_view(), name='admin-upload-docrec'),
    ]

except Exception as e:
    # DEBUG: print the exception early to help diagnose why we fell back
    import sys, traceback
    print("[api.urls] Import error in try block:", e, file=sys.stderr)
    traceback.print_exc()
    # Fallback: DRF (or simplejwt) not installed or import failed.
    # Provide a simple endpoint so Django can start and admin works.
    # NOTE: capture the exception text into a local variable because the
    # exception variable is cleared after the except block; referencing `e`
    # inside the nested function later causes NameError (observed).
    error_text = str(e)
    def api_unavailable(request, *args, **kwargs):
        msg = (
            "API unavailable: required packages missing (djangorestframework / simplejwt).\n"
            "Install with: pip install djangorestframework djangorestframework-simplejwt\n"
            f"Server import error: {error_text}"
        )
        return HttpResponse(msg, status=503, content_type="text/plain")

    urlpatterns = [
        path('', api_unavailable),
    ]
