/**
 * Prompt Compiler — Auto-synthesize a structured project brief from Step 1 data.
 *
 * This replaces the blank "Project Intent" textarea with a rich, pre-filled summary
 * so the Gemini PLU analysis receives a precise, structured prompt instead of vague
 * user-typed text.
 *
 * Usage:
 *   const brief = compileProjectBrief(jobs, jobMaterials, { zone, address, authType });
 *   setProjectIntent(brief);
 */

// ─── Types (mirrored from page.tsx to avoid circular imports) ────────────────

type NatureType = "new_construction" | "existing_extension" | "outdoor";
type WorkType = "extension" | "change_destination" | "change_exterior";
type OutdoorLayout = "pool" | "fence_gate" | "other";

interface Job {
  id: string;
  nature: NatureType;
  levels: number;
  footprint: number;
  floorAreaEstimated: number;
  currentLivingArea?: number;
  workTypes?: WorkType[];
  outdoorLayout?: OutdoorLayout;
  poolSurfaceArea?: number;
  hasPoolEnclosure?: boolean;
  displayLabel?: string;
}

interface RoofEntry { roofShape: string; mainMaterial: string; tint: string; soffitCladding: string; }
interface GutterEntry { material: string; tint: string; }
interface FacadeEntry { coating: string; finishing: string; tint: string; }
interface JoineryEntry { materials: string; shutters: string; }
interface JobMaterials {
  roofs: RoofEntry[];
  gutters: GutterEntry[];
  facades: FacadeEntry[];
  joineries: JoineryEntry[];
  workDescription?: string;
  facadeModification?: boolean;
  linerColor?: string;
  copingStones?: string;
  shelterMaterials?: string;
}

interface ProjectContext {
  zone?: string;        // e.g. "UB", "UC1"
  address?: string;     // project address
  authType?: string;    // "DP" | "PC"
  isEn?: boolean;       // language toggle
}

// ─── Label maps ─────────────────────────────────────────────────────────────

const NATURE_LABELS: Record<NatureType, { en: string; fr: string }> = {
  new_construction: { en: "New Detached Construction", fr: "Construction Indépendante Neuve" },
  existing_extension: { en: "Work on Existing Building", fr: "Travaux sur Bâtiment Existant" },
  outdoor: { en: "Outdoor Installation", fr: "Aménagement Extérieur" },
};

const WORK_TYPE_LABELS: Record<WorkType, { en: string; fr: string }> = {
  extension: { en: "Extension / Addition", fr: "Extension / Agrandissement" },
  change_destination: { en: "Change of Use", fr: "Changement de Destination" },
  change_exterior: { en: "Exterior Modification", fr: "Modification de l'Aspect Extérieur" },
};

