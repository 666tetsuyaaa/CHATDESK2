from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("offices", "0004_fill_office_codes"),
    ]

    operations = [
        migrations.AlterField(
            model_name="office",
            name="code",
            field=models.CharField(max_length=10, unique=True),
        ),
    ]
