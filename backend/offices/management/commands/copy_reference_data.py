"""Copies the data a fresh production database needs from another ChatDesk
database (normally your local one): offices, FAQs (with their stored
embeddings), school phases, announcements, and the staff accounts (Super
Admins and Office Admins, with their existing passwords).

Students, tickets, chat logs and messages are NOT copied - those are test
data locally, and real ones start fresh in production.

Usage (target = DATABASE_URL, source = SOURCE_DATABASE_URL; both settings):
    python manage.py migrate
    python manage.py copy_reference_data --dry-run
    python manage.py copy_reference_data

Rows keep their ids, so the links between them (an FAQ's office, an
announcement's author) stay correct. A row that already exists in the target
with the same id is updated, so the command is safe to run again.
"""

from django.core.management.base import BaseCommand, CommandError
from django.core.management.color import no_style
from django.db import connections, transaction

from announcements.models import Announcement
from faqs.models import Faq
from offices.models import Office
from phases.models import SchoolPhase
from users.models import User

SOURCE = "source"
TARGET = "default"


def copy_rows(model, rows, only_known=None):
    """update_or_create each row in the target by primary key. `only_known`
    maps a foreign-key column to the set of ids that exist in the target;
    other values are set to None (e.g. an FAQ written by a student account
    that isn't copied)."""
    fields = [f for f in model._meta.concrete_fields if not f.primary_key]
    # created_at/updated_at are stamped with "now" on save - put the
    # originals back afterwards with update(), which skips that.
    dated = [f.attname for f in fields if getattr(f, "auto_now", False) or getattr(f, "auto_now_add", False)]
    for row in rows:
        values = {}
        for field in fields:
            value = getattr(row, field.attname)
            if only_known and field.attname in only_known and value not in only_known[field.attname]:
                value = None
            values[field.attname] = value
        model.objects.using(TARGET).update_or_create(pk=row.pk, defaults=values)
        if dated:
            model.objects.using(TARGET).filter(pk=row.pk).update(**{name: values[name] for name in dated})
    return len(rows)


class Command(BaseCommand):
    help = "Copy offices, FAQs, phases, announcements and staff accounts from SOURCE_DATABASE_URL."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Only show what would be copied.")

    def handle(self, *args, **options):
        if SOURCE not in connections.databases:
            raise CommandError("Set SOURCE_DATABASE_URL to the database to copy from.")
        source_name = connections.databases[SOURCE]["NAME"]
        target_name = connections.databases[TARGET]["NAME"]
        if (connections.databases[SOURCE]["HOST"], source_name) == (
            connections.databases[TARGET]["HOST"], target_name
        ):
            raise CommandError("SOURCE_DATABASE_URL and the target database are the same.")

        offices = list(Office.objects.using(SOURCE).order_by("pk"))
        staff = list(
            User.objects.using(SOURCE).exclude(role=User.Role.STUDENT).order_by("pk")
        )
        faqs = list(Faq.objects.using(SOURCE).order_by("pk"))
        phases = list(SchoolPhase.objects.using(SOURCE).order_by("pk"))
        announcements = list(Announcement.objects.using(SOURCE).order_by("pk"))
        staff_ids = {user.pk for user in staff}
        skipped_announcements = [a for a in announcements if a.created_by_id not in staff_ids]
        announcements = [a for a in announcements if a.created_by_id in staff_ids]

        self.stdout.write(
            f"From {source_name} to {target_name}: {len(offices)} offices, {len(staff)} staff accounts, "
            f"{len(faqs)} FAQs, {len(phases)} phases, {len(announcements)} announcements."
        )
        if skipped_announcements:
            self.stdout.write(f"Skipping {len(skipped_announcements)} announcement(s) posted by a non-staff account.")
        if options["dry_run"]:
            self.stdout.write("Dry run - nothing copied.")
            return

        with transaction.atomic(using=TARGET):
            copy_rows(Office, offices)
            copy_rows(User, staff)
            copy_rows(Faq, faqs, only_known={"user_id": staff_ids, "updated_by_id": staff_ids})
            copy_rows(SchoolPhase, phases)
            copy_rows(Announcement, announcements)
            # Rows were inserted with their own ids: move each table's id
            # counter past them, or the next new row would collide.
            models = [Office, User, Faq, SchoolPhase, Announcement]
            with connections[TARGET].cursor() as cursor:
                for sql in connections[TARGET].ops.sequence_reset_sql(no_style(), models):
                    cursor.execute(sql)

        self.stdout.write(self.style.SUCCESS("Copied. Staff can log in with their existing passwords."))
