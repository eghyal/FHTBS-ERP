import React, { memo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { BopInspectFormState, BopStepQcItem, QcProjectItem } from "./qcTypes";

interface BopInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBopStep: BopStepQcItem | null;
  selectedProject: QcProjectItem | null;
  checkedCriteria: Record<string, boolean>;
  setCheckedCriteria: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  inspectForm: BopInspectFormState;
  setInspectForm: React.Dispatch<React.SetStateAction<BopInspectFormState>>;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export const BopInspectionModal = memo(function BopInspectionModal({
  isOpen,
  onClose,
  activeBopStep,
  selectedProject,
  checkedCriteria,
  setCheckedCriteria,
  inspectForm,
  setInspectForm,
  isSubmitting,
  onSubmit,
}: BopInspectionModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`BOP Station Quality Inspection — ${
        activeBopStep?.process_name || ""
      }`}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {activeBopStep && (
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono tabular-nums text-xs font-bold text-stone-900">
                STEP #{activeBopStep.step_sequence} ·{" "}
                {activeBopStep.station_name}
              </span>
              <Badge variant="info" className="font-mono tabular-nums">
                Cycle Time: {activeBopStep.cycle_time_minutes} min
              </Badge>
            </div>
            <p className="text-xs font-semibold text-stone-700">
              Verify all Engineering BOP Checkpoints below:
            </p>
            <div className="space-y-1.5 pt-1">
              {Object.entries(checkedCriteria).map(([criterion, checked]) => (
                <label
                  key={criterion}
                  className="flex items-start gap-2.5 p-2 rounded-lg bg-white border border-stone-200/80 cursor-pointer hover:border-stone-300"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setCheckedCriteria((prev) => ({
                        ...prev,
                        [criterion]: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                  />
                  <span className="text-xs text-stone-800 font-medium">
                    {criterion}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Inspection Gate Type"
            value={inspectForm.inspection_type}
            onChange={(e) =>
              setInspectForm((prev) => ({
                ...prev,
                inspection_type: e.target.value,
              }))
            }
            options={[
              {
                value: "FAI",
                label: "FAI — First Article Inspection (Setup Release)",
              },
              {
                value: "IPQC",
                label: "IPQC — In-Process Patrol Tolerance Check",
              },
              {
                value: "FINAL_GATE",
                label: "FINAL_GATE — Station Final Acceptance",
              },
            ]}
          />

          <Select
            label="Target WOT Sub-Lot (Optional)"
            value={inspectForm.wot_id}
            onChange={(e) =>
              setInspectForm((prev) => ({ ...prev, wot_id: e.target.value }))
            }
            options={[
              { value: "", label: "All Station Lots / General Setup" },
              ...(selectedProject?.wots || []).map((w: any) => ({
                value: w.id,
                label: `${w.wot_number || w.id} (${
                  w.station || w.station_id || "Station"
                } · ${w.qty || w.planned_qty || 1} PCS)`,
              })),
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Parameter Inspected"
            value={inspectForm.parameter_name}
            onChange={(e) =>
              setInspectForm((prev) => ({
                ...prev,
                parameter_name: e.target.value,
              }))
            }
            required
          />
          <Input
            label="Nominal Specification"
            value={inspectForm.nominal_spec}
            onChange={(e) =>
              setInspectForm((prev) => ({
                ...prev,
                nominal_spec: e.target.value,
              }))
            }
            required
          />
          <Input
            label="Allowed BOP Tolerance"
            value={inspectForm.tolerance_spec}
            onChange={(e) =>
              setInspectForm((prev) => ({
                ...prev,
                tolerance_spec: e.target.value,
              }))
            }
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Input
            label="Actual Measured Value"
            placeholder="e.g. +0.2 mm / Conforms"
            value={inspectForm.measured_value}
            onChange={(e) =>
              setInspectForm((prev) => ({
                ...prev,
                measured_value: e.target.value,
              }))
            }
            required
          />
          <Input
            label="Sample Size"
            type="number"
            min={1}
            value={inspectForm.sample_size}
            onChange={(e) => {
              const sample = Math.max(1, Number(e.target.value) || 1);
              const def = Math.min(
                sample,
                Math.max(0, Number(inspectForm.defect_qty) || 0)
              );
              const pass = Math.max(0, sample - def);
              setInspectForm((prev) => ({
                ...prev,
                sample_size: String(sample),
                passed_qty: String(pass),
                defect_qty: String(def),
              }));
            }}
            required
          />
          <Input
            label="Passed Qty"
            type="number"
            min={0}
            value={inspectForm.passed_qty}
            onChange={(e) => {
              const sample = Math.max(1, Number(inspectForm.sample_size) || 1);
              const pass = Math.min(
                sample,
                Math.max(0, Number(e.target.value) || 0)
              );
              const def = Math.max(0, sample - pass);
              setInspectForm((prev) => ({
                ...prev,
                passed_qty: String(pass),
                defect_qty: String(def),
                disposition: def > 0 ? "REJECTED" : "PASSED",
              }));
            }}
            required
          />
          <Input
            label="Defect Qty"
            type="number"
            min={0}
            value={inspectForm.defect_qty}
            onChange={(e) => {
              const sample = Math.max(1, Number(inspectForm.sample_size) || 1);
              const def = Math.min(
                sample,
                Math.max(0, Number(e.target.value) || 0)
              );
              const pass = Math.max(0, sample - def);
              setInspectForm((prev) => ({
                ...prev,
                defect_qty: String(def),
                passed_qty: String(pass),
                disposition: def > 0 ? "REJECTED" : "PASSED",
              }));
            }}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Quality Disposition"
            value={inspectForm.disposition}
            onChange={(e) =>
              setInspectForm((prev) => ({
                ...prev,
                disposition: e.target.value,
              }))
            }
            options={[
              { value: "PASSED", label: "PASSED — Conforms to BOP Tolerance" },
              {
                value: "CONDITIONAL",
                label: "CONDITIONAL — Minor Deviation (Concession)",
              },
              {
                value: "REJECTED",
                label: "REJECTED — Out of Tolerance (Hold WOT / Rework)",
              },
            ]}
          />
          <Input
            label="Inspector Remarks / Caliper Serial"
            placeholder="e.g. Digital Vernier Caliper #QC-04"
            value={inspectForm.notes}
            onChange={(e) =>
              setInspectForm((prev) => ({ ...prev, notes: e.target.value }))
            }
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save BOP Inspection Record"}
          </Button>
        </div>
      </form>
    </Modal>
  );
});
