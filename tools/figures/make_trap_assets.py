"""Builds the assets behind the planning-trap animations (assets/js/traps.js), and checks every claim they make.

  python tools/figures/make_trap_assets.py            # needs numpy, Pillow and opencv (the teaser's requirements)
  python tools/figures/make_trap_assets.py --preview DIR   # also writes contact sheets of every step, for checking

Each animation plays a failing and a succeeding run from the same start, side by side.

1. Deadlock (a 2-box level from Agima's Sokoban generator, seed 2797): the nearer box can be pushed onto the
   goal beside it at once, but that goal is the only one the farther box can ever reach; taking it first
   leaves the farther box nowhere to go. Moving the farther box first solves it. (The DEAD level of the page's old trap images cannot show this: there, every way of
   putting the nearer box on a goal first stays solvable, checked below.)
2. Irreversible push (the FORK level, fork_critical_step.webp, from the Structural Fork set): two pushes are
   legal at the critical step; "up" pins a box to the top wall, in a row with no goal, and no later move can
   bring it back down; "right" starts the solution.
3. Pacman route order (the real episode of the paper's Fig. 3, tools/teaser/inputs/pacman_..._ep034_...):
   the linear rollout eats the nearer food first and is caught; forward thinking eats the farther food first
   and clears the level.

The Sokoban levels, tiles and solver (BFS over player + box positions) are the teaser engine's
(tools/teaser/make_teaser.py: Sokoban, SPR, sok_parse). The script asserts each claim with the solver and
exits with an error if one fails.

Outputs, in assets/images/traps_anim/:
  sokoban.webp   the two empty boards (walls, floor, goals) side by side, 256x256 each (8x8 cells of 32 px),
                 and below them the box, box-on-goal and player sprites (32x32; the player has an alpha mask)
  pacman.webp    the 23 real Pacman frames (256x256), 6 per row: the linear rollout, then forward thinking
  traps.json     sprite rectangles, and per animation the two runs: the states after every move (player,
                 boxes in a fixed order), or the Pacman frame indices with Pacman's centre on each frame,
                 plus the marks the page draws (rings, arrows, the cells a pinned box can still reach)
  <name>_fail.webp, <name>_ok.webp   the last frame of each run (Sokoban: only the rows the page shows, "view"),
                 the page's images without JavaScript
"""
import argparse
import glob
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(ROOT, "tools", "teaser"))
import make_teaser as TZ   # noqa: E402  (loads the trap levels, the tiles and the Pacman episode)

OUT = os.path.join(ROOT, "assets", "images", "traps_anim")
T = TZ.T                                    # 32 px cells, 8x8 boards
MOVES = TZ.MOVES                            # name -> (dr, dc)

# The Deadlock example: a 2-box level from Agima's own Sokoban generator
# (gymnasium/envs/sokoban/room_utils.generate_room(dim=(8, 8), num_steps=20, num_boxes=2) with random/np seed 2797).
# '#' wall, '.' goal, '$' box, '@' player. The nearer box (2,5) is one push from the goal (2,4) beside it. But
# (2,4) is the only goal the farther box (3,5) can ever reach, so the solution brings the farther box there and
# the nearer box to (3,6); pushing the nearer box onto (2,4) first leaves the farther box nowhere to go.
DEADLOCK_GRID = [
    "########",
    "#####  #",
    "####.$@#",
    "#### $.#",
    "###  ###",
    "###  # #",
    "###    #",
    "########",
]
DEADLOCK_FAIL = ["left",                     # the nearer box onto its goal: looks like progress
                 "right", "down",            # the player can only walk round to the right of the farther box
                 "left"]                     # and push it away from its goal, into a dead end
FORK_FAIL = ["up"]
# rows of each 8x8 Sokoban board the page shows: the play area plus one wall row above and below
DEADLOCK_VIEW = [0, 8]
FORK_VIEW = [3, 8]


# ------------------------------------------------------------------ levels and solver
def wall_tile():
    a = np.asarray(TZ.DEAD.im)
    g = TZ.sok_parse(TZ.DEAD.im)
    tiles = [a[r * T:(r + 1) * T, c * T:(c + 1) * T] for r, row in enumerate(g) for c, ch in enumerate(row) if ch == "#"]
    return Image.fromarray(np.median(np.stack(tiles), 0).astype(np.uint8))   # the brick tile (webp noise removed)


