"""
OpenAI-based intent classification against the tbl_faqs knowledge base.
Per claude/PROJECT CONTEXT.md, the AI is strictly an intent classifier and
router, not an open-ended conversational AI: the model only ever picks a
message type plus intent_keywords / ticket ids out of what's already in the
database, it never writes the reply text itself - replies are always an
FAQ's own answer_content or one of the fixed messages below.
"""

import json
import re

from django.conf import settings
from django.db import models
from openai import OpenAI

from faqs.models import Faq
from tickets.models import FALLBACK_TICKET_TITLE, Ticket

from . import matching
from .models import (
    CLARIFICATION_INTENT,
    CONVERSATIONAL_INTENT,
    DUPLICATE_TICKET_INTENT,
    ESCALATED_INTENT,
    OFF_TOPIC_INTENT,
    UNCLEAR_INTENT,
)

MODEL = "gpt-5.6-luna"

ESCALATION_REPLY = (
    "I'm sorry, I couldn't find the exact procedure for that. "
    "I have automatically created a support ticket for you. "
    "An OSA staff member will review your concern shortly."
)

FOLLOW_UP_REPLY = (
    "That's everything I have on this for now. Feel free to ask another question, or type \"talk to staff\" "
    "if you'd like an OSA staff member to help - I'll create a support ticket for you."
)

GREETING_REPLY = (
    "Hi! I can help with student affairs concerns like enrollment, scholarships, clearance, and student "
    "discipline. What would you like to know?"
)

CLARIFY_WITH_SUGGESTIONS_REPLY = (
    "I want to make sure I get this right - did you mean one of these? If not, tell me a bit more about "
    "your concern."
)

CLARIFY_REPLY = (
    "Could you tell me a bit more about your concern? For example, what you're trying to do or which office "
    "it involves."
)

OFF_TOPIC_REPLY = (
    "I can only help with school and student affairs concerns - like enrollment, scholarships, clearance, "
    "and student discipline. Is there something about those I can help you with?"
)

UNCLEAR_REPLY = (
    "Sorry, I didn't quite get that. Could you rephrase your question? If you need help from an OSA staff "
    "member, type \"talk to staff\"."
)

DUPLICATE_TICKET_REPLY = (
    "You already have an open ticket for this concern, so I didn't create a new one. An OSA staff member "
    "will follow up there - you can check it below."
)

UNCLEAR_RESULT = {"detected_intent": UNCLEAR_INTENT, "reply": UNCLEAR_REPLY}

# Whole messages that are plainly small talk - answered without any AI call.
SMALL_TALK = {
    "hi", "hello", "hey", "helo", "hii", "good morning", "good afternoon", "good evening", "good day",
    "thanks", "thank you", "thank you so much", "thanks a lot", "ty", "tnx", "salamat", "maraming salamat",
    "ok", "okay", "ok thanks", "okay thanks", "got it", "noted", "sige", "sige salamat",
}
POLITE_SUFFIX = re.compile(r"\s+(po|poh|din|rin)$")

TICKET_TITLE_MAX_LENGTH = 60
MAX_CLARIFY_SUGGESTIONS = 3
MAX_OPEN_TICKETS_IN_PROMPT = 5
# Enough of each answer for the classifier to know what an FAQ actually
# covers, not just how its question happens to be worded.
FAQ_ANSWER_PREVIEW_CHARS = 200

# Context sent to the classifier: enough for "is that all?" or "what about
# that?" to make sense, small enough to keep the call cheap.
HISTORY_MAX_TURNS = 6
HISTORY_TURN_MAX_CHARS = 400

