# Hand-written migration: add PostgreSQL-level DEFAULT '' to assessment_entry.remark
# so that the column default is enforced at DB level (not just in ORM/Python).
# Required because the old running server process omits `remark` in INSERT payloads.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0112_assessment_entry_remark_default'),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE assessment_entry ALTER COLUMN remark SET DEFAULT ''",
            reverse_sql="ALTER TABLE assessment_entry ALTER COLUMN remark DROP DEFAULT",
        ),
    ]
