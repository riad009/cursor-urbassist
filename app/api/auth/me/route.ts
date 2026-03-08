import { NextResponse } from "next/server";
import { getSessionWithFreshCredits } from "@/lib/auth";

export async function GET() {
  // Use fresh credentials path — this is the ONLY route that needs a DB query
  // for the latest credit balance. All other routes use getSession() (JWT-only).
  const user = await getSessionWithFreshCredits();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ user });
}
