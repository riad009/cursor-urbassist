"use client"

import { useState } from "react"
import { AppLayout, Header } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatArea, formatDistance } from "@/lib/utils"
import {
  Calculator,
  Square,
  Ruler,
  Box,
  Percent,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"

interface CalculationResult {
  type: string
  value: number
  formatted: string
  details?: object
}

export default function CalculationsPage() {
  const [results, setResults] = useState<CalculationResult[]>([])

  // Surface calculation state
  const [surfaceWidth, setSurfaceWidth] = useState("")
  const [surfaceHeight, setSurfaceHeight] = useState("")

  // Distance calculation state
  const [distanceX1, setDistanceX1] = useState("")
  const [distanceY1, setDistanceY1] = useState("")
  const [distanceX2, setDistanceX2] = useState("")
  const [distanceY2, setDistanceY2] = useState("")

  // Volume calculation state
  const [volumeFootprint, setVolumeFootprint] = useState("")
  const [volumeFloors, setVolumeFloors] = useState("")
  const [volumeFloorHeight, setVolumeFloorHeight] = useState("2.7")

  // Coverage calculation state
  const [parcelArea, setParcelArea] = useState("")
  const [buildingFootprint, setBuildingFootprint] = useState("")
  const [maxCES, setMaxCES] = useState("0.4")

  const calculateSurface = async () => {
    const width = parseFloat(surfaceWidth)
    const height = parseFloat(surfaceHeight)

    if (isNaN(width) || isNaN(height)) return

    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "surface",
        data: { dimensions: { width, height } },
        scale: 1,
      }),
    })

    const data = await response.json()
    if (data.success) {
      setResults((prev) => [
        {
          type: "Surface",
          value: data.calculation.areaMeters,
          formatted: data.calculation.formatted,
          details: data.calculation,
        },
        ...prev,
      ])
    }
  }

  const calculateDistance = async () => {
    const x1 = parseFloat(distanceX1)
    const y1 = parseFloat(distanceY1)
    const x2 = parseFloat(distanceX2)
    const y2 = parseFloat(distanceY2)

    if ([x1, y1, x2, y2].some(isNaN)) return

    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "distance",
        data: {
          points: [
            { x: x1, y: y1 },
            { x: x2, y: y2 },
          ],
        },
        scale: 1,
      }),
    })

    const data = await response.json()
    if (data.success) {
      setResults((prev) => [
        {
          type: "Distance",
          value: data.calculation.totalDistance,
          formatted: data.calculation.formatted,
          details: data.calculation,
        },
        ...prev,
      ])
    }
  }

  const calculateVolume = async () => {
    const footprint = parseFloat(volumeFootprint)
    const floors = parseFloat(volumeFloors)
    const floorHeight = parseFloat(volumeFloorHeight)

    if ([footprint, floors, floorHeight].some(isNaN)) return

    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "volume",
        data: {
          buildingFootprint: footprint,
          buildingFloors: floors,
          floorHeight,
        },
      }),
    })

    const data = await response.json()
    if (data.success) {
      setResults((prev) => [
        {
          type: "Volume",
          value: data.calculation.volumeMeters,
          formatted: data.calculation.formatted,
          details: data.calculation,
        },
        ...prev,
      ])
    }
  }

  const calculateCoverage = async () => {
    const parcel = parseFloat(parcelArea)
    const building = parseFloat(buildingFootprint)
    const maxRatio = parseFloat(maxCES)

    if ([parcel, building].some(isNaN)) return

    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "coverage",
        data: {
          parcelArea: parcel,
          buildingFootprint: building,
        },
      }),
    })

    const data = await response.json()
    if (data.success) {
      const isCompliant = data.calculation.coverageRatio <= maxRatio
      setResults((prev) => [
        {
          type: "Coverage (CES)",
          value: data.calculation.coverageRatio,
          formatted: data.calculation.formatted,
          details: { ...data.calculation, isCompliant, maxRatio },
        },
        ...prev,
      ])
    }
  }

  const clearResults = () => setResults([])

  return (
    <AppLayout>
      <Header
        title="Calculations"
        description="Calculate surfaces, distances, volumes, and regulatory ratios"
      />

      <div className="p-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Calculator Panel */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-blue-600" />
                Calculation Tools
              </CardTitle>
              <CardDescription>
                Enter dimensions to calculate construction metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="surface">
                <TabsList className="grid grid-cols-4 mb-6">
                  <TabsTrigger value="surface">
                    <Square className="h-4 w-4 mr-1" />
                    Surface
                  </TabsTrigger>
                  <TabsTrigger value="distance">
                    <Ruler className="h-4 w-4 mr-1" />
                    Distance
                  </TabsTrigger>
                  <TabsTrigger value="volume">
                    <Box className="h-4 w-4 mr-1" />
                    Volume
                  </TabsTrigger>
                  <TabsTrigger value="coverage">
                    <Percent className="h-4 w-4 mr-1" />
                    Coverage
                  </TabsTrigger>
                </TabsList>

                {/* Surface Calculator */}
                <TabsContent value="surface" className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <h4 className="font-medium text-blue-900 mb-4">
                      Surface Area Calculation
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="width">Width (meters)</Label>
                        <Input
                          id="width"
                          type="number"
                          step="0.01"
                          placeholder="10.5"
                          value={surfaceWidth}
                          onChange={(e) => setSurfaceWidth(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="height">Length (meters)</Label>
                        <Input
                          id="height"
                          type="number"
                          step="0.01"
                          placeholder="15.2"
                          value={surfaceHeight}
                          onChange={(e) => setSurfaceHeight(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <Button className="w-full mt-4" onClick={calculateSurface}>
                      Calculate Surface
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>

                  <div className="p-4 border border-gray-200 rounded-xl">
                    <p className="text-sm text-gray-600">
                      <strong>Formula:</strong> Area = Width × Length
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Result will be displayed in square meters (m²)
                    </p>
                  </div>
                </TabsContent>

                {/* Distance Calculator */}
                <TabsContent value="distance" className="space-y-4">
                  <div className="p-4 bg-green-50 rounded-xl">
                    <h4 className="font-medium text-green-900 mb-4">
                      Distance Calculation
                    </h4>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-green-700">Point A</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label htmlFor="x1" className="text-xs">X</Label>
                            <Input
                              id="x1"
                              type="number"
                              placeholder="0"
                              value={distanceX1}
                              onChange={(e) => setDistanceX1(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="y1" className="text-xs">Y</Label>
                            <Input
                              id="y1"
                              type="number"
                              placeholder="0"
                              value={distanceY1}
                              onChange={(e) => setDistanceY1(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-green-700">Point B</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label htmlFor="x2" className="text-xs">X</Label>
                            <Input
                              id="x2"
                              type="number"
                              placeholder="10"
                              value={distanceX2}
                              onChange={(e) => setDistanceX2(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="y2" className="text-xs">Y</Label>
                            <Input
                              id="y2"
                              type="number"
                              placeholder="10"
                              value={distanceY2}
                              onChange={(e) => setDistanceY2(e.target.value)}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700"
                      onClick={calculateDistance}
                    >
                      Calculate Distance
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </TabsContent>

                {/* Volume Calculator */}
                <TabsContent value="volume" className="space-y-4">
                  <div className="p-4 bg-purple-50 rounded-xl">
                    <h4 className="font-medium text-purple-900 mb-4">
                      Building Volume Calculation
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="footprint">Footprint (m²)</Label>
                        <Input
                          id="footprint"
                          type="number"
                          step="0.01"
                          placeholder="120"
                          value={volumeFootprint}
                          onChange={(e) => setVolumeFootprint(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="floors">Number of Floors</Label>
                        <Input
                          id="floors"
                          type="number"
                          placeholder="2"
                          value={volumeFloors}
                          onChange={(e) => setVolumeFloors(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="floorHeight">Floor Height (m)</Label>
                        <Input
                          id="floorHeight"
                          type="number"
                          step="0.1"
                          placeholder="2.7"
                          value={volumeFloorHeight}
                          onChange={(e) => setVolumeFloorHeight(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
                      onClick={calculateVolume}
                    >
                      Calculate Volume
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </TabsContent>

                {/* Coverage Calculator */}
                <TabsContent value="coverage" className="space-y-4">
                  <div className="p-4 bg-orange-50 rounded-xl">
                    <h4 className="font-medium text-orange-900 mb-4">
                      CES - Ground Coverage Ratio
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="parcel">Parcel Area (m²)</Label>
                        <Input
                          id="parcel"
                          type="number"
                          step="0.01"
                          placeholder="500"
                          value={parcelArea}
                          onChange={(e) => setParcelArea(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="building">Building Footprint (m²)</Label>
                        <Input
                          id="building"
                          type="number"
                          step="0.01"
                          placeholder="150"
                          value={buildingFootprint}
                          onChange={(e) => setBuildingFootprint(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="maxCes">Max CES (PLU)</Label>
                        <Input
                          id="maxCes"
                          type="number"
                          step="0.05"
                          placeholder="0.40"
                          value={maxCES}
                          onChange={(e) => setMaxCES(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full mt-4 bg-orange-600 hover:bg-orange-700"
                      onClick={calculateCoverage}
                    >
                      Check Compliance
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>

                  <div className="p-4 border border-orange-200 rounded-xl bg-orange-50/50">
                    <p className="text-sm text-orange-800">
                      <strong>CES (Coefficient d'Emprise au Sol)</strong> is the ratio
                      of building footprint to parcel area. French urban planning
                      regulations typically limit this to 30-50%.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Results Panel */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Results</CardTitle>
                <CardDescription>Calculation history</CardDescription>
              </div>
              {results.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearResults}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Calculator className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No calculations yet</p>
                  <p className="text-xs">Results will appear here</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {results.map((result, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-gray-200 bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="info">{result.type}</Badge>
                        {result.details &&
                          "isCompliant" in result.details &&
                          (result.details.isCompliant ? (
                            <Badge variant="success">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Compliant
                            </Badge>
                          ) : (
                            <Badge variant="error">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Exceeds Limit
                            </Badge>
                          ))}
                      </div>
                      <p className="text-2xl font-bold text-gray-900">
                        {result.formatted}
                      </p>
                      {result.details && "totalHeight" in result.details && (
                        <p className="text-xs text-gray-500 mt-1">
                          Total height: {(result.details as { totalHeight: number }).totalHeight}m
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
