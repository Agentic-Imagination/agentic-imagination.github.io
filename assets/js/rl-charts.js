/* Agima project page: animated RL charts (paper Figures 4b-c and 6a-d).
   Draws a responsive SVG line chart into every <div class="rl-chart" data-chart="KEY">
   (KEY = fig4b, fig4c, fig6a, fig6b, fig6c or fig6d). The lines draw in from RL step 0 to 200
   when the chart scrolls into view, then a bracket at the right end grows from the step-0 value to the
   step-200 value of the chart's main series while its gain counts up (all at once with
   prefers-reduced-motion). Hover, tap or focus + arrow keys shows the values at a step.
   Emphasis: the imagination variant each chart is about (cfg.hero) is drawn thick and saturated, the
   other models thin and light. The y axis is fitted to the data, not pinned to 0; on Figures 4b-c the
   No Imagine model sits near 0, so those charts break the axis: a short 0-10% band at the bottom, a
   marked gap, then the fitted range. Plain ES5, no dependencies.
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
  var DURATION = 1700;           // ms for the full 0 -> 200 draw
  var GAIN_DELAY = 140;          // ms between the lines finishing and the gain bracket
  var GAIN_MS = 950;             // ms for the bracket to grow and the gain to count up
  var START_DELAY = 300;         // lets the card's scroll-reveal settle first
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

  // domain / ticks: the fitted y range (a round value a little below the hero's minimum, to a little above
  // its maximum). low: the 0-10% band under an axis break, for series far below the fitted range.
  // hero: the model(s) drawn with emphasis. gain: the series whose step-0 -> step-200 change is annotated
  // (the hero series with the largest gain).
  var CHARTS = {
    fig4b: {
      title: "Deadlock-set accuracy", yLabel: "Accuracy", source: "Figure 4b",
      domain: [20, 50], ticks: [20, 30, 40, 50], low: {domain: [0, 10], ticks: [0, 10]},
      dec: 0, unit: "%", hero: ["fwd"], gain: {m: "fwd", boxes: 4},
      summary: "Held-out accuracy rises over 200 RL steps for Agima-A7B (Forward), from 25% to 40% on 4-box and from 38% to 45% on 3-box puzzles, and for Agima-A7B; the No Imagine model stays below 10%.",
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
      title: "Fork-set accuracy", yLabel: "Accuracy", source: "Figure 4c",
      domain: [20, 50], ticks: [20, 30, 40, 50], low: {domain: [0, 10], ticks: [0, 10]},
      dec: 0, unit: "%", hero: ["br"], gain: {m: "br", boxes: 4},
      summary: "Held-out accuracy rises over 200 RL steps; Agima-A7B (Branching) goes from 22% to 45% on 4-box and from 33% to 50% on 3-box puzzles, passing Agima-A7B; the No Imagine model stays below 5%.",
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
      yLabel: "First plan predicted to fail",
      domain: [25, 100], ticks: [25, 50, 75, 100], dec: 0, unit: "%", gain: {m: "fwd", boxes: 3},
      summary: "Among episodes with a second plan, the share whose first plan was predicted to fail: about 32% (3 boxes) and 55% (4 boxes) at step 0, 100% from step 100 on.",
      series: [
        {m: "fwd", boxes: 3, v: [31.7, 33.9, 100, 100, 100]},
        {m: "fwd", boxes: 4, v: [55.4, 63, 100, 100, 100]}
      ]
    },
    fig6b: {
      title: "Unified format", sub: "Agima-A7B (Forward), deadlock set", source: "Figure 6b",
      yLabel: "Episodes in the unified format",
      domain: [0, 100], ticks: [0, 25, 50, 75, 100], dec: 0, unit: "%", gain: {m: "fwd", boxes: 3},
      summary: "Share of episodes in the unified (hybrid) format: about 5% at step 0, 100% from step 100 on, for 3 and 4 boxes.",
      series: [
        {m: "fwd", boxes: 3, v: [4.9, 10.5, 100, 100, 100]},
        {m: "fwd", boxes: 4, v: [5.3, 25, 100, 100, 100]}
      ]
    },
    fig6c: {
      title: "Branches per episode", sub: "Agima-A7B (Branching), fork set", source: "Figure 6c",
      yLabel: "Mean branches per episode",
      domain: [1.8, 2.5], ticks: [1.8, 2.0, 2.2, 2.4], tickDec: 1, dec: 1, unit: "", gain: {m: "br", boxes: 4},
      summary: "Mean branches per episode rise from about 2.1 to 2.3 (3 boxes) and from 1.9 to 2.2 (4 boxes), peaking at step 150.",
      series: [
        {m: "br", boxes: 3, v: [2.08, 2.14, 2.23, 2.43, 2.30]},
        {m: "br", boxes: 4, v: [1.88, 2.00, 2.04, 2.25, 2.24]}
      ]
    },
    fig6d: {
      title: "Critical-step alignment", sub: "Agima-A7B (Branching), fork set", source: "Figure 6d",
      yLabel: "P(critical step | branch)",
      domain: [40, 75], ticks: [40, 50, 60, 70], dec: 0, unit: "%", gain: {m: "br", boxes: 4},
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
    ".rlc-legend li.is-hero{color:var(--rlc-ink);font-weight:600}",
    ".rlc-key{flex:none;overflow:visible}",
    ".rlc-plot{position:relative}",
    ".rlc-svg{display:block;width:100%;height:auto;overflow:visible;touch-action:pan-y;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}",
    ".rlc-svg:focus{outline:none}",
    ".rlc-svg:focus-visible{outline:2px solid var(--blue,#2660E0);outline-offset:3px;border-radius:6px}",
    ".rlc-svg text{fill:var(--rlc-text2);font-size:11px;font-variant-numeric:lining-nums tabular-nums}",
    ".rlc-svg .rlc-end{fill:var(--rlc-text2);font-size:11px;font-weight:500}",
    ".rlc-svg .rlc-end.is-hero{fill:var(--rlc-ink);font-size:12px;font-weight:700}",
    ".rlc-grid{stroke:var(--rlc-line);stroke-width:1;shape-rendering:crispEdges}",
    ".rlc-base,.rlc-xt{stroke:var(--rlc-line-strong);stroke-width:1;shape-rendering:crispEdges}",
    ".rlc-brk{fill:none;stroke:var(--rlc-line-strong);stroke-width:1.2;stroke-linecap:round}",
    ".rlc-cross{stroke:var(--rlc-ink);stroke-opacity:.28;stroke-width:1;shape-rendering:crispEdges}",
    ".rlc-line{fill:none;stroke-linecap:round;stroke-linejoin:round}",
    ".rlc-fade{opacity:0;transition:opacity .3s ease}",
    ".rlc-fade.is-on{opacity:1}",
    ".rlc-pt{transform-box:fill-box;transform-origin:center;transform:scale(0);transition:transform .34s cubic-bezier(.2,.8,.3,1.45)}",
    ".rlc-pt.is-on{transform:scale(1)}",
    // the step-0 marker on the y axis, the guide at that level, the bracket and the gain
    ".rlc-start rect{fill:#fff;stroke-width:1.5}",
    ".rlc-svg .rlc-start text{fill:var(--rlc-ink);font-size:11px;font-weight:700}",
    ".rlc-guide{fill:none;stroke-width:1.2;stroke-dasharray:1.5 3.5;stroke-linecap:round}",
    ".rlc-brkt{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
    ".rlc-svg .rlc-gain{fill:var(--rlc-ink);font-size:15px;font-weight:700;font-variant-numeric:lining-nums proportional-nums;letter-spacing:-.01em}",
    ".rlc-svg .rlc-gain-sub{fill:var(--rlc-text2);font-size:10px;font-weight:500}",
    ".rlc-tip{position:absolute;left:0;top:0;z-index:5;padding:8px 10px 7px;border:1px solid var(--rlc-line);border-radius:10px;background:#fff;",
    "box-shadow:0 14px 30px -16px rgba(22,22,24,.5);color:var(--rlc-ink);font-size:.75rem;line-height:1.35;white-space:nowrap;pointer-events:none}",
    ".rlc-tip[hidden],.rlc-replay[hidden]{display:none}",
    ".rlc-tip-h{margin:0 0 3px;color:var(--rlc-text2);font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase}",
    ".rlc-tip-g{margin:5px 0 1px;color:var(--rlc-text2);font-size:.68rem}",
    ".rlc-tip-r{display:flex;align-items:center;gap:7px;padding:1px 0}",
    ".rlc-tip-r b{min-width:2.9em;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}",
    ".rlc-tip-r span{color:var(--rlc-text2)}",
    ".rlc-tip-r.is-ctx b{font-weight:500;color:var(--rlc-text2)}",
    ".rlc-replay{flex:none;display:inline-grid;place-items:center;width:28px;height:28px;margin:-2px -2px 0 0;padding:0;border:1px solid var(--rlc-line);",
    "border-radius:999px;background:transparent;color:var(--rlc-text2);cursor:pointer;transition:color .15s ease,border-color .15s ease}",
    ".rlc-replay:hover{color:var(--rlc-ink);border-color:var(--rlc-ink)}",
    ".rlc-replay:focus-visible{outline:2px solid var(--blue,#2660E0);outline-offset:2px}",
    ".rlc-replay svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
    ".rlc-sr{position:absolute!important;width:1px;height:1px;margin:0;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}",
    "@media (prefers-reduced-motion:reduce){.rlc-pt,.rlc-fade{transition:none}}",
    "@media (forced-colors:active){.rlc-line,.rlc-brkt,.rlc-guide{stroke:CanvasText}.rlc-pt{fill:Canvas;stroke:CanvasText}}"
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
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function fmt(cfg, v) { return v.toFixed(cfg.dec); }
  function fmtU(cfg, v) { return fmt(cfg, v) + cfg.unit; }
  function fmtTick(cfg, v) { return v.toFixed(cfg.tickDec || 0) + cfg.unit; }
  // a gain as shown: the difference of the two values as they are printed, so "+23%" always matches 22% -> 45%
  function gainOf(cfg, s) { return +fmt(cfg, s.v[s.v.length - 1]) - +fmt(cfg, s.v[0]); }
  function fmtGain(cfg, d) { return (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(cfg.dec) + cfg.unit; }
  // rough advance widths (em) for Inter / system sans at chart sizes; only used for margins
  function textW(s, size, bold) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      w += (c === "." ? 0.3 : c === "%" ? 0.85 : c === "+" || c === "−" ? 0.64 : /[0-9]/.test(c) ? 0.62 : c === " " ? 0.28 : 0.56);
    }
    return w * size * (bold ? 1.06 : 1);
  }
  function modelsOf(cfg) {
    var out = [];
    cfg.series.forEach(function (s) { if (out.indexOf(s.m) < 0) out.push(s.m); });
    return out;
  }
  function isHero(cfg, m) { return !cfg.hero || cfg.hero.indexOf(m) >= 0; }
  function seriesLabel(cfg, s) {
    var multi = modelsOf(cfg).length > 1;
    return (multi ? MODELS[s.m].name + ", " : "") + s.boxes + " boxes";
  }
  // a context (non-hero) model is drawn in its own hue, lightened toward the card
  function mix(hex, to, t) {
    var a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16), out = "#";
    [16, 8, 0].forEach(function (sh) {
      var x = Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
      out += (x < 16 ? "0" : "") + x.toString(16);
    });
    return out;
  }
  function colorOf(cfg, m) { return isHero(cfg, m) ? MODELS[m].color : mix(MODELS[m].color, "#ffffff", 0.5); }
  // stroke widths and marker radii: hero series thick, the rest thin
  function styleOf(cfg, s) {
    var hero = isHero(cfg, s.m);
    return {
      hero: hero, color: colorOf(cfg, s.m),
      w: hero ? (s.boxes === 4 ? 2.6 : 3) : 1.6,
      dash: s.boxes === 4 ? (hero ? "6 4.5" : "4 3.5") : null,
      r: hero ? 4.5 : 3.1,
      rHollow: hero ? 4 : 2.9,
      sw: hero ? 2.2 : 1.4
    };
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
  function lineKey(parent, color, boxes, surface, w, sw) {
    w = w || 26;
    sw = sw || 2;
    var k = sv("svg", {"class": "rlc-key", width: w, height: 10, viewBox: "0 0 " + w + " 10", "aria-hidden": "true", focusable: "false"}, parent);
    var ln = sv("line", {x1: 1, y1: 5, x2: w - 1, y2: 5, stroke: color, "stroke-width": sw, "stroke-linecap": "round"}, k);
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
    this.p = 0; this.q = 0; this.state = "idle"; this.hot = -1; this.W = 0; this.raf = 0; this.timer = 0;
    // draw order: context models under the hero, and within each, dashed (4 boxes) under solid (3 boxes)
    this.series = cfg.series.slice().sort(function (a, b) {
      return (isHero(cfg, a.m) - isHero(cfg, b.m)) || (b.boxes - a.boxes);
    });
    this.multi = modelsOf(cfg).length > 1;
    this.gainS = cfg.gain ? cfg.series.filter(function (s) { return s.m === cfg.gain.m && s.boxes === cfg.gain.boxes; })[0] : null;

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

    // legend: models (multi-model charts, hero first), then the 3 / 4 boxes line styles
    var lg = hx("ul", "rlc-legend", el);
    lg.setAttribute("aria-label", "Legend");
    var neutral = "#5C5A54", single = this.multi ? null : MODELS[cfg.series[0].m].color;
    if (this.multi) {
      modelsOf(cfg).sort(function (a, b) { return isHero(cfg, b) - isHero(cfg, a); }).forEach(function (m) {
        var hero = isHero(cfg, m);
        var li = hx("li", hero ? "is-hero" : null, lg);
        var k = sv("svg", {"class": "rlc-key", width: 18, height: 10, viewBox: "0 0 18 10", "aria-hidden": "true", focusable: "false"}, li);
        sv("line", {x1: 1.5, y1: 5, x2: 16.5, y2: 5, stroke: colorOf(cfg, m), "stroke-width": hero ? 3.2 : 2, "stroke-linecap": "round"}, k);
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
    var gs = this.gainS;
    this.svg.setAttribute("aria-label", cfg.title + (cfg.sub ? ", " + cfg.sub : "") + ", by RL step. " + cfg.summary +
      (gs ? " " + seriesLabel(cfg, gs) + ": " + fmtU(cfg, gs.v[0]) + " at step 0, " + fmtU(cfg, gs.v[gs.v.length - 1]) +
        " at step 200 (" + fmtGain(cfg, gainOf(cfg, gs)) + ")." : "") +
      (cfg.low ? " The y axis is broken between " + fmtTick(cfg, cfg.low.domain[1]) + " and " + fmtTick(cfg, cfg.domain[0]) + "." : "") +
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
    cfg.series.forEach(function (s) { hx("th", null, tr, seriesLabel(cfg, s)).setAttribute("scope", "col"); });
    var tb = hx("tbody", null, t);
    STEPS.forEach(function (st, k) {
      var r = hx("tr", null, tb);
      hx("th", null, r, String(st)).setAttribute("scope", "row");
      cfg.series.forEach(function (s) { hx("td", null, r, fmtU(cfg, s.v[k])); });
    });
  };

  // y scale: one linear range, or (cfg.low) a low band under a gap and the fitted range above it
  function yScale(cfg, top, bottom) {
    var d0 = cfg.domain[0], d1 = cfg.domain[1];
    if (!cfg.low) {
      return {f: function (v) { return bottom - (v - d0) / (d1 - d0) * (bottom - top); }, gap: null};
    }
    var l0 = cfg.low.domain[0], l1 = cfg.low.domain[1];
    var lowH = Math.round(clamp((bottom - top) * 0.15, 26, 40)), GAP = 20;
    var lowTop = bottom - lowH, mainBot = lowTop - GAP;
    return {
      f: function (v) {
        if (v >= d0) return mainBot - (v - d0) / (d1 - d0) * (mainBot - top);
        if (v <= l1) return bottom - (v - l0) / (l1 - l0) * lowH;
        return lowTop - (v - l1) / (d0 - l1) * GAP;    // inside the break (no data lands here)
      },
      gap: [mainBot, lowTop]
    };
  }

  Chart.prototype.layout = function () {
    var W = Math.round(this.plot.clientWidth || this.el.clientWidth || 0);
    if (!W) W = 480;
    W = Math.max(220, W);
    if (W === this.W) return;
    this.W = W;
    var cfg = this.cfg, self = this, svg = this.svg, gs = this.gainS;
    var H = Math.round(clamp(W * 0.66, 245, 330));
    this.H = H;
    var surface = this.surface = surfaceOf(this.el);
    var allTicks = cfg.ticks.concat(cfg.low ? cfg.low.ticks : []);

    // margins: y tick labels (and the step-0 marker) on the left; on the right the end-of-line values,
    // then the gain bracket and its label
    var tickW = 0, endW = 0;
    allTicks.forEach(function (t) { tickW = Math.max(tickW, textW(fmtTick(cfg, t), 11)); });
    var pillW = gs ? Math.ceil(textW(fmtU(cfg, gs.v[0]), 11, true)) + 10 : 0;
    cfg.series.forEach(function (s) { endW = Math.max(endW, textW(fmtU(cfg, s.v[s.v.length - 1]), 12, true)); });
    var gainTxt = gs ? fmtGain(cfg, gainOf(cfg, gs)) : "", gainSub = gs ? gs.boxes + " boxes" : "";
    var gainW = gs ? Math.max(textW(gainTxt, 15, true), textW(gainSub, 10)) : 0;
    var endCol = Math.ceil(endW) + 15;                  // leader + value labels
    var m = {t: 28, l: Math.ceil(Math.max(tickW, pillW)) + 9, b: 40};
    m.r = endCol + (gs ? 10 + 7 + Math.ceil(gainW) + 2 : 4);
    // x1 = right end of the grid (just past the step-200 points); the value labels and the gain column follow
    var x0 = m.l, x1 = W - m.r, y0 = m.t, y1 = H - m.b;
    var dx0 = x0 + 10, dx1 = x1 - 4;
    this.g = {x0: x0, x1: x1, y0: y0, y1: y1};
    this.sx = function (st) { return dx0 + st / LAST * (dx1 - dx0); };
    var Y = yScale(cfg, y0 + 6, y1);
    this.sy = Y.f;
    var sx = this.sx, sy = this.sy;
    var xe = sx(LAST);

    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var e = this.els = {lines: [], heads: [], pts: [], ticks: []};
    // y axis label (top left) and grid
    sv("text", {x: 0, y: 11}, svg).textContent = cfg.yLabel;
    var grid = sv("g", {"aria-hidden": "true"}, svg);
    var startY = gs ? sy(gs.v[0]) : null;
    var bottomV = cfg.low ? cfg.low.domain[0] : cfg.domain[0];
    allTicks.forEach(function (t) {
      var y = Math.round(sy(t)) + 0.5;
      if (t !== bottomV) sv("line", {"class": "rlc-grid", x1: x0, x2: x1, y1: y, y2: y}, grid);
      // a tick label the step-0 marker would cover is left out (the marker carries a value there)
      if (startY !== null && Math.abs(y - startY) < 14) return;
      sv("text", {x: x0 - 6, y: y + 3.8, "text-anchor": "end"}, grid).textContent = fmtTick(cfg, t);
    });
    // axis break: a pair of short slashes at both ends of the gap
    if (Y.gap) {
      var gm = (Y.gap[0] + Y.gap[1]) / 2;
      [x0, x1].forEach(function (x) {
        [-3, 3].forEach(function (o) {
          sv("path", {"class": "rlc-brk", d: "M" + (x - 5) + "," + (gm + o + 3) + "L" + (x + 5) + "," + (gm + o - 3)}, grid);
        });
      });
    }
    // x axis (drawn with the lines)
    var by = Math.round(sy(bottomV)) + 0.5;
    e.base = sv("line", {"class": "rlc-base", x1: x0, x2: x0, y1: by, y2: by}, grid);
    STEPS.forEach(function (st) {
      var gx = sv("g", {"class": "rlc-fade"}, grid), x = Math.round(sx(st)) + 0.5;
      sv("line", {"class": "rlc-xt", x1: x, x2: x, y1: by, y2: by + 4}, gx);
      sv("text", {x: x, y: by + 17, "text-anchor": "middle"}, gx).textContent = String(st);
      e.ticks.push(gx);
    });
    sv("text", {x: (dx0 + dx1) / 2, y: H - 4, "text-anchor": "middle"}, grid).textContent = "RL step";

    // the gain series' step-0 level: a guide that follows the line head, and the marker on the y axis
    if (gs) {
      var gcol = colorOf(cfg, gs.m), gy = Math.round(startY) + 0.5;
      e.guide = sv("line", {"class": "rlc-guide", x1: sx(0), x2: sx(0), y1: gy, y2: gy, stroke: gcol, visibility: "hidden"}, svg);
      e.start = sv("g", {"class": "rlc-start rlc-fade", "aria-hidden": "true"}, svg);
      sv("rect", {x: x0 - 4 - pillW, y: gy - 8.5, width: pillW, height: 17, rx: 8.5, stroke: gcol}, e.start);
      sv("text", {x: x0 - 4 - pillW / 2, y: gy + 3.8, "text-anchor": "middle"}, e.start).textContent = fmtU(cfg, gs.v[0]);
    }

    // hover crosshair (under the data)
    e.cross = sv("line", {"class": "rlc-cross", x1: 0, x2: 0, y1: y0 - 4, y2: by, visibility: "hidden"}, svg);

    // one group per series: line, markers (filled = 3 boxes, hollow = 4 boxes), leading dot
    var styles = this.styles = this.series.map(function (s) { return styleOf(cfg, s); });
    this.series.forEach(function (s, i) {
      var st = styles[i], g = sv("g", {"aria-hidden": "true"}, svg), row = [];
      var p = sv("path", {"class": "rlc-line", d: "", stroke: st.color, "stroke-width": st.w}, g);
      if (st.dash) p.setAttribute("stroke-dasharray", st.dash);
      e.lines.push(p);
      STEPS.forEach(function (stp, k) {
        var x = sx(stp), y = sy(s.v[k]), pt;
        if (s.boxes === 3) {
          pt = sv("circle", {"class": "rlc-pt", cx: x, cy: y, r: st.r, fill: st.color, stroke: surface, "stroke-width": st.hero ? 3 : 2, "paint-order": "stroke"}, g);
          pt._r = st.r;
        } else {
          // a 4-box point sitting on a 3-box point of the same model becomes a ring around it
          var twin = self.series.some(function (o) { return o.m === s.m && o.boxes === 3 && Math.abs(sy(o.v[k]) - y) < 2; });
          var r = twin ? st.r + 3.5 : st.rHollow;
          pt = sv("circle", {"class": "rlc-pt", cx: x, cy: y, r: r, fill: twin ? "none" : surface, stroke: st.color, "stroke-width": st.sw}, g);
          pt._r = r;
        }
        row.push(pt);
      });
      e.pts.push(row);
      e.heads.push(sv("circle", {r: st.hero ? 4 : 3, fill: st.color, stroke: surface, "stroke-width": 3, "paint-order": "stroke", visibility: "hidden"}, g));
    });

    // end-of-line value labels, spread so they never overlap, each tied to its line end by a leader
    e.ends = sv("g", {"class": "rlc-fade", "aria-hidden": "true"}, svg);
    var items = [];
    this.series.forEach(function (s, i) {
      var v = s.v[s.v.length - 1], txt = fmtU(cfg, v), y = sy(v), hit = null;
      items.forEach(function (it) { if (it.text === txt && Math.abs(it.want - y) < 3) hit = it; });
      if (hit) { hit.members.push(i); hit.hero = hit.hero || styles[i].hero; }
      else items.push({text: txt, want: y, members: [i], hero: styles[i].hero});
    });
    spread(items, 13, y0 - 6, by + 4);
    items.forEach(function (it) {
      it.members.forEach(function (i) {
        var s = self.series[i];
        sv("path", {d: "M" + (xe + 7) + "," + sy(s.v[s.v.length - 1]) + "L" + (xe + 12) + "," + it.pos,
          fill: "none", stroke: styles[i].color, "stroke-width": 1.2, "stroke-linecap": "round"}, e.ends);
      });
      sv("text", {"class": "rlc-end" + (it.hero ? " is-hero" : ""), x: xe + 15, y: it.pos + 4}, e.ends).textContent = it.text;
    });

    // the gain bracket: from the step-0 level up (or down) to the step-200 value, with the gain beside it
    if (gs) {
      var bx = Math.round(xe + endCol + 10) + 0.5, ya = sy(gs.v[0]), yb = sy(gs.v[gs.v.length - 1]);
      this.gainGeo = {bx: bx, ya: ya, yb: yb, d: gainOf(cfg, gs)};
      var gc = colorOf(cfg, gs.m);
      e.brkt = sv("path", {"class": "rlc-brkt", d: "", stroke: gc}, svg);
      e.brktEnd = sv("line", {"class": "rlc-guide", x1: xe + 15 + endW + 3, x2: bx - 5, y1: Math.round(yb) + 0.5, y2: Math.round(yb) + 0.5, stroke: gc, visibility: "hidden"}, svg);
      var tg = sv("g", {"class": "rlc-fade", "aria-hidden": "true"}, svg), my = (ya + yb) / 2;
      e.gainTxt = sv("text", {"class": "rlc-gain", x: bx + 7, y: my + 2}, tg);
      e.gainTxt.textContent = gainTxt;
      sv("text", {"class": "rlc-gain-sub", x: bx + 7.5, y: my + 15}, tg).textContent = gainSub;
      e.gainG = tg;
    }

    // transparent hit layer over the plot and its labels
    sv("rect", {x: x0 - 6, y: 0, width: W - x0 + 6, height: H, fill: "transparent"}, svg);

    this.draw(this.p);
    this.drawGain(this.q);
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

  // render the lines at progress p (0..1 of the RL-step axis)
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
    if (e.guide) {
      // the step-0 level stays put while the line moves away from it
      e.guide.setAttribute("visibility", on ? "visible" : "hidden");
      if (this.q <= 0) e.guide.setAttribute("x2", Math.max(this.sx(0), this.sx(headStep)));
      toggle(e.start, "is-on", on);
    }
  };

  // render the gain annotation at progress q (0..1): the guide reaches the bracket, which grows from the
  // step-0 level to the step-200 value while the gain counts up
  Chart.prototype.drawGain = function (q) {
    this.q = q;
    var e = this.els, G = this.gainGeo;
    if (!e || !e.brkt || !G) return;
    if (q <= 0) {
      e.brkt.setAttribute("d", "");
      e.brktEnd.setAttribute("visibility", "hidden");
      toggle(e.gainG, "is-on", false);
      return;
    }
    var k1 = easeOut(clamp(q / 0.35, 0, 1)), k2 = ease(clamp((q - 0.2) / 0.8, 0, 1));
    var xg0 = this.sx(LAST);
    e.guide.setAttribute("x2", xg0 + (G.bx - 5 - xg0) * k1);
    var y = G.ya + (G.yb - G.ya) * k2, up = G.yb < G.ya, ah = up ? 1 : -1, d;
    // bottom serif at the step-0 level, the stem, and an arrow head once the stem has some length
    d = "M" + (G.bx - 5) + "," + G.ya + "H" + G.bx + "V" + y.toFixed(1);
    if (Math.abs(y - G.ya) > 9) d += "M" + (G.bx - 4) + "," + (y + ah * 5).toFixed(1) + "L" + G.bx + "," + y.toFixed(1) + "L" + (G.bx + 4) + "," + (y + ah * 5).toFixed(1);
    e.brkt.setAttribute("d", d);
    e.brktEnd.setAttribute("visibility", k2 >= 1 ? "visible" : "hidden");
    toggle(e.gainG, "is-on", true);
    e.gainTxt.textContent = fmtGain(this.cfg, G.d * k2);
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
    this.drawGain(0);
    var t0 = now(), total = DURATION + (this.gainS ? GAIN_DELAY + GAIN_MS : 0);
    function frame() {
      var t = now() - t0;
      if (t >= total) { self.finish(); return; }
      self.draw(t >= DURATION ? 1 : ease(t / DURATION));
      if (t > DURATION + GAIN_DELAY) self.drawGain((t - DURATION - GAIN_DELAY) / GAIN_MS);
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
    this.drawGain(1);
    this.replayBtn.hidden = reduced();
  };
  Chart.prototype.replay = function () {
    var self = this;
    this.setHot(-1);
    cancelAnimationFrame(this.raf);
    this.state = "idle";
    this.drawGain(0);
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

    // tooltip: values lead, names follow; grouped by puzzle size on multi-model charts, hero first
    var tip = this.tip, spoken = [];
    tip.textContent = "";
    hx("p", "rlc-tip-h", tip, "RL step " + STEPS[k]);
    [3, 4].forEach(function (b) {
      var rows = cfg.series.filter(function (s) { return s.boxes === b; })
        .sort(function (a, c) { return (isHero(cfg, c.m) - isHero(cfg, a.m)) || (c.v[k] - a.v[k]); });
      if (!rows.length) return;
      if (self.multi) hx("p", "rlc-tip-g", tip, b + " boxes");
      rows.forEach(function (s) {
        var st = styleOf(cfg, s), r = hx("div", "rlc-tip-r" + (st.hero ? "" : " is-ctx"), tip), val = fmtU(cfg, s.v[k]);
        lineKey(r, st.color, b, "#fff", 20, st.hero ? 2.6 : 1.8);
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
