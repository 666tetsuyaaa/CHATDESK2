from django.db.models import Count, Q
from rest_framework.response import Response
from rest_framework.views import APIView

from inquiry_logs.models import DUPLICATE_TICKET_INTENT, NON_INQUIRY_INTENTS, InquiryLog
from offices.models import Office
from tickets.models import Ticket, overdue_cutoff, overdue_filter
from users.colleges import filter_by_college
from users.permissions import IsOfficeStaff

# Logged chat turns that aren't a new question: small talk, clarification
# prompts, off-topic, gibberish, and repeats of an already-open ticket.
OTHER_INTERACTION_INTENTS = (*NON_INQUIRY_INTENTS, DUPLICATE_TICKET_INTENT)
UNASSIGNED = "unassigned"


def _staff_clock_start(ticket_row):
    """Staff time is measured from the follow-up request on a reopened
    chatbot-answered ticket, otherwise from when the ticket was created."""
    return ticket_row["reopened_at"] or ticket_row["created_at"]


def _average_seconds(rows):
    durations = [
        (row["resolved_at"] - _staff_clock_start(row)).total_seconds()
        for row in rows
        if row["resolved_at"]
    ]
    return round(sum(durations) / len(durations)) if durations else None


def _office_breakdown(tickets, offices, include_unassigned):
    """Per office: staff tickets by status, chatbot-answered tickets, the
    oldest pending ticket, how many are overdue, and average staff
    resolution time."""
    staff = tickets.filter(is_ai_resolved=False)
    status_counts = {}
    for row in staff.values("office_id", "status").annotate(count=Count("ticket_id")):
        status_counts[(row["office_id"], row["status"])] = row["count"]
    ai_counts = {
        row["office_id"]: row["count"]
        for row in tickets.filter(is_ai_resolved=True).values("office_id").annotate(count=Count("ticket_id"))
    }
    oldest_pending = {}
    overdue_counts = {}
    cutoff = overdue_cutoff()
    for row in staff.filter(status=Ticket.Status.PENDING).values(
        "office_id", "ticket_code", "created_at", "reopened_at", "waiting_since"
    ):
        waiting_since = row["waiting_since"] or _staff_clock_start(row)
        if row["waiting_since"] and row["waiting_since"] < cutoff:
            overdue_counts[row["office_id"]] = overdue_counts.get(row["office_id"], 0) + 1
        current = oldest_pending.get(row["office_id"])
        if current is None or waiting_since < current["since"]:
            oldest_pending[row["office_id"]] = {"since": waiting_since, "code": row["ticket_code"]}
    resolved_rows = {}
    for row in staff.filter(status=Ticket.Status.RESOLVED).values(
        "office_id", "created_at", "reopened_at", "resolved_at"
    ):
        resolved_rows.setdefault(row["office_id"], []).append(row)

    def build(office_id, name, code):
        oldest = oldest_pending.get(office_id)
        return {
            "office_id": office_id,
            "office_name": name,
            "office_code": code,
            "pending": status_counts.get((office_id, Ticket.Status.PENDING), 0),
            "active": status_counts.get((office_id, Ticket.Status.ACTIVE), 0),
            "resolved": status_counts.get((office_id, Ticket.Status.RESOLVED), 0),
            "ai_answered": ai_counts.get(office_id, 0),
            "overdue": overdue_counts.get(office_id, 0),
            "oldest_pending_at": oldest["since"] if oldest else None,
            "oldest_pending_code": oldest["code"] if oldest else None,
            "avg_resolution_seconds": _average_seconds(resolved_rows.get(office_id, [])),
        }

    rows = [build(office.office_id, office.name, office.code) for office in offices]
    if include_unassigned:
        unassigned = build(None, "Unassigned", None)
        if any(unassigned[key] for key in ("pending", "active", "resolved", "ai_answered")):
            rows.append(unassigned)
    # Overdue and pending work first, so an office falling behind is at the top.
    rows.sort(key=lambda row: (-row["overdue"], -row["pending"], -row["active"], row["office_name"]))
    return rows


