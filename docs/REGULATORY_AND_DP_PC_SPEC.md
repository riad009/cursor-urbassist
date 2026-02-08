# Regulatory Documents and DP/PC Determination – Spec and Implementation

This document summarizes the regulatory document lists, automatic DP/PC determination logic, PLU analysis expectations, and developer attention points.

---

## 1. Regulatory documents by application type

### 1.1 Prior Declaration (DP)

| Code   | Document |
|--------|----------|
| DPC1   | Site plan |
| DPC2   | Layout plan |
| DPC3   | Section plan |
| DPC4   | Elevation and roof plans |
| DPC5   | Representation of external appearance |
| DPC6   | Graphic document |
| DPC7   | Photograph of the immediate surroundings |
| DPC8   | Photograph of the distant surroundings |
| DPC8-1 | Descriptive note |

### 1.2 Building Permit (PC)

| Code   | Document |
|--------|----------|
| PC1    | Site plan |
| PC2    | Layout plan |
| PC3    | Section plan |
| PC4    | Descriptive note |
| PC5    | Elevation and roof plans |
| PC6    | Graphic document |
| PC7    | Photograph of the immediate surroundings |
| PC8    | Photograph of the distant surroundings |

**Additional documents** (individual house and annexes, depending on project and area):

- **PCMI13** – Seismic certificate  
- **PCMI14** – RE2020 study  

**Implementation:** The dossier flow shows the correct list (DP or PC) on the “Application documents” step (`/dossier/documents`) based on the result of the determination step. CERFA codes are displayed next to each document.

---

## 2. Automatic DP/PC determination

### Rules implemented

- The platform **never** asks the user for footprint or floor area. The user provides:
  - Type of project (extension / independent construction)
  - Dimensions (length, width, height)
  - Roof overhang (if any)
  - Existing floor area (if existing building)
- The platform **calculates** created area, total area after works, and applies the rules below.

### Prior Declaration (DP)

- **Independent projects** with **created area &lt; 20 m²** → DP.
- **Extensions** with **created area ≤ 40 m²** only if:
  - Project is in an **urban zone** of the PLU (zone U, UD, AUD, UA, UB, etc.), and  
  - **Total floor area after works ≤ 150 m²**.  
- If these conditions are not met → building permit required.

### Building Permit (PC)

- **Independent construction** with created area **≥ 20 m²**.
- **Extension** with created area **&gt; 40 m²** or total area after works **&gt; 150 m²**.
- Projects involving **change of use** or **façade modification** (any area) → PC (data not yet collected in flow; can be added).
- **Architect mandatory:** when created or total floor area **&gt; 150 m²** (or SCI). The platform does not process these applications and shows:  
  *“This project requires a mandatory architect. We cannot process this application on the platform.”*

### Display to user

- Clear result: **Prior declaration (DP)** or **Building permit (PC)**.
- Short explanatory message, e.g.:  
  *“The created area is 32 m² in an urban zone, for an extension.”*
- Non-eligible (architect):  
  *“This project requires a mandatory architect. We cannot process this application on the platform.”*

**Implementation:** `app/dossier/determination/page.tsx` – `computeDetermination()` uses step1/step2/step3; urban zones detected by prefix (U, UD, AUD, etc.).

---

## 3. PLU analysis and overview

### Expected behaviour

- Give the user a **quick overview** of the main elements to comply with according to the PLU:
  - Maximum building heights  
  - Maximum footprint  
  - Distances to property boundaries  
  - Other general constraints (positioning relative to utilities, parking, green spaces, etc.)  
- **Export a PDF** containing this information in a clear, structured template as a guide for the user and the developer.
- Allow **adding specific points** according to the zone or project particularities.

**Current implementation:**  
- AI Document Analysis (`/regulations`) shows analysis results (height, setbacks, coverage, parking, green space, architectural requirements) with details and “Export Report” button.  
- **Regulatory analysis report:** "Export Report" builds an ANALYSE DE LA RÉGLEMENTATION–style document (situation, land use, characteristics, parking, access, PPRN, conclusion with DP/PC + justification) and opens `/regulations/report`; user can Print / Save as PDF.  
- **TODO:** Optional “add specific point” per zone/project in the regulations or project flow.

---

## 4. Developer attention points

1. **PLU zone detection by address is currently unreliable**  
   - Compare with **Géoportail de l’urbanisme** to verify/correct.  
   - Recommended APIs: **Géoportail de l’urbanisme**, **Carto**.  
   - Until fixed: user can upload PLU document or use the “Verify on official Géoportail” link.

2. **DP/PC logic**  
   - Must be calculated automatically from the rules above.  
   - No technical terms (emprise au sol, surface de plancher) asked to the user; only type, dimensions, overhang, existing area.

3. **Document production**  
   - Must follow the DP/PC document lists above.  
   - Documents must be **automatically adapted** to project data and PLU (pre-filled, compliance checks, correct CERFA numbering in export).

---

## 5. File references

| Topic              | File(s) |
|--------------------|---------|
| DP/PC calculation  | `app/dossier/determination/page.tsx` |
| Document list (DP/PC + CERFA) | `app/dossier/documents/page.tsx` |
| Project data (no footprint/floor area asked) | `app/dossier/project-data/page.tsx` |
| PLU / AI analysis  | `app/regulations/page.tsx`, `app/api/analyze-plu/route.ts` |
| Zone detection     | `app/dossier/address/page.tsx`, `app/api/plu-detection/` |
