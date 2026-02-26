from django.db import migrations, models


def _map_enrollment_to_id(apps, schema_editor):
    StudentFeesLedger = apps.get_model("api", "StudentFeesLedger")
    Enrollment = apps.get_model("api", "Enrollment")

    for ledger in StudentFeesLedger.objects.all().iterator():
        enrollment_no = getattr(ledger, "enrollment_id", None)
        if not enrollment_no:
            continue
        enrollment = (
            Enrollment.objects.filter(enrollment_no=enrollment_no).first()
            or Enrollment.objects.filter(temp_enroll_no=enrollment_no).first()
        )
        if enrollment:
            ledger.enrollment_ref_id = enrollment.id
            ledger.save(update_fields=["enrollment_ref"])


def _noop_reverse(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0083_alter_studentfeesledger_optional_receipt_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentfeesledger",
            name="enrollment_ref",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="+",
                to="api.enrollment",
            ),
        ),
        migrations.RunPython(_map_enrollment_to_id, _noop_reverse),
        migrations.RemoveField(
            model_name="studentfeesledger",
            name="enrollment",
        ),
        migrations.RenameField(
            model_name="studentfeesledger",
            old_name="enrollment_ref",
            new_name="enrollment",
        ),
        migrations.AlterField(
            model_name="studentfeesledger",
            name="enrollment",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="fee_ledger",
                to="api.enrollment",
            ),
        ),
    ]
