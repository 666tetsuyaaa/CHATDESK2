"""
python manage.py evaluate_chatbot [--cases path.json] [--failures-only]

Runs labeled example messages through the real classify_message (real
OpenAI calls, nothing saved to the database) and reports how often the
chatbot made the expected decision. Run it after changing the prompt or the
FAQs to catch regressions. Cases expecting an FAQ that doesn't exist in this
database are skipped, since FAQ content differs between machines.
"""

import json
from collections import Counter
from pathlib import Path

from django.core.management.base import BaseCommand

from faqs.models import Faq
from inquiry_logs.services import DUPLICATE_TICKET_INTENT, ESCALATED_INTENT, classify_message

DEFAULT_CASES = Path(__file__).resolve().parents[2] / "evaluation_cases.json"


def decision_of(detected_intent, faq_keywords):
    if detected_intent in faq_keywords:
        return "faq_match"
    if detected_intent in (ESCALATED_INTENT, DUPLICATE_TICKET_INTENT):
        return "needs_staff"
    return detected_intent


class Command(BaseCommand):
    help = "Measure chatbot decision accuracy against labeled example messages."

    def add_arguments(self, parser):
        parser.add_argument("--cases", default=str(DEFAULT_CASES), help="Path to a JSON list of cases.")
        parser.add_argument("--failures-only", action="store_true", help="Only print cases that failed.")

    def handle(self, *args, **options):
        cases = json.loads(Path(options["cases"]).read_text(encoding="utf-8"))
        faq_keywords = set(Faq.objects.values_list("intent_keyword", flat=True))

        totals, passes, skipped = Counter(), Counter(), 0
        for case in cases:
            expect, intent = case["expect"], case.get("intent")
            if intent and intent not in faq_keywords:
                skipped += 1
                continue

            result = classify_message(case["message"], history=case.get("history"))
            got = decision_of(result["detected_intent"], faq_keywords)
            ok = got == expect and (expect != "faq_match" or result["detected_intent"] == intent)

            totals[expect] += 1
            passes[expect] += ok
            if ok and options["failures_only"]:
                continue
            got_label = result["detected_intent"] if got == "faq_match" else got
            expect_label = intent or expect
            mark = self.style.SUCCESS("PASS") if ok else self.style.ERROR("FAIL")
            line = f"{mark}  {case['message'][:55]!r:58} expected {expect_label:32} got {got_label}"
            if result.get("suggested_questions"):
                line += f"  (offered: {', '.join(result['suggested_questions'])})"
            self.stdout.write(line)

        total, passed = sum(totals.values()), sum(passes.values())
        self.stdout.write("")
        for expect in sorted(totals):
            self.stdout.write(f"  {expect:22} {passes[expect]:>3}/{totals[expect]:<3}")
        summary = f"Accuracy: {passed}/{total} ({passed / total:.0%})" if total else "No cases ran."
        if skipped:
            summary += f" - {skipped} skipped (FAQ not in this database)"
        self.stdout.write(self.style.SUCCESS(summary) if passed == total else self.style.WARNING(summary))
