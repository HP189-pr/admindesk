from django.contrib import admin
from .models import Module, Menu, UserPermission, Institute, MainBranch, SubBranch, Enrollment

@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('moduleid', 'name', 'created_at', 'updated_at', 'updated_by')
    search_fields = ('name__icontains',)
    list_filter = ('created_at', 'updated_at')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ('menuid', 'name', 'module', 'created_at', 'updated_at', 'updated_by')
    search_fields = ('name__icontains',)
    list_filter = ('module', 'created_at')
    readonly_fields = ('created_at', 'updated_at')
    autocomplete_fields = ('module',)

@admin.register(UserPermission)
class UserPermissionAdmin(admin.ModelAdmin):
    list_display = ('permitid', 'user', 'module', 'menu', 'can_view', 'can_edit', 'can_delete', 'can_create', 'created_at')
    search_fields = ('user__username__icontains', 'module__name__icontains', 'menu__name__icontains')
    list_filter = ('module', 'menu', 'can_view', 'can_edit', 'can_delete', 'can_create')
    readonly_fields = ('created_at',)
    autocomplete_fields = ('user', 'module', 'menu')
@admin.register(Institute)
class InstituteAdmin(admin.ModelAdmin):
    list_display = ('institute_id', 'institute_code', 'institute_name', 'created_at', 'updated_at', 'updated_by')

@admin.register(MainBranch)
class MainBranchAdmin(admin.ModelAdmin):
    list_display = ('maincourse_id', 'course_code', 'course_name', 'institute', 'created_at', 'updated_at', 'updated_by')

@admin.register(SubBranch)
class SubBranchAdmin(admin.ModelAdmin):
    list_display = ('subcourse_id', 'subcourse_code', 'subcourse_name', 'maincourse', 'created_at', 'updated_at', 'updated_by')

@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ('enrollment_no', 'student_name', 'institute', 'batch', 'admission_date', 'created_at', 'updated_at', 'updated_by')    
