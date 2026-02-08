/**
 * Structure for the "ANALYSE DE LA REGLEMENTATION" export report.
 * Matches the template: project situation, regulation sections (regulation / conformity / recommendations), conclusion with DP/PC.
 */

export interface ReportSituation {
  projectAddress: string;
  zoneName: string;
  regulationType: string;
  lotissement: string;
  zoneAbf: string;
}

export interface ReportRow {
  regulation: string;
  conformite: string;
  recommandations?: string;
}

export interface RegulatoryReport {
  title: string;
  situation: ReportSituation;
  usageDesSols: ReportRow[];
  caracteristiques: ReportRow[];
  traitementEnvironnemental: ReportRow[];
  stationnement: ReportRow[];
  accessVoiries: ReportRow[];
  pprn: ReportRow[];
  conclusion: {
    conforme: boolean;
    message: string;
    recommendation: string;
    typeDossier: "DP" | "PC" | "ARCHITECT_REQUIRED";
    justification: string;
  };
  generatedAt: string;
}

const STORAGE_KEY = "urbassist_regulatory_report";

export function saveReportToSession(report: RegulatoryReport): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(report));
  } catch {
    // ignore
  }
}

export function loadReportFromSession(): RegulatoryReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Map analysis results (from regulations page) + optional address/zone/determination to the report structure */
export function buildReportFromAnalysis(
  opts: {
    results: Array<{
      category: string;
      title: string;
      status: string;
      value: string;
      requirement: string;
      recommendation?: string;
      zoneLabel?: string;
    }>;
    address?: string;
    zoneName?: string;
    determination?: { type: "DP" | "PC" | "ARCHITECT_REQUIRED"; justification?: string };
  }
): RegulatoryReport {
  const { results, address = "", zoneName = "", determination } = opts;
  const zone = zoneName || results.find((r) => r.zoneLabel)?.zoneLabel || "—";

  const toConformite = (status: string) => {
    if (status === "compliant" || status === "info") return "OUI";
    if (status === "violation") return "NON";
    return "À vérifier";
  };

  const caracteristiques: ReportRow[] = results
    .filter((r) => ["Height", "Setback", "Coverage", "Distance", "Architectural"].includes(r.category) || r.category === "Zone")
    .map((r) => ({
      regulation: r.requirement,
      conformite: toConformite(r.status),
      recommandations: r.recommendation,
    }));

  if (caracteristiques.length === 0) {
    caracteristiques.push({
      regulation: "Analyse non disponible. Uploadez un document PLU ou sélectionnez une adresse.",
      conformite: "—",
      recommandations: "Complétez l’analyse depuis l’onglet AI Analysis.",
    });
  }

  const stationnement: ReportRow[] = results
    .filter((r) => r.category === "Parking")
    .map((r) => ({
      regulation: r.requirement,
      conformite: toConformite(r.status),
      recommandations: r.recommendation,
    }));
  if (stationnement.length === 0) {
    stationnement.push({ regulation: "Non renseigné (voir PLU)", conformite: "—" });
  }

  const greenSpace = results.filter((r) => r.category === "Green Space");
  const traitementEnvironnemental: ReportRow[] = greenSpace.length
    ? greenSpace.map((r) => ({
        regulation: r.requirement,
        conformite: toConformite(r.status),
        recommandations: r.recommendation,
      }))
    : [{ regulation: "Non réglementé", conformite: "OUI" }];

  const hasViolation = results.some((r) => r.status === "violation");
  const typeDossier = determination?.type ?? (hasViolation ? "PC" : "DP");
  const justification =
    determination?.justification ??
    (typeDossier === "ARCHITECT_REQUIRED"
      ? "Projet soumis à l’obligation de recourir à un architecte (L.431-1)."
      : typeDossier === "PC"
        ? "Nouvelles constructions d’emprise au sol supérieure à 20 m² ou extension dépassant les seuils DP."
        : "Projet relevant de la déclaration préalable (seuils et zone respectés).");

  return {
    title: "ANALYSE DE LA RÉGLEMENTATION",
    situation: {
      projectAddress: address || "—",
      zoneName: zone,
      regulationType: "PLU",
      lotissement: "NON",
      zoneAbf: "Non renseigné",
    },
    usageDesSols: [
      { regulation: "Le projet fait-il partie des destinations ou sous-destinations interdites ?", conformite: "NON" },
      { regulation: "Existe-t-il des interdictions ou limitations de certains usages pouvant affecter le projet ?", conformite: "NON" },
    ],
    caracteristiques,
    traitementEnvironnemental,
    stationnement,
    accessVoiries: [
      { regulation: "Conditions de desserte des terrains par les voies et d'accès aux voies ouvertes au public", conformite: "OUI" },
      { regulation: "Conditions de desserte par les réseaux (eau, électricité, assainissement, télécommunication)", conformite: "OUI" },
    ],
    pprn: [{ regulation: "Plan de prévention des risques naturels", conformite: "OUI" }],
    conclusion: {
      conforme: !hasViolation,
      message: hasViolation
        ? "Votre projet semble ne pas être « Conforme » à la réglementation en vigueur."
        : "Votre projet semble conforme aux points analysés. Vérifiez auprès de votre mairie.",
      recommendation: results.find((r) => r.recommendation)?.recommendation || "Consultez le PLU complet et la mairie pour valider tous les points.",
      typeDossier,
      justification,
    },
    generatedAt: new Date().toISOString(),
  };
}
