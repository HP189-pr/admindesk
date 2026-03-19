from django.db import migrations


TARGET_MENUS = [
    {"keyword": "cctv", "name": "📹 CCTV Monitoring"},
    {"keyword": "schedule", "name": "🗓️ Schedule"},
]


def _merge_rights(target_perm, source_perm):
    target_perm.can_view = bool(target_perm.can_view or source_perm.can_view)
    target_perm.can_create = bool(target_perm.can_create or source_perm.can_create)
    target_perm.can_edit = bool(target_perm.can_edit or source_perm.can_edit)
    target_perm.can_delete = bool(target_perm.can_delete or source_perm.can_delete)
    target_perm.save()


def _repoint_or_merge_permission(UserPermission, perm, exam_module, exam_menu):
    existing = UserPermission.objects.filter(
        user_id=perm.user_id,
        module=exam_module,
        menu=exam_menu,
    ).exclude(pk=perm.pk).first()

    if existing:
        _merge_rights(existing, perm)
        perm.delete()
        return

    perm.module = exam_module
    perm.menu = exam_menu
    perm.save()


def move_office_menus_to_exam(apps, schema_editor):
    Module = apps.get_model("api", "Module")
    Menu = apps.get_model("api", "Menu")
    UserPermission = apps.get_model("api", "UserPermission")

    try:
        office_module = Module.objects.get(name="Office Management")
    except Module.DoesNotExist:
        return

    exam_module, _ = Module.objects.get_or_create(name="Exam")

    for item in TARGET_MENUS:
        keyword = item["keyword"]
        target_name = item["name"]

        exam_target_menu = Menu.objects.filter(module=exam_module, name=target_name).order_by("menuid").first()
        if not exam_target_menu:
            exam_target_menu = Menu.objects.filter(module=exam_module, name__icontains=keyword).order_by("menuid").first()

        if not exam_target_menu:
            exam_target_menu = Menu.objects.create(module=exam_module, name=target_name)
        elif exam_target_menu.name != target_name:
            exam_target_menu.name = target_name
            exam_target_menu.save()

        office_menus = list(
            Menu.objects.filter(module=office_module, name__icontains=keyword).order_by("menuid")
        )
        exam_duplicates = list(
            Menu.objects.filter(module=exam_module, name__icontains=keyword)
            .exclude(pk=exam_target_menu.pk)
            .order_by("menuid")
        )

        source_menus = office_menus + exam_duplicates

        for source_menu in source_menus:
            perms = list(UserPermission.objects.filter(menu=source_menu))
            for perm in perms:
                _repoint_or_merge_permission(UserPermission, perm, exam_module, exam_target_menu)
            source_menu.delete()

        wrong_module_perms = list(
            UserPermission.objects.filter(menu=exam_target_menu).exclude(module=exam_module)
        )
        for perm in wrong_module_perms:
            _repoint_or_merge_permission(UserPermission, perm, exam_module, exam_target_menu)


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0107_fix_exam_menus"),
    ]

    operations = [
        migrations.RunPython(move_office_menus_to_exam, reverse_noop),
    ]
