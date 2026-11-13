import React from "react";
import { Calendar, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatIDR } from "@/lib/utils";
import type { ManufacturingStrategyMode } from "../ProcurementPlanWorkspace";

interface ProcurementStandingRibbonProps {
  projectName?: string;
  spkNumber?: string | null;
  displayedSavedPlan?: {
    id: string;
    plan_code?: string;
  } | null;
  masterStartDate?: string | null;
  masterEndDate?: string | null;
  isHorizonDrifted: boolean;
  isSyncingMasterDates: boolean;
  onSyncWaveDatesToMaster: (planId: string) => void;
  strategyMode: ManufacturingStrategyMode;
  activeStrategyMode?: ManufacturingStrategyMode;
  formatStrategyLabel: (mode: ManufacturingStrategyMode) => string;
  targetOrderQty: number;
  totalWotLots: number;
  masterLotSize: number;
  criticalItemsTotal: number;
  coreItemsTotal: number;
  supportingItemsTotal: number;
  mrpSummary?: {
    gross_bom_total_qty?: number;
    warehouse_free_usable_qty?: number;
    project_allocated_qty?: number;
  } | null;
  totalLotQty: number;
  computedWavesCount: number;
  totalEstimatedBudget: number;
  leadTimeBufferDays: number;
}

export const ProcurementStandingRibbon: React.FC<
  ProcurementStandingRibbonProps
> = ({
  projectName,
  spkNumber,
  displayedSavedPlan,
  masterStartDate,
  masterEndDate,
  isHorizonDrifted,
  isSyncingMasterDates,
  onSyncWaveDatesToMaster,
  strategyMode,
  activeStrategyMode,
  formatStrategyLabel,
  targetOrderQty,
  totalWotLots,
  masterLotSize,
  criticalItemsTotal,
  coreItemsTotal,
  supportingItemsTotal,
  mrpSummary,
  totalLotQty,
  computedWavesCount,
  totalEstimatedBudget,
  leadTimeBufferDays,
}) => {
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden shadow-2xs">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 dark:divide-stone-800">
        {/* Col 1: Work Order & Master Horizon */}
        <div className="p-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Work Order Horizon
            </span>
            {displayedSavedPlan ? (
              <span className="font-mono text-[10px] text-stone-600 dark:text-stone-400 inline-flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-stone-400" />
                {displayedSavedPlan.plan_code}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                Active Strategy
              </span>
            )}
          </div>
          <div className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
            {projectName}
            {spkNumber && (
              <span className="font-mono text-stone-500 dark:text-stone-400 font-normal ml-1.5 tabular-nums">
                ({spkNumber})
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] font-mono tabular-nums text-stone-600 dark:text-stone-400">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3 text-stone-400" />
              {masterStartDate
                ? `${String(masterStartDate).slice(0, 10)} → ${
                    masterEndDate
                      ? String(masterEndDate).slice(0, 10)
                      : "Open"
                  }`
                : "Unscheduled"}
            </span>
            {displayedSavedPlan && isHorizonDrifted && (
              <Button
                size="xs"
                variant="secondary"
                isLoading={isSyncingMasterDates}
                leftIcon={<RefreshCw className="w-3 h-3" />}
                onClick={() => onSyncWaveDatesToMaster(displayedSavedPlan.id)}
              >
                Sync T0
              </Button>
            )}
          </div>
        </div>

        {/* Col 2: Production WOT Lot & Cadence */}
        <div className="p-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              WOT Lot Cadence
            </span>
            <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400">
              {formatStrategyLabel(activeStrategyMode || strategyMode)}
            </span>
          </div>
          <div className="text-xs font-bold font-mono tabular-nums text-stone-900 dark:text-stone-100">
            {targetOrderQty.toLocaleString("en-US")} pcs{" "}
            <span className="font-normal text-stone-500 dark:text-stone-400">
              ({totalWotLots} lots @ {masterLotSize} pcs)
            </span>
          </div>
          <div className="text-[11px] font-mono tabular-nums text-stone-600 dark:text-stone-400 pt-0.5">
            BOP Priority:{" "}
            <strong className="text-stone-900 dark:text-stone-100">
              {criticalItemsTotal} Critical
            </strong>{" "}
            · {coreItemsTotal} Core · {supportingItemsTotal} Supp
          </div>
        </div>

        {/* Col 3: MRP Stock Netting */}
        <div className="p-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              MRP Stock Netting
            </span>
            <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
              Verified
            </span>
          </div>
          {mrpSummary ? (
            <>
              <div className="text-xs font-mono tabular-nums text-stone-900 dark:text-stone-100">
                Net Wave Qty:{" "}
                <strong className="font-bold">
                  {Number(totalLotQty || 0).toLocaleString("en-US")} u
                </strong>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-stone-600 dark:text-stone-400 pt-0.5">
                Gross BOM{" "}
                <strong className="text-stone-800 dark:text-stone-200">
                  {Number(mrpSummary.gross_bom_total_qty || 0).toLocaleString(
                    "en-US",
                  )}
                </strong>{" "}
                − Stock{" "}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {Number(
                    (mrpSummary.warehouse_free_usable_qty || 0) +
                      (mrpSummary.project_allocated_qty || 0),
                  ).toLocaleString("en-US")}
                </strong>
              </div>
            </>
          ) : (
            <div className="text-xs font-mono tabular-nums text-stone-700 dark:text-stone-300">
              Total Scheduled:{" "}
              <strong>{Number(totalLotQty || 0).toLocaleString("en-US")} u</strong>
            </div>
          )}
        </div>

        {/* Col 4: Wave Schedule & Budget */}
        <div className="p-3 space-y-1 bg-stone-50/50 dark:bg-stone-850/50">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Wave Plan &amp; Budget
            </span>
            <span className="font-mono text-[10px] font-bold tabular-nums text-stone-900 dark:text-stone-100">
              {computedWavesCount} Wave{computedWavesCount > 1 ? "s" : ""}
            </span>
          </div>
          <div className="text-sm font-bold font-mono tabular-nums text-stone-900 dark:text-stone-100">
            {formatIDR(totalEstimatedBudget || 0)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-stone-500 dark:text-stone-400 pt-0.5">
            Handover Target: {leadTimeBufferDays}d before BOP station
          </div>
        </div>
      </div>
    </div>
  );
};
