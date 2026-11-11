from django.contrib import admin

from .models import SchoolPhase


@admin.register(SchoolPhase)
class SchoolPhaseAdmin(admin.ModelAdmin):
    list_display = ("name", "start_date", "end_date")
    search_fields = ("name", "guidance_message")
    ordering = ("start_date",)
