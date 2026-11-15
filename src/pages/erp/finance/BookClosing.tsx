import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ShieldCheck,
  CalendarClock,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Upload,
  FileText,
  ExternalLink,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  Scale,
  Users,
  ArrowRight,
  Paperclip,
  Send,
  ShieldAlert,
  Search,
  BookOpen,
  ClipboardCheck,
  FileCheck2,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { generatePDF } from "@/lib/pdfGenerator";
import { uploadUniversalFile } from "@/lib/cloudStorage";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { canAccessErpRoute } from "@/utils/pbac";
import { formatIDR, cn } from "@/lib/utils";

interface FormFieldDef {
  key: string;
  label: string;
  type: "currency" | "number" | "text" | "textarea" | "boolean";
  required?: boolean;
  placeholder?: string;
}

interface ClosingItem {
  id: string;
  period_key: string;
  item_code: string;
  category: string;
  title: string;
  description: string;
  assigned_role: string;
  requirement_type: "AUTO_GATE" | "UPLOAD_AND_FORM" | "FORM_ONLY";
  is_required: boolean;
  due_day: number;
  status: "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";
  form_schema: FormFieldDef[];
  payload: Record<string, any>;
  attachment_urls: string[];
  system_diagnostic: Record<string, any>;
  submitted_by?: string | null;
  submitted_at?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
}

interface ClosingWorkspaceState {
  period: {
    id: string;
    period_key: string;
    period_name: string;
    start_date: string;
    end_date: string;
    status: "OPEN" | "SOFT_LOCKED" | "HARD_CLOSED";
    locked_by?: string;
    locked_at?: string;
    closed_by?: string;
    closed_at?: string;
    reopened_by?: string;
    reopened_at?: string;
    reopen_reason?: string;
    reopen_count?: number;
    notes?: string;
  };
  window_status: {
    is_open: boolean;
    current_day: number;
    current_date: string;
    current_period_key: string;
    default_closing_period_key?: string;
    days_remaining: number;
    days_until_open: number;
    next_window_label: string;
    message: string;
  };
  checklist_summary: {
    total_items: number;
    required_total: number;
    required_verified: number;
    required_pending: number;
    completion_pct: number;
    all_required_satisfied: boolean;
    pending_titles: string[];
  };
  items: ClosingItem[];
  hris_prq_summary: {
    period_key: string;
    prq_id: string | null;
    requisition_number: string | null;
    prq_status: string;
    submitted_by: string | null;
    submitted_at: string | null;
    headcount: number;
    total_gross: number;
    total_deductions: number;
    total_net: number;
    direct_labor_cost: number;
    opex_salary_cost: number;
    payroll_id: string | null;
    voucher_number: string | null;
    payroll_status: string;
    payroll_paid_at: string | null;
    payslips_total: number;
    payslips_paid: number;
    journal_entries: Array<{
      id: string;
      entry_number: string;
      entry_date: string;
      total_debit: number;
      total_credit: number;
      status: string;
    }>;
    is_reconciled: boolean;
    blockers: string[];
  };
  cutoff_metrics: {
    uninvoiced_dn_count: number;
    unjournaled_tx_count: number;
    unposted_grn_count: number;
    grni_2105_balance: number;
    period_journal_count: number;
  };
  financial_preview: {
    period_key: string;
    period_name: string;
    period_name_id: string;
    start_date: string;
    end_date: string;
    pnl: {
      revenue: number;
      cogs_material: number;
      cogs_labor: number;
      other_direct_cost: number;
      total_cogs: number;
      gross_profit: number;
      gross_margin_pct: number;
      opex_salaries: number;
      opex_general: number;
      opex_logistics: number;
      other_opex: number;
      total_opex: number;
      net_profit: number;
      net_margin_pct: number;
    };
    balance_sheet: {
      total_assets: number;
      total_liabilities: number;
      total_equity_before_current_pnl: number;
      current_period_net_profit: number;
      cash_bank_1101: number;
      accounts_receivable_1102: number;
      inventory_total: number;
      accounts_payable_2101: number;
      grni_accrual_2105: number;
    };
    tax_bank_summary: {
      gl_cash_bank_1101: number;
      cash_in_period: number;
      cash_out_period: number;
      net_cash_flow_period: number;
      cash_tx_count: number;
      vat_output_2102: number;
      vat_input_1106: number;
      net_vat_payable: number;
      bpjs_payable_2103: number;
      pph_payable_2104: number;
    };
    trial_balance: Array<{
      code: string;
      name: string;
      category: string;
      normal_balance: string;
      period_debit: number;
      period_credit: number;
      balance_debit: number;
      balance_credit: number;
    }>;
    trial_balance_summary: {
      period_debit: number;
      period_credit: number;
      closing_debit: number;
      closing_credit: number;
      is_balanced: boolean;
    };
  };
  snapshots: Array<{
    id: string;
    period_key: string;
    version: number;
    status: string;
    sealed_by: string;
    sealed_at: string;
    notes?: string;
  }>;
  gates: {
    can_submit_items: boolean;
    can_soft_lock: boolean;
    can_hard_close: boolean;
    can_generate_report: boolean;
    blocking_reasons: string[];
  };
}

const AUTO_GATE_ROUTE_MAP: Record<string, { label: string; to: string }> = {
  GATE_HRIS_ATTENDANCE_OVERTIME: { label: "HR Portal", to: "/hr" },
  GATE_PRQ_DISBURSEMENT_GL: { label: "Payroll", to: "/payroll" },
  GATE_AR_AP_CUTOFF: { label: "Deliveries & AR", to: "/deliveries" },
  GATE_INVENTORY_GRNI: { label: "Warehouse", to: "/warehouse" },
  GATE_TRIAL_BALANCE: { label: "General Ledger", to: "/gl" },
};

function getJakartaYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const now = new Date();
  return {
    year: Number(parts.find((p) => p.type === "year")?.value || now.getFullYear()),
    month: Number(parts.find((p) => p.type === "month")?.value || now.getMonth() + 1),
  };
}

