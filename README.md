# Agima project website

Static project page for *Train an Imaginative Agent* (Agima), served by GitHub Pages from the
repository root (`main` branch, `/`) at https://agima.net/ (custom domain; CNAME in the repo root).
Plain HTML, CSS and JavaScript: no framework, no build step.

## Preview locally

```bash
python -m http.server 8000      # run in the repo root
```

Then open http://localhost:8000. Opening `index.html` straight from disk mostly works too, but a local
server is closer to GitHub Pages. All asset paths are relative, so the same files work locally and on Pages.

## Page structure

`index.html`, top to bottom:

- **Top bar**: a static bar: the Agima mark (a solid ink square = real behind a dashed blue square = imagined, the same
  drawing as the favicon) with the "Agima" wordmark, and links to every section. Above it, fixed to the very top of the
  window, a 2 px imagination-blue reading-progress bar that fills as the page scrolls (`initProgress` in `main.js`).
- **Hero**: title, authors (each name links to the author's homepage,
  in a new tab; names without a known homepage are plain text, `<span class="author-name">`), affiliations, the Paper / arXiv / Code
  buttons (unfinished links carry `aria-disabled="true"` and `title="Coming soon"`), then the teaser video (a play/pause
  button and a **Sound off / on** toggle over it; its native controls, which show a running time, are only the
  no-JavaScript fallback).
- **Summary**: one sentence from the abstract, the page's first paragraph: Agima (Agentic Imagination) trains an agent
  to imagine before it acts.
- **Sections**, separated by space only, each an `h2` (40 px serif), a lead paragraph, then figures with paper-style
  captions under them (each caption runs the full width of its figure); sub-sections are an `h3` (26 px serif with a
  short ink rule above it). Figures are numbered in page order (Figures 1–10, Tables 1–2); a figure taken from the paper names its paper
  number in the caption, e.g. "(paper Fig. 4b–c)":
  Method (Figure 1, the paper's overview, and Figure 2, the three imagination formats; selecting a format marks its
  part of Figure 1),
  Environments (Figure 3, train/test clips),
  Easy-to-hard generalization (Table 1, with a switch to line charts across K, and Figure 4, the linked
  *real board vs imagined* viewer; selecting a column of Table 1 plays its rollout),
  Planning traps (Figures 5a–c, each a failing and a succeeding run side by side, then Table 2 = paper Table 3),
  Agentic RL (Figure 6 charts = paper Fig. 4b–c; Figure 7, the interactive paper Fig. 5; Figures 8 and 9 charts =
  paper Fig. 6a–d; Figure 10, `clip_fork.mp4`, an illustration).
- **Citation**: the BibTeX entry with a copy button, then the footer (the mark, the name and the title, then the
  design credits).

## Files

- `index.html`: the page, including the meta tags for link previews.
- `assets/css/styles.css`: all styles. The core palette at the top (`:root`): paper `#FFFFFF`, ink `#16181D`,
  graphite `#555B67` (captions and secondary text), rule `#DADDE3` (hairlines that carry information), mist `#F3F4F6`
  (the one surface tint) and imagination blue `#2660E0`, the only accent. Act green `#12926C`, dead-end red `#D44C38`
  and Format-2 amber `#C47012` are used only inside figures. Dashed outlines mean *imagined*; solid green means *acted on*.
  The charts, the trap canvases and the teaser use the same values (Forward = amber, Branching = blue, reference models
  in the neutral greys `--base-strong` `#868C97` and `--base-light` `#C3C7CF`).
  Fonts come from Google Fonts: Source Serif 4 for the writing (title, headings, prose, captions) and Source Sans 3
  for the interface and data (navigation, buttons, controls, tables, legends, chart text); code uses the system monospace.
