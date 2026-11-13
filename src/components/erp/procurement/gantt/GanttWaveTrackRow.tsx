import React from "react";
import { Lock, Move } from "lucide-react";
import type { WaveBottleneckMetric } from "../WaveBottleneckInsightPanel";
import type {
  CalendarDayTick,
  EffectiveWaveDates,
  WaveGanttRow,
} from "./ganttTypes";
import { addDays, daysDiff, formatShortDate } from "./ganttDateUtils";

interface GanttWaveTrackRowProps {
  wave: WaveGanttRow;
  metric: WaveBottleneckMetric | null;
  eff: EffectiveWaveDates;
  isLocked: boolean;
  isRowLocked: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  leadTimeBufferDays: number;
  waveBudgetShare: number;
  ticks: CalendarDayTick[];
  todayPct: number;
  masterStartPct: number | null;
  showConnectors: boolean;
  getPct: (isoDate?: string | null) => number;
  onRowRef: (waveNum: number, el: HTMLDivElement | null) => void;
  onWaveSelectionClick: (e: React.MouseEvent, waveNum: number) => void;
  onStartDrag: (
    e: React.MouseEvent,
    waveNum: number,
    mode: "MOVE" | "RESIZE_LEFT" | "RESIZE_RIGHT",
  ) => void;
}

