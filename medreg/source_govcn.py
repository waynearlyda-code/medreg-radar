"""中国政府网·政策文件库（www.gov.cn/zhengce）的公开搜索接口。

这是网站自己搜索框用的公开接口，不需要登录，也没有反爬限制。
请求之间会停顿，避免给网站添负担。
"""
import json
import time
import urllib.parse
import urllib.request

from .util import clean, parse_date

API = "https://sousuo.www.gov.cn/search-gov/data"
UA = "MedRegRadar/0.1 (+https://github.com/; policy monitoring, low frequency)"


def _get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch(cfg, log=print):
    """返回 (条目列表, 历年趋势)。历年趋势是每个搜索词在政策文件库里每年出现的文件数。"""
    g = cfg["govcn"]
    out = []
    trends = {}
    for q in g["queries"]:
        for p in range(1, g["pages_per_query"] + 1):
            try:
                data = _get({"t": "zhengcelibrary", "q": q, "sort": "pubtime",
                             "sortType": 1, "p": p, "n": g["page_size"]})
            except Exception as e:  # 网络问题不让整次运行失败
                log("  [政府网] %s 第%d页 失败：%s" % (q, p, e))
                break
            sv = data.get("searchVO") or {}
            if p == 1:
                years = (((sv.get("extendresult") or {}).get("facetMap") or {}).get("pubtimeyear") or {})
                trends[q] = {y: int(v) for y, v in years.items() if y.isdigit()}
            cats = sv.get("catMap") or {}
            got = 0
            for key, label in g["categories"].items():
                for x in (cats.get(key) or {}).get("listVO") or []:
                    d = parse_date(x.get("pubtimeStr", ""))
                    if not d or not x.get("url"):
                        continue
                    out.append({
                        "url": x["url"],
                        "title": clean(x.get("title")),
                        "date": d.isoformat(),
                        "summary": clean(x.get("summary")),
                        "doc_no": clean(x.get("pcode") or x.get("fwzh") or ""),
                        "source": "中国政府网·" + label,
                    })
                    got += 1
            log("  [政府网] %s 第%d页：%d 条" % (q, p, got))
            time.sleep(g["request_interval_seconds"])
            if got == 0:
                break
    return out, trends
