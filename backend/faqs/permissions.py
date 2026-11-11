from rest_framework import permissions


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        user = request.user
        if user.role == user.Role.SUPERADMIN:
            return True
        # Office-less Office Admins would create FAQs with office=None, which
        # the chatbot treats as general and shows to every student.
        return user.role == user.Role.OFFICE_ADMIN and user.office_id is not None