# Step 2 – Site Plan (Core of the Platform)

This is where the user actually "builds" their project. Everything drawn here is used to:
- Verify PLU compliance
- Generate sections
- Generate elevations
- Ensure landscape integration
- Populate the descriptive report

---

## 2.1 View & Display Modes

**Default:** 2D top-down view.

**Required features:**
- "View in 3D" button
- 3D view: modeled terrain, existing buildings, user-drawn project
- Smooth toggle between 2D ↔ 3D

**UX/UI enhancements:**
- Floating tool panels with intuitive icons + explanatory tooltips
- Full-screen mode available
- Real-time dynamic visual feedback

---

## 2.2 Automatic Data on Load

**Selected parcels:**
- Automatic retrieval of all selected parcel boundaries
- Dimensions of each segment
- Total site area

**Existing buildings (cadastre data):**
- Footprint, dimensions, distances to property boundaries
- Default representation: simple cubes, editable (roof type, openings, materials)

**Automatic surface table:**
- Existing footprint, green areas, impermeable surfaces, semi-permeable surfaces

---

## 2.3 Footprint Logic – Smart (PLU-Dependent)

**Default:** Footprint = wall outline; roof overhangs excluded.

**If PLU rules require adjustments:** Detected via AI analysis; user specifies roof overhang.

**System behavior:**
- Visually displays actual footprint contour
- Automatically calculates the regulatory footprint

**Recommended visual UX:** Building outline: solid line; final footprint: special line (e.g., red dashed).

---

## 2.4 Mandatory Tools (Blocking)

- **Site access:** Triangle symbol, automatic "Access" label
- **Parking:** 5.00 × 2.50 m rectangle + schematic car representation
- **Utilities:** Potable water, wastewater, stormwater, electricity, telecom, gas (optional); drawn as segments; user prompted to add all utilities but can choose not to draw them; "Not applicable" option mandatory
- **Fences:** 2D freeform drawing tool; draw walls manually or use quick rectangle tool; editable width/length

---

## 2.5 Altimetry & 3D Terrain Modeling

- Click to place elevation points (e.g. 0.00 / -0.20 / +1.50)
- 3D terrain (TIN) automatically updates with each point added
- Used for: sections, elevations, and landscape integration

---

## 2.6 Project Tools (Core Functionality)

**Quick Construction**
- Buildings or pools: input width, length, total height; roof type, number of levels, level heights; place directly on the plan; set altitude to position accurately on terrain; automatic dimension annotations

**Complex Extensions / Modular Homes**
- Draw by level (ground floor, upper floor); place openings (doors, windows, garage doors); shutter options: hinged or rolling; automatic dimension annotations; editable dimensions anytime

**Free Wall Drawing**
- Draw individual walls; automatic wall connection; quick rectangle tool for full buildings; width/length editable anytime

**Pools**
- Dimensions (L × W); free orientation; place on the plan and set altitude; automatic dimension annotations

---

## 2.7 Surfaces & Smart Labels

- Free shapes / rectangles / circles
- Mandatory categories: impermeable / semi-permeable
- Explanatory tooltips (e.g. gravel, concrete)
- Automatic label on shape addition (e.g. "Gravel driveway")
- Surface calculated automatically and updates table

---

## 2.8 Real-Time PLU Alerts (Error Prevention)

- Checked for every drawing or movement

**Example alerts:** Pool too close to property boundary (Current: 2.10 m / Minimum PLU: 3.00 m); footprint exceeded; height exceeded; insufficient parking (minimum 2 spaces).

**Visual feedback:** Red highlight + badge + discrete banner.

---

## 2.9 Automatic Elements

- North rose
- Graphic scale
- Section line (user-placed)

---

## 2.10 Validation

- Paper size: A4 / A3 (A3 recommended)
- Status: ✅ Site plan completed

---

## UX/UI Enhancements for Beginners

- Interactive tutorial + built-in examples
- Contextual explanatory tooltips for each tool
- Intelligent assistant: PLU suggestions and auto-corrections
- Snap and automatic alignment for buildings, walls, fences
- Unlimited undo/redo, preview mode
- Visual checklist by stage: terrain → buildings → utilities → surfaces → validation
- Real-time visual feedback for each action
- Smart colors/transparencies: legal footprint = light red; proposed footprint = blue; PLU violation = bright red + pop-up
- Automatic dynamic dimensioning and surface updates

---

## Implementation Compliance

