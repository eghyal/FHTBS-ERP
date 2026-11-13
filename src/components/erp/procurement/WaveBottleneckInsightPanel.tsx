import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface WaveBottleneckMetric {
  waveNumber: number;
  stationFocus: string;
  orderDate: string;
  arrivalDate: string;
  effectiveArrivalDate: string;
  bopStartDate: string;
  slackDays: number;
  isBottleneck: boolean;
  severity: "CRITICAL" | "WARNING" | "OPTIMAL";
  reason: string;
  itemsCount: number;
}

interface WaveBottleneckInsightPanelProps {
  metrics: WaveBottleneckMetric[];
  masterStartDate?: string | null;
  masterEndDate?: string | null;
  earliestFeasibleStart?: string | null;
  onResetDatesToBaseline?: () => void;
  onAutoRealignFeasible?: () => void;
}

export const WaveBottleneckInsightPanel: React.FC<
  WaveBottleneckInsightPanelProps
> = ({
  metrics,
  masterStartDate,
  masterEndDate: _masterEndDate,
  earliestFeasibleStart,
  onResetDatesToBaseline,
  onAutoRealignFeasible,
}) => {
  if (!metrics || metrics.length === 0) return null;

  const criticalList = metrics.filter((m) => m.severity === "CRITICAL");
  const warningList = metrics.filter((m) => m.severity === "WARNING");
  const optimalList = metrics.filter((m) => m.severity === "OPTIMAL");

  const isDelayed = criticalList.length > 0;
  const isCompressed = !isDelayed && warningList.length > 0;
  const maxDelay = metrics.reduce(
    (max, m) => (m.slackDays < 0 ? Math.max(max, Math.abs(m.slackDays)) : max),
    0
  );

  return (
    <div
      className={`rounded-xl border transition-all p-4 sm:p-5 space-y-4 ${
        isDelayed
          ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900"
          : isCompressed
          ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900"
          : "bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800"
      }`}
    >
      {/* Top Banner / Verdict */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3.5 border-b border-stone-200/80 dark:border-stone-800">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-2xs border ${
              isDelayed
                ? "bg-rose-100 dark:bg-rose-900/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                : isCompressed
                ? "bg-amber-100 dark:bg-amber-900/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                : "bg-emerald-100 dark:bg-emerald-900/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
            }`}
          >
            {isDelayed ? (
              <AlertTriangle className="w-5 h-5" />
            ) : isCompressed ? (
              <Clock className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
          </div>

          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                Live Bottleneck Insight
              </span>
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  isDelayed
                    ? "bg-rose-100 dark:bg-rose-950/80 text-rose-900 dark:text-rose-300 border-rose-300 dark:border-rose-800"
                    : isCompressed
                    ? "bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                    : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                }`}
              >
                {isDelayed
                  ? `MATERIAL STARVATION RISK (+${maxDelay}d LATE)`
                  : isCompressed
                  ? "LEAD-TIME BUFFER COMPRESSED"
                  : "OPTIMAL PROCUREMENT ALIGNMENT"}
              </span>
            </div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              {isDelayed
                ? `${criticalList.length} station(s) face delayed delivery pushing past BOP scheduled start.`
                : isCompressed
                ? `Materials arrive on schedule, but ${warningList.length} wave(s) have thin safety buffers.`
                : "All material delivery dates align seamlessly with vendor lead times and station start dates."}
            </h3>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {onResetDatesToBaseline && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={onResetDatesToBaseline}
              className="h-8 px-2.5 rounded-lg text-xs font-semibold gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset to Baseline
            </Button>
          )}
          {onAutoRealignFeasible && (isDelayed || isCompressed) && (
            <Button
              type="button"
              size="xs"
              variant={isDelayed ? "danger" : "primary"}
              onClick={onAutoRealignFeasible}
              className="h-8 px-3 rounded-lg text-xs font-semibold gap-1.5"
            >
              <span>
                Auto-Realign Schedule
                {earliestFeasibleStart ? ` (${earliestFeasibleStart})` : ""}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* 3-Column Diagnostic Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Metric 1: Timeline Horizon Alignment */}
        <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <span>Master Schedule Alignment</span>
            <Activity className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="text-xs font-bold font-mono text-stone-900 dark:text-stone-100">
            T0 Start: {masterStartDate || "Unscheduled"}
          </div>
          <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-normal">
            {earliestFeasibleStart ? (
              <>
                Earliest feasible start without starvation is{" "}
                <strong className="font-mono text-stone-900 dark:text-stone-100">
                  {earliestFeasibleStart}
                </strong>
                .
              </>
            ) : (
              "Production schedule is safe across all supplier lead times."
            )}
          </p>
        </div>

        {/* Metric 2: Process Contention & Starvation Points */}
        <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <span>Wave Arrival Health</span>
            <span className="font-mono text-xs font-bold text-stone-900 dark:text-stone-100">
              {optimalList.length} / {metrics.length} On Track
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-rose-700 dark:text-rose-400 font-semibold">
              {criticalList.length} Late
            </span>
            <span>·</span>
            <span className="text-amber-700 dark:text-amber-400 font-semibold">
              {warningList.length} Tight
            </span>
            <span>·</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              {optimalList.length} Optimal
            </span>
          </div>
          <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-normal">
            {criticalList.length > 0
              ? `Wave ${criticalList.map((c) => `W${c.waveNumber}`).join(", ")} requires lead time adjustment.`
              : "All fabrication stations receive material buffers ahead of scheduled start."}
          </p>
        </div>

        {/* Metric 3: Lead-Time Buffer Slack */}
        <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <span>Staged Floor Buffer</span>
            <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="text-xs font-bold font-mono text-stone-900 dark:text-stone-100">
            {isDelayed
              ? `Slack Deficit: -${maxDelay}d`
              : "Staged JIT Arrival"}
          </div>
          <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-normal">
            Waves are paced to minimize warehouse congestion while ensuring continuous line feeding.
          </p>
        </div>
      </div>

      {/* Detailed Point Breakdown for Affected Waves */}
      {criticalList.length > 0 && (
        <div className="p-3 rounded-lg bg-rose-100/50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900 space-y-2">
          <div className="text-xs font-bold text-rose-950 dark:text-rose-200 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>Bottleneck Hotspots (Rescheduling Required):</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {criticalList.map((m) => (
              <div
                key={`bottleneck-w-${m.waveNumber}`}
                className="p-2.5 rounded-md bg-white dark:bg-stone-900 border border-rose-200 dark:border-rose-800 text-xs space-y-1"
              >
                <div className="flex items-center justify-between font-mono font-bold">
                  <span className="text-stone-900 dark:text-stone-100">Wave {m.waveNumber}</span>
                  <span className="text-rose-700 dark:text-rose-400">+{Math.abs(m.slackDays)}d Late</span>
                </div>
                <div className="text-[11px] text-stone-600 dark:text-stone-400 truncate">
                  Station: <strong className="text-stone-800 dark:text-stone-200">{m.stationFocus}</strong>
                </div>
                <div className="text-[10px] font-mono text-stone-500 dark:text-stone-400 flex justify-between pt-1 border-t border-stone-100 dark:border-stone-800">
                  <span>Feasible Deliv: {m.effectiveArrivalDate}</span>
                  <span>BOP Need: {m.bopStartDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
