/* Agima project page: results tables and charts (with the "real board vs imagined" rollout viewer linked
   to the K table), the Figure 1 highlight, video playback, plus the page chrome (teaser sound toggle,
   scroll reveal, section nav / reading progress). The RL charts live in rl-charts.js, Fig. 5 in figures.js,
   the planning-trap animations in traps.js, the lightbox and Fig. 1 hotspots in lightbox.js.
   All numbers are copied from the paper (Tables 1 and 3). */
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
      if (o[2]) b.setAttribute("aria-label", o[2]);   // o[1] is the short visible text
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

  /* ---------- 1. K results: a table (default) or line charts across K, linked to the rollout viewer ---------- */
  var KS = ["1", "3", "5", "10", "inf"];
  var ENV_FILE = ["pacman", "maze2d", "sokoban", "pusht"];   // same order as ENVS
  // One letter per frame of assets/gifs/rollout_split/<env>_k<K>.webp: r = real observation, i = imagined frame
  // (read off the left panel's border in the original GIFs). tools/figures/make_figure_assets.py prints this
  // table and checks it, and stepMs below, against this file.
  var ROLLOUT_KINDS = {
    pacman_k1: "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    pacman_k3: "riiiriiiriiiriiiriiiriiiriiiriiiriiiriiiriii",
    pacman_k5: "riiiiiriiiiiriiiiiriiiiiriiiiiriiiiiriii",
    pacman_k10: "riiiiiiiiiiriiiiiiiiiiriiiiiiiiriiiiiiri",
    pacman_kinf: "riiiiiiiiiiiiiiiiiiiiiiiiiii",
    maze2d_k1: "rrrrrrrrrrrrrrrrrr",
    maze2d_k3: "riiiriiiriiiriiiriiiriiiriiiriiiriiri",
    maze2d_k5: "riiiiiriiiiiriiiiiriiiiriiiri",
    maze2d_k10: "riiiiiiiiiiriiiiiiiiiiri",
    maze2d_kinf: "riiiiiiiiiiiii",
    sokoban_k1: "rrrrrrrrrrrrrrrrrrrrrr",
    sokoban_k3: "riiiriiiriiiriiiriiiriiiriii",
    sokoban_k5: "riiiiiriiiiiriiiiiriiii",
    sokoban_k10: "riiiiiiiiiiriiiiriiiii",
    sokoban_kinf: "riiiiiiiiiiiiiiiii",
    pusht_k1: "rrrrrrrrrrrrrrrrrrrr",
    pusht_k3: "riiiriiiriiiriiiriiiriii",
    pusht_k5: "riiiiiriiiiiriiiiiriiiiiriiiiirii",
    pusht_k10: "riiiiiiiiiiriiiiiiiiii",
    pusht_kinf: "riiiiiiiiiiiiiiiiiiiiiiiiiiii"
  };
  // sprite layout: one 504x256 cell per frame, four per row; Agima's view (248x248) at the left, the environment (256x256) at x = 248
  var SPRITE = {dir: "assets/gifs/rollout_split/", cellW: 504, cellH: 256, perRow: 4, agima: [0, 0, 248, 248], env: [248, 0, 256, 256]};
  var PIXEL_ART = {pacman: true, maze2d: true, sokoban: true};
  // the source GIFs' frame durations (ms): start, a real frame after imagined ones, last frame, every other step
  var FRAME_MS = {first: 1500, arrive: 1300, last: 2200};
  function stepMs(env, k) { return k === "1" ? 480 : env === "pusht" ? 440 : 520; }

  function press(group, value) {
    if (!group) return;
    group.querySelectorAll(".seg-btn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-value") === value)); });
  }
  function value(name, k, ei) {
    var rows = K_RESULTS[k];
    for (var i = 0; i < rows.length; i++) if (rows[i][0] === name) return rows[i][2][ei];
    return null;   // not evaluated at this K
  }

  function renderKResults(root) {
    var state = {k: "5", env: ENVS.indexOf("Sokoban"), view: "table"};
    var methods = K_RESULTS["5"].map(function (r) { return {name: r[0], type: r[1]}; });

    var controls = el("div", {class: "chart-controls"});
    controls.appendChild(el("h3", {text: "Success across K"}));
    var NOTE = {
      table: "Success on the hard test splits (PushT: far split). Bold = best per column; – = not evaluated. Click a column to compare and play its rollout below.",
      chart: "Success (%) on the hard test splits (PushT: far split), one line per method. Click a K to play its rollout below."
    };
    segmented(controls, "Results view", [["table", "Table"], ["chart", "Chart"]], state.view, function (v) {
      state.view = v; tableBox.hidden = v !== "table"; chart.node.hidden = v !== "chart";
      note.textContent = NOTE[v];
      if (v === "chart") chart.draw();
    });
    root.appendChild(controls);
    var note = el("p", {class: "chart-note kr-note", text: NOTE.table});
    root.appendChild(note);

    /* table: environments x K, methods as rows */
    var table = el("div", {class: "table-wrap kt-wrap", tabindex: "0", role: "region", "aria-label": "Success across K, table"});
    var t = el("table", {class: "data-table kt"});
    t.appendChild(el("caption", {class: "visually-hidden", text: "Success (%) by environment and K. A dash means not evaluated. In the header, the arrow keys move between environments and between K values."}));
    var r1 = el("tr", {}, [el("td", {class: "kt-corner"})]);
    var r2 = el("tr", {}, [el("th", {scope: "col", class: "kt-method"}, [document.createTextNode("Method"), el("span", {class: "kt-khint", "aria-hidden": "true", text: "K"})])]);
    var envBtns = [], kBtns = [];
    ENVS.forEach(function (env, ei) {
      var eb = el("button", {type: "button", class: "kt-env-btn", "aria-pressed": "false", tabindex: "-1", text: env});
      eb.addEventListener("click", function () { pick(ei, state.k); });
      envBtns.push(eb);
      r1.appendChild(el("th", {scope: "colgroup", colspan: String(KS.length), class: "kt-env", "data-e": String(ei)}, [eb]));
      KS.forEach(function (k) {
        var kb = el("button", {type: "button", class: "kt-k-btn", "aria-pressed": "false", tabindex: "-1", "aria-label": env + ", K = " + KLABEL[k], text: KLABEL[k]});
        kb.addEventListener("click", function () { pick(ei, k); });
        kBtns.push(kb);
        r2.appendChild(el("th", {scope: "col", class: "kt-k", "data-e": String(ei), "data-k": k}, [kb]));
      });
    });
    // each header row is one tab stop (the pressed button); Left / Right / Home / End move along it and select
    rove(envBtns); rove(kBtns);
    t.appendChild(el("thead", {}, [r1, r2]));
    var best = {};
    ENVS.forEach(function (_, ei) {
      KS.forEach(function (k) {
        var vs = methods.map(function (m) { return value(m.name, k, ei); }).filter(function (v) { return v !== null; });
        best[ei + "/" + k] = Math.max.apply(null, vs);
      });
    });
    var tb = el("tbody"), lastG = null;
    methods.forEach(function (m) {
      var g = groupOf(m.type);
      if (g !== lastG) {
        tb.appendChild(el("tr", {class: "group-row"}, [el("td", {colspan: String(1 + ENVS.length * KS.length)}, [el("span", {text: GROUPS[g]})])]));
        lastG = g;
      }
      var tr = el("tr", {class: m.type === "ours" ? "is-ours" : m.type === "closed" ? "is-closed" : ""}, [el("th", {scope: "row", text: m.name})]);
      ENVS.forEach(function (_, ei) {
        KS.forEach(function (k) {
          var v = value(m.name, k, ei);
          var td = el("td", {"data-e": String(ei), "data-k": k});
          if (v === null) { td.textContent = "–"; td.className = "is-na"; td.title = "not evaluated"; }
          else {
            // the number sits in its own box, so results.css can scale it without moving the row
            td.appendChild(el("span", {class: "kt-n"}, [document.createTextNode(String(v)), el("span", {class: "kt-pct", text: "%"})]));
            if (v === best[ei + "/" + k]) td.className = "is-best";
          }
          tr.appendChild(td);
        });
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    // a click or tap anywhere in a column selects it, like its K button in the header
    tb.addEventListener("click", function (e) {
      var td = e.target.closest ? e.target.closest("td[data-k]") : null;
      if (td) pick(+td.getAttribute("data-e"), td.getAttribute("data-k"));
    });
    // hovering a method row (mouse) sets it against Agima's row: Agima's numbers stand out, the other rows fade
    var hotRow = null;
    function setHot(tr) {
      if (tr === hotRow) return;
      if (hotRow) hotRow.classList.remove("is-hot");
      hotRow = tr;
      if (tr) tr.classList.add("is-hot");
      t.classList.toggle("is-compare", !!tr);
    }
    tb.addEventListener("pointerover", function (e) {
      if (e.pointerType !== "mouse") return;
      var tr = e.target.closest ? e.target.closest("tr") : null;
      if (tr && !tr.classList.contains("group-row")) setHot(tr);   // a group label row keeps the current row
    });
    tb.addEventListener("pointerleave", function () { setHot(null); });
    table.appendChild(t);
    // phones show one environment at a time (tabs); wider screens show all four side by side
    var tableBox = el("div", {class: "kt-box"});
    var envTabs = segmented(tableBox, "Table environment", ENVS.map(function (e, i) { return [String(i), e]; }), "", function (v) { pick(+v, state.k); });
    envTabs.classList.add("kt-tabs");
    tableBox.appendChild(table);
    root.appendChild(tableBox);
    var cells = Array.prototype.slice.call(t.querySelectorAll("[data-e]"));

    /* chart: success across K, one small line chart per environment */
    var chart = kChart(methods, function (ei, k) { pick(ei, k); });
    root.appendChild(chart.node);

    /* the rollout viewer below, driven by the same environment and K */
    var viewer = rolloutViewer(function (ei, k) { pick(ei, k); });
    root.appendChild(viewer.node);

    function pick(ei, k) {
      state.env = ei; state.k = k;
      cells.forEach(function (c) {
        var e = c.getAttribute("data-e") === String(ei), kk = c.getAttribute("data-k");
        c.classList.toggle("is-env", e);
        c.classList.toggle("is-sel", e && kk === k);
        var b = c.querySelector("button");
        if (b) {
          var on = kk ? e && kk === k : e;
          b.setAttribute("aria-pressed", String(on));
          b.setAttribute("tabindex", on ? "0" : "-1");
        }
      });
      press(envTabs, String(ei));
      chart.set(ei, k);
      viewer.set(ei, k);
    }
    pick(state.env, state.k);
  }
  // Roving focus over a row of buttons: arrow keys, Home and End move focus and click the button they land on.
  function rove(btns) {
    btns.forEach(function (b, i) {
      b.addEventListener("keydown", function (e) {
        var to = {ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: btns.length - 1}[e.key];
        if (to === undefined || to < 0 || to >= btns.length) return;
        e.preventDefault();
        btns[to].click();          // selects first, so a button of a hidden column is shown before it takes focus
        btns[to].focus();
      });
    });
  }

  /* ---------- Success across K as small multiples: x = K, y = success (%), one line per method ---------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (a) { n.setAttribute(a, attrs[a]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  // drawn back to front: closed-source, fine-tuned Qwen, No Imagine, Agima
  var KC_ORDER = ["closed", "sft", "noimg", "ours"];
  var KC_DOT = {closed: 3, sft: 3, noimg: 3.5, ours: 4.5};
  function shortName(n) { return n.replace("Agima-A7B (No Imagine)", "No Imagine").replace("Agima-A7B", "Agima"); }
  function kChart(methods, onPick) {
    var node = el("div", {class: "kc", hidden: ""});
    var grid = el("div", {class: "kc-grid"});
    var live = el("p", {class: "visually-hidden", "aria-live": "polite"});
    node.appendChild(grid);
    node.appendChild(el("div", {class: "chart-legend kc-legend"}, [
      el("span", {}, [lineKey("ours"), document.createTextNode("Agima")]),
      el("span", {}, [lineKey("noimg"), document.createTextNode("Agima No Imagine")]),
      el("span", {}, [lineKey("sft"), document.createTextNode("Qwen2.5-VL / Qwen3-VL (fine-tuned)")]),
      el("span", {}, [lineKey("closed"), document.createTextNode("Gemini / GPT (not fine-tuned)")]),
      el("span", {}, [el("i", {class: "kc-band-key", "aria-hidden": "true"}), document.createTextNode("selected K")])
    ]));
    node.appendChild(live);
    var sel = {env: -1, k: ""}, drawn = false;
    var series = KC_ORDER.reduce(function (out, type) {
      return out.concat(methods.filter(function (m) { return m.type === type; }));
    }, []);

    var panels = ENVS.map(function (env, ei) {
      var vals = series.map(function (m) { return KS.map(function (k) { return value(m.name, k, ei); }); });
      var ours = vals[series.length - 1];
      var svgEl = sv("svg", {class: "kc-svg", role: "img", tabindex: "0",
        "aria-label": env + ": success across K. Agima: " + ours.map(function (v, i) { return (v === null ? "not evaluated" : v + "%") + " at K = " + KLABEL[KS[i]]; }).join(", ") +
          ". Left and right arrow keys pick a K; the table view lists every value."});
      var tip = el("div", {class: "kc-tip", "aria-hidden": "true", hidden: ""});
      var plot = el("div", {class: "kc-plot"}, [svgEl, tip]);
      var box = el("div", {class: "kc-panel"}, [el("h4", {text: env}), plot]);
      grid.appendChild(box);
      var p = {ei: ei, env: env, vals: vals, svg: svgEl, tip: tip, plot: plot, box: box, hot: -1, g: null};

      function idxAt(e) {
        if (!p.g) return -1;
        var r = svgEl.getBoundingClientRect(), x = (e.clientX - r.left) * (p.g.W / (r.width || 1));
        var best = 0;
        KS.forEach(function (_, i) { if (Math.abs(p.g.x(i) - x) < Math.abs(p.g.x(best) - x)) best = i; });
        return best;
      }
      svgEl.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse") hover(p, idxAt(e)); });
      svgEl.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") hover(p, -1); });
      svgEl.addEventListener("click", function (e) {
        var i = idxAt(e);
        if (i < 0) return;
        onPick(ei, KS[i]);
        hover(p, i);               // on touch, the tap shows the values until the next tap elsewhere
      });
      svgEl.addEventListener("focus", function () { hover(p, KS.indexOf(sel.k)); });
      svgEl.addEventListener("blur", function () { hover(p, -1); });
      svgEl.addEventListener("keydown", function (e) {
        var i = KS.indexOf(sel.k);
        var to = {ArrowLeft: i - 1, ArrowDown: i - 1, ArrowRight: i + 1, ArrowUp: i + 1, Home: 0, End: KS.length - 1}[e.key];
        if (e.key === "Escape") { hover(p, -1); return; }
        if (to === undefined) return;
        e.preventDefault();
        to = Math.max(0, Math.min(KS.length - 1, to));
        onPick(ei, KS[to]);
        hover(p, to);
        live.textContent = env + ", K = " + KLABEL[KS[to]] + ": " + series.map(function (m, s) {
          var v = vals[s][to];
          return shortName(m.name) + " " + (v === null ? "not evaluated" : v + "%");
        }).join(", ") + ".";
      });
      return p;
    });
    document.addEventListener("pointerdown", function (e) {
      panels.forEach(function (p) { if (p.hot >= 0 && !p.plot.contains(e.target)) hover(p, -1); });
    });

    function lineKey(type) {
      var k = sv("svg", {class: "kc-key", width: "22", height: "10", viewBox: "0 0 22 10", "aria-hidden": "true", focusable: "false"});
      sv("line", {class: "kc-line kc-" + type, x1: "1", y1: "5", x2: "21", y2: "5"}, k);
      sv("circle", {class: "kc-dot kc-" + type, cx: "11", cy: "5", r: String(Math.min(3.5, KC_DOT[type]))}, k);
      return k;
    }
    function draw1(p) {
      var W = Math.max(200, Math.round(p.plot.clientWidth || 260));
      var H = Math.round(Math.max(150, Math.min(230, W * 0.62)));
      var m = {t: 14, r: 16, b: 30, l: 34};
      var x0 = m.l + 12, x1 = W - m.r - 8, yTop = m.t, yBot = H - m.b;
      var g = p.g = {W: W, H: H, x: function (i) { return x0 + i * (x1 - x0) / (KS.length - 1); },
                     y: function (v) { return yBot - v / 100 * (yBot - yTop); }};
      var s = p.svg;
      s.setAttribute("viewBox", "0 0 " + W + " " + H);
      s.setAttribute("width", String(W)); s.setAttribute("height", String(H));
      while (s.firstChild) s.removeChild(s.firstChild);
      var si = KS.indexOf(sel.k), bw = Math.min(30, (x1 - x0) / (KS.length - 1) * 0.62);
      if (si >= 0) sv("rect", {class: "kc-band", x: g.x(si) - bw / 2, y: yTop - 6, width: bw, height: yBot - yTop + 6, rx: 6}, s);
      [0, 25, 50, 75, 100].forEach(function (v) {
        var y = Math.round(g.y(v)) + 0.5;
        sv("line", {class: v === 0 ? "kc-base" : "kc-gl", x1: m.l, x2: W - m.r, y1: y, y2: y}, s);
        sv("text", {class: "kc-tick", x: m.l - 7, y: y + 3.8, "text-anchor": "end"}, s).textContent = v + "%";
      });
      KS.forEach(function (k, i) {
        sv("text", {class: "kc-tick" + (i === si ? " is-sel" : ""), x: g.x(i), y: H - 10, "text-anchor": "middle"}, s).textContent = KLABEL[k];
      });
      sv("text", {class: "kc-axis", x: m.l - 7, y: H - 10, "text-anchor": "end"}, s).textContent = "K";
      p.cross = sv("line", {class: "kc-cross", x1: 0, x2: 0, y1: yTop - 6, y2: yBot, visibility: "hidden"}, s);
      series.forEach(function (meth, n) {
        var d = "", prev = false;
        p.vals[n].forEach(function (v, i) {
          if (v === null) { prev = false; return; }
          d += (prev ? " L" : "M") + g.x(i).toFixed(1) + " " + g.y(v).toFixed(1);
          prev = true;
        });
        sv("path", {class: "kc-line kc-" + meth.type, d: d}, s);
      });
      series.forEach(function (meth, n) {
        p.vals[n].forEach(function (v, i) {
          if (v !== null) sv("circle", {class: "kc-dot kc-" + meth.type, cx: g.x(i), cy: g.y(v), r: KC_DOT[meth.type]}, s);
        });
      });
      // Agima's value at the selected K, the one direct label
      var ov = p.vals[series.length - 1][si];
      if (si >= 0 && ov !== null && ov !== undefined) {
        var ly = g.y(ov) - 10;
        sv("text", {class: "kc-val", x: g.x(si), y: ly < yTop + 4 ? g.y(ov) + 19 : ly, "text-anchor": "middle"}, s).textContent = ov + "%";
      }
      p.box.classList.toggle("is-env", p.ei === sel.env);
      if (p.hot >= 0) hover(p, p.hot);
    }
    function hover(p, i) {
      p.hot = i;
      if (!p.g || !p.cross) return;
      if (i < 0) { p.cross.setAttribute("visibility", "hidden"); p.tip.hidden = true; return; }
      var x = p.g.x(i);
      p.cross.setAttribute("x1", x); p.cross.setAttribute("x2", x);
      p.cross.setAttribute("visibility", "visible");
      p.tip.innerHTML = "";
      p.tip.appendChild(el("p", {class: "kc-tip-h", text: p.env + " · K = " + KLABEL[KS[i]]}));
      series.slice().reverse().forEach(function (meth) {
        var n = series.indexOf(meth), v = p.vals[n][i];
        p.tip.appendChild(el("p", {class: "kc-tip-r" + (meth.type === "ours" ? " is-ours" : "")}, [
          lineKey(meth.type), el("b", {text: v === null ? "–" : v + "%"}), el("span", {text: shortName(meth.name)})
        ]));
      });
      p.tip.hidden = false;
      var scale = (p.svg.getBoundingClientRect().width || p.g.W) / p.g.W;
      var tw = p.tip.offsetWidth, px = x * scale, pw = p.plot.clientWidth;
      var left = px + 14 + tw <= pw ? px + 14 : Math.max(0, px - 14 - tw);
      p.tip.style.left = left + "px";
    }
    function draw() {
      if (node.hidden) return;
      panels.forEach(draw1);
      drawn = true;
    }
    if ("ResizeObserver" in window) {
      var lastW = 0;
      new ResizeObserver(function () {
        var w = grid.clientWidth;
        if (w && w !== lastW) { lastW = w; draw(); }
      }).observe(grid);
    } else window.addEventListener("resize", draw);
    return {
      node: node,
      draw: draw,
      set: function (ei, k) { sel.env = ei; sel.k = k; if (drawn) draw(); }
    };
  }

  // K buttons show just the number after a "K" label; each button's accessible name is "K = n"
  function kOptions() { return KS.map(function (k) { return [k, KLABEL[k], "K = " + KLABEL[k]]; }); }
  function kLabeled(container) {
    var box = el("div", {class: "seg-labeled"}, [el("span", {class: "seg-label", "aria-hidden": "true", text: "K"})]);
    container.appendChild(box);
    return box;
  }

  /* ---------- real board vs imagined: Agima's frames next to the real environment, one rollout per env x K ---------- */
  // Plays the frames of a sprite on two canvases with the GIFs' timing, while on screen (paused with reduced
  // motion). A track below shows every frame (dashed blue = imagined, solid = real observation); click, drag
  // or use the arrow keys on it to step. The sprite loads only when the viewer comes near the screen.
  function rolloutViewer(onPick) {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var node = el("section", {class: "kv", "aria-labelledby": "kv-title"});
    var head = el("div", {class: "kv-head"}, [
      el("div", {}, [el("h4", {id: "kv-title", text: "Real board vs imagined"}),
                     el("p", {class: "kv-sub", text: "What Agima plans from, next to the real environment, frame by frame."})])
    ]);
    var segs = el("div", {class: "kv-segs"});
    head.appendChild(segs);
    node.appendChild(head);
    var envSeg = segmented(segs, "Rollout environment", ENVS.map(function (e, i) { return [String(i), e]; }), "", function (v) { onPick(+v, cur.k); });
    var kSeg = segmented(kLabeled(segs), "Rollout K", kOptions(), "", function (v) { onPick(cur.env, v); });

    function panel(cls, name) {
      var tag = el("span", {class: "kv-tag"});
      var canvas = el("canvas", {class: "kv-canvas", width: "248", height: "248", role: "img"});
      var fig = el("figure", {class: "kv-panel " + cls}, [
        el("figcaption", {}, [tag, el("span", {class: "kv-name", text: name})]),
        el("div", {class: "kv-box"}, [canvas])
      ]);
      return {fig: fig, tag: tag, canvas: canvas};
    }
    var A = panel("kv-agima", "Agima"), E = panel("kv-env is-real", "Environment");
    E.tag.textContent = "real";
    var stage = el("div", {class: "kv-stage is-loading"}, [A.fig, E.fig]);
    node.appendChild(stage);

    var ICONS = '<svg class="ico ico-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13M15.5 5.5v13"/></svg>' +
                '<svg class="ico ico-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
    var btn = el("button", {type: "button", class: "kv-play", html: ICONS});
    var track = el("div", {class: "kv-track", role: "slider", tabindex: "0", "aria-label": "Rollout frame", "aria-valuemin": "1"});
    var cap = el("p", {class: "kv-cap"});
    node.appendChild(el("div", {class: "kv-bar"}, [btn, track]));
    node.appendChild(cap);
    node.appendChild(el("p", {class: "kv-legend"}, [
      el("span", {}, [el("i", {class: "lg lg-imag", "aria-hidden": "true"}), document.createTextNode("imagined")]),
      el("span", {}, [el("i", {class: "lg lg-real", "aria-hidden": "true"}), document.createTextNode("real observation")]),
      el("span", {class: "kv-kline", html: "Every <strong>K</strong> actions, a real observation replaces the imagined frame."})
    ]));

    var cur = {env: -1, k: "", key: "", frames: [], img: null, ready: false};
    var idx = 0, playing = !reduce, visible = false, wanted = false, timer = null, cache = {};

    function framesOf(kinds) {
      var out = [], step = 0, chunk = 1;
      for (var i = 0; i < kinds.length; i++) {
        if (i === 0) out.push({real: true, step: 0, start: true});
        else if (kinds[i] === "r" && kinds[i - 1] === "i") { chunk++; out.push({real: true, step: step, arrive: true}); }
        else { step++; out.push({real: kinds[i] === "r", step: step, chunk: chunk}); }
      }
      return out;
    }
    // the frame a paused viewer shows: the last imagined frame before the first real one (where they differ most)
    function stillFrame() {
      for (var i = 1; i < cur.frames.length; i++) if (cur.frames[i].arrive) return i - 1;
      return cur.frames.length - 1;
    }
    function caption(f) {
      var total = cur.frames[cur.frames.length - 1].step;
      var s = "Step " + f.step + " / " + total + " · ";
      if (f.start) return s + "real observation (start)";
      if (f.arrive) return s + "real observation replaces the imagined frame";
      if (f.real) return s + "real observation after every action";
      return s + (cur.k === "inf" ? "imagined, no real observation since the start" : "imagined, chunk " + f.chunk);
    }
    function paint(c, rect) {
      var ctx = c.getContext && c.getContext("2d");
      if (!ctx || !cur.ready) return;
      var col = idx % SPRITE.perRow, row = Math.floor(idx / SPRITE.perRow);
      ctx.imageSmoothingEnabled = !PIXEL_ART[ENV_FILE[cur.env]];
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(cur.img, col * SPRITE.cellW + rect[0], row * SPRITE.cellH + rect[1], rect[2], rect[3], 0, 0, c.width, c.height);
    }
    function show(i) {
      idx = Math.max(0, Math.min(cur.frames.length - 1, i));
      var f = cur.frames[idx];
      if (!f) return;
      A.fig.classList.toggle("is-real", f.real);
      A.fig.classList.toggle("is-imag", !f.real);
      A.tag.textContent = f.real ? "real" : "imagined";
      stage.classList.toggle("is-arrive", !!f.arrive && !reduce);
      paint(A.canvas, SPRITE.agima); paint(E.canvas, SPRITE.env);
      var text = caption(f);
      cap.textContent = text;
      A.canvas.setAttribute("aria-label", "Agima's frame, step " + f.step + ": " + (f.real ? "real observation" : "imagined"));
      E.canvas.setAttribute("aria-label", "Real environment, step " + f.step);
      track.setAttribute("aria-valuenow", String(idx + 1));
      track.setAttribute("aria-valuetext", "Frame " + (idx + 1) + " of " + cur.frames.length + ". " + text);
      var cs = track.children;
      for (var j = 0; j < cs.length; j++) cs[j].classList.toggle("is-now", j === idx);
    }
    function schedule() {
      clearTimeout(timer);
      if (!playing || !visible || document.hidden || !cur.ready) return;
      var f = cur.frames[idx], last = idx === cur.frames.length - 1;
      var ms = last ? FRAME_MS.last : f.start ? FRAME_MS.first : f.arrive ? FRAME_MS.arrive : stepMs(ENV_FILE[cur.env], cur.k);
      timer = setTimeout(function () { show(last ? 0 : idx + 1); schedule(); }, ms);
    }
    function syncBtn() {
      btn.classList.toggle("is-paused", !playing);
      btn.setAttribute("aria-label", (playing ? "Pause" : "Play") + " the rollout");
    }
    function setPlaying(v) { playing = v; syncBtn(); schedule(); }
    function size() {
      var dpr = Math.min(3, window.devicePixelRatio || 1);
      [A.canvas, E.canvas].forEach(function (c) {
        var px = Math.max(64, Math.round((c.clientWidth || 248) * dpr));
        if (c.width !== px) { c.width = px; c.height = px; }
      });
      if (cur.ready) show(idx);
    }
    function load() {
      if (!wanted || !cur.key) return;
      var key = cur.key, im = cache[key];
      if (!im) {
        im = cache[key] = new Image();
        im.decoding = "async";
        im.src = SPRITE.dir + key + ".webp";
      }
      var done = function () {
        if (cur.key !== key) return;           // the reader picked another rollout meanwhile
        // never step past the sprite's last cell, even if ROLLOUT_KINDS and the sprite disagree
        var cells = Math.floor(im.naturalHeight / SPRITE.cellH) * SPRITE.perRow;
        if (cells > 0 && cur.frames.length > cells) { setFrames(cur.frames.slice(0, cells)); idx = Math.min(idx, cells - 1); }
        cur.img = im; cur.ready = true;
        stage.classList.remove("is-loading");
        size(); show(idx); schedule();
      };
      if (im.complete && im.naturalWidth) done();
      else {
        im.addEventListener("load", done);
        im.addEventListener("error", function () { if (cur.key === key) { stage.classList.remove("is-loading"); cap.textContent = "The rollout could not be loaded."; } });
      }
    }
    function setFrames(frames) {
      cur.frames = frames;
      track.innerHTML = "";
      frames.forEach(function (f) {
        track.appendChild(el("span", {class: "kv-cell " + (f.real ? "is-real" : "is-imag") + (f.arrive ? " is-arrive" : "")}));
      });
      track.setAttribute("aria-valuemax", String(frames.length));
    }
    function set(ei, k) {
      if (ei === cur.env && k === cur.k) return;
      clearTimeout(timer);                     // the old rollout's next frame must not run on the new one
      press(envSeg, String(ei)); press(kSeg, k);
      cur.env = ei; cur.k = k;
      cur.key = ENV_FILE[ei] + "_k" + k;
      cur.ready = false; cur.img = null;
      [A.canvas, E.canvas].forEach(function (c) { var x = c.getContext && c.getContext("2d"); if (x) x.clearRect(0, 0, c.width, c.height); });
      stage.classList.add("is-loading");
      setFrames(framesOf(ROLLOUT_KINDS[cur.key] || "r"));
      idx = playing ? 0 : stillFrame();
      show(idx);
      load();
    }
    function fromX(x) {
      var r = track.getBoundingClientRect();
      if (r.width <= 0 || !cur.frames.length) return;
      setPlaying(false);
      show(Math.floor((x - r.left) / r.width * cur.frames.length));
    }
    // mouse: press and drag; touch and pen: a tap seeks, a horizontal drag scrubs, a vertical swipe scrolls the page
    var drag = null;
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = {id: e.pointerId, x: e.clientX, y: e.clientY, live: e.pointerType === "mouse"};
      if (drag.live) {
        if (track.setPointerCapture) track.setPointerCapture(e.pointerId);
        fromX(e.clientX);
      }
    });
    track.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.live) {
        var dx = Math.abs(e.clientX - drag.x);
        if (dx < 6 || dx < Math.abs(e.clientY - drag.y)) return;
        drag.live = true;
        if (track.setPointerCapture) track.setPointerCapture(e.pointerId);
      }
      fromX(e.clientX);
    });
    track.addEventListener("pointerup", function (e) {
      if (drag && e.pointerId === drag.id && !drag.live &&
          Math.abs(e.clientX - drag.x) < 6 && Math.abs(e.clientY - drag.y) < 6) fromX(e.clientX);
      drag = null;
    });
    track.addEventListener("pointercancel", function () { drag = null; });
    track.addEventListener("keydown", function (e) {
      var n = cur.frames.length;
      var to = {ArrowLeft: idx - 1, ArrowDown: idx - 1, ArrowRight: idx + 1, ArrowUp: idx + 1,
                PageDown: idx - 5, PageUp: idx + 5, Home: 0, End: n - 1}[e.key];
      if (to === undefined) return;
      e.preventDefault();
      setPlaying(false);
      show(to);
    });
    btn.addEventListener("click", function () { setPlaying(!playing); });
    syncBtn();
    if ("ResizeObserver" in window) new ResizeObserver(size).observe(stage);
    else window.addEventListener("resize", size);
    if ("IntersectionObserver" in window) {
      // load the sprite once the viewer is near the screen; play only while it is on screen
      new IntersectionObserver(function (es) {
        if (es[0].isIntersecting && !wanted) { wanted = true; load(); }
      }, {rootMargin: "400px 0px"}).observe(node);
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; schedule(); }, {threshold: 0.25}).observe(stage);
    } else { wanted = true; visible = true; }
    document.addEventListener("visibilitychange", schedule);
    return {node: node, set: function (ei, k) { set(ei, k); }};
  }

  /* ---------- 2. reasoning tables ---------- */
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
            // written as in the paper's Table 3: +8%, +0%, −3%
            if (delta !== null) cell.appendChild(el("span", {class: "delta " + (delta > 0 ? "up" : delta < 0 ? "down" : "flat"), text: (delta < 0 ? "−" : "+") + Math.abs(delta) + "%"}));
            return cell;
          }))));
      });
      t.appendChild(tb);
      wrap.innerHTML = ""; wrap.appendChild(t);
      wrap.appendChild(el("p", {class: "table-foot", text: state.task === "sokoban"
        ? "All models trained on two-box Sokoban and run at K = ∞. Bold = best in column; small numbers = change vs. Agima-A7B in percentage points."
        : "Route-order traps: collecting the nearer food first leaves no safe way to finish. G = grid size, F = food items. K = ∞. Bold = best in column; small numbers = change vs. Agima-A7B in percentage points."}));
    }
    draw();
  }


  /* ---------- BibTeX copy button ---------- */
  function initCopy() {
    document.querySelectorAll("[data-copy]").forEach(function (b) {
      var src = document.getElementById(b.getAttribute("data-copy"));
      if (!src) return;
      b.addEventListener("click", function () {
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
    if ((m = document.getElementById("reasoning-results"))) renderReasoning(m);
    initCopy(); initImagineAnimation(); initClips();
    initVideos(); initSound(); initNav(); initTodoLinks(); initReveal();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
