"""Render the Agima teaser (1280x720, 30 fps). Every frame is drawn at 2x and downsampled.

usage:
  python make_teaser_v3.py                    # writes ../../assets/video/agima_teaser_v3.mp4 (with sound)
  python make_teaser_v3.py --no-audio         # without the sound effects
  python make_teaser_v3.py -o out.mp4         # writes somewhere else
  python make_teaser_v3.py --stills DIR       # saves preview stills of every scene to DIR instead

Scenes
  hook      the whole Sokoban board, large: without imagination, the agent pushes the nearest box left and
            deadlocks; the moves run back (restart), and the board shrinks into the next scene's real board
  search    the Agima model takes in the real board, then rides just ahead of the frames it imagines, firing out
            each one; a camera-follow Sokoban rollout, imagined one step at a time: forward thinking, counterfactual
            branching, forward thinking; a dead end is crossed out and the imagination rewinds to where it
            branched off, each finished plan is acted on, then the camera pulls back over the whole path while
            the real board plays every committed move out, fast
  envs      each task's train episode flips to its test episode, with its result bars beneath
  rl        agentic RL: the branching model's success on unseen 4-box fork puzzles climbs over RL steps (paper
            Fig. 4c, read off the figure), beside an illustration on the page's fork trap: before RL it takes the
            risky push and deadlocks; after RL it branches at the fork, sees that push fail, and solves it
  emerge    a new format emerges after RL (unified format = Format 1 + Format 2, banded by part): the two formats SFT taught (paper Fig. 5a) appear; part of one is
            discarded, the rest flies down and merges into the unified format (Fig. 5b: Format 1's rollout first,
            then Format 2's candidates after it fails), while a small chart climbs
            from 5% to 100% of episodes in that format over RL steps (Fig. 6b)
  end       title and authors (v2's end card, played 2.2x faster)
"""
import os
import subprocess
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

_argv, sys.argv = sys.argv, sys.argv[:1]
import make_teaser_v2 as V2   # noqa: E402
sys.argv = _argv

from make_teaser import MOVE_VEC  # noqa: E402
from make_teaser_v2 import (ACCENT, BG, BG2, BOARD, DEAD, ENV, FAINT, FIG5, GREEN, H, INK, MUTED, RED, SITE, WHITE,  # noqa: E402
                            W, Z, V, back_out, clamp, ease_io, ease_out, fade, inter, mix, prog, sc_end)

OUT = f"{SITE}/video/agima_teaser_v3.mp4"
FPS = 30


# ------------------------------------------------------------------ data: the tree of pushes
S = DEAD
DIRS = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def _reach(p, boxes):
    seen = {p}; q = deque([p])
    while q:
        r, c = q.popleft()
        for dr, dc in DIRS:
            n = (r + dr, c + dc)
            if n not in seen and n not in S.walls and n not in boxes:
                seen.add(n); q.append(n)
    return seen


def _pushes(p, boxes):
    R = _reach(p, boxes); out = []
    for b in sorted(boxes):
        for dr, dc in DIRS:
            stand, to = (b[0] - dr, b[1] - dc), (b[0] + dr, b[1] + dc)
            if stand in R and to not in S.walls and to not in boxes:
                out.append((b, frozenset((boxes - {b}) | {to})))
    return out


_solv = {}


def _solvable(p, boxes):
    key = (min(_reach(p, boxes)), boxes)
    if key not in _solv:
        seen = {key}; q = deque([(p, boxes)]); ok = False
        while q:
            pp, bb = q.popleft()
            if bb <= S.goals:
                ok = True; break
            for np_, nb in _pushes(pp, bb):
                k2 = (min(_reach(np_, nb)), nb)
                if k2 not in seen:
                    seen.add(k2); q.append((np_, nb))
        _solv[key] = ok
    return _solv[key]


# ------------------------------------------------------------------ drawing helpers
def glow_line(v, pts, col, width=3, glow=10, a=1.0):
    """Polyline with a soft halo (drawn on a cropped layer so the blur stays cheap)."""
    if len(pts) < 2 or a <= 0:
        return
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    pad = glow * 3
    x0, y0 = int((min(xs) - pad) * Z), int((min(ys) - pad) * Z)
    x1, y1 = int((max(xs) + pad) * Z), int((max(ys) + pad) * Z)
    m = Image.new("L", (max(1, x1 - x0), max(1, y1 - y0)), 0)
    ImageDraw.Draw(m).line([((x - min(xs) + pad) * Z, (y - min(ys) + pad) * Z) for x, y in pts], fill=int(150 * a),
                           width=int(glow * Z), joint="curve")
    m = m.filter(ImageFilter.GaussianBlur(glow * Z / 2.2))
    v.c.paste(Image.new("RGB", m.size, col), (x0, y0), m)
    v.line(pts, fade(col, a), width)


def glow_dot(v, x, y, r, col, a=1.0):
    pad = int(r * 3)
    m = Image.new("L", (2 * pad * Z, 2 * pad * Z), 0)
    ImageDraw.Draw(m).ellipse([(pad - r) * Z, (pad - r) * Z, (pad + r) * Z, (pad + r) * Z], fill=int(170 * a))
    m = m.filter(ImageFilter.GaussianBlur(r * Z * 0.9))
    v.c.paste(Image.new("RGB", m.size, col), (int((x - pad) * Z), int((y - pad) * Z)), m)


# ------------------------------------------------------------------ search: imagine, rewind at dead ends, act (camera follows)
SOL = V2.SOLVE_MOVES                      # 18 moves
SST = V2.SOLVE                            # 19 states
CHECK = [0, 6, 12, 18]                    # real boards: the agent sees the true board here


def _chain(start, moves):
    out = [start]
    for mv in moves:
        out.append(S.step(*out[-1], mv))
    return out[1:]


def _main_pos(m):
    return (m * 150.0, 70 * np.sin(m * 0.42) - m * 12.0)


MAIN = [_main_pos(m) for m in range(len(SST))]
# imagined dead ends: two forward-thinking rivals and one counterfactual branch (each is BFS-proven unsolvable)
DEAD_A = (0, ["left", "down", "left", "down", "right"], -150)   # from move 0: a whole rival plan, in a row above
BRANCH = (7, ["left"], (30, -170))               # off move 7
DEAD_B = (12, ["up", "left"], 150)               # from move 12: a rival plan in a row below
for m0, mv, _ in (DEAD_A, BRANCH, DEAD_B):
    assert not _solvable(*_chain(SST[m0], mv)[-1]), (m0, mv)


def _dead_frames(spec):
    m0, mv, geo = spec
    sts = _chain(SST[m0], mv)
    x0, y0 = MAIN[m0]
    if not isinstance(geo, tuple):   # a row parallel to the main line, `geo` above or below it
        return [(st, (x0 + 120 + 140 * k, y0 + geo), mv[k]) for k, st in enumerate(sts)]
    dx, dy = geo
    return [(st, (x0 + dx * (k + 1), y0 + dy * (k + 1)), mv[k]) for k, st in enumerate(sts)]


DEAD_SPECS = [DEAD_A, BRANCH, DEAD_B]
DEADS = [_dead_frames(d) for d in DEAD_SPECS]
_IMG = {}


def _sq(state, tint=None):
    key = (state, tint)
    if key not in _IMG:
        im = BOARD.draw(state).resize((512, 512), Image.NEAREST)
        if tint:
            im = Image.blend(im, Image.new("RGB", im.size, tint), 0.16)
        _IMG[key] = im
    return _IMG[key]


IMAG_TINT = (200, 216, 255)
# Each phase imagines one step at a time. A dead end is crossed out, the imagination rewinds to where it
# branched off, and the plan continues from there; once the plan reaches its goal the agent acts on it.
PH = [  # caption, then the segments in the order they are imagined: ("dead", spec index) or ("main", first move, last move)
    dict(cap=("Forward thinking", "imagine a plan; at a dead end, rewind and try another"), segs=[("dead", 0), ("main", 1, 6)]),
    dict(cap=("Counterfactual branching", "test a risky push, rewind, carry on"), segs=[("main", 7, 7), ("dead", 1), ("main", 8, 12)]),
    dict(cap=None, segs=[("dead", 2), ("main", 13, 18)]),
]
T_START = 0.8      # the model intro, before the first step is imagined
RW_MIN = 0.6       # the shortest rewind
X_HOLD = 0.35      # a crossed-out dead end holds this long before it rewinds
STEP_IM = 0.15     # one imagined step on the plan that works
STEP_DEAD = 0.17   # one imagined step on a dead end
RW_STEP = 0.1      # rewinding over one dead step
ACT_DUR = 0.65     # acting on a whole phase's plan
ACT_LAG = 0.09     # an action is drawn this long before the frame it leads to
POP_A, POP_F = 0.14, 0.22   # how long an action, and then its frame, take to pop in


