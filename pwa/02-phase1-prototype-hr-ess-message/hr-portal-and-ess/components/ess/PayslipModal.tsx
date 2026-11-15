import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ReceiptText, Printer } from "lucide-react";
import { printOfficialPayslip } from "@/utils/hrDocuments";

interface PayslipModalProps {
  selectedPayslip: any;
  onClose: () => void;
  user: any;
  formatRupiah: (val: any) => string;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({
  selectedPayslip,
  onClose,
  user,
  formatRupiah,
}) => {
  return (
    <Modal
      isOpen={Boolean(selectedPayslip)}
      onClose={onClose}
      uiTheme="hris"
      maxWidth="3xl"
      contentClassName="p-0 flex flex-col min-h-0"
      footer={
        selectedPayslip ? (
          <div className="flex flex-wrap justify-end gap-2.5 font-bold">
            <Button
              type="button"
              variant="secondary"
              onClick={() => printOfficialPayslip(selectedPayslip, user)}
              className="px-3.5 py-2.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" /> Print PDF
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={onClose}
              className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-xs"
            >
              Close
            </Button>
          </div>
        ) : undefined
      }
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-200/80 border border-stone-300/60 flex items-center justify-center text-stone-800">
            <ReceiptText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider text-stone-900 leading-none">
              Employee Payslip Breakdown
            </h3>
            <span className="text-[10px] text-stone-500 uppercase tracking-wider font-mono">
              Paving Joss Division
            </span>
          </div>
        </div>
      }
    >
      {selectedPayslip && (
        <div>
          <div className="p-4 sm:p-6 space-y-4 text-stone-800">
            {/* Header Info */}
            <div className="flex justify-between items-start border-b border-stone-200 pb-4 text-xs font-bold">
              <div>
                <h4 className="font-mono text-[10px] font-black text-stone-400 uppercase tracking-widest mb-0.5">
                  Employee
                </h4>
                <p className="font-extrabold text-stone-900 uppercase text-sm">
                  {selectedPayslip.employee_name || user?.name || user?.username}
                </p>
                <p className="text-stone-500 font-bold">
                  {user?.role || "Staff"} (@{selectedPayslip.employee_username || user?.username})
                </p>
              </div>
              <div className="text-right text-xs">
                <h4 className="font-mono text-[10px] font-black text-stone-400 uppercase tracking-widest mb-0.5">
                  Period
                </h4>
                <p className="font-extrabold text-stone-900 text-sm uppercase">
                  {selectedPayslip.period_month}
                </p>
                <p className="text-stone-500 font-mono text-[10px] tabular-nums">
                  ID: {selectedPayslip.id}
                </p>
              </div>
            </div>

            {/* Financial Calculations */}
            <div className="space-y-3">
              <div className="bg-stone-50 border border-stone-200/80 rounded-2xl overflow-hidden font-bold">
                <div className="grid grid-cols-2 bg-stone-150/40 border-b border-stone-200 py-2.5 px-3.5 text-[10px] font-black text-stone-500 uppercase tracking-wider">
                  <span>Component</span>
                  <span className="text-right">Amount (IDR)</span>
                </div>

                <div className="divide-y divide-stone-150 font-bold text-xs text-stone-700">
                  <div className="grid grid-cols-2 py-3 px-3.5">
                    <span>Basic Salary</span>
                    <span className="text-right font-mono tabular-nums text-stone-900">
                      {formatRupiah(selectedPayslip.basic_salary)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 py-3 px-3.5">
                    <span className="text-emerald-700">
                      Allowances & Overtime (+)
                    </span>
                    <span className="text-right font-mono tabular-nums text-emerald-700">
                      +{formatRupiah(selectedPayslip.allowances)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 py-3 px-3.5">
                    <span className="text-rose-700">
                      Deductions (-)
                    </span>
                    <span className="text-right font-mono tabular-nums text-rose-700">
                      -{formatRupiah(selectedPayslip.deductions)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Net Income block */}
              <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl flex justify-between items-center font-bold gap-2">
                <div>
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block">
                    Take Home Pay
                  </span>
                  <span className="text-[11px] text-stone-500 font-bold">
                    Net Salary
                  </span>
                </div>
                <span className="text-lg sm:text-xl font-extrabold text-emerald-700 font-mono tabular-nums tracking-tight">
                  {formatRupiah(selectedPayslip.net_salary)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
