"""Phase 3 repair loop — never infinite, max attempts configurable."""
from __future__ import annotations

from typing import Any, Dict, List

from .planner import plan_layout, build_walls_doors_windows, score_layout, expand_to_fill
from .schemas import GenerationPlan, MAX_GENERATION_ATTEMPTS
from .validator import validate_proposal


def _shrink_targets(plan: GenerationPlan, factor: float = 0.9) -> GenerationPlan:
    data = plan.model_dump()
    for r in data.get("rooms", []):
        if r.get("preferredWidth"):
            r["preferredWidth"] = round(max(r["preferredWidth"] * factor, 4.0), 1)
        if r.get("preferredHeight"):
            r["preferredHeight"] = round(max(r["preferredHeight"] * factor, 4.0), 1)
    return GenerationPlan(**data)


def repair_loop(plan: GenerationPlan, plot_w: float, plot_h: float, seed: int,
                max_attempts: int = MAX_GENERATION_ATTEMPTS) -> Dict[str, Any]:
    """Generate -> validate -> repair (up to max_attempts). Returns proposal parts.

    Repair strategies (deterministic, no AI code execution):
      attempt 0: requested seed
      attempt 1: different seed (alternative arrangement)
      attempt 2: shrink room targets 10% + new seed
    """
    last_errors: List[Dict[str, Any]] = []
    best = None
    work_plan = plan
    for attempt in range(max(1, max_attempts)):
        if attempt == 2:
            work_plan = _shrink_targets(plan, 0.9)
        attempt_seed = seed + attempt * 7919
        rooms, score = plan_layout(work_plan, plot_w, plot_h, seed=attempt_seed)
        # void filling: grow rooms into unclaimed space (never creates
        # overlaps/bounds violations; capped so circulation headroom remains)
        expand_to_fill(rooms, plot_w, plot_h)
        entrance_side = (work_plan.entrance.side if work_plan.entrance else "front") or "front"
        walls, doors, windows = build_walls_doors_windows(rooms, plot_w, plot_h, entrance_side, seed=attempt_seed, plan=work_plan)
        # re-score with final sizes (expansion is intentional, not deviation)
        targets = {r["name"]: (r["width"], r["height"]) for r in rooms}
        score = score_layout(rooms, work_plan, plot_w, plot_h, targets)
        errors = validate_proposal(rooms, walls, doors, windows, work_plan, plot_w, plot_h)
        # hard failures only block: overlap / bounds / invalid size / invalid door-window-wall
        hard = [e for e in errors if e["type"] in (
            "ROOM_OVERLAP", "OUT_OF_BOUNDS", "INVALID_ROOM_SIZE",
            "INVALID_WALL", "INVALID_DOOR", "INVALID_WINDOW", "CIRCULATION_BLOCKED")]
        # required adjacency is soft for repair purposes on last attempt (reported as warning)
        candidate = {"rooms": rooms, "walls": walls, "doors": doors, "windows": windows,
                     "score": score, "errors": errors, "hard": hard, "seed": attempt_seed,
                     "attempt": attempt}
        if best is None or len(hard) < len(best["hard"]) or (
                len(hard) == len(best["hard"]) and score.total < best["score"].total):
            best = candidate
        if not hard:
            return {"ok": True, "rooms": rooms, "walls": walls, "doors": doors,
                    "windows": windows, "score": score, "errors": errors,
                    "seed": attempt_seed, "attempts": attempt + 1}
        last_errors = errors
    assert best is not None
    return {"ok": False, "rooms": best["rooms"], "walls": best["walls"], "doors": best["doors"],
            "windows": best["windows"], "score": best["score"], "errors": best["errors"],
            "seed": best["seed"], "attempts": max_attempts, "last_errors": last_errors}
