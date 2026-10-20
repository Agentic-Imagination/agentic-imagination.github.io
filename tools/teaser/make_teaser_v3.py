"""Render the Agima teaser (1280x720, 30 fps). Every frame is drawn at 2x and downsampled.

usage:
  python make_teaser_v3.py                    # writes ../../assets/video/agima_teaser_v3.mp4 (with its music)
  python make_teaser_v3.py --music TRACK.mp3  # with another track as the background music (looped or trimmed, faded)
  python make_teaser_v3.py --sfx              # with the old event sounds mixed in quietly under the music
  python make_teaser_v3.py --audio-only       # replaces only the soundtrack of the existing render (seconds)
  python make_teaser_v3.py --no-audio         # without a soundtrack
  python make_teaser_v3.py -o out.mp4         # writes somewhere else
  python make_teaser_v3.py --stills DIR       # saves preview stills of every scene to DIR instead
  python make_teaser_v3.py --list-clips       # the short silent clips the project page shows (see CLIPS)
  python make_teaser_v3.py --clip NAME        # writes ../../assets/video/NAME.mp4 and its poster NAME.webp
  python make_teaser_v3.py --clip NAME -o out.mp4 | --clip all | --clip NAME --stills DIR

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

Clips for the page (silent, 1280x720, each fades in from and out to the background so it loops)
  clip_method         the search scene alone
  clip_format         the emerge scene for the page (sc_emerge_page: no Fig. 6b curve; the unified format centred, larger)
  clip_fork           the fork before RL (no branch at this fork; takes the risky push for real: deadlock) and after RL (branches at the fork,
                      sees that push fail in imagination, rewinds, imagines the safe way, acts on it); an illustration
  clip_trap_deadlock  without imagination the tempting push jams a box; Agima imagines it, sees the deadlock, rewinds,
                      imagines another route to the end and acts on it
  clip_trap_fork      the same on the fork trap (the wrong push at the critical step)
  clip_trap_pacman    the real Pacman episodes: linear rollout (nearer food first, caught) vs forward thinking (farther
                      food first, all food eaten), with glowing trails
"""
import json
import os
import subprocess
from contextlib import contextmanager
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

_argv, sys.argv = sys.argv, sys.argv[:1]
import make_teaser_v2 as V2   # noqa: E402
sys.argv = _argv

from make_teaser import MOVE_VEC, TEXT_TWIN  # noqa: E402
from make_teaser_v2 import (ACCENT, BG, BG2, BOARD, DEAD, ENV, FAINT, FIG5, GREEN, H, INK, LINE, MUTED, RED, SITE, WHITE,  # noqa: E402
                            W, Z, V, back_out, clamp, ease_io, ease_out, fade, face, mix, prog, sc_end)

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
    """A plain polyline. (It once had a soft halo; the teaser now draws like the page: flat, no glows.)"""
    if len(pts) < 2 or a <= 0:
        return
    v.line(pts, fade(col, a), width)


def glow_dot(v, x, y, r, col, a=1.0):
    """Nothing: the halo that marked a moving point is gone (the point itself is drawn by its caller)."""
    return


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
    dict(cap="Forward thinking: imagine a plan, and at a dead end rewind and try another.", segs=[("dead", 0), ("main", 1, 6)]),
    dict(cap="Counterfactual branching: test a risky push, rewind, and carry on.", segs=[("main", 7, 7), ("dead", 1), ("main", 8, 12)]),
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


T_ACTED = next(tau for tau in np.arange(0, 60, 1 / 600) if _act_head(tau) >= 1)   # the first move is acted


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


def tag_ground(v, box, a):
    """A flat white ground (2 px corners) under a small label, as opaque as the label, so it never punches a hole."""
    if a <= 0:
        return
    m = Image.new("L", (max(1, int((box[2] - box[0]) * Z)), max(1, int((box[3] - box[1]) * Z))), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, m.width - 1, m.height - 1], radius=2 * Z, fill=int(255 * clamp(a)))
    v.c.paste(Image.new("RGB", m.size, WHITE), (int(box[0] * Z), int(box[1] * Z)), m)


def halo_text(v, xy, s, font, col, anchor="lm", halo=3):
    """Text with a thin white halo, so a label stays readable where it crosses a line."""
    v.d.text(tuple(np.multiply(xy, Z)), s, font=font, fill=col, anchor=anchor, stroke_width=int(halo * Z), stroke_fill=WHITE)


def action_tag(v, x, y, move, col, a, scale=1.0):
    """The action's name, with a small arrow glyph before it, centred on (x, y): plain text in the line's colour."""
    if a <= 0 or scale <= 0:
        return
    f = face(max(8, int(14 * Z * scale)), b"SemiBold")
    tw = v.tlen(move, f); aw = 10 * scale
    w = aw + 4 * scale + tw
    x0 = x - w / 2
    col = fade(TEXT_TWIN.get(tuple(col), col), a)
    tag_ground(v, (x0 - 4 * scale, y - 9 * scale, x0 + w + 4 * scale, y + 9 * scale), a)
    cx = x0 + aw / 2
    dx, dy = MOVE_VEC[move]; L = aw / 2
    v.line([(cx - dx * L, y - dy * L), (cx + dx * (L - 3 * scale), y + dy * (L - 3 * scale))], col, max(1, int(2 * scale)))
    v.head(cx + dx * L, y + dy * L, col, (dx, dy), 4.5 * scale)
    v.text((x0 + aw + 4 * scale, y + 0.5), move, f, col, "lm")


def rewind_tag(v, x, y, a):
    """'rewind' with a double back-arrow, centred on (x, y): plain ink text on a small flat white tag."""
    rewind_pill(v, x, y, a, 1.0)


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
    col = fade(mix(INK, ACCENT, busy), a)   # its outline turns imagination blue while it draws a frame
    v.rrect((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), 8 * s, fill=fade(WHITE, a), outline=col, width=max(2, int(3 * s)))
    if s > 0.8:   # big, for the intro: say what it is
        v.ctext((cx, cy - 14 * s), "Agima", face(int(48 * Z * s), b"Bold"), fade(INK, a))
        v.ctext((cx, cy + 30 * s), "one omni model", face(int(18 * Z * s)), fade(MUTED, a))
    else:
        v.ctext((cx, cy - 3 * s), "Agima", face(int(52 * Z * s), b"Bold"), fade(INK, a))


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
    glow_line(v, [a, (x, y)], col, 2, 6, 0.4 * al * (1 - 0.6 * f))
    v.d.ellipse(v.z(x - 4, y - 4, x + 4, y + 4), fill=fade(col, al))


def pop_r(p, r):
    """Badge radius that pops in with a small overshoot."""
    return max(1.0, r * (0.4 + 0.6 * back_out(p)))


