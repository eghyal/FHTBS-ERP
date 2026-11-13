import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { useEscapeKey, formatIDR } from "@/lib/utils";
import { FileText, ShoppingCart, Layers, ArrowRight } from "lucide-react";
import { generatePDF } from "@/lib/pdfGenerator";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { useShare } from "@/contexts/ShareContext";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { Action, hasPermission } from "@/utils/pbac";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ReviseDocModal } from "@/components/erp/ReviseDocModal";
import { SendEmailModal } from "@/components/erp/SendEmailModal";
import { PoDocumentModal } from "@/components/erp/procurement/PoDocumentModal";
import { PrDetailsModal } from "@/components/erp/procurement/PrDetailsModal";
import { CreatePoModal } from "@/components/erp/procurement/CreatePoModal";
import { GrnModal } from "@/components/erp/procurement/GrnModal";
import { ReissueGrnModal } from "@/components/erp/procurement/ReissueGrnModal";
import { GrnReportModal } from "@/components/erp/procurement/GrnReportModal";
import { PendingPrQueuePanel } from "@/components/erp/procurement/PendingPrPanel";
import {
  ActivePoQueuePanel,
  type ActivePOItem,
} from "@/components/erp/procurement/ActivePoPanel";
import {
  ProcurementTopBanners,
  buildPoEmailBody,
  dispatchPoEmailClient,
} from "@/components/erp/procurement/ProcurementBannersAndEmail";
import { getDailyAuthKey } from "@/utils/auth";
import { TaxScheme } from "@/lib/financialEngine";

interface PendingPR {
  pr_item_id: string;
  pr_id: string;
  item_id: string;
  pr_number: string;
  project_id: string;
  project_name: string;
  item_code: string;
  item_name: string;
  item_type: string;
  dimension: string;
  spec: string;
  qty: number;
  uom: string;
  unit_price: number | null;
  created_at: string;
  expected_delivery_date?: string;
  drawing_reference?: string;
  status: string;
  urgency?: "NORMAL" | "URGENT" | "CRITICAL";
}

const getSupplierTotalAndPrices = (supplier: any, selectedItems: any[]) => {
  let total = 0;
  const breakdown: { [itemId: string]: number } = {};

  supplier.item_prices?.forEach((ip: any) => {
    breakdown[ip.item_id] = ip.unit_price;
  });

  selectedItems.forEach((p) => {
    const price = breakdown[p.item_id] ?? p.unit_price ?? 0;
    total += p.qty * price;
  });

  return { total, breakdown };
};

