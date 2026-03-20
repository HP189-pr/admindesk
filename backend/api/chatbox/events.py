# backend/api/chatbox/events.py

# backend/api/chatbox/events.py

try:
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer
    CHANNELS_AVAILABLE = True
except Exception:
    async_to_sync = None
    get_channel_layer = None
    CHANNELS_AVAILABLE = False


def user_group_name(user_id: int) -> str:
    return f"user_{int(user_id)}"


def _group_send(group_name: str, event_type: str, data: dict) -> None:
    if not CHANNELS_AVAILABLE or get_channel_layer is None or async_to_sync is None:
        return
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    async_to_sync(channel_layer.group_send)(
        group_name,
        {
            "type": "chat.event",
            "event": event_type,
            "data": data,
        },
    )


def send_user_event(user_id: int, event_type: str, data: dict) -> None:
    _group_send(user_group_name(user_id), event_type, data)


def broadcast_presence(userid: int, online: bool, last_seen: float) -> None:
    _group_send(
        "chat_presence",
        "presence_update",
        {
            "userid": int(userid),
            "online": bool(online),
            "last_seen": float(last_seen),
        },
    )
