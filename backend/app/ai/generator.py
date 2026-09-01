import json
import os
import uuid
import random
from typing import Dict, Any, List, Optional, Tuple

from .provider import get_provider

# Generation system prompt - AI brain to fill plot with architecturally relevant plans
GENERATE_SYSTEM_PROMPT = """You are an expert residential architect with 20 years experience in Indian Vastu, circulation, and space efficiency. Generate floor plan layouts that are livable, not random.

You will receive:
- Plot dimensions (width × depth in feet)
- Plot shape (rectangle, square, L, U, T, polygon, or "ai" meaning you choose)
- Required rooms with counts (e example: 3 bedrooms incl 1 master, 2 bathrooms, 1 kitchen, 1 living, 1 dining)
- Units (feet)
- Preferences (optional: "east facing, open kitchen, big balcony, attached toilets")

STRICT ARCHITECTURAL RULES:
- Living Room: front side (y 0-30% depth), near entrance, 16×14 ft, with good light, adjacent to dining
- Dining: near living AND kitchen (within 10 ft), 12×12
- Kitchen: near dining (share wall or adjacent), ventilated, 10×12. If preference says open kitchen, merge visually but keep separate.
- Master Bedroom: quiet rear zone (y >55% depth), largest, 14×14, attached bathroom mandatory, balcony preferred south/east
- Other bedrooms: rear/side, 12×12, at least one attached bathroom
- Bathrooms/Toilets: attached to bedrooms (share wall), not isolated in center; 6×8 or 5×6, ventilated
- Balcony: attached to bedroom or living, 6×8, outward facing
- Garage: front road side (y 0-15%), 12×20, near entrance, not in rear
- Study: quiet corner near bedrooms, 10×10
- Corridor/Hall: 4-6 ft wide, connect front to rear, don't waste area
- Fill 70-85% of plot, leave 3-4 ft circulation, no dead space, no overlap, all rooms fully inside boundary
- Sizes realistic: living 16×14, master 14×14, bedroom 12×12, kitchen 10×12, dining 12×12, bathroom 6×8, toilet 5×6, balcony 6×8, garage 12×20, study 10×10, store 6×6
- If shape is L/U/T, stay strictly inside polygon (all corners inside).

You must produce 3-4 DISTINCT but EACH relevant options:
- Option 1 Linear Zoned: public front (living/dining), service middle (kitchen), private rear (bedrooms) – best Vastu
- Option 2 L-Shaped Courtyard: rooms wrap around central open/balcony, good for 40×60
- Option 3 Compact Efficient: minimal corridor, rooms share walls, maximize area
- Option 4 (if 4 requested): Open Plan – living/dining/kitchen as one large zone front, bedrooms stacked rear

EXAMPLE for 40×60 rectangle, 3BHK 2Bath:
Option 1 would place: Living (1,1,18,16) front, Dining (19,1,11,12) front-right, Kitchen (31,1,8,12) front-right near dining, Master (1,18,14,14) rear-left with Bath (15,18,6,7) attached, Bedroom2 (22,18,9,12) rear-center, Bedroom3 (32,18,7,12) rear-right, Bathroom2 (15,26,6,6) near Bedroom2/3.

Return JSON ONLY:
{
  "options": [
    {
      "name": "Option 1: Linear Zoned – Public front, private rear",
      "description": "Vastu-compliant, dining between living and kitchen, master rear with attached bath",
      "plotShape": {"type": "rectangle"},
      "rooms": [
        {"name":"Living Room","type":"living-room","x":1,"y":1,"width":18,"height":16},
        {"name":"Dining","type":"dining-room","x":20,"y":1,"width":11,"height":12}
      ]
    }
  ]
}

Rules:
- x,y top-left in feet, origin (0,0) top-left, +x right, +y down
- width/height in feet
- type must be exactly: living-room, bedroom, master-bedroom, kitchen, dining-room, bathroom, toilet, study, balcony, garage, utility, store, hall, other
- Ensure x+width <= plot width and y+height <= plot depth (or inside polygon)
- No overlap, use integer coordinates for simplicity
- Generate exactly requested count
"""

ROOM_DEFAULTS: Dict[str, Tuple[float, float]] = {
    "living-room": (16, 14),
    "bedroom": (12, 12),
    "master-bedroom": (14, 14),
    "kitchen": (10, 12),
    "dining-room": (12, 12),
    "bathroom": (6, 8),
    "toilet": (5, 6),
    "study": (10, 10),
    "balcony": (6, 8),
    "garage": (12, 20),
    "utility": (6, 6),
    "store": (6, 6),
    "hall": (8, 4),
    "other": (10, 10),
}

