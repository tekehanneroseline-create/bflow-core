from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models import Q
from django.core.exceptions import ValidationError

from .company_utils import resolve_company_from_email


class Role(models.TextChoices):
    """Workplace roles scoped to a single company tenant."""
    
    ADMIN = 'admin', 'Admin'
    SALES_AGENT = 'sales_agent', 'Sales Agent'
    STOCK_KEEPER = 'stock_keeper', 'Stock Keeper'


# Maps legacy API role strings (pre multi-tenant migration) to the new values.
LEGACY_ROLE_MAP = {
    'ADMINISTRATOR': Role.ADMIN,
    'SALES_AGENT': Role.SALES_AGENT,
    'STOREKEEPER': Role.STOCK_KEEPER,
}


def normalize_role(value: str) -> str:
    """
    Accept both new and legacy role strings; return a canonical Role value.
    
    Args:
        value: Role string to normalize
        
    Returns:
        Canonical role value
        
    Raises:
        ValueError: If role is invalid
    """
    if value in LEGACY_ROLE_MAP:
        return LEGACY_ROLE_MAP[value]
    valid = {choice.value for choice in Role}
    if value in valid:
        return value
    raise ValueError(f'Role must be one of: {", ".join(sorted(valid))}.')


class Company(models.Model):
    """Corporate tenant — all employees, stock, and sales are isolated by company."""
    
    name = models.CharField(max_length=255)
    domain = models.CharField(
        max_length=255,
        unique=True,
        help_text="Corporate email domain used for automatic tenant matching (e.g. jcbookshop.com).",
        db_index=True,  # Add index for faster lookups
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True, help_text="Soft delete flag for company")
    
    class Meta:
        ordering = ['name']
        verbose_name_plural = 'companies'
        indexes = [
            models.Index(fields=['domain', 'is_active']),  # Composite index for common queries
        ]
    
    def __str__(self):
        return f'{self.name} ({self.domain})'
    
    def clean(self):
        """Validate that domain doesn't contain '@' symbol."""
        if '@' in self.domain:
            raise ValidationError({'domain': 'Domain should not contain the @ symbol.'})
    
    def save(self, *args, **kwargs):
        """Ensure domain is stored in lowercase."""
        self.domain = self.domain.lower().strip()
        self.full_clean()  # Run validation
        super().save(*args, **kwargs)


class BflowUserManager(BaseUserManager):
    """
    Custom user manager for BflowUser with multi-tenant support.
    """
    
    def create_user(self, email, given_name, password=None, role=Role.SALES_AGENT, 
                    company=None, **extra_fields):
        """
        Create a new user with automatic company assignment.
        
        Args:
            email: User's email address
            given_name: User's display name
            password: User's password (optional)
            role: User's role in the company
            company: Optional Company instance (will be auto-resolved if None)
            **extra_fields: Additional user fields
        
        Returns:
            BflowUser instance with associated EmployeeProfile
        """
        if not email:
            raise ValueError('Email is required.')
        if not given_name:
            raise ValueError('Given name is required.')

        email = self.normalize_email(email)
        role = normalize_role(role)

        # Create the user
        user = self.model(
            email=email,
            given_name=given_name.strip(),
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)

        # Resolve or assign company
        if company is None:
            company = resolve_company_from_email(email, Company=Company)
        
        if company is None:
            raise ValueError(f'Could not resolve company from email domain: {email.split("@")[1]}')
        
        # Create employee profile
        EmployeeProfile.objects.create(user=user, company=company, role=role)
        
        return user

    def create_superuser(self, email, given_name, password=None, **extra_fields):
        """
        Create a superuser with admin privileges across all tenants.
        """
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        # For superusers, we need to handle company assignment carefully
        # Usually superusers are not tied to a specific company
        return self.create_user(email, given_name, password, role=Role.ADMIN, **extra_fields)


class BflowUser(AbstractBaseUser, PermissionsMixin):
    """
    Authentication account for Bflow employees.
    
    Tenant membership and workplace role live on the linked EmployeeProfile
    (OneToOne), which mirrors the standard Django User + Profile pattern while
    keeping a custom auth model for email-based login.
    """
    
    given_name = models.CharField(max_length=150)  # Removed unique=True as multiple users could have the same name
    email = models.EmailField(unique=True, db_index=True)
    
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)  # Add missing field
    
    objects = BflowUserManager()
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['given_name']
    
    class Meta:
        verbose_name = 'Bflow user'
        verbose_name_plural = 'Bflow users'
        indexes = [
            models.Index(fields=['email', 'is_active']),
        ]
    
    def __str__(self):
        return f'{self.given_name} <{self.email}>'
    
    @property
    def role(self) -> str:
        """Workplace role from the employee profile (defaults to sales_agent)."""
        try:
            return self.employee_profile.role
        except EmployeeProfile.DoesNotExist:
            return Role.SALES_AGENT
    
    @property
    def company(self):
        """Company tenant for this employee, if a profile exists."""
        try:
            return self.employee_profile.company
        except EmployeeProfile.DoesNotExist:
            return None
    
    @property
    def has_employee_profile(self) -> bool:
        """Check if user has an associated employee profile."""
        return hasattr(self, 'employee_profile')
    
    def get_company(self):
        """Safe method to get company, returns None if no profile."""
        return self.company


