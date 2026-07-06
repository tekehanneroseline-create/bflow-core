# apps.py
from django.apps import AppConfig


class YourAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'  # Replace with your app name
    
    def ready(self):
        import accounts.signals  # Import signals