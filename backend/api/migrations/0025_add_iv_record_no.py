from django.db import migrations, models
from django.db import connection
import re


def compute_iv_record_no(s: str):
    if not s:
        return None
    s = str(s).strip()
    m = re.search(r"(\d{2,4})\D*0*([0-9]+)$", s)
    if not m:
        digits = re.sub(r"\D", "", s)
        if len(digits) >= 3:
            y_part = digits[:-3]
            seq = digits[-3:]
            if len(y_part) >= 2:
                try:
                    return int(y_part[-2:] + seq)
                except Exception:
                    return None
            try:
                return int(digits)
            except Exception:
                return None
        return None
    year_part = m.group(1)
    seq_digits = re.search(r"(\d+)\s*$", s)
    seq = seq_digits.group(1) if seq_digits else m.group(2)
    year2 = year_part[-2:]
    try:
        return int(f"{year2}{seq}")
    except Exception:
        return None


def forwards(apps, schema_editor):
    InstVerificationMain = apps.get_model('api', 'InstVerificationMain')
    qs = InstVerificationMain.objects.all()
    for obj in qs:
        try:
            iv = compute_iv_record_no(getattr(obj, 'inst_veri_number', '') or '')
            if iv is not None:
                obj.iv_record_no = iv
                obj.save(update_fields=['iv_record_no'])
        except Exception:
            # best effort; continue
            continue


def reverse(apps, schema_editor):
    # no-op on reverse (we leave data as-is)
    pass


def add_column_if_missing(apps, schema_editor):
    table = 'inst_verification_main'
    column = 'iv_record_no'
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name=%s AND column_name=%s",
            [table, column],
        )
        exists = cursor.fetchone()
        if exists:
            return
        schema_editor.execute('ALTER TABLE "%s" ADD COLUMN "%s" integer NULL;' % (table, column))


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0024_instverificationmain_doc_types'),
    ]

    operations = [
        migrations.RunPython(add_column_if_missing, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(forwards, reverse),
    ]