def grid_image(grid):
    """Render a text level with the trap images' own tiles."""
    tiles = {"#": WALL, "$": TZ.SPR["box"], "*": TZ.SPR["box_goal"], "@": TZ.SPR["player"],
             "+": TZ.SPR["player_goal"], ".": TZ.SPR["goal"], " ": TZ.SPR["floor"]}
    im = Image.new("RGB", (len(grid[0]) * T, len(grid) * T))
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            im.paste(tiles[ch], (c * T, r * T))
    return im


class Level:
    """A teaser-engine Sokoban level whose boxes keep their identity (a fixed order) through a run."""

    def __init__(self, sok):
        self.S = sok
        self.walls, self.goals = sok.walls, sok.goals
        self.start = (sok.player, tuple(sorted(sok.boxes)))

    def step(self, state, move):
        """(new state, index of the pushed box or None), or None if the move is illegal."""
        p, boxes = state
        n = self.S.step(p, frozenset(boxes), move)
        if n is None:
            return None
        if n[1] == frozenset(boxes):
            return (n[0], boxes), None
        i = boxes.index(n[0])                       # the box that stood where the player now is
        dr, dc = MOVES[move]
        nb = list(boxes); nb[i] = (n[0][0] + dr, n[0][1] + dc)
        return (n[0], tuple(nb)), i

    def run(self, moves, state=None):
        out, pushes = [state or self.start], []
        for m in moves:
            r = self.step(out[-1], m)
            assert r is not None, "illegal move %s in %s" % (m, moves)
            out.append(r[0]); pushes.append(r[1])
        return out, pushes

    def reachable(self, state):
        seen = {state}; q = deque([state])
        while q:
            s = q.popleft()
            for m in MOVES:
                r = self.step(s, m)
                if r and r[0] not in seen:
                    seen.add(r[0]); q.append(r[0])
        return seen

    def solvable(self, state):
        return any(set(b) <= self.goals for _, b in self.reachable(state))

    def solve(self, state=None):
        s0 = state or self.start
        prev = {s0: None}; q = deque([s0])
        while q:
            s = q.popleft()
            if set(s[1]) <= self.goals:
                path = []
                while prev[s]:
                    s, m = prev[s]; path.append(m)
                return path[::-1]
            for m in MOVES:
                r = self.step(s, m)
                if r and r[0] not in prev:
                    prev[r[0]] = (s, m); q.append(r[0])
        return None

    def box_cells(self, state, i):
        """Every cell box i can still occupy, over all states reachable from `state`."""
        return {b[i] for _, b in self.reachable(state)}

    def walk_dist(self, state, cell):
        """Moves for the player to stand next to `cell` (boxes are obstacles), or None."""
        p, boxes = state
        seen = {p: 0}; q = deque([p])
        while q:
            x = q.popleft()
            if abs(x[0] - cell[0]) + abs(x[1] - cell[1]) == 1:
                return seen[x]
            for dr, dc in MOVES.values():
                n = (x[0] + dr, x[1] + dc)
                if n not in seen and n not in self.walls and n not in boxes:
                    seen[n] = seen[x] + 1; q.append(n)
        return None


def first_push(pushes):
    return next(i for i in pushes if i is not None)


def check(cond, msg):
    if not cond:
        sys.exit("CLAIM FAILED: " + msg)
    print("  ok:", msg)


