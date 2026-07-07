# backend/api/in_out_register.py
"""
Inward/Outward Register Management System
Single file containing Models, Serializers, Views, and URL patterns
"""
from django.db import models
from django.db.models import Q
from rest_framework import serializers, viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from django.urls import path
from datetime import datetime
import re


TYPE_CHOICES = [
    ("GEN", "General"),
    ("ENR", "Enrollment"),
    ("CAN", "Cancellation"),
    ("TRN", "Transfer"),
    ("EXAM", "Examination"),
    ("APPT", "Appointment"),
    ("FEE", "Fees"),
]

SERIES_GROUPS = {
    "GEN": "GENERAL",
    "ENR": "STUDENT",
    "CAN": "STUDENT",
    "TRN": "STUDENT",
    "EXAM": "EXAM",
    "APPT": "APPOINTMENT",
    "FEE": "FEES",
}

SERIES_DIGITS = 4


# ==================== MODELS ====================

class InwardRegister(models.Model):
    """Inward Register Model"""
    TYPE_CHOICES = TYPE_CHOICES
    
    REC_TYPE_CHOICES = [
        ('Internal', 'Internal'),
        ('External', 'External'),
    ]
    
    in_common_ref = models.CharField(max_length=30, unique=True, db_index=True)
    inward_no = models.CharField(max_length=30, unique=True, editable=False, db_index=True)
    inward_date = models.DateField()
    inward_type = models.CharField(max_length=20, choices=TYPE_CHOICES, db_index=True)
    inward_from = models.CharField(max_length=255, verbose_name="Sender")
    rec_type = models.CharField(max_length=20, choices=REC_TYPE_CHOICES, blank=True, default='')
    details = models.TextField(blank=True, null=True)
    remark = models.TextField(blank=True, null=True)
    extra_data = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
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
    TYPE_CHOICES = TYPE_CHOICES
    
    SEND_TYPE_CHOICES = [
        ('Internal', 'Internal'),
        ('External', 'External'),
    ]
    
    out_common_ref = models.CharField(max_length=30, unique=True, db_index=True)
    outward_no = models.CharField(max_length=30, unique=True, editable=False, db_index=True)
    outward_date = models.DateField()
    outward_type = models.CharField(max_length=20, choices=TYPE_CHOICES, db_index=True)
    outward_to = models.CharField(max_length=255, verbose_name="Receiver")
    send_type = models.CharField(max_length=20, choices=SEND_TYPE_CHOICES, blank=True, default='')
    details = models.TextField(blank=True, null=True)
    remark = models.TextField(blank=True, null=True)
    extra_data = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'outward_register'
        ordering = ['-outward_date', '-created_at']
        verbose_name = 'Outward Register'
        verbose_name_plural = 'Outward Registers'
    
    def __str__(self):
        return f"{self.outward_no} - {self.outward_to}"


def _get_external_party_suggestions(search):
    search_value = (search or '').strip()
    if len(search_value) < 3:
        return []

    names = []
    inward_queryset = InwardRegister.objects.filter(
        inward_from__icontains=search_value
    ).order_by('-created_at').values_list('inward_from', flat=True).distinct()[:10]

    outward_queryset = OutwardRegister.objects.filter(
        outward_to__icontains=search_value
    ).order_by('-created_at').values_list('outward_to', flat=True).distinct()[:10]

    for candidate in list(inward_queryset) + list(outward_queryset):
        if not candidate:
            continue
        if candidate not in names:
            names.append(candidate)
        if len(names) >= 10:
            break

    return names


