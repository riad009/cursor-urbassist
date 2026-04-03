/**
 * Shared types for the PC1–PC5.2 PDF generation pipeline.
 * All generators consume a DossierProjectData object fetched from the database.
 */

// ─── Project data fetched from DB ──────────────────────────────────────────

export interface DossierProjectData {
  id: string;
  name: string;
  address: string | null;
  municipality: string | null;
  departement: string | null;
  coordinates: string | null;
  parcelIds: string;
  parcelArea: number | null;
  parcelGeometry: string | null;
  authorizationType: string | null;
  projectDescription: ProjectDescriptionJSON | null;
  scale: string;
  // Related models
  sitePlanData: SitePlanDataRow | null;
  terrainData: TerrainDataRow | null;
  elevationData: ElevationDataRow[];
  sectionData: SectionDataRow[];
  descriptiveStatement: DescriptiveStatementRow | null;
}

export interface ProjectDescriptionJSON {
  applicantName?: string;
  applicantFirstNames?: string;
  jobs?: JobEntry[];
  materials?: MaterialsData;
  [key: string]: unknown;
}

export interface JobEntry {
  nature: string;
  footprint: number;
  levels: number;
  ridgeHeight?: number;
  floorAreaEstimated: number;
  wallHeight?: number;
  roofPitch?: number;
  existingFootprint?: number;
}

export interface MaterialsData {
  wallMaterial?: string;
  wallColor?: string;
  roofMaterial?: string;
  roofCovering?: string;
  roofColor?: string;
  joineryMaterial?: string;
  trimColor?: string;
  gutterMaterial?: string;
  matExtMaterial?: string;
  matExtColor?: string;
  existingFacade?: string;
  [key: string]: string | undefined;
}

export interface SitePlanDataRow {
  canvasData: unknown;
  elements: unknown;
  footprintExisting: number | null;
  footprintProjected: number | null;
  footprintMax: number | null;
  surfaceAreas: unknown;
  northAngle: number | null;
  building3D: unknown;
}

export interface TerrainDataRow {
  elevationPoints: unknown;
  sectionLines: unknown;
  terrainModel: unknown;
  profiles: unknown;
}

export interface ElevationDataRow {
  facade: string;
  wallHeights: unknown;
  roofData: unknown;
  openings: unknown;
  materials: unknown;
}

export interface SectionDataRow {
  name: string;
  sectionLine: unknown;
  groundProfile: unknown;
  buildingCut: unknown;
}

export interface DescriptiveStatementRow {
  answers: unknown;
  generatedText: string | null;
  sections: unknown;
}

// ─── Generator output ──────────────────────────────────────────────────────

export interface GeneratorResult {
  /** Number of pages added to the jsPDF document */
  pageCount: number;
  /** Human-readable label for the document */
  label: string;
  /** PC code (e.g. "PC1", "PC2") */
  code: string;
}

// ─── Captured images passed from client ────────────────────────────────────

export interface CapturedImages {
  PC2?: string;   // base64 data URL
  PC3?: string;
  "PC5.2"?: string;
  [key: string]: string | undefined;
}

// ─── A3 landscape constants ────────────────────────────────────────────────

export const A3_LANDSCAPE = {
  W: 420,        // mm
  H: 297,        // mm
  MARGIN: 10,    // mm
  FOOTER_H: 22,  // mm — dark footer height
  /** Drawable content area */
  get CONTENT_W() { return this.W - this.MARGIN * 2; },
  get CONTENT_H() { return this.H - this.MARGIN - this.FOOTER_H; },
} as const;
