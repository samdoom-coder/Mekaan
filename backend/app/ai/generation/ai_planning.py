"""AI architectural planning: requirements -> GenerationPlan.

Reuses the Phase 2 provider abstraction (same AI_PROVIDER / AI_API_KEY /
AI_MODEL / AI_BASE_URL env config via get_provider()). The LLM only does
architectural reasoning and returns structured JSON validated by Pydantic.
Geometry is NEVER produced here — see planner.py.

Includes a deterministic Mock fallback so generation works offline and in
tests without an API key.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

from .prompts import GENERATION_SYSTEM_PROMPT, REPAIR_SYSTEM_PROMPT, build_generation_user_prompt
from .schemas import (
    DesignGenerationRequest,
    GeneratedRoomPlan,
    GenerationPlan,
    ROOM_TYPE_DEFAULTS,
    normalize_room_type,
)

_TYPE_LABELS = {
    "living-room": "Living Room",
    "master-bedroom": "Master Bedroom",
    "bedroom": "Bedroom",
    "kitchen": "Kitchen",
    "dining-room": "Dining Room",
    "bathroom": "Bathroom",
    "toilet": "Toilet",
    "study": "Study",
    "office": "Office",
    "family-room": "Family Room",
    "laundry": "Laundry",
    "pantry": "Pantry",
    "walk-in-closet": "Walk-in Closet",
    "utility": "Utility",
    "utility-room": "Utility Room",
    "prayer-room": "Prayer Room",
    "storage": "Storage",
    "store": "Store",
    "guest-room": "Guest Room",
    "garage": "Garage",
    "balcony": "Balcony",
    "patio": "Patio",
    "hall": "Hall",
    "other": "Room",
}


def _expand_request_rooms(req: DesignGenerationRequest) -> List[Dict[str, Any]]:
    """Expand RoomRequirement counts into individual room specs."""
    rooms: List[Dict[str, Any]] = []
    counters: Dict[str, int] = {}
    for rr in req.rooms:
        for i in range(rr.count):
            t = normalize_room_type(rr.type)
            counters[t] = counters.get(t, 0) + 1
            n = counters[t]
            base = _TYPE_LABELS.get(t, t.replace("-", " ").title())
            if t == "master-bedroom":
                name = "Master Bedroom" if rr.count == 1 else f"Master Bedroom {n}"
            elif t in ("bedroom",) and any(r.type == "master-bedroom" for r in req.rooms):
                name = f"Bedroom {n + 1}"
            elif rr.count > 1:
                name = f"{base} {n}"
            else:
                name = rr.name.strip() or base
                if not rr.name.strip():
                    # ensure bedroom numbering is sensible when master exists separately
                    pass
            if rr.name.strip() and rr.count == 1:
                name = rr.name.strip()
            rooms.append({
                "name": name,
                "type": t,
                "targetArea": rr.targetArea,
                "preferredWidth": rr.preferredWidth,
                "preferredHeight": rr.preferredHeight,
                "minWidth": rr.minWidth,
                "minHeight": rr.minHeight,
                "sizeMode": rr.sizeMode or "preferred",
                "required": rr.required,
            })
    # fix duplicate names
    seen: Dict[str, int] = {}
    for r in rooms:
        if r["name"] in seen:
            seen[r["name"]] += 1
            r["name"] = f"{r['name']} {seen[r['name']]}"
        else:
            seen[r["name"]] = 1
    return rooms


def _mentions_near(brief: str, words: List[str], target: str, window: int = 32) -> bool:
    """True if any of `words` appears in the same clause as `target`.

    The brief is split into clauses on [,.;] and 'and' so that
    'Master at rear, living near entrance' does NOT count 'rear' as
    describing the living room.
    """
    b = (brief or "").lower()
    clauses = re.split(r"[,.;]|\band\b", b)
    for cl in clauses:
        if target in cl and any(w in cl for w in words):
            return True
    return False


def _infer_position(room_type: str, room_name: str, prefs, brief: str) -> str:
    b = (brief or "").lower()
    if room_type == "living-room":
        if _mentions_near(b, ["rear", "back"], "living"):
            return "rear"
        if prefs.livingRoom == "center":
            return "center"
        if prefs.livingRoom == "rear":
            return "rear"
        return "front"
    if room_type == "master-bedroom":
        m = (prefs.masterBedroom or "rear").lower()
        if _mentions_near(b, ["front"], "master"):
            return "front"
        return m if m in ("front", "rear", "left", "right", "center") else "rear"
    if room_type == "bedroom" or room_type == "guest-room":
        if prefs.bedrooms == "separated":
            return "left" if hash(room_name) % 2 == 0 else "right"
        return "rear"
    if room_type == "kitchen":
        if _mentions_near(b, ["front"], "kitchen"):
            return "front"
        return "rear" if prefs.kitchen == "rear" else "front"
    if room_type == "dining-room":
        return "front"
    if room_type in ("bathroom", "toilet"):
        return "rear"
    if room_type == "garage":
        return "front"
    if room_type in ("balcony", "patio"):
        return "rear"
    if room_type == "hall":
        return "center"
    return "any"


def mock_build_plan(req: DesignGenerationRequest) -> GenerationPlan:
    """Deterministic offline plan builder (no LLM). Parses brief for hints."""
    brief = req.brief or ""
    expanded = _expand_request_rooms(req)
    names = [r["name"] for r in expanded]
    by_type: Dict[str, List[str]] = {}
    for r in expanded:
        by_type.setdefault(r["type"], []).append(r["name"])

    # relationships: start from explicit request
    rels: List[Dict[str, Any]] = [
        {"sourceRoom": r.sourceRoom, "relationship": r.relationship,
         "targetRoom": r.targetRoom, "strength": r.strength}
        for r in req.relationships
    ]

    def has_rel(s: str, t: str) -> bool:
        return any(x["sourceRoom"] == s and x["targetRoom"] == t for x in rels)

    kitchens = by_type.get("kitchen", [])
    dinings = by_type.get("dining-room", [])
    livings = by_type.get("living-room", [])
    masters = by_type.get("master-bedroom", [])
    baths = by_type.get("bathroom", []) + by_type.get("toilet", [])
    bedrooms = by_type.get("bedroom", []) + by_type.get("guest-room", [])

    for k in kitchens:
        for d in dinings:
            if not has_rel(k, d):
                rels.append({"sourceRoom": k, "relationship": "ADJACENT", "targetRoom": d, "strength": "preferred"})
    for lv in livings:
        for d in dinings:
            if not has_rel(lv, d):
                rels.append({"sourceRoom": lv, "relationship": "NEAR", "targetRoom": d, "strength": "preferred"})
    # attached baths: first bath -> master, second -> bedroom 2, etc.
    attach_targets = masters + bedrooms
    for i, bname in enumerate(baths):
        tgt = attach_targets[i % len(attach_targets)] if attach_targets else None
        if tgt and not has_rel(bname, tgt):
            rels.append({"sourceRoom": bname, "relationship": "ATTACHED", "targetRoom": tgt,
                         "strength": "required" if i == 0 and masters else "preferred"})
    # brief hints: "away from entrance" -> FAR
    if "away from" in brief.lower() and bedrooms:
        for bed in bedrooms:
            if not has_rel(bed, livings[0] if livings else "Living Room"):
                if livings:
                    rels.append({"sourceRoom": bed, "relationship": "FAR", "targetRoom": livings[0], "strength": "preferred"})

    # filter rels to known rooms (keep Entrance references out of planner hard checks — validator skips unknown)
    filtered = []
    name_set = set(names)
    for r in rels:
        if r["sourceRoom"] in name_set and r["targetRoom"] in name_set:
            filtered.append(r)
        elif r["sourceRoom"] in name_set or r["targetRoom"] in name_set:
            # keep NEAR/FAR to entrance-like targets as preferred only (validator ignores unknown non-required)
            if r["strength"] == "preferred":
                filtered.append(r)

    room_plans = []
    for r in expanded:
        pos = _infer_position(r["type"], r["name"], req.preferences, brief)
        room_rels = [x for x in filtered if x["sourceRoom"] == r["name"]][:3]
        room_plans.append(GeneratedRoomPlan(
            name=r["name"], type=r["type"],
            targetArea=r["targetArea"], preferredWidth=r["preferredWidth"],
            preferredHeight=r["preferredHeight"], minWidth=r["minWidth"], minHeight=r["minHeight"],
            preferredPosition=pos, relationships=room_rels,
        ))
    # top-level relationships = those not already embedded (avoid dup)
    embedded = {(rr["sourceRoom"], rr["targetRoom"]) for rp in room_plans for rr in [x.model_dump() for x in rp.relationships]}
    top_level = [x for x in filtered if (x["sourceRoom"], x["targetRoom"]) not in embedded]

    entrance_side = (req.preferences.entrance or "front").lower()
    if entrance_side not in ("front", "rear", "left", "right"):
        entrance_side = "front"
    # brief override
    bl = brief.lower()
    if "rear entrance" in bl or "entrance at rear" in bl or "entrance rear" in bl:
        entrance_side = "rear"

    from .schemas import EntrancePlan
    assumptions = [
        f"Main entrance assumed on the {entrance_side} side.",
        "Room dimensions treated as preferred rather than exact unless marked required.",
        "Bedrooms prioritized for quieter rear zone with natural light.",
    ]
    if req.brief:
        assumptions.append("Free-form brief used for adjacency and zoning hints.")
    warnings = ["Conceptual schematic layout — review by a qualified professional before construction."]
    plot_w, plot_d = req.plot_in_feet()
    total_area = sum(
        (r.preferredWidth or ROOM_TYPE_DEFAULTS.get(r.type, {}).get("width", 10))
        * (r.preferredHeight or ROOM_TYPE_DEFAULTS.get(r.type, {}).get("height", 10))
        for r in room_plans
    )
    if total_area > plot_w * plot_d * 0.9:
        warnings.insert(0, "Requested room sizes cover most of the footprint — circulation space is tight; sizes were treated as flexible.")
    summary_bits = []
    beds = len(by_type.get("bedroom", [])) + len(by_type.get("master-bedroom", []))
    if beds:
        summary_bits.append(f"{beds}-bedroom")
    if baths:
        summary_bits.append(f"{len(baths)}-bath")
    summary = f"A compact {' '.join(summary_bits)} layout on a {req.plot.width}x{req.plot.depth} {req.plot.unit} plot" if summary_bits else "A compact schematic layout"
    summary += " with the master bedroom at the rear, kitchen adjacent to dining, and living near the entrance."
    return GenerationPlan(
        summary=summary, assumptions=assumptions, rooms=room_plans,
        relationships=top_level,
        entrance=EntrancePlan(side=entrance_side, position=0.5),
        warnings=warnings, confidence=0.8,
    )


def _requirements_to_json(req: DesignGenerationRequest) -> str:
    expanded = _expand_request_rooms(req)
    plot_w, plot_d = req.plot_in_feet()
    data = {
        "plot_ft": {"width": round(plot_w, 2), "depth": round(plot_d, 2)},
        "floors": req.floors,
        "rooms": expanded,
        "relationships": [r.model_dump() for r in req.relationships],
        "preferences": req.preferences.model_dump(),
        "brief": req.brief or "",
    }
    return json.dumps(data, indent=1)


async def llm_build_plan(req: DesignGenerationRequest, error_context: Optional[str] = None) -> Optional[GenerationPlan]:
    """Call the configured provider's LLM to produce a GenerationPlan. Returns None on mock/no-key/failure."""
    from app.ai.provider import get_provider, MockProvider  # local import to avoid cycles
    from app.ai.provider import OpenAICompatibleProvider, GeminiProvider, AnthropicProvider

    provider = get_provider()
    if isinstance(provider, MockProvider):
        return None
    user_prompt = build_generation_user_prompt(_requirements_to_json(req))
    if error_context:
        user_prompt += f"\n\nPrevious attempt failed validation with these structured errors — revise the plan:\n{error_context}\n"
    system = REPAIR_SYSTEM_PROMPT if error_context else GENERATION_SYSTEM_PROMPT

    import httpx
    raw_text: Optional[str] = None
    try:
        if isinstance(provider, OpenAICompatibleProvider):
            url = f"{provider.base_url}/chat/completions"
            headers = {"Authorization": f"Bearer {provider.api_key}", "Content-Type": "application/json"}
            payload: Dict[str, Any] = {
                "model": provider.model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_prompt}],
                "temperature": 0.3, "max_tokens": 2500, "response_format": {"type": "json_object"},
            }
            async with httpx.AsyncClient(timeout=provider.timeout + 10) as client:
                try:
                    resp = await client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                except Exception as e:
                    # retry without response_format
                    if "response_format" in str(getattr(getattr(e, "response", None), "text", "") or "").lower():
                        p2 = {k: v for k, v in payload.items() if k != "response_format"}
                        resp = await client.post(url, headers=headers, json=p2)
                        resp.raise_for_status()
                    else:
                        raise
                data = resp.json()
                raw_text = data["choices"][0]["message"]["content"]
        elif isinstance(provider, GeminiProvider):
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{provider.model}:generateContent?key={provider.api_key}"
            async with httpx.AsyncClient(timeout=provider.timeout + 10) as client:
                resp = await client.post(url, headers={"Content-Type": "application/json"}, json={
                    "systemInstruction": {"parts": [{"text": system}]},
                    "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 3000, "responseMimeType": "application/json"},
                })
                resp.raise_for_status()
                data = resp.json()
                cands = data.get("candidates") or []
                raw_text = "".join(p.get("text", "") for p in cands[0].get("content", {}).get("parts", [])) if cands else ""
        elif isinstance(provider, AnthropicProvider):
            async with httpx.AsyncClient(timeout=provider.timeout + 10) as client:
                resp = await client.post("https://api.anthropic.com/v1/messages", headers={
                    "x-api-key": provider.api_key, "Content-Type": "application/json", "anthropic-version": "2023-06-01"},
                    json={"model": provider.model, "max_tokens": 2500, "temperature": 0.3,
                          "system": system, "messages": [{"role": "user", "content": user_prompt}]})
                resp.raise_for_status()
                data = resp.json()
                blocks = data.get("content") or []
                raw_text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        else:
            return None
    except Exception as e:
        print(f"[Phase3] LLM plan error: {e}")
        return None

    if not raw_text:
        return None
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if not m:
            print("[Phase3] LLM returned non-JSON plan")
            return None
        parsed = json.loads(m.group(0))
    try:
        return GenerationPlan(**parsed)
    except Exception as e:
        print(f"[Phase3] LLM plan schema invalid: {e}")
        return None


async def build_plan(req: DesignGenerationRequest, error_context: Optional[str] = None) -> tuple[GenerationPlan, str]:
    """Returns (plan, source) where source is 'ai' or 'heuristic'."""
    plan = await llm_build_plan(req, error_context)
    if plan is not None and len(plan.rooms) >= 1:
        # sanitize room types
        for r in plan.rooms:
            r.type = normalize_room_type(r.type)
        return plan, "ai"
    return mock_build_plan(req), "heuristic"
