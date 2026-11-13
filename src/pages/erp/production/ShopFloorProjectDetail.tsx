import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProductionShopFloor } from "./hub/ShopFloor";
import { useInterval } from "@/hooks/useInterval";
import { io } from "socket.io-client";
import { useProductionHubStore } from "@/stores/productionHubStore";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  PackageCheck,
  RefreshCw,
  Lock,
  Unlock,
  Factory,
  ShieldCheck,
  Award,
  FileCheck2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { NdpPreviewModal } from "@/components/erp/NdpPreviewModal";
import { TravelTagModal } from "@/components/erp/TravelTagModal";
import { BopRoutingPreviewModal } from "@/components/erp/BopPreviewModal";
import { FgrPreviewModal } from "@/components/erp/FgrPreviewModal";
import { ExecutionSummaryModal } from "@/components/erp/production/ProductionHubModals";
import { Loader } from "@/components/shared/Loader";
import { cn } from "@/lib/utils";
import {
  isBopQcGateStep,
  parseLegacyQcCriteriaToParameters,
  calculateQcGateCycleTime,
} from "@/components/erp/bopTypes";

const isNonMfgProject = (project: any) => {
  if (!project) return false;
  const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];
  const idStr = String(project.id || project.code || "").trim().toUpperCase();
  const nameStr = String(project.name || "").trim().toUpperCase();
  if (
    nonMfgIds.includes(idStr) ||
    nonMfgIds.includes(nameStr) ||
    nameStr.includes("CONSUMABLE") ||
    nameStr.includes("TRANSPORTATION") ||
    nameStr.includes("OTHER PROCUREMENT") ||
    nameStr.includes("GENERAL PROCUREMENT") ||
    String(project.status || "").toUpperCase() === "INTERNAL_OVERHEAD"
  ) {
    return true;
  }
  const cats = [
    "NON_PROJECT",
    "CONSUMABLE",
    "TRANSPORTATION",
    "OTHERS",
    "OTHER_PROCUREMENT",
    "GENERAL",
    "GENERAL_PROCUREMENT",
    "GENERAL_PURCHASE",
    "SOFTWARE_LICENSE",
    "OFFICE_SUPPLIES",
    "MARKETING_EVENT",
    "CONSULTING_SERVICE",
    "INFRASTRUCTURE",
  ];
  return (
    cats.includes(String(project.project_category || "").toUpperCase()) ||
    cats.includes(String(project.type || "").toUpperCase())
  );
};

