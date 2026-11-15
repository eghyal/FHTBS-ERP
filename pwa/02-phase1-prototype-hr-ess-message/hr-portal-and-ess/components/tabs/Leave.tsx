import React, { useState, useMemo } from "react";
import {
  CalendarDays,
  Check,
  X,
  Search,
  ShieldCheck,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import {
  ERP_DEPARTMENT_OPTIONS,
  normalizeDepartmentToRole,
} from "@/constants/rbac";

interface HrLeaveTabProps {
  leaves: any[];
  users: any[];
  currentUser: any;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onRefresh: () => void;
}

export const HrLeaveTab: React.FC<HrLeaveTabProps> = React.memo(
  ({ leaves, users, currentUser, showToast, onRefresh }) => {
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [deptFilter, setDeptFilter] = useState("ALL");
    const [searchQuery, setSearchQuery] = useState("");
    const [noteMap, setNoteMap] = useState<Record<string, string>>({});
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const currentYear = String(new Date().getFullYear());

    // Compute per-employee Annual Paid Leave used & remaining out of 12 days
    const annualQuotaMap = useMemo(() => {
      const usedMap = new Map<string, number>();
      (leaves || []).forEach((lv) => {
        if (
          lv.status === "APPROVED" &&
          (lv.leave_type === "Annual Paid Leave" || !lv.leave_type) &&
          String(lv.start_date || "").startsWith(currentYear)
        ) {
          const uKey = String(lv.employee_username || "").toLowerCase();
          const s = new Date(lv.start_date);
          const e = new Date(lv.end_date);
          const days = Math.max(
            1,
            Math.ceil(
              Math.abs(e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24),
            ) + 1,
          );
          usedMap.set(uKey, (usedMap.get(uKey) || 0) + days);
        }
      });
      return usedMap;
    }, [leaves, currentYear]);

    const filteredLeaves = useMemo(() => {
      return (leaves || []).filter((lv) => {
        if (statusFilter !== "ALL" && lv.status !== statusFilter) return false;
        if (
          deptFilter !== "ALL" &&
          normalizeDepartmentToRole(lv.employee_role) !== deptFilter
        )
          return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const mName = String(lv.employee_name || "")
            .toLowerCase()
            .includes(q);
          const mUser = String(lv.employee_username || "")
            .toLowerCase()
            .includes(q);
          if (!mName && !mUser) return false;
        }
        return true;
      });
    }, [leaves, statusFilter, deptFilter, searchQuery]);

    const pendingLeaves = useMemo(
      () => (leaves || []).filter((l) => l.status === "PENDING"),
      [leaves],
    );

    const handleLeaveDecision = async (
      id: string,
      status: "APPROVED" | "REJECTED",
    ) => {
      setUpdatingId(id);
      try {
        const res = await apiFetch(
          `/api/hr/leaves/${id}/status`,
          {
            method: "PUT",
            body: JSON.stringify({
              status,
              manager_note:
                noteMap[id] ||
                `Reviewed by @${currentUser?.username || "HR"} (${status})`,
            }),
          },
          currentUser?.username,
        );
        if (res.ok) {
          showToast(
            `Leave request ${status.toLowerCase()} and synced with Production ManPower`,
            "success",
          );
          onRefresh();
        } else {
          showToast(res.error || "Failed to update leave status", "error");
        }
      } catch (e) {
        showToast("Error updating leave status", "error");
      } finally {
        setUpdatingId(null);
      }
    };

    const countDays = (start: string, end: string) => {
      try {
        const s = new Date(start);
        const e = new Date(end);
        return Math.max(
          1,
          Math.ceil(
            Math.abs(e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1,
        );
      } catch {
        return 1;
      }
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-200">
        {/* LEFT COLUMN (5 COLS): PENDING LEAVE APPROVAL DESK */}
        <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-20">
          <div className="hris-glass-panel p-6 rounded-[28px] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#121318] tracking-tight">
                    Approval Decision Desk
                  </h3>
                  <p className="text-xs font-medium text-[#8E929F]">
                    Instant sync to PRq &amp; Shop Floor ManPower
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-extrabold tabular-nums">
                {pendingLeaves.length} Queue
              </span>
            </div>

            {pendingLeaves.length === 0 ? (
              <div className="p-8 rounded-3xl bg-white/70 border border-white text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-sm font-extrabold text-[#121318]">
                  All Leave Requests Cleared
                </p>
                <p className="text-xs text-[#8E929F]">
                  No pending employee time-off requests awaiting authorization.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
                {pendingLeaves.map((lv) => {
                  const uKey = String(
                    lv.employee_username || "",
                  ).toLowerCase();
                  const usedAnnual = annualQuotaMap.get(uKey) || 0;
                  const remAnnual = Math.max(0, 12 - usedAnnual);
                  const durationDays = countDays(lv.start_date, lv.end_date);

                  return (
                    <div
                      key={`pending-${lv.id}`}
                      className="p-4 rounded-3xl bg-white/90 border border-amber-200/80 shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                            {lv.leave_type || "Annual Paid Leave"}
                          </span>
                          <h4 className="text-sm font-extrabold text-[#121318] mt-1">
                            {lv.employee_name || lv.employee_username}
                          </h4>
                          <p className="text-[11px] font-medium text-[#8E929F]">
                            @{lv.employee_username} · {lv.employee_role || "STAFF"}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-extrabold text-[#121318] tabular-nums block">
                            {durationDays} Day(s)
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700">
                            Quota: {remAnnual}/12d left
                          </span>
                        </div>
                      </div>

                      <div className="px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200/60 text-xs font-bold text-[#32353E] flex items-center justify-between">
                        <span>Period</span>
                        <span className="tabular-nums">
                          {lv.start_date} → {lv.end_date}
                        </span>
                      </div>

                      <input
                        type="text"
                        value={noteMap[lv.id] || ""}
                        onChange={(e) =>
                          setNoteMap((prev) => ({
                            ...prev,
                            [lv.id]: e.target.value,
                          }))
                        }
                        placeholder="Add authorization note..."
                        className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-medium text-[#121318] outline-none focus:border-amber-500"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={updatingId === lv.id}
                          onClick={() => handleLeaveDecision(lv.id, "APPROVED")}
                          className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve Leave</span>
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === lv.id}
                          onClick={() => handleLeaveDecision(lv.id, "REJECTED")}
                          className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (7 COLS): 12-DAY QUOTA RING MATRIX + LEAVE LEDGER */}
        <div className="lg:col-span-7 space-y-5">
          {/* Interactive 12-Day Quota Ring Explorer */}
          <div className="hris-glass-panel p-6 rounded-[28px] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#121318] tracking-tight">
                    12-Day Annual Entitlement Matrix ({currentYear})
                  </h3>
                  <p className="text-xs font-medium text-[#8E929F]">
                    Visual balance rings · Excess days auto-deduct in PRq
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 border border-white text-[11px] font-bold text-emerald-700">
                <ShieldCheck className="w-3.5 h-3.5" />
                Payroll Synced
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
              {(users || [])
                .filter((u) => u.status !== "INACTIVE")
                .map((u) => {
                  const used =
                    annualQuotaMap.get(
                      String(u.username || "").toLowerCase(),
                    ) || 0;
                  const rem = Math.max(0, 12 - used);
                  const pct = Math.round((rem / 12) * 100);
                  return (
                    <div
                      key={u.username}
                      className="p-3.5 rounded-2xl bg-white/80 border border-white flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-extrabold text-xs text-[#121318]">
                          {u.name || u.username}
                        </div>
                        <div className="text-[10px] font-medium text-[#8E929F] truncate">
                          @{u.username} · Used {used}d
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-stone-200/70 mt-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              rem <= 2 ? "bg-rose-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div
                        className={`w-10 h-10 rounded-2xl flex flex-col items-center justify-center shrink-0 font-extrabold text-xs tabular-nums border ${
                          rem <= 2
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                        }`}
                      >
                        <span>{rem}</span>
                        <span className="text-[8px] opacity-70">/12d</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Filter & Historical Leave Timeline Feed */}
          <div className="hris-glass-panel p-5 rounded-[28px] space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#8E929F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search leave history..."
                  className="w-full h-10 pl-10 pr-4 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#121318] outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 px-3.5 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#32353E] outline-none cursor-pointer"
              >
                <option value="ALL">All Status ({leaves.length})</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>

              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="h-10 px-3.5 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#32353E] outline-none cursor-pointer"
              >
                <option value="ALL">All Divisions</option>
                {ERP_DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.value} — {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2.5">
              {filteredLeaves.length === 0 ? (
                <div className="p-10 text-center text-xs text-[#8E929F]">
                  No leave records match your filter.
                </div>
              ) : (
                filteredLeaves.map((lv) => {
                  const durationDays = countDays(lv.start_date, lv.end_date);
                  return (
                    <div
                      key={lv.id}
                      className="p-4 rounded-2xl bg-white/80 border border-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-[#121318]">
                            {lv.employee_name || lv.employee_username}
                          </span>
                          <span className="text-[11px] font-semibold text-[#8E929F]">
                            ({lv.leave_type || "Annual Paid Leave"})
                          </span>
                        </div>
                        <div className="text-xs font-medium text-[#646876] mt-0.5 tabular-nums">
                          {lv.start_date} → {lv.end_date} ·{" "}
                          <strong className="text-[#121318]">
                            {durationDays} Working Day(s)
                          </strong>
                        </div>
                        {lv.manager_note && (
                          <p className="text-[11px] text-[#8E929F] mt-1">
                            Note: {lv.manager_note}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                            lv.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : lv.status === "REJECTED"
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {lv.status || "PENDING"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
