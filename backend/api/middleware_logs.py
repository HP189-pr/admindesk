import json
import traceback
from django.utils.deprecation import MiddlewareMixin
from django.conf import settings

from .domain_logs import UserActivityLog, ErrorLog


class RequestActivityMiddleware(MiddlewareMixin):
    """Logs basic user activity for POST/PUT/PATCH/DELETE requests."""

    def process_response(self, request, response):
        try:
            if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
                user = getattr(request, 'user', None) if getattr(request, 'user', None) and request.user.is_authenticated else None
                payload = None
                try:
                    if request.body:
                        payload = json.loads(request.body.decode('utf-8'))
                except Exception:
                    payload = None

                UserActivityLog.objects.create(
                    user=user,
                    module=getattr(request, 'resolver_match', None) and getattr(request.resolver_match, 'url_name', None),
                    action='API',
                    path=request.path,
                    method=request.method,
                    payload=payload,
                    status_code=getattr(response, 'status_code', None),
                )
        except Exception:
            # do not allow logging failures to raise
            pass
        return response


class ExceptionLoggingMiddleware(MiddlewareMixin):
    def process_exception(self, request, exception):
        try:
            user = getattr(request, 'user', None) if getattr(request, 'user', None) and request.user.is_authenticated else None
            stack = traceback.format_exc()
            payload = None
            try:
                if request.body:
                    payload = json.loads(request.body.decode('utf-8'))
            except Exception:
                payload = None

            ErrorLog.objects.create(
                user=user,
                path=request.path,
                method=request.method,
                message=str(exception),
                stack=stack,
                payload=payload,
            )
        except Exception:
            pass
        # returning None allows normal exception handling to continue
        return None
