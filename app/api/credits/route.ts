import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const usage = searchParams.get("usage");

  if (usage === "true" || usage === "by-feature") {
    const transactions = await prisma.creditTransaction.findMany({
      where: { userId: user.id, amount: { lt: 0 } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const byFeature: Record<string, { totalCredits: number; count: number; lastUsed?: string }> = {};
    for (const t of transactions) {
      const key = t.type;
      if (!byFeature[key]) byFeature[key] = { totalCredits: 0, count: 0 };
      byFeature[key].totalCredits += Math.abs(t.amount);
      byFeature[key].count += 1;
      const createdStr = t.createdAt.toISOString();
      if (!byFeature[key].lastUsed || createdStr > byFeature[key].lastUsed!)
        byFeature[key].lastUsed = createdStr;
    }
    const byDocumentType: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === "DOCUMENT_EXPORT" && t.metadata && typeof t.metadata === "object") {
        const docType = (t.metadata as { documentType?: string }).documentType;
        if (docType) {
          byDocumentType[docType] = (byDocumentType[docType] || 0) + Math.abs(t.amount);
        }
      }
    }
    return NextResponse.json({
      credits: user.credits,
      usage: {
        byFeature: Object.entries(byFeature).map(([feature, data]) => ({ feature, ...data })),
        byDocumentType: Object.entries(byDocumentType).map(([type, credits]) => ({ type, credits })),
      },
    });
  }

  return NextResponse.json({ credits: user.credits });
}
