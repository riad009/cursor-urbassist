"use client";

/**
 * ElevationSVG — Shared SVG Renderer for PC5 Elevation Panels
 *
 * Thin React component that maps an ElevationLayout (from elevation-layout.ts)
 * to SVG elements. Contains zero geometry logic — all positions are pre-computed.
 *
 * Used by both PC51InlinePreview.tsx and PC52InlinePreview.tsx.
 */

import React from "react";
import type { ElevationLayout, BuildingLayout, WindowLayout, DimLine, MatAnnotation, SetbackDim, SecondaryBuildingLayout } from "@/lib/pdf/elevation-layout";

// ─── Colors ────────────────────────────────────────────────────────────────

const CLR = {
  BOUNDARY: "#DC0000",
  GROUND: "#000000",
  HATCH: "#555555",
  TN_MARKER: "#F97316",
  TF_MARKER: "#228B22",
  WALLS: "#F5F0DC",
  WALLS_STROKE: "#333333",
  ROOF: "#64594E",
  ROOF_STROKE: "#3C3530",
  WINDOW: "#b0d8f0",
  WINDOW_FRAME: "#334155",
  DOOR: "#6E4628",
  DOOR_FRAME: "#3A2010",
  CHIMNEY: "#8C7864",
  CHIMNEY_CAP: "#504640",
  DIM_BOX: "#1E3A8A",
  DIM_TEXT: "#FFFFFF",
  GRASS: "#78B450",
  MAT_LEADER: "#1E3A8A",
  MUTED: "#94a3b8",
  LABEL: "#64748b",
  FOUNDATION: "#A0A0A0",
  FASCIA: "#4A4040",
  LINTEL: "#888",
  PROJECTED_BG: "#059669",
  PROJECTED_TEXT: "#FFFFFF",
};

// ─── Sub-Components ────────────────────────────────────────────────────────

function HatchDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern
        id={id}
        width="5"
        height="5"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="5" stroke={CLR.HATCH} strokeWidth="0.6" />
      </pattern>
    </defs>
  );
}

function Underground({ layout, hatchId }: { layout: ElevationLayout; hatchId: string }) {
  const { hatch } = layout;
  return (
    <rect
      x={hatch.leftX}
      y={hatch.topY}
      width={hatch.rightX - hatch.leftX}
      height={hatch.bottomY - hatch.topY}
      fill={`url(#${hatchId})`}
    />
  );
}

function GroundLine({ layout }: { layout: ElevationLayout }) {
  const { ground } = layout;
  return (
    <line
      x1={ground.leftX}
      y1={ground.leftY}
      x2={ground.rightX}
      y2={ground.rightY}
      stroke={CLR.GROUND}
      strokeWidth="2.5"
    />
  );
}

function GrassVegetation({ layout }: { layout: ElevationLayout }) {
  const { ground, viewport } = layout;
  const startX = 10;
  const width = viewport.w - 20;
  const count = Math.floor(width / 12);
  const tufts: React.ReactNode[] = [];

  for (let i = 0; i < count; i++) {
    const x = startX + i * (width / count) + 3;
    const h = 3 + (i % 3) * 1.2;
    const yAtX = ground.slopeAngle !== 0
      ? ground.leftY + ((ground.rightY - ground.leftY) * ((x - ground.leftX) / (ground.rightX - ground.leftX)))
      : ground.y;

    tufts.push(
      <g key={i}>
        <line x1={x} y1={yAtX} x2={x - 0.8} y2={yAtX - h} stroke={CLR.GRASS} strokeWidth="0.8" />
        <line x1={x + 2} y1={yAtX} x2={x + 2.5} y2={yAtX - h * 0.6} stroke={CLR.GRASS} strokeWidth="0.6" />
        <line x1={x + 4} y1={yAtX} x2={x + 3.6} y2={yAtX - h * 0.75} stroke={CLR.GRASS} strokeWidth="0.7" />
      </g>,
    );
  }
  return <>{tufts}</>;
}

