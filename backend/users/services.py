import logging

from django.conf import settings
from django.core.mail import send_mail
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    """Sending through Gmail failed (revoked App Password, rate limit,
    network)."""


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


def send_welcome_email(user):
    """Thanks a student for registering. Best effort: a failed send is logged
    and ignored - the account is already created and works without it."""
    try:
        deliver_email(
            subject="Welcome to ChatDesk",
            message=(
                f"Hi {user.first_name},\n\n"
                "Thank you for registering on ChatDesk! You can now log in and ask "
                "your questions about USTP's Office of Student Affairs services.\n\n"
                "- The ChatDesk team"
            ),
            recipient=user.email,
        )
    except EmailDeliveryError:
        pass  # already logged by deliver_email


def send_password_reset_email(user, raw_code):
    """Sends the code. Returns the code itself only when EMAIL_DEV_FALLBACK
    applies (DEBUG without real email), so it can be shown in the API
    response for testing; otherwise None. Raises EmailDeliveryError if the
    real send fails."""
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
