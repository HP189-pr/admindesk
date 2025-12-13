# AdminDesk - Complete System Documentation
**Django 5.2.3 + React + Vite + DRF + PostgreSQL**  
*Last Updated: December 13, 2025*

---

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture & Workflow](#architecture--workflow)
4. [Recent Updates](#recent-updates)
5. [Backend API Documentation](#backend-api-documentation)
6. [Frontend Application](#frontend-application)
7. [Authentication & Authorization](#authentication--authorization)
8. [Database Models](#database-models)
9. [Django Admin Interface](#django-admin-interface)
10. [Data Analysis Features](#data-analysis-features)
11. [Google Sheets Integration](#google-sheets-integration)
12. [Deployment & Operations](#deployment--operations)

---

## 🎯 System Overview

**AdminDesk** is a comprehensive university administration system managing:
- **Student Services**: Verification, Migration, Provisional, Degree, Enrollment
- **Document Management**: Document Receipt, Institutional Verification
- **Office Management**: Official Mail Requests, Transcript Requests (Google Sheets sync)
- **Leave Management**: Employee leave tracking, balance, allocations
- **User Management**: Role-based access control, user rights, profile management
- **Analytics**: Custom dashboards, reports, data analysis

**Key Features:**
- ✅ Real-time Google Sheets bidirectional sync
- ✅ Excel bulk upload functionality
- ✅ Role-based access control (RBAC)
- ✅ Custom dashboards per user role
- ✅ PDF generation for certificates
- ✅ Comprehensive audit logging
- ✅ RESTful API with JWT authentication

---

## 🔧 Technology Stack

### Backend
- **Framework**: Django 5.2.3
- **API**: Django REST Framework (DRF)
- **Database**: PostgreSQL
- **Authentication**: JWT (djangorestframework-simplejwt)
- **Google Integration**: gspread (Google Sheets API)
- **File Processing**: pandas, openpyxl (Excel)
- **PDF Generation**: reportlab, WeasyPrint

### Frontend
- **Framework**: React 18+
- **Build Tool**: Vite (Dev Server: port 5173)
- **Styling**: Tailwind CSS + PostCSS
- **HTTP Client**: Axios with JWT interceptors
- **Routing**: React Router DOM
- **State Management**: React Hooks (useState, useEffect)

### DevOps
- **Version Control**: Git (GitHub: HP189-pr/admindesk)
- **Server**: Windows Server (PowerShell)
- **Ports**: 
  - Backend: 127.0.0.1:8000 (Django)
  - Frontend: localhost:5173 (Vite Dev Server)
- **Database**: PostgreSQL (local)

---

## 🏗️ Architecture & Workflow

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                          │
│            React App (localhost:5173)                       │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │Dashboard │ Verify   │ Degree   │ Doc Reg  │ Reports  │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTP/HTTPS (JWT Token)
┌─────────────────────────────────────────────────────────────┐
│                    API GATEWAY                              │
│           Django REST Framework (127.0.0.1:8000)            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Authentication Middleware (JWT Verification)        │   │
│  │  CORS Middleware (localhost:5173, 8000)              │   │
│  │  Activity Logging Middleware                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              API Endpoints (ViewSets)                │   │
│  │  • Student Services (Verification, Degree, etc.)     │   │
│  │  • Document Management (Doc Rec, Inst Verification)  │   │
│  │  • Office Management (Mail Requests, Transcripts)    │   │
│  │  • Leave Management (Employee Leave System)          │   │
│  │  • Inventory (In/Out Register with Auto-numbering)   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ ORM (Django Models)
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Tables: Users, Students, DocRec, Verification,       │   │
│  │         Degree, Leave, Inventory, Logs, etc.         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ External Integrations
┌─────────────────────────────────────────────────────────────┐
│              Google Sheets (Transcript Requests)            │
│              File Storage (Media: PDFs, Images)             │
└─────────────────────────────────────────────────────────────┘
```

### Request/Response Workflow

**1. User Authentication Flow:**
```
User Login → React Form → POST /api/backlogin/
                              ↓
                    Django Authentication Backend
                              ↓
                    JWT Token Generation (Access + Refresh)
                              ↓
                    Token stored in localStorage
                              ↓
                    All API calls include: Authorization: Bearer <token>
```

**2. Data Fetch Flow (Example: Verification List):**
```
React Component Mount → useEffect hook
                              ↓
                    axiosInstance.get('/api/verification/')
                              ↓
                    JWT interceptor adds token header
                              ↓
                    Django Middleware validates token
                              ↓
                    VerificationViewSet.list() executes
                              ↓
                    QuerySet filtered by user permissions
                              ↓
                    Serializer converts models to JSON
                              ↓
                    Response → React setState → UI Render
```

**3. Form Submission Flow (Example: Create Doc Rec):**
```
User fills form → Submit button click
                              ↓
                    React validation (required fields)
                              ↓
                    POST /api/docrec/ with JSON payload
                              ↓
                    JWT Authentication check
                              ↓
                    DRF Serializer validation
                              ↓
                    DocRecViewSet.create() → model.save()
                              ↓
                    Signal triggers (auto-create Verification/IV/etc.)
                              ↓
                    Auto-generate doc_rec_id (e.g., vr_25_0931)
                              ↓
                    Success Response → Toast notification
                              ↓
                    Refresh list or redirect
```

**4. Permission-Based Access Flow:**
```
User clicks "Inventory" menu
                              ↓
                    React Router → /inventory route
                              ↓
                    AuthInventory wrapper loads
                              ↓
                    Check localStorage for JWT token
                              ↓
                    GET /api/userpermissions/
                              ↓
                    Check if 'inventory' module in permissions
                    OR user.is_superuser === true
                              ↓
        ┌─────────────────────┴──────────────────────┐
        │                                             │
   ✓ Allowed                                    ✗ Denied
        │                                             │
Render <Inventory />                    Show "Access Denied"
```

**5. Auto-Number Generation Flow (Inward/Outward Register):**
```
User selects "Internal" type in Inward Register form
                              ↓
                    onChange handler triggers
                              ↓
                    GET /api/inward-register/next-number/?rec_type=Internal
                              ↓
                    Backend queries: InwardRegister.objects
                        .filter(inward_no__startswith='25/Internal/')
                        .order_by('-inward_no')
                        .first()
                              ↓
                    Extract sequence number (e.g., 25/Internal/0005 → 5)
                              ↓
                    Calculate next: 6 → format: 25/Internal/0006
                              ↓
                    Return: {last_no: "25/Internal/0005", next_no: "25/Internal/0006"}
                              ↓
                    React displays: "Last: 25/Internal/0005, Next: 25/Internal/0006"
                              ↓
                    User submits form → Backend assigns next_no to new record
```

---

## 🆕 Recent Updates

### December 13, 2025

#### 1. **Navigation Permissions Endpoint Restored**
- Added `path("my-navigation/", MyNavigationView.as_view())` to `backend/api/urls.py` so `/api/my-navigation/` responds again for React modules (mail requests, transcript requests, enrollment) that fetch rights via `axios.get(`${API_BASE_URL}/api/my-navigation/)`.
- No serializer or view changes were required; the route now exposes the existing `MyNavigationView` which aggregates module/menu rights (admin users still inherit full access).
- Recommended test: `curl -H "Authorization: Bearer <token>" http://127.0.0.1:8000/api/my-navigation/` should return modules/menus JSON with rights flags.

#### 2. **Leave Calendar Palette & UX Alignment**
- Unified the `LEAVE_COLOR_MAP` defaults across backend (`backend/reports/utils/leave_calendar.py`), React (`src/report/LeaveCalendar.jsx`), and chip styles (`src/styles/index.css`).
- Holidays now render with the requested medium light green (`#C6E0B4`) and sandwich-only days keep a transparent background while showing a highlighted border for easier spotting.
- Table cells now derive weekend/holiday colors solely from the shared color map, so the color legend always matches rendered cells.

---

### December 9, 2025

#### 1. **Inward/Outward Register Enhancements**
- **Changed Record Types**: Updated dropdown options from "Inward/Outward" to "Internal/External"
  - Backend: Modified `REC_TYPE_CHOICES` and `SEND_TYPE_CHOICES` in `in_out_register.py`
  - Frontend: Updated form dropdowns in `inout_register.jsx`
  - Database: Migration 0051 applied

- **Next Number Preview**: Added live preview of last and next record numbers
  - Backend: Implemented `@action` endpoints:
    - `/api/inward-register/next-number/?rec_type=<type>`
    - `/api/outward-register/next-number/?send_type=<type>`
  - Frontend: 
    - Created `getNextInwardNumber()` and `getNextOutwardNumber()` in `inoutService.js`
    - Added real-time display: "Last inward no: X, Next Inward: Y"
    - Auto-refreshes on type change and after successful submission
  - Format: `YY/TYPE/NNNN` (e.g., 25/Internal/0001)

#### 2. **Authentication & Authorization System**
- **Created Permission Wrappers**: Implemented module-level access control
  - `src/hooks/AuthInventory.jsx`: Permission wrapper for Inventory module
  - `src/hooks/AuthDocRegister.jsx`: Permission wrapper for Doc Register module
  - Pattern: Check JWT token → Fetch user permissions → Validate module access → Render component or show "Access Denied"
  
- **Permission Check Flow**:
  ```javascript
  // Check localStorage token
  const token = localStorage.getItem('token');
  
  // Fetch user permissions
  const response = await fetch('http://127.0.0.1:8000/api/userpermissions/', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Validate module access
  const hasAccess = permissions.some(p => 
    p.module_name.toLowerCase() === 'inventory' || 
    p.module_name.toLowerCase().includes('doc')
  ) || user.is_superuser;
  ```

- **Updated WorkArea Router**: Replaced direct component imports with Auth wrappers
  - Before: `<Inventory />` directly rendered
  - After: `<AuthInventory />` checks permissions first

#### 3. **Backend Configuration Updates**
- **JWT Authentication Priority**: Reordered `REST_FRAMEWORK` settings
  ```python
  'DEFAULT_AUTHENTICATION_CLASSES': [
      'rest_framework_simplejwt.authentication.JWTAuthentication',  # First
      'rest_framework.authentication.SessionAuthentication',        # Second
  ]
  ```
  - Prevents CSRF issues for API-only endpoints
  - Prioritizes token-based auth for React frontend

- **CORS Configuration**: Added localhost origins
  ```python
  CORS_ALLOWED_ORIGINS = [
      "http://localhost:5173",
      "http://127.0.0.1:8000",
      "http://localhost:8000",
  ]
  CSRF_TRUSTED_ORIGINS = [
      "http://localhost:8000",
      "http://127.0.0.1:8000",
  ]
  ```

#### 4. **Code Quality Improvements**
- **Removed Debug Logging**: Cleaned up console.log statements
  - `src/api/axiosInstance.js`: Removed token attachment logs
  - `src/hooks/AuthInventory.jsx`: Removed permission check logs
  - `src/hooks/AuthDocRegister.jsx`: Removed auth flow logs
  - `src/pages/WorkArea.jsx`: Removed routing logs
  - Result: Clean browser console during normal operation

#### 5. **URL Routing Fixes**
- **Explicit Path Registration**: Added explicit URL paths before router.urls
  ```python
  # api/urls.py
  urlpatterns = [
      path('inward-register/next-number/', InwardRegisterViewSet.as_view({'get': 'next_number'})),
      path('outward-register/next-number/', OutwardRegisterViewSet.as_view({'get': 'next_number'})),
      path('docrec/next-id/', DocRecViewSet.as_view({'get': 'next_id'})),
      # ... router.urls comes after
  ]
  ```
  - Ensures custom @action endpoints take precedence over detail routes

#### 6. **Known Issues & Workarounds**
- **Doc Receive Next-ID Preview**: Temporarily disabled due to 500 error
  - Issue: `/api/docrec/next-id/` endpoint returns 500 Internal Server Error
  - Root cause: Under investigation (Django traceback not appearing)
  - Workaround: Commented out useEffect in `doc-receive.jsx`
  - Impact: None - form works correctly; backend auto-generates IDs on save
  - Status: Non-critical; deferred for future debugging

---

## 🏗️ Backend Architecture

### Backend Structure
```
backend/
├── api/
│   ├── domain_*.py          # Domain models (modular)
│   ├── serializers_*.py     # DRF serializers
│   ├── views_*.py           # API ViewSets
│   ├── urls.py              # API routing
│   ├── admin.py             # Django Admin config
│   ├── sheets_sync.py       # Google Sheets sync
│   ├── signals.py           # Model signals
│   ├── middleware_logs.py   # Activity logging
│   └── management/
│       └── commands/        # Management commands
├── backend/
│   ├── settings.py          # Django settings
│   └── urls.py              # Root URL config
└── manage.py
```

### Frontend Structure
```
src/
├── pages/                   # Main pages (Dashboard, Verification, etc.)
├── components/              # Reusable components
├── services/                # API service layer
├── hooks/                   # Custom React hooks
├── Menu/                    # Sidebar navigation
├── api/                     # API configuration
└── utils/                   # Utility functions
```

---

## 🔌 Backend API Documentation

### Base URL
```
http://127.0.0.1:8000/api/
```

### Authentication Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/backlogin/` | POST | User login (JWT token) |
| `/api/token/refresh/` | POST | Refresh JWT token |
| `/api/token/verify/` | POST | Verify JWT token |
| `/api/change-password/` | POST | Change user password |
| `/api/profile/` | GET/PUT | User profile management |
| `/api/profile-picture/` | POST | Upload profile picture |

### Student Services Endpoints

#### 1. **Verification** (`/api/verification/`)
- **Purpose**: Manage student document verification records
- **Features**: 
  - Auto-sync with Doc Rec
  - Date tracking (doc_rec_date, vr_done_date)
  - Status workflow (IN_PROGRESS, DONE, REJECTED)
- **Methods**: GET, POST, PUT, DELETE
- **Filters**: enrollment_no, status, date_range
- **Frontend Page**: `verification.jsx`

#### 2. **Migration** (`/api/migration/`)
- **Purpose**: Manage student migration records
- **Features**: Migration certificate generation, status tracking
- **Methods**: GET, POST, PUT, DELETE
- **Frontend Page**: `Migration.jsx`

#### 3. **Provisional** (`/api/provisional/`)
- **Purpose**: Provisional certificate management
- **Features**: Provisional certificate issuance, tracking
- **Methods**: GET, POST, PUT, DELETE
- **Frontend Page**: `Provisional.jsx`

#### 4. **Enrollment** (`/api/enrollments/`)
- **Purpose**: Student enrollment management
- **Features**: Enrollment creation, course assignment
- **Methods**: GET, POST, PUT, DELETE
- **Frontend Page**: `Enrollment.jsx`

#### 5. **Degree** (`/api/degrees/`)
- **Purpose**: Degree certificate management
- **Features**: Degree issuance, convocation management
- **Methods**: GET, POST, PUT, DELETE
- **Related**: `/api/convocations/` (Convocation master data)
- **Frontend Page**: `Degree.jsx`

#### 6. **Student Search** (`/api/student-search/`)
- **Purpose**: Advanced student search across all records
- **Features**: Multi-field search, fuzzy matching
- **Method**: POST (search query)
- **Frontend Page**: `student-search.jsx`

### Document Management Endpoints

#### 7. **Document Receipt** (`/api/docrec/`)
- **Purpose**: Track all incoming documents
- **Features**: 
  - Auto-create service records (Verification/IV/Migration)
  - Document ID generation (e.g., vr_25_0931)
  - Excel bulk upload
  - Next ID preview (temporarily disabled)
- **Methods**: GET, POST, PUT, DELETE
- **Admin Upload**: `/api/admin/upload-docrec/`
- **Next ID Endpoint**: `/api/docrec/next-id/?apply_for=<type>` (under maintenance)
- **Frontend Page**: `doc-receive.jsx`

#### 8. **Inward/Outward Register** (`/api/inward-register/`, `/api/outward-register/`)
- **Purpose**: Track internal and external correspondence
- **Features**:
  - Record type options: "Internal" or "External"
  - Auto-number generation: YY/TYPE/NNNN format
  - Next number preview API
  - Date tracking (received_date, sent_date)
- **Methods**: GET, POST, PUT, DELETE
- **Next Number Endpoints**:
  - `/api/inward-register/next-number/?rec_type=<Internal|External>`
  - `/api/outward-register/next-number/?send_type=<Internal|External>`
- **Response Format**:
  ```json
  {
    "last_no": "25/Internal/0005",
    "next_no": "25/Internal/0006"
  }
  ```
- **Frontend Page**: `inout_register.jsx`
- **Service**: `inoutService.js`

#### 9. **Institutional Verification** (`/api/inst-verification-main/`, `/api/inst-verification-student/`)
- **Purpose**: University-to-university verification
- **Features**:
  - Main record management
  - Student list per verification
  - PDF generation
  - Doc Rec suggestion API
- **Methods**: GET, POST, PUT, DELETE
- **PDF Generation**: `/api/inst-verification/generate-pdf/`
- **Suggest Doc Rec**: `/api/inst-verification/suggest-doc-rec/`
- **Frontend Page**: `Inst-Verification.jsx`

### Office Management Endpoints

#### 10. **Official Mail Requests** (`/api/mail-requests/`)
- **Purpose**: Track official correspondence from Google Form submissions
- **Features**:
  - Google Sheets bidirectional sync
  - Status tracking (Pending, Completed, Rejected)
  - Request number auto-generation
- **Sync Pattern**: Direct update in ViewSet (no signals)
- **Methods**: GET, POST, PUT, DELETE
- **Frontend Page**: `mail_request.jsx`
- **Purpose**: Track official correspondence from Google Form submissions
- **Features**:
  - Google Sheets bidirectional sync
  - Status tracking (Pending, Completed, Rejected)
  - Request number auto-generation
- **Sync Pattern**: Direct update in ViewSet (no signals)
- **Methods**: GET, POST, PUT, DELETE
- **Frontend Page**: `mail_request.jsx`

#### 10. **Transcript Requests** (`/api/transcript-requests/`)
- **Purpose**: Manage transcript requests from Google Sheets
- **Features**:
  - Google Sheets bidirectional sync (same pattern as mail requests)
  - Batch API calls to avoid quota limits
  - Composite key matching (tr_request_no + requested_at)
  - Status: mail_status, transcript_remark, pdf_generate
- **Sync Pattern**: Direct update in ViewSet.update() method
- **Methods**: GET, POST, PUT, DELETE
- **Key Fields**: tr_request_no (NOT NULL), enrollment_no, student_name, institute_name
- **Frontend Page**: `transcript_request.jsx`
- **Documentation**: `TRANSCRIPT_SYNC_PATTERN.md`

### Leave Management Endpoints

#### 11. **Employee Profile** (`/api/empprofile/`)
- **Purpose**: Employee master data
- **Features**: Leave balance tracking (EL, SL, CL, Vacation)
- **Methods**: GET, POST, PUT, DELETE
- **Frontend Page**: `emp-leave.jsx`

#### 12. **Leave Types** (`/api/leavetype/`)
- **Purpose**: Define leave categories (EL, SL, CL, etc.)
- **Features**: Annual allocation, active/inactive status
- **Methods**: GET, POST, PUT, DELETE

#### 13. **Leave Periods** (`/api/leaveperiods/`)
- **Purpose**: Define leave accounting periods
- **Features**: Period activation, start/end dates
- **Methods**: GET, POST, PUT, DELETE

#### 14. **Leave Entry** (`/api/leaveentry/`)
- **Purpose**: Leave application records
- **Features**: Leave approval workflow, balance deduction
- **Methods**: GET, POST, PUT, DELETE

#### 15. **Leave Allocations** (`/api/leave-allocations/`)
- **Purpose**: Assign leave quotas per employee
- **Features**: Auto-allocation via seed command
- **Methods**: GET, POST, PUT, DELETE

#### 16. **Leave Balance** (`/api/my-leave-balance/`)
- **Purpose**: Real-time leave balance for logged-in user
- **Method**: GET

#### 17. **Leave Report** (`/api/leave-report/`)
- **Purpose**: Generate leave reports
- **Method**: GET (with filters)

### User Management Endpoints

#### 18. **Users** (`/api/users/`)
- **Purpose**: User CRUD operations
- **Features**: User creation, password management
- **Methods**: GET, POST, PUT, DELETE
- **Change Password**: `/api/users/<id>/change-password/`

#### 19. **My Navigation** (`/api/my-navigation/`)
- **Purpose**: Get menu items based on user permissions
- **Method**: GET
- **Returns**: Modules, Menus, User Rights

#### 20. **User Permissions** (`/api/userpermissions/`)
- **Purpose**: Manage user access rights
- **Features**: Module-level, menu-level permissions
- **Methods**: GET, POST, PUT, DELETE

### Course & Institute Management

#### 21. **Modules** (`/api/modules/`)
- **Purpose**: System module definitions
- **Methods**: GET, POST, PUT, DELETE

#### 22. **Menus** (`/api/menus/`)
- **Purpose**: Menu items within modules
- **Methods**: GET, POST, PUT, DELETE
- **Get by Module**: `/api/modules/<id>/menus/`

#### 23. **Institutes** (`/api/institutes/`)
- **Purpose**: College/Institute master data
- **Methods**: GET, POST, PUT, DELETE

#### 24. **Main Branch** (`/api/mainbranch/`)
- **Purpose**: Main course branches (e.g., Engineering)
- **Methods**: GET, POST, PUT, DELETE

#### 25. **Sub Branch** (`/api/subbranch/`)
- **Purpose**: Detailed course specializations
- **Methods**: GET, POST, PUT, DELETE

#### 26. **Institute Course Offerings** (`/api/institute-course-offerings/`)
- **Purpose**: Link institutes with courses they offer
- **Methods**: GET, POST, PUT, DELETE

### Utility Endpoints

#### 27. **Bulk Upload** (`/api/bulk-upload/`)
- **Purpose**: Bulk upload via Excel
- **Method**: POST (multipart/form-data)
- **Supports**: Enrollment, Verification, Migration, etc.

#### 28. **Data Analysis** (`/api/data-analysis/`)
- **Purpose**: Generate analytics and reports for various services
- **Method**: GET
- **Frontend Page**: Admin Panel → Data Analysis
- **Supported Services**:
  - **Enrollment**: Duplicate detection, statistics
  - **Verification**: Record analysis
  - **Migration**: Data validation
  - **Provisional**: Record checking
  - **Degree**: Advanced duplicate detection with filters

##### **Degree Data Analysis**
- **Endpoint**: `/api/data-analysis/?service=Degree`
- **Purpose**: Detect duplicate degree records and analyze data quality
- **Features**:
  - **Duplicate Detection**: Find duplicate degree records based on:
    - Enrollment Number
    - Student Name
    - Exam Month
    - Exam Year
    - Convocation Number
  - **Advanced Filtering**:
    - Filter by Exam Month (01-12)
    - Filter by Exam Year (2015-2025+)
    - Filter by Convocation Number
    - Filter by Institute
    - Filter by Course/Branch
  - **Group By Options**:
    - Group by Enrollment Number (default)
    - Group by Student Name + Exam Details
    - Group by Convocation
  - **Analysis Output**:
    - Total records count
    - Duplicate groups count
    - Records with duplicates count
    - List of duplicate groups with details
    - Statistics per filter criteria
- **Query Parameters**:
  ```
  ?service=Degree
  &exam_month=05              # Filter by exam month (optional)
  &exam_year=2023             # Filter by exam year (optional)
  &convocation_no=45          # Filter by convocation (optional)
  &institute_id=<id>          # Filter by institute (optional)
  &group_by=enrollment        # Group by field (optional)
  ```
- **Response Format**:
  ```json
  {
    "service": "Degree",
    "total_records": 15000,
    "duplicate_groups": 45,
    "records_with_duplicates": 120,
    "filters_applied": {
      "exam_month": "05",
      "exam_year": "2023",
      "convocation_no": "45"
    },
    "duplicates": [
      {
        "enrollment_no": "202301001",
        "student_name": "John Doe",
        "count": 3,
        "records": [
          {
            "id": 1234,
            "enrollment_no": "202301001",
            "student_name": "John Doe",
            "exam_month": "05",
            "exam_year": "2023",
            "convocation_no": "45",
            "degree_date": "2023-06-15",
            "institute": "College of Engineering"
          }
        ]
      }
    ],
    "statistics": {
      "by_exam_month": {"05": 120, "11": 85},
      "by_exam_year": {"2023": 205},
      "by_convocation": {"45": 205}
    }
  }
  ```
- **Use Cases**:
  - Identify duplicate degree entries before convocation
  - Data quality checks before certificate printing
  - Audit degree records for specific exam sessions
  - Validate convocation attendance lists
  - Clean up database inconsistencies

#### 29. **Holidays** (`/api/holidays/`)
- **Purpose**: Manage holiday calendar
- **Methods**: GET, POST, PUT, DELETE

---

## 🖥️ Frontend Application

### Pages Overview

| Page | Path | Purpose | Backend API |
|------|------|---------|-------------|
| **Login** | `/login` | User authentication | `/api/backlogin/` |
| **Home Dashboard** | `/home` | Main landing page | `/api/my-navigation/` |
| **Work Area** | `/work` | Task management dashboard | Multiple APIs |
| **Verification** | `/verification` | Document verification | `/api/verification/` |
| **Migration** | `/migration` | Migration certificates | `/api/migration/` |
| **Provisional** | `/provisional` | Provisional certificates | `/api/provisional/` |
| **Enrollment** | `/enrollment` | Student enrollment | `/api/enrollments/` |
| **Degree** | `/degree` | Degree management | `/api/degrees/` |
| **Doc Receive** | `/doc-receive` | Document receipt | `/api/docrec/` |
| **Inst Verification** | `/inst-verification` | Institutional verification | `/api/inst-verification-main/` |
| **Mail Request** | `/mail-request` | Official mail tracking | `/api/mail-requests/` |
| **Transcript Request** | `/transcript-request` | Transcript requests | `/api/transcript-requests/` |
| **Employee Leave** | `/emp-leave` | Leave management | `/api/leaveentry/` |
| **Student Search** | `/student-search` | Advanced search | `/api/student-search/` |

### Components

| Component | Purpose |
|-----------|---------|
| **AdminDashboard** | Admin control panel |
| **AdminBulkUpload** | Excel bulk upload interface |
| **PageTopbar** | Top navigation bar |
| **Sidebar** | Side navigation menu |
| **ProfileUpdate** | User profile editing |
| **VerificationUpload** | Verification document upload |
| **PrivateRoute** | Protected route wrapper |
| **Clock** | Real-time clock display |

### Services

| Service | Purpose |
|---------|---------|
| **auth.js** | Authentication API calls |
| **axiosInstance.js** | Configured Axios instance with JWT |
| **enrollmentservice.js** | Enrollment API |
| **mailRequestService.js** | Mail request API |
| **transcriptreqService.js** | Transcript request API |
| **empLeaveService.js** | Leave management API |
| **degreeService.js** | Degree API |
| **studentSearchService.js** | Student search API |

---

## 💾 Database Models

### Domain Models (Modular Architecture)

#### **domain_core.py**
- `Module` - System modules (User Management, Reports, etc.)
- `Menu` - Menu items within modules
- `UserPermission` - User access rights
- `Holiday` - Holiday calendar

#### **domain_courses.py**
- `MainBranch` - Main course categories
- `SubBranch` - Course specializations
- `Institute` - College/Institute master
- `InstituteCourseOffering` - Institute-course mapping

#### **domain_enrollment.py**
- `Enrollment` - Student enrollment records

#### **domain_documents.py**
- `DocRec` - Document receipt master
- `Eca` - ECA (Extra-Curricular Activities)
- `StudentProfile` - Student personal details

#### **domain_verification.py**
- `Verification` - Verification records
- `MigrationRecord` - Migration certificates
- `ProvisionalRecord` - Provisional certificates
- `InstVerificationMain` - Institutional verification main
- `InstVerificationStudent` - IV student list

#### **domain_mail_request.py**
- `GoogleFormSubmission` - Official mail requests from Google Forms

#### **domain_transcript_generate.py**
- `TranscriptRequest` - Transcript requests with Google Sheets sync
- **NOT NULL Fields**: tr_request_no, enrollment_no, student_name, institute_name
- **NULL Allowed**: request_ref_no, transcript_receipt, transcript_remark, submit_mail, pdf_generate, mail_status

#### **domain_degree.py**
- `ConvocationMaster` - Convocation events
- `StudentDegree` - Degree certificate records

#### **domain_emp.py**
- `EmpProfile` - Employee master data
- `LeaveType` - Leave category definitions
- `LeavePeriod` - Leave accounting periods
- `LeaveAllocation` - Leave quotas per employee
- `LeaveEntry` - Leave application records
- `LeaveBalanceSnapshot` - Daily leave balance snapshots

#### **domain_logs.py**
- `UserActivityLog` - User activity audit trail
- `ErrorLog` - System error logging

---

## 🔐 Authentication & Authorization

### JWT Token-Based Authentication

**AdminDesk** uses JWT (JSON Web Token) for stateless authentication between React frontend and Django backend.

#### Authentication Flow

**1. Login Process:**
```javascript
// Frontend: src/pages/Login.jsx
const handleLogin = async (username, password) => {
  const response = await fetch('http://127.0.0.1:8000/api/backlogin/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const data = await response.json();
  
  // Store tokens in localStorage
  localStorage.setItem('token', data.access);
  localStorage.setItem('refresh', data.refresh);
  localStorage.setItem('username', data.username);
  
  // Redirect to dashboard
  navigate('/home');
};
```

**2. Token Attachment (Axios Interceptor):**
```javascript
// src/api/axiosInstance.js
import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: 'http://127.0.0.1:8000',
  timeout: 10000,
});

// Request interceptor - attach JWT token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 errors
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired - redirect to login
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
```

**3. Backend Token Verification:**
```python
# backend/backend/settings.py
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',  # Priority 1
        'rest_framework.authentication.SessionAuthentication',        # Priority 2
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

# JWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=5),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}
```

### Permission-Based Access Control

**AdminDesk** implements module-level and menu-level access control using authentication wrapper components.

#### Auth Wrapper Pattern

**Authentication Wrapper Components:**
- `AuthInventory.jsx` - Controls access to Inventory module
- `AuthDocRegister.jsx` - Controls access to Doc Register module
- `AuthDegree.jsx` - Controls access to Degree module
- Pattern can be extended for any module

**Example: AuthInventory.jsx**
```javascript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Inventory from '../pages/Inventory';

const AuthInventory = () => {
  const [hasAccess, setHasAccess] = useState(null);
  const navigate = useNavigate();
  const API_BASE_URL = 'http://127.0.0.1:8000';

  useEffect(() => {
    const checkPermissions = async () => {
      const token = localStorage.getItem('token');
      
      // Check if user is logged in
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        // Fetch user permissions from backend
        const response = await fetch(`${API_BASE_URL}/api/userpermissions/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) throw new Error('Permission check failed');

        const data = await response.json();
        const permissions = data.permissions || [];
        const user = data.user || {};

        // Check if user has access to inventory module
        const hasInventoryAccess = permissions.some(permission => 
          permission.module_name.toLowerCase() === 'inventory'
        );

        // Admin users have access to all modules
        const isAdmin = user.is_superuser === true;

        setHasAccess(hasInventoryAccess || isAdmin);
        
      } catch (error) {
        console.error('Permission check error:', error);
        setHasAccess(false);
      }
    };

    checkPermissions();
  }, [navigate]);

  // Loading state
  if (hasAccess === null) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Checking permissions...</div>
      </div>
    );
  }

  // Access denied
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p>You do not have permission to access this module.</p>
        </div>
      </div>
    );
  }

  // Access granted - render component
  return <Inventory />;
};

export default AuthInventory;
```

**Using Auth Wrapper in Routes:**
```javascript
// src/pages/WorkArea.jsx
import AuthInventory from '../hooks/AuthInventory';
import AuthDocRegister from '../hooks/AuthDocRegister';

const WorkArea = () => {
  return (
    <Routes>
      {/* Protected routes with permission checking */}
      <Route path="/inventory" element={<AuthInventory />} />
      <Route path="/doc-register" element={<AuthDocRegister />} />
      
      {/* Other routes */}
      <Route path="/verification" element={<Verification />} />
      <Route path="/degree" element={<Degree />} />
    </Routes>
  );
};
```

#### Backend Permission API

**Endpoint:** `/api/userpermissions/`

**Response Format:**
```json
{
  "user": {
    "id": 1,
    "username": "HITENDRA",
    "email": "admin@example.com",
    "is_superuser": true,
    "is_staff": true
  },
  "permissions": [
    {
      "id": 1,
      "module_name": "Inventory",
      "menu_name": "View Inventory",
      "can_view": true,
      "can_add": true,
      "can_edit": true,
      "can_delete": true
    },
    {
      "id": 2,
      "module_name": "Doc Register",
      "menu_name": "Inward Register",
      "can_view": true,
      "can_add": true,
      "can_edit": false,
      "can_delete": false
    }
  ]
}
```

**Backend Implementation:**
```python
# backend/api/views_auth.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_permissions(request):
    user = request.user
    permissions = UserPermission.objects.filter(user=user).select_related('module', 'menu')
    
    return Response({
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'is_superuser': user.is_superuser,
            'is_staff': user.is_staff,
        },
        'permissions': [
            {
                'id': perm.id,
                'module_name': perm.module.module_name,
                'menu_name': perm.menu.menu_name,
                'can_view': perm.can_view,
                'can_add': perm.can_add,
                'can_edit': perm.can_edit,
                'can_delete': perm.can_delete,
            }
            for perm in permissions
        ]
    })
