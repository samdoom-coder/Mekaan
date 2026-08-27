from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any, List, Optional

router = APIRouter(prefix="/ai", tags=["ai"])

class GenerateRequest(BaseModel):
    prompt: str
    constraints: Optional[List[Any]] = []

@router.post("/generate")
def generate(req: GenerateRequest):
    # Mock AI: return commands structure
    prompt = req.prompt.lower()
    commands = []
    if "kitchen" in prompt and "larger" in prompt:
        commands.append({"type": "resize_room", "parameters": {"roomType": "kitchen", "widthDelta": 2}})
    elif "bathroom" in prompt:
        commands.append({"type": "add_room", "parameters": {"roomType": "bathroom", "near": "master-bedroom"}})
    elif "window" in prompt:
        commands.append({"type": "add_window", "parameters": {"roomType": "living-room"}})
    elif "bedroom" in prompt:
        commands.append({"type": "create_room", "parameters": {"roomType": "bedroom", "x": 5, "y": 5, "width": 10, "height": 10}})
    else:
        commands.append({"type": "create_room", "parameters": {"roomType": "other"}})
    return {"commands": commands}

@router.post("/command")
def command(req: GenerateRequest):
    return generate(req)
