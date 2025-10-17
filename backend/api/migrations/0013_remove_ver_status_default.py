# Migration: remove default value for verification.status
from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('api', '0012_make_ver_status_nullable'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE verification ALTER COLUMN status DROP DEFAULT;
            """,
            reverse_sql="""
            -- reverse is to set default back to 'IN_PROGRESS'
            ALTER TABLE verification ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';
            """,
        )
    ]
