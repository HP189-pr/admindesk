"""Views for Degree Management"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Count
from django.core.paginator import Paginator
import csv
import io

from .domain_degree import StudentDegree, ConvocationMaster
from .serializers_degree import (
    StudentDegreeSerializer,
    StudentDegreeDetailSerializer,
    ConvocationMasterSerializer,
    BulkDegreeUploadSerializer
)
from .search_utils import apply_fts_search


class ConvocationMasterViewSet(viewsets.ModelViewSet):
    """ViewSet for Convocation Master"""
    queryset = ConvocationMaster.objects.all()
    serializer_class = ConvocationMasterSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter queryset based on query params"""
        queryset = ConvocationMaster.objects.all()
        
        # Search
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(convocation_no__icontains=search) |
                Q(convocation_title__icontains=search) |
                Q(month_year__icontains=search)
            )
        
        # Filter by year
        year = self.request.query_params.get('year', None)
        if year:
            queryset = queryset.filter(convocation_date__year=year)
        
        return queryset.order_by('-convocation_date')
    
    @action(detail=False, methods=['get'])
    def list_all(self, request):
        """Get all convocations for dropdown"""
        convocations = ConvocationMaster.objects.all().order_by('-convocation_no')
        serializer = self.get_serializer(convocations, many=True)
        return Response(serializer.data)


class StudentDegreeViewSet(viewsets.ModelViewSet):
    """ViewSet for Student Degree"""
    queryset = StudentDegree.objects.all()
    serializer_class = StudentDegreeSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        """Return appropriate serializer"""
        if self.action == 'retrieve':
            return StudentDegreeDetailSerializer
        return StudentDegreeSerializer
    
    def get_queryset(self):
        """Filter queryset based on query params"""
        queryset = StudentDegree.objects.all()
        
        # Search with PostgreSQL FTS (100× faster)
        search = self.request.query_params.get('search', None)
        if search:
            queryset = apply_fts_search(
                queryset=queryset,
                search_query=search,
                search_fields=['search_vector'],  # FTS field
                fallback_fields=['enrollment_no', 'student_name_dg', 'dg_sr_no', 'degree_name', 'institute_name_dg']
            )
        
        # Filter by enrollment
        enrollment = self.request.query_params.get('enrollment_no', None)
        if enrollment:
            queryset = queryset.filter(enrollment_no__iexact=enrollment)
        
        # Filter by convocation
        convocation_no = self.request.query_params.get('convocation_no', None)
        if convocation_no:
            queryset = queryset.filter(convocation_no=convocation_no)
        
        # Filter by exam year
        exam_year = self.request.query_params.get('last_exam_year', None)
        if exam_year:
            queryset = queryset.filter(last_exam_year=exam_year)
        
        # Filter by degree name
        degree_name = self.request.query_params.get('degree_name', None)
        if degree_name:
            queryset = queryset.filter(degree_name__icontains=degree_name)
        
        return queryset.order_by('-id')
    
    def list(self, request, *args, **kwargs):
        """List with pagination"""
        queryset = self.filter_queryset(self.get_queryset())
        
        # Get page size from request or default to 50
        page_size = int(request.query_params.get('page_size', 50))
        page_number = int(request.query_params.get('page', 1))
        
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page_number)
        
        serializer = self.get_serializer(page_obj, many=True)
        
        return Response({
            'count': paginator.count,
            'num_pages': paginator.num_pages,
            'current_page': page_number,
            'results': serializer.data
        })
    
    @action(detail=False, methods=['post'])
    def bulk_upload(self, request):
        """Bulk upload degrees from CSV file"""
        serializer = BulkDegreeUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        csv_file = request.FILES['file']
        
        try:
            # Read CSV file
            decoded_file = csv_file.read().decode('utf-8')
            io_string = io.StringIO(decoded_file)
            reader = csv.DictReader(io_string)
            
            created_count = 0
            updated_count = 0
            errors = []
            
            for row_num, row in enumerate(reader, start=2):
                try:
                    enrollment_no = row.get('enrollment_no', '').strip()
                    if not enrollment_no:
                        errors.append(f"Row {row_num}: Enrollment number is required")
                        continue
                    
                    # Prepare data
                    degree_data = {
                        'dg_sr_no': row.get('dg_sr_no', '').strip() or None,
                        'enrollment_no': enrollment_no,
                        'student_name_dg': row.get('student_name_dg', '').strip() or None,
                        'dg_address': row.get('dg_address', '').strip() or None,
                        'institute_name_dg': row.get('institute_name_dg', '').strip() or None,
                        'degree_name': row.get('degree_name', '').strip() or None,
                        'specialisation': row.get('specialisation', '').strip() or None,
                        'seat_last_exam': row.get('seat_last_exam', '').strip() or None,
                        'last_exam_month': row.get('last_exam_month', '').strip() or None,
                        'last_exam_year': int(row.get('last_exam_year', 0)) if row.get('last_exam_year', '').strip() else None,
                        'class_obtain': row.get('class_obtain', '').strip() or None,
                        'course_language': row.get('course_language', '').strip() or None,
                        'dg_rec_no': row.get('dg_rec_no', '').strip() or None,
                        'dg_gender': row.get('dg_gender', '').strip() or None,
                        'convocation_no': int(row.get('convocation_no', 0)) if row.get('convocation_no', '').strip() else None,
                    }
                    
                    # Check if record exists
                    dg_sr_no = degree_data.get('dg_sr_no')
                    if dg_sr_no:
                        existing = StudentDegree.objects.filter(dg_sr_no=dg_sr_no).first()
                        if existing:
                            # Update existing record
                            for key, value in degree_data.items():
                                setattr(existing, key, value)
                            existing.save()
                            updated_count += 1
                        else:
                            # Create new record
                            StudentDegree.objects.create(**degree_data)
                            created_count += 1
                    else:
                        # Create new record without dg_sr_no
                        StudentDegree.objects.create(**degree_data)
                        created_count += 1
                
                except Exception as e:
                    errors.append(f"Row {row_num}: {str(e)}")
            
            return Response({
                'message': 'Bulk upload completed',
                'created': created_count,
                'updated': updated_count,
                'errors': errors
            }, status=status.HTTP_200_OK)
        
        except Exception as e:
            return Response({
                'error': f'Error processing file: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get degree statistics"""
        total_degrees = StudentDegree.objects.count()
        
        # Count by convocation
        by_convocation = StudentDegree.objects.values('convocation_no').annotate(
            count=Count('id')
        ).order_by('-convocation_no')
        
        # Count by degree name
        by_degree = StudentDegree.objects.values('degree_name').annotate(
            count=Count('id')
        ).order_by('-count')[:10]
        
        # Count by exam year
        by_year = StudentDegree.objects.values('last_exam_year').annotate(
            count=Count('id')
        ).order_by('-last_exam_year')[:10]
        
        return Response({
            'total_degrees': total_degrees,
            'by_convocation': list(by_convocation),
            'by_degree_name': list(by_degree),
            'by_exam_year': list(by_year)
        })
    
    @action(detail=False, methods=['get'])
    def search_by_enrollment(self, request):
        """Search degrees by enrollment number"""
        enrollment = request.query_params.get('enrollment_no', None)
        if not enrollment:
            return Response({'error': 'Enrollment number is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        degrees = StudentDegree.objects.filter(enrollment_no__iexact=enrollment)
        serializer = self.get_serializer(degrees, many=True)
        
        return Response({
            'enrollment_no': enrollment,
            'count': degrees.count(),
            'degrees': serializer.data
        })
