from django.urls import path
# from . import views  # not working for class-based view. Why??
from . import views
# from .views import ArticleListView, ArticleDetailView, receive_article, cors_test_view
from . import views_lang

app_name = 'article'

urlpatterns = [
    # article views
    path('', views.ArticleListView.as_view(), name='article_list'),
    path("lang/", views_lang.set_lang, name="set_lang"),
    path('<int:year>/<int:month>/<int:day>/<str:slug>/', views.ArticleDetailView.as_view(), name='article_detail'),
    path('receive/', views.receive_article, name='receive_article'),
    path("news/weekly/", views.weekly_news, name="weekly_news"),

 ]