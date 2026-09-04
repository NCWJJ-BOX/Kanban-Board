"""WebSocket consumers for real-time updates."""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import User


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """Live notification feed for the authenticated user.

    The browser WebSocket API cannot set an Authorization header, so the access
    token travels as a query parameter: /ws/notifications/?token=<access_token>.
    """

    async def connect(self):
        self.user = await self._authenticate()
        if self.user is None:
            await self.close(code=4001)
            return
        self.group_name = f'notifications_{self.user.id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notification_new(self, event):
        """Handler for group_send({type: 'notification.new', ...})."""
        await self.send_json(event['notification'])

    async def _authenticate(self):
        params = parse_qs(self.scope['query_string'].decode())
        token = params.get('token', [None])[0]
        if not token:
            return None
        try:
            access = AccessToken(token)
            user_id = access.payload.get('user_id')
        except (InvalidToken, TokenError):
            return None
        if not user_id:
            return None
        try:
            return await database_sync_to_async(User.objects.get)(pk=user_id)
        except User.DoesNotExist:
            return None