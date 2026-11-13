import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarRange,
  Search,
  Calendar,
  CheckCircle2,
  Sliders,
  RefreshCw,
  ExternalLink,
  X,
  Lock,
  Unlock,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Factory,
  Flag,
  Layers,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";

interface ActiveProjectItem {
  id: string;
  name: string;
  spk_number: string;
  customer_name: string;
  qty: number;
  lot_size: number;
  is_master_set: boolean;
  due_date: string;
  start_date?: string;
  urgency: string;
  priority: number;
  status: string;
  bop_status?: string;
  wot_count: number;
  completed_wot_count: number;
  bop_count: number;
  completed_bop_count: number;
  overall_progress: number;
  risk_level: "ON_TRACK" | "AT_RISK" | "CRITICAL_DELAY";
  estimated_completion_date?: string;
  uom?: string;
}

interface GanttBopBar {
  id: string;
  step_sequence: number;
  process_name: string;
  station_name: string;
  node_type?: string;
  is_qc_gate?: boolean;
  qc_params_count?: number;
  cycle_time_minutes?: number;
  status: string;
  start_date: string;
  end_date: string;
}

interface GanttProcurementBar {
  id: string;
  label: string;
  doc_ref: string;
  status: string;
  start_date: string;
  end_date: string;
  need_date: string;
  wot_lot_range: string;
}

interface MaterialReadinessStationCell {
  station_name: string;
  processes_count: number;
  qc_gates_count: number;
  wave_ref: string;
  wave_status: string;
  wave_eta: string;
  station_start: string;
  delay_days: number;
  readiness_status: "READY" | "PO_DELAY_RISK" | "STAGED_ON_TIME";
}

interface QcLoadSummary {
  qc_gates_count: number;
  total_qc_params: number;
  wot_qc_hours: number;
  order_qc_hours: number;
  qc_share_pct: number;
  is_qc_bottleneck: boolean;
}

interface GanttPipelineItem {
  project_id: string;
  project_name: string;
  spk_number: string;
  customer_name: string;
  bop_status: string;
  is_master_set: boolean;
  risk_level: "ON_TRACK" | "AT_RISK" | "CRITICAL_DELAY";
  overall_progress: number;
  qty: number;
  uom: string;
  lot_size: number;
  wot_count: number;
  production_start: string;
  production_end: string;
  due_date: string;
  bop_bars: GanttBopBar[];
  procurement_bars: GanttProcurementBar[];
  qc_load_summary?: QcLoadSummary;
  material_readiness_matrix?: MaterialReadinessStationCell[];
}

