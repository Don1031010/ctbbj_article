# article/views_lang.py
from django.shortcuts import redirect
from django.http import HttpRequest

SUPPORTED = {"ja", "zh", "en"}

def set_lang(request: HttpRequest):
    lang = request.GET.get("lang", "ja")
    if lang not in SUPPORTED:
        lang = "ja"
    request.session["lang"] = lang
    # go back
    referer = request.META.get("HTTP_REFERER") or "/"
    return redirect(referer)