SYSTEM_PROMPT_TEMPLATE = """You are the intent classifier for ChatDesk, the student support chatbot of the \
University of Science and Technology of Southern Philippines (USTP) Office of Student Affairs (OSA).

Your ONLY job is to decide how ChatDesk should handle the student's NEW message. You never write replies, \
never answer questions yourself, and never hold a conversation - you only classify.

Students write in English, Tagalog, or Taglish (mixed Tagalog-English), often with typos. Understand their \
meaning regardless of language or spelling.

You may be given the recent conversation. Use it to understand what the new message refers to (e.g. "what \
documents do I need for that?" after an enrollment answer is about enrollment), but classify only the new \
message.

Knowledge base (FAQ intents - each with its question and a preview of the answer the student would get):
{faq_list}

The student's open support tickets:
{open_tickets}

Decide message_type by checking these in order and picking the FIRST that fits:

1. "unclear" - no understandable meaning even with context: random letters, keyboard mashing ("asdfgh"), a \
lone symbol, or text too broken to read.
2. "conversational" - asks for nothing new: a greeting, thanks, an acknowledgement ("ok", "got it", "sige"), \
or a follow-up about the previous answer that asks for nothing a listed FAQ covers ("is that all?", "are you \
sure?", "anything else?").
3. "faq_match" - read in context, the message asks for something one listed FAQ's ANSWER actually provides, \
including follow-ups that move to a different or more specific FAQ, and personal situations whose answer is \
a listed FAQ's general procedure. Judge by the answer preview, not just the question wording: an FAQ fits \
only if its answer would genuinely answer the student. Set matched_intent_keyword and match_confidence:
   - "high": that FAQ's answer clearly answers this message.
   - "medium": that FAQ is probably what they mean, but the message is broad or could also mean something \
the answer doesn't cover.
   Never pick an FAQ whose answer doesn't fit just because it shares a keyword.
4. "off_topic" - clearly has nothing to do with school, university life, or student concerns: weather, \
jokes, celebrities, general trivia, coding or homework-solving help, chit-chat about unrelated things. Anything \
about the student's wellbeing, safety, harassment, bullying, mental health, finances for school, or \
discipline is NEVER off_topic - use needs_staff.
5. "needs_clarification" - plausibly a school or student-affairs concern, but too vague to know what help is \
needed (e.g. "I have a problem with my grades", "paano yung requirements?", "help with my account"). Put up to \
3 listed FAQs the student most likely means in candidate_intent_keywords (empty if none fit). Do NOT use this \
if the student already explained a specific situation, or if ChatDesk's previous message already asked them \
to clarify - use needs_staff instead.
6. "needs_staff" - everything else that needs a person: a specific school concern no listed FAQ answers, a \
request that needs staff action (documents, records corrections, appeals, account problems, reports of \
incidents, personal cases), the student explicitly asks for staff, a human, or a ticket, or says a previous \
answer did not solve their problem.

match_confidence: "high" or "medium" as above for faq_match; "none" for every other message_type.

duplicate_of_ticket_id: only when message_type is "needs_staff" and the new message is about the SAME concern \
as one of the student's open tickets listed above (including a repeated "talk to staff" about the same \
topic), set it to that ticket's id. Otherwise null. A different concern always gets null.

ticket_title: a short label (2 to 6 words, English, Title Case) naming the student's concern, such as \
"Unable to Log In", "Scholarship Application Inquiry", or "Lost School ID", even if the student wrote in \
Tagalog or Taglish. If the message only asks for staff or says the previous answer didn't help, name the \
topic from the conversation (e.g. "Enrollment Process Follow-up"), not "Staff Assistance". Never a full \
sentence, no ending punctuation. Always fill it in, whatever the message_type."""

# OpenAI's defaults (10-minute timeout, 2 retries) would leave a student's
# request hanging for minutes. A timeout counts as an AI failure, which
# escalates once (the duplicate check stops repeats).
_client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=15, max_retries=1)


def _clean_ticket_title(raw) -> str:
    title = " ".join(str(raw or "").split()).strip(" .\"'")
    if not title:
        return FALLBACK_TICKET_TITLE
    return title[:TICKET_TITLE_MAX_LENGTH].rstrip()


def _normalize(text: str) -> str:
    return " ".join(text.lower().split())


def _normalize_question(text: str) -> str:
    """Case, spacing and punctuation-insensitive form, so a tapped quick
    action or a typed copy of an FAQ question matches it exactly."""
    return " ".join(re.sub(r"[^\w\s]", " ", text.lower()).split())


def _is_small_talk(message: str) -> bool:
    text = POLITE_SUFFIX.sub("", _normalize_question(message))
    return text in SMALL_TALK


def _faq_result(faq) -> dict:
    return {"detected_intent": faq.intent_keyword, "reply": faq.answer_content, "faq": faq}


def _clarification_result(faqs_by_keyword, keywords) -> dict:
    suggestions = []
    for keyword in keywords:
        faq = faqs_by_keyword.get(keyword)
        if faq is not None and faq.question_text not in suggestions:
            suggestions.append(faq.question_text)
    suggestions = suggestions[:MAX_CLARIFY_SUGGESTIONS]
    return {
        "detected_intent": CLARIFICATION_INTENT,
        "reply": CLARIFY_WITH_SUGGESTIONS_REPLY if suggestions else CLARIFY_REPLY,
        "suggested_questions": suggestions,
    }


