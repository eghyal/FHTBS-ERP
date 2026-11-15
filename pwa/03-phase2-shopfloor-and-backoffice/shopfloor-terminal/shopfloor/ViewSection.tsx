import React, { useState } from "react";
import { Play, Pause, Check, FastForward, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import type { ScmReadinessState } from "@/pages/erp/production/hub/shopFloorTypes";
import type { ShopFloorControlTab } from "./ControlSection";

interface ShopFloorViewSectionProps {
  project: any;
  nowMs: number;
  totalTargetQty: number;
  defaultLotSize: number;
  enrichedProcesses: any[];
  runningProcesses: any[];
  upcomingProcesses: any[];
  completedProcesses: any[];
  activeCardProcesses: any[];
  nextCardProcesses: any[];
  filteredGanttProcesses: any[];
  wots: any[];
  scmReadiness: ScmReadinessState | null;
  busyProcessId: string | null;
  isTransitioningWot: boolean;
  ganttStatusFilter: "ALL" | "RUNNING" | "QUEUED" | "PAUSED" | "COMPLETED";
  setGanttStatusFilter: (v: "ALL" | "RUNNING" | "QUEUED" | "PAUSED" | "COMPLETED") => void;
  ganttStationFilter: string;
  setGanttStationFilter: (v: string) => void;
  formatCountdown: (secs: number) => string;
  setShowScmStudioModal: (v: boolean) => void;
  handleStartOrAdvanceWotStep: (proc: any, wot?: any) => Promise<void>;
  handleQuickProcessControl: (
    action: "START" | "PAUSE" | "CONTINUE" | "COMPLETE",
    stationId: string,
    processId: string
  ) => Promise<void>;
  handleQuickUnitAdvance: (
    processId: string,
    wotId: string | undefined,
    incrementUnits: number,
    completeFullLot: boolean
  ) => Promise<void>;
  setNdpBopId: (id: string) => void;
  setControlTab: (tab: ShopFloorControlTab) => void;
  setActiveSection: (sec: "VIEW" | "CONTROL" | "COMMUNICATE") => void;
  setSelectedWotForGenealogy: (wot: any) => void;
}

export const ShopFloorViewSection: React.FC<ShopFloorViewSectionProps> = React.memo(({
  project,
  nowMs,
  totalTargetQty,
  defaultLotSize,
  enrichedProcesses,
  runningProcesses,
  upcomingProcesses,
  completedProcesses,
  activeCardProcesses,
  nextCardProcesses,
  filteredGanttProcesses,
  wots,
  scmReadiness,
  busyProcessId,
  isTransitioningWot,
  ganttStatusFilter,
  setGanttStatusFilter,
  ganttStationFilter,
  setGanttStationFilter,
  formatCountdown,
  setShowScmStudioModal,
  handleStartOrAdvanceWotStep,
  handleQuickProcessControl,
  handleQuickUnitAdvance,
  setNdpBopId,
  setControlTab,
  setActiveSection,
  setSelectedWotForGenealogy,
}) => {
  const [ganttCollapsed, setGanttCollapsed] = useState(false);
  const [ganttExpandedAll, setGanttExpandedAll] = useState(false);
  const [wotTableCollapsed, setWotTableCollapsed] = useState(false);
  const [wotTableExpandedAll, setWotTableExpandedAll] = useState(false);

  return (
    <div className="space-y-5">
      {/* SECTION 01: ORCHESTRA ENGINE PROCESS CARDS (ACTIVE CARD + NEXT CARD) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* LEFT / MAIN CARD: ACTIVE PROCESS CARD */}
        <div className="lg:col-span-7 bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                Active Process Orchestra (
                {runningProcesses.length > 0 ? `${runningProcesses.length} Running` : "Ready"})
              </h2>
            </div>
            <span className="text-[11px] font-mono text-stone-500 tabular-nums">
              Total Route: {completedProcesses.length} / {enrichedProcesses.length} Processes Completed
            </span>
          </div>

          {activeCardProcesses.length === 0 ? (
            <div className="p-6 rounded-xl bg-stone-50 border border-dashed border-stone-300 text-center text-xs text-stone-500">
              No process steps configured. Define BOP routing first.
            </div>
          ) : (
            <div className="space-y-3">
              {activeCardProcesses.map((proc: any) => {
                const isRunning = proc.status === "RUNNING" || proc.status === "IN_PROGRESS";
                const isPaused = proc.status === "PAUSED" || Boolean(proc.active_ndp);
                const isDone = proc.status === "COMPLETED";
                const isBusy = busyProcessId === proc.id || isTransitioningWot;
                const activeWot =
                  proc.active_wots?.[0] ||
                  wots.find((w: any) => w.status !== "COMPLETED") ||
                  wots[0];
                const wotLabel = activeWot
                  ? activeWot.wot_number || activeWot.lot_number || activeWot.id
                  : "WOT-001";

                return (
                  <div
                    key={proc.id}
                    className={cn(
                      "p-4 rounded-xl border transition-all space-y-3",
                      isPaused
                        ? "bg-rose-50/40 border-rose-300"
                        : isRunning
                        ? "bg-stone-50/90 border-stone-300"
                        : "bg-stone-50 border-stone-200"
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-stone-900 text-white font-mono text-xs font-bold tabular-nums">
                            #{String(proc.step_sequence).padStart(2, "0")}
                          </span>
                          <h3 className="text-base font-bold text-stone-900">
                            {proc.process_name}
                          </h3>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase",
                              isPaused
                                ? "bg-rose-100 text-rose-800 border border-rose-200"
                                : isRunning
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : isDone
                                ? "bg-stone-200 text-stone-800"
                                : "bg-amber-100 text-amber-800 border border-amber-200"
                            )}
                          >
                            {isPaused
                              ? proc.active_ndp
                                ? `NDP HALT (${proc.active_ndp.ndp_code || "STOP"})`
                                : "PAUSED"
                              : isRunning
                              ? "IN PROGRESS"
                              : isDone
                              ? "COMPLETED"
                              : "READY TO START"}
                          </span>
                          {(() => {
                            const sq = scmReadiness?.process_producible_quotas?.[proc.id];
                            if (!sq) return null;
                            return (
                              <button
                                type="button"
                                onClick={() => setShowScmStudioModal(true)}
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums border cursor-pointer",
                                  !sq.is_pou_unlocked
                                    ? "bg-rose-50 text-rose-700 border-rose-300"
                                    : sq.wave_ceiling_active
                                    ? "bg-amber-50 text-amber-800 border-amber-300"
                                    : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                )}
                                title="Open SCM Material & Wave Studio"
                              >
                                {sq.wave_ceiling_active
                                  ? `Wave Ceiling: ${sq.max_producible_qty}/${sq.target_qty} ${
                                      project?.uom || "PCS"
                                    }`
                                  : `POU Gate: ${sq.max_producible_qty}/${sq.target_qty} ${
                                      project?.uom || "PCS"
                                    }`}
                              </button>
                            );
                          })()}
                        </div>

                        <div className="text-xs font-mono text-stone-600 tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                          <span>
                            Est. Step Finish:{" "}
                            <strong className="text-stone-900">
                              {proc.etaDate.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </strong>{" "}
                            ({formatCountdown(proc.remainingSecs)})
                          </span>
                          <span>·</span>
                          <span>
                            1-Lot WOT Est. Finish:{" "}
                            <strong className="text-emerald-700">
                              {proc.oneLotWotEtaDate.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              ({formatCountdown(proc.oneLotWotRemainingSecs)})
                            </strong>
                          </span>
                        </div>

                        <div className="text-xs font-mono text-stone-600 tabular-nums flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="font-bold text-stone-900">
                            Process {proc.stepIndex} / {proc.totalStepsCount} of WOT
                          </span>
                          <span>
                            ({proc.precedingCompletedSteps} / {proc.totalStepsCount} Completed)
                          </span>
                          <span>·</span>
                          <span>
                            Lot: <strong className="text-stone-900">{wotLabel}</strong> (
                            {proc.lotBatchQty} {project?.uom || "PCS"})
                          </span>
                          <span>·</span>
                          <span>
                            Station: <strong className="text-stone-800">{proc.station_name}</strong>
                            {proc.machine_code ? ` [${proc.machine_code}]` : ""}
                          </span>
                          {proc.stepContentionMins > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-mono font-bold">
                              +{proc.stepContentionMins}m Shared Queue (
                              {proc.sharedProjectSpks?.join(", ") || "Ongoing WO"})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-sm font-bold text-stone-900">
                            {proc.completed_qty} / {proc.target_qty} {project?.uom || "PCS"}
                          </div>
                          <div className="text-[11px] text-stone-500">
                            ECT: {proc.effectiveCtMins}m/pc · {proc.plannedDurationMins}m/lot
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          isPaused
                            ? "bg-rose-600"
                            : isRunning
                            ? "bg-emerald-600"
                            : isDone
                            ? "bg-stone-900"
                            : "bg-amber-500"
                        )}
                        style={{ width: `${Math.max(4, proc.progressPct)}%` }}
                      />
                    </div>

                    {!isDone && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] font-mono text-stone-500">
                          Supervisor Override Controls
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {!isRunning && !isPaused && (
                            <Button
                              type="button"
                              size="xs"
                              disabled={wots.length === 0 || isBusy}
                              onClick={() => handleStartOrAdvanceWotStep(proc, activeWot)}
                              className="h-7 px-3 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" />
                              <span>Start Process</span>
                            </Button>
                          )}

                          {(isRunning || isPaused) && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleQuickProcessControl(
                                  isPaused ? "CONTINUE" : "PAUSE",
                                  proc.station_id,
                                  proc.id
                                )
                              }
                              className="h-7 px-2.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                            >
                              {isPaused ? (
                                <>
                                  <Play className="w-3 h-3 text-emerald-700" />
                                  <span>Resume</span>
                                </>
                              ) : (
                                <>
                                  <Pause className="w-3 h-3 text-amber-700" />
                                  <span>Pause</span>
                                </>
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={wots.length === 0 || isBusy || isPaused}
                            onClick={() =>
                              handleQuickUnitAdvance(proc.id, activeWot?.id, 1, false)
                            }
                            className="h-7 px-2.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-[11px] font-mono font-bold disabled:opacity-50 cursor-pointer"
                            title="Advance +1 unit (Intra-Station 1-Pc Flow)"
                          >
                            +1 Pc
                          </button>

                          <button
                            type="button"
                            disabled={wots.length === 0 || isBusy || isPaused}
                            onClick={() =>
                              handleQuickUnitAdvance(proc.id, activeWot?.id, 0, true)
                            }
                            className="h-7 px-3 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                            title="Complete 1-Lot WOT on this process and hand over to Next Process"
                          >
                            <Check className="w-3 h-3" />
                            <span>Complete WOT Step</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setNdpBopId(proc.id);
                              setControlTab("NDP_CASCADE");
                              setActiveSection("CONTROL");
                            }}
                            className="h-7 px-2.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold cursor-pointer"
                            title="Report Notice to Down Process (NDP)"
                          >
                            NDP
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT CARD: "NEXT PROCESS" CARD */}
        <div className="lg:col-span-5 bg-stone-100 border border-stone-300 text-stone-600 rounded-2xl p-5 opacity-55 flex flex-col justify-between space-y-4 select-none">
          <div className="flex items-center justify-between gap-2 border-b border-stone-300/80 pb-3">
            <div className="flex items-center gap-2">
              <FastForward className="w-4 h-4 text-stone-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Next Process
              </h2>
            </div>
            <span className="text-[11px] font-mono text-stone-500 tabular-nums">
              Downstream Queue ({upcomingProcesses.length} Remaining)
            </span>
          </div>

          {nextCardProcesses.length === 0 ? (
            <div className="p-6 rounded-xl bg-stone-200/60 border border-stone-300 text-center text-xs font-mono text-stone-600 my-auto">
              Final process reached. No further downstream process in BOP route.
            </div>
          ) : (
            <div className="space-y-3 my-auto">
              {nextCardProcesses.map((nextProc: any) => {
                const prevProc = enrichedProcesses.find(
                  (p) => Number(p.step_sequence) === Number(nextProc.step_sequence) - 1
                );
                const isSameStation =
                  prevProc &&
                  String(prevProc.station_id || prevProc.station_name) ===
                    String(nextProc.station_id || nextProc.station_name);
                const handoverRule =
                  nextProc.transfer_mode || (isSameStation ? "INTRA_STATION" : "INTER_STATION");

                return (
                  <div
                    key={nextProc.id}
                    className="p-4 rounded-xl bg-stone-200/70 border border-stone-300 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded bg-stone-700 text-white font-mono text-xs font-bold tabular-nums">
                          #{String(nextProc.step_sequence).padStart(2, "0")}
                        </span>
                        <h3 className="text-sm font-bold text-stone-800 truncate">
                          {nextProc.process_name}
                        </h3>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-stone-300 text-stone-700 font-mono text-[10px] font-bold uppercase shrink-0">
                        QUEUED
                      </span>
                    </div>

                    <div className="text-xs font-mono text-stone-600 tabular-nums space-y-1">
                      <div>
                        Est. Step Finish:{" "}
                        <strong className="text-stone-800">
                          {nextProc.etaDate.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </strong>{" "}
                        · Est. Lot Duration:{" "}
                        <strong className="text-stone-800">
                          {nextProc.plannedDurationMins}m / WOT
                        </strong>
                      </div>
                      <div>
                        Route Position:{" "}
                        <strong className="text-stone-800">
                          Process {nextProc.stepIndex} / {nextProc.totalStepsCount} of WOT
                        </strong>{" "}
                        · Handover:{" "}
                        <strong className="text-stone-800">
                          {handoverRule === "INTRA_STATION" ? "1-Pc Flow" : "1-WOT Gate"}
                        </strong>
                      </div>
                      <div className="text-[11px] text-stone-500 flex flex-wrap items-center gap-2">
                        <span>
                          Station: {nextProc.station_name}
                          {nextProc.machine_code
                            ? ` · [${nextProc.machine_code}] ${nextProc.machine_name}`
                            : " · General Workstation"}
                        </span>
                        {nextProc.stepContentionMins > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-stone-300/90 text-stone-800 text-[10px] font-mono font-bold">
                            +{nextProc.stepContentionMins}m Shared Queue
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-stone-300/80 flex items-center justify-between text-[11px] font-mono text-stone-500">
            <span>Auto-unlocks upon preceding WOT step gate</span>
            <span>
              ECT × {defaultLotSize} {project?.uom || "PCS"}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 02: INTERACTIVE PRODUCTION GANTT & PROCESS TELEMETRY */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-stone-200 pb-3.5">
          <div>
            <h2 className="text-sm font-bold text-stone-900">
              02. Production Route Gantt &amp; Step Schedule
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Synchronized BOP process timeline, 1-Lot WOT estimates, and supervisor step overrides.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg border border-stone-200">
              {(
                [
                  { key: "ALL", label: `All (${enrichedProcesses.length})` },
                  { key: "RUNNING", label: `Running (${runningProcesses.length})` },
                  { key: "QUEUED", label: `Queued (${upcomingProcesses.length})` },
                  { key: "COMPLETED", label: `Done (${completedProcesses.length})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setGanttStatusFilter(f.key)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer",
                    ganttStatusFilter === f.key
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-600 hover:text-stone-900"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <select
              value={ganttStationFilter}
              onChange={(e) => setGanttStationFilter(e.target.value)}
              className="h-8 bg-stone-50 border border-stone-200 rounded-lg px-2.5 text-xs font-mono font-semibold text-stone-800 focus:outline-stone-900"
            >
              <option value="ALL">All Stations</option>
              {Array.from(
                new Set(enrichedProcesses.map((p: any) => p.station_name).filter(Boolean))
              ).map((stName: any) => (
                <option key={stName} value={stName}>
                  {stName}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setGanttCollapsed((prev) => !prev)}
              className="h-8 inline-flex items-center gap-1 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 transition-colors cursor-pointer"
            >
              <span>{ganttCollapsed ? "Expand" : "Collapse"}</span>
              {ganttCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {ganttCollapsed ? null : enrichedProcesses.length === 0 ? (
          <div className="p-8 bg-stone-50 border border-dashed border-stone-300 rounded-xl text-center text-xs text-stone-500">
            No BOP process steps configured for this project.
          </div>
        ) : filteredGanttProcesses.length === 0 ? (
          <div className="p-6 bg-stone-50 border border-stone-200 rounded-xl text-center text-xs text-stone-500">
            No process steps match the selected filter.
          </div>
        ) : (
          (() => {
            const minTs = Math.min(
              ...enrichedProcesses.map((p: any) =>
                p.forecastStartDate ? new Date(p.forecastStartDate).getTime() : nowMs
              )
            );
            const maxTs = Math.max(
              minTs + 60000,
              ...enrichedProcesses.map((p: any) =>
                p.etaDate ? new Date(p.etaDate).getTime() : nowMs + 600000
              )
            );
            const totalSpan = Math.max(60000, maxTs - minTs);
            const visibleGanttProcs = ganttExpandedAll
              ? filteredGanttProcesses
              : filteredGanttProcesses.slice(0, 5);

            return (
              <div className="border border-stone-200 rounded-xl overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-stone-50 border-b border-stone-200">
                      <TableHead className="py-2.5 px-3 w-[22%]">Step &amp; Process</TableHead>
                      <TableHead className="py-2.5 px-3 w-[16%]">Station &amp; Machine</TableHead>
                      <TableHead className="py-2.5 px-3 w-[15%]">Step &amp; 1-Lot ETA</TableHead>
                      <TableHead className="py-2.5 px-3 w-[29%]">
                        Gantt Timeline &amp; Output (Target: {totalTargetQty}{" "}
                        {project?.uom || "PCS"})
                      </TableHead>
                      <TableHead className="py-2.5 px-3 w-[18%] text-right">
                        Supervisor Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-stone-200 text-xs bg-white">
                    {visibleGanttProcs.map((proc: any, idx: number) => {
                      const nextProc = enrichedProcesses.find(
                        (p: any) => Number(p.step_sequence) === Number(proc.step_sequence) + 1
                      );
                      const isSameStationNext =
                        nextProc &&
                        String(nextProc.station_id || nextProc.station_name || "") ===
                          String(proc.station_id || proc.station_name || "");
                      const transferRule =
                        proc.transfer_mode ||
                        (isSameStationNext ? "INTRA_STATION" : "INTER_STATION");

                      const isRunning =
                        proc.status === "RUNNING" || proc.status === "IN_PROGRESS";
                      const isPaused = proc.status === "PAUSED" || Boolean(proc.active_ndp);
                      const isDone = proc.status === "COMPLETED";
                      const isBusy = busyProcessId === proc.id || isTransitioningWot;

                      const sTs = proc.forecastStartDate
                        ? new Date(proc.forecastStartDate).getTime()
                        : minTs;
                      const eTs = proc.etaDate
                        ? new Date(proc.etaDate).getTime()
                        : sTs + proc.plannedDurationMins * 60000;
                      const leftPct = Math.max(
                        0,
                        Math.min(86, ((sTs - minTs) / totalSpan) * 100)
                      );
                      const widthPct = Math.max(
                        14,
                        Math.min(100 - leftPct, ((eTs - sTs) / totalSpan) * 100)
                      );

                      const activeWot =
                        proc.active_wots?.[0] ||
                        wots.find((w: any) => w.status !== "COMPLETED") ||
                        wots[0];

                      return (
                        <TableRow
                          key={proc.id || idx}
                          className={cn(
                            "transition-colors align-middle",
                            isPaused
                              ? "bg-rose-50/30 hover:bg-rose-50/50"
                              : isRunning
                              ? "bg-emerald-50/20 hover:bg-emerald-50/40"
                              : "hover:bg-stone-50/80"
                          )}
                        >
                          <TableCell className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-stone-500 tabular-nums">
                                #{String(proc.step_sequence).padStart(2, "0")}
                              </span>
                              <span className="font-bold text-stone-900">
                                {proc.process_name}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-stone-500 mt-0.5">
                              Process {proc.stepIndex}/{proc.totalStepsCount} ·{" "}
                              {nextProc ? (
                                <span
                                  className={cn(
                                    "font-semibold",
                                    transferRule === "INTRA_STATION"
                                      ? "text-emerald-700"
                                      : "text-stone-700"
                                  )}
                                >
                                  Next: {transferRule === "INTRA_STATION" ? "1-Pc Flow" : "WOT Gate"}
                                </span>
                              ) : (
                                <span>Final Step</span>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="py-3 px-3">
                            <div className="font-semibold text-stone-800">
                              {proc.station_name}
                            </div>
                            <div className="text-[11px] font-mono text-stone-500 truncate">
                              {proc.machine_code
                                ? `[${proc.machine_code}] ${proc.machine_name}`
                                : "General Workstation"}
                            </div>
                          </TableCell>

                          <TableCell className="py-3 px-3 font-mono tabular-nums">
                            <div
                              className={cn(
                                "text-[11px] font-bold uppercase",
                                isPaused
                                  ? "text-rose-700"
                                  : isRunning
                                  ? "text-emerald-700"
                                  : isDone
                                  ? "text-stone-900"
                                  : "text-stone-500"
                              )}
                            >
                              {isPaused
                                ? proc.active_ndp
                                  ? `NDP (${proc.active_ndp.ndp_code || "HALT"})`
                                  : "PAUSED"
                                : isRunning
                                ? "RUNNING"
                                : isDone
                                ? "COMPLETED"
                                : "QUEUED"}
                            </div>
                            <div className="text-[11px] text-stone-600 mt-0.5">
                              {isDone
                                ? "100% Complete"
                                : isRunning
                                ? `Step: ${formatCountdown(proc.remainingSecs)}`
                                : `Lot: ${proc.plannedDurationMins}m`}
                            </div>
                            {!isDone && (
                              <div className="text-[10px] text-emerald-700 font-semibold">
                                1-Lot ETA:{" "}
                                {proc.oneLotWotEtaDate.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="py-3 px-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                              <span className="font-bold text-stone-800">
                                {proc.completed_qty} / {proc.target_qty} {project?.uom || "PCS"} (
                                {proc.progressPct}%)
                              </span>
                              <span className="text-stone-500">
                                {proc.forecastStartDate
                                  ? new Date(proc.forecastStartDate).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "--:--"}{" "}
                                →{" "}
                                {proc.etaDate
                                  ? new Date(proc.etaDate).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "--:--"}
                              </span>
                            </div>

                            <div className="relative w-full h-5 bg-stone-100 rounded-md border border-stone-200/80 overflow-hidden">
                              <div
                                className={cn(
                                  "absolute top-0.5 bottom-0.5 rounded flex items-center justify-between px-2 text-[10px] font-mono font-bold transition-all overflow-hidden",
                                  isPaused
                                    ? "bg-rose-600 text-white"
                                    : isRunning
                                    ? "bg-emerald-600 text-white"
                                    : isDone
                                    ? "bg-stone-900 text-white"
                                    : "bg-stone-300 text-stone-800"
                                )}
                                style={{
                                  left: `${leftPct}%`,
                                  width: `${widthPct}%`,
                                }}
                              >
                                <span className="truncate">
                                  {proc.active_wots?.length > 0
                                    ? proc.active_wots
                                        .map((w: any) => w.wot_number || w.lot_number)
                                        .join(", ")
                                    : `${proc.progressPct}%`}
                                </span>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-3 px-3 text-right">
                            {isDone ? (
                              <span className="text-[11px] font-mono font-bold text-emerald-700 inline-flex items-center justify-end gap-1">
                                <Check className="w-3.5 h-3.5" />
                                Done
                              </span>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                                {!isRunning && !isPaused && (
                                  <button
                                    type="button"
                                    disabled={wots.length === 0 || isBusy}
                                    onClick={() => handleStartOrAdvanceWotStep(proc, activeWot)}
                                    className="h-7 px-2.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                    title="Start this process for the active WOT lot"
                                  >
                                    <Play className="w-3 h-3" />
                                    <span>Start</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  disabled={wots.length === 0 || isBusy || isPaused}
                                  onClick={() =>
                                    handleQuickUnitAdvance(proc.id, activeWot?.id, 1, false)
                                  }
                                  className="h-7 px-2 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-[11px] font-mono font-bold disabled:opacity-50 cursor-pointer"
                                  title="Log +1 completed unit (1-Piece Intra-Station Flow)"
                                >
                                  +1 Pc
                                </button>

                                <button
                                  type="button"
                                  disabled={wots.length === 0 || isBusy || isPaused}
                                  onClick={() =>
                                    handleQuickUnitAdvance(proc.id, activeWot?.id, 0, true)
                                  }
                                  className="h-7 px-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold disabled:opacity-50 cursor-pointer"
                                  title="Complete full WOT lot on this step"
                                >
                                  Done Lot
                                </button>

                                {(isRunning || isPaused) && (
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() =>
                                      handleQuickProcessControl(
                                        isPaused ? "CONTINUE" : "PAUSE",
                                        proc.station_id,
                                        proc.id
                                      )
                                    }
                                    className="h-7 px-2 rounded-lg border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                    title={isPaused ? "Resume Process" : "Pause Process"}
                                  >
                                    {isPaused ? (
                                      <Play className="w-3 h-3 text-emerald-700" />
                                    ) : (
                                      <Pause className="w-3 h-3 text-amber-700" />
                                    )}
                                  </button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredGanttProcesses.length > 5 && (
                  <div className="p-2.5 bg-stone-50 border-t border-stone-200 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setGanttExpandedAll((prev) => !prev)}
                      className="w-full py-1.5 px-3 rounded-xl bg-white hover:bg-stone-100 border border-stone-200/80 text-[11px] font-bold text-stone-700 hover:text-stone-950 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {ganttExpandedAll ? (
                        <>
                          <span>Show Less (Top 5 Steps)</span>
                          <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          <span>
                            Show All {filteredGanttProcesses.length} Process Steps (+{filteredGanttProcesses.length - 5} more)
                          </span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* SECTION 03: WOT SUB-LOT EXECUTION & DIGITAL PASSPORT TABLE */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-stone-900">
              03. WOT Sub-Lot Tracking &amp; Digital Passport ({wots.length})
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Autonomous WOT lot tracking, step completion ratio (n/N), 1-Lot finish ETA, and Digital Product Passport.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="text-xs font-mono text-stone-600 tabular-nums">
              Lot Size:{" "}
              <strong className="text-stone-900">
                {defaultLotSize} {project?.uom || "PCS"}
              </strong>
            </div>
            <button
              type="button"
              onClick={() => setWotTableCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 transition-colors cursor-pointer"
            >
              <span>{wotTableCollapsed ? "Expand" : "Collapse"}</span>
              {wotTableCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {wotTableCollapsed ? null : wots.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-stone-300 bg-stone-50 text-center text-xs text-stone-500">
            No WOT sub-lots initialized yet. Commit Setup &amp; Master to initialize WOT sub-lots.
          </div>
        ) : (
          <div className="border border-stone-200 rounded-xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-stone-50 border-b border-stone-200">
                  <TableHead className="py-2.5 px-3">WOT Sub-Lot</TableHead>
                  <TableHead className="py-2.5 px-3">Current Process &amp; Station</TableHead>
                  <TableHead className="py-2.5 px-3">Process Progress (n / N)</TableHead>
                  <TableHead className="py-2.5 px-3">1-Lot Finish ETA</TableHead>
                  <TableHead className="py-2.5 px-3 text-right">Lot Qty</TableHead>
                  <TableHead className="py-2.5 px-3 text-right">Yield (OK / NG)</TableHead>
                  <TableHead className="py-2.5 px-3">Status</TableHead>
                  <TableHead className="py-2.5 px-3 text-right">Actions &amp; Passport</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-stone-200 text-xs bg-white">
                {(wotTableExpandedAll ? wots : wots.slice(0, 5)).map((w: any) => {
                  const wStepId =
                    w.current_bop_id || w.bop_id || w.current_process_id || w.process_id;
                  const currentProc =
                    enrichedProcesses.find((p) => String(p.id) === String(wStepId)) ||
                    enrichedProcesses[0];
                  const currentSeq = currentProc ? Number(currentProc.step_sequence) : 1;
                  const statusStr = String(w.status || "READY").toUpperCase();
                  const totalSteps = enrichedProcesses.length || 1;
                  const completedStepsForWot =
                    statusStr === "COMPLETED"
                      ? totalSteps
                      : Math.max(0, (currentProc?.stepIndex || 1) - 1);

                  return (
                    <TableRow key={w.id} className="hover:bg-stone-50/80 transition-colors">
                      <TableCell className="py-2.5 px-3">
                        <div className="font-mono font-bold text-stone-900">
                          {w.wot_number || w.lot_number || w.id}
                        </div>
                        {w.parent_wot_id && (
                          <div className="text-[10px] font-mono text-amber-700">
                            Split from {w.parent_wot_id}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        {statusStr === "COMPLETED" ? (
                          <span className="font-mono font-semibold text-emerald-700">
                            All {totalSteps} Processes Completed
                          </span>
                        ) : currentProc ? (
                          <div>
                            <div className="font-semibold text-stone-900">
                              #{String(currentProc.step_sequence).padStart(2, "0")}{" "}
                              {currentProc.process_name}
                            </div>
                            <div className="text-[11px] text-stone-500 font-mono">
                              {currentProc.station_name}
                            </div>
                          </div>
                        ) : (
                          <span className="text-stone-500 font-mono">
                            {w.station_name || "Queued for Step #01"}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5 px-3 space-y-1">
                        <div className="text-[11px] font-mono font-bold text-stone-800 tabular-nums">
                          {completedStepsForWot} / {totalSteps} Processes Completed
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {enrichedProcesses.map((p: any) => {
                            const seq = Number(p.step_sequence);
                            const isHere =
                              statusStr !== "COMPLETED" &&
                              String(currentProc?.id) === String(p.id);
                            const isPassed =
                              statusStr === "COMPLETED" ||
                              (currentSeq > 0 && seq < currentSeq);

                            return (
                              <button
                                key={p.id}
                                type="button"
                                disabled={isTransitioningWot}
                                onClick={() => handleStartOrAdvanceWotStep(p, w)}
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer",
                                  isHere
                                    ? statusStr === "PAUSED"
                                      ? "bg-amber-500 text-white"
                                      : "bg-emerald-600 text-white"
                                    : isPassed
                                    ? "bg-stone-800 text-white"
                                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                                )}
                                title={`Step #${seq}: ${p.process_name} (${p.station_name}) — Click to dispatch WOT to this step`}
                              >
                                #{seq} {isHere ? "•" : isPassed ? "✓" : ""}
                              </button>
                            );
                          })}
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3 font-mono tabular-nums">
                        {statusStr === "COMPLETED" ? (
                          <span className="text-emerald-700 font-bold">Finished</span>
                        ) : currentProc ? (
                          <div>
                            <div className="font-bold text-stone-900">
                              {currentProc.oneLotWotEtaDate.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                            <div className="text-[10px] text-stone-500">
                              {formatCountdown(currentProc.oneLotWotRemainingSecs)} rem
                            </div>
                          </div>
                        ) : (
                          <span className="text-stone-400">--:--</span>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5 px-3 text-right font-mono font-bold text-stone-900 tabular-nums">
                        {Number(w.qty || defaultLotSize).toLocaleString()}{" "}
                        {project?.uom || "PCS"}
                      </TableCell>

                      <TableCell className="py-2.5 px-3 text-right font-mono tabular-nums">
                        <span className="text-emerald-700 font-bold">
                          {Number(w.good_units ?? w.good_qty ?? w.qty ?? 0)} OK
                        </span>
                        {" / "}
                        <span className="text-rose-600">
                          {Number(w.reject_units ?? w.scrap_qty ?? 0)} NG
                        </span>
                        {Number(w.qc_hold_qty || 0) > 0 && (
                          <span className="ml-1 text-amber-700">({w.qc_hold_qty} Hold)</span>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        <span
                          className={cn(
                            "font-mono text-[11px] font-bold uppercase",
                            statusStr === "COMPLETED"
                              ? "text-emerald-700"
                              : statusStr === "IN_PROGRESS" || statusStr === "RUNNING"
                              ? "text-amber-700"
                              : statusStr === "QC_HOLD" || statusStr === "PAUSED"
                              ? "text-rose-700"
                              : "text-stone-600"
                          )}
                        >
                          {statusStr}
                        </span>
                      </TableCell>

                      <TableCell className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {statusStr !== "COMPLETED" && currentProc && (
                            <Button
                              type="button"
                              variant="primary"
                              size="xs"
                              disabled={busyProcessId === currentProc.id || isTransitioningWot}
                              onClick={() =>
                                statusStr === "IN_PROGRESS" || statusStr === "RUNNING"
                                  ? handleQuickUnitAdvance(currentProc.id, w.id, 0, true)
                                  : handleStartOrAdvanceWotStep(currentProc, w)
                              }
                            >
                              {statusStr === "IN_PROGRESS" || statusStr === "RUNNING"
                                ? "Complete Step"
                                : "Start Step"}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            onClick={() => setSelectedWotForGenealogy(w)}
                            leftIcon={<ShieldCheck className="w-3 h-3 text-emerald-600" />}
                          >
                            Passport
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {wots.length > 5 && (
              <div className="p-2.5 bg-stone-50 border-t border-stone-200 flex justify-center">
                <button
                  type="button"
                  onClick={() => setWotTableExpandedAll((prev) => !prev)}
                  className="w-full py-1.5 px-3 rounded-xl bg-white hover:bg-stone-100 border border-stone-200/80 text-[11px] font-bold text-stone-700 hover:text-stone-950 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {wotTableExpandedAll ? (
                    <>
                      <span>Show Less (Top 5 WOT Sub-Lots)</span>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span>
                        Show All {wots.length} WOT Sub-Lots (+{wots.length - 5} more)
                      </span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
