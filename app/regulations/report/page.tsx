"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navigation from "@/components/layout/Navigation";
import { Download, ArrowLeft, FileText } from "lucide-react";
import {
  loadReportFromSession,
  type RegulatoryReport,
} from "@/lib/regulatory-report";

const TABLE_HEADER_BG = "#1e3a5f";
const ROW_LABEL_BG = "#dbeafe";
const BORDER_COLOR = "#e5e7eb";

function ReportSection({
  number,
  title,
  rows,
  showRecommandations = true,
}: {
  number: number;
  title: string;
  rows: { regulation: string; conformite: string; recommandations?: string }[];
  showRecommandations?: boolean;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-gray-800 uppercase mb-4 print:text-sm">
        {number}. {title}
      </h2>
      <table className="w-full border-collapse text-sm print:text-xs" style={{ border: `1px solid ${BORDER_COLOR}` }}>
        <thead>
          <tr>
            <th
              className="text-left p-3 font-bold text-slate-900 uppercase border border-gray-200"
              style={{ backgroundColor: TABLE_HEADER_BG }}
            >
              RÉGLEMENTATION
            </th>
            <th
              className="text-center p-3 font-bold text-slate-900 uppercase border border-gray-200 w-28"
              style={{ backgroundColor: TABLE_HEADER_BG }}
            >
              CONFORMITÉ
            </th>
            {showRecommandations && (
              <th
                className="text-center p-3 font-bold text-slate-900 uppercase border border-gray-200 w-32"
                style={{ backgroundColor: TABLE_HEADER_BG }}
              >
                RECOMMANDATIONS
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td
                className="p-3 text-gray-700 align-top border border-gray-200"
                style={{ backgroundColor: ROW_LABEL_BG }}
              >
                {row.regulation}
              </td>
              <td className="p-3 text-gray-700 text-center align-top border border-gray-200 bg-white">
                {row.conformite}
              </td>
              {showRecommandations && (
                <td className="p-3 text-gray-700 text-center align-top border border-gray-200 bg-white">
                  {row.recommandations ?? "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function RegulatoryReportPage() {
  const [report, setReport] = useState<RegulatoryReport | null>(null);

  useEffect(() => {
    setReport(loadReportFromSession());
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (!report) {
    return (
      <Navigation>
        <div className="p-6 max-w-2xl mx-auto text-center">
          <FileText className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">No report data</h1>
          <p className="text-slate-400 mb-6">
            Run an analysis on the AI Analysis page and click &quot;Export Report&quot; to generate the regulatory analysis document.
          </p>
          <Link
            href="/regulations"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to AI Analysis
          </Link>
        </div>
      </Navigation>
    );
  }

  const { situation, conclusion } = report;
  const typeDossierLabel =
    conclusion.typeDossier === "ARCHITECT_REQUIRED"
      ? "Architecte obligatoire"
      : conclusion.typeDossier === "PC"
        ? "PC"
        : "DP";

  const conformeLabel = conclusion.conforme ? "Conforme" : "Non conforme";

  return (
    <Navigation>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Actions - hidden when printing */}
        <div className="flex flex-wrap gap-3 mb-6 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-slate-900 font-semibold hover:opacity-90"
          >
            <Download className="w-5 h-5" />
            Print / Save as PDF
          </button>
          <Link
            href="/regulations"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to AI Analysis
          </Link>
        </div>

        {/* Report - print-friendly, same design as reference */}
        <div className="bg-white text-gray-800 rounded-xl shadow-xl p-8 print:shadow-none print:p-0 print:bg-white print:rounded-none">
          <h1 className="text-2xl font-bold text-gray-800 text-center mb-8 print:text-xl">
            {report.title}
          </h1>

          {/* 1. SITUATION DU PROJET - 5-column table */}
          <section className="mb-8">
            <h2 className="text-base font-bold text-gray-800 uppercase mb-4 print:text-sm">
              1. SITUATION DU PROJET
            </h2>
            <table className="w-full border-collapse text-sm print:text-xs" style={{ border: `1px solid ${BORDER_COLOR}` }}>
              <thead>
                <tr>
                  {["ADRESSE DU PROJET", "NOM DE LA ZONE", "TYPE DE RÉGLEMENT", "LOTISSEMENT", "ZONE ABF"].map((h) => (
                    <th
                      key={h}
                      className="text-center p-3 font-bold text-slate-900 uppercase border border-gray-200"
                      style={{ backgroundColor: TABLE_HEADER_BG }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-3 text-gray-700 border border-gray-200 bg-white">
                    {situation.projectAddress}
                  </td>
                  <td className="p-3 text-gray-700 border border-gray-200 bg-white text-center">
                    {situation.zoneName}
                  </td>
                  <td className="p-3 text-gray-700 border border-gray-200 bg-white text-center">
                    {situation.regulationType}
                  </td>
                  <td className="p-3 text-gray-700 border border-gray-200 bg-white text-center">
                    {situation.lotissement}
                  </td>
                  <td className="p-3 text-gray-700 border border-gray-200 bg-white text-center">
                    {situation.zoneAbf}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <ReportSection
            number={2}
            title="USAGE DES SOLS ET DESTINATION DES CONSTRUCTIONS"
            rows={report.usageDesSols}
            showRecommandations={true}
          />

          <ReportSection
            number={3}
            title="CARACTÉRISTIQUES URBAINES, ARCHITECTURALES, ENVIRONNEMENTALES ET PAYSAGÈRES"
            rows={report.caracteristiques}
          />

          <ReportSection
            number={4}
            title="TRAITEMENT ENVIRONNEMENTAL ET PAYSAGER DES ESPACES NON BÂTIS ET ABORDS DES CONSTRUCTIONS"
            rows={report.traitementEnvironnemental}
          />

          <ReportSection
            number={5}
            title="OBLIGATIONS EN MATIÈRE DE STATIONNEMENT"
            rows={report.stationnement}
          />

          <ReportSection
            number={6}
            title="OBLIGATIONS EN MATIÈRE D'ACCÈS ET DE VOIRIES"
            rows={report.accessVoiries}
            showRecommandations={true}
          />

          <ReportSection
            number={7}
            title="PLAN DE PRÉVENTION DES RISQUES NATURELLES (PPRN)"
            rows={report.pprn}
            showRecommandations={true}
          />

          {/* Conclusion */}
          <section className="mt-8 mb-8 print:break-inside-avoid">
            <h2 className="text-base font-bold text-gray-800 mb-3 print:text-sm">
              Conclusion :
            </h2>
            <p className="text-gray-700 mb-2">
              Votre projet semble {conclusion.conforme ? (
                <>être <span className="text-blue-600 font-medium">« {conformeLabel} »</span> à la réglementation en vigueur.</>
              ) : (
                <>ne pas être <span className="text-blue-600 font-medium">« {conformeLabel} »</span> à la réglementation en vigueur.</>
              )}
            </p>
            {conclusion.recommendation && (
              <p className="text-gray-700 mb-4">
                {conclusion.recommendation}
              </p>
            )}
            <p className="text-gray-700 font-medium">
              Type de dossier : {typeDossierLabel} — {conclusion.justification}
            </p>
          </section>

          <p className="text-center text-sm text-gray-500 mt-6">
            Document généré le{" "}
            {new Date(report.generatedAt).toLocaleDateString("fr-FR", {
              dateStyle: "long",
            })}{" "}
            · UrbAssist
          </p>
          <p className="text-center font-bold text-blue-600 mt-4 text-lg print:mt-6">
            MERCI DE VOTRE CONFIANCE
          </p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body { background: white !important; }
          nav, .print\\:hidden { display: none !important; }
        }
      `}</style>
    </Navigation>
  );
}
