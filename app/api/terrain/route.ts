import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Terrain/Altimetry API - Section 5 of specifications
// Handles elevation data input, terrain model generation, section profiles

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { projectId, action, data } = await request.json();

    if (!projectId || !action) {
      return NextResponse.json(
        { error: "projectId and action required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
    });
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    switch (action) {
      case "save-elevations": {
        // Save elevation points
        const terrain = await prisma.terrainData.upsert({
          where: { projectId },
          create: {
            projectId,
            elevationPoints: data.points || [],
            sectionLines: data.sectionLines || null,
          },
          update: {
            elevationPoints: data.points || [],
            sectionLines: data.sectionLines || null,
          },
        });

        // Generate terrain model from points
        const terrainModel = generateTerrainModel(data.points);
        await prisma.terrainData.update({
          where: { id: terrain.id },
          data: { terrainModel },
        });

        return NextResponse.json({
          success: true,
          terrain: { ...terrain, terrainModel },
        });
      }

      case "generate-profile": {
        // Generate terrain profile along a section line
        const terrain = await prisma.terrainData.findUnique({
          where: { projectId },
        });

        if (!terrain) {
          return NextResponse.json(
            { error: "No terrain data. Add elevation points first." },
            { status: 400 }
          );
        }

        const sectionLine = data.sectionLine;
        const elevationPoints = terrain.elevationPoints as Array<{
          x: number;
          y: number;
          z: number;
        }>;
        const profile = generateProfile(elevationPoints, sectionLine);

        // Save section data
        await prisma.sectionData.create({
          data: {
            projectId,
            name: data.name || `Section ${Date.now()}`,
            sectionLine,
            groundProfile: profile,
          },
        });

        return NextResponse.json({ success: true, profile });
      }

      case "generate-section": {
        // Generate regulatory section drawing (coupe réglementaire)
        const terrain = await prisma.terrainData.findUnique({
          where: { projectId },
        });

        const sectionLine = data.sectionLine;
        const buildingData = data.buildingData;

        const elevationPoints = (terrain?.elevationPoints as Array<{
          x: number;
          y: number;
          z: number;
        }>) || [];
        const groundProfile = generateProfile(elevationPoints, sectionLine);

        const sectionDrawing = generateSectionDrawing(
          groundProfile,
          buildingData,
          sectionLine
        );

        await prisma.sectionData.create({
          data: {
            projectId,
            name: data.name || "Regulatory Section",
            sectionLine,
            groundProfile,
            buildingCut: sectionDrawing,
          },
        });

        return NextResponse.json({
          success: true,
          section: {
            groundProfile,
            buildingCut: sectionDrawing,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Terrain API error:", error);
    return NextResponse.json(
      { error: "Terrain operation failed" },
      { status: 500 }
    );
  }
}

// GET terrain data for a project
export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId required" },
      { status: 400 }
    );
  }

  const terrain = await prisma.terrainData.findUnique({
    where: { projectId },
  });

  const sections = await prisma.sectionData.findMany({
    where: { projectId },
  });

  return NextResponse.json({ terrain, sections });
}

function generateTerrainModel(
  points: Array<{ x: number; y: number; z: number }>
): object {
  if (!points || points.length < 3) {
    return { vertices: [], faces: [], valid: false };
  }

  // Simple triangulation for terrain mesh (Delaunay-like)
  // Sort points and create a grid-based mesh
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));

  const gridSize = 10; // 10 divisions
  const stepX = (maxX - minX) / gridSize;
  const stepY = (maxY - minY) / gridSize;

  const vertices: Array<{ x: number; y: number; z: number }> = [];
  const faces: Array<[number, number, number]> = [];

  // Generate grid vertices with interpolated elevations
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const x = minX + i * stepX;
      const y = minY + j * stepY;
      const z = interpolateElevation(x, y, points);
      vertices.push({ x, y, z });
    }
  }

  // Generate faces (triangles)
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const idx = i * (gridSize + 1) + j;
      faces.push([idx, idx + 1, idx + gridSize + 1]);
      faces.push([idx + 1, idx + gridSize + 2, idx + gridSize + 1]);
    }
  }

  return {
    vertices,
    faces,
    bounds: { minX, maxX, minY, maxY },
    minElevation: Math.min(...points.map((p) => p.z)),
    maxElevation: Math.max(...points.map((p) => p.z)),
    valid: true,
  };
}

