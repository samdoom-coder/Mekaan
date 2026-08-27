import type { UnitSystem } from "../types/design";

// Base unit is feet internally
const TO_FEET: Record<UnitSystem, number> = {
  feet: 1,
  inches: 1 / 12,
  meters: 3.28084,
  centimeters: 0.0328084,
};

const FROM_FEET: Record<UnitSystem, number> = {
  feet: 1,
  inches: 12,
  meters: 0.3048,
  centimeters: 30.48,
};

export function convert(valueInFeet: number, to: UnitSystem): number {
  return valueInFeet * FROM_FEET[to];
}

export function convertToFeet(value: number, from: UnitSystem): number {
  return value * TO_FEET[from];
}

export function formatDistance(valueInFeet: number, units: UnitSystem): string {
  if (units === "feet") {
    const feet = Math.floor(valueInFeet);
    const inches = Math.round((valueInFeet - feet) * 12);
    if (inches === 0) return `${feet}' 0"`;
    if (inches === 12) return `${feet + 1}' 0"`;
    return `${feet}' ${inches}"`;
  }
  const v = convert(valueInFeet, units);
  if (units === "inches") return `${Math.round(v)} in`;
  if (units === "meters") return `${v.toFixed(2)} m`;
  if (units === "centimeters") return `${Math.round(v)} cm`;
  return `${v.toFixed(2)}`;
}

export function formatArea(widthFeet: number, heightFeet: number, units: UnitSystem): string {
  const areaFeet = widthFeet * heightFeet;
  if (units === "feet" || units === "inches") {
    return `${Math.round(areaFeet)} sq ft`;
  }
  const w = convert(widthFeet, units);
  const h = convert(heightFeet, units);
  return `${(w * h).toFixed(2)} sq ${units}`;
}

export function parseDistance(input: string, units: UnitSystem): number | null {
  // naive
  const n = parseFloat(input);
  if (isNaN(n)) return null;
  return convertToFeet(n, units);
}
