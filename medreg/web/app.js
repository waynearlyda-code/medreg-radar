/* MedReg Radar 前端。数据由 radar.py 嵌在页面里（window.MR），所以直接双击本地文件也能用。
   所有来自数据的文字都用 textContent 写入，不拼 innerHTML。 */
(function () {
  "use strict";
  var MR = window.MR;
  var LEVELS = ["影像设备", "医疗器械", "背景"];
  var LV_VAR = { "影像设备": "--s-img", "医疗器械": "--s-dev", "背景": "--s-bg" };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var css = function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "cls") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  var SVGNS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    return n;
  }
  function daysAgo(n) { var d = new Date(MR.today + "T00:00:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  var items = MR.items.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

  /* ---------- 主题 ---------- */
  var root = document.documentElement;
  var saved = store.get("mr_theme");
  if (saved) root.setAttribute("data-theme", saved);
  $("#theme").addEventListener("click", function () {
    var dark = root.getAttribute("data-theme") ? root.getAttribute("data-theme") === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next); store.set("mr_theme", next);
    renderCharts();
  });

  /* ---------- 首屏数字 ---------- */
  var d30 = daysAgo(30), recent = items.filter(function (i) { return i.date >= d30; });
  LEVELS.forEach(function (lv, k) {
    var n = recent.filter(function (i) { return i.level === lv; }).length;
    $("#st" + k).textContent = n;
  });

  /* ---------- 提示框 ---------- */
  var tip = (function () {
    var box = el("div", { cls: "tip", role: "status" }); document.body.appendChild(box);
    return {
      show: function (e, rows) {
        box.textContent = "";
        rows.forEach(function (r) {
          if (r.key) { var row = el("div", { cls: "row" }, [el("i", { style: "background:" + r.key }), el("span", { cls: "tv", text: r.v }), el("span", { text: r.l })]); box.appendChild(row); }
          else box.appendChild(el("div", { cls: r[1] || "tv", text: r[0] }));
        });
        var x = e.clientX + 14, y = e.clientY + 14;
        box.classList.add("on");
        var w = box.offsetWidth, h = box.offsetHeight;
        if (x + w > innerWidth - 8) x = e.clientX - w - 14;
        if (y + h > innerHeight - 8) y = e.clientY - h - 14;
        box.style.left = x + "px"; box.style.top = y + "px";
      },
      hide: function () { box.classList.remove("on"); }
    };
  })();

  /* ---------- 雷达 ---------- */
  (function radar() {
    var svg = $("#radar-svg"), C = 200, R = { "影像设备": 62, "医疗器械": 122, "背景": 178 };
    var pool = recent.length >= 6 ? recent : items.filter(function (i) { return i.date >= daysAgo(90); });
    $("#radar-window").textContent = pool === recent ? "近 30 天" : "近 90 天";
    var blips = [];
    pool.slice(0, 60).forEach(function (it) {
      var h = hash(it.url), a = (h % 3600) / 10, jitter = ((h >> 12) % 24) - 12;
      var r = R[it.level] + jitter, rad = a * Math.PI / 180;
      var x = C + r * Math.sin(rad), y = C - r * Math.cos(rad);
      var g = sv("g", { "class": "blip", tabindex: "0", role: "link" });
      var color = "var(" + LV_VAR[it.level] + ")";
      g.appendChild(sv("circle", { "class": "halo", cx: x, cy: y, r: 5, stroke: color }));
      g.appendChild(sv("circle", { "class": "core", cx: x, cy: y, r: 5, fill: color }));
      var label = it.level + " · " + it.date + "\n" + it.title;
      g.setAttribute("aria-label", label);
      g.addEventListener("pointermove", function (e) { tip.show(e, [[it.title, ""], [it.level + " · " + it.date, "tl"]]); });
      g.addEventListener("pointerleave", tip.hide);
      g.addEventListener("focus", function () { var b = g.getBoundingClientRect(); tip.show({ clientX: b.right, clientY: b.top }, [[it.title, ""], [it.level + " · " + it.date, "tl"]]); });
      g.addEventListener("blur", tip.hide);
      g.addEventListener("click", function () { window.open(it.url, "_blank", "noopener"); });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter") window.open(it.url, "_blank", "noopener"); });
      $("#blips").appendChild(g);
      blips.push({ a: a, g: g });
    });
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var t0 = performance.now(), last = 0;
    function frame(t) {
      var ang = ((t - t0) / 6000 * 360) % 360;
      blips.forEach(function (b) {
        var hit = last <= ang ? (b.a > last && b.a <= ang) : (b.a > last || b.a <= ang);
        if (hit) { b.g.classList.remove("ping"); void b.g.getBBox(); b.g.classList.add("ping"); }
      });
      last = ang; requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();

  /* ---------- 动态列表 ---------- */
  var F = { range: "30", lv: "全部", q: "", shown: 30 };
  function card(it) {
    var meta = el("div", { cls: "meta" }, [
      el("span", { cls: "lv", text: it.level }), el("span", { text: it.date }), el("span", { text: it.source })]);
    if (it.doc_no) meta.appendChild(el("span", { text: it.doc_no }));
    var a = el("a", { href: it.url, target: "_blank", rel: "noopener", text: it.title });
    var inner = el("div", { cls: "in" }, [meta, el("h3", {}, [a])]);
    if (it.summary && it.level !== "背景") {
      inner.appendChild(el("p", { cls: "snip", text: it.summary.length > 160 ? it.summary.slice(0, 160) + "……" : it.summary }));
    }
    if (it.tags && it.tags.length) inner.appendChild(el("div", { cls: "chips" }, it.tags.map(function (t) { return el("span", { cls: "chip", text: t }); })));
    return el("article", { cls: "card", "data-lv": it.level }, [el("div", { cls: "bar" }), inner]);
  }
  function filtered() {
    var since = F.range === "all" ? "" : daysAgo(+F.range);
    return items.filter(function (i) {
      if (i.date < since) return false;
      if (F.lv !== "全部" && i.level !== F.lv) return false;
      if (F.q) { var t = i.title + (i.summary || "") + (i.doc_no || ""); if (t.indexOf(F.q) < 0) return false; }
      return true;
    });
  }
  function renderFeed() {
    var list = filtered(), feed = $("#feed");
    feed.textContent = "";
    if (!list.length) feed.appendChild(el("div", { cls: "empty", text: "这个范围里没有文件。换个时间范围试试。" }));
    list.slice(0, F.shown).forEach(function (it) { feed.appendChild(card(it)); });
    $("#count").textContent = list.length + " 条";
    $("#more").hidden = list.length <= F.shown;
  }
  function seg(id, key) {
    var box = $(id);
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      box.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      F[key] = b.dataset.v; F.shown = 30; renderFeed();
    });
  }
  seg("#f-range", "range"); seg("#f-lv", "lv");
  $("#f-q").addEventListener("input", function (e) { F.q = e.target.value.trim(); F.shown = 30; renderFeed(); });
  $("#more").addEventListener("click", function () { F.shown += 30; renderFeed(); });
  if (!items.some(function (i) { return i.date >= d30; })) {
    F.range = "90"; $("#f-range").querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x.dataset.v === "90" ? "true" : "false"); });
  }
  renderFeed();

  /* ---------- 图表（纯 SVG） ---------- */
  function niceMax(v) { if (v <= 5) return 5; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function fmt(n) { return n >= 10000 ? (n / 1000).toFixed(0) + "K" : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n); }
  function roundTop(x, y, w, h, r) { // 顶端 4px 圆角，底端方角
    r = Math.min(r, w / 2, h);
    return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
  }
  function frame(host, H) {
    host.textContent = "";
    var W = Math.max(280, host.clientWidth || 520);
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, role: "img" });
    host.appendChild(svg);
    return { svg: svg, W: W, H: H };
  }
  function yAxis(f, M, max, steps) {
    if (max / steps !== Math.floor(max / steps)) steps = max % 5 === 0 ? 5 : max % 2 === 0 ? 2 : 1; // 计数只用整数刻度
    for (var i = 0; i <= steps; i++) {
      var v = max / steps * i, y = f.H - M.b - (f.H - M.t - M.b) * i / steps;
      f.svg.appendChild(sv("line", { "class": i ? "gridl" : "axisl", x1: M.l, x2: f.W - M.r, y1: y, y2: y }));
      var t = sv("text", { "class": "tick", x: M.l - 6, y: y + 4, "text-anchor": "end" }); t.textContent = fmt(v); f.svg.appendChild(t);
    }
  }
  /* 单系列柱状图。data: [{label, value, partial, tipLabel}] */
  function columns(host, data, opt) {
    var f = frame(host, opt.h || 220), M = { t: 18, r: 8, b: 26, l: 36 };
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1])));
    yAxis(f, M, max, 4);
    var bw = (f.W - M.l - M.r) / data.length, w = Math.min(24, bw * 0.62);
    var every = Math.ceil(data.length / Math.floor((f.W - M.l - M.r) / 44));
    var maxI = 0; data.forEach(function (d, i) { if (d.value > data[maxI].value) maxI = i; });
    data.forEach(function (d, i) {
      var x = M.l + bw * i + (bw - w) / 2, h = (f.H - M.t - M.b) * d.value / max, y = f.H - M.b - h;
      var g = sv("g", { "class": "mark", tabindex: "0" });
      if (h > 0) {
        var p = sv("path", { d: roundTop(x, y, w, Math.max(h, 1), 4), fill: "var(" + (opt.color || "--s-img") + ")" });
        if (d.partial) { p.setAttribute("fill", "url(#hatch-" + host.id + ")"); p.setAttribute("stroke", "var(" + (opt.color || "--s-img") + ")"); p.setAttribute("stroke-width", "1"); }
        g.appendChild(p);
      }
      var hit = sv("rect", { "class": "hit", x: M.l + bw * i, y: M.t, width: bw, height: f.H - M.t - M.b });
      g.appendChild(hit);
      var rows = [[fmt(d.value) + (opt.unit || ""), "tv"], [(d.tipLabel || d.label) + (d.partial ? "（不完整）" : ""), "tl"]];
      g.addEventListener("pointermove", function (e) { tip.show(e, rows); });
      g.addEventListener("pointerleave", tip.hide);
      g.addEventListener("focus", function () { var b = hit.getBoundingClientRect(); tip.show({ clientX: b.left + b.width / 2, clientY: b.top }, rows); });
      g.addEventListener("blur", tip.hide);
      f.svg.appendChild(g);
      if (i % every === 0 || i === data.length - 1) {
        var t = sv("text", { "class": "tick", x: x + w / 2, y: f.H - M.b + 16, "text-anchor": "middle" }); t.textContent = d.label; f.svg.appendChild(t);
      }
      if (i === maxI || i === data.length - 1) {
        var v = sv("text", { "class": "vlabel", x: x + w / 2, y: y - 5, "text-anchor": "middle" }); v.textContent = fmt(d.value); f.svg.appendChild(v);
      }
    });
    var defs = sv("defs"), pat = sv("pattern", { id: "hatch-" + host.id, width: 5, height: 5, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    pat.appendChild(sv("rect", { width: 2, height: 5, fill: "var(" + (opt.color || "--s-img") + ")" }));
    defs.appendChild(pat); f.svg.insertBefore(defs, f.svg.firstChild);
  }
  /* 堆叠柱状图。series: [{name, colorVar, values[]}]，labels[] */
  function stacked(host, labels, series, opt) {
    var f = frame(host, opt.h || 220), M = { t: 14, r: 8, b: 26, l: 30 };
    var totals = labels.map(function (_, i) { return series.reduce(function (s, x) { return s + x.values[i]; }, 0); });
    var max = niceMax(Math.max.apply(null, totals.concat([1])));
    yAxis(f, M, max, 4);
    var bw = (f.W - M.l - M.r) / labels.length, w = Math.min(24, bw * 0.62), ph = f.H - M.t - M.b;
    labels.forEach(function (lab, i) {
      var x = M.l + bw * i + (bw - w) / 2, y = f.H - M.b, g = sv("g", { "class": "mark", tabindex: "0" });
      var segs = series.filter(function (s) { return s.values[i] > 0; });
      segs.forEach(function (s, k) {
        var h = ph * s.values[i] / max, top = k === segs.length - 1;
        var hh = top ? h : Math.max(h - 2, 1);   // 段与段之间留 2px 底色缝
        y -= h;
        g.appendChild(top ? sv("path", { d: roundTop(x, y, w, h, 4), fill: "var(" + s.colorVar + ")" })
          : sv("rect", { x: x, y: y + (h - hh), width: w, height: hh, fill: "var(" + s.colorVar + ")" }));
      });
      var hit = sv("rect", { "class": "hit", x: M.l + bw * i, y: M.t, width: bw, height: ph }); g.appendChild(hit);
      var rows = [[lab + " · 共 " + totals[i] + " 条", "tl"]].concat(series.map(function (s) { return { key: "var(" + s.colorVar + ")", v: String(s.values[i]), l: s.name }; }));
      g.addEventListener("pointermove", function (e) { tip.show(e, rows); });
      g.addEventListener("pointerleave", tip.hide);
      g.addEventListener("focus", function () { var b = hit.getBoundingClientRect(); tip.show({ clientX: b.left + b.width / 2, clientY: b.top }, rows); });
      g.addEventListener("blur", tip.hide);
      f.svg.appendChild(g);
      var t = sv("text", { "class": "tick", x: x + w / 2, y: f.H - M.b + 16, "text-anchor": "middle" }); t.textContent = lab.slice(2); f.svg.appendChild(t);
    });
  }
  /* 横向条形图。data: [{label, value}] */
  function hbars(host, data, opt) {
    var rowH = 30, f = frame(host, data.length * rowH + 10), M = { l: 104, r: 40 };
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    data.forEach(function (d, i) {
      var y = 4 + i * rowH, w = (f.W - M.l - M.r) * d.value / max, g = sv("g", { "class": "mark", tabindex: "0" });
      var t = sv("text", { "class": "tick", x: M.l - 8, y: y + 15, "text-anchor": "end" }); t.textContent = d.label; t.style.fontFamily = "var(--sans)"; t.style.fontSize = "12.5px"; g.appendChild(t);
      if (w > 0) g.appendChild(sv("path", { d: "M" + M.l + "," + y + "H" + (M.l + w - 4) + "Q" + (M.l + w) + "," + y + " " + (M.l + w) + "," + (y + 4) + "V" + (y + 16) + "Q" + (M.l + w) + "," + (y + 20) + " " + (M.l + w - 4) + "," + (y + 20) + "H" + M.l + "Z", fill: "var(" + (opt.color || "--s-img") + ")" }));
      var v = sv("text", { "class": "vlabel", x: M.l + w + 6, y: y + 15 }); v.textContent = d.value; g.appendChild(v);
      var hit = sv("rect", { "class": "hit", x: 0, y: y - 4, width: f.W, height: rowH }); g.appendChild(hit);
      var rows = [[d.value + " 条", "tv"], [d.label, "tl"]];
      g.addEventListener("pointermove", function (e) { tip.show(e, rows); });
      g.addEventListener("pointerleave", tip.hide);
      f.svg.appendChild(g);
    });
  }
  function table(host, head, rows) {
    host.textContent = "";
    var t = el("table", { cls: "data" }), tr = el("tr");
    head.forEach(function (h) { tr.appendChild(el("th", { text: h })); }); t.appendChild(tr);
    rows.forEach(function (r) { var row = el("tr"); r.forEach(function (c, k) { row.appendChild(el("td", { cls: k ? "n" : "", text: String(c) })); }); t.appendChild(row); });
    host.appendChild(t);
  }

  /* 图表数据 */
  var trendKeys = Object.keys(MR.trends || {});
  var tsel = $("#trend-q");
  trendKeys.forEach(function (k) { tsel.appendChild(el("option", { value: k, text: k })); });
  var regRe = /批准注册(\d+)个医疗器械产品的公告（(\d{4})年(\d{1,2})月）/;
  var reg = {};
  MR.allItems.forEach(function (i) { var m = regRe.exec(i.title); if (m) reg[m[2] + "-" + ("0" + m[3]).slice(-2)] = +m[1]; });
  var regKeys = Object.keys(reg).sort();

  var tableMode = {};
  function chartTrend() {
    var host = $("#c-trend"), q = tsel.value, s = (MR.trends || {})[q] || {};
    var ys = Object.keys(s).map(Number).filter(function (y) { return y >= 2008; }).sort();
    var thisYear = +MR.today.slice(0, 4);
    var data = ys.map(function (y) { return { label: String(y), value: s[y], partial: y === thisYear, tipLabel: y + " 年" }; });
    if (!data.length) { host.textContent = "还没有历年数据（联网运行一次雷达后出现）。"; return; }
    if (tableMode.trend) return table(host, ["年份", "文件数"], data.map(function (d) { return [d.label + (d.partial ? "（截至 " + MR.today.slice(5) + "）" : ""), d.value]; }));
    columns(host, data, { h: 240, unit: " 份" });
  }
  function chartReg() {
    var host = $("#c-reg");
    var data = regKeys.map(function (k) { return { label: k.slice(2).replace("-", "."), value: reg[k], tipLabel: k.replace("-", " 年 ") + " 月" }; });
    if (!data.length) { host.textContent = "导入药监局“医疗器械公告通告”页面后，这里会出现每月批准注册的产品数。"; return; }
    if (tableMode.reg) return table(host, ["月份", "批准注册产品数"], data.map(function (d) { return [d.tipLabel, d.value]; }));
    columns(host, data, { h: 220, unit: " 个", color: "--s-dev" });
    $("#reg-note").textContent = data.length < 6 ? "目前只有 " + data.length + " 个月的数据。导入药监局公告列表的更多页，曲线会变长。" : "";
  }
  function chartTags() {
    var host = $("#c-tags"), cnt = {};
    items.forEach(function (i) { (i.tags || []).forEach(function (t) { cnt[t] = (cnt[t] || 0) + 1; }); });
    var data = Object.keys(cnt).map(function (k) { return { label: k, value: cnt[k] }; }).sort(function (a, b) { return b.value - a.value; });
    if (!data.length) { host.textContent = "暂无数据。"; return; }
    if (tableMode.tags) return table(host, ["主题", "条数"], data.map(function (d) { return [d.label, d.value]; }));
    hbars(host, data, {});
  }
  function chartMonthly() {
    var host = $("#c-month"), months = [], d = new Date(MR.today + "T00:00:00");
    for (var k = 11; k >= 0; k--) { var x = new Date(d.getFullYear(), d.getMonth() - k, 1); months.push(x.getFullYear() + "-" + ("0" + (x.getMonth() + 1)).slice(-2)); }
    var series = LEVELS.map(function (lv) {
      return { name: lv, colorVar: LV_VAR[lv], values: months.map(function (m) { return MR.allItems.filter(function (i) { return i.level === lv && i.date.slice(0, 7) === m; }).length; }) };
    });
    if (tableMode.month) return table(host, ["月份"].concat(LEVELS), months.map(function (m, i) { return [m].concat(series.map(function (s) { return s.values[i]; })); }));
    stacked(host, months, series, { h: 220 });
  }
  function renderCharts() { chartTrend(); chartReg(); chartTags(); chartMonthly(); }
  tsel.addEventListener("change", chartTrend);
  document.querySelectorAll("[data-table]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.dataset.table; tableMode[k] = !tableMode[k];
      b.textContent = tableMode[k] ? "图表" : "表格"; b.setAttribute("aria-pressed", tableMode[k]); renderCharts();
    });
  });
  var rz; addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(renderCharts, 150); });
  renderCharts();

  /* ---------- 档案 ---------- */
  ["weekly", "monthly"].forEach(function (kind) {
    var box = $("#arch-" + kind);
    (MR.reports[kind] || []).forEach(function (r) {
      box.appendChild(el("a", { href: kind + "/" + r.label + ".html" }, [el("b", { text: r.label }), el("small", { text: r.count + " 条" })]));
    });
  });

  /* ---------- 导出：交给用户自己的 AI ---------- */
  var TASKS = [
    { id: "raw", name: "只要资料，不加指令", prompt: "" },
    { id: "sum", name: "总结这段时间的主要变化", prompt: "请阅读下面的资料，分“影像设备”“医疗器械”两部分，概括这段时间医疗器械法规与政策的主要变化，每部分不超过 5 点，并指出最值得关注的 1–2 件事。" },
    { id: "eng", name: "对医院设备科工程师有什么影响", prompt: "我是医院设备科的工程师。请根据下面的资料，说明这些文件对我的日常工作（采购、验收、维护、质控、报废）可能有什么影响，列出需要注意或需要行动的事项，按紧急程度排序。" },
    { id: "ent", name: "对医疗器械企业有什么影响", prompt: "请从医疗器械企业（注册、生产质量、售后服务、销售）的角度，分析下面的资料带来的影响和机会，给出具体建议。" },
    { id: "rep", name: "写一份调研报告大纲", prompt: "请基于下面的资料，写一份关于近期医疗器械（重点是医学影像设备）法规与政策的调研报告大纲：背景、主要政策梳理、趋势判断、对相关方的建议。资料不足的地方请标注“需进一步调研”。" },
    { id: "exam", name: "出几道面试 / 考试题", prompt: "请根据下面的资料，出 5 道适合医疗器械相关专业学生面试或考试的问题，每题附答案要点和对应的资料编号。" },
    { id: "plain", name: "用大白话讲给外行听", prompt: "请用通俗易懂的话，把下面资料里最重要的几件事讲给一个不懂医疗器械行业的人听，避免专业术语，每件事两三句话。" }
  ];
  var RULES = "使用说明：以下资料来自 MedReg Radar 从公开渠道整理的政府文件（标题、日期、来源、摘要片段与原文链接），非官方发布。请只根据这些资料回答；引用时标注资料编号，如 [3]；资料中没有的内容请说明“资料中未提及”，不要编造；最后提醒以官方原文为准。";
  var tsk = $("#ex-task");
  TASKS.forEach(function (t) { tsk.appendChild(el("option", { value: t.id, text: t.name })); });
  tsk.value = "sum";
  function scopeText() {
    var parts = [F.range === "all" ? "全部时间" : "近 " + F.range + " 天", F.lv === "全部" ? "全部分级" : F.lv];
    if (F.q) parts.push("关键词“" + F.q + "”");
    return parts.join(" · ");
  }
  function updateScope() { $("#ex-scope").textContent = "将导出 " + filtered().length + " 条（" + scopeText() + "）"; }
  function toMarkdown() {
    var list = filtered(), task = TASKS.filter(function (t) { return t.id === tsk.value; })[0];
    var out = [];
    if (task.prompt) out.push(task.prompt, "");
    out.push("# 资料：MedReg Radar 导出", "", "范围：" + scopeText() + "；共 " + list.length + " 条；数据日期 " + MR.today + "。", "", RULES, "");
    list.forEach(function (it, k) {
      out.push("[" + (k + 1) + "] " + it.title);
      out.push("- 日期：" + it.date + "｜来源：" + it.source + (it.doc_no ? "｜文号：" + it.doc_no : "") + "｜分级：" + it.level + (it.tags && it.tags.length ? "｜主题：" + it.tags.join("、") : ""));
      out.push("- 原文：" + it.url);
      if (it.summary) out.push("- 摘要：" + it.summary);
      out.push("");
    });
    return { text: out.join("\n"), n: list.length };
  }
  function toCSV() {
    var head = ["编号", "日期", "分级", "标题", "来源", "文号", "主题", "原文链接", "摘要"];
    var q = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = [head.join(",")];
    filtered().forEach(function (it, k) {
      rows.push([k + 1, it.date, it.level, it.title, it.source, it.doc_no || "", (it.tags || []).join("、"), it.url, it.summary || ""].map(q).join(","));
    });
    return "\ufeff" + rows.join("\r\n");   // 带 BOM，Excel 打开不乱码
  }
  function fname(ext) { return "medreg-radar-" + MR.today + "." + ext; }
  function flash(msg) { var s = $("#ex-msg"); s.textContent = msg; clearTimeout(flash.t); flash.t = setTimeout(function () { s.textContent = ""; }, 4000); }
  var native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor.Plugins : null;
  async function nativeShare(name, data, title) {   // 安卓安装包里：先存成文件，再调系统分享
    var w = await native.Filesystem.writeFile({ path: name, data: data, directory: "CACHE", encoding: "utf8" });
    await native.Share.share({ title: title, url: w.uri, dialogTitle: title });
  }
  $("#ex-copy").addEventListener("click", async function () {
    var md = toMarkdown();
    try { await navigator.clipboard.writeText(md.text); }
    catch (e) { var ta = el("textarea"); ta.value = md.text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
    flash("已复制 " + md.n + " 条。打开豆包、DeepSeek、Kimi 等，粘贴发送即可。");
  });
  $("#ex-share").addEventListener("click", async function () {
    var md = toMarkdown();
    try {
      if (native && native.Share) { await nativeShare(fname("md"), md.text, "MedReg Radar 导出"); return; }
      var file = new File([md.text], fname("md"), { type: "text/markdown" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "MedReg Radar 导出" });
      else await navigator.share({ title: "MedReg Radar 导出", text: md.text });
    } catch (e) { if (e && e.name !== "AbortError") flash("这里不支持分享，换成“复制给 AI”吧。"); }
  });
  function download(name, text, type) {
    if (native && native.Share) { nativeShare(name, text, "保存或发送 " + name).catch(function () {}); return; }
    var a = el("a", { href: URL.createObjectURL(new Blob([text], { type: type })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    flash("已下载 " + name + "。");
  }
  $("#ex-md").addEventListener("click", function () { download(fname("md"), toMarkdown().text, "text/markdown;charset=utf-8"); });
  $("#ex-csv").addEventListener("click", function () { download(fname("csv"), toCSV(), "text/csv;charset=utf-8"); });
  if (!navigator.share && !native) $("#ex-share").hidden = true;
  var _render = renderFeed;
  renderFeed = function () { _render(); updateScope(); };
  updateScope();
})();
