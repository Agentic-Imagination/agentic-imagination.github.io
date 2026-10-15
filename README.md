# Agima project website

Static project page for *Planning with Agentic Imagination* (Agima), served by GitHub Pages from the
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
- **Hero**: title (with *Agentic* and *Imagination* in colour), authors, affiliations, the Paper / arXiv / Code
  pill buttons, then the teaser video (a play/pause button and a **Sound** on/off toggle over it; its native controls, which show a
  running time, are only the no-JavaScript fallback).
- **TL;DR**: two sentences on what Agima is (one model, policy plus world model; three imagination formats;
  SFT, then RL with a success reward).
- **Numbered chapters** on alternating plain and tinted bands:
  01 Method (`clip_method.mp4`, then Figure 1 with a moving highlight and three cards for the three
  imagination formats; selecting a card highlights its part of the figure) ·
  02 Environments (train/test clips) ·
  03 Results (headline numbers, the K chart/table, the imagined-frame ablation) ·
  04 Planning traps (`clip_trap_deadlock.mp4`, `clip_trap_fork.mp4`, `clip_trap_pacman.mp4`, then the results table) ·
  05 Agentic RL: A (Fig. 4b, 4c charts), B (`clip_format.mp4`, Fig. 6a, 6b charts),
  C (Fig. 6c, 6d charts, `clip_fork.mp4` as an illustration).
- **Citation**: the BibTeX entry with a copy button, then the footer.

## Files

- `index.html`: the page, including the meta tags for link previews.
- `assets/css/styles.css`: all styles. The colour tokens at the top (`:root`) are the same as the teaser's:
  paper `#F7F5F0`, ink `#161618`, muted `#76746E`, imagination blue `#2660E0`, act green `#12926C`,
  dead-end red `#D44C38`, Format-2 amber `#C47012`. Dashed outlines mean *imagined*; solid green means *acted on*.
  Fonts come from Google Fonts: Cormorant Garamond for headings and Inter for body text.
- `assets/js/main.js`: everything interactive except the RL charts.
  - Figures: the results charts and tables (their data is inline at the top of the file), the Figure 1
    highlight, and the BibTeX copy button.
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
    (play button shown), the reveal/entrance/bar animations are off, Figure 1 shows a static state, and the
    environment clips show still frames (each can still be started).
- `assets/js/rl-charts.js`: the animated RL charts. It draws into each `<div class="rl-chart" data-chart="KEY">`,
  where KEY is `fig4b`, `fig4c`, `fig6a`, `fig6b`, `fig6c` or `fig6d`.
- `assets/images/`: paper figures (WebP). Figure 1 links to its full-size file, so phone readers can open and
  zoom it. The RL figures (`fig4_*`, `fig6_*`) are linked only as the no-JavaScript fallback for the charts.
  `fig5_rl_qualitative.webp` and `traps/` are not shown on the page; the teaser renderer reads them (Fig. 5 frames,
  the Sokoban levels). With JavaScript off, `fig4_*` and `fig6_*` are shown in place of the RL charts.
- `assets/gifs/env/`: the train/test rollouts in the Environments chapter, each with a first-frame still
  (`*_still.webp`). If you replace a GIF, regenerate its still.
- `assets/video/`: the teaser (`agima_teaser_v3.mp4`, 1280×720, with sound) and the silent animation clips
  (`clip_method`, `clip_trap_deadlock`, `clip_trap_fork`, `clip_trap_pacman`, `clip_format`, `clip_fork`;
  H.264, 1280×720), each with a WebP poster of the same name.
- `tools/teaser/`: the script that renders the teaser and the clips, with its fonts and input frames (see its README).
- `.nojekyll`: tells GitHub Pages to serve the files as they are.

## Still to do before release

- **Links**: set the `href` of the Paper, arXiv and Code buttons in the hero (`TODO(links)` in `index.html`).
  While a button is marked `data-todo` with `href="#"`, it shows dashed with a "soon" tag and does nothing on
  click. Remove `data-todo` once its link is real.
- **BibTeX**: fill in the venue and year (`TODO(bibtex)` in `index.html`).
- **Link previews**: `og:*`, `twitter:*` and `canonical` use absolute URLs under
  `https://agentic-imagination.github.io/`. Update them if the site moves to another address.
  If the teaser is re-rendered under a new name, update the `<video>` source, the poster and those meta tags.
