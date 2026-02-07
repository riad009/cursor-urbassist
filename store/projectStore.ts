import { create } from 'zustand'

export interface ProjectElement {
  id: string
  type: 'building' | 'boundary' | 'setback' | 'vegetation' | 'road' | 'parking' | 'custom'
  name: string
  data: object
  measurements: {
    area?: number
    perimeter?: number
    height?: number
  }
}

export interface Project {
  id: string
  name: string
  description: string
  parcelArea: number
  maxBuildableArea: number
  elements: ProjectElement[]
  pluDocument?: {
    name: string
    content: string
    analysis?: string
  }
  sitePhotos: string[]
  createdAt: Date
  updatedAt: Date
}

interface ProjectState {
  currentProject: Project | null
  projects: Project[]
  selectedTool: 'select' | 'rectangle' | 'polygon' | 'line' | 'text' | 'measure' | 'pan'
  selectedElement: ProjectElement | null
  scale: number
  gridEnabled: boolean
  snapEnabled: boolean
  
  // Actions
  createProject: (name: string, description: string) => void
  setCurrentProject: (project: Project) => void
  updateProject: (updates: Partial<Project>) => void
  addElement: (element: ProjectElement) => void
  updateElement: (id: string, updates: Partial<ProjectElement>) => void
  removeElement: (id: string) => void
  setSelectedTool: (tool: ProjectState['selectedTool']) => void
  setSelectedElement: (element: ProjectElement | null) => void
  setScale: (scale: number) => void
  toggleGrid: () => void
  toggleSnap: () => void
  setPluDocument: (doc: Project['pluDocument']) => void
  addSitePhoto: (photo: string) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  projects: [],
  selectedTool: 'select',
  selectedElement: null,
  scale: 1,
  gridEnabled: true,
  snapEnabled: true,

  createProject: (name, description) => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      description,
      parcelArea: 0,
      maxBuildableArea: 0,
      elements: [],
      sitePhotos: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    set((state) => ({
      projects: [...state.projects, newProject],
      currentProject: newProject,
    }))
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  updateProject: (updates) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, ...updates, updatedAt: new Date() }
        : null,
    })),

  addElement: (element) =>
    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            elements: [...state.currentProject.elements, element],
            updatedAt: new Date(),
          }
        : null,
    })),

  updateElement: (id, updates) =>
    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            elements: state.currentProject.elements.map((el) =>
              el.id === id ? { ...el, ...updates } : el
            ),
            updatedAt: new Date(),
          }
        : null,
    })),

  removeElement: (id) =>
    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            elements: state.currentProject.elements.filter((el) => el.id !== id),
            updatedAt: new Date(),
          }
        : null,
    })),

  setSelectedTool: (tool) => set({ selectedTool: tool }),
  setSelectedElement: (element) => set({ selectedElement: element }),
  setScale: (scale) => set({ scale }),
  toggleGrid: () => set((state) => ({ gridEnabled: !state.gridEnabled })),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  
  setPluDocument: (doc) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, pluDocument: doc, updatedAt: new Date() }
        : null,
    })),

  addSitePhoto: (photo) =>
    set((state) => ({
      currentProject: state.currentProject
        ? {
            ...state.currentProject,
            sitePhotos: [...state.currentProject.sitePhotos, photo],
            updatedAt: new Date(),
          }
        : null,
    })),
}))
