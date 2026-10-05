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
        gender = normalize_gender(raw)
        key = normalize_enrollment_number(number)
        if key and gender:
            values.setdefault(key, set()).add(gender)
    return ({number: next(iter(genders)) for number, genders in values.items() if len(genders) == 1},
            {number for number, genders in values.items() if len(genders) > 1})


def normalize_gender(value):
    """Return the supported canonical gender or None for missing/unsupported input."""
    return {
        'm': 'Male',
        'male': 'Male',
        'f': 'Female',
        'female': 'Female',
    }.get(str(value or '').strip().casefold())


def normalize_enrollment_number(value):
    return str(value or '').strip().casefold() or None


def fallback_gender(profile_gender, degree_gender):
    """Return a degree gender only when the profile value is blank."""
    if str(profile_gender or '').strip():
        return None
    return degree_gender


class Command(BaseCommand):
    help = 'Backfill only NULL/blank existing profile genders from matching degree records.'

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
            numbers = {
                normalize_enrollment_number(number)
                for number in enrollments.values_list('enrollment_no', flat=True)
            }
            existing = {
                normalize_enrollment_number(profile.enrollment_id): profile
                for profile in profiles
            }
            sources, conflicts = degree_genders(StudentDegree.objects.values_list('enrollment_no', 'dg_gender').iterator())
            updates, audit = [], []
            preserved = 0
            now = timezone.now()
            for number, gender in sources.items():
                if number not in numbers:
                    continue
                profile = existing.get(number)
                if profile is None:
                    continue
                target_gender = fallback_gender(profile.gender, gender)
                if target_gender is None:
                    preserved += 1
                    continue
                audit.append({'action': 'update', 'id': profile.pk, 'enrollment_no': profile.enrollment_id,
                              'old_gender': profile.gender, 'old_updated_at': profile.updated_at.isoformat(),
                              'gender': target_gender})
                profile.gender = target_gender
                profile.updated_at = now
                updates.append(profile)
            result = {'mode': 'apply' if apply else 'dry-run', 'update_profiles': len(updates),
                      'create_profiles': 0, 'preserve_nonempty_profiles': preserved,
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
                expected = {
                    normalize_enrollment_number(row['enrollment_no']): row['gender']
                    for row in audit
                }
                actual = {
                    normalize_enrollment_number(enrollment_id): gender
                    for enrollment_id, gender in StudentProfile.objects.filter(
                        enrollment_id__in=[row['enrollment_no'] for row in audit]
                    ).values_list('enrollment_id', 'gender')
                }
                if actual != expected:
                    raise CommandError('Verification failed; transaction rolled back.')
        self.stdout.write(json.dumps(result, sort_keys=True))
        if apply:
            self.stdout.write(self.style.SUCCESS('Committed and verified. Other profile fields and degree records unchanged.'))
