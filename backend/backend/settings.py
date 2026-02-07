# Allow large Excel uploads (default is 1000, increase as needed)
DATA_UPLOAD_MAX_NUMBER_FIELDS = 20000
from pathlib import Path
from datetime import timedelta
import hmac
import os
import importlib
import warnings

# During development, Django may warn about DB access during app initialization
# (e.g., when `django.contrib.postgres` registers type handlers). This is
# expected in dev and pollutes logs; suppress that specific RuntimeWarning here
# (keep other warnings visible). Do NOT remove in production.
warnings.filterwarnings(
    "ignore",
    r"Accessing the database during app initialization is discouraged.*",
    RuntimeWarning,
)

# try to import load_dotenv but don't fail if python-dotenv is not installed
try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# load .env file if present (only if python-dotenv is available)
# NOTE: load from project root: <project_root>/.env (where manage.py lives)
if load_dotenv:
    try:
        load_dotenv(dotenv_path=str(BASE_DIR / ".env"))
    except Exception:
        # if load fails for some reason, continue without crashing
        warnings.warn("Failed to load .env via python-dotenv; continuing with os.environ")

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.1/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-0x0bwjij$1%19z)@kld_2l3(wx3j*slrp)d6=0dfw=jd&3&sir'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    'ksvoffice',
    '160.160.160.130',   # your LAN IP
]

# Application definition

# base apps (required)
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',  # PostgreSQL-specific features (FTS, JSONField, etc.)
    'api',  # Core API app
    'reports',  # Analytics & calendar endpoints
]

# optional apps: rest_framework, corsheaders
try:
    importlib.import_module('rest_framework')
    INSTALLED_APPS.insert(len(INSTALLED_APPS), 'rest_framework')
except Exception:
    warnings.warn("djangorestframework is not installed. Install it with: pip install djangorestframework")

try:
    importlib.import_module('corsheaders')
    INSTALLED_APPS.insert(len(INSTALLED_APPS), 'corsheaders')
    HAS_CORS = True
except Exception:
    warnings.warn("django-cors-headers is not installed. Install it with: pip install django-cors-headers")
    HAS_CORS = False

# middleware (always include security/session/etc.)
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
]

# insert cors middleware at top if available
if HAS_CORS:
    MIDDLEWARE.insert(0, 'corsheaders.middleware.CorsMiddleware')

MIDDLEWARE += [
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Logging middleware: record user activity and exceptions
    'api.middleware_logs.RequestActivityMiddleware',
    'api.middleware_logs.ExceptionLoggingMiddleware',
]

ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates',  # for global templates
                 BASE_DIR / 'backend' / 'api' / 'templates',  # for app-specific templates
                ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'

# Database
# https://docs.djangoproject.com/en/5.1/ref/settings/#databases

# Use environment variables; fallback to sqlite for local dev
DB_ENGINE = os.getenv("DB_ENGINE", "django.db.backends.postgresql")
if DB_ENGINE == "django.db.backends.postgresql":
    DATABASES = {
        'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'frontdesk',       # or the DB you created
        'USER': 'postgres',
        'PASSWORD': 'Ksv@svkm2007',
        'HOST': 'localhost',
        'PORT': '5432',
    }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": DB_ENGINE,
            "NAME": os.getenv("DB_NAME"),
            "USER": os.getenv("DB_USER"),
            "PASSWORD": os.getenv("DB_PASSWORD"),
            "HOST": os.getenv("DB_HOST", "localhost"),
            # CAST PORT to int (fix)
            "PORT": int(os.getenv("DB_PORT", "5432")),
        }
    }

# Password validation
# https://docs.djangoproject.com/en/5.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
# https://docs.djangoproject.com/en/5.1/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Kolkata'

USE_I18N = True

USE_TZ = True

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.1/howto/static-files/

STATIC_URL = 'static/'

