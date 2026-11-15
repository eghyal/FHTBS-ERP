import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Plus,
  X,
  ChevronRight,
  Package,
  AlertTriangle,
  ClipboardList,
  History,
  Bell,
  Calendar,
  Wrench,
  PackageCheck,
  CheckCircle2,
  Filter,
  Home,
  LayoutDashboard,
  GanttChartSquare,
  Info,
  Maximize2,
  Minimize2,
  Share2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Trash2,
  FolderKanban,
  Layers,
  Clock,
  RefreshCw,
  FileText,
  Landmark,
  BookOpen,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useInterval } from "@/hooks/useInterval";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useShare } from "@/contexts/ShareContext";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { HasRole } from "@/components/shared/HasRole";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMobileMonitoring } from "@/contexts/MonitoringContext";
import { MobileMonitorHub } from "@/components/mobile/MobileMonitorHub";
import {
  motion,
  AnimatePresence,
} from "motion/react";
import {
  OverviewArchiveSection,
  WorkCenterConfigModal,
  OverviewTeamStatusStrip,
  OverviewProjectMonitorGrid,
  OverviewActionRequiredPanel,
} from "@/components/erp/dashboard/OverviewSubComponents";


interface WorkCenter {
  id: string;
  name: string;
  manpower_count: number;
  hours_per_day: number;
  days_per_week: number;
  capacity_per_week: number;
  efficiency_index?: number;
  status?: "ACTIVE" | "MAINTENANCE" | "OFFLINE";
}

interface Task {
  id: string;
  project_id: string;
  task_name: string;
  work_center_id?: string;
  work_center_name?: string;
  required_hours?: number;
  start_date: string;
  end_date: string;
  actual_start_date?: string;
  actual_end_date?: string;
  progress: number;
  status: string;
  pr_id?: string;
}

interface Project {
  id: string;
  name: string;
  due_date: string;
  customer: string;
  remarks: string;
  status: string;
  urgency?: "NORMAL" | "URGENT" | "CRITICAL";
  bq_updated_at?: string;
  est_budget?: number;
  actual_cost?: number;
  created_at: string;
  archived_at?: string;
  is_master_set?: number | boolean;
  tasks: Task[];
}

interface PendingAction {
  type: string;
  title: string;
  description: string;
  link: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

interface Job {
  id: string;
  project: string;
  task: string;
  workCenterId: string;
  workCenterName: string;
  plannedWeek: number;
  requiredHours: number;
  materialStatus: "READY" | "PARTIAL" | "SHORTAGE";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
}

const getWeekNumber = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return weekNo;
};

