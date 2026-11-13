import React, { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { formatIDR } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import {
  Printer,
  Copy,
  Check,
  Smartphone,
  RotateCw,
  ShoppingBag,
  Clock,
  User,
  CreditCard,
  QrCode,
  FileText
} from "lucide-react";
import { canViewDocFinancials } from "@/utils/rbacFinancials";
import { ConfidentialBadge } from "@/components/shared/ConfidentialBadge";

interface ThermalReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotationId?: string;
  initialData?: any;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  isOpen,
  onClose,
  quotationId,
  initialData,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canViewPrices = canViewDocFinancials(user, "QUOTATION");
  const [data, setData] = useState<any>(initialData || null);
  const [loading, setLoading] = useState(false);
  const [paperWidth, setPaperWidth] = useState<"80mm" | "58mm">("80mm");
  const [isCopied, setIsCopied] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (initialData && initialData.items) {
      setData(initialData);
      return;
    }

    const targetId = quotationId || initialData?.id || initialData?.quotation_id;
    if (!targetId) return;

    const fetchReceipt = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/sales/receipts/${targetId}`, {}, user?.username);
        if (res.ok && res.data?.data) {
          setData(res.data.data);
        } else if (res.ok && res.data) {
          setData(res.data);
        } else {
          showToast("Failed to load receipt data", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Connection error while loading receipt", "error");
      } finally {
        setLoading(false);
      }
    };

    fetchReceipt();
  }, [isOpen, quotationId, initialData, user?.username]);

  const handlePrint = () => {
    if (!canViewPrices) {
      showToast("Printing restricted: Financial figures are confidential.", "error");
      return;
    }
    if (!receiptRef.current) return;
    window.print();
  };

  const handleCopyWhatsApp = () => {
    if (!canViewPrices) {
      showToast("Copy restricted: Financial figures are confidential.", "error");
      return;
    }
    if (!data) return;

    const receiptNo = data.receipt_number || data.quotation_number || "-";
    const dateStr = new Date(data.paid_at || data.created_at || Date.now()).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const customer = data.customer_name_manual || data.customer_name || "Walk-In Customer";
    const paymentMethod = data.payment_method || "CASH";

    let text = `*FHTBS ENTERPRISE - SALES RECEIPT*\n`;
    text += `Receipt No: ${receiptNo}\n`;
    text += `Date: ${dateStr}\n`;
    text += `Customer: ${customer}\n`;
    text += `Payment: ${paymentMethod}\n`;
    text += `--------------------------------\n`;

    const items = data.items || [];
    items.forEach((it: any) => {
      const sub = (Number(it.qty) || 1) * (Number(it.unit_price) || 0);
      text += `${it.title}\n`;
      text += `  ${it.qty} ${it.uom || "Unit"} x ${formatIDR(Number(it.unit_price) || 0)} = ${formatIDR(sub)}\n`;
    });

    text += `--------------------------------\n`;
    text += `Grand Total: *${formatIDR(data.grand_total || data.amount || 0)}*\n`;
    if (data.cash_tendered && Number(data.cash_tendered) > 0) {
      text += `Cash Tendered: ${formatIDR(data.cash_tendered)}\n`;
      text += `Change Due: ${formatIDR(data.change_due || 0)}\n`;
    }
    text += `\nThank you for your business. Please keep this receipt for your records.`;

    navigator.clipboard.writeText(text);
    setIsCopied(true);
    showToast("Receipt text copied to clipboard", "success");
    setTimeout(() => setIsCopied(false), 2500);
  };

  if (!isOpen) return null;

  const items = data?.items || [];
  const grandTotal = Number(data?.grand_total || data?.amount || 0);
  const discountRate = Number(data?.discount_rate || 0);
  const taxRate = Number(data?.tax_rate || 0);
  const cashTendered = Number(data?.cash_tendered || 0);
  const changeDue = Number(data?.change_due || 0);
  const receiptNo = data?.receipt_number || data?.quotation_number || "RCP-RETAIL";
  const customerName = data?.customer_name_manual || data?.customer_name || "Walk-In Customer";
  const customerPhone = data?.customer_phone_manual || data?.customer_phone || "-";
  const transactionDate = new Date(data?.paid_at || data?.created_at || Date.now()).toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Thermal Sales Receipt (POS Ticket)"
      maxWidth="3xl"
    >
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Options & Actions */}
        <div className="w-full md:w-64 space-y-4 shrink-0 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="bg-stone-50 dark:bg-stone-800/60 p-3.5 rounded-xl border border-stone-200 dark:border-stone-700">
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 mb-2 block uppercase tracking-wider">
                Receipt Paper Width
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaperWidth("80mm")}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                    paperWidth === "80mm"
                      ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                      : "bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100"
                  }`}
                >
                  Standard 80mm
                </button>
                <button
                  type="button"
                  onClick={() => setPaperWidth("58mm")}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                    paperWidth === "58mm"
                      ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                      : "bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-100"
                  }`}
                >
                  Compact 58mm
                </button>
              </div>
            </div>

            <div className="bg-stone-50 dark:bg-stone-800/60 p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 space-y-2 text-xs text-stone-600 dark:text-stone-400">
              <div className="flex justify-between">
                <span>Order Status:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">SETTLED / PAID</span>
              </div>
              <div className="flex justify-between">
                <span>Payment:</span>
                <span className="font-semibold text-stone-900 dark:text-white uppercase">{data?.payment_method || "CASH"}</span>
              </div>
              <div className="flex justify-between">
                <span>Sales Channel:</span>
                <span className="font-semibold text-stone-900 dark:text-white">Direct Retail</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-4">
            {!canViewPrices && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-700 dark:text-rose-300 mb-2">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-pulse"></span>
                  Confidential Document
                </div>
                <p className="text-[11px] leading-relaxed">
                  Financial figures are confidential. Export actions (print & copy) are restricted.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={handlePrint}
              disabled={!canViewPrices}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 font-medium text-sm rounded-xl shadow-sm transition-colors ${
                canViewPrices
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  : "bg-stone-200 dark:bg-stone-800 text-stone-400 cursor-not-allowed border border-stone-300 dark:border-stone-700"
              }`}
            >
              <Printer className="w-4 h-4" />
              Print Thermal Receipt
            </button>

            <button
              type="button"
              onClick={handleCopyWhatsApp}
              disabled={!canViewPrices}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 font-medium text-sm rounded-xl transition-colors border ${
                canViewPrices
                  ? "bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-700 cursor-pointer"
                  : "bg-stone-200 dark:bg-stone-800 text-stone-400 cursor-not-allowed border-stone-300 dark:border-stone-700"
              }`}
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {isCopied ? "Copied!" : "Copy Text Receipt"}
            </button>
          </div>
        </div>

        {/* Right Preview - Thermal POS Ticket Paper */}
        <div className="flex-1 flex justify-center bg-stone-100 dark:bg-stone-950 p-4 rounded-xl border border-stone-200 dark:border-stone-800 overflow-y-auto max-h-[580px]">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-stone-500 gap-2">
              <RotateCw className="w-6 h-6 animate-spin text-amber-600" />
              <p className="text-xs">Loading sales receipt...</p>
            </div>
          ) : (
            <div
              ref={receiptRef}
              id="thermal-receipt-paper"
              className={`bg-white text-stone-900 shadow-md p-5 font-mono select-none transition-all ${
                paperWidth === "80mm" ? "w-[340px]" : "w-[260px]"
              }`}
              style={{
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                lineHeight: "1.35",
              }}
            >
              {/* Header */}
              <div className="text-center border-b border-dashed border-stone-400 pb-3 mb-3">
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="w-10 h-10 object-contain mx-auto mb-1.5"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <h3 className="font-bold text-sm tracking-wider uppercase">PAVING JOSS</h3>
                <p className="text-[10px] text-stone-600">CV Batu Emas Group &bull; Banyuwangi</p>
                <p className="text-[10px] text-stone-600">Dusun Petahunan, Gambiran, Banyuwangi</p>
                <p className="text-[10px] text-stone-600">WhatsApp: 0811-1111-3993</p>
              </div>

              {/* Transaction Metadata */}
              <div className="text-[11px] space-y-0.5 border-b border-dashed border-stone-400 pb-2 mb-2">
                <div className="flex justify-between">
                  <span>Receipt No:</span>
                  <span className="font-bold">{receiptNo}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span>{transactionDate}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cashier:</span>
                  <span>{user?.username || "Cashier-01"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span className="truncate max-w-[150px] font-medium">{customerName}</span>
                </div>
                {customerPhone !== "-" && (
                  <div className="flex justify-between">
                    <span>Phone:</span>
                    <span>{customerPhone}</span>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="text-[11px] border-b border-dashed border-stone-400 pb-2 mb-2">
                <div className="flex justify-between font-bold border-b border-stone-300 pb-1 mb-1 text-[10px] uppercase">
                  <span>Item & Qty</span>
                  <span>Total</span>
                </div>
                <div className="space-y-1.5">
                  {items.map((it: any, idx: number) => {
                    const lineSubtotal = (Number(it.qty) || 1) * (Number(it.unit_price) || 0);
                    return (
                      <div key={idx} className="space-y-0.5">
                        <div className="font-semibold truncate text-[11px]">{it.title}</div>
                        <div className="flex justify-between items-center text-[10px] text-stone-600">
                          <span>
                            {it.qty} {it.uom || "PCS"} x{" "}
                            {canViewPrices ? formatIDR(Number(it.unit_price) || 0) : <ConfidentialBadge size="sm" />}
                          </span>
                          <span className="font-bold text-stone-900">
                            {canViewPrices ? formatIDR(lineSubtotal) : <ConfidentialBadge size="sm" />}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals Breakdown */}
              <div className="text-[11px] space-y-1 border-b border-dashed border-stone-400 pb-2 mb-2">
                <div className="flex justify-between items-center">
                  <span>Subtotal:</span>
                  <span>{canViewPrices ? formatIDR(data?.dpp || grandTotal) : <ConfidentialBadge size="sm" />}</span>
                </div>
                {discountRate > 0 && (
                  <div className="flex justify-between items-center text-stone-600">
                    <span>Discount ({discountRate}%):</span>
                    <span>{canViewPrices ? `- ${formatIDR((grandTotal * discountRate) / 100)}` : <ConfidentialBadge size="sm" />}</span>
                  </div>
                )}
                {taxRate > 0 && (
                  <div className="flex justify-between items-center text-stone-600">
                    <span>VAT ({taxRate}%):</span>
                    <span>{canViewPrices ? formatIDR(data?.ppn_amount || 0) : <ConfidentialBadge size="sm" />}</span>
                  </div>
                )}
                <div className="flex justify-between items-center font-bold text-xs pt-1 border-t border-stone-300">
                  <span>GRAND TOTAL:</span>
                  <span className="text-sm font-black">
                    {canViewPrices ? formatIDR(grandTotal) : <ConfidentialBadge />}
                  </span>
                </div>
              </div>

              {/* Payment Settlement */}
              <div className="text-[11px] space-y-1 border-b border-dashed border-stone-400 pb-2 mb-3">
                <div className="flex justify-between items-center">
                  <span>Payment Method:</span>
                  <span className="font-bold uppercase">{data?.payment_method || "CASH"}</span>
                </div>
                {cashTendered > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <span>Cash Tendered:</span>
                      <span>{canViewPrices ? formatIDR(cashTendered) : <ConfidentialBadge size="sm" />}</span>
                    </div>
                    <div className="flex justify-between items-center font-bold">
                      <span>Change Due:</span>
                      <span>{canViewPrices ? formatIDR(changeDue) : <ConfidentialBadge size="sm" />}</span>
                    </div>
                  </>
                )}
              </div>

              {/* QR Code & Footer */}
              <div className="text-center flex flex-col items-center justify-center space-y-2 pt-1">
                <QRCodeSVG
                  value={`FHTBS-VERIFIED-SALE:${receiptNo}:${canViewPrices ? grandTotal : "CONFIDENTIAL"}:${data?.paid_at || new Date().toISOString()}`}
                  size={72}
                  level="M"
                />
                <p className="text-[9px] text-stone-500 uppercase tracking-wider">Scan to verify official receipt</p>
                <div className="text-[10px] text-stone-600 space-y-0.5 pt-1">
                  <p className="font-semibold">*** THANK YOU FOR YOUR BUSINESS ***</p>
                  <p>Items may be exchanged within 48 hours with this valid receipt.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Embedded Print CSS for Physical Thermal Printers */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #thermal-receipt-paper, #thermal-receipt-paper * {
            visibility: visible !important;
          }
          #thermal-receipt-paper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${paperWidth === "80mm" ? "80mm" : "58mm"} !important;
            margin: 0 !important;
            padding: 4mm !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
    </Modal>
  );
};
