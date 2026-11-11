from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth endpoints per claude/API_CONTRACT.md: register, login, token/refresh, logout, me.
    path("api/v1/auth/", include("users.urls")),
    path("api/v1/", include("users.management_urls")),
    path("api/v1/", include("inquiry_logs.urls")),
    path("api/v1/", include("tickets.urls")),
    path("api/v1/", include("analytics.urls")),
    path("api/v1/faqs/", include("faqs.urls")),
    path("api/v1/", include("announcements.urls")),
    path("api/v1/", include("phases.urls")),
    path("api/v1/", include("offices.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
