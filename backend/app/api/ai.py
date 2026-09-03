from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, List, Optional, Dict
from sqlalchemy.orm import Session
import os

from app.core.database import get_db
from app.models.project import Project
from app.ai.provider import get_provider, get_provider_info
from app.ai.context import build_design_context
from app.ai.validator import validate_commands
from app.ai.resolver import resolve_entities_in_commands
from app.ai.schemas import AICommandResponse
from app.ai.generation.schemas import DesignGenerationRequest as Phase3Request

router = APIRouter(prefix="/ai", tags=["ai"])

class GenerateRequest(BaseModel):
    prompt: str
    constraints: Optional[List[Any]] = None

class AICommandsRequest(BaseModel):
    prompt: str
    projectId: Optional[str] = None
    floorId: Optional[str] = None
    design: Optional[Dict[str, Any]] = None
    history: Optional[List[Dict[str, str]]] = None

# Legacy mock endpoint kept for compatibility (renamed to avoid colliding
# with Phase 3 POST /ai/generate which takes a DesignGenerationRequest).
@router.post("/generate-legacy")
def generate_legacy(req: GenerateRequest):
    prompt = req.prompt.lower()
    commands = []
    if "kitchen" in prompt and "larger" in prompt:
        commands.append({"type": "RESIZE_ROOM", "parameters": {"roomType": "kitchen", "widthDelta": 2}})
    elif "bathroom" in prompt:
        commands.append({"type": "CREATE_ROOM", "parameters": {"roomType": "bathroom", "near": "master-bedroom"}})
    elif "window" in prompt:
        commands.append({"type": "CREATE_WINDOW", "parameters": {"roomType": "living-room"}})
    elif "bedroom" in prompt:
        commands.append({"type": "CREATE_ROOM", "parameters": {"roomType": "bedroom", "x": 5, "y": 5, "width": 10, "height": 10}})
    else:
        commands.append({"type": "CREATE_ROOM", "parameters": {"roomType": "other"}})
    return {"message": "Mock response", "commands": commands}

@router.post("/command")
def command(req: GenerateRequest):
    return generate_legacy(req)

class GenerateFloorplanRequest(BaseModel):
    name: Optional[str] = "AI House"
    plotWidth: float = 40
    plotDepth: float = 60
    plotShape: Optional[Any] = None  # e.g., {"type":"rectangle"} or {"type":"ai"} for AI decides
    units: Optional[str] = "feet"
    propertyType: Optional[str] = "residential"
    # Requirements counts
    bedrooms: Optional[int] = 2
    bathrooms: Optional[int] = 2
    toilets: Optional[int] = 0
    kitchens: Optional[int] = 1
    livingRooms: Optional[int] = 1
    diningRooms: Optional[int] = 1
    studies: Optional[int] = 0
    balconies: Optional[int] = 0
    garages: Optional[int] = 0
    stores: Optional[int] = 0
    utilities: Optional[int] = 0
    additionalRooms: Optional[List[Any]] = None
    preferences: Optional[str] = None
    count: Optional[int] = 3  # 3 or 4

@router.post("/generate-floorplans")
async def generate_floorplans(req: GenerateFloorplanRequest):
    """
    New AI Generation: create 3-4 floor plans from requirements.
    Works with any provider (mock heuristic + LLM). Called during New Project with AI toggle.
    """
    from app.ai.generator import generate_floorplans as gen_floorplans, options_to_designs
    # normalize
    w = float(req.plotWidth or 40)
    h = float(req.plotDepth or 60)
    if w < 10: w = 40
    if h < 10: h = 60
    count = int(req.count or 3)
    count = max(1, min(4, count))
    # plotShape handling: if string "ai" or missing and user wants AI to decide, pass {"type":"ai"}
    shape = req.plotShape
    if isinstance(shape, str):
        if shape.lower() in ("ai", "auto", "ai_decides"):
            shape = {"type": "ai"}
        else:
            shape = {"type": shape}
    if not shape:
        shape = {"type": "rectangle"}
    requirements = {
        "bedrooms": req.bedrooms,
        "bathrooms": req.bathrooms,
        "toilets": req.toilets,
        "kitchens": req.kitchens,
        "livingRooms": req.livingRooms,
        "diningRooms": req.diningRooms,
        "studies": req.studies,
        "balconies": req.balconies,
        "garages": req.garages,
        "stores": req.stores,
        "utilities": req.utilities,
        "additionalRooms": req.additionalRooms,
    }
    prefs = req.preferences or ""
    # clamp counts 0-5
    for k in list(requirements.keys()):
        if k == "additionalRooms":
            continue
        try:
            v = int(requirements[k] or 0)
            requirements[k] = max(0, min(6, v))
        except:
            requirements[k] = 0

    options = await gen_floorplans(w, h, shape, requirements, req.units or "feet", req.propertyType or "residential", prefs, count)
    designs = options_to_designs(options, w, h, shape, req.units or "feet", req.propertyType or "residential", req.name or "AI House")
    return {"options": designs, "count": len(designs), "requirements": requirements, "plot": {"width": w, "depth": h, "shape": shape}}

