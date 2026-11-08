"""
Groups the questions the chatbot couldn't answer, for the admin
"Unanswered Questions" page: questions sent to staff or that needed
clarification because no FAQ fit. Similar wordings are grouped by shared
keywords, most asked first, so admins can see which FAQs to write next.
"""

import re
from collections import Counter

from .models import CLARIFICATION_INTENT, ESCALATED_INTENT

UNANSWERED_INTENTS = (ESCALATED_INTENT, CLARIFICATION_INTENT)
# Two wordings with at least this share of keywords in common are one question.
GROUP_SIMILARITY = 0.5
MAX_EXAMPLES = 5
MAX_LOGS = 3000
# "is that all?" or a lone word can't become a useful FAQ.
MIN_KEYWORDS = 2

# Requests for a person rather than questions - nothing to write an FAQ about.
STAFF_REQUEST = re.compile(
    r"^\W*(?:i\s+(?:want|need|would like)\s+to\s+)?(?:talk|speak|chat|connect|usap)\w*\s+"
    r"(?:to|with|sa)?\s*(?:a\s+|an\s+|the\s+|an?\s+osa\s+)?(?:staff|human|person|admin|someone|agent|osa)\W*$",
    re.IGNORECASE,
)

STOPWORDS = set(
    """
    a an the is are was were be been being am i me my mine we our you your it its of to in on for at by with
    from and or but if so as than then there here this that these those what when where why who whom which how
    can could do does did done should would will shall may might must have has had get got please pls plz hi
    hello help need want know ask asking question about any some just only also very really not no yes ok okay
    all else more sure still
    im i'm ive dont can't cant wont thank thanks
    po ba ko ako ang ng nang sa mga na ni kay si yung yun iyon ito ano paano pano saan kailan bakit pwede puwede
    lang naman din rin pa kasi kung may meron wala ka mo niyo namin natin tayo kami sila siya nila
    """.split()
)


def keywords(text):
    words = re.findall(r"[a-z0-9]+", text.lower())
    result = set()
    for word in words:
        if word in STOPWORDS or len(word) < 2:
            continue
        # Light plural folding so "requirements" and "requirement" agree.
        if len(word) > 4 and word.endswith("s") and not word.endswith("ss"):
            word = word[:-1]
        result.add(word)
    return result


def overlap(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _normalized(text):
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def group_unanswered(logs, faqs=()):
    """`logs`: InquiryLogs, newest first (with office and ticket loaded).
    `faqs`: existing FAQs; a group that an FAQ added or edited after its
    last ask now covers is left out.

    Returns [{question, count, examples, last_asked_at, office_id,
    office_name, ticket_codes}], most asked first."""
    groups = []
    for log in logs:
        text = " ".join(log.user_message.split())
        if not text or STAFF_REQUEST.match(text):
            continue
        words = keywords(text)
        if len(words) < MIN_KEYWORDS:
            continue
        group = max(groups, key=lambda g: overlap(words, g["words"]), default=None)
        if group is None or overlap(words, group["words"]) < GROUP_SIMILARITY:
            group = {"words": words, "logs": []}
            groups.append(group)
        group["logs"].append(log)

    faq_words = [(keywords(faq.question_text), faq.updated_at) for faq in faqs]
    results = []
    for group in groups:
        logs_in_group = group["logs"]
        last_asked_at = logs_in_group[0].timestamp
        covered = any(
            overlap(group["words"], words) >= GROUP_SIMILARITY and updated_at >= last_asked_at
            for words, updated_at in faq_words
        )
        if covered:
            continue

        # The wording asked most often, newest first on a tie.
        counts = Counter(_normalized(log.user_message) for log in logs_in_group)
        examples, seen = [], set()
        for log in logs_in_group:
            key = _normalized(log.user_message)
            if key not in seen:
                seen.add(key)
                examples.append(" ".join(log.user_message.split()))
        question = max(examples, key=lambda text: counts[_normalized(text)])

        offices = Counter()
        for log in logs_in_group:
            ticket = getattr(log, "ticket", None)  # None when no ticket was made
            office = (ticket.office if ticket and ticket.office_id else None) or log.office
            if office is not None:
                offices[(office.office_id, office.name)] += 1
        (office_id, office_name), _ = offices.most_common(1)[0] if offices else ((None, None), 0)

        codes = []
        for log in logs_in_group:
            ticket = getattr(log, "ticket", None)  # None when no ticket was made
            if ticket is not None and ticket.ticket_code not in codes:
                codes.append(ticket.ticket_code)

        results.append({
            "question": question,
            "count": len(logs_in_group),
            "examples": examples[:MAX_EXAMPLES],
            "last_asked_at": last_asked_at,
            "office_id": office_id,
            "office_name": office_name,
            "ticket_codes": codes[:MAX_EXAMPLES],
        })

    results.sort(key=lambda row: (-row["count"], -row["last_asked_at"].timestamp()))
    return results
