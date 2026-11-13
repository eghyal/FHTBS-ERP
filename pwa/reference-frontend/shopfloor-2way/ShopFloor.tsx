import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wrench,
  Package,
  Zap,
  ArrowRight,
  Layers,
  Activity,
  Check,
  Sliders,
  ShieldCheck,
  Cpu,
  FastForward,
  Boxes,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { ShopFloorCommunicateSection } from "@/components/erp/production/shopfloor/CommunicateSection";
import { ShopFloorViewSection } from "@/components/erp/production/shopfloor/ViewSection";
import { ShopFloorControlSection } from "@/components/erp/production/shopfloor/ControlSection";
import { ShopFloorScmModals } from "@/components/erp/production/shopfloor/ScmModals";
import { cn } from "@/lib/utils";
import type {
  ProductionShopFloorProps,
  ScmReadinessState,
} from "./shopFloorTypes";

export const ProductionShopFloor: React.FC<ProductionShopFloorProps> = ({
  projectId,
  project,
  spkData,
  bom,
  processSteps,
  stations,
  itemsCatalog,
  wots,
  activeNdps,
  factoryFactor,
  onRefresh,
  onNavigateToSetup,
  user,
}) => {
  const { showToast } = useToast();

  // Clean tabbed workspace showing one focused section at a time
  const [activeSection, setActiveSection] = useState<"VIEW" | "CONTROL" | "COMMUNICATE">("VIEW");

  // Autonomous Orchestra Engine (Always-On) tracking ref
  const autoTriggeredSetRef = useRef<Set<string>>(new Set());

  // Live clock for real-time ETA countdowns
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Ongoing Concurrent Projects Load (Duet with Orchestra Engine)
  const [concurrentProjects, setConcurrentProjects] = useState<any[]>([]);
  const fetchConcurrentLoad = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiFetch(
        `/api/production/cross-project-schedule?exclude_project_id=${projectId}`,
        {},
        user?.username
      );
      if (res.ok && res.data?.ok) {
        setConcurrentProjects(
          Array.isArray(res.data.concurrent_projects) ? res.data.concurrent_projects : []
        );
      }
    } catch (e) {}
  }, [projectId, user?.username]);

  useEffect(() => {
    fetchConcurrentLoad();
  }, [fetchConcurrentLoad, processSteps.length]);

  // ============================================================================
  // 1. DIRECT WOT ORCHESTRA TRANSITION & SCM MATERIAL SUPPLY HARD INTERLOCK
  // ============================================================================
  const [selectedWotForGenealogy, setSelectedWotForGenealogy] = useState<any | null>(null);
  const [isTransitioningWot, setIsTransitioningWot] = useState<boolean>(false);
  const [isIssuingScmMaterial, setIsIssuingScmMaterial] = useState<boolean>(false);
  const [showScmStudioModal, setShowScmStudioModal] = useState<boolean>(false);
  const [subTargetBomItem, setSubTargetBomItem] = useState<any | null>(null);
  const [subSelectedItemId, setSubSelectedItemId] = useState<string>("");
  const [subQtyInput, setSubQtyInput] = useState<number>(1);
  const [subNotesInput, setSubNotesInput] = useState<string>("");
  const [isSubmittingConcession, setIsSubmittingConcession] = useState<boolean>(false);

  const [scmReadiness, setScmReadiness] = useState<ScmReadinessState | null>(null);

  const fetchScmReadiness = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiFetch(
        `/api/production/projects/${projectId}/material-readiness`,
        {},
        user?.username
      );
      if (res.ok && res.data?.ok) {
        setScmReadiness(res.data);
      }
    } catch (e) {}
  }, [projectId, user?.username]);

  useEffect(() => {
    fetchScmReadiness();
  }, [fetchScmReadiness, bom.length, wots.length, processSteps]);

  const handleIssueMaterialToFloor = useCallback(
    async (issueMode: "FULL" | "FULL_WAVE" | "PARTIAL_WAVE" = "PARTIAL_WAVE", targetBomId?: string) => {
      if (!projectId) return;
      setIsIssuingScmMaterial(true);
      try {
        const res = await apiFetch(
          `/api/production/projects/${projectId}/scm-issue-to-floor`,
          {
            method: "POST",
            body: JSON.stringify({
              issue_mode: issueMode,
              bom_id: targetBomId || undefined,
              issued_by: user?.name || user?.username || "Warehouse SCM",
              notes:
                issueMode === "PARTIAL_WAVE"
                  ? "Staggered Partial Wave Supply to Shop Floor WIP"
                  : "Official Full Warehouse Material Supply Issue to Shop Floor WIP",
            }),
          },
          user?.username
        );
        if (res.ok && res.data?.ok) {
          showToast(
            res.data.message || "Warehouse BOM materials issued & supplied to Shop Floor WIP!",
            "success"
          );
          setReservationGateError(null);
          setPendingGateTransition(null);
          await fetchScmReadiness();
          onRefresh(true);
        } else {
          showToast(
            res.error || res.data?.error || "Warehouse stock insufficient to issue to Shop Floor",
            "error"
          );
          await fetchScmReadiness();
        }
      } catch (err: any) {
        showToast(err.message || "Failed to issue material from Warehouse", "error");
      } finally {
        setIsIssuingScmMaterial(false);
      }
    },
    [projectId, user, showToast, fetchScmReadiness, onRefresh]
  );

  const handleAssignPointOfUse = useCallback(
    async (bomId: string, bopProcessId: string) => {
      if (!projectId) return;
      try {
        const res = await apiFetch(
          `/api/production/projects/${projectId}/scm-assign-pou`,
          {
            method: "POST",
            body: JSON.stringify({
              bom_id: bomId,
              bop_process_id: bopProcessId || null,
            }),
          },
          user?.username
        );
        if (res.ok && res.data?.ok) {
          showToast(res.data.message || "Point-of-Use (POU) process updated", "success");
          await fetchScmReadiness();
          onRefresh(true);
        } else {
          showToast(res.error || res.data?.error || "Failed to update Point-of-Use", "error");
        }
      } catch (err: any) {
        showToast(err.message || "Error updating Point-of-Use", "error");
      }
    },
    [projectId, user?.username, showToast, fetchScmReadiness, onRefresh]
  );

  const handleEngineeringConcession = useCallback(
    async (
      bomId: string,
      action:
        | "SUBSTITUTE_MATERIAL"
        | "DEFER_FITMENT"
        | "RESOLVE_DEFERRED_FITMENT"
        | "REVOKE_CONCESSION",
      extra?: {
        substitute_item_id?: string;
        substitute_qty?: number;
        concession_notes?: string;
      }
    ) => {
      if (!projectId) return;
      setIsSubmittingConcession(true);
      try {
        const res = await apiFetch(
          `/api/production/projects/${projectId}/scm-engineering-concession`,
          {
            method: "POST",
            body: JSON.stringify({
              bom_id: bomId,
              action,
              substitute_item_id: extra?.substitute_item_id,
              substitute_qty: extra?.substitute_qty,
              concession_notes: extra?.concession_notes,
              authorized_by: user?.name || user?.username || "Engineering Lead",
            }),
          },
          user?.username
        );
        if (res.ok && res.data?.ok) {
          showToast(res.data.message || "Engineering SCM concession applied", "success");
          setSubTargetBomItem(null);
          setReservationGateError(null);
          await fetchScmReadiness();
          onRefresh(true);
        } else {
          showToast(res.error || res.data?.error || "Failed to apply concession", "error");
        }
      } catch (err: any) {
        showToast(err.message || "Error applying concession", "error");
      } finally {
        setIsSubmittingConcession(false);
      }
    },
    [projectId, user, showToast, fetchScmReadiness, onRefresh]
  );

  const [pendingGateTransition, setPendingGateTransition] = useState<{
    wotCode: string;
    targetBopId: string;
    goodQty: number;
  } | null>(null);
  const [reservationGateError, setReservationGateError] = useState<{
    code?: string;
    message: string;
    can_issue_from_warehouse?: boolean;
    can_partial_wave_issue?: boolean;
    has_warehouse_shortage?: boolean;
    shortages: Array<{
      bom_id?: string;
      item_name: string;
      item_code?: string;
      required_qty: number;
      reserved_qty: number;
      supplied_to_floor_qty?: number;
      available_in_warehouse_to_issue?: number;
      available_stock?: number;
      shortage_qty: number;
      bop_process_name?: string;
      max_producible_units?: number;
      scm_stage?: string;
    }>;
  } | null>(null);

  const handleStartOrAdvanceWotStep = useCallback(
    async (bopStep?: any, targetWot?: any) => {
      const chosenWot = targetWot || wots.find((w: any) => w.status !== "COMPLETED") || wots[0];
      if (!chosenWot) {
        showToast("No WOT sub-lot available. Commit Setup & Master first.", "error");
        return;
      }

      const wotCode = String(chosenWot.wot_number || chosenWot.lot_number || chosenWot.id).trim();
      const chosenBopId =
        bopStep?.id ||
        processSteps.find((s) => s.status === "RUNNING" || s.status === "IN_PROGRESS")?.id ||
        processSteps.find((s) => s.status !== "COMPLETED")?.id ||
        processSteps[0]?.id;

      const goodQty = Number(chosenWot.qty) || Number(project?.lot_size) || 10;

      setIsTransitioningWot(true);
      try {
        const res = await apiFetch(
          `/api/production/wot/scan-transition`,
          {
            method: "POST",
            body: JSON.stringify({
              project_id: projectId,
              qr_input: wotCode,
              target_bop_id: chosenBopId || undefined,
              operator_name: user?.name || user?.username || "Orchestra Engine",
              good_qty: goodQty,
              scrap_qty: 0,
              notes: "Orchestra Engine step dispatch",
            }),
          },
          user?.username
        );

        if (res.ok && res.data?.ok) {
          showToast(
            res.data.message || `WOT ${wotCode} transitioned to active process.`,
            "success"
          );
          setReservationGateError(null);
          setPendingGateTransition(null);
          await fetchScmReadiness();
          onRefresh(true);
        } else if (
          res.data?.code === "SCM_MATERIAL_NOT_SUPPLIED" ||
          res.data?.code === "MATERIAL_RESERVATION_INCOMPLETE"
        ) {
          setPendingGateTransition({
            wotCode,
            targetBopId: chosenBopId || "",
            goodQty,
          });
          setReservationGateError({
            code: res.data.code,
            message:
              res.data.error ||
              "SCM Hard Interlock: Warehouse has not yet supplied BOM material to the Shop Floor.",
            can_issue_from_warehouse: res.data.can_issue_from_warehouse,
            has_warehouse_shortage: res.data.has_warehouse_shortage,
            shortages: Array.isArray(res.data.shortages) ? res.data.shortages : [],
          });
          showToast("SCM Hard Interlock: Warehouse must supply material to Shop Floor first", "error");
        } else {
          showToast(res.error || res.data?.error || "Failed to transition WOT step", "error");
        }
      } catch (err: any) {
        showToast(err.message || "Error transitioning WOT step", "error");
      } finally {
        setIsTransitioningWot(false);
      }
    },
    [wots, processSteps, project?.lot_size, projectId, user, showToast, fetchScmReadiness, onRefresh]
  );

  // ============================================================================
  // 2. MICRO & MACRO ORCHESTRA ENGINE CALCULATIONS
  // ============================================================================
  const availableMachines = useMemo(() => {
    if (!Array.isArray(itemsCatalog)) return [];
    return itemsCatalog.filter((item: any) => {
      const t = String(item.type || item.item_type || "").toUpperCase();
      const c = String(item.category || "").toUpperCase();
      return (
        t === "MACHINE" ||
        c.includes("MACHINE") ||
        c.includes("EQUIPMENT") ||
        Boolean(item.machine_category)
      );
    });
  }, [itemsCatalog]);

  const totalTargetQty = Math.max(1, Number(project?.qty) || 10);
  const defaultLotSize = Math.max(1, Number(project?.lot_size) || Math.min(10, totalTargetQty));

  const enrichedProcesses = useMemo(() => {
    const targetQty = totalTargetQty;
    const ffRatio = Math.max(0.2, (Number(factoryFactor) || 85) / 100);
    let cumulativeForecastMs = nowMs;

    const totalStepsCount = Math.max(1, processSteps.length);

    // First pass: compute per-step Micro Engine parameters (Effective Cycle Time & 1-Lot WOT Duration)
    const baseSteps = processSteps.map((step: any, idx: number) => {
      const station = stations.find((st: any) => st.id === step.station_id);
      const machine = availableMachines.find(
        (m: any) => m.id === (step.assigned_machine_id || step.machine_id)
      );
      const stepNdp = activeNdps.find(
        (n: any) => n.bop_id === step.id && (n.status === "ACTIVE" || n.status === "OPEN")
      );
      const activeWotsAtStep = wots.filter(
        (w: any) =>
          String(w.current_bop_id || w.bop_id || w.current_process_id) === String(step.id) &&
          (w.status === "IN_PROGRESS" || w.status === "RUNNING" || w.status === "READY" || w.status === "PAUSED")
      );

      let machineIds: string[] = [];
      try {
        if (Array.isArray(step.assigned_machine_ids)) {
          machineIds = step.assigned_machine_ids.filter(Boolean);
        } else if (typeof step.assigned_machine_ids_json === "string" && step.assigned_machine_ids_json.trim()) {
          const parsed = JSON.parse(step.assigned_machine_ids_json);
          if (Array.isArray(parsed)) machineIds = parsed.filter(Boolean);
        }
      } catch (e) {}
      if (machineIds.length === 0 && (step.assigned_machine_id || step.machine_id)) {
        machineIds = [String(step.assigned_machine_id || step.machine_id)];
      }
      const machineCount = machineIds.length;
      const speedFactor =
        machineCount > 1
          ? Math.max(1.0, Number(step.machine_efficiency_multiplier) || 1.5)
          : 1.0;
      const compoundDivisor =
        machineCount > 1 ? Math.pow(speedFactor, machineCount - 1) : 1.0;

      const ctMins = Math.max(0.5, Number(step.cycle_time_minutes) || 15);
      const effectiveCtMins = ctMins / (compoundDivisor * ffRatio);
      const mp = Math.max(1, machineCount || Number(step.manpower_count) || 1);

      const lotBatchQty =
        activeWotsAtStep.length > 0
          ? Math.max(1, Number(activeWotsAtStep[0]?.qty ?? activeWotsAtStep[0]?.quantity) || defaultLotSize)
          : defaultLotSize;

      // Cross-Project Contention (Duet with Load Across Ongoing Projects)
      const stationNameLabel =
        station?.station_name || station?.station_code || step.station_id || "General Station";
      const stationIdentifiers = [
        step.station_id,
        station?.station_code,
        station?.station_name,
        stationNameLabel,
      ]
        .filter(Boolean)
        .map((s) => String(s).trim().toLowerCase());

      let stepContentionMins = 0;
      const sharedProjectSpks: string[] = [];

      concurrentProjects.forEach((cp: any) => {
        const cpMachines: string[] = Array.isArray(cp.assigned_machines)
          ? cp.assigned_machines.map((m: any) => String(m))
          : [];
        const cpStations: string[] = Array.isArray(cp.assigned_stations)
          ? cp.assigned_stations.map((s: any) => String(s).trim().toLowerCase())
          : [];
        const cpRunningSteps: any[] = Array.isArray(cp.running_steps) ? cp.running_steps : [];

        const sharedMachCount = machineIds.filter((m) => cpMachines.includes(String(m))).length;
        const sharesStation = stationIdentifiers.some((sid) => cpStations.includes(sid));

        if (sharedMachCount > 0 || sharesStation) {
          const isActivelyRunning = cpRunningSteps.length > 0;
          const machQueue = sharedMachCount * (isActivelyRunning ? 25 : 18);
          const stQueue = sharesStation ? (isActivelyRunning ? 15 : 10) : 0;
          stepContentionMins += machQueue + stQueue;
          if (cp.spk_number || cp.name) {
            sharedProjectSpks.push(String(cp.spk_number || cp.name));
          }
        }
      });

      // Micro-Engine: Single Process Duration for 1 WOT Lot + Step-Level Cross-Project Queue Buffer
      const baseLotDurationMins = effectiveCtMins * lotBatchQty;
      const singleLotDurationMins = baseLotDurationMins + stepContentionMins;
      const singleLotDurationMs = singleLotDurationMins * 60 * 1000;

      const isStepRunning = step.status === "RUNNING" || step.status === "IN_PROGRESS";
      const isStepPaused = step.status === "PAUSED" || Boolean(stepNdp);

      const startMs = step.actual_start_date
        ? new Date(step.actual_start_date).getTime()
        : nowMs;
      const elapsedMs = isStepRunning ? Math.max(0, nowMs - startMs) : 0;
      const remainingMs = isStepRunning
        ? Math.max(0, singleLotDurationMs - elapsedMs)
        : singleLotDurationMs;
      const etaTimestampMs = isStepRunning
        ? nowMs + remainingMs
        : cumulativeForecastMs + singleLotDurationMs;

      const forecastStartMs = isStepRunning ? startMs : cumulativeForecastMs;
      if (step.status !== "COMPLETED") {
        cumulativeForecastMs = etaTimestampMs;
      }

      const progressPct =
        step.status === "COMPLETED"
          ? 100
          : isStepRunning
          ? Math.min(99, Math.max(5, Math.round((elapsedMs / Math.max(1000, singleLotDurationMs)) * 100)))
          : 0;

      const stepTargetQty = Math.max(1, Number(step.target_qty) || targetQty);
      const stepCompletedQty =
        step.completed_qty !== undefined && step.completed_qty !== null
          ? Number(step.completed_qty)
          : step.status === "COMPLETED"
          ? stepTargetQty
          : Math.round((progressPct / 100) * stepTargetQty);

      return {
        ...step,
        stepIndex: idx + 1,
        totalStepsCount,
        step_sequence: step.step_sequence || idx + 1,
        station_name: stationNameLabel,
        machine_code: machine?.item_code || null,
        machine_name: machine?.name || null,
        machine_count: machineCount,
        machine_efficiency_multiplier: speedFactor,
        effectiveCtMins: Number(effectiveCtMins.toFixed(2)),
        manpower_count: mp,
        active_ndp: stepNdp || null,
        active_wots: activeWotsAtStep,
        lotBatchQty,
        baseLotDurationMins: Number(baseLotDurationMins.toFixed(1)),
        stepContentionMins,
        sharedProjectSpks: Array.from(new Set(sharedProjectSpks)),
        plannedDurationMins: Number(singleLotDurationMins.toFixed(1)),
        singleLotDurationMs,
        elapsedMins: Math.floor(elapsedMs / 60000),
        remainingSecs: Math.ceil(remainingMs / 1000),
        remainingMs,
        etaDate: new Date(etaTimestampMs),
        forecastStartDate: new Date(forecastStartMs),
        progressPct,
        target_qty: stepTargetQty,
        completed_qty: stepCompletedQty,
        isStepRunning,
        isStepPaused,
      };
    });

    // Second pass: compute 1-Lot WOT Root-to-Finish Completion Estimate (ETA_1-Lot) from each step n..N
    return baseSteps.map((proc, idx) => {
      const downstreamSteps = baseSteps.slice(idx + 1);
      let downstreamLotDurationMs = 0;

      downstreamSteps.forEach((ds, dIdx) => {
        const prevStep = dIdx === 0 ? proc : downstreamSteps[dIdx - 1];
        const isSameStation =
          String(ds.station_id || ds.station_name) ===
          String(prevStep.station_id || prevStep.station_name);
        const mode = ds.transfer_mode || (isSameStation ? "INTRA_STATION" : "INTER_STATION");

        if (mode === "INTRA_STATION") {
          // 1-Piece intra-station overlap: only adds single-unit cycle delta + tail + shared contention
          downstreamLotDurationMs +=
            ds.baseLotDurationMins * 60 * 1000 * 0.65 + ds.stepContentionMins * 60 * 1000;
        } else {
          // Inter-station WOT gate: full lot duration (includes contention) + 5m transfer buffer
          downstreamLotDurationMs += ds.singleLotDurationMs + 5 * 60 * 1000;
        }
      });

      const oneLotWotRemainingMs =
        proc.status === "COMPLETED" ? 0 : proc.remainingMs + downstreamLotDurationMs;
      const oneLotWotRemainingSecs = Math.ceil(oneLotWotRemainingMs / 1000);
      const oneLotWotEtaDate = new Date(nowMs + oneLotWotRemainingMs);

      // Preceding completed steps count for this WOT
      const precedingCompletedSteps = idx;

      return {
        ...proc,
        precedingCompletedSteps,
        oneLotWotRemainingSecs,
        oneLotWotRemainingMins: Number((oneLotWotRemainingMs / 60000).toFixed(1)),
        oneLotWotEtaDate,
      };
    });
  }, [
    processSteps,
    stations,
    availableMachines,
    activeNdps,
    wots,
    concurrentProjects,
    factoryFactor,
    nowMs,
    totalTargetQty,
    defaultLotSize,
  ]);

  const runningProcesses = useMemo(
    () =>
      enrichedProcesses.filter(
        (p) => p.status === "RUNNING" || p.status === "IN_PROGRESS" || p.status === "PAUSED"
      ),
    [enrichedProcesses]
  );

  const upcomingProcesses = useMemo(
    () =>
      enrichedProcesses.filter(
        (p) =>
          p.status !== "RUNNING" &&
          p.status !== "IN_PROGRESS" &&
          p.status !== "PAUSED" &&
          p.status !== "COMPLETED"
      ),
    [enrichedProcesses]
  );

  const completedProcesses = useMemo(
    () => enrichedProcesses.filter((p) => p.status === "COMPLETED"),
    [enrichedProcesses]
  );

  // Active Process Card items: show all currently running/paused processes (>1 supported),
  // or if none are running yet, show the immediate ready-to-start process so the card is always actionable.
  const activeCardProcesses = useMemo(() => {
    if (runningProcesses.length > 0) return runningProcesses;
    if (upcomingProcesses.length > 0) return [upcomingProcesses[0]];
    return enrichedProcesses.slice(-1);
  }, [runningProcesses, upcomingProcesses, enrichedProcesses]);

  // Next Process Card items: immediate downstream processes after the active processes
  const nextCardProcesses = useMemo(() => {
    const activeIds = new Set(activeCardProcesses.map((p) => p.id));
    const maxActiveSeq =
      activeCardProcesses.length > 0
        ? Math.max(...activeCardProcesses.map((p) => Number(p.step_sequence) || 0))
        : 0;
    const candidates = upcomingProcesses.filter(
      (p) => !activeIds.has(p.id) && Number(p.step_sequence) >= maxActiveSeq
    );
    if (candidates.length > 0) return candidates.slice(0, 2);
    return upcomingProcesses.filter((p) => !activeIds.has(p.id)).slice(0, 2);
  }, [activeCardProcesses, upcomingProcesses]);

  // Macro-Engine Multi-Lot Pipeline Summary (Synchronized with Cross-Project Ongoing Load)
  const macroEngineTelemetry = useMemo(() => {
    const totalLots = Math.max(1, wots.length || Math.ceil(totalTargetQty / defaultLotSize));
    const completedLots = wots.filter((w: any) => w.status === "COMPLETED").length;
    const remainingLots = Math.max(0, totalLots - completedLots);

    const singleLotCriticalMins = enrichedProcesses.reduce(
      (sum, p) => sum + (Number(p.plannedDurationMins) || 0),
      0
    );
    const singleLotContentionMins = enrichedProcesses.reduce(
      (sum, p) => sum + (Number(p.stepContentionMins) || 0),
      0
    );
    const bottleneckProc =
      [...enrichedProcesses].sort(
        (a, b) => (Number(b.plannedDurationMins) || 0) - (Number(a.plannedDurationMins) || 0)
      )[0] || null;
    const bottleneckLotMins = Number(bottleneckProc?.plannedDurationMins) || 30;

    // Active 1-Lot remaining time (already includes downstream stepContentionMins)
    const primaryActive = activeCardProcesses[0];
    const activeLotRemMins = primaryActive
      ? primaryActive.oneLotWotRemainingMins
      : singleLotCriticalMins;

    // Active NDP downtime penalty
    const ndpPenaltyMins = activeNdps
      .filter((n: any) => n.status === "ACTIVE" || n.status === "OPEN")
      .reduce((acc: number, n: any) => acc + (Number(n.estimated_down_hours) || 2) * 60, 0);

    // Cross-project contention delay across remaining pipelined WOT lots
    const macroContentionMins =
      remainingLots === 0
        ? 0
        : singleLotContentionMins +
          Math.max(0, remainingLots - 1) * (Number(bottleneckProc?.stepContentionMins) || 0);

    // Macro formula: T_Macro = T_ActiveLot_Rem + (M_rem - 1) * D_bottleneck + T_NDP
    const macroTotalRemMins =
      remainingLots === 0
        ? 0
        : activeLotRemMins + Math.max(0, remainingLots - 1) * bottleneckLotMins + ndpPenaltyMins;

    const macroEtaDate = new Date(nowMs + macroTotalRemMins * 60 * 1000);
    const conflictingSpkSet = new Set(
      enrichedProcesses.flatMap((p) => p.sharedProjectSpks || [])
    );

    return {
      totalLots,
      completedLots,
      remainingLots,
      singleLotCriticalHours: Number((singleLotCriticalMins / 60).toFixed(1)),
      singleLotContentionMins,
      macroContentionHours: Number((macroContentionMins / 60).toFixed(1)),
      conflictingProjectsCount: conflictingSpkSet.size,
      bottleneckProc,
      macroTotalRemHours: Number((macroTotalRemMins / 60).toFixed(1)),
      macroEtaDate,
    };
  }, [wots, totalTargetQty, defaultLotSize, enrichedProcesses, activeCardProcesses, activeNdps, nowMs]);

  const formatCountdown = (totalSecs: number) => {
    const safeSecs = Math.max(0, Math.floor(totalSecs));
    const hrs = Math.floor(safeSecs / 3600);
    const mins = Math.floor((safeSecs % 3600) / 60);
    const secs = safeSecs % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Interactive Gantt Filter & Quick Execution State
  const [ganttStatusFilter, setGanttStatusFilter] = useState<
    "ALL" | "RUNNING" | "QUEUED" | "PAUSED" | "COMPLETED"
  >("ALL");
  const [ganttStationFilter, setGanttStationFilter] = useState<string>("ALL");
  const [busyProcessId, setBusyProcessId] = useState<string | null>(null);

  const filteredGanttProcesses = useMemo(() => {
    return enrichedProcesses.filter((proc: any) => {
      if (ganttStationFilter !== "ALL") {
        const stMatch =
          String(proc.station_id) === ganttStationFilter ||
          String(proc.station_name) === ganttStationFilter;
        if (!stMatch) return false;
      }
      const st = String(proc.status || "PENDING").toUpperCase();
      if (ganttStatusFilter === "RUNNING") {
        return st === "RUNNING" || st === "IN_PROGRESS";
      }
      if (ganttStatusFilter === "PAUSED") {
        return st === "PAUSED" || Boolean(proc.active_ndp);
      }
      if (ganttStatusFilter === "COMPLETED") {
        return st === "COMPLETED";
      }
      if (ganttStatusFilter === "QUEUED") {
        return st !== "RUNNING" && st !== "IN_PROGRESS" && st !== "PAUSED" && st !== "COMPLETED";
      }
      return true;
    });
  }, [enrichedProcesses, ganttStatusFilter, ganttStationFilter]);

  const handleQuickUnitAdvance = useCallback(
    async (
      bopId: string,
      wotId: string | undefined,
      deltaUnits: number,
      completeFullWot = false
    ) => {
      setBusyProcessId(bopId);
      try {
        const res = await apiFetch(
          `/api/production/projects/${projectId}/wot/unit-pipeline`,
          {
            method: "POST",
            body: JSON.stringify({
              wot_id: wotId || wots.find((w: any) => w.status !== "COMPLETED")?.id || wots[0]?.id,
              bop_id: bopId,
              delta_good_units: deltaUnits,
              complete_full_wot: completeFullWot,
              operator_name: user?.name || user?.username || "Orchestra Engine",
            }),
          },
          user?.username
        );
        if (res.ok && res.data?.ok) {
          showToast(res.data.message || "Process step output updated", "success");
          fetchScmReadiness();
          onRefresh(true);
        } else if (res.data?.code === "SCM_MATERIAL_NOT_SUPPLIED") {
          setReservationGateError({
            code: res.data.code,
            message:
              res.data.error ||
              "SCM Hard Interlock: Cannot advance shop floor process before Warehouse supplies BOM material.",
            can_issue_from_warehouse: res.data.can_issue_from_warehouse,
            has_warehouse_shortage: res.data.has_warehouse_shortage,
            shortages: Array.isArray(res.data.shortages) ? res.data.shortages : [],
          });
          showToast("SCM Hard Interlock: Warehouse material not yet supplied to floor", "error");
        } else {
          showToast(res.error || res.data?.error || "Failed to update output", "error");
        }
      } catch (err: any) {
        showToast(err.message || "Error updating process output", "error");
      } finally {
        setBusyProcessId(null);
      }
    },
    [projectId, wots, user, showToast, fetchScmReadiness, onRefresh]
  );

  // Autonomous Orchestra Engine (Always-On): Auto-advance running process when timer reaches 0s
  // Governed by Gate 1 (Point-of-Use & Wave Quota Ceiling) & Gate 3 (Zero Active NDPs)
  useEffect(() => {
    if (wots.length === 0) return;
    runningProcesses.forEach((proc) => {
      const stepQuota = scmReadiness?.process_producible_quotas?.[proc.id];
      const isPouUnlocked = stepQuota
        ? stepQuota.is_pou_unlocked && proc.completed_qty < stepQuota.max_producible_qty
        : Boolean(scmReadiness?.all_supplied_to_floor);
      if (!isPouUnlocked) return;

      if (
        proc.isStepRunning &&
        !proc.isStepPaused &&
        proc.remainingSecs <= 0 &&
        busyProcessId !== proc.id
      ) {
        const activeWot =
          proc.active_wots?.[0] || wots.find((w: any) => w.status !== "COMPLETED") || wots[0];
        const triggerKey = `${proc.id}-${activeWot?.id || "default"}-${proc.completed_qty}`;
        if (!autoTriggeredSetRef.current.has(triggerKey)) {
          autoTriggeredSetRef.current.add(triggerKey);
          handleQuickUnitAdvance(proc.id, activeWot?.id, 0, true);
        }
      }
    });
  }, [runningProcesses, wots, busyProcessId, scmReadiness, handleQuickUnitAdvance]);

  const handleQuickProcessControl = async (
    action: "PAUSE" | "CONTINUE",
    stationId?: string,
    bopId?: string
  ) => {
    if (bopId) setBusyProcessId(bopId);
    try {
      const res = await apiFetch(
        `/api/production/projects/${projectId}/station-control`,
        {
          method: "POST",
          body: JSON.stringify({
            station_id: stationId,
            bop_id: bopId,
            action,
            reason: `Supervisor Override: ${action}`,
          }),
        },
        user?.username
      );
      if (res.ok && res.data?.ok) {
        showToast(res.data.message || `Process ${action.toLowerCase()}d`, "success");
        onRefresh(true);
      } else {
        showToast(res.error || res.data?.error || `Failed to ${action.toLowerCase()}`, "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setBusyProcessId(null);
    }
  };

  // ============================================================================
  // 3. CONTROL STATE: DUAL-VECTOR NDP & 4 TACTICAL RECOVERY CONTROLS
  // ============================================================================
  const [controlTab, setControlTab] = useState<
    "NDP_CASCADE" | "MACHINE_REROUTE" | "LOT_SPLIT" | "QC_REWORK" | "SHIFT_BOOST"
  >("NDP_CASCADE");

  // 3.1 Dual-Vector Cross-Project NDP State
  const [ndpBopId, setNdpBopId] = useState<string>("");
  const [ndpVector, setNdpVector] = useState<"MACHINE_BREAKDOWN" | "MATERIAL_NG">("MACHINE_BREAKDOWN");
  const [ndpMachineId, setNdpMachineId] = useState<string>("");
  const [ndpSelectedBomId, setNdpSelectedBomId] = useState<string>("");
  const [ndpNgQty, setNdpNgQty] = useState<number>(1);
  const [ndpDownHours, setNdpDownHours] = useState<number>(8);
  const [ndpDescription, setNdpDescription] = useState<string>("");
  const [isSubmittingNdp, setIsSubmittingNdp] = useState<boolean>(false);
  const [lastCascadeResult, setLastCascadeResult] = useState<any | null>(null);

  // 3.2 Machine Reroute State
  const [rerouteBopId, setRerouteBopId] = useState<string>("");
  const [rerouteMachineId, setRerouteMachineId] = useState<string>("");
  const [rerouteResolveNdp, setRerouteResolveNdp] = useState<boolean>(true);
  const [rerouteNotes, setRerouteNotes] = useState<string>("");
  const [isSubmittingReroute, setIsSubmittingReroute] = useState<boolean>(false);

  // 3.3 Lot Split State
  const [splitWotId, setSplitWotId] = useState<string>("");
  const [splitQty, setSplitQty] = useState<number>(1);
  const [splitTargetBopId, setSplitTargetBopId] = useState<string>("");
  const [isSubmittingSplit, setIsSubmittingSplit] = useState<boolean>(false);

  // 3.4 Quality Hold & Rework Loop State
  const [qcBopId, setQcBopId] = useState<string>("");
  const [qcWotId, setQcWotId] = useState<string>("");
  const [qcActionType, setQcActionType] = useState<"QC_HOLD" | "REWORK_LOOP">("REWORK_LOOP");
  const [qcQty, setQcQty] = useState<number>(1);
  const [qcReason, setQcReason] = useState<string>("");
  const [isSubmittingQc, setIsSubmittingQc] = useState<boolean>(false);

  // 3.5 Overtime & Shift Boost State
  const [boostBopId, setBoostBopId] = useState<string>("");
  const [boostHours, setBoostHours] = useState<number>(4);
  const [boostReason, setBoostReason] = useState<string>("");
  const [isSubmittingBoost, setIsSubmittingBoost] = useState<boolean>(false);

  // Initialize default selections for Control forms
  useEffect(() => {
    if (enrichedProcesses.length > 0) {
      const defaultStep =
        enrichedProcesses.find((p) => p.status === "RUNNING") || enrichedProcesses[0];
      if (!ndpBopId) setNdpBopId(defaultStep.id);
      if (!rerouteBopId) setRerouteBopId(defaultStep.id);
      if (!qcBopId) setQcBopId(defaultStep.id);
      if (!boostBopId) setBoostBopId(defaultStep.id);
      if (!splitTargetBopId) setSplitTargetBopId(defaultStep.id);
    }
    if (wots.length > 0) {
      if (!splitWotId) setSplitWotId(wots[0].id);
      if (!qcWotId) setQcWotId(wots[0].id);
    }
    if (bom.length > 0 && !ndpSelectedBomId) {
      setNdpSelectedBomId(bom[0].id);
    }
  }, [enrichedProcesses, wots, bom]);

  // Auto-sync machine when ndpBopId changes
  useEffect(() => {
    const st = enrichedProcesses.find((p) => p.id === ndpBopId);
    if (st && (st.assigned_machine_id || st.machine_id)) {
      setNdpMachineId(st.assigned_machine_id || st.machine_id);
    }
  }, [ndpBopId, enrichedProcesses]);

  const handleTriggerCascadingNdp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ndpBopId) {
      showToast("Select a process step first", "error");
      return;
    }

    const selectedBomItem = bom.find((b: any) => b.id === ndpSelectedBomId);

    setIsSubmittingNdp(true);
    try {
      const res = await apiFetch(
        `/api/production/ndp/cascade`,
        {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            bop_id: ndpBopId,
            reason_category: ndpVector,
            affected_machine_id: ndpVector === "MACHINE_BREAKDOWN" ? ndpMachineId || undefined : undefined,
            affected_item_id: ndpVector === "MATERIAL_NG" ? selectedBomItem?.item_id : undefined,
            affected_item_code: ndpVector === "MATERIAL_NG" ? selectedBomItem?.item_code : undefined,
            affected_item_name: ndpVector === "MATERIAL_NG" ? selectedBomItem?.item_name : undefined,
            ng_qty: ndpVector === "MATERIAL_NG" ? ndpNgQty : 0,
            estimated_down_hours: ndpDownHours,
            description:
              ndpDescription ||
              (ndpVector === "MACHINE_BREAKDOWN"
                ? "Shared machine breakdown on shop floor"
                : `Warehouse dispatched material NG defect (${selectedBomItem?.item_code || "SKU"})`),
            reported_by: user?.name || user?.username || "Supervisor",
            auto_request_replacement: true,
          }),
        },
        user?.username
      );

      if (res.ok && res.data?.ok) {
        setLastCascadeResult(res.data);
        showToast(res.data.message || "Cascading NDP issued!", "success");
        setNdpDescription("");
        onRefresh(true);
        fetchCommunications();
      } else {
        showToast(res.error || res.data?.error || "Failed to issue NDP", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingNdp(false);
    }
  };

  const handleResolveNdp = async (ndp: any) => {
    try {
      const res = await apiFetch(
        `/api/production/control/machine-reroute`,
        {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            bop_id: ndp.bop_id,
            new_machine_id: ndp.machine_id || ndp.affected_machine_id || null,
            resolve_active_ndp: true,
            notes: "Resolved from Shop Floor Control Console",
          }),
        },
        user?.username
      );
      if (res.ok) {
        showToast(`Resolved NDP ${ndp.ndp_code || ndp.ndp_number} & resumed process`, "success");
        onRefresh(true);
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleMachineReroute = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingReroute(true);
    try {
      const res = await apiFetch(
        `/api/production/control/machine-reroute`,
        {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            bop_id: rerouteBopId,
            new_machine_id: rerouteMachineId || null,
            resolve_active_ndp: rerouteResolveNdp,
            notes: rerouteNotes,
          }),
        },
        user?.username
      );
      if (res.ok && res.data?.ok) {
        showToast(res.data.message, "success");
        setRerouteNotes("");
        onRefresh(true);
      } else {
        showToast(res.error || res.data?.error || "Failed to reroute machine", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingReroute(false);
    }
  };

  const handleSplitWot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingSplit(true);
    try {
      const res = await apiFetch(
        `/api/production/control/split-wot`,
        {
          method: "POST",
          body: JSON.stringify({
            wot_id: splitWotId,
            split_qty: splitQty,
            target_bop_id: splitTargetBopId || undefined,
            operator_name: user?.name || user?.username || "Supervisor",
          }),
        },
        user?.username
      );
      if (res.ok && res.data?.ok) {
        showToast(res.data.message || "WOT sub-lot split and advanced.", "success");
        onRefresh(true);
      } else {
        showToast(res.error || res.data?.error || "Failed to split WOT", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingSplit(false);
    }
  };

  const handleQcRework = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingQc(true);
    try {
      const res = await apiFetch(
        `/api/production/control/qc-rework`,
        {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            bop_id: qcBopId,
            wot_id: qcWotId || undefined,
            action_type: qcActionType,
            qty: qcQty,
            reason: qcReason,
            inspector: user?.name || user?.username || "QC Inspector",
          }),
        },
        user?.username
      );
      if (res.ok && res.data?.ok) {
        showToast(res.data.message, "success");
        setQcReason("");
        onRefresh(true);
        fetchCommunications();
      } else {
        showToast(res.error || res.data?.error || "Failed to trigger QC action", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingQc(false);
    }
  };

  const handleShiftBoost = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingBoost(true);
    try {
      const res = await apiFetch(
        `/api/production/control/shift-boost`,
        {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            bop_id: boostBopId || undefined,
            extra_hours: boostHours,
            reason: boostReason || "Bottleneck recovery overtime boost",
            authorized_by: user?.name || user?.username || "Production Lead",
          }),
        },
        user?.username
      );
      if (res.ok && res.data?.ok) {
        showToast(res.data.message, "success");
        setBoostReason("");
        onRefresh(true);
      } else {
        showToast(res.error || res.data?.error || "Failed to inject shift boost", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingBoost(false);
    }
  };

  // ============================================================================
  // 4. COMMUNICATE STATE: PROCESS THREADS, MATERIAL/TOOLING REQUESTS & HANDOVER
  // ============================================================================
  const [threads, setThreads] = useState<any[]>([]);
  const [handovers, setHandovers] = useState<any[]>([]);
  const [floorRequests, setFloorRequests] = useState<any[]>([]);

  const fetchCommunications = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/api/production/projects/${projectId}/communications`,
        {},
        user?.username
      );
      if (res.ok && res.data?.ok) {
        setThreads(Array.isArray(res.data.threads) ? res.data.threads : []);
        setHandovers(Array.isArray(res.data.handovers) ? res.data.handovers : []);
        setFloorRequests(Array.isArray(res.data.floor_requests) ? res.data.floor_requests : []);
      }
    } catch (e) {}
  }, [projectId, user?.username]);

  useEffect(() => {
    if (projectId) {
      fetchCommunications();
    }
  }, [projectId, fetchCommunications]);

  return (
    <div className="space-y-6">
      {/* ALERT IF WOT LOT SIZE NOT YET COMMITTED IN SETUP & MASTER */}
      {!project?.is_master_set && wots.length === 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>WOT Sub-Lots Not Initialized:</strong> Commit the plan on{" "}
              <strong>01. Setup &amp; Master</strong> to initialize WOT sub-lots for Orchestra execution.
            </span>
          </div>
          {onNavigateToSetup && (
            <Button
              type="button"
              onClick={onNavigateToSetup}
              className="h-8 px-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 inline-flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Open Setup &amp; Master</span>
            </Button>
          )}
        </div>
      )}

      {/* 4-GATE ENGINEERING & ADAPTIVE STAGGERED SCM INTERLOCK STATUS BAR */}
      {scmReadiness && scmReadiness.total_bom_items > 0 && (
        <div
          className={cn(
            "rounded-2xl border p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shadow-2xs",
            scmReadiness.all_supplied_to_floor && (scmReadiness.open_deferred_fitments?.length || 0) === 0
              ? "bg-emerald-50/70 border-emerald-200"
              : scmReadiness.active_step_unlocked
              ? "bg-amber-50/80 border-amber-300"
              : "bg-rose-50 border-rose-300"
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                scmReadiness.all_supplied_to_floor && (scmReadiness.open_deferred_fitments?.length || 0) === 0
                  ? "bg-emerald-600 text-white"
                  : scmReadiness.active_step_unlocked
                  ? "bg-amber-600 text-white"
                  : "bg-rose-600 text-white"
              )}
            >
              <Package className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-stone-900">
                  SCM Point-of-Use &amp; Wave Readiness
                </span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tabular-nums",
                    scmReadiness.all_supplied_to_floor && (scmReadiness.open_deferred_fitments?.length || 0) === 0
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      : scmReadiness.active_step_unlocked
                      ? "bg-amber-100 text-amber-900 border border-amber-300"
                      : "bg-rose-100 text-rose-800 border border-rose-200"
                  )}
                >
                  {scmReadiness.all_supplied_to_floor && (scmReadiness.open_deferred_fitments?.length || 0) === 0
                    ? `FULL SUPPLIED: ${scmReadiness.supplied_count}/${scmReadiness.total_bom_items} BOM (100% READY)`
                    : scmReadiness.active_step_unlocked
                    ? `WAVE UNLOCKED: CEILING ${scmReadiness.active_step_producible_ceiling ?? totalTargetQty}/${scmReadiness.target_project_qty ?? totalTargetQty} UNITS`
                    : `POU GATE LOCKED: ACTIVE STEP MATERIAL NOT SUPPLIED`}
                </span>
                {(scmReadiness.open_deferred_fitments?.length || 0) > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-300 tabular-nums">
                    DEFERRED FITMENTS: {scmReadiness.open_deferred_fitments?.length} ITEM(S) PENDING PRE-FGR
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-700">
                {scmReadiness.all_supplied_to_floor && (scmReadiness.open_deferred_fitments?.length || 0) === 0
                  ? "All BOM materials are supplied to the shop floor with zero pending deferred fitments."
                  : scmReadiness.active_step_unlocked
                  ? `Active step unlocked up to wave ceiling (${scmReadiness.active_step_producible_ceiling ?? totalTargetQty} of ${scmReadiness.target_project_qty ?? totalTargetQty} units).`
                  : "Active process requires Point-of-Use material supply, partial wave issue, substitution, or deferred fitment."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {scmReadiness.can_partial_wave_issue && (
              <Button
                type="button"
                onClick={() =>
                  handleIssueMaterialToFloor(
                    scmReadiness.can_issue_from_warehouse ? "FULL" : "PARTIAL_WAVE"
                  )
                }
                disabled={isIssuingScmMaterial}
                className="h-9 px-3.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                <Package className="w-3.5 h-3.5 mr-1.5" />
                {isIssuingScmMaterial
                  ? "Issuing to Floor..."
                  : scmReadiness.can_issue_from_warehouse
                  ? "Supply Full BOM (100%)"
                  : "Supply Partial Wave"}
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowScmStudioModal(true)}
              className="h-9 px-3.5 bg-white hover:bg-stone-50 text-stone-800 border-stone-300 rounded-xl text-xs font-bold shadow-2xs"
            >
              <Sliders className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
              SCM Wave &amp; Concession Studio
            </Button>
          </div>
        </div>
      )}

      {/* TOP SHOP FLOOR WORKSPACE NAVIGATION BAR */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl border border-stone-200 overflow-x-auto">
          {(
            [
              {
                key: "VIEW",
                label: "Orchestra & Telemetry",
                badge: `${runningProcesses.length} Active`,
              },
              {
                key: "CONTROL",
                label: "Recovery & Line Controls",
                badge: activeNdps.length > 0 ? `${activeNdps.length} NDP` : undefined,
              },
              {
                key: "COMMUNICATE",
                label: "Floor Logs & Handover",
                badge: `${threads.length + floorRequests.length + handovers.length}`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSection(tab.key)}
              className={cn(
                "px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 inline-flex items-center gap-2 cursor-pointer",
                activeSection === tab.key
                  ? "bg-white text-stone-900 border border-stone-200/90 shadow-2xs"
                  : "text-stone-600 hover:text-stone-900 hover:bg-white/60 border border-transparent"
              )}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={cn(
                    "px-1.5 py-0.2 rounded text-[10px] font-mono",
                    activeSection === tab.key
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : tab.key === "CONTROL" && activeNdps.length > 0
                      ? "bg-rose-100 text-rose-700"
                      : "bg-stone-200 text-stone-700"
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 shrink-0">
          <div className="text-xs font-mono text-stone-600 tabular-nums">
            WOT Lots:{" "}
            <strong className="text-stone-900">
              {macroEngineTelemetry.completedLots}/{macroEngineTelemetry.totalLots}
            </strong>{" "}
            · Steps:{" "}
            <strong className="text-emerald-700">
              {completedProcesses.length}/{enrichedProcesses.length}
            </strong>
          </div>

          {runningProcesses.length === 0 && upcomingProcesses.length > 0 && wots.length > 0 && (
            <Button
              onClick={() => handleStartOrAdvanceWotStep(upcomingProcesses[0], wots[0])}
              disabled={isTransitioningWot}
              className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isTransitioningWot ? "Starting..." : "Start Active WOT Lot"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ========================================================================== */}
      {/* TAB 1: VIEW — ORCHESTRA CARDS, INTERACTIVE GANTT & WOT EXECUTION TABLE     */}
      {/* ========================================================================== */}
      {activeSection === "VIEW" && (
        <ShopFloorViewSection
          project={project}
          nowMs={nowMs}
          totalTargetQty={totalTargetQty}
          defaultLotSize={defaultLotSize}
          enrichedProcesses={enrichedProcesses}
          runningProcesses={runningProcesses}
          upcomingProcesses={upcomingProcesses}
          completedProcesses={completedProcesses}
          activeCardProcesses={activeCardProcesses}
          nextCardProcesses={nextCardProcesses}
          filteredGanttProcesses={filteredGanttProcesses}
          wots={wots}
          scmReadiness={scmReadiness}
          busyProcessId={busyProcessId}
          isTransitioningWot={isTransitioningWot}
          ganttStatusFilter={ganttStatusFilter}
          setGanttStatusFilter={setGanttStatusFilter}
          ganttStationFilter={ganttStationFilter}
          setGanttStationFilter={setGanttStationFilter}
          formatCountdown={formatCountdown}
          setShowScmStudioModal={setShowScmStudioModal}
          handleStartOrAdvanceWotStep={handleStartOrAdvanceWotStep}
          handleQuickProcessControl={handleQuickProcessControl}
          handleQuickUnitAdvance={handleQuickUnitAdvance}
          setNdpBopId={setNdpBopId}
          setControlTab={setControlTab}
          setActiveSection={setActiveSection}
          setSelectedWotForGenealogy={setSelectedWotForGenealogy}
        />
      )}

      {/* ========================================================================== */}
      {/* TAB 2: CONTROL — CROSS-PROJECT NDP & TACTICAL RECOVERY                     */}
      {/* ========================================================================== */}
      {activeSection === "CONTROL" && (
        <ShopFloorControlSection
          controlTab={controlTab}
          setControlTab={setControlTab}
          enrichedProcesses={enrichedProcesses}
          availableMachines={availableMachines}
          bom={bom}
          wots={wots}
          activeNdps={activeNdps}
          lastCascadeResult={lastCascadeResult}
          ndpVector={ndpVector}
          setNdpVector={setNdpVector}
          ndpBopId={ndpBopId}
          setNdpBopId={setNdpBopId}
          ndpDownHours={ndpDownHours}
          setNdpDownHours={setNdpDownHours}
          ndpMachineId={ndpMachineId}
          setNdpMachineId={setNdpMachineId}
          ndpSelectedBomId={ndpSelectedBomId}
          setNdpSelectedBomId={setNdpSelectedBomId}
          ndpNgQty={ndpNgQty}
          setNdpNgQty={setNdpNgQty}
          ndpDescription={ndpDescription}
          setNdpDescription={setNdpDescription}
          isSubmittingNdp={isSubmittingNdp}
          handleTriggerCascadingNdp={handleTriggerCascadingNdp}
          handleResolveNdp={handleResolveNdp}
          rerouteBopId={rerouteBopId}
          setRerouteBopId={setRerouteBopId}
          rerouteMachineId={rerouteMachineId}
          setRerouteMachineId={setRerouteMachineId}
          rerouteNotes={rerouteNotes}
          setRerouteNotes={setRerouteNotes}
          rerouteResolveNdp={rerouteResolveNdp}
          setRerouteResolveNdp={setRerouteResolveNdp}
          isSubmittingReroute={isSubmittingReroute}
          handleMachineReroute={handleMachineReroute}
          splitWotId={splitWotId}
          setSplitWotId={setSplitWotId}
          splitQty={splitQty}
          setSplitQty={setSplitQty}
          splitTargetBopId={splitTargetBopId}
          setSplitTargetBopId={setSplitTargetBopId}
          isSubmittingSplit={isSubmittingSplit}
          handleSplitWot={handleSplitWot}
          qcActionType={qcActionType}
          setQcActionType={setQcActionType}
          qcBopId={qcBopId}
          setQcBopId={setQcBopId}
          qcQty={qcQty}
          setQcQty={setQcQty}
          qcReason={qcReason}
          setQcReason={setQcReason}
          isSubmittingQc={isSubmittingQc}
          handleQcRework={handleQcRework}
          boostBopId={boostBopId}
          setBoostBopId={setBoostBopId}
          boostHours={boostHours}
          setBoostHours={setBoostHours}
          boostReason={boostReason}
          setBoostReason={setBoostReason}
          isSubmittingBoost={isSubmittingBoost}
          handleShiftBoost={handleShiftBoost}
        />
      )}

      {/* ========================================================================== */}
      {/* TAB 3: COMMUNICATE — THREADS, MATERIAL REQUESTS & SHIFT HANDOVER           */}
      {/* ========================================================================== */}
      {activeSection === "COMMUNICATE" && (
        <ShopFloorCommunicateSection
          projectId={projectId}
          enrichedProcesses={enrichedProcesses}
          wots={wots}
          itemsCatalog={itemsCatalog}
          threads={threads}
          floorRequests={floorRequests}
          handovers={handovers}
          onRefreshCommunications={fetchCommunications}
          user={user}
        />
      )}

      <ShopFloorScmModals
        project={project}
        totalTargetQty={totalTargetQty}
        enrichedProcesses={enrichedProcesses}
        itemsCatalog={itemsCatalog}
        scmReadiness={scmReadiness}
        reservationGateError={reservationGateError}
        setReservationGateError={setReservationGateError}
        setPendingGateTransition={setPendingGateTransition}
        isIssuingScmMaterial={isIssuingScmMaterial}
        handleIssueMaterialToFloor={handleIssueMaterialToFloor}
        showScmStudioModal={showScmStudioModal}
        setShowScmStudioModal={setShowScmStudioModal}
        subTargetBomItem={subTargetBomItem}
        setSubTargetBomItem={setSubTargetBomItem}
        subSelectedItemId={subSelectedItemId}
        setSubSelectedItemId={setSubSelectedItemId}
        subQtyInput={subQtyInput}
        setSubQtyInput={setSubQtyInput}
        subNotesInput={subNotesInput}
        setSubNotesInput={setSubNotesInput}
        isSubmittingConcession={isSubmittingConcession}
        handleEngineeringConcession={handleEngineeringConcession}
        handleAssignPointOfUse={handleAssignPointOfUse}
        selectedWotForGenealogy={selectedWotForGenealogy}
        setSelectedWotForGenealogy={setSelectedWotForGenealogy}
      />
    </div>
  );
};
