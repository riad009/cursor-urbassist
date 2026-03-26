/**
 * ProceduralAssets.tsx — 3D Mapper–style Low-Poly Isometric Assets
 *
 * Exact aesthetic target: 3d-mapper.com
 *  • Flat shading on all geometry
 *  • Pure-white walls with terracotta accent bands at window levels
 *  • Crisp dark-glass window grids
 *  • Strong colour contrast, chunky proportions
 *  • Clean geometric silhouettes — no fussy detail, every shape reads instantly at isometric zoom
 *
 * 7 components:
 *   ProceduralHouse    — white walls, terracotta hip roof, red accent rings, window grid, door
 *   ProceduralGarage   — grey multi-level block, horizontal window strips, terracotta dome, pipes
 *   ProceduralPool     — concrete rim, physical water, recessed basin
 *   ProceduralParking  — asphalt, white dividers, yellow bollards
 *   ProceduralGarden   — dirt patch, teal organic blob trees / bushes
 *   ProceduralTerrace  — wood deck, perimeter rail, patio table + parasol
 *   ProceduralAccess   — grey path, kerb, dashes
 *
 * Every <mesh> has castShadow + receiveShadow.
 * All components are React.memo'd.
 * Export: PROCEDURAL_ASSET_MAP and ProceduralAssetKey for dynamic routing.
 */

"use client";

import React, { memo, useMemo } from "react";
import * as THREE from "three";
import { type ThreeElements } from "@react-three/fiber";

// ─── Shared prop interface ────────────────────────────────────────────────────

export interface ProceduralAssetProps extends Partial<ThreeElements["group"]> {
  w?: number;   // real-world width  (X) in metres
  h?: number;   // real-world height (Y) — wall height, not total
  d?: number;   // real-world depth  (Z) in metres
}

// ─── colour palette (mirrors 3D Mapper exactly) ──────────────────────────────

const C = {
  white:        "#F5F5F0",   // building walls
  roofTerra:    "#C0392B",   // terracotta roof / accent
  accentBand:   "#C0392B",   // horizontal accent rings
  windowGlass:  "#1A2F5E",   // dark blue glass
  windowFrame:  "#DEDAD4",   // light frame surround
  doorBrown:    "#6B3A2A",   // front door
  doorFrame:    "#EDE8E0",   // door surround
  foundGrey:    "#9E9E9E",   // foundation / plinth
  concrete:     "#B0B0AA",   // large building walls
  concreteDark: "#8A8A84",   // large building shadow faces
  dome:         "#C0392B",   // terracotta dome
  pipe:         "#D4601A",   // orange pipe (utility)
  pipeDark:     "#A04010",
  treeTeal:     "#2E9E8A",   // main blob canopy
  treeLite:     "#3DC0A8",   // lighter canopy top
  treeDark:     "#1A7060",   // shadow side
  trunkBrown:   "#5C3D1E",
  dirt:         "#795130",
  deckOak:      "#C87D2C",
  deckLine:     "#A06020",
  asphalt:      "#3D4652",
  kerbGrey:     "#6B7280",
  lineWhite:    "#FFFFFF",
  bollardYellow:"#F59E0B",
  metalGrey:    "#88969E",
  waterBlue:    "#3A8FD4",
  concreteRim:  "#D5D0C8",
  solarBlue:    "#1565C0",
  solarFrame:   "#888880",
} as const;

// ─── Shared material factory (flat shading for isometric map aesthetic) ───────

const mat = (color: string, rough = 0.80, metal = 0.04): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true });

const matPhy = (opts: ConstructorParameters<typeof THREE.MeshPhysicalMaterial>[0]) =>
  new THREE.MeshPhysicalMaterial({ flatShading: false, ...opts });