function Boundaries({ layout }: { layout: ElevationLayout }) {
  const { boundaries } = layout;
  return (
    <>
      {[boundaries.left, boundaries.right].map((b, i) =>
        b.visible ? (
          <g key={i}>
            <line
              x1={b.x} y1={b.topY} x2={b.x} y2={b.bottomY}
              stroke={CLR.BOUNDARY}
              strokeWidth="1.5"
              strokeDasharray="8,5"
            />
            <text
              x={b.labelX}
              y={b.labelY}
              fill={CLR.BOUNDARY}
              fontSize="7"
              fontWeight="bold"
              transform={`rotate(-90, ${b.labelX}, ${b.labelY})`}
              textAnchor="middle"
            >
              {b.label}
            </text>
          </g>
        ) : null,
      )}
    </>
  );
}

function TNMarkers({ layout }: { layout: ElevationLayout }) {
  return (
    <>
      {layout.tnMarkers.map((m, i) => (
        <g key={i}>
          {/* TN pill */}
          <rect x={m.tnLabel.x} y={m.tnLabel.y} width="8" height="7" rx="1" fill={CLR.TN_MARKER} />
          <text x={m.tnLabel.x + 4} y={m.tnLabel.y + 5.5} fill="white" fontSize="4.5" fontWeight="bold" textAnchor="middle">TN</text>
          {/* TF pill */}
          <rect x={m.tfLabel.x} y={m.tfLabel.y} width="7" height="7" rx="1" fill={CLR.TF_MARKER} />
          <text x={m.tfLabel.x + 3.5} y={m.tfLabel.y + 5.5} fill="white" fontSize="4.5" fontWeight="bold" textAnchor="middle">TF</text>
          {/* Ground level text */}
          <text x={m.groundLabel.x} y={m.groundLabel.y} fill={CLR.GROUND} fontSize="7" textAnchor="middle">
            {m.groundLabel.text}
          </text>
          {/* NGF label */}
          <text x={m.ngfLabel.x} y={m.ngfLabel.y} fill={CLR.LABEL} fontSize="6" textAnchor="middle">
            {m.ngfLabel.text}
          </text>
        </g>
      ))}
    </>
  );
}

function PlotDimension({ dim }: { dim: DimLine }) {
  const labelW = dim.label.length * 5 + 10;
  return (
    <g>
      <line x1={dim.x1} y1={dim.y1} x2={dim.x2} y2={dim.y2} stroke={CLR.GROUND} strokeWidth="0.5" />
      <line x1={dim.x1} y1={dim.y1 - dim.tickLen} x2={dim.x1} y2={dim.y1 + dim.tickLen} stroke={CLR.GROUND} strokeWidth="0.5" />
      <line x1={dim.x2} y1={dim.y2 - dim.tickLen} x2={dim.x2} y2={dim.y2 + dim.tickLen} stroke={CLR.GROUND} strokeWidth="0.5" />
      <rect x={dim.labelX - labelW / 2} y={dim.labelY - 5} width={labelW} height={10} fill="white" />
      <text x={dim.labelX} y={dim.labelY + 3} fill={CLR.GROUND} fontSize="8" fontWeight="bold" textAnchor="middle">{dim.label}</text>
    </g>
  );
}

// ─── Building Sub-Components ───────────────────────────────────────────────

function WallRect({ layout }: { layout: ElevationLayout }) {
  if (!layout.building) return null;
  const { rect } = layout.building;
  return (
    <rect
      x={rect.x} y={rect.y} width={rect.w} height={rect.h}
      fill={CLR.WALLS} stroke={CLR.WALLS_STROKE} strokeWidth="1.2"
    />
  );
}

