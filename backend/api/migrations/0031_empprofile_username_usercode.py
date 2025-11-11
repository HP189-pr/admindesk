from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0030_transcript_request"),
    ]

    operations = [
        migrations.AddField(
            model_name="empprofile",
            name="username",
            field=models.CharField(blank=True, db_index=True, max_length=150, null=True),
        ),
        migrations.AddField(
            model_name="empprofile",
            name="usercode",
            field=models.CharField(blank=True, db_index=True, max_length=50, null=True),
        ),
    ]
