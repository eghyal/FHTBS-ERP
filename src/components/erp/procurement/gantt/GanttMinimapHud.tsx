import React from "react";
import type { WaveBottleneckMetric } from "../WaveBottleneckInsightPanel";
import type { EffectiveWaveDates, WaveGanttRow } from "./ganttTypes";

interface GanttMinimapHudProps {
  waves: WaveGanttRow[];
  liveMetrics: WaveBottleneckMetric[];
  selectedWaveNumbers: number[];
  zoomLevel: number;
  viewportThumb: { leftPct: number; widthPct: number };
  getEffectiveWaveDates: (w: WaveGanttRow) => EffectiveWaveDates;
  getPct: (isoDate?: string | null) => number;
  onJumpToRatio: (clickRatio: number) => void;
}

export const GanttMinimapHud: React.FC<GanttMinimapHudProps> = ({
  waves,
  liveMetrics,
  selectedWaveNumbers,
  zoomLevel,
  viewportThumb,
  getEffectiveWaveDates,
  getPct,
  onJumpToRatio,
}) => {
  if (waves.length === 0) return null;

  return (
    <div
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickRatio = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        onJumpToRatio(clickRatio);
      }}
      className="absolute bottom-4 right-4 z-30 pointer-events-auto w-44 sm:w-52 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border border-stone-300 dark:border-stone-700 rounded-xl p-2 shadow-lg cursor-pointer select-none"
      title="Interactive Minimap — Click anywhere to jump timeline viewport"
    >
      <div className="flex items-center justify-between text-[9px] font-mono tabular-nums text-stone-500 dark:text-stone-400 mb-1">
        <span className="font-bold uppercase tracking-wider">
          Minimap Overview
        </span>
        <span>{zoomLevel}%</span>
      </div>
      <div className="relative h-12 bg-stone-100 dark:bg-stone-850 rounded border border-stone-200 dark:border-stone-800 overflow-hidden">
        {waves.map((w, idx) => {
          const eff = getEffectiveWaveDates(w);
          const sPct = getPct(eff.orderDate);
          const ePct = getPct(eff.arrivalDate);
          const wPct = Math.max(4, ePct - sPct);
          const bopStartPct = getPct(w.production_need_date || eff.arrivalDate);
          const topPct =
            waves.length > 0 ? (idx / waves.length) * 84 + 6 : 10;
          const metric = liveMetrics.find(
            (m) => m.waveNumber === w.wave_number,
          );
          const isSel = selectedWaveNumbers.includes(w.wave_number);
          return (
            <React.Fragment key={`mini-${w.wave_number}`}>
              <div
                style={{
                  left: `${sPct}%`,
                  width: `${wPct}%`,
                  top: `${topPct}%`,
                }}
                className={`absolute h-1.5 rounded-full ${
                  isSel
                    ? "bg-indigo-600"
                    : metric?.severity === "CRITICAL"
                      ? "bg-rose-500"
                      : metric?.severity === "WARNING"
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                }`}
              />
              {/* Tiny BOP need marker */}
              <div
                style={{
                  left: `${bopStartPct}%`,
                  top: `${topPct}%`,
                }}
                className="absolute w-1 h-1.5 rounded-full bg-indigo-500/80"
              />
            </React.Fragment>
          );
        })}

        {/* Viewport Indicator Box */}
        <div
          style={{
            left: `${viewportThumb.leftPct}%`,
            width: `${viewportThumb.widthPct}%`,
          }}
          className="absolute top-0 bottom-0 border-2 border-indigo-500 bg-indigo-500/10 rounded pointer-events-none"
        />
      </div>
    </div>
  );
};
