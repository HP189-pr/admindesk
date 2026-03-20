# backend/api/migrations/0106_exam_module_data.py
"""
Data migration: Create "Exam" module with menus
  - Assessment Management
  - CCTV Monitoring

These are the two menus previously scattered across Office Management.
Running this migration is idempotent (get_or_create used throughout).
"""
from django.db import migrations


def create_exam_module(apps, schema_editor):
    Module = apps.get_model("api", "Module")
    Menu = apps.get_model("api", "Menu")

    exam_module, _ = Module.objects.get_or_create(name="Exam")

    for menu_name in ["Assessment Management", "CCTV Monitoring"]:
        Menu.objects.get_or_create(module=exam_module, name=menu_name)


def remove_exam_module(apps, schema_editor):
    """Reverse: delete the Exam module (menus cascade-delete automatically)."""
    Module = apps.get_model("api", "Module")
    Module.objects.filter(name="Exam").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0105_assessmentoutward_assessmententry_and_more"),
    ]

    operations = [
        migrations.RunPython(create_exam_module, remove_exam_module),
    ]
