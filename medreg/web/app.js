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
    if (it.ai_summary) {
      inner.appendChild(el("p", { cls: "ai" }, [el("span", { cls: "tag", text: it.ai_title_only ? "AI 解读 · 仅据标题" : "AI 解读" }), it.ai_summary]));
    } else if (it.summary && it.level !== "背景") {
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
      if (F.q) { var t = i.title + (i.summary || "") + (i.ai_summary || "") + (i.doc_no || ""); if (t.indexOf(F.q) < 0) return false; }
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

  /* ---------- AI 问答 ---------- */
  var drawer = $("#drawer"), modal = $("#keymodal"), chat = $("#chat"), history = [];
  function openDrawer() { drawer.classList.add("open"); drawer.setAttribute("aria-hidden", "false"); if (!store.get("mr_key")) openModal(); else $("#ask").focus(); }
  function closeDrawer() { drawer.classList.remove("open"); drawer.setAttribute("aria-hidden", "true"); }
  function openModal() { modal.classList.add("open"); $("#keyinput").value = ""; $("#keyinput").focus(); }
  function closeModal() { modal.classList.remove("open"); }
  document.querySelectorAll("[data-open-ai]").forEach(function (b) { b.addEventListener("click", openDrawer); });
  $("#close-ai").addEventListener("click", closeDrawer);
  $("#key-cancel").addEventListener("click", closeModal);
  $("#key-save").addEventListener("click", function () {
    var k = $("#keyinput").value.trim();
    if (!/^sk-[A-Za-z0-9]{10,}/.test(k)) { $("#key-err").textContent = "看起来不像 DeepSeek 的 key（应以 sk- 开头）。"; return; }
    store.set("mr_key", k); $("#key-err").textContent = ""; closeModal(); updateKeybar(); $("#ask").focus();
  });
  $("#key-clear").addEventListener("click", function () { store.del("mr_key"); updateKeybar(); openModal(); });
  $("#key-change").addEventListener("click", openModal);
  function updateKeybar() { $("#keystate").textContent = store.get("mr_key") ? "已填 key（只存在这个浏览器里）" : "还没有填 key"; }
  updateKeybar();
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (modal.classList.contains("open")) closeModal(); else closeDrawer(); } });

  function grams(q) {
    var out = [], latin = q.match(/[A-Za-z0-9]{2,}/g) || [];
    var zh = q.replace(/[^一-龥]/g, "");
    for (var i = 0; i < zh.length - 1; i++) out.push(zh.slice(i, i + 2));
    var stop = /^(什么|一下|哪些|怎么|有没|没有|这个|那个|帮我|告诉|整理|最近|本月|本周|相关|关于|的|了)$/;
    return out.filter(function (g) { return !stop.test(g); }).concat(latin.map(function (s) { return s.toUpperCase(); }));
  }
  function retrieve(q) {
    var pool = items, now = MR.today;
    if (/本月|这个月/.test(q)) pool = items.filter(function (i) { return i.date.slice(0, 7) === now.slice(0, 7); });
    else if (/本周|这周|这一周/.test(q)) pool = items.filter(function (i) { return i.date >= daysAgo(7); });
    else if (/最近|近期|新出/.test(q)) pool = items.filter(function (i) { return i.date >= daysAgo(45); });
    if (/影像|CT|MR|磁共振|超声|放射|DR|DSA/i.test(q)) pool = pool.filter(function (i) { return i.level !== "背景"; });
    var gs = grams(q);
    var scored = pool.map(function (i) {
      var t = i.title.toUpperCase(), b = ((i.summary || "") + (i.ai_summary || "")).toUpperCase(), s = 0;
      gs.forEach(function (g) { if (t.indexOf(g) > -1) s += 3; if (b.indexOf(g) > -1) s += 1; });
      if (i.level === "影像设备") s += 0.5;
      return { i: i, s: s };
    }).sort(function (a, b) { return b.s - a.s || (a.i.date < b.i.date ? 1 : -1); });
    var hits = scored.filter(function (x) { return x.s >= 1; });
    return (hits.length >= 3 ? hits : scored).slice(0, 24).map(function (x) { return x.i; });
  }
  var SYS = "你是“MedReg Radar”的法规助手，帮助医疗器械（尤其医学影像设备）从业者理解政策和法规动态。" +
    "只能根据用户消息里给出的【资料】回答，资料里没有的内容就明确说“资料里没有”，不要编造文件、条款或数字。" +
    "每一句引用资料的话，在句末用 [编号] 标出来源，例如 [3]。回答用中文，先给结论，再分点，简洁。" +
    "最后一行提醒：以官方原文为准。";
  function context(list) {
    return list.map(function (it, k) {
      return "[" + (k + 1) + "] " + it.title + "（" + it.date + "，" + it.source + (it.doc_no ? "，" + it.doc_no : "") + "，分级：" + it.level + "）" +
        (it.ai_summary ? "\n解读：" + it.ai_summary : "") + (it.summary ? "\n摘要：" + it.summary.slice(0, 220) : "");
    }).join("\n\n");
  }
  function addMsg(who, text) {
    var txt = el("div", { cls: "txt", text: text || "" });
    var m = el("div", { cls: "msg " + who }, [el("div", { cls: "who", text: who === "user" ? "你" : "MEDREG · AI" }), txt]);
    chat.appendChild(m); chat.scrollTop = chat.scrollHeight;
    return { m: m, txt: txt };
  }
  function finalize(node, text, refs) {
    node.txt.textContent = "";
    var used = {}, re = /\[(\d{1,2})\]/g, last = 0, m;
    while ((m = re.exec(text))) {
      node.txt.appendChild(document.createTextNode(text.slice(last, m.index)));
      var n = +m[1], it = refs[n - 1];
      if (it) { used[n] = it; node.txt.appendChild(el("a", { cls: "cite", href: it.url, target: "_blank", rel: "noopener", title: it.title, text: "[" + n + "]" })); }
      else node.txt.appendChild(document.createTextNode(m[0]));
      last = re.lastIndex;
    }
    node.txt.appendChild(document.createTextNode(text.slice(last)));
    var ks = Object.keys(used);
    if (ks.length) {
      var box = el("div", { cls: "refs" }, [el("div", { text: "出处" })]);
      ks.forEach(function (k) { box.appendChild(el("div", {}, ["[" + k + "] ", el("a", { href: used[k].url, target: "_blank", rel: "noopener", text: used[k].title })])); });
      node.m.appendChild(box);
    }
  }
  async function ask(q) {
    var key = store.get("mr_key");
    if (!key) { openModal(); return; }
    addMsg("user", q);
    var refs = retrieve(q), node = addMsg("ai", "正在翻资料……");
    var msgs = [{ role: "system", content: SYS }].concat(history.slice(-4)).concat([{ role: "user", content: "【资料】\n" + context(refs) + "\n\n【问题】" + q }]);
    $("#send").disabled = true;
    var text = "";
    try {
      var res = await fetch(MR.ai.base_url.replace(/\/$/, "") + "/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
        body: JSON.stringify({ model: MR.ai.model, messages: msgs, stream: true, temperature: 0.3 })
      });
      if (!res.ok) {
        var why = res.status === 401 ? "key 不对或已失效，点下方“换一个”重新填。" : res.status === 402 ? "账户余额不足，去 DeepSeek 后台充值后再试。" :
          res.status === 429 ? "请求太频繁，等一会儿再试。" : "请求失败（" + res.status + "）。";
        node.txt.textContent = why; return;
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
      node.txt.textContent = "";
      while (true) {
        var r = await reader.read(); if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        var lines = buf.split("\n"); buf = lines.pop();
        lines.forEach(function (ln) {
          ln = ln.trim(); if (ln.indexOf("data:") !== 0) return;
          var p = ln.slice(5).trim(); if (p === "[DONE]") return;
          try { var d = JSON.parse(p).choices[0].delta.content; if (d) { text += d; node.txt.textContent = text; chat.scrollTop = chat.scrollHeight; } } catch (e) {}
        });
      }
      finalize(node, text, refs);
      history.push({ role: "user", content: q }, { role: "assistant", content: text });
    } catch (e) {
      node.txt.textContent = "连不上 AI 服务。检查一下网络；如果在学校或公司网络里，可能被拦了。";
    } finally { $("#send").disabled = false; }
  }
  $("#askform").addEventListener("submit", function (e) { e.preventDefault(); var q = $("#ask").value.trim(); if (!q) return; $("#ask").value = ""; ask(q); });
  $("#ask").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#askform").requestSubmit(); } });
  document.querySelectorAll("#presets button").forEach(function (b) { b.addEventListener("click", function () { ask(b.textContent); }); });
})();
