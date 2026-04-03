/**
 * lib/pdf — Barrel export for the PDF generation pipeline.
 */

export { generatePC1 } from "./pc1-generator";
export { generatePC2 } from "./pc2-generator";
export { generatePC3 } from "./pc3-generator";
export { generatePC4 } from "./pc4-generator";
export { generatePC5 } from "./pc5-generator";
export { assembleDossier, fetchDossierData, generateSingleDocument } from "./dossier-assembler";
export { createA3Doc, drawFooter, drawScaleBar, drawNorthArrow, sanitizeFilename } from "./shared";
export type { DossierProjectData, CapturedImages, GeneratorResult } from "./types";
