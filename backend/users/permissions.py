from rest_framework.permissions import BasePermission


class IsStudent(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role == request.user.Role.STUDENT
        )


class IsAdmin(BasePermission):
    """Named IsAdmin for historical reasons - actually gates on the
    Super Admin role. Used for endpoints that stay Super Admin-only even
    after Office Admin accounts exist: User Management, Offices,
    Announcements, Phases."""

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role == request.user.Role.SUPERADMIN
        )


class IsOfficeStaff(BasePermission):
    """Super Admin or Office Admin - any privileged, non-student dashboard
    role. Used where Office Admins get access too (FAQs, Tickets, Analytics,
    Inquiry Logs); the actual per-office data scoping happens in each view's
    get_queryset(), not here."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role == user.Role.SUPERADMIN:
            return True
        # An Office Admin without an office must get nothing: their querysets
        # filter by office=None, which would match every *unassigned* row.
        return user.role == user.Role.OFFICE_ADMIN and user.office_id is not None