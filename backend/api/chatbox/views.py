from __future__ import annotations

import mimetypes
import os
import time

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import models
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ChatMessage
from .serializers import ChatMessageSerializer

User = get_user_model()

PRESENCE_CACHE_KEY = "chatbox:presence"
PRESENCE_TTL_SECONDS = 30


def _now_ts() -> float:
    return time.time()


def _mark_online(user_id: int) -> None:
    presence = cache.get(PRESENCE_CACHE_KEY) or {}
    presence[str(user_id)] = _now_ts()
    # Keep a slightly longer timeout than TTL to avoid churn
    cache.set(PRESENCE_CACHE_KEY, presence, timeout=PRESENCE_TTL_SECONDS * 4)


def _presence_list():
    presence = cache.get(PRESENCE_CACHE_KEY) or {}
    now = _now_ts()
    cleaned = {}
    out = []
    for uid_str, ts_val in presence.items():
        try:
            ts = float(ts_val)
        except Exception:
            continue
        online = now - ts < PRESENCE_TTL_SECONDS
        if online:
            cleaned[uid_str] = ts
        out.append({
            "userid": int(uid_str),
            "last_seen": ts,
            "online": online,
        })
    cache.set(PRESENCE_CACHE_KEY, cleaned, timeout=PRESENCE_TTL_SECONDS * 4)
    return out


class ChatPingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _mark_online(request.user.id)
        return Response({"ok": True, "now": _now_ts()})


class ChatPresenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"presence": _presence_list()})


class ChatSendView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        to_userid = request.data.get("to_userid")
        if not to_userid:
            return Response({"error": "Missing to_userid"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            to_user = User.objects.get(pk=int(to_userid))
        except (ValueError, User.DoesNotExist):
            return Response({"error": "Invalid recipient"}, status=status.HTTP_400_BAD_REQUEST)

        text_val = (request.data.get("text") or "").strip()
        text_val = text_val if text_val else None

        upload = request.FILES.get("file")
        file_fields = {"file_name": None, "file_path": None, "file_mime": None, "file_size": None}
        if upload:
            upload_dir = "chats/"
            name = os.path.basename(upload.name)
            unique_name = ChatMessage.chats_upload_path(name)
            stored_path = default_storage.save(unique_name, upload)
            # Normalize to forward-slash relative path under MEDIA_ROOT
            rel_path = stored_path.replace("\\", "/")
            file_fields = {
                "file_name": name,
                "file_path": rel_path,
                "file_mime": upload.content_type or mimetypes.guess_type(name)[0] or None,
                "file_size": getattr(upload, "size", None),
            }

        row = ChatMessage.objects.create(
            from_user=request.user,
            to_user=to_user,
            text=text_val,
            delivered=False,
            seen=False,
            file_delivered=False,
            file_downloaded=False,
            downloaded_at=None,
            **file_fields,
        )
        if upload:
            row.file_delivered = any(p.get("userid") == to_user.id and p.get("online") for p in _presence_list())
            row.save(update_fields=["file_delivered"])
        _mark_online(request.user.id)

        payload = ChatMessageSerializer(row, context={"request": request}).data
        payload["recipient_online"] = any(p.get("userid") == to_user.id and p.get("online") for p in _presence_list())
        return Response(payload, status=status.HTTP_201_CREATED)


class ChatHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, userid: int):
        try:
            other_id = int(userid)
        except (TypeError, ValueError):
            return Response({"error": "Invalid user id"}, status=status.HTTP_400_BAD_REQUEST)

        limit = min(200, max(1, int(request.query_params.get("limit", 200))))
        offset = max(0, int(request.query_params.get("offset", 0)))
        me = request.user.id

        ChatMessage.objects.filter(
            from_user_id=other_id,
            to_user_id=me,
            delivered=False,
        ).update(delivered=True)

        qs = ChatMessage.objects.filter(
            models.Q(from_user_id=me, to_user_id=other_id, hide_for_sender=False)
            | models.Q(from_user_id=other_id, to_user_id=me, hide_for_receiver=False)
        ).order_by("createdat")[offset : offset + limit]

        serializer = ChatMessageSerializer(qs, many=True, context={"request": request})
        return Response({"messages": serializer.data})


class ChatFilesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, userid: int):
        try:
            other_id = int(userid)
        except (TypeError, ValueError):
            return Response({"error": "Invalid user id"}, status=status.HTTP_400_BAD_REQUEST)
        me = request.user.id

        qs = ChatMessage.objects.filter(
            (
                models.Q(from_user_id=me, to_user_id=other_id, hide_for_sender=False)
                | models.Q(from_user_id=other_id, to_user_id=me, hide_for_receiver=False)
            )
            & models.Q(file_path__isnull=False)
            & ~models.Q(file_path="")
        ).order_by("-createdat")

        serializer = ChatMessageSerializer(qs, many=True, context={"request": request})
        return Response({"files": serializer.data})


class ChatClearView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, userid: int):
        try:
            other_id = int(userid)
        except (TypeError, ValueError):
            return Response({"error": "Invalid user id"}, status=status.HTTP_400_BAD_REQUEST)
        me = request.user.id
        type_arg = str(request.data.get("type") or "all").lower()

        sent_q = ChatMessage.objects.filter(from_user_id=me, to_user_id=other_id)
        recv_q = ChatMessage.objects.filter(from_user_id=other_id, to_user_id=me)

        if type_arg in ("all", "messages"):
            sent_q.update(hide_for_sender=True)
            recv_q.update(hide_for_receiver=True)
        elif type_arg == "files":
            sent_q.filter(file_path__isnull=False).update(hide_for_sender=True)
            recv_q.filter(file_path__isnull=False).update(hide_for_receiver=True)
        elif type_arg == "sent":
            sent_q.update(hide_for_sender=True)
        elif type_arg == "received":
            recv_q.update(hide_for_receiver=True)

        return Response({"ok": True})


class ChatPendingFilesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ChatMessage.objects.filter(
            to_user_id=request.user.id,
            file_path__isnull=False,
            file_downloaded=False,
            hide_for_receiver=False,
        ).exclude(file_path="").order_by("createdat")

        serializer = ChatMessageSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)


class ChatMarkDownloadedView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        message_id = request.data.get("message_id")
        if not message_id:
            return Response({"error": "Missing message_id"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            row = ChatMessage.objects.get(pk=int(message_id), to_user_id=request.user.id)
        except (ValueError, ChatMessage.DoesNotExist):
            return Response({"error": "Invalid message"}, status=status.HTTP_400_BAD_REQUEST)

        row.file_delivered = True
        row.file_downloaded = True
        row.downloaded_at = timezone.now()
        row.save(update_fields=["file_delivered", "file_downloaded", "downloaded_at"])
        return Response({"ok": True})


class ChatMarkSeenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sender_id = request.data.get("sender_id")
        if not sender_id:
            return Response({"error": "Missing sender_id"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            sid = int(sender_id)
        except (TypeError, ValueError):
            return Response({"error": "Invalid sender_id"}, status=status.HTTP_400_BAD_REQUEST)

        ChatMessage.objects.filter(
            from_user_id=sid,
            to_user_id=request.user.id,
            seen=False,
        ).update(seen=True, delivered=True)

        return Response({"ok": True})
