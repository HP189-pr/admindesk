from django.db import migrations, models


TYPE_CHOICES = [
    ('GEN', 'General'),
    ('ENR', 'Enrollment'),
    ('CAN', 'Cancellation'),
    ('TRN', 'Transfer'),
    ('ERP', 'ERP Updation'),
    ('OTH', 'Other'),
    ('EXAM', 'Examination'),
    ('APPT', 'Appointment'),
    ('FEE', 'Fees'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0127_shorten_late_inward_outward_numbers'),
    ]

    operations = [
        migrations.AlterField(
            model_name='inwardregister',
            name='inward_type',
            field=models.CharField(choices=TYPE_CHOICES, db_index=True, max_length=20),
        ),
        migrations.AlterField(
            model_name='outwardregister',
            name='outward_type',
            field=models.CharField(choices=TYPE_CHOICES, db_index=True, max_length=20),
        ),
    ]
