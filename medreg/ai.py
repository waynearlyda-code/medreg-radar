"""AI 解读：给每条文件写三句大白话。需要 DeepSeek（或任何兼容 OpenAI 接口的）API key。

key 的来源（按顺序）：环境变量 DEEPSEEK_API_KEY → .secrets/deepseek_key.txt。
都没有就跳过，雷达照常运行，只是没有 AI 解读。
"""
import json
import os
import urllib.request

PROMPT = """你是医疗器械法规助理，读者是医院设备科工程师、医疗器械企业的售后和质量人员。
下面是若干条政府公开文件，每条有编号、标题、来源，部分有摘要片段。请为每一条写一段不超过 90 字的中文解读，包含三点：
1. 讲了什么；2. 主要影响谁；3. 和医学影像设备（CT、MR、DR、DSA、超声、核医学、放疗等）有没有直接关系，没有就说“与影像设备无直接关系”。
要求：只根据给出的标题和摘要，不编造文件里没有的内容；只有标题时，用“从标题看”开头。
严格输出 JSON：{"items":[{"id":编号,"summary":"……"}]}，不要输出其他内容。"""


def load_key(root, cfg):
    k = os.environ.get(cfg["key_env"], "").strip()
    if k:
        return k
    path = os.path.join(root, cfg["key_file"])
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    return ""


def _chat(cfg, key, content):
    body = json.dumps({
        "model": cfg["model"],
        "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": content}],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")
    req = urllib.request.Request(cfg["base_url"].rstrip("/") + "/chat/completions", data=body, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"], data.get("usage", {})


def annotate(items, root, cfg, log=print):
    """给还没有解读的条目补上 ai_summary。返回 (写了几条, token 用量)。"""
    a = cfg["ai"]
    key = load_key(root, a)
    if not key:
        log("  [AI] 没有找到 API key，跳过 AI 解读（见 .secrets/README.md）")
        return 0, {}
    todo = [i for i in items if not i.get("ai_summary")][: a["max_items_per_run"]]
    done, usage = 0, {"prompt_tokens": 0, "completion_tokens": 0}
    for s in range(0, len(todo), a["batch_size"]):
        batch = todo[s:s + a["batch_size"]]
        lines = []
        for n, it in enumerate(batch, 1):
            lines.append("[%d] 标题：%s\n来源：%s（%s）\n摘要：%s" % (
                n, it["title"], it["source"], it["date"], it.get("summary") or "（无，只有标题）"))
        try:
            text, u = _chat(a, key, "\n\n".join(lines))
            for k in usage:
                usage[k] += u.get(k, 0)
            for r in json.loads(text).get("items", []):
                n = int(r.get("id", 0))
                if 1 <= n <= len(batch) and r.get("summary"):
                    batch[n - 1]["ai_summary"] = r["summary"].strip()
                    batch[n - 1]["ai_title_only"] = not batch[n - 1].get("summary")
                    done += 1
        except Exception as e:  # 一批失败不影响其他批，也不影响报告生成
            hint = {"401": "key 不对或已失效", "402": "账户余额不足", "429": "请求太频繁"}
            why = next((v for k, v in hint.items() if k in str(e)), str(e))
            log("  [AI] 第 %d 批失败：%s" % (s // a["batch_size"] + 1, why))
            if "401" in str(e) or "402" in str(e):
                break
    log("  [AI] 写了 %d 条解读，用量：输入 %d / 输出 %d tokens" % (
        done, usage["prompt_tokens"], usage["completion_tokens"]))
    return done, usage
