"""生成静态网页（docs/）：首页 index.html，以及每份周报、月报一页。

样式和脚本在 medreg/web/ 里，生成时直接内联进页面，数据也嵌在页面里，
所以 docs/ 下的文件可以直接双击打开，也可以原样挂到 GitHub Pages。
"""
import datetime as dt
import html
import json
import os

HERE = os.path.join(os.path.dirname(__file__), "web")


def _read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


def _e(s):
    return html.escape(s or "", quote=True)


def _json_for_script(obj):
    # 防止数据里的 "</script>" 提前结束脚本块
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def _slim(it):
    keep = ("url", "title", "date", "source", "doc_no", "level", "tags", "summary")
    return {k: it[k] for k in keep if it.get(k)}


def _card(it):
    meta = [it["level"], it["date"], it["source"]] + ([it["doc_no"]] if it.get("doc_no") else [])
    meta_html = "".join(('<span class="lv">%s</span>' if i == 0 else "<span>%s</span>") % _e(m) for i, m in enumerate(meta))
    body = ""
    if it.get("summary") and it["level"] != "背景":
        s = it["summary"]
        body = '<p class="snip">%s</p>' % _e(s if len(s) <= 160 else s[:160] + "……")
    chips = "".join('<span class="chip">%s</span>' % _e(t) for t in it.get("tags", []))
    return ('<article class="card" data-lv="%s"><div class="bar"></div><div class="in"><div class="meta">%s</div>'
            '<h3><a href="%s" target="_blank" rel="noopener">%s</a></h3>%s%s</div></article>') % (
        _e(it["level"]), meta_html, _e(it["url"]), _e(it["title"]), body,
        ('<div class="chips">%s</div>' % chips) if chips else "")


REPORT_PAGE = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>%(title)s</title><style>%(css)s</style></head>
<body><header class="top"><div class="wrap"><a class="brand" href="../index.html"><b>MedReg <span>Radar</span></b></a>
<span class="sp"></span><a class="btn" href="../index.html">返回首页</a></div></header>
<main class="wrap"><div class="report-h"><div class="tag">%(kind)s</div><h1>%(h1)s</h1>
<p class="note">共 %(n)d 条 · 影像设备 %(img)d · 医疗器械 %(dev)d · 背景 %(bg)d</p></div>
<div class="feed">%(cards)s</div></main>
<footer><div class="wrap"><p>本页由程序从公开渠道自动整理，非官方发布。分级和标签可能有误，一切以官方原文为准。</p></div></footer>
</body></html>"""


def build(items, reports, out_dir, today, trends=None, all_items=None):
    os.makedirs(out_dir, exist_ok=True)
    css = _read("style.css")

    for kind, label, _path, sel, start in reports:
        if kind == "weekly":
            end = start + dt.timedelta(days=6)
            h1 = "周报 %s（%s – %s）" % (label, start.strftime("%m.%d"), end.strftime("%m.%d"))
        else:
            h1 = "月报 %d 年 %d 月" % (start.year, start.month)
        cnt = lambda lv: sum(1 for i in sel if i["level"] == lv)
        page = REPORT_PAGE % {
            "title": "MedReg Radar · " + _e(h1), "css": css, "kind": "WEEKLY REPORT" if kind == "weekly" else "MONTHLY REPORT",
            "h1": _e(h1), "n": len(sel), "img": cnt("影像设备"), "dev": cnt("医疗器械"), "bg": cnt("背景"),
            "cards": "".join(_card(i) for i in sel) or '<div class="empty">这一期没有新文件。</div>'}
        p = os.path.join(out_dir, kind, label + ".html")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(page)

    arch = {"weekly": [], "monthly": []}
    for kind, label, _p, sel, _s in sorted(reports, key=lambda r: r[1], reverse=True):
        arch[kind].append({"label": label, "count": len(sel)})
    all_items = all_items if all_items is not None else items
    data = {
        "today": today.isoformat(),
        "items": [_slim(i) for i in items],
        "allItems": [{"title": i["title"], "date": i["date"], "level": i["level"]} for i in all_items],
        "trends": trends or {},
        "reports": arch,
    }
    page = (_read("index.html")
            .replace("{{CSS}}", css)
            .replace("{{UPDATED}}", today.isoformat())
            .replace("{{TOTAL}}", str(len(all_items)))
            .replace("{{DATA}}", _json_for_script(data))
            .replace("{{JS}}", _read("app.js")))
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(page)
    with open(os.path.join(out_dir, "latest.json"), "w", encoding="utf-8") as f:
        json.dump({"updated": today.isoformat(), "total": len(all_items)}, f, ensure_ascii=False, indent=1)
    # 公开数据接口：网页嵌入的同一份数据，供 App 或其他程序读取
    with open(os.path.join(out_dir, "data.json"), "w", encoding="utf-8") as f:
        json.dump(dict(data, version=1), f, ensure_ascii=False)
