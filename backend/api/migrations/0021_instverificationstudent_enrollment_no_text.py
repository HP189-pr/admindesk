"""Add enrollment_no_text to inst_verification_student (safe migration).

Adds a nullable varchar column `enrollment_no_text` to store the raw enrollment
string from uploads when the Enrollment record is not yet present.
This migration will only add the column if it doesn't already exist.
"""
from django.db import migrations
from django.db import connection


def add_column_if_missing(apps, schema_editor):
    table = 'inst_verification_student'
    column = 'enrollment_no_text'
    with connection.cursor() as cursor:
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name=%s AND column_name=%s", [table, column])
        exists = cursor.fetchone()
        if exists:
            return
        schema_editor.execute("ALTER TABLE \"%s\" ADD COLUMN \"%s\" varchar(64) NULL;" % (table, column))


def noop(apps, schema_editor):
    return

class Migration(migrations.Migration):
    dependencies = [
        ('api', '0020_instverificationstudent_iv_degree_name_and_more'),
    ]
    operations = [
        migrations.RunPython(add_column_if_missing, reverse_code=noop),
    ]
