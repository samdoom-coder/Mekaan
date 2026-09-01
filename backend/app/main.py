from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import projects, design, ai
from app.core.database import init_db

# Load .env for AI provider config (supports GMI Cloud, OpenRouter, etc.)
try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv("backend/.env")
except Exception:
    pass

app = FastAPI(title="Floorplan Studio API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(projects.router, prefix="/api")
app.include_router(design.router)
app.include_router(design.router, prefix="/api")
app.include_router(ai.router)
app.include_router(ai.router, prefix="/api")

@app.on_event("startup")
def startup():
    init_db()

@app.get("/health")
@app.get("/health/")
@app.get("/api/health")
@app.get("/api/health/")
def health():
    return {"status": "ok"}

@app.get("/")
def root():
    return {"message": "Floorplan Studio API", "version": "1.0.0"}
