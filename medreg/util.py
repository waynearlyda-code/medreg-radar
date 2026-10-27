import datetime as dt
import html
import re

TAG_RE = re.compile(r"<[^>]+>")


def clean(text):
    """去掉 HTML 标签和多余空白。"""
    text = html.unescape(TAG_RE.sub("", text or ""))
    return re.sub(r"\s+", " ", text).strip()


def parse_date(text):
    """从 2026.09.11 / 2026-09-11 / 2026年9月11日 这类写法里取出日期。"""
    m = re.search(r"(20\d{2})\s*[.\-/年]\s*(\d{1,2})\s*[.\-/月]\s*(\d{1,2})", text or "")
    if not m:
        return None
    try:
        return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def iso_week_label(d):
    y, w, _ = d.isocalendar()
    return "%d-W%02d" % (y, w)


def week_range(d):
    start = d - dt.timedelta(days=d.isoweekday() - 1)
    return start, start + dt.timedelta(days=6)
