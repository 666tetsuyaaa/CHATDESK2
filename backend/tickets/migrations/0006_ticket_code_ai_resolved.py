from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tickets", "0005_ticket_conversation_context"),
        ("offices", "0005_office_code_required"),
    ]

    operations = [
        migrations.CreateModel(
            name="TicketSequence",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("prefix", models.CharField(max_length=20, unique=True)),
                ("last_number", models.PositiveIntegerField(default=0)),
            ],
            options={"db_table": "tbl_ticket_sequence"},
        ),
        migrations.AddField(
            model_name="ticket",
            name="ticket_code",
            field=models.CharField(editable=False, max_length=24, null=True),
        ),
        migrations.AddField(
            model_name="ticket",
            name="is_ai_resolved",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="ticket",
            name="reopened_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
