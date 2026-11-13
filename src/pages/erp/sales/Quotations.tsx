import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useShare } from "@/contexts/ShareContext";
import { apiFetch } from "@/utils/api";
import { getDailyAuthKey } from "@/utils/auth";
import {
  FileText,
  Plus,
  Search,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Filter,
  RefreshCw,
  Briefcase,
  TrendingUp,
  FolderKanban,
  FileSpreadsheet,
  Send,
  ShoppingBag,
  Printer,
  Building2,
  Zap,
  Calculator,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ReviseDocModal } from "@/components/erp/ReviseDocModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { CreateQuotationModal } from "@/components/erp/CreateQuotationModal";
import { QuotationPreviewModal } from "@/components/erp/QuotationPreviewModal";
import { ThermalReceiptModal } from "@/components/erp/ThermalReceiptModal";
import { CreateProjectModal } from "@/components/erp/CreateProjectModal";
import { AtpCtpModal, AtpCtpAnalysis } from "@/components/erp/AtpCtpModal";
import { NtpPreviewModal } from "@/components/erp/NtpPreviewModal";
import { SendEmailModal } from "@/components/erp/SendEmailModal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { StatCard } from "@/components/ui/StatCard";
import { HasRole } from "@/components/shared/HasRole";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/utils";
import { canViewDocFinancials } from "@/utils/rbacFinancials";
import { ConfidentialBadge } from "@/components/shared/ConfidentialBadge";

