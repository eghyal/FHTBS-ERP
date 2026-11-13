import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { scheduleWhenIdle } from "@/utils/smartCache";
import { Loader } from "@/components/shared/Loader";
import {
  PieChart,
  Users,
  Clock,
  CalendarDays,
  DollarSign,
  Briefcase,
  UserCheck,
  Award,
  Repeat,
  Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  HrIsometricHero,
  type HrTabMeta,
  type HrHeroTelemetry,
} from "@/components/hris/IsometricHero";
import {
  HR_TAB_CONFIG as TAB_CONFIG,
  HR_TAB_REQUIRED_KEYS as TAB_REQUIRED_KEYS,
  ALL_HR_DATA_KEYS,
} from "@/components/hris/hrisTypes";

// Lazy-Loaded Modular HRIS Tab Components for Mobile & Desktop Bundle Splitting
const HrDashboardTab = React.lazy(() =>
  import("@/components/hris/tabs/Dashboard").then((m) => ({
    default: m.HrDashboardTab,
  }))
);
const HrDirectoryTab = React.lazy(() =>
  import("@/components/hris/tabs/Directory").then((m) => ({
    default: m.HrDirectoryTab,
  }))
);
const HrAttendanceTab = React.lazy(() =>
  import("@/components/hris/tabs/Attendance").then((m) => ({
    default: m.HrAttendanceTab,
  }))
);
const HrLeaveTab = React.lazy(() =>
  import("@/components/hris/tabs/Leave").then((m) => ({
    default: m.HrLeaveTab,
  }))
);
const HrPayrollTab = React.lazy(() =>
  import("@/components/hris/tabs/Payroll").then((m) => ({
    default: m.HrPayrollTab,
  }))
);
const HrVacanciesTab = React.lazy(() =>
  import("@/components/hris/tabs/Vacancies").then((m) => ({
    default: m.HrVacanciesTab,
  }))
);
const HrCandidatesTab = React.lazy(() =>
  import("@/components/hris/tabs/Candidates").then((m) => ({
    default: m.HrCandidatesTab,
  }))
);
const HrKpiTab = React.lazy(() =>
  import("@/components/hris/tabs/Kpi").then((m) => ({
    default: m.HrKpiTab,
  }))
);
const HrHandoverTab = React.lazy(() =>
  import("@/components/hris/tabs/Handover").then((m) => ({
    default: m.HrHandoverTab,
  }))
);
const HrSettingsTab = React.lazy(() =>
  import("@/components/hris/tabs/Settings").then((m) => ({
    default: m.HrSettingsTab,
  }))
);

// Shared PRq Modals
import { PayrollRequisitionModal } from "@/components/hris/modals/RequisitionModal";
import { PrqViewModal } from "@/components/hris/modals/PrqViewModal";
import { PrqConfirmModal } from "@/components/hris/modals/PrqConfirmModal";

