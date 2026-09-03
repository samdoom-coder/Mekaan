"""Phase 3 deterministic layout planner.

AI determines WHAT (rooms, priorities, relationships, positions).
This module determines WHERE (exact x/y/w/h, walls, doors, windows).

Isolated so it can later be replaced by constraint programming /
optimization / learned models without changing the AI contract.
"""
from __future__ import annotations

import math
import random
import uuid
from typing import Any, Dict, List, Optional, Tuple

from .schemas import (
    GeneratedRoomPlan,
    GenerationPlan,
    LayoutScore,
    ROOM_TYPE_DEFAULTS,
)


def _room_size(room: GeneratedRoomPlan) -> Tuple[float, float, float, float]:
    """Returns (w, h, minW, minH) in feet."""
    defaults = ROOM_TYPE_DEFAULTS.get(room.type, ROOM_TYPE_DEFAULTS["other"])
    w = room.preferredWidth or defaults["width"]
    h = room.preferredHeight or defaults["height"]
    if room.targetArea and not room.preferredWidth and not room.preferredHeight:
        # derive squarish dims from area, biased by defaults aspect
        aspect = defaults["width"] / max(defaults["height"], 0.1)
        h2 = math.sqrt(room.targetArea / max(aspect, 0.1))
        w2 = room.targetArea / max(h2, 0.1)
        w, h = round(w2, 1), round(h2, 1)
    minW = room.minWidth or defaults["minWidth"]
    minH = room.minHeight or defaults["minHeight"]
    w = max(float(w), float(minW), 5.0)
    h = max(float(h), float(minH), 5.0)
    return (round(w, 1), round(h, 1), float(minW), float(minH))


_PRIORITY = {
    "living-room": 0,
    "kitchen": 1,
    "dining-room": 2,
    "master-bedroom": 3,
    "bedroom": 4,
    "guest-room": 4,
    "bathroom": 5,
    "toilet": 5,
    "hall": 6,
    "study": 7,
    "office": 7,
    "family-room": 7,
    "garage": 8,
    "balcony": 9,
    "patio": 9,
    "storage": 10,
    "store": 10,
    "utility": 10,
    "utility-room": 10,
    "laundry": 10,
    "pantry": 10,
    "walk-in-closet": 10,
    "prayer-room": 10,
    "other": 11,
}


def _priority(t: str) -> int:
    return _PRIORITY.get(t, 11)


def _zone_for_position(pos: Optional[str], w: float, h: float) -> Tuple[float, float, float, float]:
    """Returns (x0, y0, x1, y1) preferred search zone. Front = y small."""
    p = (pos or "any").lower()
    if p == "front":
        return (0.5, 0.5, w - 0.5, h * 0.38)
    if p == "rear":
        return (0.5, h * 0.55, w - 0.5, h - 0.5)
    if p == "left":
        return (0.5, 0.5, w * 0.45, h - 0.5)
    if p == "right":
        return (w * 0.55, 0.5, w - 0.5, h - 0.5)
    if p == "center":
        return (w * 0.25, h * 0.25, w * 0.75, h * 0.75)
    return (0.5, 0.5, w - 0.5, h - 0.5)


def _overlaps(a: Dict[str, Any], b: Dict[str, Any], gap: float = 0.0) -> bool:
    return not (
        a["x"] + a["width"] + gap <= b["x"]
        or a["x"] >= b["x"] + b["width"] + gap
        or a["y"] + a["height"] + gap <= b["y"]
        or a["y"] >= b["y"] + b["height"] + gap
    )


def _inside(x: float, y: float, w: float, h: float, plot_w: float, plot_h: float) -> bool:
    return x >= 0 and y >= 0 and x + w <= plot_w + 1e-6 and y + h <= plot_h + 1e-6