const OUTDOOR_LABELS: Record<OutdoorLayout, { en: string; fr: string }> = {
  pool: { en: "Swimming Pool", fr: "Piscine" },
  fence_gate: { en: "Fence / Gate", fr: "Clôture / Portail" },
  other: { en: "Other Outdoor Work", fr: "Autre Aménagement Extérieur" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function nonEmpty(s: string | undefined | null): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

function compileMaterials(mat: JobMaterials | undefined, isEn: boolean): string[] {
  if (!mat) return [];
  const lines: string[] = [];

  // Roofs
  for (const r of mat.roofs) {
    const parts = [r.mainMaterial, r.tint, r.roofShape, r.soffitCladding].filter(nonEmpty);
    if (parts.length > 0) {
      lines.push(`${isEn ? "Roof" : "Toiture"}: ${parts.join(", ")}`);
    }
  }
  // Facades
  for (const f of mat.facades) {
    const parts = [f.coating, f.finishing, f.tint].filter(nonEmpty);
    if (parts.length > 0) {
      lines.push(`${isEn ? "Facade" : "Façade"}: ${parts.join(", ")}`);
    }
  }
  // Joineries
  for (const j of mat.joineries) {
    const parts = [j.materials, j.shutters].filter(nonEmpty);
    if (parts.length > 0) {
      lines.push(`${isEn ? "Joinery" : "Menuiserie"}: ${parts.join(", ")}`);
    }
  }
  // Gutters
  for (const g of mat.gutters) {
    const parts = [g.material, g.tint].filter(nonEmpty);
    if (parts.length > 0) {
      lines.push(`${isEn ? "Gutters" : "Gouttières"}: ${parts.join(", ")}`);
    }
  }
  // Pool specifics
  if (nonEmpty(mat.linerColor)) lines.push(`${isEn ? "Pool liner" : "Liner piscine"}: ${mat.linerColor}`);
  if (nonEmpty(mat.copingStones)) lines.push(`${isEn ? "Coping stones" : "Margelles"}: ${mat.copingStones}`);
  if (nonEmpty(mat.shelterMaterials)) lines.push(`${isEn ? "Pool shelter" : "Abri piscine"}: ${mat.shelterMaterials}`);

  return lines;
}

// ─── Main compiler ──────────────────────────────────────────────────────────

export function compileProjectBrief(
  jobs: Job[],
  jobMaterials: Record<string, JobMaterials>,
  ctx: ProjectContext = {},
): string {
  const isEn = ctx.isEn ?? false;
  const sections: string[] = [];

  // ── Header ──
  const headerLines: string[] = [];
  headerLines.push(isEn ? "PROJECT SUMMARY" : "RÉSUMÉ DU PROJET");
  if (nonEmpty(ctx.address)) {
    headerLines.push(`${isEn ? "Address" : "Adresse"}: ${ctx.address}`);
  }
  if (nonEmpty(ctx.zone)) {
    headerLines.push(`${isEn ? "PLU zone" : "Zone PLU"}: ${ctx.zone}`);
  }
  if (nonEmpty(ctx.authType)) {
    const label = ctx.authType === "PC"
      ? (isEn ? "Building Permit (PC)" : "Permis de Construire (PC)")
      : (isEn ? "Prior Declaration (DP)" : "Déclaration Préalable (DP)");
    headerLines.push(`${isEn ? "Authorization" : "Autorisation"}: ${label}`);
  }
  sections.push(headerLines.join("\n"));

  // ── Jobs ──
  if (jobs.length === 0) {
    sections.push(isEn ? "No works defined yet." : "Aucun travaux défini.");
  } else {
    const jobBlocks: string[] = [];

    jobs.forEach((job, i) => {
      const lines: string[] = [];
      const label = job.displayLabel || NATURE_LABELS[job.nature]?.[isEn ? "en" : "fr"] || job.nature;
      lines.push(`${isEn ? "Task" : "Travaux"} ${i + 1}: ${label}`);

      // Nature & category
      const natureLbl = NATURE_LABELS[job.nature]?.[isEn ? "en" : "fr"];
      if (natureLbl && natureLbl !== label) {
        lines.push(`  ${isEn ? "Category" : "Catégorie"}: ${natureLbl}`);
      }

      // Dimensions
      if (job.footprint > 0) {
        lines.push(`  ${isEn ? "Footprint" : "Emprise au sol"}: ${fmt(job.footprint)}m²`);
      }
      if (job.floorAreaEstimated > 0) {
        lines.push(`  ${isEn ? "Floor area" : "Surface de plancher"}: ${fmt(job.floorAreaEstimated)}m²`);
      }
      if (job.levels > 1) {
        lines.push(`  ${isEn ? "Levels" : "Niveaux"}: ${job.levels}`);
      }

      // Work on existing specifics
      if (job.nature === "existing_extension") {
        if (job.currentLivingArea && job.currentLivingArea > 0) {
          lines.push(`  ${isEn ? "Existing living area" : "Surface habitable existante"}: ${fmt(job.currentLivingArea)}m²`);
        }
        if (job.workTypes && job.workTypes.length > 0) {
          const wLabels = job.workTypes
            .map(w => WORK_TYPE_LABELS[w]?.[isEn ? "en" : "fr"] || w)
            .join(", ");
          lines.push(`  ${isEn ? "Work types" : "Types de travaux"}: ${wLabels}`);
        }
      }

      // Outdoor specifics
      if (job.nature === "outdoor") {
        if (job.outdoorLayout) {
          lines.push(`  ${isEn ? "Type" : "Type"}: ${OUTDOOR_LABELS[job.outdoorLayout]?.[isEn ? "en" : "fr"] || job.outdoorLayout}`);
        }
        if (job.outdoorLayout === "pool") {
          if (job.poolSurfaceArea && job.poolSurfaceArea > 0) {
            lines.push(`  ${isEn ? "Pool area" : "Surface bassin"}: ${fmt(job.poolSurfaceArea)}m²`);
          }
          if (job.hasPoolEnclosure) {
            lines.push(`  ${isEn ? "Pool enclosure" : "Abri de piscine"}: ${isEn ? "Yes" : "Oui"}`);
          }
        }
      }

      // Materials
      const mat = jobMaterials[job.id];
      const matLines = compileMaterials(mat, isEn);
      if (matLines.length > 0) {
        lines.push(`  ${isEn ? "Materials" : "Matériaux"}:`);
        matLines.forEach(ml => lines.push(`    - ${ml}`));
      }

      jobBlocks.push(lines.join("\n"));
    });

    sections.push(jobBlocks.join("\n\n"));
  }

  // ── Totals row ──
  if (jobs.length > 0) {
    const totalFootprint = jobs.reduce((s, j) => s + (j.footprint || 0), 0);
    const totalFloor = jobs.reduce((s, j) => s + (j.floorAreaEstimated || 0), 0);
    if (totalFootprint > 0 || totalFloor > 0) {
      const totals: string[] = [];
      if (totalFootprint > 0) totals.push(`${isEn ? "Total footprint" : "Emprise totale"}: ${fmt(totalFootprint)}m²`);
      if (totalFloor > 0) totals.push(`${isEn ? "Total floor area" : "Surface de plancher totale"}: ${fmt(totalFloor)}m²`);
      sections.push(totals.join(" | "));
    }
  }

  // ── AI instruction ──
  sections.push(
    isEn
      ? "Please analyze the provided PLU regulation document to verify whether this project complies with the applicable zoning rules."
      : "Veuillez analyser le document de règlement PLU fourni pour vérifier la conformité de ce projet avec les règles de zonage applicables.",
  );

  return sections.join("\n\n");
}