def _get_shape_polygon(shape: Optional[Dict[str, Any]], w: float, h: float) -> Optional[List[Dict[str, float]]]:
    if not shape or shape.get("type") == "rectangle":
        return None
    t = shape.get("type")
    if shape.get("polygon") and len(shape["polygon"]) >= 3:
        return shape["polygon"]
    if t == "square":
        s = min(w, h)
        ox = (w - s) / 2
        oy = (h - s) / 2
        return [{"x": ox, "y": oy}, {"x": ox+s, "y": oy}, {"x": ox+s, "y": oy+s}, {"x": ox, "y": oy+s}]
    if t == "polygon":
        sides = shape.get("sides", 6)
        radius = shape.get("radius", min(w,h)*0.45)
        cx, cy = w/2, h/2
        pts = []
        import math
        for i in range(sides):
            ang = -math.pi/2 + i*2*math.pi/sides
            pts.append({"x": cx + math.cos(ang)*radius, "y": cy + math.sin(ang)*radius})
        return pts
    nw = shape.get("notchWidth", w*0.4)
    nh = shape.get("notchHeight", h*0.4)
    if t == "L":
        return [{"x":0,"y":0},{"x":w,"y":0},{"x":w,"y":h-nh},{"x":w-nw,"y":h-nh},{"x":w-nw,"y":h},{"x":0,"y":h}]
    if t == "U":
        side = (w - nw)/2
        return [{"x":0,"y":0},{"x":w,"y":0},{"x":w,"y":h},{"x":w-side,"y":h},{"x":w-side,"y":h-nh},{"x":side,"y":h-nh},{"x":side,"y":h},{"x":0,"y":h}]
    if t == "T":
        side = (w - nw)/2
        return [{"x":side,"y":0},{"x":side+nw,"y":0},{"x":side+nw,"y":h-nh},{"x":w,"y":h-nh},{"x":w,"y":h},{"x":0,"y":h},{"x":0,"y":h-nh},{"x":side,"y":h-nh}]
    return None

def _point_in_poly(pt: Dict[str,float], poly: List[Dict[str,float]]) -> bool:
    x, y = pt["x"], pt["y"]
    inside = False
    n = len(poly)
    for i in range(n):
        j = (i-1) % n
        xi, yi = poly[i]["x"], poly[i]["y"]
        xj, yj = poly[j]["x"], poly[j]["y"]
        intersect = ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi)
        if intersect:
            inside = not inside
    return inside

def _room_inside_polygon(room: Dict[str,Any], poly: Optional[List[Dict[str,float]]]) -> bool:
    if not poly:
        return True
    corners = [
        {"x": room["x"], "y": room["y"]},
        {"x": room["x"]+room["width"], "y": room["y"]},
        {"x": room["x"]+room["width"], "y": room["y"]+room["height"]},
        {"x": room["x"], "y": room["y"]+room["height"]},
        {"x": room["x"]+room["width"]/2, "y": room["y"]+room["height"]/2},
    ]
    return all(_point_in_poly(c, poly) for c in corners)

def _rooms_overlap(a: Dict[str,Any], b: Dict[str,Any]) -> bool:
    return not (a["x"]+a["width"] <= b["x"] or a["x"] >= b["x"]+b["width"] or a["y"]+a["height"] <= b["y"] or a["y"] >= b["y"]+b["height"])

def _validate_and_repair(rooms: List[Dict[str,Any]], w: float, h: float, shape: Optional[Dict[str,Any]]) -> List[Dict[str,Any]]:
    poly = _get_shape_polygon(shape, w, h) if shape else None
    valid = []
    for r in rooms:
        # ensure min size
        if r.get("width",0) < 5 or r.get("height",0) < 5:
            # fix to default
            tw, th = ROOM_DEFAULTS.get(r.get("type","other"), (10,10))
            r["width"] = tw
            r["height"] = th
        # clamp inside bounds
        if r["x"] < 0: r["x"] = 0
        if r["y"] < 0: r["y"] = 0
        if r["x"] + r["width"] > w: r["x"] = max(0, w - r["width"] - 0.5)
        if r["y"] + r["height"] > h: r["y"] = max(0, h - r["height"] - 0.5)
        # check polygon
        if poly and not _room_inside_polygon(r, poly):
            # try to find alternative position near center
            # naive: move to center
            r["x"] = max(0, w/2 - r["width"]/2)
            r["y"] = max(0, h/2 - r["height"]/2)
            if not _room_inside_polygon(r, poly):
                continue  # skip if still not inside
        # check overlap with already placed
        overlap = any(_rooms_overlap(r, v) for v in valid)
        if overlap:
            # try to find free spot by scanning
            found = False
            for ty in range(0, int(h - r["height"])+1):
                for tx in range(0, int(w - r["width"])+1):
                    test = {**r, "x": tx, "y": ty}
                    if poly and not _room_inside_polygon(test, poly):
                        continue
                    if not any(_rooms_overlap(test, v) for v in valid):
                        r["x"], r["y"] = tx, ty
                        found = True
                        break
                if found:
                    break
            if not found:
                continue # skip overlapping room
        valid.append(r)
    return valid

