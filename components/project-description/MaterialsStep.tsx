"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Plus, Home, AlertTriangle } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────
interface RoofEntry { roofShape: string; mainMaterial: string; tint: string; soffitCladding: string; }
interface GutterEntry { material: string; tint: string; }
interface FacadeEntry { coating: string; finishing: string; tint: string; }
interface JoineryEntry { materials: string; shutters: string; }
export interface JobMaterials {
    roofs: RoofEntry[];
    gutters: GutterEntry[];
    facades: FacadeEntry[];
    joineries: JoineryEntry[];
    workDescription?: string;
    facadeModification?: boolean;
    linerColor?: string;
    copingStones?: string;
    shelterMaterials?: string;
    // Fence/gate specific
    fenceMaterial?: string;
    fenceColor?: string;
    gateMaterial?: string;
    gateColor?: string;
    // Exterior appearance modification specific
    exteriorElements?: string[]; // ["facades", "roofing", "joinery", "other"]
    otherModifications?: string;
    additionalDetails?: string;
}

interface Job {
    id: string;
    nature: "new_construction" | "existing_extension" | "outdoor";
    levels?: number;
    footprint: number;
    floorAreaEstimated: number;
    currentLivingArea?: number;
    workTypes?: string[];
    outdoorLayout?: "pool" | "fence_gate" | "other";
    poolSurfaceArea?: number;
    hasPoolEnclosure?: boolean;
    displayLabel?: string;
}

interface MaterialsStepProps {
    isEn: boolean;
    existingFacade: string;
    setExistingFacade: (v: string) => void;
    existingRoof: string;
    setExistingRoof: (v: string) => void;
    jobMaterials: Record<string, JobMaterials>;
    updateJobMat: (jobId: string, updater: (m: JobMaterials) => JobMaterials) => void;
    getJobMat: (jobId: string) => JobMaterials;
    setStep: (s: any) => void;
    jobs: Job[];
}

// ─── MaterialFormConfig ─────────────────────────────────────────────────
// Maps job nature (+ sub-type) to which material sections to show.
// This is the single source of truth for conditional rendering.
type MaterialSection = "roof" | "gutters" | "facades" | "joinery" | "pool" | "change_destination" | "fence_gate" | "change_exterior";

function getSectionsForJob(job: Job): MaterialSection[] {
    switch (job.nature) {
        case "new_construction":
            // Full building: Roof + Gutters + Facades + Joinery
            return ["roof", "gutters", "facades", "joinery"];

        case "existing_extension": {
            // Check sub-types
            const workTypes = job.workTypes || [];
            const isChangeDestination = workTypes.includes("change_destination");
            const isChangeExterior = workTypes.includes("change_exterior");
            const isExtension = workTypes.includes("extension");

            if (isChangeDestination && !isExtension && !isChangeExterior) {
                // Pure change of destination: only work description + facade toggle
                return ["change_destination"];
            }
            if (isChangeExterior && !isExtension && !isChangeDestination) {
                // Exterior appearance modification: interactive element picker
                return ["change_exterior"];
            }
            // Extension (attached) or mixed: full building
            return ["roof", "gutters", "facades", "joinery"];
        }

        case "outdoor": {
            if (job.outdoorLayout === "pool") {
                return ["pool"];
            }
            if (job.outdoorLayout === "fence_gate") {
                return ["fence_gate"];
            }
            // Generic outdoor (terrace, carport, etc.)
            return ["facades"];
        }

        default:
            return ["roof", "gutters", "facades", "joinery"];
    }
}

// ─── Chip selector ──────────────────────────────────────────────────────
function ChipRow({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
            {options.map(o => (
                <button key={o} type="button" onClick={() => onChange(value === o ? "" : o)}
                    className={cn(
                        "px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all",
                        value === o
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                    )}
                >{o}</button>
            ))}
        </div>
    );
}

