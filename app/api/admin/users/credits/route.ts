import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * POST /api/admin/users/credits
 * Admin endpoint to manually adjust a user's credits.
 * Body: { userId: string, amount: number, reason?: string }
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { userId, amount, reason } = await request.json();

    if (!userId || typeof amount !== "number" || amount === 0) {
      return NextResponse.json(
        { error: "userId and non-zero amount required" },
        { status: 400 }
      );
    }

    // Fetch current user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent negative balance
    const newBalance = user.credits + amount;
    if (newBalance < 0) {
      return NextResponse.json(
        { error: `Cannot reduce below 0. Current: ${user.credits}, requested: ${amount}` },
        { status: 400 }
      );
    }

    // Update credits + create transaction log
    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { credits: newBalance },
        select: { id: true, email: true, name: true, credits: true },
      }),
      prisma.creditTransaction.create({
        data: {
          userId,
          amount,
          type: "PURCHASE",
          description: reason || `Admin credit adjustment by ${session.email}`,
          metadata: {
            adjustedBy: session.id,
            adjustedByEmail: session.email,
            previousBalance: user.credits,
            newBalance,
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      user: updatedUser,
      previousCredits: user.credits,
      newCredits: newBalance,
    });
  } catch (error) {
    console.error("[Admin] Credit adjustment error:", error);
    return NextResponse.json(
      { error: "Failed to adjust credits" },
      { status: 500 }
    );
  }
}
