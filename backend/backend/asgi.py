"""
ASGI config for backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.1/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

django_asgi_app = get_asgi_application()

try:
	from channels.routing import ProtocolTypeRouter, URLRouter

	from api.chatbox.auth import JwtAuthMiddleware
	from api.chatbox.routing import websocket_urlpatterns

	application = ProtocolTypeRouter(
		{
			"http": django_asgi_app,
			"websocket": JwtAuthMiddleware(URLRouter(websocket_urlpatterns)),
		}
	)
except Exception:
	application = django_asgi_app
