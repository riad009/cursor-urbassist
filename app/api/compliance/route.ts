import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  CONSTRUCTION_TYPE_RULES,
  PRESET_TO_CONSTRUCTION_TYPE,
  resolveSetback,
  resolveMaxHeight,
  type ConstructionType,
} from "@/lib/constructionTypes";

// Real-time compliance checking API - Section 3.2 of specifications
// Checks drawn elements against PLU regulations — Phase 5: per-construction-type rules

interface ComplianceCheck {
  rule: string;
  status: "compliant" | "violation" | "warning";
  message: string;
  details: string;
  suggestion?: string;
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { projectId, elements, parcelBounds } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId required" },
        { status: 400 }
      );
    }

    // Get project with regulatory analysis and protected areas
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: { regulatoryAnalysis: true, sitePlanData: true, protectedAreas: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const rules = (project.regulatoryAnalysis?.aiAnalysis as Record<
      string,
      unknown
    >) || {};
    const zoneLabel = (project.regulatoryAnalysis?.zoneType as string) || "PLU";
    const parcelArea = project.parcelArea || 500;
    const maxCoverageRatio = (rules.maxCoverageRatio as number) ?? 0.5;
    const maxCoverage = maxCoverageRatio * 100;

    const pluMaxHeight = (rules.maxHeight as number) || 10;
    const minGreenPct = parseGreenPct(rules.greenSpaceRequirements as string | undefined) ?? 20;
    const pluSetbacks = (rules.setbacks as {
      front?: number;
      side?: number;
      rear?: number;
    }) || { front: 5, side: 3, rear: 4 };
    const parkingReq = (rules.parkingRequirements as string) || "1 place per 60m²";

    const checks: ComplianceCheck[] = [];

    if (!elements || !Array.isArray(elements)) {
      return NextResponse.json({
        success: true,
        checks: [
          {
            rule: "No elements",
            status: "warning",
            message: "No elements to check",
            details: "Draw building elements to check compliance.",
          },
        ],
      });
    }

    // ── Phase 5: helper to resolve constructionType from element ──────────────
    type ElementIn = {
      type?: string;
      category?: string;
      templateType?: string;
      constructionType?: string;
      surfaceType?: string;
      area?: number;
      width?: number;
      height?: number;
      height3d?: number;
      left?: number;
      top?: number;
      name?: string;
    };

    function getConstructionType(el: ElementIn): ConstructionType {
      // Direct assignment wins (placed via GuidedCreation with constructionType set)
      if (el.constructionType && el.constructionType in CONSTRUCTION_TYPE_RULES) {
        return el.constructionType as ConstructionType;
      }
      // Fall back to preset lookup
      const presetId = el.templateType;
      if (presetId && presetId in PRESET_TO_CONSTRUCTION_TYPE) {
        return PRESET_TO_CONSTRUCTION_TYPE[presetId];
      }
      // Pool surfaceType override
      if (el.category === "pool" || el.templateType === "pool") return "pool";
      return "main_house";
    }

    // ── Separate buildings from pools (different CES rules) ──────────────────
    const allBuildingEls = (elements as ElementIn[]).filter(
      (e) => e.category === "building" || e.type === "rect" || e.type === "polygon"
    );

    // Pools excluded from CES per type rule
    const cesBuildings = allBuildingEls.filter((e) => {
      const ct = getConstructionType(e);
      return CONSTRUCTION_TYPE_RULES[ct].countInCES;
    });

    const maxFootprintM2 = parcelArea * maxCoverageRatio;
    const totalBuiltArea = cesBuildings.reduce(
      (sum, b) => sum + (b.area || (b.width || 0) * (b.height || 0)),
      0
    );
    const coverageRatio = (totalBuiltArea / parcelArea) * 100;

    // 1. Coverage check (CES) — pools excluded
    checks.push({
      rule: "Coverage Ratio (CES)",
      status:
        coverageRatio > maxCoverage
          ? "violation"
          : coverageRatio > maxCoverage * 0.9
            ? "warning"
            : "compliant",
      message:
        coverageRatio > maxCoverage
          ? `Coverage ${coverageRatio.toFixed(1)}% exceeds maximum ${maxCoverage}% (max ${maxFootprintM2.toFixed(0)}m²)`
          : `Coverage ${coverageRatio.toFixed(1)}% within limit of ${maxCoverage}%`,
      details: `Built area (excl. pools): ${totalBuiltArea.toFixed(1)}m² / Max: ${maxFootprintM2.toFixed(0)}m² (parcel ${parcelArea}m² × CES ${maxCoverageRatio})`,
      suggestion:
        totalBuiltArea > maxFootprintM2
          ? `Reduce built area by ${(totalBuiltArea - maxFootprintM2).toFixed(1)}m²`
          : undefined,
    });

    // 2. Height checks — per-type max height
    for (const building of allBuildingEls) {
      const bHeight3d = building.height3d || 0;
      if (bHeight3d > 0) {
        const ct = getConstructionType(building);
        const effectiveMaxHeight = resolveMaxHeight(ct, pluMaxHeight);
        const typeRule = CONSTRUCTION_TYPE_RULES[ct];
        checks.push({
          rule: `Maximum Height — ${typeRule.label}`,
          status:
            bHeight3d > effectiveMaxHeight
              ? "violation"
              : bHeight3d > effectiveMaxHeight * 0.9
                ? "warning"
                : "compliant",
          message:
            bHeight3d > effectiveMaxHeight
              ? `Height ${bHeight3d}m exceeds ${typeRule.label} max of ${effectiveMaxHeight}m`
              : `Height ${bHeight3d}m within ${typeRule.label} limit of ${effectiveMaxHeight}m`,
          details: `"${building.name || typeRule.label}" height: ${bHeight3d}m / Type max: ${effectiveMaxHeight}m${typeRule.maxHeight !== null ? ` (type rule)` : ` (PLU zone)`}`,
          suggestion:
            bHeight3d > effectiveMaxHeight
              ? `Reduce height by ${(bHeight3d - effectiveMaxHeight).toFixed(1)}m`
              : undefined,
        });
      }
    }

    // 3. Setback checks — per-type overrides (shed/carport/annex → 0m side/rear OK)
    if (parcelBounds) {
      for (const building of allBuildingEls) {
        const b = building;
        const ct = getConstructionType(b);
        const typeRule = CONSTRUCTION_TYPE_RULES[ct];

        const bLeft = b.left || 0;
        const bTop = b.top || 0;
        const bWidth = b.width || 0;
        const bHeight = b.height || 0;
        const buildingHeightM = b.height3d || 0;

        // Resolve effective setbacks via type rule (overrides PLU zone value)
        const frontSetback = resolveSetback("front", ct, pluSetbacks.front ?? 5);
        const rawSide = resolveSetback("side", ct, pluSetbacks.side ?? 3);
        const rawRear = resolveSetback("rear", ct, pluSetbacks.rear ?? 4);

        // Height-dependent adjustment (only for types that use PLU setback)
        const requiredSide = typeRule.setbacks.side !== null
          ? rawSide // type override: use exactly
          : Math.max(rawSide, buildingHeightM > 0 ? buildingHeightM / 2 : 0);
        const requiredRear = typeRule.setbacks.rear !== null
          ? rawRear
          : Math.max(rawRear, buildingHeightM > 0 ? buildingHeightM * 0.25 : 0);

        const distFront = parcelBounds.front !== undefined ? Math.abs(bTop - parcelBounds.front) : null;
        const distLeft = parcelBounds.left !== undefined ? Math.abs(bLeft - parcelBounds.left) : null;
        const distRight = parcelBounds.right !== undefined ? Math.abs(bLeft + bWidth - parcelBounds.right) : null;
        const distRear = parcelBounds.rear !== undefined ? Math.abs(bTop + bHeight - parcelBounds.rear) : null;

        const typeSuffix = typeRule.label !== "Main house" ? ` (${typeRule.label})` : "";

        if (distFront !== null && distFront < frontSetback) {
          checks.push({
            rule: `Front Setback${typeSuffix}`,
            status: "violation",
            message: `Distance: ${distFront.toFixed(1)}m — minimum ${frontSetback}m required`,
            details: `"${b.name || typeRule.label}" is ${distFront.toFixed(1)}m from front boundary. Min: ${frontSetback}m (zone ${zoneLabel})`,
            suggestion: `Move ${(frontSetback - distFront).toFixed(1)}m back from front boundary`,
          });
        }

        if (distLeft !== null && requiredSide > 0 && distLeft < requiredSide) {
          checks.push({
            rule: `Side Setback Left${typeSuffix}`,
            status: "violation",
            message: `Distance: ${distLeft.toFixed(1)}m — minimum ${requiredSide.toFixed(1)}m required`,
            details: `"${b.name || typeRule.label}" is ${distLeft.toFixed(1)}m from left boundary. Min: ${requiredSide.toFixed(1)}m`,
            suggestion: `Move ${(requiredSide - distLeft).toFixed(1)}m from left boundary`,
          });
        } else if (distLeft !== null && requiredSide === 0 && distLeft >= 0) {
          // Type allows boundary — show as info/compliant, no push needed
        }

        if (distRight !== null && requiredSide > 0 && distRight < requiredSide) {
          checks.push({
            rule: `Side Setback Right${typeSuffix}`,
            status: "violation",
            message: `Distance: ${distRight.toFixed(1)}m — minimum ${requiredSide.toFixed(1)}m required`,
            details: `"${b.name || typeRule.label}" is ${distRight.toFixed(1)}m from right boundary. Min: ${requiredSide.toFixed(1)}m`,
            suggestion: `Move ${(requiredSide - distRight).toFixed(1)}m from right boundary`,
          });
        }

        if (distRear !== null && requiredRear > 0 && distRear < requiredRear) {
          checks.push({
            rule: `Rear Setback${typeSuffix}`,
            status: "violation",
            message: `Distance: ${distRear.toFixed(1)}m — minimum ${requiredRear.toFixed(1)}m required`,
            details: `"${b.name || typeRule.label}" is ${distRear.toFixed(1)}m from rear boundary. Min: ${requiredRear.toFixed(1)}m`,
            suggestion: `Move ${(requiredRear - distRear).toFixed(1)}m from rear boundary`,
          });
        }
      }
    }

    // ── Phase 5: Permit threshold checks (per-type exemptions) ───────────────
    for (const building of allBuildingEls) {
      const ct = getConstructionType(building);
      const typeRule = CONSTRUCTION_TYPE_RULES[ct];
      if (typeRule.exemptUpToM2 === null) continue; // no threshold for main house etc.

      const elArea = building.area || ((building.width || 0) * (building.height || 0));
      if (elArea <= 0) continue;

      const isExempt = elArea <= typeRule.exemptUpToM2;
      const requiresPermit = !isExempt && typeRule.permitAboveExempt;

      checks.push({
        rule: `Permit Threshold — ${typeRule.label}`,
        status: isExempt ? "compliant" : "warning",
        message: isExempt
          ? `${typeRule.label} ${elArea.toFixed(1)}m² ≤ ${typeRule.exemptUpToM2}m² — no permit required`
          : `${typeRule.label} ${elArea.toFixed(1)}m² > ${typeRule.exemptUpToM2}m² — ${requiresPermit} required`,
        details: typeRule.note,
        suggestion: !isExempt ? `Verify permit requirement with mairie (${typeRule.permitAboveExempt})` : undefined,
      });
    }

    // 4. Green space check
    const greenAreas = (elements as ElementIn[]).filter(
      (e) => e.category === "vegetation" || e.surfaceType === "green"
    );
    const totalGreen = greenAreas.reduce((sum, g) => sum + (g.area || 0), 0);
    const greenPct = (totalGreen / parcelArea) * 100;

    checks.push({
      rule: "Green Space",
      status:
        greenPct < minGreenPct
          ? "violation"
          : greenPct < minGreenPct * 1.1
            ? "warning"
            : "compliant",
      message:
        greenPct < minGreenPct
          ? `Green space ${greenPct.toFixed(1)}% below minimum ${minGreenPct}%`
          : `Green space ${greenPct.toFixed(1)}% meets minimum ${minGreenPct}%`,
      details: `Green area: ${totalGreen.toFixed(1)}m² / Required: ${((parcelArea * minGreenPct) / 100).toFixed(1)}m²`,
      suggestion:
        greenPct < minGreenPct
          ? `Add ${((parcelArea * minGreenPct) / 100 - totalGreen).toFixed(1)}m² of green space`
          : undefined,
    });

    // 5. Parking check
    const parkingSpaces = (elements as ElementIn[]).filter(
      (e) => e.category === "parking" || e.templateType === "parking"
    );
    const totalFloorArea = totalBuiltArea * 1.5; // Approximate multi-story
    const requiredParkingMatch = parkingReq.match(/(\d+)\s*place.*?(\d+)\s*m/i);
    const requiredParking = requiredParkingMatch
      ? Math.ceil(totalFloorArea / parseInt(requiredParkingMatch[2]))
      : 2;

    checks.push({
      rule: "Parking Requirements",
      status: parkingSpaces.length < requiredParking ? "violation" : "compliant",
      message:
        parkingSpaces.length < requiredParking
          ? `${parkingSpaces.length} parking spaces, need ${requiredParking}`
          : `${parkingSpaces.length} parking spaces (${requiredParking} required)`,
      details: `Based on: ${parkingReq}`,
      suggestion:
        parkingSpaces.length < requiredParking
          ? `Add ${requiredParking - parkingSpaces.length} more parking space(s) (2.50m x 5.00m each)`
          : undefined,
    });

    // 6. Protected areas (ABF, heritage, classified)
    const highSeverity = project.protectedAreas?.filter(
      (a: { type: string }) => a.type === "ABF" || a.type === "HERITAGE" || a.type === "CLASSIFIED"
    ) || [];
    for (const area of highSeverity) {
      const pa = area as { type: string; name: string; description?: string; constraints?: unknown };
      checks.push({
        rule: `Protected area: ${pa.type}`,
        status: "warning",
        message: pa.name,
        details: (pa.description as string) || "Additional approvals may be required (e.g. ABF).",
        suggestion: "Verify with mairie and ABF if applicable.",
      });
    }

    // Save compliance results
    if (project.sitePlanData) {
      await prisma.sitePlanData.update({
        where: { projectId },
        data: { complianceResults: JSON.parse(JSON.stringify(checks)) },
      });
    }

    const violations = checks.filter((c) => c.status === "violation").length;
    const warnings = checks.filter((c) => c.status === "warning").length;
    const compliant = checks.filter((c) => c.status === "compliant").length;

    return NextResponse.json({
      success: true,
      checks,
      summary: {
        total: checks.length,
        violations,
        warnings,
        compliant,
        isCompliant: violations === 0,
      },
    });
  } catch (error) {
    console.error("Compliance check error:", error);
    return NextResponse.json(
      { error: "Compliance check failed" },
      { status: 500 }
    );
  }
}

function parseGreenPct(s: string | undefined): number | null {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/(\d+)\s*%|minimum\s*(\d+)|(\d+)\s*%\s*of|(\d+)\s*%\s*du/);
  if (m) {
    const n = parseInt(m[1] || m[2] || m[3] || m[4] || "0", 10);
    return n >= 0 && n <= 100 ? n : null;
  }
  return null;
}
