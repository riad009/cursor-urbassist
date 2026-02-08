# ArchStudio - Technical Documentation

> **Version:** 0.1.0  
> **Last Updated:** February 2026  
> **Platform:** Web Application (Next.js)  
> **Author:** roms09  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture and Component Communication](#2-architecture-and-component-communication)
3. [Folder and Coding Structure](#3-folder-and-coding-structure)
4. [Database Design and Relations](#4-database-design-and-relations)
5. [API Contracts and Response Patterns](#5-api-contracts-and-response-patterns)
6. [Authentication and Permissions](#6-authentication-and-permissions)
7. [Core Business Rules](#7-core-business-rules)
8. [Environment Setup and Deployment Flow](#8-environment-setup-and-deployment-flow)
9. [Important Engineering Decisions](#9-important-engineering-decisions)
10. [Risks, Technical Debt, and Improvement Opportunities](#10-risks-technical-debt-and-improvement-opportunities)

---

## 1. System Overview

### 1.1 Purpose

**ArchStudio** (also referenced as "UrbanDesign" in some components) is a professional web-based platform designed for **architectural project design and urban planning**. The application enables architects, urban planners, and construction professionals to:

- Design construction projects with a visual canvas editor
- Analyze urban planning documents (PLU - Plan Local d'Urbanisme) using AI
- Calculate surface areas, volumes, distances, and coverage ratios
- Create facade designs with architectural elements
- Integrate project designs onto site photographs for visualization
- Export professional A3 architectural plans

### 1.2 Target Users

| User Type | Primary Use Cases |
|-----------|-------------------|
| **Architects** | Design buildings, create floor plans, facade design |
| **Urban Planners** | PLU document analysis, regulation compliance checking |
| **Construction Professionals** | Measurements, calculations, project exports |
| **Real Estate Developers** | Project visualization, landscape integration |

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Framework** | Next.js (App Router) | 16.1.6 |
| **UI Library** | React | 19.2.3 |
| **Language** | TypeScript | ^5.0 |
| **Styling** | Tailwind CSS | ^4.0 |
| **State Management** | Zustand | ^5.0.11 |
| **Canvas Library** | Fabric.js | ^7.1.0 |
| **UI Components** | Radix UI | Multiple packages |
| **PDF Export** | @react-pdf/renderer | ^4.3.2 |
| **Icons** | Lucide React | ^0.563.0 |
| **AI Integration** | Google Gemini API | External |

### 1.4 Key Features

```
┌─────────────────────────────────────────────────────────────────┐
│                        ARCHSTUDIO                                │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   DESIGN        │   ANALYSIS      │   OUTPUT                    │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ • Canvas Editor │ • PLU Analysis  │ • PDF Export (A0-A4)        │
│ • Facade Design │ • Calculations  │ • Image Export              │
│ • Shape Tools   │ • Compliance    │ • Data Export (JSON/CSV)    │
│ • Templates     │   Checking      │ • Professional Title Blocks │
│ • Measurements  │ • AI Assistance │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

---

## 2. Architecture and Component Communication

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Navigation │  │   Layout    │  │      Page Components    │ │
│  │  Component  │──│  (Header)   │──│  (Dashboard, Editor,    │ │
│  │             │  │             │  │   Projects, etc.)       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    ZUSTAND STORE                            ││
│  │  (projectStore.ts - Global State Management)                ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                       │
├─────────┼───────────────────────────────────────────────────────┤
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    NEXT.JS API ROUTES                       ││
│  │  /api/analyze-plu  │ /api/calculate │ /api/landscape       ││
│  │  /api/upload-document                                       ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                       │
├─────────┼───────────────────────────────────────────────────────┤
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              EXTERNAL SERVICES                              ││
│  │  • Google Gemini API (AI Analysis)                          ││
│  │  • Future: Cloud Storage, Database                          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
User Interaction
       │
       ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   UI Event   │────▶│  Zustand     │────▶│   Re-render  │
│   Handler    │     │  Store       │     │   Components │
└──────────────┘     │  Update      │     └──────────────┘
                     └──────────────┘
       │
       ▼ (if API call needed)
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   fetch()    │────▶│  API Route   │────▶│  External    │
│   Request    │     │  Handler     │     │  Service     │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Response   │
                     │   to Client  │
                     └──────────────┘
```

### 2.3 Component Hierarchy

```
RootLayout (app/layout.tsx)
│
├── Navigation (components/layout/Navigation.tsx)
│   ├── Header Bar (Logo, Nav Links, User Actions)
│   ├── Mobile Menu
│   └── [Page Content - children]
│
├── Page Components
│   ├── Dashboard (app/page.tsx)
│   │   └── Stats, Quick Actions, Recent Projects
│   │
│   ├── Projects (app/projects/page.tsx)
│   │   └── Project Cards, Filters, Search
│   │
│   ├── Editor (app/editor/page.tsx)
│   │   ├── Toolbar (Tools, Templates)
│   │   ├── Fabric.js Canvas
│   │   ├── Properties Panel
│   │   └── Layer Management
│   │
│   ├── Facades (app/facades/page.tsx)
│   │   ├── Architectural Elements
│   │   ├── Facade Canvas
│   │   └── Floor Levels
│   │
│   ├── Regulations (app/regulations/page.tsx)
│   │   ├── Document Upload
│   │   ├── AI Analysis Results
│   │   └── Compliance Status
│   │
│   ├── Landscape (app/landscape/page.tsx)
│   │   ├── Photo Upload
│   │   ├── Layer Controls
│   │   └── Overlay Adjustments
│   │
│   ├── Calculations (app/calculations/page.tsx)
│   │   ├── Calculator Selection
│   │   ├── Input Forms
│   │   └── Results History
│   │
│   └── Export (app/export/page.tsx)
│       ├── Format Selection
│       ├── Paper/Scale Options
│       └── Project Info
│
└── Shared UI Components (components/ui/*)
    ├── Button, Card, Dialog, Input
    ├── Tabs, Tooltip, Badge
    └── Progress, Label, Textarea
```

### 2.4 State Management Architecture

The application uses **Zustand** for state management with a single primary store:

```typescript
// store/projectStore.ts - Core State Structure

interface ProjectState {
  // Project Data
  currentProject: Project | null
  projects: Project[]
  
  // Editor State
  selectedTool: 'select' | 'rectangle' | 'polygon' | 'line' | 'text' | 'measure' | 'pan'
  selectedElement: ProjectElement | null
  scale: number
  
  // UI Preferences
  gridEnabled: boolean
  snapEnabled: boolean
  
  // Actions
  createProject: (name, description) => void
  setCurrentProject: (project) => void
  updateProject: (updates) => void
  addElement: (element) => void
  updateElement: (id, updates) => void
  removeElement: (id) => void
  setSelectedTool: (tool) => void
  // ... more actions
}
```

**State Update Pattern:**
```typescript
// Immutable state updates using Zustand's set()
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
```

---

## 3. Folder and Coding Structure

### 3.1 Directory Structure

```
clinet-demo/
│
├── app/                          # Next.js App Router pages
│   ├── layout.tsx               # Root layout with fonts and global styles
│   ├── page.tsx                 # Dashboard/Home page
│   ├── globals.css              # Global CSS with Tailwind & custom styles
│   │
│   ├── api/                     # API Route Handlers
│   │   ├── analyze-plu/         # PLU document AI analysis
│   │   │   └── route.ts
│   │   ├── calculate/           # Geometric calculations
│   │   │   └── route.ts
│   │   ├── landscape/           # Photo processing
│   │   │   └── route.ts
│   │   └── upload-document/     # Document upload handling
│   │       └── route.ts
│   │
│   ├── calculations/            # Calculations page
│   │   └── page.tsx
│   ├── editor/                  # Main design editor
│   │   └── page.tsx
│   ├── export/                  # Export functionality
│   │   └── page.tsx
│   ├── facades/                 # Facade design editor
│   │   └── page.tsx
│   ├── landscape/               # Landscape integration
│   │   └── page.tsx
│   ├── projects/                # Project management
│   │   └── page.tsx
│   └── regulations/             # PLU analysis page
│       └── page.tsx
│
├── components/                   # Reusable React components
│   ├── editor/                  # Editor-specific components
│   │   ├── CanvasEditor.tsx     # Fabric.js canvas wrapper
│   │   ├── PropertiesPanel.tsx  # Object properties editor
│   │   ├── Toolbar.tsx          # Drawing tools
│   │   └── index.ts             # Barrel export
│   │
│   ├── export/                  # Export components
│   │   └── PDFExportPanel.tsx
│   │
│   ├── layout/                  # Layout components
│   │   ├── AppLayout.tsx        # Alternative layout wrapper
│   │   ├── Header.tsx           # Page header
│   │   ├── Navigation.tsx       # Main navigation (USED)
│   │   ├── Sidebar.tsx          # Alternative sidebar
│   │   └── index.ts
│   │
│   └── ui/                      # Base UI components (Shadcn pattern)
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── progress.tsx
│       ├── tabs.tsx
│       ├── textarea.tsx
│       └── tooltip.tsx
│
├── lib/                          # Utility functions and business logic
│   ├── drawingTools.ts          # Shape templates and drawing utilities
│   ├── pdfExport.ts             # PDF generation configuration
│   └── utils.ts                 # General utility functions (cn, math)
│
├── store/                        # State management
│   └── projectStore.ts          # Zustand store
│
├── public/                       # Static assets
├── src/                          # Alternative source (not actively used)
│
├── eslint.config.mjs            # ESLint configuration
├── next.config.ts               # Next.js configuration
├── next-env.d.ts                # Next.js TypeScript declarations
├── package.json                 # Dependencies and scripts
├── postcss.config.mjs           # PostCSS configuration
├── tailwind.config.ts           # Tailwind CSS configuration (implicit v4)
└── tsconfig.json                # TypeScript configuration
```

### 3.2 Naming Conventions

| Entity | Convention | Example |
|--------|------------|---------|
| **Files (Components)** | PascalCase | `CanvasEditor.tsx` |
| **Files (Utils)** | camelCase | `drawingTools.ts` |
| **Files (Pages)** | `page.tsx` (Next.js App Router) | `app/editor/page.tsx` |
| **Components** | PascalCase | `function Navigation()` |
| **Hooks** | `use` prefix | `useProjectStore` |
| **Interfaces** | PascalCase, descriptive | `ProjectElement`, `AnalysisResult` |
| **Types** | PascalCase | `Tool`, `FacadeView` |
| **Constants** | SCREAMING_SNAKE_CASE | `SHAPE_TEMPLATES`, `SCALES` |
| **CSS Variables** | kebab-case | `--primary-foreground` |

### 3.3 Coding Patterns

#### Component Pattern
```typescript
"use client";  // Required for client components in Next.js App Router

import React, { useState } from "react";
import { cn } from "@/lib/utils";

// Interface definitions first
interface ComponentProps {
  prop1: string;
  prop2?: number;
}

// Main component export
export default function ComponentName({ prop1, prop2 }: ComponentProps) {
  // State declarations
  const [state, setState] = useState<Type>(initialValue);
  
  // Event handlers
  const handleEvent = () => {
    // Handler logic
  };
  
  // JSX return
  return (
    <div className={cn("base-classes", conditionalClass && "conditional-class")}>
      {/* Component content */}
    </div>
  );
}
```

#### API Route Pattern
```typescript
import { NextRequest, NextResponse } from "next/server";

interface RequestBody {
  field1: string;
  field2?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    
    // Validation
    if (!body.field1) {
      return NextResponse.json(
        { error: "Field1 is required" },
        { status: 400 }
      );
    }
    
    // Business logic
    const result = await processRequest(body);
    
    // Success response
    return NextResponse.json({
      success: true,
      data: result,
    });
    
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
```

### 3.4 Import Path Aliases

Configured in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

Usage:
```typescript
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projectStore";
import { Button } from "@/components/ui/button";
```

---

## 4. Database Design and Relations

### 4.1 Current State: No Persistent Database

> ⚠️ **IMPORTANT ASSUMPTION**: The current implementation does **not** use a persistent database. All data is stored in:
> - **Browser memory** (Zustand store - ephemeral)
> - **Component local state** (React useState)
> - **Mock data** (hardcoded in page components)

### 4.2 Data Models (TypeScript Interfaces)

#### Project Model
```typescript
interface Project {
  id: string;                    // UUID generated via crypto.randomUUID()
  name: string;
  description: string;
  parcelArea: number;            // Square meters
  maxBuildableArea: number;      // Square meters
  elements: ProjectElement[];    // Drawings on canvas
  pluDocument?: {
    name: string;
    content: string;
    analysis?: string;
  };
  sitePhotos: string[];          // Base64 encoded images
  createdAt: Date;
  updatedAt: Date;
}
```

#### Project Element Model
```typescript
interface ProjectElement {
  id: string;
  type: 'building' | 'boundary' | 'setback' | 'vegetation' | 
        'road' | 'parking' | 'pool' | 'terrace' | 'custom';
  name: string;
  data: object;                  // Fabric.js object properties
  measurements: {
    area?: number;
    perimeter?: number;
    height?: number;
    width?: number;
  };
}
```

#### Mock Project Data (Projects Page)
```typescript
interface Project {
  id: number;
  name: string;
  description: string;
  status: "draft" | "in-progress" | "review" | "completed";
  type: "residential" | "commercial" | "extension" | "renovation";
  location: string;
  area: string;
  createdAt: string;
  updatedAt: string;
  progress: number;              // 0-100%
  starred: boolean;
  thumbnail: string;             // Emoji placeholder
}
```

### 4.3 Data Relationships (Conceptual ERD)

```
┌─────────────────┐       ┌─────────────────┐
│     PROJECT     │       │  PROJECT_ELEMENT │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │──────▶│ id (PK)         │
│ name            │   1:N │ project_id (FK) │
│ description     │       │ type            │
│ parcel_area     │       │ name            │
│ status          │       │ data (JSON)     │
│ created_at      │       │ measurements    │
│ updated_at      │       └─────────────────┘
└─────────────────┘
        │
        │ 1:1 (optional)
        ▼
┌─────────────────┐       ┌─────────────────┐
│  PLU_DOCUMENT   │       │   SITE_PHOTO    │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ project_id (FK) │       │ project_id (FK) │
│ name            │       │ data_url        │
│ content         │       │ analysis        │
│ analysis (JSON) │       │ uploaded_at     │
└─────────────────┘       └─────────────────┘
```

### 4.4 Future Database Recommendations

For production deployment, consider:

| Option | Use Case | Recommendation |
|--------|----------|----------------|
| **PostgreSQL** | Full-featured relational DB | Best for complex queries, joins |
| **Supabase** | PostgreSQL + Auth + Storage | Fastest to implement |
| **PlanetScale** | MySQL-compatible, serverless | Good for scaling |
| **MongoDB** | Flexible document storage | If schema changes frequently |

---

## 5. API Contracts and Response Patterns

### 5.1 API Overview

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/analyze-plu` | POST | Analyze PLU documents with AI |
| `/api/calculate` | POST | Perform geometric calculations |
| `/api/landscape` | POST | Process site photographs |
| `/api/upload-document` | POST | Upload and parse documents |

### 5.2 Standard Response Format

#### Success Response
```typescript
{
  success: true,
  data: { ... }  // Or specific field like "analysis", "calculation"
}
```

#### Error Response
```typescript
{
  error: "Human readable error message",
  // Optional: additional context
}
```

HTTP Status Codes:
- `200` - Success
- `400` - Bad Request (validation error)
- `500` - Internal Server Error

---

### 5.3 API: `/api/analyze-plu`

**Purpose:** Analyze French urban planning documents using Google Gemini AI.

#### Request
```typescript
POST /api/analyze-plu
Content-Type: application/json

{
  "documentContent": string,     // Required: Full text of PLU document
  "parcelAddress"?: string,      // Optional: Address for context
  "zoneType"?: string            // Optional: Zone classification hint
}
```

#### Response (Success)
```typescript
{
  "success": true,
  "analysis": {
    "zoneClassification": "UB - Zone Urbaine Mixte",
    "maxHeight": 12,                           // meters
    "setbacks": {
      "front": 5,                              // meters
      "side": 3,
      "rear": 4
    },
    "maxCoverageRatio": 0.4,                   // CES (40%)
    "maxFloorAreaRatio": 1.2,                  // COS
    "parkingRequirements": "1 place per 60m² of floor area",
    "greenSpaceRequirements": "Minimum 20% of parcel area must be landscaped",
    "architecturalConstraints": [
      "Roof pitch between 30-45 degrees",
      "Natural materials for facades (stone, wood, render)"
    ],
    "restrictions": [
      "No industrial activities permitted",
      "Maximum 2 dwelling units per building"
    ],
    "recommendations": [
      "Consider solar panel integration with roof design",
      "Rainwater collection system recommended"
    ],
    "confidence": 0.85,
    "analyzedAt": "2026-02-08T10:30:00.000Z"
  }
}
```

#### Fallback Behavior
- If `GEMINI_API_KEY` is not set, returns mock analysis
- If Gemini API fails, falls back to mock analysis

---

### 5.4 API: `/api/calculate`

**Purpose:** Perform geometric calculations for construction measurements.

#### Request
```typescript
POST /api/calculate
Content-Type: application/json

{
  "type": "surface" | "distance" | "volume" | "setback" | "coverage",
  "data": {
    // For surface/distance calculations:
    "points"?: { x: number, y: number }[],
    
    // For rectangular calculations:
    "dimensions"?: { width: number, height: number, depth?: number },
    
    // For coverage:
    "parcelArea"?: number,
    "buildingFootprint"?: number,
    
    // For volume (building):
    "buildingFloors"?: number,
    "floorHeight"?: number
  },
  "scale"?: number    // pixels per meter, default: 100
}
```

#### Response Examples

**Surface Calculation:**
```typescript
{
  "success": true,
  "calculation": {
    "type": "surface",
    "areaPixels": 10000,
    "areaMeters": 100.00,
    "formatted": "100.00 m²"
  }
}
```

**Coverage Calculation:**
```typescript
{
  "success": true,
  "calculation": {
    "type": "coverage",
    "parcelArea": 1000,
    "buildingFootprint": 400,
    "coverageRatio": 0.4,
    "coveragePercent": 40.0,
    "formatted": "40.0%",
    "ces": "0.40"
  }
}
```

**Setback Calculation:**
```typescript
{
  "success": true,
  "calculation": {
    "type": "setback",
    "distanceMeters": 5.25,
    "formatted": "5.25 m",
    "compliant": true,
    "minimumRequired": 3
  }
}
```

---

### 5.5 API: `/api/landscape`

**Purpose:** Process site photographs for landscape integration.

#### Request
```typescript
POST /api/landscape
Content-Type: multipart/form-data

photo: File (image/jpeg, image/png, image/webp)
projectData?: string (JSON)
```

#### Response
```typescript
{
  "success": true,
  "photo": {
    "name": "site_photo.jpg",
    "size": 2048576,
    "type": "image/jpeg",
    "dataUrl": "data:image/jpeg;base64,...",
    "analysis": {
      "horizonLine": 0.35,              // 35% from top
      "perspectivePoints": [
        { "x": 0.2, "y": 0.6 },
        { "x": 0.8, "y": 0.6 }
      ],
      "suggestedScale": 1.2,
      "orientation": "landscape"
    }
  }
}
```

---

### 5.6 API: `/api/upload-document`

**Purpose:** Upload and extract text from PLU documents.

#### Request
```typescript
POST /api/upload-document
Content-Type: multipart/form-data

file: File (PDF, DOC, DOCX, TXT)
```

#### Response
```typescript
{
  "success": true,
  "filename": "plu_document.pdf",
  "size": 524288,
  "type": "application/pdf",
  "content": "PLU Document: plu_document.pdf\nZone: UB - Zone Urbaine Mixte\n..."
}
```

> ⚠️ **Note:** PDF/DOC parsing returns mock content in current implementation. Production requires proper PDF parsing library (e.g., `pdf-parse`).

---

## 6. Authentication and Permissions

### 6.1 Current State: No Authentication

> ⚠️ **CRITICAL ASSUMPTION**: The application currently has **NO authentication or authorization system** implemented.

Observed UI elements suggest future authentication:
- User avatar button in Navigation
- "Upgrade Pro" button (subscription model planned)
- Settings/preferences sections

### 6.2 Recommended Authentication Implementation

For production, implement:

```typescript
// Recommended: NextAuth.js with Supabase Auth

// Roles Structure
type UserRole = 'free' | 'pro' | 'enterprise' | 'admin';

interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId?: string;
}

// Feature Access Matrix
const FEATURE_ACCESS = {
  'free': ['editor.basic', 'calculations', 'export.pdf.a4'],
  'pro': ['editor.full', 'calculations', 'export.all', 'ai.analysis'],
  'enterprise': ['*', 'api.access', 'white-label'],
  'admin': ['*', 'user.management']
};
```

### 6.3 API Route Protection Pattern (Future)

```typescript
// middleware.ts
import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      // Check if user has access to the route
      const path = req.nextUrl.pathname;
      if (path.startsWith("/api/analyze-plu")) {
        return token?.role === "pro" || token?.role === "enterprise";
      }
      return !!token;
    },
  },
});

export const config = {
  matcher: ["/api/:path*", "/editor/:path*"],
};
```

---

## 7. Core Business Rules

### 7.1 Scale and Measurement System

The application uses a configurable scale system based on architectural standards:

| Scale | Pixels per Meter | Use Case |
|-------|------------------|----------|
| 1:50 | 20 | Detail drawings |
| 1:100 | 10 | Floor plans (DEFAULT) |
| 1:200 | 5 | Site plans |
| 1:500 | 2 | Master plans |

```typescript
// Conversion functions
const pixelsToMeters = (pixels: number, scale: ScaleConfig) => {
  return pixels / scale.pixelsPerMeter;
};

const metersToPixels = (meters: number, scale: ScaleConfig) => {
  return meters * scale.pixelsPerMeter;
};
```

### 7.2 PLU Compliance Rules (French Urban Planning)

Key regulations analyzed:

| Rule | Description | Typical Values |
|------|-------------|----------------|
| **CES** | Coefficient d'Emprise au Sol (Ground Coverage Ratio) | 40-60% |
| **COS** | Coefficient d'Occupation des Sols (Floor Area Ratio) | 0.5-2.0 |
| **Height** | Maximum building height | 7-15m |
| **Setbacks** | Distance from property lines | 3-5m |
| **Parking** | Required parking spaces | 1 per 50-80m² |
| **Green Space** | Required vegetation coverage | 15-30% |

### 7.3 Compliance Status Categories

```typescript
const statusConfig = {
  compliant: { 
    label: "Compliant",     // Meets requirements
    color: "emerald" 
  },
  warning: { 
    label: "Warning",       // Close to limits
    color: "amber" 
  },
  violation: { 
    label: "Violation",     // Exceeds limits
    color: "red" 
  },
  info: { 
    label: "Info",          // Informational only
    color: "blue" 
  },
};
```

### 7.4 Geometric Calculations

#### Polygon Area (Shoelace Formula)
```typescript
function calculatePolygonArea(points: { x: number; y: number }[]): number {
  let area = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  
  return Math.abs(area / 2);
}
```

#### Distance Calculation
```typescript
function calculateDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}
```

### 7.5 Shape Templates

Pre-defined architectural elements for quick design:

| Category | Templates |
|----------|-----------|
| **Buildings** | Small house (10x12m), Medium house (14x16m), Garage (6x3m), Annex (4x3m) |
| **Parking** | Single (2.5x5m), Double (5x5m), Driveway (3x10m) |
| **Vegetation** | Small tree (4x4m), Large tree (8x8m), Hedge (1x10m), Lawn (10x10m) |
| **Pool/Terrace** | Rectangular pool (8x4m), Oval pool (6x3m), Terrace (6x4m) |

### 7.6 Paper Sizes and Export Standards

```typescript
const PAPER_SIZES = {
  A4: { width: 210, height: 297 },   // mm
  A3: { width: 297, height: 420 },   // Recommended for plans
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
};
```

---

## 8. Environment Setup and Deployment Flow

### 8.1 Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18.x |
| npm | ≥ 9.x |
| Git | Latest |

### 8.2 Local Development Setup

```bash
# 1. Clone repository
git clone <repository-url>
cd clinet-demo

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local

# 4. Configure environment
# Edit .env.local with required values (see 8.3)

# 5. Start development server
npm run dev

# 6. Open in browser
# http://localhost:3000
```

### 8.3 Environment Variables

Create `.env.local`:

```bash
# AI Integration (Optional - mock data used if not provided)
GEMINI_API_KEY=your_gemini_api_key_here

# Future: Database Configuration
# DATABASE_URL=postgresql://...

# Future: Authentication
# NEXTAUTH_SECRET=your_secret_here
# NEXTAUTH_URL=http://localhost:3000

# Future: Cloud Storage
# CLOUDINARY_URL=cloudinary://...
# AWS_S3_BUCKET=your_bucket_name
```

### 8.4 Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint for code quality |

### 8.5 Build Process

```bash
# Production build
npm run build

# Output structure
.next/
├── cache/           # Build cache
├── server/          # Server-side bundles
├── static/          # Static assets
└── standalone/      # Standalone output (if configured)
```

### 8.6 Deployment Options

#### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deployment
vercel --prod
```

#### Docker
```dockerfile
# Dockerfile (to be created)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

#### Self-Hosted
```bash
# Build
npm run build

# Start with PM2
npm install -g pm2
pm2 start npm --name "archstudio" -- start
```

### 8.7 CI/CD Pipeline (Recommended)

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linting
        run: npm run lint
      
      - name: Build
        run: npm run build
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

---

## 9. Important Engineering Decisions

### 9.1 Decision: Next.js App Router

**Choice:** Next.js 16 with App Router (not Pages Router)

**Rationale:**
- Server Components for better performance
- Simplified routing with file-based structure
- Built-in API routes
- Better TypeScript integration
- Future-proof architecture

**Trade-offs:**
- Learning curve for developers familiar with Pages Router
- Some third-party libraries may have compatibility issues

### 9.2 Decision: Zustand for State Management

**Choice:** Zustand over Redux, MobX, or Jotai

**Rationale:**
- Minimal boilerplate
- TypeScript-first design
- No context providers needed
- Excellent DevTools support
- Small bundle size (~1KB)

**Usage Pattern:**
```typescript
// Simple hook-based access
const { currentProject, addElement } = useProjectStore();
```

### 9.3 Decision: Fabric.js for Canvas Editing

**Choice:** Fabric.js 7.x for the design editor

**Rationale:**
- Full-featured canvas library
- Object model for shapes
- Built-in selection, grouping, transformations
- SVG import/export support
- Active community and maintenance

**Trade-offs:**
- Large bundle size (~300KB)
- Learning curve for custom behaviors
- Some TypeScript type definitions incomplete

### 9.4 Decision: Tailwind CSS with Radix UI

**Choice:** Tailwind CSS 4 + Radix UI primitives (Shadcn pattern)

**Rationale:**
- Utility-first CSS for rapid development
- Radix provides accessible, unstyled components
- Full control over styling
- Dark mode support built-in
- Tree-shakeable (only used styles included)

### 9.5 Decision: Client-Side Only (No SSR for Editor)

**Choice:** Mark editor components as `"use client"`

**Rationale:**
- Fabric.js requires DOM access
- Canvas operations are inherently client-side
- Real-time interactivity requirements
- No SEO benefit for editor pages

### 9.6 Decision: Mock Data Instead of Database

**Choice:** Use in-memory data and hardcoded examples

**Context:** This is a demo/prototype phase

**Future Path:**
1. Add Supabase/PostgreSQL for persistence
2. Implement authentication
3. Add real-time collaboration (Liveblocks/Yjs)

### 9.7 Decision: French Localization Focus

**Choice:** PLU-specific terminology (French urban planning)

**Evidence:**
- CES (Coefficient d'Emprise au Sol)
- French zone classifications (UA, UB, UC)
- French architectural terms in templates

**Recommendation:** Plan for i18n internationalization for broader market

---

## 10. Risks, Technical Debt, and Improvement Opportunities

### 10.1 Critical Risks

| Risk | Severity | Description | Mitigation |
|------|----------|-------------|------------|
| **No Data Persistence** | 🔴 High | All data lost on refresh | Implement database immediately |
| **No Authentication** | 🔴 High | No user separation, security risk | Add NextAuth.js or Supabase Auth |
| **API Key Exposure** | 🔴 High | Gemini API key in server env | Ensure .env.local is in .gitignore |
| **No Error Boundaries** | 🟡 Medium | Uncaught errors crash entire app | Add React Error Boundaries |
| **No Testing** | 🟡 Medium | No unit/integration tests | Add Jest + React Testing Library |

### 10.2 Technical Debt

| Area | Issue | Priority | Effort |
|------|-------|----------|--------|
| **PDF Parsing** | Mock data for PDF/DOC files | High | Medium |
| **Duplicate Layouts** | Both `Navigation.tsx` and `Sidebar.tsx` exist | Low | Low |
| **State Inconsistency** | Projects page uses local state vs. store | Medium | Medium |
| **Canvas Memory** | No cleanup on component unmount | Medium | Low |
| **Type Safety** | Some `any` types in Fabric.js integration | Low | Medium |
| **Bundle Size** | Fabric.js adds significant weight | Low | High |
| **Accessibility** | Limited ARIA labels on canvas elements | Medium | Medium |

### 10.3 Improvement Opportunities

#### Short-Term (1-2 Sprints)

1. **Add Database**
   ```bash
   npm install @supabase/supabase-js
   # Or: npm install prisma @prisma/client
   ```
   - Migrate Project model to database
   - Add auto-save functionality

2. **Add Authentication**
   ```bash
   npm install next-auth @auth/supabase-adapter
   ```
   - Protect API routes
   - Add user context to projects

3. **Add Error Handling**
   ```typescript
   // Create error boundary component
   class ErrorBoundary extends React.Component {
     // Handle component errors gracefully
   }
   ```

4. **Implement Real PDF Parsing**
   ```bash
   npm install pdf-parse
   ```

#### Medium-Term (1-3 Months)

5. **Add Testing Suite**
   ```bash
   npm install -D jest @testing-library/react @testing-library/jest-dom
   ```
   - Unit tests for utilities
   - Integration tests for API routes
   - E2E tests with Playwright

6. **Performance Optimization**
   - Lazy load Fabric.js
   - Image optimization for site photos
   - Canvas virtualization for large projects

7. **Offline Support**
   - Service Worker for offline access
   - IndexedDB for local caching
   - Sync when online

#### Long-Term (3-6 Months)

8. **Real-Time Collaboration**
   - Implement Yjs or Liveblocks
   - Cursor presence indicators
   - Conflict resolution

9. **3D Visualization**
   - Add Three.js integration
   - 3D building previews
   - VR/AR export options

10. **Mobile App**
    - React Native wrapper
    - Camera integration for site photos
    - Offline field usage

### 10.4 Security Recommendations

| Area | Current State | Recommendation |
|------|---------------|----------------|
| **API Routes** | Unprotected | Add authentication middleware |
| **File Uploads** | Basic type validation | Add file size limits, virus scanning |
| **Input Validation** | Minimal | Add Zod schemas for all inputs |
| **Rate Limiting** | None | Add rate limiting for AI endpoints |
| **CORS** | Default | Configure explicit CORS policy |
| **Headers** | Default | Add security headers (CSP, HSTS) |

### 10.5 Monitoring Recommendations

```typescript
// Recommended monitoring stack
{
  "error-tracking": "Sentry",
  "analytics": "PostHog or Plausible",
  "performance": "Vercel Analytics",
  "logs": "Axiom or LogTail",
  "uptime": "Better Uptime or Checkly"
}
```

---

## Appendix A: Component Quick Reference

| Component | Path | Description |
|-----------|------|-------------|
| `Navigation` | `components/layout/Navigation.tsx` | Main app navigation (header + mobile menu) |
| `CanvasEditor` | `components/editor/CanvasEditor.tsx` | Fabric.js canvas wrapper |
| `Button` | `components/ui/button.tsx` | Primary button component |
| `Dialog` | `components/ui/dialog.tsx` | Modal dialog component |
| `Card` | `components/ui/card.tsx` | Card container component |

## Appendix B: API Quick Reference

```bash
# Analyze PLU Document
curl -X POST http://localhost:3000/api/analyze-plu \
  -H "Content-Type: application/json" \
  -d '{"documentContent": "Zone UB - Article 10..."}'

# Calculate Surface Area
curl -X POST http://localhost:3000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"type": "surface", "data": {"dimensions": {"width": 10, "height": 5}}}'

# Check Coverage Ratio
curl -X POST http://localhost:3000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"type": "coverage", "data": {"parcelArea": 1000, "buildingFootprint": 400}}'
```

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **PLU** | Plan Local d'Urbanisme - French local urban planning document |
| **CES** | Coefficient d'Emprise au Sol - Ground coverage ratio |
| **COS** | Coefficient d'Occupation des Sols - Floor area ratio |
| **Setback** | Required distance from property boundaries |
| **Parcel** | Land lot/plot being developed |
| **Facade** | Exterior face of a building |

---

*This documentation was generated for ArchStudio v0.1.0. For updates or corrections, please contact the development team.*
