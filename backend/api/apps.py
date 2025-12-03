from django.apps import AppConfig


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'
    def ready(self):
        # Import signal handlers to wire post_save synchronization
        try:
            from . import signals  # noqa: F401
            from . import signals_transcript  # noqa: F401
        except Exception:
            # Avoid raising during migrations or other import-time ops
            pass
