"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Dossier flow removed — redirect to Projects.
 * Address and parcels are entered in the New Project modal.
 */
export default function DossierPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/projects");
  }, [router]);
  return null;
}
