"""
Management command to rebuild search_vector for all Enrollment records
Run: python manage.py rebuild_enrollment_search
"""
from django.core.management.base import BaseCommand
from django.contrib.postgres.search import SearchVector
from api.domain_enrollment import Enrollment


class Command(BaseCommand):
    help = 'Rebuild search_vector for all Enrollment records (case-insensitive)'

    def handle(self, *args, **options):
        self.stdout.write('Rebuilding search_vector for all enrollments...')
        
        try:
            # Update all records with proper case-insensitive search vector
            updated = Enrollment.objects.update(
                search_vector=SearchVector(
                    'enrollment_no', 'temp_enroll_no', 'student_name', 
                    config='simple'
                )
            )
            
            self.stdout.write(
                self.style.SUCCESS(f'✓ Successfully rebuilt search_vector for {updated} enrollment records')
            )
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'✗ Error rebuilding search_vector: {str(e)}')
            )
