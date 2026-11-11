"""
Django settings for the ChatDesk backend.

Sprint 1 scope: project skeleton, custom tbl_user model, JWT auth.
See claude/API_CONTRACT.md and claude/PROJECT CONTEXT.md for the source of truth.
"""

import sys
from datetime import timedelta
from pathlib import Path

import dj_database_url
from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("SECRET_KEY")
DEBUG = config("DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "users",
    "faqs",
    "inquiry_logs",
    "tickets",
    "analytics",
    "announcements",
    "phases",
    "offices",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

def _database_from_url(url):
    """A DATABASES entry from a postgres:// URL (Neon in production).
    Neon's pooled address ("-pooler") runs PgBouncer in transaction mode,
    which can't keep Django's server-side cursors open between queries."""
    database = dj_database_url.parse(url, conn_max_age=0, conn_health_checks=True)
    # Give up on a stuck connection instead of hanging the request.
    database.setdefault("OPTIONS", {})["connect_timeout"] = 10
    if "-pooler" in url:
        database["DISABLE_SERVER_SIDE_CURSORS"] = True
    return database


# Production: DATABASE_URL (Neon's pooled connection string). Local
# development: the separate DB_* settings in backend/.env.
DATABASE_URL = config("DATABASE_URL", default="")
if DATABASE_URL:
    DATABASES = {"default": _database_from_url(DATABASE_URL)}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": config("DB_NAME"),
            "USER": config("DB_USER"),
            "PASSWORD": config("DB_PASSWORD"),
            "HOST": config("DB_HOST", default="localhost"),
            "PORT": config("DB_PORT", default="5432"),
        }
    }

# Only for `manage.py copy_reference_data`: the database to copy offices,
# FAQs, phases, announcements and staff accounts FROM (your local one).
SOURCE_DATABASE_URL = config("SOURCE_DATABASE_URL", default="")
if SOURCE_DATABASE_URL:
    DATABASES["source"] = _database_from_url(SOURCE_DATABASE_URL)

# `manage.py test` needs to create a throwaway database, which the shared
# local Postgres user (chatdesk_user) isn't allowed to do - so tests run on
# in-memory SQLite by default. Set TEST_WITH_POSTGRES=True (with a user that
# has CREATEDB) to run them against Postgres instead.
RUNNING_TESTS = "test" in sys.argv[1:2]
if RUNNING_TESTS and not config("TEST_WITH_POSTGRES", default=False, cast=bool):
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}

# Custom user model: tbl_user (email as USERNAME_FIELD, explicit role field)
AUTH_USER_MODEL = "users.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
if RUNNING_TESTS:
    # Real hashing is deliberately slow; tests create many users and codes.
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
# `manage.py collectstatic` gathers the Django admin's CSS/JS here; nginx
# serves it in production (deploy/aws/nginx-chatdesk.conf).
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Profile picture uploads (users.User.profile_picture). Served by Django in
# dev via config/urls.py's static() helper, and by nginx in production from
# this same folder - the server's disk keeps it between deployments.
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Production behind nginx: nginx handles HTTPS and passes the request on to
# gunicorn over plain HTTP, saying in this header that the visitor used
# HTTPS (deploy/aws/nginx-chatdesk.conf). Django needs it to treat the
# request as secure (correct https:// links, admin login CSRF check). Safe
# because nginx always sets the header itself.
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())
PROXY_SSL_HEADER = config("PROXY_SSL_HEADER", default="")
if PROXY_SSL_HEADER:
    SECURE_PROXY_SSL_HEADER = (PROXY_SSL_HEADER, "https")
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# Errors and warnings to the console (gunicorn -> journalctl in production).
# Without this, Django only prints errors while DEBUG is on.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
}

# Route-protection: every endpoint requires a valid JWT unless a view explicitly
# sets permission_classes = [AllowAny] (register/login only).
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    # Applied per view via throttle_scope / users/throttles.py. Per-IP limits
    # stay loose since a whole campus Wi-Fi can share one public IP (a class
    # signing up together for SUS testing must not be blocked); the
    # per-email and per-student limits are the strict ones.
    "DEFAULT_THROTTLE_RATES": {
        "login": "100/min",
        "login_email": "10/min",
        "register": "100/hour",
        "password_reset_request": "60/hour",
        "password_reset_request_email": "5/hour",
        "password_reset_confirm": "100/hour",
        "verify_email_resend": "60/hour",
        "verify_email_resend_email": "5/hour",
        "chat": "20/min",
        "ticket_messages": "10/min",
    },
}

