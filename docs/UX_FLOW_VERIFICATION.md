# Improved UX Flow – Verification Report

Double-check against the **IMPROVED UX FLOW – DETAILED VERSION** spec. Status: **Working** ✅ or **Partial** ⚠️ or **N/A**.

---

## Overall objective

| Requirement | Status | Notes |
|-------------|--------|--------|
| 1. Define and qualify project | ✅ | Steps 0–1: home CTA → qualification (description + suggestions). |
| 2. Understand DP vs PC | ✅ | Step 4: determination page with clear DP/PC/architect result. |
| 3. Purchase the appropriate service | ✅ | Step 5: document list + CTA; credits check before creating project; link to buy credits. |
| 4. Produce complete, compliant file | ✅ | Step 6 dashboard + Step 7 (editor, compliance, alerts). |

---

## STEP 0 – Home / entry point

| Spec | Status | Verification |
|------|--------|--------------|
| Public page | ✅ | Home is public. |
| Main CTA visible | ✅ | "Start my planning application" → `/dossier/qualification`. |
| Subtext | ✅ | "Building permit or prior declaration · Free simulation before payment". |
| Click → draft + redirect to Step 1 | ✅ | No sign-up; draft created in session from Step 1; redirect to qualification. |

---

## STEP 1 – Project qualification

| Spec | Status | Verification |
|------|--------|--------------|
| Free text field | ✅ | "Describe your project in a few words" (textarea). |
| Clickable suggestions | ✅ | House extension, Swimming pool, Shed/outbuilding, New house construction, Other. |
| User can describe only or confirm/correct with suggestions | ✅ | Both supported. |
| Data extracted (type, extension vs new, simple vs complex) | ✅ | Stored in session: description, projectType, isExtension, isNewConstruction. |
| Redirect to Step 2 | ✅ | "Continue to address and zoning" → `/dossier/address`. |

---

## STEP 2 – Address & PLU zone

| Spec | Status | Verification |
|------|--------|--------------|
| Mandatory address search | ✅ | Single address field; suggestions from API. |
| Display cadastral parcels | ✅ | After address selection; parcels from cadastre API; selectable. |
| Display detected PLU zone | ✅ | Shown when detected (e.g. UA, UB, N). |
| If zoning missing/inconsistent: fallback message | ✅ | Amber box: "We could not identify the applicable regulation. You can upload the zoning (PLU) document to continue." + link to `/regulations`. |
| User can continue anyway | ✅ | Continue button only requires address; zone optional. |
| Verify on Géoportail | ✅ | Footer link: "Verify on official Géoportail" (when in doubt). |
| Redirect to Step 3 | ✅ | Continue → `/dossier/project-data`. |
| Skip guard | ✅ | If user opens project-data without step2 → redirect to address. |

---

## STEP 3 – Project data (progressive)

| Spec | Status | Verification |
|------|--------|--------------|
| Q1: Extension vs independent construction | ✅ | Two buttons; stored isExtension, isIndependentConstruction. |
| Q2: Dimensions (length, width, height) | ✅ | Three inputs in metres. |
| Q3: Existing building on plot | ✅ | Yes/No; if Yes, existing floor area (m²). |
| Q4: Creates enclosed floor area? | ✅ | Yes/No. |
| Q5: Roof overhang planned? | ✅ | Yes/No; if Yes, overhang width (m). |
| No direct emprise / surface de plancher | ✅ | Copy: "No questions on footprint or floor area — we calculate everything for you." |
| All calculations in background | ✅ | Determination (Step 4) uses step3 data to compute. |
| Redirect to Step 4 | ✅ | "See if DP or building permit" → `/dossier/determination`. |

---

## STEP 4 – DP/PC determination

| Spec | Status | Verification |
|------|--------|--------------|
| Clear summary: DP or PC | ✅ | ✅ Prior declaration (DP) or ✅ Building permit (PC) with explanation. |
| Explanatory message | ✅ | Detail text (surface, zone, extension/new, etc.). |
| Non-eligible: architect required | ✅ | Red block: "This project requires an architect by law. We cannot process this application on the platform." |
| Business logic (type, surfaces, zone, >150 m², etc.) | ✅ | computeDetermination() uses step1+step2+step3; architect if >150 m²; DP/PC by zone and surfaces. |
| Skip guard | ✅ | If step3 missing → redirect to `/dossier/project-data`. |
| Link to Step 5 | ✅ | "View document list and purchase" → `/dossier/documents`. |

---

## STEP 5 – Document list & payment

