"""Emails each office admin a list of their office's overdue tickets, and
each Super Admin the overdue tickets that have no office yet.

Run once a day from the host's scheduler, for example a cron line:
    0 8 * * * cd /path/to/backend && python manage.py send_overdue_reminders
or a "Cron Job" / "Scheduled Task" on Render, Railway or PythonAnywhere.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from tickets.models import Ticket, overdue_filter
from tickets.notifications import overdue_reminder
from users.services import EmailDeliveryError, deliver_email


class Command(BaseCommand):
    help = "Email admins a daily list of tickets waiting longer than TICKET_OVERDUE_DAYS."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Print who would be emailed and the email text, without sending.",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        overdue = list(
            Ticket.objects.filter(overdue_filter()).select_related("office").order_by("waiting_since")
        )
        by_office = {}
        for ticket in overdue:
            by_office.setdefault(ticket.office_id, []).append(ticket)

        admins = User.objects.filter(is_active=True).select_related("office")
        jobs = []
        for office_id, tickets in by_office.items():
            if office_id is None:
                for admin in admins.filter(role=User.Role.SUPERADMIN):
                    jobs.append((admin, tickets, "no office assigned yet"))
            else:
                for admin in admins.filter(role=User.Role.OFFICE_ADMIN, office_id=office_id):
                    jobs.append((admin, tickets, admin.office.name))

        sent = failed = 0
        for admin, tickets, place in jobs:
            subject, body = overdue_reminder(admin, tickets, place)
            if options["dry_run"]:
                self.stdout.write(f"To: {admin.email}\nSubject: {subject}\n\n{body}\n{'-' * 40}")
                continue
            try:
                if deliver_email(subject, body, admin.email):
                    sent += 1
                else:
                    failed += 1
            except EmailDeliveryError:
                failed += 1

        summary = f"{len(overdue)} overdue ticket(s); {len(jobs)} reminder(s)"
        if not options["dry_run"]:
            summary += f": {sent} sent, {failed} not sent"
        self.stdout.write(self.style.SUCCESS(summary))
