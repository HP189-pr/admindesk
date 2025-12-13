# AdminDesk - University Administration System

[![Django](https://img.shields.io/badge/Django-5.2.3-green.svg)](https://www.djangoproject.com/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Latest-blue.svg)](https://www.postgresql.org/)
[![Vite](https://img.shields.io/badge/Vite-Latest-purple.svg)](https://vitejs.dev/)

**AdminDesk** is a comprehensive university administration system for managing student services, document management, office correspondence, leave management, and more. Built with Django REST Framework backend and React frontend.

---

## 🎯 Overview

AdminDesk streamlines university administrative operations with:

- **Student Services**: Document verification, migration certificates, provisional certificates, degree management
- **Document Management**: Document receipt tracking, institutional verification, auto-numbering
- **Office Management**: Official mail requests, transcript requests with Google Sheets sync
- **Inventory**: Inward/Outward register with next-number preview
- **Leave Management**: Employee leave tracking with balance calculation
- **Analytics**: Data analysis, duplicate detection, comprehensive reporting
- **User Management**: Role-based access control (RBAC) with module/menu permissions

---

## 🆕 Latest Updates (December 13, 2025)

- **Permissions API Restored**: `/api/my-navigation/` is registered again in Django routing so mail requests, transcript requests, and enrollment pages can fetch rights without 404s.
- **Leave Calendar Visuals**: Backend, React defaults, and CSS chips now share the same palette. Holidays use a medium light green tone and sandwich-only days show a highlighted border instead of overriding the background.
- **Degree Bulk Uploads**: The generic `/api/bulk-upload/` endpoint understands `service=DEGREE`, so the Admin upload console can insert/update `student_degree` rows via the Excel workflow.
- **Changelog Refresh**: See [docs/CHANGELOG.md](docs/CHANGELOG.md) for the full summary of December 13 fixes.

---

## 🚀 Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+
- Git

### Backend Setup

```powershell
# Clone repository
git clone https://github.com/HP189-pr/admindesk.git
cd admindesk

# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Setup database (create PostgreSQL database first)
# Update backend/backend/settings.py with your database credentials

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Run development server
python manage.py runserver 127.0.0.1:8000
```

### Frontend Setup

```powershell
# In root directory
npm install

# Run Vite dev server
npm run dev
```

### Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://127.0.0.1:8000/api/
- **Django Admin**: http://127.0.0.1:8000/admin/

### Default Login

Use the superuser credentials you created during setup.

---

## 🏗️ Architecture Summary

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
│  • JWT Authentication    • CORS Middleware                  │
│  • Activity Logging      • Permission Validation            │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ ORM (Django Models)
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                       │
│  Students | DocRec | Verification | Degree | Leave | Logs  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ External Integrations
┌─────────────────────────────────────────────────────────────┐
│   Google Sheets (Transcript Requests & Mail Requests)      │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Backend:**
- Django 5.2.3 + Django REST Framework
- PostgreSQL database
- JWT authentication (djangorestframework-simplejwt)
- Google Sheets API (gspread)

**Frontend:**
- React 18 with Vite
- Tailwind CSS + PostCSS
- Axios for API calls
- React Router for navigation

---

## 📚 Documentation

### Core Documentation

- **[Backend API Documentation](docs/BACKEND_API.md)** - Complete API reference, endpoints, request/response formats
- **[Frontend Guide](docs/FRONTEND_GUIDE.md)** - React components, services, routing, and UI patterns
- **[Database Models](docs/MODELS_SCHEMA.md)** - All domain models, fields, relationships
- **[Authentication & RBAC](docs/PERMISSIONS_RBAC.md)** - JWT auth, permission system, access control

### Feature Documentation

- **[Google Sheets Integration](docs/GOOGLE_SHEETS_SYNC.md)** - Bidirectional sync patterns, batch updates
- **[Data Analysis Engine](docs/DATA_ANALYSIS.md)** - Duplicate detection, statistics, filtering

### Operations

- **[Deployment Guide](docs/DEPLOYMENT.md)** - Server setup, migrations, monitoring, troubleshooting
- **[Changelog](docs/CHANGELOG.md)** - Recent updates and version history

---

## 🔑 Key Features

### 1. **Auto-Number Generation**
Automatic sequential numbering for documents with live preview:
- Format: `YY/TYPE/NNNN` (e.g., 25/Internal/0001)
- Real-time next-number preview in forms
- Type-based numbering (Internal/External)

### 2. **JWT Authentication**
Stateless authentication with token management:
- Access + Refresh tokens
- Automatic token injection via Axios interceptors
- Token expiration handling

### 3. **Role-Based Access Control**
Module and menu-level permissions:
- Permission wrappers for protected routes
- Admin override for all modules
- Fine-grained access control (view, add, edit, delete)

### 4. **Google Sheets Sync**
Bidirectional sync for external data:
- Batch updates to reduce API quota usage
- Composite key matching for accuracy
- Rate limit handling with exponential backoff

### 5. **Data Analysis**
Advanced analytics and duplicate detection:
- Multi-field duplicate detection
- Advanced filtering (exam month, year, convocation)
- Statistics breakdown and reporting

### 6. **Audit Logging**
Comprehensive activity tracking:
- User activity logs for all CRUD operations
- Error logging with stack traces
- IP address and timestamp tracking

---

## 📊 Module Overview

| Module | Purpose | Key Features |
|--------|---------|--------------|
| **Verification** | Document verification management | Auto-sync with DocRec, status workflow |
| **Degree** | Degree certificate management | Convocation tracking, duplicate detection |
| **Doc Register** | Inward/Outward correspondence | Auto-numbering, next-ID preview |
| **Doc Receive** | Incoming document tracking | Auto-create service records, Excel upload |
| **Leave Management** | Employee leave system | Balance calculation, approval workflow |
| **Transcript Requests** | Transcript processing | Google Sheets sync, status tracking |
| **Inst Verification** | University-to-university verification | PDF generation, student lists |
| **Analytics** | Data analysis and reporting | Duplicate detection, statistics |

---

## 🔄 Recent Updates (December 2025)

### Latest Features

✅ **Inward/Outward Register Enhancements**
- Changed record types to Internal/External
- Added next-number preview API
- Real-time display of last and next numbers

✅ **Authentication Wrappers**
- Created AuthInventory and AuthDocRegister components
- Module-level permission checking
- Auto-redirect for unauthorized access

✅ **Backend Configuration**
- JWT authentication prioritized over session auth
- Updated CORS configuration for localhost
- URL routing fixes for custom endpoints

✅ **Code Quality**
- Removed debug console logs
- Clean browser console in production
- Improved error handling

See [CHANGELOG.md](docs/CHANGELOG.md) for complete update history.

---

## 🛠️ Development

### Project Structure

```
admindesk/
├── backend/
│   ├── api/                    # Main API application
│   │   ├── domain_*.py        # Domain models (modular)
│   │   ├── serializers_*.py   # DRF serializers
│   │   ├── views_*.py         # ViewSets and views
│   │   ├── urls.py            # API routing
│   │   ├── admin.py           # Django Admin config
│   │   └── management/        # Management commands
│   ├── backend/               # Django project settings
│   │   ├── settings.py        # Configuration
│   │   └── urls.py            # Root URL config
│   └── manage.py              # Django management script
├── src/
│   ├── pages/                 # React page components
│   ├── components/            # Reusable components
│   ├── services/              # API service layer
│   ├── hooks/                 # Custom React hooks (Auth wrappers)
│   ├── api/                   # Axios configuration
│   └── Menu/                  # Navigation components
├── docs/                      # Documentation
├── public/                    # Static assets
└── package.json               # NPM dependencies
```

### Running Tests

```powershell
# Backend tests
cd backend
python manage.py test api

# Smoke tests
python manage.py test api.tests_smoke

# API basic tests
python manage.py test api.tests_api_basic
```

### Management Commands

```powershell
# Seed leave allocations
python manage.py seed-leave-allocations

# Import from Google Sheets
python manage.py import_mail_requests
python manage.py import_transcript_requests

# Sync Doc Rec with services
python manage.py sync_docrec_services --service=VR
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Coding Standards

- Follow PEP 8 for Python code
- Use ESLint/Prettier for JavaScript/React
- Write meaningful commit messages
- Add tests for new features
- Update documentation

---

## 📝 License

This project is proprietary software developed for university administration.

---

## 📞 Support

For questions, issues, or feature requests:
- Create an issue in the GitHub repository
- Contact the development team

---

## 🙏 Acknowledgments

- Django REST Framework team
- React and Vite communities
- Google Sheets API
- All contributors to this project

---

**Built with ❤️ for university administration**

*Last Updated: December 9, 2025*
