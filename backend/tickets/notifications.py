"""Emails about tickets: to the student when staff answer or reply, and the
daily overdue reminder to office admins (send_overdue_reminders command).

Each email is sent only after the database change is saved, and on a
background thread so a slow Gmail never holds up the staff member's request.
A failed send is logged and dropped; the answer is still in the app."""

import logging
import threading

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from users.services import EmailDeliveryError, deliver_email

logger = logging.getLogger(__name__)

SIGN_OFF = "\n\nYou can also see this in the ChatDesk app under My Tickets.\n\n- ChatDesk"


def _send(subject, body, recipient):
    try:
        deliver_email(subject, body, recipient)
    except EmailDeliveryError:
        pass  # deliver_email already logged it


def send_after_commit(subject, body, recipient):
    def start():
        if settings.SEND_EMAIL_IN_BACKGROUND:
            threading.Thread(target=_send, args=(subject, body, recipient), daemon=True).start()
        else:
            _send(subject, body, recipient)

    transaction.on_commit(start)


def notify_ticket_answered(ticket):
    """Staff resolved the ticket: send the student the code and the answer."""
    student = ticket.user
    send_after_commit(
        subject=f"Your ChatDesk ticket {ticket.ticket_code} has been answered",
        body=(
            f"Hi {student.first_name},\n\n"
            f"Your ticket {ticket.ticket_code} ({ticket.title}) has been answered.\n\n"
            f"Your question:\n{ticket.student_question}\n\n"
            f"Answer from {ticket.office.name if ticket.office else 'staff'}:\n{ticket.resolution}"
            f"{SIGN_OFF}"
        ),
        recipient=student.email,
    )


def notify_staff_message(ticket, message):
    """Staff sent a message on the ticket's conversation."""
    student = ticket.user
    send_after_commit(
        subject=f"New reply on your ChatDesk ticket {ticket.ticket_code}",
        body=(
            f"Hi {student.first_name},\n\n"
            f"Staff replied to your ticket {ticket.ticket_code} ({ticket.title}):\n\n"
            f"{message.body}\n\n"
            "Open the ticket in ChatDesk to reply."
            f"{SIGN_OFF}"
        ),
        recipient=student.email,
    )


REMINDER_LIST_LIMIT = 20


def overdue_reminder(admin, tickets, place):
    """Subject and body of one admin's daily reminder. `tickets` is the
    overdue tickets, oldest first; `place` is e.g. "Office of Student
    Affairs" or "no office yet" (for a Super Admin)."""
    count = len(tickets)
    noun = "ticket" if count == 1 else "tickets"
    lines = [
        f"- {t.ticket_code}: {t.title} (waiting since {timezone.localtime(t.waiting_since):%b %d, %Y})"
        for t in tickets[:REMINDER_LIST_LIMIT]
    ]
    if count > REMINDER_LIST_LIMIT:
        lines.append(f"- and {count - REMINDER_LIST_LIMIT} more")
    link = f"\n\nOpen them here: {settings.ADMIN_DASHBOARD_URL}/tickets" if settings.ADMIN_DASHBOARD_URL else ""
    subject = f"You have {count} ChatDesk {noun} waiting"
    body = (
        f"Hi {admin.first_name},\n\n"
        f"{count} {noun} ({place}) {'has' if count == 1 else 'have'} waited more than "
        f"{settings.TICKET_OVERDUE_DAYS} days for an answer:\n\n"
        + "\n".join(lines)
        + link
        + "\n\n- ChatDesk"
    )
    return subject, body
