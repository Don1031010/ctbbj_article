# article/models.py
from django.db import models
from django.conf import settings
from django.urls import reverse
from django.db.models import Q
from taggit.managers import TaggableManager

LANG_CHOICES = (
    ("ja", "Japanese"),
    ("zh", "Chinese"),
    ("en", "English"),
)

class Article(models.Model):
    title = models.CharField(max_length=250)    
    language = models.CharField(max_length=2, choices=LANG_CHOICES, default="ja")
    slug = models.SlugField(max_length=250, unique_for_date='publish', allow_unicode=True)
    url = models.URLField(max_length=2000, blank=True)
    text = models.TextField()
    publish = models.DateField()
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='articles',
        on_delete=models.CASCADE
    )
    created = models.DateTimeField(auto_now_add=True)
    tags = TaggableManager()

    class Meta:
        ordering = ['-publish', '-created']
        indexes = [
            models.Index(fields=['language']),  
            models.Index(fields=['-publish', '-created']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['slug', 'publish'],
                name='unique_slug_per_publish_date'
            ),
            models.CheckConstraint(                            # <-- DB-level whitelist
                name='article_language_valid',
                check=Q(language__in=['ja', 'zh', 'en']),
            ),
        ]

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse(
            'article:article_detail',
            args=[self.publish.year, self.publish.month, self.publish.day, self.slug]
        )

    # helpers for translated fields
    def get_translated(self, lang: str):
        """Return (title, text) for the given lang, falling back to source when missing."""
        if lang not in {"ja", "zh", "en"}:
            return self.title, self.text
        if lang == "ja":
            # assume original language is Japanese for your dataset; change if needed
            return self.title, self.text
        tr = self.translations.filter(language=lang).first()
        if tr:
            return tr.title_translated or self.title, tr.text_translated or self.text
        return self.title, self.text


class ArticleTranslation(models.Model):
    article = models.ForeignKey(Article, related_name="translations", on_delete=models.CASCADE)
    language = models.CharField(max_length=2, choices=LANG_CHOICES)
    title_translated = models.CharField(max_length=300)
    text_translated = models.TextField()
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("article", "language")
        indexes = [
            models.Index(fields=["language", "updated"]),
        ]
        constraints = [
            models.CheckConstraint(                            # <-- DB-level whitelist
                name='articletranslation_language_valid',
                check=Q(language__in=['ja', 'zh', 'en']),
            ),
        ]

    def __str__(self):
        return f"{self.article.slug} [{self.language}]"