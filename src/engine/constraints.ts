import type { Design, Floor, Room, Wall, Door, Window } from "../types/design";
import { roomsOverlap, roomInsideFloor, isValidRoomSize, wallLength } from "./geometry";

export interface ConstraintResult {
  valid: boolean;
  message?: string;
}

export function validateRoomPlacement(room: Room, floor: Floor, otherRooms: Room[]): ConstraintResult {
  if (!isValidRoomSize(room, 6)) {
    return { valid: false, message: `Room must be at least 6 × 6 ft. Got ${room.width.toFixed(1)} × ${room.height.toFixed(1)}` };
  }
  if (!roomInsideFloor(room, floor)) {
    return { valid: false, message: "Cannot move room outside the floor boundary." };
  }
  for (const other of otherRooms) {
    if (other.id === room.id) continue;
    if (roomsOverlap(room, other)) {
      return { valid: false, message: `Room overlaps with "${other.name}".` };
    }
  }
  return { valid: true };
}

export function validateWall(wall: Wall): ConstraintResult {
  const len = wallLength(wall);
  if (len < 1) return { valid: false, message: "Wall is too short." };
  if (len > 200) return { valid: false, message: "Wall is too long." };
  return { valid: true };
}

export function validateDoor(door: Door, wall: Wall | undefined): ConstraintResult {
  if (!wall) return { valid: false, message: "Window must be attached to a wall." };
  const len = wallLength(wall);
  if (len < door.width + 0.5) return { valid: false, message: "Cannot place a door because the selected wall is too short." };
  if (door.position < 0 || door.position > 1) return { valid: false, message: "Door position must be between 0 and 1." };
  if (door.width < 2) return { valid: false, message: "Door must be at least 2 ft wide." };
  return { valid: true };
}

export function validateWindow(window: Window, wall: Wall | undefined): ConstraintResult {
  if (!wall) return { valid: false, message: "Window must be attached to a wall." };
  const len = wallLength(wall);
  if (len < window.width + 0.5) return { valid: false, message: "Cannot place a window because the selected wall is too short." };
  return { valid: true };
}

export function validateDesign(design: Design): ConstraintResult[] {
  const errors: ConstraintResult[] = [];
  for (const floor of design.floors) {
    for (let i = 0; i < floor.rooms.length; i++) {
      for (let j = i + 1; j < floor.rooms.length; j++) {
        if (roomsOverlap(floor.rooms[i], floor.rooms[j])) {
          errors.push({ valid: false, message: `Rooms "${floor.rooms[i].name}" and "${floor.rooms[j].name}" overlap.` });
        }
      }
      if (!roomInsideFloor(floor.rooms[i], floor)) {
        errors.push({ valid: false, message: `Room "${floor.rooms[i].name}" is outside boundary.` });
      }
    }
    for (const wall of floor.walls) {
      const r = validateWall(wall);
      if (!r.valid) errors.push(r);
    }
    for (const door of floor.doors) {
      const wall = floor.walls.find(w => w.id === door.wallId);
      const r = validateDoor(door, wall);
      if (!r.valid) errors.push(r);
    }
    for (const win of floor.windows) {
      const wall = floor.walls.find(w => w.id === win.wallId);
      const r = validateWindow(win, wall);
      if (!r.valid) errors.push(r);
    }
  }
  return errors;
}
