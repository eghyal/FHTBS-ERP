import React, { memo } from "react";
import {
  Calendar,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Layers,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { cn } from "@/lib/utils";

export interface ConflictingProjectInfo {
  id: string;
  name: string;
  spk_number: string;
  overlap_days: number;
  shared_machines: string[];
  shared_stations: string[];
  affected_steps_count: number;
  wot_queue_mins: number;
  queued_hours: number;
}

export interface ConcurrentScheduleMatrixProps {
  concurrentProjects: any[];
  conflictingProjects: ConflictingProjectInfo[];
  startDate: string;
  isLoadingSchedule: boolean;
  onRefreshSchedule: () => void;
}

export const ConcurrentScheduleMatrix: React.FC<ConcurrentScheduleMatrixProps> = memo(
  function ConcurrentScheduleMatrix({
    concurrentProjects = [],
    conflictingProjects = [],
    startDate,
    isLoadingSchedule,
    onRefreshSchedule,
  }) {
    const conflictMap = new Map<string, ConflictingProjectInfo>();
    conflictingProjects.forEach((cp) => {
      conflictMap.set(cp.id, cp);
    });

    return (
      <div className="bg-white border border-stone-200/80 rounded-2xl p-6 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
          <div>
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <span>02. Cross-Project Schedule &amp; Resource Contention Matrix</span>
              {conflictingProjects.length > 0 ? (
                <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-mono font-bold">
                  {conflictingProjects.length} Contention(s)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono font-bold">
                  Zero Contention
                </span>
              )}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Evaluates active factory projects overlapping with your planned start date ({startDate || "Today"}) for shared workstation &amp; machine queue buffers.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={onRefreshSchedule}
            disabled={isLoadingSchedule}
            title="Refresh Load"
            aria-label="Refresh Load"
          >
            <RefreshCw
              className={cn("w-4 h-4", isLoadingSchedule && "animate-spin")}
            />
          </Button>
        </div>

        {concurrentProjects.length === 0 ? (
          <div className="p-6 rounded-xl bg-stone-50 border border-stone-200 text-center space-y-1">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
            <p className="text-xs font-bold text-stone-800">
              No Concurrent Manufacturing Projects Active
            </p>
            <p className="text-[11px] text-stone-500">
              All shop floor workstations and machines have 100% dedicated capacity for this project.
            </p>
          </div>
        ) : (
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-stone-50 border-b border-stone-200">
                  <TableHead className="py-2.5 px-3 font-bold text-stone-700">
                    Concurrent Project / SPK
                  </TableHead>
                  <TableHead className="py-2.5 px-3 font-bold text-stone-700">
                    Active Window
                  </TableHead>
                  <TableHead className="py-2.5 px-3 font-bold text-stone-700 text-center">
                    Progress
                  </TableHead>
                  <TableHead className="py-2.5 px-3 font-bold text-stone-700">
                    Shared Resources
                  </TableHead>
                  <TableHead className="py-2.5 px-3 font-bold text-stone-700 text-right">
                    Queue Impact
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-stone-200">
                {concurrentProjects.map((proj: any) => {
                  const conflict = conflictMap.get(proj.id);
                  const hasConflict = Boolean(conflict);

                  return (
                    <TableRow
                      key={proj.id}
                      className={cn(
                        "transition-colors",
                        hasConflict
                          ? "bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/60"
                          : "hover:bg-stone-50/80 dark:hover:bg-stone-800/40",
                      )}
                    >
                      <TableCell className="py-2.5 px-3">
                        <div className="font-bold text-stone-900 dark:text-stone-100">
                          [{proj.spk_number || proj.id}] {proj.name}
                        </div>
                        <div className="text-[11px] text-stone-500 dark:text-stone-400 font-mono">
                          {proj.customer || "Internal"} · {proj.qty || 1} {proj.uom || "UNIT"} ·{" "}
                          <span className="uppercase">{proj.status}</span>
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3 font-mono text-[11px] text-stone-700 dark:text-stone-300">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          <span>
                            {proj.start_date} → {proj.estimated_end_date || proj.due_date}
                          </span>
                        </div>
                        {conflict && conflict.overlap_days > 0 && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-400 font-bold mt-0.5">
                            Overlaps {conflict.overlap_days} day(s)
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5 px-3 text-center font-mono">
                        <span className="font-bold text-stone-900 dark:text-stone-100">
                          {proj.progress_pct ?? 0}%
                        </span>
                        <span className="block text-[10px] text-stone-500">
                          {proj.completed_steps ?? 0}/{proj.total_steps ?? 0} steps
                        </span>
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        {hasConflict && conflict ? (
                          <div className="flex flex-wrap gap-1.5">
                            {conflict.shared_machines.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 text-[10px] font-mono font-bold">
                                <Cpu className="w-3 h-3" />
                                {conflict.shared_machines.length} Shared Mach
                              </span>
                            )}
                            {conflict.shared_stations.length > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-[10px] font-mono font-bold">
                                <Layers className="w-3 h-3" />
                                {conflict.shared_stations.length} Shared Stn
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                            Independent Route
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {hasConflict && conflict ? (
                          <div>
                            <span className="font-bold text-amber-700 dark:text-amber-400 inline-flex items-center justify-end gap-1">
                              <AlertTriangle className="w-3 h-3" />+{conflict.queued_hours}h Queue
                            </span>
                            <span className="block text-[10px] text-stone-500">
                              +{conflict.wot_queue_mins}m / WOT ({conflict.affected_steps_count} step)
                            </span>
                          </div>
                        ) : (
                          <span className="text-stone-400 font-semibold inline-flex items-center justify-end gap-1">
                            <Clock className="w-3 h-3" />
                            +0.0h
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  },
);
