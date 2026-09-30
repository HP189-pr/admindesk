from django.test import SimpleTestCase

from api.management.commands.backfill_profile_gender import degree_genders


class ProfileGenderBackfillTests(SimpleTestCase):
    def test_normalizes_duplicates_without_conflict(self):
        genders, conflicts = degree_genders([
            ('A', 'M'), ('A', ' Male '), ('B', 'FEMAIL'), ('B', 'F'),
            ('C', 'OTHER'), ('D', None), ('E', '0'), ('F', 'unknown'),
            ('', 'Male'), (None, 'Female'),
        ])
        self.assertEqual(genders, {'A': 'Male', 'B': 'Female', 'C': 'Other'})
        self.assertEqual(conflicts, set())

    def test_conflicting_degree_genders_are_not_written(self):
        genders, conflicts = degree_genders([('A', 'Male'), ('A', 'F'), ('B', None), ('B', 'F')])
        self.assertEqual(genders, {'B': 'Female'})
        self.assertEqual(conflicts, {'A'})
