from pydantic import BaseModel, Field, field_validator
from typing import Any, Dict, List, Literal, Optional

# Phase 2 command registry - fixed set, no arbitrary types
AICommandType = Literal[
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
]

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

class AICommand(BaseModel):
    id: Optional[str] = None
    type: str
    parameters: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        # normalize to uppercase
        up = v.upper().strip()
        if up not in ALLOWED_COMMANDS:
            raise ValueError(f"Unknown command type: {v}. Allowed: {sorted(ALLOWED_COMMANDS)}")
        return up

class AICommandResponse(BaseModel):
    message: str = ""
    commands: List[AICommand] = Field(default_factory=list)

class AICommandsRequest(BaseModel):
    projectId: Optional[str] = None
    floorId: Optional[str] = None
    prompt: str
    # optional design context override - if not provided, backend loads from DB
    design: Optional[Dict[str, Any]] = None
    history: Optional[List[Dict[str, str]]] = None

class DesignContextRoom(BaseModel):
    id: str
    name: str
    type: str
    x: float
    y: float
    width: float
    height: float
    area: float

class DesignContext(BaseModel):
    project: Dict[str, Any]
    floor: Dict[str, Any]
    rooms: List[DesignContextRoom]
    walls: List[Dict[str, Any]]
    doors: List[Dict[str, Any]]
    windows: List[Dict[str, Any]]
    objects: List[Dict[str, Any]]
    constraints: Dict[str, Any]
    units: str
