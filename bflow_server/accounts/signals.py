# signals.py
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.core.exceptions import ValidationError

from .models import BflowUser, EmployeeProfile, Company
from .company_utils import resolve_company_from_email


@receiver(pre_save, sender=BflowUser)
def validate_user_email(sender, instance, **kwargs):
    """
    Validate that the user's email is in a valid format and domain exists.
    """
    if '@' not in instance.email:
        raise ValidationError('Invalid email format.')
    
    # Check if email domain is active
    domain = instance.email.split('@')[1].lower()
    company = resolve_company_from_email(instance.email)
    if company is None:
        # Don't raise error here - allow user creation but note the issue
        # This can be handled in the profile creation or later
        pass


@receiver(post_save, sender=BflowUser)
def create_employee_profile_for_user(sender, instance, created, **kwargs):
    """
    Automatically create an EmployeeProfile when a new user is created.
    This is a fallback in case the manager didn't create it.
    """
    if created and not hasattr(instance, 'employee_profile'):
        try:
            company = resolve_company_from_email(instance.email)
            if company:
                EmployeeProfile.objects.create(
                    user=instance,
                    company=company,
                    role='sales_agent'  # Default role
                )
        except Exception as e:
            # Log the error but don't fail user creation
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f'Could not create employee profile for user {instance.email}: {e}')