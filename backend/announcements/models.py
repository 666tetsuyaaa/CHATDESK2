from django.conf import settings
from django.db import models


class Announcement(models.Model):
    announcement_id = models.BigAutoField(primary_key=True)
    title = models.CharField(max_length=200)
    content = models.TextField()
    # Null once the admin's account is deleted - the announcement stays.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="announcements",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tbl_announcement"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title