export default function Quotations() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { openShareModal } = useShare();
  const [searchParams, setSearchParams] = useSearchParams();

  const isCrossDeptViewer = useMemo(() => {
    return (
      !hasGodMode(user) &&
      user?.role !== "SALES" &&
      user?.role !== "FC" &&
      !hasPermission(user, Action.VIEW_QUOTATIONS)
    );
  }, [user]);

  const [activeTab, setActiveTab] = useState<"QUOTATIONS" | "NTP">(() =>
    searchParams.get("tab")?.toUpperCase() === "NTP" || searchParams.get("ntp_id")
      ? "NTP"
      : "QUOTATIONS",
  );

  const [quotations, setQuotations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [ntps, setNtps] = useState<any[]>([]);
  const [isLoadingNtps, setIsLoadingNtps] = useState(false);
  const [ntpSearchQuery, setNtpSearchQuery] = useState("");
  const [ntpStatusFilter, setNtpStatusFilter] = useState<string>("ALL");

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterChannel, setFilterChannel] = useState<string>("ALL");
  const [initialModalSettlement, setInitialModalSettlement] = useState<"IMMEDIATE" | "CREDIT_TERM">("CREDIT_TERM");
  const [selectedReceiptForPrint, setSelectedReceiptForPrint] = useState<any>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<any>(null);
  const [revisingQuotation, setRevisingQuotation] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<any>(null);

  const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [selectedQuoToAuth, setSelectedQuoToAuth] = useState<any>(null);
  const [authPin, setAuthPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [createProjectQuotationId, setCreateProjectQuotationId] = useState("");
  const [createProjectCtpDate, setCreateProjectCtpDate] = useState<string | undefined>(undefined);
  const [createProjectNetMtoQty, setCreateProjectNetMtoQty] = useState<number | undefined>(undefined);
  const [atpCtpQuotationId, setAtpCtpQuotationId] = useState<string | null>(null);
  const [selectedNtpForPreview, setSelectedNtpForPreview] = useState<any>(null);
  
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedDocForEmail, setSelectedDocForEmail] = useState<any>(null);
  const [selectedProjectForNtp, setSelectedProjectForNtp] = useState<any>(null);

  const exportPdfRef = React.useRef<HTMLDivElement>(null);

  const handleDownloadPdf = async () => {
    if (!exportPdfRef.current || !selectedDocForEmail) return;
    try {
      await generatePDF(
        exportPdfRef.current,
        `Quotation_${selectedDocForEmail.quotation_number}.pdf`
      );
      showToast("PDF Downloaded. Please attach it to your message.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to generate PDF", "error");
    }
  };

  const fetchQuotations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/quotations", {}, user?.username);
      if (res.ok) {
        setQuotations(
          Array.isArray(res.data) ? res.data : res.data?.data || [],
        );
      } else {
        showToast("Failed to fetch quotations", "error");
      }
    } catch (err) {
      showToast("Connection error", "error");
    } finally {
      setIsLoading(false);
    }
  }, [user?.username, showToast]);

  const fetchNtps = useCallback(async () => {
    setIsLoadingNtps(true);
    try {
      const res = await apiFetch("/api/ntps", {}, user?.username);
      if (res.ok) {
        setNtps(Array.isArray(res.data) ? res.data : res.data?.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch NTPs", err);
    } finally {
      setIsLoadingNtps(false);
    }
  }, [user?.username]);

  const handleOpenNtpByProjectId = useCallback(
    async (targetId: string) => {
      if (!targetId) return;
      try {
        const res = await apiFetch(
          `/api/ntps/${encodeURIComponent(targetId.trim())}`,
          {},
          user?.username,
        );
        if (res.ok && res.data?.data) {
          setSelectedNtpForPreview(res.data.data.ntp);
          setSelectedProjectForNtp(res.data.data.project);
        } else {
          showToast(
            res.error || `Notice to Proceed not found for ${targetId}`,
            "error",
          );
        }
      } catch (err) {
        showToast("Failed to load Notice to Proceed document", "error");
      }
    },
    [user?.username, showToast],
  );

  const handleDeleteQuotation = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Quotation?",
      message:
        "Are you sure you want to delete this quotation? This action cannot be undone.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/quotations/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            fetchQuotations();
            showToast("Quotation deleted successfully", "success");
          } else {
            showToast(res.error || "Failed to delete quotation", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error deleting quotation", "error");
        }
      },
    });
  };

  const handleAuthorize = async (pin: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/quotations/${selectedQuoToAuth.id}/authorize`,
        {
          method: "POST",
          body: JSON.stringify({ pin }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowAuthorizeModal(false);
        setAuthPin("");
        fetchQuotations();
        showToast("Quotation authorized successfully", "success");
        setSelectedDocForEmail(selectedQuoToAuth);
        setShowEmailModal(true);
      } else {
        showToast(res.error || "Failed to authorize quotation", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Server error while authorizing", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevise = async (note: string) => {
    if (!note.trim()) {
      showToast("Validation Failed: Revision note is required.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/quotations/${selectedQuoToAuth.id}/revise`,
        {
          method: "POST",
          body: JSON.stringify({
            pin: getDailyAuthKey(user?.username),
            revision_note: note,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowReviseModal(false);
        setRevisionNote("");
        fetchQuotations();
        showToast("Quotation marked for revision", "success");
      } else {
        showToast(
          res.error || "Failed to marking quotation for revision",
          "error",
        );
      }
    } catch (err) {
      console.error(err);
      showToast("Server error while revising quotation", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
    fetchNtps();
  }, [fetchQuotations, fetchNtps]);

  useEffect(() => {
    const tabParam = searchParams.get("tab")?.toUpperCase();
    const ntpIdParam = searchParams.get("ntp_id") || searchParams.get("open_ntp");
    const highlightParam = searchParams.get("highlight");

    if (tabParam === "NTP" || ntpIdParam) {
      setActiveTab("NTP");
    } else if (tabParam === "QUOTATIONS") {
      setActiveTab("QUOTATIONS");
    }

    if (ntpIdParam) {
      handleOpenNtpByProjectId(ntpIdParam);
    } else if (highlightParam && quotations.length > 0) {
      const found = quotations.find(
        (q) => q.id === highlightParam || q.quotation_number === highlightParam,
      );
      if (found) {
        setSelectedQuotation(found);
      }
    }
  }, [searchParams, quotations, handleOpenNtpByProjectId]);

  const filtered = useMemo(() => {
    const highlightParam = searchParams.get("highlight");
    if (isCrossDeptViewer) {
      if (!highlightParam) return [];
      return quotations.filter(
        (q) => q.id === highlightParam || q.quotation_number === highlightParam,
      );
    }

    return quotations.filter((q) => {
      const qNum = (q.quotation_number || "").toLowerCase();
      const rNum = (q.receipt_number || "").toLowerCase();
      const pNum = (q.linked_project_id || "").toLowerCase();
      const title = (q.title || "").toLowerCase();
      const cust = (q.customer_name || "").toLowerCase();
      const manualCust = (q.customer_name_manual || "").toLowerCase();
      const s = searchQuery.toLowerCase();

      const matchesSearch =
        title.includes(s) ||
        qNum.includes(s) ||
        rNum.includes(s) ||
        pNum.includes(s) ||
        cust.includes(s) ||
        manualCust.includes(s);

      const matchesFilter = filterStatus === "ALL" || q.status === filterStatus;

      const isRetail = q.sales_channel === "DIRECT_RETAIL" || q.settlement_type === "IMMEDIATE";
      const matchesChannel =
        filterChannel === "ALL" ||
        (filterChannel === "DIRECT_RETAIL" && isRetail) ||
        (filterChannel === "B2B_PROJECT" && !isRetail);

      return matchesSearch && matchesFilter && matchesChannel;
    });
  }, [quotations, searchQuery, filterStatus, filterChannel, isCrossDeptViewer, searchParams]);

  const filteredNtps = useMemo(() => {
    const ntpIdParam = searchParams.get("ntp_id") || searchParams.get("open_ntp");
    if (isCrossDeptViewer) {
      if (!ntpIdParam) return [];
      return ntps.filter(
        (n) =>
          (n.project_id || n.ntp_number) === ntpIdParam ||
          n.id === ntpIdParam ||
          n.quotation_number === ntpIdParam,
      );
    }

    return ntps.filter((n) => {
      const s = ntpSearchQuery.toLowerCase().trim();
      const docNo = (n.project_id || n.ntp_number || "").toLowerCase();
      const projName = (n.project_name || "").toLowerCase();
      const custName = (n.customer_name || "").toLowerCase();
      const quoNo = (n.quotation_number || "").toLowerCase();

      const matchesSearch =
        !s ||
        docNo.includes(s) ||
        projName.includes(s) ||
        custName.includes(s) ||
        quoNo.includes(s);

      const pStatus = String(n.project_status || n.status || "ISSUED").toUpperCase();
      const matchesStatus =
        ntpStatusFilter === "ALL" ||
        pStatus === ntpStatusFilter ||
        String(n.status || "").toUpperCase() === ntpStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [ntps, ntpSearchQuery, ntpStatusFilter, isCrossDeptViewer, searchParams]);

  const totalAmount = useMemo(
    () =>
      quotations
        .filter((q) =>
          ["PENDING", "APPROVED", "REVISION", "PROCESSED"].includes(q.status),
        )
        .reduce(
          (sum, q) =>
            sum +
            (Number(q.grand_total) > 0
              ? Number(q.grand_total)
              : Number(q.net_amount) || Number(q.amount) || 0),
          0,
        ),
    [quotations],
  );
  const pendingCount = quotations.filter((q) => q.status === "PENDING").length;
  const retailCount = quotations.filter((q) => q.sales_channel === "DIRECT_RETAIL" || q.settlement_type === "IMMEDIATE").length;
  const b2bCount = quotations.filter((q) => q.sales_channel !== "DIRECT_RETAIL" && q.settlement_type !== "IMMEDIATE").length;

  const getQuotationEmailBody = (doc: any) => {
    if (!doc) return "";
    const discountRate = Number(doc.discount_rate) || 0;
    const discountAmount = Number(doc.discount_amount) || 0;
    const hasDiscount = discountRate > 0 || discountAmount > 0;

    const issueDate = doc.created_at
      ? new Date(doc.created_at).toLocaleDateString("en-US", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";
    const totalVal = doc.grand_total || doc.amount;
    const validityDays = doc.validity_days || 14;
    const projectTitle = doc.title && doc.title.trim() ? doc.title.trim() : null;
    const itemCount = Array.isArray(doc.items) && doc.items.length > 0 ? doc.items.length : null;

    return `Dear ${doc.customer_name || "Valued Customer"},

Thank you for your interest and trust in 𝗖𝗩 𝗕𝗮𝘁𝘂 𝗘𝗺𝗮𝘀 𝗚𝗿𝗼𝘂𝗽.

Following up on your procurement inquiry, please find attached our official 𝗖𝗼𝗺𝗺𝗲𝗿𝗰𝗶𝗮𝗹 𝗤𝘂𝗼𝘁𝗮𝘁𝗶𝗼𝗻 with the following summary:

𝗤𝘂𝗼𝘁𝗮𝘁𝗶𝗼𝗻 𝗦𝘂𝗺𝗺𝗮𝗿𝘆:
• Reference No. : ${doc.quotation_number}${issueDate ? `\n• Issue Date    : ${issueDate}` : ""}${projectTitle ? `\n• Subject / Project: ${projectTitle}` : ""}${totalVal ? `\n• Total Amount  : ${formatIDR(totalVal)}` : ""}${itemCount ? `\n• Line Items    : ${itemCount} product / service item(s) (detailed specifications attached)` : ""}${hasDiscount ? `\n• Special Offer : A 𝗦𝗣𝗘𝗖𝗜𝗔𝗟 𝗗𝗜𝗦𝗖𝗢𝗨𝗡𝗧${discountRate > 0 ? ` (${discountRate}%)` : ""} has been applied directly to this quotation.` : ""}
• Validity      : ${validityDays} calendar days from the quotation issue date

𝗡𝗼𝘁𝗲𝘀 & 𝗦𝗽𝗲𝗰𝗶𝗳𝗶𝗰𝗮𝘁𝗶𝗼𝗻𝘀:
Complete product descriptions, quantities, unit prices, technical specifications, and payment terms & conditions are detailed in the attached PDF document.

𝗡𝗲𝘅𝘁 𝗦𝘁𝗲𝗽𝘀:
Should this quotation meet your requirements, please send us your order confirmation or issue a Purchase Order (PO). If you require any technical clarification or further discussion, our team is ready to assist.

Thank you for your time, attention, and continued partnership.

Best regards,`;
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300 pb-20">
      <PageHeader
        title="Quotations & NTP"
        subtitle="Commercial quotes & project mandates"
        icon={<FileSpreadsheet className="w-5 h-5" />}
        actions={
          isCrossDeptViewer ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.href = "/erp";
              }}
            >
              Back to Dashboard
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              {(user?.role === "SALES" || user?.role === "FC" || hasGodMode(user)) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setCreateProjectQuotationId("");
                    setShowCreateProjectModal(true);
                  }}
                  leftIcon={<FolderKanban className="w-4 h-4 text-stone-600" />}
                >
                  Issue Project / NTP
                </Button>
              )}
              {hasPermission(user, Action.SALES_ACTION) && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setInitialModalSettlement("CREDIT_TERM");
                    setShowCreateModal(true);
                  }}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  New Quotation
                </Button>
              )}
            </div>
          )
        }
      />

      {/* Cross-Department Read-Only Isolation Banner */}
      {isCrossDeptViewer && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold">Cross-Department Read-Only Mode:</span>{" "}
              <span>
                Viewing shared document strictly in isolation. Full sales registry, financial totals, and commercial actions are protected.
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

      {/* Segmented Workspace Switcher: Sales Quotations vs Notice to Proceed (NTP) */}
      {!isCrossDeptViewer && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2 rounded-xl border border-stone-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-1 bg-stone-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setActiveTab("QUOTATIONS");
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("tab", "quotations");
                  next.delete("ntp_id");
                  return next;
                });
              }}
              className={cn(
                "px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2",
                activeTab === "QUOTATIONS"
                  ? "bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 shadow-2xs"
                  : "text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200",
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Sales Quotations</span>
              <span className="font-mono tabular-nums text-[10px] text-stone-500 dark:text-slate-400">
                ({quotations.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("NTP");
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("tab", "ntp");
                  return next;
                });
              }}
              className={cn(
                "px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2",
                activeTab === "NTP"
                  ? "bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100 shadow-2xs"
                  : "text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200",
              )}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Notice to Proceed (NTP)</span>
              <span className="font-mono tabular-nums text-[10px] text-stone-500 dark:text-slate-400">
                ({ntps.length})
              </span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-stone-500 dark:text-slate-400 px-2">
            <span>Unified Document Standard:</span>
            <span className="font-mono font-semibold text-stone-800 dark:text-slate-200">
              NTP Document No. = Project ID
            </span>
          </div>
        </div>
      )}

      {activeTab === "QUOTATIONS" ? (
        <>
          {!isCrossDeptViewer && (
            <div className="flex flex-col md:flex-row gap-2.5 sm:gap-3 items-stretch md:items-center justify-between bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-2xl border border-stone-200/80 dark:border-slate-800 shadow-2xs">
              <div className="w-full md:max-w-md">
                <Input
                  type="text"
                  placeholder="Search quotation number, NTP / Project ID, customer, subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full md:w-auto justify-end">
                {/* Channel Filter */}
                <div className="h-9 flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 border border-stone-200 dark:border-slate-700 hover:border-stone-300 rounded-lg shrink-0 flex-1 sm:flex-initial transition-colors">
                  <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <select
                    value={filterChannel}
                    onChange={(e) => setFilterChannel(e.target.value)}
                    className="no-base-style w-full text-xs font-semibold text-stone-700 dark:text-slate-200 bg-transparent outline-none cursor-pointer border-none py-0"
                  >
                    <option value="ALL">All Channels</option>
                    <option value="DIRECT_RETAIL">Direct Retail (B2C)</option>
                    <option value="B2B_PROJECT">B2B Corporate Project</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="h-9 flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 border border-stone-200 dark:border-slate-700 hover:border-stone-300 rounded-lg shrink-0 flex-1 sm:flex-initial transition-colors">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="no-base-style w-full text-xs font-semibold text-stone-700 dark:text-slate-200 bg-transparent outline-none cursor-pointer border-none py-0"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="DRAFT">Draft</option>
                    <option value="PENDING">Pending Approval</option>
                    <option value="APPROVED">Approved / Settled</option>
                    <option value="PROCESSED">Processed (NTP Issued)</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>

                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => {
                    fetchQuotations();
                    fetchNtps();
                  }}
                  title="Refresh Data"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                </Button>
              </div>
            </div>
          )}

          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>Quotation & NTP Reference</TableHead>
                <TableHead>Customer & Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty
                  colSpan={5}
                  icon={<RefreshCw className="w-6 h-6 text-stone-300 animate-spin" />}
                  message="Loading quotations..."
                />
              ) : filtered.length === 0 ? (
                <TableEmpty
                  colSpan={5}
                  icon={<FileText className="w-7 h-7 text-stone-300" />}
                  message="No quotations found"
                />
              ) : (
                filtered.map((q) => {
                  const isApproved =
                    q.status === "APPROVED" || q.status === "PROCESSED";
                  const isRetail =
                    q.sales_channel === "DIRECT_RETAIL" || q.settlement_type === "IMMEDIATE";

                  return (
                    <TableRow
                      key={q.id}
                      className="group cursor-pointer"
                      onClick={() => {
                        if (isCrossDeptViewer) {
                          setSelectedQuotation(q);
                        } else if (isRetail || q.receipt_number) {
                          setSelectedReceiptForPrint(q);
                        } else {
                          setSelectedQuotation(q);
                        }
                      }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3.5">
                          <div className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200/80 text-stone-600 flex items-center justify-center shrink-0">
                            {isRetail ? (
                              <ShoppingBag className="w-4 h-4 text-stone-600" />
                            ) : isApproved ? (
                              <CheckCircle2 className="w-4 h-4 text-stone-600" />
                            ) : (
                              <FileText className="w-4 h-4 text-stone-500" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="text-[10px] font-bold font-mono tabular-nums text-stone-500 uppercase tracking-wider">
                                {q.quotation_number}
                              </span>
                              {q.receipt_number && (
                                <span className="text-[9px] font-bold font-mono tabular-nums bg-stone-100 text-stone-700 border border-stone-200 px-1.5 py-0.5 rounded">
                                  {q.receipt_number}
                                </span>
                              )}
                              {q.linked_project_id && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenNtpByProjectId(q.linked_project_id);
                                  }}
                                  title="Click to preview Notice to Proceed (NTP)"
                                  className="text-[9.5px] font-bold font-mono tabular-nums text-emerald-700 hover:text-emerald-900 underline decoration-emerald-400/60 underline-offset-2 cursor-pointer"
                                >
                                  · NTP: {q.linked_project_id}
                                </button>
                              )}
                            </div>
                            <div className="text-xs sm:text-sm font-bold text-stone-900 group-hover:text-stone-700 transition-colors">
                              {q.title}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs sm:text-sm font-bold text-stone-800">
                          {q.customer_name_manual || q.customer_name || "Walk-In Customer"}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-500">
                          {isRetail ? (
                            <span>Direct Retail (B2C)</span>
                          ) : (
                            <span>B2B Project · {q.payment_terms || "Standard Terms"}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-700">
                          {q.status === "APPROVED" && isRetail ? "SETTLED" : q.status}
                        </span>
                        {q.status === "REVISION" && q.revision_note && (
                          <div className="mt-1.5 flex items-start gap-1 p-2 bg-stone-50 border border-stone-200 rounded-md text-xs text-stone-700">
                            <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-stone-400" />
                            <span className="italic">"{q.revision_note}"</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-xs sm:text-sm font-bold font-mono text-stone-900 tabular-nums">
                          {canViewDocFinancials(user, "QUOTATION") ? (
                            formatIDR(q.grand_total || q.amount || 0)
                          ) : (
                            <ConfidentialBadge />
                          )}
                        </div>
                        {canViewDocFinancials(user, "QUOTATION") && Number(q.pph_rate) > 0 && (
                          <div className="text-[10px] font-medium text-stone-500 font-mono tabular-nums">
                            WHT {q.pph_rate}%
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isCrossDeptViewer ? (
                            <Button
                              size="xs"
                              action="view"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedQuotation(q);
                              }}
                            />
                          ) : (
                            <>
                              {q.linked_project_id && (
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  title={`View NTP Document (${q.linked_project_id})`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenNtpByProjectId(q.linked_project_id);
                                  }}
                                  leftIcon={<Briefcase className="w-3.5 h-3.5 text-emerald-700" />}
                                >
                                  NTP
                                </Button>
                              )}

                          {(isRetail || q.receipt_number) && (
                            <Button
                              size="xs"
                              variant="secondary"
                              title="Print Thermal Receipt"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReceiptForPrint(q);
                              }}
                              leftIcon={<Printer className="w-3.5 h-3.5" />}
                            />
                          )}

                          {q.status === "PENDING" &&
                            (user?.role === "FC" || user?.role === "SALES" || hasGodMode(user)) && (
                              <>
                                <Button
                                  size="xs"
                                  action="authorize"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedQuoToAuth(q);
                                    setShowAuthorizeModal(true);
                                  }}
                                />
                                <Button
                                  size="xs"
                                  action="revise"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedQuoToAuth(q);
                                    setShowReviseModal(true);
                                  }}
                                />
                              </>
                            )}
                          {(q.status === "REVISION" || q.status === "DRAFT") &&
                            hasPermission(user, Action.CREATE_QUOTATION) && (
                              <Button
                                size="xs"
                                action="revise"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRevisingQuotation(q);
                                  setShowCreateModal(true);
                                }}
                              />
                            )}
                          {(q.status === "APPROVED" || q.status === "AUTHORIZED" || q.status === "PROCESSED") && (
                            <Button
                              size="xs"
                              variant="secondary"
                              title="Send to Partner"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDocForEmail(q);
                                setShowEmailModal(true);
                              }}
                              leftIcon={<Send className="w-3.5 h-3.5 text-stone-600" />}
                            />
                          )}
                          {!isRetail && (
                            <Button
                              size="xs"
                              variant="secondary"
                              title="Analyze ATP Stock & CTP Capacity Date"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAtpCtpQuotationId(q.id);
                              }}
                              leftIcon={<Calculator className="w-3.5 h-3.5 text-indigo-600" />}
                            />
                          )}
                          {(q.status === "APPROVED" || q.status === "AUTHORIZED") && !isRetail &&
                            (user?.role === "FC" || user?.role === "SALES" || hasGodMode(user)) && (
                              <Button
                                size="xs"
                                variant="secondary"
                                title="Create Project & Issue NTP"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCreateProjectCtpDate(undefined);
                                  setCreateProjectNetMtoQty(undefined);
                                  setCreateProjectQuotationId(q.id);
                                  setShowCreateProjectModal(true);
                                }}
                                leftIcon={<FolderKanban className="w-3.5 h-3.5 text-stone-600" />}
                              />
                            )}
                          <Button
                            size="xs"
                            action="view"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedQuotation(q);
                            }}
                          />
                              {(user?.role === "FC" ||
                                hasGodMode(user) ||
                                (user?.role === "SALES" &&
                                  hasPermission(
                                    user,
                                    Action.CREATE_QUOTATION,
                                  ))) && q.status !== "PROCESSED" && (
                                <Button
                                  size="xs"
                                  action="delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteQuotation(q.id);
                                  }}
                                />
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </>
      ) : (
        <>
          {/* Notice to Proceed (NTP) Management Registry */}
          {!isCrossDeptViewer && (
            <div className="flex flex-col md:flex-row gap-2.5 sm:gap-3 items-stretch md:items-center justify-between bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-2xl border border-stone-200/80 dark:border-slate-800 shadow-2xs">
              <div className="w-full md:max-w-md">
                <Input
                  type="text"
                  placeholder="Search NTP / Project ID (e.g. PRJ-...), project name, customer, quotation..."
                  value={ntpSearchQuery}
                  onChange={(e) => setNtpSearchQuery(e.target.value)}
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                />
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full md:w-auto justify-end">
                <div className="h-9 flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 border border-stone-200 dark:border-slate-700 hover:border-stone-300 rounded-lg shrink-0 flex-1 sm:flex-initial transition-colors">
                  <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <select
                    value={ntpStatusFilter}
                    onChange={(e) => setNtpStatusFilter(e.target.value)}
                    className="no-base-style w-full text-xs font-semibold text-stone-700 dark:text-slate-200 bg-transparent outline-none cursor-pointer border-none py-0"
                  >
                    <option value="ALL">All NTP Mandates</option>
                    <option value="ACTIVE">Active Execution</option>
                    <option value="ISSUED">Issued Mandate</option>
                    <option value="FINISHED">Finished / Closed</option>
                  </select>
                </div>

                <Button
                  variant="secondary"
                  size="icon"
                  onClick={fetchNtps}
                  title="Refresh NTP Registry"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", isLoadingNtps && "animate-spin")} />
                </Button>
              </div>
            </div>
          )}

          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>NTP / Project ID & Title</TableHead>
                <TableHead>Customer & Source Quotation</TableHead>
                <TableHead>Scope & Target Deadline</TableHead>
                <TableHead className="text-right">Contract Value</TableHead>
                <TableHead>Mandate Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingNtps ? (
                <TableEmpty
                  colSpan={6}
                  icon={<RefreshCw className="w-6 h-6 text-stone-300 animate-spin" />}
                  message="Loading Notice to Proceed (NTP) registry..."
                />
              ) : filteredNtps.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  icon={<Briefcase className="w-7 h-7 text-stone-300" />}
                  message="No Notice to Proceed (NTP) documents found"
                />
              ) : (
                filteredNtps.map((ntpRow) => {
                  const unifiedDocNo = ntpRow.project_id || ntpRow.ntp_number;
                  const issueDate = ntpRow.created_at
                    ? new Date(ntpRow.created_at).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "-";
                  const dueDateStr = ntpRow.due_date
                    ? new Date(ntpRow.due_date).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "Per Schedule";

                  return (
                    <TableRow
                      key={ntpRow.id || unifiedDocNo}
                      className="group cursor-pointer"
                      onClick={() => handleOpenNtpByProjectId(unifiedDocNo)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200/80 text-stone-700 flex items-center justify-center shrink-0">
                            <Briefcase className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums font-bold text-stone-900">
                              <span>{unifiedDocNo}</span>
                              <span className="text-stone-400 font-normal">·</span>
                              <span className="text-[10px] font-normal text-stone-500">
                                Issued {issueDate}
                              </span>
                            </div>
                            <div className="text-xs sm:text-sm font-bold text-stone-900 group-hover:text-stone-700 transition-colors mt-0.5">
                              {ntpRow.project_name || "Project Mandate"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs sm:text-sm font-bold text-stone-800">
                          {ntpRow.customer_name || "Corporate Client"}
                        </div>
                        <div className="text-[11px] text-stone-500 font-mono tabular-nums mt-0.5">
                          Quo Ref: {ntpRow.quotation_number || ntpRow.quotation_id || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-bold font-mono tabular-nums text-stone-900">
                          {ntpRow.qty || 1} {ntpRow.uom || "Unit"}
                        </div>
                        <div className="text-[11px] text-stone-500 font-mono tabular-nums mt-0.5">
                          Due: {dueDateStr}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-xs sm:text-sm font-bold font-mono tabular-nums text-stone-900">
                          {canViewDocFinancials(user, "NTP") ? (
                            Number(ntpRow.quotation_amount) > 0
                              ? formatIDR(Number(ntpRow.quotation_amount))
                              : "-"
                          ) : (
                            <ConfidentialBadge />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                          {ntpRow.project_status || ntpRow.status || "ISSUED"}
                        </div>
                        <div className="text-[10px] text-stone-500 mt-0.5">
                          {String(ntpRow.lifecycle_stage || "ENGINEERING_PREP").replace(/_/g, " ")}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="xs"
                            action="view"
                            title="Preview NTP Document"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenNtpByProjectId(unifiedDocNo);
                            }}
                          />
                          {!isCrossDeptViewer && (
                            <Button
                              size="xs"
                              variant="secondary"
                              title="Share NTP Document to Messages"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShareModal({
                                  type: "NTP",
                                  id: unifiedDocNo,
                                  title: `${unifiedDocNo} - ${ntpRow.project_name || "Project Mandate"}`,
                                  status: ntpRow.project_status || ntpRow.status || "ISSUED",
                                  amount: Number(ntpRow.quotation_amount || 0),
                                  partnerName: ntpRow.customer_name || "Corporate Client",
                                  urgency: ntpRow.urgency || "NORMAL",
                                  url: `/quotations?tab=ntp&ntp_id=${encodeURIComponent(unifiedDocNo)}`,
                                });
                              }}
                              leftIcon={<Share2 className="w-3.5 h-3.5 text-stone-600" />}
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
        </>
      )}

      <CreateQuotationModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setRevisingQuotation(null);
        }}
        revisingData={revisingQuotation}
        initialSettlementType={initialModalSettlement}
        onOpenReceipt={(receiptData) => {
          setSelectedReceiptForPrint(receiptData);
        }}
        onSuccess={(quo) => {
          setShowCreateModal(false);
          setRevisingQuotation(null);
          fetchQuotations();
          if (quo?.sales_channel !== "DIRECT_RETAIL" && quo?.settlement_type !== "IMMEDIATE") {
            setSelectedQuotation(quo);
          }
        }}
      />

      <ThermalReceiptModal
        isOpen={!!selectedReceiptForPrint}
        onClose={() => setSelectedReceiptForPrint(null)}
        quotationId={selectedReceiptForPrint?.id}
        initialData={selectedReceiptForPrint}
      />

      <QuotationPreviewModal
        isOpen={!!selectedQuotation}
        onClose={() => setSelectedQuotation(null)}
        quotation={selectedQuotation}
        onOpenReceipt={isCrossDeptViewer ? undefined : (quo) => setSelectedReceiptForPrint(quo)}
        onAuthorize={
          !isCrossDeptViewer && (user?.role === "FC" || user?.role === "SALES" || hasGodMode(user))
            ? (quo) => {
                setSelectedQuoToAuth(quo);
                setShowAuthorizeModal(true);
              }
            : undefined
        }
        onCreateProject={
          !isCrossDeptViewer && (user?.role === "FC" || user?.role === "SALES" || hasGodMode(user))
            ? (quo) => {
                setSelectedQuotation(null);
                setCreateProjectQuotationId(quo.id);
                setShowCreateProjectModal(true);
              }
            : undefined
        }
      />

      <AtpCtpModal
        isOpen={!!atpCtpQuotationId}
        onClose={() => setAtpCtpQuotationId(null)}
        quotationId={atpCtpQuotationId}
        username={user?.username}
        onMtsDispatched={() => {
          fetchQuotations();
        }}
        onProceedToMtoProject={(analysis: AtpCtpAnalysis) => {
          setAtpCtpQuotationId(null);
          setCreateProjectQuotationId(analysis.quotation_id);
          setCreateProjectCtpDate(analysis.ctp_promise_date);
          setCreateProjectNetMtoQty(analysis.summary.total_net_mto_qty);
          setShowCreateProjectModal(true);
        }}
      />

      <CreateProjectModal
        isOpen={showCreateProjectModal}
        onClose={() => {
          setShowCreateProjectModal(false);
          setCreateProjectQuotationId("");
          setCreateProjectCtpDate(undefined);
          setCreateProjectNetMtoQty(undefined);
        }}
        onSuccess={(ntpData, projectData) => {
          fetchQuotations();
          fetchNtps();
          if (ntpData) {
            setSelectedNtpForPreview({
              ...ntpData,
              ntp_number: projectData?.id || ntpData.ntp_number,
            });
            setSelectedProjectForNtp(projectData);
          }
        }}
        initialQuotationId={createProjectQuotationId}
        initialCtpDate={createProjectCtpDate}
        initialNetMtoQty={createProjectNetMtoQty}
      />

      <AuthorizeDocModal
        isOpen={showAuthorizeModal && selectedQuoToAuth !== null}
        onClose={() => setShowAuthorizeModal(false)}
        docType="Quotation"
        docNumber={selectedQuoToAuth?.quotation_number || ""}
        status={selectedQuoToAuth?.status || "DRAFT"}
        partnerLabel="Customer"
        partnerName={selectedQuoToAuth?.customer_name}
        amount={selectedQuoToAuth?.amount}
        isSubmitting={isSubmitting}
        onAuthorize={handleAuthorize}
      />

      <ReviseDocModal
        isOpen={showReviseModal && selectedQuoToAuth !== null}
        onClose={() => setShowReviseModal(false)}
        docType="Quotation"
        docNumber={selectedQuoToAuth?.quotation_number || ""}
        status={selectedQuoToAuth?.status || "DRAFT"}
        partnerLabel="Customer"
        partnerName={selectedQuoToAuth?.customer_name}
        amount={selectedQuoToAuth?.amount}
        isSubmitting={isSubmitting}
        onRevise={handleRevise}
      />

      <SendEmailModal
        isOpen={showEmailModal && selectedDocForEmail !== null}
        onClose={() => setShowEmailModal(false)}
        docType="Quotation"
        docNumber={selectedDocForEmail?.quotation_number || ""}
        defaultRecipientEmail={selectedDocForEmail?.customer_email || ""}
        defaultRecipientPhone={selectedDocForEmail?.customer_phone || ""}
        defaultRecipientName={selectedDocForEmail?.customer_name || ""}
        defaultSubject={`Quotation - ${selectedDocForEmail?.quotation_number}`}
        defaultBody={getQuotationEmailBody(selectedDocForEmail)}
        onDownloadPdf={handleDownloadPdf}
        onSend={async (data) => {
          let logoSrc = `${window.location.origin}/logo.png`;
          try {
            const response = await fetch('/logo.png');
            const blob = await response.blob();
            const base64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
            if (base64) logoSrc = base64 as string;
          } catch (err) {
            console.warn("Failed to convert logo to base64", err);
          }

          const htmlSignature = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; max-width: 650px; background-color: #ffffff; margin-top: 24px; border-top: 2px solid #b02524; padding-top: 16px;">
  <tr>
    <td colspan="3" style="padding-bottom: 15px;">
      <strong style="font-size: 18px; color: #b02524; letter-spacing: 0.5px;">
        <span style="color: #b02524;"><font color="#b02524">ADMIN SALES</font></span>
      </strong>
      <br/>
      <span style="font-size: 13px; color: #666666;">
        <span style="color: #666666;"><font color="#666666">Sales &amp; Marketing</font></span>
      </span>
    </td>
  </tr>
  <tr>
    <td style="vertical-align: middle; padding-right: 20px; width: 80px;">
      <img src="${logoSrc}" alt="CV Batu Emas Group Logo" width="80" style="display: block; width: 80px; max-width: 80px; height: auto; border: 0;" />
    </td>
    <td style="vertical-align: middle; padding: 0 20px; border-left: 2px solid #e0e0e0; width: 220px; font-size: 12px; color: #555555; line-height: 1.5;">
      <span style="color: #555555;">
        <font color="#555555">Dusun Petahunan, Gambiran,<br/>Banyuwangi, Jawa Timur<br/>Indonesia</font>
      </span>
    </td>
    <td style="vertical-align: middle; padding-left: 20px; border-left: 2px solid #e0e0e0;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align: middle; padding-right: 10px; padding-bottom: 6px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/mail.png" width="14" height="14" alt="email" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555; padding-bottom: 6px;">
            <a href="mailto:pavingjoss@gmail.com" style="color: #555555; text-decoration: none;">
              <span style="color: #555555;"><font color="#555555">pavingjoss@gmail.com</font></span>
            </a>
          </td>
        </tr>
        <tr>
          <td style="vertical-align: middle; padding-right: 10px; padding-bottom: 6px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/phone.png" width="14" height="14" alt="phone" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555; padding-bottom: 6px;">
            <span style="color: #555555;"><font color="#555555">(+62) 811 1111 3993</font></span>
          </td>
        </tr>
        <tr>
          <td style="vertical-align: middle; padding-right: 10px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/domain.png" width="14" height="14" alt="web" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555;">
            <a href="https://www.pavingjoss.com" style="color: #555555; text-decoration: none;">
              <span style="color: #555555;"><font color="#555555">www.pavingjoss.com</font></span>
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="3" style="padding-top: 20px; font-size: 9px; color: #999999; line-height: 1.4; text-align: justify;">
      <span style="color: #999999;">
        <font color="#999999">The content of this email is confidential and intended for the recipient specified in message only. It is strictly forbidden to share any part of this message with any third party, without a written consent of the sender. If you received this message by mistake, please reply to this message and follow with its deletion, so that we can ensure such a mistake does not occur in the future.</font>
      </span>
    </td>
  </tr>
</table>
          `;

          const plainSignature = `\n\nAdmin Sales\nSales & Marketing\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCV. Batu Emas Group\nDusun Petahunan, Gambiran, Banyuwangi,\nJawa Timur, Indonesia\nm: (+62) 811 1111 3993\ne: pavingjoss@gmail.com\n\nwww.pavingjoss.com`;

          let copied = false;
          try {
            if (typeof window !== 'undefined' && window.ClipboardItem) {
              const htmlBlob = new Blob([htmlSignature], { type: "text/html" });
              const textBlob = new Blob([plainSignature], { type: "text/plain" });
              const item = new window.ClipboardItem({
                "text/html": htmlBlob,
                "text/plain": textBlob,
              });
              await navigator.clipboard.write([item]);
              copied = true;
            }
          } catch (err) {
            console.warn("Failed to copy rich signature", err);
          }

          const bodyWithPrompt = data.body + (copied ? "\n\n[PASTE (CTRL+V) YOUR EMAIL SIGNATURE HERE]" : plainSignature);

          const mailtoUrl = `mailto:${data.to}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(bodyWithPrompt)}`;
          const a = document.createElement("a");
          a.href = mailtoUrl;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          if (copied) {
            showToast("Signature copied! Press Ctrl+V in your email composer.", "success");
          } else {
            showToast("Opening default email application...", "success");
          }
        }}
      />

      <ConfirmModal
        isOpen={confirmModal?.isOpen || false}
        onCancel={() => setConfirmModal(null)}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        onConfirm={() => {
           if (confirmModal?.action) {
             confirmModal.action();
           }
           setConfirmModal(null);
        }}
      />

      <NtpPreviewModal
        isOpen={!!selectedNtpForPreview}
        onClose={() => {
          setSelectedNtpForPreview(null);
          setSelectedProjectForNtp(null);
          if (searchParams.get("ntp_id") || searchParams.get("open_ntp")) {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete("ntp_id");
              next.delete("open_ntp");
              return next;
            });
          }
        }}
        ntp={selectedNtpForPreview}
        project={selectedProjectForNtp}
      />

      {/* Hidden renderer for PDF export from list view */}
      {selectedDocForEmail && (
        <QuotationPreviewModal
          isOpen={true}
          onClose={() => {}}
          quotation={selectedDocForEmail}
          isPrintModeHidden={true}
          exportPdfRef={exportPdfRef}
        />
      )}
    </div>
  );
}
