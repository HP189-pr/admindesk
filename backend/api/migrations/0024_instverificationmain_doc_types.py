"""Safely add doc_types column if missing.

Convert auto-generated AddField to a RunPython that only adds the
column when it doesn't already exist. This avoids errors when the DB schema
was modified outside of the migrations system.
"""
from django.db import migrations
from django.db import connection


def add_doc_types_if_missing(apps, schema_editor):
    table = 'inst_verification_main'
    column = 'doc_types'
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name=%s AND column_name=%s",
            [table, column],
        )
        exists = cursor.fetchone()
        if exists:
            return
        schema_editor.execute('ALTER TABLE "%s" ADD COLUMN "%s" varchar(255) NULL;' % (table, column))


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0023_instverificationstudent_enrollment_no_text_and_more'),
    ]

    operations = [
        migrations.RunPython(add_doc_types_if_missing, reverse_code=noop),
    ]
