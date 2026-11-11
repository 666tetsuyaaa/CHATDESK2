from django.urls import path

from .views import CollegeListView, UserDetailView, UserListCreateView

# Mounted separately from users.urls (which lives under /api/v1/auth/) so
# these admin User Management endpoints get a clean /api/v1/users/ path.
urlpatterns = [
    path("users/", UserListCreateView.as_view(), name="user-list-create"),
    path("users/<int:user_id>/", UserDetailView.as_view(), name="user-detail"),
    path("colleges/", CollegeListView.as_view(), name="college-list"),
]
