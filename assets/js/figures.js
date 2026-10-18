/* Agima project page: interactive versions of the static paper figures.
   - Planning traps ([data-compare]): a before/after split slider over the two trap images
     (drag, tap, arrow keys, or the two buttons), with an arrow on the tempting move and a ring on what changes.
   - Fig. 3 ([data-fig3]): Pacman route-order trap; a two-way switch focuses the linear rollout or
     forward thinking, dims the other and rings its key frames. On narrow screens it zooms to that half.
   - Fig. 5 ([data-fig5]): the same Sokoban puzzle before vs after RL, rebuilt in HTML from board
     thumbnails cropped out of the figure (assets/images/fig5/, see tools/figures/). Plans reveal step by step.
   Progressive enhancement: each figure's plain images are the no-JavaScript version. Plain ES5, no dependencies.
   Image coordinates below were measured on the image files (traps: 256x256, 32 px cells; Fig. 3: 2400x834). */
(function () {
  "use strict";
  if (!document.querySelector || !window.addEventListener) return;

  var SVGNS = "http://www.w3.org/2000/svg";
  var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(reduceMQ && reduceMQ.matches); }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function svg(tag, attrs, kids) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  // A group of toggle buttons. set(v) presses the button whose value is v (or none).
  function seg(label, options, onPick, cls) {
    var group = el("div", {class: "seg" + (cls ? " " + cls : ""), role: "group", "aria-label": label});
    var btns = options.map(function (o) {
      var b = el("button", {type: "button", class: "seg-btn", "aria-pressed": "false", text: o[1]});
      b.addEventListener("click", function () { onPick(o[0]); });
      group.appendChild(b);
      return b;
    });
    return {node: group, set: function (v) {
      btns.forEach(function (b, i) { b.setAttribute("aria-pressed", String(options[i][0] === v)); });
    }};
  }
  // Calls fn once, the first time `ratio` of node is on screen, or half the screen for a node too tall to
  // ever reach that ratio (Fig. 5 on a phone).
  var VIS_STEPS = [];
  for (var vi = 0; vi <= 50; vi++) VIS_STEPS.push(vi / 50);
  function onceVisible(node, ratio, fn) {
    if (!("IntersectionObserver" in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      var e = entries[0], vh = e.rootBounds ? e.rootBounds.height : window.innerHeight;
      if (e.isIntersecting && (e.intersectionRatio >= ratio || e.intersectionRect.height >= vh * 0.5)) { io.disconnect(); fn(); }
    }, {threshold: VIS_STEPS});
    io.observe(node);
  }
  var ICON = {
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4 4 9-9"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>',
    replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/></svg>',
    drag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg>'
  };

  /* ================= 1. planning traps: before / after split slider ================= */
  // Marks in image pixels (256x256). Arrows belong to the "before" image (the tempting move), rings and
  // labels to the "after" image (where it goes wrong). All marks sit in one layer above both images, so the
  // split never cuts them: a mark is bright on its own image's side of the split and faint on the other.
  var TRAP_MARKS = {
    // the box at (5,3) is pushed left into the corner at (4,3): walls above and to the left
    deadlock: {before: [["arrow", 190, 112, 150, 112]], after: [["ring", 144, 112], ["label", 144, 78, "stuck", "bad"]]},
    // the box at (3,5) is pushed up against the top wall at (3,4); no goal on that row
    fork: {before: [["arrow", 112, 190, 112, 150]], after: [["ring", 112, 144], ["label", 112, 110, "stuck", "bad"]]},
    // Pacman (4,6) moves up to the fork at (4,4); the image's own rings mark the two pellets
    pacman: {before: [["arrow", 144, 194, 144, 150]], after: [["label", 48, 141, "near", "bad"], ["label", 176, 77, "far", "good"]]}
  };
  function trapMarks(marks) {
    var s = svg("svg", {class: "cmp-marks", viewBox: "0 0 256 256", "aria-hidden": "true", focusable: "false"});
    var out = [];
    ["before", "after"].forEach(function (side) {
      (marks[side] || []).forEach(function (m) {
        var g = trapMark(m);
        s.appendChild(g);
        out.push({g: g, side: side, x: m[0] === "arrow" ? (m[1] + m[3]) / 2 : m[1]});
      });
    });
    return {node: s, marks: out};
  }
  function trapMark(m) {
    var s = svg("g", {class: "cmp-mark"});
    if (m) {
      if (m[0] === "arrow") {
        var d = "M" + m[1] + " " + m[2] + " L" + m[3] + " " + m[4];
        var ang = Math.atan2(m[4] - m[2], m[3] - m[1]), hx = m[3], hy = m[4], L = 9, W = 7;
        var head = "M" + (hx + Math.cos(ang) * 3) + " " + (hy + Math.sin(ang) * 3) +
          " L" + (hx - Math.cos(ang) * L - Math.sin(ang) * W) + " " + (hy - Math.sin(ang) * L + Math.cos(ang) * W) +
          " L" + (hx - Math.cos(ang) * L + Math.sin(ang) * W) + " " + (hy - Math.sin(ang) * L - Math.cos(ang) * W) + " Z";
        s.appendChild(svg("g", {class: "cmp-arrow"}, [
          svg("path", {class: "cmp-arrow-halo", d: d}), svg("path", {class: "cmp-arrow-halo", d: head}),
          svg("path", {class: "cmp-arrow-line", d: d}), svg("path", {class: "cmp-arrow-head", d: head})
        ]));
      } else if (m[0] === "ring") {
        s.appendChild(svg("g", {class: "cmp-ring"}, [
          svg("circle", {class: "cmp-ring-glow", cx: m[1], cy: m[2], r: 23}),
          svg("circle", {class: "cmp-ring-line", cx: m[1], cy: m[2], r: 23})
        ]));
      } else if (m[0] === "label") {
        var w = 10 + m[3].length * 6.6;
        s.appendChild(svg("g", {class: "cmp-label is-" + m[4]}, [
          svg("rect", {x: m[1] - w / 2, y: m[2] - 8.5, width: w, height: 17, rx: 8.5}),
          (function () { var t = svg("text", {x: m[1], y: m[2] + 4, "text-anchor": "middle"}); t.textContent = m[3]; return t; })()
        ]));
      }
    }
    return s;
  }
  function initCompare(root) {
    var items = root.querySelectorAll(".compare-item");
    if (items.length !== 2) return;
    var imgs = [items[0].querySelector("img"), items[1].querySelector("img")];
    if (!imgs[0] || !imgs[1]) return;
    imgs.forEach(function (im) { im.setAttribute("draggable", "false"); });
    var caps = [0, 1].map(function (i) {
      var c = items[i].querySelector(".compare-cap");
      return c ? c.textContent.trim() : (i ? "After" : "Before");
    });
    var marks = TRAP_MARKS[root.getAttribute("data-compare")] || {};
    var name = root.getAttribute("data-name") || "trap";

    var before = el("div", {class: "cmp-layer cmp-before"}, [imgs[0]]);
    var after = el("div", {class: "cmp-layer cmp-after"}, [imgs[1]]);
    var overlay = trapMarks(marks);
    var tagL = el("span", {class: "cmp-tag cmp-tag-l", "aria-hidden": "true", text: caps[0]});
    var tagR = el("span", {class: "cmp-tag cmp-tag-r", "aria-hidden": "true", text: caps[1]});
    var handle = el("div", {class: "cmp-handle", role: "slider", tabindex: "0", "aria-orientation": "horizontal",
      "aria-valuemin": "0", "aria-valuemax": "100",
      "aria-label": name + ": " + caps[0] + " (left) versus " + caps[1] + " (right)"});
    var knob = el("span", {class: "cmp-knob", "aria-hidden": "true", html: ICON.drag});   // stays inside the board at the ends
    var stage = el("div", {class: "cmp-stage"}, [after, before, overlay.node, tagL, tagR, handle, knob]);
    var pick = seg(name + ": show", [["0", caps[0]], ["1", caps[1]]], function (v) {
      touched = true; clearTimeout(nudge); set(v === "0" ? 100 : 0, 480);
    }, "seg-sm");
    var tools = el("div", {class: "cmp-tools"}, [pick.node, el("span", {class: "cmp-hint", "aria-hidden": "true", text: "Drag to compare"})]);

    root.innerHTML = "";
    root.appendChild(stage); root.appendChild(tools);
    root.classList.add("is-live");

    // p = how much of the board shows the "before" image (100 = all of it). It starts on the before image
    // (the tempting move); once on screen, one sweep to the after image shows what that move leads to.
    var p = 100, touched = false, drag = null, nudge = null, raf = 0;
    function apply(v) {
      stage.style.setProperty("--p", v + "%");
      var cut = v / 100 * 256;
      overlay.marks.forEach(function (m) {
        m.g.classList.toggle("is-dim", m.side === "before" ? m.x > cut : m.x < cut);
      });
      tagL.classList.toggle("is-off", v < 18);
      tagR.classList.toggle("is-off", v > 82);
    }
    function set(v, ms) {
      var from = p;
      p = Math.max(0, Math.min(100, v));
      cancelAnimationFrame(raf);
      handle.setAttribute("aria-valuenow", String(Math.round(p)));
      handle.setAttribute("aria-valuetext", p >= 99.5 ? caps[0] : p <= 0.5 ? caps[1] :
        Math.round(p) + "% " + caps[0] + ", " + Math.round(100 - p) + "% " + caps[1]);
      pick.set(p >= 99.5 ? "0" : p <= 0.5 ? "1" : null);
      if (!ms || reduced() || from === p) { apply(p); return; }
      var t0 = null, to = p;
      raf = requestAnimationFrame(function step(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        apply(from + (to - from) * e);
        if (k < 1) raf = requestAnimationFrame(step);
      });
    }
    function fromEvent(e) {
      var r = stage.getBoundingClientRect();
      if (r.width > 0) set((e.clientX - r.left) / r.width * 100, 0);
    }
    // mouse: drag from anywhere; touch and pen: a horizontal drag or a tap (vertical swipes still scroll the page)
    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      touched = true; clearTimeout(nudge);
      if (raf) { cancelAnimationFrame(raf); raf = 0; apply(p); }
      drag = {id: e.pointerId, x: e.clientX, y: e.clientY, live: e.pointerType === "mouse"};
      if (drag.live) {
        if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
        fromEvent(e); e.preventDefault();
        handle.focus({preventScroll: true});
      }
    });
    stage.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.live) {
        if (Math.abs(e.clientX - drag.x) < 6 || Math.abs(e.clientX - drag.x) < Math.abs(e.clientY - drag.y)) return;
        drag.live = true;
        if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
      }
      fromEvent(e);
    });
    stage.addEventListener("pointerup", function (e) {
      if (drag && e.pointerId === drag.id && !drag.live &&
          Math.abs(e.clientX - drag.x) < 6 && Math.abs(e.clientY - drag.y) < 6) {
        var r = stage.getBoundingClientRect();
        if (r.width > 0) set((e.clientX - r.left) / r.width * 100, 380);
      }
      drag = null;
    });
    stage.addEventListener("pointercancel", function () { drag = null; });
    handle.addEventListener("keydown", function (e) {
      var step = {ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -25, PageUp: 25}[e.key];
      if (e.key === "Home") set(0, 380);
      else if (e.key === "End") set(100, 380);
      else if (step) set(p + step, 160);
      else return;
      touched = true; clearTimeout(nudge);
      e.preventDefault();
    });
    set(100, 0);
    // one sweep from the move to its result, once on screen (not with reduced motion, not once the reader has touched it)
    onceVisible(stage, 0.6, function () {
      if (reduced() || touched) return;
      nudge = setTimeout(function () { if (!touched) set(0, 1400); }, 900);
    });
  }

  /* ================= 2. Fig. 3: linear rollout vs forward thinking ================= */
  var F3 = {
    W: 2400, H: 834,
    // panel boxes [x0, y0, x1, y1]: (a) the linear ("vanilla") trace and (b) the forward-thinking trace
    panel: {linear: [0, 308, 1178, 834], forward: [1222, 0, 2400, 834]},
    // key frames, measured on the board outlines
    keys: [
      {focus: "linear", box: [907, 521, 1024, 641], tone: "bad", dashed: true, label: "near food first"},
      {focus: "linear", box: [907, 679, 1024, 800], tone: "bad", label: "caught"},
      {focus: "forward", box: [2242, 520, 2352, 634], tone: "bad", label: "caught"},
      {focus: "forward", box: [2242, 278, 2352, 393], tone: "good", label: "commit"}
    ]
  };
  function initFig3(root) {
    var img = root.querySelector("img");
    if (!img) return;
    var host = img.parentNode === root ? img : img.parentNode;   // the full-size link around the image, or the image
    var canvas = el("div", {class: "f3-canvas"});
    var stage = el("div", {class: "f3-stage"}, [canvas]);
    host.parentNode.insertBefore(stage, host);
    canvas.appendChild(host);

    function pct(v, of) { return (v / of * 100) + "%"; }
    var o = svg("svg", {class: "f3-svg", viewBox: "0 0 " + F3.W + " " + F3.H, "aria-hidden": "true", focusable: "false"});
    Object.keys(F3.panel).forEach(function (k) {
      var b = F3.panel[k];
      o.appendChild(svg("rect", {class: "f3-veil", "data-for": k === "linear" ? "forward" : "linear",
        x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], rx: 30}));
      o.appendChild(svg("rect", {class: "f3-focus", "data-for": k, "vector-effect": "non-scaling-stroke",
        x: b[0] + 3, y: b[1] + 3, width: b[2] - b[0] - 6, height: b[3] - b[1] - 6, rx: 28}));
    });
    var chips = [];
    F3.keys.forEach(function (k) {
      var b = k.box, pad = 12;
      o.appendChild(svg("rect", {class: "f3-key is-" + k.tone + (k.dashed ? " is-dashed" : ""), "data-for": k.focus,
        "vector-effect": "non-scaling-stroke", x: b[0] - pad, y: b[1] - pad, width: b[2] - b[0] + 2 * pad, height: b[3] - b[1] + 2 * pad, rx: 14}));
      var chip = el("span", {class: "f3-chip is-" + k.tone, "data-for": k.focus, "aria-hidden": "true", text: k.label,
        style: "left:" + pct((b[0] + b[2]) / 2, F3.W) + ";top:" + pct(b[3] + pad, F3.H)});
      chips.push(chip);
    });
    canvas.appendChild(o);
    chips.forEach(function (c) { canvas.appendChild(c); });

    var note = el("p", {class: "f3-note", "aria-live": "off"});
    var NOTE = {
      linear: "Linear rollout: it eats the near food first (dashed ring) and is caught (solid ring).",
      forward: "Forward thinking: it imagines both orders; left-first is caught (red), up-first eats every pellet (green), so it commits to Candidate 1."
    };
    var touched = false;
    var pick = seg("Fig. 3 route", [["linear", "Linear rollout"], ["forward", "Forward thinking"]], function (v) {
      touched = true; show(v, true);
    });
    var tools = el("div", {class: "f3-tools"}, [pick.node, note]);
    stage.parentNode.insertBefore(tools, stage);
    root.classList.add("is-live");

    function show(v, announce) {
      root.setAttribute("data-focus", v);
      pick.set(v);
      note.setAttribute("aria-live", announce ? "polite" : "off");   // only the reader's own switch is announced
      note.textContent = NOTE[v];
    }
    show("linear", false);
    // once on screen: after a beat, move the focus to forward thinking (not with reduced motion or after a click)
    onceVisible(stage, 0.5, function () {
      if (reduced()) return;
      setTimeout(function () { if (!touched) show("forward", false); }, 2600);
    });
  }

  /* ================= 3. Fig. 5: the same puzzle before vs after RL ================= */
  // The figure's own text. Segments: [text, classes]; "p1" = what the unified format keeps from Format 1
  // (blue), "p2" = from Format 2 (amber), "tk" = <think> tags, "b" = bold.
  var THINK = ["<think>", "tk"], END = ["</think>", "tk"];
  var FIG5 = {
    input: "Push all boxes onto their goals as the green monster.",
    before: [
      {tag: "Format 1", sub: "linear rollout", cls: "is-f1", rows: [
        {img: "fmt1", lead: [THINK, [" "], ["Let me imagine the next moves step by step.", "p1"]],
         acts: ["Down", "Left", "Down", "… Down"], end: [END]}
      ]},
      {tag: "Format 2", sub: "fork", cls: "is-f2", intro: [THINK, [" A fork appears here. Let me imagine both options before acting."]], rows: [
        {img: "c1", lead: [["Candidate 1:", "b p2"], [" start by pushing the upper box."]],
         acts: ["Left", "Up", "Right", "… Stop"], ok: true, result: [["Result:", "b p2"], [" this plan succeeds."]]},
        {img: "c2", lead: [["Candidate 2:", "b p2"], [" start by pushing the lower box."]],
         acts: ["Down", "Left", "Down", "… Down"], ok: false, result: [["Result:", "b p2"], [" this plan reaches deadlock."]],
         end: [["I will commit Candidate 1.", "b p2"], [" "], END]}
      ]}
    ],
    after: [
      {tag: "Unified format", sub: "Format 1, then Format 2", cls: "is-uni", rows: [
        {img: "u1", lead: [THINK, [" "], ["Let me imagine the next moves step by step.", "p1"]],
         acts: ["Left", "Up", "… Up", "Right"], ok: false, result: [["Result:", "b p2"], [" this plan reaches deadlock."]]},
        {img: "u2", lead: [["Next, "], ["Candidate 2:", "b p2"], [" start by approaching the lower box first."]],
         acts: ["Down", "Down", "… Up", "… Down"], ok: false, result: [["Result:", "b p2"], [" this plan reaches deadlock."]]},
        {img: "u3", lead: [["Next, "], ["Candidate 3:", "b p2"], [" start by pushing the upper box in a different direction."]],
         acts: ["Up", "… Down", "… Up", "… Stop"], ok: true, result: [["Result:", "b p2"], [" this plan succeeds."]],
         end: [["I will commit Candidate 3.", "b p2"], [" "], END]}
      ]}
    ]
  };
  function runs(list, cls) {
    var p = el("p", {class: cls});
    list.forEach(function (s) {
      if (!s[1]) { p.appendChild(document.createTextNode(s[0])); return; }
      p.appendChild(el(s[1].indexOf("tk") >= 0 ? "code" : "span", {class: s[1].split(" ").map(function (c) { return "t-" + c; }).join(" "), text: s[0]}));
    });
    return p;
  }
  function initFig5(root) {
    var dir = root.getAttribute("data-fig5") || "assets/images/fig5/";
    var stat = root.querySelector(".fig5-static");
    var views = {}, units = {before: [], after: []};

    function board(src, alt, cls) {
      return el("span", {class: "f5-board " + (cls || "")}, [
        el("img", {src: dir + src + ".webp", width: "124", height: "124", alt: alt, loading: "lazy", decoding: "async"})
      ]);
    }
    function buildView(key) {
      var v = el("div", {class: "f5-view", "data-view": key});
      FIG5[key].forEach(function (blk) {
        var b = el("section", {class: "f5-block " + blk.cls, "aria-label": blk.tag + ", " + blk.sub});
        b.appendChild(el("p", {class: "f5-tag"}, [el("strong", {text: blk.tag}), " · " + blk.sub]));
        if (blk.intro) b.appendChild(runs(blk.intro, "f5-intro"));
        blk.rows.forEach(function (r) {
          var row = el("div", {class: "f5-row" + (r.ok === true ? " is-ok" : r.ok === false ? " is-bad" : "")});
          row.appendChild(runs(r.lead, "f5-lead"));
          var seq = el("ol", {class: "f5-seq"});
          r.acts.forEach(function (a, i) {
            var last = i === r.acts.length - 1;
            var cls = last && r.ok === true ? "is-good" : last && r.ok === false ? "is-dead" : "";
            var bd = board(r.img + "_" + (i + 1), "Imagined board after " + a.replace("… ", "") + (cls === "is-good" ? ": solved" : cls === "is-dead" ? ": deadlock" : ""), cls);
            if (cls) bd.appendChild(el("span", {class: "f5-badge", html: cls === "is-good" ? ICON.check : ICON.cross}));
            var li = el("li", {class: "f5-step"}, [el("span", {class: "f5-act", text: a}), bd]);
            seq.appendChild(li);
            units[key].push({li: li, row: row, last: last});
          });
          row.appendChild(seq);
          var out = el("div", {class: "f5-out"});
          if (r.result) out.appendChild(runs(r.result, "f5-result"));
          if (r.end) out.appendChild(runs(r.end, "f5-end"));
          row.appendChild(out);
          b.appendChild(row);
        });
        v.appendChild(b);
      });
      return v;
    }
    views.before = buildView("before");
    views.after = buildView("after");

    var input = el("div", {class: "f5-input"}, [
      el("span", {class: "f5-board is-real"}, [el("img", {src: dir + "input.webp", width: "124", height: "124", alt: "Input: the real Sokoban board", loading: "lazy", decoding: "async"})]),
      el("p", {}, [el("span", {class: "f5-input-tag", text: "Input"}), " " + FIG5.input])
    ]);
    var counter = el("span", {class: "f5-count", "aria-hidden": "true"});
    var bPrev = el("button", {type: "button", class: "f5-btn", "aria-label": "Previous step", html: ICON.prev});
    var bNext = el("button", {type: "button", class: "f5-btn", "aria-label": "Next step", html: ICON.next});
    var bPlay = el("button", {type: "button", class: "f5-btn f5-btn-text", html: ICON.replay + "<span>Replay</span>"});
    var live = el("p", {class: "visually-hidden", "aria-live": "polite"});
    var pick = seg("Fig. 5", [["before", "Before RL"], ["after", "After RL"]], function (v) { touched = true; showView(v, true); });
    var head = el("div", {class: "f5-head"}, [pick.node, el("div", {class: "f5-steps", role: "group", "aria-label": "Plan steps"}, [bPrev, counter, bNext, bPlay]), live]);
    var stack = el("div", {class: "f5-stack", tabindex: "0", role: "region",
      "aria-label": "Figure 5, step by step. Left and right arrow keys step through the plans."}, [views.before, views.after]);
    var legend = el("p", {class: "f5-legend"}, [
      "Kept in the unified format: ",
      el("span", {class: "t-p1", text: "Format 1"}), " step-by-step rollout, ",
      el("span", {class: "t-p2", text: "Format 2"}), " candidates, results and commit."
    ]);
    var app = el("div", {class: "f5"}, [head, input, stack, legend]);

    root.insertBefore(app, root.firstChild);
    root.classList.add("is-live");
    if (stat) stat.hidden = true;
    var full = root.querySelector(".fig5-full");
    if (full) full.hidden = false;

    var view = "before", step = 0, timer = null, touched = false;
    function total() { return units[view].length; }
    function render(announce) {
      units[view].forEach(function (u, i) {
        u.li.classList.toggle("is-on", i < step);
        u.li.classList.toggle("is-now", i === step - 1);
        if (u.last) u.row.classList.toggle("is-done", i < step);
      });
      counter.textContent = "Step " + step + " / " + total();
      // aria-disabled, not disabled: a focused button keeps its focus (and its arrow keys) at either end
      bPrev.setAttribute("aria-disabled", String(step <= 0));
      bNext.setAttribute("aria-disabled", String(step >= total()));
      if (announce) {
        var u = units[view][step - 1];
        live.textContent = !u ? "Start of the plans." :
          u.li.querySelector(".f5-act").textContent.replace("… ", "") + "." + (u.last ? " " + outText(u.row) : "");
      }
    }
    // a plan's result and commit lines as one sentence each, without the <think> tags
    function outText(row) {
      return Array.prototype.map.call(row.querySelectorAll(".f5-out p"), function (q) {
        return Array.prototype.filter.call(q.childNodes, function (n) { return !(n.classList && n.classList.contains("t-tk")); })
          .map(function (n) { return n.textContent; }).join("").replace(/\s+/g, " ").trim();
      }).join(" ");
    }
    function stop() { clearInterval(timer); timer = null; root.classList.remove("is-playing"); }
    function play() {
      stop();
      if (reduced()) { step = total(); render(false); return; }
      step = 0; render(false);
      root.classList.add("is-playing");
      timer = setInterval(function () {
        step++; render(false);
        if (step >= total()) stop();
      }, 620);
    }
    function goto(s) { stop(); step = Math.max(0, Math.min(total(), s)); render(true); }
    function showView(v, restart) {
      view = v;
      pick.set(v);
      Object.keys(views).forEach(function (k) {
        var on = k === v;
        views[k].classList.toggle("is-on", on);
        if (on) { views[k].removeAttribute("aria-hidden"); views[k].removeAttribute("inert"); }
        else { views[k].setAttribute("aria-hidden", "true"); views[k].setAttribute("inert", ""); }
      });
      // a switch replays the plans of that view; with reduced motion they show complete
      if (restart && !reduced()) play();
      else { stop(); step = reduced() ? total() : 0; render(false); }
    }
    bPrev.addEventListener("click", function () { if (step > 0) { touched = true; goto(step - 1); } });
    bNext.addEventListener("click", function () { if (step < total()) { touched = true; goto(step + 1); } });
    bPlay.addEventListener("click", function () { touched = true; play(); });
    app.addEventListener("keydown", function (e) {
      if (e.target && e.target.closest && e.target.closest(".seg")) return;   // the view buttons keep their keys
      var t = {ArrowLeft: step - 1, ArrowRight: step + 1, Home: 0, End: total()}[e.key];
      if (t === undefined) return;
      touched = true; goto(t); e.preventDefault();
    });
    showView("before", false);
    // auto-advance once, when the figure first scrolls into view
    onceVisible(stack, 0.3, function () { if (!touched && !reduced()) play(); });
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-compare]"), initCompare);
    Array.prototype.forEach.call(document.querySelectorAll("[data-fig3]"), initFig3);
    Array.prototype.forEach.call(document.querySelectorAll("[data-fig5]"), initFig5);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
