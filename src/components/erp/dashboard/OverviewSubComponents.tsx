import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Library,
  X,
  RefreshCw,
  FolderKanban,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn, getInitials } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Action, hasPermission } from "@/utils/pbac";

interface OverviewTeamStatusStripProps {
  sortedUsers: any[];
  isRefreshingStatus: boolean;
  onRefresh: () => void;
}

export const OverviewTeamStatusStrip = React.memo(function OverviewTeamStatusStrip({
  sortedUsers,
  isRefreshingStatus,
  onRefresh,
}: OverviewTeamStatusStripProps) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const SCROLL_STEP_PX = 240;

  const updateScrollBounds = useCallback(() => {
    const el = listContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollBounds();
    const el = listContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollBounds);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollBounds, sortedUsers.length]);

  const onlineCount = sortedUsers.filter((u) => Boolean(u._isOnline)).length;
  const hasHorizontalOverflow = canScrollLeft || canScrollRight;

  const handleScrollStep = (direction: -1 | 1) => {
    const el = listContainerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * SCROLL_STEP_PX,
      behavior: "smooth",
    });
  };

  return (
    <div className="team-status-strip bg-transparent py-1.5 px-1 flex items-center gap-3 -mt-1 mb-2 min-w-0">
      {/* Left Anchor: Team Status + Refresh + Vertical Hairline Divider */}
      <div className="flex items-center gap-2 pr-3 border-r border-stone-200/80 shrink-0">
        <span
          className="text-[11px] text-stone-500 font-bold uppercase tracking-widest whitespace-nowrap"
          title={sortedUsers.length > 0 ? `${onlineCount}/${sortedUsers.length} online` : undefined}
        >
          Team Status
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshingStatus}
          className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/40 rounded-md transition-colors disabled:opacity-50 cursor-pointer shrink-0"
          title="Refresh Status"
          aria-label="Refresh Team Status"
        >
          <RefreshCw
            className={cn("w-3 h-3", isRefreshingStatus && "animate-spin")}
          />
        </button>
      </div>

      {/* Inline Horizontal Member Rail Extending to the Right (Always 1 Line, 8px Gap, Transparent) */}
      <div
        ref={listContainerRef}
        onScroll={updateScrollBounds}
        className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto scrollbar-hide scroll-smooth"
      >
        {sortedUsers.length === 0 ? (
          <span className="text-[11px] text-stone-400 tracking-wider uppercase font-semibold py-1 whitespace-nowrap">
            No team data
          </span>
        ) : (
          sortedUsers.map((u) => {
            const isOnline = Boolean(u._isOnline);
            return (
              <div
                key={u.username}
                className="w-auto max-w-[168px] shrink-0 flex items-center gap-2 py-0.5 pr-1 select-none"
                title={`${u.name || u.username} — ${isOnline ? `On ${u.device_type || "Device"}` : "Offline"}`}
              >
                <div className="relative shrink-0">
                  <div className="w-7 h-7 rounded-full bg-stone-200/45 border border-stone-300/60 flex items-center justify-center text-[10px] font-bold text-stone-700">
                    {getInitials(u.name || u.username)}
                  </div>
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 inline-flex rounded-full h-2.5 w-2.5 border-2 border-white",
                      isOnline ? "bg-emerald-500" : "bg-stone-400",
                    )}
                  />
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <span className="text-[11.5px] font-semibold text-stone-800 leading-tight truncate">
                    {u.name || u.username}
                  </span>
                  <span
                    className={cn(
                      "text-[9.5px] uppercase tracking-wider leading-tight font-semibold mt-0.5 whitespace-nowrap",
                      isOnline ? "text-emerald-600" : "text-stone-400",
                    )}
                  >
                    {isOnline ? `On ${u.device_type || "Device"}` : "Offline"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Inline Right Scroll Steppers (Shown Only When Horizontal Overflow Exists) */}
      {hasHorizontalOverflow && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleScrollStep(-1)}
            disabled={!canScrollLeft}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-stone-200/80 bg-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-200/40 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
            title="Geser ke kiri"
            aria-label="Geser Team Status ke kiri"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleScrollStep(1)}
            disabled={!canScrollRight}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-stone-200/80 bg-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-200/40 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
            title="Geser ke kanan"
            aria-label="Geser Team Status ke kanan"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});

