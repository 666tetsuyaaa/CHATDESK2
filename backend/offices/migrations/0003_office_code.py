from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("offices", "0002_seed_offices"),
    ]

    operations = [
        migrations.AddField(
            model_name="office",
            name="code",
            field=models.CharField(max_length=10, null=True),
        ),
    ]
