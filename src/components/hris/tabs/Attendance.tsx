import React, { useState, useMemo } from "react";
import {
  Clock,
  MapPin,
  Plus,
  Check,
  X,
  Pencil,
  Briefcase,
  Search,
  Sun,
  Sunset,
  Moon,
  Building,
  Zap,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatRupiah } from "@/utils/format";
import { apiFetch } from "@/utils/api";

interface HrAttendanceTabProps {
  attendances: any[];
  users: any[];
  projects: any[];
  currentUser: any;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onRefresh: () => void;
}

const SHIFTS = [
  {
    id: "SHIFT_1",
    short: "Shift 1 · Morning",
    window: "07:00 – 15:00",
    label: "Shift 1 - Morning (07:00 - 15:00)",
    icon: <Sun className="w-4 h-4 text-amber-500" />,
  },
  {
    id: "SHIFT_2",
    short: "Shift 2 · Afternoon",
    window: "15:00 – 23:00",
    label: "Shift 2 - Afternoon (15:00 - 23:00)",
    icon: <Sunset className="w-4 h-4 text-[#F25730]" />,
  },
  {
    id: "SHIFT_3",
    short: "Shift 3 · Night",
    window: "23:00 – 07:00",
    label: "Shift 3 - Night (23:00 - 07:00)",
    icon: <Moon className="w-4 h-4 text-indigo-500" />,
  },
  {
    id: "GENERAL",
    short: "General Office",
    window: "08:00 – 17:00",
    label: "General Office (08:00 - 17:00)",
    icon: <Building className="w-4 h-4 text-sky-500" />,
  },
];

