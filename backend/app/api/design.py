from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.project import Project
from pydantic import BaseModel
from typing import Any

router = APIRouter(prefix="/projects", tags=["design"])

class DesignPayload(BaseModel):
    design: Any

@router.get("/{project_id}/design")
def get_design(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p.design

@router.put("/{project_id}/design")
def put_design(project_id: str, payload: DesignPayload, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        # upsert
        from datetime import datetime
        import uuid
        design = payload.design
        site_w, site_d = 40, 60
        name = f"Project {project_id[:6]}"
        prop_type = "residential"
        units = "feet"
        if design and isinstance(design, dict):
            site = design.get("site") or {}
            site_w = site.get("width", 40)
            site_d = site.get("depth", 60)
            name = design.get("name") or name
            prop_type = design.get("propertyType") or prop_type
            units = design.get("units") or units
        p = Project(
            id=project_id,
            name=name,
            property_type=prop_type,
            units=units,
            site_width=site_w,
            site_depth=site_d,
            floors=1,
            design=design,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p.design
    p.design = payload.design
    from datetime import datetime
    p.updated_at = datetime.utcnow()
    db.commit()
    return p.design
