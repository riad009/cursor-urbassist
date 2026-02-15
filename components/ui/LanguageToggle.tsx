"use client";

import React from "react";
import { useLanguage } from "@/lib/language-context";
import { Globe } from "lucide-react";

export default function LanguageToggle() {
    const { locale, toggleLanguage } = useLanguage();

    return (
        <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border border-white/10 hover:border-white/20 hover:bg-slate-700 transition-all text-sm font-medium"
            title={locale === "fr" ? "Switch to English" : "Passer en français"}
        >
            <Globe className="w-4 h-4 text-slate-400" />
            <span className={locale === "fr" ? "text-white" : "text-slate-500"}>FR</span>
            <span className="text-slate-600">|</span>
            <span className={locale === "en" ? "text-white" : "text-slate-500"}>EN</span>
        </button>
    );
}