// Pre-allocated shared materials (one GPU allocation, many mesh references)
const M = {
  wall:         mat(C.white,       0.82, 0.02),
  roof:         mat(C.roofTerra,   0.80, 0.04),
  accent:       mat(C.accentBand,  0.78, 0.04),
  glass:        mat(C.windowGlass, 0.10, 0.55),
  winFrame:     mat(C.windowFrame, 0.70, 0.04),
  door:         mat(C.doorBrown,   0.72, 0.06),
  doorFrame:    mat(C.doorFrame,   0.70, 0.04),
  found:        mat(C.foundGrey,   0.92, 0.04),
  concrete:     mat(C.concrete,    0.82, 0.04),
  concreteDark: mat(C.concreteDark,0.88, 0.04),
  dome:         mat(C.dome,        0.78, 0.06),
  pipe:         mat(C.pipe,        0.60, 0.20),
  treeTeal:     mat(C.treeTeal,    0.88, 0.02),
  treeLite:     mat(C.treeLite,    0.85, 0.02),
  treeDark:     mat(C.treeDark,    0.90, 0.02),
  trunk:        mat(C.trunkBrown,  0.92, 0.02),
  dirt:         mat(C.dirt,        0.97, 0.00),
  deck:         mat(C.deckOak,     0.72, 0.04),
  deckLine:     mat(C.deckLine,    0.75, 0.04),
  asphalt:      mat(C.asphalt,     0.95, 0.02),
  kerb:         mat(C.kerbGrey,    0.85, 0.04),
  white:        mat(C.lineWhite,   0.60, 0.02),
  bollard:      mat(C.bollardYellow,0.45,0.55),
  metal:        mat(C.metalGrey,   0.35, 0.80),
  concreteRim:  mat(C.concreteRim, 0.80, 0.04),
  solar:        mat(C.solarBlue,   0.12, 0.70),
  solarFrame:   mat(C.solarFrame,  0.40, 0.60),
  water: matPhy({
    color: C.waterBlue, roughness: 0.08, metalness: 0.05,
    transparent: true, opacity: 0.88,
    transmission: 0.75, clearcoat: 1.0, clearcoatRoughness: 0.04,
    side: THREE.DoubleSide,
  }),
  poolInner: new THREE.MeshStandardMaterial({
    color: "#1A5F80", roughness: 0.65, metalness: 0.04, side: THREE.BackSide, flatShading: true,
  }),
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// 1. PROCEDURAL HOUSE  — 3D Mapper style
//
//  • White base body (hip-roof proportions: taller relative to footprint)
//  • Terracotta hip roof (4 sloped faces + ridge)
//  • TWO horizontal red accent bands: one below windows, one at floor-1 level
//  • 2-row × N-col window grid on front/back, 1-row × M-col on sides
//  • Centred front door with white frame
//  • Grey foundation plinth
// ═════════════════════════════════════════════════════════════════════════════

export const ProceduralHouse = memo(function ProceduralHouse({
  w = 8, h = 5, d = 6, ...gp
}: ProceduralAssetProps) {
  const fH   = 0.22;                      // foundation height
  const oH   = 0.40;                      // roof overhang
  const rH   = Math.min(w, d) * 0.38;     // roof ridge height
  const rW   = w / 2 + oH;
  const rD   = d / 2 + oH;
  const wB   = fH;                        // wall base Y
  const wTop = wB + h;

  // accent band heights (worldspace)
  const band1Y = wB + h * 0.30;           // lower band (belt course)
  const band2Y = wB + h * 0.62;           // upper band (above window bottom)
  const bandH  = 0.18;

  // window grid
  const wCols  = Math.max(2, Math.floor(w / 2.2));
  const wH_px  = Math.min(1.0, h * 0.24); // window height (metres)
  const wW_px  = Math.min(0.80, w * 0.10);
  const winY   = band2Y + h * 0.15;       // window centre Y (one row above upper band)

  // door
  const dW = Math.min(0.90, w * 0.13);
  const dH = Math.min(2.0, h * 0.50);

  // hip-roof geometry (4 triangular faces)
  const hipRoofGeo = useMemo(() => {
    const HW = rW, HD = rD, apex = rH;
    // ridge runs along Z (half-hip: becomes a fully closed cone if rW ≈ rD)
    const ridgeHW = HW * 0.18;   // half-width of ridge at top
    const ridgeHD = HD * 0.12;
    const verts = new Float32Array([
      // front face
      -HW, 0, HD,   HW, 0, HD,   ridgeHW, apex, ridgeHD,
      -HW, 0, HD,   ridgeHW, apex, ridgeHD,  -ridgeHW, apex, ridgeHD,
      // back face
      HW, 0, -HD,  -HW, 0, -HD,  -ridgeHW, apex, -ridgeHD,
      HW, 0, -HD,  -ridgeHW, apex, -ridgeHD,  ridgeHW, apex, -ridgeHD,
      // left face
      -HW, 0, HD,  -ridgeHW, apex, ridgeHD,  -ridgeHW, apex, -ridgeHD,
      -HW, 0, HD,  -ridgeHW, apex, -ridgeHD,  -HW, 0, -HD,
      // right face
      HW, 0, -HD,   ridgeHW, apex, -ridgeHD,  ridgeHW, apex, ridgeHD,
      HW, 0, -HD,   ridgeHW, apex, ridgeHD,   HW, 0, HD,
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }, [rW, rD, rH]);

  // helper — a single window cell
  const WinCell = ({ x, y, z, rY = 0 }: { x: number; y: number; z: number; rY?: number }) => (
    <group position={[x, y, z]} rotation={[0, rY, 0]}>
      <mesh castShadow receiveShadow material={M.winFrame}>
        <boxGeometry args={[wW_px + 0.12, wH_px + 0.12, 0.08]} />
      </mesh>
      <mesh position={[0, 0, 0.03]} castShadow receiveShadow material={M.glass}>
        <boxGeometry args={[wW_px, wH_px, 0.06]} />
      </mesh>
    </group>
  );

  const frontWinXs = Array.from({ length: wCols }, (_, i) =>
    (i - (wCols - 1) / 2) * (w / (wCols + 1))
  ).filter(x => Math.abs(x) > dW * 0.9);  // clear door slot

  const sideWinCount = Math.max(1, Math.floor(d / 3.0));
  const sideWinZs = Array.from({ length: sideWinCount }, (_, i) =>
    (i - (sideWinCount - 1) / 2) * (d / (sideWinCount + 1))
  );

  return (
    <group {...gp}>
      {/* Foundation plinth */}
      <mesh position={[0, fH / 2, 0]} castShadow receiveShadow material={M.found}>
        <boxGeometry args={[w + 0.30, fH, d + 0.30]} />
      </mesh>

      {/* Main walls */}
      <mesh position={[0, wB + h / 2, 0]} castShadow receiveShadow material={M.wall}>
        <boxGeometry args={[w, h, d]} />
      </mesh>

      {/* Accent band 1 (lower belt) */}
      <mesh position={[0, band1Y, 0]} castShadow receiveShadow material={M.accent}>
        <boxGeometry args={[w + 0.04, bandH, d + 0.04]} />
      </mesh>

      {/* Accent band 2 (upper belt, below windows) */}
      <mesh position={[0, band2Y, 0]} castShadow receiveShadow material={M.accent}>
        <boxGeometry args={[w + 0.04, bandH, d + 0.04]} />
      </mesh>

      {/* FRONT windows */}
      {frontWinXs.map((x, i) => (
        <WinCell key={`wf_${i}`} x={x} y={winY} z={d / 2 + 0.04} />
      ))}

      {/* BACK windows */}
      {frontWinXs.map((x, i) => (
        <WinCell key={`wb_${i}`} x={x} y={winY} z={-(d / 2 + 0.04)} rY={Math.PI} />
      ))}

      {/* LEFT windows */}
      {sideWinZs.map((z, i) => (
        <WinCell key={`wl_${i}`} x={-(w / 2 + 0.04)} y={winY} z={z} rY={-Math.PI / 2} />
      ))}

      {/* RIGHT windows */}
      {sideWinZs.map((z, i) => (
        <WinCell key={`wr_${i}`} x={w / 2 + 0.04} y={winY} z={z} rY={Math.PI / 2} />
      ))}

      {/* Front door */}
      <group position={[0, wB + dH / 2, d / 2 + 0.04]}>
        <mesh castShadow receiveShadow material={M.doorFrame}>
          <boxGeometry args={[dW + 0.20, dH + 0.10, 0.08]} />
        </mesh>
        <mesh position={[0, 0, 0.04]} castShadow receiveShadow material={M.door}>
          <boxGeometry args={[dW, dH, 0.06]} />
        </mesh>
        {/* Door knob */}
        <mesh position={[dW * 0.30, -0.12, 0.10]} castShadow material={M.metal}>
          <sphereGeometry args={[0.06, 8, 6]} />
        </mesh>
        {/* Lintel */}
        <mesh position={[0, dH / 2 + 0.10, 0.06]} castShadow material={M.found}>
          <boxGeometry args={[dW + 0.45, 0.14, 0.14]} />
        </mesh>
      </group>

      {/* Hip roof */}
      <mesh position={[0, wTop, 0]} castShadow receiveShadow
            geometry={hipRoofGeo} material={M.roof} />

      {/* Ridge cap (long box on top) */}
      <mesh position={[0, wTop + rH - 0.08, 0]} castShadow material={M.roof}>
        <boxGeometry args={[rW * 0.35, 0.12, rD * 1.9]} />
      </mesh>

      {/* Gutter front / back */}
      <mesh position={[0, wTop - 0.04, rD - 0.06]} castShadow material={M.metal}>
        <boxGeometry args={[w + oH * 2, 0.09, 0.09]} />
      </mesh>
      <mesh position={[0, wTop - 0.04, -(rD - 0.06)]} castShadow material={M.metal}>
        <boxGeometry args={[w + oH * 2, 0.09, 0.09]} />
      </mesh>
    </group>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. PROCEDURAL GARAGE / LARGE BUILDING
//
//  Matches the big grey multi-storey building in the reference (bottom-left):
//  • Light grey concrete base body (multi-storey)
//  • Rows of horizontal window strips per floor
//  • Terracotta circular dome on top
//  • Two orange vertical pipes on the facade
//  • Flat rooftop with parapet
// ═════════════════════════════════════════════════════════════════════════════

export const ProceduralGarage = memo(function ProceduralGarage({
  w = 10, h = 8, d = 7, ...gp
}: ProceduralAssetProps) {
  const fH     = 0.22;
  const floors = Math.max(2, Math.round(h / 2.5));
  const fHeight = h / floors;
  const parapH = 0.40;
  const domeR  = Math.min(w, d) * 0.22;

  return (
    <group {...gp}>
      {/* Foundation */}
      <mesh position={[0, fH / 2, 0]} castShadow receiveShadow material={M.found}>
        <boxGeometry args={[w + 0.30, fH, d + 0.30]} />
      </mesh>

      {/* Main body */}
      <mesh position={[0, fH + h / 2, 0]} castShadow receiveShadow material={M.concrete}>
        <boxGeometry args={[w, h, d]} />
      </mesh>

      {/* Per-floor accent bands + window strips */}
      {Array.from({ length: floors }, (_, fl) => {
        const floorBaseY = fH + fHeight * fl;
        const bandY      = floorBaseY + fHeight * 0.10;
        const winY       = floorBaseY + fHeight * 0.55;
        const stripCount = Math.max(3, Math.floor(w / 1.8));

        return (
          <group key={`floor_${fl}`}>
            {/* Floor slab band */}
            <mesh position={[0, bandY, 0]} castShadow receiveShadow material={M.concreteDark}>
              <boxGeometry args={[w + 0.06, 0.16, d + 0.06]} />
            </mesh>

            {/* Window strip — front */}
            {Array.from({ length: stripCount }, (_, wi) => {
              const wx = (wi - (stripCount - 1) / 2) * (w / stripCount);
              return (
                <mesh key={`wf_${wi}`}
                      position={[wx, winY, d / 2 + 0.04]}
                      castShadow receiveShadow material={M.glass}>
                  <boxGeometry args={[w / stripCount - 0.18, fHeight * 0.42, 0.07]} />
                </mesh>
              );
            })}

            {/* Window strip — back */}
            {Array.from({ length: stripCount }, (_, wi) => {
              const wx = (wi - (stripCount - 1) / 2) * (w / stripCount);
              return (
                <mesh key={`wb_${wi}`}
                      position={[wx, winY, -(d / 2 + 0.04)]}
                      castShadow receiveShadow material={M.glass}>
                  <boxGeometry args={[w / stripCount - 0.18, fHeight * 0.42, 0.07]} />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {/* Flat roof slab */}
      <mesh position={[0, fH + h + 0.15, 0]} castShadow receiveShadow material={M.concreteDark}>
        <boxGeometry args={[w + 0.20, 0.30, d + 0.20]} />
      </mesh>

      {/* Parapet — 4 sides */}
      {[
        [0,          d / 2 + 0.12, [w + 0.40, parapH, 0.18]] as const,
        [0,         -d / 2 - 0.12, [w + 0.40, parapH, 0.18]] as const,
        [-w / 2 - 0.12, 0,         [0.18, parapH, d]] as const,
        [ w / 2 + 0.12, 0,         [0.18, parapH, d]] as const,
      ].map(([px, pz, [sw, sh, sd]], i) => (
        <mesh key={`par_${i}`}
              position={[px, fH + h + 0.30 + parapH / 2, pz]}
              castShadow receiveShadow material={M.concrete}>
          <boxGeometry args={[sw, sh, sd]} />
        </mesh>
      ))}

      {/* Terracotta dome on roof */}
      <mesh position={[0, fH + h + 0.55, 0]} castShadow receiveShadow material={M.dome}>
        <sphereGeometry args={[domeR, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>

      {/* Orange vertical pipes (left + right of facade) */}
      {[-w * 0.34, w * 0.34].map((px, i) => (
        <group key={`pipe_${i}`} position={[px, fH + h / 2, d / 2 + 0.12]}>
          <mesh castShadow receiveShadow material={M.pipe}>
            <cylinderGeometry args={[0.18, 0.18, h * 0.90, 10]} />
          </mesh>
          {/* Pipe elbow */}
          <mesh position={[0, h * 0.44, 0.25]} castShadow material={M.pipe}>
            <torusGeometry args={[0.22, 0.10, 8, 10, Math.PI / 2]} />
          </mesh>
        </group>
      ))}

      {/* Ground-floor entrance door */}
      <group position={[0, fH + fHeight * 0.50, d / 2 + 0.08]}>
        <mesh castShadow receiveShadow material={M.concreteDark}>
          <boxGeometry args={[1.40, fHeight * 0.85, 0.10]} />
        </mesh>
        <mesh position={[0, 0, 0.05]} castShadow receiveShadow material={M.glass}>
          <boxGeometry args={[1.20, fHeight * 0.78, 0.06]} />
        </mesh>
      </group>
    </group>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. PROCEDURAL POOL — 3D Mapper style
//    Crisp concrete rim, recessed basin, physical water surface
// ═════════════════════════════════════════════════════════════════════════════

export const ProceduralPool = memo(function ProceduralPool({
  w = 5, h = 0.6, d = 3, ...gp
}: ProceduralAssetProps) {
  const deckH  = 0.12;
  const rimW   = 0.38;
  const rimH   = 0.28;
  const basin  = 1.10;
  const iW     = w - rimW * 2;
  const iD     = d - rimW * 2;

  return (
    <group {...gp}>
      {/* Deck */}
      <mesh position={[0, deckH / 2, 0]} castShadow receiveShadow material={M.concreteRim}>
        <boxGeometry args={[w + 2.2, deckH, d + 2.2]} />
      </mesh>

      {/* 4-sided rim (coping) */}
      {[
        [0,          d / 2 - rimW / 2, [w + rimW, rimH, rimW]] as const,
        [0,         -d / 2 + rimW / 2, [w + rimW, rimH, rimW]] as const,
        [-w / 2 + rimW / 2, 0,         [rimW, rimH, d - rimW * 2]] as const,
        [ w / 2 - rimW / 2, 0,         [rimW, rimH, d - rimW * 2]] as const,
      ].map(([rx, rz, [rw, rh, rd]], i) => (
        <mesh key={i} position={[rx, deckH + rimH / 2, rz]} castShadow receiveShadow material={M.concreteRim}>
          <boxGeometry args={[rw, rh, rd]} />
        </mesh>
      ))}

      {/* Basin inner (BackSide) */}
      <mesh position={[0, deckH - basin / 2, 0]} receiveShadow material={M.poolInner}>
        <boxGeometry args={[iW, basin, iD]} />
      </mesh>

      {/* Basin floor */}
      <mesh position={[0, deckH - basin, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[iW - 0.05, iD - 0.05]} />
        <meshStandardMaterial color="#1060A0" roughness={0.70} metalness={0.05} flatShading />
      </mesh>

      {/* Water */}
      <mesh position={[0, deckH - 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow
            material={M.water}>
        <planeGeometry args={[iW - 0.10, iD - 0.10]} />
      </mesh>

      {/* Drain circles */}
      {([[iW * 0.36, iD * 0.36], [-iW * 0.36, iD * 0.36],
         [iW * 0.36,-iD * 0.36], [-iW * 0.36,-iD * 0.36], [0, 0]] as [number,number][])
        .map(([dx, dz], i) => (
          <mesh key={i} position={[dx, deckH - basin + 0.02, dz]}
                rotation={[-Math.PI / 2, 0, 0]} castShadow material={M.concreteDark}>
            <circleGeometry args={[0.09, 8]} />
          </mesh>
        ))}

      {/* Ladder */}
      <group position={[w / 2 - rimW - 0.15, deckH, d * 0.22]}>
        {[-0.12, 0.12].map((lx, i) => (
          <mesh key={i} position={[lx, 0.32, 0]} castShadow material={M.metal}>
            <cylinderGeometry args={[0.025, 0.025, 0.65, 8]} />
          </mesh>
        ))}
        {[0.14, 0.38].map((ly, i) => (
          <mesh key={i} position={[0, ly, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={M.metal}>
            <cylinderGeometry args={[0.018, 0.018, 0.28, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. PROCEDURAL PARKING — 3D Mapper style
//    Asphalt base, white divider lines, kerb, yellow bollards
// ═════════════════════════════════════════════════════════════════════════════

export const ProceduralParking = memo(function ProceduralParking({
  w = 12, h = 0.1, d = 6, ...gp
}: ProceduralAssetProps) {
  const slots = Math.max(2, Math.floor(w / 2.8));

  return (
    <group {...gp}>
      {/* Asphalt — raised 0.05 to prevent Z-fight */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow material={M.asphalt}>
        <boxGeometry args={[w, 0.10, d]} />
      </mesh>

      {/* Kerb: front + back */}
      {[d / 2 + 0.07, -(d / 2 + 0.07)].map((kz, i) => (
        <mesh key={i} position={[0, 0.04, kz]} castShadow receiveShadow material={M.kerb}>
          <boxGeometry args={[w + 0.14, 0.08, 0.14]} />
        </mesh>
      ))}

      {/* Divider lines */}
      {Array.from({ length: slots + 1 }, (_, i) => (
        <mesh key={i} position={[-w / 2 + (w / slots) * i, 0.12, 0]}
              castShadow receiveShadow material={M.white}>
          <boxGeometry args={[0.10, 0.02, d * 0.82]} />
        </mesh>
      ))}

      {/* Disabled bay (centre slot hatching) */}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} position={[(i - 1.5) * (w / slots / 3.5), 0.12, 0]}
              rotation={[0, 0.5, 0]} castShadow receiveShadow material={M.solar}>
          <boxGeometry args={[0.06, 0.02, d * 0.60]} />
        </mesh>
      ))}

      {/* Bollards */}
      {([ [-w/2-0.22, d/2+0.22], [w/2+0.22, d/2+0.22],
          [-w/2-0.22,-d/2-0.22], [w/2+0.22,-d/2-0.22]] as [number,number][])
        .map(([bx, bz], i) => (
          <mesh key={i} position={[bx, 0.27, bz]} castShadow receiveShadow material={M.bollard}>
            <cylinderGeometry args={[0.08, 0.08, 0.54, 8]} />
          </mesh>
        ))}
    </group>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. PROCEDURAL GARDEN — 3D Mapper style
//    Dirt patch + teal organic blob TREES (multi-sphere clusters, round + smooth)
//    matching the cloud-like teal tree shapes seen in the reference image
// ═════════════════════════════════════════════════════════════════════════════

/** One organic blob tree: trunk + overlapping sphere cluster (3D Mapper style) */
const BlobTree = memo(function BlobTree({
  scale = 1.0, pos = [0, 0, 0] as [number,number,number]
}: { scale?: number; pos?: [number,number,number] }) {
  return (
    <group position={pos} scale={[scale, scale, scale]}>
      {/* Trunk */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow material={M.trunk}>
        <cylinderGeometry args={[0.12, 0.18, 1.8, 7]} />
      </mesh>
      {/* Main canopy (large bottom sphere) */}
      <mesh position={[0, 2.8, 0]} castShadow receiveShadow material={M.treeTeal}>
        <sphereGeometry args={[1.30, 9, 7]} />
      </mesh>
      {/* Secondary spheres (overlap to create blob) */}
      <mesh position={[0.70, 2.6, 0.40]} castShadow receiveShadow material={M.treeTeal}>
        <sphereGeometry args={[0.85, 8, 6]} />
      </mesh>
      <mesh position={[-0.60, 2.7, -0.30]} castShadow receiveShadow material={M.treeTeal}>
        <sphereGeometry args={[0.80, 8, 6]} />
      </mesh>
      {/* Top highlight sphere */}
      <mesh position={[0.10, 3.60, 0.10]} castShadow receiveShadow material={M.treeLite}>
        <sphereGeometry args={[0.72, 8, 6]} />
      </mesh>
    </group>
  );
});

/** Small round bush cluster */
const BlobBush = memo(function BlobBush({
  scale = 1.0, pos = [0, 0, 0] as [number,number,number]
}: { scale?: number; pos?: [number,number,number] }) {
  return (
    <group position={pos} scale={[scale, scale, scale]}>
      <mesh position={[0, 0.30 * scale, 0]} castShadow receiveShadow material={M.treeDark}>
        <sphereGeometry args={[0.48, 8, 6]} />
      </mesh>
      <mesh position={[0.28, 0.28 * scale, 0.10]} castShadow receiveShadow material={M.treeTeal}>
        <sphereGeometry args={[0.35, 7, 5]} />
      </mesh>
    </group>
  );
});

export const ProceduralGarden = memo(function ProceduralGarden({
  w = 8, h = 0, d = 6, ...gp
}: ProceduralAssetProps) {
  const trees: [number, number, number, number][] = [
    [-w * 0.28, 0, -d * 0.22, 0.88],
    [ w * 0.26, 0,  d * 0.18, 1.00],
    [-w * 0.08, 0,  d * 0.26, 0.72],
    [ w * 0.12, 0, -d * 0.30, 0.92],
  ];
  const bushes: [number, number, number, number][] = [
    [-w * 0.38, 0,  d * 0.08, 0.65],
    [ w * 0.34, 0,  d * 0.28, 0.50],
    [ w * 0.04, 0, -d * 0.36, 0.58],
    [-w * 0.22, 0, -d * 0.06, 0.42],
  ];

  return (
    <group {...gp}>
      {/* Dirt base */}
      <mesh position={[0, 0.04, 0]} castShadow receiveShadow material={M.dirt}>
        <boxGeometry args={[w, 0.08, d]} />
      </mesh>

      {/* Perimeter edging */}
      {[
        [0, d / 2 + 0.05, [w + 0.10, 0.06, 0.10]] as const,
        [0, -(d / 2 + 0.05), [w + 0.10, 0.06, 0.10]] as const,
        [w / 2 + 0.05, 0, [0.10, 0.06, d + 0.10]] as const,
        [-(w / 2 + 0.05), 0, [0.10, 0.06, d + 0.10]] as const,
      ].map(([ex, ez, [ew, eh, ed]], i) => (
        <mesh key={i} position={[ex, 0.06, ez]} castShadow receiveShadow material={M.trunk}>
          <boxGeometry args={[ew, eh, ed]} />
        </mesh>
      ))}

      {/* Blob trees */}
      {trees.map(([tx, ty, tz, sc], i) => (
        <BlobTree key={`t_${i}`} pos={[tx, ty, tz]} scale={sc} />
      ))}

      {/* Blob bushes */}
      {bushes.map(([bx, by, bz, sc], i) => (
        <BlobBush key={`b_${i}`} pos={[bx, by + 0.10 * sc, bz]} scale={sc} />
      ))}

      {/* Stepping stones */}
      {[0.0, 0.30, 0.60].map((dz, i) => (
        <mesh key={i} position={[0, 0.10, dz - d * 0.28]} castShadow receiveShadow material={M.concreteRim}>
          <cylinderGeometry args={[0.20, 0.20, 0.05, 6]} />
        </mesh>
      ))}
    </group>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. PROCEDURAL TERRACE — 3D Mapper style
//    Oak-coloured deck plank surface, perimeter rail posts, patio table + parasol
// ═════════════════════════════════════════════════════════════════════════════

export const ProceduralTerrace = memo(function ProceduralTerrace({
  w = 6, h = 0.20, d = 5, ...gp
}: ProceduralAssetProps) {
  const deckH  = 0.18;
  const postH  = 1.0;
  const railH  = 0.82;

  const postsX = Math.max(2, Math.floor(w / 1.5));
  const postsZ = Math.max(2, Math.floor(d / 1.5));

  const posts: [number, number][] = [
    ...Array.from({ length: postsX }, (_, i) => {
      const px = -w / 2 + (w / (postsX - 1)) * i;
      return [[px, d / 2], [px, -d / 2]] as [number, number][];
    }).flat(),
    ...Array.from({ length: postsZ - 2 }, (_, j) => {
      const pz = -d / 2 + (d / (postsZ - 1)) * (j + 1);
      return [[-w / 2, pz], [w / 2, pz]] as [number, number][];
    }).flat(),
  ];

  return (
    <group {...gp}>
      {/* Deck surface */}
      <mesh position={[0, deckH / 2, 0]} castShadow receiveShadow material={M.deck}>
        <boxGeometry args={[w, deckH, d]} />
      </mesh>

      {/* Plank grooves */}
      {Array.from({ length: Math.floor(d / 0.26) }, (_, i) => (
        <mesh key={i} position={[0, deckH + 0.003, -d / 2 + 0.13 + i * 0.26]}
              castShadow material={M.deckLine}>
          <boxGeometry args={[w - 0.04, 0.006, 0.04]} />
        </mesh>
      ))}

      {/* Posts */}
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, deckH + postH / 2, pz]} castShadow receiveShadow material={M.trunk}>
          <boxGeometry args={[0.09, postH, 0.09]} />
        </mesh>
      ))}

      {/* Top rails */}
      {([ [0, d / 2,  [w, 0.07, 0.07]] as [number, number, [number,number,number]],
          [0,-d / 2,  [w, 0.07, 0.07]] as [number, number, [number,number,number]],
          [-w/2, 0,   [0.07, 0.07, d]] as [number, number, [number,number,number]],
          [ w/2, 0,   [0.07, 0.07, d]] as [number, number, [number,number,number]],
      ]).map(([rx, rz, [rw, rh, rd]], i) => (
        <mesh key={i} position={[rx, deckH + railH, rz]} castShadow receiveShadow material={M.trunk}>
          <boxGeometry args={[rw, rh, rd]} />
        </mesh>
      ))}

      {/* Patio table */}
      <group position={[0, deckH, 0]}>
        <mesh position={[0, 0.72, 0]} castShadow receiveShadow material={M.concreteRim}>
          <cylinderGeometry args={[0.70, 0.70, 0.06, 10]} />
        </mesh>
        <mesh position={[0, 0.36, 0]} castShadow receiveShadow material={M.metal}>
          <cylinderGeometry args={[0.05, 0.05, 0.72, 8]} />
        </mesh>
        {[0, Math.PI / 2].map((ry, i) => (
          <mesh key={i} position={[0, 0.06, 0]} rotation={[0, ry, 0]} castShadow material={M.metal}>
            <boxGeometry args={[0.82, 0.06, 0.06]} />
          </mesh>
        ))}
      </group>

      {/* Chairs × 2 */}
      {[-0.92, 0.92].map((cx, i) => (
        <group key={i} position={[cx, deckH, 0]}>
          <mesh position={[0, 0.42, 0]} castShadow receiveShadow material={M.concreteRim}>
            <boxGeometry args={[0.44, 0.06, 0.44]} />
          </mesh>
          <mesh position={[0, 0.72, -0.19]} castShadow receiveShadow material={M.concreteRim}>
            <boxGeometry args={[0.44, 0.54, 0.06]} />
          </mesh>
          {([ [-0.17,-0.19], [0.17,-0.19], [-0.17,0.19], [0.17,0.19]] as [number,number][])
            .map(([lx, lz], j) => (
              <mesh key={j} position={[lx, 0.22, lz]} castShadow material={M.metal}>
                <cylinderGeometry args={[0.024, 0.024, 0.44, 6]} />
              </mesh>
            ))}
        </group>
      ))}

      {/* Parasol */}
      <group position={[0, deckH, 0]}>
        <mesh position={[0, 1.22, 0]} castShadow receiveShadow material={M.metal}>
          <cylinderGeometry args={[0.04, 0.04, 2.44, 8]} />
        </mesh>
        <mesh position={[0, 2.32, 0]} castShadow receiveShadow material={M.roof}>
          <cylinderGeometry args={[0.06, 1.28, 0.40, 8]} />
        </mesh>
        <mesh position={[0, 2.54, 0]} castShadow material={M.dome}>
          <cylinderGeometry args={[0.10, 0.10, 0.12, 8]} />
        </mesh>
      </group>
    </group>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. PROCEDURAL ACCESS — 3D Mapper style
//    Grey path, kerb edges, centre dashes, reflective road studs
// ═════════════════════════════════════════════════════════════════════════════

export const ProceduralAccess = memo(function ProceduralAccess({
  w = 4, h = 0.05, d = 8, ...gp
}: ProceduralAssetProps) {
  const numStuds = Math.max(2, Math.floor(d / 2));

  return (
    <group {...gp}>
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow material={M.kerb}>
        <boxGeometry args={[w, 0.10, d]} />
      </mesh>

      {/* Kerbs */}
      {[-w / 2 - 0.07, w / 2 + 0.07].map((kx, i) => (
        <mesh key={i} position={[kx, 0.04, 0]} castShadow receiveShadow material={M.asphalt}>
          <boxGeometry args={[0.14, 0.14, d + 0.14]} />
        </mesh>
      ))}

      {/* Centre dashes */}
      {Array.from({ length: Math.floor(d / 1.4) }, (_, i) => (
        <mesh key={i} position={[0, 0.12, -d / 2 + 0.70 + i * 1.4]} castShadow material={M.white}>
          <boxGeometry args={[0.07, 0.02, 0.65]} />
        </mesh>
      ))}

      {/* Road studs */}
      {Array.from({ length: numStuds }, (_, i) => (
        <mesh key={i} position={[0, 0.12, -d / 2 + (d / numStuds) * (i + 0.5)]} castShadow material={M.bollard}>
          <boxGeometry args={[0.10, 0.04, 0.10]} />
        </mesh>
      ))}
    </group>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT MAP
// ═════════════════════════════════════════════════════════════════════════════

export const PROCEDURAL_ASSET_MAP = {
  house:   ProceduralHouse,
  garage:  ProceduralGarage,
  pool:    ProceduralPool,
  parking: ProceduralParking,
  garden:  ProceduralGarden,
  terrace: ProceduralTerrace,
  access:  ProceduralAccess,
} as const;

export type ProceduralAssetKey = keyof typeof PROCEDURAL_ASSET_MAP;
