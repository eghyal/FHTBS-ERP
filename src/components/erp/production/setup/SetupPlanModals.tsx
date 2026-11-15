import React from "react";
import { GitFork, Activity } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { BopEngineeringEditor } from "@/components/erp/BopEditor";
import { cn } from "@/lib/utils";
import { ProcessConfigRow } from "./ProcessRouteConfigTable";

interface SetupPlanModalsProps {
  projectId: string;
  project: any;
  user: any;
  startDate: string;
  lotSize: number;
  shiftHours: number;
  factoryFactor: number;
  interStationBufferMins: number;
  processConfigs: ProcessConfigRow[];
  stationClusters: any[];
  stations: any[];
  activeMachines: any[];
  scheduleInsight: any;
  showBopEditorModal: boolean;
  setShowBopEditorModal: (show: boolean) => void;
  showPreviewPlanModal: boolean;
  setShowPreviewPlanModal: (show: boolean) => void;
  onRefresh: (silent?: boolean) => void;
}

export const SetupPlanModals: React.FC<SetupPlanModalsProps> = React.memo(({
  projectId,
  project,
  user,
  startDate,
  lotSize,
  shiftHours,
  factoryFactor,
  interStationBufferMins,
  processConfigs,
  stationClusters,
  stations,
  activeMachines,
  scheduleInsight,
  showBopEditorModal,
  setShowBopEditorModal,
  showPreviewPlanModal,
  setShowPreviewPlanModal,
  onRefresh,
}) => {
  return (
    <>
      {/* MODAL: INTEGRATED BOP WORKSTATION & PROCESS ROUTE VIEWER */}
      {showBopEditorModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-stone-50 border border-stone-200 rounded-2xl w-full max-w-[96vw] h-[92dvh] flex flex-col overflow-hidden shadow-2xl">
            <div className="bg-white border-b border-stone-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <GitFork className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-stone-900 truncate">
                    Bill of Process (BOP) Route &amp; Workstations Viewer — [{project?.spk_number || projectId}] {project?.name}
                  </h3>
                  <p className="text-xs text-stone-500 truncate">
                    Read-only interactive technical flowchart and routing authored by Engineering Division.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onRefresh(false);
                    setShowBopEditorModal(false);
                  }}
                >
                  Close Viewer
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <BopEngineeringEditor
                projectId={projectId}
                project={project}
                readOnly={true}
                onRefreshProject={() => onRefresh(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL: READ-ONLY PRODUCTION PLAN PREVIEW */}
      <Modal
        isOpen={showPreviewPlanModal}
        onClose={() => setShowPreviewPlanModal(false)}
        maxWidth="7xl"
        title={
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-stone-900 uppercase tracking-tight">
                  Production Execution &amp; Orchestration Plan
                </h3>
                <span className="text-[10px] font-mono text-stone-500">
                  · Read-Only Preview
                </span>
              </div>
              <p className="text-xs text-stone-500 truncate">
                [{project?.spk_number || projectId}] {project?.name} · {scheduleInsight.targetQty} {project?.uom || "PCS"} ({scheduleInsight.totalLots} WOTs × {lotSize} pcs)
              </p>
            </div>
          </div>
        }
        contentClassName="p-0 flex flex-col min-h-0 bg-stone-50"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-[11px] font-mono text-stone-500">
              Read-Only Schedule &amp; Routing Preview
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowPreviewPlanModal(false)}
            >
              Close
            </Button>
          </div>
        }
      >
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs text-stone-800">
          {/* 01. PLANNED PRODUCTION GANTT & PIPELINE SCHEDULE */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-bold uppercase tracking-wider text-stone-800">
                  01. Planned Production Gantt &amp; Pipeline Schedule
                </span>
                <span className="text-[10px] font-mono text-stone-500">
                  ({startDate} → {scheduleInsight.estimatedFinishDate})
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono text-stone-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-600 inline-block" />
                  Critical Path
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
                  Pipelined Flow
                </span>
                <span>·</span>
                <span>NTP Deadline: <strong>{scheduleInsight.ntpDeadlineDate}</strong></span>
              </div>
            </div>

            {(() => {
              const maxWotEf = Math.max(1, scheduleInsight.singleWotCriticalHours || 1);
              const totalCalendarDays = Math.max(1, scheduleInsight.totalEstimatedDays || 1);
              const baseStartMs = new Date(`${startDate}T00:00:00`).getTime();

              return (
                <div className="border border-stone-200 rounded-lg overflow-x-auto">
                  <div className="min-w-[680px]">
                    <div className="grid grid-cols-12 bg-stone-50 border-b border-stone-200 py-2 px-3 text-[10px] font-bold uppercase text-stone-500">
                      <div className="col-span-4">Step / Process / Station</div>
                      <div className="col-span-6">
                        Planned Timeline ({startDate} → {scheduleInsight.estimatedFinishDate} · {totalCalendarDays}d)
                      </div>
                      <div className="col-span-2 text-right">Window &amp; Load</div>
                    </div>
                    <div className="divide-y divide-stone-100">
                    {processConfigs.map((row, idx) => {
                      const stObj = stations.find(
                        (st: any) => st.id === row.station_id || st.station_code === row.station_id
                      );
                      const tMode = scheduleInsight.stepTransferModeMap[row.id] || "ROOT";
                      const wotHrs = scheduleInsight.stepWotHours[row.id] || 0;
                      const totalStepHrs = scheduleInsight.stepDurations[row.id] || wotHrs * scheduleInsight.totalLots;
                      const es = scheduleInsight.esWotHrs[row.id] ?? 0;
                      const ef = scheduleInsight.efWotHrs[row.id] ?? wotHrs;
                      const isCrit = scheduleInsight.isCriticalMap[row.id];

                      const leftPct = Math.max(
                        0,
                        Math.min(88, Math.round((es / maxWotEf) * 75))
                      );
                      const widthPct = Math.max(
                        12,
                        Math.min(100 - leftPct, Math.round(((ef - es) / maxWotEf) * 75) + 15)
                      );

                      const stepStartDayOffset = Math.floor((leftPct / 100) * totalCalendarDays);
                      const stepEndDayOffset = Math.max(
                        stepStartDayOffset + 1,
                        Math.ceil(((leftPct + widthPct) / 100) * totalCalendarDays)
                      );
                      const stepStartStr = new Date(baseStartMs + stepStartDayOffset * 86400000)
                        .toISOString()
                        .slice(5, 10);
                      const stepEndStr = new Date(baseStartMs + stepEndDayOffset * 86400000)
                        .toISOString()
                        .slice(5, 10);

                      return (
                        <div
                          key={row.id}
                          className="grid grid-cols-12 items-center py-2 px-3 hover:bg-stone-50/80 gap-2"
                        >
                          <div className="col-span-4 min-w-0">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-mono font-bold text-stone-500">
                                #{String(row.step_sequence || idx + 1).padStart(2, "0")}
                              </span>
                              <span className="font-bold text-stone-900 truncate">
                                {row.process_name}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-stone-500 truncate">
                              {stObj ? stObj.station_code : row.station_id} ·{" "}
                              {tMode === "ROOT"
                                ? "Root Entry"
                                : tMode === "INTRA_STATION"
                                ? "1-Pc Flow"
                                : "WOT Gate"}
                            </div>
                          </div>

                          <div className="col-span-6">
                            <div className="relative w-full h-6 bg-stone-100 rounded-md border border-stone-200/80 overflow-hidden">
                              <div
                                className={cn(
                                  "absolute top-1 bottom-1 rounded flex items-center justify-between px-2 text-[10px] font-mono font-bold text-white",
                                  isCrit ? "bg-rose-600" : "bg-emerald-600"
                                )}
                                style={{
                                  left: `${leftPct}%`,
                                  width: `${widthPct}%`,
                                }}
                              >
                                <span className="truncate">
                                  {stepStartStr} → {stepEndStr}
                                </span>
                                <span className="shrink-0 ml-1 opacity-90">
                                  {wotHrs.toFixed(1)}h/WOT
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="col-span-2 text-right font-mono tabular-nums">
                            <div className="font-bold text-stone-900">
                              {Number(totalStepHrs).toFixed(1)}h total
                            </div>
                            <div
                              className={cn(
                                "text-[10px] font-bold",
                                isCrit ? "text-rose-700" : "text-emerald-700"
                              )}
                            >
                              {isCrit ? "Critical" : `+${scheduleInsight.floatWotHrs[row.id] ?? 0}h flt`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 02. SCHEDULE SUMMARY */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
              <span className="font-bold uppercase tracking-wider text-stone-800">
                02. Schedule &amp; Capacity Summary
              </span>
              <span
                className={cn(
                  "font-mono text-[11px] font-bold uppercase",
                  scheduleInsight.isDelayed ? "text-rose-700" : "text-emerald-700"
                )}
              >
                {scheduleInsight.isDelayed
                  ? `Delayed (${Math.abs(scheduleInsight.varianceDays)}d over deadline)`
                  : `On Track (+${scheduleInsight.varianceDays}d buffer)`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200/80">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">Start Date</span>
                <span className="text-sm font-mono font-bold text-stone-900">{startDate}</span>
                <span className="text-[10px] text-stone-500 block">Shift: {shiftHours}h/d</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200/80">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">Est. Finish</span>
                <span
                  className={cn(
                    "text-sm font-mono font-bold",
                    scheduleInsight.isDelayed ? "text-rose-700" : "text-emerald-700"
                  )}
                >
                  {scheduleInsight.estimatedFinishDate}
                </span>
                <span className="text-[10px] text-stone-500 block">{scheduleInsight.totalEstimatedDays} working days</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200/80">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">NTP Deadline</span>
                <span className="text-sm font-mono font-bold text-stone-900">{scheduleInsight.ntpDeadlineDate}</span>
                <span className="text-[10px] text-stone-500 block">FF: {factoryFactor}%</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200/80">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">Critical Path</span>
                <span className="text-sm font-mono font-bold text-stone-900">{scheduleInsight.singleWotCriticalHours}h / WOT</span>
                <span className="text-[10px] text-stone-500 block">{scheduleInsight.totalLots} WOTs × {lotSize} pcs</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200/80">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">Overlap Saved</span>
                <span className="text-sm font-mono font-bold text-emerald-700">-{scheduleInsight.pipeliningHoursSaved}h</span>
                <span className="text-[10px] text-stone-500 block">Batch: {scheduleInsight.unpipelinedBatchHours}h</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200/80">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">Total Net Load</span>
                <span className="text-sm font-mono font-bold text-stone-900">{scheduleInsight.totalEstimatedHours}h</span>
                <span className="text-[10px] text-stone-500 block">Queue: +{scheduleInsight.contentionHours}h</span>
              </div>
            </div>
          </div>

          {/* 03. ORCHESTRATION PARAMETERS */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
              <span className="font-bold uppercase tracking-wider text-stone-800">
                03. Process Handover &amp; Orchestration Rules
              </span>
              <span className="text-[11px] font-mono text-stone-600">
                Engine: 3-Phase Auto-Orchestration
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">Intra-Station (1-Pc Flow)</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {scheduleInsight.intraStationTransitionsCount} steps (-{scheduleInsight.intraStationOverlapSavedHours}h)
                  </span>
                </div>
                <p className="text-[11px] text-stone-600">
                  Downstream steps within the same station unlock after the first completed unit (≥ 1 pc).
                </p>
              </div>

              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">Inter-Station (WOT Gate)</span>
                  <span className="font-mono font-bold text-stone-800">
                    {scheduleInsight.interStationTransitionsCount} gates (+{scheduleInsight.interStationTransferOverheadHours}h)
                  </span>
                </div>
                <p className="text-[11px] text-stone-600">
                  Cross-station transfers require 1 full WOT lot ({lotSize} pcs) completion via Orchestra Engine (+{interStationBufferMins}m buffer).
                </p>
              </div>

              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">Operator Auto-Routing</span>
                  <span className="font-mono font-bold text-stone-800">
                    {stationClusters.length} stations · {scheduleInsight.mergeGatesCount} merge
                  </span>
                </div>
                <p className="text-[11px] text-stone-600">
                  Prioritizes ready merge gates, routes to highest WIP queue, and returns to entry step when cleared.
                </p>
              </div>
            </div>
          </div>

          {/* 04. PROCESS ROUTE & CPM TABLE */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
              <span className="font-bold uppercase tracking-wider text-stone-800">
                04. Process Route, Machine Allocation &amp; CPM Schedule
              </span>
              <span className="font-mono text-xs text-stone-600">
                Bottleneck:{" "}
                <strong className="text-rose-700">
                  {scheduleInsight.bottleneckStation?.station_name || "N/A"} ({scheduleInsight.bottleneckStation?.wot_hours || 0}h/WOT)
                </strong>
              </span>
            </div>

            <div className="border border-stone-200 rounded-lg overflow-x-auto">
              <Table className="text-xs min-w-[880px]">
                <TableHeader>
                  <TableRow className="bg-stone-50 border-b border-stone-200">
                    <TableHead className="py-2 px-3">Step</TableHead>
                    <TableHead className="py-2 px-3">Process</TableHead>
                    <TableHead className="py-2 px-3">Station</TableHead>
                    <TableHead className="py-2 px-3">Handover Mode</TableHead>
                    <TableHead className="py-2 px-3">Assigned Machine</TableHead>
                    <TableHead className="py-2 px-3 text-right">Base → Eff CT</TableHead>
                    <TableHead className="py-2 px-3 text-right">Duration / WOT</TableHead>
                    <TableHead className="py-2 px-3 text-right">CPM Window</TableHead>
                    <TableHead className="py-2 px-3 text-center">Path Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-stone-200">
                  {processConfigs.map((row, idx) => {
                    const stObj = stations.find(
                      (st: any) => st.id === row.station_id || st.station_code === row.station_id
                    );
                    const tMode = scheduleInsight.stepTransferModeMap[row.id] || "ROOT";
                    const effCt = scheduleInsight.stepEffectiveCtMins[row.id] || row.cycle_time_minutes;
                    const wotHrs = scheduleInsight.stepWotHours[row.id] || 0;
                    const es = scheduleInsight.esWotHrs[row.id] ?? 0;
                    const ef = scheduleInsight.efWotHrs[row.id] ?? wotHrs;
                    const flt = scheduleInsight.floatWotHrs[row.id] ?? 0;
                    const isCrit = scheduleInsight.isCriticalMap[row.id];
                    const machList = row.assigned_machine_ids
                      .map((mId) => activeMachines.find((am: any) => am.id === mId))
                      .filter(Boolean);

                    return (
                      <TableRow key={row.id} className="hover:bg-stone-50">
                        <TableCell className="py-2 px-3 font-mono font-bold text-stone-800">
                          #{String(row.step_sequence || idx + 1).padStart(2, "0")}
                        </TableCell>
                        <TableCell className="py-2 px-3 font-bold text-stone-900">
                          {row.process_name}
                        </TableCell>
                        <TableCell className="py-2 px-3 font-mono text-[11px] text-stone-700">
                          {stObj ? `${stObj.station_code} (${stObj.station_name})` : row.station_id}
                        </TableCell>
                        <TableCell className="py-2 px-3 font-mono text-[11px]">
                          {tMode === "ROOT" ? (
                            <span className="text-stone-600">Root Entry</span>
                          ) : tMode === "INTRA_STATION" ? (
                            <span className="text-emerald-700 font-bold">1-Pc Flow</span>
                          ) : (
                            <span className="text-blue-700 font-bold">WOT Gate (+{interStationBufferMins}m)</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 px-3 text-[11px]">
                          {machList.length === 0 ? (
                            <span className="text-stone-500">General Workstation</span>
                          ) : (
                            <div className="space-y-0.5">
                              {machList.map((m: any) => (
                                <div key={m.id} className="font-mono text-[10px] text-stone-800">
                                  <strong>[{m.item_code}]</strong> {m.name} ({m.assigned_operator || "Op"})
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right font-mono tabular-nums">
                          <span className="text-stone-500">{row.cycle_time_minutes}m</span> →{" "}
                          <strong className="text-emerald-700">{effCt}m</strong>
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right font-mono font-bold text-stone-900 tabular-nums">
                          {wotHrs.toFixed(2)}h
                        </TableCell>
                        <TableCell className="py-2 px-3 text-right font-mono text-[11px] text-stone-600 tabular-nums">
                          {es}h – {ef}h
                        </TableCell>
                        <TableCell className="py-2 px-3 text-center font-mono text-[10px] font-bold">
                          {isCrit ? (
                            <span className="text-rose-700 uppercase">Critical (0h)</span>
                          ) : (
                            <span className="text-emerald-700">+{flt}h Float</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* 05. OPERATIONAL CHECKPOINTS */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-2.5">
            <div className="font-bold uppercase tracking-wider text-stone-800 border-b border-stone-100 pb-2">
              05. Key Operational Checkpoints
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-between">
                <span className="text-stone-600">Primary Bottleneck Station</span>
                <span className="font-mono font-bold text-stone-900">
                  {scheduleInsight.bottleneckStation?.station_name || "N/A"} ({scheduleInsight.bottleneckStation?.wot_hours || 0}h/WOT)
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-between">
                <span className="text-stone-600">Engineering BOP Status</span>
                <span className="font-mono font-bold text-stone-900">
                  {project?.bop_status || "DRAFT"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-between">
                <span className="text-stone-600">WOT Sub-Lot Release</span>
                <span className="font-mono font-bold text-stone-900">
                  {scheduleInsight.totalLots} Lots × {lotSize} {project?.uom || "PCS"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-between">
                <span className="text-stone-600">Shared Resource Contention</span>
                <span className="font-mono font-bold text-stone-900">
                  {scheduleInsight.conflictingProjects.length} Project(s) (+{scheduleInsight.contentionHours}h)
                </span>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
});
