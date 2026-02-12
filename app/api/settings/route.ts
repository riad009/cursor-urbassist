import { NextResponse } from "next/server";

const PLU_ANALYSIS_CREDITS = parseInt(
  process.env.PLU_ANALYSIS_CREDITS || "3",
  10
);

/** Public settings used by the frontend (credits costs, etc.) */
export async function GET() {
  return NextResponse.json({
    pluAnalysisCredits: isNaN(PLU_ANALYSIS_CREDITS) ? 3 : PLU_ANALYSIS_CREDITS,
  });
}
