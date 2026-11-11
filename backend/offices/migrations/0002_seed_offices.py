from django.db import migrations

# The six specifically-named offices from the advisor's requirements.
# Colleges/academic departments are intentionally NOT seeded here - USTP's
# exact college list isn't something to guess at in a migration; Super
# Admin adds those for real through the Offices admin page.
SEED_OFFICE_NAMES = [
    "Office of Student Affairs (OSA)",
    "ASO",
    "Registrar",
    "ARCU",
    "Guidance & Counseling Services",
    "Health Services",
]


def seed_offices(apps, schema_editor):
    Office = apps.get_model("offices", "Office")
    for name in SEED_OFFICE_NAMES:
        Office.objects.get_or_create(name=name)


def remove_seeded_offices(apps, schema_editor):
    Office = apps.get_model("offices", "Office")
    Office.objects.filter(name__in=SEED_OFFICE_NAMES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("offices", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_offices, remove_seeded_offices),
    ]
