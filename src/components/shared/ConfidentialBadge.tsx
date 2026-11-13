import React from "react";
import { cn } from "@/lib/utils";

interface ConfidentialBadgeProps {
  className?: string;
  size?: "xs" | "sm" | "md";
}

/**
 * Standard Red Badge Pill for confidential financial data censorship.
 * Displayed when an unauthorized role inspects a document containing proprietary prices, totals, or margins.
 */
export const ConfidentialBadge: React.FC<ConfidentialBadgeProps> = ({
  className,
  size = "xs",
}) => {
  const sizeClasses = {
    xs: "px-1.5 py-0.5 text-[9.5px]",
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-xs",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-black uppercase tracking-wider rounded select-none shadow-2xs",
        "bg-rose-50 text-rose-600 border border-rose-200",
        "dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/60",
        sizeClasses[size],
        className,
      )}
      title="Access Restricted: Confidential Financial Information"
    >
      CONFIDENTIAL
    </span>
  );
};

export default ConfidentialBadge;
