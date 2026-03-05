import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Re-fetch credits from DB so the UI always shows the latest balance
  try {
    const freshUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { credits: true },
    });
    if (freshUser) {
      user.credits = freshUser.credits;
    }
  } catch {
    // If DB fetch fails, fall back to JWT credits
  }

  return NextResponse.json({ user });
}
