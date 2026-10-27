#!/usr/bin/env python3
"""MedReg Radar 主程序。

    python3 radar.py            抓取 + 读取 inbox/ + 生成报告和网页
    python3 radar.py --offline  不联网，只读 inbox/ 并重新生成报告和网页
"""
import argparse
import datetime as dt
import json
import os
import sys

from medreg import report, site, source_govcn, source_inbox
from medreg.classify import classify
from medreg.store import Store

ROOT = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser(description="MedReg Radar")
    ap.add_argument("--offline", action="store_true", help="不联网抓取")
    ap.add_argument("--days", type=int, help="报告覆盖最近多少天（默认见 config.json）")
    args = ap.parse_args()

    with open(os.path.join(ROOT, "config.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    today = dt.date.today()
    first = today - dt.timedelta(days=args.days or cfg["first_run_days"])

    store = Store(os.path.join(ROOT, "data", "items.json"))
    raw = []
    trends_path = os.path.join(ROOT, "data", "trends.json")
    trends = {}
    if os.path.exists(trends_path):
        with open(trends_path, encoding="utf-8") as f:
            trends = json.load(f)
    if not args.offline:
        print("抓取 中国政府网·政策文件库 ...")
        got, t = source_govcn.fetch(cfg)
        raw += got
        if t:
            trends = {"updated": today.isoformat(), "source": "中国政府网·政策文件库（标题或正文含该词的文件数）", "series": t}
            with open(trends_path, "w", encoding="utf-8") as f:
                json.dump(trends, f, ensure_ascii=False, indent=1)
    print("读取 inbox/ 里手动保存的网页 ...")
    raw += source_inbox.read_inbox(os.path.join(ROOT, "inbox"))

    new = []
    for it in raw:
        it = classify(it, cfg)
        if it and store.add(it):
            new.append(it)
    # 关键词规则改了以后，旧条目也按新规则重新分级
    for it in list(store.items.values()):
        if classify(it, cfg) is None:
            del store.items[it["url"]]
    items = [i for i in store.all() if i["date"] >= first.isoformat()]
    store.save()
    reports = report.write_all(items, os.path.join(ROOT, "reports"), first, today)
    site.build(store.all(), reports, os.path.join(ROOT, "docs"), today, trends=trends.get("series", {}),
               all_items=store.all())

    img = sum(1 for i in new if i["level"] == "影像设备")
    print("\n完成：本次新增 %d 条（影像设备 %d 条）。库里共 %d 条。" % (len(new), img, len(store.items)))
    print("报告在 reports/，网页在 docs/index.html")
    with open(os.path.join(ROOT, "data", "last_run.json"), "w", encoding="utf-8") as f:
        json.dump({"date": today.isoformat(), "new": len(new), "new_imaging": img,
                   "new_titles": [i["title"] for i in new[:20]]}, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