def recent_turns(history):
    return (history or [])[-HISTORY_MAX_TURNS:]


def format_turns(history) -> str:
    lines = []
    for turn in recent_turns(history):
        speaker = "Student" if turn["role"] == "user" else "ChatDesk"
        text = " ".join(turn["text"].split())
        if len(text) > HISTORY_TURN_MAX_CHARS:
            text = text[:HISTORY_TURN_MAX_CHARS] + "..."
        lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def _build_classifier_input(message: str, history) -> str:
    if not recent_turns(history):
        return message
    return f"Recent conversation (oldest first):\n{format_turns(history)}\n\nNew student message:\n{message}"


def _last_reply_was_clarification(history) -> bool:
    for turn in reversed(history or []):
        if turn["role"] == "assistant":
            return turn["text"] in (CLARIFY_REPLY, CLARIFY_WITH_SUGGESTIONS_REPLY)
    return False


def _open_tickets_for(user):
    if user is None:
        return []
    return list(
        Ticket.objects.filter(user=user, status__in=[Ticket.Status.PENDING, Ticket.Status.ACTIVE])
        .select_related("log")
        .order_by("-created_at")[:MAX_OPEN_TICKETS_IN_PROMPT]
    )


def _exact_repeat_ticket(message: str, open_tickets):
    """Backstop for the AI's duplicate check: the same message word for word
    as an open ticket's original question is always the same concern."""
    normalized = _normalize(message)
    for ticket in open_tickets:
        if ticket.log is not None and _normalize(ticket.log.user_message) == normalized:
            return ticket
    return None


def exact_repeat_ticket(user, message: str):
    """Re-checked by ChatAskView under a per-student lock, right before a
    ticket is created, to close the race between two concurrent requests."""
    return _exact_repeat_ticket(message, _open_tickets_for(user))


def _escalation_result(ticket_title=FALLBACK_TICKET_TITLE) -> dict:
    return {"detected_intent": ESCALATED_INTENT, "reply": ESCALATION_REPLY, "ticket_title": ticket_title}


def duplicate_result(ticket) -> dict:
    return {"detected_intent": DUPLICATE_TICKET_INTENT, "reply": DUPLICATE_TICKET_REPLY, "existing_ticket": ticket}


def _staff_result(message, ticket_title, open_tickets, duplicate_id=None) -> dict:
    duplicate = next((t for t in open_tickets if str(t.ticket_id) == duplicate_id), None)
    duplicate = duplicate or _exact_repeat_ticket(message, open_tickets)
    if duplicate is not None:
        return duplicate_result(duplicate)
    return _escalation_result(_clean_ticket_title(ticket_title))


