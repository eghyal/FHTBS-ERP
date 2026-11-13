import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Waves } from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { ProcurementPlanWorkspace } from "@/components/erp/procurement/ProcurementPlanWorkspace";
import { PoDocumentModal } from "@/components/erp/procurement/PoDocumentModal";
import { generatePDF } from "@/lib/pdfGenerator";

export default function ProcurementPlan() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("project_id");

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedPoDetails, setSelectedPoDetails] = useState<any>(null);
  const [showPoDocModal, setShowPoDocModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const poDocRef = useRef<HTMLDivElement>(null);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await apiFetch("/api/suppliers", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        setSuppliers(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch suppliers for Procurement Plan:", err);
    }
  }, [user?.username]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const fetchPoDetails = useCallback(
    async (poId: string) => {
      try {
        const res = await apiFetch(
          `/api/purchasing/po/${poId}`,
          {},
          user?.username,
        );
        if (!res.ok || !res.data?.items) {
          throw new Error(res.error || "Failed to fetch PO details");
        }
        setSelectedPoDetails(res.data);
        setShowPoDocModal(true);
      } catch (err) {
        console.error(err);
        showToast("Failed to load PO document details", "error");
      }
    },
    [showToast, user?.username],
  );

  const exportPoPdf = async () => {
    if (!poDocRef.current || !selectedPoDetails) return;
    setIsExportingPdf(true);
    try {
      await generatePDF(
        poDocRef.current,
        `${selectedPoDetails.po_number || "PO"}.pdf`,
      );
      showToast("PO document exported to PDF (A4)", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to export PO PDF", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Procurement Plan"
        subtitle="Material wave scheduling & lead-time buffers"
        icon={<Waves className="w-5 h-5" />}
      />

      <ProcurementPlanWorkspace
        initialProjectId={initialProjectId}
        suppliers={suppliers}
        onRefreshProcurementData={fetchSuppliers}
        onOpenPoDetails={fetchPoDetails}
      />

      <PoDocumentModal
        isOpen={showPoDocModal && selectedPoDetails !== null}
        onClose={() => setShowPoDocModal(false)}
        selectedPoDetails={selectedPoDetails}
        poDocRef={poDocRef}
        isSubmitting={isExportingPdf}
        exportPoPdf={exportPoPdf}
        language={language}
      />
    </div>
  );
}
