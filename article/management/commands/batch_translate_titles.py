import os
import json
import requests
from django.core.management.base import BaseCommand
from django.db.models import Q
from article.models import ArticleTranslation

from openai import OpenAI

# ==============================
# Load keys and configs from .env
# ==============================
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL      = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL   = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

DEEPSEEK_API_KEY  = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL    = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

# ==============================
# OpenAI client for English
# ==============================
openai_client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

def translate_title_openai(japanese_title: str) -> str:
    """Translate Japanese news title into English using OpenAI API."""
    resp = openai_client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": "Translate the following Japanese news title into natural English."},
            {"role": "user", "content": japanese_title},
        ],
        temperature=0.3,
    )
    return resp.choices[0].message.content.strip()


# ==============================
# DeepSeek client for Chinese
# ==============================
def translate_title_deepseek(japanese_title: str) -> str:
    """Translate Japanese news title into Chinese using DeepSeek API."""
    url = f"{DEEPSEEK_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": "Translate the following Japanese news title into Simplified Chinese."},
            {"role": "user", "content": japanese_title},
        ],
        "temperature": 0.3,
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


# ==============================
# Django management command
# ==============================
class Command(BaseCommand):
    help = "Batch translate ArticleTranslation titles (where title_translated is null)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit", type=int, default=50,
            help="Max number of rows to process (default 50)."
        )
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Run without saving changes."
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        dry_run = options["dry_run"]

        qs = ArticleTranslation.objects.filter(
            Q(title_translated__isnull=True) | Q(title_translated="")
        ).select_related("article")[:limit]

        count = qs.count()
        self.stdout.write(f"Found {count} rows with empty titles.")

        for idx, trans in enumerate(qs, start=1):
            jp_title = trans.article.title
            if not jp_title:
                self.stdout.write(f"[{trans.id}:{trans.language}] skipped (no JP title).")
                continue

            try:
                if trans.language == "en":
                    translated = translate_title_openai(jp_title)
                    provider = f"OpenAI:{OPENAI_MODEL}"
                elif trans.language == "zh":
                    translated = translate_title_deepseek(jp_title)
                    provider = f"DeepSeek:{DEEPSEEK_MODEL}"
                else:
                    self.stdout.write(f"[{trans.id}:{trans.language}] skipped (lang not handled).")
                    continue

                if dry_run:
                    self.stdout.write(
                        f"[{trans.id}:{trans.language}] DRY-RUN: {jp_title} → {translated} ({provider})"
                    )
                else:
                    trans.title_translated = translated
                    trans.save(update_fields=["title_translated", "updated"])
                    self.stdout.write(
                        f"[{trans.id}:{trans.language}] updated: {jp_title} → {translated} ({provider})"
                    )

            except Exception as e:
                self.stderr.write(f"[{trans.id}:{trans.language}] FAILED: {e}")
