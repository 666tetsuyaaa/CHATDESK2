import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import EmailVerificationToken

logger = logging.getLogger(__name__)

EMAIL_VERIFICATION_TOKEN_LIFETIME = timedelta(hours=24)


class EmailDeliveryError(Exception):
    """Sending through Gmail failed (revoked App Password, rate limit,
    network). Callers roll back whatever the email was for."""


def deliver_email(subject, message, recipient):
    """Sends via SMTP when real email is configured. Returns False when it
    isn't (nothing sent - the caller decides whether a DEBUG fallback
    applies); raises EmailDeliveryError if a real send fails."""
    if not settings.REAL_EMAIL_ENABLED:
        if not settings.EMAIL_DEV_FALLBACK:
            logger.warning("Email to %s not sent: no EMAIL_HOST_PASSWORD configured.", recipient)
        return False
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
        )
    except Exception as error:
        logger.exception("Email to %s failed to send.", recipient)
        raise EmailDeliveryError(str(error)) from error
    return True


def public_url(request, path):
    if settings.PUBLIC_BASE_URL:
        return settings.PUBLIC_BASE_URL + path
    return request.build_absolute_uri(path) if request else path


def send_verification_email(user, request):
    """
    Creates a fresh EmailVerificationToken for `user` (invalidating older
    ones) and emails the link. Returns the raw link only when
    EMAIL_DEV_FALLBACK applies (DEBUG without real email) so it can be shown
    in the API response for testing; otherwise None. Raises
    EmailDeliveryError if the real send fails.
    """
    user.email_verification_tokens.filter(is_used=False).update(is_used=True)
    raw_token = secrets.token_urlsafe(32)
    EmailVerificationToken.objects.create(
        user=user,
        token_hash=make_password(raw_token),
        expires_at=timezone.now() + EMAIL_VERIFICATION_TOKEN_LIFETIME,
    )
    verify_url = public_url(request, f"/api/v1/auth/verify-email/{user.user_id}/{raw_token}/")

    sent = deliver_email(
        subject="Verify your ChatDesk email address",
        message=(
            f"Hi {user.first_name},\n\n"
            "Thanks for registering for ChatDesk. Please verify your email "
            f"address by clicking the link below:\n\n{verify_url}\n\n"
            "This link expires in 24 hours. If you didn't create this "
            "account, you can ignore this email."
        ),
        recipient=user.email,
    )
    if not sent and settings.EMAIL_DEV_FALLBACK:
        return verify_url
    return None


def send_password_reset_email(user, raw_code):
    """Same return/raise contract as send_verification_email."""
    sent = deliver_email(
        subject="ChatDesk password reset code",
        message=(
            f"Your ChatDesk password reset code is {raw_code}.\n\n"
            "This code expires in 10 minutes. If you didn't request this, "
            "you can ignore this email."
        ),
        recipient=user.email,
    )
    if not sent and settings.EMAIL_DEV_FALLBACK:
        return raw_code
    return None


def revoke_all_refresh_tokens(user):
    """Signs the user out everywhere: every refresh token they hold stops
    working. Access tokens already issued still live out their 15 minutes."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)
