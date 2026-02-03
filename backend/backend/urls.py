"""
Project root URL configuration.

Stable endpoints:
- /admin/ -> Django admin
- /api/   -> Application API
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),

    # Core APIs
    path("api/", include("api.urls")),
    path("api/reports/", include("reports.urls")),
]

# Serve media files in development only
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
