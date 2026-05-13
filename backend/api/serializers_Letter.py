# backend/api/serializers_Letter.py
from rest_framework import serializers
from .models import InstLetterMain, InstLetterStudent
from .models import DocRec
from .domain_documents import ApplyFor, PayBy
from django.db import IntegrityError


class ManualDocRecSlugField(serializers.SlugRelatedField):
    """Resolve DocRec by public id, creating a manual IV receipt when missing."""

    def to_internal_value(self, data):
        key = str(data or "").strip()
        if not key:
            self.fail("does_not_exist", slug_name=self.slug_field, value=data)
        try:
            return super().to_internal_value(key)
        except serializers.ValidationError:
            doc_rec_date = None
            try:
                from django.utils.dateparse import parse_date
                raw_date = (getattr(self.parent, "initial_data", {}) or {}).get("doc_rec_date")
                doc_rec_date = parse_date(str(raw_date)) if raw_date else None
            except Exception:
                doc_rec_date = None
            defaults = {
                "apply_for": ApplyFor.INST_VERIFICATION,
                "pay_by": PayBy.NA,
                "pay_amount": 0,
            }
            if doc_rec_date:
                defaults["doc_rec_date"] = doc_rec_date
            try:
                doc_rec, _ = DocRec.objects.get_or_create(doc_rec_id=key, defaults=defaults)
                return doc_rec
            except IntegrityError:
                doc_rec = DocRec.objects.filter(doc_rec_id=key).first()
                if doc_rec:
                    return doc_rec
                raise

class InstLetterMainSerializer(serializers.ModelSerializer):
    doc_rec_id = serializers.PrimaryKeyRelatedField(
        queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    doc_rec_key = ManualDocRecSlugField(
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
                s = str(val).strip()
                if not s:
                    return ''
                s2 = re.sub(r'^\[\s*|\s*\]$', '', s)
                if s2.lower() in ('nan', 'none', 'null', 'n/a'):
                    return ''
                # Fix float-style PIN like 360005.0
                if re.fullmatch(r'\d+\.0', s2):
                    s2 = s2.split('.')[0]
                return s2
            except Exception:
                return ''

        data = super().to_representation(instance)
        for k in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','rec_inst_email','rec_inst_phone','doc_types','inst_ref_no','rec_by'):
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
    # 🔥 Do NOT accept *_id fields from input

    doc_rec_key = ManualDocRecSlugField(
        slug_field='doc_rec_id',
        queryset=DocRec.objects.all(),
        source='doc_rec',
        write_only=True,
        required=False
    )

    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    iv_degree_name = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    enrollment_no_text = serializers.CharField(allow_null=True, allow_blank=True, required=False)

    class Meta:
        model = InstLetterStudent
        fields = [
            'id', 'doc_rec', 'doc_rec_key', 'sr_no', 'enrollment', 'enrollment_no_text',
            'student_name', 'type_of_credential', 'month_year', 'verification_status',
            'iv_degree_name', 'study_mode'
        ]
        # No read_only_fields for removed fields

    # No need to strip removed fields
