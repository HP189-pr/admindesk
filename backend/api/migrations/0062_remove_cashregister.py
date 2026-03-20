# backend/api/migrations/0062_remove_cashregister.py
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0061_receipt_updated_at"),
    ]

    operations = [
        migrations.DeleteModel(
            name="CashRegister",
        ),
    ]
