"""
Migration to ensure verification has column named `eca_status` (models use db_column='eca_status').
This will add `eca_status` if missing, copy values from `eca_mail_status` when present, and drop the wrong column.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0009_add_missing_verification_eca_fields'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                # Add the correct column if it does not exist
                "ALTER TABLE verification ADD COLUMN IF NOT EXISTS eca_status varchar(20) DEFAULT 'NOT_SENT';",
                # If the incorrect column exists (eca_mail_status), copy values into eca_status
                "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='verification' AND column_name='eca_mail_status') THEN EXECUTE 'UPDATE verification SET eca_status = eca_mail_status WHERE eca_mail_status IS NOT NULL'; END IF; END $$;",
                # Drop the incorrect column if it exists
                "ALTER TABLE verification DROP COLUMN IF EXISTS eca_mail_status;",
            ],
            reverse_sql=[
                # On reverse, recreate eca_mail_status (if desired) and copy back; then drop eca_status
                "ALTER TABLE verification ADD COLUMN IF NOT EXISTS eca_mail_status varchar(20) DEFAULT 'NOT_SENT';",
                "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='verification' AND column_name='eca_status') THEN EXECUTE 'UPDATE verification SET eca_mail_status = eca_status WHERE eca_status IS NOT NULL'; END IF; END $$;",
                "ALTER TABLE verification DROP COLUMN IF EXISTS eca_status;",
            ],
        )
    ]