def _timeline():
    """Fill in PH's times; return the main-line step times, the dead-end times, the imagination head's path, the path the
    model rides along and the time the last act ends (when the camera pulls back)."""
    t = T_START
    main_t, dead_t = {}, {}
    head = [(0.0, MAIN[0]), (t, MAIN[0])]
    model = list(head)   # where the model rides: with the head, except that it rewinds along the main line
    for i, ph in enumerate(PH):
        ph["t"] = t
        mains = [s for s in ph["segs"] if s[0] == "main"]
        ph["first"], ph["last"] = mains[0][1], mains[-1][2]
        for seg in ph["segs"]:
            if seg[0] == "main":
                for m in range(seg[1], seg[2] + 1):
                    main_t[m] = t + STEP_IM * (m - seg[1])
                    head.append((main_t[m] + ACT_LAG, MAIN[m])); model.append(head[-1])
                t = main_t[seg[2]] + ACT_LAG + 0.15
            else:
                d = seg[1]; fr = DEADS[d]; n = len(fr)
                t_x = t + STEP_DEAD * (n - 1) + ACT_LAG + 0.2
                rw0 = t_x + X_HOLD; rw1 = rw0 + max(RW_MIN, RW_STEP * n + 0.15)
                for k, (_, wp, _) in enumerate(fr):
                    head.append((t + STEP_DEAD * k + ACT_LAG, wp)); model.append(head[-1])
                root = MAIN[DEAD_SPECS[d][0]]
                back = [wp for _, wp, _ in fr][::-1] + [root]
                for j, p in enumerate(back):
                    head.append((rw0 + (rw1 - rw0) * j / n, p)); model.append((head[-1][0], (p[0], root[1])))
                dead_t[d] = dict(t0=t, t_x=t_x, rw0=rw0, rw1=rw1)
                t = rw1 + 0.08
        ph["t_ok"] = t - 0.1
        ph["t_commit"] = ph["t_ok"] + 0.2
        t = ph["t_commit"] + ACT_DUR + 0.2
    return main_t, dead_t, head, model, t


MAIN_T, DEAD_T, HEAD, MODEL_PATH, T_ZOOM = _timeline()
OMNI_END = T_START + 2 * STEP_DEAD + 0.25   # the first two steps play slowly, showing both outputs of the one model
IM_T = sorted(list(MAIN_T.values()) + [DEAD_T[d]["t0"] + STEP_DEAD * k for d in range(len(DEADS)) for k in range(len(DEADS[d]))])
ZOOM_DUR = 1.1


