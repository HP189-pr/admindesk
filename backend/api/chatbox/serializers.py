from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from .models import ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    from_userid = serializers.IntegerField(source="from_user_id", read_only=True)
    to_userid = serializers.IntegerField(source="to_user_id", read_only=True)
    sender_name = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ChatMessage
        fields = [
            "id",
            "from_userid",
            "to_userid",
            "text",
            "file_name",
            "file_path",
            "file_url",
            "file_mime",
            "file_size",
            "delivered",
            "seen",
            "file_delivered",
            "file_downloaded",
            "downloaded_at",
            "sender_name",
            "createdat",
        ]
        read_only_fields = fields

    def get_sender_name(self, obj):
        full = f"{getattr(obj.from_user, 'first_name', '')} {getattr(obj.from_user, 'last_name', '')}".strip()
        return full or getattr(obj.from_user, "username", "")

    def get_file_url(self, obj):
        if not obj.file_path:
            return None
        request = self.context.get("request") if hasattr(self, "context") else None
        rel_path = obj.file_path.lstrip("/")
        if request:
            return request.build_absolute_uri(f"{settings.MEDIA_URL}{rel_path}")
        return f"{settings.MEDIA_URL}{rel_path}"