def cap_line(v, line, a, y, size=27):
    """A caption: one plain sentence in ink, centred, on a white plate so boards passing below never run into it."""
    if a <= 0:
        return
    f = face(size * Z)
    w = v.tlen(line, f)
    plate(v, (W / 2 - w / 2 - 24, y - 32, W / 2 + w / 2 + 24, y + 14), a)
    v.text((W / 2 - w / 2, y), line, f, fade(INK, a), "ls")


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
    v.pill(cx - size / 2, cy - size / 2 - 22, "real board", MUTED, None, ease_out(prog(t, HK_SHRINK[0] + 0.45, 0.35)), size=14)
    # what is going on: one plain sentence at a time
    caps = [(0.15, "Without imagination, it pushes the nearest box on instinct."),
            (HK_STUCK + 0.2, "Deadlock: after one push the puzzle can never be solved."),
            (HK_REW, "Restart, and let Agima imagine first.")]
    for i, (t0, line) in enumerate(caps):
        t1 = caps[i + 1][0] if i + 1 < len(caps) else dur + 1
        ca = ease_out(prog(t, t0, 0.3)) * (1 - ease_out(prog(t, t1 - 0.2, 0.2)))
        if i == len(caps) - 1:
            ca *= 1 - ease_out(prog(t, HK_SHRINK[0] + 0.4, 0.35))
        if ca <= 0:
            continue
        cap_line(v, line, ca, 622)


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
        v.pill(p0[0] - 75 * zm, p0[1] - 75 * zm - 22, "real board", MUTED, None, 1 - zoom_a, size=14)
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
        v.pill(SOLVE_C[0] - SOLVE_S / 2, SOLVE_C[1] - SOLVE_S / 2 - 22, "real environment", MUTED, None, sa, size=14)
        v.stamp(SOLVE_C[0] + SOLVE_S / 2 + 4, SOLVE_C[1] - SOLVE_S / 2 - 4, True, prog(t, SOLVE_T0 + SOLVE_STEP * len(SOL), 0.3), r=18)
    for path, f, a, below in rewinds:   # the rewind marker runs back along the dead end, to where it branched off
        x, y = _along(path, f)
        glow_dot(v, x, y, 16, INK, 0.5 * max(a, 0.6 * (f < 1)))
        rewind_tag(v, x, y + (54 * zm + 24) * (1 if below else -1), a)

    ha = ease_out(prog(t, 0.1, 0.4))
    # the model: beside the real board for the intro, then just ahead of the frames it imagines
    model_box(v, mp[0], mp[1], ms, _busy(t), ma)
    na = ease_out(prog(t, T_START - 0.15, 0.25)) * (1 - ease_out(prog(t, OMNI_END - 0.05, 0.2))) * ma
    if na > 0:
        x0n, y0n = mp[0] - 130 * ms, mp[1] + 54 * ms + 24
        cur = [ta for ta in IM_T[:2] if ta - 0.1 <= t]
        dt_ = t - cur[-1] if cur else -1
        lit_a = 0 <= dt_ < ACT_LAG + 0.02         # the action is being written...
        lit_f = ACT_LAG <= dt_ < ACT_LAG + 0.3    # ...then the frame is being drawn
        for k, (txt, lit) in enumerate([("It writes the action,", lit_a), ("then draws the next frame.", lit_f)]):
            v.text((x0n, y0n + 6 + 34 * k), txt, face(21 * Z),
                   fade(mix(MUTED, ACCENT if k else INK, 1.0 if lit else 0.0), na), "lm")
    # caption
    cap = None
    if t < OMNI_END:
        cap, ca = "Agima is one omni model: both the policy and the world model.", \
            ease_out(prog(t, 0.15, 0.4)) * (1 - ease_out(prog(t, OMNI_END - 0.15, 0.15)))
    for i, ph in enumerate(PH):
        t_next = PH[i + 1]["t"] if i + 1 < len(PH) else T_ZOOM
        t_cap = max(ph["t"], OMNI_END)
        if t_cap <= t < t_next and ph["cap"]:
            cap, ca = ph["cap"], ease_out(prog(t, t_cap + 0.05, 0.3)) * (1 - ease_out(prog(t, t_next - 0.2, 0.2)))
    if cap:
        cap_line(v, cap, ca, 612)
    za = ease_out(prog(t, T_ZOOM + 0.6, 0.5))
    if za > 0:
        line = "Agima imagines many futures and acts on one."
        v.headline(t - T_ZOOM - 0.6, [(line, INK)], x=W / 2 - v.tlen(line, v.bold(34)) / 2, y=612, size=34)
    # the acted moves so far, in order (the label comes in with the first one)
    v.text((70, 672), "Acted", face(16 * Z), fade(MUTED, ha * ease_out(prog(t, T_ACTED - 0.05, 0.25))), "lm")
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
    fa = face(int(max(13, 16 * size) * Z))   # axis text stays readable on a small chart
    if title:
        v.text((x0 + 30 * size, y0 + 48 * size), title, face(int(21 * Z * size), b"Bold"), fade(INK, p), "ls")
    px0, px1 = x0 + 84 * size, x1 - 190 * size
    py0, py1 = y0 + (96 if title else 30) * size, y1 - 70 * size
    to = lambda s_, val: (px0 + (px1 - px0) * s_ / 200, py1 - (py1 - py0) * val / ymax)
    xe = to(200 * u if grow else 200, 0)[0]
    for k in range(6):
        y = to(0, ymax * k / 5)[1]
        v.line([(px0, y), (max(px0 + 1, xe), y)], fade(FAINT, (0.9 if k == 0 else 0.5) * p), 2 if k == 0 else 1)
        if size >= 1 or k in (0, 5):   # a small chart names only its ends
            v.text((px0 - 14 * size, y), f"{int(ymax * k / 5)}%", fa, fade(MUTED, p), "rm")
    # the RL-step axis names only the measured checkpoints (0, 50, ..., 200), each as the curves reach it
    for s_ in RL_STEPS:
        ta =1.0 if not grow else ease_out(prog(200 * u, s_ - 1e-6, 12))
        if ta > 0:
            v.text((to(s_, 0)[0], py1 + 26 * size), str(s_), fa, fade(MUTED, p * ta), "mm")
    v.text(((px0 + px1) / 2, py1 + 50 * size), xlabel, fa, fade(MUTED, p), "mm")
    if u <= 0:
        return
    ends = []
    for vals, col, name in lines:
        pts, val = _rl_partial(vals, u)
        sp = [to(s_, y) for s_, y in pts]
        glow_line(v, sp, col, max(2, round(3 * size)), 9 * size, p)
        hx, hy = sp[-1]
        r = 5 * size
        v.d.ellipse(v.z(hx - r, hy - r, hx + r, hy + r), fill=fade(col, p), outline=fade(WHITE, p), width=2 * Z)
        ends.append([hy, hx, val, col, name, vals[-1]])
    ends.sort(key=lambda e: -e[5])   # labels keep their final order, and stay at least one label apart
    gap = (52 if any(e[4] for e in ends) else 30) * size
    for i in range(1, len(ends)):
        ends[i][0] = max(ends[i][0], ends[i - 1][0] + gap)
    # values are printed only once the curves reach the last checkpoint: in between they would be interpolated, not measured
    va = p * (ease_out(prog(u, 0.985, 0.015)) if u < 1 else 1.0)
    # direct labels: the model's name, then its step-200 value under it, in ink (the line carries the colour)
    for ly, hx, val, col, name, last in ends:
        if name:
            v.text((hx + 18 * size, ly - 12 * size), name, face(int(18 * Z * size), b"SemiBold"), fade(INK, p), "lm")
            if va > 0:
                v.text((hx + 18 * size, ly + 12 * size), f"{int(round(last))}%", face(int(18 * Z * size)), fade(MUTED, va), "lm")
        elif va > 0:
            v.text((hx + 16 * size, ly), f"{int(round(last))}%", face(int(20 * Z * size), b"SemiBold"), fade(INK, va), "lm")


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
    """A row title in ink (the boards' outlines carry the outcome colours), with a remark after it."""
    fh = face(20 * Z, b"Bold")
    v.text((690, y), title, fh, fade(INK, p), "ls")
    v.text((690 + v.tlen(title + "  ", fh), y), sub, face(16 * Z), fade(MUTED, p), "ls")


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
    v.text((EX_C[2] - EX_W / 2 + 4, y), "deadlock", face(19 * Z, b"SemiBold"), fade(TEXT_TWIN[RED], ease_out(prog(t, t0 + 0.35, 0.25))), "lm")


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
    v.text((EX_C[2] - EX_W / 2 + 4, yr), "solved", face(19 * Z, b"SemiBold"), fade(TEXT_TWIN[GREEN], ease_out(prog(t, t0 + 0.9, 0.25))), "lm")


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
    # the page's chart colours: the model the chart is about in blue, the reference models in neutral greys
    curve_chart(v, (60, 160 + dy, 620, 640 + dy), [(RL_AGIMA, ACCENT, "Agima (Branching)"), (RL_A7B, (134, 140, 151), "Agima-A7B"),
                                                      (RL_ACT, FAINT, "Action-only")], ease_out(prog(t, RL_T0, RL_SWEEP)), p,
                title="Fork puzzles, 4 boxes", xlabel="RL steps", size=0.9)
    # right: the same fork, before and after RL
    q = ease_out(prog(t, 0.08, 0.3)); dq = 16 * (1 - q)
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
EM_HYBRID = [4.9, 10.5, 100, 100, 100]     # episodes in the unified format over RL steps (%), 3 boxes (= rl-charts.js fig6b)
EM_CUT, EM_FLY, EM_ROW = 2.2, 3.0, 0.85   # discard / keep, pieces fly down, one plan of the new format
EM_DROP, EM_GAP = 0.8, 0.12                 # each of Format 2's pieces: how long its flight takes, one after another
EM_NEW_T0 = EM_FLY + EM_GAP + 2 * EM_GAP + EM_DROP + 0.07   # the new format draws once every piece has landed
EM_COMMIT = EM_NEW_T0 + 2 * EM_ROW + 0.08 * 3 + 0.28 + 0.15     # the commit, already in place, names the plan that worked


def _think(v, xy, text, col, a, size=16):
    """'<think> text' on one line, left-middle anchored at xy; returns the text's (x0, x1)."""
    ft, fx = face(int(round(size * Z)), b"Bold"), face(int(round(size * Z)), b"SemiBold")
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


def _tag(v, x, y, label, col, a, size=12):
    if a > 0:
        v.pill(x, y, label, col, None, a, size=size)


EM_SLOW = 1.4   # the scene plays this many times slower than its timeline below


def sc_emerge(v, t, dur):
    _emerge_at(v, t / EM_SLOW)


def sc_emerge_page(v, t, dur):
    """The page's version: no curve (the page draws Fig. 6b as its own chart), so the unified format gets the whole
    panel, centred, in larger type."""
    _emerge_at(v, t / EM_SLOW, page=True)