function RoofShape({ layout }: { layout: ElevationLayout }) {
  if (!layout.building) return null;
  const { roof } = layout.building;

  const pointsStr = roof.points.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <g>
      <polygon points={pointsStr} fill={CLR.ROOF} stroke={CLR.ROOF_STROKE} strokeWidth="1.2" />
      {/* Tile texture rows */}
      {roof.textureRows.map((row, i) => (
        <line key={i} x1={row.x1} y1={row.y} x2={row.x2} y2={row.y}
          stroke="rgba(255,255,255,0.2)" strokeWidth="0.4" />
      ))}
    </g>
  );
}

function FasciaLine({ layout }: { layout: ElevationLayout }) {
  if (!layout.building) return null;
  const { fascia } = layout.building;
  return (
    <line
      x1={fascia.x1} y1={fascia.y1} x2={fascia.x2} y2={fascia.y2}
      stroke={CLR.FASCIA} strokeWidth={fascia.thickness * 2}
    />
  );
}

function Windows({ windows }: { windows: WindowLayout[] }) {
  return (
    <>
      {windows.map((win, i) => (
        <g key={i}>
          {/* Lintel (thin bar above window) */}
          <rect x={win.x - 0.5} y={win.lintelY} width={win.w + 1} height={win.y - win.lintelY}
            fill={CLR.LINTEL} opacity="0.4" />
          {/* Window fill */}
          <rect x={win.x} y={win.y} width={win.w} height={win.h}
            fill={CLR.WINDOW} stroke={CLR.WINDOW_FRAME} strokeWidth="0.5" />
          {/* Mullion cross */}
          <line x1={win.mullionX} y1={win.y} x2={win.mullionX} y2={win.y + win.h}
            stroke={CLR.WINDOW_FRAME} strokeWidth="0.4" />
          <line x1={win.x} y1={win.mullionY} x2={win.x + win.w} y2={win.mullionY}
            stroke={CLR.WINDOW_FRAME} strokeWidth="0.4" />
          {/* Sill (thicker bottom bar) */}
          <line x1={win.x - 0.8} y1={win.sillY} x2={win.x + win.w + 0.8} y2={win.sillY}
            stroke={CLR.WALLS_STROKE} strokeWidth="0.8" />
        </g>
      ))}
    </>
  );
}

function Door({ layout }: { layout: ElevationLayout }) {
  if (!layout.building?.door) return null;
  const { door } = layout.building;
  return (
    <g>
      <rect x={door.x} y={door.y} width={door.w} height={door.h}
        fill={CLR.DOOR} stroke={CLR.DOOR_FRAME} strokeWidth="0.7" />
      {/* Handle */}
      <circle cx={door.handleX} cy={door.handleY} r="1" fill="#C8B464" />
    </g>
  );
}

function Chimney({ layout }: { layout: ElevationLayout }) {
  if (!layout.building?.chimney) return null;
  const { chimney } = layout.building;
  return (
    <g>
      <rect x={chimney.x} y={chimney.y} width={chimney.w} height={chimney.h}
        fill={CLR.CHIMNEY} stroke={CLR.WALLS_STROKE} strokeWidth="0.6" />
      {/* Cap */}
      <rect x={chimney.x - 1} y={chimney.capY} width={chimney.w + 2} height={chimney.capH}
        fill={CLR.CHIMNEY_CAP} />
    </g>
  );
}

function Foundation({ layout }: { layout: ElevationLayout }) {
  if (!layout.building) return null;
  const { foundation } = layout.building;
  return (
    <rect x={foundation.x} y={foundation.y} width={foundation.w} height={foundation.h}
      fill={CLR.FOUNDATION} opacity="0.3" stroke={CLR.FOUNDATION} strokeWidth="0.3"
      strokeDasharray="2,1" />
  );
}

function BuildingLabel({ layout }: { layout: ElevationLayout }) {
  if (!layout.building) return null;
  const { label } = layout.building;
  const textW = label.text.length * 5 + 16;
  return (
    <g>
      <rect x={label.x - textW / 2} y={label.y - 5} width={textW} height={10} rx="2"
        fill={CLR.PROJECTED_BG} opacity="0.9" />
      <text x={label.x} y={label.y + 3} fill={CLR.PROJECTED_TEXT} fontSize="7"
        fontWeight="bold" textAnchor="middle">{label.text}</text>
    </g>
  );
}

