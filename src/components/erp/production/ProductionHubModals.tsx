import React, { memo } from "react";
import { Award, CheckCircle2, FileCheck2, Gauge, ArrowUpRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { cn } from "@/lib/utils";

interface ExecutionSummaryModalProps {
  executionSummaryModal: any | null;
  onClose: () => void;
  onViewFgr: () => void;
}

export const ExecutionSummaryModal = memo(function ExecutionSummaryModal({
  executionSummaryModal,
  onClose,
  onViewFgr,
}: ExecutionSummaryModalProps) {
  if (!executionSummaryModal) return null;

  const summary = executionSummaryModal.execution_summary;
  const calibration = summary?.factory_factor_calibration;

  const formatCalibrationPct = (val: any) => {
    const raw = Number(val ?? 85);
    return (raw > 1.5 ? raw : raw * 100).toFixed(1);
  };

  return (
    <Modal
      isOpen={Boolean(executionSummaryModal)}
      onClose={onClose}
      title="Post-Completion Execution Summary & Factory Factor Calibration"
      size="5xl"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={onViewFgr}
            className="bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold"
          >
            <FileCheck2 className="w-4 h-4 mr-1.5" />
            View &amp; Export FGR Document
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close Summary
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Top Banner */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-950">
                Production Closed &amp; Finished Goods Inbounded
              </h3>
              <p className="text-xs text-emerald-800 mt-0.5">
                FGR Number:{" "}
                <strong className="font-mono">{executionSummaryModal.fgr_number}</strong> • FG SKU:{" "}
                <strong className="font-mono">{executionSummaryModal.fg_sku}</strong> • Qty Inbounded:{" "}
                <strong className="font-mono">
                  {Number(executionSummaryModal.qty_inbounded || 0).toLocaleString()} PCS
                </strong>
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-emerald-700 border border-emerald-200 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5" /> ERP Inventory Updated
            </span>
          </div>
        </div>

        {/* Key Execution Metrics Grid */}
        {summary && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  Planned Duration
                </div>
                <div className="text-lg font-mono tabular-nums font-bold text-stone-900 mt-1">
                  {Number(summary.planned_duration_hours || 0).toFixed(1)}{" "}
                  <span className="text-xs font-normal text-stone-500">hrs</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  Actual Duration
                </div>
                <div className="text-lg font-mono tabular-nums font-bold text-stone-900 mt-1">
                  {Number(summary.actual_duration_hours || 0).toFixed(1)}{" "}
                  <span className="text-xs font-normal text-stone-500">hrs</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  First-Pass Yield (FPY)
                </div>
                <div className="text-lg font-mono tabular-nums font-bold text-emerald-700 mt-1">
                  {Number(summary.first_pass_yield_pct || 100).toFixed(1)}%
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                  NDP Downtime Logged
                </div>
                <div className="text-lg font-mono tabular-nums font-bold text-amber-700 mt-1">
                  {Number(summary.total_ndp_downtime_hours || 0).toFixed(1)}{" "}
                  <span className="text-xs font-normal text-stone-500">hrs</span>
                </div>
              </div>
            </div>

            {/* Factory Factor Weighted Moving Average Calibration Card */}
            {calibration && (
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-stone-700" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                      Factory Factor Auto-Calibration (Weighted Moving Average)
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-stone-700 bg-white px-2 py-0.5 rounded border border-stone-200">
                    {calibration.formula}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-stone-200">
                    <div className="text-[11px] text-stone-500">Previous Planned Factor</div>
                    <div className="text-base font-mono tabular-nums font-bold text-stone-800 mt-0.5">
                      {formatCalibrationPct(calibration.previous_factor ?? calibration.planned_ff)}%
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-stone-200">
                    <div className="text-[11px] text-stone-500">Project Achieved Efficiency</div>
                    <div className="text-base font-mono tabular-nums font-bold text-emerald-700 mt-0.5">
                      {formatCalibrationPct(
                        calibration.achieved_project_factor ?? calibration.achieved_ff
                      )}
                      %
                    </div>
                  </div>

                  <div className="bg-stone-100 border border-stone-200 text-stone-900 p-3 rounded-lg shadow-2xs">
                    <div className="text-[11px] text-stone-700 font-semibold">
                      New Calibrated Global WMA Factor
                    </div>
                    <div className="text-base font-mono tabular-nums font-bold mt-0.5 flex items-center gap-1.5 text-stone-900">
                      {formatCalibrationPct(
                        calibration.new_calibrated_wma_factor ?? calibration.new_wma_ff
                      )}
                      %
                      <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step-by-Step Variance Table */}
            {Array.isArray(summary.step_breakdown) && summary.step_breakdown.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                  Route Step Planned vs Actual Breakdown
                </h4>
                <div className="overflow-x-auto border border-stone-200 rounded-xl">
                  <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seq</TableHead>
                      <TableHead>Process Step</TableHead>
                      <TableHead className="text-right">Planned (Hrs)</TableHead>
                      <TableHead className="text-right">Actual (Hrs)</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.step_breakdown.map((st: any, idx: number) => {
                      const variance = Number(st.variance_hours || 0);
                      return (
                        <TableRow key={st.id || idx}>
                          <TableCell className="font-mono tabular-nums text-stone-500">
                            #{st.sequence || idx + 1}
                          </TableCell>
                          <TableCell className="font-medium text-stone-900">
                            {st.process_name}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-stone-700">
                            {Number(st.planned_hours || 0).toFixed(2)}h
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-stone-900 font-semibold">
                            {Number(st.actual_hours || 0).toFixed(2)}h
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-mono tabular-nums font-semibold",
                              variance > 0.1
                                ? "text-rose-600"
                                : variance < -0.1
                                  ? "text-emerald-600"
                                  : "text-stone-500"
                            )}
                          >
                            {variance > 0 ? `+${variance.toFixed(2)}h` : `${variance.toFixed(2)}h`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
});

interface FactoryFactorHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  ffHistoryData: any;
  factoryFactor: number;
}

export const FactoryFactorHistoryModal = memo(function FactoryFactorHistoryModal({
  isOpen,
  onClose,
  ffHistoryData,
  factoryFactor,
}: FactoryFactorHistoryModalProps) {
  if (!isOpen) return null;

  const currentWmaPct = (() => {
    const raw = Number(
      ffHistoryData?.current_wma_ff ??
        ffHistoryData?.current_wma_factor ??
        factoryFactor ??
        85
    );
    return `${(raw > 1.5 ? raw : raw * 100).toFixed(1)}%`;
  })();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Factory Factor Calibration History (Weighted Moving Average)"
      size="4xl"
    >
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-stone-500">
              Current Global Calibrated Factory Factor (WMA)
            </div>
            <div className="text-2xl font-mono tabular-nums font-bold text-emerald-700 mt-0.5">
              {currentWmaPct}
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Automatically calculated via Weighted Moving Average (WMA) of actual vs. planned
              execution hours across completed manufacturing projects.
            </p>
          </div>
          <Gauge className="w-10 h-10 text-stone-300 shrink-0" />
        </div>

        <div className="overflow-x-auto border border-stone-200 rounded-xl">
          <Table className="min-w-[620px]">
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Planned Hrs</TableHead>
              <TableHead className="text-right">Actual Hrs</TableHead>
              <TableHead className="text-right">Achieved</TableHead>
              <TableHead className="text-right">Calibrated WMA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.isArray(ffHistoryData?.history) && ffHistoryData.history.length > 0 ? (
              ffHistoryData.history.map((h: any) => {
                const rawAchieved = Number(h.achieved_ff ?? h.achieved_factor ?? 85);
                const rawNewWma = Number(h.new_wma_ff ?? h.new_wma_factor ?? 85);
                return (
                  <TableRow key={h.id}>
                    <TableCell>
                      <div className="font-semibold text-stone-900">
                        {h.project_code || h.project_id}
                      </div>
                      <div className="text-[11px] text-stone-500">{h.project_name}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {Number(h.planned_hours || 0).toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {Number(h.actual_hours || 0).toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-stone-700">
                      {(rawAchieved > 1.5 ? rawAchieved : rawAchieved * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-bold text-emerald-700">
                      {(rawNewWma > 1.5 ? rawNewWma : rawNewWma * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableEmpty
                colSpan={5}
                message="No completed project calibration history yet. WMA calibration records automatically upon project completion."
              />
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </Modal>
  );
});