def _emerge_at(v, t, page=False):
    v.headline(t, [("A new format", INK), ("emerges", ACCENT), ("after RL.", INK)], size=40,
               sub="SFT taught two separate formats. RL drops part of one and merges the rest into one format.")
    dim = 1 - 0.55 * ease_out(prog(t, EM_FLY, 0.5))   # the old formats step back once their pieces move on
    fh, fd = face(19 * Z, b"Bold"), face(16 * Z)
    # Format 1: one linear rollout
    p = ease_out(prog(t, 0.35, 0.45)) * dim
    v.text((84, 174), "Format 1", fh, fade(F1C, p), "ls")
    v.text((84 + v.tlen("Format 1  ", fh), 174), "linear rollout", fd, fade(MUTED, p), "ls")
    l1 = (84, 214)
    _, l1x = _think(v, l1, "Let me imagine the next moves step by step.", F1C, p * (0.35 if t > EM_FLY else 1))
    xe = _thumbs(v, t, 0.6, 120, 290, EM_F1, 56, 72, p)
    v.text((xe + 18, 290), "</think>", face(15 * Z, b"Bold"), fade(MUTED, p * ease_out(prog(t, 1.0, 0.3))), "lm")
    _tag(v, l1x + 12, 214, "kept", GREEN, ease_out(prog(t, EM_CUT + 0.2, 0.3)) * p)
    # Format 2: at a fork, imagine both options up front, then commit
    p = ease_out(prog(t, 0.5, 0.45)) * dim
    v.text((694, 174), "Format 2", fh, fade(F2C, p), "ls")
    v.text((694 + v.tlen("Format 2  ", fh), 174), "forward thinking", fd, fade(MUTED, p), "ls")
    cut = ease_out(prog(t, EM_CUT, 0.3)); fall = ease_io(prog(t, EM_CUT + 0.45, 0.6))
    la = p * (1 - 0.7 * fall)
    lx0, lx1 = _think(v, (694, 214 + 10 * fall), "A fork: imagine both options before acting.", F2C, la)
    if cut > 0:   # this part of Format 2 is dropped
        v.line([(lx0 - 2, 214 + 10 * fall), (lx0 - 2 + (lx1 - lx0 + 4) * cut, 214 + 10 * fall)], fade(RED, la), 2)
        _tag(v, min(lx1 + 10, 1220 - 100), 190, "discarded", RED, ease_out(prog(t, EM_CUT + 0.25, 0.3)) * p * (1 - fall))
    fc = face(15 * Z, b"Bold")
    for k, ((ims, ok), y) in enumerate(zip(EM_F2, (262, 316))):
        moving = k == 1 and t > _em_leave(2)   # only Candidate 2's label leaves; Candidate 1 stays behind
        v.text((694, y), f"Candidate {k + 1}", fc, fade(F2C, p * (0.35 if moving else 1)), "lm")
        xe = _thumbs(v, t, 0.75, 836, y, ims, 44, 54, p, F2C)
        v.stamp(xe + 22, y, ok, prog(t, 1.25, 0.3), r=12)
    v.text((694, 356), "I will commit Candidate 1. </think>", face(15 * Z, b"SemiBold"),
           fade(F2C, p * ease_out(prog(t, 1.3, 0.3)) * (0.35 if t > _em_leave(0) else 1)), "lm")
    _tag(v, 836 + 3 * 54 + 22 + 46, 289, "kept", GREEN, ease_out(prog(t, EM_CUT + 0.35, 0.3)) * p)   # candidates, results, commit
    # the emergent format: Format 1's opening, then Format 2's candidates, one at a time, the next only after a failure
    p = ease_out(prog(t, EM_FLY - 0.2, 0.45))
    if p <= 0:
        return
    v.line([(60, 400), (1220, 400)], fade(LINE, p), 1)   # a hairline between the two SFT formats and the new one
    # the page's version is centred in the whole panel and set larger (k); the teaser's leaves room for the curve
    k_ = 1.25 if page else 1.0
    bx = 234 if page else 84                    # left edge of the unified format's text
    tx0 = bx + int(round(206 * k_))             # its first thumbnail
    ts, tp = (50, 76) if page else (46, 60)     # thumbnail size and pitch
    sz = lambda n, g=1.0: n * (1 + (k_ - 1) * g)   # a font size n, grown by g of the way to the larger type
    band_r = W - bx + 18 if page else 706
    # the header: the new format, as the sum of the two it came from
    ha = ease_out(prog(t, EM_FLY + 0.6, 0.3)) * p   # it waits for Format 1's line to pass it
    if ha > 0:
        x = bx
        fhb, fdb = face(int(sz(19) * Z), b"Bold"), face(int(sz(16) * Z))
        for txt, col, f_ in (("Unified format", INK, fhb), ("  =  ", MUTED, fdb), ("Format 1", F1C, fhb), ("  +  ", MUTED, fdb),
                             ("Format 2", F2C, fhb)):
            v.text((x, 434), txt, f_, fade(col, ha), "ls"); x += v.tlen(txt, f_)
        _tag(v, x + 14, 428, "new after RL", ACCENT, ha, int(sz(12)))
    f = ease_io(prog(t, EM_FLY, 0.7))   # Format 1's opening flies down into the new format
    _, tx1 = _think(v, (l1[0] + (bx - l1[0]) * f, l1[1] + (466 - l1[1]) * f), "Let me imagine the next moves step by step.", F1C,
                    p * min(1, 0.4 + f), sz(16, f))
    landed = ease_out(prog(t, _em_leave(2) + EM_DROP, 0.3)) * p
    _tag(v, tx1 + 12, 466, "from Format 1", F1C, landed, int(sz(12)))
    rows = (512, 566, 620)
    for k, ((label, ims, ok), y) in enumerate(zip(EM_NEW, rows)):
        t0 = EM_NEW_T0 + k * EM_ROW
        if label:   # Format 2's candidate labels come down, lowest first
            g = prog(t, _em_leave(3 - k), EM_DROP)
            sy = (None, 316, 340)[k]
            lab_xy = _em_path((694, sy), (bx, y), g); la = p * min(1, 0.4 + g) * (1 if k < 2 else min(1, 3 * g))
            flab = face(int(sz(15, g) * Z), b"Bold")
        nx = 0
        if k:   # "Next," is new, in neither format: the label makes room, then it fades in
            fnx = face(int(sz(15) * Z), b"Bold")
            nx = v.tlen("Next, ", fnx) * ease_out(prog(t, t0 - 0.4, 0.25))
            na = ease_out(prog(t, t0 - 0.15, 0.25)) * p
            v.text((lab_xy[0], lab_xy[1]), "Next,", fnx, fade(INK, na), "lm")
        if label:
            v.text((lab_xy[0] + nx, lab_xy[1]), label, flab, fade(F2C, la), "lm")
        if t < t0:
            continue
        xe = _thumbs(v, t, t0, tx0, y, ims, ts, tp, p)
        te = t0 + 0.08 * 3 + 0.28
        v.stamp(xe + 24 * k_, y, ok, prog(t, te, 0.25), r=13 * k_)
        ra = ease_out(prog(t, te + 0.05, 0.25)) * p
        v.text((xe + 46 * k_, y), "Result: succeeds." if ok else "Result: deadlock.", face(int(sz(15) * Z), b"SemiBold"),
               fade(GREEN if ok else RED, ra), "lm")
    # Format 2's commit comes down with them, waits, and names the plan that worked once one does
    g = prog(t, _em_leave(0), EM_DROP)
    if g > 0:
        fcm = face(int(sz(15, g) * Z), b"SemiBold")
        won = ease_out(prog(t, EM_COMMIT, 0.3))
        if g < 1:
            line, ca = "I will commit Candidate 1. </think>", min(1, 0.4 + g)
        else:
            line, ca = ("I will commit Candidate 3. </think>" if won > 0 else "I will commit Candidate ?. </think>"), 0.45 + 0.55 * won
        v.text(_em_path((694, 356), (bx, 664), g), line, fcm, fade(F2C, p * ca), "lm")
        _tag(v, bx + v.tlen("I will commit Candidate 3. </think>  ", fcm), 664, "from Format 2", F2C, landed, int(sz(12)))
    if page:
        return
    # the teaser only: how often it uses the new format, climbing over RL steps as the format comes together
    q = ease_out(prog(t, _em_leave(2) + EM_DROP, 0.4)) * p   # once the pieces have landed
    v.text((800, 452), "Episodes in the unified format (3 boxes)", face(17 * Z, b"Bold"), fade(INK, q), "ls")
    curve_chart(v, (722, 446, 1248, 688), [(EM_HYBRID, ACCENT, None)], ease_io(prog(t, EM_NEW_T0, 3 * EM_ROW + 0.6)), q,
                ymax=100, xlabel="RL step", size=0.85)


# --- easy-to-hard, each task's result rising under it right after the flip to the test episode
ENV_RES = [("Maze2D", "maze2d", 1), ("Sokoban", "sokoban", 2), ("Pacman", "pacman", 0), ("PushT", "pusht", 3)]
ENV_DESC = {k: (tr, te) for _, k, tr, te in V2.ENVS}
ENV_FLIP = 1.5   # all four tasks flip from their train episode to their test episode