// ─── Dimension Lines ───────────────────────────────────────────────────────

function DimensionLine({ dim, isLeft }: { dim: DimLine; isLeft?: boolean }) {
  if (dim.vertical) {
    const labelW = dim.label.length * 5 + 8;
    const bx = isLeft ? dim.labelX - labelW : dim.labelX;
    return (
      <g>
        <line x1={dim.x1} y1={dim.y1} x2={dim.x2} y2={dim.y2}
          stroke={CLR.DIM_BOX} strokeWidth="0.5" />
        <line x1={dim.x1 - dim.tickLen} y1={dim.y1} x2={dim.x1 + dim.tickLen} y2={dim.y1}
          stroke={CLR.DIM_BOX} strokeWidth="0.5" />
        <line x1={dim.x2 - dim.tickLen} y1={dim.y2} x2={dim.x2 + dim.tickLen} y2={dim.y2}
          stroke={CLR.DIM_BOX} strokeWidth="0.5" />
        <rect x={bx} y={dim.labelY - 5} width={labelW} height={10} rx="1"
          fill={CLR.DIM_BOX} />
        <text x={bx + labelW / 2} y={dim.labelY + 3} fill={CLR.DIM_TEXT}
          fontSize="7" fontWeight="bold" textAnchor="middle">{dim.label}</text>
      </g>
    );
  }

  // Horizontal
  const labelW = dim.label.length * 5 + 8;
  return (
    <g>
      <line x1={dim.x1} y1={dim.y1} x2={dim.x2} y2={dim.y2}
        stroke={CLR.GROUND} strokeWidth="0.5" />
      <line x1={dim.x1} y1={dim.y1 - dim.tickLen} x2={dim.x1} y2={dim.y1 + dim.tickLen}
        stroke={CLR.GROUND} strokeWidth="0.5" />
      <line x1={dim.x2} y1={dim.y2 - dim.tickLen} x2={dim.x2} y2={dim.y2 + dim.tickLen}
        stroke={CLR.GROUND} strokeWidth="0.5" />
      <rect x={dim.labelX - labelW / 2} y={dim.labelY - 5} width={labelW} height={10} rx="1"
        fill={CLR.DIM_BOX} />
      <text x={dim.labelX} y={dim.labelY + 3} fill={CLR.DIM_TEXT}
        fontSize="7" fontWeight="bold" textAnchor="middle">{dim.label}</text>
    </g>
  );
}

function SetbackDimension({ dim }: { dim: SetbackDim }) {
  if (!dim.visible) return null;
  const midX = (dim.x1 + dim.x2) / 2;
  return (
    <g>
      <line x1={dim.x1} y1={dim.y} x2={dim.x2} y2={dim.y}
        stroke={CLR.LABEL} strokeWidth="0.4" strokeDasharray="3,2" />
      <line x1={dim.x1} y1={dim.y - 2} x2={dim.x1} y2={dim.y + 2}
        stroke={CLR.LABEL} strokeWidth="0.4" />
      <line x1={dim.x2} y1={dim.y - 2} x2={dim.x2} y2={dim.y + 2}
        stroke={CLR.LABEL} strokeWidth="0.4" />
      <text x={midX} y={dim.y - 2} fill={CLR.LABEL} fontSize="5.5"
        textAnchor="middle">{dim.label}</text>
    </g>
  );
}

// ─── Annotations ───────────────────────────────────────────────────────────

