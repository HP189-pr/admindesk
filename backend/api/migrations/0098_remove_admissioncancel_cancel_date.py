# backend/api/migrations/0098_remove_admissioncancel_cancel_date.py
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0097_add_shotchat_to_empprofile"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="admissioncancel",
            name="cancel_date",
        ),
        migrations.AlterModelOptions(
            name="admissioncancel",
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]
