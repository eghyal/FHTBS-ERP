import React from "react";
import {
  Check,
  Compass,
  Filter,
  Lock,
  Maximize2,
  Minimize2,
  Sparkles,
  Unlock,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ManufacturingStrategyMode } from "../ProcurementPlanWorkspace";

interface GanttCommandBarProps {
  isLocked: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  projectName?: string;
  spkNumber?: string | null;
  totalWavesCount: number;
  visibleWavesCount: number;
  optimalCount: number;
  criticalCount: number;
  warningCount: number;
  onActivateStrategyPlanning?: () => void;
  onAutoRealignSchedule?: () => void;
  onSavePlan?: () => void;
  isSaving?: boolean;
  submitStrategyLabel?: string;
  strategyMode: ManufacturingStrategyMode;
  onStrategyModeChange?: (mode: ManufacturingStrategyMode) => void;
  wotLotsPerWave: number;
  totalWotLots: number;
  onWotLotsPerWaveChange?: (lots: number) => void;
  leadTimeBufferDays: number;
  onLeadTimeBufferDaysChange?: (days: number) => void;
  selectedWaveNumbers: number[];
  onClearSelectedWaves: () => void;
  onBatchShiftWaves: (deltaDays: number) => void;
  lockedWaveNumbers: number[];
  onUnlockAllWaves: () => void;
  searchQuery: string;
  onClearSearch: () => void;
  onlyBottlenecks: boolean;
  onToggleOnlyBottlenecks: () => void;
}

