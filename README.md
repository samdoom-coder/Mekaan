# Floorplan Studio — AI-Powered 2D Floor Plan Designer (V1)

A modern, professional web application for designing residential floor plans. V1 focuses on an excellent **2D editor and spatial design engine**; the architecture is prepared for AI generation and 3D visualization without rewriting the core.

> **Core principle:** A floor plan is structured spatial data, not an image. The Design Model is the source of truth for 2D, AI, and future 3D renderers.

```
                 DESIGN MODEL
                      │
         ┌────────────┼────────────┐
         │            │            │
         ▼            ▼            ▼
      2D Editor    AI Engine    3D Renderer
         │            │            │
         ▼            ▼            ▼
       SVG/        Commands/     Three.js
       Canvas       Actions
```

## Architecture

```
User
  │
  ▼
React UI
  │
  ▼
Design Store (Zustand)
  │
  ▼
Command / Operations → Constraint Engine → DESIGN MODEL → SVG Renderer
```

- **Design Model + Geometry Engine + Command System** remain stable through V1→V7.
- No UI hack: `UI action → DesignCommand → Operation → Validation → Design State → Renderer`.
- `DesignCommand[]` validated before constraint solving; future AI cannot inject arbitrary SVG/JS.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + Zustand + SVG + Lucide React
- **Backend:** FastAPI + Pydantic + SQLAlchemy + PostgreSQL (SQLite fallback for local dev)
- **Tests:** Vitest + jsdom

## Quick Start

### Frontend

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build
npm run test       # run geometry engine tests
```

### Backend

```bash
pip install -r backend/requirements.txt

# from project root (works via symlink)
uvicorn app.main:app --reload               # http://localhost:8000

# or from backend folder
cd backend && uvicorn app.main:app --reload

# alternative with app-dir
uvicorn app.main:app --reload --app-dir backend
```

Health check: `GET http://localhost:8000/health`

### Environment

- `DATABASE_URL` – defaults to `sqlite:///./floorplan.db` if not set. Set to `postgresql://user:pass@host/db` for Postgres.

## Project Structure

```
src/
  types/           # Design, Floor, Room, Wall, Door, Window, etc.
  engine/
    geometry.ts    # containment, overlap, wall length, polygons
    constraints.ts # room boundary, overlap, door/window attachment, min size
    coordinates.ts # world ↔ screen, fit-to-view
    measurement.ts # unit conversion, formatting
    snapping.ts    # grid snapping
    commands.ts    # DesignCommand validation & mock AI
    operations.ts  # operation types & history helpers
  stores/
    designStore.ts    # source of truth, undo/redo via snapshots
    projectStore.ts   # projects list, localStorage + backend sync
    selectionStore.ts # click, shift-multi, drag-rect, clipboard
    viewportStore.ts  # pan, zoom, grid, snap, units
    historyStore.ts   # named versions, persist to localStorage
    uiStore.ts        # view, tool, toasts, save status
  renderers/svg/      # FloorRenderer (rooms, walls, doors, windows, furniture, dims)
  components/
    editor/Canvas.tsx      # SVG canvas, grid, pan/zoom, tools, selection
    toolbar/Toolbar.tsx    # Select/Room/Wall/Door/Window/Dimension/Furniture
    properties/            # contextual property panel
    projects/ProjectsView.tsx
    ai/AICommandBar.tsx    # mock V1 bar
    common/Header.tsx, StatusBar.tsx
  utils/demoData.ts   # Modern 3 Bedroom House 40×60

backend/
  app/
    main.py
    api/projects.py   # CRUD + versions
    api/design.py     # GET/PUT design
    api/ai.py         # POST /ai/generate (mock)
    models/project.py
    schemas/project.py
    core/database.py
```

## Design Data Model

```ts
interface Design {
  id: string; version: number; units: UnitSystem;
  site: Site; floors: Floor[]; metadata: DesignMetadata;
}
interface Floor {
  id: string; name: string; level: number;
  width: number; height: number;
  rooms: Room[]; walls: Wall[]; doors: Door[]; windows: Window[]; objects: DesignObject[]; dimensions: Dimension[]; annotations: Annotation[];
}
interface Room { id, name, type, x, y, width, height, rotation, properties }
interface Wall { id, start: Point, end: Point, thickness, height, type }
interface Door { id, wallId, position (0..1), width, swingDirection }
interface Window { id, wallId, position, width, height }
```

