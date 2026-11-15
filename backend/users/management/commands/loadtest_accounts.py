"""
python manage.py loadtest_accounts create [--count 40] [--apply]
python manage.py loadtest_accounts delete [--apply]

Temporary student accounts for a load test (many students chatting at
once). Created directly - no welcome emails, which would bounce off the
made-up addresses. "delete" removes them and everything they produced:
inquiry logs, tickets (with their messages) and saved chats, so the
analytics are as if the test never happened.

Only ever touches accounts whose email starts with PREFIX. Without --apply
it only shows what it would do.
"""

import secrets

from django.core.management.base import BaseCommand
from django.db import transaction

from inquiry_logs.models import InquiryLog
from tickets.models import Ticket
from users.models import User

PREFIX = "zz.loadtest."
DOMAIN = "example.com"
COURSES = ["BSIT", "BSCS", "BSCE", "BSN", "BSED-MATH", "BTOM", "BSME", "BSCHEM"]


def loadtest_users():
    return User.objects.filter(email__istartswith=PREFIX, role=User.Role.STUDENT)


class Command(BaseCommand):
    help = "Create or delete temporary student accounts for a load test."

    def add_arguments(self, parser):
        parser.add_argument("action", choices=["create", "delete"])
        parser.add_argument("--count", type=int, default=40, help="How many accounts to create (max 100).")
        parser.add_argument("--apply", action="store_true", help="Really do it (default: only show what would happen).")

    def handle(self, *args, **options):
        if options["action"] == "create":
            self.create(min(max(options["count"], 1), 100), options["apply"])
        else:
            self.delete(options["apply"])

    def create(self, count, apply):
        existing = loadtest_users().count()
        if existing:
            self.stdout.write(f"{existing} load-test account(s) already exist - delete them first.")
            return
        if not apply:
            self.stdout.write(f"Would create {count} accounts {PREFIX}01@{DOMAIN} ... - add --apply to do it.")
            return
        password = f"Lt-{secrets.token_urlsafe(9)}"
        with transaction.atomic():
            for n in range(1, count + 1):
                User.objects.create_user(
                    email=f"{PREFIX}{n:02d}@{DOMAIN}",
                    password=password,
                    first_name="Load",
                    last_name=f"Test {n:02d}",
                    role=User.Role.STUDENT,
                    course=COURSES[n % len(COURSES)],
                    school_id=f"99990{n:04d}",
                )
        self.stdout.write(self.style.SUCCESS(f"Created {count} accounts {PREFIX}01@{DOMAIN} to {PREFIX}{count:02d}@{DOMAIN}"))
        self.stdout.write(f"Password for all of them (temporary): {password}")
        self.stdout.write("Delete them after the test: python manage.py loadtest_accounts delete --apply")

    def delete(self, apply):
        users = list(loadtest_users())
        logs = InquiryLog.objects.filter(user__in=users)
        tickets = Ticket.objects.filter(user__in=users)
        summary = (
            f"{len(users)} account(s), {logs.count()} inquiry log(s), {tickets.count()} ticket(s) "
            f"and their messages and saved chats"
        )
        if not apply:
            self.stdout.write(f"Would delete {summary} - add --apply to do it.")
            return
        with transaction.atomic():
            # Tickets first (a ticket's log is deleted with it, and its
            # messages with the ticket), then any logs left, then the
            # accounts (their saved chats go with them).
            tickets.delete()
            logs.delete()
            User.objects.filter(pk__in=[user.pk for user in users]).delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {summary}."))
