"""
python manage.py evaluate_chatbot [--cases path.json] [--failures-only]

Runs labeled example messages through the real answer_message (real
OpenAI calls, nothing saved to the database) and reports how often the
chatbot made the expected decision. Run it after changing the prompt or the
FAQs to catch regressions. Cases expecting an FAQ that doesn't exist in this
database are skipped, since FAQ content differs between machines. A case
with "parts" expects that many answers, one per question in the message.
"""

import json
from collections import Counter
from pathlib import Path

from django.core.management.base import BaseCommand

from faqs.models import Faq
from inquiry_logs.services import DUPLICATE_TICKET_INTENT, ESCALATED_INTENT, answer_message

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
            # A message asking several things lists each part's expectation
            # in "parts" ({"expect", "intent"} like a single case).
            expected = case.get("parts") or [{"expect": case["expect"], "intent": case.get("intent")}]
            if any(e.get("intent") and e["intent"] not in faq_keywords for e in expected):
                skipped += 1
                continue

            parts = answer_message(case["message"], history=case.get("history"))["parts"]
            if "parts" not in case:
                parts = parts[:1]
            got = [decision_of(part["detected_intent"], faq_keywords) for part in parts]
            ok = len(got) == len(expected) and all(
                g == e["expect"] and (e["expect"] != "faq_match" or part["detected_intent"] == e.get("intent"))
                for g, e, part in zip(got, expected, parts)
            )

            category = case["expect"]
            totals[category] += 1
            passes[category] += ok
            if ok and options["failures_only"]:
                continue
            got_label = " + ".join(
                part["detected_intent"] if g == "faq_match" else g for g, part in zip(got, parts)
            )
            expect_label = " + ".join(e.get("intent") or e["expect"] for e in expected)
            mark = self.style.SUCCESS("PASS") if ok else self.style.ERROR("FAIL")
            line = f"{mark}  {case['message'][:55]!r:58} expected {expect_label:32} got {got_label}"
            offered = [q for part in parts for q in part.get("suggested_questions", [])]
            if offered:
                line += f"  (offered: {', '.join(offered)})"
            self.stdout.write(line)

        total, passed = sum(totals.values()), sum(passes.values())
        self.stdout.write("")
        for expect in sorted(totals):
            self.stdout.write(f"  {expect:22} {passes[expect]:>3}/{totals[expect]:<3}")
        summary = f"Accuracy: {passed}/{total} ({passed / total:.0%})" if total else "No cases ran."
        if skipped:
            summary += f" - {skipped} skipped (FAQ not in this database)"
        self.stdout.write(self.style.SUCCESS(summary) if passed == total else self.style.WARNING(summary))
