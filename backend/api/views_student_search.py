"""
Student Search View
Comprehensive student information search across all services
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q, Prefetch
from django.shortcuts import get_object_or_404

from .domain_enrollment import Enrollment, StudentProfile
from .domain_verification import Verification, InstVerificationStudent, InstVerificationMain, MigrationRecord, ProvisionalRecord
from .domain_courses import Institute, MainBranch, SubBranch
from .domain_documents import DocRec
from .search_utils import apply_fts_search

__all__ = ['StudentSearchViewSet']


class StudentSearchViewSet(viewsets.ViewSet):
    """
    Comprehensive student search endpoint
    Returns all student information including:
    - Personal details (name, institute, contact, email, etc.)
    - Services (Verification, Provisional, Migration, Inst. Verification, Degree)
    - Fees information
    """
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='search')
    def search_student(self, request):
        """
        Search student by enrollment number
        Query param: enrollment (required)
        
        Example: /api/student-search/search/?enrollment=19pharmd01021
        """
        enrollment_no = request.query_params.get('enrollment', '').strip()
        
        if not enrollment_no:
            return Response(
                {'error': 'Enrollment number is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Search enrollment using PostgreSQL FTS (100× faster than icontains)
            # Falls back to traditional search if FTS not available
            queryset = Enrollment.objects.select_related(
                'institute',
                'maincourse',
                'subcourse',
                'student_profile'
            )
            
            # Apply FTS search on enrollment_no, temp_enroll_no, student_name
            enrollment = apply_fts_search(
                queryset=queryset,
                search_query=enrollment_no,
                search_fields=['search_vector'],  # FTS field
                fallback_fields=['enrollment_no', 'temp_enroll_no']  # Fallback to icontains
            ).first()

            if not enrollment:
                return Response(
                    {'error': 'Student not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Build comprehensive response
            result = {
                'general': self._get_general_info(enrollment),
                'services': self._get_services_info(enrollment),
                'fees': self._get_fees_info(enrollment),
            }

            return Response(result, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {'error': f'Error fetching student data: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _get_general_info(self, enrollment):
        """Extract general student information"""
        profile = getattr(enrollment, 'student_profile', None)
        institute = enrollment.institute
        
        return {
            'enrollment_no': enrollment.enrollment_no or '',
            'temp_enrollment_no': enrollment.temp_enroll_no or '',
            'student_name': enrollment.student_name or '',
            'institute_name': institute.institute_name if institute else '',
            'institute_code': institute.institute_code if institute else '',
            'institute_address': getattr(institute, 'institute_address', '') if institute else '',
            'institute_city': getattr(institute, 'institute_city', '') if institute else '',
            'maincourse': enrollment.maincourse.course_name if enrollment.maincourse else '',
            'subcourse': enrollment.subcourse.subcourse_name if enrollment.subcourse else '',
            'batch': enrollment.batch or '',
            'admission_date': enrollment.admission_date.strftime('%Y-%m-%d') if enrollment.admission_date else '',
            'enrollment_date': enrollment.enrollment_date.strftime('%Y-%m-%d') if enrollment.enrollment_date else '',
            
            # Profile information
            'contact_no': profile.contact_no if profile else '',
            'email': profile.email if profile else '',
            'gender': profile.gender if profile else '',
            'birth_date': profile.birth_date.strftime('%Y-%m-%d') if profile and profile.birth_date else '',
            'mother_name': profile.mother_name if profile else '',
            'father_name': profile.name_adhar if profile else '',  # Assuming name_adhar contains father name
            'aadhar_no': profile.aadhar_no if profile else '',
            'address1': profile.address1 if profile else '',
            'address2': profile.address2 if profile else '',
            'city1': profile.city1 if profile else '',
            'city2': profile.city2 if profile else '',
            'category': profile.category if profile else '',
            'abc_id': profile.abc_id if profile else '',
        }

    def _get_services_info(self, enrollment):
        """Extract all service records for the student"""
        enroll_no = enrollment.enrollment_no or enrollment.temp_enroll_no
        
        # Verification records
        verifications = Verification.objects.filter(
            Q(enrollment_no__iexact=enroll_no) | Q(second_enrollment_id__iexact=enroll_no)
        ).select_related('doc_rec').order_by('-createdat')
        
        verification_list = []
        for vr in verifications:
            verification_list.append({
                'id': vr.id,
                'doc_rec_id': vr.doc_rec.doc_rec_id if vr.doc_rec else '',
                'date': vr.doc_rec_date.strftime('%Y-%m-%d') if vr.doc_rec_date else '',
                'status': vr.status or '',
                'final_no': vr.final_no or '',
                'tr_count': vr.tr_count or 0,
                'ms_count': vr.ms_count or 0,
                'dg_count': vr.dg_count or 0,
                'moi_count': vr.moi_count or 0,
                'backlog_count': vr.backlog_count or 0,
                'vr_done_date': vr.vr_done_date.strftime('%Y-%m-%d') if vr.vr_done_date else '',
                'mail_status': vr.mail_status or '',
                'pay_rec_no': vr.pay_rec_no or '',
                'remark': vr.remark or '',
            })
        
        # Provisional records - use enrollment ForeignKey
        provisionals = ProvisionalRecord.objects.filter(
            enrollment__enrollment_no__iexact=enroll_no
        ).order_by('-created_at')
        
        provisional_list = []
        for pr in provisionals:
            provisional_list.append({
                'id': pr.id,
                'doc_rec_id': pr.doc_rec or '',
                'date': pr.prv_date.strftime('%Y-%m-%d') if pr.prv_date else '',
                'status': pr.prv_status or '',
                'final_no': pr.prv_number or '',
                'remark': pr.doc_rec_remark or '',
            })
        
        # Migration records - use enrollment ForeignKey
        migrations = MigrationRecord.objects.filter(
            enrollment__enrollment_no__iexact=enroll_no
        ).order_by('-created_at')
        
        migration_list = []
        for mg in migrations:
            migration_list.append({
                'id': mg.id,
                'doc_rec_id': mg.doc_rec or '',
                'date': mg.mg_date.strftime('%Y-%m-%d') if mg.mg_date else '',
                'status': mg.mg_status or '',
                'final_no': mg.mg_number or '',
                'remark': mg.doc_rec_remark or '',
            })
        
        # Institutional Verification records
        inst_verifications = InstVerificationStudent.objects.filter(
            enrollment__enrollment_no__iexact=enroll_no
        ).select_related('doc_rec').order_by('-id')
        
        inst_verification_list = []
        for iv in inst_verifications:
            # Get the main record from the doc_rec relationship
            main_record = None
            if iv.doc_rec:
                main_record = InstVerificationMain.objects.filter(
                    doc_rec__doc_rec_id=iv.doc_rec.doc_rec_id
                ).first()
            
            inst_verification_list.append({
                'id': iv.id,
                'doc_rec_id': iv.doc_rec.doc_rec_id if iv.doc_rec else '',
                'date': main_record.inst_veri_date.strftime('%Y-%m-%d') if main_record and main_record.inst_veri_date else '',
                'status': iv.verification_status or '',
                'remark': '',
            })
        
        # Degree summary from verification records
        degree_list = []
        for vr in verifications:
            if vr.dg_count and vr.dg_count > 0:
                degree_list.append({
                    'id': vr.id,
                    'doc_rec_id': vr.doc_rec.doc_rec_id if vr.doc_rec else '',
                    'date': vr.doc_rec_date.strftime('%Y-%m-%d') if vr.doc_rec_date else '',
                    'degree_count': vr.dg_count,
                    'status': vr.status or '',
                    'final_no': vr.final_no or '',
                    'remark': vr.remark or '',
                })
        
        return {
            'verification': verification_list,
            'provisional': provisional_list,
            'migration': migration_list,
            'institutional_verification': inst_verification_list,
            'degree': degree_list,
        }

    def _get_fees_info(self, enrollment):
        """Extract fees information"""
        profile = getattr(enrollment, 'student_profile', None)
        
        return {
            'total_fees': float(profile.fees) if profile and profile.fees else 0.0,
            'hostel_required': profile.hostel_required if profile else False,
        }
