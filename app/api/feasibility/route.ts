import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { projectId, questionnaire } = await request.json();
    if (!projectId || !questionnaire) {
      return NextResponse.json(
        { error: "projectId and questionnaire required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      include: { regulatoryAnalysis: true },
    });
    if (!project)
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );

    const rules =
      (project.regulatoryAnalysis?.aiAnalysis as Record<string, unknown>) || {};
    const maxHeight = (rules.maxHeight as number) || 10;
    const maxCoverage = ((rules.maxCoverageRatio as number) || 0.5) * 100;
    const minGreen = 20;
    const setbacks = (rules.setbacks as {
      front?: number;
      side?: number;
      rear?: number;
    }) || { front: 5, side: 3, rear: 4 };
    const parkingReq =
      (rules.parkingRequirements as string) || "1 place per 60m²";

    const footprint = Number(questionnaire.footprint) || 0;
    const existingFootprint = Number(questionnaire.existingFootprint) || 0;
    const totalFootprint = footprint + existingFootprint;
    const parcelArea = project.parcelArea || 500;
    const coverage =
      parcelArea > 0 ? (totalFootprint / parcelArea) * 100 : 0;
    const greenPct = questionnaire.greenArea
      ? (Number(questionnaire.greenArea) / parcelArea) * 100
      : 0;
    const height = Number(questionnaire.height) || 0;

    const violations: string[] = [];
    const compliant: string[] = [];
    const adaptations: string[] = [];

    // Height check
    if (height > 0) {
      if (height > maxHeight) {
        violations.push(
          `Height ${height}m exceeds maximum ${maxHeight}m allowed`
        );
        adaptations.push(
          `Reduce height by ${(height - maxHeight).toFixed(1)}m or modify roof design`
        );
      } else {
        compliant.push(
          `Height ${height}m is within the ${maxHeight}m limit`
        );
      }
    }

    // Coverage check
    if (footprint > 0) {
      if (coverage > maxCoverage) {
        violations.push(
          `Coverage ${coverage.toFixed(1)}% exceeds maximum ${maxCoverage}%`
        );
        adaptations.push(
          `Reduce footprint by ${(totalFootprint - (parcelArea * maxCoverage) / 100).toFixed(1)}m²`
        );
      } else {
        compliant.push(
          `Coverage ${coverage.toFixed(1)}% within limit of ${maxCoverage}%`
        );
      }
    }

    // Green space check
    if (questionnaire.greenArea) {
      if (greenPct < minGreen && parcelArea > 0) {
        violations.push(
          `Green space ${greenPct.toFixed(1)}% below minimum ${minGreen}%`
        );
        adaptations.push(
          `Add ${((parcelArea * minGreen) / 100 - Number(questionnaire.greenArea)).toFixed(1)}m² of landscaped area`
        );
      } else {
        compliant.push(
          `Green space ${greenPct.toFixed(1)}% meets minimum ${minGreen}%`
        );
      }
    }

    // Setback checks
    if (questionnaire.distFront) {
      const dist = Number(questionnaire.distFront);
      if (dist < (setbacks.front || 5)) {
        violations.push(
          `Front setback ${dist}m is less than required ${setbacks.front || 5}m`
        );
        adaptations.push(
          `Move building ${((setbacks.front || 5) - dist).toFixed(1)}m back from road`
        );
      } else {
        compliant.push(
          `Front setback ${dist}m meets ${setbacks.front || 5}m requirement`
        );
      }
    }

    if (questionnaire.distSide) {
      const dist = Number(questionnaire.distSide);
      if (dist < (setbacks.side || 3)) {
        violations.push(
          `Side setback ${dist}m is less than required ${setbacks.side || 3}m`
        );
        const heightDependent = height > 0 ? ` (height-dependent rule: H/2 = ${(height / 2).toFixed(1)}m may apply)` : "";
        adaptations.push(
          `Increase side distance to at least ${setbacks.side || 3}m${heightDependent}`
        );
      } else {
        compliant.push(
          `Side setback ${dist}m meets ${setbacks.side || 3}m requirement`
        );
      }
    }

    if (questionnaire.distRear) {
      const dist = Number(questionnaire.distRear);
      if (dist < (setbacks.rear || 4)) {
        violations.push(
          `Rear setback ${dist}m is less than required ${setbacks.rear || 4}m`
        );
        adaptations.push(
          `Increase rear distance to at least ${setbacks.rear || 4}m`
        );
      } else {
        compliant.push(
          `Rear setback ${dist}m meets ${setbacks.rear || 4}m requirement`
        );
      }
    }

    // Parking check
    if (questionnaire.parkingSpaces) {
      const spaces = Number(questionnaire.parkingSpaces);
      const floorArea = footprint * (Number(questionnaire.floors) || 1);
      const requiredMatch = parkingReq.match(/(\d+)\s*place.*?(\d+)\s*m/i);
      const required = requiredMatch
        ? Math.ceil(floorArea / parseInt(requiredMatch[2]))
        : 2;

      if (spaces < required) {
        violations.push(
          `${spaces} parking space(s) insufficient - ${required} required (${parkingReq})`
        );
        adaptations.push(
          `Add ${required - spaces} more parking space(s) (2.50m x 5.00m each)`
        );
      } else {
        compliant.push(
          `${spaces} parking space(s) meets requirement of ${required}`
        );
      }
    }

    const isFeasible = violations.length === 0;
    const conditions = [...compliant, ...violations];

    const reportLines = [
      `Feasibility Analysis Report`,
      `Project: ${project.name}`,
      `Date: ${new Date().toLocaleDateString("fr-FR")}`,
      ``,
      `Result: ${isFeasible ? "FEASIBLE" : "ADJUSTMENTS REQUIRED"}`,
      ``,
      `Compliant Items (${compliant.length}):`,
      ...compliant.map((c) => `  ✓ ${c}`),
      ``,
    ];

    if (violations.length > 0) {
      reportLines.push(
        `Violations (${violations.length}):`,
        ...violations.map((v) => `  ✗ ${v}`),
        ``,
        `Suggested Adaptations:`,
        ...adaptations.map((a, i) => `  ${i + 1}. ${a}`)
      );
    }

    const report = reportLines.join("\n");

    await prisma.feasibilityReport.upsert({
      where: { projectId },
      create: {
        projectId,
        questionnaireData: questionnaire,
        isFeasible,
        conditions,
        adaptations: adaptations.length > 0 ? adaptations : undefined,
        report,
      },
      update: {
        questionnaireData: questionnaire,
        isFeasible,
        conditions,
        adaptations: adaptations.length > 0 ? adaptations : undefined,
        report,
      },
    });

    return NextResponse.json({
      isFeasible,
      conditions,
      adaptations,
      report,
      summary: {
        compliant: compliant.length,
        violations: violations.length,
      },
    });
  } catch (error) {
    console.error("Feasibility:", error);
    return NextResponse.json(
      { error: "Feasibility check failed" },
      { status: 500 }
    );
  }
}