Future renderers (`SvgRenderer`, `ThreeRenderer`, `PdfExporter`, etc.) consume `Design`, never SVG.

## Coordinate System

- **World coordinates** = feet (or selected unit converted to feet internally)
- Never store screen pixels as geometry
- `worldToScreen` / `screenToWorld` via viewport `{x,y,zoom}`
- Pan: drag with middle mouse or `Space + drag`
- Zoom: wheel (centered on cursor), `+`/`-` buttons, `Fit` to floor

## Features (V1)

- Projects: create (name, property type, units, plot W/D, floors), list, delete, open; thumbnail via mini-SVG; localStorage + backend persistence
- Editor layout: header + toolbar (left) + canvas (center) + properties (right) + status bar + AI bar (bottom) – dark charcoal professional aesthetic
- Grid: configurable 0.5/1/2/5 ft, toggle, snap-to-grid
- Selection: click, shift-multi, drag rectangle, Esc clears, Delete removes, duplicate via Ctrl+V
- Room tool: choose type → drag rectangle → validated placement. Props: name, type, width/height (formatted `14' 0"`), area, X/Y, rotation, delete
- Walls: click start → click end, thickness, type, geometry polygon (not just thick line)
- Doors/Windows: click near wall → attached via `wallId` + `position` 0..1, width, swing; move with wall; wall deletion removes attached
- Dimensions: two clicks → architectural line with arrows, auto formatted per units, updates with geometry
- Furniture: click to place; types: Bed, Sofa, Dining Table, Chair, Counter, Toilet, Sink, Shower, Bathtub, Wardrobe, Car; simple vector rect + label, move/rotate
- Constraints (immediate toast, no silent corruption):
  - Room inside floor boundary
  - No overlap (unless allowed)
  - Doors/windows must attach to wall, wall long enough
  - Minimum 6×6 ft
- Undo/Redo: snapshot history, operation-based; `Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y`
- Autosave: debounced ~1s, status `Saved` / `Saving...` / `Unsaved changes`, saves to localStorage and `PUT /projects/{id}/design`
- Version History: named saves, list, restore, delete (stored `floorplan_versions` + backend `/projects/{id}/versions`)
- Export: JSON (structured design) and SVG (serialized canvas)
- AI Command Bar (mock): `✨ Ask AI to modify your plan...` → shows example commands; architecture `Natural Language → AI → DesignCommand[] → Validator → Constraint Engine → Operation → Design → Renderer`
- Keyboard: `V/R/W/D/N/M/F`, `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+C/V`, `Del`, `Esc`, `Space+drag`, `+/-`
- Responsive: collapsible sidebars, toolbar stays usable

## API

```
POST   /projects
GET    /projects
GET    /projects/{id}
PUT    /projects/{id}
DELETE /projects/{id}

GET    /projects/{id}/design
PUT    /projects/{id}/design

GET    /projects/{id}/versions
POST   /projects/{id}/versions

POST   /ai/generate   { prompt, constraints } -> { commands: DesignCommand[] }
POST   /ai/command    alias

GET    /health
```

## Demo Data

On first load: **Modern 3 Bedroom House** 40×60 ft – Living, Dining, Kitchen, Master Bedroom, Bedroom 2/3, Bathroom×2, Hall, with walls, doors, windows, furniture, dimensions. Immediate “alive” editor.

## Tests

Geometry engine is pure functions, no React needed:

```bash
npm run test
```

Covers:
- room containment
- room overlap
- wall length
- door/window attachment
- room resizing / min size
- coordinate conversion (world ↔ screen)
- unit conversion & formatting
- wall polygon
- constraint validation
- command validation & mock AI
- undo/redo + overlap prevention

## Future Extension Points (not built in V1)

- `DesignRenderer` interface → `SvgRenderer`, `ThreeRenderer`, `PdfRenderer`, `DxfExporter`, `IfcExporter`
- Multi-floor already modeled (`floors: Floor[]`), stairs later
- `POST /ai/generate` returns `DesignCommand[]` validated before execution

## Visual Design

Warm white canvas `#fdfbf7`, charcoal UI `#171717`, subtle gray borders, precise architectural line work, no glassmorphism/neon.

