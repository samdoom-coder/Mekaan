import type { Design, PlotShape } from "../../../types/design";

export interface GenerateRequirements {
  bedrooms?: number;
  bathrooms?: number;
  toilets?: number;
  kitchens?: number;
  livingRooms?: number;
  diningRooms?: number;
  studies?: number;
  balconies?: number;
  garages?: number;
  stores?: number;
  utilities?: number;
  additionalRooms?: any[];
}

export interface GenerateFloorplansRequest {
  name: string;
  plotWidth: number;
  plotDepth: number;
  plotShape?: PlotShape | { type: string } | null;
  units: string;
  propertyType: string;
  requirements: GenerateRequirements;
  preferences?: string;
  count?: number;
}

export interface GeneratedOption {
  name: string;
  description: string;
  design: Design;
}

export async function generateFloorplans(req: GenerateFloorplansRequest): Promise<{ options: GeneratedOption[] }> {
  const payload = {
    name: req.name,
    plotWidth: req.plotWidth,
    plotDepth: req.plotDepth,
    plotShape: req.plotShape,
    units: req.units,
    propertyType: req.propertyType,
    bedrooms: req.requirements.bedrooms,
    bathrooms: req.requirements.bathrooms,
    toilets: req.requirements.toilets,
    kitchens: req.requirements.kitchens,
    livingRooms: req.requirements.livingRooms,
    diningRooms: req.requirements.diningRooms,
    studies: req.requirements.studies,
    balconies: req.requirements.balconies,
    garages: req.requirements.garages,
    stores: req.requirements.stores,
    utilities: req.requirements.utilities,
    additionalRooms: req.requirements.additionalRooms,
    preferences: req.preferences,
    count: req.count,
  };
  const endpoints = ["/api/ai/generate-floorplans", "/ai/generate-floorplans"];
  let lastError = "";
  for (const ep of endpoints) {
    try {
      const resp = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        lastError = `${resp.status} ${txt.slice(0,500)}`;
        continue;
      }
      const data = await resp.json();
      // data.options is array of {name, description, design}
      return { options: data.options || [] };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
  }
  throw new Error(lastError || "Failed to generate floorplans");
}
