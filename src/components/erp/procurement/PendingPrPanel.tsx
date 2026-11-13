import React, { memo } from "react";
import {
  Archive,
  CheckSquare,
  Square,
  FileText,
  Share2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/shared/Loader";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { cn } from "@/lib/utils";

interface PendingPrQueuePanelProps {
  isLoading: boolean;
  pendingPrs: any[];
  selectablePrs: any[];
  selectedPrItems: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelection: (prItemId: string) => void;
  onArchiveFinishedPrs: () => void;
  onRefresh: () => void;
  onSharePr: (pr: any) => void;
  onViewPrDetails: (prId: string) => void;
  onArchivePr: (prId: string) => void;
}

export const PendingPrQueuePanel = memo(function PendingPrQueuePanel({
  isLoading,
  pendingPrs,
  selectablePrs,
  selectedPrItems,
  onToggleSelectAll,
  onToggleSelection,
  onArchiveFinishedPrs,
  onRefresh,
  onSharePr,
  onViewPrDetails,
  onArchivePr,
}: PendingPrQueuePanelProps) {
  return (
    <div className="w-full lg:w-[calc(50%-1rem)] shrink-0 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
            Pending Purchase Requests ({pendingPrs.length})
          </h3>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Includes BOM shortages &amp; shop floor requests auto-synced from Production.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="amber_soft"
            size="xs"
            lockKey="archive-finished-prs"
            onClick={onArchiveFinishedPrs}
            leftIcon={<Archive className="w-3.5 h-3.5" />}
            title="Archive Finished Requests"
          >
            <span className="hidden sm:inline">Archive Finished</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            lockKey="refresh-procurement-prs"
            onClick={onRefresh}
            className="h-8 px-2.5 border border-stone-200/80 text-stone-600 hover:text-stone-900 rounded-lg"
            title="Refresh Data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <Loader text="Loading purchase requests..." className="py-12" />
        </div>
      ) : pendingPrs.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
          <div className="w-11 h-11 bg-stone-50 border border-stone-200 text-stone-400 rounded-xl flex items-center justify-center mx-auto mb-3">
            <CheckSquare className="w-5 h-5 text-stone-400" />
          </div>
          <div className="text-xs font-bold text-stone-900 uppercase tracking-wider">
            All Caught Up
          </div>
          <div className="text-[11px] text-stone-500 mt-1">
            No pending purchase requests in the queue.
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow hoverable={false}>
              <TableHead className="w-10 text-center">
                <button
                  type="button"
                  onClick={onToggleSelectAll}
                  className="text-stone-500 hover:text-stone-900 inline-flex items-center justify-center"
                >
                  {selectablePrs.length > 0 &&
                  selectedPrItems.size === selectablePrs.length ? (
                    <CheckSquare className="w-4 h-4 text-stone-900" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </TableHead>
              <TableHead>PR Document &amp; Source</TableHead>
              <TableHead>Material Specification</TableHead>
              <TableHead className="text-right">Deficit / Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingPrs.map((pr) => {
              const isSelected = selectedPrItems.has(pr.pr_item_id);
              const isCancelled = pr.status === "CANCELLED";
              const isGeneralRequest = Boolean(pr.general_request_code || (pr.project_id === "GENERAL" && pr.pr_number?.startsWith("PR-GEN")));
              const originLabel =
                isGeneralRequest
                  ? `General Req: ${pr.general_request_department || "Internal"}`
                  : pr.category === "PRODUCTION_BOM_SHORTAGE"
                  ? "BOM Shortage"
                  : pr.category === "FLOOR_REQUEST"
                  ? "Shop Floor Req"
                  : pr.category || "Standard PR";

              return (
                <TableRow
                  key={pr.pr_item_id}
                  className={cn(
                    isSelected && "bg-amber-50/40",
                    isCancelled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                  )}
                  onClick={() => !isCancelled && onToggleSelection(pr.pr_item_id)}
                >
                  <TableCell className="text-center">
                    <div
                      className={cn(
                        "inline-flex",
                        isSelected ? "text-stone-900" : "text-stone-400",
                        isCancelled && "opacity-50"
                      )}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div
                          className={cn(
                            "text-xs font-mono font-bold tabular-nums flex items-center gap-2 flex-wrap",
                            isCancelled ? "line-through text-stone-400" : "text-stone-900"
                          )}
                        >
                          <span>{pr.pr_number}</span>
                          {isGeneralRequest && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded uppercase tracking-wider">
                              Dept: {pr.general_request_department || "Internal"}
                            </span>
                          )}
                          {(pr.urgency === "URGENT" || pr.urgency === "CRITICAL") && (
                            <span
                              className={cn(
                                "px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider",
                                pr.urgency === "CRITICAL"
                                  ? "bg-rose-600 text-white"
                                  : "bg-amber-500 text-white"
                              )}
                            >
                              {pr.urgency}
                            </span>
                          )}
                          {isCancelled && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-stone-100 text-stone-500 border border-stone-200 rounded uppercase">
                              Cancelled
                            </span>
                          )}
                        </div>

                        {/* Zero-Pill Metadata Line */}
                        <div className="text-[11px] text-stone-500 font-mono tabular-nums">
                          <span className="font-semibold text-stone-700">
                            {pr.project_name || pr.project_id}
                          </span>
                          <span> · </span>
                          <span
                            className={cn(
                              "font-semibold",
                              isGeneralRequest
                                ? "text-amber-800"
                                : pr.category === "PRODUCTION_BOM_SHORTAGE" ||
                                  pr.category === "FLOOR_REQUEST"
                                ? "text-amber-700"
                                : "text-stone-600"
                            )}
                          >
                            {originLabel}
                          </span>
                          {pr.expected_delivery_date && (
                            <>
                              <span> · </span>
                              <span className="text-emerald-700 font-semibold">
                                Due {pr.expected_delivery_date}
                              </span>
                            </>
                          )}
                        </div>

                        {pr.general_request_title && (
                          <div className="text-[11px] text-stone-600 line-clamp-1">
                            <span className="font-bold text-stone-700">{pr.general_request_code}:</span> {pr.general_request_title}
                            {pr.requested_by ? ` (Oleh: ${pr.requested_by})` : ""}
                          </div>
                        )}

                        {pr.drawing_reference && (
                          <a
                            href={pr.drawing_reference}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-700 hover:text-stone-900 underline"
                          >
                            <FileText className="w-3 h-3 shrink-0" />
                            <span>Drawing Reference</span>
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSharePr(pr);
                          }}
                          title="Share to Forum"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="xs"
                          action="view"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewPrDetails(pr.pr_id);
                          }}
                        />
                        {(pr.status === "ORDERED" ||
                          pr.status === "RECEIVED" ||
                          pr.status === "CANCELLED") && (
                          <Button
                            size="icon-sm"
                            variant="amber_soft"
                            lockKey={`archive-pr-${pr.pr_id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onArchivePr(pr.pr_id);
                            }}
                            title="Archive Purchase Request"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    <div className="text-xs font-mono font-bold text-stone-900 tabular-nums">
                      {pr.item_code}
                    </div>
                    <div className="text-xs text-stone-700 font-medium mt-0.5">
                      {pr.item_name}
                    </div>
                    {(pr.dimension || pr.spec) && (
                      <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                        {[pr.dimension, pr.spec].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    <div className="text-xs font-bold text-stone-900">
                      {pr.qty}
                    </div>
                    <div className="text-[10px] text-stone-500 uppercase">
                      {pr.uom}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
});
