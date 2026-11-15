import React, { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { canViewDocFinancials } from "@/utils/rbacFinancials";
import { ConfidentialBadge } from "@/components/shared/ConfidentialBadge";
import { generatePDF } from "@/lib/pdfGenerator";
import { Download, QrCode, FolderKanban, ShieldCheck, Printer, Calculator } from "lucide-react";
import { formatIDR, formatIDRWithDecimals } from "@/lib/utils";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { calculateFinancialBreakdown } from "@/lib/financialEngine";

interface QuotationPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotation: any;
  onCreateProject?: (quotation: any) => void;
  onAuthorize?: (quotation: any) => void;
  onOpenReceipt?: (quotation: any) => void;
  isPrintModeHidden?: boolean;
  exportPdfRef?: React.MutableRefObject<any>;
  maskFinancials?: boolean;
}

// Precise business helper to calculate offset with Saturday & Sunday skipping
export const calculateWorkingDaysLimit = (
  startDateStr: string,
  workingDays: number,
): string => {
  const parsed = startDateStr ? new Date(startDateStr) : new Date();
  const date = isNaN(parsed.getTime()) ? new Date() : parsed;
  let daysToAdd = Math.min(Math.max(0, Number(workingDays) || 0), 365);
  let guard = 0;
  while (daysToAdd > 0 && guard < 600) {
    guard++;
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      // Sunday=0, Saturday=6
      daysToAdd--;
    }
  }
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

