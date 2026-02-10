from rest_framework import serializers
from .models import InstLetterMain, InstLetterStudent
from .models import DocRec

class InstLetterMainSerializer(serializers.ModelSerializer):
    doc_rec_id = serializers.PrimaryKeyRelatedField(
        queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    doc_rec_key = serializers.SlugRelatedField(
        slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    class Meta:
        model = InstLetterMain
        fields = '__all__'

    def to_representation(self, instance):
        import re
        def _sanitize(val):
            try:
                if val is None:
                    return ''
                if isinstance(val, (list, tuple)):
                    return '' if len(val) == 0 else str(val)
                s = str(val).strip()
                if not s:
                    return ''
                s2 = re.sub(r'^\[\s*|\s*\]$', '', s)
                if re.fullmatch(r'\d+', s2):
                    return ''
                if s2.strip().lower() in ('nan', 'none', 'null', 'n/a'):
                    return ''
                return s2
            except Exception:
                return ''

        data = super().to_representation(instance)
        for k in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','rec_inst_email','doc_types','inst_ref_no','rec_by'):
            if k in data:
                data[k] = _sanitize(data.get(k))
        for df in ('inst_veri_date','ref_date','doc_rec_date'):
            v = data.get(df)
            try:
                data[df] = '' if not v else str(v)
            except Exception:
                data[df] = ''
        return data

class InstLetterStudentSerializer(serializers.ModelSerializer):
    doc_rec_key = serializers.SlugRelatedField(
        slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    iv_degree_name = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    enrollment_no_text = serializers.CharField(allow_null=True, allow_blank=True, required=False)

    class Meta:
        model = InstLetterStudent
        fields = '__all__'