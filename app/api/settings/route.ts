import { NextResponse } from "next/server";
import { CREDIT_COSTS } from "@/lib/credit-costs";

const PLU_ANALYSIS_CREDITS = parseInt(
  process.env.PLU_ANALYSIS_CREDITS || "3",
  10
);

// PLU analysis pricing in euros (for display / Stripe checkout fallback)
const PLU_FIRST_ANALYSIS_PRICE_EUR = parseFloat(process.env.PLU_FIRST_ANALYSIS_PRICE || "15");
const PLU_RELAUNCH_PRICE_EUR = parseFloat(process.env.PLU_RELAUNCH_PRICE || "5");

/** Public settings used by the frontend (credits costs, prices, etc.) */
export async function GET() {
  return NextResponse.json({
    // Legacy euro pricing (kept for backward compat)
    pluAnalysisCredits: isNaN(PLU_ANALYSIS_CREDITS) ? 3 : PLU_ANALYSIS_CREDITS,
    pluFirstAnalysisPriceEur: PLU_FIRST_ANALYSIS_PRICE_EUR,
    pluRelaunchPriceEur: PLU_RELAUNCH_PRICE_EUR,

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
