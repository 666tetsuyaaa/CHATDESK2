from io import BytesIO

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from PIL import Image, ImageOps
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken

from offices.models import Office

from .models import User
from .services import send_verification_email
from .validators import validate_person_name, validate_school_id

PROFILE_PICTURE_MAX_BYTES = 2 * 1024 * 1024
PROFILE_PICTURE_MAX_SIDE = 512


class PersonNameMixin:
    """first_name/last_name must contain letters - not blank, digits or symbols."""

    def validate_first_name(self, value):
        return validate_person_name(value)

    def validate_last_name(self, value):
        return validate_person_name(value)


def _check_password_rules(attrs, password_field="password"):
    """Full Django password rules (common, all-numeric, too similar to the
    name/email), as a field error on `password_field`."""
    candidate = User(
        email=attrs.get("email", ""),
        first_name=attrs.get("first_name", ""),
        last_name=attrs.get("last_name", ""),
    )
    try:
        validate_password(attrs[password_field], user=candidate)
    except DjangoValidationError as error:
        raise serializers.ValidationError({password_field: list(error.messages)})


class UserSerializer(serializers.ModelSerializer):
    """Read-only user profile shape, per claude/API_CONTRACT.md. is_active and
    last_login are included for the admin User Management screen; last_login
    is stamped via update_last_login() below on every successful JWT login.
    office/office_name are only meaningful for role=office_admin."""

    office_name = serializers.CharField(source="office.name", read_only=True, default=None)

    class Meta:
        model = User
        fields = [
            "user_id",
            "email",
            "first_name",
            "last_name",
            "role",
            "course",
            "school_id",
            "profile_picture",
            "office",
            "office_name",
            "is_active",
            "is_email_verified",
            "last_login",
            "created_at",
        ]
        read_only_fields = fields


def _tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class RegisterSerializer(PersonNameMixin, serializers.ModelSerializer):
    """
    POST /api/v1/auth/register/ - public, student accounts only.
    Admin accounts are created manually via `manage.py createsuperuser`.
    """

    password = serializers.CharField(write_only=True, min_length=8)
    course = serializers.ChoiceField(choices=User.Course.choices)
    school_id = serializers.CharField(max_length=20)

    class Meta:
        model = User
        fields = ["email", "password", "first_name", "last_name", "course", "school_id"]

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        allowed = settings.ALLOWED_EMAIL_DOMAINS
        if allowed and value.rsplit("@", 1)[-1] not in allowed:
            raise serializers.ValidationError(
                f"Please register with your school email ({', '.join('@' + d for d in allowed)})."
            )
        return value

    def validate_school_id(self, value):
        value = validate_school_id(value)
        if User.objects.filter(school_id__iexact=value).exists():
            raise serializers.ValidationError("An account with this School ID already exists.")
        return value

    def validate(self, attrs):
        # Same rules password reset already enforces (common, all-numeric,
        # too similar to the name/email) - not just the 8-character minimum.
        _check_password_rules(attrs)
        return attrs

    def create(self, validated_data):
        validated_data["role"] = User.Role.STUDENT
        validated_data["is_email_verified"] = False
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()

        # Raises EmailDeliveryError if Gmail fails - RegisterView runs this in
        # a transaction so the account is rolled back rather than left
        # half-created. Returns the link only in the DEBUG no-email fallback.
        user._dev_verify_url = send_verification_email(user, self.context.get("request"))
        return user

    def to_representation(self, instance):
        data = {
            "user": UserSerializer(instance, context=self.context).data,
            **_tokens_for_user(instance),
        }
        dev_verify_url = getattr(instance, "_dev_verify_url", None)
        if dev_verify_url:
            data["dev_verify_url"] = dev_verify_url
        return data