def _build_requirements_rooms(req: Dict[str,Any]) -> List[Dict[str,Any]]:
    """Convert counts to rooms list with defaults"""
    rooms = []
    mapping = {
        "bedrooms": ("bedroom", "Bedroom"),
        "bathrooms": ("bathroom", "Bathroom"),
        "toilets": ("toilet", "Toilet"),
        "kitchens": ("kitchen", "Kitchen"),
        "livingRooms": ("living-room", "Living Room"),
        "diningRooms": ("dining-room", "Dining"),
        "studies": ("study", "Study"),
        "balconies": ("balcony", "Balcony"),
        "garages": ("garage", "Garage"),
        "stores": ("store", "Store"),
        "utilities": ("utility", "Utility"),
        "halls": ("hall", "Hall"),
    }
    # handle master bedroom separately - first bedroom is master if bedrooms>0
    bedrooms = int(req.get("bedrooms", 0) or 0)
    for i in range(bedrooms):
        t = "master-bedroom" if i == 0 and bedrooms >= 1 else "bedroom"
        name = "Master Bedroom" if t == "master-bedroom" else f"Bedroom {i+1 if t=='master-bedroom' else i}" if bedrooms>2 else f"Bedroom {i+1}"
        if i == 0 and t == "bedroom" and bedrooms == 1:
            name = "Bedroom"
        w,h = ROOM_DEFAULTS[t]
        rooms.append({"name": name, "type": t, "width": w, "height": h})
    for key, (rtype, label) in mapping.items():
        if key == "bedrooms":
            continue
        count = int(req.get(key, 0) or 0)
        for i in range(count):
            w,h = ROOM_DEFAULTS[rtype]
            name = label if count == 1 else f"{label} {i+1}"
            # special: kitchen/dining/living naming
            if rtype == "kitchen" and count == 1:
                name = "Kitchen"
            if rtype == "living-room" and count == 1:
                name = "Living Room"
            rooms.append({"name": name, "type": rtype, "width": w, "height": h})
    # handle additional custom list
    additional = req.get("additionalRooms") or req.get("additional") or []
    if isinstance(additional, list):
        for item in additional:
            if isinstance(item, str):
                t = item.lower().replace(" ", "-")
                if t not in ROOM_DEFAULTS:
                    t = "other"
                w,h = ROOM_DEFAULTS[t]
                rooms.append({"name": item.title(), "type": t, "width": w, "height": h})
            elif isinstance(item, dict):
                t = item.get("type", "other")
                w = item.get("width", ROOM_DEFAULTS.get(t,(10,10))[0])
                h = item.get("height", ROOM_DEFAULTS.get(t,(10,10))[1])
                rooms.append({"name": item.get("name", t.title()), "type": t, "width": w, "height": h})
    return rooms

