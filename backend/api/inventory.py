"""
Inventory Management System
Models, Serializers, and ViewSets for Inventory Management
"""
from django.db import models
from django.db.models import Sum, Q
from rest_framework import serializers, viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


# ==================== MODELS ====================

class InventoryItem(models.Model):
    """Item Master Table"""
    item_name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inventory_item'
        ordering = ['item_name']

    def __str__(self):
        return self.item_name


class InventoryInward(models.Model):
    """Stock In Table"""
    inward_date = models.DateField()
    item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name='inward_entries')
    qty = models.IntegerField()
    details = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inventory_inward'
        ordering = ['-inward_date', '-created_at']

    def __str__(self):
        return f"Inward {self.item.item_name} - {self.qty} on {self.inward_date}"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.qty <= 0:
            raise ValidationError({'qty': 'Quantity must be positive'})


class InventoryOutward(models.Model):
    """Stock Out Table"""
    outward_date = models.DateField()
    item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name='outward_entries')
    qty = models.IntegerField()
    receiver = models.CharField(max_length=255)
    received_qty = models.IntegerField(blank=True, null=True)
    remark = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inventory_outward'
        ordering = ['-outward_date', '-created_at']

    def __str__(self):
        return f"Outward {self.item.item_name} - {self.qty} on {self.outward_date}"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.qty <= 0:
            raise ValidationError({'qty': 'Quantity must be positive'})


# ==================== SERIALIZERS ====================

class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryItem
        fields = ['id', 'item_name', 'description', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class InwardSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.item_name', read_only=True)

    class Meta:
        model = InventoryInward
        fields = ['id', 'inward_date', 'item', 'item_name', 'qty', 'details', 'created_at']
        read_only_fields = ['created_at']

    def validate_qty(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive")
        return value


class OutwardSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source='item.item_name', read_only=True)

    class Meta:
        model = InventoryOutward
        fields = ['id', 'outward_date', 'item', 'item_name', 'qty', 'receiver', 'received_qty', 'remark', 'created_at']
        read_only_fields = ['created_at']

    def validate_qty(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be positive")
        return value

    def validate(self, data):
        """Check if outward quantity doesn't exceed available balance"""
        item = data.get('item')
        qty = data.get('qty')
        
        if item and qty:
            # Calculate current balance
            inward_total = InventoryInward.objects.filter(item=item).aggregate(
                total=Sum('qty')
            )['total'] or 0
            
            outward_total = InventoryOutward.objects.filter(item=item).aggregate(
                total=Sum('qty')
            )['total'] or 0
            
            # If updating, exclude current record from outward total
            if self.instance:
                outward_total -= self.instance.qty
            
            balance = inward_total - outward_total
            
            if qty > balance:
                raise serializers.ValidationError({
                    'qty': f'Insufficient stock. Available balance: {balance}'
                })
        
        return data


# ==================== VIEWSETS ====================

class InventoryItemViewSet(viewsets.ModelViewSet):
    """ViewSet for Inventory Items (Item Master)"""
    queryset = InventoryItem.objects.all()
    serializer_class = ItemSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(item_name__icontains=search) | Q(description__icontains=search)
            )
        return queryset


class InventoryInwardViewSet(viewsets.ModelViewSet):
    """ViewSet for Stock Inward Entries"""
    queryset = InventoryInward.objects.all()
    serializer_class = InwardSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        item_id = self.request.query_params.get('item', None)
        date_from = self.request.query_params.get('date_from', None)
        date_to = self.request.query_params.get('date_to', None)
        
        if item_id:
            queryset = queryset.filter(item_id=item_id)
        if date_from:
            queryset = queryset.filter(inward_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(inward_date__lte=date_to)
        
        return queryset


class InventoryOutwardViewSet(viewsets.ModelViewSet):
    """ViewSet for Stock Outward Entries"""
    queryset = InventoryOutward.objects.all()
    serializer_class = OutwardSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        item_id = self.request.query_params.get('item', None)
        date_from = self.request.query_params.get('date_from', None)
        date_to = self.request.query_params.get('date_to', None)
        receiver = self.request.query_params.get('receiver', None)
        
        if item_id:
            queryset = queryset.filter(item_id=item_id)
        if date_from:
            queryset = queryset.filter(outward_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(outward_date__lte=date_to)
        if receiver:
            queryset = queryset.filter(receiver__icontains=receiver)
        
        return queryset


class StockSummaryView(APIView):
    """
    GET endpoint to return stock balance for all items
    Returns: List of {item_id, item_name, inward_total, outward_total, balance}
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        items = InventoryItem.objects.all()
        summary = []
        
        for item in items:
            inward_total = InventoryInward.objects.filter(item=item).aggregate(
                total=Sum('qty')
            )['total'] or 0
            
            outward_total = InventoryOutward.objects.filter(item=item).aggregate(
                total=Sum('qty')
            )['total'] or 0
            
            balance = inward_total - outward_total
            
            summary.append({
                'item_id': item.id,
                'item_name': item.item_name,
                'description': item.description,
                'inward_total': inward_total,
                'outward_total': outward_total,
                'balance': balance
            })
        
        # Sort by item name
        summary.sort(key=lambda x: x['item_name'])
        
        return Response(summary, status=status.HTTP_200_OK)