def _get_json_field_suggestions(search, field_name, min_chars):
    """
    Helper to get suggestions from a JSON field in both Inward and Outward registers.
    Searches across both registers, combines results, sorts by creation date (newest first),
    deduplicates, and returns up to 10 suggestions.
    """
    search_value = (search or '').strip()
    if len(search_value) < min_chars:
        return []

    # Using key transforms to query the JSONField
    inward_key = f'extra_data__{field_name}'
    outward_key = f'extra_data__{field_name}'

    inward_values = InwardRegister.objects.filter(
        **{f'{inward_key}__icontains': search_value}
    ).values('created_at', inward_key)

    outward_values = OutwardRegister.objects.filter(
        **{f'{outward_key}__icontains': search_value}
    ).values('created_at', outward_key)

    # Combine, sort, deduplicate
    combined = sorted(
        list(inward_values) + list(outward_values),
        key=lambda x: x['created_at'],
        reverse=True
    )

    unique_items = []
    seen = set()
    for item in combined:
        value = item.get(inward_key) or item.get(outward_key)
        if value and value not in seen:
            unique_items.append(value)
            seen.add(value)
        if len(unique_items) >= 10:
            break
            
    return unique_items


def _get_file_no_suggestions(search):
    """Search for 'file_no' suggestions."""
    return _get_json_field_suggestions(search, 'file_no', 2)


def _get_place_suggestions(search):
    """Search for 'place' suggestions."""
    return _get_json_field_suggestions(search, 'place', 3)


# ==================== AUTO NUMBER GENERATOR ====================

def get_series_group(doc_type):
    """Return the numbering series group for a document type."""
    normalized = str(doc_type or '').strip().upper()
    return SERIES_GROUPS.get(normalized, normalized)


def _current_year(year=None):
    return year or datetime.now().year


def _parse_sequence(value, *, expected_year=None, common=False):
    if not value:
        return None
    parts = str(value).split('/')
    expected_len = 4
    if len(parts) != expected_len or parts[0] != 'KSV':
        return None
    try:
        year_part = int(parts[1] if common else parts[2])
    except (TypeError, ValueError):
        return None

    sequence_match = re.match(r'(\d+)', str(parts[-1] or ''))
    if not sequence_match:
        return None

    sequence = int(sequence_match.group(1))
    if expected_year is not None and year_part != expected_year:
        return None
    return sequence


def _format_common_ref(doc_type, sequence, year=None):
    return f"KSV/{_current_year(year)}/{str(doc_type).upper()}/{sequence:0{SERIES_DIGITS}d}"


def _format_series_no(doc_type, sequence, year=None):
    return f"KSV/{str(doc_type).upper()}/{_current_year(year)}/{sequence:0{SERIES_DIGITS}d}"


def _get_next_common_sequence(model, field_name, year=None):
    target_year = _current_year(year)
    prefix = f"KSV/{target_year}/"
    max_seq = 0
    last_ref = None
    refs = model.objects.filter(
        **{f'{field_name}__startswith': prefix}
    ).values_list(field_name, flat=True)

    for ref in refs:
        seq = _parse_sequence(ref, expected_year=target_year, common=True)
        if seq is not None and seq > max_seq:
            max_seq = seq
            last_ref = ref

    return max_seq + 1, last_ref


def _get_next_series_sequence(model, number_field, type_field, group, year=None):
    target_year = _current_year(year)
    group_types = [doc_type for doc_type, series_group in SERIES_GROUPS.items() if series_group == group]
    max_seq = 0
    last_no = None
    records = model.objects.filter(
        **{f'{type_field}__in': group_types}
    ).values_list(number_field, flat=True)

    for number in records:
        seq = _parse_sequence(number, expected_year=target_year, common=False)
        if seq is not None and seq > max_seq:
            max_seq = seq
            last_no = number

    return max_seq + 1, last_no


def get_next_common_sequence(model=None, field_name=None, year=None):
    """Return the next common sequence and last common reference for a register."""
    model = model or InwardRegister
    field_name = field_name or 'in_common_ref'
    return _get_next_common_sequence(model, field_name, year)


def get_next_series_sequence(group, model=None, number_field=None, type_field=None, year=None):
    """Return the next series sequence and last series number for a register group."""
    model = model or InwardRegister
    number_field = number_field or 'inward_no'
    type_field = type_field or 'inward_type'
    return _get_next_series_sequence(model, number_field, type_field, group, year)


def generate_in_common_ref(doc_type):
    sequence, _last_ref = get_next_common_sequence(InwardRegister, 'in_common_ref')
    return _format_common_ref(doc_type, sequence)


