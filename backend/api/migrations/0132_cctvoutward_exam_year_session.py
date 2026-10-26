from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0131_studentprofile_specialisation"),
        ("api", "0130_alter_enrollment_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="cctvoutward",
            name="exam_year_session",
            field=models.CharField(blank=True, default="", max_length=10),
        ),
    ]
