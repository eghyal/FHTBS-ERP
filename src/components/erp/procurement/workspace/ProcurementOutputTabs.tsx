import React from "react";
import {
  Send,
  Scale,
  CheckCircle2,
  Truck,
  Check,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatIDR } from "@/lib/utils";
import { CONFIDENTIAL_PRICE_MASK } from "@/utils/rbacFinancials";
import {
  MasterPrPreviewLine,
  ReconciliationRow,
} from "../MasterPrOutputPreviewModal";
import { PartialDeliveryValueChainPanel } from "../PartialDeliveryValueChainPanel";
import type { ManufacturingPriorityTier } from "../ProcurementPlanWorkspace";

export function addDaysClientIso(isoDate: string, days: number): string {
  const clean = String(isoDate || "").slice(0, 10);
  const d = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + days);
    return fallback.toISOString().split("T")[0];
  }
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function daysBetweenClientIso(startIso: string, endIso: string): number {
  const s = new Date(`${String(startIso || "").slice(0, 10)}T00:00:00Z`);
  const e = new Date(`${String(endIso || "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatStrategyLabel(mode?: string): string {
  if (mode === "BOP_PROCESS_SEQUENCE" || mode === "STATION_SEQUENCE") {
    return "BOP Station Sequence";
  }
  if (mode === "WOT_BATCH_CADENCE" || mode === "LOT_SPLITTING") {
    return "WOT Batch Cadence";
  }
  return "BOP Stage & WOT Lot";
}

export function formatPriorityLabel(tier?: string): string {
  if (tier === "CRITICAL_MAIN") return "Critical";
  if (tier === "SUPPORTING") return "Supporting";
  return "Core";
}

interface PrOutputScheduleTabProps {
  waves: any[];
  selectedWaveNumbers: number[];
  computedMasterPrSummary: {
    masterPrNumber: string;
    masterPrStatus: string;
    lines: MasterPrPreviewLine[];
  };
  canViewPrPrices: boolean;
  displayedSavedPlan: any;
  pushingPrWaveId: string | null;
  onPushWaveToPr: (planId: string, wave: any) => void;
}

export const PrOutputScheduleTab = React.memo<PrOutputScheduleTabProps>(
  ({
    waves,
    selectedWaveNumbers,
    computedMasterPrSummary,
    canViewPrPrices,
    displayedSavedPlan,
    pushingPrWaveId,
    onPushWaveToPr,
  }) => {
    const filteredWaves = React.useMemo(
      () =>
        waves.filter(
          (wave: any) =>
            selectedWaveNumbers.length === 0 ||
            selectedWaveNumbers.includes(Number(wave.wave_number)),
        ),
      [waves, selectedWaveNumbers],
    );

    return (
      <div className="divide-y divide-stone-200 dark:divide-stone-800">
        {filteredWaves.map((wave: any) => {
          const waveLines = computedMasterPrSummary.lines.filter(
            (l) => l.wave_number === Number(wave.wave_number),
          );
          const waveStatus = String(wave.status || "PLANNED");
          const isWaveSynced = waveStatus !== "PLANNED";

          return (
            <div key={`pr-output-wave-${wave.id || wave.wave_number}`}>
              <div className="bg-stone-50/70 dark:bg-stone-850/50 px-4 py-2 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold px-2 py-0.5 rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[11px]">
                    WAVE {wave.wave_number}
                  </span>
                  <span className="font-semibold text-stone-900 dark:text-stone-100">
                    {wave.station_focus}
                  </span>
                  {wave.wot_lot_range && (
                    <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400">
                      ({wave.wot_lot_range})
                    </span>
                  )}

                  {waveStatus === "GRN_RECEIVED" ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 font-mono text-[10px] font-bold">
                      GRN RECEIVED
                    </span>
                  ) : waveStatus === "PO_ISSUED" ? (
                    <span className="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-900 dark:text-sky-300 font-mono text-[10px] font-bold">
                      PO LINKED
                    </span>
                  ) : waveStatus === "PR_AUTHORIZED" ||
                    (isWaveSynced &&
                      computedMasterPrSummary.masterPrStatus ===
                        "AUTHORIZED") ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 font-mono text-[10px] font-bold">
                      PR AUTHORIZED
                    </span>
                  ) : isWaveSynced ? (
                    <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-mono text-[10px] font-bold">
                      DRAFT PR LINE SYNCED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono text-[10px] font-semibold">
                      UNSYNCED WAVE
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                  <span className="text-stone-600 dark:text-stone-400">
                    Order Release:{" "}
                    <strong className="text-stone-900 dark:text-stone-100">
                      {wave.target_order_date}
                    </strong>
                  </span>
                  <span className="text-stone-300 dark:text-stone-700">·</span>
                  <span className="text-stone-600 dark:text-stone-400">
                    PR Delivery ETA:{" "}
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {wave.target_arrival_date}
                    </strong>
                  </span>
                  <span className="text-stone-300 dark:text-stone-700">·</span>
                  <span className="text-stone-600 dark:text-stone-400">
                    Wave Subtotal:{" "}
                    <strong className="text-stone-900 dark:text-stone-100">
                      {canViewPrPrices
                        ? formatIDR(wave.estimated_cost || 0)
                        : CONFIDENTIAL_PRICE_MASK}
                    </strong>
                  </span>

                  {displayedSavedPlan && (
                    <Button
                      size="xs"
                      variant={isWaveSynced ? "secondary" : "primary"}
                      isLoading={pushingPrWaveId === wave.id}
                      leftIcon={<Send className="w-3 h-3" />}
                      onClick={() =>
                        onPushWaveToPr(displayedSavedPlan.id, wave)
                      }
                    >
                      {isWaveSynced
                        ? "Update Wave in Master PR"
                        : "Sync Wave to Master PR"}
                    </Button>
                  )}
                </div>
              </div>

              <Table className="border-0 rounded-none shadow-none">
                <TableHeader>
                  <TableRow hoverable={false}>
                    <TableHead>PR Schedule Line</TableHead>
                    <TableHead>Material Code &amp; Spec</TableHead>
                    <TableHead>BOP Card / Station</TableHead>
                    <TableHead>Preferred Supplier</TableHead>
                    <TableHead className="text-right">
                      PR Delivery Date
                    </TableHead>
                    <TableHead className="text-right">
                      Wave Split Qty
                    </TableHead>
                    <TableHead className="text-right">
                      Est. Line Cost
                    </TableHead>
                    <TableHead className="text-right">Line Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waveLines.map((line, lIdx) => (
                    <TableRow key={line.id || lIdx}>
                      <TableCell className="font-mono text-xs font-bold text-stone-700 dark:text-stone-300">
                        <div>{computedMasterPrSummary.masterPrNumber}</div>
                        <div className="text-[10px] text-stone-500">
                          Line W{line.wave_number}.
                          {String(lIdx + 1).padStart(2, "0")}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="font-mono font-bold text-stone-900 dark:text-stone-100 text-xs">
                          {line.item_code} — {line.item_name}
                        </div>
                        {line.spec && (
                          <div className="text-[11px] text-stone-500 dark:text-stone-400">
                            {line.spec}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        {line.product_node_name ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-mono text-[11px] font-bold">
                            Card {line.product_node_name}
                          </span>
                        ) : (
                          <span className="text-xs text-stone-700 dark:text-stone-300">
                            {line.station_focus}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-xs font-medium text-stone-800 dark:text-stone-200">
                        {line.preferred_supplier_name ||
                          "Open / Purchasing Selection"}
                      </TableCell>

                      <TableCell className="text-right font-mono tabular-nums text-xs">
                        <div className="font-bold text-emerald-800 dark:text-emerald-400">
                          {line.expected_delivery_date}
                        </div>
                        {line.production_need_date && (
                          <div className="text-[10px] text-stone-500">
                            BOP Need: {line.production_need_date}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-mono tabular-nums text-xs">
                        <div className="font-bold text-stone-900 dark:text-stone-100">
                          {line.allocated_wave_qty.toLocaleString("en-US")}{" "}
                          {line.uom}
                        </div>
                        {line.baseline_required_qty &&
                          line.baseline_required_qty >
                            line.allocated_wave_qty && (
                            <div className="text-[10px] text-stone-500">
                              of{" "}
                              {line.baseline_required_qty.toLocaleString(
                                "en-US",
                              )}{" "}
                              {line.uom} total
                            </div>
                          )}
                      </TableCell>

                      <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-stone-900 dark:text-stone-100">
                        {canViewPrPrices
                          ? formatIDR(line.subtotal_cost || 0)
                          : CONFIDENTIAL_PRICE_MASK}
                      </TableCell>

                      <TableCell className="text-right font-mono text-[11px]">
                        {line.line_status === "PO_LINKED" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-900 dark:text-sky-300 font-bold">
                            {line.po_number || "PO LINKED"}
                          </span>
                        ) : line.line_status === "GRN_RECEIVED" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 font-bold">
                            GRN RECEIVED
                          </span>
                        ) : line.line_status === "PR_AUTHORIZED" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                            AUTHORIZED PR
                          </span>
                        ) : line.line_status === "PR_DRAFTED" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold">
                            DRAFT PR
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                            UNSYNCED
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
      </div>
    );
  },
);
PrOutputScheduleTab.displayName = "PrOutputScheduleTab";

interface ReconciliationMatrixTabProps {
  computedReconciliationMatrix: ReconciliationRow[];
  isRebalancingQty: boolean;
  onRebalanceQuantities: () => void;
}

export const ReconciliationMatrixTab = React.memo<ReconciliationMatrixTabProps>(
  ({
    computedReconciliationMatrix,
    isRebalancingQty,
    onRebalanceQuantities,
  }) => {
    const hasUnbalanced = React.useMemo(
      () => computedReconciliationMatrix.some((r) => !r.is_balanced),
      [computedReconciliationMatrix],
    );

    return (
      <div>
        <div className="px-4 py-2.5 bg-stone-50/70 dark:bg-stone-850/40 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="text-stone-600 dark:text-stone-400">
            Audits each material&apos;s{" "}
            <strong className="text-stone-900 dark:text-stone-100">
              Initial BOM / PR Baseline Requirement
            </strong>{" "}
            against the sum of its{" "}
            <strong className="text-stone-900 dark:text-stone-100">
              Wave-Split Allocations
            </strong>{" "}
            to guarantee zero under-procurement or over-ordering.
          </div>

          <Button
            size="xs"
            variant={hasUnbalanced ? "primary" : "outline"}
            isLoading={isRebalancingQty}
            leftIcon={<Scale className="w-3.5 h-3.5" />}
            onClick={onRebalanceQuantities}
          >
            Normalize All Wave Splits to 100% Baseline
          </Button>
        </div>

        <Table className="border-0 rounded-none shadow-none">
          <TableHeader>
            <TableRow hoverable={false}>
              <TableHead>Material Code &amp; Name</TableHead>
              <TableHead>BOP Card</TableHead>
              <TableHead className="text-right">
                Initial Baseline Qty
              </TableHead>
              <TableHead>Wave-Split Breakdown</TableHead>
              <TableHead className="text-right">Total Wave Sum</TableHead>
              <TableHead className="text-right">Variance (Δ)</TableHead>
              <TableHead className="text-right">Audit Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {computedReconciliationMatrix.map((row) => (
              <TableRow key={row.item_code}>
                <TableCell>
                  <div className="font-mono font-bold text-stone-900 dark:text-stone-100 text-xs">
                    {row.item_code}
                  </div>
                  <div className="text-xs text-stone-600 dark:text-stone-400">
                    {row.item_name}
                  </div>
                </TableCell>

                <TableCell>
                  {row.product_node_name ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-mono text-[11px] font-bold">
                      Card {row.product_node_name}
                    </span>
                  ) : (
                    <span className="text-xs text-stone-500">BOP Direct</span>
                  )}
                </TableCell>

                <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-stone-900 dark:text-stone-100">
                  {row.baseline_required_qty.toLocaleString("en-US")}{" "}
                  <span className="font-normal text-stone-500">{row.uom}</span>
                </TableCell>

                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.wave_splits.map((ws, idx) => (
                      <span
                        key={`${row.item_code}-w${ws.wave_number}-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 font-mono text-[11px] text-stone-800 dark:text-stone-200"
                      >
                        <strong className="text-stone-900 dark:text-stone-100">
                          W{ws.wave_number}:
                        </strong>{" "}
                        {ws.allocated_qty.toLocaleString("en-US")} {row.uom}
                        <span className="text-[10px] text-stone-500">
                          ({ws.target_arrival_date})
                        </span>
                      </span>
                    ))}
                  </div>
                </TableCell>

                <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-stone-900 dark:text-stone-100">
                  {row.total_allocated_qty.toLocaleString("en-US")}{" "}
                  <span className="font-normal text-stone-500">{row.uom}</span>
                </TableCell>

                <TableCell className="text-right font-mono tabular-nums text-xs font-bold">
                  {row.is_balanced ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      0 {row.uom}
                    </span>
                  ) : (
                    <span
                      className={
                        row.variance_qty < 0
                          ? "text-rose-700 dark:text-rose-400"
                          : "text-amber-700 dark:text-amber-400"
                      }
                    >
                      {row.variance_qty > 0
                        ? `+${row.variance_qty}`
                        : row.variance_qty}{" "}
                      {row.uom}
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right font-mono text-[11px]">
                  {row.is_balanced ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                      <CheckCircle2 className="w-3 h-3" />
                      BALANCED
                    </span>
                  ) : row.variance_qty < 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold">
                      UNDER-ALLOCATED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold">
                      OVER-ALLOCATED
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  },
);
ReconciliationMatrixTab.displayName = "ReconciliationMatrixTab";