def _heuristic_generate(w: float, h: float, shape: Optional[Dict[str,Any]], requirements: Dict[str,Any], option_idx: int) -> Dict[str,Any]:
    """
    Architecturally relevant heuristic - zone-based packing with adjacency.
    Strategies:
      0: Horizontal Zoned (Front public, Middle service, Rear private) - most Vastu compliant
      1: Vertical Split with corridor
      2: Courtyard perimeter
      3: Compact efficient grid
    """
    rooms_template = _build_requirements_rooms(requirements)
    rooms = [dict(r) for r in rooms_template]

    # Slight size variation per option for diversity, but keep realistic
    for r in rooms:
        if option_idx == 1:
            # vertical option: slightly narrower but deeper
            if r["type"] in ("living-room","bedroom","master-bedroom"):
                r["width"] = max(5, round(r["width"]*0.95,1))
                r["height"] = max(5, round(r["height"]*1.05,1))
        elif option_idx == 2:
            if r["type"] in ("kitchen","bathroom","toilet"):
                r["width"] = max(5, round(r["width"]*0.9,1))
                r["height"] = max(5, round(r["height"]*0.9,1))
        elif option_idx == 3:
            # compact: 5% smaller for efficiency
            r["width"] = max(5, round(r["width"]*0.95,1))
            r["height"] = max(5, round(r["height"]*0.95,1))

    poly = _get_shape_polygon(shape, w, h) if shape else None

    # Helper: pack rooms within a zone rect (x0,y0,x1,y1) using row packing
    def pack_zone(zone, z_rooms, placed_global):
        x0,y0,x1,y1 = zone
        zw = x1 - x0
        zh = y1 - y0
        # sort by area descending for better packing
        z_rooms_sorted = sorted(z_rooms, key=lambda x: x["width"]*x["height"], reverse=True)
        cur_x = x0 + 0.5
        cur_y = y0 + 0.5
        row_h = 0
        gap = 0.5  # tight gap, realistic shared walls
        for r in z_rooms_sorted:
            rw, rh = r["width"], r["height"]
            # try to fit in current row
            if cur_x + rw > x1:
                # next row
                cur_x = x0 + 0.5
                cur_y += row_h + gap
                row_h = 0
            # check if still fits vertically in zone
            if cur_y + rh > y1 - 0.5:
                # try swapping
                if cur_x + rh <= x1 and cur_y + rw <= y1:
                    rw, rh = rh, rw
                    r["width"], r["height"] = rw, rh
                else:
                    # no space in this zone, fallback to global scan later
                    continue
            # try placement, check polygon and global overlap
            test = {**r, "x": cur_x, "y": cur_y}
            if poly and not _room_inside_polygon(test, poly):
                # try next row
                cur_x = x0 + 0.5
                cur_y += row_h + gap if row_h else rh + gap
                row_h = 0
                if cur_y + rh > y1:
                    continue
                test = {**r, "x": cur_x, "y": cur_y}
                if poly and not _room_inside_polygon(test, poly):
                    continue
            if any(_rooms_overlap(test, p) for p in placed_global):
                # try next position in row (shift by 1)
                # simple: try next x after overlap
                found = False
                for try_x in [cur_x+1, cur_x+2, x0+0.5]:
                    try_test = {**r, "x": try_x, "y": cur_y}
                    if try_x + rw > x1:
                        continue
                    if poly and not _room_inside_polygon(try_test, poly):
                        continue
                    if not any(_rooms_overlap(try_test, p) for p in placed_global):
                        test = try_test
                        cur_x = try_x
                        found = True
                        break
                if not found:
                    continue
            # place
            r["x"], r["y"] = test["x"], test["y"]
            placed_global.append(r)
            cur_x += rw + gap
            row_h = max(row_h, rh)
        return

    # Strategy dispatch
    placed: List[Dict[str,Any]] = []

    if option_idx == 0:
        # === HORIZONTAL ZONED (Vastu: public front, private rear) ===
        # Divide height into 3 bands with 4ft corridors
        corridor = 3.0
        avail_h = h - 2*corridor
        front_h = avail_h * 0.32
        middle_h = avail_h * 0.20
        rear_h = avail_h * 0.48
        # Front (entrance, public) at bottom (y large) - near door
        front_y1 = h
        front_y0 = h - front_h
        middle_y1 = front_y0 - corridor
        middle_y0 = middle_y1 - middle_h
        rear_y1 = middle_y0 - corridor
        rear_y0 = 0

        # Front (south near entrance) includes living/dining/kitchen/garage for adjacency
        front_types = {"living-room","dining-room","kitchen","garage"}
        middle_types = {"study","store","utility","hall"}
        rear_types = {"bedroom","master-bedroom","bathroom","toilet","balcony"}

        front_rooms = [r for r in rooms if r["type"] in front_types]
        middle_rooms = [r for r in rooms if r["type"] in middle_types]
        rear_rooms = [r for r in rooms if r["type"] in rear_types]
        other = [r for r in rooms if r["type"] not in front_types|middle_types|rear_types]
        middle_rooms.extend(other)

        # Special handling: hall as corridor, garage as front side vertical
        hall_rooms = [r for r in rooms if r["type"]=="hall"]
        garage_rooms = [r for r in rooms if r["type"]=="garage"]
        # Remove hall/garage from front/middle for special placement
        front_rooms = [r for r in front_rooms if r["type"] not in ("hall","garage")]
        middle_rooms = [r for r in middle_rooms if r["type"] not in ("hall","garage")]
        front_order = {"living-room":0, "dining-room":1, "kitchen":2}
        front_rooms.sort(key=lambda x: front_order.get(x["type"], 99))
        # Pack hall as horizontal corridor spanning width at y = front_y0 - corridor
        for hall in hall_rooms:
            hall["width"] = w - 2
            hall["height"] = 4.5
            hall["x"] = 1
            hall["y"] = front_y0 - corridor - 0.5  # just above front zone
            # ensure inside polygon
            if poly and not _room_inside_polygon(hall, poly):
                hall["y"] = middle_y0 + 1
            hall["id"] = f"room_{uuid.uuid4().hex[:6]}"
            hall["rotation"]=0
            hall["properties"]={}
            placed.append(hall)
        # Pack garage at front side (left) vertical, near entrance bottom
        for gar in garage_rooms:
            gar["width"] = 12
            gar["height"] = min(16, front_h-1)
            gar["x"] = 1
            gar["y"] = front_y0 + 1
            gar["id"] = f"room_{uuid.uuid4().hex[:6]}"
            gar["rotation"]=0
            gar["properties"]={}
            # check overlap, if overlap with front rooms, shift front rooms right
            placed.append(gar)
            # front rooms will be packed to the right of garage
        # Pack front/middle with dedicated zones (front zone now reserved for living/dining/kitchen to the right of garage)
        # Adjust front zone to exclude garage width if garage exists
        front_x0 = 0.5 + (13 if garage_rooms else 0)
        pack_zone((front_x0, front_y0+0.5, w-0.5, front_y1), front_rooms, placed)
        pack_zone((0.5, middle_y0, w-0.5, middle_y1), middle_rooms, placed)
        # Pack rear as a whole but ordered: master, bedrooms, baths, balcony
        rear_order = {"master-bedroom":0, "bedroom":1, "bathroom":2, "toilet":3, "balcony":4}
        rear_rooms_sorted = sorted(rear_rooms, key=lambda x: rear_order.get(x["type"], 99))
        # Use single pack for rear to keep adjacency via row packing (bathroom will be next to bedroom in same row if space)
        # First try single zone pack
        pack_zone((0.5, rear_y0, w-0.5, rear_y1), rear_rooms_sorted, placed)
        # For any unplaced rear rooms (due to height), fallback will handle globally but we keep rear together
    elif option_idx == 1:
        # === VERTICAL SPLIT with corridor ===
        corridor_w = 4
        left_w = (w - corridor_w) * 0.58
        right_w = (w - corridor_w) * 0.42
        left_x1 = left_w
        right_x0 = left_w + corridor_w
        # Left: public (living, dining, kitchen, garage, balcony)
        # Right: private (bedrooms, baths, study)
        left_types = {"living-room","dining-room","kitchen","garage","balcony"}
        right_types = {"bedroom","master-bedroom","bathroom","toilet","study","store","utility"}
        left_rooms = [r for r in rooms if r["type"] in left_types]
        right_rooms = [r for r in rooms if r["type"] in right_types]
        other = [r for r in rooms if r["type"] not in left_types|right_types]
        right_rooms.extend(other)
        # Pack left zone row-wise, front to rear
        pack_zone((0.5, 0.5, left_x1-0.5, h-0.5), left_rooms, placed)
        # Pack right zone
        # For right, ensure bedrooms rear, so sort bedrooms by master first but pack still top-down; we bias by placing living not in right
        pack_zone((right_x0, 0.5, w-0.5, h-0.5), right_rooms, placed)

    elif option_idx == 2:
        # === COURTYARD / L-SHAPED ===
        # Place rooms around perimeter, leaving central courtyard empty (30% central)
        # Define central courtyard rect to keep empty
        cx0, cy0, cx1, cy1 = w*0.35, h*0.35, w*0.65, h*0.65
        # Order rooms around perimeter clockwise starting top-left
        # First, place large rooms at corners: living top-left, kitchen top-right, bedrooms bottom
        perimeter_order = {"living-room":0, "dining-room":1, "kitchen":2, "garage":3, "master-bedroom":4, "bedroom":5, "bathroom":6, "toilet":7, "balcony":8, "study":9}
        rooms_sorted = sorted(rooms, key=lambda x: perimeter_order.get(x["type"], 99))
        # Define perimeter positions: top edge, right edge, bottom edge, left edge
        # We will attempt to place each room at next perimeter slot that fits and doesn't overlap courtyard
        # Helper to check not inside courtyard
        def overlaps_courtyard(r):
            return not (r["x"]+r["width"] <= cx0 or r["x"] >= cx1 or r["y"]+r["height"] <= cy0 or r["y"] >= cy1)
        for r in rooms_sorted:
            placed_ok = False
            # try top edge (y small)
            for try_y in [0.5, h*0.15, h*0.5 - r["height"] -1]:
                for try_x in [0.5, w*0.25, w*0.5, w - r["width"] -0.5]:
                    if try_x + r["width"] > w -0.5 or try_y + r["height"] > h -0.5:
                        continue
                    test = {**r, "x": try_x, "y": try_y}
                    if overlaps_courtyard(test):
                        continue
                    if poly and not _room_inside_polygon(test, poly):
                        continue
                    if any(_rooms_overlap(test, p) for p in placed):
                        continue
                    r["x"], r["y"] = try_x, try_y
                    placed.append(r)
                    placed_ok = True
                    break
                if placed_ok:
                    break
            if not placed_ok:
                # fallback to zone packing within perimeter strips
                # try outer ring packing
                for try_x in [0.5, w - r["width"] -0.5]:
                    for try_y in [0.5, h - r["height"] -0.5, h*0.7]:
                        test = {**r, "x": try_x, "y": try_y}
                        if overlaps_courtyard(test):
                            continue
                        if poly and not _room_inside_polygon(test, poly):
                            continue
                        if any(_rooms_overlap(test, p) for p in placed):
                            continue
                        r["x"], r["y"] = try_x, try_y
                        placed.append(r)
                        placed_ok = True
                        break
                    if placed_ok:
                        break
            if not placed_ok:
                # last resort pack anywhere not in courtyard
                for ty in range(0, int(h - r["height"])):
                    for tx in range(0, int(w - r["width"])):
                        test = {**r, "x": tx, "y": ty}
                        if overlaps_courtyard(test):
                            continue
                        if poly and not _room_inside_polygon(test, poly):
                            continue
                        if any(_rooms_overlap(test, p) for p in placed):
                            continue
                        r["x"], r["y"] = tx, ty
                        placed.append(r)
                        placed_ok = True
                        break
                    if placed_ok:
                        break
    else:
        # === COMPACT EFFICIENT ===
        # Simple grid efficient packing, small corridors, maximize coverage
        # Sort by area descending, pack row-wise tightly
        rooms_sorted = sorted(rooms, key=lambda x: x["width"]*x["height"], reverse=True)
        cur_x, cur_y = 0.5, 0.5
        row_h = 0
        gap = 0.8
        for r in rooms_sorted:
            if cur_x + r["width"] > w -0.5:
                cur_x = 0.5
                cur_y += row_h + gap
                row_h = 0
            if cur_y + r["height"] > h -0.5:
                # try swap
                if cur_x + r["height"] <= w -0.5 and cur_y + r["width"] <= h -0.5:
                    r["width"], r["height"] = r["height"], r["width"]
                else:
                    continue
            test = {**r, "x": cur_x, "y": cur_y}
            if poly and not _room_inside_polygon(test, poly):
                # try next row
                cur_x = 0.5
                cur_y += row_h + gap if row_h else r["height"] + gap
                row_h = 0
                if cur_y + r["height"] > h -0.5:
                    continue
                test = {**r, "x": cur_x, "y": cur_y}
                if poly and not _room_inside_polygon(test, poly):
                    continue
            if any(_rooms_overlap(test, p) for p in placed):
                # shift
                cur_x += 1
                test = {**r, "x": cur_x, "y": cur_y}
                if cur_x + r["width"] > w -0.5 or any(_rooms_overlap(test, p) for p in placed):
                    cur_x = 0.5
                    cur_y += row_h + gap if row_h else r["height"] + gap
                    row_h = 0
                    continue
            r["x"], r["y"] = test["x"], test["y"]
            placed.append(r)
            cur_x += r["width"] + gap
            row_h = max(row_h, r["height"])

    # Fallback: if any rooms not placed (due to zone full), pack globally in remaining space
    unplaced = [r for r in rooms if r not in placed]
    for r in unplaced:
        found = False
        for ty in range(0, int(h - r["height"])+1):
            for tx in range(0, int(w - r["width"])+1):
                test = {**r, "x": tx, "y": ty}
                if poly and not _room_inside_polygon(test, poly):
                    continue
                if any(_rooms_overlap(test, p) for p in placed):
                    continue
                r["x"], r["y"] = tx, ty
                placed.append(r)
                found = True
                break
            if found:
                break
        if not found:
            # try swapped
            r["width"], r["height"] = r["height"], r["width"]
            for ty in range(0, int(h - r["height"])+1):
                for tx in range(0, int(w - r["width"])+1):
                    test = {**r, "x": tx, "y": ty}
                    if poly and not _room_inside_polygon(test, poly):
                        continue
                    if any(_rooms_overlap(test, p) for p in placed):
                        continue
                    r["x"], r["y"] = tx, ty
                    placed.append(r)
                    found = True
                    break
                if found:
                    break

    # assign ids
    for r in placed:
        r["id"] = f"room_{uuid.uuid4().hex[:6]}"
        r["rotation"] = 0
        r["properties"] = {}

    # decide shape for this option if shape is AI
    final_shape = shape
    if not shape or shape.get("type") == "ai":
        shapes = [ {"type":"rectangle"}, {"type":"L","notchWidth": w*0.35,"notchHeight": h*0.35}, {"type":"U","notchWidth": w*0.4,"notchHeight": h*0.4}, {"type":"square"} ]
        final_shape = shapes[option_idx % len(shapes)]
        if final_shape["type"] != "rectangle":
            final_shape["polygon"] = _get_shape_polygon(final_shape, w, h)

    names = ["Linear Zoned", "Vertical Split", "Courtyard L", "Compact Grid"]
    descriptions = [
        "Front public (living/dining) → middle service (kitchen) → rear private (bedrooms with attached baths), 4ft corridors.",
        "Left public / Right private with central corridor, garage front, bedrooms rear with attached baths.",
        "Rooms wrap around central open, L-shaped courtyard focus, good light and ventilation.",
        "Tightly packed grid maximizing area, shared walls, minimal circulation."
    ]
    return {
        "name": f"Option {option_idx+1}: {names[option_idx % len(names)]}",
        "description": descriptions[option_idx % len(descriptions)],
        "plotShape": final_shape if final_shape and final_shape.get("type")!="rectangle" else ({"type":"rectangle"} if not final_shape else final_shape),
        "rooms": placed
    }

