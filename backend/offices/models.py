from django.db import models

from .codes import suggest_code, unique_code


class Office(models.Model):
    """
    tbl_office - the routing/categorization unit for FAQs and Tickets
    (OSA, Registrar, individual colleges, etc). Kept as an admin-managed
    table rather than a hardcoded TextChoices list, since USTP's colleges
    and departments aren't a fixed, universally-known set the way the six
    named student-affairs-adjacent offices are - Super Admin adds/edits
    those through the Offices admin page rather than a code change.
    """

    office_id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=150, unique=True)
    # Short uppercase code that starts every ticket code from this office
    # (e.g. "OSA" -> OSA103126001). Editable by Super Admin; existing ticket
    # codes keep whatever code they were created with.
    code = models.CharField(max_length=10, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tbl_office"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.code:
            taken = set(Office.objects.exclude(pk=self.pk).values_list("code", flat=True))
            self.code = unique_code(suggest_code(self.name), taken)
        super().save(*args, **kwargs)