export const HrAttendanceTab: React.FC<HrAttendanceTabProps> = React.memo(
  ({ attendances, users, projects, currentUser, showToast, onRefresh }) => {
    const [dateFilter, setDateFilter] = useState("");
    const [shiftFilter, setShiftFilter] = useState("ALL");
    const [otFilter, setOtFilter] = useState("ALL");
    const [searchStaff, setSearchStaff] = useState("");
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Manual Attendance Entry / Correction Modal
    const [isManualOpen, setIsManualOpen] = useState(false);
    const [manualId, setManualId] = useState<string | null>(null);
    const [manualEmp, setManualEmp] = useState("");
    const [manualDate, setManualDate] = useState(() =>
      new Date().toISOString().slice(0, 10),
    );
    const [manualClockIn, setManualClockIn] = useState("08:00");
    const [manualClockOut, setManualClockOut] = useState("17:00");
    const [manualShift, setManualShift] = useState("SHIFT_1");
    const [manualProjectId, setManualProjectId] = useState("");
    const [manualOtHours, setManualOtHours] = useState<number>(0);
    const [manualOtStatus, setManualOtStatus] = useState("APPROVED");
    const [manualReason, setManualReason] = useState("");
    const [isSavingManual, setIsSavingManual] = useState(false);

    const filteredAttendances = useMemo(() => {
      return (attendances || []).filter((a) => {
        if (dateFilter && a.date !== dateFilter) return false;
        if (shiftFilter !== "ALL" && (a.shift || "SHIFT_1") !== shiftFilter)
          return false;
        if (otFilter !== "ALL") {
          if (otFilter === "OVERTIME_ONLY" && !(Number(a.overtime_hours) > 0))
            return false;
          if (
            otFilter !== "OVERTIME_ONLY" &&
            (a.overtime_status || "NONE") !== otFilter
          )
            return false;
        }
        if (searchStaff.trim()) {
          const q = searchStaff.toLowerCase().trim();
          const matchName = String(a.employee_name || "")
            .toLowerCase()
            .includes(q);
          const matchUser = String(a.employee_username || "")
            .toLowerCase()
            .includes(q);
          if (!matchName && !matchUser) return false;
        }
        return true;
      });
    }, [attendances, dateFilter, shiftFilter, otFilter, searchStaff]);

    const shiftCounts = useMemo(() => {
      const map: Record<string, { count: number; hours: number }> = {};
      SHIFTS.forEach((s) => {
        map[s.id] = { count: 0, hours: 0 };
      });
      (attendances || []).forEach((a) => {
        const s = a.shift || "SHIFT_1";
        if (!map[s]) map[s] = { count: 0, hours: 0 };
        map[s].count += 1;
        map[s].hours += Number(a.work_hours || 0);
      });
      return map;
    }, [attendances]);

    const overtimeQueue = useMemo(() => {
      return (attendances || []).filter((a) => Number(a.overtime_hours) > 0);
    }, [attendances]);

    const summaryStats = useMemo(() => {
      let totalHours = 0;
      let totalOtHours = 0;
      let totalLaborCost = 0;
      let pendingOtCount = 0;
      filteredAttendances.forEach((a) => {
        totalHours += Number(a.work_hours || 0);
        totalOtHours += Number(a.overtime_hours || 0);
        totalLaborCost += Number(a.labor_cost || 0);
        if (a.overtime_status === "PENDING") pendingOtCount += 1;
      });
      return {
        totalRecords: filteredAttendances.length,
        totalHours: totalHours.toFixed(1),
        totalOtHours: totalOtHours.toFixed(1),
        totalLaborCost,
        pendingOtCount,
      };
    }, [filteredAttendances]);

    const formatTimeHm = (iso?: string) => {
      if (!iso) return "-";
      try {
        return new Date(iso).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jakarta",
        });
      } catch {
        return iso;
      }
    };

    const handleOpenNewManual = () => {
      setManualId(null);
      setManualEmp(users[0]?.username || "");
      setManualDate(new Date().toISOString().slice(0, 10));
      setManualClockIn("08:00");
      setManualClockOut("17:00");
      setManualShift("SHIFT_1");
      setManualProjectId("");
      setManualOtHours(0);
      setManualOtStatus("APPROVED");
      setManualReason("HR Manual Attendance Entry");
      setIsManualOpen(true);
    };

    const handleOpenEditAttendance = (att: any) => {
      setManualId(att.id);
      setManualEmp(att.employee_username);
      setManualDate(att.date || new Date().toISOString().slice(0, 10));
      setManualClockIn(att.clock_in ? formatTimeHm(att.clock_in) : "08:00");
      setManualClockOut(att.clock_out ? formatTimeHm(att.clock_out) : "17:00");
      setManualShift(att.shift || "SHIFT_1");
      setManualProjectId(att.project_id || "");
      setManualOtHours(Number(att.overtime_hours || 0));
      setManualOtStatus(
        att.overtime_status && att.overtime_status !== "NONE"
          ? att.overtime_status
          : "APPROVED",
      );
      setManualReason(att.overtime_reason || "HR Attendance Correction");
      setIsManualOpen(true);
    };

    const handleSaveManualAttendance = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!manualEmp || !manualDate) {
        showToast("Please select an employee and date", "error");
        return;
      }
      setIsSavingManual(true);
      try {
        const res = await apiFetch(
          "/api/hr/attendances/manual",
          {
            method: "POST",
            body: JSON.stringify({
              id: manualId,
              employee_username: manualEmp,
              date: manualDate,
              clock_in_time: manualClockIn,
              clock_out_time: manualClockOut || null,
              shift: manualShift,
              project_id: manualProjectId || null,
              overtime_hours: manualOtHours,
              overtime_status: manualOtHours > 0 ? manualOtStatus : "NONE",
              overtime_reason: manualReason,
            }),
          },
          currentUser?.username,
        );

        if (res.ok) {
          showToast(
            manualId
              ? "Attendance log corrected and synced to Payroll/COGS"
              : "Manual attendance recorded successfully",
            "success",
          );
          setIsManualOpen(false);
          onRefresh();
        } else {
          showToast(res.error || "Failed to save attendance record", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Error saving manual attendance", "error");
      } finally {
        setIsSavingManual(false);
      }
    };

    const handleOvertimeDecision = async (
      id: string,
      status: "APPROVED" | "REJECTED",
    ) => {
      setProcessingId(id);
      try {
        const res = await apiFetch(
          `/api/hr/attendances/${id}/overtime-status`,
          {
            method: "PUT",
            body: JSON.stringify({ status }),
          },
          currentUser?.username,
        );
        if (res.ok) {
          showToast(`Overtime ${status.toLowerCase()} successfully`, "success");
          onRefresh();
        } else {
          showToast(res.error || "Failed to update overtime status", "error");
        }
      } catch (e) {
        showToast("Error updating overtime status", "error");
      } finally {
        setProcessingId(null);
      }
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* INTERACTIVE SHIFT CONTROL DECK (CLICK TO FILTER BY SHIFT) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SHIFTS.map((s) => {
            const stat = shiftCounts[s.id] || { count: 0, hours: 0 };
            const isSelected = shiftFilter === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  setShiftFilter((prev) => (prev === s.id ? "ALL" : s.id))
                }
                className={`p-5 rounded-[26px] text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "bg-[#121318] text-white shadow-[0_18px_38px_rgba(18,19,24,0.18)] scale-[1.01]"
                    : "hris-glass-card hover:bg-white/90 text-[#121318]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                      isSelected ? "bg-white/15" : "bg-stone-100 border border-white"
                    }`}
                  >
                    {s.icon}
                  </div>
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                      isSelected
                        ? "bg-sky-500/20 text-sky-300 border border-sky-400/30"
                        : "bg-stone-100 text-[#646876]"
                    }`}
                  >
                    {s.window}
                  </span>
                </div>

                <div className="mt-4">
                  <span
                    className={`text-xs font-semibold block ${
                      isSelected ? "text-white/70" : "text-[#8E929F]"
                    }`}
                  >
                    {s.short}
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-extrabold tabular-nums">
                      {stat.count}{" "}
                      <span className="text-xs font-medium opacity-70">
                        logs
                      </span>
                    </span>
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        isSelected ? "text-emerald-300" : "text-sky-600"
                      }`}
                    >
                      {stat.hours.toFixed(1)} hrs
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ASYMMETRIC SPLIT WORKSPACE: LEFT OVERTIME DECK (4 COLS) + RIGHT VISUAL TIMECARDS (8 COLS) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT 4 COLS: OVERTIME AUTHORIZATION ACTION DECK & LABOR TELEMETRY */}
          <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-20">
            <div className="hris-glass-panel p-6 rounded-[28px] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-[#121318]">
                      Overtime Queue
                    </h3>
                    <p className="text-[11px] font-medium text-[#8E929F]">
                      Direct COGS &amp; Payroll OT approval
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-extrabold tabular-nums">
                  {summaryStats.pendingOtCount} Pending
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3.5 rounded-2xl bg-white/80 border border-white">
                  <span className="text-[10px] font-bold uppercase text-[#8E929F] block">
                    Total OT Logged
                  </span>
                  <span className="text-lg font-extrabold text-amber-700 tabular-nums mt-0.5 block">
                    {summaryStats.totalOtHours} hrs
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/80 border border-white">
                  <span className="text-[10px] font-bold uppercase text-[#8E929F] block">
                    Direct Labor Cost
                  </span>
                  <span className="text-sm font-extrabold text-[#121318] tabular-nums mt-1 block">
                    {formatRupiah(summaryStats.totalLaborCost)}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                {overtimeQueue.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-white/60 border border-white text-center text-xs text-[#8E929F]">
                    No overtime records logged yet.
                  </div>
                ) : (
                  overtimeQueue.map((att) => {
                    const isPending =
                      (att.overtime_status || "PENDING") === "PENDING";
                    return (
                      <div
                        key={`ot-${att.id}`}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isPending
                            ? "bg-amber-50/70 border-amber-200/80"
                            : "bg-white/75 border-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-extrabold text-[#121318]">
                              {att.employee_name || att.employee_username}
                            </h4>
                            <p className="text-[10px] font-medium text-[#646876]">
                              {att.date} · {att.shift || "SHIFT_1"}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-white text-amber-700 font-extrabold text-[11px] tabular-nums border border-amber-200/60">
                            +{Number(att.overtime_hours || 0)}h OT
                          </span>
                        </div>

                        {att.overtime_reason && (
                          <p className="text-[11px] text-[#646876] mt-1.5 line-clamp-1">
                            “{att.overtime_reason}”
                          </p>
                        )}

                        <div className="mt-3 pt-2 border-t border-stone-200/50 flex items-center justify-between">
                          <span
                            className={`text-[10px] font-extrabold uppercase ${
                              att.overtime_status === "APPROVED"
                                ? "text-emerald-700"
                                : att.overtime_status === "REJECTED"
                                  ? "text-rose-600"
                                  : "text-amber-700"
                            }`}
                          >
                            {att.overtime_status || "PENDING"}
                          </span>

                          {isPending && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={processingId === att.id}
                                onClick={() =>
                                  handleOvertimeDecision(att.id, "APPROVED")
                                }
                                className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3 h-3" /> Approve
                              </button>
                              <button
                                type="button"
                                disabled={processingId === att.id}
                                onClick={() =>
                                  handleOvertimeDecision(att.id, "REJECTED")
                                }
                                className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3 h-3" /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT 8 COLS: VISUAL TIMECARD STREAM & FILTERS */}
          <div className="lg:col-span-8 space-y-4">
            <div className="hris-glass-panel p-4 rounded-[28px] flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 text-[#8E929F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchStaff}
                  onChange={(e) => setSearchStaff(e.target.value)}
                  placeholder="Search staff timecards..."
                  className="w-full h-10 pl-10 pr-4 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#121318] outline-none"
                />
              </div>

              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="h-10 px-3.5 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#121318] outline-none cursor-pointer"
              />

              <select
                value={otFilter}
                onChange={(e) => setOtFilter(e.target.value)}
                className="h-10 px-3.5 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#32353E] outline-none cursor-pointer"
              >
                <option value="ALL">All Logs ({summaryStats.totalRecords})</option>
                <option value="OVERTIME_ONLY">With Overtime (&gt;0h)</option>
                <option value="PENDING">OT Pending</option>
                <option value="APPROVED">OT Approved</option>
              </select>

              {(searchStaff ||
                dateFilter ||
                shiftFilter !== "ALL" ||
                otFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchStaff("");
                    setDateFilter("");
                    setShiftFilter("ALL");
                    setOtFilter("ALL");
                  }}
                  className="h-10 px-3 bg-stone-200/70 hover:bg-stone-200 text-[#32353E] rounded-2xl text-xs font-bold cursor-pointer"
                >
                  Reset
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenNewManual}
                className="h-10 px-4 bg-[#121318] hover:bg-[#1E2028] text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4 text-sky-400" />
                <span>Manual Log</span>
              </button>
            </div>

            {/* Horizontal Timecard Strips */}
            {filteredAttendances.length === 0 ? (
              <div className="hris-glass-panel p-14 rounded-[28px] text-center">
                <Clock className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                <p className="text-sm font-extrabold text-[#121318]">
                  No attendance timecards match the current filter.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAttendances.map((att) => {
                  const workHrs = Number(att.work_hours || 0);
                  const otHrs = Number(att.overtime_hours || 0);
                  const barPct = Math.min(100, Math.round((workHrs / 12) * 100));

                  return (
                    <div
                      key={att.id}
                      className="hris-glass-card p-5 rounded-[26px] flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                    >
                      {/* Staff Identity & Shift */}
                      <div className="flex items-center gap-3.5 min-w-[210px]">
                        <div className="w-11 h-11 rounded-2xl bg-sky-50 border border-sky-200/60 text-sky-700 font-extrabold text-xs flex items-center justify-center uppercase shrink-0">
                          {String(
                            att.employee_name || att.employee_username || "U",
                          ).slice(0, 2)}
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-[#121318]">
                            {att.employee_name || att.employee_username}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8E929F] mt-0.5">
                            <span>{att.date}</span>
                            <span>•</span>
                            <span className="px-2 py-0.2 rounded-md bg-stone-100 text-[#32353E] font-bold text-[10px]">
                              {att.shift || "SHIFT_1"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Visual Clock-In -> Clock-Out Timeline Bar */}
                      <div className="flex-1 w-full space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-700 tabular-nums">
                            In {formatTimeHm(att.clock_in)}
                          </span>
                          <span className="text-[11px] font-semibold text-[#646876] flex items-center gap-1">
                            {att.project_name ? (
                              <>
                                <Briefcase className="w-3 h-3 text-[#F25730]" />
                                <span className="truncate max-w-[150px]">
                                  {att.project_name}
                                </span>
                              </>
                            ) : att.clock_in_location ? (
                              <>
                                <MapPin className="w-3 h-3 text-sky-500" />
                                <span className="truncate max-w-[150px]">
                                  {att.clock_in_location}
                                </span>
                              </>
                            ) : (
                              <span>Plant Floor</span>
                            )}
                          </span>
                          <span className="font-bold text-[#32353E] tabular-nums">
                            Out{" "}
                            {att.clock_out
                              ? formatTimeHm(att.clock_out)
                              : "Active"}
                          </span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-stone-200/70 overflow-hidden flex">
                          <div
                            className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-l-full"
                            style={{ width: `${Math.max(15, barPct)}%` }}
                          />
                          {otHrs > 0 && (
                            <div
                              className="h-full bg-amber-500 rounded-r-full"
                              style={{
                                width: `${Math.min(35, otHrs * 8)}%`,
                              }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Hours, Cost & Edit */}
                      <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-stone-200/50">
                        <div className="text-right">
                          <div className="text-sm font-extrabold text-[#121318] tabular-nums">
                            {workHrs.toFixed(1)} hrs
                            {otHrs > 0 && (
                              <span className="ml-1.5 text-xs font-extrabold text-amber-600">
                                (+{otHrs}h OT)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-bold text-[#646876] tabular-nums">
                            {formatRupiah(att.labor_cost || 0)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenEditAttendance(att)}
                          className="p-2.5 rounded-2xl bg-stone-100 hover:bg-[#121318] text-[#32353E] hover:text-white transition-colors cursor-pointer"
                          title="Correct Attendance"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* MANUAL ATTENDANCE ENTRY / CORRECTION MODAL */}
        <Modal
          isOpen={isManualOpen}
          onClose={() => setIsManualOpen(false)}
          title={
            manualId
              ? "Correct Employee Attendance & Overtime"
              : "Manual Attendance Entry (HR Override)"
          }
          description="Directly log or adjust employee shift hours, project allocation, and certified overtime."
          maxWidth="lg"
          uiTheme="hris"
        >
          <form
            onSubmit={handleSaveManualAttendance}
            className="space-y-4 text-left font-bold"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Employee"
                required
                value={manualEmp}
                onChange={(e) => setManualEmp(e.target.value)}
              >
                <option value="">Select Employee...</option>
                {(users || []).map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.name || u.username} (@{u.username})
                  </option>
                ))}
              </Select>

              <Input
                type="date"
                label="Attendance Date"
                required
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                type="time"
                label="Clock In (WIB)"
                required
                value={manualClockIn}
                onChange={(e) => setManualClockIn(e.target.value)}
                className="font-mono"
              />

              <Input
                type="time"
                label="Clock Out (WIB)"
                value={manualClockOut}
                onChange={(e) => setManualClockOut(e.target.value)}
                className="font-mono"
              />

              <Select
                label="Assigned Shift"
                value={manualShift}
                onChange={(e) => setManualShift(e.target.value)}
              >
                {SHIFTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                type="number"
                label="Overtime Hours"
                step="0.5"
                min="0"
                max="16"
                value={manualOtHours}
                onChange={(e) => setManualOtHours(Number(e.target.value))}
                className="font-mono"
              />

              <Select
                label="Overtime Approval"
                value={manualOtStatus}
                onChange={(e) => setManualOtStatus(e.target.value)}
              >
                <option value="APPROVED">APPROVED</option>
                <option value="PENDING">PENDING</option>
                <option value="REJECTED">REJECTED</option>
              </Select>

              <Select
                label="Project Allocation"
                value={manualProjectId}
                onChange={(e) => setManualProjectId(e.target.value)}
              >
                <option value="">General / Non-Project</option>
                {(projects || []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.spk_number || p.id})
                  </option>
                ))}
              </Select>
            </div>

            <Input
              type="text"
              label="Correction / Overtime Justification Note"
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              placeholder="Reason for manual entry or overtime approval..."
            />

            <div className="pt-4 border-t border-stone-200 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsManualOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSavingManual}
              >
                Save Attendance Record
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  },
);
