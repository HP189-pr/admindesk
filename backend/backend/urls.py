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
from django.contrib.staticfiles.urls import staticfiles_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("api/reports/", include("reports.urls")),
]

# Serve media files in development only
if settings.DEBUG:
    # Required when using daphne/waitress in dev so Django admin static assets load.
    urlpatterns += staticfiles_urlpatterns()
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
