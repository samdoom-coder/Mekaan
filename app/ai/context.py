from typing import Any, Dict, List

def build_design_context(design: Dict[str, Any], floor_id: str | None = None) -> Dict[str, Any]:
    """
    Reusable compact DesignContext builder per Phase 2 #21.
    Produces minimal data needed for AI to resolve entities & generate commands.
    Used by: AI command mode, future generation/analysis/optimization.
    """
    if not design:
        return {
            "project": {"name": "Unknown"},
            "floor": {"width": 40, "height": 60},
            "rooms": [],
            "walls": [],
            "doors": [],
            "windows": [],
            "objects": [],
            "constraints": {"minRoomSize": 6, "units": "feet"},
            "units": "feet",
        }

    floors = design.get("floors") or []
    floor = None
    if floor_id:
        floor = next((f for f in floors if f.get("id") == floor_id), None)
    if not floor and floors:
        floor = floors[0]

    if not floor:
        floor = {"id": "floor_1", "width": 40, "height": 60, "rooms": [], "walls": [], "doors": [], "windows": [], "objects": []}

    # compact rooms
    rooms_ctx = []
    for r in floor.get("rooms") or []:
        rooms_ctx.append({
            "id": r.get("id"),
            "name": r.get("name"),
            "type": r.get("type"),
            "x": r.get("x"),
            "y": r.get("y"),
            "width": r.get("width"),
            "height": r.get("height"),
            "area": round(float(r.get("width", 0)) * float(r.get("height", 0)), 1),
        })

    # compact walls - include start/end, type
    walls_ctx = []
    for w in (floor.get("walls") or [])[:20]:  # limit to 20 for token efficiency
        walls_ctx.append({
            "id": w.get("id"),
            "start": w.get("start"),
            "end": w.get("end"),
            "type": w.get("type"),
            "length": round(((w.get("end", {}).get("x", 0) - w.get("start", {}).get("x", 0))**2 + (w.get("end", {}).get("y", 0) - w.get("start", {}).get("y", 0))**2)**0.5, 1),
        })

    doors_ctx = [{"id": d.get("id"), "wallId": d.get("wallId"), "width": d.get("width")} for d in (floor.get("doors") or [])[:20]]
    windows_ctx = [{"id": w.get("id"), "wallId": w.get("wallId"), "width": w.get("width")} for w in (floor.get("windows") or [])[:20]]
    objects_ctx = [{"id": o.get("id"), "type": o.get("type"), "x": o.get("x"), "y": o.get("y"), "width": o.get("width"), "height": o.get("height")} for o in (floor.get("objects") or [])[:20]]

    site = design.get("site") or {}
    # handle both site.width/depth and plotWidth logic
    floor_width = floor.get("width") or site.get("width") or 40
    floor_height = floor.get("height") or site.get("depth") or 60

    return {
        "project": {
            "name": design.get("name") or "Untitled Project",
            "propertyType": design.get("propertyType") or "residential",
        },
        "floor": {
            "id": floor.get("id"),
            "name": floor.get("name") or "Ground Floor",
            "width": floor_width,
            "height": floor_height,
        },
        "site": {
            "width": site.get("width") or floor_width,
            "depth": site.get("depth") or floor_height,
        },
        "rooms": rooms_ctx,
        "walls": walls_ctx,
        "doors": doors_ctx,
        "windows": windows_ctx,
        "objects": objects_ctx,
        "constraints": {
            "minRoomSize": 6,
            "units": design.get("units") or "feet",
            "floorBoundary": {"width": floor_width, "height": floor_height},
        },
        "units": design.get("units") or "feet",
    }


def context_to_prompt_text(ctx: Dict[str, Any]) -> str:
    """Serialize context to compact JSON string for prompt - token efficient."""
    import json
    return json.dumps(ctx, separators=(",", ":"), ensure_ascii=False)
