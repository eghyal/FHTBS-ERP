import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Clock,
  Boxes,
  CheckCircle2,
  ArrowRight,
  Activity,
  Lock,
  ExternalLink,
  Cpu,
  Zap,
  AlertTriangle,
  Sliders,
  GitMerge,
  GitFork,
  X,
  Plus,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ConcurrentScheduleMatrix } from "@/components/erp/production/setup/ScheduleMatrix";
import {
  ProcessRouteConfigTable,
  ProcessConfigRow,
} from "@/components/erp/production/setup/ProcessRouteConfigTable";
import { SetupPlanModals } from "@/components/erp/production/setup/SetupPlanModals";
import {
  type BopQcParameter,
  isBopQcGateStep,
  parseLegacyQcCriteriaToParameters,
  calculateQcGateCycleTime,
} from "@/components/erp/bopTypes";
import { cn } from "@/lib/utils";

interface ProductionSetupAndMasterProps {
  projectId: string;
  project: any;
  spkData: any;
  processSteps: any[];
  stations: any[];
  itemsCatalog: any[];
  wots: any[];
  factoryFactor: number;
  setFactoryFactor: (val: number) => void;
  onOpenFfHistory?: () => void;
  onRefresh: (silent?: boolean) => void;
  onNavigateToShopFloor: () => void;
  user: any;
}

const SPEED_FACTOR_OPTIONS = [1.0, 1.25, 1.35, 1.5, 1.6, 1.8, 2.0, 2.2, 2.5];

