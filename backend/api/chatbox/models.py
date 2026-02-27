from __future__ import annotations

import os
from uuid import uuid4

from django.conf import settings
from django.db import models


class ChatMessage(models.Model):
    """Point-to-point chat message with optional file payload."""

    from_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_messages_sent",
    )
    to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_messages_received",
    )
    text = models.TextField(blank=True, null=True)

    file_name = models.CharField(max_length=255, blank=True, null=True)
    file_path = models.CharField(max_length=500, blank=True, null=True)
    file_mime = models.CharField(max_length=100, blank=True, null=True)
    file_size = models.BigIntegerField(blank=True, null=True)
    delivered = models.BooleanField(default=False)
    seen = models.BooleanField(default=False)
    file_delivered = models.BooleanField(default=False)
    file_downloaded = models.BooleanField(default=False)
    downloaded_at = models.DateTimeField(blank=True, null=True)

    createdat = models.DateTimeField(auto_now_add=True)

    hide_for_sender = models.BooleanField(default=False)
    hide_for_receiver = models.BooleanField(default=False)

    class Meta:
        db_table = "chat_messages"
        ordering = ["createdat"]
        indexes = [
            models.Index(fields=["from_user", "to_user", "createdat"]),
            models.Index(fields=["to_user", "from_user", "createdat"]),
        ]

    @staticmethod
    def chats_upload_path(filename: str) -> str:
        ext = os.path.splitext(filename)[1]
        return f"chats/{uuid4().hex}{ext}"

    def __str__(self) -> str:  # pragma: no cover - display helper only
        return f"ChatMessage<{self.pk}> {self.from_user_id}->{self.to_user_id}"