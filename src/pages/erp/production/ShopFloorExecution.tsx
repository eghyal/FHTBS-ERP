import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Factory,
  Search,
  Calendar,
  CheckCircle2,
  Layers,
  RefreshCw,
  AlertOctagon,
  ExternalLink,
  X,
  Lock,
  ArrowRight,
  FileCheck2,
  Printer,
  Award,
  Activity,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
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
import { WipMovementTable } from "@/components/erp/production/wip/MovementTable";
import { FgrPreviewModal } from "@/components/erp/FgrPreviewModal";

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
  uom?: string;
  completed_at?: string | null;
  fgr_number?: string | null;
  fgr?: any | null;
}

interface CommandCenterData {
  kpi: {
    running_wots_count: number;
    queued_wots_count: number;
    total_active_wip_units: number;
    active_line_stops_count: number;
  };
  active_projects: ActiveProjectItem[];
  active_wots: any[];
  active_line_stops: any[];
}

type ShopFloorTab = "SHOP_FLOOR_QUEUE" | "WIP_LEDGER" | "FINISHED_FGR";

export function ShopFloorExecution() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ShopFloorTab>("SHOP_FLOOR_QUEUE");
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("ALL");

  const [searchFinishedQuery, setSearchFinishedQuery] = useState("");
  const [selectedFgrProject, setSelectedFgrProject] =
    useState<ActiveProjectItem | null>(null);
  const [selectedFgrDoc, setSelectedFgrDoc] = useState<any | null>(null);
  const [isOpeningFgrId, setIsOpeningFgrId] = useState<string | null>(null);

  const fetchShopFloorData = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(
        "/api/production/command-center",
        {},
        user?.username
      );
      if (res.ok && res.data) {
        setData(res.data.data || res.data);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load Shop Floor Execution data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShopFloorData();
    const interval = setInterval(fetchShopFloorData, 20000);
    return () => clearInterval(interval);
  }, []);

  // Strictly only projects committed by PPIC (is_master_set === true) or already completed
  const committedProjects = useMemo(() => {
    if (!data?.active_projects) return [];
    const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];
    return data.active_projects.filter((p) => {
      const upperId = String(p.id || "").toUpperCase();
      const upperName = String(p.name || "").toUpperCase();
      if (
        nonMfgIds.includes(upperId) ||
        upperName.includes("CONSUMABLE") ||
        upperName.includes("TRANSPORTATION") ||
        upperName.includes("OTHER PROCUREMENT") ||
        upperName.includes("OTHERS PROCUREMENT") ||
        upperName.includes("GENERAL PROCUREMENT")
      ) {
        return false;
      }
      if (p.bop_status !== "AUTHORIZED") return false;
      return Boolean(
        p.is_master_set || p.status === "COMPLETED" || p.status === "FINISHED"
      );
    });
  }, [data?.active_projects]);

  const activeFloorOrders = useMemo(() => {
    return committedProjects.filter((p) => {
      const isCompleted = p.status === "COMPLETED" || p.status === "FINISHED";
      if (isCompleted) return false;
      if (urgencyFilter !== "ALL" && p.urgency !== urgencyFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mId = (p.id || "").toLowerCase().includes(q);
        const mName = (p.name || "").toLowerCase().includes(q);
        const mSpk = (p.spk_number || "").toLowerCase().includes(q);
        const mCust = (p.customer_name || "").toLowerCase().includes(q);
        if (!mId && !mName && !mSpk && !mCust) return false;
      }
      return true;
    });
  }, [committedProjects, urgencyFilter, searchQuery]);

  const finishedProjects = useMemo(() => {
    return committedProjects.filter((p) => {
      const isFin = p.status === "COMPLETED" || p.status === "FINISHED";
      if (!isFin) return false;
      if (searchFinishedQuery.trim()) {
        const q = searchFinishedQuery.toLowerCase();
        const mId = (p.id || "").toLowerCase().includes(q);
        const mName = (p.name || "").toLowerCase().includes(q);
        const mSpk = (p.spk_number || "").toLowerCase().includes(q);
        const mCust = (p.customer_name || "").toLowerCase().includes(q);
        const mFgr = (p.fgr_number || "").toLowerCase().includes(q);
        if (!mId && !mName && !mSpk && !mCust && !mFgr) return false;
      }
      return true;
    });
  }, [committedProjects, searchFinishedQuery]);

  const activeCommittedCount = useMemo(
    () =>
      committedProjects.filter(
        (p) => p.status !== "COMPLETED" && p.status !== "FINISHED"
      ).length,
    [committedProjects]
  );

  const handleOpenProjectFgr = async (proj: ActiveProjectItem) => {
    setIsOpeningFgrId(proj.id);
    try {
      if (proj.fgr) {
        setSelectedFgrProject(proj);
        setSelectedFgrDoc(proj.fgr);
        return;
      }
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
          inspected_at: proj.completed_at || new Date().toISOString(),
          inspector_id: "USR-PROD",
          notes: "Completed via Shop Floor Execution",
        });
      }
    } catch {
      showToast("Failed to load FGR document", "error");
    } finally {
      setIsOpeningFgrId(null);
    }
  };

  const kpi = data?.kpi || {
    running_wots_count: 0,
    queued_wots_count: 0,
    total_active_wip_units: 0,
    active_line_stops_count: 0,
  };

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="Shop Floor Execution"
        subtitle="Work order dispatch & station WIP"
        icon={<Factory className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              onClick={fetchShopFloorData}
              disabled={isLoading}
              title="Refresh Shop Floor Data"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
              />
            </Button>
          </div>
        }
      />

      {/* Conditional Active Stop Line Alert Banner */}
      {data?.active_line_stops && data.active_line_stops.length > 0 && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-rose-900 shadow-2xs">
          <div className="flex items-start sm:items-center gap-3">
            <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <strong className="font-bold text-rose-900 block">
                Interruption Alert: {data.active_line_stops.length} Station(s) Currently on STOP LINE
              </strong>
              <div className="text-xs text-rose-700 mt-0.5">
                {data.active_line_stops
                  .map((s) => `${s.station_id} (${s.reason_code})`)
                  .join(" · ")}{" "}
                — Productive station hours are currently paused.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {data.active_line_stops.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant="danger"
                size="xs"
                onClick={async () => {
                  try {
                    const res = await apiFetch(
                      `/api/production/stop-line/${s.id}/resume`,
                      { method: "POST" },
                      user?.username
                    );
                    if (res.ok) {
                      showToast(
                        `Station ${s.station_id} resumed successfully.`,
                        "success"
                      );
                      fetchShopFloorData();
                    }
                  } catch {
                    showToast("Failed to resume station", "error");
                  }
                }}
              >
                Resume {s.station_id}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Top 4-Column KPI Summary Row (Standard Vertical View) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Committed Floor Orders"
          value={activeCommittedCount}
          subtitle="Released by PPIC for execution"
          icon={<Factory className="w-4 h-4 text-emerald-600" />}
        />
        <StatCard
          label="Running WOT Sub-Lots"
          value={kpi.running_wots_count || 0}
          subtitle={`${kpi.queued_wots_count || 0} sub-lots queued at stations`}
          icon={<Activity className="w-4 h-4 text-blue-600" />}
        />
        <StatCard
          label="In-Process WIP Units"
          value={`${Number(kpi.total_active_wip_units || 0).toLocaleString()} PCS`}
          subtitle="Active units across shop floor"
          icon={<Layers className="w-4 h-4 text-amber-600" />}
        />
        <StatCard
          label="Completed & FGR"
          value={finishedProjects.length}
          subtitle="Finished runs ready for warehouse"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
        />
      </div>

      {/* Horizontal Segmented Tab Bar (Light-mode clean) */}
      <div className="bg-stone-100/80 border border-stone-200/80 rounded-xl p-1 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("SHOP_FLOOR_QUEUE")}
            className={cn(
              "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              activeTab === "SHOP_FLOOR_QUEUE"
                ? "bg-white text-stone-900 border border-stone-200/80 shadow-xs"
                : "text-stone-600 hover:text-stone-900 hover:bg-white/60"
            )}
          >
            <Factory className="w-4 h-4 text-emerald-600" />
            <span>Active Floor Queue</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-mono font-bold",
                activeTab === "SHOP_FLOOR_QUEUE"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-white text-stone-600 border border-stone-200/70"
              )}
            >
              {activeCommittedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("WIP_LEDGER")}
            className={cn(
              "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              activeTab === "WIP_LEDGER"
                ? "bg-white text-stone-900 border border-stone-200/80 shadow-xs"
                : "text-stone-600 hover:text-stone-900 hover:bg-white/60"
            )}
          >
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Station WIP Ledger</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("FINISHED_FGR")}
            className={cn(
              "inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              activeTab === "FINISHED_FGR"
                ? "bg-white text-stone-900 border border-stone-200/80 shadow-xs"
                : "text-stone-600 hover:text-stone-900 hover:bg-white/60"
            )}
          >
            <FileCheck2 className="w-4 h-4 text-emerald-600" />
            <span>Finished Orders &amp; FGR</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-mono font-bold",
                activeTab === "FINISHED_FGR"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-white text-stone-600 border border-stone-200/70"
              )}
            >
              {finishedProjects.length}
            </span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: ACTIVE FLOOR QUEUE (VERTICAL VIEW)                           */}
      {/* =================================================================== */}
      {activeTab === "SHOP_FLOOR_QUEUE" && (
        <div className="space-y-4">
          {/* Search & Urgency Filter Bar */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Input
                  type="text"
                  placeholder="Search committed WO/NTP number, project name, or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <div className="w-full sm:w-48">
                <Select
                  value={urgencyFilter}
                  onChange={(e) => setUrgencyFilter(e.target.value)}
                  options={[
                    { value: "ALL", label: "All Urgency" },
                    { value: "HIGH", label: "High Urgency" },
                    { value: "NORMAL", label: "Normal" },
                    { value: "LOW", label: "Low" },
                  ]}
                />
              </div>
            </div>
            {(searchQuery || urgencyFilter !== "ALL") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setUrgencyFilter("ALL");
                }}
                leftIcon={<X className="w-3.5 h-3.5" />}
              >
                Reset
              </Button>
            )}
          </div>

          {/* Committed Work Order Execution List / Grid */}
          {activeFloorOrders.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center shadow-2xs space-y-2">
              <Factory className="w-8 h-8 text-stone-300 mx-auto" />
              <p className="text-sm font-bold text-stone-800">
                No Committed Work Orders Currently in the Active Floor Queue
              </p>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Work orders appear here automatically once PPIC commits the Master Production Schedule and WOT lot sizing.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeFloorOrders.map((proj) => {
                const progressPct = Math.min(
                  100,
                  Math.max(0, Number(proj.overall_progress) || 0)
                );
                const hasValidDueDate =
                  Boolean(proj.due_date) &&
                  String(proj.due_date) !== "2099-12-31";
                const dueDateObj = hasValidDueDate
                  ? new Date(proj.due_date)
                  : null;

                return (
                  <div
                    key={proj.id}
                    onClick={() => navigate(`/production/projects/${proj.id}`)}
                    className="bg-white border border-stone-200 hover:border-stone-300 rounded-2xl p-5 shadow-2xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      {/* Header Row */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-stone-100 text-stone-800 border border-stone-200">
                          {proj.spk_number || proj.id}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <Badge variant="success">
                            <Lock className="w-3 h-3 mr-1" />
                            PPIC Committed
                          </Badge>
                          {(proj.urgency === "HIGH" ||
                            proj.urgency === "CRITICAL") && (
                            <Badge variant="danger">{proj.urgency}</Badge>
                          )}
                        </div>
                      </div>

                      {/* Title & Customer */}
                      <div>
                        <h3 className="text-base font-bold text-stone-900 line-clamp-1">
                          {proj.name}
                        </h3>
                        <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">
                          {proj.customer_name || "Manufacturing Client"}
                        </p>
                      </div>

                      {/* Key Metrics Box */}
                      <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-stone-50 border border-stone-200/70">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                            Order Qty
                          </span>
                          <span className="font-mono text-xs font-bold text-stone-900 tabular-nums">
                            {Number(proj.qty || 1).toLocaleString()}{" "}
                            {proj.uom || "PCS"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                            Lot Size
                          </span>
                          <span className="font-mono text-xs font-bold text-stone-800 tabular-nums">
                            {proj.lot_size || 10} PCS
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                            WOT Lots
                          </span>
                          <span className="font-mono text-xs font-bold text-emerald-700 tabular-nums">
                            {proj.completed_wot_count}/{proj.wot_count}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-stone-500 font-medium">
                            Shop Floor Completion ({proj.completed_bop_count}/
                            {proj.bop_count} BOP Steps)
                          </span>
                          <span className="font-mono font-bold text-stone-900">
                            {progressPct}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 rounded-full transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Footer Action Row */}
                    <div
                      className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-xs font-mono text-stone-500 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-stone-400" />
                        <span>
                          Due:{" "}
                          {dueDateObj
                            ? dueDateObj.toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "-"}
                        </span>
                      </div>

                      <Button
                        type="button"
                        variant="primary"
                        size="xs"
                        onClick={() =>
                          navigate(`/production/projects/${proj.id}`)
                        }
                        rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                      >
                        Execute Floor
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: STATION WIP LEDGER                                           */}
      {/* =================================================================== */}
      {activeTab === "WIP_LEDGER" && <WipMovementTable />}

      {/* =================================================================== */}
      {/* TAB 3: FINISHED ORDERS & FGR                                        */}
      {/* =================================================================== */}
      {activeTab === "FINISHED_FGR" && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-stone-900">
                  Completed Work Orders &amp; Finished Goods Receipt (FGR) Archive
                </h2>
                <p className="text-xs text-stone-500">
                  View and export official A4 FGR certificates for finished production runs.
                </p>
              </div>
            </div>
            <div className="w-full sm:w-64">
              <Input
                type="text"
                placeholder="Search FGR No., WO, project..."
                value={searchFinishedQuery}
                onChange={(e) => setSearchFinishedQuery(e.target.value)}
                leftIcon={<Search className="w-3.5 h-3.5" />}
              />
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl shadow-2xs overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow hoverable={false}>
                  <TableHead>FGR Document No.</TableHead>
                  <TableHead>Project &amp; WO / NTP</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Finished Qty</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finishedProjects.length === 0 ? (
                  <TableEmpty
                    colSpan={5}
                    message="No completed manufacturing projects found yet."
                  />
                ) : (
                  finishedProjects.map((proj) => {
                    const fgrNo =
                      proj.fgr_number || `FGR-${proj.spk_number || proj.id}`;
                    return (
                      <TableRow key={proj.id}>
                        <TableCell>
                          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {fgrNo}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-stone-900 text-xs">
                            {proj.name}
                          </div>
                          <div className="font-mono text-[11px] text-stone-500">
                            {proj.spk_number || proj.id}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-stone-700">
                          {proj.customer_name}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-stone-900 tabular-nums">
                          {Number(proj.qty || 1).toLocaleString()}{" "}
                          {proj.uom || "PCS"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="primary"
                              size="xs"
                              onClick={() => handleOpenProjectFgr(proj)}
                              disabled={isOpeningFgrId === proj.id}
                              leftIcon={<Printer className="w-3.5 h-3.5" />}
                            >
                              Export FGR
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() =>
                                navigate(`/production/projects/${proj.id}`)
                              }
                              rightIcon={<ExternalLink className="w-3 h-3" />}
                            >
                              Details
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {selectedFgrDoc && selectedFgrProject && (
        <FgrPreviewModal
          isOpen={Boolean(selectedFgrDoc)}
          onClose={() => {
            setSelectedFgrDoc(null);
            setSelectedFgrProject(null);
          }}
          fgr={selectedFgrDoc}
          project={{
            ...selectedFgrProject,
            customer: selectedFgrProject.customer_name,
          }}
        />
      )}
    </div>
  );
}

export default ShopFloorExecution;