# ------------------------------------------------------------------ 1. Deadlock
def deadlock():
    print("Deadlock (2-box level, generator seed 2797)")
    img = grid_image(DEADLOCK_GRID)
    L = Level(TZ.Sokoban(img))
    check(TZ.sok_parse(L.S.im) == DEADLOCK_GRID, "the rendered level parses back to its grid")
    s0 = L.start
    A = min(range(2), key=lambda i: L.walk_dist(s0, s0[1][i]))
    B = 1 - A
    check(L.walk_dist(s0, s0[1][A]) < L.walk_dist(s0, s0[1][B]),
          "box %s is nearer to the player than box %s" % (s0[1][A], s0[1][B]))
    check(L.solvable(s0), "the start is solvable")

    fail, fpush = L.run(DEADLOCK_FAIL)
    k = fpush.index(A) + 1                         # the state right after the nearer box is pushed
    gA = fail[k][1][A]
    check(fpush[:k].count(None) == k - 1 and gA in L.goals,
          "the failing run's first push puts the nearer box on a goal %s" % (gA,))
    check(not L.solvable(fail[k]), "that state is unsolvable (deadlock)")
    reach_B = L.box_cells(fail[k], B)
    check(not (reach_B & L.goals), "from then on the farther box can only reach %s, no goal" % sorted(reach_B))
    check(L.box_cells(s0, B) & L.goals == {gA},
          "from the start, the only goal the farther box can ever reach is %s, the one the nearer box takes" % (gA,))
    check(L.step(fail[-1], DEADLOCK_FAIL[-1]) is None,
          "the failing run ends with the farther box in a dead end: the next push is blocked")
    check(fpush[-1] == B, "the failing run's last move pushes the farther box")

    sol = L.solve()
    ok, opush = L.run(sol)
    check(set(ok[-1][1]) <= L.goals, "the solver's solution (%d moves) solves it" % len(sol))
    check(first_push(opush) == B, "the solution moves the farther box first")
    check(ok[-1][1][B] == gA, "in the solution the farther box ends on %s" % (gA,))

    # the nearer box onto a goal first, on the page's old DEAD level: always still solvable
    D = Level(TZ.DEAD)
    near = min(range(len(D.start[1])), key=lambda i: D.walk_dist(D.start, D.start[1][i]))
    others = [b for i, b in enumerate(D.start[1]) if i != near]
    seen = {D.start}; q = deque([D.start]); on_goal = []
    while q:
        s = q.popleft()
        if s[1][near] in D.goals:
            on_goal.append(s)
        for m in MOVES:
            r = D.step(s, m)
            if r and r[0] not in seen and [b for i, b in enumerate(r[0][1]) if i != near] == others:
                seen.add(r[0]); q.append(r[0])
    check(on_goal and all(D.solvable(s) for s in on_goal),
          "on the old DEAD level, every way of putting the nearer box on a goal first stays solvable (%d states)" % len(on_goal))

    bump_dir = MOVES[DEADLOCK_FAIL[-1]]
    check(all(DEADLOCK_VIEW[0] < r < DEADLOCK_VIEW[1] - 1 for r, _ in L.S.floor), "the shown rows hold the whole play area")
    return L, img, {
        "kind": "sokoban", "base": 0, "view": DEADLOCK_VIEW,
        "runs": [
            {"ok": False, "moves": DEADLOCK_FAIL, "states": enc(fail),
             "target": A,                                   # ringed until the run first pushes it
             "bump": {"box": B, "dir": list(bump_dir)},     # one more push, blocked by the nearer box
             "end": {"rings": [list(fail[-1][1][B])], "block": list(fail[-1][1][A])}},
            {"ok": True, "moves": sol, "states": enc(ok), "target": B},
        ],
        "tags": [{"box": A, "text": "near", "at": [-1, 0]}, {"box": B, "text": "far", "at": [1, 0]}],   # above the nearer box, on the wall below the farther one
    }


# ------------------------------------------------------------------ 2. Irreversible push (Structural Fork)
def fork():
    print("Irreversible push (FORK level, Structural Fork set)")
    L = Level(TZ.FORK)
    s0 = L.start
    legal = {}
    for m in MOVES:
        r = L.step(s0, m)
        if r and r[1] is not None:
            legal[m] = r[1]
    check(sorted(legal) == ["right", "up"], "at the critical step exactly two pushes are legal: %s" % sorted(legal))
    check(L.solvable(s0), "the critical step is solvable")
    fail, fpush = L.run(FORK_FAIL)
    i = fpush[0]
    check(not L.solvable(fail[1]), "after the up push the puzzle is unsolvable")
    cells = L.box_cells(fail[1], i)
    row = fail[1][1][i][0]
    check(all(r == row for r, _ in cells) and not (cells & L.goals),
          "the pushed box can only ever reach %s: its own row, which has no goal" % sorted(cells))
    check((row - 1, fail[1][1][i][1]) in L.walls, "the cell above it is a wall: nothing can push it back down")
    check(s0[1][i] not in cells, "it can never return to %s" % (s0[1][i],))

    sol = TZ.FORK.solve()
    ok, opush = L.run(sol)
    check(set(ok[-1][1]) <= L.goals, "FORK.solve() (%d moves) solves it" % len(sol))
    check(sol[0] == "right" and opush[0] == legal["right"], "the solution starts with the other legal push, right")
    check(all(FORK_VIEW[0] < r < FORK_VIEW[1] - 1 for r, _ in L.S.floor), "the shown rows hold the whole play area")
    return L, {
        "kind": "sokoban", "base": 1, "view": FORK_VIEW,
        "runs": [
            {"ok": False, "moves": FORK_FAIL, "states": enc(fail), "hold": 1,   # one more step: show why
             "end": {"band": sorted([list(c) for c in cells]), "back": {"box": i, "to": list(s0[1][i])}}},
            {"ok": True, "moves": sol, "states": enc(ok)},
        ],
        # the two legal pushes at the critical step; each run takes one
        "choices": [{"box": legal["up"], "dir": list(MOVES["up"]), "run": 0},
                    {"box": legal["right"], "dir": list(MOVES["right"]), "run": 1}],
    }


