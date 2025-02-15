from django.db import models  # type: ignore

class Holiday(models.Model):
    hdid = models.AutoField(primary_key=True)  # Explicit primary key
    holiday_date = models.DateField()
    holiday_name = models.CharField(max_length=255)
    holiday_day = models.CharField(max_length=50)

    class Meta:
        db_table = "holiday"  # Tell Django to use the existing "holiday" table

    def __str__(self):
        return self.holiday_name
class User(models.Model):
    userid = models.AutoField(primary_key=True)
    usercode = models.CharField(max_length=50, unique=True)
    username = models.CharField(max_length=255)
    usrpassword = models.CharField(max_length=255)  # Store hashed passwords
    usertype = models.CharField(max_length=50)
    updatedby = models.IntegerField(null=True, blank=True)
    createdat = models.DateTimeField(auto_now_add=True)
    updatedat = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"  # Match existing table in PostgreSQL

    def __str__(self):
        return self.username
