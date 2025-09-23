from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.shortcuts import redirect

urlpatterns = [
    # Redirect root URL to Django admin (change target if you prefer a different landing page)
    path("", lambda request: redirect("admin:index")),

    path("admin/", admin.site.urls),  # Admin Panel
    path("api/", include("api.urls")),  # API routes
]

# ✅ Serve media files in development mode
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)