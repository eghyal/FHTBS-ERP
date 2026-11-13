import React, { useState } from "react";
import { GitFork, GitMerge, Cpu, X, ShieldCheck, Lock, ChevronDown, ChevronUp } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import type { BopQcParameter } from "@/components/erp/bopTypes";

export interface ProcessConfigRow {
  id: string;
  step_sequence: number;
  process_name: string;
  node_type?: "PROCESS" | "PRODUCT";
  product_role?: string | null;
  is_qc_gate?: boolean;
  qc_parameters?: BopQcParameter[];
  station_id: string;
  assigned_machine_id: string;
  assigned_machine_ids: string[];
  machine_efficiency_multiplier: number;
  cycle_time_minutes: number;
  manpower_count: number;
  eligible_operators: string[];
  predecessor_ids: string[];
  transfer_mode?: "INTRA_STATION" | "INTER_STATION";
  status?: string;
}

const SPEED_FACTOR_OPTIONS = [1.0, 1.25, 1.35, 1.5, 1.6, 1.8, 2.0, 2.2, 2.5];

interface ProcessRouteConfigTableProps {
  projectId: string;
  processConfigs: ProcessConfigRow[];
  stationClusters: any[];
  stations: any[];
  activeMachines: any[];
  scheduleInsight: any;
  interStationBufferMins: number;
  setShowBopEditorModal: (show: boolean) => void;
  handleUpdateConfig: (stepId: string, field: keyof ProcessConfigRow, value: any) => void;
  handleUpdateQcParamCycleTime?: (stepId: string, paramId: string, cycleTimeMins: number) => void;
  handleAddMachineToProcess: (stepId: string, machineId: string) => void;
  handleRemoveMachineFromProcess: (stepId: string, machineId: string) => void;
}

