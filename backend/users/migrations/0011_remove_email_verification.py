# Email verification removed (Nov 2026): students get a welcome email
# instead of a link to click. Accounts that never clicked their link are
# marked verified, and the table that held the links is dropped.

from django.db import migrations


def mark_everyone_verified(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(is_email_verified=False).update(is_email_verified=True)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0010_update_course_list'),
    ]

    operations = [
        # Going back leaves everyone verified - there's no record of who wasn't.
        migrations.RunPython(mark_everyone_verified, migrations.RunPython.noop),
        migrations.DeleteModel(
            name='EmailVerificationToken',
        ),
    ]