def mock_generate_options(plot_w: float, plot_h: float, plot_shape: Optional[Dict[str,Any]], requirements: Dict[str,Any], count: int = 3) -> List[Dict[str,Any]]:
    opts = []
    for i in range(count):
        opts.append(_heuristic_generate(plot_w, plot_h, plot_shape, requirements, i))
    return opts

def _build_generation_user_prompt(plot_w: float, plot_h: float, plot_shape: Optional[Dict[str,Any]], requirements: Dict[str,Any], units: str, property_type: str, preferences: str, count: int) -> str:
    shape_desc = "AI should choose best shape"
    if plot_shape:
        if plot_shape.get("type") == "ai":
            shape_desc = "AI decides shape per option (rectangle, L, U, T, square, polygon) to best fit requirements"
        else:
            shape_desc = f"{plot_shape.get('type')} with {plot_shape}"
    req_rooms = _build_requirements_rooms(requirements)
    req_summary = ", ".join([f"{r['name']} ({r['type']} {r['width']}×{r['height']} ft)" for r in req_rooms]) or "No specific rooms, AI decides"
    total_area = sum(r["width"]*r["height"] for r in req_rooms)
    plot_area = plot_w * plot_h
    return f"""Plot: {plot_w} × {plot_h} {units} (area {plot_area:.0f} sq ft)
Shape: {shape_desc}
Property: {property_type}
Required rooms ({len(req_rooms)}, area ~{total_area:.0f} sq ft, coverage {(total_area/plot_area*100):.0f}%):
{req_summary}
Preferences: {preferences or 'None, use standard Vastu/logic'}
Generate {count} distinct options using JSON format exactly as specified. Ensure each option's rooms are within bounds and non-overlapping."""

