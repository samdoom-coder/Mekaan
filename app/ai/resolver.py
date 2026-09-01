from typing import Dict, Any, List, Optional, Tuple
import re
import difflib

# Alias map for natural language entity resolution per Phase 2 #7
ROOM_ALIASES: Dict[str, List[str]] = {
    "master-bedroom": ["master", "master bedroom", "main bedroom", "primary bedroom", "master bed", "main bed"],
    "bedroom": ["bedroom", "bed room", "guest room", "second bedroom", "bedroom 2", "bedroom 3", "bed 2", "bed 3"],
    "living-room": ["living", "living room", "lounge", "family room", "living area"],
    "kitchen": ["kitchen", "cook area", "cooking area"],
    "dining-room": ["dining", "dining room", "dining area"],
    "bathroom": ["bathroom", "bath", "washroom", "restroom", "toilet", "wc", "bath room", "second bathroom", "bath 2"],
    "hall": ["hall", "hallway", "corridor", "passage"],
    "garage": ["garage", "parking"],
    "balcony": ["balcony", "terrace", "deck"],
    "study": ["study", "office", "work room"],
    "utility": ["utility", "utility room", "laundry"],
    "store": ["store", "storage", "store room"],
}

def _normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def _score_match(query: str, candidate: str) -> float:
    q = _normalize(query)
    c = _normalize(candidate)
    if q == c:
        return 1.0
    if q in c or c in q:
        return 0.85
    # difflib ratio
    return difflib.SequenceMatcher(None, q, c).ratio()

def resolve_room_reference(query: str, rooms: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Resolve natural language room reference to actual room.
    Uses exact name, type, aliases, fuzzy matching per Phase 2.
    Returns (best_match, candidates) - candidates >1 means ambiguous.
    """
    if not query or not rooms:
        return None, []

    q_norm = _normalize(query)
    scored: List[Tuple[float, Dict[str, Any]]] = []

    for room in rooms:
        name = room.get("name") or ""
        rtype = room.get("type") or ""
        rid = room.get("id") or ""

        # exact id match highest priority
        if _normalize(rid) == q_norm:
            return room, [room]

        # exact name match
        best = 0.0
        # compare query to room name
        best = max(best, _score_match(query, name))
        # compare query to room type
        best = max(best, _score_match(query, rtype))
        # check aliases for this room's type
        aliases = ROOM_ALIASES.get(rtype, []) + ROOM_ALIASES.get(_normalize(rtype), [])
        for alias in aliases:
            best = max(best, _score_match(query, alias) * 0.95)  # slight penalty for alias
            if _normalize(alias) == q_norm:
                best = 0.98

        # also split query words - handle "master" alone when room is "Master Bedroom"
        # boosted if query is substring of name/type
        if q_norm in _normalize(name) or q_norm in _normalize(rtype):
            best = max(best, 0.90)

        # handle ordinal like "second bathroom" -> match bathroom with logic
        # if query contains ordinal and room name contains matching number
        if best > 0.35:
            scored.append((best, room))

    if not scored:
        return None, []

    scored.sort(key=lambda x: x[0], reverse=True)
    best_score = scored[0][0]
    # threshold
    if best_score < 0.45:
        return None, []

    # collect near ties (ambiguous)
    candidates = [r for s, r in scored if s >= best_score - 0.08 and s >= 0.6]
    # if top is clearly better than second, return single
    if len(candidates) == 1:
        return candidates[0], candidates
    # if multiple have very close scores -> ambiguous
    if len(candidates) > 1:
        # check if one is exact name match -> prefer it
        exact = [r for s, r in scored if s >= 0.99]
        if len(exact) == 1:
            return exact[0], exact
        return None, candidates  # ambiguous - caller should ask clarify

    return scored[0][1], [scored[0][1]]

def resolve_entities_in_commands(commands: List[Dict[str, Any]], context: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Apply local entity resolution layer.
    Translates natural references like "master" -> roomId.
    Does not rely solely on LLM per Phase 2 #7.
    Returns (resolved_commands, errors)
    """
    rooms = context.get("rooms") or []
    errors: List[str] = []
    resolved: List[Dict[str, Any]] = []

    for cmd in commands:
        ctype = (cmd.get("type") or "").upper()
        params = dict(cmd.get("parameters") or {})
        cmd_copy = {"type": ctype, "parameters": params}
        if "id" in cmd:
            cmd_copy["id"] = cmd["id"]

        # Resolve roomId references
        # Possible param keys that refer to rooms
        room_keys = ["roomId", "room_id", "targetRoomId", "nearRoomId", "near_room_id", "near"]
        # Also check string values that look like room names rather than IDs
        for key in list(params.keys()):
            if key in room_keys or key.lower().endswith("roomid") or key == "near":
                val = params[key]
                if isinstance(val, str):
                    # check if val already matches a room id exactly
                    exists = any(r.get("id") == val for r in rooms)
                    if exists:
                        # normalize key to roomId/nearRoomId
                        continue
                    # try to resolve as name/type reference
                    match, candidates = resolve_room_reference(val, rooms)
                    if match:
                        # normalize key name
                        if key == "near":
                            params["nearRoomId"] = match["id"]
                            if "near" in params:
                                del params["near"]
                        else:
                            # keep original key but update value to id
                            params[key] = match["id"]
                    else:
                        if candidates:
                            errors.append(f"Ambiguous room reference '{val}' matches multiple rooms: {', '.join(r.get('name') for r in candidates)}. Please be more specific.")
                        else:
                            # allow LLM to have provided correct id but not found? treat as error
                            # check if param was supposed to be roomId - report
                            if key in ["roomId", "room_id", "targetRoomId"]:
                                errors.append(f"Could not find room '{val}'. Available: {', '.join(r.get('name') for r in rooms)}")
                            # else ignore (maybe future)
                        # keep original for validation to catch

        # Resolve wallId similarly if needed (less critical)
        # Handle roomType normalization for CREATE_ROOM
        if ctype == "CREATE_ROOM":
            rt = params.get("roomType") or params.get("room_type") or params.get("type")
            if rt and isinstance(rt, str):
                # normalize roomType to canonical
                rt_norm = _normalize(rt)
                # map aliases to canonical
                for canonical, aliases in ROOM_ALIASES.items():
                    if rt_norm == canonical or rt_norm in [_normalize(a) for a in aliases]:
                        params["roomType"] = canonical
                        break
                    # fuzzy
                    if _score_match(rt, canonical) > 0.85:
                        params["roomType"] = canonical
                        break
                else:
                    # keep as is but lowercase hyphen
                    params["roomType"] = rt_norm.replace(" ", "-")

        resolved.append(cmd_copy)

    return resolved, errors