def classify_message(message: str, office=None, history=None, user=None) -> dict:
    """
    Decides how to handle one student message. Returns detected_intent and
    reply, plus ticket_title when a new ticket should be created,
    existing_ticket when it repeats an open one, or suggested_questions when
    asking the student to clarify.

    office: the Office picked in the mobile category selector (optional) -
    narrows the FAQ pool to that office's FAQs plus uncategorized ones, and
    routes any resulting ticket to it.
    history: the current chat's earlier turns ([{"role", "text"}], oldest
    first) so follow-ups are understood in context.
    user: the asking student, used to avoid duplicate tickets.
    """
    # "f", "?", "..." - nothing to classify, so skip the AI call entirely.
    if sum(ch.isalnum() for ch in message) < 2:
        return UNCLEAR_RESULT

    if _is_small_talk(message):
        return {"detected_intent": CONVERSATIONAL_INTENT, "reply": FOLLOW_UP_REPLY if history else GREETING_REPLY}

    open_tickets = _open_tickets_for(user)

    candidate_faqs = Faq.objects.all()
    if office is not None:
        candidate_faqs = candidate_faqs.filter(models.Q(office=office) | models.Q(office__isnull=True))
    faqs_by_keyword = {faq.intent_keyword: faq for faq in candidate_faqs}
    if not faqs_by_keyword:
        return _staff_result(message, None, open_tickets)

    # Quick actions and clarification chips send an FAQ's question verbatim -
    # answer those directly: always correct, consistent, and no AI call.
    normalized_message = _normalize_question(message)
    for faq in faqs_by_keyword.values():
        if _normalize_question(faq.question_text) == normalized_message:
            return _faq_result(faq)

    # A clear match by meaning is answered straight away; anything less
    # clear goes on to the classifier, which can also ask "did you mean...?".
    clear_faq = matching.clear_match(_client, message, list(faqs_by_keyword.values()), history)
    if clear_faq is not None:
        return _faq_result(clear_faq)

    def answer_preview(faq):
        text = " ".join(faq.answer_content.split())
        return text if len(text) <= FAQ_ANSWER_PREVIEW_CHARS else text[:FAQ_ANSWER_PREVIEW_CHARS] + "..."

    faq_list = "\n".join(
        f"- {faq.intent_keyword} (category: {faq.category})\n"
        f"  Q: {faq.question_text}\n"
        f"  A: {answer_preview(faq)}"
        for faq in faqs_by_keyword.values()
    )
    open_ticket_list = "\n".join(
        f"- id {t.ticket_id}: {t.title} (student asked: "
        f"\"{(t.log.user_message if t.log else t.issue_description)[:150]}\")"
        for t in open_tickets
    ) or "(none)"
    keyword_enum = {"type": "string", "enum": list(faqs_by_keyword.keys())}
    ticket_id_schema = (
        {"anyOf": [{"type": "string", "enum": [str(t.ticket_id) for t in open_tickets]}, {"type": "null"}]}
        if open_tickets
        else {"type": "null"}
    )

    try:
        response = _client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT_TEMPLATE.format(faq_list=faq_list, open_tickets=open_ticket_list),
                },
                {"role": "user", "content": _build_classifier_input(message, history)},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "chat_message_decision",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "message_type": {
                                "type": "string",
                                "enum": [
                                    "unclear", "conversational", "faq_match", "off_topic",
                                    "needs_clarification", "needs_staff",
                                ],
                            },
                            "matched_intent_keyword": {"anyOf": [keyword_enum, {"type": "null"}]},
                            "match_confidence": {"type": "string", "enum": ["high", "medium", "none"]},
                            "candidate_intent_keywords": {"type": "array", "items": keyword_enum},
                            "duplicate_of_ticket_id": ticket_id_schema,
                            "ticket_title": {"type": "string"},
                        },
                        "required": [
                            "message_type", "matched_intent_keyword", "match_confidence",
                            "candidate_intent_keywords",
                            "duplicate_of_ticket_id", "ticket_title",
                        ],
                        "additionalProperties": False,
                    },
                },
            },
        )
        decision = json.loads(response.choices[0].message.content)
    except Exception:
        # Any failure (network, auth, rate limit, malformed response) falls back to
        # staff rather than 500ing - no student query should go unanswered.
        return _staff_result(message, None, open_tickets)

    message_type = decision["message_type"]
    ticket_title = decision.get("ticket_title")

    if message_type == "unclear":
        return UNCLEAR_RESULT

    if message_type == "conversational":
        return {"detected_intent": CONVERSATIONAL_INTENT, "reply": FOLLOW_UP_REPLY if history else GREETING_REPLY}

    if message_type == "off_topic":
        return {"detected_intent": OFF_TOPIC_INTENT, "reply": OFF_TOPIC_REPLY}

    already_clarified = _last_reply_was_clarification(history)
    candidates = decision.get("candidate_intent_keywords") or []

    if message_type == "faq_match":
        matched_keyword = decision.get("matched_intent_keyword")
        matched_faq = faqs_by_keyword.get(matched_keyword)
        if matched_faq is None:
            return _staff_result(message, ticket_title, open_tickets)
        # A probable-but-unsure match is offered as "did you mean...?" instead
        # of risking a wrong answer - unless we already asked once, in which
        # case the student has narrowed it down as far as they will.
        if decision.get("match_confidence") != "high" and not already_clarified:
            return _clarification_result(faqs_by_keyword, [matched_keyword, *candidates])
        return _faq_result(matched_faq)

    # Asked once already and still vague - stop asking and get a person on it.
    if message_type == "needs_clarification" and not already_clarified:
        return _clarification_result(faqs_by_keyword, candidates)

    return _staff_result(message, ticket_title, open_tickets, decision.get("duplicate_of_ticket_id"))
