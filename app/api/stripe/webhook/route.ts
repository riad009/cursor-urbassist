import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  if (!STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_SECRET);

    const body = await request.text();
    const sig = request.headers.get("stripe-signature");

    if (!sig) {
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 400 }
      );
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const type = session.metadata?.type;

        if (!userId) break;

        if (type === "credits") {
          const credits = parseInt(session.metadata?.credits || "0");
          if (credits > 0) {
            await prisma.user.update({
              where: { id: userId },
              data: { credits: { increment: credits } },
            });

            await prisma.creditTransaction.create({
              data: {
                userId,
                amount: credits,
                type: "PURCHASE",
                description: `Purchased ${credits} credits via Stripe`,
                metadata: { sessionId: session.id },
              },
            });

            await prisma.payment.updateMany({
              where: { stripeSessionId: session.id },
              data: {
                status: "completed",
                stripePaymentId: session.payment_intent as string,
              },
            });
          }
        }

        if (type === "subscription") {
          const planId = session.metadata?.planId;
          if (planId) {
            const plan = await prisma.subscriptionPlan.findUnique({
              where: { id: planId },
            });

            if (plan) {
              const expiresAt = new Date();
              expiresAt.setMonth(expiresAt.getMonth() + 1);

              await prisma.subscription.create({
                data: {
                  userId,
                  planId,
                  creditsPerMonth: plan.creditsPerMonth,
                  stripeSubId: session.subscription as string,
                  expiresAt,
                },
              });

              await prisma.user.update({
                where: { id: userId },
                data: { credits: { increment: plan.creditsPerMonth } },
              });

              await prisma.creditTransaction.create({
                data: {
                  userId,
                  amount: plan.creditsPerMonth,
                  type: "SUBSCRIPTION",
                  description: `Subscribed to ${plan.name}`,
                },
              });
            }
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        // Recurring subscription payment
        const invoice = event.data.object as { subscription?: string };
        const subId = invoice.subscription as string;

        const subscription = await prisma.subscription.findFirst({
          where: { stripeSubId: subId },
          include: { plan: true },
        });

        if (subscription) {
          await prisma.user.update({
            where: { id: subscription.userId },
            data: { credits: { increment: subscription.creditsPerMonth } },
          });

          await prisma.creditTransaction.create({
            data: {
              userId: subscription.userId,
              amount: subscription.creditsPerMonth,
              type: "SUBSCRIPTION",
              description: `Monthly renewal: ${subscription.plan.name}`,
            },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data: { status: "CANCELLED" },
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
