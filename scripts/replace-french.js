const fs = require("fs");

// app/page.tsx
let page = fs.readFileSync("app/page.tsx", "utf8");
page = page.replace(/Plateforme d[\u2019']accompagnement pour vos dossiers d[\u2019']urbanisme\. Permis de construire ou d[\u00e9]claration pr[\u00e9]alable [\u2014-] simulation gratuite avant paiement\./g,
  "Platform for your planning applications. Building permit or prior declaration — free simulation before payment.");
page = page.replace(/Commencer mon dossier d[\u2019']autorisation d[\u2019']urbanisme/g, "Start my planning application");
fs.writeFileSync("app/page.tsx", page);
console.log("page.tsx OK");

// app/dossier/qualification
let qual = fs.readFileSync("app/dossier/qualification/page.tsx", "utf8");
qual = qual.replace(/Continuer vers l[\u2019']adresse et le PLU/g, "Continue to address and zoning");
qual = qual.replace(/J[\u2019']ai d[\u00e9]j[\u00e0] un projet/g, "I already have a project");
fs.writeFileSync("app/dossier/qualification/page.tsx", qual);
console.log("qualification OK");

// project-data
let pd = fs.readFileSync("app/dossier/project-data/page.tsx", "utf8");
pd = pd.replace(/R[\u00e9]pondez aux questions dans l[\u2019']ordre\./g, "Answer the questions in order.");
fs.writeFileSync("app/dossier/project-data/page.tsx", pd);
console.log("project-data OK");

// determination - French phrases (apostrophe: ' or \u2019)
let det = fs.readFileSync("app/dossier/determination/page.tsx", "utf8");
det = det.replace(/non précisée/g, "unspecified");
det = det.replace(/Le projet \(/g, "Project (");
det = det.replace(/ne crée pas de surface de plancher close\. En règle générale, une déclaration préalable suffit\. Vérifiez les règles de votre PLU/g, "does not create enclosed floor area. Generally a prior declaration is sufficient. Check your zoning");
det = det.replace(/m² d[\u2019']emprise\)/g, "m² footprint)");
det = det.replace(/Saisissez l[\u2019']adresse et les données du projet pour obtenir une estimation\./g, "Enter the address and project data to get an estimate.");
det = det.replace(/La surface créée est d[\u2019']environ/g, "Created area is about");
det = det.replace(/Total après travaux ≤ 170 m² : déclaration préalable suffisante\./g, "Total after works ≤ 170 m²: prior declaration sufficient.");
det = det.replace(/Extension en zone urbaine avec surface créée d[\u2019']environ/g, "Extension in urban zone with created area about");
det = det.replace(/Un permis de construire est nécessaire\./g, "A building permit is required.");
det = det.replace(/Construction neuve d[\u2019']environ/g, "New construction about");
det = det.replace(/de surface de plancher\)\. Un permis de construire est requis\./g, "floor area). A building permit is required.");
det = det.replace(/Projet d[\u2019']envergure/g, "Larger project");
det = det.replace(/Un permis de construire est en général nécessaire\./g, "A building permit is generally required.");
det = det.replace(/Surface créée d[\u2019']environ/g, "Created area about");
det = det.replace(/une déclaration préalable est souvent suffisante\. Vérifiez votre PLU\./g, "a prior declaration is often sufficient. Check your zoning.");
det = det.replace(/message: "Déclaration préalable"/g, 'message: "Prior declaration (DP)"');
det = det.replace(/Seule la mairie peut confirmer le type d[\u2019']autorisation\. En cas de doute, privilégiez le permis de construire\./g, "Only the town hall can confirm the type of permit. When in doubt, apply for a building permit.");
fs.writeFileSync("app/dossier/determination/page.tsx", det);
console.log("determination OK");

// documents + projects/[id]
let docs = fs.readFileSync("app/dossier/documents/page.tsx", "utf8");
docs = docs.replace(/Adresse manquante\. Revenez à l[\u2019']étape Adresse et PLU\./g, "Address missing. Go back to the Address and zoning step.");
docs = docs.replace(/Voici ce qui sera produit pour votre dossier d[\u2019']autorisation\./g, "Here is what will be produced for your planning application.");
fs.writeFileSync("app/dossier/documents/page.tsx", docs);

let projId = fs.readFileSync("app/projects/[id]/page.tsx", "utf8");
projId = projId.replace(/Aller à l[\u2019']export/g, "Go to export");
fs.writeFileSync("app/projects/[id]/page.tsx", projId);

let det2 = fs.readFileSync("app/dossier/determination/page.tsx", "utf8");
det2 = det2.replace(/m² d[\u2019']emprise/g, "m² footprint");
fs.writeFileSync("app/dossier/determination/page.tsx", det2);

// address page: zoning footer
let addr = fs.readFileSync("app/dossier/address/page.tsx", "utf8");
addr = addr.replace(/La zone PLU \(UA, UB, N, etc\.\) est d[\u00e9]tect[\u00e9]e via le G[\u00e9]oportail de l[\u2019']urbanisme\. En cas de doute, v[\u00e9]rifiez sur /g, "Zoning (UA, UB, N, etc.) is detected via our data sources. When in doubt, verify on ");
fs.writeFileSync("app/dossier/address/page.tsx", addr);

console.log("documents + projects/[id] OK");
