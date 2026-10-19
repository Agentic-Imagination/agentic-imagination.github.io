# Agima project website

Static project page for *Training an Imaginative Agent* (Agima), served by GitHub Pages from the
repository root (`main` branch, `/`) at https://agentic-imagination.github.io/.
Plain HTML, CSS and JavaScript: no framework, no build step.

## Preview locally

```bash
python -m http.server 8000      # run in the repo root
```

Then open http://localhost:8000. Opening `index.html` straight from disk mostly works too, but a local
server is closer to GitHub Pages. All asset paths are relative, so the same files work locally and on Pages.

## Page structure

`index.html`, top to bottom:

- **Top bar**: the Agima mark, links to every section, and a reading-progress line.
- **Hero**: title (with *Agentic* and *Imagination* in colour), authors (each name links to the author's homepage,
  in a new tab; names without a known homepage are plain text, marked `TODO(link)` in the HTML), affiliations, the Paper / arXiv / Code
  pill buttons, then the teaser video (a play/pause button and a **Sound** on/off toggle over it; its native controls, which show a
  running time, are only the no-JavaScript fallback).
- **TL;DR**: one sentence from the abstract: Agima (Agentic Imagination) trains an agent to imagine before it acts.
- **Numbered chapters** on alternating plain and tinted bands:
  01 Method (Figure 1 with a moving highlight and three cards for the three imagination formats;
  selecting a card highlights its part of the figure) ·
  02 Environments (train/test clips) ·
  03 Easy-to-hard generalization (*Success across K* as a table, with a switch to line charts across K, and the
  linked *real board vs imagined* viewer; clicking a column, or hovering a row, brings out Agima's numbers) ·
  04 Planning traps (three animations, each a failing and a succeeding run side by side, then the results table) ·
  05 Agentic RL: A (Fig. 4b, 4c charts), B (the interactive Fig. 5, Fig. 6a, 6b charts),
  C (Fig. 6c, 6d charts, `clip_fork.mp4` as an illustration).
- **Citation**: the BibTeX entry with a copy button, then the footer.

## Files

- `index.html`: the page, including the meta tags for link previews.
- `assets/css/styles.css`: all styles. The colour tokens at the top (`:root`) are the same as the teaser's:
  paper `#F7F5F0`, ink `#161618`, muted `#76746E`, imagination blue `#2660E0`, act green `#12926C`,
  dead-end red `#D44C38`, Format-2 amber `#C47012`. Dashed outlines mean *imagined*; solid green means *acted on*.
  Fonts come from Google Fonts: Cormorant Garamond for headings and Inter for body text.
- `assets/css/results.css`: the author links, the TL;DR keywords and the emphasis in the *Success across K* table
  (loaded after `styles.css`).
- `assets/js/main.js`: everything interactive except the RL charts and the paper figures in `figures.js`.
  - Figures: the results tables and charts (their data is inline at the top of the file), the rollout viewer,
    the Figure 1 highlight, and the BibTeX copy button.
  - Videos: every `<video>` has `autoplay muted loop playsinline` in the HTML, so it plays with JavaScript off.
    With IntersectionObserver, `main.js` takes over: it drops the autoplay attribute, stops the download of every
    video that is not near the screen (`preload="none"`, poster kept), plays each one only while it is on screen,
    pauses everything in a hidden tab, and keeps a video paused once the reader pauses it. Every video (the teaser
    too) gets a small play/pause button; clicking the video also toggles it. The teaser also has the Sound toggle.
  - Page chrome: scroll-reveal and the section nav (active link, progress bar, back-to-top button).
    It also makes the unfinished `data-todo` links inert.
  - The Figure 1 highlight and the environment GIFs have an **Auto-play on/off** switch, and the highlight
    pauses while the pointer is over it or keyboard focus is inside it. Picking a format card stops the
    highlight on that card. When the GIFs are off, each one is swapped for its first frame (`*_still.webp`).
  - The page respects `prefers-reduced-motion`. With it set, the videos start paused on their poster
    (play button shown), the reveal/entrance animations are off, Figure 1 shows a static state, and the
    environment clips show still frames (each can still be started).
- `assets/js/rl-charts.js`: the animated RL charts. It draws into each `<div class="rl-chart" data-chart="KEY">`,
  where KEY is `fig4b`, `fig4c`, `fig6a`, `fig6b`, `fig6c` or `fig6d`.
- `assets/js/figures.js`: the interactive versions of the static paper figures (see below).
- `assets/js/traps.js`, `assets/css/traps.css`: the planning-trap animations (see below).
- `assets/images/`: paper figures (WebP). Figures 1, 3 and 5 link to their full-size files, so phone readers can
  open and zoom them. The RL figures (`fig4_*`, `fig6_*`) are shown only with JavaScript off, in place of the charts.
  `traps/` holds the old before/after boards of the three planning traps (256×256, 32 px cells; the teaser reads them);
  `traps_anim/` the data of the trap animations (`traps.json`, the sprite sheets `sokoban.webp` and `pacman.webp`,
  and each run's last frame, `<trap>_fail.webp` / `<trap>_ok.webp`, the images without JavaScript);
  `fig5/` the 124×124 board thumbnails cropped from `fig5_rl_qualitative.webp` (`input`, `fmt1_1-4` = Format 1,
  `c1_*`, `c2_*` = Format 2 Candidates 1 and 2, `u1_*` to `u3_*` = the unified format's three rows).
  The teaser renderer also reads `fig5_rl_qualitative.webp` and `traps/`.
- `assets/gifs/env/`: the train/test rollouts in the Environments chapter, each with a first-frame still
  (`*_still.webp`). If you replace a GIF, regenerate its still.
- `assets/gifs/rollout_split/`: one sprite sheet per environment and K (`<env>_k<K>.webp`, env = `pacman`,
  `maze2d`, `sokoban`, `pusht`; K = `1`, `3`, `5`, `10`, `inf`) for the rollout viewer. Each frame is a 504×256 cell,
  four per row: what Agima sees (248×248) at the left, the real environment (256×256) at x = 248.
- `assets/video/`: the teaser (`agima_teaser_v3.mp4`, 1280×720, with sound, plus its poster) and `clip_fork.mp4`
  (silent, H.264, 1280×720, with its WebP poster `clip_fork.webp`).
- `tools/teaser/`: the script that renders the teaser and the clips, with its fonts and input frames (see its README).
- `tools/figures/make_figure_assets.py`: rebuilds `assets/gifs/rollout_split/` and `assets/images/fig5/` (Pillow; it
  reads the original rollout GIFs from git, commit `828b511`, or from `--gifs DIR`), prints the frame-kind table
  that `main.js` keeps as `ROLLOUT_KINDS`, and exits with an error if that table or `stepMs()` in `main.js` no longer
  matches the GIFs. Run it after replacing a rollout GIF.
- `tools/figures/make_trap_assets.py`: rebuilds `assets/images/traps_anim/` with the teaser engine's Sokoban levels,
  tiles and solver (`tools/teaser/make_teaser.py`) and the Pacman episode in `tools/teaser/inputs/`. It checks every
  claim the animations make with the solver (deadlock, which cells a box can still reach, the solutions) and exits
  with an error if one fails; `--preview DIR` writes contact sheets of every step.
- `.nojekyll`: tells GitHub Pages to serve the files as they are.

## Interactive figures

All of them are progressive enhancement: the HTML holds the plain paper figure (or the last frame of each trap run),
and the scripts build the interactive version on top. They work with mouse, touch and keyboard, fit down to 320 px,
and respect `prefers-reduced-motion` (nothing moves by itself; plans show complete).

- **Success across K** (`renderKResults` in `main.js`, from `K_RESULTS`): a table by default, environments × K
  (1, 3, 5, 10, ∞) with the methods as rows, grouped as closed-source and fine-tuned; the best value per column is
  bold, the Agima row is tinted, a dash means not evaluated. Each header row (environments, K values) is one tab stop;
  the arrow keys move along it. On screens up to 900 px the table shows one environment at a time (tabs); wider, all
  four fit (the table scrolls sideways inside its card only if it ever overflows). The **Chart** switch shows the same
  numbers as small multiples (`kChart`): one line chart per environment, x = K, one line per method (Agima blue,
  No Imagine grey, the fine-tuned Qwen models light grey, closed-source models dashed). Hover or focus shows every
  value at a K; clicking a K, or the arrow keys on a focused chart, selects it.
- **Real board vs imagined** (`rolloutViewer` in `main.js`): Agima's frame (dashed blue, "imagined") next to the real
  environment (solid, "real"), in the visual language of `clip_fork`. Frames where Agima receives a real observation
  (the start, every K actions, and every frame at K = 1) are drawn solid and labelled "real". It plays the sprite of the
  selected environment and K on two canvases with the source GIFs' frame durations (`FRAME_MS`, `stepMs`), only while
  on screen; the track below shows every frame (click, drag or arrow keys to step; on touch, a vertical swipe still
  scrolls). Selecting a K or an environment in the table, the chart, or the viewer's own buttons updates all of them.
  The sprite loads only when the viewer nears the screen.
- **Planning traps** (`[data-trap]` in `traps.js`, data from `make_trap_assets.py`): three animations, each a failing and a
  succeeding run from the same start, side by side on two canvases and in sync. *Deadlock* (a 2-box level from Agima's Sokoban generator, seed 2797): the nearer box first takes the only goal the farther box can reach; the farther box first solves it. *Irreversible push* (the Structural
  Fork level): at the critical step, up pins a box to the wall in a row with no goal (the cells it can still reach are
  tinted), right solves it. *Pacman route order* (the real episode of the paper's Fig. 3): nearer food first is caught,
  farther food first eats all food, with glowing trails. Sokoban moves slide (empty board plus sprites, drawn
  pixelated); a ring marks what each run goes for first; the failing run ends with a red cross and a short shake, the
  other with a green check. Each plays while on screen and loops; a click or tap on the boards, or Space, pauses it;
  the step buttons, the scrubber and the arrow keys step through it. With reduced motion it shows the last frames.
- **Fig. 5** (`[data-fig5]`): rebuilt in HTML from the board thumbnails and the figure's own text (`FIG5`); a Before RL /
  After RL switch, plans that reveal board by board (step buttons, arrow keys, once automatically when first on
  screen), a red cross on dead ends and a green check on the plan that works. Blue and amber mark what the unified
  format keeps from Format 1 (the step-by-step rollout) and Format 2 (candidates, results, commit).

## Still to do before release

- **Links**: set the `href` of the Paper, arXiv and Code buttons in the hero (`TODO(links)` in `index.html`).
  While a button is marked `data-todo` with `href="#"`, it shows dashed with a "soon" tag and does nothing on
  click. Remove `data-todo` once its link is real.
- **BibTeX**: fill in the venue and year (`TODO(bibtex)` in `index.html`).
- **Link previews**: `og:*`, `twitter:*` and `canonical` use absolute URLs under
  `https://agentic-imagination.github.io/`. Update them if the site moves to another address.
  If the teaser is re-rendered under a new name, update the `<video>` source, the poster and those meta tags.

## Before each push

Run `python tools/stamp_assets.py`: it stamps every CSS/JS reference in `index.html` with a hash of the
file (`?v=...`), so browsers pick up the new version right away instead of a cached one (Pages caches for
10 minutes).