def generate_out_common_ref(doc_type):
    sequence, _last_ref = get_next_common_sequence(OutwardRegister, 'out_common_ref')
    return _format_common_ref(doc_type, sequence)


def generate_inward_no(doc_type):
    group = get_series_group(doc_type)
    sequence, _last_no = get_next_series_sequence(group, InwardRegister, 'inward_no', 'inward_type')
    return _format_series_no(doc_type, sequence)


def generate_outward_no(doc_type):
    group = get_series_group(doc_type)
    sequence, _last_no = get_next_series_sequence(group, OutwardRegister, 'outward_no', 'outward_type')
    return _format_series_no(doc_type, sequence)


# ==================== SERIALIZERS ====================

class InwardRegisterSerializer(serializers.ModelSerializer):
    """Serializer for Inward Register"""
    
    class Meta:
        model = InwardRegister
        fields = [
            'id', 'in_common_ref', 'inward_no', 'inward_date', 'inward_type',
            'inward_from', 'rec_type', 'details', 'remark', 'extra_data',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['inward_no', 'created_at', 'updated_at']
        extra_kwargs = {
            'in_common_ref': {'required': False, 'allow_blank': True},
            'rec_type': {'required': False, 'allow_blank': True, 'default': ''},
        }
    
    def create(self, validated_data):
        """Override create to auto-generate inward reference numbers."""
        inward_type = validated_data.get('inward_type')
        common_ref = (validated_data.get('in_common_ref') or '').strip()
        validated_data['in_common_ref'] = common_ref or generate_in_common_ref(inward_type)
        validated_data['inward_no'] = generate_inward_no(inward_type)
        
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if validated_data.get('in_common_ref') == '':
            validated_data.pop('in_common_ref')
        return super().update(instance, validated_data)
    
    def validate_inward_type(self, value):
        """Validate inward_type is in allowed choices"""
        allowed = [choice[0] for choice in InwardRegister.TYPE_CHOICES]
        if value not in allowed:
            raise serializers.ValidationError(f"Invalid type. Must be one of: {', '.join(allowed)}")
        return value
    
    def validate_rec_type(self, value):
        """Validate rec_type is in allowed choices"""
        if not value:
            return value
        allowed = [choice[0] for choice in InwardRegister.REC_TYPE_CHOICES]
        if value not in allowed:
            raise serializers.ValidationError(f"Invalid rec_type. Must be one of: {', '.join(allowed)}")
        return value


class OutwardRegisterSerializer(serializers.ModelSerializer):
    """Serializer for Outward Register"""
    
    class Meta:
        model = OutwardRegister
        fields = [
            'id', 'out_common_ref', 'outward_no', 'outward_date', 'outward_type',
            'outward_to', 'send_type', 'details', 'remark', 'extra_data',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['outward_no', 'created_at', 'updated_at']
        extra_kwargs = {
            'out_common_ref': {'required': False, 'allow_blank': True},
            'send_type': {'required': False, 'allow_blank': True, 'default': ''},
        }
    
    def create(self, validated_data):
        """Override create to auto-generate outward reference numbers."""
        outward_type = validated_data.get('outward_type')
        common_ref = (validated_data.get('out_common_ref') or '').strip()
        validated_data['out_common_ref'] = common_ref or generate_out_common_ref(outward_type)
        validated_data['outward_no'] = generate_outward_no(outward_type)
        
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if validated_data.get('out_common_ref') == '':
            validated_data.pop('out_common_ref')
        return super().update(instance, validated_data)
    
    def validate_outward_type(self, value):
        """Validate outward_type is in allowed choices"""
        allowed = [choice[0] for choice in OutwardRegister.TYPE_CHOICES]
        if value not in allowed:
            raise serializers.ValidationError(f"Invalid type. Must be one of: {', '.join(allowed)}")
        return value
    
    def validate_send_type(self, value):
        """Validate send_type is in allowed choices"""
        if not value:
            return value
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
            queryset = queryset.filter(
                Q(inward_from__icontains=search) |
                Q(extra_data__file_no__icontains=search) |
                Q(extra_data__place__icontains=search)
            )
        
        return queryset
    
    @action(detail=False, methods=['get'], url_path='search-file-no')
    def search_file_no(self, request):
        search = request.query_params.get('search', '')
        results = _get_file_no_suggestions(search)
        return Response(results)

    @action(detail=False, methods=['get'], url_path='search-place')
    def search_place(self, request):
        search = request.query_params.get('search', '')
        results = _get_place_suggestions(search)
        return Response(results)
    
    @action(detail=False, methods=['get'], url_path='search-receivers')
    def search_receivers(self, request):
        search = request.query_params.get('search', '')
        results = _get_external_party_suggestions(search)
        return Response(results)
    
    @action(detail=False, methods=['get'], url_path='next-number')
    def next_number(self, request):
        """Get last and next inward number for given type"""
        inward_type = request.query_params.get('type', 'GEN').strip().upper()
        series_group = get_series_group(inward_type)
        common_sequence, last_common_ref = get_next_common_sequence(InwardRegister, 'in_common_ref')
        series_sequence, last_no = get_next_series_sequence(
            series_group,
            InwardRegister,
            'inward_no',
            'inward_type'
        )

        return Response({
            'last_common_ref': last_common_ref,
            'next_common_ref': _format_common_ref(inward_type, common_sequence),
            'last_no': last_no,
            'next_no': _format_series_no(inward_type, series_sequence),
            'series_group': series_group,
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
            queryset = queryset.filter(
                Q(outward_to__icontains=search) |
                Q(extra_data__file_no__icontains=search) |
                Q(extra_data__place__icontains=search)
            )
        
        return queryset
    
    @action(detail=False, methods=['get'], url_path='search-file-no')
    def search_file_no(self, request):
        search = request.query_params.get('search', '')
        results = _get_file_no_suggestions(search)
        return Response(results)

    @action(detail=False, methods=['get'], url_path='search-place')
    def search_place(self, request):
        search = request.query_params.get('search', '')
        results = _get_place_suggestions(search)
        return Response(results)
    
    @action(detail=False, methods=['get'], url_path='search-receivers')
    def search_receivers(self, request):
        search = request.query_params.get('search', '')
        results = _get_external_party_suggestions(search)
        return Response(results)
    
    @action(detail=False, methods=['get'], url_path='next-number')
    def next_number(self, request):
        """Get last and next outward number for given type"""
        outward_type = request.query_params.get('type', 'GEN').strip().upper()
        series_group = get_series_group(outward_type)
        common_sequence, last_common_ref = get_next_common_sequence(OutwardRegister, 'out_common_ref')
        series_sequence, last_no = get_next_series_sequence(
            series_group,
            OutwardRegister,
            'outward_no',
            'outward_type'
        )

        return Response({
            'last_common_ref': last_common_ref,
            'next_common_ref': _format_common_ref(outward_type, common_sequence),
            'last_no': last_no,
            'next_no': _format_series_no(outward_type, series_sequence),
            'series_group': series_group,
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

    path("inward-register/search-file-no/", InwardRegisterViewSet.as_view({
        'get': 'search_file_no'
    }), name='inward-register-search-file-no'),
    path("inward-register/search-place/", InwardRegisterViewSet.as_view({
        'get': 'search_place'
    }), name='inward-register-search-place'),
    
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

    path("outward-register/search-file-no/", OutwardRegisterViewSet.as_view({
        'get': 'search_file_no'
    }), name='outward-register-search-file-no'),
    path("outward-register/search-place/", OutwardRegisterViewSet.as_view({
        'get': 'search_place'
    }), name='outward-register-search-place'),
    
    path("outward-register/<int:pk>/", OutwardRegisterViewSet.as_view({
        'get': 'retrieve',
        'put': 'update',
        'patch': 'partial_update',
        'delete': 'destroy'
    }), name='outward-register-detail'),
    path("inward-register/search-receivers/", InwardRegisterViewSet.as_view({
        'get': 'search_receivers'
    }), name='inward-register-search-receivers'),
    path("outward-register/search-receivers/", OutwardRegisterViewSet.as_view({
        'get': 'search_receivers'
    }), name='outward-register-search-receivers'),
]
