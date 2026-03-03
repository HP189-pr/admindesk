from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0095_receipt_cancellation_fields'),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS shotchat integer NOT NULL DEFAULT 0;"
            ),
            reverse_sql=(
                "ALTER TABLE auth_user DROP COLUMN IF EXISTS shotchat;"
            ),
        ),
    ]
