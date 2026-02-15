"use client";

import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <AuthProvider>{children}</AuthProvider>
    </LanguageProvider>
  );
}
