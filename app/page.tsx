"use client";

import React from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import {
  ArrowRight,
  MapPin,
  PenTool,
  Sparkles,
  Download,
  ChevronRight,
  Play,
  Shield,
  Zap,
  Target,
  FileText,
  Layers,
  CheckCircle2,
  Clock,
  Bot,
  FolderOpen,
} from "lucide-react";

// ─── Main Component — ZERO database calls, instant load ─────────────────────

export default function Dashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isEn = t("auth.next") === "Next";

  return (
    <Navigation>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50">

        {/* ═══════════════════════════════════════════════════════════════════
            HERO
            ═══════════════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.18),_transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(168,85,247,0.12),_transparent_50%)]" />
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }} />

          <div className="relative z-10 max-w-6xl mx-auto px-6 py-16 lg:py-24">
            <div className="max-w-2xl">
              {user && (
                <div className="flex items-center gap-2 mb-5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-white/80 text-xs font-medium ring-1 ring-white/10">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {user.credits} {isEn ? "credits available" : "crédits disponibles"}
                  </span>
                </div>
              )}

              <h1 className="text-4xl lg:text-5xl font-extrabold text-white mb-4 tracking-tight leading-tight">
                {isEn ? "Your building permit," : "Votre permis de construire,"}
                <br />
                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  {isEn ? "simplified by AI." : "simplifié par l'IA."}
                </span>
              </h1>

              <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-xl">
                {isEn
                  ? "UrbAssist guides you through the entire French planning application process — from parcel selection to complete dossier. No architect needed."
                  : "UrbAssist vous guide à travers tout le processus de demande d'urbanisme — de la sélection de parcelle au dossier complet. Sans architecte."}
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/projects/new"
                  className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold text-base shadow-2xl shadow-indigo-500/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all"
                >
                  <Play className="w-5 h-5" />
                  {isEn ? "Start my application" : "Démarrer ma demande"}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-white/10 text-white font-medium text-sm ring-1 ring-white/10 hover:bg-white/20 transition-all"
                >
                  <FolderOpen className="w-4 h-4 text-slate-400" />
                  {isEn ? "My projects" : "Mes projets"}
                </Link>
              </div>

              {/* Trust badges */}
              <div className="flex items-center gap-5 mt-10 flex-wrap">
                {[
                  { icon: Shield, label: isEn ? "GDPR compliant" : "Conforme RGPD" },
                  { icon: Zap, label: isEn ? "Ready in minutes" : "Prêt en minutes" },
                  { icon: Bot, label: isEn ? "Powered by Gemini AI" : "Propulsé par Gemini IA" },
                ].map((b) => (
                  <div key={b.label} className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <b.icon className="w-3.5 h-3.5 text-slate-400" />
                    <span>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-6">

          {/* ═══════════════════════════════════════════════════════════════════
              HOW IT WORKS — 4-step visual guide
              ═══════════════════════════════════════════════════════════════════ */}
          <section className="py-16 lg:py-20">
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold uppercase tracking-wider mb-4">
                <Layers className="w-3.5 h-3.5" />
                {isEn ? "How it works" : "Comment ça marche"}
              </span>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-slate-900 mb-3">
                {isEn ? "4 steps to your complete dossier" : "4 étapes vers votre dossier complet"}
              </h2>
              <p className="text-slate-500 max-w-lg mx-auto">
                {isEn
                  ? "Follow our guided process — UrbAssist handles the technical complexity for you."
                  : "Suivez notre processus guidé — UrbAssist gère la complexité technique pour vous."}
              </p>
            </div>

            <div className="grid lg:grid-cols-4 gap-0 relative">
              {/* Connecting line (desktop only) */}
              <div className="hidden lg:block absolute top-[52px] left-[12.5%] right-[12.5%] h-[2px] bg-gradient-to-r from-blue-300 via-purple-300 via-amber-300 to-emerald-300" />

              {[
                {
                  step: 1, icon: MapPin,
                  titleEn: "Select your parcel", titleFr: "Sélectionnez votre parcelle",
                  descEn: "Search your address on our interactive map. We automatically load your cadastral parcels, detect the PLU zone, identify heritage protections (ABF), and calculate your parcel surface area.",
                  descFr: "Cherchez votre adresse sur notre carte interactive. On charge automatiquement vos parcelles cadastrales, détecte la zone PLU, identifie les protections patrimoniales (ABF) et calcule la surface de votre parcelle.",
                  timeEn: "~2 minutes", timeFr: "~2 minutes",
                  gradient: "from-blue-500 to-cyan-500", bg: "bg-blue-50", text: "text-blue-600",
                },
                {
                  step: 2, icon: PenTool,
                  titleEn: "Describe your project", titleFr: "Décrivez votre projet",
                  descEn: "Our guided wizard helps you define your construction: type of works, number of levels, floor area, materials, roof type, and applicant details. Plus draw your site plan in our 3D editor.",
                  descFr: "Notre assistant guidé vous aide à définir votre construction : type de travaux, nombre de niveaux, surface plancher, matériaux, type de toiture et informations du demandeur. Et dessinez votre plan de masse dans notre éditeur 3D.",
                  timeEn: "~10 minutes", timeFr: "~10 minutes",
                  gradient: "from-violet-500 to-purple-500", bg: "bg-violet-50", text: "text-violet-600",
                },
                {
                  step: 3, icon: Sparkles,
                  titleEn: "AI regulatory analysis", titleFr: "Analyse réglementaire IA",
                  descEn: "Upload your local PLU regulations (or we auto-detect them). Our Gemini AI reads the document, extracts building rules, and checks your project's compliance — height, setbacks, ground coverage, and more.",
                  descFr: "Téléchargez votre PLU local (ou on le détecte automatiquement). Notre IA Gemini lit le document, extrait les règles et vérifie la conformité de votre projet — hauteur, retraits, emprise au sol, et plus.",
                  timeEn: "~1 minute (AI)", timeFr: "~1 minute (IA)",
                  gradient: "from-amber-500 to-orange-500", bg: "bg-amber-50", text: "text-amber-600",
                },
                {
                  step: 4, icon: Download,
                  titleEn: "Download your dossier", titleFr: "Téléchargez votre dossier",
                  descEn: "We automatically generate all required documents: PC1 (location plan), PC2 (site plan), PC3 (cross-section), PC4 (descriptive notice), PC5 (elevations), PCMI (materials), and pre-filled CERFA form.",
                  descFr: "On génère automatiquement tous les documents requis : PC1 (plan de situation), PC2 (plan de masse), PC3 (plan de coupe), PC4 (notice descriptive), PC5 (façades), PCMI (matériaux), et formulaire CERFA pré-rempli.",
                  timeEn: "Instant ⚡", timeFr: "Instantané ⚡",
                  gradient: "from-emerald-500 to-teal-500", bg: "bg-emerald-50", text: "text-emerald-600",
                },
              ].map((item, i) => (
                <div key={item.step} className="relative px-3 lg:px-4">
                  {/* Step number circle */}
                  <div className="flex justify-center mb-5">
                    <div className={`relative z-10 w-[72px] h-[72px] rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-xl`}>
                      <item.icon className="w-8 h-8 text-white" />
                    </div>
                  </div>

                  {/* Mobile connector */}
                  {i < 3 && (
                    <div className="lg:hidden flex justify-center -my-2 mb-3">
                      <ChevronRight className="w-5 h-5 text-slate-300 rotate-90" />
                    </div>
                  )}

                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {isEn ? `Step ${item.step}` : `Étape ${item.step}`}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${item.bg} ${item.text}`}>
                        <Clock className="w-2.5 h-2.5" />
                        {isEn ? item.timeEn : item.timeFr}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{isEn ? item.titleEn : item.titleFr}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{isEn ? item.descEn : item.descFr}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="text-center mt-14">
              <Link
                href="/projects/new"
                className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-base shadow-2xl shadow-indigo-600/25 hover:shadow-indigo-600/35 hover:-translate-y-0.5 transition-all"
              >
                {isEn ? "Start my permit application" : "Démarrer ma demande de permis"}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <p className="text-xs text-slate-400 mt-3">
                {isEn ? "Free simulation before payment" : "Simulation gratuite avant paiement"}
              </p>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════════
              WHAT YOU GET — document list
              ═══════════════════════════════════════════════════════════════════ */}
          <section className="pb-16 lg:pb-20">
            <div className="text-center mb-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold uppercase tracking-wider mb-4">
                <FileText className="w-3.5 h-3.5" />
                {isEn ? "Generated documents" : "Documents générés"}
              </span>
              <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 mb-3">
                {isEn ? "Everything your mairie needs" : "Tout ce dont votre mairie a besoin"}
              </h2>
              <p className="text-slate-500 max-w-md mx-auto text-sm">
                {isEn
                  ? "All mandatory documents for a PC (building permit) or DP (prior declaration), auto-generated and ready to submit."
                  : "Tous les documents obligatoires pour un PC (permis de construire) ou DP (déclaration préalable), auto-générés et prêts à déposer."}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { code: "PC1", labelEn: "Location Plan", labelFr: "Plan de situation", descEn: "1:25000 map showing your plot position", descFr: "Carte 1:25000 montrant la position de votre terrain" },
                { code: "PC2", labelEn: "Site Plan", labelFr: "Plan de masse", descEn: "Top-down view with buildings, setbacks, access", descFr: "Vue aérienne avec bâtiments, retraits, accès" },
                { code: "PC3", labelEn: "Cross-Section", labelFr: "Plan de coupe", descEn: "Profile showing terrain and building heights", descFr: "Profil montrant le terrain et les hauteurs" },
                { code: "PC4", labelEn: "Descriptive Notice", labelFr: "Notice descriptive", descEn: "AI-written project description", descFr: "Description du projet rédigée par l'IA" },
                { code: "PC5", labelEn: "Facades & Roof", labelFr: "Façades et toitures", descEn: "Elevation drawings of all facades", descFr: "Dessins d'élévation de toutes les façades" },
                { code: "PCMI", labelEn: "Materials Notice", labelFr: "Notice matériaux", descEn: "Complete materials specification", descFr: "Spécification complète des matériaux" },
                { code: "CERFA", labelEn: "Pre-filled Form", labelFr: "Formulaire pré-rempli", descEn: "Official CERFA, auto-filled with your data", descFr: "CERFA officiel, pré-rempli avec vos données" },
                { code: "PC7/8", labelEn: "Environment Photos", labelFr: "Photos d'environnement", descEn: "Near & far environment documentation", descFr: "Documentation de l'environnement proche et lointain" },
              ].map((doc) => (
                <div key={doc.code} className="group rounded-xl border border-slate-200/60 bg-white p-4 hover:border-indigo-200/60 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md">{doc.code}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mb-0.5">{isEn ? doc.labelEn : doc.labelFr}</p>
                  <p className="text-[11px] text-slate-400 leading-snug">{isEn ? doc.descEn : doc.descFr}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════════
              WHAT MAKES US DIFFERENT
              ═══════════════════════════════════════════════════════════════════ */}
          <section className="pb-16 lg:pb-20">
            <div className="grid lg:grid-cols-3 gap-4">
              {[
                {
                  icon: Target,
                  titleEn: "Smart 3D Editor", titleFr: "Éditeur 3D intelligent",
                  descEn: "Draw buildings on your actual terrain with AI-powered magnetic snapping, automatic setback calculations, and real-time CES computation.",
                  descFr: "Dessinez des bâtiments sur votre terrain réel avec accrochage magnétique IA, calcul automatique des retraits et calcul CES en temps réel.",
                  gradient: "from-blue-500 to-indigo-500",
                },
                {
                  icon: Bot,
                  titleEn: "AI PLU Analysis", titleFr: "Analyse PLU par IA",
                  descEn: "Our Gemini AI reads your local urban planning regulations and extracts every rule that applies to your project — maximum height, land coverage, parking requirements, and more.",
                  descFr: "Notre IA Gemini lit votre PLU local et extrait chaque règle applicable — hauteur maximale, emprise au sol, stationnement, et plus encore.",
                  gradient: "from-violet-500 to-purple-500",
                },
                {
                  icon: FileText,
                  titleEn: "Complete Dossier", titleFr: "Dossier complet",
                  descEn: "PC1 through PC8, PCMI materials notice, and pre-filled CERFA — all generated automatically from your project data. Export as print-ready A3 PDF.",
                  descFr: "PC1 à PC8, notice PCMI, et CERFA pré-rempli — tout est généré automatiquement à partir de vos données. Export en PDF A3 prêt à imprimer.",
                  gradient: "from-emerald-500 to-teal-500",
                },
              ].map((f) => (
                <div key={f.titleEn} className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center shadow-lg mb-4`}>
                    <f.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{isEn ? f.titleEn : f.titleFr}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{isEn ? f.descEn : f.descFr}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════════
              FINAL CTA
              ═══════════════════════════════════════════════════════════════════ */}
          <section className="pb-16 lg:pb-20">
            <div className="rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-8 lg:p-12 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.2),_transparent_60%)]" />
              <div className="relative z-10">
                <h2 className="text-2xl lg:text-3xl font-extrabold text-white mb-3">
                  {isEn ? "Ready to start your permit?" : "Prêt à démarrer votre permis ?"}
                </h2>
                <p className="text-slate-400 mb-8 max-w-md mx-auto">
                  {isEn
                    ? "Create your first project in 2 minutes. Free simulation — pay only when you're ready to export."
                    : "Créez votre premier projet en 2 minutes. Simulation gratuite — payez uniquement quand vous êtes prêt à exporter."}
                </p>
                <Link
                  href="/projects/new"
                  className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl bg-white text-slate-900 font-bold text-base shadow-2xl hover:-translate-y-0.5 transition-all"
                >
                  {isEn ? "Create my project" : "Créer mon projet"}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          </section>

          {/* ═══ Footer ═══ */}
          <footer className="py-6 border-t border-slate-200/60">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <p>© 2026 UrbAssist — {isEn ? "Building Permit Automation" : "Automatisation des permis de construire"}</p>
              <div className="flex items-center gap-4">
                <a href="#" className="hover:text-slate-600 transition-colors">Documentation</a>
                <a href="#" className="hover:text-slate-600 transition-colors">Support</a>
                <a href="#" className="hover:text-slate-600 transition-colors">{isEn ? "Privacy" : "Confidentialité"}</a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </Navigation>
  );
}
