import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "subtle" | "flat" | "elevated" | "glass" | "glass_subtle";
  padding?: "none" | "sm" | "md" | "lg";
}

const variantStyles: Record<string, string> = {
  default: "bg-white border border-stone-200/80 shadow-2xs",
  subtle: "bg-stone-50/60 border border-stone-200/60",
  flat: "bg-white border border-stone-200",
  elevated: "bg-white border border-stone-200/80 shadow-sm hover:shadow-md transition-shadow",
  glass: "hris-glass-card rounded-2xl",
  glass_subtle: "hris-glass-subtle rounded-2xl",
};

const paddingStyles: Record<string, string> = {
  none: "p-0",
  sm: "p-2.5 sm:p-3.5",
  md: "p-3.5 sm:p-5",
  lg: "p-4 sm:p-6",
};

export const Card = memo(function Card({
  className,
  variant = "default",
  padding = "md",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl relative overflow-hidden transition-all duration-200",
        variantStyles[variant],
        paddingStyles[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

export const CardHeader = memo(function CardHeader({
  className,
  title,
  subtitle,
  icon,
  actions,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 mb-3 border-b border-stone-100",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-4 sm:[&>svg]:h-4">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {title && (
            <h3 className="text-xs sm:text-sm font-bold text-stone-900 tracking-tight truncate">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-[9.5px] sm:text-[11px] font-semibold text-stone-500 uppercase tracking-wider truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5 shrink-0">{actions}</div>}
      {children}
    </div>
  );
});