export default function Overview() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [monitorData, setMonitorData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState<WorkCenter[]>([]);
  const [isSubmittingConfig, setIsSubmittingConfig] = useState(false);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [userStatuses, setUserStatuses] = useState<any[]>([]);
  const [serverTime, setServerTime] = useState<string>(
    new Date().toISOString(),
  );
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  const { language } = useLanguage();

  // Production State
  const [selectedCenterId, setSelectedCenterId] = useState<string>("");
  const weeks = useMemo(() => {
    const currentWeek = getWeekNumber(new Date());
    return [
      { num: currentWeek, label: "This Week", sub: `W${currentWeek}` },
      { num: currentWeek + 1, label: "Next Week", sub: `W${currentWeek + 1}` },
      { num: currentWeek + 2, label: "Week +2", sub: `W${currentWeek + 2}` },
      { num: currentWeek + 3, label: "Week +3", sub: `W${currentWeek + 3}` },
      { num: currentWeek + 4, label: "Week +4", sub: `W${currentWeek + 4}` },
    ];
  }, []);

  const [selectedWeek, setSelectedWeek] = useState<number>(weeks[0].num);

  // Gantt State
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );
  const [ganttFilter, setGanttFilter] = useState<"ALL" | "PROCUREMENT" | "MANUFACTURING">("ALL");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isFullscreenGantt, setIsFullscreenGantt] = useState(false);
  const [ganttZoom, setGanttZoom] = useState(100);
  const ganttContainerRef = React.useRef<HTMLDivElement>(null);

  const getFilteredProjectTasks = useCallback(
    (project: Project) => {
      const isMasterSet = Boolean(project.is_master_set);
      return (project.tasks || [])
        .filter((t: any) => !!t)
        .filter((t: any) => {
          const isPr = Boolean(
            t.pr_id || (t.task_name && t.task_name.includes("[Procurement]"))
          );
          if (!isMasterSet && !isPr) return false;
          if (ganttFilter === "PROCUREMENT") return isPr;
          if (ganttFilter === "MANUFACTURING") return !isPr;
          return true;
        });
    },
    [ganttFilter]
  );
  const [isDraggingGantt, setIsDraggingGantt] = useState(false);
  const [ganttStartX, setGanttStartX] = useState(0);
  const [ganttScrollLeft, setGanttScrollLeft] = useState(0);
  const [ganttStartY, setGanttStartY] = useState(0);
  const [ganttScrollTop, setGanttScrollTop] = useState(0);

  const handleScrollGantt = useCallback((direction: "LEFT" | "RIGHT" | "UP" | "DOWN") => {
    if (!ganttContainerRef.current) return;
    const scrollAmount = 180;
    if (direction === "LEFT") {
      ganttContainerRef.current.scrollLeft -= scrollAmount;
    } else if (direction === "RIGHT") {
      ganttContainerRef.current.scrollLeft += scrollAmount;
    } else if (direction === "UP") {
      ganttContainerRef.current.scrollTop -= scrollAmount;
    } else if (direction === "DOWN") {
      ganttContainerRef.current.scrollTop += scrollAmount;
    }
  }, []);

  const ganttHandlers = {
    onMouseDown: (e: React.MouseEvent) => {
      if (!ganttContainerRef.current) return;
      setIsDraggingGantt(true);
      setGanttStartX(e.pageX - ganttContainerRef.current.offsetLeft);
      setGanttScrollLeft(ganttContainerRef.current.scrollLeft);
      setGanttStartY(e.pageY - ganttContainerRef.current.offsetTop);
      setGanttScrollTop(ganttContainerRef.current.scrollTop);
    },
    onMouseLeave: () => {
      setIsDraggingGantt(false);
    },
    onMouseUp: () => {
      setIsDraggingGantt(false);
    },
    onMouseMove: (e: React.MouseEvent) => {
      if (!isDraggingGantt || !ganttContainerRef.current) return;
      e.preventDefault();
      const x = e.pageX - ganttContainerRef.current.offsetLeft;
      const walkX = (x - ganttStartX) * 2;
      ganttContainerRef.current.scrollLeft = ganttScrollLeft - walkX;

      const y = e.pageY - ganttContainerRef.current.offsetTop;
      const walkY = (y - ganttStartY) * 2;
      ganttContainerRef.current.scrollTop = ganttScrollTop - walkY;
    },
  };

  const { user } = useAuth();
  const { showToast } = useToast();
  const { shareToForum } = useShare();

  const canAccessFinance =
    hasGodMode(user) ||
    user?.role === "FC" ||
    user?.role === "FINANCE" ||
    user?.role === "DIRECTOR" ||
    user?.role === "BOD" ||
    user?.role === "ADMIN" ||
    user?.role === "SUPERADMIN" ||
    hasPermission(user, Action.VIEW_FINANCE) ||
    hasPermission(user, Action.POST_JOURNAL);

  // Confirm Modal States
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    action: () => {},
  });

  const handleCancelProject = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Cancel Project?",
      message:
        "Are you sure you want to cancel this project? This will archive it and release all pending resources.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/projects/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            showToast("Project cancelled successfully", "success");
            fetchData();
          } else {
            showToast(res.error || "Failed to cancel project", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error cancelling project", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const refreshUserStatuses = useCallback(async () => {
    setIsRefreshingStatus(true);
    try {
      const email = user?.username || "";
      const usersRes = await apiFetch(
        "/api/users/status",
        { method: "GET" },
        email,
      );
      if (usersRes.ok && usersRes.data) {
        setUserStatuses(
          Array.isArray(usersRes.data.users) ? usersRes.data.users : [],
        );
        if (usersRes.data.server_time) {
          setServerTime(usersRes.data.server_time);
        }
      }
    } catch (err) {
      console.error("Failed to refresh user statuses", err);
    } finally {
      setIsRefreshingStatus(false);
    }
  }, [user?.username]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const email = user?.username || "";

      // Execute in parallel for speed
      const [
        projectsRes,
        inventoryRes,
        actionsRes,
        ganttRes,
        analyticsRes,
        workCentersRes,
        archivedRes,
        monitorRes,
        usersRes,
      ] = await Promise.all([
        apiFetch("/api/projects", {}, email),
        apiFetch("/api/inventory/summary", {}, email),
        apiFetch("/api/dashboard/pending-actions", {}, email),
        apiFetch("/api/gantt", {}, email),
        apiFetch("/api/production/analytics", {}, email),
        apiFetch("/api/work-centers", {}, email),
        apiFetch("/api/projects?archived=true", {}, email),
        apiFetch("/api/dashboard/active-projects-monitor", {}, email),
        apiFetch("/api/users/status", {}, email),
      ]);

      // Handle server warmup global state
      if (projectsRes.isStarting) {
        showToast("System is warming up, please wait...", "info");
        setTimeout(fetchData, 3000);
        return;
      }

      setWorkCenters(
        Array.isArray(workCentersRes.data) ? workCentersRes.data : [],
      );
      if (
        Array.isArray(workCentersRes.data) &&
        workCentersRes.data.length > 0 &&
        !selectedCenterId
      ) {
        setSelectedCenterId(workCentersRes.data[0].id);
      }

      const isGeneral = (p: any) => {
        const idStr = String(p?.id || "").toUpperCase();
        const nameStr = String(p?.name || "").toLowerCase();
        const catStr = String(p?.project_category || p?.type || "").toUpperCase();
        return (
          ["GENERAL", "CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(idStr) ||
          nameStr.includes("general procurement") ||
          nameStr.includes("other procurement") ||
          nameStr.includes("others procurement") ||
          nameStr === "consumable" ||
          nameStr === "transportation" ||
          ["NON_PROJECT", "CONSUMABLE", "TRANSPORTATION", "OTHERS", "OTHER_PROCUREMENT", "GENERAL", "GENERAL_PROCUREMENT"].includes(catStr) ||
          String(p?.status || "").toUpperCase() === "INTERNAL_OVERHEAD"
        );
      };

      if (Array.isArray(ganttRes.data)) {
        setProjects(ganttRes.data.filter((p: any) => !isGeneral(p)));
      } else {
        setProjects([]);
      }

      setSummary(inventoryRes.data);
      setPendingActions(Array.isArray(actionsRes.data) ? actionsRes.data : []);
      setAnalytics(analyticsRes.data);
      setArchivedProjects(
        Array.isArray(archivedRes.data)
          ? archivedRes.data.filter((p: any) => !isGeneral(p))
          : [],
      );
      if (Array.isArray(monitorRes.data)) {
        setMonitorData(monitorRes.data.filter((p: any) => !isGeneral(p)));
      } else {
        setMonitorData([]);
      }
      if (usersRes.ok && usersRes.data) {
        setUserStatuses(
          Array.isArray(usersRes.data.users) ? usersRes.data.users : [],
        );
        if (usersRes.data.server_time) {
          setServerTime(usersRes.data.server_time);
        }
      }

      // Individual error check for critical data
      const isAccessDenied = (err: string | null) =>
        err?.includes("Access denied") ||
        err?.includes("Insufficient permissions");

      if (!projectsRes.ok && !isAccessDenied(projectsRes.error)) {
        console.error("Dashboard Projects Error:", projectsRes);
        showToast(projectsRes.error || "Failed to load projects", "error");
      }
      if (!usersRes.ok && !isAccessDenied(usersRes.error)) {
        console.error("Dashboard Users Status Error:", usersRes);
        showToast(usersRes.error || "Failed to fetch user's status", "error");
      }
      if (!inventoryRes.ok && !isAccessDenied(inventoryRes.error)) {
        console.error("Dashboard Inventory Error:", inventoryRes);
        showToast(
          inventoryRes.error || "Failed to load inventory summary",
          "error",
        );
      }
      if (!actionsRes.ok && !isAccessDenied(actionsRes.error)) {
        console.error("Dashboard Actions Error:", actionsRes);
        showToast(
          actionsRes.error || "Failed to load pending actions",
          "error",
        );
      }
    } catch (err) {
      console.error("Dashboard: Failed to fetch data", err);
      showToast(
        "System encountered an error while updating dashboard",
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedCenterId, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshUserStatuses]);

  useInterval(refreshUserStatuses, 20000);

  const handleCloseProject = (projectId: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Close Project?",
      message: `Are you sure you want to close project ${projectId}? This will release all allocated resources.`,
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/projects/${projectId}/close`,
            { method: "POST" },
            user?.username,
          );
          if (res.ok) {
            fetchData();
            showToast("Project closed successfully", "success");
          } else {
            showToast(res.error || "Failed to close project", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error closing project", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // --- Production Derived Data ---
  const capacityData = useMemo(() => {
    return weeks.map((w) => {
      const week = w.num;
      const data: any = { week: w.label, weekNum: week, sub: w.sub };
      workCenters.forEach((wc) => {
        const load = projects.reduce((acc, p) => {
          const taskLoad =
            (p.tasks || [])
              .filter((t: any) => !!t)
              .filter((t) => {
                if (t.work_center_id !== wc.id) return false;
                const taskWeek = getWeekNumber(new Date(t.start_date));
                return taskWeek === week;
              })
              .reduce((sum, t) => sum + (t.required_hours || 0), 0) || 0;
          return acc + taskLoad;
        }, 0);
        data[wc.name] = load;
        const isOperational = (wc.status || "ACTIVE") === "ACTIVE";
        data[`${wc.name}_cap`] = isOperational
          ? wc.capacity_per_week * (wc.efficiency_index || 1.0)
          : 0;
      });
      return data;
    });
  }, [projects, workCenters, weeks]);

  const jobs = useMemo(() => {
    const allJobs: Job[] = [];
    projects.forEach((p) => {
      (p.tasks || [])
        .filter((t: any) => !!t)
        .forEach((t) => {
          allJobs.push({
            id: t.id,
            project: p.name,
            task: t.task_name,
            workCenterId: t.work_center_id || "",
            workCenterName: t.work_center_name || "N/A",
            plannedWeek: getWeekNumber(new Date(t.start_date)),
            requiredHours: t.required_hours || 0,
            materialStatus: "READY",
            status: t.status as any,
          });
        });
    });
    return allJobs;
  }, [projects]);

  const selectedCenter = useMemo(
    () => workCenters.find((wc) => wc.id === selectedCenterId),
    [workCenters, selectedCenterId],
  );

  const activeJobs = useMemo(() => {
    if (!selectedWeek || !selectedCenterId) return [];
    return jobs.filter(
      (j) =>
        j.plannedWeek === selectedWeek && j.workCenterId === selectedCenterId,
    );
  }, [jobs, selectedWeek, selectedCenterId]);

  const currentLoad =
    capacityData.find((d) => d.weekNum === selectedWeek)?.[
      selectedCenter?.name || ""
    ] || 0;
  const maxCapacity = selectedCenter?.capacity_per_week || 0;
  const isOverloaded = currentLoad > maxCapacity;

  const moveJob = async (jobId: string, targetWeek: number) => {
    try {
      // Find the existing task to preserve duration
      let existingTask: any = null;
      for (const p of projects) {
        const found = p.tasks?.find((t) => t.id === jobId);
        if (found) {
          existingTask = found;
          break;
        }
      }

      // Calculate new start date based on week number
      const now = new Date();
      const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
      const days = (targetWeek - 1) * 7;
      const newStartDate = new Date(
        firstDayOfYear.getTime() + days * 24 * 60 * 60 * 1000,
      );

      let newEndDate = new Date(newStartDate);
      if (existingTask && existingTask.start_date && existingTask.end_date) {
        const oldStart = new Date(existingTask.start_date);
        const oldEnd = new Date(existingTask.end_date);
        const durationMs = Math.max(0, oldEnd.getTime() - oldStart.getTime());
        newEndDate.setTime(newStartDate.getTime() + durationMs);
      }

      const startStr = newStartDate.toISOString().split("T")[0];
      const endStr = newEndDate.toISOString().split("T")[0];

      const res = await apiFetch(
        `/api/tasks/${jobId}`,
        {
          method: "POST",
          body: JSON.stringify({ start_date: startStr, end_date: endStr }),
        },
        user?.username,
      );

      if (res.ok) {
        fetchData();
        showToast("Job moved successfully", "success");
      } else {
        showToast(res.error || "Failed to move job", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error moving job", "error");
    }
  };

  const updateJobHours = async (jobId: string, hours: number) => {
    try {
      const res = await apiFetch(
        `/api/tasks/${jobId}`,
        {
          method: "POST",
          body: JSON.stringify({ required_hours: hours }),
        },
        user?.username,
      );
      if (res.ok) {
        fetchData();
        showToast("Job hours updated", "success");
      } else {
        showToast(res.error || "Failed to update job hours", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating job hours", "error");
    }
  };

  // --- Gantt Chart Logic ---
  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) newSet.delete(projectId);
      else newSet.add(projectId);
      return newSet;
    });
  }, []);

  const ganttTimeline = useMemo(() => {
    const today = new Date();
    if (projects.length === 0) {
      const defaultStart = new Date(today);
      defaultStart.setDate(defaultStart.getDate() - 5);
      const defaultEnd = new Date(today);
      defaultEnd.setDate(defaultEnd.getDate() + 25);
      const days = [];
      let cur = new Date(defaultStart);
      for (let i = 0; i < 30; i++) {
        days.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      return { minDate: defaultStart, maxDate: defaultEnd, days };
    }

    let minDate = new Date(today);
    let maxDate = new Date(today);

    // Limit window bounds: at most 45 days in past and 90 days in future from today
    const earliestAllowed = new Date(today);
    earliestAllowed.setDate(earliestAllowed.getDate() - 45);
    const latestAllowed = new Date(today);
    latestAllowed.setDate(latestAllowed.getDate() + 90);

    projects.forEach((p) => {
      if (p.created_at) {
        const pStart = new Date(p.created_at);
        if (!isNaN(pStart.getTime()) && pStart >= earliestAllowed && pStart < minDate) {
          minDate = pStart;
        }
      }
      if (p.due_date) {
        const pEnd = new Date(p.due_date);
        if (!isNaN(pEnd.getTime()) && pEnd <= latestAllowed && pEnd > maxDate) {
          maxDate = pEnd;
        }
      }

      (p.tasks || [])
        .filter((t: any) => !!t)
        .forEach((t: any) => {
          if (t.start_date) {
            const tStart = new Date(t.start_date);
            if (!isNaN(tStart.getTime()) && tStart >= earliestAllowed && tStart < minDate) {
              minDate = tStart;
            }
          }
          if (t.end_date) {
            const tEnd = new Date(t.end_date);
            if (!isNaN(tEnd.getTime()) && tEnd <= latestAllowed && tEnd > maxDate) {
              maxDate = tEnd;
            }
          }
        });
    });

    // Add safe padding
    minDate.setDate(minDate.getDate() - 3);
    maxDate.setDate(maxDate.getDate() + 10);

    // Clamp strictly: minDate cannot be after maxDate, and max range is 90 days
    if (minDate > maxDate) {
      minDate = new Date(today);
      minDate.setDate(today.getDate() - 5);
      maxDate = new Date(today);
      maxDate.setDate(today.getDate() + 25);
    }

    const diffDays = Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > 90) {
      maxDate = new Date(minDate);
      maxDate.setDate(minDate.getDate() + 90);
    }

    const days: Date[] = [];
    let current = new Date(minDate);
    let loopGuard = 0;
    while (current <= maxDate && loopGuard < 100) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
      loopGuard++;
    }

    return { minDate, maxDate, days };
  }, [projects]);

  const DAY_WIDTH = Math.round(48 * (ganttZoom / 100)); // Dynamic zoom width

  const getPositionStyle = (startDateStr: string, endDateStr: string) => {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const totalDays = ganttTimeline.days.length;

    if (totalDays === 0) return { left: "0px", width: "0px" };

    const minTime = ganttTimeline.minDate.getTime();

    // Using EXACT start date offset in days
    let startOffsetDays = Math.round(
      (start.getTime() - minTime) / (1000 * 60 * 60 * 24),
    );
    let durationDays =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return {
      left: `${Math.max(0, startOffsetDays * DAY_WIDTH)}px`,
      width: `${Math.max(DAY_WIDTH, durationDays * DAY_WIDTH)}px`,
    };
  };

  const t = useMemo(() => {
    return {
      purchasedItems: "Purchased Items",
      stockReady: "Stock Availability",
      fulfillment: "Supply Fulfillment (PR to GRN)",
      productionTimeline: "Production Timeline",
      qtyReceived: "Qty Received",
      moreTasks: "More Tasks",
      noTasks: "No tasks created yet.",
      resolve: "Resolve",
      actionRequired: "Action Required",
      strategicControl: "Strategic Control Center",
    };
  }, []);

  const filteredActions = useMemo(() => {
    return pendingActions.filter((a) => {
      if (a.type === "ACCOUNT_APPROVAL") return hasGodMode(user);
      if (a.type === "PR_AUTH") return hasPermission(user, Action.AUTH_PR);
      if (a.type === "PR_AUTH_URGENT")
        return hasPermission(user, Action.AUTH_PR_URGENT);
      if (a.type === "DELIVERY_AUTH")
        return hasPermission(user, Action.AUTH_DELIVERY);
      if (a.type === "PO_RECEIPT")
        return hasPermission(user, Action.RECEIVE_PO) || hasPermission(user, Action.INSPECT_QC);
      if (a.type === "GRN_INTAKE")
        return hasPermission(user, Action.RECEIVE_PO) || hasPermission(user, Action.VIEW_WAREHOUSE);
      if (a.type === "LOW_STOCK")
        return hasPermission(user, Action.VIEW_LOW_STOCK);

      return false;
    });
  }, [pendingActions, user]);

  const actionRequiredCount = filteredActions.length;

  const sortedUserStatuses = useMemo(() => {
    const serverNow = new Date(serverTime);
    return [...userStatuses]
      .filter((u) => String(u.role || "").trim().toUpperCase() !== "OPERATOR")
      .map((u) => {
        const lastSeenStr = u.last_seen_at
          ? u.last_seen_at.includes("T")
            ? u.last_seen_at
            : u.last_seen_at.replace(" ", "T") + "Z"
          : null;
        const lastSeen = lastSeenStr ? new Date(lastSeenStr) : null;
        const diffMs =
          lastSeen && !isNaN(lastSeen.getTime())
            ? Math.abs(serverNow.getTime() - lastSeen.getTime())
            : Infinity;
        const isOnline = Boolean(lastSeen && diffMs < 300000);
        return {
          ...u,
          _isOnline: isOnline,
          _lastSeenMs:
            lastSeen && !isNaN(lastSeen.getTime()) ? lastSeen.getTime() : 0,
        };
      })
      .sort((a, b) => {
        if (a._isOnline !== b._isOnline) {
          return a._isOnline ? -1 : 1;
        }
        if (b._lastSeenMs !== a._lastSeenMs) {
          return b._lastSeenMs - a._lastSeenMs;
        }
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
  }, [userStatuses, serverTime]);


  const { isMobileReadOnly } = useMobileMonitoring();
  const [showFullOverviewOnMobile, setShowFullOverviewOnMobile] =
    useState(false);

  if (isMobileReadOnly && !showFullOverviewOnMobile) {
    return (
      <MobileMonitorHub
        onSwitchToFullOverview={() => setShowFullOverviewOnMobile(true)}
      />
    );
  }

  return (
    <>
      <div className="space-y-4 sm:space-y-6 md:space-y-8 pb-12 animate-in fade-in duration-500">
        {isMobileReadOnly && showFullOverviewOnMobile && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3 flex items-center justify-between gap-2 shadow-xs">
            <span className="text-xs font-bold text-emerald-900 truncate">
              Full Overview (Read-Only)
            </span>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => setShowFullOverviewOnMobile(false)}
            >
              ← Mobile Hub
            </Button>
          </div>
        )}
        <PageHeader
          title="Dashboard"
          subtitle={
            actionRequiredCount > 0
              ? `${actionRequiredCount} pending actions`
              : "Operations summary"
          }
          icon={<LayoutDashboard className="w-5 h-5" />}
          actions={
            <div className="flex items-center gap-1.5 sm:gap-2">
              {canAccessFinance && (
                <Link
                  to="/finance"
                  className="h-8 sm:h-8.5 px-2.5 sm:px-3 py-1.5 bg-white border border-stone-200/90 hover:border-stone-300 hover:bg-stone-50 rounded-lg text-[11px] font-bold tracking-wide text-stone-700 hover:text-stone-900 transition-all active:scale-[0.98] inline-flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  title="General Ledger"
                >
                  <Landmark className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>General Ledger</span>
                </Link>
              )}
              <button
                onClick={fetchData}
                className="h-8 w-8 sm:h-8.5 sm:w-8.5 p-1.5 bg-white border border-stone-200/90 hover:border-stone-300 hover:bg-stone-50 rounded-lg text-stone-600 hover:text-stone-900 transition-all active:scale-[0.98] inline-flex items-center justify-center shadow-2xs cursor-pointer"
                title="Refresh Data"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>
          }
        />

        <div className="space-y-4 sm:space-y-6 md:space-y-8">
          {/* User's Status - Compact Widget */}
          <OverviewTeamStatusStrip
            sortedUsers={sortedUserStatuses}
            isRefreshingStatus={isRefreshingStatus}
            onRefresh={refreshUserStatuses}
          />

          {/* Active Projects Monitor Widget */}
          <HasRole
            allowedRoles={["MANAGER", "FC", "ENGINEERING", "PPIC", "QA_QC", "PRODUCTION"]}
          >
            <OverviewProjectMonitorGrid
              monitorData={monitorData}
              user={user}
              t={t}
              onCancelProject={handleCancelProject}
            />
          </HasRole>


          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
            {/* Timeline Column (Span 2) */}
            <div className="lg:col-span-2 space-y-3 sm:space-y-4">
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest flex items-center justify-between">
                <span>Production Pipeline</span>
                <Button
                  variant="secondary"
                  size="icon-xs"
                  onClick={() => setIsFullscreenGantt(!isFullscreenGantt)}
                >
                  <Maximize2 className="w-3.5 h-3.5 text-stone-400" />
                </Button>
              </div>

              <div
                className={cn(
                  "border border-stone-200/70 rounded-xl sm:rounded-2xl bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all duration-500 flex flex-col",
                  isFullscreenGantt
                    ? "fixed inset-3 sm:inset-8 z-[60] shadow-[0_30px_100px_rgba(0,0,0,0.15)] border-stone-200"
                    : "h-[440px] sm:h-[560px] relative overflow-hidden hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)]",
                )}
              >
                {isFullscreenGantt && (
                  <div className="p-3.5 sm:p-5 border-b border-stone-100 flex flex-col lg:flex-row gap-3 justify-between items-center bg-white shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="text-xs sm:text-sm font-bold tracking-widest uppercase text-stone-900">
                        Master Gantt Timeline
                      </h3>
                    </div>

                    {/* Excel-style Zoom Controller */}
                    <div className="flex items-center gap-2 bg-stone-50 border border-stone-200/80 p-1.5 rounded-xl">
                      <span className="text-[9px] font-bold uppercase text-stone-400 tracking-wider">
                        ZOOM:
                      </span>
                      <button
                        onClick={() =>
                          setGanttZoom((prev) => Math.max(50, prev - 25))
                        }
                        disabled={ganttZoom <= 50}
                        className="w-6.5 h-6.5 flex items-center justify-center bg-white hover:bg-stone-100 border border-stone-200 rounded-md text-xs font-bold text-stone-700 transition disabled:opacity-40"
                        title="Zoom Out"
                      >
                        -
                      </button>
                      <input
                        type="range"
                        min="50"
                        max="200"
                        step="25"
                        value={ganttZoom}
                        onChange={(e) => setGanttZoom(parseInt(e.target.value))}
                        className="w-16 sm:w-20 accent-stone-900 cursor-pointer h-1.5"
                      />
                      <button
                        onClick={() =>
                          setGanttZoom((prev) => Math.min(200, prev + 25))
                        }
                        disabled={ganttZoom >= 200}
                        className="w-6.5 h-6.5 flex items-center justify-center bg-white hover:bg-stone-100 border border-stone-200 rounded-md text-xs font-bold text-stone-700 transition disabled:opacity-40"
                        title="Zoom In"
                      >
                        +
                      </button>
                      <span className="text-[10px] font-mono font-bold text-stone-600 bg-white border border-stone-200 px-1.5 py-0.5 rounded-md min-w-[42px] text-center">
                        {ganttZoom}%
                      </span>
                      <button
                        onClick={() => setGanttZoom(100)}
                        className="px-2 py-0.5 bg-white hover:bg-stone-100 border border-stone-200 rounded-md text-[8px] font-bold uppercase tracking-wider text-stone-500 transition"
                      >
                        Reset
                      </button>
                    </div>

                    <button
                      onClick={() => setIsFullscreenGantt(false)}
                      className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors shrink-0"
                    >
                      <X className="w-4 h-4 text-stone-400" />
                    </button>
                  </div>
                )}

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  {/* Legends & Filter */}
                  <div className="p-2.5 sm:p-3 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2.5 bg-stone-50/30">
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      {[
                        { label: "PR Procurement", color: "bg-amber-600" },
                        { label: "BOP Process", color: "bg-stone-700" },
                        { label: "Completed", color: "bg-emerald-600" },
                        { label: "Alert / QC Rejected", color: "bg-rose-600" },
                      ].map((l) => (
                        <div
                          key={l.label}
                          className="flex items-center gap-1.5 grayscale-[0.2]"
                        >
                          <div className={cn("w-2 h-2 rounded-full", l.color)} />
                          <span className="text-[8.5px] sm:text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                            {l.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
                      {(["ALL", "PROCUREMENT", "MANUFACTURING"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setGanttFilter(mode)}
                          className={cn(
                            "px-2 py-1 text-[8.5px] sm:text-[9px] font-bold uppercase rounded-md transition-all cursor-pointer",
                            ganttFilter === mode
                              ? "bg-white text-stone-900 shadow-2xs"
                              : "text-stone-500 hover:text-stone-900"
                          )}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-1 overflow-hidden">
                    {/* Left: Project Names */}
                    <div className="w-32 sm:w-44 md:w-56 border-r border-stone-100 flex flex-col bg-white shrink-0">
                      <div
                        className={cn(
                          "h-10 border-b border-stone-100 bg-stone-50/50 flex items-center px-2.5 sm:px-4 text-[8.5px] sm:text-[9px] font-semibold text-stone-400 uppercase tracking-wider sticky top-0 z-20 truncate",
                        )}
                      >
                        Active Workloads
                      </div>
                      <div
                        className={cn(
                          "flex-1 py-2",
                          isFullscreenGantt
                            ? "overflow-y-auto custom-scrollbar"
                            : "overflow-hidden",
                        )}
                      >
                        {projects.map((project) => {
                          const visibleTasks = getFilteredProjectTasks(project);
                          const isMasterSet = Boolean(project.is_master_set);
                          const showPendingMfgNotice =
                            !isMasterSet && ganttFilter !== "PROCUREMENT";

                          return (
                            <div key={project.id} className="group">
                              <div
                                className={cn(
                                  "px-4 py-2 flex items-center justify-between hover:bg-stone-50 cursor-pointer transition-colors h-[35px]",
                                  expandedProjects.has(project.id) &&
                                    "bg-stone-50/60",
                                )}
                                onClick={() => toggleProject(project.id)}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <ChevronRight
                                    className={cn(
                                      "w-3 h-3 text-stone-400 transition-transform shrink-0",
                                      expandedProjects.has(project.id) &&
                                        "rotate-90 text-stone-900",
                                    )}
                                  />
                                  <div className="truncate">
                                    <div className="text-[10px] font-semibold text-stone-900 truncate uppercase tracking-tight">
                                      {project.name}
                                    </div>
                                    <div className="text-[8px] text-stone-400 font-bold uppercase tracking-widest leading-none mt-0.5 flex items-center gap-1.5">
                                      <span>{project.id}</span>
                                      {!isMasterSet && (
                                        <>
                                          <span>·</span>
                                          <span className="text-amber-600">Pending Setup</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {expandedProjects.has(project.id) && (
                                <div className="bg-stone-50/20 py-1">
                                  {showPendingMfgNotice && (
                                    <div className="pl-9 pr-3 h-[27px] text-[9px] flex items-center text-amber-700 font-semibold truncate">
                                      Mfg pending Setup &amp; Master
                                    </div>
                                  )}
                                  {visibleTasks.map((task) => (
                                    <div
                                      key={task.id}
                                      className={cn(
                                        "pl-9 pr-3 h-[27px] text-[10px] flex justify-between items-center hover:bg-stone-100 cursor-pointer transition-colors",
                                        selectedTask?.id === task.id &&
                                          "bg-stone-100 border-r-2 border-stone-900",
                                      )}
                                      onClick={() => setSelectedTask(task)}
                                    >
                                      <span className="truncate text-stone-600 font-bold uppercase tracking-tighter">
                                        {task.task_name}
                                      </span>
                                      <span className="text-[8px] font-semibold text-stone-400">
                                        {task.progress}%
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right: Timeline Visualization */}
                    <div
                      ref={ganttContainerRef}
                      className={cn(
                        "gantt-timeline-canvas flex-1 flex flex-col relative bg-stone-50/40",
                        isFullscreenGantt
                          ? "overflow-auto custom-scrollbar"
                          : "overflow-hidden",
                        isDraggingGantt ? "cursor-grabbing" : "cursor-grab",
                      )}
                      {...ganttHandlers}
                    >
                      {(() => {
                        const ganttMonths: {
                          month: string;
                          year: string;
                          days: number;
                        }[] = [];
                        ganttTimeline.days.forEach((day) => {
                          const month = day.toLocaleDateString("en-US", {
                            timeZone: "Asia/Jakarta",
                            month: "long",
                          });
                          const year = day.toLocaleDateString("en-US", {
                            timeZone: "Asia/Jakarta",
                            year: "numeric",
                          });
                          const last = ganttMonths[ganttMonths.length - 1];
                          if (
                            last &&
                            last.month === month &&
                            last.year === year
                          ) {
                            last.days++;
                          } else {
                            ganttMonths.push({ month, year, days: 1 });
                          }
                        });
                        return (
                          <div className="gantt-timeline-header flex flex-col border-b border-stone-200 bg-stone-100 shrink-0 min-w-max sticky top-0 z-20">
                            <div className="flex border-b border-stone-200">
                              {ganttMonths.map((m, i) => (
                                <div
                                  key={i}
                                  className="py-1.5 text-center border-r border-stone-200 flex items-center justify-center bg-stone-100"
                                  style={{ width: `${m.days * DAY_WIDTH}px` }}
                                >
                                  <span className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                                    {m.month} {m.year}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center">
                              {ganttTimeline.days.map((day, i) => {
                                const isToday =
                                  day.toDateString() ===
                                  new Date().toDateString();
                                return (
                                  <div
                                    key={i}
                                    style={{ width: `${DAY_WIDTH}px` }}
                                    className={`shrink-0 border-r border-stone-200 p-2 text-center flex flex-col justify-center h-10 ${isToday ? "bg-stone-200/80" : "bg-stone-50"}`}
                                  >
                                    <span
                                      className={`text-[8px] uppercase tracking-widest ${isToday ? "text-stone-900 font-bold" : "text-stone-400 font-semibold"}`}
                                    >
                                      {day.toLocaleDateString("en-US", {
                                        timeZone: "Asia/Jakarta",
                                        weekday: "short",
                                      })}
                                    </span>
                                    <span
                                      className={`text-[10px] font-semibold ${isToday ? "text-stone-950 font-bold" : "text-stone-700"}`}
                                    >
                                      {day.getDate()}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex-1 relative min-w-max py-2 flex">
                        {ganttTimeline.days.map((day, i) => {
                          const isToday =
                            day.toDateString() === new Date().toDateString();
                          return (
                            <div
                              key={i}
                              style={{ width: `${DAY_WIDTH}px` }}
                              className={`shrink-0 border-r border-stone-200/60 h-full pointer-events-none ${isToday ? "bg-stone-200/25" : ""}`}
                            />
                          );
                        })}

                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-stone-400/40 pointer-events-none z-0"
                          style={{
                            left: getPositionStyle(
                              new Date().toISOString(),
                              new Date().toISOString(),
                            ).left,
                          }}
                        />

                        <div className="absolute top-0 left-0 right-0">
                          {projects.map((project, pIndex) => {
                            const pHeight = 35; // height of project row in list
                            const tHeight = 27; // height of task row in list

                            let yOffset = 0;
                            for (let i = 0; i < pIndex; i++) {
                              yOffset += pHeight;
                              if (expandedProjects.has(projects[i].id)) {
                                const prevVisible = getFilteredProjectTasks(projects[i]);
                                const prevPendingNotice =
                                  !Boolean(projects[i].is_master_set) &&
                                  ganttFilter !== "PROCUREMENT"
                                    ? 1
                                    : 0;
                                yOffset += (prevVisible.length + prevPendingNotice) * tHeight;
                                yOffset += 8; // group padding
                              }
                            }

                            const visibleTasks = getFilteredProjectTasks(project);
                            const pendingNoticeOffset =
                              !Boolean(project.is_master_set) &&
                              ganttFilter !== "PROCUREMENT"
                                ? tHeight
                                : 0;

                            return (
                              <React.Fragment key={project.id}>
                                <div
                                  className="absolute bg-stone-200/40 hover:bg-stone-200/60 transition-all cursor-pointer group/project border-r border-stone-900/20"
                                  style={{
                                    ...getPositionStyle(
                                      project.created_at,
                                      project.due_date,
                                    ),
                                    top: `${yOffset}px`,
                                    height: `${pHeight}px`,
                                  }}
                                  onClick={() => toggleProject(project.id)}
                                >
                                  <div className="absolute top-1 left-1 text-[9px] font-bold text-stone-950 opacity-0 group-hover/project:opacity-100 transition-opacity uppercase tracking-widest whitespace-nowrap bg-white/80 px-1 rounded shadow-sm z-10">
                                    {project.name}
                                  </div>
                                </div>

                                {expandedProjects.has(project.id) &&
                                  visibleTasks.map((task: any, tIndex: number) => (
                                    <div
                                      key={task.id}
                                      className={cn(
                                        "absolute transition-all cursor-pointer border-r border-b group/task opacity-80 hover:opacity-100 overflow-hidden rounded-xs shadow-2xs",
                                        Boolean(task.pr_id || (task.task_name && task.task_name.includes("[Procurement]")))
                                          ? (task.status === "COMPLETED"
                                              ? "bg-emerald-600 border-emerald-700 text-white"
                                              : task.status === "REJECTED"
                                                ? "bg-rose-600 border-rose-700 text-white animate-pulse"
                                                : task.status === "IN_PROGRESS" || task.status === "RUNNING"
                                                  ? "bg-amber-500 border-amber-600 text-stone-900"
                                                  : "bg-amber-600 border-amber-700 text-white")
                                          : (task.status === "COMPLETED"
                                              ? "bg-emerald-600 border-emerald-700 text-white"
                                              : task.status === "RUNNING" || task.status === "IN_PROGRESS"
                                                ? "bg-stone-700 border-stone-800 text-white"
                                                : task.status === "PAUSED"
                                                  ? "bg-amber-500 border-amber-600 text-stone-900 animate-pulse"
                                                  : "bg-stone-400 border-stone-500 text-white"),
                                      )}
                                      style={{
                                        ...getPositionStyle(
                                          task.start_date,
                                          task.end_date,
                                        ),
                                        top: `${yOffset + pHeight + pendingNoticeOffset + tIndex * tHeight}px`,
                                        height: `${tHeight}px`,
                                      }}
                                      onClick={() => setSelectedTask(task)}
                                    >
                                      <div
                                        className="h-full bg-white/30 transition-all border-r border-white/50"
                                        style={{ width: `${task.progress}%` }}
                                      />
                                      <div className="absolute top-1 left-1 text-[8px] font-bold text-stone-800 opacity-0 group-hover/task:opacity-100 transition-opacity uppercase whitespace-nowrap bg-white/90 px-1 rounded shadow-sm border border-stone-100 z-10">
                                        {task.task_name}
                                      </div>
                                    </div>
                                  ))}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Required Window (Span 1) */}
            <OverviewActionRequiredPanel
              actionRequiredCount={actionRequiredCount}
              filteredActions={filteredActions}
              resolveLabel={t.resolve}
            />
          </div>
        </div>
      </div>


      {/* Library & Archive */}
      <OverviewArchiveSection archivedProjects={archivedProjects} user={user} />

      {/* Capacity Config Modal */}
      <WorkCenterConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        configForm={configForm}
        setConfigForm={setConfigForm}
        isSubmittingConfig={isSubmittingConfig}
        onDeleteCenter={(wc, idx) => {
          setConfirmModal({
            isOpen: true,
            title: "Delete Work Center?",
            message: `Are you sure you want to delete ${wc.name}?`,
            action: async () => {
              if (!wc.id.startsWith("WC-") && !wc.id.startsWith("NEW-")) {
                try {
                  const response = await apiFetch(
                    `/api/work-centers/${wc.id}`,
                    { method: "DELETE" },
                    user?.username,
                  );
                  if (!response.ok) {
                    showToast(
                      response.error || "Failed to delete work center",
                      "error",
                    );
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                    return;
                  }
                } catch {
                  showToast("Network error while deleting", "error");
                  setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                  return;
                }
              }
              setConfigForm((prev) => prev.filter((_, i) => i !== idx));
              setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            },
          });
        }}
        onSaveConfig={async () => {
          setIsSubmittingConfig(true);
          try {
            let allOk = true;
            for (const wc of configForm) {
              const response = await apiFetch(
                "/api/work-centers",
                {
                  method: "POST",
                  body: JSON.stringify(wc),
                },
                user?.username,
              );
              if (!response.ok) allOk = false;
            }
            if (allOk) {
              await fetchData();
              setShowConfigModal(false);
              showToast("Configuration saved successfully", "success");
            } else {
              showToast("Failed to save configuration", "error");
            }
          } catch (err) {
            console.error(err);
            showToast("Error saving configuration", "error");
          } finally {
            setIsSubmittingConfig(false);
          }
        }}
      />

      {/* ConfirmModal rendering outside other modals */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}