@router.post("/generate-floorplan")
async def generate_floorplan(req: GenerateFloorplanRequest):
    return await generate_floorplans(req)

@router.get("/providers")
def list_providers():
    """Debug helper - shows current provider config (without exposing key)"""
    return get_provider_info()

@router.get("/health")
def ai_health():
    info = get_provider_info()
    return {"status": "ok", "provider": info["provider"], "model": info["model"], "base_url": info["base_url"], "has_key": info["has_key"]}

@router.post("/commands")
async def ai_commands(req: AICommandsRequest, db: Session = Depends(get_db)):
    """
    Phase 2 endpoint: POST /api/ai/commands
    Steps per spec #9:
      1. Load current design (from DB or supplied design)
      2. Build compact DesignContext
      3. Send context + prompt to AI provider (universal: openai/openrouter/gmi/gemini/anthropic/mock)
      4. Receive structured commands
      5. Validate schema
      6. Resolve entities
      7. Return validated commands (do NOT mutate DB here - frontend applies via operation system)
    """
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    # 1. Load design
    design = req.design
    project_id = req.projectId
    if not design and project_id:
        proj = db.query(Project).filter(Project.id == project_id).first()
        if proj and proj.design:
            design = proj.design
        elif proj:
            # fallback minimal design from project row
            design = {
                "id": proj.id,
                "name": proj.name,
                "units": proj.units,
                "site": {"width": proj.site_width, "depth": proj.site_depth},
                "floors": [{"id": req.floorId or "floor_1", "width": proj.site_width, "height": proj.site_depth, "rooms": [], "walls": [], "doors": [], "windows": [], "objects": []}],
            }
    if not design:
        # try to find any design if project not provided but prompt needs context
        # still allow empty context - mock will work
        design = {
            "id": "unknown",
            "name": "Untitled",
            "units": "feet",
            "site": {"width": 40, "depth": 60},
            "floors": [{"id": req.floorId or "floor_ground", "width": 40, "height": 60, "rooms": [], "walls": [], "doors": [], "windows": [], "objects": []}]
        }

    # 2. Build compact context
    floor_id = req.floorId
    # if not provided, try to infer from design
    if not floor_id and design.get("floors"):
        floor_id = design["floors"][0].get("id")
    context = build_design_context(design, floor_id)

    # 3. Call provider
    provider = get_provider()
    result = await provider.generate_commands(req.prompt, context, req.history)

    raw_commands = result.get("commands") or []
    message = result.get("message") or ""

    # Ensure commands are list
    if isinstance(raw_commands, dict):
        raw_commands = [raw_commands]

    # 4. Resolve entities (local resolver per Phase 2 #7)
    resolved_commands, resolve_errors = resolve_entities_in_commands(raw_commands, context)

    # 5. Validate
    valid_commands, validation_errors = validate_commands(resolved_commands)

    # Combine errors
    all_errors = resolve_errors + validation_errors

    # If there were errors but we have valid commands, still return valid ones with warning message
    # If all failed, return message explaining
    if all_errors and not valid_commands:
        # append errors to message for explainability Phase 2 #18
        err_text = "; ".join(all_errors)
        if not message:
            message = f"Could not process request: {err_text}"
        else:
            # keep provider message but add context
            if len(all_errors) <= 2:
                message = f"{message} ({err_text})"
        return {
            "message": message,
            "commands": [],
            "errors": all_errors,
            "context": context,  # for debugging - minimal
            "provider": get_provider_info(),
        }

    # If provider indicated error via _error
    provider_error = result.get("_error")
    if provider_error:
        # still return valid commands if any, but flag
        return {
            "message": message or f"Provider warning: {provider_error[:200]}",
            "commands": valid_commands,
            "errors": all_errors,
            "provider_error": provider_error[:500],
            "context": context,
        }

    # Successful
    # If no commands but message exists (unsupported request handling Phase 2 #19), return as is
    if not valid_commands and not all_errors:
        # likely legitimate no-op like "make luxurious"
        return {
            "message": message or "I can modify the floor-plan layout, rooms, walls, doors and windows right now.",
            "commands": [],
            "context": context,
        }

    return {
        "message": message or f"Generated {len(valid_commands)} command(s).",
        "commands": valid_commands,
        "errors": all_errors if all_errors else None,
        "context": context,
    }


@router.post("/generate")
async def ai_generate(req: Phase3Request):
    """Phase 3: POST /api/ai/generate — full floor-plan generation.

    Pipeline: normalize -> AI planning (GenerationPlan) -> deterministic
    layout planner -> constraint validation -> repair -> proposal.
    Returns strongly-typed proposal with commands + preview design.
    The AI never emits geometry directly; Pydantic validates everything.
    """
    from app.ai.generation.generator import generate_proposal

    try:
        result = await generate_proposal(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not result.get("success"):
        # 422 with structured suggestions (spec #30) — still JSON, not silent
        return result
    return result
