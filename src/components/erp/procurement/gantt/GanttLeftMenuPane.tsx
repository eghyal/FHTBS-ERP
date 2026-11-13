import React from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Layers,
  Lock,
  Package,
  RotateCcw,
  Unlock,
  Wallet,
} from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { ConfidentialBadge } from "@/components/shared/ConfidentialBadge";
import type { WaveBottleneckMetric } from "../WaveBottleneckInsightPanel";
import type {
  CashflowSummaryData,
  EffectiveWaveDates,
  WaveGanttRow,
} from "./ganttTypes";
import { daysDiff, formatShortDate } from "./ganttDateUtils";

interface GanttLeftMenuPaneProps {
  leftPanelWidthPx: number;
  leftPanelScrollRef: React.RefObject<HTMLDivElement | null>;
  onWheelSync: (deltaY: number) => void;
  isLocked: boolean;
  waves: WaveGanttRow[];
  totalWavesCount: number;
  liveMetrics: WaveBottleneckMetric[];
  getEffectiveWaveDates: (w: WaveGanttRow) => EffectiveWaveDates;
  selectedWaveNumbers: number[];
  onWaveSelectionClick: (e: React.MouseEvent, waveNum: number) => void;
  expandedWaveNums: Record<number, boolean>;
  onToggleWaveExpand: (waveNum: number) => void;
  lockedWaveNumbers: number[];
  onToggleLockWave: (waveNum: number) => void;
  cashflowSummary: CashflowSummaryData;
  showCashflowStrip: boolean;
  canSeeFinancials: boolean;
  onResetFilters: () => void;
}

