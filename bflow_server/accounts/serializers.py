from django.contrib.auth import password_validation
from rest_framework import serializers

from .models import BflowUser, Role, normalize_role


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)
    role = serializers.CharField(write_only=True)

    class Meta:
        model = BflowUser
        fields = ('given_name', 'email', 'password', 'role')
        extra_kwargs = {
            'email': {'validators': []},
            'given_name': {'validators': []},
        }

    def validate_given_name(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError('Given name cannot be empty.')
        if BflowUser.objects.filter(given_name__iexact=cleaned).exists():
            raise serializers.ValidationError(
                'An account with this given name already exists.'
            )
        return cleaned

    def validate_email(self, value):
        cleaned = value.strip().lower()
        if BflowUser.objects.filter(email__iexact=cleaned).exists():
            raise serializers.ValidationError(
                'An account with this email already exists.'
            )
        return cleaned

    def validate_role(self, value):
        try:
            return normalize_role(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')
        role = validated_data.pop('role', Role.SALES_AGENT)
        user = BflowUser(**validated_data)
        user._pending_role = role
        user.set_password(password)
        user.save()
        return user


class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_email(self, value):
        return value.strip().lower()
