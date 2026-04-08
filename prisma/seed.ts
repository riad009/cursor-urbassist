import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ── Subscription Plans ──────────────────────────────────────────────────────
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

  // ── Admin Account ────────────────────────────────────────────────────────────
  // Login: admin@urbassist.fr / admin123
  // Change the password immediately after first login in production!
  const adminHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@urbassist.fr" },
    update: { role: "ADMIN", credits: 1000 },
    create: {
      email: "admin@urbassist.fr",
      passwordHash: adminHash,
      name: "Admin",
      role: "ADMIN",
      credits: 1000,
    },
  });

  // ── Second Admin Account ──────────────────────────────────────────────────
  // Login: admin@gmail.com / 123456
  const adminHash2 = await bcrypt.hash("123456", 10);
  await prisma.user.upsert({
    where: { email: "admin@gmail.com" },
    update: { role: "ADMIN", credits: 1000 },
    create: {
      email: "admin@gmail.com",
      passwordHash: adminHash2,
      name: "Super Admin",
      role: "ADMIN",
      credits: 1000,
    },
  });

  console.log("✅ Seed completed successfully");
  console.log("   Admin login: admin@urbassist.fr / admin123");
  console.log("   Admin login: admin@gmail.com / 123456");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
