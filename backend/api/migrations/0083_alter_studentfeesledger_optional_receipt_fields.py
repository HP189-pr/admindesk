from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0082_drop_enrollment_no_not_null"),
    ]

    operations = [
        migrations.AlterField(
            model_name="studentfeesledger",
            name="receipt_no",
            field=models.CharField(blank=True, db_index=True, max_length=30, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name="studentfeesledger",
            name="receipt_date",
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.AlterField(
            model_name="studentfeesledger",
            name="amount",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
    ]
