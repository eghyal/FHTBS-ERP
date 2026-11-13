import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProductionSetupAndMaster } from "@/pages/erp/production/hub/SetupMaster";
import { io } from "socket.io-client";
import { useProductionHubStore } from "@/stores/productionHubStore";
import {
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ShieldCheck,
  Gauge,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { BopRoutingPreviewModal } from "@/components/erp/BopPreviewModal";
import { FactoryFactorHistoryModal } from "@/components/erp/production/ProductionHubModals";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";

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

export default function PpicProjectDetail() {
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
    customLotSize,
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
    itemsCatalog,
    setItemsCatalog,
    selectedBop,
    setSelectedBop,
    confirmModal,
    setConfirmModal,
    bopData: bopSteps,
    setBopData: setBopSteps,
    setWotCpmAnalysis,
  } = useProductionHubStore();

  const [ffHistoryModalOpen, setFfHistoryModalOpen] = useState(false);
  const [ffHistoryData, setFfHistoryData] = useState<any>(null);
  const fetchDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const safeBopSteps = useMemo(
    () => (Array.isArray(bopSteps) ? bopSteps : []),
    [bopSteps]
  );
  const safeStations = useMemo(
    () => (Array.isArray(stations) ? stations : []),
    [stations]
  );
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
          process_name:
            s.process_name ||
            s.step_name ||
            s.name ||
            s.task_name ||
            `Process ${idx + 1}`,
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

  const isMasterSet = Boolean(project?.is_master_set);

  // Synchronize 1 WOT Root-to-Finish Mathematical CPM Analysis
  useEffect(() => {
    if (processSteps.length === 0) return;
    const wotSize = customLotSize || project?.lot_size || 10;
    const ff = (factoryFactor || 85) / 100;
    const wh = Number(project?.shift_hours || 8.0);

    const nodes = processSteps.map((s: any) => {
      const station = safeStations.find((st: any) => st.id === s.station_id);
      const stMp = Number(
        s.manpower_count || s.manpower_allocated || station?.max_manpower || 1
      );
      let machineIds: string[] = [];
      try {
        if (Array.isArray(s.assigned_machine_ids)) {
          machineIds = s.assigned_machine_ids.filter(Boolean);
        } else if (
          typeof s.assigned_machine_ids_json === "string" &&
          s.assigned_machine_ids_json.trim()
        ) {
          const parsed = JSON.parse(s.assigned_machine_ids_json);
          if (Array.isArray(parsed)) machineIds = parsed.filter(Boolean);
        }
      } catch (e) {}
      if (machineIds.length === 0 && s.assigned_machine_id) {
        machineIds = [String(s.assigned_machine_id)];
      }
      const machineCount = machineIds.length;
      const speedFactor =
        machineCount > 1
          ? Math.max(1.0, Number(s.machine_efficiency_multiplier) || 1.5)
          : 1.0;
      const compoundDivisor =
        machineCount > 1 ? Math.pow(speedFactor, machineCount - 1) : 1.0;
      const ct = Number(s.cycle_time_minutes || 15);
      const ect = ct / (compoundDivisor * ff);
      const hours = (wotSize * ect) / 60;
      const days = hours / wh;
      return {
        ...s,
        station_name: station?.station_name || "Station",
        mp: stMp,
        machine_efficiency_multiplier: speedFactor,
        effective_ct_minutes: Number(ect.toFixed(2)),
        hours,
        durationDays: Math.max(0.01, days),
      };
    });

    const es: Record<string, number> = {};
    const ef: Record<string, number> = {};
    nodes.forEach((n: any) => {
      let preds: string[] = [];
      try {
        preds =
          typeof n.predecessor_ids === "string"
            ? JSON.parse(n.predecessor_ids)
            : n.predecessor_ids || [];
      } catch (e) {}
      es[n.id] =
        preds.length > 0
          ? Math.max(...preds.map((pId: string) => ef[pId] || 0))
          : 0;
      ef[n.id] = es[n.id] + n.durationDays;
    });

    const maxDays = Math.max(...Object.values(ef), 0);
    const totalCriticalHours = maxDays * wh;

    const lf: Record<string, number> = {};
    const ls: Record<string, number> = {};
    const floatDays: Record<string, number> = {};
    const reversedNodes = [...nodes].reverse();
    reversedNodes.forEach((n: any) => {
      const successors = nodes.filter((succ: any) => {
        let sPreds: string[] = [];
        try {
          sPreds =
            typeof succ.predecessor_ids === "string"
              ? JSON.parse(succ.predecessor_ids)
              : succ.predecessor_ids || [];
        } catch (e) {}
        return sPreds.includes(n.id);
      });
      lf[n.id] =
        successors.length > 0
          ? Math.min(...successors.map((s: any) => ls[s.id] ?? maxDays))
          : maxDays;
      ls[n.id] = Math.max(0, lf[n.id] - n.durationDays);
      floatDays[n.id] = Math.max(0, Number((ls[n.id] - es[n.id]).toFixed(3)));
    });

    const enrichedNodes = nodes.map((n: any) => ({
      ...n,
      es: Number((es[n.id] * wh).toFixed(2)),
      ef: Number((ef[n.id] * wh).toFixed(2)),
      ls: Number((ls[n.id] * wh).toFixed(2)),
      lf: Number((lf[n.id] * wh).toFixed(2)),
      floatHours: Number((floatDays[n.id] * wh).toFixed(2)),
      isCritical: floatDays[n.id] <= 0.05,
    }));

    const criticalPath = enrichedNodes
      .filter((n: any) => n.isCritical || nodes.length <= 4)
      .map((n: any) => ({ id: n.id, name: n.process_name, hours: n.hours }));

    const stationLoads: Record<string, { name: string; hours: number }> = {};
    nodes.forEach((n: any) => {
      const stKey = n.station_id || "st_default";
      if (!stationLoads[stKey])
        stationLoads[stKey] = { name: n.station_name, hours: 0 };
      stationLoads[stKey].hours += n.hours;
    });
    const bottleneckStation =
      Object.values(stationLoads).sort((a, b) => b.hours - a.hours)[0] || null;

    const targetQty = Number(project?.qty) || 100;
    const wotQty = Math.max(1, customLotSize || project?.lot_size || 10);
    const wotsNeeded = Math.max(1, Math.ceil(targetQty / wotQty));

    const fallbackDaysPerWot = Math.max(
      0.5,
      (processSteps.reduce(
        (acc: number, s: any) => acc + (Number(s.cycle_time_minutes) || 10),
        0
      ) *
        wotQty) /
        (wh * 60)
    );
    const effectiveDaysPerWot = maxDays > 0 ? maxDays : fallbackDaysPerWot;
    const bottleneckDaysPerWot = bottleneckStation
      ? bottleneckStation.hours / wh
      : effectiveDaysPerWot * 0.5;

    const pipelinedTotalDays =
      wotsNeeded > 1 && Object.keys(stationLoads).length > 1
        ? effectiveDaysPerWot + (wotsNeeded - 1) * bottleneckDaysPerWot
        : effectiveDaysPerWot * wotsNeeded;
    const estimatedTotalDays = Math.max(1, Math.ceil(pipelinedTotalDays));

    const now = new Date();
    const rawDeadlineStr =
      project?.ntp_deadline ||
      spkData?.due_date ||
      spkData?.target_completion_date ||
      (project?.due_date && String(project.due_date) !== "2099-12-31"
        ? project.due_date
        : null) ||
      project?.end_date ||
      project?.deadline;
    const deadlineStr = rawDeadlineStr
      ? String(rawDeadlineStr).slice(0, 10)
      : null;
    let availableCalendarDays = 0;
    if (deadlineStr) {
      const targetDate = new Date(deadlineStr);
      const startDate = project?.start_date
        ? new Date(project.start_date)
        : now;
      const ms = targetDate.getTime() - startDate.getTime();
      availableCalendarDays = Math.max(
        1,
        Math.ceil(ms / (1000 * 60 * 60 * 24))
      );
    } else {
      availableCalendarDays = estimatedTotalDays;
    }

    const deliveryGapDays = Math.max(
      0,
      estimatedTotalDays - availableCalendarDays
    );
    const isDelayed = deliveryGapDays > 0;
    const extraHoursPerDayNeeded =
      isDelayed && availableCalendarDays > 0
        ? Number(((deliveryGapDays * wh) / availableCalendarDays).toFixed(1))
        : 0;
    const extraShiftsNeeded =
      isDelayed && availableCalendarDays > 0
        ? Math.ceil(extraHoursPerDayNeeded / wh)
        : 0;

    setWotCpmAnalysis({
      wotSize,
      factoryFactor: factoryFactor || 85,
      workingHoursPerDay: wh,
      totalCriticalHours,
      totalCriticalDays: maxDays,
      criticalPath,
      bottleneckStation,
      nodes: enrichedNodes,
      targetQty,
      wotsNeeded,
      estimatedTotalDays,
      availableCalendarDays,
      deliveryGapDays,
      isDelayed,
      extraHoursPerDayNeeded,
      extraShiftsNeeded,
      deadlineDate: deadlineStr || null,
    });
  }, [
    processSteps,
    safeStations,
    customLotSize,
    factoryFactor,
    project,
    spkData,
    setWotCpmAnalysis,
  ]);

  useEffect(() => {
    const socket = io();
    socket.on("production:updated", (data) => {
      if (!data.project_id || data.project_id === id) {
        if (fetchDataTimeoutRef.current)
          clearTimeout(fetchDataTimeoutRef.current);
        fetchDataTimeoutRef.current = setTimeout(() => {
          fetchProjectData(true);
        }, 300);
      }
    });
    return () => {
      if (fetchDataTimeoutRef.current)
        clearTimeout(fetchDataTimeoutRef.current);
      socket.disconnect();
    };
  }, [id]);

  const fetchFactoryFactorHistory = async () => {
    try {
      const res = await apiFetch(
        "/api/production/factory-factor-wma",
        {},
        user?.username
      );
      if (res.ok && res.data) {
        const data = res.data;
        setFfHistoryData(data);
        if (data?.current_wma_ff) {
          setFactoryFactor(Math.round(Number(data.current_wma_ff)));
        }
      }
    } catch (e) {
      console.error("Failed to fetch factory factor history", e);
    }
  };

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

      const [projRes, bopRes, bomRes, wotsRes, stationsRes, itemsRes, spkRes] =
        await Promise.all([
          safeFetch(`/api/projects/${id}`),
          safeFetch(`/api/production/projects/${id}/bop`),
          safeFetch(`/api/projects/${id}/bom`),
          safeFetch(`/api/production/projects/${id}/wots`),
          safeFetch(`/api/production/projects/${id}/stations`),
          safeFetch(`/api/inventory`),
          safeFetch(`/api/projects/${id}/spk`),
        ]);

      if (projRes.ok && projRes.data) {
        const rawProjWrapper = projRes.data;
        const projData = rawProjWrapper?.project
          ? {
              ...rawProjWrapper.project,
              ntp_deadline:
                rawProjWrapper.ntp_deadline ||
                rawProjWrapper.project.ntp_deadline,
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

      if (itemsRes.ok && itemsRes.data) {
        const rawItems = itemsRes.data;
        const catalogList = Array.isArray(rawItems)
          ? rawItems
          : rawItems?.items || [];
        setItemsCatalog(catalogList);
        const machineItems = catalogList.filter((item: any) => {
          const t = String(item.type || item.item_type || "").toUpperCase();
          const c = String(item.category || "").toUpperCase();
          return (
            t === "MACHINE" || c.includes("MACHINE") || c.includes("EQUIPMENT")
          );
        });
        setMachines(machineItems);
      }

      if (spkRes.ok && spkRes.data) {
        const unwrappedSpk =
          spkRes.data?.spk !== undefined ? spkRes.data.spk : spkRes.data;
        if (unwrappedSpk) {
          setSpkData(unwrappedSpk);
        }
      }
    } catch (error) {
      console.error("Failed to fetch PPIC project planning data:", error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
    fetchFactoryFactorHistory();
  }, [id]);

  const displayCode = useMemo(
    () =>
      spkData?.spk_number ||
      project?.spk_number ||
      project?.code ||
      project?.project_code ||
      id,
    [
      spkData?.spk_number,
      project?.spk_number,
      project?.code,
      project?.project_code,
      id,
    ]
  );

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
            {project.project_category || project.type}) and does not require
            PPIC production setup.
          </p>
          <Button onClick={() => navigate("/ppic")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to PPIC Planning Hub
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
            <div className="flex items-center justify-center gap-2">
              <span className="font-mono text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-stone-100 text-stone-800 border border-stone-200/90">
                {project.spk_number || project.id}
              </span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 border border-amber-200 uppercase">
                BOP {project.bop_status || "DRAFT"}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              BOP Awaiting Technical Sign-off by Engineering
            </h2>
            <p className="text-sm text-stone-600 max-w-xl mx-auto leading-relaxed">
              The Bill of Process route and station flow for project{" "}
              {project.name || project.id} has not yet been authorized by
              Engineering (status: {project.bop_status || "DRAFT"}). PPIC Setup
              &amp; Master and WOT Sub-Lot orchestration remain locked until
              technical approval is signed.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => navigate("/ppic")}
              className="rounded-lg px-5 font-bold text-xs h-10 border-stone-200 hover:bg-stone-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to PPIC Planning Hub
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        title={`Setup & Master — ${
          project?.name ||
          project?.project_name ||
          spkData?.title ||
          "Manufacturing Project"
        }`}
        subtitle={`WO: ${displayCode} · ${isMasterSet ? "Committed" : "Draft Setup"}`}
        icon={<Sliders className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              onClick={() => navigate("/ppic")}
              leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
            >
              PPIC Planning Hub
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                fetchFactoryFactorHistory();
                setFfHistoryModalOpen(true);
              }}
              leftIcon={<Gauge className="w-3.5 h-3.5 text-emerald-600" />}
            >
              {factoryFactor || 85}% WMA
            </Button>
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => fetchProjectData()}
              title="Refresh Setup & Master Data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />

      <div className="space-y-5">
        <ProductionSetupAndMaster
          projectId={id || ""}
          project={project}
          spkData={spkData}
          processSteps={processSteps}
          stations={safeStations}
          itemsCatalog={itemsCatalog}
          wots={safeLots}
          factoryFactor={factoryFactor || 85}
          setFactoryFactor={setFactoryFactor}
          onOpenFfHistory={() => {
            fetchFactoryFactorHistory();
            setFfHistoryModalOpen(true);
          }}
          onRefresh={(silent) => fetchProjectData(Boolean(silent))}
          onNavigateToShopFloor={() => {
            showToast(
              "Master schedule committed and released to Shop Floor Execution",
              "success"
            );
            fetchProjectData(true);
          }}
          user={user}
        />
      </div>

      <FactoryFactorHistoryModal
        isOpen={ffHistoryModalOpen}
        onClose={() => setFfHistoryModalOpen(false)}
        ffHistoryData={ffHistoryData}
        factoryFactor={factoryFactor || 85}
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

      {selectedBop && (
        <BopRoutingPreviewModal
          isOpen={Boolean(selectedBop)}
          onClose={() => setSelectedBop(null)}
          project={project}
          steps={Array.isArray(selectedBop) ? selectedBop : bopSteps}
          projectBoms={bom}
        />
      )}
    </div>
  );
}
