import os
import uuid
import logging
import pandas as pd
from django.conf import settings
from django.utils import timezone
from django.db import transaction
from django.core.cache import cache
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from openpyxl import load_workbook
from .models import Institute, MainBranch, SubBranch, Enrollment
from .serializers import (
    InstituteSerializer, MainBranchSerializer, SubBranchSerializer, EnrollmentSerializer
)

logger = logging.getLogger(__name__)

# ✅ Institute ViewSet
class InstituteViewSet(viewsets.ModelViewSet):
    queryset = Institute.objects.all()
    serializer_class = InstituteSerializer

# ✅ Main Branch ViewSet
class MainBranchViewSet(viewsets.ModelViewSet):
    queryset = MainBranch.objects.all()
    serializer_class = MainBranchSerializer

# ✅ Sub Branch ViewSet
class SubBranchViewSet(viewsets.ModelViewSet):
    queryset = SubBranch.objects.all()
    serializer_class = SubBranchSerializer

# ✅ Enrollment ViewSet
class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = Enrollment.objects.all()
    serializer_class = EnrollmentSerializer
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['POST'], url_path='init-upload')
    def init_upload(self, request):
        """Initialize large file upload session."""
        try:
            uploaded_file = request.FILES.get('file')
            if not uploaded_file:
                return Response({"error": "No file provided in request"}, status=status.HTTP_400_BAD_REQUEST)

            # Validate file type
            valid_extensions = ['.xlsx', '.xls']
            file_ext = os.path.splitext(uploaded_file.name)[1].lower()
            if file_ext not in valid_extensions:
                return Response(
                    {"error": "Invalid file type. Only Excel files (.xlsx, .xls) are allowed"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Save file temporarily
            temp_dir = os.path.join(settings.MEDIA_ROOT, 'temp_uploads')
            os.makedirs(temp_dir, exist_ok=True)
            temp_filename = f"upload_{uuid.uuid4()}{file_ext}"
            temp_path = os.path.join(temp_dir, temp_filename)

            with open(temp_path, 'wb+') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)

            # Create upload session
            session_id = str(uuid.uuid4())
            cache_data = {
                'file_path': temp_path,
                'original_filename': uploaded_file.name,
                'user_id': request.user.id,
                'progress': 0,
                'stage': 'initialized',
                'created_at': timezone.now().isoformat()
            }
            cache.set(f"upload_{session_id}", cache_data, timeout=3600)

            return Response({
                'session_id': session_id,
                'original_filename': uploaded_file.name,
                'message': 'Upload initialized successfully'
            })

        except Exception as e:
            logger.error(f"Upload initialization failed: {str(e)}", exc_info=True)
            return Response(
                {"error": "Internal server error during upload initialization", "details": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['POST'], url_path='get-sheets')
    def get_sheets(self, request):
        """Retrieve sheet names from the uploaded Excel file."""
        session_id = request.data.get('session_id')
        if not session_id:
            return Response({"error": "Session ID required"}, status=status.HTTP_400_BAD_REQUEST)

        upload_data = cache.get(f"upload_{session_id}")
        if not upload_data:
            return Response({"error": "Invalid session"}, status=status.HTTP_404_NOT_FOUND)

        try:
            with load_workbook(upload_data['file_path'], read_only=True) as wb:
                return Response({'sheets': wb.sheetnames})
        except Exception as e:
            logger.error(f"Error reading sheets: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['POST'], url_path='get-columns')
    def get_columns(self, request):
        """Retrieve column headers from a specific sheet."""
        session_id = request.data.get('session_id')
        sheet_name = request.data.get('sheet_name')

        if not all([session_id, sheet_name]):
            return Response({"error": "Session ID and sheet name required"}, status=status.HTTP_400_BAD_REQUEST)

        upload_data = cache.get(f"upload_{session_id}")
        if not upload_data:
            return Response({"error": "Invalid session"}, status=status.HTTP_404_NOT_FOUND)

        try:
            df = pd.read_excel(upload_data['file_path'], sheet_name=sheet_name, nrows=1, engine='openpyxl')
            return Response({'columns': list(df.columns)})
        except Exception as e:
            logger.error(f"Error reading columns: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['POST'], url_path='process-chunk')
    def process_chunk(self, request):
        """Process data in chunks with progress tracking."""
        session_id = request.data.get('session_id')
        sheet_name = request.data.get('sheet_name')
        column_mapping = request.data.get('column_mapping', {})
        chunk_size = 1000

        if not all([session_id, sheet_name, column_mapping]):
            return Response({"error": "Missing required parameters"}, status=status.HTTP_400_BAD_REQUEST)

        upload_data = cache.get(f"upload_{session_id}")
        if not upload_data:
            return Response({"error": "Invalid session"}, status=status.HTTP_404_NOT_FOUND)

        try:
            results = {'total_processed': 0, 'success_count': 0, 'errors': []}

            for chunk in pd.read_excel(
                upload_data['file_path'], sheet_name=sheet_name, chunksize=chunk_size, engine='openpyxl'
            ):
                chunk = chunk.rename(columns={v: k for k, v in column_mapping.items()})
                chunk_results = self._process_chunk_data(chunk, request.user)

                results['total_processed'] += len(chunk)
                results['success_count'] += chunk_results['success_count']
                results['errors'].extend(chunk_results['errors'])

                cache.set(f"upload_{session_id}", {**upload_data, 'progress': results['total_processed']}, timeout=3600)

            return Response(results)
        except Exception as e:
            logger.error(f"Chunk processing failed: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _process_chunk_data(self, chunk, user):
        """Process a single chunk of data."""
        institutes = {str(i.id): i for i in Institute.objects.all()}
        maincourses = {str(m.id): m for m in MainBranch.objects.all()}
        subcourses = {str(s.id): s for s in SubBranch.objects.all()}

        successes = 0
        errors = []

        with transaction.atomic():
            for _, row in chunk.iterrows():
                try:
                    enrollment_no = str(row.get('enrollment_no', '')).strip()
                    if not enrollment_no:
                        raise ValueError("Missing enrollment_no")

                    if Enrollment.objects.filter(enrollment_no=enrollment_no).exists():
                        raise ValueError("Duplicate enrollment_no")

                    Enrollment.objects.create(
                        enrollment_no=enrollment_no,
                        student_name=row.get('student_name', ''),
                        institute=institutes.get(str(row.get('institute_id'))),
                        batch=int(row.get('batch', 0)),
                        admission_date=row.get('admission_date'),
                        subcourse=subcourses.get(str(row.get('subcourse_id'))),
                        maincourse=maincourses.get(str(row.get('maincourse_id'))),
                        updated_by=user
                    )
                    successes += 1
                except Exception as e:
                    errors.append({'row': _, 'error': str(e), 'data': dict(row.dropna())})

        return {'success_count': successes, 'errors': errors}
