import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import {
  WaveBottleneckInsightPanel,
  WaveBottleneckMetric,
} from "../WaveBottleneckInsightPanel";

interface ProcurementBottleneckStripProps {
  liveBottleneckMetrics: WaveBottleneckMetric[];
  computedWavesCount: number;
  masterStartDate?: string | null;
  masterEndDate?: string | null;
  earliestFeasibleStart?: string | null;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onAutoRealignFeasible: () => void;
  onResetDatesToBaseline: () => void;
}

export const ProcurementBottleneckStrip: React.FC<
  ProcurementBottleneckStripProps
> = ({
  liveBottleneckMetrics,
  computedWavesCount,
  masterStartDate,
  masterEndDate,
  earliestFeasibleStart,
  isExpanded,
  onToggleExpanded,
  onAutoRealignFeasible,
  onResetDatesToBaseline,
}) => {
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden shadow-2xs">
      <div
        onClick={onToggleExpanded}
        className="px-3.5 py-2 flex items-center justify-between cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-850 select-none transition-colors"
      >
        <div className="flex items-center gap-2.5 text-xs">
          {liveBottleneckMetrics.some((m) => m.severity === "CRITICAL") ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              Material Starvation Risk Detected
            </span>
          ) : liveBottleneckMetrics.some((m) => m.severity === "WARNING") ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              Compressed Handover Buffer
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Optimal Alignment ({computedWavesCount} Waves Aligned)
            </span>
          )}
          <span className="hidden md:inline text-stone-500 dark:text-stone-400 font-mono text-[11px] tabular-nums">
            T0 Horizon: {masterStartDate?.slice(0, 10) || "Open"} →{" "}
            {masterEndDate?.slice(0, 10) || "Open"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100">
          <span>
            {isExpanded ? "Hide Details" : "View Bottleneck Diagnostics"}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-stone-200 dark:border-stone-800 p-4">
          <WaveBottleneckInsightPanel
            metrics={liveBottleneckMetrics}
            masterStartDate={masterStartDate}
            masterEndDate={masterEndDate}
            earliestFeasibleStart={earliestFeasibleStart}
            onAutoRealignFeasible={onAutoRealignFeasible}
            onResetDatesToBaseline={onResetDatesToBaseline}
          />
        </div>
      )}
    </div>
  );
};