export default function HumanResource() {
  const { user, dailyAuthKey } = useAuth() as any;
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get("tab") || "dashboard";
    return TAB_CONFIG[t] ? t : "dashboard";
  }, [location.search]);

  const handleNavigateTab = useCallback(
    (tabId: string) => {
      navigate(`/hr?tab=${tabId}`);
    },
    [navigate]
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncingIntegrity, setIsSyncingIntegrity] = useState(false);
  const hasInitializedRef = useRef(false);

  // Core HRIS State
  const [users, setUsers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [handovers, setHandovers] = useState<any[]>([]);
  const [attendances, setAttendances] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [salaries, setSalaries] = useState<any[]>([]);
  const [payrollRequisitions, setPayrollRequisitions] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [cmsData, setCmsData] = useState<any>({});

  // Payroll Requisition (PRq) Modal State
  const [prqMonth, setPrqMonth] = useState<number>(
    () => new Date().getMonth() + 1
  );
  const [prqYear, setPrqYear] = useState<number>(() =>
    new Date().getFullYear()
  );
  const [isPrqModalOpen, setIsPrqModalOpen] = useState(false);
  const [isPreparingPrq, setIsPreparingPrq] = useState(false);
  const [isSavingPrq, setIsSavingPrq] = useState(false);
  const [prqEditingId, setPrqEditingId] = useState<string | null>(null);
  const [prqDetails, setPrqDetails] = useState<any[]>([]);
  const [prqNotes, setPrqNotes] = useState("");
  const [selectedPrqView, setSelectedPrqView] = useState<any | null>(null);
  const [isPrqViewOpen, setIsPrqViewOpen] = useState(false);

  const [prqConfirmModal, setPrqConfirmModal] = useState<any>({
    isOpen: false,
    type: "",
    title: "",
    message: "",
    reasonInput: "",
    authPin: "",
    data: null,
  });

  const fetchHrDataByKeys = useCallback(
    async (keys: string[], skipCache = false) => {
      const username = user?.username;
      const tasks: Promise<void>[] = [];
      const opts = skipCache ? { skipCache: true } : {};

      if (keys.includes("users")) {
        tasks.push(
          apiFetch("/api/users", opts, username).then((res) => {
            if (res.ok) setUsers(Array.isArray(res.data) ? res.data : []);
          })
        );
      }
      if (keys.includes("jobs")) {
        tasks.push(
          apiFetch("/api/hr/jobs", opts, username).then((res) => {
            if (res.ok) setJobs(Array.isArray(res.data) ? res.data : []);
          })
        );
      }
      if (keys.includes("applications")) {
        tasks.push(
          apiFetch("/api/hr/applications", opts, username).then((res) => {
            if (res.ok)
              setApplications(Array.isArray(res.data) ? res.data : []);
          })
        );
      }
      if (keys.includes("kpis")) {
        tasks.push(
          apiFetch("/api/hr/kpis", opts, username).then((res) => {
            if (res.ok) setKpis(Array.isArray(res.data) ? res.data : []);
          })
        );
      }
      if (keys.includes("handovers")) {
        tasks.push(
          apiFetch("/api/hr/handovers", opts, username).then((res) => {
            if (res.ok) setHandovers(Array.isArray(res.data) ? res.data : []);
          })
        );
      }
      if (keys.includes("attendances")) {
        tasks.push(
          apiFetch("/api/hr/attendances", opts, username).then((res) => {
            if (res.ok) setAttendances(Array.isArray(res.data) ? res.data : []);
          })
        );
      }
      if (keys.includes("leaves")) {
        tasks.push(
          apiFetch("/api/hr/leaves", opts, username).then((res) => {
            if (res.ok) setLeaves(Array.isArray(res.data) ? res.data : []);
          })
        );
      }
      if (keys.includes("payslips")) {
        tasks.push(
          apiFetch("/api/hr/payslips", opts, username).then((res) => {
            if (res.ok) setPayslips(Array.isArray(res.data) ? res.data : []);
          })
        );
      }
      if (keys.includes("salaries")) {
        tasks.push(
          apiFetch("/api/hr/salaries", opts, username).then((res) => {
            if (res.ok) setSalaries(Array.isArray(res.data) ? res.data : []);
          })
        );
      }
      if (keys.includes("payrollRequisitions")) {
        tasks.push(
          apiFetch("/api/hr/payroll-requisitions", opts, username).then(
            (res) => {
              if (res.ok)
                setPayrollRequisitions(Array.isArray(res.data) ? res.data : []);
            }
          )
        );
      }
      if (keys.includes("projects")) {
        tasks.push(
          apiFetch("/api/projects", opts, username).then((res) => {
            if (res.ok) setProjects(Array.isArray(res.data) ? res.data : []);
          })
        );
      }
      if (keys.includes("cmsData")) {
        tasks.push(
          apiFetch("/api/cms/careers", opts, username).then((res) => {
            if (res.ok && res.data) setCmsData(res.data);
          })
        );
      }

      await Promise.all(tasks);
    },
    [user?.username]
  );

  const fetchAllHrData = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);

      const primaryKeys = TAB_REQUIRED_KEYS[activeTab] || ALL_HR_DATA_KEYS;
      const secondaryKeys = ALL_HR_DATA_KEYS.filter(
        (k) => !primaryKeys.includes(k)
      );

      try {
        await fetchHrDataByKeys(primaryKeys, silent);
      } catch (err) {
        console.error("Failed to fetch HRIS data:", err);
        showToast("Failed to synchronize HRIS data", "error");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }

      if (secondaryKeys.length > 0) {
        scheduleWhenIdle(() => {
          fetchHrDataByKeys(secondaryKeys, false).catch(() => {});
        }, 1200);
      }
    },
    [activeTab, fetchHrDataByKeys, showToast]
  );

  const handleSilentRefresh = useCallback(() => {
    fetchAllHrData(true);
  }, [fetchAllHrData]);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      fetchAllHrData(false);
      return;
    }
    const primaryKeys = TAB_REQUIRED_KEYS[activeTab] || [];
    fetchHrDataByKeys(primaryKeys, false)
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
      });
  }, [activeTab, fetchAllHrData, fetchHrDataByKeys]);

  // Salary Master Save Handler
  const handleSaveSalary = useCallback(
    async (
      employee_username: string,
      basic_salary: number,
      allowances: number,
      deductions: number
    ) => {
      const res = await apiFetch(
        "/api/hr/salaries",
        {
          method: "POST",
          body: JSON.stringify({
            employee_username,
            basic_salary,
            allowances,
            deductions,
          }),
        },
        user?.username
      );
      if (res.ok) {
        showToast(
          `Saved master compensation for @${employee_username}`,
          "success"
        );
        fetchAllHrData(true);
      } else {
        showToast(res.error || "Failed to save salary configuration", "error");
      }
    },
    [user?.username, showToast, fetchAllHrData]
  );

  // Ad-hoc Payslip Issuance Handler
  const handleGenerateAdhocPayslip = useCallback(
    async (
      employee_username: string,
      period_month: string,
      basic_salary: number,
      allowances: number,
      deductions: number
    ) => {
      const res = await apiFetch(
        "/api/hr/payslips",
        {
          method: "POST",
          body: JSON.stringify({
            employee_username,
            period_month,
            basic_salary,
            allowances,
            deductions,
          }),
        },
        user?.username
      );
      if (res.ok) {
        showToast(
          `Official payslip published for @${employee_username}`,
          "success"
        );
        fetchAllHrData(true);
      } else {
        showToast(res.error || "Failed to publish payslip", "error");
      }
    },
    [user?.username, showToast, fetchAllHrData]
  );

  // PRq Preparation & Editing Handlers
  const handleOpenPreparePrq = useCallback(async () => {
    setPrqEditingId(null);
    setPrqNotes("");
    setIsPrqModalOpen(true);
    setIsPreparingPrq(true);
    try {
      const res = await apiFetch(
        "/api/hr/payroll-requisitions/prepare",
        {
          method: "POST",
          body: JSON.stringify({ month: prqMonth, year: prqYear }),
        },
        user?.username
      );
      if (res.ok && res.data) {
        const payload = res.data as any;
        setPrqDetails(Array.isArray(payload.details) ? payload.details : []);
      } else {
        showToast(res.error || "Failed to prepare PRq matrix", "error");
      }
    } catch {
      showToast("Error preparing PRq matrix", "error");
    } finally {
      setIsPreparingPrq(false);
    }
  }, [prqMonth, prqYear, user?.username, showToast]);

  const handleEditDraftPrq = useCallback(
    async (prq: any) => {
      setPrqEditingId(prq.id);
      setPrqMonth(Number(prq.period_month) || new Date().getMonth() + 1);
      setPrqYear(Number(prq.period_year) || new Date().getFullYear());
      setPrqNotes(prq.notes || "");
      setIsPrqModalOpen(true);

      if (Array.isArray(prq.details)) {
        setPrqDetails(prq.details);
      } else if (prq.details_json) {
        try {
          setPrqDetails(JSON.parse(prq.details_json));
        } catch {
          setPrqDetails([]);
        }
      } else {
        const res = await apiFetch(
          `/api/hr/payroll-requisitions/${prq.id}`,
          {},
          user?.username
        );
        if (res.ok && res.data) {
          setPrqDetails((res.data as any).details || []);
        }
      }
    },
    [user?.username]
  );

  const handleViewPrqDetails = useCallback(
    async (prq: any) => {
      try {
        const res = await apiFetch(
          `/api/hr/payroll-requisitions/${prq.id}`,
          {},
          user?.username
        );
        if (res.ok && res.data) {
          const d = res.data as any;
          setSelectedPrqView({
            ...d,
            requisition_no: d.requisition_number || d.requisition_no || d.id,
            prepared_by: d.submitted_by || d.prepared_by || "HR",
            total_net_pay: d.total_net ?? d.total_net_pay ?? 0,
          });
          setIsPrqViewOpen(true);
        }
      } catch {
        showToast("Failed to load PRq details", "error");
      }
    },
    [user?.username, showToast]
  );

  const handleUpdatePrqItem = useCallback(
    (idx: number, field: string, val: number) => {
      setPrqDetails((prev) => {
        const copy = [...prev];
        if (!copy[idx]) return prev;
        const item = { ...copy[idx], [field]: Number(val) || 0 };

        const basic = Number(item.basic_salary || 0);
        const posAllow = Number(item.position_allowance || 0);
        const kpiBonus = Number(item.kpi_bonus || 0);
        const otPay = Number(item.overtime_pay || 0);
        const travelAllow = Number(item.travel_allowance || 0);
        const reimburse = Number(item.reimbursement_amount || 0);
        const gross =
          basic + posAllow + kpiBonus + otPay + travelAllow + reimburse;

        const absDed = Number(item.absence_deduction || 0);
        const bpjsDed = Number(item.bpjs_deduction || 0);
        const pph21Ded = Number(item.pph21_deduction || 0);
        const otherDed = Number(item.other_deductions || 0);
        const totalDed = absDed + bpjsDed + pph21Ded + otherDed;
        const net = Math.max(0, gross - totalDed);

        copy[idx] = {
          ...item,
          gross_pay: gross,
          total_deductions: totalDed,
          net_pay: net,
        };
        return copy;
      });
    },
    []
  );

  const handleRequestSubmitPrq = useCallback(() => {
    setPrqConfirmModal({
      isOpen: true,
      type: "SUBMIT_PRQ",
      title: "Submit Payroll Requisition (PRq) to Finance",
      message:
        "This action locks and forwards the monthly HR Payroll Requisition to the Finance Division for Disbursement Order (PDV) conversion and General Ledger posting.",
      authPin: "123456",
      data: null,
    });
  }, []);

  const handleSavePayrollRequisition = useCallback(
    async (submitToFinance: boolean) => {
      setIsSavingPrq(true);
      try {
        const endpoint = prqEditingId
          ? `/api/hr/payroll-requisitions/${prqEditingId}`
          : "/api/hr/payroll-requisitions";
        const method = prqEditingId ? "PUT" : "POST";

        const res = await apiFetch(
          endpoint,
          {
            method,
            body: JSON.stringify({
              period_month: prqMonth,
              period_year: prqYear,
              notes: prqNotes,
              details: prqDetails,
              submit: submitToFinance,
              pin: submitToFinance
                ? prqConfirmModal.authPin || "123456"
                : undefined,
            }),
          },
          user?.username
        );

        if (res.ok) {
          showToast(
            submitToFinance
              ? "Payroll Requisition (PRq) submitted to Finance!"
              : "Payroll Requisition saved as Draft",
            "success"
          );
          setPrqConfirmModal((prev: any) => ({ ...prev, isOpen: false }));
          setIsPrqModalOpen(false);
          fetchAllHrData(true);
        } else {
          showToast(
            res.error || "Failed to save Payroll Requisition",
            "error"
          );
        }
      } catch {
        showToast("Error saving Payroll Requisition", "error");
      } finally {
        setIsSavingPrq(false);
      }
    },
    [
      prqEditingId,
      prqMonth,
      prqYear,
      prqNotes,
      prqDetails,
      prqConfirmModal.authPin,
      user?.username,
      showToast,
      fetchAllHrData,
    ]
  );

  const handleOpenCancelPrqModal = useCallback((prq: any) => {
    setIsPrqViewOpen(false);
    setPrqConfirmModal({
      isOpen: true,
      type: "CANCEL_PRQ",
      title: `Cancel PRq — ${prq.requisition_no || prq.requisition_number}`,
      message:
        "Are you sure you want to cancel this Payroll Requisition? Please state the reason below.",
      reasonInput: "",
      authPin: "123456",
      data: prq,
    });
  }, []);

  const handleOpenDeletePrqModal = useCallback((prq: any) => {
    setIsPrqViewOpen(false);
    setPrqConfirmModal({
      isOpen: true,
      type: "DELETE_PRQ",
      title: `Delete Draft PRq — ${prq.requisition_no || prq.requisition_number}`,
      message:
        "This draft/cancelled requisition will be permanently removed from the database.",
      data: prq,
    });
  }, []);

  const handleExecuteCancelPrq = useCallback(
    async (id: string, reason: string) => {
      if (!id) return;
      setIsSavingPrq(true);
      try {
        const res = await apiFetch(
          `/api/hr/payroll-requisitions/${id}/cancel`,
          {
            method: "POST",
            body: JSON.stringify({
              cancel_reason: reason || "Cancelled by HR",
              pin: prqConfirmModal.authPin || "123456",
            }),
          },
          user?.username
        );
        if (res.ok) {
          showToast("Payroll Requisition cancelled", "info");
          setPrqConfirmModal((prev: any) => ({ ...prev, isOpen: false }));
          fetchAllHrData(true);
        } else {
          showToast(res.error || "Failed to cancel PRq", "error");
        }
      } finally {
        setIsSavingPrq(false);
      }
    },
    [prqConfirmModal.authPin, user?.username, showToast, fetchAllHrData]
  );

  const handleExecuteDeletePrq = useCallback(
    async (id: string) => {
      if (!id) return;
      setIsSavingPrq(true);
      try {
        const res = await apiFetch(
          `/api/hr/payroll-requisitions/${id}`,
          { method: "DELETE" },
          user?.username
        );
        if (res.ok) {
          showToast("Payroll Requisition deleted", "info");
          setPrqConfirmModal((prev: any) => ({ ...prev, isOpen: false }));
          fetchAllHrData(true);
        } else {
          showToast(res.error || "Failed to delete PRq", "error");
        }
      } finally {
        setIsSavingPrq(false);
      }
    },
    [user?.username, showToast, fetchAllHrData]
  );

  const handleSyncIntegrity = useCallback(async () => {
    setIsSyncingIntegrity(true);
    try {
      const res = await apiFetch(
        "/api/hr/sync-integrity",
        { method: "POST" },
        user?.username
      );
      if (res.ok) {
        showToast(
          res.data?.message || "HR-ERP audit & sync completed",
          "success"
        );
        fetchAllHrData(true);
      } else {
        showToast(res.error || "Failed to run HR-ERP audit", "error");
      }
    } finally {
      setIsSyncingIntegrity(false);
    }
  }, [user?.username, showToast, fetchAllHrData]);

  const currentTabMeta = TAB_CONFIG[activeTab] || TAB_CONFIG.dashboard;

  const activeHeadcount = useMemo(
    () =>
      (users || []).filter(
        (u) => !u.status || u.status === "APPROVED" || u.status === "ACTIVE"
      ).length,
    [users]
  );

  const avgOrgKpi = useMemo(() => {
    if (!kpis || kpis.length === 0) return "4.8";
    const total = kpis.reduce(
      (acc, k) => acc + Number(k.overall_score || 0),
      0
    );
    return (total / kpis.length).toFixed(1);
  }, [kpis]);

  // Page-specific live telemetry for the right-hand Parallax Rolling graphic cards
  const heroTelemetry = useMemo<HrHeroTelemetry>(() => {
    const totalUsers = (users || []).length;
    const divisionsCount = new Set(
      (users || []).map((u) => u.role || u.division).filter(Boolean)
    ).size;
    const presentCount = (attendances || []).length;
    const pendingOtCount = (attendances || []).filter(
      (a) => Number(a.overtime_hours) > 0 && a.overtime_status === "PENDING"
    ).length;
    const pendingLeaveCount = (leaves || []).filter(
      (l) => l.status === "PENDING"
    ).length;
    const approvedLeaveCount = (leaves || []).filter(
      (l) => l.status === "APPROVED"
    ).length;
    const totalPrqAmount = (payrollRequisitions || []).reduce(
      (sum, r) => sum + Number(r.total_amount || 0),
      0
    );
    const activePrqs = (payrollRequisitions || []).filter(
      (r) => r.status !== "CANCELLED"
    ).length;
    const openJobsCount = (jobs || []).filter(
      (j) => j.status === "OPEN"
    ).length;
    const closedJobsCount = (jobs || []).filter(
      (j) => j.status !== "OPEN"
    ).length;
    const activeAppsCount = (applications || []).filter(
      (a) => a.status !== "REJECTED"
    ).length;
    const offerStageCount = (applications || []).filter(
      (a) => a.status === "OFFER" || a.status === "ACCEPTED"
    ).length;
    const topKpiCount = (kpis || []).filter(
      (k) => Number(k.overall_score || 0) >= 4.2
    ).length;
    const openHandovers = (handovers || []).filter(
      (h) => h.status !== "COMPLETED"
    ).length;
    const completedHandovers = (handovers || []).filter(
      (h) => h.status === "COMPLETED"
    ).length;

    switch (activeTab) {
      case "directory":
        return {
          frontLabel: "Active Directory",
          frontValue: `${activeHeadcount}`,
          frontBadge: `${divisionsCount || 1} Divs`,
          midLabel: "Total Registered",
          midValue: `${totalUsers} Staff`,
          backLabel: "Roster Integrity",
          backMeta: `${Math.round(
            (activeHeadcount / Math.max(totalUsers, 1)) * 100
          )}% Active`,
          progress: Math.min(
            100,
            Math.round((activeHeadcount / Math.max(totalUsers, 1)) * 100)
          ),
          bars: [0.6, 0.85, 0.7, 1, 0.8],
        };
      case "attendance":
        return {
          frontLabel: "Clocked In Today",
          frontValue: `${presentCount}`,
          frontBadge: `${pendingOtCount} OT Queue`,
          midLabel: "Overtime Pending",
          midValue: `${pendingOtCount} Logs`,
          backLabel: "Shift Coverage",
          backMeta: `${(attendances || []).length} Total Logs`,
          progress: Math.min(
            100,
            Math.max(
              25,
              Math.round((presentCount / Math.max(activeHeadcount, 1)) * 100)
            )
          ),
          bars: [0.5, 0.9, 0.65, 1, 0.75],
        };
      case "leave":
        return {
          frontLabel: "Pending Time Off",
          frontValue: `${pendingLeaveCount}`,
          frontBadge: `${approvedLeaveCount} Approved`,
          midLabel: "Annual Quota Policy",
          midValue: "12 Days / Yr",
          backLabel: "Approval Velocity",
          backMeta: `${(leaves || []).length} Requests`,
          progress:
            (leaves || []).length > 0
              ? Math.round((approvedLeaveCount / (leaves || []).length) * 100)
              : 82,
          bars: [0.4, 0.7, 0.85, 0.6, 0.95],
        };
      case "payroll":
        return {
          frontLabel: "Active PRq Batches",
          frontValue: `${activePrqs}`,
          frontBadge: `${(payslips || []).length} Slips`,
          midLabel: "Cumulative PRq",
          midValue: `Rp ${(totalPrqAmount / 1_000_000).toFixed(1)}M`,
          backLabel: "Finance Treasury Sync",
          backMeta: "Auto-Bridge Ready",
          progress: 90,
          bars: [0.65, 0.8, 0.95, 1, 0.85],
        };
      case "vacancies":
        return {
          frontLabel: "Open Vacancies",
          frontValue: `${openJobsCount}`,
          frontBadge: `${closedJobsCount} Archived`,
          midLabel: "Total Requisitions",
          midValue: `${(jobs || []).length} Roles`,
          backLabel: "Career Portal Sync",
          backMeta: "Live on /careers",
          progress:
            (jobs || []).length > 0
              ? Math.round((openJobsCount / (jobs || []).length) * 100)
              : 75,
          bars: [0.55, 0.75, 1, 0.8, 0.65],
        };
      case "candidates":
        return {
          frontLabel: "Active Candidates",
          frontValue: `${activeAppsCount}`,
          frontBadge: `${offerStageCount} Offers`,
          midLabel: "Total Applicants",
          midValue: `${(applications || []).length} Profiles`,
          backLabel: "Funnel Conversion",
          backMeta: `${offerStageCount} Ready to Hire`,
          progress:
            (applications || []).length > 0
              ? Math.max(
                  20,
                  Math.round(
                    (offerStageCount / (applications || []).length) * 100
                  )
                )
              : 68,
          bars: [1, 0.8, 0.6, 0.45, 0.35],
        };
      case "kpi":
        return {
          frontLabel: "Org Performance",
          frontValue: `${avgOrgKpi}`,
          frontBadge: `${topKpiCount} Top Tier`,
          midLabel: "Reviews Logged",
          midValue: `${(kpis || []).length} Appraisals`,
          backLabel: "5-Axis Competency",
          backMeta: "Weighted 360° Index",
          progress: Math.min(100, Math.round((Number(avgOrgKpi) / 5) * 100)),
          bars: [0.7, 0.85, 0.75, 1, 0.9],
        };
      case "handover":
        return {
          frontLabel: "Active Clearance",
          frontValue: `${openHandovers}`,
          frontBadge: `${completedHandovers} Cleared`,
          midLabel: "Total Offboarding",
          midValue: `${(handovers || []).length} Cases`,
          backLabel: "Asset & Task Handover",
          backMeta: "Successor Verified",
          progress:
            (handovers || []).length > 0
              ? Math.round(
                  (completedHandovers / (handovers || []).length) * 100
                )
              : 85,
          bars: [0.5, 0.65, 0.8, 0.9, 1],
        };
      case "settings":
        return {
          frontLabel: "Portal Sections",
          frontValue: `${Object.keys(cmsData || {}).length || 4}`,
          frontBadge: "180d GDPR",
          midLabel: "Data Privacy Vault",
          midValue: "Auto-Anonymize",
          backLabel: "Employer Branding",
          backMeta: "Live Hero Studio",
          progress: 96,
          bars: [0.8, 0.85, 0.9, 1, 0.95],
        };
      case "dashboard":
      default:
        return {
          frontLabel: "Active Workforce",
          frontValue: `${activeHeadcount}`,
          frontBadge: `${avgOrgKpi}★ KPI`,
          midLabel: "Hiring & Openings",
          midValue: `${openJobsCount} Roles · ${activeAppsCount} Apps`,
          backLabel: "People & Culture Pulse",
          backMeta: `${presentCount} Present Today`,
          progress: 88,
          bars: [0.45, 0.75, 0.55, 1, 0.7],
        };
    }
  }, [
    activeTab,
    users,
    activeHeadcount,
    attendances,
    leaves,
    payrollRequisitions,
    payslips,
    jobs,
    applications,
    kpis,
    avgOrgKpi,
    handovers,
    cmsData,
  ]);

  return (
    <div className="hris-theme space-y-7 pb-16">
      {/* =====================================================================
          AIRY FROSTED GLASS HERO WITH ISOMETRIC 3D PARALLAX ROLLING ROTATOR
          ===================================================================== */}
      <HrIsometricHero
        activeTab={activeTab}
        currentTabMeta={currentTabMeta}
        heroTelemetry={heroTelemetry}
        isSyncingIntegrity={isSyncingIntegrity}
        isRefreshing={isRefreshing}
        onSyncIntegrity={handleSyncIntegrity}
        onRefresh={handleSilentRefresh}
      />

      {/* TAB CONTENT BODY WITH SMOOTH TRANSITIONS & LAZY SUSPENSE */}
      {isLoading ? (
        <Loader text="Loading FHTBS People & Culture..." />
      ) : (
        <React.Suspense fallback={<Loader text="Loading module..." />}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {activeTab === "dashboard" && (
                <HrDashboardTab
                  users={users}
                  jobs={jobs}
                  applications={applications}
                  kpis={kpis}
                  handovers={handovers}
                  attendances={attendances}
                  leaves={leaves}
                  salaries={salaries}
                  payrollRequisitions={payrollRequisitions}
                  onNavigateTab={handleNavigateTab}
                />
              )}

              {activeTab === "directory" && (
                <HrDirectoryTab
                  users={users}
                  salaries={salaries}
                  kpis={kpis}
                  currentUser={user}
                  showToast={showToast}
                  onRefresh={handleSilentRefresh}
                />
              )}

              {activeTab === "attendance" && (
                <HrAttendanceTab
                  attendances={attendances}
                  users={users}
                  projects={projects}
                  currentUser={user}
                  showToast={showToast}
                  onRefresh={handleSilentRefresh}
                />
              )}

              {activeTab === "leave" && (
                <HrLeaveTab
                  leaves={leaves}
                  users={users}
                  currentUser={user}
                  showToast={showToast}
                  onRefresh={handleSilentRefresh}
                />
              )}

              {activeTab === "payroll" && (
                <HrPayrollTab
                  users={users}
                  salaries={salaries}
                  payslips={payslips}
                  payrollRequisitions={payrollRequisitions}
                  prqMonth={prqMonth}
                  setPrqMonth={setPrqMonth}
                  prqYear={prqYear}
                  setPrqYear={setPrqYear}
                  handleOpenPreparePrq={handleOpenPreparePrq}
                  handleEditDraftPrq={handleEditDraftPrq}
                  handleViewPrqDetails={handleViewPrqDetails}
                  handleSaveSalary={handleSaveSalary}
                  handleGenerateAdhocPayslip={handleGenerateAdhocPayslip}
                />
              )}

              {activeTab === "vacancies" && (
                <HrVacanciesTab
                  jobs={jobs}
                  currentUser={user}
                  showToast={showToast}
                  onRefresh={handleSilentRefresh}
                />
              )}

              {activeTab === "candidates" && (
                <HrCandidatesTab
                  applications={applications}
                  currentUser={user}
                  showToast={showToast}
                  onRefresh={handleSilentRefresh}
                />
              )}

              {activeTab === "kpi" && (
                <HrKpiTab
                  kpis={kpis}
                  users={users}
                  currentUser={user}
                  showToast={showToast}
                  onRefresh={handleSilentRefresh}
                />
              )}

              {activeTab === "handover" && (
                <HrHandoverTab
                  handovers={handovers}
                  users={users}
                  currentUser={user}
                  showToast={showToast}
                  onRefresh={handleSilentRefresh}
                />
              )}

              {activeTab === "settings" && (
                <HrSettingsTab
                  cmsData={cmsData}
                  setCmsData={setCmsData}
                  currentUser={user}
                  showToast={showToast}
                  onRefresh={handleSilentRefresh}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </React.Suspense>
      )}

      {/* SHARED PAYROLL REQUISITION (PRq) MODALS */}
      <PayrollRequisitionModal
        isOpen={isPrqModalOpen}
        onClose={() => setIsPrqModalOpen(false)}
        prqEditingId={prqEditingId}
        prqDetails={prqDetails}
        prqMonth={prqMonth}
        prqYear={prqYear}
        isPreparingPrq={isPreparingPrq}
        users={users}
        handleUpdatePrqItem={handleUpdatePrqItem}
        prqNotes={prqNotes}
        setPrqNotes={setPrqNotes}
        isSavingPrq={isSavingPrq}
        handleSavePayrollRequisition={handleSavePayrollRequisition}
        handleRequestSubmitPrq={handleRequestSubmitPrq}
      />

      <PrqViewModal
        isOpen={isPrqViewOpen}
        onClose={() => setIsPrqViewOpen(false)}
        selectedPrqView={selectedPrqView}
        handleOpenCancelPrqModal={handleOpenCancelPrqModal}
        handleOpenDeletePrqModal={handleOpenDeletePrqModal}
      />

      <PrqConfirmModal
        prqConfirmModal={prqConfirmModal}
        setPrqConfirmModal={setPrqConfirmModal}
        dailyAuthKey={dailyAuthKey || "123456"}
        handleSavePayrollRequisition={handleSavePayrollRequisition}
        isSavingPrq={isSavingPrq}
        handleExecuteCancelPrq={handleExecuteCancelPrq}
        handleExecuteDeletePrq={handleExecuteDeletePrq}
      />
    </div>
  );
}
