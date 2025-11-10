"""Safe add of three nullable text columns.

This migration was originally auto-generated and attempted to AddField() which
fails when the underlying DB column already exists. Convert it to a
RunPython that checks information_schema and adds each column only when
missing. This preserves idempotency and makes `migrate` safe when the
database schema was modified outside of migrations.
"""
from django.db import migrations
from django.db import connection


def add_columns_if_missing(apps, schema_editor):
    checks = [
        # (table_name, column_name, sql_fragment_to_add)
        ('inst_verification_student', 'enrollment_no_text', 'varchar(64) NULL'),
        ('inst_verification_student', 'iv_degree_name', 'varchar(255) NULL'),
        ('provisional', 'prv_degree_name', 'varchar(255) NULL'),
    ]
    with connection.cursor() as cursor:
        for table, column, sqlfrag in checks:
            cursor.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name=%s AND column_name=%s",
                [table, column],
            )
            exists = cursor.fetchone()
            if exists:
                continue
            # Use quoted identifiers to be safe with mixed-case or reserved words
            alter = 'ALTER TABLE "%s" ADD COLUMN "%s" %s;' % (table, column, sqlfrag)
            schema_editor.execute(alter)


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0022_instverificationstudent_enrollment_no_text_and_more'),
    ]

    operations = [
        migrations.RunPython(add_columns_if_missing, reverse_code=noop),
    ]