# Default primary key field type
# https://docs.djangoproject.com/en/5.1/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",  # React Frontend (Dev)
    "http://127.0.0.1:3000",  # React Alternative URL
    "http://localhost:5173",  # Vite default
    "http://127.0.0.1:5173",  # Vite alt
    "http://localhost:8000",  # Django backend self
    "http://127.0.0.1:8000",  # Django backend alt
    "http://localhost:8081",  # Production build preview
    "http://127.0.0.1:8081",  # Production build alt

    "http://ksvoffice",
    "http://160.160.160.130",
]

# Allow additional local dev ports used during debugging (Vite on 3002, Django dev on 8001)
CORS_ALLOWED_ORIGINS += [
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:8001",
    "http://127.0.0.1:8001",
]

CORS_ALLOW_CREDENTIALS = True  # Allow credentials (cookies, sessions)
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# CSRF trusted origins for local dev
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://ksvoffice",
    "http://160.160.160.130"
]

# REST framework settings (leave settings dict in place; it's safe even if package absent)
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    # Enforce consistent date formatting (dd-mm-yyyy) across API responses
    'DATE_FORMAT': '%d-%m-%Y',
    'DATE_INPUT_FORMATS': ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d'],  # accept a few common inputs
    'DATETIME_FORMAT': '%d-%m-%Y %H:%M:%S',  # if any DateTime fields are serialized
    'DATETIME_INPUT_FORMATS': ['%d-%m-%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y'],
    # Pagination for better performance
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.LimitOffsetPagination',
    'PAGE_SIZE': 200,  # Default page size
}

# Django-level (non-DRF) date display/input preferences (admin, forms)
DATE_INPUT_FORMATS = ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d']
DATE_FORMAT = 'd-m-Y'
DATETIME_FORMAT = 'd-m-Y H:i:s'

# Optional: JWT settings (for token expiration, etc.)
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': False,
    'BLACKLIST_AFTER_ROTATION': False,
    'UPDATE_LAST_LOGIN': True,  # Optional, updates `last_login`
    'ALGORITHM': 'HS256',  # Default
    'SIGNING_KEY': 'Ksvsvkm2007to2024',  # Use your Django secret key
    'AUTH_HEADER_TYPES': ('Bearer',),  # Frontend must send "Authorization: Bearer <token>"
    'USER_ID_FIELD': 'id',  # Using default User model's `id`
    'USER_ID_CLAIM': 'user_id',  # Use `user_id` for consistency
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}

# Media files (for file uploads)
MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

# Optional: path to wkhtmltopdf binary for server-side PDF generation (pdfkit)
# Example on Windows: set environment variable WKHTMLTOPDF_CMD=C:\\Program Files\\wkhtmltopdf\\bin\\wkhtmltopdf.exe
WKHTMLTOPDF_CMD = os.getenv('WKHTMLTOPDF_CMD', None)
if not WKHTMLTOPDF_CMD:
    # Common default install locations we can auto-detect (Windows + Linux)
    candidate_paths = [
        r"C:\\Program Files\\wkhtmltopdf\\bin\\wkhtmltopdf.exe",
        r"C:\\Program Files (x86)\\wkhtmltopdf\\bin\\wkhtmltopdf.exe",
        '/usr/local/bin/wkhtmltopdf',
        '/usr/bin/wkhtmltopdf',
    ]
    for _path in candidate_paths:
        if os.path.exists(_path):
            WKHTMLTOPDF_CMD = _path
            break

# Use the default Django User model
AUTH_USER_MODEL = 'auth.User'  # Django's default User model

# Authentication backends (no custom backend needed since you're using default User model)
AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',  # Default Django model backend
]
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'http')
# Optional: Set up Admin credentials or further configurations here if needed

# Admin Panel secondary password (not the user password)
# Configure in environment variable ADMIN_PANEL_SECRET. If not set, admin panel verification will fail safely.
ADMIN_PANEL_SECRET = os.getenv("ADMIN_PANEL_SECRET")

