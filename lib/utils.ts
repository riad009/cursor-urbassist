import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatArea(value: number): string {
  return `${value.toFixed(2)} m²`
}

export function formatDistance(value: number): string {
  return `${value.toFixed(2)} m`
}

export function calculatePolygonArea(points: { x: number; y: number }[]): number {
  let area = 0
  const n = points.length
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  
  return Math.abs(area / 2)
}

export function calculateDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}
