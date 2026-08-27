import { useRef, useState, useEffect, useCallback, memo } from "react";
import { useDesignStore } from "../../stores/designStore";
import { useViewportStore } from "../../stores/viewportStore";
import { useSelectionStore } from "../../stores/selectionStore";
import { useUIStore } from "../../stores/uiStore";
import FloorRenderer from "../../renderers/svg/FloorRenderer";
import { screenToWorld } from "../../engine/coordinates";
import { snapPoint } from "../../engine/snapping";
import { pointDistance, roomsOverlap } from "../../engine/geometry";
import { validateRoomPlacement } from "../../engine/constraints";
import type { Room, Wall, DesignObject, Point } from "../../types/design";
import { ROOM_TYPE_LABELS } from "../../utils/demoData";

const Grid = memo(function Grid({ viewport }: { viewport: any }) {
  if (!viewport.showGrid) return null;
  const gridSize = viewport.gridSize;
  const zoom = viewport.zoom;
  // Optimized pattern-based grid: single rect covering entire canvas, very performant
  // Small grid (gridSize) + major every 5 units, both move with viewport via patternTransform
  const small = gridSize * zoom;
  const major = 5 * gridSize * zoom;
  // clamp pattern size to avoid extreme density when zoomed out/in
  const clampedSmall = Math.max(8, Math.min(small, 80));
  const clampedMajor = Math.max(40, Math.min(major, 400));
  const offX = (-viewport.x * zoom) % clampedSmall;
  const offY = (-viewport.y * zoom) % clampedSmall;
  const offXM = (-viewport.x * zoom) % clampedMajor;
  const offYM = (-viewport.y * zoom) % clampedMajor;
  return (
    <g id="grid-group">
      <defs>
        <pattern id="smallGrid" width={clampedSmall} height={clampedSmall} patternUnits="userSpaceOnUse" patternTransform={`translate(${offX} ${offY})`}>
          <path d={`M ${clampedSmall} 0 L 0 0 0 ${clampedSmall}`} fill="none" stroke="#86efac" strokeWidth={0.9} strokeOpacity={0.55} />
        </pattern>
        <pattern id="majorGrid" width={clampedMajor} height={clampedMajor} patternUnits="userSpaceOnUse" patternTransform={`translate(${offXM} ${offYM})`}>
          <rect width="100%" height="100%" fill="url(#smallGrid)" />
          <path d={`M ${clampedMajor} 0 L 0 0 0 ${clampedMajor}`} fill="none" stroke="#16a34a" strokeWidth={1.15} strokeOpacity={0.85} />
        </pattern>
      </defs>
      <rect x={0} y={0} width="100%" height="100%" fill="url(#majorGrid)" />
      {/* subtle vignette for depth */}
      <rect x={0} y={0} width="100%" height="100%" fill="none" stroke="#bbf7d0" strokeWidth={0} />
    </g>
  );
});