| Section | Requirement | Status | Notes |
|---------|-------------|--------|-------|
| **2.1** | Default 2D top-down | ✅ | Default `viewMode` is `"2d"` |
| 2.1 | "View in 3D" button | ✅ | Toolbar: 2D / View in 3D toggle with tooltip |
| 2.1 | 3D: terrain, existing buildings, user project | ✅ | `Inline3DViewer`: ground plane, buildings with roof/overhang, north arrow |
| 2.1 | Smooth 2D ↔ 3D toggle | ✅ | Single click switches view |
| 2.1 | Floating tool panels + tooltips | ✅ | Left toolbar with explanatory tooltips per tool |
| 2.1 | Full-screen mode | ✅ | Full-screen toggle (Maximize2/Minimize2) |
| 2.1 | Real-time visual feedback | ✅ | Mouse position, measurement overlay, placement hint |
| **2.2** | Selected parcel boundaries | ✅ | Parcel geometry from project; auto-drawn on load; Land Parcel tool for manual |
| 2.2 | Dimensions per segment | ✅ | Auto dimension lines on rectangles/polygons/lines |
| 2.2 | Total site area | ✅ | From project `parcelArea`; Footprint table |
| 2.2 | Existing buildings | ✅ | OSM via `/api/existing-buildings`; editable in Building panel |
| 2.2 | Cubes, editable (roof, openings, materials) | ✅ | BuildingDetailPanel + 3D viewer |
| 2.2 | Automatic surface table | ✅ | FootprintTable: existing, green, impermeable/semi-permeable |
| **2.3** | Default footprint = wall outline, overhangs excluded | ✅ | `includeOverhangInFootprint` from PLU; default false |
| 2.3 | User specifies overhang when PLU requires | ✅ | Building panel: roof overhang (m); PLU Analysis persisted |
| 2.3 | Actual + regulatory footprint | ✅ | FootprintTable; compliance API |
| 2.3 | Building outline solid; regulatory dashed (e.g. red) | ✅ | Regulatory footprint overlay: dashed red rect per building |
| **2.4** | Site access: triangle + "Access" label | ✅ | Template: Access (triangle + label) |
| 2.4 | Parking 5.00×2.50 m + car | ✅ | Template "Parking 2.5×5 m"; label on shape |
| 2.4 | Utilities + N/A option | ✅ | VRD tool with types; "N/A" option |
| 2.4 | Fences: freeform or rectangle, editable | ✅ | Line + Rectangle tools; dimensions in properties |
| **2.5** | Elevation points (e.g. 0.00 / -0.20 / +1.50) | ✅ | Elevation tool: click → prompt → circle + label; persisted in undo |
| 2.5 | 3D terrain (TIN) updates with points | ✅ | Elevation points in Inline3DViewer (markers); full TIN optional later |
| 2.5 | Used for sections, elevations, landscape | ✅ | Feeds building 3D and terrain data |
| **2.6** | Quick construction: dimensions, roof, levels, place, altitude | ✅ | Guided creation + presets; BuildingDetailPanel; 3D altitude |
| 2.6 | Complex extensions: by level, openings, shutters | ✅ | Building panel: wall heights, openings; shutter option (hinged/rolling) |
| 2.6 | Free wall drawing, quick rectangle, editable | ✅ | Line, Rectangle, Polygon; properties + auto-measurements |
| 2.6 | Pools: L×W, orientation, place, altitude | ✅ | Pool template; dimensions |
| 2.6 | Automatic dimension annotations | ✅ | Dimension lines on rect, polygon, line, circle |
| **2.7** | Free shapes / rectangles / circles | ✅ | Polygon, Rectangle, Circle tools |
| 2.7 | Impermeable / semi-permeable + tooltips | ✅ | Surface types with tooltips |
| 2.7 | Auto label on shape | ✅ | Template labels; element name in properties |
| 2.7 | Surface in table | ✅ | FootprintTable surface breakdown |
| **2.8** | Check on every draw/move | ✅ | Debounced compliance on object add/modify |
| 2.8 | Example alerts (distance, footprint, height, parking) | ✅ | `/api/compliance`; displayed in panel |
| 2.8 | Red highlight + badge + banner | ✅ | Violation banner at top; compliance panel colors |
| **2.9** | North rose | ✅ | North arrow button; 3D north cone |
| 2.9 | Graphic scale | ✅ | Scale bar + scale label (1:100, etc.) bottom-left |
| 2.9 | Section line (user-placed) | ✅ | Section tool: dashed pink `isSectionLine` |
| **2.10** | Paper size A4 / A3 (A3 recommended) | ✅ | Paper size selector; default A3 |
| 2.10 | Status: ✅ Site plan completed | ✅ | When can proceed (named elements, green %, content) |
| **UX** | Tutorial + examples | ✅ | Tutorial modal; "Load example" (Access + Parking + House) |
| UX | Contextual tooltips | ✅ | Per-tool and per-surface tooltips |
| UX | Snap and alignment | ✅ | Snap toggle in toolbar |
| UX | Undo/redo, preview | ✅ | Undo2/Redo2; elevation sync; preview mode |
| UX | Visual checklist by stage | ✅ | Guided steps; Layers / Buildings / Footprint tabs |
| UX | Smart colors | ✅ | Compliance panel; footprint table (green/red) |

---

**Summary:** The Site Plan step combines fast drawing, smart automation, beginner guidance, and real-time PLU feedback. Users can place buildings and pools with altitude, draw walls and fences, generate 3D terrain from elevation points, receive PLU alerts and automatic surface calculations, and validate a plan ready for sections, elevations, and the descriptive report.