def sc_envs(v, t, dur):
    v.headline(t, [("Trained on easy levels, tested on hard ones.", INK)], size=44,
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
        v.card(frames[kf], cx, cy + 16 * (1 - p), size, p, sx=max(sx, 0.02), outline=INK)   # ground truth: a real episode
        v.ctext((cx, cy - size / 2 - 28), name, face(22 * Z, b"Bold"), fade(INK, p))
        tr, te = ENV_DESC[key]
        desc = (te + " (test)") if test else (tr + " (train)")
        q = p if not test else ease_out(prog(t, t_flip + 0.25, 0.3))
        v.ctext((cx, cy + size / 2 + 26), desc, face(17 * Z), fade(MUTED, q))
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
                v.rrect((x, base - hgt, x + bw, base), min(2, hgt / 2 - 0.5), fill=colb, corners=(True, True, False, False))
            v.ctext((x + bw / 2, base - hgt - 16), f"{int(round(val * g))}%", face(18 * Z, b"SemiBold" if j else b"Regular"),
                    fade(INK if j else MUTED, min(1, g * 2)))
    q = ease_out(prog(t, ENV_FLIP + 0.6, 0.4))
    v.rrect((W / 2 - 150, 676, W / 2 - 136, 690), 2, fill=fade(ACCENT, q)); v.text((W / 2 - 128, 683), "Agima", face(16 * Z), fade(INK, q), "lm")
    v.rrect((W / 2 - 40, 676, W / 2 - 26, 690), 2, fill=fade(FAINT, q)); v.text((W / 2 - 18, 683), "best baseline", face(16 * Z), fade(INK, q), "lm")


def sc_end_fast(v, t, dur):
    """The title and authors, played 2.2x faster than v2's end card."""
    sc_end(v, t * 2.2, dur)


SCENES = [  # (scene, duration, fade in, fade out)
    (sc_hook, HOOK_DUR, False, False),   # no fade-in: the first frame is the board, so the video plays at once
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


# ------------------------------------------------------------------ sound
# The soundtrack is one piece of background music, synthesised below from the scene timeline, so there is no licence
# to track: D major at about 103 BPM, its bar lines laid so the groove starts on the search scene's first frame and the
# tonic lands on the end card's. --music PATH puts any other track under the video instead (looped or trimmed to it,
# faded in and out). The old event sounds (a blip per imagined frame, a knock per dead end, ...) are off by default;
# --sfx mixes them back in, quietly, under the music. Either way the result is set to LUFS by a two-pass loudnorm.
SR = 48000
LUFS = -18          # integrated loudness of the final soundtrack (EBU R128), true peak at most -1.5 dBTP


def _scene_starts():
    """{scene name: its first frame in seconds} (frame-exact, as rendered), and the video's length."""
    fr = np.cumsum([0] + [int(round(d * FPS)) for _, d, _, _ in SCENES]) / FPS
    return dict(zip([fn.__name__ for fn, _, _, _ in SCENES], fr)), float(fr[-1])


# --- the old event sounds (only with --sfx)
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
    starts = _scene_starts()[0]
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


# --- the background score
_PC = {n: i for i, n in enumerate("C C# D D# E F F# G G# A A# B".split())}
# chord: (pad voicing, bass root, arpeggio tones: root, fifth, octave, tenth, twelfth)
CHORDS = {
    "D":     ("A3 D4 F#4 A4", "D2", "D4 A4 D5 F#5 A5"),
    "A":     ("A3 C#4 E4 A4", "A2", "A3 E4 A4 C#5 E5"),
    "Asus4": ("A3 D4 E4 A4",  "A2", "A3 E4 A4 D5 E5"),
    "Bm7":   ("B3 D4 F#4 A4", "B2", "B3 F#4 B4 D5 F#5"),
    "Gadd9": ("B3 D4 G4 A4",  "G2", "G3 D4 A4 B4 D5"),
    "Em7":   ("B3 D4 E4 G4",  "E2", "E4 B4 D5 G5 B5"),
}
# under the hook: Bm7, then from the restart Gadd9, swelling into the first bar. Then one chord per bar from the search
# scene's first frame (a pair splits its bar); the last bar is the end card's
PROG = ["D", "A", "Bm7", "Gadd9", "D", "A", "Bm7", "Gadd9", "Em7", "Gadd9", "Bm7", "A", "Gadd9", ("Asus4", "A"), "D"]
GROOVE, LIFT = 4, 8     # the bars where the drums come in, and where the bells join and the kick goes to every beat
ARP = [0, 1, 2, 3, 4, 3, 2, 1]                               # the eighth-note pattern over the arpeggio tones
ARP_VEL = [1.0, 0.62, 0.78, 0.66, 0.86, 0.6, 0.74, 0.58]


def hz(note):
    """'F#4' -> 369.99 (A4 = 440 Hz)."""
    return 440.0 * 2 ** ((_PC[note[:-1]] + 12 * int(note[-1]) - 57) / 12)


def _bars():
    """(the first bar's time, the bar length): PROG runs from the search scene's first frame to the end card's."""
    st, _ = _scene_starts()
    t0 = st["sc_search"]; bar = (st["sc_end_fast"] - t0) / (len(PROG) - 1)
    assert 2.0 < bar < 2.7, f"bar of {bar:.2f} s: the tempo is off; change PROG's length"
    return t0, bar


def _segments(total):
    """[(start, end, chord)] over the whole video."""
    t0, bar = _bars()
    segs = [(0.0, HK_REW, "Bm7"), (HK_REW, t0, "Gadd9")]
    for b, ch in enumerate(PROG):
        s = t0 + b * bar; e = s + bar if b < len(PROG) - 1 else total
        segs += [(s, s + bar / 2, ch[0]), (s + bar / 2, e, ch[1])] if isinstance(ch, tuple) else [(s, e, ch)]
    return segs


def _chord_at(segs, t):
    return next((c for s, e, c in segs if s <= t + 1e-6 < e), segs[-1][2])


def _ramp(x):
    """0 -> 1, smoothly, as x goes 0 -> 1."""
    return np.sin(np.pi / 2 * np.clip(x, 0, 1)) ** 2


def _wavetable(f, rolloff, seed, size=4096):
    """One cycle of a band-limited saw whose harmonics fall off above `rolloff` Hz (for a tone at f Hz)."""
    x = np.arange(size) / size; rng = np.random.default_rng(seed)
    tab = sum(np.exp(-k * f / rolloff) / k * np.sin(2 * np.pi * k * x + rng.uniform(0, 2 * np.pi))
              for k in range(1, max(1, int(5000 / f)) + 1))
    return tab / np.abs(tab).max()


def _osc(tab, f, t):
    ph = (f * t) % 1.0 * len(tab); i = ph.astype(int); fr = ph - i
    return tab[i] * (1 - fr) + tab[(i + 1) % len(tab)] * fr


def _epiano(f, vel, ring=0.42):
    """A soft electric-piano note (two-operator FM, its brightness fading fast)."""
    n = int((ring + 0.45) * SR); t = np.arange(n) / SR
    idx = (0.9 + 1.6 * vel) * min(1.0, (330 / f) ** 0.5) * np.exp(-t / 0.45)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t)) + 0.1 * np.sin(8 * np.pi * f * t) * np.exp(-t / 0.12)
    return vel * y * np.minimum(1, t / 0.003) * np.exp(-t / 0.75) * (1 - _ramp((t - ring) / 0.45))


def _bell(f, vel, ring=2.2):
    """A celesta-like bell."""
    n = int(ring * SR); t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / d) for m, a, d in ((1, 1.0, ring / 3), (2, 0.2, 0.4), (3, 0.08, 0.2), (5.04, 0.04, 0.1)))
    return vel * y * np.minimum(1, t / 0.002) * (1 - _ramp((t - ring + 0.3) / 0.3))


def _bass(f, dur, vel, attack=0.012):
    n = int((dur + 0.12) * SR); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.1 * np.sin(6 * np.pi * f * t)
    return vel * y * _ramp(t / attack) * (0.72 + 0.28 * np.exp(-t / 0.3)) * (1 - _ramp((t - dur) / 0.12))


def _kick(vel):
    """A soft, round kick: a falling sine, no click."""
    n = int(0.42 * SR); t = np.arange(n) / SR
    f = 47 + 60 * np.exp(-t / 0.035)
    return vel * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.17) * _ramp(t / 0.002)


def _noise_band(n, lo, hi, seed):
    x = np.random.default_rng(seed).standard_normal(n)
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(n, 1 / SR)
    X *= (fr / lo) ** 4 / (1 + (fr / lo) ** 4) / (1 + (fr / hi) ** 4)
    y = np.fft.irfft(X, n)
    return y / np.abs(y).max()


def _hat(vel, seed, decay=0.022, attack=0.0008):
    n = int(0.12 * SR); t = np.arange(n) / SR
    return vel * _noise_band(n, 7000, 14000, seed) * _ramp(t / attack) * np.exp(-t / decay)


def _ir(rt60=2.4, pre=0.018, seed=3):
    """A stereo room: decaying noise, darker than the dry sound, one channel per side."""
    n = int(rt60 * 1.1 * SR); t = np.arange(n) / SR
    ir = np.random.default_rng(seed).standard_normal((2, n)) * np.exp(-6.9 * t / rt60)
    F = np.fft.rfft(ir, axis=1); F /= 1 + (np.fft.rfftfreq(n, 1 / SR) / 5000) ** 2
    ir = np.concatenate([np.zeros((2, int(pre * SR))), np.fft.irfft(F, n, axis=1)], axis=1)
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


def _reverb(x, ir):
    """The wet signal: the mid of x through each side's room."""
    mid = x.mean(axis=0) if x.ndim == 2 else x
    nfft = 1 << (len(mid) + ir.shape[1] - 2).bit_length()
    return np.fft.irfft(np.fft.rfft(mid, nfft)[None] * np.fft.rfft(ir, nfft, axis=1), nfft, axis=1)[:, :len(mid)]


def _place(bus, x, t, pan=0.0):
    """Add the mono sound x to the stereo bus at time t (equal-power pan, -1 left .. 1 right)."""
    i = int(round(t * SR)); j = max(0, -i)
    x = x[j:bus.shape[1] - i]
    if len(x) <= 0:
        return
    a = (pan + 1) * np.pi / 4
    bus[:, i + j:i + j + len(x)] += np.sqrt(2) * np.array([[np.cos(a)], [np.sin(a)]]) * x