export const ProcessRouteConfigTable: React.FC<ProcessRouteConfigTableProps> = React.memo(({
  projectId: _projectId,
  processConfigs,
  stationClusters,
  stations,
  activeMachines,
  scheduleInsight,
  interStationBufferMins,
  setShowBopEditorModal,
  handleUpdateConfig,
  handleUpdateQcParamCycleTime,
  handleAddMachineToProcess,
  handleRemoveMachineFromProcess,
}) => {
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const INITIAL_STEP_LIMIT = 5;
  const visibleConfigs = showAllRows
    ? processConfigs
    : processConfigs.slice(0, INITIAL_STEP_LIMIT);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100 uppercase tracking-wider">
            BOP Process Route, IPQC Gates &amp; Machine Configuration
          </h3>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            Critical Path: <span className="font-mono font-bold text-stone-800 dark:text-stone-200">{scheduleInsight.singleWotCriticalHours}h / WOT</span> · IPQC Load:{" "}
            <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">{scheduleInsight.singleWotIpqcHours || 0}h / WOT</span> · Active Machines:{" "}
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{activeMachines.length}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-stone-600 dark:text-stone-400 font-mono tabular-nums">
            {processConfigs.length} Step(s) ({scheduleInsight.ipqcGatesCount || 0} QC Gate) · {stationClusters.length} Station(s)
          </span>
          {processConfigs.length > 0 && (
            <button
              type="button"
              onClick={() => setIsSectionCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 transition-colors cursor-pointer"
            >
              <span>{isSectionCollapsed ? "Expand Route" : "Collapse Route"}</span>
              {isSectionCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {isSectionCollapsed ? null : processConfigs.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-stone-300 dark:border-stone-700 rounded-xl bg-stone-50 dark:bg-stone-900 space-y-3">
          <p className="text-xs font-bold text-stone-700 dark:text-stone-200">
            No BOP Route Processes Declared
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md mx-auto">
            Add process steps and workstation assignments in the Engineering BOP Editor first.
          </p>
          <div className="flex items-center justify-center gap-2.5">
            <Button
              type="button"
              variant="primary"
              size="sm"
              leftIcon={<GitFork />}
              onClick={() => setShowBopEditorModal(true)}
            >
              Open BOP Editor
            </Button>
          </div>
        </div>
      ) : (
        <div className="border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
          <Table className="table-fixed text-xs">
            <TableHeader>
              <TableRow className="bg-stone-50 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
                <TableHead className="w-[44px] text-center">#</TableHead>
                <TableHead className="w-[24%]">Process / IPQC Gate &amp; Flow</TableHead>
                <TableHead className="w-[13%]">BOP Station</TableHead>
                <TableHead className="w-[27%]">Machine / IPQC Parameter Cycle Times</TableHead>
                <TableHead className="w-[11%] text-center">Speed Factor</TableHead>
                <TableHead className="w-[11%] text-right">Cycle Time</TableHead>
                <TableHead className="w-[10%] text-right">WOT CPM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-stone-200 dark:divide-stone-800 bg-white dark:bg-stone-900">
              {visibleConfigs.map((row, idx) => {
                const predSteps = row.predecessor_ids
                  .map((pid) => processConfigs.find((p) => p.id === pid))
                  .filter(Boolean) as ProcessConfigRow[];

                const isMergeNode = predSteps.length > 1;
                const isQcGate = Boolean(row.is_qc_gate || String(row.node_type || "").toUpperCase() === "PRODUCT");
                const qcParams = Array.isArray(row.qc_parameters) ? row.qc_parameters : [];
                const hasQcParams = qcParams.length > 0;
                const hasIpqcPredecessor = predSteps.some((p) => p.is_qc_gate);

                const stationObj = stations.find(
                  (st: any) => st.id === row.station_id || st.station_code === row.station_id
                );

                const assignedMachinesList = row.assigned_machine_ids
                  .map((mId) => activeMachines.find((am: any) => am.id === mId))
                  .filter(Boolean);
                const machineCount = assignedMachinesList.length;
                const isSpeedFactorEnabled = machineCount > 1;
                const compoundDivisor = scheduleInsight.stepCompoundDivisor[row.id] || 1.0;
                const machineCt = scheduleInsight.stepMachineCtMins[row.id] || row.cycle_time_minutes;
                const effectiveCt = scheduleInsight.stepEffectiveCtMins[row.id] || row.cycle_time_minutes;
                const wotHrs = scheduleInsight.stepWotHours[row.id] || 0;
                const flt = scheduleInsight.floatWotHrs[row.id] ?? 0;
                const isCritical = scheduleInsight.isCriticalMap[row.id];

                const unselectedActiveMachines = activeMachines.filter(
                  (m: any) => !row.assigned_machine_ids.includes(m.id)
                );

                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      "transition-colors align-top",
                      isQcGate
                        ? "bg-indigo-50/35 dark:bg-indigo-950/20 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30"
                        : "hover:bg-stone-50/70 dark:hover:bg-stone-800/50"
                    )}
                  >
                    {/* 1. Seq */}
                    <TableCell className="py-3 px-2.5 text-center font-mono font-bold text-stone-800 dark:text-stone-200 tabular-nums">
                      {String(row.step_sequence || idx + 1).padStart(2, "0")}
                    </TableCell>

                    {/* 2. Process & Flow */}
                    <TableCell className="py-3 px-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-stone-900 dark:text-stone-100 break-words">
                          {row.process_name}
                        </span>
                        {isQcGate && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono text-[9px] font-black uppercase">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            {row.product_role === "FINISHED_GOOD" ? "FQC Gate" : "IPQC Hold Gate"}
                          </span>
                        )}
                        {!isQcGate && hasQcParams && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono text-[9px] font-bold">
                            +{qcParams.length} IPQC Param
                          </span>
                        )}
                        {isCritical && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-mono text-[9px] font-black uppercase">
                            Critical
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        {predSteps.length === 0 && idx === 0 ? (
                          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                            Root Entry
                          </span>
                        ) : (
                          <>
                            <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400">
                              After{" "}
                              {predSteps.length > 0
                                ? predSteps.map((p) => `#${p.step_sequence}`).join(",")
                                : `#${processConfigs[idx - 1]?.step_sequence || idx}`}
                            </span>
                            {isMergeNode && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[9px] font-mono font-bold">
                                <GitMerge className="w-2.5 h-2.5" /> Merge
                              </span>
                            )}
                            {isQcGate || hasIpqcPredecessor ? (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[9px] font-mono font-semibold"
                                title="Downstream process is locked until IPQC Gate passes inspection"
                              >
                                <Lock className="w-2.5 h-2.5" />
                                {isQcGate ? "Locks Downstream Until Pass" : "Locked by Upstream IPQC"}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const currentMode =
                                    scheduleInsight.stepTransferModeMap[row.id] === "INTRA_STATION"
                                      ? "INTRA_STATION"
                                      : "INTER_STATION";
                                  handleUpdateConfig(
                                    row.id,
                                    "transfer_mode",
                                    currentMode === "INTRA_STATION" ? "INTER_STATION" : "INTRA_STATION"
                                  );
                                }}
                                className={cn(
                                  "px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold border cursor-pointer transition-colors",
                                  scheduleInsight.stepTransferModeMap[row.id] === "INTRA_STATION"
                                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                                    : "bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100"
                                )}
                                title="Click to toggle Orchestration Handover Mode (1-Piece Intra-Station Stream vs 1-WOT Batch Transfer)"
                              >
                                {scheduleInsight.stepTransferModeMap[row.id] === "INTRA_STATION"
                                  ? "1-Pc Flow (Rule 11.1)"
                                  : `1-WOT Gate (+${interStationBufferMins}m)`}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>

                    {/* 3. Read-Only BOP Workstation */}
                    <TableCell className="py-3 px-2.5">
                      <div className="p-2 rounded-lg bg-stone-100/90 dark:bg-stone-800 border border-stone-200/90 dark:border-stone-700 space-y-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[11px] font-black text-stone-900 dark:text-stone-100 truncate">
                            {stationObj?.station_code ||
                              (row.station_id && row.station_id !== "UNASSIGNED"
                                ? row.station_id
                                : "UNASSIGNED")}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowBopEditorModal(true)}
                            className="text-[10px] font-bold text-stone-700 dark:text-stone-300 hover:text-stone-950 underline shrink-0 cursor-pointer"
                            title="Edit Workstation in BOP"
                          >
                            BOP
                          </button>
                        </div>
                        <div className="text-[10px] text-stone-600 dark:text-stone-400 truncate">
                          {stationObj?.station_name || "Unassigned Station"}
                        </div>
                      </div>
                    </TableCell>

                    {/* 4. Active Machine Assignment & Per-Parameter IPQC Cycle Time Configurator */}
                    <TableCell className="py-3 px-2.5 space-y-2">
                      {hasQcParams && (
                        <div className="p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-mono font-bold text-indigo-900 dark:text-indigo-200">
                            <span className="inline-flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                              IPQC Parameters ({qcParams.length})
                            </span>
                            <span>
                              Auto-Sum: {row.cycle_time_minutes}m
                            </span>
                          </div>
                          <div className="space-y-1">
                            {qcParams.map((qp, qIdx) => (
                              <div
                                key={qp.id || qIdx}
                                className="flex items-center justify-between gap-1.5 bg-white dark:bg-stone-900 px-2 py-1 rounded border border-indigo-100 dark:border-indigo-900 text-[10px]"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-stone-800 dark:text-stone-200 truncate">
                                    {qIdx + 1}. {qp.parameter_name}
                                  </div>
                                  <div className="text-[9px] text-stone-500 dark:text-stone-400 truncate font-mono">
                                    {qp.specification ? `${qp.specification} · ` : ""}
                                    {qp.measurement_method || "Gauge"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <input
                                    type="number"
                                    min={0.5}
                                    step={0.5}
                                    value={Number(qp.cycle_time_minutes) || 5}
                                    onChange={(e) => {
                                      const val = Math.max(0.5, parseFloat(e.target.value) || 0.5);
                                      handleUpdateQcParamCycleTime?.(row.id, qp.id, val);
                                    }}
                                    className="w-12 text-right bg-stone-50 dark:bg-stone-800 border border-indigo-300 dark:border-indigo-700 rounded px-1 py-0.5 text-[10px] font-mono font-bold text-indigo-950 dark:text-indigo-200 tabular-nums focus:bg-white dark:focus:bg-stone-900 focus:outline-indigo-600"
                                    title="Inspection / testing cycle time for this QC parameter (minutes)"
                                  />
                                  <span className="text-[9px] font-mono text-stone-500">m</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {assignedMachinesList.length === 0 ? (
                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[11px] font-semibold text-stone-700 dark:text-stone-300">
                          <span>{isQcGate ? "QC Inspection Bench (Manual / CMM)" : "General Workstation (No Machine)"}</span>
                          <span className="text-[10px] font-mono text-stone-500">1.00x</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {assignedMachinesList.map((m: any) => (
                            <div
                              key={m.id}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-[10px] font-medium max-w-full"
                            >
                              <Cpu className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="font-mono font-bold truncate">
                                {m.item_code}
                              </span>
                              <span className="text-stone-700 dark:text-stone-300 truncate max-w-[95px]">
                                {m.name}
                              </span>
                              {m.assigned_operator && (
                                <span className="px-1.5 py-0.2 rounded bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-mono text-[9px] shrink-0">
                                  Op: {m.assigned_operator}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveMachineFromProcess(row.id, m.id)}
                                className="text-stone-400 hover:text-rose-600 cursor-pointer ml-0.5 shrink-0"
                                title="Remove Machine"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <Select
                          value=""
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) return;
                            handleAddMachineToProcess(row.id, val);
                          }}
                          className="h-8 text-[11px] font-semibold"
                        >
                          <option value="">
                            {assignedMachinesList.length === 0
                              ? isQcGate
                                ? "+ Assign Testing / CMM Equipment..."
                                : "+ Assign Active Machine..."
                              : `+ Add Machine (${assignedMachinesList.length} Active)`}
                          </option>
                          {assignedMachinesList.length > 0 && (
                            <option value="GENERAL_WORKSTATION">
                              Reset to General Workstation (No Machine)
                            </option>
                          )}
                          {unselectedActiveMachines.map((m: any) => (
                            <option key={m.id} value={m.id}>
                              [{m.item_code}] {m.name} — Op: {m.assigned_operator || "Active"}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </TableCell>

                    {/* 5. Process Speed Factor (Active ONLY when > 1 machine assigned, no text remarks) */}
                    <TableCell className="py-3 px-2.5 text-center space-y-1">
                      <Select
                        disabled={!isSpeedFactorEnabled}
                        value={String(isSpeedFactorEnabled ? row.machine_efficiency_multiplier : 1.0)}
                        onChange={(e) =>
                          handleUpdateConfig(
                            row.id,
                            "machine_efficiency_multiplier",
                            parseFloat(e.target.value) || 1.0
                          )
                        }
                        className={cn(
                          "h-8 text-xs font-mono font-bold tabular-nums",
                          isSpeedFactorEnabled
                            ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200"
                            : "bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-400 cursor-not-allowed"
                        )}
                        title={
                          isSpeedFactorEnabled
                            ? "Process Speed Factor (Sequential compounding division per extra machine)"
                            : "Assign 2 or more active machines to enable Speed Factor"
                        }
                      >
                        {SPEED_FACTOR_OPTIONS.map((sf) => (
                          <option key={sf} value={sf}>
                            {sf.toFixed(2)}x
                          </option>
                        ))}
                      </Select>
                      <div className="text-[10px] font-mono text-stone-500">
                        {isSpeedFactorEnabled ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                            {machineCount} Mach (÷{compoundDivisor}x)
                          </span>
                        ) : (
                          <span>{machineCount === 1 ? "1 Machine" : isQcGate ? "QC Bench" : "General WS"}</span>
                        )}
                      </div>
                    </TableCell>

                    {/* 6. Base vs Effective Cycle Time (Auto-accumulated when QC parameters exist) */}
                    <TableCell className="py-3 px-2.5 text-right space-y-1">
                      {hasQcParams ? (
                        <div className="space-y-0.5">
                          <div
                            className="inline-flex items-center justify-end gap-1 px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-xs font-mono font-bold text-indigo-900 dark:text-indigo-200 tabular-nums"
                            title="Automatically accumulated from individual IPQC parameter cycle times"
                          >
                            <span>Σ {row.cycle_time_minutes}m</span>
                          </div>
                          <div className="text-[9px] font-mono text-indigo-700 dark:text-indigo-400">
                            {qcParams.length} QC Param(s)
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={row.cycle_time_minutes}
                            onChange={(e) =>
                              handleUpdateConfig(
                                row.id,
                                "cycle_time_minutes",
                                Math.max(0.5, parseFloat(e.target.value) || 1)
                              )
                            }
                            className="w-14 text-right bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded px-1.5 py-1 text-xs font-mono font-bold text-stone-900 dark:text-stone-100 tabular-nums focus:bg-white dark:focus:bg-stone-900 focus:outline-stone-900"
                          />
                          <span className="text-[10px] font-mono text-stone-500">m</span>
                        </div>
                      )}
                      {isSpeedFactorEnabled && (
                        <div className="text-[10px] font-mono tabular-nums text-stone-500">
                          Mach CT: {machineCt}m
                        </div>
                      )}
                      <div className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-bold">
                        Eff: {effectiveCt}m
                      </div>
                    </TableCell>

                    {/* 7. Per-WOT CPM */}
                    <TableCell className="py-3 px-2.5 text-right font-mono tabular-nums space-y-0.5">
                      <div className="font-bold text-stone-900 dark:text-stone-100">
                        {wotHrs.toFixed(2)}h
                      </div>
                      {(scheduleInsight.stepContentionMinsMap?.[row.id] || 0) > 0 && (
                        <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                          +{scheduleInsight.stepContentionMinsMap[row.id]}m Shared
                        </div>
                      )}
                      <div
                        className={cn(
                          "text-[10px] font-bold",
                          isCritical ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
                        )}
                      >
                        Flt: {flt}h
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {processConfigs.length > INITIAL_STEP_LIMIT && (
            <div className="p-2.5 bg-stone-50 dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAllRows((prev) => !prev)}
                className="w-full py-1.5 px-3 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 border border-stone-200 dark:border-stone-700 text-[11px] font-bold text-stone-700 dark:text-stone-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {showAllRows ? (
                  <>
                    <span>Show Less (Top {INITIAL_STEP_LIMIT} Steps)</span>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    <span>
                      Show All {processConfigs.length} Process Steps (+{processConfigs.length - INITIAL_STEP_LIMIT} more)
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
  );
});
