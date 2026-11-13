import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  label?: React.ReactNode;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode | React.ComponentType<any>;
  iconBgColor?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "amber" | string;
  accentColor?: string;
  iconVariant?: string;
  trend?: {
    value: string | number;
    isPositive?: boolean;
    label?: string;
  };
  isLoading?: boolean;
}

const variantIconStyles: Record<string, string> = {
  default: "bg-stone-100 text-stone-700 border border-stone-200/80",
  brand: "bg-emerald-50 text-emerald-600 border border-emerald-200/80",
  success: "bg-emerald-50 text-emerald-600 border border-emerald-200/80",
  emerald: "bg-emerald-50 text-emerald-600 border border-emerald-200/80",
  warning: "bg-amber-50 text-amber-600 border border-amber-200/80",
  amber: "bg-amber-50 text-amber-600 border border-amber-200/80",
  danger: "bg-rose-50 text-rose-600 border border-rose-200/80",
  rose: "bg-rose-50 text-rose-600 border border-rose-200/80",
  info: "bg-sky-50 text-sky-600 border border-sky-200/80",
  blue: "bg-blue-50 text-blue-600 border border-blue-200/80",
  indigo: "bg-indigo-50 text-indigo-600 border border-indigo-200/80",
  purple: "bg-violet-50 text-violet-600 border border-violet-200/80",
};

export const StatCard = memo(function StatCard({
  title,
  label,
  value,
  subtitle,
  icon,
  iconBgColor,
  variant,
  accentColor,
  iconVariant,
  trend,
  isLoading,
  className,
  ...props
}: StatCardProps) {
  const heading = title ?? label;
  const effectiveVariant = variant || iconVariant || accentColor || "default";
  const resolvedIconBg =
    iconBgColor || variantIconStyles[effectiveVariant] || variantIconStyles.default;
  const renderedIcon =
    icon &&
    (React.isValidElement(icon)
      ? icon
      : typeof icon === "function" || (typeof icon === "object" && "render" in icon)
        ? React.createElement(icon as React.ComponentType<any>, { className: "w-5 h-5" })
        : icon);

  return (
    <div
      className={cn(
        "rounded-xl sm:rounded-2xl border border-stone-200/80 bg-white p-3 sm:p-3.5 shadow-2xs transition-all hover:shadow-xs flex flex-col justify-between",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-stone-500 truncate">
            {heading}
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            {isLoading ? (
              <div className="h-5 w-16 animate-pulse rounded-md bg-stone-200" />
            ) : (
              <h4 className="text-base sm:text-lg font-bold tracking-tight text-stone-900 font-mono tabular-nums truncate">
                {value}
              </h4>
            )}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-[10px] text-stone-500 font-medium truncate">
              {subtitle}
            </p>
          )}
          {trend && (
            <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
              <span
                className={cn(
                  "tabular-nums",
                  trend.isPositive ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {trend.isPositive ? "+" : ""}
                {trend.value}
              </span>
              {trend.label && (
                <span className="text-stone-400 font-normal truncate">{trend.label}</span>
              )}
            </div>
          )}
        </div>
        {renderedIcon && (
          <div
            className={cn(
              "w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4",
              resolvedIconBg,
            )}
          >
            {renderedIcon}
          </div>
        )}
      </div>
    </div>
  );
});

