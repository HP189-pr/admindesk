from django.test import SimpleTestCase

from api.management.commands.backfill_profile_gender import (
    degree_genders,
    fallback_gender,
    normalize_gender,
)


class ProfileGenderBackfillTests(SimpleTestCase):
    def test_normalize_gender_accepts_supported_values(self):
        self.assertEqual(normalize_gender(' M '), 'Male')
        self.assertEqual(normalize_gender('male'), 'Male')
        self.assertEqual(normalize_gender(' F '), 'Female')
        self.assertEqual(normalize_gender('Female'), 'Female')
        self.assertIsNone(normalize_gender(None))
        self.assertIsNone(normalize_gender('Other'))

    def test_blank_profile_uses_degree_gender_but_populated_profile_is_preserved(self):
        self.assertEqual(fallback_gender(None, 'Male'), 'Male')
        self.assertEqual(fallback_gender('  ', 'Female'), 'Female')
        self.assertIsNone(fallback_gender('Male', 'Female'))
        self.assertIsNone(fallback_gender(' Female ', 'Male'))

    def test_normalizes_duplicates_without_conflict(self):
        genders, conflicts = degree_genders([
            (' A ', 'M'), ('A', ' Male '), ('B', 'Female'), ('B', 'F'),
            ('C', 'OTHER'), ('D', None), ('E', '0'), ('F', 'unknown'),
            ('', 'Male'), (None, 'Female'),
        ])
        self.assertEqual(genders, {'a': 'Male', 'b': 'Female'})
        self.assertEqual(conflicts, set())

    def test_conflicting_degree_genders_are_not_written(self):
        genders, conflicts = degree_genders([('A', 'Male'), ('A', 'F'), ('B', None), ('B', 'F')])
        self.assertEqual(genders, {'b': 'Female'})
        self.assertEqual(conflicts, {'a'})
