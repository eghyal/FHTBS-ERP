import React, { useState, useMemo } from "react";
import {
  DollarSign,
  Plus,
  FileText,
  Printer,
  Eye,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Save,
  ShieldCheck,
  ReceiptText,
} from "lucide-react";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { formatRupiah } from "@/utils/format";
import {
  printOfficialPayslip,
  printPrqSummaryReport,
} from "@/utils/hrDocuments";

interface HrPayrollTabProps {
  users: any[];
  salaries: any[];
  payslips: any[];
  payrollRequisitions: any[];
  prqMonth: number;
  setPrqMonth: (m: number) => void;
  prqYear: number;
  setPrqYear: (y: number) => void;
  handleOpenPreparePrq: () => void;
  handleEditDraftPrq: (prq: any) => void;
  handleViewPrqDetails: (prq: any) => void;
  handleSaveSalary: (
    username: string,
    basic: number,
    allowances: number,
    deductions: number,
  ) => Promise<void>;
  handleGenerateAdhocPayslip: (
    username: string,
    period: string,
    basic: number,
    allowances: number,
    deductions: number,
  ) => Promise<void>;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const HrPayrollTab: React.FC<HrPayrollTabProps> = React.memo(
  ({
    users,
    salaries,
    payslips,
    payrollRequisitions,
    prqMonth,
    setPrqMonth,
    prqYear,
    setPrqYear,
    handleOpenPreparePrq,
    handleEditDraftPrq,
    handleViewPrqDetails,
    handleSaveSalary,
    handleGenerateAdhocPayslip,
  }) => {
    const [subTab, setSubTab] = useState<
      "PRQ_HUB" | "SALARY_MASTER" | "PAYSLIP_ARCHIVE"
    >("PRQ_HUB");
    const [windowOverride, setWindowOverride] = useState(true);

    // Salary editing local state
    const [salaryDrafts, setSalaryDrafts] = useState<
      Record<
        string,
        { basic_salary: number; allowances: number; deductions: number }
      >
    >({});
    const [savingUser, setSavingUser] = useState<string | null>(null);

    // Ad-hoc payslip form
    const [adhocUser, setAdhocUser] = useState("");
    const [adhocPeriod, setAdhocPeriod] = useState(
      () => `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`,
    );
    const [adhocBasic, setAdhocBasic] = useState(5000000);
    const [adhocAllow, setAdhocAllow] = useState(500000);
    const [adhocDed, setAdhocDed] = useState(150000);
    const [isGeneratingAdhoc, setIsGeneratingAdhoc] = useState(false);

    const todayDayOfMonth = new Date().getDate();
    const isStandardClosingWindow =
      todayDayOfMonth >= 15 && todayDayOfMonth <= 24;
    const canPreparePrq = isStandardClosingWindow || windowOverride;

    const salaryMap = useMemo(() => {
      const m = new Map<string, any>();
      (salaries || []).forEach((s) => {
        if (s.employee_username) {
          m.set(String(s.employee_username).toLowerCase(), s);
        }
      });
      return m;
    }, [salaries]);

    const activeUsers = useMemo(
      () => (users || []).filter((u) => u.status !== "INACTIVE"),
      [users],
    );

    const getDraftForUser = (username: string) => {
      const key = username.toLowerCase();
      if (salaryDrafts[key]) return salaryDrafts[key];
      const existing = salaryMap.get(key);
      return {
        basic_salary: Number(existing?.basic_salary || 0),
        allowances: Number(existing?.allowances || 0),
        deductions: Number(existing?.deductions || 0),
      };
    };

    const updateDraftField = (
      username: string,
      field: "basic_salary" | "allowances" | "deductions",
      val: number,
    ) => {
      const key = username.toLowerCase();
      const cur = getDraftForUser(username);
      setSalaryDrafts((prev) => ({
        ...prev,
        [key]: { ...cur, [field]: val },
      }));
    };

    const onSaveRow = async (username: string) => {
      const d = getDraftForUser(username);
      setSavingUser(username);
      try {
        await handleSaveSalary(
          username,
          d.basic_salary,
          d.allowances,
          d.deductions,
        );
      } finally {
        setSavingUser(null);
      }
    };

    const onSubmitAdhoc = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!adhocUser) return;
      setIsGeneratingAdhoc(true);
      try {
        await handleGenerateAdhocPayslip(
          adhocUser,
          adhocPeriod,
          adhocBasic,
          adhocAllow,
          adhocDed,
        );
      } finally {
        setIsGeneratingAdhoc(false);
      }
    };

    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        {/* SUB-NAVIGATION TABS */}
        <div className="bg-white p-2.5 rounded-2xl border border-stone-200/80 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSubTab("PRQ_HUB")}
              className={`h-10 px-4 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                subTab === "PRQ_HUB"
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Payroll Requisition (PRq) Hub</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab("SALARY_MASTER")}
              className={`h-10 px-4 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                subTab === "SALARY_MASTER"
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Employee Salary Master ({activeUsers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab("PAYSLIP_ARCHIVE")}
              className={`h-10 px-4 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                subTab === "PAYSLIP_ARCHIVE"
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <ReceiptText className="w-3.5 h-3.5" />
              <span>Published Payslips ({payslips.length})</span>
            </button>
          </div>

          <div className="h-10 flex items-center justify-between sm:justify-start gap-2.5 px-3.5 bg-stone-50 rounded-xl border border-stone-200 text-xs font-bold text-stone-700 shrink-0">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-stone-800" />
              <span>HR Closing Override:</span>
            </div>
            <button
              type="button"
              onClick={() => setWindowOverride((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-colors ${
                windowOverride
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-stone-200 text-stone-600"
              }`}
            >
              {windowOverride ? "ENABLED" : "STANDARD (15th-24th)"}
            </button>
          </div>
        </div>

        {/* SUB-TAB 1: PRQ HUB */}
        {subTab === "PRQ_HUB" && (
          <div className="space-y-5">
            <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200 text-stone-800 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-extrabold text-stone-900 leading-tight">
                      Monthly Payroll Requisition (PRq) Generator
                    </h3>
                    <span className="px-2 py-0.5 bg-stone-100 text-stone-800 border border-stone-200 rounded-md text-[10px] font-black uppercase tracking-wider">
                      HR → Finance
                    </span>
                  </div>
                  <p className="text-xs font-medium text-stone-500 mt-0.5">
                    {!canPreparePrq
                      ? "Standard closing window is 15th–24th. Enable HR Override above to prepare PRq today."
                      : "Auto-syncs Attendance, Certified Overtime, Leave Deductions & Income Tax/Social Security"}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                <select
                  value={prqMonth}
                  onChange={(e) => setPrqMonth(Number(e.target.value))}
                  className="w-full sm:w-40 h-10 px-3.5 py-0 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 outline-none shrink-0 cursor-pointer"
                >
                  {MONTHS.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  value={prqYear}
                  onChange={(e) => setPrqYear(Number(e.target.value))}
                  className="w-full sm:w-28 h-10 px-3.5 py-0 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-800 outline-none shrink-0 cursor-pointer"
                >
                  {[2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!canPreparePrq}
                  onClick={handleOpenPreparePrq}
                  className="h-10 px-5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-2xs disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Prepare PRq Matrix</span>
                </button>
              </div>
            </div>

            {/* PRQ DOCUMENTS TABLE */}
            <div className="bg-white rounded-2xl border border-stone-200/80 shadow-2xs overflow-hidden">
              <div className="px-6 py-4 border-b border-stone-200 flex justify-between items-center bg-stone-50/60">
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-700">
                  Submitted & Draft Payroll Requisitions ({payrollRequisitions.length})
                </h4>
                <span className="text-[11px] font-bold text-stone-400">
                  Approved PRqs convert directly into Finance Disbursement Orders (PDV) & GL Journals
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-bold">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-[10px] font-black uppercase tracking-wider text-stone-500">
                      <th className="py-3.5 px-5">Requisition No</th>
                      <th className="py-3.5 px-4">Period</th>
                      <th className="py-3.5 px-4 text-right">Gross Payroll</th>
                      <th className="py-3.5 px-4 text-right">Deductions</th>
                      <th className="py-3.5 px-4 text-right">Net Disbursement</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {payrollRequisitions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-stone-400">
                          No Payroll Requisition (PRq) documents created yet. Click "Prepare PRq Matrix" to begin.
                        </td>
                      </tr>
                    ) : (
                      payrollRequisitions.map((prq) => {
                        const reqNo =
                          prq.requisition_number || prq.requisition_no || prq.id;
                        const netAmount =
                          prq.total_net ?? prq.total_net_pay ?? 0;
                        return (
                          <tr
                            key={prq.id}
                            className="hover:bg-stone-50/70 transition-colors"
                          >
                            <td className="py-3.5 px-5 font-mono tabular-nums font-black text-stone-900">
                              {reqNo}
                              <div className="text-[10px] text-stone-400 font-sans font-semibold">
                                By: @{prq.submitted_by || prq.prepared_by || "HR"}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 font-extrabold text-stone-800">
                              {prq.period_name ||
                                `${prq.period_month}/${prq.period_year}`}
                            </td>

                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-stone-800">
                              {formatRupiah(prq.total_gross || 0)}
                            </td>

                            <td className="py-3.5 px-4 text-right font-mono tabular-nums text-rose-600">
                              -{formatRupiah(prq.total_deductions || 0)}
                            </td>

                            <td className="py-3.5 px-4 text-right font-mono tabular-nums font-black text-emerald-700">
                              {formatRupiah(netAmount)}
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <span
                                className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                  prq.status === "CONVERTED"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : prq.status === "SUBMITTED"
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : prq.status === "REJECTED" ||
                                          prq.status === "CANCELLED"
                                        ? "bg-rose-50 text-rose-700 border-rose-200"
                                        : "bg-amber-50 text-amber-800 border-amber-200"
                                }`}
                              >
                                {prq.status}
                              </span>
                            </td>

                            <td className="py-3.5 px-5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleViewPrqDetails(prq)}
                                  className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Details</span>
                                </button>

                                {(prq.status === "DRAFT" ||
                                  prq.status === "REJECTED") && (
                                  <button
                                    type="button"
                                    onClick={() => handleEditDraftPrq(prq)}
                                    className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    <span>Edit</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={async () => {
                                    let details = prq.details;
                                    if (!details && prq.details_json) {
                                      try {
                                        details = JSON.parse(prq.details_json);
                                      } catch {
                                        details = [];
                                      }
                                    }
                                    printPrqSummaryReport({ ...prq, details });
                                  }}
                                  className="px-2.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  <span>PDF</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: EMPLOYEE SALARY MASTER */}
        {subTab === "SALARY_MASTER" && (
          <div className="bg-white rounded-2xl border border-stone-200/80 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-200 bg-stone-50/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h4 className="text-sm font-extrabold text-stone-900">
                  Master Employee Compensation Registry
                </h4>
                <p className="text-xs text-stone-500 font-medium">
                  Configure base salaries, fixed allowances, and recurring deductions used by the PRq engine.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-bold">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-[10px] font-black uppercase tracking-wider text-stone-500">
                    <th className="py-3.5 px-5">Employee</th>
                    <th className="py-3.5 px-4">Division & Rank</th>
                    <th className="py-3.5 px-4 min-w-[180px]">Basic Salary (IDR)</th>
                    <th className="py-3.5 px-4 min-w-[180px]">Fixed Allowances (IDR)</th>
                    <th className="py-3.5 px-4 min-w-[180px]">Fixed Deductions (IDR)</th>
                    <th className="py-3.5 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-700">
                  {activeUsers.map((u) => {
                    const draft = getDraftForUser(u.username);
                    return (
                      <tr
                        key={u.username}
                        className="hover:bg-stone-50/60 transition-colors"
                      >
                        <td className="py-3 px-5">
                          <div className="font-extrabold text-stone-900">
                            {u.name || u.username}
                          </div>
                          <div className="text-[10px] font-mono text-stone-400">
                            @{u.username}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 bg-stone-100 text-stone-800 rounded text-[10px] font-black">
                            {u.role || "STAFF"}
                          </span>
                          <span className="text-[10px] text-stone-400 ml-1.5">
                            • {u.level || "STAFF"}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <CurrencyInput
                            value={draft.basic_salary}
                            onChange={(val) =>
                              updateDraftField(u.username, "basic_salary", val)
                            }
                            prefix="Rp "
                          />
                        </td>

                        <td className="py-3 px-4">
                          <CurrencyInput
                            value={draft.allowances}
                            onChange={(val) =>
                              updateDraftField(u.username, "allowances", val)
                            }
                            prefix="Rp "
                          />
                        </td>

                        <td className="py-3 px-4">
                          <CurrencyInput
                            value={draft.deductions}
                            onChange={(val) =>
                              updateDraftField(u.username, "deductions", val)
                            }
                            prefix="Rp "
                          />
                        </td>

                        <td className="py-3 px-5 text-right">
                          <button
                            type="button"
                            disabled={savingUser === u.username}
                            onClick={() => onSaveRow(u.username)}
                            className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>
                              {savingUser === u.username ? "Saving..." : "Save"}
                            </span>
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

        {/* SUB-TAB 3: PAYSLIP ARCHIVE & AD-HOC GENERATOR */}
        {subTab === "PAYSLIP_ARCHIVE" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-2xs space-y-4 h-fit">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">
                  Direct Slip Issuance
                </span>
                <h4 className="text-base font-extrabold text-stone-900">
                  Issue Individual Payslip
                </h4>
              </div>

              <form onSubmit={onSubmitAdhoc} className="space-y-3 text-xs font-bold">
                <div>
                  <label className="text-[10px] uppercase text-stone-500 block mb-1">
                    Employee
                  </label>
                  <select
                    required
                    value={adhocUser}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAdhocUser(val);
                      if (val) {
                        const d = getDraftForUser(val);
                        if (d.basic_salary > 0) setAdhocBasic(d.basic_salary);
                        if (d.allowances > 0) setAdhocAllow(d.allowances);
                        if (d.deductions > 0) setAdhocDed(d.deductions);
                      }
                    }}
                    className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 outline-none"
                  >
                    <option value="">Select Employee...</option>
                    {activeUsers.map((u) => (
                      <option key={u.username} value={u.username}>
                        {u.name || u.username} (@{u.username})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-stone-500 block mb-1">
                    Payroll Period Label
                  </label>
                  <input
                    type="text"
                    required
                    value={adhocPeriod}
                    onChange={(e) => setAdhocPeriod(e.target.value)}
                    className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-stone-500 block mb-1">
                    Basic Salary
                  </label>
                  <CurrencyInput
                    value={adhocBasic}
                    onChange={setAdhocBasic}
                    prefix="Rp "
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-stone-500 block mb-1">
                    Allowances & Overtime (+)
                  </label>
                  <CurrencyInput
                    value={adhocAllow}
                    onChange={setAdhocAllow}
                    prefix="Rp "
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-stone-500 block mb-1">
                    Deductions (-)
                  </label>
                  <CurrencyInput
                    value={adhocDed}
                    onChange={setAdhocDed}
                    prefix="Rp "
                  />
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
                  <span className="text-[10px] uppercase font-black text-emerald-800">
                    Net Take-Home Pay
                  </span>
                  <span className="font-mono tabular-nums font-black text-sm text-emerald-700">
                    {formatRupiah(Math.max(0, adhocBasic + adhocAllow - adhocDed))}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isGeneratingAdhoc || !adhocUser}
                  className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isGeneratingAdhoc ? "Publishing..." : "Publish Official Payslip"}
                </button>
              </form>
            </div>

            <div className="lg:col-span-8 bg-white rounded-2xl border border-stone-200/80 shadow-2xs overflow-hidden">
              <div className="px-6 py-4 border-b border-stone-200 bg-stone-50/60">
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-700">
                  Employee Payslip Ledger ({payslips.length})
                </h4>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-bold">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-[10px] font-black uppercase tracking-wider text-stone-500">
                      <th className="py-3.5 px-4">Employee</th>
                      <th className="py-3.5 px-4">Period</th>
                      <th className="py-3.5 px-4 text-right">Basic</th>
                      <th className="py-3.5 px-4 text-right">Allowances</th>
                      <th className="py-3.5 px-4 text-right">Deductions</th>
                      <th className="py-3.5 px-4 text-right">Net Salary</th>
                      <th className="py-3.5 px-4 text-right">Slip PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-stone-700">
                    {payslips.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-stone-400">
                          No payslips issued yet.
                        </td>
                      </tr>
                    ) : (
                      payslips.map((p) => (
                        <tr key={p.id} className="hover:bg-stone-50/70">
                          <td className="py-3.5 px-4">
                            <div className="font-extrabold text-stone-900">
                              {p.employee_name || p.employee_username}
                            </div>
                            <div className="text-[10px] font-mono text-stone-400">
                              @{p.employee_username}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-extrabold text-stone-800">
                            {p.period_month}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                            {formatRupiah(p.basic_salary)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                            +{formatRupiah(p.allowances)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-rose-600">
                            -{formatRupiah(p.deductions)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-black text-stone-900">
                            {formatRupiah(p.net_salary)}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => printOfficialPayslip(p)}
                              className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5 text-stone-700" />
                              <span>Print Slip</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);
