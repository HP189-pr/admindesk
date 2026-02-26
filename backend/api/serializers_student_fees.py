"""Serializers for Student Fees Management"""
from rest_framework import serializers
from django.db.models import Q
from .domain_fees_ledger import StudentFeesLedger
from .domain_enrollment import Enrollment


class StudentFeesLedgerSerializer(serializers.ModelSerializer):
    """
    Serializer for StudentFeesLedger model
    - Accepts student_no (enrollment_no or temp_enroll_no) as write-only field
    - Returns enrollment_no, temp_enroll_no, and student_name
    """
    # Write-only field for accepting student identifier
    student_no = serializers.CharField(
        write_only=True,
        required=True,
        help_text="Enrollment No or Temp Enrollment No"
    )
    
    # Read-only fields from related Enrollment
    enrollment_no = serializers.CharField(source='enrollment.enrollment_no', read_only=True)
    temp_enroll_no = serializers.CharField(source='enrollment.temp_enroll_no', read_only=True)
    student_name = serializers.CharField(source='enrollment.student_name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = StudentFeesLedger
        fields = [
            'id',
            'student_no',  # write-only
            'enrollment_no',  # read-only
            'temp_enroll_no',  # read-only
            'student_name',  # read-only
            'receipt_no',
            'receipt_date',
            'term',
            'amount',
            'remark',
            'created_at',
            'created_by_username'
        ]
        read_only_fields = [
            'id', 'enrollment_no', 'temp_enroll_no', 'student_name',
            'created_at', 'created_by_username'
        ]
    
    def validate_student_no(self, value):
        """
        Validate that student_no exists as enrollment_no or temp_enroll_no
        """
        if not value or not value.strip():
            raise serializers.ValidationError("Student number is required.")
        
        value = value.strip()
        
        # Try to find enrollment by enrollment_no first, then temp_enroll_no
        enrollment = Enrollment.objects.filter(
            Q(enrollment_no=value) | Q(temp_enroll_no=value)
        ).first()
        
        if not enrollment:
            raise serializers.ValidationError(
                f"Student with enrollment number '{value}' not found."
            )
        
        return value
    
    def validate_receipt_no(self, value):
        """
        Validate receipt number is unique when provided
        """
        if value in (None, ""):
            return value

        value = value.strip()
        if not value:
            return None

        # Check uniqueness (exclude current instance during update)
        queryset = StudentFeesLedger.objects.filter(receipt_no=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(
                f"Receipt number '{value}' already exists."
            )

        return value
    
    def validate_amount(self, value):
        """
        Validate amount is positive when provided
        """
        if value is None:
            return value
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate(self, attrs):
        """
        Require at least one of receipt_no, receipt_date, or amount
        """
        receipt_no = attrs.get("receipt_no", getattr(self.instance, "receipt_no", None))
        receipt_date = attrs.get("receipt_date", getattr(self.instance, "receipt_date", None))
        amount = attrs.get("amount", getattr(self.instance, "amount", None))

        if not receipt_no and not receipt_date and amount in (None, ""):
            raise serializers.ValidationError(
                "Provide at least one of receipt_no, receipt_date, or amount."
            )

        return attrs
    
    def create(self, validated_data):
        """
        Create fee ledger entry
        - Resolve student_no to Enrollment
        - Set created_by from request user
        """
        student_no = validated_data.pop('student_no')
        
        # Find enrollment (enrollment_no takes precedence)
        enrollment = Enrollment.objects.filter(enrollment_no=student_no).first()
        if not enrollment:
            enrollment = Enrollment.objects.filter(temp_enroll_no=student_no).first()
        
        # Set enrollment and created_by
        validated_data['enrollment'] = enrollment
        
        # Get user from context
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data['created_by'] = request.user
        
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        """
        Update fee ledger entry
        - student_no can be updated to change enrollment reference
        """
        student_no = validated_data.pop('student_no', None)
        
        if student_no:
            # Find enrollment (enrollment_no takes precedence)
            enrollment = Enrollment.objects.filter(enrollment_no=student_no).first()
            if not enrollment:
                enrollment = Enrollment.objects.filter(temp_enroll_no=student_no).first()
            
            validated_data['enrollment'] = enrollment
        
        return super().update(instance, validated_data)


class StudentFeesSummarySerializer(serializers.Serializer):
    """
    Serializer for student fees summary
    """
    student_no = serializers.CharField()
    enrollment_no = serializers.CharField(allow_null=True)
    temp_enroll_no = serializers.CharField(allow_null=True)
    student_name = serializers.CharField()
    total_fees_paid = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_entries = serializers.IntegerField()
    first_payment_date = serializers.DateField(allow_null=True)
    last_payment_date = serializers.DateField(allow_null=True)
