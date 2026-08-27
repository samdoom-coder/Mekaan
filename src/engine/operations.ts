import type { DesignOperation, OperationType } from "../types/design";

export function createOperation(type: OperationType, payload: unknown): DesignOperation {
  return {
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    timestamp: Date.now(),
    payload,
  };
}

// History management
export interface HistoryState {
  past: DesignOperation[];
  future: DesignOperation[];
  // we store design snapshots separately in store; operations are for audit
}

export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}
export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}
