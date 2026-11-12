import secrets
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView as BaseTokenRefreshView

from .colleges import college_list
from .models import PasswordResetCode, User
from .permissions import IsAdmin
from .serializers import (
    ActiveUserTokenRefreshSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserAdminUpdateSerializer,
    UserCreateSerializer,
    UserSelfUpdateSerializer,
    UserSerializer,
)
from .services import (
    EmailDeliveryError,
    revoke_all_refresh_tokens,
    send_password_reset_email,
    send_welcome_email,
)
from .throttles import EmailRateThrottle

RESET_CODE_LIFETIME = timedelta(minutes=10)
RESET_CODE_COOLDOWN = timedelta(seconds=60)
GENERIC_REQUEST_MESSAGE = "If that email is registered, a password reset code has been sent."


class RegisterView(generics.CreateAPIView):
    """POST /api/v1/auth/register/ - public. Creates a student account."""

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # A thank-you email. Best effort - if Gmail is down the student still
        # gets their account and is logged in.
        send_welcome_email(user)
        response_serializer = RegisterSerializer(user, context=self.get_serializer_context())
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    """POST /api/v1/auth/login/ - public."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle, EmailRateThrottle]
    throttle_scope = "login"
    email_throttle_scope = "login_email"

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class TokenRefreshView(BaseTokenRefreshView):
    """POST /api/v1/auth/token/refresh/ - refuses deactivated accounts (401)."""

    serializer_class = ActiveUserTokenRefreshSerializer


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ - auth required. Blacklists the refresh token."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {
                    "error": "validation_error",
                    "message": "Invalid request parameters.",
                    "details": {"refresh": ["This field is required."]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return Response(
                {
                    "error": "validation_error",
                    "message": "Invalid or expired refresh token.",
                    "details": {},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    """
    GET   /api/v1/auth/me/ - auth required. Returns the current user's profile.
    PATCH /api/v1/auth/me/ - auth required. Edit your own first_name/last_name
          only - see UserSelfUpdateSerializer for why it's this narrow.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def get_serializer_class(self):
        return UserSelfUpdateSerializer if self.request.method == "PATCH" else UserSerializer


class PasswordResetRequestView(APIView):
    """
    POST /api/v1/auth/password-reset/request/ - public. Mobile "Forgot
    Password" step 1. Always returns the same generic message regardless of
    whether the email is registered, active, or was just sent a code
    seconds ago - the response can't be used to probe account existence.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle, EmailRateThrottle]
    throttle_scope = "password_reset_request"
    email_throttle_scope = "password_reset_request_email"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        response_data = {"message": GENERIC_REQUEST_MESSAGE}

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            recent_code = user.password_reset_codes.filter(
                created_at__gt=timezone.now() - RESET_CODE_COOLDOWN
            ).exists()
            if not recent_code:
                raw_code = f"{secrets.randbelow(1_000_000):06d}"
                try:
                    with transaction.atomic():
                        # Only the newest code is ever valid - otherwise
                        # requesting every minute stacks up ~10 live codes
                        # and makes guessing 10x easier.
                        user.password_reset_codes.filter(is_used=False).update(is_used=True)
                        PasswordResetCode.objects.create(
                            user=user,
                            code_hash=make_password(raw_code),
                            expires_at=timezone.now() + RESET_CODE_LIFETIME,
                        )
                        dev_code = send_password_reset_email(user, raw_code)
                    if dev_code:
                        response_data["dev_code"] = dev_code
                except EmailDeliveryError:
                    # Already logged. The response must look exactly like
                    # every other one, or an error here would reveal which
                    # emails have accounts.
                    pass

        return Response(response_data, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """POST /api/v1/auth/password-reset/confirm/ - public. Mobile "Forgot
    Password" step 2: verify the emailed code and set a new password. Only
    the newest code counts, and it's burned after MAX_ATTEMPTS wrong
    guesses. Success signs the user out of every other session."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_confirm"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        code = serializer.validated_data["code"]
        new_password = serializer.validated_data["new_password"]

        error_response = Response(
            {
                "error": "validation_error",
                "message": "Invalid request parameters.",
                "details": {"code": ["Invalid or expired code."]},
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return error_response

        reset_code = (
            user.password_reset_codes.filter(
                is_used=False,
                expires_at__gt=timezone.now(),
                attempts__lt=PasswordResetCode.MAX_ATTEMPTS,
            )
            .order_by("-created_at")
            .first()
        )
        if reset_code is None:
            return error_response

        if not check_password(code, reset_code.code_hash):
            PasswordResetCode.objects.filter(pk=reset_code.pk).update(attempts=F("attempts") + 1)
            return error_response

        with transaction.atomic():
            user.set_password(new_password)
            user.save(update_fields=["password"])
            user.password_reset_codes.filter(is_used=False).update(is_used=True)
            # Whoever might have had access before the reset loses it.
            revoke_all_refresh_tokens(user)

        return Response(
            {"message": "Password has been reset. You can now log in."},
            status=status.HTTP_200_OK,
        )


class CollegeListView(APIView):
    """GET /api/v1/colleges/ - any authenticated user. Colleges and the
    course codes in each, for the college filters (not paginated)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(college_list())


class UserListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/users/ - admin only. User Management screen.
         ?search= matches first/last name or email. ?role=student|admin.
         ?status=active|inactive. ?sort=desc for Z-A by name (default A-Z).
    POST /api/v1/users/ - admin only. Creates a student or admin account
         directly (unlike /auth/register/, the admin picks the role).
    """

    permission_classes = [IsAdmin]

    def get_queryset(self):
        if self.request.query_params.get("sort") == "desc":
            qs = User.objects.order_by("-first_name", "-last_name", "-user_id")
        else:
            qs = User.objects.order_by("first_name", "last_name", "user_id")
        search = self.request.query_params.get("search")
        role = self.request.query_params.get("role")
        status_param = self.request.query_params.get("status")

        if search:
            qs = qs.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
            )
        if role:
            qs = qs.filter(role=role)
        if status_param == "active":
            qs = qs.filter(is_active=True)
        elif status_param == "inactive":
            qs = qs.filter(is_active=False)
        return qs

    def get_serializer_class(self):
        return UserCreateSerializer if self.request.method == "POST" else UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        response_serializer = UserSerializer(user, context=self.get_serializer_context())
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/v1/users/{user_id}/ - admin only.
    PATCH  /api/v1/users/{user_id}/ - admin only. An admin can't deactivate
           or demote their own account (avoids self-lockout mid-session).
    DELETE /api/v1/users/{user_id}/ - admin only. An admin can't delete
           their own account.
    """

    queryset = User.objects.all()
    lookup_url_kwarg = "user_id"
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        return UserAdminUpdateSerializer if self.request.method == "PATCH" else UserSerializer

    def perform_update(self, serializer):
        target = self.get_object()
        if target.pk == self.request.user.pk:
            if serializer.validated_data.get("is_active") is False:
                raise PermissionDenied("You can't deactivate your own account.")
            new_role = serializer.validated_data.get("role")
            if new_role and new_role != User.Role.SUPERADMIN:
                raise PermissionDenied("You can't change your own role.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.pk == request.user.pk:
            raise PermissionDenied("You can't delete your own account.")
        # Their chats, tickets and announcements are kept: the links to the
        # account are cleared (shown as "Deleted student" on chats and
        # tickets), and each chat and ticket keeps the student's course, so
        # analytics and the college filters don't change.
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
