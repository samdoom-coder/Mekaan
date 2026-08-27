import { create } from "zustand";

export type ToolType = "select" | "room" | "wall" | "door" | "window" | "dimension" | "furniture" | "plot";
export type AppView = "projects" | "editor";

interface UIState {
  view: AppView;
  tool: ToolType;
  roomType: string;
  furnitureType: string;
  showProperties: boolean;
  showVersionHistory: boolean;
  saveStatus: "saved" | "saving" | "unsaved";
  toasts: { id: string; message: string; type: "error" | "info" | "success" }[];
  setView: (v: AppView) => void;
  setTool: (t: ToolType) => void;
  setRoomType: (r: string) => void;
  setFurnitureType: (f: string) => void;
  setSaveStatus: (s: UIState["saveStatus"]) => void;
  pushToast: (message: string, type?: UIState["toasts"][number]["type"]) => void;
  dismissToast: (id: string) => void;
  toggleProperties: () => void;
  toggleVersionHistory: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  view: "editor",
  tool: "select",
  roomType: "bedroom",
  furnitureType: "sofa",
  showProperties: true,
  showVersionHistory: false,
  saveStatus: "saved",
  toasts: [],
  setView: (view) => set({ view }),
  setTool: (tool) => set({ tool }),
  setRoomType: (roomType) => set({ roomType }),
  setFurnitureType: (furnitureType) => set({ furnitureType }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  pushToast: (message, type = "info") => {
    const id = Math.random().toString(36).slice(2, 7);
    set({ toasts: [...get().toasts, { id, message, type }] });
    setTimeout(() => get().dismissToast(id), 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter(t => t.id !== id) }),
  toggleProperties: () => set({ showProperties: !get().showProperties }),
  toggleVersionHistory: () => set({ showVersionHistory: !get().showVersionHistory }),
}));
