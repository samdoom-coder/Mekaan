import type { Design, Floor, Room, Wall, Window } from "../../../types/design";
import { useDesignStore } from "../../../stores/designStore";
import { validateRoomPlacement } from "../../../engine/constraints";
import { roomsOverlap } from "../../../engine/geometry";
import type { AICommand } from "./commandTypes";

// Repair engine abstraction per Phase 2 #17
export interface RepairResult {
  repaired: boolean;
  message?: string;
}

function findFloor(design: Design, floorId?: string): Floor | undefined {
  if (floorId) return design.floors.find((f) => f.id === floorId);
  return design.floors[0];
}

function genId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 7)}`;
}

// Simple repair: if resize/move causes overlap, try to shift adjacent rooms slightly
function tryRepairOverlap(floor: Floor, movedRoom: Room): RepairResult {
  // naive: try moving colliding neighbors by 1 ft in 4 directions
  const others = floor.rooms.filter((r) => r.id !== movedRoom.id && roomsOverlap(movedRoom, r));
  if (others.length === 0) return { repaired: true };
  // if single overlap and we can nudge neighbor, attempt
  if (others.length === 1) {
    const other = others[0];
    const dirs = [
      { dx: movedRoom.width + 0.5, dy: 0 }, // right
      { dx: -(other.width + 0.5), dy: 0 }, // left
      { dx: 0, dy: movedRoom.height + 0.5 }, // down
      { dx: 0, dy: -(other.height + 0.5) }, // up
    ];
    for (const d of dirs) {
      const test = { ...other, x: other.x + d.dx, y: other.y + d.dy };
      // check inside floor and not overlapping others
      const othersWithout = floor.rooms.filter((r) => r.id !== other.id && r.id !== movedRoom.id);
      const res = validateRoomPlacement(test, floor, othersWithout.concat(movedRoom));
      if (res.valid) {
        // apply
        const idx = floor.rooms.findIndex((r) => r.id === other.id);
        floor.rooms[idx] = test;
        return { repaired: true, message: `Shifted ${other.name} to avoid overlap` };
      }
    }
  }
  return { repaired: false, message: `Overlap with ${others.map((r) => r.name).join(", ")}` };
}

export interface ExecutorResult {
  success: boolean;
  message?: string;
  error?: string;
}

export function executeCommand(cmd: AICommand, floorId?: string): ExecutorResult {
  const store = useDesignStore.getState();
  const design = store.design;
  if (!design) return { success: false, error: "No design loaded" };
  const floor = findFloor(design, floorId);
  if (!floor) return { success: false, error: "Floor not found" };
  const fid = floor.id;

  const p = cmd.parameters as Record<string, unknown>;

  switch (cmd.type) {
    case "CREATE_ROOM": {
      const roomType = (p.roomType as string) || (p.room_type as string) || (p.type as string) || "other";
      const name = (p.name as string) || roomType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      let w = (p.width as number) ?? 10;
      let h = (p.height as number) ?? 10;
      if (w < 6) w = 10;
      if (h < 6) h = 10;
      let x = p.x as number | undefined;
      let y = p.y as number | undefined;
      const nearId = (p.nearRoomId as string) || (p.near_room_id as string) || (p.near as string);

      if (x == null || y == null) {
        if (nearId) {
          const ref = floor.rooms.find((r) => r.id === nearId);
          if (ref) {
            // try to place to the right, then below, then left, etc.
            const candidates = [
              { x: ref.x + ref.width + 1, y: ref.y },
              { x: ref.x, y: ref.y + ref.height + 1 },
              { x: ref.x - w - 1, y: ref.y },
              { x: ref.x, y: ref.y - h - 1 },
              { x: ref.x + ref.width + 1, y: ref.y + ref.height + 1 },
            ];
            let placed = false;
            for (const cand of candidates) {
              const test: Room = { id: "tmp", name, type: roomType as Room["type"], x: cand.x, y: cand.y, width: w, height: h, rotation: 0, properties: {} };
              const res = validateRoomPlacement(test, floor, floor.rooms);
              if (res.valid) {
                x = cand.x;
                y = cand.y;
                placed = true;
                break;
              }
            }
            if (!placed) {
              // fallback: clamp to floor
              x = Math.min(ref.x + ref.width + 1, floor.width - w - 1);
              y = ref.y;
            }
          } else {
            x = 1;
            y = 1;
          }
        } else {
          // find empty spot: scan grid
          x = 1;
          y = 1;
          let found = false;
          for (let ty = 1; ty + h < floor.height && !found; ty += 2) {
            for (let tx = 1; tx + w < floor.width && !found; tx += 2) {
              const test: Room = { id: "tmp", name, type: roomType as Room["type"], x: tx, y: ty, width: w, height: h, rotation: 0, properties: {} };
              if (validateRoomPlacement(test, floor, floor.rooms).valid) {
                x = tx;
                y = ty;
                found = true;
              }
            }
          }
        }
      }
      const room: Room = { id: genId("room"), name, type: roomType as Room["type"], x: x!, y: y!, width: w, height: h, rotation: 0, properties: {} };
      const res = store.createRoom(fid, room);
      if (!res.success) {
        // try repair: if overlap, try alternative position
        // we already tried candidates; if still fails, return error
        return { success: false, error: res.error };
      }
      return { success: true, message: `Created ${name}` };
    }

    case "DELETE_ROOM": {
      const roomId = (p.roomId as string) || (p.room_id as string);
      const exists = floor.rooms.find((r) => r.id === roomId);
      if (!exists) return { success: false, error: `Room ${roomId} not found` };
      store.deleteRoom(fid, roomId);
      return { success: true, message: `Deleted ${exists.name}` };
    }

    case "MOVE_ROOM": {
      const roomId = (p.roomId as string) || (p.room_id as string);
      const room = floor.rooms.find((r) => r.id === roomId);
      if (!room) return { success: false, error: `Room ${roomId} not found` };
      let nx = room.x;
      let ny = room.y;
      if (typeof p.x === "number") nx = p.x as number;
      if (typeof p.y === "number") ny = p.y as number;
      if (typeof p.dx === "number") nx += p.dx as number;
      if (typeof p.dy === "number") ny += p.dy as number;
      const pos = p.position as string | undefined;
      if (pos) {
        // handle "rear_right" etc and "near:roomId"
        if (pos.startsWith("near:")) {
          const targetId = pos.slice(5);
          const target = floor.rooms.find((r) => r.id === targetId);
          if (target) {
            nx = target.x + target.width + 1;
            ny = target.y;
          }
        } else {
          const map: Record<string, { x: number; y: number }> = {
            rear_right: { x: floor.width - room.width - 1, y: floor.height - room.height - 1 },
            rear_left: { x: 1, y: floor.height - room.height - 1 },
            front_right: { x: floor.width - room.width - 1, y: 1 },
            front_left: { x: 1, y: 1 },
            rear: { x: room.x, y: floor.height - room.height - 1 },
            front: { x: room.x, y: 1 },
            right: { x: floor.width - room.width - 1, y: room.y },
            left: { x: 1, y: room.y },
          };
          if (map[pos]) {
            nx = map[pos].x;
            ny = map[pos].y;
          }
        }
      }
      // also handle nearRoomId
      const nearId = (p.nearRoomId as string) || (p.near_room_id as string);
      if (nearId && p.x == null && p.y == null && !pos) {
        const target = floor.rooms.find((r) => r.id === nearId);
        if (target) {
          nx = target.x + target.width + 1;
          ny = target.y;
        }
      }

      // validate first
      const test = { ...room, x: nx, y: ny };
      const check = validateRoomPlacement(test, floor, floor.rooms.filter((r) => r.id !== roomId));
      if (!check.valid) {
        // try repair per Phase 2 #17
        const cloneFloor: Floor = JSON.parse(JSON.stringify(floor));
        const idx = cloneFloor.rooms.findIndex((r) => r.id === roomId);
        cloneFloor.rooms[idx] = test;
        const repair = tryRepairOverlap(cloneFloor, test);
        if (repair.repaired) {
          // apply repaired floor rooms via updates (simpler: move room then move neighbor)
          // we need to actually update store's other room
          const movedOther = cloneFloor.rooms.find((r) => r.id !== roomId && JSON.stringify(r) !== JSON.stringify(floor.rooms.find((o) => o.id === r.id)));
          if (movedOther) {
            store.updateRoom(fid, movedOther.id, { x: movedOther.x, y: movedOther.y });
          }
          const res = store.moveRoom(fid, roomId, nx, ny);
          if (res.success) return { success: true, message: `Moved ${room.name}${repair.message ? `, ${repair.message}` : ""}` };
          return { success: false, error: res.error };
        }
        return { success: false, error: check.message };
      }

      const res = store.moveRoom(fid, roomId, nx, ny);
      return res.success ? { success: true, message: `Moved ${room.name}` } : { success: false, error: res.error };
    }

    case "RESIZE_ROOM": {
      const roomId = (p.roomId as string) || (p.room_id as string);
      const room = floor.rooms.find((r) => r.id === roomId);
      if (!room) return { success: false, error: `Room ${roomId} not found` };
      let nw = room.width;
      let nh = room.height;
      if (typeof p.width === "number") nw = p.width as number;
      if (typeof p.height === "number") nh = p.height as number;
      if (typeof p.w === "number") nw = p.w as number;
      if (typeof p.h === "number") nh = p.h as number;
      if (typeof p.widthDelta === "number") nw += p.widthDelta as number;
      if (typeof p.heightDelta === "number") nh += p.heightDelta as number;
      if (typeof p.width_delta === "number") nw += p.width_delta as number;
      if (typeof p.height_delta === "number") nh += p.height_delta as number;
      // handle string numbers?
      nw = Number(nw);
      nh = Number(nh);
      if (isNaN(nw) || isNaN(nh)) return { success: false, error: "Invalid dimensions" };
      // enforce min
      if (nw < 6 || nh < 6) return { success: false, error: `Room must be at least 6 × 6 ft. Got ${nw.toFixed(1)} × ${nh.toFixed(1)}` };

      const test = { ...room, width: nw, height: nh };
      const check = validateRoomPlacement(test, floor, floor.rooms.filter((r) => r.id !== roomId));
      if (!check.valid) {
        // Try repair: shift neighbors
        const cloneFloor: Floor = JSON.parse(JSON.stringify(floor));
        const idx = cloneFloor.rooms.findIndex((r) => r.id === roomId);
        cloneFloor.rooms[idx] = test;
        const repair = tryRepairOverlap(cloneFloor, test);
        if (repair.repaired) {
          const movedOther = cloneFloor.rooms.find((r) => r.id !== roomId && JSON.stringify(r) !== JSON.stringify(floor.rooms.find((o) => o.id === r.id)));
          if (movedOther) {
            store.updateRoom(fid, movedOther.id, { x: movedOther.x, y: movedOther.y });
          }
          const res = store.resizeRoom(fid, roomId, nw, nh);
          if (res.success) return { success: true, message: `Resized ${room.name} to ${nw}×${nh} ft${repair.message ? `, ${repair.message}` : ""}` };
          return { success: false, error: res.error };
        }
        return { success: false, error: check.message || `Cannot resize ${room.name} to ${nw}×${nh} ft - would overlap` };
      }

      const res = store.resizeRoom(fid, roomId, nw, nh);
      return res.success ? { success: true, message: `Resized ${room.name} to ${nw}×${nh} ft` } : { success: false, error: res.error };
    }

    case "CREATE_WALL": {
      const start = p.start as { x: number; y: number } | undefined;
      const end = p.end as { x: number; y: number } | undefined;
      if (!start || !end) return { success: false, error: "CREATE_WALL needs start and end" };
      const wall = {
        id: genId("wall"),
        start: { x: Number(start.x), y: Number(start.y) },
        end: { x: Number(end.x), y: Number(end.y) },
        thickness: (p.thickness as number) ?? 0.5,
        height: (p.height as number) ?? 9,
        type: (p.type as Wall["type"]) || "interior",
      } as Floor["walls"][number];
      const res = store.createWall(fid, wall);
      return res.success ? { success: true, message: "Created wall" } : { success: false, error: res.error };
    }

    case "DELETE_WALL": {
      const wallId = (p.wallId as string) || (p.wall_id as string);
      if (!wallId) return { success: false, error: "Missing wallId" };
      if (!floor.walls.find((w) => w.id === wallId)) return { success: false, error: `Wall ${wallId} not found` };
      store.deleteWall(fid, wallId);
      return { success: true, message: "Deleted wall" };
    }

    case "CREATE_DOOR": {
      const wallId = (p.wallId as string) || (p.wall_id as string);
      if (!wallId) return { success: false, error: "Missing wallId" };
      if (!floor.walls.find((w) => w.id === wallId)) return { success: false, error: `Wall ${wallId} not found` };
      const door = {
        id: genId("door"),
        wallId,
        position: (p.position as number) ?? 0.5,
        width: (p.width as number) ?? 3,
        swingDirection: (p.swingDirection as "left" | "right") || "right",
      } as Floor["doors"][number];
      const res = store.createDoor(fid, door);
      return res.success ? { success: true, message: "Created door" } : { success: false, error: res.error || "Failed to create door" };
    }

    case "DELETE_DOOR": {
      const doorId = (p.doorId as string) || (p.door_id as string) || (p.id as string);
      if (!doorId) return { success: false, error: "Missing doorId" };
      if (!floor.doors.find((d) => d.id === doorId)) return { success: false, error: `Door ${doorId} not found` };
      store.deleteDoor(fid, doorId);
      return { success: true, message: "Deleted door" };
    }

    case "CREATE_WINDOW": {
      let wallId = (p.wallId as string) || (p.wall_id as string);
      const roomId = (p.roomId as string) || (p.room_id as string);
      // if roomId provided, find appropriate wall near that room
      if (!wallId && roomId) {
        const room = floor.rooms.find((r) => r.id === roomId);
        if (room) {
          // find closest wall segment near room - naive: pick exterior wall closest to room center
          const cx = room.x + room.width / 2;
          const cy = room.y + room.height / 2;
          let best: Floor["walls"][number] | null = null;
          let bestDist = Infinity;
          for (const w of floor.walls) {
            const mx = (w.start.x + w.end.x) / 2;
            const my = (w.start.y + w.end.y) / 2;
            const d = Math.hypot(mx - cx, my - cy);
            if (d < bestDist) {
              bestDist = d;
              best = w;
            }
          }
          // if wall found and near room, use it, else try to find wall that is exterior
          if (best) wallId = best.id;
          // fallback: create a wall for room if none? For now error
          if (!wallId) {
            // try to use any wall
            if (floor.walls.length) wallId = floor.walls[0].id;
          }
        }
      }
      if (!wallId && floor.walls.length) wallId = floor.walls[0].id;
      if (!wallId) return { success: false, error: "No wall found to attach window" };
      if (!floor.walls.find((w) => w.id === wallId)) return { success: false, error: `Wall ${wallId} not found` };
      const win = {
        id: genId("win"),
        wallId,
        position: (p.position as number) ?? 0.5,
        width: (p.width as number) ?? 4,
        height: (p.height as number) ?? 4,
        type: (p.type as Window["type"]) || "casement",
      } as Floor["windows"][number];
      const res = store.createWindow(fid, win);
      return res.success ? { success: true, message: "Created window" } : { success: false, error: res.error || "Failed to create window" };
    }

    case "DELETE_WINDOW": {
      const winId = (p.windowId as string) || (p.window_id as string) || (p.id as string);
      if (!winId) return { success: false, error: "Missing windowId" };
      if (!floor.windows.find((w) => w.id === winId)) return { success: false, error: `Window ${winId} not found` };
      store.deleteWindow(fid, winId);
      return { success: true, message: "Deleted window" };
    }

    case "MOVE_OBJECT": {
      const objectId = (p.objectId as string) || (p.object_id as string) || (p.id as string);
      if (!objectId) return { success: false, error: "Missing objectId" };
      const obj = floor.objects.find((o) => o.id === objectId);
      if (!obj) return { success: false, error: `Object ${objectId} not found` };
      let nx = obj.x;
      let ny = obj.y;
      if (typeof p.x === "number") nx = p.x as number;
      if (typeof p.y === "number") ny = p.y as number;
      if (typeof p.dx === "number") nx += p.dx as number;
      if (typeof p.dy === "number") ny += p.dy as number;
      store.updateObject(fid, objectId, { x: nx, y: ny });
      return { success: true, message: `Moved ${obj.type}` };
    }

    case "RESIZE_OBJECT": {
      const objectId = (p.objectId as string) || (p.object_id as string) || (p.id as string);
      if (!objectId) return { success: false, error: "Missing objectId" };
      const obj = floor.objects.find((o) => o.id === objectId);
      if (!obj) return { success: false, error: `Object ${objectId} not found` };
      const nw = typeof p.width === "number" ? (p.width as number) : obj.width;
      const nh = typeof p.height === "number" ? (p.height as number) : obj.height;
      store.updateObject(fid, objectId, { width: nw, height: nh });
      return { success: true, message: `Resized ${obj.type}` };
    }

    default:
      return { success: false, error: `Unknown command ${cmd.type}` };
  }
}

// Execute multiple commands sequentially per Phase 2 #6
export function executeCommands(commands: AICommand[], floorId?: string): { results: ExecutorResult[]; successCount: number; failedCount: number } {
  const results: ExecutorResult[] = [];
  let successCount = 0;
  let failedCount = 0;
  for (const cmd of commands) {
    const r = executeCommand(cmd, floorId);
    results.push(r);
    if (r.success) successCount++;
    else {
      failedCount++;
      // continue per spec - don't stop on failure, but could break if destructive chain
    }
  }
  return { results, successCount, failedCount };
}
