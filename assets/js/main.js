/* Agima project page: results charts and tables, the Figure 1 highlight, video playback, plus the
   page chrome (teaser sound toggle, scroll reveal, section nav / reading progress).
   The RL charts live in rl-charts.js. All numbers are copied from the paper (Tables 1-3). */
(function () {
  "use strict";

  /* ---------- data ---------- */
  var ENVS = ["Pacman", "Maze2D", "Sokoban", "PushT"];
  // Table 1: success on the hard splits (PushT = success on the far split). null = not evaluated.
  var K_RESULTS = {
    "1": [
      ["Gemini 3.1 Pro", "closed", [0, 38, 3, 0]],
      ["GPT-5.6 Sol", "closed", [0, 48, 32, 0]],
      ["Agima-A7B", "ours", [84, 62, 47, 42]]
    ],
    "3": [
      ["Gemini 3.1 Pro", "closed", [0, 21, 4, 0]],
      ["GPT-5.6 Sol", "closed", [0, 39, 26, 0]],
      ["Qwen2.5-VL-7B", "sft", [0, 40, 4, 4]],
      ["Qwen3-VL-8B", "sft", [0, 85, 10, 6]],
      ["Agima-A7B (No Imagine)", "noimg", [25, 54, 10, 12]],
      ["Agima-A7B", "ours", [38, 59, 53, 24]]
    ],
    "5": [
      ["Gemini 3.1 Pro", "closed", [0, 20, 6, 0]],
      ["GPT-5.6 Sol", "closed", [1, 34, 20, 1]],
      ["Qwen2.5-VL-7B", "sft", [0, 28, 0, 2]],
      ["Qwen3-VL-8B", "sft", [0, 30, 3, 1]],
      ["Agima-A7B (No Imagine)", "noimg", [1, 23, 2, 1]],
      ["Agima-A7B", "ours", [37, 40, 40, 18]]
    ],
    "10": [
      ["Gemini 3.1 Pro", "closed", [0, 15, 4, 0]],
      ["GPT-5.6 Sol", "closed", [1, 34, 23, 0]],
      ["Qwen2.5-VL-7B", "sft", [0, 0, 0, 2]],
      ["Qwen3-VL-8B", "sft", [0, 0, 0, 0]],
      ["Agima-A7B (No Imagine)", "noimg", [0, 2, 0, 1]],
      ["Agima-A7B", "ours", [7, 21, 15, 9]]
    ],
    "inf": [
      ["Gemini 3.1 Pro", "closed", [0, 9, 13, 0]],
      ["GPT-5.6 Sol", "closed", [2, 36, 21, 0]],
      ["Qwen2.5-VL-7B", "sft", [0, 0, 0, 2]],
      ["Qwen3-VL-8B", "sft", [0, 0, 0, 3]],
      ["Agima-A7B (No Imagine)", "noimg", [0, 0, 0, 3]],
      ["Agima-A7B", "ours", [6, 3, 19, 3]]
    ]
  };
  var K_NOTE = {
    "1": "K = 1: a real observation after every action (reactive reference).",
    "3": "K = 3: 3 actions per real observation.",
    "5": "K = 5: 5 actions per real observation.",
    "10": "K = 10: 10 actions per real observation.",
    "inf": "K = ∞: one real observation at the start, then open-loop."
  };
  // Table 2: imagined frames replaced at inference (K = 5, hard splits).
  var ABLATION = {
    conditions: ["No Imagine", "Own predictions", "Blank", "Stale", "Oracle"],
    notes: ["action-only model", "the model's own imagined frames", "uniform gray image",
            "latest real observation", "ground-truth frames for the proposed actions"],
    Sokoban: [2, 40, 1, 0, 43],
    Pacman: [1, 37, 0, 0, 81]
  };
  // Table 3 (a) Sokoban and (b) Pacman route-order traps, K = infinity.
  var REASONING = {
    sokoban: {
      cols: ["Deadlock 2-box", "Deadlock 3-box", "Deadlock 4-box", "Fork 2-box", "Fork 3-box", "Fork 4-box"],
      rows: [
        ["Gemini 3.1 Pro", "closed", [74, 42, 19, 84, 34, 7]],
        ["GPT-5.6 Sol", "closed", [44, 23, 17, 60, 20, 12]],
        ["Qwen2.5-VL-7B", "sft", [1, 2, 0, 12, 2, 0]],
        ["Qwen3-VL-8B", "sft", [6, 1, 1, 19, 2, 0]],
        ["Agima-A7B (No Imagine)", "noimg", [12, 5, 1, 15, 2, 1]],
        ["Agima-A7B", "ours-lin", [22, 39, 27, 87, 34, 22]],
        ["Agima-A7B (Branching)", "ours", [30, 39, 32, 84, 39, 32]],
        ["Agima-A7B (Forward)", "ours", [60, 48, 24, 93, 46, 22]]
      ]
    },
    pacman: {
      cols: ["G8 / F2", "G8 / F4", "G8 / F6", "G8 / F8", "G10 / F8"],
      rows: [
        ["Gemini 3.1 Pro", "closed", [1, 1, 0, 1, 0]],
        ["GPT-5.6 Sol", "closed", [16, 19, 6, 8, 0]],
        ["Qwen2.5-VL-7B", "sft", [0, 0, 0, 0, 0]],
        ["Qwen3-VL-8B", "sft", [0, 0, 0, 1, 0]],
        ["Agima-A7B (No Imagine)", "noimg", [3, 0, 2, 0, 0]],
        ["Agima-A7B", "ours-lin", [7, 22, 16, 16, 5]],
        ["Agima-A7B (Forward)", "ours", [40, 54, 41, 37, 12]]
      ]
    }
  };
  var KLABEL = {"1": "1", "3": "3", "5": "5", "10": "10", "inf": "∞"};

  /* ---------- helpers ---------- */
  var GROUPS = {closed: "Closed-source", tuned: "Fine-tuned on our training data"};
  function groupOf(type) { return type === "closed" ? "closed" : "tuned"; }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  // A group of toggle buttons; exactly one is pressed.
  function segmented(container, name, options, current, onChange) {
    var group = el("div", {class: "seg", role: "group", "aria-label": name});
    options.forEach(function (o) {
      var b = el("button", {type: "button", class: "seg-btn", "data-value": o[0],
                             "aria-pressed": String(o[0] === current), id: name.replace(/\W+/g, "-") + "-" + o[0], text: o[1]});
      b.addEventListener("click", function () {
        group.querySelectorAll(".seg-btn").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        onChange(o[0]);
      });
      group.appendChild(b);
    });
    container.appendChild(group);
    return group;
  }
  // "Auto-play on / off" switch for anything that moves by itself (WCAG 2.2.2: pause, stop, hide).
  // `name` is the accessible name; it starts with the visible text "Auto-play".
  function autoToggle(name, on, onChange) {
    var state = el("span", {class: "auto-state", "aria-hidden": "true"});
    var b = el("button", {type: "button", class: "auto-toggle", "aria-label": name}, [
      el("span", {"aria-hidden": "true", html: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>'}),
      el("span", {text: "Auto-play"}), state
    ]);
    function set(v, quiet) {
      on = !!v;
      b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("is-on", on);
      state.textContent = on ? "on" : "off";
      if (!quiet) onChange(on);
    }
    b.addEventListener("click", function () { set(!on); });
    b.setOn = set;
    set(on, true);
    return b;
  }
  // true while the pointer is over, or keyboard focus is inside, any of the nodes
  function isHeld(nodes) {
    var a = document.activeElement;
    return nodes.some(function (n) { return n && (n.matches(":hover") || (a && a !== document.body && n.contains(a))); });
  }
  var tip = null;
  function tooltip(target, text) {
    target.addEventListener("mouseenter", function (e) {
      if (!tip) { tip = el("div", {class: "chart-tip", role: "status"}); document.body.appendChild(tip); }
      tip.textContent = text; tip.hidden = false; place(e);
    });
    target.addEventListener("mousemove", place);
    target.addEventListener("mouseleave", function () { if (tip) tip.hidden = true; });
    // keep the tooltip inside the viewport: flip left of / above the pointer near the right and bottom edges
    function place(e) {
      if (!tip) return;
      var r = tip.getBoundingClientRect();
      var vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
      var x = e.clientX + 14, y = e.clientY + 14;
      if (x + r.width > vw - 8) x = Math.max(8, e.clientX - r.width - 14);
      if (y + r.height > vh - 8) y = Math.max(8, e.clientY - r.height - 10);
      tip.style.left = x + "px"; tip.style.top = y + "px";
    }
  }

  /* ---------- 1. K results: horizontal bars per environment ---------- */
  function renderKResults(root) {
    var state = {k: "5"};
    var controls = el("div", {class: "chart-controls"});
    root.appendChild(controls);
    controls.appendChild(el("h3", {text: "Success across K"}));
    segmented(controls, "Actions before feedback K", [["1", "K = 1"], ["3", "K = 3"], ["5", "K = 5"], ["10", "K = 10"], ["inf", "K = ∞"]], state.k, function (v) { state.k = v; draw(); });
    var toggle = el("button", {type: "button", class: "link-btn", id: "k-results-table-toggle", text: "Show as table"});
    controls.appendChild(toggle);
    var note = el("p", {class: "chart-note"});
    var grid = el("div", {class: "bar-grid"});
    var table = el("div", {class: "table-wrap", hidden: "", tabindex: "0", role: "region", "aria-label": "Success across K, as a table"});
    root.appendChild(note); root.appendChild(grid); root.appendChild(table);
    root.appendChild(legend());
    toggle.addEventListener("click", function () {
      var show = table.hidden; table.hidden = !show; grid.hidden = show;
      toggle.textContent = show ? "Show as chart" : "Show as table";
    });
    function draw() {
      var rows = K_RESULTS[state.k];
      note.textContent = K_NOTE[state.k];
      grid.innerHTML = "";
      ENVS.forEach(function (env, ei) {
        var panel = el("div", {class: "bar-panel"}, [el("h4", {text: env})]);
        var lastGroup = null;
        rows.forEach(function (r) {
          var g = groupOf(r[1]);
          if (g !== lastGroup) { panel.appendChild(el("div", {class: "bar-group", text: GROUPS[g]})); lastGroup = g; }
          var v = r[2][ei];
          var bar = el("div", {class: "bar bar-" + r[1], style: "width:" + Math.max(v, 0.6) + "%"});
          var row = el("div", {class: "bar-row"}, [
            el("span", {class: "bar-name", text: r[0].replace("Agima-A7B", "Agima")}),
            el("span", {class: "bar-track"}, [bar]),
            el("span", {class: "bar-val", text: v + "%"})
          ]);
          tooltip(row, r[0] + " · " + env + " · K = " + KLABEL[state.k] + ": " + v + "% success");
          panel.appendChild(row);
        });
        grid.appendChild(panel);
      });
      table.innerHTML = "";
      var t = el("table", {class: "data-table"});
      var head = el("tr", {}, [el("th", {text: "Method (K = " + KLABEL[state.k] + ")"})].concat(ENVS.map(function (e) { return el("th", {text: e}); })));
      t.appendChild(el("thead", {}, [head]));
      var tb = el("tbody");
      var lastG = null;
      rows.forEach(function (r) {
        var g = groupOf(r[1]);
        if (g !== lastG) { tb.appendChild(el("tr", {class: "group-row"}, [el("td", {colspan: String(ENVS.length + 1), text: GROUPS[g]})])); lastG = g; }
        tb.appendChild(el("tr", {class: r[1] === "ours" ? "is-ours" : r[1] === "closed" ? "is-closed" : ""}, [el("td", {text: r[0]})].concat(r[2].map(function (v) { return el("td", {text: v + "%"}); }))));
      });
      t.appendChild(tb); table.appendChild(t);
    }
    draw();
  }
  function legend() {
    return el("div", {class: "chart-legend"}, [
      el("span", {}, [el("i", {class: "sw sw-ours"}), document.createTextNode("Agima (fine-tuned)")]),
      el("span", {}, [el("i", {class: "sw sw-noimg"}), document.createTextNode("Agima No Imagine (fine-tuned)")]),
      el("span", {}, [el("i", {class: "sw sw-other"}), document.createTextNode("Qwen2.5-VL / Qwen3-VL (fine-tuned)")]),
      el("span", {}, [el("i", {class: "sw sw-closed"}), document.createTextNode("Gemini / GPT (not fine-tuned)")])
    ]);
  }

  /* ---------- 2. imagination ablation ---------- */
  function renderAblation(root) {
    var grid = el("div", {class: "bar-grid bar-grid-2"});
    ["Sokoban", "Pacman"].forEach(function (env) {
      var panel = el("div", {class: "bar-panel"}, [el("h4", {text: env + " (K = 5)"})]);
      ABLATION.conditions.forEach(function (c, i) {
        var v = ABLATION[env][i];
        var cls = c === "Own predictions" ? "ours" : c === "Oracle" ? "oracle" : c === "No Imagine" ? "noimg" : "other";
        var row = el("div", {class: "bar-row"}, [
          el("span", {class: "bar-name", text: c}),
          el("span", {class: "bar-track"}, [el("div", {class: "bar bar-" + cls, style: "width:" + Math.max(v, 0.6) + "%"})]),
          el("span", {class: "bar-val", text: v + "%"})
        ]);
        tooltip(row, env + " · " + c + " (" + ABLATION.notes[i] + "): " + v + "%");
        panel.appendChild(row);
      });
      grid.appendChild(panel);
    });
    root.appendChild(grid);
  }

  /* ---------- 3. reasoning tables ---------- */
  function renderReasoning(root) {
    var state = {task: "sokoban"};
    var controls = el("div", {class: "chart-controls"});
    root.appendChild(controls);
    controls.appendChild(el("h3", {text: "Success on planning traps"}));
    segmented(controls, "Reasoning task", [["sokoban", "Sokoban"], ["pacman", "Pacman"]], state.task, function (v) { state.task = v; draw(); });
    var wrap = el("div", {class: "table-wrap", tabindex: "0", role: "region", "aria-label": "Success on planning traps table"});
    root.appendChild(wrap);
    function draw() {
      var d = REASONING[state.task];
      var best = d.cols.map(function (_, ci) { return Math.max.apply(null, d.rows.map(function (r) { return r[2][ci]; })); });
      var t = el("table", {class: "data-table"});
      t.appendChild(el("thead", {}, [el("tr", {}, [el("th", {text: "Method"})].concat(d.cols.map(function (c) { return el("th", {text: c}); })))]));
      var tb = el("tbody");
      var lin = d.rows.filter(function (r) { return r[1] === "ours-lin"; })[0];
      var lastG = null;
      d.rows.forEach(function (r) {
        var g = groupOf(r[1]);
        if (g !== lastG) { tb.appendChild(el("tr", {class: "group-row"}, [el("td", {colspan: String(d.cols.length + 1), text: GROUPS[g]})])); lastG = g; }
        tb.appendChild(el("tr", {class: r[1] === "ours" ? "is-ours" : r[1] === "ours-lin" ? "is-lin" : r[1] === "closed" ? "is-closed" : ""},
          [el("td", {text: r[0]})].concat(r[2].map(function (v, ci) {
            var delta = r[1] === "ours" ? v - lin[2][ci] : null;
            var cell = el("td", {class: v === best[ci] ? "is-best" : ""}, [document.createTextNode(v + "%")]);
            if (delta !== null) cell.appendChild(el("span", {class: "delta " + (delta > 0 ? "up" : delta < 0 ? "down" : "flat"), text: (delta > 0 ? "+" : "") + delta}));
            return cell;
          }))));
      });
      t.appendChild(tb);
      wrap.innerHTML = ""; wrap.appendChild(t);
      wrap.appendChild(el("p", {class: "table-foot", text: state.task === "sokoban"
        ? "All models trained on two-box Sokoban and run at K = ∞. Bold = best in column; small numbers = change vs. linear-rollout Agima (points)."
        : "Route-order traps: collecting the nearer food first leaves no safe way to finish. G = grid size, F = food items. K = ∞."}));
    }
    draw();
  }


  /* ---------- BibTeX copy button ---------- */
  function initCopy() {
    document.querySelectorAll("[data-copy]").forEach(function (b) {
      b.addEventListener("click", function () {
        var src = document.getElementById(b.getAttribute("data-copy"));
        var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(src.textContent).then(done, function () { select(src); });
        else select(src);
      });
    });
    function select(n) { var r = document.createRange(); r.selectNodeContents(n); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  }
  /* ---------- Figure 1: step through linear rollout / branching / forward thinking ---------- */
  function initImagineAnimation() {
    var diagram = document.querySelector(".team-diagram");
    var hl = document.querySelector(".team-highlight-primary");
    var cards = Array.prototype.slice.call(document.querySelectorAll("[data-format-step]"));
    if (!diagram || !hl || !cards.length) return;
    // Regions of fig1_overview (percent of the image): panel (b), then the two halves of panel (c).
    var steps = [
      {name: "linear", box: {left: "50.4%", top: "0.3%", width: "49.3%", height: "24.2%"}},
      {name: "branch", box: {left: "0.6%", top: "27.8%", width: "52.6%", height: "53.2%"}},
      {name: "forward", box: {left: "45.2%", top: "27.8%", width: "54.5%", height: "53.2%"}}
    ];
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var idx = 0, timer = null;
    // Auto-advance runs while the figure is on screen, unless switched off (or the reader picked a card)
    // or held (pointer over / keyboard focus in the figure or the cards). Off from the start with reduced motion.
    var auto = !reduce, visible = !("IntersectionObserver" in window), held = false;
    var grid = cards[0].parentNode;
    // Each card's heading becomes a real toggle button, so it is announced as one (pressed = shown in the figure).
    var btns = cards.map(function (c) {
      var h = c.querySelector("h3");
      if (!h) return null;
      var b = el("button", {type: "button", class: "format-btn", "aria-pressed": "false"});
      while (h.firstChild) b.appendChild(h.firstChild);
      h.appendChild(b);
      return b;
    });
    function show(i) {
      idx = i;
      Object.keys(steps[i].box).forEach(function (k) { hl.style[k] = steps[i].box[k]; });
      cards.forEach(function (c, j) {
        var on = c.getAttribute("data-format-step") === steps[i].name;
        c.classList.toggle("is-active", on);
        if (btns[j]) btns[j].setAttribute("aria-pressed", String(on));
      });
    }
    function schedule() {
      clearTimeout(timer);
      if (auto && visible && !held) timer = setTimeout(function () { show((idx + 1) % steps.length); schedule(); }, 3000);
    }
    var toggle = autoToggle("Auto-play the Figure 1 highlight", auto, function (v) {
      auto = v;
      if (v) diagram.classList.add("is-active");
      schedule();
    });
    cards.forEach(function (c, i) {
      // the whole card is clickable; the heading button gives keyboard and screen-reader access
      c.addEventListener("click", function () {
        diagram.classList.add("is-active");
        show(i);
        toggle.setOn(false);            // the reader's choice stays put
      });
    });
    function recheck() { held = isHeld([diagram, grid]); schedule(); }
    [diagram, grid].forEach(function (n) {
      ["mouseenter", "mouseleave", "focusin", "focusout"].forEach(function (ev) {
        n.addEventListener(ev, function () { setTimeout(recheck, 0); });
      });
    });
    var tools = document.querySelector(".imagine-figure .figure-tools");
    if (tools) { tools.appendChild(toggle); tools.hidden = false; }
    show(0);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) diagram.classList.add("is-active");
        schedule();
      }, {threshold: 0.35}).observe(diagram);
    } else { diagram.classList.add("is-active"); schedule(); }
  }

  /* ---------- environment clips: an Auto-play switch (stills when off; off with reduced motion) ---------- */
  function initClips() {
    var grid = document.querySelector(".env-grid");
    if (!grid) return;
    var imgs = Array.prototype.slice.call(grid.querySelectorAll('img[src$=".gif"]'));
    if (!imgs.length) return;
    imgs.forEach(function (im) {
      var gif = im.getAttribute("src");
      im.setAttribute("data-gif", gif);
      im.setAttribute("data-still", gif.replace(/\.gif$/, "_still.webp"));   // first frame of the clip
    });
    function set(on) {
      imgs.forEach(function (im) {
        var want = im.getAttribute(on ? "data-gif" : "data-still");
        if (im.getAttribute("src") !== want) im.setAttribute("src", want);
      });
    }
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var toggle = autoToggle("Auto-play the environment clips", !reduce, set);
    grid.parentNode.insertBefore(el("div", {class: "env-controls"}, [toggle]), grid);
    if (reduce) set(false);
  }

  /* ---------- videos: autoplay muted loop, played only while on screen ---------- */
  // Every <video> carries autoplay muted loop playsinline in the HTML, so it also plays with JS off.
  // With IntersectionObserver, JS owns playback instead: the autoplay attribute is dropped, a clip that
  // is not near the screen stops loading (it keeps its poster, preload="none"), and the observer plays
  // each one while it is on screen. A clip the reader paused stays paused. With reduced motion they all
  // start paused on the poster. Every video gets a small play/pause button (clicking it works too).
  function initVideos() {
    var videos = Array.prototype.slice.call(document.querySelectorAll("video"));
    if (!videos.length) return;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var hasIO = "IntersectionObserver" in window;
    var MARGIN = 80;   // px: a video this close to the screen counts as on screen
    var ICONS = '<svg class="ico ico-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13M15.5 5.5v13"/></svg>' +
                '<svg class="ico ico-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
    function play(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    function near(v) {
      var r = v.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
      return r.bottom > -MARGIN && r.top < vh + MARGIN;
    }
    var states = videos.map(function (v) {
      // visible: on screen (as last reported by the observer); known: the observer has reported it at least once;
      // held: the reader (or reduced motion) wants it paused. Only the play/pause button sets or clears held.
      var s = {v: v, visible: !hasIO, known: !hasIO, held: reduce};
      if (hasIO || reduce) {
        v.autoplay = false; v.removeAttribute("autoplay");
        if (reduce || !near(v)) {
          // stop the download the autoplay attribute started; load() keeps the poster
          v.pause(); v.preload = "none"; v.load();
        }
      }
      // a clip that starts while off screen (the browser, or a late autoplay) is paused again;
      // one started on screen (the play button, the teaser's sound button) is no longer held
      v.addEventListener("play", function () { if (hasIO && s.known && !s.visible) v.pause(); else s.held = false; });
      // the teaser's native controls are only the no-JS fallback (they show a running time); the button replaces them
      v.controls = false; v.removeAttribute("controls");
      if (v.parentNode) {
        var box = v.parentNode;
        var name = v.getAttribute("data-name") || "animation";
        var btn = el("button", {type: "button", class: "clip-toggle", html: ICONS});
        box.appendChild(btn);
        var sync = function () {
          btn.setAttribute("aria-label", (v.paused ? "Play " : "Pause ") + name);
          btn.classList.toggle("is-paused", v.paused);
          box.classList.toggle("is-held", v.paused && s.held);
        };
        var toggle = function () {
          if (v.paused) { s.held = false; play(v); } else { s.held = true; v.pause(); }
          sync();
        };
        btn.addEventListener("click", toggle);
        v.addEventListener("click", toggle);
        ["play", "playing", "pause"].forEach(function (ev) { v.addEventListener(ev, sync); });
        sync();
      }
      return s;
    });
    if (!hasIO) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var s = null;
        for (var i = 0; i < states.length; i++) if (states[i].v === e.target) s = states[i];
        if (!s) return;
        s.known = true;
        s.visible = e.isIntersecting;
        if (s.visible) { if (!s.held && s.v.paused && !document.hidden) play(s.v); }
        else if (!s.v.paused) s.v.pause();
      });
    }, {rootMargin: MARGIN + "px 0px", threshold: 0});
    states.forEach(function (s) { io.observe(s.v); });
    // a hidden tab pauses everything; coming back resumes what is on screen
    document.addEventListener("visibilitychange", function () {
      states.forEach(function (s) {
        if (document.hidden) { if (!s.v.paused) s.v.pause(); }
        else if (s.visible && !s.held && s.v.paused) play(s.v);
      });
    });
  }

  /* ---------- teaser sound toggle (the teaser is the only video with sound) ---------- */
  function initSound() {
    var video = document.getElementById("teaser-video");
    var btn = document.querySelector("[data-sound-toggle]");
    if (!video || !btn) return;
    var state = btn.querySelector(".sound-state");
    function sync() {
      var on = !video.muted && video.volume > 0;
      btn.setAttribute("aria-pressed", String(on));
      btn.classList.toggle("is-on", on);
      if (state) state.textContent = on ? "on" : "off";
    }
    btn.addEventListener("click", function () {
      btn.classList.add("was-used");
      if (video.muted || video.volume === 0) {
        video.muted = false;
        if (video.volume === 0) video.volume = 1;
        if (video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
      } else {
        video.muted = true;
      }
      sync();
    });
    video.addEventListener("volumechange", sync);   // stays in sync with the native controls
    btn.hidden = false;
    sync();
  }

  /* ---------- scroll reveal (progressive enhancement: content is visible without it) ---------- */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    if (!items.length || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    function done(n) { setTimeout(function () { n.classList.remove("reveal", "is-in"); }, 1300); }
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var pending = items.filter(function (n) {
      if (n.getBoundingClientRect().top < vh * 0.94) { n.classList.add("is-in"); done(n); return false; }
      return true;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); done(e.target); }
      });
    }, {rootMargin: "0px 0px -6% 0px", threshold: 0});
    pending.forEach(function (n) { io.observe(n); });
    document.documentElement.classList.add("reveal-on");
  }

  /* ---------- top bar: reading progress, active section, back-to-top ---------- */
  function initNav() {
    var bar = document.querySelector(".progress > span");
    var topbar = document.querySelector(".topbar");
    var btt = document.querySelector(".back-to-top");
    var list = document.querySelector(".toplinks");
    var links = Array.prototype.slice.call(document.querySelectorAll('.toplinks a[href^="#"]'));
    if (btt) btt.classList.add("is-auto");
    var ticking = false;
    function onScroll() {
      ticking = false;
      var d = document.documentElement;
      var y = window.pageYOffset || d.scrollTop;
      var max = d.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0).toFixed(4) + ")";
      if (topbar) topbar.classList.toggle("is-scrolled", y > 8);
      if (btt) btt.classList.toggle("is-visible", y > 700);
    }
    function request() { if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); } }
    window.addEventListener("scroll", request, {passive: true});
    window.addEventListener("resize", request);
    onScroll();

    if (!links.length || !("IntersectionObserver" in window)) return;
    var targets = [];
    links.forEach(function (a) {
      var s = document.getElementById(a.getAttribute("href").slice(1));
      if (s) targets.push({el: s, link: a});
    });
    var hero = document.getElementById("hero");
    if (hero) targets.push({el: hero, link: null});
    var current;
    function setActive(a) {
      if (a === current) return;
      current = a;
      links.forEach(function (l) { if (l === a) l.setAttribute("aria-current", "location"); else l.removeAttribute("aria-current"); });
      if (a && list && list.scrollWidth > list.clientWidth) {
        list.scrollLeft = a.offsetLeft - (list.clientWidth - a.offsetWidth) / 2;
      }
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        for (var i = 0; i < targets.length; i++) if (targets[i].el === e.target) setActive(targets[i].link);
      });
    }, {rootMargin: "-38% 0px -58% 0px"});
    targets.forEach(function (t) { io.observe(t.el); });
  }

  /* ---------- links that are still TODO: keep them visible but inert ---------- */
  function initTodoLinks() {
    document.querySelectorAll("a[data-todo]").forEach(function (a) {
      if (a.getAttribute("href") !== "#") return;
      a.setAttribute("aria-disabled", "true");
      a.setAttribute("title", "Link coming soon");
      a.addEventListener("click", function (e) { e.preventDefault(); });
    });
  }

  function boot() {
    var m;
    if ((m = document.getElementById("k-results"))) renderKResults(m);
    if ((m = document.getElementById("ablation"))) renderAblation(m);
    if ((m = document.getElementById("reasoning-results"))) renderReasoning(m);
    initCopy(); initImagineAnimation(); initClips();
    initVideos(); initSound(); initNav(); initTodoLinks(); initReveal();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
