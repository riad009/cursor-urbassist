import { NextResponse } from "next/server";
import { CREDIT_COSTS } from "@/lib/credit-costs";

const PLU_ANALYSIS_CREDITS = parseInt(
  process.env.PLU_ANALYSIS_CREDITS || "3",
  10
);

/** Public settings used by the frontend (credits costs, prices, etc.) */
export async function GET() {
  return NextResponse.json({
    pluAnalysisCredits: isNaN(PLU_ANALYSIS_CREDITS) ? 3 : PLU_ANALYSIS_CREDITS,

    pluFirstAnalysisPriceEur: CREDIT_COSTS.DP_FIRST_EUR,
    pluRelaunchPriceEur: CREDIT_COSTS.DP_RELAUNCH_EUR,

    // Per-type euro pricing
    dpFirstPriceEur: CREDIT_COSTS.DP_FIRST_EUR,
    dpRelaunchPriceEur: CREDIT_COSTS.DP_RELAUNCH_EUR,
    pcFirstPriceEur: CREDIT_COSTS.PC_FIRST_EUR,
    pcRelaunchPriceEur: CREDIT_COSTS.PC_RELAUNCH_EUR,

    // Credit costs for all features
    creditCosts: {
      pluFirstAnalysis: CREDIT_COSTS.PLU_ANALYSIS_FIRST,
      pluRelaunch: CREDIT_COSTS.PLU_ANALYSIS_RELAUNCH,
      documentExport: CREDIT_COSTS.DOCUMENT_EXPORT,
      landscapeInsertion: CREDIT_COSTS.LANDSCAPE_INSERTION,
      descriptiveStatement: CREDIT_COSTS.DESCRIPTIVE_STATEMENT,
      rendering: CREDIT_COSTS.RENDERING_BASE,
    },
  });
}
