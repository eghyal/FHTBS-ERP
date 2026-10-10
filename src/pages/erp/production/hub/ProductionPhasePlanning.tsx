import { generateWotBatchPdf } from "@/components/erp/BatchQrPdfRenderer";
import React, { useState, useEffect, useMemo } from "react";
import { useProductionHubStore } from "@/stores/productionHubStore";
import { 
  Package, Printer, Play, Truck, CheckCircle2, 
  Clock, AlertTriangle, Gauge, Sliders, ArrowRight, Layers,
  User, Calendar, Plus, ShieldAlert, Wrench, RefreshCw, Cpu, Activity, QrCode,
  TrendingUp, BarChart3, AlertOctagon, HelpCircle, Edit3, X, Check, Search
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { WotSizeOptimizerModal } from "@/components/erp/WotSizeOptimizerModal";
import { LotsLabelsModal } from "@/components/erp/LotsLabelsModal";
import { WotQrBatchPrintModal } from "@/components/erp/production/WotQrBatchPrintModal";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";

export function ProductionPhasePlanning({ actions, user }: { actions: any; user: any }) {
  const store = useProductionHubStore();
  const { showToast } = useToast();
  const [showOptimizerModal, setShowOptimizerModal] = useState(false);
  const [showBatchQrModal, setShowBatchQrModal] = useState(false);
  const [optimizerInitialTab, setOptimizerInitialTab] = useState<"SIMULATOR" | "CPM_MATRIX" | "OVERTIME_SCHEDULE">("SIMULATOR");
  const [overtimeList, setOvertimeList] = useState<any[]>([]);
  const [scheduleData, setScheduleData] = useState<any[]>([]);
  const [allScheduleData, setAllScheduleData] = useState<any[]>([]);
  const [planningSummary, setPlanningSummary] = useState<any>(null);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [machineLoadDetail, setMachineLoadDetail] = useState<any[]>([]);
  const [timelineDates, setTimelineDates] = useState<string[]>([]);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [ganttViewMode, setGanttViewMode] = useState<"PROCESS" | "MACHINE">("PROCESS");
  const [ganttWindowDays, setGanttWindowDays] = useState<14 | 30>(14);
  const [ganttSearch, setGanttSearch] = useState("");
  const [activeNdpsCount, setActiveNdpsCount] = useState(0);
  const [rescheduleRequired, setRescheduleRequired] = useState(false);
  const [isReallocating, setIsReallocating] = useState(false);
  const [timelineView, setTimelineView] = useState<"grid" | "bars">("grid");
  const [targetShiftHours, setTargetShiftHours] = useState(8);
  const [isCalculatingWot, setIsCalculatingWot] = useState(false);

  // Manual Reschedule Modal
  const [rescheduleModal, setRescheduleModal] = useState<{
    isOpen: boolean;
    task: any | null;
    selectedMachineId: string;
  }>({
    isOpen: false,
    task: null,
    selectedMachineId: ""
  });
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);

  const {
    handleGenerateLots = () => {},
    handleDispatchToFloor = () => {},
  } = actions || {};

  const {
    isGeneratingLots,
    showLotsLabelsModal, setShowLotsLabelsModal,
    customLotSize, setCustomLotSize,
    project,
    shortageAnalysis: rawShortages,
    lots: rawLots,
    wots: rawWots,
    stations: rawStations,
    cpmData,
    gapAnalysis,
    setShowProcurementDrawer,
    setCurrentPhase,
    setConfirmModal
  } = store;

  const lots = Array.isArray(rawLots) && rawLots.length > 0 ? rawLots : (Array.isArray(rawWots) ? rawWots : []);
  const stations = Array.isArray(rawStations) ? rawStations : [];
  const shortageAnalysis = Array.isArray(rawShortages) ? rawShortages : [];

  const activeGap = gapAnalysis || store.cpmAnalysis?.gapAnalysis || {
    estimatedTotalDays: Math.max(1, Math.ceil((Number(project?.qty) || 100) / (customLotSize || project?.lot_size || 50)) * 2),
    availableCalendarDays: 14,
    gapDays: 14 - Math.max(1, Math.ceil((Number(project?.qty) || 100) / (customLotSize || project?.lot_size || 50)) * 2),
    isDelayed: false
  };

  // Fetch active overtime schedules and RCPSP multi-project schedule
  const loadPlanningData = () => {
    if (!project?.id) return;

    apiFetch(`/api/production/projects/${project.id}/overtime`)
      .then((res) => setOvertimeList(res?.data || []))
      .catch(() => setOvertimeList([]));
      
    apiFetch(`/api/planning/schedule?project_id=${project.id}`)
      .then((res: any) => {
        setScheduleData(res?.schedule || []);
        setAllScheduleData(res?.all_schedule || []);
        setPlanningSummary(res?.summary || null);
        setRescheduleRequired(Boolean(res?.reschedule_required));
        setActiveNdpsCount(Number(res?.active_ndps_count) || 0);
      })
      .catch(() => setScheduleData([]));
      
    apiFetch(`/api/planning/calculate-load?project_id=${project.id}`)
      .then((res: any) => {
        setHeatmapData(res?.heatmap || []);
        setMachineLoadDetail(res?.machines || []);
        setTimelineDates(res?.timeline || []);
      })
      .catch(() => {
        setHeatmapData([]);
        setMachineLoadDetail([]);
      });
  };

  useEffect(() => {
    loadPlanningData();
  }, [project?.id, showOptimizerModal]);

  const handleReallocateNdp = async () => {
    setIsReallocating(true);
    try {
      const res: any = await apiFetch("/api/planning/apply-ndp-impact", {
        method: "POST",
        body: JSON.stringify({ auto_reallocate: true })
      });
      
      // Auto-refresh calculate load without cache after reallocation
      apiFetch(`/api/planning/calculate-load?project_id=${project?.id}&force_refresh=true`)
        .then((matrixRes: any) => {
          setHeatmapData(matrixRes?.heatmap || []);
          setMachineLoadDetail(matrixRes?.machines || []);
          setTimelineDates(matrixRes?.timeline || []);
        }).catch(() => {});
        
      showToast(res?.message || "Reallocated tasks to alternative machines!", "success");
      loadPlanningData();
    } catch (err: any) {
      showToast(err.message || "Failed to reallocate", "error");
    } finally {
      setIsReallocating(false);
    }
  };

  const handleAutoGenerateWots = async () => {
    if (!project?.id) return;
    setIsCalculatingWot(true);
    try {
      const res: any = await apiFetch("/api/planning/generate-wots", {
        method: "POST",
        body: JSON.stringify({
          project_id: project.id,
          target_shift_hours: targetShiftHours,
          custom_lot_size: customLotSize || undefined
        })
      });
      if (res?.lot_size) {
        setCustomLotSize(res.lot_size);
      }
      
      // Auto-refresh calculate load without cache after generation
      apiFetch(`/api/planning/calculate-load?project_id=${project.id}&force_refresh=true`)
        .then((matrixRes: any) => {
          setHeatmapData(matrixRes?.heatmap || []);
          setMachineLoadDetail(matrixRes?.machines || []);
          setTimelineDates(matrixRes?.timeline || []);
        }).catch(() => {});
        
      showToast(res?.message || "WOTs generated successfully!", "success");
      loadPlanningData();
      if (actions?.loadProjectData) {
        actions.loadProjectData(project.id);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to generate WOTs", "error");
    } finally {
      setIsCalculatingWot(false);
    }
  };

  const handleApplyReschedule = async () => {
    if (!rescheduleModal.task || !rescheduleModal.selectedMachineId) return;
    setIsSavingReschedule(true);
    try {
      const res: any = await apiFetch("/api/planning/reschedule", {
        method: "PATCH",
        body: JSON.stringify({
          project_id: project?.id,
          manual_adjustments: [{
            bop_id: rescheduleModal.task.id,
            new_machine_id: rescheduleModal.selectedMachineId
          }]
        })
      });
      if (res?.conflicts && res.conflicts.length > 0) {
        showToast(res.conflicts[0].message, "error");
      } else {
        // Auto-refresh calculate load without cache after reschedule
        apiFetch(`/api/planning/calculate-load?project_id=${project?.id}&force_refresh=true`)
          .then((matrixRes: any) => {
            setHeatmapData(matrixRes?.heatmap || []);
            setMachineLoadDetail(matrixRes?.machines || []);
            setTimelineDates(matrixRes?.timeline || []);
          }).catch(() => {});
          
        showToast(res?.message || "Schedule updated successfully!", "success");
        setRescheduleModal({ isOpen: false, task: null, selectedMachineId: "" });
        loadPlanningData();
      }
    } catch (err: any) {
      showToast(err.message || "Failed to reschedule", "error");
    } finally {
      setIsSavingReschedule(false);
    }
  };

  const totalOtHours = overtimeList.reduce((acc, ot) => acc + (Number(ot.overtime_hours) || 0), 0);
  const daysCompressed = (totalOtHours / 8).toFixed(1);
  
  const maxHoursPerWot = Math.max(...(store.cpmAnalysis?.nodes?.map((n: any) => n.hours) || [0]));
  const isWotTooLarge = maxHoursPerWot > 8;

  // Resolve Gantt Schedule List with graceful CPM / BoP fallback
  const resolvedScheduleList = useMemo(() => {
    const baseList = showAllProjects ? allScheduleData : scheduleData;
    if (baseList.length > 0) return baseList;

    // Graceful fallback to BoP processSteps when API schedule is not yet generated
    if (actions?.processSteps && actions.processSteps.length > 0) {
      const today = new Date();
      return actions.processSteps.map((step: any, idx: number) => {
        const cpmNode = store.cpmAnalysis?.nodes?.find((n: any) => n.id === step.id);
        const hours = cpmNode?.hours || Number(step.cycle_time_minutes ? (step.cycle_time_minutes / 60) : 1);
        const startDays = cpmNode?.es_days ?? (idx * 0.75);
        const durDays = Math.max(0.25, cpmNode?.durationDays ?? (hours / 8));

        const startDate = new Date(today);
        startDate.setDate(today.getDate() + Math.floor(startDays));
        const endDate = new Date(startDate.getTime() + Math.max(86400000, Math.ceil(durDays * 86400000)));

        return {
          id: step.id,
          project_id: project?.id,
          process_name: step.process_name,
          name: `[${project?.name || "Project"}] ${step.process_name}`,
          machine: step.station_name || "Station",
          machine_id: step.station_id || `station_${idx}`,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          durationHours: Math.round(hours * 10) / 10,
          progress: step.status === "COMPLETED" ? 100 : (step.status === "RUNNING" ? 50 : 0),
          is_critical: Boolean(cpmNode?.is_critical_path),
          is_machine_down: false,
          status: step.status || "PLANNED"
        };
      });
    }
    return [];
  }, [scheduleData, allScheduleData, showAllProjects, actions?.processSteps, store.cpmAnalysis, project]);

  // Filter by search query
  const filteredScheduleList = useMemo(() => {
    if (!ganttSearch.trim()) return resolvedScheduleList;
    const q = ganttSearch.toLowerCase();
    return resolvedScheduleList.filter(t => 
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.process_name && t.process_name.toLowerCase().includes(q)) ||
      (t.machine && t.machine.toLowerCase().includes(q))
    );
  }, [resolvedScheduleList, ganttSearch]);

  // Group Gantt by Machine for Swimlane mode
  const machineSwimlanes: Record<string, any[]> = useMemo(() => {
    const map: Record<string, any[]> = {};
    filteredScheduleList.forEach(task => {
      const mName = task.machine || "Manual Station";
      if (!map[mName]) map[mName] = [];
      map[mName].push(task);
    });
    return map;
  }, [filteredScheduleList]);

  // Dynamic Gantt Calendar Days Window
  const ganttDays = useMemo(() => {
    const dates: { dateStr: string; label: string; weekday: string; isToday: boolean; isWeekend: boolean }[] = [];
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    let minDate = new Date(today);
    if (filteredScheduleList.length > 0) {
      let earliest = new Date(filteredScheduleList[0].startDate || today);
      filteredScheduleList.forEach(t => {
        if (t.startDate) {
          const d = new Date(t.startDate);
          if (d < earliest) earliest = d;
        }
      });
      if (earliest < minDate) minDate = earliest;
    }

    const totalDays = ganttWindowDays;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(minDate);
      d.setDate(minDate.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const dayOfWeek = d.getDay();
      dates.push({
        dateStr,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        weekday: d.toLocaleDateString("id-ID", { weekday: "short" }),
        isToday: dateStr === todayStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6
      });
    }
    return dates;
  }, [filteredScheduleList, ganttWindowDays]);

  // Calculate Gantt bar coordinates with sub-day precision
  const getBarCoordinates = (task: any) => {
    if (!ganttDays.length) return { left: 0, width: 10 };
    const minTime = new Date(ganttDays[0].dateStr + "T00:00:00").getTime();
    const maxTime = new Date(ganttDays[ganttDays.length - 1].dateStr + "T23:59:59").getTime();
    const totalDuration = maxTime - minTime;
    if (totalDuration <= 0) return { left: 0, width: 10 };

    const taskStartTime = task.startDate ? new Date(task.startDate).getTime() : minTime;
    const fallbackDurMs = Math.max(1, Number(task.durationHours) || 2) * 3600000;
    const taskEndTime = task.endDate ? new Date(task.endDate).getTime() : (taskStartTime + fallbackDurMs);

    const clampStart = Math.max(minTime, Math.min(maxTime, taskStartTime));
    const clampEnd = Math.max(clampStart + 1800000, Math.min(maxTime, taskEndTime));

    const left = ((clampStart - minTime) / totalDuration) * 100;
    const rawWidth = ((clampEnd - clampStart) / totalDuration) * 100;
    const oneDayWidthPercent = (1 / ganttDays.length) * 100;
    const minWidth = Math.max(2.5, oneDayWidthPercent * 0.45);
    const width = Math.max(minWidth, Math.min(100 - left, rawWidth));

    return { left: Math.max(0, Math.min(97, left)), width: Math.max(3, width) };
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Mathematical CPM & Gap Analysis */}
      {isWotTooLarge && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-3xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <div>
            <h4 className="text-xs font-black text-rose-900 dark:text-rose-200 uppercase tracking-wider">Warning: WOT Size Terlalu Besar!</h4>
            <p className="text-xs text-rose-700 dark:text-rose-300">
              Kapasitas bottleneck saat ini membutuhkan <span className="font-mono font-bold">{maxHoursPerWot.toFixed(1)} jam</span> per WOT. 
              Ini akan menyebabkan starvation (proses menganggur) di station berikutnya. Rekomendasi: Gunakan WOT Optimizer untuk memperkecil ukuran lot.
            </p>
          </div>
          <Button
            onClick={() => {
              setOptimizerInitialTab("SIMULATOR");
              setShowOptimizerModal(true);
            }}
            size="sm"
            className="ml-auto bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs shrink-0 font-bold"
          >
            Optimize WOT
          </Button>
        </div>
      )}

      {/* NDP Cross-Impact & Machine Breakdown Alert Banner */}
      {(rescheduleRequired || activeNdpsCount > 0) && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-3xl p-4.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-black text-amber-950 dark:text-amber-200 uppercase tracking-wider flex items-center gap-2">
                Active Machine Breakdown Downtime Detected
                <span className="px-2 py-0.5 bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 rounded-full text-[10px] font-mono font-bold">
                  {activeNdpsCount} Active NDP{activeNdpsCount > 1 ? 's' : ''}
                </span>
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                One or more fabrication machines are currently down under emergency NDP. Downstream schedules across projects have been pushed back to prevent starvation. Reallocate to secondary machines to clear the bottleneck.
              </p>
              {planningSummary?.critical_path_shift_msg && (
                <p className="text-[11px] font-mono font-bold text-amber-900 dark:text-amber-200 mt-1 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-md inline-block">
                  {planningSummary.critical_path_shift_msg}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={handleReallocateNdp}
              disabled={isReallocating}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-xs flex items-center gap-1.5"
            >
              <Wrench className="w-3.5 h-3.5" />
              {isReallocating ? "Reallocating..." : "Auto-Reallocate Alternative Machines"}
            </Button>
            <Button
              onClick={loadPlanningData}
              variant="secondary"
              size="sm"
              className="rounded-xl font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      )}

      {/* Section 7.4.4 Executive Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-blue-600" /> Fleet Utilization
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              {planningSummary?.average_machine_load || 0}% avg load
            </span>
          </div>
          <p className="text-2xl font-mono font-black text-stone-900 dark:text-stone-100 mt-1">
            {planningSummary?.utilized_machines || 0} / {planningSummary?.total_fleet_machines || machineLoadDetail.length || 1} <span className="text-xs font-sans text-stone-500">Machines</span>
          </p>
          <span className="text-[11px] text-stone-500 font-mono block mt-0.5">
            Active Multi-Project Footprint
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-emerald-600" /> Project Milestones
            </span>
            <span className="text-[10px] font-mono font-bold text-stone-600">
              {planningSummary?.total_active_projects || 1} Total
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 font-mono text-xs font-bold">
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
              {planningSummary?.projects_on_track || 0} On Track
            </span>
            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md">
              {planningSummary?.projects_at_risk || 0} At Risk
            </span>
            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md">
              {planningSummary?.projects_delayed || 0} Delayed
            </span>
          </div>
          <span className="text-[11px] text-stone-500 font-mono block mt-1">
            Multi-Project Delivery Tracking
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-stone-600" /> Root-to-Finish Time
            </span>
            <span className="text-[10px] font-mono font-bold text-stone-500">
              Per Lot Cycle
            </span>
          </div>
          <p className="text-2xl font-mono font-black text-stone-900 dark:text-stone-100 mt-1">
            {planningSummary?.root_to_finish_avg_hours || "0.0"} <span className="text-xs font-sans text-stone-500">Hours</span>
          </p>
          <span className="text-[11px] text-stone-500 font-mono block mt-0.5">
            Effective Lead Time per WOT
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
              <AlertOctagon className="w-3.5 h-3.5 text-amber-600" /> Bottleneck Alert
            </span>
            <span className="text-[10px] font-bold text-amber-600">
              {planningSummary?.next_bottleneck ? "High Load" : "Balanced"}
            </span>
          </div>
          <p className="text-xs font-bold text-stone-800 dark:text-stone-200 mt-1 line-clamp-2">
            {planningSummary?.next_bottleneck?.message || "No extreme bottleneck predicted across 30-day timeline."}
          </p>
          <span className="text-[10px] text-stone-400 font-mono block mt-1">
            RCPSP Machine Projection
          </span>
        </div>
      </div>

      {/* Overtime Leadtime Compression Banner (Flow 2) */}
      <div className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300 dark:border-amber-800/80 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded-2xl border border-amber-300 dark:border-amber-700">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-950 dark:text-amber-200">
                Penjadwalan Overtime & Kompresi Leadtime (Flow 2)
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
                {overtimeList.length} Jadwal
              </span>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-300 mt-0.5">
              {overtimeList.length > 0 ? (
                <>
                  Tercatat <strong>{totalOtHours} jam lembur</strong> aktif, mempercepat leadtime setara ~<strong>{daysCompressed} hari kerja</strong>.
                </>
              ) : (
                "Belum ada lembur terjadwal. Analisa Capacity & LOT Optimizer untuk menetapkan lembur guna mengejar deadline SPK."
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            onClick={() => {
              setOptimizerInitialTab("OVERTIME_SCHEDULE");
              setShowOptimizerModal(true);
            }}
            size="sm"
            className="h-9 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Atur Lembur Operator
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lot / WOT Generation Card with Shift Calculation Engine (Section 7.3.1) */}
        <div className="bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-200 dark:border-stone-800 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded-xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-stone-900 dark:text-stone-100">WOT Lot Sizing Engine</h3>
              <p className="text-xs text-stone-500">Shift-based mathematical ticket optimization</p>
            </div>
          </div>

          <div className="p-4 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-2xl space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Target Shift (Hours)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={targetShiftHours}
                  onChange={(e) => setTargetShiftHours(Number(e.target.value))}
                  className="text-xs font-mono font-bold bg-white dark:bg-stone-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Lot Size (pcs/WOT)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={project?.qty || 10000}
                  value={customLotSize || 50}
                  onChange={(e) => setCustomLotSize(Number(e.target.value))}
                  disabled={lots.length > 0}
                  className="text-xs font-mono font-bold bg-white dark:bg-stone-900 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-[11px] text-blue-900 dark:text-blue-200 space-y-1">
              <div className="font-bold flex items-center justify-between">
                <span>Optimal Formula:</span>
                <span className="font-mono">(Shift × 60) / Bottleneck CT</span>
              </div>
              <p className="text-[10px] text-blue-700 dark:text-blue-300">
                Matches station rhythm to eliminate idle starvation across upstream & downstream handovers.
              </p>
            </div>

            <Button
              onClick={handleAutoGenerateWots}
              disabled={isCalculatingWot || lots.length > 0}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs h-9 rounded-xl disabled:bg-stone-200 disabled:text-stone-400"
            >
              {isCalculatingWot ? "Calculating & Generating..." : lots.length > 0 ? "WOTs Generated" : `Generate Optimized WOTs (${Math.ceil((project?.qty || 1) / (customLotSize || 50))} Lots)`}
            </Button>
          </div>

          {lots.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-stone-700 dark:text-stone-300">
                <span>Generated WOTs ({lots.length})</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowBatchQrModal(true)}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-black text-[11px]"
                  >
                    <QrCode className="w-3.5 h-3.5" /> 5×5cm Batch QR
                  </button>
                  <button
                    onClick={() => setShowLotsLabelsModal(true)}
                    className="text-stone-700 dark:text-stone-300 hover:underline flex items-center gap-1 font-black text-[11px]"
                  >
                    <Printer className="w-3.5 h-3.5" /> Travel Tags
                  </button>
                  <button
                    onClick={async () => {
                      const wotIds = lots.map(l => l.id);
                      if (wotIds.length > 0) {
                        const { generateWotBatchPdf } = await import("@/components/erp/BatchQrPdfRenderer");
                        await generateWotBatchPdf(lots.map(l => ({ ...l, project_name: project.name })));
                      }
                    }}
                    className="text-stone-700 dark:text-stone-300 hover:underline flex items-center gap-1 font-black text-[11px]"
                  >
                    <Printer className="w-3.5 h-3.5 text-blue-500" /> PDF A4
                  </button>
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {lots.map((l: any) => (
                  <div key={l.id} className="p-2.5 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-stone-900 dark:text-stone-100">{l.lot_number}</span>
                    <span className="text-stone-500">{l.target_qty || l.qty} {project?.uom || "pcs"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* WOT Dispatch & Station Routing Pipeline */}
        <div className="lg:col-span-2 bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-200 dark:border-stone-800 shadow-xs space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-stone-900 dark:text-stone-100">WOT Dispatch & Station Routing Pipeline</h3>
                <p className="text-xs text-stone-500">Continuous pull-based execution — floor processes available WIP & incoming material waves</p>
              </div>
              
              <Button
                onClick={() => setShowProcurementDrawer(true)}
                variant="secondary"
                size="sm"
                className="h-8 text-xs font-bold border-stone-300"
              >
                <Layers className="w-3.5 h-3.5 mr-1.5 text-stone-700" /> Procurement Waves Window
              </Button>
            </div>

            {/* Operational Principle Banner */}
            <div className="p-3.5 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-2xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-stone-900 dark:text-stone-100">
                  Continuous WIP Flow Active (Zero Material Gating)
                </h4>
                <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                  Production floor operates on continuous piece/lot flow. Stations process available WIP and incoming material without waiting for full BOM arrival. Materials are supplied in partial waves by warehouse terminal operations.
                </p>
              </div>
            </div>

            {/* Metric Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Total Scope</span>
                <p className="text-sm font-black text-stone-900 dark:text-stone-100 font-mono">
                  {project?.qty || 0} <span className="text-xs font-sans font-bold text-stone-500">{project?.uom || "pcs"}</span>
                </p>
              </div>

              <div className="p-3 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Batch Lot Size</span>
                <p className="text-sm font-black text-stone-900 dark:text-stone-100 font-mono">
                  {customLotSize || 50} <span className="text-xs font-sans font-bold text-stone-500">{project?.uom || "pcs"}/lot</span>
                </p>
              </div>

              <div className="p-3 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Planned WOTs</span>
                <p className="text-sm font-black text-emerald-700 dark:text-emerald-400 font-mono">
                  {lots.length} <span className="text-xs font-sans font-bold text-stone-500">Tickets</span>
                </p>
              </div>

              <div className="p-3 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">Station Stages</span>
                <p className="text-sm font-black text-stone-900 dark:text-stone-100 font-mono">
                  {stations.length || 3} <span className="text-xs font-sans font-bold text-stone-500">Sequential</span>
                </p>
              </div>
            </div>

            {/* Station Route Preview */}
            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase font-mono tracking-wider text-stone-500">
                Sequential Station Routing
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {stations.length === 0 ? (
                  <div className="p-3 bg-stone-50 dark:bg-stone-950 rounded-xl border border-stone-200 dark:border-stone-800 text-xs text-stone-500 w-full text-center">
                    Default sequence: Station #1 (Preparation) → Station #2 (Processing) → Station #3 (Inspection & Packing)
                  </div>
                ) : (
                  stations.map((st: any, idx: number) => (
                    <React.Fragment key={st.id || idx}>
                      <div className="px-3 py-2 bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl flex items-center gap-2 text-xs">
                        <span className="w-5 h-5 rounded-md bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-mono font-bold text-[10px] flex items-center justify-center">
                          #{st.station_sequence || idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-stone-900 dark:text-stone-100 block text-xs">
                            {st.station_name || st.name || `Station ${idx + 1}`}
                          </span>
                          <span className="text-[10px] text-stone-500 font-mono">{st.station_code || `ST-0${idx + 1}`}</span>
                        </div>
                      </div>
                      {idx < stations.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-stone-400 shrink-0" />
                      )}
                    </React.Fragment>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
            <Button
              onClick={() => setShowOptimizerModal(true)}
              variant="secondary"
              className="text-xs font-bold h-10 px-4 rounded-xl"
            >
              <Sliders className="w-4 h-4 mr-1.5 text-stone-700 dark:text-stone-300" /> Capacity & Lot Optimizer
            </Button>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => setCurrentPhase('LOGGER')}
                disabled={lots.length === 0}
                className="bg-stone-900 hover:bg-stone-800 text-white font-black text-xs h-10 px-6 rounded-xl disabled:bg-stone-200 disabled:text-stone-400"
              >
                <Play className="w-4 h-4 mr-2 fill-current" /> Release to Production Logger
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 30-Day Machine Load Heatmap (Section 7.4.2) */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-black text-stone-900 dark:text-stone-100">
              30-Day Machine Load Heatmap Matrix
            </h3>
            <span className="text-[10px] font-mono text-stone-500 font-bold ml-2">
              (Green: &lt;75% • Amber: 75-100% • Red: &gt;100% • Dark Red: NDP Down)
            </span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => setTimelineView("grid")}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                timelineView === "grid" ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700"
              }`}
            >
              30-Day Grid
            </button>
            <button
              type="button"
              onClick={() => setTimelineView("bars")}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors ${
                timelineView === "bars" ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700"
              }`}
            >
              Bar List
            </button>
          </div>
        </div>

        <div className="p-4 overflow-x-auto">
          {timelineView === "grid" ? (
            <div className="min-w-[700px] space-y-2">
              {/* Date Header Columns */}
              <div className="flex items-center text-[10px] font-mono font-bold text-stone-500 border-b border-stone-200 dark:border-stone-800 pb-2">
                <div className="w-44 shrink-0 truncate">Machine Name / Code</div>
                <div className="w-16 shrink-0 text-center">Avg Load</div>
                <div className="flex-1 grid grid-cols-15 sm:grid-cols-30 gap-1 text-center">
                  {timelineDates.slice(0, 20).map((d, dIdx) => (
                    <div key={dIdx} className="truncate text-[9px]" title={d}>
                      {d.slice(8, 10)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Machine Rows */}
              {machineLoadDetail.map((m, mIdx) => {
                const isDown = m.is_down || m.status === 'BLOCKED_NDP';
                return (
                  <div key={mIdx} className="flex items-center text-xs py-1.5 border-b border-stone-100 dark:border-stone-800/50 hover:bg-stone-50/80 dark:hover:bg-stone-800/30 transition-colors">
                    <div className="w-44 shrink-0 flex items-center gap-1.5 truncate pr-2">
                      <Cpu className={`w-3.5 h-3.5 shrink-0 ${isDown ? 'text-rose-500 animate-pulse' : 'text-stone-400'}`} />
                      <div className="truncate">
                        <span className="font-bold text-stone-800 dark:text-stone-200 block truncate" title={m.machine}>
                          {m.machine}
                        </span>
                        <span className="text-[9px] font-mono text-stone-400">{m.machine_code} • {m.category || "MACHINE"}</span>
                      </div>
                    </div>

                    <div className="w-16 shrink-0 text-center font-mono font-bold text-[11px]">
                      <span className={m.load_percent > 100 ? "text-rose-600 font-black" : (m.load_percent >= 75 ? "text-amber-600" : "text-emerald-600")}>
                        {m.load_percent}%
                      </span>
                    </div>

                    <div className="flex-1 grid grid-cols-15 sm:grid-cols-30 gap-1">
                      {(m.daily_loads || []).slice(0, 20).map((dl: any, dlIdx: number) => {
                        let cellBg = "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800";
                        if (dl.status === 'BLOCKED_NDP') {
                          cellBg = "bg-rose-900 text-white font-black animate-pulse";
                        } else if (dl.status === 'OVERLOADED') {
                          cellBg = "bg-rose-500 text-white font-bold";
                        } else if (dl.status === 'OPTIMAL') {
                          cellBg = "bg-amber-300 dark:bg-amber-900 text-amber-950 dark:text-amber-200";
                        } else if (dl.hours === 0) {
                          cellBg = "bg-stone-100 dark:bg-stone-800 text-stone-400";
                        }

                        return (
                          <div
                            key={dlIdx}
                            className={`h-7 rounded flex items-center justify-center text-[9px] font-mono cursor-pointer transition-transform hover:scale-110 shadow-2xs ${cellBg}`}
                            title={`${m.machine} on ${dl.date}: ${dl.hours}h load (${dl.load_percent}%) - Status: ${dl.status}`}
                          >
                            {dl.status === 'BLOCKED_NDP' ? 'NDP' : (dl.hours > 0 ? `${dl.hours.toFixed(0)}h` : '-')}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="min-w-[400px] space-y-3">
              {heatmapData.map((hm, i) => {
                const detail = machineLoadDetail.find(m => m.machine_id === hm.machine_id || m.machine_code === hm.machine_code);
                const isDown = hm.is_down || hm.status === 'BLOCKED_NDP';
                const isOverloaded = hm.loadPercent > 100 || hm.status === 'OVERLOADED';
                const isOptimal = hm.loadPercent >= 75 && !isOverloaded && !isDown;

                return (
                  <div key={i} className="p-2.5 rounded-2xl bg-stone-50/70 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate max-w-[70%]">
                        <Cpu className={`w-3.5 h-3.5 shrink-0 ${isDown ? 'text-rose-500 animate-pulse' : 'text-stone-500'}`} />
                        <span className="font-bold text-stone-800 dark:text-stone-200 truncate" title={hm.machine}>
                          {hm.machine}
                        </span>
                        {hm.machine_code && (
                          <span className="text-[10px] font-mono text-stone-400">({hm.machine_code})</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isDown ? (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-md text-[10px] font-bold flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-rose-600" /> DOWN (NDP)
                          </span>
                        ) : isOverloaded ? (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md text-[10px] font-bold">
                            OVERLOADED ({hm.loadPercent}%)
                          </span>
                        ) : isOptimal ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[10px] font-bold">
                            OPTIMAL ({hm.loadPercent}%)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold">
                            NORMAL ({hm.loadPercent}%)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-stone-200/80 dark:bg-stone-700 rounded-full h-2.5 overflow-hidden relative">
                        <div 
                          className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                            isDown ? 'bg-rose-600 animate-pulse' : (isOverloaded ? 'bg-rose-500' : (isOptimal ? 'bg-amber-400' : 'bg-emerald-500'))
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, hm.loadPercent))}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono font-bold text-[11px] text-stone-600 dark:text-stone-300">
                        {hm.loadPercent}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Master Production Gantt Timeline (RCPSP) */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-xs overflow-hidden space-y-0">
        {/* Gantt Header & Interactive Controls */}
        <div className="p-5 border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800">
                <Layers className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-base font-black text-stone-900 dark:text-stone-100 tracking-tight">
                  Master Production Gantt Timeline (RCPSP)
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Visualisasi jadwal proses, durasi siklus WOT, dan ketergantungan stasiun kerja real-time.
                </p>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Search Filter */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={ganttSearch}
                onChange={(e) => setGanttSearch(e.target.value)}
                placeholder="Cari proses/mesin..."
                className="pl-8 pr-3 py-1.5 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl text-xs font-medium text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 w-36 sm:w-44"
              />
              {ganttSearch && (
                <button
                  onClick={() => setGanttSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* View Mode Toggle: Process vs Machine */}
            <div className="flex items-center bg-stone-200/80 dark:bg-stone-800 p-0.5 rounded-xl text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setGanttViewMode("PROCESS")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  ganttViewMode === "PROCESS" 
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs font-black" 
                    : "text-stone-600 dark:text-stone-400 hover:text-stone-900"
                }`}
              >
                By Process
              </button>
              <button
                type="button"
                onClick={() => setGanttViewMode("MACHINE")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  ganttViewMode === "MACHINE" 
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs font-black" 
                    : "text-stone-600 dark:text-stone-400 hover:text-stone-900"
                }`}
              >
                Machine Swimlanes
              </button>
            </div>

            {/* Scope Toggle: Current Project vs Fleet */}
            <div className="flex items-center bg-stone-200/80 dark:bg-stone-800 p-0.5 rounded-xl text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setShowAllProjects(false)}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${
                  !showAllProjects 
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs font-black" 
                    : "text-stone-600 dark:text-stone-400 hover:text-stone-900"
                }`}
              >
                Proyek Ini
              </button>
              <button
                type="button"
                onClick={() => setShowAllProjects(true)}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${
                  showAllProjects 
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs font-black" 
                    : "text-stone-600 dark:text-stone-400 hover:text-stone-900"
                }`}
              >
                Semua Proyek ({allScheduleData.length})
              </button>
            </div>

            {/* Days Window Toggle: 14 vs 30 Days */}
            <div className="flex items-center bg-stone-200/80 dark:bg-stone-800 p-0.5 rounded-xl text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setGanttWindowDays(14)}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${
                  ganttWindowDays === 14 
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs font-black" 
                    : "text-stone-600 dark:text-stone-400 hover:text-stone-900"
                }`}
              >
                14 Hari
              </button>
              <button
                type="button"
                onClick={() => setGanttWindowDays(30)}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${
                  ganttWindowDays === 30 
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-2xs font-black" 
                    : "text-stone-600 dark:text-stone-400 hover:text-stone-900"
                }`}
              >
                30 Hari
              </button>
            </div>
          </div>
        </div>

        {/* Legend Toolbar */}
        <div className="px-5 py-2.5 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-center justify-between gap-4 text-xs font-semibold overflow-x-auto">
          <div className="flex items-center gap-4 text-[11px] shrink-0">
            <span className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
              Selesai
            </span>
            <span className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
              Berjalan
            </span>
            <span className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
              Direncanakan
            </span>
            <span className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-300 inline-block" />
              Critical Path
            </span>
            <span className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse inline-block" />
              Kendala Mesin (NDP)
            </span>
          </div>

          <div className="text-[10px] font-mono text-stone-400 dark:text-stone-500 shrink-0">
            Total {filteredScheduleList.length} Task Terjadwal
          </div>
        </div>

        {/* Timeline Canvas Container */}
        <div className="overflow-x-auto">
          <div className="min-w-[920px]">
            {/* Synchronized Date Header Row */}
            <div className="flex border-b border-stone-200 dark:border-stone-800 bg-stone-50/90 dark:bg-stone-900/90 text-[10px] font-bold text-stone-500 dark:text-stone-400">
              <div className="w-64 md:w-72 p-3 border-r border-stone-200 dark:border-stone-800 shrink-0 uppercase tracking-wider font-extrabold flex items-center justify-between">
                <span>{ganttViewMode === "PROCESS" ? "Tahap Proses / Mesin" : "Workstation / Mesin"}</span>
                <span className="text-[9px] font-mono font-normal opacity-70">Info</span>
              </div>
              <div className="flex-1 flex">
                {ganttDays.map((d, i) => (
                  <div
                    key={i}
                    className={`flex-1 p-2 text-center border-r border-stone-100 dark:border-stone-800/80 font-mono text-[10px] transition-colors ${
                      d.isToday 
                        ? "bg-amber-100/70 text-amber-950 font-black border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700" 
                        : d.isWeekend
                        ? "bg-stone-100/40 dark:bg-stone-800/20 text-stone-400"
                        : "text-stone-600 dark:text-stone-300"
                    }`}
                  >
                    <div className="text-[8px] uppercase tracking-wider opacity-75">{d.weekday}</div>
                    <div className="font-bold">{d.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Empty State */}
            {filteredScheduleList.length === 0 ? (
              <div className="p-12 text-center space-y-3 bg-white dark:bg-stone-900">
                <Calendar className="w-10 h-10 text-stone-300 dark:text-stone-600 mx-auto" />
                <div className="text-xs font-bold text-stone-700 dark:text-stone-300">
                  Tidak ada tahapan jadwal operasional yang ditemukan.
                </div>
                <p className="text-[11px] text-stone-400 dark:text-stone-500 max-w-sm mx-auto">
                  {ganttSearch 
                    ? `Tidak ada hasil pencocokan untuk "${ganttSearch}". Coba kata kunci lain.` 
                    : "Konfigurasikan proses alur kerja (BoP) pada tahap Setup & Master untuk memvisualisasikan timeline produksi."}
                </p>
                {ganttSearch && (
                  <Button
                    onClick={() => setGanttSearch("")}
                    variant="secondary"
                    size="sm"
                    className="rounded-xl font-bold text-xs"
                  >
                    Reset Filter
                  </Button>
                )}
              </div>
            ) : ganttViewMode === "PROCESS" ? (
              /* VIEW MODE A: BY PROCESS SEQUENCE */
              <div className="divide-y divide-stone-100 dark:divide-stone-800/60 text-xs bg-white dark:bg-stone-900">
                {filteredScheduleList.map((g, i) => {
                  const isBlocked = Boolean(g.is_machine_down);
                  const isCritical = Boolean(g.is_critical);
                  const isCompleted = g.progress === 100 || g.status === "COMPLETED";
                  const isRunning = g.status === "RUNNING";
                  const coords = getBarCoordinates(g);

                  let barBg = "bg-indigo-600 text-white border-indigo-700";
                  if (isBlocked) {
                    barBg = "bg-rose-600 text-white border-rose-700 animate-pulse";
                  } else if (isCritical) {
                    barBg = "bg-amber-500 text-amber-950 font-black border-2 border-amber-600 ring-2 ring-amber-400/40 shadow-xs";
                  } else if (isCompleted) {
                    barBg = "bg-emerald-600 text-white border-emerald-700";
                  } else if (isRunning) {
                    barBg = "bg-blue-600 text-white border-blue-700";
                  }

                  return (
                    <div 
                      key={g.id || i} 
                      className="flex items-center h-12 hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors group"
                    >
                      {/* Left Process Info Cell */}
                      <div className="w-64 md:w-72 px-3.5 py-1 shrink-0 border-r border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="w-4.5 h-4.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono text-[9px] font-black flex items-center justify-center shrink-0">
                              #{i + 1}
                            </span>
                            <span className="font-bold text-stone-900 dark:text-stone-100 truncate text-xs" title={g.name || g.process_name}>
                              {g.process_name || g.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 truncate text-[10px] text-stone-500 dark:text-stone-400 font-mono">
                            <span className="truncate">{g.machine || "Workstation"}</span>
                            {g.machine_code && <span>• {g.machine_code}</span>}
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isCritical && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[8px] font-black uppercase">
                              CPM
                            </span>
                          )}
                          {isBlocked && (
                            <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded text-[8px] font-black uppercase flex items-center gap-0.5">
                              <ShieldAlert className="w-2.5 h-2.5" /> NDP
                            </span>
                          )}
                          <button
                            onClick={() => setRescheduleModal({ isOpen: true, task: g, selectedMachineId: g.machine_id || "" })}
                            className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                            title="Reassign / Reallocate Machine"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Right Timeline Grid Cell */}
                      <div className="flex-1 h-full relative flex items-center">
                        {/* Background Day Columns */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {ganttDays.map((d, dIdx) => (
                            <div
                              key={dIdx}
                              className={`flex-1 border-r border-stone-100 dark:border-stone-800/40 h-full ${
                                d.isToday ? "bg-amber-50/20 dark:bg-amber-950/20" : ""
                              }`}
                            />
                          ))}
                        </div>

                        {/* Positioned Task Bar */}
                        <div
                          style={{
                            left: `${coords.left}%`,
                            width: `${coords.width}%`,
                          }}
                          onClick={() => setRescheduleModal({ isOpen: true, task: g, selectedMachineId: g.machine_id || "" })}
                          className={`absolute h-7 rounded-xl px-2.5 flex items-center justify-between text-[10px] font-bold shadow-xs cursor-pointer transition-transform hover:scale-[1.01] hover:brightness-105 select-none ${barBg}`}
                          title={`${g.name} | Mesin: ${g.machine} | Start: ${g.startDate?.slice(0, 10) || 'Now'} → Finish: ${g.endDate?.slice(0, 10) || 'TBD'} (${g.durationHours} jam)`}
                        >
                          <span className="truncate flex items-center gap-1 font-mono font-bold">
                            {isCompleted && <CheckCircle2 className="w-3 h-3 text-white inline shrink-0" />}
                            {isRunning && <Clock className="w-3 h-3 text-white animate-spin inline shrink-0" />}
                            {isBlocked && <ShieldAlert className="w-3 h-3 text-white inline shrink-0" />}
                            <span className="truncate">{g.durationHours}h • {g.process_name || g.name}</span>
                          </span>

                          <span className="text-[9px] font-mono opacity-90 shrink-0 ml-1.5 hidden sm:inline">
                            {g.progress || 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* VIEW MODE B: MACHINE SWIMLANES */
              <div className="divide-y divide-stone-100 dark:divide-stone-800/60 text-xs bg-white dark:bg-stone-900">
                {Object.keys(machineSwimlanes).map((mName, mIdx) => {
                  const tasksOnMachine = machineSwimlanes[mName] || [];

                  return (
                    <div 
                      key={mIdx} 
                      className="flex items-center min-h-[52px] hover:bg-stone-50/70 dark:hover:bg-stone-800/30 transition-colors group"
                    >
                      {/* Left Machine Header Cell */}
                      <div className="w-64 md:w-72 px-3.5 py-2 shrink-0 border-r border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 shrink-0">
                            <Cpu className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-stone-900 dark:text-stone-100 truncate text-xs" title={mName}>
                              {mName}
                            </div>
                            <div className="text-[10px] text-stone-400 font-mono">
                              {tasksOnMachine.length} Task Assigned
                            </div>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 shrink-0">
                          {tasksOnMachine.reduce((acc, t) => acc + (Number(t.durationHours) || 0), 0).toFixed(0)}h Load
                        </span>
                      </div>

                      {/* Right Timeline Canvas with All Machine Tasks */}
                      <div className="flex-1 h-full min-h-[52px] relative flex items-center py-1">
                        {/* Background Day Columns */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {ganttDays.map((d, dIdx) => (
                            <div
                              key={dIdx}
                              className={`flex-1 border-r border-stone-100 dark:border-stone-800/40 h-full ${
                                d.isToday ? "bg-amber-50/20 dark:bg-amber-950/20" : ""
                              }`}
                            />
                          ))}
                        </div>

                        {/* Render All Tasks for this Machine */}
                        {tasksOnMachine.map((task, tIdx) => {
                          const coords = getBarCoordinates(task);
                          const isBlocked = Boolean(task.is_machine_down);
                          const isCritical = Boolean(task.is_critical);
                          const isCompleted = task.progress === 100 || task.status === "COMPLETED";

                          let swimBg = "bg-blue-600 text-white border-blue-700";
                          if (isBlocked) swimBg = "bg-rose-600 text-white border-rose-700 animate-pulse";
                          else if (isCritical) swimBg = "bg-amber-500 text-amber-950 font-black border-2 border-amber-600";
                          else if (isCompleted) swimBg = "bg-emerald-600 text-white border-emerald-700";

                          return (
                            <div
                              key={task.id || tIdx}
                              style={{
                                left: `${coords.left}%`,
                                width: `${coords.width}%`,
                              }}
                              onClick={() => setRescheduleModal({ isOpen: true, task, selectedMachineId: task.machine_id || "" })}
                              className={`absolute h-7 rounded-xl px-2 flex items-center justify-between text-[10px] font-bold shadow-xs cursor-pointer transition-transform hover:scale-[1.01] hover:brightness-105 select-none ${swimBg}`}
                              title={`${task.name} (${task.durationHours}h) | Start: ${task.startDate?.slice(0, 10)} → Finish: ${task.endDate?.slice(0, 10)}`}
                            >
                              <span className="truncate font-mono">
                                {task.durationHours}h • {task.name?.replace(/\[.*?\]\s*/, '')}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRescheduleModal({ isOpen: true, task, selectedMachineId: task.machine_id || "" });
                                }}
                                className="p-0.5 hover:bg-black/20 rounded ml-1"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manual Reschedule & Machine Reassignment Modal (Section 13.5) */}
      <Modal
        isOpen={rescheduleModal.isOpen && Boolean(rescheduleModal.task)}
        onClose={() => setRescheduleModal({ isOpen: false, task: null, selectedMachineId: "" })}
        maxWidth="md"
        contentClassName="p-6 space-y-4"
        title={
          <div className="flex items-center gap-2 text-base font-black text-stone-900 dark:text-stone-100">
            <Edit3 className="w-4 h-4 text-blue-600" /> Manual Schedule Reallocation
          </div>
        }
      >
        {rescheduleModal.task && (
          <div className="space-y-4">
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-stone-50 dark:bg-stone-950 rounded-2xl border border-stone-200 dark:border-stone-800 space-y-1">
                <div className="font-bold text-stone-900 dark:text-stone-100">{rescheduleModal.task.name}</div>
                <div className="text-stone-500 font-mono">Current Machine: {rescheduleModal.task.machine}</div>
                <div className="text-stone-500 font-mono">Estimated Duration: {rescheduleModal.task.durationHours} hours</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  Assign Alternative Fleet Machine
                </label>
                <select
                  value={rescheduleModal.selectedMachineId}
                  onChange={(e) => setRescheduleModal(prev => ({ ...prev, selectedMachineId: e.target.value }))}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl text-xs font-bold text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select Target Machine --</option>
                  {machineLoadDetail.map((m) => (
                    <option key={m.machine_id} value={m.machine_id} disabled={m.is_down}>
                      {m.machine} ({m.machine_code}) {m.is_down ? "- [DOWN UNDER NDP]" : `- ${m.load_percent}% load`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRescheduleModal({ isOpen: false, task: null, selectedMachineId: "" })}
                className="rounded-xl font-bold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApplyReschedule}
                disabled={isSavingReschedule || !rescheduleModal.selectedMachineId}
                className="bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold"
              >
                {isSavingReschedule ? "Applying..." : "Apply Reschedule"}
              </Button>
            </div>
          </div>
        )}
      </Modal>


      {/* Unified Production Capacity & Lot Optimizer Modal */}
      {showOptimizerModal && (
        <WotSizeOptimizerModal
          isOpen={showOptimizerModal}
          onClose={() => setShowOptimizerModal(false)}
          projectId={project?.id}
          project={project}
          currentLotSize={customLotSize || 50}
          initialTab={optimizerInitialTab}
          onApplyLotSize={(newSize) => setCustomLotSize(newSize)}
        />
      )}
      
      {/* WOT Travel Tags Generator Modal */}
      {showLotsLabelsModal && (
        <LotsLabelsModal
          isOpen={showLotsLabelsModal}
          onClose={() => setShowLotsLabelsModal(false)}
          lots={lots}
          project={project}
        />
      )}

      {/* 5x5cm Cryptographic WOT QR Batch Printer */}
      {showBatchQrModal && (
        <WotQrBatchPrintModal
          isOpen={showBatchQrModal}
          onClose={() => setShowBatchQrModal(false)}
          projectId={project?.id}
          projectName={project?.name}
          spkNumber={project?.spk_number || project?.project_code || "SPK"}
        />
      )}
    </div>
  );
}

