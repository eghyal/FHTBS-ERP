import React from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getUpstreamProductNodes,
  analyzeBopNodeMaterialPriority,
} from "@/utils/bopGraph";
import { type BoPStepRow, type BopProductRole } from "../bopTypes";

interface BopMaterialAllocationSectionProps {
  selectedStep: BoPStepRow;
  selectedProductRole: BopProductRole | null;
  steps: BoPStepRow[];
  projectBoms: any[];
  handleUpdateStep: (id: string, field: keyof BoPStepRow, value: any) => void;
}

export const BopMaterialAllocationSection: React.FC<BopMaterialAllocationSectionProps> = React.memo(
  ({
    selectedStep,
    selectedProductRole,
    steps,
    projectBoms,
    handleUpdateStep,
  }) => {
    if (selectedStep.node_type === "PRODUCT") {
      return (
        <div className="space-y-1.5 pt-2 border-t border-stone-100 dark:border-stone-800">
          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center justify-between">
            <span>
              {selectedProductRole === "WIP_SUB_ASSY"
                ? "Sub-Assy BOM Allocation"
                : "BOM Material Allocation"}
            </span>
          </label>

          {selectedProductRole === "FINISHED_GOOD" ? (
            <div className="p-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-[11px] text-stone-600 dark:text-stone-400">
              Finished Good output node. Allocate BOM materials on Material Input or WIP Sub-Assy nodes.
            </div>
          ) : (
            <div className="space-y-2">
              {selectedStep.bom_allocations && selectedStep.bom_allocations.length > 0 ? (
                selectedStep.bom_allocations.map((alloc, idx) => {
                  const bomRef = projectBoms.find((b) => b.id === alloc.bom_id);
                  const totalBomQty = Number(bomRef?.required_qty || bomRef?.qty || 0);
                  const uom = bomRef?.uom || alloc.uom || "qty";

                  let usedInOtherStepsQty = 0;
                  steps.forEach((s) => {
                    if (
                      s.node_type === "PRODUCT" &&
                      s.bom_allocations &&
                      s.id !== selectedStep.id
                    ) {
                      let allocs: any[] = [];
                      try {
                        allocs =
                          typeof s.bom_allocations === "string"
                            ? JSON.parse(s.bom_allocations)
                            : s.bom_allocations || [];
                      } catch (e) {}
                      const found = allocs.find((x: any) => x.bom_id === alloc.bom_id);
                      if (found) {
                        const q =
                          found.qty !== undefined
                            ? Number(found.qty)
                            : Number(found.fraction || 0) * totalBomQty;
                        usedInOtherStepsQty += q;
                      }
                    }
                  });

                  const maxAllocatableQty = Math.max(0, totalBomQty - usedInOtherStepsQty);
                  const currentQty =
                    alloc.qty !== undefined
                      ? Number(alloc.qty)
                      : Number(alloc.fraction || 0) * totalBomQty;
                  const currentFraction = totalBomQty > 0 ? currentQty / totalBomQty : 0;

                  const smartPriority = analyzeBopNodeMaterialPriority(
                    selectedStep.id,
                    steps as any[],
                    `${bomRef?.item_name || alloc.bom_name || ""} ${bomRef?.category || ""}`
                  );
                  const badgeTone =
                    smartPriority.priorityTier === "CRITICAL_MAIN"
                      ? "bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                      : smartPriority.priorityTier === "CORE_PROCESS"
                      ? "bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800"
                      : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700";

                  return (
                    <div
                      key={idx}
                      className="flex flex-col gap-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-2.5 rounded-xl shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[11px] font-bold text-stone-900 dark:text-stone-100 truncate pr-2"
                          title={
                            bomRef
                              ? `${bomRef.item_name} (${bomRef.item_code})`
                              : "Unknown Material"
                          }
                        >
                          {bomRef
                            ? `${bomRef.item_name} (${bomRef.item_code})`
                            : "Unknown Material"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const newAllocs = [...(selectedStep.bom_allocations || [])];
                            newAllocs.splice(idx, 1);
                            handleUpdateStep(selectedStep.id, "bom_allocations", newAllocs);
                          }}
                          className="text-stone-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                          title="Remove allocation"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-2 py-1 flex-1 focus-within:bg-white dark:focus-within:bg-stone-900 focus-within:border-amber-500">
                          <input
                            type="number"
                            min="0"
                            max={maxAllocatableQty > 0 ? maxAllocatableQty : undefined}
                            step="any"
                            value={currentQty}
                            onChange={(e) => {
                              let val = parseFloat(e.target.value);
                              if (isNaN(val) || val < 0) val = 0;
                              if (totalBomQty > 0 && val > maxAllocatableQty) {
                                val = maxAllocatableQty;
                              }
                              const calcFraction = totalBomQty > 0 ? val / totalBomQty : 0;

                              const newAllocs = [...(selectedStep.bom_allocations || [])];
                              newAllocs[idx] = {
                                ...newAllocs[idx],
                                qty: val,
                                fraction: calcFraction,
                                uom: uom,
                                bom_name: bomRef?.item_name || newAllocs[idx].bom_name,
                              };
                              handleUpdateStep(selectedStep.id, "bom_allocations", newAllocs);
                            }}
                            className="w-full bg-transparent text-xs font-bold font-mono tabular-nums text-stone-900 dark:text-stone-100 focus:outline-none"
                            placeholder="0"
                          />
                          <span className="text-xs font-bold font-mono tabular-nums text-stone-500 dark:text-stone-400 shrink-0">
                            / {totalBomQty} {uom}
                          </span>
                        </div>

                        <span className="text-[10px] font-mono tabular-nums font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 shrink-0">
                          {Math.round(currentFraction * 100)}%
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-stone-100 dark:border-stone-800 text-[10px]">
                        <span className="text-stone-500 dark:text-stone-400 font-mono tabular-nums truncate">
                          {totalBomQty > 0
                            ? `Avail: ${maxAllocatableQty % 1 === 0 ? maxAllocatableQty : maxAllocatableQty.toFixed(2)} ${uom}`
                            : smartPriority.reason}
                        </span>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded border text-[9.5px] font-semibold shrink-0",
                            badgeTone
                          )}
                          title={smartPriority.reason}
                        >
                          {smartPriority.priorityLabel}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-2.5 border border-dashed border-stone-300 dark:border-stone-700 rounded-xl">
                  <span className="text-[10px] text-stone-500 dark:text-stone-400">
                    No BOM materials allocated
                  </span>
                </div>
              )}

              <div className="pt-1">
                <select
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-1.5 text-xs text-stone-700 dark:text-stone-200 font-bold focus:bg-white dark:focus:bg-stone-900 cursor-pointer"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const bomId = e.target.value;
                    const bom = projectBoms.find((b) => b.id === bomId);
                    if (!bom) return;

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
                        const a = allocs.find((x: any) => x.bom_id === bomId);
                        if (a && s.id !== selectedStep.id) {
                          const q =
                            a.qty !== undefined
                              ? Number(a.qty)
                              : Number(a.fraction || 0) * totalBomQty;
                          totalUsedQty += q;
                        }
                      }
                    });

                    const remainingQty = Math.max(0, totalBomQty - totalUsedQty);
                    const newAllocs = [...(selectedStep.bom_allocations || [])];
                    if (!newAllocs.find((a) => a.bom_id === bomId)) {
                      newAllocs.push({
                        bom_id: bomId,
                        qty: remainingQty,
                        fraction: totalBomQty > 0 ? remainingQty / totalBomQty : 1.0,
                        bom_name: bom.item_name,
                        uom: uom,
                      });
                      handleUpdateStep(selectedStep.id, "bom_allocations", newAllocs);
                    }
                  }}
                >
                  <option value="">
                    {selectedProductRole === "WIP_SUB_ASSY"
                      ? "+ Add Sub-Assy BOM Component"
                      : "+ Allocate Material from BOM"}
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
                        if (a && s.id !== selectedStep.id) {
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
                          ? `Avail: ${
                              remainingQty % 1 === 0 ? remainingQty : remainingQty.toFixed(2)
                            } / ${totalBomQty} ${uom}`
                          : `Allocated (${totalBomQty} ${uom})`}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}
        </div>
      );
    }

    // PROCESS node: Aggregated Material Requirements
    const upstreamProducts = getUpstreamProductNodes(selectedStep.id, steps);
    const materialMap = new Map<string, { fraction: number; bomRef: any }>();

    upstreamProducts.forEach((prod) => {
      let allocs = [];
      try {
        allocs =
          typeof prod.bom_allocations === "string"
            ? JSON.parse(prod.bom_allocations)
            : prod.bom_allocations || [];
      } catch (e) {}

      allocs.forEach((a: any) => {
        const bomRef = projectBoms.find((b) => b.id === a.bom_id);
        if (bomRef) {
          const existing = materialMap.get(a.bom_id);
          if (existing) {
            existing.fraction += Number(a.fraction || 0);
          } else {
            materialMap.set(a.bom_id, {
              fraction: Number(a.fraction || 0),
              bomRef,
            });
          }
        }
      });
    });

    const aggregatedMaterials = Array.from(materialMap.values());

    return (
      <div className="space-y-1.5 pt-2 border-t border-stone-100 dark:border-stone-800">
        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center justify-between">
          <span>Input Materials</span>
        </label>
        <div className="space-y-2">
          {aggregatedMaterials.length === 0 ? (
            <div className="text-center py-2.5 border border-dashed border-stone-300 dark:border-stone-700 rounded-xl">
              <span className="text-[10px] text-stone-500 dark:text-stone-400">
                No upstream BOM materials connected
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {aggregatedMaterials.map((mat, idx) => {
                const smartPriority = analyzeBopNodeMaterialPriority(
                  selectedStep.id,
                  steps as any[],
                  `${mat.bomRef.item_name || ""} ${mat.bomRef.category || ""}`
                );
                const badgeTone =
                  smartPriority.priorityTier === "CRITICAL_MAIN"
                    ? "bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                    : smartPriority.priorityTier === "CORE_PROCESS"
                    ? "bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800"
                    : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700";
                return (
                  <div
                    key={idx}
                    className="flex flex-col gap-1 bg-stone-50 dark:bg-stone-800/70 border border-stone-200 dark:border-stone-700 p-2 rounded-lg shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-stone-900 dark:text-stone-100 truncate pr-2">
                        {mat.bomRef.item_name} ({mat.bomRef.item_code})
                      </span>
                      <span className="font-mono tabular-nums font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                        {Math.round(mat.fraction * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-stone-500 dark:text-stone-400 font-mono tabular-nums">
                        Qty:{" "}
                        {(
                          mat.fraction *
                          Number(mat.bomRef.required_qty || mat.bomRef.qty || 0)
                        ).toFixed(2)}{" "}
                        {mat.bomRef.uom || "qty"}
                      </span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded border text-[9.5px] font-semibold",
                          badgeTone
                        )}
                        title={smartPriority.reason}
                      >
                        {smartPriority.priorityLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }
);
