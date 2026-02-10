# backend/api/urls.py
from django.urls import path, include
from django.http import HttpResponse

try:
    from rest_framework.routers import DefaultRouter
    from rest_framework_simplejwt.views import (
        TokenRefreshView,
        TokenVerifyView,
    )

    # Import ViewSets / Views
    from .views_courses import (
        ModuleViewSet, MenuViewSet, UserPermissionViewSet,
        InstituteCourseOfferingViewSet, MainBranchViewSet,
        SubBranchViewSet, InstituteViewSet,
    )
    from .views_enrollment import (
        EnrollmentViewSet, AdmissionCancelViewSet, EnrollmentStatsView,
    )

    from .views_mail_request import GoogleFormSubmissionViewSet
    from .view_transcript_generate import TranscriptRequestViewSet

    from .views import (
        DocRecViewSet, VerificationViewSet, MigrationRecordViewSet,
        ProvisionalRecordViewSet, InstVerificationMainViewSet,
        InstVerificationStudentViewSet, StudentProfileViewSet,
        EcaViewSet, BulkUploadView, DataAnalysisView,
    )

    from .inventory import (
        InventoryItemViewSet, InventoryInwardViewSet,
        InventoryOutwardViewSet, StockSummaryView
    )

    from .cash_register import (
        FeeTypeViewSet,
        CashRegisterViewSet,
        ReceiptViewSet,
        UploadCashExcelView,CashOnHandReportView,CloseCashDayView,CashOutwardViewSet
    )

    from .views_admin import UploadDocRecView
    from django.http import JsonResponse


    # EMPLOYEE / LEAVE MANAGEMENT (OPTION A) - main views
    from .views_emp import (
        LeavePeriodViewSet,
        LeaveAllocationListView,
        LeaveAllocationDetailView,
        LeaveReportView,
        MyLeaveBalanceView,
        EmpProfileViewSet,
        LeaveEntryViewSet,
        LeaveTypeViewSet,
    )
    
    # NEW: Leave Report Views (4 modes)
    from .views_leave_reports import (
        EmployeeSummaryView,
        EmployeeDateRangeView,
        EmployeeMultiYearView,
        AllEmployeesBalanceView,
    )

    from .views_student_search import StudentSearchViewSet
    from .views_degree import StudentDegreeViewSet, ConvocationMasterViewSet
    from .views_student_fees import StudentFeesViewSet
    from .views_auth import (
        HolidayViewSet, LoginView, ChangePasswordView, UserProfileView,
        VerifyPasswordView, VerifyAdminPanelPasswordView, CustomTokenObtainPairView,
        ProfilePictureView, CheckAdminAccessView, MyNavigationView,
        DashboardPreferenceView,
        UserAPIView, UserDetailAPIView, AdminChangePasswordView
    )

    from .in_out_register import IN_OUT_REGISTER_URLS
    from .views_Letter import InstLetterPDF, SuggestDocRec, DebugInstLetter


    router = DefaultRouter()
    # Core router registrations
    router.register(r'holidays', HolidayViewSet, basename='holidays')
    router.register(r'student-search', StudentSearchViewSet, basename='student-search')
    router.register(r'student-fees', StudentFeesViewSet, basename='student-fees')
    router.register(r'degrees', StudentDegreeViewSet, basename='degrees')
    router.register(r'convocations', ConvocationMasterViewSet, basename='convocations')
    router.register(r'inventory-items', InventoryItemViewSet, basename='inventory-items')
    router.register(r'inventory-inward', InventoryInwardViewSet, basename='inventory-inward')
    router.register(r'inventory-outward', InventoryOutwardViewSet, basename='inventory-outward')
    router.register(r'fee-types', FeeTypeViewSet, basename='fee-types')
    router.register(r'cash-register', CashRegisterViewSet, basename='cash-register')
    router.register(r'receipts', ReceiptViewSet, basename='receipts')
    router.register(r'modules', ModuleViewSet, basename='modules')
    router.register(r'menus', MenuViewSet, basename='menus')
    router.register(r'userpermissions', UserPermissionViewSet, basename='userpermissions')
    router.register(r'institute-course-offerings', InstituteCourseOfferingViewSet, basename='institute-course-offerings')
    router.register(r'mainbranch', MainBranchViewSet, basename='mainbranch')
    router.register(r'subbranch', SubBranchViewSet, basename='subbranch')
    router.register(r'institutes', InstituteViewSet, basename='institutes')
    router.register(r'enrollments', EnrollmentViewSet, basename='enrollments')
    router.register(r'admission-cancel', AdmissionCancelViewSet, basename='admission-cancel')
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
    router.register("cash-outward", CashOutwardViewSet, basename="cash-outward")


    # EMPLOYEE + LEAVE
    router.register(r'empprofile', EmpProfileViewSet, basename='empprofile')
    router.register(r'leavetype', LeaveTypeViewSet, basename='leavetype')
    router.register(r'leave-periods', LeavePeriodViewSet, basename='leave-periods')
    router.register(r'leaveentry', LeaveEntryViewSet, basename='leaveentry')

    urlpatterns = [

        # Router URLs
      
        path("health/", lambda r: JsonResponse({"status": "ok"})),
       

        # JWT LOGIN
        path("backlogin/", CustomTokenObtainPairView.as_view(), name="backlogin"),
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

        # INST LETTER (renamed from inst-verification)
        path("inst-letter/generate-pdf/", InstLetterPDF.as_view(), name="inst-letter-generate-pdf"),
        path("inst-letter/suggest-doc-rec/", SuggestDocRec.as_view(), name="inst-letter-suggest-doc-rec"),
        path("inst-letter/debug/", DebugInstLetter.as_view(), name="inst-letter-debug"),

        # Legacy aliases (kept temporarily to avoid breaking older clients)
        path("inst-verification/generate-pdf/", InstLetterPDF.as_view(), name="inst-verification-generate-pdf"),
        path("inst-verification/suggest-doc-rec/", SuggestDocRec.as_view(), name="inst-verification-suggest-doc-rec"),
        path("inst-verification/debug/", DebugInstLetter.as_view(), name="inst-verification-debug"),

        # LEAVE SYSTEM (OPTION A)
        path("leave-allocations/", LeaveAllocationListView.as_view(), name="leave-allocations"),
        path("leave-allocations/<int:pk>/", LeaveAllocationDetailView.as_view(), name="leave-allocation-detail"),
        path("my-leave-balance/", MyLeaveBalanceView.as_view(), name="my-leave-balance"),
        path("leave-report/", LeaveReportView.as_view(), name="leave-report"),
        
        # NEW: Leave Report Modes
        path("leave-report/employee-summary/", EmployeeSummaryView.as_view(), name="employee-summary"),
        path("leave-report/employee-range/", EmployeeDateRangeView.as_view(), name="employee-range"),
        path("leave-report/multi-year/", EmployeeMultiYearView.as_view(), name="employee-multi-year"),
        path("leave-report/all-employees-balance/", AllEmployeesBalanceView.as_view(), name="all-employees-balance"),

        # USER MANAGEMENT
        path("users/", UserAPIView.as_view(), name="user-list-create"),
        path("users/<int:user_id>/", UserDetailAPIView.as_view(), name="user-detail"),
        path("dashboard-preferences/", DashboardPreferenceView.as_view(), name="dashboard-preferences"),
        path("my-navigation/", MyNavigationView.as_view(), name="my-navigation"),

        # MENUS BY MODULE
        path("modules/<int:module_id>/menus/", MenuViewSet.as_view({"get": "menus_by_module"}), name="menus-by-module"),

        # UPLOAD & ANALYSIS
        path("bulk-upload/", BulkUploadView.as_view(), name="bulk-upload"),
        path("data-analysis/", DataAnalysisView.as_view(), name="data-analysis"),

        # INVENTORY REPORT
        path("inventory-stock-summary/", StockSummaryView.as_view(), name="inventory-stock-summary"),

        # ADMIN DOCREC UPLOAD
        path("admin/upload-docrec/", UploadDocRecView.as_view(), name="admin-upload-docrec"),
        path("admin/upload-cash-excel/", UploadCashExcelView.as_view(), name="admin-upload-cash-excel"),
        path("cash-on-hand/report/", CashOnHandReportView.as_view()),
        path("cash-on-hand/close/", CloseCashDayView.as_view()),
        path("enrollment-stats/", EnrollmentStatsView.as_view(), name="enrollment-stats"),
        path("", include(router.urls)),

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
