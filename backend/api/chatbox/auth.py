from __future__ import annotations

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication


@database_sync_to_async
def _resolve_user_from_token(token: str):
    if not token:
        return AnonymousUser()
    authenticator = JWTAuthentication()
    try:
        validated = authenticator.get_validated_token(token)
        user = authenticator.get_user(validated)
        return user
    except Exception:
        return AnonymousUser()


class JwtAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        token = None
        try:
            query = parse_qs((scope.get("query_string") or b"").decode())
            token = (query.get("token") or [None])[0]
        except Exception:
            token = None

        scope["user"] = await _resolve_user_from_token(token)
        return await super().__call__(scope, receive, send)
