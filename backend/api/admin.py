from django.contrib import admin
from .models import Module, Menu, UserPermission

@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('moduleid', 'name', 'created_at', 'updated_at', 'updated_by')
    search_fields = ('name',)
    list_filter = ('created_at', 'updated_at')

@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ('menuid', 'name', 'module', 'created_at', 'updated_at', 'updated_by')
    search_fields = ('name',)
    list_filter = ('module', 'created_at')

@admin.register(UserPermission)
class UserPermissionAdmin(admin.ModelAdmin):
    list_display = ('permitid', 'user', 'module', 'menu', 'can_view', 'can_edit', 'can_delete', 'can_create', 'created_at')
    search_fields = ('user__username', 'module__name', 'menu__name')
    list_filter = ('module', 'menu', 'can_view', 'can_edit', 'can_delete', 'can_create')