export default function Canvas() {
  const design = useDesignStore(s => s.design);
  const viewport = useViewportStore();
  const selection = useSelectionStore();
  const ui = useUIStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [dimStart, setDimStart] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; type: "room" | "object"; offsetX: number; offsetY: number; startX: number; startY: number } | null>(null);
  const [pendingDrag, setPendingDrag] = useState<{ id: string; type: "room" | "object"; startWorld: { x: number; y: number }; startX: number; startY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; type: "room" | "wall" | "object"; handle: string; startMouse: { x: number; y: number }; startRoom?: Room; startWall?: Wall; startObj?: any } | null>(null);
  const [plotPoints, setPlotPoints] = useState<Point[]>([]);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

  const floor = design?.floors[0];
  const units = design?.units || "feet";

  // track container size with ResizeObserver for accurate grid
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setContainerSize({ w: rect.width, h: rect.height });
    });
    ro.observe(containerRef.current);
    // initial
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0) setContainerSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, []);

  // fit on mount or floor change, and when container size becomes known
  useEffect(() => {
    if (!floor || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    viewport.fitToFloor(floor.width, floor.height, rect.width, rect.height);
  }, [floor?.id, containerSize.w, containerSize.h]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.code === "Escape") {
        if (plotPoints.length > 0) {
          setPlotPoints([]);
          return;
        }
        if (wallStart) setWallStart(null);
        if (dimStart) setDimStart(null);
        if (dragStart) { setDragStart(null); selection.setDragRect(null); }
        if (pendingDrag) setPendingDrag(null);
        if (dragging) {
          useDesignStore.getState().undo();
          setDragging(null);
        }
        if (resizing) {
          useDesignStore.getState().undo();
          setResizing(null);
        }
      }
      if ((e.code === "Enter" || e.code === "NumpadEnter") && ui.tool === "plot" && plotPoints.length >= 3) {
        const ds = useDesignStore.getState();
        if (floor) {
          ds.setFloorShape(floor.id, { type: "custom", polygon: [...plotPoints] });
          ui.pushToast(`Custom plot with ${plotPoints.length} sides created`, "success");
          ui.setTool("select");
        }
        setPlotPoints([]);
      }
    };
    const handleUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleUp);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleUp);
    };
  }, [wallStart, dimStart, dragStart, dragging, pendingDrag, resizing, selection, plotPoints, floor, ui.tool]);

  // clear plot points when leaving plot tool
  useEffect(() => {
    if (ui.tool !== "plot" && plotPoints.length > 0) setPlotPoints([]);
  }, [ui.tool]);

  const getWorldPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const screen = { x: clientX - rect.left, y: clientY - rect.top };
      const world = screenToWorld(screen, { x: viewport.x, y: viewport.y, zoom: viewport.zoom });
      // snapping for tools that benefit
      const shouldSnap = viewport.snapToGrid && (ui.tool !== "select" || dragging != null);
      if (shouldSnap) return snapPoint(world, viewport.gridSize);
      return world;
    },
    [viewport.x, viewport.y, viewport.zoom, viewport.snapToGrid, viewport.gridSize, ui.tool, dragging]
  );

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = Math.max(6, Math.min(80, viewport.zoom * delta));
    if (!svgRef.current) {
      viewport.setViewport({ zoom: newZoom });
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldBefore = screenToWorld({ x: mx, y: my }, { x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    const worldAfter = screenToWorld({ x: mx, y: my }, { x: viewport.x, y: viewport.y, zoom: newZoom });
    const dx = worldBefore.x - worldAfter.x;
    const dy = worldBefore.y - worldAfter.y;
    viewport.setViewport({ zoom: newZoom, x: viewport.x + dx, y: viewport.y + dy });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const world = getWorldPoint(e.clientX, e.clientY);
    // panning: middle mouse or space+left
    if (e.button === 1 || (spaceHeld && e.button === 0)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y });
      return;
    }
    if (e.button !== 0) return;

    // check if click is on selectable
    const target = e.target as HTMLElement;
    const handleEl = target.closest("[data-handle]") as HTMLElement | null;
    if (handleEl && ui.tool === "select") {
      const hid = handleEl.getAttribute("data-handle")!;
      const hidId = handleEl.getAttribute("data-id")!;
      const hidType = handleEl.getAttribute("data-type") as any;
      if (!floor) return;
      e.stopPropagation();
      if (hidType === "room") {
        const room = floor.rooms.find(r => r.id === hidId);
        if (room) {
          useDesignStore.getState().saveSnapshot();
          setResizing({ id: hidId, type: "room", handle: hid, startMouse: world, startRoom: { ...room } });
          return;
        }
      } else if (hidType === "wall") {
        const wall = floor.walls.find(w => w.id === hidId);
        if (wall) {
          useDesignStore.getState().saveSnapshot();
          setResizing({ id: hidId, type: "wall", handle: hid, startMouse: world, startWall: { ...wall, start: { ...wall.start }, end: { ...wall.end } } });
          return;
        }
      } else if (hidType === "object") {
        const obj = floor.objects.find(o => o.id === hidId);
        if (obj) {
          useDesignStore.getState().saveSnapshot();
          setResizing({ id: hidId, type: "object", handle: hid, startMouse: world, startObj: { ...obj } });
          return;
        }
      }
    }
    // plot tool: draw custom polygon
    if (ui.tool === "plot") {
      if (!floor) return;
      const pt = viewport.snapToGrid ? snapPoint(world, viewport.gridSize) : world;
      if (plotPoints.length === 0) {
        setPlotPoints([pt]);
      } else {
        const first = plotPoints[0];
        if (plotPoints.length >= 3 && Math.hypot(pt.x - first.x, pt.y - first.y) < 1.2) {
          const poly = [...plotPoints];
          useDesignStore.getState().setFloorShape(floor.id, { type: "custom", polygon: poly });
          useUIStore.getState().pushToast(`Custom plot with ${poly.length} points created`, "success");
          setPlotPoints([]);
        } else {
          setPlotPoints([...plotPoints, pt]);
        }
      }
      return;
    }

    const selectableEl = target.closest("[data-selectable]") as HTMLElement | null;
    const isOnSelectable = !!selectableEl;

    if (ui.tool === "select") {
      if (isOnSelectable) {
        const id = selectableEl!.getAttribute("data-id")!;
        const type = selectableEl!.getAttribute("data-type") as any;
        if (!floor) return;
        if (e.shiftKey) {
          const item = { id, type, floorId: floor.id } as any;
          selection.toggleSelection(item);
          return;
        }
        const alreadySelected = selection.selected.some(s => s.id === id);
        if (!alreadySelected) {
          selection.setSelection([{ id, type, floorId: floor.id } as any]);
        }
        // start pending drag (will become real drag after threshold)
        if (type === "room") {
          const room = floor.rooms.find(r => r.id === id);
          if (room) {
            setPendingDrag({ id, type: "room", startWorld: world, startX: room.x, startY: room.y });
          }
        } else if (type === "object") {
          const obj = floor.objects.find(o => o.id === id);
          if (obj) {
            setPendingDrag({ id, type: "object", startWorld: world, startX: obj.x, startY: obj.y });
          }
        }
        return;
      } else {
        // background click: start box selection
        if (!e.shiftKey) selection.clearSelection();
        setDragStart(world);
        setCurrentPoint(world);
        return;
      }
    } else if (ui.tool === "room") {
      // always start room drag from background, even if over selectable we still start room? 
      // but if over selectable, we might be trying to place room overlapping, better allow
      setDragStart(world);
      setCurrentPoint(world);
      return;
    } else if (ui.tool === "wall") {
      if (!wallStart) {
        setWallStart(world);
        setCurrentPoint(world);
      } else {
        const ds = useDesignStore.getState();
        if (floor) {
          const wall: Wall = {
            id: `wall_${Math.random().toString(36).slice(2, 7)}`,
            start: wallStart,
            end: world,
            thickness: 0.5,
            height: 9,
            type: "interior",
          };
          const res = ds.createWall(floor.id, wall);
          if (!res.success) ui.pushToast(res.error || "Invalid wall", "error");
          else ui.pushToast("Wall created", "success");
        }
        setWallStart(null);
        setCurrentPoint(null);
      }
      return;
    } else if (ui.tool === "door" || ui.tool === "window") {
      if (!floor) return;
      let bestWall: Wall | null = null;
      let bestDist = Infinity;
      let bestT = 0;
      for (const w of floor.walls) {
        const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
        if (len < 0.1) continue;
        const t = ((world.x - w.start.x) * (w.end.x - w.start.x) + (world.y - w.start.y) * (w.end.y - w.start.y)) / (len * len);
        const clamped = Math.max(0, Math.min(1, t));
        const proj = { x: w.start.x + (w.end.x - w.start.x) * clamped, y: w.start.y + (w.end.y - w.start.y) * clamped };
        const d = pointDistance(world, proj);
        if (d < bestDist) { bestDist = d; bestWall = w; bestT = clamped; }
      }
      if (bestWall && bestDist < 2.5) {
        const ds = useDesignStore.getState();
        if (ui.tool === "door") {
          const res = ds.createDoor(floor.id, { id: `door_${Math.random().toString(36).slice(2,7)}`, wallId: bestWall.id, position: bestT, width: 3, swingDirection: "right" });
          if (!res.success) ui.pushToast(res.error || "Cannot place door", "error");
          else ui.pushToast("Door placed", "success");
        } else {
          const res = ds.createWindow(floor.id, { id: `win_${Math.random().toString(36).slice(2,7)}`, wallId: bestWall.id, position: bestT, width: 4, height: 4, type: "casement" });
          if (!res.success) ui.pushToast(res.error || "Cannot place window", "error");
          else ui.pushToast("Window placed", "success");
        }
      } else {
        ui.pushToast(`Click near a wall to place ${ui.tool}`, "error");
      }
      return;
    } else if (ui.tool === "dimension") {
      if (!dimStart) {
        setDimStart(world);
        setCurrentPoint(world);
      } else {
        const ds = useDesignStore.getState();
        if (floor) {
          ds.createDimension(floor.id, { id: `dim_${Math.random().toString(36).slice(2,7)}`, start: dimStart, end: world });
          ui.pushToast("Dimension added", "success");
        }
        setDimStart(null);
        setCurrentPoint(null);
      }
      return;
    } else if (ui.tool === "furniture") {
      const ds = useDesignStore.getState();
      if (floor) {
        const isBed = ui.furnitureType === "bed";
        ds.createObject(floor.id, { id: `obj_${Math.random().toString(36).slice(2,7)}`, type: ui.furnitureType as any, x: world.x - (isBed?3:1.5), y: world.y - (isBed?2:1.2), width: isBed ? 6 : 3, height: isBed ? 4 : 2.5, rotation: 0 });
        ui.pushToast(`${ui.furnitureType.replace("-"," ")} placed`, "success");
      }
      return;
    } else if (ui.tool === "plot") {
      const snapped = viewport.snapToGrid ? snapPoint(world, viewport.gridSize) : world;
      if (plotPoints.length >= 2) {
        const first = plotPoints[0];
        if (pointDistance(snapped, first) < 1.2) {
          const poly = [...plotPoints];
          if (poly.length >= 3) {
            const ds = useDesignStore.getState();
            if (floor) {
              ds.setFloorShape(floor.id, { type: "custom", polygon: poly });
              ui.pushToast(`Custom plot with ${poly.length} sides created`, "success");
              ui.setTool("select");
            }
          }
          setPlotPoints([]);
          return;
        }
      }
      setPlotPoints([...plotPoints, snapped]);
      return;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const world = getWorldPoint(e.clientX, e.clientY);
    setCurrentPoint(world);

    if (isPanning && panStart) {
      const dx = (e.clientX - panStart.x) / viewport.zoom;
      const dy = (e.clientY - panStart.y) / viewport.zoom;
      viewport.setViewport({ x: panStart.vx - dx, y: panStart.vy - dy });
      return;
    }

    if (resizing) {
      if (!floor) return;
      const ds = useDesignStore.getState();
      const dx = world.x - resizing.startMouse.x;
      const dy = world.y - resizing.startMouse.y;
      if (resizing.type === "room" && resizing.startRoom) {
        const sr = resizing.startRoom;
        let nx = sr.x, ny = sr.y, nw = sr.width, nh = sr.height;
        const h = resizing.handle;
        if (h === "se") { nw = sr.width + dx; nh = sr.height + dy; }
        else if (h === "nw") { nx = sr.x + dx; ny = sr.y + dy; nw = sr.width - dx; nh = sr.height - dy; }
        else if (h === "ne") { ny = sr.y + dy; nw = sr.width + dx; nh = sr.height - dy; }
        else if (h === "sw") { nx = sr.x + dx; nw = sr.width - dx; nh = sr.height + dy; }
        else if (h === "n") { ny = sr.y + dy; nh = sr.height - dy; }
        else if (h === "s") { nh = sr.height + dy; }
        else if (h === "e") { nw = sr.width + dx; }
        else if (h === "w") { nx = sr.x + dx; nw = sr.width - dx; }
        else if (h === "rotate") {
          const cx = sr.x + sr.width / 2, cy = sr.y + sr.height / 2;
          const ang = Math.atan2(world.y - cy, world.x - cx) * 180 / Math.PI;
          const sang = Math.atan2(resizing.startMouse.y - cy, resizing.startMouse.x - cx) * 180 / Math.PI;
          let nr = (sr.rotation + (ang - sang)) % 360;
          if (nr < 0) nr += 360;
          if (viewport.snapToGrid) nr = Math.round(nr / 15) * 15;
          ds.liveUpdateRoom(floor.id, resizing.id, { rotation: nr });
          return;
        }
        if (viewport.snapToGrid) {
          // snap position and size to grid
          const sp = snapPoint({ x: nx, y: ny }, viewport.gridSize);
          // keep size snapped as well
          const ex = nx + nw, ey = ny + nh;
          const se = snapPoint({ x: ex, y: ey }, viewport.gridSize);
          nx = sp.x; ny = sp.y;
          nw = Math.max(1, se.x - nx);
          nh = Math.max(1, se.y - ny);
        }
        nw = Math.max(1, nw); nh = Math.max(1, nh);
        ds.liveUpdateRoom(floor.id, resizing.id, { x: nx, y: ny, width: nw, height: nh });
        return;
      } else if (resizing.type === "wall" && resizing.startWall) {
        const sw = resizing.startWall;
        let ns = { ...sw.start }, ne = { ...sw.end };
        if (resizing.handle === "start") ns = { x: world.x, y: world.y };
        else ne = { x: world.x, y: world.y };
        if (viewport.snapToGrid) {
          ns = snapPoint(ns, viewport.gridSize);
          ne = snapPoint(ne, viewport.gridSize);
        }
        ds.liveUpdateWall(floor.id, resizing.id, { start: ns, end: ne });
        return;
      } else if (resizing.type === "object" && resizing.startObj) {
        const so = resizing.startObj as DesignObject;
        let nx = so.x, ny = so.y, nw = so.width, nh = so.height;
        if (resizing.handle === "se") { nw = so.width + dx; nh = so.height + dy; }
        else if (resizing.handle === "nw") { nx = so.x + dx; ny = so.y + dy; nw = so.width - dx; nh = so.height - dy; }
        else if (resizing.handle === "ne") { ny = so.y + dy; nw = so.width + dx; nh = so.height - dy; }
        else if (resizing.handle === "sw") { nx = so.x + dx; nw = so.width - dx; nh = so.height + dy; }
        if (viewport.snapToGrid) {
          const sp = snapPoint({ x: nx, y: ny }, viewport.gridSize);
          const se = snapPoint({ x: nx + nw, y: ny + nh }, viewport.gridSize);
          nx = sp.x; ny = sp.y;
          nw = Math.max(1, se.x - nx);
          nh = Math.max(1, se.y - ny);
        }
        ds.liveUpdateObject(floor.id, resizing.id, { x: nx, y: ny, width: Math.max(1, nw), height: Math.max(1, nh) });
        return;
      }
    }

    // pending drag -> check threshold to become real drag
    if (pendingDrag) {
      const dx = world.x - pendingDrag.startWorld.x;
      const dy = world.y - pendingDrag.startWorld.y;
      if (Math.hypot(dx, dy) > 0.12) {
        // start real drag
        useDesignStore.getState().saveSnapshot();
        const offsetX = pendingDrag.startWorld.x - pendingDrag.startX;
        const offsetY = pendingDrag.startWorld.y - pendingDrag.startY;
        setDragging({ id: pendingDrag.id, type: pendingDrag.type, offsetX, offsetY, startX: pendingDrag.startX, startY: pendingDrag.startY });
        setPendingDrag(null);
        // apply first move
        if (!floor) return;
        const ds = useDesignStore.getState();
        const x = world.x - offsetX;
        const y = world.y - offsetY;
        // snap new position if needed
        let nx = x, ny = y;
        if (viewport.snapToGrid) {
          const snapped = snapPoint({ x, y }, viewport.gridSize);
          nx = snapped.x; ny = snapped.y;
        }
        if (pendingDrag.type === "room") ds.liveUpdateRoom(floor.id, pendingDrag.id, { x: nx, y: ny });
        else ds.liveUpdateObject(floor.id, pendingDrag.id, { x: nx, y: ny });
        return;
      } else {
        // not yet threshold, just update cursor
        // don't start drag yet
      }
    }

    if (dragging) {
      if (!floor) return;
      const ds = useDesignStore.getState();
      let x = world.x - dragging.offsetX;
      let y = world.y - dragging.offsetY;
      if (viewport.snapToGrid) {
        const s = snapPoint({ x, y }, viewport.gridSize);
        x = s.x; y = s.y;
      }
      if (dragging.type === "room") {
        ds.liveUpdateRoom(floor.id, dragging.id, { x, y });
      } else if (dragging.type === "object") {
        ds.liveUpdateObject(floor.id, dragging.id, { x, y });
      }
      return;
    }

    if (dragStart) {
      if (ui.tool === "select") {
        const rect = {
          x: Math.min(dragStart.x, world.x),
          y: Math.min(dragStart.y, world.y),
          w: Math.abs(world.x - dragStart.x),
          h: Math.abs(world.y - dragStart.y),
        };
        selection.setDragRect(rect);
      }
      // for room preview we just keep currentPoint, dragStart already set
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }
    if (resizing) {
      const ds = useDesignStore.getState();
      const cur = ds.design?.floors.find(f => f.id === floor?.id);
      if (cur && resizing.type === "room") {
        const room = cur.rooms.find(r => r.id === resizing.id);
        if (room) {
          const others = cur.rooms.filter(r => r.id !== resizing.id);
          const chk = validateRoomPlacement(room, cur as any, others as any);
          if (!chk.valid) {
            ds.undo();
            useUIStore.getState().pushToast(chk.message || "Invalid size/overlap", "error");
          } else if (room.width < 6 || room.height < 6) {
            ds.undo();
            useUIStore.getState().pushToast("Room must be at least 6×6 ft", "error");
          } else {
            ds.commitLive();
          }
        } else ds.commitLive();
      } else if (resizing.type === "wall") {
        const wall = cur?.walls.find(w => w.id === resizing.id);
        if (wall) {
          const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
          if (len < 0.5) {
            ds.undo();
            useUIStore.getState().pushToast("Wall too short", "error");
          } else ds.commitLive();
        } else ds.commitLive();
      } else {
        ds.commitLive();
      }
      setResizing(null);
      return;
    }
    if (pendingDrag) {
      // click without drag: already selected on mousedown, just clear pending
      setPendingDrag(null);
      return;
    }
    if (dragging) {
      const ds = useDesignStore.getState();
      const curDesign = ds.design;
      const curFloor = curDesign?.floors.find(f => f.id === floor?.id);
      if (curFloor && dragging.type === "room") {
        const room = curFloor.rooms.find(r => r.id === dragging.id);
        if (room) {
          const others = curFloor.rooms.filter(r => r.id !== dragging.id);
          const chk = validateRoomPlacement(room, curFloor, others as any);
          if (!chk.valid) {
            ds.undo();
            useUIStore.getState().pushToast(chk.message || "Cannot place room there", "error");
            setDragging(null);
            return;
          }
        }
      }
      ds.commitLive();
      setDragging(null);
      return;
    }
    const world = getWorldPoint(e.clientX, e.clientY);
    if (dragStart) {
      if (ui.tool === "select") {
        const rect = {
          x: Math.min(dragStart.x, world.x),
          y: Math.min(dragStart.y, world.y),
          w: Math.abs(world.x - dragStart.x),
          h: Math.abs(world.y - dragStart.y),
        };
        if (rect.w > 0.25 || rect.h > 0.25) {
          if (floor) {
            const selected: any[] = [];
            for (const r of floor.rooms) {
              const overlap = !(r.x + r.width < rect.x || r.x > rect.x + rect.w || r.y + r.height < rect.y || r.y > rect.y + rect.h);
              if (overlap) selected.push({ id: r.id, type: "room" as const, floorId: floor.id });
            }
            for (const o of floor.objects) {
              const overlap = !(o.x + o.width < rect.x || o.x > rect.x + rect.w || o.y + o.height < rect.y || o.y > rect.y + rect.h);
              if (overlap) selected.push({ id: o.id, type: "object" as const, floorId: floor.id });
            }
            for (const w of floor.walls) {
              // simple wall selection: wall midpoint inside rect
              const mx = (w.start.x + w.end.x)/2;
              const my = (w.start.y + w.end.y)/2;
              if (mx >= rect.x && mx <= rect.x+rect.w && my >= rect.y && my <= rect.y+rect.h) {
                selected.push({ id: w.id, type: "wall" as const, floorId: floor.id });
              }
            }
            selection.setSelection(selected);
          }
        }
        selection.setDragRect(null);
      } else if (ui.tool === "room") {
        if (floor) {
          let x = Math.min(dragStart.x, world.x);
          let y = Math.min(dragStart.y, world.y);
          let w = Math.abs(world.x - dragStart.x);
          let h = Math.abs(world.y - dragStart.y);
          // re-snap to grid for final if needed (already snapped start/end)
          if (viewport.snapToGrid) {
            const p1 = snapPoint({ x, y }, viewport.gridSize);
            const p2 = snapPoint({ x: x + w, y: y + h }, viewport.gridSize);
            x = Math.min(p1.x, p2.x);
            y = Math.min(p1.y, p2.y);
            w = Math.abs(p2.x - p1.x);
            h = Math.abs(p2.y - p1.y);
          }
          if (w < 2 || h < 2) {
            ui.pushToast("Room must be at least 2×2 ft (drag larger) — min 6×6 enforced", "error");
          } else {
            const ds = useDesignStore.getState();
            const room: Room = {
              id: `room_${Math.random().toString(36).slice(2, 7)}`,
              name: ROOM_TYPE_LABELS[ui.roomType] || ui.roomType,
              type: ui.roomType as any,
              x, y, width: w, height: h, rotation: 0, properties: {},
            };
            const res = ds.createRoom(floor.id, room);
            if (!res.success) ui.pushToast(res.error || "Cannot create room", "error");
            else {
              selection.setSelection([{ id: room.id, type: "room", floorId: floor.id }]);
              ui.setTool("select");
            }
          }
        }
      }
      setDragStart(null);
      // keep currentPoint for a moment? clear after short delay to avoid flicker
      // setCurrentPoint(null);
    }
  };

  const handleSelect = (id: string, type: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!floor) return;
    // when in select mode, mousedown already handles selection + drag, so click is redundant
    if (ui.tool === "select") return;
    const item = { id, type: type as any, floorId: floor.id };
    if (e.shiftKey) selection.toggleSelection(item);
    else selection.setSelection([item]);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (ui.tool === "plot" && plotPoints.length >= 3) {
      const ds = useDesignStore.getState();
      if (floor) {
        ds.setFloorShape(floor.id, { type: "custom", polygon: [...plotPoints] });
        ui.pushToast(`Custom plot with ${plotPoints.length} sides created`, "success");
        ui.setTool("select");
      }
      setPlotPoints([]);
      return;
    }
    // double click on background to fit
    const target = e.target as HTMLElement;
    const isBg = target.id === "canvas-bg" || target.id === "plot-bg" || target.closest("#grid-group");
    if (isBg) {
      if (floor && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        viewport.fitToFloor(floor.width, floor.height, rect.width, rect.height);
      }
    }
  };

  // capture mouse events outside svg while dragging/panning/resizing
  useEffect(() => {
    if (!isPanning && !dragging && !pendingDrag && !dragStart && !resizing) return;
    const winMove = (e: MouseEvent) => handleMouseMove(e as unknown as React.MouseEvent);
    const winUp = (e: MouseEvent) => handleMouseUp(e as unknown as React.MouseEvent);
    window.addEventListener("mousemove", winMove);
    window.addEventListener("mouseup", winUp);
    return () => {
      window.removeEventListener("mousemove", winMove);
      window.removeEventListener("mouseup", winUp);
    };
  }, [isPanning, dragging, pendingDrag, dragStart, resizing]);

  if (!design || !floor) {
    return <div className="flex-1 flex items-center justify-center text-zinc-500 bg-[#f0fdf4]">No design loaded</div>;
  }

  const selectedIds = new Set(selection.selected.map(s => s.id));
  const dragRect = selection.dragRect;
  // overlap detection for red lining + banner
  const overlappingIds = (() => {
    const s = new Set<string>();
    if (!floor) return s;
    for (let i = 0; i < floor.rooms.length; i++) for (let j = i + 1; j < floor.rooms.length; j++) {
      if (roomsOverlap(floor.rooms[i], floor.rooms[j])) { s.add(floor.rooms[i].id); s.add(floor.rooms[j].id); }
    }
    return s;
  })();

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#f0fdf4] select-none">
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={e => e.preventDefault()}
        style={{ cursor: isPanning ? "grabbing" : resizing ? "nwse-resize" : spaceHeld ? "grab" : ui.tool === "select" ? (dragging ? "grabbing" : "default") : "crosshair" }}
      >
        <rect id="canvas-bg" x={0} y={0} width="100%" height="100%" fill="#f0fdf4" />
        <Grid viewport={viewport} />

        <g transform={`translate(${-viewport.x * viewport.zoom} ${-viewport.y * viewport.zoom}) scale(${viewport.zoom})`}>
          <FloorRenderer floor={floor} units={units} selectedIds={selectedIds} hoverId={null} onSelect={handleSelect} />

          {dragStart && currentPoint && ui.tool === "room" && (
            <rect
              x={Math.min(dragStart.x, currentPoint.x)}
              y={Math.min(dragStart.y, currentPoint.y)}
              width={Math.abs(currentPoint.x - dragStart.x)}
              height={Math.abs(currentPoint.y - dragStart.y)}
              fill="rgba(59,130,246,0.15)"
              stroke="#2563eb"
              strokeWidth={0.08}
              strokeDasharray="0.35 0.25"
              rx={0.12}
            />
          )}
          {wallStart && currentPoint && ui.tool === "wall" && (
            <g>
              <line x1={wallStart.x} y1={wallStart.y} x2={currentPoint.x} y2={currentPoint.y} stroke="#2563eb" strokeWidth={0.35} strokeDasharray="0.3 0.25" />
              <circle cx={wallStart.x} cy={wallStart.y} r={0.28} fill="#2563eb" />
              <circle cx={currentPoint.x} cy={currentPoint.y} r={0.22} fill="white" stroke="#2563eb" strokeWidth={0.08} />
            </g>
          )}
          {dimStart && currentPoint && ui.tool === "dimension" && (
            <line x1={dimStart.x} y1={dimStart.y} x2={currentPoint.x} y2={currentPoint.y} stroke="#1a1a1a" strokeWidth={0.08} strokeDasharray="0.3 0.2" />
          )}
          {dragRect && ui.tool === "select" && (
            <rect x={dragRect.x} y={dragRect.y} width={dragRect.w} height={dragRect.h} fill="rgba(59,130,246,0.12)" stroke="#2563eb" strokeWidth={0.07} rx={0.08} />
          )}
          {ui.tool === "plot" && plotPoints.length > 0 && (
            <g>
              <polygon points={plotPoints.map(p => `${p.x},${p.y}`).join(" ")} fill="rgba(22,163,74,0.12)" stroke="#16a34a" strokeWidth={0.12} strokeDasharray="0.4 0.2" />
              {currentPoint && <polyline points={[...plotPoints, currentPoint].map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#16a34a" strokeWidth={0.09} strokeDasharray="0.3 0.2" />}
              {plotPoints.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r={0.3} fill={i === 0 ? "#16a34a" : "white"} stroke="#16a34a" strokeWidth={0.09} />
              ))}
              {currentPoint && <circle cx={currentPoint.x} cy={currentPoint.y} r={0.22} fill="#16a34a" opacity={0.5} />}
            </g>
          )}
        </g>

        <g pointerEvents="none">
          <rect x={14} y={14} width={128} height={22} rx={6} fill="rgba(255,255,255,0.92)" stroke="#e4e4e7" />
          <text x={24} y={28.5} fontSize={10} fill="#52525b" style={{ fontFamily: "Inter, sans-serif", fontWeight: 500 }}>
            {Math.round(viewport.zoom * 5)}% • {floor.width}'×{floor.height}'
          </text>
        </g>
      </svg>

      {currentPoint && (
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur px-2.5 py-1 rounded-md text-[11px] font-mono text-zinc-600 border border-zinc-200 shadow-sm">
          {currentPoint.x.toFixed(1)} , {currentPoint.y.toFixed(1)} {units}
          {viewport.snapToGrid ? " • snap" : ""}
          {dragging ? " • dragging" : ""}
        </div>
      )}

      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 max-w-[90%]">
        <span className="opacity-80 truncate">
          {ui.tool === "select" ? "Select • Drag selected to move, drag handles to resize/rotate, Shift+click multi, box-select empty, Del to delete" : 
           ui.tool === "room" ? "Room • Drag rectangle to create (min 6×6)" : 
           ui.tool === "wall" ? (wallStart ? "Wall • Click end point (Esc to cancel)" : "Wall • Click start point, selected wall handles to resize") : 
           ui.tool === "door" ? "Door • Click near a wall (within 2.5 ft)" : 
           ui.tool === "window" ? "Window • Click near a wall" : 
           ui.tool === "dimension" ? (dimStart ? "Dimension • Click end point" : "Dimension • Click start point") : 
           "Furniture • Click to place, drag to move, handles to resize"}
        </span>
        {ui.tool !== "select" && <button onClick={() => { ui.setTool("select"); setWallStart(null); setDimStart(null); setDragStart(null); }} className="bg-white text-zinc-900 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0">Esc → Select</button>}
      </div>

      {overlappingIds.size > 0 && (
        <div className="absolute top-[52px] left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
          <span className="w-2 h-2 bg-white rounded-full" /> {overlappingIds.size} overlapping — red lining • move apart
        </div>
      )}

      {/* cancel wall/dim */}
      {(wallStart || dimStart) && (
        <button
          onClick={() => { setWallStart(null); setDimStart(null); }}
          className="absolute top-12 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs px-3 py-1 rounded-full mt-7"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
