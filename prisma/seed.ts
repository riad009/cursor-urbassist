import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create subscription plans
  await prisma.subscriptionPlan.upsert({
    where: { slug: "free" },
    update: {},
    create: {
      name: "Free",
      slug: "free",
      description: "Get started with limited credits",
      priceMonthly: 0,
      creditsPerMonth: 10,
      features: ["10 credits/month", "1 project", "Basic PLU analysis"],
      isActive: true,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { slug: "starter" },
    update: {},
    create: {
      name: "Starter",
      slug: "starter",
      description: "For individual homeowners",
      priceMonthly: 29,
      creditsPerMonth: 50,
      features: ["50 credits/month", "5 projects", "Full PLU analysis", "Site plan export"],
      isActive: true,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { slug: "professional" },
    update: {},
    create: {
      name: "Professional",
      slug: "professional",
      description: "For architects and professionals",
      priceMonthly: 79,
      creditsPerMonth: 200,
      features: ["200 credits/month", "Unlimited projects", "AI analysis", "All document types", "Landscape integration"],
      isActive: true,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { slug: "developer" },
    update: {},
    create: {
      name: "Developer",
      slug: "developer",
      description: "For real estate developers",
      priceMonthly: 199,
      creditsPerMonth: 500,
      features: ["500 credits/month", "Ultra-realistic visuals", "Developer module", "Priority support"],
      isActive: true,
    },
  });

  // Create demo admin user (password: admin123)
  const adminHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@urbassist.fr" },
    update: {},
    create: {
      email: "admin@urbassist.fr",
      passwordHash: adminHash,
      name: "Admin",
      role: "ADMIN",
      credits: 1000,
    },
  });

  // Create demo user (password: demo123)
  const demoHash = await bcrypt.hash("demo123", 10);
  await prisma.user.upsert({
    where: { email: "demo@urbassist.fr" },
    update: {},
    create: {
      email: "demo@urbassist.fr",
      passwordHash: demoHash,
      name: "Demo User",
      role: "USER",
      credits: 50,
    },
  });

  console.log("Seed completed successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
