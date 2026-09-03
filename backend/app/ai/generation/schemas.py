"""Phase 3 — AI floor-plan generation schemas.

Separation of responsibilities (spec #44):
  AI -> architectural reasoning (GenerationPlan)
  Layout Planner -> spatial arrangement (geometry)
  Constraint Engine -> validation
  Command System -> mutation
  Design Model -> source of truth
  Renderer -> visualization

The AI NEVER emits coordinates/SVG/JS. It emits a GenerationPlan.
The planner emits geometry. Pydantic validates everything.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

Unit = Literal["ft", "feet", "m", "meters", "cm", "centimeters", "in", "inches"]

SpatialRelationship = Literal[
    "ADJACENT",
    "NEAR",
    "FAR",
    "INSIDE",
    "FRONT_OF",
    "BEHIND",
    "LEFT_OF",
    "RIGHT_OF",
    "ATTACHED",
    "ACCESSIBLE_FROM",
]

ALLOWED_RELATIONSHIPS = {
    "ADJACENT", "NEAR", "FAR", "INSIDE", "FRONT_OF", "BEHIND",
    "LEFT_OF", "RIGHT_OF", "ATTACHED", "ACCESSIBLE_FROM",
}

PreferredPosition = Literal["front", "rear", "left", "right", "center", "any"]

ROOM_TYPE_DEFAULTS: Dict[str, Dict[str, float]] = {
    "living-room": {"width": 15, "height": 14, "minWidth": 10, "minHeight": 10},
    "master-bedroom": {"width": 14, "height": 14, "minWidth": 10, "minHeight": 10},
    "bedroom": {"width": 12, "height": 12, "minWidth": 9, "minHeight": 9},
    "kitchen": {"width": 10, "height": 12, "minWidth": 7, "minHeight": 7},
    "dining-room": {"width": 12, "height": 12, "minWidth": 8, "minHeight": 8},
    "bathroom": {"width": 6, "height": 8, "minWidth": 5, "minHeight": 6},
    "toilet": {"width": 5, "height": 6, "minWidth": 4, "minHeight": 5},
    "study": {"width": 10, "height": 10, "minWidth": 7, "minHeight": 7},
    "office": {"width": 10, "height": 10, "minWidth": 7, "minHeight": 7},
    "family-room": {"width": 13, "height": 13, "minWidth": 9, "minHeight": 9},
    "laundry": {"width": 6, "height": 6, "minWidth": 5, "minHeight": 5},
    "pantry": {"width": 5, "height": 6, "minWidth": 4, "minHeight": 4},
    "walk-in-closet": {"width": 6, "height": 6, "minWidth": 4, "minHeight": 4},
    "utility": {"width": 6, "height": 6, "minWidth": 5, "minHeight": 5},
    "utility-room": {"width": 6, "height": 6, "minWidth": 5, "minHeight": 5},
    "prayer-room": {"width": 8, "height": 8, "minWidth": 6, "minHeight": 6},
    "storage": {"width": 6, "height": 6, "minWidth": 4, "minHeight": 4},
    "store": {"width": 6, "height": 6, "minWidth": 4, "minHeight": 4},
    "guest-room": {"width": 12, "height": 12, "minWidth": 9, "minHeight": 9},
    "garage": {"width": 12, "height": 20, "minWidth": 10, "minHeight": 14},
    "balcony": {"width": 6, "height": 8, "minWidth": 4, "minHeight": 5},
    "patio": {"width": 10, "height": 10, "minWidth": 6, "minHeight": 6},
    "hall": {"width": 10, "height": 5, "minWidth": 4, "minHeight": 4},
    "other": {"width": 10, "height": 10, "minWidth": 6, "minHeight": 6},
}


def normalize_room_type(t: str) -> str:
    s = (t or "other").strip().lower().replace("_", "-").replace(" ", "-")
    aliases = {
        "masterbedroom": "master-bedroom",
        "master-bedroom": "master-bedroom",
        "master": "master-bedroom",
        "livingroom": "living-room",
        "living": "living-room",
        "diningroom": "dining-room",
        "dining": "dining-room",
        "bath": "bathroom",
        "baths": "bathroom",
        "wc": "toilet",
        "closet": "walk-in-closet",
        "walkin-closet": "walk-in-closet",
        "utilityroom": "utility-room",
        "prayerroom": "prayer-room",
        "familyroom": "family-room",
        "family": "family-room",
        "guestroom": "guest-room",
        "guest": "guest-room",
    }
    s = aliases.get(s, s)
    if s not in ROOM_TYPE_DEFAULTS:
        return "other"
    return s


def unit_to_feet_factor(unit: str) -> float:
    u = (unit or "feet").lower()
    if u in ("ft", "feet"):
        return 1.0
    if u in ("m", "meters", "meter"):
        return 3.28084
    if u in ("cm", "centimeters"):
        return 0.0328084
    if u in ("in", "inches", "inch"):
        return 1.0 / 12.0
    return 1.0


class PlotInput(BaseModel):
    width: float = Field(..., gt=0, le=500)
    depth: float = Field(..., gt=0, le=500)
    unit: str = Field(default="ft")

    @field_validator("unit")
    @classmethod
    def _unit(cls, v: str) -> str:
        lv = (v or "ft").lower()
        mapping = {"feet": "ft", "foot": "ft", "ft": "ft",
                   "meters": "m", "meter": "m", "m": "m",
                   "centimeters": "cm", "centimeter": "cm", "cm": "cm",
                   "inches": "in", "inch": "in", "in": "in"}
        if lv not in mapping:
            raise ValueError(f"Unsupported unit '{v}'. Use ft/m/cm/in.")
        return mapping[lv]


class RoomRequirement(BaseModel):
    type: str = Field(default="other")
    name: str = Field(default="")
    count: int = Field(default=1, ge=0, le=10)
    targetArea: Optional[float] = Field(default=None, gt=0)
    preferredWidth: Optional[float] = Field(default=None, gt=0)
    preferredHeight: Optional[float] = Field(default=None, gt=0)
    minWidth: Optional[float] = Field(default=None, gt=0)
    minHeight: Optional[float] = Field(default=None, gt=0)
    sizeMode: Optional[Literal["exact", "preferred", "minimum"]] = Field(default="preferred")
    required: bool = Field(default=True)

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        return normalize_room_type(v)


class SpatialRequirement(BaseModel):
    sourceRoom: str
    relationship: str
    targetRoom: str
    strength: Literal["required", "preferred"] = "preferred"

    @field_validator("relationship")
    @classmethod
    def _rel(cls, v: str) -> str:
        up = (v or "").upper().strip()
        if up not in ALLOWED_RELATIONSHIPS:
            raise ValueError(f"Unknown relationship '{v}'. Allowed: {sorted(ALLOWED_RELATIONSHIPS)}")
        return up

    @field_validator("sourceRoom", "targetRoom")
    @classmethod
    def _nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("sourceRoom/targetRoom must be non-empty")
        return v.strip()


class LayoutPreferences(BaseModel):
    entrance: Optional[Literal["front", "left", "right", "rear", "any"]] = "front"
    masterBedroom: Optional[Literal["front", "rear", "left", "right", "any"]] = "rear"
    kitchen: Optional[Literal["near-dining", "near-entrance", "rear", "any"]] = "near-dining"
    livingRoom: Optional[Literal["near-entrance", "center", "rear", "any"]] = "near-entrance"
    bedrooms: Optional[Literal["grouped", "separated", "private-zone", "any"]] = "private-zone"


class DesignGenerationRequest(BaseModel):
    projectId: Optional[str] = None
    plot: PlotInput
    floors: int = Field(default=1, ge=1, le=1)
    rooms: List[RoomRequirement] = Field(default_factory=list)
    relationships: List[SpatialRequirement] = Field(default_factory=list)
    preferences: LayoutPreferences = Field(default_factory=LayoutPreferences)
    brief: Optional[str] = ""
    seed: Optional[int] = None
    count: int = Field(default=1, ge=1, le=5)

    @model_validator(mode="after")
    def _check(self):
        total = sum(r.count for r in self.rooms)
        if total < 1:
            raise ValueError("At least one room is required (sum of counts >= 1).")
        if total > 30:
            raise ValueError("Too many rooms requested (max 30). Reduce counts.")
        return self

    def plot_in_feet(self) -> tuple[float, float]:
        f = unit_to_feet_factor(self.plot.unit)
        return (self.plot.width * f, self.plot.depth * f)


class GeneratedRoomPlan(BaseModel):
    name: str
    type: str
    targetArea: Optional[float] = None
    preferredWidth: Optional[float] = None
    preferredHeight: Optional[float] = None
    minWidth: Optional[float] = None
    minHeight: Optional[float] = None
    preferredPosition: Optional[Literal["front", "rear", "left", "right", "center", "any"]] = "any"
    relationships: List[SpatialRequirement] = Field(default_factory=list)

    @field_validator("type")
    @classmethod
    def _type(cls, v: str) -> str:
        return normalize_room_type(v)


class EntrancePlan(BaseModel):
    side: Literal["front", "rear", "left", "right"] = "front"
    position: float = Field(default=0.5, ge=0.05, le=0.95)


class GenerationPlan(BaseModel):
    summary: str = ""
    assumptions: List[str] = Field(default_factory=list)
    rooms: List[GeneratedRoomPlan] = Field(min_length=1, max_length=30)
    relationships: List[SpatialRequirement] = Field(default_factory=list)
    entrance: Optional[EntrancePlan] = None
    warnings: List[str] = Field(default_factory=list)
    confidence: Optional[float] = Field(default=None, ge=0, le=1)


class PlacedRoom(BaseModel):
    name: str
    type: str
    x: float
    y: float
    width: float
    height: float


class LayoutScore(BaseModel):
    total: float = 0
    boundaryViolations: int = 0
    overlapViolations: int = 0
    adjacencyViolations: int = 0
    circulationViolations: int = 0
    sizeDeviation: float = 0
    preferenceDeviation: float = 0


class GenerationProposal(BaseModel):
    generationId: str
    summary: str
    plan: GenerationPlan
    rooms: List[PlacedRoom]
    walls: List[Dict[str, Any]] = Field(default_factory=list)
    doors: List[Dict[str, Any]] = Field(default_factory=list)
    windows: List[Dict[str, Any]] = Field(default_factory=list)
    commands: List[Dict[str, Any]] = Field(default_factory=list)
    score: LayoutScore = Field(default_factory=LayoutScore)
    warnings: List[str] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    seed: int = 0


MAX_GENERATION_ATTEMPTS = 3
