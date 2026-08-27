from sqlalchemy import Column, String, DateTime, JSON, Float, Integer
from sqlalchemy.orm import declarative_base
from app.core.database import Base
from datetime import datetime
import uuid

class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    property_type = Column(String, default="residential")
    units = Column(String, default="feet")
    site_width = Column(Float, default=40)
    site_depth = Column(Float, default=60)
    floors = Column(Integer, default=1)
    design = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class DesignVersion(Base):
    __tablename__ = "design_versions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    design = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