export default function Procurement() {
  const [pendingPrs, setPendingPrs] = useState<PendingPR[]>([]);
  const [pos, setPos] = useState<ActivePOItem[]>([]);
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const { shareToForum } = useShare();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPrItems, setSelectedPrItems] = useState<Set<string>>(
    new Set()
  );

  const selectablePrs = useMemo(
    () => pendingPrs.filter((p) => p.status !== "CANCELLED"),
    [pendingPrs]
  );
  const selectedItemsDetails = useMemo(
    () => pendingPrs.filter((p) => selectedPrItems.has(p.pr_item_id)),
    [pendingPrs, selectedPrItems]
  );

  const [validSuppliers, setValidSuppliers] = useState<any[]>([]);
  const [isFetchingSuppliers, setIsFetchingSuppliers] = useState(false);
  const navigate = useNavigate();

  const highVolumeProjectIndications = useMemo(() => {
    const grouped = new Map<
      string,
      {
        project_id: string;
        project_name: string;
        item_count: number;
        total_qty: number;
        total_cost: number;
      }
    >();

    selectablePrs.forEach((pr) => {
      const pid = pr.project_id || "GENERAL";
      const existing = grouped.get(pid) || {
        project_id: pid,
        project_name: pr.project_name || pid,
        item_count: 0,
        total_qty: 0,
        total_cost: 0,
      };
      existing.item_count += 1;
      existing.total_qty += Number(pr.qty || 0);
      existing.total_cost += Number(pr.qty || 0) * Number(pr.unit_price || 0);
      grouped.set(pid, existing);
    });

    return Array.from(grouped.values()).filter((g) => g.item_count >= 1);
  }, [selectablePrs]);

  const sortedSuppliers = useMemo(() => {
    const selectedItems = selectedItemsDetails;
    const totalItemsInBatch = new Set(selectedItems.map((p) => p.item_id)).size;
    const globalEstimatedCost = selectedItems.reduce(
      (sum, p) => sum + p.qty * (p.unit_price || 0),
      0
    );

    const scored = validSuppliers.map((supplier) => {
      const { total, breakdown } = getSupplierTotalAndPrices(
        supplier,
        selectedItems
      );

      let fulfilledCount = 0;
      selectedItems.forEach((p) => {
        if (breakdown[p.item_id] !== undefined && breakdown[p.item_id] > 0) {
          fulfilledCount++;
        }
      });

      const matchPercent =
        totalItemsInBatch > 0 ? (fulfilledCount / totalItemsInBatch) * 100 : 0;

      const totalPast = supplier.total_orders || 0;
      const passedPast = supplier.passed_count || 0;
      const rejectedPast = supplier.rejected_count || 0;

      let deliveryRate = 0.95;
      if (totalPast > 0) {
        const completedGrns = passedPast + rejectedPast;
        if (completedGrns > 0) {
          deliveryRate = passedPast / completedGrns;
        }
      }

      const onTimeScore = Math.round(deliveryRate * 100);
      const proximityKm = Math.floor(
        3 + (supplier.name.charCodeAt(0) % 25) * 3
      );
      const leadTimeDays = Math.floor(1 + (supplier.name.charCodeAt(1) % 4));

      let costRatioModifier = total > 0 ? globalEstimatedCost / total : 1;
      if (costRatioModifier > 1.5) costRatioModifier = 1.5;
      if (costRatioModifier < 0.5) costRatioModifier = 0.5;
      const costSavingsScore = costRatioModifier * 100;

      const compositeScore = Math.round(
        matchPercent * 0.45 +
          costSavingsScore * 0.25 +
          onTimeScore * 0.2 +
          ((80 - proximityKm) / 80) * 100 * 0.1
      );

      return {
        ...supplier,
        total,
        breakdown,
        matchPercent,
        fulfilledCount,
        totalItemsInBatch,
        onTimeScore,
        proximityKm,
        leadTimeDays,
        compositeScore: Math.max(15, Math.min(100, compositeScore)),
      };
    });

    return scored.sort((a, b) => b.compositeScore - a.compositeScore);
  }, [validSuppliers, selectedItemsDetails]);

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

  const [showPoModal, setShowPoModal] = useState(false);
  const [revisingPo, setRevisingPo] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [poForm, setPoForm] = useState({
    supplier_id: "",
    supplier_name: "",
    supplier_npwp: "",
    urgency: "NORMAL" as "NORMAL" | "URGENT" | "CRITICAL",
    tax_category: "GOODS_DPP_LAIN",
    tax_scheme: "DPP_NILAI_LAIN" as TaxScheme,
    ppn_rate: "12",
    pph_rate: "0",
    service_amount: "",
    payment_terms: "Net 30 Days",
    custom_payment_terms: "",
    rounding_factor: 0,
  });

  const handleSelectSupplierInModal = useCallback((rec: any) => {
    const supScheme = (rec.tax_scheme || "DPP_NILAI_LAIN") as TaxScheme;
    let defaultCat = "GOODS_DPP_LAIN";
    let defaultPpn = "12";
    let defaultPph = "0";

    if (supScheme === "NON_PKP") {
      defaultCat = "NON_PKP";
      defaultPpn = "0";
      defaultPph = "0";
    }

    setPoForm((prev) => ({
      ...prev,
      supplier_id: rec.id,
      supplier_name: rec.name,
      supplier_npwp: rec.npwp || prev.supplier_npwp || "",
      tax_scheme: supScheme,
      tax_category: defaultCat,
      ppn_rate: defaultPpn,
      pph_rate: defaultPph,
      payment_terms: rec.payment_terms || prev.payment_terms || "Net 30 Days",
    }));
  }, []);

  const handlePoTaxCategoryChange = useCallback((val: string) => {
    if (val === "GOODS_DPP_LAIN") {
      setPoForm((prev) => ({
        ...prev,
        tax_category: val,
        tax_scheme: "DPP_NILAI_LAIN",
        ppn_rate: "12",
        pph_rate: "0",
      }));
    } else if (val === "SERVICES_DPP_LAIN") {
      setPoForm((prev) => ({
        ...prev,
        tax_category: val,
        tax_scheme: "DPP_NILAI_LAIN",
        ppn_rate: "12",
        pph_rate: "2",
      }));
    } else if (val === "NON_PKP") {
      setPoForm((prev) => ({
        ...prev,
        tax_category: val,
        tax_scheme: "NON_PKP",
        ppn_rate: "0",
        pph_rate: "0",
      }));
    } else {
      setPoForm((prev) => ({
        ...prev,
        tax_category: val,
      }));
    }
  }, []);

  const [selectedPoDetails, setSelectedPoDetails] = useState<any>(null);
  const [showPoDocModal, setShowPoDocModal] = useState(false);
  const [showPrDetailsModal, setShowPrDetailsModal] = useState(false);
  const [selectedPrDetails, setSelectedPrDetails] = useState<any>(null);
  const [showAuthorizePoModal, setShowAuthorizePoModal] = useState(false);
  const [showRevisePoModal, setShowRevisePoModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedDocForEmail, setSelectedDocForEmail] = useState<any>(null);

  const exportPdfRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = useCallback(async () => {
    if (!exportPdfRef.current || !selectedDocForEmail) return;
    try {
      await generatePDF(
        exportPdfRef.current,
        `PO_${selectedDocForEmail.po_number}.pdf`
      );
      showToast(
        "PDF Downloaded. Please attach it to your message.",
        "success"
      );
    } catch (err) {
      console.error(err);
      showToast("Failed to generate PDF", "error");
    }
  }, [selectedDocForEmail, showToast]);

  const [selectedPoToAuth, setSelectedPoToAuth] = useState<any>(null);

  // GRN State
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [grnAuthPin, setGrnAuthPin] = useState("");
  const [grnItems, setGrnItems] = useState<any[]>([]);
  const [grnForm, setGrnForm] = useState({
    received_date: new Date().toISOString().split("T")[0],
    engineering_user: user?.name || user?.username || "Purchasing Team",
    qc_user: user?.name || user?.username || "Purchasing Team",
    qc_status: "PASSED",
    remarks: "",
  });

  // GRN Report State
  const [showGrnReportModal, setShowGrnReportModal] = useState(false);
  const [completedGrnData, setCompletedGrnData] = useState<any>(null);
  const grnReportRef = useRef<HTMLDivElement>(null);

  // Re-issue Rejected GRN State
  const [showReissueGrnModal, setShowReissueGrnModal] = useState(false);
  const [reissueGrnItems, setReissueGrnItems] = useState<any[]>([]);
  const [reissueGrnForm, setReissueGrnForm] = useState({
    received_date: new Date().toISOString().split("T")[0],
    engineering_user: user?.name || user?.username || "Purchasing Team",
    qc_user: user?.name || user?.username || "Purchasing Team",
    qc_status: "PASSED",
    remarks: "",
    rejected_grn_doc: "",
  });

  useEscapeKey(() => {
    setShowPoModal(false);
    setShowPoDocModal(false);
    setShowPrDetailsModal(false);
    setShowAuthorizePoModal(false);
    setShowGrnModal(false);
    setShowGrnReportModal(false);
    setShowReissueGrnModal(false);
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  });

  // Pending Workspace Document Approvals for Purchasing Manager
  const [pendingWorkspaceDocs, setPendingWorkspaceDocs] = useState<any[]>([]);

  const fetchPendingWorkspaceDocs = useCallback(async () => {
    try {
      const res = await apiFetch(
        "/api/workspace-documents/pending-approvals?role=PURCHASING_MANAGER",
        {},
        user?.username
      );
      if (res.ok && Array.isArray(res.data)) {
        setPendingWorkspaceDocs(res.data);
      }
    } catch (err) {
      console.error("Error fetching workspace approvals:", err);
    }
  }, [user?.username]);

  useEffect(() => {
    fetchPendingWorkspaceDocs();
  }, [fetchPendingWorkspaceDocs]);

  const handleApproveWorkspaceDoc = useCallback(
    async (docId: string) => {
      try {
        const res = await apiFetch(
          `/api/workspace-documents/${docId}/approve`,
          { method: "POST" },
          user?.username
        );
        if (res.ok) {
          showToast("Workspace Document Approved.", "success");
          fetchPendingWorkspaceDocs();
        } else {
          showToast(res.error || "Failed to approve document", "error");
        }
      } catch {
        showToast("Error approving document", "error");
      }
    },
    [fetchPendingWorkspaceDocs, showToast, user?.username]
  );

  const handleReviseWorkspaceDoc = useCallback(
    async (docId: string) => {
      const note = window.prompt("Enter revision note for the document creator:");
      if (!note || !note.trim()) return;

      try {
        const res = await apiFetch(
          `/api/workspace-documents/${docId}/revise`,
          {
            method: "POST",
            body: JSON.stringify({ revision_note: note.trim() }),
          },
          user?.username
        );
        if (res.ok) {
          showToast("Revision note submitted successfully.", "success");
          fetchPendingWorkspaceDocs();
        } else {
          showToast(res.error || "Failed to submit revision", "error");
        }
      } catch {
        showToast("Error sending revision note", "error");
      }
    },
    [fetchPendingWorkspaceDocs, showToast, user?.username]
  );

  useEffect(() => {
    const fetchValidSuppliers = async () => {
      if (selectedPrItems.size === 0 || !showPoModal) return;

      setIsFetchingSuppliers(true);
      try {
        const itemIds = Array.from(
          new Set(selectedItemsDetails.map((p) => p.item_id))
        ).join(",");

        const res = await apiFetch(
          `/api/purchasing/suppliers-by-items?item_ids=${itemIds}`,
          {},
          user?.username
        );
        if (res.ok) {
          setValidSuppliers(res.data);
        }
      } catch (err) {
        console.error("Error fetching valid suppliers:", err);
      } finally {
        setIsFetchingSuppliers(false);
      }
    };

    fetchValidSuppliers();
  }, [showPoModal, selectedPrItems.size, selectedItemsDetails, user?.username]);

  const fetchPoDetailsForGrn = useCallback(
    async (poid: string) => {
      try {
        const res = await apiFetch(
          `/api/purchasing/po/${poid}`,
          {},
          user?.username
        );
        if (res.ok) {
          const data = res.data;
          if (!data?.items) return;
          const itemMap = new Map();
          data.items.forEach((item: any) => {
            if (!itemMap.has(item.item_id)) {
              const pending = Math.max(0, item.qty - (item.received_qty || 0));
              itemMap.set(item.item_id, {
                ...item,
                qty: item.qty,
                qty_received: pending,
                received_qty: item.received_qty || 0,
              });
            } else {
              const existing = itemMap.get(item.item_id);
              existing.qty += item.qty;
              const newPending = Math.max(
                0,
                existing.qty - existing.received_qty
              );
              existing.qty_received = newPending;
            }
          });
          setGrnItems(Array.from(itemMap.values()));
          const inspectorName =
            user?.name || user?.username || "Purchasing Team";
          setGrnForm({
            received_date: new Date().toISOString().split("T")[0],
            engineering_user: inspectorName,
            qc_user: inspectorName,
            qc_status: "PASSED",
            remarks: "",
          });
        }
      } catch (err) {
        console.error(err);
        showToast("Failed to fetch PO details", "error");
      }
    },
    [showToast, user?.name, user?.username]
  );

  const fetchPoDetailsForReissue = useCallback(
    async (poid: string) => {
      try {
        const res = await apiFetch(
          `/api/purchasing/po/${poid}`,
          {},
          user?.username
        );
        if (res.ok) {
          const data = res.data;
          if (!data?.items) return;
          const itemMap = new Map();
          data.items.forEach((item: any) => {
            if (!itemMap.has(item.item_id)) {
              itemMap.set(item.item_id, {
                ...item,
                qty: item.qty,
                qty_received: Math.max(
                  0,
                  item.qty - (item.received_qty || 0)
                ),
                received_qty: item.received_qty || 0,
              });
            } else {
              const existing = itemMap.get(item.item_id);
              existing.qty += item.qty;
              existing.qty_received = Math.max(
                0,
                existing.qty - (existing.received_qty || 0)
              );
            }
          });
          setReissueGrnItems(Array.from(itemMap.values()));
          const inspectorName =
            user?.name || user?.username || "Purchasing Team";
          setReissueGrnForm({
            received_date: new Date().toISOString().split("T")[0],
            engineering_user: inspectorName,
            qc_user: inspectorName,
            qc_status: "PASSED",
            remarks: "",
            rejected_grn_doc: "",
          });
        }
      } catch (err) {
        console.error(err);
        showToast("Failed to fetch PO details", "error");
      }
    },
    [showToast, user?.name, user?.username]
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [prsData, posData] = await Promise.all([
        apiFetch("/api/purchasing/pending-prs", {}, user?.username),
        apiFetch("/api/purchasing/pos", {}, user?.username),
      ]);

      const sortedPrs = Array.isArray(prsData.data)
        ? prsData.data.sort((a: any, b: any) => {
            if (!a.expected_delivery_date && !b.expected_delivery_date)
              return 0;
            if (!a.expected_delivery_date) return 1;
            if (!b.expected_delivery_date) return -1;
            return (
              new Date(a.expected_delivery_date).getTime() -
              new Date(b.expected_delivery_date).getTime()
            );
          })
        : [];

      setPendingPrs(sortedPrs);
      setPos(Array.isArray(posData.data) ? posData.data : []);
    } catch (err) {
      console.error("Purchasing: Failed to fetch data", err);
      showToast("Error fetching purchasing data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast, user?.username]);

  const handleCompleteGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (grnAuthPin !== getDailyAuthKey(user?.username)) {
      showToast("Validation Failed: Invalid Authorization PIN.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/complete-grn",
        {
          method: "POST",
          body: JSON.stringify({
            po_id: selectedPoDetails.id,
            ...grnForm,
            items: grnItems,
          }),
        },
        user?.username
      );
      if (res.ok) {
        const data = res.data;
        setShowGrnModal(false);
        setGrnAuthPin("");
        setCompletedGrnData({
          po_number: selectedPoDetails.po_number,
          supplier_name: selectedPoDetails.supplier_name,
          pr_numbers: selectedPoDetails.pr_numbers,
          project_ids: selectedPoDetails.project_ids,
          ...grnForm,
          items: grnItems,
          grn_id: data.grn_id,
          created_at: new Date().toISOString(),
        });
        setShowGrnReportModal(true);
        fetchData();
        showToast(
          "GRN Complete. Item waiting for Warehouse Intake.",
          "success"
        );
      } else {
        showToast(res.error || "Failed to complete GRN", "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReissueGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/complete-grn",
        {
          method: "POST",
          body: JSON.stringify({
            po_id: selectedPoDetails.id,
            received_date: reissueGrnForm.received_date,
            engineering_user: reissueGrnForm.engineering_user,
            qc_user: reissueGrnForm.qc_user,
            qc_status: reissueGrnForm.qc_status,
            remarks: reissueGrnForm.remarks,
            rejected_grn_doc: reissueGrnForm.rejected_grn_doc,
            items: reissueGrnItems,
          }),
        },
        user?.username
      );
      if (res.ok) {
        const data = res.data;
        setShowReissueGrnModal(false);
        setCompletedGrnData({
          po_number: selectedPoDetails.po_number,
          supplier_name: selectedPoDetails.supplier_name,
          pr_numbers: selectedPoDetails.pr_numbers,
          project_ids: selectedPoDetails.project_ids,
          ...reissueGrnForm,
          items: reissueGrnItems,
          grn_id: data.grn_id,
          created_at: new Date().toISOString(),
          is_reissue: true,
        });
        setShowGrnReportModal(true);
        fetchData();
        showToast(
          "Re-issue GRN Complete. Item waiting for Warehouse Intake.",
          "success"
        );
      } else {
        showToast(res.error || "Failed to re-issue GRN", "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportGrnPdf = async () => {
    if (!grnReportRef.current) return;
    setIsSubmitting(true);
    try {
      await generatePDF(
        grnReportRef.current,
        `GRN-${completedGrnData?.grn_id || "Report"}.pdf`
      );
      showToast(
        "Crisp A4 Portrait GRN document exported successfully",
        "success"
      );
    } catch (err) {
      console.error(err);
      showToast("Export failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const poDocRef = useRef<HTMLDivElement>(null);

  const fetchPoDetails = useCallback(
    async (poId: string) => {
      try {
        const res = await apiFetch(
          `/api/purchasing/po/${poId}`,
          {},
          user?.username
        );
        if (!res.ok || !res.data?.items) {
          throw new Error(res.error || "Failed to fetch PO details");
        }
        setSelectedPoDetails(res.data);
        setShowPoDocModal(true);
      } catch (err) {
        console.error(err);
        showToast("Failed to fetch PO details", "error");
      }
    },
    [showToast, user?.username]
  );

  const fetchPrDetails = useCallback(
    async (prNumber: string) => {
      try {
        const res = await apiFetch(
          `/api/purchasing/pr/${prNumber}`,
          {},
          user?.username
        );
        if (!res.ok || !res.data?.items) {
          throw new Error(res.error || "Failed to fetch PR details");
        }
        setSelectedPrDetails(res.data);
        setShowPrDetailsModal(true);
      } catch (err) {
        console.error(err);
        showToast("Failed to fetch PR details", "error");
      }
    },
    [showToast, user?.username]
  );

  const handleAuthorizePo = async () => {
    setIsSubmitting(true);
    try {
      const digitalSignature = `Digitally Authorized by ${
        user?.name || user?.username
      } (${user?.role}) on ${new Date().toISOString()}`;
      const res = await apiFetch(
        "/api/purchasing/authorize-po",
        {
          method: "POST",
          body: JSON.stringify({
            po_id: selectedPoToAuth.id,
            auth_doc_name: digitalSignature,
          }),
        },
        user?.username
      );
      if (res.ok) {
        setShowAuthorizePoModal(false);
        fetchData();
        showToast("PO digitally authorized successfully", "success");
        setSelectedDocForEmail(selectedPoToAuth);
        setShowEmailModal(true);
      } else {
        showToast(res.error || "Failed to authorize PO", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error authorizing PO", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevisePo = async (note: string) => {
    if (!note.trim()) {
      showToast("Validation Failed: Revision note is required.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/revise-po",
        {
          method: "POST",
          body: JSON.stringify({
            po_id: selectedPoToAuth.id,
            revision_note: note,
          }),
        },
        user?.username
      );
      if (res.ok) {
        setShowRevisePoModal(false);
        fetchData();
        showToast("PO marked for revision", "success");
      } else {
        showToast(res.error || "Failed to revise PO", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error revising PO", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelPo = useCallback(
    (id: string) => {
      setConfirmModal({
        isOpen: true,
        title: "Un-bulk / Cancel Purchase Order?",
        message:
          "Are you sure you want to un-bulk/cancel this PO? The internally linked Purchase Request items will be unlinked and returned to the Pending PR list so they can be generated separately.",
        action: async () => {
          try {
            const res = await apiFetch(
              `/api/purchasing/po/${id}/cancel`,
              { method: "POST" },
              user?.username
            );
            if (res.ok) {
              setShowPoModal(false);
              setRevisingPo(null);
              fetchData();
              showToast(
                "PO un-bulked / cancelled. PR items returned to pending list.",
                "success"
              );
            }
          } catch (err) {
            console.error(err);
          }
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        },
      });
    },
    [fetchData, showToast, user?.username]
  );

  const handleArchivePr = useCallback(
    (id: string) => {
      setConfirmModal({
        isOpen: true,
        title: "Archive Purchase Request?",
        message:
          "Are you sure you want to archive this Purchase Request? It will be safely moved to cold-storage and hidden from the active list, while remaining available in history for audits.",
        action: async () => {
          try {
            const res = await apiFetch(
              `/api/purchasing/archive-pr/${id}`,
              { method: "POST" },
              user?.username
            );
            if (res.ok) {
              showToast("Purchase Request successfully archived.", "success");
              fetchData();
            } else {
              showToast(
                res.error || "Failed to archive Purchase Request",
                "error"
              );
            }
          } catch (err) {
            console.error(err);
            showToast("Failed to archive Purchase Request", "error");
          }
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        },
      });
    },
    [fetchData, showToast, user?.username]
  );

  const handleArchivePo = useCallback(
    (id: string) => {
      setConfirmModal({
        isOpen: true,
        title: "Archive Purchase Order?",
        message:
          "Are you sure you want to archive this Purchase Order? Correct historical records remain intact and fully auditable in historic logs.",
        action: async () => {
          try {
            const res = await apiFetch(
              `/api/purchasing/archive-po/${id}`,
              { method: "POST" },
              user?.username
            );
            if (res.ok) {
              showToast("Purchase Order successfully archived.", "success");
              fetchData();
            } else {
              showToast(
                res.error || "Failed to archive Purchase Order",
                "error"
              );
            }
          } catch (err) {
            console.error(err);
            showToast("Failed to archive Purchase Order", "error");
          }
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        },
      });
    },
    [fetchData, showToast, user?.username]
  );

  const handleArchiveFinishedPos = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      title: "Archive Finished Purchase Orders?",
      message:
        "This will archive all FINISHED, CANCELLED, and RECEIVED Purchase Orders from the active workspace. This keeps your queue clean while maintaining flawless audit capability.",
      action: async () => {
        try {
          const res = await apiFetch(
            "/api/purchasing/clear-pos",
            { method: "POST" },
            user?.username
          );
          if (res.ok) {
            fetchData();
            showToast(
              "Finished Purchase Orders archived successfully.",
              "success"
            );
          } else {
            showToast(
              res.error || "Failed to archive purchase orders",
              "error"
            );
          }
        } catch (err) {
          console.error(err);
          showToast("Error archiving purchase orders", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  }, [fetchData, showToast, user?.username]);

  const exportPoPdf = async () => {
    if (!poDocRef.current) return;
    setIsSubmitting(true);
    try {
      await generatePDF(
        poDocRef.current,
        `PO_${selectedPoDetails?.po_number || "Doc"}.pdf`
      );
    } catch (err) {
      console.error(err);
      showToast("Export failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    fetchData();

    const params = new URLSearchParams(window.location.search);
    const prParam = params.get("pr");
    const poParam = params.get("po");

    if (prParam) {
      fetchPrDetails(prParam);
    } else if (poParam) {
      fetchPoDetails(poParam);
    }
  }, [fetchData, fetchPoDetails, fetchPrDetails]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedPrItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisingPo && selectedPrItems.size === 0) return;

    if (!revisingPo) {
      const missingPriceItems = selectedItemsDetails.filter(
        (p) =>
          (!p.unit_price || p.unit_price <= 0) && p.item_type !== "FINISHED"
      );

      if (missingPriceItems.length > 0 && !poForm.supplier_id) {
        showToast(
          `Note: ${missingPriceItems.length} item(s) have no catalog unit price; supplier or standard baseline pricing will be applied.`,
          "info"
        );
      }
    }

    setIsSubmitting(true);
    const effectivePaymentTerms =
      poForm.payment_terms === "Custom"
        ? poForm.custom_payment_terms.trim() || "Net 30 Days"
        : poForm.payment_terms || "Net 30 Days";

    try {
      if (revisingPo) {
        const res = await apiFetch(
          `/api/purchasing/po/${revisingPo.id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              supplier_name: poForm.supplier_name,
              supplier_npwp: poForm.supplier_npwp,
              urgency: poForm.urgency,
              tax_category: poForm.tax_category,
              tax_scheme: poForm.tax_scheme,
              ppn_rate: parseFloat(poForm.ppn_rate) || 0,
              pph_rate: parseFloat(poForm.pph_rate) || 0,
              payment_terms: effectivePaymentTerms,
              rounding_factor: Number(poForm.rounding_factor) || 0,
            }),
          },
          user?.username
        );
        if (res.ok) {
          setShowPoModal(false);
          setRevisingPo(null);
          setPoForm({
            supplier_id: "",
            supplier_name: "",
            supplier_npwp: "",
            urgency: "NORMAL",
            tax_category: "GOODS_DPP_LAIN",
            tax_scheme: "DPP_NILAI_LAIN",
            ppn_rate: "12",
            pph_rate: "0",
            service_amount: "",
            payment_terms: "Net 30 Days",
            custom_payment_terms: "",
            rounding_factor: 0,
          });
          fetchData();
          showToast("PO Revised successfully!", "success");
        } else {
          showToast(res.error || "Failed to revise PO", "error");
        }
      } else {
        const res = await apiFetch(
          "/api/purchasing/create-po",
          {
            method: "POST",
            body: JSON.stringify({
              supplier_id: poForm.supplier_id,
              supplier_name: poForm.supplier_name,
              supplier_npwp: poForm.supplier_npwp,
              urgency: poForm.urgency,
              tax_category: poForm.tax_category,
              tax_scheme: poForm.tax_scheme,
              ppn_rate: parseFloat(poForm.ppn_rate) || 0,
              pph_rate: parseFloat(poForm.pph_rate) || 0,
              payment_terms: effectivePaymentTerms,
              rounding_factor: Number(poForm.rounding_factor) || 0,
              service_amount: parseFloat(poForm.service_amount) || 0,
              pr_item_ids: Array.from(selectedPrItems),
            }),
          },
          user?.username
        );

        if (res.ok) {
          const data = res.data;
          setShowPoModal(false);
          setSelectedPrItems(new Set());
          setPoForm({
            supplier_id: "",
            supplier_name: "",
            supplier_npwp: "",
            urgency: "NORMAL",
            tax_category: "GOODS_DPP_LAIN",
            tax_scheme: "DPP_NILAI_LAIN",
            ppn_rate: "12",
            pph_rate: "0",
            service_amount: "",
            payment_terms: "Net 30 Days",
            custom_payment_terms: "",
            rounding_factor: 0,
          });
          fetchData();

          if (data.id) {
            fetchPoDetails(data.id);
          }
          showToast("PO created successfully!", "success");
        } else {
          showToast(res.error || "Failed to create PO", "error");
        }
      }
    } catch (err) {
      console.error(err);
      showToast(
        revisingPo ? "Error revising PO" : "Error creating PO",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSharePo = useCallback(
    (po: ActivePOItem) => {
      shareToForum(
        "PO",
        po.id,
        `Purchase Order: ${po.po_number}`,
        `New purchase order ${po.po_number} issued to ${po.supplier_name}. Expected delivery: ${
          po.expected_date || "TBD"
        }`
      );
    },
    [shareToForum]
  );

  const handleOpenReissueGrn = useCallback(
    async (po: ActivePOItem) => {
      setSelectedPoDetails(po);
      await fetchPoDetailsForReissue(po.id);
      setShowReissueGrnModal(true);
    },
    [fetchPoDetailsForReissue]
  );

  const handleReviseRejectedOrRevisionPo = useCallback(
    async (po: ActivePOItem) => {
      const res = await apiFetch(
        `/api/purchasing/po/${po.id}`,
        {},
        user?.username
      );
      if (res.ok) {
        const supScheme = (res.data.tax_scheme ||
          "DPP_NILAI_LAIN") as TaxScheme;
        const supTaxCat =
          res.data.tax_category ||
          (supScheme === "NON_PKP"
            ? "NON_PKP"
            : Number(res.data.pph_rate) > 0
              ? "SERVICES_DPP_LAIN"
              : "GOODS_DPP_LAIN");

        setRevisingPo(res.data);
        setPoForm({
          supplier_id: res.data.supplier_id || "",
          supplier_name: res.data.supplier_name || "",
          supplier_npwp: res.data.supplier_npwp || "",
          urgency: res.data.urgency || "NORMAL",
          tax_category: supTaxCat,
          tax_scheme: supScheme,
          ppn_rate: String(res.data.ppn_rate ?? 12),
          pph_rate: String(res.data.pph_rate ?? 0),
          service_amount: "",
          payment_terms: res.data.payment_terms || "Net 30 Days",
          custom_payment_terms: "",
          rounding_factor: res.data.rounding_factor || 0,
        });
        setShowPoModal(true);
      }
    },
    [user?.username]
  );

  const handleOpenAuthorizeModal = useCallback((po: ActivePOItem) => {
    setSelectedPoToAuth(po);
    setShowAuthorizePoModal(true);
  }, []);

  const handleOpenReviseModal = useCallback((po: ActivePOItem) => {
    setSelectedPoToAuth(po);
    setShowRevisePoModal(true);
  }, []);

  const handleOpenEmailModal = useCallback((po: ActivePOItem) => {
    setSelectedDocForEmail(po);
    setShowEmailModal(true);
  }, []);

  const handleOpenGrnModal = useCallback(
    async (po: ActivePOItem) => {
      setSelectedPoDetails(po);
      await fetchPoDetailsForGrn(po.id);
      setShowGrnModal(true);
    },
    [fetchPoDetailsForGrn]
  );

  const handleNavigateProcurementPlan = useCallback(
    (projectId: string) => {
      navigate(`/procurement-plan?project_id=${encodeURIComponent(projectId)}`);
    },
    [navigate]
  );

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Purchase Orders"
        subtitle="Orders & requisitions queue"
        icon={<ShoppingCart className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              onClick={() => {
                if (selectedPrItems.size === 0) return;
                setShowPoModal(true);
              }}
              disabled={
                selectedPrItems.size === 0 ||
                !hasPermission(user, Action.CREATE_PO)
              }
              leftIcon={<FileText className="w-4 h-4" />}
              title={
                !hasPermission(user, Action.CREATE_PO)
                  ? "Only authorized personnel can generate POs"
                  : ""
              }
            >
              Generate PO ({selectedPrItems.size})
            </Button>
          </div>
        }
      />

      <ProcurementTopBanners
        highVolumeProjectIndications={highVolumeProjectIndications}
        pendingWorkspaceDocs={pendingWorkspaceDocs}
        onNavigateProcurementPlan={handleNavigateProcurementPlan}
        onApproveWorkspaceDoc={handleApproveWorkspaceDoc}
        onReviseWorkspaceDoc={handleReviseWorkspaceDoc}
      />

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left Panel: Pending PRs */}
        <PendingPrQueuePanel
          isLoading={isLoading}
          pendingPrs={pendingPrs}
          selectablePrs={selectablePrs}
          selectedPrItems={selectedPrItems}
          onToggleSelectAll={() => {
            if (
              selectedPrItems.size === selectablePrs.length &&
              selectablePrs.length > 0
            ) {
              setSelectedPrItems(new Set());
            } else {
              setSelectedPrItems(
                new Set(selectablePrs.map((p) => p.pr_item_id))
              );
            }
          }}
          onToggleSelection={toggleSelection}
          onArchiveFinishedPrs={() => {
            setConfirmModal({
              isOpen: true,
              title: "Archive Finished Requests?",
              message:
                "Are you sure you want to archive all ORDERED and CANCELLED Purchase Requests? Archived items remain fully traceable under historical logs.",
              action: async () => {
                try {
                  const res = await apiFetch(
                    "/api/purchasing/clear-prs",
                    { method: "POST" },
                    user?.username
                  );
                  if (res.ok) {
                    showToast(
                      "Finished requests successfully archived.",
                      "success"
                    );
                    fetchData();
                  } else {
                    showToast(
                      res.error || "Failed to archive requests",
                      "error"
                    );
                  }
                } catch {
                  showToast("Action failed", "error");
                }
                setConfirmModal((prev) => ({ ...prev, isOpen: false }));
              },
            });
          }}
          onRefresh={fetchData}
          onSharePr={(pr) =>
            shareToForum(
              "PR",
              pr.pr_number,
              `Purchase Request: ${pr.pr_number}`,
              `New purchase request ${pr.pr_number} for project ${pr.project_name}. Item: ${pr.item_name} (${pr.qty} ${pr.uom}). Status: ${pr.status}`
            )
          }
          onViewPrDetails={fetchPrDetails}
          onArchivePr={handleArchivePr}
        />

        {/* Right Panel: Active POs */}
        <ActivePoQueuePanel
          isLoading={isLoading}
          pos={pos}
          user={user}
          onArchiveFinishedPos={handleArchiveFinishedPos}
          onViewPoDoc={fetchPoDetails}
          onSharePo={handleSharePo}
          onOpenReissueGrn={handleOpenReissueGrn}
          onReviseRejectedOrRevisionPo={handleReviseRejectedOrRevisionPo}
          onCancelPo={handleCancelPo}
          onOpenAuthorizeModal={handleOpenAuthorizeModal}
          onOpenReviseModal={handleOpenReviseModal}
          onOpenEmailModal={handleOpenEmailModal}
          onOpenGrnModal={handleOpenGrnModal}
          onArchivePo={handleArchivePo}
        />
      </div>

      {/* PO Document Modal */}
      <PoDocumentModal
        isOpen={showPoDocModal && selectedPoDetails !== null}
        onClose={() => setShowPoDocModal(false)}
        selectedPoDetails={selectedPoDetails}
        poDocRef={poDocRef}
        isSubmitting={isSubmitting}
        exportPoPdf={exportPoPdf}
        language={language}
      />

      {/* PR Details Modal */}
      <PrDetailsModal
        isOpen={showPrDetailsModal && selectedPrDetails !== null}
        onClose={() => setShowPrDetailsModal(false)}
        selectedPrDetails={selectedPrDetails}
      />

      {/* Authorize PO Modal */}
      <AuthorizeDocModal
        isOpen={showAuthorizePoModal && selectedPoToAuth !== null}
        onClose={() => setShowAuthorizePoModal(false)}
        docType="Purchase Order"
        docNumber={selectedPoToAuth?.po_number || ""}
        status={selectedPoToAuth?.status || "DRAFT"}
        partnerLabel="Supplier"
        partnerName={selectedPoToAuth?.supplier_name}
        amount={selectedPoToAuth?.total_amount || selectedPoToAuth?.amount}
        isSubmitting={isSubmitting}
        onAuthorize={handleAuthorizePo}
      />

      {/* Revise PO Modal */}
      <ReviseDocModal
        isOpen={showRevisePoModal && selectedPoToAuth !== null}
        onClose={() => setShowRevisePoModal(false)}
        docType="Purchase Order"
        docNumber={selectedPoToAuth?.po_number || ""}
        status={selectedPoToAuth?.status || "DRAFT"}
        partnerLabel="Supplier"
        partnerName={selectedPoToAuth?.supplier_name}
        amount={selectedPoToAuth?.total_amount || selectedPoToAuth?.amount}
        isSubmitting={isSubmitting}
        onRevise={handleRevisePo}
      />

      {/* Send Email Modal */}
      <SendEmailModal
        isOpen={showEmailModal && selectedDocForEmail !== null}
        onClose={() => setShowEmailModal(false)}
        docType="Purchase Order"
        docNumber={selectedDocForEmail?.po_number || ""}
        defaultRecipientEmail={selectedDocForEmail?.supplier_email || ""}
        defaultRecipientPhone={selectedDocForEmail?.supplier_phone || ""}
        defaultRecipientName={selectedDocForEmail?.supplier_name || ""}
        defaultSubject={`Purchase Order (PO) - ${selectedDocForEmail?.po_number}`}
        defaultBody={buildPoEmailBody(selectedDocForEmail)}
        onDownloadPdf={handleDownloadPdf}
        onSend={(data) => dispatchPoEmailClient(data, showToast)}
      />

      {/* Hidden PDF Renderer for List View */}
      {selectedDocForEmail && (
        <PoDocumentModal
          isOpen={true}
          onClose={() => {}}
          selectedPoDetails={selectedDocForEmail}
          poDocRef={exportPdfRef}
          isSubmitting={false}
          exportPoPdf={() => {}}
          language={language}
          isPrintModeHidden={true}
        />
      )}

      {/* Create PO Modal */}
      <CreatePoModal
        isOpen={showPoModal}
        onClose={() => {
          setShowPoModal(false);
          setRevisingPo(null);
        }}
        revisingPo={revisingPo}
        handleCancelPo={handleCancelPo}
        selectedPrItems={selectedPrItems}
        pendingPrs={pendingPrs}
        handleCreatePo={handleCreatePo}
        isFetchingSuppliers={isFetchingSuppliers}
        sortedSuppliers={sortedSuppliers}
        poForm={poForm}
        setPoForm={setPoForm}
        handleSelectSupplierInModal={handleSelectSupplierInModal}
        getSupplierTotalAndPrices={getSupplierTotalAndPrices}
        selectedItemsDetails={selectedItemsDetails}
        validSuppliers={validSuppliers}
        handlePoTaxCategoryChange={handlePoTaxCategoryChange}
        isSubmitting={isSubmitting}
      />
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() =>
          setConfirmModal((prev) => ({ ...prev, isOpen: false }))
        }
      />

      {/* GRN Modal (Engineering Confirmation) */}
      <GrnModal
        isOpen={showGrnModal && selectedPoDetails !== null}
        onClose={() => setShowGrnModal(false)}
        selectedPoDetails={selectedPoDetails}
        grnForm={grnForm}
        setGrnForm={setGrnForm}
        user={user}
        grnItems={grnItems}
        setGrnItems={setGrnItems}
        grnAuthPin={grnAuthPin}
        setGrnAuthPin={setGrnAuthPin}
        handleCompleteGrn={handleCompleteGrn}
        isSubmitting={isSubmitting}
      />
      {/* Re-issue Rejected GRN Modal */}
      <ReissueGrnModal
        isOpen={showReissueGrnModal && selectedPoDetails !== null}
        onClose={() => setShowReissueGrnModal(false)}
        selectedPoDetails={selectedPoDetails}
        reissueGrnForm={reissueGrnForm}
        setReissueGrnForm={setReissueGrnForm}
        user={user}
        reissueGrnItems={reissueGrnItems}
        setReissueGrnItems={setReissueGrnItems}
        handleReissueGrn={handleReissueGrn}
        isSubmitting={isSubmitting}
      />

      {/* GRN Report Modal */}
      <GrnReportModal
        isOpen={showGrnReportModal && completedGrnData !== null}
        onClose={() => setShowGrnReportModal(false)}
        completedGrnData={completedGrnData}
        grnReportRef={grnReportRef}
        isSubmitting={isSubmitting}
        exportGrnPdf={exportGrnPdf}
        language={language}
      />
    </div>
  );
}
