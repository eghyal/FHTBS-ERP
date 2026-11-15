import { apiFetch } from "@/utils/api";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  CheckCircle2,
  X,
  Download,
  FileText,
  Upload,
  Trash2,
  Archive,
  Plus,
  AlertCircle,
  FilePlus2,
  Share2,
  ClipboardList,
  Compass,
  ChevronUp,
  AlertTriangle,
  Clock,
  QrCode,
  Lock,
  ShieldCheck,
  Layers,
  Package,
  Boxes,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import {
   generatePDF } from "@/lib/pdfGenerator";
import {
   QRCodeSVG } from "qrcode.react";
import {
   cn } from "@/lib/utils";
import {
   useAuth } from "@/contexts/AuthContext";
import {
   useLanguage } from "@/contexts/LanguageContext";
import {
   useToast } from "@/contexts/ToastContext";
import {
   useShare } from "@/contexts/ShareContext";
import {
   ConfirmModal } from "@/components/shared/ConfirmModal";
import {
   Modal } from "@/components/ui/Modal";
import {
   Select } from "@/components/ui/Select";
import {
   Input } from "@/components/ui/Input";
import {
   Badge } from "@/components/ui/Badge";
import {
   Table,
   TableHeader,
   TableBody,
   TableRow,
   TableHead,
   TableCell,
   TableEmpty,
} from "@/components/ui/Table";
import {
   Button } from "@/components/ui/Button";
