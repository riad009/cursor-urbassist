/**
 * Shared elevation drawing generator for consistency between
 * single-facade API and batch generation from 3D model.
 */

export interface WallHeights {
  ground: number;
  first?: number;
  second?: number;
}

export interface RoofData {
  type: string;
  pitch: number;
  overhang?: number;
}

export interface Opening {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  floor: string;
}

export function generateElevation(
  facade: string,
  wallHeights: WallHeights,
  roofData: RoofData,
  openings: Opening[],
  materials: Record<string, string>,
  buildingWidthMeters: number = 12
): object {
  const totalWallHeight =
    (wallHeights.ground || 3) +
    (wallHeights.first || 0) +
    (wallHeights.second || 0);

  const buildingWidth = buildingWidthMeters;
  const pitchRad = ((roofData.pitch || 35) * Math.PI) / 180;
  const roofHeight =
    roofData.type === "flat"
      ? 0
      : (buildingWidth / 2) * Math.tan(pitchRad);

  return {
    facade,
    totalHeight: totalWallHeight + roofHeight,
    buildingWidth,
    levels: [
      {
        name: "RDC",
        height: wallHeights.ground || 3,
        y: 0,
        label: "Rez-de-chaussée",
      },
      ...(wallHeights.first
        ? [
            {
              name: "R+1",
              height: wallHeights.first,
              y: wallHeights.ground,
              label: "1er étage",
            },
          ]
        : []),
      ...(wallHeights.second
        ? [
            {
              name: "R+2",
              height: wallHeights.second,
              y: (wallHeights.ground || 3) + (wallHeights.first || 0),
              label: "2ème étage",
            },
          ]
        : []),
    ],
    roof: {
      type: roofData.type || "gable",
      pitch: roofData.pitch || 35,
      height: roofHeight,
      overhang: roofData.overhang || 0.5,
      y: totalWallHeight,
      points:
        roofData.type === "flat"
          ? [
              { x: -(roofData.overhang || 0.5), y: totalWallHeight },
              {
                x: buildingWidth + (roofData.overhang || 0.5),
                y: totalWallHeight,
              },
            ]
          : [
              { x: -(roofData.overhang || 0.5), y: totalWallHeight },
              { x: buildingWidth / 2, y: totalWallHeight + roofHeight },
              {
                x: buildingWidth + (roofData.overhang || 0.5),
                y: totalWallHeight,
              },
            ],
    },
    openings:
      openings.length > 0
        ? openings
        : generateDefaultOpenings(wallHeights, buildingWidth),
    materials: {
      walls: materials.walls || "Enduit blanc cassé",
      roof: materials.roof || "Tuiles terre cuite",
      windows: materials.windows || "Aluminium gris anthracite",
      doors: materials.doors || "Bois massif",
      ...materials,
    },
    dimensions: {
      totalHeight: `${(totalWallHeight + roofHeight).toFixed(2)}m`,
      wallHeight: `${totalWallHeight.toFixed(2)}m`,
      roofHeight: `${roofHeight.toFixed(2)}m`,
      width: `${buildingWidth}m`,
      groundFloor: `${(wallHeights.ground || 3).toFixed(2)}m`,
    },
    groundLine: {
      y: 0,
      width: buildingWidth + 4,
      offset: -2,
    },
  };
}

function generateDefaultOpenings(
  wallHeights: WallHeights,
  buildingWidth: number
): Opening[] {
  const openings: Opening[] = [];
  openings.push({
    type: "door",
    x: buildingWidth / 2 - 0.5,
    y: 0,
    width: 1.0,
    height: 2.15,
    floor: "ground",
  });
  openings.push({
    type: "window",
    x: 1.5,
    y: 0.9,
    width: 1.2,
    height: 1.4,
    floor: "ground",
  });
  openings.push({
    type: "window",
    x: buildingWidth - 2.7,
    y: 0.9,
    width: 1.2,
    height: 1.4,
    floor: "ground",
  });
  if (wallHeights.first) {
    const y1 = (wallHeights.ground || 3) + 0.9;
    openings.push(
      { type: "window", x: 1.5, y: y1, width: 1.2, height: 1.4, floor: "first" },
      {
        type: "window",
        x: buildingWidth / 2 - 0.6,
        y: y1,
        width: 1.2,
        height: 1.4,
        floor: "first",
      },
      {
        type: "window",
        x: buildingWidth - 2.7,
        y: y1,
        width: 1.2,
        height: 1.4,
        floor: "first",
      }
    );
  }
  return openings;
}
