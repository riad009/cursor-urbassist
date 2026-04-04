"use client";

import React from "react";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PC4InlinePreviewProps {
    jobs: any[];
    projectAddress: string;
    projectData: any;
    projectName: string;
    projectId: string;
    applicantName: string;
    matExtMaterial: string;
    wallMaterial: string;
    roofCovering: string;
    roofMaterial: string;
    roofColor: string;
    joineryMaterial: string;
    trimColor: string;
}

export default function PC4InlinePreview({
    jobs,
    projectAddress,
    projectData,
    projectName,
    projectId,
    applicantName,
    matExtMaterial,
    wallMaterial,
    roofCovering,
    roofMaterial,
    roofColor,
    joineryMaterial,
    trimColor,
}: PC4InlinePreviewProps) {
    const mainJob = jobs[0];
    const natureLabel = mainJob?.nature === "new_construction" ? "construction neuve"
        : mainJob?.nature === "existing_extension" ? "extension sur l'existant"
            : mainJob?.displayLabel?.toLowerCase() || "construction";
    const postalMatch = (projectAddress || "").match(/\b(\d{5})\b/);
    const postalCode = postalMatch ? postalMatch[1] : "";
    const deptCode = postalCode.slice(0, 2);
    const locationSuffix = postalCode ? `(${postalCode})` : deptCode ? `(${deptCode})` : "";
    const parcelArea = projectData?.parcelArea || 500;
    const fpExist = projectData?.sitePlanData?.footprintExisting || (mainJob?.footprint || 0);
    const sa = projectData?.sitePlanData?.surfaceAreas as Record<string, any> | null;
    const greenA = Number(sa?.greenArea) || Number(sa?.vegetalizedArea) || Math.round(parcelArea * 0.6);
    const semiPerm = Number(sa?.semiPermeableArea) || Number(sa?.gravelArea) || Math.round(parcelArea * 0.1);
    const imperm = Number(sa?.impermeableArea) || Math.round(parcelArea * 0.1);
    const plTot = greenA + semiPerm;
    const totalFree = greenA + semiPerm + imperm;
    const ceExist = parcelArea > 0 ? ((fpExist / parcelArea) * 100).toFixed(1) : "0.0";

    const tableRows = [
        { l: "Surface de la parcelle", v: `${parcelArea} m²` },
        { l: "Emprise au sol habitation", v: `${fpExist} m²` },
        { l: "Emprise au sol totale", v: `${fpExist} m²` },
        { l: "Coefficient d'emprise", v: `${ceExist} %` },
        { l: "Surface pleine terre végétalisée", v: `${greenA} m²` },
        { l: "Surface semi perméable", v: `${semiPerm} m²` },
        { l: "Surface pleine terre totale", v: `${plTot} m²` },
        { l: "SOIT", v: `${parcelArea > 0 ? ((plTot / parcelArea) * 100).toFixed(1) : "0.0"} %`, bold: true },
        { l: "Surface libre imperméable", v: `${imperm} m²` },
        { l: "SOIT", v: `${parcelArea > 0 ? ((imperm / parcelArea) * 100).toFixed(1) : "0.0"} %`, bold: true },
        { l: "Total espaces libres", v: `${totalFree} m²` },
        { l: "SOIT", v: `${parcelArea > 0 ? ((totalFree / parcelArea) * 100).toFixed(1) : "0.0"} %`, bold: true },
        { l: "Places de stationnement", v: "1" },
    ];

    const SurfaceTable = ({ title, rows: r }: { title: string; rows: typeof tableRows }) => (
        <div className="border border-slate-300 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-[#1a237e] text-white text-sm font-bold text-center py-2.5 uppercase tracking-wider">
                Récapitulatif des surfaces — {title}
            </div>
            <div className="bg-[#283593] text-white flex justify-between px-4 py-2 text-xs font-bold uppercase">
                <span>Description</span>
                <span>Surfaces</span>
            </div>
            {r.map((row, i) => (
                <div
                    key={i}
                    className={cn(
                        "flex justify-between px-4 py-2 text-sm border-t border-slate-200",
                        row.bold ? "bg-indigo-50 font-bold text-indigo-900" : i % 2 === 0 ? "bg-slate-50" : "bg-white"
                    )}
                >
                    <span className={row.bold ? "font-bold" : "text-slate-700"}>{row.l}</span>
                    <span className="font-semibold text-slate-900">{row.v}</span>
                </div>
            ))}
        </div>
    );

    return (
        <div className="p-6 max-h-[75vh] overflow-y-auto">
            <div className="border border-slate-300 rounded-xl overflow-hidden shadow-md bg-white">
                {/* Document header */}
                <div className="bg-white px-8 py-6 border-b-2 border-slate-900">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-wide">
                                NOTICE DESCRIPTIVE (PCMI 4)
                            </h1>
                            <p className="text-sm text-slate-500 mt-1">Généré automatiquement par Urbassist</p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-bold text-slate-900">{projectName || "—"}</p>
                            <p className="text-sm text-slate-500">Ref: {projectId.slice(0, 6)}</p>
                        </div>
                    </div>
                    <div className="flex justify-between mt-4 pt-3 border-t border-slate-200">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Demandeur</p>
                            <p className="text-base font-semibold text-slate-900 mt-0.5">{applicantName || "—"}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date d&apos;édition</p>
                            <p className="text-base font-bold text-slate-900 mt-0.5">{new Date().toLocaleDateString("fr-FR")}</p>
                        </div>
                    </div>
                </div>

                {/* Two-column layout */}
                <div className="flex flex-col lg:flex-row">
                    {/* LEFT COLUMN — Narrative */}
                    <div className="flex-[55] px-8 py-6 space-y-5 border-r border-slate-200">
                        {/* Section 1 */}
                        <div>
                            <h2 className="text-base font-black text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-3 inline-block">
                                1 - État initial du terrain et ses abords :
                            </h2>
                            <div className="text-sm text-slate-700 leading-relaxed space-y-2">
                                <p>Le terrain se situe au {projectAddress || "[adresse]"} sur la commune de {(projectData?.municipality || "").toUpperCase()} {locationSuffix}.</p>
                                <p>Le terrain est partiellement végétalisé et planté de quelques arbres. Des surfaces imperméables ont été aménagées.</p>
                                <p>L&apos;accès à la propriété se fait par la voie publique existante.</p>
                                <p>{fpExist > 0 ? "Le terrain est occupé par une maison d'habitation." : "Le terrain est actuellement non bâti."}</p>
                                <p>Le terrain présente une très faible pente.</p>
                            </div>
                        </div>

                        {/* Section 2 */}
                        <div>
                            <h2 className="text-base font-black text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-3 inline-block">
                                2 - État projeté :
                            </h2>
                            <p className="text-sm text-slate-700 leading-relaxed">
                                Le projet prévoit la {natureLabel}{mainJob?.footprint ? ` d'une emprise au sol de ${mainJob.footprint} m²` : ""}.
                            </p>
                        </div>

                        {/* Section 3 */}
                        <div>
                            <h2 className="text-base font-black text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-3 inline-block">
                                Aménagement du terrain :
                            </h2>
                            <div className="text-sm text-slate-700 leading-relaxed space-y-2">
                                <p>Le projet ne modifie en rien le terrain et ses abords.</p>
                                <p>La topographie globale du terrain sera conservée.</p>
                            </div>
                        </div>

                        {/* Section 4 */}
                        <div>
                            <h2 className="text-base font-black text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-3 inline-block">
                                Implantation, organisation, composition et volume :
                            </h2>
                            <div className="text-sm text-slate-700 leading-relaxed space-y-2">
                                {mainJob && (
                                    <>
                                        <p>La réalisation de la {natureLabel} ne nécessite pas de mouvement de terre important.</p>
                                        <p>Le niveau actuel du terrain au droit du projet sera conservé.</p>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Section 5 */}
                        <div>
                            <h2 className="text-base font-black text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-3 inline-block">
                                Traitement des constructions, clôtures, végétations :
                            </h2>
                            <p className="text-sm text-slate-700 leading-relaxed">
                                Les aménagements extérieurs existants ne subiront aucune modification et seront conservés en l&apos;état à l&apos;exception de la partie végétalisée qui sera supprimée pour l&apos;emprise du projet.
                            </p>
                        </div>

                        {/* Section 6 */}
                        <div>
                            <h2 className="text-base font-black text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-3 inline-block">
                                Matériaux et les couleurs :
                            </h2>
                            <div className="text-sm text-slate-700 leading-relaxed space-y-2">
                                {(() => {
                                    const parts: string[] = [];
                                    const wm = matExtMaterial || wallMaterial;
                                    if (wm) parts.push(`La structure sera en ${wm}.`);
                                    const rc = roofCovering || roofMaterial;
                                    if (rc) parts.push(`La toiture sera en ${rc}${roofColor ? ` de couleur ${roofColor}` : ""}.`);
                                    if (joineryMaterial) parts.push(`Les menuiseries seront en ${joineryMaterial}${trimColor ? ` de coloris ${trimColor}` : ""}.`);
                                    if (parts.length === 0) parts.push("Les matériaux seront définis conformément au PLU applicable.");
                                    return parts.map((t, i) => <p key={i}>{t}</p>);
                                })()}
                            </div>
                        </div>

                        {/* Section 7 */}
                        <div>
                            <h2 className="text-base font-black text-slate-900 uppercase border-b-2 border-slate-900 pb-1 mb-3 inline-block">
                                Organisation et l&apos;aménagement des accès :
                            </h2>
                            <div className="text-sm text-slate-700 leading-relaxed space-y-2">
                                <p>L&apos;accès au terrain ne sera pas modifié.</p>
                                <p>Le projet créera 1 place de stationnement extérieure supplémentaire au niveau de la parcelle.</p>
                                <p>La gestion des eaux usées ne sera pas modifiée en ce qui concerne la maison principale.</p>
                                <p>Les eaux de pluies générées par le projet seront traitées au niveau de la parcelle par une cuve de rétention.</p>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN — Tables */}
                    <div className="flex-[45] px-6 py-6 space-y-5 bg-slate-50/60">
                        <SurfaceTable title="Existant" rows={tableRows} />
                        <SurfaceTable title="Projet" rows={tableRows} />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-3 border-t border-slate-300 bg-slate-100 flex justify-between items-center">
                    <span className="text-xs text-slate-500 italic">
                        Document ne pouvant servir à l&apos;exécution des travaux.
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">
                        INDICE 0 — {new Date().toLocaleDateString("fr-FR")} — NOTICE DESCRIPTIVE — PCMI 4
                    </span>
                </div>
            </div>
        </div>
    );
}
