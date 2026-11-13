import React from "react";
import {
  GitBranch,
  Calendar,
  Sparkles,
  Package,
} from "lucide-react";

interface BlueprintZeroStateProps {
  candidateCount?: number;
}

export const BlueprintZeroState: React.FC<BlueprintZeroStateProps> = ({
  candidateCount = 0,
}) => {
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/60 p-8 sm:p-12 shadow-2xs">
      {/* Background CAD / Blueprint Grid Lines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(#a8a29e 1px, transparent 1px), linear-gradient(to right, #e7e5e4 1px, transparent 1px), linear-gradient(to bottom, #e7e5e4 1px, transparent 1px)",
          backgroundSize: "24px 24px, 48px 48px, 48px 48px",
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto text-center space-y-5">
        {/* Architectural Node Icon */}
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 text-emerald-600 dark:text-emerald-400 border border-stone-200 dark:border-stone-700 shadow-2xs">
          <GitBranch className="w-6 h-6" />
        </div>

        {/* Title & Tagline */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[11px] font-mono font-medium text-stone-600 dark:text-stone-300">
            <span>Procurement Wave Engine</span>
            <span>·</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              Strategic Planning Mode
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            Procurement Wave Strategy Canvas
          </h2>
          <p className="text-xs text-stone-600 dark:text-stone-400 max-w-lg mx-auto leading-relaxed">
            Select a manufacturing project from the header droplist above to preview the baseline arrival timeline
            and optionally activate strategic planning.
          </p>
        </div>

        {/* 3 Step Interactive Workflow Diagram */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-left">
          <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="w-5 h-5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-[10px] font-bold font-mono flex items-center justify-center border border-stone-200 dark:border-stone-700">
                1
              </span>
              <Package className="w-3.5 h-3.5 text-stone-400" />
            </div>
            <div className="text-xs font-semibold text-stone-900 dark:text-stone-100">
              Select Project
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
              Choose an active manufacturing project from the header droplist above.
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="w-5 h-5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-[10px] font-bold font-mono flex items-center justify-center border border-stone-200 dark:border-stone-700">
                2
              </span>
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-xs font-semibold text-stone-900 dark:text-stone-100">
              Locked Preview
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
              Immediately view the neutral baseline Gantt timeline for the selected project.
            </p>
          </div>

          <div className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="w-5 h-5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-[10px] font-bold font-mono flex items-center justify-center border border-stone-200 dark:border-stone-700">
                3
              </span>
              <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="text-xs font-semibold text-stone-900 dark:text-stone-100">
              Optional Strategy
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
              Optionally click &ldquo;Make a strategy planning&rdquo; to unlock interactive simulation and buffer control.
            </p>
          </div>
        </div>

        {/* Footnote */}
        <div className="pt-2">
          <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500">
            Note: Procurement Wave strategic planning is an optional tool. Operational data remains unaffected.
          </span>
        </div>
      </div>
    </div>
  );
};
