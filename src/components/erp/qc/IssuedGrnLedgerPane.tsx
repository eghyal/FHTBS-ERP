import React, { memo } from "react";
import {
  FileCheck2,
  Search,
  PackageCheck,
  Clock,
  Printer,
  X,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
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

interface IssuedGrnLedgerPaneProps {
  filteredGrns: any[];
  searchGrnQuery: string;
  setSearchGrnQuery: (val: string) => void;
  grnStatusFilter: string;
  setGrnStatusFilter: (val: string) => void;
  canCreateGrn: boolean;
  onUpdateGrnQcStatus: (grnId: string, qcStatus: string) => void;
  onOpenGrnReport: (grn: any) => void;
}

export const IssuedGrnLedgerPane = memo(function IssuedGrnLedgerPane({
  filteredGrns,
  searchGrnQuery,
  setSearchGrnQuery,
  grnStatusFilter,
  setGrnStatusFilter,
  canCreateGrn,
  onUpdateGrnQcStatus,
  onOpenGrnReport,
}: IssuedGrnLedgerPaneProps) {
  return (
    <div className="lg:col-span-7 bg-white border border-stone-200/80 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
      <div className="p-4 border-b border-stone-200/80 bg-stone-50/70 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-emerald-700" />
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Issued GRN &amp; Inspection Disposition Ledger
            </h2>
          </div>
          <Badge variant="neutral" className="font-mono tabular-nums">
            {filteredGrns.length} GRNs
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search GRN ID, PO number, supplier, or inspector..."
              value={searchGrnQuery}
              onChange={(e) => setSearchGrnQuery(e.target.value)}
              leftIcon={<Search className="w-3.5 h-3.5" />}
            />
          </div>
          <div className="w-full sm:w-52">
            <Select
              value={grnStatusFilter}
              onChange={(e) => setGrnStatusFilter(e.target.value)}
              options={[
                { value: "ALL", label: "All Issued GRNs" },
                {
                  value: "PENDING_INTAKE",
                  label: "Awaiting Warehouse Intake",
                },
                { value: "INTAKEN", label: "Intaken to Stock" },
                { value: "PASSED", label: "QC Passed" },
                { value: "CONDITIONAL", label: "QC Conditional (Split)" },
                { value: "REJECTED", label: "QC Rejected" },
              ]}
            />
          </div>
          {(searchGrnQuery || grnStatusFilter !== "ALL") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchGrnQuery("");
                setGrnStatusFilter("ALL");
              }}
              leftIcon={<X className="w-3.5 h-3.5" />}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>GRN Document &amp; Date</TableHead>
            <TableHead>PO &amp; Supplier</TableHead>
            <TableHead className="text-center">Pass / Rej Breakdown</TableHead>
            <TableHead className="text-center">QC Disposition</TableHead>
            <TableHead className="text-center">Warehouse Status</TableHead>
            <TableHead className="text-right">Report</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredGrns.length === 0 ? (
            <TableEmpty
              colSpan={6}
              message="No Goods Receipt Notes (GRN) match the current filter."
            />
          ) : (
            filteredGrns.map((grn) => {
              const isIntaken =
                Boolean(grn.inventory_updated_at) ||
                Number(grn.intake_completed || 0) === 1;
              const items = Array.isArray(grn.items) ? grn.items : [];
              const totalPassed = items.reduce(
                (s: number, it: any) =>
                  s +
                  Number(
                    it.effective_qty_passed ??
                      it.qty_passed ??
                      (grn.qc_status === "REJECTED" ? 0 : it.qty_received || 0)
                  ),
                0
              );
              const totalRejected = items.reduce(
                (s: number, it: any) =>
                  s +
                  Number(
                    it.effective_qty_rejected ??
                      it.qty_rejected ??
                      (grn.qc_status === "REJECTED" ? it.qty_received || 0 : 0)
                  ),
                0
              );

              return (
                <TableRow key={grn.id}>
                  <TableCell>
                    <div className="font-mono text-xs font-bold text-stone-900 tabular-nums">
                      {grn.id}
                    </div>
                    <div className="text-[11px] font-mono text-stone-500 tabular-nums mt-0.5">
                      {grn.received_date
                        ? new Date(grn.received_date).toLocaleDateString(
                            "en-GB",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )
                        : "-"}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="font-mono text-xs font-bold text-stone-900 tabular-nums">
                      {grn.po_number}
                    </div>
                    <div className="text-[11px] text-stone-500 truncate max-w-[150px]">
                      {grn.supplier_name}
                    </div>
                  </TableCell>

                  <TableCell className="text-center font-mono text-xs tabular-nums">
                    <span className="font-bold text-emerald-700">
                      {totalPassed}P
                    </span>
                    <span className="text-stone-300 mx-1">/</span>
                    <span
                      className={cn(
                        "font-bold",
                        totalRejected > 0 ? "text-rose-600" : "text-stone-400"
                      )}
                    >
                      {totalRejected}R
                    </span>
                  </TableCell>

                  <TableCell className="text-center">
                    {!isIntaken && canCreateGrn ? (
                      <Select
                        value={grn.qc_status || "PASSED"}
                        onChange={(e) =>
                          onUpdateGrnQcStatus(grn.id, e.target.value)
                        }
                        wrapperClassName="w-32 mx-auto"
                        className={cn(
                          "h-7 text-[10px] font-bold uppercase tracking-wider",
                          grn.qc_status === "PASSED"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : grn.qc_status === "CONDITIONAL"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-rose-50 text-rose-800 border-rose-200"
                        )}
                      >
                        <option value="PASSED">PASSED</option>
                        <option value="CONDITIONAL">CONDITIONAL</option>
                        <option value="REJECTED">REJECTED</option>
                      </Select>
                    ) : (
                      <Badge
                        variant={
                          grn.qc_status === "PASSED"
                            ? "success"
                            : grn.qc_status === "CONDITIONAL"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {grn.qc_status || "PASSED"}
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    {grn.qc_status === "REJECTED" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <Ban className="w-3 h-3" />
                        {isIntaken ? "Returned to Vendor" : "Blocked (Rejected)"}
                      </span>
                    ) : isIntaken ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <PackageCheck className="w-3 h-3" />
                        Intaken
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock className="w-3 h-3" />
                        Pending Intake
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => onOpenGrnReport(grn)}
                      leftIcon={<Printer className="w-3.5 h-3.5" />}
                    >
                      GRN
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
});
