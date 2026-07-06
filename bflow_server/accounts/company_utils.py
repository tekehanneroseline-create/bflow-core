# company_utils.py
from django.core.exceptions import ValidationError


def resolve_company_from_email(email, Company=None):
    """
    Resolve a company from the email domain.
    
    Args:
        email: User's email address (e.g., 'agent@jcbookshop.com')
        Company: The Company model class (for lazy import)
    
    Returns:
        Company instance if found, None otherwise
    """
    if Company is None:
        from .models import Company
    
    try:
        domain = email.split('@')[1].lower()
    except IndexError:
        raise ValidationError('Invalid email format.')
    
    try:
        company = Company.objects.get(domain=domain, is_active=True)
        return company
    except Company.DoesNotExist:
        # Optionally create the company if it doesn't exist
        # Uncomment the following lines if you want auto-creation
        # company = Company.objects.create(
        #     name=domain.split('.')[0].capitalize(),
        #     domain=domain,
        # )
        # return company
        return None