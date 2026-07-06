from datetime import timedelta

from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Book, BflowUser, Role, SaleTransaction
from .serializers import UserLoginSerializer, UserRegistrationSerializer

DEMO_BOOKS = [
    {'title': 'Advanced Mathematics', 'author': 'Prof. Algebra', 'stock': 42, 'price': 12500, 'reorder_level': 20},
    {'title': 'English Literature', 'author': 'Jane Austen', 'stock': 18, 'price': 8900, 'reorder_level': 15},
    {'title': 'French Grammar', 'author': 'Marie Dubois', 'stock': 8, 'price': 7600, 'reorder_level': 12},
]

DEMO_AGENTS = [
    {'given_name': 'Rosaline', 'email': 'rosaline.demo@bflow.com', 'password': 'DemoPass123!'},
    {'given_name': 'Denzil', 'email': 'denzil.demo@bflow.com', 'password': 'DemoPass123!'},
    {'given_name': 'Amina', 'email': 'amina.demo@bflow.com', 'password': 'DemoPass123!'},
]

DEMO_TRANSACTIONS = [
    {'agent_email': 'rosaline.demo@bflow.com', 'date_offset': 0, 'items': 3, 'total': 29800},
    {'agent_email': 'denzil.demo@bflow.com', 'date_offset': 1, 'items': 2, 'total': 16500},
    {'agent_email': 'amina.demo@bflow.com', 'date_offset': 2, 'items': 4, 'total': 35200},
    {'agent_email': 'rosaline.demo@bflow.com', 'date_offset': 3, 'items': 1, 'total': 8900},
    {'agent_email': 'denzil.demo@bflow.com', 'date_offset': 5, 'items': 5, 'total': 42100},
]


def build_user_payload(user):
    return {
        'uid': user.id,
        'givenName': user.given_name,
        'email': user.email,
        'role': user.role,
    }


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        return Response(build_user_payload(user), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserLoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']
        password = serializer.validated_data['password']

        user = authenticate(request, username=email, password=password)
        if user is None:
            return Response(
                {'detail': 'Invalid email or password'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(build_user_payload(user), status=status.HTTP_200_OK)


def _seed_demo_books():
    for book_data in DEMO_BOOKS:
        Book.objects.get_or_create(
            title=book_data['title'],
            defaults={
                'author': book_data['author'],
                'stock': book_data['stock'],
                'price': book_data['price'],
                'reorder_level': book_data['reorder_level'],
            },
        )


def _seed_demo_agents():
    agents = {}

    for agent_data in DEMO_AGENTS:
        user = BflowUser.objects.filter(email=agent_data['email']).first()
        if user is None:
            user = BflowUser.objects.filter(given_name__iexact=agent_data['given_name']).first()

        if user is None:
            user = BflowUser.objects.create_user(
                email=agent_data['email'],
                given_name=agent_data['given_name'],
                password=agent_data['password'],
                role=Role.SALES_AGENT,
            )
        elif not user.has_usable_password():
            user.set_password(agent_data['password'])
            user.save(update_fields=['password'])

        agents[agent_data['email']] = user

    for user in BflowUser.objects.filter(role=Role.SALES_AGENT):
        agents.setdefault(user.email, user)

    return agents


def _seed_demo_transactions():
    if SaleTransaction.objects.exists():
        return

    agents = _seed_demo_agents()
    agents_list = list(BflowUser.objects.filter(role=Role.SALES_AGENT))
    if not agents_list:
        return

    today = timezone.localdate()

    for index, txn_data in enumerate(DEMO_TRANSACTIONS):
        agent = agents.get(txn_data['agent_email']) or agents_list[index % len(agents_list)]
        sale_date = today - timedelta(days=txn_data['date_offset'])
        SaleTransaction.objects.create(
            processed_by=agent,
            date=sale_date,
            items=txn_data['items'],
            total=txn_data['total'],
        )


class SeedDemoDataView(APIView):
    """Temporary beta endpoint — remove before production launch."""

    permission_classes = [AllowAny]

    def post(self, request):
        _seed_demo_books()
        _seed_demo_agents()
        _seed_demo_transactions()

        return Response(
            {
                'status': 'success',
                'message': 'Demo data successfully loaded into the database.',
            },
            status=status.HTTP_200_OK,
        )


class BookListView(APIView):
    """Temporary beta read endpoint for mobile sync."""

    permission_classes = [AllowAny]

    def get(self, request):
        books = Book.objects.all()
        payload = [
            {
                'id': book.id,
                'title': book.title,
                'author': book.author,
                'stock': book.stock,
                'price': book.price,
                'reorderLevel': book.reorder_level,
            }
            for book in books
        ]
        return Response(payload, status=status.HTTP_200_OK)


class SaleListView(APIView):
    """Temporary beta read endpoint for mobile sync."""

    permission_classes = [AllowAny]

    def get(self, request):
        sales = SaleTransaction.objects.select_related('processed_by').all()
        payload = [
            {
                'id': sale.id,
                'date': sale.date.isoformat(),
                'items': sale.items,
                'total': sale.total,
                'processedBy': {
                    'uid': sale.processed_by.id,
                    'givenName': sale.processed_by.given_name,
                    'role': sale.processed_by.role,
                },
            }
            for sale in sales
        ]
        return Response(payload, status=status.HTTP_200_OK)
