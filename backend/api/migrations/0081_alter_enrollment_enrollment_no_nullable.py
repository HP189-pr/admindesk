from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0080_cctvcentreentry_cc_end_label_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='enrollment',
            name='enrollment_no',
            field=models.CharField(blank=True, db_column='enrollment_no', max_length=50, null=True, unique=True),
        ),
    ]
