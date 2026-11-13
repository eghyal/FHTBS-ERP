import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "neutral"
    | "outline"
    | "primary"
    | "brand"
    | "coral"
    | "mint"
    | "glass"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "purple";
  size?: "sm" | "md" | "lg";
  dot?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  default: "bg-stone-100 text-stone-700 border-stone-200/90",
  neutral: "bg-stone-100 text-stone-700 border-stone-200/90",
  outline: "bg-white text-stone-700 border-stone-200",
  primary: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  brand: "bg-stone-100 text-stone-800 border-stone-300",
  coral: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  mint: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  glass: "bg-white/80 backdrop-blur-md text-stone-700 border-stone-200/80",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  warning: "bg-amber-50 text-amber-800 border-amber-200/80",
  danger: "bg-rose-50 text-rose-700 border-rose-200/80",
  info: "bg-sky-50 text-sky-700 border-sky-200/80",
  purple: "bg-violet-50 text-violet-700 border-violet-200/80",
};

const dotColors: Record<string, string> = {
  default: "bg-stone-400",
  neutral: "bg-stone-500",
  outline: "bg-stone-400",
  primary: "bg-emerald-500",
  brand: "bg-stone-600",
  coral: "bg-emerald-500",
  mint: "bg-emerald-500",
  glass: "bg-stone-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
  purple: "bg-violet-500",
};

const sizeStyles: Record<string, string> = {
  sm: "text-[9.5px] px-2 py-0.5 font-bold tracking-wider",
  md: "text-[10.5px] px-2.5 py-0.5 font-bold tracking-wide",
  lg: "text-xs px-3 py-1 font-bold tracking-normal",
};

export const Badge = memo(function Badge({
  className,
  variant = "default",
  size = "sm",
  dot = false,
  icon,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border uppercase transition-colors select-none whitespace-nowrap tabular-nums",
        variantStyles[variant] || variantStyles.default,
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColors[variant] || dotColors.default)}
          aria-hidden="true"
        />
      )}
      {icon && <span className="shrink-0 flex items-center [&>svg]:w-3 [&>svg]:h-3">{icon}</span>}
      {children}
    </span>
  );
});
