import React, { memo, useState, useRef, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Clock,
  Users,
  ShieldCheck,
  Building2,
  Trash2,
  GitBranch,
  ArrowRight,
  Plus,
  Layers,
  Sparkles,
  Package,
  QrCode,
  ChevronDown,
  Workflow,
  RefreshCw,
  AlertTriangle,
  Wrench
} from "lucide-react";
import { cn } from "@/lib/utils";

import type { BopProductRole, BopQcParameter } from "./bopTypes";

export interface BopNodeData extends Record<string, unknown> {
  id: string;
  step_sequence: number;
  process_name: string;
  node_type?: "PROCESS" | "PRODUCT";
  product_role?: BopProductRole | null;
  work_center_id?: string;
  work_center_name?: string;
  station_id?: string;
  station_name?: string;
  assigned_machine_id?: string;
  machine_code?: string;
  machine_name?: string;
  machine_category?: string;
  cycle_time_minutes?: number;
  is_unassigned_station?: boolean;
  sop_instruction?: string;
  qc_criteria?: string;
  qc_parameters?: BopQcParameter[];
  notes?: string;
  bom_allocations?: {
    bom_id: string;
    fraction: number;
    qty?: number;
    uom?: string;
    bom_name?: string;
    planned_wave_number?: number;
    planned_delivery_date?: string;
    production_need_date?: string;
    pr_number?: string;
    pr_status?: string;
    po_number?: string;
    po_status?: string;
    plan_code?: string;
    consuming_process_name?: string;
  }[];
  procurement_summary?: {
    plan_code?: string;
    wave_number?: number;
    target_arrival_date?: string;
    production_need_date?: string;
    pr_number?: string;
    pr_status?: string;
    po_number?: string;
    po_status?: string;
    consuming_process_name?: string;
  } | null;
  stock_status?: "GREEN" | "YELLOW" | "RED";
  lifecycle_status?: string;
  expected_yield_rate?: number;
  is_dangling?: boolean;
  incomingCount: number;
  outgoingCount: number;
  isRoot: boolean;
  onAddChild?: (parentId: string, type?: "PROCESS" | "PRODUCT") => void;
  onAddParallel?: (siblingId: string, type?: "PROCESS" | "PRODUCT") => void;
  onDelete?: (id: string) => void;
  onSelectNode?: (id: string) => void;
}