function shiftIsoDays(isoStr: string, addDays: number): string {
  if (!isoStr || addDays === 0) return isoStr;
  const d = new Date(`${String(isoStr).slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return isoStr;
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString().slice(0, 10);
}

interface StationLoadItem {
  stationId: string;
  stationName: string;
  loadPercentage: number;
  queuedProjectsCount: number;
}

interface CommandCenterData {
  kpi: {
    total_active_projects_count: number;
    needs_setup_projects_count: number;
    in_progress_projects_count: number;
    awaiting_bop_projects_count?: number;
    overall_confidence_score: number;
  };
  active_projects: ActiveProjectItem[];
  station_loads: StationLoadItem[];
  gantt_pipeline?: GanttPipelineItem[];
}

export function PpicPlanningHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState<CommandCenterData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Gantt Controls
  const [ganttTrackFilter, setGanttTrackFilter] = useState<
    "ALL" | "PRODUCTION" | "PROCUREMENT"
  >("ALL");
  const [ganttHorizonDays, setGanttHorizonDays] = useState<number>(21);
  const [vendorDelaySimDays, setVendorDelaySimDays] = useState<number>(0);
  const [expandedGanttProjects, setExpandedGanttProjects] = useState<
    Record<string, boolean>
  >({});

  // MPS Table Filters
  const [searchNtpQuery, setSearchNtpQuery] = useState("");
  const [readinessFilter, setReadinessFilter] = useState<string>("ALL");

  const fetchPlanningData = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(
        "/api/production/command-center",
        {},
        user?.username
      );
      if (res.ok && res.data) {
        const payload = res.data.data || res.data;
        setData(payload);
        // Auto-expand the first project in the Gantt chart for immediate clarity
        if (
          payload?.gantt_pipeline?.length > 0 &&
          Object.keys(expandedGanttProjects).length === 0
        ) {
          setExpandedGanttProjects({
            [payload.gantt_pipeline[0].project_id]: true,
          });
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load PPIC Planning Hub data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlanningData();
    const interval = setInterval(fetchPlanningData, 25000);
    return () => clearInterval(interval);
  }, []);

  const mfgProjects = useMemo(() => {
    if (!data?.active_projects) return [];
    const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];
    return data.active_projects.filter((p) => {
      const upperId = String(p.id || "").toUpperCase();
      const upperName = String(p.name || "").toUpperCase();
      return !(
        nonMfgIds.includes(upperId) ||
        upperName.includes("CONSUMABLE") ||
        upperName.includes("TRANSPORTATION") ||
        upperName.includes("OTHER PROCUREMENT") ||
        upperName.includes("OTHERS PROCUREMENT") ||
        upperName.includes("GENERAL PROCUREMENT")
      );
    });
  }, [data?.active_projects]);

  const filteredNtpProjects = useMemo(() => {
    return mfgProjects.filter((p) => {
      if (readinessFilter === "AWAITING_BOP") {
        if (
          p.bop_status === "AUTHORIZED" ||
          p.status === "COMPLETED" ||
          p.status === "FINISHED"
        ) {
          return false;
        }
      } else {
        if (p.bop_status !== "AUTHORIZED") return false;
      }

      if (readinessFilter === "NEEDS_SETUP") {
        if (
          p.is_master_set ||
          p.status === "COMPLETED" ||
          p.status === "FINISHED"
        )
          return false;
      } else if (readinessFilter === "COMMITTED") {
        if (
          !p.is_master_set ||
          p.status === "COMPLETED" ||
          p.status === "FINISHED"
        )
          return false;
      }

      if (searchNtpQuery.trim()) {
        const q = searchNtpQuery.toLowerCase();
        const mId = (p.id || "").toLowerCase().includes(q);
        const mName = (p.name || "").toLowerCase().includes(q);
        const mSpk = (p.spk_number || "").toLowerCase().includes(q);
        const mCust = (p.customer_name || "").toLowerCase().includes(q);
        if (!mId && !mName && !mSpk && !mCust) return false;
      }
      return true;
    });
  }, [mfgProjects, readinessFilter, searchNtpQuery]);

  // Compute Gantt Date Window & Columns (including Vendor Delay Impact Simulation)
  const ganttTimeline = useMemo(() => {
    const rawItems = (data?.gantt_pipeline || []).filter(
      (g) => g.bop_status === "AUTHORIZED"
    );

    const items = rawItems.map((it) => {
      if (vendorDelaySimDays <= 0) return it;
      const shiftedProcBars = it.procurement_bars.map((pb) => {
        const isReceived = pb.status === "GRN_RECEIVED" || pb.status === "READY";
        if (isReceived) return pb;
        return {
          ...pb,
          end_date: shiftIsoDays(pb.end_date, vendorDelaySimDays),
        };
      });

      const firstWaveEta = shiftedProcBars[0]?.end_date;
      const origStartMs = new Date(`${it.production_start}T00:00:00Z`).getTime();
      const simEtaMs = firstWaveEta ? new Date(`${firstWaveEta}T00:00:00Z`).getTime() : origStartMs;
      const cascadePushDays =
        !isNaN(origStartMs) && !isNaN(simEtaMs) && simEtaMs > origStartMs
          ? Math.max(0, Math.round((simEtaMs - origStartMs) / 86400000))
          : vendorDelaySimDays;

      const simProdStart = shiftIsoDays(it.production_start, cascadePushDays);
      const simProdEnd = shiftIsoDays(it.production_end, cascadePushDays);
      const dueMs = new Date(`${it.due_date}T00:00:00Z`).getTime();
      const simEndMs = new Date(`${simProdEnd}T00:00:00Z`).getTime();
      const simRisk: "ON_TRACK" | "AT_RISK" | "CRITICAL_DELAY" =
        !isNaN(dueMs) && !isNaN(simEndMs) && simEndMs > dueMs
          ? "CRITICAL_DELAY"
          : cascadePushDays > 0
          ? "AT_RISK"
          : it.risk_level;

      const shiftedBopBars = it.bop_bars.map((bb) => ({
        ...bb,
        start_date: shiftIsoDays(bb.start_date, cascadePushDays),
        end_date: shiftIsoDays(bb.end_date, cascadePushDays),
      }));

      const shiftedMatrix = (it.material_readiness_matrix || []).map((cell) => {
        if (cell.readiness_status === "READY") return cell;
        const nextEta = shiftIsoDays(cell.wave_eta, vendorDelaySimDays);
        const stMs = new Date(`${cell.station_start}T00:00:00Z`).getTime();
        const nextEtaMs = new Date(`${nextEta}T00:00:00Z`).getTime();
        const nextDelay =
          !isNaN(stMs) && !isNaN(nextEtaMs)
            ? Math.max(0, Math.round((nextEtaMs - stMs) / 86400000))
            : cell.delay_days + vendorDelaySimDays;
        return {
          ...cell,
          wave_eta: nextEta,
          delay_days: nextDelay,
          readiness_status: (nextDelay > 0 ? "PO_DELAY_RISK" : "STAGED_ON_TIME") as
            | "READY"
            | "PO_DELAY_RISK"
            | "STAGED_ON_TIME",
        };
      });

      return {
        ...it,
        production_start: simProdStart,
        production_end: simProdEnd,
        risk_level: simRisk,
        procurement_bars: shiftedProcBars,
        bop_bars: shiftedBopBars,
        material_readiness_matrix: shiftedMatrix,
      };
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startMs = today.getTime() - 4 * 86400000;
    const totalDays = Math.max(14, ganttHorizonDays);
    const endMs = startMs + totalDays * 86400000;

    const days: { dateStr: string; label: string; dayNum: string; isToday: boolean; isWeekend: boolean }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startMs + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getDay();
      days.push({
        dateStr: iso,
        label: d.toLocaleDateString("en-GB", { month: "short" }),
        dayNum: d.toLocaleDateString("en-GB", { day: "2-digit" }),
        isToday: d.getTime() === today.getTime(),
        isWeekend: dow === 0 || dow === 6,
      });
    }

    const toPct = (dateStr?: string) => {
      if (!dateStr) return 0;
      const ms = new Date(dateStr).getTime();
      if (isNaN(ms)) return 0;
      const pct = ((ms - startMs) / (endMs - startMs)) * 100;
      return Math.max(0, Math.min(100, pct));
    };

    const toBarStyle = (startStr?: string, endStr?: string) => {
      const left = toPct(startStr);
      const right = toPct(endStr);
      const width = Math.max(4, right - left);
      return {
        left: `${Math.min(96, left)}%`,
        width: `${Math.min(100 - Math.min(96, left), width)}%`,
      };
    };

    const todayPct = toPct(today.toISOString().slice(0, 10));

    return { items, days, toPct, toBarStyle, todayPct };
  }, [data?.gantt_pipeline, ganttHorizonDays, vendorDelaySimDays]);

  const authorizedCount = useMemo(
    () =>
      mfgProjects.filter(
        (p) =>
          p.bop_status === "AUTHORIZED" &&
          p.status !== "COMPLETED" &&
          p.status !== "FINISHED"
      ).length,
    [mfgProjects]
  );

  const needsSetupCount = useMemo(
    () =>
      mfgProjects.filter(
        (p) =>
          p.bop_status === "AUTHORIZED" &&
          !p.is_master_set &&
          p.status !== "COMPLETED" &&
          p.status !== "FINISHED"
      ).length,
    [mfgProjects]
  );

  const committedCount = useMemo(
    () =>
      mfgProjects.filter(
        (p) =>
          p.bop_status === "AUTHORIZED" &&
          p.is_master_set &&
          p.status !== "COMPLETED" &&
          p.status !== "FINISHED"
      ).length,
    [mfgProjects]
  );

  const awaitingBopCount = useMemo(
    () =>
      mfgProjects.filter(
        (p) =>
          p.bop_status !== "AUTHORIZED" &&
          p.status !== "COMPLETED" &&
          p.status !== "FINISHED"
      ).length,
    [mfgProjects]
  );

  const toggleExpandProject = (projectId: string) => {
    setExpandedGanttProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        title="PPIC Planning Hub"
        subtitle="Master production schedule & WOT planning"
        icon={<CalendarRange className="w-5 h-5" />}
        actions={
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={fetchPlanningData}
            disabled={isLoading}
            title="Refresh PPIC Planning Hub"
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
            />
          </Button>
        }
      />

      {/* 1. ERP Planning Telemetry Stat Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <StatCard
          title="MPS Active Orders"
          value={authorizedCount}
          subtitle="Authorized manufacturing orders"
          icon={<CalendarRange />}
          variant="amber"
        />
        <StatCard
          title="Draft Setup Queue"
          value={needsSetupCount}
          subtitle="Awaiting WOT lot setup"
          icon={<Unlock />}
          variant="warning"
        />
        <StatCard
          title="Committed to Floor"
          value={committedCount}
          subtitle="Released to active shop floor"
          icon={<Lock />}
          variant="success"
        />
        <StatCard
          title="Pending Tech BOP"
          value={awaitingBopCount}
          subtitle="Pending engineering signoff"
          icon={<ShieldCheck />}
          variant="blue"
        />
        <StatCard
          title="Schedule Confidence"
          value={`${data?.kpi?.overall_confidence_score ?? 88}%`}
          subtitle="CPM active & calibrated"
          icon={<Activity />}
          variant="emerald"
        />
      </div>

      {/* 2. Comprehensive Dual-Track Master Gantt Chart: Production Plan & Procurement Plan Pipeline */}
      <div className="bg-white border border-stone-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Main Gantt Header */}
        <div className="p-4 sm:p-5 border-b border-stone-200/80 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight">
                Master Gantt Pipeline
              </h2>
              <Badge variant="neutral" size="sm">
                {ganttTimeline.items.length} Active Pipelines
              </Badge>
            </div>
            <p className="text-xs text-stone-500 max-w-2xl leading-relaxed">
              Synchronize production schedules (WOT lot releases &amp; BOP workstation stages) directly with procurement delivery waves (PR / PO / GRN arrivals).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Track Selector Tabs */}
            <div className="inline-flex p-1 rounded-xl bg-stone-100 border border-stone-200/80 shadow-2xs">
              {(
                [
                  { id: "ALL", label: "Dual Track" },
                  { id: "PROCUREMENT", label: "Procurement" },
                  { id: "PRODUCTION", label: "Production" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setGanttTrackFilter(t.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    ganttTrackFilter === t.id
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-500 hover:text-stone-900"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Vendor Delay Impact Simulator */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 shadow-2xs">
              <span className="px-2 text-[10px] font-mono font-bold uppercase text-stone-600 dark:text-stone-300">
                Vendor Slip Sim:
              </span>
              {[0, 2, 5, 7, 10].map((simDays) => (
                <button
                  key={simDays}
                  type="button"
                  onClick={() => setVendorDelaySimDays(simDays)}
                  className={cn(
                    "px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer",
                    vendorDelaySimDays === simDays
                      ? simDays > 0
                        ? "bg-amber-600 text-white shadow-2xs"
                        : "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs"
                      : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                  )}
                  title={`Simulate +${simDays} days vendor delivery delay across procurement waves`}
                >
                  {simDays === 0 ? "0D" : `+${simDays}D`}
                </button>
              ))}
            </div>

            {/* Horizon Selector */}
            <div className="inline-flex p-1 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700 shadow-2xs">
              {[14, 21, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setGanttHorizonDays(days)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer",
                    ganttHorizonDays === days
                      ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs"
                      : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
                  )}
                >
                  {days}D
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Gantt Secondary Legend & Timeline Helper Bar */}
        <div className="px-4 py-2.5 bg-stone-50/70 dark:bg-stone-900/60 border-b border-stone-200/80 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 font-medium text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>
              {vendorDelaySimDays > 0
                ? `Simulating +${vendorDelaySimDays}d vendor delivery slip: cascading PO delays onto BOP stations & IPQC gates.`
                : "Interactive timeline: click bars to inspect procurement waves, IPQC gates, or lot setup."}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-stone-600 dark:text-stone-300">
            <span className="inline-flex items-center gap-1.5 bg-white dark:bg-stone-800 px-2 py-0.5 rounded-md border border-stone-200/80 dark:border-stone-700 shadow-2xs">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 inline-block shrink-0" />
              <span>Procurement Wave (PR / PO)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white dark:bg-stone-800 px-2 py-0.5 rounded-md border border-stone-200/80 dark:border-stone-700 shadow-2xs">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block shrink-0" />
              <span>Production Schedule (WOT / BOP)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white dark:bg-stone-800 px-2 py-0.5 rounded-md border border-stone-200/80 dark:border-stone-700 shadow-2xs">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-600 inline-block shrink-0" />
              <span>IPQC / FQC Gate</span>
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white dark:bg-stone-800 px-2 py-0.5 rounded-md border border-stone-200/80 dark:border-stone-700 shadow-2xs">
              <Flag className="w-3 h-3 text-rose-600 shrink-0" />
              <span>NTP Target Deadline</span>
            </span>
          </div>
        </div>

        {/* Gantt Matrix Body */}
        {ganttTimeline.items.length === 0 ? (
          <div className="p-10">
            <EmptyState
              icon={<CalendarRange className="w-6 h-6 text-stone-400" />}
              title="No Active Manufacturing Pipelines"
              description="Authorized manufacturing projects will appear here with synchronized procurement delivery waves and production timelines."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              {/* Calendar Header Row */}
              <div className="grid grid-cols-12 border-b border-stone-200 bg-stone-100/70 text-[10px] font-mono font-bold text-stone-500">
                <div className="col-span-4 px-4 py-2.5 border-r border-stone-200 flex items-center justify-between uppercase tracking-wider">
                  <span>Project / Pipeline Track</span>
                  <span>Lot / Status</span>
                </div>
                <div className="col-span-8 relative grid" style={{ gridTemplateColumns: `repeat(${ganttTimeline.days.length}, minmax(0, 1fr))` }}>
                  {ganttTimeline.days.map((d) => (
                    <div
                      key={d.dateStr}
                      className={cn(
                        "py-1.5 text-center border-r border-stone-200/60 last:border-r-0 select-none",
                        d.isToday
                          ? "bg-amber-100/80 text-amber-900 font-black"
                          : d.isWeekend
                          ? "bg-stone-200/40 text-stone-400"
                          : "text-stone-600"
                      )}
                    >
                      <div className="text-[9px] uppercase leading-tight">{d.label}</div>
                      <div className="text-[11px] leading-tight">{d.dayNum}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Project Pipeline Rows */}
              <div className="divide-y divide-stone-200">
                {ganttTimeline.items.map((item) => {
                  const isExpanded = Boolean(expandedGanttProjects[item.project_id]);
                  const prodBarStyle = ganttTimeline.toBarStyle(
                    item.production_start,
                    item.production_end
                  );
                  const deadlinePct = ganttTimeline.toPct(item.due_date);

                  return (
                    <div key={item.project_id} className="group bg-white">
                      {/* Parent Project Summary Row */}
                      <div className="grid grid-cols-12 hover:bg-stone-50/70 transition-colors">
                        {/* Left Column: Project Info */}
                        <div className="col-span-4 px-4 py-3 border-r border-stone-200 flex items-center justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => toggleExpandProject(item.project_id)}
                              className="mt-0.5 p-1 rounded hover:bg-stone-200/70 text-stone-500 hover:text-stone-900 cursor-pointer shrink-0"
                              title="Toggle BOP Stages & Procurement Waves"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] font-bold text-stone-900">
                                  {item.spk_number}
                                </span>
                                <span
                                  className={cn(
                                    "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                                    item.is_master_set
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-amber-50 text-amber-700 border border-amber-200"
                                  )}
                                >
                                  {item.is_master_set ? "Committed" : "Draft Setup"}
                                </span>
                              </div>
                              <div
                                onClick={() => navigate(`/ppic/projects/${item.project_id}`)}
                                className="text-xs font-bold text-stone-800 hover:underline truncate cursor-pointer mt-0.5"
                              >
                                {item.project_name}
                              </div>
                              <div className="text-[10px] text-stone-500 truncate">
                                {item.customer_name} · {item.qty} {item.uom}
                              </div>
                            </div>
                          </div>

                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => navigate(`/ppic/projects/${item.project_id}`)}
                            className="shrink-0 h-7 px-2 text-[10px]"
                          >
                            Setup
                          </Button>
                        </div>

                        {/* Right Column: Dual-Track Timeline Bars */}
                        <div className="col-span-8 relative py-2.5 px-0 flex flex-col justify-center gap-2">
                          {/* Background Grid Lines */}
                          <div
                            className="absolute inset-0 grid pointer-events-none"
                            style={{
                              gridTemplateColumns: `repeat(${ganttTimeline.days.length}, minmax(0, 1fr))`,
                            }}
                          >
                            {ganttTimeline.days.map((d) => (
                              <div
                                key={d.dateStr}
                                className={cn(
                                  "border-r border-stone-100 last:border-r-0 h-full",
                                  d.isWeekend && "bg-stone-50/70"
                                )}
                              />
                            ))}
                          </div>

                          {/* Live TODAY Vertical Line */}
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-amber-500/80 z-10 pointer-events-none"
                            style={{ left: `${ganttTimeline.todayPct}%` }}
                          />

                          {/* Deadline Marker */}
                          <div
                            className="absolute top-1 bottom-1 w-0.5 bg-rose-500/70 z-10 pointer-events-none"
                            style={{ left: `${deadlinePct}%` }}
                            title={`Target NTP Deadline: ${item.due_date}`}
                          >
                            <Flag className="w-3 h-3 text-rose-600 -ml-0.5 -mt-0.5" />
                          </div>

                          {/* Track 1: Procurement Plan Summary Bar */}
                          {(ganttTrackFilter === "ALL" ||
                            ganttTrackFilter === "PROCUREMENT") &&
                            item.procurement_bars.length > 0 && (
                              <div className="relative h-5 w-full">
                                {item.procurement_bars.map((pBar) => {
                                  const st = ganttTimeline.toBarStyle(
                                    pBar.start_date,
                                    pBar.end_date
                                  );
                                  return (
                                    <div
                                      key={pBar.id}
                                      onClick={() =>
                                        navigate(
                                          `/procurement-plan?project_id=${encodeURIComponent(
                                            item.project_id
                                          )}`
                                        )
                                      }
                                      style={st}
                                      title={`Procurement: ${pBar.label} (${pBar.start_date} to ${pBar.end_date})`}
                                      className="absolute top-0 h-5 rounded-md bg-blue-600/90 hover:bg-blue-700 text-white px-2 flex items-center justify-between text-[10px] font-medium shadow-2xs cursor-pointer overflow-hidden whitespace-nowrap z-20"
                                    >
                                      <span className="inline-flex items-center gap-1 truncate">
                                        <ShoppingCart className="w-2.5 h-2.5 shrink-0" />
                                        <span className="font-mono font-bold">
                                          {pBar.doc_ref}
                                        </span>
                                        <span className="opacity-90 truncate">
                                          · {pBar.label}
                                        </span>
                                      </span>
                                      <span className="font-mono text-[9px] bg-white/20 px-1 rounded ml-1 shrink-0">
                                        {pBar.status}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                          {/* Track 2: Production Plan Summary Bar */}
                          {(ganttTrackFilter === "ALL" ||
                            ganttTrackFilter === "PRODUCTION") && (
                            <div className="relative h-5 w-full">
                              <div
                                onClick={() =>
                                  navigate(`/ppic/projects/${item.project_id}`)
                                }
                                style={prodBarStyle}
                                title={`Production Plan: ${item.production_start} to ${item.production_end} (${item.overall_progress}% Complete)`}
                                className={cn(
                                  "absolute top-0 h-5 rounded-md text-white px-2 flex items-center justify-between text-[10px] font-medium shadow-2xs cursor-pointer overflow-hidden whitespace-nowrap z-20",
                                  item.risk_level === "CRITICAL_DELAY"
                                    ? "bg-rose-600 hover:bg-rose-700"
                                    : item.is_master_set
                                    ? "bg-emerald-600 hover:bg-emerald-700"
                                    : "bg-teal-600 hover:bg-teal-700"
                                )}
                              >
                                <span className="inline-flex items-center gap-1 truncate">
                                  <Factory className="w-2.5 h-2.5 shrink-0" />
                                  <span className="font-bold">
                                    Production ({item.wot_count || 1} WOT · Lot{" "}
                                    {item.lot_size})
                                  </span>
                                </span>
                                <span className="font-mono text-[9px] bg-white/20 px-1 rounded ml-1 shrink-0">
                                  {item.overall_progress}%
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded Sub-Tracks: Detailed Procurement Waves & BOP Station Bars */}
                      {isExpanded && (
                        <div className="bg-stone-50/70 border-t border-stone-200/70 divide-y divide-stone-200/50">
                          {/* Procurement Wave Sub-Rows */}
                          {(ganttTrackFilter === "ALL" ||
                            ganttTrackFilter === "PROCUREMENT") &&
                            item.procurement_bars.map((pBar) => {
                              const st = ganttTimeline.toBarStyle(
                                pBar.start_date,
                                pBar.end_date
                              );
                              return (
                                <div
                                  key={`sub-proc-${pBar.id}`}
                                  className="grid grid-cols-12 text-[11px]"
                                >
                                  <div className="col-span-4 pl-10 pr-4 py-1.5 border-r border-stone-200 flex items-center justify-between text-blue-900">
                                    <span className="truncate flex items-center gap-1.5">
                                      <ShoppingCart className="w-3 h-3 text-blue-600 shrink-0" />
                                      <span className="truncate">{pBar.label}</span>
                                    </span>
                                    <span className="font-mono text-[10px] text-blue-700 shrink-0">
                                      {pBar.wot_lot_range}
                                    </span>
                                  </div>
                                  <div className="col-span-8 relative py-1.5">
                                    <div
                                      style={st}
                                      className="relative h-4 rounded bg-blue-100 border border-blue-300 text-blue-900 px-2 flex items-center justify-between text-[9px] font-mono overflow-hidden whitespace-nowrap"
                                    >
                                      <span>
                                        Order: {pBar.start_date} → ETA: {pBar.end_date}
                                      </span>
                                      <span className="font-bold">{pBar.doc_ref}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                          {/* BOP Station & IPQC Gate Stage Sub-Rows */}
                          {(ganttTrackFilter === "ALL" ||
                            ganttTrackFilter === "PRODUCTION") &&
                            item.bop_bars.map((bBar) => {
                              const st = ganttTimeline.toBarStyle(
                                bBar.start_date,
                                bBar.end_date
                              );
                              const isQcGate = Boolean(bBar.is_qc_gate);
                              return (
                                <div
                                  key={`sub-bop-${bBar.id}`}
                                  className={cn(
                                    "grid grid-cols-12 text-[11px]",
                                    isQcGate && "bg-indigo-50/40 dark:bg-indigo-950/20"
                                  )}
                                >
                                  <div className="col-span-4 pl-10 pr-4 py-1.5 border-r border-stone-200 dark:border-stone-800 flex items-center justify-between text-stone-700 dark:text-stone-300">
                                    <span className="truncate flex items-center gap-1.5">
                                      {isQcGate ? (
                                        <ShieldCheck className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                      ) : (
                                        <Layers className="w-3 h-3 text-emerald-600 shrink-0" />
                                      )}
                                      <span className="font-mono text-[10px] font-bold">
                                        #{bBar.step_sequence}
                                      </span>
                                      <span className="truncate font-medium">
                                        {bBar.process_name}
                                      </span>
                                      {isQcGate && (
                                        <span className="px-1 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono text-[9px] font-bold shrink-0">
                                          IPQC · {bBar.cycle_time_minutes || 6}m
                                        </span>
                                      )}
                                    </span>
                                    <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400 shrink-0">
                                      {bBar.station_name}
                                    </span>
                                  </div>
                                  <div className="col-span-8 relative py-1.5">
                                    <div
                                      style={st}
                                      className={cn(
                                        "relative h-4 rounded px-2 flex items-center justify-between text-[9px] font-mono overflow-hidden whitespace-nowrap border",
                                        bBar.status === "COMPLETED"
                                          ? "bg-emerald-100 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                                          : isQcGate
                                          ? "bg-indigo-100 dark:bg-indigo-950/80 border-indigo-300 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200"
                                          : "bg-stone-200/80 dark:bg-stone-800 border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
                                      )}
                                    >
                                      <span>
                                        {bBar.start_date} → {bBar.end_date}
                                      </span>
                                      <span className="font-bold">
                                        {isQcGate ? `QC GATE (${bBar.status})` : bBar.status}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                          {/* Material-to-Process Readiness Matrix & IPQC Workload Bar */}
                          <div className="px-4 py-2.5 bg-white dark:bg-stone-900 border-t border-stone-200/80 dark:border-stone-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                                Station Material Readiness:
                              </span>
                              {(item.material_readiness_matrix || []).map((cell, cIdx) => (
                                <span
                                  key={`${item.project_id}-mat-${cIdx}`}
                                  onClick={() =>
                                    navigate(
                                      `/procurement-plan?project_id=${encodeURIComponent(
                                        item.project_id
                                      )}`
                                    )
                                  }
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] cursor-pointer transition-colors",
                                    cell.readiness_status === "PO_DELAY_RISK"
                                      ? "bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                                      : cell.readiness_status === "READY"
                                      ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                                      : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700"
                                  )}
                                  title={`Wave ${cell.wave_ref} ETA: ${cell.wave_eta} vs Station Start: ${cell.station_start}`}
                                >
                                  <strong>{cell.station_name}</strong>
                                  <span>·</span>
                                  <span>{cell.wave_ref}</span>
                                  {cell.readiness_status === "PO_DELAY_RISK" ? (
                                    <span className="font-bold text-rose-700 dark:text-rose-400">
                                      +{cell.delay_days}d Late
                                    </span>
                                  ) : cell.readiness_status === "READY" ? (
                                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                      GRN Ready
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 dark:text-emerald-400">
                                      On Time
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>

                            {item.qc_load_summary && (
                              <div className="flex flex-wrap items-center gap-2 shrink-0 font-mono text-[11px]">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
                                  <ShieldCheck className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                  <span>
                                    IPQC Load: <strong>{item.qc_load_summary.wot_qc_hours}h/WOT</strong> ·{" "}
                                    <strong>{item.qc_load_summary.order_qc_hours}h Total</strong> (
                                    {item.qc_load_summary.qc_share_pct}% CPM)
                                  </span>
                                </span>
                                {item.qc_load_summary.is_qc_bottleneck && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-bold text-[10px]">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    QC Bottleneck
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Split Lower Workspace: Master Production Schedule Table (Left 8 Cols) + Workstation Capacity Sidebar (Right 4 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left 8 Cols: Master Production Schedule (MPS) Setup Ledger */}
        <div className="lg:col-span-8 bg-white border border-stone-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Master Production Schedule (MPS) &amp; Project Setup Queue
              </h3>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Configure WOT lot sizing and commit project plans to release orders to Shop Floor Execution.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-44">
                <Input
                  type="text"
                  placeholder="Search WO, project..."
                  value={searchNtpQuery}
                  onChange={(e) => setSearchNtpQuery(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <div className="w-44">
                <Select
                  value={readinessFilter}
                  onChange={(e) => setReadinessFilter(e.target.value)}
                  options={[
                    { value: "ALL", label: "All Authorized" },
                    { value: "NEEDS_SETUP", label: "Needs PPIC Setup" },
                    { value: "COMMITTED", label: "Committed to Floor" },
                    { value: "AWAITING_BOP", label: "Awaiting Tech BOP" },
                  ]}
                />
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>WO / NTP &amp; Project</TableHead>
                <TableHead>Target &amp; WOT Lot</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead className="text-center">Plan Status</TableHead>
                <TableHead className="text-right">Planning Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredNtpProjects.length === 0 ? (
                <TableEmpty
                  colSpan={5}
                  message="No manufacturing projects match the current filter."
                />
              ) : (
                filteredNtpProjects.map((proj) => (
                  <TableRow
                    key={proj.id}
                    onClick={() => navigate(`/ppic/projects/${proj.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-stone-900">
                          {proj.spk_number || proj.id}
                        </span>
                        {proj.urgency === "HIGH" || proj.urgency === "CRITICAL" ? (
                          <Badge variant="danger">{proj.urgency}</Badge>
                        ) : null}
                      </div>
                      <div className="text-xs font-semibold text-stone-800 mt-0.5">
                        {proj.name}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        {proj.customer_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs font-bold text-stone-900 tabular-nums">
                        {Number(proj.qty || 1).toLocaleString()} {proj.uom || "PCS"}
                      </div>
                      <div className="text-[11px] font-mono text-stone-500">
                        {proj.is_master_set
                          ? `Lot ${proj.lot_size} (${proj.wot_count} WOT)`
                          : "Unconfigured Lot"}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-stone-700 tabular-nums">
                      {proj.due_date && proj.due_date !== "2099-12-31"
                        ? new Date(proj.due_date).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {proj.bop_status !== "AUTHORIZED" ? (
                        <Badge variant="warning">BOP Pending</Badge>
                      ) : proj.is_master_set ? (
                        <Badge variant="success">Committed</Badge>
                      ) : (
                        <Badge variant="warning">Draft Setup</Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="xs"
                        variant={proj.is_master_set ? "secondary" : "primary"}
                        onClick={() => navigate(`/ppic/projects/${proj.id}`)}
                        leftIcon={<Sliders className="w-3.5 h-3.5" />}
                      >
                        {proj.is_master_set ? "Review Plan" : "Setup & Commit"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Right 4 Cols: Workstation Capacity Load Sidebar */}
        <div className="lg:col-span-4 bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-4">
          <div>
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Workstation Capacity Load
            </h3>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Cross-project shift utilization across factory stations.
            </p>
          </div>

          {!data?.station_loads || data.station_loads.length === 0 ? (
            <div className="p-6 text-center text-xs text-stone-500 bg-stone-50 rounded-xl border border-stone-200">
              No station load telemetry recorded yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.station_loads.map((st) => {
                const pct = Math.min(100, Math.round(st.loadPercentage || 0));
                const isOverloaded = (st.loadPercentage || 0) > 85;
                return (
                  <div
                    key={st.stationId}
                    className="p-3 rounded-xl border border-stone-200 bg-stone-50/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-900">
                        {st.stationName}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-xs font-bold tabular-nums",
                          isOverloaded ? "text-rose-600" : "text-emerald-700"
                        )}
                      >
                        {Math.round(st.loadPercentage || 0)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isOverloaded ? "bg-rose-600" : "bg-emerald-600"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[10px] font-mono text-stone-500 flex items-center justify-between">
                      <span>{st.stationId}</span>
                      <span>{st.queuedProjectsCount} Queued Orders</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PpicPlanningHub;
