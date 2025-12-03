"""Serializers for Degree Management"""
from rest_framework import serializers
from .domain_degree import StudentDegree, ConvocationMaster


class ConvocationMasterSerializer(serializers.ModelSerializer):
    """Serializer for ConvocationMaster model"""
    
    class Meta:
        model = ConvocationMaster
        fields = [
            'id', 'convocation_no', 'convocation_title', 
            'convocation_date', 'month_year'
        ]
        read_only_fields = ['id']
    
    def validate_convocation_no(self, value):
        """Validate convocation number is unique"""
        if self.instance:
            # Update case - check if convocation_no changed
            if self.instance.convocation_no != value:
                if ConvocationMaster.objects.filter(convocation_no=value).exists():
                    raise serializers.ValidationError("Convocation number already exists.")
        else:
            # Create case
            if ConvocationMaster.objects.filter(convocation_no=value).exists():
                raise serializers.ValidationError("Convocation number already exists.")
        return value


class StudentDegreeSerializer(serializers.ModelSerializer):
    """Serializer for StudentDegree model"""
    convocation_title = serializers.SerializerMethodField()
    convocation_date = serializers.SerializerMethodField()
    
    class Meta:
        model = StudentDegree
        fields = [
            'id', 'dg_sr_no', 'enrollment_no', 'student_name_dg',
            'dg_address', 'institute_name_dg', 'degree_name',
            'specialisation', 'seat_last_exam', 'last_exam_month',
            'last_exam_year', 'class_obtain', 'course_language',
            'dg_rec_no', 'dg_gender', 'convocation_no',
            'convocation_title', 'convocation_date'
        ]
        read_only_fields = ['id', 'convocation_title', 'convocation_date']
    
    def get_convocation_title(self, obj):
        """Get convocation title from related convocation"""
        convocation = obj.get_convocation()
        return convocation.convocation_title if convocation else None
    
    def get_convocation_date(self, obj):
        """Get convocation date from related convocation"""
        convocation = obj.get_convocation()
        return convocation.convocation_date.strftime('%Y-%m-%d') if convocation else None


class StudentDegreeDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer with additional enrollment info"""
    convocation_info = serializers.SerializerMethodField()
    
    class Meta:
        model = StudentDegree
        fields = '__all__'
    
    def get_convocation_info(self, obj):
        """Get full convocation information"""
        convocation = obj.get_convocation()
        if convocation:
            return ConvocationMasterSerializer(convocation).data
        return None


class BulkDegreeUploadSerializer(serializers.Serializer):
    """Serializer for bulk degree upload"""
    file = serializers.FileField()
    
    def validate_file(self, value):
        """Validate uploaded file"""
        if not value.name.endswith('.csv'):
            raise serializers.ValidationError("Only CSV files are allowed.")
        return value