def enc(states):
    return [{"p": list(p), "b": [list(b) for b in boxes]} for p, boxes in states]


# ------------------------------------------------------------------ 3. Pacman route order
def pac_frames(folder):
    return [(p, TZ.img(p)) for p in sorted(glob.glob(os.path.join(TZ.EP34, folder, "*.png")))]


def pac_centre(im):
    a = np.asarray(im).astype(int)
    m = (a[..., 0] > 200) & (a[..., 1] > 190) & (a[..., 2] < 90)
    ys, xs = np.nonzero(m)
    return (xs.mean() / a.shape[1], ys.mean() / a.shape[0]) if len(xs) else None


def pac_food(im):
    import cv2
    a = np.asarray(im)
    n, _, st, cen = cv2.connectedComponentsWithStats((a.min(2) > 200).astype(np.uint8))
    return [tuple(cen[i] / a.shape[1]) for i in range(1, n) if 9 <= st[i][2] <= 13 and 9 <= st[i][3] <= 13 and st[i][4] > 60]


def cell(q):
    return (int(q[1] * 8), int(q[0] * 8))


def pacman():
    print("Pacman route order (real episode)")
    runs = [("vanilla/ground_truth", False), ("ground_truth/candidate_A_far_food_up_succeeds", True)]
    frames = [pac_frames(f) for f, _ in runs]
    a0, b0 = (np.asarray(f[0][1]).astype(int) for f in frames)
    check(np.abs(a0 - b0).max() < 8, "both runs start from the same frame")
    food = pac_food(frames[0][0][1])
    check(len(food) == 2, "the start has two food items")
    me = pac_centre(frames[0][0][1])
    dist = lambda f: abs(cell(f)[0] - cell(me)[0]) + abs(cell(f)[1] - cell(me)[1])
    food.sort(key=dist)
    print("    Pacman at cell %s; food at cells %s (%d and %d cells away)" % (cell(me), [cell(f) for f in food], dist(food[0]), dist(food[1])))
    check(dist(food[0]) < dist(food[1]), "one food is nearer than the other")
    out, sheet_idx = [], 0
    for (folder, ok), fr in zip(runs, frames):
        names = [os.path.basename(p) for p, _ in fr]
        path, prev = [], None
        for _, im in fr:
            c = pac_centre(im) or prev
            path.append(c); prev = c
        eaten = []    # the frame on which each food disappears
        for f in food:
            k = next((j for j, (_, im) in enumerate(fr) if not any(abs(g[0] - f[0]) + abs(g[1] - f[1]) < .02 for g in pac_food(im))), None)
            eaten.append(k)
        first = int(np.argmin([k if k is not None else 99 for k in eaten]))
        check(first == (1 if ok else 0), "%s eats the %s food first (frame %d: %s)" % (
            "forward thinking" if ok else "the linear rollout", "farther" if ok else "nearer", eaten[first], names[eaten[first]]))
        if ok:
            check(all(k is not None for k in eaten) and "success" in names[-1], "forward thinking eats all food: %s" % names[-1])
        else:
            check("caught" in names[-1] and eaten[1] is None, "the linear rollout is caught before the farther food: %s" % names[-1])
        out.append({"ok": ok, "frames": list(range(sheet_idx, sheet_idx + len(fr))),
                    "moves": [n[3:-4].split("_")[0] for n in names[1:]],
                    "path": [[round(x, 4), round(y, 4)] for x, y in path],
                    "target": first, "eaten": eaten[first],
                    "end": {"rings": [[round(path[-1][0], 4), round(path[-1][1], 4)]]} if not ok else {}})
        sheet_idx += len(fr)
    return [im for fr in frames for _, im in fr], {
        "kind": "pacman", "runs": out,
        "food": [[round(x, 4), round(y, 4)] for x, y in food],
        "tags": [{"food": 0, "text": "near"}, {"food": 1, "text": "far"}],
    }


# ------------------------------------------------------------------ rendering
def draw_state(L, base, st, size=256):
    im = base.copy()
    for b in st["b"]:
        im.paste(TZ.SPR["box_goal" if tuple(b) in L.goals else "box"], (b[1] * T, b[0] * T))
    p = st["p"]
    im.paste(TZ.SPR["player"], (p[1] * T, p[0] * T), PMASK)
    return im if size == 256 else im.resize((size, size), Image.NEAREST)


def empty_board(L):
    base = L.S.im.copy()
    for r, c in L.S.floor:
        base.paste(TZ.SPR["goal" if (r, c) in L.goals else "floor"], (c * T, r * T))
    return base


