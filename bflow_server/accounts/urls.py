from django.urls import path

from .views import BookListView, LoginView, RegisterView, SaleListView, SeedDemoDataView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='accounts-register'),
    path('login/', LoginView.as_view(), name='accounts-login'),
    path('seed-demo-data/', SeedDemoDataView.as_view(), name='accounts-seed-demo-data'),
    path('books/', BookListView.as_view(), name='accounts-books'),
    path('sales/', SaleListView.as_view(), name='accounts-sales'),
]
