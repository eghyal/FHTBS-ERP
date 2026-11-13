import React from "react";
import { Link } from "react-router-dom";
import { Eye, Monitor, Smartphone, CheckCircle2 } from "lucide-react";
import { hasGodMode } from "@/utils/pbac";

export interface MobileMonitoringStripProps {
  user: any;
  isMobileReadOnly: boolean;
  isMobileViewport: boolean;
  isForceDesktopMode: boolean;
  isExemptInteractiveRoute: boolean;
  openDesktopNotice: (title: string, message: string) => void;
  disableForceDesktopMode: () => void;
}

export const MobileMonitoringStrip = React.memo(function MobileMonitoringStrip({
  user,
  isMobileReadOnly,
  isMobileViewport,
  isForceDesktopMode,
  isExemptInteractiveRoute,
  openDesktopNotice,
  disableForceDesktopMode,
}: MobileMonitoringStripProps) {
  if (!user) return null;

  return (
    <div className="lg:hidden shrink-0">
      {isMobileReadOnly ? (
        <div className="bg-amber-50/90 border-b border-amber-200/80 px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Eye className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 truncate">
              Monitoring View (Read-Only)
            </span>
            <span className="text-[9.5px] font-mono font-bold text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded shrink-0">
              {user.role} · {hasGodMode(user) ? "EXEC" : user.level}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              openDesktopNotice(
                "Mobile Monitoring Mode (Read-Only)",
                "The ERP is running in Read-Only Monitoring Mode for your PBAC Role & Level. Switch to Desktop Mode to create or authorize records.",
              )
            }
            className="h-6 px-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-white text-[9.5px] font-bold inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
          >
            <Monitor className="w-3 h-3 text-amber-400" />
            <span>Desktop Mode</span>
          </button>
        </div>
      ) : isMobileViewport && isForceDesktopMode ? (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Monitor className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 truncate">
              Desktop View Active on Mobile
            </span>
          </div>
          <button
            type="button"
            onClick={disableForceDesktopMode}
            className="h-6 px-2.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[9.5px] font-bold inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
          >
            <Smartphone className="w-3 h-3" />
            <span>Back to Mobile App</span>
          </button>
        </div>
      ) : isMobileViewport && isExemptInteractiveRoute ? (
        <div className="bg-emerald-50/90 border-b border-emerald-200/80 px-3 py-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-900 truncate">
              Interactive Mobile Module Active (ESS & Messages)
            </span>
          </div>
          <Link
            to="/erp"
            className="text-[10px] font-extrabold text-emerald-700 hover:text-emerald-900 underline shrink-0"
          >
            Monitor Hub
          </Link>
        </div>
      ) : null}
    </div>
  );
});
