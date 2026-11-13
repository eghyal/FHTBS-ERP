import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { formatIDR } from "@/lib/utils";
import {
  getNextProjectSequence,
  generateSmartProjectId,
} from "@/utils/autoCoding";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { FolderKanban, RotateCcw, ShieldCheck, AlertCircle } from "lucide-react";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (ntpData?: any, projectData?: any) => void;
  initialQuotationId?: string;
  initialCtpDate?: string;
  initialNetMtoQty?: number;
}

export function CreateProjectModal({
  isOpen,
  onClose,
  onSuccess,
  initialQuotationId,
  initialCtpDate,
  initialNetMtoQty,
}: CreateProjectModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [quotations, setQuotations] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedQuoToAuth, setSelectedQuoToAuth] = useState<any>(null);
  const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [pendingQuoWarning, setPendingQuoWarning] = useState<any>(null);
  const [atpCtpInfo, setAtpCtpInfo] = useState<any>(null);

  const [formData, setFormData] = useState({
    id: "",
    name: "",
    customer: "",
    due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    urgency: "NORMAL" as "NORMAL" | "URGENT" | "CRITICAL",
    parent_project_id: "",
    remarks: "",
    quotation_id: "",
    qty: 1,
    uom: "Unit",
    quotation_item_id: "",
  });

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkProjects, setBulkProjects] = useState<
    Array<{
      id: string;
      name: string;
      remarks: string;
      qty?: number;
      uom?: string;
      quotation_item_id?: string;
    }>
  >([{ id: "", name: "", remarks: "" }]);

  const currentYear = new Date().getFullYear();
  const nextProjectSeq = useMemo(
    () => getNextProjectSequence(projects, currentYear),
    [projects, currentYear],
  );

  useEffect(() => {
    if (isOpen) {
      fetchData();
    } else {
      setAtpCtpInfo(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !formData.quotation_id) {
      setAtpCtpInfo(null);
      return;
    }
    let active = true;
    apiFetch(`/api/quotations/${formData.quotation_id}/atp-ctp`, {}, user?.username)
      .then((res) => {
        if (active && res.ok && res.data) {
          setAtpCtpInfo(res.data);
          if (initialCtpDate) {
            setFormData((prev) => ({
              ...prev,
              due_date: initialCtpDate,
              qty: initialNetMtoQty && initialNetMtoQty > 0 ? initialNetMtoQty : prev.qty,
            }));
          } else if (res.data.ctp_promise_date) {
            setFormData((prev) => ({
              ...prev,
              due_date: res.data.ctp_promise_date,
            }));
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, formData.quotation_id, initialCtpDate, initialNetMtoQty]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [quoRes, prjRes] = await Promise.all([
        apiFetch("/api/quotations", {}, user?.username),
        apiFetch("/api/projects?archived=all", {}, user?.username),
      ]);

      let quoList = [];
      if (quoRes.ok) {
        quoList = Array.isArray(quoRes.data)
          ? quoRes.data
          : quoRes.data?.data || [];
        setQuotations(quoList);
      }

      let prjList: any[] = [];
      if (prjRes.ok) {
        prjList = Array.isArray(prjRes.data)
          ? prjRes.data
          : prjRes.data?.data || [];
        setProjects(prjList);
      }

      const calculatedSeq = getNextProjectSequence(prjList, currentYear);
      const generatedId = generateSmartProjectId(calculatedSeq, currentYear);

      // Handle default/initial quotation selection with strict authorization check
      const targetQuoId = initialQuotationId || "";
      const authorizedQuos = quoList.filter(
        (q: any) => q.status === "APPROVED" || q.status === "AUTHORIZED",
      );

      let initialQuo = authorizedQuos.find((q: any) => q.id === targetQuoId);
      const pendingInitialQuo = !initialQuo && targetQuoId
        ? quoList.find((q: any) => q.id === targetQuoId)
        : null;

      if (initialQuo) {
        setPendingQuoWarning(null);
        applyQuotationToForm(initialQuo, generatedId, calculatedSeq);
      } else if (pendingInitialQuo) {
        // If quotation exists but is not yet authorized, provide clear warning & direct authorization
        setPendingQuoWarning(pendingInitialQuo);
        setFormData((prev) => ({
          ...prev,
          id: generatedId,
          quotation_id: "",
          customer: pendingInitialQuo.customer_name || pendingInitialQuo.customer_id || "",
          name: pendingInitialQuo.title || "",
        }));
      } else if (authorizedQuos.length > 0 && !targetQuoId) {
        setPendingQuoWarning(null);
        applyQuotationToForm(authorizedQuos[0], generatedId, calculatedSeq);
      } else {
        setPendingQuoWarning(null);
        setFormData((prev) => ({
          ...prev,
          id: generatedId,
          quotation_id: "",
          customer: "",
          name: "",
        }));
        setBulkMode(false);
        setBulkProjects([{ id: generatedId, name: "", remarks: "" }]);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load initial data for project setup", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const applyQuotationToForm = (
    selectedQuo: any,
    currentProjId?: string,
    startSeq?: number,
  ) => {
    const quoId = selectedQuo.id;
    const qItems = selectedQuo.items || [];
    const isBulk = qItems.length > 1;

    const seqToUse = startSeq ?? nextProjectSeq;
    const baseProjId =
      currentProjId || generateSmartProjectId(seqToUse, currentYear);

    if (isBulk) {
      setFormData((prev) => ({
        ...prev,
        id: baseProjId,
        quotation_id: quoId,
        customer: selectedQuo.customer_name || selectedQuo.customer_id,
        name: selectedQuo.title || "",
      }));
      setBulkMode(true);
      setBulkProjects(
        qItems.map((it: any, i: number) => ({
          id: generateSmartProjectId(seqToUse + i, currentYear),
          name: it.title || `${selectedQuo.title} - Item ${i + 1}`,
          remarks: `Derived from quotation item: ${it.title}`,
          qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
          uom: it.uom || "Unit",
          quotation_item_id: it.id,
        })),
      );
    } else {
      setBulkMode(false);
      const singleQty =
        qItems.length === 1 && Number(qItems[0].qty) > 0
          ? Number(qItems[0].qty)
          : Number(selectedQuo.qty) > 0
            ? Number(selectedQuo.qty)
            : 1;
      const singleUom =
        qItems.length === 1 ? qItems[0].uom || "Unit" : "Unit";
      const singleQuoItemId = qItems.length === 1 ? qItems[0].id : "";

      setFormData((prev) => ({
        ...prev,
        id: baseProjId,
        quotation_id: quoId,
        customer: selectedQuo.customer_name || selectedQuo.customer_id,
        name: selectedQuo.title || "",
        qty: singleQty,
        uom: singleUom,
        quotation_item_id: singleQuoItemId,
      }));
      setBulkProjects([
        {
          id: baseProjId,
          name: "",
          remarks: "",
          qty: singleQty,
          uom: singleUom,
          quotation_item_id: singleQuoItemId,
        },
      ]);
    }
  };

  const handleAuthorizeQuotation = async (pin: string) => {
    if (!selectedQuoToAuth) return;
    setIsAuthorizing(true);
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
        showToast("Quotation authorized successfully!", "success");
        setShowAuthorizeModal(false);
        setPendingQuoWarning(null);
        // Refresh quotations list
        const quoRes = await apiFetch("/api/quotations", {}, user?.username);
        if (quoRes.ok) {
          const freshList = Array.isArray(quoRes.data)
            ? quoRes.data
            : quoRes.data?.data || [];
          setQuotations(freshList);
          const authorizedItem = freshList.find((q: any) => q.id === selectedQuoToAuth.id);
          if (authorizedItem) {
            applyQuotationToForm(authorizedItem);
          }
        }
        setSelectedQuoToAuth(null);
      } else {
        showToast(res.error || "Failed to authorize quotation", "error");
      }
    } catch (err: any) {
      showToast("Network error while authorizing quotation", "error");
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.quotation_id) {
      showToast("Please select an approved sales quotation", "error");
      return;
    }
    setShowConfirmModal(true);
  };

  const submitCreateProject = async () => {
    setIsSubmitting(true);
    try {
      let res;
      if (bulkMode) {
        res = await apiFetch(
          "/api/projects/bulk",
          {
            method: "POST",
            body: JSON.stringify({
              common: {
                customer: formData.customer,
                due_date: formData.due_date,
                urgency: formData.urgency,
                parent_project_id: formData.parent_project_id,
                remarks: formData.remarks,
                quotation_id: formData.quotation_id,
              },
              projects: bulkProjects.filter((p) => p.name.trim() !== ""),
            }),
          },
          user?.username,
        );
      } else {
        res = await apiFetch(
          "/api/projects",
          {
            method: "POST",
            body: JSON.stringify(formData),
          },
          user?.username,
        );
      }

      if (res.ok) {
        showToast("Project created successfully.", "success");
        setShowConfirmModal(false);
        
        let ntpData = null;
        let projectData = null;
        if (res.data?.data?.ntp) {
          ntpData = res.data.data.ntp;
          projectData = {
            id: res.data.data.id || res.data.data.ntp.project_id,
            ...formData,
          };
        } else if (res.data?.ntp) {
          ntpData = res.data.ntp;
          projectData = {
            id: res.data.id || res.data.ntp?.project_id || formData.id,
            ...formData,
          };
        }
        
        onSuccess(ntpData, projectData);
        onClose();
      } else {
        const errorMsg = res.details
          ? `${res.error}: ${res.details}`
          : res.error || "Failed to create project";
        showToast(errorMsg, "error");
      }
    } catch (err: any) {
      showToast("Network or server error while creating project", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen && !showConfirmModal}
        onClose={onClose}
        maxWidth="4xl"
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-700 shrink-0 shadow-2xs">
              <FolderKanban className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-stone-900 tracking-tighter uppercase leading-none">
                Initialize Project
              </h3>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-1.5">
                Sales Quotation to Project Conversion
              </p>
            </div>
          </div>
        }
        contentClassName="p-0 flex flex-col h-[90vh]"
      >
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden min-h-0"
        >
          {/* Modal Body - Scrollable */}
          <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8 custom-scrollbar bg-[#F9F9F8]/30">
            {/* Specific Fields Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                  Project ID (Auto-Generated by System)
                </label>
                <div className="relative group">
                  <FolderKanban className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 transition-colors" />
                  <input
                    type="text"
                    readOnly
                    value={
                      formData.id ||
                      generateSmartProjectId(nextProjectSeq, currentYear)
                    }
                    className="w-full pl-11 pr-4 h-[52px] bg-stone-100 border border-stone-200 rounded-2xl text-sm font-mono font-bold text-stone-700 outline-none cursor-not-allowed select-all shadow-none"
                  />
                </div>
              </div>

              <div className="space-y-3 md:col-span-2 bg-stone-50 p-6 rounded-3xl border border-stone-200">
                {pendingQuoWarning && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-black text-amber-900 uppercase tracking-wider">
                          Quotation Not Yet Authorized (Status: PENDING)
                        </div>
                        <p className="text-xs text-amber-800 font-medium mt-0.5">
                          Quotation <strong>[{pendingQuoWarning.quotation_number}] {pendingQuoWarning.title}</strong> is not yet authorized. Conversion to a Project & Work Order requires an <strong>APPROVED / AUTHORIZED</strong> Quotation.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedQuoToAuth(pendingQuoWarning);
                        setShowAuthorizeModal(true);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Authorize Now
                    </Button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">
                      Referenced Sales Quotation (Authorized Quotation) *
                    </label>
                    {quotations.filter((q) => q.status === "APPROVED" || q.status === "AUTHORIZED").length > 0 && (
                      <span className="text-[10px] text-emerald-700 font-black flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        {quotations.filter((q) => q.status === "APPROVED" || q.status === "AUTHORIZED").length} Authorized Quotations Available
                      </span>
                    )}
                  </div>
                  <select
                    required
                    value={formData.quotation_id || ""}
                    onChange={(e) => {
                      const quoId = e.target.value;
                      const selectedQuo = quotations.find((q) => q.id === quoId);
                      if (selectedQuo) {
                        if (selectedQuo.status === "APPROVED" || selectedQuo.status === "AUTHORIZED") {
                          setPendingQuoWarning(null);
                          applyQuotationToForm(selectedQuo);
                        } else {
                          setPendingQuoWarning(selectedQuo);
                          setFormData({
                            ...formData,
                            quotation_id: "",
                            customer: selectedQuo.customer_name || selectedQuo.customer_id || "",
                            name: selectedQuo.title || "",
                          });
                        }
                      } else {
                        setPendingQuoWarning(null);
                        setFormData({
                          ...formData,
                          quotation_id: "",
                          customer: "",
                          name: "",
                        });
                        setBulkMode(false);
                        setBulkProjects([{ id: "", name: "", remarks: "" }]);
                      }
                    }}
                    className="w-full px-5 h-[52px] bg-white border border-stone-200 rounded-2xl text-sm font-bold text-stone-900 focus:border-stone-900 focus:ring-4 focus:ring-stone-100 outline-none transition-all shadow-sm cursor-pointer"
                  >
                    <option value="">-- Select Authorized Quotation --</option>
                    {quotations.filter((q) => q.status === "APPROVED" || q.status === "AUTHORIZED").length > 0 && (
                      <optgroup label="Authorized Quotations (Approved / Authorized)">
                        {quotations
                          .filter((q) => q.status === "APPROVED" || q.status === "AUTHORIZED")
                          .map((q) => (
                            <option key={q.id} value={q.id}>
                              [{q.quotation_number}] {q.title} - {q.customer_name} ({formatIDR(q.amount || 0)})
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {quotations.filter((q) => q.status === "PENDING").length > 0 && (
                      <optgroup label="Pending Authorization (Requires Authorization First)">
                        {quotations
                          .filter((q) => q.status === "PENDING")
                          .map((q) => (
                            <option key={q.id} value={q.id}>
                              [{q.quotation_number}] {q.title} - {q.customer_name} (PENDING - Needs Authorization)
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>

                  {quotations.filter((q) => q.status === "APPROVED" || q.status === "AUTHORIZED").length === 0 && (
                    <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-xs text-stone-600 flex items-center justify-between gap-2 mt-2">
                      <span>No Authorized (APPROVED) Quotations found yet.</span>
                      {quotations.filter((q) => q.status === "PENDING").length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const pendingOne = quotations.find((q) => q.status === "PENDING");
                            if (pendingOne) {
                              setSelectedQuoToAuth(pendingOne);
                              setShowAuthorizeModal(true);
                            }
                          }}
                          className="text-xs font-bold text-blue-700 hover:text-blue-900 underline shrink-0"
                        >
                          Authorize Quotation ({quotations.filter((q) => q.status === "PENDING").length} Pending)
                        </button>
                      )}
                    </div>
                  )}

                  <p className="text-[9px] text-blue-700 font-bold mt-1.5 uppercase tracking-wider ml-1">
                    Selecting an authorized Quotation automatically populates customer details, project title, official quantity, and work order line items.
                  </p>

                  {atpCtpInfo && (
                    <div className="mt-3 p-3.5 rounded-xl bg-white border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5 text-xs">
                        <div className="flex items-center gap-2 font-semibold text-stone-800">
                          <span>ATP/CTP Capacity Engine</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-bold text-indigo-700">
                            Mode: {atpCtpInfo.recommended_mode}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-stone-600 tabular-nums">
                            FF: {atpCtpInfo.capacity_telemetry?.factory_factor_wma ?? 85}%
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-600 font-mono tabular-nums">
                          ATP Free Stock: {atpCtpInfo.summary?.total_atp_qty ?? 0} · Net MTO Required:{" "}
                          <strong>{atpCtpInfo.summary?.total_net_mto_qty ?? 0}</strong> · Est. CTP Date:{" "}
                          <strong className="text-emerald-700">{atpCtpInfo.ctp_promise_date}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            due_date: atpCtpInfo.ctp_promise_date || prev.due_date,
                            qty:
                              atpCtpInfo.summary?.total_net_mto_qty > 0
                                ? atpCtpInfo.summary.total_net_mto_qty
                                : prev.qty,
                          }));
                          if (bulkMode && Array.isArray(atpCtpInfo.items)) {
                            setBulkProjects((prevBulk) =>
                              prevBulk.map((bp, i) => {
                                const match = atpCtpInfo.items[i];
                                if (!match) return bp;
                                return {
                                  ...bp,
                                  qty: match.net_mto_qty > 0 ? match.net_mto_qty : bp.qty,
                                };
                              })
                            );
                          }
                          showToast(
                            `Applied CTP Promise Date (${atpCtpInfo.ctp_promise_date}) & Net MTO Qty`,
                            "success"
                          );
                        }}
                        className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[11px] font-bold shrink-0 cursor-pointer transition-colors"
                      >
                        Apply CTP Date &amp; Net MTO
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                  Project Title (Auto-derived)
                </label>
                <input
                  disabled
                  required={!bulkMode}
                  type="text"
                  value={formData.name}
                  placeholder="Inherited from selected Quotation"
                  className="w-full px-5 h-[52px] bg-stone-100 border border-stone-200 rounded-2xl text-sm font-bold text-stone-500 outline-none cursor-not-allowed shadow-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                  Client / Target Customer (Auto-derived)
                </label>
                <input
                  disabled
                  required={!bulkMode}
                  type="text"
                  value={formData.customer || ""}
                  placeholder="Inherited from selected Quotation"
                  className="w-full px-5 h-[52px] bg-stone-100 border border-stone-250 rounded-2xl text-sm font-bold text-stone-500 outline-none cursor-not-allowed shadow-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                  Reference Group (Optional)
                </label>
                <Select
                  value={formData.parent_project_id}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      parent_project_id: e.target.value,
                    })
                  }
                  className="w-full px-5 !h-[52px] bg-white border border-stone-200 rounded-2xl text-sm font-bold text-stone-900 focus:border-stone-900 outline-none transition-all shadow-sm cursor-pointer"
                >
                  <option value="">No Parent Reference</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.id}] {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                    Delivery Deadline
                  </label>
                  <input
                    required
                    type="date"
                    value={formData.due_date}
                    onChange={(e) =>
                      setFormData({ ...formData, due_date: e.target.value })
                    }
                    className="w-full px-5 h-[52px] bg-white border border-stone-200 rounded-2xl text-xs font-bold text-stone-900 focus:border-stone-900 outline-none transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                    Urgency Level
                  </label>
                  <Select
                    value={formData.urgency}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        urgency: e.target.value as any,
                      })
                    }
                    className="w-full px-5 !h-[52px] bg-white border border-stone-200 rounded-2xl text-xs font-bold text-stone-900 focus:border-stone-900 outline-none transition-all shadow-sm cursor-pointer"
                  >
                    <option value="NORMAL">Normal Priority</option>
                    <option value="URGENT">Urgent Priority</option>
                    <option value="CRITICAL">Critical Path</option>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">
                  Operational Remarks
                </label>
                <textarea
                  value={formData.remarks}
                  onChange={(e) =>
                    setFormData({ ...formData, remarks: e.target.value })
                  }
                  placeholder="Internal notes or project constraints..."
                  className="w-full px-5 py-4 bg-white border border-stone-200 rounded-2xl text-xs font-medium text-stone-900 focus:border-stone-900 outline-none transition-all shadow-sm resize-none min-h-[64px]"
                />
              </div>

              {bulkMode && (
                <div className="md:col-span-2 space-y-4 pt-6 border-t border-stone-200 mt-4">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest ml-1">
                    Bulk Project Setup (Derived from Quotation Items)
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    {bulkProjects.map((p, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-4 rounded-xl border border-stone-200 flex flex-col md:flex-row gap-4"
                      >
                        <div className="w-full md:w-1/4">
                          <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                            Project ID (By System)
                          </label>
                          <input
                            type="text"
                            readOnly
                            value={
                              p.id ||
                              generateSmartProjectId(
                                nextProjectSeq + idx,
                                currentYear,
                              )
                            }
                            className="w-full text-xs font-mono font-bold border-b border-stone-200 text-stone-600 outline-none py-1 bg-transparent cursor-not-allowed select-all"
                          />
                        </div>
                        <div className="w-full md:w-1/3">
                          <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                            Title
                          </label>
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => {
                              const nb = [...bulkProjects];
                              nb[idx].name = e.target.value;
                              setBulkProjects(nb);
                            }}
                            className="w-full text-xs font-bold border-b border-stone-200 focus:border-stone-900 outline-none py-1 bg-transparent"
                          />
                        </div>
                        <div className="w-full md:w-1/6">
                          <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                            Qty
                          </label>
                          <input
                            type="number"
                            value={p.qty || 1}
                            onChange={(e) => {
                              const nb = [...bulkProjects];
                              nb[idx].qty = Number(e.target.value);
                              setBulkProjects(nb);
                            }}
                            className="w-full text-xs font-bold border-b border-stone-200 focus:border-stone-900 outline-none py-1 bg-transparent"
                            min="1"
                          />
                        </div>
                        <div className="w-full md:w-1/6">
                          <label className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                            UOM
                          </label>
                          <input
                            type="text"
                            value={p.uom || "Unit"}
                            onChange={(e) => {
                              const nb = [...bulkProjects];
                              nb[idx].uom = e.target.value;
                              setBulkProjects(nb);
                            }}
                            className="w-full text-xs font-bold border-b border-stone-200 focus:border-stone-900 outline-none py-1 bg-transparent"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-8 py-6 border-t border-stone-100 bg-white flex justify-between items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setFormData((prev) => ({
                  ...prev,
                  quotation_id: "",
                  customer: "",
                  name: "",
                  remarks: "",
                }));
                setBulkMode(false);
                setBulkProjects([{ id: "", name: "", remarks: "" }]);
              }}
              className="px-4 py-2 text-stone-400 hover:text-stone-700 rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 group cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform" />{" "}
              Reset Form
            </button>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isLoading}>
                {isSubmitting ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Creating Project...
                  </>
                ) : bulkMode ? (
                  `Create Batch (${bulkProjects.filter((p) => (p.name || "").trim() !== "").length} Projects)`
                ) : (
                  "Create Project"
                )}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={showConfirmModal}
        onCancel={() => setShowConfirmModal(false)}
        onConfirm={submitCreateProject}
        title="Confirm Project Initialization"
        message={
          <>
            Are you sure you want to initialize project(s) for quotation{" "}
            <strong>{formData.quotation_id}</strong>? This will create live project record(s) and allow Engineering to begin BOM creation.
          </>
        }
      />

      {selectedQuoToAuth && (
        <AuthorizeDocModal
          isOpen={showAuthorizeModal}
          onClose={() => {
            setShowAuthorizeModal(false);
            setSelectedQuoToAuth(null);
          }}
          docType="Quotation"
          docNumber={selectedQuoToAuth.quotation_number || selectedQuoToAuth.id}
          projectName={selectedQuoToAuth.title}
          partnerName={selectedQuoToAuth.customer_name || selectedQuoToAuth.customer_id}
          amount={selectedQuoToAuth.amount}
          status="PENDING"
          isSubmitting={isAuthorizing}
          onAuthorize={handleAuthorizeQuotation}
          submitLabel="Authorize & Approve Quotation"
        />
      )}
    </>
  );
}
