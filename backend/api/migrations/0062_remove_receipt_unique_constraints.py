from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ("api", "0061_receipt_updated_at"),
    ]

    operations = [
        migrations.AlterField(
            model_name="receipt",
            name="receipt_no_full",
            field=models.CharField(max_length=64, editable=False, db_index=True),
        ),
        migrations.RemoveConstraint(
            model_name="receipt",
            name="uniq_receipt_series_number",
        ),
    ]
