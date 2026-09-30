"""Fill empty profile genders from unambiguous degree data; dry-run by default."""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from api.models import Enrollment, StudentDegree, StudentProfile


def degree_genders(rows):
    values = {}
    for number, raw in rows:
        # Match the analytics resolver's established legacy spellings.
        gender = {'m': 'Male', 'male': 'Male', 'mlae': 'Male',
                  'f': 'Female', 'female': 'Female', 'femal': 'Female',
                  'femail': 'Female', 'femae': 'Female', 'famale': 'Female',
                  'o': 'Other', 'other': 'Other'}.get(str(raw or '').strip().casefold())
        if number and number.strip() and gender:
            values.setdefault(number, set()).add(gender)
    return ({number: next(iter(genders)) for number, genders in values.items() if len(genders) == 1},
            {number for number, genders in values.items() if len(genders) > 1})


class Command(BaseCommand):
    help = 'Backfill only NULL/blank profile genders, creating profiles for matching enrollments.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--audit', help='New JSON audit file required with --apply (never overwritten).')

    def handle(self, *args, **options):
        apply = options['apply']
        if apply and not options['audit']:
            raise CommandError('--apply requires --audit PATH')
        with transaction.atomic():
            enrollments = Enrollment.objects.order_by('pk')
            profiles = StudentProfile.objects.order_by('pk')
            if apply:
                enrollments = enrollments.select_for_update()
                profiles = profiles.select_for_update()
            numbers = set(enrollments.values_list('enrollment_no', flat=True))
            existing = {profile.enrollment_id: profile for profile in profiles}
            sources, conflicts = degree_genders(StudentDegree.objects.values_list('enrollment_no', 'dg_gender').iterator())
            updates, creates, audit = [], [], []
            preserved = 0
            now = timezone.now()
            for number, gender in sources.items():
                if number not in numbers:
                    continue
                profile = existing.get(number)
                if profile is not None and str(profile.gender or '').strip():
                    preserved += 1
                    continue
                if profile is None:
                    profile = StudentProfile(enrollment_id=number, gender=gender)
                    creates.append(profile)
                    audit.append({'action': 'create', 'enrollment_no': number, 'gender': gender})
                else:
                    audit.append({'action': 'update', 'id': profile.pk, 'enrollment_no': number,
                                  'old_gender': profile.gender, 'old_updated_at': profile.updated_at.isoformat(),
                                  'gender': gender})
                    profile.gender = gender
                    profile.updated_at = now
                    updates.append(profile)
            result = {'mode': 'apply' if apply else 'dry-run', 'update_profiles': len(updates),
                      'create_profiles': len(creates), 'preserve_nonempty_profiles': preserved,
                      'skip_conflicting_degree_enrollments': len(conflicts & numbers),
                      'skip_degree_without_enrollment': len(set(sources) - numbers)}
            if apply:
                # Write the recovery details before any database changes. Failure aborts the transaction.
                path = Path(options['audit'])
                try:
                    with path.open('x', encoding='utf-8') as stream:
                        json.dump({'prepared_at': now.isoformat(), 'summary': result, 'changes': audit}, stream, indent=2)
                except OSError as exc:
                    raise CommandError(f'Cannot create audit file: {exc}') from exc
                StudentProfile.objects.bulk_update(updates, ['gender', 'updated_at'], batch_size=500)
                StudentProfile.objects.bulk_create(creates, batch_size=500)
                expected = {row['enrollment_no']: row['gender'] for row in audit}
                actual = dict(StudentProfile.objects.filter(enrollment_id__in=expected).values_list('enrollment_id', 'gender'))
                if actual != expected:
                    raise CommandError('Verification failed; transaction rolled back.')
        self.stdout.write(json.dumps(result, sort_keys=True))
        if apply:
            self.stdout.write(self.style.SUCCESS('Committed and verified. Other profile fields and degree records unchanged.'))
