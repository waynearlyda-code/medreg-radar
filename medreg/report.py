"""生成 Markdown 周报和月报。周报、月报都来自同一份数据，只是时间窗口不同。"""
import datetime as dt
import os

from .classify import LEVELS
from .util import iso_week_label, week_range

DISCLAIMER = ("> 本报告由程序从公开渠道自动整理，**非官方发布**。分级和标签由关键词规则生成，可能有误，"
              "一切以原文为准。")


def _short(text, n):
    return text if len(text) <= n else text[:n].rstrip() + "……"


def _line(it, detail):
    meta = [it["date"], it["source"]]
    if it.get("doc_no"):
        meta.append(it["doc_no"])
    s = "- **[%s](%s)**  \n  %s" % (it["title"], it["url"], " · ".join(meta))
    if it.get("tags"):
        s += " · " + " ".join("`%s`" % t for t in it["tags"])
    if detail and it.get("summary"):
        s += "  \n  " + _short(it["summary"], detail)
    return s


def _body(items):
    out = []
    by = {lv: [i for i in items if i["level"] == lv] for lv in LEVELS}
    out.append("共 %d 条：影像设备 %d · 医疗器械 %d · 背景 %d\n" % (
        len(items), len(by["影像设备"]), len(by["医疗器械"]), len(by["背景"])))
    sections = [("影像设备", "## 影像设备（重点）", 160),
                ("医疗器械", "## 医疗器械", 90),
                ("背景", "## 背景与环境（一笔带过）", 0)]
    for lv, head, detail in sections:
        out.append(head + "\n")
        if not by[lv]:
            out.append("_本期没有。_\n")
            continue
        out.extend(_line(i, detail) for i in by[lv])
        out.append("")
    return "\n".join(out)


def weekly(items, start):
    end = start + dt.timedelta(days=6)
    sel = [i for i in items if start.isoformat() <= i["date"] <= end.isoformat()]
    title = "# MedReg Radar 周报 · %s（%s – %s）\n" % (
        iso_week_label(start), start.strftime("%m.%d"), end.strftime("%m.%d"))
    return title, sel, "\n".join([title, DISCLAIMER, "", _body(sel)])


def monthly(items, year, month):
    key = "%d-%02d" % (year, month)
    sel = [i for i in items if i["date"].startswith(key)]
    title = "# MedReg Radar 月报 · %d 年 %d 月\n" % (year, month)
    tag_count = {}
    for i in sel:
        for t in i.get("tags", []):
            tag_count[t] = tag_count.get(t, 0) + 1
    tags = " · ".join("%s %d" % kv for kv in sorted(tag_count.items(), key=lambda x: -x[1])) or "无"
    head = [title, DISCLAIMER, "", "本月主题分布：" + tags, ""]
    return title, sel, "\n".join(head + [_body(sel)])


def weeks_between(first, last):
    start, _ = week_range(first)
    while start <= last:
        yield start
        start += dt.timedelta(days=7)


def months_between(first, last):
    y, m = first.year, first.month
    while (y, m) <= (last.year, last.month):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def write_all(items, root, first, today):
    """写出 first 到 today 之间的每一份周报和月报，返回 [(类型, 标签, 路径, 条目)]。"""
    written = []
    for start in weeks_between(first, today):
        title, sel, md = weekly(items, start)
        path = os.path.join(root, "weekly", iso_week_label(start) + ".md")
        _write(path, md)
        written.append(("weekly", iso_week_label(start), path, sel, start))
    for y, m in months_between(first, today):
        title, sel, md = monthly(items, y, m)
        path = os.path.join(root, "monthly", "%d-%02d.md" % (y, m))
        _write(path, md)
        written.append(("monthly", "%d-%02d" % (y, m), path, sel, dt.date(y, m, 1)))
    return written


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text.rstrip() + "\n")
