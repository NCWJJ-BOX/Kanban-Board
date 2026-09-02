from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.models import User
from accounts.serializers import (
    RegisterSerializer,
    UserSerializer,
    EmailTokenObtainPairSerializer,
)


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            errors = serializer.errors
            code = 'EMAIL_ALREADY_EXISTS' if 'email' in errors else (
                'USERNAME_ALREADY_EXISTS' if 'username' in errors else 'VALIDATION_ERROR'
            )
            return Response({
                'error': code,
                'message': code.replace('_', ' ').title(),
                'detail': errors,
            }, status=status.HTTP_409_CONFLICT if code != 'VALIDATION_ERROR' else status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
            'token_type': 'bearer',
            'expires_in': 3600,
        }, status=status.HTTP_201_CREATED)


class LoginView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            return Response({
                'error': 'INVALID_CREDENTIALS',
                'message': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
            }, status=status.HTTP_401_UNAUTHORIZED)
        data = serializer.validated_data
        return Response({
            'access_token': data['access'],
            'refresh_token': data['refresh'],
            'token_type': 'bearer',
            'expires_in': 3600,
        })


class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            data = response.data
            response.data = {
                'access_token': data['access'],
                'refresh_token': data.get('refresh'),
                'token_type': 'bearer',
            }
        return response


class MeView(APIView):
    """GET /auth/me — current authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)