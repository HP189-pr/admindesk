# backend/api/migrations/0107_fix_exam_menus.py
"""
Fix Exam module menus:
- Delete stale plain-name duplicates (Assessment Management, CCTV Monitoring)
- Delete extra emoji-prefixed duplicates created by ensureModulesAndMenus
- Ensure exactly two menus exist under Exam with the emoji names that
  staticModules in Sidebar.jsx uses, so ensureModulesAndMenus never creates
  duplicates again.
"""
from django.db import migrations


EXAM_MENUS = [
    "📋 Assessment Management",
    "📹 CCTV Monitoring",
]


def fix_exam_menus(apps, schema_editor):
    Module = apps.get_model("api", "Module")
    Menu = apps.get_model("api", "Menu")

    try:
        exam_module = Module.objects.get(name="Exam")
    except Module.DoesNotExist:
        return

    # Delete ALL existing menus under Exam so we get a clean slate.
    # (None of them have permissions yet, confirmed by inspection.)
    Menu.objects.filter(module=exam_module).delete()

    # Re-create with the exact emoji-prefixed names matching staticModules.
    for menu_name in EXAM_MENUS:
        Menu.objects.create(module=exam_module, name=menu_name)


def reverse_fix(apps, schema_editor):
    Module = apps.get_model("api", "Module")
    Menu = apps.get_model("api", "Menu")

    try:
        exam_module = Module.objects.get(name="Exam")
    except Module.DoesNotExist:
        return

    Menu.objects.filter(module=exam_module).delete()

    for menu_name in ["Assessment Management", "CCTV Monitoring"]:
        Menu.objects.create(module=exam_module, name=menu_name)


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0106_exam_module_data"),
    ]

    operations = [
        migrations.RunPython(fix_exam_menus, reverse_fix),
    ]
