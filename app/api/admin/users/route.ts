import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/admin/users
 * Returns all users with their project counts and credit info.
 * Admin-only endpoint.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      credits: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          Project: true,
          creditTransactions: true,
          Payment: true,
        },
      },
    },
  });

  // Get total projects across all users for stats
  const [totalUsers, totalProjects, totalCreditsResult] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.user.aggregate({ _sum: { credits: true } }),
  ]);

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      credits: u.credits,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      totalProjects: u._count.Project,
      totalTransactions: u._count.creditTransactions,
      totalPayments: u._count.Payment,
    })),
    stats: {
      totalUsers,
      totalProjects,
      totalCredits: totalCreditsResult._sum.credits ?? 0,
    },
  });
}
