from django.db import migrations, models


def _normalize_receipt(value):
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
        cleaned = str(value).strip()
    return cleaned or None


def populate_receipt_no_full(apps, schema_editor):  # pragma: no cover - data migration
    CashRegister = apps.get_model("api", "CashRegister")
    for row in CashRegister.objects.all().iterator():
        normalized = _normalize_receipt(getattr(row, "receipt_no_full", None) or row.receipt_no)
        if not normalized:
            normalized = row.receipt_no
        if not normalized:
            continue
        if normalized != row.receipt_no_full:
            row.receipt_no_full = normalized
            row.save(update_fields=["receipt_no_full"])


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0055_feetype_cashregister"),
    ]

    operations = [
        migrations.AddField(
            model_name="cashregister",
            name="receipt_no_full",
            field=models.CharField(blank=True, db_index=True, editable=False, max_length=64, null=True, unique=True),
        ),
        migrations.RunPython(populate_receipt_no_full, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="cashregister",
            name="receipt_no_full",
            field=models.CharField(blank=True, db_index=True, editable=False, max_length=64, unique=True),
        ),
    ]
