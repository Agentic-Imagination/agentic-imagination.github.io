/* Agima project page: image lightbox, and the panel hotspots on Figure 1.
   Lightbox: a click (or Enter / Space) on a paper figure or image opens it large on a dimmed page, with its
   caption. Esc, the close button or a click beside the image closes it, and focus returns to what opened it.
   Images of one group (the environment clips, the boards of one Fig. 5 view, the two rollout frames) are
   stepped with the arrow keys, the buttons or a horizontal swipe. Zoom: a click on the image, the wheel, a
   pinch or + / -; drag to pan a zoomed image.
     targets: a.zoom (paper figures linking to their full-size file), .fig5-full, [data-lightbox] (space-
     separated group names, set by figures.js on the Fig. 5 boards), the environment GIFs and the rollout
     viewer's canvases (a snapshot of the frame on screen). The trap animations are left alone.
   Figure 1: three hotspot buttons over panels (a), (b), (c) (no hover labels: the figure prints its own panel
   names). One highlights its panel (main.js's highlight box) and writes a one-line caption under the figure; (b) and (c) also select the matching format cards,
   and a card click updates the caption. A corner button opens the figure in the lightbox.
   Progressive enhancement: without JavaScript the figure links open the full-size files. Plain ES5. */
(function () {
  "use strict";
  if (!document.querySelector || !window.addEventListener || !document.body.classList) return;

  var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(reduceMQ && reduceMQ.matches); }
  // the trap animations (traps.js) keep their own controls; a plain link to a paper figure still opens here
  var EXCLUDE = ".compare, [data-compare], .trap-card, .trap-grid, .trap-demos, .trap-anim, [data-trap], [data-no-lightbox]";
  var IMG_LINK = "a[href$='.webp'], a[href$='.png'], a[href$='.jpg'], a[href$='.jpeg'], a[href$='.gif']";
  // captions for paper figures that are linked without an image on the page
  var KNOWN = {
    "fig3_forward_vs_linear": "Paper Figure 3. The Pacman route-order trap. (a) Linear rollout eats the nearer pellet first and is caught by the ghost. " +
      "(b) Forward thinking imagines both orders and commits to up-first, the one that eats every pellet.",
    "fig4_rl_curves": "Paper Figure 4. Training reward and held-out accuracy on the Deadlock and Structural Fork sets over 200 RL steps; solid lines 3 boxes, dashed 4 boxes.",
    "fig6_adaptive_reasoning": "Paper Figure 6. Failure-triggered lookahead, unified-format share, branches per episode and critical-step alignment over RL steps."
  };
  function known(href) { var m = /([^\/]+)\.(webp|png|jpe?g|gif)$/i.exec(href || ""); return m && KNOWN[m[1]]; }
  var ICON = {
    zoom: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M10.5 8v5M8 10.5h5"/></svg>',
    unzoom: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9.5 6l6 6-6 6"/></svg>'
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
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function text(n) { return n ? n.textContent.replace(/\s+/g, " ").trim() : ""; }
  function arr(list) { return Array.prototype.slice.call(list || []); }
  function hint(cls) { return el("span", {class: "lbx-hint" + (cls ? " " + cls : ""), "aria-hidden": "true", html: ICON.zoom}); }
  // an image the reader can actually see: not in an inert / hidden subtree, not faded out (Fig. 5's
  // boards that are not revealed yet)
  function shown(n) {
    if (!n || !n.getClientRects().length) return false;
    if (n.closest("[inert], [aria-hidden='true'], [hidden]")) return false;
    var img = n.tagName === "IMG" || n.tagName === "CANVAS" ? n : n.querySelector("img, canvas");
    return !img || +window.getComputedStyle(img).opacity > 0.05;
  }
  function isPixel(src) { return !!src && !/pusht/i.test(src) && /(gifs\/|fig5\/|traps\/|rollout|^data:)/.test(src); }

  /* ================= items: what a target shows in the lightbox ================= */
  // item = {src, alt, caption, pixel, from (the element it came from)}
  function figCaption(fig) {
    var cap = fig && fig.querySelector(".fig-cap, figcaption");
    if (!cap) return "";
    var c = cap.cloneNode(true);
    arr(c.querySelectorAll("a, button, .visually-hidden")).forEach(function (a) { a.parentNode.removeChild(a); });
    return text(c);
  }
  function zoomItem(a) {
    var img = a.querySelector("img"), fig = a.closest("figure");
    // Figure 1's caption line changes with the panel picked; the enlarged figure gets its full caption
    var cap = fig && fig.classList.contains("imagine-figure") ? "Figure 1. " + (img ? img.alt : "") : figCaption(fig);
    return {src: a.getAttribute("href"), alt: img ? img.alt : "", caption: cap || (img ? img.alt : ""), from: a};
  }
  function fig5FullItem(a) {
    var fig = a.closest("figure"), img = fig && fig.querySelector(".fig5-static img");
    return {src: a.getAttribute("href"), alt: img ? img.alt : "Paper Figure 5", caption: "Figure 7. " + (img ? img.alt.replace(/^Paper Figure 5,\s*/, "") : ""), from: a};
  }
  function imgItem(n) {
    var img = n.tagName === "IMG" ? n : n.querySelector("img");
    if (!img) return null;
    var src = img.currentSrc || img.getAttribute("src");
    return {src: src, alt: img.alt, caption: img.getAttribute("data-lb-caption") || img.alt, pixel: isPixel(src), from: n};
  }
  function envItem(img) {
    var card = img.closest(".env"), fig = img.closest("figure");
    var name = card ? text(card.querySelector("h3")) : "";
    var src = img.getAttribute("src");
    return {src: src, alt: img.alt, caption: [name, text(fig && fig.querySelector("figcaption")), /ground-truth/.test(img.alt) ? "ground-truth rollout" : ""].filter(Boolean).join(", "),
      pixel: isPixel(src), from: img};
  }
  function kvItem(c) {
    var kv = c.closest(".kv"), panel = c.closest(".kv-panel");
    var picked = kv ? arr(kv.querySelectorAll(".kv-segs [aria-pressed='true']")).map(function (b) { return b.getAttribute("aria-label") || text(b); }).join(", ") : "";
    var who = panel ? text(panel.querySelector(".kv-name")) : "";
    var tag = panel ? text(panel.querySelector(".kv-tag")) : "";
    var src = "";
    try { src = c.toDataURL("image/png"); } catch (e) { src = ""; }
    var cap = text(kv && kv.querySelector(".kv-status"));
    return {src: src, alt: c.getAttribute("aria-label") || who, pixel: !/pusht/i.test(picked),
      caption: [who === "Agima" ? "Agima's frame (" + tag + ")" : "Real environment", picked].filter(Boolean).join(", ") + (cap ? ". " + cap : ""), from: c};
  }

  // the group a target belongs to, and its index in it
  function resolve(t) {
    var a, n;
    if ((a = t.closest(".fig5-full"))) return {items: [fig5FullItem(a)], index: 0};
    if ((n = t.closest("[data-lightbox]"))) {
      if (!shown(n)) return null;            // a Fig. 5 board that is not revealed yet
      var names = n.getAttribute("data-lightbox").split(/\s+/);
      for (var g = 0; g < names.length; g++) {
        var members = arr(document.querySelectorAll("[data-lightbox]")).filter(function (m) {
          return m.getAttribute("data-lightbox").split(/\s+/).indexOf(names[g]) >= 0 && shown(m);
        });
        if (members.length > 1 || g === names.length - 1) {
          var items = members.map(imgItem).filter(Boolean);
          var i = members.indexOf(n);
          return {items: items.length ? items : [imgItem(n)], index: Math.max(0, i)};
        }
      }
    }
    if ((a = t.closest("a.zoom"))) return {items: [zoomItem(a)], index: 0};
    if ((a = t.closest(IMG_LINK))) {
      var href = a.getAttribute("href"), im = a.querySelector("img");
      return {items: [{src: href, alt: im ? im.alt : text(a), caption: known(href) || (im ? im.alt : text(a)), pixel: isPixel(href), from: a}], index: 0};
    }
    if ((n = t.closest(".env-grid img"))) {
      var envs = arr(document.querySelectorAll(".env-grid img"));
      return {items: envs.map(envItem), index: envs.indexOf(n)};
    }
    if ((n = t.closest(".kv-canvas"))) {
      var kv = n.closest(".kv"), cs = arr((kv || document).querySelectorAll(".kv-canvas"));
      return {items: cs.map(kvItem), index: cs.indexOf(n)};
    }
    return null;
  }
  var TARGET = ".fig5-full, [data-lightbox], a.zoom, .env-grid img, .kv-canvas, " + IMG_LINK;
  function targetOf(e) {
    var t = e.target && e.target.closest ? e.target.closest(TARGET) : null;
    if (!t || t.closest(".lbx")) return null;
    // links to an image file open here wherever they are; images and canvases not inside the trap demos
    var isLink = t.tagName === "A" && !t.classList.contains("zoom");
    if (isLink ? t.closest("[data-no-lightbox]") : t.closest(EXCLUDE)) return null;
    return t;
  }

  /* ================= the dialog ================= */
  var box = null, ui = {}, cur = {items: [], i: 0, opener: null}, inerted = [], zoom = {s: 1, x: 0, y: 0, max: 4}, fitted = null;
  function build() {
    ui.img = el("img", {class: "lbx-img", alt: "", draggable: "false", decoding: "async"});
    ui.stage = el("div", {class: "lbx-stage"}, [ui.img, el("span", {class: "lbx-spin", "aria-hidden": "true"})]);
    ui.cap = el("p", {class: "lbx-cap", id: "lbx-cap"});
    ui.count = el("span", {class: "lbx-count", "aria-hidden": "true"});
    ui.tip = el("span", {class: "lbx-tip", "aria-hidden": "true", text: "Pinch or tap to zoom"});
    ui.zoomBtn = el("button", {type: "button", class: "lbx-btn", "aria-label": "Zoom in", "aria-pressed": "false", html: ICON.zoom});
    ui.close = el("button", {type: "button", class: "lbx-btn lbx-close", "aria-label": "Close", html: ICON.close});
    ui.prev = el("button", {type: "button", class: "lbx-nav lbx-prev", "aria-label": "Previous image", html: ICON.prev});
    ui.next = el("button", {type: "button", class: "lbx-nav lbx-next", "aria-label": "Next image", html: ICON.next});
    ui.live = el("p", {class: "lbx-sr", "aria-live": "polite"});
    box = el("div", {class: "lbx", role: "dialog", "aria-modal": "true", "aria-label": "Enlarged image", "aria-describedby": "lbx-cap", hidden: ""}, [
      el("div", {class: "lbx-top"}, [ui.count, ui.tip, el("div", {class: "lbx-tools"}, [ui.zoomBtn, ui.close])]),
      ui.stage, ui.prev, ui.next,
      el("div", {class: "lbx-foot"}, [ui.cap]), ui.live
    ]);
    document.body.appendChild(box);

    ui.close.addEventListener("click", close);
    ui.prev.addEventListener("click", function () { go(-1); });
    ui.next.addEventListener("click", function () { go(1); });
    ui.zoomBtn.addEventListener("click", function () { zoomTo(zoom.s > 1.01 ? 1 : Math.min(zoom.max, 2.5), 0, 0, true); });
    ui.img.addEventListener("load", function () { box.classList.remove("is-loading"); fit(); });
    ui.img.addEventListener("error", function () { box.classList.remove("is-loading"); ui.cap.textContent = "The image could not be loaded."; });
    box.addEventListener("keydown", onKey);
    // a click beside the image (the dimmed page, the caption, the top bar) closes; the stage's own pointer
    // handling below decides for clicks in it (a drag that ends beside the image must not close)
    box.addEventListener("click", function (e) {
      if (!e.target.closest(".lbx-stage, button")) close();
    });
    pointerZoom();
    window.addEventListener("resize", function () { if (isOpen()) fit(); });
  }
  function isOpen() { return box && !box.hidden; }

  function open(items, index, opener) {
    if (!items || !items.length) return;
    if (!box) build();
    cur.items = items; cur.opener = opener || document.activeElement;
    box.classList.toggle("is-single", items.length < 2);
    ui.prev.hidden = ui.next.hidden = items.length < 2;
    if (!isOpen() || box.classList.contains("is-closing")) {
      // scroll lock (keeping the page's width), and everything else inert while the dialog is open
      var sw = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.classList.add("lbx-lock");
      if (sw > 0) document.body.style.paddingRight = sw + "px";
      inerted = inerted.concat(arr(document.body.children).filter(function (n) { return n !== box && !n.hasAttribute("inert") && n.tagName !== "SCRIPT"; }));
      inerted.forEach(function (n) { n.setAttribute("inert", ""); });
      box.hidden = false;
      box.classList.remove("is-closing");
      void box.offsetWidth;                // start the fade from the first frame
      box.classList.add("is-open");
    }
    show(index, false);
    ui.close.focus({preventScroll: true});
  }
  function close() {
    if (!isOpen() || box.classList.contains("is-closing")) return;
    box.classList.remove("is-open");
    box.classList.add("is-closing");
    inerted.forEach(function (n) { n.removeAttribute("inert"); });
    inerted = [];
    var back = cur.opener;
    var done = function () {
      if (!box.classList.contains("is-closing")) return;
      box.hidden = true;
      box.classList.remove("is-closing");
      document.documentElement.classList.remove("lbx-lock");
      document.body.style.paddingRight = "";
      ui.img.removeAttribute("src");
    };
    if (reduced()) done(); else setTimeout(done, 170);
    if (back && back.focus && document.contains(back)) back.focus({preventScroll: true});
  }
  function go(d) {
    var n = cur.items.length;
    if (n < 2) return;
    show((cur.i + d + n) % n, true);
  }
  function show(i, announce) {
    cur.i = i;
    var it = cur.items[i];
    zoomTo(1, 0, 0, false);
    fitted = null;
    box.classList.add("is-loading");
    box.classList.toggle("is-pixel", !!it.pixel);
    ui.img.style.width = ui.img.style.height = "";
    ui.img.alt = it.alt || "";
    if (ui.img.getAttribute("src") === it.src && ui.img.complete) { box.classList.remove("is-loading"); fit(); }
    else ui.img.src = it.src;
    ui.cap.textContent = it.caption || it.alt || "";
    ui.count.textContent = cur.items.length > 1 ? (i + 1) + " / " + cur.items.length : "";
    if (announce) ui.live.textContent = "Image " + (i + 1) + " of " + cur.items.length + ". " + (it.caption || it.alt || "");
    // warm the neighbours
    [1, -1].forEach(function (d) {
      var nb = cur.items[(i + d + cur.items.length) % cur.items.length];
      if (nb && nb !== it && nb.src && nb.src.indexOf("data:") !== 0) { var p = new Image(); p.src = nb.src; }
    });
  }
  // size the image: as large as the stage allows; pixel art at a whole-number scale so it stays sharp,
  // small smooth images at most 2.5x their own size
  function fit() {
    var im = ui.img, nw = im.naturalWidth, nh = im.naturalHeight;
    if (!nw || !nh) return;
    var r = ui.stage.getBoundingClientRect(), W = Math.max(40, r.width), H = Math.max(40, r.height);
    var k = Math.min(W / nw, H / nh);
    // (whole device pixels per image pixel: on a 2x screen 1.5x is still exact)
    var dpr = Math.max(1, Math.round((window.devicePixelRatio || 1) * 2) / 2);
    if (cur.items[cur.i] && cur.items[cur.i].pixel) k = k >= 1 ? Math.min(12, Math.floor(k * dpr) / dpr) : k;
    else k = Math.min(k, nw < 900 ? 2.5 : 1);
    fitted = {w: Math.round(nw * k), h: Math.round(nh * k), W: W, H: H};
    im.style.width = fitted.w + "px";
    im.style.height = fitted.h + "px";
    // zoom up to the image's own pixels x2 (at least 2.5x on screen)
    zoom.max = clamp(Math.max(2.5, 2 * nw / fitted.w), 2.5, 8);
    // a figure shown well below its own size gets the zoom tip (touch screens only, see the CSS)
    box.classList.toggle("is-small-fit", fitted.w < nw * 0.6);
    zoomTo(Math.min(zoom.s, zoom.max), zoom.x, zoom.y, false);
  }

  /* ---------- zoom and pan ---------- */
  function apply(animate) {
    ui.img.classList.toggle("is-anim", !!animate && !reduced());
    ui.img.style.transform = zoom.s > 1.001 || zoom.x || zoom.y ?
      "translate(" + zoom.x.toFixed(1) + "px," + zoom.y.toFixed(1) + "px) scale(" + zoom.s.toFixed(3) + ")" : "";
    box.classList.toggle("is-zoomed", zoom.s > 1.01);
    ui.zoomBtn.innerHTML = zoom.s > 1.01 ? ICON.unzoom : ICON.zoom;
    ui.zoomBtn.setAttribute("aria-label", zoom.s > 1.01 ? "Zoom out" : "Zoom in");
    ui.zoomBtn.setAttribute("aria-pressed", String(zoom.s > 1.01));
  }
  function bound() {
    if (!fitted) { zoom.x = zoom.y = 0; return; }
    var mx = Math.max(0, (fitted.w * zoom.s - fitted.W) / 2), my = Math.max(0, (fitted.h * zoom.s - fitted.H) / 2);
    zoom.x = clamp(zoom.x, -mx, mx);
    zoom.y = clamp(zoom.y, -my, my);
  }
  // zoom to s keeping the point (px, py) (relative to the stage centre) where it is
  function zoomTo(s, px, py, animate) {
    s = clamp(s, 1, zoom.max || 4);
    var k = s / zoom.s;
    zoom.x = px - (px - zoom.x) * k;
    zoom.y = py - (py - zoom.y) * k;
    zoom.s = s;
    if (s <= 1.001) { zoom.s = 1; zoom.x = zoom.y = 0; }
    bound();
    apply(animate);
  }
  function rel(e) {
    var r = ui.stage.getBoundingClientRect();
    return {x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2};
  }
  function pointerZoom() {
    var st = ui.stage, pts = {}, start = null, pinch = null;
    function count() { return Object.keys(pts).length; }
    function mid() {
      var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]];
      return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1};
    }
    st.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pts[e.pointerId] = rel(e);
      if (st.setPointerCapture) st.setPointerCapture(e.pointerId);
      if (count() === 1) start = {p: rel(e), x: zoom.x, y: zoom.y, moved: false, onImg: e.target === ui.img};
      else if (count() === 2) { var m = mid(); pinch = {m: m, s: zoom.s, x: zoom.x, y: zoom.y}; if (start) start.moved = true; }
      e.preventDefault();
    });
    st.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = rel(e);
      if (pinch && count() >= 2) {
        var m = mid(), s = clamp(pinch.s * m.d / pinch.m.d, 1, zoom.max), k = s / pinch.s;
        zoom.s = s;
        zoom.x = m.x - (pinch.m.x - pinch.x) * k;
        zoom.y = m.y - (pinch.m.y - pinch.y) * k;
        bound(); apply(false);
        return;
      }
      if (!start) return;
      var p = pts[e.pointerId], dx = p.x - start.p.x, dy = p.y - start.p.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) start.moved = true;
      if (zoom.s > 1.01) { zoom.x = start.x + dx; zoom.y = start.y + dy; bound(); apply(false); }
      else if (cur.items.length > 1) { ui.img.style.transform = "translateX(" + (dx * 0.35).toFixed(1) + "px)"; }
    });
    function end(e) {
      if (!pts[e.pointerId]) return;
      var p = pts[e.pointerId];
      delete pts[e.pointerId];
      if (pinch) {
        if (count() < 2) pinch = null;
        if (count() === 1) { var k = Object.keys(pts)[0]; start = {p: pts[k], x: zoom.x, y: zoom.y, moved: true}; }
        if (zoom.s < 1.05) zoomTo(1, 0, 0, true);
        return;
      }
      if (!start || count()) return;
      var dx = p.x - start.p.x, dy = p.y - start.p.y, s = start;
      start = null;
      if (e.type === "pointercancel") { apply(false); return; }
      if (!s.moved) {
        // a click: on the image it zooms in (or back out); beside it, it closes
        if (s.onImg) zoomTo(zoom.s > 1.01 ? 1 : Math.min(zoom.max, 2.5), p.x, p.y, true);
        else close();
        return;
      }
      if (zoom.s <= 1.01) {
        if (cur.items.length > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
        else apply(true);
      }
    }
    st.addEventListener("pointerup", end);
    st.addEventListener("pointercancel", end);
    st.addEventListener("wheel", function (e) {
      e.preventDefault();
      var p = rel(e), f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022));
      zoomTo(zoom.s * f, p.x, p.y, false);
    }, {passive: false});
    st.addEventListener("dblclick", function (e) { e.preventDefault(); });
  }

  function onKey(e) {
    var k = e.key;
    if (k === "Escape") { e.preventDefault(); close(); return; }
    if (k === "ArrowRight") { e.preventDefault(); go(1); return; }
    if (k === "ArrowLeft") { e.preventDefault(); go(-1); return; }
    if (k === "+" || k === "=") { e.preventDefault(); zoomTo(zoom.s * 1.4, 0, 0, true); return; }
    if (k === "-" || k === "_") { e.preventDefault(); zoomTo(zoom.s / 1.4, 0, 0, true); return; }
    if (k === "0") { e.preventDefault(); zoomTo(1, 0, 0, true); return; }
    if (k === "Tab") {
      // focus stays in the dialog
      var f = arr(box.querySelectorAll("button")).filter(function (b) { return !b.hidden && b.getClientRects().length; });
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }

  /* ================= wiring the targets ================= */
  function openFrom(t, opener) {
    var g = resolve(t);
    if (g && g.items.length && g.items[g.index] && g.items[g.index].src) open(g.items, g.index, opener || t);
  }
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = targetOf(e);
    if (!t) return;
    e.preventDefault();
    openFrom(t);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var t = e.target;
    if (!t || !t.closest || isOpen()) return;
    // Fig. 5: Enter on the step-by-step region opens the board of the current step (or the input board)
    if (e.key === "Enter" && t.classList && t.classList.contains("f5-stack")) {
      var now = arr(t.querySelectorAll(".f5-view.is-on .f5-step.is-now .f5-board"));
      var on = arr(t.querySelectorAll(".f5-view.is-on .f5-step.is-on .f5-board"));
      var root = t.closest(".f5") || document;
      var pickB = now[0] || on[on.length - 1] || root.querySelector(".f5-input .f5-board");
      if (pickB) { e.preventDefault(); openFrom(pickB, t); }
      return;
    }
    // images made focusable below (links and buttons activate by themselves)
    if (t.getAttribute("data-lbx-key") === "1" && !t.closest(EXCLUDE)) { e.preventDefault(); openFrom(t); }
  });

  // affordance: zoom-in cursor and a corner icon; keyboard access for images that are not links
  function decorate() {
    arr(document.querySelectorAll("a.zoom")).forEach(function (a) {
      if (a.closest(EXCLUDE) || a.querySelector(".lbx-hint")) return;
      a.classList.add("lbx-target");
      a.appendChild(hint());
    });
    arr(document.querySelectorAll(".env-grid img")).forEach(function (img) {
      if (img.hasAttribute("data-lbx-key")) return;
      img.setAttribute("data-lbx-key", "1");
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", "Enlarge: " + img.alt);
      var fig = img.closest("figure") || img.parentNode;
      fig.classList.add("lbx-target", "lbx-box");
      fig.appendChild(hint());
    });
    arr(document.querySelectorAll("[data-lightbox]")).forEach(function (n) {
      if (n.classList.contains("lbx-target")) return;
      n.classList.add("lbx-target", "lbx-small");
      n.appendChild(hint("is-small"));
    });
    arr(document.querySelectorAll(".kv-canvas")).forEach(function (c) {
      if (c.hasAttribute("data-lbx-key")) return;
      c.setAttribute("data-lbx-key", "1");
      c.setAttribute("tabindex", "0");
      c.setAttribute("title", "Enlarge");
      var b = c.closest(".kv-box") || c.parentNode;
      b.classList.add("lbx-target", "lbx-box");
      b.appendChild(hint());
    });
  }

  /* ================= Figure 1: panel hotspots ================= */
  // Panel boxes, percent of fig1_overview.webp (2401 x 1150), measured on the white gutters between panels.
  var PANELS = [
    {id: "a", name: "Feedback after acting", box: {left: "0.1%", top: "0.2%", width: "49.3%", height: "24.3%"},
     cap: "The policy <i>π</i><sub>θ</sub> commits <i>a</i><sub><i>t</i></sub> and learns its outcome only from the environment’s next frame <i>o</i><sub><i>t</i>+1</sub>."},
    {id: "b", name: "Feedback through imagination", box: {left: "50.5%", top: "0.2%", width: "49.4%", height: "24.3%"}, card: ["linear"],
     cap: "One model <i>M</i><sub>θ</sub> predicts the frame <i>ô</i><sub><i>t</i>+1</sub> after its own action <i>â</i><sub><i>t</i></sub> and plans the next action from it, for <i>K</i> steps."},
    {id: "c", name: "Planning with Agima", box: {left: "0.1%", top: "26.7%", width: "99.8%", height: "73.1%"}, card: ["branch", "forward"],
     cap: "Branching imagines the alternative push and rejects it (deadlock); forward thinking imagines plans A and B and commits to B, the one that solves."}
  ];
  function initFig1() {
    var diagram = document.querySelector(".imagine-figure .team-diagram");
    if (!diagram || diagram.querySelector(".f1-hot")) return;
    var figure = diagram.closest("figure");
    var link = diagram.querySelector("a.zoom"), img = diagram.querySelector("img");
    if (!img) return;
    var hl = diagram.querySelector(".team-highlight-primary");
    var cards = arr(document.querySelectorAll("[data-format-step]"));
    var layer = el("div", {class: "f1-hot", role: "group", "aria-label": "Figure 1 panels"});
    // the caption under the figure (in the HTML; made here if it is missing) describes the panel picked
    var tools = figure && figure.querySelector(".figure-tools");
    var cap = (tools && tools.querySelector(".f1-cap")) || el("p", {class: "f1-cap"});
    cap.setAttribute("aria-live", "polite");
    var sel = null;
    var spots = PANELS.map(function (p) {
      var b = el("button", {type: "button", class: "f1-spot", "aria-pressed": "false", "aria-label": "Panel (" + p.id + "): " + p.name,
        style: "left:" + p.box.left + ";top:" + p.box.top + ";width:" + p.box.width + ";height:" + p.box.height});
      b.addEventListener("click", function () { pick(p.id, true); });
      layer.appendChild(b);
      return b;
    });
    // the corner button that opens the whole figure in the lightbox (the image itself is under the hotspots)
    var big = el("button", {type: "button", class: "f1-enlarge", "aria-label": "Enlarge Figure 1", html: ICON.zoom + "<span>Enlarge</span>"});
    big.addEventListener("click", function () {
      if (link) openFrom(link, big);
      else open([{src: img.currentSrc || img.src, alt: img.alt, caption: "Figure 1. " + img.alt}], 0, big);
    });
    diagram.appendChild(layer);
    diagram.appendChild(big);
    diagram.classList.add("has-f1-hot");
    if (link) link.setAttribute("tabindex", "-1");      // the Enlarge button replaces the link for the keyboard

    if (!cap.parentNode) {
      if (tools) { tools.insertBefore(cap, tools.firstChild); tools.hidden = false; }
      else diagram.parentNode.insertBefore(cap, diagram.nextSibling);
    }
    idle();

    function idle() {
      cap.classList.remove("is-on");
      cap.innerHTML = "<b>Figure 1.</b> Planning with agentic imagination: (a) feedback after acting, (b) feedback through imagination with Agima, " +
        "(c) counterfactual branching and forward thinking in Sokoban. Select a panel for its description.";
    }
    function caption(p) {
      cap.classList.add("is-on");
      cap.innerHTML = "<b>Figure 1(" + p.id + ").</b> " + p.name + ". " + p.cap;
    }
    function setCards(names) {
      cards.forEach(function (c) {
        var on = names.indexOf(c.getAttribute("data-format-step")) >= 0;
        c.classList.toggle("is-active", on);
        var b = c.querySelector(".format-btn");
        if (b) b.setAttribute("aria-pressed", String(on));
      });
    }
    function pick(id, fromSpot) {
      var p = PANELS.filter(function (q) { return q.id === id; })[0];
      if (!p) return;
      sel = id;
      spots.forEach(function (b, i) { b.setAttribute("aria-pressed", String(PANELS[i].id === id)); });
      caption(p);
      if (!fromSpot) return;
      // (b) is exactly the linear-rollout card's region: let main.js select that card; (a) and (c) move the
      // highlight box here and mark the cards that belong to the panel
      var single = p.card && p.card.length === 1 && cards.filter(function (c) { return c.getAttribute("data-format-step") === p.card[0]; })[0];
      if (single) { syncing = true; single.click(); syncing = false; }
      else setCards(p.card || []);
      if (hl) {
        Object.keys(p.box).forEach(function (k) { hl.style[k] = p.box[k]; });
        hl.classList.remove("is-hidden");
      }
      diagram.classList.add("is-active");
    }
    // a click on a format card (main.js moves the highlight) selects the panel that card belongs to
    var syncing = false;
    cards.forEach(function (c) {
      c.addEventListener("click", function () {
        if (syncing) return;
        var step = c.getAttribute("data-format-step");
        var p = PANELS.filter(function (q) { return q.card && q.card.indexOf(step) >= 0; })[0];
        if (p) pick(p.id, false);
      });
    });
  }

  function boot() {
    initFig1();
    decorate();
    // the viewers that main.js / figures.js build later (or rebuild) get the same treatment
    setTimeout(decorate, 1500);
  }
  window.AgimaLightbox = {open: open, close: close, refresh: decorate};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
