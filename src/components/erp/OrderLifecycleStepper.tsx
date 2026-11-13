import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  Factory,
  PackageCheck,
  Truck,
  Receipt,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { cn } from "@/lib/utils";

interface PipelineStage {
  key: string;
  step: number;
  isaLevel: string;
  label: string;
  docNumber: string;
  subDocNumber?: string | null;
  status: "COMPLETED" | "IN_PROGRESS" | "PENDING";
  summary: string;
}

interface PipelineResponse {
  projectId: string;
  projectName: string;
  customer: string;
  fulfillmentMode: "MTO" | "MTS";
  spkNumber: string;
  ntpNumber: string | null;
  fgrNumber: string | null;
  stages: PipelineStage[];
  nextAction?: {
    label: string;
    path: string;
    stageKey: string;
  };
}

interface OrderLifecycleStepperProps {
  projectId: string;
  className?: string;
}

const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  QUOTATION: FileText,
  SPK_PROJECT: Sparkles,
  ENGINEERING_SCM: Layers,
  SHOP_FLOOR_WOT: Factory,
  FGR_INBOUND: PackageCheck,
  DELIVERY_NOTE: Truck,
  COMMERCIAL_INVOICE: Receipt,
};

export const OrderLifecycleStepper: React.FC<OrderLifecycleStepperProps> = ({
  projectId,
  className,
}) => {
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchPipeline = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/projects/${projectId}/end-to-end-pipeline`);
      if (res.ok && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error("Failed to load order lifecycle pipeline:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPipeline();
  }, [projectId]);

  if (loading && !data) {
    return (
      <div className={cn("bg-white rounded-2xl border border-stone-200 p-4 shadow-2xs animate-pulse", className)}>
        <div className="h-4 w-64 bg-stone-200 rounded mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {Array.from({ length: 7 }).map((_, idx) => (
            <div key={idx} className="h-20 bg-stone-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const completedStages = data.stages.filter((s) => s.status === "COMPLETED").length;

  return (
    <div className={cn("bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-2xs space-y-4", className)}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[11px] font-black uppercase tracking-wider text-stone-900 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            ISA-95 / APICS End-to-End Manufacturing Value Stream
          </span>
          <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[10px] font-mono font-bold text-stone-700">
            {data.fulfillmentMode === "MTO" ? "MAKE-TO-ORDER (MTO)" : "MAKE-TO-STOCK (MTS)"}
          </span>
          {data.spkNumber && (
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-[10px] font-mono font-bold text-indigo-800">
              WO: {data.spkNumber}
            </span>
          )}
          {data.ntpNumber && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-mono font-bold text-emerald-800">
              NTP: {data.ntpNumber}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11px] font-mono font-semibold text-stone-500">
            {completedStages}/7 Stages Complete
          </span>
          <button
            type="button"
            onClick={fetchPipeline}
            className="p-1.5 rounded-lg border border-stone-200 text-stone-500 hover:text-stone-900 hover:bg-stone-50 transition-colors cursor-pointer"
            title="Refresh Pipeline Status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 7-Stage Pipeline Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
        {data.stages.map((stage) => {
          const IconComponent = STAGE_ICONS[stage.key] || FileText;
          const isCompleted = stage.status === "COMPLETED";
          const isInProgress = stage.status === "IN_PROGRESS";

          return (
            <div
              key={stage.key}
              className={cn(
                "rounded-xl border p-3 flex flex-col justify-between transition-all relative",
                isCompleted
                  ? "bg-emerald-50/50 border-emerald-200/90 text-emerald-950"
                  : isInProgress
                    ? "bg-amber-50/60 border-amber-300 text-amber-950 ring-1 ring-amber-300/60"
                    : "bg-stone-50/70 border-stone-200/80 text-stone-500"
              )}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                      isCompleted
                        ? "bg-emerald-100 text-emerald-800"
                        : isInProgress
                          ? "bg-amber-200/80 text-amber-900"
                          : "bg-stone-200/70 text-stone-600"
                    )}
                  >
                    0{stage.step} • {stage.isaLevel.split(" ")[0]}
                  </span>
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : isInProgress ? (
                    <Clock className="w-4 h-4 text-amber-600 animate-pulse shrink-0" />
                  ) : (
                    <IconComponent className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  )}
                </div>

                <div className="text-xs font-extrabold leading-tight text-stone-900">
                  {stage.label}
                </div>

                <div className="text-[11px] font-mono font-bold truncate text-stone-800" title={stage.docNumber}>
                  {stage.docNumber}
                </div>

                {stage.subDocNumber && (
                  <div className="text-[10px] font-mono text-stone-600 truncate" title={stage.subDocNumber}>
                    {stage.subDocNumber}
                  </div>
                )}
              </div>

              <div className="mt-2.5 pt-2 border-t border-stone-200/60 flex items-center justify-between">
                <span
                  className={cn(
                    "text-[10px] font-semibold truncate",
                    isCompleted
                      ? "text-emerald-700"
                      : isInProgress
                        ? "text-amber-800"
                        : "text-stone-500"
                  )}
                >
                  {stage.summary}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