export const GanttWaveTrackRow: React.FC<GanttWaveTrackRowProps> = ({
  wave,
  metric,
  eff,
  isLocked,
  isRowLocked,
  isSelected,
  isExpanded,
  leadTimeBufferDays,
  waveBudgetShare,
  ticks,
  todayPct,
  masterStartPct,
  showConnectors,
  getPct,
  onRowRef,
  onWaveSelectionClick,
  onStartDrag,
}) => {
  const isDragging = eff.isDragging;
  const effectiveLocked = isLocked || isRowLocked;

  const orderDate = eff.orderDate;
  const arrivalDate = eff.arrivalDate;
  const prodNeedDate = wave.production_need_date || arrivalDate;
  const prodDurationDays = Math.max(1, Number(wave.process_duration_days || 3));
  const prodEndDate =
    wave.process_end_date || addDays(prodNeedDate, prodDurationDays);

  const procDurationDays = Math.max(1, daysDiff(orderDate, arrivalDate));
  const maxItemLt = Math.max(1, Number(wave.max_lead_time_days || 4));

  const procStartPct = getPct(orderDate);
  const procEndPct = getPct(arrivalDate);
  const procWidthPct = Math.max(2.6, procEndPct - procStartPct);

  const prodStartPct = getPct(prodNeedDate);
  const prodEndPct = getPct(prodEndDate);
  const prodWidthPct = Math.max(2.6, prodEndPct - prodStartPct);

  const corridorLeft = Math.min(procEndPct, prodStartPct);
  const corridorWidth = Math.max(0.5, Math.abs(prodStartPct - procEndPct));
  const isStarving = procEndPct > prodStartPct + 0.1;
  const slackDeltaDays = daysDiff(arrivalDate, prodNeedDate);
  const severity = metric?.severity || "OPTIMAL";

  return (
    <div
      ref={(el) => onRowRef(wave.wave_number, el)}
    >
      {/* Primary Two-Tier Wave Summary Track (h-[96px]) */}
      <div
        onClick={(e) => onWaveSelectionClick(e, wave.wave_number)}
        className={`relative h-[96px] min-h-[96px] px-4 flex flex-col justify-center overflow-hidden transition-colors ${
          isDragging
            ? "bg-amber-50/70 dark:bg-amber-950/35"
            : isSelected
              ? "bg-indigo-50/75 dark:bg-indigo-950/40 ring-1 ring-inset ring-indigo-400/60"
              : isRowLocked
                ? "bg-stone-100/60 dark:bg-stone-850/50"
                : isExpanded
                  ? "bg-stone-50/90 dark:bg-stone-850/70"
                  : !isLocked && severity === "CRITICAL"
                    ? "bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50/50 dark:hover:bg-rose-950/30"
                    : "hover:bg-stone-50/60 dark:hover:bg-stone-850/40"
        }`}
      >
        {/* Background Calendar Grid Lines */}
        {ticks.map((t, idx) => (
          <div
            key={`tick-grid-${idx}`}
            style={{ left: `${t.pct}%` }}
            className={`absolute top-0 bottom-0 w-px pointer-events-none ${
              t.isWeekend
                ? "bg-amber-100/60 dark:bg-amber-950/30"
                : "bg-stone-100 dark:bg-stone-800/80"
            }`}
          />
        ))}

        {/* Subtle Horizontal Mid-Line separating Top Track (Procurement) & Bottom Track (BOP Plan) */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-stone-200/40 dark:bg-stone-800/50 pointer-events-none" />

        {/* Today Vertical Line */}
        <div
          style={{ left: `${todayPct}%` }}
          className="absolute top-0 bottom-0 w-px border-l border-dashed border-stone-500/50 pointer-events-none z-10"
        />

        {/* Master Start T0 Vertical Line */}
        {masterStartPct !== null && (
          <div
            style={{ left: `${masterStartPct}%` }}
            className="absolute top-0 bottom-0 w-px border-l border-dashed border-indigo-400/50 pointer-events-none z-10"
          />
        )}

        {/* MIDDLE ZONE: Handover Gap / Conflict Corridor Shading */}
        <div
          style={{
            left: `${corridorLeft}%`,
            width: `${corridorWidth}%`,
          }}
          className={`absolute top-2 bottom-2 rounded-md pointer-events-none ${
            isLocked
              ? "bg-stone-200/40 dark:bg-stone-800/40"
              : severity === "CRITICAL"
                ? "bg-rose-500/15 dark:bg-rose-500/25 border-x-2 border-rose-500"
                : severity === "WARNING"
                  ? "bg-amber-400/15 dark:bg-amber-400/25 border-x border-dashed border-amber-500"
                  : "bg-emerald-500/10 dark:bg-emerald-500/20 border-x border-dashed border-emerald-500/60"
          }`}
        />

        {/* Stepped Orthogonal Dependency Connector (Procurement Arrival End -> Handover Gap -> BOP Plan Start) */}
        {showConnectors && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-hidden"
            preserveAspectRatio="none"
          >
            {/* Vertical drop from Top Track right edge to middle handover corridor */}
            <line
              x1={`${procEndPct}%`}
              y1="23px"
              x2={`${procEndPct}%`}
              y2="48px"
              stroke={
                isLocked
                  ? "#78716c"
                  : isStarving
                    ? "#e11d48"
                    : slackDeltaDays < leadTimeBufferDays
                      ? "#d97706"
                      : "#059669"
              }
              strokeWidth="1.75"
              strokeDasharray={isStarving ? "3,2" : "none"}
            />
            {/* Horizontal span across the Handover Gap */}
            <line
              x1={`${procEndPct}%`}
              y1="48px"
              x2={`${prodStartPct}%`}
              y2="48px"
              stroke={
                isLocked
                  ? "#78716c"
                  : isStarving
                    ? "#e11d48"
                    : slackDeltaDays < leadTimeBufferDays
                      ? "#d97706"
                      : "#059669"
              }
              strokeWidth="1.75"
              strokeDasharray={isStarving ? "3,2" : "none"}
            />
            {/* Vertical drop from middle handover corridor into Bottom Track BOP Plan start */}
            <line
              x1={`${prodStartPct}%`}
              y1="48px"
              x2={`${prodStartPct}%`}
              y2="73px"
              stroke={
                isLocked
                  ? "#78716c"
                  : isStarving
                    ? "#e11d48"
                    : "#4f46e5"
              }
              strokeWidth="1.75"
              strokeDasharray={isStarving ? "3,2" : "none"}
            />
            {/* Origin Node on Procurement Arrival */}
            <circle
              cx={`${procEndPct}%`}
              cy="23px"
              r="3"
              fill={
                isLocked
                  ? "#78716c"
                  : isStarving
                    ? "#e11d48"
                    : slackDeltaDays < leadTimeBufferDays
                      ? "#d97706"
                      : "#059669"
              }
            />
            {/* Destination Node on BOP Plan Start */}
            <circle
              cx={`${prodStartPct}%`}
              cy="73px"
              r="3.2"
              fill={
                isLocked
                  ? "#78716c"
                  : isStarving
                    ? "#e11d48"
                    : "#4f46e5"
              }
            />
          </svg>
        )}

        {/* Handover Gap Pill Badge (Centered in Middle Zone between Procurement & BOP Plan) */}
        {showConnectors && !isLocked && (
          <div
            style={{
              left: `${(procEndPct + prodStartPct) / 2}%`,
              top: "48px",
            }}
            className={`absolute -translate-y-1/2 -translate-x-1/2 z-20 px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold tabular-nums pointer-events-none border shadow-2xs whitespace-nowrap ${
              isStarving
                ? "bg-rose-600 text-white border-rose-700"
                : slackDeltaDays < leadTimeBufferDays
                  ? "bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                  : "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
            }`}
          >
            {slackDeltaDays < 0
              ? `${slackDeltaDays}d Overlap`
              : slackDeltaDays === 0
                ? "0d JIT Handover"
                : `+${slackDeltaDays}d Handover`}
          </div>
        )}

        {/* Live Floating Coordinate HUD during Drag/Resize */}
        {isDragging && (
          <div
            style={{
              left: `${Math.max(6, Math.min(92, (procStartPct + procEndPct) / 2))}%`,
              top: "2px",
            }}
            className="absolute -translate-x-1/2 z-30 px-2 py-0.5 rounded bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-[9px] font-mono font-bold tabular-nums shadow-md pointer-events-none whitespace-nowrap"
          >
            W{wave.wave_number}: {formatShortDate(orderDate)} →{" "}
            {formatShortDate(arrivalDate)} ({procDurationDays}d Dur)
          </div>
        )}

        {/* TRACK 1 (TOP): PROCUREMENT DURATION BLOCK (h-[28px], top: 9px) */}
        <div
          data-gantt-interactive-bar="true"
          style={{
            left: `${procStartPct}%`,
            width: `${procWidthPct}%`,
            top: "9px",
          }}
          onMouseDown={(e) =>
            !effectiveLocked && onStartDrag(e, wave.wave_number, "MOVE")
          }
          className={`group absolute h-7 rounded-md flex items-center justify-between px-2.5 text-[10px] font-mono tabular-nums text-white shadow-xs select-none z-10 ${
            isLocked
              ? "bg-stone-500 dark:bg-stone-600 cursor-default"
              : isRowLocked
                ? "bg-stone-600 dark:bg-stone-700 ring-1 ring-amber-400/80 cursor-not-allowed"
                : severity === "CRITICAL"
                  ? "bg-rose-600 ring-2 ring-rose-400 cursor-grab active:cursor-grabbing"
                  : severity === "WARNING"
                    ? "bg-amber-600 ring-1 ring-amber-300 cursor-grab active:cursor-grabbing"
                    : "bg-emerald-600 cursor-grab active:cursor-grabbing"
          } ${isSelected ? "ring-2 ring-indigo-300 dark:ring-indigo-400" : ""}`}
          title={
            effectiveLocked
              ? `Wave ${wave.wave_number} Locked: Procurement ${orderDate} → ${arrivalDate} (${procDurationDays}d duration)`
              : `Wave ${wave.wave_number} Procurement Duration: ${procDurationDays}d (${orderDate} → ${arrivalDate}) — Drag bar to shift, or drag edges to change duration`
          }
        >
          {/* Left Resize Handle (Adjusts Order Release Date & Duration) */}
          {!effectiveLocked && (
            <div
              onMouseDown={(e) =>
                onStartDrag(e, wave.wave_number, "RESIZE_LEFT")
              }
              className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-black/25 rounded-l-md flex items-center justify-center"
              title="Drag left edge to adjust PR/PO release date and procurement duration"
            >
              <span className="w-0.5 h-3 bg-white/80 rounded-full" />
            </div>
          )}

          <div className="flex items-center gap-1.5 truncate px-1">
            {isRowLocked ? (
              <Lock className="w-3 h-3 text-amber-300 shrink-0" />
            ) : !isLocked ? (
              <Move className="w-3 h-3 text-white/80 shrink-0" />
            ) : null}
            <span className="truncate font-semibold">
              W{wave.wave_number} · {procDurationDays}d (
              {formatShortDate(orderDate)} → {formatShortDate(arrivalDate)})
            </span>
          </div>

          <span className="font-mono font-bold shrink-0 ml-1 text-[9.5px] opacity-95">
            LT {maxItemLt}d · {waveBudgetShare}%
          </span>

          {/* Right Resize Handle (Adjusts Arrival Date, Duration & Handover Gap) */}
          {!effectiveLocked && (
            <div
              onMouseDown={(e) =>
                onStartDrag(e, wave.wave_number, "RESIZE_RIGHT")
              }
              className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-black/25 rounded-r-md flex items-center justify-center"
              title="Drag right edge to adjust arrival date, procurement duration, and handover gap"
            >
              <span className="w-0.5 h-3 bg-white/80 rounded-full" />
            </div>
          )}
        </div>

        {/* TRACK 2 (BOTTOM): PLAN BOP EXECUTION BLOCK (h-[28px], bottom: 9px) */}
        <div
          style={{
            left: `${prodStartPct}%`,
            width: `${prodWidthPct}%`,
            bottom: "9px",
          }}
          className={`absolute h-7 rounded-md text-white flex items-center justify-between px-2.5 text-[10px] font-mono tabular-nums shadow-xs z-10 ${
            isLocked
              ? "bg-stone-400 dark:bg-stone-700"
              : "bg-indigo-600 dark:bg-indigo-700 hover:bg-indigo-500"
          }`}
          title={`Downstream BOP Execution Plan: ${wave.bop_process_summary} (${prodNeedDate} → ${prodEndDate}, ${prodDurationDays}d)`}
        >
          <span className="truncate font-semibold">
            BOP Plan: {formatShortDate(prodNeedDate)} →{" "}
            {formatShortDate(prodEndDate)}
          </span>
          <span className="opacity-90 shrink-0 ml-1 text-[9.5px] font-bold">
            {wave.wot_lot_range || "Station"} · {prodDurationDays}d
          </span>
        </div>
      </div>

      {/* Expandable Material BOM Sub-Tracks in Right Pane (h-10 each) */}
      {isExpanded && (wave.items || []).length > 0 && (
        <div className="divide-y divide-stone-100 dark:divide-stone-800/70 bg-stone-50/70 dark:bg-stone-900/50 border-t border-stone-200/70 dark:border-stone-800">
          {(wave.items || []).map((it, idx) => {
            const itemLt = Math.max(1, Number(it.lead_time_days || 4));
            const itemOrderDate = addDays(arrivalDate, -itemLt);
            const itemNeedDate = it.station_need_date || prodNeedDate;

            const itemStartPct = getPct(itemOrderDate);
            const itemEndPct = getPct(arrivalDate);
            const itemWidthPct = Math.max(2.2, itemEndPct - itemStartPct);
            const itemNeedPct = getPct(itemNeedDate);

            const isCriticalDriver =
              itemLt >= Number(wave.max_lead_time_days || 4);
            const itemSlack = daysDiff(arrivalDate, itemNeedDate);

            return (
              <div
                key={it.id || `${wave.wave_number}-sub-${idx}`}
                className="relative h-10 min-h-[40px] px-4 flex items-center overflow-hidden hover:bg-stone-100/60 dark:hover:bg-stone-800/40 transition-colors"
              >
                {ticks.map((t, tIdx) => (
                  <div
                    key={`sub-tick-${tIdx}`}
                    style={{ left: `${t.pct}%` }}
                    className="absolute top-0 bottom-0 w-px bg-stone-200/50 dark:bg-stone-800/60 pointer-events-none"
                  />
                ))}

                {showConnectors && (
                  <div
                    style={{
                      left: `${Math.min(itemEndPct, itemNeedPct)}%`,
                      width: `${Math.max(
                        0.5,
                        Math.abs(itemNeedPct - itemEndPct),
                      )}%`,
                    }}
                    className={`absolute h-0.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                      itemSlack < 0 ? "bg-rose-500" : "bg-emerald-500/60"
                    }`}
                  />
                )}

                <div
                  style={{
                    left: `${itemStartPct}%`,
                    width: `${itemWidthPct}%`,
                  }}
                  className={`absolute h-5 rounded flex items-center justify-between px-2 text-[9px] font-mono tabular-nums text-white shadow-2xs ${
                    isLocked
                      ? "bg-stone-400 dark:bg-stone-600"
                      : itemSlack < 0
                        ? "bg-rose-500"
                        : isCriticalDriver
                          ? "bg-teal-600 dark:bg-teal-700"
                          : "bg-emerald-500/90 dark:bg-emerald-600/90"
                  }`}
                  title={`${it.item_code}: Order ${itemOrderDate} → Arrival ${arrivalDate} (Vendor LT: ${itemLt}d, Handover: ${itemSlack >= 0 ? `+${itemSlack}d` : `${itemSlack}d`})`}
                >
                  <span className="truncate">
                    {it.item_code} ({formatShortDate(itemOrderDate)} →{" "}
                    {formatShortDate(arrivalDate)})
                  </span>
                  <span className="font-bold shrink-0 ml-1">{itemLt}d</span>
                </div>

                <div
                  style={{ left: `${itemNeedPct}%` }}
                  className="absolute top-2 bottom-2 w-1 -translate-x-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400 z-10"
                  title={`BOP Station Need Date: ${itemNeedDate}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
