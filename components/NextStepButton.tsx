"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface NextStepButtonProps {
  canProceed: boolean;
  nextHref: string;
  nextLabel?: string;
  disabledMessage?: string;
  className?: string;
}

/**
 * "Next step" button shown when the user is in a project flow.
 * Enabled only when all required fields on the current step are complete.
 */
export function NextStepButton({
  canProceed,
  nextHref,
  nextLabel = "Next step",
  disabledMessage = "Complete required fields to continue",
  className,
}: NextStepButtonProps) {
  if (canProceed) {
    return (
      <Link
        href={nextHref}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium",
          "bg-sky-500 hover:bg-sky-600 text-white transition-colors",
          className
        )}
      >
        {nextLabel}
        <ArrowRight className="w-4 h-4" />
      </Link>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium",
        "bg-slate-700/50 text-slate-400 cursor-not-allowed",
        "border border-white/5",
        className
      )}
      title={disabledMessage}
    >
      {nextLabel}
      <ArrowRight className="w-4 h-4 opacity-60" />
      <span className="text-xs font-normal text-slate-500 ml-1">(complete required fields)</span>
    </span>
  );
}