function MaterialAnnotation({ annot }: { annot: MatAnnotation }) {
  return (
    <g>
      <line x1={annot.anchorX} y1={annot.anchorY} x2={annot.labelX - 2} y2={annot.labelY}
        stroke={CLR.MAT_LEADER} strokeWidth="0.5" />
      <circle cx={annot.anchorX} cy={annot.anchorY} r="1.5" fill={CLR.MAT_LEADER} />
      {annot.lines.map((line, i) => (
        <text key={i} x={annot.labelX} y={annot.labelY - 2 + i * 8}
          fill={CLR.MAT_LEADER} fontSize="6">{line}</text>
      ))}
    </g>
  );
}

function NGFLabels({ layout }: { layout: ElevationLayout }) {
  if (!layout.building) return null;
  const { ngfLabels } = layout.building;
  return (
    <g>
      <text x={ngfLabels.ground.x} y={ngfLabels.ground.y} fill={CLR.LABEL} fontSize="6">{ngfLabels.ground.text}</text>
      <text x={ngfLabels.wall.x} y={ngfLabels.wall.y} fill={CLR.LABEL} fontSize="6">{ngfLabels.wall.text}</text>
      <text x={ngfLabels.ridge.x} y={ngfLabels.ridge.y} fill={CLR.LABEL} fontSize="6" textAnchor="middle">{ngfLabels.ridge.text}</text>
      <text x={ngfLabels.eave.x} y={ngfLabels.eave.y} fill={CLR.DIM_BOX} fontSize="6">{ngfLabels.eave.text}</text>
      <text x={ngfLabels.floor.x} y={ngfLabels.floor.y} fill={CLR.LABEL} fontSize="5">{ngfLabels.floor.text}</text>
    </g>
  );
}

// ─── Empty Plot ────────────────────────────────────────────────────────────

function EmptyPlot({ layout }: { layout: ElevationLayout }) {
  const { viewport, ground } = layout;
  return (
    <g>
      <text x={viewport.w / 2} y={ground.y - viewport.h * 0.22}
        fill={CLR.MUTED} fontSize="12" fontStyle="italic" textAnchor="middle">
        {layout.emptyPlotText}
      </text>
      <text x={viewport.w / 2} y={ground.y - viewport.h * 0.15}
        fill={CLR.MUTED} fontSize="9" textAnchor="middle">
        {layout.emptyPlotSub}
      </text>
    </g>
  );
}

// ─── Secondary Buildings ─────────────────────────────────────────────────────

const SEC_ROOF_COLORS: Record<string, string> = {
  garage: "#8B7355",
  parking: "#7B8FA0",
  carport: "#6B8E5A",
  shed: "#9B8B7B",
  default: "#64594E",
};

const SEC_LABEL_BG: Record<string, string> = {
  garage: "#8b5cf6",
  parking: "#6b7280",
  carport: "#059669",
  shed: "#92400e",
  default: "#475569",
};

function SecondaryBuildingItem({ bldg }: { bldg: SecondaryBuildingLayout }) {
  const roofColor = SEC_ROOF_COLORS[bldg.buildingType] || SEC_ROOF_COLORS.default;
  const roofStroke = "#3C3530";
  const labelBg = SEC_LABEL_BG[bldg.buildingType] || SEC_LABEL_BG.default;
  const pointsStr = bldg.roof.points.map(p => `${p.x},${p.y}`).join(" ");
  const textW = bldg.label.text.length * 4.5 + 12;

  return (
    <g>
      {/* Walls */}
      <rect
        x={bldg.rect.x} y={bldg.rect.y} width={bldg.rect.w} height={bldg.rect.h}
        fill={bldg.color} stroke={CLR.WALLS_STROKE} strokeWidth="1"
      />
      {/* Fascia */}
      <line
        x1={bldg.fascia.x1} y1={bldg.fascia.y1} x2={bldg.fascia.x2} y2={bldg.fascia.y2}
        stroke={CLR.FASCIA} strokeWidth={bldg.fascia.thickness * 2}
      />
      {/* Roof */}
      <polygon points={pointsStr} fill={roofColor} stroke={roofStroke} strokeWidth="1" />
      {bldg.roof.textureRows.map((row, i) => (
        <line key={i} x1={row.x1} y1={row.y} x2={row.x2} y2={row.y}
          stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
      ))}
      {/* Label badge */}
      <rect x={bldg.label.x - textW / 2} y={bldg.label.y - 4} width={textW} height={9} rx="2"
        fill={labelBg} opacity="0.9" />
      <text x={bldg.label.x} y={bldg.label.y + 3} fill="white" fontSize="6"
        fontWeight="bold" textAnchor="middle">{bldg.label.text}</text>
      {/* Height dimension */}
      <DimensionLine dim={bldg.heightDim} isLeft />
      {/* Width dimension */}
      <DimensionLine dim={bldg.widthDim} />
    </g>
  );
}

