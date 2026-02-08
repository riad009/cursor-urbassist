import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import * as bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "urbassist-secret-key-change-in-production";

/** Hardcoded login (no DB): example@gmail.com / 123456 */
export const HARDCODED_USER_ID = "hardcoded-user-no-db";
export const HARDCODED_EMAIL = "example@gmail.com";
export const HARDCODED_PASSWORD = "123456";

export function getHardcodedUser(): AuthUser {
  return {
    id: HARDCODED_USER_ID,
    email: HARDCODED_EMAIL,
    name: "Example User",
    role: "USER",
    credits: 10,
  };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  credits: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: AuthUser): Promise<string> {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string };
    if (payload.id === HARDCODED_USER_ID) {
      return getHardcodedUser();
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
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
