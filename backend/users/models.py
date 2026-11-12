from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from .managers import UserManager


class User(AbstractUser):
    """
    tbl_user - extends AbstractUser, keyed by email instead of username.

    Field set matches claude/API_CONTRACT.md exactly: user_id, email, first_name,
    last_name, role, course (nullable for admin), school_id (nullable for admin),
    created_at.
    """

    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        SUPERADMIN = "superadmin", "Super Admin"
        OFFICE_ADMIN = "office_admin", "Office Admin"

    # USTP CDO programs, from the official list Jefferson gave (Nov 2026).
    # A program with majors has one code per major. BSN isn't on that list
    # but was kept on request.
    class Course(models.TextChoices):
        # Information Technology / Computing
        BSIT = "BSIT", "BS Information Technology"
        BSCS = "BSCS", "BS Computer Science"
        BSDS = "BSDS", "BS Data Science"
        BTCM = "BTCM", "BS Technology Communication Management"
        # Engineering & Architecture
        BSARCH = "BSARCH", "BS Architecture"
        BSCE = "BSCE", "BS Civil Engineering"
        BSCPE = "BSCPE", "BS Computer Engineering"
        BSEE = "BSEE", "BS Electrical Engineering"
        BSECE = "BSECE", "BS Electronics Engineering"
        BSGE = "BSGE", "BS Geodetic Engineering"
        BSME = "BSME", "BS Mechanical Engineering"
        # Science & Mathematics
        BSAP = "BSAP", "BS Applied Physics"
        BSAMATH = "BSAMATH", "BS Applied Mathematics"
        BSCHEM = "BSCHEM", "BS Chemistry"
        BSES_EMT = "BSES-EMT", "BS Environmental Science - Environmental Management and Technology"
        BSES_NRM = "BSES-NRM", "BS Environmental Science - Natural Resource Management"
        BSFT = "BSFT", "BS Food Technology"
        # Technology
        BSAUTO = "BSAUTO", "BS Autotronics"
        BSELT_ES = "BSELT-ES", "BS Electronics Technology - Electronics Systems"
        BSELT_MST = "BSELT-MST", "BS Electronics Technology - Multimedia System Technology"
        BSELT_TN = "BSELT-TN", "BS Electronics Technology - Telecommunications & Networks"
        BSESM_EMCM = "BSESM-EMCM", "BS Energy Systems and Management - Electrical Machines Control & Maintenance"
        BSESM_PSDE = "BSESM-PSDE", "BS Energy Systems and Management - Power System Distribution with Eco-Design"
        BSEMT_MR = "BSEMT-MR", "BS Electro-Mechanical Technology - Mechatronics & Robotics"
        BSEMT_IA = "BSEMT-IA", "BS Electro-Mechanical Technology - Industrial Automation"
        BSMFG = "BSMFG", "BS Manufacturing Engineering Technology - Mechanical Design & Fabrication"
        BTOM = "BTOM", "Bachelor of Technology, Operations, and Management"
        # Education
        BTLED_HE = "BTLED-HE", "Bachelor in Technology and Livelihood Education - Home Economics"
        BTLED_IA = "BTLED-IA", "Bachelor in Technology and Livelihood Education - Industrial Arts"
        BTVTED_CSS = "BTVTED-CSS", "Bachelor in Technical-Vocational Teacher Education - Computer System Servicing"
        BTVTED_FG = "BTVTED-FG", "Bachelor in Technical-Vocational Teacher Education - Fashion and Garments"
        BTVTED_FSM = "BTVTED-FSM", "Bachelor in Technical-Vocational Teacher Education - Food Service Management"
        BSED_SCI = "BSED-SCI", "Bachelor of Secondary Education - Science"
        BSED_MATH = "BSED-MATH", "Bachelor of Secondary Education - Mathematics"
        # Other
        BSN = "BSN", "BS Nursing"
        # Retired: from the earlier list, replaced by the codes above. Still
        # valid so accounts that already have one keep working, but they
        # can't be picked for a new account (see RETIRED_COURSES).
        BTLED = "BTLED", "Bachelor in Technology and Livelihood Education"
        BTVTED = "BTVTED", "Bachelor in Technical-Vocational Teacher Education"
        BSED = "BSED", "BS Secondary Education"
        BEED = "BEED", "BS Elementary Education"
        BSELT = "BSELT", "BS Electronics Technology"
        BSESM = "BSESM", "BS Energy Systems and Management"
        BSEMT = "BSEMT", "BS Electro-Mechanical Technology"

    RETIRED_COURSES = frozenset({"BTLED", "BTVTED", "BSED", "BEED", "BSELT", "BSESM", "BSEMT"})

    username = None
    date_joined = None

    user_id = models.BigAutoField(primary_key=True)
    email = models.EmailField("email address", unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.STUDENT)
    course = models.CharField(
        max_length=10, choices=Course.choices, null=True, blank=True
    )
    school_id = models.CharField(max_length=20, unique=True, null=True, blank=True)
    profile_picture = models.ImageField(upload_to="profile_pictures/", null=True, blank=True)
    # Which office/college this account represents. Required for OFFICE_ADMIN
    # (enforced in serializers, not here, so students/superadmins can stay
    # null); every FAQ/Ticket queryset an Office Admin touches is scoped to
    # this office. PROTECT: deleting an office with staff would leave them with
    # office=None, and every office-scoped filter would then match all
    # *unassigned* rows instead of none.
    office = models.ForeignKey(
        "offices.Office", on_delete=models.PROTECT, null=True, blank=True,
        related_name="staff_members",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Defaults True so existing/admin-created accounts aren't retroactively
    # locked out - only RegisterSerializer's public self-registration flow
    # explicitly sets this False for new accounts, pending a verification click.
    is_email_verified = models.BooleanField(default=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    objects = UserManager()

    class Meta:
        db_table = "tbl_user"
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self):
        return f"{self.email} ({self.role})"


class PasswordResetCode(models.Model):
    """
    tbl_password_reset_code - short-lived 6-digit OTP emailed to a user for
    the mobile "Forgot Password" flow. code_hash is hashed the same way as
    User.password (django.contrib.auth.hashers) so the raw code is never
    stored at rest.
    """

    MAX_ATTEMPTS = 5

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_codes")
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    # Wrong guesses against this code; it's burned at MAX_ATTEMPTS so a
    # 6-digit code can't be brute-forced within its 10 minutes.
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "tbl_password_reset_code"

    def is_valid(self):
        return not self.is_used and self.expires_at > timezone.now()