export const GanttCommandBar: React.FC<GanttCommandBarProps> = ({
  isLocked,
  isFullscreen,
  onToggleFullscreen,
  projectName,
  spkNumber,
  totalWavesCount,
  visibleWavesCount,
  optimalCount,
  criticalCount,
  warningCount,
  onActivateStrategyPlanning,
  onAutoRealignSchedule,
  onSavePlan,
  isSaving = false,
  submitStrategyLabel = "Submit Strategy",
  strategyMode,
  onStrategyModeChange,
  wotLotsPerWave,
  totalWotLots,
  onWotLotsPerWaveChange,
  leadTimeBufferDays,
  onLeadTimeBufferDaysChange,
  selectedWaveNumbers,
  onClearSelectedWaves,
  onBatchShiftWaves,
  lockedWaveNumbers,
  onUnlockAllWaves,
  searchQuery,
  onClearSearch,
  onlyBottlenecks,
  onToggleOnlyBottlenecks,
}) => {
  const hasActiveFilter = Boolean(searchQuery.trim()) || onlyBottlenecks;

  return (
    <>
      {/* 1. TOP COMMAND HEADER */}
      <div className="px-4 py-2.5 bg-stone-50 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {isLocked ? (
            <Lock className="w-4 h-4 text-stone-400 shrink-0" />
          ) : (
            <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          )}
          <div className="flex items-center gap-2 flex-wrap min-w-0 text-xs">
            <span className="font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider whitespace-nowrap">
              {isLocked ? "Baseline Schedule" : "GANTT Workspace"}
            </span>
            {projectName && (
              <>
                <span className="text-stone-300 dark:text-stone-700">·</span>
                <span className="font-semibold text-stone-700 dark:text-stone-300 truncate max-w-xs">
                  {projectName}
                </span>
              </>
            )}
            {spkNumber && (
              <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                ({spkNumber})
              </span>
            )}
            <span className="text-stone-300 dark:text-stone-700">·</span>
            <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
              {hasActiveFilter
                ? `${visibleWavesCount}/${totalWavesCount} Waves`
                : `${totalWavesCount} Waves`}
              {!isLocked && (
                <>
                  {" · "}
                  <span
                    className={
                      criticalCount > 0
                        ? "text-rose-600 dark:text-rose-400 font-bold"
                        : warningCount > 0
                          ? "text-amber-600 dark:text-amber-400 font-bold"
                          : "text-emerald-700 dark:text-emerald-400"
                    }
                  >
                    {optimalCount}/{totalWavesCount} Optimal
                    {criticalCount > 0 ? ` (${criticalCount} Late)` : ""}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isLocked && onActivateStrategyPlanning && (
            <Button
              type="button"
              size="xs"
              variant="primary"
              onClick={onActivateStrategyPlanning}
              leftIcon={<Sparkles className="w-3.5 h-3.5" />}
              className="text-xs font-semibold whitespace-nowrap"
            >
              Make Strategy Planning
            </Button>
          )}

          {!isLocked && onAutoRealignSchedule && criticalCount > 0 && (
            <Button
              type="button"
              size="xs"
              variant="danger"
              onClick={onAutoRealignSchedule}
              leftIcon={<Wand2 className="w-3.5 h-3.5" />}
              className="text-xs font-semibold whitespace-nowrap"
              title="Automatically realign unlocked wave order & arrival dates to resolve starvation bottlenecks"
            >
              Auto-Realign ({criticalCount} Late)
            </Button>
          )}

          {isFullscreen && !isLocked && onSavePlan && (
            <Button
              type="button"
              size="xs"
              variant="primary"
              isLoading={isSaving}
              onClick={onSavePlan}
              leftIcon={<Check className="w-3.5 h-3.5" />}
              className="text-xs font-semibold whitespace-nowrap"
            >
              {submitStrategyLabel}
            </Button>
          )}

          <button
            type="button"
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-850 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen Mode"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 2. STREAMLINED STRATEGY, STEPPERS & ACTIVE STATUS BAR */}
      {!isLocked && (
        <div className="px-4 py-2 bg-stone-100/70 dark:bg-stone-850/70 border-b border-stone-200/80 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          {/* Left: Strategy Select, Lots/Wave Stepper, Buffer Stepper */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 whitespace-nowrap">
                Strategy:
              </span>
              <select
                value={strategyMode}
                onChange={(e) =>
                  onStrategyModeChange?.(
                    e.target.value as ManufacturingStrategyMode,
                  )
                }
                className="no-base-style h-7 px-2.5 text-xs bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-md font-semibold text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500 cursor-pointer"
              >
                <option value="BOP_STAGE_AND_WOT_LOT">
                  BOP Stage &amp; WOT Lot (Balanced)
                </option>
                <option value="BOP_PROCESS_SEQUENCE">
                  BOP Station Sequence (JIT Critical)
                </option>
                <option value="WOT_BATCH_CADENCE">
                  WOT Batch Cadence (Staged Cashflow)
                </option>
              </select>
            </div>

            <span className="text-stone-300 dark:text-stone-700">·</span>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 whitespace-nowrap">
                Lots/Wave:
              </span>
              <div className="inline-flex items-stretch h-7 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  disabled={
                    strategyMode === "BOP_PROCESS_SEQUENCE" ||
                    wotLotsPerWave <= 1
                  }
                  onClick={() =>
                    onWotLotsPerWaveChange?.(Math.max(1, wotLotsPerWave - 1))
                  }
                  className="px-1.5 text-xs font-mono font-bold text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Decrease Lots per Wave"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, totalWotLots)}
                  disabled={strategyMode === "BOP_PROCESS_SEQUENCE"}
                  value={
                    strategyMode === "BOP_PROCESS_SEQUENCE"
                      ? totalWotLots
                      : wotLotsPerWave
                  }
                  onChange={(e) =>
                    onWotLotsPerWaveChange?.(
                      Math.max(
                        1,
                        Math.min(
                          Math.max(1, totalWotLots),
                          Number(e.target.value) || 1,
                        ),
                      ),
                    )
                  }
                  className="no-base-style w-9 text-center text-xs font-mono font-bold tabular-nums bg-transparent text-stone-900 dark:text-stone-100 outline-none border-x border-stone-200 dark:border-stone-700 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  disabled={
                    strategyMode === "BOP_PROCESS_SEQUENCE" ||
                    wotLotsPerWave >= Math.max(1, totalWotLots)
                  }
                  onClick={() =>
                    onWotLotsPerWaveChange?.(
                      Math.min(Math.max(1, totalWotLots), wotLotsPerWave + 1),
                    )
                  }
                  className="px-1.5 text-xs font-mono font-bold text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Increase Lots per Wave"
                >
                  +
                </button>
                <span className="inline-flex items-center px-1.5 bg-stone-100 dark:bg-stone-850 border-l border-stone-200 dark:border-stone-700 text-[10px] font-mono tabular-nums text-stone-500 dark:text-stone-400 select-none">
                  /{totalWotLots}
                </span>
              </div>
            </div>

            <span className="text-stone-300 dark:text-stone-700">·</span>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 whitespace-nowrap">
                Handover Target:
              </span>
              <div className="inline-flex items-stretch h-7 rounded-md border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 overflow-hidden shadow-2xs">
                <button
                  type="button"
                  disabled={leadTimeBufferDays <= 1}
                  onClick={() =>
                    onLeadTimeBufferDaysChange?.(
                      Math.max(1, leadTimeBufferDays - 1),
                    )
                  }
                  className="px-1.5 text-xs font-mono font-bold text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Decrease Target Handover Buffer"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={21}
                  value={leadTimeBufferDays}
                  onChange={(e) =>
                    onLeadTimeBufferDaysChange?.(
                      Math.max(1, Math.min(21, Number(e.target.value) || 3)),
                    )
                  }
                  className="no-base-style w-8 text-center text-xs font-mono font-bold tabular-nums bg-transparent text-stone-900 dark:text-stone-100 outline-none border-x border-stone-200 dark:border-stone-700 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  disabled={leadTimeBufferDays >= 21}
                  onClick={() =>
                    onLeadTimeBufferDaysChange?.(
                      Math.min(21, leadTimeBufferDays + 1),
                    )
                  }
                  className="px-1.5 text-xs font-mono font-bold text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Increase Target Handover Buffer"
                >
                  +
                </button>
                <span className="inline-flex items-center px-1.5 bg-stone-100 dark:bg-stone-850 border-l border-stone-200 dark:border-stone-700 text-[10px] font-mono text-stone-500 dark:text-stone-400 select-none">
                  d
                </span>
              </div>
            </div>

            {/* Active Filter / Row Lock Indicators */}
            {lockedWaveNumbers.length > 0 && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[10.5px] font-mono text-amber-800 dark:text-amber-300">
                <Lock className="w-3 h-3 shrink-0" />
                <span>{lockedWaveNumbers.length} Locked</span>
                <button
                  type="button"
                  onClick={onUnlockAllWaves}
                  className="ml-1 text-[10px] font-sans font-semibold underline hover:text-amber-950 cursor-pointer"
                  title="Unlock all locked wave rows"
                >
                  Unlock All
                </button>
              </div>
            )}

            {onlyBottlenecks && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[10.5px] font-mono text-rose-800 dark:text-rose-300">
                <Filter className="w-3 h-3 shrink-0" />
                <span>Bottlenecks Only</span>
                <button
                  type="button"
                  onClick={onToggleOnlyBottlenecks}
                  className="ml-0.5 hover:text-rose-950 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {searchQuery.trim() && (
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[10.5px] font-mono text-indigo-800 dark:text-indigo-300">
                <span>Search: &ldquo;{searchQuery}&rdquo;</span>
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="ml-0.5 hover:text-indigo-950 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Right: Multi-wave selection shift buttons if selected, otherwise two-tier track legend */}
          {selectedWaveNumbers.length > 0 ? (
            <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-md">
              <span className="font-mono text-[10.5px] font-bold text-indigo-900 dark:text-indigo-200 tabular-nums">
                {selectedWaveNumbers.length} Selected (
                {selectedWaveNumbers.map((n) => `W${n}`).join(", ")})
              </span>
              <div className="inline-flex items-center gap-1 ml-1">
                {[-3, -1, 1, 3].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onBatchShiftWaves(d)}
                    className="px-1.5 py-0.5 rounded bg-white dark:bg-stone-900 border border-indigo-200 dark:border-indigo-700 text-[10px] font-mono font-bold tabular-nums text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
                    title={`Shift selected unlocked waves by ${d > 0 ? `+${d}` : d} days`}
                  >
                    {d > 0 ? `+${d}d` : `${d}d`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onClearSelectedWaves}
                className="ml-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[10.5px] text-stone-500 dark:text-stone-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-emerald-600 inline-block" />
                <span>Top: Procurement Duration</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs border border-dashed border-emerald-600 bg-emerald-500/15 inline-block" />
                <span>Mid: Handover Gap</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2 rounded-xs bg-indigo-600 inline-block" />
                <span>Bottom: BOP Plan</span>
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
};
