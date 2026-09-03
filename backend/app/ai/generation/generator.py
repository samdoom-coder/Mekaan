"""Phase 3 generation orchestrator.

Pipeline (spec #2):
  Generation Request -> Normalize -> AI Planning -> GenerationPlan
  -> Layout Planner -> Constraint Validation -> Repair/Refinement
  -> Generation Proposal (preview) -> Apply as One Transaction -> Version
"""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List

from .ai_planning import build_plan, _expand_request_rooms
from .planner import build_walls_doors_windows, plan_layout
from .repair import repair_loop
from .schemas import DesignGenerationRequest, GenerationProposal, LayoutScore, MAX_GENERATION_ATTEMPTS
from .validator import validate_proposal


def suggest_fixes(errors: List[Dict[str, Any]], plot_w: float, plot_h: float) -> List[str]:
    out: List[str] = []
    types = {e.get("type") for e in errors}
    if "ROOM_OVERLAP" in types or "CIRCULATION_BLOCKED" in types:
        out += ["Increase plot size", "Reduce target room sizes", "Remove an optional room"]
    if "OUT_OF_BOUNDS" in types:
        out += ["Increase plot size", "Reduce target room sizes"]
    if "ADJACENCY_UNSATISFIED" in types:
        out += ["Allow a different layout (regenerate with a new seed)"]
    if "INVALID_ROOM_SIZE" in types:
        out += ["Increase minimum room dimensions"]
    if not out:
        out = ["Try regenerating with a different seed", "Simplify adjacency requirements"]
    # de-dupe
    seen, uniq = set(), []
    for s in out:
        if s not in seen:
            seen.add(s)
            uniq.append(s)
    return uniq[:4]


def _commands_from_geometry(rooms, walls, doors, windows) -> List[Dict[str, Any]]:
    cmds: List[Dict[str, Any]] = []
    for r in rooms:
        cmds.append({"type": "CREATE_ROOM", "parameters": {
            "roomType": r["type"], "name": r["name"],
            "x": r["x"], "y": r["y"], "width": r["width"], "height": r["height"]}})
    for w in walls:
        cmds.append({"type": "CREATE_WALL", "parameters": {
            "start": w["start"], "end": w["end"],
            "thickness": w.get("thickness", 0.5), "type": w.get("type", "interior")}})
    for d in doors:
        cmds.append({"type": "CREATE_DOOR", "parameters": {
            "wallId": d["wallId"], "position": d.get("position", 0.5),
            "width": d.get("width", 3), "swingDirection": d.get("swingDirection", "right")}})
    for wn in windows:
        cmds.append({"type": "CREATE_WINDOW", "parameters": {
            "wallId": wn["wallId"], "position": wn.get("position", 0.5),
            "width": wn.get("width", 4), "height": wn.get("height", 4)}})
    return cmds


def _design_from_geometry(req: DesignGenerationRequest, rooms, walls, doors, windows,
                          plot_w: float, plot_h: float) -> Dict[str, Any]:
    floor_rooms = []
    for r in rooms:
        floor_rooms.append({"id": r.get("id") or f"room_{uuid.uuid4().hex[:6]}",
                            "name": r["name"], "type": r["type"],
                            "x": r["x"], "y": r["y"], "width": r["width"], "height": r["height"],
                            "rotation": 0, "properties": {}})
    return {
        "id": f"generated_{uuid.uuid4().hex[:8]}",
        "version": 1,
        "units": "feet",
        "name": "AI Generated Floor Plan",
        "propertyType": "residential",
        "site": {"width": round(plot_w, 2), "depth": round(plot_h, 2)},
        "metadata": {"createdAt": "", "updatedAt": ""},
        "floors": [{
            "id": "floor_ground", "name": "Ground Floor", "level": 0,
            "width": round(plot_w, 2), "height": round(plot_h, 2),
            "rooms": floor_rooms, "walls": walls, "doors": doors, "windows": windows,
            "objects": [], "dimensions": [], "annotations": [],
        }],
    }


