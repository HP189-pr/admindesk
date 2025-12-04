# AdminDesk - Complete System Documentation
**Django 5.2.3 + React + DRF + PostgreSQL**  
*Last Updated: December 2025*

---

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Backend API Documentation](#backend-api-documentation)
5. [Frontend Application](#frontend-application)
6. [Database Models](#database-models)
7. [Authentication & Authorization](#authentication--authorization)
8. [Django Admin Interface](#django-admin-interface)
9. [Data Analysis Features](#data-analysis-features)
10. [Google Sheets Integration](#google-sheets-integration)
11. [Deployment & Operations](#deployment--operations)

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
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Routing**: React Router

### DevOps
- **Version Control**: Git
- **Server**: Windows Server (PowerShell)
- **Ports**: Backend (8000), Frontend (3000)

---

## 🏗️ Architecture

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
- **Methods**: GET, POST, PUT, DELETE
- **Admin Upload**: `/api/admin/upload-docrec/`
- **Frontend Page**: `doc-receive.jsx`

#### 8. **Institutional Verification** (`/api/inst-verification-main/`, `/api/inst-verification-student/`)
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

#### 9. **Official Mail Requests** (`/api/mail-requests/`)
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

### JWT Token Flow
1. User logs in via `/api/backlogin/`
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