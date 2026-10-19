"""Builds the image assets behind the page's interactive figures (assets/js/figures.js, assets/js/main.js).

  python tools/figures/make_figure_assets.py            # needs Pillow, and git for the rollout GIFs
  python tools/figures/make_figure_assets.py --maze2d-archives DIR   # also rebuild Maze2D K = 3, 5, 10, inf
  python tools/figures/make_figure_assets.py --maze2d-archives DIR --rank   # only repeat the Maze2D episode choice
  python tools/stamp_assets.py                                       # then: new sprite versions in main.js

1. Rollout sprites, assets/gifs/rollout_split/<env>_k<K>.webp, for the "real board vs imagined" viewer.
   Each frame is one 504x256 cell (Agima's view, 248x248, at the left; the real environment, 256x256,
   at x = 248), four cells per row. The script prints each sprite's frame kinds (r = real observation,
   i = imagined) as the ROLLOUT_KINDS table for assets/js/main.js, and checks that table and main.js's
   stepMs() against its sources; it exits with an error on a mismatch.
   - Most sprites come from the rollout GIFs of commit 828b511 (assets/gifs/rollout/<env>_k<K>.gif, read
     with `git show`, or from --gifs DIR). Every GIF frame is 530x332: what Agima sees at (4,34)-(252,282)
     inside a 4 px border (teal = a real observation, navy = an imagined frame) and the real environment
     at (274,30)-(530,286). stepMs() must match the GIFs' per-step duration.
   - Maze2D at K = 3, 5, 10 and inf comes from the full Table 1 evals instead, from the episodes listed in
     tools/figures/maze2d_rollouts.json (archive, episode, seed, and why each was chosen). With
     --maze2d-archives DIR (the folder with maze2d_k<K>_cot.tar.gz) the script reads each episode straight
     from its archive: renders/step_NNNN.png is the real board after NNNN actions, gen_obs/imaginedNN.png
     the frames Agima imagined, cot_full_text.txt says which action each imagined frame belongs to, and
     episode_stats.json which actions ran in which chunk. The sprite shows the start, then for every
     chunk Agima's imagined frame of each executed action next to the real board, then the real
     observation that ends the chunk. It also lists the steps where the imagined blue agent dot is
     missing, checks them against the JSON and prints them as the ROLLOUT_NO_AGENT table of main.js (the
     viewer's caption names those frames). Without the option these sprites are left as they are.
     --rank repeats the choice instead: for every successful episode of each run in which every executed
     action has its own imagined frame, it measures the dotless frames and the distance between the
     imagined and the real dot, and ranks them by the rule in the JSON's 'about'.
2. Fig. 5 board thumbnails, assets/images/fig5/<row>_<n>.webp (124x124), cropped from
   assets/images/fig5_rl_qualitative.webp (2400x1118) at the board centres below.
"""
import argparse
import array
import ast
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile

from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENVS = ["pacman", "maze2d", "sokoban", "pusht"]
KS = ["1", "3", "5", "10", "inf"]
LOSSLESS = {"pacman", "sokoban"}       # pixel art: exact pixels, about the same size as lossy
CELL_W, CELL_H, PER_ROW = 504, 256, 4
MAZE2D_EVALS = os.path.join(ROOT, "tools", "figures", "maze2d_rollouts.json")
MAZE_CELL_PX = 17                      # about one maze cell in the 256 px renders
ACTION = r"\('(?:move|stop)',\s*(?:'stop'|\d+)\)"

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


