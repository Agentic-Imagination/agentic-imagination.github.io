# Teaser video

Renders `assets/video/agima_teaser_v3.mp4`, the 38-second teaser on the project page.
A render also writes the poster beside it (`agima_teaser_v3_poster.webp`, the end of the search scene) and, for the
site's own teaser, the link-preview image `assets/images/agima_og.jpg` (the same frame as a JPEG).

```bash
pip install -r tools/teaser/requirements.txt   # plus ffmpeg on PATH
python tools/teaser/make_teaser_v3.py              # writes assets/video/agima_teaser_v3.mp4
python tools/teaser/make_teaser_v3.py --music TRACK.mp3  # with another track as the background music
python tools/teaser/make_teaser_v3.py --audio-only # only re-make the soundtrack of the existing render (seconds)
python tools/teaser/make_teaser_v3.py --no-audio   # the same, without a soundtrack
python tools/teaser/make_teaser_v3.py -o out.mp4   # or to another file
python tools/teaser/make_teaser_v3.py --stills DIR # preview stills of every scene into DIR
python tools/teaser/make_teaser_v3.py --poster     # only the poster and the share image, without re-rendering
```

The script works from any directory; paths are resolved relative to the script.

The same script renders short silent clips in the teaser's visual language (each fades in from and out to the
background, so it loops; ~1-3 s per clip second to render). The page uses only `clip_fork`:

```bash
python tools/teaser/make_teaser_v3.py --list-clips              # names, durations, what each shows
python tools/teaser/make_teaser_v3.py --clip clip_fork          # writes assets/video/clip_fork.mp4 + clip_fork.webp (poster)
python tools/teaser/make_teaser_v3.py --clip all                # all of them, into assets/video/
python tools/teaser/make_teaser_v3.py --clip clip_fork -o x.mp4 # or to another file (the poster goes beside it)
python tools/teaser/make_teaser_v3.py --clip clip_fork --stills DIR   # preview stills instead
```

- `clip_method`: the search scene alone (imagine step by step, rewind dead ends, act, then the fast real-board solve)
- `clip_format`: the emerge scene for the page (`sc_emerge_page`): a new format after RL, without the teaser's small
  Fig. 6b curve (the page draws that chart itself), so the unified format is centred and set larger
- `clip_fork`: an illustration on the fork trap (not a recorded run): before RL it has no branch at this fork and the
  risky push deadlocks the real board; after RL it branches at the fork, sees that push fail in imagination,
  rewinds, imagines the safe way and acts on it (the real board stays at the fork; the acted path turns green).
  Both models branch (Fig. 6c); the clip shows only where the branch lands (Fig. 6d)
- `clip_trap_deadlock`, `clip_trap_fork`: without imagination the tempting push jams a box; Agima imagines it, sees
  the deadlock, rewinds, imagines another route to the end and acts on it
- `clip_trap_pacman`: the real Pacman episodes, linear rollout (nearer food first, caught by the ghost) vs forward
  thinking (farther food first, all food eaten), with glowing trails; a red ring marks the capture

Clips are H.264 without audio, CRF 25 (`--crf` to change).

A full render takes about 2–3 minutes. Every frame is drawn with Pillow at 2560×1440 and
downsampled to 1280×720, then piped to ffmpeg (H.264, 30 fps).
### Sound

The soundtrack is one piece of background music, synthesised by the script itself (`render_score`), so it needs no
licence or credit: D major at about 103 BPM, a warm pad, an electric-piano arpeggio in eighths, a soft bass and,
from the fifth bar, a light kick and hats; bells join for the second half. Its bars are laid on the scene timeline
(`PROG`, `_bars`): under the hook a pad on Bm7 swells into the first bar, the groove starts on the search scene's
first frame, the tonic lands on the end card's, and the last 1.5 s fade out so the looping video starts again
cleanly. The track is set to -18 LUFS (true peak at most -1.5 dBTP) by a two-pass, linear `loudnorm` and muxed in
as 160 kb/s stereo AAC. The page always starts the teaser muted; its Sound button turns the music on.

- `--music PATH` uses any track ffmpeg can read instead: it is looped (with a 1 s crossfade) or trimmed to the
  video's 37.9 s, faded in over 0.5 s and out over the last 2 s, then set to the same loudness. Use a track the
  site may host: CC0 or the Pixabay Content License (no credit needed, though a line in the page footer is kind),
  or CC BY (Free Music Archive, ccMixter, Incompetech), which needs a credit in the footer (title, artist, licence,
  link).
- `--sfx` mixes the old event sounds back in (a blip per imagined frame, a knock per dead end, a swoosh per rewind,
  a ding per plan that works; `audio_events`), with their peaks 10 dB under the music.
- `--audio-only` re-makes only the soundtrack (with `--music` and `--sfx` as given) and swaps it into the existing
  render (the site's teaser, or `-o`), copying the frames as they are.

## Files

- `make_teaser_v3.py`: the current teaser. Scenes, in order:
  - hook: the whole board, large; without imagination it pushes the nearest box left and deadlocks, then the level
    restarts and the board shrinks into place
  - the Agima model takes in the real board, then rides just ahead of the trajectory, firing out every imagined frame
  - Sokoban imagine / branch / act rollout: dead ends are crossed out and rewound to where they branched off;
    at the end, the real board plays every committed move out, fast
  - easy-to-hard results (all four tasks at once)
  - agentic RL: success on unseen 4-box fork puzzles over RL steps for Agima (Branching), Agima-A7B and an action-only
    model (read off the paper's Fig. 4c; `RL_AGIMA`, `RL_A7B`, `RL_ACT`), beside an illustration on the page's fork trap
    (not a recorded run): before RL it takes the risky push and deadlocks; after RL it branches at the fork first
  - a new format emerges after RL (unified format = Format 1 + Format 2): the two SFT formats (the paper's Fig. 5a frames); part of one is discarded,
    the rest merges into the unified format (Fig. 5b), beside a small chart of the share of episodes in that
    format over RL steps (read off Fig. 6b; `EM_HYBRID`)
  - end card (fast)
- `make_teaser_v2.py`, `make_teaser.py`: earlier cuts. v3 imports their data loading and drawing helpers, so all three are needed.
  Run directly, they render their own (older) cut into the current directory.
- `fonts/`: Gelasio and Inter (SIL Open Font License, from google/fonts).
- `inputs/`: the exported example frames the teaser reads. These are copies of
  `unified_world_model/artifacts/…`:
  - `pacman_near_far_food_vanilla_vs_forward_ep034_branch_start_20260924/`: the Pacman route-order episode: ground truth for both candidates, the linear rollout, and the forward-thinking imagined frames.
  - `sokoban_train_data_forward_branch_examples_20260925/`: the branching and forward-thinking training examples.
  - `sokoban_branching_checkpoint_examples_20260926/…/step_0016.png`: one solved board, used for the box-on-goal sprite.

Everything else comes from the site itself (`assets/images`, `assets/gifs`), so the teaser stays in
sync with the page's figures and GIFs.
