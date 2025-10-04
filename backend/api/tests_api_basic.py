"""Basic API endpoint smoke tests for extracted modules.

Covers:
  - Login endpoint returns JWT
  - Navigation endpoint shape
  - Enrollment list endpoint (empty set ok) returns expected keys

These are intentionally light to quickly detect wiring regressions after modularization.
Run with: python manage.py test api.tests_api_basic -v 2
"""
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from rest_framework import status

User = get_user_model()

class BasicApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="apitester", email="api@example.com", password="pass12345")

    def auth(self):
        resp = self.client.post(reverse('userlogin'), {"username": "apitester", "password": "pass12345"}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        token = resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_login_and_navigation(self):
        # login
        resp = self.client.post(reverse('userlogin'), {"username": "apitester", "password": "pass12345"}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
        # navigation requires auth
        token = resp.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        nav = self.client.get(reverse('my-navigation'))
        self.assertEqual(nav.status_code, 200)
        self.assertIn('modules', nav.data)

    def test_enrollment_list_empty(self):
        self.auth()
        resp = self.client.get('/api/enrollments/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('items', resp.data)
        self.assertIn('total', resp.data)