import httpx
import asyncio

async def llm_generate_options(plot_w: float, plot_h: float, plot_shape: Optional[Dict[str,Any]], requirements: Dict[str,Any], units: str, property_type: str, preferences: str, count: int, provider) -> Optional[List[Dict[str,Any]]]:
    # Use provider's underlying OpenAI-compatible call with GENERATE_SYSTEM_PROMPT
    # If provider is MockProvider, return None to trigger heuristic
    from .provider import MockProvider, OpenAICompatibleProvider, GeminiProvider, AnthropicProvider
    if isinstance(provider, MockProvider):
        return None
    user_prompt = _build_generation_user_prompt(plot_w, plot_h, plot_shape, requirements, units, property_type, preferences, count)
    # Try to handle OpenAI-compatible
    if isinstance(provider, OpenAICompatibleProvider):
        url = f"{provider.base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {provider.api_key}", "Content-Type": "application/json"}
        http_referer = os.getenv("OPENROUTER_REFERER") or os.getenv("AI_REFERER")
        x_title = os.getenv("OPENROUTER_TITLE") or os.getenv("AI_TITLE")
        if http_referer:
            headers["HTTP-Referer"] = http_referer
        if x_title:
            headers["X-Title"] = x_title
        payload = {
            "model": provider.model,
            "messages": [
                {"role": "system", "content": GENERATE_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.85,  # higher for diversity
            "max_tokens": 4000,
            "response_format": {"type": "json_object"},
        }
        try:
            async with httpx.AsyncClient(timeout=provider.timeout+10) as client:
                # try with json_object, fallback without
                try:
                    resp = await client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                except httpx.HTTPStatusError as e:
                    body = e.response.text[:800] if e.response else ""
                    if e.response.status_code == 400 and "response_format" in body.lower():
                        payload2 = {k:v for k,v in payload.items() if k!="response_format"}
                        resp = await client.post(url, headers=headers, json=payload2)
                        resp.raise_for_status()
                    else:
                        raise
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                try:
                    parsed = json.loads(content)
                except:
                    import re
                    m = re.search(r"\{.*\}", content, re.DOTALL)
                    if m:
                        parsed = json.loads(m.group(0))
                    else:
                        raise
                options = parsed.get("options") or parsed.get("floorplans") or []
                if isinstance(options, dict):
                    options = [options]
                # Validate options structure
                valid_opts = []
                for opt in options[:count]:
                    if not isinstance(opt, dict):
                        continue
                    rooms = opt.get("rooms") or []
                    # ensure each room has required fields
                    cleaned = []
                    for r in rooms:
                        if not isinstance(r, dict):
                            continue
                        try:
                            nr = {
                                "name": str(r.get("name","Room")),
                                "type": str(r.get("type","other")),
                                "x": float(r.get("x",0)),
                                "y": float(r.get("y",0)),
                                "width": float(r.get("width",10)),
                                "height": float(r.get("height",10)),
                            }
                            cleaned.append(nr)
                        except:
                            continue
                    # validate and repair
                    cleaned = _validate_and_repair(cleaned, plot_w, plot_h, opt.get("plotShape") or plot_shape)
                    # assign ids
                    for cr in cleaned:
                        cr["id"] = f"room_{uuid.uuid4().hex[:6]}"
                        cr["rotation"] = 0
                        cr["properties"] = {}
                    opt["rooms"] = cleaned
                    if not opt.get("name"):
                        opt["name"] = f"Option {len(valid_opts)+1}"
                    valid_opts.append(opt)
                    if len(valid_opts) >= count:
                        break
                if len(valid_opts) >= 1:
                    # pad to count with heuristics if LLM returned fewer
                    while len(valid_opts) < count:
                        valid_opts.append(_heuristic_generate(plot_w, plot_h, plot_shape, requirements, len(valid_opts)))
                    return valid_opts[:count]
                else:
                    return None
        except Exception as e:
            print(f"[Generate] LLM error: {e}")
            return None
    elif isinstance(provider, GeminiProvider):
        # Gemini
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{provider.model}:generateContent?key={provider.api_key}"
        payload = {
            "systemInstruction": {"parts": [{"text": GENERATE_SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {"temperature": 0.85, "maxOutputTokens": 6000, "responseMimeType": "application/json"},
        }
        try:
            async with httpx.AsyncClient(timeout=provider.timeout+10) as client:
                resp = await client.post(url, headers={"Content-Type":"application/json"}, json=payload)
                resp.raise_for_status()
                data = resp.json()
                candidates = data.get("candidates") or []
                text = "".join(p.get("text","") for p in candidates[0].get("content",{}).get("parts",[])) if candidates else ""
                parsed = json.loads(text)
                options = parsed.get("options") or []
                # same validation as above
                valid_opts = []
                for opt in options[:count]:
                    rooms = opt.get("rooms") or []
                    cleaned = []
                    for r in rooms:
                        try:
                            nr = {"name": str(r.get("name","Room")), "type": str(r.get("type","other")), "x": float(r.get("x",0)), "y": float(r.get("y",0)), "width": float(r.get("width",10)), "height": float(r.get("height",10))}
                            cleaned.append(nr)
                        except:
                            continue
                    cleaned = _validate_and_repair(cleaned, plot_w, plot_h, opt.get("plotShape") or plot_shape)
                    for cr in cleaned:
                        cr["id"] = f"room_{uuid.uuid4().hex[:6]}"
                        cr["rotation"] = 0
                        cr["properties"] = {}
                    opt["rooms"] = cleaned
                    valid_opts.append(opt)
                if valid_opts:
                    while len(valid_opts) < count:
                        valid_opts.append(_heuristic_generate(plot_w, plot_h, plot_shape, requirements, len(valid_opts)))
                    return valid_opts[:count]
        except Exception as e:
            print(f"[Generate Gemini] error {e}")
            return None
    # Anthropic fallback: use same as OpenAI but via its API - for now fallback to heuristic
    return None

async def generate_floorplans(plot_w: float, plot_h: float, plot_shape: Optional[Dict[str,Any]], requirements: Dict[str,Any], units: str = "feet", property_type: str = "residential", preferences: str = "", count: int = 3) -> List[Dict[str,Any]]:
    provider = get_provider()
    # Try LLM first
    opts = await llm_generate_options(plot_w, plot_h, plot_shape, requirements, units, property_type, preferences, count, provider)
    if opts:
        return opts
    # Fallback heuristic
    return mock_generate_options(plot_w, plot_h, plot_shape, requirements, count)

def options_to_designs(options: List[Dict[str,Any]], plot_w: float, plot_h: float, plot_shape: Optional[Dict[str,Any]], units: str, property_type: str, project_name: str) -> List[Dict[str,Any]]:
    designs = []
    for idx, opt in enumerate(options):
        shape_to_use = opt.get("plotShape") or plot_shape
        # normalize shape
        if shape_to_use and shape_to_use.get("type") == "ai":
            shape_to_use = {"type":"rectangle"}
        # build floor
        floor_id = "floor_ground"
        # handle square: keep plot dimensions as bounds, but floor width/height remains plot_w/h
        # if shape changes plot dimensions? keep same
        rooms = opt.get("rooms") or []
        # ensure rooms have ids already from generator
        design = {
            "id": f"generated_{uuid.uuid4().hex[:8]}",
            "version": 1,
            "units": units,
            "name": project_name,
            "propertyType": property_type,
            "site": {"width": plot_w, "depth": plot_h},
            "metadata": {"createdAt": "", "updatedAt": ""},
            "floors": [
                {
                    "id": floor_id,
                    "name": "Ground Floor",
                    "level": 0,
                    "width": plot_w,
                    "height": plot_h,
                    "plotShape": shape_to_use,
                    "rooms": rooms,
                    "walls": [],  # will be generated as perimeter based on shape
                    "doors": [],
                    "windows": [],
                    "objects": [],
                    "dimensions": [],
                    "annotations": [],
                }
            ],
        }
        # generate perimeter walls based on shape polygon or rectangle
        try:
            # simple: if shape polygon provided, walls are polygon edges
            poly = _get_shape_polygon(shape_to_use, plot_w, plot_h) if shape_to_use else None
            walls = []
            if poly and len(poly) >= 3:
                for i in range(len(poly)):
                    p = poly[i]
                    nxt = poly[(i+1)%len(poly)]
                    walls.append({"id": f"wall_{uuid.uuid4().hex[:6]}", "start": {"x": p["x"], "y": p["y"]}, "end": {"x": nxt["x"], "y": nxt["y"]}, "thickness": 0.5, "height": 9, "type": "exterior"})
            else:
                walls = [
                    {"id": f"wall_{uuid.uuid4().hex[:6]}", "start": {"x":0,"y":0}, "end": {"x":plot_w,"y":0}, "thickness":0.5, "height":9, "type":"exterior"},
                    {"id": f"wall_{uuid.uuid4().hex[:6]}", "start": {"x":plot_w,"y":0}, "end": {"x":plot_w,"y":plot_h}, "thickness":0.5, "height":9, "type":"exterior"},
                    {"id": f"wall_{uuid.uuid4().hex[:6]}", "start": {"x":plot_w,"y":plot_h}, "end": {"x":0,"y":plot_h}, "thickness":0.5, "height":9, "type":"exterior"},
                    {"id": f"wall_{uuid.uuid4().hex[:6]}", "start": {"x":0,"y":plot_h}, "end": {"x":0,"y":0}, "thickness":0.5, "height":9, "type":"exterior"},
                ]
            design["floors"][0]["walls"] = walls
            # add doors/windows heuristically? place one door on south wall, windows on perimeter
            # Add 1-2 windows per bedroom/living
            wins = []
            if walls:
                # place windows on exterior walls near living/bedrooms
                for r in rooms[:3]:
                    # find closest wall
                    cx = r["x"]+r["width"]/2
                    cy = r["y"]+r["height"]/2
                    best = min(walls, key=lambda w: ((w["start"]["x"]+w["end"]["x"])/2 - cx)**2 + ((w["start"]["y"]+w["end"]["y"])/2 - cy)**2)
                    # compute t
                    import math
                    # approximate projection
                    # find t along wall
                    # For simplicity use 0.5
                    wins.append({"id": f"win_{uuid.uuid4().hex[:6]}", "wallId": best["id"], "position": 0.5, "width": 4, "height": 4, "type": "casement"})
            design["floors"][0]["windows"] = wins[:4]
            # doors: one on south exterior
            if walls:
                south = max(walls, key=lambda w: (w["start"]["y"]+w["end"]["y"])/2)
                design["floors"][0]["doors"] = [{"id": f"door_{uuid.uuid4().hex[:6]}", "wallId": south["id"], "position": 0.5, "width": 3, "swingDirection": "right"}]
        except Exception as e:
            print(f"wall gen error {e}")
        designs.append({"name": opt.get("name", f"Option {idx+1}"), "description": opt.get("description",""), "design": design})
    return designs