class LoginSerializer(serializers.Serializer):
    """POST /api/v1/auth/login/ - public. Same response shape as register."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs["email"].lower().strip()
        user = authenticate(
            request=self.context.get("request"),
            username=email,
            password=attrs["password"],
        )
        if user is None:
            # Django's ModelBackend already refuses to authenticate an
            # inactive user (returns None before we'd ever see it), so the
            # only way to tell "wrong credentials" apart from "correct
            # credentials but deactivated" is to re-check the password by
            # hand here - looking up by email alone would let someone probe
            # whether an account is deactivated without knowing its password.
            existing = User.objects.filter(email__iexact=email).first()
            if existing and existing.check_password(attrs["password"]) and not existing.is_active:
                raise serializers.ValidationError("This account has been deactivated.")
            raise serializers.ValidationError("Invalid email or password.")
        if (
            settings.REQUIRE_EMAIL_VERIFICATION
            and user.role == User.Role.STUDENT
            and not user.is_email_verified
        ):
            raise serializers.ValidationError(
                "Please verify your email address first - check your inbox for the link, "
                "or request a new one."
            )
        update_last_login(None, user)
        attrs["user"] = user
        return attrs

    def to_representation(self, instance):
        user = instance["user"]
        return {
            "user": UserSerializer(user, context=self.context).data,
            **_tokens_for_user(user),
        }


class PasswordResetRequestSerializer(serializers.Serializer):
    """POST /api/v1/auth/password-reset/request/ - public."""

    email = serializers.EmailField()

    def validate_email(self, value):
        return value.lower().strip()


class VerificationResendSerializer(serializers.Serializer):
    """POST /api/v1/auth/verify-email/resend/ - public."""

    email = serializers.EmailField()

    def validate_email(self, value):
        return value.lower().strip()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """POST /api/v1/auth/password-reset/confirm/ - public."""

    email = serializers.EmailField()
    code = serializers.CharField(max_length=6, min_length=6)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        return value.lower().strip()

    def validate_new_password(self, value):
        validate_password(value)
        return value


class UserSelfUpdateSerializer(PersonNameMixin, serializers.ModelSerializer):
    """PATCH /api/v1/auth/me/ - any authenticated user editing their own
    profile. Deliberately narrow: first_name/last_name/profile_picture are
    editable here. role, email, is_active, and school_id all stay
    untouchable via this endpoint - see UserAdminUpdateSerializer for the
    admin-only, wider version of this same shape."""

    class Meta:
        model = User
        fields = ["first_name", "last_name", "profile_picture"]

    def validate_profile_picture(self, image):
        if image is None:
            return image
        if image.size > PROFILE_PICTURE_MAX_BYTES:
            raise serializers.ValidationError("Profile picture must be 2 MB or smaller.")
        # Avatars render at ~30-100px - storing a phone camera's full-size
        # photo just makes every avatar load slow.
        picture = Image.open(image)
        picture = ImageOps.exif_transpose(picture).convert("RGB")
        picture.thumbnail((PROFILE_PICTURE_MAX_SIDE, PROFILE_PICTURE_MAX_SIDE))
        buffer = BytesIO()
        picture.save(buffer, format="JPEG", quality=85)
        base_name = (image.name or "avatar").rsplit(".", 1)[0]
        return ContentFile(buffer.getvalue(), name=f"{base_name}.jpg")


class UserAdminUpdateSerializer(PersonNameMixin, serializers.ModelSerializer):
    """PATCH /api/v1/users/{id}/ - admin only. Role/status/profile edits;
    email and password are out of scope here (see users/views.py for the
    self-protection guards against locking the acting admin out)."""

    office = serializers.PrimaryKeyRelatedField(
        queryset=Office.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = User
        fields = ["first_name", "last_name", "role", "course", "school_id", "is_active", "office"]

    def validate_school_id(self, value):
        if not value:
            return None
        value = validate_school_id(value)
        taken = User.objects.filter(school_id__iexact=value).exclude(pk=self.instance.pk if self.instance else None)
        if taken.exists():
            raise serializers.ValidationError("An account with this School ID already exists.")
        return value

    def validate(self, attrs):
        role = attrs.get("role", self.instance.role if self.instance else User.Role.STUDENT)
        if role == User.Role.OFFICE_ADMIN:
            office = attrs.get("office", self.instance.office if self.instance else None)
            if not office:
                raise serializers.ValidationError(
                    {"office": "An office must be assigned for the Office Admin role."}
                )
        else:
            # Only Office Admins belong to an office - a student or Super
            # Admin never keeps one (whether or not the role changed here).
            attrs["office"] = None
        return attrs

    def update(self, instance, validated_data):
        if "role" in validated_data:
            # Django's own /admin panel goes by is_staff/is_superuser, not by
            # role. Keep them in step so a demoted Super Admin loses /admin
            # access, and a promoted one gets the same access as one created
            # directly (UserCreateSerializer).
            is_superadmin = validated_data["role"] == User.Role.SUPERADMIN
            validated_data["is_staff"] = is_superadmin
            validated_data["is_superuser"] = is_superadmin
        return super().update(instance, validated_data)


class UserCreateSerializer(PersonNameMixin, serializers.ModelSerializer):
    """POST /api/v1/users/ - admin only. Unlike self-registration, the admin
    picks the role directly (student, office_admin, or superadmin)."""

    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.STUDENT)
    office = serializers.PrimaryKeyRelatedField(
        queryset=Office.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = User
        fields = ["email", "password", "first_name", "last_name", "role", "course", "school_id", "office"]

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_school_id(self, value):
        if not value:
            return None
        value = validate_school_id(value)
        if User.objects.filter(school_id__iexact=value).exists():
            raise serializers.ValidationError("An account with this School ID already exists.")
        return value

    def validate(self, attrs):
        _check_password_rules(attrs)
        if attrs.get("role") == User.Role.OFFICE_ADMIN and not attrs.get("office"):
            raise serializers.ValidationError(
                {"office": "An office must be assigned for the Office Admin role."}
            )
        if attrs.get("role") != User.Role.OFFICE_ADMIN:
            attrs["office"] = None
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        if validated_data.get("role") == User.Role.SUPERADMIN:
            validated_data["is_staff"] = True
            validated_data["is_superuser"] = True
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class ActiveUserTokenRefreshSerializer(TokenRefreshSerializer):
    """POST /api/v1/auth/token/refresh/ - the library's refresh, plus a check
    that the account is still active. Without it a deactivated user kept
    getting fresh tokens that every other endpoint then refused, so the apps
    showed errors instead of logging them out."""

    def validate(self, attrs):
        user_id = RefreshToken(attrs["refresh"]).payload.get(jwt_settings.USER_ID_CLAIM)
        if not User.objects.filter(user_id=user_id, is_active=True).exists():
            raise AuthenticationFailed("This account has been deactivated.", code="user_inactive")
        return super().validate(attrs)
