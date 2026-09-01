from typing import Dict, Any, List, Tuple

ALLOWED_COMMANDS = {
    "CREATE_ROOM",
    "DELETE_ROOM",
    "MOVE_ROOM",
    "RESIZE_ROOM",
    "CREATE_WALL",
    "DELETE_WALL",
    "CREATE_DOOR",
    "DELETE_DOOR",
    "CREATE_WINDOW",
    "DELETE_WINDOW",
    "MOVE_OBJECT",
    "RESIZE_OBJECT",
}

# Required params per command
REQUIRED_PARAMS = {
    "CREATE_ROOM": [["roomType", "room_type", "type"]],  # at least one of these
    "DELETE_ROOM": [["roomId", "room_id"]],
    "MOVE_ROOM": [["roomId", "room_id"]],
    "RESIZE_ROOM": [["roomId", "room_id"]],
    "CREATE_WALL": [["start", "end"]],  # or need at least start/end
    "DELETE_WALL": [["wallId", "wall_id"]],
    "CREATE_DOOR": [["wallId", "wall_id"]],
    "DELETE_DOOR": [["doorId", "door_id", "id"]],
    "CREATE_WINDOW": [["wallId", "wall_id", "roomId", "room_id"]],  # wallId or roomId (executor will resolve roomId -> wall)
    "DELETE_WINDOW": [["windowId", "window_id", "id"]],
    "MOVE_OBJECT": [["objectId", "object_id", "id"]],
    "RESIZE_OBJECT": [["objectId", "object_id", "id"]],
}

def validate_commands(commands: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Validate command schema per Phase 2 #4.
    Rejects unknown types, missing params.
    Returns (valid_commands, errors)
    """
    valid: List[Dict[str, Any]] = []
    errors: List[str] = []

    if not isinstance(commands, list):
        return [], ["Commands must be a list"]

    for idx, raw in enumerate(commands):
        if not isinstance(raw, dict):
            errors.append(f"Command {idx} must be an object")
            continue
        ctype = raw.get("type")
        if not ctype or not isinstance(ctype, str):
            errors.append(f"Command {idx} missing type")
            continue
        up = ctype.upper().strip()
        if up not in ALLOWED_COMMANDS:
            errors.append(f"Unknown command type '{ctype}' at index {idx}. Allowed: {sorted(ALLOWED_COMMANDS)}")
            continue

        params = raw.get("parameters")
        if params is None:
            params = {}
            raw["parameters"] = params
        if not isinstance(params, dict):
            errors.append(f"Command {up} parameters must be an object")
            continue

        # Normalize type to uppercase
        raw["type"] = up

        # Check required params
        req_groups = REQUIRED_PARAMS.get(up, [])
        missing = []
        for group in req_groups:
            if not any(k in params and params[k] not in (None, "") for k in group):
                missing.append("/".join(group))
        if missing:
            errors.append(f"Command {up} missing required parameters: {', '.join(missing)}")
            continue

        # Additional safety checks per Phase 2 #20
        # Prevent bulk delete without confirmation - flag if more than 3 deletes
        # Validate numeric params where applicable
        if up == "RESIZE_ROOM":
            # must have at least one of width/height/widthDelta/heightDelta
            has_size = any(k in params for k in ["width", "height", "widthDelta", "heightDelta", "width_delta", "height_delta", "w", "h"])
            if not has_size:
                errors.append(f"Command RESIZE_ROOM requires width/height or widthDelta/heightDelta")
                continue

        if up == "MOVE_ROOM":
            has_pos = any(k in params for k in ["x", "y", "position", "nearRoomId", "near_room_id", "dx", "dy"])
            if not has_pos:
                errors.append(f"Command MOVE_ROOM requires position (x/y or position string)")
                continue

        # ensure id field
        if "id" not in raw:
            import uuid
            raw["id"] = f"cmd_{uuid.uuid4().hex[:8]}"

        valid.append(raw)

    # safety: reject bulk destructive if >5 deletes in one batch without explicit confirmation
    delete_count = sum(1 for c in valid if c["type"].startswith("DELETE_"))
    if delete_count > 5:
        errors.append(f"Bulk delete of {delete_count} items rejected - requires confirmation. Max 5 per request.")

    return valid, errors

def validate_single_command(cmd: Dict[str, Any]) -> Tuple[bool, str]:
    v, e = validate_commands([cmd])
    if e:
        return False, "; ".join(e)
    return True, ""
