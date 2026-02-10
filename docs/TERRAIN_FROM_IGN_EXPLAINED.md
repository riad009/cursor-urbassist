# What “Load terrain from IGN” does (simple explanation)

## In one sentence

**You click a button → the app asks the French map agency (IGN) for real elevation heights at your project location → those heights are drawn on your site plan as blue dots and used in 3D view so the ground is no longer flat.**

---

## Step by step

### 1. Where you are in the app

- You are on the **Site plan** page.
- You have **selected a project** that has an address (and ideally a parcel).
- You see the **2D drawing** (parcel, buildings, etc.).

### 2. What the button is

- In the **left toolbar** there is a **green mountain icon** (under “Add New Construction”).
- Its tooltip says: **“Load terrain from IGN (RGE ALTI®) – adds elevation points for 3D”**.
- That button = **“Load terrain from IGN”**.

### 3. When you click it

1. **Your browser** calls **your own app’s API**:  
   `GET /api/projects/[your-project-id]/terrain-from-ign?canvasWidth=...&canvasHeight=...&pixelsPerMeter=...`

2. **Your server** (Next.js API route):
   - Loads your **project** (address, parcel shape).
   - Figures out the **area** to ask for (parcel bounds or a small zone around the address).
   - Builds a **grid of points** (e.g. 12×12) in that area (longitude, latitude).
   - Calls **IGN’s public API** with that grid:  
     `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=...&lat=...&resource=ign_rge_alti_wld`
   - IGN answers with **altitude in meters** for each point (from RGE ALTI®).
   - Your server **converts** each (longitude, latitude, altitude) into **drawing coordinates** (x, y on the canvas + height value).
   - Sends back to the browser: **list of points** `{ x, y, value }` (value = height in m).

3. **Your Site plan page** (front-end):
   - Receives that list.
   - For **each point** it:
     - Draws a **blue circle** on the 2D plan at (x, y).
     - Adds a **small label** with the height (e.g. `+42.50` m).
     - Saves that point as an **elevation point** (same type as when you use the “Elevation” tool manually).

4. **Result**:
   - On the **2D plan**: you see many blue dots with heights.
   - In **“View in 3D”**: the same points are used; the 3D viewer already knew how to use elevation points, so the ground is no longer a flat plane but follows the heights from IGN.

So: **one click → your app asks IGN for heights → your app draws them as elevation points → 2D and 3D both use them.**

---

## What each part of the code does

| Part | File | Role |
|------|------|------|
| **Button** | `app/site-plan/page.tsx` | Calls `loadTerrainFromIgn()` when you click the mountain icon. |
| **loadTerrainFromIgn** | `app/site-plan/page.tsx` | Fetches `/api/projects/.../terrain-from-ign`, then for each point draws a circle + label on the canvas and adds it to `elevationPoints`. |
| **API route** | `app/api/projects/[id]/terrain-from-ign/route.ts` | Gets project, builds grid, calls IGN, converts (lon,lat,z) → (x,y,value), returns `{ points }`. |
| **Coordinate helpers** | `lib/parcelGeometryToCanvas.ts` | `getParcelBoundsAndRef` = parcel → bounding box; `lngLatToCanvas` = (lon, lat) → (canvas x, y) so IGN points line up with your drawing. |
| **3D viewer** | `app/site-plan/page.tsx` (Inline3DViewer) | Already uses `elevationPoints`; so when we add IGN points to that list, 3D view shows them automatically. |

---

## Why it can “do nothing” or show an error

- **No project selected** → The button is hidden (it only shows when a project is selected).
- **Project has no address/parcel** → The API cannot define the area; you get an error.
- **Location not in France (or not in RGE ALTI®)** → IGN returns “no data” for all points; you get a message like “No elevation data for this location”.
- **IGN API down or slow** → You get “Failed to load terrain from IGN” or a timeout.

---

## Summary

- **“Load terrain from IGN”** = **fetch real ground heights from IGN (RGE ALTI®) for your project and add them as elevation points on the site plan.**
- **Where:** Site plan page, left toolbar, green mountain icon (only with a project selected, in 2D).
- **What you see:** Blue dots with height labels on the 2D plan, and a non-flat terrain in 3D view.
