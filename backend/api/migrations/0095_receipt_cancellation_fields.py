from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0094_chatmessage_delivered_chatmessage_seen"),
    ]

    operations = [
        migrations.AddField(
            model_name="receipt",
            name="cancel_reason",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="receipt",
            name="cancelled_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="cancelled_receipts", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="receipt",
            name="is_cancelled",
            field=models.BooleanField(blank=True, db_index=True, default=None, null=True),
        ),
    ]