function getRecentPeriodOptions(): Array<{ value: string; label: string }> {
  const { year, month } = getJakartaYearMonth();
  const list: Array<{ value: string; label: string }> = [];
  const formatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  for (let offset = -6; offset <= 1; offset++) {
    const d = new Date(year, month - 1 + offset, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    list.push({ value: val, label: `${formatter.format(d)} (${val})` });
  }
  return list;
}

function getDefaultPeriodKey(): string {
  const { year, month } = getJakartaYearMonth();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

export default function BookClosing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const initialPeriod = searchParams.get("period") || getDefaultPeriodKey();
  const [periodKey, setPeriodKey] = useState(initialPeriod);
  const [activeTab, setActiveTab] = useState<
    "CHECKLIST" | "HRIS_PRQ" | "REPORT" | "GOVERNANCE"
  >("CHECKLIST");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTION_NEEDED" | "SUBMITTED" | "VERIFIED"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  const [workspace, setWorkspace] = useState<ClosingWorkspaceState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [editingItem, setEditingItem] = useState<ClosingItem | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);

  const [rejectingItem, setRejectingItem] = useState<ClosingItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [customRole, setCustomRole] = useState("FINANCE");
  const [customType, setCustomType] = useState<"UPLOAD_AND_FORM" | "FORM_ONLY">("UPLOAD_AND_FORM");
  const [customDueDay, setCustomDueDay] = useState("24");
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);

  const [reportData, setReportData] = useState<any>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const reportPdfRef = useRef<HTMLDivElement>(null);

  const [softLockNotes, setSoftLockNotes] = useState("");
  const [isSoftLocking, setIsSoftLocking] = useState(false);
  const [hardClosePin, setHardClosePin] = useState("");
  const [hardCloseNotes, setHardCloseNotes] = useState("");
  const [isHardClosing, setIsHardClosing] = useState(false);
  const [reopenPin, setReopenPin] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [isReopening, setIsReopening] = useState(false);

  const userRole = String(user?.role || "").trim().toUpperCase();
  const userLevel = String(user?.level || "").trim().toUpperCase();
  const isReopenAuthorized = ["BOD", "FC", "DIRECTOR"].includes(userRole);
  const isVerifierAuthorized =
    ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN", "SUPER_ADMIN", "GOD_MODE"].includes(userRole) ||
    userLevel === "SUPER_ADMIN" ||
    (userRole === "FINANCE" && ["MANAGER", "SUPERVISOR"].includes(userLevel));

  const periodOptions = useMemo(() => {
    const base = getRecentPeriodOptions();
    if (!base.some((o) => o.value === periodKey)) {
      base.unshift({ value: periodKey, label: periodKey });
    }
    return base;
  }, [periodKey]);

  const fetchWorkspace = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(
        `/api/finance/closing/${encodeURIComponent(periodKey)}`,
        {},
        user?.username,
      );
      if (res.ok && res.data?.success) {
        setWorkspace(res.data as ClosingWorkspaceState);
      } else {
        showToast(res.error || "Failed to load book closing workspace", "error");
      }
    } catch {
      showToast("Unable to connect to server", "error");
    } finally {
      setIsLoading(false);
    }
  }, [periodKey, user?.username, showToast]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const fetchOfficialReport = useCallback(async () => {
    setIsLoadingReport(true);
    setReportError(null);
    try {
      const res = await apiFetch(
        `/api/finance/closing/${encodeURIComponent(periodKey)}/report`,
        {},
        user?.username,
      );
      if (res.ok && res.data?.success) {
        setReportData(res.data);
      } else {
        setReportData(null);
        setReportError(res.error || "Monthly report is not yet available.");
      }
    } catch {
      setReportData(null);
      setReportError("Failed to load financial report.");
    } finally {
      setIsLoadingReport(false);
    }
  }, [periodKey, user?.username]);

  useEffect(() => {
    if (activeTab === "REPORT" && workspace) {
      if (workspace.gates.can_generate_report) {
        fetchOfficialReport();
      } else {
        setReportData(null);
        setReportError(
          workspace.gates.blocking_reasons[0] ||
            "All required items and trial balance checks must pass before generating reports.",
        );
      }
    }
  }, [activeTab, workspace, fetchOfficialReport]);

  const handlePeriodChange = (val: string) => {
    setPeriodKey(val);
    setSearchParams({ period: val });
    setReportData(null);
  };

  const openSubmitModal = (item: ClosingItem) => {
    setEditingItem(item);
    const initialVals: Record<string, any> = { ...(item.payload || {}) };
    (item.form_schema || []).forEach((f) => {
      if (initialVals[f.key] === undefined) {
        initialVals[f.key] = f.type === "boolean" ? false : "";
      }
    });
    setFormValues(initialVals);
    setAttachments([...(item.attachment_urls || [])]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingFile(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadUniversalFile(file, `closing/${periodKey}`);
        if (url) uploaded.push(url);
      }
      if (uploaded.length > 0) {
        setAttachments((prev) => [...prev, ...uploaded]);
        showToast(`${uploaded.length} attachment(s) uploaded`, "success");
      }
    } catch {
      showToast("Failed to upload attachment", "error");
    } finally {
      setIsUploadingFile(false);
      e.target.value = "";
    }
  };

  const handleSubmitRequiredItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setIsSubmittingItem(true);
    try {
      const res = await apiFetch(
        `/api/finance/closing/${encodeURIComponent(periodKey)}/items/${encodeURIComponent(editingItem.id)}/submit`,
        {
          method: "PUT",
          body: JSON.stringify({
            payload: formValues,
            attachment_urls: attachments,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast(`Submitted for verification: ${editingItem.title}`, "success");
        setEditingItem(null);
        await fetchWorkspace();
      } else {
        showToast(res.error || "Failed to submit item", "error");
      }
    } finally {
      setIsSubmittingItem(false);
    }
  };

  const handleVerifyItem = async (item: ClosingItem) => {
    setVerifyingId(item.id);
    try {
      const res = await apiFetch(
        `/api/finance/closing/${encodeURIComponent(periodKey)}/items/${encodeURIComponent(item.id)}/verify`,
        {
          method: "PUT",
          body: JSON.stringify({ action: "VERIFY" }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast(`Verified: ${item.title}`, "success");
        await fetchWorkspace();
      } else {
        showToast(res.error || "Verification failed", "error");
      }
    } finally {
      setVerifyingId(null);
    }
  };

  const handleConfirmRejectItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingItem || !rejectReason.trim()) return;
    setVerifyingId(rejectingItem.id);
    try {
      const res = await apiFetch(
        `/api/finance/closing/${encodeURIComponent(periodKey)}/items/${encodeURIComponent(rejectingItem.id)}/verify`,
        {
          method: "PUT",
          body: JSON.stringify({
            action: "REJECT",
            rejection_reason: rejectReason.trim(),
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Item returned for revision", "info");
        setRejectingItem(null);
        setRejectReason("");
        await fetchWorkspace();
      } else {
        showToast(res.error || "Failed to return item", "error");
      }
    } finally {
      setVerifyingId(null);
    }
  };

  const handleAddCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingCustom(true);
    try {
      const res = await apiFetch(
        `/api/finance/closing/${encodeURIComponent(periodKey)}/items`,
        {
          method: "POST",
          body: JSON.stringify({
            title: customTitle,
            description: customDesc,
            assigned_role: customRole,
            requirement_type: customType,
            due_day: Number(customDueDay) || 24,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Custom checklist item added", "success");
        setShowAddCustomModal(false);
        setCustomTitle("");
        setCustomDesc("");
        await fetchWorkspace();
      } else {
        showToast(res.error || "Failed to create item", "error");
      }
    } finally {
      setIsCreatingCustom(false);
    }
  };

  const handleDeleteCustomItem = async (item: ClosingItem) => {
    const res = await apiFetch(
      `/api/finance/closing/${encodeURIComponent(periodKey)}/items/${encodeURIComponent(item.id)}`,
      { method: "DELETE" },
      user?.username,
    );
    if (res.ok) {
      showToast("Custom item removed", "info");
      await fetchWorkspace();
    } else {
      showToast(res.error || "Failed to delete item", "error");
    }
  };

  const handleSoftLock = async () => {
    setIsSoftLocking(true);
    try {
      const res = await apiFetch(
        `/api/finance/closing/${encodeURIComponent(periodKey)}/soft-lock`,
        {
          method: "POST",
          body: JSON.stringify({ notes: softLockNotes }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast(`Period ${periodKey} soft-locked`, "success");
        setSoftLockNotes("");
        await fetchWorkspace();
      } else {
        showToast(res.error || "Failed to soft-lock period", "error");
      }
    } finally {
      setIsSoftLocking(false);
    }
  };

  const handleHardClose = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsHardClosing(true);
    try {
      const res = await apiFetch(
        `/api/finance/closing/${encodeURIComponent(periodKey)}/hard-close`,
        {
          method: "POST",
          body: JSON.stringify({ pin: hardClosePin, notes: hardCloseNotes }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast(`Period ${periodKey} sealed (HARD_CLOSED) and archived`, "success");
        setHardClosePin("");
        setHardCloseNotes("");
        await fetchWorkspace();
      } else {
        showToast(res.error || "Hard close rejected", "error");
      }
    } finally {
      setIsHardClosing(false);
    }
  };

  const handleReopenPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsReopening(true);
    try {
      const res = await apiFetch(
        `/api/finance/closing/${encodeURIComponent(periodKey)}/reopen`,
        {
          method: "POST",
          body: JSON.stringify({ pin: reopenPin, reopen_reason: reopenReason }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast(`Period ${periodKey} reopened to SOFT_LOCKED`, "success");
        setReopenPin("");
        setReopenReason("");
        await fetchWorkspace();
      } else {
        showToast(res.error || "Failed to reopen period", "error");
      }
    } finally {
      setIsReopening(false);
    }
  };

  const handleExportReportPdf = async () => {
    if (!reportPdfRef.current) return;
    setIsExportingPdf(true);
    try {
      await generatePDF(
        reportPdfRef.current,
        `MONTHLY_CLOSING_REPORT_${periodKey}.pdf`,
      );
      showToast("Closing report PDF exported", "success");
    } catch {
      showToast("Failed to export PDF report", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadCsvReport = () => {
    if (!reportData) return;
    const rows: string[] = [];
    rows.push(`MONTHLY BOOK CLOSING REPORT,${periodKey}`);
    rows.push(
      `Status,${reportData.is_sealed_snapshot ? `SEALED SNAPSHOT v${reportData.version}` : "VERIFIED LIVE REPORT"}`,
    );
    rows.push(``);
    rows.push(`INCOME STATEMENT,Amount (IDR)`);
    rows.push(`Revenue,${reportData.pnl?.revenue || 0}`);
    rows.push(`COGS Material (5101),${reportData.pnl?.cogs_material || 0}`);
    rows.push(`COGS Direct Labor (5102),${reportData.pnl?.cogs_labor || 0}`);
    rows.push(`Gross Profit,${reportData.pnl?.gross_profit || 0}`);
    rows.push(`OPEX Salaries (6101),${reportData.pnl?.opex_salaries || 0}`);
    rows.push(`OPEX General (6102),${reportData.pnl?.opex_general || 0}`);
    rows.push(`OPEX Logistics (6103),${reportData.pnl?.opex_logistics || 0}`);
    rows.push(`Net Profit,${reportData.pnl?.net_profit || 0}`);
    rows.push(``);
    rows.push(
      `TRIAL BALANCE,Code,Account Name,Category,Period Debit,Period Credit,Closing Debit,Closing Credit`,
    );
    (reportData.trial_balance || []).forEach((tb: any) => {
      rows.push(
        `TB,${tb.code},"${String(tb.name || "").replace(/"/g, '""')}",${tb.category},${tb.period_debit || 0},${tb.period_credit || 0},${tb.balance_debit || 0},${tb.balance_credit || 0}`,
      );
    });
    rows.push(``);
    rows.push(
      `CHECKLIST MANIFEST,Code,Title,Assigned Role,Type,Status,Submitted By,Verified By`,
    );
    (reportData.checklist_manifest || []).forEach((it: any) => {
      rows.push(
        `ITEM,${it.item_code},"${String(it.title || "").replace(/"/g, '""')}",${it.assigned_role},${it.requirement_type},${it.status},${it.submitted_by || "-"},${it.verified_by || "-"}`,
      );
    });

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Monthly_Closing_${periodKey}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Closing report CSV downloaded", "success");
  };

  const renderStatusBadge = (status: ClosingItem["status"]) => {
    switch (status) {
      case "VERIFIED":
        return (
          <Badge variant="success" size="sm" dot>
            VERIFIED
          </Badge>
        );
      case "SUBMITTED":
        return (
          <Badge variant="info" size="sm" dot>
            IN REVIEW
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge variant="danger" size="sm" dot>
            REVISION
          </Badge>
        );
      default:
        return (
          <Badge variant="warning" size="sm" dot>
            PENDING
          </Badge>
        );
    }
  };

  const renderPeriodBadge = (status?: "OPEN" | "SOFT_LOCKED" | "HARD_CLOSED") => {
    if (status === "HARD_CLOSED") {
      return (
        <Badge variant="success" size="sm" icon={<Lock className="w-3 h-3" />}>
          HARD_CLOSED
        </Badge>
      );
    }
    if (status === "SOFT_LOCKED") {
      return (
        <Badge variant="warning" size="sm" icon={<Lock className="w-3 h-3" />}>
          SOFT_LOCKED
        </Badge>
      );
    }
    return (
      <Badge variant="neutral" size="sm" icon={<Unlock className="w-3 h-3" />}>
        OPEN
      </Badge>
    );
  };

  const autoGateItems = useMemo(
    () => (workspace?.items || []).filter((i) => i.requirement_type === "AUTO_GATE"),
    [workspace?.items],
  );

  const allInteractiveItems = useMemo(
    () => (workspace?.items || []).filter((i) => i.requirement_type !== "AUTO_GATE"),
    [workspace?.items],
  );

  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    allInteractiveItems.forEach((i) => {
      if (i.assigned_role) roles.add(i.assigned_role.toUpperCase());
    });
    return Array.from(roles).sort();
  }, [allInteractiveItems]);

  const interactiveFilterCounts = useMemo(() => {
    return {
      ALL: allInteractiveItems.length,
      ACTION_NEEDED: allInteractiveItems.filter(
        (i) => i.status === "PENDING" || i.status === "REJECTED",
      ).length,
      SUBMITTED: allInteractiveItems.filter((i) => i.status === "SUBMITTED").length,
      VERIFIED: allInteractiveItems.filter((i) => i.status === "VERIFIED").length,
    };
  }, [allInteractiveItems]);

  const interactiveItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allInteractiveItems.filter((item) => {
      if (
        statusFilter === "ACTION_NEEDED" &&
        item.status !== "PENDING" &&
        item.status !== "REJECTED"
      ) {
        return false;
      }
      if (statusFilter === "SUBMITTED" && item.status !== "SUBMITTED") {
        return false;
      }
      if (statusFilter === "VERIFIED" && item.status !== "VERIFIED") {
        return false;
      }
      if (roleFilter !== "ALL" && item.assigned_role.toUpperCase() !== roleFilter) {
        return false;
      }
      if (q) {
        const hay = `${item.title} ${item.description} ${item.item_code} ${item.assigned_role}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allInteractiveItems, statusFilter, roleFilter, searchQuery]);

  if (isLoading && !workspace) {
    return (
      <div className="space-y-6 pb-20">
        <PageHeader
          title="Monthly Book Closing"
          subtitle="Period closing & financial audit"
          icon={<Lock className="w-5 h-5" />}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <StatCard key={idx} title="Loading" value="-" isLoading />
          ))}
        </div>
        <div className="bg-white border border-stone-200/80 rounded-2xl p-12 flex flex-col items-center justify-center space-y-3 shadow-2xs">
          <div className="w-7 h-7 border-2 border-stone-200 border-t-stone-800 rounded-full animate-spin" />
          <p className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
            Loading {periodKey} Workspace...
          </p>
        </div>
      </div>
    );
  }

  const ws = workspace;
  const win = ws?.window_status;
  const period = ws?.period;
  const prq = ws?.hris_prq_summary;
  const tbSummary = ws?.financial_preview?.trial_balance_summary;
  const isHardClosed = period?.status === "HARD_CLOSED";
  const autoGatePassedCount = autoGateItems.filter((i) => i.status === "VERIFIED").length;

  return (
    <div className="space-y-5 sm:space-y-6 pb-20">
      <PageHeader
        title="Monthly Book Closing"
        subtitle="Period closing & financial audit"
        icon={<Lock className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={periodKey}
              onChange={(e) => handlePeriodChange(e.target.value)}
              aria-label="Select Accounting Period"
              wrapperClassName="w-48 sm:w-52"
              leftIcon={<CalendarClock className="w-3.5 h-3.5" />}
              className="h-8 text-[11px] font-mono font-semibold"
              options={periodOptions}
            />

            {canAccessErpRoute(user, "/general-ledger") && (
              <Link
                to="/general-ledger"
                className="h-8 px-3 inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border border-stone-200/90 hover:border-stone-300 text-stone-700 hover:text-stone-900 rounded-xl text-[11px] font-bold tracking-wide transition-colors whitespace-nowrap shadow-2xs"
              >
                <BookOpen className="w-3.5 h-3.5 text-stone-500" />
                <span>General Ledger</span>
              </Link>
            )}

            <Button
              variant="secondary"
              size="icon-sm"
              onClick={fetchWorkspace}
              disabled={isLoading}
              title="Refresh workspace"
              aria-label="Refresh workspace"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {/* COMPACT WINDOW & READINESS BAR */}
      {ws && win && (
        <div className="bg-white border border-stone-200/80 rounded-2xl px-4 py-3.5 shadow-2xs space-y-2.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "w-8 h-8 rounded-xl border flex items-center justify-center shrink-0",
                  isHardClosed
                    ? "bg-emerald-50 border-emerald-200/80 text-emerald-700"
                    : win.is_open
                      ? "bg-amber-50 border-amber-200/80 text-amber-700"
                      : "bg-stone-100 border-stone-200/80 text-stone-600",
                )}
              >
                {isHardClosed ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : win.is_open ? (
                  <CalendarClock className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-stone-900 truncate">
                    {isHardClosed ? `Period Sealed · ${period?.period_name || periodKey}` : win.message}
                  </span>
                  <span className="text-[11px] font-mono text-stone-400">
                    Window: 15–24 Monthly (WIB)
                    {periodKey === (win.default_closing_period_key || getDefaultPeriodKey())
                      ? " · Target: M-1"
                      : ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0 border-t lg:border-t-0 pt-2 lg:pt-0 border-stone-100">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Journals
                </span>
                <span className="text-xs font-mono font-bold text-stone-800 tabular-nums">
                  {ws.cutoff_metrics?.period_journal_count || 0}
                </span>
              </div>
              <div className="h-4 w-px bg-stone-200 hidden sm:block" />
              {renderPeriodBadge(period?.status)}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  ws.checklist_summary.all_required_satisfied
                    ? "bg-emerald-600"
                    : "bg-amber-500",
                )}
                style={{ width: `${ws.checklist_summary.completion_pct}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-bold text-stone-600 tabular-nums whitespace-nowrap">
              {ws.checklist_summary.completion_pct}% Ready
            </span>
          </div>
        </div>
      )}

      {/* 4 KPI STAT CARDS */}
      {ws && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          <StatCard
            title="Required Items"
            value={`${ws.checklist_summary.required_verified} / ${ws.checklist_summary.required_total}`}
            subtitle={`${ws.checklist_summary.completion_pct}% verified · ${ws.checklist_summary.required_pending} pending`}
            variant={ws.checklist_summary.all_required_satisfied ? "success" : "warning"}
            icon={ClipboardCheck}
          />

          <StatCard
            title="Payroll Bridge"
            value={formatIDR(prq?.total_net || 0)}
            subtitle={`PRq ${prq?.prq_status || "NONE"} · PDV ${prq?.payroll_status || "NONE"}`}
            variant={prq?.is_reconciled ? "success" : "warning"}
            icon={Users}
          />

          <StatCard
            title={`Trial Balance (${periodKey})`}
            value={formatIDR(tbSummary?.period_debit || 0)}
            subtitle={tbSummary?.is_balanced ? "Balanced" : "Variance detected"}
            variant={tbSummary?.is_balanced ? "info" : "danger"}
            icon={Scale}
          />

          <StatCard
            title="Closing Window"
            value={`Day ${win?.current_day || "-"}`}
            subtitle={
              win?.is_open
                ? `${win.days_remaining}d left (15–24)`
                : `Next: ${win?.next_window_label || "-"}`
            }
            variant={win?.is_open ? "warning" : "default"}
            icon={CalendarClock}
          />
        </div>
      )}

      {/* TAB NAVIGATION */}
      <div className="flex overflow-x-auto border-b border-stone-200 gap-6 text-xs sm:text-sm font-medium scrollbar-hide">
        {[
          {
            id: "CHECKLIST",
            label: "Checklist",
            icon: FileCheck2,
            chip: ws
              ? `${ws.checklist_summary.required_verified}/${ws.checklist_summary.required_total}`
              : undefined,
          },
          {
            id: "HRIS_PRQ",
            label: "Payroll Bridge",
            icon: Users,
            chip: prq ? (prq.is_reconciled ? "SYNC" : "PENDING") : undefined,
          },
          {
            id: "REPORT",
            label: "Financial Reports",
            icon: Scale,
          },
          {
            id: "GOVERNANCE",
            label: "Period Governance",
            icon: Lock,
            chip: ws ? String(ws.snapshots.length) : undefined,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "pb-3 border-b-2 inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer",
                active
                  ? "border-stone-900 text-stone-900 font-semibold"
                  : "border-transparent text-stone-500 hover:text-stone-800",
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.chip !== undefined && (
                <span className="px-1.5 py-0.5 rounded text-[11px] bg-stone-100 text-stone-600 font-mono tabular-nums">
                  {tab.chip}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: CHECKLIST */}
      {activeTab === "CHECKLIST" && ws && (
        <div className="space-y-6">
          {/* SYSTEM CONTROL GATES */}
          <section className="bg-white border border-stone-200/80 rounded-2xl shadow-2xs overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-stone-200/80 flex items-center justify-between gap-2 bg-stone-50/40">
              <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                System Control Gates
              </h3>
              <Badge
                variant={autoGatePassedCount === autoGateItems.length ? "success" : "warning"}
                size="sm"
                dot
              >
                {autoGatePassedCount}/{autoGateItems.length} Passed
              </Badge>
            </div>

            <Table unbordered>
              <TableHeader>
                <TableRow>
                  <TableHead>Control</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Diagnostic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {autoGateItems.map((gate) => {
                  const linkInfo = AUTO_GATE_ROUTE_MAP[gate.item_code];
                  return (
                    <TableRow key={gate.id}>
                      <TableCell className="max-w-xs">
                        <div className="font-semibold text-stone-900 text-xs">
                          {gate.title}
                        </div>
                        <div className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                          {gate.description}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-[11px] font-mono font-semibold text-stone-600 uppercase">
                          {gate.assigned_role}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-stone-700 max-w-md">
                        {gate.system_diagnostic?.summary || "-"}
                      </TableCell>
                      <TableCell>{renderStatusBadge(gate.status)}</TableCell>
                      <TableCell className="text-right">
                        {linkInfo && (
                          <Link
                            to={linkInfo.to}
                            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-white border border-stone-200/90 hover:bg-stone-50 hover:border-stone-300 text-[11px] font-semibold text-stone-700 hover:text-stone-900 transition-colors whitespace-nowrap shadow-2xs"
                          >
                            <span>{linkInfo.label}</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>

          {/* CLOSING CHECKLIST WORKLIST */}
          <section className="space-y-3.5">
            <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                    Closing Checklist
                  </h3>
                  <span className="text-[11px] font-mono text-stone-500 tabular-nums">
                    {interactiveFilterCounts.VERIFIED}/{interactiveFilterCounts.ALL} Verified
                  </span>
                </div>

                {isVerifierAuthorized && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!ws.gates.can_submit_items}
                    onClick={() => setShowAddCustomModal(true)}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add Item
                  </Button>
                )}
              </div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2.5 border-t border-stone-100">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
                  <div className="w-full sm:max-w-xs">
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search items..."
                      leftIcon={<Search className="w-3.5 h-3.5" />}
                    />
                  </div>
                  <div className="w-full sm:w-40">
                    <Select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      aria-label="Filter by role"
                    >
                      <option value="ALL">All Roles</option>
                      {availableRoles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="inline-flex items-center p-1 bg-stone-100 rounded-xl text-[11px] overflow-x-auto scrollbar-hide">
                  {[
                    { id: "ALL", label: "All", count: interactiveFilterCounts.ALL },
                    {
                      id: "ACTION_NEEDED",
                      label: "Pending",
                      count: interactiveFilterCounts.ACTION_NEEDED,
                    },
                    {
                      id: "SUBMITTED",
                      label: "In Review",
                      count: interactiveFilterCounts.SUBMITTED,
                    },
                    {
                      id: "VERIFIED",
                      label: "Verified",
                      count: interactiveFilterCounts.VERIFIED,
                    },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStatusFilter(f.id as any)}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5",
                        statusFilter === f.id
                          ? "bg-white text-stone-900 shadow-2xs"
                          : "text-stone-600 hover:text-stone-900",
                      )}
                    >
                      <span>{f.label}</span>
                      <span className="font-mono text-[10px] opacity-75 tabular-nums">
                        {f.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Checklist Item</TableHead>
                  <TableHead>Role &amp; Due</TableHead>
                  <TableHead>Submission &amp; Evidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interactiveItems.length === 0 ? (
                  <TableEmpty
                    colSpan={5}
                    icon={<FileText />}
                    message="No checklist items match the current filters."
                  />
                ) : (
                  interactiveItems.map((item) => {
                    const isCustom = item.item_code.startsWith("REQ_CUSTOM_");
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="max-w-xs">
                          <div className="font-semibold text-stone-900 text-xs">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                            {item.description}
                          </div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-400 mt-1">
                            {item.requirement_type === "UPLOAD_AND_FORM"
                              ? "Upload & Form"
                              : "Form Only"}
                            {isCustom ? " · Custom" : ""}
                          </div>
                          {item.rejection_reason && (
                            <div className="mt-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200/80 text-[11px] text-rose-700 font-medium">
                              Revision note: {item.rejection_reason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-[11px] font-mono font-semibold text-stone-700 uppercase">
                            {item.assigned_role}
                          </div>
                          <div className="text-[11px] font-mono text-stone-400 mt-0.5 tabular-nums">
                            Due Day {item.due_day}
                          </div>
                        </TableCell>
                        <TableCell className="space-y-1.5 max-w-sm">
                          {Object.keys(item.payload || {}).length === 0 ? (
                            <span className="text-xs text-stone-400">No data submitted</span>
                          ) : (
                            <div className="space-y-0.5 text-[11px] text-stone-700">
                              {Object.entries(item.payload).map(([k, v]) => {
                                const fieldDef = item.form_schema.find((f) => f.key === k);
                                const label = fieldDef?.label || k;
                                const displayVal =
                                  fieldDef?.type === "currency" && !isNaN(Number(v))
                                    ? formatIDR(Number(v))
                                    : typeof v === "boolean"
                                      ? v
                                        ? "Yes"
                                        : "No"
                                      : String(v || "-");
                                return (
                                  <div key={k} className="truncate max-w-xs">
                                    <span className="text-stone-500">{label}: </span>
                                    <span className="font-mono font-semibold text-stone-900 tabular-nums">
                                      {displayVal}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {item.attachment_urls.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {item.attachment_urls.map((url, idx) => (
                                <a
                                  key={`${url}-${idx}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200/80 text-[11px] font-medium text-stone-700 hover:text-stone-900 hover:bg-stone-200/60 transition-colors"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  <span>File #{idx + 1}</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ))}
                            </div>
                          )}

                          {item.submitted_by && (
                            <div className="text-[10px] text-stone-400 font-mono">
                              By @{item.submitted_by}
                              {item.verified_by ? ` · Verified @${item.verified_by}` : ""}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{renderStatusBadge(item.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <Button
                              size="xs"
                              variant={item.status === "VERIFIED" ? "secondary" : "primary"}
                              disabled={!ws.gates.can_submit_items}
                              onClick={() => openSubmitModal(item)}
                              leftIcon={<Upload className="w-3 h-3" />}
                            >
                              {item.status === "PENDING" ? "Submit" : "Update"}
                            </Button>

                            {isVerifierAuthorized &&
                              item.status === "SUBMITTED" &&
                              ws.gates.can_submit_items && (
                                <>
                                  <Button
                                    size="xs"
                                    variant="success"
                                    isLoading={verifyingId === item.id}
                                    onClick={() => handleVerifyItem(item)}
                                    leftIcon={<CheckCircle2 className="w-3 h-3" />}
                                  >
                                    Verify
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="danger_soft"
                                    onClick={() => {
                                      setRejectingItem(item);
                                      setRejectReason("");
                                    }}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}

                            {isVerifierAuthorized &&
                              isCustom &&
                              ws.gates.can_submit_items && (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => handleDeleteCustomItem(item)}
                                  title="Delete custom item"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
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
          </section>
        </div>
      )}

      {/* TAB 2: PAYROLL BRIDGE */}
      {activeTab === "HRIS_PRQ" && ws && prq && (
        <div className="space-y-5">
          <div className="bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                  Payroll &amp; GL Reconciliation ({periodKey})
                </h3>
                <Badge variant={prq.is_reconciled ? "success" : "warning"} size="sm" dot>
                  {prq.is_reconciled ? "RECONCILED" : "ACTION NEEDED"}
                </Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canAccessErpRoute(user, "/hr") && (
                  <Link
                    to="/hr"
                    className="h-8 px-3 inline-flex items-center gap-1.5 text-[11px] font-bold border border-stone-200/90 bg-white hover:bg-stone-50 hover:border-stone-300 rounded-xl text-stone-700 hover:text-stone-900 transition-colors whitespace-nowrap shadow-2xs"
                  >
                    <span>HR Portal</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
                {canAccessErpRoute(user, "/payroll") && (
                  <Link
                    to="/payroll"
                    className="h-8 px-3 inline-flex items-center gap-1.5 text-[11px] font-bold bg-stone-900 hover:bg-stone-800 text-white border border-stone-900 rounded-xl transition-colors whitespace-nowrap shadow-2xs"
                  >
                    <span>Finance Payroll</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="p-3.5 bg-stone-50/80 border border-stone-200/80 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    1. Requisition (PRq)
                  </span>
                  <Badge
                    variant={prq.prq_status === "CONVERTED" || prq.prq_status === "PAID" ? "success" : "neutral"}
                    size="sm"
                  >
                    {prq.prq_status}
                  </Badge>
                </div>
                <div className="text-sm font-mono font-bold text-stone-900 tabular-nums">
                  {prq.requisition_number || "Not Created"}
                </div>
                <div className="text-[11px] text-stone-500 tabular-nums">
                  {prq.headcount} Employees
                </div>
              </div>

              <div className="p-3.5 bg-stone-50/80 border border-stone-200/80 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    2. Disbursement (PDV)
                  </span>
                  <Badge variant={prq.payroll_status === "PAID" ? "success" : "warning"} size="sm">
                    {prq.payroll_status}
                  </Badge>
                </div>
                <div className="text-sm font-mono font-bold text-stone-900 tabular-nums">
                  {prq.voucher_number || "Not Issued"}
                </div>
                <div className="text-[11px] text-stone-500">
                  {prq.payroll_paid_at
                    ? `Paid ${new Date(prq.payroll_paid_at).toLocaleDateString("en-US")}`
                    : "Awaiting disbursement"}
                </div>
              </div>

              <div className="p-3.5 bg-stone-50/80 border border-stone-200/80 rounded-xl space-y-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  3. Payslips
                </span>
                <div className="text-sm font-mono font-bold text-stone-900 tabular-nums">
                  {prq.payslips_paid} / {prq.payslips_total} Paid
                </div>
                <div className="text-[11px] text-stone-500">Auto-synced on disbursement</div>
              </div>

              <div className="p-3.5 bg-stone-50/80 border border-stone-200/80 rounded-xl space-y-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  4. GL Journals
                </span>
                <div className="text-sm font-mono font-bold text-stone-900 tabular-nums">
                  {prq.journal_entries.length} Posted
                </div>
                <div className="text-[11px] font-mono text-stone-500">
                  5102 / 6101 / 2103 / 2104 / 1101
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-3 border-t border-stone-100 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  Gross Payroll
                </span>
                <span className="font-mono font-bold text-stone-900 tabular-nums text-sm">
                  {formatIDR(prq.total_gross)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  Deductions
                </span>
                <span className="font-mono font-bold text-rose-700 tabular-nums text-sm">
                  {formatIDR(prq.total_deductions)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  Net Paid
                </span>
                <span className="font-mono font-bold text-emerald-700 tabular-nums text-sm">
                  {formatIDR(prq.total_net)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  Direct Labor (5102)
                </span>
                <span className="font-mono font-bold text-stone-900 tabular-nums text-sm">
                  {formatIDR(prq.direct_labor_cost)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  OPEX Salary (6101)
                </span>
                <span className="font-mono font-bold text-stone-900 tabular-nums text-sm">
                  {formatIDR(prq.opex_salary_cost)}
                </span>
              </div>
            </div>

            {prq.blockers.length > 0 && (
              <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-1.5 text-xs">
                <div className="font-bold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Open Exceptions</span>
                </div>
                <ul className="list-disc list-inside text-stone-700 space-y-0.5">
                  {prq.blockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {prq.journal_entries.length > 0 && (
              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Payroll Journal Entries ({prq.journal_entries.length})
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entry No.</TableHead>
                      <TableHead>Posting Date</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prq.journal_entries.map((je) => (
                      <TableRow key={je.id}>
                        <TableCell className="font-mono font-semibold text-stone-900 text-xs">
                          {je.entry_number}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-stone-600 tabular-nums">
                          {je.entry_date?.slice(0, 10)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">
                          {formatIDR(je.total_debit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">
                          {formatIDR(je.total_credit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="success" size="sm">
                            {je.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: FINANCIAL REPORTS */}
      {activeTab === "REPORT" && ws && (
        <div className="space-y-5">
          {!ws.gates.can_generate_report || reportError ? (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                      Financial Reports Locked
                    </h3>
                    <Badge variant="danger" size="sm">
                      Requirements Pending
                    </Badge>
                  </div>
                  <p className="text-xs text-stone-600">
                    {reportError ||
                      "Complete all checklist verifications and balance the Trial Balance within the 15–24 closing window."}
                  </p>
                </div>
              </div>

              {ws.gates.blocking_reasons.length > 0 && (
                <div className="bg-stone-50/80 border border-stone-200/80 rounded-xl p-4 space-y-2 text-xs">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                    Blocking Conditions
                  </div>
                  <ul className="list-disc list-inside text-stone-700 space-y-1">
                    {ws.gates.blocking_reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  {ws.checklist_summary.pending_titles.length > 0 && (
                    <div className="pt-2 border-t border-stone-200/80 text-[11px] text-stone-600">
                      <span className="font-semibold text-stone-800">Unverified: </span>
                      {ws.checklist_summary.pending_titles.join(" · ")}
                    </div>
                  )}
                </div>
              )}

              <div>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("CHECKLIST")}
                  leftIcon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Open Checklist
                </Button>
              </div>
            </div>
          ) : isLoadingReport || !reportData ? (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-12 flex flex-col items-center justify-center space-y-3 shadow-2xs">
              <div className="w-7 h-7 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Compiling Financial Statements...
              </span>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Report Action Header */}
              <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-stone-900">
                        {reportData.is_sealed_snapshot
                          ? `Sealed Report (${reportData.snapshot_id})`
                          : `Closing Financial Statements (${periodKey})`}
                      </span>
                      {reportData.is_sealed_snapshot ? (
                        <Badge variant="success" size="sm" dot>
                          Snapshot v{reportData.version}
                        </Badge>
                      ) : (
                        <Badge variant="info" size="sm" dot>
                          Verified Live
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-stone-500">
                      {reportData.is_sealed_snapshot
                        ? `Sealed by @${reportData.sealed_by} on ${new Date(reportData.sealed_at).toLocaleString("en-US")}`
                        : "100% checklist verified & trial balance reconciled."}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleDownloadCsvReport}
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                  >
                    Download CSV
                  </Button>
                  <Button
                    size="sm"
                    isLoading={isExportingPdf}
                    onClick={handleExportReportPdf}
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                  >
                    Export PDF
                  </Button>
                </div>
              </div>

              {/* Financial Statements Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
                <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                    <h4 className="text-xs sm:text-sm font-bold text-stone-900">
                      Income Statement ({periodKey})
                    </h4>
                    <span className="text-[11px] font-mono text-stone-400">IDR</span>
                  </div>
                  <div className="divide-y divide-stone-100 text-xs">
                    {[
                      { label: "Sales Revenue", val: reportData.pnl?.revenue, highlight: "subtotal" },
                      { label: "COGS · Raw Materials (5101)", val: -(reportData.pnl?.cogs_material || 0) },
                      { label: "COGS · Direct Labor (5102)", val: -(reportData.pnl?.cogs_labor || 0) },
                      { label: "Gross Profit", val: reportData.pnl?.gross_profit, highlight: "subtotal" },
                      { label: "OPEX · Staff Salaries (6101)", val: -(reportData.pnl?.opex_salaries || 0) },
                      { label: "OPEX · General & Admin (6102)", val: -(reportData.pnl?.opex_general || 0) },
                      { label: "OPEX · Logistics & Freight (6103)", val: -(reportData.pnl?.opex_logistics || 0) },
                      { label: "Net Profit", val: reportData.pnl?.net_profit, highlight: "net" },
                    ].map((row, i) => {
                      const numVal = Number(row.val || 0);
                      return (
                        <div
                          key={i}
                          className={cn(
                            "flex justify-between items-center py-2",
                            row.highlight === "net" &&
                              "bg-stone-50/90 px-3 -mx-1 rounded-xl border-t border-stone-200/80 font-bold text-stone-900 mt-1",
                            row.highlight === "subtotal" && "font-bold text-stone-900",
                          )}
                        >
                          <span className={row.highlight ? "text-stone-900" : "text-stone-600"}>
                            {row.label}
                          </span>
                          <span
                            className={cn(
                              "font-mono tabular-nums",
                              row.highlight === "net"
                                ? numVal >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-700"
                                : numVal < 0
                                  ? "text-rose-700"
                                  : "text-stone-900",
                            )}
                          >
                            {formatIDR(numVal)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                    <h4 className="text-xs sm:text-sm font-bold text-stone-900">
                      Balance Sheet &amp; Tax Position
                    </h4>
                    <span className="text-[11px] font-mono text-stone-400">Closing</span>
                  </div>
                  <div className="divide-y divide-stone-100 text-xs">
                    {[
                      { label: "Cash & Bank (1101)", val: reportData.balance_sheet?.cash_bank_1101 },
                      { label: "Accounts Receivable (1102)", val: reportData.balance_sheet?.accounts_receivable_1102 },
                      { label: "Inventory (1103–1105)", val: reportData.balance_sheet?.inventory_total },
                      { label: "Accounts Payable (2101)", val: reportData.balance_sheet?.accounts_payable_2101 },
                      { label: "GRNI Accrual (2105)", val: reportData.balance_sheet?.grni_accrual_2105 },
                      { label: "Net VAT Payable (2102 - 1106)", val: reportData.tax_bank_summary?.net_vat_payable },
                      { label: "BPJS Payable (2103)", val: reportData.tax_bank_summary?.bpjs_payable_2103 },
                      { label: "PPh 21 Payable (2104)", val: reportData.tax_bank_summary?.pph_payable_2104 },
                    ].map((row, i) => (
                      <div key={i} className="flex justify-between items-center py-2">
                        <span className="text-stone-600">{row.label}</span>
                        <span className="font-mono tabular-nums font-semibold text-stone-900">
                          {formatIDR(row.val || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Official Trial Balance Table Card */}
              <div className="bg-white border border-stone-200/80 rounded-2xl shadow-2xs overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-2 bg-stone-50/40">
                  <h4 className="text-[11px] font-bold text-stone-900 uppercase tracking-wider">
                    Trial Balance ({periodKey})
                  </h4>
                  <div className="flex items-center gap-2.5">
                    <Badge
                      variant={reportData.trial_balance_summary?.is_balanced ? "success" : "danger"}
                      size="sm"
                      dot
                    >
                      {reportData.trial_balance_summary?.is_balanced ? "Balanced" : "Variance"}
                    </Badge>
                    <span className="text-xs font-mono text-stone-700 font-bold tabular-nums">
                      Turnover: {formatIDR(reportData.trial_balance_summary?.period_debit || 0)}
                    </span>
                  </div>
                </div>
                <Table unbordered>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead className="text-right">Period Debit</TableHead>
                      <TableHead className="text-right">Period Credit</TableHead>
                      <TableHead className="text-right">Closing Debit</TableHead>
                      <TableHead className="text-right">Closing Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData.trial_balance || []).map((tb: any) => (
                      <TableRow key={tb.code}>
                        <TableCell className="font-mono text-xs font-semibold text-stone-900">
                          {tb.code}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-stone-800">
                          {tb.name}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {tb.period_debit > 0 ? formatIDR(tb.period_debit) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {tb.period_credit > 0 ? formatIDR(tb.period_credit) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums font-semibold">
                          {tb.balance_debit > 0 ? formatIDR(tb.balance_debit) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums font-semibold">
                          {tb.balance_credit > 0 ? formatIDR(tb.balance_credit) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow hoverable={false}>
                      <TableCell colSpan={2} className="text-xs font-bold text-stone-900">
                        TRIAL BALANCE TOTAL
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold tabular-nums">
                        {formatIDR(reportData.trial_balance_summary?.period_debit || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold tabular-nums">
                        {formatIDR(reportData.trial_balance_summary?.period_credit || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold tabular-nums">
                        {formatIDR(reportData.trial_balance_summary?.closing_debit || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold tabular-nums">
                        {formatIDR(reportData.trial_balance_summary?.closing_credit || 0)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              {/* Hidden A4 Print Layout for PDF Export */}
              <div className="hidden">
                <PdfPreviewWrapper>
                  <PrintTemplate
                    ref={reportPdfRef}
                    documentTitleId="MONTHLY BOOK CLOSING REPORT"
                    documentTitleEn="MONTHLY BOOK CLOSING REPORT"
                    documentNameId={`Accounting Period ${periodKey}`}
                    documentNameEn={`Accounting Period ${periodKey}`}
                    date={new Date().toLocaleDateString("en-US")}
                    referenceNumber={reportData.snapshot_id || `CLOSE-${periodKey}`}
                    documentId={reportData.snapshot_id || periodKey}
                    isDraft={!reportData.is_sealed_snapshot}
                    signatureStatus={reportData.is_sealed_snapshot ? "signed" : "unsigned"}
                  >
                    <div className="space-y-4 text-xs">
                      <div>
                        <h4 className="font-bold text-sm border-b border-stone-300 pb-1 mb-2">
                          1. Income Statement
                        </h4>
                        <table className="w-full text-left border-collapse">
                          <tbody>
                            <tr>
                              <td className="py-1">Revenue</td>
                              <td className="text-right font-mono">
                                {formatIDR(reportData.pnl?.revenue || 0)}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-1">Total COGS</td>
                              <td className="text-right font-mono">
                                {formatIDR(reportData.pnl?.total_cogs || 0)}
                              </td>
                            </tr>
                            <tr className="font-bold border-t border-stone-200">
                              <td className="py-1">Gross Profit</td>
                              <td className="text-right font-mono">
                                {formatIDR(reportData.pnl?.gross_profit || 0)}
                              </td>
                            </tr>
                            <tr>
                              <td className="py-1">Total OPEX</td>
                              <td className="text-right font-mono">
                                {formatIDR(reportData.pnl?.total_opex || 0)}
                              </td>
                            </tr>
                            <tr className="font-bold border-t border-stone-400">
                              <td className="py-1">Net Profit</td>
                              <td className="text-right font-mono">
                                {formatIDR(reportData.pnl?.net_profit || 0)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div>
                        <h4 className="font-bold text-sm border-b border-stone-300 pb-1 mb-2">
                          2. Closing Checklist Manifest ({(reportData.checklist_manifest || []).length} Items)
                        </h4>
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="border-b border-stone-300">
                              <th className="py-1">Item</th>
                              <th className="py-1">Role</th>
                              <th className="py-1">Status</th>
                              <th className="py-1">Verified By</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(reportData.checklist_manifest || []).map((it: any) => (
                              <tr key={it.id} className="border-b border-stone-100">
                                <td className="py-1">{it.title}</td>
                                <td className="py-1">{it.assigned_role}</td>
                                <td className="py-1 font-bold">{it.status}</td>
                                <td className="py-1">{it.verified_by || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </PrintTemplate>
                </PdfPreviewWrapper>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PERIOD GOVERNANCE */}
      {activeTab === "GOVERNANCE" && ws && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {/* STAGE 1 & 2: SOFT-LOCK & HARD-CLOSE */}
            <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs space-y-5">
              <div className="border-b border-stone-100 pb-3 flex items-center justify-between gap-3">
                <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                  Period Lock &amp; Seal ({periodKey})
                </h3>
                {renderPeriodBadge(period?.status)}
              </div>

              {/* SOFT LOCK */}
              <div className="space-y-3 pb-4 border-b border-stone-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-800">Stage 1 · Soft-Lock</span>
                  <span className="text-[11px] font-mono text-stone-500">
                    {ws.gates.can_soft_lock ? "Available" : "Unavailable"}
                  </span>
                </div>
                <Input
                  label="Soft-Lock Note"
                  value={softLockNotes}
                  onChange={(e) => setSoftLockNotes(e.target.value)}
                  placeholder="Optional operational cut-off note..."
                  disabled={!ws.gates.can_soft_lock}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!ws.gates.can_soft_lock}
                  isLoading={isSoftLocking}
                  onClick={handleSoftLock}
                  leftIcon={<Lock className="w-3.5 h-3.5" />}
                >
                  Soft-Lock Period
                </Button>
              </div>

              {/* HARD CLOSE */}
              <form onSubmit={handleHardClose} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-900">
                    Stage 2 · Hard-Close &amp; Snapshot
                  </span>
                  <span className="text-[11px] font-mono text-stone-500">
                    {ws.gates.can_hard_close ? "Ready" : "Gated"}
                  </span>
                </div>
                {!ws.checklist_summary.all_required_satisfied && !isHardClosed && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200/80 text-xs text-rose-700 font-medium">
                    {ws.checklist_summary.required_pending} required checklist item(s) still pending verification.
                  </div>
                )}
                <Input
                  label="Daily Authorization PIN"
                  type="password"
                  required
                  disabled={!ws.gates.can_hard_close}
                  value={hardClosePin}
                  onChange={(e) => setHardClosePin(e.target.value)}
                  placeholder="Enter daily PIN"
                  className="font-mono"
                />
                <Textarea
                  label="Closing Notes"
                  rows={2}
                  disabled={!ws.gates.can_hard_close}
                  value={hardCloseNotes}
                  onChange={(e) => setHardCloseNotes(e.target.value)}
                  placeholder="Final sign-off notes..."
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!ws.gates.can_hard_close}
                  isLoading={isHardClosing}
                  leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}
                >
                  Seal HARD_CLOSED
                </Button>
              </form>
            </div>

            {/* STAGE 3: BOD / FC REOPEN GOVERNANCE */}
            <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs space-y-5">
              <div className="border-b border-stone-100 pb-3">
                <h3 className="text-xs sm:text-sm font-bold text-stone-900 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Audit Reopen (BOD / FC)</span>
                </h3>
              </div>

              {!isHardClosed ? (
                <div className="p-4 bg-stone-50/80 border border-stone-200/80 rounded-xl text-xs text-stone-600">
                  Period {periodKey} is currently{" "}
                  <strong className="font-mono text-stone-900">{period?.status}</strong>. Reopen controls apply only to HARD_CLOSED periods.
                </div>
              ) : !isReopenAuthorized ? (
                <div className="p-4 bg-rose-50/60 border border-rose-200/80 rounded-xl text-xs text-rose-800 space-y-1">
                  <div className="font-bold">Restricted Role ({userRole || "GUEST"})</div>
                  <p>Only BOD, Director, or Finance Controller (FC) may reopen a sealed period.</p>
                </div>
              ) : (
                <form onSubmit={handleReopenPeriod} className="space-y-3">
                  <Textarea
                    label="Audit Reason (min. 10 characters)"
                    rows={3}
                    required
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Specify external audit or tax adjustment reason..."
                  />
                  <Input
                    label="BOD / FC Authorization PIN"
                    type="password"
                    required
                    value={reopenPin}
                    onChange={(e) => setReopenPin(e.target.value)}
                    placeholder="Enter daily PIN"
                    className="font-mono"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="danger"
                    isLoading={isReopening}
                    leftIcon={<Unlock className="w-3.5 h-3.5" />}
                  >
                    Reopen to SOFT_LOCKED
                  </Button>
                </form>
              )}

              {(period?.reopen_count || 0) > 0 && (
                <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs space-y-1">
                  <div className="font-bold text-amber-900">
                    Reopen History ({period.reopen_count}x)
                  </div>
                  <div className="text-stone-700">
                    Last reopened by{" "}
                    <span className="font-mono font-semibold">@{period.reopened_by}</span>
                    {period.reopened_at
                      ? ` on ${new Date(period.reopened_at).toLocaleString("en-US")}`
                      : ""}
                  </div>
                  {period.reopen_reason && (
                    <div className="text-stone-700">Reason: {period.reopen_reason}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* SEALED SNAPSHOTS TABLE */}
          <div className="bg-white border border-stone-200/80 rounded-2xl shadow-2xs overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-stone-200/80 flex items-center justify-between bg-stone-50/40">
              <h4 className="text-[11px] font-bold text-stone-900 uppercase tracking-wider">
                Sealed Snapshots
              </h4>
              <span className="text-[11px] font-mono text-stone-500">
                {ws.snapshots.length} Version(s)
              </span>
            </div>
            <Table unbordered>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Snapshot ID</TableHead>
                  <TableHead>Sealed By</TableHead>
                  <TableHead>Sealed At</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ws.snapshots.length === 0 ? (
                  <TableEmpty
                    colSpan={5}
                    icon={<Lock />}
                    message="No sealed snapshots archived for this period."
                  />
                ) : (
                  ws.snapshots.map((snap) => (
                    <TableRow key={snap.id}>
                      <TableCell className="font-mono text-xs font-semibold text-stone-700">
                        v{snap.version}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-stone-800">
                        {snap.id}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-stone-700">
                        @{snap.sealed_by}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-stone-600 tabular-nums">
                        {new Date(snap.sealed_at).toLocaleString("en-US")}
                      </TableCell>
                      <TableCell className="text-xs text-stone-600">
                        {snap.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* MODAL: SUBMIT CLOSING ITEM */}
      <Modal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        title={editingItem ? `Submit Item: ${editingItem.title}` : "Submit Item"}
        maxWidth="2xl"
        footer={
          editingItem ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditingItem(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="submit-closing-item-form"
                size="sm"
                isLoading={isSubmittingItem}
                disabled={isUploadingFile}
                leftIcon={<Send className="w-3.5 h-3.5" />}
              >
                Submit for Review
              </Button>
            </div>
          ) : undefined
        }
      >
        {editingItem && (
          <form id="submit-closing-item-form" onSubmit={handleSubmitRequiredItem} className="space-y-4 text-left">
            <p className="text-xs text-stone-600">{editingItem.description}</p>

            {editingItem.item_code === "REQ_BANK_RECONCILIATION" && ws && (
              <div className="p-3.5 bg-stone-50/80 border border-stone-200/80 rounded-xl text-xs space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-stone-500">GL Cash &amp; Bank (1101):</span>
                  <span className="font-mono font-bold text-stone-900 tabular-nums">
                    {formatIDR(ws.financial_preview.tax_bank_summary.gl_cash_bank_1101)}
                  </span>
                </div>
                {formValues.bank_statement_balance !== "" &&
                  !isNaN(Number(formValues.bank_statement_balance)) && (
                    <div className="flex justify-between gap-2 border-t border-stone-200/80 pt-1.5">
                      <span className="text-stone-500">Variance (Statement vs GL):</span>
                      <span
                        className={cn(
                          "font-mono font-bold tabular-nums",
                          Math.abs(
                            Number(formValues.bank_statement_balance) -
                              ws.financial_preview.tax_bank_summary.gl_cash_bank_1101,
                          ) < 1
                            ? "text-emerald-700"
                            : "text-amber-700",
                        )}
                      >
                        {formatIDR(
                          Number(formValues.bank_statement_balance) -
                            ws.financial_preview.tax_bank_summary.gl_cash_bank_1101,
                        )}
                      </span>
                    </div>
                  )}
              </div>
            )}

            {(editingItem.form_schema || []).map((field) => {
              if (field.type === "boolean") {
                return (
                  <label
                    key={field.key}
                    className="flex items-start gap-2.5 p-3 bg-stone-50/80 border border-stone-200/80 rounded-xl cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(formValues[field.key])}
                      onChange={(e) =>
                        setFormValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                    />
                    <span className="font-medium text-stone-800">
                      {field.label} {field.required && <span className="text-rose-600">*</span>}
                    </span>
                  </label>
                );
              }
              if (field.type === "textarea") {
                return (
                  <Textarea
                    key={field.key}
                    label={`${field.label}${field.required ? " *" : ""}`}
                    rows={3}
                    required={field.required}
                    value={formValues[field.key] ?? ""}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={field.placeholder || ""}
                  />
                );
              }
              return (
                <Input
                  key={field.key}
                  label={`${field.label}${field.required ? " *" : ""}`}
                  type={field.type === "currency" || field.type === "number" ? "number" : "text"}
                  step={field.type === "currency" || field.type === "number" ? "any" : undefined}
                  required={field.required}
                  value={formValues[field.key] ?? ""}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder || ""}
                  className={
                    field.type === "currency" || field.type === "number" ? "font-mono" : undefined
                  }
                />
              );
            })}

            {editingItem.requirement_type === "UPLOAD_AND_FORM" && (
              <div className="space-y-2.5 pt-2.5 border-t border-stone-100">
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-600 block">
                  Supporting Evidence (Min. 1 File) *
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-stone-100 hover:bg-stone-200/80 border border-stone-200/80 rounded-xl text-xs font-bold text-stone-800 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingFile ? "Uploading..." : "Select File (PDF / Image)"}</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.csv,.xlsx,.xls"
                      disabled={isUploadingFile}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {attachments.map((url, idx) => (
                      <div
                        key={`${url}-${idx}`}
                        className="flex items-center justify-between px-3 py-2 bg-stone-50/80 border border-stone-200/80 rounded-xl text-xs"
                      >
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-stone-800 hover:underline truncate max-w-sm font-medium"
                        >
                          <Paperclip className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Attachment #{idx + 1}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-rose-600 hover:text-rose-800 text-[11px] font-bold cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </form>
        )}
      </Modal>

      {/* MODAL: REQUEST REVISION */}
      <Modal
        isOpen={!!rejectingItem}
        onClose={() => setRejectingItem(null)}
        title={`Request Revision: ${rejectingItem?.title || ""}`}
        maxWidth="xl"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRejectingItem(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="reject-closing-item-form"
              size="sm"
              variant="danger"
              isLoading={verifyingId === rejectingItem?.id}
            >
              Return Item
            </Button>
          </div>
        }
      >
        <form id="reject-closing-item-form" onSubmit={handleConfirmRejectItem} className="space-y-4">
          <Textarea
            label="Revision Note *"
            rows={3}
            required
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Specify missing documents or amount discrepancy..."
          />
        </form>
      </Modal>

      {/* MODAL: ADD CLOSING ITEM */}
      <Modal
        isOpen={showAddCustomModal}
        onClose={() => setShowAddCustomModal(false)}
        title={`Add Closing Item (${periodKey})`}
        maxWidth="3xl"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowAddCustomModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="add-closing-item-form" size="sm" isLoading={isCreatingCustom}>
              Save Item
            </Button>
          </div>
        }
      >
        <form id="add-closing-item-form" onSubmit={handleAddCustomItem} className="space-y-4">
          <Input
            label="Item Title *"
            required
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="e.g., Petty Cash Count Sign-Off"
          />
          <Textarea
            label="Description"
            rows={2}
            value={customDesc}
            onChange={(e) => setCustomDesc(e.target.value)}
            placeholder="Concise requirement details..."
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Assigned Role"
              value={customRole}
              onChange={(e: any) => setCustomRole(e.target.value)}
            >
              <option value="FINANCE">FINANCE</option>
              <option value="HR">HR</option>
              <option value="WAREHOUSE">WAREHOUSE</option>
            </Select>
            <Select
              label="Type"
              value={customType}
              onChange={(e: any) => setCustomType(e.target.value)}
            >
              <option value="UPLOAD_AND_FORM">Upload &amp; Form</option>
              <option value="FORM_ONLY">Form Only</option>
            </Select>
            <Input
              label="Due Day (15–24)"
              type="number"
              min={15}
              max={24}
              value={customDueDay}
              onChange={(e) => setCustomDueDay(e.target.value)}
              className="font-mono"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
