import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Factory,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sliders,
  Layers,
  RefreshCw,
  AlertOctagon,
  Package,
  Activity,
  QrCode,
  Download,
  Eye,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { WotQrScannerModal } from "@/components/erp/WotQrScannerModal";
import { WipMovementTable } from "@/components/erp/production/wip/WipMovementTable";
import { StopLineModal } from "@/components/erp/production/command/StopLineModal";
import { WhatIfSimulatorModal } from "@/components/erp/production/command/WhatIfSimulatorModal";
import { AdjustmentConsoleModal } from "@/components/erp/production/command/AdjustmentConsoleModal";

interface WotItem {
  tag_id: string;
  tag_number: string;
  project_id: string;
  project_name: string;
  spk_number?: string;
  bop_id?: string;
  process_name?: string;
  step_sequence?: number;
  station_name: string;
  operator_name?: string;
  qc_inspector?: string;
  qc_status?: string;
  good_qty: number;
  scrap_qty: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  dwell_minutes: number;
  dwell_hours: number;
  is_aging_alert: boolean;
  status: "RUNNING" | "QUEUED" | "HOLD_NDP" | "LINE_STOP" | "COMPLETED";
  project_etc?: string;
  project_risk: "ON_TRACK" | "AT_RISK" | "CRITICAL_DELAY";
  active_ndp_id?: string;
  ndp_title?: string;
}

interface ProjectRiskItem {
  projectId: string;
  projectName: string;
  spkNumber: string;
  targetDueDate: string;
  estimatedCompletionDate: string;
  totalWorkingHours: number;
  totalWorkingDays: number;
  varianceDaysVsDeadline: number;
  riskLevel: "ON_TRACK" | "AT_RISK" | "CRITICAL_DELAY";
  confidenceScore: number;
  bottleneckStation: string;
  bottleneckMachine: string;
  recommendedMitigations: string[];
}

interface StationLoadItem {
  stationId: string;
  stationName: string;
  loadPercentage: number;
  queuedProjectsCount: number;
}

interface CommandCenterData {
  kpi: {
    total_active_wip_units: number;
    running_wots_count: number;
    queued_wots_count: number;
    blocked_count: number;
    at_risk_projects_count: number;
    material_bottleneck_count: number;
    active_line_stops_count: number;
    overall_confidence_score: number;
  };
  active_wots: WotItem[];
  project_schedule_panel: ProjectRiskItem[];
  station_loads: StationLoadItem[];
  recent_events: any[];
  active_line_stops: any[];
}

