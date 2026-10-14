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
  pill buttons, then the teaser video (autoplays muted and loops, with native controls and a
  **Sound** on/off toggle over it).
- **TL;DR**: one sentence and three *Finding* cards.
- **Numbered chapters** on alternating plain and tinted bands:
  01 Abstract · 02 Method (Figure 1 with a moving highlight, plus three cards for the three ways Agima imagines;
  selecting a card highlights its part of the figure) ·
  03 Environments (train/test clips, the action-chunk K timeline and the Sokoban K viewer) ·
  04 Results (headline numbers, the K chart/table, the imagined-frame ablation) ·
  05 Planning traps (trap cards, results table, Pacman example) · 06 Agentic RL (A/B/C figures).
- **Citation**: the BibTeX entry with a copy button, then the footer.

## Files

- `index.html`: the page, including the meta tags for link previews.
- `assets/css/styles.css`: all styles. The colour tokens at the top (`:root`) are the same as the teaser's:
  paper `#F7F5F0`, ink `#161618`, muted `#76746E`, imagination blue `#2660E0`, act green `#12926C`,
  dead-end red `#D44C38`, Format-2 amber `#C47012`. Dashed outlines mean *imagined*; solid green means *acted on*.
  Fonts come from Google Fonts: Cormorant Garamond for headings and Inter for body text.
- `assets/js/main.js`: everything interactive.
  - Figures: the results charts and tables (their data is inline at the top of the file), the K timeline and
    the K viewer, the Figure 1 highlight, and the BibTeX copy button.
  - Page chrome: the teaser sound toggle, scroll-reveal, and the section nav (active link, progress bar,
    back-to-top button). It also makes the unfinished `data-todo` links inert.
  - Everything that moves by itself (the Figure 1 highlight, the K timeline, the environment clips) gets an
    **Auto-play on/off** switch, and pauses while the pointer is over it or keyboard focus is inside it.
    Picking a format card stops the Figure 1 highlight on that card. When the clips are off, each GIF is
    swapped for its first frame (`*_still.webp` next to it).
  - All of it is progressive enhancement: with JavaScript off, the text and figures still show, but the
    charts don't.
  - The page respects `prefers-reduced-motion`. With it set, the teaser doesn't autoplay, the
    reveal/entrance/bar animations are off, the K timeline and Figure 1 show static states, and the
    environment clips show still frames (each Auto-play switch starts off and can be turned on).
- `assets/images/`: paper figures (WebP), the planning-trap boards, and the K viewer frames (`kchunks/`).
  The wide figures link to their full-size file, so phone readers can open and zoom them.
- `assets/gifs/env/`: the train/test rollouts in the Environments chapter, each with a first-frame still
  (`*_still.webp`). If you replace a GIF, regenerate its still.
- `assets/gifs/rollout/`: imagined-vs-real rollouts. Neither the page nor the current teaser uses them.
- `assets/video/`: the teaser (`agima_teaser_v3.mp4`, 1280×720, about 38 s, with sound) and its poster frame.
- `tools/teaser/`: the script that renders the teaser, with its fonts and input frames (see its README).
- `.nojekyll`: tells GitHub Pages to serve the files as they are.

## Still to do before release

- **Links**: set the `href` of the Paper, arXiv and Code buttons in the hero (`TODO(links)` in `index.html`).
  While a button is marked `data-todo` with `href="#"`, it shows dashed with a "soon" tag and does nothing on
  click. Remove `data-todo` once its link is real.
- **BibTeX**: fill in the venue and year (`TODO(bibtex)` in `index.html`).
- **Link previews**: `og:*`, `twitter:*` and `canonical` use absolute URLs under
  `https://agentic-imagination.github.io/`. Update them if the site moves to another address.
  If the teaser is re-rendered under a new name, update the `<video>` source, the poster, those meta tags,
  and the "38 s" in the caption under the video.
