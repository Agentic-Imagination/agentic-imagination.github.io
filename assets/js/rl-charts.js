/* Agima project page: animated RL charts (paper Figures 4b-c and 6a-d).
   Draws a responsive SVG line chart into every <div class="rl-chart" data-chart="KEY">
   (KEY = fig4b, fig4c, fig6a, fig6b, fig6c or fig6d). The lines draw in from RL step 0 to 200
   when the chart scrolls into view (at once with prefers-reduced-motion). Hover, tap or focus
   + arrow keys shows the values at a step. Plain ES5, no dependencies.
   The values were read off the paper figures (assets/images/fig4_rl_curves.webp and
   fig6_adaptive_reasoning.webp) by locating each marker against the axis ticks, so they are
   approximate: they are shown as whole percentages (one decimal for branches per episode).
   tools/teaser/make_teaser_v3.py (EM_HYBRID) uses the same Fig. 6b values. */
(function () {
  "use strict";
  if (typeof window === "undefined" || !document.createElementNS) return;

  var NS = "http://www.w3.org/2000/svg";
  var STEPS = [0, 50, 100, 150, 200];
  var LAST = STEPS[STEPS.length - 1];
  var DURATION = 1900;           // ms for the full 0 -> 200 draw
  var START_DELAY = 350;         // lets the card's scroll-reveal settle first
  var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(reduceMQ && reduceMQ.matches); }

  /* ---------------- data ---------------- */
  // Paper colours, darkened where needed for >= 3:1 against the page's off-white and so the
  // series that share a chart stay apart under colour-vision deficiency.
  var MODELS = {
    base:  {name: "Agima-A7B",              short: "Agima-A7B",  color: "#464542"},  // paper #6f6f6f
    fwd:   {name: "Agima-A7B (Forward)",    short: "Forward",    color: "#ab7900"},  // paper #d49600
    br:    {name: "Agima-A7B (Branching)",  short: "Branching",  color: "#00659e"},  // paper #0072b2
    noimg: {name: "Agima-A7B (No Imagine)", short: "No Imagine", color: "#9973ca"}   // paper #8a68b6
  };

  var CHARTS = {
    fig4b: {
      title: "Deadlock-set accuracy", yLabel: "Accuracy (%)", source: "Figure 4b",
      domain: [0, 50], ticks: [0, 10, 20, 30, 40, 50], dec: 0, unit: "%",
      summary: "Held-out accuracy rises over 200 RL steps for Agima-A7B and Agima-A7B (Forward), on 3- and 4-box puzzles; the No Imagine model stays below 10%.",
      series: [
        {m: "base", boxes: 3, v: [39, 41, 42, 43, 44]},
        {m: "fwd", boxes: 3, v: [38, 42, 43, 48, 45]},
        {m: "noimg", boxes: 3, v: [5, 5, 6, 4, 8]},
        {m: "base", boxes: 4, v: [27, 33, 34, 34, 38]},
        {m: "fwd", boxes: 4, v: [25, 27, 33, 35, 40]},
        {m: "noimg", boxes: 4, v: [1, 1, 0, 0, 1]}
      ]
    },
    fig4c: {
      title: "Fork-set accuracy", yLabel: "Accuracy (%)", source: "Figure 4c",
      domain: [0, 50], ticks: [0, 10, 20, 30, 40, 50], dec: 0, unit: "%",
      summary: "Held-out accuracy rises over 200 RL steps; Agima-A7B (Branching) reaches 50% on 3-box and 45% on 4-box puzzles; the No Imagine model stays below 5%.",
      series: [
        {m: "base", boxes: 3, v: [34, 37, 43, 45, 44]},
        {m: "br", boxes: 3, v: [33, 36, 44, 46, 50]},
        {m: "noimg", boxes: 3, v: [2, 2, 1, 4, 3]},
        {m: "base", boxes: 4, v: [22, 24, 30, 31, 35]},
        {m: "br", boxes: 4, v: [22, 25, 34, 40, 45]},
        {m: "noimg", boxes: 4, v: [1, 1, 2, 2, 2]}
      ]
    },
    fig6a: {
      title: "Failure-triggered lookahead", sub: "Agima-A7B (Forward), deadlock set, episodes with a second plan", source: "Figure 6a",
      yLabel: "First plan predicted to fail (%)",
      domain: [0, 100], ticks: [0, 25, 50, 75, 100], dec: 0, unit: "%",
      summary: "Among episodes with a second plan, the share whose first plan was predicted to fail: about 32% (3 boxes) and 55% (4 boxes) at step 0, 100% from step 100 on.",
      series: [
        {m: "fwd", boxes: 3, v: [31.7, 33.9, 100, 100, 100]},
        {m: "fwd", boxes: 4, v: [55.4, 63, 100, 100, 100]}
      ]
    },
    fig6b: {
      title: "Unified format", sub: "Agima-A7B (Forward), deadlock set", source: "Figure 6b",
      yLabel: "Episodes in the unified format (%)",
      domain: [0, 100], ticks: [0, 25, 50, 75, 100], dec: 0, unit: "%",
      summary: "Share of episodes in the unified (hybrid) format: about 5% at step 0, 100% from step 100 on, for 3 and 4 boxes.",
      series: [
        {m: "fwd", boxes: 3, v: [4.9, 10.5, 100, 100, 100]},
        {m: "fwd", boxes: 4, v: [5.3, 25, 100, 100, 100]}
      ]
    },
    fig6c: {
      title: "Branches per episode", sub: "Agima-A7B (Branching), fork set", source: "Figure 6c",
      yLabel: "Mean branches per episode",
      domain: [1.8, 2.5], ticks: [1.8, 2.0, 2.2, 2.4], tickDec: 1, dec: 1, unit: "",
      summary: "Mean branches per episode rise from about 2.1 to 2.3 (3 boxes) and from 1.9 to 2.2 (4 boxes), peaking at step 150.",
      series: [
        {m: "br", boxes: 3, v: [2.08, 2.14, 2.23, 2.43, 2.30]},
        {m: "br", boxes: 4, v: [1.88, 2.00, 2.04, 2.25, 2.24]}
      ]
    },
    fig6d: {
      title: "Critical-step alignment", sub: "Agima-A7B (Branching), fork set", source: "Figure 6d",
      yLabel: "P(critical step | branch) (%)",
      domain: [40, 80], ticks: [40, 50, 60, 70, 80], dec: 0, unit: "%",
      summary: "Share of branches placed at a critical step rises from about 63% to 73% (3 boxes) and from 42% to 56% (4 boxes).",
      series: [
        {m: "br", boxes: 3, v: [63, 62.1, 68.2, 66.7, 72.6]},
        {m: "br", boxes: 4, v: [41.5, 47.5, 52.5, 56.4, 56.2]}
      ]
    }
  };

  /* ---------------- styles (scoped to .rl-chart; page tokens with fallbacks) ---------------- */
  var CSS = [
    ".rl-chart{--rlc-ink:var(--ink,#161618);--rlc-text2:var(--text-2,#5C5A54);--rlc-line:var(--line,#E0DCD2);--rlc-line-strong:var(--line-strong,#C9C4B8);",
    "position:relative;color:var(--rlc-ink);font-family:var(--sans,\"Inter\",system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif);line-height:1.4}",
    ".rlc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}",
    ".rlc-title{margin:0;font-family:var(--serif,Georgia,\"Times New Roman\",serif);font-size:1.3rem;font-weight:600;line-height:1.15}",
    ".rlc-sub{margin:3px 0 0;color:var(--rlc-text2);font-size:.78rem;line-height:1.35}",
    ".rlc-legend{display:flex;flex-wrap:wrap;gap:4px 14px;margin:10px 0 8px;padding:0;list-style:none;color:var(--rlc-text2);font-size:.75rem;line-height:1.3}",
    ".rlc-legend li{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}",
    ".rlc-legend li.rlc-size{color:var(--rlc-text2)}",
    ".rlc-key{flex:none;overflow:visible}",
    ".rlc-plot{position:relative}",
    ".rlc-svg{display:block;width:100%;height:auto;overflow:visible;touch-action:pan-y;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}",
    ".rlc-svg:focus{outline:none}",
    ".rlc-svg:focus-visible{outline:2px solid var(--blue,#2660E0);outline-offset:3px;border-radius:6px}",
    ".rlc-svg text{fill:var(--rlc-text2);font-size:11px;font-variant-numeric:lining-nums tabular-nums}",
    ".rlc-svg .rlc-end{fill:var(--rlc-ink);font-size:11.5px;font-weight:600}",
    ".rlc-grid{stroke:var(--rlc-line);stroke-width:1;shape-rendering:crispEdges}",
    ".rlc-base,.rlc-xt{stroke:var(--rlc-line-strong);stroke-width:1;shape-rendering:crispEdges}",
    ".rlc-cross{stroke:var(--rlc-ink);stroke-opacity:.28;stroke-width:1;shape-rendering:crispEdges}",
    ".rlc-line{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
    ".rlc-fade{opacity:0;transition:opacity .3s ease}",
    ".rlc-fade.is-on{opacity:1}",
    ".rlc-pt{transform-box:fill-box;transform-origin:center;transform:scale(0);transition:transform .34s cubic-bezier(.2,.8,.3,1.45)}",
    ".rlc-pt.is-on{transform:scale(1)}",
    ".rlc-tip{position:absolute;left:0;top:0;z-index:5;padding:8px 10px 7px;border:1px solid var(--rlc-line);border-radius:10px;background:#fff;",
    "box-shadow:0 14px 30px -16px rgba(22,22,24,.5);color:var(--rlc-ink);font-size:.75rem;line-height:1.35;white-space:nowrap;pointer-events:none}",
    ".rlc-tip[hidden],.rlc-replay[hidden]{display:none}",
    ".rlc-tip-h{margin:0 0 3px;color:var(--rlc-text2);font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase}",
    ".rlc-tip-g{margin:5px 0 1px;color:var(--rlc-text2);font-size:.68rem}",
    ".rlc-tip-r{display:flex;align-items:center;gap:7px;padding:1px 0}",
    ".rlc-tip-r b{min-width:2.4em;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}",
    ".rlc-tip-r span{color:var(--rlc-text2)}",
    ".rlc-replay{flex:none;display:inline-grid;place-items:center;width:28px;height:28px;margin:-2px -2px 0 0;padding:0;border:1px solid var(--rlc-line);",
    "border-radius:999px;background:transparent;color:var(--rlc-text2);cursor:pointer;transition:color .15s ease,border-color .15s ease}",
    ".rlc-replay:hover{color:var(--rlc-ink);border-color:var(--rlc-ink)}",
    ".rlc-replay:focus-visible{outline:2px solid var(--blue,#2660E0);outline-offset:2px}",
    ".rlc-replay svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
    ".rlc-sr{position:absolute!important;width:1px;height:1px;margin:0;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}",
    "@media (prefers-reduced-motion:reduce){.rlc-pt,.rlc-fade{transition:none}}",
    "@media (forced-colors:active){.rlc-line{stroke:CanvasText}.rlc-pt{fill:Canvas;stroke:CanvasText}}"
  ].join("\n");

  function injectCSS() {
    if (document.getElementById("rl-charts-css")) return;
    var s = document.createElement("style");
    s.id = "rl-charts-css";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------------- helpers ---------------- */
  function sv(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function hx(tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function fmt(cfg, v) {
    var s = v.toFixed(cfg.dec);
    return cfg.trim ? s.replace(/\.0+$/, "") : s;
  }
  function fmtTick(cfg, v) { return v.toFixed(cfg.tickDec || 0); }
  // rough advance widths (em) for Inter / system sans at chart sizes; only used for margins
  function textW(s, size) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      w += (c === "." ? 0.3 : c === "%" ? 0.85 : /[0-9]/.test(c) ? 0.62 : 0.56);
    }
    return w * size;
  }
  function seriesLabel(cfg, s) {
    var multi = modelsOf(cfg).length > 1;
    return (multi ? MODELS[s.m].name + ", " : "") + s.boxes + " boxes";
  }
  function modelsOf(cfg) {
    var out = [];
    cfg.series.forEach(function (s) { if (out.indexOf(s.m) < 0) out.push(s.m); });
    return out;
  }
  // first opaque background behind the chart (hollow markers and marker rings use it)
  function surfaceOf(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var c = window.getComputedStyle(n).backgroundColor;
      if (c && c !== "transparent" && !/rgba\([^)]*,\s*0\s*\)$/.test(c)) return c;
    }
    return "#ffffff";
  }
  // line key: a short stroke (dashed for 4 boxes) with the marker in the middle
  function lineKey(parent, color, boxes, surface, w) {
    w = w || 26;
    var k = sv("svg", {"class": "rlc-key", width: w, height: 10, viewBox: "0 0 " + w + " 10", "aria-hidden": "true", focusable: "false"}, parent);
    var ln = sv("line", {x1: 1, y1: 5, x2: w - 1, y2: 5, stroke: color, "stroke-width": 2, "stroke-linecap": "round"}, k);
    if (boxes === 4) ln.setAttribute("stroke-dasharray", "4 3");
    sv("circle", boxes === 4 ?
      {cx: w / 2, cy: 5, r: 3, fill: surface || "#fff", stroke: color, "stroke-width": 1.6} :
      {cx: w / 2, cy: 5, r: 3.4, fill: color}, k);
    return k;
  }

  /* ---------------- chart ---------------- */
  function Chart(el, key) {
    var cfg = CHARTS[key], self = this;
    this.el = el; this.key = key; this.cfg = cfg;
    this.p = 0; this.state = "idle"; this.hot = -1; this.W = 0; this.raf = 0; this.timer = 0;
    // draw order: dashed (4 boxes) under solid (3 boxes)
    this.series = cfg.series.slice().sort(function (a, b) { return b.boxes - a.boxes; });
    this.multi = modelsOf(cfg).length > 1;

    el.textContent = "";
    el.classList.add("rlc");
    var surface = surfaceOf(el);

    var head = hx("div", "rlc-head", el);
    var htext = hx("div", "rlc-htext", head);
    hx("p", "rlc-title", htext, cfg.title);
    if (cfg.sub) hx("p", "rlc-sub", htext, cfg.sub);
    var rb = hx("button", "rlc-replay", head);
    rb.type = "button";
    rb.setAttribute("aria-label", "Replay the " + cfg.title.toLowerCase() + " animation");
    rb.title = "Replay";
    rb.hidden = true;
    var ic = sv("svg", {viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false"}, rb);
    sv("path", {d: "M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"}, ic);
    rb.addEventListener("click", function () { self.replay(); });
    this.replayBtn = rb;

    // legend: models (multi-model charts), then the 3 / 4 boxes line styles
    var lg = hx("ul", "rlc-legend", el);
    lg.setAttribute("aria-label", "Legend");
    var neutral = "#5C5A54", single = this.multi ? null : MODELS[cfg.series[0].m].color;
    if (this.multi) {
      modelsOf(cfg).forEach(function (m) {
        var li = hx("li", null, lg);
        var k = sv("svg", {"class": "rlc-key", width: 16, height: 10, viewBox: "0 0 16 10", "aria-hidden": "true", focusable: "false"}, li);
        sv("line", {x1: 1, y1: 5, x2: 15, y2: 5, stroke: MODELS[m].color, "stroke-width": 2.5, "stroke-linecap": "round"}, k);
        hx("span", null, li, MODELS[m].short);
        li.title = MODELS[m].name;
      });
    }
    [3, 4].forEach(function (b) {
      var li = hx("li", "rlc-size", lg);
      lineKey(li, single || neutral, b, surface);
      hx("span", null, li, b + " boxes");
    });

    this.plot = hx("div", "rlc-plot", el);
    this.svg = sv("svg", {"class": "rlc-svg", role: "img", tabindex: "0", focusable: "true"}, this.plot);
    this.svg.setAttribute("aria-label", cfg.title + (cfg.sub ? ", " + cfg.sub : "") + ", by RL step. " + cfg.summary +
      " Use the left and right arrow keys to read the values at each step.");
    this.tip = hx("div", "rlc-tip", this.plot);
    this.tip.hidden = true;
    this.tip.setAttribute("aria-hidden", "true");
    this.live = hx("p", "rlc-sr", el);
    this.live.setAttribute("aria-live", "polite");
    this.buildTable();

    // pointer: hover (mouse / pen) or tap (touch) snaps to the nearest RL step
    var svgEl = this.svg;
    svgEl.addEventListener("pointermove", function (e) { if (e.pointerType !== "touch" || self.touching) self.setHot(self.stepAt(e)); });
    svgEl.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch") self.touching = true;
      self.setHot(self.stepAt(e));
    });
    svgEl.addEventListener("pointerup", function () { self.touching = false; });
    svgEl.addEventListener("pointercancel", function () { self.touching = false; self.setHot(-1); });
    svgEl.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch") self.setHot(-1); });
    // keyboard
    svgEl.addEventListener("focus", function () { if (self.hot < 0) self.setHot(STEPS.length - 1, true); });
    svgEl.addEventListener("blur", function () { self.setHot(-1); });
    svgEl.addEventListener("keydown", function (e) {
      var k = e.key, i = self.hot < 0 ? STEPS.length - 1 : self.hot;
      if (k === "ArrowRight") i = Math.min(STEPS.length - 1, i + 1);
      else if (k === "ArrowLeft") i = Math.max(0, i - 1);
      else if (k === "Home") i = 0;
      else if (k === "End") i = STEPS.length - 1;
      else if (k === "Escape") { self.setHot(-1); return; }
      else return;
      e.preventDefault();
      self.setHot(i, true);
    });

    this.layout();
  }

  Chart.prototype.buildTable = function () {
    var cfg = this.cfg;
    // the clipping box is a div: width and overflow do not apply to a table box, so a nowrap table
    // given the class itself would widen the page
    var t = hx("table", null, hx("div", "rlc-sr", this.el));
    hx("caption", null, t, cfg.title + (cfg.sub ? ", " + cfg.sub : "") + " (approximate values read off " + cfg.source + " of the paper)");
    var tr = hx("tr", null, hx("thead", null, t));
    hx("th", null, tr, "RL step").setAttribute("scope", "col");
    cfg.series.forEach(function (s) { hx("th", null, tr, seriesLabel(cfg, s) + (cfg.unit ? " (" + cfg.unit + ")" : "")).setAttribute("scope", "col"); });
    var tb = hx("tbody", null, t);
    STEPS.forEach(function (st, k) {
      var r = hx("tr", null, tb);
      hx("th", null, r, String(st)).setAttribute("scope", "row");
      cfg.series.forEach(function (s) { hx("td", null, r, fmt(cfg, s.v[k])); });
    });
  };

  Chart.prototype.layout = function () {
    var W = Math.round(this.plot.clientWidth || this.el.clientWidth || 0);
    if (!W) W = 480;
    W = Math.max(220, W);
    if (W === this.W) return;
    this.W = W;
    var cfg = this.cfg, self = this, svg = this.svg;
    var H = Math.round(clamp(W * 0.62, 230, 310));
    this.H = H;
    var surface = this.surface = surfaceOf(this.el);

    // margins: y tick labels on the left, end-of-line value labels on the right
    var tickW = 0, endW = 0;
    cfg.ticks.forEach(function (t) { tickW = Math.max(tickW, textW(fmtTick(cfg, t), 11)); });
    cfg.series.forEach(function (s) { endW = Math.max(endW, textW(fmt(cfg, s.v[s.v.length - 1]), 11.5)); });
    var m = {t: 28, l: Math.ceil(tickW) + 9, r: Math.ceil(endW) + 19, b: 40};
    var x0 = m.l, x1 = W - m.r, y0 = m.t, y1 = H - m.b;
    var dx0 = x0 + 10, dx1 = x1 - 4, d0 = cfg.domain[0], d1 = cfg.domain[1];
    this.g = {x0: x0, x1: x1, y0: y0, y1: y1};
    this.sx = function (st) { return dx0 + st / LAST * (dx1 - dx0); };
    this.sy = function (v) { return y1 - (v - d0) / (d1 - d0) * (y1 - y0 - 6); };
    var sx = this.sx, sy = this.sy;

    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var e = this.els = {lines: [], heads: [], pts: [], ticks: []};
    // y axis label (top left) and grid
    sv("text", {x: 0, y: 11}, svg).textContent = cfg.yLabel;
    var grid = sv("g", {"aria-hidden": "true"}, svg);
    cfg.ticks.forEach(function (t) {
      var y = Math.round(sy(t)) + 0.5;
      if (t !== d0) sv("line", {"class": "rlc-grid", x1: x0, x2: x1, y1: y, y2: y}, grid);
      sv("text", {x: x0 - 6, y: y + 3.8, "text-anchor": "end"}, grid).textContent = fmtTick(cfg, t);
    });
    // x axis (drawn with the lines)
    var by = Math.round(sy(d0)) + 0.5;
    e.base = sv("line", {"class": "rlc-base", x1: x0, x2: x0, y1: by, y2: by}, grid);
    STEPS.forEach(function (st) {
      var gx = sv("g", {"class": "rlc-fade"}, grid), x = Math.round(sx(st)) + 0.5;
      sv("line", {"class": "rlc-xt", x1: x, x2: x, y1: by, y2: by + 4}, gx);
      sv("text", {x: x, y: by + 17, "text-anchor": "middle"}, gx).textContent = String(st);
      e.ticks.push(gx);
    });
    sv("text", {x: (dx0 + dx1) / 2, y: H - 4, "text-anchor": "middle"}, grid).textContent = "RL step";

    // hover crosshair (under the data)
    e.cross = sv("line", {"class": "rlc-cross", x1: 0, x2: 0, y1: y0 - 4, y2: by, visibility: "hidden"}, svg);

    // lines + leading dots
    var lines = sv("g", {"aria-hidden": "true"}, svg);
    this.series.forEach(function (s) {
      var c = MODELS[s.m].color;
      var p = sv("path", {"class": "rlc-line", d: "", stroke: c}, lines);
      if (s.boxes === 4) p.setAttribute("stroke-dasharray", "5 4");
      e.lines.push(p);
    });
    // markers: filled = 3 boxes, hollow = 4 boxes (hollow on top, like the paper)
    var marks = sv("g", {"aria-hidden": "true"}, svg);
    var order = this.series.map(function (s, i) { return i; }).sort(function (a, b) { return self.series[a].boxes - self.series[b].boxes; });
    var ptsByIdx = [];
    order.forEach(function (i) {
      var s = self.series[i], c = MODELS[s.m].color, row = [];
      STEPS.forEach(function (st, k) {
        var x = sx(st), y = sy(s.v[k]), pt;
        if (s.boxes === 3) {
          pt = sv("circle", {"class": "rlc-pt", cx: x, cy: y, r: 4, fill: c, stroke: surface, "stroke-width": 3, "paint-order": "stroke"}, marks);
          pt._r = 4;
        } else {
          // a 4-box point sitting on a 3-box point of the same model becomes a ring around it
          var twin = self.series.some(function (o) { return o.m === s.m && o.boxes === 3 && Math.abs(sy(o.v[k]) - y) < 2; });
          pt = sv("circle", {"class": "rlc-pt", cx: x, cy: y, r: twin ? 7 : 3.75, fill: twin ? "none" : surface, stroke: c, "stroke-width": 2}, marks);
          pt._r = twin ? 7 : 3.75;
        }
        row.push(pt);
      });
      ptsByIdx[i] = row;
    });
    e.pts = ptsByIdx;
    var heads = sv("g", {"aria-hidden": "true"}, svg);
    this.series.forEach(function (s) {
      e.heads.push(sv("circle", {r: 3.5, fill: MODELS[s.m].color, stroke: surface, "stroke-width": 3, "paint-order": "stroke", visibility: "hidden"}, heads));
    });

    // end-of-line value labels, spread so they never overlap, each tied to its line end by a leader
    e.ends = sv("g", {"class": "rlc-fade", "aria-hidden": "true"}, svg);
    var xe = sx(LAST), items = [];
    this.series.forEach(function (s) {
      var v = s.v[s.v.length - 1], txt = fmt(cfg, v), y = sy(v), hit = null;
      items.forEach(function (it) { if (it.text === txt && Math.abs(it.want - y) < 3) hit = it; });
      if (hit) hit.members.push(s);
      else items.push({text: txt, want: y, members: [s]});
    });
    spread(items, 13, y0 - 6, by + 4);
    items.forEach(function (it) {
      it.members.forEach(function (s) {
        sv("path", {d: "M" + (xe + 7) + "," + sy(s.v[s.v.length - 1]) + "L" + (xe + 12) + "," + it.pos,
          fill: "none", stroke: MODELS[s.m].color, "stroke-width": 1.2, "stroke-linecap": "round"}, e.ends);
      });
      sv("text", {"class": "rlc-end", x: xe + 15, y: it.pos + 4}, e.ends).textContent = it.text;
    });

    // transparent hit layer over the plot and its labels
    sv("rect", {x: x0 - 6, y: 0, width: W - x0 + 6, height: H, fill: "transparent"}, svg);

    this.draw(this.p);
    if (this.hot >= 0) { var h = this.hot; this.hot = -1; this.setHot(h); }
  };

  // vertical label placement: merge overlapping clusters, centre each on its targets, keep in bounds
  function spread(items, gap, lo, hi) {
    items.sort(function (a, b) { return a.want - b.want; });
    var blocks = items.map(function (it) { return {items: [it]}; });
    function place(b) {
      var n = b.items.length, mean = 0;
      b.items.forEach(function (it) { mean += it.want; });
      mean /= n;
      b.top = clamp(mean - (n - 1) * gap / 2, lo, Math.max(lo, hi - (n - 1) * gap));
      b.bottom = b.top + (n - 1) * gap;
    }
    blocks.forEach(place);
    var merged = true;
    while (merged) {
      merged = false;
      for (var i = 1; i < blocks.length; i++) {
        if (blocks[i].top - blocks[i - 1].bottom < gap - 0.01) {
          blocks[i - 1].items = blocks[i - 1].items.concat(blocks[i].items);
          blocks.splice(i, 1);
          place(blocks[i - 1]);
          merged = true;
          break;
        }
      }
    }
    blocks.forEach(function (b) { b.items.forEach(function (it, j) { it.pos = b.top + j * gap; }); });
  }

  // render the chart at progress p (0..1 of the RL-step axis)
  Chart.prototype.draw = function (p) {
    this.p = p;
    var e = this.els, self = this;
    if (!e) return;
    var headStep = p * LAST, eps = 1e-6, on = p > 0;
    this.series.forEach(function (s, i) {
      var pts = [];
      for (var k = 0; k < STEPS.length; k++) {
        if (STEPS[k] <= headStep + eps) pts.push([self.sx(STEPS[k]), self.sy(s.v[k])]);
        else {
          if (k > 0) {
            var f = (headStep - STEPS[k - 1]) / (STEPS[k] - STEPS[k - 1]);
            pts.push([self.sx(headStep), self.sy(s.v[k - 1] + f * (s.v[k] - s.v[k - 1]))]);
          }
          break;
        }
      }
      var d = "";
      if (on && pts.length > 1) d = "M" + pts.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("L");
      e.lines[i].setAttribute("d", d);
      var hd = e.heads[i], last = pts[pts.length - 1];
      if (on && p < 1 && last) {
        hd.setAttribute("cx", last[0]);
        hd.setAttribute("cy", last[1]);
        hd.setAttribute("visibility", "visible");
      } else hd.setAttribute("visibility", "hidden");
      e.pts[i].forEach(function (pt, k) { toggle(pt, "is-on", on && STEPS[k] <= headStep + eps); });
    });
    e.ticks.forEach(function (t, k) { toggle(t, "is-on", on && STEPS[k] <= headStep + eps); });
    var g = this.g;
    e.base.setAttribute("x2", on ? g.x0 + (g.x1 - g.x0) * p : g.x0);
    toggle(e.ends, "is-on", p >= 1);
  };
  function toggle(n, cls, v) {
    if (n.classList) { if (v) n.classList.add(cls); else n.classList.remove(cls); }
    else {
      var c = (n.getAttribute("class") || "").replace(new RegExp("\\s*\\b" + cls + "\\b", "g"), "");
      n.setAttribute("class", v ? c + " " + cls : c);
    }
  }

  Chart.prototype.play = function () {
    var self = this;
    clearTimeout(this.timer);
    if (reduced()) { this.finish(); return; }
    cancelAnimationFrame(this.raf);
    this.state = "playing";
    this.replayBtn.hidden = true;
    var t0 = now();
    function frame() {
      var t = (now() - t0) / DURATION;
      if (t >= 1) { self.finish(); return; }
      self.draw(ease(t));
      self.raf = requestAnimationFrame(frame);
    }
    this.draw(0.0001);
    this.raf = requestAnimationFrame(frame);
  };
  Chart.prototype.finish = function () {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    this.state = "done";
    this.draw(1);
    this.replayBtn.hidden = reduced();
  };
  Chart.prototype.replay = function () {
    var self = this;
    this.setHot(-1);
    cancelAnimationFrame(this.raf);
    this.state = "idle";
    this.draw(0);
    this.timer = setTimeout(function () { self.play(); }, 160);
  };

  Chart.prototype.stepAt = function (ev) {
    var r = this.svg.getBoundingClientRect();
    if (!r.width) return -1;
    var x = (ev.clientX - r.left) * this.W / r.width, best = 0, bd = Infinity, self = this;
    STEPS.forEach(function (st, k) { var d = Math.abs(self.sx(st) - x); if (d < bd) { bd = d; best = k; } });
    return best;
  };

  // show the crosshair, enlarged markers and the tooltip for step index k (-1 hides)
  Chart.prototype.setHot = function (k, announce) {
    var e = this.els, cfg = this.cfg, self = this;
    if (!e) return;
    if (k >= 0 && this.state !== "done") this.finish();
    if (k === this.hot && !announce) return;
    var prev = this.hot;
    this.hot = k;
    if (prev >= 0) e.pts.forEach(function (row) { var pt = row[prev]; if (pt) pt.setAttribute("r", pt._r); });
    if (k < 0) {
      e.cross.setAttribute("visibility", "hidden");
      this.tip.hidden = true;
      return;
    }
    var x = this.sx(STEPS[k]);
    e.cross.setAttribute("x1", Math.round(x) + 0.5);
    e.cross.setAttribute("x2", Math.round(x) + 0.5);
    e.cross.setAttribute("visibility", "visible");
    e.pts.forEach(function (row) { var pt = row[k]; if (pt) pt.setAttribute("r", pt._r + 1.5); });

    // tooltip: values lead, names follow; grouped by puzzle size on multi-model charts
    var tip = this.tip, spoken = [];
    tip.textContent = "";
    hx("p", "rlc-tip-h", tip, "RL step " + STEPS[k]);
    [3, 4].forEach(function (b) {
      var rows = cfg.series.filter(function (s) { return s.boxes === b; })
        .sort(function (a, c) { return c.v[k] - a.v[k]; });
      if (!rows.length) return;
      if (self.multi) hx("p", "rlc-tip-g", tip, b + " boxes");
      rows.forEach(function (s) {
        var r = hx("div", "rlc-tip-r", tip), val = fmt(cfg, s.v[k]) + cfg.unit;
        lineKey(r, MODELS[s.m].color, b, "#fff", 20);
        hx("b", null, r, val);
        hx("span", null, r, self.multi ? MODELS[s.m].short : b + " boxes");
        spoken.push(seriesLabel(cfg, s) + " " + val);
      });
    });
    tip.hidden = false;
    var pw = this.plot.clientWidth || this.W, scale = pw / this.W;
    var tw = tip.offsetWidth, px = x * scale, left = px + 14;
    if (left + tw > pw) left = px - 14 - tw;
    if (left < 0) left = clamp(px - tw / 2, 0, Math.max(0, pw - tw));
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(Math.max(0, this.g.y0 * scale - 6)) + "px";
    if (announce) this.live.textContent = "RL step " + STEPS[k] + ": " + spoken.join("; ") + ".";
  };

  /* ---------------- wiring ---------------- */
  var charts = [];
  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting || en.intersectionRatio < 0.35) return;
      io.unobserve(en.target);
      var c = en.target._agimaChart;
      if (c && c.state === "idle") c.timer = setTimeout(function () { if (c.state === "idle") c.play(); }, START_DELAY);
    });
  }, {threshold: [0, 0.35, 0.6]}) : null;
  var ro = ("ResizeObserver" in window) ? new ResizeObserver(function (entries) {
    entries.forEach(function (en) {
      var c = en.target.parentNode && en.target.parentNode._agimaChart;
      if (c) c.layout();
    });
  }) : null;
  if (!ro) window.addEventListener("resize", function () { charts.forEach(function (c) { c.layout(); }); });
  // a tap outside a chart hides its tooltip
  document.addEventListener("pointerdown", function (e) {
    charts.forEach(function (c) { if (c.hot >= 0 && !c.el.contains(e.target)) c.setHot(-1); });
  }, true);
  window.addEventListener("beforeprint", function () { charts.forEach(function (c) { if (c.state !== "done") c.finish(); }); });

  function render(root) {
    injectCSS();
    var nodes = (root || document).querySelectorAll(".rl-chart[data-chart]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], key = el.getAttribute("data-chart");
      if (el._agimaChart || !CHARTS.hasOwnProperty(key)) continue;
      var c = new Chart(el, key);
      el._agimaChart = c;
      charts.push(c);
      if (ro) ro.observe(c.plot);
      if (reduced() || !io) c.finish();
      else io.observe(el);
    }
    return charts;
  }

  window.AgimaCharts = {
    data: CHARTS,
    models: MODELS,
    render: render,
    replay: function () { charts.forEach(function (c) { c.replay(); }); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { render(); });
  else render();
})();