export function Production() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const isId = language === "id";

  const [activeTab, setActiveTab] = useState<"COMMAND_CENTER" | "WIP_MONITOR">("COMMAND_CENTER");
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters for Zona B
  const [searchWotQuery, setSearchWotQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isEventFeedExpanded, setIsEventFeedExpanded] = useState(false);

  // Modals
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showStopLineModal, setShowStopLineModal] = useState(false);
  const [showWhatIfModal, setShowWhatIfModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [selectedTagForDetail, setSelectedTagForDetail] = useState<any | null>(null);

  const fetchCommandCenterData = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/production/command-center", {}, user?.username);
      if (res.ok && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error(err);
      showToast(isId ? "Gagal memuat Production Command Center" : "Failed to load Command Center", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCommandCenterData();
    const interval = setInterval(fetchCommandCenterData, 20000); // Poll every 20s
    return () => clearInterval(interval);
  }, []);

  // Filtered WOT List
  const filteredWots = useMemo(() => {
    if (!data?.active_wots) return [];
    return data.active_wots.filter((w) => {
      if (statusFilter !== "ALL" && w.status !== statusFilter) return false;
      if (searchWotQuery.trim()) {
        const q = searchWotQuery.toLowerCase();
        const mTag = (w.tag_number || "").toLowerCase().includes(q);
        const mProj = (w.project_name || "").toLowerCase().includes(q);
        const mSpk = (w.spk_number || "").toLowerCase().includes(q);
        const mProc = (w.process_name || "").toLowerCase().includes(q);
        const mStat = (w.station_name || "").toLowerCase().includes(q);
        if (!mTag && !mProj && !mSpk && !mProc && !mStat) return false;
      }
      return true;
    });
  }, [data?.active_wots, statusFilter, searchWotQuery]);

  const kpi = data?.kpi || {
    total_active_wip_units: 0,
    running_wots_count: 0,
    queued_wots_count: 0,
    blocked_count: 0,
    at_risk_projects_count: 0,
    material_bottleneck_count: 0,
    active_line_stops_count: 0,
    overall_confidence_score: 85,
  };

  return (
    <div className="space-y-6 pb-20 bg-stone-50 min-h-screen text-stone-900 p-6 rounded-3xl">
      {/* 1. Standard Page Header with Confidence Score & Icon Actions */}
      <PageHeader
        title={isId ? "Production Command Center" : "Production Command Center"}
        subtitle={
          isId
            ? "Pusat kendali terpadu: Pelacakan WIP real-time berbasis QR, estimasi dinamis multi-proyek & penyesuaian gangguan."
            : "Integrated Command Center: QR-based WIP tracing, multi-project scheduling & adjustment console."
        }
        icon={<Factory className="w-5 h-5 text-amber-700" />}
        iconBgClassName="bg-amber-50 border border-amber-200/80 text-amber-700"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Confidence Score Badge - clean light badge without black background */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200/80 text-emerald-800 rounded-xl text-xs font-bold shadow-2xs mr-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-stone-600 font-medium">{isId ? "Kepercayaan" : "Confidence"}:</span>
              <span className="font-mono font-black text-emerald-700">{kpi.overall_confidence_score}%</span>
            </div>

            {/* 1. Scan QR WOT (Icon Button) */}
            <Button
              onClick={() => setShowScannerModal(true)}
              variant="outline"
              size="icon"
              title={isId ? "Scan QR WOT" : "Scan QR WOT"}
              aria-label={isId ? "Scan QR WOT" : "Scan QR WOT"}
              className="h-9 w-9 rounded-xl border-stone-300 bg-white hover:bg-stone-100 text-stone-700 shadow-2xs transition-all"
            >
              <QrCode className="w-4 h-4 text-stone-700" />
            </Button>

            {/* 2. What-If Simulator (Icon Button) */}
            <Button
              onClick={() => setShowWhatIfModal(true)}
              variant="outline"
              size="icon"
              title={isId ? "Simulator Skenario (What-If)" : "What-If Simulator"}
              aria-label={isId ? "Simulator Skenario (What-If)" : "What-If Simulator"}
              className="h-9 w-9 rounded-xl border-stone-300 bg-white hover:bg-stone-100 text-stone-700 shadow-2xs transition-all"
            >
              <Sliders className="w-4 h-4 text-stone-700" />
            </Button>

            {/* 3. Stop Line (Icon Button) */}
            <Button
              onClick={() => setShowStopLineModal(true)}
              variant="outline"
              size="icon"
              title={isId ? "Hentikan Lini (Stop Line)" : "Stop Line"}
              aria-label={isId ? "Hentikan Lini (Stop Line)" : "Stop Line"}
              className="h-9 w-9 rounded-xl border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 shadow-2xs transition-all"
            >
              <AlertOctagon className="w-4 h-4 text-rose-600" />
            </Button>

            {/* 4. Adjustment (Icon Button) */}
            <Button
              onClick={() => setShowAdjustmentModal(true)}
              variant="outline"
              size="icon"
              title={isId ? "Buat Adjustment" : "Adjustment"}
              aria-label={isId ? "Buat Adjustment" : "Adjustment"}
              className="h-9 w-9 rounded-xl border-stone-300 bg-white hover:bg-stone-100 text-stone-700 shadow-2xs transition-all"
            >
              <SlidersHorizontal className="w-4 h-4 text-stone-700" />
            </Button>

            {/* 5. Refresh Data */}
            <Button
              onClick={fetchCommandCenterData}
              variant="outline"
              size="icon"
              title={isId ? "Muat Ulang Data" : "Refresh Data"}
              aria-label={isId ? "Muat Ulang Data" : "Refresh Data"}
              className="h-9 w-9 rounded-xl border-stone-300 bg-white hover:bg-stone-100 text-stone-600 hover:text-stone-900 shadow-2xs transition-all"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {/* 2. View Switcher Tabs */}
      <div className="bg-stone-200/80 p-1 rounded-xl flex items-center gap-1 max-w-md border border-stone-300/80">
        <button
          onClick={() => setActiveTab("COMMAND_CENTER")}
          className={cn(
            "flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
            activeTab === "COMMAND_CENTER"
              ? "bg-white text-stone-900 shadow-xs border border-stone-200"
              : "text-stone-600 hover:text-stone-900"
          )}
        >
          <span>{isId ? "Layar Komando Utama (Command Hub)" : "Command Hub"}</span>
        </button>

        <button
          onClick={() => setActiveTab("WIP_MONITOR")}
          className={cn(
            "flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
            activeTab === "WIP_MONITOR"
              ? "bg-white text-stone-900 shadow-xs border border-stone-200"
              : "text-stone-600 hover:text-stone-900"
          )}
        >
          <span>{isId ? "WIP Movement Monitor (Buku Besar)" : "WIP Movement Monitor"}</span>
        </button>
      </div>

      {/* VIEW: Standalone WIP Movement Table (FR-2) */}
      {activeTab === "WIP_MONITOR" && (
        <WipMovementTable
          onViewTag={(tagNo) => {
            const found = data?.active_wots?.find((w) => w.tag_number === tagNo);
            if (found) setSelectedTagForDetail(found);
            else showToast(`Tag ${tagNo} dipilih`, "info");
          }}
        />
      )}

      {/* VIEW: 4-Zone Command Center (FR-1) */}
      {activeTab === "COMMAND_CENTER" && (
        <div className="space-y-6">
          {/* ZONA A: Health KPI Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-xs">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">WIP Aktif (Pcs)</div>
              <div className="text-xl font-black text-stone-900 font-mono mt-1">{kpi.total_active_wip_units}</div>
              <div className="text-[10px] text-stone-500 mt-0.5">Unit dalam proses</div>
            </div>

            <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-xs">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">WOT Berjalan / Antre</div>
              <div className="text-xl font-black text-stone-900 font-mono mt-1">
                <span className="text-blue-600">{kpi.running_wots_count}</span>
                <span className="text-stone-300 mx-1">/</span>
                <span className="text-stone-600">{kpi.queued_wots_count}</span>
              </div>
              <div className="text-[10px] text-stone-500 mt-0.5">Tiket produksi</div>
            </div>

            <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-xs">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">WIP Terblokir / Stop</div>
              <div className="text-xl font-black text-rose-600 font-mono mt-1">{kpi.blocked_count}</div>
              <div className="text-[10px] text-rose-600 font-medium mt-0.5">NDP / Line Stop aktif</div>
            </div>

            <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-xs">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Risiko Deadline</div>
              <div className="text-xl font-black text-stone-900 font-mono mt-1">
                <span className={kpi.at_risk_projects_count > 0 ? "text-amber-600" : "text-emerald-600"}>
                  {kpi.at_risk_projects_count}
                </span>
              </div>
              <div className="text-[10px] text-stone-500 mt-0.5">Proyek rawan terlambat</div>
            </div>

            <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-xs">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Material Wave Gate</div>
              <div className="text-xl font-black text-stone-900 font-mono mt-1">{kpi.material_bottleneck_count}</div>
              <div className="text-[10px] text-stone-500 mt-0.5">Menunggu pengadaan</div>
            </div>

            <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-xs">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Stop Line Aktif</div>
              <div className="text-xl font-black text-stone-900 font-mono mt-1">
                <span className={kpi.active_line_stops_count > 0 ? "text-rose-600 font-bold" : "text-stone-700"}>
                  {kpi.active_line_stops_count} Stasiun
                </span>
              </div>
              <div className="text-[10px] text-stone-500 mt-0.5">Interupsi jalur aktif</div>
            </div>
          </div>

          {/* Active Stop Line Alert Banner (if any) */}
          {data?.active_line_stops && data.active_line_stops.length > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-rose-900">
              <div className="flex items-center gap-3">
                <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <strong className="font-black tracking-tight uppercase">
                    Peringatan: {data.active_line_stops.length} Stasiun Sedang Berstatus STOP LINE
                  </strong>
                  <div className="text-[11px] text-rose-800 mt-0.5">
                    {data.active_line_stops.map((s) => `${s.station_id} (${s.reason_code})`).join(", ")}. Jam produktif dihentikan otomatis.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {data.active_line_stops.map((s) => (
                  <Button
                    key={s.id}
                    size="xs"
                    onClick={async () => {
                      try {
                        const res = await apiFetch(`/api/production/stop-line/${s.id}/resume`, { method: "POST" });
                        if (res.ok) {
                          showToast(`Stasiun ${s.station_id} berhasil di-resume.`, "success");
                          fetchCommandCenterData();
                        }
                      } catch (_) {
                        showToast("Gagal resume stasiun", "error");
                      }
                    }}
                    className="bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-xl text-xs h-7"
                  >
                    Resume {s.station_id}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* MAIN 2-COLUMN WORKSPACE: ZONA B (Kiri) & ZONA C (Kanan) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* ZONA B: WIP Tracing Board (Tabel WOT Interaktif) (7 Cols) */}
            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
                    <span>Zona B: Pelacakan WIP Aktif (WIP Tracing Board)</span>
                    <span className="font-mono text-[10px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full">
                      {filteredWots.length} WOT
                    </span>
                  </h3>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {isId ? "Status fisik setiap tiket lot WOT di lini perakitan & stasiun." : "Physical status of active WOTs on the floor."}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={isId ? "Cari WOT / SPK..." : "Search WOT / SPK..."}
                    value={searchWotQuery}
                    onChange={(e) => setSearchWotQuery(e.target.value)}
                    className="text-xs px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl outline-none w-36 sm:w-44"
                  />

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-xl outline-none"
                  >
                    <option value="ALL">{isId ? "Semua Status" : "All Status"}</option>
                    <option value="RUNNING">RUNNING</option>
                    <option value="QUEUED">QUEUED</option>
                    <option value="HOLD_NDP">HOLD_NDP</option>
                    <option value="LINE_STOP">LINE_STOP</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
              </div>

              {/* WOT Table */}
              <div className="overflow-x-auto border border-stone-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-2.5 pl-3">WOT / Tag</th>
                      <th className="p-2.5">Proyek & SPK</th>
                      <th className="p-2.5">Stasiun & Proses</th>
                      <th className="p-2.5 text-center">Qty (G/S)</th>
                      <th className="p-2.5 text-center">Aging di Stasiun</th>
                      <th className="p-2.5 text-center">Status</th>
                      <th className="p-2.5 pr-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredWots.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-stone-400 italic">
                          {isId ? "Tidak ada WOT aktif sesuai kriteria." : "No active WOTs matching criteria."}
                        </td>
                      </tr>
                    ) : (
                      filteredWots.map((w) => (
                        <tr key={w.tag_id} className="hover:bg-stone-50/60 transition-colors">
                          <td className="p-2.5 pl-3">
                            <button
                              onClick={() => setSelectedTagForDetail(w)}
                              className="font-mono font-black text-stone-900 hover:text-blue-600 hover:underline cursor-pointer text-left block"
                            >
                              {w.tag_number}
                            </button>
                            <span className="text-[10px] text-stone-400 font-medium block">
                              {w.operator_name || "Operator"}
                            </span>
                          </td>

                          <td className="p-2.5">
                            <div className="font-bold text-stone-800 truncate max-w-[140px]">{w.project_name}</div>
                            <div className="text-[10px] text-stone-400 font-mono">{w.spk_number || "-"}</div>
                          </td>

                          <td className="p-2.5">
                            <span className="font-bold text-stone-800 block truncate max-w-[130px]">
                              {w.station_name}
                            </span>
                            <span className="text-[10px] text-stone-500 block truncate max-w-[130px]">
                              {w.process_name || "Process Step"}
                            </span>
                          </td>

                          <td className="p-2.5 text-center font-mono">
                            <span className="font-bold text-emerald-600">{w.good_qty}</span>
                            <span className="text-stone-300 mx-1">/</span>
                            <span className={cn(w.scrap_qty > 0 ? "text-rose-600 font-bold" : "text-stone-400")}>
                              {w.scrap_qty}
                            </span>
                          </td>

                          <td className="p-2.5 text-center font-mono">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold",
                                w.is_aging_alert
                                  ? "bg-rose-50 text-rose-700 font-black border border-rose-200"
                                  : "bg-stone-100 text-stone-700"
                              )}
                            >
                              {w.dwell_hours}h
                            </span>
                          </td>

                          <td className="p-2.5 text-center">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-black uppercase border",
                                w.status === "RUNNING"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : w.status === "HOLD_NDP" || w.status === "LINE_STOP"
                                  ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                                  : w.status === "COMPLETED"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-stone-100 text-stone-700 border-stone-200"
                              )}
                            >
                              {w.status}
                            </span>
                          </td>

                          <td className="p-2.5 pr-3 text-center">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => navigate(`/production/project/${w.project_id}`)}
                              className="rounded-lg text-[10px] font-bold border-stone-200 bg-stone-50 hover:bg-stone-100"
                            >
                              Hub
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ZONA C: Estimation & Contention Risk Panel (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Project Schedule & Variance Risk */}
              <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    {isId ? "Zona C: Risiko Jadwal & Antrean Mesin" : "Zona C: Schedule & Contention Risk"}
                  </h3>
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Multi-Project v2</span>
                </div>

                <div className="space-y-3">
                  {data?.project_schedule_panel?.length === 0 ? (
                    <div className="p-6 text-center text-xs text-stone-400 italic">
                      {isId ? "Belum ada proyek berjalan." : "No active projects scheduled."}
                    </div>
                  ) : (
                    data?.project_schedule_panel?.map((proj) => (
                      <div
                        key={proj.projectId}
                        className="p-3.5 bg-stone-50 hover:bg-stone-100/70 border border-stone-200 rounded-xl space-y-2 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold text-stone-900 line-clamp-1">{proj.projectName}</h4>
                            <div className="text-[10px] text-stone-400 font-mono">{proj.spkNumber}</div>
                          </div>

                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black uppercase border shrink-0",
                              proj.riskLevel === "ON_TRACK"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : proj.riskLevel === "AT_RISK"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            )}
                          >
                            {proj.riskLevel}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-stone-200/60">
                          <div>
                            <span className="text-stone-400 text-[10px] block font-bold uppercase">Deadline Target</span>
                            <span className="font-mono font-medium text-stone-700">{proj.targetDueDate}</span>
                          </div>
                          <div>
                            <span className="text-stone-400 text-[10px] block font-bold uppercase">Estimasi Selesai</span>
                            <span className="font-mono font-bold text-stone-900">
                              {new Date(proj.estimatedCompletionDate).toLocaleDateString("id-ID")}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] pt-1 text-stone-500">
                          <span>
                            Bottleneck: <strong className="text-stone-800">{proj.bottleneckStation}</strong>
                          </span>
                          <span
                            className={cn(
                              "font-bold font-mono",
                              proj.varianceDaysVsDeadline >= 0 ? "text-emerald-600" : "text-rose-600"
                            )}
                          >
                            {proj.varianceDaysVsDeadline >= 0 ? `+${proj.varianceDaysVsDeadline}` : proj.varianceDaysVsDeadline} Hari
                          </span>
                        </div>

                        {proj.recommendedMitigations && proj.recommendedMitigations.length > 0 && (
                          <div className="p-2 bg-white rounded-lg border border-stone-200 text-[10px] text-stone-700">
                            <span className="font-bold text-stone-900">Rekomendasi: </span>
                            {proj.recommendedMitigations[0]}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Station Load Matrix */}
              <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider pb-2 border-b border-stone-100">
                  {isId ? "Peta Utilisasi Stasiun (Capacity Load)" : "Station Capacity Load Matrix"}
                </h4>

                <div className="space-y-2.5">
                  {data?.station_loads?.map((st) => (
                    <div key={st.stationId} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-stone-800">{st.stationName}</span>
                        <span className="font-mono text-stone-900">{st.loadPercentage}% Load</span>
                      </div>
                      <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden border border-stone-200/60">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            st.loadPercentage > 85 ? "bg-rose-600" : st.loadPercentage > 65 ? "bg-amber-500" : "bg-stone-800"
                          )}
                          style={{ width: `${Math.min(100, st.loadPercentage)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ZONA D: Live WIP Event Feed (Collapsible Accordion) */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-3">
            <div
              onClick={() => setIsEventFeedExpanded(!isEventFeedExpanded)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-stone-500" />
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                  {isId ? "Zona D: Aliran Event Buku Besar WIP (Live Event Feed)" : "Zona D: Live WIP Event Feed"}
                </h3>
                <span className="text-[10px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full font-mono font-bold">
                  {data?.recent_events?.length || 0} Events
                </span>
              </div>

              <div className="flex items-center gap-1 text-xs text-stone-400 font-bold">
                <span>{isEventFeedExpanded ? (isId ? "Sembunyikan" : "Collapse") : (isId ? "Buka Aliran" : "Expand")}</span>
                {isEventFeedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>

            {isEventFeedExpanded && (
              <div className="pt-3 border-t border-stone-100 divide-y divide-stone-100 max-h-60 overflow-y-auto">
                {data?.recent_events?.map((evt: any) => (
                  <div key={evt.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-md text-[9px] font-black uppercase border shrink-0",
                          evt.event_type === "START"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : evt.event_type === "WOT_COMPLETE"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : evt.event_type === "LINE_STOP" || evt.event_type === "NDP_BLOCK"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-stone-100 text-stone-800 border-stone-200"
                        )}
                      >
                        {evt.event_type}
                      </span>

                      <div>
                        <span className="font-mono font-bold text-stone-900">{evt.tag_number || "WOT"}</span>
                        <span className="text-stone-400 mx-1.5">•</span>
                        <span className="text-stone-600 font-medium">{evt.user_name || "Operator"}</span>
                      </div>
                    </div>

                    <div className="text-[10px] font-mono text-stone-400">
                      {new Date(evt.timestamp).toLocaleTimeString("id-ID")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODALS */}
      {/* 1. QR Scanner Modal (FR-1.6) */}
      <WotQrScannerModal
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onViewTag={(tag) => {
          setSelectedTagForDetail(tag);
        }}
      />

      {/* 2. Stop Line Modal (FR-3.6) */}
      <StopLineModal
        isOpen={showStopLineModal}
        onClose={() => setShowStopLineModal(false)}
        onSuccess={fetchCommandCenterData}
        stations={data?.station_loads?.map((s) => ({ id: s.stationId, name: s.stationName }))}
      />

      {/* 3. What-If Simulator Modal (FR-3.4) */}
      <WhatIfSimulatorModal
        isOpen={showWhatIfModal}
        onClose={() => setShowWhatIfModal(false)}
        onSuccess={fetchCommandCenterData}
      />

      {/* 4. Adjustment Console Modal (FR-4) */}
      <AdjustmentConsoleModal
        isOpen={showAdjustmentModal}
        onClose={() => setShowAdjustmentModal(false)}
        onSuccess={fetchCommandCenterData}
        projects={data?.project_schedule_panel?.map((p) => ({ id: p.projectId, name: p.projectName }))}
      />

      {/* 5. WOT Detail Modal */}
      <Modal
        isOpen={!!selectedTagForDetail}
        onClose={() => setSelectedTagForDetail(null)}
        maxWidth="md"
        title={
          selectedTagForDetail && (
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                {selectedTagForDetail.tag_number}
              </span>
              <span className="text-xs font-bold text-stone-700">Digital Passport</span>
            </div>
          )
        }
      >
        {selectedTagForDetail && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-stone-50 border border-stone-200 rounded-xl">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase block">Proyek</span>
                <span className="font-bold text-stone-800">{selectedTagForDetail.project_name || "-"}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase block">SPK</span>
                <span className="font-mono font-bold text-stone-800">{selectedTagForDetail.spk_number || "-"}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase block">Stasiun</span>
                <span className="font-bold text-stone-800">{selectedTagForDetail.station_name || "-"}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase block">Tahap Proses</span>
                <span className="font-bold text-stone-800">{selectedTagForDetail.process_name || "-"}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center p-3 border border-stone-200 rounded-xl">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase block">Good Qty</span>
                <span className="text-base font-black text-emerald-600 font-mono">{selectedTagForDetail.good_qty}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase block">Scrap Qty</span>
                <span className="text-base font-black text-rose-600 font-mono">{selectedTagForDetail.scrap_qty}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase block">Status QC</span>
                <span className="text-xs font-black uppercase text-stone-800">{selectedTagForDetail.qc_status || "PASSED"}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-stone-100">
              <Button
                variant="primary"
                onClick={() => {
                  const pId = selectedTagForDetail.project_id;
                  setSelectedTagForDetail(null);
                  if (pId) navigate(`/production/project/${pId}`);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                Buka Hub Produksi Proyek
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Production;
