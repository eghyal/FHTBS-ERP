import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { PackageSearch, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { PoDocumentModal } from "@/components/erp/procurement/PoDocumentModal";
import { GrnModal } from "@/components/erp/procurement/GrnModal";
import { ReissueGrnModal } from "@/components/erp/procurement/ReissueGrnModal";
import { GrnReportModal } from "@/components/erp/procurement/GrnReportModal";
import { IncomingPoQueuePane } from "@/components/erp/qc/IncomingPoQueuePane";
import { IssuedGrnLedgerPane } from "@/components/erp/qc/IssuedGrnLedgerPane";
import { generatePDF } from "@/lib/pdfGenerator";
import { getDailyAuthKey } from "@/utils/auth";
import { cn, useEscapeKey } from "@/lib/utils";
import { Action, hasGodMode, hasPermission } from "@/utils/pbac";

export default function IncomingMaterial() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();

  const canCreateGrn =
    hasGodMode(user) ||
    user?.role === "QA_QC" ||
    hasPermission(user, Action.INSPECT_QC) ||
    hasPermission(user, Action.RECEIVE_PO);

  const [pos, setPos] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters
  const [searchPoQuery, setSearchPoQuery] = useState("");
  const [poStatusFilter, setPoStatusFilter] = useState("ACTIONABLE");
  const [searchGrnQuery, setSearchGrnQuery] = useState("");
  const [grnStatusFilter, setGrnStatusFilter] = useState("ALL");

  // PO & GRN Modals State
  const [selectedPoDetails, setSelectedPoDetails] = useState<any>(null);
  const [showPoDocModal, setShowPoDocModal] = useState(false);
  const poDocRef = useRef<HTMLDivElement>(null);

  const [showGrnModal, setShowGrnModal] = useState(false);
  const [grnAuthPin, setGrnAuthPin] = useState("");
  const [grnItems, setGrnItems] = useState<any[]>([]);
  const [grnForm, setGrnForm] = useState<{
    received_date: string;
    engineering_user?: string;
    qc_user?: string;
    qc_status: string;
    remarks: string;
  }>({
    received_date: new Date().toISOString().split("T")[0],
    engineering_user: user?.name || user?.username || "QA/QC Inspector",
    qc_user: user?.name || user?.username || "QA/QC Inspector",
    qc_status: "PASSED",
    remarks: "",
  });

  const [showReissueGrnModal, setShowReissueGrnModal] = useState(false);
  const [reissueAuthPin, setReissueAuthPin] = useState("");
  const [reissueGrnItems, setReissueGrnItems] = useState<any[]>([]);
  const [reissueGrnForm, setReissueGrnForm] = useState<{
    received_date: string;
    engineering_user?: string;
    qc_user?: string;
    qc_status: string;
    remarks: string;
    rejected_grn_doc: string;
  }>({
    received_date: new Date().toISOString().split("T")[0],
    engineering_user: user?.name || user?.username || "QA/QC Inspector",
    qc_user: user?.name || user?.username || "QA/QC Inspector",
    qc_status: "PASSED",
    remarks: "",
    rejected_grn_doc: "",
  });

  const [showGrnReportModal, setShowGrnReportModal] = useState(false);
  const [completedGrnData, setCompletedGrnData] = useState<any>(null);
  const grnReportRef = useRef<HTMLDivElement>(null);

  useEscapeKey(() => {
    setShowPoDocModal(false);
    setShowGrnModal(false);
    setShowReissueGrnModal(false);
    setShowGrnReportModal(false);
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [posRes, grnsRes] = await Promise.all([
        apiFetch("/api/purchasing/pos", {}, user?.username),
        apiFetch("/api/purchasing/grns", {}, user?.username),
      ]);
      if (posRes.ok) {
        setPos(Array.isArray(posRes.data) ? posRes.data : []);
      }
      if (grnsRes.ok) {
        setGrns(Array.isArray(grnsRes.data) ? grnsRes.data : []);
      }
    } catch (err) {
      console.error("Failed to fetch incoming material queue:", err);
      showToast("Failed to load incoming material data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast, user?.username]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const buildConsolidatedPoItems = (items: any[]) => {
    const itemMap = new Map();
    items.forEach((item: any) => {
      if (!itemMap.has(item.item_id)) {
        const pending = Math.max(0, Number(item.qty || 0) - Number(item.received_qty || 0));
        itemMap.set(item.item_id, {
          ...item,
          qty: Number(item.qty || 0),
          qty_received: pending,
          qty_passed: pending,
          qty_rejected: 0,
          batch_lot_number: "",
          received_qty: Number(item.received_qty || 0),
        });
      } else {
        const existing = itemMap.get(item.item_id);
        existing.qty += Number(item.qty || 0);
        const newPending = Math.max(0, existing.qty - existing.received_qty);
        existing.qty_received = newPending;
        existing.qty_passed = newPending;
        existing.qty_rejected = 0;
      }
    });
    return Array.from(itemMap.values());
  };

  const fetchPoDetailsForGrn = useCallback(
    async (poId: string) => {
      try {
        const res = await apiFetch(
          `/api/purchasing/po/${poId}`,
          {},
          user?.username
        );
        if (res.ok && res.data?.items) {
          setGrnItems(buildConsolidatedPoItems(res.data.items));
          const inspectorName =
            user?.name || user?.username || "QA/QC Inspector";
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
        showToast("Failed to fetch PO items for GRN", "error");
      }
    },
    [showToast, user?.name, user?.username]
  );

  const fetchPoDetailsForReissue = useCallback(
    async (poId: string) => {
      try {
        const res = await apiFetch(
          `/api/purchasing/po/${poId}`,
          {},
          user?.username
        );
        if (res.ok && res.data?.items) {
          setReissueGrnItems(buildConsolidatedPoItems(res.data.items));
          const inspectorName =
            user?.name || user?.username || "QA/QC Inspector";
          setReissueGrnForm({
            received_date: new Date().toISOString().split("T")[0],
            engineering_user: inspectorName,
            qc_user: inspectorName,
            qc_status: "PASSED",
            remarks: "",
            rejected_grn_doc: "",
          });
          setReissueAuthPin("");
        }
      } catch (err) {
        console.error(err);
        showToast("Failed to fetch PO items for Re-issue GRN", "error");
      }
    },
    [showToast, user?.name, user?.username]
  );

  const handleOpenGrnModal = useCallback(
    async (po: any) => {
      setSelectedPoDetails(po);
      await fetchPoDetailsForGrn(po.id);
      setShowGrnModal(true);
    },
    [fetchPoDetailsForGrn]
  );

  const handleOpenReissueGrn = useCallback(
    async (po: any) => {
      setSelectedPoDetails(po);
      await fetchPoDetailsForReissue(po.id);
      setShowReissueGrnModal(true);
    },
    [fetchPoDetailsForReissue]
  );

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
          qc_status: data.qc_status || grnForm.qc_status,
          items: grnItems,
          grn_id: data.grn_id,
          created_at: new Date().toISOString(),
        });
        setShowGrnReportModal(true);
        fetchData();
        showToast(
          "GRN issued by QC! Vendor quality score updated & passed items ready for Warehouse Intake.",
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
        setReissueAuthPin("");
        setCompletedGrnData({
          po_number: selectedPoDetails.po_number,
          supplier_name: selectedPoDetails.supplier_name,
          pr_numbers: selectedPoDetails.pr_numbers,
          project_ids: selectedPoDetails.project_ids,
          ...reissueGrnForm,
          qc_status: data.qc_status || reissueGrnForm.qc_status,
          items: reissueGrnItems,
          grn_id: data.grn_id,
          created_at: new Date().toISOString(),
          is_reissue: true,
        });
        setShowGrnReportModal(true);
        fetchData();
        showToast(
          "Replacement GRN completed by QC! Material is ready for Warehouse Intake.",
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

  const handleUpdateGrnQcStatus = useCallback(
    async (grnId: string, qcStatus: string) => {
      try {
        const res = await apiFetch(
          `/api/purchasing/grn/${grnId}/qc-inspect`,
          {
            method: "POST",
            body: JSON.stringify({ qc_status: qcStatus }),
          },
          user?.username
        );
        if (res.ok) {
          showToast(`GRN QC disposition updated to ${qcStatus}`, "success");
          fetchData();
        } else {
          showToast(res.error || "Failed to update GRN QC status", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Failed to update GRN QC status", "error");
      }
    },
    [fetchData, showToast, user?.username]
  );

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

  const exportGrnPdf = async () => {
    if (!grnReportRef.current) return;
    setIsSubmitting(true);
    try {
      await generatePDF(
        grnReportRef.current,
        `GRN-${completedGrnData?.grn_id || "Report"}.pdf`
      );
      showToast("A4 Portrait GRN document exported successfully", "success");
    } catch (err) {
      console.error(err);
      showToast("Export failed", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const actionablePosCount = useMemo(
    () =>
      pos.filter(
        (po) =>
          po.status === "ISSUED" ||
          (po.status === "PARTIAL" && Number(po.pending_qty || 0) > 0) ||
          po.status === "REJECTED"
      ).length,
    [pos]
  );

  const awaitingWarehouseIntakeCount = useMemo(
    () =>
      grns.filter(
        (g) =>
          g.qc_status !== "REJECTED" &&
          !g.inventory_updated_at &&
          Number(g.intake_completed || 0) === 0
      ).length,
    [grns]
  );

  const qcPassRate = useMemo(() => {
    if (grns.length === 0) return 100;
    const passed = grns.filter((g) => g.qc_status === "PASSED").length;
    return Math.round((passed / grns.length) * 100);
  }, [grns]);

  const filteredPos = useMemo(() => {
    return pos.filter((po) => {
      if (po.status === "CANCELLED" || po.status === "DRAFTED") return false;
      if (poStatusFilter === "ACTIONABLE") {
        const isActionable =
          po.status === "ISSUED" ||
          (po.status === "PARTIAL" && Number(po.pending_qty || 0) > 0) ||
          po.status === "REJECTED" ||
          (po.status === "PARTIAL" && Number(po.has_rejected_grn || 0) > 0);
        if (!isActionable) return false;
      } else if (poStatusFilter !== "ALL" && po.status !== poStatusFilter) {
        return false;
      }

      if (searchPoQuery.trim()) {
        const q = searchPoQuery.toLowerCase();
        const mPo = String(po.po_number || "").toLowerCase().includes(q);
        const mSup = String(po.supplier_name || "").toLowerCase().includes(q);
        const mPr = String(po.pr_numbers || "").toLowerCase().includes(q);
        if (!mPo && !mSup && !mPr) return false;
      }
      return true;
    });
  }, [pos, poStatusFilter, searchPoQuery]);

  const filteredGrns = useMemo(() => {
    return grns.filter((g) => {
      const isIntaken =
        Boolean(g.inventory_updated_at) ||
        Number(g.intake_completed || 0) === 1;
      if (grnStatusFilter === "PENDING_INTAKE") {
        if (isIntaken || g.qc_status === "REJECTED") return false;
      } else if (grnStatusFilter === "INTAKEN") {
        if (!isIntaken) return false;
      } else if (
        grnStatusFilter !== "ALL" &&
        g.qc_status !== grnStatusFilter
      ) {
        return false;
      }

      if (searchGrnQuery.trim()) {
        const q = searchGrnQuery.toLowerCase();
        const mGrn = String(g.id || "").toLowerCase().includes(q);
        const mPo = String(g.po_number || "").toLowerCase().includes(q);
        const mSup = String(g.supplier_name || "").toLowerCase().includes(q);
        const mQc = String(g.qc_user || "").toLowerCase().includes(q);
        if (!mGrn && !mPo && !mSup && !mQc) return false;
      }
      return true;
    });
  }, [grns, grnStatusFilter, searchGrnQuery]);

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        title="Incoming Material"
        subtitle="Vendor PO receiving & QC inspection"
        icon={<PackageSearch className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white border border-stone-200/80 text-xs font-mono tabular-nums">
              <span>
                Pending POs:{" "}
                <strong className="text-blue-700">{actionablePosCount}</strong>
              </span>
              <span className="text-stone-300">|</span>
              <span>
                Pending Warehouse Intake:{" "}
                <strong className="text-amber-700">
                  {awaitingWarehouseIntakeCount}
                </strong>
              </span>
              <span className="text-stone-300">|</span>
              <span>
                QC Pass:{" "}
                <strong className="text-emerald-700">{qcPassRate}%</strong>
              </span>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              onClick={fetchData}
              disabled={isLoading}
              title="Refresh Incoming Material Data"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
              />
            </Button>
          </div>
        }
      />

      {/* Side-by-Side 2-Pane Receiving Dock Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <IncomingPoQueuePane
          filteredPos={filteredPos}
          searchPoQuery={searchPoQuery}
          setSearchPoQuery={setSearchPoQuery}
          poStatusFilter={poStatusFilter}
          setPoStatusFilter={setPoStatusFilter}
          canCreateGrn={canCreateGrn}
          onViewPo={fetchPoDetails}
          onOpenGrnModal={handleOpenGrnModal}
          onOpenReissueGrn={handleOpenReissueGrn}
        />

        <IssuedGrnLedgerPane
          filteredGrns={filteredGrns}
          searchGrnQuery={searchGrnQuery}
          setSearchGrnQuery={setSearchGrnQuery}
          grnStatusFilter={grnStatusFilter}
          setGrnStatusFilter={setGrnStatusFilter}
          canCreateGrn={canCreateGrn}
          onUpdateGrnQcStatus={handleUpdateGrnQcStatus}
          onOpenGrnReport={(grn) => {
            setCompletedGrnData({
              ...grn,
              grn_id: grn.id,
              items: grn.items || [],
            });
            setShowGrnReportModal(true);
          }}
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

      {/* Complete GRN Modal */}
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

      {/* Re-issue GRN Modal */}
      <ReissueGrnModal
        isOpen={showReissueGrnModal && selectedPoDetails !== null}
        onClose={() => setShowReissueGrnModal(false)}
        selectedPoDetails={selectedPoDetails}
        reissueGrnForm={reissueGrnForm}
        setReissueGrnForm={setReissueGrnForm}
        user={user}
        reissueGrnItems={reissueGrnItems}
        setReissueGrnItems={setReissueGrnItems}
        reissueAuthPin={reissueAuthPin}
        setReissueAuthPin={setReissueAuthPin}
        handleReissueGrn={handleReissueGrn}
        isSubmitting={isSubmitting}
      />

      {/* Official A4 GRN Report Modal */}
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
