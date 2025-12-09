"""
Inward/Outward Register Management System
Single file containing Models, Serializers, Views, and URL patterns
"""
from django.db import models
from django.db.models import Max
from rest_framework import serializers, viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django.urls import path
from datetime import datetime


# ==================== MODELS ====================

class InwardRegister(models.Model):
    """Inward Register Model"""
    TYPE_CHOICES = [
        ('Gen', 'General'),
        ('Exam', 'Examination'),
        ('Enr', 'Enrollment'),
        ('Can', 'Cancellation'),
        ('Doc', 'Document'),
    ]
    
    REC_TYPE_CHOICES = [
        ('Internal', 'Internal'),
        ('External', 'External'),
    ]
    
    inward_no = models.CharField(max_length=20, unique=True, editable=False)
    inward_date = models.DateField()
    inward_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    inward_from = models.CharField(max_length=255, verbose_name="Sender")
    rec_type = models.CharField(max_length=20, choices=REC_TYPE_CHOICES)
    details = models.TextField(blank=True, null=True)
    remark = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'inward_register'
        ordering = ['-inward_date', '-created_at']
        verbose_name = 'Inward Register'
        verbose_name_plural = 'Inward Registers'
    
    def __str__(self):
        return f"{self.inward_no} - {self.inward_from}"


class OutwardRegister(models.Model):
    """Outward Register Model"""
    TYPE_CHOICES = [
        ('Gen', 'General'),
        ('Exam', 'Examination'),
        ('Enr', 'Enrollment'),
        ('Can', 'Cancellation'),
        ('Doc', 'Document'),
    ]
    
    SEND_TYPE_CHOICES = [
        ('Internal', 'Internal'),
        ('External', 'External'),
    ]
    
    outward_no = models.CharField(max_length=20, unique=True, editable=False)
    outward_date = models.DateField()
    outward_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    outward_to = models.CharField(max_length=255, verbose_name="Receiver")
    send_type = models.CharField(max_length=20, choices=SEND_TYPE_CHOICES)
    details = models.TextField(blank=True, null=True)
    remark = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'outward_register'
        ordering = ['-outward_date', '-created_at']
        verbose_name = 'Outward Register'
        verbose_name_plural = 'Outward Registers'
    
    def __str__(self):
        return f"{self.outward_no} - {self.outward_to}"


# ==================== AUTO NUMBER GENERATOR ====================

def generate_running_no(model, doc_type, date_field='inward_date'):
    """
    Generate auto-incrementing number in format: YY/TYPE/0001
    
    Args:
        model: Django model class (InwardRegister or OutwardRegister)
        doc_type: Type value (Gen, Exam, Enr, Can, Doc)
        date_field: Name of the date field to extract year from
    
    Returns:
        str: Generated number like "25/Gen/0001"
    """
    # Get current year (last 2 digits)
    current_year = datetime.now().year % 100  # e.g., 2025 -> 25
    
    # Build prefix
    prefix = f"{current_year:02d}/{doc_type}/"
    
    # Find max sequence number for this year and type
    if model == InwardRegister:
        field_name = 'inward_no'
        type_field = 'inward_type'
    else:  # OutwardRegister
        field_name = 'outward_no'
        type_field = 'outward_type'
    
    # Get all records matching this year and type
    # Filter by prefix pattern to ensure we only get current year records
    existing = model.objects.filter(
        **{f'{type_field}': doc_type}
    ).filter(
        **{f'{field_name}__startswith': prefix}
    )
    
    if existing.exists():
        # Extract sequence numbers and find max
        max_no = existing.aggregate(Max(field_name))[f'{field_name}__max']
        if max_no:
            try:
                # Extract sequence from "25/Gen/0001" -> 0001
                last_seq = int(max_no.split('/')[-1])
                next_seq = last_seq + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            next_seq = 1
    else:
        next_seq = 1
    
    # Format: YY/TYPE/0001
    return f"{prefix}{next_seq:04d}"


# ==================== SERIALIZERS ====================

