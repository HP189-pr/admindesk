"""
File: backend/api/urls.py
API routing configuration.
"""

from django.urls import path, include
from django.http import HttpResponse

try:
    # DRF + JWT
    from rest_framework.routers import DefaultRouter
    from rest_framework_simplejwt.views import (
        TokenObtainPairView,
        TokenRefreshView,
        TokenVerifyView,
    )

    # --- COURSE / ENROLLMENT MODULE ---
    from .views_courses import (
        ModuleViewSet, MenuViewSet, UserPermissionViewSet,
        InstituteCourseOfferingViewSet, MainBranchViewSet,
        SubBranchViewSet, InstituteViewSet, EnrollmentViewSet,
    )

    # --- MAIL / TRANSCRIPT ---
    from .views_mail_request import GoogleFormSubmissionViewSet
    from .view_transcript_generate import TranscriptRequestViewSet

    # --- DOCUMENT MANAGEMENT ---
    from .views import (
        DocRecViewSet, VerificationViewSet, MigrationRecordViewSet,
        ProvisionalRecordViewSet, InstVerificationMainViewSet,
        InstVerificationStudentViewSet, StudentProfileViewSet,
        EcaViewSet, BulkUploadView, DataAnalysisView,
    )

    # --- INVENTORY ---
    from .inventory import (
        InventoryItemViewSet, InventoryInwardViewSet,
        InventoryOutwardViewSet, StockSummaryView
    )

    # --- ADMIN UPLOAD ---
    from .views_admin import UploadDocRecView

    # --- EMPLOYEE / LEAVE MANAGEMENT (UPDATED) ---
    from .views_emp import (
    LeavePeriodListView,
    LeaveAllocationListView,
    LeaveAllocationDetailView,
    LeaveEntryViewSet,
    MyLeaveBalanceView,
    LeaveReportView,
    EmpProfileViewSet,
    )
    
    # --- LIVE BALANCE ENGINE ---
    from .views_leave_balance import (
        CurrentLeaveBalanceView,
        PeriodLeaveBalanceView,
        LeaveHistoryView,
        LeaveBalanceReportView,
    )

    # --- STUDENT SEARCH ---
    from .views_student_search import StudentSearchViewSet

    # --- DEGREE MGMT ---
    from .views_degree import StudentDegreeViewSet, ConvocationMasterViewSet

    # --- AUTH / NAVIGATION ---
    from .views_auth import (
        HolidayViewSet, LoginView, ChangePasswordView, UserProfileView,
        VerifyPasswordView, VerifyAdminPanelPasswordView, CustomTokenObtainPairView,
        ProfilePictureView, CheckAdminAccessView, MyNavigationView,
        UserAPIView, UserDetailAPIView, AdminChangePasswordView
    )

    # --- INWARD / OUTWARD REGISTER ---
    from .in_out_register import IN_OUT_REGISTER_URLS

    # --- INST VERIFICATION PDF ---
    from .view_inst_verification import GenerateInstVerificationPDF, SuggestDocRec

    # ---------------------------------------------
    # ROUTER REGISTRATIONS
    # ---------------------------------------------

    router = DefaultRouter()
    router.register(r'holidays', HolidayViewSet, basename='holidays')
    router.register(r'student-search', StudentSearchViewSet, basename='student-search')
    router.register(r'degrees', StudentDegreeViewSet, basename='degrees')
    router.register(r'convocations', ConvocationMasterViewSet, basename='convocations')
    router.register(r'inventory-items', InventoryItemViewSet, basename='inventory-items')
    router.register(r'inventory-inward', InventoryInwardViewSet, basename='inventory-inward')
    router.register(r'inventory-outward', InventoryOutwardViewSet, basename='inventory-outward')
    router.register(r'modules', ModuleViewSet, basename='modules')
    router.register(r'menus', MenuViewSet, basename='menus')
    router.register(r'userpermissions', UserPermissionViewSet, basename='userpermissions')
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

    # EMPLOYEE + LEAVE
    router.register(r'empprofile', EmpProfileViewSet, basename='empprofile')
    router.register(r'leaveentry', LeaveEntryViewSet, basename='leaveentry')

    # ---------------------------------------------
    # URL PATTERNS (NO RAW SQL, NO SEEDING)
    # ---------------------------------------------

    urlpatterns = [

        # First: DocRec next ID endpoint
        path('docrec/next-id/', DocRecViewSet.as_view({"get": "next_id"}), name='docrec-next-id'),

        # Router URLs
        path("", include(router.urls)),

        # JWT LOGIN
        path("backlogin/", CustomTokenObtainPairView.as_view(), name="backlogin"),
        path("token/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
        path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
        path("token/verify/", TokenVerifyView.as_view(), name="token_verify"),

        # USER LOGIN
        path("userlogin/", LoginView.as_view(), name="userlogin"),
        path("check-admin-access/", CheckAdminAccessView.as_view(), name="check_admin_access"),

        # PASSWORD
        path("change-password/", ChangePasswordView.as_view(), name="change-password"),
        path("users/<int:user_id>/change-password/", AdminChangePasswordView.as_view(), name="admin-change-password"),

        # PROFILE MGMT
        path("profile/", UserProfileView.as_view(), name="user-profile"),
        path("verify-password/", VerifyPasswordView.as_view(), name="verify-password"),
        path("verify-admin-panel-password/", VerifyAdminPanelPasswordView.as_view(), name="verify-admin-panel-password"),
        path("profile-picture/", ProfilePictureView.as_view(), name="profile-picture"),

        # INST VERIFICATION
        path("inst-verification/generate-pdf/", GenerateInstVerificationPDF.as_view(), name="inst-verification-generate-pdf"),
        path("inst-verification/suggest-doc-rec/", SuggestDocRec.as_view(), name="inst-verification-suggest-doc-rec"),

        # LEAVE SYSTEM (UPDATED — CLEAN)
        path("leave-periods/", LeavePeriodListView.as_view(), name="leave-periods"),
        path("leave-allocations/", LeaveAllocationListView.as_view(), name="leave-allocations"),
        path("leave-allocations/<int:pk>/", LeaveAllocationDetailView.as_view(), name="leave-allocation-detail"),
        path("my-leave-balance/", MyLeaveBalanceView.as_view(), name="my-leave-balance"),
        path("leave-report/", LeaveReportView.as_view(), name="leave-report"),
        
        # LIVE BALANCE ENGINE
        path("leave-balance/current/", CurrentLeaveBalanceView.as_view(), name="leave-balance-current"),
        path("leave-balance/period/<int:period_id>/", PeriodLeaveBalanceView.as_view(), name="leave-balance-period"),
        path("leave-balance/history/", LeaveHistoryView.as_view(), name="leave-balance-history"),
        path("leave-balance/report/", LeaveBalanceReportView.as_view(), name="leave-balance-report"),

        # USER MANAGEMENT (AUTH USERS)
        path("users/", UserAPIView.as_view(), name="user-list-create"),
        path("users/<int:user_id>/", UserDetailAPIView.as_view(), name="user-detail"),

        # MENUS BY MODULE
        path("modules/<int:module_id>/menus/", MenuViewSet.as_view({"get": "menus_by_module"}), name="menus-by-module"),

        # UPLOAD & ANALYSIS
        path("bulk-upload/", BulkUploadView.as_view(), name="bulk-upload"),
        path("data-analysis/", DataAnalysisView.as_view(), name="data-analysis"),

        # INVENTORY REPORT
        path("inventory-stock-summary/", StockSummaryView.as_view(), name="inventory-stock-summary"),

        # ADMIN DOCREC UPLOAD
        path("admin/upload-docrec/", UploadDocRecView.as_view(), name="admin-upload-docrec"),

    ] + IN_OUT_REGISTER_URLS

except Exception as e:
    import traceback
    error_text = str(e)
    print("[api.urls] Import error:", error_text)
    traceback.print_exc()

    def api_unavailable(request, *args, **kwargs):
        return HttpResponse(
            f"API unavailable: {error_text}",
            status=503,
            content_type="text/plain",
        )

    urlpatterns = [
        path("", api_unavailable),
    ]
