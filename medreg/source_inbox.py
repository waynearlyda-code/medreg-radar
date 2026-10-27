"""读取 inbox/ 里人手动保存的网页（比如药监局的公告列表页）。

药监局等网站不允许程序直接访问，所以由人在浏览器里正常打开页面、
按 Command+S（Windows 是 Ctrl+S）存成 .html 放进 inbox/，这里负责把
页面里的“标题 + 日期 + 链接”认出来。处理过的文件移到 inbox/done/。
"""
import os
import re
import shutil
import urllib.parse
from html.parser import HTMLParser

from .util import clean, parse_date

DATE_RE = re.compile(r"20\d{2}\s*[.\-/年]\s*\d{1,2}\s*[.\-/月]\s*\d{1,2}")


class _Links(HTMLParser):
    """按出现顺序记下每个链接和每个日期，各自标上所在的“行”（li / tr / dd）。
    同一行里的日期就是这个链接的日期。"""

    ROW_TAGS = ("li", "tr", "dd", "dt")

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.base = ""
        self.canonical = ""
        self.links = []          # {"href","text","row"}
        self.dates = {}          # row -> 第一个日期
        self._row = 0
        self._cur = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in self.ROW_TAGS:
            self._row += 1
        if tag == "base" and a.get("href"):
            self.base = a["href"]
        elif tag == "link" and a.get("rel") == "canonical" and a.get("href"):
            self.canonical = a["href"]
        elif tag == "a" and a.get("href"):
            self._cur = {"href": a["href"], "title": a.get("title") or "", "text": "", "row": self._row}

    def handle_data(self, data):
        if self._cur is not None:
            self._cur["text"] += data
            return
        m = DATE_RE.search(data)
        if m and self._row not in self.dates:
            self.dates[self._row] = m.group(0)

    def handle_endtag(self, tag):
        if tag == "a" and self._cur is not None:
            c = self._cur
            c["text"] = clean(c["title"]) if len(clean(c["title"])) > len(clean(c["text"])) else clean(c["text"])
            self.links.append(c)
            self._cur = None


def _guess_source(path, html):
    m = re.search(r"saved from url=\(\d+\)(\S+)", html)  # Chrome“网页，全部”会写这一行
    url = m.group(1) if m else ""
    host = urllib.parse.urlparse(url).netloc
    if "nmpa.gov.cn" in host or "国家药品监督管理局" in html[:5000]:
        return "国家药监局（手动导入）", url
    if "cmde.org.cn" in host:
        return "器审中心（手动导入）", url
    return "手动导入：" + os.path.basename(path), url


def read_inbox(folder, log=print):
    out = []
    if not os.path.isdir(folder):
        return out
    done = os.path.join(folder, "done")
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith((".html", ".htm")):
            continue
        path = os.path.join(folder, name)
        with open(path, encoding="utf-8", errors="ignore") as f:
            html = f.read()
        source, page_url = _guess_source(path, html)
        p = _Links()
        p.feed(html)
        base = p.base or p.canonical or page_url
        n = 0
        for ln in p.links:
            href, text = ln["href"], ln["text"]
            d = parse_date(text) or (parse_date(p.dates.get(ln["row"], "")) if ln["row"] else None)
            if not d or len(text) < 8 or href.startswith(("javascript", "#")):
                continue
            url = urllib.parse.urljoin(base, href) if base else href
            if not url.startswith("http"):
                continue
            out.append({"url": url, "title": DATE_RE.sub("", text).strip(" ()（）"),
                        "date": d.isoformat(), "summary": "", "doc_no": "", "source": source})
            n += 1
        log("  [手动导入] %s：认出 %d 条（来源：%s）" % (name, n, source))
        os.makedirs(done, exist_ok=True)
        shutil.move(path, os.path.join(done, name))
        assets = path.rsplit(".", 1)[0] + "_files"  # Chrome 一起存下的附件文件夹
        if os.path.isdir(assets):
            shutil.move(assets, os.path.join(done, os.path.basename(assets)))
    return out