interface WaveItemEditorTabProps {
  waves: any[];
  selectedWaveNumbers: number[];
  suppliers: any[];
  canViewPrPrices: boolean;
  displayedSavedPlan: any;
  pushingPrWaveId: string | null;
  onPushWaveToPr: (planId: string, wave: any) => void;
  onItemVendorChange: (
    waveNumber: number,
    itemIndex: number,
    item: any,
    supplierId: string,
  ) => void;
  onWaveItemQtyChange: (
    waveNumber: number,
    itemIndex: number,
    newQty: number,
  ) => void;
}

export const WaveItemEditorTab = React.memo<WaveItemEditorTabProps>(
  ({
    waves,
    selectedWaveNumbers,
    suppliers,
    canViewPrPrices,
    displayedSavedPlan,
    pushingPrWaveId,
    onPushWaveToPr,
    onItemVendorChange,
    onWaveItemQtyChange,
  }) => {
    const filteredWaves = React.useMemo(
      () =>
        waves.filter(
          (wave: any) =>
            selectedWaveNumbers.length === 0 ||
            selectedWaveNumbers.includes(Number(wave.wave_number)),
        ),
      [waves, selectedWaveNumbers],
    );

    return (
      <div className="divide-y divide-stone-200 dark:divide-stone-800">
        {filteredWaves.map((wave: any) => {
          const isWavePushedOrExecuted =
            wave.status && wave.status !== "PLANNED";

          return (
            <div key={wave.id || `wave-table-${wave.wave_number}`}>
              <div className="bg-stone-50/50 dark:bg-stone-850/40 px-4 py-2 border-b border-stone-100 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                    Wave {wave.wave_number}
                  </span>
                  <span className="text-stone-300 dark:text-stone-700">·</span>
                  <span className="font-semibold text-stone-800 dark:text-stone-200">
                    {wave.station_focus}
                  </span>
                  {wave.bop_process_summary && (
                    <span className="font-mono text-[11px] text-amber-900 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                      {wave.bop_process_summary}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 font-mono text-xs">
                  <span>
                    Delivery:{" "}
                    <strong className="text-emerald-800 dark:text-emerald-400">
                      {wave.target_arrival_date}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Cost:{" "}
                    <strong className="text-stone-900 dark:text-stone-100">
                      {canViewPrPrices
                        ? formatIDR(wave.estimated_cost || 0)
                        : CONFIDENTIAL_PRICE_MASK}
                    </strong>
                  </span>

                  {displayedSavedPlan && (
                    <Button
                      size="xs"
                      variant={isWavePushedOrExecuted ? "secondary" : "primary"}
                      isLoading={pushingPrWaveId === wave.id}
                      leftIcon={<Send className="w-3 h-3" />}
                      onClick={() =>
                        onPushWaveToPr(displayedSavedPlan.id, wave)
                      }
                    >
                      {isWavePushedOrExecuted
                        ? "Update Wave in Master PR"
                        : "Sync Wave to Master PR"}
                    </Button>
                  )}
                </div>
              </div>

              <Table className="border-0 rounded-none shadow-none">
                <TableHeader>
                  <TableRow hoverable={false}>
                    <TableHead>Item Code &amp; Name</TableHead>
                    <TableHead>BOP Product Card</TableHead>
                    <TableHead>BOP Priority</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Lead Time</TableHead>
                    <TableHead className="text-right">
                      Planned Delivery
                    </TableHead>
                    <TableHead className="text-right">Wave Qty</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(wave.items || []).map((it: any, idx: number) => {
                    const priorityVal: ManufacturingPriorityTier =
                      it.priority_tier === "CRITICAL_MAIN" ||
                      it.priority_tier === "SUPPORTING"
                        ? it.priority_tier
                        : "CORE_PROCESS";

                    return (
                      <TableRow key={it.id || `${wave.wave_number}-${idx}`}>
                        <TableCell>
                          <div className="font-mono font-bold text-stone-900 dark:text-stone-100 text-xs">
                            {it.item_code} — {it.item_name}
                          </div>
                          <div className="text-[11px] text-stone-500 dark:text-stone-400">
                            {[it.source_pr_number, it.dimension, it.spec]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </TableCell>

                        <TableCell>
                          {it.product_node_name ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-mono text-[11px] font-bold">
                              Card {it.product_node_name}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-700 dark:text-stone-300">
                              {it.process_step_name || "Manufacturing"}
                            </span>
                          )}
                        </TableCell>

                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${
                              priorityVal === "CRITICAL_MAIN"
                                ? "bg-amber-50/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                                : priorityVal === "SUPPORTING"
                                  ? "bg-stone-100/60 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700"
                                  : "bg-sky-50/60 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800"
                            }`}
                          >
                            {formatPriorityLabel(priorityVal)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <select
                            value={
                              it.preferred_supplier_id ||
                              suppliers[0]?.id ||
                              ""
                            }
                            onChange={(e) =>
                              onItemVendorChange(
                                wave.wave_number,
                                idx,
                                it,
                                e.target.value,
                              )
                            }
                            className="no-base-style h-7 px-2 text-xs bg-white dark:bg-stone-850 border border-stone-300 dark:border-stone-700 rounded text-stone-800 dark:text-stone-200 max-w-[170px]"
                          >
                            {suppliers.length === 0 && (
                              <option value="">Default Supplier</option>
                            )}
                            {suppliers.map((sup) => (
                              <option key={sup.id} value={sup.id}>
                                {sup.name}
                              </option>
                            ))}
                          </select>
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
                          {Number(it.lead_time_days || 4)}d
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums text-xs">
                          <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                            {wave.target_arrival_date}
                          </span>
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums font-bold text-stone-900 dark:text-stone-100">
                          {!displayedSavedPlan ? (
                            <div className="inline-flex items-center justify-end">
                              <div className="flex h-7 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-850 overflow-hidden focus-within:border-stone-500">
                                <input
                                  type="number"
                                  min={0.01}
                                  step="any"
                                  value={it.allocated_wave_qty}
                                  onChange={(e) =>
                                    onWaveItemQtyChange(
                                      wave.wave_number,
                                      idx,
                                      Number(e.target.value),
                                    )
                                  }
                                  className="no-base-style w-16 px-2 text-right font-mono text-xs bg-transparent text-stone-900 dark:text-stone-100 outline-none border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="inline-flex items-center px-1.5 bg-stone-100 dark:bg-stone-800 border-l border-stone-200 dark:border-stone-700 text-[10px] font-mono text-stone-500 dark:text-stone-400">
                                  {it.uom}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs">
                              {Number(it.allocated_wave_qty).toLocaleString(
                                "en-US",
                              )}{" "}
                              {it.uom}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums">
                          <div className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                            {canViewPrPrices
                              ? formatIDR(it.subtotal_cost || 0)
                              : CONFIDENTIAL_PRICE_MASK}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          );
        })}
      </div>
    );
  },
);
WaveItemEditorTab.displayName = "WaveItemEditorTab";

interface PartialDeliveryChainTabProps {
  displayedSavedPlan: any;
  selectedWaveNumbers: number[];
  isSaving: boolean;
  onSavePlan: () => void;
  onDataUpdated: () => void;
}

export const PartialDeliveryChainTab =
  React.memo<PartialDeliveryChainTabProps>(
    ({
      displayedSavedPlan,
      selectedWaveNumbers,
      isSaving,
      onSavePlan,
      onDataUpdated,
    }) => {
      return (
        <div className="p-4">
          {displayedSavedPlan ? (
            <PartialDeliveryValueChainPanel
              planId={displayedSavedPlan.id}
              selectedWaveNumbers={selectedWaveNumbers}
              onDataUpdated={onDataUpdated}
            />
          ) : (
            <div className="bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 rounded-xl p-6 text-center space-y-3">
              <Truck className="w-7 h-7 text-indigo-600 dark:text-indigo-400 mx-auto" />
              <div className="text-xs font-bold text-stone-900 dark:text-stone-100">
                Submit Strategy to Activate End-to-End WOT Partial Delivery
                &amp; Flexible Customer Invoicing
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-lg mx-auto">
                Once you click <strong>Submit Strategy</strong>, each
                Procurement Wave is bound to its WOT Lot Batch so QC can release
                Finished Goods per wave, Logistics can issue Partial Delivery
                Orders (DO), and Finance can bill either per Partial DO or
                consolidated at the end.
              </p>
              <Button
                size="sm"
                variant="primary"
                isLoading={isSaving}
                leftIcon={<Check className="w-3.5 h-3.5" />}
                onClick={onSavePlan}
              >
                Submit Strategy Now
              </Button>
            </div>
          )}
        </div>
      );
    },
  );
PartialDeliveryChainTab.displayName = "PartialDeliveryChainTab";

interface ProcurementRevisionReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  revisionNoteInput: string;
  onChangeRevisionNote: (val: string) => void;
  isRequestingRevision: boolean;
  onConfirmRevision: () => void;
}

export const ProcurementRevisionReturnModal =
  React.memo<ProcurementRevisionReturnModalProps>(
    ({
      isOpen,
      onClose,
      revisionNoteInput,
      onChangeRevisionNote,
      isRequestingRevision,
      onConfirmRevision,
    }) => {
      return (
        <Modal
          isOpen={isOpen}
          onClose={onClose}
          title="Return Strategy & Master PR for Revision"
          description="PROCUREMENT GOVERNANCE · REVISION WORKFLOW"
          maxWidth="lg"
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2 w-full">
              <Button size="sm" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                isLoading={isRequestingRevision}
                onClick={onConfirmRevision}
              >
                Confirm Return for Revision
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
              This will mark both the Master PR in Requisition Queue and this
              Procurement Wave Plan as <strong>REVISION</strong> so the planner
              can adjust wave schedules or quantities and resubmit.
            </p>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                Revision Note / Instructions
              </label>
              <textarea
                rows={3}
                value={revisionNoteInput}
                onChange={(e) => onChangeRevisionNote(e.target.value)}
                placeholder="e.g., Please split Wave 1 into 2 smaller waves to reduce initial cash outlay..."
                className="input-elegant w-full p-2.5 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-850 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
              />
            </div>
          </div>
        </Modal>
      );
    },
  );
ProcurementRevisionReturnModal.displayName = "ProcurementRevisionReturnModal";
