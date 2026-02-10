"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Download,
  FileText,
  Image,
  File,
  Check,
  Loader2,
  Settings,
  Printer,
  Mail,
  Cloud,
  FolderDown,
  Maximize,
  Grid3X3,
  Palette,
  Type,
  MapPin,
  Calendar,
  User,
  Building2,
  Ruler,
  Info,
  ChevronRight,
  FileCheck,
  FilePlus,
  FileImage,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExportFormat {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  formats: string[];
  color: string;
}

interface ExportOption {
  id: string;
  label: string;
  checked: boolean;
}

const exportFormats: ExportFormat[] = [
  {
    id: "plans",
    name: "Architectural Plans",
    description: "Detailed construction drawings",
    icon: FileText,
    formats: ["PDF", "DWG", "DXF"],
    color: "from-blue-500 to-cyan-500",
  },
  {
    id: "images",
    name: "Rendered Images",
    description: "High-quality visualizations",
    icon: Image,
    formats: ["PNG", "JPG", "TIFF"],
    color: "from-violet-500 to-purple-500",
  },
  {
    id: "documents",
    name: "Documentation",
    description: "Reports and specifications",
    icon: File,
    formats: ["PDF", "DOCX", "TXT"],
    color: "from-emerald-500 to-teal-500",
  },
  {
    id: "data",
    name: "Project Data",
    description: "Calculations and measurements",
    icon: FileSpreadsheet,
    formats: ["XLSX", "CSV", "JSON"],
    color: "from-amber-500 to-orange-500",
  },
];

const paperSizes = [
  { id: "a4", name: "A4", dimensions: "210 × 297 mm" },
  { id: "a3", name: "A3", dimensions: "297 × 420 mm", recommended: true },
  { id: "a2", name: "A2", dimensions: "420 × 594 mm" },
  { id: "a1", name: "A1", dimensions: "594 × 841 mm" },
  { id: "a0", name: "A0", dimensions: "841 × 1189 mm" },
];

const scales = [
  { id: "1:50", name: "1:50", description: "Detail drawings" },
  { id: "1:100", name: "1:100", description: "Floor plans", recommended: true },
  { id: "1:200", name: "1:200", description: "Site plans" },
  { id: "1:500", name: "1:500", description: "Master plans" },
];