```

### Permission Levels

1. **Superuser (Admin):**
   - Full access to all modules and features
   - Can manage user permissions
   - Access to Django Admin panel

2. **Module-Level Permissions:**
   - `can_view`: View module data
   - `can_add`: Create new records
   - `can_edit`: Modify existing records
   - `can_delete`: Delete records

3. **Menu-Level Permissions:**
   - Fine-grained control within modules
   - Example: User can view degrees but not add/edit

### Security Best Practices

✅ **Implemented:**
- JWT tokens stored in localStorage (not cookies - prevents CSRF)
- Token expiration and refresh mechanism
- CORS configuration restricts origins
- Backend validates all permissions on every API call
- Frontend wrappers provide UX feedback
- Axios interceptors handle token expiration gracefully

⚠️ **Recommendations:**
- Consider httpOnly cookies for enhanced security (trade-off: CORS complexity)
- Implement rate limiting for login endpoint
- Add 2FA for admin users
- Regular token blacklist cleanup

---

## 🔐 Authentication & Authorization (Previous Section Removed)

### JWT Token Flow
2. Server returns `access` and `refresh` tokens
3. Frontend stores tokens in localStorage
4. All API requests include: `Authorization: Bearer <access_token>`
5. Refresh token when access expires

### User Rights System
- **Module-based**: Users assigned to modules (e.g., "Verification", "Leave Management")
- **Menu-based**: Specific menu access within modules
- **UserPermission Model**: Links User → Module → Menu
- **Frontend Check**: `MyNavigationView` returns accessible menus
- **Component Protection**: `PrivateRoute` enforces access control

### Admin Panel Access
- Superuser flag required
- Additional password verification: `/api/verify-admin-panel-password/`
- Admin-only operations: User creation, bulk upload, system settings

---

## ⚙️ Django Admin Interface

### Registered Models

#### **Employee Management**
- **EmpProfile**: Employee master data
  - List Display: emp_id, name, designation, status, leave balances
  - Search: emp_id, name, username
  - Filters: status, department, institute
  
- **LeaveType**: Leave categories
  - List Display: leave_code, leave_name, main_type, annual_allocation, is_active
  - Editable: annual_allocation, is_active
  
- **LeaveEntry**: Leave applications
  - List Display: leave_report_no, emp, leave_type, dates, status
  - Search: report_no, emp_name, leave_type
  - Filters: status, leave_type

- **LeavePeriod**: Leave periods
  - List Display: period_name, start_date, end_date, is_active
  - Editable: is_active

- **LeaveAllocation**: Leave quotas
  - List Display: emp_id, leave_code, period, allocated_cl/sl/el/vac, dates
  - List Editable: All allocation fields (quick edit)
  - Bulk Edit: Update allocations directly in changelist

#### **Document Management**
- **DocRec**: Document receipt records (via domain_documents)
- **Verification**, **Migration**, **Provisional**: Service records
- **InstVerificationMain**, **InstVerificationStudent**: IV records

#### **Course & Institute**
- **Institute**, **MainBranch**, **SubBranch**, **InstituteCourseOffering**
- **Enrollment**: Student enrollment records

#### **Degree & Student**
- **ConvocationMaster**: Convocation events
- **StudentDegree**: Degree certificates
- **StudentProfile**: Student details

#### **Logs**
- **UserActivityLog**: Activity audit (read-only)
- **ErrorLog**: System errors (read-only)

### Excel Upload Function (Admin)
- **Endpoint**: `/api/admin/upload-docrec/`
- **Format**: Excel (.xlsx, .xls) or CSV
- **Features**:
  - Column mapping (flexible headers)
  - Upsert by doc_rec_id (avoid duplicates)
  - Enrollment number normalization (case-insensitive)
  - Batch processing with progress reporting
  - Error handling with row-level feedback

## 📊 Data Analysis Features

### Overview
The Data Analysis module provides comprehensive analytics and duplicate detection across all services. Access via Admin Panel → Data Analysis tab.

### Supported Services
1. **Enrollment** - Student enrollment analytics
2. **Verification** - Document verification statistics
3. **Migration** - Migration record analysis
4. **Provisional** - Provisional certificate data
5. **Degree** - Advanced degree data analysis

### Degree Data Analysis (Featured)

#### Purpose
Detect and analyze duplicate degree records with advanced filtering capabilities to ensure data quality before convocation ceremonies and certificate printing.

#### Access
- **Frontend**: Admin Panel → Data Analysis → Service: Degree → Run Analysis
- **API**: `/api/data-analysis/?service=Degree`

#### Key Features

##### 1. **Duplicate Detection Criteria**
The system identifies duplicates based on:
- **Enrollment Number**: Same student receiving multiple degree records
- **Student Name + Exam Details**: Name similarity with same exam month/year
- **Convocation Number**: Multiple entries for same convocation

##### 2. **Advanced Filters**
- **Exam Month**: Filter by exam month (01-12)
  - Use case: Analyze May (05) or November (11) exam records
- **Exam Year**: Filter by academic year (2015-2025+)
  - Use case: Year-specific data quality checks
- **Convocation Number**: Filter by specific convocation event
  - Use case: Validate convocation attendance lists
- **Institute**: Filter by college/institute
  - Use case: Institute-specific duplicate checks
- **Course/Branch**: Filter by academic program
  - Use case: Department-level analysis

##### 3. **Group By Options**
- **By Enrollment Number** (Default): Find same student with multiple degrees
- **By Student Name**: Detect name variations and typos
- **By Convocation**: Analyze specific convocation events
- **By Exam Details**: Group by exam month + year

##### 4. **Analysis Output**
```json
{
  "service": "Degree",
  "total_records": 15000,
  "duplicate_groups": 45,
  "records_with_duplicates": 120,
  "filters_applied": {
    "exam_month": "05",
    "exam_year": "2023",
    "convocation_no": "45"
  },
  "duplicates": [
    {
      "enrollment_no": "202301001",
      "student_name": "John Doe",
      "count": 3,
      "records": [...]
    }
  ],
  "statistics": {
    "by_exam_month": {"05": 120, "11": 85},
    "by_exam_year": {"2023": 205},
    "by_convocation": {"45": 205}
  }
}
```

#### Common Use Cases

##### 1. **Pre-Convocation Data Validation**
```
Filter: convocation_no=45
Purpose: Verify all degree records for Convocation #45
Action: Identify and resolve duplicates before ceremony
```

##### 2. **Exam-Specific Analysis**
```
Filters: exam_month=05, exam_year=2023
Purpose: Analyze May 2023 exam degree records
Action: Data quality check for specific exam session
```

##### 3. **Institute-Level Audit**
```
Filter: institute_id=<id>, exam_year=2023
Purpose: Annual audit for specific college
Action: Verify degree issuance accuracy
```

##### 4. **Duplicate Cleanup**
```
Filter: group_by=enrollment
Purpose: Find students with multiple degree records
Action: Consolidate or remove duplicate entries
```

#### Workflow

1. **Select Service**: Choose "Degree" from dropdown
2. **Apply Filters**: Set exam month, year, convocation (optional)
3. **Run Analysis**: Click "Run Analysis" button
4. **Review Results**:
   - View total records and duplicate count
   - Examine duplicate groups
   - Check statistics breakdown
5. **Take Action**:
   - Export duplicate list for review
   - Correct data in Degree management page
   - Re-run analysis to verify cleanup

#### API Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `service` | string | Service name (required) | `Degree` |
| `exam_month` | string | Exam month (01-12) | `05` |
| `exam_year` | string | Exam year | `2023` |
| `convocation_no` | string | Convocation number | `45` |
| `institute_id` | integer | Institute ID | `12` |
| `group_by` | string | Grouping field | `enrollment` |

#### Statistics Breakdown

The analysis provides statistics across multiple dimensions:

- **By Exam Month**: Distribution of records across exam months
  ```json
  "by_exam_month": {
    "05": 120,  // May exam
    "11": 85    // November exam
  }
  ```

- **By Exam Year**: Yearly distribution
  ```json
  "by_exam_year": {
    "2022": 180,
    "2023": 205,
    "2024": 95
  }
  ```

- **By Convocation**: Records per convocation event
  ```json
  "by_convocation": {
    "44": 180,
    "45": 205,
    "46": 95
  }
  ```

#### Best Practices

1. **Regular Audits**: Run analysis before each convocation
2. **Filter-Based Checks**: Use specific filters for targeted analysis
3. **Year-End Review**: Annual data quality checks by exam year
4. **Institute Reports**: Regular institute-level duplicate checks
5. **Documentation**: Keep records of duplicate resolutions

#### Related Endpoints
- `/api/degrees/` - Degree CRUD operations
- `/api/convocations/` - Convocation master data
- `/api/bulk-upload/` - Bulk degree upload (with duplicate prevention)

---

## 📊 Google Sheets Integration

### Architecture Pattern (Official Mail & Transcript Requests)

#### **Sync Strategy**
- **When Sync Happens**: ViewSet.update() method ONLY
- **When NOT Sync**: Sheet imports, bulk operations, Django shell, signals
- **Direction**: Django → Google Sheets (one-way on update)

#### **Transcript Request Sync** (`sheets_sync.py`)

**Key Features:**
1. **Batch API Calls** - Reduces quota usage
   ```python
   # Before: 3 field updates = 3 API calls
   worksheet.update(range1, value1)
   worksheet.update(range2, value2)
   worksheet.update(range3, value3)
   
   # After: 3 field updates = 1 API call
   worksheet.batch_update([
       {'range': range1, 'values': [[value1]]},
       {'range': range2, 'values': [[value2]]},
       {'range': range3, 'values': [[value3]]}
   ])
   ```

2. **Composite Key Matching** - Better import accuracy
   - Level 1: tr_request_no + requested_at (most specific)
   - Level 2: tr_request_no only
   - Level 3: request_ref_no (unique reference)
   - Level 4: enrollment_no + requested_at (fallback)

3. **Rate Limit Handling**
   - Exponential backoff on 429 errors (2s, 4s, 8s)
   - Google Sheets quota: 60 writes/minute
   - Batch updates reduce API call count

4. **Synced Fields**
   - `tr_request_no` (BigInteger, NOT NULL)
   - `mail_status` (NULL allowed)
   - `transcript_remark` (NULL allowed)
   - `pdf_generate` (NULL allowed)

#### **Official Mail Request Sync**
- Same pattern as transcript requests
- Fields synced: status, completion_date, remarks
- ViewSet: `GoogleFormSubmissionViewSet` (views_mail_request.py)

### Configuration
```python
# backend/secrets/admindesk-sa.json
{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "...",
  "private_key": "...",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

### Usage
```python
# Import from Google Sheets (one-time or scheduled)
from api.sheets_sync import import_mail_requests, import_transcript_requests

import_mail_requests()  # Fetch new rows from Google Sheets
import_transcript_requests()  # Fetch transcript requests

# Sync happens automatically on ViewSet.update()
# No manual sync needed after updating records via API
```

---

## 🔄 Complete System Workflow

### How AdminDesk Works: End-to-End

This section explains how the entire system works together from user login to data persistence.

#### 1. **System Startup Flow**

**Backend Startup:**
```powershell
# Terminal 1: Start Django backend
cd e:\admindesk\backend
python manage.py runserver 127.0.0.1:8000

# System initializes:
# - Loads Django settings (settings.py)
# - Connects to PostgreSQL database
# - Registers all models, views, serializers
# - Applies middleware (JWT Auth, CORS, Activity Logging)
# - Registers URL routes (urls.py + router)
# - Django Ready - Listening on port 8000
```

**Frontend Startup:**
```powershell
# Terminal 2: Start Vite dev server
cd e:\admindesk
npm run dev

# Vite initializes:
# - Compiles React components
# - Loads Tailwind CSS
# - Sets up hot module replacement (HMR)
# - Dev server ready on localhost:5173
```

#### 2. **User Login & Authentication Flow**

```
Step 1: User enters credentials
├─ User visits: http://localhost:5173/login
├─ Enters username & password
└─ Clicks "Login" button

Step 2: Frontend sends login request
├─ React Login component calls auth.js
├─ POST http://127.0.0.1:8000/api/backlogin/
├─ Payload: { username: "HITENDRA", password: "xxxxx" }
└─ Authorization header: NOT included (login endpoint is public)

Step 3: Backend authenticates user
├─ Django receives request at /api/backlogin/
├─ Calls custom authentication backend (auth_backends.py)
├─ Queries User model, verifies password
├─ Generates JWT tokens (access + refresh)
└─ Returns: {
      access: "eyJ0eXAiOiJKV1QiLCJh...",
      refresh: "eyJ0eXAiOiJKV1QiLCJh...",
      user: { id: 1, username: "HITENDRA", ... }
    }

Step 4: Frontend stores tokens
├─ localStorage.setItem('token', data.access)
├─ localStorage.setItem('refresh', data.refresh)
├─ localStorage.setItem('username', data.username)
└─ Redirects to: /home (Dashboard)

Step 5: All subsequent API calls include token
├─ axiosInstance interceptor reads token from localStorage
├─ Adds header: Authorization: Bearer <token>
└─ Backend validates token on every request
```

#### 3. **Dashboard Load Flow**

```
Step 1: User lands on Dashboard
├─ React Router loads Home component
└─ Home component mounts (useEffect runs)

Step 2: Fetch user navigation/permissions
├─ GET http://127.0.0.1:8000/api/my-navigation/
├─ Headers: { Authorization: Bearer <token> }
├─ Backend validates JWT token
├─ Fetches UserPermission records for current user
└─ Returns: { modules: [...], menus: [...], user: {...} }

Step 3: Render dynamic menu
├─ Sidebar component receives navigation data
├─ Filters modules by user permissions
├─ Admin users see all modules
├─ Regular users see only assigned modules
└─ Menu items render dynamically

Step 4: Display dashboard widgets
├─ Fetch dashboard stats (optional)
├─ Display recent activities
├─ Show shortcuts to frequently used modules
└─ Dashboard fully loaded
```

#### 4. **CRUD Operation Flow (Example: Create Verification Record)**

```
Step 1: User navigates to Verification module
├─ User clicks "Verification" in sidebar
├─ React Router: /work/verification
├─ Loads Verification component (verification.jsx)
└─ useEffect fetches existing verification records

Step 2: Fetch existing records
├─ GET http://127.0.0.1:8000/api/verification/?limit=50
├─ Backend: VerificationViewSet.list()
├─ Queries: Verification.objects.all()[:50]
├─ Serializes data: VerificationSerializer
└─ Returns: { results: [...], count: 1250, next: "..." }

Step 3: React renders table with data
├─ Maps over results array
├─ Renders each verification record in table row
└─ Displays: enrollment_no, name, status, dates, actions

Step 4: User clicks "Add New" button
├─ Modal/form opens
├─ Shows empty form fields
└─ User fills: enrollment_no, student_name, status, dates

Step 5: Form submission
├─ User clicks "Submit"
├─ Frontend validation (required fields)
├─ POST http://127.0.0.1:8000/api/verification/
├─ Payload: {
      enrollment: "202301001",
      student_name: "John Doe",
      status: "IN_PROGRESS",
      doc_rec_date: "2025-12-09",
      ...
    }
└─ Headers: { Authorization: Bearer <token>, Content-Type: application/json }

Step 6: Backend processes request
├─ Django receives POST at /api/verification/
├─ JWT middleware validates token
├─ Routes to: VerificationViewSet.create()
├─ VerificationSerializer validates data
├─ Required field checks, data type validation
├─ If valid: serializer.save()
└─ Creates new Verification record in database

Step 7: Database transaction
├─ INSERT INTO verification (enrollment, name, status, ...)
├─ VALUES ('202301001', 'John Doe', 'IN_PROGRESS', ...)
├─ Returns primary key (id = 12345)
└─ Transaction committed

Step 8: Post-save signal (if configured)
├─ Django signal: post_save.send(Verification, instance=...)
├─ May trigger: Activity log creation, email notification, etc.
└─ Signal handlers execute

Step 9: Backend responds
├─ Status: 201 Created
├─ Response body: { id: 12345, enrollment: "202301001", ... }
└─ Serialized created record returned

Step 10: Frontend updates UI
├─ Success response received
├─ Shows toast notification: "Record created successfully"
├─ Refreshes verification list (re-fetch or append to array)
├─ Closes modal/form
└─ User sees new record in table
```

#### 5. **Auto-Number Generation Flow (Inward/Outward Register)**

```
Step 1: User opens Inward Register form
├─ Clicks "Inward/Outward Register" in menu
├─ Loads inout_register.jsx (2-tab component)
└─ Default tab: Inward Register

Step 2: Form mounts - fetch next number
├─ useEffect hook triggers on mount
├─ Default type: "Internal"
├─ Calls: getNextInwardNumber('Internal')
└─ GET http://127.0.0.1:8000/api/inward-register/next-number/?rec_type=Internal

Step 3: Backend calculates next number
├─ Routes to: InwardRegisterViewSet.next_number()
├─ Gets current year: datetime.now().year % 100 (25 for 2025)
├─ Builds prefix: "25/Internal/"
├─ Queries database:
    InwardRegister.objects
      .filter(inward_no__startswith='25/Internal/')
      .order_by('-inward_no')
      .first()
├─ Last record: "25/Internal/0005"
├─ Extracts sequence: 5
├─ Calculates next: 6
├─ Formats: "25/Internal/0006"
└─ Returns: { last_no: "25/Internal/0005", next_no: "25/Internal/0006" }

Step 4: Frontend displays preview
├─ Receives response
├─ Updates state: setNextNumber(data)
├─ Renders at top of form:
    "Last inward no: 25/Internal/0005"
    "Next Inward: 25/Internal/0006"
└─ User sees what number will be assigned

Step 5: User changes type dropdown
├─ User selects "External" from dropdown
├─ onChange handler triggers
├─ Calls: fetchInwardNextNumber('External')
├─ GET /api/inward-register/next-number/?rec_type=External
├─ Backend recalculates: "25/External/0012"
└─ Preview updates in real-time

Step 6: User fills form and submits
├─ User enters: from_dept, subject, received_date, etc.
├─ Clicks "Submit"
├─ POST http://127.0.0.1:8000/api/inward-register/
├─ Payload includes: rec_type: "External"
└─ Backend auto-assigns next_no during save

Step 7: Backend assigns number on create
├─ InwardRegisterViewSet.create() or .perform_create()
├─ Calls internal method to generate number
├─ Uses same logic as next_number endpoint
├─ Assigns to: instance.inward_no = "25/External/0012"
├─ Saves to database
└─ Returns created record

Step 8: Frontend confirms and refreshes
├─ Success response: 201 Created
├─ Shows toast: "Record created with ID: 25/External/0012"
├─ Fetches new next_no preview (now shows 0013)
├─ Clears form
└─ User can add another record
```

#### 6. **Permission-Based Access Control Flow**

```
Step 1: User clicks restricted module (e.g., "Inventory")
├─ React Router: /work/inventory
├─ Route configured with: <AuthInventory />
└─ Auth wrapper component loads

Step 2: AuthInventory checks authentication
├─ useEffect runs on mount
├─ Reads: const token = localStorage.getItem('token')
├─ If no token:
│   ├─ navigate('/login')
│   └─ STOP
└─ Token exists, proceed to Step 3

Step 3: Fetch user permissions
├─ GET http://127.0.0.1:8000/api/userpermissions/
├─ Headers: { Authorization: Bearer <token> }
├─ Backend validates token
├─ Queries: UserPermission.objects.filter(user=request.user)
└─ Returns: {
      user: { id: 1, username: "HITENDRA", is_superuser: true },
      permissions: [
        { module_name: "Inventory", can_view: true, ... },
        { module_name: "Doc Register", can_view: true, ... }
      ]
    }

Step 4: Validate module access
├─ Frontend receives permissions array
├─ Checks: permissions.some(p => 
│     p.module_name.toLowerCase() === 'inventory'
│   )
├─ OR checks: user.is_superuser === true
└─ Sets: hasAccess = true/false

Step 5: Render decision
├─ If hasAccess === null (loading):
│   └─ Show: "Checking permissions..."
├─ If hasAccess === false:
│   └─ Show: "Access Denied" message
└─ If hasAccess === true:
    ├─ Render: <Inventory /> component
    └─ User can now interact with Inventory module

Step 6: Component-level permission checks (optional)
├─ Within Inventory component
├─ Check can_add, can_edit, can_delete
├─ Show/hide buttons based on permissions:
│   ├─ can_add === true → Show "Add New" button
│   ├─ can_edit === true → Show "Edit" icon
│   └─ can_delete === true → Show "Delete" icon
└─ Fine-grained UI control
```

#### 7. **Google Sheets Sync Flow (Transcript Requests)**

```
Step 1: Google Form submission (external)
├─ Student fills form: Name, Enrollment, Institute, etc.
├─ Form submits to Google Sheets
└─ New row added with timestamp

Step 2: Import from Google Sheets (scheduled job or manual)
├─ Run: python manage.py import_transcript_requests
├─ OR: Call /api/import-transcript-requests/ (if exposed)
├─ Backend reads Google Sheets via gspread
├─ Fetches all rows (or new rows since last import)
└─ Creates/updates TranscriptRequest records in Django

Step 3: User updates transcript request in AdminDesk
├─ User opens Transcript Request page
├─ Finds record, clicks "Edit"
├─ Updates fields: mail_status, transcript_remark, pdf_generate
├─ Clicks "Save"
└─ PUT http://127.0.0.1:8000/api/transcript-requests/<id>/

Step 4: Backend processes update
├─ TranscriptRequestViewSet.update() called
├─ Serializer validates data
├─ Updates database record
└─ AFTER save: Sync to Google Sheets

Step 5: Sync to Google Sheets (batch update)
├─ Method: sync_transcript_request_to_sheet(instance)
├─ Composite key matching:
│   ├─ Level 1: tr_request_no + requested_at
│   ├─ Level 2: tr_request_no only
│   ├─ Level 3: request_ref_no
│   └─ Level 4: enrollment_no + requested_at
├─ Finds matching row in Google Sheet
├─ Prepares batch update:
    [
      {'range': 'Sheet1!H123', 'values': [[mail_status]]},
      {'range': 'Sheet1!I123', 'values': [[transcript_remark]]},
      {'range': 'Sheet1!J123', 'values': [[pdf_generate]]}
    ]
├─ Calls: worksheet.batch_update(data)
└─ Single API call updates all fields

Step 6: Rate limit handling
├─ If Google returns 429 (quota exceeded):
│   ├─ Catch exception
│   ├─ Wait 2 seconds (exponential backoff)
│   ├─ Retry request
│   └─ Max 3 retries
└─ Success: Django and Google Sheets now in sync

Step 7: User refreshes page
├─ Latest data displayed
├─ Google Sheet reflects updates
└─ Bidirectional sync maintained
```

#### 8. **Error Handling & Logging Flow**

```
Step 1: Error occurs (example: database query fails)
├─ User submits form with invalid data
├─ OR database connection lost
└─ Exception raised in Django

Step 2: Django exception handling
├─ Try-except block catches exception
├─ Logs error to ErrorLog model:
    ErrorLog.objects.create(
      error_type="ValidationError",
      error_message=str(e),
      stack_trace=traceback.format_exc(),
      user=request.user,
      endpoint="/api/verification/"
    )
└─ Returns: 400 Bad Request or 500 Internal Server Error

Step 3: Frontend receives error response
├─ Axios interceptor catches error
├─ If 401: Redirect to /login
├─ If 403: Show "Access Denied"
├─ If 400/500: Extract error message
└─ Display user-friendly error toast

Step 4: Activity logging (success cases)
├─ Middleware: middleware_logs.py
├─ After successful request:
    UserActivityLog.objects.create(
      user=request.user,
      action="CREATE",
      model_name="Verification",
      object_id=instance.id,
      changes=json.dumps(changed_fields),
      ip_address=request.META.get('REMOTE_ADDR')
    )
└─ Audit trail created

Step 5: Admin reviews logs
├─ Django Admin → Logs section
├─ Views ErrorLog and UserActivityLog
├─ Filters by user, date, action type
├─ Debugs issues or audits user activity
└─ Exports logs if needed
```

#### 9. **Data Analysis Flow**

```
Step 1: Admin opens Data Analysis
├─ Clicks "Data Analysis" in admin panel
├─ Selects service: "Degree"
├─ Sets filters: exam_month=05, exam_year=2023
└─ Clicks "Run Analysis"

Step 2: Frontend sends request
├─ GET http://127.0.0.1:8000/api/data-analysis/
├─ Query params: ?service=Degree&exam_month=05&exam_year=2023
└─ Headers include JWT token

Step 3: Backend analyzes data
├─ DataAnalysisView receives request
├─ Queries: StudentDegree.objects.filter(
│     exam_month='05',
│     exam_year='2023'
│   )
├─ Groups by enrollment_no
├─ Identifies duplicates (count > 1)
├─ Calculates statistics
└─ Prepares response JSON

Step 4: Returns analysis results
├─ Status: 200 OK
├─ Body: {
│     total_records: 205,
│     duplicate_groups: 3,
│     duplicates: [
│       { enrollment_no: "202301001", count: 2, records: [...] }
│     ],
│     statistics: { by_exam_month: {...}, ... }
│   }
└─ Response sent to frontend

Step 5: Frontend renders results
├─ Displays summary: "205 records, 3 duplicates found"
├─ Shows duplicate groups in expandable table
├─ Provides export button (CSV download)
└─ Admin reviews and takes action
```

---

## 📦 System Components Summary

### Backend Components

| Component | Technology | Purpose | Location |
|-----------|-----------|---------|----------|
| **API Server** | Django 5.2.3 + DRF | RESTful API endpoints | `backend/api/views_*.py` |
| **Database** | PostgreSQL | Data persistence | Configured in `settings.py` |
| **Authentication** | JWT (simplejwt) | Token-based auth | `auth_backends.py` |
| **ORM Models** | Django Models | Database schema | `domain_*.py` |
| **Serializers** | DRF Serializers | Data validation & transformation | `serializers_*.py` |
| **Middleware** | Custom Middleware | Activity logging, CORS, JWT | `middleware_logs.py`, `settings.py` |
| **Admin Panel** | Django Admin | Database management UI | `admin.py` |
| **Background Jobs** | Management Commands | Scheduled tasks, imports | `management/commands/` |
| **Google Sheets Sync** | gspread library | Bidirectional sync | `sheets_sync.py` |
| **Signals** | Django Signals | Post-save automation | `signals.py` |

### Frontend Components

| Component | Technology | Purpose | Location |
|-----------|-----------|---------|----------|
| **UI Framework** | React 18 | Component-based UI | `src/pages/*.jsx` |
| **Build Tool** | Vite | Fast dev server & bundling | `vite.config.js` |
| **Styling** | Tailwind CSS | Utility-first CSS | `tailwind.config.js` |
| **Routing** | React Router | Client-side routing | `src/pages/WorkArea.jsx` |
| **HTTP Client** | Axios | API communication | `src/api/axiosInstance.js` |
| **Auth Wrappers** | Custom Hooks | Permission-based access | `src/hooks/Auth*.jsx` |
| **Service Layer** | JavaScript modules | API abstraction | `src/services/*.js` |
| **State Management** | React Hooks | Local state management | useState, useEffect |

### Key Features Summary

| Feature | Description | Implementation |
|---------|-------------|----------------|
| **JWT Authentication** | Stateless token-based auth | Access + Refresh tokens, localStorage |
| **Role-Based Access Control** | Module & menu level permissions | UserPermission model + Auth wrappers |
| **Auto-Number Generation** | Sequential number assignment | ViewSet @action endpoints |
| **Google Sheets Sync** | Bidirectional data sync | gspread + batch updates |
| **Bulk Upload** | Excel/CSV import | pandas + Django Admin action |
| **Data Analysis** | Duplicate detection & statistics | Custom API endpoint |
| **Audit Logging** | User activity tracking | Middleware + UserActivityLog |
| **Error Tracking** | System error logging | ErrorLog model |
| **PDF Generation** | Certificate/document generation | reportlab/WeasyPrint |
| **Real-time Preview** | Next number preview | API polling on form load |

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USER ACTIONS                         │
│  Login → Navigate → View Data → Create → Update → Delete   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    REACT FRONTEND LAYER                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Components → Services → axiosInstance              │   │
│  │  (UI Logic)   (API Calls)  (JWT Token Injection)    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTP/HTTPS (JSON)
┌─────────────────────────────────────────────────────────────┐
│                    DJANGO BACKEND LAYER                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Middleware → ViewSets → Serializers → Models       │   │
│  │  (Auth/Log)   (Business)  (Validation)  (ORM)       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Signals → Google Sheets Sync → Background Jobs     │   │
│  │  (Auto)    (External Sync)      (Scheduled)         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ SQL Queries
┌─────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATABASE                      │
│  Tables: Users, Students, DocRec, Verification, Degree,     │
│          Leave, Inventory, Logs, etc.                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ External Integrations
┌─────────────────────────────────────────────────────────────┐
│  Google Sheets API │ File Storage │ Email (future)          │
└─────────────────────────────────────────────────────────────┘
```

### Module Overview

| Module | Description | Main Models | Key Features |
|--------|-------------|-------------|--------------|
| **Student Services** | Document verification & certificates | Verification, Migration, Provisional, Degree | Auto-sync with DocRec, status workflow |
| **Document Management** | Track incoming documents | DocRec, InstVerification | Auto-create service records, Excel upload |
| **Office Management** | Official correspondence tracking | GoogleFormSubmission, TranscriptRequest | Google Sheets sync, auto-numbering |
| **Inventory** | Inward/Outward register | InwardRegister, OutwardRegister | Internal/External types, next number preview |
| **Leave Management** | Employee leave tracking | LeaveEntry, LeaveAllocation, EmpProfile | Balance calculation, approval workflow |
| **User Management** | Users & permissions | User, UserPermission, Module, Menu | RBAC, dynamic navigation |
| **Course Management** | Institute & course master | Institute, MainBranch, SubBranch | Course offerings mapping |
| **Analytics** | Data analysis & reports | N/A (queries across models) | Duplicate detection, statistics |
| **Admin Panel** | System administration | All models | Bulk operations, data management |

---

## 🚀 Deployment & Operations

### Development Environment

#### Backend Setup
```powershell
# Navigate to backend
cd e:\admindesk\backend

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Run development server
python manage.py runserver 127.0.0.1:8000
```

#### Frontend Setup
```powershell
# Navigate to root
cd e:\admindesk

# Install dependencies
npm install

# Run development server
npm run dev  # Vite dev server on port 3000
```

### Management Commands

#### Leave Management
```powershell
# Seed leave allocations for all employees
python manage.py seed-leave-allocations

# Recompute leave balance snapshots
# (Called via /api/recompute-snapshots/)

# Activate leave period
# (Called via /api/admin/activate-period/)
```

#### Document Reconciliation
```powershell
# Sync Doc Rec with service tables
python manage.py sync_docrec_services --service=VR  # Verification
python manage.py sync_docrec_services --service=IV  # Inst Verification
```

### Database Migrations

#### Common Operations
```powershell
# Show migrations
python manage.py showmigrations api

# Run specific migration
python manage.py migrate api 0044

# Fake migration (if column exists)
python manage.py migrate api 0044 --fake

# Reverse migration
python manage.py migrate api 0043
```

#### Recent Important Migrations
- `0044_update_transcript_null_constraints` - Updated transcript_request NULL constraints

### Monitoring & Logs

#### Activity Logs
- **User Activity**: `UserActivityLog` model (auto-logged via middleware)
- **Error Logs**: `ErrorLog` model (system errors)
- **Access**: Django Admin → Logs section

#### Google Sheets Quota
- **Limit**: 60 writes/minute
- **Monitoring**: Watch for 429 errors in Django logs
- **Solution**: Batch updates implemented (reduces API calls)

### Performance Optimization

#### Database
- Indexes on frequently queried fields (enrollment_no, doc_rec_id)
- Select/prefetch related for N+1 query prevention
- Database connection pooling

#### API
- Pagination (default: 100 items per page)
- Field filtering (only return required fields)
- Caching for static data (modules, menus)

#### Frontend
- Code splitting (React.lazy)
- Memoization (useMemo, useCallback)
- Debounced search inputs

---

## 📚 Additional Documentation

### Related Files
- `TRANSCRIPT_SYNC_PATTERN.md` - Detailed transcript sync documentation
- `STUDENT_SEARCH_FEATURE.md` - Student search implementation
- `UNIFIED_API_GUIDE.md` - API usage guide
- `VERIFICATION_MODEL_UPDATE_SUMMARY.md` - Verification model changes
- `NETWORK_ACCESS.md` - Network configuration

### API Testing
```powershell
# Get verification records
curl -H "Authorization: Bearer <token>" "http://127.0.0.1:8000/api/verification/?limit=5"

# Get user navigation
curl -H "Authorization: Bearer <token>" "http://127.0.0.1:8000/api/my-navigation/"

# Get leave balance
curl -H "Authorization: Bearer <token>" "http://127.0.0.1:8000/api/my-leave-balance/"
```

---

## 🔧 Troubleshooting

### Common Issues

#### 1. Google Sheets Quota Errors
**Error**: `429 Rate limit exceeded for quota metric 'Write requests'`
**Solution**: 
- System now uses batch updates (multiple cells = 1 API call)
- Exponential backoff implemented
- Sync only on user-initiated updates (not bulk operations)

#### 2. Migration Conflicts
**Error**: `Column already exists`
**Solution**:
```powershell
python manage.py migrate api <migration_number> --fake
python manage.py migrate
```

#### 3. JWT Token Expiration
**Error**: `401 Unauthorized`
**Solution**: Frontend automatically refreshes tokens. Check token storage in localStorage.

#### 4. CORS Errors
**Solution**: Check `backend/backend/settings.py` CORS configuration:
```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
```

---

## 📝 Changelog

### December 2025
- ✅ Complete system documentation created
- ✅ Transcript request Google Sheets sync with batch updates
- ✅ Enhanced import matching with composite keys
- ✅ Rate limit handling with exponential backoff
- ✅ NULL constraint updates for transcript_request model

### November 2025
- ✅ Server-side doc_rec↔service sync (signals)
- ✅ Verification.enrollment nullable for placeholder rows
- ✅ Doc Rec ID display in frontend
- ✅ Management command `sync_docrec_services`

---

## 🤝 Development Guidelines

### Code Organization
- **Models**: Split by domain (domain_*.py)
- **Serializers**: Match model organization (serializers_*.py)
- **Views**: Organized by feature (views_*.py)
- **URLs**: Centralized in urls.py with router

### Naming Conventions
- **Models**: PascalCase (e.g., `LeaveEntry`)
- **API Endpoints**: kebab-case (e.g., `/leave-entries/`)
- **ViewSets**: PascalCase + "ViewSet" (e.g., `LeaveEntryViewSet`)
- **Functions**: snake_case (e.g., `sync_transcript_request_to_sheet`)

### Best Practices
- ✅ Use serializers for validation
- ✅ Keep ViewSets thin (delegate to services)
- ✅ Log errors to ErrorLog model
- ✅ Use transactions for multi-model operations
- ✅ Write tests for critical business logic
- ✅ Document complex logic in code comments

---

## 📞 Support & Maintenance

### System Health Checks
```powershell
# Check Django status
python manage.py check

# Test database connection
python manage.py dbshell

# Run smoke tests
python manage.py test api.tests_smoke

# Check API endpoints
python manage.py test api.tests_api_basic
```

### Backup & Recovery
- **Database**: Regular PostgreSQL backups via `pg_dump`
- **Media Files**: Backup `backend/media/` directory
- **Secrets**: Secure backup of `backend/secrets/`

---

**End of Documentation**  
*For questions or updates, contact the development team.*