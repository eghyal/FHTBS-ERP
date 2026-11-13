import React, { useEffect, useState, useMemo, useCallback, memo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { LeaveRequestModal } from "@/components/hris/ess/LeaveRequestModal";
import { PayslipModal } from "@/components/hris/ess/PayslipModal";
import {
  Clock,
  CalendarDays,
  ReceiptText,
  Plus,
  ArrowRight,
  MapPin,
  ShieldCheck,
  CheckSquare,
  Eye,
  IdCard,
  Loader2,
} from "lucide-react";
import { cn, formatRupiah as canonicalFormatRupiah } from "@/lib/utils";
import { hasGodMode } from "@/utils/pbac";
import {
  jakartaLiveClockFormatter,
  jakartaDisplayDateFormatter,
  jakartaDisplayTimeFormatter,
  getTodayJakartaDateStr,
} from "@/components/hris/hrisTypes";

const LiveJakartaClock = memo(function LiveJakartaClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  let formatted = "";
  try {
    formatted = jakartaLiveClockFormatter.format(now);
  } catch {
    formatted = now.toLocaleTimeString();
  }

  return (
    <span className="text-lg font-black text-stone-900 font-mono tabular-nums tracking-tight mt-0.5">
      {formatted}
    </span>
  );
});

export default function EmployeeSelfService() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<
    "ATTENDANCE" | "LEAVE" | "PAYSLIP"
  >("ATTENDANCE");
  const [isLoading, setIsLoading] = useState(true);

  const [attendances, setAttendances] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);

  // Manager state
  const isManager =
    user?.level === "MANAGER" ||
    user?.role === "HR" ||
    user?.role === "FC" ||
    hasGodMode(user);
  const [managerViewMode, setManagerViewMode] = useState<
    "PERSONAL" | "TEAM_APPROVALS"
  >("PERSONAL");
  const [managerNoteMap, setManagerNoteMap] = useState<Record<string, string>>(
    {},
  );

  // Modals state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);

  // Leave request forms state
  const [leaveType, setLeaveType] = useState("Annual Paid Leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [isClocking, setIsClocking] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

  const fetchAllData = useCallback(async () => {
    if (!user?.username) return;
    setIsLoading(true);
    try {
      const [attendancesRes, leavesRes, payslipsRes] = await Promise.all([
        apiFetch("/api/hr/attendances", {}, user.username),
        apiFetch("/api/hr/leaves", {}, user.username),
        apiFetch("/api/hr/payslips", {}, user.username),
      ]);

      if (attendancesRes.ok) {
        setAttendances(
          Array.isArray(attendancesRes.data) ? attendancesRes.data : [],
        );
      }
      if (leavesRes.ok) {
        setLeaves(Array.isArray(leavesRes.data) ? leavesRes.data : []);
      }
      if (payslipsRes.ok) {
        setPayslips(Array.isArray(payslipsRes.data) ? payslipsRes.data : []);
      }
    } catch (e) {
      console.error("Error loading self service data:", e);
      showToast("Failed to load staff self service data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [user?.username, showToast]);

  useEffect(() => {
    if (user?.username) {
      fetchAllData();
    }
  }, [user?.username, fetchAllData]);

  // Filter records specifically for active logged-in employee username (case-insensitive)
  const myAttendances = useMemo(() => {
    if (!user?.username) return [];
    const target = user.username.toLowerCase();
    return attendances.filter(
      (a) => String(a.employee_username || "").toLowerCase() === target,
    );
  }, [attendances, user?.username]);

  const myLeaves = useMemo(() => {
    if (!user?.username) return [];
    const target = user.username.toLowerCase();
    return leaves.filter(
      (l) => String(l.employee_username || "").toLowerCase() === target,
    );
  }, [leaves, user?.username]);

  const myPayslips = useMemo(() => {
    if (!user?.username) return [];
    const target = user.username.toLowerCase();
    return payslips.filter(
      (p) => String(p.employee_username || "").toLowerCase() === target,
    );
  }, [payslips, user?.username]);

  // Determine current daily attendance clock status
  const todayDateStr = useMemo(() => getTodayJakartaDateStr(), []);

  const todayLog = useMemo(() => {
    return myAttendances.find((a) => a.date === todayDateStr);
  }, [myAttendances, todayDateStr]);

  const hasClockIn = !!todayLog;
  const hasClockOut = !!(todayLog && todayLog.clock_out);

  // Format Helper definitions using hoisted Intl formatters
  const formatLocalDate = useCallback((isoOrString: string) => {
    if (!isoOrString) return "-";
    try {
      const d = new Date(isoOrString);
      if (Number.isNaN(d.getTime())) return isoOrString;
      return jakartaDisplayDateFormatter.format(d);
    } catch {
      return isoOrString;
    }
  }, []);

  const formatLocalTime = useCallback((isoOrString: string) => {
    if (!isoOrString) return "-";
    try {
      const d = new Date(isoOrString);
      if (Number.isNaN(d.getTime())) return isoOrString;
      return jakartaDisplayTimeFormatter.format(d);
    } catch {
      return isoOrString;
    }
  }, []);

  const formatRupiah = useCallback((val: any) => {
    return canonicalFormatRupiah(val);
  }, []);

  if (!user) return null;

  // Clock In / Clock Out Action Handlers
  const handleClockInOut = async () => {
    if (isClocking) return;
    if (hasClockIn && hasClockOut) {
      showToast(
        "You have already completed your attendance (In & Out) today.",
        "info",
      );
      return;
    }

    setIsClocking(true);
    try {
      showToast("Requesting GPS location...", "info");
      let location = null;
      if (navigator.geolocation) {
        try {
          location = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) =>
                resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
              (err) => resolve(null), // resolve null if err
              { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
            );
          });
        } catch (e) {}
      }

      if (!location) {
        showToast("Warning: Failed to obtain GPS location.", "error");
      }

      const clientTimeStr = new Date().toISOString();
      if (!hasClockIn) {
        // Clocking In
        const res = await apiFetch(
          "/api/hr/attendances/clock-in",
          {
            method: "POST",
            body: JSON.stringify({
              employee_username: user.username,
              clientTime: clientTimeStr,
              location,
            }),
          },
          user.username,
        );

        if (res.ok) {
          showToast("Successfully registered Clock In!", "success");
          fetchAllData();
        } else {
          showToast(res.error || "Failed to perform Clock In", "error");
        }
      } else {
        // Clocking Out
        const res = await apiFetch(
          "/api/hr/attendances/clock-out",
          {
            method: "PUT",
            body: JSON.stringify({
              employee_username: user.username,
              clientTime: clientTimeStr,
              location,
            }),
          },
          user.username,
        );

        if (res.ok) {
          showToast("Successfully registered Clock Out!", "success");
          fetchAllData();
        } else {
          showToast(res.error || "Failed to perform Clock Out", "error");
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Connection failed with attendance server.", "error");
    } finally {
      setIsClocking(false);
    }
  };

  // Create new Leave Request
  const handleRequestLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      showToast("Leave start and end dates are required", "error");
      return;
    }

    setIsSubmittingLeave(true);
    try {
      const res = await apiFetch(
        "/api/hr/leaves",
        {
          method: "POST",
          body: JSON.stringify({
            employee_username: user.username,
            leave_type: leaveType,
            start_date: startDate,
            end_date: endDate,
          }),
        },
        user.username,
      );

      if (res.ok) {
        if ((res as any).auto_approved) {
          showToast(
            "Leave request auto-approved instantly (Manager / Executive Level Access).",
            "success",
          );
        } else {
          showToast(
            "Leave request submitted successfully and sent to relevant Manager for approval.",
            "success",
          );
        }
        setIsRequestModalOpen(false);
        setStartDate("");
        setEndDate("");
        fetchAllData();
      } else {
        showToast(res.error || "Failed to submit leave request", "error");
      }
    } catch (err) {
      console.error(err);
      showToast(
        "An error occurred while submitting the leave request",
        "error",
      );
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  // Computes active standard annual leaves used & left (Annual Paid Leave in current year)
  const currentYearPrefix = useMemo(() => String(new Date().getFullYear()), []);

  const { totalApprovedAnnualDays, totalOtherLeaveDays } = useMemo(() => {
    let annual = 0;
    let other = 0;
    for (const current of myLeaves) {
      if (
        current.status !== "APPROVED" ||
        !String(current.start_date || "").startsWith(currentYearPrefix)
      ) {
        continue;
      }
      const s = new Date(current.start_date);
      const e = new Date(current.end_date);
      const diffTime = Math.abs(e.getTime() - s.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      if (current.leave_type === "Annual Paid Leave" || !current.leave_type) {
        annual += diffDays;
      } else {
        other += diffDays;
      }
    }
    return { totalApprovedAnnualDays: annual, totalOtherLeaveDays: other };
  }, [myLeaves, currentYearPrefix]);

  const remainingLeaveQuota = Math.max(0, 12 - totalApprovedAnnualDays);

  // Manager action for staff leave approvals directly on ESS
  const handleManagerStatusUpdate = async (
    id: string,
    newStatus: "APPROVED" | "REJECTED",
  ) => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(id);
    try {
      const note = managerNoteMap[id] || "";
      const res = await apiFetch(
        `/api/hr/leaves/${id}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ status: newStatus, manager_note: note }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          `Staff leave request ${newStatus === "APPROVED" ? "approved" : "rejected"} successfully`,
          "success",
        );
        fetchAllData();
      } else {
        showToast(
          res.error || "Failed to update leave request status",
          "error",
        );
      }
    } catch (e) {
      console.error(e);
      showToast("Error updating leave status", "error");
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const pendingLeavesForManager = useMemo(
    () => leaves.filter((l) => l.status === "PENDING"),
    [leaves],
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="HR Portal"
        subtitle={
          isManager
            ? "Attendance, leave & team approvals"
            : "Attendance, leave & payslips"
        }
        icon={<IdCard className="w-5 h-5" />}
      />

      {/* Manager Control Indicator */}
      {isManager && (
        <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 px-4 shadow-2xs flex items-center justify-between gap-3 text-stone-800">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-stone-100 text-stone-800 border border-stone-200 shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-900" />
              Manager
            </span>
            <p className="text-xs text-stone-600 font-medium">
              <span className="font-bold font-mono tabular-nums text-stone-900">
                {pendingLeavesForManager.length}
              </span>{" "}
              pending leave request(s)
            </p>
          </div>
          {pendingLeavesForManager.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("LEAVE");
                setManagerViewMode("TEAM_APPROVALS");
              }}
              className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Review ({pendingLeavesForManager.length})
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <Loader text="Loading HR Portal..." />
      ) : (
        <div className="space-y-8">
          {/* Top Dynamic Bento Dashboard Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Kehadiran Hari ini (Clocking state) */}
            <div className="bg-white/95 backdrop-blur-md p-6 rounded-3xl border border-emerald-100/90 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-emerald-400/12 dark:bg-emerald-400/26 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700/80">
                    Today's Attendance Status
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Sync
                  </span>
                </div>
                <h4 className="text-lg font-black text-stone-900 tracking-tight">
                  Attendance Registry
                </h4>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-stone-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-stone-300" />
                    <span>Date: {formatLocalDate(todayDateStr)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-700">
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-full inline-block",
                        hasClockIn ? "bg-emerald-500 ring-2 ring-emerald-200" : "bg-stone-300",
                      )}
                    />
                    <span className="font-mono tabular-nums">
                      Clock In:{" "}
                      {todayLog
                        ? formatLocalTime(todayLog.clock_in)
                        : "Not Logged"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-700">
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-full inline-block",
                        hasClockOut ? "bg-amber-500 ring-2 ring-amber-200" : "bg-stone-200",
                      )}
                    />
                    <span className="font-mono tabular-nums">
                      Clock Out:{" "}
                      {todayLog && todayLog.clock_out
                        ? formatLocalTime(todayLog.clock_out)
                        : "Not Logged Out"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 p-3.5 bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-white border border-emerald-200/60 rounded-2xl flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800/70">
                    Live Time (UTC+7 / Jakarta)
                  </span>
                  <LiveJakartaClock />
                  <span className="text-[9px] font-extrabold text-emerald-600 uppercase tracking-wider mt-0.5">
                    Biometric & GPS Precision
                  </span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100 relative z-10">
                <button
                  onClick={handleClockInOut}
                  disabled={isClocking || (hasClockIn && hasClockOut)}
                  className={cn(
                    "w-full py-3 px-4 rounded-2xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]",
                    !hasClockIn
                      ? "bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white shadow-md shadow-emerald-600/20 disabled:opacity-60"
                      : !hasClockOut
                        ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 text-white shadow-md shadow-amber-600/20 disabled:opacity-60"
                        : "bg-stone-100 text-stone-400 cursor-not-allowed border border-stone-200",
                  )}
                >
                  {isClocking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : !hasClockIn ? (
                    "Clock In Now"
                  ) : !hasClockOut ? (
                    "Clock Out Now"
                  ) : (
                    "Attendance Recorded ✓"
                  )}
                </button>
              </div>
            </div>

            {/* Sisa Kuota Cuti */}
            <div className="bg-white/95 backdrop-blur-md p-6 rounded-3xl border border-amber-100/90 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-400/12 dark:bg-amber-400/26 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800/80">
                    Annual Leave Entitlement ({currentYearPrefix})
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    Quota Active
                  </span>
                </div>
                <h4 className="text-lg font-black text-stone-900 tracking-tight">
                  Remaining Leave Quota
                </h4>

                <div className="flex items-end gap-2.5 mt-4">
                  <span className="text-4xl font-black bg-gradient-to-br from-amber-500 to-amber-600 bg-clip-text text-transparent font-mono tabular-nums">
                    {remainingLeaveQuota}
                  </span>
                  <span className="text-xs font-bold text-stone-500 pb-1">
                    Days Remaining / <span className="font-mono tabular-nums">12</span> Days
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 p-3 rounded-2xl bg-amber-50/50 border border-amber-100/80">
                  <p className="text-xs text-stone-600 font-medium">
                    Annual Paid Used:{" "}
                    <span className="text-amber-800 font-extrabold font-mono tabular-nums">
                      {totalApprovedAnnualDays} days
                    </span>
                  </p>
                  {totalOtherLeaveDays > 0 && (
                    <p className="text-[11px] text-stone-500 font-medium">
                      Sick / Unpaid / Other:{" "}
                      <span className="text-stone-800 font-bold font-mono tabular-nums">
                        {totalOtherLeaveDays} days
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100 relative z-10">
                <button
                  onClick={() => setIsRequestModalOpen(true)}
                  className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-2xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-500/20 active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  Apply for Leave
                </button>
              </div>
            </div>

            {/* Slip Gaji Terbaru */}
            <div className="bg-white/95 backdrop-blur-md p-6 rounded-3xl border border-teal-100/90 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-teal-400/12 dark:bg-teal-400/26 rounded-full blur-2xl pointer-events-none group-hover:scale-125 transition-transform" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800/80">
                    Employee Remuneration
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                    Encrypted
                  </span>
                </div>
                <h4 className="text-lg font-black text-stone-900 tracking-tight">
                  Latest Payslip
                </h4>

                {myPayslips.length > 0 ? (
                  <div className="mt-4">
                    <span className="inline-block px-2.5 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded-full mb-2 border border-teal-200">
                      Period: {myPayslips[0].period_month}
                    </span>
                    <p className="text-xs font-medium text-stone-500">
                      Total Net Salary:
                    </p>
                    <p className="text-2xl font-black bg-gradient-to-br from-teal-700 to-emerald-700 bg-clip-text text-transparent font-mono mt-0.5">
                      {formatRupiah(myPayslips[0].net_salary)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 py-3 text-stone-400 text-xs italic">
                    No payslip records uploaded by HR yet.
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100 relative z-10">
                {myPayslips.length > 0 ? (
                  <button
                    onClick={() => {
                      setSelectedPayslip(myPayslips[0]);
                    }}
                    className="w-full py-3 px-5 bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 hover:from-teal-700 hover:to-emerald-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md shadow-teal-600/20 active:scale-[0.98] cursor-pointer"
                  >
                    <ReceiptText className="w-4 h-4" />
                    View Payslip Details
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full py-3 px-5 bg-stone-50 text-stone-300 border border-stone-200 rounded-2xl text-xs font-bold uppercase tracking-widest cursor-not-allowed"
                  >
                    No Payslips Available
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Wrapped Dynamic Bento Grid Tab Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              onClick={() => setActiveTab("ATTENDANCE")}
              className={cn(
                "group min-h-[48px] px-4 py-2.5 rounded-2xl text-xs tracking-wider font-extrabold uppercase transition-all duration-200 border flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99]",
                activeTab === "ATTENDANCE"
                  ? "bg-stone-800 hover:bg-stone-900 text-white border-stone-800 shadow-md shadow-stone-900/20"
                  : "bg-white text-stone-700 border-stone-200/90 hover:bg-stone-800 hover:text-white hover:border-stone-800",
              )}
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Attendance Logs</span>
              </span>
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-colors",
                  activeTab === "ATTENDANCE"
                    ? "bg-white/20 text-white"
                    : "bg-stone-100 text-stone-600 group-hover:bg-white/20 group-hover:text-white",
                )}
              >
                {myAttendances.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("LEAVE")}
              className={cn(
                "group min-h-[48px] px-4 py-2.5 rounded-2xl text-xs tracking-wider font-extrabold uppercase transition-all duration-200 border flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99]",
                activeTab === "LEAVE"
                  ? "bg-stone-800 hover:bg-stone-900 text-white border-stone-800 shadow-md shadow-stone-900/20"
                  : "bg-white text-stone-700 border-stone-200/90 hover:bg-stone-800 hover:text-white hover:border-stone-800",
              )}
            >
              <span className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                <span>Leave History</span>
              </span>
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-colors",
                  activeTab === "LEAVE"
                    ? "bg-white/20 text-white"
                    : "bg-stone-100 text-stone-600 group-hover:bg-white/20 group-hover:text-white",
                )}
              >
                {myLeaves.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("PAYSLIP")}
              className={cn(
                "group min-h-[48px] px-4 py-2.5 rounded-2xl text-xs tracking-wider font-extrabold uppercase transition-all duration-200 border flex items-center justify-between gap-2 cursor-pointer active:scale-[0.99]",
                activeTab === "PAYSLIP"
                  ? "bg-stone-800 hover:bg-stone-900 text-white border-stone-800 shadow-md shadow-stone-900/20"
                  : "bg-white text-stone-700 border-stone-200/90 hover:bg-stone-800 hover:text-white hover:border-stone-800",
              )}
            >
              <span className="flex items-center gap-2">
                <ReceiptText className="w-4 h-4" />
                <span>Monthly Payslips</span>
              </span>
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-colors",
                  activeTab === "PAYSLIP"
                    ? "bg-white/20 text-white"
                    : "bg-stone-100 text-stone-600 group-hover:bg-white/20 group-hover:text-white",
                )}
              >
                {myPayslips.length}
              </span>
            </button>
          </div>

          {/* TAB 1: ATTENDANCE LOGS */}
          {activeTab === "ATTENDANCE" && (
            <div className="space-y-6">
              <div className="bg-stone-50 border border-stone-200 px-4 py-3 rounded-2xl flex justify-between items-center gap-3">
                <h3 className="text-xs font-black text-stone-800 uppercase tracking-wider">
                  Attendance History
                </h3>
                <span className="px-2.5 py-1 bg-white border border-stone-200 rounded-lg font-mono font-bold text-stone-800 text-[11px]">
                  {myAttendances.length} Days
                </span>
              </div>

              {myAttendances.length === 0 ? (
                <div className="py-20 text-center bg-white rounded-[2.5rem] border border-stone-200 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 bg-stone-50 rounded-full flex items-center justify-center mb-4 text-stone-300">
                    <Clock className="w-6 h-6" />
                  </div>
                  <p className="text-stone-700 font-extrabold text-sm">
                    No attendance logs found.
                  </p>
                  <p className="text-xs text-stone-400 mt-1">
                    Click the "Clock In" button to start recording your shift
                    today.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Vertical Cards (Zero Horizontal Scroll) */}
                  <div className="md:hidden space-y-2.5">
                    {myAttendances.map((att) => (
                      <div
                        key={att.id}
                        className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            {formatLocalDate(att.date)}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded text-[10px] uppercase font-bold">
                            {att.clock_out ? "Completed" : "On Duty"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              Clock In
                            </span>
                            <span className="font-mono font-bold text-emerald-600">
                              {formatLocalTime(att.clock_in)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">
                              Clock Out
                            </span>
                            <span className="font-mono font-bold text-slate-700">
                              {att.clock_out
                                ? formatLocalTime(att.clock_out)
                                : "In Progress"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-6">Log ID</TableHead>
                          <TableHead className="px-6">Date</TableHead>
                          <TableHead className="px-6">Clock In</TableHead>
                          <TableHead className="px-6">Location In</TableHead>
                          <TableHead className="px-6">Clock Out</TableHead>
                          <TableHead className="px-6">Location Out</TableHead>
                          <TableHead className="px-6">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myAttendances.map((att) => (
                          <TableRow key={att.id}>
                            <TableCell className="py-3.5 px-6 font-mono text-stone-500">
                              {att.id}
                            </TableCell>
                            <TableCell className="py-3.5 px-6 font-bold text-stone-900">
                              {formatLocalDate(att.date)}
                            </TableCell>
                            <TableCell className="py-3.5 px-6 font-mono text-emerald-600 font-extrabold">
                              {formatLocalTime(att.clock_in)}
                            </TableCell>
                            <TableCell className="py-3.5 px-6">
                              {att.clock_in_location ? (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${att.clock_in_location}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-stone-700 hover:text-stone-900 hover:underline"
                                >
                                  <MapPin className="w-3 h-3" />
                                  <span className="text-[10px] font-mono">
                                    {att.clock_in_location}
                                  </span>
                                </a>
                              ) : (
                                <span className="text-stone-300 text-[10px]">
                                  N/A
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-3.5 px-6 font-mono">
                              {att.clock_out ? (
                                <span className="text-stone-600 font-bold">
                                  {formatLocalTime(att.clock_out)}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 text-[9px] uppercase font-black tracking-widest border border-amber-200 rounded animate-pulse">
                                  In Progress
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-3.5 px-6">
                              {att.clock_out_location ? (
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${att.clock_out_location}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-stone-700 hover:text-stone-900 hover:underline"
                                >
                                  <MapPin className="w-3 h-3" />
                                  <span className="text-[10px] font-mono">
                                    {att.clock_out_location}
                                  </span>
                                </a>
                              ) : (
                                <span className="text-stone-300 text-[10px]">
                                  N/A
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-3.5 px-6">
                              <span className="px-2 py-0.5 bg-stone-100 border border-stone-200 text-stone-500 rounded text-[9px] uppercase tracking-wide font-black">
                                {att.clock_out ? "Completed" : "On Duty"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: LEAVE REQUESTS */}
          {activeTab === "LEAVE" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-stone-50 border border-stone-200 px-4 py-3 rounded-2xl gap-3">
                <h3 className="text-xs font-black text-stone-800 uppercase tracking-wider flex items-center gap-2">
                  Leave Requests
                  {isManager && (
                    <span className="bg-stone-900 text-white text-[9px] px-2 py-0.5 rounded uppercase tracking-wider font-extrabold">
                      Manager
                    </span>
                  )}
                </h3>

                <div className="flex items-center gap-2">
                  {isManager && (
                    <div className="flex items-center bg-stone-200/70 p-1 rounded-xl">
                      <button
                        onClick={() => setManagerViewMode("PERSONAL")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                          managerViewMode === "PERSONAL"
                            ? "bg-white text-stone-900 shadow-sm"
                            : "text-stone-600 hover:text-stone-900",
                        )}
                      >
                        My Requests
                      </button>
                      <button
                        onClick={() => setManagerViewMode("TEAM_APPROVALS")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                          managerViewMode === "TEAM_APPROVALS"
                            ? "bg-stone-900 text-white shadow-sm"
                            : "text-stone-600 hover:text-stone-900",
                        )}
                      >
                        <span>Team Approvals</span>
                        {pendingLeavesForManager.length > 0 && (
                          <span className="w-4 h-4 rounded-full bg-amber-500 text-stone-950 text-[10px] font-black flex items-center justify-center">
                            {pendingLeavesForManager.length}
                          </span>
                        )}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setIsRequestModalOpen(true)}
                    className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Apply for Leave
                  </button>
                </div>
              </div>

              {/* MANAGER TEAM APPROVALS VIEW */}
              {isManager && managerViewMode === "TEAM_APPROVALS" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h4 className="text-xs font-black uppercase tracking-widest text-stone-500">
                      Staff Submissions Awaiting Approval ({leaves.length})
                    </h4>
                  </div>

                  {leaves.length === 0 ? (
                    <div className="py-16 text-center bg-white rounded-[2.5rem] border border-stone-200">
                      <CheckSquare className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                      <p className="text-stone-800 font-bold text-sm">
                        All caught up!
                      </p>
                      <p className="text-stone-400 text-xs mt-1">
                        There are no staff leave requests pending review.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {leaves.map((lv: any) => {
                        const s = new Date(lv.start_date);
                        const e = new Date(lv.end_date);
                        let daysCount = 1;
                        try {
                          const diffTime = Math.abs(e.getTime() - s.getTime());
                          daysCount =
                            Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                        } catch (_) {}

                        return (
                          <div
                            key={lv.id}
                            className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm space-y-4"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 text-stone-800 font-black flex items-center justify-center text-sm shadow-2xs">
                                  {(
                                    lv.employee_name ||
                                    lv.employee_username ||
                                    "U"
                                  )
                                    .substring(0, 2)
                                    .toUpperCase()}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-stone-900 text-sm">
                                      {lv.employee_name || lv.employee_username}
                                    </span>
                                    <span className="text-xs text-stone-400 font-mono">
                                      @{lv.employee_username}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-stone-500 font-bold uppercase tracking-wider mt-0.5">
                                    <span className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded">
                                      {lv.employee_role || "Staff"}
                                    </span>
                                    <span>
                                      • Level: {lv.employee_level || "STAFF"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                    lv.status === "APPROVED"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : lv.status === "REJECTED"
                                        ? "bg-rose-50 text-rose-700 border-rose-200"
                                        : "bg-amber-50 text-amber-700 border-amber-200",
                                  )}
                                >
                                  {lv.status || "PENDING"}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div>
                                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-1">
                                  Request Details
                                </span>
                                <p className="font-bold text-stone-800">
                                  {lv.leave_type}
                                </p>
                                <p className="text-stone-600 mt-0.5">
                                  {formatLocalDate(lv.start_date)} -{" "}
                                  {formatLocalDate(lv.end_date)} ({daysCount}{" "}
                                  Working Days)
                                </p>

                              </div>

                              <div>
                                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-1">
                                  Manager Notes (Feedback)
                                </span>
                                {lv.status === "PENDING" ? (
                                  <textarea
                                    rows={2}
                                    placeholder="Enter manager notes (e.g. Approved, duties handed over to...)"
                                    value={managerNoteMap[lv.id] || ""}
                                    onChange={(e) =>
                                      setManagerNoteMap((prev) => ({
                                        ...prev,
                                        [lv.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-800 outline-none focus:ring-2 focus:ring-stone-400"
                                  />
                                ) : (
                                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 text-stone-700 font-medium">
                                    {lv.manager_note || (
                                      <span className="text-stone-400 italic">
                                        No manager notes provided.
                                      </span>
                                    )}
                                    {lv.approver_name && (
                                      <p className="text-[10px] text-stone-400 mt-1 font-bold">
                                        Authorizer: {lv.approver_name}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {lv.status === "PENDING" && (
                              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                                <button
                                  type="button"
                                  disabled={isUpdatingStatus === lv.id}
                                  onClick={() =>
                                    handleManagerStatusUpdate(lv.id, "REJECTED")
                                  }
                                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {isUpdatingStatus === lv.id ? "Processing..." : "Reject Request"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isUpdatingStatus === lv.id}
                                  onClick={() =>
                                    handleManagerStatusUpdate(lv.id, "APPROVED")
                                  }
                                  className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
                                >
                                  {isUpdatingStatus === lv.id ? "Processing..." : "Approve Request"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : /* PERSONAL LEAVE REQUESTS LIST */
              myLeaves.length === 0 ? (
                <div className="py-20 text-center bg-white rounded-[2.5rem] border border-stone-200 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 bg-stone-50 rounded-full flex items-center justify-center mb-4 text-stone-300">
                    <CalendarDays className="w-6 h-6" />
                  </div>
                  <p className="text-stone-700 font-extrabold text-sm">
                    No leave history found.
                  </p>
                  <p className="text-xs text-stone-400 mt-1">
                    Submit a leave request when you plan to be away.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-stone-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                  {/* Mobile Vertical Cards (Zero Horizontal Scroll) */}
                  <div className="md:hidden divide-y divide-stone-100">
                    {myLeaves.map((leave) => {
                      const statusClass =
                        leave.status === "APPROVED"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : leave.status === "REJECTED"
                            ? "bg-rose-50 text-rose-700 border-rose-100"
                            : "bg-amber-50 text-amber-700 border-amber-100";

                      return (
                        <div key={leave.id} className="p-4 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-mono font-black text-xs text-stone-900">
                                {leave.id}
                              </span>
                              <p className="text-sm font-black text-stone-800 mt-0.5">
                                {leave.leave_type}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black tracking-widest border",
                                statusClass,
                              )}
                            >
                              {leave.status || "PENDING"}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-xs">
                            <div>
                              <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                                Start Date
                              </span>
                              <span className="font-bold text-slate-700">
                                {formatLocalDate(leave.start_date)}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                                End Date
                              </span>
                              <span className="font-bold text-slate-700">
                                {formatLocalDate(leave.end_date)}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {!leave.approver_name && !leave.manager_note && (
                              <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">
                                Waiting for Review
                              </span>
                            )}
                            {leave.approver_name && (
                              <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
                                Authorized by:{" "}
                                <strong className="text-stone-700">
                                  {leave.approver_name}
                                </strong>
                              </p>
                            )}
                            {leave.manager_note && (
                              <p className="text-[11px] text-stone-800 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200/80 mt-1 font-sans">
                                <strong className="text-amber-900 font-extrabold">
                                  Manager Note:
                                </strong>{" "}
                                {leave.manager_note}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <Table className="border-0 rounded-none shadow-none">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-6">Request ID</TableHead>
                          <TableHead className="px-6">Leave Category</TableHead>
                          <TableHead className="px-6">Start Date</TableHead>
                          <TableHead className="px-6">End Date</TableHead>
                          <TableHead className="px-6">Approval Status</TableHead>
                          <TableHead className="px-6">Approver / Manager Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myLeaves.map((leave) => {
                          const statusClass =
                            leave.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : leave.status === "REJECTED"
                                ? "bg-rose-50 text-rose-700 border-rose-100"
                                : "bg-amber-50 text-amber-700 border-amber-100";

                          return (
                            <TableRow key={leave.id}>
                              <TableCell className="py-3.5 px-6 font-mono font-black text-stone-900">
                                {leave.id}
                              </TableCell>
                              <TableCell className="py-3.5 px-6 font-bold text-stone-800">
                                {leave.leave_type}
                              </TableCell>
                              <TableCell className="py-3.5 px-6">
                                {formatLocalDate(leave.start_date)}
                              </TableCell>
                              <TableCell className="py-3.5 px-6">
                                {formatLocalDate(leave.end_date)}
                              </TableCell>
                              <TableCell className="py-3.5 px-6">
                                <span
                                  className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black tracking-widest border",
                                    statusClass,
                                  )}
                                >
                                  {leave.status || "PENDING"}
                                </span>
                              </TableCell>
                              <TableCell className="py-3.5 px-6">
                                <div className="space-y-1">
                                  {!leave.approver_name && !leave.manager_note && (
                                    <span className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Waiting for Review</span>
                                  )}
                                  {leave.approver_name && (
                                    <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
                                      Authorized by:{" "}
                                      <strong className="text-stone-700">
                                        {leave.approver_name}
                                      </strong>
                                    </p>
                                  )}
                                  {leave.manager_note && (
                                    <p className="text-[11px] text-stone-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80 mt-1 font-sans">
                                      <strong className="text-amber-900 font-extrabold">
                                        Manager Note:
                                      </strong>{" "}
                                      {leave.manager_note}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PAYSLIPS */}
          {activeTab === "PAYSLIP" && (
            <div className="space-y-6">
              <div className="bg-stone-50 border border-stone-200 px-4 py-3 rounded-2xl flex items-center justify-between">
                <h3 className="text-xs font-black text-stone-800 uppercase tracking-wider">
                  Payslip Archive
                </h3>
                <span className="text-[11px] font-mono font-bold text-stone-500">
                  {myPayslips.length} Slips
                </span>
              </div>

              {myPayslips.length === 0 ? (
                <div className="py-20 text-center bg-white rounded-[2.5rem] border border-stone-200 flex flex-col items-center justify-center">
                  <div className="w-14 h-14 bg-stone-50 rounded-full flex items-center justify-center mb-4 text-stone-300">
                    <ReceiptText className="w-6 h-6" />
                  </div>
                  <p className="text-stone-700 font-extrabold text-sm">
                    No documents available.
                  </p>
                  <p className="text-xs text-stone-400 mt-1">
                    The finance team has not issued your payslips for this
                    period yet.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-bold">
                  {myPayslips.map((pay) => (
                    <div
                      key={pay.id}
                      className="bg-white border hover:border-stone-400 transition-all shadow-sm rounded-[2rem] p-6 flex flex-col justify-between group cursor-pointer"
                      onClick={() => setSelectedPayslip(pay)}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-6">
                          <div className="w-11 h-11 bg-stone-100 text-stone-700 border border-stone-200 rounded-xl flex items-center justify-center shadow-inner">
                            <ReceiptText className="w-5 h-5" />
                          </div>
                          <span
                            className={cn(
                              "px-2 py-0.5 border text-[9px] uppercase tracking-widest font-black rounded",
                              pay.status === "PAID"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-amber-50 text-amber-600 border-amber-200",
                            )}
                          >
                            {pay.status === "PAID" ? "PAID" : "PENDING PAYMENT"}
                          </span>
                        </div>

                        <h4 className="text-lg font-black text-stone-900 group-hover:text-stone-700 transition-colors">
                          {pay.period_month}
                        </h4>
                        <p className="text-stone-400 text-[11px] font-mono mt-0.5">
                          ID: {pay.id}
                        </p>

                        <div className="mt-4 pt-4 border-t border-stone-100 space-y-1 bg-stone-50/50 p-3 rounded-xl border border-stone-100">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400 block">
                            Total Net Salary
                          </span>
                          <span className="text-base font-black text-stone-900 font-mono tracking-tight block">
                            {formatRupiah(pay.net_salary)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-stone-150 flex items-center justify-between text-xs font-bold text-stone-500">
                        <Eye className="w-4 h-4" />
                        <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-1.5 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <LeaveRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        isManager={isManager}
        isSubmittingLeave={isSubmittingLeave}
        leaveType={leaveType}
        setLeaveType={setLeaveType}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        handleRequestLeave={handleRequestLeave}
      />

      <PayslipModal
        selectedPayslip={selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
        user={user}
        formatRupiah={formatRupiah}
      />
    </div>
  );
}
