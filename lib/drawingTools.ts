// Shape templates for quick drawing
export interface ShapeTemplate {
  id: string
  name: string
  category: 'building' | 'parking' | 'vegetation' | 'pool' | 'terrace' | 'road'
  icon: string
  defaultWidth: number // in meters
  defaultHeight: number // in meters
  color: string
  strokeColor: string
  strokeWidth: number
  opacity: number
}

export const SHAPE_TEMPLATES: ShapeTemplate[] = [
  // Buildings
  {
    id: 'house-small',
    name: 'Maison individuelle',
    category: 'building',
    icon: '🏠',
    defaultWidth: 10,
    defaultHeight: 12,
    color: '#fef3c7',
    strokeColor: '#d97706',
    strokeWidth: 2,
    opacity: 0.9,
  },
  {
    id: 'house-medium',
    name: 'Maison moyenne',
    category: 'building',
    icon: '🏡',
    defaultWidth: 14,
    defaultHeight: 16,
    color: '#fef3c7',
    strokeColor: '#d97706',
    strokeWidth: 2,
    opacity: 0.9,
  },
  {
    id: 'garage',
    name: 'Garage',
    category: 'building',
    icon: '🚗',
    defaultWidth: 6,
    defaultHeight: 3,
    color: '#e5e7eb',
    strokeColor: '#6b7280',
    strokeWidth: 2,
    opacity: 0.9,
  },
  {
    id: 'annexe',
    name: 'Annexe/Abri',
    category: 'building',
    icon: '🏚️',
    defaultWidth: 4,
    defaultHeight: 3,
    color: '#fde68a',
    strokeColor: '#b45309',
    strokeWidth: 1,
    opacity: 0.8,
  },
  
  // Parking
  {
    id: 'parking-single',
    name: 'Place de parking',
    category: 'parking',
    icon: '🅿️',
    defaultWidth: 2.5,
    defaultHeight: 5,
    color: '#d1d5db',
    strokeColor: '#4b5563',
    strokeWidth: 1,
    opacity: 0.7,
  },
  {
    id: 'parking-double',
    name: 'Double parking',
    category: 'parking',
    icon: '🚙',
    defaultWidth: 5,
    defaultHeight: 5,
    color: '#d1d5db',
    strokeColor: '#4b5563',
    strokeWidth: 1,
    opacity: 0.7,
  },
  {
    id: 'driveway',
    name: 'Allée carrossable',
    category: 'parking',
    icon: '🛣️',
    defaultWidth: 3,
    defaultHeight: 10,
    color: '#9ca3af',
    strokeColor: '#374151',
    strokeWidth: 1,
    opacity: 0.6,
  },
  
  // Vegetation
  {
    id: 'tree-small',
    name: 'Arbre (petit)',
    category: 'vegetation',
    icon: '🌳',
    defaultWidth: 4,
    defaultHeight: 4,
    color: '#86efac',
    strokeColor: '#16a34a',
    strokeWidth: 1,
    opacity: 0.7,
  },
  {
    id: 'tree-large',
    name: 'Arbre (grand)',
    category: 'vegetation',
    icon: '🌲',
    defaultWidth: 8,
    defaultHeight: 8,
    color: '#4ade80',
    strokeColor: '#15803d',
    strokeWidth: 1,
    opacity: 0.7,
  },
  {
    id: 'hedge',
    name: 'Haie',
    category: 'vegetation',
    icon: '🌿',
    defaultWidth: 1,
    defaultHeight: 10,
    color: '#22c55e',
    strokeColor: '#166534',
    strokeWidth: 1,
    opacity: 0.8,
  },
  {
    id: 'lawn',
    name: 'Pelouse',
    category: 'vegetation',
    icon: '🌱',
    defaultWidth: 10,
    defaultHeight: 10,
    color: '#bbf7d0',
    strokeColor: '#22c55e',
    strokeWidth: 1,
    opacity: 0.5,
  },
  
  // Pool & Terrace
  {
    id: 'pool-rect',
    name: 'Piscine rectangulaire',
    category: 'pool',
    icon: '🏊',
    defaultWidth: 8,
    defaultHeight: 4,
    color: '#7dd3fc',
    strokeColor: '#0284c7',
    strokeWidth: 2,
    opacity: 0.8,
  },
  {
    id: 'pool-oval',
    name: 'Piscine ovale',
    category: 'pool',
    icon: '💧',
    defaultWidth: 6,
    defaultHeight: 3,
    color: '#7dd3fc',
    strokeColor: '#0284c7',
    strokeWidth: 2,
    opacity: 0.8,
  },
  {
    id: 'terrace',
    name: 'Terrasse',
    category: 'terrace',
    icon: '🪑',
    defaultWidth: 6,
    defaultHeight: 4,
    color: '#fcd34d',
    strokeColor: '#ca8a04',
    strokeWidth: 1,
    opacity: 0.6,
  },
  
  // Road elements
  {
    id: 'sidewalk',
    name: 'Trottoir',
    category: 'road',
    icon: '🚶',
    defaultWidth: 1.5,
    defaultHeight: 10,
    color: '#e5e7eb',
    strokeColor: '#9ca3af',
    strokeWidth: 1,
    opacity: 0.6,
  },
]

