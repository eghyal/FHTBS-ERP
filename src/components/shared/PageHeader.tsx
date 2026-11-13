import React, { memo } from "react";
import { Eye, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileMonitoring } from "@/contexts/MonitoringContext";

export interface PageHeaderProps {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  iconBgClassName?: string;
}

export const PageHeader = memo(function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
  iconBgClassName,
}: PageHeaderProps) {
  const { isMobileReadOnly, openDesktopNotice } = useMobileMonitoring();

  return (
    <header
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between pb-3 sm:pb-3.5 gap-2.5 sm:gap-4 relative border-b border-stone-200/80 w-full animate-in fade-in slide-in-from-top-1 duration-300",
        className,
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="shrink-0 flex items-center justify-center">
          {icon ? (
            <div
              className={cn(
                "page-header-icon-box w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-center justify-center text-amber-700 shadow-2xs transition-transform duration-200",
                iconBgClassName,
              )}
            >
              <div className="w-4 h-4 sm:w-4.5 sm:h-4.5 flex items-center justify-center text-current [&>svg]:w-4 [&>svg]:h-4 sm:[&>svg]:w-4.5 sm:[&>svg]:h-4.5 [&_svg]:text-current [&>svg]:shrink-0 [&_svg]:shrink-0">
                {icon}
              </div>
            </div>
          ) : (
            <div className="page-header-icon-box w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50/80 border border-amber-200/80" />
          )}
        </div>

        <div className="flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm sm:text-base md:text-lg font-extrabold tracking-tight text-stone-900 leading-tight mb-0.5 uppercase truncate">
              {title}
            </h2>
            {isMobileReadOnly && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200/90 text-[9px] font-bold uppercase tracking-wider text-stone-700 shrink-0">
                <Eye className="w-2.5 h-2.5" />
                Read-Only
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] sm:text-xs font-medium text-stone-500 leading-snug truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {isMobileReadOnly ? (
        <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 justify-between sm:justify-end">
          <button
            type="button"
            onClick={() =>
              openDesktopNotice(
                title,
                `The ${title} module is open in Read-Only Monitoring Mode. To create, edit, or authorize records in this module, please switch to Desktop Mode.`,
              )
            }
            className="h-8 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200/80 text-stone-700 text-[10.5px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Monitor className="w-3.5 h-3.5 text-stone-600 shrink-0" />
            <span>Read-Only · Desktop Mode Info</span>
          </button>
        </div>
      ) : (
        actions && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto shrink-0 justify-start sm:justify-end">
            {actions}
          </div>
        )
      )}
    </header>
  );
});

