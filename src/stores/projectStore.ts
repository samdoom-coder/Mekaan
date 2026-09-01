import { create } from "zustand";
import type { ProjectSummary, Design, UnitSystem, PropertyType, PlotShape } from "../types/design";
import { createDemoDesign } from "../utils/demoData";
import { getFloorPolygon } from "../utils/floorShape";

interface ProjectState {
  projects: ProjectSummary[];
  currentProjectId: string | null;
  setProjects: (p: ProjectSummary[]) => void;
  createProject: (args: { name: string; propertyType: PropertyType; units: UnitSystem; width: number; depth: number; floors: number; plotShape?: import("../types/design").PlotShape }) => ProjectSummary;
  createProjectWithDesign: (args: { name: string; design: Design; propertyType?: PropertyType; units?: UnitSystem }) => ProjectSummary;
  deleteProject: (id: string) => void;
  updateProject: (id: string, patch: Partial<ProjectSummary>) => void;
  setCurrent: (id: string | null) => void;
  getCurrent: () => ProjectSummary | undefined;
}

function uid() { return `proj_${Math.random().toString(36).slice(2, 9)}`; }

function makeDesign(name: string, units: UnitSystem, w: number, d: number, propertyType: PropertyType, plotShape?: import("../types/design").PlotShape): Design {
  const demo = createDemoDesign();
  // override site
  demo.name = name;
  demo.propertyType = propertyType;
  demo.units = units;
  demo.id = uid();
  demo.site = { width: w, depth: d };
  demo.floors[0].width = w;
  demo.floors[0].height = d;
  if (plotShape) {
    demo.floors[0].plotShape = plotShape;
  }
  // clear rooms but keep one? Actually keep demo but scale? Let's keep demo's rooms but clamp to new size
  // For small plots, we adjust: just keep demo but truncate if needed; simpler: create empty floor
  if (w !== 40 || d !== 60 || (plotShape && plotShape.type !== "rectangle")) {
    demo.floors[0].rooms = [];
    // generate walls along plot boundary if custom/L/U/T
    if (plotShape && plotShape.type !== "rectangle") {
      const poly = getFloorPolygon(demo.floors[0]);
      if (poly && poly.length >= 3) {
        demo.floors[0].walls = poly.map((p: any, i: number) => {
          const nxt = poly[(i + 1) % poly.length];
          return { id: `wall_${Math.random().toString(36).slice(2,7)}`, start: { ...p }, end: { ...nxt }, thickness: 0.5, height: 9, type: "exterior" as const };
        });
      }
    } else if (w !== 40 || d !== 60) {
      demo.floors[0].walls = [
        { id: `wall_${Math.random().toString(36).slice(2,7)}`, start: {x:0,y:0}, end:{x:w,y:0}, thickness:0.5, height:9, type:"exterior"},
        { id: `wall_${Math.random().toString(36).slice(2,7)}`, start: {x:w,y:0}, end:{x:w,y:d}, thickness:0.5, height:9, type:"exterior"},
        { id: `wall_${Math.random().toString(36).slice(2,7)}`, start: {x:w,y:d}, end:{x:0,y:d}, thickness:0.5, height:9, type:"exterior"},
        { id: `wall_${Math.random().toString(36).slice(2,7)}`, start: {x:0,y:d}, end:{x:0,y:0}, thickness:0.5, height:9, type:"exterior"},
      ];
    }
    demo.floors[0].doors = [];
    demo.floors[0].windows = [];
    demo.floors[0].objects = [];
    demo.floors[0].dimensions = [];
  }
  return demo;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  setProjects: (p) => set({ projects: p }),
  createProjectWithDesign: ({ name, design, propertyType, units }) => {
    const id = uid();
    const now = new Date().toISOString();
    // ensure design has correct metadata
    const finalDesign = { ...design, id, name, propertyType: propertyType || design.propertyType, units: units || design.units, metadata: { createdAt: now, updatedAt: now } } as Design;
    finalDesign.floors = finalDesign.floors.map((f) => ({ ...f, width: design.site.width, height: design.site.depth }));
    const proj: ProjectSummary = {
      id,
      name,
      propertyType: (propertyType as any) || design.propertyType || "residential",
      units: (units as any) || design.units || "feet",
      site: { width: design.site.width, depth: design.site.depth },
      floors: design.floors.length,
      updatedAt: now,
      createdAt: now,
      design: finalDesign,
    };
    set({ projects: [proj, ...get().projects], currentProjectId: id });
    localStorage.setItem("floorplan_projects", JSON.stringify(get().projects));
    fetch("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, propertyType: proj.propertyType, units: proj.units, plotWidth: proj.site.width, plotDepth: proj.site.depth, floors: proj.floors, design: finalDesign }),
    }).catch(() => {});
    return proj;
  },
  createProject: ({ name, propertyType, units, width, depth, floors, plotShape }) => {
    const id = uid();
    const design = makeDesign(name, units, width, depth, propertyType, plotShape);
    const now = new Date().toISOString();
    const proj: ProjectSummary = {
      id,
      name,
      propertyType,
      units,
      site: { width, depth },
      floors,
      updatedAt: now,
      createdAt: now,
      design,
    };
    set({ projects: [proj, ...get().projects], currentProjectId: id });
    // persist
    localStorage.setItem("floorplan_projects", JSON.stringify(get().projects));
    // sync to backend (fire-and-forget, keeps proj_xxx id)
    fetch("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, propertyType, units, plotWidth: width, plotDepth: depth, floors, design }),
    }).catch(() => {}).then(async (res) => {
      if (res && !res.ok) {
        // fallback: try PUT upsert
        try { await fetch(`/projects/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, design }) }); } catch {}
      }
    });
    return proj;
  },
  deleteProject: (id) => {
    const next = get().projects.filter(p => p.id !== id);
    set({ projects: next, currentProjectId: get().currentProjectId === id ? null : get().currentProjectId });
    localStorage.setItem("floorplan_projects", JSON.stringify(next));
    fetch(`/projects/${id}`, { method: "DELETE" }).catch(() => {});
  },
  updateProject: (id, patch) => {
    const next = get().projects.map(p => p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p);
    set({ projects: next });
    localStorage.setItem("floorplan_projects", JSON.stringify(next));
    const proj = next.find(p => p.id === id);
    if (proj) {
      fetch(`/projects/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: proj.name, design: proj.design, units: proj.units }) }).catch(() => {});
    }
  },
  setCurrent: (id) => set({ currentProjectId: id }),
  getCurrent: () => get().projects.find(p => p.id === get().currentProjectId!),
}));

// hydrate
export function hydrateProjects() {
  try {
    const raw = localStorage.getItem("floorplan_projects");
    if (raw) {
      const arr = JSON.parse(raw) as ProjectSummary[];
      useProjectStore.setState({ projects: arr });
      if (arr.length && !useProjectStore.getState().currentProjectId) {
        useProjectStore.setState({ currentProjectId: arr[0].id });
      }
      return;
    }
  } catch {}
  // create demo project
  const demo = createDemoDesign();
  const proj: ProjectSummary = {
    id: "demo_project",
    name: "Modern 3 Bedroom House",
    propertyType: "residential",
    units: "feet",
    site: { width: 40, depth: 60 },
    floors: 1,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    design: demo,
  };
  useProjectStore.setState({ projects: [proj], currentProjectId: proj.id });
  localStorage.setItem("floorplan_projects", JSON.stringify([proj]));
}