class InwardRegisterSerializer(serializers.ModelSerializer):
    """Serializer for Inward Register"""
    
    class Meta:
        model = InwardRegister
        fields = [
            'id', 'inward_no', 'inward_date', 'inward_type', 'inward_from',
            'rec_type', 'details', 'remark', 'created_at', 'updated_at'
        ]
        read_only_fields = ['inward_no', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        """Override create to auto-generate inward_no"""
        # Generate inward number
        inward_type = validated_data.get('inward_type')
        validated_data['inward_no'] = generate_running_no(InwardRegister, inward_type, 'inward_date')
        
        return super().create(validated_data)
    
    def validate_inward_type(self, value):
        """Validate inward_type is in allowed choices"""
        allowed = [choice[0] for choice in InwardRegister.TYPE_CHOICES]
        if value not in allowed:
            raise serializers.ValidationError(f"Invalid type. Must be one of: {', '.join(allowed)}")
        return value
    
    def validate_rec_type(self, value):
        """Validate rec_type is in allowed choices"""
        allowed = [choice[0] for choice in InwardRegister.REC_TYPE_CHOICES]
        if value not in allowed:
            raise serializers.ValidationError(f"Invalid rec_type. Must be one of: {', '.join(allowed)}")
        return value


class OutwardRegisterSerializer(serializers.ModelSerializer):
    """Serializer for Outward Register"""
    
    class Meta:
        model = OutwardRegister
        fields = [
            'id', 'outward_no', 'outward_date', 'outward_type', 'outward_to',
            'send_type', 'details', 'remark', 'created_at', 'updated_at'
        ]
        read_only_fields = ['outward_no', 'created_at', 'updated_at']
    
    def create(self, validated_data):
        """Override create to auto-generate outward_no"""
        # Generate outward number
        outward_type = validated_data.get('outward_type')
        validated_data['outward_no'] = generate_running_no(OutwardRegister, outward_type, 'outward_date')
        
        return super().create(validated_data)
    
    def validate_outward_type(self, value):
        """Validate outward_type is in allowed choices"""
        allowed = [choice[0] for choice in OutwardRegister.TYPE_CHOICES]
        if value not in allowed:
            raise serializers.ValidationError(f"Invalid type. Must be one of: {', '.join(allowed)}")
        return value
    
    def validate_send_type(self, value):
        """Validate send_type is in allowed choices"""
        allowed = [choice[0] for choice in OutwardRegister.SEND_TYPE_CHOICES]
        if value not in allowed:
            raise serializers.ValidationError(f"Invalid send_type. Must be one of: {', '.join(allowed)}")
        return value


# ==================== VIEWSETS ====================

class InwardRegisterViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Inward Register
    Supports: list, retrieve, create, update, delete
    Ordering: newest first
    Filtering: by date and type
    """
    queryset = InwardRegister.objects.all()
    serializer_class = InwardRegisterSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Apply filters if provided"""
        queryset = super().get_queryset()
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from', None)
        date_to = self.request.query_params.get('date_to', None)
        if date_from:
            queryset = queryset.filter(inward_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(inward_date__lte=date_to)
        
        # Filter by type
        inward_type = self.request.query_params.get('type', None)
        if inward_type:
            queryset = queryset.filter(inward_type=inward_type)
        
        # Filter by rec_type
        rec_type = self.request.query_params.get('rec_type', None)
        if rec_type:
            queryset = queryset.filter(rec_type=rec_type)
        
        # Search by inward_from
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(inward_from__icontains=search)
        
        return queryset
    
    @action(detail=False, methods=['get'], url_path='next-number')
    def next_number(self, request):
        """Get last and next inward number for given type"""
        inward_type = request.query_params.get('type', 'Gen')
        
        # Get current year prefix
        current_year = datetime.now().year % 100
        prefix = f"{current_year:02d}/{inward_type}/"
        
        # Find last number for this year and type
        last_record = InwardRegister.objects.filter(
            inward_type=inward_type,
            inward_no__startswith=prefix
        ).order_by('-inward_no').first()
        
        if last_record:
            last_no = last_record.inward_no
            try:
                last_seq = int(last_no.split('/')[-1])
                next_seq = last_seq + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            last_no = None
            next_seq = 1
        
        next_no = f"{prefix}{next_seq:04d}"
        
        return Response({
            'last_no': last_no,
            'next_no': next_no
        })


class OutwardRegisterViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Outward Register
    Supports: list, retrieve, create, update, delete
    Ordering: newest first
    Filtering: by date and type
    """
    queryset = OutwardRegister.objects.all()
    serializer_class = OutwardRegisterSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Apply filters if provided"""
        queryset = super().get_queryset()
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from', None)
        date_to = self.request.query_params.get('date_to', None)
        if date_from:
            queryset = queryset.filter(outward_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(outward_date__lte=date_to)
        
        # Filter by type
        outward_type = self.request.query_params.get('type', None)
        if outward_type:
            queryset = queryset.filter(outward_type=outward_type)
        
        # Filter by send_type
        send_type = self.request.query_params.get('send_type', None)
        if send_type:
            queryset = queryset.filter(send_type=send_type)
        
        # Search by outward_to
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(outward_to__icontains=search)
        
        return queryset
    
    @action(detail=False, methods=['get'], url_path='next-number')
    def next_number(self, request):
        """Get last and next outward number for given type"""
        outward_type = request.query_params.get('type', 'Gen')
        
        # Get current year prefix
        current_year = datetime.now().year % 100
        prefix = f"{current_year:02d}/{outward_type}/"
        
        # Find last number for this year and type
        last_record = OutwardRegister.objects.filter(
            outward_type=outward_type,
            outward_no__startswith=prefix
        ).order_by('-outward_no').first()
        
        if last_record:
            last_no = last_record.outward_no
            try:
                last_seq = int(last_no.split('/')[-1])
                next_seq = last_seq + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            last_no = None
            next_seq = 1
        
        next_no = f"{prefix}{next_seq:04d}"
        
        return Response({
            'last_no': last_no,
            'next_no': next_no
        })


# ==================== URL PATTERNS ====================

IN_OUT_REGISTER_URLS = [
    path("inward-register/", InwardRegisterViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='inward-register-list'),
    
    path("inward-register/next-number/", InwardRegisterViewSet.as_view({
        'get': 'next_number'
    }), name='inward-register-next-number'),
    
    path("inward-register/<int:pk>/", InwardRegisterViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='inward-register-detail'),
    
    path("outward-register/", OutwardRegisterViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='outward-register-list'),
    
    path("outward-register/next-number/", OutwardRegisterViewSet.as_view({
        'get': 'next_number'
    }), name='outward-register-next-number'),
    
    path("outward-register/<int:pk>/", OutwardRegisterViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='outward-register-detail'),
]
