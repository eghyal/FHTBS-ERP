import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  Download,
  ShieldCheck,
  Activity,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Rows3,
  List,
  MapPin,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface WipMovementEvent {
  id: string;
  wot_id?: string;
  tag_number: string;
  project_id?: string;
  project_name?: string;
  spk_number?: string;
  event_type: "START" | "QR_SCAN" | "TRANSFER" | "NDP_BLOCK" | "RESUME" | "WOT_COMPLETE" | "LINE_STOP" | "HOLD";
  from_station_id?: string;
  to_station_id?: string;
  machine_code?: string;
  user_name: string;
  qty: number;
  good_units: number;
  reject_units: number;
  metadata?: string;
  timestamp: string;
}

interface WipMovementTableProps {
  onViewTag?: (tagNumber: string) => void;
  className?: string;
}

export function WipMovementTable({ onViewTag, className }: WipMovementTableProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const isId = language === "id";

  const [events, setEvents] = useState<WipMovementEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEventType, setSelectedEventType] = useState("ALL");
  const [selectedStation, setSelectedStation] = useState("ALL");

  const isManagerOrAbove = useMemo(() => {
    return user?.level === "MANAGER" || user?.role === "FC" || (user as any)?.role === "ADMIN" || (user as any)?.role === "GOD_MODE";
  }, [user]);

  const fetchMovements = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/wip/movements?limit=100", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        setEvents(res.data);
      }
    } catch (err) {
      console.error(err);
      showToast(isId ? "Gagal memuat log pergerakan WIP" : "Failed to load WIP movements", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements();
    const interval = setInterval(fetchMovements, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const stationsList = useMemo(() => {
    const st = new Set<string>();
    events.forEach((e) => {
      if (e.from_station_id) st.add(e.from_station_id);
      if (e.to_station_id) st.add(e.to_station_id);
    });
    return Array.from(st).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (selectedEventType !== "ALL" && e.event_type !== selectedEventType) return false;
      if (selectedStation !== "ALL" && e.from_station_id !== selectedStation && e.to_station_id !== selectedStation) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mTag = (e.tag_number || "").toLowerCase().includes(q);
        const mUser = (e.user_name || "").toLowerCase().includes(q);
        const mProj = (e.project_name || "").toLowerCase().includes(q);
        const mSpk = (e.spk_number || "").toLowerCase().includes(q);
        if (!mTag && !mUser && !mProj && !mSpk) return false;
      }
      return true;
    });
  }, [events, selectedEventType, selectedStation, searchQuery]);

  const stats = useMemo(() => {
    let goodUnits = 0;
    let scrapUnits = 0;
    let blockEvents = 0;
    filteredEvents.forEach((e) => {
      goodUnits += e.good_units || 0;
      scrapUnits += e.reject_units || 0;
      if (e.event_type === "NDP_BLOCK" || e.event_type === "LINE_STOP") {
        blockEvents++;
      }
    });
    return {
      totalEvents: filteredEvents.length,
      goodUnits,
      scrapUnits,
      blockEvents,
    };
  }, [filteredEvents]);

  const hasActiveFilters = searchQuery !== "" || selectedEventType !== "ALL" || selectedStation !== "ALL";

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedEventType("ALL");
    setSelectedStation("ALL");
  };

  const handleExportCsv = () => {
    if (!isManagerOrAbove) {
      showToast(isId ? "Hanya role Manager ke atas yang berhak ekspor CSV." : "Only Managers can export CSV.", "error");
      return;
    }

    const headers = ["Timestamp", "Event", "Tag No", "Project", "SPK", "From Station", "To Station", "Machine", "Operator", "Good Qty", "Scrap Qty"];
    const rows = filteredEvents.map((e) => [
      e.timestamp,
      e.event_type,
      e.tag_number,
      `"${e.project_name || ""}"`,
      `"${e.spk_number || ""}"`,
      e.from_station_id || "-",
      e.to_station_id || "-",
      e.machine_code || "-",
      `"${e.user_name || ""}"`,
      e.good_units,
      e.reject_units,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `wip_movements_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(isId ? "Ekspor CSV berhasil diunduh." : "CSV exported successfully.", "success");
  };

  return (
    <div className={cn("bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden space-y-4 p-5", className)}>
      {/* Header & Section Controls */}
      <div className="space-y-4">
        {/* Top Row: Title, Badges & Quick Summary Stats */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-stone-200/80">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-50 border border-amber-200/80 text-amber-700 rounded-2xl shadow-xs shrink-0 mt-0.5">
              <Activity className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-stone-900 tracking-tight uppercase">
                  {isId ? "WIP Movement Monitor" : "WIP Movement Monitor"}
                </h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  {isId ? "Buku Besar Immutabel" : "Immutable Ledger"}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-stone-100 text-stone-700 border border-stone-200">
                  {filteredEvents.length} / {events.length} {isId ? "Event" : "Events"}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1 max-w-2xl">
                {isId
                  ? "Audit log terpusat mutasi fisik WIP, scan QR lantai produksi, transfer antar stasiun, serta penanganan gangguan NDP."
                  : "Immutable audit ledger tracking physical WIP QR scans, inter-station transfers, and NDP line stop events."}
              </p>
            </div>
          </div>

          {/* Quick Summary Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="bg-stone-50 border border-stone-200/80 rounded-xl px-3 py-2 flex flex-col justify-between min-w-[100px]">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider flex items-center justify-between">
                <span>{isId ? "Total Event" : "Total Events"}</span>
                <Activity className="w-3 h-3 text-stone-400" />
              </div>
              <div className="text-base font-black font-mono text-stone-900 mt-0.5">{stats.totalEvents}</div>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl px-3 py-2 flex flex-col justify-between min-w-[100px]">
              <div className="text-[10px] font-bold text-emerald-700/80 uppercase tracking-wider flex items-center justify-between">
                <span>{isId ? "Good Units" : "Good Units"}</span>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              </div>
              <div className="text-base font-black font-mono text-emerald-700 mt-0.5">{stats.goodUnits}</div>
            </div>

            <div
              className={cn(
                "border rounded-xl px-3 py-2 flex flex-col justify-between min-w-[100px]",
                stats.scrapUnits > 0 ? "bg-rose-50/60 border-rose-200/60" : "bg-stone-50 border-stone-200/80"
              )}
            >
              <div
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider flex items-center justify-between",
                  stats.scrapUnits > 0 ? "text-rose-700/80" : "text-stone-400"
                )}
              >
                <span>{isId ? "Scrap Qty" : "Scrap Qty"}</span>
                <AlertTriangle className={cn("w-3 h-3", stats.scrapUnits > 0 ? "text-rose-600" : "text-stone-400")} />
              </div>
              <div
                className={cn(
                  "text-base font-black font-mono mt-0.5",
                  stats.scrapUnits > 0 ? "text-rose-700" : "text-stone-900"
                )}
              >
                {stats.scrapUnits}
              </div>
            </div>

            <div
              className={cn(
                "border rounded-xl px-3 py-2 flex flex-col justify-between min-w-[100px]",
                stats.blockEvents > 0 ? "bg-amber-50/60 border-amber-200/60" : "bg-stone-50 border-stone-200/80"
              )}
            >
              <div
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider flex items-center justify-between",
                  stats.blockEvents > 0 ? "text-amber-700/80" : "text-stone-400"
                )}
              >
                <span>{isId ? "NDP / Block" : "NDP / Block"}</span>
                <AlertOctagon className={cn("w-3 h-3", stats.blockEvents > 0 ? "text-amber-600" : "text-stone-400")} />
              </div>
              <div
                className={cn(
                  "text-base font-black font-mono mt-0.5",
                  stats.blockEvents > 0 ? "text-amber-800" : "text-stone-900"
                )}
              >
                {stats.blockEvents}
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Toolbar Controls Bar */}
        <div className="bg-stone-50 border border-stone-200/90 rounded-2xl p-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-2xs">
          {/* Left: Search & Filter Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input
                type="text"
                placeholder={isId ? "Cari Tag, SPK, Proyek, Operator..." : "Search Tag, SPK, Project, Operator..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-8 py-2 bg-white border border-stone-200 rounded-xl outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 transition-all font-medium placeholder:text-stone-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Event Type Filter */}
            <div className="relative">
              <select
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value)}
                className="text-xs pl-8 pr-7 py-2 bg-white border border-stone-200 rounded-xl outline-none focus:border-stone-900 transition-all font-medium appearance-none cursor-pointer"
              >
                <option value="ALL">{isId ? "Semua Event" : "All Event Types"}</option>
                <option value="START">START</option>
                <option value="QR_SCAN">QR_SCAN</option>
                <option value="TRANSFER">TRANSFER</option>
                <option value="NDP_BLOCK">NDP_BLOCK</option>
                <option value="LINE_STOP">LINE_STOP</option>
                <option value="RESUME">RESUME</option>
                <option value="WOT_COMPLETE">WOT_COMPLETE</option>
                <option value="HOLD">HOLD</option>
              </select>
              <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            </div>

            {/* Station Filter */}
            <div className="relative">
              <select
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                className="text-xs pl-8 pr-7 py-2 bg-white border border-stone-200 rounded-xl outline-none focus:border-stone-900 transition-all font-medium appearance-none cursor-pointer"
              >
                <option value="ALL">{isId ? "Semua Stasiun" : "All Stations"}</option>
                {stationsList.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            </div>

            {/* Reset Filter Button */}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="text-xs px-2.5 py-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>{isId ? "Reset Filter" : "Reset Filters"}</span>
              </button>
            )}
          </div>

          {/* Right: Display Density & Refresh Actions */}
          <div className="flex items-center gap-2 justify-end shrink-0">
            {/* Density Switcher */}
            <div className="bg-stone-200/70 p-0.5 rounded-xl flex items-center text-xs font-bold border border-stone-300/50">
              <button
                onClick={() => setDensity("compact")}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-[11px] cursor-pointer",
                  density === "compact"
                    ? "bg-white text-stone-900 shadow-2xs font-black"
                    : "text-stone-600 hover:text-stone-900"
                )}
                title={isId ? "Tampilan Padat" : "Compact View"}
              >
                <Rows3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Compact</span>
              </button>
              <button
                onClick={() => setDensity("comfortable")}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 text-[11px] cursor-pointer",
                  density === "comfortable"
                    ? "bg-white text-stone-900 shadow-2xs font-black"
                    : "text-stone-600 hover:text-stone-900"
                )}
                title={isId ? "Tampilan Longgar" : "Comfortable View"}
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Comfortable</span>
              </button>
            </div>

            {/* Refresh Button */}
            <Button
              onClick={fetchMovements}
              disabled={isLoading}
              variant="outline"
              size="xs"
              className="rounded-xl text-xs font-bold border-stone-200 bg-white hover:bg-stone-100 text-stone-800 shadow-2xs px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-stone-600", isLoading && "animate-spin")} />
              <span className="hidden sm:inline">{isId ? "Muat Ulang" : "Refresh"}</span>
            </Button>

            {/* Export CSV Button */}
            {isManagerOrAbove && (
              <Button
                onClick={handleExportCsv}
                variant="primary"
                size="xs"
                className="rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-white" />
                <span>Export CSV</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto border border-stone-200 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
              <th className="p-2.5 pl-4">{isId ? "Waktu" : "Timestamp"}</th>
              <th className="p-2.5">{isId ? "Event" : "Event"}</th>
              <th className="p-2.5">{isId ? "WOT / Tag No" : "WOT / Tag No"}</th>
              <th className="p-2.5">{isId ? "Proyek (SPK)" : "Project (SPK)"}</th>
              <th className="p-2.5">{isId ? "Mutasi Stasiun" : "Station Movement"}</th>
              <th className="p-2.5 text-center">{isId ? "Good / Scrap" : "Good / Scrap"}</th>
              <th className="p-2.5">{isId ? "Mesin" : "Machine"}</th>
              <th className="p-2.5 pr-4">{isId ? "Operator" : "Operator"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-10 text-center text-stone-400 italic">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-stone-400" />
                    <span>{isId ? "Memuat pergerakan WIP..." : "Loading WIP movements..."}</span>
                  </div>
                </td>
              </tr>
            ) : filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-2">
                    <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                      <Search className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-stone-700">
                      {isId ? "Tidak ada event mutasi WIP ditemukan" : "No WIP movements found"}
                    </p>
                    <p className="text-[11px] text-stone-400">
                      {isId
                        ? "Coba sesuaikan kata kunci pencarian, jenis event, atau filter stasiun."
                        : "Try adjusting your search query, event type, or station filter."}
                    </p>
                    {hasActiveFilters && (
                      <Button
                        onClick={resetFilters}
                        variant="outline"
                        size="xs"
                        className="mt-2 rounded-xl text-xs font-bold border-stone-200"
                      >
                        {isId ? "Reset Semua Filter" : "Reset All Filters"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredEvents.map((evt) => (
                <tr
                  key={evt.id}
                  className={cn("hover:bg-stone-50/60 transition-colors", density === "compact" ? "py-1" : "py-3")}
                >
                  <td className="p-2.5 pl-4 font-mono text-stone-600 whitespace-nowrap">
                    {new Date(evt.timestamp).toLocaleString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>

                  <td className="p-2.5">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-tight",
                        evt.event_type === "START"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : evt.event_type === "WOT_COMPLETE"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : evt.event_type === "NDP_BLOCK" || evt.event_type === "LINE_STOP"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : evt.event_type === "RESUME"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-stone-100 text-stone-800 border-stone-200"
                      )}
                    >
                      {evt.event_type}
                    </span>
                  </td>

                  <td className="p-2.5">
                    <button
                      onClick={() => onViewTag && onViewTag(evt.tag_number)}
                      className="font-mono font-bold text-stone-900 hover:text-blue-600 hover:underline cursor-pointer"
                    >
                      {evt.tag_number}
                    </button>
                  </td>

                  <td className="p-2.5">
                    <div className="font-bold text-stone-800 truncate max-w-[160px]">{evt.project_name || "Project"}</div>
                    <div className="text-[10px] text-stone-400 font-mono">{evt.spk_number || "-"}</div>
                  </td>

                  <td className="p-2.5 text-stone-700 font-medium">
                    {evt.from_station_id && evt.to_station_id ? (
                      <span>
                        {evt.from_station_id} &rarr; {evt.to_station_id}
                      </span>
                    ) : (
                      evt.to_station_id || evt.from_station_id || "Floor Station"
                    )}
                  </td>

                  <td className="p-2.5 text-center font-mono">
                    <span className="font-bold text-emerald-600">{evt.good_units}</span>
                    <span className="text-stone-300 mx-1">/</span>
                    <span className={cn(evt.reject_units > 0 ? "text-rose-600 font-bold" : "text-stone-400")}>
                      {evt.reject_units}
                    </span>
                  </td>

                  <td className="p-2.5 font-mono text-stone-600">{evt.machine_code || "-"}</td>

                  <td className="p-2.5 pr-4 text-stone-800 font-medium">{evt.user_name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
