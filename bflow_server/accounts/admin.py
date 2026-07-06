from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Book, BflowUser, SaleTransaction


@admin.register(BflowUser)
class BflowUserAdmin(UserAdmin):
    model = BflowUser
    list_display = ('email', 'given_name', 'role', 'is_active', 'is_staff', 'date_joined')
    list_filter = ( 'is_active', 'is_staff')
    search_fields = ('email', 'given_name')
    ordering = ('email',)

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Profile', {'fields': ('given_name', 'role')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Dates', {'fields': ('last_login', 'date_joined')}),
    )

    add_fieldsets = (
        (
            None,
            {
                'classes': ('wide',),
                'fields': ('email', 'given_name', 'role', 'password1', 'password2', 'is_staff', 'is_active'),
            },
        ),
    )


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'stock', 'price', 'reorder_level')
    search_fields = ('title', 'author')


@admin.register(SaleTransaction)
class SaleTransactionAdmin(admin.ModelAdmin):
    list_display = ('date', 'processed_by', 'items', 'total', 'created_at')
    list_filter = ('date')
    search_fields = ('processed_by__given_name', 'processed_by__email')