- `assets/css/results.css`: the author links and Table 1's column sizes (loaded after `styles.css`).
- `assets/js/main.js`: everything interactive except the RL charts and the paper figures in `figures.js`.
  - Figures: the results tables and charts (their data is inline at the top of the file), the rollout viewer,
    the Figure 1 highlight (moved by a click on a Figure 2 format), and the BibTeX copy button.
  - Videos: every `<video>` has `autoplay muted loop playsinline` in the HTML, so it plays with JavaScript off.
    With IntersectionObserver, `main.js` takes over: it drops the autoplay attribute, stops the download of every
    video that is not near the screen (`preload="none"`, poster kept), plays each one only while it is on screen,
    pauses it off screen and everything in a hidden tab, and keeps a video paused once the reader pauses it. Every
    video (the teaser too) gets a small play/pause button; clicking the video also toggles it. The teaser also has the
    Sound toggle, which turns on its background music (videos always start muted). The videos are content, so they autoplay with `prefers-reduced-motion` too.
  - It also makes the unfinished `data-todo` links inert.
  - The environment GIFs have an **Auto-play on/off** switch; when off, each one is swapped for its first frame
    (`*_still.webp`). The GIFs' baked status strip (step and action) is cropped off on the page with CSS
    (`object-fit`); the lightbox shows the whole GIF.
  - The page respects `prefers-reduced-motion`. With it set, the charts are drawn at once, the trap animations and
    the rollout viewer show their last or still frames, and the environment clips show still frames (each can still be
    started). The two videos still autoplay, muted, while on screen.
- `assets/js/rl-charts.js`: the animated RL charts. It draws into each `<div class="rl-chart" data-chart="KEY">`,
  where KEY is `fig4b`, `fig4c`, `fig6a`, `fig6b`, `fig6c` or `fig6d`. Each chart's title starts with the panel letter its figure caption
  cites ("(a) Deadlock-set accuracy"; `panel` in its config), and it has the unit in its y-axis title, plain numbers on the axis and at the line ends, and draws in once when it scrolls into view.
- `assets/js/figures.js`: the interactive versions of the static paper figures (see below).
- `assets/js/traps.js`, `assets/css/traps.css`: the planning-trap animations (see below).
- `assets/images/`: paper figures (WebP), and `agima_og.jpg`, the link-preview image (written by the teaser renderer).
  Paper Figures 1, 3 and 5 link to their full-size files, so phone readers can open and zoom them. The RL figures (`fig4_*`, `fig6_*`) are shown only with JavaScript off, in place of the charts.
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
- `assets/video/`: the teaser (`agima_teaser_v3.mp4`, 1280×720, with background music synthesised by its script, plus its poster) and `clip_fork.mp4`
  (silent, H.264, 1280×720, with its WebP poster `clip_fork.webp`).
