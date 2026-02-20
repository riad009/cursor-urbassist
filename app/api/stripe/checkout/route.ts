import { NextRequest, NextResponse } from "next/server";
import { getSession, HARDCODED_USER_ID } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

/** Derive the site origin from the incoming request so Stripe redirects work on any domain */
function getSiteUrl(request: NextRequest): string {
  // 1) Vercel / reverse-proxy sets x-forwarded-host + x-forwarded-proto
  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto") || "https";
  if (fwdHost) return `${fwdProto}://${fwdHost}`;

  // 2) Standard Host header
  const host = request.headers.get("host");
  if (host) {
    const proto = host.startsWith("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }

  // 3) Fallback
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

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
    const { type, packageId, planId, projectId, successUrl } = await request.json();

    if (type === "credits") {
      // One-time credit purchase
      const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
      if (!pkg) {
        return NextResponse.json(
          { error: "Invalid package" },
          { status: 400 }
        );
      }

      // ── Real Stripe checkout session (when key is configured) ──
      if (STRIPE_SECRET) {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(STRIPE_SECRET);

        // After payment, redirect back into the project flow
        // successUrl can be passed by the caller to override the default redirect
        const successPath = successUrl
          ? successUrl
          : projectId
            ? `/projects/${encodeURIComponent(projectId)}/payment?success=true`
            : `/projects?success=true&session_id={CHECKOUT_SESSION_ID}`;
        const cancelPath = projectId
          ? `/projects/${encodeURIComponent(projectId)}/payment?cancelled=true`
          : `/projects?cancelled=true`;

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
          success_url: `${getSiteUrl(request)}${successPath}`,
          cancel_url: `${getSiteUrl(request)}${cancelPath}`,
          metadata: {
            userId: user.id,
            type: "credits",
            credits: String(pkg.credits),
            ...(projectId ? { projectId: String(projectId) } : {}),
          },
        });

        // Record payment intent in DB (skip for hardcoded demo user who has no DB row)
        if (user.id !== HARDCODED_USER_ID) {
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
        }

        return NextResponse.json({ url: session.url });
      }

      // ── No Stripe key → demo mode: add credits directly ──
      if (user.id === HARDCODED_USER_ID) {
        return NextResponse.json({
          success: true,
          credits: user.credits + pkg.credits,
          message: `${pkg.credits} credits added (demo mode - set STRIPE_SECRET_KEY to enable real payments)`,
        });
      }

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
        message: `${pkg.credits} credits added (demo mode - set STRIPE_SECRET_KEY to enable real payments)`,
      });
    }

    if (type === "plu_analysis") {
      // Pay-per-use PLU analysis: €15 first, €5 relaunch
      if (!projectId) {
        return NextResponse.json(
          { error: "projectId is required for PLU analysis payment" },
          { status: 400 }
        );
      }

      const project = await prisma.project.findFirst({
        where: { id: projectId, userId: user.id },
      });
      if (!project) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }

      const isRelaunch = project.pluAnalysisCount > 0;
      const priceEur = isRelaunch
        ? parseFloat(process.env.PLU_RELAUNCH_PRICE || "5")
        : parseFloat(process.env.PLU_FIRST_ANALYSIS_PRICE || "15");
      const priceCents = Math.round(priceEur * 100);
      const label = isRelaunch
        ? `PLU Analysis Relaunch — ${project.name || "Project"}`
        : `PLU Analysis — ${project.name || "Project"}`;

      if (STRIPE_SECRET) {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(STRIPE_SECRET);

        const successPath = successUrl
          ? successUrl
          : `/projects/${encodeURIComponent(projectId)}/payment?success=true&type=plu_analysis`;
        const cancelPath = `/projects/${encodeURIComponent(projectId)}/payment?cancelled=true`;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "eur",
                product_data: {
                  name: label,
                  description: isRelaunch
                    ? "Updated PLU regulatory analysis after project modifications"
                    : "Complete PLU regulatory analysis for your construction project",
                },
                unit_amount: priceCents,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${getSiteUrl(request)}${successPath}`,
          cancel_url: `${getSiteUrl(request)}${cancelPath}`,
          metadata: {
            userId: user.id,
            type: "plu_analysis",
            projectId: String(projectId),
            isRelaunch: isRelaunch ? "true" : "false",
            priceEur: String(priceEur),
          },
        });

        // Record pending payment
        if (user.id !== HARDCODED_USER_ID) {
          await prisma.payment.create({
            data: {
              userId: user.id,
              stripeSessionId: session.id,
              amount: priceEur,
              type: "plu_analysis",
              status: "pending",
              metadata: { projectId, isRelaunch },
            },
          });
        }

        return NextResponse.json({ url: session.url });
      }

      // Demo mode: no Stripe key → mark paid immediately
      await prisma.project.update({
        where: { id: projectId },
        data: {
          pluAnalysisCount: { increment: 1 },
          paidAt: project.paidAt ?? new Date(),
        },
      });

      if (user.id !== HARDCODED_USER_ID) {
        await prisma.creditTransaction.create({
          data: {
            userId: user.id,
            amount: 0,
            type: isRelaunch ? "PLU_ANALYSIS_RELAUNCH" : "PLU_ANALYSIS",
            description: `PLU analysis (demo mode) — €${priceEur}`,
            metadata: { projectId, isRelaunch, priceEur },
          },
        });
      }

      return NextResponse.json({
        success: true,
        isRelaunch,
        priceEur,
        pluAnalysisCount: project.pluAnalysisCount + 1,
        message: `PLU analysis payment recorded (demo mode — €${priceEur}). Set STRIPE_SECRET_KEY to enable real payments.`,
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

      // Hardcoded user: instant demo subscription
      if (user.id === HARDCODED_USER_ID) {
        return NextResponse.json({
          success: true,
          message: `Subscribed to ${plan.name} (demo). Register an account to persist credits.`,
          credits: user.credits + plan.creditsPerMonth,
        });
      }

      if (plan.stripePriceId && !STRIPE_SECRET) {
        return NextResponse.json(
          { error: "Stripe is not configured. Set STRIPE_SECRET_KEY to enable subscription payments." },
          { status: 503 }
        );
      }

      if (STRIPE_SECRET && plan.stripePriceId) {
        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(STRIPE_SECRET);

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{ price: plan.stripePriceId, quantity: 1 }],
          mode: "subscription",
          success_url: `${getSiteUrl(request)}/projects?session_id={CHECKOUT_SESSION_ID}&success=true`,
          cancel_url: `${getSiteUrl(request)}/projects?cancelled=true`,
          metadata: {
            userId: user.id,
            type: "subscription",
            planId: plan.id,
          },
        });

        return NextResponse.json({ url: session.url });
      }

      // Demo mode: no Stripe session (missing STRIPE_SECRET_KEY or plan.stripePriceId)
      const whyNoStripe = !STRIPE_SECRET
        ? "Set STRIPE_SECRET_KEY in .env and add a Stripe Price ID to this plan in Admin."
        : "Add a Stripe Price ID to this plan in Admin (Plans → edit plan → Stripe Price ID).";

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
        message: `Subscribed to ${plan.name} (demo mode). To open Stripe checkout: ${whyNoStripe}`,
        credits: user.credits + plan.creditsPerMonth,
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("Checkout error:", error);
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Checkout failed";
    return NextResponse.json(
      { error: message.startsWith("Checkout") ? message : `Checkout failed: ${message}` },
      { status: 500 }
    );
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
