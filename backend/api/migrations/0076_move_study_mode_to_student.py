from django.db import migrations, models


def _normalize_study_mode(val):
    if val is None:
        return None
    try:
        s = str(val).strip()
    except Exception:
        return None
    if not s:
        return None
    lower = s.lower()
    if lower in ("r", "reg", "regular", "regular mode"):
        return "Regular"
    if lower in ("p", "pt", "part", "part time", "part-time"):
        return "Part Time"
    return s


def forwards(apps, schema_editor):
    Main = apps.get_model('api', 'InstLetterMain')
    Student = apps.get_model('api', 'InstLetterStudent')

    for main in Main.objects.exclude(study_mode__isnull=True).exclude(study_mode=""):
        norm = _normalize_study_mode(getattr(main, 'study_mode', None))
        if not norm:
            continue
        qs = Student.objects.filter(doc_rec=main.doc_rec)
        for stu in qs:
            if not getattr(stu, 'study_mode', None):
                stu.study_mode = norm
                stu.save(update_fields=['study_mode'])


def backwards(apps, schema_editor):
    Main = apps.get_model('api', 'InstLetterMain')
    Student = apps.get_model('api', 'InstLetterStudent')

    for main in Main.objects.all():
        if getattr(main, 'study_mode', None):
            continue
        try:
            stu = (
                Student.objects
                .filter(doc_rec=main.doc_rec)
                .exclude(study_mode__isnull=True)
                .exclude(study_mode="")
                .first()
            )
        except Exception:
            stu = None
        if stu and getattr(stu, 'study_mode', None):
            main.study_mode = _normalize_study_mode(stu.study_mode)
            main.save(update_fields=['study_mode'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0075_inventoryitem_inwardregister_outwardregister_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='instletterstudent',
            name='study_mode',
            field=models.CharField(blank=True, db_column='study_mode', max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='instlettermain',
            name='rec_inst_phone',
            field=models.CharField(blank=True, db_column='rec_inst_phone', max_length=50, null=True),
        ),
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField(
            model_name='instlettermain',
            name='study_mode',
        ),
    ]
