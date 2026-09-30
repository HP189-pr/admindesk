from unittest.mock import patch
from django.test import SimpleTestCase
from api.views_enrollment import EnrollmentAnalyticsView


class EnrollmentGenderTests(SimpleTestCase):
    def test_normalization(self):
        for raw in (None, '', '  ', 'NA', ' n/A ', 'null', 'NONE', '0'):
            with self.subTest(raw=raw):
                self.assertIsNone(EnrollmentAnalyticsView._normalize_gender(raw))
        for raw in ('Male', 'm', ' MALE ', 'MLAE'):
            self.assertEqual(EnrollmentAnalyticsView._normalize_gender(raw), 'Male')
        for raw in ('Female', 'f', ' FEMALE ', 'FEMAL', 'FEMAIL', 'FEMAE', 'FAMALE'):
            self.assertEqual(EnrollmentAnalyticsView._normalize_gender(raw), 'Female')
        self.assertEqual(EnrollmentAnalyticsView._normalize_gender(' Other '), 'Other')

    @patch('api.views_enrollment.Enrollment')
    @patch('api.views_enrollment.StudentDegree')
    def test_profile_priority_fallback_and_missing(self, degrees, enrollments):
        # Mock degree rows in descending ID order, matching the query contract.
        degrees.objects.order_by.return_value.values_list.return_value.iterator.return_value = iter([
            ('B', '  '), ('A', 'Female'), ('B', ' f '), ('B', 'Male'),
            ('C', None), ('E', 'NA'), ('F', 'Female'), ('G', 'Male'),
            ('H', 'FEMAIL'), ('I', 'Other'), ('unlinked', 'Female'), (None, 'Male'),
        ])
        enrollments.objects.order_by.return_value.values_list.return_value.iterator.return_value = iter([
            (1, 'A', ' m '),       # Profile overrides conflicting degree.
            (2, 'B', None),        # Latest usable degree; later blank is ignored.
            (3, 'C', ' '),         # Neither source has data.
            (4, 'D', None),        # No degree match.
            (5, 'E', 'n/a'),       # Placeholders are missing.
            (6, 'F', 'NULL'),      # Placeholder allows degree fallback.
            (7, 'G', 'Female'),    # Profile priority in the other direction.
            (8, 'H', ''),          # Legacy typo becomes canonical Female.
            (9, 'I', ''),          # Other recorded genders are preserved.
            (10, None, None),      # Null enrollment does not match null degree.
        ])
        self.assertEqual(EnrollmentAnalyticsView._resolved_genders(), {
            1: 'Male', 2: 'Female', 3: 'NA', 4: 'NA', 5: 'NA',
            6: 'Female', 7: 'Female', 8: 'Female', 9: 'Other', 10: 'NA',
        })
        degrees.objects.order_by.assert_called_once_with('-id')