export const BopFlowNode = memo(({ data, selected }: { data: BopNodeData; selected?: boolean }) => {
  const isProduct = data.node_type === "PRODUCT";
  const productRole: BopProductRole =
    data.product_role ||
    (data.incomingCount === 0
      ? "MATERIAL_INPUT"
      : data.outgoingCount > 0
        ? "WIP_SUB_ASSY"
        : "FINISHED_GOOD");

  const isMaterialInputCard = isProduct && productRole === "MATERIAL_INPUT";
  const isWipSubAssyCard = isProduct && productRole === "WIP_SUB_ASSY";
  const isFinishedGoodCard = isProduct && productRole === "FINISHED_GOOD";

  const isParallelStart = !isProduct && data.incomingCount === 0;
  const isSerial = !isProduct && data.incomingCount === 1;
  const isJoinConvergence = !isProduct && data.incomingCount > 1;

  const qcParamsList: BopQcParameter[] = Array.isArray(data.qc_parameters)
    ? data.qc_parameters
    : [];
  const mandatoryGateCount = qcParamsList.filter(
    (p) => p.is_mandatory_gate !== false,
  ).length;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as any)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  const productContainerClass = isWipSubAssyCard
    ? "bg-indigo-50/25 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-600 shadow-indigo-500/10"
    : isFinishedGoodCard
      ? "bg-emerald-50/25 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-600 shadow-emerald-500/10"
      : data.stock_status === "GREEN"
        ? "bg-amber-50/20 dark:bg-amber-950/40 border-emerald-500 dark:border-emerald-600 shadow-emerald-500/20"
        : data.stock_status === "RED"
          ? "bg-amber-50/20 dark:bg-amber-950/40 border-red-500 dark:border-red-600 shadow-red-500/20"
          : "bg-amber-50/20 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 shadow-amber-400/20";

  const productHeaderClass = isWipSubAssyCard
    ? "bg-indigo-100/70 dark:bg-indigo-950/60 border-indigo-200/80 dark:border-indigo-800/80 rounded-t-xl"
    : isFinishedGoodCard
      ? "bg-emerald-100/70 dark:bg-emerald-950/60 border-emerald-200/80 dark:border-emerald-800/80 rounded-t-xl"
      : "bg-amber-100/60 dark:bg-amber-950/60 border-amber-200/80 dark:border-amber-800/80 rounded-t-xl";

  const productSeqBadgeClass = isWipSubAssyCard
    ? "bg-indigo-600 text-white"
    : isFinishedGoodCard
      ? "bg-emerald-600 text-white"
      : "bg-amber-600 text-white";

  const productHandleClass = isWipSubAssyCard
    ? "!bg-indigo-600"
    : isFinishedGoodCard
      ? "!bg-emerald-600"
      : "!bg-amber-600";

  return (
    <div
      onClick={() => data.onSelectNode && data.onSelectNode(data.id)}
      className={cn(
        "relative bg-white dark:bg-stone-900 border transition-all duration-200 cursor-pointer select-none text-left w-[290px] shadow-sm",
        isProduct
          ? `-skew-x-12 transform rounded-xl border-2 ${productContainerClass}`
          : "rounded-2xl border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 hover:shadow-md",
        selected
          ? "border-stone-900 dark:border-stone-100 ring-4 ring-stone-900/10 dark:ring-stone-100/20 shadow-lg"
          : "hover:shadow-md",
        !isProduct && data.is_unassigned_station && "border-amber-400 ring-2 ring-amber-400/20",
        !isProduct && isParallelStart && "border-t-4 border-t-emerald-500",
        !isProduct && isSerial && "border-t-4 border-t-stone-500",
        !isProduct && isJoinConvergence && "border-t-4 border-t-amber-500"
      )}
    >
      <div className={cn("w-full h-full", isProduct && "skew-x-12 transform")}>
        {/* Target (Input) Handle */}
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            "!w-3.5 !h-3.5 !border-2 !border-white dark:!border-stone-900 hover:!scale-125 transition-transform !-left-2",
            isProduct ? productHandleClass : "!bg-stone-600 dark:!bg-stone-400"
          )}
        />

        {/* Header Badge & Sequence */}
        <div className={cn(
          "p-3.5 pb-2 border-b flex items-center justify-between",
          isProduct ? productHeaderClass : "border-stone-100 dark:border-stone-800"
        )}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "w-6 h-6 rounded-lg text-white flex items-center justify-center text-[11px] font-black font-mono",
              isProduct ? productSeqBadgeClass : "bg-stone-700 dark:bg-stone-800"
            )}>
              {String(data.step_sequence || 1).padStart(2, "0")}
            </span>

            {isProduct ? (
              isMaterialInputCard ? (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-400/80 flex items-center gap-1 shadow-2xs">
                  <Package className="w-3 h-3 text-amber-700" />
                  MATERIAL INPUT
                  <span className="bg-amber-900 text-amber-100 px-1.5 rounded-sm ml-1">
                    {data.bom_allocations?.length || 0}
                  </span>
                </span>
              ) : isWipSubAssyCard ? (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-200 text-indigo-950 border border-indigo-400/80 flex items-center gap-1 shadow-2xs">
                  <ShieldCheck className="w-3 h-3 text-indigo-700" />
                  WIP / SUB-ASSY · IPQC
                  <span className="bg-indigo-900 text-indigo-100 px-1.5 rounded-sm ml-0.5">
                    {qcParamsList.length} QC
                  </span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-200 text-emerald-950 border border-emerald-400/80 flex items-center gap-1 shadow-2xs">
                  <ShieldCheck className="w-3 h-3 text-emerald-700" />
                  FINISHED GOOD · FQC
                  <span className="bg-emerald-900 text-emerald-100 px-1.5 rounded-sm ml-0.5">
                    {qcParamsList.length} QC
                  </span>
                </span>
              )
            ) : (
              <>
                {isParallelStart && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                    PARALLEL (Independent)
                  </span>
                )}
                {isSerial && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-stone-100 text-stone-800 border border-stone-300">
                    SERIAL (Dependent)
                  </span>
                )}
                {isJoinConvergence && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                    JOIN ({data.incomingCount} Branches)
                  </span>
                )}

              </>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              data.onDelete && data.onDelete(data.id);
            }}
            className="w-6 h-6 flex items-center justify-center bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 border border-rose-200/70 rounded-md transition-colors cursor-pointer shadow-2xs"
            title="Delete node"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body: Process or Product Name */}
        <div className="p-3.5 space-y-2">
          <div>
            <h4 className={cn(
              "text-xs font-black leading-snug line-clamp-2",
              isProduct
                ? isWipSubAssyCard
                  ? "text-indigo-950 font-bold"
                  : isFinishedGoodCard
                    ? "text-emerald-950 font-bold"
                    : "text-amber-950 font-bold"
                : "text-stone-900"
            )}>
              {data.process_name || <span className="text-stone-400 italic">{isProduct ? "Untitled Product Node" : "Untitled Process"}</span>}
            </h4>
          </div>

          {isProduct ? (
            <>
              {/* BOM Material Allocations (Shown on MATERIAL_INPUT and optionally on WIP_SUB_ASSY when co-materials are added) */}
              {!isFinishedGoodCard && data.bom_allocations && data.bom_allocations.length > 0 && (
                <div className="flex flex-col gap-1 text-[10px] text-amber-900 bg-amber-50/50 border border-amber-200/80 rounded-lg p-1.5 px-2 font-medium">
                  <div className="font-bold flex items-center justify-between gap-1 opacity-80 mb-0.5">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {isWipSubAssyCard ? "Sub-Assy BOM Add-on:" : "Allocated Material:"}
                    </span>
                    {data.procurement_summary?.consuming_process_name && (
                      <span className="text-[9px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded">
                        → {data.procurement_summary.consuming_process_name}
                      </span>
                    )}
                  </div>
                  {data.bom_allocations.map((a: any, i: number) => {
                    const valDisplay = a.qty !== undefined
                      ? `${a.qty % 1 === 0 ? a.qty : a.qty.toFixed(2)} ${a.uom || ''}`
                      : `${Math.round((a.fraction || 0) * 100)}%`;
                    return (
                      <div key={i} className="flex justify-between items-center text-[9px] bg-white dark:bg-stone-900 px-1.5 py-0.5 rounded border border-amber-100 dark:border-amber-900/60">
                        <span className="truncate w-2/3 text-stone-900 dark:text-stone-100">{a.bom_name || a.bom_id.substring(0,6)}</span>
                        <span className="font-mono font-black text-amber-900 dark:text-amber-300">{valDisplay}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Live Procurement Readiness (Shown when BOM materials are allocated on Material Input or WIP Sub-Assy) */}
              {!isFinishedGoodCard && data.procurement_summary && (
                <div className="flex flex-col gap-1 text-[9px] bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded-lg p-1.5 px-2 border border-stone-200 dark:border-stone-700 shadow-2xs">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                      {data.procurement_summary.wave_number
                        ? `Wave #${data.procurement_summary.wave_number}`
                        : "Procurement Sync"}
                    </span>
                    {data.procurement_summary.target_arrival_date ? (
                      <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                        ETA {data.procurement_summary.target_arrival_date}
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        Pending Plan
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[8px] text-stone-600 dark:text-stone-400 font-mono">
                    <span className="truncate">
                      {data.procurement_summary.pr_number
                        ? `${data.procurement_summary.pr_number} (${data.procurement_summary.pr_status || "OPEN"})`
                        : "BOM MRP Netted"}
                    </span>
                    {data.procurement_summary.po_number ? (
                      <span className="text-blue-700 dark:text-sky-300 font-bold shrink-0">
                        {data.procurement_summary.po_number}
                      </span>
                    ) : (
                      <span className="text-stone-500 dark:text-stone-400 shrink-0">
                        {data.procurement_summary.plan_code || "PR Queue"}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Structured QC Inspection Gate (Shown on WIP_SUB_ASSY and FINISHED_GOOD) */}
              {(isWipSubAssyCard || isFinishedGoodCard) && (
                <div
                  className={cn(
                    "flex flex-col gap-1 text-[9px] rounded-lg p-1.5 px-2 border",
                    isWipSubAssyCard
                      ? "bg-indigo-50/70 border-indigo-200/90 text-indigo-950"
                      : "bg-emerald-50/70 border-emerald-200/90 text-emerald-950",
                  )}
                >
                  <div className="flex items-center justify-between gap-1 font-bold">
                    <span className="flex items-center gap-1">
                      <ShieldCheck
                        className={cn(
                          "w-3 h-3 shrink-0",
                          isWipSubAssyCard ? "text-indigo-600" : "text-emerald-600",
                        )}
                      />
                      <span>
                        {isWipSubAssyCard ? "IPQC Checkpoints" : "Final QC Checkpoints"}
                      </span>
                    </span>
                    {mandatoryGateCount > 0 && (
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded text-[8px] font-mono font-black uppercase",
                          isWipSubAssyCard
                            ? "bg-indigo-900 text-indigo-100"
                            : "bg-emerald-900 text-emerald-100",
                        )}
                      >
                        HOLD GATE ({mandatoryGateCount})
                      </span>
                    )}
                  </div>

                  {qcParamsList.length > 0 ? (
                    <div className="space-y-0.5 pt-0.5">
                      {qcParamsList.slice(0, 3).map((qcp, qIdx) => (
                        <div
                          key={qcp.id || qIdx}
                          className="flex items-center justify-between gap-1 bg-white/90 dark:bg-stone-900/90 px-1.5 py-0.5 rounded border border-stone-200/80 dark:border-stone-800 text-[8.5px]"
                        >
                          <span className="font-bold truncate max-w-[110px] text-stone-900 dark:text-stone-100">
                            {qcp.parameter_name}
                          </span>
                          <span className="font-mono text-stone-700 dark:text-stone-300 truncate">
                            {qcp.specification}
                          </span>
                        </div>
                      ))}
                      {qcParamsList.length > 3 && (
                        <div className="text-[8px] font-mono opacity-75 text-right">
                          +{qcParamsList.length - 3} more parameter(s)
                        </div>
                      )}
                    </div>
                  ) : data.qc_criteria ? (
                    <div className="text-[9px] italic line-clamp-2 bg-white/80 dark:bg-stone-900/80 px-1.5 py-0.5 rounded border border-stone-200/70 dark:border-stone-800 text-stone-700 dark:text-stone-300">
                      {data.qc_criteria}
                    </div>
                  ) : (
                    <div className="text-[8.5px] italic opacity-75">
                      Click node to configure structured QC parameters
                    </div>
                  )}
                </div>
              )}

              {/* Footer QR / Yield / Material Input Tag */}
              <div
                className={cn(
                  "flex items-center gap-1.5 text-[10px] rounded-xl p-1.5 px-2 font-medium mt-1 border",
                  isMaterialInputCard
                    ? "text-amber-800 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60 border-amber-300/80 dark:border-amber-800/80"
                    : isWipSubAssyCard
                      ? "text-indigo-900 dark:text-indigo-300 bg-indigo-100/70 dark:bg-indigo-950/60 border-indigo-300/80 dark:border-indigo-800/80"
                      : "text-emerald-900 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 border-emerald-300/80 dark:border-emerald-800/80",
                )}
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                <span className="line-clamp-1 flex-1">
                  {isMaterialInputCard
                    ? "Material Feed QR"
                    : isWipSubAssyCard
                      ? "WIP Sub-Assy Traveler"
                      : "Auto FGR QR Output"}
                </span>
                {!isMaterialInputCard && data.expected_yield_rate !== undefined && (
                  <span
                    className={cn(
                      "font-mono font-black shrink-0 px-1.5 py-0.5 rounded border text-[9px]",
                      isWipSubAssyCard
                        ? "bg-indigo-200 dark:bg-indigo-900 border-indigo-400 dark:border-indigo-700 text-indigo-950 dark:text-indigo-100"
                        : "bg-emerald-200 dark:bg-emerald-900 border-emerald-400 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100",
                    )}
                  >
                    Yield: {data.expected_yield_rate}%
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              {/* Machine Assignment Badge */}
              {data.assigned_machine_id ? (
                <div className="flex items-center justify-between gap-1 text-[10px] text-blue-900 dark:text-blue-300 bg-blue-50/80 dark:bg-blue-950/60 border border-blue-200/90 dark:border-blue-800 rounded-lg p-1 px-2 font-bold">
                  <div className="flex items-center gap-1 truncate">
                    <Wrench className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="truncate">{data.machine_name || data.machine_code || "Machine Bound"}</span>
                  </div>
                  {data.cycle_time_minutes ? (
                    <span className="font-mono text-[9px] text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-900/60 px-1 py-0.2 rounded shrink-0">
                      {data.cycle_time_minutes}m
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-1 text-[9px] text-stone-400 dark:text-stone-500 bg-stone-50 dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-800 rounded-lg p-1 px-2 font-medium">
                  <Wrench className="w-3 h-3 text-stone-300 dark:text-stone-600 shrink-0" />
                  <span className="truncate italic">Unbound Machine Asset</span>
                </div>
              )}

              {data.is_unassigned_station ? (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-lg p-1.5 px-2 font-bold shadow-2xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
                  <span className="truncate">Unassigned Station</span>
                </div>
              ) : data.station_name ? (
                <div className="flex items-center gap-1 text-[10px] text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 border border-stone-200/90 dark:border-stone-700 rounded-lg p-1 px-2 font-medium">
                  <Layers className="w-3 h-3 text-stone-500 dark:text-stone-400 shrink-0" />
                  <span className="truncate font-semibold">{data.station_name}</span>
                </div>
              ) : null}

              {data.sop_instruction && (
                <div className="flex items-start gap-1 text-[10px] text-stone-600 dark:text-stone-400 bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-800 rounded-xl p-1.5 px-2">
                  <Workflow className="w-3 h-3 text-stone-500 dark:text-stone-400 shrink-0 mt-0.5" />
                  <span className="line-clamp-1 italic">{data.sop_instruction}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Unified Quick Connect Action */}
        <div className="px-2.5 py-1.5 bg-stone-50/80 dark:bg-stone-900/80 border-t border-stone-100 dark:border-stone-800 rounded-b-xl flex items-center justify-between text-[10px] gap-1 relative" ref={menuRef}>
          <div className="relative w-full">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="w-full flex items-center justify-between text-stone-700 dark:text-stone-300 hover:text-stone-950 dark:hover:text-stone-100 font-bold hover:bg-stone-200/70 dark:hover:bg-stone-800 px-2.5 py-1 rounded-lg transition-colors border border-stone-200/60 dark:border-stone-800 bg-white dark:bg-stone-900"
              title="Connect node (Process or Product)"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                <span>Connect Node</span>
              </span>
              <ChevronDown className={cn("w-3 h-3 text-stone-400 transition-transform", menuOpen && "rotate-180")} />
            </button>

            {/* Dropdown Menu for Connected Steps */}
            {menuOpen && (
              <div 
                className="absolute bottom-full left-0 mb-1.5 w-44 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 text-left"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    data.onAddChild && data.onAddChild(data.id, "PROCESS");
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-stone-800 dark:text-stone-200 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-900 dark:hover:text-blue-300 rounded-lg transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Process</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    data.onAddChild && data.onAddChild(data.id, "PRODUCT");
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-stone-800 dark:text-stone-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-950 dark:hover:text-indigo-300 rounded-lg transition-colors mt-0.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{isProduct ? "Product Node" : "Product (WIP / QC Gate)"}</span>
                </button>

                <div className="border-t border-stone-100 my-1"></div>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    data.onAddParallel && data.onAddParallel(data.id, "PROCESS");
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-emerald-50 hover:text-emerald-900 rounded-lg transition-colors"
                >
                  <GitBranch className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Parallel Branch</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Source (Output) Handle */}
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            "!w-3.5 !h-3.5 !border-2 !border-white hover:!scale-125 transition-transform !-right-2",
            isProduct ? productHandleClass : "!bg-stone-600"
          )}
        />
      </div>
    </div>
  );
});

BopFlowNode.displayName = "BopFlowNode";

