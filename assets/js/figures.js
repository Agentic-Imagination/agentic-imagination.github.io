/* Agima project page: interactive versions of the static paper figures.
   (The planning-trap animations are in traps.js.)
   - Fig. 5 ([data-fig5]): the same Sokoban puzzle before vs after RL, rebuilt in HTML from board
     thumbnails cropped out of the figure (assets/images/fig5/, see tools/figures/). Plans reveal step by step.
   Progressive enhancement: each figure's plain images are the no-JavaScript version. Plain ES5, no dependencies. */
(function () {
  "use strict";
  if (!document.querySelector || !window.addEventListener) return;

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
    replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/></svg>'
  };

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
    // Each block is a lane on the step clock: Before RL's two formats are alternatives, not a sequence, so
    // both lanes reveal at the same time; After RL has a single lane. units[view] = [lane, ...].
    function plain(list) { return list.filter(function (s) { return !s[1] || s[1].indexOf("tk") < 0; }).map(function (s) { return s[0]; }).join("").trim(); }
    function buildView(key) {
      var v = el("div", {class: "f5-view is-on", "data-view": key});
      v.appendChild(el("p", {class: "f5-view-title", text: key === "after"
        ? "After RL, the model plans in one unified format."
        : "Before RL, the model plans in two separate formats."}));
      FIG5[key].forEach(function (blk) {
        var b = el("section", {class: "f5-block " + blk.cls, "aria-label": blk.tag + ", " + blk.sub});
        var lane = [];
        lane.tag = (key === "after" ? "After RL, " : "Before RL, ") + blk.tag;
        units[key].push(lane);
        b.appendChild(el("p", {class: "f5-tag"}, [el("strong", {text: blk.tag}), " (" + blk.sub + ")"]));
        if (blk.intro) b.appendChild(runs(blk.intro, "f5-intro"));
        blk.rows.forEach(function (r) {
          var row = el("div", {class: "f5-row" + (r.ok === true ? " is-ok" : r.ok === false ? " is-bad" : "")});
          row.appendChild(runs(r.lead, "f5-lead"));
          var seq = el("ol", {class: "f5-seq"});
          r.acts.forEach(function (a, i) {
            var last = i === r.acts.length - 1;
            var cls = last && r.ok === true ? "is-good" : last && r.ok === false ? "is-dead" : "";
            var alt = "Imagined board after " + a.replace("… ", "") + (cls === "is-good" ? ": solved" : cls === "is-dead" ? ": deadlock" : "");
            var bd = board(r.img + "_" + (i + 1), alt, cls);
            // lightbox.js: one group per view, captioned with the view, the format and the plan
            bd.setAttribute("data-lightbox", "fig5-" + key);
            bd.firstChild.setAttribute("data-lb-caption", (key === "before" ? "Figure 7, before RL. " : "Figure 7, after RL. ") + blk.tag + ". " + plain(r.lead) + " " + alt + ".");
            if (cls) bd.appendChild(el("span", {class: "f5-badge", html: cls === "is-good" ? ICON.check : ICON.cross}));
            var li = el("li", {class: "f5-step"}, [el("span", {class: "f5-act", text: a}), bd]);
            seq.appendChild(li);
            lane.push({li: li, row: row, last: last});
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
      el("span", {class: "f5-board is-real", "data-lightbox": "fig5-before fig5-after"}, [el("img", {src: dir + "input.webp", width: "124", height: "124", alt: "Input: the real Sokoban board", loading: "lazy", decoding: "async",
        "data-lb-caption": "Figure 7. Input: the real Sokoban board. " + FIG5.input})]),
      el("p", {}, [el("span", {class: "f5-input-tag", text: "Input:"}), " " + FIG5.input])
    ]);
    var counter = el("span", {class: "f5-count", "aria-hidden": "true"});
    var bPrev = el("button", {type: "button", class: "f5-btn", "aria-label": "Previous step", html: ICON.prev});
    var bNext = el("button", {type: "button", class: "f5-btn", "aria-label": "Next step", html: ICON.next});
    var bPlay = el("button", {type: "button", class: "f5-btn f5-btn-text", html: ICON.replay + "<span>Replay</span>"});
    var live = el("p", {class: "visually-hidden", "aria-live": "polite"});
    var head = el("div", {class: "f5-head"}, [el("div", {class: "f5-steps", role: "group", "aria-label": "Plan steps"}, [bPrev, counter, bNext, bPlay]), live]);
    var stack = el("div", {class: "f5-stack", tabindex: "0", role: "region",
      "aria-label": "Figure 7, step by step. Left and right arrow keys step through the plans; Enter enlarges the boards."}, [views.before, views.after]);
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

    // Both views are always shown, Before RL then After RL (the new format); one clock reveals every lane of both.
    var lanes = units.before.concat(units.after), step = 0, timer = null, touched = false;
    // the clock runs to the longest lane; a shorter lane stays complete once it has finished
    function total() { return Math.max.apply(null, lanes.map(function (l) { return l.length; })); }
    function render(announce) {
      var said = [];
      lanes.forEach(function (lane) {
        lane.forEach(function (u, i) {
          u.li.classList.toggle("is-on", i < step);
          u.li.classList.toggle("is-now", i === step - 1);
          if (u.last) u.row.classList.toggle("is-done", i < step);
        });
        var u = lane[step - 1];
        if (u) said.push(lane.tag + ": " +
          u.li.querySelector(".f5-act").textContent.replace("… ", "") + "." + (u.last ? " " + outText(u.row) : ""));
      });
      counter.textContent = "Step " + step + " of " + total();
      // aria-disabled, not disabled: a focused button keeps its focus (and its arrow keys) at either end
      bPrev.setAttribute("aria-disabled", String(step <= 0));
      bNext.setAttribute("aria-disabled", String(step >= total()));
      if (announce) live.textContent = step <= 0 ? "Start of the plans." : said.join(" ");
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
      }, 230);
    }
    function goto(s) { stop(); step = Math.max(0, Math.min(total(), s)); render(true); }
    bPrev.addEventListener("click", function () { if (step > 0) { touched = true; goto(step - 1); } });
    bNext.addEventListener("click", function () { if (step < total()) { touched = true; goto(step + 1); } });
    bPlay.addEventListener("click", function () { touched = true; play(); });
    app.addEventListener("keydown", function (e) {
      var t = {ArrowLeft: step - 1, ArrowRight: step + 1, Home: 0, End: total()}[e.key];
      if (t === undefined) return;
      touched = true; goto(t); e.preventDefault();
    });
    step = reduced() ? total() : 0; render(false);
    // auto-advance once, when the figure first scrolls into view
    onceVisible(stack, 0.3, function () { if (!touched && !reduced()) play(); });
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-fig5]"), initFig5);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
