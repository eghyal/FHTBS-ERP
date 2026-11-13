import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
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
  ArrowRight,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
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
import { cn } from "@/lib/utils";

interface WipMovementEvent {
  id: string;
  wot_id?: string;
  tag_number: string;
  project_id?: string;
  project_name?: string;
  spk_number?: string;
  event_type:
    | "START"
    | "QR_SCAN"
    | "TRANSFER"
    | "NDP_BLOCK"
    | "RESUME"
    | "WOT_COMPLETE"
    | "LINE_STOP"
    | "HOLD";
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
  const { showToast } = useToast();

  const [events, setEvents] = useState<WipMovementEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [density, setDensity] = useState<"compact" | "comfortable">("comfortable");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEventType, setSelectedEventType] = useState("ALL");
  const [selectedStation, setSelectedStation] = useState("ALL");

  const isManagerOrAbove = useMemo(() => {
    return (
      user?.level === "MANAGER" ||
      user?.role === "FC" ||
      (user as any)?.role === "ADMIN" ||
      (user as any)?.role === "GOD_MODE"
    );
  }, [user]);

  const fetchMovements = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/wip/movements?limit=100", {}, user?.username);
      const list = Array.isArray(res.data)
        ? res.data
        : Array.isArray((res.data as any)?.data)
        ? (res.data as any).data
        : Array.isArray((res.data as any)?.movements)
        ? (res.data as any).movements
        : null;
      if (res.ok && list) {
        setEvents(list);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load WIP movements", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements();
    const interval = setInterval(fetchMovements, 30000);
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
      if (
        selectedStation !== "ALL" &&
        e.from_station_id !== selectedStation &&
        e.to_station_id !== selectedStation
      )
        return false;
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

  const hasActiveFilters =
    searchQuery !== "" || selectedEventType !== "ALL" || selectedStation !== "ALL";

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedEventType("ALL");
    setSelectedStation("ALL");
  };

  const handleExportCsv = () => {
    if (!isManagerOrAbove) {
      showToast("Only Managers can export CSV.", "error");
      return;
    }

    const headers = [
      "Timestamp",
      "Event",
      "Tag No",
      "Project",
      "Work Order",
      "From Station",
      "To Station",
      "Machine",
      "Operator",
      "Good Qty",
      "Scrap Qty",
    ];
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

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `wip_movements_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV exported successfully.", "success");
  };

  const getEventBadgeVariant = (type: WipMovementEvent["event_type"]) => {
    switch (type) {
      case "WOT_COMPLETE":
        return "success";
      case "START":
      case "QR_SCAN":
        return "info";
      case "RESUME":
      case "TRANSFER":
        return "warning";
      case "NDP_BLOCK":
      case "LINE_STOP":
      case "HOLD":
        return "danger";
      default:
        return "default";
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filter & Toolbar Controls Card */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-stone-900">
              WIP Movement Audit Ledger
            </h3>
            <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Immutable Audit Log
            </span>
          </div>
          <div className="text-xs text-stone-500 font-mono tabular-nums shrink-0">
            {filteredEvents.length} / {events.length} Events
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="flex-1 min-w-[240px] max-w-md">
              <Input
                type="text"
                placeholder="Search WOT Tag, Work Order, project, or operator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>

            <Select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              aria-label="Filter Event Type"
              wrapperClassName="w-44"
            >
              <option value="ALL">All Event Types</option>
              <option value="START">START</option>
              <option value="QR_SCAN">QR_SCAN</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="NDP_BLOCK">NDP_BLOCK</option>
              <option value="LINE_STOP">LINE_STOP</option>
              <option value="RESUME">RESUME</option>
              <option value="WOT_COMPLETE">WOT_COMPLETE</option>
              <option value="HOLD">HOLD</option>
            </Select>

            <Select
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value)}
              aria-label="Filter Station"
              wrapperClassName="w-44"
            >
              <option value="ALL">All Stations</option>
              {stationsList.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </Select>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="danger_soft"
                size="sm"
                onClick={resetFilters}
                leftIcon={<X className="w-3.5 h-3.5" />}
              >
                Reset Filters
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end shrink-0">
            {/* Density Switcher */}
            <div className="bg-stone-100 p-1 rounded-xl flex items-center gap-1 border border-stone-200/80">
              <button
                type="button"
                onClick={() => setDensity("compact")}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer",
                  density === "compact"
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                <Rows3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Compact</span>
              </button>
              <button
                type="button"
                onClick={() => setDensity("comfortable")}
                className={cn(
                  "px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer",
                  density === "comfortable"
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-600 hover:text-stone-900"
                )}
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Comfortable</span>
              </button>
            </div>

            <Button
              type="button"
              onClick={fetchMovements}
              disabled={isLoading}
              variant="secondary"
              size="icon-sm"
              title="Refresh WIP Movements"
              aria-label="Refresh WIP Movements"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            </Button>

            {isManagerOrAbove && (
              <Button
                type="button"
                onClick={handleExportCsv}
                variant="primary"
                size="sm"
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Export CSV
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Standardized WIP Movement Table */}
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>Timestamp</TableHead>
            <TableHead>Event Type</TableHead>
            <TableHead>WOT / Tag No</TableHead>
            <TableHead>Project &amp; Work Order</TableHead>
            <TableHead>Station Movement</TableHead>
            <TableHead className="text-right">Qty (Good / Scrap)</TableHead>
            <TableHead>Machine</TableHead>
            <TableHead>Operator</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow hoverable={false}>
              <TableCell colSpan={8} className="py-12 text-center text-stone-400">
                <div className="flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-stone-400" />
                  <span className="text-xs font-medium">
                    Loading WIP movements...
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ) : filteredEvents.length === 0 ? (
            <TableEmpty
              colSpan={8}
              icon={<Activity className="w-8 h-8 text-stone-300" />}
              message="No WIP movement events match your current filters"
            />
          ) : (
            filteredEvents.map((evt) => (
              <TableRow
                key={evt.id}
                className={density === "compact" ? "text-xs" : ""}
              >
                <TableCell
                  className={cn(
                    "font-mono tabular-nums text-stone-600 whitespace-nowrap",
                    density === "compact" && "py-2"
                  )}
                >
                  {new Date(evt.timestamp).toLocaleString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>

                <TableCell className={density === "compact" ? "py-2" : ""}>
                  <Badge variant={getEventBadgeVariant(evt.event_type)}>
                    {evt.event_type}
                  </Badge>
                </TableCell>

                <TableCell className={density === "compact" ? "py-2" : ""}>
                  <button
                    type="button"
                    onClick={() => onViewTag && onViewTag(evt.tag_number)}
                    className="font-mono tabular-nums font-bold text-stone-900 hover:text-amber-700 hover:underline transition-colors cursor-pointer"
                  >
                    {evt.tag_number}
                  </button>
                </TableCell>

                <TableCell className={density === "compact" ? "py-2" : ""}>
                  <div className="font-bold text-stone-900 truncate max-w-[220px]">
                    {evt.project_name || "Production Project"}
                  </div>
                  <div className="text-[11px] text-stone-500 font-mono tabular-nums">
                    {evt.spk_number || "-"}
                  </div>
                </TableCell>

                <TableCell className={cn("text-stone-700 font-medium", density === "compact" && "py-2")}>
                  {evt.from_station_id && evt.to_station_id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span>{evt.from_station_id}</span>
                      <ArrowRight className="w-3 h-3 text-stone-400" />
                      <span className="font-semibold text-stone-900">{evt.to_station_id}</span>
                    </span>
                  ) : (
                    <span>{evt.to_station_id || evt.from_station_id || "Floor Station"}</span>
                  )}
                </TableCell>

                <TableCell
                  className={cn(
                    "text-right font-mono tabular-nums",
                    density === "compact" && "py-2"
                  )}
                >
                  <span className="font-bold text-emerald-700">{evt.good_units}</span>
                  <span className="text-stone-300 mx-1">/</span>
                  <span
                    className={cn(
                      evt.reject_units > 0 ? "text-rose-600 font-bold" : "text-stone-400"
                    )}
                  >
                    {evt.reject_units}
                  </span>
                </TableCell>

                <TableCell
                  className={cn(
                    "font-mono tabular-nums text-stone-600",
                    density === "compact" && "py-2"
                  )}
                >
                  {evt.machine_code || "-"}
                </TableCell>

                <TableCell
                  className={cn(
                    "text-stone-800 font-medium",
                    density === "compact" && "py-2"
                  )}
                >
                  {evt.user_name}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
