import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import * as bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "urbassist-secret-key-change-in-production";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
}

/** True if user is admin and should have unrestricted access (no credit checks/deductions). */
export function isUnrestrictedAdmin(user: AuthUser): boolean {
  return user.role === "ADMIN";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: AuthUser): Promise<string> {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, credits: user.credits },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/**
 * Verify a JWT token.
 *
 * By default, this decodes the JWT without hitting the database — instant.
 * When `fetchFreshCredits` is true, it also queries the DB for the latest
 * credit balance (used only by /api/auth/me).
 */
export async function verifyToken(
  token: string,
  opts?: { fetchFreshCredits?: boolean }
): Promise<AuthUser | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      name?: string | null;
      role: string;
      credits?: number;
    };

    // Fast path: decode JWT only — no DB roundtrip.
    // The JWT already contains id, email, role, credits from when it was issued.
    if (!opts?.fetchFreshCredits) {
      return {
        id: payload.id,
        email: payload.email,
        name: payload.name ?? null,
        role: payload.role,
        credits: payload.credits ?? 0,
      };
    }

    // Slow path: fetch fresh user data from DB (for /api/auth/me only).
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, name: true, role: true, credits: true },
    });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      credits: user.credits,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Get session with fresh credit balance from DB.
 * Only use when you specifically need the very latest credits.
 */
export async function getSessionWithFreshCredits(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token, { fetchFreshCredits: true });
}
