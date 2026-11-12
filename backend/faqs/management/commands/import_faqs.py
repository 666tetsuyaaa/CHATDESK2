"""
python manage.py import_faqs                  # dry run: shows what would change
python manage.py import_faqs --apply          # adds/updates the FAQs, removes test_ FAQs
python manage.py import_faqs --apply --embed  # ...then prepares them for smart matching
python manage.py import_faqs --remove a b      # also remove these FAQs (by intent_keyword)

Loads the FAQ master list (faqs/data/faq_master_list.json, built from
"ChatDesk FAQ Master List" - the 184 answered FAQs; the 15 with no answer
yet are left out) into the FAQ table:
- each FAQ is matched by intent_keyword: new ones are added, changed ones
  updated, identical ones left alone;
- the placeholder FAQs used during development (intent_keyword starting
  with "test_") are removed;
- any other FAQ already in ChatDesk (e.g. added by staff in the dashboard)
  is kept and listed.
Nothing is written without --apply, and the whole change is one
transaction - it either all happens or none of it does.
"""

import json
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from faqs.models import Faq
from offices.models import Office

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "data" / "faq_master_list.json"
TEST_PREFIX = "test_"
FIELDS = ("question_text", "answer_content", "category", "office_id")


class Command(BaseCommand):
    help = "Load the FAQ master list (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(DEFAULT_FILE), help="The FAQ list (JSON).")
        parser.add_argument("--apply", action="store_true", help="Write the changes (default: only show them).")
        parser.add_argument("--embed", action="store_true", help="After applying, run embed_faqs.")
        parser.add_argument("--keep-test", action="store_true", help="Don't remove the test_ placeholder FAQs.")
        parser.add_argument("--remove", nargs="*", default=[], metavar="KEYWORD",
                            help="Also remove these FAQs (e.g. old placeholders not named test_).")

    def handle(self, *args, **options):
        rows = json.loads(Path(options["file"]).read_text(encoding="utf-8"))
        offices = {office.code.upper(): office for office in Office.objects.all()}
        categories = {value for value, _ in Faq.Category.choices}

        keywords = [row["intent_keyword"] for row in rows]
        if len(set(keywords)) != len(keywords):
            raise CommandError("The FAQ list has duplicate intent_keyword values.")

        existing = {faq.intent_keyword: faq for faq in Faq.objects.all()}
        to_add, to_update, unchanged, missing_offices = [], [], 0, set()
        for row in rows:
            if row["category"] not in categories:
                raise CommandError(f'{row["intent_keyword"]}: unknown category {row["category"]!r}.')
            code = (row.get("office_code") or "").upper()
            office = offices.get(code) if code else None
            if code and office is None:
                missing_offices.add(code)
            wanted = {
                "question_text": row["question_text"].strip(),
                "answer_content": row["answer_content"].strip(),
                "category": row["category"],
                "office_id": office.pk if office else None,
            }
            faq = existing.get(row["intent_keyword"])
            if faq is None:
                to_add.append((row["intent_keyword"], wanted))
            elif any(getattr(faq, field) != wanted[field] for field in FIELDS):
                to_update.append((faq, wanted))
            else:
                unchanged += 1

        listed = set(keywords)
        extra = set(options["remove"])
        unknown = sorted(extra - set(existing))
        if unknown:
            self.stdout.write(self.style.WARNING(f"  --remove: not in ChatDesk, skipped: {', '.join(unknown)}"))
        if extra & listed:
            raise CommandError(f"--remove names FAQs that are in the list: {', '.join(sorted(extra & listed))}")
        to_remove = [
            faq for key, faq in existing.items()
            if key not in listed and (key in extra or (key.startswith(TEST_PREFIX) and not options["keep_test"]))
        ]
        removed = {faq.intent_keyword for faq in to_remove}
        kept = sorted(key for key in existing if key not in listed and key not in removed)

        self.stdout.write(f"FAQ list: {len(rows)} FAQs ({options['file']})")
        self.stdout.write(f"  add:       {len(to_add)}")
        self.stdout.write(f"  update:    {len(to_update)}")
        self.stdout.write(f"  unchanged: {unchanged}")
        self.stdout.write(f"  remove: {len(to_remove)}"
                          + (f" - {', '.join(faq.intent_keyword for faq in to_remove)}" if to_remove else ""))
        self.stdout.write(f"  kept (in ChatDesk, not in the list): {len(kept)}" + (f" - {', '.join(kept)}" if kept else ""))
        if missing_offices:
            self.stdout.write(self.style.WARNING(
                f"  offices not found in ChatDesk (those FAQs get no office): {', '.join(sorted(missing_offices))}"
            ))
        by_office = {}
        for _, wanted in to_add + [(faq.intent_keyword, wanted) for faq, wanted in to_update]:
            name = next((o.name for o in offices.values() if o.pk == wanted["office_id"]), "No office (all offices)")
            by_office[name] = by_office.get(name, 0) + 1
        for name, count in sorted(by_office.items(), key=lambda item: -item[1]):
            self.stdout.write(f"    {count:3d} -> {name}")

        if not options["apply"]:
            self.stdout.write(self.style.WARNING("Dry run - nothing was changed. Run again with --apply to import."))
            return

        with transaction.atomic():
            for faq in to_remove:
                faq.delete()
            for keyword, wanted in to_add:
                Faq.objects.create(intent_keyword=keyword, **wanted)
            for faq, wanted in to_update:
                for field, value in wanted.items():
                    setattr(faq, field, value)
                faq.save()
        self.stdout.write(self.style.SUCCESS(
            f"Imported: {len(to_add)} added, {len(to_update)} updated, {len(to_remove)} removed. "
            f"ChatDesk now has {Faq.objects.count()} FAQs."
        ))
        if options["embed"]:
            call_command("embed_faqs", stdout=self.stdout)
        else:
            self.stdout.write("Next: python manage.py embed_faqs (prepares the new FAQs for smart matching).")
