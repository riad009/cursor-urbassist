# Working Status – What Works & What to Watch

## ✅ Working end-to-end

- **Auth** – Login, register, session.
- **Projects** – Create (with address, parcels, north angle, protected areas), list, update, delete. Auto location plan document when address + parcels set.
- **Cadastre** – Lookup by coordinates; parcels + north angle from geometry; multi-parcel selection and educational copy on projects page.
- **PLU** – Detection from coordinates (GPU/fallback), pdfUrl; manual upload + AI analysis on Regulations page.
- **Regulatory** – Save/update per project; **automatic pipeline** trigger on Regulations → “From project” → select project → “Run automatic regulatory detection” (PLU detection + save zone/pdfUrl to project).
- **Protected areas** – API + stored on project; used in feasibility and compliance.
- **Feasibility** – Questionnaire, API, report with conditions/adaptations.
- **Editor** – Drawing, parking 2.5×5 m, dimensions, VRD (dashed), surface types, footprint summary (existing/projected/max/remaining), green table (parcel area + PLU min %), north arrow from project angle, real-time compliance (debounced), height-dependent setbacks in compliance.
- **Terrain** – Elevation points, section lines, profiles, regulatory section drawing.
- **Building 3D** – Model, sync from site plan, generate elevations.
- **Location plan** – Page with map (street/satellite + cadastral); ensure document on project select; export.
- **Landscape** – Photo upload/camera, analyze, integration report; optional “Realistic image” (project + OPENAI) and export as Landscape Insertion.
- **Developer** – Image upload, analysis; optional ultra-realistic image when OPENAI enabled.
- **Statement** – Questionnaire, AI-generated descriptive statement.
- **Export** – All document types (including Landscape Insertion); single or full package; credits; image download for landscape when stored.
- **Credits** – Balance, usage by feature (View usage on Export page), Stripe checkout/webhook, subscriptions.
- **Admin** – Manage subscription plans (create/edit, price, credits, Stripe price ID).

## ⚠️ Depends on configuration

- **Landscape/Developer images** – Need `OPENAI_API_KEY` and `IMAGE_GENERATION_ENABLED=true`. Without them, only text analysis/report; no image generation.
- **Gemini analysis** – PLU/regulatory/feasibility/statement use `GEMINI_API_KEY`; without it, mock or fallback data is used.
- **Database** – `northAngle` on Project was added via `prisma db push`. If you use migrations, create a migration for it.

## 🔧 Minor / UX

- **Credit usage panel** – “View usage” fetches once per session; reopening doesn’t refetch (refresh page for latest).
- **Landscape “Realistic image”** – Uses a generic DALL·E prompt (not true photomontage of the uploaded photo); good for a placeholder view.
- **Full package export** – One PDF describing the package; it doesn’t bundle multiple files (e.g. separate landscape image) in a single download.

## ❌ Nothing critical missing

All spec items have a corresponding implementation. The only missing piece was a **UI for the automatic regulatory pipeline**, which is now under **Regulations → “From project” → select project → “Run automatic regulatory detection”.**
