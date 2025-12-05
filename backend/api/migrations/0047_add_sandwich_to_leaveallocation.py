from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('api', '0046_remove_docrec_docrec_search_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='leaveallocation',
            name='sandwich',
            field=models.BooleanField(default=False, db_column='sandwich'),
        ),
    ]