def _edge_distance(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    """Gap between rects; 0 if touching/overlapping, else euclidean gap."""
    dx = max(0.0, max(a["x"] - (b["x"] + b["width"]), b["x"] - (a["x"] + a["width"])))
    dy = max(0.0, max(a["y"] - (b["y"] + b["height"]), b["y"] - (a["y"] + a["height"])))
    return math.hypot(dx, dy)


def _shares_wall(a: Dict[str, Any], b: Dict[str, Any], tol: float = 1.0) -> bool:
    d = _edge_distance(a, b)
    return d <= tol


def _position_penalty(x: float, y: float, w: float, h: float,
                      pos: Optional[str], plot_w: float, plot_h: float) -> float:
    p = (pos or "any").lower()
    if p in ("any", None, ""):
        return 0.0
    cx = x + w / 2
    cy = y + h / 2
    # anchor penalty (center of room toward preferred side)
    anchor = 0.0
    if p == "front":
        # want cy small
        anchor = (cy / plot_h) * 10.0
    elif p == "rear":
        anchor = ((plot_h - cy) / plot_h) * 10.0
    elif p == "left":
        anchor = (cx / plot_w) * 10.0
    elif p == "right":
        anchor = ((plot_w - cx) / plot_w) * 10.0
    elif p == "center":
        anchor = (math.hypot(cx - plot_w / 2, cy - plot_h / 2) / math.hypot(plot_w, plot_h)) * 10.0
    # overflow penalty: room body should stay inside its preferred band so
    # early-placed rooms don't sprawl into other zones on tight plots.
    zone = _zone_for_position(pos, plot_w, plot_h)
    zx0, zy0, zx1, zy1 = zone
    overflow = 0.0
    if p == "front":
        overflow = max(0.0, (y + h) - zy1)
    elif p == "rear":
        overflow = max(0.0, zy0 - y)
    elif p == "left":
        overflow = max(0.0, (x + w) - zx1)
    elif p == "right":
        overflow = max(0.0, zx0 - x)
    elif p == "center":
        overflow = (max(0.0, zx0 - x) + max(0.0, (x + w) - zx1)
                    + max(0.0, zy0 - y) + max(0.0, (y + h) - zy1))
    return anchor + overflow * 4.0


def _shared_edge_length(a: Dict[str, Any], b: Dict[str, Any], tol: float = 0.51) -> float:
    """Length of wall shared between two rects (touching or near-touching edges)."""
    total = 0.0
    if abs((a["x"] + a["width"]) - b["x"]) <= tol or abs((b["x"] + b["width"]) - a["x"]) <= tol:
        total += max(0.0, min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"]))
    if abs((a["y"] + a["height"]) - b["y"]) <= tol or abs((b["y"] + b["height"]) - a["y"]) <= tol:
        total += max(0.0, min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"]))
    return total


def _room_contacts(rooms: List[Dict[str, Any]], plot_w: float, plot_h: float) -> Dict[str, float]:
    """Total shared-wall length per room (neighbours + plot border contact)."""
    out: Dict[str, float] = {r["name"]: 0.0 for r in rooms}
    for i in range(len(rooms)):
        for j in range(i + 1, len(rooms)):
            shared = _shared_edge_length(rooms[i], rooms[j])
            if shared >= 1.0:
                out[rooms[i]["name"]] += shared
                out[rooms[j]["name"]] += shared
    for r in rooms:
        border = 0.0
        if r["x"] <= 0.51:
            border += r["height"]
        if r["x"] + r["width"] >= plot_w - 0.51:
            border += r["height"]
        if r["y"] <= 0.51:
            border += r["width"]
        if r["y"] + r["height"] >= plot_h - 0.51:
            border += r["width"]
        out[r["name"]] += border
    return out


def _snap_coord(v: float, size: float, edges: List[float], tol: float, lo: float, hi: float) -> float:
    """Snap left edge (v) or right edge (v+size) to the nearest edge within tol."""
    best_v = v
    best_d = tol + 1e-9
    for e in edges:
        for cand in (e, e - size):
            d = abs(cand - v)
            if d <= tol and d < best_d:
                best_d = d
                best_v = cand
    return round(max(lo, min(hi, best_v)), 1)


def _build_adjacency_lookup(plan: GenerationPlan) -> List[Tuple[str, str, str, str]]:
    """Returns list of (source, relationship, target, strength)."""
    out: List[Tuple[str, str, str, str]] = []
    for r in plan.relationships:
        out.append((r.sourceRoom, r.relationship, r.targetRoom, r.strength))
    for room in plan.rooms:
        for r in room.relationships:
            out.append((r.sourceRoom, r.relationship, r.targetRoom, r.strength))
    # de-dupe
    seen = set()
    uniq = []
    for t in out:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


def _adjacency_satisfied(a: Optional[Dict[str, Any]], b: Optional[Dict[str, Any]],
                         rel: str) -> bool:
    if a is None or b is None:
        return False
    d = _edge_distance(a, b)
    r = rel.upper()
    if r in ("ADJACENT", "ATTACHED", "ACCESSIBLE_FROM"):
        return d <= 1.5
    if r == "NEAR":
        return d <= 12.0
    if r == "FAR":
        return d >= 10.0
    if r == "FRONT_OF":
        return (a["y"] + a["height"] / 2) < (b["y"] + b["height"] / 2)
    if r == "BEHIND":
        return (a["y"] + a["height"] / 2) > (b["y"] + b["height"] / 2)
    if r == "LEFT_OF":
        return (a["x"] + a["width"] / 2) < (b["x"] + b["width"] / 2)
    if r == "RIGHT_OF":
        return (a["x"] + a["width"] / 2) > (b["x"] + b["width"] / 2)
    if r == "INSIDE":
        return (a["x"] >= b["x"] and a["y"] >= b["y"]
                and a["x"] + a["width"] <= b["x"] + b["width"]
                and a["y"] + a["height"] <= b["y"] + b["height"])
    return d <= 12.0


def score_layout(rooms: List[Dict[str, Any]], plan: GenerationPlan,
                 plot_w: float, plot_h: float,
                 target_sizes: Dict[str, Tuple[float, float]]) -> LayoutScore:
    s = LayoutScore()
    # boundary + overlap
    for r in rooms:
        if not _inside(r["x"], r["y"], r["width"], r["height"], plot_w, plot_h):
            s.boundaryViolations += 1
    for i in range(len(rooms)):
        for j in range(i + 1, len(rooms)):
            if _overlaps(rooms[i], rooms[j]):
                s.overlapViolations += 1
    # adjacency
    by_name = {r["name"]: r for r in rooms}
    for (src, rel, tgt, strength) in _build_adjacency_lookup(plan):
        a = by_name.get(src)
        b = by_name.get(tgt)
        if a is None or b is None:
            # unknown room (e.g. "Entrance") — skip unless required
            if strength == "required":
                s.adjacencyViolations += 1
            continue
        if not _adjacency_satisfied(a, b, rel):
            s.adjacencyViolations += 2 if strength == "required" else 1
    # size deviation
    for r in rooms:
        tw, th = target_sizes.get(r["name"], (r["width"], r["height"]))
        s.sizeDeviation += abs(r["width"] - tw) + abs(r["height"] - th)
    # preference deviation
    for r in rooms:
        pref = next((p.preferredPosition for p in plan.rooms if p.name == r["name"]), "any")
        s.preferenceDeviation += _position_penalty(r["x"], r["y"], r["width"], r["height"], pref, plot_w, plot_h)
    # circulation: coverage heuristic
    total = sum(r["width"] * r["height"] for r in rooms)
    coverage = total / max(plot_w * plot_h, 1)
    if coverage > 0.92:
        s.circulationViolations += 3
    elif coverage < 0.25:
        s.circulationViolations += 1  # too sparse = wasted space
    # unused space small penalty via total
    s.total = (
        s.boundaryViolations * 1000
        + s.overlapViolations * 1000
        + s.adjacencyViolations * 100
        + s.circulationViolations * 20
        + s.sizeDeviation * 2
        + s.preferenceDeviation * 1
        + max(0, (0.85 - coverage)) * 10  # small penalty for unused space
    )
    return s


def _candidate_positions(w: float, h: float, plot_w: float, plot_h: float,
                         zone: Tuple[float, float, float, float],
                         rng: random.Random, step: float = 1.0) -> List[Tuple[float, float]]:
    x0, y0, x1, y1 = zone
    # clamp zone to plot
    x0 = max(0.0, x0)
    y0 = max(0.0, y0)
    x1 = min(plot_w - w, x1)
    y1 = min(plot_h - h, y1)
    pts: List[Tuple[float, float]] = []
    if x1 < x0 or y1 < y0:
        # zone cannot fit — fall back to whole plot
        x0, y0, x1, y1 = 0.0, 0.0, plot_w - w, plot_h - h
    if x1 < 0 or y1 < 0:
        return [(0.0, 0.0)]
    yy = y0
    while yy <= y1 + 1e-6:
        xx = x0
        while xx <= x1 + 1e-6:
            pts.append((round(xx, 1), round(yy, 1)))
            xx += step
        yy += step
    if not pts:
        return [(0.0, 0.0)]
    # Zone discipline: keep candidates closest to the preferred zone first.
    # Sort by distance to zone anchor (zone start corner), then apply a
    # deterministic seed-based tiebreak. Truncation (if needed) therefore
    # drops far/low-priority candidates instead of random ones — greedy
    # placement keeps front rooms in front and rear rooms in rear.
    ax, ay = x0, y0
    scored = [((px - ax) ** 2 + (py - ay) ** 2, rng.random(), (px, py)) for (px, py) in pts]
    scored.sort(key=lambda t: (t[0], t[1]))
    ordered_pts = [p for (_, _, p) in scored]
    # keep search bounded for very large plots
    if len(ordered_pts) > 1500:
        keep = ordered_pts[:1000]
        rest = ordered_pts[1000:]
        keep += rng.sample(rest, min(300, len(rest)))
        return keep
    return ordered_pts


def _align_edges(rooms: List[Dict[str, Any]], plan: GenerationPlan,
                 plot_w: float, plot_h: float,
                 target_sizes: Dict[str, Tuple[float, float]],
                 tol: float = 2.0, passes: int = 2) -> None:
    """Snap room edges to nearby neighbour edges / plot borders.

    Mutates `rooms` in place. Small rooms go first so they attach to the big
    stable rooms instead of floating with 1-2 ft gaps. Every shift must keep
    the room inside the plot, overlap-free, and must not worsen the overall
    layout score (which protects required adjacency).
    """
    for _ in range(passes):
        improved = False
        cur_total = score_layout(rooms, plan, plot_w, plot_h, target_sizes).total
        for r in sorted(rooms, key=lambda x: (x["width"] * x["height"], x["name"])):
            others = [p for p in rooms if p["name"] != r["name"]]
            v_edges = [0.0, plot_w]
            h_edges = [0.0, plot_h]
            for p in others:
                v_edges += [p["x"], p["x"] + p["width"]]
                h_edges += [p["y"], p["y"] + p["height"]]
            nx = _snap_coord(r["x"], r["width"], v_edges, tol, 0.0, plot_w - r["width"])
            ny = _snap_coord(r["y"], r["height"], h_edges, tol, 0.0, plot_h - r["height"])
            for (tx, ty) in ((nx, r["y"]), (r["x"], ny), (nx, ny)):
                if tx == r["x"] and ty == r["y"]:
                    continue
                test = {**r, "x": tx, "y": ty}
                if not _inside(tx, ty, r["width"], r["height"], plot_w, plot_h):
                    continue
                if any(_overlaps(test, p, gap=0.0) for p in others):
                    continue
                old_x, old_y = r["x"], r["y"]
                r["x"], r["y"] = tx, ty
                new_total = score_layout(rooms, plan, plot_w, plot_h, target_sizes).total
                if new_total <= cur_total + 1e-9:
                    cur_total = new_total
                    improved = True
                    break
                r["x"], r["y"] = old_x, old_y
        if not improved:
            break


def plan_layout(plan: GenerationPlan, plot_w: float, plot_h: float,
                seed: int = 0) -> Tuple[List[Dict[str, Any]], LayoutScore]:
    """Deterministic heuristic placement. Returns (rooms, score)."""
    rng = random.Random(seed)
    ordered = sorted(plan.rooms, key=lambda r: (_priority(r.type), r.name))
    target_sizes: Dict[str, Tuple[float, float]] = {}
    dims: Dict[str, Tuple[float, float, float, float]] = {}
    for r in ordered:
        w, h, _, _ = _room_size(r)
        # shrink if room larger than plot
        if w > plot_w - 1:
            scale = (plot_w - 1) / w
            w = round(plot_w - 1, 1)
            h = round(max(h * scale, 5.0), 1)
        if h > plot_h - 1:
            scale = (plot_h - 1) / h
            h = round(plot_h - 1, 1)
            w = round(max(w * scale, 5.0), 1)
        dims[r.name] = (w, h, 0, 0)
        target_sizes[r.name] = (w, h)

    placed: List[Dict[str, Any]] = []
    for rp in ordered:
        w, h, _, _ = dims[rp.name]
        # try both orientations (swap) — prefer original, but allow swap if it scores better
        best = None
        best_cost = float("inf")
        orientations = [(w, h)] if w == h else [(w, h), (h, w)]
        zone = _zone_for_position(rp.preferredPosition, plot_w, plot_h)
        for (ow, oh) in orientations:
            if ow > plot_w or oh > plot_h:
                continue
            cands = _candidate_positions(ow, oh, plot_w, plot_h, zone, rng)
            # snap-augmented candidates: align to neighbour edges / plot
            # borders so small rooms sit flush instead of floating with gaps.
            if placed:
                v_edges = [0.0, plot_w]
                h_edges = [0.0, plot_h]
                for p in placed:
                    v_edges += [p["x"], p["x"] + p["width"]]
                    h_edges += [p["y"], p["y"] + p["height"]]
                seen = set(cands)
                extra: List[Tuple[float, float]] = []
                for (cx, cy) in cands[:400]:
                    nx = _snap_coord(cx, ow, v_edges, 1.5, 0.0, plot_w - ow)
                    ny = _snap_coord(cy, oh, h_edges, 1.5, 0.0, plot_h - oh)
                    if (nx, ny) not in seen:
                        seen.add((nx, ny))
                        extra.append((nx, ny))
                cands = cands + extra
            for (cx, cy) in cands:
                test = {"name": rp.name, "type": rp.type, "x": cx, "y": cy,
                        "width": ow, "height": oh}
                if any(_overlaps(test, p, gap=0.0) for p in placed):
                    continue
                if not _inside(cx, cy, ow, oh, plot_w, plot_h):
                    continue
                # partial cost: position penalty + adjacency to already-placed
                cost = _position_penalty(cx, cy, ow, oh, rp.preferredPosition, plot_w, plot_h)
                by_name = {p["name"]: p for p in placed}
                by_name[rp.name] = test
                for (src, rel, tgt, strength) in _build_adjacency_lookup(plan):
                    if src == rp.name and tgt in by_name:
                        if not _adjacency_satisfied(test, by_name[tgt], rel):
                            cost += 50 if strength == "required" else 10
                    elif tgt == rp.name and src in by_name:
                        if not _adjacency_satisfied(by_name[src], test, rel):
                            cost += 50 if strength == "required" else 10
                # wall-sharing bonus: reward rooms that abut neighbours so
                # the plan tiles without gaps or floating small rooms.
                for p in placed:
                    cost -= _shared_edge_length(test, p) * 2.0
                # small deterministic jitter to break ties by seed
                cost += rng.random() * 0.01
                if cost < best_cost:
                    best_cost = cost
                    best = test
            # end candidates
        if best is None:
            # fallback: global scan without zone bias (guarantee placement attempt)
            found = None
            for ty in [round(v * 0.5, 1) for v in range(0, int((plot_h - h) * 2) + 1)]:
                for tx in [round(v * 0.5, 1) for v in range(0, int((plot_w - w) * 2) + 1)]:
                    test = {"name": rp.name, "type": rp.type, "x": tx, "y": ty,
                            "width": w, "height": h}
                    if not any(_overlaps(test, p, gap=0.0) for p in placed) and _inside(tx, ty, w, h, plot_w, plot_h):
                        found = test
                        break
                if found:
                    break
            best = found or {"name": rp.name, "type": rp.type, "x": 0.5, "y": 0.5,
                             "width": w, "height": h}
        placed.append(best)

    # Adjacency repair passes (required first): try to move rooms adjacent
    by_name = {r["name"]: r for r in placed}
    for (src, rel, tgt, strength) in _build_adjacency_lookup(plan):
        if rel.upper() not in ("ADJACENT", "ATTACHED", "ACCESSIBLE_FROM", "NEAR"):
            continue
        a = by_name.get(src)
        b = by_name.get(tgt)
        if a is None or b is None:
            continue
        if _adjacency_satisfied(a, b, rel):
            continue
        # try to relocate `a` next to `b` (keep `b` stable for determinism).
        # Flush offsets (0 gap) so repaired rooms share walls instead of gaps.
        candidates = [
            (b["x"] + b["width"], b["y"]),
            (b["x"] - a["width"], b["y"]),
            (b["x"], b["y"] + b["height"]),
            (b["x"], b["y"] - a["height"]),
            (b["x"] + b["width"], b["y"] + b["height"]),
        ]
        others = [p for p in placed if p["name"] not in (src,)]
        for (nx, ny) in candidates:
            nx, ny = round(nx, 1), round(ny, 1)
            if not _inside(nx, ny, a["width"], a["height"], plot_w, plot_h):
                continue
            test = {**a, "x": nx, "y": ny}
            if any(_overlaps(test, p, gap=0.0) for p in others):
                continue
            a["x"], a["y"] = nx, ny
            break

    # Edge-alignment pass: close small gaps (<=2 ft) by snapping room edges
    # to neighbour edges / plot borders. Small rooms first so they attach to
    # big stable rooms. Score-guarded so required adjacency never breaks.
    _align_edges(placed, plan, plot_w, plot_h, target_sizes)

    score = score_layout(placed, plan, plot_w, plot_h, target_sizes)
    # attach ids
    for r in placed:
        r["id"] = f"room_{uuid.uuid4().hex[:6]}"
        r["rotation"] = 0
        r["properties"] = {}
    return placed, score


def expand_to_fill(rooms: List[Dict[str, Any]], plot_w: float, plot_h: float,
                   max_coverage: float = 0.90, max_growth: float = 2.0,
                   step: float = 0.5, sweeps: int = 200) -> float:
    """Grow rooms into unclaimed voids so the plan tiles the footprint.

    Round-robin, small rooms first, so small rooms claim adjacent voids
    instead of big rooms eating everything. Growth per room is capped at
    `max_growth` x its original area and total coverage at `max_coverage`
    (keeps circulation headroom for the validator). Only ever grows into
    free space — never creates overlaps or out-of-bounds rooms.
    Returns final coverage 0..1.
    """
    plot_area = max(plot_w * plot_h, 1.0)
    orig = {r["name"]: r["width"] * r["height"] for r in rooms}

    def coverage() -> float:
        return sum(r["width"] * r["height"] for r in rooms) / plot_area

    for _ in range(sweeps):
        if coverage() >= max_coverage:
            break
        moved = False
        for r in sorted(rooms, key=lambda x: (x["width"] * x["height"], x["name"])):
            if r["width"] * r["height"] >= orig[r["name"]] * max_growth:
                continue
            others = [p for p in rooms if p is not r]
            # right
            if r["x"] + r["width"] + step <= plot_w + 1e-9:
                t = {**r, "width": round(r["width"] + step, 1)}
                if (t["width"] * r["height"] <= orig[r["name"]] * max_growth
                        and not any(_overlaps(t, p, gap=0.0) for p in others)):
                    r["width"] = t["width"]
                    moved = True
            # bottom
            if r["y"] + r["height"] + step <= plot_h + 1e-9:
                t = {**r, "height": round(r["height"] + step, 1)}
                if (r["width"] * t["height"] <= orig[r["name"]] * max_growth
                        and not any(_overlaps(t, p, gap=0.0) for p in others)):
                    r["height"] = t["height"]
                    moved = True
            # left
            if r["x"] - step >= -1e-9:
                t = {**r, "x": round(r["x"] - step, 1), "width": round(r["width"] + step, 1)}
                if (t["width"] * r["height"] <= orig[r["name"]] * max_growth
                        and not any(_overlaps(t, p, gap=0.0) for p in others)):
                    r["x"], r["width"] = t["x"], t["width"]
                    moved = True
            # top
            if r["y"] - step >= -1e-9:
                t = {**r, "y": round(r["y"] - step, 1), "height": round(r["height"] + step, 1)}
                if (r["width"] * t["height"] <= orig[r["name"]] * max_growth
                        and not any(_overlaps(t, p, gap=0.0) for p in others)):
                    r["y"], r["height"] = t["y"], t["height"]
                    moved = True
        if not moved:
            break
    return coverage()


def _shared_segment(a: Dict[str, Any], b: Dict[str, Any], tol: float = 0.6):
    """Shared edge segment between two abutting rects.

    Returns (orientation, fixed, lo, hi) with orientation 'h' (horizontal
    wall at y=fixed spanning x lo..hi) or 'v', or None if not sharing.
    """
    # a bottom == b top (or reverse): horizontal shared edge
    if abs((a["y"] + a["height"]) - b["y"]) <= tol:
        lo, hi = max(a["x"], b["x"]), min(a["x"] + a["width"], b["x"] + b["width"])
        if hi - lo > 0:
            return ("h", round(((a["y"] + a["height"]) + b["y"]) / 2, 2), round(lo, 1), round(hi, 1))
    if abs((b["y"] + b["height"]) - a["y"]) <= tol:
        lo, hi = max(a["x"], b["x"]), min(a["x"] + a["width"], b["x"] + b["width"])
        if hi - lo > 0:
            return ("h", round(((b["y"] + b["height"]) + a["y"]) / 2, 2), round(lo, 1), round(hi, 1))
    # vertical shared edge
    if abs((a["x"] + a["width"]) - b["x"]) <= tol:
        lo, hi = max(a["y"], b["y"]), min(a["y"] + a["height"], b["y"] + b["height"])
        if hi - lo > 0:
            return ("v", round(((a["x"] + a["width"]) + b["x"]) / 2, 2), round(lo, 1), round(hi, 1))
    if abs((b["x"] + b["width"]) - a["x"]) <= tol:
        lo, hi = max(a["y"], b["y"]), min(a["y"] + a["height"], b["y"] + b["height"])
        if hi - lo > 0:
            return ("v", round(((b["x"] + b["width"]) + a["x"]) / 2, 2), round(lo, 1), round(hi, 1))
    return None


def _merge_collinear_walls(walls: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge collinear overlapping interior wall segments into single walls.

    Exterior perimeter walls are kept as-is. Prevents doubled/stacked wall
    lines where several room pairs share one continuous wall face.
    """
    exterior = [w for w in walls if w.get("type") == "exterior"]
    interior = [w for w in walls if w.get("type") != "exterior"]
    groups: Dict[tuple, List[tuple]] = {}
    for w in interior:
        try:
            x1, y1 = w["start"]["x"], w["start"]["y"]
            x2, y2 = w["end"]["x"], w["end"]["y"]
        except (KeyError, TypeError):
            continue
        if abs(y2 - y1) <= abs(x2 - x1):
            key = ("h", round((y1 + y2) / 2, 2))
            groups.setdefault(key, []).append((round(min(x1, x2), 2), round(max(x1, x2), 2)))
        else:
            key = ("v", round((x1 + x2) / 2, 2))
            groups.setdefault(key, []).append((round(min(y1, y2), 2), round(max(y1, y2), 2)))
    merged: List[Dict[str, Any]] = []
    for (orient, fixed), ivals in groups.items():
        ivals.sort()
        cur_lo, cur_hi = ivals[0]
        out = []
        for lo, hi in ivals[1:]:
            if lo <= cur_hi + 0.15:
                cur_hi = max(cur_hi, hi)
            else:
                out.append((cur_lo, cur_hi))
                cur_lo, cur_hi = lo, hi
        out.append((cur_lo, cur_hi))
        for lo, hi in out:
            if hi - lo < 1.0:
                continue
            if orient == "h":
                s, e = {"x": lo, "y": fixed}, {"x": hi, "y": fixed}
            else:
                s, e = {"x": fixed, "y": lo}, {"x": fixed, "y": hi}
            merged.append({"id": f"wall_{uuid.uuid4().hex[:6]}", "start": s, "end": e,
                           "thickness": 0.4, "height": 9, "type": "interior"})
    return exterior + merged


def build_walls_doors_windows(rooms: List[Dict[str, Any]], plot_w: float, plot_h: float,
                              entrance_side: str = "front",
                              seed: int = 0,
                              plan=None) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Generate walls (perimeter + interior shared-edge), doors, windows via geometry only."""
    rng = random.Random(seed + 999)
    walls: List[Dict[str, Any]] = [
        {"id": f"wall_{uuid.uuid4().hex[:6]}", "start": {"x": 0, "y": 0}, "end": {"x": plot_w, "y": 0}, "thickness": 0.5, "height": 9, "type": "exterior"},
        {"id": f"wall_{uuid.uuid4().hex[:6]}", "start": {"x": plot_w, "y": 0}, "end": {"x": plot_w, "y": plot_h}, "thickness": 0.5, "height": 9, "type": "exterior"},
        {"id": f"wall_{uuid.uuid4().hex[:6]}", "start": {"x": plot_w, "y": plot_h}, "end": {"x": 0, "y": plot_h}, "thickness": 0.5, "height": 9, "type": "exterior"},
        {"id": f"wall_{uuid.uuid4().hex[:6]}", "start": {"x": 0, "y": plot_h}, "end": {"x": 0, "y": 0}, "thickness": 0.5, "height": 9, "type": "exterior"},
    ]
    # interior walls: for pairs sharing an edge (gap <= 1.0), add a partition segment along overlap
    for i in range(len(rooms)):
        for j in range(i + 1, len(rooms)):
            a, b = rooms[i], rooms[j]
            if _edge_distance(a, b) > 1.0:
                continue
            # find shared axis overlap
            # vertical adjacency (a above b or below)
            x_overlap = min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"])
            y_overlap = min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"])
            seg = None
            if x_overlap > 1.0 and abs((a["y"] + a["height"]) - b["y"]) <= 1.0:
                y = (a["y"] + a["height"] + b["y"]) / 2
                x0 = max(a["x"], b["x"])
                seg = ({"x": round(x0, 1), "y": round(y, 1)}, {"x": round(x0 + x_overlap, 1), "y": round(y, 1)})
            elif x_overlap > 1.0 and abs((b["y"] + b["height"]) - a["y"]) <= 1.0:
                y = (b["y"] + b["height"] + a["y"]) / 2
                x0 = max(a["x"], b["x"])
                seg = ({"x": round(x0, 1), "y": round(y, 1)}, {"x": round(x0 + x_overlap, 1), "y": round(y, 1)})
            elif y_overlap > 1.0 and abs((a["x"] + a["width"]) - b["x"]) <= 1.0:
                x = (a["x"] + a["width"] + b["x"]) / 2
                y0 = max(a["y"], b["y"])
                seg = ({"x": round(x, 1), "y": round(y0, 1)}, {"x": round(x, 1), "y": round(y0 + y_overlap, 1)})
            elif y_overlap > 1.0 and abs((b["x"] + b["width"]) - a["x"]) <= 1.0:
                x = (b["x"] + b["width"] + a["x"]) / 2
                y0 = max(a["y"], b["y"])
                seg = ({"x": round(x, 1), "y": round(y0, 1)}, {"x": round(x, 1), "y": round(y0 + y_overlap, 1)})
            if seg and len(walls) < 40:
                (s, e) = seg
                length = math.hypot(e["x"] - s["x"], e["y"] - s["y"])
                if length >= 2.0:
                    walls.append({"id": f"wall_{uuid.uuid4().hex[:6]}", "start": s, "end": e,
                                  "thickness": 0.4, "height": 9, "type": "interior"})

    # merge collinear stubs into continuous wall faces (like real plans)
    walls = _merge_collinear_walls(walls)

    def _wall_len(w: Dict[str, Any]) -> float:
        return math.hypot(w["end"]["x"] - w["start"]["x"], w["end"]["y"] - w["start"]["y"])

    side_map = {"front": 0, "right": 1, "rear": 2, "left": 3}
    entrance_wall = walls[side_map.get((entrance_side or "front").lower(), 0)]
    doors = [{"id": f"door_{uuid.uuid4().hex[:6]}", "wallId": entrance_wall["id"],
              "position": 0.5, "width": 3, "swingDirection": "right"}]
    walled_doors = {entrance_wall["id"]}

    def _door_on_wall(wall: Dict[str, Any], at: float, width: float) -> None:
        if wall["id"] in walled_doors:
            return
        if _wall_len(wall) < width + 0.5:
            return
        doors.append({"id": f"door_{uuid.uuid4().hex[:6]}", "wallId": wall["id"],
                      "position": round(max(0.15, min(0.85, at)), 2), "width": width,
                      "swingDirection": "left" if rng.random() < 0.5 else "right"})
        walled_doors.add(wall["id"])

    # doors first on required-adjacency shared walls (rooms that must connect)
    if plan is not None:
        by_name = {r["name"]: r for r in rooms}
        for (src, rel, tgt, strength) in _build_adjacency_lookup(plan):
            if rel.upper() not in ("ADJACENT", "ATTACHED", "ACCESSIBLE_FROM"):
                continue
            a, b = by_name.get(src), by_name.get(tgt)
            if a is None or b is None:
                continue
            seg = _shared_segment(a, b)
            if seg is None or (seg[3] - seg[2]) < 2.5:
                continue
            orient, fixed, lo, hi = seg
            best_w, best_ov = None, 0.0
            for w in walls[4:]:
                try:
                    x1, y1 = w["start"]["x"], w["start"]["y"]
                    x2, y2 = w["end"]["x"], w["end"]["y"]
                except (KeyError, TypeError):
                    continue
                if orient == "h" and abs(y1 - y2) <= abs(x2 - x1) and abs((y1 + y2) / 2 - fixed) <= 0.6:
                    ov = min(max(x1, x2), hi) - max(min(x1, x2), lo)
                    wlo, whi = min(x1, x2), max(x1, x2)
                elif orient == "v" and abs(y2 - y1) > abs(x2 - x1) and abs((x1 + x2) / 2 - fixed) <= 0.6:
                    ov = min(max(y1, y2), hi) - max(min(y1, y2), lo)
                    wlo, whi = min(y1, y2), max(y1, y2)
                else:
                    continue
                if ov > best_ov:
                    best_ov = ov
                    mid = (max(wlo, lo) + min(whi, hi)) / 2
                    span = max(whi - wlo, 0.01)
                    best_w = (w, (mid - wlo) / span)
            if best_w is not None and len(doors) < 8:
                _door_on_wall(best_w[0], best_w[1], 2.8)
    # remaining interior walls get doors so every space connects
    for w in walls[4:]:
        if len(doors) >= 8:
            break
        _door_on_wall(w, 0.5, 2.8)

    # windows: one per border-facing room (priority order), spread positions
    # across the wall instead of stacking everything at 0.5
    windows = []
    exterior_rooms = [r for r in rooms
                      if r["x"] <= 0.6 or r["y"] <= 0.6
                      or r["x"] + r["width"] >= plot_w - 0.6
                      or r["y"] + r["height"] >= plot_h - 0.6]
    exterior_rooms = sorted(exterior_rooms, key=lambda r: (_priority(r["type"]), r["name"]))[:5]
    for idx, r in enumerate(exterior_rooms):
        cx = r["x"] + r["width"] / 2
        cy = r["y"] + r["height"] / 2
        best = None
        best_d = float("inf")
        for w in walls[:4]:
            mx = (w["start"]["x"] + w["end"]["x"]) / 2
            my = (w["start"]["y"] + w["end"]["y"]) / 2
            d = math.hypot(mx - cx, my - cy)
            if d < best_d:
                best_d = d
                best = w
        if best is not None:
            win_w = max(2.0, min(4.0, _wall_len(best) - 1.0))
            windows.append({"id": f"win_{uuid.uuid4().hex[:6]}", "wallId": best["id"],
                            "position": round([0.3, 0.55, 0.7, 0.4, 0.6][idx % 5] + rng.random() * 0.04, 2),
                            "width": round(win_w, 1), "height": 4, "type": "casement"})
    return walls, doors[:8], windows[:5]
