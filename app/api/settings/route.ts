import { NextResponse } from "next/server";

const PLU_ANALYSIS_CREDITS = parseInt(
  process.env.PLU_ANALYSIS_CREDITS || "3",
  10
);

// PLU analysis pricing in euros (cents)
const PLU_FIRST_ANALYSIS_PRICE_EUR = parseFloat(process.env.PLU_FIRST_ANALYSIS_PRICE || "15");
const PLU_RELAUNCH_PRICE_EUR = parseFloat(process.env.PLU_RELAUNCH_PRICE || "5");

/** Public settings used by the frontend (credits costs, etc.) */
export async function GET() {
  return NextResponse.json({
    pluAnalysisCredits: isNaN(PLU_ANALYSIS_CREDITS) ? 3 : PLU_ANALYSIS_CREDITS,
    pluFirstAnalysisPriceEur: PLU_FIRST_ANALYSIS_PRICE_EUR,
    pluRelaunchPriceEur: PLU_RELAUNCH_PRICE_EUR,
  });
}
