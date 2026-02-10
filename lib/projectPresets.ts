/**
 * Project presets for guided creation – simple defaults so amateur users
 * can start from a known type (house, extension, garage, etc.) instead of a blank canvas.
 */

export interface ProjectPreset {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: string; // emoji or lucide name
  /** Default width (m) */
  width: number;
  /** Default depth (m) */
  depth: number;
  /** Ground / 1st / 2nd floor heights (m) */
  wallHeights: { ground: number; first: number; second: number };
  roof: {
    type: "flat" | "gable" | "hip" | "shed" | "mansard";
    pitch: number;
    overhang: number;
  };
  /** Suggested surface type for 2D plan */
  surfaceType: "building" | "green" | "concrete" | "gravel";
  /** Category for footprint/compliance */
  category: "building" | "pool" | "terrace" | "parking" | "other";
}

export const PROJECT_PRESETS: ProjectPreset[] = [
  {
    id: "house-small",
    label: "Small house",
    shortLabel: "House",
    description: "Single-storey or small house (e.g. 8×10 m)",
    icon: "🏠",
    width: 8,
    depth: 10,
    wallHeights: { ground: 3, first: 0, second: 0 },
    roof: { type: "gable", pitch: 35, overhang: 0.5 },
    surfaceType: "building",
    category: "building",
  },
  {
    id: "house-medium",
    label: "Single-family house",
    shortLabel: "House",
    description: "Classic house (e.g. 10×12 m, 1–2 storeys)",
    icon: "🏡",
    width: 10,
    depth: 12,
    wallHeights: { ground: 3, first: 2.7, second: 0 },
    roof: { type: "gable", pitch: 35, overhang: 0.5 },
    surfaceType: "building",
    category: "building",
  },
  {
    id: "house-large",
    label: "Large house",
    shortLabel: "House",
    description: "Two storeys (e.g. 12×14 m)",
    icon: "🏘️",
    width: 12,
    depth: 14,
    wallHeights: { ground: 3, first: 2.7, second: 2.7 },
    roof: { type: "gable", pitch: 38, overhang: 0.5 },
    surfaceType: "building",
    category: "building",
  },
  {
    id: "extension",
    label: "Extension",
    shortLabel: "Extension",
    description: "Extension to existing building (e.g. 4×6 m)",
    icon: "➕",
    width: 4,
    depth: 6,
    wallHeights: { ground: 2.7, first: 0, second: 0 },
    roof: { type: "gable", pitch: 35, overhang: 0.3 },
    surfaceType: "building",
    category: "building",
  },
  {
    id: "garage",
    label: "Garage",
    shortLabel: "Garage",
    description: "Single or double garage (e.g. 6×5 m)",
    icon: "🚗",
    width: 6,
    depth: 5,
    wallHeights: { ground: 2.5, first: 0, second: 0 },
    roof: { type: "shed", pitch: 15, overhang: 0.3 },
    surfaceType: "building",
    category: "building",
  },
  {
    id: "pool",
    label: "Pool",
    shortLabel: "Pool",
    description: "Rectangular pool (e.g. 10×5 m)",
    icon: "🏊",
    width: 10,
    depth: 5,
    wallHeights: { ground: 0, first: 0, second: 0 },
    roof: { type: "flat", pitch: 0, overhang: 0 },
    surfaceType: "building", // pool drawn as surface
    category: "pool",
  },
  {
    id: "terrace",
    label: "Terrace",
    shortLabel: "Terrace",
    description: "Terrace or patio (e.g. 6×4 m)",
    icon: "🪑",
    width: 6,
    depth: 4,
    wallHeights: { ground: 0, first: 0, second: 0 },
    roof: { type: "flat", pitch: 0, overhang: 0 },
    surfaceType: "concrete",
    category: "terrace",
  },
  {
    id: "green",
    label: "Green space",
    shortLabel: "Green",
    description: "Lawn, garden, or planted area",
    icon: "🌿",
    width: 6,
    depth: 6,
    wallHeights: { ground: 0, first: 0, second: 0 },
    roof: { type: "flat", pitch: 0, overhang: 0 },
    surfaceType: "green",
    category: "other",
  },
  {
    id: "custom",
    label: "Custom",
    shortLabel: "Custom",
    description: "Set dimensions yourself",
    icon: "✏️",
    width: 10,
    depth: 10,
    wallHeights: { ground: 3, first: 0, second: 0 },
    roof: { type: "gable", pitch: 35, overhang: 0.5 },
    surfaceType: "building",
    category: "building",
  },
];

export function getPresetById(id: string): ProjectPreset | undefined {
  return PROJECT_PRESETS.find((p) => p.id === id);
}

export function getPresetsByCategory(category: ProjectPreset["category"]): ProjectPreset[] {
  return PROJECT_PRESETS.filter((p) => p.category === category);
}