export const ProductionSetupAndMaster: React.FC<ProductionSetupAndMasterProps> = ({
  projectId,
  project,
  spkData,
  processSteps,
  stations,
  itemsCatalog,
  wots,
  factoryFactor,
  setFactoryFactor,
  onRefresh,
  onNavigateToShopFloor,
  user,
}) => {
  const { showToast } = useToast();
  const { language } = useLanguage();

  // Global Setup Parameters
  const [startDate, setStartDate] = useState<string>(() => {
    if (project?.start_date) return String(project.start_date).slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  });
  const [lotSize, setLotSize] = useState<number>(() => Number(project?.lot_size) || 10);
  const [shiftHours, setShiftHours] = useState<number>(() => Number(project?.shift_hours) || 8);
  const interStationBufferMins = 15;
  const orchestrationEngineMode = "AUTO_3_PHASE";

  // Per-Process Route Configuration State
  const [processConfigs, setProcessConfigs] = useState<ProcessConfigRow[]>([]);

  // Cross-Project Schedule & Contention State
  const [concurrentProjects, setConcurrentProjects] = useState<any[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(false);

  // Commit & WOT Sub-Lot State
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [showBopEditorModal, setShowBopEditorModal] = useState<boolean>(false);
  const [showPreviewPlanModal, setShowPreviewPlanModal] = useState<boolean>(false);
  const [committedWots, setCommittedWots] = useState<any[]>([]);
  const [procSyncStatus, setProcSyncStatus] = useState<any | null>(null);
  const [isSyncingProcDates, setIsSyncingProcDates] = useState<boolean>(false);

  // Filter ACTIVE machines from itemsCatalog (must have assigned operator or ACTIVE status)
  const activeMachines = useMemo(() => {
    if (!Array.isArray(itemsCatalog)) return [];
    return itemsCatalog.filter((item: any) => {
      const t = String(item.type || item.item_type || "").toUpperCase();
      const c = String(item.category || "").toUpperCase();
      const isMachine =
        t === "MACHINE" ||
        c.includes("MACHINE") ||
        c.includes("EQUIPMENT") ||
        Boolean(item.machine_category) ||
        Boolean(item.item_code && String(item.item_code).toUpperCase().startsWith("MC"));
      if (!isMachine) return false;
      const mStatus = String(item.machine_status || "").toUpperCase();
      if (mStatus === "BROKEN" || mStatus === "MAINTENANCE" || mStatus === "RETIRED") {
        return false;
      }
      const hasOperator = Boolean(item.assigned_operator && String(item.assigned_operator).trim());
      const opStatus = String(item.operational_status || "").toUpperCase();
      return hasOperator || opStatus === "ACTIVE";
    });
  }, [itemsCatalog]);

  // Sync initial project values when project loads
  useEffect(() => {
    if (project?.start_date) {
      setStartDate(String(project.start_date).slice(0, 10));
    }
    if (project?.lot_size) {
      setLotSize(Math.max(1, Number(project.lot_size)));
    }
    if (project?.shift_hours) {
      setShiftHours(Math.max(1, Number(project.shift_hours)));
    }
  }, [project?.id, project?.start_date, project?.lot_size, project?.shift_hours]);

  // Sync processSteps into editable processConfigs (Station ID is authoritative from BOP)
  useEffect(() => {
    if (!Array.isArray(processSteps)) return;
    setProcessConfigs((prev) => {
      return processSteps.map((s: any, idx: number) => {
        const existing = prev.find((p) => p.id === s.id);
        let preds: string[] = [];
        try {
          preds =
            typeof s.predecessor_ids === "string"
              ? JSON.parse(s.predecessor_ids)
              : Array.isArray(s.predecessor_ids)
              ? s.predecessor_ids
              : [];
        } catch (e) {}

        let parsedMachineIds: string[] = [];
        try {
          if (Array.isArray(s.assigned_machine_ids)) {
            parsedMachineIds = s.assigned_machine_ids.filter(Boolean);
          } else if (typeof s.assigned_machine_ids_json === "string" && s.assigned_machine_ids_json.trim()) {
            const arr = JSON.parse(s.assigned_machine_ids_json);
            if (Array.isArray(arr)) parsedMachineIds = arr.filter(Boolean);
          }
        } catch (e) {}

        if (parsedMachineIds.length === 0 && (s.assigned_machine_id || s.machine_id)) {
          parsedMachineIds = [String(s.assigned_machine_id || s.machine_id)];
        }

        // Keep only valid active machine IDs
        const validMachineIds = (existing?.assigned_machine_ids ?? parsedMachineIds).filter((mId) =>
          activeMachines.some((am: any) => am.id === mId)
        );

        const bopStationId =
          s.station_id ||
          existing?.station_id ||
          (stations.length > 0 ? stations[idx % stations.length]?.id : "UNASSIGNED");

        const rawSpeedFactor =
          existing?.machine_efficiency_multiplier !== undefined
            ? existing.machine_efficiency_multiplier
            : Number(s.machine_efficiency_multiplier) > 1
            ? Number(s.machine_efficiency_multiplier)
            : 1.5;

        const effectiveSpeedFactor = validMachineIds.length > 1 ? rawSpeedFactor : 1.0;

        const derivedOperators = validMachineIds
          .map((mId) => activeMachines.find((am: any) => am.id === mId)?.assigned_operator)
          .filter(Boolean) as string[];

        const isQcGate = Boolean(s.is_qc_gate || isBopQcGateStep(s));
        let parsedQcParams: BopQcParameter[] =
          existing?.qc_parameters && existing.qc_parameters.length > 0
            ? existing.qc_parameters
            : parseLegacyQcCriteriaToParameters(
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

        const resolvedCycleTime =
          parsedQcParams.length > 0
            ? calculateQcGateCycleTime(parsedQcParams, s.cycle_time_minutes)
            : existing?.cycle_time_minutes !== undefined
              ? existing.cycle_time_minutes
              : Number(s.cycle_time_minutes) || 20;

        return {
          id: s.id,
          step_sequence: s.step_sequence || idx + 1,
          process_name: s.process_name || `Process ${idx + 1}`,
          node_type: s.node_type || "PROCESS",
          product_role: s.product_role || null,
          is_qc_gate: isQcGate,
          qc_parameters: parsedQcParams,
          station_id: bopStationId || "UNASSIGNED",
          assigned_machine_id: validMachineIds[0] || "",
          assigned_machine_ids: validMachineIds,
          machine_efficiency_multiplier: effectiveSpeedFactor,
          cycle_time_minutes: resolvedCycleTime,
          manpower_count: Math.max(1, validMachineIds.length || 1),
          eligible_operators: derivedOperators,
          predecessor_ids: preds,
          transfer_mode:
            isQcGate
              ? "INTER_STATION"
              : existing?.transfer_mode ||
                (s.transfer_mode === "INTRA_STATION" || s.transfer_mode === "INTER_STATION"
                  ? s.transfer_mode
                  : undefined),
          status: s.status || "PENDING",
        };
      });
    });
  }, [processSteps, stations, activeMachines]);

  // Fetch Cross-Project Schedule, WMA Factory Factor & Procurement Plan Readiness
  const fetchScheduleAndWma = useCallback(async () => {
    setIsLoadingSchedule(true);
    try {
      const [schedRes, wmaRes, procRes] = await Promise.all([
        apiFetch(`/api/production/cross-project-schedule?exclude_project_id=${projectId}`, {}, user?.username),
        apiFetch(`/api/production/factory-factor-wma`, {}, user?.username),
        apiFetch(`/api/purchasing/procurement-plans/project-status/${projectId}`, {}, user?.username),
      ]);
      if (schedRes.ok && schedRes.data) {
        setConcurrentProjects(
          Array.isArray(schedRes.data.concurrent_projects) ? schedRes.data.concurrent_projects : []
        );
      }
      if (wmaRes.ok && wmaRes.data && wmaRes.data.current_wma_ff) {
        setFactoryFactor(Math.round(Number(wmaRes.data.current_wma_ff)));
      }
      if (procRes.ok && procRes.data) {
        setProcSyncStatus(procRes.data);
      }
    } catch (e) {
      console.error("Failed to fetch cross-project schedule:", e);
    } finally {
      setIsLoadingSchedule(false);
    }
  }, [projectId, user?.username, setFactoryFactor]);

  useEffect(() => {
    if (projectId) {
      fetchScheduleAndWma();
    }
  }, [projectId, fetchScheduleAndWma]);

  // Add or clear machines on a process row
  const handleAddMachineToProcess = (stepId: string, machineId: string) => {
    setProcessConfigs((prev) =>
      prev.map((row) => {
        if (row.id !== stepId) return row;
        if (!machineId || machineId === "GENERAL_WORKSTATION") {
          return {
            ...row,
            assigned_machine_id: "",
            assigned_machine_ids: [],
            machine_efficiency_multiplier: 1.0,
            manpower_count: 1,
            eligible_operators: [],
          };
        }
        const nextIds = row.assigned_machine_ids.includes(machineId)
          ? row.assigned_machine_ids
          : [...row.assigned_machine_ids, machineId];
        const nextSpeedFactor =
          nextIds.length > 1
            ? row.machine_efficiency_multiplier > 1.0
              ? row.machine_efficiency_multiplier
              : 1.5
            : 1.0;
        const ops = nextIds
          .map((id) => activeMachines.find((m: any) => m.id === id)?.assigned_operator)
          .filter(Boolean) as string[];
        return {
          ...row,
          assigned_machine_id: nextIds[0] || "",
          assigned_machine_ids: nextIds,
          machine_efficiency_multiplier: nextSpeedFactor,
          manpower_count: Math.max(1, nextIds.length),
          eligible_operators: ops,
        };
      })
    );
  };

  const handleRemoveMachineFromProcess = (stepId: string, machineId: string) => {
    setProcessConfigs((prev) =>
      prev.map((row) => {
        if (row.id !== stepId) return row;
        const nextIds = row.assigned_machine_ids.filter((id) => id !== machineId);
        const nextSpeedFactor =
          nextIds.length > 1
            ? row.machine_efficiency_multiplier > 1.0
              ? row.machine_efficiency_multiplier
              : 1.5
            : 1.0;
        const ops = nextIds
          .map((id) => activeMachines.find((m: any) => m.id === id)?.assigned_operator)
          .filter(Boolean) as string[];
        return {
          ...row,
          assigned_machine_id: nextIds[0] || "",
          assigned_machine_ids: nextIds,
          machine_efficiency_multiplier: nextSpeedFactor,
          manpower_count: Math.max(1, nextIds.length),
          eligible_operators: ops,
        };
      })
    );
  };

  const handleUpdateConfig = (
    stepId: string,
    field: keyof ProcessConfigRow,
    value: any
  ) => {
    setProcessConfigs((prev) =>
      prev.map((row) => {
        if (row.id !== stepId) return row;
        return { ...row, [field]: value };
      })
    );
  };

  const handleUpdateQcParamCycleTime = (
    stepId: string,
    paramId: string,
    cycleTimeMins: number
  ) => {
    const safeVal = Math.max(0.5, Number(cycleTimeMins) || 0.5);
    setProcessConfigs((prev) =>
      prev.map((row) => {
        if (row.id !== stepId) return row;
        const currentParams = Array.isArray(row.qc_parameters) ? row.qc_parameters : [];
        const nextParams = currentParams.map((qp) =>
          qp.id === paramId ? { ...qp, cycle_time_minutes: safeVal } : qp
        );
        const nextTotalCt = calculateQcGateCycleTime(nextParams, row.cycle_time_minutes);
        return {
          ...row,
          qc_parameters: nextParams,
          cycle_time_minutes: nextTotalCt,
        };
      })
    );
  };

  // Group BOP processes into Station Clusters
  const stationClusters = useMemo(() => {
    const map = new Map<
      string,
      {
        station_id: string;
        station_code: string;
        station_name: string;
        cluster_sequence: number;
        processes: ProcessConfigRow[];
      }
    >();
    let seq = 1;
    processConfigs.forEach((cfg) => {
      const stId = cfg.station_id || "STN-01";
      const stObj = stations.find((s: any) => s.id === stId);
      if (!map.has(stId)) {
        map.set(stId, {
          station_id: stId,
          station_code: stObj?.station_code || stId,
          station_name: stObj?.station_name || `Workstation ${seq}`,
          cluster_sequence: seq++,
          processes: [],
        });
      }
      map.get(stId)!.processes.push(cfg);
    });
    return Array.from(map.values());
  }, [processConfigs, stations]);

  // Sequential Compounding Speed Factor & Per-WOT CPM Calculation
  const scheduleInsight = useMemo(() => {
    const targetQty = Math.max(1, Number(project?.qty) || 100);
    const effectiveLotSize = Math.max(1, Number(lotSize) || 10);
    const totalLots = Math.max(1, Math.ceil(targetQty / effectiveLotSize));
    const ffRatio = Math.max(0.2, (Number(factoryFactor) || 85) / 100);
    const dailyShiftHrs = Math.max(1, Number(shiftHours) || 8);

    const recommendedLotSize = Math.max(
      1,
      Math.min(targetQty, Math.round(targetQty / Math.max(4, Math.min(10, stationClusters.length * 2))))
    );

    const stepCompoundDivisor: Record<string, number> = {};
    const stepMachineCtMins: Record<string, number> = {};
    const stepEffectiveCtMins: Record<string, number> = {};
    const stepWotHours: Record<string, number> = {};
    const stepTotalHours: Record<string, number> = {};
    const stepTransferModeMap: Record<string, "ROOT" | "INTRA_STATION" | "INTER_STATION"> = {};
    let totalSequentialWotHours = 0;
    let intraStationTransitionsCount = 0;
    let interStationTransitionsCount = 0;
    let mergeGatesCount = 0;

    processConfigs.forEach((cfg, idx) => {
      const preds = cfg.predecessor_ids || [];
      const predRows = preds
        .map((pid) => processConfigs.find((p) => p.id === pid))
        .filter(Boolean) as ProcessConfigRow[];
      const effectivePreds =
        predRows.length > 0
          ? predRows
          : idx > 0
          ? [processConfigs[idx - 1]]
          : [];

      if (effectivePreds.length > 1) {
        mergeGatesCount += 1;
      }

      let resolvedTransferMode: "ROOT" | "INTRA_STATION" | "INTER_STATION" = "ROOT";
      if (effectivePreds.length > 0) {
        const autoIntra = effectivePreds.every((p) => p.station_id === cfg.station_id);
        const hasQcGateLock =
          Boolean(cfg.is_qc_gate) || effectivePreds.some((p) => Boolean(p.is_qc_gate));
        if (hasQcGateLock) {
          resolvedTransferMode = "INTER_STATION";
        } else if (cfg.transfer_mode === "INTRA_STATION" || cfg.transfer_mode === "INTER_STATION") {
          resolvedTransferMode = cfg.transfer_mode;
        } else {
          resolvedTransferMode = autoIntra ? "INTRA_STATION" : "INTER_STATION";
        }
        if (resolvedTransferMode === "INTRA_STATION") {
          intraStationTransitionsCount += 1;
        } else {
          interStationTransitionsCount += 1;
        }
      }
      stepTransferModeMap[cfg.id] = resolvedTransferMode;

      const baseCt = Math.max(0.5, Number(cfg.cycle_time_minutes) || 15);
      const machineCount = cfg.assigned_machine_ids.length;
      const speedFactor =
        machineCount > 1 ? Math.max(1.0, Number(cfg.machine_efficiency_multiplier) || 1.5) : 1.0;
      // Sequential compounding division: Base CT / S^(M - 1)
      const compoundDivisor = machineCount > 1 ? Math.pow(speedFactor, machineCount - 1) : 1.0;
      const machineCt = baseCt / compoundDivisor;
      // 3-Phase Orchestration Engine efficiency factor:
      // Intra-Station 1-Piece Flow + Operator Work-Stealing eliminates inter-step queue starved time (~8% CT reduction),
      // while Priority Merge Gates synchronize branch arrivals.
      const orchEfficiencyBoost =
        orchestrationEngineMode === "AUTO_3_PHASE" && resolvedTransferMode === "INTRA_STATION"
          ? 1.08
          : 1.0;
      const effectiveCt = machineCt / (ffRatio * orchEfficiencyBoost);

      // Inter-station WOT handover buffer (in hours per WOT) when crossing station boundaries (Rule 11.2)
      const stepHandoverBufferHrs =
        resolvedTransferMode === "INTER_STATION"
          ? Math.max(0, Number(interStationBufferMins) || 0) / 60
          : 0;

      const wotHrs = (effectiveCt * effectiveLotSize) / 60 + stepHandoverBufferHrs;
      const totalOrderHrs = (effectiveCt * targetQty) / 60 + stepHandoverBufferHrs * totalLots;

      stepCompoundDivisor[cfg.id] = Number(compoundDivisor.toFixed(2));
      stepMachineCtMins[cfg.id] = Number(machineCt.toFixed(2));
      stepEffectiveCtMins[cfg.id] = Number(effectiveCt.toFixed(2));
      stepWotHours[cfg.id] = Number(wotHrs.toFixed(2));
      stepTotalHours[cfg.id] = Number(totalOrderHrs.toFixed(2));
      totalSequentialWotHours += wotHrs;
    });

    // Forward & Backward Pass CPM for 1 WOT Sub-Lot (incorporating 1-Piece Intra-Station Overlap)
    const esWotHrs: Record<string, number> = {};
    const efWotHrs: Record<string, number> = {};
    let intraStationOverlapPerWotHrs = 0;

    processConfigs.forEach((cfg, idx) => {
      const preds = cfg.predecessor_ids || [];
      const effectivePredIds =
        preds.length > 0 ? preds : idx > 0 ? [processConfigs[idx - 1].id] : [];
      const maxPredEf =
        effectivePredIds.length > 0
          ? Math.max(...effectivePredIds.map((pid) => efWotHrs[pid] || 0))
          : 0;

      // Under Rule 11.1 (Intra-Station 1-Piece Continuous Flow) with 3-Phase Orchestration,
      // downstream step inside the same station unlocks as soon as 1 unit is finished on predecessor,
      // overlapping up to 35% of predecessor WOT duration inside the station cluster.
      let overlapDiscountHrs = 0;
      if (
        orchestrationEngineMode === "AUTO_3_PHASE" &&
        stepTransferModeMap[cfg.id] === "INTRA_STATION" &&
        effectivePredIds.length > 0 &&
        effectiveLotSize > 1
      ) {
        const predDur = Math.max(...effectivePredIds.map((pid) => stepWotHours[pid] || 0));
        overlapDiscountHrs = Math.min(maxPredEf, predDur * 0.35);
        intraStationOverlapPerWotHrs += overlapDiscountHrs;
      }

      const effectiveStart = Math.max(0, maxPredEf - overlapDiscountHrs);
      esWotHrs[cfg.id] = Number(effectiveStart.toFixed(2));
      efWotHrs[cfg.id] = Number((effectiveStart + (stepWotHours[cfg.id] || 0)).toFixed(2));
    });

    const singleWotCriticalHours =
      Object.values(efWotHrs).length > 0
        ? Math.max(...Object.values(efWotHrs))
        : totalSequentialWotHours;

    const lfWotHrs: Record<string, number> = {};
    const lsWotHrs: Record<string, number> = {};
    const floatWotHrs: Record<string, number> = {};
    const isCriticalMap: Record<string, boolean> = {};

    [...processConfigs].reverse().forEach((cfg) => {
      const successors = processConfigs.filter((s) =>
        (s.predecessor_ids || []).includes(cfg.id)
      );
      const minSuccLs =
        successors.length > 0
          ? Math.min(...successors.map((s) => lsWotHrs[s.id] ?? singleWotCriticalHours))
          : singleWotCriticalHours;
      lfWotHrs[cfg.id] = Number(minSuccLs.toFixed(2));
      lsWotHrs[cfg.id] = Number(Math.max(0, minSuccLs - (stepWotHours[cfg.id] || 0)).toFixed(2));
      const flt = Math.max(0, Number((lsWotHrs[cfg.id] - esWotHrs[cfg.id]).toFixed(2)));
      floatWotHrs[cfg.id] = flt;
      isCriticalMap[cfg.id] = flt <= 0.05;
    });

    const stationWotLoads: Array<{ station_id: string; station_name: string; wot_hours: number }> =
      stationClusters.map((cl) => {
        const hrs = cl.processes.reduce((sum, p) => sum + (stepWotHours[p.id] || 0), 0);
        return {
          station_id: cl.station_id,
          station_name: `${cl.station_code} — ${cl.station_name}`,
          wot_hours: Number(hrs.toFixed(2)),
        };
      });

    const bottleneckStation =
      [...stationWotLoads].sort((a, b) => b.wot_hours - a.wot_hours)[0] || null;
    const bottleneckWotHours = bottleneckStation
      ? bottleneckStation.wot_hours
      : singleWotCriticalHours;

    const unpipelinedBatchHours = Number((totalSequentialWotHours * totalLots).toFixed(1));
    const baseNetHours =
      orchestrationEngineMode === "AUTO_3_PHASE" && stationClusters.length > 1 && totalLots > 1
        ? singleWotCriticalHours + (totalLots - 1) * bottleneckWotHours
        : singleWotCriticalHours * totalLots;

    const intraStationOverlapSavedHours = Number(
      (intraStationOverlapPerWotHrs * totalLots).toFixed(1)
    );
    const interStationTransferOverheadHours = Number(
      (interStationTransitionsCount * (Math.max(0, Number(interStationBufferMins) || 0) / 60) * totalLots).toFixed(1)
    );

    const pipeliningHoursSaved = Math.max(0, Number((unpipelinedBatchHours - baseNetHours).toFixed(1)));
    const baseDays = Math.max(1, Math.ceil(baseNetHours / dailyShiftHrs));

    // Evaluate step-level & macro contention with concurrent ongoing projects (Orchestra + Load Duet)
    const plannedStartMs = new Date(startDate || new Date().toISOString().slice(0, 10)).getTime();
    const preliminaryEndMs = plannedStartMs + baseDays * 86400000;

    const selectedMachineIds = Array.from(
      new Set(processConfigs.flatMap((c) => c.assigned_machine_ids).filter(Boolean))
    );
    const selectedStationIds = processConfigs
      .map((c) => c.station_id)
      .filter(Boolean);

    const stepContentionMinsMap: Record<string, number> = {};
    processConfigs.forEach((c) => {
      stepContentionMinsMap[c.id] = 0;
    });

    let contentionHours = 0;
    const conflictingProjects: Array<{
      id: string;
      name: string;
      spk_number: string;
      overlap_days: number;
      shared_machines: string[];
      shared_stations: string[];
      affected_steps_count: number;
      wot_queue_mins: number;
      queued_hours: number;
    }> = [];

    concurrentProjects.forEach((otherProj) => {
      const otherStartMs = new Date(
        otherProj.start_date || new Date().toISOString().slice(0, 10)
      ).getTime();
      const otherEndMs = new Date(
        otherProj.estimated_end_date || otherProj.due_date || new Date().toISOString().slice(0, 10)
      ).getTime();

      const overlapStart = Math.max(plannedStartMs, otherStartMs);
      const overlapEnd = Math.min(preliminaryEndMs, otherEndMs);
      const overlapDays = Math.max(0, Math.ceil((overlapEnd - overlapStart) / 86400000));

      if (overlapDays > 0) {
        const otherMachines: string[] = Array.isArray(otherProj.assigned_machines)
          ? otherProj.assigned_machines
          : [];
        const otherStations: string[] = Array.isArray(otherProj.assigned_stations)
          ? otherProj.assigned_stations
          : [];
        const hasRunningSteps =
          Array.isArray(otherProj.running_steps) && otherProj.running_steps.length > 0;

        const sharedMachines = selectedMachineIds.filter((m) => otherMachines.includes(m));
        const sharedStations = selectedStationIds.filter((s) => otherStations.includes(s));

        if (sharedMachines.length > 0 || sharedStations.length > 0) {
          let projAffectedSteps = 0;
          let projWotQueueMins = 0;

          processConfigs.forEach((cfg) => {
            const stObj = stations.find(
              (st: any) => st.id === cfg.station_id || st.station_code === cfg.station_id
            );
            const stepSharedMachines = (cfg.assigned_machine_ids || []).filter((m) =>
              otherMachines.includes(m)
            );
            const stepSharesStation =
              otherStations.includes(cfg.station_id) ||
              (stObj &&
                (otherStations.includes(stObj.station_code) ||
                  otherStations.includes(stObj.station_name)));

            if (stepSharedMachines.length > 0 || stepSharesStation) {
              projAffectedSteps += 1;
              const machineQueueMins =
                stepSharedMachines.length * (hasRunningSteps ? 25 : 18);
              const stationQueueMins = stepSharesStation ? (hasRunningSteps ? 15 : 10) : 0;
              const stepQueueMins = machineQueueMins + stationQueueMins;
              stepContentionMinsMap[cfg.id] =
                (stepContentionMinsMap[cfg.id] || 0) + stepQueueMins;
              projWotQueueMins += stepQueueMins;
            }
          });

          // Macro pipeline contention across overlapping days and WOT sub-lots
          const stepDrivenContentionHrs = (projWotQueueMins / 60) * Math.max(1, Math.min(totalLots, overlapDays * 2));
          const baselineContentionHrs =
            sharedMachines.length * overlapDays * 1.5 +
            sharedStations.length * overlapDays * 0.75;
          const addedQueueHrs = Number(
            Math.max(stepDrivenContentionHrs, baselineContentionHrs).toFixed(1)
          );

          contentionHours += addedQueueHrs;
          conflictingProjects.push({
            id: otherProj.id,
            name: otherProj.name,
            spk_number: otherProj.spk_number,
            overlap_days: overlapDays,
            shared_machines: sharedMachines,
            shared_stations: sharedStations,
            affected_steps_count: Math.max(1, projAffectedSteps),
            wot_queue_mins: Math.max(10, projWotQueueMins),
            queued_hours: addedQueueHrs,
          });
        }
      }
    });

    const totalStepWotContentionHrs = Object.values(stepContentionMinsMap).reduce(
      (sum, m) => sum + m / 60,
      0
    );
    const effectiveSingleWotCriticalHours = Number(
      (singleWotCriticalHours + totalStepWotContentionHrs).toFixed(2)
    );

    const totalEstimatedHours = Number((baseNetHours + contentionHours).toFixed(1));
    const totalEstimatedDays = Math.max(1, Math.ceil(totalEstimatedHours / dailyShiftHrs));

    const finishDateObj = new Date(plannedStartMs);
    finishDateObj.setDate(finishDateObj.getDate() + totalEstimatedDays);
    const estimatedFinishDate = finishDateObj.toISOString().slice(0, 10);

    const rawDeadline =
      project?.ntp_deadline ||
      spkData?.due_date ||
      spkData?.target_completion_date ||
      (project?.due_date && String(project.due_date) !== "2099-12-31" ? project.due_date : null) ||
      project?.end_date ||
      project?.deadline;

    let ntpDeadlineDate = "";
    if (rawDeadline && String(rawDeadline) !== "2099-12-31") {
      ntpDeadlineDate = String(rawDeadline).slice(0, 10);
    } else {
      const fixedAnchorStr =
        spkData?.created_at ||
        project?.created_at ||
        "2026-03-01";
      const fixedAnchorDate = new Date(String(fixedAnchorStr).slice(0, 10));
      const baseAnchorMs = isNaN(fixedAnchorDate.getTime())
        ? new Date("2026-03-01").getTime()
        : fixedAnchorDate.getTime();
      const fixedDeadlineObj = new Date(baseAnchorMs + 21 * 86400000);
      ntpDeadlineDate = fixedDeadlineObj.toISOString().slice(0, 10);
    }

    const deadlineMs = new Date(`${ntpDeadlineDate}T00:00:00`).getTime();
    const finishMs = new Date(`${estimatedFinishDate}T00:00:00`).getTime();
    const varianceDays = Math.round((deadlineMs - finishMs) / 86400000);
    const isDelayed = varianceDays < 0;

    // IPQC / QC Workload & Bottleneck Calculation
    const qcGateSteps = processConfigs.filter(
      (c) => Boolean(c.is_qc_gate) || (Array.isArray(c.qc_parameters) && c.qc_parameters.length > 0)
    );
    const ipqcGatesCount = qcGateSteps.length;
    const totalIpqcParamsCount = qcGateSteps.reduce(
      (sum, c) => sum + (Array.isArray(c.qc_parameters) ? c.qc_parameters.length : 0),
      0
    );
    const singleWotIpqcHours = Number(
      qcGateSteps.reduce((sum, c) => sum + (stepWotHours[c.id] || 0), 0).toFixed(2)
    );
    const totalOrderIpqcHours = Number(
      qcGateSteps.reduce((sum, c) => sum + (stepTotalHours[c.id] || 0), 0).toFixed(1)
    );
    const ipqcCriticalSharePct =
      effectiveSingleWotCriticalHours > 0
        ? Math.min(
            100,
            Math.round((singleWotIpqcHours / effectiveSingleWotCriticalHours) * 100)
          )
        : 0;
    const bottleneckIpqcStep =
      [...qcGateSteps].sort(
        (a, b) => (stepWotHours[b.id] || 0) - (stepWotHours[a.id] || 0)
      )[0] || null;
    const isIpqcBottleneckAlert =
      ipqcGatesCount > 0 && (ipqcCriticalSharePct >= 18 || singleWotIpqcHours >= 2.5);

    return {
      targetQty,
      totalLots,
      recommendedLotSize,
      singleWotCriticalHours: effectiveSingleWotCriticalHours,
      ipqcGatesCount,
      totalIpqcParamsCount,
      singleWotIpqcHours,
      totalOrderIpqcHours,
      ipqcCriticalSharePct,
      bottleneckIpqcStep: bottleneckIpqcStep
        ? {
            id: bottleneckIpqcStep.id,
            name: bottleneckIpqcStep.process_name,
            wotHours: stepWotHours[bottleneckIpqcStep.id] || 0,
            cycleTimeMins: bottleneckIpqcStep.cycle_time_minutes,
          }
        : null,
      isIpqcBottleneckAlert,
      stationWotLoads,
      bottleneckStation,
      unpipelinedBatchHours,
      pipeliningHoursSaved,
      intraStationTransitionsCount,
      interStationTransitionsCount,
      mergeGatesCount,
      intraStationOverlapSavedHours,
      interStationTransferOverheadHours,
      stepTransferModeMap,
      baseNetHours: Number(baseNetHours.toFixed(1)),
      contentionHours: Number(contentionHours.toFixed(1)),
      totalEstimatedHours,
      totalEstimatedDays,
      estimatedFinishDate,
      ntpDeadlineDate,
      varianceDays,
      isDelayed,
      conflictingProjects,
      stepContentionMinsMap,
      stepCompoundDivisor,
      stepMachineCtMins,
      stepEffectiveCtMins,
      stepWotHours,
      stepDurations: stepTotalHours,
      esWotHrs,
      efWotHrs,
      lsWotHrs,
      lfWotHrs,
      floatWotHrs,
      isCriticalMap,
    };
  }, [
    project,
    spkData,
    startDate,
    lotSize,
    shiftHours,
    interStationBufferMins,
    orchestrationEngineMode,
    factoryFactor,
    processConfigs,
    stationClusters,
    concurrentProjects,
  ]);

  const handleCommitPlan = useCallback(async () => {
    if (project?.bop_status !== "AUTHORIZED") {
      showToast(
        "BOP route has not been authorized by Engineering. Technical authorization is required before committing to production.",
        "error"
      );
      return;
    }

    if (processConfigs.length === 0) {
      showToast(
        "No BOP route processes found. Declare process route nodes in Engineering BOP first.",
        "error"
      );
      return;
    }

    setIsCommitting(true);
    try {
      const res = await apiFetch(
        `/api/production/projects/${projectId}/commit-plan`,
        {
          method: "POST",
          body: JSON.stringify({
            start_date: startDate,
            lot_size: lotSize,
            factory_factor: factoryFactor,
            shift_hours: shiftHours,
            planned_completion_date: scheduleInsight.estimatedFinishDate,
            planned_total_hours: scheduleInsight.totalEstimatedHours,
            process_configs: processConfigs,
          }),
        },
        user?.username
      );

      if (res.ok && res.data?.ok) {
        try {
          localStorage.removeItem(`bop_draft_${projectId}`);
          localStorage.setItem(`bop_unsaved_${projectId}`, "false");
        } catch (e) {}
        const generated = Array.isArray(res.data.wots) ? res.data.wots : wots;
        setCommittedWots(generated);
        const syncedWaveCount = Number(res.data.procurement_wave_sync?.synced_waves || 0);
        showToast(
          syncedWaveCount > 0
            ? `Production plan committed (${generated.length} WOTs) & ${syncedWaveCount} PLANNED procurement wave(s) auto-synced.`
            : "Production plan committed. WOT sub-lots initialized on Shop Floor.",
          "success"
        );
        fetchScheduleAndWma();
        onRefresh(true);
      } else {
        showToast(res.error || res.data?.error || "Failed to commit production plan", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error committing production plan", "error");
    } finally {
      setIsCommitting(false);
    }
  }, [
    processConfigs,
    projectId,
    startDate,
    lotSize,
    factoryFactor,
    shiftHours,
    scheduleInsight.estimatedFinishDate,
    scheduleInsight.totalEstimatedHours,
    user?.username,
    wots,
    showToast,
    fetchScheduleAndWma,
    onRefresh,
  ]);

  const materialReadinessTelemetry = useMemo(() => {
    if (!procSyncStatus) return null;
    const wave1 = procSyncStatus.wave1 || null;
    const wave1Status = String(wave1?.status || "PLANNED").toUpperCase();
    const isWave1GrnReceived = Boolean(
      procSyncStatus.is_wave1_grn_received || wave1Status === "GRN_RECEIVED"
    );
    const effectiveArrivalDate: string | null = wave1?.target_arrival_date
      ? String(wave1.target_arrival_date).slice(0, 10)
      : procSyncStatus.pending_pr_items_count > 0 && procSyncStatus.earliest_feasible_arrival_date
        ? String(procSyncStatus.earliest_feasible_arrival_date).slice(0, 10)
        : null;

    if (!effectiveArrivalDate || !startDate) {
      return {
        effectiveArrivalDate,
        isArrivalLate: false,
        delayDays: 0,
        isHorizonDrifted: Boolean(procSyncStatus.is_horizon_drifted),
        isWave1GrnReceived,
        wave1Status,
      };
    }

    const startMs = new Date(`${startDate}T00:00:00`).getTime();
    const arrMs = new Date(`${effectiveArrivalDate}T00:00:00`).getTime();
    const delayDays = Math.round((arrMs - startMs) / 86400000);
    const isArrivalLate = !isWave1GrnReceived && delayDays > 0;
    const isHorizonDrifted = Boolean(
      procSyncStatus.has_active_plan &&
        wave1 &&
        wave1.status === "PLANNED" &&
        wave1.production_need_date !== startDate,
    );

    return {
      effectiveArrivalDate,
      isArrivalLate,
      delayDays: Math.max(0, delayDays),
      isHorizonDrifted,
      isWave1GrnReceived,
      wave1Status,
    };
  }, [procSyncStatus, startDate]);

  const handleSyncStartDateToWave1 = useCallback(() => {
    const targetDate = materialReadinessTelemetry?.effectiveArrivalDate;
    if (!targetDate) return;
    setStartDate(targetDate);
    showToast(
      `Production Start Date synchronized to Wave 1 GRN arrival (${targetDate}). Click Commit/Update Plan to persist.`,
      "success"
    );
  }, [materialReadinessTelemetry?.effectiveArrivalDate, showToast]);

  const handleReSyncWaveTimeline = useCallback(async () => {
    if (!procSyncStatus?.plan_id) return;
    setIsSyncingProcDates(true);
    try {
      const res = await apiFetch(
        `/api/purchasing/procurement-plans/${procSyncStatus.plan_id}/sync-master-dates`,
        { method: "POST" },
        user?.username
      );
      if (res.ok) {
        showToast(
          res.data?.message || "Procurement wave dates synchronized with Master Schedule",
          "success"
        );
        await fetchScheduleAndWma();
      } else {
        showToast(res.error || "Failed to sync procurement wave dates", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to sync procurement wave dates", "error");
    } finally {
      setIsSyncingProcDates(false);
    }
  }, [procSyncStatus?.plan_id, user?.username, showToast, fetchScheduleAndWma]);

  const activeWotsList = committedWots.length > 0 ? committedWots : wots;

  return (
    <div className="space-y-6">
      {/* SECTION 1: PROJECT & MASTER PARAMETER SETUP */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              01. Setup &amp; Master Parameters
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Assign active machines and process speed factors. Workstations are synced from BOP.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div
              className={cn(
                "h-9 px-3 rounded-xl border text-xs font-mono font-bold inline-flex items-center gap-1.5",
                project?.bop_status === "AUTHORIZED"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              )}
              title={
                project?.bop_authorized_by
                  ? `Authorized by ${project.bop_authorized_by}`
                  : "Requires Engineering BOP Authorization"
              }
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>
                BOP: {project?.bop_status === "AUTHORIZED" ? "AUTHORIZED" : "PENDING"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowBopEditorModal(true)}
              className="h-9 px-3.5 border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 rounded-xl font-semibold text-xs whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <GitFork className="w-3.5 h-3.5 text-stone-700" />
              <span>View BOP Route &amp; Stations</span>
            </button>
            {activeWotsList.length > 0 && (
              <span className="h-9 px-3 border border-stone-200 bg-stone-50 text-stone-700 rounded-xl font-mono font-bold text-xs inline-flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-stone-500" />
                <span>{activeWotsList.length} WOT Lots</span>
              </span>
            )}
          </div>
        </div>

        {/* Global Project Parameters Grid (3 Cards) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Parameter 1: Production Start Date */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
            <label className="text-xs font-semibold text-stone-700 flex items-center justify-between">
              <span>Start Date</span>
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-stone-900 focus:outline-stone-900"
            />
            <div className="text-[11px] text-stone-500 font-mono tabular-nums flex items-center justify-between">
              <span>
                NTP Deadline: <strong className="text-stone-900">{scheduleInsight.ntpDeadlineDate}</strong>
              </span>
              <Lock className="w-3 h-3 text-stone-400" />
            </div>
          </div>

          {/* Parameter 2: Smart WOT Sub-Lot Size */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
            <label className="text-xs font-semibold text-stone-700 flex items-center justify-between">
              <span>WOT Sub-Lot Size (Units / WOT)</span>
              <Boxes className="w-3.5 h-3.5 text-stone-400" />
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={Math.max(1, Number(project?.qty) || 1000)}
                value={lotSize}
                onChange={(e) => setLotSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-20 bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-stone-900 tabular-nums focus:outline-stone-900"
              />
              <input
                type="range"
                min={1}
                max={Math.max(1, Number(project?.qty) || 100)}
                value={Math.min(lotSize, Math.max(1, Number(project?.qty) || 100))}
                onChange={(e) => setLotSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="flex-1 accent-stone-900 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setLotSize(scheduleInsight.recommendedLotSize)}
                className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-mono font-bold shrink-0 cursor-pointer"
              >
                Opt: {scheduleInsight.recommendedLotSize}
              </button>
            </div>
            <div className="text-[11px] text-stone-500 font-mono tabular-nums flex items-center justify-between">
              <span>
                <strong className="text-stone-900">{scheduleInsight.totalLots} WOTs</strong> ({scheduleInsight.targetQty} {project?.uom || "PCS"})
              </span>
              {scheduleInsight.pipeliningHoursSaved > 0 && (
                <span className="text-emerald-700 font-bold">
                  -{scheduleInsight.pipeliningHoursSaved}h overlap
                </span>
              )}
            </div>
          </div>

          {/* Parameter 3: Shift Hours / Day */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
            <label className="text-xs font-semibold text-stone-700 flex items-center justify-between">
              <span>Daily Shift Hours</span>
              <Clock className="w-3.5 h-3.5 text-stone-400" />
            </label>
            <Select
              value={String(shiftHours)}
              onChange={(e) => setShiftHours(Number(e.target.value) || 8)}
              className="font-mono font-bold"
            >
              <option value={8}>8 Hours / Day (1 Shift)</option>
              <option value={10}>10 Hours / Day (+2h OT)</option>
              <option value={12}>12 Hours / Day (+4h OT)</option>
              <option value={16}>16 Hours / Day (2 Shifts)</option>
              <option value={24}>24 Hours / Day (3 Shifts)</option>
            </Select>
            <div className="text-[11px] text-stone-500 font-mono tabular-nums flex items-center justify-between">
              <span>
                Capacity: <strong className="text-stone-800">{shiftHours}h/day</strong>
              </span>
              {shiftHours < 12 && (
                <button
                  type="button"
                  onClick={() => setShiftHours((prev) => Math.min(24, prev + 2))}
                  className="text-[10px] font-bold text-stone-800 hover:underline cursor-pointer"
                >
                  +2h Overtime
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Concise Material Wave Readiness Strip */}
        {procSyncStatus && (
          <div
            className={cn(
              "px-4 py-3 rounded-xl border transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3",
              materialReadinessTelemetry?.isArrivalLate
                ? "bg-amber-50/70 border-amber-300"
                : procSyncStatus.has_active_plan
                  ? "bg-emerald-50/40 border-emerald-200"
                  : "bg-stone-50 border-stone-200"
            )}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs min-w-0">
              <span className="font-bold text-stone-900">
                Material Readiness
              </span>
              <span aria-hidden="true" className="text-stone-300">|</span>
              {procSyncStatus.has_active_plan ? (
                <span className="font-mono font-semibold text-stone-900">
                  {procSyncStatus.plan_code} ({procSyncStatus.total_waves} Waves)
                </span>
              ) : procSyncStatus.pending_pr_items_count > 0 ? (
                <span className="font-mono font-semibold text-amber-800">
                  {procSyncStatus.pending_pr_items_count} PR items pending wave plan
                </span>
              ) : (
                <span className="font-mono text-stone-500">
                  All BOM/PR materials fulfilled
                </span>
              )}

              {procSyncStatus.wave1 && (
                <>
                  <span aria-hidden="true" className="text-stone-300">|</span>
                  <span className="font-mono tabular-nums text-stone-600">
                    Wave 1 GRN:{" "}
                    <strong
                      className={
                        materialReadinessTelemetry?.isArrivalLate
                          ? "text-amber-900"
                          : "text-emerald-800"
                      }
                    >
                      {procSyncStatus.wave1.target_arrival_date}
                    </strong>
                  </span>
                </>
              )}

              {materialReadinessTelemetry?.isWave1GrnReceived ? (
                <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Wave 1 Received
                </span>
              ) : materialReadinessTelemetry?.isArrivalLate ? (
                <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  +{materialReadinessTelemetry.delayDays}d After Start Date
                </span>
              ) : procSyncStatus.has_active_plan ? (
                <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  On Schedule
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {materialReadinessTelemetry?.isArrivalLate &&
                materialReadinessTelemetry.effectiveArrivalDate && (
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={handleSyncStartDateToWave1}
                    className="h-8 px-3 bg-amber-600 hover:bg-amber-700 text-white border-amber-700 font-bold text-xs whitespace-nowrap shrink-0"
                  >
                    <Calendar className="w-3.5 h-3.5 mr-1.5" />
                    Sync Start Date ({materialReadinessTelemetry.effectiveArrivalDate})
                  </Button>
                )}

              {procSyncStatus.has_active_plan &&
                materialReadinessTelemetry?.isHorizonDrifted && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    isLoading={isSyncingProcDates}
                    onClick={handleReSyncWaveTimeline}
                    className="h-8 px-3 border-stone-300 bg-white hover:bg-stone-50 text-stone-800 font-semibold text-xs whitespace-nowrap shrink-0"
                    title="Re-anchor Procurement Plan wave dates to match current Setup & Master Start/End dates"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Re-Sync Wave Dates
                  </Button>
                )}
            </div>
          </div>
        )}

        {/* IPQC Workload & Bottleneck Alert Strip */}
        {scheduleInsight.ipqcGatesCount > 0 && (
          <div
            className={cn(
              "px-4 py-3 rounded-xl border transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3",
              scheduleInsight.isIpqcBottleneckAlert
                ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"
                : "bg-indigo-50/50 dark:bg-indigo-950/25 border-indigo-200 dark:border-indigo-800"
            )}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs min-w-0">
              <span className="inline-flex items-center gap-1.5 font-bold text-indigo-950 dark:text-indigo-200">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                IPQC Inspection Load &amp; Hold Gate
              </span>
              <span aria-hidden="true" className="text-stone-300 dark:text-stone-700">|</span>
              <span className="font-mono text-stone-700 dark:text-stone-300">
                <strong>{scheduleInsight.ipqcGatesCount}</strong> Gate(s) ·{" "}
                <strong>{scheduleInsight.totalIpqcParamsCount}</strong> Parameter(s)
              </span>
              <span aria-hidden="true" className="text-stone-300 dark:text-stone-700">|</span>
              <span className="font-mono tabular-nums text-stone-700 dark:text-stone-300">
                Per WOT: <strong className="text-indigo-900 dark:text-indigo-300">{scheduleInsight.singleWotIpqcHours}h</strong>{" "}
                ({scheduleInsight.ipqcCriticalSharePct}% of CPM)
              </span>
              <span aria-hidden="true" className="text-stone-300 dark:text-stone-700">|</span>
              <span className="font-mono tabular-nums text-stone-700 dark:text-stone-300">
                Order QC Total: <strong>{scheduleInsight.totalOrderIpqcHours}h</strong>
              </span>
              {scheduleInsight.bottleneckIpqcStep && (
                <>
                  <span aria-hidden="true" className="text-stone-300 dark:text-stone-700">|</span>
                  <span className="font-mono text-stone-600 dark:text-stone-400">
                    Peak Gate:{" "}
                    <strong className="text-stone-900 dark:text-stone-100">
                      {scheduleInsight.bottleneckIpqcStep.name} ({scheduleInsight.bottleneckIpqcStep.cycleTimeMins}m/pc)
                    </strong>
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {scheduleInsight.isIpqcBottleneckAlert ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[11px] font-mono font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  QC Bottleneck Alert ({scheduleInsight.ipqcCriticalSharePct}% CPM)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-mono font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  Balanced QC Load
                </span>
              )}
            </div>
          </div>
        )}

        {/* Per-Process Route Parameter Table — Zero Horizontal Scroll */}
        <ProcessRouteConfigTable
          projectId={projectId}
          processConfigs={processConfigs}
          stationClusters={stationClusters}
          stations={stations}
          activeMachines={activeMachines}
          scheduleInsight={scheduleInsight}
          interStationBufferMins={interStationBufferMins}
          setShowBopEditorModal={setShowBopEditorModal}
          handleUpdateConfig={handleUpdateConfig}
          handleUpdateQcParamCycleTime={handleUpdateQcParamCycleTime}
          handleAddMachineToProcess={handleAddMachineToProcess}
          handleRemoveMachineFromProcess={handleRemoveMachineFromProcess}
        />
      </div>

      {/* SECTION 2: CROSS-PROJECT SCHEDULE & RESOURCE CONTENTION MATRIX */}
      <ConcurrentScheduleMatrix
        concurrentProjects={concurrentProjects}
        conflictingProjects={scheduleInsight.conflictingProjects}
        startDate={startDate}
        isLoadingSchedule={isLoadingSchedule}
        onRefreshSchedule={fetchScheduleAndWma}
      />

      {/* SECTION 3: PIPELINED WOT SCHEDULE SUMMARY & COMMIT PLAN */}
      <div
        className={cn(
          "rounded-2xl border p-6 transition-all space-y-4",
          scheduleInsight.isDelayed
            ? "bg-rose-50/50 border-rose-300"
            : "bg-white border-stone-900"
        )}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500 flex-wrap">
              <Activity className="w-4 h-4 text-stone-800" />
              <span>Schedule Feasibility</span>
              <span>·</span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  scheduleInsight.isDelayed ? "text-rose-700" : "text-emerald-700"
                )}
              >
                {scheduleInsight.isDelayed
                  ? `DELAYED (${Math.abs(scheduleInsight.varianceDays)} DAYS LATE)`
                  : `ON TRACK (+${scheduleInsight.varianceDays} DAYS BUFFER)`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
              <div>
                <span className="text-[11px] text-stone-500 block">Single-WOT Critical Path</span>
                <span className="text-base font-bold font-mono tabular-nums text-stone-900">
                  {scheduleInsight.singleWotCriticalHours}h / WOT
                </span>
                <span className="text-[11px] text-stone-500 block font-mono tabular-nums">
                  {scheduleInsight.totalLots} WOTs × {lotSize} {project?.uom || "UNIT"}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-stone-500 block">
                  Estimated Completion
                </span>
                <span
                  className={cn(
                    "text-base font-bold font-mono tabular-nums",
                    scheduleInsight.isDelayed ? "text-rose-700" : "text-emerald-700"
                  )}
                >
                  {scheduleInsight.estimatedFinishDate}
                </span>
                <span className="text-[11px] text-stone-500 block font-mono tabular-nums">
                  {scheduleInsight.totalEstimatedDays} days ({scheduleInsight.totalEstimatedHours}h)
                </span>
              </div>

              <div>
                <span className="text-[11px] text-stone-500 block">NTP Deadline</span>
                <span className="text-base font-bold font-mono tabular-nums text-stone-900">
                  {scheduleInsight.ntpDeadlineDate}
                </span>
                <span className="text-[11px] text-stone-500 block font-mono tabular-nums">
                  Overlap Saved: -{scheduleInsight.pipeliningHoursSaved}h
                </span>
              </div>

              <div>
                <span className="text-[11px] text-stone-500 block">
                  Schedule Variance
                </span>
                <span
                  className={cn(
                    "text-base font-bold font-mono tabular-nums",
                    scheduleInsight.isDelayed ? "text-rose-700" : "text-emerald-700"
                  )}
                >
                  {scheduleInsight.isDelayed
                    ? `${scheduleInsight.varianceDays} Days`
                    : `+${scheduleInsight.varianceDays} Days`}
                </span>
                <span className="text-[11px] text-stone-500 block font-mono tabular-nums">
                  FF: {factoryFactor}% · Shift: {shiftHours}h/d
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
            <Button
              onClick={handleCommitPlan}
              lockKey={`commit-plan-${projectId}`}
              disabled={isCommitting || processConfigs.length === 0 || project?.bop_status !== "AUTHORIZED"}
              title={project?.bop_status !== "AUTHORIZED" ? "BOP requires Engineering authorization" : ""}
              className="h-11 px-6 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold text-xs whitespace-nowrap shrink-0 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isCommitting
                  ? "Committing Plan..."
                  : project?.bop_status !== "AUTHORIZED"
                  ? "Awaiting BOP Authorization"
                  : project?.is_master_set
                  ? "Update Plan & Sync WOT"
                  : "Commit Plan & Initialize WOT"}
              </span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPreviewPlanModal(true)}
              disabled={processConfigs.length === 0}
              className="h-10 px-5 border-stone-300 bg-white hover:bg-stone-50 text-stone-900 rounded-xl font-bold text-xs whitespace-nowrap shrink-0 flex items-center justify-center gap-2 shadow-2xs"
            >
              <Activity className="w-3.5 h-3.5 text-stone-700" />
              <span>Preview Plan</span>
            </Button>
          </div>
        </div>

        {scheduleInsight.isDelayed && (
          <div className="p-3.5 rounded-xl bg-white border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-rose-950">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                Schedule exceeds NTP deadline by{" "}
                <strong className="font-mono">{Math.abs(scheduleInsight.varianceDays)} day(s)</strong>.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {lotSize > scheduleInsight.recommendedLotSize && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setLotSize(scheduleInsight.recommendedLotSize)}
                  className="h-8 px-3 border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-900 text-xs font-bold"
                >
                  <Sliders className="w-3.5 h-3.5 mr-1.5" />
                  Set Lot Size to {scheduleInsight.recommendedLotSize}
                </Button>
              )}
              {shiftHours < 16 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setShiftHours((prev) => Math.min(24, prev + 4))}
                  className="h-8 px-3 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold"
                >
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                  +4h Overtime ({Math.min(24, shiftHours + 4)}h/day)
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODALS: BOP VIEWER & READ-ONLY PLAN PREVIEW */}
      <SetupPlanModals
        projectId={projectId}
        project={project}
        user={user}
        startDate={startDate}
        lotSize={lotSize}
        shiftHours={shiftHours}
        factoryFactor={factoryFactor}
        interStationBufferMins={interStationBufferMins}
        processConfigs={processConfigs}
        stationClusters={stationClusters}
        stations={stations}
        activeMachines={activeMachines}
        scheduleInsight={scheduleInsight}
        showBopEditorModal={showBopEditorModal}
        setShowBopEditorModal={setShowBopEditorModal}
        showPreviewPlanModal={showPreviewPlanModal}
        setShowPreviewPlanModal={setShowPreviewPlanModal}
        onRefresh={onRefresh}
      />
    </div>
  );
};

