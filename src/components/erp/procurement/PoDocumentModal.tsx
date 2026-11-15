import React, { memo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { canViewDocFinancials } from "@/utils/rbacFinancials";
import { ConfidentialBadge } from "@/components/shared/ConfidentialBadge";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { Download, QrCode } from "lucide-react";
import { formatIDR, formatIDRWithDecimals } from "@/lib/utils";
import {
  calculateFinancialBreakdown,
  TaxScheme,
} from "@/lib/financialEngine";

interface PoDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPoDetails: any;
  poDocRef: React.RefObject<HTMLDivElement | null>;
  isSubmitting: boolean;
  exportPoPdf: () => void;
  language: string;
  isPrintModeHidden?: boolean;
  maskFinancials?: boolean;
}

export const PoDocumentModal = memo(function PoDocumentModal({
  isOpen,
  onClose,
  selectedPoDetails,
  poDocRef,
  isSubmitting,
  exportPoPdf,
  language,
  isPrintModeHidden,
  maskFinancials,
}: PoDocumentModalProps) {
  const { user } = useAuth();
  const canViewPrices =
    maskFinancials !== undefined
      ? !maskFinancials
      : canViewDocFinancials(user, "PO");

  if (!selectedPoDetails) return null;

  const printContent = (
    <PdfPreviewWrapper>
      <PrintTemplate
        ref={poDocRef}
            documentTitleId="PURCHASE ORDER"
            documentTitleEn="PURCHASE ORDER"
            documentNameId="purchase order"
            documentNameEn="purchase order"
            date={
              selectedPoDetails.created_at
                ? new Date(selectedPoDetails.created_at).toLocaleDateString(
                    "en-US",
                    {
                      timeZone: "Asia/Jakarta",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    },
                  )
                : ""
            }
            referenceNumber={selectedPoDetails.po_number || selectedPoDetails.id}
            documentId={selectedPoDetails.po_number || selectedPoDetails.id}
            isDraft={selectedPoDetails.status === "DRAFTED"}
          >
            {/* PO Details Header */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2">
                  Supplier Partner
                </div>
                <div className="text-xl font-black text-stone-900 uppercase">
                  {selectedPoDetails.supplier_name}
                </div>
                <div className="text-xs text-stone-600 mt-2 font-bold flex flex-col gap-0.5">
                  <div>Corporate Partner • Registered Supplier</div>
                  {selectedPoDetails.supplier_npwp && (
                    <div className="font-mono text-stone-700">
                      Tax ID: {selectedPoDetails.supplier_npwp}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2">
                  Expected Delivery
                </div>
                <div className="text-lg font-black text-stone-900 font-mono">
                  {selectedPoDetails.expected_date || "TBD"}
                </div>
                {selectedPoDetails.urgency && selectedPoDetails.urgency !== "NORMAL" && (
                  <div className="text-xs font-extrabold text-rose-600 uppercase tracking-wider mt-1">
                    {selectedPoDetails.urgency} PRIORITY REQUEST
                  </div>
                )}
              </div>
            </div>

            {/* Subject / Reference Area */}
            <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200">
              <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-1">
                Project & Purchase Requisition Reference
              </div>
              <div className="text-sm font-black text-stone-900 tracking-tight leading-tight uppercase flex items-center justify-between">
                <div>
                  <span className="text-stone-500 font-normal text-xs mr-2">Project System:</span>
                  {selectedPoDetails.project_ids || selectedPoDetails.project_name || "-"}
                </div>
                <div>
                  <span className="text-stone-500 font-normal text-xs mr-2">PR Ref:</span>
                  <span className="font-mono text-stone-900">{selectedPoDetails.pr_numbers || "-"}</span>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="flex-1 w-full">
              <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-3 ml-1">
                Purchase Order Specifications
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-stone-300 bg-white">
                    <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-xs">
                      Item & Description
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-20">
                      Qty
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-20">
                      UOM
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-xs w-32">
                      Price / Unit
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-xs w-36">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150">
                  {selectedPoDetails.items &&
                    selectedPoDetails.items.map((item: any, idx: number) => {
                      const unitPrice =
                        item.unit_price > 0
                          ? item.unit_price
                          : item.db_unit_price || 0;
                      return (
                        <tr key={item.id || idx}>
                          <td className="py-4 px-3">
                            <div className="font-mono font-bold text-stone-900 text-xs">{item.item_code}</div>
                            <div className="text-sm font-black text-stone-900 uppercase tracking-tight mt-0.5">{item.item_name}</div>
                            {(item.dimension || item.spec) && (
                              <div className="text-[10px] text-stone-500 mt-0.5 font-medium">
                                {[item.dimension, item.spec]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                            {item.qty}
                          </td>
                          <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">
                            {item.uom}
                          </td>
                          <td className="py-4 px-3 text-right text-stone-800 font-mono font-bold text-sm">
                            {canViewPrices
                              ? formatIDR(unitPrice || 0)
                              : <ConfidentialBadge />}
                          </td>
                          <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-sm">
                            {canViewPrices
                              ? formatIDR(item.qty * unitPrice)
                              : <ConfidentialBadge />}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>

              {/* Summary Calculations */}
              {(() => {
                const itemsSubtotal = selectedPoDetails.items
                  ? selectedPoDetails.items.reduce(
                      (sum: number, item: any) =>
                        sum +
                        Number(item.qty) *
                          (Number(item.unit_price) ||
                            Number(item.db_unit_price) ||
                            0),
                      0,
                    )
                  : 0;

                const baseAmount = itemsSubtotal > 0 ? itemsSubtotal : Number(selectedPoDetails.dpp || selectedPoDetails.total_amount || 0);
                const taxScheme = (selectedPoDetails.tax_scheme || "DPP_NILAI_LAIN") as TaxScheme;
                const ppnRate = selectedPoDetails.ppn_rate !== undefined && selectedPoDetails.ppn_rate !== null ? Number(selectedPoDetails.ppn_rate) : 12;
                const pphRate = selectedPoDetails.pph_rate !== undefined && selectedPoDetails.pph_rate !== null ? Number(selectedPoDetails.pph_rate) : 0;
                const roundingFactor = Number(selectedPoDetails.rounding_factor || 0);

                const breakdown = calculateFinancialBreakdown({
                  grossAmount: baseAmount,
                  taxScheme,
                  taxRate: ppnRate,
                  pphRate,
                  roundingFactor,
                });

                return (
                  <div className="mt-4 flex justify-end">
                    <div className="w-[460px] space-y-2">
                      <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                        <span className="text-stone-900 whitespace-nowrap">
                          Taxable Base (Net Total)
                        </span>
                        <span className="font-mono text-stone-950 font-bold whitespace-nowrap">
                          {canViewPrices
                            ? formatIDR(breakdown.dpp)
                            : <ConfidentialBadge />}
                        </span>
                      </div>

                      {breakdown.isDppNilaiLain && (
                        <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-medium text-stone-500 gap-2 bg-stone-50 py-1 rounded">
                          <span className="text-[10px] whitespace-nowrap">
                            Adjusted Tax Base (11/12):
                          </span>
                          <span className="font-mono font-bold text-stone-700 whitespace-nowrap">
                            {canViewPrices
                              ? formatIDRWithDecimals(breakdown.dppNilaiLain, 2)
                              : <ConfidentialBadge />}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                        <span className="text-stone-900 whitespace-nowrap">
                          VAT{" "}
                          <span className="font-semibold text-[10px] text-stone-500">
                            ({breakdown.isDppNilaiLain ? `12%` : `${breakdown.taxRate}%`})
                          </span>
                        </span>
                        <span className="font-mono text-stone-950 font-bold whitespace-nowrap">
                          {canViewPrices
                            ? `+ ${formatIDR(breakdown.ppnAmount)}`
                            : <ConfidentialBadge />}
                        </span>
                      </div>

                      {breakdown.roundingFactor !== 0 && (
                        <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-medium text-stone-500 gap-2">
                          <span className="whitespace-nowrap">Rounding Adjustment:</span>
                          <span className="font-mono whitespace-nowrap">
                            {canViewPrices
                              ? `${breakdown.roundingFactor > 0 ? "+" : ""}${formatIDR(breakdown.roundingFactor)}`
                              : <ConfidentialBadge />}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center bg-white text-stone-900 p-3.5 rounded-xl border border-stone-200 mt-2 shadow-xs font-bold gap-3">
                        <span className="text-xs font-black uppercase tracking-wider text-stone-900 whitespace-nowrap">
                          GRAND TOTAL <span className="font-bold text-[10px] text-stone-500 font-normal">/ TOTAL PO</span>
                        </span>
                        <span className="text-base font-black tracking-tight font-mono text-stone-900 whitespace-nowrap">
                          {canViewPrices
                            ? formatIDR(breakdown.grandTotal)
                            : <ConfidentialBadge size="sm" />}
                        </span>
                      </div>

                      {breakdown.pphRate > 0 && (
                        <div className="mt-2 p-2.5 bg-stone-50 border border-stone-200 rounded-lg space-y-1 text-xs">
                          <div className="flex justify-between items-center text-stone-600">
                            <span className="text-[11px] font-semibold">
                              Withholding Tax ({breakdown.pphRate}%):
                            </span>
                            <span className="font-mono font-bold text-rose-600">
                              {canViewPrices ? `- ${formatIDR(breakdown.pphAmount)}` : <ConfidentialBadge />}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-stone-200 text-stone-900 font-black">
                            <span className="text-[11px] uppercase tracking-wider">
                              Net Payable to Supplier:
                            </span>
                            <span className="font-mono text-sm text-emerald-700">
                              {canViewPrices ? formatIDR(breakdown.netPayable) : <ConfidentialBadge />}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Signatures */}
            <div className="mt-4 pt-3 border-t border-stone-200 grid grid-cols-2 gap-8 text-center">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
                  Created By
                </div>
                <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">Procurement Team</div>
                <div className="h-10 flex items-center justify-center my-0.5">
                  <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg">
                    <QrCode className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="text-left">
                      <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">Validated System</div>
                      <div className="text-[8px] font-mono text-emerald-700 leading-none">
                        {new Date(selectedPoDetails.created_at || Date.now()).toLocaleDateString("en-US")}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                  Procurement Officer
                </div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
                  Approved By
                </div>
                <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">Procurement Manager</div>
                <div className="h-10 flex items-center justify-center my-0.5">
                  {selectedPoDetails.auth_doc_name?.includes("Digitally") ? (
                    <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg">
                      <QrCode className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div className="text-left">
                        <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">Validated Securely</div>
                        <div className="text-[8px] font-mono text-emerald-700 leading-none">Digital Approval PIN</div>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-stone-300 rounded-lg px-3 py-1 bg-stone-50 flex items-center justify-center">
                      <span className="text-[9.5px] font-bold text-stone-400 uppercase tracking-wider">Awaiting PIN Authorization</span>
                    </div>
                  )}
                </div>
                <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                  Procurement Manager
                </div>
              </div>
            </div>
          </PrintTemplate>
    </PdfPreviewWrapper>
  );

  if (isPrintModeHidden) {
    return (
      <div style={{ position: "absolute", top: -9999, left: -9999, opacity: 0, pointerEvents: "none" }}>
        {printContent}
      </div>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Purchase Order: ${selectedPoDetails.po_number || selectedPoDetails.id}`}
      maxWidth="6xl"
      contentClassName="p-0 flex flex-col min-h-0 bg-stone-100"
      footer={
        <div className="w-full flex flex-wrap items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="dark"
            size="sm"
            onClick={exportPoPdf}
            isLoading={isSubmitting}
            leftIcon={!isSubmitting ? <Download className="w-4 h-4" /> : undefined}
          >
            {isSubmitting ? "Generating..." : "Export PDF (A4)"}
          </Button>
        </div>
      }
    >
      <div className="flex-1 min-h-0 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
        {printContent}
      </div>
    </Modal>
  );
});
