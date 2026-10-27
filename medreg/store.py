"""所有抓到的条目存在 data/items.json，一条一个 URL，重复的不再存。"""
import json
import os


class Store:
    def __init__(self, path):
        self.path = path
        self.items = {}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                for it in json.load(f):
                    self.items[it["url"]] = it

    def add(self, item):
        """新条目返回 True；已存在的只补全缺的字段。"""
        old = self.items.get(item["url"])
        if old is None:
            self.items[item["url"]] = item
            return True
        for k, v in item.items():
            if v and not old.get(k):
                old[k] = v
        return False

    def all(self):
        return sorted(self.items.values(), key=lambda x: (x["date"], x["title"]), reverse=True)

    def save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.all(), f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.path)
