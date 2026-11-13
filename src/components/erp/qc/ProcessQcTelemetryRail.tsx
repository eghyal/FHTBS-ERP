import React, { memo } from "react";
import {
  ShieldCheck,
  Printer,
  Award,
  TrendingUp,
  Lock,
  CheckCircle2,
  AlertOctagon,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn, formatIDR } from "@/lib/utils";
import { QcProjectItem, QcProcessSummary } from "./qcTypes";

interface ProcessQcTopKpiStripProps {
  summary: QcProcessSummary;
}

export const ProcessQcTopKpiStrip = memo(function ProcessQcTopKpiStrip({
  summary,
}: ProcessQcTopKpiStripProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      <div className="bg-white border border-stone-200/80 rounded-2xl px-4 py-3 shadow-2xs flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
            First Pass Yield (FPY)
          </span>
          <span className="font-mono tabular-nums text-lg font-black text-emerald-700 mt-0.5 block">
            {summary.overall_fpy_pct}%
          </span>
        </div>
        <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-600 shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
      </div>

      <div className="bg-white border border-stone-200/80 rounded-2xl px-4 py-3 shadow-2xs flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
            FAI Steps Approved
          </span>
          <span className="font-mono tabular-nums text-lg font-black text-stone-900 mt-0.5 block">
            {summary.fai_approved_bop_count}{" "}
            <span className="text-xs font-semibold text-stone-400">
              / {summary.total_bop_steps_count} Steps
            </span>
          </span>
        </div>
        <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200/70 flex items-center justify-center text-stone-700 shrink-0">
          <CheckCircle2 className="w-4 h-4" />
        </div>
      </div>

      <div className="bg-white border border-stone-200/80 rounded-2xl px-4 py-3 shadow-2xs flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
            Active Open NCR
          </span>
          <span
            className={cn(
              "font-mono tabular-nums text-lg font-black mt-0.5 block",
              summary.open_ncr_count > 0 ? "text-rose-600" : "text-emerald-700"
            )}
          >
            {summary.open_ncr_count}{" "}
            <span className="text-xs font-semibold text-stone-400">
              / {summary.total_ncr_count} Total
            </span>
          </span>
        </div>
        <div
          className={cn(
            "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
            summary.open_ncr_count > 0
              ? "bg-rose-50 border-rose-200/70 text-rose-600"
              : "bg-stone-100 border-stone-200/70 text-stone-500"
          )}
        >
          <AlertOctagon className="w-4 h-4" />
        </div>
      </div>

      <div className="bg-white border border-stone-200/80 rounded-2xl px-4 py-3 shadow-2xs flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
            Est. Cost of Poor Quality
          </span>
          <span className="font-mono tabular-nums text-base font-black text-amber-700 mt-0.5 block truncate">
            {formatIDR(summary.total_copq)}
          </span>
        </div>
        <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600 shrink-0">
          <Coins className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
});

interface ProcessQcTelemetryRailProps {
  projects: QcProjectItem[];
  selectedProject: QcProjectItem | null;
  onSelectProject: (projectId: string) => void;
  stationAnalytics: any[];
  isSubmitting: boolean;
  onAuthorizeFgr: (proj: QcProjectItem) => void;
  onOpenFgrCertificate: (proj: QcProjectItem) => void;
}

