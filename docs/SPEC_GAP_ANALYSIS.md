# Specification Gap Analysis – SaaS Platform for Construction Project Assistance

This document compares the **full specification** (SaaS Platform for Construction Project Assistance – AI + Graphic Design) with the **current UrbAssist codebase** and lists **missing or incomplete features**.

---

## 1. Overall Objective

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Reliable automated analysis of PLU/PLUi, protected areas, ABF | ✅ Done | PLU detection, protected-areas API, Gemini analysis, compliance/feasibility |
| Verification of feasibility of construction/extension | ✅ Done | Feasibility page + API, report with conditions/adaptations |
| On-demand or full production of regulatory documents | ✅ Done | Export by document type or full package, credits |
| Ultra-realistic visuals for developers | ⚠️ Partial | **Missing:** Real image output without external API. Requires `OPENAI_API_KEY` + `IMAGE_GENERATION_ENABLED`; otherwise text-only (see `docs/MISSING_IMAGE_FEATURES.md`) |

---

## 2. Automated Regulatory Analysis via AI (Gemini)

### 2.1 Automatic Detection of Urban Planning Rules

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Enter exact address → municipality & parcel | ✅ Done | Address lookup → cadastre lookup |
| Detect applicable PLU/PLUi zoning | ✅ Done | `/api/plu-detection` (GPU/fallback) |
| **Retrieve the official PDF of the regulations** | ⚠️ Partial | **Gap:** Only the **URL** of the PDF is stored (`pdfUrl` from GPU/Géoportail). The platform does **not** automatically **download** the PDF or **extract its text** to run Gemini on it. Gemini analysis runs only when the user **manually uploads** a document. Spec implies: retrieve PDF → analyze with Gemini automatically. |
| Analyze document using Gemini | ✅ Done | When content is provided (upload or manual); not auto from retrieved PDF |
| Detect protected areas (ABF, heritage, classified) | ✅ Done | `/api/protected-areas`, stored on project |
| Integrate constraints into feasibility | ✅ Done | Feasibility and compliance use protected areas |

### 2.2 Manual Upload of Documents

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Manual upload when address not recognized or user provides version | ✅ Done | Regulations page: upload → `/api/upload-document` → `/api/analyze-plu` |

### 2.3 Detailed and Intelligent Rule Analysis

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Footprint, heights, setbacks, height-dependent, parking, green, protected | ✅ Done | Compliance API + Gemini extraction |
| **Complex regulatory subtleties and cross-referencing** | ⚠️ Partial | Basic rules implemented; deep cross-referencing and sector-specific rules are limited (extensible via `aiAnalysis` JSON but not fully automated) |

---

## 3. Two User Approaches

| Spec requirement | Status | Notes |
|------------------|--------|------|
| 3.1 Questionnaire + feasibility report | ✅ Done | Feasibility page, conditions, adaptations |
| 3.2 Draw in editor + real-time verification, explain why not permitted, propose adjustments | ✅ Done | Debounced compliance, messages, suggestions, height-dependent setbacks |

---

## 4. Project Editor and Regulatory Plans

### 4.1 Cadastral Data

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Automatic retrieval via French APIs | ✅ Done | `/api/cadastre/lookup` (with fallback) |
| Select multiple contiguous parcels | ✅ Done | Multi-select on projects page |
| Educational interface: select all parcels affected | ✅ Done | Message and copy on projects page |

### 4.2 Location Plan

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Automatic generation when address + parcels | ✅ Done | `location-plan/ensure`, LOCATION_PLAN document |
| **Views: aerial, IGN, cadastral** | ⚠️ Partial | **Gap:** Base layers are **OpenStreetMap (street)** and **ArcGIS (satellite)**. There is **no dedicated IGN (Institut National de l’Information Géographique) base layer** as specified. Cadastral overlay is present. |

### 4.3 Site Plan (Core Tool)

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Precise drawing tools (simple and free-form) | ✅ Done | Rect, polygon, line, circle, measure, VRD |
| Mandatory parking 2.50 m × 5 m | ✅ Done | Template in editor |
| Reusable objects (rotation, duplication, positioning) | ✅ Done | Fabric.js |
| Automatic dimensioning (building, distances from boundaries) | ✅ Done | Measure tool, dimension lines |
| Mandatory regulatory annotations | ✅ Done | Export options: scale, north arrow, dimensions, legend |
| **Require the user to name the element** | ⚠️ Partial | **Gap:** Elements have a **Name** field in the properties panel, but **naming is not mandatory** before save or export. Spec says: “require the user to name the element”. |

### 4.4 Building Footprint and Areas

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Footprint new/existing, summary table (existing, projected, max, remaining) | ✅ Done | Editor footprint summary |
| Each shape: label, name, area | ✅ Done | Name not enforced (see 4.3) |

### 4.5 Utilities and Mandatory Elements

| Spec requirement | Status | Notes |
|------------------|--------|------|
| VRD dashed: electricity, water, wastewater, stormwater, telecoms, gas | ✅ Done | All six types in editor |
| North arrow from cadastral data | ✅ Done | `northAngleDegrees` from cadastre, used in editor |

### 4.6 Management of Surface Types

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Surfaces by category (green, gravel, concrete, asphalt) | ✅ Done | Surface types, areas by type |
| Table for green space verification | ✅ Done | “Surface by type (PLU verification)” panel |

---

## 5. Altimetry, Sections, and Terrain

| Spec requirement | Status | Notes |
|------------------|--------|------|
| User input of terrain elevation data | ✅ Done | Terrain page |
| Simple 3D terrain model | ✅ Done | Terrain API + page |
| Terrain profiles within sections | ✅ Done | Section line → profile |
| Mandatory drawing of section line | ✅ Done | Terrain page: add section lines |
| Automatic regulatory section drawing | ✅ Done | Terrain API: ground profile + building cut |