function CreditUsageTrigger() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ byFeature: Array<{ feature: string; totalCredits: number; count: number }>; byDocumentType: Array<{ type: string; credits: number }> } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    fetch("/api/credits?usage=true")
      .then((r) => r.json())
      .then((d) => setData(d.usage || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, data]);
  return (
    <span className="inline-flex items-center gap-2 ml-2 relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-blue-400 hover:text-blue-300 text-sm font-medium"
      >
        View usage
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="fixed right-4 top-24 z-50 p-4 rounded-xl bg-slate-800 border border-white/10 shadow-xl max-w-sm w-full">
            <h4 className="text-sm font-semibold text-white mb-2">Credit usage by feature</h4>
            {loading ? (
              <p className="text-slate-400 text-sm">Loading...</p>
            ) : data ? (
              <div className="space-y-2 text-sm">
                {data.byFeature?.map((f) => (
                  <div key={f.feature} className="flex justify-between text-slate-300">
                    <span>{f.feature.replace(/_/g, " ")}</span>
                    <span>{f.totalCredits} cr ({f.count})</span>
                  </div>
                ))}
                {data.byDocumentType?.length > 0 && (
                  <>
                    <div className="border-t border-white/10 my-2 pt-2 text-slate-400">By document type</div>
                    {data.byDocumentType.map((d) => (
                      <div key={d.type} className="flex justify-between text-slate-300">
                        <span>{d.type.replace(/_/g, " ")}</span>
                        <span>{d.credits} cr</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <p className="text-slate-400 text-sm">No usage data</p>
            )}
            <button type="button" onClick={() => setOpen(false)} className="mt-2 text-slate-400 hover:text-white text-xs">Close</button>
          </div>
        </>
      )}
    </span>
  );
}

const DOCUMENT_TYPES = [
  { id: "LOCATION_PLAN", name: "Location Plan", credits: 2, description: "Aerial, IGN, cadastral views" },
  { id: "SITE_PLAN", name: "Site Plan", credits: 3, description: "Site plan with footprints" },
  { id: "SECTION", name: "Section", credits: 2, description: "Terrain section" },
  { id: "ELEVATION", name: "Elevation", credits: 2, description: "Building elevation" },
  { id: "LANDSCAPE_INSERTION", name: "Landscape Insertion", credits: 5, description: "Project-in-photo image" },
  { id: "DESCRIPTIVE_STATEMENT", name: "Descriptive Statement", credits: 2, description: "AI-generated notice" },
  { id: "FULL_PACKAGE", name: "Full Package", credits: 10, description: "All documents" },
];

function ExportPageContent() {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<{ id: string; name: string; address?: string | null }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(searchParams.get("project") || "");
  const [selectedDocumentType, setSelectedDocumentType] = useState(searchParams.get("doc") || "LOCATION_PLAN");
  const [apiExporting, setApiExporting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>("plans");
  const [selectedPaper, setSelectedPaper] = useState(searchParams.get("paper") === "a4" ? "a4" : "a3");
  const [selectedScale, setSelectedScale] = useState("1:100");
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [outputFormat, setOutputFormat] = useState("PDF");

  const [includeOptions, setIncludeOptions] = useState<ExportOption[]>([
    { id: "title", label: "Project Title Block", checked: true },
    { id: "scale", label: "Scale Indicator (mandatory)", checked: true },
    { id: "north", label: "North Arrow (mandatory)", checked: true },
    { id: "dimensions", label: "Dimensions (mandatory)", checked: true },
    { id: "grid", label: "Grid Lines", checked: false },
    { id: "annotations", label: "Annotations", checked: true },
    { id: "legend", label: "Legend (mandatory)", checked: true },
    { id: "date", label: "Date & Revision", checked: true },
  ]);

  const [projectInfo, setProjectInfo] = useState({
    projectName: "Villa Méditerranée",
    clientName: "Jean Dupont",
    location: "Nice, France",
    architect: "roms09 Studio",
    date: new Date().toLocaleDateString(),
    revision: "Rev. A",
  });

  useEffect(() => {
    if (!user) return;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => setProjects([]));
  }, [user]);

  const handleApiExport = async () => {
    if (!selectedProjectId || !user) return;
    setApiExporting(true);
    setApiError(null);
    try {
      const res = await fetch("/api/documents/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          documentType: selectedDocumentType,
          options: {
            paperSize: selectedPaper.toUpperCase(),
            scale: selectedScale,
            include: Object.fromEntries(
              includeOptions.map((o) => [o.id, o.checked])
            ),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error || "Export failed");
        return;
      }
      if (data.document?.fileData) {
        const link = document.createElement("a");
        const isImage = (data.document as { isImage?: boolean }).isImage;
        const mime = (data.document as { mimeType?: string }).mimeType || "application/pdf";
        const ext = mime.includes("png") ? "png" : mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "pdf";
        link.href = `data:${mime};base64,${data.document.fileData}`;
        link.download = `${(data.document.name || "document").replace(/\s+/g, "-")}.${ext}`;
        link.click();
      }
      setExportComplete(true);
    } catch (e) {
      setApiError("Export failed");
    }
    setApiExporting(false);
  };

  const toggleOption = (id: string) => {
    setIncludeOptions(options =>
      options.map(opt => opt.id === id ? { ...opt, checked: !opt.checked } : opt)
    );
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      // Create a canvas element to generate the export
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size based on paper selection (at 72 DPI for preview)
      const sizes: Record<string, {w: number, h: number}> = {
        a4: { w: 595, h: 842 },
        a3: { w: 842, h: 1190 },
        a2: { w: 1190, h: 1684 },
        a1: { w: 1684, h: 2384 },
        a0: { w: 2384, h: 3370 },
      };
      
      const size = sizes[selectedPaper] || sizes.a3;
      canvas.width = size.w;
      canvas.height = size.h;
      
      if (ctx) {
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
        
        // Title block
        const titleBlockHeight = 80;
        const titleBlockWidth = canvas.width / 2;
        ctx.strokeRect(canvas.width - titleBlockWidth - 20, canvas.height - titleBlockHeight - 20, titleBlockWidth, titleBlockHeight);
        
        // Title text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(projectInfo.projectName, canvas.width - titleBlockWidth - 10, canvas.height - titleBlockHeight);
        
        ctx.font = '12px Arial';
        ctx.fillText(`Client: ${projectInfo.clientName}`, canvas.width - titleBlockWidth - 10, canvas.height - titleBlockHeight + 20);
        ctx.fillText(`Location: ${projectInfo.location}`, canvas.width - titleBlockWidth - 10, canvas.height - titleBlockHeight + 35);
        ctx.fillText(`Scale: ${selectedScale}`, canvas.width - titleBlockWidth - 10, canvas.height - titleBlockHeight + 50);
        ctx.fillText(`Date: ${projectInfo.date}`, canvas.width - titleBlockWidth - 10, canvas.height - titleBlockHeight + 65);
        ctx.fillText(projectInfo.architect, canvas.width - 150, canvas.height - 30);
        
        // Main content area placeholder
        ctx.strokeStyle = '#cccccc';
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - titleBlockHeight - 80);
        ctx.setLineDash([]);
        
        ctx.font = '14px Arial';
        ctx.fillStyle = '#666666';
        ctx.textAlign = 'center';
        ctx.fillText('Architectural Plan - ' + selectedFormat.toUpperCase(), canvas.width / 2, canvas.height / 2);
        ctx.fillText(selectedScale, canvas.width / 2, canvas.height / 2 + 25);
        
        // Scale bar
        if (includeOptions.find(o => o.id === 'scale' && o.checked)) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(40, canvas.height - titleBlockHeight - 50, 100, 5);
          ctx.font = '10px Arial';
          ctx.textAlign = 'left';
          ctx.fillText('1m', 145, canvas.height - titleBlockHeight - 45);
        }
        
        // North arrow
        if (includeOptions.find(o => o.id === 'north' && o.checked)) {
          ctx.save();
          ctx.translate(canvas.width - 60, 60);
          ctx.beginPath();
          ctx.moveTo(0, -20);
          ctx.lineTo(-10, 10);
          ctx.lineTo(0, 5);
          ctx.lineTo(10, 10);
          ctx.closePath();
          ctx.fill();
          ctx.font = 'bold 12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('N', 0, -25);
          ctx.restore();
        }
      }
      
      // Generate download based on format
      if (outputFormat === 'PNG' || outputFormat === 'JPG') {
        const mimeType = outputFormat === 'PNG' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, 0.95);
        const link = document.createElement('a');
        link.download = `${projectInfo.projectName.replace(/\\s+/g, '_')}_${selectedPaper.toUpperCase()}.${outputFormat.toLowerCase()}`;
        link.href = dataUrl;
        link.click();
      } else if (outputFormat === 'PDF') {
        // Use jsPDF so the file is a valid PDF (fixes "damaged" Acrobat error from hand-crafted PDF)
        const { jsPDF } = await import('jspdf');
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        const doc = new jsPDF({
          orientation: size.w > size.h ? 'landscape' : 'portrait',
          unit: 'pt',
          format: [size.w, size.h],
        });
        doc.addImage(dataUrl, 'PNG', 0, 0, size.w, size.h);
        doc.save(`${projectInfo.projectName.replace(/\s+/g, '_')}_${selectedPaper.toUpperCase()}.pdf`);
      } else {
        // For other formats, export as PNG
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${projectInfo.projectName.replace(/\\s+/g, '_')}_${selectedPaper.toUpperCase()}.png`;
        link.href = dataUrl;
        link.click();
      }
      
    } catch (error) {
      console.error('Export error:', error);
    }
    
    setIsExporting(false);
    setExportComplete(true);
  };

  const activeFormat = exportFormats.find(f => f.id === selectedFormat)!;

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
                <Download className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Export Center</h1>
            </div>
            <p className="text-slate-400">
              Generate professional documents and deliverables {user && `• ${user.credits} credits`}
              {user && (
                <CreditUsageTrigger />
              )}
            </p>
          </div>
        </div>

        {user && projects.length > 0 && (
          <div className="p-6 rounded-2xl bg-slate-800/50 border border-white/10 space-y-4">
            <h2 className="text-lg font-semibold text-white">Export Project Documents (Credit-based)</h2>
            <p className="text-slate-400 text-sm">
              All documents will be generated automatically from your project. Choose the type and format then export.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white"
                >
                  <option value="">Select project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Document Type</label>
                <select
                  value={selectedDocumentType}
                  onChange={(e) => setSelectedDocumentType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white"
                >
                  {DOCUMENT_TYPES.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.credits} credits)</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleApiExport}
                  disabled={!selectedProjectId || apiExporting}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-50"
                >
                  {apiExporting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Export PDF
                    </>
                  )}
                </button>
              </div>
            </div>
            {apiError && (
              <p className="text-sm text-red-400">{apiError}</p>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Format & Settings */}
          <div className="lg:col-span-2 space-y-6">
            {/* Export Type Selection */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Export Type</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {exportFormats.map((format) => (
                  <button
                    key={format.id}
                    onClick={() => {
                      setSelectedFormat(format.id);
                      setOutputFormat(format.formats[0]);
                    }}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all",
                      selectedFormat === format.id
                        ? "border-blue-500/50 bg-blue-500/10"
                        : "border-white/10 bg-slate-800/50 hover:border-white/20"
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br",
                        format.color
                      )}>
                        <format.icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-white">{format.name}</p>
                        <p className="text-sm text-slate-400 mt-0.5">{format.description}</p>
                        <div className="flex gap-2 mt-2">
                          {format.formats.map(f => (
                            <span key={f} className="px-2 py-0.5 rounded text-xs bg-slate-700 text-slate-300">
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                      {selectedFormat === format.id && (
                        <Check className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Output Format */}
            <div className="p-5 rounded-2xl bg-slate-800/50 border border-white/10 space-y-4">
              <h3 className="text-sm font-semibold text-white">Output Format</h3>
              <div className="flex gap-2">
                {activeFormat.formats.map((format) => (
                  <button
                    key={format}
                    onClick={() => setOutputFormat(format)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                      outputFormat === format
                        ? "bg-blue-500 text-white"
                        : "bg-slate-700 text-slate-400 hover:text-white"
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>

            {/* Paper Size & Scale (for Plans) */}
            {selectedFormat === "plans" && (
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Paper Size */}
                <div className="p-5 rounded-2xl bg-slate-800/50 border border-white/10 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Maximize className="w-4 h-4 text-blue-400" />
                    Paper Size
                  </h3>
                  <div className="space-y-2">
                    {paperSizes.map((size) => (
                      <button
                        key={size.id}
                        onClick={() => setSelectedPaper(size.id)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl transition-colors",
                          selectedPaper === size.id
                            ? "bg-blue-500/20 border border-blue-500/50"
                            : "bg-slate-700/50 border border-transparent hover:border-white/10"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "font-semibold",
                            selectedPaper === size.id ? "text-blue-400" : "text-white"
                          )}>{size.name}</span>
                          {size.recommended && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                              Recommended
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-slate-400">{size.dimensions}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scale */}
                <div className="p-5 rounded-2xl bg-slate-800/50 border border-white/10 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Ruler className="w-4 h-4 text-purple-400" />
                    Drawing Scale
                  </h3>
                  <div className="space-y-2">
                    {scales.map((scale) => (
                      <button
                        key={scale.id}
                        onClick={() => setSelectedScale(scale.id)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl transition-colors",
                          selectedScale === scale.id
                            ? "bg-purple-500/20 border border-purple-500/50"
                            : "bg-slate-700/50 border border-transparent hover:border-white/10"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "font-semibold",
                            selectedScale === scale.id ? "text-purple-400" : "text-white"
                          )}>{scale.name}</span>
                          {scale.recommended && (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                              Recommended
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-slate-400">{scale.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Include Options */}
            <div className="p-5 rounded-2xl bg-slate-800/50 border border-white/10 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-400" />
                Include in Export
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {includeOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => toggleOption(option.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl transition-colors text-left",
                      option.checked
                        ? "bg-blue-500/10 border border-blue-500/30"
                        : "bg-slate-700/30 border border-transparent hover:border-white/10"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded flex items-center justify-center",
                      option.checked ? "bg-blue-500" : "bg-slate-600"
                    )}>
                      {option.checked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={cn(
                      "text-sm",
                      option.checked ? "text-white" : "text-slate-400"
                    )}>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Preview & Actions */}
          <div className="space-y-4">
            {/* Project Info (Auto-populate) */}
            <div className="p-5 rounded-2xl bg-slate-800/50 border border-white/10 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400" />
                Document Info
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Project Name</label>
                  <input
                    type="text"
                    value={projectInfo.projectName}
                    onChange={(e) => setProjectInfo({ ...projectInfo, projectName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Client</label>
                  <input
                    type="text"
                    value={projectInfo.clientName}
                    onChange={(e) => setProjectInfo({ ...projectInfo, clientName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Location</label>
                    <input
                      type="text"
                      value={projectInfo.location}
                      onChange={(e) => setProjectInfo({ ...projectInfo, location: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Date</label>
                    <input
                      type="text"
                      value={projectInfo.date}
                      onChange={(e) => setProjectInfo({ ...projectInfo, date: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Architect / Studio</label>
                  <input
                    type="text"
                    value={projectInfo.architect}
                    onChange={(e) => setProjectInfo({ ...projectInfo, architect: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="p-5 rounded-2xl bg-slate-800/50 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-4">Preview</h3>
              <div className="aspect-[3/4] bg-white rounded-lg p-3 relative">
                <div className="absolute inset-3 border border-slate-200 rounded">
                  {/* Title Block Preview */}
                  <div className="absolute bottom-0 right-0 w-1/2 border-t border-l border-slate-200 p-2 bg-slate-50">
                    <div className="space-y-0.5">
                      <p className="text-[6px] font-bold text-slate-800 truncate">{projectInfo.projectName}</p>
                      <p className="text-[5px] text-slate-600 truncate">{projectInfo.clientName}</p>
                      <div className="flex justify-between text-[4px] text-slate-500">
                        <span>{projectInfo.date}</span>
                        <span>{selectedScale}</span>
                      </div>
                      <p className="text-[4px] text-slate-400">{projectInfo.architect}</p>
                    </div>
                  </div>
                  {/* Content Area */}
                  <div className="absolute top-4 left-4 right-4 bottom-12">
                    <div className="w-full h-full border border-dashed border-slate-300 rounded flex items-center justify-center">
                      <Building2 className="w-8 h-8 text-slate-300" />
                    </div>
                  </div>
                  {/* Scale bar */}
                  <div className="absolute bottom-14 left-4 flex items-center gap-1">
                    <div className="w-8 h-0.5 bg-slate-400" />
                    <span className="text-[4px] text-slate-400">1m</span>
                  </div>
                </div>
                {/* Paper size label */}
                <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-slate-100 rounded text-[6px] text-slate-500 font-medium">
                  {selectedPaper.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={isExporting}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold transition-all",
                exportComplete
                  ? "bg-emerald-500 text-white"
                  : "bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:shadow-lg hover:shadow-purple-500/25"
              )}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : exportComplete ? (
                <>
                  <Check className="w-5 h-5" />
                  Export Complete!
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Export {outputFormat}
                </>
              )}
            </button>

            {exportComplete && (
              <div className="flex gap-3">
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-sm font-medium hover:bg-slate-700 transition-colors">
                  <FolderDown className="w-4 h-4" />
                  Open Folder
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-sm font-medium hover:bg-slate-700 transition-colors">
                  <Mail className="w-4 h-4" />
                  Share
                </button>
              </div>
            )}

            {/* Quick Actions */}
            <div className="space-y-2">
              <button className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 border border-white/5 hover:border-white/10 transition-colors">
                <Printer className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-slate-300">Print Preview</span>
                <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
              </button>
              <button className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 border border-white/5 hover:border-white/10 transition-colors">
                <Cloud className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-slate-300">Save to Cloud</span>
                <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Navigation>
  );
}

export default function ExportPage() {
  return (
    <Suspense fallback={
      <Navigation>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      </Navigation>
    }>
      <ExportPageContent />
    </Suspense>
  );
}
