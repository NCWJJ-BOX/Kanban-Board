from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User


class AuthTests(APITestCase):
    def setUp(self):
        self.register_payload = {
            'username': 'alice',
            'email': 'alice@test.dev',
            'password': 'password123',
        }

    def test_register_returns_tokens_and_user(self):
        resp = self.client.post('/api/v1/auth/register', self.register_payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        body = resp.data
        self.assertEqual(body['user']['email'], 'alice@test.dev')
        self.assertEqual(body['user']['username'], 'alice')
        self.assertIn('access_token', body)
        self.assertIn('refresh_token', body)
        self.assertEqual(User.objects.filter(email='alice@test.dev').count(), 1)

    def test_register_duplicate_email_conflicts(self):
        self.client.post('/api/v1/auth/register', self.register_payload, format='json')
        resp = self.client.post('/api/v1/auth/register', self.register_payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp.data['error'], 'EMAIL_ALREADY_EXISTS')

    def test_register_duplicate_username_conflicts(self):
        self.client.post('/api/v1/auth/register', self.register_payload, format='json')
        other = {
            'username': 'alice',
            'email': 'other@test.dev',
            'password': 'password123',
        }
        resp = self.client.post('/api/v1/auth/register', other, format='json')
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(resp.data['error'], 'USERNAME_ALREADY_EXISTS')

    def test_register_weak_password_rejected(self):
        payload = {**self.register_payload, 'password': 'short'}
        resp = self.client.post('/api/v1/auth/register', payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_returns_tokens(self):
        self.client.post('/api/v1/auth/register', self.register_payload, format='json')
        resp = self.client.post(
            '/api/v1/auth/login',
            {'email': 'alice@test.dev', 'password': 'password123'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', resp.data)
        self.assertIn('refresh_token', resp.data)

    def test_login_wrong_password_unauthorized(self):
        self.client.post('/api/v1/auth/register', self.register_payload, format='json')
        resp = self.client.post(
            '/api/v1/auth/login',
            {'email': 'alice@test.dev', 'password': 'nope'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_current_user(self):
        resp = self.client.post('/api/v1/auth/register', self.register_payload, format='json')
        token = resp.data['access_token']
        me = self.client.get(
            '/api/v1/auth/me', HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data['email'], 'alice@test.dev')

    def test_me_without_token_unauthorized(self):
        resp = self.client.get('/api/v1/auth/me')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)