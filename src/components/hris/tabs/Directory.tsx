import React, { useState, useMemo } from "react";
import {
  Users,
  Search,
  Plus,
  Pencil,
  UserCheck,
  UserX,
  DollarSign,
  Award,
  LayoutGrid,
  List,
  Building2,
  Sparkles,
  Factory,
  CreditCard,
  IdCard,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { formatRupiah } from "@/utils/format";
import { apiFetch } from "@/utils/api";
import {
  ERP_DEPARTMENT_OPTIONS,
  normalizeDepartmentToRole,
} from "@/constants/rbac";

interface HrDirectoryTabProps {
  users: any[];
  salaries: any[];
  kpis: any[];
  currentUser: any;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onRefresh: () => void;
}

const DEPARTMENTS = ERP_DEPARTMENT_OPTIONS.map((d) => d.value);

const LEVELS = ["STAFF", "SUPERVISOR", "MANAGER", "DIRECTOR"];

const PTKP_OPTIONS = [
  "TK/0",
  "TK/1",
  "TK/2",
  "TK/3",
  "K/0",
  "K/1",
  "K/2",
  "K/3",
];

const WORK_CENTERS = [
  { id: "", label: "Non-Production / Office" },
  { id: "WC-CUT", label: "WC-CUT — Cutting & Batching" },
  { id: "WC-FAB", label: "WC-FAB — Molding & Vibro Press" },
  { id: "WC-FIN", label: "WC-FIN — Curing & Finishing" },
  { id: "WC-ASSY", label: "WC-ASSY — Palletizing & Yard" },
  { id: "WC-QC", label: "WC-QC — Quality Control Lab" },
];

export const HrDirectoryTab: React.FC<HrDirectoryTabProps> = React.memo(
  ({ users, salaries, kpis, currentUser, showToast, onRefresh }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [deptFilter, setDeptFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [viewMode, setViewMode] = useState<"badges" | "ledger">("badges");
    const [selectedUsername, setSelectedUsername] = useState<string | null>(
      null,
    );

    // Modal state for Add / Edit Employee
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
    const [formUsername, setFormUsername] = useState("");
    const [formName, setFormName] = useState("");
    const [formPassword, setFormPassword] = useState("");
    const [formRole, setFormRole] = useState("PRODUCTION");
    const [formLevel, setFormLevel] = useState("STAFF");
    const [formStatus, setFormStatus] = useState("APPROVED");
    const [formBasicSalary, setFormBasicSalary] = useState(5000000);
    const [formAllowances, setFormAllowances] = useState(500000);
    const [formDeductions, setFormDeductions] = useState(0);
    const [formHourlyRate, setFormHourlyRate] = useState(45000);
    const [formEmployeeNo, setFormEmployeeNo] = useState("");
    const [formContractType, setFormContractType] = useState("PKWT");
    const [formJoinDate, setFormJoinDate] = useState("");
    const [formContractEndDate, setFormContractEndDate] = useState("");
    const [formNikKtp, setFormNikKtp] = useState("");
    const [formNpwp, setFormNpwp] = useState("");
    const [formPtkp, setFormPtkp] = useState("TK/0");
    const [formBankName, setFormBankName] = useState("");
    const [formBankAccount, setFormBankAccount] = useState("");
    const [formWorkCenterId, setFormWorkCenterId] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const salaryMap = useMemo(() => {
      const m = new Map<string, any>();
      (salaries || []).forEach((s) => {
        if (s.employee_username) {
          m.set(String(s.employee_username).toLowerCase(), s);
        }
      });
      return m;
    }, [salaries]);

    const kpiMap = useMemo(() => {
      const m = new Map<string, number>();
      (kpis || []).forEach((k) => {
        const u = String(k.employee_username || "").toLowerCase();
        const score = Number(k.overall_score || 0);
        if (!m.has(u) || score > (m.get(u) || 0)) {
          m.set(u, score);
        }
      });
      return m;
    }, [kpis]);

    // Division headcount breakdown for Left Navigator Rail
    const divisionCounts = useMemo(() => {
      const counts: Record<string, number> = { ALL: (users || []).length };
      DEPARTMENTS.forEach((d) => {
        counts[d] = 0;
      });
      (users || []).forEach((u) => {
        const r = normalizeDepartmentToRole(u.role || "PRODUCTION");
        counts[r] = (counts[r] || 0) + 1;
      });
      return counts;
    }, [users]);

    const filteredUsers = useMemo(() => {
      return (users || []).filter((u) => {
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !q ||
          String(u.name || "")
            .toLowerCase()
            .includes(q) ||
          String(u.username || "")
            .toLowerCase()
            .includes(q) ||
          String(u.employee_no || "")
            .toLowerCase()
            .includes(q) ||
          String(u.role || "")
            .toLowerCase()
            .includes(q);

        const matchesDept =
          deptFilter === "ALL" ||
          normalizeDepartmentToRole(u.role) === deptFilter;
        const empStatus = u.status || "APPROVED";
        const matchesStatus =
          statusFilter === "ALL" ||
          (statusFilter === "APPROVED" &&
            (empStatus === "APPROVED" || empStatus === "ACTIVE")) ||
          (statusFilter === "INACTIVE" && empStatus === "INACTIVE");

        return matchesQuery && matchesDept && matchesStatus;
      });
    }, [users, searchQuery, deptFilter, statusFilter]);

    const spotlightEmployee = useMemo(() => {
      if (selectedUsername) {
        const found = filteredUsers.find(
          (u) =>
            String(u.username).toLowerCase() === selectedUsername.toLowerCase(),
        );
        if (found) return found;
      }
      return filteredUsers[0] || null;
    }, [filteredUsers, selectedUsername]);

    const handleOpenAdd = () => {
      setEditingEmployee(null);
      setFormUsername("");
      setFormName("");
      setFormPassword("paving123");
      setFormRole("PRODUCTION");
      setFormLevel("STAFF");
      setFormStatus("APPROVED");
      setFormBasicSalary(5000000);
      setFormAllowances(500000);
      setFormDeductions(0);
      setFormHourlyRate(Math.round(5000000 / 173));
      setFormEmployeeNo("");
      setFormContractType("PKWT");
      setFormJoinDate(new Date().toISOString().split("T")[0]);
      setFormContractEndDate("");
      setFormNikKtp("");
      setFormNpwp("");
      setFormPtkp("TK/0");
      setFormBankName("");
      setFormBankAccount("");
      setFormWorkCenterId("WC-FAB");
      setIsModalOpen(true);
    };

    const handleOpenEdit = (emp: any) => {
      const sal = salaryMap.get(String(emp.username || "").toLowerCase());
      setEditingEmployee(emp);
      setFormUsername(emp.username || "");
      setFormName(emp.name || emp.username || "");
      setFormPassword("");
      setFormRole(normalizeDepartmentToRole(emp.role || "PRODUCTION"));
      setFormLevel(emp.level || "STAFF");
      setFormStatus(emp.status === "INACTIVE" ? "INACTIVE" : "APPROVED");
      const baseSal = Number(sal?.basic_salary || 5000000);
      setFormBasicSalary(baseSal);
      setFormAllowances(Number(sal?.allowances || 0));
      setFormDeductions(Number(sal?.deductions || 0));
      setFormHourlyRate(Math.round(baseSal / 173) || 45000);
      setFormEmployeeNo(emp.employee_no || "");
      setFormContractType(emp.contract_type || "PKWT");
      setFormJoinDate(emp.join_date || new Date().toISOString().split("T")[0]);
      setFormContractEndDate(emp.contract_end_date || "");
      setFormNikKtp(emp.nik_ktp || "");
      setFormNpwp(emp.npwp || "");
      setFormPtkp(emp.ptkp_status || sal?.ptkp_status || "TK/0");
      setFormBankName(emp.bank_name || sal?.bank_name || "");
      setFormBankAccount(
        emp.bank_account_number || sal?.bank_account_number || "",
      );
      setFormWorkCenterId(emp.work_center_id || "");
      setIsModalOpen(true);
    };

    const handleSaveEmployee = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formName.trim() || (!editingEmployee && !formUsername.trim())) {
        showToast("Employee name and username are required", "error");
        return;
      }

      setIsSaving(true);
      try {
        const endpoint = editingEmployee
          ? `/api/hr/directory/${editingEmployee.id || editingEmployee.username}`
          : "/api/hr/directory";
        const method = editingEmployee ? "PUT" : "POST";

        const res = await apiFetch(
          endpoint,
          {
            method,
            body: JSON.stringify({
              username: formUsername.trim().toLowerCase(),
              name: formName.trim(),
              password: formPassword || undefined,
              role: formRole,
              level: formLevel,
              status: formStatus,
              basic_salary: formBasicSalary,
              allowances: formAllowances,
              deductions: formDeductions,
              hourly_rate: formHourlyRate,
              employee_no: formEmployeeNo.trim() || undefined,
              contract_type: formContractType,
              join_date: formJoinDate || undefined,
              contract_end_date: formContractEndDate || null,
              nik_ktp: formNikKtp.trim() || null,
              npwp: formNpwp.trim() || null,
              ptkp_status: formPtkp,
              bank_name: formBankName.trim() || null,
              bank_account_number: formBankAccount.trim() || null,
              work_center_id: formWorkCenterId || null,
            }),
          },
          currentUser?.username,
        );

        if (res.ok) {
          showToast(
            editingEmployee
              ? `Updated profile, legal identity & salary for ${formName}`
              : `Onboarded ${formName} (@${formUsername}) to active directory`,
            "success",
          );
          setIsModalOpen(false);
          onRefresh();
        } else {
          showToast(res.error || "Failed to save employee profile", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Network error while saving employee profile", "error");
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-200">
        {/* LEFT COLUMN (4 COLS): DIVISION NAVIGATOR RAIL + LIVE DOSSIER SPOTLIGHT */}
        <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-20">
          {/* Division Tree Navigator */}
          <div className="hris-glass-panel p-5 rounded-[28px] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#121318] tracking-tight">
                    Organization Units
                  </h3>
                  <p className="text-[11px] font-medium text-[#8E929F]">
                    Select a division to filter roster
                  </p>
                </div>
              </div>
              <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60 tabular-nums">
                {users.length} Total
              </span>
            </div>

            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
              <button
                type="button"
                onClick={() => setDeptFilter("ALL")}
                className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                  deptFilter === "ALL"
                    ? "bg-[#121318] text-white shadow-md"
                    : "bg-white/70 hover:bg-white text-[#32353E] border border-white"
                }`}
              >
                <span>All Organization Units</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums ${
                    deptFilter === "ALL"
                      ? "bg-white/20 text-white"
                      : "bg-stone-100 text-[#646876]"
                  }`}
                >
                  {divisionCounts.ALL}
                </span>
              </button>

              {DEPARTMENTS.map((dept) => {
                const count = divisionCounts[dept] || 0;
                const pct =
                  users.length > 0
                    ? Math.round((count / users.length) * 100)
                    : 0;
                const isActive = deptFilter === dept;
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => setDeptFilter(dept)}
                    className={`w-full px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer flex flex-col gap-1.5 ${
                      isActive
                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
                        : "bg-white/65 hover:bg-white text-[#32353E] border border-white"
                    }`}
                  >
                    <div className="w-full flex items-center justify-between">
                      <span className="tracking-tight">{dept}</span>
                      <span
                        className={`text-[10px] font-extrabold tabular-nums ${
                          isActive ? "text-white/90" : "text-[#8E929F]"
                        }`}
                      >
                        {count} staff ({pct}%)
                      </span>
                    </div>
                    <div
                      className={`w-full h-1 rounded-full overflow-hidden ${
                        isActive ? "bg-white/25" : "bg-stone-200/70"
                      }`}
                    >
                      <div
                        className={`h-full rounded-full ${
                          isActive ? "bg-white" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Employee Spotlight Dossier */}
          {spotlightEmployee && (
            <div className="hris-glass-panel p-6 rounded-[28px] relative overflow-hidden space-y-4">
              <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-emerald-300/20 dark:bg-emerald-400/32 blur-2xl pointer-events-none" />
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60">
                  <Sparkles className="w-3 h-3" />
                  Personnel Dossier Spotlight
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    spotlightEmployee.status === "INACTIVE"
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  }`}
                >
                  {spotlightEmployee.status === "INACTIVE"
                    ? "INACTIVE"
                    : "ACTIVE"}
                </span>
              </div>

              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1E2028] to-[#121318] text-white font-extrabold text-lg flex items-center justify-center uppercase shadow-lg shrink-0">
                  {String(
                    spotlightEmployee.name || spotlightEmployee.username || "U",
                  ).slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {spotlightEmployee.employee_no && (
                      <span className="px-2 py-0.5 rounded bg-stone-900 text-white font-mono text-[10px] font-bold">
                        {spotlightEmployee.employee_no}
                      </span>
                    )}
                    {spotlightEmployee.contract_type && (
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold">
                        {spotlightEmployee.contract_type}
                      </span>
                    )}
                  </div>
                  <h4 className="text-lg font-extrabold text-[#121318] tracking-tight truncate mt-0.5">
                    {spotlightEmployee.name || spotlightEmployee.username}
                  </h4>
                  <p className="text-xs font-medium text-[#646876]">
                    @{spotlightEmployee.username} ·{" "}
                    <strong className="text-[#121318]">
                      {spotlightEmployee.role || "STAFF"}
                    </strong>{" "}
                    ({spotlightEmployee.level || "STAFF"})
                  </p>
                </div>
              </div>

              {(() => {
                const uKey = String(
                  spotlightEmployee.username || "",
                ).toLowerCase();
                const sal = salaryMap.get(uKey);
                const kpiScore = kpiMap.get(uKey);
                const base = Number(sal?.basic_salary || 0);
                const allow = Number(sal?.allowances || 0);
                const hrRate = Math.round(base / 173);
                const ptkp =
                  spotlightEmployee.ptkp_status || sal?.ptkp_status || "TK/0";
                const bankName =
                  spotlightEmployee.bank_name || sal?.bank_name || "";
                const bankAcc =
                  spotlightEmployee.bank_account_number ||
                  sal?.bank_account_number ||
                  "";
                return (
                  <div className="space-y-2.5 pt-1">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-2xl bg-white/80 border border-white">
                        <span className="text-[10px] font-bold uppercase text-[#8E929F] block">
                          Base Salary
                        </span>
                        <span className="text-xs font-extrabold text-[#121318] tabular-nums mt-0.5 block">
                          {base > 0 ? formatRupiah(base) : "Not Set"}
                        </span>
                      </div>
                      <div className="p-3 rounded-2xl bg-white/80 border border-white">
                        <span className="text-[10px] font-bold uppercase text-[#8E929F] block">
                          Fixed Allowances
                        </span>
                        <span className="text-xs font-extrabold text-[#121318] tabular-nums mt-0.5 block">
                          {allow > 0 ? formatRupiah(allow) : "Rp 0"}
                        </span>
                      </div>
                      <div className="p-3 rounded-2xl bg-white/80 border border-white">
                        <span className="text-[10px] font-bold uppercase text-[#8E929F] block">
                          Shop Floor Rate
                        </span>
                        <span className="text-xs font-extrabold text-emerald-700 tabular-nums mt-0.5 block">
                          {hrRate > 0 ? `${formatRupiah(hrRate)}/hr` : "-"}
                        </span>
                      </div>
                      <div className="p-3 rounded-2xl bg-white/80 border border-white">
                        <span className="text-[10px] font-bold uppercase text-[#8E929F] block">
                          360° KPI Rating
                        </span>
                        <span className="text-xs font-extrabold text-amber-600 tabular-nums mt-0.5 flex items-center gap-1">
                          <Award className="w-3.5 h-3.5" />
                          {kpiScore !== undefined
                            ? `${Number(kpiScore).toFixed(1)} / 5.0`
                            : "Unrated"}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-white/85 border border-white space-y-1 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-[#8E929F] font-semibold">
                          Tax Status / National ID:
                        </span>
                        <span className="font-mono font-bold text-[#121318]">
                          {ptkp} • {spotlightEmployee.nik_ktp || "No ID"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#8E929F] font-semibold">
                          Payroll Bank:
                        </span>
                        <span className="font-mono font-bold text-[#121318]">
                          {bankName || bankAcc
                            ? `${bankName} ${bankAcc}`.trim()
                            : "Not Set"}
                        </span>
                      </div>
                      {spotlightEmployee.work_center_id && (
                        <div className="flex items-center justify-between">
                          <span className="text-[#8E929F] font-semibold">
                            Work Center:
                          </span>
                          <span className="font-mono font-extrabold text-teal-700">
                            {spotlightEmployee.work_center_id}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              <button
                type="button"
                onClick={() => handleOpenEdit(spotlightEmployee)}
                className="w-full py-2.5 px-4 rounded-2xl bg-[#121318] hover:bg-[#1E2028] text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Pencil className="w-3.5 h-3.5 text-emerald-400" />
                <span>Configure Compensation, Identity &amp; Access</span>
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (8 COLS): WORKFORCE ROSTER STUDIO (BADGES OR LEDGER) */}
        <div className="lg:col-span-8 space-y-5">
          {/* Top Search, Status & View Mode Bar */}
          <div className="hris-glass-panel p-4 rounded-[28px] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#8E929F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search staff by Employee ID, name, @username, or division..."
                  className="w-full h-10 pl-10 pr-4 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#121318] outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 px-3.5 bg-white/85 border border-white rounded-2xl text-xs font-bold text-[#32353E] outline-none cursor-pointer shrink-0"
              >
                <option value="ALL">All Status</option>
                <option value="APPROVED">Active Only</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center p-1 rounded-2xl bg-stone-200/60 border border-white">
                <button
                  type="button"
                  onClick={() => setViewMode("badges")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === "badges"
                      ? "bg-white text-[#121318] shadow-2xs"
                      : "text-[#646876]"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>ID Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("ledger")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    viewMode === "ledger"
                      ? "bg-white text-[#121318] shadow-2xs"
                      : "text-[#646876]"
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Salary Ledger</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleOpenAdd}
                className="h-10 px-4 bg-[#F25730] hover:bg-[#e04720] text-white text-xs font-bold rounded-2xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Staff</span>
              </button>
            </div>
          </div>

          {/* Roster Content */}
          {filteredUsers.length === 0 ? (
            <div className="hris-glass-panel p-14 rounded-[28px] text-center">
              <Users className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-sm font-extrabold text-[#121318]">
                No employees match the current filter.
              </p>
              <p className="text-xs text-[#8E929F] mt-1">
                Select another division on the left rail or clear your search query.
              </p>
            </div>
          ) : viewMode === "badges" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredUsers.map((emp) => {
                const uKey = String(emp.username || "").toLowerCase();
                const sal = salaryMap.get(uKey);
                const kpiScore = kpiMap.get(uKey);
                const isInactive = emp.status === "INACTIVE";
                const isSelected =
                  spotlightEmployee?.username === emp.username;

                return (
                  <div
                    key={emp.id || emp.username}
                    onClick={() => setSelectedUsername(emp.username)}
                    className={`hris-glass-card p-5 rounded-[26px] transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "ring-2 ring-emerald-500/70 bg-white/95"
                        : ""
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 border border-emerald-300/40 text-emerald-800 font-extrabold text-sm flex items-center justify-center uppercase shrink-0">
                            {String(emp.name || emp.username || "U").slice(
                              0,
                              2,
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              {emp.employee_no && (
                                <span className="text-[10px] font-mono font-bold text-stone-500">
                                  {emp.employee_no}
                                </span>
                              )}
                              {emp.contract_type && (
                                <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[9px] font-extrabold">
                                  {emp.contract_type}
                                </span>
                              )}
                            </div>
                            <h4 className="text-base font-extrabold text-[#121318] tracking-tight leading-snug">
                              {emp.name || emp.username}
                            </h4>
                            <p className="text-xs font-medium text-[#8E929F]">
                              @{emp.username} · {emp.level || "STAFF"}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                            isInactive
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {isInactive ? (
                            <span className="inline-flex items-center gap-1">
                              <UserX className="w-3 h-3" /> Off
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <UserCheck className="w-3 h-3" /> Active
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-stone-200/50 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-[10px] font-semibold text-[#8E929F] block">
                            Division &amp; Base Comp
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-[#121318] font-bold text-[11px]">
                              {emp.role || "STAFF"}
                            </span>
                            {emp.work_center_id && (
                              <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 font-mono text-[10px] font-bold">
                                {emp.work_center_id}
                              </span>
                            )}
                            <span className="font-extrabold text-[#121318] tabular-nums">
                              {sal?.basic_salary
                                ? formatRupiah(sal.basic_salary)
                                : "Unset"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {kpiScore !== undefined && (
                            <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60 font-extrabold text-xs tabular-nums flex items-center gap-1">
                              <Award className="w-3 h-3" />
                              {Number(kpiScore).toFixed(1)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(emp);
                            }}
                            className="p-2 rounded-xl bg-stone-100 hover:bg-[#121318] text-[#32353E] hover:text-white transition-colors cursor-pointer"
                            title="Edit Profile & Salary"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="hris-glass-panel rounded-[28px] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-white/60 border-b border-stone-200/70 text-[10px] font-extrabold uppercase tracking-wider text-[#646876]">
                      <th className="py-3.5 px-4">Personnel &amp; ID</th>
                      <th className="py-3.5 px-4">Division &amp; Contract</th>
                      <th className="py-3.5 px-4 text-right">Base Salary</th>
                      <th className="py-3.5 px-4 text-right">Allowances</th>
                      <th className="py-3.5 px-4 text-center">KPI</th>
                      <th className="py-3.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/50">
                    {filteredUsers.map((emp) => {
                      const uKey = String(emp.username || "").toLowerCase();
                      const sal = salaryMap.get(uKey);
                      const kpiScore = kpiMap.get(uKey);
                      return (
                        <tr
                          key={emp.id || emp.username}
                          onClick={() => setSelectedUsername(emp.username)}
                          className="hover:bg-white/80 transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-extrabold text-[#121318]">
                              {emp.name || emp.username}
                            </div>
                            <div className="text-[11px] text-[#8E929F] font-mono">
                              {emp.employee_no ? `${emp.employee_no} · ` : ""}@
                              {emp.username}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-0.5 rounded-lg bg-stone-100 font-bold text-[#121318] text-[11px]">
                              {emp.role || "STAFF"}
                            </span>
                            <span className="ml-1.5 text-[11px] text-[#646876] font-semibold">
                              {emp.contract_type || emp.level || "STAFF"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-extrabold text-[#121318] tabular-nums">
                            {sal?.basic_salary
                              ? formatRupiah(sal.basic_salary)
                              : "-"}
                          </td>
                          <td className="py-3.5 px-4 text-right font-semibold text-[#646876] tabular-nums">
                            {sal?.allowances
                              ? formatRupiah(sal.allowances)
                              : "Rp 0"}
                          </td>
                          <td className="py-3.5 px-4 text-center font-extrabold text-amber-600 tabular-nums">
                            {kpiScore !== undefined
                              ? `${Number(kpiScore).toFixed(1)}★`
                              : "-"}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(emp);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-[#121318] text-[#121318] hover:text-white font-bold text-[11px] transition-colors cursor-pointer"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ADD / EDIT EMPLOYEE PROFILE MODAL */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          uiTheme="hris"
          title={
            editingEmployee
              ? `Edit Employee Profile — @${editingEmployee.username}`
              : "Onboard New Employee to Directory"
          }
          description="Changes automatically synchronize across User Accounts, Legal/Tax Identity, Payroll Salary Master, and Shop Floor ManPower."
          maxWidth="xl"
        >
          <form
            onSubmit={handleSaveEmployee}
            className="space-y-4 text-left font-bold"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">
                  Username / Login ID
                </label>
                <Input
                  type="text"
                  required
                  disabled={Boolean(editingEmployee)}
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="e.g. budi.santoso"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono text-stone-800 disabled:opacity-60 outline-none focus:border-stone-800"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">
                  Full Legal Name
                </label>
                <Input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Budi Santoso"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 outline-none focus:border-stone-800"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">
                  Employee ID
                </label>
                <Input
                  type="text"
                  value={formEmployeeNo}
                  onChange={(e) => setFormEmployeeNo(e.target.value)}
                  placeholder="Auto: EMP-YYYY-XXXX"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono text-stone-800 outline-none focus:border-stone-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">
                  Department / Role
                </label>
                <Select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 outline-none focus:border-stone-800"
                >
                  {ERP_DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.value} — {d.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">
                  Hierarchy Level
                </label>
                <Select
                  value={formLevel}
                  onChange={(e) => setFormLevel(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 outline-none focus:border-stone-800"
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">
                  Employment Status
                </label>
                <Select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 outline-none focus:border-stone-800"
                >
                  <option value="APPROVED">ACTIVE (Approved)</option>
                  <option value="INACTIVE">INACTIVE (Offboarded)</option>
                </Select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">
                  <Factory className="w-3 h-3 inline mr-1" />
                  Work Center
                </label>
                <Select
                  value={formWorkCenterId}
                  onChange={(e) => setFormWorkCenterId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 outline-none focus:border-stone-800"
                >
                  {WORK_CENTERS.map((wc) => (
                    <option key={wc.id} value={wc.id}>
                      {wc.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Contract & Identity */}
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-stone-800">
                <IdCard className="w-4 h-4 text-stone-700" />
                <span>Contract Tenure, Legal Identity &amp; Tax Status</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    Contract Scheme
                  </label>
                  <Select
                    value={formContractType}
                    onChange={(e) => setFormContractType(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-800"
                  >
                    <option value="PKWT">Fixed-Term Contract</option>
                    <option value="PKWTT">Permanent</option>
                    <option value="PROBATION">Probation</option>
                    <option value="HARIAN_LEPAS">Daily Worker</option>
                  </Select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    Effective Join Date
                  </label>
                  <Input
                    type="date"
                    value={formJoinDate}
                    onChange={(e) => setFormJoinDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-mono text-stone-800"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    Contract End Date
                  </label>
                  <Input
                    type="date"
                    value={formContractEndDate}
                    onChange={(e) => setFormContractEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-mono text-stone-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    National ID (16 Digits)
                  </label>
                  <Input
                    type="text"
                    value={formNikKtp}
                    onChange={(e) => setFormNikKtp(e.target.value)}
                    placeholder="3510xxxxxxxxxxxx"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-mono text-stone-800"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    Tax ID
                  </label>
                  <Input
                    type="text"
                    value={formNpwp}
                    onChange={(e) => setFormNpwp(e.target.value)}
                    placeholder="Tax ID"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-mono text-stone-800"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    Tax-Free Threshold (Income Tax)
                  </label>
                  <Select
                    value={formPtkp}
                    onChange={(e) => setFormPtkp(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-800"
                  >
                    {PTKP_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            {/* Master Compensation & Bank */}
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-stone-800">
                <DollarSign className="w-4 h-4 text-stone-700" />
                <span>Master Compensation, Shop Floor Rate &amp; Payroll Bank</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    Basic Monthly Salary
                  </label>
                  <CurrencyInput
                    value={formBasicSalary}
                    onChange={(val) => {
                      setFormBasicSalary(val);
                      setFormHourlyRate(Math.round(val / 173) || 45000);
                    }}
                    prefix="Rp "
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    Fixed Allowances
                  </label>
                  <CurrencyInput
                    value={formAllowances}
                    onChange={(val) => setFormAllowances(val)}
                    prefix="Rp "
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    Shop Floor Hourly Rate
                  </label>
                  <CurrencyInput
                    value={formHourlyRate}
                    onChange={(val) => setFormHourlyRate(val)}
                    prefix="Rp "
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    <CreditCard className="w-3 h-3 inline mr-1" />
                    Payroll Bank Name
                  </label>
                  <Input
                    type="text"
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    placeholder="BCA / Mandiri / BRI"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-800"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-stone-500 block mb-1">
                    Bank Account Number
                  </label>
                  <Input
                    type="text"
                    value={formBankAccount}
                    onChange={(e) => setFormBankAccount(e.target.value)}
                    placeholder="Account number"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-mono text-stone-800"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-stone-500 block mb-1">
                {editingEmployee
                  ? "Reset Password (Optional - leave blank to keep current)"
                  : "Initial Login Password"}
              </label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={
                  editingEmployee
                    ? "Leave blank to keep unchanged"
                    : "Default: paving123"
                }
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 outline-none focus:border-stone-800"
              />
            </div>

            <div className="pt-4 border-t border-stone-200 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSaving}
                className="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-xs disabled:opacity-50"
              >
                {isSaving
                  ? "Saving..."
                  : editingEmployee
                    ? "Save Profile Changes"
                    : "Create & Onboard Employee"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  },
);
