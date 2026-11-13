import React, { memo } from "react";
import {
  CheckSquare,
  Truck,
  FileText,
  Share2,
  Archive,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/shared/Loader";
import { cn } from "@/lib/utils";
import { Action, hasPermission } from "@/utils/pbac";

export interface ActivePOItem {
  id: string;
  po_number: string;
  supplier_name: string;
  expected_date: string;
  auth_doc_name?: string;
  status: string;
  urgency?: "NORMAL" | "URGENT" | "CRITICAL";
  created_at: string;
  item_count: number;
  pr_numbers: string;
  pending_qty: number;
  has_cancelled_pr?: number;
  has_rejected_grn?: number;
  revision_note?: string;
  escalated_to?: string;
  total_amount?: number;
  amount?: number;
  supplier_email?: string;
  supplier_phone?: string;
}

interface ActivePoQueuePanelProps {
  isLoading: boolean;
  pos: ActivePOItem[];
  user: any;
  onArchiveFinishedPos: () => void;
  onViewPoDoc: (poId: string) => void;
  onSharePo: (po: ActivePOItem) => void;
  onOpenReissueGrn: (po: ActivePOItem) => void;
  onReviseRejectedOrRevisionPo: (po: ActivePOItem) => void;
  onCancelPo: (poId: string) => void;
  onOpenAuthorizeModal: (po: ActivePOItem) => void;
  onOpenReviseModal: (po: ActivePOItem) => void;
  onOpenEmailModal: (po: ActivePOItem) => void;
  onOpenGrnModal: (po: ActivePOItem) => void;
  onArchivePo: (poId: string) => void;
}

const PO_STEPPER_STEPS = [
  "DRAFTED",
  "AUTHORIZED",
  "ISSUED",
  "RECEIVED",
  "FINISHED",
] as const;

export const ActivePoQueuePanel = memo(function ActivePoQueuePanel({
  isLoading,
  pos,
  user,
  onArchiveFinishedPos,
  onViewPoDoc,
  onSharePo,
  onOpenReissueGrn,
  onReviseRejectedOrRevisionPo,
  onCancelPo,
  onOpenAuthorizeModal,
  onOpenReviseModal,
  onOpenEmailModal,
  onOpenGrnModal,
  onArchivePo,
}: ActivePoQueuePanelProps) {
  const canCreatePo = hasPermission(user, Action.CREATE_PO);
  const canReceivePo =
    hasPermission(user, Action.RECEIVE_PO) ||
    hasPermission(user, Action.INSPECT_QC);

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  return (
    <div className="w-full lg:w-[calc(50%-0.625rem)] shrink-0 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
            Active Purchase Orders ({pos.length})
          </h3>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Track authorization, vendor dispatch, and Goods Receipt Notes (GRN).
          </p>
        </div>
        <Button
          variant="amber_soft"
          size="xs"
          onClick={onArchiveFinishedPos}
          leftIcon={<Archive className="w-3.5 h-3.5" />}
          title="Archive Finished Purchase Orders"
        >
          <span className="hidden xl:inline">Archive Finished</span>
        </Button>
      </div>

      <div className="bg-white border border-stone-200/80 rounded-xl shadow-2xs overflow-hidden">
        {isLoading ? (
          <Loader text="Loading..." className="py-12" />
        ) : pos.length === 0 ? (
          <div className="p-12 text-center text-xs text-stone-500">
            No active POs.
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {pos.map((po) => {
              const isCancelled = po.status === "CANCELLED";
              const isOverdueDate =
                Boolean(po.expected_date) &&
                new Date(po.expected_date) < todayDate;
              const isLate =
                isOverdueDate &&
                (po.status === "ISSUED" || po.status === "PARTIAL");

              return (
                <div
                  key={po.id}
                  onClick={() => onViewPoDoc(po.id)}
                  className={cn(
                    "p-4 transition-colors group cursor-pointer",
                    isCancelled
                      ? "opacity-60 bg-stone-50/50"
                      : "hover:bg-stone-50/80"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
                        className={cn(
                          "text-xs font-mono font-bold tabular-nums uppercase tracking-wider",
                          isCancelled
                            ? "line-through text-stone-400"
                            : "text-stone-900"
                        )}
                      >
                        {po.po_number}
                      </div>
                      {po.has_cancelled_pr === 1 && !isCancelled && (
                        <span
                          className="bg-rose-50 text-rose-600 border border-rose-200/80 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1"
                          title="One or more associated PRs have been cancelled"
                        >
                          <AlertCircle className="w-3 h-3" /> PR Cancelled
                        </span>
                      )}
                      {(po.urgency === "URGENT" ||
                        po.urgency === "CRITICAL") && (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider",
                            po.urgency === "CRITICAL"
                              ? "bg-rose-600 text-white"
                              : "bg-amber-500 text-amber-50"
                          )}
                        >
                          {po.urgency}
                        </span>
                      )}
                    </div>
                    <div
                      className={cn(
                        "text-[10px] tracking-wider px-2 py-0.5 rounded-md font-bold uppercase shrink-0 ml-4 border",
                        po.status === "DRAFTED"
                          ? "bg-amber-50 text-amber-700 border-amber-200/80"
                          : po.status === "REVISION"
                            ? "bg-rose-50 text-rose-700 border-rose-200/80"
                            : po.status === "CANCELLED"
                              ? "bg-stone-100 text-stone-500 border-stone-200/80"
                              : isLate
                                ? "bg-rose-50 text-rose-700 border-rose-200/80"
                                : po.status === "REJECTED"
                                  ? "bg-rose-50 text-rose-700 border-rose-200/80"
                                  : po.status === "ISSUED" ||
                                      po.status === "PARTIAL"
                                    ? "bg-blue-50 text-blue-700 border-blue-200/80"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                      )}
                    >
                      {isLate
                        ? "LATE"
                        : po.status === "RECEIVED"
                          ? "PASSED"
                          : po.status === "ISSUED"
                            ? "ORDERS"
                            : po.status}
                    </div>
                    {(po.status === "DRAFTED" || po.status === "PENDING") &&
                      po.escalated_to && (
                        <div className="text-[10px] tracking-wider px-2 py-0.5 rounded-md font-bold uppercase bg-rose-600 text-white flex items-center gap-1 shadow-2xs shrink-0 ml-2">
                          <AlertTriangle className="w-2.5 h-2.5" /> ESCALATED TO{" "}
                          {po.escalated_to}
                        </div>
                      )}
                  </div>

                  {/* Visual Stepper Timeline */}
                  {!isCancelled && po.status !== "REJECTED" && (
                    <div className="flex items-center gap-1 mb-4 mt-2 max-w-[280px]">
                      {PO_STEPPER_STEPS.map((step, i, arr) => {
                        let effectiveStatus = po.status;
                        if (effectiveStatus === "PENDING")
                          effectiveStatus = "DRAFTED";
                        if (effectiveStatus === "PARTIAL")
                          effectiveStatus = "ISSUED";
                        if (effectiveStatus === "PAID")
                          effectiveStatus = "FINISHED";

                        const currentIndex = arr.indexOf(
                          effectiveStatus as any
                        );
                        const isCompleted =
                          i <= currentIndex && currentIndex !== -1;
                        const isCurrent = i === currentIndex;
                        return (
                          <div
                            key={step}
                            className="flex-1 flex flex-col gap-1"
                            title={step}
                          >
                            <div
                              className={cn(
                                "h-1.5 w-full rounded-sm transition-all duration-300",
                                isCompleted
                                  ? "bg-emerald-500"
                                  : "bg-stone-200",
                                isCurrent
                                  ? "ring-2 ring-emerald-500/20"
                                  : ""
                              )}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {po.status === "REVISION" && po.revision_note && (
                    <div className="mt-1.5 flex items-start gap-1 p-2 bg-rose-50 border border-rose-100 rounded text-[10px] text-rose-700 max-w-[300px]">
                      <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                      <span className="italic leading-snug break-words">
                        "{po.revision_note}"
                      </span>
                    </div>
                  )}

                  <div
                    className={cn(
                      "text-sm font-medium mb-1.5 mt-1 flex items-center gap-2",
                      isCancelled ? "text-stone-400" : "text-stone-600"
                    )}
                  >
                    <Truck className="w-4 h-4 text-stone-400" />{" "}
                    {po.supplier_name}
                  </div>

                  <div className="text-xs text-stone-500 mt-3 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> PR:{" "}
                    <span
                      className={cn(
                        "font-mono font-medium tabular-nums",
                        isCancelled ? "text-stone-400" : "text-stone-900"
                      )}
                    >
                      {po.pr_numbers || "-"}
                    </span>
                  </div>

                  {po.auth_doc_name && (
                    <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1.5 font-medium">
                      <CheckSquare className="w-3.5 h-3.5" /> PR Auth:{" "}
                      <span className="font-mono tabular-nums">{po.auth_doc_name}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-end mt-4">
                    <div className="text-xs text-stone-500 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        ETA:{" "}
                        <span
                          className={cn(
                            "font-mono font-medium tabular-nums",
                            isCancelled ? "text-stone-400" : "text-stone-900"
                          )}
                        >
                          {po.expected_date || "TBD"}
                        </span>
                      </div>
                      {isOverdueDate &&
                        !isCancelled &&
                        po.status !== "RECEIVED" && (
                          <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest inline-flex items-center gap-1 w-fit">
                            <AlertCircle className="w-3 h-3" /> Overdue
                          </span>
                        )}
                    </div>

                    <div className="flex gap-2 text-right">
                      <Button
                        size="xs"
                        action="view"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewPoDoc(po.id);
                        }}
                      />
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSharePo(po);
                        }}
                        title="Share to Forum"
                      >
                        <Share2 className="w-3.5 h-3.5" /> Share
                      </Button>

                      {(po.status === "RECEIVED" ||
                        po.status === "PARTIAL") && (
                        <div className="px-3 py-1.5 bg-stone-50 text-stone-500 text-[10px] font-bold rounded-lg flex items-center gap-1 border border-stone-200/70">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />{" "}
                          {po.status === "PARTIAL"
                            ? "Partial GRN Issued (QC)"
                            : "GRN Completed (QC)"}
                        </div>
                      )}

                      {po.status === "ISSUED" && (
                        <div className="px-2.5 py-1.5 bg-blue-50/70 text-blue-700 border border-blue-200/70 text-[10px] font-bold rounded-lg flex items-center gap-1">
                          <Truck className="w-3 h-3" /> Awaiting QC Incoming GRN
                        </div>
                      )}

                      {po.status === "REVISION" && canCreatePo && (
                        <>
                          <Button
                            size="xs"
                            action="revise"
                            onClick={(e) => {
                              e.stopPropagation();
                              onReviseRejectedOrRevisionPo(po);
                            }}
                          />
                          <Button
                            size="xs"
                            variant="danger_soft"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCancelPo(po.id);
                            }}
                            title="Un-bulk & Return items to Pending PR list"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Un-bulk / Reset
                          </Button>
                        </>
                      )}

                      {po.status === "DRAFTED" && (
                        <>
                          <Button
                            size="xs"
                            action="authorize"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenAuthorizeModal(po);
                            }}
                            disabled={
                              !(canCreatePo || po.escalated_to === user?.role)
                            }
                          />
                          <Button
                            size="xs"
                            action="revise"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenReviseModal(po);
                            }}
                            disabled={!canCreatePo}
                          />
                        </>
                      )}

                      {(po.status === "ISSUED" ||
                        po.status === "PARTIAL" ||
                        po.status === "COMPLETED") && (
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          title="Send to Partner"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEmailModal(po);
                          }}
                          className="text-blue-700 bg-blue-50 border-blue-200/70 hover:bg-blue-100"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                      )}

                      {(po.status === "DRAFTED" ||
                        po.status === "REVISION" ||
                        po.status === "ISSUED") && (
                        <Button
                          size="xs"
                          action="cancel"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelPo(po.id);
                          }}
                          disabled={!canCreatePo}
                        />
                      )}

                      {(po.status === "COMPLETED" ||
                        po.status === "CANCELLED") && (
                        <Button
                          size="icon-sm"
                          variant="amber_soft"
                          onClick={(e) => {
                            e.stopPropagation();
                            onArchivePo(po.id);
                          }}
                          title="Archive Purchase Order"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
