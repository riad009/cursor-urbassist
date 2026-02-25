import { NextRequest, NextResponse } from "next/server";
import { getSession, isUnrestrictedAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS, getPluAnalysisCost } from "@/lib/credit-costs";

/**
 * POST /api/credits/spend
 * Atomically spend credits for a billable action.
 *
 * Body: { projectId: string, type: "plu_analysis" }
 *
 * Returns: { success, creditsSpent, creditsRemaining, pluAnalysisCount? }
 */
export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { projectId, type } = await request.json();

    if (type === "plu_analysis") {
      if (!projectId) {
        return NextResponse.json(
          { error: "projectId is required for PLU analysis" },
          { status: 400 }
        );
      }

      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: user.id },
      });
      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      const cost = getPluAnalysisCost(project.pluAnalysisCount);
      const isRelaunch = project.pluAnalysisCount > 0;

      // Admin bypass
      if (isUnrestrictedAdmin(user)) {
        await prisma.project.update({
          where: { id: projectId },
          data: {
            pluAnalysisCount: { increment: 1 },
            paidAt: project.paidAt ?? new Date(),
          },
        });
        return NextResponse.json({
          success: true,
          creditsSpent: 0,
          creditsRemaining: user.credits,
          pluAnalysisCount: project.pluAnalysisCount + 1,
          isRelaunch,
        });
      }

      // Check sufficient credits
      // Re-fetch for latest balance (getSession may be cached)
      const freshUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { credits: true },
      });
      const currentCredits = freshUser?.credits ?? user.credits;

      if (currentCredits < cost) {
        return NextResponse.json(
          {
            error: "Insufficient credits",
            code: "INSUFFICIENT_CREDITS",
            creditsNeeded: cost,
            creditsAvailable: currentCredits,
            creditsShort: cost - currentCredits,
          },
          { status: 402 }
        );
      }

      // Atomic transaction: deduct credits + mark project paid + audit trail
      const result = await prisma.$transaction(async (tx) => {
        // Deduct credits
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: { credits: { decrement: cost } },
          select: { credits: true },
        });

        // Ensure credits didn't go negative (race condition guard)
        if (updatedUser.credits < 0) {
          throw new Error("INSUFFICIENT_CREDITS_RACE");
        }

        // Mark project as paid + increment analysis count
        const updatedProject = await tx.project.update({
          where: { id: projectId },
          data: {
            pluAnalysisCount: { increment: 1 },
            paidAt: project.paidAt ?? new Date(),
          },
          select: { pluAnalysisCount: true },
        });

        // Audit trail
        await tx.creditTransaction.create({
          data: {
            userId: user.id,
            amount: -cost,
            type: isRelaunch ? "PLU_ANALYSIS_RELAUNCH" : "PLU_ANALYSIS",
            description: isRelaunch
              ? `PLU analysis relaunch for "${project.name?.slice(0, 40) || projectId}" (${cost} credit${cost > 1 ? "s" : ""})`
              : `First PLU analysis for "${project.name?.slice(0, 40) || projectId}" (${cost} credits)`,
            metadata: {
              projectId,
              isRelaunch,
              creditsSpent: cost,
            },
          },
        });

        return {
          creditsRemaining: updatedUser.credits,
          pluAnalysisCount: updatedProject.pluAnalysisCount,
        };
      });

      return NextResponse.json({
        success: true,
        creditsSpent: cost,
        creditsRemaining: result.creditsRemaining,
        pluAnalysisCount: result.pluAnalysisCount,
        isRelaunch,
      });
    }

    return NextResponse.json(
      { error: "Invalid spend type. Supported: plu_analysis" },
      { status: 400 }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "INSUFFICIENT_CREDITS_RACE"
    ) {
      return NextResponse.json(
        { error: "Insufficient credits (concurrent request)" },
        { status: 402 }
      );
    }
    console.error("Credit spend error:", error);
    return NextResponse.json(
      { error: "Failed to process credit spend" },
      { status: 500 }
    );
  }
}
