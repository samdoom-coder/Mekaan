import { create } from "zustand";
import type { Design } from "../types/design";

interface VersionEntry {
  id: string;
  name: string;
  createdAt: string;
  design: Design;
}

interface HistoryStoreState {
  versions: VersionEntry[];
  addVersion: (name: string, design: Design) => void;
  restoreVersion: (id: string) => Design | null;
  deleteVersion: (id: string) => void;
  load: (versions: VersionEntry[]) => void;
}

export const useHistoryStore = create<HistoryStoreState>((set, get) => ({
  versions: [],
  addVersion: (name, design) => {
    const entry: VersionEntry = {
      id: `ver_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
      name,
      createdAt: new Date().toISOString(),
      design: JSON.parse(JSON.stringify(design)),
    };
    const next = [entry, ...get().versions];
    set({ versions: next });
    localStorage.setItem("floorplan_versions", JSON.stringify(next));
  },
  restoreVersion: (id) => {
    const v = get().versions.find(x => x.id === id);
    return v ? JSON.parse(JSON.stringify(v.design)) : null;
  },
  deleteVersion: (id) => {
    const next = get().versions.filter(v => v.id !== id);
    set({ versions: next });
    localStorage.setItem("floorplan_versions", JSON.stringify(next));
  },
  load: (versions) => set({ versions }),
}));

export function hydrateVersions() {
  try {
    const raw = localStorage.getItem("floorplan_versions");
    if (raw) useHistoryStore.setState({ versions: JSON.parse(raw) });
  } catch {}
}
