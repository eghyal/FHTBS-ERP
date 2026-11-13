import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiFetch, safeFetchJson } from "@/utils/api";
import {
  PackageOpen,
  Truck,
  X,
  FileText,
  FileCheck,
  Download,
  Plus,
  ArrowUpRight,
  Upload,
  QrCode,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Layers,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  Calendar,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generatePDF } from "@/lib/pdfGenerator";
import { getDailyAuthKey } from "@/utils/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
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
  TableEmpty,
} from "@/components/ui/Table";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { QRCodeSVG } from "qrcode.react";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { A5LandscapePrintTemplate } from "@/components/erp/A5PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { CloudFileUploader } from "@/components/shared/CloudFileUploader";
import { DeliveriesModals } from "@/components/erp/sales/deliveries/DeliveriesModals";

export default function Deliveries() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t, language } = useLanguage();

  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [fgItems, setFgItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "IN_TRANSIT" | "COMPLETED" | "REVISION">("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "FULL" | "PARTIAL">("ALL");

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showItemSelectModal, setShowItemSelectModal] = useState(false);
  const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
  const [selectedDnToAuth, setSelectedDnToAuth] = useState<any>(null);
  const [authPin, setAuthPin] = useState("");
  const [deliveryForm, setDeliveryForm] = useState({
    customer_id: "",
    quotation_id: "",
    project_id: "",
    remarks: "",
    items: [] as any[],
    police_number: "",
    delivery_type: "FULL",
    is_partial: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [revisingDn, setRevisingDn] = useState<any>(null);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [selectedDnToRevise, setSelectedDnToRevise] = useState<any>(null);

  const printDocRef = useRef<HTMLDivElement>(null);
  const [previewDn, setPreviewDn] = useState<any>(null);

  // Receipt Modal state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceiptDn, setSelectedReceiptDn] = useState<any>(null);
  const [receiptForm, setReceiptForm] = useState({
    received_by: "",
    delivered_by: "",
    authorized_by: "",
    receipt_date: new Date().toISOString().split("T")[0],
    notes: "Goods received in complete count and good condition.",
  });
  const receiptDocRef = useRef<HTMLDivElement>(null);

  const handleOpenReceiptModal = async (dn?: any) => {
    const targetDn = dn || (deliveries.length > 0 ? deliveries[0] : null);
    if (targetDn) {
      try {
        const res = await apiFetch(
          `/api/sales/deliveries/${targetDn.id}`,
          {},
          user?.username,
        );
        if (res.ok) {
          setSelectedReceiptDn(res.data);
          setReceiptForm((prev) => ({
            ...prev,
            received_by: res.data.customer_name || "",
            delivered_by: res.data.police_number
              ? `Driver (${res.data.police_number})`
              : "Driver",
            authorized_by: user?.username || "QC Supervisor",
          }));
        } else {
          setSelectedReceiptDn(targetDn);
        }
      } catch {
        setSelectedReceiptDn(targetDn);
      }
    } else {
      setSelectedReceiptDn(null);
    }
    setShowReceiptModal(true);
  };

  const handleExportReceiptPdf = async () => {
    if (!receiptDocRef.current) return;
    setIsSubmitting(true);
    try {
      const docNum = selectedReceiptDn?.dn_number || selectedReceiptDn?.id || "FORM";
      await generatePDF(receiptDocRef.current, `RECEIPT_${docNum}.pdf`, {
        orientation: "landscape",
        format: "a5",
      });
      showToast("Receipt PDF exported successfully", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to export Receipt PDF", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const fetchDeliveries = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/sales/deliveries`, {}, user?.username);
      if (res.ok) setDeliveries(Array.isArray(res.data) ? res.data : []);
    } catch (err) {}
    setIsLoading(false);
  }, [user?.username]);

  const fetchSupportData = useCallback(async () => {
    try {
      const cRes = await apiFetch(`/api/sales/customers`, {}, user?.username);
      if (cRes.ok) setCustomers(Array.isArray(cRes.data) ? cRes.data : []);

      const qRes = await apiFetch(`/api/quotations`, {}, user?.username);
      if (qRes.ok) {
        const rawQuos = Array.isArray(qRes.data) ? qRes.data : Array.isArray(qRes.data?.data) ? qRes.data.data : [];
        setQuotations(rawQuos);
      }

      const pRes = await apiFetch(
        `/api/projects?archived=all`,
        {},
        user?.username,
      );
      if (pRes.ok) setProjects(Array.isArray(pRes.data) ? pRes.data : []);

      const itemsRes = await apiFetch(`/api/items`, {}, user?.username);
      if (itemsRes.ok) {
        const itemsList = Array.isArray(itemsRes.data) ? itemsRes.data : [];
        // Filter for finished goods by category, prefix, or type
        const allFgs = itemsList.filter(
          (i: any) =>
            i.category === "FINISHED_GOODS" ||
            i.item_code?.startsWith("FG-") ||
            i.type === "FINISHED",
        );
        setFgItems(allFgs);
      }
    } catch (err) {}
  }, [user?.username]);

  useEffect(() => {
    fetchDeliveries();
    fetchSupportData();
  }, [fetchDeliveries, fetchSupportData]);

  const addItemToDelivery = (item: any) => {
    const qid = deliveryForm.quotation_id;
    let autoQty = 1;
    if (qid) {
      const selectedQuo = (Array.isArray(quotations) ? quotations : []).find(
        (q) => q.id === qid,
      );
      if (selectedQuo && Array.isArray(selectedQuo.items) && selectedQuo.items.length > 0) {
        const matchingQuoItem = selectedQuo.items.find(
          (qi: any) =>
            (qi.title &&
              qi.title.toLowerCase().trim() === item.name?.toLowerCase().trim()) ||
            qi.id === item.id,
        );
        if (matchingQuoItem && Number(matchingQuoItem.qty) > 0) {
          autoQty = Number(matchingQuoItem.qty);
        }
      } else {
        const relatedProjects = (Array.isArray(projects) ? projects : []).filter(
          (p) => p.quotation_id === qid,
        );
        const matchingProj = relatedProjects.find(
          (p) =>
            item.item_code === `FG-${p.id}` ||
            item.item_code === `FG-${p.id}-SUB` ||
            p.id === item.id,
        );
        if (matchingProj) {
          autoQty = Number(matchingProj.qty) > 0 ? Number(matchingProj.qty) : 1;
        }
      }
    }
    setDeliveryForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          item_id: item.id,
          item_code: item.item_code,
          item_name: item.name,
          qty: autoQty,
          uom: item.uom,
        },
      ],
    }));
    setShowItemSelectModal(false);
  };

  const handleCreateDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (deliveryForm.items.length === 0)
      return showToast("Add at least one item", "error");

    if (!deliveryForm.is_partial) {
      if (deliveryForm.quotation_id) {
        const selectedQuo = quotations.find((q) => q.id === deliveryForm.quotation_id);
        const relatedProjects = projects.filter(
          (p) =>
            p.quotation_id === deliveryForm.quotation_id ||
            (selectedQuo && p.quotation_number === selectedQuo.quotation_number),
        );
        const unfinished = relatedProjects.filter(
          (p) =>
            p.status !== "FINISHED" &&
            p.status !== "COMPLETED" &&
            p.status !== "CLOSED",
        );
        if (unfinished.length > 0) {
          const unfinishedList = unfinished
            .map((p) => `'${p.name}' (${p.status})`)
            .join(", ");
          return showToast(
            `Cannot issue Full Delivery Note: Quotation '${selectedQuo?.quotation_number || deliveryForm.quotation_id}' has unfinished project(s): ${unfinishedList}. Switch to 'Partial Delivery' if you wish to ship completed lots now.`,
            "error",
          );
        }
      } else if (deliveryForm.project_id) {
        const selectedProj = projects.find(
          (p) => p.id === deliveryForm.project_id,
        );
        if (
          selectedProj &&
          selectedProj.status !== "FINISHED" &&
          selectedProj.status !== "COMPLETED" &&
          selectedProj.status !== "CLOSED"
        ) {
          return showToast(
            `Cannot issue Full Delivery Note: Project '${selectedProj.name}' status is '${selectedProj.status}'. Switch to 'Partial Delivery' for completed lots.`,
            "error",
          );
        }
      }
    }

    setIsSubmitting(true);
    try {
      const url = revisingDn
        ? `/api/sales/deliveries/${revisingDn.id}`
        : "/api/sales/deliveries";
      const method = revisingDn ? "PUT" : "POST";
      const res = await apiFetch(
        url,
        {
          method,
          body: JSON.stringify(deliveryForm),
        },
        user?.username,
      );
      if (res.ok) {
        showToast(
          revisingDn ? "Delivery Note Revised" : "Delivery Note Created",
          "success",
        );
        setDeliveryForm({
          customer_id: "",
          quotation_id: "",
          project_id: "",
          remarks: "",
          items: [],
          police_number: "",
          delivery_type: "FULL",
          is_partial: false,
        });
        setShowDeliveryModal(false);
        setRevisingDn(null);
        fetchDeliveries();
      } else {
        showToast(res.error || "Failed", "error");
      }
    } catch (err) {
      showToast("Error", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviseDn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionNote.trim())
      return showToast("Revision note is required", "error");
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/sales/deliveries/revise-dn",
        {
          method: "POST",
          body: JSON.stringify({
            dn_id: selectedDnToRevise.id,
            revision_note: revisionNote,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Delivery marked for revision", "success");
        setShowReviseModal(false);
        setRevisionNote("");
        fetchDeliveries();
      } else {
        showToast(res.error || "Failed to revise delivery", "error");
      }
    } catch {
      showToast("Error", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAuthorizeDn = (dn: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedDnToAuth(dn);
    setShowAuthorizeModal(true);
  };

  const submitAuthorizeDn = async (submittedPin: string) => {
    if (!selectedDnToAuth) return;
    if (submittedPin !== getDailyAuthKey(user?.username)) {
      showToast("Validation Failed: Invalid Authorization PIN.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/deliveries/${selectedDnToAuth.id}/authorize`,
        { 
          method: "POST",
          body: JSON.stringify({ pin: submittedPin }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Delivery Note Authorized and sent to Warehouse", "success");
        setShowAuthorizeModal(false);
        setAuthPin("");
        fetchDeliveries();
      } else {
        showToast(res.error || "Failed to authorize delivery note", "error");
      }
    } catch (err) {
      showToast("Authorization error", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartDelivery = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: "Start Delivery Process",
      message:
        "Are you sure you want to transition this outbound delivery to 'IN_DELIVERY' status? This signifies materials are physically departing.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/sales/deliveries/${id}/start-delivery`,
            { method: "POST" },
            user?.username,
          );
          if (res.ok) {
            showToast("Delivery Started", "success");
            fetchDeliveries();
          } else {
            showToast(res.error || "Failed", "error");
          }
        } catch (err) {}
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const [showFinishModal, setShowFinishModal] = useState(false);
  const [selectedFinishDn, setSelectedFinishDn] = useState<any>(null);
  const [finishCloudUrl, setFinishCloudUrl] = useState("");
  const [finishDnFile, setFinishDnFile] = useState<File | null>(null);
  const [authDocName, setAuthDocName] = useState("");

  const handleFinishDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinishDn || (!finishCloudUrl && !finishDnFile))
      return showToast("Select or upload a scanned manifest document first", "error");
    setIsSubmitting(true);
    try {
      let finalUrl = finishCloudUrl;
      if (!finalUrl && finishDnFile) {
        const formData = new FormData();
        formData.append("file", finishDnFile);
        const upRes = await apiFetch(
          "/api/upload",
          { method: "POST", body: formData },
          user?.username,
        );
        if (!upRes.ok) throw new Error(upRes.error || "Upload failed");
        finalUrl = upRes.data.url || upRes.data.fileUrl;
      }

      const res = await apiFetch(
        `/api/sales/deliveries/${selectedFinishDn.id}/finish-delivery`,
        {
          method: "POST",
          body: JSON.stringify({
            file_url: finalUrl,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Delivery Completed Successfully", "success");
        setShowFinishModal(false);
        setFinishCloudUrl("");
        setFinishDnFile(null);
        setAuthDocName("");
        setSelectedFinishDn(null);
        fetchDeliveries();
      } else {
        showToast(res.error || "Failed", "error");
      }
    } catch (err) {
      showToast("Error processing delivery signature", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const viewDeliveryDoc = async (id: string) => {
    try {
      const res = await apiFetch(
        `/api/sales/deliveries/${id}`,
        {},
        user?.username,
      );
      if (res.ok) {
        setPreviewDn(res.data);
      }
    } catch (e) {}
  };

  const exportPdf = async () => {
    if (!printDocRef.current || !previewDn) return;
    setIsSubmitting(true);
    try {
      await generatePDF(printDocRef.current, `${previewDn.dn_number}.pdf`);
      showToast("PDF exported successfully", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to generate PDF", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCustomer = customers.find(
    (c) => c.id === deliveryForm.customer_id,
  );

  const totalDnCount = deliveries.length;
  const pendingAuthCount = deliveries.filter(
    (d) => d.status === "DRAFT" || d.status === "REVISION",
  ).length;
  const inTransitCount = deliveries.filter((d) =>
    ["AUTHORIZED", "PENDING_DELIVERY", "IN_DELIVERY"].includes(d.status),
  ).length;
  const completedCount = deliveries.filter((d) =>
    ["DELIVERED", "COMPLETED", "FINISHED"].includes(d.status),
  ).length;

  const filteredDeliveries = deliveries.filter((d) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (d.dn_number || "").toLowerCase().includes(q) ||
      (d.customer_name || "").toLowerCase().includes(q) ||
      (d.quotation_number || "").toLowerCase().includes(q) ||
      (d.project_name || "").toLowerCase().includes(q) ||
      (d.project_names || "").toLowerCase().includes(q) ||
      (d.police_number || "").toLowerCase().includes(q);

    let matchesStatus = true;
    if (statusFilter === "DRAFT") {
      matchesStatus = d.status === "DRAFT";
    } else if (statusFilter === "IN_TRANSIT") {
      matchesStatus = ["AUTHORIZED", "PENDING_DELIVERY", "IN_DELIVERY"].includes(d.status);
    } else if (statusFilter === "COMPLETED") {
      matchesStatus = ["DELIVERED", "COMPLETED", "FINISHED"].includes(d.status);
    } else if (statusFilter === "REVISION") {
      matchesStatus = d.status === "REVISION";
    }

    let matchesType = true;
    const isPartial = Boolean(d.is_partial || d.delivery_type === "PARTIAL");
    if (typeFilter === "FULL") {
      matchesType = !isPartial;
    } else if (typeFilter === "PARTIAL") {
      matchesType = isPartial;
    }

    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      <PageHeader
        title="Delivery Manifests"
        subtitle="Outbound shipments & fleet dispatch"
        icon={<Truck className="w-6 h-6 text-stone-700" />}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => {
                fetchDeliveries();
                fetchSupportData();
              }}
              disabled={isLoading}
              title="Refresh Deliveries"
              aria-label="Refresh Deliveries"
            >
              <RefreshCw
                className={cn(
                  "w-3.5 h-3.5 text-stone-500",
                  isLoading && "animate-spin",
                )}
              />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedReceiptDn(null);
                setShowReceiptModal(true);
              }}
              leftIcon={<FileCheck className="w-4 h-4 text-stone-600" />}
              title="Download A5 Blank Receipt Template PDF"
            >
              Receipt Template (A5 PDF)
            </Button>
            {hasPermission(user, Action.CREATE_DELIVERY) && (
              <Button
                size="sm"
                onClick={() => {
                  setRevisingDn(null);
                  setDeliveryForm({
                    customer_id: "",
                    quotation_id: "",
                    project_id: "",
                    remarks: "",
                    items: [],
                    police_number: "",
                    delivery_type: "FULL",
                    is_partial: false,
                  });
                  setShowDeliveryModal(true);
                }}
                leftIcon={<ArrowUpRight className="w-4 h-4" />}
              >
                Initiate Delivery
              </Button>
            )}
          </div>
        }
      />

      {/* Unified Search & Filter Control Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-stone-200/80 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex-1 max-w-md">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search DN ref, customer, quotation, project, vehicle plate..."
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200/70">
            {(
              [
                { id: "ALL", label: "All Types" },
                { id: "FULL", label: "Full" },
                { id: "PARTIAL", label: "Partial Lot" },
              ] as const
            ).map((tf) => (
              <Button
                key={tf.id}
                variant={typeFilter === tf.id ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setTypeFilter(tf.id)}
              >
                {tf.label}
              </Button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200/70 overflow-x-auto">
            {(
              [
                { id: "ALL", label: `All (${totalDnCount})` },
                { id: "DRAFT", label: "Awaiting Auth" },
                { id: "IN_TRANSIT", label: `In-Transit (${inTransitCount})` },
                { id: "COMPLETED", label: `Completed (${completedCount})` },
                { id: "REVISION", label: "Revision" },
              ] as const
            ).map((st) => (
              <Button
                key={st.id}
                variant={statusFilter === st.id ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setStatusFilter(st.id)}
              >
                {st.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Active Delivery Manifests Table */}
      <div className="bg-white rounded-2xl border border-stone-200/80 overflow-hidden shadow-2xs">
        <div className="border-b border-stone-200/70 bg-stone-50/60 px-5 py-3.5 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-stone-700" />
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Outbound Delivery Ledger
            </h3>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-bold bg-stone-100 text-stone-700 border border-stone-200/80">
              {filteredDeliveries.length} record{filteredDeliveries.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="text-[11px] font-semibold text-stone-500">
            Click any row to preview & export official Delivery Note PDF
          </div>
        </div>

        <Table wrapperClassName="border-0 rounded-none">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[165px]">DN Ref & Date</TableHead>
              <TableHead className="min-w-[240px]">Destination & Scope</TableHead>
              <TableHead className="min-w-[160px]">Fleet & Dispatch</TableHead>
              <TableHead className="min-w-[170px]">Status</TableHead>
              <TableHead className="w-[220px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableEmpty
                colSpan={5}
                icon={<RefreshCw className="w-7 h-7 text-stone-300 animate-spin" />}
                message="Loading outbound delivery manifests..."
              />
            ) : filteredDeliveries.length === 0 ? (
              <TableRow hoverable={false}>
                <TableCell colSpan={5} className="py-14 text-center">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-600 mb-3 shadow-2xs">
                      <Truck className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-bold text-stone-800">
                      {deliveries.length === 0
                        ? "No delivery manifests registered yet"
                        : "No delivery manifests match your filter"}
                    </p>
                    <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                      {deliveries.length === 0
                        ? "Create an outbound delivery note from an approved quotation or completed manufacturing lot to dispatch goods."
                        : "Try clearing your search query or switching the status filter tab above."}
                    </p>
                    {deliveries.length === 0 &&
                      hasPermission(user, Action.CREATE_DELIVERY) && (
                        <Button
                          size="sm"
                          className="mt-4"
                          onClick={() => {
                            setRevisingDn(null);
                            setDeliveryForm({
                              customer_id: "",
                              quotation_id: "",
                              project_id: "",
                              remarks: "",
                              items: [],
                              police_number: "",
                              delivery_type: "FULL",
                              is_partial: false,
                            });
                            setShowDeliveryModal(true);
                          }}
                          leftIcon={<ArrowUpRight className="w-4 h-4" />}
                        >
                          Initiate First Delivery
                        </Button>
                      )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredDeliveries.map((d) => (
                <TableRow
                  key={d.id}
                  className="group cursor-pointer"
                  onClick={() => viewDeliveryDoc(d.id)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono tabular-nums text-stone-900">
                        {d.dn_number}
                      </span>
                      {d.is_partial || d.delivery_type === "PARTIAL" ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          Partial
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          Full
                        </span>
                      )}
                    </div>
                    {d.created_at && (
                      <div className="flex items-center gap-1.5 text-[11px] text-stone-400 font-mono tabular-nums mt-1">
                        <Calendar className="w-3 h-3 text-stone-400 shrink-0" />
                        <span>
                          {new Date(d.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="truncate max-w-[260px]">
                        {d.customer_name || "Unassigned Customer"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {d.quotation_number ? (
                        <span className="px-2 py-0.5 bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-mono tabular-nums font-bold rounded-md flex items-center gap-1">
                          <FileText className="w-3 h-3 text-stone-500" />
                          {d.quotation_number}
                        </span>
                      ) : d.project_name ? (
                        <span className="px-2 py-0.5 bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-mono tabular-nums font-bold rounded-md">
                          {d.project_name}
                        </span>
                      ) : null}

                      {d.project_names && (
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono"
                          title={`Scope Projects: ${d.project_names}`}
                        >
                          {d.project_names.includes(",")
                            ? `Bulk (${d.project_names.split(",").length} Projects)`
                            : d.project_names}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    {d.police_number ? (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200/80 text-stone-800 font-mono tabular-nums text-xs font-bold">
                        <Truck className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                        <span>{d.police_number}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400 italic">
                        Vehicle pending
                      </span>
                    )}
                    {d.remarks && (
                      <div className="text-[11px] text-stone-500 truncate max-w-[180px] mt-1">
                        {d.remarks}
                      </div>
                    )}
                  </TableCell>

                  <TableCell>
                    <span className="px-2.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest inline-flex items-center gap-1.5 border border-stone-200/90 bg-stone-50/70 text-stone-700 shadow-2xs">
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          d.status === "DRAFT"
                            ? "bg-amber-500"
                            : d.status === "REVISION"
                              ? "bg-rose-500"
                              : d.status === "AUTHORIZED" ||
                                  d.status === "PENDING_DELIVERY" ||
                                  d.status === "IN_DELIVERY"
                                ? "bg-stone-700"
                                : "bg-emerald-500"
                        )}
                      />
                      {d.status === "DRAFT"
                        ? "Awaiting Sales Auth"
                        : d.status === "AUTHORIZED"
                          ? "Authorized (Warehouse)"
                          : d.status === "PENDING_DELIVERY"
                            ? "Dispatched"
                            : d.status.replace("_", " ")}
                    </span>
                    {d.status === "REVISION" && d.revision_note && (
                      <div className="mt-1.5 flex items-start gap-1 p-1.5 bg-rose-50 border border-rose-100 rounded text-[10px] text-rose-700 max-w-[200px]">
                        <span className="italic leading-snug break-words">
                          "{d.revision_note}"
                        </span>
                      </div>
                    )}
                    {d.authorized_by && (
                      <div className="text-[10px] font-medium text-stone-400 mt-1">
                        Auth: {d.authorized_by}
                      </div>
                    )}
                  </TableCell>

                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end items-center gap-2">
                      {d.status === "DRAFT" &&
                        hasPermission(user, Action.AUTH_DELIVERY) && (
                          <Button
                            size="xs"
                            action="authorize"
                            onClick={(e) => handleAuthorizeDn(d, e)}
                          />
                        )}
                      {(d.status === "DRAFT" || d.status === "AUTHORIZED") &&
                        (hasPermission(user, Action.AUTH_DELIVERY) ||
                          hasPermission(user, Action.DISPATCH_GOODS)) && (
                          <Button
                            size="xs"
                            action="revise"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDnToRevise(d);
                              setShowReviseModal(true);
                            }}
                          />
                        )}
                      {d.status === "REVISION" &&
                        hasPermission(user, Action.CREATE_DELIVERY) && (
                          <Button
                            size="xs"
                            action="revise"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const res = await apiFetch(
                                `/api/sales/deliveries/${d.id}`,
                                {},
                                user?.username,
                              );
                              if (res.ok) {
                                setRevisingDn(res.data);
                                setDeliveryForm({
                                  customer_id: res.data.customer_id || "",
                                  quotation_id: res.data.quotation_id || "",
                                  project_id: res.data.project_id || "",
                                  police_number: res.data.police_number || "",
                                  remarks: res.data.remarks || "",
                                  delivery_type: res.data.delivery_type || "FULL",
                                  is_partial: !!res.data.is_partial,
                                  items: res.data.items.map((i: any) => ({
                                    item_id: i.item_id,
                                    item_code: i.item_code,
                                    item_name: i.item_name,
                                    qty: i.qty,
                                    uom: i.uom || "Unit",
                                  })),
                                });
                                setShowDeliveryModal(true);
                              }
                            }}
                          />
                        )}
                      {(d.status === "IN_DELIVERY" || d.status === "PENDING_DELIVERY") &&
                        (hasPermission(user, Action.CREATE_DELIVERY) ||
                          hasPermission(user, Action.DISPATCH_GOODS) ||
                          hasPermission(user, Action.SALES_ACTION)) && (
                          <Button
                            size="xs"
                            variant="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFinishDn(d);
                              setShowFinishModal(true);
                            }}
                          >
                            <PackageOpen className="w-3.5 h-3.5" /> Finish
                            Delivery
                          </Button>
                        )}
                      <Button
                        size="xs"
                        action="view"
                        onClick={(e) => {
                          e.stopPropagation();
                          viewDeliveryDoc(d.id);
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DeliveriesModals
        customers={customers}
        quotations={quotations}
        projects={projects}
        fgItems={fgItems}
        isSubmitting={isSubmitting}
        showToast={showToast}
        showDeliveryModal={showDeliveryModal}
        setShowDeliveryModal={setShowDeliveryModal}
        revisingDn={revisingDn}
        setRevisingDn={setRevisingDn}
        deliveryForm={deliveryForm}
        setDeliveryForm={setDeliveryForm}
        handleCreateDelivery={handleCreateDelivery}
        showItemSelectModal={showItemSelectModal}
        setShowItemSelectModal={setShowItemSelectModal}
        addItemToDelivery={addItemToDelivery}
        showReviseModal={showReviseModal}
        setShowReviseModal={setShowReviseModal}
        selectedDnToRevise={selectedDnToRevise}
        revisionNote={revisionNote}
        setRevisionNote={setRevisionNote}
        handleReviseDn={handleReviseDn}
        showFinishModal={showFinishModal}
        setShowFinishModal={setShowFinishModal}
        selectedFinishDn={selectedFinishDn}
        finishCloudUrl={finishCloudUrl}
        setFinishCloudUrl={setFinishCloudUrl}
        finishDnFile={finishDnFile}
        setFinishDnFile={setFinishDnFile}
        setAuthDocName={setAuthDocName}
        handleFinishDelivery={handleFinishDelivery}
        previewDn={previewDn}
        setPreviewDn={setPreviewDn}
        printDocRef={printDocRef}
        exportPdf={exportPdf}
        confirmModal={confirmModal}
        setConfirmModal={setConfirmModal}
        showAuthorizeModal={showAuthorizeModal}
        setShowAuthorizeModal={setShowAuthorizeModal}
        selectedDnToAuth={selectedDnToAuth}
        setAuthPin={setAuthPin}
        submitAuthorizeDn={submitAuthorizeDn}
        showReceiptModal={showReceiptModal}
        setShowReceiptModal={setShowReceiptModal}
        selectedReceiptDn={selectedReceiptDn}
        receiptForm={receiptForm}
        receiptDocRef={receiptDocRef}
        handleExportReceiptPdf={handleExportReceiptPdf}
      />
    </div>
  );
}
