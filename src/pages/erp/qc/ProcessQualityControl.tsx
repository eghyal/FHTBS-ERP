import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ClipboardCheck,
  RefreshCw,
  AlertOctagon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { FgrPreviewModal } from "@/components/erp/FgrPreviewModal";
import {
  ProcessQcTopKpiStrip,
  ProcessQcTelemetryRail,
} from "@/components/erp/qc/ProcessQcTelemetryRail";
import { ProcessBopGateStepper } from "@/components/erp/qc/ProcessBopGateStepper";
import { ProcessQcLedgerTabs } from "@/components/erp/qc/ProcessQcLedgerTabs";
import { BopInspectionModal } from "@/components/erp/qc/BopInspectionModal";
import { NcrLogModal } from "@/components/erp/qc/NcrLogModal";
import {
  BopInspectFormState,
  BopStepQcItem,
  LedgerMode,
  NcrFormState,
  QcProcessSummary,
  QcProjectItem,
} from "@/components/erp/qc/qcTypes";
import { cn } from "@/lib/utils";

export default function ProcessQualityControl() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [ledgerMode, setLedgerMode] = useState<LedgerMode>("MEASUREMENTS");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [projects, setProjects] = useState<QcProjectItem[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [ncrLogs, setNcrLogs] = useState<any[]>([]);
  const [stationAnalytics, setStationAnalytics] = useState<any[]>([]);
  const [summary, setSummary] = useState<QcProcessSummary>({
    active_mfg_projects_count: 0,
    total_bop_steps_count: 0,
    fai_approved_bop_count: 0,
    total_inspections_count: 0,
    overall_fpy_pct: 100,
    open_ncr_count: 0,
    total_ncr_count: 0,
    total_copq: 0,
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [searchBopQuery, setSearchBopQuery] = useState("");
  const [searchNcrQuery, setSearchNcrQuery] = useState("");
  const [ncrStatusFilter, setNcrStatusFilter] = useState("ALL");

  // BOP Parameter & Tolerance Inspection Modal State
  const [showInspectModal, setShowInspectModal] = useState(false);
  const [activeBopStep, setActiveBopStep] = useState<BopStepQcItem | null>(null);
  const [checkedCriteria, setCheckedCriteria] = useState<Record<string, boolean>>({});
  const [inspectForm, setInspectForm] = useState<BopInspectFormState>({
    inspection_type: "IPQC",
    wot_id: "",
    parameter_name: "Dimensional & Visual Tolerance",
    nominal_spec: "Per Engineering Drawing",
    tolerance_spec: "± 1.0 mm / Zero Crack",
    measured_value: "",
    sample_size: "5",
    passed_qty: "5",
    defect_qty: "0",
    disposition: "PASSED",
    notes: "",
  });

  // Create NCR Modal State
  const [showNcrModal, setShowNcrModal] = useState(false);
  const [ncrForm, setNcrForm] = useState<NcrFormState>({
    project_id: "",
    bop_step_id: "",
    station_id: "",
    station_name: "",
    wot_id: "",
    defect_category: "DIMENSIONAL_OUT_OF_TOLERANCE",
    severity: "MAJOR",
    defect_qty: "1",
    disposition_action: "REWORK",
    root_cause: "",
    corrective_action: "",
    cost_of_poor_quality: "150000",
  });

  // FGR Preview Modal State
  const [selectedFgrProject, setSelectedFgrProject] = useState<QcProjectItem | null>(null);
  const [selectedFgrDoc, setSelectedFgrDoc] = useState<any | null>(null);

  const fetchProcessQcHub = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/qc/process-hub", {}, user?.username);
      if (res.ok && res.data) {
        const d = res.data;
        const projList: QcProjectItem[] = Array.isArray(d.projects) ? d.projects : [];
        setProjects(projList);
        setInspections(Array.isArray(d.inspections) ? d.inspections : []);
        setNcrLogs(Array.isArray(d.ncr_logs) ? d.ncr_logs : []);
        setStationAnalytics(Array.isArray(d.station_analytics) ? d.station_analytics : []);
        if (d.summary) setSummary(d.summary);

        if (!selectedProjectId && projList.length > 0) {
          setSelectedProjectId(projList[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch Process QC Hub:", err);
      showToast("Failed to load Process Quality Control data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [selectedProjectId, showToast, user?.username]);

  useEffect(() => {
    fetchProcessQcHub();
  }, [fetchProcessQcHub]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  const filteredBopSteps = useMemo(() => {
    if (!selectedProject?.bop_steps) return [];
    if (!searchBopQuery.trim()) return selectedProject.bop_steps;
    const q = searchBopQuery.toLowerCase();
    return selectedProject.bop_steps.filter(
      (s) =>
        s.process_name.toLowerCase().includes(q) ||
        s.station_name.toLowerCase().includes(q) ||
        s.qc_criteria_text.toLowerCase().includes(q)
    );
  }, [selectedProject, searchBopQuery]);

  const projectInspections = useMemo(() => {
    if (!selectedProject) return inspections;
    return inspections.filter((i) => i.project_id === selectedProject.id);
  }, [inspections, selectedProject]);

  const filteredNcrs = useMemo(() => {
    return ncrLogs.filter((n) => {
      if (ncrStatusFilter !== "ALL" && n.status !== ncrStatusFilter) return false;
      if (searchNcrQuery.trim()) {
        const q = searchNcrQuery.toLowerCase();
        const mNo = String(n.ncr_number || "").toLowerCase().includes(q);
        const mSt = String(n.station_name || "").toLowerCase().includes(q);
        const mCat = String(n.defect_category || "").toLowerCase().includes(q);
        const mRoot = String(n.root_cause || "").toLowerCase().includes(q);
        if (!mNo && !mSt && !mCat && !mRoot) return false;
      }
      return true;
    });
  }, [ncrLogs, ncrStatusFilter, searchNcrQuery]);

  const parseCriteriaPoints = useCallback((criteriaText: string): string[] => {
    if (!criteriaText || !criteriaText.trim()) {
      return [
        "Verify dimensional accuracy against engineering drawing tolerance",
        "Check surface finish, edge integrity & absence of structural cracks",
        "Confirm work instruction (SOP) parameters and machine setup",
      ];
    }
    const parts = criteriaText
      .split(/[\n;•]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [criteriaText];
  }, []);

  const handleOpenInspectModal = useCallback(
    (step: BopStepQcItem, defaultType = "IPQC") => {
      setActiveBopStep(step);
      const points = parseCriteriaPoints(step.qc_criteria_text);
      const initialChecks: Record<string, boolean> = {};
      points.forEach((pt) => {
        initialChecks[pt] = true;
      });
      setCheckedCriteria(initialChecks);
      setInspectForm({
        inspection_type: !step.fai_approved ? "FAI" : defaultType,
        wot_id: selectedProject?.wots?.[0]?.id || "",
        parameter_name: `${step.process_name} — BOP Criteria Check`,
        nominal_spec: step.qc_criteria_text
          ? step.qc_criteria_text.slice(0, 80)
          : "Per BOP Standard",
        tolerance_spec: "± 1.0 mm / Standard Tolerance",
        measured_value: "Within Spec",
        sample_size: "5",
        passed_qty: "5",
        defect_qty: "0",
        disposition: "PASSED",
        notes: "",
      });
      setShowInspectModal(true);
    },
    [parseCriteriaPoints, selectedProject?.wots]
  );

  const handleSubmitInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !activeBopStep) return;

    const sampleSize = Math.max(1, Number(inspectForm.sample_size) || 1);
    const passedQty = Math.max(0, Number(inspectForm.passed_qty) || 0);
    const defectQty = Math.max(0, Number(inspectForm.defect_qty) || 0);
    if (passedQty + defectQty !== sampleSize) {
      showToast(
        `Sample math mismatch: Passed (${passedQty}) + Defect (${defectQty}) must equal Sample Size (${sampleSize}).`,
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const checklistPayload = Object.entries(checkedCriteria).map(
        ([criterion, passed]) => ({
          criterion,
          passed,
        })
      );
      const res = await apiFetch(
        "/api/qc/bop-inspections",
        {
          method: "POST",
          body: JSON.stringify({
            project_id: selectedProject.id,
            bop_step_id: activeBopStep.id,
            station_id: activeBopStep.station_id,
            station_name: activeBopStep.station_name,
            process_name: activeBopStep.process_name,
            wot_id: inspectForm.wot_id || null,
            inspection_type: inspectForm.inspection_type,
            parameter_name: inspectForm.parameter_name,
            nominal_spec: inspectForm.nominal_spec,
            tolerance_spec: inspectForm.tolerance_spec,
            measured_value: inspectForm.measured_value,
            sample_size: sampleSize,
            passed_qty: passedQty,
            defect_qty: defectQty,
            disposition: inspectForm.disposition,
            checklist_items: checklistPayload,
            inspector_name: user?.name || user?.username || "QA/QC Inspector",
            notes: inspectForm.notes,
          }),
        },
        user?.username
      );
      if (res.ok) {
        showToast(
          `${inspectForm.inspection_type} inspection recorded for ${activeBopStep.process_name}`,
          "success"
        );
        setShowInspectModal(false);
        fetchProcessQcHub();
      } else {
        showToast(res.error || "Failed to record BOP inspection", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error saving BOP inspection", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenNcrModal = useCallback(
    (step?: BopStepQcItem) => {
      const proj = selectedProject || projects[0];
      setNcrForm({
        project_id: proj?.id || "",
        bop_step_id: step?.id || proj?.bop_steps?.[0]?.id || "",
        station_id: step?.station_id || proj?.bop_steps?.[0]?.station_id || "",
        station_name:
          step?.station_name ||
          step?.process_name ||
          proj?.bop_steps?.[0]?.station_name ||
          "Workstation",
        wot_id: proj?.wots?.[0]?.id || "",
        defect_category: "DIMENSIONAL_OUT_OF_TOLERANCE",
        severity: "MAJOR",
        defect_qty: "1",
        disposition_action: "REWORK",
        root_cause: "",
        corrective_action: "",
        cost_of_poor_quality: "150000",
      });
      setShowNcrModal(true);
    },
    [projects, selectedProject]
  );

  const handleSubmitNcr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ncrForm.project_id) {
      showToast("Please select a project", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/qc/ncr",
        {
          method: "POST",
          body: JSON.stringify({
            ...ncrForm,
            defect_qty: Number(ncrForm.defect_qty) || 1,
            cost_of_poor_quality: Number(ncrForm.cost_of_poor_quality) || 0,
            reported_by: user?.name || user?.username || "QA/QC Inspector",
          }),
        },
        user?.username
      );
      if (res.ok) {
        showToast(
          res.data?.message ||
            `NCR ${res.data?.ncr_number || ""} logged and tagged to station`,
          "success"
        );
        setShowNcrModal(false);
        setLedgerMode("NCR_CAPA");
        fetchProcessQcHub();
      } else {
        showToast(res.error || "Failed to create NCR", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error creating NCR", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveNcr = useCallback(
    async (ncrId: string, ncrNumber: string) => {
      try {
        const res = await apiFetch(
          `/api/qc/ncr/${ncrId}/resolve`,
          {
            method: "POST",
            body: JSON.stringify({
              resolved_by: user?.name || user?.username || "QA/QC Inspector",
            }),
          },
          user?.username
        );
        if (res.ok) {
          showToast(
            res.data?.message ||
              `NCR ${ncrNumber} verified, Rework/Hold restored, and WOT unlocked`,
            "success"
          );
          fetchProcessQcHub();
        } else {
          showToast(res.error || "Failed to resolve NCR", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Error resolving NCR", "error");
      }
    },
    [fetchProcessQcHub, showToast, user?.name, user?.username]
  );

  const handleAuthorizeFgr = useCallback(
    async (proj: QcProjectItem) => {
      if (proj.open_ncr_count > 0) {
        showToast(
          `Cannot release FGR while ${proj.open_ncr_count} open NCR(s) remain unresolved on ${proj.name}.`,
          "error"
        );
        return;
      }
      if (
        proj.total_bop_steps > 0 &&
        proj.fai_completed_count < proj.total_bop_steps
      ) {
        showToast(
          `Cannot release FGR: ${
            proj.total_bop_steps - proj.fai_completed_count
          } BOP step(s) still require First Article Inspection (FAI) sign-off.`,
          "error"
        );
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await apiFetch(
          `/api/production/projects/${proj.id}/finish-and-inbound`,
          {
            method: "POST",
            body: JSON.stringify({
              inspector_id: user?.id || user?.username || "QA-QC",
              notes: "Final QA & FGR Authorized via Process Quality Control Hub",
            }),
          },
          user?.username
        );
        if (res.ok) {
          showToast(
            `FGR Authorized for ${proj.name}! Finished goods inbounded to Warehouse.`,
            "success"
          );
          fetchProcessQcHub();
          if (res.data?.fgr) {
            setSelectedFgrProject(proj);
            setSelectedFgrDoc(res.data.fgr);
          }
        } else {
          showToast(res.error || "Failed to authorize FGR", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Error authorizing FGR", "error");
      } finally {
        setIsSubmitting(false);
      }
    },
    [fetchProcessQcHub, showToast, user?.id, user?.username]
  );

  const handleOpenFgrCertificate = useCallback(
    async (proj: QcProjectItem) => {
      try {
        const res = await apiFetch(
          `/api/production/projects/${proj.id}/execution-summary`,
          {},
          user?.username
        );
        if (res.ok && res.data?.fgr) {
          setSelectedFgrProject(proj);
          setSelectedFgrDoc(res.data.fgr);
        } else {
          setSelectedFgrProject(proj);
          setSelectedFgrDoc({
            fgr_number: proj.fgr_number || `FGR-${proj.spk_number || proj.id}`,
            project_id: proj.id,
            project_name: proj.name,
            spk_number: proj.spk_number,
            customer: proj.customer_name,
            qty_inspected: proj.qty,
            qty_passed: proj.qty,
            qty_rejected: 0,
            inspected_at: new Date().toISOString(),
            inspector_id: user?.username || "QA-QC",
            notes: "Verified via Process Quality Control Hub",
          });
        }
      } catch {
        showToast("Failed to load FGR certificate", "error");
      }
    },
    [showToast, user?.username]
  );

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        title="Process Quality Control"
        subtitle="In-process tolerance, FAI & FGR release"
        icon={<ClipboardCheck className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => handleOpenNcrModal()}
              leftIcon={<AlertOctagon className="w-3.5 h-3.5 text-rose-600" />}
            >
              Log NCR / Defect
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              onClick={fetchProcessQcHub}
              disabled={isLoading}
              title="Refresh Process QC Data"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
              />
            </Button>
          </div>
        }
      />

      {/* TOP FULL-WIDTH QUALITY ASSURANCE TELEMETRY STRIP */}
      <ProcessQcTopKpiStrip summary={summary} />

      {/* MASTER-DETAIL ENGINEERING BOP QUALITY GATE CONSOLE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <ProcessQcTelemetryRail
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={setSelectedProjectId}
          stationAnalytics={stationAnalytics}
          isSubmitting={isSubmitting}
          onAuthorizeFgr={handleAuthorizeFgr}
          onOpenFgrCertificate={handleOpenFgrCertificate}
        />

        <ProcessBopGateStepper
          selectedProject={selectedProject}
          filteredBopSteps={filteredBopSteps}
          searchBopQuery={searchBopQuery}
          setSearchBopQuery={setSearchBopQuery}
          parseCriteriaPoints={parseCriteriaPoints}
          onOpenInspectModal={handleOpenInspectModal}
          onOpenNcrModal={handleOpenNcrModal}
        />
      </div>

      {/* FULL-WIDTH BOTTOM INSPECTION & NCR/CAPA REGISTRY LEDGER */}
      <ProcessQcLedgerTabs
        ledgerMode={ledgerMode}
        setLedgerMode={setLedgerMode}
        projectInspections={projectInspections}
        filteredNcrs={filteredNcrs}
        projects={projects}
        searchNcrQuery={searchNcrQuery}
        setSearchNcrQuery={setSearchNcrQuery}
        ncrStatusFilter={ncrStatusFilter}
        setNcrStatusFilter={setNcrStatusFilter}
        onResolveNcr={handleResolveNcr}
      />

      {/* MODAL 1: BOP PARAMETER & TOLERANCE INSPECTION MODAL */}
      <BopInspectionModal
        isOpen={showInspectModal}
        onClose={() => setShowInspectModal(false)}
        activeBopStep={activeBopStep}
        selectedProject={selectedProject}
        checkedCriteria={checkedCriteria}
        setCheckedCriteria={setCheckedCriteria}
        inspectForm={inspectForm}
        setInspectForm={setInspectForm}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmitInspection}
      />

      {/* MODAL 2: CREATE NON-CONFORMANCE REPORT (NCR) */}
      <NcrLogModal
        isOpen={showNcrModal}
        onClose={() => setShowNcrModal(false)}
        projects={projects}
        ncrForm={ncrForm}
        setNcrForm={setNcrForm}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmitNcr}
      />

      {/* MODAL 3: FGR CERTIFICATE PREVIEW MODAL */}
      {selectedFgrProject && selectedFgrDoc && (
        <FgrPreviewModal
          isOpen={Boolean(selectedFgrDoc)}
          onClose={() => {
            setSelectedFgrDoc(null);
            setSelectedFgrProject(null);
          }}
          project={selectedFgrProject}
          fgr={selectedFgrDoc}
        />
      )}
    </div>
  );
}
