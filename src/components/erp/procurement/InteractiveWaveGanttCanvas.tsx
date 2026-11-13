import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { canViewDocFinancials } from "@/utils/rbacFinancials";
import {
  WaveBottleneckInsightPanel,
  WaveBottleneckMetric,
} from "./WaveBottleneckInsightPanel";
import {
  InteractiveWaveGanttCanvasProps,
  TimeScalePreset,
  WaveDragState,
  WaveGanttItem,
  WaveGanttRow,
  WaveScheduleEntry,
  WaveScheduleSnapshot,
} from "./gantt/ganttTypes";
import {
  addDays,
  computeCashflowSummary,
  computeDayTicks,
  computeLiveBottleneckMetrics,
  computeMonthSpans,
  computeStepDays,
  computeTimelineBounds,
} from "./gantt/ganttDateUtils";
import { GanttCommandBar } from "./gantt/GanttCommandBar";
import { GanttLeftMenuPane } from "./gantt/GanttLeftMenuPane";
import { GanttWaveTrackRow } from "./gantt/GanttWaveTrackRow";
import { GanttFloatingDock } from "./gantt/GanttFloatingDock";
import { GanttMinimapHud } from "./gantt/GanttMinimapHud";

export type { WaveGanttItem, WaveGanttRow, InteractiveWaveGanttCanvasProps };

export const InteractiveWaveGanttCanvas: React.FC<
  InteractiveWaveGanttCanvasProps
