"""Phase 3 constraint validation — reuses concepts from the existing engine.

Do NOT create a competing validation system: these checks mirror
frontend src/engine/constraints.ts + geometry.ts (containment, overlap,
min size, wall/door/window validity) plus Phase 3 additions
(required adjacency, basic circulation).
"""
from __future__ import annotations

from typing import Any, Dict, List

from .planner import _adjacency_satisfied, _build_adjacency_lookup, _edge_distance, _overlaps
from .schemas import GenerationPlan


def _wall_length(w: Dict[str, Any]) -> float:
    try:
        dx = w["end"]["x"] - w["start"]["x"]
        dy = w["end"]["y"] - w["start"]["y"]
        return (dx * dx + dy * dy) ** 0.5
    except Exception:
        return 0.0


def validate_proposal(rooms: List[Dict[str, Any]], walls: List[Dict[str, Any]],
                      doors: List[Dict[str, Any]], windows: List[Dict[str, Any]],
                      plan: GenerationPlan, plot_w: float, plot_h: float) -> List[Dict[str, Any]]:
    """Returns list of structured errors: {type, rooms?, message}."""
    errors: List[Dict[str, Any]] = []

    for r in rooms:
        if r.get("width", 0) < 4 or r.get("height", 0) < 4:
            errors.append({"type": "INVALID_ROOM_SIZE", "rooms": [r.get("name")],
                           "message": f"Room '{r.get('name')}' is too small ({r.get('width')}x{r.get('height')} ft). Minimum 4 ft."})
        x, y, w, h = r.get("x", 0), r.get("y", 0), r.get("width", 0), r.get("height", 0)
        if x < -1e-6 or y < -1e-6 or x + w > plot_w + 1e-6 or y + h > plot_h + 1e-6:
            errors.append({"type": "OUT_OF_BOUNDS", "rooms": [r.get("name")],
                           "message": f"Room '{r.get('name')}' extends outside the {plot_w}x{plot_h} ft footprint."})

    for i in range(len(rooms)):
        for j in range(i + 1, len(rooms)):
            if _overlaps(rooms[i], rooms[j]):
                # compute overlap depth for message
                ox = min(rooms[i]["x"] + rooms[i]["width"], rooms[j]["x"] + rooms[j]["width"]) - max(rooms[i]["x"], rooms[j]["x"])
                errors.append({"type": "ROOM_OVERLAP", "rooms": [rooms[i].get("name"), rooms[j].get("name")],
                               "message": f"{rooms[i].get('name')} overlaps {rooms[j].get('name')} by {ox:.1f} ft."})

    for w in walls:
        ln = _wall_length(w)
        if ln < 1:
            errors.append({"type": "INVALID_WALL", "message": "A wall is too short (< 1 ft)."})
        elif ln > 500:
            errors.append({"type": "INVALID_WALL", "message": "A wall is too long (> 500 ft)."})

    wall_ids = {w.get("id") for w in walls}
    for d in doors:
        if d.get("wallId") not in wall_ids:
            errors.append({"type": "INVALID_DOOR", "message": f"Door '{d.get('id')}' is not attached to a valid wall."})
        elif not (0 <= float(d.get("position", 0.5)) <= 1):
            errors.append({"type": "INVALID_DOOR", "message": f"Door '{d.get('id')}' has invalid position."})
        elif float(d.get("width", 3)) < 2:
            errors.append({"type": "INVALID_DOOR", "message": f"Door '{d.get('id')}' must be at least 2 ft wide."})

    for wn in windows:
        if wn.get("wallId") not in wall_ids:
            errors.append({"type": "INVALID_WINDOW", "message": f"Window '{wn.get('id')}' is not attached to a valid wall."})

    # required adjacency
    by_name = {r.get("name"): r for r in rooms}
    for (src, rel, tgt, strength) in _build_adjacency_lookup(plan):
        if strength != "required":
            continue
        a = by_name.get(src)
        b = by_name.get(tgt)
        if a is None or b is None:
            continue  # unknown target like "Entrance" — planner handles entrance separately
        if not _adjacency_satisfied(a, b, rel):
            errors.append({"type": "ADJACENCY_UNSATISFIED", "rooms": [src, tgt],
                           "message": f"Required relationship unsatisfied: {src} should be {rel} {tgt}."})

    # basic circulation: coverage + connectivity
    total = sum(r.get("width", 0) * r.get("height", 0) for r in rooms)
    coverage = total / max(plot_w * plot_h, 1)
    if coverage > 0.95:
        errors.append({"type": "CIRCULATION_BLOCKED",
                       "message": "Rooms cover >95% of the footprint — no space left for circulation/doors."})
    # connectivity: every room must be within 15 ft of another room (no isolated islands far away)
    if len(rooms) > 1:
        for r in rooms:
            nearest = min((_edge_distance(r, o) for o in rooms if o is not r), default=0)
            if nearest > 15:
                errors.append({"type": "CIRCULATION_BLOCKED", "rooms": [r.get("name")],
                               "message": f"Room '{r.get('name')}' is isolated — no circulation path."})
                break

    return errors
