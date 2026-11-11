from django.db import migrations
from django.utils import timezone

UNASSIGNED_OFFICE_CODE = "GEN"


def fill_ticket_codes(apps, schema_editor):
    """Numbers existing tickets in creation order, per office and Manila day,
    and leaves each day's counter where new tickets should continue."""
    Ticket = apps.get_model("tickets", "Ticket")
    TicketSequence = apps.get_model("tickets", "TicketSequence")
    counters = {}
    for ticket in Ticket.objects.select_related("office").order_by("created_at", "ticket_id"):
        office_code = ticket.office.code if ticket.office_id else UNASSIGNED_OFFICE_CODE
        prefix = f"{office_code}{timezone.localdate(ticket.created_at):%m%d%y}"
        counters[prefix] = counters.get(prefix, 0) + 1
        ticket.ticket_code = f"{prefix}{counters[prefix]:03d}"
        ticket.save(update_fields=["ticket_code"])
    for prefix, last_number in counters.items():
        TicketSequence.objects.update_or_create(prefix=prefix, defaults={"last_number": last_number})


class Migration(migrations.Migration):

    dependencies = [
        ("tickets", "0006_ticket_code_ai_resolved"),
    ]

    operations = [
        migrations.RunPython(fill_ticket_codes, migrations.RunPython.noop),
    ]
