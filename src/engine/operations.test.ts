import { describe, it, expect } from "vitest";
import { useDesignStore } from "../stores/designStore";
import { createDemoDesign } from "../utils/demoData";

describe("undo/redo", () => {
  it("creates and undoes room", () => {
    const demo = createDemoDesign();
    useDesignStore.getState().setDesign(demo);
    let state = useDesignStore.getState();
    const floorId = demo.floors[0].id;
    const initialCount = state.design!.floors[0].rooms.length;
    // use non-overlapping area at bottom of floor (hall is at y=33 h=4, so y=38 is free)
    const res = state.createRoom(floorId, { id:"room_test", name:"Test", type:"study", x:2, y:40, width:8, height:8, rotation:0, properties:{} });
    expect(res.success).toBe(true);
    expect(useDesignStore.getState().design!.floors[0].rooms.length).toBe(initialCount+1);
    useDesignStore.getState().undo();
    expect(useDesignStore.getState().design!.floors[0].rooms.length).toBe(initialCount);
    useDesignStore.getState().redo();
    expect(useDesignStore.getState().design!.floors[0].rooms.length).toBe(initialCount+1);
  });
  it("constraint prevents overlap", () => {
    const demo = createDemoDesign();
    const store = useDesignStore.getState();
    store.setDesign(demo);
    const floorId = demo.floors[0].id;
    const firstRoom = demo.floors[0].rooms[0];
    const overlapping = { id:"overlap", name:"Overlap", type:"bedroom" as const, x:firstRoom.x, y:firstRoom.y, width:firstRoom.width, height:firstRoom.height, rotation:0, properties:{} };
    const res = store.createRoom(floorId, overlapping);
    expect(res.success).toBe(false);
  });
});
