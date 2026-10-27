"""用关键词规则给条目分级：影像设备 > 医疗器械 > 背景。不相关的丢掉。"""

LEVELS = ["影像设备", "医疗器械", "背景"]


def _hits(text, words):
    return [w for w in words if w in text]


def classify(item, cfg):
    title, summary = item["title"], item.get("summary", "")
    kw = cfg["keywords"]
    img_t, img_s = _hits(title, kw["imaging"]), _hits(summary, kw["imaging"])
    dev_t, dev_s = _hits(title, kw["device"]), _hits(summary, kw["device"])

    if img_t and (dev_t or dev_s or "医" in title + summary):
        level = "影像设备"
    elif img_s and (dev_t or dev_s):
        level = "影像设备"
    elif dev_t:
        level = "医疗器械"
    elif dev_s:
        level = "背景"
    else:
        return None

    text = title + summary
    tags = [name for name, words in cfg["tags"].items() if _hits(text, words)]
    item["level"] = level
    item["tags"] = tags
    item["matched"] = sorted(set(img_t + img_s + dev_t + dev_s))
    return item
