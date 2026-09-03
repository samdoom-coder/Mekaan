import { create } from "zustand";
import type { Design, Floor, Room, Wall, Door, Window, DesignObject, Dimension, PlotShape } from "../types/design";
import { createDemoDesign } from "../utils/demoData";
import { validateRoomPlacement, validateWall } from "../engine/constraints";
import { roomInsideFloor } from "../engine/geometry";

type HistoryEntry = Design;

interface DesignState {
  design: Design | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  setDesign: (d: Design) => void;
  updateDesign: (updater: (draft: Design) => Design | void) => { success: boolean; error?: string };
  createRoom: (floorId: string, room: Room) => { success: boolean; error?: string };
  updateRoom: (floorId: string, roomId: string, patch: Partial<Room>) => { success: boolean; error?: string };
  deleteRoom: (floorId: string, roomId: string) => void;
  moveRoom: (floorId: string, roomId: string, x: number, y: number) => { success: boolean; error?: string };
  resizeRoom: (floorId: string, roomId: string, w: number, h: number) => { success: boolean; error?: string };
  createWall: (floorId: string, wall: Wall) => { success: boolean; error?: string };
  updateWall: (floorId: string, wallId: string, patch: Partial<Wall>) => { success: boolean; error?: string };
  deleteWall: (floorId: string, wallId: string) => void;
  createDoor: (floorId: string, door: Door) => { success: boolean; error?: string };
  updateDoor: (floorId: string, doorId: string, patch: Partial<Door>) => void;
  deleteDoor: (floorId: string, doorId: string) => void;
  createWindow: (floorId: string, win: Window) => { success: boolean; error?: string };
  updateWindow: (floorId: string, winId: string, patch: Partial<Window>) => void;
  deleteWindow: (floorId: string, winId: string) => void;
  createObject: (floorId: string, obj: DesignObject) => void;
  updateObject: (floorId: string, objId: string, patch: Partial<DesignObject>) => void;
  deleteObject: (floorId: string, objId: string) => void;
  createDimension: (floorId: string, dim: Dimension) => void;
  deleteDimension: (floorId: string, dimId: string) => void;
  duplicateSelection: (floorId: string, ids: string[], type: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  saveSnapshot: () => void;
  // live (no history) updates for smooth dragging
  liveUpdateRoom: (floorId: string, roomId: string, patch: Partial<Room>) => boolean;
  liveUpdateObject: (floorId: string, objId: string, patch: Partial<DesignObject>) => void;
  liveUpdateWall: (floorId: string, wallId: string, patch: Partial<Wall>) => boolean;
  commitLive: () => void;
  updateFloor: (floorId: string, patch: Partial<Floor>) => void;
  setFloorShape: (floorId: string, shape: import("../types/design").PlotShape) => void;
  beginTransaction: () => void;
  endTransaction: (label?: string) => void;
  applyGeneratedDesign: (generated: Design) => void;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function currentFloor(design: Design, floorId: string): Floor | undefined {
  return design.floors.find(f => f.id === floorId);
}

export const useDesignStore = create<DesignState>((set, get) => ({
  design: null,
  past: [],
  future: [],

  setDesign: (d) => set({ design: clone(d), past: [], future: [] }),

  saveSnapshot: () => {
    const { design, past } = get();
    if (!design) return;
    set({ past: [...past, clone(design)], future: [] });
  },

  updateDesign: (updater) => {
    const { design } = get();
    if (!design) return { success: false, error: "No design" };
    const snapshot = clone(design);
    const next = clone(design);
    const result = updater(next);
    // if updater returns design, use it
    const finalDesign = (result as Design) || next;
    // simple validation? we let specific methods validate
    set({ design: finalDesign, past: [...get().past, snapshot], future: [] });
    return { success: true };
  },

  createRoom: (floorId, room) => {
    const { design, past } = get();
    if (!design) return { success: false, error: "No design" };
    const floor = currentFloor(design, floorId);
    if (!floor) return { success: false, error: "Floor not found" };
    const res = validateRoomPlacement(room, floor, floor.rooms);
    if (!res.valid) return { success: false, error: res.message };
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    f.rooms.push(room);
    next.metadata.updatedAt = new Date().toISOString();
    next.version++;
    set({ design: next, past: [...past, clone(design)], future: [] });
    return { success: true };
  },

  updateRoom: (floorId, roomId, patch) => {
    const { design, past } = get();
    if (!design) return { success: false, error: "No design" };
    const floor = currentFloor(design, floorId);
    if (!floor) return { success: false, error: "Floor not found" };
    const room = floor.rooms.find(r => r.id === roomId);
    if (!room) return { success: false, error: "Room not found" };
    const updated = { ...room, ...patch };
    // if patch includes width/height enforce min
    const others = floor.rooms.filter(r => r.id !== roomId);
    const check = validateRoomPlacement(updated, floor, others);
    if (!check.valid) return { success: false, error: check.message };
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    const idx = f.rooms.findIndex(r => r.id === roomId);
    f.rooms[idx] = updated;
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
    return { success: true };
  },

  deleteRoom: (floorId, roomId) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId);
    if (!f) return;
    f.rooms = f.rooms.filter(r => r.id !== roomId);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  moveRoom: (floorId, roomId, x, y) => {
    return get().updateRoom(floorId, roomId, { x, y });
  },

  resizeRoom: (floorId, roomId, w, h) => {
    return get().updateRoom(floorId, roomId, { width: w, height: h });
  },

  createWall: (floorId, wall) => {
    const { design, past } = get();
    if (!design) return { success: false, error: "No design" };
    const ck = validateWall(wall);
    if (!ck.valid) return { success: false, error: ck.message };
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    f.walls.push(wall);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
    return { success: true };
  },

  updateWall: (floorId, wallId, patch) => {
    const { design, past } = get();
    if (!design) return { success: false, error: "No design" };
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    const idx = f.walls.findIndex(w => w.id === wallId);
    if (idx < 0) return { success: false, error: "Wall not found" };
    const updated = { ...f.walls[idx], ...patch };
    const ck = validateWall(updated);
    if (!ck.valid) return { success: false, error: ck.message };
    f.walls[idx] = updated;
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
    return { success: true };
  },

  deleteWall: (floorId, wallId) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    f.walls = f.walls.filter(w => w.id !== wallId);
    // also remove doors/windows attached
    f.doors = f.doors.filter(d => d.wallId !== wallId);
    f.windows = f.windows.filter(w => w.wallId !== wallId);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  createDoor: (floorId, door) => {
    const { design, past } = get();
    if (!design) return { success: false, error: "No design" };
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    const wall = f.walls.find(w => w.id === door.wallId);
    if (!wall) return { success: false, error: "Wall not found" };
    f.doors.push(door);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
    return { success: true };
  },

  updateDoor: (floorId, doorId, patch) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    const idx = f.doors.findIndex(d => d.id === doorId);
    if (idx < 0) return;
    f.doors[idx] = { ...f.doors[idx], ...patch };
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  deleteDoor: (floorId, doorId) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    f.doors = f.doors.filter(d => d.id !== doorId);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  createWindow: (floorId, win) => {
    const { design, past } = get();
    if (!design) return { success: false, error: "No design" };
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    const wall = f.walls.find(w => w.id === win.wallId);
    if (!wall) return { success: false, error: "Wall not found" };
    f.windows.push(win);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
    return { success: true };
  },

  updateWindow: (floorId, winId, patch) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    const idx = f.windows.findIndex(w => w.id === winId);
    if (idx < 0) return;
    f.windows[idx] = { ...f.windows[idx], ...patch };
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  deleteWindow: (floorId, winId) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    f.windows = f.windows.filter(w => w.id !== winId);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  createObject: (floorId, obj) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    f.objects.push(obj);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  updateObject: (floorId, objId, patch) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    const idx = f.objects.findIndex(o => o.id === objId);
    if (idx < 0) return;
    f.objects[idx] = { ...f.objects[idx], ...patch };
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  deleteObject: (floorId, objId) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    f.objects = f.objects.filter(o => o.id !== objId);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  createDimension: (floorId, dim) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    f.dimensions.push(dim);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  deleteDimension: (floorId, dimId) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    f.dimensions = f.dimensions.filter(d => d.id !== dimId);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  duplicateSelection: (floorId, ids, type) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    if (type === "room") {
      for (const id of ids) {
        const r = f.rooms.find(x => x.id === id);
        if (!r) continue;
        const copy: Room = { ...clone(r), id: `room_${Math.random().toString(36).slice(2, 7)}`, x: r.x + 1, y: r.y + 1, name: r.name + " Copy" };
        // try to place without overlap
        let attempts = 0;
        while (attempts < 5) {
          const overlapped = f.rooms.some(o => {
            // check overlap with new
            const A = { x: copy.x, y: copy.y, width: copy.width, height: copy.height, id: copy.id } as any;
            const B = o as any;
            const ax2 = A.x + A.width, ay2 = A.y + A.height;
            const bx2 = B.x + B.width, by2 = B.y + B.height;
            return !(ax2 <= B.x || A.x >= bx2 || ay2 <= B.y || A.y >= by2);
          });
          if (!overlapped && roomInsideFloor(copy, f)) break;
          copy.x += 1;
          copy.y += 1;
          attempts++;
        }
        f.rooms.push(copy);
      }
    } else if (type === "object") {
      for (const id of ids) {
        const o = f.objects.find(x => x.id === id);
        if (!o) continue;
        f.objects.push({ ...clone(o), id: `obj_${Math.random().toString(36).slice(2, 7)}`, x: o.x + 1, y: o.y + 1 });
      }
    }
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  undo: () => {
    const { design, past, future } = get();
    if (past.length === 0 || !design) return;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);
    set({ design: clone(previous), past: newPast, future: [clone(design), ...future] });
  },

  redo: () => {
    const { design, past, future } = get();
    if (future.length === 0 || !design) return;
    const next = future[0];
    const newFuture = future.slice(1);
    set({ design: clone(next), past: [...past, clone(design)], future: newFuture });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  liveUpdateRoom: (floorId, roomId, patch) => {
    const { design } = get();
    if (!design) return false;
    const floor = currentFloor(design, floorId);
    if (!floor) return false;
    const room = floor.rooms.find(r => r.id === roomId);
    if (!room) return false;
    const updated = { ...room, ...patch };
    // live: no validation for smooth drag; final validation on mouseUp/commit
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    const idx = f.rooms.findIndex(r => r.id === roomId);
    f.rooms[idx] = updated;
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next });
    return true;
  },

  liveUpdateObject: (floorId, objId, patch) => {
    const { design } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    const idx = f.objects.findIndex(o => o.id === objId);
    if (idx < 0) return;
    f.objects[idx] = { ...f.objects[idx], ...patch };
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next });
  },

  liveUpdateWall: (floorId, wallId, patch) => {
    const { design } = get();
    if (!design) return false;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId)!;
    const idx = f.walls.findIndex(w => w.id === wallId);
    if (idx < 0) return false;
    const updated = { ...f.walls[idx], ...patch };
    f.walls[idx] = updated;
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next });
    return true;
  },

  commitLive: () => {
    const { design, past } = get();
    if (!design) return;
    set({ past: [...past], future: [] });
    const d = get().design;
    if (d) set({ design: clone(d!) });
  },

  updateFloor: (floorId, patch) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId);
    if (!f) return;
    Object.assign(f, patch);
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  setFloorShape: (floorId, shape) => {
    const { design, past } = get();
    if (!design) return;
    const next = clone(design);
    const f = next.floors.find(fl => fl.id === floorId);
    if (!f) return;
    f.plotShape = shape;
    // if custom polygon provided, update width/height to bounds
    if (shape.polygon && shape.polygon.length >= 3) {
      const xs = shape.polygon.map(p => p.x);
      const ys = shape.polygon.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      // keep outer width/height as bounds, but polygon may be offset; we keep floor at 0,0
      // For custom, we normalize polygon to 0,0 and adjust rooms? keep simple: store as is
    }
    next.metadata.updatedAt = new Date().toISOString();
    set({ design: next, past: [...past, clone(design)], future: [] });
  },

  // Grouped transaction support (Phase 3 #21): many commands, one undo entry.
  beginTransaction: () => {
    const { design } = get();
    if (!design) return;
    (get() as unknown as { _txSnapshot?: Design })._txSnapshot = clone(design);
  },

  endTransaction: () => {
    const st = get() as unknown as { _txSnapshot?: Design };
    const snap = st._txSnapshot;
    if (!snap) return;
    const { design, past } = get();
    if (!design) return;
    // single history entry for the whole transaction
    set({ past: [...past, snap], future: [] });
    try { delete (get() as unknown as { _txSnapshot?: Design })._txSnapshot; } catch { /* noop */ }
  },

  applyGeneratedDesign: (generated) => {
    const { design, past } = get();
    const snapshot = design ? clone(design) : null;
    const next = clone(generated);
    // preserve identity of current project design where sensible
    if (design) {
      next.id = design.id;
      next.metadata = {
        createdAt: design.metadata.createdAt,
        updatedAt: new Date().toISOString(),
      };
      next.version = (design.version || 1) + 1;
      // keep floor id stable so selection/viewport keep working
      if (design.floors[0] && next.floors[0]) {
        // keep existing floor id if generated uses the default
        if (next.floors[0].id === "floor_ground") next.floors[0].id = design.floors[0].id;
      }
    } else {
      next.metadata = { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    }
    set({ design: next, past: snapshot ? [...past, snapshot] : past, future: [] });
  },
}));

// Initialize with demo if empty (will be set via component)
export function ensureDemo() {
  const s = useDesignStore.getState();
  if (!s.design) {
    s.setDesign(createDemoDesign());
  }
}