class AnalyticsOverviewView(APIView):
    """GET /api/v1/analytics/overview/ - superadmin or office_admin.
    Office Admins see only their own office's slice: tickets assigned to
    their office, and inquiry logs either tagged with their office (picked
    via the mobile category selector) or that escalated into one of those
    tickets. A log with neither isn't attributable to any one office.
    Optional filters: ?date_from=YYYY-MM-DD, ?date_to=YYYY-MM-DD, ?college=,
    and (Super Admin) ?office=<id> or ?office=unassigned."""

    permission_classes = [IsOfficeStaff]

    def get(self, request):
        user = request.user
        params = request.query_params
        logs = InquiryLog.objects.all()
        tickets = Ticket.objects.all()
        offices = Office.objects.all()
        include_unassigned = True

        if user.role == user.Role.OFFICE_ADMIN:
            logs = logs.filter(Q(office=user.office) | Q(ticket__office=user.office)).distinct()
            tickets = tickets.filter(office=user.office)
            offices = offices.filter(pk=user.office_id)
            include_unassigned = False
        else:
            office = params.get("office")
            if office == UNASSIGNED:
                logs = logs.filter(office__isnull=True).filter(Q(ticket__isnull=True) | Q(ticket__office__isnull=True))
                tickets = tickets.filter(office__isnull=True)
                offices = offices.none()
            elif office:
                logs = logs.filter(Q(office_id=office) | Q(ticket__office_id=office)).distinct()
                tickets = tickets.filter(office_id=office)
                offices = offices.filter(pk=office)
                include_unassigned = False

        college = params.get("college")
        logs = filter_by_college(logs, college)
        tickets = filter_by_college(tickets, college)

        date_from = params.get("date_from")
        date_to = params.get("date_to")
        if date_from:
            logs = logs.filter(timestamp__date__gte=date_from)
            tickets = tickets.filter(created_at__date__gte=date_from)
        if date_to:
            logs = logs.filter(timestamp__date__lte=date_to)
            tickets = tickets.filter(created_at__date__lte=date_to)

        def frequencies(queryset):
            return [
                {"intent": row["detected_intent"], "count": row["count"]}
                for row in queryset.values("detected_intent")
                                   .annotate(count=Count("detected_intent"))
                                   .order_by("-count")
            ]

        # Only real questions (FAQ answers + escalations) count as inquiries,
        # so "hi"/"ok thanks" don't inflate totals or dilute the topic chart.
        inquiries = logs.exclude(detected_intent__in=OTHER_INTERACTION_INTENTS)

        # Staff tickets only: every chatbot answer is also a ticket now
        # (already resolved), which would otherwise inflate the resolution rate.
        staff_tickets = tickets.filter(is_ai_resolved=False)
        tickets_by_status = {value: staff_tickets.filter(status=value).count() for value, _ in Ticket.Status.choices}
        total_staff = sum(tickets_by_status.values())
        resolved = tickets_by_status.get(Ticket.Status.RESOLVED, 0)

        return Response({
            "total_inquiries": inquiries.count(),
            "total_escalations": inquiries.filter(is_escalated=True).count(),
            "resolution_rate": round(resolved / total_staff, 2) if total_staff else 0.0,
            "intent_frequencies": frequencies(inquiries),
            "total_messages": logs.count(),
            "other_interactions": frequencies(logs.filter(detected_intent__in=OTHER_INTERACTION_INTENTS)),
            "tickets_by_status": tickets_by_status,
            "ai_answered_tickets": tickets.filter(is_ai_resolved=True).count(),
            "overdue_tickets": tickets.filter(overdue_filter()).count(),
            "avg_resolution_seconds": _average_seconds(
                staff_tickets.filter(status=Ticket.Status.RESOLVED).values("created_at", "reopened_at", "resolved_at")
            ),
            "offices": _office_breakdown(tickets, offices, include_unassigned),
        })
