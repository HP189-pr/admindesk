from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0130_cctvexam_record_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='studentprofile',
            name='specialisation',
            field=models.CharField(blank=True, db_column='specialisation', max_length=255, null=True),
        ),
    ]