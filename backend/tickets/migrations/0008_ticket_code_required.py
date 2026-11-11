from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tickets", "0007_fill_ticket_codes"),
    ]

    operations = [
        migrations.AlterField(
            model_name="ticket",
            name="ticket_code",
            field=models.CharField(editable=False, max_length=24, unique=True),
        ),
    ]
