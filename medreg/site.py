"""生成可以直接挂在 GitHub Pages 上的静态网页（docs/）。不依赖任何外部文件。"""
import datetime as dt
import html
import json
import os

from .classify import LEVELS

CSS = """
:root{--bg:#f6f7f9;--card:#fff;--ink:#16202a;--muted:#5d6b78;--line:#e3e7ec;--accent:#0f6e8c;
--img:#0f6e8c;--dev:#5b5fc7;--bgk:#8a96a3;--chip:#eef3f6}
@media (prefers-color-scheme:dark){:root{--bg:#0f1418;--card:#171e24;--ink:#e6edf3;--muted:#93a1ad;
--line:#26313a;--accent:#4fb3d1;--img:#4fb3d1;--dev:#9a9df0;--bgk:#76838f;--chip:#1f2a33}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.65 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:920px;margin:0 auto;padding:28px 16px 64px}
header h1{margin:0;font-size:26px;letter-spacing:.5px}header h1 span{color:var(--accent)}
header p{margin:6px 0 0;color:var(--muted)}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}
.stat{flex:1 1 140px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.stat b{display:block;font-size:24px}.stat small{color:var(--muted)}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 14px}
.bar button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;
padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}.bar button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.bar input{flex:1 1 180px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 10px;font:inherit}
.item{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--bgk);border-radius:8px;padding:12px 14px;margin:10px 0}
.item.L0{border-left-color:var(--img)}.item.L1{border-left-color:var(--dev)}
.item a{color:var(--ink);font-weight:600;text-decoration:none}.item a:hover{color:var(--accent);text-decoration:underline}
.meta{color:var(--muted);font-size:13px;margin-top:2px}.sum{font-size:14px;margin-top:6px;color:var(--ink);opacity:.85}
.chip{display:inline-block;background:var(--chip);border-radius:4px;padding:0 6px;margin-right:4px;font-size:12px}
.lv{font-size:12px;font-weight:600;margin-right:6px}.L0 .lv{color:var(--img)}.L1 .lv{color:var(--dev)}.L2 .lv{color:var(--bgk)}
h2{font-size:18px;margin:34px 0 6px}.arch{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.arch a{display:block;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--ink);text-decoration:none;font-size:14px}
.arch a small{color:var(--muted);display:block}.arch a:hover{border-color:var(--accent)}
.note{color:var(--muted);font-size:13px;border-top:1px solid var(--line);margin-top:40px;padding-top:14px}
.empty{color:var(--muted);padding:12px 0}
"""

INTRO = ("医疗器械的法规和政策更新得快，分散在各个部门的网站上。MedReg Radar 定期把公开发布的文件收拢到一处，"
         "按“影像设备 / 医疗器械 / 背景”分级，方便设备工程师、采购和管理人员快速了解变化。")


def _e(s):
    return html.escape(s or "", quote=True)


def _item_html(it):
    lv = LEVELS.index(it["level"])
    meta = [it["date"], it["source"]] + ([it["doc_no"]] if it.get("doc_no") else [])
    chips = "".join('<span class="chip">%s</span>' % _e(t) for t in it.get("tags", []))
    summ = it.get("summary", "")
    if len(summ) > 180:
        summ = summ[:180] + "……"
    return ('<div class="item L%d" data-lv="%s" data-tags="%s"><span class="lv">%s</span>'
            '<a href="%s" target="_blank" rel="noopener">%s</a><div class="meta">%s %s</div>%s</div>') % (
        lv, _e(it["level"]), _e(" ".join(it.get("tags", []))), _e(it["level"]), _e(it["url"]),
        _e(it["title"]), _e(" · ".join(meta)), chips,
        ('<div class="sum">%s</div>' % _e(summ)) if summ and lv < 2 else "")


FILTER_JS = """
<script>
(function(){var lv='全部',q='';var items=[].slice.call(document.querySelectorAll('.item'));
function apply(){var n=0;items.forEach(function(el){var ok=(lv==='全部'||el.dataset.lv===lv)&&
(!q||el.textContent.indexOf(q)>-1);el.style.display=ok?'':'none';if(ok)n++;});
var c=document.getElementById('count');if(c)c.textContent=n+' 条';}
document.querySelectorAll('.bar button').forEach(function(b){b.onclick=function(){
document.querySelectorAll('.bar button').forEach(function(x){x.classList.remove('on')});b.classList.add('on');lv=b.dataset.lv;apply();};});
var s=document.getElementById('q');if(s)s.oninput=function(){q=s.value.trim();apply();};apply();})();
</script>
"""


def _page(title, body, depth=0):
    up = "../" * depth
    return ("<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<title>%s</title><style>%s</style></head><body><div class=\"wrap\">"
            "<header><h1><a href=\"%sindex.html\" style=\"color:inherit;text-decoration:none\">MedReg <span>Radar</span></a></h1>"
            "<p>医疗器械法规与政策动态 · 以医学影像设备为主</p></header>%s"
            "<p class=\"note\">本站由程序从公开渠道自动整理，非官方发布。分级与标签由关键词规则生成，可能有误，一切以原文为准。"
            "每条均附官方原文链接。</p></div>%s</body></html>") % (_e(title), CSS, up, body, FILTER_JS)


def _filter_bar():
    btns = "".join('<button data-lv="%s"%s>%s</button>' % (x, ' class="on"' if x == "全部" else "", x)
                   for x in ["全部"] + LEVELS)
    return '<div class="bar">%s<input id="q" placeholder="搜索标题或摘要"><small id="count"></small></div>' % btns


def _list(items):
    if not items:
        return '<div class="empty">这一期没有新文件。</div>'
    return "\n".join(_item_html(i) for i in items)


def build(items, reports, out_dir, today, recent_days=30):
    os.makedirs(out_dir, exist_ok=True)
    since = (today - dt.timedelta(days=recent_days)).isoformat()
    recent = [i for i in items if i["date"] >= since]
    cnt = {lv: sum(1 for i in recent if i["level"] == lv) for lv in LEVELS}

    for kind, label, _path, sel, _start in reports:
        name = ("周报 " if kind == "weekly" else "月报 ") + label
        body = "<h2>%s</h2>%s%s" % (_e(name), _filter_bar(), _list(sel))
        p = os.path.join(out_dir, kind, label + ".html")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(_page("MedReg Radar · " + name, body, depth=1))

    def arch(kind):
        rs = sorted([r for r in reports if r[0] == kind], key=lambda r: r[1], reverse=True)
        return "".join('<a href="%s/%s.html">%s<small>%d 条</small></a>' % (kind, _e(r[1]), _e(r[1]), len(r[3]))
                       for r in rs)

    stats = "".join('<div class="stat"><b>%d</b><small>近 %d 天 · %s</small></div>' % (cnt[lv], recent_days, lv)
                    for lv in LEVELS)
    stats += '<div class="stat"><b>%s</b><small>最近更新</small></div>' % today.strftime("%m-%d")
    body = ('<p style="margin-top:14px">%s</p><div class="stats">%s</div>'
            '<h2>近 %d 天</h2>%s%s<h2>周报</h2><div class="arch">%s</div><h2>月报</h2><div class="arch">%s</div>') % (
        _e(INTRO), stats, recent_days, _filter_bar(), _list(recent), arch("weekly"), arch("monthly"))
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(_page("MedReg Radar · 医疗器械法规雷达", body))
    with open(os.path.join(out_dir, "latest.json"), "w", encoding="utf-8") as f:
        json.dump({"updated": today.isoformat(), "recent_days": recent_days, "counts": cnt},
                  f, ensure_ascii=False, indent=1)
