"""
Groups the User.Course codes into colleges, so admin filters and analytics
can narrow inquiries and tickets by college. The single source of truth -
the web dashboard reads it from GET /api/v1/colleges/. Groupings follow the
headings already used in User.Course; rename freely, but every course must
stay in exactly one group (users/tests.py checks this).
"""

from .models import User

# Shown in place of a student's name on chats and tickets kept after their
# account was deleted.
DELETED_STUDENT = "Deleted student"

COLLEGES = [
    {
        "key": "it_computing",
        "name": "Information Technology & Computing",
        "courses": ["BSIT", "BSCS", "BSDS", "BTCM"],
    },
    {
        "key": "engineering",
        "name": "Engineering & Architecture",
        "courses": ["BSARCH", "BSCE", "BSCPE", "BSEE", "BSECE", "BSGE", "BSME"],
    },
    {
        "key": "science_math",
        "name": "Science & Mathematics",
        "courses": ["BSAP", "BSAMATH", "BSCHEM", "BSES-EMT", "BSES-NRM", "BSFT"],
    },
    {
        "key": "technology",
        "name": "Technology",
        "courses": [
            "BSAUTO", "BSELT-ES", "BSELT-MST", "BSELT-TN", "BSESM-EMCM", "BSESM-PSDE",
            "BSEMT-MR", "BSEMT-IA", "BSMFG", "BTOM",
            "BSELT", "BSESM", "BSEMT",  # retired
        ],
    },
    {
        "key": "education",
        "name": "Education",
        "courses": [
            "BTLED-HE", "BTLED-IA", "BTVTED-CSS", "BTVTED-FG", "BTVTED-FSM", "BSED-SCI", "BSED-MATH",
            "BTLED", "BTVTED", "BSED", "BEED",  # retired
        ],
    },
    {
        "key": "other",
        "name": "Other Programs",
        "courses": ["BSN"],
    },
]

_COLLEGE_BY_COURSE = {course: college for college in COLLEGES for course in college["courses"]}
_COLLEGE_BY_KEY = {college["key"]: college for college in COLLEGES}


def college_for_course(course):
    """The college dict a course belongs to, or None (admins have no course)."""
    return _COLLEGE_BY_COURSE.get(course)


def courses_for_college(key):
    """Course codes in a college, or None if the key is unknown."""
    college = _COLLEGE_BY_KEY.get(key)
    return college["courses"] if college else None


def filter_by_college(queryset, key, course_field="student_course"):
    """Narrows inquiry logs or tickets to those whose student is in the given
    college - by the course saved on each row, so rows from deleted accounts
    still count. An unknown key matches nothing rather than silently ignoring
    the filter."""
    if not key:
        return queryset
    courses = courses_for_college(key)
    if courses is None:
        return queryset.none()
    return queryset.filter(**{f"{course_field}__in": courses})


def college_list():
    labels = dict(User.Course.choices)
    return [
        {
            "key": college["key"],
            "name": college["name"],
            # Retired courses are still listed (marked) so the dashboard can show
            # an existing account's course; it doesn't offer them for new ones.
            "courses": [
                {"code": code, "name": labels.get(code, code), **({"retired": True} if code in User.RETIRED_COURSES else {})}
                for code in college["courses"]
            ],
        }
        for college in COLLEGES
    ]
