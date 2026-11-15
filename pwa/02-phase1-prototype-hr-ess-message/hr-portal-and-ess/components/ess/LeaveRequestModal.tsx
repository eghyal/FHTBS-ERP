import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CalendarDays, ShieldCheck } from "lucide-react";

interface LeaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  isManager: boolean;
  isSubmittingLeave: boolean;
  leaveType: string;
  setLeaveType: (val: string) => void;
  startDate: string;
  setStartDate: (val: string) => void;
  endDate: string;
  setEndDate: (val: string) => void;
  handleRequestLeave: (e: React.FormEvent) => void;
}

export const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({
  isOpen,
  onClose,
  isManager,
  isSubmittingLeave,
  leaveType,
  setLeaveType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  handleRequestLeave,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      uiTheme="hris"
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="hris-leave-form"
            variant="primary"
            isLoading={isSubmittingLeave}
          >
            Submit Leave Request
          </Button>
        </div>
      }
      title={
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-stone-900 text-white rounded-lg">
            <CalendarDays className="w-4 h-4" />
          </div>
          <h3 className="font-black text-stone-900 text-sm uppercase tracking-wider">
            Leave Request Form
          </h3>
        </div>
      }
    >
      <form id="hris-leave-form" onSubmit={handleRequestLeave} className="space-y-4 font-bold">
        <Select
          label="Leave Category"
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
        >
          <option value="Annual Paid Leave">Annual Paid Leave</option>
          <option value="Sick Leave">Sick Leave</option>
          <option value="Maternity / Paternity">
            Maternity / Paternity Leave
          </option>
          <option value="Unpaid Leave">Unpaid Leave</option>
        </Select>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="date"
            label="Start Date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="font-mono"
          />
          <Input
            type="date"
            label="End Date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="font-mono"
          />
        </div>

        {isManager ? (
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-3 text-[11px] text-emerald-800 font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>Manager leave requests are auto-approved.</span>
          </div>
        ) : (
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-[11px] text-stone-600 font-medium">
            Reviewed by your department Manager.
          </div>
        )}

      </form>
    </Modal>
  );
};
