from django.utils import timezone

from .models import FALLBACK_TICKET_TITLE, Ticket

TITLE_MAX_LENGTH = 100


def create_ai_answered_ticket(log, faq, office=None, conversation_context=""):
    """The record of a question the chatbot answered from an FAQ: created
    already resolved by the AI so it never enters the staff queue, but the
    student can still ask for staff follow-up on it (TicketFollowUpView)."""
    return Ticket.objects.create(
        user=log.user,
        log=log,
        title=faq.question_text[:TITLE_MAX_LENGTH],
        conversation_context=conversation_context,
        subject_category=faq.category,
        issue_description=f'Student asked: "{log.user_message}" - Answered by ChatDesk.',
        status=Ticket.Status.RESOLVED,
        resolution=log.chatbot_response,
        resolved_at=timezone.now(),
        is_ai_resolved=True,
        # The FAQ's own office decides the ticket code; fall back to the
        # office the student picked, if any.
        office=faq.office or office,
    )


def create_ticket_from_log(log, office=None, title=FALLBACK_TICKET_TITLE, conversation_context=""):
    return Ticket.objects.create(
        user=log.user,
        log=log,
        title=title,
        conversation_context=conversation_context,
        subject_category="Unresolved Inquiry",
        issue_description=f'Student asked: "{log.user_message}" - AI could not resolve.',
        status=Ticket.Status.PENDING,
        # Pre-assigned from the student's mobile category selection, if any -
        # otherwise left null for Super Admin to route manually, same as before.
        office=office,
    )