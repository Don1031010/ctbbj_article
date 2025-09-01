# article/admin.py
from django.contrib import admin
from .models import Article, ArticleTranslation, Vocabulary
from django.db.models import Count, Q
from django.contrib.admin.helpers import ActionForm
from django import forms
from taggit.models import Tag, TaggedItem
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _


LANG_CHOICES = (
    ("zh", "Chinese (ZH)"),
    ("en", "English (EN)"),
    ("ja", "Japanese (JA)"),
)

class TagListFilter(admin.SimpleListFilter):
    title = _('tags')
    parameter_name = 'tag'

    def lookups(self, request, model_admin):
        # Get ContentType for the model (e.g., Post)
        content_type = ContentType.objects.get_for_model(model_admin.model)

        # Get only the tags that are used for this model
        tag_ids = TaggedItem.objects.filter(content_type=content_type).values_list('tag_id', flat=True)
        tags = Tag.objects.filter(id__in=tag_ids)

        return [(tag.id, tag.name) for tag in tags]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(tags__id=self.value())
        return queryset


class ArticleTranslationInline(admin.StackedInline):
    model = ArticleTranslation
    extra = 0
    fields = ("language", "title_translated", "text_translated", "updated")
    readonly_fields = ("updated",)


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ("title", "language", "publish", "user", "created", "col_ja", "col_zh", "col_en")
    list_filter = ("language", "publish", "user", "created")
    search_fields = ("title", "text", "slug")
    ordering = ("-publish", "-created")
    inlines = [ArticleTranslationInline]

    # --- Actions ---

    
    # show counts efficiently
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.annotate(
            cnt_ja=Count("translations", filter=Q(translations__language="ja"), distinct=True),
            cnt_zh=Count("translations", filter=Q(translations__language="zh"), distinct=True),
            cnt_en=Count("translations", filter=Q(translations__language="en"), distinct=True),
        )

    @admin.display(description="JA", ordering="cnt_ja")
    def col_ja(self, obj):
        from builtins import int as _int
        return "-" if obj.language == "ja" else _int(getattr(obj, "cnt_ja", 0) or 0)

    @admin.display(description="ZH", ordering="cnt_zh")
    def col_zh(self, obj):
        from builtins import int as _int
        return "-" if obj.language == "zh" else _int(getattr(obj, "cnt_zh", 0) or 0)

    @admin.display(description="EN", ordering="cnt_en")
    def col_en(self, obj):
        from builtins import int as _int
        return "-" if obj.language == "en" else _int(getattr(obj, "cnt_en", 0) or 0)


@admin.register(ArticleTranslation)
class ArticleTranslationAdmin(admin.ModelAdmin):
    list_display = ("article", "language", "updated")
    list_filter = ("language", "updated")
    search_fields = ("article__title", "title_translated", "text_translated")
    ordering = ("-updated",)
    

