from django.urls import path
from accounts.views import RegisterView, LoginView, RefreshView, MeView

urlpatterns = [
    path('auth/register', RegisterView.as_view(), name='auth-register'),
    path('auth/login', LoginView.as_view(), name='auth-login'),
    path('auth/refresh', RefreshView.as_view(), name='auth-refresh'),
    path('auth/me', MeView.as_view(), name='auth-me'),
]