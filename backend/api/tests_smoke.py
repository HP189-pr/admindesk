"""File: backend/api/tests_smoke.py
Lightweight smoke tests for critical model behaviors after refactor.
Run with: python manage.py test api.tests_smoke -v 2
"""
from django.test import TestCase
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.utils import timezone
from .models import DocRec, ApplyFor, PayBy, Verification, VerificationStatus, Enrollment, Institute, MainBranch, SubBranch

class DocRecGenerationTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='tester', password='pass12345')
    def test_docrec_id_autogenerates(self):
        d = DocRec.objects.create(apply_for=ApplyFor.VERIFICATION, pay_by=PayBy.CASH, created_by=self.user, pay_amount=10)
        self.assertTrue(d.doc_rec_id.startswith('vr_'))
        self.assertIsNotNone(d.doc_rec_date)
    def test_sequential_numbers(self):
        first = DocRec.objects.create(apply_for=ApplyFor.VERIFICATION, pay_by=PayBy.CASH, created_by=self.user)
        second = DocRec.objects.create(apply_for=ApplyFor.VERIFICATION, pay_by=PayBy.CASH, created_by=self.user)
        n1 = int(first.doc_rec_id.split('_')[-1])
        n2 = int(second.doc_rec_id.split('_')[-1])
        self.assertEqual(n2, n1 + 1)

class VerificationConstraintTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='u1', password='pass12345')
        self.inst = Institute.objects.create(institute_id=1, institute_code='I001')
        self.main = MainBranch.objects.create(maincourse_id='MC1')
        self.sub = SubBranch.objects.create(subcourse_id='SC1', maincourse=self.main)
        self.enr = Enrollment.objects.create(student_name='Alice', institute=self.inst, batch=2025, subcourse=self.sub, maincourse=self.main, enrollment_no='ENR1')
    def test_final_no_required_when_done(self):
        v = Verification(enrollment=self.enr, student_name='Alice')
        v.status = VerificationStatus.DONE
        with self.assertRaises(ValidationError):
            v.full_clean()
    def test_counts_range(self):
        v = Verification(enrollment=self.enr, student_name='Alice', tr_count=1000)
        with self.assertRaises(ValidationError):
            v.full_clean()