interface OverviewProjectMonitorGridProps {
  monitorData: any[];
  user: any;
  t: {
    purchasedItems: string;
    stockReady: string;
    fulfillment: string;
    productionTimeline: string;
    noTasks: string;
    moreTasks: string;
    [key: string]: string;
  };
  onCancelProject: (projectId: string) => void;
}

export const OverviewProjectMonitorGrid = React.memo(function OverviewProjectMonitorGrid({
  monitorData,
  user,
  t,
  onCancelProject,
}: OverviewProjectMonitorGridProps) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="text-[10px] text-stone-400 font-bold flex items-center gap-2 uppercase tracking-[0.2em]">
        <FolderKanban className="w-3.5 h-3.5 text-stone-900" />
        Active Project Progress Monitor
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 sm:gap-5">
        {monitorData.map((mon, i) => {
          const grnProgress =
            mon.prProgress?.total_pr_qty > 0
              ? Math.round(
                  (mon.prProgress.total_received_qty /
                    mon.prProgress.total_pr_qty) *
                    100,
                )
              : 0;

          return (
            <div
              key={mon.id || i}
              className="card-elegant p-3.5 sm:p-5 rounded-xl sm:rounded-2xl flex flex-col gap-3.5 sm:gap-4"
            >
              <div className="flex flex-row justify-between items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight uppercase truncate">
                      {mon.name}
                    </h4>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ring-1 ring-inset",
                        mon.status === "DRAFT"
                          ? "bg-stone-50 text-stone-400 ring-stone-100"
                          : "bg-stone-200/40 text-stone-900 ring-stone-900/20",
                      )}
                    >
                      {mon.status}
                    </span>
                    {(mon.urgency === "URGENT" ||
                      mon.urgency === "CRITICAL") && (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider",
                          mon.urgency === "CRITICAL"
                            ? "bg-rose-500 text-white"
                            : "bg-amber-500 text-white",
                        )}
                      >
                        {mon.urgency}
                      </span>
                    )}
                  </div>
                  <div className="text-[9.5px] font-bold text-stone-400 uppercase tracking-wider mt-1 font-mono truncate">
                    UUID: {mon.id}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {hasPermission(user, Action.MANAGE_BOM) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancelProject(mon.id);
                      }}
                      className="w-8 h-8 flex items-center justify-center text-rose-600 hover:text-white bg-rose-50/50 hover:bg-rose-600 border border-rose-100 hover:border-rose-600 rounded-lg transition-all shadow-2xs shrink-0"
                      title="Cancel Project"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <Link
                    to={`/project/${mon.id}`}
                    state={{ from: "overview" }}
                    title="View Project Progress"
                    className="w-8 h-8 flex items-center justify-center bg-stone-900 text-white hover:bg-stone-800 rounded-lg transition-all shadow-sm"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                <div className="p-3 bg-stone-50/60 rounded-xl ring-1 ring-stone-100 flex flex-col justify-center">
                  <div className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                    {t.purchasedItems}
                  </div>
                  <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-stone-900 leading-none">
                    {mon.prItemCount}{" "}
                    <span className="text-[9px] uppercase font-bold text-stone-400">
                      sku
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-stone-50/60 rounded-xl ring-1 ring-stone-100 flex flex-col justify-center">
                  <div className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider mb-1">
                    {t.stockReady}
                  </div>
                  <div className="text-sm sm:text-base font-bold font-mono tabular-nums text-stone-900 leading-none">
                    {mon.stockItemCount}{" "}
                    <span className="text-[9px] uppercase font-bold text-stone-400">
                      sku
                    </span>
                  </div>
                </div>
                <div className="col-span-2 p-3 bg-stone-50/60 rounded-xl ring-1 ring-stone-100 flex flex-col justify-center">
                  <div className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider mb-1.5 flex justify-between">
                    <span>{t.fulfillment}</span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        grnProgress === 100
                          ? "text-emerald-500"
                          : "text-stone-500",
                      )}
                    >
                      {grnProgress}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-stone-200/60 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${grnProgress}%` }}
                      className={cn(
                        "h-full transition-all duration-700 ease-out",
                        grnProgress === 100
                          ? "bg-emerald-500"
                          : "bg-stone-800",
                      )}
                    />
                  </div>
                  <div className="text-[9px] font-bold text-stone-400 mt-1.5 text-right tabular-nums">
                    {mon.prProgress?.total_received_qty || 0} /{" "}
                    {mon.prProgress?.total_pr_qty || 0} RECEIVED
                  </div>
                </div>
              </div>

              <div className="bg-stone-50/40 rounded-xl ring-1 ring-stone-100 p-3 sm:p-4">
                <div className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>{t.productionTimeline}</span>
                  {!mon.is_master_set ? (
                    <span className="bg-amber-50 ring-1 ring-amber-200 text-amber-700 px-2 py-0.5 rounded-md text-[8.5px] font-bold">
                      PENDING SETUP &amp; MASTER
                    </span>
                  ) : (
                    <span className="bg-white ring-1 ring-stone-100 text-stone-500 px-2 py-0.5 rounded-md text-[8.5px] font-bold">
                      {
                        (mon.tasks || []).filter(
                          (tk: any) => tk.status !== "CANCELLED",
                        ).length
                      }{" "}
                      TASKS
                    </span>
                  )}
                </div>
                {(mon.tasks || []).length === 0 ? (
                  <div className="text-[11px] text-stone-400 font-bold uppercase tracking-widest py-4 text-center">
                    {!mon.is_master_set
                      ? "Awaiting Setup & Master Commit"
                      : t.noTasks}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(mon.tasks || [])
                      .filter((tk: any) => !!tk)
                      .slice(0, 3)
                      .map((task: any) => (
                        <div
                          key={task.id}
                          className="flex justify-between items-center group"
                        >
                          <div className="flex items-center gap-4 w-1/2">
                            <div
                              className={cn(
                                "w-2 h-2 rounded-full shrink-0 shadow-sm",
                                task.status === "COMPLETED"
                                  ? "bg-emerald-400 shadow-emerald-200"
                                  : task.status === "IN_PROGRESS"
                                    ? "bg-amber-400 shadow-amber-200"
                                    : task.status === "REJECTED"
                                      ? "bg-rose-500 shadow-rose-200 animate-pulse"
                                      : task.status === "CANCELLED"
                                        ? "bg-stone-100 shadow-stone-100"
                                        : "bg-stone-300 shadow-stone-100",
                              )}
                            />
                            <span
                              className={cn(
                                "text-[13px] font-bold truncate tracking-tight transition-colors uppercase",
                                task.status === "CANCELLED"
                                  ? "line-through text-stone-400 group-hover:text-stone-500"
                                  : "text-stone-800 group-hover:text-stone-950",
                              )}
                            >
                              {task.task_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-6 w-1/2 justify-end">
                            <span
                              className={cn(
                                "text-[10px] uppercase tracking-tight tabular-nums",
                                task.status === "CANCELLED"
                                  ? "text-stone-300 line-through font-bold"
                                  : "text-stone-400 font-bold",
                              )}
                            >
                              {new Date(task.start_date).toLocaleDateString(
                                undefined,
                                {
                                  timeZone: "Asia/Jakarta",
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </span>
                            <div
                              className={cn(
                                "w-20 h-1.5 rounded-full overflow-hidden shrink-0 ring-1",
                                task.status === "CANCELLED"
                                  ? "bg-stone-50 ring-stone-100"
                                  : "bg-stone-100 ring-stone-200/20",
                              )}
                            >
                              <div
                                style={{
                                  width:
                                    task.status === "CANCELLED"
                                      ? "0%"
                                      : `${task.progress}%`,
                                }}
                                className={cn(
                                  "h-full transition-all duration-300",
                                  task.status === "COMPLETED"
                                    ? "bg-emerald-400"
                                    : "bg-stone-400",
                                )}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    {(mon.tasks || []).length > 3 && (
                      <div className="text-[9px] font-bold text-stone-400 text-center pt-4 border-t border-stone-100/50 uppercase tracking-[0.3em]">
                        + {mon.tasks.length - 3} {t.moreTasks}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {monitorData.length === 0 && (
          <div className="col-span-full border border-stone-100 rounded-3xl p-10 text-center bg-stone-50 text-stone-400">
            No active projects at this time.
          </div>
        )}
      </div>
    </div>
  );
});

interface OverviewActionRequiredPanelProps {
  actionRequiredCount: number;
  filteredActions: {
    type: string;
    title: string;
    description: string;
    link: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
  }[];
  resolveLabel: string;
}

export const OverviewActionRequiredPanel = React.memo(function OverviewActionRequiredPanel({
  actionRequiredCount,
  filteredActions,
  resolveLabel,
}: OverviewActionRequiredPanelProps) {
  return (
    <div className="space-y-3 sm:space-y-4 flex flex-col h-full">
      <div className="text-[10px] text-stone-500 font-bold uppercase tracking-widest flex items-center justify-between w-full">
        <span>Action Required</span>
        {actionRequiredCount > 0 && (
          <span className="bg-red-500 text-white rounded-md text-[8.5px] px-2 py-0.5 font-bold tracking-normal animate-pulse shadow-2xs">
            {actionRequiredCount} REQUIRED
          </span>
        )}
      </div>
      <div className="border border-stone-200/70 rounded-xl sm:rounded-2xl overflow-hidden bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-shadow duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] h-[360px] sm:h-[560px] flex flex-col">
        <div className="p-3.5 sm:p-5 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3">
          {filteredActions.map((action, i) => (
            <Link
              key={i}
              to={action.link}
              className={cn(
                "p-3.5 sm:p-4 rounded-xl border transition-all shrink-0 card-elegant group flex flex-col justify-between action-required-card",
                action.priority === "HIGH"
                  ? "border-red-200/80 ring-1 ring-red-400/20 bg-red-50/30 hover:bg-red-50/50"
                  : "border-stone-200/80 hover:bg-stone-50",
              )}
            >
              <div>
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center mb-2.5 transition-colors",
                    action.priority === "HIGH"
                      ? "bg-red-100 text-red-600"
                      : "bg-stone-100 text-stone-600",
                  )}
                >
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-stone-900 tracking-tight uppercase mb-1">
                  {action.title}
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed line-clamp-2">
                  {action.description}
                </p>
              </div>
              <div className="mt-3.5 flex items-center gap-1.5 text-[9px] font-bold text-stone-900 group-hover:gap-2.5 transition-all uppercase tracking-wider">
                {resolveLabel}{" "}
                <ArrowRight className="w-3 h-3 text-stone-500 group-hover:text-stone-900 transition-colors" />
              </div>
            </Link>
          ))}
          {filteredActions.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 text-center text-stone-400 min-h-[160px]">
              <CheckCircle2 className="w-7 h-7 mb-2 text-stone-400" />
              <div className="text-[10px] uppercase tracking-widest font-bold text-stone-400">
                No Pending Actions
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export interface OverviewWorkCenter {
  id: string;
  name: string;
  manpower_count: number;
  hours_per_day: number;
  days_per_week: number;
  capacity_per_week: number;
  efficiency_index?: number;
  status?: "ACTIVE" | "MAINTENANCE" | "OFFLINE";
}

export interface OverviewProjectItem {
  id: string;
  name: string;
  due_date: string;
  customer: string;
  remarks: string;
  status: string;
  urgency?: "NORMAL" | "URGENT" | "CRITICAL";
  archived_at?: string;
}

interface OverviewArchiveSectionProps {
  archivedProjects: OverviewProjectItem[];
  user: any;
}

export const OverviewArchiveSection = React.memo(function OverviewArchiveSection({
  archivedProjects,
  user,
}: OverviewArchiveSectionProps) {
  return (
    <div className="space-y-4 pt-6 sm:pt-8 border-t border-stone-200/50 mt-6 sm:mt-8 block">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-stone-100 flex items-center justify-center border border-stone-200">
          <Library className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-stone-600" />
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight uppercase">
            Library &amp; Archive
          </h3>
          <p className="text-[10px] font-bold text-stone-400 tracking-wider uppercase">
            Completed &amp; Historical Projects
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
        {archivedProjects.map((p) => (
          <div
            key={p.id}
            className="bg-white border border-stone-200/80 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl hover:border-stone-300 transition-all flex flex-col justify-between group shadow-2xs hover:shadow-xs"
          >
            <div>
              <div className="text-[10px] bg-stone-100 text-stone-500 font-bold px-2 py-0.5 rounded w-fit mb-2">
                {p.id}
              </div>
              <h4 className="text-sm sm:text-base font-bold text-stone-900 mb-1.5 truncate">
                {p.name}
              </h4>
              <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">
                {p.remarks || "No remarks provided for this project."}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 bg-stone-50 text-stone-600 rounded-md text-[10px] font-bold tracking-wider uppercase border border-stone-100">
                  CUST: {p.customer || "N/A"}
                </span>
                {(p.urgency === "URGENT" || p.urgency === "CRITICAL") && (
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase",
                      p.urgency === "CRITICAL"
                        ? "bg-rose-500 text-white"
                        : "bg-amber-500 text-white",
                    )}
                  >
                    {p.urgency}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                Archived:{" "}
                {p.archived_at
                  ? new Date(p.archived_at).toLocaleDateString("en-US", {
                      timeZone: "Asia/Jakarta",
                    })
                  : "N/A"}
              </div>
              <div className="flex items-center gap-2">
                {hasPermission(user, Action.MANAGE_BOM) && (
                  <button
                    onClick={() => {
                      window.location.href = `/project/${p.id}?repeat=true`;
                    }}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors uppercase tracking-wider"
                  >
                    Repeat Order
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {archivedProjects.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50/70">
            <div className="text-stone-400 font-bold tracking-widest uppercase text-xs">
              No projects in archive yet.
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

interface WorkCenterConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  configForm: OverviewWorkCenter[];
  setConfigForm: React.Dispatch<React.SetStateAction<OverviewWorkCenter[]>>;
  isSubmittingConfig: boolean;
  onDeleteCenter: (wc: OverviewWorkCenter, idx: number) => void;
  onSaveConfig: () => void;
}

export const WorkCenterConfigModal = React.memo(function WorkCenterConfigModal({
  isOpen,
  onClose,
  configForm,
  setConfigForm,
  isSubmittingConfig,
  onDeleteCenter,
  onSaveConfig,
}: WorkCenterConfigModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      title="Work Center Capacity Configuration"
      headerActions={
        <Button
          size="sm"
          onClick={() =>
            setConfigForm((prev) => [
              ...prev,
              {
                id: "WC-" + Math.random().toString(36).substr(2, 9),
                name: "New Work Center",
                manpower_count: 1,
                hours_per_day: 8,
                days_per_week: 5,
                capacity_per_week: 40,
              },
            ])
          }
        >
          + Add Center
        </Button>
      }
      contentClassName="p-0 flex flex-col min-h-0"
      footer={
        <div className="flex flex-wrap justify-end gap-3 w-full">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSaveConfig} disabled={isSubmittingConfig}>
            {isSubmittingConfig ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      }
    >
      <div className="p-5 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {configForm.map((wc, idx) => (
            <div
              key={wc.id}
              className="p-4 border border-stone-200 rounded-xl space-y-4 bg-stone-50/50 relative group"
            >
              <button
                type="button"
                onClick={() => onDeleteCenter(wc, idx)}
                className="absolute top-3 right-3 text-stone-400 hover:text-red-500 bg-white hover:bg-red-50 border border-stone-200 p-1.5 rounded-lg transition-all"
                title="Delete Work Center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex justify-between items-center pr-10">
                <input
                  className="no-base-style font-bold text-stone-900 uppercase tracking-wider text-xs bg-transparent border-b border-transparent focus:border-stone-300 outline-none"
                  value={wc.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setConfigForm((prev) => {
                      const next = [...prev];
                      next[idx] = { ...wc, name: val };
                      return next;
                    });
                  }}
                />
                <div className="text-[10px] bg-stone-200 px-2 py-0.5 rounded font-bold">
                  {(
                    wc.manpower_count *
                    wc.hours_per_day *
                    wc.days_per_week
                  ).toFixed(1)}{" "}
                  Hrs/Week
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Manpower"
                  type="number"
                  min="1"
                  value={wc.manpower_count}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setConfigForm((prev) => {
                      const next = [...prev];
                      next[idx] = { ...wc, manpower_count: val };
                      return next;
                    });
                  }}
                />
                <Input
                  label="Hrs/Day"
                  type="number"
                  min="1"
                  max="24"
                  value={wc.hours_per_day}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setConfigForm((prev) => {
                      const next = [...prev];
                      next[idx] = { ...wc, hours_per_day: val };
                      return next;
                    });
                  }}
                />
                <Input
                  label="Days/Wk"
                  type="number"
                  min="1"
                  max="7"
                  value={wc.days_per_week}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setConfigForm((prev) => {
                      const next = [...prev];
                      next[idx] = { ...wc, days_per_week: val };
                      return next;
                    });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
});
