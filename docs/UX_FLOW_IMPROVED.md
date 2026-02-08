# Improved UX Flow – Detailed Spec & Mapping

This document maps the **Improved UX Flow (DP/PC)** to the UrbAssist codebase and tracks implementation status.

---

## Overall Objective

Enable a private individual with no expertise in urban planning to:

1. Define and qualify their project  
2. Understand whether it falls under **Déclaration Préalable (DP)** or **Permis de Construire (PC)**  
3. Purchase the appropriate service  
4. Produce a complete, compliant regulatory file with no blocking errors  

---

## Step 0 – Home Page / Entry Point

| Spec | Status | Implementation |
|------|--------|----------------|
| Public page | ✅ | Home is public (Navigation shows Sign in if not logged in) |
| Main CTA: « Commencer mon dossier d'autorisation d'urbanisme » | ✅ | Hero CTA added on home page |
| Subtext: Permis de construire ou déclaration préalable • Simulation gratuite avant paiement | ✅ | Subtext below CTA |
| Click → draft creation, redirect to Step 1 | ✅ | Link to `/dossier/qualification` (draft in sessionStorage from Step 1) |

---

## Step 1 – Project Qualification (No Jargon)

| Spec | Status | Implementation |
|------|--------|----------------|
| Free text: « Décrivez en quelques mots votre projet » | ✅ | `/dossier/qualification` – textarea |
| Clickable suggestions (Extension, Piscine, Abri, Construction maison, Autre) | ✅ | Suggestion chips; user can confirm/correct |
| Extract: project type, extension vs new, simple vs complex | ✅ | Stored in sessionStorage for Step 2 |

**Route:** `app/dossier/qualification/page.tsx`

---

## Step 2 – Address & PLU Zone

| Spec | Status | Implementation |
|------|--------|----------------|
| Mandatory address search | ✅ | `/dossier/address` – address search (same as projects) |
| Display cadastral parcels | ✅ | Cadastre lookup after address |
| Display detected PLU zone (UA, UB, N…) | ✅ | PLU detection API, displayed |
| **Critical:** Zoning reliability vs Géoportail | ⚠️ | GPU/IGN APIs used; fallback message if missing |
| Fallback message: « Nous n'avons pas pu identifier le règlement applicable. Vous pouvez téléverser le document du PLU. » | ✅ | Shown when zone missing + link to upload |

**Route:** `app/dossier/address/page.tsx`  
**APIs:** `/api/address/lookup`, `/api/cadastre/lookup`, `/api/plu-detection`, `/api/upload-document` (fallback).

---

## Step 3 – Project Data (Progressive)

| Spec | Status | Implementation |
|------|--------|----------------|
| Extension vs independent construction | ✅ | `/dossier/project-data` – first question |
| Dimensions (L, W, H) | ✅ | Step 3 – length, width, height inputs |
| Existing building / existing floor area | ✅ | Step 3 – yes/no + existing floor area (m²) |
| Creates enclosed floor area? | ✅ | Step 3 – yes/no |
| Roof overhang | ✅ | Step 3 – yes/no + overhang width (m) |
| No direct emprise / surface de plancher questions | ✅ | Calculated in determination (Step 4) |

**Route:** `app/dossier/project-data/page.tsx`. Flow: Step 2 → Step 3 → Step 4.

---

## Step 4 – Automatic DP / PC Determination

| Spec | Status | Implementation |
|------|--------|----------------|
| Clear outcome: DP or PC | ✅ | `/dossier/determination` – shows ✅ Déclaration préalable or ✅ Permis de construire |
| Explanatory message (e.g. surface created, zone) | ✅ | Detail text under result (surface, zone, extension vs new) |
| Non-eligible (architect required) – blocking message | ✅ | Red block: « Ce projet nécessite obligatoirement un architecte. Nous ne pouvons pas traiter ce dossier sur la plateforme. » |

**Route:** `app/dossier/determination/page.tsx`. Business logic: architect if >150 m²; DP/PC from extension/construction, zone, surfaces.

---

## Step 5 – Document List & Payment

| Spec | Status | Implementation |
|------|--------|----------------|
| List: Plan de situation, Plan de masse, Coupe, Façades, Insertion paysagère, Photos, Notice descriptive, CERFA | ✅ | `/dossier/documents` – full list with icons |
| Message: « Tous ces documents seront générés automatiquement » | ✅ | Reassuring copy on dossier/documents + export page |
| CTA: « Acheter et commencer la production » | ✅ | Button creates project from dossier, redirects to project dashboard |

**Routes:** `app/dossier/documents/page.tsx`, `app/export/page.tsx` (reassuring copy added).

---

## Step 6 – Project Dashboard

