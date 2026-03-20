# backend/api/migrations/0099_studentprofile_father_name.py
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0098_remove_admissioncancel_cancel_date"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentprofile",
            name="father_name",
            field=models.CharField(
                blank=True,
                db_column="father_name",
                max_length=255,
                null=True,
            ),
        ),
    ]