# Throttle counters live here. Fine for one dev server; a multi-process
# deployment needs a shared cache (e.g. Redis) or each process counts alone.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=config("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", default=15, cast=int)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=config("JWT_REFRESH_TOKEN_LIFETIME_DAYS", default=1, cast=int)
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "user_id",
    "USER_ID_CLAIM": "user_id",
}

CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())

OPENAI_API_KEY = config("OPENAI_API_KEY")

# Smart FAQ matching (inquiry_logs/matching.py): before the slower AI
# classifier runs, the student's message is compared to every FAQ question
# by meaning. A match this close (cosine similarity, 0-1) that also beats the
# runner-up by FAQ_MATCH_MARGIN is answered straight away. Off in tests so
# they never call OpenAI; those tests switch it on with a fake client.
# Calibrated 2026-11-08 with `manage.py embed_faqs --try`: rewordings of an
# FAQ scored 0.70-0.89, related-but-different questions at most 0.65.
FAQ_SEMANTIC_MATCHING = config("FAQ_SEMANTIC_MATCHING", default=True, cast=bool) and not RUNNING_TESTS
FAQ_EMBEDDING_MODEL = config("FAQ_EMBEDDING_MODEL", default="text-embedding-3-small")
FAQ_MATCH_THRESHOLD = config("FAQ_MATCH_THRESHOLD", default=0.70, cast=float)
FAQ_MATCH_MARGIN = config("FAQ_MATCH_MARGIN", default=0.10, cast=float)

# A staff ticket still waiting for staff after this many days is flagged
# Overdue and listed in the daily reminder (send_overdue_reminders).
TICKET_OVERDUE_DAYS = config("TICKET_OVERDUE_DAYS", default=2, cast=int)
# Linked in the daily reminder email, e.g. https://admin.chatdesk.example.
ADMIN_DASHBOARD_URL = config("ADMIN_DASHBOARD_URL", default="").rstrip("/")

# Gmail SMTP - used to email the "Forgot Password" reset code and the
# registration email-verification link (users/views.py, users/services.py).
# Needs a Gmail App Password, not the account's normal login password -
# generate one at https://myaccount.google.com/apppasswords with 2-Step
# Verification on.
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default=EMAIL_HOST_USER)
# Seconds before a stuck SMTP connection gives up instead of hanging the request.
EMAIL_TIMEOUT = 10

# True once a real Gmail App Password is in place.
REAL_EMAIL_ENABLED = bool(
    EMAIL_HOST_PASSWORD and EMAIL_HOST_PASSWORD != "replace-with-gmail-app-password"
)
# Without real email, reset codes and verification links are returned in the
# API response so the flows stay testable - but only in DEBUG, never on a
# real deployment (that would let anyone reset anyone's password).
EMAIL_DEV_FALLBACK = DEBUG and not REAL_EMAIL_ENABLED
# Ticket notification emails (tickets/notifications.py) are sent on a
# background thread so a slow Gmail never holds up the staff member's
# request. Tests send them inline to check what went out.
SEND_EMAIL_IN_BACKGROUND = not RUNNING_TESTS

# Base for links inside emails (verification). Falls back to the address the
# request came in on, which is usually a LAN IP that only works on the same
# Wi-Fi - set this to a reachable address for real use.
PUBLIC_BASE_URL = config("PUBLIC_BASE_URL", default="").rstrip("/")

# Optional registration gates - both off by default (API contract: any email
# domain may register). ALLOWED_EMAIL_DOMAINS e.g. "ustp.edu.ph".
ALLOWED_EMAIL_DOMAINS = [d.lower() for d in config("ALLOWED_EMAIL_DOMAINS", default="", cast=Csv()) if d]
REQUIRE_EMAIL_VERIFICATION = config("REQUIRE_EMAIL_VERIFICATION", default=False, cast=bool)