def _option_payload(req: DesignGenerationRequest, plan, source: str, result: Dict[str, Any],
                    plot_w: float, plot_h: float, label: str) -> Dict[str, Any]:
    """Build one option's proposal payload from a successful repair result."""
    rooms, walls, doors, windows = result["rooms"], result["walls"], result["doors"], result["windows"]
    score: LayoutScore = result["score"]
    errors = [e for e in result["errors"] if e["type"] == "ADJACENCY_UNSATISFIED"]
    warnings = list(plan.warnings or [])
    for e in errors:
        warnings.append(e["message"] + " (treated as approximate)")
    if source == "heuristic":
        warnings.append("Draft produced by the built-in layout engine without a cloud model; connect AI_PROVIDER for richer architectural reasoning.")
    commands = _commands_from_geometry(rooms, walls, doors, windows)
    design = _design_from_geometry(req, rooms, walls, doors, windows, plot_w, plot_h)
    area = sum(r["width"] * r["height"] for r in rooms)

    counts: Dict[str, int] = {}
    for r in rooms:
        counts[r["type"]] = counts.get(r["type"], 0) + 1
    checks = [
        {"label": "Plot boundary valid", "passed": not any(e["type"] == "OUT_OF_BOUNDS" for e in result["errors"])},
        {"label": "No room overlaps", "passed": not any(e["type"] == "ROOM_OVERLAP" for e in result["errors"])},
        {"label": "Required adjacency satisfied", "passed": not any(e["type"] == "ADJACENCY_UNSATISFIED" for e in result["errors"])},
    ]
    return {
        "label": label,
        "summary": plan.summary,
        "rooms": rooms,
        "walls": walls,
        "doors": doors,
        "windows": windows,
        "commands": commands,
        "design": design,
        "score": score.model_dump(),
        "warnings": warnings,
        "assumptions": plan.assumptions,
        "counts": counts,
        "checks": checks,
        "seed": result["seed"],
        "attempts": result.get("attempts", 1),
        "totalArea": round(area, 1),
        "roomCount": len(rooms),
    }


async def generate_proposal(req: DesignGenerationRequest) -> Dict[str, Any]:
    """Full pipeline. Returns dict with success + proposal or success=False + error.

    One AI GenerationPlan is shared; `count` layout options (1-5, like A/B/C
    pickers) are produced by running the deterministic planner with different
    seeds through the repair loop.
    """
    plot_w, plot_h = req.plot_in_feet()
    seed = req.seed if req.seed is not None else 0
    count = max(1, min(5, req.count or 1))
    generation_id = f"generation_{uuid.uuid4().hex[:8]}"

    # 1. AI planning (once — architectural intent is shared across options)
    plan, source = await build_plan(req)

    # 2-4. layout + validate + repair, one seed per option
    options: List[Dict[str, Any]] = []
    first_failure = None
    for i in range(count):
        opt_seed = seed + i * 1013
        result = repair_loop(plan, plot_w, plot_h, opt_seed, MAX_GENERATION_ATTEMPTS)
        if not result["ok"] and i == 0:
            # attempt AI repair once with structured errors (spec #18)
            err_json = json.dumps(result["errors"][:6])
            from .ai_planning import llm_build_plan
            revised = await llm_build_plan(req, error_context=err_json)
            if revised is not None:
                plan = revised
                result2 = repair_loop(plan, plot_w, plot_h, opt_seed + 101, MAX_GENERATION_ATTEMPTS)
                if result2["ok"]:
                    result = result2
                elif len(result2.get("errors", [])) < len(result.get("errors", [])):
                    result = result2
        if not result["ok"]:
            if first_failure is None:
                first_failure = result
            continue
        options.append(_option_payload(req, plan, source, result, plot_w, plot_h, chr(ord("A") + i)))

    if not options:
        hard = (first_failure or {}).get("errors", []) if first_failure else []
        first = hard[0].get("message", "Layout invalid") if hard else "Layout invalid"
        return {
            "success": False,
            "generationId": generation_id,
            "message": f"I couldn't fit all required spaces inside the {req.plot.width}x{req.plot.depth} {req.plot.unit} footprint while maintaining the requested room sizes. {first}",
            "errors": hard,
            "suggestions": suggest_fixes(hard, plot_w, plot_h),
            "plan": plan.model_dump(),
            "planSource": source,
            "seed": seed,
            "count": count,
        }

    first = options[0]
    return {
        "success": True,
        "generationId": generation_id,
        "summary": plan.summary,
        "plan": plan.model_dump(),
        "planSource": source,
        # top-level fields mirror option A (backward compatible single-option shape)
        "rooms": first["rooms"],
        "walls": first["walls"],
        "doors": first["doors"],
        "windows": first["windows"],
        "commands": first["commands"],
        "design": first["design"],
        "score": first["score"],
        "warnings": first["warnings"],
        "assumptions": first["assumptions"],
        "counts": first["counts"],
        "checks": first["checks"],
        "seed": first["seed"],
        "attempts": first.get("attempts", 1),
        "totalArea": first["totalArea"],
        "roomCount": first["roomCount"],
        # multi-option picker (spec #27, like A/B/C/D/E)
        "options": options,
        "count": len(options),
    }
