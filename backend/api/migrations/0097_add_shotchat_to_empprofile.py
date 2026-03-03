from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0096_add_shotchat_to_auth_user"),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE api_empprofile "
                "ADD COLUMN IF NOT EXISTS shotchat varchar(3);"
            ),
            reverse_sql=(
                "ALTER TABLE api_empprofile "
                "DROP COLUMN IF EXISTS shotchat;"
            ),
        ),
    ]
