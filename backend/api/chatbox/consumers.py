# backend/api/chatbox/consumers.py
from __future__ import annotations

import time

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.core.cache import cache

from .events import user_group_name

PRESENCE_CACHE_KEY = "chatbox:presence"
PRESENCE_TTL_SECONDS = 30


def _now_ts() -> float:
    return time.time()


def _presence_map() -> dict:
    return cache.get(PRESENCE_CACHE_KEY) or {}


def _set_presence_map(presence: dict) -> None:
    cache.set(PRESENCE_CACHE_KEY, presence, timeout=PRESENCE_TTL_SECONDS * 4)


def _presence_list() -> list[dict]:
    presence = _presence_map()
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
        out.append({"userid": int(uid_str), "last_seen": ts, "online": online})
    _set_presence_map(cleaned)
    return out


def _mark_online(user_id: int) -> float:
    presence = _presence_map()
    ts = _now_ts()
    presence[str(user_id)] = ts
    _set_presence_map(presence)
    return ts


def _mark_offline(user_id: int) -> float:
    presence = _presence_map()
    ts = _now_ts()
    presence[str(user_id)] = ts - (PRESENCE_TTL_SECONDS + 1)
    _set_presence_map(presence)
    return ts


class PrivateChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4401)
            return

        self.private_group = user_group_name(self.user.id)
        self.presence_group = "chat_presence"

        await self.channel_layer.group_add(self.private_group, self.channel_name)
        await self.channel_layer.group_add(self.presence_group, self.channel_name)
        await self.accept()

        ts = _mark_online(self.user.id)
        await self.send_json({"event": "presence_snapshot", "data": {"presence": _presence_list()}})
        await self.channel_layer.group_send(
            self.presence_group,
            {
                "type": "chat.event",
                "event": "presence_update",
                "data": {"userid": self.user.id, "online": True, "last_seen": ts},
            },
        )

    async def disconnect(self, close_code):
        if getattr(self, "user", None) and self.user.is_authenticated:
            ts = _mark_offline(self.user.id)
            await self.channel_layer.group_send(
                self.presence_group,
                {
                    "type": "chat.event",
                    "event": "presence_update",
                    "data": {"userid": self.user.id, "online": False, "last_seen": ts},
                },
            )
        if getattr(self, "private_group", None):
            await self.channel_layer.group_discard(self.private_group, self.channel_name)
        if getattr(self, "presence_group", None):
            await self.channel_layer.group_discard(self.presence_group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        event = (content or {}).get("event")

        # keep presence ping
        if event == "ping" and getattr(self, "user", None) and self.user.is_authenticated:
            ts = _mark_online(self.user.id)
            await self.channel_layer.group_send(
                self.presence_group,
                {
                    "type": "chat.event",
                    "event": "presence_update",
                    "data": {"userid": self.user.id, "online": True, "last_seen": ts},
                },
            )
            return

        # WebRTC / screen share events
        if event in [
            "webrtc_offer",
            "webrtc_answer",
            "webrtc_ice",
            "screen_share_request",
            "screen_share_accept",
            "screen_share_reject",
        ]:
            to_user = content.get("to")
            if not to_user:
                return

            await self.channel_layer.group_send(
                user_group_name(int(to_user)),
                {
                    "type": "chat.event",
                    "event": event,
                    "data": content,
                },
            )

    async def chat_event(self, event):
        await self.send_json({"event": event.get("event"), "data": event.get("data") or {}})
