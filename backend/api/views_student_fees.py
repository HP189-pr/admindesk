"""Views for Student Fees Management"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Sum, Count, Min, Max
from django.core.paginator import Paginator

from .domain_fees_ledger import StudentFeesLedger
from .domain_enrollment import Enrollment
from .serializers_student_fees import (
    StudentFeesLedgerSerializer,
    StudentFeesSummarySerializer
)


class StudentFeesViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Student Fees Ledger
    
    Endpoints:
    - GET /api/student-fees/ - List all fees (with filters)
    - POST /api/student-fees/ - Create new fee entry
    - GET /api/student-fees/{id}/ - Get specific fee entry
    - PUT/PATCH /api/student-fees/{id}/ - Update fee entry
    - DELETE /api/student-fees/{id}/ - Delete fee entry
    - GET /api/student-fees/summary/?student_no=XXX - Get fee summary for student
    """
    queryset = StudentFeesLedger.objects.all()
    serializer_class = StudentFeesLedgerSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """
        Filter queryset based on query parameters
        - Optimized with select_related for enrollment
        - Supports filtering by student_no, term, date range
        """
        queryset = StudentFeesLedger.objects.select_related(
            'enrollment',
            'created_by'
        ).all()
        
        # Filter by student number (enrollment_no or temp_enroll_no)
        student_no = self.request.query_params.get('student_no', None)
        if student_no:
            student_no = student_no.strip()
            # Find enrollment by enrollment_no or temp_enroll_no
            enrollments = Enrollment.objects.filter(
                Q(enrollment_no=student_no) | Q(temp_enroll_no=student_no)
            )
            if enrollments.exists():
                enrollment = enrollments.first()
                queryset = queryset.filter(enrollment=enrollment)
            else:
                # Return empty queryset if student not found
                return queryset.none()
        
        # Filter by term
        term = self.request.query_params.get('term', None)
        if term:
            queryset = queryset.filter(term__icontains=term.strip())
        
        # Filter by date range
        start_date = self.request.query_params.get('start_date', None)
        end_date = self.request.query_params.get('end_date', None)
        
        if start_date:
            queryset = queryset.filter(receipt_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(receipt_date__lte=end_date)
        
        # Filter by receipt number
        receipt_no = self.request.query_params.get('receipt_no', None)
        if receipt_no:
            queryset = queryset.filter(receipt_no__icontains=receipt_no.strip())
        
        return queryset.order_by('-receipt_date', '-id')
    
    def list(self, request, *args, **kwargs):
        """
        List fees with pagination
        """
        queryset = self.get_queryset()
        
        # Get pagination parameters
        page_size = int(request.query_params.get('page_size', 50))
        page = int(request.query_params.get('page', 1))
        
        # Paginate
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page)
        
        # Serialize
        serializer = self.get_serializer(page_obj.object_list, many=True)
        
        return Response({
            'count': paginator.count,
            'num_pages': paginator.num_pages,
            'current_page': page,
            'page_size': page_size,
            'results': serializer.data
        })
    
    def create(self, request, *args, **kwargs):
        """
        Create new fee entry
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        return Response(
            {
                'message': 'Fee entry created successfully',
                'data': serializer.data
            },
            status=status.HTTP_201_CREATED
        )
    
    def update(self, request, *args, **kwargs):
        """
        Update fee entry
        """
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        
        return Response({
            'message': 'Fee entry updated successfully',
            'data': serializer.data
        })
    
    def destroy(self, request, *args, **kwargs):
        """
        Delete fee entry
        """
        instance = self.get_object()
        receipt_no = instance.receipt_no
        self.perform_destroy(instance)
        
        return Response({
            'message': f'Fee entry {receipt_no} deleted successfully'
        }, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        Get fee summary for a student
        
        Query Parameters:
        - student_no: Enrollment No or Temp Enrollment No (required)
        
        Returns:
        - student_no: Provided student number
        - enrollment_no: Actual enrollment number
        - temp_enroll_no: Temporary enrollment number
        - student_name: Student name
        - total_fees_paid: Sum of all fee amounts
        - total_entries: Count of fee entries
        - first_payment_date: Earliest receipt date
        - last_payment_date: Latest receipt date
        """
        student_no = request.query_params.get('student_no', None)
        
        if not student_no:
            return Response(
                {'error': 'student_no parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        student_no = student_no.strip()
        
        # Find enrollment by enrollment_no or temp_enroll_no
        enrollment = Enrollment.objects.filter(
            Q(enrollment_no=student_no) | Q(temp_enroll_no=student_no)
        ).first()
        
        if not enrollment:
            return Response(
                {'error': f'Student with enrollment number "{student_no}" not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Aggregate fee data
        fee_aggregate = StudentFeesLedger.objects.filter(
            enrollment=enrollment
        ).aggregate(
            total_fees_paid=Sum('amount'),
            total_entries=Count('id'),
            first_payment_date=Min('receipt_date'),
            last_payment_date=Max('receipt_date')
        )
        
        # Prepare summary data
        summary_data = {
            'student_no': student_no,
            'enrollment_no': enrollment.enrollment_no,
            'temp_enroll_no': enrollment.temp_enroll_no,
            'student_name': enrollment.student_name,
            'total_fees_paid': fee_aggregate['total_fees_paid'] or 0,
            'total_entries': fee_aggregate['total_entries'] or 0,
            'first_payment_date': fee_aggregate['first_payment_date'],
            'last_payment_date': fee_aggregate['last_payment_date']
        }
        
        serializer = StudentFeesSummarySerializer(summary_data)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='by-term')
    def by_term(self, request):
        """
        Get fees grouped by term for a student
        
        Query Parameters:
        - student_no: Enrollment No or Temp Enrollment No (required)
        
        Returns:
        - List of terms with total amount and count
        """
        student_no = request.query_params.get('student_no', None)
        
        if not student_no:
            return Response(
                {'error': 'student_no parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        student_no = student_no.strip()
        
        # Find enrollment
        enrollment = Enrollment.objects.filter(
            Q(enrollment_no=student_no) | Q(temp_enroll_no=student_no)
        ).first()
        
        if not enrollment:
            return Response(
                {'error': f'Student with enrollment number "{student_no}" not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Group by term
        from django.db.models import Sum, Count
        term_summary = StudentFeesLedger.objects.filter(
            enrollment=enrollment
        ).values('term').annotate(
            total_amount=Sum('amount'),
            entry_count=Count('id')
        ).order_by('term')
        
        return Response({
            'student_name': enrollment.student_name,
            'enrollment_no': enrollment.enrollment_no,
            'temp_enroll_no': enrollment.temp_enroll_no,
            'terms': list(term_summary)
        })
