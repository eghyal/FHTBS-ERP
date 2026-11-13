import React, { useCallback } from "react";
import {
  Plus,
  Trash2,
  Workflow,
  Package,
  Eye,
  GitBranch,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import {
  type BoPStepRow,
  type BopQcParameter,
  resolveBopProductRole,
  formatQcParametersSummary,
  parseLegacyQcCriteriaToParameters,
} from "../bopTypes";
import {
  BopProductQcBuilder,
  BopProcessQualityGateCallout,
} from "./BopQcParameterSection";
import { BopMaterialAllocationSection } from "./BopMaterialAllocationSection";

interface BopNodeInspectorProps {
  isFullscreen: boolean;
  isEngineering: boolean;
  selectedSteps: BoPStepRow[];
  selectedStep: BoPStepRow | null;
  steps: BoPStepRow[];
  stations: any[];
  projectBoms: any[];
  setSteps: React.Dispatch<React.SetStateAction<BoPStepRow[]>>;
  setShowStationModal: (val: boolean) => void;
  handleDeleteStep: (id: string) => void;
  handleDeleteSteps: (ids: string[]) => void;
  handleUpdateStep: (id: string, field: keyof BoPStepRow, value: any) => void;
  handleBulkUpdateStep: (ids: string[], field: keyof BoPStepRow, value: any) => void;
  onInsertWipGateAfterProcess?: (processId: string) => void;
  onSelectStep?: (id: string) => void;
  showToast: (msg: string, type?: "success" | "error" | "info" | "warning") => void;
  className?: string;
}

export const BopNodeInspector: React.FC<BopNodeInspectorProps> = React.memo(({
  isFullscreen,
  isEngineering,
  selectedSteps,
  selectedStep,
  steps,
  stations,
  projectBoms,
  setSteps,
  setShowStationModal,
  handleDeleteStep,
  handleDeleteSteps,
  handleUpdateStep,
  handleBulkUpdateStep,
  onInsertWipGateAfterProcess,
  onSelectStep,
  showToast,
  className,
}) => {
  const selectedProductRole = React.useMemo(() => {
    if (!selectedStep || selectedStep.node_type !== "PRODUCT") return null;
    return resolveBopProductRole(selectedStep.id, steps) || "MATERIAL_INPUT";
  }, [selectedStep, steps]);

  const effectiveQcParameters: BopQcParameter[] = React.useMemo(() => {
    if (!selectedStep || selectedStep.node_type !== "PRODUCT") return [];
    if (Array.isArray(selectedStep.qc_parameters) && selectedStep.qc_parameters.length > 0) {
      return selectedStep.qc_parameters;
    }
    if (selectedStep.qc_criteria && selectedStep.qc_criteria.trim()) {
      return parseLegacyQcCriteriaToParameters(selectedStep.qc_criteria);
    }
    return [];
  }, [selectedStep]);

  const updateProductQcParameters = useCallback(
    (newParams: BopQcParameter[]) => {
      if (!selectedStep) return;
      const summaryText = formatQcParametersSummary(newParams, "");
      setSteps((prev) =>
        prev.map((s) =>
          s.id === selectedStep.id
            ? {
                ...s,
                qc_parameters: newParams,
                qc_criteria: summaryText,
              }
            : s
        )
      );
      handleUpdateStep(selectedStep.id, "qc_parameters", newParams);
    },
    [selectedStep, setSteps, handleUpdateStep]
  );

  return (
    <div
      className={cn(
        "bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 shadow-2xs overflow-y-auto space-y-4",
        isFullscreen ? "h-full" : "h-[680px]",
        className
      )}
    >
      {selectedSteps.length > 1 ? (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 flex items-center justify-center font-mono tabular-nums font-bold text-xs">
                {selectedSteps.length}
              </span>
              <div>
                <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100">
                  Bulk Node Inspector
                </h4>
                <span className="text-[10px] text-stone-500 dark:text-stone-400 font-mono">
                  {selectedSteps.length} nodes selected
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleDeleteSteps(selectedSteps.map((s) => s.id))}
              className="w-7 h-7 flex items-center justify-center bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 border border-rose-200/70 dark:border-rose-800 rounded-lg transition-colors cursor-pointer shadow-2xs"
              title="Delete selected nodes"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                  Assign Workstation
                </label>
                <button
                  type="button"
                  onClick={() => setShowStationModal(true)}
                  className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  + Manage Stations
                </button>
              </div>
              <select
                value=""
                onChange={(e) => {
                  const stId = e.target.value;
                  if (!stId) return;
                  const procIds = selectedSteps
                    .filter((s) => (s.node_type || "PROCESS") === "PROCESS")
                    .map((s) => s.id);
                  if (procIds.length === 0) {
                    showToast("Select at least 1 Process node to assign a workstation.", "error");
                    return;
                  }
                  handleBulkUpdateStep(procIds, "station_id", stId);
                  const stObj = stations.find((st) => st.id === stId);
                  showToast(
                    `Assigned ${procIds.length} process node(s) to ${stObj?.station_name || stId}`,
                    "success"
                  );
                }}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-900 cursor-pointer"
              >
                <option value="">-- Select Workstation --</option>
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.station_code ? `${st.station_code} — ` : ""}
                    {st.station_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                BOM Material Allocation
              </label>
              <Select
                value=""
                onChange={(e) => {
                  const bomId = e.target.value;
                  if (bomId) {
                    const bom = projectBoms.find((b) => b.id === bomId);
                    if (!bom) return;

                    const targetSteps = selectedSteps.filter(
                      (s) =>
                        s.node_type === "PRODUCT" &&
                        resolveBopProductRole(s.id, steps) !== "FINISHED_GOOD"
                    );
                    if (targetSteps.length === 0) {
                      showToast(
                        "Select at least 1 Material Input or WIP Sub-Assy Product Card for BOM allocation.",
                        "error"
                      );
                      return;
                    }

                    const totalBomQty = Number(bom.required_qty || bom.qty || 0);
                    const uom = bom.uom || "qty";
                    let totalUsedQty = 0;

                    steps.forEach((s) => {
                      if (s.node_type === "PRODUCT" && s.bom_allocations) {
                        let allocs: any[] = [];
                        try {
                          allocs =
                            typeof s.bom_allocations === "string"
                              ? JSON.parse(s.bom_allocations)
                              : s.bom_allocations || [];
                        } catch (err) {}
                        const a = allocs.find((x: any) => x.bom_id === bomId);
                        if (a && !selectedSteps.find((ss) => ss.id === s.id)) {
                          const q =
                            a.qty !== undefined
                              ? Number(a.qty)
                              : Number(a.fraction || 0) * totalBomQty;
                          totalUsedQty += q;
                        }
                      }
                    });

                    const remainingQty = Math.max(0, totalBomQty - totalUsedQty);
                    const qtyPerStep = remainingQty / targetSteps.length;
                    const fractionPerStep = totalBomQty > 0 ? qtyPerStep / totalBomQty : 1.0;

                    setSteps((prev) =>
                      prev.map((s) => {
                        if (!targetSteps.find((ts) => ts.id === s.id)) return s;
                        let allocs: any[] = [];
                        try {
                          allocs =
                            typeof s.bom_allocations === "string"
                              ? JSON.parse(s.bom_allocations)
                              : s.bom_allocations || [];
                        } catch (err) {}
                        const existing = allocs.find((a: any) => a.bom_id === bomId);
                        if (!existing) {
                          allocs.push({
                            bom_id: bomId,
                            qty: qtyPerStep,
                            fraction: fractionPerStep,
                            bom_name: bom.item_name,
                            uom: uom,
                          });
                        } else {
                          existing.qty = qtyPerStep;
                          existing.fraction = fractionPerStep;
                        }
                        return { ...s, bom_allocations: allocs };
                      })
                    );
                    showToast(`Allocated ${bom.item_name} to ${targetSteps.length} node(s)`, "success");
                  }
                }}
                className="w-full text-xs"
              >
                <option value="" disabled>
                  -- Select Material from BOM --
                </option>
                {projectBoms.map((bom) => {
                  const totalBomQty = Number(bom.required_qty || bom.qty || 0);
                  const uom = bom.uom || "qty";
                  let totalUsedQty = 0;
                  steps.forEach((s) => {
                    if (s.node_type === "PRODUCT" && s.bom_allocations) {
                      let allocs: any[] = [];
                      try {
                        allocs =
                          typeof s.bom_allocations === "string"
                            ? JSON.parse(s.bom_allocations)
                            : s.bom_allocations || [];
                      } catch (e) {}
                      const a = allocs.find((x: any) => x.bom_id === bom.id);
                      if (a) {
                        const q =
                          a.qty !== undefined
                            ? Number(a.qty)
                            : Number(a.fraction || 0) * totalBomQty;
                        totalUsedQty += q;
                      }
                    }
                  });
                  const remainingQty = Math.max(0, totalBomQty - totalUsedQty);
                  const isFullyAllocated = totalBomQty > 0 ? remainingQty <= 0.001 : false;
                  return (
                    <option key={bom.id} value={bom.id} disabled={isFullyAllocated}>
                      {bom.item_name} ({bom.item_code}) —{" "}
                      {!isFullyAllocated
                        ? `Avail: ${remainingQty % 1 === 0 ? remainingQty : remainingQty.toFixed(2)} / ${totalBomQty} ${uom}`
                        : `Allocated`}
                    </option>
                  );
                })}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                Set Node Type
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700">
                <button
                  type="button"
                  onClick={() =>
                    handleBulkUpdateStep(
                      selectedSteps.map((s) => s.id),
                      "node_type",
                      "PROCESS"
                    )
                  }
                  className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-white dark:hover:bg-stone-900 border border-transparent"
                >
                  <Workflow className="w-3.5 h-3.5 text-blue-600" />
                  <span>Process</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleBulkUpdateStep(
                      selectedSteps.map((s) => s.id),
                      "node_type",
                      "PRODUCT"
                    )
                  }
                  className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 border border-transparent"
                >
                  <Package className="w-3.5 h-3.5 text-amber-600" />
                  <span>Product</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : selectedStep ? (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 flex items-center justify-center font-mono tabular-nums font-bold text-xs">
                {String(selectedStep.step_sequence).padStart(2, "0")}
              </span>
              <div>
                <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100">
                  Node Inspector
                </h4>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-stone-500 dark:text-stone-400">
                  {(!selectedStep.predecessor_ids || selectedStep.predecessor_ids.length === 0) && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                      <GitBranch className="w-3 h-3" />
                      Parallel Start
                    </span>
                  )}
                  {selectedStep.predecessor_ids && selectedStep.predecessor_ids.length === 1 && (
                    <span className="inline-flex items-center gap-1 text-stone-600 dark:text-stone-300 font-semibold">
                      <ArrowRight className="w-3 h-3" />
                      Serial (1 Input)
                    </span>
                  )}
                  {selectedStep.predecessor_ids && selectedStep.predecessor_ids.length > 1 && (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                      <Workflow className="w-3 h-3" />
                      Join ({selectedStep.predecessor_ids.length} Inputs)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {isEngineering && (
              <button
                type="button"
                onClick={() => handleDeleteStep(selectedStep.id)}
                className="w-7 h-7 flex items-center justify-center bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 border border-rose-200/70 dark:border-rose-800 rounded-lg transition-colors cursor-pointer shadow-2xs"
                title="Delete this node"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!isEngineering && (
            <div className="p-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-600 dark:text-stone-300 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-stone-500 shrink-0" />
              <span>Read-only mode</span>
            </div>
          )}

          <fieldset disabled={!isEngineering} className="space-y-4 border-none p-0 m-0">
            {/* Node Type Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                Node Type
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700">
                <button
                  type="button"
                  onClick={() => handleUpdateStep(selectedStep.id, "node_type", "PROCESS")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    (selectedStep.node_type || "PROCESS") === "PROCESS"
                      ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs border border-stone-200 dark:border-stone-700"
                      : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                  )}
                >
                  <Workflow className="w-3.5 h-3.5 text-blue-600" />
                  <span>Process</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStep(selectedStep.id, "node_type", "PRODUCT")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    selectedStep.node_type === "PRODUCT"
                      ? "bg-amber-500 text-white shadow-2xs"
                      : "text-amber-800 dark:text-amber-300 hover:text-amber-950"
                  )}
                >
                  <Package className="w-3.5 h-3.5 text-amber-100" />
                  <span>Product</span>
                </button>
              </div>
            </div>

            {/* Concise Topological Role Bar for Product Card */}
            {selectedStep.node_type === "PRODUCT" && (
              <div
                className={cn(
                  "px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2",
                  selectedProductRole === "WIP_SUB_ASSY"
                    ? "bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-950 dark:text-indigo-200"
                    : selectedProductRole === "FINISHED_GOOD"
                    ? "bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200"
                    : "bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-200"
                )}
              >
                <div className="font-bold flex items-center gap-1.5 truncate">
                  {selectedProductRole === "WIP_SUB_ASSY" ? (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>WIP / Sub-Assembly</span>
                    </>
                  ) : selectedProductRole === "FINISHED_GOOD" ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Finished Good</span>
                    </>
                  ) : (
                    <>
                      <Package className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                      <span>Material Input</span>
                    </>
                  )}
                </div>
                <span className="font-mono text-[10px] font-bold uppercase opacity-80 shrink-0">
                  {selectedProductRole === "WIP_SUB_ASSY"
                    ? "IPQC Gate"
                    : selectedProductRole === "FINISHED_GOOD"
                    ? "Final QC"
                    : "Raw Input"}
                </span>
              </div>
            )}

            {/* Process / Product Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                {selectedStep.node_type === "PRODUCT"
                  ? selectedProductRole === "WIP_SUB_ASSY"
                    ? "WIP / Sub-Assembly Name *"
                    : selectedProductRole === "FINISHED_GOOD"
                    ? "Finished Good Name *"
                    : "Material Input Name *"
                  : "Process / Operation Name *"}
              </label>
              <input
                type="text"
                value={selectedStep.process_name}
                onChange={(e) => handleUpdateStep(selectedStep.id, "process_name", e.target.value)}
                placeholder={
                  selectedStep.node_type === "PRODUCT"
                    ? selectedProductRole === "WIP_SUB_ASSY"
                      ? "e.g. WIP Sub-Assy Frame"
                      : selectedProductRole === "FINISHED_GOOD"
                      ? "e.g. Finished Panel Unit"
                      : "e.g. Raw Sheet Metal Input"
                    : "e.g. CNC Laser Cutting, TIG Welding"
                }
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-900 focus:outline-stone-500"
              />
            </div>

            {(selectedStep.node_type || "PROCESS") === "PROCESS" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                    Assigned Workstation *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowStationModal(true)}
                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Manage Stations</span>
                  </button>
                </div>
                <select
                  value={selectedStep.station_id || ""}
                  onChange={(e) => handleUpdateStep(selectedStep.id, "station_id", e.target.value)}
                  className={cn(
                    "w-full border rounded-xl px-3 py-2 text-xs font-bold focus:bg-white dark:focus:bg-stone-900 cursor-pointer",
                    !selectedStep.station_id ||
                      !stations.some(
                        (st) =>
                          st.id === selectedStep.station_id ||
                          st.station_code === selectedStep.station_id
                      )
                      ? "bg-amber-50/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200"
                      : "bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                  )}
                >
                  <option value="">-- Select Assigned Workstation --</option>
                  {stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.station_code ? `${st.station_code} — ` : ""}
                      {st.station_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Expected Yield (%) on WIP_SUB_ASSY and FINISHED_GOOD */}
            {selectedStep.node_type === "PRODUCT" &&
              (selectedProductRole === "WIP_SUB_ASSY" ||
                selectedProductRole === "FINISHED_GOOD") && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                    Expected Yield Rate (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={selectedStep.expected_yield_rate ?? 100}
                    onChange={(e) =>
                      handleUpdateStep(
                        selectedStep.id,
                        "expected_yield_rate",
                        parseFloat(e.target.value)
                      )
                    }
                    className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs font-bold font-mono tabular-nums text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-900 focus:outline-indigo-500"
                  />
                </div>
              )}

            {/* STRUCTURED QC PARAMETER BUILDER (Only on WIP_SUB_ASSY and FINISHED_GOOD Product Cards) */}
            {selectedStep.node_type === "PRODUCT" && selectedProductRole && (
              <BopProductQcBuilder
                selectedStep={selectedStep}
                selectedProductRole={selectedProductRole}
                effectiveQcParameters={effectiveQcParameters}
                updateProductQcParameters={updateProductQcParameters}
                handleUpdateStep={handleUpdateStep}
              />
            )}

            {/* BOM Material Allocation (PRODUCT) & Input Materials (PROCESS) */}
            <BopMaterialAllocationSection
              selectedStep={selectedStep}
              selectedProductRole={selectedProductRole}
              steps={steps}
              projectBoms={projectBoms}
              handleUpdateStep={handleUpdateStep}
            />

            {/* On PROCESS nodes: Output QC Gates */}
            <BopProcessQualityGateCallout
              selectedStep={selectedStep}
              steps={steps}
              isEngineering={isEngineering}
              onSelectStep={onSelectStep}
              onInsertWipGateAfterProcess={onInsertWipGateAfterProcess}
            />

            {/* SOP Instructions (Process Only) */}
            {(selectedStep.node_type || "PROCESS") === "PROCESS" && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                  SOP Instructions / Notes
                </label>
                <textarea
                  rows={2}
                  value={selectedStep.sop_instruction || selectedStep.notes || ""}
                  onChange={(e) =>
                    handleUpdateStep(selectedStep.id, "sop_instruction", e.target.value)
                  }
                  placeholder="Process parameters, tooling, or work notes..."
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-900 focus:outline-stone-500"
                />
              </div>
            )}

            {/* Dependency Links Manager (Upstream & Downstream) */}
            <div className="space-y-3 pt-3 border-t border-stone-100 dark:border-stone-800">
              {/* Section 1: Predecessors (Inputs) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                    Predecessors (Inputs)
                  </label>
                  <span className="text-[10px] font-mono tabular-nums text-stone-400">
                    {(selectedStep.predecessor_ids || []).length} connected
                  </span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {steps
                    .filter((s) => s.id !== selectedStep.id)
                    .map((otherStep) => {
                      const isConnected = (selectedStep.predecessor_ids || []).includes(
                        otherStep.id
                      );
                      return (
                        <label
                          key={otherStep.id}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all",
                            isConnected
                              ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                              : "bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200"
                          )}
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-mono font-bold",
                                otherStep.node_type === "PRODUCT"
                                  ? "bg-amber-500 text-white"
                                  : "bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200"
                              )}
                            >
                              {otherStep.node_type === "PRODUCT" ? "PROD" : "PROC"}
                            </span>
                            <span className="font-bold truncate">
                              {String(otherStep.step_sequence).padStart(2, "0")}.{" "}
                              {otherStep.process_name || "Untitled"}
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isConnected}
                            onChange={(e) => {
                              const current = selectedStep.predecessor_ids || [];
                              const updated = e.target.checked
                                ? [...current, otherStep.id]
                                : current.filter((id) => id !== otherStep.id);
                              handleUpdateStep(selectedStep.id, "predecessor_ids", updated);
                            }}
                            className="rounded text-emerald-600 focus:ring-emerald-600"
                          />
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Section 2: Feeds Into (Downstream Targets) */}
              <div className="space-y-1.5 pt-2 border-t border-dashed border-stone-200 dark:border-stone-800">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                  Feeds Into (Downstream)
                </label>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {steps
                    .filter((s) => s.id !== selectedStep.id)
                    .map((otherStep) => {
                      const otherPreds = otherStep.predecessor_ids || [];
                      const isFeedsInto = otherPreds.includes(selectedStep.id);
                      return (
                        <label
                          key={otherStep.id}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all",
                            isFeedsInto
                              ? "bg-blue-700 text-white border-blue-800 shadow-2xs"
                              : "bg-stone-50 dark:bg-stone-800/70 hover:bg-stone-100 dark:hover:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200"
                          )}
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[9px] font-mono font-bold",
                                otherStep.node_type === "PRODUCT"
                                  ? "bg-amber-500 text-white"
                                  : "bg-blue-600 text-white"
                              )}
                            >
                              {otherStep.node_type === "PRODUCT" ? "PROD" : "PROC"}
                            </span>
                            <span className="font-bold truncate">
                              {String(otherStep.step_sequence).padStart(2, "0")}.{" "}
                              {otherStep.process_name || "Untitled"}
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isFeedsInto}
                            onChange={(e) => {
                              const currentOtherPreds = otherStep.predecessor_ids || [];
                              const updatedOtherPreds = e.target.checked
                                ? [...currentOtherPreds, selectedStep.id]
                                : currentOtherPreds.filter((id) => id !== selectedStep.id);
                              handleUpdateStep(
                                otherStep.id,
                                "predecessor_ids",
                                updatedOtherPreds
                              );
                            }}
                            className="rounded text-blue-600 focus:ring-blue-600"
                          />
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>
          </fieldset>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-stone-400 space-y-3 py-16">
          <div className="p-3.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-full">
            <Workflow className="w-5 h-5 text-stone-400" />
          </div>
          <div className="text-center">
            <h4 className="text-xs font-bold text-stone-700 dark:text-stone-300">
              No Node Selected
            </h4>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 max-w-[190px] mt-0.5">
              Select a node on the canvas to configure its properties.
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
