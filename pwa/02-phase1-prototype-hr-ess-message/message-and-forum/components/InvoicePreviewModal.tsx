import React, { useRef, useState } from "react";
import { Download, QrCode } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { generatePDF } from "@/lib/pdfGenerator";
import { formatNumberWithDots } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { canViewDocFinancials, ConfidentialBadge } from "@/utils/rbacFinancials";

function angkaKeTerbilang(nilai: number): string {
  const n = Math.floor(nilai);
  if (n === 0) return "Zero";

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function convertChunk(num: number): string {
    if (num === 0) return "";
    if (num < 20) return ones[num];
    if (num < 100) {
      return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? " " + ones[num % 10] : "");
    }
    return (
      ones[Math.floor(num / 100)] +
      " Hundred" +
      (num % 100 !== 0 ? " " + convertChunk(num % 100) : "")
    );
  }

  let temp = "";
  if (n < 1000) {
    temp = convertChunk(n);
  } else if (n < 1000000) {
    temp =
      convertChunk(Math.floor(n / 1000)) +
      " Thousand " +
      angkaKeTerbilang(n % 1000);
  } else if (n < 1000000000) {
    temp =
      convertChunk(Math.floor(n / 1000000)) +
      " Million " +
      angkaKeTerbilang(n % 1000000);
  } else if (n < 1000000000000) {
    temp =
      convertChunk(Math.floor(n / 1000000000)) +
      " Billion " +
      angkaKeTerbilang(n % 1000000000);
  } else {
    temp =
      convertChunk(Math.floor(n / 1000000000000)) +
      " Trillion " +
      angkaKeTerbilang(n % 1000000000000);
  }

  return temp.replace(/\bZero\b/g, "").replace(/\s+/g, " ").trim();
}

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: any | null;
  bankAccounts?: any[];
}

