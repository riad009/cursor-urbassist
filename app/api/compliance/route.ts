import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Real-time compliance checking API - Section 3.2 of specifications
// Checks drawn elements against PLU regulations

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
    const parcelArea = project.parcelArea || 500;
    const maxCoverageRatio = (rules.maxCoverageRatio as number) ?? 0.5;
    const maxCoverage = maxCoverageRatio * 100;
    const maxFootprintM2 = parcelArea * maxCoverageRatio; // CES × parcel area

    const maxHeight = (rules.maxHeight as number) || 10;
    const minGreenPct = parseGreenPct(rules.greenSpaceRequirements as string | undefined) ?? 20;
    const setbacks = (rules.setbacks as {
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

    // Calculate total built area
    const buildings = elements.filter(
      (e: { category?: string; type?: string }) =>
        e.category === "building" || e.type === "rect" || e.type === "polygon"
    );
    const totalBuiltArea = buildings.reduce(
      (sum: number, b: { area?: number; width?: number; height?: number }) =>
        sum + (b.area || (b.width || 0) * (b.height || 0)),
      0
    );
    const coverageRatio = (totalBuiltArea / parcelArea) * 100;

    // 1. Coverage check (max footprint = CES × parcel area from PLU)
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
          ? `Coverage ${coverageRatio.toFixed(1)}% exceeds maximum ${maxCoverage}% (max footprint ${maxFootprintM2.toFixed(0)}m²)`
          : `Coverage ${coverageRatio.toFixed(1)}% within limit of ${maxCoverage}%`,
      details: `Built: ${totalBuiltArea.toFixed(1)}m² / Max: ${maxFootprintM2.toFixed(0)}m² (parcel ${parcelArea}m² × CES ${maxCoverageRatio})`,
      suggestion:
        totalBuiltArea > maxFootprintM2
          ? `Reduce built area by ${(totalBuiltArea - maxFootprintM2).toFixed(1)}m²`
          : undefined,
    });

    // 2. Height checks
    for (const building of buildings) {
      const bHeight = (building as { height3d?: number }).height3d || 0;
      if (bHeight > 0) {
        checks.push({
          rule: "Maximum Height",
          status:
            bHeight > maxHeight
              ? "violation"
              : bHeight > maxHeight * 0.9
                ? "warning"
                : "compliant",
          message:
            bHeight > maxHeight
              ? `Height ${bHeight}m exceeds maximum ${maxHeight}m`
              : `Height ${bHeight}m within limit of ${maxHeight}m`,
          details: `Element "${(building as { name?: string }).name || "Building"}" height: ${bHeight}m / Max: ${maxHeight}m`,
          suggestion:
            bHeight > maxHeight
              ? `Reduce height by ${(bHeight - maxHeight).toFixed(1)}m`
              : undefined,
        });
      }
    }

    // 3. Setback checks with height-dependent rules (e.g. side setback = max(fixed, H/2))
    if (parcelBounds) {
      for (const building of buildings) {
        const b = building as {
          left?: number;
          top?: number;
          width?: number;
          height?: number;
          name?: string;
          height3d?: number;
        };
        const bLeft = b.left || 0;
        const bTop = b.top || 0;
        const bWidth = b.width || 0;
        const bHeight = b.height || 0;
        const buildingHeightM = b.height3d || 0;
        const requiredSide = Math.max(
          setbacks.side ?? 3,
          buildingHeightM > 0 ? buildingHeightM / 2 : 0
        );
        const requiredRear = Math.max(
          setbacks.rear ?? 4,
          buildingHeightM > 0 ? buildingHeightM * 0.25 : 0
        );

        const distFront =
          parcelBounds.front !== undefined
            ? Math.abs(bTop - parcelBounds.front)
            : null;
        const distLeft =
          parcelBounds.left !== undefined
            ? Math.abs(bLeft - parcelBounds.left)
            : null;
        const distRight =
          parcelBounds.right !== undefined
            ? Math.abs(bLeft + bWidth - parcelBounds.right)
            : null;
        const distRear =
          parcelBounds.rear !== undefined
            ? Math.abs(bTop + bHeight - parcelBounds.rear)
            : null;

        if (distFront !== null && distFront < (setbacks.front ?? 5)) {
          checks.push({
            rule: "Front Setback",
            status: "violation",
            message: `Front setback ${distFront.toFixed(1)}m is less than required ${setbacks.front}m`,
            details: `"${b.name || "Building"}" is ${distFront.toFixed(1)}m from front boundary`,
            suggestion: `Move building ${((setbacks.front ?? 5) - distFront).toFixed(1)}m back from front boundary`,
          });
        }

        if (distLeft !== null && distLeft < requiredSide) {
          checks.push({
            rule: "Side Setback (Left)",
            status: "violation",
            message: `Side setback ${distLeft.toFixed(1)}m is less than required ${requiredSide.toFixed(1)}m${buildingHeightM > 0 ? ` (max of ${setbacks.side}m and H/2=${(buildingHeightM / 2).toFixed(1)}m)` : ""}`,
            details: `"${b.name || "Building"}" is ${distLeft.toFixed(1)}m from left boundary`,
            suggestion: `Move building ${(requiredSide - distLeft).toFixed(1)}m from left boundary`,
          });
        }

        if (distRight !== null && distRight < requiredSide) {
          checks.push({
            rule: "Side Setback (Right)",
            status: "violation",
            message: `Side setback ${distRight.toFixed(1)}m is less than required ${requiredSide.toFixed(1)}m`,
            details: `"${b.name || "Building"}" is ${distRight.toFixed(1)}m from right boundary`,
            suggestion: `Move building ${(requiredSide - distRight).toFixed(1)}m from right boundary`,
          });
        }

        if (distRear !== null && distRear < requiredRear) {
          checks.push({
            rule: "Rear Setback",
            status: "violation",
            message: `Rear setback ${distRear.toFixed(1)}m is less than required ${requiredRear.toFixed(1)}m`,
            details: `"${b.name || "Building"}" is ${distRear.toFixed(1)}m from rear boundary`,
            suggestion: `Move building ${(requiredRear - distRear).toFixed(1)}m from rear boundary`,
          });
        }
      }
    }

    // 4. Green space check
    const greenAreas = elements.filter(
      (e: { category?: string; surfaceType?: string }) =>
        e.category === "vegetation" || e.surfaceType === "green"
    );
    const totalGreen = greenAreas.reduce(
      (sum: number, g: { area?: number }) => sum + (g.area || 0),
      0
    );
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
    const parkingSpaces = elements.filter(
      (e: { category?: string; templateType?: string }) =>
        e.category === "parking" || e.templateType === "parking"
    );
    const totalFloorArea = totalBuiltArea * 1.5; // Approximate multi-story
    const requiredParkingMatch = parkingReq.match(/(\d+)\s*place.*?(\d+)\s*m/i);
    const requiredParking = requiredParkingMatch
      ? Math.ceil(totalFloorArea / parseInt(requiredParkingMatch[2]))
      : 2;

    checks.push({
      rule: "Parking Requirements",
      status:
        parkingSpaces.length < requiredParking
          ? "violation"
          : "compliant",
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

    // 6. Protected areas (ABF, heritage, classified) – inform and constrain
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
