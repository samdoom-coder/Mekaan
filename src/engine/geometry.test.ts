import { describe, it, expect } from "vitest";
import { roomBoundingBox, roomsOverlap, roomInsideFloor, roomArea, wallLength, pointOnWall, isValidRoomSize, wallPolygon } from "./geometry";
import { worldToScreen, screenToWorld } from "./coordinates";
import { convert, convertToFeet, formatDistance } from "./measurement";
import { validateRoomPlacement, validateWall, validateDoor, validateWindow } from "./constraints";
import type { Room, Wall, Door, Window, Floor } from "../types/design";

const floor: Floor = {
  id: "floor_1", name: "Ground", level: 0, width: 40, height: 60,
  rooms: [], walls: [], doors: [], windows: [], objects: [], dimensions: [], annotations: []
};

function makeRoom(id: string, x: number, y: number, w: number, h: number, rotation=0): Room {
  return { id, name: id, type: "bedroom", x, y, width: w, height: h, rotation, properties: {} };
}
function makeWall(id: string, sx: number, sy: number, ex: number, ey: number, thickness=0.5): Wall {
  return { id, start: {x:sx,y:sy}, end:{x:ex,y:ey}, thickness, height:9, type:"interior" };
}

describe("geometry", () => {
  it("room containment inside floor", () => {
    const r = makeRoom("r1", 5,5,10,10);
    expect(roomInsideFloor(r, floor)).toBe(true);
    const out = makeRoom("r2", 35,55,10,10);
    expect(roomInsideFloor(out, floor)).toBe(false);
    const edge = makeRoom("r3", 0,0,40,60);
    expect(roomInsideFloor(edge, floor)).toBe(true);
  });

  it("room overlap detection", () => {
    const a = makeRoom("a",0,0,10,10);
    const b = makeRoom("b",5,5,10,10);
    const c = makeRoom("c",15,15,5,5);
    expect(roomsOverlap(a,b)).toBe(true);
    expect(roomsOverlap(a,c)).toBe(false);
    expect(roomsOverlap(b,c)).toBe(false);
  });

  it("wall length", () => {
    const w = makeWall("w1",0,0,10,0);
    expect(wallLength(w)).toBeCloseTo(10);
    const diag = makeWall("w2",0,0,3,4);
    expect(wallLength(diag)).toBeCloseTo(5);
  });

  it("door attachment validation", () => {
    const w = makeWall("w1",0,0,10,0);
    const doorValid: Door = { id:"d1", wallId:"w1", position:0.5, width:3, swingDirection:"left" };
    expect(validateDoor(doorValid, w).valid).toBe(true);
    const shortWall = makeWall("w2",0,0,2,0);
    const doorInvalid: Door = { id:"d2", wallId:"w2", position:0.5, width:3, swingDirection:"left" };
    expect(validateDoor(doorInvalid, shortWall).valid).toBe(false);
    expect(validateDoor(doorValid, undefined).valid).toBe(false);
  });

  it("window attachment", () => {
    const w = makeWall("w1",0,0,12,0);
    const win: Window = { id:"win1", wallId:"w1", position:0.5, width:4, height:4 };
    expect(validateWindow(win,w).valid).toBe(true);
    const short = makeWall("w2",0,0,3,0);
    expect(validateWindow(win,short).valid).toBe(false);
  });

  it("room resizing and validation", () => {
    const r = makeRoom("r1",5,5,10,10);
    expect(isValidRoomSize(r,6)).toBe(true);
    const small = makeRoom("r2",0,0,4,4);
    expect(isValidRoomSize(small,6)).toBe(false);
    expect(validateRoomPlacement(small, floor, []).valid).toBe(false);
  });

  it("coordinate conversion", () => {
    const viewport = { x:10, y:5, zoom:20 };
    const world = { x:15, y:10 };
    const screen = worldToScreen(world, viewport);
    expect(screen.x).toBeCloseTo((15-10)*20);
    expect(screen.y).toBeCloseTo((10-5)*20);
    const back = screenToWorld(screen, viewport);
    expect(back.x).toBeCloseTo(world.x);
    expect(back.y).toBeCloseTo(world.y);
  });

  it("unit conversion", () => {
    expect(convert(10,"meters")).toBeCloseTo(3.048,2);
    expect(convertToFeet(3.048,"meters")).toBeCloseTo(10,1);
    expect(formatDistance(14,"feet")).toContain("14'");
    expect(formatDistance(10,"meters")).toContain("m");
  });

  it("wall polygon produces 4 points", () => {
    const w = makeWall("w1",0,0,10,0,0.5);
    const poly = wallPolygon(w);
    expect(poly).toHaveLength(4);
  });

  it("validate wall", () => {
    const good = makeWall("w1",0,0,10,0);
    expect(validateWall(good).valid).toBe(true);
    const bad = makeWall("w2",0,0,0.2,0);
    expect(validateWall(bad).valid).toBe(false);
  });
});
