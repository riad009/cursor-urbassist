import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createToken,
  getHardcodedUser,
  HARDCODED_EMAIL,
  HARDCODED_PASSWORD,
} from "@/lib/auth";

const DATABASE_ERROR_MESSAGE =
  "Sign-in is not configured on this server. The database (DATABASE_URL) must be set in Vercel → Project → Settings → Environment Variables.";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    if (email === HARDCODED_EMAIL && password === HARDCODED_PASSWORD) {
      const user = getHardcodedUser();
      const token = await createToken(user);
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
    }

    if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
      return NextResponse.json({ error: DATABASE_ERROR_MESSAGE }, { status: 503 });
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
      !process.env.DATABASE_URL ||
      /connect|database|ECONNREFUSED|P1001|P1017|sqlite|invalid.*url/i.test(msg);
    const devHint =
      process.env.NODE_ENV === "development" && /file:\.\/dev\.db|sqlite/i.test(process.env.DATABASE_URL || "")
        ? " Stop the dev server, run: npx prisma generate then npm run dev."
        : "";
    const userMessage =
      process.env.NODE_ENV === "development" && msg
        ? `Login failed: ${msg}.${devHint}`
        : isDbError
          ? DATABASE_ERROR_MESSAGE
          : "Login failed";
    return NextResponse.json(
      { error: userMessage },
      { status: isDbError ? 503 : 500 }
    );
  }
}
