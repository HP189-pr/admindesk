# Cleans up FinalReceived status:
# 1. Data migration: any existing FinalReceived rows → Completed
# 2. AlterField: remove FinalReceived from choices

from django.db import migrations, models


def convert_final_received(apps, schema_editor):
    AssessmentEntry = apps.get_model("api", "AssessmentEntry")
    updated = AssessmentEntry.objects.filter(status="FinalReceived").update(
        status="Completed"
    )
    if updated:
        print(f"  Converted {updated} FinalReceived entries → Completed")


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0113_assessment_entry_remark_db_default"),
    ]

    operations = [
        migrations.RunPython(convert_final_received, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="assessmententry",
            name="status",
            field=models.CharField(
                choices=[
                    ("Pending", "Pending"),
                    ("Outward", "Outward"),
                    ("PartiallyReceived", "Partially Received"),
                    ("Received", "Received"),
                    ("Returned", "Returned"),
                    ("Completed", "Completed"),
                ],
                default="Pending",
                max_length=50,
            ),
        ),
    ]
