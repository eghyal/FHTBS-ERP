import { safeFetchJson, apiFetch } from "@/utils/api";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDailyAuthKey } from "@/utils/auth";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { canViewDocFinancials } from "@/utils/rbacFinancials";
import { ConfidentialBadge } from "@/components/shared/ConfidentialBadge";
import { hasGodMode, hasPermission, Action } from "@/utils/pbac";
import {
  RotateCcw,
  FileText,
  ArrowRight,
  DollarSign,
  CheckCircle2,
  Download,
  Eye,
  X,
  Trash2,
  Landmark,
  Calendar,
  Briefcase,
  Percent,
  Coins,
  Printer,
  Key,
  QrCode,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
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
import { generatePDF } from "@/lib/pdfGenerator";
import { QRCodeSVG } from "qrcode.react";
import {
  formatIDR,
  formatNumberWithDots,
  formatIDRWithDecimals,
} from "@/lib/utils";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { calculateFinancialBreakdown } from "@/lib/financialEngine";

const getInvoiceDetails = (inv: any) => {
  if (!inv) {

    return {
      gross_amount: 0,
      discount_rate: 0,
      discount_amount: 0,
      rounding_factor: 0,
      dpp: 0,
      ppn: 0,
      pph: 0,
      ppn_rate: 12,
      pph_rate: 0,
      total_amount: 0,
      grand_total: 0,
      amount_paid: 0,
      remaining: 0,
    };
  }

  const breakdown = calculateFinancialBreakdown({
    items: inv.items?.map((it: any) => ({
      qty: Number(it.qty || 1),
      unit_price: Number(it.unit_price || 0),
      subtotal: Number(it.subtotal),
    })),
    grossAmount: Number(inv.gross_amount) || Number(inv.quotation_gross_amount),
    discountRate: inv.discount_rate !== undefined && inv.discount_rate !== null ? Number(inv.discount_rate) : Number(inv.quotation_discount_rate || 0),
    discountAmount: inv.discount_amount !== undefined && inv.discount_amount !== null && Number(inv.discount_amount) > 0 ? Number(inv.discount_amount) : undefined,
    taxRate: inv.ppn_rate !== undefined && inv.ppn_rate !== null ? Number(inv.ppn_rate) : (inv.quotation_tax_rate !== undefined ? Number(inv.quotation_tax_rate) : 12),
    pphRate: inv.pph_rate !== undefined && inv.pph_rate !== null ? Number(inv.pph_rate) : Number(inv.quotation_pph_rate || 0),
    dpp: inv.dpp !== undefined && Number(inv.dpp) > 0 ? Number(inv.dpp) : Number(inv.quotation_dpp || 0),
    roundingFactor: inv.rounding_factor !== undefined && inv.rounding_factor !== null && Number(inv.rounding_factor) !== 0 ? Number(inv.rounding_factor) : Number(inv.quotation_rounding_factor || 0),
    grandTotal: Number(inv.grand_total) || Number(inv.total_amount) || Number(inv.quotation_grand_total),
  });

  const amountPaid = Number(inv.amount_paid) || 0;
  const targetPaymentTotal = breakdown.pphRate > 0 ? breakdown.netPayable : breakdown.grandTotal;
  const remaining = Math.max(0, targetPaymentTotal - amountPaid);

  return {
    gross_amount: breakdown.grossAmount,
    discount_rate: breakdown.discountRate,
    discount_amount: breakdown.discountAmount,
    rounding_factor: breakdown.roundingFactor,
    dpp: breakdown.dpp,
    ppn: breakdown.ppnAmount,
    pph: breakdown.pphAmount,
    ppn_rate: breakdown.taxRate,
    pph_rate: breakdown.pphRate,
    total_amount: breakdown.grandTotal,
    grand_total: breakdown.grandTotal,
    net_payable: breakdown.netPayable,
    amount_paid: amountPaid,
    remaining,
  };
};

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

export default function Invoices() {
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [unbilled, setUnbilled] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [selectedQuoId, setSelectedQuoId] = useState("");
  const { showToast } = useToast();
  const { user } = useAuth();
  const canViewPrices = canViewDocFinancials(user, "INVOICE");
  const isFinanceAuthorized =
    hasGodMode(user) ||
    user?.role === "FC" ||
    user?.role === "FINANCE" ||
    user?.role === "DIRECTOR" ||
    user?.role === "BOD" ||
    user?.role === "ADMIN" ||
    user?.role === "SUPERADMIN" ||
    hasPermission(user, Action.VIEW_FINANCE);

  const displayedInvoices = useMemo(() => {
    if (isFinanceAuthorized) {
      return Array.isArray(invoices) ? invoices : [];
    }
    const highlight = searchParams.get("highlight");
    if (!highlight) return [];
    return (Array.isArray(invoices) ? invoices : []).filter(
      (inv: any) =>
        inv.id === highlight ||
        inv.ci_number === highlight ||
        inv.invoice_number === highlight,
    );
  }, [invoices, isFinanceAuthorized, searchParams]);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showDpInvoiceModal, setShowDpInvoiceModal] = useState(false);
  const [dpPercentage, setDpPercentage] = useState("30");
  const [confirmVoid, setConfirmVoid] = useState<{
    isOpen: boolean;
    id: string;
    amount: number;
  }>({ isOpen: false, id: "", amount: 0 });
  const [showRegisterBankModal, setShowRegisterBankModal] = useState(false);
  const [selectedDn, setSelectedDn] = useState<any>(null);
  const [selectedDnItems, setSelectedDnItems] = useState<any[]>([]);
  const [amount, setAmount] = useState("");
  const [displayAmount, setDisplayAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [ppnRate, setPpnRate] = useState("12");

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^\d]/g, "");
    setAmount(rawValue);
    setDisplayAmount(formatNumberWithDots(rawValue));
  };
  const [pphRate, setPphRate] = useState("2");
  const [jobDescription, setJobDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t, language } = useLanguage();

  const [newBank, setNewBank] = useState({
    bank_name: "",
    account_number: "",
    account_holder: "",
    branch: "",
  });

  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);

  const [previewInvoice, setPreviewInvoice] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedInvoiceForPay, setSelectedInvoiceForPay] = useState<any>(null);
  const [authPin, setAuthPin] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK TRANSFER");
  const [paymentNotes, setPaymentNotes] = useState("");

  const handleVoidPayment = async () => {
    if (!confirmVoid.id) return;
    try {
      const voidPin = getDailyAuthKey(user?.username);
      const res = await apiFetch(
        `/api/finance/invoices/${confirmVoid.id}/void`,
        {
          method: "PUT",
          body: JSON.stringify({
            pin: voidPin,
            notes: "Voided by user via UI",
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("Payment voided successfully", "success");
        setConfirmVoid({ isOpen: false, id: "", amount: 0 });
        fetchData();
      } else {
        showToast(res.error || "Failed to void payment", "error");
      }
    } catch (e) {
      showToast("Error voiding payment", "error");
    }
  };

  const handlePayInvoice = async (submittedPin: string) => {
    if (!selectedInvoiceForPay || !submittedPin) return;
    setIsSubmitting(true);
    try {
      const payDetails = getInvoiceDetails(selectedInvoiceForPay);
      const amountToSend = paymentAmount && Number(paymentAmount) > 0 ? Number(paymentAmount) : payDetails.remaining;

      const res = await apiFetch(
        `/api/finance/invoices/${selectedInvoiceForPay.id}/pay`,
        {
          method: "PUT",
          body: JSON.stringify({
            pin: submittedPin,
            amount: amountToSend,
            payment_method: paymentMethod,
            notes: paymentNotes,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Invoice marked as PAID. Revenue recorded.", "success");
        setShowPayModal(false);
        setAuthPin("");
        // Optimistic UI Update
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === selectedInvoiceForPay.id
              ? {
                  ...inv,
                  status: "PAID",
                  amount_paid: inv.total_amount,
                  updated_at: new Date().toISOString(),
                }
              : inv,
          ),
        );
        setSelectedInvoiceForPay(null);
        fetchData();
      } else {
        showToast(res.error || "Failed to mark as paid", "error");
      }
    } catch (err) {
      showToast("Error processing payment", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isSubmittingPdf, setIsSubmittingPdf] = useState(false);
  const printDocRef = useRef<HTMLDivElement>(null);

  const exportInvoicePdf = async () => {
    if (!printDocRef.current || !previewInvoice) return;
    setIsSubmittingPdf(true);
    try {
      await generatePDF(
        printDocRef.current,
        `Invoice_${previewInvoice.ci_number}.pdf`,
      );
      showToast("Invoice exported as PDF", "success");
    } catch (err) {
      console.error(err);
      showToast("PDF generation failed", "error");
    } finally {
      setIsSubmittingPdf(false);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [invRes, unbRes, bankRes, quoRes] = await Promise.all([
        apiFetch("/api/sales/invoices", {}, user?.username),
        apiFetch("/api/sales/unbilled-deliveries", {}, user?.username),
        apiFetch("/api/bank-accounts", {}, user?.username),
        apiFetch("/api/quotations", {}, user?.username),
      ]);
      if (invRes.ok) setInvoices(Array.isArray(invRes.data) ? invRes.data : []);
      if (unbRes.ok) setUnbilled(Array.isArray(unbRes.data) ? unbRes.data : []);
      if (bankRes.ok) setBankAccounts(Array.isArray(bankRes.data) ? bankRes.data : []);
      if (quoRes.ok) {
        const rawQuos = Array.isArray(quoRes.data) ? quoRes.data : Array.isArray(quoRes.data?.data) ? quoRes.data.data : [];
        setQuotations(rawQuos);
      }
    } catch (err) {
      showToast("Error fetching invoices", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (highlight && invoices.length > 0) {
      const found = invoices.find(
        (inv: any) =>
          inv.id === highlight ||
          inv.ci_number === highlight ||
          inv.invoice_number === highlight,
      );
      if (found) {
        setPreviewInvoice(found);
        setShowPreviewModal(true);
      }
    }
  }, [searchParams, invoices]);

  const handleSelectDn = async (dn: any) => {
    if (!dn) {
      setSelectedDn(null);
      setSelectedDnItems([]);
      return;
    }
    setSelectedDn(dn);
    setSelectedDnItems(dn.items || []);
    setBankAccountId(bankAccounts[0]?.id || "BNK-DEFAULT");
    setPaymentTerms("Net 30");

    const baseTitle =
      dn.quotation_title ||
      dn.project_names ||
      dn.project_name ||
      `Commercial Delivery (DN: ${dn.dn_number})`;
    setJobDescription(baseTitle);

    setShowInvoiceModal(true);

    // Fetch full delivery note item details async
    try {
      const res = await apiFetch(
        `/api/sales/deliveries/${dn.id}`,
        {},
        user?.username,
      );
      if (res.ok && res.data && res.data.items && res.data.items.length > 0) {
        setSelectedDnItems(res.data.items);
      }
    } catch (err) {
      console.error("Failed to load DN details", err);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDn) {
      showToast("Please select a Delivery Note first", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/invoice/${selectedDn.id}`,
        {
          method: "POST",
          body: JSON.stringify({
            bank_account_id: bankAccountId,
            payment_terms: paymentTerms,
            job_description: jobDescription,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast("Commercial Invoice issued successfully", "success");
        setShowInvoiceModal(false);
        setJobDescription("");
        setSelectedDn(null);
        setSelectedDnItems([]);
        fetchData();
      } else {
        showToast(res.error || "Failed to issue invoice", "error");
      }
    } catch (err) {
      showToast("Failed to process invoice", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDpInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuoId) {
      showToast("Please select an approved quotation first", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/quotations/${selectedQuoId}/create-dp-invoice`,
        {
          method: "POST",
          body: JSON.stringify({
            dp_percentage: Number(dpPercentage) || 30,
            bank_account_id: bankAccountId || bankAccounts[0]?.id || "BNK-DEFAULT",
            payment_terms: "Due on Receipt",
          }),
        },
        user?.username,
      );
      if (res.ok) {
        const ciNum = res.data?.data?.ci_number || res.data?.ci_number || "CI-DP";
        showToast(
          res.data?.already_exists
            ? `Down Payment Invoice ${ciNum} was already issued for this quotation.`
            : `Down Payment Invoice ${ciNum} issued and journaled to COA 2106!`,
          "success",
        );
        setShowDpInvoiceModal(false);
        setSelectedQuoId("");
        fetchData();
      } else {
        showToast(res.error || "Failed to issue Down Payment Invoice", "error");
      }
    } catch {
      showToast("Network error while issuing Down Payment Invoice", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBank = async (id: string) => {
    try {
      const res = await apiFetch(
        `/api/bank-accounts/${id}`,
        { method: "DELETE" },
        user?.username,
      );
      if (res.ok) {
        showToast(t("Bank account deleted"), "success");
        const bankRes = await apiFetch(
          "/api/bank-accounts",
          {},
          user?.username,
        );
        if (bankRes.ok) setBankAccounts(bankRes.data);
      } else {
        showToast(res.error || "Failed to delete bank account", "error");
      }
    } catch (e) {
      console.error("Delete bank account error:", e);
      showToast("Failed to delete", "error");
    }
  };

  const handleRegisterBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newBank.bank_name ||
      !newBank.account_number ||
      !newBank.account_holder
    ) {
      showToast("Please fill in all required fields", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/bank-accounts",
        {
          method: "POST",
          body: JSON.stringify(newBank),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Bank Account registered successfully", "success");
        setShowRegisterBankModal(false);
        setNewBank({
          bank_name: "",
          account_number: "",
          account_holder: "",
          branch: "",
        });

        // Refresh bank accounts list
        const bankRes = await apiFetch(
          "/api/bank-accounts",
          {},
          user?.username,
        );
        if (bankRes.ok) {
          const acts = bankRes.data;
          setBankAccounts(acts);
          if (acts.length > 0) {
            setBankAccountId(acts[0].id);
          }
        }
      } else {
        showToast(res.error || "Failed to register bank account", "error");
      }
    } catch (err) {
      showToast("Error registering bank account", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper calculation
  const subtotalVal = parseFloat(amount || "0") || 0;
  const ppnVal = subtotalVal * (parseFloat(ppnRate || "0") / 100);
  const pphVal = subtotalVal * (parseFloat(pphRate || "0") / 100);
  const grandTotalValUnrounded = subtotalVal + ppnVal - pphVal;
  const grandTotalVal = Math.floor(grandTotalValUnrounded);
  const roundingFactorVal = grandTotalVal - grandTotalValUnrounded;

  return (
    <div className="space-y-5 pb-24 animate-in fade-in duration-300">
      <ConfirmModal
        isOpen={confirmVoid.isOpen}
        title="Void Payment"
        message={`Are you sure you want to void this payment? This will reverse the transaction and update the ledger. Amount to reverse: ${confirmVoid.amount}`}
        onConfirm={handleVoidPayment}
        onCancel={() => setConfirmVoid({ isOpen: false, id: "", amount: 0 })}
      />

      <ConfirmModal
        isOpen={!!deletingBankId}
        title="Remove Bank Account"
        message="Are you sure you want to remove this bank account?"
        onConfirm={() => deletingBankId && handleDeleteBank(deletingBankId)}
        onCancel={() => setDeletingBankId(null)}
      />

      <PageHeader
        title="Account Receivables"
        subtitle="Customer billing & settlement"
        icon={<Receipt className="w-5 h-5" />}
        actions={
          isFinanceAuthorized ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={() => setShowRegisterBankModal(true)}
                variant="secondary"
                size="sm"
                leftIcon={<Landmark className="w-4 h-4" />}
              >
                {t("Bank Accounts")}
              </Button>
              <Button
                onClick={() => {
                  setBankAccountId(bankAccounts[0]?.id || "BNK-DEFAULT");
                  setShowDpInvoiceModal(true);
                }}
                variant="secondary"
                size="sm"
                leftIcon={<Percent className="w-4 h-4 text-amber-600" />}
              >
                Down Payment Invoice
              </Button>
              <Button
                onClick={() => setShowInvoiceModal(true)}
                variant="primary"
                size="sm"
                leftIcon={<DollarSign className="w-4 h-4" />}
              >
                {t("New Invoice")}
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.href = "/erp";
              }}
            >
              Back to Dashboard
            </Button>
          )
        }
      />

      {/* Cross-Department Read-Only Isolation Banner */}
      {!isFinanceAuthorized && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 shadow-2xs mb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold">Cross-Department Read-Only Mode:</span>{" "}
              <span>
                Viewing shared invoice strictly in isolation. Full accounting ledger and billing actions are protected.
              </span>
            </div>
          </div>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => {
              window.location.href = "/erp";
            }}
            className="shrink-0 bg-white dark:bg-slate-900"
          >
            Return to Dashboard
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-5">
        {/* Pending Invoices (60%) */}
        <div className="lg:col-span-6 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-stone-500" />
              {t("Unpaid Invoices")}
              <span className="ml-1 bg-stone-100 text-stone-700 border border-stone-200/80 py-0.5 px-2 rounded-md text-[10px] font-mono tabular-nums">
                {
                  displayedInvoices.filter(
                    (i) => i.status !== "PAID" && i.status !== "FINISHED",
                  ).length
                }
              </span>
            </h3>
          </div>

          <Table>
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>{t("Invoice & Customer")}</TableHead>
                <TableHead className="text-right">{t("Amount Detail")}</TableHead>
                <TableHead className="text-right">{t("Action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty colSpan={3} message="Loading unpaid invoices..." />
              ) : displayedInvoices.filter(
                  (i) => i.status !== "PAID" && i.status !== "FINISHED",
                ).length === 0 ? (
                <TableEmpty
                  colSpan={3}
                  icon={<CheckCircle2 className="w-7 h-7 text-stone-300" />}
                  message={`${t("All Clear")} — ${t("No pending invoices")}`}
                />
              ) : (
                displayedInvoices
                  .filter(
                    (i) => i.status !== "PAID" && i.status !== "FINISHED",
                  )
                  .map((inv) => {
                    const details = getInvoiceDetails(inv);
                    return (
                      <TableRow key={inv.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3.5">
                            <div className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200/80 text-stone-600 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs sm:text-sm font-bold font-mono tabular-nums text-stone-900">
                                  {inv.ci_number}
                                </span>
                                {inv.invoice_category === "DOWN_PAYMENT" && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200/80">
                                    DP Invoice
                                  </span>
                                )}
                                {inv.invoice_category === "FINAL_SETTLEMENT" && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                                    Settlement
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-bold text-stone-500 mt-0.5 tracking-wider uppercase">
                                {inv.customer_name}
                              </div>
                              {inv.job_description && (
                                <div className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
                                  {inv.job_description}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end font-mono tabular-nums">
                            <div className="text-xs sm:text-sm font-bold tracking-tight text-stone-900">
                              {canViewPrices ? (
                                formatIDR(details.total_amount)
                              ) : (
                                <ConfidentialBadge />
                              )}
                            </div>
                            {canViewPrices && (
                              <div className="text-[10px] text-stone-500 font-medium mt-0.5">
                                Taxable Base: {formatIDR(details.dpp)}
                              </div>
                            )}
                            {canViewPrices && details.amount_paid > 0 && (
                              <div className="text-[10px] text-amber-700 font-bold mt-0.5">
                                Remaining: {formatIDR(details.remaining)}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <Button
                              size="xs"
                              action="view"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewInvoice(inv);
                                setShowPreviewModal(true);
                              }}
                              title="Preview & Export Invoice PDF"
                            />
                            {isFinanceAuthorized && (
                              <Button
                                size="xs"
                                variant="primary"
                                leftIcon={<Coins className="w-3.5 h-3.5" />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedInvoiceForPay(inv);
                                  const details = getInvoiceDetails(inv);
                                  setPaymentAmount(
                                    details.remaining > 0
                                      ? details.remaining.toString()
                                      : details.total_amount.toString(),
                                  );
                                  setAuthPin("");
                                  setShowPayModal(true);
                                }}
                              >
                                {t("Receive")}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paid Invoices (40%) */}
        <div className="lg:col-span-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-stone-500" />
              {t("Received Payments")}
              <span className="ml-1 bg-stone-100 text-stone-700 border border-stone-200/80 py-0.5 px-2 rounded-md text-[10px] font-mono tabular-nums">
                {
                  displayedInvoices.filter(
                    (i) => i.status === "PAID" || i.status === "FINISHED",
                  ).length
                }
              </span>
            </h3>
          </div>

          <Table>
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>{t("Invoice & Customer")}</TableHead>
                <TableHead className="text-right">{t("Amount Detail")}</TableHead>
                <TableHead className="text-right">{t("Action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty colSpan={3} message="Loading received payments..." />
              ) : displayedInvoices.filter(
                  (i) => i.status === "PAID" || i.status === "FINISHED",
                ).length === 0 ? (
                <TableEmpty colSpan={3} message={t("No received payments")} />
              ) : (
                displayedInvoices
                  .filter(
                    (i) => i.status === "PAID" || i.status === "FINISHED",
                  )
                  .map((inv) => {
                    const details = getInvoiceDetails(inv);
                    return (
                      <TableRow key={inv.id} className="group">
                        <TableCell>
                          <div className="text-xs font-bold font-mono tabular-nums text-stone-900 flex items-center gap-1.5">
                            {inv.ci_number}
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          </div>
                          <div className="text-[10px] font-bold text-stone-500 mt-1 tracking-wider uppercase">
                            {inv.customer_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end font-mono tabular-nums">
                            <div className="text-xs sm:text-sm font-bold tracking-tight text-stone-900">
                              {canViewPrices ? (
                                formatIDR(details.total_amount)
                              ) : (
                                <ConfidentialBadge />
                              )}
                            </div>
                            {canViewPrices && (
                              <div className="text-[10px] text-stone-500 font-medium mt-0.5">
                                Taxable Base: {formatIDR(details.dpp)}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="xs"
                              action="view"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewInvoice(inv);
                                setShowPreviewModal(true);
                              }}
                              title="Preview & Export Invoice PDF"
                            />
                            {["FC", "BOD"].includes(user?.role || "") && (
                              <Button
                                size="xs"
                                variant="danger_soft"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmVoid({
                                    isOpen: true,
                                    id: inv.id,
                                    amount: details.total_amount,
                                  });
                                }}
                                title={t("Void Payment")}
                                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pay Modal */}
      <AuthorizeDocModal
        isOpen={showPayModal && !!selectedInvoiceForPay}
        onClose={() => {
          setShowPayModal(false);
          setAuthPin("");
          setSelectedInvoiceForPay(null);
        }}
        docType="Payment Receipt"
        docNumber={selectedInvoiceForPay?.invoice_number || ""}
        status={selectedInvoiceForPay?.status}
        partnerName={selectedInvoiceForPay?.customer_name}
        amount={selectedInvoiceForPay ? getInvoiceDetails(selectedInvoiceForPay).remaining : 0}
        subtitle="Log payment receipt and centrally record it in the Finance Hub."
        isSubmitting={isSubmitting}
        onAuthorize={handlePayInvoice}
      >
        {selectedInvoiceForPay && (() => {
          const payDetails = getInvoiceDetails(selectedInvoiceForPay);
          return (
            <div className="space-y-4 pt-4 border-t border-stone-100">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                  {t("Amount Received")}
                </label>
                <input
                  type="number"
                  placeholder={String(payDetails.remaining)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold font-mono text-stone-900 focus:bg-white focus:border-stone-400 outline-none transition-all"
                />
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">
                  Leave empty to receive remaining balance: {formatIDR(payDetails.remaining)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                    {t("Payment Method")}
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold text-stone-700 focus:bg-white focus:border-stone-400 outline-none transition-all"
                  >
                    <option value="BANK TRANSFER">Bank Transfer</option>
                    <option value="CASH">Cash</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                    {t("Notes")}
                  </label>
                  <input
                    type="text"
                    placeholder="Optional notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold focus:bg-white focus:border-stone-400 outline-none transition-all"
                  />
                </div>
              </div>
            </div>
          );
        })()}
      </AuthorizeDocModal>

      {/* New Invoice Modal */}
      <Modal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        title="Issue Commercial Invoice (Automated)"
        maxWidth="5xl"
        contentClassName="p-0"
      >
        <form
          onSubmit={handleCreateInvoice}
          className="font-sans text-stone-900 bg-white"
        >
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block">
                Select Delivery Note
              </label>
              <select
                value={selectedDn?.id || ""}
                onChange={(e) => {
                  const dn = unbilled.find((d) => d.id === e.target.value);
                  handleSelectDn(dn);
                }}
                required
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold text-stone-700 focus:bg-white focus:border-stone-400 outline-none transition-all"
              >
                <option value="" disabled>
                  Select a Delivery Note ready for billing...
                </option>
                {unbilled.map((dn) => (
                  <option key={dn.id} value={dn.id}>
                    {dn.dn_number} - {dn.customer_name} ({dn.items_count} items)
                  </option>
                ))}
              </select>
            </div>

            {selectedDn && (() => {
              const dnItemsTotal = selectedDnItems.reduce(
                (sum: number, it: any) => sum + (Number(it.subtotal) || (Number(it.qty || 1) * (Number(it.unit_price) || 0))),
                0
              );
              const grossVal = dnItemsTotal > 0 ? dnItemsTotal : (Number(selectedDn.quotation_gross_amount) || Number(selectedDn.quotation_amount) || 0);
              const discRate = Number(selectedDn.quotation_discount_rate) || 0;
              const roundVal = Number(selectedDn.quotation_rounding_factor) || 0;
              const ppnRateVal = selectedDn.quotation_tax_rate !== undefined && selectedDn.quotation_tax_rate !== null ? Number(selectedDn.quotation_tax_rate) : 12;
              const pphRateVal = selectedDn.quotation_pph_rate !== undefined && selectedDn.quotation_pph_rate !== null ? Number(selectedDn.quotation_pph_rate) : 2;

              const fBreakdown = calculateFinancialBreakdown({
                items: [],
                grossAmount: grossVal,
                discountRate: discRate,
                taxRate: ppnRateVal,
                pphRate: pphRateVal,
                taxScheme: selectedDn.quotation_tax_scheme || (ppnRateVal > 0 ? "DPP_NILAI_LAIN" : "NON_PKP"),
                roundingFactor: roundVal,
              });

              const dppVal = fBreakdown.dpp;
              const ppnVal = fBreakdown.ppnAmount;
              const pphVal = fBreakdown.pphAmount;
              const grandTotalVal = fBreakdown.grandTotal;
              const dppNilaiLainVal = fBreakdown.dppNilaiLain;
              const isDppNilaiLainVal = fBreakdown.isDppNilaiLain;
              const discVal = fBreakdown.discountAmount;

              return (
                <div className="space-y-5 pt-4 border-t border-stone-100">
                  {/* Delivery & Customer Info Card */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                        Customer & Project
                      </div>
                      <div className="text-sm font-bold text-stone-900 mt-0.5">
                        {selectedDn.customer_name}
                      </div>
                      <div className="text-xs text-stone-600">
                        {selectedDn.project_names || selectedDn.project_name || selectedDn.quotation_title || "Commercial Trade Delivery"}
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                        Delivery Note No.
                      </div>
                      <div className="font-mono font-bold text-stone-900 text-sm">
                        {selectedDn.dn_number}
                      </div>
                    </div>
                  </div>

                  {/* Delivery Items Substance */}
                  {selectedDnItems.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block">
                          Delivery Items
                        </label>
                        <span className="text-[10px] text-stone-400 font-medium">
                          {selectedDnItems.length} line items
                        </span>
                      </div>
                      <div className="border border-stone-200 rounded-xl overflow-x-auto bg-white">
                        <Table compact className="min-w-[600px]">
                        <TableHeader>
                          <TableRow hoverable={false}>
                            <TableHead>Item / Description</TableHead>
                            <TableHead className="text-center w-16">Qty</TableHead>
                            <TableHead className="text-center w-16">UOM</TableHead>
                            <TableHead className="text-right w-28">Unit Price</TableHead>
                            <TableHead className="text-right w-32">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedDnItems.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-semibold text-stone-900">
                                {item.item_name || item.remarks || "Item"}
                                {item.item_code && (
                                  <div className="text-[10px] text-stone-400 font-mono tabular-nums">
                                    {item.item_code}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-center font-bold text-stone-800 font-mono tabular-nums">
                                {item.qty}
                              </TableCell>
                              <TableCell className="text-center text-stone-500 font-medium uppercase text-[10px]">
                                {item.uom || "SET"}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums text-stone-700">
                                {formatNumberWithDots(item.unit_price || 0)}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums font-bold text-stone-900">
                                {formatNumberWithDots(item.subtotal || (item.qty * (item.unit_price || 0)))}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {/* Financial Breakdown Card */}
                  <div className="p-5 bg-stone-50/70 border border-stone-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-stone-200">
                      <div className="text-[10px] font-bold text-stone-600 uppercase tracking-widest flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-stone-700" />
                        Invoice Value Breakdown (100% Aligned with Quotation)
                      </div>
                      <Badge variant="success" size="sm">
                        Auto-Integrated
                      </Badge>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-stone-700">
                        <span>Gross Subtotal:</span>
                        <span className="font-mono font-semibold">{formatIDR(grossVal)}</span>
                      </div>

                      {discRate > 0 && (
                        <div className="flex justify-between text-stone-600">
                          <span>Quotation Discount ({discRate}%):</span>
                          <span className="font-mono text-rose-600 font-medium">- {formatIDR(discVal)}</span>
                        </div>
                      )}

                      {roundVal !== 0 && (
                        <div className="flex justify-between text-stone-600">
                          <span>Rounding Factor:</span>
                          <span className="font-mono text-amber-700 font-medium">
                            {roundVal > 0 ? `- ${formatIDR(roundVal)}` : `+ ${formatIDR(Math.abs(roundVal))}`}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center py-1.5 px-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-emerald-950 font-bold">
                        <div className="flex items-center gap-1.5">
                          <span>Taxable Base:</span>
                          <span className="text-[9px] text-emerald-700 bg-emerald-100 font-medium px-1.5 py-0.5 rounded">
                            ERP Revenue Base
                          </span>
                        </div>
                        <span className="font-mono text-sm">{formatIDR(dppVal)}</span>
                      </div>

                      {isDppNilaiLainVal && (
                        <div className="flex justify-between text-stone-500 bg-stone-50 px-2 py-0.5 rounded text-[10px]">
                          <span>Alternative Tax Base (11/12):</span>
                          <span className="font-mono font-bold text-stone-700">
                            {formatIDRWithDecimals(dppNilaiLainVal, 2)}
                          </span>
                        </div>
                      )}

                      {ppnVal > 0 && (
                        <div className="flex justify-between text-stone-600">
                          <span>VAT ({isDppNilaiLainVal ? 12 : ppnRateVal}% - Tax Payable):</span>
                          <span className="font-mono text-stone-800 font-medium">+ {formatIDR(ppnVal)}</span>
                        </div>
                      )}

                      {pphVal > 0 && (
                        <div className="flex justify-between text-stone-600">
                          <span>Withholding Tax ({pphRateVal}% - Deduction):</span>
                          <span className="font-mono text-stone-800 font-medium">- {formatIDR(pphVal)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2 border-t border-stone-200 text-stone-900 font-black text-sm">
                        <span>Grand Total:</span>
                        <span className="font-mono text-base text-stone-900 bg-stone-100 px-3 py-1 rounded-xl">
                          {formatIDR(grandTotalVal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metadata Configuration */}
                  <div className="space-y-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block">
                        Job Description
                      </label>
                      <input
                        type="text"
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        required
                        placeholder="Invoice job description..."
                        className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold focus:bg-white focus:border-stone-400 outline-none transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block">
                          Payment Terms
                        </label>
                        <select
                          value={paymentTerms}
                          onChange={(e) => setPaymentTerms(e.target.value)}
                          className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-700 focus:bg-white focus:border-stone-400 outline-none transition-all"
                        >
                          <option value="Net 14">Net 14 (14 Days)</option>
                          <option value="Net 30">Net 30 (30 Days)</option>
                          <option value="Net 45">Net 45 (45 Days)</option>
                          <option value="Net 60">Net 60 (60 Days)</option>
                          <option value="Net 90">Net 90 (90 Days)</option>
                          <option value="Due on Receipt">Due on Receipt (Immediate)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block">
                          Beneficiary Bank Account
                        </label>
                        <select
                          value={bankAccountId}
                          onChange={(e) => setBankAccountId(e.target.value)}
                          required
                          className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-700 focus:bg-white focus:border-stone-400 outline-none transition-all"
                        >
                          {bankAccounts.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.bank_name} - {b.account_number}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="p-4 md:px-8 md:py-5 border-t border-stone-100 bg-stone-50 flex justify-end gap-3 rounded-b-2xl">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => setShowInvoiceModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={!selectedDn}
            >
              Issue Automated Invoice
            </Button>
          </div>
        </form>
      </Modal>

      {/* B2B Down Payment (DP) Invoice Modal */}
      <Modal
        isOpen={showDpInvoiceModal}
        onClose={() => setShowDpInvoiceModal(false)}
        title="Issue B2B Down Payment Invoice · COA 2106"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateDpInvoice} className="space-y-4 text-xs text-stone-700">
          <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-[11px] text-stone-600">
            Issuing a Down Payment Invoice from an approved quotation records a <strong>Customer Advance Liability (COA 2106)</strong>. When the Delivery Order is billed, the advance balance is automatically deducted from the final settlement invoice.
          </div>

          <div className="space-y-1.5">
            <Select
              label="Select Approved Quotation"
              value={selectedQuoId}
              onChange={(e) => setSelectedQuoId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select an APPROVED Quotation...
              </option>
              {quotations
                .filter((q: any) => q.status === "APPROVED")
                .map((q: any) => (
                  <option key={q.id} value={q.id}>
                    {q.quotation_number} — {q.customer_name} ({formatIDR(q.grand_total || q.amount || 0)})
                  </option>
                ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Input
                label="Down Payment (%)"
                type="number"
                min={5}
                max={90}
                value={dpPercentage}
                onChange={(e) => setDpPercentage(e.target.value)}
                required
                className="font-mono tabular-nums font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <Select
                label="Beneficiary Bank Account"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
              >
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bank_name} - {b.account_number}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDpInvoiceModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={!selectedQuoId}
            >
              Issue DP Invoice
            </Button>
          </div>
        </form>
      </Modal>

      {/* Register Bank Modal */}
      <Modal
        isOpen={showRegisterBankModal}
        onClose={() => setShowRegisterBankModal(false)}
        title={t("Bank Accounts")}
        maxWidth="2xl"
        contentClassName="p-0"
      >
        <div className="p-5 sm:p-6 space-y-6 bg-white font-sans text-stone-900">
          {bankAccounts.length > 0 && (
            <div className="space-y-3 mb-6 border-b border-stone-100 pb-6">
              <h4 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                {t("Registered Accounts")}
              </h4>
              {bankAccounts.map((bank) => (
                <div
                  key={bank.id}
                  className="flex justify-between items-center p-4 bg-stone-50 border border-stone-200 rounded-xl"
                >
                  <div>
                    <div className="text-sm font-bold text-stone-900">
                      {bank.bank_name}
                    </div>
                    <div className="text-[10px] font-bold font-mono text-stone-500 uppercase tracking-wider">
                      {bank.account_number} ({bank.account_holder})
                    </div>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="danger_soft"
                    onClick={() => setDeletingBankId(bank.id)}
                    title="Delete Account"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleRegisterBank} className="space-y-4">
            <h4 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
              {t("Add New Account")}
            </h4>
            <Input
              label={t("Bank Name")}
              type="text"
              value={newBank.bank_name}
              onChange={(e) =>
                setNewBank({ ...newBank, bank_name: e.target.value })
              }
              required
              placeholder="e.g. Bank Mandiri"
            />
            <Input
              label={t("Account Number")}
              type="text"
              value={newBank.account_number}
              onChange={(e) =>
                setNewBank({ ...newBank, account_number: e.target.value })
              }
              required
              className="font-mono tabular-nums"
            />
            <Input
              label={t("Account Holder")}
              type="text"
              value={newBank.account_holder}
              onChange={(e) =>
                setNewBank({ ...newBank, account_holder: e.target.value })
              }
              required
            />
            <Input
              label={t("Branch (Optional)")}
              type="text"
              value={newBank.branch}
              onChange={(e) =>
                setNewBank({ ...newBank, branch: e.target.value })
              }
            />

            <div className="pt-4 flex justify-end">
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
              >
                {t("Save Account")}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Invoice Preview & PDF Export Modal */}
      {previewInvoice && (
        <Modal
          isOpen={showPreviewModal && !!previewInvoice}
          onClose={() => setShowPreviewModal(false)}
          title={`Commercial Invoice Document: ${previewInvoice.ci_number}`}
          maxWidth="6xl"
          contentClassName="p-0 flex flex-col min-h-0 bg-stone-100"
          footer={
            <div className="w-full flex flex-wrap items-center justify-end gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowPreviewModal(false)}
              >
                Close
              </Button>
              <Button
                variant="dark"
                size="sm"
                onClick={exportInvoicePdf}
                isLoading={isSubmittingPdf}
                leftIcon={!isSubmittingPdf ? <Download className="w-4 h-4" /> : undefined}
              >
                {isSubmittingPdf ? "Generating..." : "Export PDF (A4)"}
              </Button>
            </div>
          }
        >
          {(() => {
            const pDetails = getInvoiceDetails(previewInvoice);
            const bankAcc = bankAccounts.find((b) => b.id === previewInvoice.bank_account_id) || bankAccounts[0];
            return (
              <div className="flex-1 min-h-0 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
                  <PdfPreviewWrapper>
                    <PrintTemplate
                      ref={printDocRef}
                      documentTitleId="COMMERCIAL INVOICE"
                      documentTitleEn="COMMERCIAL INVOICE"
                      documentNameId="COMMERCIAL INVOICE"
                      documentNameEn="COMMERCIAL INVOICE"
                      date={
                        previewInvoice.issue_date
                          ? new Date(previewInvoice.issue_date).toLocaleDateString("en-US", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })
                          : new Date().toLocaleDateString("en-US")
                      }
                      referenceNumber={previewInvoice.ci_number || ""}
                      documentId={previewInvoice.ci_number || previewInvoice.id || ""}
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
                                {previewInvoice.customer_name}
                              </div>
                              <div className="text-xs text-stone-600 leading-relaxed font-medium">
                                {previewInvoice.customer_address || "Indonesia"}
                              </div>
                              {(previewInvoice.customer_phone || previewInvoice.customer_email) && (
                                <div className="text-xs text-stone-500 mt-1 font-mono">
                                  {previewInvoice.customer_phone} {previewInvoice.customer_email ? `| ${previewInvoice.customer_email}` : ""}
                                </div>
                              )}
                            </div>

                            <div className="col-span-2 text-right flex flex-col items-end justify-center">
                              <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                                JOB DESCRIPTION
                              </div>
                              <div className="text-sm font-black text-stone-900">
                                {previewInvoice.job_description || "Commercial Trade Delivery"}
                              </div>
                              <div className="mt-2 text-xs font-semibold text-stone-600">
                                Delivery Note / DN: <span className="font-mono font-bold text-stone-900">{previewInvoice.dn_number || "-"}</span>
                              </div>
                              <div className="text-xs font-semibold text-stone-600">
                                Due Date: <span className="font-bold text-stone-900">{previewInvoice.due_date ? new Date(previewInvoice.due_date).toLocaleDateString("en-US") : "-"}</span>
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
                                {previewInvoice.items && previewInvoice.items.length > 0 ? (
                                  previewInvoice.items.map((item: any, idx: number) => {
                                    const unitPrice = (item.unit_price !== undefined && item.unit_price !== null && Number(item.unit_price) > 0)
                                      ? Number(item.unit_price)
                                      : Math.round(pDetails.gross_amount / (previewInvoice.items.length || 1));
                                    const totalRow = item.subtotal ? Number(item.subtotal) : ((item.qty || 1) * unitPrice);
                                    return (
                                      <tr key={idx}>
                                        <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                                          {idx + 1}
                                        </td>
                                        <td className="py-4 px-3 text-base font-black text-stone-900 uppercase tracking-tight">
                                          {item.item_name || item.remarks || "Item Delivery"}
                                          {item.item_code && <div className="text-[10px] text-stone-500 font-mono font-normal tracking-wider mt-1">{item.item_code}</div>}
                                        </td>
                                        <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                                          {item.qty || 1}
                                        </td>
                                        <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">
                                          {item.uom || "SET"}
                                        </td>
                                        <td className="py-4 px-3 text-right text-stone-800 font-mono font-bold text-sm">
                                          {canViewPrices ? formatNumberWithDots(unitPrice) : <ConfidentialBadge />}
                                        </td>
                                        <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-sm">
                                          {canViewPrices ? formatNumberWithDots(totalRow) : <ConfidentialBadge />}
                                        </td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">1</td>
                                    <td className="py-4 px-3 text-base font-black text-stone-900 uppercase tracking-tight">
                                      {previewInvoice.job_description || "Commercial Delivery / Contract Service"}
                                    </td>
                                    <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">1</td>
                                    <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">SET</td>
                                    <td className="py-4 px-3 text-right text-stone-800 font-mono font-bold text-sm">{canViewPrices ? formatNumberWithDots(pDetails.gross_amount) : <ConfidentialBadge />}</td>
                                    <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-sm">{canViewPrices ? formatNumberWithDots(pDetails.gross_amount) : <ConfidentialBadge />}</td>
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
                                    {canViewPrices ? <>Rp{"\u00A0"}{formatNumberWithDots(pDetails.gross_amount)}</> : <ConfidentialBadge />}
                                  </span>
                                </div>
                                {pDetails.discount_amount > 0 && (
                                  <div className="flex justify-between items-center px-3 py-0.5 text-rose-600 font-semibold text-[11px] gap-2">
                                    <span className="uppercase tracking-wider whitespace-nowrap">
                                      Discount ({pDetails.discount_rate}%)
                                    </span>
                                    <span className="font-mono text-xs whitespace-nowrap">
                                      {canViewPrices ? <>- Rp{"\u00A0"}{formatNumberWithDots(pDetails.discount_amount)}</> : <ConfidentialBadge />}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center px-3 py-1.5 bg-stone-100 border-y border-stone-300 font-bold text-stone-900 text-[11px] gap-2">
                                  <span className="uppercase tracking-wider whitespace-nowrap">
                                    Taxable Base (Net Base)
                                  </span>
                                  <span className="font-mono text-xs font-black whitespace-nowrap">
                                    {canViewPrices ? <>Rp{"\u00A0"}{formatNumberWithDots(pDetails.dpp)}</> : <ConfidentialBadge />}
                                  </span>
                                </div>
                                {Number(previewInvoice.dpp_nilai_lain) > 0 && (
                                  <div className="flex justify-between items-center px-3 py-0.5 text-stone-600 font-semibold text-[11px] gap-2">
                                    <span className="uppercase tracking-wider whitespace-nowrap">
                                      Alternative Tax Base (11/12)
                                    </span>
                                    <span className="font-mono text-xs font-bold whitespace-nowrap">
                                      {canViewPrices ? <>Rp{"\u00A0"}{formatNumberWithDots(Number(previewInvoice.dpp_nilai_lain))}</> : <ConfidentialBadge />}
                                    </span>
                                  </div>
                                )}
                                {pDetails.ppn > 0 && (
                                  <div className="flex justify-between items-center px-3 py-0.5 text-stone-800 font-bold text-[11px] gap-2">
                                    <span className="uppercase tracking-wider whitespace-nowrap">
                                      VAT ({pDetails.ppn_rate}%)
                                    </span>
                                    <span className="font-mono text-xs font-bold whitespace-nowrap">
                                      {canViewPrices ? <>+ Rp{"\u00A0"}{formatNumberWithDots(pDetails.ppn)}</> : <ConfidentialBadge />}
                                    </span>
                                  </div>
                                )}
                                {Number(previewInvoice.dp_deduction_amount) > 0 && (
                                  <div className="flex justify-between items-center px-3 py-1 bg-amber-50 border-y border-amber-200 text-amber-900 font-bold text-[11px] gap-2">
                                    <span className="uppercase tracking-wider whitespace-nowrap">
                                      Less: Down Payment Deduction (COA 2106)
                                    </span>
                                    <span className="font-mono text-xs font-bold text-rose-600 whitespace-nowrap">
                                      {canViewPrices ? <>- Rp{"\u00A0"}{formatNumberWithDots(Number(previewInvoice.dp_deduction_amount))}</> : <ConfidentialBadge />}
                                    </span>
                                  </div>
                                )}
                                {pDetails.rounding_factor !== 0 && (
                                  <div className="flex justify-between items-center px-3 py-0.5 text-stone-800 font-semibold text-[11px] gap-2">
                                    <span className="uppercase tracking-wider whitespace-nowrap">
                                      Rounding Adjustment
                                    </span>
                                    <span className="font-mono text-xs font-bold whitespace-nowrap">
                                      {canViewPrices ? <>{pDetails.rounding_factor > 0 ? "+ " : "- "}Rp{"\u00A0"}{formatNumberWithDots(Math.abs(pDetails.rounding_factor))}</> : <ConfidentialBadge />}
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between items-center pt-3 border-t-2 border-stone-900 px-3 font-black text-sm uppercase tracking-wider text-stone-900 gap-3">
                                  <span className="whitespace-nowrap">
                                    GRAND TOTAL
                                  </span>
                                  <span className="font-mono text-base tracking-tight font-black text-stone-950 whitespace-nowrap">
                                    {canViewPrices ? <>Rp{"\u00A0"}{formatNumberWithDots(pDetails.grand_total)}</> : <ConfidentialBadge size="sm" />}
                                  </span>
                                </div>
                                {pDetails.pph > 0 && (
                                  <>
                                    <div className="flex justify-between items-center px-3 py-1 bg-amber-50/60 border-t border-amber-200 text-amber-900 font-bold text-[11px] gap-2">
                                      <span className="uppercase tracking-wider whitespace-nowrap">
                                        Withholding Tax / WHT ({pDetails.pph_rate}%)
                                      </span>
                                      <span className="font-mono text-xs font-bold text-rose-600 whitespace-nowrap">
                                        {canViewPrices ? <>- Rp{"\u00A0"}{formatNumberWithDots(pDetails.pph)}</> : <ConfidentialBadge />}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center px-3 py-1.5 bg-emerald-50/70 border-t border-emerald-300 font-black text-xs uppercase tracking-wider text-emerald-950 gap-3">
                                      <span className="whitespace-nowrap">
                                        NET PAYABLE
                                      </span>
                                      <span className="font-mono text-sm tracking-tight font-black text-emerald-900 whitespace-nowrap">
                                        {canViewPrices ? <>Rp{"\u00A0"}{formatNumberWithDots(pDetails.net_payable)}</> : <ConfidentialBadge />}
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
                                <>## {angkaKeTerbilang(pDetails.pph > 0 && pDetails.net_payable > 0 ? pDetails.net_payable : pDetails.grand_total)} Rupiah ##</>
                              ) : (
                                <ConfidentialBadge size="sm" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Payment Details & Finance Manager Signature (60:40 Ratio) */}
                        <div className="grid grid-cols-5 gap-8 pt-6 border-t border-stone-200 mt-4 w-full">
                          <div className="col-span-3 border-r border-stone-200 pr-6">
                            <div className="text-[9px] font-black text-stone-900 uppercase tracking-widest mb-2">
                              PAYMENT TO:
                            </div>
                            {bankAcc ? (
                              <div className="space-y-1">
                                <div className="font-black text-stone-900 text-xs uppercase">{bankAcc.bank_name}</div>
                                <div className="font-mono font-bold text-stone-900 text-sm tracking-tight">{bankAcc.account_number}</div>
                                <div className="text-stone-600 font-bold text-xs">Account Holder: {bankAcc.account_holder}</div>
                                {bankAcc.branch && <div className="text-[10px] text-stone-500 font-medium mt-0.5">Branch: {bankAcc.branch}</div>}
                              </div>
                            ) : (
                              <div className="text-xs text-stone-500 italic">Contact Finance Department for bank account details.</div>
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
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
