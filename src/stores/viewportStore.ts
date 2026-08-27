import { create } from "zustand";

interface ViewportState {
  x: number;
  y: number;
  zoom: number;
  gridSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  units: "feet" | "meters" | "centimeters" | "inches";
  setViewport: (p: Partial<ViewportState>) => void;
  pan: (dx: number, dy: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setZoom: (z: number) => void;
  fitToFloor: (floorW: number, floorH: number, containerW: number, containerH: number) => void;
}

export const useViewportStore = create<ViewportState>((set, get) => ({
  x: 0,
  y: 0,
  zoom: 20, // pixels per foot
  gridSize: 1,
  showGrid: true,
  snapToGrid: true,
  units: "feet",
  setViewport: (p) => set(p),
  pan: (dx, dy) => set({ x: get().x + dx, y: get().y + dy }),
  zoomIn: () => set({ zoom: Math.min(80, get().zoom * 1.2) }),
  zoomOut: () => set({ zoom: Math.max(5, get().zoom / 1.2) }),
  setZoom: (z) => set({ zoom: Math.max(5, Math.min(80, z)) }),
  fitToFloor: (floorW, floorH, cw, ch) => {
    const padding = 60;
    const scaleX = (cw - padding * 2) / floorW;
    const scaleY = (ch - padding * 2) / floorH;
    const zoom = Math.min(scaleX, scaleY, 60);
    const cx = floorW / 2;
    const cy = floorH / 2;
    const x = cx - cw / 2 / zoom;
    const y = cy - ch / 2 / zoom;
    set({ x, y, zoom: Math.max(zoom, 5) });
  },
}));
