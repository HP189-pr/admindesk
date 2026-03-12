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

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

BASE_DIR = Path(__file__).resolve().parent.parent

if load_dotenv:
    try:
        load_dotenv(dotenv_path=str(BASE_DIR / ".env"))
    except Exception:
        warnings.warn("Failed to load .env via python-dotenv; continuing with os.environ")

SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-0x0bwjij$1%19z)@kld_2l3(wx3j*slrp)d6=0dfw=jd&3&sir',
)

DEBUG = os.getenv('DJANGO_DEBUG', 'true').lower() == 'true'

ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    'ksvoffice',
    '160.160.160.130',
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
    'api',
    'reports',
]

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

try:
    importlib.import_module('channels')
    INSTALLED_APPS.insert(len(INSTALLED_APPS), 'channels')
except Exception:
    warnings.warn("channels is not installed. Install it with: pip install channels")

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
]

if HAS_CORS:
    MIDDLEWARE.insert(0, 'corsheaders.middleware.CorsMiddleware')

MIDDLEWARE += [
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
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
ASGI_APPLICATION = 'backend.asgi.application'

CHAT_CHANNEL_BACKEND = os.getenv("CHAT_CHANNEL_BACKEND", "memory").strip().lower()
if CHAT_CHANNEL_BACKEND == "redis":
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [os.getenv("CHAT_REDIS_URL", "redis://127.0.0.1:6379/0")],
            },
        }
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }

DB_ENGINE = os.getenv("DB_ENGINE", "django.db.backends.postgresql")
DATABASES = {
    "default": {
        "ENGINE": DB_ENGINE,
        "NAME": os.getenv("DB_NAME", "frontdesk"),
        "USER": os.getenv("DB_USER", "postgres"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": int(os.getenv("DB_PORT", "5432")),
        "CONN_MAX_AGE": 60,
    }
}

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

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Kolkata'

USE_I18N = True

USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8081",
    "http://127.0.0.1:8081",

    "http://ksvoffice",
    "http://160.160.160.130",
    "http://160.160.160.130:8081",
    "http://160.160.160.130:8000",
]

CORS_ALLOWED_ORIGINS += [
    "http://localhost:3002",
    "http://127.0.0.1:3002",
    "http://localhost:8001",
    "http://127.0.0.1:8001",
]

CORS_ALLOW_CREDENTIALS = True
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
    "http://160.160.160.130",
    "http://160.160.160.130:8081",
    "http://160.160.160.130:8000",
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DATE_FORMAT': '%d-%m-%Y',
    'DATE_INPUT_FORMATS': ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d'],
    'DATETIME_FORMAT': '%d-%m-%Y %H:%M:%S',
    'DATETIME_INPUT_FORMATS': ['%d-%m-%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y'],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.LimitOffsetPagination',
    'PAGE_SIZE': 50,
}

DATE_INPUT_FORMATS = ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d']
DATE_FORMAT = 'd-m-Y'
DATETIME_FORMAT = 'd-m-Y H:i:s'

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=2),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': False,
    'BLACKLIST_AFTER_ROTATION': False,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}

MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

WKHTMLTOPDF_CMD = os.getenv('WKHTMLTOPDF_CMD', None)
if not WKHTMLTOPDF_CMD:
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

AUTH_USER_MODEL = 'auth.User'

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
]
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'http')

# Admin panel verification uses a separate environment secret.
ADMIN_PANEL_SECRET = os.getenv("ADMIN_PANEL_SECRET")