export function InvoicePreviewModal({
  isOpen,
  onClose,
  invoice,
  bankAccounts = [],
}: InvoicePreviewModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const printDocRef = useRef<HTMLDivElement>(null);
  const [isSubmittingPdf, setIsSubmittingPdf] = useState(false);

  if (!isOpen || !invoice) return null;

  const canViewPrices = canViewDocFinancials(user, "INVOICE");

  const grossAmount = Number(invoice.gross_amount ?? invoice.dpp ?? invoice.amount ?? 0);
  const discountRate = Number(invoice.discount_rate ?? 0);
  const discountAmount = Number(invoice.discount_amount ?? 0);
  const dpp = Number(invoice.dpp ?? invoice.amount ?? 0);
  const ppnRate = Number(invoice.ppn_rate ?? 12);
  const pphRate = Number(invoice.pph_rate ?? 0);
  const ppn = Number(invoice.ppn ?? 0);
  const pph = Number(invoice.pph ?? 0);
  const roundingFactor = Number(invoice.rounding_factor ?? 0);
  const grandTotal = Number(invoice.grand_total ?? invoice.total_amount ?? dpp + ppn);
  const netPayable = Math.max(0, grandTotal - pph);

  const bankAcc =
    bankAccounts.find((b) => b.id === invoice.bank_account_id) ||
    (invoice.bank_name
      ? {
          bank_name: invoice.bank_name,
          account_number: invoice.account_number,
          account_holder: invoice.account_holder,
          branch: invoice.branch,
        }
      : bankAccounts[0]);

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsSubmittingPdf(true);
    try {
      await generatePDF(
        printDocRef.current,
        `Commercial_Invoice_${invoice.ci_number || invoice.id}`,
      );
      showToast("Invoice PDF generated successfully", "success");
    } catch {
      showToast("Failed to export Invoice PDF", "error");
    } finally {
      setIsSubmittingPdf(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Commercial Invoice Document: ${invoice.ci_number || invoice.id}`}
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
            onClick={handleExportPdf}
            isLoading={isSubmittingPdf}
            leftIcon={!isSubmittingPdf ? <Download className="w-4 h-4" /> : undefined}
          >
            {isSubmittingPdf ? "Generating..." : "Export PDF (A4)"}
          </Button>
        </div>
      }
    >
      <div className="flex-1 min-h-0 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
          <PrintTemplate
            ref={printDocRef}
            documentTitleId="COMMERCIAL INVOICE"
            documentTitleEn="COMMERCIAL INVOICE"
            documentNameId="COMMERCIAL INVOICE"
            documentNameEn="COMMERCIAL INVOICE"
            date={
              invoice.issue_date
                ? new Date(invoice.issue_date).toLocaleDateString("en-US", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })
                : new Date().toLocaleDateString("en-US")
            }
            referenceNumber={invoice.ci_number || ""}
            documentId={invoice.ci_number || invoice.id || ""}
          >
            <div className="bg-white p-8 text-sm text-black flex flex-col h-full justify-between">
              <div>
                {/* Subject Area (60:40 Ratio) */}
                <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200 grid grid-cols-5 gap-8">
                  <div className="col-span-3">
                    <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                      BILLED TO
                    </div>
                    <div className="text-base font-black text-stone-900 tracking-tight leading-tight uppercase mb-1">
                      {invoice.customer_name || "Customer"}
                    </div>
                    <div className="text-xs text-stone-600 leading-relaxed font-medium">
                      {invoice.customer_address || "Indonesia"}
                    </div>
                    {(invoice.customer_phone || invoice.customer_email) && (
                      <div className="text-xs text-stone-500 mt-1 font-mono">
                        {invoice.customer_phone}{" "}
                        {invoice.customer_email ? `| ${invoice.customer_email}` : ""}
                      </div>
                    )}
                  </div>

                  <div className="col-span-2 text-right flex flex-col items-end justify-center">
                    <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                      JOB DESCRIPTION
                    </div>
                    <div className="text-sm font-black text-stone-900">
                      {invoice.job_description || "Commercial Trade Delivery"}
                    </div>
                    <div className="mt-2 text-xs font-semibold text-stone-600">
                      Delivery Note / DN:{" "}
                      <span className="font-mono font-bold text-stone-900">
                        {invoice.dn_number || "-"}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-stone-600">
                      Due Date:{" "}
                      <span className="font-bold text-stone-900">
                        {invoice.due_date
                          ? new Date(invoice.due_date).toLocaleDateString("en-US")
                          : "-"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="flex-1 mb-6">
                  <div className="text-xl text-stone-900 uppercase tracking-widest font-black mb-4 ml-1">
                    Invoice Details
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-stone-300 bg-white">
                        <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm w-12 text-center">
                          No
                        </th>
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
                          Unit Price
                        </th>
                        <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm w-36">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-150">
                      {invoice.items && invoice.items.length > 0 ? (
                        invoice.items.map((item: any, idx: number) => {
                          const unitPrice =
                            item.unit_price !== undefined &&
                            item.unit_price !== null &&
                            Number(item.unit_price) > 0
                              ? Number(item.unit_price)
                              : Math.round(grossAmount / (invoice.items.length || 1));
                          const totalRow = item.subtotal
                            ? Number(item.subtotal)
                            : (item.qty || 1) * unitPrice;
                          return (
                            <tr key={idx}>
                              <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="py-4 px-3 text-base font-black text-stone-900 uppercase tracking-tight">
                                {item.item_name || item.remarks || "Item Delivery"}
                                {item.item_code && (
                                  <div className="text-[10px] text-stone-500 font-mono font-normal tracking-wider mt-1">
                                    {item.item_code}
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                                {item.qty || 1}
                              </td>
                              <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">
                                {item.uom || "SET"}
                              </td>
                              <td className="py-4 px-3 text-right text-stone-800 font-mono font-bold text-sm">
                                {canViewPrices ? (
                                  formatNumberWithDots(unitPrice)
                                ) : (
                                  <ConfidentialBadge />
                                )}
                              </td>
                              <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-sm">
                                {canViewPrices ? (
                                  formatNumberWithDots(totalRow)
                                ) : (
                                  <ConfidentialBadge />
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                            1
                          </td>
                          <td className="py-4 px-3 text-base font-black text-stone-900 uppercase tracking-tight">
                            {invoice.job_description ||
                              "Commercial Delivery / Contract Service"}
                          </td>
                          <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                            1
                          </td>
                          <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">
                            SET
                          </td>
                          <td className="py-4 px-3 text-right text-stone-800 font-mono font-bold text-sm">
                            {canViewPrices ? (
                              formatNumberWithDots(grossAmount)
                            ) : (
                              <ConfidentialBadge />
                            )}
                          </td>
                          <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-sm">
                            {canViewPrices ? (
                              formatNumberWithDots(grossAmount)
                            ) : (
                              <ConfidentialBadge />
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Financial Calculations */}
                  <div className="mt-4 flex justify-end">
                    <div className="w-[440px] space-y-1.5 text-xs">
                      <div className="flex justify-between items-center px-3 py-1 text-stone-800 gap-2">
                        <span className="font-bold uppercase tracking-wider text-[11px] whitespace-nowrap">
                          Gross Amount
                        </span>
                        <span className="font-mono text-xs font-bold text-stone-900 whitespace-nowrap">
                          {canViewPrices ? (
                            <>
                              Rp{"\u00A0"}
                              {formatNumberWithDots(grossAmount)}
                            </>
                          ) : (
                            <ConfidentialBadge />
                          )}
                        </span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between items-center px-3 py-0.5 text-rose-600 font-semibold text-[11px] gap-2">
                          <span className="uppercase tracking-wider whitespace-nowrap">
                            Discount ({discountRate}%)
                          </span>
                          <span className="font-mono text-xs whitespace-nowrap">
                            {canViewPrices ? (
                              <>
                                - Rp{"\u00A0"}
                                {formatNumberWithDots(discountAmount)}
                              </>
                            ) : (
                              <ConfidentialBadge />
                            )}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center px-3 py-1.5 bg-stone-100 border-y border-stone-300 font-bold text-stone-900 text-[11px] gap-2">
                        <span className="uppercase tracking-wider whitespace-nowrap">
                          Taxable Base (Net Base)
                        </span>
                        <span className="font-mono text-xs font-black whitespace-nowrap">
                          {canViewPrices ? (
                            <>
                              Rp{"\u00A0"}
                              {formatNumberWithDots(dpp)}
                            </>
                          ) : (
                            <ConfidentialBadge />
                          )}
                        </span>
                      </div>
                      {ppn > 0 && (
                        <div className="flex justify-between items-center px-3 py-0.5 text-stone-800 font-bold text-[11px] gap-2">
                          <span className="uppercase tracking-wider whitespace-nowrap">
                            VAT ({ppnRate}%)
                          </span>
                          <span className="font-mono text-xs font-bold whitespace-nowrap">
                            {canViewPrices ? (
                              <>
                                + Rp{"\u00A0"}
                                {formatNumberWithDots(ppn)}
                              </>
                            ) : (
                              <ConfidentialBadge />
                            )}
                          </span>
                        </div>
                      )}
                      {roundingFactor !== 0 && (
                        <div className="flex justify-between items-center px-3 py-0.5 text-stone-800 font-semibold text-[11px] gap-2">
                          <span className="uppercase tracking-wider whitespace-nowrap">
                            Rounding Adjustment
                          </span>
                          <span className="font-mono text-xs font-bold whitespace-nowrap">
                            {canViewPrices ? (
                              <>
                                {roundingFactor > 0 ? "+ " : "- "}Rp{"\u00A0"}
                                {formatNumberWithDots(Math.abs(roundingFactor))}
                              </>
                            ) : (
                              <ConfidentialBadge />
                            )}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-3 border-t-2 border-stone-900 px-3 font-black text-sm uppercase tracking-wider text-stone-900 gap-3">
                        <span className="whitespace-nowrap">GRAND TOTAL</span>
                        <span className="font-mono text-base tracking-tight font-black text-stone-950 whitespace-nowrap">
                          {canViewPrices ? (
                            <>
                              Rp{"\u00A0"}
                              {formatNumberWithDots(grandTotal)}
                            </>
                          ) : (
                            <ConfidentialBadge size="sm" />
                          )}
                        </span>
                      </div>
                      {pph > 0 && (
                        <>
                          <div className="flex justify-between items-center px-3 py-1 bg-amber-50/60 border-t border-amber-200 text-amber-900 font-bold text-[11px] gap-2">
                            <span className="uppercase tracking-wider whitespace-nowrap">
                              Withholding Tax / WHT ({pphRate}%)
                            </span>
                            <span className="font-mono text-xs font-bold text-rose-600 whitespace-nowrap">
                              {canViewPrices ? (
                                <>
                                  - Rp{"\u00A0"}
                                  {formatNumberWithDots(pph)}
                                </>
                              ) : (
                                <ConfidentialBadge />
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between items-center px-3 py-1.5 bg-emerald-50/70 border-t border-emerald-300 font-black text-xs uppercase tracking-wider text-emerald-950 gap-3">
                            <span className="whitespace-nowrap">NET PAYABLE</span>
                            <span className="font-mono text-sm tracking-tight font-black text-emerald-900 whitespace-nowrap">
                              {canViewPrices ? (
                                <>
                                  Rp{"\u00A0"}
                                  {formatNumberWithDots(netPayable)}
                                </>
                              ) : (
                                <ConfidentialBadge />
                              )}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* In Words */}
                <div className="mb-8 p-4 bg-stone-50 rounded-lg">
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">
                    AMOUNT IN WORDS:
                  </div>
                  <div className="italic text-sm font-bold text-stone-900 leading-relaxed">
                    {canViewPrices ? (
                      <>
                        ##{" "}
                        {angkaKeTerbilang(
                          pph > 0 && netPayable > 0 ? netPayable : grandTotal,
                        )}{" "}
                        Rupiah ##
                      </>
                    ) : (
                      <ConfidentialBadge size="sm" />
                    )}
                  </div>
                </div>
              </div>

              {/* Payment Details & Finance Manager Signature */}
              <div className="grid grid-cols-5 gap-8 pt-6 border-t border-stone-200 mt-4 w-full">
                <div className="col-span-3 border-r border-stone-200 pr-6">
                  <div className="text-[9px] font-black text-stone-900 uppercase tracking-widest mb-2">
                    PAYMENT TO:
                  </div>
                  {bankAcc ? (
                    <div className="space-y-1">
                      <div className="font-black text-stone-900 text-xs uppercase">
                        {bankAcc.bank_name}
                      </div>
                      <div className="font-mono font-bold text-stone-900 text-sm tracking-tight">
                        {bankAcc.account_number}
                      </div>
                      <div className="text-stone-600 font-bold text-xs">
                        Account Holder: {bankAcc.account_holder}
                      </div>
                      {bankAcc.branch && (
                        <div className="text-[10px] text-stone-500 font-medium mt-0.5">
                          Branch: {bankAcc.branch}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-stone-500 italic">
                      Contact Finance Department for bank account details.
                    </div>
                  )}
                </div>

                <div className="col-span-2 flex flex-col items-center justify-center text-center">
                  <div className="text-[9px] text-stone-900 uppercase tracking-widest font-bold mb-2">
                    Approve by Finance Manager
                  </div>
                  <div className="h-14 flex items-center justify-center w-full mb-1">
                    <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">
                      <QrCode className="w-6 h-6 text-emerald-600" />
                      <div className="text-left">
                        <div className="text-[9px] font-black text-emerald-800 uppercase">
                          Validated Securely
                        </div>
                        <div className="text-[8px] font-mono text-emerald-700">
                          Digital Approval PIN
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] font-black text-stone-900 uppercase mt-1">
                    Finance Manager
                  </p>
                  <div className="pt-1 flex flex-col justify-center items-center w-full">
                    <div className="w-28 border-b border-stone-300 mb-1"></div>
                  </div>
                </div>
              </div>
            </div>
          </PrintTemplate>
        </PdfPreviewWrapper>
      </div>
    </Modal>
  );
}