export default function ShopFloorProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const {
    factoryFactor,
    setFactoryFactor,
    isLoading,
    setIsLoading,
    stations,
    setStations,
    setCustomLotSize,
    project,
    setProject,
    spkData,
    setSpkData,
    bom,
    setBom,
    lots,
    setLots,
    setMachines,
    activeNdps,
    setActiveNdps,
    itemsCatalog,
    setItemsCatalog,
    setStationTimers,
    selectedBop,
    setSelectedBop,
    showFgrModal,
    setShowFgrModal,
    fgrData,
    setFgrData,
    isFinishing,
    setIsFinishing,
    confirmModal,
    setConfirmModal,
    selectedTagForView,
    setSelectedTagForView,
    selectedNdpForView,
    setSelectedNdpForView,
    bopData: bopSteps,
    setBopData: setBopSteps,
  } = useProductionHubStore();

  const [executionSummaryModal, setExecutionSummaryModal] = useState<any | null>(null);
  const fetchDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isIncrementingRef = useRef<boolean>(false);

  const safeBopSteps = useMemo(() => (Array.isArray(bopSteps) ? bopSteps : []), [bopSteps]);
  const safeStations = useMemo(() => (Array.isArray(stations) ? stations : []), [stations]);
  const safeNdps = useMemo(() => (Array.isArray(activeNdps) ? activeNdps : []), [activeNdps]);
  const safeLots = useMemo(() => (Array.isArray(lots) ? lots : []), [lots]);

  const processSteps = useMemo(() => {
    return safeBopSteps
      .filter((s: any) => {
        if (!s) return false;
        const nodeType = String(s.node_type || "").toUpperCase();
        if (nodeType === "START" || nodeType === "END") return false;
        if (nodeType === "PRODUCT" && !isBopQcGateStep(s)) return false;
        const name = s.process_name || s.step_name || s.name || s.task_name;
        return Boolean(name && String(name).trim() !== "");
      })
      .map((s: any, idx: number) => {
        const isQcGate = isBopQcGateStep(s);
        let parsedQcParams = parseLegacyQcCriteriaToParameters(
          s.qc_parameters || s.qc_parameters_json,
          s.qc_criteria,
        );
        if (isQcGate && parsedQcParams.length === 0) {
          parsedQcParams = [
            {
              id: `qcp_default_${s.id || idx}_1`,
              parameter_name: "Dimensional & Visual Tolerance",
              specification: "Per Engineering Drawing ±0.05mm",
              measurement_method: "Digital Caliper / CMM",
              is_mandatory_gate: true,
              cycle_time_minutes: Math.max(2, Number(s.cycle_time_minutes) || 6),
            },
          ];
        }
        const computedCt = isQcGate
          ? calculateQcGateCycleTime(parsedQcParams, s.cycle_time_minutes)
          : s.cycle_time_minutes ||
            (s.cycle_time_seconds ? Math.round(s.cycle_time_seconds / 60) : 0) ||
            Math.round((Number(s.standard_hours) || 1) * 60) ||
            60;

        return {
          ...s,
          id: s.id || `bop_${idx}`,
          process_name: s.process_name || s.step_name || s.name || s.task_name || `Process ${idx + 1}`,
          step_sequence: s.step_sequence ?? idx + 1,
          cycle_time_minutes: computedCt,
          standard_hours:
            s.standard_hours || Number((computedCt / 60).toFixed(2)) || 1.0,
          node_type: s.node_type || "PROCESS",
          is_qc_gate: isQcGate,
          qc_parameters: parsedQcParams,
        };
      });
  }, [safeBopSteps]);

  const completedCount = processSteps.filter((s: any) => s.status === "COMPLETED").length;
  const allBopCompleted = processSteps.length > 0 && completedCount === processSteps.length;
  const isMasterSet = Boolean(project?.is_master_set);
  const isProjectCompleted =
    project?.status === "COMPLETED" || project?.production_status === "COMPLETED";

  useEffect(() => {
    const socket = io();
    socket.on("production:updated", (data) => {
      if (!data.project_id || data.project_id === id) {
        if (fetchDataTimeoutRef.current) clearTimeout(fetchDataTimeoutRef.current);
        fetchDataTimeoutRef.current = setTimeout(() => {
          fetchProjectData(true);
        }, 300);
      }
    });
    return () => {
      if (fetchDataTimeoutRef.current) clearTimeout(fetchDataTimeoutRef.current);
      socket.disconnect();
    };
  }, [id]);

  useInterval(() => {
    if (isIncrementingRef.current) return;
    const runningStations = safeStations.filter((st: any) => {
      const stepsInStation = processSteps.filter((s: any) => s.station_id === st.id);
      const hasNdp = safeNdps.some(
        (n: any) => n.status === "OPEN" && stepsInStation.some((s: any) => s.id === n.bop_id)
      );
      const isRunning = stepsInStation.some((s: any) => s.status === "IN_PROGRESS");
      return isRunning && !hasNdp;
    });

    if (runningStations.length > 0) {
      setStationTimers((prev) => {
        const next = { ...prev };
        runningStations.forEach((st: any) => {
          next[st.id] = (next[st.id] || 0) + 1;
        });
        return next;
      });
    }
  }, 1000);

  const fetchProjectData = async (silent = false) => {
    if (!id) return;
    if (!silent) setIsLoading(true);
    try {
      const safeFetch = (url: string) =>
        apiFetch(url, {}, user?.username).catch((err) => ({
          ok: false,
          data: null,
          error: err?.message,
        }));

      const [
        projRes,
        bopRes,
        bomRes,
        wotsRes,
        stationsRes,
        ndpsRes,
        itemsRes,
        spkRes,
        execSumRes,
        ffRes,
      ] = await Promise.all([
        safeFetch(`/api/projects/${id}`),
        safeFetch(`/api/production/projects/${id}/bop`),
        safeFetch(`/api/projects/${id}/bom`),
        safeFetch(`/api/production/projects/${id}/wots`),
        safeFetch(`/api/production/projects/${id}/stations`),
        safeFetch(`/api/production/projects/${id}/ndps`),
        safeFetch(`/api/inventory`),
        safeFetch(`/api/projects/${id}/spk`),
        safeFetch(`/api/production/projects/${id}/execution-summary`),
        safeFetch(`/api/production/factory-factor-wma`),
      ]);

      if (projRes.ok && projRes.data) {
        const rawProjWrapper = projRes.data;
        const projData = rawProjWrapper?.project
          ? {
              ...rawProjWrapper.project,
              ntp_deadline:
                rawProjWrapper.ntp_deadline || rawProjWrapper.project.ntp_deadline,
            }
          : rawProjWrapper;
        setProject(projData);
        if (projData.lot_size) setCustomLotSize(Number(projData.lot_size));
        if (rawProjWrapper?.spk) {
          setSpkData(rawProjWrapper.spk);
        }
      }

      if (bopRes.ok && bopRes.data) {
        const rawBop = bopRes.data;
        setBopSteps(Array.isArray(rawBop) ? rawBop : rawBop?.steps || []);
      }

      if (bomRes.ok && bomRes.data) {
        const rawBom = bomRes.data;
        setBom(Array.isArray(rawBom) ? rawBom : rawBom?.bom || []);
      }

      if (wotsRes.ok && wotsRes.data) {
        const rawLots = wotsRes.data;
        setLots(Array.isArray(rawLots) ? rawLots : rawLots?.wots || []);
      }

      if (stationsRes.ok && stationsRes.data) {
        const rawSt = stationsRes.data;
        const parsedStations = Array.isArray(rawSt)
          ? rawSt
          : Array.isArray(rawSt?.stations)
          ? rawSt.stations
          : [];
        setStations(parsedStations);
      }

      if (ndpsRes.ok && ndpsRes.data) {
        const rawNdp = ndpsRes.data;
        setActiveNdps(Array.isArray(rawNdp) ? rawNdp : rawNdp?.ndps || []);
      }

      if (itemsRes.ok && itemsRes.data) {
        const rawItems = itemsRes.data;
        const catalogList = Array.isArray(rawItems) ? rawItems : rawItems?.items || [];
        setItemsCatalog(catalogList);
        const machineItems = catalogList.filter((item: any) => {
          const t = String(item.type || item.item_type || "").toUpperCase();
          const c = String(item.category || "").toUpperCase();
          return t === "MACHINE" || c.includes("MACHINE") || c.includes("EQUIPMENT");
        });
        setMachines(machineItems);
      }

      if (spkRes.ok && spkRes.data) {
        const unwrappedSpk = spkRes.data?.spk !== undefined ? spkRes.data.spk : spkRes.data;
        if (unwrappedSpk) {
          setSpkData(unwrappedSpk);
        }
      }

      if (execSumRes.ok && execSumRes.data?.fgr) {
        setFgrData(execSumRes.data.fgr);
      }

      if (ffRes.ok && ffRes.data?.current_wma_ff) {
        setFactoryFactor(Math.round(Number(ffRes.data.current_wma_ff)));
      }
    } catch (error) {
      console.error("Failed to fetch shop floor project data:", error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  const handleFinishProject = async () => {
    if (!id) return;
    setIsFinishing(true);
    try {
      const res = await apiFetch(
        `/api/production/projects/${id}/finish-and-inbound`,
        {
          method: "POST",
          body: JSON.stringify({
            inspector_id: user?.id || "USR-PROD",
            notes: "Completed via Shop Floor Execution",
          }),
        },
        user?.username
      );
      const data = res.data || {};
      if (!res.ok) {
        throw new Error(
          res.error || data.error || "Failed to finish project and inbound finished goods"
        );
      }

      showToast(
        "Project completed! FGR generated, FG inbounded, and Factory Factor calibrated.",
        "success"
      );

      if (data.fgr) {
        setFgrData(data.fgr);
      }
      setExecutionSummaryModal(data);
      await fetchProjectData(true);
    } catch (err: any) {
      showToast(err.message || "Error finishing project", "error");
    } finally {
      setIsFinishing(false);
    }
  };

  const displayCode = useMemo(
    () =>
      spkData?.spk_number ||
      project?.spk_number ||
      project?.code ||
      project?.project_code ||
      id,
    [spkData?.spk_number, project?.spk_number, project?.code, project?.project_code, id]
  );

  const handleOpenFgrDocument = useCallback(() => {
    if (executionSummaryModal?.fgr) {
      setFgrData(executionSummaryModal.fgr);
    } else if (!fgrData) {
      setFgrData({
        fgr_number: executionSummaryModal?.fgr_number || `FGR-${displayCode}`,
        project_id: project?.id || id,
        project_name: project?.name,
        spk_number: displayCode,
        customer: project?.customer,
        qty_inspected: executionSummaryModal?.qty_inbounded || project?.qty || 1,
        qty_passed: executionSummaryModal?.qty_inbounded || project?.qty || 1,
        qty_rejected: 0,
        inspected_at: project?.completed_at || new Date().toISOString(),
        inspector_id: user?.id || "USR-PROD",
        notes: "Completed via Shop Floor Execution",
      });
    }
    setShowFgrModal(true);
  }, [
    executionSummaryModal,
    fgrData,
    displayCode,
    project,
    id,
    user?.id,
    setFgrData,
    setShowFgrModal,
  ]);

  if (isLoading && !project) {
    return <Loader fullScreen />;
  }

  if (project && isNonMfgProject(project)) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center shadow-2xs">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-stone-900 mb-2">
            Non-Manufacturing Project Category
          </h2>
          <p className="text-sm text-stone-600 mb-6">
            This project is registered as a non-manufacturing category (
            {project.project_category || project.type}) and does not require shop floor execution.
          </p>
          <Button onClick={() => navigate("/production")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Shop Floor Execution
          </Button>
        </div>
      </div>
    );
  }

  if (project && project.bop_status !== "AUTHORIZED") {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div className="bg-white border border-amber-200 rounded-3xl p-8 sm:p-10 text-center shadow-sm space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 shadow-2xs">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              BOP Awaiting Technical Sign-off by Engineering
            </h2>
            <p className="text-sm text-stone-600 max-w-xl mx-auto leading-relaxed">
              The Bill of Process route and station flow for project {project.name || project.id} has not yet been authorized by Engineering.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" onClick={() => navigate("/production")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Shop Floor Execution
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (project && !isMasterSet && !isProjectCompleted && safeLots.length === 0) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div className="bg-white border border-amber-200 rounded-3xl p-8 sm:p-10 text-center shadow-sm space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 shadow-2xs">
            <Unlock className="w-9 h-9" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              Awaiting PPIC Master Schedule Commitment
            </h2>
            <p className="text-sm text-stone-600 max-w-xl mx-auto leading-relaxed">
              Project <strong>{project.name || project.id}</strong> has not yet been committed to the Shop Floor by the PPIC department. All WOT sub-lot sizing and workstation routing must be finalized in PPIC Planning Hub first.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Button variant="secondary" onClick={() => navigate("/production")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Shop Floor Execution
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 space-y-3.5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <button
                type="button"
                onClick={() => navigate("/production")}
                className="w-9 h-9 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 hover:border-stone-300 flex items-center justify-center transition-all shrink-0 cursor-pointer"
                title="Back to Shop Floor Execution"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-stone-100 text-stone-800 border border-stone-200/90">
                    {displayCode}
                  </span>
                  {project?.customer && (
                    <span className="text-[11px] font-semibold text-stone-600 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md truncate max-w-[220px]">
                      {project.customer}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Lock className="w-3 h-3" /> PPIC Committed
                  </span>
                  {isProjectCompleted && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      <CheckCircle2 className="w-3 h-3" /> Completed &amp; Inbounded
                    </span>
                  )}
                </div>

                <h1 className="text-lg sm:text-xl font-black text-stone-900 tracking-tight truncate">
                  {project?.name || project?.project_name || spkData?.title || "Manufacturing Project"}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-100 border border-stone-200 text-xs font-bold text-stone-800">
                <Factory className="w-3.5 h-3.5 text-emerald-600" />
                <span>Shop Floor Execution</span>
                {safeLots.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] border border-emerald-200 tabular-nums">
                    {safeLots.length} WOT
                  </span>
                )}
              </span>

              {!isProjectCompleted && isMasterSet && (
                <Button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: "Finish Project & Inbound Finished Goods",
                      message:
                        "Are you sure you want to complete production for this project? The system will issue a Finished Goods Receipt (FGR), inbound finished units into FG inventory, and generate the Post-Completion Execution Summary.",
                      onConfirm: handleFinishProject,
                    });
                  }}
                  disabled={isFinishing}
                  className={cn(
                    "text-xs font-bold px-3.5 py-2 rounded-lg shadow-2xs",
                    allBopCompleted
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-emerald-700 hover:bg-emerald-800 text-white"
                  )}
                >
                  <PackageCheck className="w-4 h-4 mr-1.5" />
                  {isFinishing ? "Finishing..." : "Finish Project & Inbound"}
                </Button>
              )}

              {(isProjectCompleted || fgrData) && (
                <Button
                  onClick={handleOpenFgrDocument}
                  className="text-xs font-bold px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs"
                >
                  <FileCheck2 className="w-4 h-4 mr-1.5" />
                  View &amp; Export FGR
                </Button>
              )}

              <button
                type="button"
                onClick={() => fetchProjectData()}
                className="w-9 h-9 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 flex items-center justify-center transition-colors cursor-pointer"
                title="Refresh Shop Floor Data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-2 space-y-5">
        {(isProjectCompleted || fgrData) && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-950">
                    Project Finished &amp; FGR Issued
                  </span>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white text-emerald-800 border border-emerald-200">
                    {fgrData?.fgr_number ||
                      executionSummaryModal?.fgr_number ||
                      `FGR-${displayCode}`}
                  </span>
                </div>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Finished Goods Receipt (FGR) has been recorded and finished units inbounded to Warehouse.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={handleOpenFgrDocument}
                className="text-xs font-bold px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs"
              >
                <FileCheck2 className="w-4 h-4 mr-1.5" />
                View &amp; Export FGR Document
              </Button>
            </div>
          </div>
        )}

        <ProductionShopFloor
          projectId={id || ""}
          project={project}
          spkData={spkData}
          bom={bom}
          processSteps={processSteps}
          stations={safeStations}
          itemsCatalog={itemsCatalog}
          wots={safeLots}
          activeNdps={safeNdps}
          factoryFactor={factoryFactor || 85}
          onRefresh={(silent) => fetchProjectData(Boolean(silent))}
          onNavigateToSetup={() => {
            showToast(
              "Setup & Master planning is managed by the PPIC department",
              "info"
            );
          }}
          user={user}
        />
      </div>

      <ExecutionSummaryModal
        executionSummaryModal={executionSummaryModal}
        onClose={() => setExecutionSummaryModal(null)}
        onViewFgr={handleOpenFgrDocument}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          confirmModal.onConfirm?.();
          confirmModal.action?.();
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }}
        title={confirmModal.title}
        message={confirmModal.message}
      />

      {selectedTagForView && (
        <TravelTagModal
          isOpen={Boolean(selectedTagForView)}
          onClose={() => setSelectedTagForView(null)}
          tag={selectedTagForView}
          project={project}
        />
      )}

      {selectedNdpForView && (
        <NdpPreviewModal
          isOpen={Boolean(selectedNdpForView)}
          onClose={() => setSelectedNdpForView(null)}
          ndp={selectedNdpForView}
          project={project}
        />
      )}

      {selectedBop && (
        <BopRoutingPreviewModal
          isOpen={Boolean(selectedBop)}
          onClose={() => setSelectedBop(null)}
          project={project}
          steps={Array.isArray(selectedBop) ? selectedBop : bopSteps}
          projectBoms={bom}
        />
      )}

      {showFgrModal && fgrData && (
        <FgrPreviewModal
          isOpen={showFgrModal}
          onClose={() => setShowFgrModal(false)}
          fgr={fgrData}
          project={project}
        />
      )}
    </div>
  );
}
