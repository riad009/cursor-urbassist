import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Credit packages available for purchase
const CREDIT_PACKAGES = [
  { id: "credits-10", credits: 10, price: 990, label: "10 Credits" },
  { id: "credits-25", credits: 25, price: 1990, label: "25 Credits" },
  { id: "credits-50", credits: 50, price: 3490, label: "50 Credits" },
  { id: "credits-100", credits: 100, price: 5990, label: "100 Credits" },
];

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { type, packageId, planId } = await request.json();

    if (type === "credits") {
      // One-time credit purchase
      const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
      if (!pkg) {
        return NextResponse.json(
          { error: "Invalid package" },
          { status: 400 }
        );
      }

      if (STRIPE_SECRET) {
        // Real Stripe integration
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(STRIPE_SECRET);

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "eur",
                product_data: {
                  name: pkg.label,
                  description: `${pkg.credits} credits for UrbAssist platform`,
                },
                unit_amount: pkg.price,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${SITE_URL}/admin?session_id={CHECKOUT_SESSION_ID}&success=true`,
          cancel_url: `${SITE_URL}/admin?cancelled=true`,
          metadata: {
            userId: user.id,
            type: "credits",
            credits: String(pkg.credits),
          },
        });

        // Record payment intent
        await prisma.payment.create({
          data: {
            userId: user.id,
            stripeSessionId: session.id,
            amount: pkg.price / 100,
            type: "credits",
            creditsAmount: pkg.credits,
            status: "pending",
          },
        });

        return NextResponse.json({ url: session.url });
      }

      // Demo mode: directly add credits
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { increment: pkg.credits } },
      });

      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: pkg.credits,
          type: "PURCHASE",
          description: `Purchased ${pkg.credits} credits (demo mode)`,
        },
      });

      return NextResponse.json({
        success: true,
        credits: user.credits + pkg.credits,
        message: `${pkg.credits} credits added (demo mode - no payment required)`,
      });
    }

    if (type === "subscription") {
      // Subscription purchase
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: planId },
      });

      if (!plan) {
        return NextResponse.json(
          { error: "Plan not found" },
          { status: 404 }
        );
      }

      if (STRIPE_SECRET && plan.stripePriceId) {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(STRIPE_SECRET);

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{ price: plan.stripePriceId, quantity: 1 }],
          mode: "subscription",
          success_url: `${SITE_URL}/admin?session_id={CHECKOUT_SESSION_ID}&success=true`,
          cancel_url: `${SITE_URL}/admin?cancelled=true`,
          metadata: {
            userId: user.id,
            type: "subscription",
            planId: plan.id,
          },
        });

        return NextResponse.json({ url: session.url });
      }

      // Demo mode: create subscription directly
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          creditsPerMonth: plan.creditsPerMonth,
          expiresAt,
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { increment: plan.creditsPerMonth } },
      });

      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: plan.creditsPerMonth,
          type: "SUBSCRIPTION",
          description: `Subscribed to ${plan.name} - ${plan.creditsPerMonth} credits added`,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Subscribed to ${plan.name} (demo mode)`,
        credits: user.credits + plan.creditsPerMonth,
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}

// Get available packages
export async function GET() {
  return NextResponse.json({
    packages: CREDIT_PACKAGES.map((p) => ({
      ...p,
      priceFormatted: `€${(p.price / 100).toFixed(2)}`,
      pricePerCredit: `€${(p.price / 100 / p.credits).toFixed(2)}`,
    })),
  });
}
