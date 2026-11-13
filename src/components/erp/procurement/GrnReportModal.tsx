import React, { memo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { Download, FileCheck2, X } from "lucide-react";

interface GrnReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  completedGrnData: any;
  grnReportRef: React.RefObject<HTMLDivElement | null>;
  isSubmitting: boolean;
  exportGrnPdf: () => void;
  language: string;
}

export const GrnReportModal = memo(function GrnReportModal({
  isOpen,
  onClose,
  completedGrnData,
  grnReportRef,
  isSubmitting,
  exportGrnPdf,
}: GrnReportModalProps) {
  if (!completedGrnData) return null;

  const qcStatus = String(completedGrnData?.qc_status || "PASSED").toUpperCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      hideCloseButton={true}
      title={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-700 shrink-0">
              <FileCheck2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-stone-900 tracking-tight">
                  {completedGrnData?.is_reissue
                    ? "Goods Receipt Note — Replacement Report"
                    : "Official Goods Receiving Note (GRN)"}
                </span>
                <Badge
                  variant={
                    qcStatus === "PASSED"
                      ? "success"
                      : qcStatus === "CONDITIONAL"
                        ? "warning"
                        : "danger"
                  }
                  size="sm"
                >
                  QC {qcStatus}
                </Badge>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-stone-500 mt-0.5 truncate">
                Ref: {completedGrnData?.grn_id || completedGrnData?.id || "GRN"} · PO:{" "}
                {completedGrnData?.po_number || "-"} · A4 Portrait Standard
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="dark"
              size="sm"
              onClick={exportGrnPdf}
              isLoading={isSubmitting}
              leftIcon={!isSubmitting ? <Download className="w-3.5 h-3.5" /> : undefined}
            >
              {isSubmitting ? "Generating PDF..." : "Export PDF (A4)"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              leftIcon={<X className="w-3.5 h-3.5" />}
            >
              Close
            </Button>
          </div>
        </div>
      }
      contentClassName="p-0 flex flex-col h-[84vh] border-t border-stone-200/80"
    >
      <div className="flex-1 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
          <PrintTemplate
            ref={grnReportRef}
            documentTitleId="GOODS RECEIVING NOTE"
            documentTitleEn="GOODS RECEIVING NOTE"
            documentNameId="goods receiving note"
            documentNameEn="goods receiving note"
            date={new Date(
              completedGrnData?.created_at || Date.now()
            ).toLocaleDateString("en-US", {
              timeZone: "Asia/Jakarta",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            referenceNumber={completedGrnData?.grn_id || completedGrnData?.id}
            documentId={completedGrnData?.grn_id || completedGrnData?.id}
            signatureStatus="signed"
          >
            {/* PO & Supplier Core Info */}
            <div className="grid grid-cols-2 gap-6 bg-white rounded-xl p-4 border border-stone-200 mb-5 font-sans">
              <div className="flex flex-col gap-1">
                <div className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
                  Purchase Order Reference
                </div>
                <div className="text-base font-mono font-bold text-stone-900 tabular-nums">
                  {completedGrnData?.po_number}
                </div>
                <div className="text-[11px] font-mono text-stone-600 tabular-nums">
                  PR Ref: {completedGrnData?.pr_numbers || "-"}
                </div>
                <div className="text-[10px] text-stone-700 font-bold uppercase tracking-wider">
                  Project:{" "}
                  <span className="font-mono text-stone-900">
                    {completedGrnData?.project_ids ||
                      completedGrnData?.project_name ||
                      "-"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-right items-end">
                <div className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
                  Supplier Partner
                </div>
                <div className="text-base font-bold text-stone-900 line-clamp-1">
                  {completedGrnData?.supplier_name}
                </div>
                <div className="text-[10px] font-mono font-bold text-stone-700">
                  Received Date: {completedGrnData?.received_date || "-"}
                </div>
                <div className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 mt-0.5">
                  QC DISPOSITION: {qcStatus}
                </div>
              </div>
            </div>

            {completedGrnData?.rejected_grn_doc && (
              <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-xl mb-5 w-full">
                <div className="text-[9px] text-rose-600 uppercase tracking-widest font-bold mb-0.5">
                  Previous Rejected GRN Reference
                </div>
                <div className="text-[11px] font-mono font-bold text-rose-800 truncate">
                  {completedGrnData.rejected_grn_doc}
                </div>
              </div>
            )}

            {/* Consigned Components Table */}
            <div className="flex-1 min-h-0 flex flex-col justify-start gap-4 mb-5 w-full">
              <div>
                <div className="text-[10px] text-stone-900 uppercase tracking-widest font-bold mb-2">
                  Inspected Material Items &amp; Split QC Quantities
                </div>
                <table className="w-full text-left border-collapse border border-stone-200 text-xs">
                  <thead>
                    <tr className="border-b border-stone-300 bg-stone-50">
                      <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[10px]">
                        Material &amp; BOM Spec
                      </th>
                      <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[10px] w-28">
                        Batch / COA
                      </th>
                      <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[10px] text-right w-24">
                        Delivered
                      </th>
                      <th className="py-2 px-3 font-bold text-emerald-800 uppercase tracking-wider text-[10px] text-right w-24">
                        QC Passed
                      </th>
                      <th className="py-2 px-3 font-bold text-rose-700 uppercase tracking-wider text-[10px] text-right w-24">
                        Rejected
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {(completedGrnData?.items || []).map((item: any, idx: number) => {
                      const deliv = Number(item.qty_received || 0);
                      const rej =
                        item.qty_rejected !== undefined
                          ? Number(item.qty_rejected)
                          : item.effective_qty_rejected !== undefined
                            ? Number(item.effective_qty_rejected)
                            : qcStatus === "REJECTED"
                              ? deliv
                              : 0;
                      const pass =
                        item.qty_passed !== undefined
                          ? Number(item.qty_passed)
                          : item.effective_qty_passed !== undefined
                            ? Number(item.effective_qty_passed)
                            : Math.max(0, deliv - rej);
                      return (
                        <tr key={item.id || idx}>
                          <td className="py-2.5 px-3">
                            <div className="font-mono font-bold text-stone-900 text-[11px] tabular-nums">
                              {item.item_code}
                            </div>
                            <div className="text-xs font-bold text-stone-800">
                              {item.item_name}
                            </div>
                            {(item.dimension || item.spec) && (
                              <div className="text-[10px] font-mono text-stone-500 mt-0.5">
                                {[item.dimension, item.spec]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-stone-700 tabular-nums">
                            {item.batch_lot_number || "-"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-900 tabular-nums">
                            {deliv} {item.uom}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 tabular-nums">
                            {pass} {item.uom}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700 tabular-nums">
                            {rej} {item.uom}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {completedGrnData?.remarks && (
                <div className="p-3.5 bg-white border border-stone-200 rounded-xl">
                  <div className="text-[9px] text-stone-500 uppercase tracking-widest font-bold mb-1">
                    Inspector Remarks &amp; Observations
                  </div>
                  <div className="text-xs text-stone-700 font-medium leading-relaxed">
                    {completedGrnData.remarks}
                  </div>
                </div>
              )}
            </div>
          </PrintTemplate>
        </PdfPreviewWrapper>
      </div>
    </Modal>
  );
});
