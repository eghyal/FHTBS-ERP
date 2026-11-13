import React, { useRef, useEffect } from "react";
import {
  AlertTriangle,
  CheckSquare,
  Compass,
  Hand,
  Lock,
  MousePointer2,
  Redo2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Undo2,
  Unlock,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { TimeScalePreset } from "./ganttTypes";

interface GanttFloatingDockProps {
  isLocked: boolean;
  interactionMode: "PAN" | "SELECT";
  onInteractionModeChange: (mode: "PAN" | "SELECT") => void;
  // Undo / Redo / Reset Baseline
  undoCount: number;
  redoCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onResetDatesToBaseline?: () => void;
  // Time Scale Presets & Zoom
  timeScalePreset: TimeScalePreset;
  onTimeScalePresetChange: (preset: TimeScalePreset) => void;
  zoomLevel: number;
  onButtonZoom: (delta: number) => void;
  onFitView: () => void;
  onCenterTimeline: () => void;
  // Selection & Row Lock & Global/Batch Shift
  totalWavesCount: number;
  selectedWaveNumbers: number[];
  onToggleSelectAll: () => void;
  lockedWaveNumbers: number[];
  onToggleLockSelectedOrAll: () => void;
  onShiftWaves: (deltaDays: number) => void;
  // Search, Bottleneck Filter & Auto-Realign
  isSearchFilterOpen: boolean;
  onToggleSearchFilterOpen: () => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  onlyBottlenecks: boolean;
  onToggleOnlyBottlenecks: () => void;
  criticalCount: number;
  warningCount: number;
  onAutoRealignSchedule?: () => void;
  // View & Simulation Settings Popover
  isViewSettingsOpen: boolean;
  onToggleViewSettingsOpen: () => void;
  showConnectors: boolean;
  onShowConnectorsChange: (val: boolean) => void;
  showMinimap: boolean;
  onShowMinimapChange: (val: boolean) => void;
  allWavesExpanded: boolean;
  onToggleExpandAll: () => void;
  wheelZoomEnabled: boolean;
  onWheelZoomEnabledChange: (val: boolean) => void;
  showCashflowStrip: boolean;
  onShowCashflowStripChange: (val: boolean) => void;
  vendorSlipSimDays: number;
  onApplyVendorSlipSimulation?: (days: number) => void;
}

export const GanttFloatingDock: React.FC<GanttFloatingDockProps> = ({
  isLocked,
  interactionMode,
  onInteractionModeChange,
  undoCount,
  redoCount,
  onUndo,
  onRedo,
  onResetDatesToBaseline,
  timeScalePreset,
  onTimeScalePresetChange,
  zoomLevel,
  onButtonZoom,
  onFitView,
  onCenterTimeline,
  totalWavesCount,
  selectedWaveNumbers,
  onToggleSelectAll,
  lockedWaveNumbers,
  onToggleLockSelectedOrAll,
  onShiftWaves,
  isSearchFilterOpen,
  onToggleSearchFilterOpen,
  searchQuery,
  onSearchQueryChange,
  onlyBottlenecks,
  onToggleOnlyBottlenecks,
  criticalCount,
  warningCount,
  onAutoRealignSchedule,
  isViewSettingsOpen,
  onToggleViewSettingsOpen,
  showConnectors,
  onShowConnectorsChange,
  showMinimap,
  onShowMinimapChange,
  allWavesExpanded,
  onToggleExpandAll,
  wheelZoomEnabled,
  onWheelZoomEnabledChange,
  showCashflowStrip,
  onShowCashflowStripChange,
  vendorSlipSimDays,
  onApplyVendorSlipSimulation,
}) => {
  const viewSettingsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchFilterOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    }
  }, [isSearchFilterOpen]);

  const bottleneckTotal = criticalCount + warningCount;
  const hasSelectedWaves = selectedWaveNumbers.length > 0;
  const areSelectedLocked =
    hasSelectedWaves &&
    selectedWaveNumbers.every((wNum) => lockedWaveNumbers.includes(wNum));

  return (
    <div
      data-gantt-floating-dock="true"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex flex-col items-center max-w-[96vw]"
    >
      {/* 1. CONTEXTUAL SEARCH, FILTER & BATCH SHIFT BAR (Above Dock) */}
      {isSearchFilterOpen && (
        <div className="pointer-events-auto mb-2 w-full max-w-xl bg-white/95 dark:bg-stone-900/95 backdrop-blur-md rounded-xl border border-stone-200 dark:border-stone-800 shadow-xl p-2.5 text-xs text-stone-700 dark:text-stone-300 animate-in fade-in zoom-in-95 duration-150 flex flex-wrap items-center justify-between gap-2">
          {/* Live Search Input */}
          <div className="relative flex-1 min-w-[200px] flex items-center">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search BOM item code, material, or BOP station..."
              className="no-base-style w-full h-7 pl-8 pr-7 text-xs bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-900 dark:text-stone-100 placeholder:text-stone-400 outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="absolute right-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Bottleneck Filter Toggle */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleOnlyBottlenecks}
              className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                onlyBottlenecks
                  ? "bg-rose-600 text-white border-rose-600 shadow-2xs"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700"
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Bottleneck Only ({bottleneckTotal})</span>
            </button>

            {/* Global / Selected Shift Controls */}
            {!isLocked && (
              <div className="inline-flex items-center gap-0.5 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg border border-stone-200 dark:border-stone-700">
                <span className="px-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {hasSelectedWaves
                    ? `Shift (${selectedWaveNumbers.length}):`
                    : "Shift All:"}
                </span>
                {[-3, -1, 1, 3].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onShiftWaves(d)}
                    className="px-1.5 py-0.5 rounded text-[10.5px] font-mono font-bold tabular-nums text-stone-700 dark:text-stone-200 hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer"
                    title={`Shift ${
                      hasSelectedWaves ? "selected" : "all unlocked"
                    } waves by ${d > 0 ? `+${d}` : d} days`}
                  >
                    {d > 0 ? `+${d}d` : `${d}d`}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onToggleSearchFilterOpen}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
              title="Close Search & Filter Bar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. VIEW & SIMULATION SETTINGS POPOVER */}
      {isViewSettingsOpen && (
        <div
          ref={viewSettingsRef}
          className="pointer-events-auto mb-2 w-72 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md rounded-xl border border-stone-200 dark:border-stone-800 shadow-xl p-3.5 text-xs text-stone-700 dark:text-stone-300 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-stone-100 dark:border-stone-800">
            <span className="font-sans font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
              View &amp; Simulation
            </span>
            <button
              type="button"
              onClick={onToggleViewSettingsOpen}
              className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1 font-sans">
            <label className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-stone-100/70 dark:hover:bg-stone-800/70 cursor-pointer select-none">
              <span className="text-[11.5px] font-medium text-stone-700 dark:text-stone-300">
                Handover Vectors &amp; Gap Tag
              </span>
              <input
                type="checkbox"
                checked={showConnectors}
                onChange={(e) => onShowConnectorsChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-stone-300 accent-indigo-600 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-stone-100/70 dark:hover:bg-stone-800/70 cursor-pointer select-none">
              <span className="text-[11.5px] font-medium text-stone-700 dark:text-stone-300">
                Interactive Minimap HUD
              </span>
              <input
                type="checkbox"
                checked={showMinimap}
                onChange={(e) => onShowMinimapChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-stone-300 accent-indigo-600 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-stone-100/70 dark:hover:bg-stone-800/70 cursor-pointer select-none">
              <span className="text-[11.5px] font-medium text-stone-700 dark:text-stone-300">
                Expand All BOM Items
              </span>
              <input
                type="checkbox"
                checked={allWavesExpanded}
                onChange={onToggleExpandAll}
                className="w-3.5 h-3.5 rounded border-stone-300 accent-indigo-600 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-stone-100/70 dark:hover:bg-stone-800/70 cursor-pointer select-none">
              <span className="text-[11.5px] font-medium text-stone-700 dark:text-stone-300">
                Mouse-Wheel Focal Zoom
              </span>
              <input
                type="checkbox"
                checked={wheelZoomEnabled}
                onChange={(e) => onWheelZoomEnabledChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-stone-300 accent-indigo-600 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-stone-100/70 dark:hover:bg-stone-800/70 cursor-pointer select-none">
              <span className="text-[11.5px] font-medium text-stone-700 dark:text-stone-300">
                Cashflow Outlay Strip
              </span>
              <input
                type="checkbox"
                checked={showCashflowStrip}
                onChange={(e) => onShowCashflowStripChange(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-stone-300 accent-indigo-600 cursor-pointer"
              />
            </label>
          </div>

          {!isLocked && (
            <div className="pt-2 mt-2 border-t border-stone-100 dark:border-stone-800">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-stone-800 dark:text-stone-200">
                  Vendor Delay Slip Sim
                </span>
                {vendorSlipSimDays > 0 && (
                  <span className="font-mono text-[10px] text-rose-600 dark:text-rose-400 font-bold tabular-nums">
                    +{vendorSlipSimDays}d Stress
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[0, 2, 5, 7, 10].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onApplyVendorSlipSimulation?.(d)}
                    className={`py-1 text-[10px] font-mono font-bold tabular-nums rounded transition-colors cursor-pointer ${
                      vendorSlipSimDays === d
                        ? "bg-rose-600 text-white shadow-xs"
                        : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
                    }`}
                  >
                    {d === 0 ? "0d" : `+${d}d`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. MAIN UNIFIED FLOATING DOCK BAR */}
      <div className="pointer-events-auto inline-flex flex-wrap items-center justify-center gap-1 p-1 rounded-xl bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border border-stone-300 dark:border-stone-700 shadow-xl text-stone-700 dark:text-stone-200">
        {/* Segment A: Interaction Mode Switch (Pan vs Box Select) */}
        <div className="inline-flex items-center rounded-lg bg-stone-100 dark:bg-stone-800 p-0.5">
          <button
            type="button"
            onClick={() => onInteractionModeChange("PAN")}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              interactionMode === "PAN"
                ? "bg-emerald-600 text-white shadow-2xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
            title="Pan Mode (Drag canvas to scroll)"
          >
            <Hand className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Pan</span>
          </button>
          <button
            type="button"
            onClick={() => onInteractionModeChange("SELECT")}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              interactionMode === "SELECT"
                ? "bg-indigo-600 text-white shadow-2xs"
                : "text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
            }`}
            title="Box Select Mode (Drag marquee box to select multiple waves)"
          >
            <MousePointer2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Select</span>
          </button>
        </div>

        {/* Segment B: Undo / Redo Schedule History & Reset Baseline */}
        {!isLocked && (
          <>
            <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-0.5" />
            <div className="inline-flex items-center gap-0.5">
              <button
                type="button"
                disabled={undoCount === 0}
                onClick={onUndo}
                className="p-1.5 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
                title={
                  undoCount > 0
                    ? `Undo schedule shift (${undoCount} step${undoCount > 1 ? "s" : ""})`
                    : "Nothing to undo"
                }
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={redoCount === 0}
                onClick={onRedo}
                className="p-1.5 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
                title={
                  redoCount > 0
                    ? `Redo schedule shift (${redoCount} step${redoCount > 1 ? "s" : ""})`
                    : "Nothing to redo"
                }
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              {onResetDatesToBaseline && (
                <button
                  type="button"
                  onClick={onResetDatesToBaseline}
                  className="p-1.5 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                  title="Reset all wave dates to baseline schedule"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </>
        )}

        <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-0.5" />

        {/* Segment C: Time Scale Presets (Day | Week | Month) */}
        <div className="inline-flex items-center rounded-lg bg-stone-100 dark:bg-stone-800 p-0.5 font-mono text-[10.5px]">
          {(["DAY", "WEEK", "MONTH"] as TimeScalePreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onTimeScalePresetChange(preset)}
              className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                timeScalePreset === preset
                  ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
              }`}
              title={`Switch calendar density to ${preset} view`}
            >
              {preset === "DAY" ? "Day" : preset === "WEEK" ? "Week" : "Month"}
            </button>
          ))}
        </div>

        <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-0.5" />

        {/* Segment D: Zoom & Viewport Navigation */}
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onButtonZoom(-25)}
            className="p-1.5 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            title="Zoom Out (-25%)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onFitView}
            className="px-1.5 py-1 rounded-lg text-[10.5px] font-mono font-bold tabular-nums text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer min-w-[40px] text-center"
            title="Reset Zoom to 100% (Fit)"
          >
            {zoomLevel}%
          </button>
          <button
            type="button"
            onClick={() => onButtonZoom(25)}
            className="p-1.5 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            title="Zoom In (+25%)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onCenterTimeline}
            className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            title="Center Timeline on T0 Start / Today"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-0.5" />

        {/* Segment E: Select All, Lock Row & Quick Shift */}
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleSelectAll}
            className="p-1.5 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            title={
              selectedWaveNumbers.length === totalWavesCount &&
              totalWavesCount > 0
                ? "Deselect All Waves"
                : "Select All Waves"
            }
          >
            <CheckSquare
              className={`w-3.5 h-3.5 ${
                hasSelectedWaves ? "text-indigo-600 dark:text-indigo-400" : ""
              }`}
            />
          </button>

          {!isLocked && (
            <>
              <button
                type="button"
                onClick={onToggleLockSelectedOrAll}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  areSelectedLocked || lockedWaveNumbers.length > 0
                    ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50"
                    : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
                title={
                  hasSelectedWaves
                    ? areSelectedLocked
                      ? "Unlock selected wave rows"
                      : "Lock selected wave rows"
                    : lockedWaveNumbers.length > 0
                      ? `Unlock all (${lockedWaveNumbers.length}) locked rows`
                      : "Lock all wave rows"
                }
              >
                {areSelectedLocked || lockedWaveNumbers.length > 0 ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <Unlock className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onShiftWaves(-1)}
                className="px-1.5 py-1 rounded-lg text-[10.5px] font-mono font-bold tabular-nums text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                title={`Shift ${
                  hasSelectedWaves ? "selected" : "all unlocked"
                } waves -1 day`}
              >
                -1d
              </button>
              <button
                type="button"
                onClick={() => onShiftWaves(1)}
                className="px-1.5 py-1 rounded-lg text-[10.5px] font-mono font-bold tabular-nums text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
                title={`Shift ${
                  hasSelectedWaves ? "selected" : "all unlocked"
                } waves +1 day`}
              >
                +1d
              </button>
            </>
          )}
        </div>

        <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-0.5" />

        {/* Segment F: Search & Bottleneck Filter + Auto-Realign */}
        <div className="inline-flex items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleSearchFilterOpen}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
              isSearchFilterOpen || Boolean(searchQuery.trim())
                ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
            title="Search BOM item / BOP station & Batch Shift Drawer"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Search</span>
          </button>

          {!isLocked && (
            <button
              type="button"
              onClick={onToggleOnlyBottlenecks}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono font-bold tabular-nums transition-colors cursor-pointer ${
                onlyBottlenecks
                  ? "bg-rose-600 text-white shadow-2xs"
                  : bottleneckTotal > 0
                    ? "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    : "text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              }`}
              title="Filter waves with Bottleneck / Tight Handover only"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{bottleneckTotal}</span>
            </button>
          )}

          {!isLocked && onAutoRealignSchedule && criticalCount > 0 && (
            <button
              type="button"
              onClick={onAutoRealignSchedule}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
              title="Auto-Realign unlocked waves to resolve starvation bottlenecks"
            >
              <Wand2 className="w-3 h-3" />
              <span className="hidden sm:inline">Realign</span>
            </button>
          )}
        </div>

        <span className="w-px h-4 bg-stone-200 dark:bg-stone-700 mx-0.5" />

        {/* Segment G: View Settings & Simulation Trigger */}
        <button
          type="button"
          onClick={onToggleViewSettingsOpen}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
            isViewSettingsOpen || vendorSlipSimDays > 0
              ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
              : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
          }`}
          title="View Settings & Vendor Delay Simulation"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-stone-500" />
          <span className="hidden md:inline">Settings</span>
          {vendorSlipSimDays > 0 && (
            <span className="font-mono text-[10px] font-bold text-rose-600 dark:text-rose-400">
              +{vendorSlipSimDays}d
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
