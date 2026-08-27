import { create } from "zustand";
import type { SelectionItem } from "../types/design";

interface SelectionState {
  selected: SelectionItem[];
  clipboard: SelectionItem[];
  setSelection: (items: SelectionItem[]) => void;
  addToSelection: (item: SelectionItem) => void;
  toggleSelection: (item: SelectionItem) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  // drag rectangle
  dragRect: { x: number; y: number; w: number; h: number } | null;
  setDragRect: (r: { x: number; y: number; w: number; h: number } | null) => void;
  copy: () => void;
  paste: () => SelectionItem[] | null;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selected: [],
  clipboard: [],
  dragRect: null,
  setSelection: (items) => set({ selected: items }),
  addToSelection: (item) => {
    const { selected } = get();
    if (selected.find(s => s.id === item.id)) return;
    set({ selected: [...selected, item] });
  },
  toggleSelection: (item) => {
    const { selected } = get();
    if (selected.find(s => s.id === item.id)) {
      set({ selected: selected.filter(s => s.id !== item.id) });
    } else {
      set({ selected: [...selected, item] });
    }
  },
  clearSelection: () => set({ selected: [] }),
  isSelected: (id) => !!get().selected.find(s => s.id === id),
  setDragRect: (r) => set({ dragRect: r }),
  copy: () => {
    const { selected } = get();
    set({ clipboard: [...selected] });
  },
  paste: () => {
    const { clipboard } = get();
    return clipboard.length ? clipboard : null;
  },
}));
