import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

export async function POST() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!STRIPE_SECRET) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY is not set in .env" },
      { status: 503 }
    );
  }

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(STRIPE_SECRET);

  const plans = await prisma.subscriptionPlan.findMany({
    where: { priceMonthly: { gt: 0 }, stripePriceId: null },
  });

  if (plans.length === 0) {
    return NextResponse.json({
      success: true,
      message: "All paid plans already have Stripe Price IDs.",
      synced: 0,
    });
  }

  const results: { planId: string; name: string; priceId: string }[] = [];
  const errors: { planId: string; name: string; error: string }[] = [];

  for (const plan of plans) {
    try {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description || `${plan.creditsPerMonth} credits/month`,
      });

      const price = await stripe.prices.create({
        product: product.id,
        currency: "eur",
        unit_amount: Math.round(plan.priceMonthly * 100),
        recurring: { interval: "month" },
      });

      await prisma.subscriptionPlan.update({
        where: { id: plan.id },
        data: { stripePriceId: price.id },
      });

      results.push({ planId: plan.id, name: plan.name, priceId: price.id });
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Unknown error";
      errors.push({ planId: plan.id, name: plan.name, error: message });
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    message: errors.length === 0
      ? `Created Stripe prices for ${results.length} plan(s). Subscribe will now open Stripe checkout.`
      : `Synced ${results.length} plan(s). ${errors.length} failed.`,
    synced: results.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
