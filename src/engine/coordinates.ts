import type { Point } from "../types/design";

export interface ViewportTransform {
  x: number; // pan offset in screen pixels? We'll store world pan
  y: number;
  zoom: number; // scale factor
}

export function worldToScreen(world: Point, viewport: ViewportTransform): Point {
  return {
    x: (world.x - viewport.x) * viewport.zoom,
    y: (world.y - viewport.y) * viewport.zoom,
  };
}

export function screenToWorld(screen: Point, viewport: ViewportTransform): Point {
  return {
    x: screen.x / viewport.zoom + viewport.x,
    y: screen.y / viewport.zoom + viewport.y,
  };
}

export function getViewportForFit(
  floorWidth: number,
  floorHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding = 40
): ViewportTransform {
  const scaleX = (containerWidth - padding * 2) / floorWidth;
  const scaleY = (containerHeight - padding * 2) / floorHeight;
  const zoom = Math.min(scaleX, scaleY, 60); // cap
  // center
  const worldCenterX = floorWidth / 2;
  const worldCenterY = floorHeight / 2;
  const screenCenterX = containerWidth / 2;
  const screenCenterY = containerHeight / 2;
  const x = worldCenterX - screenCenterX / zoom;
  const y = worldCenterY - screenCenterY / zoom;
  return { x, y, zoom: Math.max(zoom, 5) };
}
