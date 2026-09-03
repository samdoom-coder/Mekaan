import { describe, it, expect } from "vitest";
import {
  collectSnapTargets,
  snapEdgeToTargets,
  snapRectToTargets,
} from "./snapping";

const big = { x: 10, y: 10, width: 14, height: 14 }; // e.g. master bedroom

describe("object (edge-to-edge) snapping", () => {
  it("snaps a small room flush to a big room's right edge", () => {
    const targets = collectSnapTargets([big], { width: 40, height: 60 });
    // small laundry 6x6 just left of the edge (0.6 ft gap)
    const small = { x: 3.4, y: 12, width: 6, height: 6 };
    const res = snapRectToTargets(small, targets, 1.0);
    expect(res.snappedX).toBe(true);
    expect(res.x).toBeCloseTo(4, 5); // right edge 4+6=10 flush with big's left
    expect(res.x + small.width).toBeCloseTo(big.x, 5);
  });

  it("snaps a small room's top edge and center-lines", () => {
    const targets = collectSnapTargets([big], { width: 40, height: 60 });
    // top edge 0.5 above big's top
    const small = { x: 12, y: 9.5, width: 5, height: 5 };
    const res = snapRectToTargets(small, targets, 1.0);
    expect(res.snappedY).toBe(true);
    expect(res.y).toBeCloseTo(10, 5);
  });

  it("leaves a far-away room untouched", () => {
    const targets = collectSnapTargets([big], { width: 40, height: 60 });
    const res = snapRectToTargets({ x: 30, y: 40, width: 5, height: 5 }, targets, 1.0);
    expect(res.snappedX).toBe(false);
    expect(res.snappedY).toBe(false);
    expect(res.x).toBe(30);
    expect(res.y).toBe(40);
  });

  it("behaves the same for big moving rects (no size-dependent behaviour)", () => {
    const other = { x: 0, y: 0, width: 10, height: 10 };
    const targets = collectSnapTargets([other], { width: 40, height: 60 });
    const bigMove = { x: 10.7, y: 20, width: 15, height: 14 };
    const smallMove = { x: 10.7, y: 20, width: 5, height: 5 };
    const r1 = snapRectToTargets(bigMove, targets, 1.0);
    const r2 = snapRectToTargets(smallMove, targets, 1.0);
    expect(r1.snappedX).toBe(true);
    expect(r2.snappedX).toBe(true);
    expect(r1.x).toBeCloseTo(10, 5);
    expect(r2.x).toBeCloseTo(10, 5);
  });

  it("snaps to plot bounds", () => {
    const targets = collectSnapTargets([], { width: 40, height: 60 });
    const res = snapRectToTargets({ x: 0.6, y: 30, width: 6, height: 6 }, targets, 1.0);
    expect(res.snappedX).toBe(true);
    expect(res.x).toBeCloseTo(0, 5);
  });

  it("snapEdgeToTargets picks the nearest edge within threshold", () => {
    const r = snapEdgeToTargets(9.6, [0, 10, 24], 1.0);
    expect(r.snapped).toBe(true);
    expect(r.value).toBe(10);
    const miss = snapEdgeToTargets(5, [0, 10, 24], 1.0);
    expect(miss.snapped).toBe(false);
    expect(miss.value).toBe(5);
  });
});