export const ProcessQcTelemetryRail = memo(function ProcessQcTelemetryRail({
  projects,
  selectedProject,
  onSelectProject,
  stationAnalytics,
  isSubmitting,
  onAuthorizeFgr,
  onOpenFgrCertificate,
}: ProcessQcTelemetryRailProps) {
  return (
    <div className="lg:col-span-4 space-y-4">
      {/* Manufacturing Project Quality Gate Selector */}
      <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-2xs">
        <div className="px-4 py-3 border-b border-stone-200/80 bg-stone-50/70 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Work Order Quality Gate Queue
            </h3>
            <p className="text-[11px] text-stone-500">
              Select a work order to inspect BOP steps or release FGR
            </p>
          </div>
          <Badge variant="neutral" className="font-mono tabular-nums">
            {projects.length}
          </Badge>
        </div>

        <div className="divide-y divide-stone-100 max-h-[380px] overflow-y-auto p-2 space-y-1.5">
          {projects.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-500">
              No manufacturing projects available.
            </div>
          ) : (
            projects.map((proj) => {
              const isSelected = selectedProject?.id === proj.id;
              const isCompleted = proj.status === "COMPLETED";
              const allFaiDone =
                proj.total_bop_steps === 0 ||
                proj.fai_completed_count >= proj.total_bop_steps;
              const canReleaseFgr = proj.open_ncr_count === 0 && allFaiDone;
              const faiPct =
                proj.total_bop_steps > 0
                  ? Math.round(
                      (proj.fai_completed_count / proj.total_bop_steps) * 100
                    )
                  : 100;

              return (
                <div
                  key={proj.id}
                  onClick={() => onSelectProject(proj.id)}
                  className={cn(
                    "p-3.5 rounded-xl border transition-all cursor-pointer",
                    isSelected
                      ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-600/20 shadow-2xs"
                      : "bg-white hover:bg-stone-50/80 border-stone-200/70"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono tabular-nums text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-800 border border-stone-200">
                          {proj.spk_number || proj.id}
                        </span>
                        {proj.open_ncr_count > 0 ? (
                          <Badge variant="danger">
                            {proj.open_ncr_count} NCR
                          </Badge>
                        ) : !allFaiDone ? (
                          <Badge variant="warning">FAI Pending</Badge>
                        ) : (
                          <Badge variant="success">Pass Gate</Badge>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-stone-900 mt-1.5 truncate">
                        {proj.name}
                      </h4>
                      <p className="text-[11px] text-stone-500 truncate">
                        {proj.customer_name || "Internal Order"} ·{" "}
                        <span className="font-mono tabular-nums font-semibold text-stone-700">
                          {Number(proj.qty || 1).toLocaleString()}{" "}
                          {proj.uom || "PCS"}
                        </span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono tabular-nums text-[10px] font-bold text-stone-600 block">
                        FAI {proj.fai_completed_count}/{proj.total_bop_steps}
                      </span>
                      <div className="w-16 h-1.5 bg-stone-200 rounded-sm overflow-hidden mt-1">
                        <div
                          className="h-full bg-emerald-600 rounded-sm transition-all"
                          style={{ width: `${faiPct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    className="mt-2.5 pt-2 border-t border-stone-200/60 flex items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[10px] font-mono tabular-nums text-stone-500">
                      {isCompleted && proj.fgr_number
                        ? `FGR: ${proj.fgr_number}`
                        : !allFaiDone
                          ? `Gate: ${proj.total_bop_steps - proj.fai_completed_count} FAI Needed`
                          : `Status: ${proj.status}`}
                    </span>
                    {isCompleted ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onOpenFgrCertificate(proj)}
                        leftIcon={<Printer className="w-3 h-3" />}
                      >
                        FGR Cert
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        variant={canReleaseFgr ? "primary" : "secondary"}
                        disabled={isSubmitting || !canReleaseFgr}
                        onClick={() => onAuthorizeFgr(proj)}
                        title={
                          !canReleaseFgr
                            ? proj.open_ncr_count > 0
                              ? `Resolve ${proj.open_ncr_count} open NCR(s) first`
                              : "Complete FAI on all BOP steps before releasing FGR"
                            : "Authorize Finished Goods Release"
                        }
                        leftIcon={
                          canReleaseFgr ? (
                            <Award className="w-3 h-3" />
                          ) : (
                            <Lock className="w-3 h-3" />
                          )
                        }
                        className={cn(
                          canReleaseFgr &&
                            "bg-emerald-700 hover:bg-emerald-800 text-white"
                        )}
                      >
                        Release FGR
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Workstation First Pass Yield (FPY %) & COPQ Scorecard */}
      <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-2xs">
        <div className="px-4 py-3 border-b border-stone-200/80 bg-stone-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Station FPY &amp; COPQ Scorecard
            </h3>
          </div>
          <span className="text-[10px] font-mono tabular-nums text-stone-500">
            {stationAnalytics.length} Stations
          </span>
        </div>

        <div className="divide-y divide-stone-100 max-h-[240px] overflow-y-auto">
          {stationAnalytics.length === 0 ? (
            <div className="p-6 text-center text-xs text-stone-500">
              No station quality metrics recorded yet.
            </div>
          ) : (
            stationAnalytics.map((st) => (
              <div key={st.station_name} className="p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-stone-900">
                    {st.station_name}
                  </span>
                  <div className="flex items-center gap-2">
                    {st.open_ncr > 0 && (
                      <span className="text-[10px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                        {st.open_ncr} NCR
                      </span>
                    )}
                    <span
                      className={cn(
                        "font-mono tabular-nums text-xs font-black",
                        st.fpy_pct >= 95
                          ? "text-emerald-700"
                          : st.fpy_pct >= 85
                            ? "text-amber-700"
                            : "text-rose-700"
                      )}
                    >
                      {st.fpy_pct}% FPY
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-stone-100 rounded-sm overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-sm",
                      st.fpy_pct >= 95
                        ? "bg-emerald-600"
                        : st.fpy_pct >= 85
                          ? "bg-amber-500"
                          : "bg-rose-600"
                    )}
                    style={{ width: `${Math.min(100, st.fpy_pct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-stone-500">
                  <span>
                    Pass {st.total_passed}/{st.total_sample} · Defect{" "}
                    {st.total_defect}
                  </span>
                  <span>COPQ: {formatIDR(Number(st.copq || 0))}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});
