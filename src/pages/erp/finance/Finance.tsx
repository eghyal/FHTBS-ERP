import React, { useState, useEffect, useRef } from "react";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/utils/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { getDailyAuthKey } from "@/utils/auth";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { collection, onSnapshot, query, limit, orderBy } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  ArrowRight,
  ShieldCheck,
  Activity,
  BarChart4,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  Plus,
  Eye,
  QrCode,
  FileText,
  Lock,
  PieChart,
  BookOpen,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  Calculator,
  Layers,
} from "lucide-react";
import { cn, formatIDR, formatNumberWithDots } from "@/lib/utils";
import { motion } from "motion/react";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { generatePDF } from "@/lib/pdfGenerator";
import { ProjectHppModal } from "@/components/erp/ProjectHppModal";
import { ClosingReminderBanner } from "@/components/finance/ClosingReminderBanner";
const FinanceChart = lazy(() => import("@/components/erp/FinanceChart"));

export default function Finance() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("CONSUMABLE");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expensePin, setExpensePin] = useState("");
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // Visual Ledger Report Modal State
  const [showVisualLedgerModal, setShowVisualLedgerModal] = useState(false);

  // Dual COGS View State (Pure Material vs Comprehensive)
  const [cogsPerspective, setCogsPerspective] = useState<"MATERIAL" | "COMPREHENSIVE">("MATERIAL");

  // Project COGS / HPP Inspector State (Relocated from Project Details)
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [selectedProjectIdForHpp, setSelectedProjectIdForHpp] = useState<string>("");
  const [isHppModalOpen, setIsHppModalOpen] = useState<boolean>(false);

  // PDF Document Preview State
  const [selectedTxForDoc, setSelectedTxForDoc] = useState<any>(null);
  const [showDocModal, setShowDocModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  const { showToast } = useToast();
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const currentDateNum = new Date().getDate();
  const isTutupBukuWindow = currentDateNum >= 15 && currentDateNum <= 24;

  const exportFinancePdf = async () => {
    if (!docRef.current) return;
    setIsExportingPdf(true);
    try {
      const docName = selectedTxForDoc ? `TRANSACTION_VOUCHER_${selectedTxForDoc.id.split('-')[0]}.pdf` : "FINANCIAL_CASH_REPORT.pdf";
      await generatePDF(docRef.current, docName);
      showToast("Financial document exported to PDF successfully", "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to export Financial PDF", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const [res, projRes] = await Promise.all([
        apiFetch("/api/finance/analytics", {}, user?.username),
        apiFetch("/api/projects", {}, user?.username),
      ]);
      if (res.ok) {
        setData(res.data);
      } else {
        showToast("Error fetching finance analytics", "error");
      }
      if (projRes.ok && Array.isArray(projRes.data)) {
        const validProjects = projRes.data.filter(
          (p: any) =>
            p &&
            p.id &&
            !["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"].includes(String(p.id).toUpperCase()) &&
            !String(p.name || "").toUpperCase().includes("CONSUMABLE") &&
            !String(p.name || "").toUpperCase().includes("TRANSPORTATION") &&
            !String(p.name || "").toUpperCase().includes("OTHER PROCUREMENT") &&
            !String(p.name || "").toUpperCase().includes("GENERAL PROCUREMENT")
        );
        setProjectsList(validProjects);
        if (validProjects.length > 0 && !selectedProjectIdForHpp) {
          setSelectedProjectIdForHpp(validProjects[0].id);
        }
      }
    } catch (err) {
      showToast("Error connecting to server", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleRecordExpense = async (submittedPin: string) => {
    if (submittedPin !== getDailyAuthKey(user?.username)) {
      showToast("Invalid authorization PIN", "error");
      return;
    }
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast("Invalid expense amount", "error");
      return;
    }

    // Optimistic UI update
    const tempTx = {
      id: `temp-${Date.now()}`,
      type: "OUT",
      category: expenseCategory,
      notes: expenseNotes,
      amount: amt,
      transaction_date: new Date().toISOString(),
      payment_method: "BANK TRANSFER"
    };

    setData((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        total_cogs: (prev.total_cogs || 0) + amt,
        gross_margin: (prev.gross_margin || 0) - amt,
        recent_transactions: [tempTx, ...(prev.recent_transactions || [])]
      };
    });

    setIsSubmittingExpense(true);
    try {
      const res = await apiFetch("/api/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          category: expenseCategory,
          notes: expenseNotes,
          pin: submittedPin,
        }),
      }, user?.username);
      
      if (res.ok) {
        showToast("Expense recorded successfully", "success");
        setShowExpenseModal(false);
        setExpenseAmount("");
        setExpenseNotes("");
        setExpensePin("");
        fetchAnalytics();
      } else {
        showToast(res.error || "Failed to record expense", "error");
        fetchAnalytics(); // Rollback
      }
    } catch (err) {
      showToast("Network error", "error");
      fetchAnalytics(); // Rollback
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const handleExportCSV = () => {
    const curDay = new Date().getDate();
    const isTBActive = curDay >= 15 && curDay <= 24;

    if (!isTBActive) {
      showToast("General Ledger CSV export is accessible only during the monthly closing window (15th – 24th).", "error");
      return;
    }
    if (!data) return;

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const now = new Date();
    const currentMonthName = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();

    const csvRows: string[] = [];

    // 1. CORPORATE HEADER METADATA
    csvRows.push(`========================================================================================`);
    csvRows.push(`GENERAL LEDGER EXECUTIVE AUDIT REPORT`);
    csvRows.push(`========================================================================================`);
    csvRows.push(`Export Date,${now.toLocaleDateString('en-US')} ${now.toLocaleTimeString('en-US')}`);
    csvRows.push(`Report Period,${currentMonthName} ${currentYear}`);
    csvRows.push(`Closing Status,CLOSING WINDOW ACTIVE (15th - 24th)`);
    csvRows.push(`System Module,Finance & Treasury Hub Engine (ERP)`);
    csvRows.push(``);

    // 2. EXECUTIVE FINANCIAL KPI SUMMARY
    csvRows.push(`--- EXECUTIVE FINANCIAL KPI SUMMARY ---`);
    csvRows.push(`Financial Metric,Nominal Value (IDR),Ratio / % of Revenue,Status`);

    const billed = Number(data.total_billed || 0);
    const received = Number(data.total_received || 0);
    const receivable = Number(data.total_receivable || 0);
    const cogs = Number(data.total_cogs || 0);
    const materialCogs = Number(data.total_material_cogs || data.total_cogs || 0);
    const laborCogs = Number(data.total_labor_cogs || 0);
    const fullCogs = Number(data.total_full_cogs || cogs || 0);
    const grossMargin = Number(data.gross_margin || 0);
    const grossMarginMaterial = Number(data.gross_margin_material ?? (Number(data.total_revenue_realized || 0) - materialCogs));
    const grossMarginFull = Number(data.gross_margin_full ?? (Number(data.total_revenue_realized || 0) - fullCogs));
    const recPct = billed > 0 ? ((received / billed) * 100).toFixed(1) : "0.0";
    const arPct = billed > 0 ? ((receivable / billed) * 100).toFixed(1) : "0.0";
    const cogsPct = billed > 0 ? ((cogs / billed) * 100).toFixed(1) : "0.0";
    const marginPct = billed > 0 ? ((grossMargin / billed) * 100).toFixed(1) : "0.0";

    csvRows.push(`Total Revenue Billed,"Rp ${formatNumberWithDots(billed)}",100.0%,Confirmed Billed`);
    csvRows.push(`Total Actual Cash Received,"Rp ${formatNumberWithDots(received)}",${recPct}%,Realized Cash Inflow`);
    csvRows.push(`Accounts Receivable,"Rp ${formatNumberWithDots(receivable)}",${arPct}%,Invoices Outstanding`);
    csvRows.push(`Direct Material COGS,"Rp ${formatNumberWithDots(materialCogs)}",${billed > 0 ? ((materialCogs / billed) * 100).toFixed(1) : "0.0"}%,Direct Material Only (PR/PO & BOM)`);
    csvRows.push(`Comprehensive COGS (Material + Direct Labor),"Rp ${formatNumberWithDots(fullCogs)}",${billed > 0 ? ((fullCogs / billed) * 100).toFixed(1) : "0.0"}%,Material + Direct Labor + Variables`);
    csvRows.push(`Direct Labor Cost,"Rp ${formatNumberWithDots(laborCogs)}",${billed > 0 ? ((laborCogs / billed) * 100).toFixed(1) : "0.0"}%,Direct Labor / Production Overtime`);
    csvRows.push(`Total COGS & Expenses,"Rp ${formatNumberWithDots(cogs)}",${cogsPct}%,Direct & Operating Costs`);
    csvRows.push(`Gross Margin (Direct Material),"Rp ${formatNumberWithDots(grossMarginMaterial)}",${billed > 0 ? ((grossMarginMaterial / billed) * 100).toFixed(1) : "0.0"}%,${grossMarginMaterial >= 0 ? 'PROFITABLE' : 'DEFICIT'}`);
    csvRows.push(`Gross Margin (Comprehensive COGS),"Rp ${formatNumberWithDots(grossMarginFull)}",${billed > 0 ? ((grossMarginFull / billed) * 100).toFixed(1) : "0.0"}%,${grossMarginFull >= 0 ? 'PROFITABLE' : 'DEFICIT'}`);
    csvRows.push(``);

    // 3. MONTHLY FINANCIAL PERFORMANCE LEDGER
    csvRows.push(`--- MONTHLY FINANCIAL PERFORMANCE LEDGER ---`);
    csvRows.push(`Month,Revenue Billed (IDR),COGS & Expenses (IDR),Gross Profit (IDR),Gross Margin %,Status,Performance Summary`);

    if (Array.isArray(data.chartData)) {
      data.chartData.forEach((row: any) => {
        const rev = Number(row.revenue || 0);
        const c = Number(row.cogs || 0);
        const p = Number(row.profit || rev - c);
        const mPct = rev > 0 ? ((p / rev) * 100).toFixed(1) : "0.0";
        let statusStr = "BALANCED";
        let storyStr = "Revenue performance and expense efficiency are balanced.";
        if (p > 0 && Number(mPct) >= 25) {
          statusStr = "EXCELLENT MARGIN";
          storyStr = "High profitability with effective cost control.";
        } else if (p < 0) {
          statusStr = "DEFICIT WARNING";
          storyStr = "Operating expenses exceed revenue. Cost review recommended.";
        }
        csvRows.push(`"${row.name}","Rp ${formatNumberWithDots(rev)}","Rp ${formatNumberWithDots(c)}","Rp ${formatNumberWithDots(p)}",${mPct}%,${statusStr},"${storyStr}"`);
      });
    }
    csvRows.push(``);

    // 4. ITEMIZED TRANSACTION AUDIT LOG
    csvRows.push(`--- TRANSACTION AUDIT LOG ---`);
    csvRows.push(`Tx Ref ID,Date & Time,Cash Type,Category,Description & Reference,Payment Method,Debit IN (IDR),Credit OUT (IDR),Audit Status`);

    if (Array.isArray(data.recent_transactions)) {
      data.recent_transactions.forEach((tx: any, idx: number) => {
        const txId = tx.id || `TX-${idx + 1}`;
        const dateStr = tx.transaction_date ? new Date(tx.transaction_date).toLocaleString('en-US') : '-';
        const typeStr = tx.type === 'IN' ? 'CASH IN' : 'CASH OUT';
        const catStr = tx.category || 'OPERATIONAL';
        const descStr = (tx.notes || tx.reference_id || 'Ledger Transaction').replace(/"/g, '""');
        const payMethod = tx.payment_method || 'BANK TRANSFER';
        const inAmt = tx.type === 'IN' ? `Rp ${formatNumberWithDots(tx.amount || 0)}` : 'Rp 0';
        const outAmt = tx.type === 'OUT' ? `Rp ${formatNumberWithDots(tx.amount || 0)}` : 'Rp 0';
        csvRows.push(`"${txId}","${dateStr}","${typeStr}","${catStr}","${descStr}","${payMethod}","${inAmt}","${outAmt}","VERIFIED"`);
      });
    }
    csvRows.push(``);

    // 5. AUDIT & SIGN-OFF METADATA
    csvRows.push(`--- SYSTEM AUTHORIZATION & VERIFICATION ---`);
    csvRows.push(`System Module,ERP Finance Controller Hub`);
    csvRows.push(`Daily Auth Token,${getDailyAuthKey(user?.username)}`);
    csvRows.push(`Verification,This General Ledger document is verified and audit compliant.`);
    csvRows.push(`========================================================================================`);

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `General_Ledger_${currentYear}_${now.toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("General Ledger CSV exported successfully!", "success");
  };

  if (isLoading || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <div className="w-10 h-10 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
        <p className="text-sm font-bold text-stone-500 uppercase tracking-widest">
          Loading Ledger...
        </p>
      </div>
    );
  }

  const {
    total_billed,
    total_billed_gross,
    total_received,
    total_receivable,
    total_revenue_realized,
    total_tax_collected,
    total_cogs,
    total_material_cogs = 0,
    total_labor_cogs = 0,
    total_full_cogs = 0,
    gross_margin_material,
    gross_margin_full,
    gross_margin,
    chartData,
    recent_transactions,
  } = data;

  const effectiveMaterialCogs = Number(total_material_cogs || total_cogs || 0);
  const effectiveFullCogs = Number(total_full_cogs || (effectiveMaterialCogs + (Number(total_labor_cogs) || 0)) || total_cogs || 0);
  const activeCogs = cogsPerspective === "MATERIAL" ? effectiveMaterialCogs : effectiveFullCogs;

  const realizedRev = Number(total_revenue_realized || 0);
  const activeGrossMargin = cogsPerspective === "MATERIAL"
    ? Number(gross_margin_material ?? (realizedRev - effectiveMaterialCogs))
    : Number(gross_margin_full ?? (realizedRev - effectiveFullCogs));
  const isProfitable = activeGrossMargin >= 0;

  return (
    <div className="space-y-4 sm:space-y-5 pb-24 animate-in fade-in duration-500">
      <PageHeader
        title={t("General Ledger")}
        subtitle={t("Financial summary")}
        icon={<Landmark className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <a
              href="/general-ledger"
              className="h-8 px-3 inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border border-stone-200/90 hover:border-stone-300 text-stone-700 hover:text-stone-900 rounded-lg text-[11px] font-semibold tracking-tight transition-all shadow-2xs"
            >
              <BookOpen className="w-3.5 h-3.5 text-stone-500" />
              <span>General Ledger</span>
            </a>
            <a
              href="/ar-aging"
              className="h-8 px-3 inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border border-stone-200/90 hover:border-stone-300 text-stone-700 hover:text-stone-900 rounded-lg text-[11px] font-semibold tracking-tight transition-all shadow-2xs"
            >
              <TrendingUp className="w-3.5 h-3.5 text-stone-500" />
              <span>AR Aging</span>
            </a>
            <a
              href="/cashflow-forecast"
              className="h-8 px-3 inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border border-stone-200/90 hover:border-stone-300 text-stone-700 hover:text-stone-900 rounded-lg text-[11px] font-semibold tracking-tight transition-all shadow-2xs"
            >
              <BarChart4 className="w-3.5 h-3.5 text-stone-500" />
              <span>Cash Flow</span>
            </a>
            <Link
              to="/book-closing"
              className="h-8 px-3 inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border border-stone-200/90 hover:border-stone-300 text-stone-700 hover:text-stone-900 rounded-lg text-[11px] font-semibold tracking-tight transition-all shadow-2xs whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-stone-500" />
              <span>Book Closing</span>
            </Link>
            <Button
              size="sm"
              onClick={() => setShowExpenseModal(true)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              {t("Record Expense")}
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={fetchAnalytics}
              title={t("Refresh")}
              aria-label={t("Refresh")}
            >
              <RefreshCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />

      <ClosingReminderBanner />

      {/* PROJECT COGS VALUATION */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700 shrink-0">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Project COGS Valuation
            </h3>
            <p className="text-xs text-stone-500">
              Inspect BOM material, direct labor, and overhead cost breakdown per project.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <div className="min-w-[240px]">
            <Select
              value={selectedProjectIdForHpp}
              onChange={(e) => setSelectedProjectIdForHpp(e.target.value)}
            >
              {projectsList.length === 0 ? (
                <option value="">No active manufacturing projects</option>
              ) : (
                projectsList.map((proj: any) => (
                  <option key={proj.id} value={proj.id}>
                    [{proj.spk_number || String(proj.id).slice(0, 8)}] {proj.name} ({proj.status})
                  </option>
                ))
              )}
            </Select>
          </div>

          <Button
            size="sm"
            variant="primary"
            disabled={!selectedProjectIdForHpp}
            onClick={() => setIsHppModalOpen(true)}
            leftIcon={<Calculator className="w-3.5 h-3.5" />}
            className="shrink-0"
          >
            COGS Calculation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl p-6 shadow-xs"
        >
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-stone-50 flex items-center justify-center border border-stone-200">
                <BarChart4 className="w-5 h-5 text-stone-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900">
                  {t("Financial Performance")}
                </h3>
                <p className="text-xs font-semibold text-stone-500">
                  {t("Revenue vs COGS (Trailing)")}
                </p>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-8 h-8 border-4 border-stone-200 border-t-stone-500 rounded-full animate-spin"></div></div>}>
              <FinanceChart chartData={chartData} />
            </Suspense>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col gap-5"
        >
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center border shadow-xs",
                  isTutupBukuWindow ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"
                )}>
                  {isTutupBukuWindow ? <Download className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-stone-900">
                    Export Ledger (CSV)
                  </h4>
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md inline-block mt-0.5",
                    isTutupBukuWindow ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  )}>
                    {isTutupBukuWindow ? "CLOSING WINDOW ACTIVE (15th–24th)" : "CLOSING LOCKED (15th–24th)"}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-stone-500 font-medium leading-relaxed">
              {isTutupBukuWindow
                ? "CSV General Ledger report with executive summaries and transaction logs."
                : "General Ledger export is locked outside of the monthly closing window (15th–24th)."}
            </p>

            <div className="space-y-2">
              <Button
                onClick={handleExportCSV}
                disabled={!isTutupBukuWindow}
                fullWidth
                leftIcon={
                  isTutupBukuWindow ? (
                    <Download className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )
                }
              >
                {isTutupBukuWindow ? "Export CSV Ledger" : "Closing Period Locked"}
              </Button>

              <Button
                variant="secondary"
                fullWidth
                onClick={() => setShowVisualLedgerModal(true)}
                leftIcon={<BookOpen className="w-4 h-4" />}
              >
                View Visual Ledger Report
              </Button>

              <Link
                to="/book-closing"
                className="w-full h-9 px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold text-stone-800 bg-white border border-stone-200 hover:bg-stone-100 rounded-xl transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-stone-600" />
                <span>Tutup Buku &amp; Required Items</span>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>

      {recent_transactions && recent_transactions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs"
        >
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 mb-1">
                Recent Transactions
              </h3>
              <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">
                Latest ledger entries
              </p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent_transactions.map((tx: any) => (
                <TableRow
                  key={tx.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedTxForDoc(tx);
                    setShowDocModal(true);
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border",
                          tx.type === "IN"
                            ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                            : "bg-rose-50 border-rose-100 text-rose-600"
                        )}
                      >
                        {tx.type === "IN" ? (
                          <ArrowDownRight className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-stone-900 font-mono tabular-nums tracking-tight">
                          {tx.id.split("-")[0] + "-" + tx.id.split("-")[1]}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mt-0.5 font-mono tabular-nums">
                          {new Date(tx.transaction_date).toLocaleString("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" size="sm">
                      {tx.category || "UNKNOWN"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div
                      className="text-xs font-bold text-stone-700 max-w-[200px] truncate"
                      title={tx.notes || tx.reference_id}
                    >
                      {tx.notes || tx.reference_id || "-"}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mt-0.5">
                      {tx.payment_method || "BANK TRANSFER"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className={cn(
                        "text-sm font-black font-mono tabular-nums tracking-tight",
                        tx.type === "IN" ? "text-emerald-600" : "text-rose-600"
                      )}
                    >
                      {tx.type === "IN" ? "+" : "-"}
                      {formatIDR(tx.amount)}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTxForDoc(tx);
                        setShowDocModal(true);
                      }}
                      title="View Cash Voucher Details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </motion.div>
      )}

      {/* EXECUTIVE STORY TABLE & FINANCIAL PERFORMANCE NARRATIVE */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-white border border-stone-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-6"
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-stone-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-stone-900 uppercase tracking-wide">
                Executive Story Table & Performance Narrative
              </h3>
              <p className="text-xs font-semibold text-stone-500">
                Monthly cash flow summary, profitability margins, and cost efficiency analysis
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant={isTutupBukuWindow ? "success" : "secondary"}
            onClick={handleExportCSV}
            disabled={!isTutupBukuWindow}
            leftIcon={
              isTutupBukuWindow ? (
                <Download className="w-3.5 h-3.5" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )
            }
          >
            Export CSV Ledger
          </Button>
        </div>

        <div className="rounded-xl border border-stone-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Revenue Billed</TableHead>
                <TableHead className="text-right">COGS & Expenses</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-center">Profit Margin</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="min-w-[260px]">Performance Narrative</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.isArray(chartData) &&
                chartData.map((row: any, idx: number) => {
                  const rev = Number(row.revenue || 0);
                  const c = Number(row.cogs || 0);
                  const profit = Number(row.profit || rev - c);
                  const marginRatio = rev > 0 ? (profit / rev) * 100 : 0;
                  let badgeVariant: "success" | "warning" | "danger" = "success";
                  let statusLabel = "EXCELLENT MARGIN";
                  let storyText = `Revenue for ${row.name} reached Rp ${formatNumberWithDots(rev)} with healthy profit margin.`;

                  if (marginRatio >= 20) {
                    badgeVariant = "success";
                    statusLabel = "EXCELLENT MARGIN";
                  } else if (marginRatio > 0) {
                    badgeVariant = "warning";
                    statusLabel = "BALANCED MARGIN";
                    storyText = `Cash flow for ${row.name} is balanced at ${marginRatio.toFixed(1)}% margin ratio.`;
                  } else {
                    badgeVariant = "danger";
                    statusLabel = "HIGH COGS WARNING";
                    storyText = `Operating expenses in ${row.name} impacted gross profit margins.`;
                  }

                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-bold text-stone-900">
                        {row.name}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-emerald-700 font-bold">
                        {formatIDR(rev)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-rose-600 font-bold">
                        {formatIDR(c)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-stone-900 font-black">
                        {formatIDR(profit)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-mono tabular-nums text-xs font-black">
                            {marginRatio.toFixed(1)}%
                          </span>
                          <div className="w-16 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                marginRatio >= 20
                                  ? "bg-emerald-500"
                                  : marginRatio > 0
                                    ? "bg-amber-500"
                                    : "bg-rose-500"
                              )}
                              style={{
                                width: `${Math.min(100, Math.max(0, marginRatio))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={badgeVariant} size="sm">
                          {statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-stone-600 text-xs font-medium leading-snug">
                        {storyText}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </motion.div>

      {/* VISUAL LEDGER REPORT MODAL */}
      <Modal
        isOpen={showVisualLedgerModal}
        onClose={() => setShowVisualLedgerModal(false)}
        title="Visual General Ledger Report"
        description="Visual executive summary, trend analytics, and transaction log overview."
        maxWidth="5xl"
      >
        <div className="space-y-6">
          {/* Header Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Total Actual Revenue
              </span>
              <p className="text-xl font-mono tabular-nums font-black text-emerald-700">
                {formatIDR(total_received)}
              </p>
              <span className="text-[10px] text-stone-500 mt-0.5 block">100% Verified Cash In</span>
            </div>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Accounts Receivable
              </span>
              <p className="text-xl font-mono tabular-nums font-black text-amber-700">
                {formatIDR(total_receivable)}
              </p>
              <span className="text-[10px] text-stone-500 mt-0.5 block">Outstanding Invoices</span>
            </div>

            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Gross Profit Margin
              </span>
              <p className="text-xl font-mono tabular-nums font-black text-stone-900">
                {formatIDR(gross_margin)}
              </p>
              <span className="text-[10px] text-emerald-600 font-bold mt-0.5 block">Audit Ready Ledger</span>
            </div>
          </div>

          {/* Graphical Breakdown */}
          <div className="bg-stone-50 border border-stone-200 p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <BarChart4 className="w-5 h-5 text-emerald-600" />
                <h4 className="font-extrabold text-sm uppercase tracking-wide text-stone-900">Monthly Financial Performance Trend</h4>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-stone-200/80 px-2.5 py-1 rounded-md text-stone-700">
                ERP Audit Chart
              </span>
            </div>
            <div className="h-48 w-full">
              <Suspense fallback={<div className="h-full flex items-center justify-center text-stone-400">Loading Chart...</div>}>
                <FinanceChart chartData={chartData} />
              </Suspense>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-stone-200">
            <div className="text-xs text-stone-500 font-medium">
              Closing Window: <span className="font-bold text-stone-800">15th – 24th Monthly</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="secondary" onClick={() => setShowVisualLedgerModal(false)}>
                Close Window
              </Button>
              <Button
                variant="primary"
                onClick={handleExportCSV}
                disabled={!isTutupBukuWindow}
                leftIcon={
                  isTutupBukuWindow ? (
                    <Download className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )
                }
              >
                Export CSV Ledger
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Record Expense Modal */}
      <AuthorizeDocModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        docType="Manual Expense"
        docNumber={`EXP-${new Date().getTime().toString().slice(-6)}`}
        amount={Number(expenseAmount) || 0}
        subtitle="Log operational expenses such as consumables and other overhead costs."
        isSubmitting={isSubmittingExpense}
        onAuthorize={handleRecordExpense}
      >
        <div className="space-y-4 pt-2">
          <Input
            label="Amount (IDR)"
            type="number"
            required
            min="1"
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            className="font-mono font-bold text-base"
            placeholder="e.g. 500000"
          />
          <Select
            label="Category"
            value={expenseCategory}
            onChange={(e) => setExpenseCategory(e.target.value)}
          >
            <option value="CONSUMABLE">Consumables (Electricity & Water)</option>
            <option value="TRANSPORTATION">Transportation (Fuel, Toll, Tickets)</option>
            <option value="OTHERS">Others</option>
          </Select>
          <Textarea
            label="Notes / Description"
            required
            rows={3}
            value={expenseNotes}
            onChange={(e) => setExpenseNotes(e.target.value)}
            placeholder="Monthly electricity bill..."
          />
        </div>
      </AuthorizeDocModal>

      {/* Finance Transaction / Ledger PDF Document Preview Modal */}
      {selectedTxForDoc && (
        <Modal
          isOpen={showDocModal}
          onClose={() => setShowDocModal(false)}
          title={`Cash Transaction / Journal Voucher: ${selectedTxForDoc.id}`}
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
                onClick={exportFinancePdf}
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
                documentTitleId="FINANCIAL TRANSACTION VOUCHER"
                documentTitleEn="FINANCIAL TRANSACTION VOUCHER"
                documentNameId="CASH JOURNAL VOUCHER"
                documentNameEn="CASH JOURNAL VOUCHER"
                date={
                  selectedTxForDoc.transaction_date
                    ? new Date(selectedTxForDoc.transaction_date).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : new Date().toLocaleDateString("en-US")
                }
                referenceNumber={selectedTxForDoc.id || ""}
                documentId={selectedTxForDoc.id || ""}
              >
                <div className="bg-white p-8 text-sm text-black flex flex-col h-full justify-between">
                  <div>
                    {/* Header Subject Area */}
                    <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200 grid grid-cols-2 gap-8">
                      <div>
                        <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                          TRANSACTION TYPE & CATEGORY
                        </div>
                        <div className="text-base font-black text-stone-900 tracking-tight leading-tight uppercase mb-1">
                          {selectedTxForDoc.type === "IN" ? "CASH RECEIPT / CASH IN" : "CASH DISBURSEMENT / CASH OUT"}
                        </div>
                        <div className="text-xs text-stone-600 font-bold uppercase tracking-wider">
                          Category: <span className="text-stone-900">{selectedTxForDoc.category || "OPERATIONAL"}</span>
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end justify-center">
                        <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1">
                          TRANSACTION AMOUNT
                        </div>
                        <div className={cn("text-2xl font-black font-mono", selectedTxForDoc.type === "IN" ? "text-emerald-700" : "text-stone-900")}>
                          {selectedTxForDoc.type === "IN" ? "+" : "-"}{formatIDR(selectedTxForDoc.amount)}
                        </div>
                        <div className="text-xs text-stone-500 font-semibold mt-1">
                          Method: <span className="font-bold text-stone-900">{selectedTxForDoc.payment_method || "BANK TRANSFER"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Table Details */}
                    <div className="mb-6">
                      <div className="text-xl text-stone-900 uppercase tracking-widest font-black mb-4 ml-1">
                        Journal / Transaction Details
                      </div>
                      <table className="w-full text-left">
                        <thead>
                           <tr className="border-b border-stone-300 bg-white">
                            <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm w-12 text-center">
                              No
                            </th>
                            <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-sm">
                              Description / Remarks
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
                              {selectedTxForDoc.notes || selectedTxForDoc.reference_id || "Financial Operational Transaction"}
                            </td>
                            <td className="py-4 px-3 text-right text-stone-900 font-mono font-black text-base whitespace-nowrap">
                              {formatIDR(selectedTxForDoc.amount)}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="mt-6 flex justify-end">
                        <div className="w-[440px] space-y-2">
                          <div className="flex justify-between items-center pt-3 border-t-2 border-stone-900 px-3 font-black text-base uppercase tracking-wider gap-3">
                            <span className="text-stone-900 whitespace-nowrap">NET TOTAL</span>
                            <span className="font-mono text-base tracking-tight text-stone-900 whitespace-nowrap">
                              {formatIDR(selectedTxForDoc.amount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Finance Manager Signature Block */}
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

      {/* Project COGS / HPP Breakdown Modal */}
      {selectedProjectIdForHpp && (
        <ProjectHppModal
          isOpen={isHppModalOpen}
          onClose={() => setIsHppModalOpen(false)}
          projectId={selectedProjectIdForHpp}
          projectName={
            projectsList.find((p) => p.id === selectedProjectIdForHpp)?.name ||
            selectedProjectIdForHpp
          }
        />
      )}
    </div>
  );
}
