from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('api', '0128_add_student_register_type_choices'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='status',
            field=models.CharField(
                choices=[
                    ('ACTIVE', 'Active'),
                    ('ACTIVE_PASS_OUT', 'Active & Pass Out'),
                    ('LEFT', 'Left'),
                    ('PASS_OUT', 'Pass Out'),
                    ('RESHUFFLE_OUT', 'Reshuffle Out'),
                    ('NOT_IN_COLLEGE', 'Not In College'),
                    ('DROP_OUT', 'Drop Out'),
                ],
                db_column='status',
                default='ACTIVE',
                max_length=30,
            ),
        ),
    ]
