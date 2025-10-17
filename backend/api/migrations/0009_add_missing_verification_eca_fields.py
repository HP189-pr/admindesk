"""
Migration to add missing ECA columns to verification table if they don't exist.
This uses Postgres 'ADD COLUMN IF NOT EXISTS' to safely alter existing databases.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0008_alter_leaveallocation_options_and_more'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                "ALTER TABLE verification ADD COLUMN IF NOT EXISTS eca_name varchar(255);",
                "ALTER TABLE verification ADD COLUMN IF NOT EXISTS eca_ref_no varchar(100);",
                "ALTER TABLE verification ADD COLUMN IF NOT EXISTS eca_submit_date date;",
                "ALTER TABLE verification ADD COLUMN IF NOT EXISTS eca_mail_status varchar(20) DEFAULT 'NOT_SENT';",
                "ALTER TABLE verification ADD COLUMN IF NOT EXISTS eca_resend_count integer DEFAULT 0;",
                "ALTER TABLE verification ADD COLUMN IF NOT EXISTS eca_last_action_at timestamp without time zone;",
                "ALTER TABLE verification ADD COLUMN IF NOT EXISTS eca_last_to_email varchar(254);",
                "ALTER TABLE verification ADD COLUMN IF NOT EXISTS eca_history jsonb;",
            ],
            reverse_sql=[
                "ALTER TABLE verification DROP COLUMN IF EXISTS eca_history;",
                "ALTER TABLE verification DROP COLUMN IF EXISTS eca_last_to_email;",
                "ALTER TABLE verification DROP COLUMN IF EXISTS eca_last_action_at;",
                "ALTER TABLE verification DROP COLUMN IF EXISTS eca_resend_count;",
                "ALTER TABLE verification DROP COLUMN IF EXISTS eca_mail_status;",
                "ALTER TABLE verification DROP COLUMN IF EXISTS eca_submit_date;",
                "ALTER TABLE verification DROP COLUMN IF EXISTS eca_ref_no;",
                "ALTER TABLE verification DROP COLUMN IF EXISTS eca_name;",
            ],
        )
    ]
