from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0034_transcriptrequest_tr_request_no_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="googleformsubmission",
            name="mail_req_no",
            field=models.IntegerField(null=True, blank=True, db_column="mail_req_no"),
        ),
        migrations.AddIndex(
            model_name="googleformsubmission",
            index=models.Index(fields=["mail_req_no"], name="idx_gfs_mail_req_no"),
        ),
    ]
