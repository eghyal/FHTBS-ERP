import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Layers,
  Check,
  RefreshCw,
  Trash2,
  Lock,
  Calendar,
  ExternalLink,
  AlertTriangle,
  Send,
  FileText,
  ArrowRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
  Eye,
  ShieldCheck,
  Scale,
  CheckCircle2,
  Clock,
  Truck,
  RotateCcw,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { formatIDR } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { canViewDocFinancials, CONFIDENTIAL_PRICE_MASK } from "@/utils/rbacFinancials";
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
import { BlueprintZeroState } from "./BlueprintZeroState";
import {
  InteractiveWaveGanttCanvas,
  WaveGanttRow,
} from "./InteractiveWaveGanttCanvas";
import { WaveBottleneckMetric } from "./WaveBottleneckInsightPanel";
import {
  MasterPrOutputPreviewModal,
  MasterPrPreviewLine,
  ReconciliationRow,
} from "./MasterPrOutputPreviewModal";
import { PartialDeliveryValueChainPanel } from "./PartialDeliveryValueChainPanel";
import { ProcurementStandingRibbon } from "./workspace/ProcurementStandingRibbon";
import { ProcurementBottleneckStrip } from "./workspace/ProcurementBottleneckStrip";

export type ManufacturingStrategyMode =
  | "BOP_STAGE_AND_WOT_LOT"
  | "BOP_PROCESS_SEQUENCE"
  | "WOT_BATCH_CADENCE";

export type ManufacturingPriorityTier =
  | "CRITICAL_MAIN"
  | "CORE_PROCESS"
  | "SUPPORTING";

interface CandidateProject {
  project_id: string;
  project_name: string;
  spk_number: string | null;
  wo_start_date: string | null;
  wo_end_date: string | null;
  is_master_set?: boolean;
  bop_status?: string | null;
  target_order_qty?: number;
  master_lot_size?: number;
  total_wot_lots?: number;
  shift_hours?: number;
  factory_factor?: number;
  wo_bop_steps_count: number;
  wo_stations_summary: string | null;
  source_type: "PR_QUEUE" | "BOM_MRP" | "HYBRID";
  mrp_summary?: {
    total_bom_items: number;
    gross_bom_total_qty: number;
    warehouse_free_usable_qty: number;
    project_allocated_qty: number;
    existing_pr_qty: number;
    net_shortage_qty: number;
    source_mode: "BOM_MRP" | "PR_QUEUE" | "HYBRID";
    unallocated_bom_items?: {
      bom_id: string;
      item_id: string;
      item_code: string;
      item_name: string;
      uom: string;
      required_qty: number;
      allocated_fraction: number;
      unallocated_qty: number;
    }[];
  };
  pending_item_count: number;
  pr_doc_count: number;
  pr_numbers: string[];
  total_lot_qty: number;
  total_estimated_budget: number;
  is_high_volume_recommended: boolean;
  existing_plan: {
    id: string;
    plan_code: string;
    status: string;
    total_waves: number;
  } | null;
}

interface ProcurementPlanWorkspaceProps {
  initialProjectId?: string | null;
  suppliers: any[];
  onRefreshProcurementData: () => void;
  onOpenPoDetails?: (poId: string) => void;
}

