import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState = memo(function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-5 sm:p-8 text-center bg-stone-50/60 border border-stone-200/80 border-dashed rounded-xl",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-white border border-stone-200/80 shadow-2xs flex items-center justify-center text-stone-400 mb-3 [&>svg]:w-5 [&>svg]:h-5">
          {icon}
        </div>
      )}
      <h4 className="text-xs sm:text-sm font-bold text-stone-800 tracking-tight">
        {title}
      </h4>
      {description && (
        <p className="mt-1 text-[11px] sm:text-xs text-stone-500 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
});
