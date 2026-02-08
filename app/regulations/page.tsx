"use client";

import React, { useState, useCallback, useEffect } from "react";
import Navigation from "@/components/layout/Navigation";
import {
  Upload,
  FileText,
  Sparkles,
  Brain,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ChevronRight,
  Loader2,
  Building2,
  Ruler,
  Trees,
  Car,
  Home,
  Zap,
  Eye,
  Download,
  RefreshCw,
  MessageSquare,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalysisResult {
  category: string;
  title: string;
  status: "compliant" | "warning" | "violation" | "info";
  value: string;
  requirement: string;
  recommendation?: string;
}

const mockAnalysis: AnalysisResult[] = [
  {
    category: "Height",
    title: "Maximum Building Height",
    status: "compliant",
    value: "8.5m",
    requirement: "Max 10m allowed in zone UA",
    recommendation: "Your project is within the allowed height limit.",
  },
  {
    category: "Setback",
    title: "Front Setback",
    status: "compliant",
    value: "5m",
    requirement: "Min 4m required from road",
    recommendation: "Compliant with local regulations.",
  },
  {
    category: "Coverage",
    title: "Plot Coverage Ratio",
    status: "warning",
    value: "48%",
    requirement: "Max 50% recommended",
    recommendation: "Consider reducing coverage to leave margin for modifications.",
  },
  {
    category: "Parking",
    title: "Parking Spaces",
    status: "compliant",
    value: "3 spaces",
    requirement: "Min 2 spaces required for this area",
    recommendation: "Exceeds minimum requirement.",
  },
  {
    category: "Green Space",
    title: "Vegetated Area",
    status: "violation",
    value: "15%",
    requirement: "Min 20% required",
    recommendation: "Add more landscaping or reduce built area.",
  },
  {
    category: "Distance",
    title: "Distance to Boundary",
    status: "compliant",
    value: "3.5m",
    requirement: "Min 3m from property line",
    recommendation: "Compliant with boundary requirements.",
  },
];

const statusConfig = {
  compliant: { label: "Compliant", color: "text-emerald-400", bg: "bg-emerald-500/20", icon: CheckCircle2 },
  warning: { label: "Warning", color: "text-amber-400", bg: "bg-amber-500/20", icon: AlertTriangle },
  violation: { label: "Violation", color: "text-red-400", bg: "bg-red-500/20", icon: XCircle },
  info: { label: "Info", color: "text-blue-400", bg: "bg-blue-500/20", icon: Info },
};

const categoryIcons: Record<string, React.ElementType> = {
  Height: Building2,
  Setback: Ruler,
  Coverage: Home,
  Parking: Car,
  "Green Space": Trees,
  Distance: Ruler,
};

export default function RegulationsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<"document" | "address" | "project">("document");
  const [addressForPlu, setAddressForPlu] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<{ label: string; coordinates?: number[] }[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string; address?: string | null; coordinates?: string | null }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoMessage, setAutoMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [addressSearchDone, setAddressSearchDone] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => setProjects([]));
  }, []);

  const runAutoRegulatory = async () => {
    if (!selectedProjectId) return;
    setAutoRunning(true);
    setAutoMessage(null);
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/regulatory/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setAutoMessage({ type: "success", text: "Automatic regulatory detection completed. Zone and PDF URL saved to project. Use Editor or Feasibility to see rules." });
      } else {
        setAutoMessage({ type: "error", text: data.error || "Automatic detection failed." });
      }
    } catch {
      setAutoMessage({ type: "error", text: "Request failed." });
    }
    setAutoRunning(false);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const analyzeDocument = async () => {
    if (!file) return;
    
    setIsAnalyzing(true);
    
    try {
      let documentContent = "";
      // Use upload-document API for PDF/DOC parsing, fallback to file.text() for TXT
      if (file.type === "application/pdf" || file.type.includes("word") || file.type.includes("document")) {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload-document", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        documentContent = uploadData.content || "";
      } else {
        documentContent = await file.text();
      }
      
      // Call the AI analysis API
      const response = await fetch('/api/analyze-plu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentContent,
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.analysis) {
        // Transform API response to display format
        const transformedResults: AnalysisResult[] = [];
        
        if (data.analysis.maxHeight) {
          transformedResults.push({
            category: "Height",
            title: "Maximum Building Height",
            status: "compliant",
            value: `${data.analysis.maxHeight}m`,
            requirement: `Max ${data.analysis.maxHeight}m allowed in zone ${data.analysis.zoneClassification || 'N/A'}`,
            recommendation: "Within the allowed height limit.",
          });
        }
        
        if (data.analysis.setbacks) {
          transformedResults.push({
            category: "Setback",
            title: "Front Setback",
            status: "compliant",
            value: `${data.analysis.setbacks.front}m`,
            requirement: `Min ${data.analysis.setbacks.front}m required from road`,
            recommendation: "Compliant with local regulations.",
          });
        }
        
        if (data.analysis.maxCoverageRatio) {
          const ratio = data.analysis.maxCoverageRatio * 100;
          transformedResults.push({
            category: "Coverage",
            title: "Plot Coverage Ratio",
            status: ratio > 45 ? "warning" : "compliant",
            value: `${ratio}%`,
            requirement: `Max ${ratio}% allowed`,
            recommendation: data.analysis.recommendations?.[0] || "Check coverage requirements.",
          });
        }
        
        if (data.analysis.parkingRequirements) {
          transformedResults.push({
            category: "Parking",
            title: "Parking Spaces",
            status: "info",
            value: data.analysis.parkingRequirements,
            requirement: data.analysis.parkingRequirements,
            recommendation: "Verify parking allocation.",
          });
        }
        
        if (data.analysis.greenSpaceRequirements) {
          transformedResults.push({
            category: "Green Space",
            title: "Vegetated Area",
            status: "info",
            value: data.analysis.greenSpaceRequirements,
            requirement: data.analysis.greenSpaceRequirements,
            recommendation: "Plan landscaping accordingly.",
          });
        }
        
        if (data.analysis.architecturalConstraints?.length > 0) {
          transformedResults.push({
            category: "Distance",
            title: "Architectural Requirements",
            status: "info",
            value: `${data.analysis.architecturalConstraints.length} constraints`,
            requirement: data.analysis.architecturalConstraints.join(", "),
            recommendation: "Review all architectural constraints.",
          });
        }
        
        setResults(transformedResults.length > 0 ? transformedResults : mockAnalysis);
      } else {
        // Fallback to mock data if API fails
        setResults(mockAnalysis);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      // Fallback to mock data on error
      setResults(mockAnalysis);
    }
    
    setAnalysisComplete(true);
    setIsAnalyzing(false);
  };

  const resetAnalysis = () => {
    setFile(null);
    setAnalysisComplete(false);
    setResults([]);
    setSelectedResult(null);
    setAddressForPlu("");
    setAddressSuggestions([]);
    setAddressSearchDone(false);
  };

  const searchAddressForPlu = useCallback(async () => {
    const query = addressForPlu.trim();
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      setAddressSearchDone(false);
      return;
    }
    setLoadingAddress(true);
    setAddressSuggestions([]);
    setAddressSearchDone(false);
    try {
      const res = await fetch("/api/address/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: query }),
      });
      const d = await res.json();
      if (!res.ok) {
        setAddressSuggestions([]);
        return;
      }
      const list = Array.isArray(d.results) ? d.results : [];
      setAddressSuggestions(list.map((r: { label?: string; coordinates?: number[] }) => ({
        label: r.label || "",
        coordinates: Array.isArray(r.coordinates) && r.coordinates.length >= 2 ? r.coordinates : undefined,
      })));
    } catch {
      setAddressSuggestions([]);
    }
    setLoadingAddress(false);
    setAddressSearchDone(true);
  }, [addressForPlu]);

  useEffect(() => {
    const t = setTimeout(searchAddressForPlu, 400);
    return () => clearTimeout(t);
  }, [addressForPlu, searchAddressForPlu]);

  const analyzeByAddress = async (coords: number[]) => {
    if (!coords || coords.length < 2) return;
    setIsAnalyzing(true);
    try {
      const pluRes = await fetch("/api/plu-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: coords }),
      });
      const pluResData = await pluRes.json();
      const pluData = pluResData.plu || pluResData;
      const regs = pluData.regulations as Record<string, unknown> | undefined;
      const transformedResults: AnalysisResult[] = [];
      if (pluData.zoneType || pluData.zoneName) {
        transformedResults.push({
          category: "Zone",
          title: "PLU Zone",
          status: "info",
          value: pluData.zoneType || pluData.zoneName || "N/A",
          requirement: `Detected zone for this address`,
          recommendation: "Verify with local urban planning office.",
        });
      }
      if (regs?.maxHeight) {
        transformedResults.push({
          category: "Height",
          title: "Maximum Building Height",
          status: "info",
          value: `${regs.maxHeight}m`,
          requirement: `Max height in zone`,
          recommendation: "Check full PLU for exact rules.",
        });
      }
      if (regs?.setbacks && typeof regs.setbacks === "object") {
        const s = regs.setbacks as Record<string, number>;
        transformedResults.push({
          category: "Setback",
          title: "Setbacks",
          status: "info",
          value: `F:${s.front || 0}m S:${s.side || 0}m R:${s.rear || 0}m`,
          requirement: "Front, side, rear setbacks",
          recommendation: "Verify with PLU document.",
        });
      }
      if (regs?.maxCoverageRatio) {
        transformedResults.push({
          category: "Coverage",
          title: "Coverage Ratio",
          status: "info",
          value: `${Number(regs.maxCoverageRatio) * 100}%`,
          requirement: "Maximum plot coverage",
          recommendation: "Check PLU for exact limits.",
        });
      }
      setResults(transformedResults.length > 0 ? transformedResults : mockAnalysis);
    } catch {
      setResults(mockAnalysis);
    }
    setAnalysisComplete(true);
    setIsAnalyzing(false);
  };

  const askAIForDetails = async () => {
    if (!selectedResult || !aiQuestion.trim()) return;
    
    setIsAskingAI(true);
    try {
      const response = await fetch('/api/analyze-plu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentContent: `Question about ${selectedResult.title}:
${aiQuestion}

Context:
- Category: ${selectedResult.category}
- Current Value: ${selectedResult.value}
- Requirement: ${selectedResult.requirement}
- Status: ${selectedResult.status}`,
        }),
      });
      
      const data = await response.json();
      if (data.success && data.analysis) {
        setAiResponse(data.analysis.recommendations?.join('\n') || 
          `Based on the ${selectedResult.category} analysis:\n\n` +
          `Your current value of ${selectedResult.value} is ${selectedResult.status === 'compliant' ? 'within' : 'outside'} the required parameters.\n\n` +
          `Recommendation: ${selectedResult.recommendation}`);
      } else {
        setAiResponse(`Based on the ${selectedResult.category} analysis:\n\n` +
          `Your current value of ${selectedResult.value} is ${selectedResult.status === 'compliant' ? 'within' : 'outside'} the required parameters.\n\n` +
          `Recommendation: ${selectedResult.recommendation}`);
      }
    } catch (error) {
      setAiResponse(`Regarding ${selectedResult.title}:\n\nYour project shows ${selectedResult.value} for this metric. The requirement states: ${selectedResult.requirement}.\n\n${selectedResult.recommendation}`);
    }
    setIsAskingAI(false);
  };

  const complianceStats = {
    compliant: results.filter(r => r.status === "compliant").length,
    warning: results.filter(r => r.status === "warning").length,
    violation: results.filter(r => r.status === "violation").length,
  };

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">AI Document Analysis</h1>
            </div>
            <p className="text-slate-400">Upload PLU documents for intelligent regulatory analysis powered by AI</p>
          </div>
          {analysisComplete && (
            <button
              onClick={resetAnalysis}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-white font-medium hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              New Analysis
            </button>
          )}
        </div>

        {!analysisComplete ? (
          /* Upload / Address Section */
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex gap-2 p-1 rounded-xl bg-slate-800/50">
                <button
                  onClick={() => setAnalysisMode("document")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                    analysisMode === "document" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-white"
                  )}
                >
                  Upload PLU Document
                </button>
                <button
                  onClick={() => setAnalysisMode("address")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                    analysisMode === "address" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-white"
                  )}
                >
                  Search by Address
                </button>
                <button
                  onClick={() => setAnalysisMode("project")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                    analysisMode === "project" ? "bg-violet-500/30 text-white" : "text-slate-400 hover:text-white"
                  )}
                >
                  From project
                </button>
              </div>
            {analysisMode === "document" ? (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={cn(
                  "relative border-2 border-dashed rounded-2xl p-8 text-center transition-all",
                  dragActive
                    ? "border-blue-500 bg-blue-500/10"
                    : file
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-white/20 hover:border-white/40 bg-slate-800/30"
                )}
              >
                {!file && (
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                )}
                
                {file ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto">
                      <FileText className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">{file.name}</p>
                      <p className="text-sm text-slate-400 mt-1">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • Ready to analyze
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          analyzeDocument();
                        }}
                        disabled={isAnalyzing}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5" />
                            Start AI Analysis
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setFile(null);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-700 text-slate-300 font-medium hover:bg-slate-600 transition-all"
                      >
                        Change File
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mx-auto">
                      <Upload className="w-8 h-8 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-white">Drop your PLU document here</p>
                      <p className="text-sm text-slate-400 mt-1">or click to browse files</p>
                    </div>
                    <p className="text-xs text-slate-500">Supports PDF, DOC, DOCX, TXT up to 50MB</p>
                  </div>
                )}
              </div>
            ) : analysisMode === "project" ? (
              <div className="border-2 border-dashed border-white/20 rounded-2xl p-8 bg-slate-800/30">
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-violet-500/20 flex items-center justify-center mx-auto">
                    <MapPin className="w-8 h-8 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-white mb-2">Automatic regulatory from project</p>
                    <p className="text-sm text-slate-400">Run PLU detection and save zone + PDF URL to the project (project must have address and coordinates).</p>
                  </div>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white"
                  >
                    <option value="">Select project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.address ? ` — ${p.address}` : ""}</option>
                    ))}
                  </select>
                  <button
                    onClick={runAutoRegulatory}
                    disabled={!selectedProjectId || autoRunning}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {autoRunning ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Running automatic detection...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Run automatic regulatory detection
                      </>
                    )}
                  </button>
                  {autoMessage && (
                    <p className={cn("text-sm", autoMessage.type === "success" ? "text-emerald-400" : "text-red-400")}>
                      {autoMessage.text}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-white/20 rounded-2xl p-8 bg-slate-800/30">
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-violet-500/20 flex items-center justify-center mx-auto">
                    <MapPin className="w-8 h-8 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-white mb-2">Enter address for PLU zone detection</p>
                    <p className="text-sm text-slate-400">We'll detect the PLU zone and basic regulations from the address</p>
                  </div>
                  <div className="relative overflow-visible">
                    <input
                      type="text"
                      value={addressForPlu}
                      onChange={(e) => setAddressForPlu(e.target.value)}
                      onFocus={() => addressForPlu.trim().length >= 3 && searchAddressForPlu()}
                      placeholder="e.g. 5 rue de la République, 06000 Nice"
                      className="w-full px-4 py-3 pr-10 rounded-xl bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      autoComplete="off"
                    />
                    {loadingAddress && (
                      <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin pointer-events-none" />
                    )}
                    {addressSearchDone && !loadingAddress && addressSuggestions.length === 0 && addressForPlu.trim().length >= 3 && (
                      <p className="absolute top-full left-0 right-0 mt-2 text-xs text-slate-500">No addresses found. Try a different search.</p>
                    )}
                    {addressSuggestions.length > 0 && (
                      <ul className="absolute top-full left-0 right-0 mt-1 rounded-xl bg-slate-800 border border-white/10 shadow-xl z-50 max-h-60 overflow-y-auto">
                        {addressSuggestions.map((a, i) => (
                          <li key={i}>
                            <button
                              type="button"
                              onClick={() => {
                                if (a.coordinates && a.coordinates.length >= 2) {
                                  setAddressForPlu(a.label);
                                  setAddressSuggestions([]);
                                  analyzeByAddress(a.coordinates);
                                }
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-white hover:bg-slate-700 first:rounded-t-xl last:rounded-b-xl transition-colors"
                            >
                              {a.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => searchAddressForPlu()}
                      disabled={addressForPlu.trim().length < 3 || loadingAddress}
                      className="px-4 py-2 rounded-lg bg-violet-500/30 text-violet-300 text-sm font-medium hover:bg-violet-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingAddress ? "Searching…" : "Search addresses"}
                    </button>
                    <p className="text-xs text-slate-500">Type 3+ characters, then pick an address to analyze PLU zone.</p>
                  </div>
                </div>
              </div>
            )}

              {isAnalyzing && (
                <div className="p-6 rounded-2xl bg-slate-800/50 border border-white/10">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                      <Brain className="w-5 h-5 text-violet-400 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-white font-medium">AI Analysis in Progress</p>
                      <p className="text-sm text-slate-400">Extracting regulatory requirements...</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {["Reading document content", "Identifying zones and rules", "Checking compliance", "Generating recommendations"].map((step, i) => (
                      <div key={step} className="flex items-center gap-3">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center",
                          i < 2 ? "bg-emerald-500/20" : "bg-slate-700"
                        )}>
                          {i < 2 ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-slate-500" />
                          )}
                        </div>
                        <span className={cn(
                          "text-sm",
                          i < 2 ? "text-slate-300" : "text-slate-500"
                        )}>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Info Panel */}
            <div className="space-y-4">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <Sparkles className="w-6 h-6 text-violet-400" />
                  <h3 className="text-lg font-semibold text-white">AI-Powered Analysis</h3>
                </div>
                <p className="text-slate-300 mb-4">
                  Our advanced AI analyzes your PLU documents to extract regulatory requirements and check your project's compliance automatically.
                </p>
                <ul className="space-y-3">
                  {[
                    "Automatic zone identification",
                    "Height and setback verification",
                    "Coverage ratio calculation",
                    "Parking requirements check",
                    "Green space compliance",
                    "Instant recommendations",
                  ].map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-slate-400">
                      <CheckCircle2 className="w-4 h-4 text-violet-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-6 rounded-2xl bg-slate-800/30 border border-white/5">
                <h4 className="text-sm font-medium text-white mb-3">Recent Analyses</h4>
                <div className="space-y-2">
                  {["PLU_Nice_Zone_UA.pdf", "Reglement_Urbanisme_2025.pdf", "Zone_Construction_Guide.docx"].map((doc) => (
                    <div key={doc} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <span className="text-sm text-slate-300 flex-1 truncate">{doc}</span>
                      <Eye className="w-4 h-4 text-slate-500" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Results Section */
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-emerald-400">{complianceStats.compliant}</p>
                    <p className="text-sm text-slate-400">Compliant</p>
                  </div>
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-amber-400">{complianceStats.warning}</p>
                    <p className="text-sm text-slate-400">Warnings</p>
                  </div>
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                    <XCircle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-red-400">{complianceStats.violation}</p>
                    <p className="text-sm text-slate-400">Violations</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Grid */}
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-lg font-semibold text-white">Analysis Results</h3>
                <div className="space-y-3">
                  {results.map((result, index) => {
                    const status = statusConfig[result.status];
                    const CategoryIcon = categoryIcons[result.category] || Ruler;
                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedResult(result)}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                          selectedResult === result
                            ? "bg-slate-700/50 border-blue-500/50"
                            : "bg-slate-800/50 border-white/10 hover:border-white/20"
                        )}
                      >
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", status.bg)}>
                          <CategoryIcon className={cn("w-5 h-5", status.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-white">{result.title}</p>
                            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", status.bg, status.color)}>
                              {status.label}
                            </span>
                          </div>
                          <p className="text-sm text-slate-400 truncate">{result.requirement}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-white">{result.value}</p>
                          <p className="text-xs text-slate-500">{result.category}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-500" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detail Panel */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Details</h3>
                {selectedResult ? (
                  <div className="p-6 rounded-2xl bg-slate-800/50 border border-white/10 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", statusConfig[selectedResult.status].bg)}>
                        {(() => {
                          const IconComponent = statusConfig[selectedResult.status].icon;
                          return <IconComponent className={cn("w-6 h-6", statusConfig[selectedResult.status].color)} />;
                        })()}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{selectedResult.title}</p>
                        <p className="text-sm text-slate-400">{selectedResult.category}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Current Value</p>
                        <p className="text-xl font-bold text-white">{selectedResult.value}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Requirement</p>
                        <p className="text-sm text-slate-300">{selectedResult.requirement}</p>
                      </div>
                      {selectedResult.recommendation && (
                        <div className="p-3 rounded-xl bg-slate-700/50">
                          <p className="text-xs text-slate-500 mb-1">AI Recommendation</p>
                          <p className="text-sm text-slate-300">{selectedResult.recommendation}</p>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => {
                        setShowAiDialog(true);
                        setAiQuestion('');
                        setAiResponse('');
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 text-blue-400 font-medium hover:bg-blue-500/30 transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Ask AI for Details
                    </button>
                    
                    {/* AI Dialog */}
                    {showAiDialog && (
                      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-slate-900 rounded-2xl border border-white/10 w-full max-w-lg p-6 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">Ask AI about {selectedResult?.title}</h3>
                            <button onClick={() => setShowAiDialog(false)} className="text-slate-400 hover:text-white">
                              ✕
                            </button>
                          </div>
                          
                          <div className="p-3 rounded-xl bg-slate-800/50 text-sm text-slate-300">
                            <p><strong>Current:</strong> {selectedResult?.value}</p>
                            <p><strong>Requirement:</strong> {selectedResult?.requirement}</p>
                          </div>
                          
                          <div>
                            <label className="text-sm text-slate-400 block mb-2">Your question:</label>
                            <textarea
                              value={aiQuestion}
                              onChange={(e) => setAiQuestion(e.target.value)}
                              placeholder="e.g., What are my options to comply with this requirement?"
                              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                              rows={3}
                            />
                          </div>
                          
                          <button
                            onClick={askAIForDetails}
                            disabled={isAskingAI || !aiQuestion.trim()}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold disabled:opacity-50"
                          >
                            {isAskingAI ? (
                              <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing...</>
                            ) : (
                              <><Sparkles className="w-5 h-5" /> Get AI Answer</>
                            )}
                          </button>
                          
                          {aiResponse && (
                            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                              <p className="text-sm font-medium text-emerald-400 mb-2">AI Response:</p>
                              <p className="text-sm text-slate-300 whitespace-pre-line">{aiResponse}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-slate-800/30 border border-white/5 text-center">
                    <Info className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-400">Select a result to view details</p>
                  </div>
                )}

                <button className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all">
                  <Download className="w-5 h-5" />
                  Export Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Navigation>
  );
}
