import re
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, models, transaction
from django.db.models import Q
from django.utils import timezone

from inquiry_logs.models import InquiryLog

FALLBACK_TICKET_TITLE = "General Inquiry"
# Ticket-code prefix for tickets with no office yet.
UNASSIGNED_OFFICE_CODE = "GEN"
# issue_description is 'Student asked: "..." - <outcome>.' for chat tickets.
ISSUE_PATTERN = re.compile(r'^Student asked: "(.*)" - (?:AI could not resolve|Answered by ChatDesk)\.$', re.S)

# When a chatbot-answered ticket moves to staff, its answer is moved into
# conversation_context as these lines (tickets/views.py) - and read back by
# Ticket.chatbot_answer so the student still sees it.
CHATBOT_ANSWER_PREFIX = "ChatDesk answered: "
FOLLOW_UP_NOTE = "Student asked for staff follow-up."
STAFF_STEPPED_IN_NOTE = "Staff followed up."
CHATBOT_ANSWER_PATTERN = re.compile(
    re.escape(CHATBOT_ANSWER_PREFIX)
    + r"(.*?)\n(?:"
    + re.escape(FOLLOW_UP_NOTE)
    + "|"
    + re.escape(STAFF_STEPPED_IN_NOTE)
    + ")",
    re.S,
)


def overdue_cutoff():
    return timezone.now() - timedelta(days=settings.TICKET_OVERDUE_DAYS)


def overdue_filter():
    """Staff tickets waiting on staff (pending) for longer than
    TICKET_OVERDUE_DAYS. An "active" ticket is waiting on the student."""
    return Q(is_ai_resolved=False, status=Ticket.Status.PENDING, waiting_since__lt=overdue_cutoff())


class TicketSequence(models.Model):
    """One row per office-and-day prefix (e.g. "OSA103126"), counting the
    tickets numbered under it. Locked row-by-row when numbering, so two
    tickets created at the same moment can't get the same number."""

    prefix = models.CharField(max_length=20, unique=True)
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "tbl_ticket_sequence"


def next_ticket_code(office, when=None):
    """OSA103126001: office code + Manila date (MMDDYY) + that office's
    number for the day, starting at 001 (grows to 1000+ if ever needed)."""
    day = timezone.localdate(when) if when else timezone.localdate()
    prefix = f"{office.code if office else UNASSIGNED_OFFICE_CODE}{day:%m%d%y}"
    with transaction.atomic():
        try:
            with transaction.atomic():
                TicketSequence.objects.get_or_create(prefix=prefix)
        except IntegrityError:
            pass  # another request created this prefix's row first
        sequence = TicketSequence.objects.select_for_update().get(prefix=prefix)
        sequence.last_number += 1
        sequence.save(update_fields=["last_number"])
    return f"{prefix}{sequence.last_number:03d}"


class Ticket(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACTIVE = "active", "Active"
        RESOLVED = "resolved", "Resolved"

    ticket_id = models.BigAutoField(primary_key=True)
    # Assigned once on creation and never changed - not even when the ticket
    # is rerouted to another office - so it stays a stable reference.
    ticket_code = models.CharField(max_length=24, unique=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tickets"
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="resolved_tickets",
    )
    # Nullable: auto-escalated tickets always get one (create_ticket_from_log below);
    # manual tickets (POST bypassing the AI) have no dialogue turn to link to.
    log = models.OneToOneField(
        InquiryLog, on_delete=models.CASCADE, null=True, blank=True, related_name="ticket"
    )
    # Short student-facing label like "Unable to Log In", AI-generated on
    # escalation; shown alongside the ticket number everywhere.
    title = models.CharField(max_length=100, default=FALLBACK_TICKET_TITLE)
    subject_category = models.CharField(max_length=100)
    # Which office/college is responsible for resolving this ticket. Null on
    # creation (AI escalation has no way to know the right office), routed
    # by Super Admin afterward through PATCH.
    office = models.ForeignKey(
        "offices.Office", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="tickets",
    )
    issue_description = models.TextField()
    # The chat turns right before an AI escalation, so staff can see what
    # "talk to staff" was about. Empty for manual tickets.
    conversation_context = models.TextField(blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    resolution = models.TextField(null=True, blank=True)
    # True while the ticket is just the record of a question the chatbot
    # answered from the FAQs - created already resolved, kept out of the
    # staff queue. Becomes False if the student asks for staff follow-up.
    is_ai_resolved = models.BooleanField(default=False)
    # When the student asked for follow-up on an AI-answered ticket; staff
    # resolution time is measured from here instead of created_at.
    reopened_at = models.DateTimeField(null=True, blank=True)
    # When the ticket last started waiting on staff: on creation, on a
    # follow-up request, and whenever the student replies. Overdue is
    # measured from here (see overdue_filter).
    waiting_since = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "tbl_ticket"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.ticket_code} ({self.status})"

    def save(self, *args, **kwargs):
        if not self.ticket_code:
            self.ticket_code = next_ticket_code(self.office, self.created_at)
        if self.waiting_since is None and self.status == self.Status.PENDING:
            self.waiting_since = timezone.now()
        super().save(*args, **kwargs)

    @property
    def is_overdue(self):
        return (
            not self.is_ai_resolved
            and self.status == self.Status.PENDING
            and self.waiting_since is not None
            and self.waiting_since < overdue_cutoff()
        )

    @property
    def chatbot_answer(self):
        """ChatDesk's earlier answer on a ticket that moved from the chatbot
        to staff (follow-up request or staff message), else None."""
        if self.is_ai_resolved:
            return None
        match = CHATBOT_ANSWER_PATTERN.search(self.conversation_context or "")
        return (match.group(1).strip() or None) if match else None

    @property
    def student_question(self):
        """The student's own words, without the "Student asked: ..." wrapper."""
        match = ISSUE_PATTERN.match(self.issue_description)
        return match.group(1) if match else self.issue_description


class TicketMessage(models.Model):
    """One message in a ticket's conversation between the student and
    staff - for questions back and forth before (or after) the answer."""

    class Sender(models.TextChoices):
        STUDENT = "student", "Student"
        STAFF = "staff", "Staff"

    message_id = models.BigAutoField(primary_key=True)
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="ticket_messages"
    )
    sender_role = models.CharField(max_length=10, choices=Sender.choices)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tbl_ticket_message"
        ordering = ["created_at", "message_id"]

    def __str__(self):
        return f"{self.sender_role} message on ticket {self.ticket_id}"