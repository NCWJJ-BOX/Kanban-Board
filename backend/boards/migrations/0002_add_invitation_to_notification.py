"""Add invitation field to Notification model and update views/serializers."""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('boards', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='invitation',
            field=models.ForeignKey(
                to='boards.Invitation',
                on_delete=django.db.models.deletion.CASCADE,
                null=True,
                blank=True,
                related_name='notifications',
            ),
        ),
    ]
