// PDF Export Service with A3 Format and Scale Calibration
// Supports professional architectural plan exports

export interface PDFExportConfig {
  format: 'A3' | 'A2' | 'A1' | 'A0'
  orientation: 'portrait' | 'landscape'
  scale: '1:50' | '1:100' | '1:200' | '1:500' | '1:1000'
  title: string
  projectName: string
  projectAddress?: string
  clientName?: string
  architect?: string
  date: string
  revision?: string
  drawingNumber?: string
  showGrid: boolean
  showNorthArrow: boolean
  showScaleBar: boolean
  showLegend: boolean
  showDimensions: boolean
}

export interface PlanElement {
  id: string
  type: 'building' | 'boundary' | 'setback' | 'vegetation' | 'road' | 'parking' | 'annotation'
  name: string
  color: string
  area?: number
  perimeter?: number
}

// A3 dimensions in mm
export const PAPER_SIZES = {
  A3: { width: 420, height: 297 },
  A2: { width: 594, height: 420 },
  A1: { width: 841, height: 594 },
  A0: { width: 1189, height: 841 },
}

// Scale factors (1 unit = X meters in real world)
export const SCALE_FACTORS: Record<string, number> = {
  '1:50': 50,
  '1:100': 100,
  '1:200': 200,
  '1:500': 500,
  '1:1000': 1000,
}

// Calculate drawable area (excluding margins and title block)
export function getDrawableArea(format: keyof typeof PAPER_SIZES, orientation: 'portrait' | 'landscape') {
  const paper = PAPER_SIZES[format]
  const width = orientation === 'landscape' ? paper.width : paper.height
  const height = orientation === 'landscape' ? paper.height : paper.width
  
  // Margins: 10mm left, right, top; 40mm bottom for title block
  return {
    width: width - 20, // 10mm margins on each side
    height: height - 50, // 10mm top + 40mm title block
    marginLeft: 10,
    marginTop: 10,
    titleBlockHeight: 40,
  }
}

// Calculate real-world coverage based on scale and paper size
export function calculateCoverage(
  format: keyof typeof PAPER_SIZES,
  orientation: 'portrait' | 'landscape',
  scale: string
) {
  const drawable = getDrawableArea(format, orientation)
  const scaleFactor = SCALE_FACTORS[scale]
  
  // Convert mm to meters at given scale
  const realWidthMeters = (drawable.width / 1000) * scaleFactor
  const realHeightMeters = (drawable.height / 1000) * scaleFactor
  
  return {
    widthMeters: realWidthMeters,
    heightMeters: realHeightMeters,
    areaSquareMeters: realWidthMeters * realHeightMeters,
    pixelsPerMeter: 1000 / scaleFactor, // For screen display
  }
}

// Generate title block content
export function generateTitleBlock(config: PDFExportConfig): {
  cells: Array<{ label: string; value: string; x: number; y: number; width: number }>
} {
  const cells = [
    { label: 'Project', value: config.projectName, x: 0, y: 0, width: 120 },
    { label: 'Address', value: config.projectAddress || '-', x: 120, y: 0, width: 120 },
    { label: 'Client', value: config.clientName || '-', x: 240, y: 0, width: 80 },
    { label: 'Drawing', value: config.title, x: 0, y: 20, width: 120 },
    { label: 'Scale', value: config.scale, x: 120, y: 20, width: 60 },
    { label: 'Date', value: config.date, x: 180, y: 20, width: 60 },
    { label: 'Rev.', value: config.revision || 'A', x: 240, y: 20, width: 40 },
    { label: 'Dwg No.', value: config.drawingNumber || '001', x: 280, y: 20, width: 40 },
  ]
  
  return { cells }
}

// Generate scale bar segments
export function generateScaleBar(scale: string, widthMm: number = 100): {
  segments: Array<{ startMm: number; endMm: number; meters: number; filled: boolean }>
  totalMeters: number
} {
  const scaleFactor = SCALE_FACTORS[scale]
  const totalMeters = (widthMm / 1000) * scaleFactor
  
  // Create alternating segments
  const segmentCount = 5
  const metersPerSegment = totalMeters / segmentCount
  const mmPerSegment = widthMm / segmentCount
  
  const segments = []
  for (let i = 0; i < segmentCount; i++) {
    segments.push({
      startMm: i * mmPerSegment,
      endMm: (i + 1) * mmPerSegment,
      meters: (i + 1) * metersPerSegment,
      filled: i % 2 === 0,
    })
  }
  
  return { segments, totalMeters }
}

// Generate legend items based on plan elements
export function generateLegend(elements: PlanElement[]): Array<{
  type: string
  color: string
  label: string
  count: number
}> {
  const typeMap = new Map<string, { color: string; label: string; count: number }>()
  
  const labels: Record<string, string> = {
    building: 'Construction',
    boundary: 'Limite parcellaire',
    setback: 'Ligne de recul',
    vegetation: 'Espace vert',
    road: 'Voirie',
    parking: 'Stationnement',
    annotation: 'Annotation',
  }
  
  elements.forEach((el) => {
    const existing = typeMap.get(el.type)
    if (existing) {
      existing.count++
    } else {
      typeMap.set(el.type, {
        color: el.color,
        label: labels[el.type] || el.type,
        count: 1,
      })
    }
  })
  
  return Array.from(typeMap.entries()).map(([type, data]) => ({
    type,
    ...data,
  }))
}

// SVG North Arrow component data
export function getNorthArrowSVG(): string {
  return `
    <g transform="translate(0,0)">
      <polygon points="0,-20 5,10 0,5 -5,10" fill="#1f2937" stroke="#1f2937" stroke-width="1"/>
      <text x="0" y="-25" text-anchor="middle" font-size="10" font-weight="bold" fill="#1f2937">N</text>
    </g>
  `
}

// Calculate optimal scale for a given parcel size
export function calculateOptimalScale(
  parcelWidthMeters: number,
  parcelHeightMeters: number,
  format: keyof typeof PAPER_SIZES = 'A3',
  orientation: 'portrait' | 'landscape' = 'landscape'
): string {
  const drawable = getDrawableArea(format, orientation)
  const drawableWidthMeters = drawable.width / 1000
  const drawableHeightMeters = drawable.height / 1000
  
  const scales = ['1:50', '1:100', '1:200', '1:500', '1:1000']
  
  for (const scale of scales) {
    const coverage = calculateCoverage(format, orientation, scale)
    if (coverage.widthMeters >= parcelWidthMeters * 1.2 && 
        coverage.heightMeters >= parcelHeightMeters * 1.2) {
      return scale
    }
  }
  
  return '1:1000' // Default to smallest scale if parcel is very large
}

// Default export configuration
export function getDefaultExportConfig(projectName: string): PDFExportConfig {
  return {
    format: 'A3',
    orientation: 'landscape',
    scale: '1:100',
    title: 'Plan de Masse',
    projectName,
    date: new Date().toLocaleDateString('fr-FR'),
    showGrid: false,
    showNorthArrow: true,
    showScaleBar: true,
    showLegend: true,
    showDimensions: true,
  }
}