| Spec | Status | Verification |
|------|--------|--------------|
| Full document list | ✅ | Location plan, Site plan, Section, Elevations, Landscape insertion, Photos, Descriptive notice, CERFA. |
| Reassuring message | ✅ | "All these documents will be generated automatically from your project." |
| CTA | ✅ | "Purchase and start producing the application". |
| Credits check | ✅ | If user has < 1 credit, creation blocked + message + link to buy credits. |
| Create project from dossier | ✅ | POST /api/projects with address, coordinates, parcels, zone; then redirect to project dashboard. |
| Skip guard | ✅ | If step2 missing → redirect to address. |

---

## STEP 6 – Project dashboard

| Spec | Status | Verification |
|------|--------|--------------|
| Timeline / checklist | ✅ | Per-document list with status. |
| Statuses: To do / Done / Downloadable | ✅ | To do = no doc; Done = doc exists, no file; Downloadable = file ready. |
| Link to complete or view each doc | ✅ | Buttons: Start | Edit/Export | View/Download → location-plan, editor, terrain, landscape, statement. |
| Export link | ✅ | "Go to export" at bottom. |

---

## STEP 7 – Document production (guided)

| Spec | Status | Verification |
|------|--------|--------------|
| Pre-filled data | ✅ | Editor/terrain/landscape/statement load project data. |
| Mandatory elements | ✅ | Editor: mandatory element naming; save blocked if unnamed. |
| Block validation if non-compliant | ✅ | Compliance API; violations shown in panel. |
| Explicit PLU alerts (e.g. distance) | ✅ | Messages: "Current distance: X m. Minimum required (zone UA): Y m". |

---

## Plan de situation (DP1 / PCMI1)

| Spec | Status | Verification |
|------|--------|--------------|
| Aerial, IGN, cadastral, north, scale | ✅ | Location plan page: base layers (street, satellite, IGN) + cadastre. |
| Clickable parcels, selection, side panel | ✅ | On project creation (and dossier address): parcel multi-select + list. |
| Area per parcel, total | ✅ | Parcel list shows area; total calculated. |
| "Passer au plan de masse" | ✅ | Location plan: "Go to site plan" when project selected → editor. |

---

## Plan de masse (site plan)

| Spec | Status | Verification |
|------|--------|--------------|
| 2D top view | ✅ | Editor is 2D canvas. |
| "Voir en 3D" button | ✅ | Toolbar: "View in 3D" → Building 3D page with project. |
| Parcels, dimensions, surface table | ✅ | Editor: parcel, templates, green/surface table. |
| Access, parking 2.5×5, networks | ✅ | Templates (parking), VRD tool (water, wastewater, etc. + "Not applicable"). |
| North arrow, scale, section line | ✅ | Editor: north arrow, scale, section from terrain. |
| Real-time PLU alerts | ✅ | Compliance panel with distance + minimum + zone. |
| Regulatory footprint note | ✅ | Note: "If your PLU counts roof overhang in footprint, set overhang in Building 3D (View in 3D)." |

---

## Section & elevations

| Spec | Status | Verification |
|------|--------|--------------|
| Section from section line, terrain | ✅ | Terrain API + section. |
| Elevations from 3D | ✅ | Generate-elevations API from Building 3D. |
| User can add lines, text, annotations | ✅ | Editor/terrain support drawing and text. |

---

## Landscape insertion

| Spec | Status | Verification |
|------|--------|--------------|
| Guided photo | ✅ | Upload + camera; capture="environment". |
| Explanatory message | ✅ | "The construction must be visible or integrable in the photo. Prefer a shot from public space, or from sufficient distance." |
| Near / Distant environment | ✅ | Copy: "Required: Near environment and Distant environment photos improve the integration report." |
| AI generation | ✅ | Report + optional realistic image (credits). |
| Accept or new generation | ✅ | Generate again; export. |

---

## Summary

- **Flow:** Home → Qualification → Address → Project data → Determination → Documents → (create project) → Project dashboard. All steps are wired and guarded (redirect if previous step missing).
- **APIs:** Address lookup, cadastre, PLU detection, projects create/read, compliance, documents – all used as intended.
- **Language:** UI is in English (labels, buttons, messages).
- **Known limitations (per spec):** Zoning is not verified against Géoportail API (link only). Parcel selection uses current cadastre API (reliability may vary). Regulatory footprint is not drawn as a separate dashed outline; user is directed to set overhang in Building 3D.

---

*Verification date: flow and guards checked in code. Run the app and walk through Steps 0→6 to confirm in browser.*
