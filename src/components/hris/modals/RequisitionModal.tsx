import React from "react";
import { Modal } from "@/components/ui/Modal";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import {
  DollarSign,
  TrendingDown,
  CheckCircle2,
  RefreshCw,
  UserCheck,
  CalendarDays,
  Clock,
  MapPin,
  FileText,
  X,
  Save,
  Send,
} from "lucide-react";
import { formatRupiah } from "@/utils/format";

interface PayrollRequisitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  prqEditingId: string | null;
  prqDetails: any[];
  prqMonth: number;
  prqYear: number;
  isPreparingPrq: boolean;
  users: any[];
  handleUpdatePrqItem: (idx: number, field: string, val: number) => void;
  prqNotes: string;
  setPrqNotes: (val: string) => void;
  isSavingPrq: boolean;
  handleSavePayrollRequisition: (submitToFinance: boolean) => void;
  handleRequestSubmitPrq: () => void;
}

export const PayrollRequisitionModal: React.FC<PayrollRequisitionModalProps> = ({
  isOpen,
  onClose,
  prqEditingId,
  prqDetails,
  prqMonth,
  prqYear,
  isPreparingPrq,
  users,
  handleUpdatePrqItem,
  prqNotes,
  setPrqNotes,
  isSavingPrq,
  handleSavePayrollRequisition,
  handleRequestSubmitPrq,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        prqEditingId
          ? "Edit HR Payroll Requisition (PRq)"
          : "Prepare HR Payroll Requisition (PRq)"
      }
      description="Structured packing list of HR expenditure breakdown before forwarding to Finance Division."
      maxWidth="6xl"
    >
      <div className="space-y-6 text-left">
        {/* COMPACT PERIOD HEADER */}
        <div className="bg-stone-50/90 px-5 py-3.5 rounded-2xl border border-stone-200/90 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 bg-stone-200 text-stone-800 text-[10px] font-black uppercase tracking-widest rounded-full">
              HR Requisition Engine
            </span>
            <span className="text-xs font-extrabold text-stone-700">
              {prqDetails.length} Active Records • Net:{" "}
              {formatRupiah(
                prqDetails.reduce(
                  (sum, item) => sum + Number(item.net_pay || 0),
                  0
                )
              )}
            </span>
          </div>

          <div className="px-3.5 py-1.5 bg-white rounded-xl border border-stone-200 flex items-center gap-2 text-stone-700 text-xs font-extrabold">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">
              Period:
            </span>
            <span className="text-stone-900">
              {[
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
              ][prqMonth - 1]}{" "}
              {prqYear}
            </span>
          </div>
        </div>

        {/* MATRIX TABLE */}
        {isPreparingPrq ? (
          <div className="py-16 text-center text-stone-500 font-bold text-sm bg-stone-50 rounded-3xl border border-stone-200 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-stone-800 animate-spin" />
            <p className="text-stone-700 font-extrabold text-base">
              Calculating Attendance & Payroll Components...
            </p>
            <p className="text-stone-400 text-xs">
              Aggregating master salaries, attendance logs, and allowances.
            </p>
          </div>
        ) : prqDetails.length === 0 ? (
          <div className="py-16 text-center text-stone-400 font-bold text-sm bg-stone-50 rounded-3xl border border-dashed border-stone-200">
            No active employee records to process for this period.
          </div>
        ) : (
          <div className="bg-white border border-stone-200/80 rounded-3xl overflow-hidden shadow-sm">
            <div className="px-6 py-3 bg-stone-100/70 border-b border-stone-200 flex justify-between items-center text-xs font-black uppercase tracking-wider text-stone-600">
              <span className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-stone-500" />
                <span>Employee Payroll Breakdown Matrix</span>
              </span>
              <span className="text-[10px] font-bold text-stone-400">
                Interactive Live Values
              </span>
            </div>

            <div className="overflow-x-auto max-h-[440px] custom-scrollbar">
              <table className="w-full text-left font-bold text-xs border-collapse">
                <thead className="sticky top-0 bg-stone-50 text-stone-500 uppercase text-[10px] tracking-widest border-b border-stone-200 z-10 shadow-xs">
                  <tr>
                    <th className="p-3.5 pl-6 min-w-[180px]">Staff Member</th>
                    <th className="p-3.5 min-w-[130px]">Base Salary</th>
                    <th className="p-3.5 min-w-[140px]">Attendance Days</th>
                    <th className="p-3.5 min-w-[130px]">Overtime Pay</th>
                    <th className="p-3.5 min-w-[130px]">Travel Allowance</th>
                    <th className="p-3.5 min-w-[130px]">Reimbursement</th>
                    <th className="p-3.5 min-w-[130px]">Insurance & Tax</th>
                    <th className="p-3.5 pr-6 text-right min-w-[150px]">
                      Net Take-Home Pay
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-800">
                  {(Array.isArray(prqDetails) ? prqDetails : []).map(
                    (item: any, idx: number) => {
                      const gross = Number(item.gross_pay || 0);
                      const net = Number(item.net_pay || 0);
                      const empUsername =
                        item.employee_username || item.username || "";
                      const matchedUser = (users || []).find(
                        (u: any) =>
                          u.username?.toLowerCase() ===
                          empUsername.toLowerCase()
                      );
                      const empName =
                        item.employee_name ||
                        matchedUser?.name ||
                        item.name ||
                        empUsername ||
                        "Employee";
                      const empDept =
                        item.department ||
                        matchedUser?.role ||
                        item.role ||
                        "Staff";

                      return (
                        <tr
                          key={empUsername || idx}
                          className="hover:bg-stone-50/80 transition-colors"
                        >
                          <td className="p-3.5 pl-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-stone-100 text-stone-800 font-black text-xs flex items-center justify-center border border-stone-200 uppercase shrink-0">
                                {empName.slice(0, 2)}
                              </div>
                              <div>
                                <div className="font-extrabold text-stone-900">
                                  {empName}
                                </div>
                                <div className="text-[10px] text-stone-400 font-medium flex items-center gap-1.5 flex-wrap mt-0.5">
                                  <span>@{empUsername} • {empDept}</span>
                                  {item.cost_category === "DIRECT_LABOR" ? (
                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 font-black text-[9px] rounded-md tracking-wider">
                                      COGS Direct Labor
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 bg-stone-100 text-stone-600 font-bold text-[9px] rounded-md">
                                      OPEX
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Base Salary */}
                          <td className="p-3.5">
                            <div className="font-mono font-black text-stone-900 text-xs">
                              {formatRupiah(item.basic_salary)}
                            </div>
                            <span className="text-[9px] font-extrabold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full inline-block mt-1 uppercase tracking-wider">
                              Master Rate
                            </span>
                          </td>

                          {/* Attendance Days */}
                          <td className="p-3.5">
                            <div className="text-[11px] font-mono tabular-nums font-extrabold text-stone-700 bg-stone-100 border border-stone-200 px-2.5 py-1.5 rounded-xl inline-flex items-center gap-1.5 shadow-2xs">
                              <CalendarDays className="w-3.5 h-3.5 text-stone-700" />
                              <span>
                                {item.present_days ?? 22} /{" "}
                                {item.working_days || 22} Days
                              </span>
                            </div>
                            {(Number(item.unpaid_leave_days) > 0 ||
                              Number(item.paid_leave_days) > 0) && (
                              <div className="text-[9px] font-bold text-stone-500 mt-1 flex flex-wrap gap-1">
                                {Number(item.paid_leave_days) > 0 && (
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                                    Paid Leave: {item.paid_leave_days}d
                                  </span>
                                )}
                                {Number(item.unpaid_leave_days) > 0 && (
                                  <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded">
                                    Unpaid/Excess: {item.unpaid_leave_days}d
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Overtime */}
                          <td className="p-3.5">
                            <div className="text-[10px] font-bold text-stone-500 mb-1 flex items-center gap-1 font-mono tabular-nums">
                              <Clock className="w-3 h-3 text-stone-400" />
                              <span>{item.overtime_hours || 0} Hours</span>
                            </div>
                            <CurrencyInput
                              placeholder="Overtime Pay"
                              value={item.overtime_pay || 0}
                              onChange={(val) =>
                                handleUpdatePrqItem(idx, "overtime_pay", val)
                              }
                              prefix="Rp "
                            />
                          </td>

                          {/* Travel */}
                          <td className="p-3.5">
                            <div className="text-[10px] font-bold text-stone-500 mb-1 flex items-center gap-1 font-mono tabular-nums">
                              <MapPin className="w-3 h-3 text-stone-400" />
                              <span>{item.travel_days || 0} Days</span>
                            </div>
                            <CurrencyInput
                              placeholder="Travel Pay"
                              value={item.travel_allowance || 0}
                              onChange={(val) =>
                                handleUpdatePrqItem(
                                  idx,
                                  "travel_allowance",
                                  val
                                )
                              }
                              prefix="Rp "
                            />
                          </td>

                          {/* Reimbursement */}
                          <td className="p-3.5">
                            <div className="text-[10px] font-bold text-stone-400 mb-1">
                              Expense Claim
                            </div>
                            <CurrencyInput
                              placeholder="Reimbursement"
                              value={item.reimbursement_amount || 0}
                              onChange={(val) =>
                                handleUpdatePrqItem(
                                  idx,
                                  "reimbursement_amount",
                                  val
                                )
                              }
                              prefix="Rp "
                            />
                          </td>

                          {/* Deductions */}
                          <td className="p-3.5 text-[10px]">
                            <div className="text-stone-600 font-mono tabular-nums font-bold">
                              Social/Health Ins: {formatRupiah(item.bpjs_deduction)}
                            </div>
                            <div className="text-stone-600 font-mono tabular-nums font-bold mt-0.5">
                              Income Tax: {formatRupiah(item.pph21_deduction)}
                            </div>
                            {Number(item.absence_deduction) > 0 && (
                              <div className="text-rose-600 font-mono tabular-nums font-bold mt-0.5">
                                Unpaid Leave: -{formatRupiah(item.absence_deduction)}
                              </div>
                            )}
                          </td>

                          {/* Take Home Pay */}
                          <td className="p-3.5 pr-6 text-right">
                            <div className="text-sm font-mono font-black text-stone-900 bg-stone-50 px-2.5 py-1 rounded-xl inline-block border border-stone-200">
                              {formatRupiah(net)}
                            </div>
                            <div className="text-[9px] text-stone-400 font-mono mt-1">
                              Gross: {formatRupiah(gross)}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* HR EXECUTIVE JUSTIFICATION & NOTES */}
        <div className="bg-stone-50 p-5 rounded-3xl border border-stone-200/80 space-y-2">
          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest flex items-center gap-2">
            <FileText className="w-4 h-4 text-stone-600" />
            <span>
              HR Executive Justification & Notes for Finance (Packing List
              Notes)
            </span>
          </label>
          <textarea
            rows={2}
            value={prqNotes}
            onChange={(e) => setPrqNotes(e.target.value)}
            placeholder="Provide context for Finance review (e.g. Overtime adjustments for production rush, travel expenses for out-of-town project)..."
            className="w-full px-4 py-3 bg-white border border-stone-200 rounded-2xl text-xs font-bold text-stone-800 focus:ring-2 focus:ring-stone-200 focus:border-stone-400 outline-none resize-none transition-all"
          />
        </div>

        {/* ACTION BUTTONS FOOTER */}
        <div className="pt-4 border-t border-stone-200/80 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="text-[11px] font-bold text-stone-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Live calculations auto-updated upon field change.</span>
          </span>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-black uppercase tracking-widest rounded-2xl transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isSavingPrq || prqDetails.length === 0}
              onClick={() => handleSavePayrollRequisition(false)}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              <span>Save Draft</span>
            </button>

            <button
              type="button"
              disabled={isSavingPrq || prqDetails.length === 0}
              onClick={handleRequestSubmitPrq}
              className="px-8 py-3 bg-stone-900 hover:bg-stone-800 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{isSavingPrq ? "Submitting..." : "Submit Requisition to Finance"}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