def _along(pts, f):
    """The point a fraction f of the way along a polyline (by length)."""
    pts = np.array(pts, float)
    seg = np.hypot(*np.diff(pts, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
    L = cum[-1] * clamp(f)
    k = min(int(np.searchsorted(cum, L, side="right")), len(pts) - 1)
    s = (L - cum[k - 1]) / max(seg[k - 1], 1e-6)
    return tuple(pts[k - 1] + (pts[k] - pts[k - 1]) * s)


def _along_keys(keys, t):
    for (t0, p0), (t1, p1) in zip(keys, keys[1:]):
        if t <= t1:
            f = clamp((t - t0) / max(t1 - t0, 1e-6))
            return p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f
    return keys[-1][1]


def _head(t):
    return _along_keys(HEAD, t)


def _act_head(t):
    """Fractional move index the agent has acted up to at time t."""
    mc = 0.0
    for ph in PH:
        c = ease_io(prog(t, ph["t_commit"], ACT_DUR))
        if c > 0:
            mc = max(mc, ph["first"] - 1 + c * (ph["last"] - ph["first"] + 1))
    return mc


def _main_at(mc):
    k = min(int(mc), len(MAIN) - 2); f = mc - k
    return MAIN[k][0] + (MAIN[k + 1][0] - MAIN[k][0]) * f, MAIN[k][1] + (MAIN[k + 1][1] - MAIN[k][1]) * f


ZM, FOCUS_Y = 1.0, 345   # follow zoom, and the screen height the camera's focus sits at (between counters and caption)
INTRO_X = 330            # where the real board sits during the model intro
# the model rides MODEL_LEAD world units ahead of the newest frame (MODEL_LEAD0 beside the real board, for the intro)
MODEL_S, MODEL_LEAD, MODEL_LEAD0 = 0.62, 175, 300
CAM_SHIFT = (MODEL_LEAD + 130 * MODEL_S / ZM - 81) / 2   # centres the span from the real board to the model
_CAM_DT, _CAM_SIG = 1 / 60, 0.28


def _smoothed(fn, sig):
    """fn sampled over the scene, smoothed with a Gaussian of width sig seconds."""
    ts = np.arange(0, T_ZOOM + 4, _CAM_DT)
    p = np.array([fn(t) for t in ts], float)
    r = int(3 * sig / _CAM_DT); k = np.exp(-0.5 * (np.arange(-r, r + 1) * _CAM_DT / sig) ** 2); k /= k.sum()
    pad = np.concatenate([np.repeat(p[:1], r, 0), p, np.repeat(p[-1:], r, 0)])
    return np.stack([np.convolve(pad[:, j], k, "valid") for j in range(2)], 1)


def _sample(path, t):
    i = min(int(t / _CAM_DT), len(path) - 2); f = clamp(t / _CAM_DT - i)
    return path[i] + (path[i + 1] - path[i]) * f


# the camera: midway between where the agent is and how far ahead it imagines (plus the model riding ahead), eased
# into every turn and rewind, so both ends stay in view
FOLLOW = _smoothed(lambda t: np.add(_head(t), _main_at(_act_head(t))) / 2 + (CAM_SHIFT, 0), _CAM_SIG)
# the model moves on just before each frame lands, so the frame shoots out of it back into place
MHEAD = _smoothed(lambda t: _along_keys(MODEL_PATH, t + ACT_LAG + 0.04), 0.08)
_allp = MAIN + [p for d in DEADS for _, p, _ in d]
_xs, _ys = [p[0] for p in _allp], [p[1] for p in _allp]
_zo = min(W * 0.86 / (max(_xs) - min(_xs) + 160), H * 0.5 / (max(_ys) - min(_ys) + 160))
ZOOM_OUT = ((min(_xs) + max(_xs)) / 2, (min(_ys) + max(_ys)) / 2 + (H / 2 - 215) / _zo, _zo)   # the path sits up top
SOLVE_T0, SOLVE_STEP, SOLVE_C, SOLVE_S = T_ZOOM + 0.6, 0.05, (W / 2, 452), 176   # then the real board plays it out below


def _camera(t):
    """Follow the span from the agent to its imagination head (which runs ahead, and back on a rewind), then pull back over
    the whole path. During the intro the real board sits at INTRO_X, left of the model."""
    hx, hy = _sample(FOLLOW, t)
    sx0 = INTRO_X + CAM_SHIFT * ZM
    sx = sx0 + (W / 2 - sx0) * ease_io(prog(t, T_START - 0.3, 1.0))
    cx, cy, zm = hx + (W / 2 - sx) / ZM, hy + (H / 2 - FOCUS_Y) / ZM, ZM
    z = ease_io(prog(t, T_ZOOM, ZOOM_DUR))
    if z > 0:
        X, Y, Zf = ZOOM_OUT
        cx, cy = cx + (X - cx) * z, cy + (Y - cy) * z
        zm = np.exp(np.log(zm) + (np.log(Zf) - np.log(zm)) * z)
    return cx, cy, zm


def action_tag(v, x, y, move, col, a, scale=1.0):
    """A filled pill: arrow glyph + the action's name, centred on (x, y)."""
    if a <= 0 or scale <= 0:
        return
    f = inter(max(8, int(13 * Z * scale)), b"Bold")
    tw = v.tlen(move, f); h = 22 * scale; aw = 11 * scale
    w = 10 * scale + aw + 5 * scale + tw + 10 * scale
    x0 = x - w / 2
    v.rrect((x0, y - h / 2, x0 + w, y + h / 2), h / 2, fill=fade(col, a), outline=fade(WHITE, a), width=max(1, int(1.5 * scale)))
    cx = x0 + 10 * scale + aw / 2
    dx, dy = MOVE_VEC[move]; L = aw / 2
    v.line([(cx - dx * L, y - dy * L), (cx + dx * (L - 3 * scale), y + dy * (L - 3 * scale))], fade(WHITE, a), max(1, int(2 * scale)))
    v.head(cx + dx * L, y + dy * L, fade(WHITE, a), (dx, dy), 4.5 * scale)
    v.text((cx + aw / 2 + 5 * scale, y + 0.5), move, f, fade(WHITE, a), "lm")


def rewind_tag(v, x, y, a):
    """A 'rewind' pill with a double back-arrow, centred on (x, y)."""
    if a <= 0:
        return
    f = inter(15 * Z, b"Bold"); h = 30
    w = 14 + 22 + 6 + v.tlen("rewind", f) + 14
    x0 = x - w / 2
    v.rrect((x0, y - h / 2, x0 + w, y + h / 2), h / 2, fill=fade(INK, a), outline=fade(WHITE, a), width=2)
    for dx in (0, 10):
        v.head(x0 + 16 + dx, y, fade(WHITE, a), (-1, 0), 7)
    v.text((x0 + 14 + 22 + 6, y + 0.5), "rewind", f, fade(WHITE, a), "lm")


def plate(v, box, a=1.0, r=18):
    """A soft background-coloured plate, so text stays readable over passing boards."""
    if a <= 0:
        return
    m = Image.new("L", (int((box[2] - box[0]) * Z), int((box[3] - box[1]) * Z)), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, m.width - 1, m.height - 1], radius=r * Z, fill=int(232 * a))
    v.c.paste(Image.new("RGB", m.size, BG), (int(box[0] * Z), int(box[1] * Z)), m)


FEED = (0.12, 0.55)  # the real board streams into the model


def model_box(v, cx, cy, s, busy, a=1.0):
    """Agima, drawn as one model block; it glows while it generates."""
    if a <= 0:
        return
    w, h = 260 * s, 108 * s
    if busy > 0:
        glow_dot(v, cx, cy, 64 * s, ACCENT, 0.6 * busy * a)
    col = fade(mix(INK, ACCENT, busy), a)
    v.rrect((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), 24 * s, fill=fade(WHITE, a), outline=col, width=max(2, int(3 * s)))
    if s > 0.8:   # big, for the intro: say what it is
        v.ctext((cx, cy - 14 * s), "Agima", inter(int(52 * Z * s), b"Bold"), col)
        v.ctext((cx, cy + 30 * s), "one omni model", inter(int(17 * Z * s), b"SemiBold"), fade(MUTED, a))
    else:
        v.ctext((cx, cy - 3 * s), "Agima", inter(int(56 * Z * s), b"Bold"), col)


def _model_at(t):
    """The model's centre (world units) and scale: beside the real board for the intro, then riding just ahead of the
    newest frame (and back with it on a rewind)."""
    hx, hy = _sample(MHEAD, t)
    f = ease_io(prog(t, T_START - 0.25, 0.5))
    return (hx + MODEL_LEAD0 + (MODEL_LEAD - MODEL_LEAD0) * f, hy), 1 + (MODEL_S - 1) * f


def _model_a(t):
    return ease_out(prog(t, 0.05, 0.35)) * (1 - ease_out(prog(t, T_ZOOM, 0.4)))


def _busy(t):
    """How hard the model is generating: it glows once the board is in, and around every step it imagines."""
    b = 0.8 * ease_out(prog(t, FEED[0] + 0.3, 0.4)) * (1 - ease_out(prog(t, T_START + 0.3, 0.3)))
    for ta in IM_T:
        if abs(t - ta) < 0.3:
            b = max(b, 1 - abs(t - ta - 0.03) / 0.3)
    return clamp(b)


def stream(v, a, b, f, col, al=1.0):
    """A token on its way from a to b (f in 0..1), trailing a fading line."""
    if not 0 < f < 1 or al <= 0:
        return
    x, y = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
    glow_line(v, [a, (x, y)], col, 2, 6, 0.55 * al * (1 - 0.6 * f))
    glow_dot(v, x, y, 11, col, 0.9 * al)
    v.d.ellipse(v.z(x - 4, y - 4, x + 4, y + 4), fill=fade(col, al))


def pop_r(p, r):
    """Badge radius that pops in with a small overshoot."""
    return max(1.0, r * (0.4 + 0.6 * back_out(p)))


# ------------------------------------------------------------------ hook: without imagination, one tempting push loses it
HK_MOVES = ["down", "left"]                   # step beside the nearest box and push it left: it jams for good
HK_ST = BOARD.states(HK_MOVES)
assert _solvable(*HK_ST[-2]) and not _solvable(*HK_ST[-1])
HK_STUCK_BOX = next(iter(HK_ST[-1][1] - HK_ST[-2][1]))
HK_T0, HK_MOVE = 0.2, 0.27                    # the first move, and how long each takes
HK_STUCK = HK_T0 + len(HK_MOVES) * HK_MOVE    # the box is jammed
HK_REW, HK_REW_STEP = HK_STUCK + 1.05, 0.1    # restart: the moves run backwards
HK_SHRINK = (HK_REW + HK_REW_STEP * len(HK_MOVES) + 0.75, 0.55)   # then the board shrinks into the search scene's
HOOK_DUR = HK_SHRINK[0] + HK_SHRINK[1]                          # real board
HK_C, HK_S = (W / 2, 318), 516                # the whole board, filling most of the screen


def _lerp(a, b, f):
    return a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f


def sc_hook(v, t, dur):
    f = ease_io(prog(t, *HK_SHRINK))
    size = float(np.exp(np.log(HK_S) + (np.log(150 * ZM) - np.log(HK_S)) * f))
    cx, cy = _lerp(HK_C, (INTRO_X, FOCUS_Y), f)
    if HK_STUCK < t < HK_STUCK + 0.5:   # the board jolts as the box jams
        cx += 7 * np.sin((t - HK_STUCK) * 60) * np.exp(-8 * (t - HK_STUCK))
    if t < HK_REW:
        st = BOARD.at(HK_ST, t - HK_T0, HK_MOVE)
    else:
        st = BOARD.at(HK_ST[::-1], t - HK_REW, HK_REW_STEP)
    v.card(st, cx, cy, size, 1.0, nearest=True, outline=INK, r=12)
    # the jammed box, ringed in red until the restart
    p = prog(t, HK_STUCK, 0.5)
    if p > 0 and t < HK_REW:
        r_, c_ = HK_STUCK_BOX
        bx, by = cx - size / 2 + (c_ + 0.5) * size / 8, cy - size / 2 + (r_ + 0.5) * size / 8
        rr = size / 13 + size / 10 * (1 - ease_out(p))
        v.d.ellipse(v.z(bx - rr, by - rr, bx + rr, by + rr), outline=fade(RED, ease_out(p)), width=4 * Z)
        v.stamp(bx + rr * 0.75, by - rr * 0.75, False, prog(t, HK_STUCK + 0.15, 0.3), r=18)
    rw_end = HK_REW + HK_REW_STEP * len(HK_MOVES)
    if HK_REW < t < rw_end + 0.15:   # the restart runs the moves back, like every other rewind
        rewind_tag(v, cx, cy - size / 2 - 26, min(ease_out((t - HK_REW) / 0.12), ease_out((rw_end + 0.15 - t) / 0.15)))
    v.pill(cx - size / 2, cy - size / 2 - 22, "real board", INK, None, ease_out(prog(t, HK_SHRINK[0] + 0.45, 0.35)), size=13)
    # what is going on
    caps = [(0.15, ("Without imagination", "it pushes the nearest box on instinct.", INK)),
            (HK_STUCK + 0.2, ("Deadlock.", "One push, and it can never be solved.", RED)),
            (HK_REW, ("Restart,", "and let Agima imagine first.", ACCENT))]
    for i, (t0, (head, rest, col)) in enumerate(caps):
        t1 = caps[i + 1][0] if i + 1 < len(caps) else dur + 1
        ca = ease_out(prog(t, t0, 0.3)) * (1 - ease_out(prog(t, t1 - 0.2, 0.2)))
        if i == len(caps) - 1:
            ca *= 1 - ease_out(prog(t, HK_SHRINK[0] + 0.4, 0.35))
        if ca <= 0:
            continue
        if i == len(caps) - 1:   # the restart: large, with Agima picked out
            parts = [("Restart,  and let ", inter(32 * Z, b"SemiBold"), INK), ("Agima", inter(48 * Z, b"Bold"), ACCENT),
                     (" imagine first.", inter(32 * Z, b"SemiBold"), INK)]
            w = sum(v.tlen(tx, f_) for tx, f_, _ in parts); x = W / 2 - w / 2
            plate(v, (x - 28, 580, x + w + 28, 650), ca, r=24)
            for tx, f_, c_ in parts:
                v.text((x, 630), tx, f_, fade(c_, ca), "ls"); x += v.tlen(tx, f_)
            continue
        f1_, f2_ = inter(26 * Z, b"Bold"), inter(26 * Z)
        w1 = v.tlen(head + "  ", f1_); w = w1 + v.tlen(rest, f2_)
        plate(v, (W / 2 - w / 2 - 24, 590, W / 2 + w / 2 + 24, 636), ca)
        v.text((W / 2 - w / 2, 622), head, f1_, fade(col, ca), "ls")
        v.text((W / 2 - w / 2 + w1, 622), rest, f2_, fade(INK, ca), "ls")


# how fast the timeline plays (timeline seconds per real second), keyed by timeline time
WARP_KEYS = [(0.0, 1.0), (T_START - 0.05, 1.0), (T_START + 0.05, 0.38), (OMNI_END - 0.05, 0.38), (OMNI_END + 0.35, 1.0),
             (DEAD_T[0]["rw1"], 1.0), (DEAD_T[0]["rw1"] + 0.6, 1.8), (T_ZOOM - 0.4, 1.8), (T_ZOOM, 1.0)]
def _warp_table(tau_end):
    taus = np.linspace(0, tau_end, int(tau_end * 600) + 2)
    rate = np.interp(taus, [k for k, _ in WARP_KEYS], [r for _, r in WARP_KEYS])
    real = np.concatenate([[0], np.cumsum(np.diff(taus) / ((rate[1:] + rate[:-1]) / 2))])
    return taus, real


def sc_search(v, t, dur):
    """The search scene in real time: map it onto the timeline through the warp."""
    _search_at(v, float(np.interp(t, WARP_REAL, WARP_TAU)))


def _search_at(v, t):
    cx, cy, zm = _camera(t)
    to_s = lambda p: (W / 2 + (p[0] - cx) * zm, H / 2 + (p[1] - cy) * zm)
    imag_n = 0
    zoom_a = ease_out(prog(t, T_ZOOM + 0.4, 0.5))

    # committed path so far (glowing), drawn first so boards sit on top
    mc = _act_head(t)   # how far along the solution the agent has acted (fractional move index)
    done_m = int(mc)
    act_moves = SOL[:done_m]
    if mc > 0:
        pts = [to_s(MAIN[m]) for m in range(done_m + 1)]
        if done_m < len(MAIN) - 1 and mc > done_m:
            a_, b_ = to_s(MAIN[done_m]), to_s(MAIN[done_m + 1]); f = mc - done_m
            pts.append((a_[0] + (b_[0] - a_[0]) * f, a_[1] + (b_[1] - a_[1]) * f))
        glow_line(v, pts, GREEN, 4, 12, 1.0)

    badges = []
    rewinds = []
    streams = []
    # imagined dead ends: crossed out, then rewound to where they branched off
    for d, frames in enumerate(DEADS):
        T = DEAD_T[d]
        die = ease_out(prog(t, T["t_x"], 0.3))
        # the dead branch jolts as it is crossed out, like the board in the hook (timed in real seconds, so the
        # shake looks the same in the fast stretch)
        jt = float(np.interp(t, WARP_TAU, WARP_REAL) - np.interp(T["t_x"], WARP_TAU, WARP_REAL))
        jx = 12 * zm * np.sin(jt * 50) * np.exp(-7 * jt) if 0 < jt < 0.55 else 0.0
        root = to_s(MAIN[DEAD_SPECS[d][0]])
        prev = root; path = [root]
        for k, (st, wp, mv) in enumerate(frames):
            ta = T["t0"] + STEP_DEAD * k
            pa = prog(t, ta, POP_A)                      # the action appears first...
            p = ease_out(prog(t, ta + ACT_LAG, POP_F))   # ...then the frame it leads to
            if pa <= 0:
                continue
            imag_n += 1
            sp = to_s(wp); sp = (sp[0] + jx, sp[1]); path.append(sp); streams.append((sp[0], sp[1], ta, "img"))
            a = p * (1 - 0.45 * die) * (1 - 0.35 * zoom_a)
            aa = ease_out(pa) * (1 - 0.45 * die) * (1 - 0.35 * zoom_a)
            v.pline([prev, sp], ease_out(pa), fade(RED if die > 0.5 else ACCENT, 0.7 * aa), 2, dash=(6, 5))
            fr = 0.5 if k else 0.7   # keep the first action clear of the real board
            mx, my = prev[0] + (sp[0] - prev[0]) * fr, prev[1] + (sp[1] - prev[1]) * fr
            streams.append((mx, my, ta, "act"))
            if zm > 0.5:
                badges.append((mx, my, mv, RED if die > 0.5 else ACCENT, aa, pop_r(pa, 16 * min(1, zm))))
            v.card(_sq(st, (255, 205, 195) if die > 0.5 else IMAG_TINT), sp[0], sp[1], 108 * zm, a, 0.85 + 0.15 * back_out(p),
                   nearest=True, outline=RED if die > 0.5 else ACCENT, dashed=True, r=10)
            prev = sp
        if die > 0:
            v.stamp(prev[0] + 54 * zm + 4, prev[1] - 54 * zm - 4, False, prog(t, T["t_x"], 0.25), r=max(9, 17 * zm))
        rw = prog(t, T["rw0"], T["rw1"] - T["rw0"])
        if 0 < rw < 1 and len(path) > 1:
            below = not isinstance(DEAD_SPECS[d][2], tuple) and DEAD_SPECS[d][2] > 0
            rewinds.append((path[::-1], ease_io(rw), min(ease_out(rw / 0.15), ease_out((0.8 - rw) / 0.2)), below))

    # the main line: imagined first, solid once committed
    for ph in PH:
        for m in range(ph["first"], ph["last"] + 1):
            ta = MAIN_T[m]
            pa = prog(t, ta, POP_A)
            p = ease_out(prog(t, ta + ACT_LAG, POP_F))
            if pa <= 0:
                continue
            imag_n += 1
            done = m <= done_m
            a_, b_ = to_s(MAIN[m - 1]), to_s(MAIN[m])
            streams.append((b_[0], b_[1], ta, "img")); streams.append(((a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2, ta, "act"))
            if not done:
                v.pline([a_, b_], ease_out(pa), fade(ACCENT, 0.7), 2, dash=(6, 5))
            if zm > 0.5:
                badges.append(((a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2, SOL[m - 1], GREEN if done else ACCENT, ease_out(pa),
                               pop_r(pa, 16 * min(1, zm))))
            real = m in CHECK
            size = (150 if real and done else 108) * zm
            v.card(_sq(SST[m], None if done else IMAG_TINT), b_[0], b_[1], size, p, 0.85 + 0.15 * back_out(p), nearest=True,
                   outline=GREEN if done else ACCENT, dashed=not done, r=10)
        ok = prog(t, ph["t_ok"], 0.25)
        if ok > 0:
            e = to_s(MAIN[ph["last"]])
            v.stamp(e[0] + 54 * zm + 4, e[1] - 54 * zm - 4, True, ok, r=max(9, 17 * zm))
    # the starting real board
    p0 = to_s(MAIN[0])
    v.card(_sq(SST[0]), p0[0], p0[1], 150 * zm, 1.0, nearest=True, outline=GREEN if t > PH[0]["t_commit"] else INK, r=12)
    if zm > 0.6:
        v.pill(p0[0] - 75 * zm, p0[1] - 75 * zm - 22, "real board", INK, None, 1 - zoom_a, size=13)
    mw, ms = _model_at(t); mp = to_s(mw); ma = _model_a(t)
    mp = (min(mp[0], W - 40 - 130 * ms), mp[1])   # when the camera lags a quick run, the model waits at the edge
    if ma > 0:
        for sx_, sy_, ta_, kind in streams:   # each step, the one model writes the action, then draws the frame
            if kind == "act":
                stream(v, (mp[0] - 120 * ms, mp[1] - 12 * ms), (sx_, sy_), prog(t, ta_ - 0.07, 0.09), INK, ma)
            else:
                stream(v, (mp[0] - 120 * ms, mp[1] + 8 * ms), (sx_, sy_), prog(t, ta_ + 0.01, ACT_LAG + 0.08), ACCENT, ma)
        if t < FEED[1] + 0.2:           # the real board streams into it
            for k in range(5):
                stream(v, (p0[0] + 75 * zm + 6, p0[1]), (mp[0] - 136 * ms, mp[1]), (t - FEED[0]) * 2.2 - k * 0.22, INK,
                       1 - ease_out(prog(t, FEED[1], 0.2)))
    for bx_, by_, mv_, col_, a__, r__ in badges:   # actions on top of the boards
        action_tag(v, bx_, by_, mv_, col_, a__, r__ / 16)
    # once the camera has pulled back, the real board acts out every committed move, fast
    sa = ease_out(prog(t, SOLVE_T0 - 0.3, 0.3))
    if sa > 0:
        st = t - SOLVE_T0; done_ = st >= SOLVE_STEP * len(SOL)
        v.card(BOARD.at(SST, st, SOLVE_STEP), SOLVE_C[0], SOLVE_C[1], SOLVE_S, sa, 0.9 + 0.1 * back_out(sa), nearest=True,
               outline=GREEN if done_ else INK, r=12)
        v.pill(SOLVE_C[0] - SOLVE_S / 2, SOLVE_C[1] - SOLVE_S / 2 - 22, "real environment", INK, None, sa, size=13)
        v.stamp(SOLVE_C[0] + SOLVE_S / 2 + 4, SOLVE_C[1] - SOLVE_S / 2 - 4, True, prog(t, SOLVE_T0 + SOLVE_STEP * len(SOL), 0.3), r=18)
    for path, f, a, below in rewinds:   # the rewind marker runs back along the dead end, to where it branched off
        x, y = _along(path, f)
        glow_dot(v, x, y, 16, INK, 0.5 * max(a, 0.6 * (f < 1)))
        rewind_tag(v, x, y + (54 * zm + 24) * (1 if below else -1), a)

    # HUD, on a soft plate so passing boards never clash with it
    ha = ease_out(prog(t, 0.1, 0.4))
    plate(v, (50, 22, 430, 114), ha)
    for k, (lab, val, col) in enumerate([("IMAGINED", imag_n, ACCENT), ("ACTED", len(act_moves), GREEN)]):
        x = 70 + k * 170
        v.text((x, 48), lab, inter(14 * Z, b"Bold"), fade(MUTED, ha), "ls")
        v.text((x, 94), f"{val}", inter(44 * Z, b"Bold"), fade(col, ha), "ls")
        unit = ("frame" if k == 0 else "move") + ("" if val == 1 else "s")
        v.text((x + v.tlen(f"{val}", inter(44 * Z, b"Bold")) + 6, 94), unit, inter(16 * Z), fade(MUTED, ha), "ls")
    # the model: beside the real board for the intro, then just ahead of the frames it imagines
    model_box(v, mp[0], mp[1], ms, _busy(t), ma)
    na = ease_out(prog(t, T_START - 0.15, 0.25)) * (1 - ease_out(prog(t, OMNI_END - 0.05, 0.2))) * ma
    if na > 0:
        x0n, y0n = mp[0] - 130 * ms, mp[1] + 54 * ms + 24
        cur = [ta for ta in IM_T[:2] if ta - 0.1 <= t]
        dt_ = t - cur[-1] if cur else -1
        lit_a = 0 <= dt_ < ACT_LAG + 0.02         # the action is being written...
        lit_f = ACT_LAG <= dt_ < ACT_LAG + 0.3    # ...then the frame is being drawn
        for k, (txt, lit) in enumerate([("1  Policy \u2192 action", lit_a), ("2  World model \u2192 next frame", lit_f)]):
            v.text((x0n, y0n + 6 + 36 * k), txt, inter(23 * Z, b"Bold"),
                   fade(mix(MUTED, ACCENT if k else INK, 1.0 if lit else 0.0), na), "lm")
    # caption
    cap = None
    if t < OMNI_END:
        cap, ca = ("Agima,", "one omni model: policy + world model."), \
            ease_out(prog(t, 0.15, 0.4)) * (1 - ease_out(prog(t, OMNI_END - 0.15, 0.15)))
    for i, ph in enumerate(PH):
        t_next = PH[i + 1]["t"] if i + 1 < len(PH) else T_ZOOM
        t_cap = max(ph["t"], OMNI_END)
        if t_cap <= t < t_next and ph["cap"]:
            cap, ca = ph["cap"], ease_out(prog(t, t_cap + 0.05, 0.3)) * (1 - ease_out(prog(t, t_next - 0.2, 0.2)))
    if cap:
        f1, f2 = inter(26 * Z, b"Bold"), inter(26 * Z)
        w1 = v.tlen(cap[0] + "  ", f1); w = w1 + v.tlen(cap[1], f2)
        plate(v, (W / 2 - w / 2 - 24, 580, W / 2 + w / 2 + 24, 626), ca)   # boards passing below never run into it
        v.text((W / 2 - w / 2, 612), cap[0], f1, fade(ACCENT, ca), "ls")
        v.text((W / 2 - w / 2 + w1, 612), cap[1], f2, fade(INK, ca), "ls")
    za = ease_out(prog(t, T_ZOOM + 0.6, 0.5))
    if za > 0:
        v.headline(t - T_ZOOM - 0.6, [("Imagine many futures.", INK), ("Act on one.", GREEN)], x=W / 2 - 260, y=612, size=34)
    # ACT track: every committed move, in order
    v.text((70, 672), "ACT", inter(15 * Z, b"Bold"), fade(GREEN, ha), "lm")
    now = int((t - SOLVE_T0) / SOLVE_STEP) if t >= SOLVE_T0 else -1   # the move the real board is making
    for k, mv in enumerate(act_moves):
        if k == now:
            glow_dot(v, 130 + k * 34, 672, 15, GREEN, 0.9)
        v.badge(130 + k * 34, 672, mv, GREEN, 1.0, r=15 if k == now else 13)


WARP_TAU, WARP_REAL = _warp_table(SOLVE_T0 + SOLVE_STEP * len(SOL) + 1.8)   # then a pause on the solved board
SEARCH_DUR = float(WARP_REAL[-1])


# --- agentic RL: success on unseen 4-box puzzles over RL steps (paper Fig. 4b-c, dashed lines), read off the figure
RL_STEPS = [0, 50, 100, 150, 200]
RL_AGIMA = [22, 25, 34, 40, 45]   # fork set, 4 boxes (never seen in RL), read off Fig. 4c: Agima-A7B (Branching),
RL_A7B = [22, 24, 30, 31, 35]     # Agima-A7B,
RL_ACT = [1, 1, 2, 2, 2]          # and the action-only model (Agima-A7B, No Imagine)
RL_SWEEP, RL_T0 = 1.6, 0.2        # RL runs from step 0 to 200 over RL_SWEEP s, from RL_T0
# the example: the fork trap from the page, where one push decides the puzzle (an illustration of Fig. 6d's trend:
# after RL, branches move to the critical step)
FORK_B = V2.Board(V2.T.FORK)
FORK_WRONG = FORK_B.states(["up"])                 # the risky push: the box jams against the top wall
FORK_SOL = FORK_B.states(V2.T.FORK.solve())           # the safe way, 13 moves
EX_B0, EX_A0 = 0.3, 1.0                            # when the before-RL and after-RL rows start


def _rl_partial(vals, u):
    """The curve's points up to RL step 200 * u, and its value there."""
    s = 200 * u; pts = []
    for (s0, v0), (s1, v1) in zip(zip(RL_STEPS, vals), zip(RL_STEPS[1:], vals[1:])):
        if not pts:
            pts.append((s0, v0))
        if s >= s1:
            pts.append((s1, v1))
        else:
            pts.append((s, v0 + (v1 - v0) * (s - s0) / (s1 - s0)))
            break
    return pts, pts[-1][1]


def curve_chart(v, box, lines, u, p, ymax=50, title=None, xlabel="RL steps", size=1.0, grow=True):
    """A line chart over RL steps, drawn up to 200 * u; lines are [(values, colour, name or None)]. With grow, the
    RL-step axis itself unrolls from 0 to 200 along with the curves."""
    x0, y0, x1, y1 = box
    fa = inter(int(max(13, 16 * size) * Z))   # axis text stays readable on a small chart
    if title:
        v.text((x0 + 30 * size, y0 + 48 * size), title, inter(int(22 * Z * size), b"Bold"), fade(INK, p), "ls")
    px0, px1 = x0 + 84 * size, x1 - 190 * size
    py0, py1 = y0 + (96 if title else 30) * size, y1 - 70 * size
    to = lambda s_, val: (px0 + (px1 - px0) * s_ / 200, py1 - (py1 - py0) * val / ymax)
    xe = to(200 * u if grow else 200, 0)[0]
    for k in range(6):
        y = to(0, ymax * k / 5)[1]
        v.line([(px0, y), (max(px0 + 1, xe), y)], fade(FAINT, (0.9 if k == 0 else 0.5) * p), 2 if k == 0 else 1)
        if size >= 1 or k in (0, 5):   # a small chart names only its ends
            v.text((px0 - 14 * size, y), f"{int(ymax * k / 5)}%", fa, fade(MUTED, p), "rm")
    v.text((px0, py1 + 26 * size), "0", fa, fade(MUTED, p), "mm")
    if grow and 0.05 < u < 0.97:   # the step counter rides the axis
        v.text((xe, py1 + 26 * size), f"{int(200 * u)}", inter(int(max(13, 16 * size) * Z), b"Bold"), fade(INK, p), "mm")
    if not grow or u >= 0.97:
        v.text((px1, py1 + 26 * size), "200", fa, fade(MUTED, p * (ease_out(prog(u, 0.97, 0.03)) if grow else 1)), "mm")
    v.text(((px0 + px1) / 2, py1 + 50 * size), xlabel, fa, fade(MUTED, p), "mm")
    if u <= 0:
        return
    ends = []
    for vals, col, name in lines:
        pts, val = _rl_partial(vals, u)
        sp = [to(s_, y) for s_, y in pts]
        glow_line(v, sp, col, max(2, round(4 * size)), 9 * size, p)
        hx, hy = sp[-1]
        glow_dot(v, hx, hy, 9 * size, col, p)
        r = 6 * size
        v.d.ellipse(v.z(hx - r, hy - r, hx + r, hy + r), fill=fade(col, p), outline=fade(WHITE, p), width=2 * Z)
        ends.append([hy, hx, val, col, name, vals[-1]])
    ends.sort(key=lambda e: -e[5])   # labels keep their final order, and stay at least one label apart
    gap = (52 if any(e[4] for e in ends) else 30) * size
    for i in range(1, len(ends)):
        ends[i][0] = max(ends[i][0], ends[i - 1][0] + gap)
    for ly, hx, val, col, name, _ in ends:
        if name:
            v.text((hx + 18 * size, ly - 15 * size), name, inter(int(18 * Z * size), b"Bold"), fade(col, p), "lm")
            v.text((hx + 18 * size, ly + 13 * size), f"{int(round(val))}%", inter(int(30 * Z * size), b"Bold"), fade(col, p), "lm")
        else:
            v.text((hx + 16 * size, ly), f"{int(round(val))}%", inter(int(30 * Z * size), b"Bold"), fade(col, p), "lm")


def _fork(im):
    """The fork's play area: rows 3-6 of the 8x8 board, all columns (2:1)."""
    w = im.width
    return im.crop((0, w * 3 // 8, w, w * 7 // 8))


EX_H, EX_W = 60, 120   # a cropped fork board, on screen


def _fork_card(v, im, x, y, a, outline, dashed=False, tint=None):
    im = _fork(im)
    if tint:
        im = _tinted_board(im, tint)
    v.card(im, x, y, EX_H, a, nearest=True, outline=outline, dashed=dashed, r=8, sx=EX_W / EX_H)


EX_C = (772, 948, 1124)   # the example's three columns: the real fork, the next step, the outcome


def _arrow(v, a, b, col, al, dashed=False):
    if al <= 0:
        return
    d = np.subtract(b, a); n = float(np.hypot(*d)); u = d / max(n, 1e-6)
    v.line([a, tuple(np.add(a, d * al) - u * 6)], fade(col, 0.85), 2, dash=(6, 5) if dashed else None)
    if al > 0.95:
        v.head(b[0], b[1], fade(col, 0.85), tuple(u), 6)


def _ex_title(v, y, title, sub, col, p):
    fh = inter(20 * Z, b"Bold")
    v.text((690, y), title, fh, fade(col, p), "ls")
    v.text((690 + v.tlen(title + "  ", fh), y), sub, inter(16 * Z), fade(MUTED, p), "ls")


def _ex_before(v, t, t0, y):
    """Before RL: it takes the risky push at the fork for real, and the puzzle jams."""
    p = ease_out(prog(t, t0 - 0.2, 0.25))
    _ex_title(v, y - 52, "Before RL", "takes the risky push", RED, p)
    _fork_card(v, FORK_B.draw(FORK_SOL[0]), EX_C[0], y, p, INK)
    q = prog(t, t0, 0.3)
    if q <= 0:
        return
    jt = t - (t0 + 0.3)
    jx = 9 * np.sin(jt * 50) * np.exp(-7 * jt) if 0 < jt < 0.55 else 0.0
    _arrow(v, (EX_C[0] + EX_W / 2 + 8, y), (EX_C[1] - EX_W / 2 - 8, y), INK, ease_out(q))
    _fork_card(v, FORK_B.at(FORK_WRONG, q, 1.0), EX_C[1] + jx, y, ease_out(q), RED)
    v.stamp(EX_C[1] + EX_W / 2 + jx, y - EX_H / 2, False, prog(t, t0 + 0.3, 0.25), r=14)
    v.text((EX_C[2] - EX_W / 2 + 4, y), "deadlock", inter(19 * Z, b"Bold"), fade(RED, ease_out(prog(t, t0 + 0.35, 0.25))), "lm")


def _ex_after(v, t, t0, y):
    """After RL: at the fork it imagines the risky push (dead end), then the safe one, and solves it for real."""
    p = ease_out(prog(t, t0 - 0.2, 0.25))
    _ex_title(v, y - 96, "After RL", "branches at the fork first", GREEN, p)
    yr, ys = y - 40, y + 40   # the risky branch above, the safe way below
    _fork_card(v, FORK_B.draw(FORK_SOL[0]), EX_C[0], y, p, INK)
    q = ease_out(prog(t, t0, 0.25))       # imagined: the risky push
    _arrow(v, (EX_C[0] + EX_W / 2 + 8, y - 12), (EX_C[1] - EX_W / 2 - 8, yr), RED, q, dashed=True)
    if q > 0:
        _fork_card(v, FORK_B.draw(FORK_WRONG[-1]), EX_C[1], yr, q * 0.85, RED, dashed=True, tint=(255, 205, 195))
        v.stamp(EX_C[1] + EX_W / 2, yr - EX_H / 2, False, prog(t, t0 + 0.2, 0.25), r=13)
    r = ease_out(prog(t, t0 + 0.4, 0.25))  # imagined: the safe way...
    done = t > t0 + 0.85                   # ...then acted on, to the end
    col = GREEN if done else ACCENT
    _arrow(v, (EX_C[0] + EX_W / 2 + 8, y + 12), (EX_C[1] - EX_W / 2 - 8, ys), col, r, dashed=not done)
    if r > 0:
        _fork_card(v, FORK_B.draw(FORK_SOL[6]), EX_C[1], ys, r, col, dashed=not done, tint=None if done else IMAG_TINT)
    s_ = ease_out(prog(t, t0 + 0.6, 0.25))
    _arrow(v, (EX_C[1] + EX_W / 2 + 8, ys), (EX_C[2] - EX_W / 2 - 8, ys), col, s_, dashed=not done)
    if s_ > 0:
        _fork_card(v, FORK_B.draw(FORK_SOL[-1]), EX_C[2], ys, s_, col, dashed=not done, tint=None if done else IMAG_TINT)
        v.stamp(EX_C[2] + EX_W / 2, ys - EX_H / 2, True, prog(t, t0 + 0.85, 0.25), r=14)
    v.text((EX_C[2] - EX_W / 2 + 4, yr), "solved", inter(19 * Z, b"Bold"), fade(GREEN, ease_out(prog(t, t0 + 0.9, 0.25))), "lm")


_TB = {}


def _tinted_board(im, tint):
    key = (id(im), tint)
    if key not in _TB:
        _TB.clear() if len(_TB) > 64 else None
        _TB[key] = Image.blend(im.convert("RGB"), Image.new("RGB", im.size, tint), 0.2)
    return _TB[key]


def sc_rl(v, t, dur):
    v.headline(t, [("Agentic RL", ACCENT), ("with only a success reward.", INK)], size=44,
               sub="RL on 3-box Sokoban, tested on 4-box puzzles it never saw.")
    # left: the branching model's success climbs over RL
    p = ease_out(prog(t, 0.0, 0.3)); dy = 16 * (1 - p)
    v.rrect((60, 160 + dy, 620, 640 + dy), 24, fill=fade(WHITE, p))
    curve_chart(v, (60, 160 + dy, 620, 640 + dy), [(RL_AGIMA, ACCENT, "Agima (Branching)"), (RL_A7B, MUTED, "Agima-A7B"),
                                                      (RL_ACT, RED, "Action-only")], ease_out(prog(t, RL_T0, RL_SWEEP)), p,
                title="Fork puzzles, 4 boxes", xlabel="RL steps", size=0.9)
    # right: the same fork, before and after RL
    q = ease_out(prog(t, 0.08, 0.3)); dq = 16 * (1 - q)
    v.rrect((660, 160 + dq, 1220, 640 + dq), 24, fill=fade(WHITE, q))
    _ex_before(v, t, EX_B0, 262 + dq)
    _ex_after(v, t, EX_A0, 508 + dq)


# --- emergent after RL: a new reasoning format. SFT taught two formats (paper Fig. 5a); RL drops part of one and
# merges the rest into one unified format (Fig. 5b). Boards are the real imagined frames cropped from Fig. 5;
# the hybrid-format share is read off Fig. 6b (3 boxes)
def _fig5_row(cy, xs=(881, 1134, 1387, 1641)):
    """The four board thumbnails of one Fig. 5 row, centred at height cy (Fig. 5's pixels)."""
    return [FIG5.crop((cx - 62, cy - 62, cx + 62, cy + 62)) for cx in xs]


F1C, F2C = ACCENT, (196, 112, 18)          # where each piece of the new format comes from: Format 1, Format 2
EM_F1 = _fig5_row(97, (1397, 1634, 1871, 2109))
EM_F2 = [(_fig5_row(332), True), (_fig5_row(490), False)]
# as in Fig. 5b, the first plan is Format 1's step-by-step rollout (no label); after it fails, Format 2's candidates take over
EM_NEW = [(None, _fig5_row(704), False), ("Candidate 2", _fig5_row(862), False), ("Candidate 3", _fig5_row(1021), True)]
EM_HYBRID = [5, 10.5, 100, 100, 100]       # episodes in the hybrid format over RL steps (%), 3 boxes
EM_CUT, EM_FLY, EM_ROW = 2.2, 3.0, 0.85   # discard / keep, pieces fly down, one plan of the new format
EM_DROP, EM_GAP = 0.8, 0.12                 # each of Format 2's pieces: how long its flight takes, one after another
EM_NEW_T0 = EM_FLY + EM_GAP + 2 * EM_GAP + EM_DROP + 0.07   # the new format draws once every piece has landed
EM_COMMIT = EM_NEW_T0 + 2 * EM_ROW + 0.08 * 3 + 0.28 + 0.15     # the commit, already in place, names the plan that worked


def _think(v, xy, text, col, a, size=16):
    """'<think> text' on one line, left-middle anchored at xy; returns the text's (x0, x1)."""
    ft, fx = inter(size * Z, b"Bold"), inter(size * Z, b"SemiBold")
    v.text(xy, "<think>", ft, fade(MUTED, a), "lm")
    x = xy[0] + v.tlen("<think> ", ft)
    v.text((x, xy[1]), text, fx, fade(col, a), "lm")
    return x, x + v.tlen(text, fx)


def _thumbs(v, t, t0, x0, y, ims, ts, pitch, a, col=ACCENT):
    for i, im in enumerate(ims):
        q = ease_out(prog(t, t0 + 0.08 * i, 0.28))
        x = x0 + i * pitch
        if i and q > 0:
            v.pline([(x - pitch + ts / 2 + 5, y), (x - ts / 2 - 5, y)], q, fade(col, 0.5 * a), 2, dash=(5, 4))
        v.card(im, x + 16 * (1 - q), y, ts, q * a, r=7)
    return x0 + 3 * pitch + ts / 2


def _em_leave(j):
    """When Format 2's piece j leaves: the commit first (j = 0), then Candidate 3, then Candidate 2, lowest first."""
    return EM_FLY + EM_GAP + EM_GAP * j


def _em_path(sxy, dxy, g):
    """Drop straight down into the destination's lane, then slide along it, so no two flights cross."""
    (sx, sy), (dx, dy) = sxy, dxy
    if g < 0.45:
        return sx, sy + (dy - sy) * ease_io(g / 0.45)
    return sx + (dx - sx) * ease_io((g - 0.45) / 0.55), dy


def _tag(v, x, y, label, col, a):
    if a > 0:
        v.pill(x, y, label, col, None, a, size=12)


EM_SLOW = 1.4   # the scene plays this many times slower than its timeline below


def sc_emerge(v, t, dur):
    _emerge_at(v, t / EM_SLOW)


def _emerge_at(v, t):
    v.headline(t, [("A new format", INK), ("emerges", ACCENT), ("after RL.", INK)], size=40,
               sub="SFT taught two separate formats. RL drops part of one and merges the rest into one format.")
    dim = 1 - 0.55 * ease_out(prog(t, EM_FLY, 0.5))   # the old formats step back once their pieces move on
    fh, fd = inter(19 * Z, b"Bold"), inter(16 * Z)
    # Format 1: one linear rollout
    p = ease_out(prog(t, 0.35, 0.45)) * dim
    v.rrect((60, 140 + 14 * (1 - p / dim), 610, 380), 22, fill=fade(WHITE, p))
    v.text((84, 174), "Format 1", fh, fade(F1C, p), "ls")
    v.text((84 + v.tlen("Format 1  ", fh), 174), "linear rollout", fd, fade(MUTED, p), "ls")
    l1 = (84, 214)
    _, l1x = _think(v, l1, "Let me imagine the next moves step by step.", F1C, p * (0.35 if t > EM_FLY else 1))
    xe = _thumbs(v, t, 0.6, 120, 290, EM_F1, 56, 72, p)
    v.text((xe + 18, 290), "</think>", inter(15 * Z, b"Bold"), fade(MUTED, p * ease_out(prog(t, 1.0, 0.3))), "lm")
    _tag(v, l1x + 12, 214, "kept", GREEN, ease_out(prog(t, EM_CUT + 0.2, 0.3)) * p)
    # Format 2: at a fork, imagine both options up front, then commit
    p = ease_out(prog(t, 0.5, 0.45)) * dim
    v.rrect((670, 140 + 14 * (1 - p / dim), 1220, 380), 22, fill=fade(WHITE, p))
    v.text((694, 174), "Format 2", fh, fade(F2C, p), "ls")
    v.text((694 + v.tlen("Format 2  ", fh), 174), "forward thinking", fd, fade(MUTED, p), "ls")
    cut = ease_out(prog(t, EM_CUT, 0.3)); fall = ease_io(prog(t, EM_CUT + 0.45, 0.6))
    la = p * (1 - 0.7 * fall)
    lx0, lx1 = _think(v, (694, 214 + 10 * fall), "A fork: imagine both options before acting.", F2C, la)
    if cut > 0:   # this part of Format 2 is dropped
        v.line([(lx0 - 2, 214 + 10 * fall), (lx0 - 2 + (lx1 - lx0 + 4) * cut, 214 + 10 * fall)], fade(RED, la), 2)
        _tag(v, min(lx1 + 10, 1220 - 100), 190, "discarded", RED, ease_out(prog(t, EM_CUT + 0.25, 0.3)) * p * (1 - fall))
    fc = inter(15 * Z, b"Bold")
    for k, ((ims, ok), y) in enumerate(zip(EM_F2, (262, 316))):
        moving = k == 1 and t > _em_leave(2)   # only Candidate 2's label leaves; Candidate 1 stays behind
        v.text((694, y), f"Candidate {k + 1}", fc, fade(F2C, p * (0.35 if moving else 1)), "lm")
        xe = _thumbs(v, t, 0.75, 836, y, ims, 44, 54, p, F2C)
        v.stamp(xe + 22, y, ok, prog(t, 1.25, 0.3), r=12)
    v.text((694, 356), "I will commit Candidate 1. </think>", inter(15 * Z, b"SemiBold"),
           fade(F2C, p * ease_out(prog(t, 1.3, 0.3)) * (0.35 if t > _em_leave(0) else 1)), "lm")
    _tag(v, 836 + 3 * 54 + 22 + 46, 289, "kept", GREEN, ease_out(prog(t, EM_CUT + 0.35, 0.3)) * p)   # candidates, results, commit
    # the emergent format: Format 1's opening, then Format 2's candidates, one at a time, the next only after a failure
    p = ease_out(prog(t, EM_FLY - 0.2, 0.45))
    if p <= 0:
        return
    v.rrect((60, 400 + 14 * (1 - p), 1220, 700), 22, fill=fade(WHITE, p))
    # once everything has landed, light bands show the new format's two parts: Format 1's, then Format 2's
    ba = ease_out(prog(t, _em_leave(2) + EM_DROP, 0.4)) * p
    if ba > 0:
        for col, (y0b, y1b) in ((F1C, (447, 539)), (F2C, (542, 684))):
            v.rrect((66, y0b, 706, y1b), 12, fill=mix(WHITE, col, 0.09 * ba))
    # the header: the new format, as the sum of the two it came from
    ha = ease_out(prog(t, EM_FLY + 0.6, 0.3)) * p   # it waits for Format 1's line to pass it
    if ha > 0:
        x = 84
        for txt, col, f_ in (("Unified format", INK, fh), ("  =  ", MUTED, fd), ("Format 1", F1C, fh), ("  +  ", MUTED, fd),
                             ("Format 2", F2C, fh)):
            v.text((x, 434), txt, f_, fade(col, ha), "ls"); x += v.tlen(txt, f_)
        _tag(v, x + 14, 428, "new after RL", ACCENT, ha)
    f = ease_io(prog(t, EM_FLY, 0.7))   # Format 1's opening flies down into the new format
    _, tx1 = _think(v, (l1[0], l1[1] + (466 - l1[1]) * f), "Let me imagine the next moves step by step.", F1C, p * min(1, 0.4 + f))
    landed = ease_out(prog(t, _em_leave(2) + EM_DROP, 0.3)) * p
    _tag(v, tx1 + 12, 466, "from Format 1", F1C, landed)
    rows = (512, 566, 620)
    # brackets tie each part to its source: Format 1's line and the rollout under it, then Format 2's candidates and commit
    if landed > 0:
        for col, ys in ((F1C, (466, rows[0])), (F2C, (rows[1], rows[2], 664))):
            v.line([(72, ys[0] - 12), (72, ys[-1] + 10)], fade(col, landed), 3)
            for y in ys:
                v.line([(72, y), (78, y)], fade(col, landed), 3)
    for k, ((label, ims, ok), y) in enumerate(zip(EM_NEW, rows)):
        t0 = EM_NEW_T0 + k * EM_ROW
        if label:   # Format 2's candidate labels come down, lowest first
            g = prog(t, _em_leave(3 - k), EM_DROP)
            sy = (None, 316, 340)[k]
            lab_xy = _em_path((694, sy), (84, y), g); la = p * min(1, 0.4 + g) * (1 if k < 2 else min(1, 3 * g))
        nx = 0
        if k:   # "Next," is new, in neither format: the label makes room, then it fades in
            nx = v.tlen("Next, ", inter(15 * Z, b"Bold")) * ease_out(prog(t, t0 - 0.4, 0.25))
            na = ease_out(prog(t, t0 - 0.15, 0.25)) * p
            v.text((lab_xy[0], lab_xy[1]), "Next,", inter(15 * Z, b"Bold"), fade(INK, na), "lm")
        if label:
            v.text((lab_xy[0] + nx, lab_xy[1]), label, fc, fade(F2C, la), "lm")
        if t < t0:
            continue
        xe = _thumbs(v, t, t0, 290, y, ims, 46, 60, p)
        te = t0 + 0.08 * 3 + 0.28
        v.stamp(xe + 24, y, ok, prog(t, te, 0.25), r=13)
        ra = ease_out(prog(t, te + 0.05, 0.25)) * p
        v.text((xe + 46, y), "Result: succeeds." if ok else "Result: deadlock.", inter(15 * Z, b"SemiBold"),
               fade(GREEN if ok else RED, ra), "lm")
    # Format 2's commit comes down with them, waits, and names the plan that worked once one does
    g = prog(t, _em_leave(0), EM_DROP)
    if g > 0:
        fcm = inter(15 * Z, b"SemiBold")
        won = ease_out(prog(t, EM_COMMIT, 0.3))
        if g < 1:
            line, ca = "I will commit Candidate 1. </think>", min(1, 0.4 + g)
        else:
            line, ca = ("I will commit Candidate 3. </think>" if won > 0 else "I will commit Candidate ?. </think>"), 0.45 + 0.55 * won
        v.text(_em_path((694, 356), (84, 664), g), line, fcm, fade(F2C, p * ca), "lm")
        _tag(v, 84 + v.tlen("I will commit Candidate 3. </think>  ", fcm), 664, "from Format 2", F2C, landed)
    # how often it uses the new format, climbing over RL steps as the format comes together
    q = ease_out(prog(t, _em_leave(2) + EM_DROP, 0.4)) * p   # once the pieces have landed
    v.text((800, 452), "Episodes in the new format (3 boxes)", inter(17 * Z, b"Bold"), fade(INK, q), "ls")
    curve_chart(v, (722, 446, 1248, 688), [(EM_HYBRID, ACCENT, None)], ease_io(prog(t, EM_NEW_T0, 3 * EM_ROW + 0.6)), q,
                ymax=100, xlabel="RL step", size=0.85)


# --- easy-to-hard, each task's result rising under it right after the flip to the test episode
ENV_RES = [("Maze2D", "maze2d", 1), ("Sokoban", "sokoban", 2), ("Pacman", "pacman", 0), ("PushT", "pusht", 3)]
ENV_DESC = {k: (tr, te) for _, k, tr, te in V2.ENVS}
ENV_FLIP = 1.5   # all four tasks flip from their train episode to their test episode


def sc_envs(v, t, dur):
    v.headline(t, [("Trained on", INK), ("easy.", MUTED), ("Tested on", INK), ("hard.", ACCENT)], size=44,
               sub="Success on the hard test sets (K = 5): Agima vs the best baseline.")
    size, pitch = 196, 292
    x0 = W / 2 - 1.5 * pitch
    base, hmax = 640, 150
    for i, (name, key, ri) in enumerate(ENV_RES):
        cx = x0 + i * pitch; cy = 280
        trf, tef = ENV[key]
        t_flip = ENV_FLIP
        f = prog(t, t_flip, 0.5)
        sx = abs(np.cos(np.pi * f)) if 0 < f < 1 else 1.0
        test = f >= 0.5
        frames = tef if test else trf
        kf = int(max(0, t - (t_flip + 0.25 if test else 0)) / 0.2) % len(frames)
        p = ease_out(prog(t, 0.3 + i * 0.1, 0.5))
        v.card(frames[kf], cx, cy + 16 * (1 - p), size, p, sx=max(sx, 0.02), outline=ACCENT if test else None)
        v.ctext((cx, cy - size / 2 - 28), name, inter(22 * Z, b"Bold"), fade(INK, p))
        tr, te = ENV_DESC[key]
        lab, desc, col = ("TEST", te, ACCENT) if test else ("TRAIN", tr, MUTED)
        q = p if not test else ease_out(prog(t, t_flip + 0.25, 0.3))
        fb = inter(14 * Z, b"Bold"); fr = inter(16 * Z)
        w = v.tlen(lab, fb) + 9 + v.tlen(desc, fr)
        v.text((cx - w / 2, cy + size / 2 + 26), lab, fb, fade(col, q), "lm")
        v.text((cx - w / 2 + v.tlen(lab, fb) + 9, cy + size / 2 + 26), desc, fr, fade(INK, q), "lm")
        # results for this task, rising once its test episode is showing
        tb = t_flip + 0.55
        v.line([(cx - 80, base), (cx + 80, base)], fade(FAINT, ease_out(prog(t, tb - 0.2, 0.3))), 2)
        for j, (val, colb, lab2) in enumerate([(V2.BEST_BASE[ri], FAINT, "best baseline"), (V2.AGIMA[ri], ACCENT, "Agima")]):
            g = ease_out(prog(t, tb + 0.12 * j, 0.8))
            if g <= 0:
                continue
            bw = 50; x = cx - bw - 5 if j == 0 else cx + 5
            hgt = hmax * val / 45 * g
            if hgt > 2:
                v.rrect((x, base - hgt, x + bw, base), min(7, hgt / 2 - 0.5), fill=colb, corners=(True, True, False, False))
            v.ctext((x + bw / 2, base - hgt - 16), f"{int(round(val * g))}%", inter((22 if j else 16) * Z, b"Bold"),
                    fade(ACCENT if j else MUTED, min(1, g * 2)))
    q = ease_out(prog(t, ENV_FLIP + 0.6, 0.4))
    v.rrect((W / 2 - 150, 676, W / 2 - 136, 690), 4, fill=fade(ACCENT, q)); v.text((W / 2 - 128, 683), "Agima", inter(15 * Z), fade(INK, q), "lm")
    v.rrect((W / 2 - 40, 676, W / 2 - 26, 690), 4, fill=fade(FAINT, q)); v.text((W / 2 - 18, 683), "best baseline", inter(15 * Z), fade(INK, q), "lm")


def sc_end_fast(v, t, dur):
    """The title and authors, played 2.2x faster than v2's end card."""
    sc_end(v, t * 2.2, dur)


SCENES = [  # (scene, duration, fade in, fade out)
    (sc_hook, HOOK_DUR, True, False),
    (sc_search, SEARCH_DUR, False, True),
    (sc_envs, ENV_FLIP + 0.55 + 0.9 + 1.5, True, True),
    (sc_rl, max(RL_T0 + RL_SWEEP, EX_A0 + 1.1) + 1.2, True, True),
    (sc_emerge, (EM_COMMIT + 2.4) * EM_SLOW, True, True),
    (sc_end_fast, 2.0, True, False),
]
XF = 0.35


class V3(V):
    """Text and lines faded all the way out (fade(col, 0) is the page colour) are skipped: on a white card they would
    otherwise show as faint page-coloured ghosts."""

    def text(self, xy, s, font, col, anchor="la"):
        if tuple(col) != BG:
            super().text(xy, s, font, col, anchor)

    def line(self, pts, col, width=2, dash=None):
        if tuple(col) != BG:
            super().line(pts, col, width, dash)


def frame(fn, t, dur, fin=True, fout=True):
    v = V3(); fn(v, t, dur); im = v.out()
    a_in = ease_out(t / XF) if fin else 1.0
    a_out = ease_out((dur - 1 / FPS - t) / XF) if fout else 1.0
    if a_in >= 1 and a_out >= 1:
        return im
    bg = BG2.resize((W, H))
    s = 1.0 + 0.03 * (1 - a_in) - 0.03 * (1 - a_out)
    if abs(s - 1) > 1e-3:
        im2 = im.resize((int(W * s), int(H * s)), Image.BILINEAR)
        if s > 1:
            l, tp = (im2.width - W) // 2, (im2.height - H) // 2
            im = im2.crop((l, tp, l + W, tp + H))
        else:
            im = bg.copy(); im.paste(im2, ((W - im2.width) // 2, (H - im2.height) // 2))
    return Image.blend(bg, im, min(a_in, a_out))


# ------------------------------------------------------------------ sound: synthesised, timed off the same timelines
SR = 48000


def _env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def snd_blip(f0=1500, f1=2100, dur=0.05, amp=0.16):
    """'diu': a short rising chirp, one per imagined frame."""
    n = int(dur * SR); t = np.arange(n) / SR
    ph = 2 * np.pi * (f0 * t + (f1 - f0) * t ** 2 / (2 * dur))
    return amp * np.sin(ph) * _env(n, 0.002, dur / 3)


def snd_ding(f=1318.5, dur=1.1, amp=0.32):
    """A bell: a bright partial ladder that rings out; for every plan that works."""
    n = int(dur * SR); t = np.arange(n) / SR
    out = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / d) for m, a, d in ((1, 1.0, 0.45), (2.0, 0.35, 0.25), (3.0, 0.15, 0.12)))
    return amp * out * np.minimum(1, t / 0.003)


def snd_chime(amp=0.34):
    """Two dings a fifth apart: the puzzle is solved."""
    a, b = snd_ding(1046.5, amp=amp), snd_ding(1568.0, amp=amp)
    out = np.zeros(len(a) + int(0.11 * SR)); out[:len(a)] += a; out[int(0.11 * SR):] += b
    return out


def snd_thud(amp=0.42):
    """A low knock with a short buzz: a dead end."""
    n = int(0.28 * SR); t = np.arange(n) / SR
    f = 150 * np.exp(-t / 0.08) + 60
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09)
    buzz = 0.25 * np.sign(np.sin(2 * np.pi * 110 * t)) * np.exp(-t / 0.05)
    return amp * (body + buzz) * np.minimum(1, t / 0.002)


def snd_swoosh(dur=0.32, amp=0.1):
    """A falling sweep of soft noise: a rewind."""
    n = int(dur * SR); t = np.arange(n) / SR
    rng = np.random.default_rng(7); noise = rng.standard_normal(n)
    sweep = np.sin(2 * np.pi * np.cumsum(2400 * np.exp(-t / (dur / 2)) + 300) / SR)
    shape = np.sin(np.pi * t / dur) ** 2
    return amp * (0.6 * sweep + 0.4 * np.convolve(noise, np.ones(24) / 24, "same")) * shape


def audio_events():
    """[(time in the video, sound)] for every event the eye should hear."""
    starts = dict(zip([fn.__name__ for fn, _, _, _ in SCENES], np.cumsum([0] + [d for _, d, _, _ in SCENES])))
    ev = []
    # hook: the jam, then the restart
    h = starts["sc_hook"]
    ev += [(h + HK_T0 + k * HK_MOVE, snd_blip(500, 560, 0.04, 0.1)) for k in range(len(HK_MOVES))]
    ev += [(h + HK_STUCK, snd_thud()), (h + HK_REW, snd_swoosh())]
    # search: every imagined frame lands with a 'diu'; dead ends knock and rewind; every working plan dings
    s0 = starts["sc_search"]; real = lambda tau: s0 + float(np.interp(tau, WARP_TAU, WARP_REAL))
    for k, ta in enumerate(IM_T):
        ev.append((real(ta + ACT_LAG), snd_blip(1450 + 70 * (k % 4), 2050 + 70 * (k % 4))))
    for d in range(len(DEADS)):
        ev += [(real(DEAD_T[d]["t_x"]), snd_thud(0.34)), (real(DEAD_T[d]["rw0"]), snd_swoosh())]
    ev += [(real(ph["t_ok"]), snd_ding()) for ph in PH]
    ev += [(real(SOLVE_T0 + k * SOLVE_STEP), snd_blip(900, 1150, 0.035, 0.12)) for k in range(len(SOL))]
    ev.append((real(SOLVE_T0 + SOLVE_STEP * len(SOL)), snd_chime()))
    # agentic RL: before RL jams; after RL, the imagined jam, the safe way, the solve
    r0 = starts["sc_rl"]
    ev += [(r0 + EX_B0 + 0.3, snd_thud(0.34)), (r0 + EX_A0 + 0.2, snd_thud(0.22)),
           (r0 + EX_A0 + 0.45, snd_blip()), (r0 + EX_A0 + 0.65, snd_blip(1600, 2200)), (r0 + EX_A0 + 0.85, snd_ding())]
    # emergent: the discard, the pieces moving down, then each plan of the new format
    e0 = starts["sc_emerge"]; em = lambda x: e0 + EM_SLOW * x
    ev += [(em(EM_CUT), snd_swoosh(0.3, 0.08)), (em(EM_FLY), snd_swoosh(0.45, 0.08))]
    for k, (_, _, ok) in enumerate(EM_NEW):
        t0 = EM_NEW_T0 + k * EM_ROW
        ev += [(em(t0 + 0.08 * i), snd_blip(1500 + 80 * i, 2100 + 80 * i, 0.045, 0.12)) for i in range(4)]
        ev.append((em(t0 + 0.08 * 3 + 0.28), snd_ding() if ok else snd_thud(0.3)))
    # the end card: one soft chime
    ev.append((starts["sc_end_fast"] + 0.1, snd_chime(0.22)))
    return ev


def render_audio(path, total):
    out = np.zeros(int((total + 1.5) * SR))
    for t, x in audio_events():
        i = int(t * SR)
        if 0 <= i < len(out):
            out[i:i + len(x)] += x[:len(out) - i]
    out = out[:int(total * SR)]
    out *= 0.89 / max(1e-6, np.abs(out).max())   # peak at -1 dBFS
    pcm = (out * 32767).astype("<i2").tobytes()
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm)


def render_video(out, audio=True):
    total = sum(int(round(d * FPS)) for _, d, _, _ in SCENES) / FPS
    wav = out + ".wav"
    if audio:
        render_audio(wav, total)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    cmd += ["-i", wav, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "160k", "-shortest"] if audio else []
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = 0
    for fn, dur, fi, fo in SCENES:
        for i in range(int(round(dur * FPS))):
            ff.stdin.write(frame(fn, i / FPS, dur, fi, fo).tobytes()); n += 1
    ff.stdin.close(); ff.wait()
    if audio:
        os.remove(wav)
    print("frames", n, "seconds", round(n / FPS, 1), "->", out, os.path.getsize(out) // 1024, "KB")


def render_stills(outdir):
    os.makedirs(outdir, exist_ok=True)
    for k, (fn, dur, fi, fo) in enumerate(SCENES):
        for frac in (0.2, 0.45, 0.7, 0.95):
            frame(fn, dur * frac, dur, fi, fo).save(f"{outdir}/{k:02d}_{fn.__name__}_{int(frac * 100)}.png")
    print("stills ->", outdir)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Render the Agima teaser video.")
    ap.add_argument("-o", "--out", default=OUT, help="output .mp4 (default: the site's assets/video/agima_teaser_v3.mp4)")
    ap.add_argument("--stills", metavar="DIR", help="save preview stills of every scene to DIR instead of rendering the video")
    ap.add_argument("--no-audio", action="store_true", help="render without the sound effects")
    args = ap.parse_args()
    if args.stills:
        render_stills(args.stills)
    else:
        render_video(args.out, audio=not args.no_audio)
