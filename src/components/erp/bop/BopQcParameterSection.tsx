import React from "react";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BoPStepRow,
  type BopQcParameter,
  type BopProductRole,
  resolveBopProductRole,
} from "../bopTypes";

const MEASUREMENT_METHOD_OPTIONS = [
  "Caliper / Vernier",
  "Micrometer",
  "Visual Check",
  "Measuring Tape / Ruler",
  "Go/No-Go Gauge",
  "Welding Gauge / NDT",
  "CMM / Dial Indicator",
  "Multimeter / Megger",
];

interface BopProductQcBuilderProps {
  selectedStep: BoPStepRow;
  selectedProductRole: BopProductRole;
  effectiveQcParameters: BopQcParameter[];
  updateProductQcParameters: (newParams: BopQcParameter[]) => void;
  handleUpdateStep: (id: string, field: keyof BoPStepRow, value: any) => void;
}

export const BopProductQcBuilder: React.FC<BopProductQcBuilderProps> = React.memo(({
  selectedStep,
  selectedProductRole,
  effectiveQcParameters,
  updateProductQcParameters,
  handleUpdateStep,
}) => {
  if (
    selectedStep.node_type !== "PRODUCT" ||
    (selectedProductRole !== "WIP_SUB_ASSY" && selectedProductRole !== "FINISHED_GOOD")
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "space-y-3 p-3.5 rounded-2xl border",
        selectedProductRole === "WIP_SUB_ASSY"
          ? "bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/70"
          : "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <label
          className={cn(
            "text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5",
            selectedProductRole === "WIP_SUB_ASSY"
              ? "text-indigo-900 dark:text-indigo-200"
              : "text-emerald-900 dark:text-emerald-200"
          )}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>
            {selectedProductRole === "WIP_SUB_ASSY"
              ? "IPQC Parameters (Sub-Assy Gate)"
              : "Final QC Parameters (Finished Good)"}
          </span>
        </label>
        <button
          type="button"
          onClick={() => {
            const nextIdx = effectiveQcParameters.length + 1;
            const nextParams: BopQcParameter[] = [
              ...effectiveQcParameters,
              {
                id: `QCP-${Date.now()}-${nextIdx}`,
                parameter_name: "",
                specification: "",
                measurement_method: "Caliper / Vernier",
                is_mandatory_gate: true,
              },
            ];
            updateProductQcParameters(nextParams);
          }}
          className={cn(
            "px-2.5 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-2xs",
            selectedProductRole === "WIP_SUB_ASSY"
              ? "bg-indigo-600 hover:bg-indigo-700 text-white"
              : "bg-stone-900 hover:bg-stone-800 text-white"
          )}
        >
          <Plus className="w-3 h-3" />
          <span>Add Parameter</span>
        </button>
      </div>

      {effectiveQcParameters.length > 0 ? (
        <div className="space-y-2">
          {effectiveQcParameters.map((param, pIdx) => (
            <div
              key={param.id || pIdx}
              className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 space-y-2 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono font-bold text-stone-500 dark:text-stone-400 uppercase">
                  Check #{pIdx + 1}
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-1.5 py-0.5 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={param.is_mandatory_gate !== false}
                      onChange={(e) => {
                        const updated = effectiveQcParameters.map((item, idx) =>
                          idx === pIdx ? { ...item, is_mandatory_gate: e.target.checked } : item
                        );
                        updateProductQcParameters(updated);
                      }}
                      className="rounded text-rose-600 focus:ring-rose-500 w-3 h-3"
                    />
                    <span>HOLD GATE</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = effectiveQcParameters.filter((_, idx) => idx !== pIdx);
                      updateProductQcParameters(updated);
                    }}
                    className="text-stone-400 hover:text-rose-600 p-0.5 cursor-pointer"
                    title="Remove QC parameter"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div>
                  <label className="text-[9px] font-bold text-stone-400 uppercase block mb-0.5">
                    Inspection Parameter *
                  </label>
                  <input
                    type="text"
                    value={param.parameter_name}
                    onChange={(e) => {
                      const updated = effectiveQcParameters.map((item, idx) =>
                        idx === pIdx ? { ...item, parameter_name: e.target.value } : item
                      );
                      updateProductQcParameters(updated);
                    }}
                    placeholder="e.g. Cut Dimension, Bend Angle, Weld Flatness"
                    className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-900 focus:outline-indigo-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <div>
                    <label className="text-[9px] font-bold text-stone-400 uppercase block mb-0.5">
                      Tolerance / Specification
                    </label>
                    <input
                      type="text"
                      value={param.specification}
                      onChange={(e) => {
                        const updated = effectiveQcParameters.map((item, idx) =>
                          idx === pIdx ? { ...item, specification: e.target.value } : item
                        );
                        updateProductQcParameters(updated);
                      }}
                      placeholder="e.g. ±0.2 mm / 90° ±0.5°"
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-2 py-1 text-[11px] font-mono text-stone-800 dark:text-stone-200 focus:bg-white dark:focus:bg-stone-900 focus:outline-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-stone-400 uppercase block mb-0.5">
                      Measurement Method
                    </label>
                    <select
                      value={param.measurement_method || "Caliper / Vernier"}
                      onChange={(e) => {
                        const updated = effectiveQcParameters.map((item, idx) =>
                          idx === pIdx ? { ...item, measurement_method: e.target.value } : item
                        );
                        updateProductQcParameters(updated);
                      }}
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-2 py-1 text-[11px] font-semibold text-stone-800 dark:text-stone-200 focus:bg-white dark:focus:bg-stone-900 cursor-pointer"
                    >
                      {MEASUREMENT_METHOD_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-2.5 bg-white/80 dark:bg-stone-900/60 border border-dashed border-stone-300 dark:border-stone-700 rounded-xl">
          <span className="text-[10px] text-stone-500 dark:text-stone-400">
            No QC parameters configured
          </span>
        </div>
      )}

      {/* QC Inspection Notes */}
      <div className="space-y-1 pt-1 border-t border-stone-200/70 dark:border-stone-800">
        <label className="text-[9.5px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider block">
          QC Notes
        </label>
        <textarea
          rows={2}
          value={selectedStep.notes || ""}
          onChange={(e) => handleUpdateStep(selectedStep.id, "notes", e.target.value)}
          placeholder="Optional notes for QC inspection..."
          className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-1.5 text-xs text-stone-900 dark:text-stone-100 focus:outline-indigo-600"
        />
      </div>
    </div>
  );
});

interface BopProcessQualityGateCalloutProps {
  selectedStep: BoPStepRow;
  steps: BoPStepRow[];
  isEngineering: boolean;
  onSelectStep?: (id: string) => void;
  onInsertWipGateAfterProcess?: (processId: string) => void;
}

export const BopProcessQualityGateCallout: React.FC<BopProcessQualityGateCalloutProps> = React.memo(
  ({
    selectedStep,
    steps,
    isEngineering,
    onSelectStep,
    onInsertWipGateAfterProcess,
  }) => {
    if ((selectedStep.node_type || "PROCESS") !== "PROCESS") {
      return null;
    }

    const downstreamProducts = steps.filter(
      (s) => s.node_type === "PRODUCT" && (s.predecessor_ids || []).includes(selectedStep.id)
    );

    return (
      <div className="space-y-2 p-3 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/70 rounded-2xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Output QC Gates</span>
          </div>
          {isEngineering && onInsertWipGateAfterProcess && (
            <button
              type="button"
              onClick={() => onInsertWipGateAfterProcess(selectedStep.id)}
              className="py-1 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Insert WIP Gate</span>
            </button>
          )}
        </div>

        {downstreamProducts.length > 0 ? (
          <div className="space-y-1">
            {downstreamProducts.map((prod) => {
              const role = resolveBopProductRole(prod.id, steps);
              const paramCount = Array.isArray(prod.qc_parameters)
                ? prod.qc_parameters.length
                : 0;
              return (
                <div
                  key={prod.id}
                  className="flex items-center justify-between gap-2 bg-white dark:bg-stone-900 border border-indigo-200 dark:border-indigo-800/70 px-2.5 py-1.5 rounded-xl text-xs"
                >
                  <div className="truncate">
                    <span className="font-bold text-stone-900 dark:text-stone-100 block truncate">
                      {prod.process_name}
                    </span>
                    <span className="text-[9.5px] font-mono text-indigo-700 dark:text-indigo-300">
                      {role === "WIP_SUB_ASSY" ? "WIP · IPQC" : "Finished Good · FQC"} ·{" "}
                      {paramCount} QC Params
                    </span>
                  </div>
                  {onSelectStep && (
                    <button
                      type="button"
                      onClick={() => onSelectStep(prod.id)}
                      className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-800 dark:text-indigo-200 text-[10px] font-bold shrink-0 cursor-pointer border border-indigo-200 dark:border-indigo-800"
                    >
                      Configure →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-[10px] text-indigo-800/80 dark:text-indigo-300/80">
            No downstream WIP or Finished Good QC gate attached.
          </div>
        )}
      </div>
    );
  }
);
