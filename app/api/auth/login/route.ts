import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createToken,
  getHardcodedUser,
  hashPassword,
  HARDCODED_EMAIL,
  HARDCODED_PASSWORD,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from "@/lib/auth";

const DATABASE_ERROR_MESSAGE =
  "Sign-in is not configured on this server. Set DATABASE_URL and DIRECT_URL (Neon) in Vercel → Project → Settings → Environment Variables. See docs/VERCEL.md.";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    // Admin: hardcoded credentials, find-or-create in DB for project ownership
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      if (process.env.DATABASE_URL) {
        let adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
        if (!adminUser) {
          adminUser = await prisma.user.create({
            data: {
              email: ADMIN_EMAIL,
              passwordHash: await hashPassword(ADMIN_PASSWORD),
              name: "Admin",
              role: "ADMIN",
              credits: 999999,
            },
          });
        } else {
          // Ensure existing admin user always has ADMIN role and full credits
          adminUser = await prisma.user.update({
            where: { email: ADMIN_EMAIL },
            data: { role: "ADMIN", credits: 999999 },
          });
        }
        const token = await createToken({
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
          credits: adminUser.credits,
        });
        const response = NextResponse.json({
          user: { id: adminUser.id, email: adminUser.email, name: adminUser.name, role: adminUser.role, credits: adminUser.credits },
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
      // No DB: return admin as in-memory user (project create will fail; use DB for full flow)
      const adminUser = {
        id: "hardcoded-admin-no-db",
        email: ADMIN_EMAIL,
        name: "Admin",
        role: "ADMIN" as const,
        credits: 999999,
      };
      const token = await createToken(adminUser);
      const response = NextResponse.json({
        user: { id: adminUser.id, email: adminUser.email, name: adminUser.name, role: adminUser.role, credits: adminUser.credits },
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

    if (email === HARDCODED_EMAIL && password === HARDCODED_PASSWORD) {
      // Find-or-create in DB so project ownership and credit transactions work
      if (process.env.DATABASE_URL) {
        let dbUser = await prisma.user.findUnique({ where: { email: HARDCODED_EMAIL } });
        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              email: HARDCODED_EMAIL,
              passwordHash: await hashPassword(HARDCODED_PASSWORD),
              name: "Example User",
              role: "USER",
              credits: 10,
            },
          });
        }
        const token = await createToken({
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          credits: dbUser.credits,
        });
        const response = NextResponse.json({
          user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role, credits: dbUser.credits },
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
      // No DB: fallback to in-memory (limited functionality)
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