- `tools/teaser/`: the script that renders the teaser and the clips, with its fonts and input frames (see its README).
- `tools/figures/make_figure_assets.py`: rebuilds `assets/gifs/rollout_split/` and `assets/images/fig5/` (Pillow; it
  reads the original rollout GIFs from git, commit `828b511`, or from `--gifs DIR`), prints the frame-kind table
  that `main.js` keeps as `ROLLOUT_KINDS`, and exits with an error if that table or `stepMs()` in `main.js` no longer
  matches the GIFs. Run it after replacing a rollout GIF. Maze2D at K = 3, 5, 10 and ∞ comes instead from real
  episodes of the Table 1 evals, listed with their archive, seed and selection in `tools/figures/maze2d_rollouts.json`;
  `--maze2d-archives DIR` (the folder with `maze2d_k<K>_cot.tar.gz`) rebuilds those four sprites from the archives,
  and checks `ROLLOUT_NO_AGENT` in `main.js` (the steps where Agima's frame has lost the blue agent dot); adding
  `--rank` instead repeats the choice of the four episodes over every episode of each run.
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
  bold, the Agima row sits on a light blue band, a dash means not evaluated, and the unit (%) is in the caption. The
  selected column has thin blue side rules. Each header row (environments, K values) is one tab stop;
  the arrow keys move along it. On screens up to 900 px the table shows one environment at a time (tabs); wider, all
  four fit (the table scrolls sideways inside its own box only if it ever overflows). The **Chart** switch shows the same
  numbers as small multiples (`kChart`): one line chart per environment, x = K, one line per method (Agima blue,
  No Imagine grey, the fine-tuned Qwen models light grey, closed-source models dashed). Hover or focus shows every
  value at a K; clicking a K, or the arrow keys on a focused chart, selects it.
- **Figure 4, real board vs imagined** (`rolloutViewer` in `main.js`): Agima's frame (dashed blue, "imagined") next to the real
  environment (solid, "real"), in the visual language of `clip_fork`. Frames where Agima receives a real observation
  (the start, every K actions, and every frame at K = 1) are drawn solid and labelled "real". It plays the sprite of the
  selected environment and K on two canvases with the source GIFs' frame durations (`FRAME_MS`, `stepMs`), only while
  on screen; the track below shows every frame (click, drag or arrow keys to step; on touch, a vertical swipe still
  scrolls). Selecting a K or an environment in the table, the chart, or the viewer's own buttons updates all of them;
  below 900 px the viewer drops its own environment buttons (Table 1's tabs drive it) and its caption names the rollout.
  The sprite loads only when the viewer nears the screen. On the Maze2D frames listed in `ROLLOUT_NO_AGENT` the caption
  says that the agent is missing from Agima's frame (no successful eval episode keeps it in every frame), and a paused
  viewer never stops on one.
- **Planning traps** (`[data-trap]` in `traps.js`, data from `make_trap_assets.py`): three animations, each a failing and a
  succeeding run from the same start, side by side on two canvases and in sync. *Deadlock* (a 2-box level from Agima's Sokoban generator, seed 2797): the nearer box first takes the only goal the farther box can reach; the farther box first solves it. *Irreversible push* (the Structural
  Fork level): at the critical step, up pins a box to the wall in a row with no goal (the cells it can still reach are
  tinted), right solves it. *Pacman route order* (the real episode of the paper's Fig. 3): nearer food first is caught,
  farther food first eats all food, with trails of Pacman's path. Rings and trails use the page's green and red on a
  thin dark keyline (no glows). Sokoban moves slide (empty board plus sprites, drawn
  pixelated); a ring marks what each run goes for first; the failing run ends with a red cross and a short shake, the
  other with a green check. Each plays while on screen and loops; a click or tap on the boards, or Space, pauses it;
  the step buttons, the scrubber and the arrow keys step through it. With reduced motion it shows the last frames.
- **Figure 7 = paper Fig. 5** (`[data-fig5]`): rebuilt in HTML from the board thumbnails and the figure's own text (`FIG5`); a Before RL /
  After RL switch, plans that reveal board by board (step buttons, arrow keys, once automatically when first on
  screen), a red cross on dead ends and a green check on the plan that works. Blue and amber mark what the unified
  format keeps from Format 1 (the step-by-step rollout) and Format 2 (candidates, results, commit).

## Still to do before release

- **Links**: set the `href` of the arXiv button in the hero (`TODO(links)` in `index.html`). Paper links to
  `assets/paper/agima.pdf` (compiled from the Overleaf project with pdflatex); Code links to
  github.com/Agentic-Imagination/Agima.
  While a button is marked `data-todo` with `href="#"`, it carries `aria-disabled="true"` and `title="Coming soon"`
  and does nothing on click. Remove `data-todo`, `aria-disabled` and `title` once its link is real.
- **BibTeX**: fill in the venue and year (`TODO(bibtex)` in `index.html`).
- **Link previews**: `og:*`, `twitter:*` and `canonical` use absolute URLs under
  `https://agima.net/`. Update them if the site moves to another address.
  The share image is `assets/images/agima_og.jpg` (1280×720), written with the teaser's poster by
  `tools/teaser/make_teaser_v3.py`. If the teaser is re-rendered under a new name, update the `<video>` source, the
  poster and those meta tags.

## Before each push

Run `python tools/stamp_assets.py`: it stamps every CSS/JS reference in `index.html` with a hash of the
file (`?v=...`), so browsers pick up the new version right away instead of a cached one (Pages caches for
10 minutes). It first writes the hash of each rollout sprite into `SPRITE_V` in `main.js`, which loads them.
