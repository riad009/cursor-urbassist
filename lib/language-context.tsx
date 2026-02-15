"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { type Locale, getTranslation } from "./translations";

interface LanguageContextType {
    locale: Locale;
    toggleLanguage: () => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
    locale: "fr",
    toggleLanguage: () => { },
    t: (key: string) => key,
});

const STORAGE_KEY = "urbassist_locale";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocale] = useState<Locale>("fr");

    // Hydrate from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
            if (stored === "en" || stored === "fr") {
                setLocale(stored);
            }
        } catch {
            // SSR / incognito — ignore
        }
    }, []);

    const toggleLanguage = useCallback(() => {
        setLocale((prev) => {
            const next = prev === "fr" ? "en" : "fr";
            try {
                localStorage.setItem(STORAGE_KEY, next);
            } catch {
                // ignore
            }
            return next;
        });
    }, []);

    const t = useCallback(
        (key: string) => getTranslation(key, locale),
        [locale]
    );

    return (
        <LanguageContext.Provider value={{ locale, toggleLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    return useContext(LanguageContext);
}