def save_webp(im, name):
    path = os.path.join(OUT, name)
    im.save(path, "WEBP", lossless=True, quality=100, method=6)
    print("  wrote %s (%d KB)" % (os.path.relpath(path, ROOT), (os.path.getsize(path) + 1023) // 1024))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", metavar="DIR", help="also write contact sheets of every step to DIR")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    dl, dl_img, dl_meta = deadlock()
    fk, fk_meta = fork()
    pac_ims, pac_meta = pacman()

    bases = [empty_board(dl), empty_board(fk)]
    # sokoban.webp: the two empty boards, then the sprites
    sheet = Image.new("RGBA", (2 * 256, 256 + T), (0, 0, 0, 0))
    for i, b in enumerate(bases):
        sheet.paste(b, (i * 256, 0))
    sprites = {}
    for j, k in enumerate(["box", "box_goal", "player"]):
        tile = TZ.SPR[k].convert("RGBA")
        if k == "player":
            tile.putalpha(PMASK)
        sheet.paste(tile, (j * T, 256))
        sprites[k] = [j * T, 256, T, T]
    save_webp(sheet, "sokoban.webp")

    cols = 6
    rows = -(-len(pac_ims) // cols)
    psheet = Image.new("RGB", (cols * 256, rows * 256), (0, 0, 0))
    for i, im in enumerate(pac_ims):
        psheet.paste(im, ((i % cols) * 256, (i // cols) * 256))
    save_webp(psheet, "pacman.webp")

    meta = {
        "about": "Generated by tools/figures/make_trap_assets.py; read by assets/js/traps.js.",
        "sokoban": {"sheet": "sokoban.webp", "grid": 8, "board": 256, "bases": [[0, 0, 256, 256], [256, 0, 256, 256]],
                    "sprites": sprites, "goals": [sorted([list(g) for g in dl.goals]), sorted([list(g) for g in fk.goals])]},
        "pacman": {"sheet": "pacman.webp", "frame": 256, "cols": cols},
        "demos": {"deadlock": dl_meta, "fork": fk_meta, "pacman": pac_meta},
    }
    with open(os.path.join(OUT, "traps.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))
    print("  wrote assets/images/traps_anim/traps.json (%d KB)" % ((os.path.getsize(os.path.join(OUT, "traps.json")) + 1023) // 1024))

    # the last frame of each run: the page's images without JavaScript
    for name, L, m, base in [("deadlock", dl, dl_meta, bases[0]), ("fork", fk, fk_meta, bases[1])]:
        v = m["view"]
        for r in m["runs"]:
            im = draw_state(L, base, r["states"][-1]).crop((0, v[0] * T, 256, v[1] * T))
            save_webp(im, "%s_%s.webp" % (name, "ok" if r["ok"] else "fail"))
    for r in pac_meta["runs"]:
        save_webp(pac_ims[r["frames"][-1]], "pacman_%s.webp" % ("ok" if r["ok"] else "fail"))

    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        for name, L, m, base in [("deadlock", dl, dl_meta, bases[0]), ("fork", fk, fk_meta, bases[1])]:
            for r in m["runs"]:
                ims = [draw_state(L, base, s, 128) for s in r["states"]]
                strip = Image.new("RGB", (len(ims) * 132, 150), (255, 255, 255))
                d = ImageDraw.Draw(strip)
                for j, im in enumerate(ims):
                    strip.paste(im, (j * 132, 0))
                    d.text((j * 132 + 4, 132), "start" if j == 0 else r["moves"][j - 1], fill=(0, 0, 0))
                strip.save(os.path.join(args.preview, "%s_%s.png" % (name, "ok" if r["ok"] else "fail")))
        for r in pac_meta["runs"]:
            ims = [pac_ims[i].resize((128, 128), Image.NEAREST) for i in r["frames"]]
            strip = Image.new("RGB", (len(ims) * 132, 128), (255, 255, 255))
            dr = ImageDraw.Draw(strip)
            for j, im in enumerate(ims):
                strip.paste(im, (j * 132, 0))
                x, y = r["path"][j]
                dr.ellipse([j * 132 + x * 128 - 3, y * 128 - 3, j * 132 + x * 128 + 3, y * 128 + 3], outline=(0, 255, 255))
            strip.save(os.path.join(args.preview, "pacman_%s.png" % ("ok" if r["ok"] else "fail")))
        print("  previews ->", args.preview)


WALL = wall_tile()
PMASK = Image.fromarray(((np.asarray(TZ.SPR["player"]).astype(int).sum(2) > 60) * 255).astype(np.uint8))

if __name__ == "__main__":
    main()
