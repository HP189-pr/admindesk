from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0010_fix_eca_status_column"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            ALTER TABLE verification
            ADD COLUMN IF NOT EXISTS vr_remark text;
            """,
            reverse_sql="""
            ALTER TABLE verification
            DROP COLUMN IF EXISTS vr_remark;
            """,
        ),
    ]
