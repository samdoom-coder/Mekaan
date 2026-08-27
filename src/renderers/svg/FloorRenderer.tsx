import type { Floor, Room, Wall, Door, Window as Win, DesignObject, Dimension } from "../../types/design";
import { pointOnWall, wallAngle, wallLength, wallPolygon, roomsOverlap } from "../../engine/geometry";
import { getFloorPolygon, getFloorBounds } from "../../utils/floorShape";
import { formatDistance } from "../../engine/measurement";
import { ROOM_TYPE_COLORS } from "../../utils/demoData";

interface Props {
  floor: Floor;
  units: string;
  selectedIds: Set<string>;
  hoverId?: string | null;
  onSelect: (id: string, type: string, e: React.MouseEvent) => void;
}

function RoomItem({ room, selected, hovered, overlapping, onSelect, units }: { room: Room; selected: boolean; hovered: boolean; overlapping: boolean; onSelect: any; units: string }) {
  const baseFill = ROOM_TYPE_COLORS[room.type] || "#f5f5f5";
  const fill = overlapping ? "#fee2e2" : selected ? "#dbeafe" : hovered ? "#eef2ff" : baseFill;
  const stroke = overlapping ? "#ef4444" : selected ? "#2563eb" : "#1a1a1a";
  const strokeW = overlapping ? 0.22 : selected ? 0.18 : 0.12;
  return (
    <g
      data-selectable
      data-id={room.id}
      data-type="room"
      onClick={(e) => onSelect(room.id, "room", e)}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={room.x}
        y={room.y}
        width={room.width}
        height={room.height}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeW}
        strokeDasharray={overlapping ? "0.4 0.18" : room.type === "hall" ? "0.6 0.4" : undefined}
        transform={room.rotation ? `rotate(${room.rotation} ${room.x + room.width / 2} ${room.y + room.height / 2})` : undefined}
        rx={0.15}
      />
      {overlapping && (
        <rect
          x={room.x - 0.08}
          y={room.y - 0.08}
          width={room.width + 0.16}
          height={room.height + 0.16}
          fill="none"
          stroke="#ef4444"
          strokeWidth={0.1}
          strokeDasharray="0.25 0.2"
          rx={0.2}
          style={{ pointerEvents: "none" }}
          transform={room.rotation ? `rotate(${room.rotation} ${room.x + room.width / 2} ${room.y + room.height / 2})` : undefined}
        />
      )}
      <text
        x={room.x + room.width / 2}
        y={room.y + room.height / 2 - 0.35}
        textAnchor="middle"
        fontSize={0.9}
        fontWeight={600}
        fill="#1a1a1a"
        style={{ pointerEvents: "none", fontFamily: "Inter, sans-serif", letterSpacing: "0.02em" }}
        transform={room.rotation ? `rotate(${room.rotation} ${room.x + room.width / 2} ${room.y + room.height / 2})` : undefined}
      >
        {room.name.toUpperCase()}
      </text>
      <text
        x={room.x + room.width / 2}
        y={room.y + room.height / 2 + 0.55}
        textAnchor="middle"
        fontSize={0.55}
        fill="#52525b"
        style={{ pointerEvents: "none" }}
        transform={room.rotation ? `rotate(${room.rotation} ${room.x + room.width / 2} ${room.y + room.height / 2})` : undefined}
      >
        {formatDistance(room.width, units as any)} × {formatDistance(room.height, units as any)}
      </text>
      {selected && (
        <g transform={room.rotation ? `rotate(${room.rotation} ${room.x + room.width / 2} ${room.y + room.height / 2})` : undefined}>
          {[
            { x: room.x, y: room.y, h: "nw", cur: "nwse-resize" },
            { x: room.x + room.width, y: room.y, h: "ne", cur: "nesw-resize" },
            { x: room.x + room.width, y: room.y + room.height, h: "se", cur: "nwse-resize" },
            { x: room.x, y: room.y + room.height, h: "sw", cur: "nesw-resize" },
          ].map((pt) => (
            <rect
              key={pt.h}
              data-handle={pt.h}
              data-id={room.id}
              data-type="room"
              x={pt.x - 0.25}
              y={pt.y - 0.25}
              width={0.5}
              height={0.5}
              fill="white"
              stroke="#2563eb"
              strokeWidth={0.08}
              style={{ cursor: pt.cur }}
            />
          ))}
          {/* edge handles for width/height */}
          {[
            { x: room.x + room.width / 2, y: room.y, h: "n", cur: "ns-resize" },
            { x: room.x + room.width / 2, y: room.y + room.height, h: "s", cur: "ns-resize" },
            { x: room.x, y: room.y + room.height / 2, h: "w", cur: "ew-resize" },
            { x: room.x + room.width, y: room.y + room.height / 2, h: "e", cur: "ew-resize" },
          ].map((pt) => (
            <rect
              key={pt.h}
              data-handle={pt.h}
              data-id={room.id}
              data-type="room"
              x={pt.x - 0.22}
              y={pt.y - 0.22}
              width={0.44}
              height={0.44}
              fill="white"
              stroke="#2563eb"
              strokeWidth={0.07}
              style={{ cursor: pt.cur }}
            />
          ))}
          <circle data-handle="rotate" data-id={room.id} data-type="room" cx={room.x + room.width / 2} cy={room.y - 0.9} r={0.28} fill="white" stroke="#2563eb" strokeWidth={0.08} style={{ cursor: "grab" }} />
          <line x1={room.x + room.width / 2} y1={room.y} x2={room.x + room.width / 2} y2={room.y - 0.9} stroke="#2563eb" strokeWidth={0.08} style={{ pointerEvents: "none" }} />
        </g>
      )}
    </g>
  );
}