> = ({
  waves,
  projectName,
  spkNumber,
  masterStartDate,
  masterEndDate,
  earliestFeasibleStart,
  isLocked = false,
  onActivateStrategyPlanning,
  onWaveDateChange,
  onBatchWaveDateChange,
  onLiveBottleneckMetricsUpdate,
  selectedWaveNumbers: controlledSelectedWaves,
  onSelectedWavesChange,
  strategyMode = "BOP_STAGE_AND_WOT_LOT",
  onStrategyModeChange,
  wotLotsPerWave = 2,
  totalWotLots = 1,
  onWotLotsPerWaveChange,
  leadTimeBufferDays = 3,
  onLeadTimeBufferDaysChange,
  vendorSlipSimDays = 0,
  onApplyVendorSlipSimulation,
  onAutoRealignSchedule,
  onResetDatesToBaseline,
  isSaving = false,
  onSavePlan,
  submitStrategyLabel = "Submit Strategy",
}) => {
  const { user } = useAuth();
  const canSeeFinancials = canViewDocFinancials(user, "PO");

  const mainViewportRef = useRef<HTMLDivElement>(null);
  const leftPanelScrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const todayIso = new Date().toISOString().split("T")[0];

  // Fullscreen & UI View States
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [timeScalePreset, setTimeScalePreset] = useState<TimeScalePreset>("MONTH");
  const [interactionMode, setInteractionMode] = useState<"PAN" | "SELECT">("PAN");
  const [wheelZoomEnabled, setWheelZoomEnabled] = useState<boolean>(true);
  const [showMinimap, setShowMinimap] = useState<boolean>(true);
  const [expandedWaveNums, setExpandedWaveNums] = useState<Record<number, boolean>>({});
  const [showConnectors, setShowConnectors] = useState<boolean>(true);
  const [showCashflowStrip, setShowCashflowStrip] = useState<boolean>(true);
  const [showFullscreenDiagnostics, setShowFullscreenDiagnostics] = useState<boolean>(false);
  const [isViewSettingsOpen, setIsViewSettingsOpen] = useState<boolean>(false);
  const [isSearchFilterOpen, setIsSearchFilterOpen] = useState<boolean>(false);

  // Search, Bottleneck Filter & Row Lock States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [onlyBottlenecks, setOnlyBottlenecks] = useState<boolean>(false);
  const [lockedWaveNumbers, setLockedWaveNumbers] = useState<number[]>([]);

  // Undo / Redo History Stacks (up to 30 snapshots)
  const [undoStack, setUndoStack] = useState<WaveScheduleSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<WaveScheduleSnapshot[]>([]);

  const captureSnapshot = useCallback(
    (label: string): WaveScheduleSnapshot => ({
      timestamp: Date.now(),
      label,
      entries: waves.map((w) => ({
        waveNumber: w.wave_number,
        orderDate: w.target_order_date || todayIso,
        arrivalDate: w.target_arrival_date || todayIso,
      })),
    }),
    [waves, todayIso],
  );

  const pushUndoSnapshot = useCallback(
    (label: string) => {
      const snap = captureSnapshot(label);
      setUndoStack((prev) => [...prev.slice(-29), snap]);
      setRedoStack([]);
    },
    [captureSnapshot],
  );

  const applyScheduleEntries = useCallback(
    (entries: WaveScheduleEntry[]) => {
      const updates = entries.map((e) => ({
        waveNumber: e.waveNumber,
        newOrderDate: e.orderDate,
        newArrivalDate: e.arrivalDate,
      }));
      if (onBatchWaveDateChange) {
        onBatchWaveDateChange(updates);
      } else {
        updates.forEach((u) =>
          onWaveDateChange(u.waveNumber, u.newOrderDate, u.newArrivalDate),
        );
      }
    },
    [onBatchWaveDateChange, onWaveDateChange],
  );

  const handleUndo = useCallback(() => {
    if (isLocked || undoStack.length === 0) return;
    const targetSnap = undoStack[undoStack.length - 1];
    const currentSnap = captureSnapshot("Undo point");
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-29), currentSnap]);
    applyScheduleEntries(targetSnap.entries);
  }, [isLocked, undoStack, captureSnapshot, applyScheduleEntries]);

  const handleRedo = useCallback(() => {
    if (isLocked || redoStack.length === 0) return;
    const targetSnap = redoStack[redoStack.length - 1];
    const currentSnap = captureSnapshot("Redo point");
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-29), currentSnap]);
    applyScheduleEntries(targetSnap.entries);
  }, [isLocked, redoStack, captureSnapshot, applyScheduleEntries]);

  // Internal Selection State (synchronized with parent if controlled)
  const [internalSelectedWaves, setInternalSelectedWaves] = useState<number[]>([]);
  const selectedWaveNumbers = controlledSelectedWaves ?? internalSelectedWaves;

  const updateSelectedWaves = useCallback(
    (next: number[]) => {
      const uniqueSorted = Array.from(new Set(next)).sort((a, b) => a - b);
      setInternalSelectedWaves(uniqueSorted);
      onSelectedWavesChange?.(uniqueSorted);
    },
    [onSelectedWavesChange],
  );

  // Resizable Left Menu / Right GANTT Divider Split
  const [leftPanelWidthPx, setLeftPanelWidthPx] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("erp_procurement_gantt_split_px");
      if (saved) {
        const val = Number(saved);
        if (!isNaN(val) && val >= 220 && val <= 650) return val;
      }
    } catch (_) {}
    return 370;
  });
  const [isResizingSplitter, setIsResizingSplitter] = useState<boolean>(false);

  const startSplitterResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingSplitter(true);
  }, []);

  useEffect(() => {
    if (!isResizingSplitter) return;

    const handleSplitterMove = (e: MouseEvent) => {
      const container = mainViewportRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const newWidth = Math.max(220, Math.min(650, relativeX));
      setLeftPanelWidthPx(Math.round(newWidth));
    };

    const handleSplitterUp = () => {
      setIsResizingSplitter(false);
      try {
        localStorage.setItem(
          "erp_procurement_gantt_split_px",
          String(leftPanelWidthPx),
        );
      } catch (_) {}
    };

    window.addEventListener("mousemove", handleSplitterMove);
    window.addEventListener("mouseup", handleSplitterUp);
    return () => {
      window.removeEventListener("mousemove", handleSplitterMove);
      window.removeEventListener("mouseup", handleSplitterUp);
    };
  }, [isResizingSplitter, leftPanelWidthPx]);

  // Viewport Scroll Ratio for Minimap HUD
  const [viewportThumb, setViewportThumb] = useState<{
    leftPct: number;
    widthPct: number;
  }>({
    leftPct: 0,
    widthPct: 100,
  });

  // Canvas Pan-Drag State
  const [panState, setPanState] = useState<{
    isPanning: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  // Marquee Box Selection State
  const [marqueeState, setMarqueeState] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    additive: boolean;
    initialSelected: number[];
  } | null>(null);

  // Active Bar Drag/Resize State
  const [dragState, setDragState] = useState<WaveDragState | null>(null);

  const refreshViewportThumb = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const sw = Math.max(1, el.scrollWidth);
    const cw = el.clientWidth;
    const leftPct = Math.max(0, Math.min(100, (el.scrollLeft / sw) * 100));
    const widthPct = Math.max(10, Math.min(100, (cw / sw) * 100));
    setViewportThumb({ leftPct, widthPct });
  }, []);

  useEffect(() => {
    refreshViewportThumb();
  }, [zoomLevel, waves.length, isFullscreen, refreshViewportThumb]);

  // Direct Cursor Focal-Point Mouse-Wheel Zoom on Canvas (works in both normal & fullscreen Portal mode)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!wheelZoomEnabled && !e.ctrlKey && !e.metaKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey && !e.metaKey) {
        return;
      }
      e.preventDefault();

      const container = scrollContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseClientX = e.clientX - rect.left;
      const currentScrollLeft = container.scrollLeft;
      const currentContentX = currentScrollLeft + mouseClientX;
      const currentScrollWidth = container.scrollWidth;

      const direction = e.deltaY < 0 ? 1 : -1;
      const step = e.ctrlKey || e.metaKey ? 20 : 15;

      setZoomLevel((prevZoom) => {
        const nextZoom = Math.max(50, Math.min(350, prevZoom + direction * step));
        if (nextZoom === prevZoom) return prevZoom;

        requestAnimationFrame(() => {
          if (!scrollContainerRef.current) return;
          const newScrollWidth = scrollContainerRef.current.scrollWidth;
          if (currentScrollWidth > 0 && newScrollWidth > 0) {
            const ratio = currentContentX / currentScrollWidth;
            const targetScrollLeft = ratio * newScrollWidth - mouseClientX;
            scrollContainerRef.current.scrollLeft = Math.max(0, targetScrollLeft);
            refreshViewportThumb();
          }
        });

        return nextZoom;
      });
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [wheelZoomEnabled, isFullscreen, waves.length, refreshViewportThumb]);

  // Viewport Centered Zoom for Toolbar & Dock Buttons
  const handleButtonZoom = useCallback(
    (delta: number) => {
      const container = scrollContainerRef.current;
      if (!container) {
        setZoomLevel((z) => Math.max(50, Math.min(350, z + delta)));
        return;
      }
      const currentScrollLeft = container.scrollLeft;
      const clientWidth = container.clientWidth;
      const centerClientX = clientWidth / 2;
      const currentContentX = currentScrollLeft + centerClientX;
      const currentScrollWidth = container.scrollWidth;

      setZoomLevel((prevZoom) => {
        const nextZoom = Math.max(50, Math.min(350, prevZoom + delta));
        if (nextZoom === prevZoom) return prevZoom;

        requestAnimationFrame(() => {
          if (!scrollContainerRef.current) return;
          const newScrollWidth = scrollContainerRef.current.scrollWidth;
          if (currentScrollWidth > 0 && newScrollWidth > 0) {
            const ratio = currentContentX / currentScrollWidth;
            const targetScrollLeft = ratio * newScrollWidth - centerClientX;
            scrollContainerRef.current.scrollLeft = Math.max(0, targetScrollLeft);
            refreshViewportThumb();
          }
        });

        return nextZoom;
      });
    },
    [refreshViewportThumb],
  );

  // Preset Time Scale Switcher (Day | Week | Month)
  const handleTimeScalePresetChange = useCallback(
    (preset: TimeScalePreset) => {
      setTimeScalePreset(preset);
      const targetZoom =
        preset === "DAY" ? 210 : preset === "WEEK" ? 140 : 100;
      const container = scrollContainerRef.current;
      if (!container) {
        setZoomLevel(targetZoom);
        return;
      }
      const currentScrollLeft = container.scrollLeft;
      const centerClientX = container.clientWidth / 2;
      const currentContentX = currentScrollLeft + centerClientX;
      const currentScrollWidth = container.scrollWidth;

      setZoomLevel(targetZoom);
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return;
        const newScrollWidth = scrollContainerRef.current.scrollWidth;
        if (currentScrollWidth > 0 && newScrollWidth > 0) {
          const ratio = currentContentX / currentScrollWidth;
          const targetScrollLeft = ratio * newScrollWidth - centerClientX;
          scrollContainerRef.current.scrollLeft = Math.max(0, targetScrollLeft);
          refreshViewportThumb();
        }
      });
    },
    [refreshViewportThumb],
  );

  // Close Fullscreen on Escape key & Undo/Redo Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      if (e.key === "Escape") {
        if (isViewSettingsOpen) {
          setIsViewSettingsOpen(false);
          return;
        }
        if (isSearchFilterOpen) {
          setIsSearchFilterOpen(false);
          return;
        }
        if (isFullscreen) {
          setIsFullscreen(false);
          return;
        }
      }

      if (!isLocked && !isInputFocused && (e.ctrlKey || e.metaKey)) {
        if (e.key.toLowerCase() === "z" && !e.shiftKey) {
          if (undoStack.length > 0) {
            e.preventDefault();
            handleUndo();
          }
        } else if (
          (e.key.toLowerCase() === "z" && e.shiftKey) ||
          e.key.toLowerCase() === "y"
        ) {
          if (redoStack.length > 0) {
            e.preventDefault();
            handleRedo();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isFullscreen,
    isViewSettingsOpen,
    isSearchFilterOpen,
    isLocked,
    undoStack.length,
    redoStack.length,
    handleUndo,
    handleRedo,
  ]);

  // Prevent body scroll when Fullscreen is active
  useEffect(() => {
    if (isFullscreen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isFullscreen]);

  const toggleWaveExpand = useCallback((waveNum: number) => {
    setExpandedWaveNums((prev) => ({
      ...prev,
      [waveNum]: !prev[waveNum],
    }));
  }, []);

  const handleToggleLockWave = useCallback((waveNum: number) => {
    setLockedWaveNumbers((prev) =>
      prev.includes(waveNum)
        ? prev.filter((n) => n !== waveNum)
        : [...prev, waveNum],
    );
  }, []);

  const handleToggleLockSelectedOrAll = useCallback(() => {
    const targets =
      selectedWaveNumbers.length > 0
        ? selectedWaveNumbers
        : waves.map((w) => w.wave_number);
    const allTargetsLocked = targets.every((n) =>
      lockedWaveNumbers.includes(n),
    );
    if (allTargetsLocked) {
      setLockedWaveNumbers((prev) => prev.filter((n) => !targets.includes(n)));
    } else {
      setLockedWaveNumbers((prev) =>
        Array.from(new Set([...prev, ...targets])),
      );
    }
  }, [selectedWaveNumbers, waves, lockedWaveNumbers]);

  const handleWaveSelectionClick = useCallback(
    (e: React.MouseEvent, waveNum: number) => {
      e.stopPropagation();
      const isMultiModifier = e.shiftKey || e.metaKey || e.ctrlKey;
      if (isMultiModifier || interactionMode === "SELECT") {
        if (selectedWaveNumbers.includes(waveNum)) {
          updateSelectedWaves(selectedWaveNumbers.filter((n) => n !== waveNum));
        } else {
          updateSelectedWaves([...selectedWaveNumbers, waveNum]);
        }
      } else {
        if (
          selectedWaveNumbers.length === 1 &&
          selectedWaveNumbers[0] === waveNum
        ) {
          updateSelectedWaves([]);
        } else {
          updateSelectedWaves([waveNum]);
        }
      }
    },
    [interactionMode, selectedWaveNumbers, updateSelectedWaves],
  );

  // Shift Selected Waves OR All Unlocked Waves by deltaDays
  const handleShiftWaves = useCallback(
    (shiftDays: number) => {
      if (isLocked || shiftDays === 0) return;
      const targetWaveNums =
        selectedWaveNumbers.length > 0
          ? selectedWaveNumbers.filter((n) => !lockedWaveNumbers.includes(n))
          : waves
              .map((w) => w.wave_number)
              .filter((n) => !lockedWaveNumbers.includes(n));

      if (targetWaveNums.length === 0) return;

      pushUndoSnapshot(`Shift ${shiftDays > 0 ? `+${shiftDays}` : shiftDays}d`);

      const updates: {
        waveNumber: number;
        newOrderDate: string;
        newArrivalDate: string;
      }[] = [];

      targetWaveNums.forEach((wNum) => {
        const w = waves.find((row) => row.wave_number === wNum);
        if (!w) return;
        const nextOrder = addDays(w.target_order_date || todayIso, shiftDays);
        const nextArrival = addDays(w.target_arrival_date || todayIso, shiftDays);
        updates.push({
          waveNumber: wNum,
          newOrderDate: nextOrder,
          newArrivalDate: nextArrival,
        });
      });

      if (updates.length === 0) return;
      if (onBatchWaveDateChange) {
        onBatchWaveDateChange(updates);
      } else {
        updates.forEach((u) =>
          onWaveDateChange(u.waveNumber, u.newOrderDate, u.newArrivalDate),
        );
      }
    },
    [
      isLocked,
      selectedWaveNumbers,
      lockedWaveNumbers,
      waves,
      todayIso,
      pushUndoSnapshot,
      onBatchWaveDateChange,
      onWaveDateChange,
    ],
  );

  const handleAutoRealignWithHistory = useCallback(() => {
    if (!onAutoRealignSchedule || isLocked) return;
    pushUndoSnapshot("Auto-Realign");
    onAutoRealignSchedule();
  }, [onAutoRealignSchedule, isLocked, pushUndoSnapshot]);

  const handleResetBaselineWithHistory = useCallback(() => {
    if (!onResetDatesToBaseline || isLocked) return;
    pushUndoSnapshot("Reset Baseline");
    onResetDatesToBaseline();
  }, [onResetDatesToBaseline, isLocked, pushUndoSnapshot]);

  const allWavesExpanded = useMemo(() => {
    if (waves.length === 0) return false;
    return waves.every((w) => Boolean(expandedWaveNums[w.wave_number]));
  }, [waves, expandedWaveNums]);

  const handleToggleExpandAll = useCallback(() => {
    if (allWavesExpanded) {
      setExpandedWaveNums({});
    } else {
      const next: Record<number, boolean> = {};
      waves.forEach((w) => {
        next[w.wave_number] = true;
      });
      setExpandedWaveNums(next);
    }
  }, [allWavesExpanded, waves]);

  // Helper to get active wave dates during live drag (including multi-wave batch drag)
  const getEffectiveWaveDates = useCallback(
    (w: WaveGanttRow) => {
      if (!isLocked && dragState) {
        if (dragState.waveNumber === w.wave_number) {
          return {
            orderDate: dragState.currentOrderDate,
            arrivalDate: dragState.currentArrivalDate,
            isDragging: true,
          };
        }
        if (
          dragState.mode === "MOVE" &&
          dragState.batchWaveNumbers.includes(w.wave_number)
        ) {
          const init = dragState.initialWavesMap[w.wave_number];
          if (init) {
            return {
              orderDate: addDays(init.orderDate, dragState.deltaDays),
              arrivalDate: addDays(init.arrivalDate, dragState.deltaDays),
              isDragging: true,
            };
          }
        }
      }
      return {
        orderDate: w.target_order_date || todayIso,
        arrivalDate: w.target_arrival_date || todayIso,
        isDragging: false,
      };
    },
    [dragState, isLocked, todayIso],
  );

  // Timeline Bounds & Coordinate Helpers
  const { timelineStartIso, timelineEndIso, totalSpanDays } = useMemo(
    () =>
      computeTimelineBounds(
        waves,
        getEffectiveWaveDates,
        todayIso,
        masterStartDate,
        masterEndDate,
      ),
    [waves, getEffectiveWaveDates, todayIso, masterStartDate, masterEndDate],
  );

  const getPct = useCallback(
    (isoDate?: string | null) => {
      if (!isoDate) return 0;
      const s = new Date(`${String(timelineStartIso).slice(0, 10)}T00:00:00Z`);
      const e = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
      const offset = Math.round(
        (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24),
      );
      return Math.max(0, Math.min(100, (offset / totalSpanDays) * 100));
    },
    [timelineStartIso, totalSpanDays],
  );

  const todayPct = getPct(todayIso);
  const masterStartPct = masterStartDate ? getPct(masterStartDate) : null;

  const monthSpans = useMemo(
    () => computeMonthSpans(timelineStartIso, timelineEndIso, getPct),
    [timelineStartIso, timelineEndIso, getPct],
  );

  const stepDays = useMemo(
    () => computeStepDays(totalSpanDays, zoomLevel, timeScalePreset),
    [totalSpanDays, zoomLevel, timeScalePreset],
  );

  const ticks = useMemo(
    () =>
      computeDayTicks(totalSpanDays, stepDays, timelineStartIso, timelineEndIso),
    [totalSpanDays, stepDays, timelineStartIso, timelineEndIso],
  );

  const liveMetrics = useMemo(
    () =>
      computeLiveBottleneckMetrics(
        waves,
        getEffectiveWaveDates,
        todayIso,
        leadTimeBufferDays,
      ),
    [waves, getEffectiveWaveDates, todayIso, leadTimeBufferDays],
  );

  useEffect(() => {
    if (onLiveBottleneckMetricsUpdate && !isLocked) {
      onLiveBottleneckMetricsUpdate(liveMetrics);
    }
  }, [liveMetrics, onLiveBottleneckMetricsUpdate, isLocked]);

  // Filtered Waves based on Search Query & Bottleneck Toggle
  const filteredWaves = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return waves.filter((w) => {
      if (onlyBottlenecks) {
        const m = liveMetrics.find((metric) => metric.waveNumber === w.wave_number);
        if (!m || m.severity === "OPTIMAL") return false;
      }
      if (!q) return true;
      const matchWaveHeader =
        `w${w.wave_number}`.includes(q) ||
        `wave ${w.wave_number}`.includes(q) ||
        (w.station_focus || "").toLowerCase().includes(q) ||
        (w.bop_process_summary || "").toLowerCase().includes(q) ||
        (w.wot_lot_range || "").toLowerCase().includes(q);
      if (matchWaveHeader) return true;
      return (w.items || []).some(
        (it) =>
          (it.item_code || "").toLowerCase().includes(q) ||
          (it.item_name || "").toLowerCase().includes(q) ||
          (it.preferred_supplier_name || "").toLowerCase().includes(q),
      );
    });
  }, [waves, searchQuery, onlyBottlenecks, liveMetrics]);

  // Auto-expand waves when search query matches their BOM items
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    setExpandedWaveNums((prev) => {
      const next = { ...prev };
      waves.forEach((w) => {
        const itemMatched = (w.items || []).some(
          (it) =>
            (it.item_code || "").toLowerCase().includes(q) ||
            (it.item_name || "").toLowerCase().includes(q) ||
            (it.preferred_supplier_name || "").toLowerCase().includes(q),
        );
        if (itemMatched) {
          next[w.wave_number] = true;
        }
      });
      return next;
    });
  }, [searchQuery, waves]);

  const cashflowSummary = useMemo(
    () => computeCashflowSummary(waves, getEffectiveWaveDates, getPct),
    [waves, getEffectiveWaveDates, getPct],
  );

  // Fit-to-View & Center Scroll on Today or T0
  const handleFitView = useCallback(() => {
    setTimeScalePreset("MONTH");
    setZoomLevel(100);
    setTimeout(() => {
      if (!scrollContainerRef.current) return;
      scrollContainerRef.current.scrollTo({ left: 0, top: 0, behavior: "smooth" });
      refreshViewportThumb();
    }, 30);
  }, [refreshViewportThumb]);

  const handleCenterTimeline = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const targetPct = masterStartPct !== null ? masterStartPct : todayPct;
    const maxScroll = container.scrollWidth - container.clientWidth;
    if (maxScroll > 0) {
      const targetScroll = Math.max(
        0,
        (targetPct / 100) * container.scrollWidth - container.clientWidth * 0.35,
      );
      container.scrollTo({ left: targetScroll, behavior: "smooth" });
    }
  }, [masterStartPct, todayPct]);

  // Start Bar Drag / Resize (respects Row Lock)
  const startDrag = useCallback(
    (
      e: React.MouseEvent,
      waveNumber: number,
      mode: "MOVE" | "RESIZE_LEFT" | "RESIZE_RIGHT",
    ) => {
      if (isLocked || lockedWaveNumbers.includes(waveNumber)) return;
      e.preventDefault();
      e.stopPropagation();

      const wave = waves.find((w) => w.wave_number === waveNumber);
      if (!wave) return;

      const rawBatch =
        mode === "MOVE" && selectedWaveNumbers.includes(waveNumber)
          ? selectedWaveNumbers
          : [waveNumber];
      const batchWaveNumbers = rawBatch.filter(
        (n) => !lockedWaveNumbers.includes(n),
      );

      if (!selectedWaveNumbers.includes(waveNumber)) {
        updateSelectedWaves([waveNumber]);
      }

      const initialWavesMap: Record<
        number,
        { orderDate: string; arrivalDate: string; prodNeedDate: string }
      > = {};
      waves.forEach((w) => {
        initialWavesMap[w.wave_number] = {
          orderDate: w.target_order_date || todayIso,
          arrivalDate: w.target_arrival_date || todayIso,
          prodNeedDate:
            w.production_need_date || w.target_arrival_date || todayIso,
        };
      });

      const orderDate = wave.target_order_date || todayIso;
      const arrivalDate = wave.target_arrival_date || todayIso;

      setDragState({
        waveNumber,
        batchWaveNumbers,
        mode,
        initialClientX: e.clientX,
        deltaDays: 0,
        initialWavesMap,
        currentOrderDate: orderDate,
        currentArrivalDate: arrivalDate,
      });
    },
    [
      isLocked,
      lockedWaveNumbers,
      waves,
      selectedWaveNumbers,
      updateSelectedWaves,
      todayIso,
    ],
  );

  // Start Canvas Pan OR Marquee Box Selection
  const startCanvasInteraction = useCallback(
    (e: React.MouseEvent) => {
      if (dragState) return;
      const target = e.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest("input") ||
        target.closest("select") ||
        target.closest("[data-gantt-interactive-bar='true']") ||
        target.closest("[data-gantt-floating-dock='true']")
      ) {
        return;
      }
      if (!scrollContainerRef.current) return;

      const isMarqueeTrigger = interactionMode === "SELECT" || e.shiftKey;
      if (isMarqueeTrigger) {
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
        const y = e.clientY - rect.top + scrollContainerRef.current.scrollTop;
        setMarqueeState({
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          additive: e.shiftKey || e.metaKey || e.ctrlKey,
          initialSelected: selectedWaveNumbers,
        });
        return;
      }

      setPanState({
        isPanning: true,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: scrollContainerRef.current.scrollLeft,
        scrollTop: scrollContainerRef.current.scrollTop,
      });
    },
    [dragState, interactionMode, selectedWaveNumbers],
  );

  // Window Mouse Move / Up for Bar Dragging (Single & Multi-Wave Batch + History Recording)
  useEffect(() => {
    if (isLocked || !dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const trackEl = timelineTrackRef.current || scrollContainerRef.current;
      if (!trackEl) return;
      const rect = trackEl.getBoundingClientRect();
      const timelinePixelWidth = Math.max(200, rect.width);
      if (timelinePixelWidth <= 0) return;

      const deltaX = e.clientX - dragState.initialClientX;
      const daysPerPixel = totalSpanDays / timelinePixelWidth;
      const deltaDays = Math.round(deltaX * daysPerPixel);

      const primaryInit = dragState.initialWavesMap[dragState.waveNumber];
      if (!primaryInit) return;

      if (dragState.mode === "MOVE") {
        const nextOrder = addDays(primaryInit.orderDate, deltaDays);
        const nextArrival = addDays(primaryInit.arrivalDate, deltaDays);
        setDragState((prev) =>
          prev
            ? {
                ...prev,
                deltaDays,
                currentOrderDate: nextOrder,
                currentArrivalDate: nextArrival,
              }
            : null,
        );
      } else if (dragState.mode === "RESIZE_LEFT") {
        const nextOrder = addDays(primaryInit.orderDate, deltaDays);
        if (nextOrder < dragState.currentArrivalDate) {
          setDragState((prev) =>
            prev ? { ...prev, deltaDays, currentOrderDate: nextOrder } : null,
          );
        }
      } else if (dragState.mode === "RESIZE_RIGHT") {
        const nextArrival = addDays(primaryInit.arrivalDate, deltaDays);
        if (nextArrival > dragState.currentOrderDate) {
          setDragState((prev) =>
            prev ? { ...prev, deltaDays, currentArrivalDate: nextArrival } : null,
          );
        }
      }
    };

    const handleMouseUp = () => {
      if (dragState && dragState.deltaDays !== 0) {
        // Save pre-drag schedule into undoStack
        const preDragEntries: WaveScheduleEntry[] = Object.entries(
          dragState.initialWavesMap,
        ).map(([wNumStr, val]) => ({
          waveNumber: Number(wNumStr),
          orderDate: val.orderDate,
          arrivalDate: val.arrivalDate,
        }));
        setUndoStack((prev) => [
          ...prev.slice(-29),
          {
            timestamp: Date.now(),
            label: `${dragState.mode} W${dragState.waveNumber}`,
            entries: preDragEntries,
          },
        ]);
        setRedoStack([]);

        if (
          dragState.mode === "MOVE" &&
          dragState.batchWaveNumbers.length > 1
        ) {
          const updates = dragState.batchWaveNumbers
            .map((wNum) => {
              const init = dragState.initialWavesMap[wNum];
              if (!init) return null;
              return {
                waveNumber: wNum,
                newOrderDate: addDays(init.orderDate, dragState.deltaDays),
                newArrivalDate: addDays(init.arrivalDate, dragState.deltaDays),
              };
            })
            .filter(Boolean) as {
            waveNumber: number;
            newOrderDate: string;
            newArrivalDate: string;
          }[];

          if (onBatchWaveDateChange) {
            onBatchWaveDateChange(updates);
          } else {
            updates.forEach((u) =>
              onWaveDateChange(u.waveNumber, u.newOrderDate, u.newArrivalDate),
            );
          }
        } else {
          onWaveDateChange(
            dragState.waveNumber,
            dragState.currentOrderDate,
            dragState.currentArrivalDate,
          );
        }
      }
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, totalSpanDays, onWaveDateChange, onBatchWaveDateChange, isLocked]);

  // Window Mouse Move / Up for Canvas Pan-Drag
  useEffect(() => {
    if (!panState?.isPanning) return;

    const handlePanMove = (e: MouseEvent) => {
      if (!scrollContainerRef.current) return;
      const dx = e.clientX - panState.startX;
      const dy = e.clientY - panState.startY;
      scrollContainerRef.current.scrollLeft = panState.scrollLeft - dx;
      scrollContainerRef.current.scrollTop = panState.scrollTop - dy;
      refreshViewportThumb();
    };

    const handlePanUp = () => {
      setPanState(null);
    };

    window.addEventListener("mousemove", handlePanMove);
    window.addEventListener("mouseup", handlePanUp);
    return () => {
      window.removeEventListener("mousemove", handlePanMove);
      window.removeEventListener("mouseup", handlePanUp);
    };
  }, [panState, refreshViewportThumb]);

  // Window Mouse Move / Up for Marquee Box Selection
  useEffect(() => {
    if (!marqueeState) return;

    const handleMarqueeMove = (e: MouseEvent) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const currentX = e.clientX - rect.left + container.scrollLeft;
      const currentY = e.clientY - rect.top + container.scrollTop;

      setMarqueeState((prev) =>
        prev ? { ...prev, currentX, currentY } : null,
      );

      const minY = Math.min(marqueeState.startY, currentY);
      const maxY = Math.max(marqueeState.startY, currentY);

      const hitWaves: number[] = [];
      filteredWaves.forEach((w) => {
        const rowEl = rowRefs.current[w.wave_number];
        if (!rowEl) return;
        const rowRect = rowEl.getBoundingClientRect();
        const rowTop = rowRect.top - rect.top + container.scrollTop;
        const rowBottom = rowTop + rowRect.height;
        if (rowBottom >= minY && rowTop <= maxY) {
          hitWaves.push(w.wave_number);
        }
      });

      if (marqueeState.additive) {
        updateSelectedWaves([...marqueeState.initialSelected, ...hitWaves]);
      } else {
        updateSelectedWaves(hitWaves);
      }
    };

    const handleMarqueeUp = () => {
      setMarqueeState(null);
    };

    window.addEventListener("mousemove", handleMarqueeMove);
    window.addEventListener("mouseup", handleMarqueeUp);
    return () => {
      window.removeEventListener("mousemove", handleMarqueeMove);
      window.removeEventListener("mouseup", handleMarqueeUp);
    };
  }, [marqueeState, filteredWaves, updateSelectedWaves]);

  const criticalCount = liveMetrics.filter((m) => m.severity === "CRITICAL").length;
  const warningCount = liveMetrics.filter((m) => m.severity === "WARNING").length;
  const optimalCount = liveMetrics.filter((m) => m.severity === "OPTIMAL").length;

  const canvasMinWidthPx = Math.round(920 * (zoomLevel / 100));

  const renderGanttContent = () => (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[100] bg-stone-50 dark:bg-stone-950 flex flex-col overflow-hidden animate-in fade-in duration-150"
          : "bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden shadow-2xs flex flex-col relative"
      }
    >
      {isResizingSplitter && (
        <div className="fixed inset-0 z-[150] cursor-col-resize select-none" />
      )}

      {/* 1. TOP COMMAND HEADER & STRATEGY BAR */}
      <GanttCommandBar
        isLocked={isLocked}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
        projectName={projectName}
        spkNumber={spkNumber}
        totalWavesCount={waves.length}
        visibleWavesCount={filteredWaves.length}
        optimalCount={optimalCount}
        criticalCount={criticalCount}
        warningCount={warningCount}
        onActivateStrategyPlanning={onActivateStrategyPlanning}
        onAutoRealignSchedule={handleAutoRealignWithHistory}
        onSavePlan={onSavePlan}
        isSaving={isSaving}
        submitStrategyLabel={submitStrategyLabel}
        strategyMode={strategyMode}
        onStrategyModeChange={onStrategyModeChange}
        wotLotsPerWave={wotLotsPerWave}
        totalWotLots={totalWotLots}
        onWotLotsPerWaveChange={onWotLotsPerWaveChange}
        leadTimeBufferDays={leadTimeBufferDays}
        onLeadTimeBufferDaysChange={onLeadTimeBufferDaysChange}
        selectedWaveNumbers={selectedWaveNumbers}
        onClearSelectedWaves={() => updateSelectedWaves([])}
        onBatchShiftWaves={handleShiftWaves}
        lockedWaveNumbers={lockedWaveNumbers}
        onUnlockAllWaves={() => setLockedWaveNumbers([])}
        searchQuery={searchQuery}
        onClearSearch={() => setSearchQuery("")}
        onlyBottlenecks={onlyBottlenecks}
        onToggleOnlyBottlenecks={() => setOnlyBottlenecks((prev) => !prev)}
      />

      {/* 2. TWO-PANE GANTT VIEWPORT */}
      <div
        ref={mainViewportRef}
        className="flex-1 min-h-0 flex items-stretch overflow-hidden relative"
      >
        {/* PANE 1: LEFT WAVE METADATA & STATION PANE */}
        <GanttLeftMenuPane
          leftPanelWidthPx={leftPanelWidthPx}
          leftPanelScrollRef={leftPanelScrollRef}
          onWheelSync={(deltaY) => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop += deltaY;
            }
          }}
          isLocked={isLocked}
          waves={filteredWaves}
          totalWavesCount={waves.length}
          liveMetrics={liveMetrics}
          getEffectiveWaveDates={getEffectiveWaveDates}
          selectedWaveNumbers={selectedWaveNumbers}
          onWaveSelectionClick={handleWaveSelectionClick}
          expandedWaveNums={expandedWaveNums}
          onToggleWaveExpand={toggleWaveExpand}
          lockedWaveNumbers={lockedWaveNumbers}
          onToggleLockWave={handleToggleLockWave}
          cashflowSummary={cashflowSummary}
          showCashflowStrip={showCashflowStrip}
          canSeeFinancials={canSeeFinancials}
          onResetFilters={() => {
            setSearchQuery("");
            setOnlyBottlenecks(false);
          }}
        />

        {/* DRAGGABLE RESIZER SPLITTER */}
        <div
          onMouseDown={startSplitterResize}
          onDoubleClick={() => setLeftPanelWidthPx(370)}
          className={`w-1.5 shrink-0 cursor-col-resize z-40 transition-colors select-none flex items-center justify-center ${
            isResizingSplitter
              ? "bg-indigo-600"
              : "bg-stone-200 dark:bg-stone-800 hover:bg-indigo-500 active:bg-indigo-600"
          }`}
          title="Drag to resize menu width (Double-click to reset 370px)"
        >
          <div className="w-0.5 h-8 bg-stone-400 dark:bg-stone-500 rounded-full" />
        </div>

        {/* PANE 2: RIGHT GANTT TIMELINE CANVAS */}
        <div
          ref={scrollContainerRef}
          onMouseDown={startCanvasInteraction}
          onScroll={(e) => {
            if (leftPanelScrollRef.current) {
              leftPanelScrollRef.current.scrollTop = e.currentTarget.scrollTop;
            }
            refreshViewportThumb();
          }}
          className={`flex-1 min-w-0 overflow-auto select-none custom-scrollbar relative ${
            marqueeState || interactionMode === "SELECT"
              ? "cursor-crosshair"
              : panState?.isPanning
                ? "cursor-grabbing"
                : !dragState
                  ? "cursor-grab"
                  : ""
          }`}
        >
          {/* Marquee Selection Box Overlay */}
          {marqueeState && (
            <div
              style={{
                left: `${Math.min(marqueeState.startX, marqueeState.currentX)}px`,
                top: `${Math.min(marqueeState.startY, marqueeState.currentY)}px`,
                width: `${Math.abs(marqueeState.currentX - marqueeState.startX)}px`,
                height: `${Math.abs(marqueeState.currentY - marqueeState.startY)}px`,
              }}
              className="absolute z-40 border-2 border-indigo-500 bg-indigo-500/15 rounded pointer-events-none"
            />
          )}

          <div
            ref={timelineTrackRef}
            style={{
              width: `${Math.max(100, zoomLevel)}%`,
              minWidth: `${canvasMinWidthPx}px`,
            }}
          >
            {/* Sticky Two-Tier Timeline Date Header (h-[50px]) */}
            <div className="h-[50px] sticky top-0 z-20 shrink-0 border-b border-stone-200 dark:border-stone-800 bg-stone-100/95 dark:bg-stone-900/95 backdrop-blur-xs flex flex-col justify-between overflow-hidden">
              {/* Tier 1: Month & Year Strip (h-[24px]) */}
              <div className="relative h-[24px] border-b border-stone-200/80 dark:border-stone-800/80 bg-stone-100 dark:bg-stone-900/90 overflow-hidden select-none">
                {monthSpans.map((m, idx) => (
                  <div
                    key={`month-${idx}`}
                    style={{
                      left: `${m.startPct}%`,
                      width: `${m.widthPct}%`,
                    }}
                    className="absolute top-0 bottom-0 border-r border-stone-200 dark:border-stone-800 flex items-center px-3 overflow-hidden"
                  >
                    <span className="text-[10.5px] font-bold text-stone-700 dark:text-stone-300 font-sans truncate whitespace-nowrap">
                      {m.label}
                    </span>
                  </div>
                ))}

                {/* Today Marker in Tier 1 */}
                <div
                  style={{ left: `${todayPct}%` }}
                  className="absolute top-0.5 -translate-x-1/2 z-20 px-1.5 py-0.2 rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[8.5px] font-mono font-bold shadow-xs pointer-events-none whitespace-nowrap"
                  title={`Today: ${todayIso}`}
                >
                  TODAY
                </div>

                {/* Master Start T0 Marker in Tier 1 */}
                {masterStartPct !== null && (
                  <div
                    style={{ left: `${masterStartPct}%` }}
                    className="absolute top-0.5 -translate-x-1/2 z-20 px-1.5 py-0.2 rounded bg-indigo-600 text-white text-[8.5px] font-mono font-bold shadow-xs pointer-events-none whitespace-nowrap"
                    title={`Master T0 Start: ${masterStartDate}`}
                  >
                    T0 START
                  </div>
                )}
              </div>

              {/* Tier 2: Days & Weekdays Strip (h-[26px]) */}
              <div className="relative h-[26px] bg-stone-50/90 dark:bg-stone-900/60 overflow-hidden select-none">
                {ticks.map((t, idx) => (
                  <div
                    key={`${t.iso}-${idx}`}
                    style={{ left: `${t.pct}%` }}
                    className="absolute top-0 bottom-0 flex flex-col justify-center items-center -translate-x-1/2 pointer-events-none"
                  >
                    <div className="flex items-baseline gap-0.5">
                      <span
                        className={`text-[10px] font-mono tabular-nums font-bold leading-none ${
                          t.isWeekend
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-stone-700 dark:text-stone-200"
                        }`}
                      >
                        {t.dayNum}
                      </span>
                      <span className="text-[8px] font-mono text-stone-400 dark:text-stone-500 leading-none">
                        {t.weekday}
                      </span>
                    </div>
                    <div
                      className={`w-px h-1 mx-auto mt-0.5 ${
                        t.isWeekend
                          ? "bg-amber-400/60"
                          : "bg-stone-300 dark:bg-stone-700"
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Two-Tier Stacked Wave Rows */}
            <div className="divide-y divide-stone-200/80 dark:divide-stone-800">
              {filteredWaves.map((wave) => {
                const metric = !isLocked
                  ? liveMetrics.find((m) => m.waveNumber === wave.wave_number) ||
                    null
                  : null;
                const eff = getEffectiveWaveDates(wave);
                const isSelected = selectedWaveNumbers.includes(wave.wave_number);
                const isRowLocked = lockedWaveNumbers.includes(wave.wave_number);
                const isExpanded = Boolean(expandedWaveNums[wave.wave_number]);

                const waveBudgetShare =
                  cashflowSummary.totalBudget > 0
                    ? Math.round(
                        (Number(wave.estimated_cost || 0) /
                          cashflowSummary.totalBudget) *
                          100,
                      )
                    : 0;

                return (
                  <GanttWaveTrackRow
                    key={wave.id || `wave-row-${wave.wave_number}`}
                    wave={wave}
                    metric={metric}
                    eff={eff}
                    isLocked={isLocked}
                    isRowLocked={isRowLocked}
                    isSelected={isSelected}
                    isExpanded={isExpanded}
                    leadTimeBufferDays={leadTimeBufferDays}
                    waveBudgetShare={waveBudgetShare}
                    ticks={ticks}
                    todayPct={todayPct}
                    masterStartPct={masterStartPct}
                    showConnectors={showConnectors}
                    getPct={getPct}
                    onRowRef={(wNum, el) => {
                      rowRefs.current[wNum] = el;
                    }}
                    onWaveSelectionClick={handleWaveSelectionClick}
                    onStartDrag={startDrag}
                  />
                );
              })}
            </div>

            {/* Cashflow Commitment Strip in Right Pane (h-16) */}
            {showCashflowStrip && filteredWaves.length > 0 && (
              <div className="relative h-16 min-h-[64px] border-t-2 border-stone-200 dark:border-stone-800 bg-stone-100/80 dark:bg-stone-900/90 px-4 flex items-center overflow-hidden">
                {ticks.map((t, idx) => (
                  <div
                    key={`cf-tick-${idx}`}
                    style={{ left: `${t.pct}%` }}
                    className="absolute top-0 bottom-0 w-px bg-stone-200/60 dark:bg-stone-800 pointer-events-none"
                  />
                ))}

                {cashflowSummary.waveOutlays.map((cf) => {
                  const widthPct = Math.max(4, cf.arrivalPct - cf.orderPct);
                  const isPeak =
                    cashflowSummary.peakWave?.waveNumber === cf.waveNumber &&
                    waves.length > 1;
                  return (
                    <div
                      key={`cf-bar-${cf.waveNumber}`}
                      style={{
                        left: `${cf.orderPct}%`,
                        width: `${widthPct}%`,
                      }}
                      className={`absolute h-10 rounded-md border px-2 py-1 flex flex-col justify-between text-[9.5px] font-mono tabular-nums shadow-2xs ${
                        isPeak
                          ? "bg-amber-50/95 dark:bg-amber-950/80 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 z-10"
                          : "bg-white/95 dark:bg-stone-850/95 border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200"
                      }`}
                      title={`Wave ${cf.waveNumber}: ${
                        canSeeFinancials ? formatIDR(cf.cost) : "Confidential"
                      } (${cf.sharePct}% of budget, Cumulative ${cf.cumPct}%)`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold">W{cf.waveNumber}</span>
                        <span className="truncate">
                          {canSeeFinancials
                            ? formatIDR(cf.cost)
                            : `${cf.sharePct}% Load`}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${Math.max(8, cf.sharePct)}%` }}
                          className={`h-full rounded-full ${
                            isPeak ? "bg-amber-600" : "bg-emerald-600"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 3. UNIFIED BOTTOM-CENTER FLOATING TOOLBAR & POPOVERS */}
        <GanttFloatingDock
          isLocked={isLocked}
          interactionMode={interactionMode}
          onInteractionModeChange={setInteractionMode}
          undoCount={undoStack.length}
          redoCount={redoStack.length}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onResetDatesToBaseline={handleResetBaselineWithHistory}
          timeScalePreset={timeScalePreset}
          onTimeScalePresetChange={handleTimeScalePresetChange}
          zoomLevel={zoomLevel}
          onButtonZoom={handleButtonZoom}
          onFitView={handleFitView}
          onCenterTimeline={handleCenterTimeline}
          totalWavesCount={waves.length}
          selectedWaveNumbers={selectedWaveNumbers}
          onToggleSelectAll={() => {
            if (selectedWaveNumbers.length === waves.length) {
              updateSelectedWaves([]);
            } else {
              updateSelectedWaves(waves.map((w) => w.wave_number));
            }
          }}
          lockedWaveNumbers={lockedWaveNumbers}
          onToggleLockSelectedOrAll={handleToggleLockSelectedOrAll}
          onShiftWaves={handleShiftWaves}
          isSearchFilterOpen={isSearchFilterOpen}
          onToggleSearchFilterOpen={() => {
            setIsSearchFilterOpen((prev) => !prev);
            setIsViewSettingsOpen(false);
          }}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onlyBottlenecks={onlyBottlenecks}
          onToggleOnlyBottlenecks={() => setOnlyBottlenecks((prev) => !prev)}
          criticalCount={criticalCount}
          warningCount={warningCount}
          onAutoRealignSchedule={handleAutoRealignWithHistory}
          isViewSettingsOpen={isViewSettingsOpen}
          onToggleViewSettingsOpen={() => {
            setIsViewSettingsOpen((prev) => !prev);
            setIsSearchFilterOpen(false);
          }}
          showConnectors={showConnectors}
          onShowConnectorsChange={setShowConnectors}
          showMinimap={showMinimap}
          onShowMinimapChange={setShowMinimap}
          allWavesExpanded={allWavesExpanded}
          onToggleExpandAll={handleToggleExpandAll}
          wheelZoomEnabled={wheelZoomEnabled}
          onWheelZoomEnabledChange={setWheelZoomEnabled}
          showCashflowStrip={showCashflowStrip}
          onShowCashflowStripChange={setShowCashflowStrip}
          vendorSlipSimDays={vendorSlipSimDays}
          onApplyVendorSlipSimulation={onApplyVendorSlipSimulation}
        />

        {/* 4. INTERACTIVE MINIMAP HUD (Bottom-Right) */}
        {showMinimap && (
          <GanttMinimapHud
            waves={filteredWaves}
            liveMetrics={liveMetrics}
            selectedWaveNumbers={selectedWaveNumbers}
            zoomLevel={zoomLevel}
            viewportThumb={viewportThumb}
            getEffectiveWaveDates={getEffectiveWaveDates}
            getPct={getPct}
            onJumpToRatio={(clickRatio) => {
              const container = scrollContainerRef.current;
              if (!container) return;
              const targetScroll =
                clickRatio * container.scrollWidth - container.clientWidth / 2;
              container.scrollTo({
                left: Math.max(0, targetScroll),
                behavior: "smooth",
              });
            }}
          />
        )}
      </div>

      {/* 5. FULLSCREEN BOTTLENECK DIAGNOSTIC DRAWER */}
      {isFullscreen && !isLocked && showFullscreenDiagnostics && (
        <div className="border-t border-stone-200 dark:border-stone-800 bg-stone-100/90 dark:bg-stone-900/95 p-4 max-h-[38vh] overflow-y-auto custom-scrollbar shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
              Fullscreen Bottleneck &amp; Lead-Time Diagnostic Panel
            </span>
            <button
              type="button"
              onClick={() => setShowFullscreenDiagnostics(false)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close Panel</span>
            </button>
          </div>
          <WaveBottleneckInsightPanel
            metrics={liveMetrics}
            masterStartDate={masterStartDate}
            masterEndDate={masterEndDate}
            earliestFeasibleStart={earliestFeasibleStart}
            onResetDatesToBaseline={handleResetBaselineWithHistory}
            onAutoRealignFeasible={handleAutoRealignWithHistory}
          />
        </div>
      )}
    </div>
  );

  if (isFullscreen && typeof document !== "undefined") {
    return createPortal(renderGanttContent(), document.body);
  }

  return renderGanttContent();
};
