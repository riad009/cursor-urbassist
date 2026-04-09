import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

/**
 * GET /api/admin/seed-admin
 * One-time helper to create the admin@gmail.com account.
 * Safe to call multiple times (upsert).
 */
export async function GET() {
  try {
    const hash = await hashPassword("123456");
    const user = await prisma.user.upsert({
      where: { email: "admin@gmail.com" },
      update: { role: "ADMIN", credits: 1000, passwordHash: hash },
      create: {
        email: "admin@gmail.com",
        passwordHash: hash,
        name: "Super Admin",
        role: "ADMIN",
        credits: 1000,
      },
    });
    return NextResponse.json({
      success: true,
      message: "Admin account admin@gmail.com / 123456 created",
      userId: user.id,
    });
  } catch (error) {
    console.error("Seed admin error:", error);
    return NextResponse.json(
      { error: "Failed to seed admin" },
      { status: 500 }
    );
  }
}
