import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "true";
  const user = await getSession();
  const isAdmin = user?.role === "ADMIN";
  const plans = await prisma.subscriptionPlan.findMany({
    where: all && isAdmin ? undefined : { isActive: true },
    orderBy: { priceMonthly: "asc" },
  });
  return NextResponse.json({ plans });
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await request.json();
    const { name, slug, description, priceMonthly, creditsPerMonth, stripePriceId } = body;
    if (!name || !slug || priceMonthly == null || creditsPerMonth == null) {
      return NextResponse.json(
        { error: "name, slug, priceMonthly, creditsPerMonth required" },
        { status: 400 }
      );
    }
    const plan = await prisma.subscriptionPlan.create({
      data: {
        name: String(name),
        slug: String(slug).replace(/\s+/g, "-").toLowerCase(),
        description: description || null,
        priceMonthly: Number(priceMonthly),
        creditsPerMonth: Number(creditsPerMonth),
        stripePriceId: stripePriceId || null,
      },
    });
    return NextResponse.json({ plan });
  } catch (e) {
    console.error("Create plan:", e);
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await request.json();
    const { id, name, slug, description, priceMonthly, creditsPerMonth, stripePriceId, isActive } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name) }),
        ...(slug !== undefined && { slug: String(slug).replace(/\s+/g, "-").toLowerCase() }),
        ...(description !== undefined && { description: description || null }),
        ...(priceMonthly !== undefined && { priceMonthly: Number(priceMonthly) }),
        ...(creditsPerMonth !== undefined && { creditsPerMonth: Number(creditsPerMonth) }),
        ...(stripePriceId !== undefined && { stripePriceId: stripePriceId || null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    return NextResponse.json({ plan });
  } catch (e) {
    console.error("Update plan:", e);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }
}
