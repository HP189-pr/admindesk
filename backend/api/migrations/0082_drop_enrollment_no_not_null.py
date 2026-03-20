# backend/api/migrations/0082_drop_enrollment_no_not_null.py
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0081_alter_enrollment_enrollment_no_nullable'),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE enrollment ALTER COLUMN enrollment_no DROP NOT NULL;",
            reverse_sql="ALTER TABLE enrollment ALTER COLUMN enrollment_no SET NOT NULL;",
        ),
    ]