// Grid and snap settings
export interface GridSettings {
  enabled: boolean
  size: number // in meters
  snapToGrid: boolean
  snapThreshold: number // pixels
  showGuides: boolean
  autoAlign: boolean
  alignThreshold: number // pixels
}

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  enabled: true,
  size: 1, // 1 meter grid
  snapToGrid: true,
  snapThreshold: 10,
  showGuides: true,
  autoAlign: true,
  alignThreshold: 15,
}

// Snap point to grid
export function snapToGrid(x: number, y: number, gridSize: number, scale: number): { x: number; y: number } {
  const pixelsPerMeter = scale // pixels per meter at current zoom
  const gridPixels = gridSize * pixelsPerMeter
  
  return {
    x: Math.round(x / gridPixels) * gridPixels,
    y: Math.round(y / gridPixels) * gridPixels,
  }
}

// Find alignment guides with other objects
export interface AlignmentGuide {
  type: 'horizontal' | 'vertical'
  position: number
  sourceId: string
  targetId: string
}

export function findAlignmentGuides(
  currentObject: { left: number; top: number; width: number; height: number; id: string },
  otherObjects: Array<{ left: number; top: number; width: number; height: number; id: string }>,
  threshold: number
): AlignmentGuide[] {
  const guides: AlignmentGuide[] = []
  
  const currentCenterX = currentObject.left + currentObject.width / 2
  const currentCenterY = currentObject.top + currentObject.height / 2
  const currentRight = currentObject.left + currentObject.width
  const currentBottom = currentObject.top + currentObject.height
  
  for (const other of otherObjects) {
    if (other.id === currentObject.id) continue
    
    const otherCenterX = other.left + other.width / 2
    const otherCenterY = other.top + other.height / 2
    const otherRight = other.left + other.width
    const otherBottom = other.top + other.height
    
    // Vertical alignments (left, center, right)
    if (Math.abs(currentObject.left - other.left) < threshold) {
      guides.push({ type: 'vertical', position: other.left, sourceId: currentObject.id, targetId: other.id })
    }
    if (Math.abs(currentCenterX - otherCenterX) < threshold) {
      guides.push({ type: 'vertical', position: otherCenterX, sourceId: currentObject.id, targetId: other.id })
    }
    if (Math.abs(currentRight - otherRight) < threshold) {
      guides.push({ type: 'vertical', position: otherRight, sourceId: currentObject.id, targetId: other.id })
    }
    if (Math.abs(currentObject.left - otherRight) < threshold) {
      guides.push({ type: 'vertical', position: otherRight, sourceId: currentObject.id, targetId: other.id })
    }
    if (Math.abs(currentRight - other.left) < threshold) {
      guides.push({ type: 'vertical', position: other.left, sourceId: currentObject.id, targetId: other.id })
    }
    
    // Horizontal alignments (top, center, bottom)
    if (Math.abs(currentObject.top - other.top) < threshold) {
      guides.push({ type: 'horizontal', position: other.top, sourceId: currentObject.id, targetId: other.id })
    }
    if (Math.abs(currentCenterY - otherCenterY) < threshold) {
      guides.push({ type: 'horizontal', position: otherCenterY, sourceId: currentObject.id, targetId: other.id })
    }
    if (Math.abs(currentBottom - otherBottom) < threshold) {
      guides.push({ type: 'horizontal', position: otherBottom, sourceId: currentObject.id, targetId: other.id })
    }
    if (Math.abs(currentObject.top - otherBottom) < threshold) {
      guides.push({ type: 'horizontal', position: otherBottom, sourceId: currentObject.id, targetId: other.id })
    }
    if (Math.abs(currentBottom - other.top) < threshold) {
      guides.push({ type: 'horizontal', position: other.top, sourceId: currentObject.id, targetId: other.id })
    }
  }
  
  return guides
}

// Auto-dimension labels
export interface DimensionLabel {
  id: string
  startX: number
  startY: number
  endX: number
  endY: number
  value: number // in meters
  unit: string
}

export function calculateDimensions(
  object: { left: number; top: number; width: number; height: number },
  scale: number // pixels per meter
): DimensionLabel[] {
  const widthMeters = object.width / scale
  const heightMeters = object.height / scale
  
  return [
    {
      id: 'width',
      startX: object.left,
      startY: object.top + object.height + 10,
      endX: object.left + object.width,
      endY: object.top + object.height + 10,
      value: parseFloat(widthMeters.toFixed(2)),
      unit: 'm',
    },
    {
      id: 'height',
      startX: object.left + object.width + 10,
      startY: object.top,
      endX: object.left + object.width + 10,
      endY: object.top + object.height,
      value: parseFloat(heightMeters.toFixed(2)),
      unit: 'm',
    },
  ]
}

// Keyboard shortcuts for drawing tools
export const KEYBOARD_SHORTCUTS = {
  select: 'v',
  rectangle: 'r',
  polygon: 'p',
  line: 'l',
  text: 't',
  delete: 'Delete',
  duplicate: 'Ctrl+D',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  toggleGrid: 'g',
  toggleSnap: 's',
  zoomIn: '+',
  zoomOut: '-',
  zoomFit: '0',
}