// ─── Roof Section ───────────────────────────────────────────────────────
function RoofSection({ isEn, roofs, update }: { isEn: boolean; roofs: RoofEntry[]; update: (updater: (m: JobMaterials) => JobMaterials) => void }) {
    const set = (idx: number, field: keyof RoofEntry, val: string) => {
        update(m => { const r = [...m.roofs]; r[idx] = { ...r[idx], [field]: val }; return { ...m, roofs: r }; });
    };
    const add = () => update(m => ({ ...m, roofs: [...m.roofs, { roofShape: "", mainMaterial: "", tint: "", soffitCladding: "" }] }));

    return (
        <div className="space-y-3">
            <p className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">• {isEn ? "Roof(s)" : "Toiture(s)"}</p>
            {roofs.map((r, i) => (
                <div key={i} className="space-y-3 pl-3">
                    <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{isEn ? "ROOF SHAPE" : "FORME DE TOITURE"}</label>
                        <select value={r.roofShape} onChange={e => set(i, "roofShape", e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 text-sm bg-white">
                            <option value="">{isEn ? "Select..." : "Sélectionner..."}</option>
                            <option value="flat">{isEn ? "Flat roof / Terrace" : "Toiture plate / Terrasse"}</option>
                            <option value="dual_pitch">{isEn ? "Dual pitch" : "Deux pentes"}</option>
                            <option value="single_pitch">{isEn ? "Single pitch" : "Une pente"}</option>
                            <option value="hip">{isEn ? "Hip roof" : "Toiture à croupe"}</option>
                        </select>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">{isEn ? "COATING (COVERING)" : "REVÊTEMENT (COUVERTURE)"}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">{isEn ? "MAIN MATERIAL" : "MATÉRIAU PRINCIPAL"}</label>
                                <input type="text" value={r.mainMaterial} onChange={e => set(i, "mainMaterial", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Examples: Tiles, Zinc, Green roofs..." : "Ex: Tuiles, Zinc, Toiture végétale..."} />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">{isEn ? "TINT" : "TEINTE"}</label>
                                <input type="text" value={r.tint} onChange={e => set(i, "tint", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Examples: Aged red, Slate..." : "Ex: Rouge vieilli, Ardoise..."} />
                                <ChipRow options={isEn ? ["Aged Red", "Slate", "Natural", "Terracotta"] : ["Rouge vieilli", "Ardoise", "Naturel", "Terre cuite"]} value={r.tint} onChange={v => set(i, "tint", v)} />
                            </div>
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">{isEn ? "SOFFITS & ROOF OVERHANGS" : "SOUS-FACE & DÉBORDS DE TOITURE"}</p>
                        <label className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">{isEn ? "UNDERSIDE CLADDING" : "HABILLAGE SOUS-FACE"}</label>
                        <input type="text" value={r.soffitCladding} onChange={e => set(i, "soffitCladding", e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Material and color (e.g., White PVC, Stained Wood)" : "Matériau et couleur (ex: PVC blanc, Bois teinté)"} />
                        <ChipRow options={isEn ? ["White PVC", "Natural Wood", "Gray Aluminum", "Painted Paneling"] : ["PVC Blanc", "Bois Naturel", "Aluminium Gris", "Lambris Peint"]} value={r.soffitCladding} onChange={v => set(i, "soffitCladding", v)} />
                    </div>
                </div>
            ))}
            <button type="button" onClick={add} className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-1 ml-3">
                <Plus className="w-3.5 h-3.5" /> {isEn ? "Add another type of roofing" : "Ajouter un autre type de toiture"}
            </button>
        </div>
    );
}

// ─── Gutters Section ────────────────────────────────────────────────────
function GutterSection({ isEn, update, gutters }: { isEn: boolean; update: (updater: (m: JobMaterials) => JobMaterials) => void; gutters: GutterEntry[] }) {
    const set = (idx: number, field: keyof GutterEntry, val: string) => {
        update(m => { const g = [...m.gutters]; g[idx] = { ...g[idx], [field]: val }; return { ...m, gutters: g }; });
    };
    const add = () => update(m => ({ ...m, gutters: [...m.gutters, { material: "", tint: "" }] }));

    return (
        <div className="space-y-3">
            <p className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">• {isEn ? "Gutters and downspouts" : "Gouttières et descentes"}</p>
            {gutters.map((g, i) => (
                <div key={i} className="pl-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">{isEn ? "MATERIAL" : "MATÉRIAU"}</label>
                            <input type="text" value={g.material} onChange={e => set(i, "material", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Examples: Zinc, Aluminum..." : "Ex: Zinc, Aluminium..."} />
                            <ChipRow options={isEn ? ["Galvanized Steel", "Copper", "Aluminum", "Zinc", "PVC"] : ["Acier Galvanisé", "Cuivre", "Aluminium", "Zinc", "PVC"]} value={g.material} onChange={v => set(i, "material", v)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">{isEn ? "TINT" : "TEINTE"}</label>
                            <input type="text" value={g.tint} onChange={e => set(i, "tint", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Examples: Natural, White..." : "Ex: Naturel, Blanc..."} />
                            <ChipRow options={isEn ? ["Natural", "White", "Black", "Sand", "Anthracite Grey"] : ["Naturel", "Blanc", "Noir", "Sable", "Gris Anthracite"]} value={g.tint} onChange={v => set(i, "tint", v)} />
                        </div>
                    </div>
                </div>
            ))}
            <button type="button" onClick={add} className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-1 ml-3">
                <Plus className="w-3.5 h-3.5" /> {isEn ? "Add another type" : "Ajouter un autre type"}
            </button>
        </div>
    );
}

// ─── Facade Section ─────────────────────────────────────────────────────
function FacadeSection({ isEn, update, facades }: { isEn: boolean; update: (updater: (m: JobMaterials) => JobMaterials) => void; facades: FacadeEntry[] }) {
    const set = (idx: number, field: keyof FacadeEntry, val: string) => {
        update(m => { const f = [...m.facades]; f[idx] = { ...f[idx], [field]: val }; return { ...m, facades: f }; });
    };
    const add = () => update(m => ({ ...m, facades: [...m.facades, { coating: "", finishing: "", tint: "" }] }));

    return (
        <div className="space-y-3">
            <p className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">• {isEn ? "Facade(s)" : "Façade(s)"}</p>
            {facades.map((f, i) => (
                <div key={i} className="pl-3">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1.5">
                            <select value={f.coating} onChange={e => set(i, "coating", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                                <option value="">{isEn ? "Coating..." : "Enduit..."}</option>
                                <option value="plaster">{isEn ? "Plaster" : "Enduit"}</option>
                                <option value="wood_cladding">{isEn ? "Wood Cladding" : "Bardage bois"}</option>
                                <option value="metal_cladding">{isEn ? "Metal Cladding" : "Bardage métallique"}</option>
                                <option value="rock">{isEn ? "Rock" : "Pierre"}</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <input type="text" value={f.finishing} onChange={e => set(i, "finishing", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Finishing" : "Finition"} />
                            <ChipRow options={isEn ? ["Scratched", "Smooth", "Talasoché", "Openwork"] : ["Gratté", "Lisse", "Taloché", "Ajouré"]} value={f.finishing} onChange={v => set(i, "finishing", v)} />
                        </div>
                        <div className="space-y-1.5">
                            <input type="text" value={f.tint} onChange={e => set(i, "tint", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Tint" : "Teinte"} />
                            <ChipRow options={isEn ? ["Your Pierre", "Off-white", "Pearl Grey", "Ocher"] : ["Pierre de taille", "Blanc cassé", "Gris Perle", "Ocre"]} value={f.tint} onChange={v => set(i, "tint", v)} />
                        </div>
                    </div>
                </div>
            ))}
            <button type="button" onClick={add} className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-1 ml-3">
                <Plus className="w-3.5 h-3.5" /> {isEn ? "Add another type of facade" : "Ajouter un autre type de façade"}
            </button>
        </div>
    );
}

// ─── Joinery Section ────────────────────────────────────────────────────
function JoinerySection({ isEn, update, joineries }: { isEn: boolean; update: (updater: (m: JobMaterials) => JobMaterials) => void; joineries: JoineryEntry[] }) {
    const set = (idx: number, field: keyof JoineryEntry, val: string) => {
        update(m => { const j = [...m.joineries]; j[idx] = { ...j[idx], [field]: val }; return { ...m, joineries: j }; });
    };
    const add = () => update(m => ({ ...m, joineries: [...m.joineries, { materials: "", shutters: "" }] }));

    return (
        <div className="space-y-3">
            <p className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">• {isEn ? "Joinery & Blinds" : "Menuiseries & Volets"}</p>
            {joineries.map((j, i) => (
                <div key={i} className="pl-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <input type="text" value={j.materials} onChange={e => set(i, "materials", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Joinery Materials" : "Matériaux menuiseries"} />
                            <ChipRow options={isEn ? ["Aluminum Grey 7016", "White PVC", "Exotic Wood", "Black Steel"] : ["Aluminium Gris 7016", "PVC Blanc", "Bois Exotique", "Acier Noir"]} value={j.materials} onChange={v => set(i, "materials", v)} />
                        </div>
                        <div className="space-y-1.5">
                            <input type="text" value={j.shutters} onChange={e => set(i, "shutters", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Shutters / Blinds" : "Volets / Stores"} />
                            <ChipRow options={isEn ? ["Integrated roller (invisible)", "Wooden Swing", "BSO (Sunshade)"] : ["Volet roulant intégré (invisible)", "Battant Bois", "BSO (Brise-soleil)"]} value={j.shutters} onChange={v => set(i, "shutters", v)} />
                        </div>
                    </div>
                </div>
            ))}
            <button type="button" onClick={add} className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-1 ml-3">
                <Plus className="w-3.5 h-3.5" /> {isEn ? "Add another type of joinery" : "Ajouter un autre type de menuiserie"}
            </button>
        </div>
    );
}

// ─── Pool Section ───────────────────────────────────────────────────────
function PoolSection({ isEn, mat, update }: { isEn: boolean; mat: JobMaterials; update: (updater: (m: JobMaterials) => JobMaterials) => void }) {
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">{isEn ? "Liner Color / Coating" : "Couleur Liner / Revêtement"}</label>
                    <input type="text" value={mat.linerColor || ""} onChange={e => update(m => ({ ...m, linerColor: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                        placeholder={isEn ? "Example: Azure blue" : "Ex: Bleu azur"} />
                    <ChipRow options={isEn ? ["Azure Blue", "Sand", "Light Grey", "Emerald Green"] : ["Bleu Azur", "Sable", "Gris Clair", "Vert Émeraude"]} value={mat.linerColor || ""} onChange={v => update(m => ({ ...m, linerColor: v }))} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">{isEn ? "Coping stones / Beaches" : "Margelles / Plages"}</label>
                    <input type="text" value={mat.copingStones || ""} onChange={e => update(m => ({ ...m, copingStones: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                        placeholder={isEn ? "Example: Stone slabs" : "Ex: Dalles en pierre"} />
                    <ChipRow options={isEn ? ["Natural Stone", "Wood Decking", "Porcelain Tiles", "Concrete"] : ["Pierre Naturelle", "Platelage Bois", "Carrelage Grès", "Béton"]} value={mat.copingStones || ""} onChange={v => update(m => ({ ...m, copingStones: v }))} />
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">{isEn ? "Shelter Materials" : "Matériaux de l'abri"}</label>
                <input type="text" value={mat.shelterMaterials || ""} onChange={e => update(m => ({ ...m, shelterMaterials: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    placeholder={isEn ? "Example: Powder-coated aluminum, polycarbonate glazing" : "Ex: Aluminium thermolaqué, vitrage polycarbonate"} />
            </div>
        </div>
    );
}

// ─── Change of Destination Section ──────────────────────────────────────
function ChangeDestinationSection({ isEn, mat, update }: { isEn: boolean; mat: JobMaterials; update: (updater: (m: JobMaterials) => JobMaterials) => void }) {
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    {isEn ? "DESCRIBE THE PLANNED WORK IN DETAIL." : "DÉCRIRE LES TRAVAUX PRÉVUS EN DÉTAIL."}
                </p>
                <textarea
                    value={mat.workDescription || ""}
                    onChange={e => update(m => ({ ...m, workDescription: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm min-h-[80px] resize-y"
                    placeholder={isEn ? "Examples: Replacing wooden windows with PVC, repainting the facade in a stone color..." : "Ex: Remplacement des fenêtres bois par du PVC, repeinture de la façade en couleur pierre..."}
                />
            </div>
            <div className="space-y-2">
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                    {isEn ? "ASSOCIATED FACADE MODIFICATION?" : "MODIFICATION DE FAÇADE ASSOCIÉE ?"}
                </p>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={mat.facadeModification || false}
                        onChange={e => update(m => ({ ...m, facadeModification: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-700">
                        {isEn ? "Yes, the facades have been modified." : "Oui, les façades ont été modifiées."}
                    </span>
                </label>
            </div>
        </div>
    );
}

// ─── Fence/Gate Section ─────────────────────────────────────────────────
function FenceGateSection({ isEn, mat, update }: { isEn: boolean; mat: JobMaterials; update: (updater: (m: JobMaterials) => JobMaterials) => void }) {
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">{isEn ? "Fence/Wall Material" : "Matériau Clôture/Mur"}</label>
                    <input type="text" value={mat.fenceMaterial || ""} onChange={e => update(m => ({ ...m, fenceMaterial: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                        placeholder={isEn ? "Examples: Rigid wire mesh, plastered wall..." : "Ex: Grillage rigide, mur enduit..."} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600">{isEn ? "Color" : "Couleur"}</label>
                    <input type="text" value={mat.fenceColor || ""} onChange={e => update(m => ({ ...m, fenceColor: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                        placeholder={isEn ? "Examples: Green, White..." : "Ex: Vert, Blanc..."} />
                </div>
            </div>
        </div>
    );
}

// ─── Exterior Appearance Modification Card ──────────────────────────────
// This is a special card type with interactive element toggles.
// The user picks which parts of the building are being modified,
// and only those sections expand below.
type ExteriorElement = "facades" | "roofing" | "joinery" | "other";

const EXTERIOR_ELEMENTS: { key: ExteriorElement; labelEn: string; labelFr: string; icon: string }[] = [
    { key: "facades", labelEn: "Facades", labelFr: "Façades", icon: "🏠" },
    { key: "roofing", labelEn: "Roofing", labelFr: "Toiture", icon: "⛺" },
    { key: "joinery", labelEn: "Joinery", labelFr: "Menuiseries", icon: "🔲" },
    { key: "other", labelEn: "Other", labelFr: "Autre", icon: "+" },
];

function ExteriorModificationCard({ isEn, mat, update }: {
    isEn: boolean; mat: JobMaterials;
    update: (updater: (m: JobMaterials) => JobMaterials) => void;
}) {
    const selected = mat.exteriorElements || [];

    const toggleElement = (el: ExteriorElement) => {
        update(m => {
            const current = m.exteriorElements || [];
            const next = current.includes(el)
                ? current.filter(e => e !== el)
                : [...current, el];
            return { ...m, exteriorElements: next };
        });
    };

    return (
        <div className="space-y-5">
            {/* Element question */}
            <div>
                <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                    {isEn ? "WHICH ELEMENTS OF THE CONSTRUCTION ARE BEING MODIFIED?" : "QUELS ÉLÉMENTS DE LA CONSTRUCTION SONT MODIFIÉS ?"}
                </p>
                <p className="text-[11px] text-slate-400 mb-3">
                    {isEn ? "Select all the parts involved in your work." : "Sélectionnez toutes les parties concernées par vos travaux."}
                </p>
                <div className="grid grid-cols-4 gap-2">
                    {EXTERIOR_ELEMENTS.map(el => {
                        const isActive = selected.includes(el.key);
                        return (
                            <button
                                key={el.key}
                                type="button"
                                onClick={() => toggleElement(el.key)}
                                className={cn(
                                    "relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all text-center",
                                    isActive
                                        ? "border-indigo-500 bg-indigo-50/60 text-indigo-700"
                                        : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-500"
                                )}
                            >
                                {isActive && (
                                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-indigo-600 border-2 border-white" />
                                )}
                                <span className="text-xl">{el.icon}</span>
                                <span className="text-[11px] font-semibold">{isEn ? el.labelEn : el.labelFr}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Conditionally rendered sections based on selected elements */}
            {selected.includes("facades") && (
                <>
                    <div className="border-t border-slate-100" />
                    <FacadeSection isEn={isEn} facades={mat.facades} update={update} />
                </>
            )}

            {selected.includes("roofing") && (
                <>
                    <div className="border-t border-slate-100" />
                    <RoofSection isEn={isEn} roofs={mat.roofs} update={update} />
                    <div className="border-t border-slate-100" />
                    <GutterSection isEn={isEn} gutters={mat.gutters} update={update} />
                </>
            )}

            {selected.includes("joinery") && (
                <>
                    <div className="border-t border-slate-100" />
                    <JoinerySection isEn={isEn} joineries={mat.joineries} update={update} />
                </>
            )}

            {selected.includes("other") && (
                <>
                    <div className="border-t border-slate-100" />
                    <div className="space-y-2">
                        <p className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">• {isEn ? "Other modifications" : "Autres modifications"}</p>
                        <textarea
                            value={mat.otherModifications || ""}
                            onChange={e => update(m => ({ ...m, otherModifications: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm min-h-[60px] resize-y"
                            placeholder={isEn ? "Describe the other elements (e.g., heat pump installation, air conditioning unit...)" : "Décrivez les autres éléments (ex: installation pompe à chaleur, climatisation...)"}
                        />
                    </div>
                </>
            )}

            {/* Additional details — always visible */}
            <div className="border-t border-slate-100" />
            <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {isEn ? "ADDITIONAL DETAILS (OPTIONAL)" : "DÉTAILS COMPLÉMENTAIRES (OPTIONNEL)"}
                </p>
                <textarea
                    value={mat.additionalDetails || ""}
                    onChange={e => update(m => ({ ...m, additionalDetails: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm min-h-[60px] resize-y"
                    placeholder={isEn ? "Add any useful details for the instructor here..." : "Ajoutez ici tout détail utile pour l'instructeur..."}
                />
            </div>
        </div>
    );
}

// ─── Job Label Helper ───────────────────────────────────────────────────
function getJobLabel(job: Job, isEn: boolean): string {
    if (job.displayLabel) return job.displayLabel;
    switch (job.nature) {
        case "new_construction": return isEn ? "New Independent Construction" : "Construction Indépendante Neuve";
        case "existing_extension": {
            const wt = job.workTypes || [];
            if (wt.includes("change_destination")) return isEn ? "Change of Destination" : "Changement de Destination";
            if (wt.includes("change_exterior")) return isEn ? "Exterior Appearance Modification" : "Modification de l'Aspect Extérieur";
            return isEn ? "Extension (Attached)" : "Extension (Attenante)";
        }
        case "outdoor":
            if (job.outdoorLayout === "pool") return isEn ? "Pool" : "Piscine";
            if (job.outdoorLayout === "fence_gate") return isEn ? "Fence / Gate" : "Clôture / Portail";
            return isEn ? "Outdoor Layout" : "Aménagement Extérieur";
        default: return isEn ? "Work" : "Travaux";
    }
}

function getJobArea(job: Job): string {
    if (job.nature === "outdoor" && job.outdoorLayout === "pool" && job.poolSurfaceArea) return `${job.poolSurfaceArea}m²`;
    if (job.floorAreaEstimated > 0) return `${job.floorAreaEstimated}m²`;
    if (job.footprint > 0) return `${job.footprint}m²`;
    return "";
}

// ─── Dynamic Job Material Card ──────────────────────────────────────────
function JobMaterialCard({ isEn, job, number, mat, update }: {
    isEn: boolean; job: Job; number: number;
    mat: JobMaterials; update: (updater: (m: JobMaterials) => JobMaterials) => void;
}) {
    const sections = getSectionsForJob(job);
    const label = getJobLabel(job, isEn);
    const area = getJobArea(job);

    // Border color varies by job type for visual differentiation
    const borderColor = job.nature === "outdoor"
        ? "border-l-emerald-500"
        : job.nature === "existing_extension"
            ? "border-l-amber-500"
            : "border-l-indigo-500";

    const badgeColor = job.nature === "outdoor"
        ? "bg-emerald-600"
        : job.nature === "existing_extension"
            ? "bg-amber-600"
            : "bg-indigo-600";

    return (
        <div className={cn("rounded-xl border-l-[3px] border border-slate-200 overflow-hidden bg-white", borderColor)}>
            {/* Card Header */}
            <div className="px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className={cn("w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center", badgeColor)}>{number}</span>
                    <p className="text-sm font-bold text-slate-800">{label}</p>
                </div>
                {area && <span className="text-xs text-slate-400">{area}</span>}
            </div>

            {/* Dynamic Sections */}
            <div className="px-5 pb-5 space-y-5">
                {sections.map((section, idx) => (
                    <React.Fragment key={section}>
                        {idx > 0 && <div className="border-t border-slate-100" />}
                        {section === "roof" && <RoofSection isEn={isEn} roofs={mat.roofs} update={update} />}
                        {section === "gutters" && <GutterSection isEn={isEn} gutters={mat.gutters} update={update} />}
                        {section === "facades" && <FacadeSection isEn={isEn} facades={mat.facades} update={update} />}
                        {section === "joinery" && <JoinerySection isEn={isEn} joineries={mat.joineries} update={update} />}
                        {section === "pool" && <PoolSection isEn={isEn} mat={mat} update={update} />}
                        {section === "change_destination" && <ChangeDestinationSection isEn={isEn} mat={mat} update={update} />}
                        {section === "fence_gate" && <FenceGateSection isEn={isEn} mat={mat} update={update} />}
                        {section === "change_exterior" && <ExteriorModificationCard isEn={isEn} mat={mat} update={update} />}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function MaterialsStep({
    isEn, existingFacade, setExistingFacade, existingRoof, setExistingRoof,
    jobMaterials, updateJobMat, getJobMat, setStep, jobs,
}: MaterialsStepProps) {
    // Check if any job involves work on an existing building
    const hasExistingBuildingWork = jobs.some(j =>
        j.nature === "existing_extension" || j.nature === "new_construction"
    );

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
                {isEn ? "Project description" : "Description du projet"}
            </h2>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 flex-wrap">
                {[
                    { label: isEn ? "1. Environment" : "1. Environnement", active: false },
                    { label: isEn ? "2. Works" : "2. Travaux", active: false },
                    { label: isEn ? "3. Materials" : "3. Matériaux", active: true },
                    { label: isEn ? "4. Applicant" : "4. Demandeur", active: false },
                ].map((tab, i) => (
                    <React.Fragment key={tab.label}>
                        <span className={cn("px-3 py-1.5 rounded-full text-xs font-semibold", tab.active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500")}>
                            {tab.label}
                        </span>
                        {i < 3 && <div className="w-6 h-px bg-slate-300" />}
                    </React.Fragment>
                ))}
            </div>

            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                    {isEn ? "3. Details of the work and materials" : "3. Détail des ouvrages et matériaux"}
                </h3>
                <button type="button" onClick={() => setStep(2)} className="text-sm text-indigo-600 font-medium hover:text-indigo-700 flex items-center gap-1">
                    {isEn ? "Edit the work" : "Modifier les travaux"}
                </button>
            </div>
            <p className="text-sm text-indigo-600 -mt-2">
                {isEn
                    ? "Specify the materials and colors for each visible element. This information is mandatory and is included "
                    : "Précisez les matériaux et coloris de chaque élément visible. Cette information est obligatoire et figure "}
                <span className="underline">
                    {isEn ? "in the descriptive notice." : "dans la notice descriptive."}
                </span>
            </p>

            {/* ── Empty State ── */}
            {jobs.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-6 text-center space-y-3">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                    <p className="text-sm font-semibold text-slate-700">
                        {isEn ? "No work defined yet" : "Aucun travail défini"}
                    </p>
                    <p className="text-xs text-slate-500">
                        {isEn
                            ? "Go back to Step 2 to add the jobs for your project. Each job will generate its own material description card here."
                            : "Retournez à l'étape 2 pour ajouter les travaux de votre projet. Chaque travail génèrera sa propre fiche de matériaux ici."}
                    </p>
                    <button type="button" onClick={() => setStep(2)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-all">
                        {isEn ? "← Go to Step 2: Works" : "← Aller à l'étape 2 : Travaux"}
                    </button>
                </div>
            )}

            {/* ── Existing Building (Context) — only if relevant ── */}
            {hasExistingBuildingWork && jobs.length > 0 && (
                <div className="rounded-xl border-2 border-dashed border-indigo-200 p-5 space-y-3 bg-indigo-50/30">
                    <div className="flex items-center gap-2">
                        <Home className="w-4 h-4 text-slate-500" />
                        <p className="text-sm font-bold text-slate-800">
                            {isEn ? "Existing Building (Context)" : "Bâtiment Existant (Contexte)"}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">{isEn ? "Current facade" : "Façade actuelle"}</label>
                            <input type="text" value={existingFacade} onChange={e => setExistingFacade(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
                                placeholder={isEn ? "Example: Beige scraped plaster" : "Ex: Enduit gratté beige"} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">{isEn ? "Current roof" : "Toiture actuelle"}</label>
                            <input type="text" value={existingRoof} onChange={e => setExistingRoof(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-amber-300 text-sm bg-amber-50/50"
                                placeholder={isEn ? "Example: Red mechanical roof tiles" : "Ex: Tuiles mécaniques rouges"} />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Dynamic Job Material Cards ── */}
            {jobs.map((job, index) => (
                <JobMaterialCard
                    key={job.id}
                    isEn={isEn}
                    job={job}
                    number={index + 1}
                    mat={getJobMat(job.id)}
                    update={(updater) => updateJobMat(job.id, updater)}
                />
            ))}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
                <button type="button" onClick={() => setStep(2)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium">
                    {isEn ? "← Back" : "← Retour"}
                </button>
                <button type="button" onClick={() => setStep(4)} className="flex items-center gap-2 px-8 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all shadow-sm">
                    {isEn ? "Next: Applicant →" : "Suivant : Demandeur →"}
                </button>
            </div>
        </div>
    );
}
