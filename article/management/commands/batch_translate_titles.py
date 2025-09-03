import os
import time
import json
import html
import logging
import re
from typing import Optional, Tuple

import requests
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q
from django.utils.text import Truncator

from article.models import ArticleTranslation  # adjust if your app label differs

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")

# ----- Small helpers -----

def strip_html(html_text: str, max_chars: int = 4000) -> str:
    """
    Very light HTML -> text. Good enough for prompting.
    """
    if not html_text:
        return ""
    # unescape entities, remove tags, collapse whitespace
    text = html.unescape(re.sub(r"<[^>]+>", " ", html_text))
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars] + "…"
    return text

def make_prompt(lang: str, original_title: str, translated_body_text: str) -> Tuple[str, str]:
    """
    Returns (system_prompt, user_prompt) tailored per language.
    """
    if lang == "en":
        system = (
            "You are a professional news editor. "
            "Write a concise, informative headline in ENGLISH. "
            "Avoid quotes, emojis, site names, and source attributions. "
            "Max 100 characters."
        )
        user = (
            f"Original article title (Japanese): {original_title}\n\n"
            f"Translated body (plain text):\n{translated_body_text}\n\n"
            "Return ONLY the headline text."
        )
    elif lang == "zh":
        system = (
            "你是一名资深新闻编辑。请用简体中文撰写简洁的新闻标题。"
            "不要添加引号、表情、网站名或来源信息。长度不超过 24 个中文字符（必要时可稍微超过）。"
        )
        user = (
            f"原文标题（日语）：{original_title}\n\n"
            f"翻译后的正文（纯文本）：\n{translated_body_text}\n\n"
            "只返回标题文本。"
        )
    else:
        # default fallback
        system = "Write a concise headline."
        user = f"Original title: {original_title}\n\nBody:\n{translated_body_text}\nReturn only the headline."
    return system, user

def backoff_sleep(try_index: int):
    # 1s, 2s, 4s, 8s... up to 16s
    time.sleep(min(16, 2 ** try_index))

# ----- Providers -----

def openai_chat_complete(system_prompt: str, user_prompt: str, model: str = "gpt-4o-mini", timeout: int = 30) -> str:
    """
    Calls OpenAI Chat Completions API for English title.
    """
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=timeout)
    if resp.status_code != 200:
        raise RuntimeError(f"OpenAI error {resp.status_code}: {resp.text}")
    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    return content

def deepseek_chat_complete(system_prompt: str, user_prompt: str, model: str = "deepseek-chat", timeout: int = 30) -> str:
    """
    Calls DeepSeek Chat Completions API for Chinese title.
    """
    if not DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is not set")

    url = "https://api.deepseek.com/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=timeout)
    if resp.status_code != 200:
        raise RuntimeError(f"DeepSeek error {resp.status_code}: {resp.text}")
    data = resp.json()
    content = data["choices"][0]["message"]["content"].strip()
    return content

def generate_title(lang: str, original_title: str, translated_html: str) -> str:
    text = strip_html(translated_html)
    sys_p, usr_p = make_prompt(lang, original_title, text)
    tries = 0
    while True:
        try:
            if lang == "en":
                return openai_chat_complete(sys_p, usr_p)
            elif lang == "zh":
                return deepseek_chat_complete(sys_p, usr_p)
            else:
                # shouldn’t happen for this batch; just return original as fallback
                return original_title
        except Exception as e:
            tries += 1
            logger.warning("Generate title failed (lang=%s, try=%s): %s", lang, tries, e)
            if tries >= 5:
                raise
            backoff_sleep(tries)

# ----- Command -----

class Command(BaseCommand):
    help = "Batch-translate missing ArticleTranslation.title_translated: en via ChatGPT, zh via DeepSeek."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=200, help="Max rows to process")
        parser.add_argument("--offset", type=int, default=0, help="Offset rows")
        parser.add_argument("--batch-size", type=int, default=20, help="Save in batches")
        parser.add_argument("--dry-run", action="store_true", help="Do not save to DB")
        parser.add_argument("--model-en", default="gpt-4o-mini", help="OpenAI model for EN")
        parser.add_argument("--model-zh", default="deepseek-chat", help="DeepSeek model for ZH")

    def handle(self, *args, **opts):
        limit = opts["limit"]
        offset = opts["offset"]
        batch_size = opts["batch_size"]
        dry_run = opts["dry_run"]
        model_en = opts["model_en"]
        model_zh = opts["model_zh"]

        if not OPENAI_API_KEY:
            self.stdout.write(self.style.WARNING("OPENAI_API_KEY not set — EN titles will fail."))
        if not DEEPSEEK_API_KEY:
            self.stdout.write(self.style.WARNING("DEEPSEEK_API_KEY not set — ZH titles will fail."))

        qs = (
            ArticleTranslation.objects
            .select_related("article")
            .filter(Q(title_translated__isnull=True) | Q(title_translated__exact=""))
            .order_by("id")
        )

        total = qs.count()
        self.stdout.write(self.style.NOTICE(f"Found {total} rows with empty titles."))

        qs = qs[offset: offset + limit]
        processed = 0
        to_update = []

        for tr in qs:
            lang = tr.language
            original_title = tr.article.title if tr.article else ""

            # build the title via providers
            try:
                # temporarily override model choice if passed
                global openai_chat_complete, deepseek_chat_complete
                def openai_chat_complete(sys_p, usr_p, model=model_en, timeout=30):
                    return globals()["openai_chat_complete"].__wrapped__(sys_p, usr_p, model=model, timeout=timeout) \
                        if hasattr(globals()["openai_chat_complete"], "__wrapped__") \
                        else globals()["openai_chat_complete"](sys_p, usr_p, model=model, timeout=timeout)

                def deepseek_chat_complete(sys_p, usr_p, model=model_zh, timeout=30):
                    return globals()["deepseek_chat_complete"].__wrapped__(sys_p, usr_p, model=model, timeout=timeout) \
                        if hasattr(globals()["deepseek_chat_complete"], "__wrapped__") \
                        else globals()["deepseek_chat_complete"](sys_p, usr_p, model=model, timeout=timeout)
            except Exception:
                # if the wrapping above looks too magic, skip; the defaults are fine
                pass

            try:
                new_title = generate_title(lang, original_title, tr.text_translated)
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"[{tr.id}:{lang}] failed → {e}"))
                continue

            # sanitize/truncate to model limit (your field is 300 chars)
            new_title = Truncator(new_title.replace("\n", " ").strip()).chars(300)

            msg = f"[{tr.id}:{lang}] “{new_title}”"
            if dry_run:
                self.stdout.write(self.style.NOTICE("[DRY-RUN] " + msg))
            else:
                tr.title_translated = new_title
                to_update.append(tr)
                self.stdout.write(self.style.SUCCESS(msg))

            processed += 1
            if not dry_run and len(to_update) >= batch_size:
                ArticleTranslation.objects.bulk_update(to_update, ["title_translated"])
                to_update.clear()
                # be nice to APIs
                time.sleep(0.5)

        if not dry_run and to_update:
            ArticleTranslation.objects.bulk_update(to_update, ["title_translated"])

        self.stdout.write(self.style.SUCCESS(f"Done. Processed {processed} rows."))