class EmployeeProfile(models.Model):
    """
    Extended employee record linked to the auth user.
    
    Company assignment is derived automatically from the user's email domain
    on first save (see signals.py and company_utils.py).
    """
    
    user = models.OneToOneField(
        BflowUser,
        on_delete=models.CASCADE,
        related_name='employee_profile',
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        related_name='employees',
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'employee profile'
        verbose_name_plural = 'employee profiles'
        # Ensure each user has only one profile per company (enforced by OneToOne)
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'company'],
                name='unique_user_company_profile',
            ),
        ]
        indexes = [
            models.Index(fields=['company', 'role']),
        ]
    
    def __str__(self):
        return f'{self.user.given_name} — {self.company.name} ({self.get_role_display()})'
    
    def save(self, *args, **kwargs):
        """
        Auto-match company from email domain when not explicitly set.
        
        This ensures that even if a profile is created without a company,
        it gets assigned based on the user's email domain.
        """
        if self.user_id and not self.company_id:
            company = resolve_company_from_email(self.user.email, Company=Company)
            if company is None:
                raise ValidationError(f'Could not resolve company from email domain: {self.user.email.split("@")[1]}')
            self.company = company
        super().save(*args, **kwargs)
    
    def clean(self):
        """Validate that the user's email domain matches the company domain."""
        if self.user_id and self.company_id:
            user_domain = self.user.email.split('@')[1].lower()
            if user_domain != self.company.domain.lower():
                raise ValidationError({
                    'company': f'User\'s email domain ({user_domain}) does not match company domain ({self.company.domain}).'
                })
    
    def full_clean(self, exclude=None, validate_unique=True):
        """Run all model validation."""
        self.clean()
        super().full_clean(exclude, validate_unique)


class Book(models.Model):
    """Per-company inventory catalog. Stock changes are audited via StockAuditLog."""
    
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='books',
    )
    title = models.CharField(max_length=255)
    author = models.CharField(max_length=255, default='—')
    stock = models.PositiveIntegerField(default=0)
    price = models.PositiveIntegerField(help_text='Price in whole CFA')
    reorder_level = models.PositiveIntegerField(default=15)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        BflowUser,
        on_delete=models.PROTECT,
        related_name='books_created',
        null=True,
        blank=True,
        help_text='User who created this book entry.',
    )
    is_active = models.BooleanField(default=True, help_text="Soft delete for books")
    
    class Meta:
        ordering = ['title']
        constraints = [
            models.UniqueConstraint(
                fields=['company', 'title'],
                name='unique_book_title_per_company',
            ),
        ]
        indexes = [
            models.Index(fields=['company', 'is_active']),
            models.Index(fields=['company', 'stock']),
        ]
    
    def __str__(self):
        return f'{self.title} ({self.company.domain})'
    
    def update_stock(self, new_quantity: int, modified_by: BflowUser, note: str = '') -> 'StockAuditLog':
        """
        Set stock to new_quantity and record which stock keeper performed the change.
        
        Prefer this method over assigning book.stock directly so every adjustment
        is captured in the audit trail.
        
        Args:
            new_quantity: New stock quantity
            modified_by: User performing the update
            note: Optional note about the change
        
        Returns:
            The created StockAuditLog instance
        
        Raises:
            ValidationError: If the user doesn't have permission or quantity is invalid
        """
        # Validate that user has permission to modify stock
        if modified_by.role not in [Role.ADMIN, Role.STOCK_KEEPER]:
            raise ValidationError('Only admins and stock keepers can modify stock.')
        
        # Ensure modified_by belongs to the same company
        if modified_by.company != self.company:
            raise ValidationError('User does not belong to this company.')
        
        # Validate quantity
        if new_quantity < 0:
            raise ValidationError('Stock quantity cannot be negative.')
        
        previous = self.stock
        self.stock = new_quantity
        self.save()
        
        # Create audit log
        audit_log = StockAuditLog.objects.create(
            book=self,
            company=self.company,
            modified_by=modified_by,
            previous_quantity=previous,
            new_quantity=new_quantity,
            delta=new_quantity - previous,
            note=note,
        )
        return audit_log
    
    def save(self, *args, **kwargs):
        """Override save to ensure company and other constraints."""
        self.full_clean()
        super().save(*args, **kwargs)