import {
   AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import {
   ReviseDocModal } from "@/components/erp/ReviseDocModal";
import {
   Action, hasPermission } from "@/utils/pbac";
import {
   PageHeader } from "@/components/shared/PageHeader";
import {
   PrintTemplate } from "@/components/erp/PrintTemplate";
import {
   useAutoSave } from "@/hooks/useAutoSave";
import {
   getDailyAuthKey } from "@/utils/auth";
import {
   PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { PrShortagePreviewModal } from "@/components/erp/production/PrShortagePreviewModal";

interface BomRow {
  id: string;
  item_id?: string;
  item_code: string;
  name: string;
  qty: string;
  uom?: string;
  unit?: string;
  unit_price?: string;
  free_stock?: number;
  shortage_qty?: number;
  qty_to_order?: number;
  notFound?: boolean;
}

export default function Requests() {
  const printRef = useRef<HTMLDivElement>(null);
  const [prs, setPrs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirm Modal States
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    action: () => {},
  });

  // New Request States
  const {
    data: selectedProject,
    setData: setSelectedProject,
    clearDraft: clearSelectedProject,
  } = useAutoSave<string>("requests_selected_project", "");
  const {
    data: drawingReference,
    setData: setDrawingReference,
    clearDraft: clearDrawingReference,
  } = useAutoSave<string>("requests_drawing_reference", "");
  const {
    data: bomRows,
    setData: setBomRows,
    clearDraft: clearBomDraft,
  } = useAutoSave<BomRow[]>("requests_bom_rows", []);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [urgency, setUrgency] = useState<"NORMAL" | "URGENT" | "CRITICAL">(
    "NORMAL",
  );
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [showPrModal, setShowPrModal] = useState(false);

  const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [selectedPrToAuth, setSelectedPrToAuth] = useState<any>(null);
  const [revisingPr, setRevisingPr] = useState<any>(null);
  const [authPin, setAuthPin] = useState("");
  const [previewPrData, setPreviewPrData] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { showToast } = useToast();
  const { shareToForum } = useShare();

  const fetchPrs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/purchasing/prs?scope=PROJECT", {}, user?.username);
      if (res.ok) {
        setPrs(Array.isArray(res.data) ? res.data : []);
      } else {
        showToast(res.error || "Failed to fetch PRs", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error fetching PRs", "error");
    } finally {
      setIsLoading(false);
    }
  }, [user?.username, showToast]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await apiFetch("/api/projects", {}, user?.username);
      if (res.ok) {
        setProjects(
          Array.isArray(res.data)
            ? res.data.filter(
                (p: any) =>
                  !["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"].includes(
                    String(p.id || "").toUpperCase()
                  ) && String(p.status || "").toUpperCase() !== "INTERNAL_OVERHEAD"
              )
            : []
        );
      } else {
        showToast(res.error || "Failed to fetch projects", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error fetching projects", "error");
    }
  }, [user?.username, showToast]);

  const fetchInventory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/inventory", {}, user?.username);
      if (res.ok) {
        setInventoryItems(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {}
  }, [user?.username]);

  useEffect(() => {
    fetchPrs();
    fetchProjects();
    fetchInventory();
  }, [fetchPrs, fetchProjects, fetchInventory]);

  const [searchParams] = useSearchParams();
  const [bopSteps, setBopSteps] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'PURCHASE' | 'FLOOR'>('PURCHASE');
  const [floorRequests, setFloorRequests] = useState<any[]>([]);
  const [isFloorLoading, setIsFloorLoading] = useState(false);

  useEffect(() => {
    const queryProjectId = searchParams.get("project_id");
    if (queryProjectId && queryProjectId !== selectedProject) {
      setSelectedProject(queryProjectId);
    }
  }, [searchParams, selectedProject, setSelectedProject]);

  const loadProjectShortage = useCallback(async (projectId: string) => {
    if (!projectId) {
      setBomRows([]);
      setBopSteps([]);
      setHasChecked(false);
      return;
    }
    setIsChecking(true);
    try {
      const [res, bopRes] = await Promise.all([
        apiFetch(`/api/projects/${projectId}/shortage-analysis`, {}, user?.username),
        apiFetch(`/api/production/project/${projectId}/bop-steps`, {}, user?.username)
      ]);
      
      if (bopRes.ok && Array.isArray(bopRes.data)) {
        setBopSteps(bopRes.data);
      } else {
        setBopSteps([]);
      }

      if (res.ok && Array.isArray(res.data)) {
        const mappedRows = res.data.map((b: any) => ({
          id: b.bom_id || b.item_id,
          item_id: b.item_id,
          item_code: b.item_code,
          name: b.item_name || b.name,
          dimension: b.dimension,
          spec: b.spec,
          qty: (b.required_qty ?? 0).toString(),
          uom: b.uom || "Unit",
          unit_price: (b.unit_price || 0).toString(),
          expected_date: b.expected_date || b.planned_delivery_date || "",
          shortage_qty: b.shortage ?? 0,
          free_stock: b.free_stock ?? 0,
          allocated_stock: b.allocated ?? 0,
          qty_to_order: b.shortage ?? 0,
          fraction_allocated: b.fraction_allocated || 0,
          lead_time_days: b.lead_time_days || 7,
          plan_code: b.plan_code || null,
          planned_wave_number: b.planned_wave_number || null,
          planned_wave_name: b.planned_wave_name || null,
          bop_process_name: b.bop_process_name || b.station_name || null,
          production_need_date: b.production_need_date || null,
          planned_delivery_date: b.planned_delivery_date || null,
          planned_order_date: b.planned_order_date || null,
          ordered_pr_qty: b.ordered || 0,
          pr_numbers: b.pr_numbers || null,
        }));
        setBomRows(mappedRows);
        if (mappedRows.some((r: any) => r.plan_code || r.expected_date)) {
          setHasChecked(true);
        }
      } else {
        setBomRows([]);
      }
    } catch (err) {
      console.error(err);
      setBomRows([]);
    } finally {
      setIsChecking(false);
    }
  }, [user?.username, setBomRows]);

  useEffect(() => {
    if (selectedProject) {
      loadProjectShortage(selectedProject);
    } else {
      setBomRows([]);
      setHasChecked(false);
    }
  }, [selectedProject, loadProjectShortage, setBomRows]);

  const handleCheckStock = useCallback(async () => {
    if (!selectedProject) {
      showToast("Please select a project first.", "error");
      return;
    }
    setIsChecking(true);
    await loadProjectShortage(selectedProject);
    setHasChecked(true);
    setIsChecking(false);
    showToast("Project stock check completed", "success");
  }, [selectedProject, loadProjectShortage, showToast]);

  const handleSubmitPr = async () => {
    setIsSubmitting(true);
    try {
      if (revisingPr) {
        // Revision Mode
        const customItems = bomRows
          .filter(
            (r) =>
              ((r as any).qty_to_order !== undefined
                ? (r as any).qty_to_order
                : r.shortage_qty || 0) > 0,
          )
          .map((r) => ({
            id: r.id,
            item_id: r.item_id,
            dimension: (r as any).dimension,
            spec: (r as any).spec,
            unit_price: (r as any).unit_price,
            qty_to_order:
              (r as any).qty_to_order !== undefined
                ? (r as any).qty_to_order
                : r.shortage_qty || 0,
            expected_delivery_date: (r as any).expected_date,
          }));

        if (
          customItems.length > 0 &&
          customItems.some((item) => !item.expected_delivery_date)
        ) {
          showToast("Please specify an expected delivery date for all items.", "error");
          setIsSubmitting(false);
          return;
        }

        const payload = {
          urgency,
          expected_delivery_date:
            (bomRows[0] as any)?.expected_date ||
            revisingPr.expected_delivery_date,
          remarks: drawingReference,
          items: customItems,
        };
        const res = await apiFetch(
          `/api/purchasing/pr/${revisingPr.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
          user?.username,
        );

        if (res.ok) {
          showToast(`PR Revised successfully`, "success");
          setShowPrModal(false);
          setRevisingPr(null);
          clearBomDraft();
          fetchPrs();
        } else {
          showToast(res.error || "Failed to revise PR", "error");
        }
      } else {
        // Direct Project PR Generation Mode
        if (!selectedProject) {
          showToast("Please select a project.", "error");
          setIsSubmitting(false);
          return;
        }

        const customItems = bomRows
          .filter(
            (r) =>
              ((r as any).qty_to_order !== undefined
                ? (r as any).qty_to_order
                : r.shortage_qty || 0) > 0,
          )
          .map((r) => ({
            item_id: r.item_id,
            dimension: (r as any).dimension,
            spec: (r as any).spec,
            unit_price: (r as any).unit_price,
            qty_to_order:
              (r as any).qty_to_order !== undefined
                ? (r as any).qty_to_order
                : r.shortage_qty || 0,
            expected_delivery_date: (r as any).expected_date,
          }));

        // Validate all items have delivery date
        if (
          customItems.length > 0 &&
          customItems.some((item) => !item.expected_delivery_date)
        ) {
          showToast("Please specify an expected delivery date for all items.", "error");
          setIsSubmitting(false);
          return;
        }

        const itemExpectedDates: Record<string, string> = {};
        customItems.forEach((it) => {
          if (it.item_id && it.expected_delivery_date) {
            itemExpectedDates[it.item_id] = it.expected_delivery_date;
          }
        });

        const payload = {
          expected_delivery_date:
            (bomRows[0] as any)?.expected_date ||
            new Date().toISOString().split("T")[0],
          drawing_reference: drawingReference,
          items: customItems,
          item_expected_dates: itemExpectedDates,
          urgency,
          category: "PROJECT",
        };

        const res = await apiFetch(
          `/api/projects/${selectedProject}/generate-prs`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          user?.username,
        );
        if (res.ok) {
          const data = res.data;
          showToast(
            data && data.pr_created
              ? `PR Created: ${data.pr_number}`
              : "No PR needed (Stock fulfilled)",
            "success",
          );
          setShowPrModal(false);
          fetchPrs();
          fetchProjects();
          clearSelectedProject();
          clearDrawingReference();
          clearBomDraft();
          setHasChecked(false);
          if (data && data.pr_created && data.pr_id) {
            handleViewPr(data.pr_id);
          }
        } else {
          showToast(res.error || "Failed to generate PR", "error");
        }
      }
    } catch (err) {
      console.error(err);
      showToast(
        revisingPr ? "Failed to revise PR" : "Failed to generate PR",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAuthorizePr = async (pin: string) => {
    setIsSubmitting(true);
    try {
      const digitalSignature = `Digitally Authorized by ${user?.name || user?.username} (${user?.role}) on ${new Date().toISOString()}`;
      const res = await apiFetch(
        "/api/purchasing/authorize-pr",
        {
          method: "POST",
          body: JSON.stringify({
            pr_id: selectedPrToAuth.id,
            authorized_doc: digitalSignature,
            pin,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowAuthorizeModal(false);
        setAuthPin("");
        // Optimistic UI Update
        setPrs((prev) =>
          prev.map((pr) =>
            pr.id === selectedPrToAuth.id
              ? { ...pr, status: "AUTHORIZED", auth_doc: digitalSignature }
              : pr,
          ),
        );
        showToast("PR digitally authorized successfully", "success");
      } else {
        showToast(res.error || "Failed to authorize PR", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error authorizing PR", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevisePr = async (note: string) => {
    if (!note.trim()) {
      showToast("Validation Failed: Revision note is required.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/revise-pr",
        {
          method: "POST",
          body: JSON.stringify({
            pr_id: selectedPrToAuth.id,
            revision_note: note,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowReviseModal(false);
        setRevisionNote("");
        fetchPrs();
        showToast("PR marked for revision", "success");
      } else {
        showToast(res.error || "Failed to mark PR for revision", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error revising PR", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelPr = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Cancel Purchase Request?",
      message:
        "Are you sure you want to cancel this PR? This will revert items inside to unauthorized state.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/purchasing/pr/${id}/cancel`,
            {
              method: "POST",
            },
            user?.username,
          );
          if (res.ok) {
            fetchPrs();
            showToast("PR cancelled successfully", "success");
          } else {
            showToast(res.error || "Failed to cancel PR", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error cancelling PR", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleDeletePr = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Purchase Request?",
      message:
        "Are you sure you want to delete this PR? This will permanently remove it from the system.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/purchasing/pr/${id}`,
            {
              method: "DELETE",
            },
            user?.username,
          );
          if (res.ok) {
            fetchPrs();
            showToast("PR deleted successfully", "success");
          } else {
            showToast(res.error || "Failed to delete PR", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error deleting PR", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleArchiveFinishedPrs = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Archive Finished Purchase Requests?",
      message:
        "This will archive all ORDERED and CANCELLED Purchase Requests from your active queue. Archived items remain safely stored in the database for comprehensive audits.",
      action: async () => {
        try {
          const res = await apiFetch(
            "/api/purchasing/clear-prs",
            {
              method: "POST",
            },
            user?.username,
          );
          if (res.ok) {
            fetchPrs();
            showToast(
              "Requests successfully archived and removed from active view.",
              "success",
            );
          } else {
            showToast(res.error || "Failed to archive requests", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error archiving requests", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleExportPDF = async () => {
    if (!printRef.current) return;

    setIsSubmitting(true);
    try {
      const fileName = previewPrData
        ? `PR_${previewPrData.pr_number}.pdf`
        : "Document.pdf";
      await generatePDF(printRef.current, fileName);
    } catch (error) {
      console.error("PDF Generation failed", error);
      showToast("Failed to generate PDF. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewPr = async (prId: string) => {
    try {
      const res = await apiFetch(
        `/api/purchasing/pr/${prId}`,
        {},
        user?.username,
      );
      if (res.ok) {
        const data = res.data;
        setPreviewPrData({
          id: data.id,
          pr_number: data.pr_number,
          project_id: data.project_id,
          project_name: data.project_name,
          drawing_reference: data.drawing_reference,
          created_at: data.created_at,
          status: data.status,
          authorized_doc: data.authorized_doc,
          created_by: data.created_by,
          urgency: data.urgency,
          expected_delivery_date: data.expected_delivery_date,
          items: data.items.map((item: any) => ({
            item_code: item.item_code,
            name: item.item_name,
            dimension: item.dimension,
            spec: item.spec,
            shortage_qty: item.qty, // Fixed from qty_requested to qty
            uom: item.uom,
            unit_price: item.unit_price,
            expected_delivery_date: item.expected_delivery_date || data.expected_delivery_date || "",
          })),
        });
        setShowPreviewModal(true);
      } else {
        showToast(res.error || "Failed to view PR", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error viewing PR", "error");
    }
  };

  const handleRevisePrSetup = async (prId: string) => {
    try {
      const res = await apiFetch(
        `/api/purchasing/pr/${prId}`,
        {},
        user?.username,
      );
      if (res.ok) {
        const data = res.data;
        setRevisingPr(data);
        setUrgency(data.urgency);
        setBomRows(
          data.items.map((item: any) => ({
            id: item.id || Math.random().toString(),
            item_id: item.item_id,
            item_code: item.item_code,
            name: item.item_name,
            dimension: item.dimension,
            spec: item.spec,
            uom: item.uom,
            shortage_qty: Number(item.qty),
            qty_to_order: Number(item.qty),
            expected_date:
              item.expected_delivery_date || data.expected_delivery_date || "",
          })),
        );
        setShowPrModal(true);
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to fetch PR details for revision", "error");
    }
  };

  const filteredPrs = React.useMemo(() => {
    return prs.filter(
      (pr) =>
        pr.pr_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pr.project_name.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [prs, searchQuery]);


  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Design Requests"
        subtitle="Engineering material requisitions"
        icon={<Compass className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="amber_soft"
              size="xs"
              onClick={handleArchiveFinishedPrs}
              leftIcon={<Archive className="w-3.5 h-3.5" />}
              title="Archive Finished Requests"
            >
              Archive Finished
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={fetchPrs}
              title="Refresh Requests"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Panel: Purchase Requests Queue (5/12) */}
        <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl overflow-hidden min-w-0">
          <div className="p-3.5 border-b border-stone-200 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Requisition Queue
              </h3>
              <span className="text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-mono font-bold tabular-nums border border-stone-200">
                {filteredPrs.length}
              </span>
            </div>
            <div className="w-48 sm:w-56">
              <Input
                type="text"
                placeholder="Search PR or project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-3.5 h-3.5" />}
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>PR &amp; Project</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty colSpan={3} message="Loading requisitions..." />
              ) : filteredPrs.length === 0 ? (
                <TableEmpty colSpan={3} message="No active requisitions found." />
              ) : (
                filteredPrs.map((pr) => {
                  const isCancelled = pr.status === "CANCELLED";
                  return (
                    <TableRow
                      key={pr.id}
                      className={cn(
                        "cursor-pointer",
                        isCancelled && "opacity-60"
                      )}
                      onClick={() => handleViewPr(pr.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              "text-xs font-mono tabular-nums font-bold",
                              isCancelled
                                ? "line-through text-stone-400"
                                : "text-stone-900"
                            )}
                          >
                            {pr.pr_number}
                          </span>
                          <Badge
                            variant={
                              pr.status === "AUTHORIZED" ||
                              pr.status === "RECEIVED"
                                ? "success"
                                : pr.status === "REVISION"
                                  ? "danger"
                                  : pr.status === "PARTIAL"
                                    ? "warning"
                                    : pr.status === "PARTIAL_ORDERED"
                                      ? "info"
                                      : "neutral"
                            }
                          >
                            {pr.status}
                          </Badge>
                          {(pr.urgency === "URGENT" ||
                            pr.urgency === "CRITICAL") && (
                            <Badge
                              variant={
                                pr.urgency === "CRITICAL" ? "danger" : "warning"
                              }
                            >
                              {pr.urgency}
                            </Badge>
                          )}
                          {(pr as any).procurement_plan_code && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono text-[10px] font-bold">
                              <Layers className="w-2.5 h-2.5" />
                              {(pr as any).procurement_plan_code}
                              {(pr as any).procurement_plan_waves_count
                                ? ` (${(pr as any).procurement_plan_waves_count}W)`
                                : ""}
                            </span>
                          )}
                        </div>
                        <div
                          className="text-[11px] text-stone-500 mt-1 truncate max-w-[200px]"
                          title={pr.project_name}
                        >
                          {pr.spk_number ? `${pr.spk_number} · ` : ""}
                          {pr.project_name}
                        </div>
                        {pr.status === "REVISION" && pr.revision_note && (
                          <div className="mt-1 text-[10px] text-rose-700 italic truncate max-w-[220px]">
                            Note: &ldquo;{pr.revision_note}&rdquo;
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs text-stone-700 whitespace-nowrap">
                        {pr.item_count} item(s)
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1 items-center shrink-0">
                          {(pr as any).procurement_plan_code && pr.project_id && (
                            <Link
                              to={`/procurement?project_id=${encodeURIComponent(pr.project_id)}&tab=PROCUREMENT_PLAN`}
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold border transition-colors",
                                pr.status === "REVISION"
                                  ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                                  : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100",
                              )}
                              title="Open this PR's Procurement Wave Strategy to inspect or revise waves"
                            >
                              <Layers className="w-3 h-3" />
                              <span>
                                {pr.status === "REVISION"
                                  ? "Revise Wave"
                                  : "Wave Plan"}
                              </span>
                            </Link>
                          )}
                          <Button
                            size="xs"
                            action="view"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewPr(pr.id);
                            }}
                          />
                          {pr.status === "DRAFTED" &&
                            (hasPermission(user, Action.AUTH_PR) ||
                              pr.escalated_to === user?.role) && (
                              <>
                                <Button
                                  size="xs"
                                  action="authorize"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPrToAuth(pr);
                                    setShowAuthorizeModal(true);
                                  }}
                                />
                                <Button
                                  size="xs"
                                  action="revise"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPrToAuth(pr);
                                    setShowReviseModal(true);
                                  }}
                                />
                              </>
                            )}
                          {pr.status === "REVISION" &&
                            !(pr as any).procurement_plan_code &&
                            (hasPermission(
                              user,
                              Action.CREATE_PR_ENGINEERING
                            ) ||
                              hasPermission(
                                user,
                                Action.CREATE_PR_PRODUCTION
                              )) && (
                              <Button
                                size="xs"
                                action="revise"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRevisePrSetup(pr.id);
                                }}
                              />
                            )}
                          {(pr.status === "DRAFTED" ||
                            pr.status === "AUTHORIZED") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelPr(pr.id);
                              }}
                              className="text-stone-400 hover:text-rose-500 hover:bg-rose-50"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {(pr.status === "CANCELLED" ||
                            pr.status === "DRAFTED") && (
                            <Button
                              variant="danger_soft"
                              size="icon-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePr(pr.id);
                              }}
                              title="Delete Purchase Request"
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
        </div>

        {/* Right Panel: Project Material Requisition Generator (7/12) */}
        <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl overflow-hidden min-w-0">
          <div className="p-4 border-b border-stone-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                  New Material Requisition
                </h3>
                <p className="text-[11px] text-stone-500">
                  Select an authorized project BOM to validate stock coverage and issue net shortage PRs
                </p>
              </div>
              <div className="flex items-center gap-2">
                {bomRows.length > 0 && (
                  <span className="text-xs font-mono text-stone-600 tabular-nums">
                    {bomRows.length} BOM Item(s)
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-7">
                <Select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                >
                  <option value="">-- Select Manufacturing Project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {`[${p.spk_number || p.id}] ${p.name} (BOM: ${
                        p.bom_status || "DRAFT"
                      })`}
                    </option>
                  ))}
                </Select>
              </div>

              {(() => {
                const currentProject = projects.find(
                  (p) => p.id === selectedProject
                );
                if (!currentProject) return null;
                return (
                  <div className="sm:col-span-5 flex flex-wrap items-center justify-end gap-2 text-xs font-mono">
                    <span className="px-2 py-1 rounded bg-stone-100 border border-stone-200 text-stone-800 font-semibold">
                      Qty: {currentProject.qty || 1}{" "}
                      {currentProject.uom || "PCS"}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-1 rounded border font-semibold",
                        currentProject.bom_status === "AUTHORIZED"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-amber-50 border-amber-200 text-amber-800"
                      )}
                    >
                      BOM: {currentProject.bom_status || "DRAFT"}
                    </span>
                  </div>
                );
              })()}
            </div>

            {(() => {
              const syncedRows = bomRows.filter((r: any) => r.plan_code);
              if (syncedRows.length === 0) return null;
              const activePlanCode = (syncedRows[0] as any).plan_code;
              const waveCount = new Set(
                syncedRows.map((r: any) => r.planned_wave_number).filter(Boolean)
              ).size;
              return (
                <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        Synced with Procurement Plan{" "}
                        <span className="font-mono">{activePlanCode}</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px]">
                        {syncedRows.length} items · {waveCount || 1} wave(s)
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800">
                      Target Delivery Dates (<span className="font-mono">expected_delivery_date</span>) are pre-populated from backward-scheduled BOP process start dates for PR → PO execution.
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>

          {bomRows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow hoverable={false}>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Material &amp; Specification</TableHead>
                  <TableHead className="text-right">Project Qty</TableHead>
                  <TableHead>Warehouse Stock</TableHead>
                  <TableHead className="text-right">Net Shortage</TableHead>
                  <TableHead className="text-right">Target Delivery (PR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bomRows.map((row, index) => {
                  const isShortage = (row.shortage_qty || 0) > 0;
                  const orderedPrQty = Number((row as any).ordered_pr_qty || 0);
                  const plannedWaveNum = (row as any).planned_wave_number;
                  const bopProcessName = (row as any).bop_process_name;
                  const prodNeedDate = (row as any).production_need_date;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-center font-mono text-xs text-stone-500 tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono font-bold text-stone-900 text-xs">
                          {row.item_code}
                        </div>
                        <div className="text-xs text-stone-700 font-medium truncate max-w-[220px]">
                          {row.name}
                        </div>
                        {(row as any).spec && (
                          <div className="text-[11px] text-stone-500 truncate max-w-[220px]">
                            {(row as any).spec}
                          </div>
                        )}
                        {bopProcessName && (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-[10px] font-mono text-stone-700">
                            {plannedWaveNum ? `W${plannedWaveNum} · ` : ""}
                            {bopProcessName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-stone-900">
                        {Number(row.qty || 0).toLocaleString("en-US")}{" "}
                        <span className="text-[10px] text-stone-500 font-normal">
                          {row.uom}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {hasChecked ? (
                          <div className="space-y-0.5 font-mono text-[11px] tabular-nums">
                            <div className="text-stone-700">
                              Free: <strong>{row.free_stock || 0}</strong> ·
                              Alloc:{" "}
                              <strong>{(row as any).allocated_stock || 0}</strong>
                            </div>
                            {orderedPrQty > 0 && (
                              <div className="text-indigo-700 font-semibold">
                                PR Active: {orderedPrQty} {row.uom}
                                {(row as any).pr_numbers
                                  ? ` (${(row as any).pr_numbers})`
                                  : ""}
                              </div>
                            )}
                            {!isShortage ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-sans font-semibold">
                                <CheckCircle2 className="w-3 h-3" />{" "}
                                {orderedPrQty > 0 ? "In Active PR" : "Covered"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700 font-sans font-semibold">
                                <AlertTriangle className="w-3 h-3" /> Requires PR
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-stone-400">
                            <Clock className="w-3 h-3" /> Not validated
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-xs">
                        <span
                          className={cn(
                            "font-bold",
                            isShortage ? "text-rose-700" : "text-emerald-700"
                          )}
                        >
                          {Number(row.shortage_qty || 0).toLocaleString("en-US")}{" "}
                          {row.uom}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {isShortage && hasChecked ? (
                          <div className="flex flex-col items-end gap-1">
                            <input
                              type="date"
                              value={(row as any).expected_date || ""}
                              onChange={(e) => {
                                const updated = [...bomRows];
                                (updated[index] as any).expected_date =
                                  e.target.value;
                                setBomRows(updated);
                              }}
                              className="bg-white border border-stone-300 rounded px-2 py-1 text-xs font-mono text-stone-900"
                            />
                            {prodNeedDate && (
                              <span className="text-[10px] font-mono text-stone-500 tabular-nums">
                                Prod Start: {prodNeedDate}
                              </span>
                            )}
                          </div>
                        ) : (row as any).expected_date ? (
                          <div className="flex flex-col items-end gap-0.5 font-mono tabular-nums">
                            <span className="text-xs font-bold text-stone-800">
                              {(row as any).expected_date}
                            </span>
                            {prodNeedDate && (
                              <span className="text-[10px] text-stone-500">
                                Prod Start: {prodNeedDate}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-mono text-stone-400">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center space-y-2">
              <ClipboardList className="w-7 h-7 text-stone-300 mx-auto" />
              <div className="text-xs font-bold text-stone-800">
                {selectedProject
                  ? projects.find((p) => p.id === selectedProject)
                      ?.bom_status !== "AUTHORIZED"
                    ? "Project BOM Not Authorized"
                    : "No Active BOM Items Found"
                  : "No Project Selected"}
              </div>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                {selectedProject
                  ? projects.find((p) => p.id === selectedProject)
                      ?.bom_status !== "AUTHORIZED"
                    ? "Project BOM requires technical authorization before material requisitions can be issued."
                    : "This project does not have any BOM material lines."
                  : "Choose a manufacturing project above to load its Bill of Materials and validate stock."}
              </p>
            </div>
          )}

          <div className="p-4 border-t border-stone-200 bg-stone-50/70 flex items-center justify-end gap-2.5">
            <Button
              variant="outline"
              size="xs"
              onClick={handleCheckStock}
              disabled={isChecking || !selectedProject || bomRows.length === 0}
              isLoading={isChecking}
              leftIcon={
                !isChecking ? <Search className="w-3.5 h-3.5" /> : undefined
              }
            >
              {isChecking ? "Validating..." : "Validate Stock"}
            </Button>
            <Button
              variant="primary"
              size="xs"
              onClick={() => setShowPrModal(true)}
              disabled={
                bomRows.length === 0 ||
                (!hasChecked && !bomRows.some((r: any) => r.is_custom))
              }
            >
              Generate PR Document
            </Button>
          </div>
        </div>
      </div>

      {/* Authorize Modal */}
      <AuthorizeDocModal
        isOpen={showAuthorizeModal && !!selectedPrToAuth}
        onClose={() => setShowAuthorizeModal(false)}
        docType="Purchase Request"
        docNumber={selectedPrToAuth?.pr_number || ""}
        status={selectedPrToAuth?.status || "DRAFT"}
        projectName={selectedPrToAuth?.project_name}
        isSubmitting={isSubmitting}
        onAuthorize={handleAuthorizePr}
      />

      {/* Revise Modal */}
      <ReviseDocModal
        isOpen={showReviseModal && !!selectedPrToAuth}
        onClose={() => setShowReviseModal(false)}
        docType="Purchase Request"
        docNumber={selectedPrToAuth?.pr_number || ""}
        status={selectedPrToAuth?.status || "DRAFT"}
        projectName={selectedPrToAuth?.project_name}
        isSubmitting={isSubmitting}
        onRevise={handleRevisePr}
      />

      {/* Preview Modal */}
      <Modal
        isOpen={showPreviewModal && !!previewPrData}
        onClose={() => setShowPreviewModal(false)}
        title="Purchase Request Document"
        maxWidth="6xl"
        contentClassName="p-0 flex flex-col min-h-0 bg-stone-100"
        footer={
          previewPrData ? (
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
                onClick={() => handleExportPDF()}
                isLoading={isSubmitting}
                leftIcon={!isSubmitting ? <Download className="w-4 h-4" /> : undefined}
              >
                {isSubmitting ? "Generating..." : "Export PDF (A4)"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {previewPrData && (
          <div className="flex-1 min-h-0 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
              <PdfPreviewWrapper>
<PrintTemplate
                ref={printRef}
                documentTitleId="PURCHASE REQUEST"
                documentTitleEn="PURCHASE REQUEST"
                documentNameId="purchase request"
                documentNameEn="purchase request"
                date={
                  previewPrData.created_at
                    ? new Date(previewPrData.created_at).toLocaleDateString(
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
                referenceNumber={previewPrData.pr_number}
                documentId={previewPrData.pr_number || previewPrData.id}
                isDraft={previewPrData.status === "DRAFTED"}
              >
                {/* Redesigned PR Document Content matching Quotation style */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2">
                      Project Assignment
                    </div>
                    <div className="text-xl font-black text-stone-900 uppercase flex items-center gap-2">
                      {previewPrData.category && previewPrData.category !== 'PROJECT' && (
                        <span className="px-2.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 rounded-md border border-amber-200 font-bold uppercase">{previewPrData.category}</span>
                      )}
                      {previewPrData.project_name}
                    </div>
                    <div className="text-xs text-stone-600 mt-2 font-bold">
                      Corporate Project Intake • Material Request
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2">
                      Document References
                    </div>
                    <div className="text-base font-black text-stone-900 font-mono">
                      Ref: {previewPrData.project_id && !["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(previewPrData.project_id) ? previewPrData.project_id : previewPrData.project_name}
                    </div>
                    {previewPrData.spk_number && (
                      <div className="text-xs font-bold text-stone-800 font-mono mt-0.5">
                        WO: {previewPrData.spk_number}
                      </div>
                    )}
                    {previewPrData.urgency && previewPrData.urgency !== "NORMAL" && (
                      <div className="text-xs font-extrabold text-rose-600 uppercase tracking-wider mt-1">
                        {previewPrData.urgency} PRIORITY REQUEST
                      </div>
                    )}
                  </div>
                </div>

                {/* Drawing / Specification Reference Area */}
                <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200">
                  <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-1">
                    Specification & Reference Drawing
                  </div>
                  <div className="text-sm font-black text-stone-900 tracking-tight leading-tight uppercase">
                    <span className="text-stone-500 font-normal text-xs mr-2">
                      Reference Drawing:
                    </span>
                    <span className="font-mono text-stone-900">
                      {previewPrData.drawing_reference &&
                      previewPrData.drawing_reference !== "Terlampir dalam sistem" &&
                      previewPrData.drawing_reference !== "TERLAMPIR DALAM SISTEM" ? (
                        previewPrData.drawing_reference
                      ) : (
                        <span>
                          Attached in System
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Material Items Table */}
                <div className="flex-1 w-full">
                  <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-3 ml-1">
                    Requested Material Specifications
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-stone-300 bg-white">
                        <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-xs">
                          Item Code & Description
                        </th>
                        <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-28">
                          Quantity
                        </th>
                        <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-24">
                          UOM
                        </th>
                        <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-36">
                          Expected Delivery
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-150">
                      {previewPrData.items &&
                        previewPrData.items.map((row: any, i: number) => (
                          <tr key={i}>
                            <td className="py-4 px-3">
                              <div className="font-mono font-bold text-stone-900 text-xs">
                                {row.item_code}
                              </div>
                              <div className="text-sm font-black text-stone-900 uppercase tracking-tight mt-0.5">
                                {row.name}
                              </div>
                              {(row.dimension || row.spec) && (
                                <div className="text-[10px] text-stone-500 mt-0.5 font-medium">
                                  {[row.dimension, row.spec]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                              {Number(row.shortage_qty) || 0}
                            </td>
                            <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">
                              {row.uom}
                            </td>
                            <td className="py-4 px-3 text-center text-stone-700 font-mono text-xs whitespace-nowrap">
                              {(() => {
                                const rawDate =
                                  row.expected_delivery_date ||
                                  row.expected_date ||
                                  previewPrData.expected_delivery_date;
                                if (!rawDate) return "-";
                                try {
                                  const d = new Date(rawDate);
                                  if (isNaN(d.getTime())) return rawDate;
                                  return d.toLocaleDateString("en-US", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  });
                                } catch {
                                  return rawDate;
                                }
                              })()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Authorized Signatures for PR */}
                <div className="mt-8 pt-6 border-t border-stone-200 grid grid-cols-2 gap-8 text-center">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-1">
                      Requested By
                    </div>
                    <div className="text-[10px] text-stone-500 uppercase font-bold mb-3">Production Team</div>
                    <div className="h-14 flex items-center justify-center">
                      <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">
                        <QrCode className="w-6 h-6 text-emerald-600" />
                        <div className="text-left">
                          <div className="text-[9px] font-black text-emerald-800 uppercase">Validated Production</div>
                          <div className="text-[8px] font-mono text-emerald-700">{new Date(previewPrData.created_at || Date.now()).toLocaleDateString("en-US")}</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                      Production Supervisor
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-1">
                      Approved By
                    </div>
                    <div className="text-[10px] text-stone-500 uppercase font-bold mb-3">Production Manager</div>
                    <div className="h-14 flex items-center justify-center">
                      {previewPrData.status === "AUTHORIZED" ||
                      previewPrData.status === "PARTIAL_ORDERED" ||
                      previewPrData.status === "ORDERED" ||
                      !!previewPrData.authorized_doc ? (
                        <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">
                          <QrCode className="w-6 h-6 text-emerald-600" />
                          <div className="text-left">
                            <div className="text-[9px] font-black text-emerald-800 uppercase">Digitally Authorized</div>
                            <div className="text-[8px] font-mono text-emerald-700">Validated Securely</div>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-dashed border-stone-300 rounded-lg px-4 py-2 bg-stone-50">
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Awaiting PIN Authorization</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                      Production Manager
                    </div>
                  </div>
                </div>
              </PrintTemplate>
</PdfPreviewWrapper>
            </div>
        )}
      </Modal>

      <PrShortagePreviewModal
        isOpen={showPrModal}
        onClose={() => {
          setShowPrModal(false);
          setRevisingPr(null);
        }}
        revisingPr={revisingPr}
        bomRows={bomRows}
        setBomRows={setBomRows}
        urgency={urgency}
        setUrgency={setUrgency}
        onSubmitPr={handleSubmitPr}
        isSubmitting={isSubmitting}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