| Spec | Status | Implementation |
|------|--------|----------------|
| Timeline / checklist | ✅ | `/projects/[id]` – checklist per document type |
| Per-document status | ✅ | À faire / En cours / Terminé / Téléchargeable + link to complete/view each doc |

**Route:** `app/projects/[id]/page.tsx`. Project list cards link to « Tableau de bord » (dashboard) and « Ouvrir le plan de masse ».

---

## Step 7 – Document Production (Guided)

| Spec | Status | Implementation |
|------|--------|----------------|
| Pre-filled data, mandatory elements, block if non-compliant | ✅ | Editor compliance checks, mandatory naming |
| Explicit PLU alerts (e.g. distance) | ✅ | Compliance API + real-time alerts in editor |
| Example: « Piscine à 2,1 m – minimum 3 m (PLU zone UA) » | ✅ | Compliance messages include rule and suggestion |

**Current:** Editor + compliance API; landscape, statement, export.

---

## Plan de situation (DP1 / PCMI1)

| Spec | Status | Implementation |
|------|--------|----------------|
| Aerial, IGN, cadastral, north, scale | ✅ | Location plan page + IGN layer |
| Clickable parcels, selection, side panel | ✅ | Projects page (create): parcel multi-select + list |
| Area per parcel, total | ✅ | Parcels list with area; total on create |
| **Critical:** Parcel selection reliability | ⚠️ | Cadastre API + fallback; UX works |
| Auto document generation, status | ✅ | Export LOCATION_PLAN, documents API |
| 1.4 « Passer au plan de masse » | ✅ | Button on location-plan when project selected → editor |

**Current:** `app/location-plan/page.tsx`, `app/projects/page.tsx` (parcels).

---

## Plan de masse

| Spec | Status | Implementation |
|------|--------|----------------|
| 2D top view | ✅ | Editor |
| « Voir en 3D » + 3D view | ✅ | Building 3D page, sync from site plan |
| Parcels, dimensions, surface table | ✅ | Editor footprint, green table |
| Building footprint vs regulatory (overhangs) | ⚠️ | Compliance uses footprint; overhang logic can be extended from PLU |
| Access triangle, parking 2.5×5, networks (VRD) | ✅ | Editor tools |
| Altimetry, elevation points, 3D terrain | ✅ | Terrain page + API |
| Pool/building tools, surfaces, labels | ✅ | Editor templates + surface types |
| Real-time PLU alerts | ✅ | Compliance API, debounced in editor |
| North arrow, scale, section line | ✅ | Editor |
| Validation A3, status | ✅ | Export, scale options |

**Current:** `app/editor/page.tsx`, `app/terrain/page.tsx`, `app/building-3d/page.tsx`.

---

## Section & Elevations

| Spec | Status | Implementation |
|------|--------|----------------|
| Section from section line, terrain profile | ✅ | Terrain API |
| Elevations from 3D | ✅ | Generate-elevations API |
| User can add lines, text, annotations | ✅ | Facades/terrain/editor |

---

## Landscape Insertion

| Spec | Status | Implementation |
|------|--------|----------------|
| Guided photo (mobile camera) | ✅ | Landscape page, capture="environment" |
| AI integration (3D → realistic image) | ✅ | Optional image API; report via Gemini |
| Accept / new generation | ✅ | Generate again; export stored doc |

**Current:** `app/landscape/page.tsx`, `/api/landscape`.

---

## General UX Principles

| Spec | Status | Implementation |
|------|--------|----------------|
| Document status: À faire / En cours / Terminé / Téléchargeable | ⚠️ | Partial; document types and export exist |
| Cannot validate if mandatory missing | ✅ | Editor: mandatory element naming before save |
| System generates regulatory info, checks PLU, real-time alerts | ✅ | Compliance API, feasibility, regulations |

---

## Implementation Checklist (Priority)

- [x] Step 0: Home CTA + subtext  
- [x] Step 1: Qualification page (description + suggestions)  
- [x] Step 2: Address & PLU page + fallback « téléverser le document PLU »  
- [x] Step 3: Project data page (extension/construction, dimensions, existing, overhang)  
- [x] Step 4: Dedicated DP/PC determination page + architect-required block  
- [x] Step 5: Document list page + reassuring copy + CTA « Acheter et commencer la production »  
- [x] Step 6: Project dashboard (`/projects/[id]`) with document checklist  
- [x] Plan de situation: « Passer au plan de masse » on location-plan  
- [ ] Parcel selection: verify against Géoportail when possible  

**Flow:** Home → qualification → address → project-data → determination → documents → (create project) → project dashboard.

---

*Last updated from Improved UX Flow – Detailed Version (for the developer).*
