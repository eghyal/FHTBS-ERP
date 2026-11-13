import React, { memo } from "react";
import {
  Search,
  Layers,
  CheckCircle2,
  ClipboardCheck,
  AlertTriangle,
  CheckSquare,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { BopStepQcItem, QcProjectItem } from "./qcTypes";

interface ProcessBopGateStepperProps {
  selectedProject: QcProjectItem | null;
  filteredBopSteps: BopStepQcItem[];
  searchBopQuery: string;
  setSearchBopQuery: (val: string) => void;
  parseCriteriaPoints: (text: string) => string[];
  onOpenInspectModal: (step: BopStepQcItem, defaultType?: string) => void;
  onOpenNcrModal: (step?: BopStepQcItem) => void;
}

export const ProcessBopGateStepper = memo(function ProcessBopGateStepper({
  selectedProject,
  filteredBopSteps,
  searchBopQuery,
  setSearchBopQuery,
  parseCriteriaPoints,
  onOpenInspectModal,
  onOpenNcrModal,
}: ProcessBopGateStepperProps) {
  return (
    <div className="lg:col-span-8 bg-white border border-stone-200/80 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
      {/* Unified Selected Project & Engineering BOP Quality Gate Header */}
      <div className="px-5 py-3.5 border-b border-stone-200/80 bg-stone-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded-md bg-white text-stone-800 border border-stone-200 shadow-2xs">
              {selectedProject?.spk_number ||
                selectedProject?.id ||
                "NO WORK ORDER"}
            </span>
            <h2 className="text-sm font-bold text-stone-900 truncate">
              {selectedProject?.name || "Select a Manufacturing Project"}
            </h2>
            <Badge variant="info" className="font-mono tabular-nums">
              {filteredBopSteps.length} BOP Steps
            </Badge>
          </div>
          {selectedProject ? (
            <p className="text-[11px] text-stone-500 mt-1 truncate">
              Customer:{" "}
              <strong className="text-stone-800">
                {selectedProject.customer_name || "Internal"}
              </strong>{" "}
              · Target Qty:{" "}
              <strong className="font-mono tabular-nums text-stone-800">
                {Number(selectedProject.qty || 1).toLocaleString()}{" "}
              </strong>
              <span className="font-mono text-stone-700">
                {selectedProject.uom || "PCS"}
              </span>{" "}
              · FAI Approved:{" "}
              <strong className="font-mono tabular-nums text-emerald-700">
                {selectedProject.fai_completed_count}/
                {selectedProject.total_bop_steps} Steps
              </strong>
            </p>
          ) : (
            <p className="text-[11px] text-stone-500 mt-1">
              Verify First Article Inspection (FAI) and In-Process (IPQC) tolerances at each sequential station
            </p>
          )}
        </div>

        <div className="w-full sm:w-60 shrink-0">
          <Input
            type="text"
            placeholder="Filter BOP process or station..."
            value={searchBopQuery}
            onChange={(e) => setSearchBopQuery(e.target.value)}
            leftIcon={<Search className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Connected Vertical BOP Step Quality Gate Stepper Body */}
      <div className="p-5">
        {!selectedProject ? (
          <div className="p-8 text-center text-xs text-stone-500">
            Select a work order from the left panel to inspect BOP steps.
          </div>
        ) : filteredBopSteps.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500">
            No BOP steps match your filter for this project.
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-stone-200">
            {filteredBopSteps.map((step) => {
              const criteriaList = parseCriteriaPoints(step.qc_criteria_text);
              const isHeld =
                step.open_ncr_count > 0 || Number(step.qc_hold_qty || 0) > 0;
              return (
                <div
                  key={step.id}
                  className={cn(
                    "relative border rounded-xl p-4 transition-all shadow-2xs",
                    isHeld
                      ? "bg-rose-50/30 border-rose-200/90 hover:bg-rose-50/50"
                      : "bg-stone-50/70 hover:bg-white border-stone-200/80"
                  )}
                >
                  {/* Stepper Node Dot */}
                  <div
                    className={cn(
                      "absolute -left-[21px] top-5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs",
                      step.open_ncr_count > 0
                        ? "bg-rose-600"
                        : step.fai_approved
                          ? "bg-emerald-600"
                          : "bg-amber-500"
                    )}
                  />

                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          STEP #{step.step_sequence}
                        </span>
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white text-stone-800 border border-stone-200">
                          {step.station_name}
                        </span>
                        <h4 className="text-sm font-bold text-stone-900">
                          {step.process_name}
                        </h4>
                        {step.fai_approved ? (
                          <Badge variant="success">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            FAI Approved
                          </Badge>
                        ) : (
                          <Badge variant="warning">
                            <Lock className="w-3 h-3 mr-1" />
                            FAI Gate Required
                          </Badge>
                        )}
                        {step.open_ncr_count > 0 && (
                          <Badge variant="danger">
                            {step.open_ncr_count} Active NCR (WOT Locked)
                          </Badge>
                        )}
                      </div>

                      <p className="text-[11px] font-mono tabular-nums text-stone-500">
                        Std Cycle:{" "}
                        <strong className="text-stone-800">
                          {step.cycle_time_minutes}m
                        </strong>{" "}
                        · Logged Checks:{" "}
                        <strong className="text-stone-800">
                          {step.inspections_count}
                        </strong>{" "}
                        · Rework Qty:{" "}
                        <strong className="text-rose-600">
                          {step.rework_qty}
                        </strong>{" "}
                        · QC Hold/Scrap:{" "}
                        <strong className="text-amber-700">
                          {step.qc_hold_qty}
                        </strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={() => onOpenInspectModal(step, "IPQC")}
                        leftIcon={<ClipboardCheck className="w-3.5 h-3.5" />}
                      >
                        {!step.fai_approved
                          ? "Execute FAI Check"
                          : "Log IPQC Check"}
                      </Button>
                      <Button
                        size="xs"
                        variant="danger_soft"
                        onClick={() => onOpenNcrModal(step)}
                        leftIcon={<AlertTriangle className="w-3.5 h-3.5" />}
                      >
                        Tag NCR
                      </Button>
                    </div>
                  </div>

                  {/* Compact Engineering BOP Criteria Checkpoints */}
                  <div className="mt-3 pt-3 border-t border-stone-200/80 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {criteriaList.map((pt, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 bg-white px-3 py-2 rounded-lg border border-stone-200/70 text-xs text-stone-800"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </div>
                    ))}
                  </div>

                  {step.sop_instruction_text && (
                    <div className="mt-2 text-[11px] text-stone-600 font-mono">
                      <strong className="text-stone-800">SOP:</strong>{" "}
                      {step.sop_instruction_text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