function interpolateElevation(
  x: number,
  y: number,
  points: Array<{ x: number; y: number; z: number }>
): number {
  // Inverse distance weighting interpolation
  let totalWeight = 0;
  let totalValue = 0;

  for (const p of points) {
    const dx = x - p.x;
    const dy = y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.001) return p.z;

    const weight = 1 / (dist * dist);
    totalWeight += weight;
    totalValue += weight * p.z;
  }

  return totalWeight > 0 ? totalValue / totalWeight : 0;
}

function generateProfile(
  points: Array<{ x: number; y: number; z: number }>,
  sectionLine: { start: { x: number; y: number }; end: { x: number; y: number } }
): Array<{ distance: number; elevation: number }> {
  const numSamples = 50;
  const profile: Array<{ distance: number; elevation: number }> = [];

  const dx = sectionLine.end.x - sectionLine.start.x;
  const dy = sectionLine.end.y - sectionLine.start.y;
  const totalLength = Math.sqrt(dx * dx + dy * dy);

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const x = sectionLine.start.x + dx * t;
    const y = sectionLine.start.y + dy * t;
    const elevation = points.length > 0 ? interpolateElevation(x, y, points) : 0;

    profile.push({
      distance: t * totalLength,
      elevation,
    });
  }

  return profile;
}

function generateSectionDrawing(
  groundProfile: Array<{ distance: number; elevation: number }>,
  buildingData: {
    position: number;
    width: number;
    height: number;
    roofHeight?: number;
    roofType?: string;
  } | null,
  sectionLine: { start: { x: number; y: number }; end: { x: number; y: number } }
): object {
  const drawing: {
    groundLine: Array<{ distance: number; elevation: number }>;
    building: object | null;
    annotations: Array<{
      type: string;
      x: number;
      y: number;
      label: string;
    }>;
    dimensions: Array<{
      start: { x: number; y: number };
      end: { x: number; y: number };
      label: string;
    }>;
  } = {
    groundLine: groundProfile,
    building: null,
    annotations: [],
    dimensions: [],
  };

  if (buildingData) {
    const baseElevation =
      groundProfile.find(
        (p) => Math.abs(p.distance - buildingData.position) < 1
      )?.elevation || 0;

    drawing.building = {
      x: buildingData.position,
      width: buildingData.width,
      baseElevation,
      wallHeight: buildingData.height,
      roofHeight: buildingData.roofHeight || buildingData.height * 0.3,
      roofType: buildingData.roofType || "gable",
      topElevation:
        baseElevation +
        buildingData.height +
        (buildingData.roofHeight || buildingData.height * 0.3),
    };

    // Add height dimension
    drawing.dimensions.push({
      start: {
        x: buildingData.position + buildingData.width,
        y: baseElevation,
      },
      end: {
        x: buildingData.position + buildingData.width,
        y: baseElevation + buildingData.height,
      },
      label: `${buildingData.height}m`,
    });

    // Add annotations
    drawing.annotations.push({
      type: "level",
      x: buildingData.position - 1,
      y: baseElevation,
      label: `NGF ${baseElevation.toFixed(2)}m`,
    });

    drawing.annotations.push({
      type: "level",
      x: buildingData.position - 1,
      y:
        baseElevation +
        buildingData.height +
        (buildingData.roofHeight || buildingData.height * 0.3),
      label: `Faîtage ${(baseElevation + buildingData.height + (buildingData.roofHeight || buildingData.height * 0.3)).toFixed(2)}m`,
    });
  }

  return drawing;
}
