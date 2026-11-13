import React from "react";
import { Trash2, ShieldCheck, Package, CheckCircle2, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BoPStepRow,
  resolveBopProductRole,
  parseLegacyQcCriteriaToParameters,
} from "../bopTypes";

interface BopMatrixViewProps {
  steps: BoPStepRow[];
  stations: any[];
  isEngineering: boolean;
  handleUpdateStep: (id: string, field: keyof BoPStepRow, value: any) => void;
  handleDeleteStep: (id: string) => void;
}

export const BopMatrixView: React.FC<BopMatrixViewProps> = React.memo(({
  steps,
  stations,
  isEngineering,
  handleUpdateStep,
  handleDeleteStep,
}) => {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-stone-50 dark:bg-stone-800/70 border-b border-stone-200 dark:border-stone-800 text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
              <th className="py-3 px-4 w-16 text-center">Seq</th>
              <th className="py-3 px-4">Node / Operation Name</th>
              <th className="py-3 px-4 min-w-[200px]">Assigned Workstation</th>
              <th className="py-3 px-4 text-center">Flow Mode</th>
              <th className="py-3 px-4">Node Type & Role</th>
              <th className="py-3 px-4">Predecessors (Inputs)</th>
              <th className="py-3 px-4 min-w-[240px]">QC Checkpoints</th>
              <th className="py-3 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {steps.map((step, idx) => {
              const preds = steps.filter((s) => (step.predecessor_ids || []).includes(s.id));
              const isParallel = preds.length === 0;
              const isProcess = (step.node_type || "PROCESS") === "PROCESS";
              const productRole = !isProcess
                ? resolveBopProductRole(step.id, steps) || "MATERIAL_INPUT"
                : null;
              const qcParams = !isProcess
                ? Array.isArray(step.qc_parameters) && step.qc_parameters.length > 0
                  ? step.qc_parameters
                  : step.qc_criteria
                  ? parseLegacyQcCriteriaToParameters(step.qc_criteria)
                  : []
                : [];

              return (
                <tr key={step.id} className="hover:bg-stone-50/60 dark:hover:bg-stone-800/40 transition-colors">
                  <td className="py-3 px-4 text-center font-mono font-black text-stone-800 dark:text-stone-200">
                    {String(step.step_sequence || idx + 1).padStart(2, "0")}
                  </td>

                  <td className="py-3 px-4">
                    <input
                      type="text"
                      value={step.process_name}
                      disabled={!isEngineering}
                      onChange={(e) => handleUpdateStep(step.id, "process_name", e.target.value)}
                      className={cn(
                        "w-full border rounded-xl px-2.5 py-1.5 text-xs font-bold text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-900",
                        !isEngineering
                          ? "bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 cursor-default"
                          : "bg-stone-50 dark:bg-stone-800/80 border-stone-200 dark:border-stone-700"
                      )}
                      placeholder="Process / Product Name..."
                    />
                  </td>

                  <td className="py-3 px-4">
                    {isProcess ? (
                      <select
                        value={step.station_id || ""}
                        disabled={!isEngineering}
                        onChange={(e) => handleUpdateStep(step.id, "station_id", e.target.value)}
                        className={cn(
                          "w-full border rounded-xl px-2.5 py-1.5 text-xs font-bold focus:bg-white dark:focus:bg-stone-900",
                          !isEngineering
                            ? "bg-stone-100 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 cursor-default"
                            : !step.station_id ||
                              !stations.some(
                                (st) =>
                                  st.id === step.station_id || st.station_code === step.station_id
                              )
                            ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300 cursor-pointer"
                            : "bg-stone-50 dark:bg-stone-800/80 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 cursor-pointer"
                        )}
                      >
                        <option value="">-- Select Workstation --</option>
                        {stations.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.station_code ? `${st.station_code} — ` : ""}
                            {st.station_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={cn(
                          "text-[11px] font-semibold",
                          productRole === "WIP_SUB_ASSY"
                            ? "text-indigo-700 dark:text-indigo-400"
                            : productRole === "FINISHED_GOOD"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {productRole === "WIP_SUB_ASSY"
                          ? "IPQC Inspection Point"
                          : productRole === "FINISHED_GOOD"
                          ? "Final QC Gate"
                          : "Material Staging Point"}
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-center">
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider",
                        isParallel ? "text-emerald-700 dark:text-emerald-400" : "text-blue-700 dark:text-blue-400"
                      )}
                    >
                      {isParallel ? "PARALLEL" : "SERIAL"}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    {isProcess ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[11px] font-bold text-stone-800 dark:text-stone-200">
                        <Workflow className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        <span>Process</span>
                      </span>
                    ) : productRole === "WIP_SUB_ASSY" ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold text-indigo-800 dark:text-indigo-300">
                        <ShieldCheck className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                        <span>WIP / Sub-Assy</span>
                      </span>
                    ) : productRole === "FINISHED_GOOD" ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Finished Good</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                        <Package className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>Material Input</span>
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    {preds.length === 0 ? (
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                        None (Root)
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {preds.map((p) => (
                          <span
                            key={p.id}
                            className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[10px] font-mono font-bold text-stone-800 dark:text-stone-200"
                          >
                            #{p.step_sequence} {p.process_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    {isProcess ? (
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        SOP: {step.sop_instruction || "Standard"}
                      </span>
                    ) : productRole === "MATERIAL_INPUT" ? (
                      <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                        BOM Allocation ({(step.bom_allocations || []).length} items)
                      </span>
                    ) : qcParams.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {qcParams.map((qp, qIdx) => (
                          <div
                            key={qp.id || qIdx}
                            className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-[10.5px]"
                          >
                            <div className="truncate">
                              <span className="font-bold text-stone-900 dark:text-stone-100">{qp.parameter_name}</span>
                              {qp.specification && (
                                <span className="text-indigo-800 dark:text-indigo-300 font-mono ml-1">
                                  ({qp.specification})
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] font-mono text-stone-600 dark:text-stone-400 shrink-0">
                              {qp.measurement_method}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-stone-400 dark:text-stone-500 italic">
                        No QC parameters configured
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-center">
                    {isEngineering ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteStep(step.id)}
                        className="w-7 h-7 mx-auto flex items-center justify-center bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200/70 dark:border-rose-800/60 rounded-lg transition-colors cursor-pointer shadow-2xs"
                        title="Delete Step"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono text-stone-400">View Only</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
