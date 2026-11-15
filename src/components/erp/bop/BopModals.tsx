import React from "react";
import {
  ArrowRight,
  GitBranch,
  Workflow,
  PlayCircle,
  CheckCircle2,
  Upload,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { StationManagementModal } from "../StationManagementModal";
import { BopRoutingPreviewModal } from "@/components/erp/BopPreviewModal";
import { cn } from "@/lib/utils";
import { PRESET_TEMPLATES, type BoPStepRow } from "../bopTypes";

interface BopModalsProps {
  projectId: string;
  project: any;
  steps: BoPStepRow[];
  processSteps: BoPStepRow[];
  stations: any[];
  projectBoms: any[];
  bomStatus: string;
  isSaving: boolean;
  isAuthorizing: boolean;
  showExplanationModal: boolean;
  setShowExplanationModal: (v: boolean) => void;
  showPresetModal: boolean;
  setShowPresetModal: (v: boolean) => void;
  handleApplyPreset: (key: string) => void;
  showStationModal: boolean;
  setShowStationModal: (v: boolean) => void;
  onRefreshStations: () => void;
  showSimulationModal: boolean;
  setShowSimulationModal: (v: boolean) => void;
  showLoadPresetModal: boolean;
  setShowLoadPresetModal: (v: boolean) => void;
  presetFile: File | null;
  setPresetFile: (f: File | null) => void;
  presetFileName: string;
  setPresetFileName: (name: string) => void;
  handleImportJson: (e: React.FormEvent) => void;
  showAuthModal: boolean;
  setShowAuthModal: (v: boolean) => void;
  handleAuthorizeBoP: (pin: string) => Promise<void>;
  showEcoModal: boolean;
  setShowEcoModal: (v: boolean) => void;
  ecoReason: string;
  setEcoReason: (v: string) => void;
  handleSyncBoP: (pin?: string, ecoReason?: string) => Promise<any>;
  showReviseBopModal: boolean;
  setShowReviseBopModal: (v: boolean) => void;
  reviseReason: string;
  setReviseReason: (v: string) => void;
  handleReviseBoP: () => Promise<void>;
  showPreviewModal: boolean;
  setShowPreviewModal: (v: boolean) => void;
  showConfirmSubmitBopModal: boolean;
  setShowConfirmSubmitBopModal: (v: boolean) => void;
}

export const BopModals: React.FC<BopModalsProps> = React.memo(({
  projectId,
  project,
  steps,
  processSteps,
  stations,
  projectBoms,
  bomStatus,
  isSaving,
  isAuthorizing,
  showExplanationModal,
  setShowExplanationModal,
  showPresetModal,
  setShowPresetModal,
  handleApplyPreset,
  showStationModal,
  setShowStationModal,
  onRefreshStations,
  showSimulationModal,
  setShowSimulationModal,
  showLoadPresetModal,
  setShowLoadPresetModal,
  presetFile,
  setPresetFile,
  presetFileName,
  setPresetFileName,
  handleImportJson,
  showAuthModal,
  setShowAuthModal,
  handleAuthorizeBoP,
  showEcoModal,
  setShowEcoModal,
  ecoReason,
  setEcoReason,
  handleSyncBoP,
  showReviseBopModal,
  setShowReviseBopModal,
  reviseReason,
  setReviseReason,
  handleReviseBoP,
  showPreviewModal,
  setShowPreviewModal,
  showConfirmSubmitBopModal,
  setShowConfirmSubmitBopModal,
}) => {
  return (
    <>
      {/* MODAL 1: EXPLANATION MODAL (KONSEP SERI VS PARALEL) */}
      <Modal
        isOpen={showExplanationModal}
        onClose={() => setShowExplanationModal(false)}
        title="Workflow Logic Concept: Serial vs Parallel"
        maxWidth="3xl"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-3xl bg-blue-50/70 border border-blue-200 space-y-3">
              <div className="flex items-center gap-2 text-blue-900 font-black text-sm">
                <ArrowRight className="w-5 h-5 text-blue-600" />
                <span>Serial Process (Sequential &amp; Ordered)</span>
              </div>
              <p className="text-xs text-blue-950 leading-relaxed">
                A new process can only start after its preceding process is{" "}
                <strong>100% completed</strong>. Tasks must wait in sequence, with zero concurrent overlap.
              </p>
              <div className="p-3 bg-white dark:bg-stone-900 rounded-2xl border border-blue-100 dark:border-blue-900/60 text-[11px] text-stone-700 dark:text-stone-300 space-y-1">
                <strong>Real-World Example:</strong>
                <p>
                  Cooking instant noodles: You must wait for the water to boil completely (Process 1) before you can add the noodles to the pot (Process 2). Process 2 is locked until Process 1 finishes.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-3">
              <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-300 font-black text-sm">
                <GitBranch className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>Parallel Process (Concurrent &amp; Independent)</span>
              </div>
              <p className="text-xs text-emerald-950 dark:text-emerald-200 leading-relaxed">
                Tasks are executed <strong>concurrently in the same timeframe</strong>. An independent process does not wait on any other task to begin.
              </p>
              <div className="p-3 bg-white dark:bg-stone-900 rounded-2xl border border-emerald-100 dark:border-emerald-900/60 text-[11px] text-stone-700 dark:text-stone-300 space-y-1">
                <strong>Real-World Example:</strong>
                <p>
                  While waiting for water to boil, you can simultaneously prepare the bowl, slice chili, and open seasoning packets (Processes 2, 3, and 4). These run together without waiting.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700 rounded-2xl text-xs space-y-2">
            <h5 className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Workflow className="w-4 h-4" />
              How Does This Work on the Flowchart Canvas?
            </h5>
            <p className="text-stone-700 dark:text-stone-300 text-[11px] leading-relaxed">
              • Nodes without incoming connections automatically run as{" "}
              <strong>PARALLEL (Independent)</strong>.<br />
              • Nodes with incoming connections automatically run as{" "}
              <strong>SERIAL (Locked until predecessor finishes)</strong>.<br />
              • On the Shop Floor, the <em>"Start Task"</em> button is automatically disabled for Serial tasks until all predecessor steps are{" "}
              <strong>COMPLETED (100%)</strong>.
            </p>
          </div>

          <div className="flex justify-end pt-2 border-t border-stone-100">
            <Button
              onClick={() => setShowExplanationModal(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
            >
              Understood &amp; Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 2: PRESET TEMPLATES MODAL */}
      <Modal
        isOpen={showPresetModal}
        onClose={() => setShowPresetModal(false)}
        title="Load Process Routing Preset Templates (BoP)"
        maxWidth="3xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-500">
            Select an industrial standard template to immediately generate a structured process flowchart:
          </p>

          <div className="grid grid-cols-1 gap-3">
            {Object.entries(PRESET_TEMPLATES).map(([key, t]) => (
              <div
                key={key}
                className="bg-stone-50 hover:bg-stone-100/80 border border-stone-200 rounded-2xl p-4 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-stone-200 text-stone-800">
                      {t.category}
                    </span>
                    <h4 className="text-xs font-black text-stone-900">{t.title}</h4>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-snug">{t.desc}</p>
                  <div className="text-[10px] text-stone-400 font-mono">
                    {t.steps.length} Operation Steps
                  </div>
                </div>

                <Button
                  onClick={() => handleApplyPreset(key)}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shrink-0 h-9"
                >
                  Apply Template
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <StationManagementModal
        isOpen={showStationModal}
        onClose={() => setShowStationModal(false)}
        projectId={projectId}
        stations={stations}
        onRefresh={onRefreshStations}
      />

      {/* MODAL 3: SIMULATION RUN MODAL */}
      <Modal
        isOpen={showSimulationModal}
        onClose={() => setShowSimulationModal(false)}
        title="Process Routing Simulation (Execution Path Validator)"
        maxWidth="3xl"
      >
        <div className="space-y-5">
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-950 flex items-start gap-2.5">
            <PlayCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-black">Shop Floor Readiness Simulation:</strong>
              <span>
                This simulation demonstrates how the live shop floor system will automatically lock and unlock tasks based on the dependency rules configured in your flowchart.
              </span>
            </div>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {(() => {
              if (steps.length === 0)
                return <p className="text-sm text-stone-500 italic">No process steps defined yet.</p>;

              const parallelSteps = steps.filter((s) => (s.predecessor_ids || []).length === 0);
              const serialSteps = steps.filter((s) => (s.predecessor_ids || []).length > 0);
              const startNames = parallelSteps.map((s) => `"${s.process_name}"`).join(", ");

              return (
                <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5 space-y-4 shadow-sm">
                  <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                    Based on your configured process routing, production will{" "}
                    <strong>start concurrently (in parallel)</strong> on step(s){" "}
                    <strong>{startNames}</strong>. Because these steps have no predecessor constraints, shop floor operators can begin work immediately.
                  </p>

                  {serialSteps.length > 0 && (
                    <div className="space-y-2 mt-3">
                      <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                        Once initial processes are completed, the Shop Floor system will automatically{" "}
                        <strong>unlock</strong> subsequent operations in the defined sequence:
                      </p>
                      <ul className="list-disc pl-5 text-sm text-stone-600 dark:text-stone-400 space-y-2">
                        {serialSteps.map((step) => {
                          const preds = steps.filter((s) =>
                            (step.predecessor_ids || []).includes(s.id)
                          );
                          const predNames = preds.map((p) => `"${p.process_name}"`).join(" and ");
                          return (
                            <li key={step.id}>
                              Step <strong>"{step.process_name}"</strong> can only start after{" "}
                              <strong>{predNames}</strong> is 100% completed.
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 rounded-xl p-4 mt-4">
                    <p className="text-sm text-emerald-800 dark:text-emerald-300 font-medium leading-relaxed flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        A total of <strong>{steps.length} process steps</strong> configured. The system enforces strict dependency sequencing.
                      </span>
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => setShowSimulationModal(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold"
            >
              Close Simulation
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 4: IMPORT JSON MODAL */}
      <Modal
        isOpen={showLoadPresetModal}
        onClose={() => {
          setShowLoadPresetModal(false);
          setPresetFile(null);
          setPresetFileName("");
        }}
        title="Load BOP Preset"
        maxWidth="md"
        contentClassName="p-0 border-t border-stone-100 dark:border-stone-800"
      >
        <form onSubmit={handleImportJson} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest px-1">
              Upload BOP Preset File (.json)
            </label>
            <div className="relative group">
              <input
                required
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPresetFile(file);
                    setPresetFileName(file.name);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="w-full border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-3xl px-4 py-8 flex flex-col items-center justify-center bg-stone-50/50 dark:bg-stone-800/40 group-hover:border-stone-300 dark:group-hover:border-stone-600 transition-all">
                <div className="w-10 h-10 bg-white dark:bg-stone-800 rounded-2xl shadow-sm border border-stone-100 dark:border-stone-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5 text-stone-400 dark:text-stone-300" />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-bold tracking-widest uppercase text-center break-all px-2",
                    presetFileName ? "text-stone-900 dark:text-stone-100" : "text-stone-400 dark:text-stone-500"
                  )}
                >
                  {presetFileName || "Click or drag preset file..."}
                </span>
              </div>
            </div>
            <p className="text-[8px] text-stone-400 font-medium tracking-wide text-center uppercase mt-2">
              * Only accepts .json format generated from the Save Preset feature
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={() => {
                setShowLoadPresetModal(false);
                setPresetFile(null);
                setPresetFileName("");
              }}
              className="px-6 py-2.5 rounded-2xl border border-stone-200 text-stone-700 font-bold text-xs hover:bg-stone-50 transition-colors uppercase"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!presetFile}
              className="px-6 py-2.5 rounded-2xl bg-stone-900 text-white font-bold text-xs hover:bg-stone-800 disabled:opacity-50 transition-colors uppercase shadow-sm"
            >
              Load Preset
            </button>
          </div>
        </form>
      </Modal>

      <AuthorizeDocModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        docType="Bill of Process (BOP)"
        docNumber={project?.id || "BOP-0001"}
        subtitle="OFFICIAL BOP AUTHORIZATION & LOCK"
        status={project?.bop_status || "PENDING"}
        partnerLabel="Project Name"
        partnerName={project?.name || project?.id || "Project BOP"}
        amount={0}
        isSubmitting={isAuthorizing}
        submitLabel="Authorize BOP"
        submitVariant="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
        themeVariant="emerald"
        approvalTitle="Authorize Bill of Process (BOP)"
        approvalDescription="Enter your Daily Internal Auth Key (available in the header activity & notification panel) to authorize and publish this Bill of Process to production."
        onAuthorize={async (pin) => {
          await handleAuthorizeBoP(pin);
        }}
      />

      <AuthorizeDocModal
        isOpen={showEcoModal}
        onClose={() => {
          setShowEcoModal(false);
          setEcoReason("");
        }}
        docType="Engineering Change Order (ECO)"
        docNumber={project?.id || "BOP-0001"}
        subtitle="BOP TECHNICAL REVISION & RE-COMMITMENT"
        status="MANUFACTURING PHASE"
        partnerLabel="Project Name"
        partnerName={project?.name || project?.id || "Project BOP"}
        amount={0}
        isSubmitting={isSaving}
        submitLabel="Authorize & Commit ECO"
        submitVariant="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs"
        submitDisabled={!ecoReason.trim()}
        themeVariant="amber"
        icon={<Wrench className="w-5 h-5 text-amber-600" />}
        approvalTitle="Authorize Engineering Change Order (ECO)"
        approvalDescription="This project has entered the Manufacturing phase. Enter your Daily Internal Auth Key to authorize technical revisions (ECO) to this Bill of Process."
        onAuthorize={async (pin) => {
          const success = await handleSyncBoP(pin, ecoReason);
          if (success) {
            setShowEcoModal(false);
            setEcoReason("");
          }
        }}
      >
        <div className="bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-xl p-4 space-y-2 mt-4">
          <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
            Reason for Technical Revision / ECO
          </label>
          <textarea
            value={ecoReason}
            onChange={(e) => setEcoReason(e.target.value)}
            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl p-3 text-sm text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            rows={3}
            placeholder="e.g. Updating standard hours for CNC milling based on actual test runs..."
          />
        </div>
      </AuthorizeDocModal>

      <Modal
        isOpen={showReviseBopModal}
        onClose={() => {
          setShowReviseBopModal(false);
          setReviseReason("");
        }}
        title="BOP Revision Request"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-800 rounded-2xl flex gap-3 text-rose-800 dark:text-rose-300">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div className="text-xs leading-relaxed">
              <strong>Request Revision:</strong> Mark this BOP as needing revision. It will be returned to the engineering stream for corrections.
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
              Revision Note / Correction Instructions
            </label>
            <textarea
              value={reviseReason}
              onChange={(e) => setReviseReason(e.target.value)}
              rows={4}
              placeholder="Explain what needs to be changed..."
              className="w-full bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-900 dark:text-stone-100 focus:bg-white dark:focus:bg-stone-900 focus:outline-rose-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <Button
              variant="secondary"
              onClick={() => {
                setShowReviseBopModal(false);
                setReviseReason("");
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="bg-rose-600 hover:bg-rose-700"
              disabled={!reviseReason.trim() || isSaving}
              onClick={handleReviseBoP}
            >
              {isSaving ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 5: PRINT ROUTE TRAVELER SHEET MODAL */}
      <BopRoutingPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        steps={steps}
        project={project}
        projectBoms={projectBoms}
      />

      <ConfirmModal
        isOpen={showConfirmSubmitBopModal}
        onCancel={() => setShowConfirmSubmitBopModal(false)}
        onConfirm={async () => {
          setShowConfirmSubmitBopModal(false);
          await handleSyncBoP();
        }}
        title="Confirm Bill of Process (BOP) Submission"
        message={
          <div className="space-y-3 text-left">
            <p className="text-xs text-stone-600 leading-relaxed">
              {`Are you sure you want to submit this Bill of Process (BOP) for project ${
                project?.spk_number || project?.name || ""
              } for Manager approval? Submitted data will be queued for authorization.`}
            </p>
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5 text-[11px]">
              <div className="font-bold text-stone-800">
                Pre-submission Prerequisites Checklist:
              </div>
              <div className="flex items-center justify-between text-stone-600">
                <span>Registered Workstations:</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {stations.length} Registered (&ge; 1 Required)
                </span>
              </div>
              <div className="flex items-center justify-between text-stone-600">
                <span>Process Step Assignments:</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {processSteps.length} of {processSteps.length} Assigned (100%)
                </span>
              </div>
              <div className="flex items-center justify-between text-stone-600">
                <span>BOM Authorization:</span>
                <span className="font-bold text-emerald-700 font-mono">
                  {bomStatus} (Authorized)
                </span>
              </div>
            </div>
          </div>
        }
        confirmText="Yes, Submit BOP"
        cancelText="Cancel"
        variant="info"
      />
    </>
  );
});