function WallItem({ wall, selected, onSelect }: { wall: Wall; selected: boolean; onSelect: any }) {
  const poly = wallPolygon(wall);
  const d = `M ${poly.map(p => `${p.x} ${p.y}`).join(" L ")} Z`;
  return (
    <g data-selectable data-id={wall.id} data-type="wall" onClick={(e) => onSelect(wall.id, "wall", e)} style={{ cursor: "pointer" }}>
      <path d={d} fill={selected ? "#2563eb" : "#1a1a1a"} stroke={selected ? "#1d4ed8" : "#0a0a0a"} strokeWidth={0.04} opacity={0.92} />
      <line x1={wall.start.x} y1={wall.start.y} x2={wall.end.x} y2={wall.end.y} stroke="white" strokeWidth={0.02} opacity={0.15} style={{ pointerEvents: "none" }} />
      {selected && (
        <>
          <circle data-handle="start" data-id={wall.id} data-type="wall" cx={wall.start.x} cy={wall.start.y} r={0.32} fill="white" stroke="#2563eb" strokeWidth={0.1} style={{ cursor: "move" }} />
          <circle data-handle="end" data-id={wall.id} data-type="wall" cx={wall.end.x} cy={wall.end.y} r={0.32} fill="white" stroke="#2563eb" strokeWidth={0.1} style={{ cursor: "move" }} />
        </>
      )}
    </g>
  );
}

function DoorItem({ door, wall, selected, onSelect }: { door: Door; wall?: Wall; selected: boolean; onSelect: any }) {
  if (!wall) return null;
  const pos = pointOnWall(wall, door.position);
  const angle = wallAngle(wall);
  const doorHalf = door.width / 2;
  const perpAngle = angle + Math.PI / 2;
  const swing = door.swingDirection === "right" ? 1 : -1;
  const leafLen = door.width;
  const leafX = pos.x + Math.cos(perpAngle) * leafLen * swing;
  const leafY = pos.y + Math.sin(perpAngle) * leafLen * swing;
  const alongX = Math.cos(angle);
  const alongY = Math.sin(angle);
  const startX = pos.x - alongX * doorHalf;
  const startY = pos.y - alongY * doorHalf;
  const endX = pos.x + alongX * doorHalf;
  const endY = pos.y + alongY * doorHalf;

  return (
    <g data-selectable data-id={door.id} data-type="door" onMouseDown={e=>e.stopPropagation()} onClick={(e) => onSelect(door.id, "door", e)} style={{ cursor: "pointer" }}>
      <line x1={startX} y1={startY} x2={endX} y2={endY} stroke="#fdfbf7" strokeWidth={wall.thickness + 0.02} />
      <line x1={pos.x} y1={pos.y} x2={leafX} y2={leafY} stroke={selected ? "#2563eb" : "#1a1a1a"} strokeWidth={0.12} />
      <path
        d={`M ${leafX} ${leafY} A ${leafLen} ${leafLen} 0 0 ${swing > 0 ? 0 : 1} ${endX} ${endY}`}
        fill="none"
        stroke={selected ? "#2563eb" : "#1a1a1a"}
        strokeWidth={0.06}
        strokeDasharray="0.25 0.18"
      />
      <circle cx={pos.x} cy={pos.y} r={0.12} fill={selected ? "#2563eb" : "#1a1a1a"} />
    </g>
  );
}

