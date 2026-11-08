"""
python manage.py embed_faqs                    # embed new or edited FAQs
python manage.py embed_faqs --try "message"    # show how a message scores

The chatbot embeds FAQs by itself the first time it needs them; running this
after adding FAQs just saves the first student that wait. --try shows the
closest FAQs for a message and whether it would be answered straight away,
to help choose FAQ_MATCH_THRESHOLD and FAQ_MATCH_MARGIN.
"""

from django.conf import settings
from django.core.management.base import BaseCommand

from faqs.models import Faq
from inquiry_logs import matching
from inquiry_logs.services import _client


class Command(BaseCommand):
    help = "Compute OpenAI embeddings for FAQ questions used by smart FAQ matching."

    def add_arguments(self, parser):
        parser.add_argument("--try", dest="messages", action="append", default=[], help="A student message to score.")

    def handle(self, *args, **options):
        faqs = list(Faq.objects.all())
        updated = matching.ensure_faq_embeddings(_client, faqs)
        self.stdout.write(self.style.SUCCESS(f"{updated} FAQ(s) embedded; {len(faqs)} in total."))

        for message in options["messages"]:
            ranked = matching.rank_faqs(_client, message, faqs)
            match = matching.clear_match(_client, message, faqs)
            verdict = f"answered with {match.intent_keyword}" if match else "sent to the classifier"
            self.stdout.write(f"\n{message!r}: {verdict}")
            for score, faq in ranked[:3]:
                self.stdout.write(f"  {score:.3f}  {faq.intent_keyword}: {faq.question_text[:70]}")
        if options["messages"]:
            self.stdout.write(
                f"\nThreshold {settings.FAQ_MATCH_THRESHOLD}, margin {settings.FAQ_MATCH_MARGIN} "
                "(set FAQ_MATCH_THRESHOLD / FAQ_MATCH_MARGIN in .env)."
            )
