from pydantic import BaseModel
from typing import Optional, Any, List
from datetime import datetime

class ProjectCreate(BaseModel):
    id: Optional[str] = None
    name: str
    propertyType: Optional[str] = "residential"
    units: Optional[str] = "feet"
    site: Optional[dict] = None
    plotWidth: Optional[float] = None
    plotDepth: Optional[float] = None
    width: Optional[float] = None
    depth: Optional[float] = None
    floors: Optional[int] = 1
    design: Optional[Any] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    design: Optional[Any] = None
    units: Optional[str] = None

class ProjectOut(BaseModel):
    id: str
    name: str
    propertyType: str
    units: str
    site: dict
    floors: int
    createdAt: datetime
    updatedAt: datetime
    design: Optional[Any] = None

    class Config:
        from_attributes = True

class VersionCreate(BaseModel):
    name: str
    design: Any

class VersionOut(BaseModel):
    id: str
    project_id: str
    name: str
    design: Any
    created_at: datetime
    class Config:
        from_attributes = True