class StockAuditLog(models.Model):
    """Audit trail of inventory quantity changes performed by stock keepers."""
    
    book = models.ForeignKey(
        Book,
        on_delete=models.CASCADE,
        related_name='stock_audit_logs',
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='stock_audit_logs',
    )
    modified_by = models.ForeignKey(
        BflowUser,
        on_delete=models.PROTECT,
        related_name='stock_audit_logs',
        help_text='Stock keeper who modified the quantity.',
    )
    previous_quantity = models.PositiveIntegerField()
    new_quantity = models.PositiveIntegerField()
    delta = models.IntegerField(help_text='Signed change (new − previous).')
    note = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['company', 'created_at']),
            models.Index(fields=['book', 'created_at']),
            models.Index(fields=['modified_by', 'created_at']),
        ]
    
    def __str__(self):
        return (
            f'{self.book.title}: {self.previous_quantity} → {self.new_quantity} '
            f'by {self.modified_by.given_name}'
        )
    
    def save(self, *args, **kwargs):
        """Ensure company matches the book's company."""
        if self.book_id and not self.company_id:
            self.company = self.book.company
        super().save(*args, **kwargs)


class SaleTransaction(models.Model):
    """Sales record scoped to a company and attributed to the processing sales agent."""
    
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='sales',
    )
    processed_by = models.ForeignKey(
        BflowUser,
        on_delete=models.PROTECT,
        related_name='sales',
        help_text='Sales agent who created this transaction.',
    )
    date = models.DateField()
    items = models.PositiveIntegerField(help_text='Total units sold in this transaction')
    total = models.PositiveIntegerField(help_text='Transaction total in whole CFA')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True, help_text="Soft delete for transactions")
    receipt_number = models.CharField(max_length=50, null=True, blank=True, help_text="Optional receipt reference")
    notes = models.TextField(blank=True, help_text="Additional notes about the sale")
    
    class Meta:
        ordering = ['-date', '-id']
        indexes = [
            models.Index(fields=['company', 'date']),
            models.Index(fields=['processed_by', 'date']),
            models.Index(fields=['company', 'created_at']),
        ]
    
    def __str__(self):
        return f'{self.date} — {self.processed_by.given_name} — {self.total} CFA ({self.company.domain})'
    
    def save(self, *args, **kwargs):
        """
        Default company from the sales agent's profile when not supplied.
        Also validate that the user belongs to the company.
        """
        # Auto-assign company if missing
        if self.processed_by_id and not self.company_id:
            company = self.processed_by.company
            if company is not None:
                self.company = company
            else:
                raise ValidationError('Could not determine company from sales agent.')
        
        # Validate that processed_by belongs to the company
        if self.processed_by_id and self.company_id:
            if self.processed_by.company != self.company:
                raise ValidationError('Sales agent does not belong to this company.')
        
        # Ensure total is positive
        if self.total < 0:
            raise ValidationError('Transaction total cannot be negative.')
        
        # Ensure items is positive
        if self.items < 1:
            raise ValidationError('Transaction must have at least 1 item.')
        
        super().save(*args, **kwargs)
    
    def clean(self):
        """Additional validation for the sale transaction."""
        if self.processed_by_id and self.processed_by.role not in [Role.ADMIN, Role.SALES_AGENT]:
            raise ValidationError('Only admins and sales agents can process sales.')


# Add a model for tracking sales items if needed
class SaleItem(models.Model):
    """Individual items in a sale transaction."""
    
    sale_transaction = models.ForeignKey(
        SaleTransaction,
        on_delete=models.CASCADE,
        related_name='sale_items',
    )
    book = models.ForeignKey(
        Book,
        on_delete=models.PROTECT,
        related_name='sale_items',
    )
    quantity = models.PositiveIntegerField()
    unit_price = models.PositiveIntegerField(help_text='Price at time of sale in whole CFA')
    total_price = models.PositiveIntegerField(help_text='Quantity × Unit Price')
    
    class Meta:
        ordering = ['id']
        indexes = [
            models.Index(fields=['sale_transaction', 'book']),
        ]
    
    def __str__(self):
        return f'{self.quantity} × {self.book.title} = {self.total_price} CFA'
    
    def save(self, *args, **kwargs):
        """Calculate total price before saving."""
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)
    
    def clean(self):
        """Validate that the book belongs to the same company as the transaction."""
        if self.sale_transaction_id and self.book_id:
            if self.book.company != self.sale_transaction.company:
                raise ValidationError('Book does not belong to the transaction\'s company.')