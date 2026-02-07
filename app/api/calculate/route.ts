import { NextRequest, NextResponse } from "next/server"

interface CalculationRequest {
  type: "surface" | "distance" | "volume" | "setback" | "coverage"
  data: {
    points?: { x: number; y: number }[]
    dimensions?: { width: number; height: number; depth?: number }
    parcelArea?: number
    buildingFootprint?: number
    buildingFloors?: number
    floorHeight?: number
  }
  scale?: number // pixels per meter
}

export async function POST(request: NextRequest) {
  try {
    const body: CalculationRequest = await request.json()
    const scale = body.scale || 100 // default 100 pixels per meter

    let result: object = {}

    switch (body.type) {
      case "surface":
        result = calculateSurface(body.data, scale)
        break
      case "distance":
        result = calculateDistance(body.data, scale)
        break
      case "volume":
        result = calculateVolume(body.data, scale)
        break
      case "setback":
        result = calculateSetback(body.data, scale)
        break
      case "coverage":
        result = calculateCoverage(body.data)
        break
      default:
        return NextResponse.json(
          { error: "Invalid calculation type" },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      calculation: result,
    })
  } catch (error) {
    console.error("Calculation error:", error)
    return NextResponse.json(
      { error: "Failed to perform calculation" },
      { status: 500 }
    )
  }
}

function calculateSurface(data: CalculationRequest["data"], scale: number): object {
  if (data.points && data.points.length >= 3) {
    // Shoelace formula for polygon area
    let area = 0
    const n = data.points.length

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      area += data.points[i].x * data.points[j].y
      area -= data.points[j].x * data.points[i].y
    }

    area = Math.abs(area / 2)
    const areaInMeters = area / (scale * scale)

    return {
      type: "surface",
      areaPixels: area,
      areaMeters: areaInMeters,
      formatted: `${areaInMeters.toFixed(2)} m²`,
    }
  }

  if (data.dimensions) {
    const { width, height } = data.dimensions
    const areaPixels = width * height
    const areaMeters = areaPixels / (scale * scale)

    return {
      type: "surface",
      areaPixels,
      areaMeters,
      formatted: `${areaMeters.toFixed(2)} m²`,
    }
  }

  return { error: "Insufficient data for surface calculation" }
}

function calculateDistance(data: CalculationRequest["data"], scale: number): object {
  if (data.points && data.points.length >= 2) {
    const distances: { from: number; to: number; distance: number }[] = []
    let totalDistance = 0

    for (let i = 0; i < data.points.length - 1; i++) {
      const p1 = data.points[i]
      const p2 = data.points[i + 1]
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const distPixels = Math.sqrt(dx * dx + dy * dy)
      const distMeters = distPixels / scale

      distances.push({
        from: i,
        to: i + 1,
        distance: distMeters,
      })
      totalDistance += distMeters
    }

    return {
      type: "distance",
      segments: distances,
      totalDistance,
      formatted: `${totalDistance.toFixed(2)} m`,
    }
  }

  return { error: "At least 2 points required for distance calculation" }
}

function calculateVolume(data: CalculationRequest["data"], scale: number): object {
  if (data.dimensions) {
    const { width, height, depth } = data.dimensions
    
    if (depth) {
      const volumePixels = width * height * depth
      const volumeMeters = volumePixels / (scale * scale * scale)

      return {
        type: "volume",
        volumePixels,
        volumeMeters,
        formatted: `${volumeMeters.toFixed(2)} m³`,
      }
    }
  }

  if (data.buildingFootprint && data.buildingFloors && data.floorHeight) {
    const totalHeight = data.buildingFloors * data.floorHeight
    const volume = data.buildingFootprint * totalHeight

    return {
      type: "volume",
      footprint: data.buildingFootprint,
      floors: data.buildingFloors,
      floorHeight: data.floorHeight,
      totalHeight,
      volumeMeters: volume,
      formatted: `${volume.toFixed(2)} m³`,
    }
  }

  return { error: "Insufficient data for volume calculation" }
}

function calculateSetback(data: CalculationRequest["data"], scale: number): object {
  if (data.points && data.points.length >= 2) {
    const p1 = data.points[0]
    const p2 = data.points[1]
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const distPixels = Math.sqrt(dx * dx + dy * dy)
    const distMeters = distPixels / scale

    return {
      type: "setback",
      distanceMeters: distMeters,
      formatted: `${distMeters.toFixed(2)} m`,
      compliant: distMeters >= 3, // Default minimum setback
      minimumRequired: 3,
    }
  }

  return { error: "2 points required for setback calculation" }
}

function calculateCoverage(data: CalculationRequest["data"]): object {
  if (data.parcelArea && data.buildingFootprint) {
    const coverageRatio = data.buildingFootprint / data.parcelArea
    const coveragePercent = coverageRatio * 100

    return {
      type: "coverage",
      parcelArea: data.parcelArea,
      buildingFootprint: data.buildingFootprint,
      coverageRatio,
      coveragePercent,
      formatted: `${coveragePercent.toFixed(1)}%`,
      ces: coverageRatio.toFixed(2),
    }
  }

  return { error: "Parcel area and building footprint required" }
}