def render_score(n):
    """The background music, (2, n) floats in [-1, 1]."""
    total = n / SR; t = np.arange(n) / SR
    t0, bar = _bars(); beat = bar / 4
    segs = _segments(total)
    rng = np.random.default_rng(11)
    pad, keys, bass, drums, bells = (np.zeros((2, n)) for _ in range(5))

    # pad: every pitch is one continuous voice, faded up while a chord holds it, so a shared note never restarts
    for p in sorted({p for _, _, c in segs for p in CHORDS[c][0].split()}, key=hz):
        env = np.zeros(n)
        for s, e, c in segs:
            if p in CHORDS[c][0].split():
                i0, i1 = int(s * SR), min(n, int((e + 0.45) * SR))
                tt = t[i0:i1]
                env[i0:i1] += _ramp((tt - s) / (0.8 if s == 0 else 0.3)) * (1 - _ramp((tt - e) / 0.45))
        env = np.minimum(env, 1); nz = np.nonzero(env)[0]; i0, i1 = nz[0], nz[-1] + 1
        f = hz(p)
        for ch, cents in enumerate(((-9, 2, 10), (-11, -2, 8))):   # three detuned voices a side: a slow chorus
            for j, c in enumerate(cents):
                pad[ch, i0:i1] += env[i0:i1] * _osc(_wavetable(f, 2500, int(f) + 7 * ch + j), f * 2 ** (c / 1200), t[i0:i1]) / 3
    pad *= 1 + 0.08 * np.sin(2 * np.pi * 0.17 * t)

    kicks = []
    for b in range(len(PROG) - 1):
        s = t0 + b * bar
        # the arpeggio, in eighths, ping-ponging a little
        for k in range(8):
            tt = s + k * bar / 8; c = _chord_at(segs, tt)
            vel = ARP_VEL[k] * (0.8 if b < GROOVE else 0.9 if b < LIFT else 1.0) * (1 + rng.normal(0, 0.05))
            _place(keys, _epiano(hz(CHORDS[c][2].split()[ARP[k]]), vel), tt + rng.normal(0, 0.004), 0.3 if k % 2 else -0.3)
        # bass: whole notes, then a gentle pattern once the drums are in
        pat = [(0, 3.85)] if b < GROOVE else [(0, 1.45), (1.5, 0.45), (2, 1.45), (3.5, 0.45)]
        for at, d in pat:
            _place(bass, _bass(hz(CHORDS[_chord_at(segs, s + at * beat)][1]), d * beat, 0.62 if b < GROOVE else 0.8), s + at * beat)
        # drums: the kick on 1 and 3 (every beat in the lift), hats on the off-beats, a shaker in sixteenths in the lift;
        # the last half-bar before the end card holds the kick back
        if b == 0:
            kicks.append((s, 0.55))
        if b >= GROOVE:
            for q in ((0, 1, 2, 3) if b >= LIFT else (0, 2)):
                if not (b == len(PROG) - 2 and q >= 2):
                    kicks.append((s + q * beat, (1.0, 0.7, 0.9, 0.7)[q]))
            for q in range(4):
                _place(drums, 0.32 * _hat(1.0, 100 + b * 4 + q), s + (q + 0.5) * beat + rng.normal(0, 0.003), 0.25)
            if b >= LIFT:
                for q in range(4):
                    for h in (0.25, 0.75):
                        _place(drums, 0.12 * _hat(1.0, 300 + b * 8 + q * 2 + int(h * 4), 0.04, 0.006), s + (q + h) * beat, -0.3)
        # bells in the lift: the tenth on beat 1, the twelfth on beat 3
        if b >= LIFT:
            for q, k in ((0, 3), (2, 4)):
                _place(bells, _bell(hz(CHORDS[_chord_at(segs, s + q * beat)][2].split()[k]), 0.5), s + q * beat, 0.2 if q else -0.2)
    # under the hook: a low held note per chord
    for s, e, c in segs[:2]:
        _place(bass, _bass(hz(CHORDS[c][1]), e - s, 0.4, attack=0.4), s)
    # the end card: the tonic, the kick, a quick bell arpeggio, all left to ring out
    s = t0 + (len(PROG) - 1) * bar
    kicks.append((s, 0.85))
    _place(bass, _bass(hz("D2"), total - s, 0.8), s)
    for k, p in enumerate(("D5", "F#5", "A5", "D6")):
        _place(bells, _bell(hz(p), 0.55 - 0.05 * k), s + 0.07 * k, (-0.3, -0.1, 0.1, 0.3)[k])
    for tk, vel in kicks:
        _place(drums, _kick(vel), tk)
    # into the first bar: a reversed room on the first bar's chord, swelling up to its downbeat
    dry = np.zeros((2, int(1.8 * SR)))
    for p in CHORDS["D"][2].split()[2:]:
        _place(dry, _bell(hz(p), 0.5), 0.0)
    sw = _reverb(dry, _ir(2.0, 0.0, 5))[:, ::-1] * _ramp(np.arange(dry.shape[1]) / (0.6 * SR))
    swell = np.zeros((2, n)); i = int(round(t0 * SR)) - sw.shape[1]
    swell[:, max(0, i):i + sw.shape[1]] = sw[:, max(0, -i):]

    # the kick ducks the pad, the keys and the bass a little
    duck = np.ones(n)
    for tk, vel in kicks:
        i = int(tk * SR); m = min(n - i, int(0.5 * SR))
        duck[i:i + m] = np.minimum(duck[i:i + m], 1 - 0.22 * vel * np.exp(-np.arange(m) / (0.13 * SR)))
    pad *= duck; keys *= duck; bass *= duck

    ir = _ir()
    mix = 0.17 * pad + 0.3 * keys + 0.3 * bass + 0.42 * drums + 0.24 * bells + 0.18 * swell
    mix += _reverb(0.17 * 0.3 * pad + 0.3 * 0.45 * keys + 0.24 * 0.6 * bells + 0.42 * 0.06 * drums, ir)
    # no rumble below 30 Hz; fade in over the first moment and out over the last 1.5 s (the video loops)
    F = np.fft.rfft(mix, axis=1); fr = np.fft.rfftfreq(n, 1 / SR); F *= (fr / 30) ** 4 / (1 + (fr / 30) ** 4)
    mix = np.fft.irfft(F, n, axis=1)
    mix *= _ramp(t / 0.05) * (1 - _ramp((t - (total - 1.5)) / 1.5))
    mix /= np.abs(mix).max()
    return np.tanh(mix) / np.tanh(1.0)     # a gentle limit on the peaks