---

## 6. 3D Modeling and Elevations

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Simplified 3D: wall heights, simple/complex roofs | ✅ Done | Building 3D page |
| Automatic elevations | ✅ Done | `generate-elevations` API |
| Consistency with site plan and sections | ✅ Done | Sync from site plan, section-data |

---

## 7. Landscape Integration

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Image import; **ability to use smartphone camera** | ✅ Done | File input + `capture="environment"` on Landscape page |
| AI-assisted integration via Gemini | ✅ Done | Analyze photo, text report |
| **Realistic integration of project into environment (image)** | ⚠️ Partial | **Missing:** Automatic generation of a **realistic composite image** (photomontage) from the 3D model + photo. Currently: text report + optional image only when `IMAGE_GENERATION_ENABLED` and image API are configured (see `docs/MISSING_IMAGE_FEATURES.md`). |

---

## 8. Developer-Specific Module

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Upload drawing/image/SketchUp screenshot | ✅ Done | Developer page |
| **Generate ultra-realistic project views** | ⚠️ Partial | **Missing:** Actual **image output** without external API. Optional when image generation is enabled; otherwise text analysis only. |

---

## 9. Descriptive Statement and Written Documents

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Targeted questions → automatic generation | ✅ Done | Statement page + `/api/descriptive-statement` |
| Text compliant with urban planning expectations | ✅ Done | Generated notice text |

---

## 10. Administrative File Generation

| Spec requirement | Status | Notes |
|------------------|--------|------|
| All document types (location, site plan, sections, elevations, landscape, statement) | ✅ Done | Export by type + FULL_PACKAGE |
| Ready-to-submit PDF exports | ✅ Done | Documents export API |
| Generate single document or complete file | ✅ Done | Per document type or full package |
| Per-unit credit per document | ✅ Done | `CREDIT_COSTS` per type, deducted on export |

---

## 11. Monetization: Credits and Subscriptions

| Spec requirement | Status | Notes |
|------------------|--------|------|
| One-time purchase of credits | ✅ Done | Stripe checkout |
| Subscription packages by admin | ✅ Done | Admin plans |
| Configurable pricing | ✅ Done | Plans API + admin UI |
| Credit usage by feature | ✅ Done | CreditTransaction types, usage by feature/document |

---

## 12. Future Developments and Support

| Spec requirement | Status | Notes |
|------------------|--------|------|
| Additional enhancements possible | ✅ Done | Codebase is extensible |

---

# Summary: Missing or Incomplete Features

## High priority (spec explicitly required)

1. **Automatic retrieval and AI analysis of the official PLU PDF**  
   - Spec: “retrieve the official PDF” and “analyze this document using Gemini”.  
   - Current: Only the PDF **URL** is stored; the PDF is **not** fetched and parsed for automatic Gemini analysis.  
   - **To implement:** When `pdfUrl` is set (e.g. from PLU detection), optionally fetch the PDF (with consent/legal checks), extract text (e.g. `pdf-parse`), and run `/api/analyze-plu` with that content; store result in regulatory analysis.

2. **IGN view on the location plan**  
   - Spec: “aerial views, **IGN views**, cadastral views”.  
   - Current: Street (OSM) and satellite (ArcGIS) only; no IGN base layer.  
   - **To implement:** Add an IGN tile layer (e.g. Géoportail orthophoto) as a base layer option on the location plan map.

3. **Mandatory naming of drawn elements**  
   - Spec: “require the user to name the element”.  
   - Current: Name is optional in the properties panel.  
   - **To implement:** Before save or export, validate that every element has a non-empty name; block or warn until all are named (e.g. in editor save and/or export flow).

## Medium priority (improves compliance with spec)

4. **Realistic landscape integration image**  
   - Spec: “realistic integration of the project into the provided environment” (image).  
   - Current: Text report + optional image only when an image API is configured.  
   - **To implement:** See `docs/MISSING_IMAGE_FEATURES.md`; integrate an image-generation/editing API (e.g. photomontage) with photo + 3D/footprint.

5. **Ultra-realistic developer visuals (image)**  
   - Spec: “generate ultra-realistic project views” (for communication/sales).  
   - Current: Text analysis + optional image when image API is enabled.  
   - **To implement:** Same as above; ensure developer module can produce an image output (e.g. sketch → realistic view) with or without a dedicated viz API.

6. **Deeper regulatory subtleties**  
   - Spec: “complex regulatory subtleties”, “not only simple or isolated rules”.  
   - Current: Basic rules (footprint, height, setbacks, parking, green, protected) are implemented; cross-referencing and sector-specific rules are partial.  
   - **To implement:** Extend Gemini prompt and compliance logic for more rule types and cross-references; optionally use structured regulatory schema per zone/sector.

---

## Quick reference: what’s implemented vs missing

- **Fully implemented:** Address → cadastre & PLU detection, manual upload & Gemini analysis, feasibility, editor with real-time compliance, parking 2.5×5 m, VRD (all 6 types), surface types & green table, north arrow from cadastre, terrain/sections/elevations, 3D building, location plan (non-IGN base layers), descriptive statement, export (all types + credits), subscriptions & admin plans.  
- **Missing or partial:** (1) Auto **download + analyze** official PLU PDF, (2) **IGN** base layer on location plan, (3) **Mandatory** element naming, (4) **Realistic landscape image** without external API by default, (5) **Ultra-realistic developer image** without external API by default, (6) **Richer** regulatory rule set and cross-referencing.