function WindowItem({ win, wall, selected, onSelect }: { win: Win; wall?: Wall; selected: boolean; onSelect: any }) {
  if (!wall) return null;
  const pos = pointOnWall(wall, win.position);
  const angle = wallAngle(wall);
  const wHalf = win.width / 2;
  const alongX = Math.cos(angle);
  const alongY = Math.sin(angle);
  const perpX = -Math.sin(angle);
  const perpY = Math.cos(angle);
  const startX = pos.x - alongX * wHalf;
  const startY = pos.y - alongY * wHalf;
  const endX = pos.x + alongX * wHalf;
  const endY = pos.y + alongY * wHalf;
  const thick = wall.thickness;
  const p1 = { x: startX + perpX * thick * 0.45, y: startY + perpY * thick * 0.45 };
  const p2 = { x: endX + perpX * thick * 0.45, y: endY + perpY * thick * 0.45 };
  const p3 = { x: endX - perpX * thick * 0.45, y: endY - perpY * thick * 0.45 };
  const p4 = { x: startX - perpX * thick * 0.45, y: startY - perpY * thick * 0.45 };
  return (
    <g data-selectable data-id={win.id} data-type="window" onMouseDown={e=>e.stopPropagation()} onClick={(e) => onSelect(win.id, "window", e)} style={{ cursor: "pointer" }}>
      <polygon points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`} fill={selected ? "#dbeafe" : "white"} stroke={selected ? "#2563eb" : "#1a1a1a"} strokeWidth={0.06} />
      <line x1={startX} y1={startY} x2={endX} y2={endY} stroke="#1a1a1a" strokeWidth={0.04} />
    </g>
  );
}

function FurnitureItem({ obj, selected, onSelect }: { obj: DesignObject; selected: boolean; onSelect: any }) {
  return (
    <g
      data-selectable
      data-id={obj.id}
      data-type="object"
      onClick={(e) => onSelect(obj.id, "object", e)}
      transform={`translate(${obj.x} ${obj.y}) rotate(${obj.rotation} ${obj.width / 2} ${obj.height / 2})`}
      style={{ cursor: "move" }}
    >
      <rect width={obj.width} height={obj.height} rx={0.2} fill="white" stroke={selected ? "#2563eb" : "#52525b"} strokeWidth={0.08} strokeDasharray="0.3 0.2" />
      <text x={obj.width / 2} y={obj.height / 2 + 0.18} textAnchor="middle" fontSize={0.5} fill="#52525b" style={{ pointerEvents: "none", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {obj.type.replace("-", " ")}
      </text>
      {selected && (
        <g>
          <rect x={-0.18} y={-0.18} width={obj.width + 0.36} height={obj.height + 0.36} fill="none" stroke="#2563eb" strokeWidth={0.08} strokeDasharray="0.25 0.2" style={{ pointerEvents: "none" }} />
          {[
            { x: 0, y: 0, h: "nw" },
            { x: obj.width, y: 0, h: "ne" },
            { x: obj.width, y: obj.height, h: "se" },
            { x: 0, y: obj.height, h: "sw" },
          ].map((pt) => (
            <rect key={pt.h} data-handle={pt.h} data-id={obj.id} data-type="object" x={pt.x - 0.22} y={pt.y - 0.22} width={0.44} height={0.44} fill="white" stroke="#2563eb" strokeWidth={0.07} style={{ cursor: "nwse-resize" }} />
          ))}
        </g>
      )}
    </g>
  );
}

function DimensionItem({ dim, units }: { dim: Dimension; units: string }) {
  const dx = dim.end.x - dim.start.x;
  const dy = dim.end.y - dim.start.y;
  const len = Math.hypot(dx, dy);
  const midX = (dim.start.x + dim.end.x) / 2;
  const midY = (dim.start.y + dim.end.y) / 2;
  const angle = Math.atan2(dy, dx);
  const off = dim.offset ?? 0.6;
  const perpX = -Math.sin(angle) * off;
  const perpY = Math.cos(angle) * off;
  const sx = dim.start.x + perpX;
  const sy = dim.start.y + perpY;
  const ex = dim.end.x + perpX;
  const ey = dim.end.y + perpY;
  return (
    <g data-selectable data-id={dim.id} data-type="dimension" style={{ pointerEvents: "none" }}>
      <line x1={dim.start.x} y1={dim.start.y} x2={sx} y2={sy} stroke="#52525b" strokeWidth={0.03} strokeDasharray="0.15 0.15" />
      <line x1={dim.end.x} y1={dim.end.y} x2={ex} y2={ey} stroke="#52525b" strokeWidth={0.03} strokeDasharray="0.15 0.15" />
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#1a1a1a" strokeWidth={0.05} />
      <polygon points={`${sx},${sy} ${sx - Math.cos(angle - 0.45) * 0.35},${sy - Math.sin(angle - 0.45) * 0.35} ${sx - Math.cos(angle + 0.45) * 0.35},${sy - Math.sin(angle + 0.45) * 0.35}`} fill="#1a1a1a" />
      <polygon points={`${ex},${ey} ${ex + Math.cos(angle - 0.45) * 0.35},${ey + Math.sin(angle - 0.45) * 0.35} ${ex + Math.cos(angle + 0.45) * 0.35},${ey + Math.sin(angle + 0.45) * 0.35}`} fill="#1a1a1a" />
      <text
        x={midX + perpX}
        y={midY + perpY - 0.25}
        textAnchor="middle"
        fontSize={0.52}
        fill="#1a1a1a"
        style={{ fontFamily: "JetBrains Mono, monospace", background: "white" }}
      >
        {formatDistance(len, units as any)}
      </text>
    </g>
  );
}

export default function FloorRenderer({ floor, units, selectedIds, hoverId, onSelect }: Props) {
  // compute overlapping rooms for red lining
  const overlappingIds = new Set<string>();
  for (let i = 0; i < floor.rooms.length; i++) {
    for (let j = i + 1; j < floor.rooms.length; j++) {
      if (roomsOverlap(floor.rooms[i], floor.rooms[j])) {
        overlappingIds.add(floor.rooms[i].id);
        overlappingIds.add(floor.rooms[j].id);
      }
    }
  }
  const poly = getFloorPolygon(floor);
  const bounds = getFloorBounds(floor);
  const polyPoints = poly.map(p => `${p.x},${p.y}`).join(" ");
  const isCustom = floor.plotShape && floor.plotShape.type !== "rectangle";
  return (
    <g>
      <polygon id="plot-bg" data-bg="true" points={polyPoints} fill="#ffffff" stroke={overlappingIds.size ? "#ef4444" : "#16a34a"} strokeWidth={overlappingIds.size ? 1.2 : 0.9} vectorEffect="non-scaling-stroke" strokeDasharray={overlappingIds.size ? "6 4" : "8 5"} strokeLinejoin="round" />
      <rect x={bounds.minX} y={bounds.minY - 1.2} width={bounds.maxX - bounds.minX} height={0.9} fill="#f0fdf4" stroke="#bbf7d0" strokeWidth={0.6} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} rx={0.12} />
      <text x={(bounds.minX + bounds.maxX) / 2} y={bounds.minY - 0.55} textAnchor="middle" fontSize={0.45} fill={overlappingIds.size ? "#ef4444" : "#15803d"} style={{ letterSpacing: "0.08em", pointerEvents: "none", fontWeight: 600 }}>
        PLOT {floor.width}' × {floor.height}' • {floor.name.toUpperCase()} {isCustom ? `• ${floor.plotShape?.type.toUpperCase()}` : ""} {overlappingIds.size ? `• ⚠ ${overlappingIds.size} OVERLAPPING` : ""}
      </text>

      {floor.rooms.map((r) => (
        <RoomItem key={r.id} room={r} selected={selectedIds.has(r.id)} hovered={hoverId === r.id} overlapping={overlappingIds.has(r.id)} onSelect={onSelect} units={units} />
      ))}

      {floor.walls.map((w) => (
        <WallItem key={w.id} wall={w} selected={selectedIds.has(w.id)} onSelect={onSelect} />
      ))}

      {floor.doors.map((d) => {
        const wall = floor.walls.find((w) => w.id === d.wallId);
        return <DoorItem key={d.id} door={d} wall={wall} selected={selectedIds.has(d.id)} onSelect={onSelect} />;
      })}
      {floor.windows.map((w) => {
        const wall = floor.walls.find((wa) => wa.id === w.wallId);
        return <WindowItem key={w.id} win={w} wall={wall} selected={selectedIds.has(w.id)} onSelect={onSelect} />;
      })}

      {floor.objects.map((o) => (
        <FurnitureItem key={o.id} obj={o} selected={selectedIds.has(o.id)} onSelect={onSelect} />
      ))}

      {floor.dimensions.map((d) => (
        <DimensionItem key={d.id} dim={d} units={units} />
      ))}

      {floor.annotations.map((a) => (
        <text key={a.id} x={a.position.x} y={a.position.y} fontSize={0.6} fill="#52525b" style={{ pointerEvents: "none" }}>
          {a.text}
        </text>
      ))}
    </g>
  );
}
