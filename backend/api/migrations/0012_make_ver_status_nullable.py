# Generated safe migration: make verification.status nullable
from django.db import migrations

class Migration(migrations.Migration):

    dependencies = [
        ('api', '0011_add_vr_remark'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE verification ALTER COLUMN status DROP NOT NULL;
            """,
            reverse_sql="""
            ALTER TABLE verification ALTER COLUMN status SET NOT NULL;
            """,
        )
    ]
