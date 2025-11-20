"""API views for Google Form / mail request submissions."""

from __future__ import annotations

import logging

from django.db import models
from django.db.models import Value, Q
from django.db.models.functions import Lower, Replace
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .domain_mail_request import GoogleFormSubmission
from .serializers_mail_request import GoogleFormSubmissionSerializer
from .sheets_sync import sync_mail_submission_to_sheet
from django.core.management import call_command

__all__ = [
    'GoogleFormSubmissionViewSet',
]


logger = logging.getLogger(__name__)


class GoogleFormSubmissionViewSet(viewsets.ModelViewSet):
    """CRUD endpoint for triaging Google Form submissions inside the admin workspace."""

    queryset = GoogleFormSubmission.objects.all().order_by('-submitted_at', '-id')
    serializer_class = GoogleFormSubmissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        params = getattr(self.request, 'query_params', {})

        status_param = (params.get('mail_status') or params.get('status') or '').strip().lower()
        if status_param:
            qs = qs.filter(mail_status=status_param)

        search_param = (params.get('search') or '').strip()
        if search_param:
            norm = ''.join(search_param.split()).lower()
            qs = qs.annotate(
                n_en=Replace(Lower(models.F('enrollment_no')), Value(' '), Value('')),
                n_name=Replace(Lower(models.F('student_name')), Value(' '), Value('')),
                n_mail=Replace(Lower(models.F('rec_official_mail')), Value(' '), Value('')),
            ).filter(
                Q(n_en__contains=norm) | Q(n_name__contains=norm) | Q(n_mail__contains=norm)
            )

        institute = (params.get('rec_institute_name') or '').strip()
        if institute:
            qs = qs.filter(rec_institute_name__icontains=institute)

        return qs

    @action(detail=True, methods=['post'], url_path='refresh-verification')
    def refresh_verification(self, request, *args, **kwargs):
        submission = self.get_object()
        submission.student_verification = submission.refresh_verification()
        submission.save(update_fields=['student_verification'])
        serializer = self.get_serializer(submission)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='bulk-refresh')
    def bulk_refresh(self, request):
        ids = request.data or []
        if not isinstance(ids, list):
            return Response({'detail': 'Expected a list of ids.'}, status=status.HTTP_400_BAD_REQUEST)
        submissions = GoogleFormSubmission.objects.filter(pk__in=ids)
        updated = []
        for submission in submissions:
            submission.student_verification = submission.refresh_verification()
            submission.save(update_fields=['student_verification'])
            updated.append(submission.pk)
        return Response({'updated_ids': updated}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='sync-from-sheet')
    def sync_from_sheet(self, request):
        """Trigger a sync from the configured Google Sheet into the database.

        This wraps the management command `import_mail_requests` so the UI can
        request an on-demand import. The call is synchronous and will block
        until the import completes; the response will indicate success or
        contain the error message on failure.
        """
        try:
            # Allow optional overrides from the request body
            sa_file = request.data.get('service_account_file') if isinstance(request.data, dict) else None
            sheet_url = request.data.get('sheet_url') if isinstance(request.data, dict) else None
            args = []
            if sa_file:
                args += ['--service-account-file', sa_file]
            if sheet_url:
                args += ['--sheet-url', sheet_url]
            # allow caller to request a safe refresh that skips pruning
            if isinstance(request.data, dict) and request.data.get('no_prune'):
                args += ['--no-prune']

            # Capture stdout/stderr from the management command so we can return it
            import io
            from django.core.management import CommandError

            buf = io.StringIO()
            try:
                call_command('import_mail_requests', *args, stdout=buf)
            except CommandError as ce:
                # Known command errors (missing config, auth) -> return 400 with message
                logger.warning('Import command failed: %s', ce)
                return Response({'detail': str(ce), 'output': buf.getvalue()}, status=status.HTTP_400_BAD_REQUEST)

            output = buf.getvalue()
            logger.info('Import mail requests completed via API: %s', output[:1000])
            return Response({'detail': 'Import completed', 'output': output}, status=status.HTTP_200_OK)
        except Exception as exc:  # pragma: no cover - runtime errors
            logger.exception('Failed to import mail requests from sheet: %s', exc)
            return Response({'detail': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        original_status = instance.mail_status
        original_remark = instance.remark

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        instance.refresh_from_db()
        changed = {}
        if instance.mail_status != original_status:
            changed['mail_status'] = instance.mail_status
        if (instance.remark or '') != (original_remark or ''):
            changed['remark'] = instance.remark

        if changed:
            try:
                sync_mail_submission_to_sheet(instance, changed)
            except Exception:  # pragma: no cover
                logger.exception("Failed to sync mail submission %s to Google Sheet", instance.pk)

        if getattr(instance, '_prefetched_objects_cache', None):  # pragma: no cover - defensive cleanup
            instance._prefetched_objects_cache = {}

        return Response(self.get_serializer(instance).data)
