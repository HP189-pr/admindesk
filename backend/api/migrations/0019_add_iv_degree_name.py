"""Add iv_degree_name to inst_verification_student if missing (safe migration).

This migration will add a nullable varchar column `iv_degree_name` to the
`inst_verification_student` table only if it does not already exist. This
avoids DuplicateColumn errors when the column was created manually in the DB.

Note: If you prefer a regular AddField migration and the column isn't present
in any target DBs, replace the operations with migrations.AddField.
"""
from django.db import migrations, models
from django.db import connection


def add_column_if_missing(apps, schema_editor):
    table = 'inst_verification_student'
    column = 'iv_degree_name'
    with connection.cursor() as cursor:
        # Check if column exists
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name=%s AND column_name=%s", [table, column])
        exists = cursor.fetchone()
        if exists:
            # Column already present; nothing to do
            return
        # Add the column
        schema_editor.execute("ALTER TABLE \"%s\" ADD COLUMN \"%s\" varchar(255) NULL;" % (table, column))


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0018_provisionalrecord_prv_degree_name_and_more'),
    ]

    operations = [
        migrations.RunPython(add_column_if_missing, reverse_code=noop),
    ]