function SecondaryBuildings({ buildings }: { buildings: SecondaryBuildingLayout[] }) {
  if (!buildings.length) return null;
  return (
    <>
      {buildings.map((bldg, i) => (
        <SecondaryBuildingItem key={i} bldg={bldg} />
      ))}
    </>
  );
}

// ─── Multi-Building Renderer ───────────────────────────────────────────────

const EXISTING_OPACITY = 0.55;

function MultiBuildingItem({ bldg, showDims }: { bldg: BuildingLayout; showDims: boolean }) {
  const wallFill = bldg.fillColor || CLR.WALLS;
  const opacity = bldg.isExisting ? EXISTING_OPACITY : 1;
  const roofPointsStr = bldg.roof.points.map(p => `${p.x},${p.y}`).join(" ");
  const textW = (bldg.label.text.length * 5) + 16;
  const labelBg = bldg.isExisting ? "#6B7280" : CLR.PROJECTED_BG;

  return (
    <g opacity={opacity}>
      {/* Foundation */}
      <rect x={bldg.foundation.x} y={bldg.foundation.y} width={bldg.foundation.w} height={bldg.foundation.h}
        fill={CLR.FOUNDATION} opacity="0.3" stroke={CLR.FOUNDATION} strokeWidth="0.3"
        strokeDasharray="2,1" />
      {/* Walls */}
      <rect x={bldg.rect.x} y={bldg.rect.y} width={bldg.rect.w} height={bldg.rect.h}
        fill={wallFill} stroke={CLR.WALLS_STROKE} strokeWidth="1.2" />
      {/* Fascia */}
      <line x1={bldg.fascia.x1} y1={bldg.fascia.y1} x2={bldg.fascia.x2} y2={bldg.fascia.y2}
        stroke={CLR.FASCIA} strokeWidth={bldg.fascia.thickness * 2} />
      {/* Roof */}
      <polygon points={roofPointsStr} fill={CLR.ROOF} stroke={CLR.ROOF_STROKE} strokeWidth="1.2" />
      {bldg.roof.textureRows.map((row, i) => (
        <line key={i} x1={row.x1} y1={row.y} x2={row.x2} y2={row.y}
          stroke="rgba(255,255,255,0.2)" strokeWidth="0.4" />
      ))}
      {/* Windows */}
      <Windows windows={bldg.windows} />
      {/* Door */}
      {bldg.door && (
        <g>
          <rect x={bldg.door.x} y={bldg.door.y} width={bldg.door.w} height={bldg.door.h}
            fill={CLR.DOOR} stroke={CLR.DOOR_FRAME} strokeWidth="0.7" />
          <circle cx={bldg.door.handleX} cy={bldg.door.handleY} r="1" fill="#C8B464" />
        </g>
      )}
      {/* Chimney */}
      {bldg.chimney && (
        <g>
          <rect x={bldg.chimney.x} y={bldg.chimney.y} width={bldg.chimney.w} height={bldg.chimney.h}
            fill={CLR.CHIMNEY} stroke={CLR.WALLS_STROKE} strokeWidth="0.6" />
          <rect x={bldg.chimney.x - 1} y={bldg.chimney.capY} width={bldg.chimney.w + 2} height={bldg.chimney.capH}
            fill={CLR.CHIMNEY_CAP} />
        </g>
      )}
      {/* Label badge */}
      <g opacity={1}>
        <rect x={bldg.label.x - textW / 2} y={bldg.label.y - 5} width={textW} height={10} rx="2"
          fill={labelBg} opacity="0.9" />
        <text x={bldg.label.x} y={bldg.label.y + 3} fill={CLR.PROJECTED_TEXT} fontSize="7"
          fontWeight="bold" textAnchor="middle">{bldg.label.text}</text>
      </g>
      {/* Dimensions and annotations — only for non-existing buildings */}
      {showDims && !bldg.isExisting && (
        <g>
          <DimensionLine dim={bldg.wallHeightDim} isLeft />
          <DimensionLine dim={bldg.ridgeHeightDim} />
          <DimensionLine dim={bldg.buildingWidthDim} />
          {/* NGF labels */}
          <text x={bldg.ngfLabels.ridge.x} y={bldg.ngfLabels.ridge.y} fill={CLR.LABEL}
            fontSize="6" textAnchor="middle">{bldg.ngfLabels.ridge.text}</text>
          <text x={bldg.ngfLabels.eave.x} y={bldg.ngfLabels.eave.y} fill={CLR.DIM_BOX}
            fontSize="6">{bldg.ngfLabels.eave.text}</text>
        </g>
      )}
    </g>
  );
}

