"""Builds the image assets behind the page's interactive figures (assets/js/figures.js, assets/js/main.js).

  python tools/figures/make_figure_assets.py            # needs Pillow, and git for the rollout GIFs

1. Rollout sprites, assets/gifs/rollout_split/<env>_k<K>.webp, for the "real board vs imagined" viewer.
   Source: the rollout GIFs of commit 828b511 (assets/gifs/rollout/<env>_k<K>.gif, read with `git show`,
   or from --gifs DIR). Every GIF frame is 530x332: what Agima sees at (4,34)-(252,282) inside a 4 px
   border (teal = a real observation, navy = an imagined frame) and the real environment at
   (274,30)-(530,286). Each frame becomes one 504x256 cell (Agima's view, 248x248, at the left; the
   environment, 256x256, at x = 248), four cells per row. The script prints each GIF's frame kinds
   (r = real observation, i = imagined) as the ROLLOUT_KINDS table for assets/js/main.js, and checks that
   table and main.js's stepMs() (the GIFs' per-step duration) against the GIFs; it exits with an error on a mismatch.
2. Fig. 5 board thumbnails, assets/images/fig5/<row>_<n>.webp (124x124), cropped from
   assets/images/fig5_rl_qualitative.webp (2400x1118) at the board centres below.
"""
import argparse
import io
import os
import re
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENVS = ["pacman", "maze2d", "sokoban", "pusht"]
KS = ["1", "3", "5", "10", "inf"]
LOSSLESS = {"pacman", "sokoban"}       # pixel art: exact pixels, about the same size as lossy
CELL_W, CELL_H, PER_ROW = 504, 256, 4

# Fig. 5 board centres (x per column, y per row), measured on the 2400x1118 figure; boards are ~124 px.
FIG5_X = [880.5, 1134, 1387, 1640.5]
FIG5_ROWS = {
    "fmt1": (97, [1396.5, 1633.5, 1871, 2108.5]),   # (a) Format 1
    "c1": (332, FIG5_X), "c2": (490, FIG5_X),        # (a) Format 2, Candidates 1 and 2
    "u1": (703.5, FIG5_X), "u2": (862, FIG5_X), "u3": (1020.5, FIG5_X),   # (b) unified format, rows 1-3
    "input": (97, [210.5]),
}
FIG5_SIZE = 124


def read_gif(name, gif_dir):
    if gif_dir:
        return Image.open(os.path.join(gif_dir, name))
    data = subprocess.check_output(["git", "-C", ROOT, "show", "828b511:assets/gifs/rollout/" + name])
    return Image.open(io.BytesIO(data))


def step_ms(env, k):
    """Mirror of stepMs() in main.js: the duration of an ordinary step frame."""
    return 480 if k == "1" else 440 if env == "pusht" else 520


def rollouts(gif_dir):
    out = os.path.join(ROOT, "assets", "gifs", "rollout_split")
    os.makedirs(out, exist_ok=True)
    table, problems = {}, []
    for env in ENVS:
        for k in KS:
            im = read_gif("%s_k%s.gif" % (env, k), gif_dir)
            n = im.n_frames
            sheet = Image.new("RGB", (PER_ROW * CELL_W, -(-n // PER_ROW) * CELL_H), (255, 255, 255))
            kinds, steps = "", set()
            for i in range(n):
                im.seek(i)
                f = im.convert("RGB")
                r, g, b = f.getpixel((1, 150))          # the left panel's border
                kinds += "r" if g > b else "i"
                # the start, a real frame after imagined ones and the last frame have their own durations
                if 0 < i < n - 1 and not (kinds[i] == "r" and kinds[i - 1] == "i"):
                    steps.add(im.info.get("duration"))
                x, y = (i % PER_ROW) * CELL_W, (i // PER_ROW) * CELL_H
                sheet.paste(f.crop((4, 34, 252, 282)), (x, y))
                sheet.paste(f.crop((274, 30, 530, 286)), (x + 248, y))
            path = os.path.join(out, "%s_k%s.webp" % (env, k))
            if env in LOSSLESS:
                sheet.save(path, "WEBP", lossless=True, quality=100, method=6)
            else:
                sheet.save(path, "WEBP", quality=85, method=6)
            key = "%s_k%s" % (env, k)
            table[key] = kinds
            print('    %s: "%s",   // %d frames, %d ms per step, %d KB' % (key, kinds, n, max(steps or {0}), os.path.getsize(path) // 1024))
            if steps and steps != {step_ms(env, k)}:
                problems.append("%s: step durations %s, stepMs() gives %d" % (key, sorted(steps), step_ms(env, k)))
    # the table main.js actually uses must match the GIFs
    js = open(os.path.join(ROOT, "assets", "js", "main.js"), encoding="utf-8").read()
    used = dict(re.findall(r'^\s*(\w+_k\w+): "([ri]+)"', js, re.M))
    for key, kinds in table.items():
        if used.get(key) != kinds:
            problems.append("main.js ROLLOUT_KINDS.%s = %r, the GIF gives %r" % (key, used.get(key), kinds))
    if problems:
        sys.exit("MISMATCH\n  " + "\n  ".join(problems))
    print("main.js ROLLOUT_KINDS and stepMs() match the GIFs")


def fig5():
    src = Image.open(os.path.join(ROOT, "assets", "images", "fig5_rl_qualitative.webp")).convert("RGB")
    out = os.path.join(ROOT, "assets", "images", "fig5")
    os.makedirs(out, exist_ok=True)
    h = FIG5_SIZE / 2
    for row, (y, xs) in FIG5_ROWS.items():
        for i, x in enumerate(xs):
            box = (int(round(x - h + .5)), int(round(y - h + .5)))
            tile = src.crop((box[0], box[1], box[0] + FIG5_SIZE, box[1] + FIG5_SIZE))
            name = row if row == "input" else "%s_%d" % (row, i + 1)
            tile.save(os.path.join(out, name + ".webp"), "WEBP", quality=90, method=6)
    print("fig5 thumbnails ->", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--gifs", help="directory with <env>_k<K>.gif (default: read them from git, commit 828b511)")
    args = ap.parse_args()
    rollouts(args.gifs)
    fig5()
