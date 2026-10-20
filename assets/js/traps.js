/* Agima project page: the planning-trap animations in #traps.
   Each [data-trap] plays a failing and a succeeding run from the same start, side by side and in sync, on canvas.
   Sokoban boards are drawn from an empty board plus box and player sprites, so moves slide; Pacman plays the real
   episode frames, with a glowing trail of Pacman's path. A ring marks what each run goes for first.
   Data: assets/images/traps_anim/ (traps.json and two sprite sheets), from tools/figures/make_trap_assets.py,
   which also checks every claim with the Sokoban solver.
   Plays when on screen and loops; click/tap the boards or press Space to pause; step buttons and a scrubber.
   With reduced motion it shows the last frames. Without JavaScript, or until the data loads, the last frames
   show as plain images. Plain ES5, no dependencies. */
(function () {
  "use strict";
  if (!document.querySelector || !window.requestAnimationFrame || !window.addEventListener) return;

  var DIR = "assets/images/traps_anim/";
  var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(reduceMQ && reduceMQ.matches); }
  var STEP_MS = {deadlock: 300, fork: 340, pacman: 440};   // one move
  var LEAD_MS = 1000, HOLD_MS = 2200;                      // the start (targets ringed), the end, before the loop
  var RED = "#FF6B55", GREEN = "#3DDC97", RED_INK = "#B53A27", GREEN_INK = "#0B7354", INK = "#161618";
  var ICON = {
    play: '<svg class="ico ico-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    pause: '<svg class="ico ico-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13M15.5 5.5v13"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>',
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4 4 9-9"/></svg>'
  };

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
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(x) { return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function lerp(a, b, f) { return a + (b - a) * f; }
  function fadeOut(t, t0, d) { return 1 - clamp((t - t0) / d, 0, 1); }
  function fadeIn(t, t0, d) { return clamp((t - t0) / d, 0, 1); }

  /* ---------------- drawing (board units: 256 per side; u = board units per CSS pixel) ---------------- */
  function ring(c, x, y, r, col, a, u, pulse) {
    if (a <= 0) return;
    c.save();
    c.globalAlpha = a;
    c.lineWidth = 2.5 * u;
    c.strokeStyle = col;
    c.shadowColor = col; c.shadowBlur = 10 * c.k * u;
    c.beginPath(); c.arc(x, y, r + (pulse || 0), 0, 2 * Math.PI); c.stroke();
    c.restore();
  }
  function pill(c, x, y, text, col, a, u) {
    if (a <= 0) return;
    c.save();
    c.globalAlpha = a;
    var fs = (c.small ? 9.5 : 10.5) * u;   // CSS px, a little smaller on phone-sized boards
    c.font = "600 " + fs + "px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
    var w = c.measureText(text).width + 12 * u, h = 17 * u;
    x = clamp(x, w / 2 + 2, 254 - w / 2);
    y = clamp(y, c.y0 + h / 2 + 2, c.y1 - h / 2 - 2);
    c.fillStyle = "#fff";
    c.shadowColor = "rgba(0,0,0,.35)"; c.shadowBlur = 4 * c.k * u;
    roundRect(c, x - w / 2, y - h / 2, w, h, h / 2); c.fill();
    c.shadowBlur = 0;
    c.fillStyle = col;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, x, y + .5 * u);
    c.restore();
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
  }
  function arrow(c, x0, y0, x1, y1, col, w, a, u, dashed) {
    if (a <= 0) return;
    var ang = Math.atan2(y1 - y0, x1 - x0), L = 8 * u + w * 1.4, W = 5 * u + w;
    var bx = x1 - Math.cos(ang) * L * .8, by = y1 - Math.sin(ang) * L * .8;
    c.save();
    c.globalAlpha = a;
    c.lineCap = "round"; c.lineJoin = "round";
    // dark halo, so the arrow reads on bricks, boxes and black floor alike
    c.strokeStyle = "rgba(22,22,24,.75)"; c.lineWidth = w + 3.5 * u;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(bx, by); c.stroke();
    c.strokeStyle = col; c.lineWidth = w;
    if (dashed) c.setLineDash([4 * u, 3.5 * u]);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(bx, by); c.stroke();
    c.setLineDash([]);
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x1 - Math.cos(ang) * L - Math.sin(ang) * W, y1 - Math.sin(ang) * L + Math.cos(ang) * W);
    c.lineTo(x1 - Math.cos(ang) * L + Math.sin(ang) * W, y1 - Math.sin(ang) * L - Math.cos(ang) * W);
    c.closePath();
    c.lineWidth = 3 * u; c.strokeStyle = "rgba(22,22,24,.75)"; c.stroke();
    c.fillStyle = col; c.fill();
    c.restore();
  }
  function crossBadge(c, x, y, a, u) {
    if (a <= 0) return;
    var r = 8 * u;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = "#D44C38"; c.strokeStyle = "#fff"; c.lineWidth = 2 * u;
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill(); c.stroke();
    c.lineCap = "round"; c.lineWidth = 2.2 * u;
    c.beginPath(); c.moveTo(x - r * .42, y - r * .42); c.lineTo(x + r * .42, y + r * .42);
    c.moveTo(x + r * .42, y - r * .42); c.lineTo(x - r * .42, y + r * .42); c.stroke();
    c.restore();
  }

  /* ---------------- one animation ---------------- */
  function Demo(root, meta, sheets) {
    var self = this;
    this.root = root;
    this.name = root.getAttribute("data-trap");
    this.title = root.getAttribute("data-title") || this.name;
    this.d = meta.demos[this.name];
    this.meta = meta;
    this.sheet = this.d.kind === "pacman" ? sheets.pacman : sheets.sokoban;
    this.stepMs = STEP_MS[this.name] || 340;
    // the rows of the board on show (Sokoban: the play area and one wall row around it), in board units
    var view = this.d.view || [0, 8];
    this.y0 = view[0] * 32; this.vh = (view[1] - view[0]) * 32;
    var figs = root.querySelectorAll(".trap-run");
    this.runs = this.d.runs.map(function (r, i) {
      var fig = figs[i], board = fig.querySelector(".trap-board"), img = board.querySelector("img");
      var cv = el("canvas", {role: "img", "aria-label": img ? img.getAttribute("alt") : "", style: "aspect-ratio: 256 / " + self.vh});
      if (img) board.replaceChild(cv, img); else board.appendChild(cv);
      var run = {data: r, fig: fig, board: board, canvas: cv, ctx: cv.getContext("2d"), done: false, idx: i};
      run.steps = self.d.kind === "pacman" ? r.frames.length - 1 : r.states.length - 1 + (r.bump ? 1 : 0) + (r.hold || 0);
      if (self.d.kind === "sokoban" && r.target != null) run.firstPush = firstMove(r.states, r.target);
      return run;
    });
    this.N = Math.max.apply(null, this.runs.map(function (r) { return r.steps; }));
    this.total = LEAD_MS + this.N * this.stepMs + HOLD_MS;
    this.pos = 0;              // ms along lead + moves + hold
    this.playing = false;
    this.userPaused = false;   // paused by the reader: stays paused when scrolled back into view
    this.visible = false;
    this.buildControls();
    this.pause();
    root.classList.add("is-live");
    if (reduced()) this.seek(this.N, false);
    else this.seek(0, false);
  }
  function firstMove(states, i) {
    for (var k = 0; k + 1 < states.length; k++) {
      var a = states[k].b[i], b = states[k + 1].b[i];
      if (a[0] !== b[0] || a[1] !== b[1]) return k;
    }
    return Infinity;
  }

  Demo.prototype.t = function () { return clamp((this.pos - LEAD_MS) / this.stepMs, 0, this.N); };

  Demo.prototype.buildControls = function () {
    var self = this;
    var stage = this.root.querySelector(".trap-runs");
    this.stage = stage;
    stage.setAttribute("tabindex", "0");
    stage.setAttribute("role", "group");
    stage.setAttribute("aria-label", this.title + ": both runs side by side. Space pauses or plays; the arrow keys step.");
    this.flash = el("span", {class: "trap-flash", "aria-hidden": "true"});
    stage.appendChild(this.flash);

    this.btnPlay = el("button", {type: "button", class: "trap-play", html: ICON.pause + ICON.play});
    this.btnPrev = el("button", {type: "button", class: "trap-btn", "aria-label": "Previous move", html: ICON.prev});
    this.btnNext = el("button", {type: "button", class: "trap-btn", "aria-label": "Next move", html: ICON.next});
    this.range = el("input", {type: "range", class: "trap-range", min: "0", max: String(this.N), step: "1", value: "0",
      "aria-label": this.title + ", move"});
    this.count = el("span", {class: "trap-count", "aria-hidden": "true"});
    var bar = el("div", {class: "trap-bar"}, [this.btnPlay, this.btnPrev, this.range, this.btnNext, this.count]);
    stage.parentNode.insertBefore(bar, stage.nextSibling);   // under the boards, above the figure's caption

    this.btnPlay.addEventListener("click", function () { self.toggle(false); });
    this.btnPrev.addEventListener("click", function () { self.stepBy(-1); });
    this.btnNext.addEventListener("click", function () { self.stepBy(1); });
    this.range.addEventListener("input", function () { self.userPaused = true; self.pause(); self.seek(+self.range.value, false); });
    stage.addEventListener("click", function () { self.toggle(true); });
    stage.addEventListener("keydown", function (e) {
      var k = e.key;
      if (k === " " || k === "Spacebar" || k === "k") self.toggle(true);
      else if (k === "ArrowLeft") self.stepBy(-1);
      else if (k === "ArrowRight") self.stepBy(1);
      else if (k === "Home") { self.userPaused = true; self.pause(); self.seek(0, false); }
      else if (k === "End") { self.userPaused = true; self.pause(); self.seek(self.N, false); }
      else return;
      e.preventDefault();
    });
  };

  Demo.prototype.toggle = function (flash) {
    if (this.playing) { this.userPaused = true; this.pause(); }
    else {
      this.userPaused = false;
      if (this.t() >= this.N) this.restart();   // from the end: play from the start again
      this.play();
    }
    if (flash) {
      this.flash.innerHTML = this.playing ? ICON.play : ICON.pause;
      this.flash.classList.remove("is-on"); void this.flash.offsetWidth; this.flash.classList.add("is-on");
    }
  };
  Demo.prototype.stepBy = function (d) {
    this.userPaused = true; this.pause();
    var t = this.t(), to = d > 0 ? Math.floor(t + 1e-6) + 1 : Math.ceil(t - 1e-6) - 1;
    this.seek(clamp(to, 0, this.N), false);
  };
  Demo.prototype.restart = function () {
    this.pos = 0;
    this.runs.forEach(function (r) { r.done = false; r.fig.classList.remove("is-done", "is-shake"); });
  };
  Demo.prototype.seek = function (t, animate) {
    this.pos = t <= 0 ? (this.playing ? 0 : LEAD_MS) : LEAD_MS + t * this.stepMs;
    this.update(animate);
  };
  Demo.prototype.play = function () {
    if (this.playing) return;
    this.playing = true;
    this.btnPlay.classList.remove("is-paused");
    this.btnPlay.setAttribute("aria-label", "Pause " + this.title);
    Demo.loop();
  };
  Demo.prototype.pause = function () {
    this.playing = false;
    this.btnPlay.classList.add("is-paused");
    this.btnPlay.setAttribute("aria-label", "Play " + this.title);
  };
  Demo.prototype.tick = function (dt) {
    this.pos += dt;
    if (this.pos >= this.total) {
      if (reduced()) { this.pos = this.total - 1; this.pause(); }   // a play the reader asked for, once
      else this.restart();
    }
    this.update(true);
  };
  Demo.prototype.update = function (animate) {
    var t = this.t(), self = this;
    this.runs.forEach(function (r) {
      var done = t >= r.steps - 1e-6;
      if (done !== r.done) {
        r.done = done;
        r.fig.classList.toggle("is-done", done);
        if (done && animate && !r.data.ok && !reduced()) {   // a short shake when the failing run hits its dead end
          r.fig.classList.remove("is-shake"); void r.fig.offsetWidth; r.fig.classList.add("is-shake");
        }
        if (!done) r.fig.classList.remove("is-shake");
      }
      self.draw(r, t);
    });
    var k = Math.floor(t + 1e-6);
    if (+this.range.value !== k) this.range.value = String(k);
    this.range.style.setProperty("--p", (this.N ? k / this.N * 100 : 0) + "%");
    var txt = "Move " + k + " of " + this.N;
    this.count.textContent = txt;
    this.range.setAttribute("aria-valuetext", "Move " + k + " of " + this.N);
    this.btnPrev.setAttribute("aria-disabled", String(t <= 0));
    this.btnNext.setAttribute("aria-disabled", String(t >= this.N));
  };

  Demo.prototype.fit = function (r) {
    var w = r.canvas.clientWidth;
    if (!w) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var px = Math.round(w * dpr), py = Math.round(px * this.vh / 256);
    if (r.canvas.width !== px || r.canvas.height !== py) { r.canvas.width = px; r.canvas.height = py; }
    var c = r.ctx;
    c.k = px / 256;          // device pixels per board unit
    c.y0 = this.y0; c.y1 = this.y0 + this.vh;
    r.u = 256 / w;           // board units per CSS pixel
    c.small = w < 200;
    c.setTransform(c.k, 0, 0, c.k, 0, -this.y0 * c.k);
    c.imageSmoothingEnabled = false;
    return true;
  };

  Demo.prototype.draw = function (r, t) {
    if (!this.fit(r)) return;
    var c = r.ctx;
    c.clearRect(0, this.y0, 256, this.vh);
    if (this.d.kind === "pacman") this.drawPacman(r, t);
    else this.drawSokoban(r, t);
  };

  /* Sokoban: the empty board, then boxes and the player; a move slides them over one step */
  Demo.prototype.drawSokoban = function (r, t) {
    var c = r.ctx, u = r.u, run = r.data, S = this.meta.sokoban, d = this.d, sh = this.sheet;
    var cell = S.board / S.grid, goals = S.goals[d.base], st = run.states, n = st.length - 1;
    var base = S.bases[d.base];
    c.drawImage(sh, base[0], base[1], base[2], base[3], 0, 0, 256, 256);
    var a, b, f;
    if (t >= n) { a = b = st[n]; f = 0; }
    else { var k = Math.floor(t); a = st[k]; b = st[k + 1]; f = ease(t - k); }
    // the blocked push at the end of a run: the box and the player nudge forward and back
    var bump = 0, bd = null;
    if (run.bump && t > n && t < n + 1) { bump = .2 * Math.sin(Math.PI * (t - n)); bd = run.bump.dir; }
    function isGoal(p) { for (var i = 0; i < goals.length; i++) if (goals[i][0] === p[0] && goals[i][1] === p[1]) return true; return false; }
    var pos = [];
    for (var i = 0; i < a.b.length; i++) {
      var p0 = a.b[i], p1 = b.b[i];
      var y = lerp(p0[0], p1[0], f), x = lerp(p0[1], p1[1], f);
      if (bd && i === run.bump.box) { y += bd[0] * bump; x += bd[1] * bump; }
      pos.push([y, x]);
      var spr = S.sprites[isGoal(f > .5 ? p1 : p0) ? "box_goal" : "box"];
      c.drawImage(sh, spr[0], spr[1], spr[2], spr[3], x * cell, y * cell, cell, cell);
    }
    var py = lerp(a.p[0], b.p[0], f), px = lerp(a.p[1], b.p[1], f);
    if (bd) { py += bd[0] * bump; px += bd[1] * bump; }
    var ps = S.sprites.player;
    c.drawImage(sh, ps[0], ps[1], ps[2], ps[3], px * cell, py * cell, cell, cell);

    var mid = function (q) { return [(q[1] + .5) * cell, (q[0] + .5) * cell]; };
    var col = run.ok ? GREEN : RED, pulse = this.playing ? 1.5 * Math.sin(this.pos / 160) : 0;
    // what this run goes for first, ringed until it is first pushed
    if (run.target != null) {
      var q = mid(pos[run.target]);
      ring(c, q[0], q[1], 21, col, fadeOut(t, r.firstPush, .5), u, pulse);
    }
    // the legal pushes at the start; each run takes one of them
    (d.choices || []).forEach(function (ch) {
      var q = mid(st[0].b[ch.box]), mine = ch.run === r.idx;
      var x0 = q[0] + ch.dir[1] * 9, y0 = q[1] + ch.dir[0] * 9;
      arrow(c, x0, y0, x0 + ch.dir[1] * 25, y0 + ch.dir[0] * 25, mine ? col : "#fff",
        mine ? 3.2 * u : 2 * u, fadeOut(t, 0, .45) * (mine ? 1 : .8), u, !mine);
    });
    (d.tags || []).forEach(function (tg) {   // "near" / "far", one cell beside the box (tg.at = [dr, dc])
      var q = mid(pos[tg.box]), at = tg.at || [-1, 0];
      pill(c, q[0] + at[1] * cell * .9, q[1] + at[0] * cell * .8, tg.text, INK, fadeOut(t, 0, .5), u);
    });
    // why the failing run is stuck
    var e = run.end;
    if (e) {
      var ea = fadeIn(t, n + (run.bump ? .35 : .05), .4);
      if (e.band) {
        c.save(); c.globalAlpha = ea;
        c.fillStyle = "rgba(255,107,85,.3)";
        var y0 = e.band[0][0] * cell, xs = e.band.map(function (q) { return q[1]; });
        var bx0 = Math.min.apply(null, xs) * cell, bx1 = (Math.max.apply(null, xs) + 1) * cell;
        c.fillRect(bx0, y0, bx1 - bx0, cell);
        c.strokeStyle = RED; c.lineWidth = 2 * u; c.setLineDash([5 * u, 3.5 * u]);
        c.strokeRect(bx0 + u, y0 + u, bx1 - bx0 - 2 * u, cell - 2 * u);
        c.restore();
        pill(c, (bx0 + bx1) / 2, y0 - 14 * u, "can\u2019t leave this row", RED_INK, ea, u);
      }
      if (e.back) {   // it can never be pushed back down: a cross on its lower edge
        var s1 = mid(pos[e.back.box]), s2 = mid(e.back.to);
        crossBadge(c, (s1[0] + s2[0]) / 2, (s1[1] + s2[1]) / 2, ea, u);
      }
      (e.rings || []).forEach(function (q) {
        var m = mid(q);
        ring(c, m[0], m[1], 21, RED, ea, u, pulse);
        pill(c, m[0], m[1] - 30, "blocked", RED_INK, ea, u);
      });
      if (e.block && e.rings) {   // where the farther box runs into the nearer one
        var m1 = mid(e.rings[0]), m2 = mid(e.block);
        crossBadge(c, (m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2, ea, u);
      }
    }
  };

  /* Pacman: the real frame after each move, Pacman's path so far as a glowing trail */
  Demo.prototype.drawPacman = function (r, t) {
    var c = r.ctx, u = r.u, run = r.data, P = this.meta.pacman, d = this.d, sh = this.sheet;
    var last = run.frames.length - 1;
    var k = t <= 0 ? 0 : Math.min(last, Math.ceil(t - 1e-6));     // a move shows its frame at once
    var fi = run.frames[k], fs = P.frame;
    c.drawImage(sh, (fi % P.cols) * fs, Math.floor(fi / P.cols) * fs, fs, fs, 0, 0, 256, 256);
    var col = run.ok ? GREEN : RED, path = run.path;
    var j = Math.min(Math.floor(t + 1e-6), last), pts = [];
    for (var i = 0; i <= j; i++) pts.push([path[i][0] * 256, path[i][1] * 256]);
    if (j < last) {   // the trail head reaches Pacman's new cell early in the move
      var g = ease(clamp((t - j) / .35, 0, 1));
      pts.push([lerp(path[j][0], path[j + 1][0], g) * 256, lerp(path[j][1], path[j + 1][1], g) * 256]);
    }
    if (pts.length > 1) {
      c.save();
      c.lineCap = "round"; c.lineJoin = "round";
      c.strokeStyle = col; c.globalAlpha = .9;
      c.shadowColor = col; c.shadowBlur = 12 * c.k * u;
      c.lineWidth = 3.2 * u;
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (var p = 1; p < pts.length; p++) c.lineTo(pts[p][0], pts[p][1]);
      c.stroke();
      c.restore();
    }
    var pulse = this.playing ? 1.5 * Math.sin(this.pos / 160) : 0;
    var food = d.food[run.target];
    ring(c, food[0] * 256, food[1] * 256, 17, col, fadeOut(t, run.eaten - 1, .4), u, pulse);
    (d.tags || []).forEach(function (tg) {
      var q = d.food[tg.food];
      pill(c, q[0] * 256, q[1] * 256 - 22, tg.text, INK, fadeOut(t, 0, .5), u);
    });
    var ea = fadeIn(t, last - .6, .4);
    ((run.end && run.end.rings) || []).forEach(function (q) {
      ring(c, q[0] * 256, q[1] * 256, 19, RED, ea, u, pulse);
      pill(c, q[0] * 256 + 6, q[1] * 256 + 30, "caught", RED_INK, ea, u);
    });
  };

  /* ---------------- one clock for every playing animation ---------------- */
  var demos = [], raf = 0, last = 0;
  Demo.loop = function () {
    if (raf) return;
    last = 0;
    raf = requestAnimationFrame(function frame(now) {
      var dt = last ? Math.min(now - last, 100) : 0;
      last = now;
      var any = false;
      demos.forEach(function (d) { if (d.playing && d.visible) { d.tick(dt); any = true; } });
      raf = any ? requestAnimationFrame(frame) : 0;
    });
  };

  function load(src) {
    return new Promise(function (ok, fail) {
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = fail;
      im.src = src;
    });
  }
  function boot() {
    var roots = document.querySelectorAll("[data-trap]");
    if (!roots.length || !window.Promise || !window.fetch) return;
    Promise.all([
      fetch(DIR + "traps.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      load(DIR + "sokoban.webp"), load(DIR + "pacman.webp")
    ]).then(function (res) {
      var meta = res[0], sheets = {sokoban: res[1], pacman: res[2]};
      Array.prototype.forEach.call(roots, function (root) {
        if (!meta.demos[root.getAttribute("data-trap")]) return;
        var d = new Demo(root, meta, sheets);
        demos.push(d);
        watch(d);
      });
      var redraw = function () { demos.forEach(function (d) { d.update(false); }); };
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(redraw);
        demos.forEach(function (d) { ro.observe(d.stage); });
      } else window.addEventListener("resize", redraw);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);   // the labels' font
      if (reduceMQ && reduceMQ.addEventListener) reduceMQ.addEventListener("change", function () {
        demos.forEach(function (d) { if (reduced()) { d.pause(); d.seek(d.N, false); } });
      });
    }, function () { /* keep the still images */ });
  }
  // plays while on screen (unless the reader paused it); with reduced motion it stays on the last frames
  function watch(d) {
    if (!("IntersectionObserver" in window)) { d.visible = true; if (!reduced()) d.play(); return; }
    new IntersectionObserver(function (es) {
      var e = es[0];
      d.visible = e.isIntersecting && e.intersectionRatio >= .35;
      if (d.visible && !d.userPaused && !reduced()) d.play();
      if (d.visible && d.playing) Demo.loop();
    }, {threshold: [0, .35, .6]}).observe(d.stage);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
