import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createToken } from "@/lib/auth";

const DATABASE_ERROR_MESSAGE =
  "Sign-in is not configured on this server. Set DATABASE_URL and DIRECT_URL (Neon) in your environment variables.";

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: DATABASE_ERROR_MESSAGE }, { status: 503 });
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      credits: user.credits,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, credits: user.credits },
      token,
    });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    return response;
  } catch (error) {
    console.error("Login error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const isDbError =
      /connect|database|ECONNREFUSED|P1001|P1017/i.test(msg);
    return NextResponse.json(
      { error: isDbError ? DATABASE_ERROR_MESSAGE : `Login failed: ${msg}` },
      { status: isDbError ? 503 : 500 }
    );
  }
}