def save_sheet(cells, path, lossless):
    """cells: one (Agima's view 248x248, environment 256x256) pair per frame."""
    sheet = Image.new("RGB", (PER_ROW * CELL_W, -(-len(cells) // PER_ROW) * CELL_H), (255, 255, 255))
    for i, (agima, env) in enumerate(cells):
        x, y = (i % PER_ROW) * CELL_W, (i // PER_ROW) * CELL_H
        sheet.paste(agima, (x, y))
        sheet.paste(env, (x + 248, y))
    if lossless:
        sheet.save(path, "WEBP", lossless=True, quality=100, method=6)
    else:
        sheet.save(path, "WEBP", quality=85, method=6)


def read_episode(archive, prefix):
    """The files of one eval episode, {path inside the episode folder: bytes}, read from its .tar.gz."""
    files = {}
    with tarfile.open(archive, "r|gz") as tar:
        for m in tar:
            if m.isfile() and m.name.startswith(prefix + "/"):
                files[m.name[len(prefix) + 1:]] = tar.extractfile(m).read()
    if not files:
        sys.exit("%s: no episode %s" % (archive, prefix))
    return files


def imagined_index(text, history):
    """(chunk, index of its gen_obs/imaginedNN.png) for every executed action. Chunks are separated by
    '----- CHUNK -----'; an action followed by <|vision_start|> is imagined, with one frame each; the actions after
    </think> are committed (a think block cut off before </think> commits what it imagined). Imagined steps beyond
    what the chunk executed are not shown. Raises ValueError for an episode that does not fit this."""
    out, offset = [], 0
    for c, t in enumerate(text.split("\n\n----- CHUNK -----\n\n")):
        imagined = [ast.literal_eval(a) for a in re.findall(ACTION + r"(?=<\|vision_start\|>)", t)]
        committed = [ast.literal_eval(a) for a in re.findall(ACTION, t.split("</think>")[-1])] if "</think>" in t else imagined
        executed = [ast.literal_eval(h["action"]) for h in history if h["chunk"] == c]
        n = len(executed)
        if t.count("<|vision_start|>") != len(imagined):
            raise ValueError("chunk %d: %d imagined frames for %d imagined actions" % (c, t.count("<|vision_start|>"), len(imagined)))
        if executed != committed[:n] or executed != imagined[:n]:
            raise ValueError("chunk %d: executed %s, imagined %s, committed %s" % (c, executed, imagined, committed))
        out += [(c, offset + j) for j in range(n)]
        offset += len(imagined)
    if len(out) != len(history):
        raise ValueError("%d executed actions, %d mapped" % (len(history), len(out)))
    return out


def dot_centre(im):
    """Centre (x, y) of the agent's blue dot (pure blue, about 44 px, in the renders; near-blue in Agima's frames),
    or None when it is not drawn."""
    r, g, b = im.split()
    low = lambda v: 255 if v < 120 else 0
    mask = ImageChops.multiply(ImageChops.multiply(r.point(low), g.point(low)), b.point(lambda v: 255 if v > 140 else 0))
    if mask.histogram()[255] < 15:
        return None
    mask = mask.convert("F")         # the mean of each column and row, as 32-bit floats
    cols = array.array("f", mask.resize((mask.width, 1), Image.BOX).tobytes())
    rows = array.array("f", mask.resize((1, mask.height), Image.BOX).tobytes())
    return (sum((x + .5) * v for x, v in enumerate(cols)) / sum(cols), sum((y + .5) * v for y, v in enumerate(rows)) / sum(rows))


def has_dot(im):
    return dot_centre(im) is not None


def score_episode(files):
    """(dotless steps, mean and max distance in px between Agima's and the real dot) of a usable episode: one in
    which every executed action has its own imagined frame. Raises ValueError for the others."""
    stats = json.loads(files["episode_stats.json"])
    steps = imagined_index(files["cot_full_text.txt"].decode("utf-8"), stats["history"])
    frame = lambda name: Image.open(io.BytesIO(files[name])).convert("RGB")
    missing, offsets = [], []
    for s, (c, i) in enumerate(steps, 1):
        name = "gen_obs/imagined%02d.png" % i
        if name not in files:
            raise ValueError("no %s" % name)
        imag, real = frame(name), frame("renders/step_%04d.png" % s)
        a, b = dot_centre(imag), dot_centre(real)
        if a is None:
            missing.append(s)
        elif b is not None:
            k = real.width / imag.width
            offsets.append(((a[0] * k - b[0]) ** 2 + (a[1] * k - b[1]) ** 2) ** .5)
    return missing, (sum(offsets) / len(offsets) if offsets else None), (max(offsets) if offsets else None)


def rank_maze2d(archives):
    """Repeats the choice of each episode in maze2d_rollouts.json from the whole run; returns problems."""
    problems = []
    for key, ep in json.load(open(MAZE2D_EVALS, encoding="utf-8"))["episodes"].items():
        run = ep["episode"].rsplit("/", 1)[0]
        episodes = {}
        with tarfile.open(os.path.join(archives, ep["archive"]), "r|gz") as tar:
            for m in tar:
                if m.isfile() and m.name.startswith(run + "/") and not m.name.endswith(".gif"):
                    name, _, path = m.name[len(run) + 1:].partition("/")
                    if path:
                        episodes.setdefault(name, {})[path] = tar.extractfile(m).read()
        successes, scored = 0, []
        for name, files in sorted(episodes.items()):
            stats = json.loads(files["episode_stats.json"])
            if not stats["stats"]["success"]:
                continue
            successes += 1
            try:
                missing, mean, worst = score_episode(files)
            except ValueError:
                continue
            scored.append((stats["global_index"], stats["episode_seed"], missing, mean, worst))
        # the imagined dot stays within one maze cell of the real one on average; then the fewest dotless frames,
        # then the smallest mean offset
        ranked = sorted((e for e in scored if e[3] is not None and e[3] < MAZE_CELL_PX), key=lambda e: (len(e[2]), e[3]))
        print("    %s: %d successes, %d usable, %d within a cell; best:" % (key, successes, len(scored), len(ranked)))
        for e in ranked[:3]:
            print("      episode %d (seed %d): dot missing at %s, offset mean %.1f px, max %.1f px" % e)
        if not ranked or ranked[0][0] != ep["index"]:
            problems.append("%s: the ranking picks episode %s, maze2d_rollouts.json episode %d" % (key, ranked[0][0] if ranked else None, ep["index"]))
        if (successes, len(scored)) != (ep["successes"], ep.get("usable")):
            problems.append("%s: %d successes, %d usable; maze2d_rollouts.json says %s, %s" % (key, successes, len(scored), ep["successes"], ep.get("usable")))
    return problems


def maze2d_from_evals(archives, out):
    """Builds the Maze2D sprites listed in maze2d_rollouts.json; returns ({key: kinds}, problems)."""
    table, problems = {}, []
    for key, ep in json.load(open(MAZE2D_EVALS, encoding="utf-8"))["episodes"].items():
        archive = os.path.join(archives, ep["archive"])
        digest = hashlib.sha256()
        with open(archive, "rb") as f:
            for block in iter(lambda: f.read(1 << 20), b""):
                digest.update(block)
        if digest.hexdigest() != ep["sha256"]:
            problems.append("%s: %s is not the archive in maze2d_rollouts.json (sha256)" % (key, archive))
        files = read_episode(archive, ep["episode"])
        stats = json.loads(files["episode_stats.json"])
        if not stats["stats"]["success"] or stats["episode_seed"] != ep["seed"]:
            problems.append("%s: not the successful episode with seed %d" % (key, ep["seed"]))
        try:
            steps = imagined_index(files["cot_full_text.txt"].decode("utf-8"), stats["history"])
        except ValueError as e:
            sys.exit("%s: %s" % (key, e))
        frame = lambda name: Image.open(io.BytesIO(files[name])).convert("RGB")
        real = [frame("renders/step_%04d.png" % s) for s in range(len(steps) + 1)]
        view = lambda im: im.resize((248, 248), Image.LANCZOS)
        cells, kinds, missing = [(view(real[0]), real[0])], "r", []
        for s, (c, i) in enumerate(steps, 1):
            imag = frame("gen_obs/imagined%02d.png" % i)
            if not has_dot(imag):
                missing.append(s)
            cells.append((view(imag), real[s]))
            kinds += "i"
            if s < len(steps) and steps[s][0] != c:          # the chunk ends: Agima gets the real board
                cells.append((view(real[s]), real[s]))
                kinds += "r"
        path = os.path.join(out, key + ".webp")
        save_sheet(cells, path, "maze2d" in LOSSLESS)
        table[key] = kinds, missing
        print('    %s: "%s",   // %d frames, %d KB; episode %d (seed %d), blue dot missing in %d of %d imagined frames %s'
              % (key, kinds, len(kinds), os.path.getsize(path) // 1024, ep["index"], ep["seed"], len(missing), len(steps), missing))
        if kinds != ep["kinds"] or missing != ep["dot_missing"]:
            problems.append("%s: maze2d_rollouts.json says kinds %r, dot missing at %s" % (key, ep["kinds"], ep["dot_missing"]))
    return table, problems


def rollouts(gif_dir, maze2d_archives):
    out = os.path.join(ROOT, "assets", "gifs", "rollout_split")
    os.makedirs(out, exist_ok=True)
    evals = json.load(open(MAZE2D_EVALS, encoding="utf-8"))["episodes"]
    table, problems = {}, []
    for env in ENVS:
        for k in KS:
            key = "%s_k%s" % (env, k)
            if key in evals:
                continue
            im = read_gif("%s_k%s.gif" % (env, k), gif_dir)
            n = im.n_frames
            cells, kinds, steps = [], "", set()
            for i in range(n):
                im.seek(i)
                f = im.convert("RGB")
                r, g, b = f.getpixel((1, 150))          # the left panel's border
                kinds += "r" if g > b else "i"
                # the start, a real frame after imagined ones and the last frame have their own durations
                if 0 < i < n - 1 and not (kinds[i] == "r" and kinds[i - 1] == "i"):
                    steps.add(im.info.get("duration"))
                cells.append((f.crop((4, 34, 252, 282)), f.crop((274, 30, 530, 286))))
            path = os.path.join(out, key + ".webp")
            save_sheet(cells, path, env in LOSSLESS)
            table[key] = kinds, []
            print('    %s: "%s",   // %d frames, %d ms per step, %d KB' % (key, kinds, n, max(steps or {0}), os.path.getsize(path) // 1024))
            if steps and steps != {step_ms(env, k)}:
                problems.append("%s: step durations %s, stepMs() gives %d" % (key, sorted(steps), step_ms(env, k)))
    if maze2d_archives:
        t, p = maze2d_from_evals(maze2d_archives, out)
        table.update(t)
        problems += p
    else:
        table.update({key: (ep["kinds"], ep["dot_missing"]) for key, ep in evals.items()})
        print("    (Maze2D K = 3, 5, 10, inf left as they are; --maze2d-archives DIR rebuilds them)")
    # the table main.js actually uses must match the sprites
    js = open(os.path.join(ROOT, "assets", "js", "main.js"), encoding="utf-8").read()
    used = dict(re.findall(r'^\s*(\w+_k\w+): "([ri]+)"', js, re.M))
    lost = re.search(r"var ROLLOUT_NO_AGENT = \{([^}]*)\}", js)
    lost = {k: [int(x) for x in v.split(",") if x.strip()] for k, v in re.findall(r"(\w+_k\w+): \[([\d, ]*)\]", lost.group(1) if lost else "")}
    print("  var ROLLOUT_NO_AGENT = {%s};" % ", ".join("%s: %s" % (k, m) for k, (_, m) in table.items() if m))
    for key, (kinds, missing) in table.items():
        if used.get(key) != kinds:
            problems.append("main.js ROLLOUT_KINDS.%s = %r, the sprite gives %r" % (key, used.get(key), kinds))
        if lost.get(key, []) != missing:
            problems.append("main.js ROLLOUT_NO_AGENT.%s = %s, the sprite has no agent at steps %s" % (key, lost.get(key), missing))
    if problems:
        sys.exit("MISMATCH\n  " + "\n  ".join(problems))
    print("main.js ROLLOUT_KINDS, ROLLOUT_NO_AGENT and stepMs() match the sprites (run tools/stamp_assets.py next)")


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
    ap.add_argument("--maze2d-archives", metavar="DIR",
                    help="directory with the Maze2D eval archives maze2d_k<K>_cot.tar.gz (see maze2d_rollouts.json)")
    ap.add_argument("--rank", action="store_true",
                    help="with --maze2d-archives: only repeat the choice of the Maze2D episodes (reads every episode)")
    args = ap.parse_args()
    if args.rank:
        if not args.maze2d_archives:
            ap.error("--rank needs --maze2d-archives DIR")
        problems = rank_maze2d(args.maze2d_archives)
        if problems:
            sys.exit("MISMATCH\n  " + "\n  ".join(problems))
        print("the ranking picks the episodes of maze2d_rollouts.json")
    else:
        rollouts(args.gifs, args.maze2d_archives)
        fig5()
