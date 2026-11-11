from django.db import migrations

from offices.codes import suggest_code, unique_code


def fill_codes(apps, schema_editor):
    Office = apps.get_model("offices", "Office")
    taken = set()
    for office in Office.objects.order_by("office_id"):
        office.code = unique_code(suggest_code(office.name), taken)
        taken.add(office.code)
        office.save(update_fields=["code"])


class Migration(migrations.Migration):

    dependencies = [
        ("offices", "0003_office_code"),
    ]

    operations = [
        migrations.RunPython(fill_codes, migrations.RunPython.noop),
    ]
