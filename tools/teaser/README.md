# Teaser video

Renders `assets/video/agima_teaser_v3.mp4`, the 38-second teaser on the project page.
After re-rendering, refresh the poster frame too:
`ffmpeg -y -ss 4.0 -i assets/video/agima_teaser_v3.mp4 -frames:v 1 -c:v libwebp -quality 85 assets/video/agima_teaser_v3_poster.webp`.

```bash
pip install -r tools/teaser/requirements.txt   # plus ffmpeg on PATH
python tools/teaser/make_teaser_v3.py              # writes assets/video/agima_teaser_v3.mp4
python tools/teaser/make_teaser_v3.py --no-audio   # the same, without the sound effects
python tools/teaser/make_teaser_v3.py -o out.mp4   # or to another file
python tools/teaser/make_teaser_v3.py --stills DIR # preview stills of every scene into DIR
```

The script works from any directory; paths are resolved relative to the script.

A full render takes about 2–3 minutes. Every frame is drawn with Pillow at 2560×1440 and
downsampled to 1280×720, then piped to ffmpeg (H.264, 30 fps).
The sound effects (a blip per imagined frame, a knock per dead end, a swoosh per rewind, a ding per plan
that works) are synthesised in the script from the same timelines and muxed in as AAC.

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
