def active_lang(request):
    lang = request.session.get("lang", "ja").lower()
    if lang in {"cn", "zh-cn", "zh-hans"}:
        lang = "zh"

    # fi: flag-icons country code (jp, cn, us)
    flags = [
        {"code": "ja", "fi": "jp", "label": "日本語"},
        {"code": "zh", "fi": "cn", "label": "中文"},
        {"code": "en", "fi": "us", "label": "English (US)"},
    ]
    # selected item for the button
    current = next((f for f in flags if f["code"] == lang), flags[0])

    return {"lang": lang, "flags": flags, "lang_current": current}
