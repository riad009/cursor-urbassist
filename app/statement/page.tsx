"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Navigation from "@/components/layout/Navigation";
import Link from "next/link";
import {
  FileText,
  Loader2,
  Check,
  ChevronRight,
  ChevronDown,
  Download,
  RefreshCw,
  Sparkles,
  ClipboardList,
  Save,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface Project {
  id: string;
  name: string;
  address?: string;
  municipality?: string;
}

const QUESTIONS = [
  {
    id: "projectType",
    section: "Project Description",
    question: "What type of project is this?",
    type: "select",
    options: [
      "Construction neuve (New construction)",
      "Extension de bâtiment existant (Extension)",
      "Rénovation avec modification extérieure (Renovation)",
      "Aménagement extérieur (Exterior works)",
      "Changement de destination (Change of use)",
      "Surélévation (Raising existing building)",
    ],
  },
  {
    id: "currentState",
    section: "Current State",
    question: "Describe the current state of the terrain and existing constructions:",
    type: "textarea",
    placeholder:
      "e.g., Flat terrain, currently undeveloped with grass and a few trees. No existing structures. The parcel is bordered by residential properties on three sides and a municipal road on the south.",
  },
  {
    id: "proposedConstruction",
    section: "Proposed Project",
    question: "Describe the proposed construction in detail:",
    type: "textarea",
    placeholder:
      "e.g., Single-family dwelling of 120m² on two levels (ground floor + first floor) with an attached garage of 20m². The building will have a traditional gable roof.",
  },
  {
    id: "facadeMaterials",
    section: "Exterior Materials",
    question: "What materials will be used for facades?",
    type: "textarea",
    placeholder:
      "e.g., Smooth rendered finish in off-white (RAL 9010), with natural stone cladding on the ground floor front facade.",
  },
  {
    id: "roofType",
    section: "Exterior Materials",
    question: "What type of roof?",
    type: "select",
    options: [
      "Toit à deux pentes (Gable roof)",
      "Toit à quatre pentes (Hip roof)",
      "Toit plat (Flat roof)",
      "Toit monopente (Mono-pitch)",
      "Toit en L",
      "Combinaison (Combination)",
    ],
  },
  {
    id: "roofMaterials",
    section: "Exterior Materials",
    question: "What roofing materials?",
    type: "text",
    placeholder: "e.g., Clay tiles (tuiles terre cuite) in natural red",
  },
  {
    id: "exteriorFinishes",
    section: "Exterior Materials",
    question: "Describe windows, doors and other exterior elements:",
    type: "textarea",
    placeholder:
      "e.g., Aluminum window frames in anthracite grey (RAL 7016), French windows on ground floor south facade, solid oak front door.",
  },
  {
    id: "fencing",
    section: "Exterior Works",
    question: "Describe proposed fencing and boundaries:",
    type: "textarea",
    placeholder:
      "e.g., Low stone wall (0.80m) with wrought iron railings (total height 1.60m) along the street frontage. Wooden fence (1.80m) on side and rear boundaries.",
  },
  {
    id: "landscaping",
    section: "Exterior Works",
    question: "Describe planned landscaping and outdoor spaces:",
    type: "textarea",
    placeholder:
      "e.g., Front garden with lawn and native shrubs. Rear terrace in natural stone (30m²). Two olive trees to be planted. Existing mature oak to be preserved.",
  },
  {
    id: "accessParking",
    section: "Access & Parking",
    question: "Describe access arrangements and parking:",
    type: "textarea",
    placeholder:
      "e.g., Vehicle access from Rue de la Paix via 3.5m wide driveway. Pedestrian access via garden path.",
  },
  {
    id: "parkingExisting",
    section: "Access & Parking",
    question: "Number of existing parking spaces:",
    type: "number",
    placeholder: "0",
  },
  {
    id: "parkingNew",
    section: "Access & Parking",
    question: "Number of new parking spaces to be created:",
    type: "number",
    placeholder: "2",
  },
  {
    id: "utilities",
    section: "Utilities",
    question: "Describe utility connections (VRD):",
    type: "textarea",
    placeholder:
      "e.g., Connection to public water, sewer, electricity, and telecoms networks along the street. Gas connection not planned. Individual wastewater treatment not required.",
  },
  {
    id: "stormwater",
    section: "Utilities",
    question: "How will stormwater be managed?",
    type: "textarea",
    placeholder:
      "e.g., Rainwater harvesting tank (5000L) for garden irrigation. Remaining stormwater directed to soakaway pit. Green roof on garage to reduce runoff.",
  },
  {
    id: "energyPerformance",
    section: "Energy & Environment",
    question: "Describe energy performance measures:",
    type: "textarea",
    placeholder:
      "e.g., RE2020 compliant. Triple glazing, external insulation (200mm mineral wool). Air-source heat pump. Solar PV panels (3kWp) on south-facing roof. VMC double-flux ventilation.",
  },
  {
    id: "additionalDetails",
    section: "Additional",
    question: "Any additional information for the descriptive statement:",
    type: "textarea",
    placeholder:
      "e.g., The project is designed to integrate harmoniously with the existing residential neighborhood...",
  },
];

function StatementPageContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const fromPayment = searchParams.get("from") === "payment";
  const projectParam = searchParams.get("project");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["Project Description"])
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [sections, setSections] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [statementStatus, setStatementStatus] = useState<"none" | "draft" | "confirmed">("none");
  const [isConfirming, setIsConfirming] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (projectParam && projects.length > 0 && !selectedProject) {
      const exists = projects.some((p) => p.id === projectParam);
      if (exists) setSelectedProject(projectParam);
    }
  }, [projectParam, projects, selectedProject]);

  // Load existing statement if any
  useEffect(() => {
    if (!selectedProject) return;
    fetch(`/api/descriptive-statement?projectId=${selectedProject}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.statement) {
          setGeneratedText(data.statement.generatedText || "");
          setSections(data.statement.sections || {});
          setStatementStatus(data.statement.status === "confirmed" ? "confirmed" : data.statement.status === "draft" ? "draft" : "none");
        } else {
          setGeneratedText("");
          setSections({});
          setStatementStatus("none");
        }
      })
      .catch(() => {});
  }, [selectedProject]);

  const toggleSection = (section: string) => {
    const newSections = new Set(expandedSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setExpandedSections(newSections);
  };

  const handleGenerate = async () => {
    if (!selectedProject) return;
    setIsGenerating(true);

    try {
      const res = await fetch("/api/descriptive-statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          answers,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setGeneratedText(data.statement.text);
        setSections(data.statement.sections || {});
        setStatementStatus("draft");
      }
    } catch (error) {
      console.error("Generation error:", error);
    }

    setIsGenerating(false);
  };

  const handleConfirm = async () => {
    if (!selectedProject) return;
    setIsConfirming(true);

    try {
      const res = await fetch("/api/descriptive-statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          answers,
          action: "confirm",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatementStatus("confirmed");
        setShowConfirmDialog(false);
      } else {
        alert(data.error || "Failed to confirm statement.");
      }
    } catch (error) {
      console.error("Confirm error:", error);
      alert("Failed to confirm statement.");
    }

    setIsConfirming(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPDF = async () => {
    if (!selectedProject) return;

    try {
      const res = await fetch("/api/documents/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProject,
          documentType: "DESCRIPTIVE_STATEMENT",
        }),
      });

      const data = await res.json();
      if (data.success && data.document.fileData) {
        // Download PDF
        const byteCharacters = atob(data.document.fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `notice_descriptive_${selectedProject}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Export error:", error);
    }
  };

  const questionSections = QUESTIONS.reduce(
    (acc, q) => {
      if (!acc[q.section]) acc[q.section] = [];
      acc[q.section].push(q);
      return acc;
    },
    {} as Record<string, typeof QUESTIONS>
  );

  const answeredCount = Object.values(answers).filter((v) => v.trim()).length;
  const progress = Math.round((answeredCount / QUESTIONS.length) * 100);

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {fromPayment && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-medium text-emerald-700">Payment complete</p>
              <p className="text-sm text-slate-400">Complete your descriptive statement to finalize your dossier.</p>
            </div>
            <Link
              href={projectParam ? `/projects/${projectParam}` : "/projects"}
              className="ml-auto text-sm text-emerald-600 hover:text-emerald-700"
            >
              Back to project
            </Link>
          </div>
        )}
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <ClipboardList className="w-5 h-5 text-slate-900" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                Descriptive Statement
              </h1>
            </div>
            <p className="text-slate-400">
              Generate the regulatory notice descriptive for your permit
              application
            </p>
          </div>
          {generatedText && (
            <div className="flex gap-3">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 font-medium hover:bg-slate-100 transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copied ? "Copied!" : "Copy Text"}
              </button>
              {statementStatus === "draft" && (
                <button
                  onClick={() => setShowConfirmDialog(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-white font-semibold hover:shadow-lg transition-all"
                >
                  <Check className="w-5 h-5" />
                  Confirm & Finalize (2 credits)
                </button>
              )}
              {statementStatus === "confirmed" && (
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-semibold hover:shadow-lg transition-all"
                >
                  <Download className="w-5 h-5" />
                  Export PDF
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Questionnaire */}
          <div className="lg:col-span-2 space-y-4">
            {/* Project Selection */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200">
              <label className="text-sm font-medium text-slate-900 block mb-2">
                Select Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">Choose a project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {p.address || "No address"}
                  </option>
                ))}
              </select>
            </div>

            {/* Progress */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">
                  {answeredCount} of {QUESTIONS.length} questions answered
                </span>
                <span className="text-sm font-medium text-slate-900">
                  {progress}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Questions by Section */}
            {Object.entries(questionSections).map(
              ([sectionName, sectionQuestions]) => (
                <div
                  key={sectionName}
                  className="rounded-2xl bg-white border border-slate-200 overflow-hidden"
                >
                  <button
                    onClick={() => toggleSection(sectionName)}
                    className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                  >
                    <h3 className="text-sm font-semibold text-slate-900">
                      {sectionName}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {
                          sectionQuestions.filter((q) =>
                            answers[q.id]?.trim()
                          ).length
                        }
                        /{sectionQuestions.length}
                      </span>
                      {expandedSections.has(sectionName) ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {expandedSections.has(sectionName) && (
                    <div className="p-4 pt-0 space-y-4">
                      {sectionQuestions.map((q) => (
                        <div key={q.id}>
                          <label className="text-sm text-slate-600 block mb-2">
                            {q.question}
                          </label>
                          {q.type === "select" ? (
                            <select
                              value={answers[q.id] || ""}
                              onChange={(e) =>
                                setAnswers({
                                  ...answers,
                                  [q.id]: e.target.value,
                                })
                              }
                              className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                            >
                              <option value="">Select...</option>
                              {q.options?.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : q.type === "number" ? (
                            <input
                              type="number"
                              min={0}
                              value={answers[q.id] ?? ""}
                              onChange={(e) =>
                                setAnswers({
                                  ...answers,
                                  [q.id]: e.target.value,
                                })
                              }
                              placeholder={q.placeholder}
                              className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
                            />
                          ) : q.type === "textarea" ? (
                            <textarea
                              value={answers[q.id] || ""}
                              onChange={(e) =>
                                setAnswers({
                                  ...answers,
                                  [q.id]: e.target.value,
                                })
                              }
                              placeholder={q.placeholder}
                              rows={3}
                              className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                            />
                          ) : (
                            <input
                              type="text"
                              value={answers[q.id] || ""}
                              onChange={(e) =>
                                setAnswers({
                                  ...answers,
                                  [q.id]: e.target.value,
                                })
                              }
                              placeholder={q.placeholder}
                              className="w-full px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!selectedProject || isGenerating || answeredCount < 3}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-slate-900 font-semibold hover:shadow-lg hover:shadow-indigo-500/25 transition-all disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Draft...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  {statementStatus === "confirmed" ? "Regenerate Draft" : "Generate Draft (Free)"}
                </>
              )}
            </button>
          </div>

          {/* Right: Preview */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Generated Statement
                {statementStatus === "draft" && (
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold uppercase">Draft</span>
                )}
                {statementStatus === "confirmed" && (
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold uppercase">Confirmed</span>
                )}
              </h3>
              {generatedText ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
                    {generatedText}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">
                    Answer the questions and click Generate to create your
                    descriptive statement.
                  </p>
                </div>
              )}

              {/* Confirm Dialog */}
              {showConfirmDialog && statementStatus === "draft" && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <h4 className="text-sm font-semibold text-amber-800 mb-2">Confirm Statement?</h4>
                  <p className="text-xs text-amber-700 mb-3">
                    This will deduct <strong>2 credits</strong> from your account and finalize the descriptive statement. You can regenerate later but it will cost additional credits.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirm}
                      disabled={isConfirming}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50"
                    >
                      {isConfirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {isConfirming ? "Confirming..." : "Confirm (2 credits)"}
                    </button>
                    <button
                      onClick={() => setShowConfirmDialog(false)}
                      className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Credits Info */}
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-600">
                    Credits Required
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Generating a draft is free. Confirming the statement costs 2 credits. You have{" "}
                    <span className="text-slate-900 font-medium">
                      {user?.credits || 0}
                    </span>{" "}
                    credits.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Flow: Generate Draft → Review → Confirm (2 credits)
                  </p>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="p-4 rounded-2xl bg-slate-100/30 border border-slate-100">
              <h4 className="text-sm font-medium text-slate-900 mb-2">
                What is a Notice Descriptive?
              </h4>
              <p className="text-xs text-slate-400">
                The descriptive statement (notice descriptive) is a mandatory
                document for building permits and prior declarations in France.
                It describes the project, materials, and how it integrates into
                its environment.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Navigation>
  );
}

export default function StatementPage() {
  return (
    <Suspense fallback={<Navigation><div className="p-6 flex justify-center min-h-[40vh]"><Loader2 className="w-8 h-8 text-indigo-400 animate-spin" /></div></Navigation>}>
      <StatementPageContent />
    </Suspense>
  );
}
