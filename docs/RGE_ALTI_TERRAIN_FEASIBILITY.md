# RGE ALTI® / IGN elevation integration – feasibility

## Summary

**Yes, it is feasible** to integrate IGN elevation data (including RGE ALTI®) to automatically generate 3D terrain for the site plan. The client can get a realistic terrain without any action, and still manually add or edit elevation points.

---

## Data sources (what you have)

| Source | Use in app | Notes |
|--------|------------|--------|
| **IGN Altimetry API (REST)** | Best fit for auto terrain | Point elevations via `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json` with `lon`, `lat`, `resource=ign_rge_alti_wld`. Up to **5 000 points/request**, **5 req/s** limit. |
| **RGE ALTI® (GeoTIFF/ASCII)** | Offline / batch | 1 m DTM; typically downloaded by extent. Not a simple REST call; better for server-side batch or pre-processing. |
| **IGN WMTS/WMS (altimetry)** | Optional visualization | Layers like `ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES` give *images* (hillshade, elevation as color), not numeric heights. Useful for a 2D basemap, not for building a 3D mesh directly. |

**Recommendation:** Use the **REST elevation API** with resource **`ign_rge_alti_wld`** (RGE ALTI®) to sample a grid of heights over the parcel, then build the 3D terrain (and optionally keep WMTS for 2D background later).

---

## Current app behaviour

- **Site plan** has user-defined **elevation points** `{ id, x, y, value }` (canvas x, y in px; value in m).
- **Inline 3D viewer** shows a flat ground plane plus elevation points as markers; spec says “full TIN optional later”.
- **Parcel** geometry is in WGS84 `[lng, lat]`; `parcelGeometryToCanvas` converts (lng, lat) → canvas (x, y) using a reference point and `pixelsPerMeter`.
- Project has **coordinates** (lat/lng) and **parcelGeometry** (GeoJSON), so we can derive a bounding box and a grid in (lng, lat).

So we already have:

- Geographic bounds (from parcel or centroid + buffer).
- A deterministic (lng, lat) ↔ (canvas x, y) transform.
- A 3D viewer that consumes elevation points and could consume a TIN or height grid.

---

## Integration design

### 1. Automatic terrain (no client action)

- **When:** On loading the site plan (or when opening “3D” for the first time), if the project has `coordinates` and optionally `parcelGeometry`, call a **backend** endpoint that:
  1. Computes a bounding box (from parcel or from centroid + e.g. 50–100 m buffer).
  2. Builds a grid of points (e.g. 10×10 to 20×20) in (lon, lat).
  3. Calls IGN: `GET https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=...&lat=...&resource=ign_rge_alti_wld&delimiter=|` (batch of points in one request; API accepts up to 5 000).
  4. Converts (lon, lat, z) → (canvas x, y, value) using the same ref and scale as `parcelGeometryToShapes`.
  5. Returns `{ points: [{ x, y, value }], source: "ign_rge_alti" }`.
- **Storage:** Save in `SitePlanData.terrainData` (e.g. `{ autoTerrain: { points, source } }`) or merge into a dedicated “auto” elevation set. The 3D viewer then uses these points (and optionally builds a TIN) instead of or in addition to the flat plane.

So the client gets a **realistic terrain by default** as soon as the site plan is loaded (or on first 3D view), without clicking anything.

### 2. Manual adjustment / modelling

- **Keep** the existing elevation tool: user can add or edit points (x, y, value).
- **Merge strategy:**  
  - **Option A:** Auto-terrain points are “baseline”; user points **override** within a small radius (e.g. nearest grid node replaced) or are **added** as extra vertices for the TIN.  
  - **Option B:** “Use IGN terrain” vs “Use my points only”: toggle or “Reset to IGN” so the user can replace current points with a fresh IGN fetch and then refine.
- So the client **can** still manually adjust or model the terrain as today.

### 3. Technical details

- **API base URL:** `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json`  
  (Documentation: [Service Géoplateforme de calcul altimétrique](https://geoservices.ign.fr/documentation/services/services-geoplateforme/altimetrie); Swagger: https://data.geopf.fr/altimetrie/swagger-ui/index.html)
- **Parameters:** `lon`, `lat` (lists, delimiter `|` or `;` or `,`), `resource=ign_rge_alti_wld`, `format=json`. Optional: `zonly=true` for a simple array of heights.
- **Rate limit:** 5 requests per second; one request with e.g. 100–400 points is enough per site, so no issue for normal use.
- **Coverage:** RGE ALTI® is for France (metropolitan + DOM). Points outside coverage return `z: -99999`; the app should detect and either fall back to BD ALTI or show a message (“No RGE ALTI for this location”).
- **CORS:** Call the IGN API from your **Next.js API route** (server-side), not from the browser, to avoid CORS and to centralise error/rate handling.
- **API key:** The public documentation does not mention a key for this calcul altimétrique service; if one is required later, it can be added in the server route (e.g. env `IGN_ALTIMETRY_API_KEY`).

---

## Implementation checklist

1. **Backend:** New route, e.g. `POST /api/projects/[id]/terrain-from-ign` (or `GET` with project id).
   - Input: project id (and optionally bbox/grid size).
   - Load project (coordinates, parcelGeometry); compute bbox; build (lon, lat) grid; call IGN; convert to (x, y, value) with same transform as site plan; return points (+ optional metadata).
2. **Coordinate conversion:** Reuse the same ref (e.g. parcel centroid) and `pixelsPerMeter` as in `parcelGeometryToCanvas` so that IGN points align with the parcel on the canvas. Either export a small helper that converts (lng, lat) → (x, y) for a given options bag, or compute the transform in the API using the same logic.
3. **Site plan / 3D:**
   - On load (or on “Load terrain from IGN”): call the new API; store result in `sitePlanData.terrainData.autoTerrain` (or equivalent) and merge into state used by the 3D viewer.
   - In **Inline3DViewer:** if `autoTerrain.points` exist, build a TIN (or a simple height grid) and replace the flat plane with the terrain mesh; keep elevation point markers and allow user points to override or supplement.
4. **UX:** Optional “Load terrain from IGN” button for on-demand refresh; optional “Use only my points” to ignore auto terrain; keep existing elevation tool for manual edits.

---

## RGE ALTI® vs WMTS

- **RGE ALTI® via REST** = numeric elevations per point → ideal for 3D mesh.
- **WMTS/WMS** = pre-rendered tiles (hillshade, colored elevation) → good for 2D background or visual reference, not for reconstructing a height field in the app unless you add a separate WCS-style or tile-decoding pipeline. So: use REST for auto 3D terrain; WMTS is optional for map styling.

---

## Conclusion

- **Feasible:** Yes.  
- **Best approach:** IGN REST elevation API with `resource=ign_rge_alti_wld`, called from your backend, grid over parcel (or centroid buffer), then (lon,lat,z) → (canvas x, y, value) and store/merge into site plan terrain.  
- **User experience:** Terrain can be automatic and still allow full manual adjustment or modelling.

If you want, the next step is to add the API route and the (lng,lat)→(x,y) helper and wire “Load terrain from IGN” (and optional auto-load on first 3D view) in the site plan page.
