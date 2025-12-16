from django.db import migrations, models


def _normalize(value):
    if value is None:
        return None
    try:
        cleaned = (
            str(value)
            .replace("\t", "")
            .replace("\n", "")
            .replace("\r", "")
            .replace(" ", "")
        )
    except Exception:
        cleaned = str(value)
    cleaned = cleaned.strip()
    return cleaned or None


def _split_receipt(value):
    normalized = _normalize(value)
    if not normalized or len(normalized) < 6:
        return normalized, None
    tail = normalized[-6:]
    try:
        number = int(tail)
    except Exception:
        return normalized, None
    reference = normalized[:-6]
    return reference, number


def populate_rec_fields(apps, schema_editor):  # pragma: no cover - data migration
    CashRegister = apps.get_model("api", "CashRegister")
    for row in CashRegister.objects.all().iterator():
        ref, num = _split_receipt(getattr(row, "receipt_no_full", None) or getattr(row, "receipt_no", None))
        updates = {}
        if ref and not getattr(row, "rec_ref", None):
            updates["rec_ref"] = ref
        if num is not None and getattr(row, "rec_no", None) in (None, ""):
            updates["rec_no"] = num
        if updates:
            CashRegister.objects.filter(pk=row.pk).update(**updates)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0056_receipt_no_full"),
    ]

    operations = [
        migrations.AddField(
            model_name="cashregister",
            name="rec_no",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="cashregister",
            name="rec_ref",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.RunPython(populate_rec_fields, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="cashregister",
            name="receipt_no",
        ),
    ]