def load_track(path, n):
    """The track at `path` as (2, n) floats: decoded by ffmpeg, looped (with a 1 s crossfade) or trimmed to n samples,
    faded in over 0.5 s and out over the last 2 s."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, "<f4").reshape(-1, 2).T.astype(float)
    xf = int(1.0 * SR)
    if x.shape[1] <= 2 * xf:
        raise SystemExit(f"{path}: too short to loop")
    out = x
    while out.shape[1] < n:
        w = _ramp(np.arange(xf) / xf)
        out = np.concatenate([out[:, :-xf], out[:, -xf:] * (1 - w) + x[:, :xf] * w, x[:, xf:]], axis=1)
    out = out[:, :n]; t = np.arange(n) / SR
    return out * _ramp(t / 0.5) * (1 - _ramp((t - (n / SR - 2.0)) / 2.0))


def render_audio(path, total, music=None, sfx=False):
    """The soundtrack as a 16-bit stereo WAV of exactly `total` seconds: the synthesised score, or the track at `music`;
    with sfx, the old event sounds under it (their peaks 10 dB below the music's)."""
    n = int(round(total * SR))
    out = load_track(music, n) if music else render_score(n)
    out = out / max(1e-9, np.abs(out).max())
    if sfx:
        fx = np.zeros(n)
        for t, x in audio_events():
            i = int(t * SR)
            if 0 <= i < n:
                fx[i:i + len(x)] += x[:n - i]
        out = out + 0.32 * fx / max(1e-9, np.abs(fx).max())
    out *= 0.89 / max(1e-9, np.abs(out).max())   # peak at -1 dBFS; the loudness is set when it is muxed
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((out.T * 32767).astype("<i2").tobytes())


def _loudnorm(wav):
    """The ffmpeg filter that sets the WAV to LUFS (true peak at most -1.5 dBTP): measured in a first pass, so the gain
    is one constant and the music's own dynamics are kept."""
    base = f"loudnorm=I={LUFS}:TP=-1.5:LRA=20"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", wav, "-af", base + ":print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True, check=True)
    m = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
    return (f"{base}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
            f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")


def _audio_args(wav):
    return ["-af", _loudnorm(wav), "-ar", str(SR), "-c:a", "aac", "-b:a", "160k"]


def render_video(out, audio=True, music=None, sfx=False):
    total = _scene_starts()[1]
    wav = out + ".wav"
    if audio:
        render_audio(wav, total, music, sfx)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    cmd += ["-i", wav, "-map", "0:v", "-map", "1:a"] + _audio_args(wav) + ["-shortest"] if audio else []
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
    render_poster(out)


def render_soundtrack(out, music=None, sfx=False):
    """Replace only the soundtrack of an existing render, keeping its frames: seconds instead of minutes."""
    if not os.path.exists(out):
        raise SystemExit(f"{out}: no render to put the soundtrack on; render the video first")
    total = _scene_starts()[1]
    wav, tmp = out + ".wav", out + ".tmp.mp4"
    render_audio(wav, total, music, sfx)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", out, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy"]
                   + _audio_args(wav) + ["-shortest", "-movflags", "+faststart", tmp], check=True)
    os.replace(tmp, out); os.remove(wav)
    print("soundtrack ->", out, os.path.getsize(out) // 1024, "KB")


def render_poster(out):
    """The poster beside the video (NAME_poster.webp): the end of the search scene, where every imagined plan and dead end
    is in view above the solved real board. For the site's own teaser it is also the share image (og:image), as a JPEG."""
    im = frame(sc_search, SEARCH_DUR - 0.6, SEARCH_DUR, False, True)
    poster = os.path.splitext(out)[0] + "_poster.webp"
    im.save(poster, quality=85, method=6)
    print("poster ->", poster)
    if os.path.abspath(out) == os.path.abspath(OUT):
        og = f"{SITE}/images/agima_og.jpg"
        im.save(og, quality=88, optimize=True, progressive=True)
        print("share image ->", og)


def render_stills(outdir):
    os.makedirs(outdir, exist_ok=True)
    for k, (fn, dur, fi, fo) in enumerate(SCENES):
        for frac in (0.2, 0.45, 0.7, 0.95):
            frame(fn, dur * frac, dur, fi, fo).save(f"{outdir}/{k:02d}_{fn.__name__}_{int(frac * 100)}.png")
    print("stills ->", outdir)


# ================================================================== clips for the project page
# Short silent loops, one per figure on the page, in the teaser's visual language: imagined boards are blue-tinted with a
# dashed blue outline, dead ends turn red and jolt, acted moves are solid green. Rendered one at a time with --clip.
DEAD_TINT = (255, 205, 195)


def _crop(im, rows):
    """Rows r0..r1-1 of an 8x8 board image (32 px tiles)."""
    return im if tuple(rows) == (0, 8) else im.crop((0, rows[0] * 32, im.width, rows[1] * 32))


def _tint(im, kind):
    if kind == "imag":
        return Image.blend(im, Image.new("RGB", im.size, IMAG_TINT), 0.16)
    if kind == "dead":
        return Image.blend(im, Image.new("RGB", im.size, DEAD_TINT), 0.26)
    return im


def bcard(v, im, cx, cy, w, h, a=1.0, kind="real", scale=1.0, col=None, r=12):
    """A board card: 'real' (solid ink), 'imag' (blue tint, dashed blue), 'dead' (red tint, dashed red), 'done' (solid
    green), 'jam' (a real board that jammed: solid red)."""
    if a <= 0:
        return
    col = col or {"real": INK, "imag": ACCENT, "dead": RED, "done": GREEN, "jam": RED}[kind]
    v.card(_tint(im, kind), cx, cy, h, a, scale, r=r, nearest=True, outline=col, dashed=kind in ("imag", "dead"), sx=w / h)


def _cell(cx, cy, w, h, rows, rc):
    """Screen centre of board cell rc on a card of w x h showing rows[0].. of the board."""
    cs = w / 8
    return cx - w / 2 + (rc[1] + 0.5) * cs, cy - h / 2 + (rc[0] - rows[0] + 0.5) * cs


def jam_ring(v, x, y, cs, p, a=1.0):
    """A red ring that closes in on a jammed box."""
    if p <= 0 or a <= 0:
        return
    rr = cs * 0.62 + cs * 0.8 * (1 - ease_out(p))
    v.d.ellipse(v.z(x - rr, y - rr, x + rr, y + rr), outline=fade(RED, ease_out(p) * a), width=4 * Z)


def jolt(t, t0, amp=9.0):
    """The sideways shake of a board that just deadlocked."""
    jt = t - t0
    return amp * np.sin(jt * 50) * np.exp(-7 * jt) if 0 < jt < 0.55 else 0.0


@contextmanager
def on_white():
    """Inside, fade() fades toward white rather than the page colour: for marks drawn on a white panel, which would
    otherwise pass through beige as they fade."""
    old = V2.BG; V2.BG = WHITE
    try:
        yield
    finally:
        V2.BG = old


def panel(v, box, a, r=26):
    """Nothing: the clips' rows once sat on white cards; they are now set straight on the white ground."""
    return


def head2(v, x, y, title, col, sub, a, size=30):
    """A title in ink, with an optional muted remark after it, on one line (col is ignored: the boards' outlines carry
    the outcome colours)."""
    if a <= 0:
        return
    f = face(size * Z, b"Bold")
    v.text((x, y), title, f, fade(INK, a), "ls")
    if sub:
        v.text((x + v.tlen(title + "  ", f), y), sub, face(int(size * 0.72) * Z), fade(MUTED, a), "ls")


def cpill(v, cx, cy, label, col, ok, a, size=20):
    """An outcome label (check or cross, then the word) centred on (cx, cy)."""
    if a <= 0:
        return
    w = v.tlen(label, face(size * Z, b"SemiBold")) + (0 if ok is None else size + 4)
    v.pill(cx - w / 2, cy, label, col, ok, a, size=size)


def move_tag(v, x, y, moves, t, t0, step, col, scale, until=None):
    """The action tag of the move being made at t; each pops in as its move starts. The last one stays until `until`."""
    if t < t0 or not moves:
        return
    k = int((t - t0) / step)
    end = until if until is not None else t0 + step * len(moves)
    if t >= end + 0.25:
        return
    k = min(k, len(moves) - 1)
    pa = prog(t, t0 + k * step, POP_A)
    a = ease_out(pa) * (1 - ease_out(prog(t, end, 0.25)))
    action_tag(v, x, y, moves[k], col, a, pop_r(pa, 16 * scale) / 16)


def rewind_pill(v, x, y, a, s=1.0):
    """'rewind' after a double back-arrow, centred on (x, y), in ink on a small flat white tag; scaled by s."""
    if a <= 0:
        return
    f = face(int(16 * Z * s), b"SemiBold")
    w = (16 + 6) * s + v.tlen("rewind", f)
    x0 = x - w / 2
    col = fade(INK, a)
    tag_ground(v, (x0 - 5 * s, y - 11 * s, x0 + w + 5 * s, y + 11 * s), a)
    for dx in (0, 8):
        v.head(x0 + (6 + dx) * s, y, col, (-1, 0), 6 * s)
    v.text((x0 + (16 + 6) * s, y + 0.5), "rewind", f, col, "lm")


def small_arrow(v, a, b, col, al=1.0, dashed=True):
    if al <= 0:
        return
    d = np.subtract(b, a); u = d / max(float(np.hypot(*d)), 1e-6)
    v.line([a, tuple(np.subtract(b, u * 5))], fade(col, al), 2, dash=(5, 4) if dashed else None)
    v.head(b[0], b[1], fade(col, al), tuple(u), 7)


# --- planning traps (Sokoban): without imagination the tempting push jams; Agima imagines it first, sees the deadlock,
# rewinds and plays out another route in imagination, then acts on it
TP_S, TP_Y = 340, 372                                     # board width on screen, board centre height
TP_L, TP_R = (36, 44, 436, 684), (466, 44, 1244, 684)     # the two panels
TP_XL, TP_XR, TP_XI = 236, 666, 1044                      # without imagination; Agima's real board; Agima's imagined one


def _trap(board, tempt, sol, rows):
    st, ss = board.states(tempt), board.states(sol)
    assert not _solvable_on(board.S, *st[-1]) and _solvable_on(board.S, *st[-2]), tempt
    T = dict(go=0.9, step=0.42, fast=0.11)
    T["jam"] = T["go"] + len(tempt) * T["step"]          # the tempting push lands: deadlock
    T["rw0"] = T["jam"] + 0.85                            # Agima rewinds its imagined push...
    T["rw1"] = T["rw0"] + max(0.35, 0.16 * len(tempt))
    T["is0"] = T["rw1"] + 0.3                             # ...imagines another route to the end...
    T["is1"] = T["is0"] + len(sol) * T["fast"]
    T["act0"] = T["is1"] + 0.5                            # ...and acts on it
    T["act1"] = T["act0"] + len(sol) * T["fast"]
    T["dur"] = T["act1"] + 2.1
    return dict(board=board, tempt=tempt, st=st, ss=ss, rows=rows, T=T, box=next(iter(st[-1][1] - st[-2][1])))


def _solvable_on(S, p, boxes):
    """BFS over pushes: can this level still be solved from (p, boxes)?"""
    def reach(p, bx):
        seen = {p}; q = deque([p])
        while q:
            r, c = q.popleft()
            for dr, dc in DIRS:
                n = (r + dr, c + dc)
                if n not in seen and n not in S.walls and n not in bx:
                    seen.add(n); q.append(n)
        return seen
    start = (min(reach(p, boxes)), boxes); seen = {start}; q = deque([(p, boxes)])
    while q:
        pp, bb = q.popleft()
        if bb <= S.goals:
            return True
        R = reach(pp, bb)
        for b in bb:
            for dr, dc in DIRS:
                stand, to = (b[0] - dr, b[1] - dc), (b[0] + dr, b[1] + dc)
                if stand in R and to not in S.walls and to not in bb:
                    nb = frozenset((bb - {b}) | {to}); k = (min(reach(b, nb)), nb)
                    if k not in seen:
                        seen.add(k); q.append((b, nb))
    return False


TRAP_DEAD = _trap(BOARD, ["down", "left"], V2.SOLVE_MOVES, (0, 8))
TRAP_FORK = _trap(FORK_B, ["up"], V2.T.FORK.solve(), (3, 8))   # the fork's play area: rows 3-7 (8:5)


def _trap_pair(v, t, P):
    pl, pr = ease_out(prog(t, 0.0, 0.4)), ease_out(prog(t, 0.1, 0.4))
    panel(v, TP_L, pl); panel(v, TP_R, pr)
    with on_white():
        _trap_pair_marks(v, t, P, pl, pr)


def _trap_pair_marks(v, t, P, pl, pr):
    T, b, rows = P["T"], P["board"], P["rows"]
    w = TP_S; h = TP_S * (rows[1] - rows[0]) / 8; cs = w / 8
    top, bot = TP_Y - h / 2, TP_Y + h / 2
    tag_y, ver_y = bot + 36, bot + 98
    jam = T["jam"]
    head2(v, TP_L[0] + 30, 104, "Without imagination", INK, None, pl, size=33)
    head2(v, TP_R[0] + 30, 104, "Agima", ACCENT, "imagines first", pr, size=33)

    # left: the tempting push, made for real
    jx = jolt(t, jam)
    im = b.at(P["st"], t - T["go"], T["step"])
    bcard(v, _crop(im, rows), TP_XL + jx, TP_Y, w, h, pl, "jam" if t >= jam else "real")
    v.pill(TP_XL - w / 2, top - 26, "real board", INK, None, pl, size=17)
    jam_ring(v, *_cell(TP_XL + jx, TP_Y, w, h, rows, P["box"]), cs, prog(t, jam, 0.5))
    v.stamp(TP_XL + w / 2 + jx, top, False, prog(t, jam + 0.12, 0.3), r=22)
    move_tag(v, TP_XL, tag_y, P["tempt"], t, T["go"], T["step"], INK, 1.6, until=jam + 0.5)
    cpill(v, TP_XL, ver_y, "deadlock", RED, False, ease_out(prog(t, jam + 0.35, 0.3)), 24)

    # right: Agima's real board waits while it imagines, then acts on the plan that worked
    acting = t >= T["act0"]
    im = b.at(P["ss"], t - T["act0"], T["fast"])
    bcard(v, _crop(im, rows), TP_XR, TP_Y, w, h, pr, "done" if acting else "real")
    v.pill(TP_XR - w / 2, top - 26, "real board", INK, None, pr, size=17)
    v.stamp(TP_XR + w / 2, top, True, prog(t, T["act1"], 0.3), r=22)
    cpill(v, TP_XR, ver_y, "solved", GREEN, True, ease_out(prog(t, T["act1"] + 0.15, 0.3)), 24)
    small_arrow(v, (TP_XR + w / 2 + 8, TP_Y), (TP_XI - w / 2 - 8, TP_Y), ACCENT, pr * 0.8)
    # ...and the board it imagines: the tempting push first (a dead end), rewound, then another route
    if t < T["rw0"]:
        im = b.at(P["st"], t - T["go"], T["step"])
    elif t < T["is0"]:
        im = b.at(P["st"][::-1], t - T["rw0"], (T["rw1"] - T["rw0"]) / len(P["tempt"]))
    else:
        im = b.at(P["ss"], t - T["is0"], T["fast"])
    dead = jam <= t < T["rw0"] + 0.08
    ip = prog(t, T["go"] - 0.45, 0.35)
    ijx = jolt(t, jam)
    bcard(v, _crop(im, rows), TP_XI + ijx, TP_Y, w, h, ease_out(ip) * pr, "dead" if dead else "imag", 0.85 + 0.15 * back_out(ip))
    v.pill(TP_XI - w / 2, top - 26, "imagined", ACCENT, None, ease_out(ip) * pr, size=17)
    if dead:
        jam_ring(v, *_cell(TP_XI + ijx, TP_Y, w, h, rows, P["box"]), cs, prog(t, jam, 0.5))
    if t < T["rw0"] + 0.3:
        v.stamp(TP_XI + w / 2 + ijx, top, False, prog(t, jam + 0.12, 0.3) * (1 - prog(t, T["rw0"], 0.3)), r=22)
    v.stamp(TP_XI + w / 2, top, True, prog(t, T["is1"], 0.3), r=22)
    move_tag(v, TP_XI, tag_y, P["tempt"], t, T["go"], T["step"], RED if dead else ACCENT, 1.6, until=T["rw0"] - 0.1)
    ra = min(ease_out(prog(t, T["rw0"], 0.15)), 1 - ease_out(prog(t, T["rw1"] + 0.1, 0.2)))
    rewind_pill(v, TP_XI, tag_y, ra, 1.5)


def sc_trap_deadlock(v, t, dur):
    _trap_pair(v, t, TRAP_DEAD)


def sc_trap_fork(v, t, dur):
    _trap_pair(v, t, TRAP_FORK)


# --- Pacman route-order trap: the real episodes of the linear rollout (nearer food first, caught by the ghost) and of
# forward thinking (farther food first, all food eaten), side by side with glowing trails
def _pac_path(frames):
    pts = []
    for f in frames:
        a = np.asarray(f).astype(int)
        m = (a[..., 0] > 200) & (a[..., 1] > 190) & (a[..., 2] < 90)
        ys, xs = np.nonzero(m)
        pts.append((xs.mean() / a.shape[1], ys.mean() / a.shape[0]) if len(xs) else pts[-1])
    return pts


def _pac_food(frame):
    """The food pellets on a frame, nearest to Pacman first (as fractions of the frame)."""
    import cv2
    a = np.asarray(frame)
    n, _, st, cen = cv2.connectedComponentsWithStats((a.min(2) > 200).astype(np.uint8))
    food = [cen[i] / a.shape[1] for i in range(1, n) if 9 <= st[i][2] <= 13 and 9 <= st[i][3] <= 13 and st[i][4] > 60]
    me = np.array(_pac_path([frame])[0])
    return sorted(food, key=lambda f: np.abs(f - me).sum())


PAC_FOOD = _pac_food(V2.PAC_LIN[0])
assert len(PAC_FOOD) == 2
# (frames, title, remark, trail colour, verdict, solved, the food it goes for first, the frame that food is eaten on)
PAC_CLIPS = [(V2.PAC_LIN, "Linear rollout", "nearer food first", RED, "caught by the ghost", False, PAC_FOOD[0], 3),
             (V2.PAC_FWD, "Forward thinking", "farther food first", ACCENT, "all food eaten", True, PAC_FOOD[1], 5)]
PAC_PATHS = [_pac_path(c[0]) for c in PAC_CLIPS]
PAC_S, PAC_Y, PAC_STEP, PAC_GO = 430, 382, 0.32, 1.0
PAC_PANELS = [(36, 44, 622, 684), (658, 44, 1244, 684)]
PAC_DUR = PAC_GO + (max(len(c[0]) for c in PAC_CLIPS) - 1) * PAC_STEP + 2.3


def sc_trap_pacman(v, t, dur):
    for i, box in enumerate(PAC_PANELS):
        p = ease_out(prog(t, 0.1 * i, 0.4))
        panel(v, box, p)
        with on_white():
            _pac_marks(v, t, i, p, box)


def _pac_marks(v, t, i, p, box):
    s = PAC_S
    (frames, title, sub, col, verdict, ok, food, eaten), path = PAC_CLIPS[i], PAC_PATHS[i]
    head2(v, box[0] + 30, 104, title, ACCENT if ok else INK, sub, p, size=33)
    cx = (box[0] + box[2]) / 2; cy = PAC_Y
    tt = max(0.0, t - PAC_GO) / PAC_STEP
    k = min(len(frames) - 1, int(tt))
    end = k == len(frames) - 1
    v.card(frames[k], cx, cy, s, p, r=12, outline=(GREEN if ok else RED) if end else None)
    to_s = lambda q: (cx - s / 2 + q[0] * s, cy - s / 2 + q[1] * s)
    # the food it goes for first, ringed until it is eaten
    ra = ease_out(prog(t, 0.45, 0.35)) * p * (1 - ease_out(prog(t, PAC_GO + eaten * PAC_STEP - 0.12, 0.2)))
    if ra > 0:
        fx, fy = to_s(food); rr = 24 + 14 * (1 - ease_out(prog(t, 0.45, 0.5)))
        v.d.ellipse(v.z(fx - rr, fy - rr, fx + rr, fy + rr), outline=fade(col, ra), width=5 * Z)
    # the route so far, glowing
    u = min(tt, len(path) - 1); n = int(u); f = u - n
    pts = path[:n + 1] + ([(path[n][0] + (path[n + 1][0] - path[n][0]) * f, path[n][1] + (path[n + 1][1] - path[n][1]) * f)]
                          if n + 1 < len(path) else [])
    sp = [to_s(q) for q in pts]
    if len(sp) >= 2 and t > PAC_GO:
        glow_line(v, sp, col, 4, 11, 1.0)
        glow_dot(v, sp[-1][0], sp[-1][1], 8, col)
    if end:
        te = PAC_GO + (len(frames) - 1) * PAC_STEP
        if not ok:   # the capture: the ghost is drawn under Pacman on the last frame, so ring the cell where they meet
            jam_ring(v, *to_s(path[-1]), s / 8, prog(t, te, 0.5))
        v.stamp(cx + s / 2, cy - s / 2, ok, prog(t, te, 0.35), r=24)
        cpill(v, cx, cy + s / 2 + 52, verdict, GREEN if ok else RED, ok, ease_out(prog(t, te + 0.1, 0.3)), 22)


# --- the fork, before and after RL (an illustration on the page's fork trap, not a recorded run). Both models branch
# (Fig. 6c); what RL changes is where: more branches land on critical steps like this fork (Fig. 6d). So before RL it
# has no branch at this fork and takes the risky push; after RL it branches here, sees that push fail, takes the safe way
FK_ROWS = (3, 8)
FK_H = 130; FK_W = FK_H * 8 / 5
FK_X = (172, 480, 788, 1096)
FK_PANELS = ((36, 74, 1244, 292), (36, 308, 1244, 700))   # before RL, after RL
FK_YA, FK_YB, FK_YR, FK_YS = 200, 522, 440, 618    # before RL; after RL: the real board, the risky branch, the safe way
FK_SAFE = [1, 2, len(FORK_SOL) - 1]                 # the states imagined on the safe way (the last link skips ahead)
FK_STEP = 0.12                                      # one acted move
FK = dict(a_go=0.95, a_push=0.35, b_go=2.6, die=3.05, rw0=3.5, rw1=4.1, s_go=4.35, s_step=0.26, act=5.75)
FK["s_ok"] = FK["s_go"] + 2 * FK["s_step"] + 0.45
FK["act1"] = FK["act"] + FK_STEP * (len(FORK_SOL) - 1)
FK_DUR = FK["act1"] + 2.2


FORK_SOL_MOVES = V2.T.FORK.solve()


def _fk(state):
    return _crop(FORK_B.draw(state), FK_ROWS)


def _partial(pts, f):
    """The first fraction f of a polyline (by length)."""
    if f <= 0:
        return pts[:1]
    pts = np.array(pts, float)
    seg = np.hypot(*np.diff(pts, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
    L = cum[-1] * clamp(f)
    k = int(np.searchsorted(cum, L, side="right"))
    out = [tuple(p) for p in pts[:k]]
    if k < len(pts):
        s = (L - cum[k - 1]) / max(seg[k - 1], 1e-6)
        out.append(tuple(pts[k - 1] + (pts[k] - pts[k - 1]) * s))
    return out


def _fk_tag(v, x, y, move, col, pa):
    action_tag(v, x, y, move, col, ease_out(pa), pop_r(pa, 16 * 1.5) / 16)


def sc_clip_fork(v, t, dur):
    pa_ = pb_ = la = 1.0   # panels and legend are there from the first frame, so the clip plays at once
    panel(v, FK_PANELS[0], pa_); panel(v, FK_PANELS[1], pb_)
    # legend, above the panels on the right
    x = 1220
    for lab, col, dashed in (("acted", GREEN, False), ("dead end", RED, True), ("imagined", ACCENT, True)):
        fl = face(21 * Z)
        x -= v.tlen(lab, fl)
        v.text((x, 47), lab, fl, fade(MUTED, la), "lm")
        x -= 34
        if dashed:
            v.dashed_rect((x, 37, x + 24, 57), 5, fade(col, la), on=4, off=3)
        else:
            v.rrect((x, 37, x + 24, 57), 5, outline=fade(col, la), width=3)
        x -= 30
    with on_white():
        _fork_marks(v, t, pa_, pb_)


def _fork_marks(v, t, pa_, pb_):
    w, h = FK_W, FK_H
    # ---- before RL: no branch at this fork; it takes the risky push for real, and the puzzle jams
    head2(v, 68, 118, "Before RL", RED, "no branch at this fork", pa_, size=32)
    bcard(v, _fk(FORK_SOL[0]), FK_X[0], FK_YA, w, h, pa_, "real")
    ta = FK["a_go"]; jam = ta + 0.1 + FK["a_push"]
    a0, a1 = (FK_X[0] + w / 2 + 8, FK_YA), (FK_X[1] - w / 2 - 8, FK_YA)
    q = ease_out(prog(t, ta, 0.2))
    if q > 0:
        v.line([a0, (a0[0] + (a1[0] - a0[0]) * q, FK_YA)], INK, 3)
        _fk_tag(v, (a0[0] + a1[0]) / 2, FK_YA, "up", INK, prog(t, ta, POP_A))
        p = prog(t, ta + 0.1, POP_F)
        jx = jolt(t, jam)
        bcard(v, _crop(FORK_B.at(FORK_WRONG, t - ta - 0.1, FK["a_push"]), FK_ROWS), FK_X[1] + jx, FK_YA, w, h, ease_out(p),
              "jam" if t >= jam else "real", 0.85 + 0.15 * back_out(p))
        jam_ring(v, *_cell(FK_X[1] + jx, FK_YA, w, h, FK_ROWS, next(iter(FORK_WRONG[1][1] - FORK_WRONG[0][1]))), w / 8,
                 prog(t, jam, 0.5))
        v.stamp(FK_X[1] + w / 2 + jx, FK_YA - h / 2, False, prog(t, jam + 0.1, 0.3), r=17)
        cpill(v, FK_X[2], FK_YA, "deadlock", RED, False, ease_out(prog(t, jam + 0.2, 0.3)), 30)

    # ---- after RL: it branches at the fork first
    head2(v, 68, 352, "After RL", GREEN, "branches at the fork first", pb_, size=32)
    mc = clamp((t - FK["act"]) / (FK_STEP * (len(FORK_SOL) - 1))) * (len(FORK_SOL) - 1)   # moves acted so far
    acting = t >= FK["act"]
    real_b = (FK_X[0], FK_YB)
    # the real board stays at the fork; once the plan works it is acted on from here (solid green)
    bcard(v, _fk(FORK_SOL[0]), real_b[0], real_b[1], w, h, pb_, "done" if acting else "real")
    v.pill(real_b[0] - w / 2, real_b[1] - h / 2 - 24, "real board", MUTED, None, pb_, size=20)
    # the risky branch: imagined, found dead, rewound
    die = ease_out(prog(t, FK["die"], 0.3)); rwd = ease_out(prog(t, FK["rw1"], 0.3))
    r0, r1 = (real_b[0] + w / 2 + 8, FK_YB - 22), (FK_X[1] - w / 2 - 8, FK_YR)
    br = V2.bezier(r0, r1, 30, 0.5)
    pa = prog(t, FK["b_go"], POP_A)
    rcol = RED if die > 0.5 else ACCENT
    if pa > 0:
        v.pline(br, ease_out(pa), fade(rcol, 0.75 * (1 - 0.45 * rwd)), 2, dash=(6, 5))
        p = prog(t, FK["b_go"] + ACT_LAG, POP_F)
        jx = jolt(t, FK["die"])
        bcard(v, _fk(FORK_WRONG[-1]), FK_X[1] + jx, FK_YR, w, h, ease_out(p) * (1 - 0.45 * rwd), "dead" if die > 0.5 else "imag",
              0.85 + 0.15 * back_out(p))
        if die > 0:
            v.stamp(FK_X[1] + w / 2 + jx, FK_YR - h / 2, False, prog(t, FK["die"], 0.25) * (1 - 0.45 * rwd), r=17)
    # the safe way: imagined step by step to the end, then acted on (the links glow green as the moves are made)
    links = [V2.bezier((real_b[0] + w / 2 + 8, FK_YB + 22), (FK_X[1] - w / 2 - 8, FK_YS), 30, 0.5),
             [(FK_X[1] + w / 2 + 8, FK_YS), (FK_X[2] - w / 2 - 8, FK_YS)],
             [(FK_X[2] + w / 2 + 8, FK_YS), (FK_X[3] - w / 2 - 8, FK_YS)]]
    for k, (si, link) in enumerate(zip(FK_SAFE, links)):
        ta = FK["s_go"] + FK["s_step"] * k + (0.12 if k == 2 else 0)
        pa = prog(t, ta, POP_A if k < 2 else 0.3)
        if pa <= 0:
            continue
        done = mc >= si
        prev = FK_SAFE[k - 1] if k else 0
        if mc > prev:
            glow_line(v, _partial(link, clamp((mc - prev) / (si - prev))), GREEN, 3, 9, 1.0)
        if not done:
            v.pline(link, ease_out(pa), fade(ACCENT, 0.75), 2, dash=(6, 5))
        mx, my = _along(link, 0.5)
        if k < 2:
            _fk_tag(v, mx, my, FORK_SOL_MOVES[si - 1], GREEN if done else ACCENT, pa)
        else:   # the rest of the way, skipped over: three dots
            for j in (-1, 0, 1):
                dx_ = mx + 12 * j
                v.d.ellipse(v.z(dx_ - 4, my - 4, dx_ + 4, my + 4), fill=fade(GREEN if done else ACCENT, ease_out(pa)))
        p = prog(t, ta + ACT_LAG, POP_F)
        bcard(v, _fk(FORK_SOL[si]), FK_X[k + 1], FK_YS, w, h, ease_out(p), "done" if done else "imag", 0.85 + 0.15 * back_out(p))
    v.stamp(FK_X[3] + w / 2, FK_YS - h / 2, True, prog(t, FK["s_ok"], 0.3), r=17)
    cpill(v, FK_X[3], FK_YS - h / 2 - 36, "solved", GREEN, True, ease_out(prog(t, FK["act1"] + 0.1, 0.3)), 30)
    # the risky push's action tag
    pa = prog(t, FK["b_go"], POP_A)
    if pa > 0:
        mx, my = _along(br, 0.5)
        _fk_tag(v, mx, my, "up", rcol, pa)
    # the rewind runs back along the dead branch, to the real board (drawn last, on top of the tags)
    rw = prog(t, FK["rw0"], FK["rw1"] - FK["rw0"])
    if 0 < rw < 1:
        path = [(FK_X[1], FK_YR)] + br[::-1]
        x, y = _along(path, ease_io(rw))
        ra = min(ease_out(rw / 0.15), ease_out((1 - rw) / 0.2))
        glow_dot(v, x, y, 16, INK, 0.5 * ra)
        rewind_pill(v, x, y - 40, ra, 1.3)


CLIPS = {  # name: (scene, duration in s, poster time in s, what it shows)
    "clip_method": (sc_search, SEARCH_DUR, SEARCH_DUR - 0.6, "the Sokoban imagination scene: imagine step by step, rewind dead ends, act"),
    "clip_format": (sc_emerge_page, (EM_COMMIT + 2.4) * EM_SLOW, 11.9, "a new format emerges after RL (no curve: the page charts Fig. 6b)"),
    "clip_fork": (sc_clip_fork, FK_DUR, FK_DUR - 1.0, "the fork before and after RL (illustration)"),
    "clip_trap_deadlock": (sc_trap_deadlock, TRAP_DEAD["T"]["dur"], TRAP_DEAD["T"]["dur"] - 1.0,
                           "deadlock trap: without imagination vs Agima"),
    "clip_trap_fork": (sc_trap_fork, TRAP_FORK["T"]["dur"], TRAP_FORK["T"]["dur"] - 1.0, "fork trap: without imagination vs Agima"),
    "clip_trap_pacman": (sc_trap_pacman, PAC_DUR, PAC_DUR - 1.0, "Pacman route-order trap: linear rollout vs forward thinking"),
}


def render_clip(name, out=None, crf=25):
    """One clip, silent, fading in from and out to the background so it loops cleanly; plus a .webp poster beside it."""
    fn, dur, t_poster, _ = CLIPS[name]
    out = out or f"{SITE}/video/{name}.mp4"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-an", "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(round(dur * FPS))
    for i in range(n):
        ff.stdin.write(frame(fn, i / FPS, dur, False, True).tobytes())   # no fade-in: frame 0 is content
    ff.stdin.close(); ff.wait()
    poster = os.path.splitext(out)[0] + ".webp"
    frame(fn, t_poster, dur).save(poster, quality=85, method=6)
    print(f"{name}: {n} frames, {n / FPS:.1f} s -> {out} ({os.path.getsize(out) // 1024} KB), poster {poster}")


def render_clip_stills(name, outdir, n=8):
    os.makedirs(outdir, exist_ok=True)
    fn, dur, _, _ = CLIPS[name]
    for k in range(n):
        t = dur * (k + 0.5) / n
        frame(fn, t, dur).save(f"{outdir}/{name}_{t:05.2f}.png")
    print("stills ->", outdir)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Render the Agima teaser video, or one of the page's clips.")
    ap.add_argument("-o", "--out", default=None, help="output .mp4 (default: the site's assets/video/agima_teaser_v3.mp4, "
                                                      "or assets/video/NAME.mp4 with --clip)")
    ap.add_argument("--stills", metavar="DIR", help="save preview stills of every scene (or of the clip) to DIR instead of rendering")
    ap.add_argument("--no-audio", action="store_true", help="render without a soundtrack (no music)")
    ap.add_argument("--music", metavar="PATH", help="background music to use instead of the built-in synthesised score: any "
                                                    "audio file ffmpeg reads, looped or trimmed to the video and faded in "
                                                    "and out (credit it on the page if its licence asks for that)")
    ap.add_argument("--sfx", action="store_true", help="also mix the old event sounds (blips, knocks, swooshes, dings) in, "
                                                       "quietly, under the music")
    ap.add_argument("--audio-only", action="store_true", help="replace only the soundtrack of an existing render (the "
                                                              "site's teaser, or -o), keeping its frames")
    ap.add_argument("--clip", metavar="NAME", help="render one silent clip for the page (see --list-clips), or 'all'")
    ap.add_argument("--list-clips", action="store_true", help="list the clips --clip can render")
    ap.add_argument("--poster", action="store_true", help="write only the teaser's poster (and, for the site's teaser, its share image)")
    ap.add_argument("--crf", type=int, default=25, help="x264 quality for --clip (default 25)")
    args = ap.parse_args()
    if args.list_clips:
        for k, (_, d, _, what) in CLIPS.items():
            print(f"{k:20s} {d:5.1f} s  {what}")
    elif args.clip:
        names = list(CLIPS) if args.clip == "all" else [args.clip]
        if any(nm not in CLIPS for nm in names):
            ap.error(f"unknown clip {args.clip!r}; one of: {', '.join(CLIPS)}, all")
        for nm in names:
            if args.stills:
                render_clip_stills(nm, args.stills)
            else:
                render_clip(nm, None if args.clip == "all" else args.out, args.crf)
    elif args.stills:
        render_stills(args.stills)
    elif args.poster:
        render_poster(args.out or OUT)
    elif args.audio_only:
        render_soundtrack(args.out or OUT, args.music, args.sfx)
    else:
        render_video(args.out or OUT, audio=not args.no_audio, music=args.music, sfx=args.sfx)