export const GanttLeftMenuPane: React.FC<GanttLeftMenuPaneProps> = ({
  leftPanelWidthPx,
  leftPanelScrollRef,
  onWheelSync,
  isLocked,
  waves,
  totalWavesCount,
  liveMetrics,
  getEffectiveWaveDates,
  selectedWaveNumbers,
  onWaveSelectionClick,
  expandedWaveNums,
  onToggleWaveExpand,
  lockedWaveNumbers,
  onToggleLockWave,
  cashflowSummary,
  showCashflowStrip,
  canSeeFinancials,
  onResetFilters,
}) => {
  return (
    <div
      style={{ width: `${leftPanelWidthPx}px` }}
      className="shrink-0 flex flex-col bg-white dark:bg-stone-900 border-r border-stone-200 dark:border-stone-800 z-30 select-none overflow-hidden"
      onWheel={(e) => onWheelSync(e.deltaY)}
    >
      {/* Left Header Partition (h-[50px] matching Tier 1 + Tier 2) */}
      <div className="h-[50px] shrink-0 border-b border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 px-3.5 flex items-center justify-between text-[11px] select-none">
        <span className="font-sans font-bold text-stone-800 dark:text-stone-200 truncate">
          Wave, BOP Station &amp; Handover
        </span>
        <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500 font-normal shrink-0 ml-2">
          {isLocked ? "Baseline" : "Select · Lock"}
        </span>
      </div>

      {/* Left Scrollable Rows Body */}
      <div
        ref={leftPanelScrollRef}
        className="flex-1 overflow-y-hidden overflow-x-hidden divide-y divide-stone-200/80 dark:divide-stone-800"
      >
        {waves.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-xs font-semibold text-stone-600 dark:text-stone-300">
              No waves match the active search or bottleneck filter.
            </p>
            {totalWavesCount > 0 && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-[11px] font-semibold text-stone-700 dark:text-stone-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Show All ({totalWavesCount}) Waves</span>
              </button>
            )}
          </div>
        ) : (
          waves.map((wave) => {
            const metric = !isLocked
              ? liveMetrics.find((m) => m.waveNumber === wave.wave_number)
              : null;
            const eff = getEffectiveWaveDates(wave);
            const isDragging = eff.isDragging;
            const isSelected = selectedWaveNumbers.includes(wave.wave_number);
            const isRowLocked = lockedWaveNumbers.includes(wave.wave_number);
            const orderDate = eff.orderDate;
            const arrivalDate = eff.arrivalDate;
            const prodNeedDate = wave.production_need_date || arrivalDate;
            const procDurationDays = Math.max(1, daysDiff(orderDate, arrivalDate));
            const handoverGapDays = daysDiff(arrivalDate, prodNeedDate);
            const isExpanded = Boolean(expandedWaveNums[wave.wave_number]);
            const severity = metric?.severity || "OPTIMAL";

            const waveBudgetShare =
              cashflowSummary.totalBudget > 0
                ? Math.round(
                    (Number(wave.estimated_cost || 0) /
                      cashflowSummary.totalBudget) *
                      100,
                  )
                : 0;

            return (
              <div key={wave.id || `left-wave-${wave.wave_number}`}>
                {/* Primary Wave Summary Card (h-[96px]) */}
                <div
                  onClick={(e) => onWaveSelectionClick(e, wave.wave_number)}
                  className={`h-[96px] min-h-[96px] p-3 flex flex-col justify-between gap-1.5 transition-colors cursor-pointer ${
                    isDragging
                      ? "bg-amber-50/70 dark:bg-amber-950/35"
                      : isSelected
                        ? "bg-indigo-50/75 dark:bg-indigo-950/40 ring-1 ring-inset ring-indigo-400/60"
                        : isRowLocked
                          ? "bg-stone-100/70 dark:bg-stone-850/60"
                          : isExpanded
                            ? "bg-stone-50/90 dark:bg-stone-850/70"
                            : !isLocked && severity === "CRITICAL"
                              ? "bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50/50 dark:hover:bg-rose-950/30"
                              : "hover:bg-stone-50/60 dark:hover:bg-stone-850/40"
                  }`}
                >
                  {/* Line 1: Checkbox, [W#], Row Lock Button, Station Focus, Handover Badge */}
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        onClick={(e) => onWaveSelectionClick(e, wave.wave_number)}
                        className="w-3.5 h-3.5 rounded border-stone-300 dark:border-stone-700 accent-indigo-600 cursor-pointer shrink-0"
                        title="Select Wave for batch shift or lock"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleWaveExpand(wave.wave_number);
                        }}
                        className="inline-flex items-center gap-0.5 font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-700 shrink-0 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer"
                        title="Expand/Collapse BOM items"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-stone-500" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-stone-500" />
                        )}
                        <span>W{wave.wave_number}</span>
                      </button>

                      {!isLocked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLockWave(wave.wave_number);
                          }}
                          className={`p-1 rounded border transition-colors shrink-0 cursor-pointer ${
                            isRowLocked
                              ? "bg-amber-100 dark:bg-amber-950/80 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                              : "bg-white dark:bg-stone-850 border-stone-200 dark:border-stone-700 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                          }`}
                          title={
                            isRowLocked
                              ? `Wave ${wave.wave_number} is Locked (Protected from drag & batch shifts) — Click to unlock`
                              : `Lock Wave ${wave.wave_number} schedule`
                          }
                        >
                          {isRowLocked ? (
                            <Lock className="w-3 h-3" />
                          ) : (
                            <Unlock className="w-3 h-3" />
                          )}
                        </button>
                      )}

                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                        {wave.station_focus}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-stone-400 dark:text-stone-500 shrink-0">
                        ({wave.items?.length || 0})
                      </span>
                    </div>

                    {/* Handover / Late Severity Badge */}
                    {isLocked ? (
                      <span className="font-mono text-[10px] tabular-nums text-stone-500 dark:text-stone-400 shrink-0">
                        Dur {procDurationDays}d
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold tabular-nums shrink-0 border ${
                          severity === "CRITICAL"
                            ? "bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                            : severity === "WARNING"
                              ? "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                              : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                        }`}
                      >
                        {severity === "CRITICAL" && (
                          <AlertTriangle className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400" />
                        )}
                        {handoverGapDays < 0
                          ? `${handoverGapDays}d Overlap`
                          : `+${handoverGapDays}d Handover`}
                      </span>
                    )}
                  </div>

                  {/* Line 2: BOP Process Summary & Procurement Duration vs Max LT */}
                  <div className="flex items-center justify-between gap-2 text-[11px] text-stone-600 dark:text-stone-400 min-w-0">
                    <div className="flex items-center gap-1.5 truncate">
                      <Layers className="w-3 h-3 text-stone-400 shrink-0" />
                      <span className="truncate font-medium">
                        {wave.bop_process_summary}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] tabular-nums text-stone-500 dark:text-stone-400 shrink-0">
                      Dur <strong className="text-stone-800 dark:text-stone-200">{procDurationDays}d</strong> (LT {wave.max_lead_time_days || 4}d)
                    </span>
                  </div>

                  {/* Line 3: Order -> Deliv -> BOP & Outlay */}
                  <div className="flex items-center justify-between text-[10.5px] font-mono tabular-nums text-stone-500 dark:text-stone-400 border-t border-stone-100 dark:border-stone-800/80 pt-1.5">
                    <div className="flex items-center gap-1 truncate">
                      <span>
                        <strong className="text-stone-700 dark:text-stone-300">
                          {formatShortDate(orderDate)}
                        </strong>
                      </span>
                      <span>→</span>
                      <span>
                        <strong className="text-emerald-700 dark:text-emerald-400">
                          {formatShortDate(arrivalDate)}
                        </strong>
                      </span>
                      <span>→</span>
                      <span>
                        BOP{" "}
                        <strong
                          className={
                            isLocked
                              ? "text-stone-700 dark:text-stone-300"
                              : "text-indigo-700 dark:text-indigo-300"
                          }
                        >
                          {formatShortDate(prodNeedDate)}
                        </strong>
                      </span>
                    </div>
                    <div className="text-[10px] shrink-0 ml-1">
                      <strong className="text-stone-800 dark:text-stone-200">
                        {canSeeFinancials ? (
                          formatIDR(wave.estimated_cost || 0)
                        ) : (
                          <ConfidentialBadge />
                        )}
                      </strong>
                      <span className="text-stone-400 ml-0.5">
                        ({waveBudgetShare}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded Items Sub-Rows in Left Pane (h-10 each) */}
                {isExpanded && (wave.items || []).length > 0 && (
                  <div className="divide-y divide-stone-100 dark:divide-stone-800/70 bg-stone-50/70 dark:bg-stone-900/50 border-t border-stone-200/70 dark:border-stone-800">
                    {(wave.items || []).map((it, idx) => {
                      const itemLt = Math.max(1, Number(it.lead_time_days || 4));
                      const isCriticalDriver =
                        itemLt >= Number(wave.max_lead_time_days || 4);

                      return (
                        <div
                          key={it.id || `${wave.wave_number}-left-sub-${idx}`}
                          className="h-10 min-h-[40px] pl-8 pr-3 py-1 flex flex-col justify-center gap-0.5 hover:bg-stone-100/60 dark:hover:bg-stone-800/40 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Package className="w-3 h-3 text-stone-400 shrink-0" />
                              <span className="font-mono font-bold text-[11px] text-stone-800 dark:text-stone-200 truncate">
                                {it.item_code} — {it.item_name}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] font-bold tabular-nums text-stone-700 dark:text-stone-300 shrink-0">
                              {Number(it.allocated_wave_qty).toLocaleString(
                                "en-US",
                              )}{" "}
                              {it.uom}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-stone-500 dark:text-stone-400">
                            <div className="flex items-center gap-1.5 truncate">
                              <span>
                                {it.preferred_supplier_name || "Assigned Vendor"}
                              </span>
                              <span>·</span>
                              <span
                                className={
                                  isCriticalDriver
                                    ? "text-amber-700 dark:text-amber-400 font-bold"
                                    : ""
                                }
                              >
                                LT {itemLt}d
                                {isCriticalDriver ? " (Driver)" : ""}
                              </span>
                            </div>

                            <span>
                              {canSeeFinancials ? (
                                formatIDR(it.subtotal_cost || 0)
                              ) : (
                                <ConfidentialBadge />
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Left Cashflow Summary Block (h-16) */}
        {showCashflowStrip && waves.length > 0 && (
          <div className="h-16 min-h-[64px] border-t-2 border-stone-200 dark:border-stone-800 bg-stone-100/80 dark:bg-stone-900/90 px-4 py-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Wave Cashflow Commitment</span>
              </span>
              <span className="font-mono text-[10px] font-bold tabular-nums text-stone-700 dark:text-stone-300">
                {waves.length} Windows
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
              <span className="text-stone-500 dark:text-stone-400">
                Total Planned Outlay:
              </span>
              <strong className="text-stone-900 dark:text-stone-100">
                {canSeeFinancials ? (
                  formatIDR(cashflowSummary.totalBudget)
                ) : (
                  <ConfidentialBadge />
                )}
              </strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
