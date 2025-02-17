from django.db import models  # type: ignore

class Holiday(models.Model):
    hdid = models.AutoField(primary_key=True)
    holiday_date = models.DateField()
    holiday_name = models.CharField(max_length=255)
    holiday_day = models.CharField(max_length=50)

    class Meta:
        db_table = "holiday"

    def __str__(self):
        return self.holiday_name


class User(models.Model):
    userid = models.AutoField(primary_key=True)
    usercode = models.CharField(max_length=50, unique=True)
    username = models.CharField(max_length=255)
    usrpassword = models.CharField(max_length=255)  # Store hashed passwords, renamed for clarity
    usertype = models.CharField(max_length=50)
    updatedby = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL)  # Optional auditing reference
    createdat = models.DateTimeField(auto_now_add=True)
    updatedat = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"

    def __str__(self):
        return self.username
