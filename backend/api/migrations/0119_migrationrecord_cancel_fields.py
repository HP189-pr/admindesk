from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0118_cashoutward_cash_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='migrationrecord',
            name='book_no',
            field=models.CharField(blank=True, db_column='book_no', max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='migrationrecord',
            name='mg_cancelled',
            field=models.CharField(choices=[('Yes', 'Yes'), ('No', 'No')], db_column='mg_cancelled', default='No', max_length=3),
        ),
        migrations.AddField(
            model_name='migrationrecord',
            name='mg_remark',
            field=models.CharField(blank=True, db_column='mg_remark', max_length=255, null=True),
        ),
        migrations.AlterField(
            model_name='migrationrecord',
            name='mg_status',
            field=models.CharField(
                choices=[
                    ('RECEIVED', 'Received'),
                    ('Pending', 'Pending'),
                    ('NOT COLLECTED', 'Not Collected'),
                    ('Issued', 'Issued'),
                    ('Cancelled', 'Cancelled'),
                ],
                db_column='mg_status',
                default='Issued',
                max_length=20,
            ),
        ),
    ]