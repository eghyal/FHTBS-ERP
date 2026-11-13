import React, { memo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PackagePlus, Lock } from "lucide-react";
import { NcrFormState, QcProjectItem } from "./qcTypes";

interface NcrLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: QcProjectItem[];
  ncrForm: NcrFormState;
  setNcrForm: React.Dispatch<React.SetStateAction<NcrFormState>>;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export const NcrLogModal = memo(function NcrLogModal({
  isOpen,
  onClose,
  projects,
  ncrForm,
  setNcrForm,
  isSubmitting,
  onSubmit,
}: NcrLogModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Non-Conformance Report (NCR) & Rework / Scrap Instruction"
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Manufacturing Project"
            value={ncrForm.project_id}
            onChange={(e) => {
              const p = projects.find((x) => x.id === e.target.value);
              setNcrForm((prev) => ({
                ...prev,
                project_id: e.target.value,
                bop_step_id: p?.bop_steps?.[0]?.id || "",
                station_id: p?.bop_steps?.[0]?.station_id || "",
                station_name: p?.bop_steps?.[0]?.station_name || "Workstation",
              }));
            }}
            options={projects.map((p) => ({
              value: p.id,
              label: `${p.spk_number || p.id} — ${p.name}`,
            }))}
          />

          <Input
            label="Workstation / BOP Stage"
            value={ncrForm.station_name}
            onChange={(e) =>
              setNcrForm((prev) => ({
                ...prev,
                station_name: e.target.value,
              }))
            }
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Defect Category"
            value={ncrForm.defect_category}
            onChange={(e) =>
              setNcrForm((prev) => ({
                ...prev,
                defect_category: e.target.value,
              }))
            }
            options={[
              {
                value: "DIMENSIONAL_OUT_OF_TOLERANCE",
                label: "Dimensional Out of Tolerance",
              },
              {
                value: "WELDING_POROSITY_CRACK",
                label: "Welding Porosity / Undercut",
              },
              {
                value: "SURFACE_COATING_DEFECT",
                label: "Surface Finish / Coating Defect",
              },
              {
                value: "ASSEMBLY_FITMENT_ERROR",
                label: "Assembly Fitment / Alignment Error",
              },
              {
                value: "MATERIAL_DEFECT",
                label: "Raw Material Defect",
              },
            ]}
          />

          <Select
            label="Defect Severity"
            value={ncrForm.severity}
            onChange={(e) =>
              setNcrForm((prev) => ({ ...prev, severity: e.target.value }))
            }
            options={[
              { value: "MINOR", label: "MINOR — Cosmetic / Repairable" },
              { value: "MAJOR", label: "MAJOR — Functional Deviation" },
              { value: "CRITICAL", label: "CRITICAL — Structural / Safety" },
            ]}
          />

          <Select
            label="Shop Floor Instruction"
            value={ncrForm.disposition_action}
            onChange={(e) =>
              setNcrForm((prev) => ({
                ...prev,
                disposition_action: e.target.value,
              }))
            }
            options={[
              {
                value: "REWORK",
                label: "REWORK — Return to Station & Hold WOT",
              },
              {
                value: "SCRAP",
                label: "SCRAP — Reject & Trigger PPIC/PR Replacement",
              },
              {
                value: "HOLD",
                label: "HOLD — Quarantine WOT Pending Engineering",
              },
            ]}
          />
        </div>

        {ncrForm.disposition_action === "SCRAP" ? (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
            <PackagePlus className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Cross-Module PPIC &amp; Purchasing Trigger:</strong>{" "}
              Issuing a <code>SCRAP</code> disposition will automatically log a
              Material Shortage Alert for PPIC and generate a Draft Replacement
              Purchase Request (<code>PR-SCRAP-*</code>) based on this project&apos;s
              BOM.
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 flex items-start gap-2.5 text-xs text-stone-700">
            <Lock className="w-4 h-4 text-stone-600 shrink-0 mt-0.5" />
            <div>
              <strong>Shop Floor WOT Interlock:</strong> Active Work Order
              Tickets (WOT) at this station will be placed on{" "}
              <code>ON_HOLD</code> until this NCR is verified and resolved.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Affected Defective Quantity (PCS)"
            type="number"
            min={1}
            value={ncrForm.defect_qty}
            onChange={(e) =>
              setNcrForm((prev) => ({ ...prev, defect_qty: e.target.value }))
            }
            required
          />
          <Input
            label="Estimated Cost of Poor Quality / COPQ (IDR)"
            type="number"
            min={0}
            value={ncrForm.cost_of_poor_quality}
            onChange={(e) =>
              setNcrForm((prev) => ({
                ...prev,
                cost_of_poor_quality: e.target.value,
              }))
            }
            required
          />
        </div>

        <Input
          label="Root Cause Analysis (5-Why / Deviation Description)"
          placeholder="Describe exact dimensional deviation or process failure..."
          value={ncrForm.root_cause}
          onChange={(e) =>
            setNcrForm((prev) => ({ ...prev, root_cause: e.target.value }))
          }
          required
        />

        <Input
          label="Corrective & Preventive Action (CAPA Instruction)"
          placeholder="Specify rework procedure, jig recalibration, or replacement requirement..."
          value={ncrForm.corrective_action}
          onChange={(e) =>
            setNcrForm((prev) => ({
              ...prev,
              corrective_action: e.target.value,
            }))
          }
          required
        />

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {isSubmitting ? "Issuing NCR..." : "Issue NCR & Tag Station"}
          </Button>
        </div>
      </form>
    </Modal>
  );
});
