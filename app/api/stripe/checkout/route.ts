import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS, getBaseFilePrice } from "@/lib/credit-costs";

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

// Dedicated rendering credit packs (independent monetisation)
const RENDERING_PACKS = [
  { id: "render-5", renders: 5, credits: 50, price: 1490, label: "5 Renders Pack" },
  { id: "render-15", renders: 15, credits: 150, price: 3490, label: "15 Renders Pack" },
  { id: "render-50", renders: 50, credits: 500, price: 8990, label: "50 Renders Pack" },
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
        try {
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

          // Record payment intent in DB
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
        } catch (stripeErr) {
          // Stripe connection failed — fall through to demo mode
          console.warn("Stripe connection failed, falling back to demo mode:", stripeErr);
        }
      }

      // ── No Stripe key or Stripe failed → demo mode: add credits directly ──


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

    // ── Rendering Pack (independent monetisation) ──
    if (type === "rendering_pack") {
      const pack = RENDERING_PACKS.find((p) => p.id === packageId);
      if (!pack) {
        return NextResponse.json({ error: "Invalid rendering pack" }, { status: 400 });
      }

      if (STRIPE_SECRET) {
        try {
          const Stripe = (await import("stripe")).default;
          const stripe = new Stripe(STRIPE_SECRET);

          const successPath = successUrl || `/rendering${projectId ? `?project=${encodeURIComponent(projectId)}` : ""}`;
          const cancelPath = `/rendering${projectId ? `?project=${encodeURIComponent(projectId)}&cancelled=true` : "?cancelled=true"}`;

          const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
              {
                price_data: {
                  currency: "eur",
                  product_data: {
                    name: pack.label,
                    description: `${pack.renders} ultra-realistic renders (${pack.credits} credits) for UrbAssist Rendering Studio`,
                  },
                  unit_amount: pack.price,
                },
                quantity: 1,
              },
            ],
            mode: "payment",
            success_url: `${getSiteUrl(request)}${successPath}`,
            cancel_url: `${getSiteUrl(request)}${cancelPath}`,
            metadata: {
              userId: user.id,
              type: "rendering_pack",
              credits: String(pack.credits),
              renders: String(pack.renders),
              ...(projectId ? { projectId: String(projectId) } : {}),
            },
          });

          await prisma.payment.create({
            data: {
              userId: user.id,
              stripeSessionId: session.id,
              amount: pack.price / 100,
              type: "rendering_pack",
              creditsAmount: pack.credits,
              status: "pending",
            },
          });

          return NextResponse.json({ url: session.url });
        } catch (stripeErr) {
          console.warn("Stripe connection failed for rendering pack, falling back to demo mode:", stripeErr);
        }
      }



      await prisma.user.update({ where: { id: user.id }, data: { credits: { increment: pack.credits } } });
      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: pack.credits,
          type: "RENDERING_PACK_PURCHASE",
          description: `Rendering pack: ${pack.renders} renders (${pack.credits} credits, demo mode)`,
        },
      });

      return NextResponse.json({
        success: true,
        credits: user.credits + pack.credits,
        message: `${pack.credits} rendering credits added (demo mode - set STRIPE_SECRET_KEY for real payments)`,
      });
    }

    if (type === "plu_analysis") {
      // Pay-per-use file generation: base price + optional add-ons (CERFA, PLU analysis)
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

      // Read add-on selections from projectDescription (saved by documents page)
      const desc = (project.projectDescription as Record<string, unknown>) || {};
      const wantCerfa = desc.wantCerfa === true;
      const wantPluAnalysis = desc.wantPluAnalysis === true;

      const isRelaunch = project.pluAnalysisCount > 0;
      const basePrice = getBaseFilePrice(project.authorizationType, project.pluAnalysisCount);
      const cerfaPrice = CREDIT_COSTS.ADDON_CERFA_EUR;
      const pluAddonPrice = CREDIT_COSTS.ADDON_PLU_ANALYSIS_EUR;

      const totalPrice = basePrice + (wantCerfa ? cerfaPrice : 0) + (wantPluAnalysis ? pluAddonPrice : 0);

      const baseLabel = isRelaunch
        ? `Complete File (Relaunch) — ${project.name || "Project"}`
        : `Complete File — ${project.name || "Project"}`;

      if (STRIPE_SECRET) {
        try {
          const Stripe = (await import("stripe")).default;
          const stripe = new Stripe(STRIPE_SECRET);

          const successPath = successUrl
            ? successUrl
            : `/projects/${encodeURIComponent(projectId)}/payment?success=true&type=plu_analysis`;
          const cancelPath = `/projects/${encodeURIComponent(projectId)}/payment?cancelled=true`;

          // Build line items dynamically based on add-on selections
          const lineItems: {
            price_data: {
              currency: string;
              product_data: { name: string; description: string };
              unit_amount: number;
            };
            quantity: number;
          }[] = [
            {
              price_data: {
                currency: "eur",
                product_data: {
                  name: baseLabel,
                  description: isRelaunch
                    ? "Updated file generation after project modifications"
                    : "Complete file generation for your construction project",
                },
                unit_amount: Math.round(basePrice * 100),
              },
              quantity: 1,
            },
          ];

          if (wantCerfa) {
            lineItems.push({
              price_data: {
                currency: "eur",
                product_data: {
                  name: "Pre-filled CERFA Form",
                  description: "Automatic completion of all administrative CERFA fields",
                },
                unit_amount: Math.round(cerfaPrice * 100),
              },
              quantity: 1,
            });
          }

          if (wantPluAnalysis) {
            lineItems.push({
              price_data: {
                currency: "eur",
                product_data: {
                  name: "PLU Regulatory Analysis",
                  description: "Verification of project compliance with local planning regulations",
                },
                unit_amount: Math.round(pluAddonPrice * 100),
              },
              quantity: 1,
            });
          }

          const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: lineItems,
            mode: "payment",
            success_url: `${getSiteUrl(request)}${successPath}`,
            cancel_url: `${getSiteUrl(request)}${cancelPath}`,
            metadata: {
              userId: user.id,
              type: "plu_analysis",
              projectId: String(projectId),
              isRelaunch: isRelaunch ? "true" : "false",
              priceEur: String(totalPrice),
              wantCerfa: wantCerfa ? "true" : "false",
              wantPluAnalysis: wantPluAnalysis ? "true" : "false",
            },
          });

          // Record pending payment
          await prisma.payment.create({
            data: {
              userId: user.id,
              stripeSessionId: session.id,
              amount: totalPrice,
              type: "plu_analysis",
              status: "pending",
              metadata: { projectId, isRelaunch, wantCerfa, wantPluAnalysis, totalPrice },
            },
          });

          return NextResponse.json({ url: session.url });
        } catch (stripeErr) {
          console.warn("Stripe connection failed for PLU analysis, falling back to demo mode:", stripeErr);
        }
      }

      // Demo mode: no Stripe key or Stripe failed → mark paid immediately
      await prisma.project.update({
        where: { id: projectId },
        data: {
          pluAnalysisCount: { increment: 1 },
          paidAt: project.paidAt ?? new Date(),
        },
      });

      await prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: 0,
          type: isRelaunch ? "PLU_ANALYSIS_RELAUNCH" : "PLU_ANALYSIS",
          description: `Complete file (demo mode) — €${totalPrice} (base: €${basePrice}${wantCerfa ? ` + CERFA: €${cerfaPrice}` : ""}${wantPluAnalysis ? ` + PLU: €${pluAddonPrice}` : ""})`,
          metadata: { projectId, isRelaunch, priceEur: totalPrice, wantCerfa, wantPluAnalysis },
        },
      });

      return NextResponse.json({
        success: true,
        isRelaunch,
        priceEur: totalPrice,
        pluAnalysisCount: project.pluAnalysisCount + 1,
        message: `Payment recorded (demo mode — €${totalPrice}). Set STRIPE_SECRET_KEY to enable real payments.`,
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
        try {
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
        } catch (stripeErr) {
          console.warn("Stripe connection failed for subscription, falling back to demo mode:", stripeErr);
        }
      }

      // Demo mode: no Stripe session (missing STRIPE_SECRET_KEY, plan.stripePriceId, or Stripe failed)
      const whyNoStripe = !STRIPE_SECRET
        ? "Set STRIPE_SECRET_KEY in .env and add a Stripe Price ID to this plan in Admin."
        : !plan.stripePriceId
          ? "Add a Stripe Price ID to this plan in Admin (Plans → edit plan → Stripe Price ID)."
          : "Stripe connection failed. Check your STRIPE_SECRET_KEY.";

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
    renderingPacks: RENDERING_PACKS.map((p) => ({
      ...p,
      priceFormatted: `€${(p.price / 100).toFixed(2)}`,
      pricePerRender: `€${(p.price / 100 / p.renders).toFixed(2)}`,
    })),
  });
}
