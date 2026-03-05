-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'DEVELOPER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CreditType" AS ENUM ('PURCHASE', 'SUBSCRIPTION', 'PLU_ANALYSIS', 'PLU_ANALYSIS_RELAUNCH', 'PLAN_GENERATION', 'VISUAL_GENERATION', 'LANDSCAPE_INTEGRATION', 'DOCUMENT_EXPORT', 'DESCRIPTIVE_STATEMENT', 'RENDERING_TRANSFORM', 'RENDERING_PACK_PURCHASE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVIEW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('LOCATION_PLAN', 'SITE_PLAN', 'SECTION', 'ELEVATION', 'LANDSCAPE_INSERTION', 'DESCRIPTIVE_STATEMENT', 'FULL_PACKAGE', 'RENDERING_TRANSFORM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tokens" BIGINT NOT NULL DEFAULT 100,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price_monthly" DOUBLE PRECISION NOT NULL,
    "credits_per_month" INTEGER NOT NULL,
    "features" JSONB,
    "stripe_price_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "credits_per_month" INTEGER NOT NULL,
    "stripe_sub_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "CreditType" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSessionId" TEXT,
    "stripe_payment_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "type" TEXT NOT NULL,
    "credits_amount" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokens" INTEGER DEFAULT 0,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "municipality" TEXT,
    "departement" TEXT,
    "citycode" TEXT,
    "coordinates" TEXT,
    "parcel_ids" TEXT NOT NULL DEFAULT '',
    "parcel_area" DOUBLE PRECISION,
    "parcel_geometry" TEXT,
    "existing_buildings_data" JSONB,
    "north_angle" DOUBLE PRECISION,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "project_type" TEXT,
    "authorization_type" TEXT,
    "authorization_explanation" TEXT,
    "project_description" JSONB,
    "paid_at" TIMESTAMP(3),
    "plu_analysis_count" INTEGER NOT NULL DEFAULT 0,
    "scale" TEXT NOT NULL DEFAULT '1:100',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" VARCHAR(100) DEFAULT 'business',
    "content" JSONB DEFAULT '{}',
    "editor_data" JSONB,
    "is_published" BOOLEAN DEFAULT false,
    "subdomain" VARCHAR(100),
    "thumbnail" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryAnalysis" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "zone_type" TEXT,
    "plu_document_id" TEXT,
    "raw_content" TEXT,
    "ai_analysis" JSONB NOT NULL,
    "constraints" JSONB,
    "pdf_url" TEXT,
    "protected_zones" JSONB,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtectedArea" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "distance" DOUBLE PRECISION,
    "constraints" JSONB,
    "source_url" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProtectedArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeasibilityReport" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "questionnaire_data" JSONB NOT NULL,
    "is_feasible" BOOLEAN NOT NULL,
    "conditions" JSONB,
    "adaptations" JSONB,
    "report" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeasibilityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePlanData" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "canvas_data" JSONB NOT NULL,
    "elements" JSONB,
    "footprint_existing" DOUBLE PRECISION,
    "footprint_projected" DOUBLE PRECISION,
    "footprint_max" DOUBLE PRECISION,
    "surface_areas" JSONB,
    "vrd_networks" JSONB,
    "north_angle" DOUBLE PRECISION,
    "terrain_data" JSONB,
    "compliance_results" JSONB,
    "building_3d" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePlanData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerrainData" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "elevation_points" JSONB NOT NULL,
    "section_lines" JSONB,
    "terrain_model" JSONB,
    "profiles" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerrainData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElevationData" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "facade" TEXT NOT NULL,
    "wall_heights" JSONB NOT NULL,
    "roof_data" JSONB,
    "openings" JSONB,
    "materials" JSONB,
    "canvas_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElevationData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionData" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section_line" JSONB NOT NULL,
    "ground_profile" JSONB,
    "building_cut" JSONB,
    "canvas_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SectionData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DescriptiveStatement" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "generated_text" TEXT,
    "sections" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DescriptiveStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "file_url" TEXT,
    "file_data" TEXT,
    "metadata" JSONB,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");

-- CreateIndex
CREATE INDEX "Subscription_user_id_idx" ON "Subscription"("user_id");

-- CreateIndex
CREATE INDEX "CreditTransaction_user_id_idx" ON "CreditTransaction"("user_id");

-- CreateIndex
CREATE INDEX "CreditTransaction_created_at_idx" ON "CreditTransaction"("created_at");

-- CreateIndex
CREATE INDEX "Payment_user_id_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_stripe_session_id_idx" ON "Payment"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryAnalysis_project_id_key" ON "RegulatoryAnalysis"("project_id");

-- CreateIndex
CREATE INDEX "ProtectedArea_project_id_idx" ON "ProtectedArea"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "FeasibilityReport_project_id_key" ON "FeasibilityReport"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "SitePlanData_project_id_key" ON "SitePlanData"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "TerrainData_project_id_key" ON "TerrainData"("project_id");

-- CreateIndex
CREATE INDEX "ElevationData_project_id_idx" ON "ElevationData"("project_id");

-- CreateIndex
CREATE INDEX "SectionData_project_id_idx" ON "SectionData"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "DescriptiveStatement_project_id_key" ON "DescriptiveStatement"("project_id");

-- CreateIndex
CREATE INDEX "Document_project_id_idx" ON "Document"("project_id");

-- CreateIndex
CREATE INDEX "Document_type_idx" ON "Document"("type");

-- CreateIndex
CREATE INDEX "idx_chat_userid" ON "Chat"("userId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryAnalysis" ADD CONSTRAINT "RegulatoryAnalysis_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtectedArea" ADD CONSTRAINT "ProtectedArea_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeasibilityReport" ADD CONSTRAINT "FeasibilityReport_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePlanData" ADD CONSTRAINT "SitePlanData_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerrainData" ADD CONSTRAINT "TerrainData_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElevationData" ADD CONSTRAINT "ElevationData_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionData" ADD CONSTRAINT "SectionData_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DescriptiveStatement" ADD CONSTRAINT "DescriptiveStatement_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

