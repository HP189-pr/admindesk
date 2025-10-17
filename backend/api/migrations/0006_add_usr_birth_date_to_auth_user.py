from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_alter_docrec_apply_for_errorlog_useractivitylog'),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS usr_birth_date date NULL;"
            ),
            reverse_sql=(
                "ALTER TABLE auth_user DROP COLUMN IF EXISTS usr_birth_date;"
            ),
        ),
    ]