export const QuotationPreviewModal: React.FC<QuotationPreviewModalProps> = ({
  isOpen,
  onClose,
  quotation,
  onCreateProject,
  onAuthorize,
  onOpenReceipt,
  isPrintModeHidden,
  exportPdfRef,
  maskFinancials,
}) => {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const { user } = useAuth();
  const canViewPrices =
    maskFinancials !== undefined
      ? !maskFinancials
      : canViewDocFinancials(user, "QUOTATION");
  const internalPrintDocRef = useRef<HTMLDivElement>(null);
  const printDocRef = exportPdfRef || internalPrintDocRef;
  const [isExporting, setIsExporting] = useState(false);

  if (!quotation) return null;

  // Simple localized translations
  const dict: Record<string, Record<string, string>> = {
    en: {
      quotation: "OFFICIAL QUOTATION",
      validity: "Validity period",
      preparedFor: "PREPARED FOR",
      date: "Date Issued",
      refNo: "Quotation Reference",
      subject: "PROJECT TITLE",
      grandTotal: "Grand Total (IDR)",
      officialHeader: "Official Document - Validated online",
      officialFooter:
        "This document is an official price quotation. Confidential information for recipient.",
      terms: "Terms & Additional Remarks",
      businessDays: "working days",
      termsTitle: "GENERAL TERMS & CONDITIONS",
      validityDays: "Validity",
      status: "Status",
    },
    id: {
      quotation: "OFFICIAL QUOTATION",
      validity: "Validity",
      preparedFor: "PREPARED FOR",
      date: "Issue Date",
      refNo: "Quotation Reference",
      subject: "PROJECT TITLE",
      grandTotal: "Grand Total (IDR)",
      officialHeader: "Official Document - Validated online",
      officialFooter:
        "This document is an official price quotation. Confidential information for recipient.",
      terms: "Terms & Additional Remarks",
      businessDays: "working days",
      termsTitle: "GENERAL TERMS & CONDITIONS",
      validityDays: "Validity",
      status: "Status",
    },
  };

  const tLocal = (key: string) => {
    return dict[language]?.[key] || dict["en"][key];
  };

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsExporting(true);
    try {
      await generatePDF(
        printDocRef.current,
        `Quotation_${quotation.quotation_number}.pdf`,
      );
      showToast("Quotation PDF generated successfully", "success");
    } catch (err) {
      console.error(err);
      showToast("PDF generation failed", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const breakdown = calculateFinancialBreakdown({
    items: quotation.items?.map((item: any) => ({
      qty: Number(item.qty || 1),
      unit_price: Number(item.unit_price || 0),
    })),
    grossAmount: quotation.gross_amount,
    discountRate: quotation.discount_rate || 0,
    taxRate: quotation.tax_rate ?? 12,
    pphRate: quotation.pph_rate ?? 0,
    taxScheme: quotation.tax_scheme || (quotation.tax_rate > 0 ? "DPP_NILAI_LAIN" : "NON_PKP"),
    dpp: quotation.dpp,
    roundingFactor: quotation.rounding_factor,
    grandTotal: quotation.grand_total || quotation.amount,
  });

  const baseSubtotal = breakdown.grossAmount;
  const discountDisp = breakdown.discountAmount;
  const subtotalDisp = breakdown.dpp;
  const dppNilaiLainDisp = breakdown.dppNilaiLain;
  const taxDisp = breakdown.ppnAmount;
  const pphDisp = breakdown.pphAmount;
  const roundingFactor = breakdown.roundingFactor;
  const formattedAmount = formatIDRWithDecimals(breakdown.grandTotal, 2);
  const issueDateStr = quotation.created_at
    ? new Date(quotation.created_at).toLocaleDateString("en-US", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
  const validityLimit = calculateWorkingDaysLimit(
    quotation.created_at || new Date().toISOString(),
    quotation.validity_days || 20,
  );

  const printContent = (
    <PdfPreviewWrapper>
      <PrintTemplate
        ref={printDocRef}
            documentTitleId="OFFICIAL QUOTATION"
            documentTitleEn="OFFICIAL QUOTATION"
            documentNameId="official price quotation"
            documentNameEn="official price quotation"
            date={issueDateStr}
            referenceNumber={quotation.quotation_number}
            documentId={quotation.quotation_number || quotation.id}
            isDraft={
              quotation.status !== "APPROVED" && quotation.status !== "PROCESSED"
            }
          >
            <div className="grid grid-cols-2 gap-6 mb-5">
              <div>
                <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-1.5">
                  Prepared For
                </div>
                <div className="text-xl font-black text-stone-900 uppercase">
                  {quotation.customer_name}
                </div>
                <div className="text-xs text-stone-600 mt-1 font-bold">
                  Corporate Client & Commercial Partner
                </div>
                {(quotation.customer_npwp || quotation.npwp_tax_id) && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-mono font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                    <span className="font-sans text-[9px] uppercase tracking-wider text-stone-500 font-black">
                      Tax ID:
                    </span>
                    {quotation.customer_npwp || quotation.npwp_tax_id}
                  </div>
                )}
              </div>
              <div className="text-right space-y-2">
                <div>
                  <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-1">
                    Validity
                  </div>
                  <div className="text-base font-black text-stone-900">
                    {validityLimit}
                  </div>
                  <div className="text-xs text-stone-600 uppercase tracking-wider font-bold">
                    ({quotation.validity_days || 20} Business Days)
                  </div>
                </div>
                {(quotation.payment_terms || quotation.payment_method) && (
                  <div className="pt-1">
                    <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black">
                      Payment Method / Terms
                    </div>
                    <div className="text-xs font-black text-stone-900 uppercase">
                      {quotation.payment_terms || quotation.payment_method}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Subject Area */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-stone-200">
              <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-1">
                Project Title / Job Description
              </div>
              <div className="text-base font-black text-stone-900 tracking-tight leading-tight uppercase">
                {quotation.title}
              </div>
            </div>

            {/* Items Table */}
            <div className="flex-1">
              <div className="text-xl text-stone-900 uppercase tracking-widest font-black mb-4 ml-1">
                Scope of Project Delivery
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-stone-300 bg-white">
                    <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm">
                      Description
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-sm w-16">
                      Qty
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-sm w-20">
                      UOM
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm w-32">
                      Price / Unit
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm w-36">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150">
                  {quotation.items?.map((item: any, i: number) => {
                    const itemPrice = Number(item.unit_price || 0);
                    const itemQty = Number(item.qty || 1);
                    const itemSubtotal = itemPrice * itemQty;
                    return (
                      <tr key={i}>
                        <td className="py-4 px-3 text-base font-black text-stone-900 uppercase tracking-tight">
                          {item.title}
                        </td>
                        <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                          {itemQty}
                        </td>
                        <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">
                          {item.uom || "Unit"}
                        </td>
                        <td className="py-4 px-3 text-right text-stone-800 font-mono font-bold text-sm whitespace-nowrap">
                          {canViewPrices ? (
                            itemPrice > 0 ? (
                              formatIDR(itemPrice)
                            ) : (
                              "Rp\u00A00"
                            )
                          ) : (
                            <ConfidentialBadge />
                          )}
                        </td>
                        <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-sm whitespace-nowrap">
                          {canViewPrices ? (
                            itemSubtotal > 0 ? (
                              formatIDR(itemSubtotal)
                            ) : (
                              "Rp\u00A00"
                            )
                          ) : (
                            <ConfidentialBadge />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(!quotation.items || quotation.items.length === 0) && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-sm text-stone-400 font-medium italic"
                      >
                        No detailed scope provided.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="mt-4 flex justify-end">
                <div className="w-[450px] space-y-2">
                  <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                    <span className="text-stone-900 whitespace-nowrap">
                      Gross Subtotal
                    </span>
                    <span className="font-mono text-stone-950 font-bold whitespace-nowrap">
                      {canViewPrices ? (
                        formatIDRWithDecimals(baseSubtotal, 2)
                      ) : (
                        <ConfidentialBadge />
                      )}
                    </span>
                  </div>
                  {quotation.discount_rate > 0 && (
                    <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                      <span className="text-stone-900 font-bold whitespace-nowrap">
                        DISCOUNT ({quotation.discount_rate}%)
                      </span>
                      <span className="font-mono text-rose-600 font-bold whitespace-nowrap">
                        {canViewPrices ? (
                          `- ${formatIDRWithDecimals(discountDisp, 2)}`
                        ) : (
                          <ConfidentialBadge />
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                    <span className="text-stone-900 font-bold whitespace-nowrap">
                      TAXABLE BASE
                    </span>
                    <span className="font-mono text-stone-950 font-bold whitespace-nowrap">
                      {canViewPrices ? (
                        formatIDRWithDecimals(subtotalDisp, 2)
                      ) : (
                        <ConfidentialBadge />
                      )}
                    </span>
                  </div>

                  {breakdown.isDppNilaiLain && (
                    <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2 bg-stone-100/70 py-1 rounded">
                      <span className="text-stone-800 font-bold whitespace-nowrap text-[10px]">
                        Other Tax Base (11/12)
                      </span>
                      <span className="font-mono text-stone-900 font-bold whitespace-nowrap">
                        {canViewPrices ? (
                          formatIDRWithDecimals(dppNilaiLainDisp, 2)
                        ) : (
                          <ConfidentialBadge />
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                    <span className="text-stone-900 whitespace-nowrap">
                      VAT ({quotation.tax_rate ?? 12}%)
                    </span>
                    <span className="font-mono text-stone-950 font-bold whitespace-nowrap">
                      {canViewPrices ? (
                        `+ ${formatIDRWithDecimals(taxDisp, 2)}`
                      ) : (
                        <ConfidentialBadge />
                      )}
                    </span>
                  </div>

                  {roundingFactor !== 0 && (
                    <div className="flex justify-between items-center text-xs uppercase tracking-wider px-3 font-bold gap-2">
                      <span className="text-stone-900 font-bold whitespace-nowrap">
                        ROUNDING ADJUSTMENT
                      </span>
                      <span className="font-mono text-stone-950 font-bold whitespace-nowrap">
                        {canViewPrices ? (
                          `${roundingFactor > 0 ? "+" : ""}${formatIDRWithDecimals(roundingFactor, 2)}`
                        ) : (
                          <ConfidentialBadge />
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center bg-white text-stone-900 p-3.5 rounded-xl border border-stone-200 mt-2 shadow-xs font-bold gap-3">
                    <span className="text-xs font-black uppercase tracking-wider text-stone-900 whitespace-nowrap">
                      GRAND TOTAL
                    </span>
                    <span className="text-base font-black tracking-tight font-mono text-stone-900 whitespace-nowrap">
                      {canViewPrices ? formattedAmount : <ConfidentialBadge size="sm" />}
                    </span>
                  </div>

                  {pphDisp > 0 && (
                    <div className="mt-2 p-2.5 bg-stone-50 border border-stone-200 rounded-lg space-y-1 text-xs">
                      <div className="flex justify-between items-center text-stone-600">
                        <span className="text-[11px] font-semibold">
                          Withholding Tax ({quotation.pph_rate ?? 0}%):
                        </span>
                        <span className="font-mono font-bold text-amber-700">
                          {canViewPrices ? (
                            `- ${formatIDRWithDecimals(pphDisp, 2)}`
                          ) : (
                            <ConfidentialBadge />
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-stone-200 text-stone-900 font-black">
                        <span className="text-[11px] uppercase tracking-wider">
                          Estimated Net Cash Received:
                        </span>
                        <span className="font-mono text-sm text-emerald-700">
                          {canViewPrices ? (
                            formatIDRWithDecimals(breakdown.netPayable, 2)
                          ) : (
                            <ConfidentialBadge />
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="mt-4 pt-3 border-t border-stone-200">
              <div className="grid grid-cols-2 gap-6 mt-2">
                <div>
                  <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-1.5">
                    General Terms & Conditions
                  </div>
                  <div className="text-xs text-stone-800 font-semibold space-y-1.5 uppercase leading-relaxed tracking-tight">
                    <div>
                      <span className="text-stone-900 block font-bold">
                        • Payment Terms: {quotation.payment_terms || quotation.payment_method || "Net 30 Days"}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-900 block font-bold">
                        • Prices include standard delivery to warehouse site.
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-900 block font-bold">
                        • All timeline calculations begin after Work Order / NTP authorization.
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-1.5">
                    Additional Remarks
                  </div>
                  <div className="text-xs text-stone-800 font-bold italic leading-relaxed border-l-2 border-stone-300 pl-3 bg-white py-2 rounded-r-lg">
                    {quotation.remarks ? (
                      quotation.remarks
                    ) : (
                      <div>
                        <span className="text-stone-900 block">
                          Standard commercial terms apply.
                        </span>
                      </div>
                    )}
                  </div>
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
      maxWidth="6xl"
      title="Quotation Document"
      contentClassName="p-0 flex flex-col min-h-0 bg-stone-100"
      footer={
        <div className="w-full flex flex-wrap items-center justify-end gap-2.5">
          {onAuthorize && (quotation?.status === "PENDING" || quotation?.status === "DRAFT") && (
            <Button
              variant="info"
              size="sm"
              onClick={() => {
                onAuthorize(quotation);
              }}
              leftIcon={<ShieldCheck className="w-4 h-4" />}
            >
              Authorize Quotation
            </Button>
          )}
          {onCreateProject && (quotation?.status === "APPROVED" || quotation?.status === "AUTHORIZED") && (
            <Button
              variant="success"
              size="sm"
              onClick={() => {
                onCreateProject(quotation);
              }}
              leftIcon={<FolderKanban className="w-4 h-4" />}
            >
              Create Project
            </Button>
          )}
          {canViewPrices && onOpenReceipt && (quotation?.receipt_number || quotation?.sales_channel === "DIRECT_RETAIL" || quotation?.settlement_type === "IMMEDIATE") && (
            <Button
              variant="emerald_soft"
              size="sm"
              onClick={() => onOpenReceipt(quotation)}
              leftIcon={<Printer className="w-4 h-4 text-emerald-600" />}
            >
              <span>Print Receipt</span>
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="dark"
            size="sm"
            onClick={handleExportPdf}
            isLoading={isExporting}
            leftIcon={!isExporting ? <Download className="w-4 h-4" /> : undefined}
          >
            {isExporting ? "Generating..." : "Export PDF (A4)"}
          </Button>
        </div>
      }
    >
      <div className="flex-1 min-h-0 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
        {printContent}
      </div>
    </Modal>
  );
};