function addDaysClientIso(isoDate: string, days: number): string {
  const clean = String(isoDate || "").slice(0, 10);
  const d = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + days);
    return fallback.toISOString().split("T")[0];
  }
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function daysBetweenClientIso(startIso: string, endIso: string): number {
  const s = new Date(`${String(startIso || "").slice(0, 10)}T00:00:00Z`);
  const e = new Date(`${String(endIso || "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function formatStrategyLabel(mode?: string): string {
  if (mode === "BOP_PROCESS_SEQUENCE" || mode === "STATION_SEQUENCE") {
    return "BOP Station Sequence";
  }
  if (mode === "WOT_BATCH_CADENCE" || mode === "LOT_SPLITTING") {
    return "WOT Batch Cadence";
  }
  return "BOP Stage & WOT Lot";
}

function formatPriorityLabel(tier?: string): string {
  if (tier === "CRITICAL_MAIN") return "Critical";
  if (tier === "SUPPORTING") return "Supporting";
  return "Core";
}

export const ProcurementPlanWorkspace: React.FC<
  ProcurementPlanWorkspaceProps
> = ({
  initialProjectId,
  suppliers,
  onRefreshProcurementData,
  onOpenPoDetails: _onOpenPoDetails,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [prCandidates, setPrCandidates] = useState<CandidateProject[]>([]);
  const [savedPlans, setSavedPlans] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialProjectId || "",
  );
  const [activeSavedPlanId, setActiveSavedPlanId] = useState<string | null>(
    null,
  );

  // Strategy Planning activation toggle:
  // When a project is selected, it defaults to false (locked gray baseline GANTT preview).
  // Clicking "Make a strategy planning" unlocks the full interactive Procurement Wave workspace.
  const [isStrategyPlanningActive, setIsStrategyPlanningActive] =
    useState<boolean>(false);

  // Manufacturing Wave Parameters
  const [strategyMode, setStrategyMode] = useState<ManufacturingStrategyMode>(
    "BOP_STAGE_AND_WOT_LOT",
  );
  const [wotLotsPerWave, setWotLotsPerWave] = useState<number>(2);
  const [leadTimeBufferDays, setLeadTimeBufferDays] = useState<number>(3);
  const [showItemsTable, setShowItemsTable] = useState<boolean>(true);

  // Live bottleneck metrics from GANTT drag/resize interactions
  const [liveBottleneckMetrics, setLiveBottleneckMetrics] = useState<
    WaveBottleneckMetric[]
  >([]);
  const [isBottleneckExpanded, setIsBottleneckExpanded] = useState<boolean>(false);

  // Simulation / Execution State
  const [simulatedPlan, setSimulatedPlan] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [pushingPrWaveId, setPushingPrWaveId] = useState<string | null>(null);
  const [isPushingAllPr, setIsPushingAllPr] = useState<boolean>(false);
  const [isAuthorizingMasterPr, setIsAuthorizingMasterPr] =
    useState<boolean>(false);
  const [isRebalancingQty, setIsRebalancingQty] = useState<boolean>(false);
  const [isPrPreviewOpen, setIsPrPreviewOpen] = useState<boolean>(false);
  const [activeOutputTab, setActiveOutputTab] = useState<
    | "PR_OUTPUT_SCHEDULE"
    | "RECONCILIATION_MATRIX"
    | "WAVE_ITEM_EDITOR"
    | "PARTIAL_DELIVERY_CHAIN"
  >("PR_OUTPUT_SCHEDULE");
  const [isSyncingMasterDates, setIsSyncingMasterDates] =
    useState<boolean>(false);
  const [vendorSlipSimDays, setVendorSlipSimDays] = useState<number>(0);

  // React Flow Selection State
  const [selectedWaveNumbers, setSelectedWaveNumbers] = useState<number[]>([]);

  // Revision Loop State
  const [isRevisionEditMode, setIsRevisionEditMode] = useState<boolean>(false);
  const [isRevisionModalOpen, setIsRevisionModalOpen] =
    useState<boolean>(false);
  const [revisionNoteInput, setRevisionNoteInput] = useState<string>("");
  const [isRequestingRevision, setIsRequestingRevision] =
    useState<boolean>(false);

  const projectSelectRef = useRef<HTMLSelectElement>(null);

  const fetchCandidatesAndPlans = useCallback(async () => {
    setIsLoading(true);
    try {
      const [candRes, plansRes] = await Promise.all([
        apiFetch(
          "/api/purchasing/procurement-plans/candidates",
          {},
          user?.username,
        ),
        apiFetch("/api/purchasing/procurement-plans", {}, user?.username),
      ]);

      const plansList =
        plansRes.ok && Array.isArray(plansRes.data) ? plansRes.data : [];
      setSavedPlans(plansList);

      let prList: CandidateProject[] = [];
      if (candRes.ok && candRes.data) {
        prList = Array.isArray(candRes.data.pr_candidates)
          ? candRes.data.pr_candidates
          : [];
        setPrCandidates(prList);
      }

      if (initialProjectId) {
        const matchingPlan = plansList.find(
          (p: any) =>
            p.project_id === initialProjectId ||
            p.spk_number === initialProjectId,
        );
        const matchingPr = prList.find(
          (c) =>
            c.project_id === initialProjectId ||
            c.spk_number === initialProjectId,
        );

        if (matchingPlan) {
          setActiveSavedPlanId(matchingPlan.id);
          setSelectedProjectId(matchingPlan.project_id);
          return;
        }
        if (matchingPr) {
          setSelectedProjectId(matchingPr.project_id);
          setActiveSavedPlanId(null);
          return;
        }
      }
    } catch (err) {
      console.error("Failed to load procurement plan candidates:", err);
      showToast("Failed to load procurement plan data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [initialProjectId, showToast, user?.username]);

  useEffect(() => {
    fetchCandidatesAndPlans();
  }, [fetchCandidatesAndPlans]);

  const runSimulation = useCallback(
    async (options?: {
      overrideProjectId?: string;
      overrideStrategy?: ManufacturingStrategyMode;
      overrideWotLotsPerWave?: number;
      overrideBufferDays?: number;
    }) => {
      const targetProj = options?.overrideProjectId || selectedProjectId;
      if (!targetProj) return;

      setIsSimulating(true);
      setActiveSavedPlanId(null);
      try {
        const res = await apiFetch(
          "/api/purchasing/procurement-plans/simulate",
          {
            method: "POST",
            body: JSON.stringify({
              project_id: targetProj,
              strategy_mode: options?.overrideStrategy || strategyMode,
              wot_lots_per_wave:
                options?.overrideWotLotsPerWave ?? wotLotsPerWave,
              lead_time_buffer_days:
                options?.overrideBufferDays ?? leadTimeBufferDays,
            }),
          },
          user?.username,
        );

        if (res.ok && res.data) {
          setSimulatedPlan(res.data);
          if (
            options?.overrideWotLotsPerWave === undefined &&
            res.data.wot_lots_per_wave
          ) {
            setWotLotsPerWave(Number(res.data.wot_lots_per_wave));
          }
        }
      } catch (err) {
        console.error("Failed to calculate wave schedule:", err);
      } finally {
        setIsSimulating(false);
      }
    },
    [
      selectedProjectId,
      strategyMode,
      wotLotsPerWave,
      leadTimeBufferDays,
      user?.username,
    ],
  );

  // Auto-simulate when project is selected so the locked GANTT is immediately ready
  useEffect(() => {
    if (selectedProjectId && !activeSavedPlanId && !simulatedPlan && !isSimulating) {
      runSimulation({ overrideProjectId: selectedProjectId });
    }
  }, [selectedProjectId, activeSavedPlanId, simulatedPlan, isSimulating, runSimulation]);

  const applyBatchWaveUpdatesToPlan = useCallback(
    (
      basePlan: any,
      updates: {
        waveNumber: number;
        newOrderDate: string;
        newArrivalDate: string;
      }[],
    ) => {
      if (!basePlan || !Array.isArray(basePlan.waves)) return basePlan;
      const todayIso = new Date().toISOString().split("T")[0];
      const updateMap = new Map(updates.map((u) => [u.waveNumber, u]));

      const updatedWaves = basePlan.waves.map((w: any) => {
        const match = updateMap.get(Number(w.wave_number));
        if (!match) return w;
        const orderDate = match.newOrderDate;
        const arrivalDate = match.newArrivalDate;
        const maxLt = Number(w.max_lead_time_days || 4);
        const nextWave = {
          ...w,
          target_order_date: orderDate,
          target_arrival_date: arrivalDate,
        };
        const prodNeedDate = nextWave.production_need_date || arrivalDate;
        const feasibleOrder = orderDate < todayIso ? todayIso : orderDate;
        const feasibleArrival = addDaysClientIso(feasibleOrder, maxLt);
        const plannedSlack = daysBetweenClientIso(arrivalDate, prodNeedDate);
        const feasibleSlack = daysBetweenClientIso(
          feasibleArrival,
          prodNeedDate,
        );
        const delayDays = Math.max(0, -feasibleSlack, -plannedSlack);
        const isBottleneck =
          feasibleArrival > prodNeedDate || arrivalDate > prodNeedDate;
        const severity: "CRITICAL" | "WARNING" | "OPTIMAL" = isBottleneck
          ? "CRITICAL"
          : orderDate < todayIso || feasibleSlack < leadTimeBufferDays
            ? "WARNING"
            : "OPTIMAL";

        nextWave.is_expedite_required = orderDate < todayIso;
        nextWave.feasible_order_date = feasibleOrder;
        nextWave.feasible_arrival_date = feasibleArrival;
        nextWave.planned_slack_days = plannedSlack;
        nextWave.feasible_slack_days = feasibleSlack;
        nextWave.bottleneck_delay_days = delayDays;
        nextWave.is_bottleneck = isBottleneck;
        nextWave.bottleneck_severity = severity;
        return nextWave;
      });

      return {
        ...basePlan,
        waves: updatedWaves,
      };
    },
    [leadTimeBufferDays],
  );

  const handleBatchWaveDateChange = useCallback(
    (
      updates: {
        waveNumber: number;
        newOrderDate: string;
        newArrivalDate: string;
      }[],
    ) => {
      if (updates.length === 0) return;
      const savedPlanObj = savedPlans.find((p) => p.id === activeSavedPlanId);
      const sourcePlan = simulatedPlan || savedPlanObj;
      if (!sourcePlan) return;

      if (activeSavedPlanId) {
        setActiveSavedPlanId(null);
        setIsRevisionEditMode(true);
      }
      setSimulatedPlan(applyBatchWaveUpdatesToPlan(sourcePlan, updates));
    },
    [simulatedPlan, savedPlans, activeSavedPlanId, applyBatchWaveUpdatesToPlan],
  );

  const handleWaveDateChange = useCallback(
    (waveNumber: number, orderDate: string, arrivalDate: string) => {
      handleBatchWaveDateChange([
        {
          waveNumber,
          newOrderDate: orderDate,
          newArrivalDate: arrivalDate,
        },
      ]);
    },
    [handleBatchWaveDateChange],
  );

  const handleApplyVendorSlipSimulation = useCallback(
    (slipDays: number) => {
      setVendorSlipSimDays(slipDays);
      if (slipDays === 0) {
        runSimulation({ overrideProjectId: selectedProjectId });
        return;
      }
      const savedPlanObj = savedPlans.find((p) => p.id === activeSavedPlanId);
      const sourceWaves = (simulatedPlan?.waves || savedPlanObj?.waves || []) as any[];
      if (!sourceWaves.length) return;
      const todayIso = new Date().toISOString().split("T")[0];
      const basePlan = simulatedPlan || savedPlanObj;

      const updatedWaves = sourceWaves.map((w: any) => {
        if (w.status === "GRN_RECEIVED") return w;
        const baseOrder = w.target_order_date || todayIso;
        const baseArrival = w.target_arrival_date || todayIso;
        const slippedArrival = addDaysClientIso(baseArrival, slipDays);
        const prodNeedDate = w.production_need_date || baseArrival;
        const plannedSlack = daysBetweenClientIso(slippedArrival, prodNeedDate);
        const delayDays = Math.max(0, -plannedSlack);
        const isBottleneck = slippedArrival > prodNeedDate;
        const severity: "CRITICAL" | "WARNING" | "OPTIMAL" = isBottleneck
          ? "CRITICAL"
          : plannedSlack < leadTimeBufferDays
          ? "WARNING"
          : "OPTIMAL";

        return {
          ...w,
          target_order_date: baseOrder,
          target_arrival_date: slippedArrival,
          feasible_arrival_date: slippedArrival,
          planned_slack_days: plannedSlack,
          feasible_slack_days: plannedSlack,
          bottleneck_delay_days: delayDays,
          is_bottleneck: isBottleneck,
          bottleneck_severity: severity,
        };
      });

      setActiveSavedPlanId(null);
      setSimulatedPlan({
        ...basePlan,
        waves: updatedWaves,
      });
    },
    [
      simulatedPlan,
      savedPlans,
      activeSavedPlanId,
      selectedProjectId,
      leadTimeBufferDays,
      runSimulation,
    ],
  );

  const handleAutoRealignSchedule = useCallback(() => {
    const savedPlanObj = savedPlans.find((p) => p.id === activeSavedPlanId);
    const sourceWaves = (simulatedPlan?.waves ||
      savedPlanObj?.waves ||
      []) as any[];
    if (!sourceWaves.length) return;

    const todayIso = new Date().toISOString().split("T")[0];
    const basePlan = simulatedPlan || savedPlanObj;

    const realignedWaves = sourceWaves.map((w: any) => {
      if (w.status === "GRN_RECEIVED") return w;
      const maxLt = Math.max(1, Number(w.max_lead_time_days || 4));
      const baseProdNeed =
        w.production_need_date ||
        addDaysClientIso(todayIso, maxLt + leadTimeBufferDays);

      // Desired arrival is leadTimeBufferDays prior to BOP station start
      let targetArrival = addDaysClientIso(baseProdNeed, -leadTimeBufferDays);
      let targetOrder = addDaysClientIso(targetArrival, -maxLt);
      let effectiveProdNeed = baseProdNeed;

      // If ideal order date is in the past, clamp order to today and ensure arrival precedes BOP start
      if (targetOrder < todayIso) {
        targetOrder = todayIso;
        targetArrival = addDaysClientIso(todayIso, maxLt);
        if (targetArrival > effectiveProdNeed) {
          effectiveProdNeed = addDaysClientIso(
            targetArrival,
            leadTimeBufferDays,
          );
        }
      }

      const plannedSlack = daysBetweenClientIso(
        targetArrival,
        effectiveProdNeed,
      );

      return {
        ...w,
        target_order_date: targetOrder,
        target_arrival_date: targetArrival,
        feasible_order_date: targetOrder,
        feasible_arrival_date: targetArrival,
        production_need_date: effectiveProdNeed,
        planned_slack_days: plannedSlack,
        feasible_slack_days: plannedSlack,
        bottleneck_delay_days: 0,
        is_bottleneck: false,
        is_expedite_required: false,
        bottleneck_severity:
          plannedSlack < leadTimeBufferDays ? "WARNING" : "OPTIMAL",
      };
    });

    setVendorSlipSimDays(0);
    setActiveSavedPlanId(null);
    setSimulatedPlan({
      ...basePlan,
      waves: realignedWaves,
    });
    showToast(
      `Schedule auto-realigned across ${realignedWaves.length} wave(s) with ${leadTimeBufferDays}d safety buffer`,
      "success",
    );
  }, [
    simulatedPlan,
    savedPlans,
    activeSavedPlanId,
    leadTimeBufferDays,
    showToast,
  ]);

  const handleWaveItemQtyChange = (
    waveNumber: number,
    itemIndex: number,
    newQty: number,
  ) => {
    if (!simulatedPlan) return;
    const validQty = Math.max(0.01, Number(newQty) || 0.01);

    setSimulatedPlan((prev: any) => {
      const updatedWaves = prev.waves.map((w: any) => {
        if (w.wave_number !== waveNumber) return w;
        const nextItems = w.items.map((it: any, idx: number) => {
          if (idx !== itemIndex) return it;
          const nextSubtotal = Math.round(
            validQty * Number(it.unit_price || 0),
          );
          return {
            ...it,
            allocated_wave_qty: validQty,
            subtotal_cost: nextSubtotal,
          };
        });
        const nextWaveQty = nextItems.reduce(
          (s: number, it: any) => s + Number(it.allocated_wave_qty || 0),
          0,
        );
        const nextWaveCost = nextItems.reduce(
          (s: number, it: any) => s + Number(it.subtotal_cost || 0),
          0,
        );

        return {
          ...w,
          items: nextItems,
          total_qty_units: nextWaveQty,
          estimated_cost: nextWaveCost,
        };
      });

      const totalLot = updatedWaves.reduce(
        (s: number, w: any) => s + Number(w.total_qty_units || 0),
        0,
      );
      const totalBudget = updatedWaves.reduce(
        (s: number, w: any) => s + Number(w.estimated_cost || 0),
        0,
      );

      return {
        ...prev,
        total_lot_qty: totalLot,
        total_estimated_budget: totalBudget,
        waves: updatedWaves,
      };
    });
  };

  const handleItemVendorChange = async (
    waveNumber: number,
    itemIndex: number,
    item: any,
    newSupplierId: string,
  ) => {
    const supObj = suppliers.find((s) => s.id === newSupplierId);

    if (
      activeSavedPlanId &&
      item.id &&
      !String(item.id).startsWith("PPI-SIM")
    ) {
      try {
        const res = await apiFetch(
          `/api/purchasing/procurement-plans/${activeSavedPlanId}/items/${item.id}/supplier`,
          {
            method: "PATCH",
            body: JSON.stringify({ supplier_id: newSupplierId || null }),
          },
          user?.username,
        );
        if (res.ok) {
          await fetchCandidatesAndPlans();
          showToast("Supplier updated", "success");
        }
      } catch (err) {
        console.error(err);
        showToast("Failed to update supplier", "error");
      }
      return;
    }

    setSimulatedPlan((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        waves: prev.waves.map((w: any) => {
          if (w.wave_number !== waveNumber) return w;
          return {
            ...w,
            items: w.items.map((it: any, idx: number) =>
              idx === itemIndex
                ? {
                    ...it,
                    preferred_supplier_id: supObj?.id || null,
                    preferred_supplier_name: supObj?.name || null,
                  }
                : it,
            ),
          };
        }),
      };
    });
  };

  const handleSavePlan = async () => {
    if (!simulatedPlan || !simulatedPlan.waves?.length) return;
    setIsSaving(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/procurement-plans",
        {
          method: "POST",
          body: JSON.stringify({
            project_id: simulatedPlan.project_id,
            project_name: simulatedPlan.project_name,
            spk_number: simulatedPlan.spk_number,
            plan_name: `Manufacturing Wave Plan — ${simulatedPlan.project_name}`,
            strategy_mode: simulatedPlan.strategy_mode,
            wot_lots_per_wave:
              Number(simulatedPlan.wot_lots_per_wave) || wotLotsPerWave,
            master_lot_size: Number(simulatedPlan.master_lot_size) || 10,
            total_wot_lots: Number(simulatedPlan.total_wot_lots) || 1,
            shift_hours: Number(simulatedPlan.shift_hours) || 8,
            factory_factor: Number(simulatedPlan.factory_factor) || 85,
            lead_time_buffer_days: leadTimeBufferDays,
            wave_interval_days: Number(simulatedPlan.wave_interval_days || 0),
            waves: simulatedPlan.waves,
          }),
        },
        user?.username,
      );

      if (res.ok && res.data?.id) {
        showToast(
          res.data.message ||
            `Strategy submitted! Plan ${res.data.plan_code} & Master PR ${res.data.master_pr_number || ""} routed to Requisition Queue (/requests) for Manager review.`,
          "success",
        );
        setSimulatedPlan(null);
        setIsRevisionEditMode(false);
        await fetchCandidatesAndPlans();
        setActiveSavedPlanId(res.data.id);
        onRefreshProcurementData();
      } else {
        showToast(res.error || "Failed to submit strategy", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to submit strategy", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlockForRevisionEdit = useCallback(() => {
    const savedPlanObj = savedPlans.find((p) => p.id === activeSavedPlanId);
    if (!savedPlanObj) return;
    setSimulatedPlan({
      ...savedPlanObj,
      waves: (savedPlanObj.waves || []).map((w: any) => ({
        ...w,
        items: (w.items || []).map((it: any) => ({ ...it })),
      })),
    });
    setActiveSavedPlanId(null);
    setIsRevisionEditMode(true);
    setIsStrategyPlanningActive(true);
    showToast(
      `Plan ${savedPlanObj.plan_code} unlocked for revision. Adjust waves on the GANTT or table and click "Resubmit Strategy".`,
      "info",
    );
  }, [savedPlans, activeSavedPlanId, showToast]);

  const handleRequestRevision = async () => {
    if (!activeSavedPlanId || !revisionNoteInput.trim()) {
      showToast("Please enter a revision note for the Procurement Planner", "error");
      return;
    }
    setIsRequestingRevision(true);
    try {
      const res = await apiFetch(
        `/api/purchasing/procurement-plans/${activeSavedPlanId}/request-revision`,
        {
          method: "POST",
          body: JSON.stringify({ revision_note: revisionNoteInput.trim() }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast(
          res.data?.message || "Strategy returned for revision",
          "success",
        );
        setIsRevisionModalOpen(false);
        setRevisionNoteInput("");
        await fetchCandidatesAndPlans();
        onRefreshProcurementData();
      } else {
        showToast(res.error || "Failed to return strategy for revision", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to return strategy for revision", "error");
    } finally {
      setIsRequestingRevision(false);
    }
  };

  const handlePushWaveToPr = async (planId: string, wave: any) => {
    setPushingPrWaveId(wave.id);
    try {
      const res = await apiFetch(
        `/api/purchasing/procurement-plans/${planId}/waves/${wave.id}/push-to-pr`,
        { method: "POST" },
        user?.username,
      );

      if (res.ok && res.data) {
        showToast(
          res.data.message ||
            `Wave ${wave.wave_number} synced to PR (${res.data.pr_number})`,
          "success",
        );
        await fetchCandidatesAndPlans();
        onRefreshProcurementData();
      } else {
        showToast(res.error || "Failed to push wave to PR", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to push wave to PR", "error");
    } finally {
      setPushingPrWaveId(null);
    }
  };

  const handlePushAllWavesToPr = async (planId: string) => {
    if (!planId || isPushingAllPr) return;
    setIsPushingAllPr(true);
    try {
      const res = await apiFetch(
        `/api/purchasing/procurement-plans/${planId}/push-all-to-pr`,
        { method: "POST" },
        user?.username,
      );

      if (res.ok && res.data) {
        showToast(
          res.data.message ||
            "All waves synced to PRs with planned delivery dates",
          "success",
        );
        await fetchCandidatesAndPlans();
        onRefreshProcurementData();
      } else {
        showToast(res.error || "Failed to sync waves to PRs", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to sync waves to PRs", "error");
    } finally {
      setIsPushingAllPr(false);
    }
  };

  const handleResetAllPlansToZero = async () => {
    try {
      const res = await apiFetch(
        "/api/purchasing/procurement-plans/reset-all",
        { method: "POST" },
        user?.username,
      );
      if (res.ok) {
        showToast(
          res.data?.message ||
            "All active plans reset and PR items returned to queue",
          "success",
        );
        setActiveSavedPlanId(null);
        setSimulatedPlan(null);
        setSelectedProjectId("");
        setIsStrategyPlanningActive(false);
        await fetchCandidatesAndPlans();
        onRefreshProcurementData();
      } else {
        showToast(res.error || "Failed to reset procurement plans", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to reset procurement plans", "error");
    }
  };

  const handleSyncWaveDatesToMaster = async (planId: string) => {
    if (!planId || isSyncingMasterDates) return;
    setIsSyncingMasterDates(true);
    try {
      const res = await apiFetch(
        `/api/purchasing/procurement-plans/${planId}/sync-master-dates`,
        { method: "POST" },
        user?.username,
      );
      if (res.ok) {
        showToast(
          res.data?.message || "Wave dates synchronized with Setup & Master",
          "success",
        );
        await fetchCandidatesAndPlans();
        onRefreshProcurementData();
      } else {
        showToast(res.error || "Failed to synchronize wave dates", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to synchronize wave dates", "error");
    } finally {
      setIsSyncingMasterDates(false);
    }
  };

  const handleAuthorizeMasterPr = async (planId: string) => {
    if (!planId || isAuthorizingMasterPr) return;
    setIsAuthorizingMasterPr(true);
    try {
      const res = await apiFetch(
        `/api/purchasing/procurement-plans/${planId}/authorize-master-pr`,
        { method: "POST" },
        user?.username,
      );
      if (res.ok) {
        showToast(
          res.data?.message ||
            `Master PR ${res.data?.master_pr_number || ""} authorized by Manager for PO release`,
          "success",
        );
        await fetchCandidatesAndPlans();
        onRefreshProcurementData();
      } else {
        showToast(res.error || "Failed to authorize Master PR", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to authorize Master PR", "error");
    } finally {
      setIsAuthorizingMasterPr(false);
    }
  };

  const handleRebalanceQuantities = async () => {
    if (activeSavedPlanId) {
      setIsRebalancingQty(true);
      try {
        const res = await apiFetch(
          `/api/purchasing/procurement-plans/${activeSavedPlanId}/rebalance-quantities`,
          { method: "POST" },
          user?.username,
        );
        if (res.ok) {
          showToast(
            res.data?.message ||
              "Wave quantities normalized to match 100% of baseline BOM/PR requirements",
            "success",
          );
          await fetchCandidatesAndPlans();
          onRefreshProcurementData();
        } else {
          showToast(res.error || "Failed to rebalance wave quantities", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Failed to rebalance wave quantities", "error");
      } finally {
        setIsRebalancingQty(false);
      }
      return;
    }

    // Client-side rebalance for uncommitted simulatedPlan
    if (!simulatedPlan || !Array.isArray(simulatedPlan.waves)) return;
    setSimulatedPlan((prev: any) => {
      if (!prev || !Array.isArray(prev.waves)) return prev;
      const itemMap = new Map<
        string,
        {
          baselineQty: number;
          entries: { waveIdx: number; itemIdx: number; qty: number }[];
        }
      >();

      prev.waves.forEach((w: any, wIdx: number) => {
        (w.items || []).forEach((it: any, iIdx: number) => {
          const code = String(it.item_code || it.item_name || "");
          const alloc = Number(it.allocated_wave_qty || 0);
          const base = Number(it.total_project_qty || alloc);
          if (!itemMap.has(code)) {
            itemMap.set(code, { baselineQty: base, entries: [] });
          }
          const grp = itemMap.get(code)!;
          if (base > grp.baselineQty) grp.baselineQty = base;
          grp.entries.push({ waveIdx: wIdx, itemIdx: iIdx, qty: alloc });
        });
      });

      const nextWaves = prev.waves.map((w: any) => ({
        ...w,
        items: (w.items || []).map((it: any) => ({ ...it })),
      }));

      for (const [, grp] of itemMap.entries()) {
        const currentSum = grp.entries.reduce((s, e) => s + e.qty, 0);
        if (Math.abs(currentSum - grp.baselineQty) <= 0.001) continue;
        let running = 0;
        grp.entries.forEach((e, idx) => {
          let nextVal = 0;
          if (idx === grp.entries.length - 1) {
            nextVal = Number(Math.max(0.01, grp.baselineQty - running).toFixed(2));
          } else if (currentSum > 0) {
            nextVal = Number(
              Math.max(0.01, (e.qty / currentSum) * grp.baselineQty).toFixed(2),
            );
            running += nextVal;
          } else {
            nextVal = Number(
              Math.max(0.01, grp.baselineQty / grp.entries.length).toFixed(2),
            );
            running += nextVal;
          }
          const targetItem = nextWaves[e.waveIdx].items[e.itemIdx];
          targetItem.allocated_wave_qty = nextVal;
          targetItem.subtotal_cost = Math.round(
            nextVal * Number(targetItem.unit_price || 0),
          );
        });
      }

      const recomputedWaves = nextWaves.map((w: any) => {
        const nextWaveQty = (w.items || []).reduce(
          (s: number, it: any) => s + Number(it.allocated_wave_qty || 0),
          0,
        );
        const nextWaveCost = (w.items || []).reduce(
          (s: number, it: any) => s + Number(it.subtotal_cost || 0),
          0,
        );
        return {
          ...w,
          total_qty_units: nextWaveQty,
          estimated_cost: nextWaveCost,
        };
      });

      return {
        ...prev,
        total_lot_qty: recomputedWaves.reduce(
          (s: number, w: any) => s + Number(w.total_qty_units || 0),
          0,
        ),
        total_estimated_budget: recomputedWaves.reduce(
          (s: number, w: any) => s + Number(w.estimated_cost || 0),
          0,
        ),
        waves: recomputedWaves,
      };
    });
    showToast(
      "Simulated wave quantities normalized to 100% of baseline requirement",
      "success",
    );
  };

  const displayedSavedPlan = savedPlans.find(
    (p) => p.id === activeSavedPlanId,
  );
  const activePlanView = displayedSavedPlan || simulatedPlan;
  const selectedCandidate = prCandidates.find(
    (c) => c.project_id === selectedProjectId,
  );

  const canViewPrPrices = canViewDocFinancials(user, "PR");
  const canAuthorizeMasterPr = useMemo(() => {
    if (!user) return false;
    const role = String(user.role || "").toUpperCase();
    const level = String(user.level || "").toUpperCase();
    const dept = String(user.department || "").toUpperCase();
    if (
      role === "ADMIN" ||
      role === "SUPER_ADMIN" ||
      role === "SUPERADMIN" ||
      role === "DIRECTOR" ||
      role === "BOD" ||
      role === "FC" ||
      role === "FINANCIAL_CONTROLLER" ||
      dept.includes("FINANCE") ||
      dept === "FC"
    ) {
      return true;
    }
    if (
      level === "MANAGER" ||
      role.includes("MANAGER") ||
      role.includes("HEAD") ||
      role.includes("LEAD") ||
      dept.includes("PROCUREMENT") ||
      dept.includes("PURCHASING")
    ) {
      return true;
    }
    return false;
  }, [user]);

  const computedWavesCount = activePlanView?.waves?.length || 0;
  const totalWotLots = Number(
    activePlanView?.total_wot_lots ??
      selectedCandidate?.total_wot_lots ??
      1,
  );
  const masterLotSize = Number(
    activePlanView?.master_lot_size ??
      selectedCandidate?.master_lot_size ??
      10,
  );
  const targetOrderQty = Number(
    activePlanView?.target_order_qty ??
      selectedCandidate?.target_order_qty ??
      masterLotSize * totalWotLots,
  );

  const wave1Obj =
    activePlanView?.waves?.find((w: any) => Number(w.wave_number) === 1) ||
    activePlanView?.waves?.[0] ||
    null;
  const masterStartDate =
    displayedSavedPlan?.master_start_date ||
    activePlanView?.master_start_date ||
    activePlanView?.wo_start_date ||
    selectedCandidate?.wo_start_date ||
    null;
  const masterEndDate =
    displayedSavedPlan?.master_end_date ||
    activePlanView?.master_end_date ||
    activePlanView?.wo_end_date ||
    selectedCandidate?.wo_end_date ||
    null;

  const isMasterCommitted = Boolean(
    activePlanView?.is_master_set ?? selectedCandidate?.is_master_set,
  );
  const isHorizonDrifted = Boolean(
    displayedSavedPlan?.is_horizon_drifted ||
      (displayedSavedPlan &&
        masterStartDate &&
        wave1Obj &&
        wave1Obj.status === "PLANNED" &&
        String(wave1Obj.production_need_date).slice(0, 10) !==
          String(masterStartDate).slice(0, 10)),
  );

  const criticalItemsTotal = Number(
    activePlanView?.critical_items_count ?? 0,
  );
  const coreItemsTotal = Number(activePlanView?.core_items_count ?? 0);
  const supportingItemsTotal = Number(
    activePlanView?.supporting_items_count ?? 0,
  );

  const mrpSummary =
    activePlanView?.mrp_summary || selectedCandidate?.mrp_summary || null;

  // Compute Reconciliation Matrix (from saved plan or live simulation waves)
  const computedReconciliationMatrix: ReconciliationRow[] = useMemo(() => {
    if (
      displayedSavedPlan &&
      Array.isArray(displayedSavedPlan.reconciliation_matrix) &&
      displayedSavedPlan.reconciliation_matrix.length > 0
    ) {
      return displayedSavedPlan.reconciliation_matrix;
    }
    if (!activePlanView?.waves || !Array.isArray(activePlanView.waves)) {
      return [];
    }
    const map = new Map<string, ReconciliationRow>();
    for (const w of activePlanView.waves) {
      for (const it of w.items || []) {
        const code = String(it.item_code || it.item_name || "ITEM");
        const alloc = Number(it.allocated_wave_qty || 0);
        const base = Number(it.total_project_qty || alloc);
        if (!map.has(code)) {
          map.set(code, {
            item_code: code,
            item_name: it.item_name || code,
            uom: it.uom || "PCS",
            product_node_name: it.product_node_name || null,
            baseline_required_qty: base,
            total_allocated_qty: 0,
            variance_qty: 0,
            is_balanced: true,
            wave_splits: [],
          });
        }
        const entry = map.get(code)!;
        if (base > entry.baseline_required_qty) {
          entry.baseline_required_qty = base;
        }
        entry.total_allocated_qty = Number(
          (entry.total_allocated_qty + alloc).toFixed(2),
        );
        entry.wave_splits.push({
          wave_number: Number(w.wave_number),
          station_focus: w.station_focus || `Wave ${w.wave_number}`,
          allocated_qty: alloc,
          target_arrival_date: w.target_arrival_date || "",
          wave_status: w.status || "PLANNED",
        });
      }
    }
    return Array.from(map.values()).map((r) => {
      const variance = Number(
        (r.total_allocated_qty - r.baseline_required_qty).toFixed(2),
      );
      return {
        ...r,
        variance_qty: variance,
        is_balanced: Math.abs(variance) <= 0.01,
      };
    });
  }, [displayedSavedPlan, activePlanView]);

  // Compute Consolidated Master PR Schedule Lines & Summary
  const computedMasterPrSummary = useMemo(() => {
    const backendSummary = displayedSavedPlan?.master_pr_summary;
    const waves = Array.isArray(activePlanView?.waves)
      ? activePlanView.waves
      : [];

    const masterPrNumber =
      backendSummary?.master_pr_number ||
      displayedSavedPlan?.master_pr_number ||
      (displayedSavedPlan?.plan_code
        ? `PR-${displayedSavedPlan.plan_code}`
        : `PR-WAVE-DRAFT-${String(activePlanView?.project_id || "SIM").slice(-4).toUpperCase()}`);

    const masterPrStatus: string =
      backendSummary?.master_pr_status ||
      (waves.some((w: any) => w.status === "PO_ISSUED" || w.status === "GRN_RECEIVED")
        ? "ORDERED"
        : waves.some((w: any) => w.status === "PR_AUTHORIZED")
          ? "AUTHORIZED"
          : waves.some((w: any) => w.status === "PR_DRAFTED" || w.status === "PR_PUSHED")
            ? "DRAFTED"
            : "UNSYNCED");

    const prLinesMap = new Map<string, any>();
    if (Array.isArray(backendSummary?.pr_lines)) {
      for (const pl of backendSummary.pr_lines) {
        if (pl.plan_wave_id && pl.item_code) {
          prLinesMap.set(`${pl.plan_wave_id}::${pl.item_code}`, pl);
        }
      }
    }

    const lines: MasterPrPreviewLine[] = [];
    for (const w of waves) {
      const wStatus = String(w.status || "PLANNED");
      for (const it of w.items || []) {
        const matchedPrLine = w.id
          ? prLinesMap.get(`${w.id}::${it.item_code}`)
          : null;
        let lineStatus: MasterPrPreviewLine["line_status"] = "UNSYNCED";
        if (wStatus === "GRN_RECEIVED" || matchedPrLine?.status === "RECEIVED") {
          lineStatus = "GRN_RECEIVED";
        } else if (
          wStatus === "PO_ISSUED" ||
          it.po_id ||
          matchedPrLine?.po_id
        ) {
          lineStatus = "PO_LINKED";
        } else if (
          wStatus === "PR_AUTHORIZED" ||
          masterPrStatus === "AUTHORIZED" ||
          matchedPrLine?.status === "AUTHORIZED"
        ) {
          lineStatus = "PR_AUTHORIZED";
        } else if (
          wStatus === "PR_DRAFTED" ||
          wStatus === "PR_PUSHED" ||
          Boolean(matchedPrLine)
        ) {
          lineStatus = "PR_DRAFTED";
        }

        lines.push({
          id: it.id || `${w.wave_number}-${it.item_code}`,
          wave_number: Number(w.wave_number),
          station_focus: w.station_focus || `Wave ${w.wave_number}`,
          lot_split_label:
            matchedPrLine?.lot_split_label ||
            `Wave ${w.wave_number} (${w.wot_lot_range || w.station_focus})`,
          item_code: it.item_code || "",
          item_name: it.item_name || "",
          spec: [it.dimension, it.spec].filter(Boolean).join(" · "),
          uom: it.uom || "PCS",
          product_node_name: it.product_node_name || null,
          preferred_supplier_name:
            it.preferred_supplier_name ||
            matchedPrLine?.preferred_supplier_name ||
            suppliers[0]?.name ||
            null,
          order_release_date: w.target_order_date || null,
          expected_delivery_date:
            matchedPrLine?.expected_delivery_date ||
            w.target_arrival_date ||
            "",
          production_need_date: w.production_need_date || null,
          allocated_wave_qty: Number(it.allocated_wave_qty || 0),
          baseline_required_qty: Number(
            it.total_project_qty || it.allocated_wave_qty || 0,
          ),
          unit_price: Number(it.unit_price || 0),
          subtotal_cost: Number(it.subtotal_cost || 0),
          line_status: lineStatus,
          po_number: it.po_number || matchedPrLine?.po_number || null,
        });
      }
    }

    const syncedWavesCount = waves.filter(
      (w: any) => w.status && w.status !== "PLANNED",
    ).length;

    return {
      masterPrId: backendSummary?.master_pr_id || displayedSavedPlan?.master_pr_id || null,
      masterPrNumber,
      masterPrStatus,
      syncedWavesCount,
      totalWavesCount: waves.length,
      lines,
      createdAt: backendSummary?.master_pr_created_at || displayedSavedPlan?.created_at || null,
      requesterName: backendSummary?.master_pr_requester || displayedSavedPlan?.created_by || null,
    };
  }, [displayedSavedPlan, activePlanView, suppliers]);

  const ganttRows: WaveGanttRow[] = useMemo(() => {
    if (!activePlanView?.waves || !Array.isArray(activePlanView.waves)) return [];
    return activePlanView.waves.map((w: any) => ({
      id: w.id || `wave-${w.wave_number}`,
      wave_number: Number(w.wave_number),
      station_focus: w.station_focus || `Stage ${w.wave_number}`,
      bop_process_summary: w.bop_process_summary || "",
      target_order_date: w.target_order_date || new Date().toISOString().split("T")[0],
      target_arrival_date: w.target_arrival_date || new Date().toISOString().split("T")[0],
      feasible_arrival_date: w.feasible_arrival_date,
      production_need_date: w.production_need_date || w.target_arrival_date,
      process_end_date: w.process_end_date,
      max_lead_time_days: Number(w.max_lead_time_days || 4),
      process_duration_days: Number(w.process_duration_days || 2),
      wot_lot_range: w.wot_lot_range,
      total_qty_units: Number(w.total_qty_units || 0),
      estimated_cost: Number(w.estimated_cost || 0),
      status: w.status,
      items: Array.isArray(w.items)
        ? w.items.map((it: any) => ({
            id: it.id || it.item_code,
            item_code: it.item_code || "",
            item_name: it.item_name || "",
            uom: it.uom || "PCS",
            allocated_wave_qty: Number(it.allocated_wave_qty || 0),
            unit_price: Number(it.unit_price || 0),
            subtotal_cost: Number(it.subtotal_cost || 0),
            lead_time_days: Number(it.lead_time_days || 4),
            station_code: it.station_code || "",
            station_need_date: it.station_need_date || w.production_need_date,
            process_step_name: it.process_step_name || "",
            product_node_name: it.product_node_name,
            priority_tier: it.priority_tier,
            preferred_supplier_name: it.preferred_supplier_name,
          }))
        : [],
    }));
  }, [activePlanView]);

  const hasActivePlanData =
    Boolean(activePlanView) &&
    Array.isArray(activePlanView?.waves) &&
    activePlanView.waves.length > 0;

  return (
    <div className="space-y-4">
      {/* 
        ========================================================================
        TOP HEAD BAR: Project Selector Dropdown Only (No "Run Engine" button)
        ========================================================================
      */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          {/* Left: Project Selector Only */}
          <div className="flex-1 min-w-[260px] max-w-md">
            <label
              htmlFor="project-selector"
              className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1"
            >
              Manufacturing Project
            </label>
            <select
              id="project-selector"
              ref={projectSelectRef}
              value={selectedProjectId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedProjectId(nextId);
                setSimulatedPlan(null);
                setIsStrategyPlanningActive(false);
                if (nextId) {
                  const matchingPlan = savedPlans.find(
                    (p) => p.project_id === nextId,
                  );
                  if (matchingPlan) {
                    setActiveSavedPlanId(matchingPlan.id);
                  } else {
                    setActiveSavedPlanId(null);
                  }
                } else {
                  setActiveSavedPlanId(null);
                }
              }}
              className="no-base-style w-full h-9 px-3 text-xs bg-white dark:bg-stone-850 border border-stone-300 dark:border-stone-700 rounded-lg font-semibold text-stone-900 dark:text-stone-100 focus:border-stone-500 focus:outline-none"
            >
              <option value="">-- Select Manufacturing Project --</option>
              {prCandidates.map((cand) => (
                <option key={cand.project_id} value={cand.project_id}>
                  {cand.spk_number ? `[${cand.spk_number}] ` : ""}
                  {cand.project_name}
                  {cand.pending_item_count > 0 ? ` (${cand.pending_item_count} items)` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Right: Strategy Actions (Active in Strategy Mode or locked shortcuts) */}
          <div className="flex flex-wrap items-center gap-2 sm:self-end">
            {hasActivePlanData && (
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Eye className="w-3.5 h-3.5" />}
                onClick={() => setIsPrPreviewOpen(true)}
                className="text-xs font-semibold"
                title="Preview Printable A4 Procurement Plan Document"
              >
                Preview Document
              </Button>
            )}

            {hasActivePlanData && isStrategyPlanningActive && (
              <>
                {!activeSavedPlanId ? (
                  <Button
                    size="sm"
                    variant="primary"
                    isLoading={isSaving}
                    leftIcon={<Check className="w-3.5 h-3.5" />}
                    onClick={handleSavePlan}
                    className="text-xs font-semibold"
                    title="Submit Procurement Wave Strategy"
                  >
                    {isRevisionEditMode
                      ? "Resubmit Strategy"
                      : "Submit Strategy"}
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                      onClick={handleUnlockForRevisionEdit}
                      className="text-xs font-semibold"
                      title="Unlock waves to revise schedule or quantities and resubmit strategy"
                    >
                      Revise Waves
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={isSyncingMasterDates}
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      onClick={() => handleSyncWaveDatesToMaster(activeSavedPlanId)}
                      className="text-xs font-semibold"
                      title="Auto-sync Procurement Wave target dates with PPIC Setup & Master"
                    >
                      Auto-Sync PPIC Dates
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={isPushingAllPr}
                      leftIcon={<Send className="w-3.5 h-3.5" />}
                      onClick={() => handlePushAllWavesToPr(activeSavedPlanId)}
                      className="text-xs font-semibold"
                    >
                      Re-Sync PR
                    </Button>
                    {computedMasterPrSummary.masterPrStatus === "DRAFTED" &&
                      canAuthorizeMasterPr && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setIsRevisionModalOpen(true)}
                            className="text-xs font-semibold border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                          >
                            Return for Revision
                          </Button>
                          <Button
                            size="sm"
                            variant="dark"
                            isLoading={isAuthorizingMasterPr}
                            leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}
                            onClick={() =>
                              handleAuthorizeMasterPr(activeSavedPlanId)
                            }
                            className="text-xs font-semibold"
                          >
                            Authorize Plan
                          </Button>
                        </>
                      )}
                  </>
                )}

                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<X className="w-3.5 h-3.5" />}
                  onClick={() => setIsStrategyPlanningActive(false)}
                  className="text-xs"
                  title="Return to read-only baseline view"
                >
                  Exit Planning
                </Button>
              </>
            )}

            {savedPlans.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Trash2 className="w-3.5 h-3.5 text-stone-500" />}
                onClick={handleResetAllPlansToZero}
                className="text-xs text-stone-600 dark:text-stone-400 hover:text-red-700 hover:border-red-300"
                title="Reset all active plans back to zero queue"
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 
        ========================================================================
        BODY CONTENT: ZERO-STATE vs. LOADING vs. (LOCKED GANTT vs ACTIVE WORKSPACE)
        ========================================================================
      */}
      {isLoading || (isSimulating && !hasActivePlanData) ? (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl py-16 flex flex-col items-center justify-center gap-3 text-stone-500 dark:text-stone-400 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-stone-200 dark:border-stone-700 shadow-2xs">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <div className="text-xs font-bold text-stone-900 dark:text-stone-100">
              Loading Manufacturing Project Schedule
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 max-w-sm">
              Evaluating BOP routing, Product Card allocations, and supplier lead times...
            </p>
          </div>
        </div>
      ) : !selectedProjectId || !hasActivePlanData ? (
        /* Zero-state blueprint when no project selected */
        <BlueprintZeroState candidateCount={prCandidates.length} />
      ) : !isStrategyPlanningActive ? (
        /* 
          ======================================================================
          STATE A: LOCKED BASELINE GANTT PREVIEW (Single Make Strategy Plan action in header)
          ======================================================================
        */
        <InteractiveWaveGanttCanvas
          waves={ganttRows}
          projectName={activePlanView.project_name}
          spkNumber={activePlanView.spk_number}
          planCode={displayedSavedPlan?.plan_code || null}
          masterStartDate={masterStartDate}
          masterEndDate={masterEndDate}
          earliestFeasibleStart={
            activePlanView.gantt_correlation?.recommended_project_start_date
          }
          isLocked={true}
          onActivateStrategyPlanning={() => setIsStrategyPlanningActive(true)}
          onWaveDateChange={handleWaveDateChange}
        />
      ) : (
        /* 
          ======================================================================
          STATE B: UNLOCKED INTERACTIVE PROCUREMENT WAVE STRATEGY WORKSPACE
          Full interactive GANTT (drag & resize), live bottleneck insight panel,
          KPI strip, and supplier allocation table.
          ======================================================================
        */
        <div className="space-y-4">
          {/* Structured 4-Column ERP Standing & MRP Netting Strip */}
          <ProcurementStandingRibbon
            projectName={activePlanView.project_name}
            spkNumber={activePlanView.spk_number}
            displayedSavedPlan={displayedSavedPlan}
            masterStartDate={masterStartDate}
            masterEndDate={masterEndDate}
            isHorizonDrifted={isHorizonDrifted}
            isSyncingMasterDates={isSyncingMasterDates}
            onSyncWaveDatesToMaster={handleSyncWaveDatesToMaster}
            strategyMode={strategyMode}
            activeStrategyMode={activePlanView.strategy_mode}
            formatStrategyLabel={formatStrategyLabel}
            targetOrderQty={targetOrderQty}
            totalWotLots={totalWotLots}
            masterLotSize={masterLotSize}
            criticalItemsTotal={criticalItemsTotal}
            coreItemsTotal={coreItemsTotal}
            supportingItemsTotal={supportingItemsTotal}
            mrpSummary={mrpSummary}
            totalLotQty={Number(activePlanView.total_lot_qty || 0)}
            computedWavesCount={computedWavesCount}
            totalEstimatedBudget={Number(
              activePlanView.total_estimated_budget || 0,
            )}
            leadTimeBufferDays={leadTimeBufferDays}
          />

          {/* Strict BOP Product Card Allocation Gate Alert */}
          {Array.isArray(mrpSummary?.unallocated_bom_items) &&
            mrpSummary.unallocated_bom_items.length > 0 && (
              <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-xl px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                      BOP Product Card Allocation Gate:{" "}
                      {mrpSummary.unallocated_bom_items.length} BOM Material(s)
                      Held Back
                    </span>
                  </div>
                  <p className="text-amber-900/90 dark:text-amber-300/90 leading-relaxed">
                    Per manufacturing routing rules, BOM materials enter procurement waves once allocated to a{" "}
                    <strong className="font-mono">PRODUCT</strong> Card (e.g.{" "}
                    <strong className="font-mono">M-A</strong>,{" "}
                    <strong className="font-mono">M-B</strong>) linked to its consuming BOP process.
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {mrpSummary.unallocated_bom_items.map((ub: any) => (
                      <span
                        key={ub.bom_id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-stone-900 border border-amber-300 dark:border-amber-800 font-mono text-[11px] text-amber-950 dark:text-amber-200"
                      >
                        <strong>{ub.item_code}</strong> ({ub.item_name}):{" "}
                        <span className="text-rose-700 dark:text-rose-400 font-semibold">
                          {ub.unallocated_qty} {ub.uom} pending
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <Link
                  to="/engineering"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-semibold shrink-0 self-start lg:self-center"
                >
                  Allocate in BOP Editor
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

          {/* Manager Revision Loop Alert Banner */}
          {(displayedSavedPlan?.status === "REVISION" ||
            computedMasterPrSummary.masterPrStatus === "REVISION" ||
            isRevisionEditMode) && (
            <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    {isRevisionEditMode
                      ? "Revision Editing Active — Adjust Waves & Click 'Resubmit Strategy'"
                      : `Strategy Returned for Revision by Manager (${displayedSavedPlan?.revised_by || "Manager"})`}
                  </span>
                </div>
                {displayedSavedPlan?.revision_note && (
                  <p className="text-amber-900 dark:text-amber-300 font-medium">
                    Revision Note:{" "}
                    <strong className="font-mono">
                      &ldquo;{displayedSavedPlan.revision_note}&rdquo;
                    </strong>
                  </p>
                )}
                <p className="text-[11px] text-amber-800/90 dark:text-amber-400">
                  Unlock the wave schedule below to adjust target delivery dates,
                  quantities, or suppliers, then click{" "}
                  <strong>Resubmit Strategy</strong> to route the updated Master
                  PR back to Requisition Queue (<code>/requests</code>).
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {displayedSavedPlan ? (
                  <Button
                    size="xs"
                    variant="primary"
                    leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                    onClick={handleUnlockForRevisionEdit}
                  >
                    Unlock &amp; Edit Waves for Revision
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    variant="primary"
                    isLoading={isSaving}
                    leftIcon={<Check className="w-3.5 h-3.5" />}
                    onClick={handleSavePlan}
                  >
                    Resubmit Strategy to PR Queue
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Collapsible Bottleneck Diagnostic Strip */}
          <ProcurementBottleneckStrip
            liveBottleneckMetrics={liveBottleneckMetrics}
            computedWavesCount={computedWavesCount}
            masterStartDate={masterStartDate}
            masterEndDate={masterEndDate}
            earliestFeasibleStart={
              activePlanView.gantt_correlation?.recommended_project_start_date
            }
            isExpanded={isBottleneckExpanded}
            onToggleExpanded={() =>
              setIsBottleneckExpanded(!isBottleneckExpanded)
            }
            onAutoRealignFeasible={handleAutoRealignSchedule}
            onResetDatesToBaseline={() => {
              setVendorSlipSimDays(0);
              runSimulation({ overrideProjectId: selectedProjectId });
            }}
          />

          {/* ==================================================================
              UNIFIED WORKSPACE:
              Interactive GANTT Canvas + Master PR Output & Value Chain Center
             ================================================================== */}
          <div className="space-y-4">
            {/* Unlocked Interactive React Flow GANTT Canvas */}
            <div>
              <InteractiveWaveGanttCanvas
                waves={ganttRows}
                projectName={activePlanView.project_name}
                spkNumber={activePlanView.spk_number}
                planCode={displayedSavedPlan?.plan_code || null}
                masterStartDate={masterStartDate}
                masterEndDate={masterEndDate}
                earliestFeasibleStart={
                  activePlanView.gantt_correlation?.recommended_project_start_date
                }
                isLocked={false}
                onWaveDateChange={handleWaveDateChange}
                onBatchWaveDateChange={handleBatchWaveDateChange}
                onLiveBottleneckMetricsUpdate={setLiveBottleneckMetrics}
                selectedWaveNumbers={selectedWaveNumbers}
                onSelectedWavesChange={setSelectedWaveNumbers}
                strategyMode={strategyMode}
                onStrategyModeChange={(m) => {
                  setStrategyMode(m);
                  runSimulation({ overrideStrategy: m });
                }}
                wotLotsPerWave={wotLotsPerWave}
                totalWotLots={totalWotLots}
                onWotLotsPerWaveChange={(lots) => {
                  setWotLotsPerWave(lots);
                  runSimulation({ overrideWotLotsPerWave: lots });
                }}
                leadTimeBufferDays={leadTimeBufferDays}
                onLeadTimeBufferDaysChange={(buf) => {
                  setLeadTimeBufferDays(buf);
                  runSimulation({ overrideBufferDays: buf });
                }}
                vendorSlipSimDays={vendorSlipSimDays}
                onApplyVendorSlipSimulation={handleApplyVendorSlipSimulation}
                onAutoRealignSchedule={handleAutoRealignSchedule}
                onResetDatesToBaseline={() => {
                  setVendorSlipSimDays(0);
                  runSimulation({ overrideProjectId: selectedProjectId });
                }}
                activeSavedPlanId={activeSavedPlanId}
                isSaving={isSaving}
                onSavePlan={handleSavePlan}
                submitStrategyLabel={
                  isRevisionEditMode ? "Resubmit Strategy" : "Submit Strategy"
                }
                isSyncingMasterDates={isSyncingMasterDates}
                onSyncWaveDatesToMaster={handleSyncWaveDatesToMaster}
                isPushingAllPr={isPushingAllPr}
                onPushAllWavesToPr={handlePushAllWavesToPr}
              />
            </div>

            {/* Master PR Output, Reconciliation, Wave Editor & WOT Partial Delivery Center */}
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden shadow-2xs">
            {/* Top Master PR Lifecycle & Governance Header (Streamlined) */}
            <div className="bg-stone-50 dark:bg-stone-850 px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                  <h3 className="text-xs font-bold text-stone-900 dark:text-stone-100">
                    Master PR Output
                  </h3>
                  <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100">
                    {computedMasterPrSummary.masterPrNumber}
                  </span>

                  {/* Status Indicator */}
                  {computedMasterPrSummary.masterPrStatus === "UNSYNCED" ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-200/70 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono text-[10.5px]">
                      <Clock className="w-3 h-3" />
                      Unsynced
                    </span>
                  ) : computedMasterPrSummary.masterPrStatus === "DRAFTED" ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-mono text-[10.5px] font-semibold">
                      <Clock className="w-3 h-3" />
                      Draft PR (Pending Authorization)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono text-[10.5px] font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      Authorized ({computedMasterPrSummary.masterPrStatus})
                    </span>
                  )}

                  {/* Reconciliation Variance Flag */}
                  {!computedReconciliationMatrix.every((r) => r.is_balanced) && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-mono text-[10.5px] font-bold">
                      <AlertTriangle className="w-3 h-3" />
                      {computedReconciliationMatrix.filter((r) => !r.is_balanced).length} Variance(s)
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-stone-500 dark:text-stone-400 font-mono">
                  {computedMasterPrSummary.lines.length} schedule lines · {computedMasterPrSummary.syncedWavesCount}/{computedMasterPrSummary.totalWavesCount} waves synced to PR · Consolidates wave-split procurement for Department Manager sign-off
                </p>
              </div>

              {/* Right Action Controls (Streamlined, non-redundant) */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {computedReconciliationMatrix.some((r) => !r.is_balanced) && (
                  <Button
                    size="xs"
                    variant="outline"
                    isLoading={isRebalancingQty}
                    leftIcon={<Scale className="w-3.5 h-3.5 text-amber-600" />}
                    onClick={handleRebalanceQuantities}
                    className="border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                    title="Normalize wave split quantities back to 100% of baseline BOM/PR requirements"
                  >
                    Normalize Qty Variances
                  </Button>
                )}

                <button
                  type="button"
                  onClick={() => setShowItemsTable((p) => !p)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer"
                >
                  <span>{showItemsTable ? "Hide" : "Show"}</span>
                  {showItemsTable ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

                {/* Segmented Navigation Bar */}
                {showItemsTable && (
                  <>
                    <div className="px-4 py-2 bg-stone-100/70 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-stone-200/70 dark:bg-stone-850 border border-stone-300/80 dark:border-stone-800">
                        <button
                          type="button"
                          onClick={() => setActiveOutputTab("PR_OUTPUT_SCHEDULE")}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                            activeOutputTab === "PR_OUTPUT_SCHEDULE"
                              ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs"
                              : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>
                            Master PR Schedule ({computedMasterPrSummary.lines.length})
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setActiveOutputTab("RECONCILIATION_MATRIX")
                          }
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                            activeOutputTab === "RECONCILIATION_MATRIX"
                              ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs"
                              : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
                          }`}
                        >
                          <Scale className="w-3.5 h-3.5" />
                          <span>
                            Reconciliation ({computedReconciliationMatrix.length})
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveOutputTab("WAVE_ITEM_EDITOR")}
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                            activeOutputTab === "WAVE_ITEM_EDITOR"
                              ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs"
                              : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>
                            Wave Editor ({activePlanView.waves.length})
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setActiveOutputTab("PARTIAL_DELIVERY_CHAIN")
                          }
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                            activeOutputTab === "PARTIAL_DELIVERY_CHAIN"
                              ? "bg-indigo-600 text-white shadow-2xs"
                              : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
                          }`}
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>
                            WOT Partial Delivery &amp; Invoicing
                          </span>
                        </button>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] font-mono text-stone-600 dark:text-stone-400">
                        {selectedWaveNumbers.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
                            Filtered: {selectedWaveNumbers.map((n) => `W${n}`).join(", ")}{" "}
                            <button
                              type="button"
                              onClick={() => setSelectedWaveNumbers([])}
                              className="ml-1 underline cursor-pointer"
                            >
                              (Show All)
                            </button>
                          </span>
                        )}
                        <span>
                          Total Scheduled:{" "}
                          <strong className="text-stone-900 dark:text-stone-100">
                            {Number(activePlanView.total_lot_qty || 0).toLocaleString("en-US")} u
                          </strong>
                        </span>
                        <span>·</span>
                        <span>
                          Est. Master PR Value:{" "}
                          <strong className="text-stone-900 dark:text-stone-100">
                            {canViewPrPrices
                              ? formatIDR(activePlanView.total_estimated_budget || 0)
                              : CONFIDENTIAL_PRICE_MASK}
                          </strong>
                        </span>
                      </div>
                    </div>

                {/* ============================================================
                    TAB 1: MASTER PR OUTPUT SCHEDULE (WAVE-SPLIT PR LINES)
                   ============================================================ */}
                {activeOutputTab === "PR_OUTPUT_SCHEDULE" && (
                  <div className="divide-y divide-stone-200 dark:divide-stone-800">
                    {activePlanView.waves
                      .filter(
                        (wave: any) =>
                          selectedWaveNumbers.length === 0 ||
                          selectedWaveNumbers.includes(Number(wave.wave_number)),
                      )
                      .map((wave: any) => {
                      const waveLines = computedMasterPrSummary.lines.filter(
                        (l) => l.wave_number === Number(wave.wave_number),
                      );
                      const waveStatus = String(wave.status || "PLANNED");
                      const isWaveSynced = waveStatus !== "PLANNED";

                      return (
                        <div
                          key={`pr-output-wave-${wave.id || wave.wave_number}`}
                        >
                          {/* Per-Wave Subheader */}
                          <div className="bg-stone-50/70 dark:bg-stone-850/50 px-4 py-2 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold px-2 py-0.5 rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[11px]">
                                WAVE {wave.wave_number}
                              </span>
                              <span className="font-semibold text-stone-900 dark:text-stone-100">
                                {wave.station_focus}
                              </span>
                              {wave.wot_lot_range && (
                                <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400">
                                  ({wave.wot_lot_range})
                                </span>
                              )}

                              {/* Wave PR Sync Status Badge */}
                              {waveStatus === "GRN_RECEIVED" ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 font-mono text-[10px] font-bold">
                                  GRN RECEIVED
                                </span>
                              ) : waveStatus === "PO_ISSUED" ? (
                                <span className="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-900 dark:text-sky-300 font-mono text-[10px] font-bold">
                                  PO LINKED
                                </span>
                              ) : waveStatus === "PR_AUTHORIZED" ||
                                (isWaveSynced &&
                                  computedMasterPrSummary.masterPrStatus ===
                                    "AUTHORIZED") ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 font-mono text-[10px] font-bold">
                                  PR AUTHORIZED
                                </span>
                              ) : isWaveSynced ? (
                                <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-mono text-[10px] font-bold">
                                  DRAFT PR LINE SYNCED
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono text-[10px] font-semibold">
                                  UNSYNCED WAVE
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                              <span className="text-stone-600 dark:text-stone-400">
                                Order Release:{" "}
                                <strong className="text-stone-900 dark:text-stone-100">
                                  {wave.target_order_date}
                                </strong>
                              </span>
                              <span className="text-stone-300 dark:text-stone-700">·</span>
                              <span className="text-stone-600 dark:text-stone-400">
                                PR Delivery ETA:{" "}
                                <strong className="text-emerald-700 dark:text-emerald-400">
                                  {wave.target_arrival_date}
                                </strong>
                              </span>
                              <span className="text-stone-300 dark:text-stone-700">·</span>
                              <span className="text-stone-600 dark:text-stone-400">
                                Wave Subtotal:{" "}
                                <strong className="text-stone-900 dark:text-stone-100">
                                  {canViewPrPrices
                                    ? formatIDR(wave.estimated_cost || 0)
                                    : CONFIDENTIAL_PRICE_MASK}
                                </strong>
                              </span>

                              {displayedSavedPlan && (
                                <Button
                                  size="xs"
                                  variant={isWaveSynced ? "secondary" : "primary"}
                                  isLoading={pushingPrWaveId === wave.id}
                                  leftIcon={<Send className="w-3 h-3" />}
                                  onClick={() =>
                                    handlePushWaveToPr(
                                      displayedSavedPlan.id,
                                      wave,
                                    )
                                  }
                                >
                                  {isWaveSynced
                                    ? "Update Wave in Master PR"
                                    : "Sync Wave to Master PR"}
                                </Button>
                              )}
                            </div>
                          </div>

                          <Table className="border-0 rounded-none shadow-none">
                            <TableHeader>
                              <TableRow hoverable={false}>
                                <TableHead>PR Schedule Line</TableHead>
                                <TableHead>Material Code &amp; Spec</TableHead>
                                <TableHead>BOP Card / Station</TableHead>
                                <TableHead>Preferred Supplier</TableHead>
                                <TableHead className="text-right">
                                  PR Delivery Date
                                </TableHead>
                                <TableHead className="text-right">
                                  Wave Split Qty
                                </TableHead>
                                <TableHead className="text-right">
                                  Est. Line Cost
                                </TableHead>
                                <TableHead className="text-right">
                                  Line Status
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {waveLines.map((line, lIdx) => (
                                <TableRow key={line.id || lIdx}>
                                  <TableCell className="font-mono text-xs font-bold text-stone-700 dark:text-stone-300">
                                    <div>
                                      {computedMasterPrSummary.masterPrNumber}
                                    </div>
                                    <div className="text-[10px] text-stone-500">
                                      Line W{line.wave_number}.
                                      {String(lIdx + 1).padStart(2, "0")}
                                    </div>
                                  </TableCell>

                                  <TableCell>
                                    <div className="font-mono font-bold text-stone-900 dark:text-stone-100 text-xs">
                                      {line.item_code} — {line.item_name}
                                    </div>
                                    {line.spec && (
                                      <div className="text-[11px] text-stone-500 dark:text-stone-400">
                                        {line.spec}
                                      </div>
                                    )}
                                  </TableCell>

                                  <TableCell>
                                    {line.product_node_name ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-mono text-[11px] font-bold">
                                        Card {line.product_node_name}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-stone-700 dark:text-stone-300">
                                        {line.station_focus}
                                      </span>
                                    )}
                                  </TableCell>

                                  <TableCell className="text-xs font-medium text-stone-800 dark:text-stone-200">
                                    {line.preferred_supplier_name ||
                                      "Open / Purchasing Selection"}
                                  </TableCell>

                                  <TableCell className="text-right font-mono tabular-nums text-xs">
                                    <div className="font-bold text-emerald-800 dark:text-emerald-400">
                                      {line.expected_delivery_date}
                                    </div>
                                    {line.production_need_date && (
                                      <div className="text-[10px] text-stone-500">
                                        BOP Need: {line.production_need_date}
                                      </div>
                                    )}
                                  </TableCell>

                                  <TableCell className="text-right font-mono tabular-nums text-xs">
                                    <div className="font-bold text-stone-900 dark:text-stone-100">
                                      {line.allocated_wave_qty.toLocaleString(
                                        "en-US",
                                      )}{" "}
                                      {line.uom}
                                    </div>
                                    {line.baseline_required_qty &&
                                      line.baseline_required_qty >
                                        line.allocated_wave_qty && (
                                        <div className="text-[10px] text-stone-500">
                                          of{" "}
                                          {line.baseline_required_qty.toLocaleString(
                                            "en-US",
                                          )}{" "}
                                          {line.uom} total
                                        </div>
                                      )}
                                  </TableCell>

                                  <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-stone-900 dark:text-stone-100">
                                    {canViewPrPrices
                                      ? formatIDR(line.subtotal_cost || 0)
                                      : CONFIDENTIAL_PRICE_MASK}
                                  </TableCell>

                                  <TableCell className="text-right font-mono text-[11px]">
                                    {line.line_status === "PO_LINKED" ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-900 dark:text-sky-300 font-bold">
                                        {line.po_number || "PO LINKED"}
                                      </span>
                                    ) : line.line_status === "GRN_RECEIVED" ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 font-bold">
                                        GRN RECEIVED
                                      </span>
                                    ) : line.line_status === "PR_AUTHORIZED" ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                                        AUTHORIZED PR
                                      </span>
                                    ) : line.line_status === "PR_DRAFTED" ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold">
                                        DRAFT PR
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                                        UNSYNCED
                                      </span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ============================================================
                    TAB 2: INITIAL BOM/PR vs. WAVE-SPLIT RECONCILIATION MATRIX
                   ============================================================ */}
                {activeOutputTab === "RECONCILIATION_MATRIX" && (
                  <div>
                    <div className="px-4 py-2.5 bg-stone-50/70 dark:bg-stone-850/40 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="text-stone-600 dark:text-stone-400">
                        Audits each material&apos;s{" "}
                        <strong className="text-stone-900 dark:text-stone-100">
                          Initial BOM / PR Baseline Requirement
                        </strong>{" "}
                        against the sum of its{" "}
                        <strong className="text-stone-900 dark:text-stone-100">
                          Wave-Split Allocations
                        </strong>{" "}
                        to guarantee zero under-procurement or over-ordering.
                      </div>

                      <Button
                        size="xs"
                        variant={
                          computedReconciliationMatrix.some(
                            (r) => !r.is_balanced,
                          )
                            ? "primary"
                            : "outline"
                        }
                        isLoading={isRebalancingQty}
                        leftIcon={<Scale className="w-3.5 h-3.5" />}
                        onClick={handleRebalanceQuantities}
                      >
                        Normalize All Wave Splits to 100% Baseline
                      </Button>
                    </div>

                    <Table className="border-0 rounded-none shadow-none">
                      <TableHeader>
                        <TableRow hoverable={false}>
                          <TableHead>Material Code &amp; Name</TableHead>
                          <TableHead>BOP Card</TableHead>
                          <TableHead className="text-right">
                            Initial Baseline Qty
                          </TableHead>
                          <TableHead>Wave-Split Breakdown</TableHead>
                          <TableHead className="text-right">
                            Total Wave Sum
                          </TableHead>
                          <TableHead className="text-right">
                            Variance (Δ)
                          </TableHead>
                          <TableHead className="text-right">
                            Audit Status
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {computedReconciliationMatrix.map((row) => (
                          <TableRow key={row.item_code}>
                            <TableCell>
                              <div className="font-mono font-bold text-stone-900 dark:text-stone-100 text-xs">
                                {row.item_code}
                              </div>
                              <div className="text-xs text-stone-600 dark:text-stone-400">
                                {row.item_name}
                              </div>
                            </TableCell>

                            <TableCell>
                              {row.product_node_name ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-mono text-[11px] font-bold">
                                  Card {row.product_node_name}
                                </span>
                              ) : (
                                <span className="text-xs text-stone-500">
                                  BOP Direct
                                </span>
                              )}
                            </TableCell>

                            <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-stone-900 dark:text-stone-100">
                              {row.baseline_required_qty.toLocaleString("en-US")}{" "}
                              <span className="font-normal text-stone-500">
                                {row.uom}
                              </span>
                            </TableCell>

                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {row.wave_splits.map((ws, idx) => (
                                  <span
                                    key={`${row.item_code}-w${ws.wave_number}-${idx}`}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 font-mono text-[11px] text-stone-800 dark:text-stone-200"
                                  >
                                    <strong className="text-stone-900 dark:text-stone-100">
                                      W{ws.wave_number}:
                                    </strong>{" "}
                                    {ws.allocated_qty.toLocaleString("en-US")}{" "}
                                    {row.uom}
                                    <span className="text-[10px] text-stone-500">
                                      ({ws.target_arrival_date})
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </TableCell>

                            <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-stone-900 dark:text-stone-100">
                              {row.total_allocated_qty.toLocaleString("en-US")}{" "}
                              <span className="font-normal text-stone-500">
                                {row.uom}
                              </span>
                            </TableCell>

                            <TableCell className="text-right font-mono tabular-nums text-xs font-bold">
                              {row.is_balanced ? (
                                <span className="text-emerald-700 dark:text-emerald-400">
                                  0 {row.uom}
                                </span>
                              ) : (
                                <span
                                  className={
                                    row.variance_qty < 0
                                      ? "text-rose-700 dark:text-rose-400"
                                      : "text-amber-700 dark:text-amber-400"
                                  }
                                >
                                  {row.variance_qty > 0
                                    ? `+${row.variance_qty}`
                                    : row.variance_qty}{" "}
                                  {row.uom}
                                </span>
                              )}
                            </TableCell>

                            <TableCell className="text-right font-mono text-[11px]">
                              {row.is_balanced ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                                  <CheckCircle2 className="w-3 h-3" />
                                  BALANCED
                                </span>
                              ) : row.variance_qty < 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold">
                                  UNDER-ALLOCATED
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold">
                                  OVER-ALLOCATED
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* ============================================================
                    TAB 3: WAVE ITEM ALLOCATION & SUPPLIER ASSIGNMENT EDITOR
                   ============================================================ */}
                {activeOutputTab === "WAVE_ITEM_EDITOR" && (
                  <div className="divide-y divide-stone-200 dark:divide-stone-800">
                    {activePlanView.waves
                      .filter(
                        (wave: any) =>
                          selectedWaveNumbers.length === 0 ||
                          selectedWaveNumbers.includes(Number(wave.wave_number)),
                      )
                      .map((wave: any) => {
                      const isWavePushedOrExecuted =
                        wave.status && wave.status !== "PLANNED";

                      return (
                        <div key={wave.id || `wave-table-${wave.wave_number}`}>
                          <div className="bg-stone-50/50 dark:bg-stone-850/40 px-4 py-2 border-b border-stone-100 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                                Wave {wave.wave_number}
                              </span>
                              <span className="text-stone-300 dark:text-stone-700">
                                ·
                              </span>
                              <span className="font-semibold text-stone-800 dark:text-stone-200">
                                {wave.station_focus}
                              </span>
                              {wave.bop_process_summary && (
                                <span className="font-mono text-[11px] text-amber-900 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                                  {wave.bop_process_summary}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3 font-mono text-xs">
                              <span>
                                Delivery:{" "}
                                <strong className="text-emerald-800 dark:text-emerald-400">
                                  {wave.target_arrival_date}
                                </strong>
                              </span>
                              <span>·</span>
                              <span>
                                Cost:{" "}
                                <strong className="text-stone-900 dark:text-stone-100">
                                  {canViewPrPrices
                                    ? formatIDR(wave.estimated_cost || 0)
                                    : CONFIDENTIAL_PRICE_MASK}
                                </strong>
                              </span>

                              {displayedSavedPlan && (
                                <Button
                                  size="xs"
                                  variant={
                                    isWavePushedOrExecuted
                                      ? "secondary"
                                      : "primary"
                                  }
                                  isLoading={pushingPrWaveId === wave.id}
                                  leftIcon={<Send className="w-3 h-3" />}
                                  onClick={() =>
                                    handlePushWaveToPr(
                                      displayedSavedPlan.id,
                                      wave,
                                    )
                                  }
                                >
                                  {isWavePushedOrExecuted
                                    ? "Update Wave in Master PR"
                                    : "Sync Wave to Master PR"}
                                </Button>
                              )}
                            </div>
                          </div>

                          <Table className="border-0 rounded-none shadow-none">
                            <TableHeader>
                              <TableRow hoverable={false}>
                                <TableHead>Item Code &amp; Name</TableHead>
                                <TableHead>BOP Product Card</TableHead>
                                <TableHead>BOP Priority</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead className="text-right">
                                  Lead Time
                                </TableHead>
                                <TableHead className="text-right">
                                  Planned Delivery
                                </TableHead>
                                <TableHead className="text-right">
                                  Wave Qty
                                </TableHead>
                                <TableHead className="text-right">
                                  Subtotal
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(wave.items || []).map((it: any, idx: number) => {
                                const priorityVal: ManufacturingPriorityTier =
                                  it.priority_tier === "CRITICAL_MAIN" ||
                                  it.priority_tier === "SUPPORTING"
                                    ? it.priority_tier
                                    : "CORE_PROCESS";

                                return (
                                  <TableRow
                                    key={it.id || `${wave.wave_number}-${idx}`}
                                  >
                                    <TableCell>
                                      <div className="font-mono font-bold text-stone-900 dark:text-stone-100 text-xs">
                                        {it.item_code} — {it.item_name}
                                      </div>
                                      <div className="text-[11px] text-stone-500 dark:text-stone-400">
                                        {[
                                          it.source_pr_number,
                                          it.dimension,
                                          it.spec,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </div>
                                    </TableCell>

                                    <TableCell>
                                      {it.product_node_name ? (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-mono text-[11px] font-bold">
                                          Card {it.product_node_name}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-stone-700 dark:text-stone-300">
                                          {it.process_step_name ||
                                            "Manufacturing"}
                                        </span>
                                      )}
                                    </TableCell>

                                    <TableCell>
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${
                                          priorityVal === "CRITICAL_MAIN"
                                            ? "bg-amber-50/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                                            : priorityVal === "SUPPORTING"
                                              ? "bg-stone-100/60 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700"
                                              : "bg-sky-50/60 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800"
                                        }`}
                                      >
                                        {formatPriorityLabel(priorityVal)}
                                      </span>
                                    </TableCell>

                                    <TableCell>
                                      <select
                                        value={
                                          it.preferred_supplier_id ||
                                          suppliers[0]?.id ||
                                          ""
                                        }
                                        onChange={(e) =>
                                          handleItemVendorChange(
                                            wave.wave_number,
                                            idx,
                                            it,
                                            e.target.value,
                                          )
                                        }
                                        className="no-base-style h-7 px-2 text-xs bg-white dark:bg-stone-850 border border-stone-300 dark:border-stone-700 rounded text-stone-800 dark:text-stone-200 max-w-[170px]"
                                      >
                                        {suppliers.length === 0 && (
                                          <option value="">
                                            Default Supplier
                                          </option>
                                        )}
                                        {suppliers.map((sup) => (
                                          <option key={sup.id} value={sup.id}>
                                            {sup.name}
                                          </option>
                                        ))}
                                      </select>
                                    </TableCell>

                                    <TableCell className="text-right font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
                                      {Number(it.lead_time_days || 4)}d
                                    </TableCell>

                                    <TableCell className="text-right font-mono tabular-nums text-xs">
                                      <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                                        {wave.target_arrival_date}
                                      </span>
                                    </TableCell>

                                    <TableCell className="text-right font-mono tabular-nums font-bold text-stone-900 dark:text-stone-100">
                                      {!displayedSavedPlan ? (
                                        <div className="inline-flex items-center justify-end">
                                          <div className="flex h-7 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-850 overflow-hidden focus-within:border-stone-500">
                                            <input
                                              type="number"
                                              min={0.01}
                                              step="any"
                                              value={it.allocated_wave_qty}
                                              onChange={(e) =>
                                                handleWaveItemQtyChange(
                                                  wave.wave_number,
                                                  idx,
                                                  Number(e.target.value),
                                                )
                                              }
                                              className="no-base-style w-16 px-2 text-right font-mono text-xs bg-transparent text-stone-900 dark:text-stone-100 outline-none border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <span className="inline-flex items-center px-1.5 bg-stone-100 dark:bg-stone-800 border-l border-stone-200 dark:border-stone-700 text-[10px] font-mono text-stone-500 dark:text-stone-400">
                                              {it.uom}
                                            </span>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-xs">
                                          {Number(
                                            it.allocated_wave_qty,
                                          ).toLocaleString("en-US")}{" "}
                                          {it.uom}
                                        </span>
                                      )}
                                    </TableCell>

                                    <TableCell className="text-right font-mono tabular-nums">
                                      <div className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                                        {canViewPrPrices
                                          ? formatIDR(it.subtotal_cost || 0)
                                          : CONFIDENTIAL_PRICE_MASK}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ============================================================
                    TAB 4: END-TO-END WOT PARTIAL DELIVERY & CUSTOMER INVOICING
                   ============================================================ */}
                {activeOutputTab === "PARTIAL_DELIVERY_CHAIN" && (
                  <div className="p-4">
                    {displayedSavedPlan ? (
                      <PartialDeliveryValueChainPanel
                        planId={displayedSavedPlan.id}
                        selectedWaveNumbers={selectedWaveNumbers}
                        onDataUpdated={() => {
                          fetchCandidatesAndPlans();
                          onRefreshProcurementData();
                        }}
                      />
                    ) : (
                      <div className="bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 rounded-xl p-6 text-center space-y-3">
                        <Truck className="w-7 h-7 text-indigo-600 dark:text-indigo-400 mx-auto" />
                        <div className="text-xs font-bold text-stone-900 dark:text-stone-100">
                          Submit Strategy to Activate End-to-End WOT Partial
                          Delivery &amp; Flexible Customer Invoicing
                        </div>
                        <p className="text-xs text-stone-500 dark:text-stone-400 max-w-lg mx-auto">
                          Once you click <strong>Submit Strategy</strong>, each
                          Procurement Wave is bound to its WOT Lot Batch so QC
                          can release Finished Goods per wave, Logistics can
                          issue Partial Delivery Orders (DO), and Finance can
                          bill either per Partial DO or consolidated at the end.
                        </p>
                        <Button
                          size="sm"
                          variant="primary"
                          isLoading={isSaving}
                          leftIcon={<Check className="w-3.5 h-3.5" />}
                          onClick={handleSavePlan}
                        >
                          Submit Strategy Now
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Manager Return for Revision Modal (Standardized Modal Component) */}
      <Modal
        isOpen={isRevisionModalOpen}
        onClose={() => setIsRevisionModalOpen(false)}
        title="Return Strategy & Master PR for Revision"
        description="PROCUREMENT GOVERNANCE · REVISION WORKFLOW"
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsRevisionModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              isLoading={isRequestingRevision}
              onClick={handleRequestRevision}
            >
              Confirm Return for Revision
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            This will mark both the Master PR in Requisition Queue and this
            Procurement Wave Plan as <strong>REVISION</strong> so the planner
            can adjust wave schedules or quantities and resubmit.
          </p>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
              Revision Note / Instructions
            </label>
            <textarea
              rows={3}
              value={revisionNoteInput}
              onChange={(e) => setRevisionNoteInput(e.target.value)}
              placeholder="e.g., Please split Wave 1 into 2 smaller waves to reduce initial cash outlay..."
              className="input-elegant w-full p-2.5 text-xs rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-850 text-stone-900 dark:text-stone-100 outline-none focus:border-stone-500"
            />
          </div>
        </div>
      </Modal>

      {/* A4 Printable Master PR Document Preview Modal */}
      {hasActivePlanData && (
        <MasterPrOutputPreviewModal
          isOpen={isPrPreviewOpen}
          onClose={() => setIsPrPreviewOpen(false)}
          projectName={activePlanView.project_name}
          spkNumber={activePlanView.spk_number}
          planCode={displayedSavedPlan?.plan_code || null}
          strategyLabel={formatStrategyLabel(
            activePlanView.strategy_mode || strategyMode,
          )}
          masterPrNumber={computedMasterPrSummary.masterPrNumber}
          masterPrStatus={computedMasterPrSummary.masterPrStatus}
          createdAt={computedMasterPrSummary.createdAt}
          requesterName={computedMasterPrSummary.requesterName}
          lines={computedMasterPrSummary.lines}
          reconciliationMatrix={computedReconciliationMatrix}
          totalEstimatedBudget={Number(
            activePlanView.total_estimated_budget || 0,
          )}
          canAuthorizeMasterPr={canAuthorizeMasterPr}
          isAuthorizing={isAuthorizingMasterPr}
          onAuthorizeMasterPr={
            displayedSavedPlan
              ? () => handleAuthorizeMasterPr(displayedSavedPlan.id)
              : undefined
          }
          isPushingAllPr={isPushingAllPr}
          onSyncAllWavesToPr={
            displayedSavedPlan
              ? () => handlePushAllWavesToPr(displayedSavedPlan.id)
              : undefined
          }
          hasSavedPlan={Boolean(displayedSavedPlan)}
        />
      )}
    </div>
  );
};
