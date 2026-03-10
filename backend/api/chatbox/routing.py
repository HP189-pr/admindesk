# backend/api/chatbox/routing.py
from django.urls import path

from .consumers import PrivateChatConsumer

websocket_urlpatterns = [
    path("ws/chat/", PrivateChatConsumer.as_asgi()),
]
