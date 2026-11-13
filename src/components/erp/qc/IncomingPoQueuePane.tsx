import React, { memo } from "react";
import {
  Truck,
  Search,
  FileText,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";

interface IncomingPoQueuePaneProps {
  filteredPos: any[];
  searchPoQuery: string;
  setSearchPoQuery: (val: string) => void;
  poStatusFilter: string;
  setPoStatusFilter: (val: string) => void;
  canCreateGrn: boolean;
  onViewPo: (poId: string) => void;
  onOpenGrnModal: (po: any) => void;
  onOpenReissueGrn: (po: any) => void;
}

export const IncomingPoQueuePane = memo(function IncomingPoQueuePane({
  filteredPos,
  searchPoQuery,
  setSearchPoQuery,
  poStatusFilter,
  setPoStatusFilter,
  canCreateGrn,
  onViewPo,
  onOpenGrnModal,
  onOpenReissueGrn,
}: IncomingPoQueuePaneProps) {
  return (
    <div className="lg:col-span-5 bg-white border border-stone-200/80 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
      <div className="p-4 border-b border-stone-200/80 bg-stone-50/70 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Incoming Vendor PO Queue
            </h2>
          </div>
          <Badge variant="info" className="font-mono tabular-nums">
            {filteredPos.length} POs
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search PO, vendor, PR..."
              value={searchPoQuery}
              onChange={(e) => setSearchPoQuery(e.target.value)}
              leftIcon={<Search className="w-3.5 h-3.5" />}
            />
          </div>
          <div className="w-40">
            <Select
              value={poStatusFilter}
              onChange={(e) => setPoStatusFilter(e.target.value)}
              options={[
                { value: "ACTIONABLE", label: "Pending GRN" },
                { value: "ALL", label: "All POs" },
                { value: "PARTIAL", label: "Partial" },
                { value: "REJECTED", label: "Rejected" },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="divide-y divide-stone-100 max-h-[680px] overflow-y-auto">
        {filteredPos.length === 0 ? (
          <div className="p-10 text-center text-xs text-stone-500">
            No purchase orders currently awaiting Incoming Material GRN creation.
          </div>
        ) : (
          filteredPos.map((po) => {
            const pendingQty = Math.max(0, Number(po.pending_qty || 0));
            const hasRejected = Number(po.has_rejected_grn || 0) > 0;
            const canIssueGrn =
              po.status === "ISSUED" ||
              (po.status === "PARTIAL" && pendingQty > 0);
            const canReissueGrn =
              po.status === "REJECTED" ||
              (po.status === "PARTIAL" && hasRejected && pendingQty > 0);

            return (
              <div
                key={po.id}
                className="p-4 hover:bg-stone-50/80 transition-colors space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black text-stone-900 tabular-nums">
                        {po.po_number}
                      </span>
                      {(po.urgency === "URGENT" ||
                        po.urgency === "CRITICAL") && (
                        <Badge variant="danger">{po.urgency}</Badge>
                      )}
                      {hasRejected && (
                        <Badge variant="warning" size="sm">
                          Has Rejected Qty
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs font-bold text-stone-800 mt-0.5 truncate">
                      {po.supplier_name}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-stone-500 mt-0.5">
                      PR: {po.pr_numbers || "-"} · ETA: {po.expected_date || "TBD"}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <Badge
                      variant={
                        po.status === "REJECTED"
                          ? "danger"
                          : po.status === "PARTIAL"
                            ? "warning"
                            : po.status === "RECEIVED" ||
                                po.status === "FINISHED"
                              ? "success"
                              : "info"
                      }
                    >
                      {po.status === "ISSUED" ? "AWAITING GRN" : po.status}
                    </Badge>
                    <div className="text-[11px] font-mono tabular-nums font-bold text-stone-700 mt-1">
                      Pending: {pendingQty.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-stone-100">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => onViewPo(po.id)}
                    leftIcon={<FileText className="w-3.5 h-3.5" />}
                  >
                    View PO &amp; BOM Spec
                  </Button>

                  {canReissueGrn && (
                    <Button
                      size="xs"
                      variant="danger_soft"
                      disabled={!canCreateGrn}
                      onClick={() => onOpenReissueGrn(po)}
                      leftIcon={<AlertCircle className="w-3.5 h-3.5" />}
                    >
                      Re-issue GRN
                    </Button>
                  )}

                  {canIssueGrn && (
                    <Button
                      size="xs"
                      variant="primary"
                      disabled={!canCreateGrn}
                      onClick={() => onOpenGrnModal(po)}
                      leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      Inspect &amp; Create GRN
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
