/* Agima project page: results tables and charts (with the "real board vs imagined" rollout viewer, Figure 4,
   linked to the K table), the Figure 1 highlight, video playback, the teaser sound toggle, the BibTeX copy
   button, the reading-progress bar and the sticky top bar. The RL charts live in rl-charts.js, Fig. 5 in
   figures.js, the planning-trap animations in traps.js, the lightbox and Fig. 1 hotspots in lightbox.js.
   All numbers are copied from the paper (Tables 1 and 3; Tables 1 and 2 on this page). */
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
  /* ---------- 1. K results: a table (default) or line charts across K, linked to the rollout viewer ---------- */
  var KS = ["1", "3", "5", "10", "inf"];
  var ENV_FILE = ["pacman", "maze2d", "sokoban", "pusht"];   // same order as ENVS
  // One letter per frame of assets/gifs/rollout_split/<env>_k<K>.webp: r = real observation, i = imagined frame
  // (read off the left panel's border in the original GIFs; Maze2D at K = 3, 5, 10, inf from the eval episodes in
  // tools/figures/maze2d_rollouts.json). tools/figures/make_figure_assets.py prints this table and checks it,
  // and stepMs below, against this file.
  var ROLLOUT_KINDS = {
    pacman_k1: "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
    pacman_k3: "riiiriiiriiiriiiriiiriiiriiiriiiriiiriiiriii",
    pacman_k5: "riiiiiriiiiiriiiiiriiiiiriiiiiriiiiiriii",
    pacman_k10: "riiiiiiiiiiriiiiiiiiiiriiiiiiiiriiiiiiri",
    pacman_kinf: "riiiiiiiiiiiiiiiiiiiiiiiiiii",
    maze2d_k1: "rrrrrrrrrrrrrrrrrr",
    maze2d_k3: "riiiriiiriiiriiiri",
    maze2d_k5: "riiiiiriiiiiriiiiri",
    maze2d_k10: "riiiiiiiiiiriiiiri",
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
  // Maze2D: the steps whose imagined frame has lost the blue agent dot ('dot_missing' in maze2d_rollouts.json, checked
  // by make_figure_assets.py). No successful eval episode keeps it in every frame; the caption says so on these frames.
  var ROLLOUT_NO_AGENT = {maze2d_k3: [11, 12], maze2d_k5: [14], maze2d_k10: [7, 8, 9, 10, 13, 14], maze2d_kinf: [12, 13]};
  // the sha1 of each sprite, so a browser never plays a cached old sprite under new frame kinds (tools/stamp_assets.py
  // rewrites this table)
  var SPRITE_V = {
    maze2d_k1: "43dcd41c", maze2d_k10: "0ed5e1a0", maze2d_k3: "244b78a6", maze2d_k5: "35da34a6", maze2d_kinf: "10a2e016",
    pacman_k1: "c4afcfdd", pacman_k10: "418245d7", pacman_k3: "9d6d226a", pacman_k5: "5b0395b0", pacman_kinf: "3e83b891",
    pusht_k1: "2efda946", pusht_k10: "3c0d2f2e", pusht_k3: "c98f1863", pusht_k5: "3d923eb4", pusht_kinf: "554c6be6",
    sokoban_k1: "b7c09c31", sokoban_k10: "541b076c", sokoban_k3: "12db2f33", sokoban_k5: "c6e9cc81", sokoban_kinf: "f9b68009"
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

    // the caption sits above the table, as in the paper, with the Table / Chart switch at its right
    var controls = el("div", {class: "chart-controls cap-row"});
    var CAPTION = {
      table: "<b>Table 1.</b> Success rate on the test splits for each <i>K</i>. Bold marks the best result in each column, and a dash means not evaluated. Select a column to play its rollout in Figure&nbsp;4.",
      chart: "<b>Table 1</b>, drawn as line charts: success rate (%) per method across <i>K</i>. Select a <i>K</i> to play its rollout in Figure&nbsp;4."
    };
    var note = el("p", {class: "fig-cap", id: "table1-cap", html: CAPTION.table});
    controls.appendChild(note);
    segmented(controls, "Results view", [["table", "Table"], ["chart", "Chart"]], state.view, function (v) {
      state.view = v; tableBox.hidden = v !== "table"; chart.node.hidden = v !== "chart";
      note.innerHTML = CAPTION[v];
      if (v === "chart") chart.draw();
    });
    root.appendChild(controls);

    /* table: environments x K, methods as rows */
    var table = el("div", {class: "table-wrap kt-wrap", tabindex: "0", role: "region", "aria-label": "Table 1, success across K"});
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
            // the number sits in its own box, so results.css can enlarge Agima's in the selected column without
            // moving the row (data-n keeps the box as wide as the number in bold)
            td.appendChild(el("span", {class: "kt-n", "data-n": v + "%"}, [document.createTextNode(String(v)), el("span", {class: "kt-pct", text: "%"})]));
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
    table.appendChild(t);
    // phones show one environment at a time (tabs); wider screens show all four side by side
    var tableBox = el("div", {class: "kt-box"});
    var envTabs = segmented(tableBox, "Table environment", ENVS.map(function (e, i) { return [String(i), e]; }), "", function (v) { pick(+v, state.k); });
    envTabs.classList.add("kt-tabs");
    tableBox.appendChild(table);
    root.appendChild(tableBox);
    edgeFade(table);
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
      var box = el("div", {class: "kc-panel"}, [el("p", {class: "kc-title", text: env}), plot]);
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
      p.tip.appendChild(el("p", {class: "kc-tip-h", text: p.env + ", K = " + KLABEL[KS[i]]}));
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

  /* ---------- Figure 4, real board vs imagined: Agima's frames next to the real environment, one rollout per env x K ---------- */
  // Plays the frames of a sprite on two canvases with the GIFs' timing, while on screen (paused with reduced
  // motion). A track below shows every frame (dashed blue = imagined, solid = real observation); click, drag
  // or use the arrow keys on it to step. The sprite loads only when the viewer comes near the screen.
  function rolloutViewer(onPick) {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var node = el("figure", {class: "kv"});
    var segs = el("div", {class: "kv-segs"});
    node.appendChild(el("div", {class: "kv-head"}, [segs]));
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
    var cap = el("p", {class: "kv-status"});
    node.appendChild(el("div", {class: "kv-bar"}, [btn, track]));
    node.appendChild(cap);
    // the caption names the rollout on show (on phones the environment is picked with Table 1's tabs, further up)
    var figcap = el("figcaption", {class: "fig-cap"});
    node.appendChild(figcap);
    function setCaption() {
      figcap.innerHTML = "<b>Figure 4.</b> Agima's frames beside the real environment, " + ENVS[cur.env] + " at <i>K</i>&nbsp;=&nbsp;" + KLABEL[cur.k] +
        ". Every <i>K</i> actions, a real observation <i class=\"lg lg-real\" aria-hidden=\"true\"></i> replaces the <span class=\"nobr\">imagined frame <i class=\"lg lg-imag\" aria-hidden=\"true\"></i>.</span>";
    }

    var cur = {env: -1, k: "", key: "", frames: [], img: null, ready: false};
    var idx = 0, playing = !reduce, visible = false, wanted = false, timer = null, cache = {};

    function framesOf(kinds, lost) {
      var out = [], step = 0, chunk = 1;
      for (var i = 0; i < kinds.length; i++) {
        if (i === 0) out.push({real: true, step: 0, start: true});
        else if (kinds[i] === "r" && kinds[i - 1] === "i") { chunk++; out.push({real: true, step: step, arrive: true}); }
        else {
          step++;
          out.push({real: kinds[i] === "r", step: step, chunk: chunk, lost: kinds[i] === "i" && lost.indexOf(step) >= 0});
        }
      }
      return out;
    }
    // the frame a paused viewer shows: the last imagined frame before the first real one (where they differ most),
    // or the nearest one before it that still shows the agent
    function stillFrame() {
      var i = cur.frames.length - 1;
      for (var j = 1; j < cur.frames.length; j++) if (cur.frames[j].arrive) { i = j - 1; break; }
      while (i > 0 && cur.frames[i].lost) i--;
      return i;
    }
    function caption(f) {
      var total = cur.frames[cur.frames.length - 1].step;
      var s = "Step " + f.step + " of " + total + ": ";
      if (f.start) return s + "real observation (start).";
      if (f.arrive) return s + "a real observation replaces the imagined frame.";
      if (f.real) return s + "real observation after every action.";
      if (f.lost) return s + (cur.k === "inf" ? "imagined frame" : "imagined frame, chunk " + f.chunk) + ". The agent is missing from Agima's frame.";
      return s + (cur.k === "inf" ? "imagined frame, no real observation since the start." : "imagined frame, chunk " + f.chunk + ".");
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
      A.canvas.setAttribute("aria-label", "Agima's frame, step " + f.step + ": " + (f.real ? "real observation" : f.lost ? "imagined, without the agent" : "imagined"));
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
        im.src = SPRITE.dir + key + ".webp" + (SPRITE_V[key] ? "?v=" + SPRITE_V[key] : "");
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
      setCaption();
      cur.ready = false; cur.img = null;
      [A.canvas, E.canvas].forEach(function (c) { var x = c.getContext && c.getContext("2d"); if (x) x.clearRect(0, 0, c.width, c.height); });
      stage.classList.add("is-loading");
      setFrames(framesOf(ROLLOUT_KINDS[cur.key] || "r", ROLLOUT_NO_AGENT[cur.key] || []));
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
    var controls = el("div", {class: "chart-controls cap-row"});
    root.appendChild(controls);
    controls.appendChild(el("p", {class: "fig-cap", html: "<b>Table 2.</b> Success rate on the planning traps at <i>K</i>&nbsp;=&nbsp;∞ (paper Table&nbsp;3)."}));
    segmented(controls, "Reasoning task", [["sokoban", "Sokoban"], ["pacman", "Pacman"]], state.task, function (v) { state.task = v; draw(); });
    var wrap = el("div", {class: "table-wrap", tabindex: "0", role: "region", "aria-label": "Table 2, success on the planning traps"});
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
            // the change from Agima-A7B in percentage points, written as in the paper's Table 3: +8%, +0%, −3%
            if (delta !== null) cell.appendChild(el("span", {class: "delta " + (delta > 0 ? "up" : delta < 0 ? "down" : "flat"), text: (delta < 0 ? "−" : "+") + Math.abs(delta) + "%"}));
            return cell;
          }))));
      });
      t.appendChild(tb);
      wrap.innerHTML = ""; wrap.appendChild(t);
      wrap.appendChild(el("p", {class: "table-foot", text: state.task === "sokoban"
        ? "The fine-tuned models are trained on two-box Sokoban. Bold marks the best result in each column. The small numbers give the change from Agima-A7B in percentage points."
        : "The fine-tuned models are trained on 9×9 grids. G is the grid size and F the number of food items. Bold marks the best result in each column. The small numbers give the change from Agima-A7B in percentage points."}));
      edgeFade(wrap);
    }
    draw();
  }


  // a table wider than its box fades out at the right edge until it is scrolled to the end. Called again after each
  // redraw. It re-checks when the box resizes, when the table itself resizes (a web font that swaps in late narrows the
  // table without changing the box) and once the fonts are ready.
  function edgeFade(wrap) {
    var sync = wrap._edge;
    if (!sync) {
      sync = wrap._edge = function () {
        var more = wrap.scrollWidth - wrap.clientWidth - wrap.scrollLeft > 2;
        wrap.classList.toggle("is-clipped", more);
      };
      wrap.addEventListener("scroll", sync, {passive: true});
      if ("ResizeObserver" in window) { wrap._ro = new ResizeObserver(sync); wrap._ro.observe(wrap); }
      else window.addEventListener("resize", sync);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
    }
    var table = wrap.querySelector("table");
    if (wrap._ro && table !== wrap._table) {   // a redraw replaces the table: watch the new one
      if (wrap._table) wrap._ro.unobserve(wrap._table);
      if (table) wrap._ro.observe(table);
      wrap._table = table;
    }
    sync();
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
  /* ---------- Figure 1: a click on a Figure 2 format marks its region of Figure 1 ---------- */
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
    // Each card's heading becomes a real toggle button, so it is announced as one (pressed = marked in the figure).
    var btns = cards.map(function (c) {
      var h = c.querySelector("h3");
      if (!h) return null;
      var b = el("button", {type: "button", class: "format-btn", "aria-pressed": "false"});
      while (h.firstChild) b.appendChild(h.firstChild);
      h.appendChild(b);
      return b;
    });
    function show(i) {
      Object.keys(steps[i].box).forEach(function (k) { hl.style[k] = steps[i].box[k]; });
      hl.classList.remove("is-hidden");
      cards.forEach(function (c, j) {
        var on = c.getAttribute("data-format-step") === steps[i].name;
        c.classList.toggle("is-active", on);
        if (btns[j]) btns[j].setAttribute("aria-pressed", String(on));
      });
      diagram.classList.add("is-active");
    }
    // the whole card is clickable; the heading button gives keyboard and screen-reader access
    cards.forEach(function (c, i) { c.addEventListener("click", function () { show(i); }); });
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
    // the caption row under the grid (in the HTML) takes the switch at its right end
    var row = grid.parentNode.querySelector(".env-controls");
    if (!row) { row = el("div", {class: "env-controls cap-row"}); grid.parentNode.insertBefore(row, grid.nextSibling); }
    row.appendChild(toggle);
    if (reduce) set(false);
  }

  /* ---------- videos: autoplay muted loop, played only while on screen ---------- */
  // Every <video> carries autoplay muted loop playsinline in the HTML, so it also plays with JS off.
  // With IntersectionObserver, JS owns playback instead: the autoplay attribute is dropped, a clip that
  // is not near the screen stops loading (it keeps its poster, preload="none"), and the observer plays
  // each one while it is on screen and pauses it off screen. A clip the reader paused stays paused.
  // The videos are content, so they autoplay with prefers-reduced-motion too (the page's other motion
  // stays reduced); a bar under each has play/pause, a scrubber and the time (clicking the video toggles it too).
  function initVideos() {
    var videos = Array.prototype.slice.call(document.querySelectorAll("video"));
    if (!videos.length) return;
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
      // held: the reader wants it paused. Only the play/pause button (or a click on the video) sets or clears held.
      var s = {v: v, visible: !hasIO, known: !hasIO, held: false};
      v.muted = true;   // autoplay needs it; the teaser's Sound button unmutes on request
      if (hasIO) {
        v.autoplay = false; v.removeAttribute("autoplay");
        if (!near(v)) {
          // stop the download the autoplay attribute started; load() keeps the poster
          v.pause(); v.preload = "none"; v.load();
        }
      }
      // a clip that starts while off screen (the browser, or a late autoplay) is paused again;
      // one started on screen (the play button, the teaser's sound button) is no longer held
      v.addEventListener("play", function () { if (hasIO && s.known && !s.visible) v.pause(); else s.held = false; });
      // the teaser's native controls are only the no-JS fallback; the bar under each video replaces them
      v.controls = false; v.removeAttribute("controls");
      if (v.parentNode) {
        var box = v.parentNode;
        var name = v.getAttribute("data-name") || "animation";
        var btn = el("button", {type: "button", class: "media-play", html: ICONS});
        var range = el("input", {type: "range", class: "media-range", min: "0", max: "1", step: "any", value: "0",
                                 "aria-label": "Seek " + name});
        var time = el("span", {class: "media-time", "aria-hidden": "true"});
        box.parentNode.insertBefore(el("div", {class: "media-bar"}, [btn, range, time]), box.nextSibling);
        var sync = function () {
          btn.setAttribute("aria-label", (v.paused ? "Play " : "Pause ") + name);
          btn.classList.toggle("is-paused", v.paused);
        };
        var toggle = function () {
          if (v.paused) { s.held = false; play(v); } else { s.held = true; v.pause(); }
          sync();
        };
        btn.addEventListener("click", toggle);
        v.addEventListener("click", toggle);
        ["play", "playing", "pause"].forEach(function (ev) { v.addEventListener(ev, sync); });
        sync();
        // the scrubber follows the video every frame while it plays; dragging it seeks, pausing the video until
        // it is let go (a video the reader had paused stays paused)
        var scrubbing = false, resume = false, raf = 0;
        var mmss = function (t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ":" + ("0" + t % 60).slice(-2); };
        var paint = function () {
          var d = isFinite(v.duration) ? v.duration : 0, t = v.currentTime;
          if (+range.max !== d && d) range.max = String(d);
          if (!scrubbing) range.value = String(t);
          range.style.setProperty("--p", (d ? Math.min(100, t / d * 100) : 0) + "%");
          time.textContent = mmss(t) + " / " + (d ? mmss(d) : "–:––");
          range.setAttribute("aria-valuetext", mmss(t) + " of " + (d ? mmss(d) : "unknown"));
        };
        var tick = function () { paint(); raf = v.paused ? 0 : window.requestAnimationFrame(tick); };
        v.addEventListener("playing", function () { if (!raf) raf = window.requestAnimationFrame(tick); });
        ["loadedmetadata", "durationchange", "seeked", "pause", "timeupdate"].forEach(function (ev) { v.addEventListener(ev, paint); });
        range.addEventListener("input", function () {
          if (!scrubbing) { scrubbing = true; resume = !v.paused; if (resume) v.pause(); }
          v.currentTime = +range.value;
          paint();
        });
        // arrow keys step 2 s (the native step of a step="any" range is not a useful amount), Home / End jump
        range.addEventListener("keydown", function (e) {
          var d = isFinite(v.duration) ? v.duration : 0, k = e.key, to = null;
          if (!d) return;
          if (k === "ArrowLeft" || k === "ArrowDown") to = v.currentTime - 2;
          else if (k === "ArrowRight" || k === "ArrowUp") to = v.currentTime + 2;
          else if (k === "Home") to = 0;
          else if (k === "End") to = d - 0.05;
          if (to === null) return;
          e.preventDefault();
          v.currentTime = Math.min(d - 0.05, Math.max(0, to));
          paint();
        });
        range.addEventListener("change", function () {
          scrubbing = false;
          if (resume) play(v);
          resume = false;
          paint();
        });
        paint();
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

  /* ---------- reading progress: the thin bar at the top fills as the page scrolls ---------- */
  function initProgress() {
    var bar = document.querySelector(".progress > span");
    if (!bar) return;
    var ticking = false;
    function update() {
      ticking = false;
      var d = document.documentElement;
      var max = d.scrollHeight - window.innerHeight;
      var y = window.pageYOffset || d.scrollTop;
      bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, Math.max(0, y / max)) : 0).toFixed(4) + ")";
    }
    function request() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }
    window.addEventListener("scroll", request, {passive: true});
    window.addEventListener("resize", request);
    // the page grows as the figures and charts are built, so the bar is recomputed when it does
    if ("ResizeObserver" in window) new ResizeObserver(request).observe(document.body);
    update();
  }

  /* ---------- top bar (sticky): a hairline once the page has scrolled, and the link of the section in view
     marked (aria-current) ---------- */
  function initMasthead() {
    var bar = document.querySelector(".masthead");
    if (!bar) return;
    var root = document.documentElement;
    var links = [].slice.call(bar.querySelectorAll('.nav-links a[href^="#"]'));
    var sections = links.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
    var current = -1, ticking = false, held = false, settle = null;

    // "location": the current place within this page
    function mark(i) {
      if (i === current) return;
      current = i;
      links.forEach(function (a, j) { if (j === i) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current"); });
    }
    function update() {
      ticking = false;
      var y = window.pageYOffset || root.scrollTop;
      bar.classList.toggle("is-stuck", y > 0);
      if (held) return;
      // the current section is the last one whose top has passed a line a third of the way down the window (below
      // the bar); none in the summary above Method, and at the very bottom the last one, however short it is
      var line = bar.offsetHeight + (window.innerHeight - bar.offsetHeight) / 3, i = -1;
      sections.forEach(function (s, j) { if (s && s.getBoundingClientRect().top <= line) i = j; });
      if (y > 0 && y + window.innerHeight >= root.scrollHeight - 2) i = sections.length - 1;
      mark(i);
    }
    function request() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }
    function release() { held = false; request(); }
    // a click on a link in the bar marks its section at once (none for the wordmark), and the sections the smooth
    // scroll passes on the way are not marked: the marking resumes once the scrolling stops
    bar.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      held = true; mark(links.indexOf(a));
      clearTimeout(settle); settle = setTimeout(release, 150);
    });
    window.addEventListener("scroll", function () {
      if (held) { clearTimeout(settle); settle = setTimeout(release, 150); }
      request();
    }, {passive: true});
    window.addEventListener("resize", request);
    // --bar-h (the bar's height) sets html's scroll-padding-top in styles.css, so anchor jumps land below the bar;
    // the sections move as the figures are built, so the body is watched too
    function measure() { root.style.setProperty("--bar-h", bar.offsetHeight + "px"); request(); }
    if ("ResizeObserver" in window) { var ro = new ResizeObserver(measure); ro.observe(bar); ro.observe(document.body); }
    measure();
  }

  /* ---------- links that are still TODO: keep them visible but inert ---------- */
  function initTodoLinks() {
    document.querySelectorAll("a[data-todo]").forEach(function (a) {
      if (a.getAttribute("href") !== "#") return;
      a.setAttribute("aria-disabled", "true");
      a.setAttribute("title", "Coming soon");
      a.addEventListener("click", function (e) { e.preventDefault(); });
    });
  }

  function boot() {
    var m;
    if ((m = document.getElementById("k-results"))) renderKResults(m);
    if ((m = document.getElementById("reasoning-results"))) renderReasoning(m);
    initCopy(); initImagineAnimation(); initClips();
    initVideos(); initSound(); initTodoLinks(); initProgress(); initMasthead();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
