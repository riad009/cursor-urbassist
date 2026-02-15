/**
 * Translations dictionary for FR ↔ EN language toggle.
 * Keys are stable identifiers; each maps to { fr, en }.
 */
export type Locale = "fr" | "en";

export const translations: Record<string, Record<Locale, string>> = {
    // ─── Navigation ───────────────────────────────────────────────────────────────
    "nav.dashboard": { fr: "Tableau de bord", en: "Dashboard" },
    "nav.project": { fr: "Projet", en: "Project" },
    "nav.signIn": { fr: "Se connecter", en: "Sign in" },
    "nav.logout": { fr: "Déconnexion", en: "Logout" },
    "nav.plans": { fr: "Plans", en: "Plans" },
    "nav.credits": { fr: "crédits", en: "credits" },
    "nav.newProject": { fr: "Nouveau projet", en: "New project" },
    "nav.steps": { fr: "(étapes)", en: "(steps)" },

    // ─── Step Flow Labels ─────────────────────────────────────────────────────────
    "step.project": { fr: "Projet", en: "Project" },
    "step.authorization": { fr: "Autorisation", en: "Authorization" },
    "step.payment": { fr: "Paiement", en: "Payment" },
    "step.description": { fr: "Description", en: "Description" },
    "step.pluAnalysis": { fr: "Analyse PLU", en: "PLU Analysis" },
    "step.overview": { fr: "Aperçu", en: "Overview" },
    "step.locationPlan": { fr: "Plan de situation", en: "Location Plan" },
    "step.sitePlan": { fr: "Plan de masse", en: "Site Plan" },
    "step.statement": { fr: "Notice", en: "Statement" },
    "step.export": { fr: "Export", en: "Export" },

    // ─── Dashboard (Home Page) ────────────────────────────────────────────────────
    "dash.welcome": { fr: "Bienvenue sur", en: "Welcome to" },
    "dash.demoProject": { fr: "Projet Démo", en: "Demo Project" },
    "dash.subtitle": {
        fr: "Plateforme pour vos demandes d'urbanisme. Permis de construire ou déclaration préalable — simulation gratuite avant paiement.",
        en: "Platform for your planning applications. Building permit or prior declaration — free simulation before payment.",
    },
    "dash.startApp": {
        fr: "Commencer ma demande d'urbanisme",
        en: "Start my urban planning application",
    },
    "dash.startSub": {
        fr: "Permis de construire ou déclaration préalable · Simulation gratuite avant paiement",
        en: "Building permit or prior declaration · Free simulation before payment",
    },
    "dash.viewProjects": { fr: "Voir mes projets", en: "View my projects" },
    "dash.totalProjects": { fr: "Total Projets", en: "Total Projects" },
    "dash.activeDesigns": { fr: "Designs Actifs", en: "Active Designs" },
    "dash.completed": { fr: "Terminés", en: "Completed" },
    "dash.timeSaved": { fr: "Temps Gagné", en: "Time Saved" },
    "dash.thisMonth": { fr: "+3 ce mois", en: "+3 this month" },
    "dash.pendingReview": { fr: "2 en attente de révision", en: "2 pending review" },
    "dash.onTime": { fr: "100% dans les temps", en: "100% on time" },
    "dash.aiAssist": { fr: "avec l'IA", en: "with AI assistance" },
    "dash.quickActions": { fr: "Actions Rapides", en: "Quick Actions" },
    "dash.recentProjects": { fr: "Projets Récents", en: "Recent Projects" },
    "dash.viewAll": { fr: "Voir tout", en: "View all" },
    "dash.platformFeatures": { fr: "Fonctionnalités", en: "Platform Features" },
    "dash.footer": {
        fr: "© 2026 UrbAssist. Assistance Projet Construction",
        en: "© 2026 UrbAssist. Construction Project Assistance",
    },
    "dash.documentation": { fr: "Documentation", en: "Documentation" },
    "dash.support": { fr: "Support", en: "Support" },
    "dash.privacy": { fr: "Confidentialité", en: "Privacy" },

    // Quick actions
    "qa.newProject": { fr: "Nouveau Projet", en: "New Project" },
    "qa.newProjectDesc": { fr: "Partez de zéro ou d'un modèle", en: "Start from scratch or template" },
    "qa.designStudio": { fr: "Studio Design", en: "Design Studio" },
    "qa.designStudioDesc": { fr: "Ouvrir l'éditeur visuel", en: "Open the visual editor" },
    "qa.aiAnalysis": { fr: "Analyse IA", en: "AI Analysis" },
    "qa.aiAnalysisDesc": { fr: "Télécharger des documents PLU", en: "Upload PLU documents" },
    "qa.feasibility": { fr: "Faisabilité", en: "Feasibility" },
    "qa.feasibilityDesc": { fr: "Outils d'étude et faisabilité", en: "Study and feasibility tools" },
    "qa.developer": { fr: "Développeur", en: "Developer" },
    "qa.developerDesc": { fr: "Outils visuels et IA", en: "Visual and AI tools" },
    "qa.exportPlans": { fr: "Export Plans", en: "Export Plans" },
    "qa.exportPlansDesc": { fr: "Générer des PDF A3", en: "Generate A3 PDF files" },

    // Features
    "feat.smartDrawing": { fr: "Outils de Dessin Intelligents", en: "Smart Drawing Tools" },
    "feat.smartDrawingDesc": { fr: "Alignement et accrochage pilotés par l'IA", en: "AI-powered snap and alignment features" },
    "feat.realTimeCalc": { fr: "Calculs en Temps Réel", en: "Real-time Calculations" },
    "feat.realTimeCalcDesc": { fr: "Métriques de surface et distance instantanées", en: "Instant surface and distance metrics" },
    "feat.regulatory": { fr: "Conformité Réglementaire", en: "Regulatory Compliance" },
    "feat.regulatoryDesc": { fr: "Vérification PLU automatique", en: "Automatic PLU verification" },
    "feat.quickExport": { fr: "Export Rapide", en: "Quick Export" },
    "feat.quickExportDesc": { fr: "Génération PDF A3 en un clic", en: "One-click A3 PDF generation" },

    // Recent projects
    "proj.inProgress": { fr: "en cours", en: "in-progress" },
    "proj.review": { fr: "révision", en: "review" },
    "proj.completed": { fr: "terminé", en: "completed" },
    "proj.residential": { fr: "Résidentiel", en: "Residential" },
    "proj.commercial": { fr: "Commercial", en: "Commercial" },
    "proj.extension": { fr: "Extension", en: "Extension" },
    "proj.hoursAgo": { fr: "Il y a 2 heures", en: "2 hours ago" },
    "proj.yesterday": { fr: "Hier", en: "Yesterday" },
    "proj.threeDaysAgo": { fr: "Il y a 3 jours", en: "3 days ago" },

    // ─── Authorization Page ───────────────────────────────────────────────────────
    "auth.title": { fr: "De quoi avez-vous besoin ?", en: "What do you need?" },
    "auth.subtitle": {
        fr: "Déterminez le type d'autorisation requis pour votre projet et découvrez les documents qui seront produits.",
        en: "Determine the type of authorization required for your project and discover the documents that will be produced.",
    },
    "auth.projectOverview": { fr: "← Aperçu du projet", en: "← Project overview" },
    "auth.backToProjects": { fr: "← Retour aux projets", en: "← Back to projects" },
    "auth.projectNotFound": { fr: "Projet non trouvé.", en: "Project not found." },
    "auth.loadingProject": { fr: "Chargement du projet…", en: "Loading project…" },
    "auth.zonePluNotDetected": {
        fr: "Zone PLU/RNU non détectée automatiquement.",
        en: "PLU/RNU zone not automatically detected.",
    },
    "auth.dp": { fr: "Déclaration Préalable", en: "Prior Declaration" },
    "auth.dpDesc": {
        fr: "Je sais que j'ai besoin d'une déclaration préalable de travaux.",
        en: "I know I need a prior declaration of works.",
    },
    "auth.pc": { fr: "Permis de Construire", en: "Building Permit" },
    "auth.pcDesc": {
        fr: "Je sais que j'ai besoin d'un permis de construire.",
        en: "I know I need a building permit.",
    },
    "auth.pcArchitect": { fr: "Permis de Construire + Architecte obligatoire", en: "Building Permit + Architect required" },
    "auth.none": { fr: "Aucune autorisation nécessaire", en: "No authorization required" },
    "auth.checkForMe": { fr: "Vérifiez pour moi", en: "Check for me" },
    "auth.checkForMeDesc": {
        fr: "Je ne sais pas, aidez-moi à déterminer le type d'autorisation nécessaire.",
        en: "I don't know, help me determine the type of authorization needed.",
    },
    "auth.answerQuestions": {
        fr: "Répondez à quelques questions pour déterminer automatiquement le type d'autorisation requis.",
        en: "Answer a few questions to automatically determine the type of authorization required.",
    },
    "auth.whatProject": { fr: "Quel est votre projet ?", en: "What is your project?" },
    "auth.newConstruction": { fr: "Construction neuve (indépendante)", en: "New construction (standalone)" },
    "auth.newConstructionDesc": { fr: "Maison, garage, abri de jardin, annexe…", en: "House, garage, garden shed, annex…" },
    "auth.existingExtension": { fr: "Travaux sur bâtiment existant", en: "Works on existing building" },
    "auth.existingExtensionDesc": {
        fr: "Extension, surélévation, modification de façade, changement d'usage…",
        en: "Extension, raising, facade modification, change of use…",
    },
    "auth.swimmingPool": { fr: "Piscine", en: "Swimming pool" },
    "auth.swimmingPoolDesc": { fr: "Construction d'une piscine avec ou sans abri", en: "Construction of a pool with or without shelter" },
    "auth.back": { fr: "Retour", en: "Back" },
    "auth.next": { fr: "Suivant", en: "Next" },
    "auth.poolSurface": { fr: "Quelle est la surface du bassin ?", en: "What is the pool surface area?" },
    "auth.createdSurface": { fr: "Quelle surface sera créée ?", en: "What surface area will be created?" },
    "auth.poolSurfaceLabel": { fr: "Surface du bassin (m²)", en: "Pool surface area (m²)" },
    "auth.floorAreaLabel": { fr: "Surface de plancher créée (m²)", en: "Floor area created (m²)" },
    "auth.existingSurfaceLabel": { fr: "Surface existante avant travaux (m²)", en: "Existing surface before works (m²)" },
    "auth.thresholdReminder": { fr: "Rappel des seuils", en: "Threshold reminder" },

    // Threshold strings
    "auth.thresholdNoAuth": { fr: "Aucune autorisation", en: "No authorization" },
    "auth.newLess5": { fr: "Moins de 5 m² → Aucune autorisation", en: "Less than 5 m² → No authorization" },
    "auth.new5to20": { fr: "5 à 20 m² → Déclaration préalable", en: "5 to 20 m² → Prior declaration" },
    "auth.newOver20": { fr: "Plus de 20 m² → Permis de construire", en: "Over 20 m² → Building permit" },
    "auth.totalOver150": { fr: "Surface totale > 150 m² → Architecte obligatoire", en: "Total surface > 150 m² → Architect required" },
    "auth.extLess20": { fr: "Moins de 20 m² → Déclaration préalable", en: "Less than 20 m² → Prior declaration" },
    "auth.ext20to40": { fr: "20 à 40 m² en zone urbaine → Vérification surface totale", en: "20 to 40 m² in urban zone → Check total surface" },
    "auth.extOver40": { fr: "Plus de 40 m² → Permis de construire", en: "Over 40 m² → Building permit" },
    "auth.poolLess10": { fr: "Moins de 10 m² → Aucune autorisation", en: "Less than 10 m² → No authorization" },
    "auth.pool10to100": { fr: "10 à 100 m² → Déclaration préalable", en: "10 to 100 m² → Prior declaration" },
    "auth.poolShelterHigh": { fr: "Abri > 1,80 m → Permis de construire", en: "Shelter > 1.80 m → Building permit" },
    "auth.poolOver100": { fr: "Plus de 100 m² → Permis de construire", en: "Over 100 m² → Building permit" },

    // Pool shelter step
    "auth.poolShelterTitle": { fr: "Votre piscine a-t-elle un abri ?", en: "Does your pool have a shelter?" },
    "auth.poolShelterInfo": {
        fr: "Si l'abri dépasse 1,80 m de hauteur, un permis de construire est nécessaire au lieu d'une déclaration préalable.",
        en: "If the shelter exceeds 1.80 m in height, a building permit is required instead of a prior declaration.",
    },
    "auth.noShelter": { fr: "Pas d'abri", en: "No shelter" },
    "auth.noShelterDesc": { fr: "Piscine à ciel ouvert", en: "Open-air pool" },
    "auth.shelterLow": { fr: "Abri ≤ 1,80 m", en: "Shelter ≤ 1.80 m" },
    "auth.shelterLowDesc": { fr: "Couverture basse ou volet roulant", en: "Low cover or rolling shutter" },
    "auth.shelterHigh": { fr: "Abri > 1,80 m", en: "Shelter > 1.80 m" },
    "auth.shelterHighDesc": { fr: "Abri haut permettant de se tenir debout", en: "High shelter allowing standing" },

    // Submitter step
    "auth.submitterTitle": { fr: "Déposez-vous en tant que particulier ou entreprise ?", en: "Are you filing as an individual or company?" },
    "auth.submitterInfo": {
        fr: "Si vous déposez en tant qu'entreprise (personne morale), le recours à un architecte est obligatoire pour un permis de construire.",
        en: "If you file as a company (legal entity), an architect is mandatory for a building permit.",
    },
    "auth.individual": { fr: "Particulier", en: "Individual" },
    "auth.individualDesc": { fr: "Personne physique", en: "Natural person" },
    "auth.company": { fr: "Entreprise", en: "Company" },
    "auth.companyDesc": { fr: "Personne morale (SCI, SARL, etc.)", en: "Legal entity (SCI, SARL, etc.)" },

    // Result step
    "auth.dpExplanation": {
        fr: "Vous avez indiqué qu'une déclaration préalable suffit pour votre projet.",
        en: "You indicated that a prior declaration is sufficient for your project.",
    },
    "auth.pcExplanation": {
        fr: "Vous avez indiqué qu'un permis de construire est requis pour votre projet.",
        en: "You indicated that a building permit is required for your project.",
    },
    "auth.architectWarning": {
        fr: "Ce type de projet nécessite le recours à un architecte. Notre plateforme ne peut pas prendre en charge ce dossier.",
        en: "This type of project requires an architect. Our platform cannot handle this case.",
    },
    "auth.documentsProduced": { fr: "Documents qui seront produits", en: "Documents that will be produced" },
    "auth.notesIndividual": { fr: "Notes pour les maisons individuelles", en: "Notes for individual houses" },
    "auth.additionalOptions": { fr: "Options complémentaires", en: "Additional options" },
    "auth.pluAnalysis": { fr: "Analyse PLU / RNU", en: "PLU / RNU Analysis" },
    "auth.pluAnalysisDesc": {
        fr: "Vérification automatique de la conformité de votre projet avec le règlement d'urbanisme applicable. Cette analyse sera intégrée dans votre plan de masse et votre notice descriptive.",
        en: "Automatic compliance check of your project against the applicable urban planning regulations. This analysis will be integrated into your site plan and descriptive statement.",
    },
    "auth.cerfaFill": { fr: "Pré-remplissage CERFA automatique", en: "Automatic CERFA pre-fill" },
    "auth.cerfaFillDesc": {
        fr: "Remplissage automatique du formulaire CERFA de votre autorisation d'urbanisme à partir des informations du projet.",
        en: "Automatic filling of the CERFA form for your urban planning authorization from the project information.",
    },
    "auth.pluAdvice": {
        fr: "L'analyse PLU/RNU est recommandée pour vérifier la conformité réglementaire de votre projet et générer une notice descriptive complète.",
        en: "PLU/RNU analysis is recommended to verify regulatory compliance of your project and generate a complete descriptive statement.",
    },
    "auth.advice": { fr: "Conseil :", en: "Tip:" },
    "auth.startOver": { fr: "Recommencer", en: "Start over" },
    "auth.continuePayment": { fr: "Continuer vers le paiement", en: "Continue to payment" },
    "auth.backToProject": { fr: "Retour au projet", en: "Back to project" },

    // ─── New Project Page ─────────────────────────────────────────────────────────
    "newProj.title": { fr: "Nouveau Projet", en: "New Project" },

    // ─── Common ───────────────────────────────────────────────────────────────────
    "common.loading": { fr: "Chargement…", en: "Loading…" },
    "common.save": { fr: "Enregistrer", en: "Save" },
    "common.cancel": { fr: "Annuler", en: "Cancel" },
    "common.delete": { fr: "Supprimer", en: "Delete" },
    "common.confirm": { fr: "Confirmer", en: "Confirm" },
    "common.search": { fr: "Rechercher", en: "Search" },
    "common.or": { fr: "ou", en: "or" },
};

/**
 * Helper to get translated text. Falls back to the key itself.
 */
export function getTranslation(key: string, locale: Locale): string {
    return translations[key]?.[locale] ?? key;
}
