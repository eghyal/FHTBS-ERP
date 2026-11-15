import React, { memo } from "react";
import { ShieldCheck, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { cn } from "@/lib/utils";

interface WarehousePendingGrnTabProps {
  pendingGrns: any[];
  handleReturnGrn: (id: string) => void;
  handleIntakeGrn: (id: string) => void;
  canInspectQc?: boolean;
  canCommitIntake?: boolean;
  onUpdateQcStatus?: (grnId: string, status: string) => void;
}

export const WarehousePendingGrnTab: React.FC<WarehousePendingGrnTabProps> = memo(
  function WarehousePendingGrnTab({
    pendingGrns,
    handleReturnGrn,
    handleIntakeGrn,
    canCommitIntake = true,
  }) {
    return (
      <div className="px-6 pb-8 space-y-4">
        <div className="flex items-center justify-between pt-4">
          <div>
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Warehouse Material Intake (QC-Verified GRN Put-Away)
            </h3>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Confirm physical receipt of QC-inspected Goods Receipt Notes (GRN) into the warehouse and increment inventory balances.
            </p>
          </div>
          <div className="text-xs font-mono font-bold text-stone-700 tabular-nums shrink-0">
            {pendingGrns.length} Pending Intake(s)
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow hoverable={false}>
              <TableHead>GRN Date &amp; ID</TableHead>
              <TableHead>PO Document &amp; Supplier</TableHead>
              <TableHead>Verified By (QA/QC)</TableHead>
              <TableHead className="text-center">QC Disposition</TableHead>
              <TableHead className="text-right">Warehouse Stock Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingGrns.length === 0 ? (
              <TableEmpty
                colSpan={5}
                message="All QC-verified Goods Receipt Notes (GRN) have been intaken into warehouse stock."
              />
            ) : (
              pendingGrns.map((grn) => (
                <TableRow key={grn.id}>
                  <TableCell>
                    <div className="font-mono tabular-nums text-xs font-bold text-stone-900">
                      {grn.id}
                    </div>
                    <div className="text-[11px] font-mono text-stone-500 mt-0.5">
                      {new Date(grn.received_date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-mono font-bold text-stone-900 tabular-nums">
                      {grn.po_number}
                    </div>
                    <div className="text-[11px] text-stone-500 font-medium mt-0.5">
                      {grn.supplier_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-bold text-stone-900">
                      {grn.qc_user || grn.engineering_user || "QA/QC Inspector"}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                      <ShieldCheck className="w-3 h-3" /> Incoming GRN Verified
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border",
                        grn.qc_status === "PASSED"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : grn.qc_status === "CONDITIONAL"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-rose-50 text-rose-800 border-rose-200"
                      )}
                    >
                      {grn.qc_status || "PASSED"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {grn.qc_status === "REJECTED" ? (
                      <Button
                        size="xs"
                        variant="danger_soft"
                        disabled={!canCommitIntake}
                        lockKey={`return-grn-${grn.id}`}
                        onClick={() => handleReturnGrn(grn.id)}
                        title={
                          !canCommitIntake
                            ? "Only Warehouse department can execute physical returns"
                            : undefined
                        }
                        className="h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Dispatch Reject</span>
                      </Button>
                    ) : (
                      <Button
                        size="xs"
                        disabled={!canCommitIntake}
                        lockKey={`intake-grn-${grn.id}`}
                        onClick={() => handleIntakeGrn(grn.id)}
                        title={
                          !canCommitIntake
                            ? "Only Warehouse department can intake items into warehouse stock"
                            : "Confirm physical put-away into warehouse and update stock balance"
                        }
                        className="h-8 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Intake</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    );
  }
);
