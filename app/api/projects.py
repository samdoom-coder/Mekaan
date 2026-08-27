from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.project import Project, DesignVersion
from app.schemas.project import ProjectCreate, ProjectUpdate, VersionCreate
import uuid
from datetime import datetime

router = APIRouter(prefix="/projects", tags=["projects"])

def to_out(p: Project):
    return {
        "id": p.id,
        "name": p.name,
        "propertyType": p.property_type,
        "units": p.units,
        "site": {"width": p.site_width, "depth": p.site_depth},
        "floors": p.floors,
        "createdAt": p.created_at,
        "updatedAt": p.updated_at,
        "design": p.design,
    }

@router.post("")
@router.post("/")
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    site_w = payload.plotWidth or payload.width or (payload.site or {}).get("width", 40)
    site_d = payload.plotDepth or payload.depth or (payload.site or {}).get("depth", 60)
    # allow frontend to provide custom id like proj_xxx; fallback to uuid
    pid = payload.id or str(uuid.uuid4())
    # if id already exists, update instead of duplicate
    existing = db.query(Project).filter(Project.id == pid).first()
    if existing:
        existing.name = payload.name
        existing.property_type = payload.propertyType or existing.property_type
        existing.units = payload.units or existing.units
        existing.site_width = site_w
        existing.site_depth = site_d
        existing.floors = payload.floors or existing.floors
        existing.design = payload.design if payload.design is not None else existing.design
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return to_out(existing)
    proj = Project(
        id=pid,
        name=payload.name,
        property_type=payload.propertyType or "residential",
        units=payload.units or "feet",
        site_width=site_w,
        site_depth=site_d,
        floors=payload.floors or 1,
        design=payload.design,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return to_out(proj)

@router.get("")
@router.get("/")
def list_projects(db: Session = Depends(get_db)):
    rows = db.query(Project).order_by(Project.updated_at.desc()).all()
    return [to_out(r) for r in rows]

@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return to_out(p)

@router.put("/{project_id}")
def update_project(project_id: str, payload: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        # upsert: create project if not found (handles frontend proj_xxx ids)
        # try to find design in payload to infer site
        design = payload.design
        site_w, site_d = 40, 60
        prop_type = "residential"
        units = payload.units or "feet"
        name = payload.name or f"Project {project_id[:6]}"
        if design and isinstance(design, dict):
            site = design.get("site") or {}
            site_w = site.get("width", 40)
            site_d = site.get("depth", 60)
            prop_type = design.get("propertyType") or prop_type
            units = design.get("units") or units
            name = design.get("name") or name
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
        return to_out(p)
    if payload.name is not None:
        p.name = payload.name
    if payload.design is not None:
        p.design = payload.design
    if payload.units is not None:
        p.units = payload.units
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return to_out(p)

@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(p)
    db.query(DesignVersion).filter(DesignVersion.project_id == project_id).delete()
    db.commit()
    return {"ok": True}

@router.get("/{project_id}/versions")
def list_versions(project_id: str, db: Session = Depends(get_db)):
    rows = db.query(DesignVersion).filter(DesignVersion.project_id == project_id).order_by(DesignVersion.created_at.desc()).all()
    return [{"id": r.id, "project_id": r.project_id, "name": r.name, "design": r.design, "created_at": r.created_at} for r in rows]

@router.post("/{project_id}/versions")
def create_version(project_id: str, payload: VersionCreate, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    ver = DesignVersion(id=str(uuid.uuid4()), project_id=project_id, name=payload.name, design=payload.design, created_at=datetime.utcnow())
    db.add(ver)
    db.commit()
    db.refresh(ver)
    return {"id": ver.id, "project_id": ver.project_id, "name": ver.name, "design": ver.design, "created_at": ver.created_at}
