import React, { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDailyAuthKey } from "@/utils/auth";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Landmark,
  ArrowRight,
  CheckCircle2,
  FileText,
  CheckCircle,
  Search,
  RotateCcw,
  Building2,
  Calendar,
  Coins,
  Key,
  Eye,
  Download,
  QrCode,
  AlertCircle,
  ShieldCheck,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import { formatIDR, cn, formatNumberWithDots } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
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
import { motion, AnimatePresence } from "motion/react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { generatePDF } from "@/lib/pdfGenerator";

export default function Payables() {
  const [payables, setPayables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [confirmVoid, setConfirmVoid] = useState<{
    isOpen: boolean;
    id: string;
    amount: number;
  }>({ isOpen: false, id: "", amount: 0 });
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [authPin, setAuthPin] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK TRANSFER");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState("");
  const [vendorInvoiceAmount, setVendorInvoiceAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [showDocModal, setShowDocModal] = useState(false);
  const [selectedPayableForDoc, setSelectedPayableForDoc] = useState<any>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  const { showToast } = useToast();
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const exportPayablePdf = async () => {
    if (!docRef.current || !selectedPayableForDoc) return;
    setIsExportingPdf(true);
    try {
      await generatePDF(
        docRef.current,
        `DISBURSEMENT_${selectedPayableForDoc.po_number || "VOUCHER"}.pdf`,
      );
      showToast("Payable Disbursement Voucher exported successfully", "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to export PDF", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const fetchPayables = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/finance/payables", {}, user?.username);
      if (res.ok) {
        setPayables(Array.isArray(res.data) ? res.data : res.data?.data || []);
      }
    } catch (err) {
      showToast("Error fetching payables", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayables();
  }, []);

  const handleVoidPayment = async () => {
    if (!confirmVoid.id) return;
    try {
      const authPin = getDailyAuthKey(user?.username);
      const res = await apiFetch(
        `/api/finance/payables/${confirmVoid.id}/void`,
        {
          method: "PUT",
          body: JSON.stringify({
            pin: authPin,
            notes: "Voided by user via UI",
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("Payment voided successfully", "success");
        setConfirmVoid({ isOpen: false, id: "", amount: 0 });
        fetchPayables();
      } else {
        showToast(res.error || "Failed to void payment", "error");
      }
    } catch (e) {
      showToast("Error voiding payment", "error");
    }
  };

  const handleVerifyBill = async () => {
    if (!selectedPO || !authPin) {
      showToast("Authorization PIN is required for invoice verification", "error");
      return;
    }
    if (!vendorInvoiceNumber || !vendorInvoiceNumber.trim()) {
      showToast("Vendor invoice number is required", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/finance/payables/${selectedPO.id}/verify-bill`,
        {
          method: "POST",
          body: JSON.stringify({
            pin: authPin,
            vendor_invoice_number: vendorInvoiceNumber.trim(),
            vendor_invoice_amount: vendorInvoiceAmount ? Number(vendorInvoiceAmount) : undefined,
            notes: paymentNotes,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("Vendor invoice verified & matched (3-Way Match Passed)", "success");
        fetchPayables();
      } else {
        showToast(res.error || "Failed to verify vendor invoice", "error");
      }
    } catch (err) {
      showToast("Error verifying vendor bill", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayPO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO || !authPin) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/finance/payables/${selectedPO.id}/pay`,
        {
          method: "PUT",
          body: JSON.stringify({
            pin: authPin,
            amount: paymentAmount ? Number(paymentAmount) : undefined,
            payment_method: paymentMethod,
            notes: paymentNotes,
            vendor_invoice_number: vendorInvoiceNumber,
            vendor_invoice_amount: vendorInvoiceAmount ? Number(vendorInvoiceAmount) : undefined,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("Purchase Order marked as PAID (FINISHED)", "success");
        setShowPayModal(false);
        setAuthPin("");
        setPaymentAmount("");
        setPaymentNotes("");
        setVendorInvoiceNumber("");
        setVendorInvoiceAmount("");
        setSelectedPO(null);
        fetchPayables();
      } else {
        showToast(res.error || "Failed", "error");
      }
    } catch (err) {
      showToast("Error processing payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPayables = React.useMemo(() => {
    return (Array.isArray(payables) ? payables : []).filter(
      (po) =>
        (po.po_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (po.supplier_name || "").toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [payables, searchTerm]);

  const pendingPayables = React.useMemo(() => {
    return filteredPayables.filter(
      (p) =>
        p.status === "ISSUED" ||
        p.status === "AUTHORIZED" ||
        p.status === "RECEIVED" ||
        p.status === "PARTIAL",
    );
  }, [filteredPayables]);

  const paidPayables = React.useMemo(() => {
    return filteredPayables.filter(
      (p) => p.status === "FINISHED" || p.status === "PAID",
    );
  }, [filteredPayables]);

  return (
    <div className="space-y-5 pb-24 animate-in fade-in duration-500">
      <ConfirmModal
        isOpen={confirmVoid.isOpen}
        title="Void Payment"
        message={`Are you sure you want to void this payment? This will reverse the transaction and update the ledger. Amount to reverse: ${confirmVoid.amount}`}
        onConfirm={handleVoidPayment}
        onCancel={() => setConfirmVoid({ isOpen: false, id: "", amount: 0 })}
      />

      <PageHeader
        title={t("Account Payables")}
        subtitle={t("Vendor bills & payments")}
        icon={<CreditCard className="w-5 h-5" />}
      />

      <div className="flex gap-4 items-center">
        <div className="flex-1 max-w-lg">
          <Input
            type="text"
            placeholder={t("Search by PO Number or Supplier Name...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
        {/* Pending Payables Column (60%) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-500" />
              {t("Pending Authorization")}
              <Badge variant="default" size="sm">
                {pendingPayables.length}
              </Badge>
            </h3>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <div className="w-8 h-8 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">
                  Loading...
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Purchase Order")}</TableHead>
                    <TableHead>Three-Way Match</TableHead>
                    <TableHead className="text-right">{t("Action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayables.length === 0 ? (
                    <TableEmpty colSpan={3} message={t("No pending payables")} />
                  ) : (
                    pendingPayables.map((po) => {
                      const poValue = po.total_amount || 0;
                      const grnValue = po.received_amount || 0;
                      const invValue = po.vendor_invoice_amount;

                      const deviation =
                        invValue !== undefined && invValue !== null
                          ? Math.abs(invValue - grnValue) / (grnValue || 1)
                          : null;
                      const isDeviated = deviation !== null && deviation > 0.05;

                      return (
                        <TableRow key={po.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-sm font-bold font-mono tabular-nums text-stone-900">
                                  {po.po_number}
                                </div>
                                <div className="text-[10px] font-bold text-stone-500 mt-1 tracking-wider uppercase flex items-center gap-1.5">
                                  <Building2 className="w-3 h-3" />
                                  {po.supplier_name}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 mb-2">
                              {po.vendor_invoice_status === "MATCHED" ? (
                                <Badge variant="success" size="sm">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  3-Way Matched
                                </Badge>
                              ) : grnValue <= 0 ? (
                                <Badge variant="warning" size="sm">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Waiting Intake (GRN)
                                </Badge>
                              ) : isDeviated ? (
                                <Badge variant="danger" size="sm">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Deviation &gt; 5%
                                </Badge>
                              ) : (
                                <Badge variant="info" size="sm">
                                  <ShieldCheck className="w-3 h-3 mr-1" />
                                  Unbilled GRN Accrued
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-xs font-mono tabular-nums">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest">
                                  Ordered (PO)
                                </span>
                                <span className="font-bold text-stone-700">
                                  {formatIDR(poValue)}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest">
                                  Received (GRN)
                                </span>
                                <span className="font-bold text-emerald-600">
                                  {formatIDR(grnValue)}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] font-sans font-bold text-stone-400 uppercase tracking-widest">
                                  Billed (INV)
                                </span>
                                {invValue !== undefined && invValue !== null ? (
                                  <span
                                    className={`font-bold ${
                                      isDeviated ? "text-rose-600" : "text-stone-700"
                                    }`}
                                  >
                                    {formatIDR(invValue)}
                                  </span>
                                ) : (
                                  <span className="font-bold text-stone-400 italic">
                                    Pending...
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-2">
                              <div className="text-right">
                                <div className="text-sm font-black font-mono tabular-nums tracking-tight text-amber-600">
                                  {formatIDR(
                                    invValue !== undefined && invValue !== null
                                      ? invValue
                                      : grnValue > 0
                                        ? grnValue
                                        : poValue
                                  )}
                                </div>
                                <div className="text-[10px] text-stone-500 font-bold mt-0.5">
                                  Match Amount
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 justify-end">
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPayableForDoc(po);
                                    setShowDocModal(true);
                                  }}
                                  title="Preview Disbursement Voucher"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="xs"
                                  variant="success"
                                  leftIcon={<Coins className="w-3.5 h-3.5" />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPO(po);
                                    const rem =
                                      po.total_amount - (po.amount_paid || 0);
                                    setPaymentAmount(
                                      rem > 0
                                        ? rem.toString()
                                        : (po.total_amount || 0).toString()
                                    );
                                    setVendorInvoiceAmount(
                                      (
                                        po.vendor_invoice_amount ||
                                        po.total_amount ||
                                        0
                                      ).toString()
                                    );
                                    setAuthPin("");
                                    setShowPayModal(true);
                                  }}
                                >
                                  {t("Pay Now")}
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* Paid Payables Column (40%) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {t("Settled Payments")}
              <Badge variant="default" size="sm">
                {paidPayables.length}
              </Badge>
            </h3>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <div className="w-8 h-8 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Supplier & PO")}</TableHead>
                    <TableHead className="text-right">{t("Total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paidPayables.length === 0 ? (
                    <TableEmpty
                      colSpan={2}
                      message={t("No settled payments")}
                    />
                  ) : (
                    paidPayables.map((po) => (
                      <TableRow key={po.id}>
                        <TableCell>
                          <div className="text-xs font-bold font-mono tabular-nums text-stone-900 flex items-center gap-2">
                            {po.po_number}
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                          <div className="text-[10px] font-bold text-stone-500 mt-1 tracking-wider uppercase flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-stone-400" />
                            {po.supplier_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-bold text-stone-900">
                          <div>{formatIDR(po.total_amount)}</div>
                          <div className="flex items-center justify-end gap-1.5 mt-1.5">
                            <Badge variant="success" size="sm">
                              Paid
                            </Badge>
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPayableForDoc(po);
                                setShowDocModal(true);
                              }}
                              title="Preview Disbursement Voucher"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="xs"
                              variant="danger_soft"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmVoid({
                                  isOpen: true,
                                  id: po.id,
                                  amount: po.total_amount,
                                });
                              }}
                              title={t("Void Payment")}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={showPayModal && !!selectedPO}
        onClose={() => {
          setShowPayModal(false);
          setAuthPin("");
          setSelectedPO(null);
        }}
        title={t("Confirm Payment Disbursement")}
        description={t(
          "Log payment expense and centrally record it in the Finance Hub.",
        )}
        maxWidth="4xl"
        contentClassName="p-0"
      >
        {selectedPO && (
          <form
            onSubmit={handlePayPO}
            className="font-sans text-stone-900 bg-white"
          >
            <div className="p-5 sm:p-6 space-y-5 text-sm">
              <div className="border border-stone-200 rounded-xl overflow-hidden mb-5">
                <div className="bg-stone-50 px-4 py-3 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-800 uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    3-Way Matching Validation
                  </span>
                  {selectedPO.total_amount === selectedPO.received_amount ? (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md uppercase tracking-wider border border-emerald-200">
                      Matched
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md uppercase tracking-wider border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5" /> Discrepancy
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 text-center">
                  <div className="p-4 flex flex-col items-center justify-center bg-white relative">
                    <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">PO Amount</span>
                    <span className="text-sm font-black font-mono tabular-nums text-stone-900">{formatIDR(selectedPO.total_amount)}</span>
                  </div>
                  <div className="p-4 flex flex-col items-center justify-center bg-emerald-50/50">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Receipt (GRN)</span>
                    <span className="text-sm font-black font-mono tabular-nums text-emerald-950">{formatIDR(selectedPO.received_amount || 0)}</span>
                  </div>
                  <div className="p-4 flex flex-col items-center justify-center bg-blue-50/50">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Vendor Invoice</span>
                    <span className="text-sm font-black font-mono tabular-nums text-blue-950">
                      {vendorInvoiceAmount ? formatIDR(Number(vendorInvoiceAmount)) : "Pending"}
                    </span>
                  </div>
                </div>
                <div className="bg-stone-50 border-t border-stone-200 px-4 py-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                    Previously Paid: <span className="font-mono tabular-nums text-stone-900">{formatIDR(selectedPO.amount_paid || 0)}</span>
                  </span>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-stone-700 bg-white border border-stone-200 px-2 py-1 rounded-md uppercase tracking-wider">
                    <Building2 className="w-3 h-3" />
                    {selectedPO.supplier_name} - {selectedPO.po_number}
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-stone-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Vendor Invoice No. (Optional)"
                    type="text"
                    placeholder="INV-..."
                    value={vendorInvoiceNumber}
                    onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                  />
                  <div>
                    <Input
                      label="Vendor Billed Amount (Optional)"
                      type="number"
                      placeholder="Amount..."
                      value={vendorInvoiceAmount}
                      onChange={(e) => setVendorInvoiceAmount(e.target.value)}
                      className="font-mono font-bold"
                    />
                    {vendorInvoiceAmount && selectedPO && (
                      (() => {
                        const billed = Number(vendorInvoiceAmount);
                        const expected = selectedPO.total_amount;
                        const dev = Math.abs(billed - expected);
                        const devPct = (dev / (expected || 1)) * 100;
                        const isExceeded = devPct > 5;
                        return (
                          <div className={`mt-1.5 p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${isExceeded ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {isExceeded 
                                ? `3-Way Match Alert: ${devPct.toFixed(1)}% deviation exceeds the 5% hard-stop limit! Payment will be rejected.` 
                                : `3-Way Match Valid: ${devPct.toFixed(1)}% deviation is within tolerance (<= 5%).`}
                            </span>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>

                <Input
                  label={t("Amount to Pay")}
                  type="number"
                  placeholder={String(
                    selectedPO.total_amount - (selectedPO.amount_paid || 0),
                  )}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="font-mono font-bold"
                  helperText={`Leave empty to pay remaining balance: ${formatIDR(
                    selectedPO.total_amount - (selectedPO.amount_paid || 0),
                  )}`}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label={t("Payment Method")}
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="BANK TRANSFER">Bank Transfer</option>
                    <option value="CASH">Cash</option>
                    <option value="CREDIT CARD">Credit Card</option>
                    <option value="CHEQUE">Cheque</option>
                  </Select>
                  <Input
                    label={t("Notes")}
                    type="text"
                    placeholder="Optional notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-start gap-4 mt-6">
                <div className="w-10 h-10 rounded-xl bg-white border border-emerald-100 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-stone-900 mb-1">
                    Embedded Smart e-Approval
                  </h4>
                  <p className="text-[10px] text-stone-500 leading-relaxed mb-3">
                    Please enter your 6-digit authorization PIN to digitally
                    sign and authorize this payment.
                  </p>
                  <input
                    type="password"
                    maxLength={6}
                    required
                    value={authPin}
                    onChange={(e) => setAuthPin(e.target.value.toUpperCase())}
                    placeholder="Enter 6-digit PIN"
                    className="w-full text-sm placeholder:text-stone-400 font-mono tracking-[0.5em] px-4 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-emerald-500 transition-shadow bg-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 sm:px-6 border-t border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-2.5">
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => {
                  setShowPayModal(false);
                  setAuthPin("");
                }}
              >
                {t("Cancel")}
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting || !authPin || !vendorInvoiceNumber}
                  onClick={handleVerifyBill}
                  leftIcon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                >
                  Verify Bill Only
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !authPin}
                  isLoading={isSubmitting}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  {t("Authorize & Pay")}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Payable Document Preview Modal */}
      {selectedPayableForDoc && (
        <Modal
          isOpen={showDocModal}
          onClose={() => setShowDocModal(false)}
          title={`Disbursement Voucher (Payable): ${selectedPayableForDoc.po_number}`}
          maxWidth="6xl"
          contentClassName="p-0 flex flex-col min-h-0 bg-stone-100"
          footer={
            <div className="w-full flex flex-wrap items-center justify-end gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDocModal(false)}
              >
                Close
              </Button>
              <Button
                variant="dark"
                size="sm"
                onClick={exportPayablePdf}
                isLoading={isExportingPdf}
                leftIcon={!isExportingPdf ? <Download className="w-4 h-4" /> : undefined}
              >
                {isExportingPdf ? "Generating..." : "Export PDF (A4)"}
              </Button>
            </div>
          }
        >
          <div className="flex-1 min-h-0 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
            <PdfPreviewWrapper>
              <PrintTemplate
                ref={docRef}
                documentTitleId="DISBURSEMENT VOUCHER"
                documentTitleEn="DISBURSEMENT VOUCHER"
                documentNameId="ACCOUNTS PAYABLE DISBURSEMENT"
                documentNameEn="ACCOUNTS PAYABLE DISBURSEMENT"
                date={
                  selectedPayableForDoc.created_at
                    ? new Date(selectedPayableForDoc.created_at).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : new Date().toLocaleDateString("en-US")
                }
                referenceNumber={selectedPayableForDoc.po_number || ""}
                documentId={selectedPayableForDoc.po_number || selectedPayableForDoc.id || ""}
              >
                <div className="bg-white p-8 text-sm text-black flex flex-col h-full justify-between">
                  <div>
                    {/* Voucher Header Info (60:40 Ratio) */}
                    <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200 grid grid-cols-5 gap-8">
                      <div className="col-span-3">
                        <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                          PAID TO (SUPPLIER)
                        </div>
                        <div className="text-base font-black text-stone-900 tracking-tight leading-tight uppercase mb-1">
                          {selectedPayableForDoc.supplier_name || "SUPPLIER / VENDOR"}
                        </div>
                        <div className="text-xs text-stone-600 font-medium">
                          Reference PO No.: <span className="font-mono font-bold text-stone-900">{selectedPayableForDoc.po_number}</span>
                        </div>
                      </div>

                      <div className="col-span-2 text-right flex flex-col items-end justify-center">
                        <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                          METHOD & STATUS
                        </div>
                        <div className="text-sm font-black text-emerald-600 uppercase tracking-wider">
                          DISBURSED & PAID
                        </div>
                        <div className="text-xs text-stone-600 font-semibold mt-1">
                          Method: <span className="font-bold text-stone-900">{selectedPayableForDoc.payment_method || "BANK TRANSFER"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Transaction Details */}
                    <div className="mb-6">
                      <div className="text-xl text-stone-900 uppercase tracking-widest font-black mb-4 ml-1">
                        Disbursement Details
                      </div>
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-stone-300 bg-white">
                            <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm w-12 text-center">
                              No
                            </th>
                            <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm">
                              Payment Description
                            </th>
                            <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-sm w-48">
                              Amount (IDR)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-150">
                          <tr>
                            <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">1</td>
                            <td className="py-4 px-3 text-base font-black text-stone-900 uppercase tracking-tight">
                              Purchase Order Settlement #{selectedPayableForDoc.po_number} ({selectedPayableForDoc.supplier_name})
                            </td>
                            <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-base whitespace-nowrap">
                              {formatIDR(selectedPayableForDoc.total_amount)}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="mt-6 flex justify-end">
                        <div className="w-[440px] space-y-2">
                          <div className="flex justify-between items-center pt-3 border-t-2 border-stone-900 px-3 font-black text-base uppercase tracking-wider gap-3">
                            <span className="text-stone-900 whitespace-nowrap">TOTAL DISBURSED</span>
                            <span className="font-mono text-base tracking-tight text-emerald-700 whitespace-nowrap">
                              {formatIDR(selectedPayableForDoc.total_amount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Finance Manager Signature */}
                  <div className="flex justify-end pt-6 border-t border-stone-200 mt-8 w-full">
                    <div className="flex flex-col items-center w-64 text-center">
                      <div className="text-[9px] text-stone-900 uppercase tracking-widest font-bold mb-2">
                        Approve by Finance Manager
                      </div>
                      <div className="h-14 flex items-center justify-center w-full mb-1">
                        <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">
                          <QrCode className="w-6 h-6 text-emerald-600" />
                          <div className="text-left">
                            <div className="text-[9px] font-black text-emerald-800 uppercase">Validated Securely</div>
                            <div className="text-[8px] font-mono text-emerald-700">Digital Approval PIN</div>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] font-black text-stone-900 uppercase mt-1">Finance Manager</p>
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
      )}
    </div>
  );
}
