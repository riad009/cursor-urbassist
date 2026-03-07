"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ArrowRight, Plus, Home, Pencil } from "lucide-react";

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
    jobs: any[];
}

// Fixed section keys
const SECTION_KEYS = ["new_construction", "extension", "change_destination", "pool"] as const;

function defaultJobMaterials(): JobMaterials {
    return {
        roofs: [{ roofShape: "", mainMaterial: "", tint: "", soffitCladding: "" }],
        gutters: [{ material: "", tint: "" }],
        facades: [{ coating: "", finishing: "", tint: "" }],
        joineries: [{ materials: "", shutters: "" }],
    };
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
function RoofSection({ isEn, sectionKey, roofs, update }: { isEn: boolean; sectionKey: string; roofs: RoofEntry[]; update: (updater: (m: JobMaterials) => JobMaterials) => void }) {
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
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{isEn ? "ROOF SHAPE" : "FORME DE TOITURE"}</label>
                        <select value={r.roofShape} onChange={e => set(i, "roofShape", e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 text-sm bg-white">
                            <option value="">{isEn ? "Select..." : "Sélectionner..."}</option>
                            <option value="flat">{isEn ? "Flat roof / Terrace" : "Toiture plate / Terrasse"}</option>
                            <option value="dual_pitch">{isEn ? "Dual pitch" : "Deux pentes"}</option>
                            <option value="single_pitch">{isEn ? "Single pitch" : "Une pente"}</option>
                            <option value="hip">{isEn ? "Hip roof" : "Toiture à croupe"}</option>
                        </select>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{isEn ? "COATING (COVERING)" : "REVÊTEMENT (COUVERTURE)"}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] text-slate-400 uppercase tracking-wider">{isEn ? "MAIN MATERIAL" : "MATÉRIAU PRINCIPAL"}</label>
                                <input type="text" value={r.mainMaterial} onChange={e => set(i, "mainMaterial", e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Examples: Tiles, Zinc, Green roofs..." : "Ex: Tuiles, Zinc, Toiture végétale..."} />
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-400 uppercase tracking-wider">{isEn ? "TINT" : "TEINTE"}</label>
                                <input type="text" value={r.tint} onChange={e => set(i, "tint", e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Examples: Aged red, Slate..." : "Ex: Rouge vieilli, Ardoise..."} />
                            </div>
                        </div>
                        <ChipRow options={isEn ? ["Aged Red", "Slate", "Natural", "Terracotta"] : ["Rouge vieilli", "Ardoise", "Naturel", "Terre cuite"]} value={r.tint} onChange={v => set(i, "tint", v)} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{isEn ? "SOFFITS & ROOF OVERHANGS" : "SOUS-FACE & DÉBORDS DE TOITURE"}</p>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider">{isEn ? "UNDERSIDE CLADDING" : "HABILLAGE SOUS-FACE"}</label>
                        <input type="text" value={r.soffitCladding} onChange={e => set(i, "soffitCladding", e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Material and color (e.g., White PVC, Stained Wood)" : "Matériau et couleur (ex: PVC blanc, Bois teinté)"} />
                        <ChipRow options={isEn ? ["White PVC", "Natural Wood", "Gray Aluminum", "Painted Paneling"] : ["PVC Blanc", "Bois Naturel", "Aluminium Gris", "Lambris Peint"]} value={r.soffitCladding} onChange={v => set(i, "soffitCladding", v)} />
                    </div>
                </div>
            ))}
            <button type="button" onClick={add} className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-1 ml-3">
                <span className="text-indigo-600">←</span> {isEn ? "Add another type of roofing" : "Ajouter un autre type de toiture"}
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
                <div key={i} className="space-y-2 pl-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] text-slate-400 uppercase tracking-wider">{isEn ? "MATERIAL" : "MATÉRIAU"}</label>
                            <input type="text" value={g.material} onChange={e => set(i, "material", e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Examples: Zinc, Aluminum..." : "Ex: Zinc, Aluminium..."} />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 uppercase tracking-wider">{isEn ? "TINT" : "TEINTE"}</label>
                            <input type="text" value={g.tint} onChange={e => set(i, "tint", e.target.value)} className="w-full px-3 py-2 mt-1 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Examples: Natural, White..." : "Ex: Naturel, Blanc..."} />
                        </div>
                    </div>
                    <ChipRow options={isEn ? ["Galvanized Steel", "Copper", "Aluminum"] : ["Acier Galvanisé", "Cuivre", "Aluminium"]} value={g.material} onChange={v => set(i, "material", v)} />
                    <ChipRow options={isEn ? ["Natural", "White", "Black", "Sand"] : ["Naturel", "Blanc", "Noir", "Sable"]} value={g.tint} onChange={v => set(i, "tint", v)} />
                    <ChipRow options={isEn ? ["Zinc", "PVC"] : ["Zinc", "PVC"]} value={g.material} onChange={v => set(i, "material", v)} />
                    <ChipRow options={isEn ? ["Anthracite Grey"] : ["Gris Anthracite"]} value={g.tint} onChange={v => set(i, "tint", v)} />
                </div>
            ))}
            <button type="button" onClick={add} className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-1 ml-3">
                <span className="text-indigo-600">←</span> {isEn ? "Add another type" : "Ajouter un autre type"}
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
                <div key={i} className="space-y-2 pl-3">
                    <div className="grid grid-cols-3 gap-2">
                        <select value={f.coating} onChange={e => set(i, "coating", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white">
                            <option value="">{isEn ? "Coating..." : "Enduit..."}</option>
                            <option value="render">{isEn ? "Render" : "Enduit"}</option>
                            <option value="stone">{isEn ? "Stone" : "Pierre"}</option>
                            <option value="wood">{isEn ? "Wood cladding" : "Bardage bois"}</option>
                            <option value="composite">{isEn ? "Composite" : "Composite"}</option>
                        </select>
                        <input type="text" value={f.finishing} onChange={e => set(i, "finishing", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Finishing" : "Finition"} />
                        <input type="text" value={f.tint} onChange={e => set(i, "tint", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Tint" : "Teinte"} />
                    </div>
                    <ChipRow options={isEn ? ["Scratched", "Smooth", "Your Pierre", "Off-white"] : ["Gratté", "Lisse", "Pierre de taille", "Blanc cassé"]} value={f.finishing || f.tint} onChange={v => set(i, "finishing", v)} />
                    <ChipRow options={isEn ? ["Talosoché", "Openwork", "Pearl Grey", "Ocher"] : ["Taloché", "Ajouré", "Gris Perle", "Ocre"]} value={f.tint} onChange={v => set(i, "tint", v)} />
                </div>
            ))}
            <button type="button" onClick={add} className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-1 ml-3">
                <span className="text-indigo-600">←</span> {isEn ? "Add another type of facade" : "Ajouter un autre type de façade"}
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
                <div key={i} className="space-y-2 pl-3">
                    <div className="grid grid-cols-2 gap-3">
                        <input type="text" value={j.materials} onChange={e => set(i, "materials", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Joinery Materials" : "Matériaux menuiseries"} />
                        <input type="text" value={j.shutters} onChange={e => set(i, "shutters", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder={isEn ? "Shutters / Blinds" : "Volets / Stores"} />
                    </div>
                    <ChipRow options={isEn ? ["Aluminum Grey 7016", "White PVC", "Integrated roller (invisible)", "Wooden Swing"] : ["Aluminium Gris 7016", "PVC Blanc", "Volet roulant intégré (invisible)", "Battant Bois"]} value={j.materials || j.shutters} onChange={v => set(i, "materials", v)} />
                    <ChipRow options={isEn ? ["Exotic Wood", "Black Steel", "BSO (Sunshade)"] : ["Bois Exotique", "Acier Noir", "BSO (Brise-soleil)"]} value={j.shutters} onChange={v => set(i, "shutters", v)} />
                </div>
            ))}
            <button type="button" onClick={add} className="text-sm text-indigo-600 font-semibold hover:text-indigo-700 flex items-center gap-1 ml-3">
                <span className="text-indigo-600">←</span> {isEn ? "Add another type of joinery" : "Ajouter un autre type de menuiserie"}
            </button>
        </div>
    );
}

// ─── Construction/Extension Card (full materials) ───────────────────────
function FullMaterialCard({ isEn, sectionKey, label, number, area, mat, update }: {
    isEn: boolean; sectionKey: string; label: string; number: number; area: string;
    mat: JobMaterials; update: (updater: (m: JobMaterials) => JobMaterials) => void;
}) {
    return (
        <div className="rounded-xl border-l-[3px] border-l-indigo-500 border border-slate-200 overflow-hidden bg-white">
            <div className="px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">{number}</span>
                    <p className="text-sm font-bold text-slate-800">{label}</p>
                </div>
                {area && <span className="text-xs text-slate-400">{area}</span>}
            </div>
            <div className="px-5 pb-5 space-y-5">
                <RoofSection isEn={isEn} sectionKey={sectionKey} roofs={mat.roofs} update={update} />
                <div className="border-t border-slate-100" />
                <GutterSection isEn={isEn} gutters={mat.gutters} update={update} />
                <div className="border-t border-slate-100" />
                <FacadeSection isEn={isEn} facades={mat.facades} update={update} />
                <div className="border-t border-slate-100" />
                <JoinerySection isEn={isEn} joineries={mat.joineries} update={update} />
            </div>
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function MaterialsStep({
    isEn, existingFacade, setExistingFacade, existingRoof, setExistingRoof,
    jobMaterials, updateJobMat, getJobMat, setStep, jobs,
}: MaterialsStepProps) {
    // Helper to get area for a section
    const getArea = (key: string): string => {
        const job = jobs.find(j => {
            if (key === "new_construction") return j.nature === "new_construction";
            if (key === "extension") return j.nature === "existing_extension" && !j.workTypes?.includes("change_destination");
            if (key === "change_destination") return j.nature === "existing_extension" && j.workTypes?.includes("change_destination");
            if (key === "pool") return j.nature === "outdoor" && j.outdoorLayout === "pool";
            return false;
        });
        if (!job) return "";
        if (key === "pool" && job.poolSurfaceArea) return `${job.poolSurfaceArea}m²`;
        if (job.floorAreaEstimated > 0) return `${job.floorAreaEstimated}m²`;
        if (job.footprint > 0) return `${job.footprint}m²`;
        return "";
    };

    const updateSection = (key: string) => (updater: (m: JobMaterials) => JobMaterials) => {
        updateJobMat(key, updater);
    };

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

            {/* ── Existing Building (Context) ── */}
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

            {/* ── 1. New Independent Construction ── */}
            <FullMaterialCard
                isEn={isEn} sectionKey="new_construction" number={1}
                label={isEn ? "New Independent Construction" : "Construction Indépendante Neuve"}
                area={getArea("new_construction")}
                mat={getJobMat("new_construction")}
                update={updateSection("new_construction")}
            />

            {/* ── 2. Extension (Attached) ── */}
            <FullMaterialCard
                isEn={isEn} sectionKey="extension" number={2}
                label={isEn ? "Extension (Attached)" : "Extension (Attenante)"}
                area={getArea("extension")}
                mat={getJobMat("extension")}
                update={updateSection("extension")}
            />

            {/* ── 3. Change of Destination ── */}
            <div className="rounded-xl border-l-[3px] border-l-indigo-500 border border-slate-200 overflow-hidden bg-white">
                <div className="px-5 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">3</span>
                        <p className="text-sm font-bold text-slate-800">{isEn ? "Change of Destination" : "Changement de Destination"}</p>
                    </div>
                    <span className="text-xs text-slate-400">{getArea("change_destination")}</span>
                </div>
                <div className="px-5 pb-5 space-y-4">
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                            {isEn ? "DESCRIBE THE PLANNED WORK IN DETAIL." : "DÉCRIRE LES TRAVAUX PRÉVUS EN DÉTAIL."}
                        </p>
                        <textarea
                            value={getJobMat("change_destination").workDescription || ""}
                            onChange={e => updateJobMat("change_destination", m => ({ ...m, workDescription: e.target.value }))}
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
                                checked={getJobMat("change_destination").facadeModification || false}
                                onChange={e => updateJobMat("change_destination", m => ({ ...m, facadeModification: e.target.checked }))}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700">
                                {isEn ? "Yes, the facades have been modified." : "Oui, les façades ont été modifiées."}
                            </span>
                        </label>
                    </div>
                </div>
            </div>

            {/* ── 4. Pool ── */}
            <div className="rounded-xl border-l-[3px] border-l-indigo-500 border border-slate-200 overflow-hidden bg-white">
                <div className="px-5 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">4</span>
                        <p className="text-sm font-bold text-slate-800">{isEn ? "Pool" : "Piscine"}</p>
                    </div>
                    <span className="text-xs text-slate-400">{getArea("pool")}</span>
                </div>
                <div className="px-5 pb-5 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-600">{isEn ? "Liner Color / Coating" : "Couleur Liner / Revêtement"}</label>
                            <input type="text" value={getJobMat("pool").linerColor || ""} onChange={e => updateJobMat("pool", m => ({ ...m, linerColor: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                placeholder={isEn ? "Example: Azure blue" : "Ex: Bleu azur"} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-600">{isEn ? "Coping stones / Beaches" : "Margelles / Plages"}</label>
                            <input type="text" value={getJobMat("pool").copingStones || ""} onChange={e => updateJobMat("pool", m => ({ ...m, copingStones: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                placeholder={isEn ? "Example: Stone slabs" : "Ex: Dalles en pierre"} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-600">{isEn ? "Shelter Materials" : "Matériaux de l'abri"}</label>
                        <input type="text" value={getJobMat("pool").shelterMaterials || ""} onChange={e => updateJobMat("pool", m => ({ ...m, shelterMaterials: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                            placeholder={isEn ? "Example: Powder-coated aluminum, polycarbonate glazing" : "Ex: Aluminium thermolaqué, vitrage polycarbonate"} />
                    </div>
                </div>
            </div>

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