function MultiBuildingArray({ buildings }: { buildings: BuildingLayout[] }) {
  if (!buildings.length) return null;
  // buildings are already Z-depth sorted (back-to-front)
  return (
    <>
      {buildings.map((bldg, i) => (
        <MultiBuildingItem key={i} bldg={bldg} showDims={buildings.length <= 3} />
      ))}
    </>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function ElevationSVG({
  layout,
  panelId,
}: {
  layout: ElevationLayout;
  panelId: string;
}) {
  const hatchId = `hatch-${panelId}`;
  const useMultiBuilding = layout.buildings.length > 0;

  return (
    <div className="border border-slate-200 rounded overflow-hidden">
      <svg
        viewBox={`0 0 ${layout.viewport.w} ${layout.viewport.h}`}
        className="w-full h-auto"
        xmlns="http://www.w3.org/2000/svg"
      >
        <HatchDefs id={hatchId} />
        <Underground layout={layout} hatchId={hatchId} />
        <GroundLine layout={layout} />
        <GrassVegetation layout={layout} />
        <Boundaries layout={layout} />
        <TNMarkers layout={layout} />
        <PlotDimension dim={layout.plotDim} />

        {useMultiBuilding ? (
          /* New path: render from unified buildings[] array */
          <MultiBuildingArray buildings={layout.buildings} />
        ) : layout.building ? (
          /* Legacy path: single building + secondaries */
          <>
            <Foundation layout={layout} />
            <WallRect layout={layout} />
            <FasciaLine layout={layout} />
            <RoofShape layout={layout} />
            <Windows windows={layout.building.windows} />
            <Door layout={layout} />
            <Chimney layout={layout} />
            <BuildingLabel layout={layout} />
            <DimensionLine dim={layout.building.wallHeightDim} isLeft />
            <DimensionLine dim={layout.building.ridgeHeightDim} />
            <DimensionLine dim={layout.building.buildingWidthDim} />
            <SetbackDimension dim={layout.building.setbackLeft} />
            <SetbackDimension dim={layout.building.setbackRight} />
            <NGFLabels layout={layout} />
            {layout.building.wallAnnotation && (
              <MaterialAnnotation annot={layout.building.wallAnnotation} />
            )}
            {layout.building.roofAnnotation && (
              <MaterialAnnotation annot={layout.building.roofAnnotation} />
            )}
          </>
        ) : (
          <EmptyPlot layout={layout} />
        )}

        {/* Legacy secondary structures (fallback) */}
        <SecondaryBuildings buildings={layout.secondaryBuildings} />
      </svg>
    </div>
  );
}
