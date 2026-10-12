import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { ClipboardList, Plus, History } from "lucide-react";

interface BomItemRow {
  id: string;
  item_id?: string;
  item_code?: string;
  item_name: string;
  specification?: string;
  part_number?: string;
  qty: number;
  uom: string;
  estimated_unit_price: number;
  remarks?: string;
  current_free_stock?: number;
  shortage_qty?: number;
}

interface GeneralRequestData {
  id: string;
  request_code: string;
  title: string;
  category: "MAINTENANCE" | "TOOLING" | "RND" | "CONSUMABLE" | "INFRASTRUCTURE" | "SPECIAL_DESIGN";
  department: string;
  requester_name: string;
  requester_username: string;
  priority: "NORMAL" | "URGENT" | "CRITICAL";
  justification?: string;
  drawing_reference?: string;
  technical_specs?: string;
  target_delivery_date?: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "PR_GENERATED" | "REJECTED";
  estimated_total_cost: number;
  approved_by?: string;
  approved_at?: string;
  pr_id?: string;
  pr_number?: string;
  item_count?: number;
  created_at: string;
  items?: BomItemRow[];
  linkedPr?: any;
}

const CATEGORY_MAP: Record<string, { labelId: string; labelEn: string }> = {
  MAINTENANCE: { labelId: "Pemeliharaan & Mesin", labelEn: "Maintenance & Plant" },
  TOOLING: { labelId: "Cetakan & Moulding", labelEn: "Tooling & Moulds" },
  RND: { labelId: "R&D & Uji Coba", labelEn: "R&D & Lab Trial" },
  CONSUMABLE: { labelId: "Konsumabel & Safety", labelEn: "Consumables & Safety" },
  INFRASTRUCTURE: { labelId: "Sarana & Forklift", labelEn: "Infrastructure & GA" },
  SPECIAL_DESIGN: { labelId: "Desain Khusus / Prototipe", labelEn: "Custom Design / Prototype" },
};

const DEPARTMENT_LIST = [
  "Production",
  "Maintenance & Workshop",
  "R&D & Quality Control",
  "Warehouse & Logistics",
  "Engineering & Design",
  "General Affairs & Plant",
];

export default function GeneralRequest() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();

  const isId = language === "id";

  // Section / Tab State
  const [activeTab, setActiveTab] = useState<"BOM" | "HEADER_AUTH">("BOM");

  // Data States
  const [requests, setRequests] = useState<GeneralRequestData[]>([]);
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    total: 0,
    pending_review: 0,
    ready_for_pr: 0,
    pr_generated: 0,
    urgent_open: 0,
    total_budget_est: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<string>("MAINTENANCE");
  const [formDepartment, setFormDepartment] = useState("Maintenance & Workshop");
  const [formPriority, setFormPriority] = useState<"NORMAL" | "URGENT" | "CRITICAL">("NORMAL");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [formDrawingRef, setFormDrawingRef] = useState("");
  const [formJustification, setFormJustification] = useState("");
  const [formBomItems, setFormBomItems] = useState<BomItemRow[]>([
    {
      id: "row-1",
      item_code: "",
      item_name: "",
      specification: "",
      part_number: "",
      qty: 1,
      uom: "PCS",
      estimated_unit_price: 0,
      remarks: "",
      current_free_stock: 0,
      shortage_qty: 0,
    },
  ]);

  // Stock Validity Check State
  const [hasValidatedStock, setHasValidatedStock] = useState(false);
  const [stockValidationSummary, setStockValidationSummary] = useState<{
    totalItems: number;
    inStockItems: number;
    shortageItems: number;
  }>({ totalItems: 0, inStockItems: 0, shortageItems: 0 });

  // Detail Modal & Search
  const [selectedDetail, setSelectedDetail] = useState<GeneralRequestData | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyCategory, setHistoryCategory] = useState("ALL");
  const [historyStatus, setHistoryStatus] = useState("ALL");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [reqRes, statsRes, invRes] = await Promise.all([
        apiFetch("/api/general-requests", {}, user?.username),
        apiFetch("/api/general-requests/stats", {}, user?.username),
        apiFetch("/api/inventory", {}, user?.username),
      ]);

      if (reqRes.ok && Array.isArray(reqRes.data)) {
        setRequests(reqRes.data);
      }
      if (statsRes.ok && statsRes.data?.stats) {
        setStats(statsRes.data.stats);
      }
      if (invRes.ok && Array.isArray(invRes.data)) {
        setInventoryList(invRes.data);
      }
    } catch (err) {
      console.error(err);
      showToast(isId ? "Gagal memuat data permintaan pengadaan" : "Error synchronizing general requisitions", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Validate Stock Availability
  const handleValidateStock = () => {
    if (formBomItems.length === 0 || formBomItems.some((b) => !b.item_name.trim())) {
      showToast(
        isId ? "Isi nama barang terlebih dahulu sebelum memvalidasi stok." : "Please enter item names before validating stock.",
        "info"
      );
      return;
    }

    let inStock = 0;
    let shortage = 0;

    const updated = formBomItems.map((item) => {
      let matchedInv: any = null;
      if (item.item_id) {
        matchedInv = inventoryList.find((i) => i.id === item.item_id);
      } else if (item.item_code) {
        matchedInv = inventoryList.find((i) => i.item_code?.toLowerCase() === item.item_code?.toLowerCase());
      } else if (item.item_name) {
        matchedInv = inventoryList.find((i) => i.name?.toLowerCase() === item.item_name?.toLowerCase());
      }

      const freeStock = Number(matchedInv?.free_stock || matchedInv?.quantity || item.current_free_stock || 0);
      const reqQty = Number(item.qty) || 1;
      const shortfall = Math.max(0, reqQty - freeStock);

      if (shortfall === 0) {
        inStock++;
      } else {
        shortage++;
      }

      return {
        ...item,
        current_free_stock: freeStock,
        shortage_qty: shortfall,
      };
    });

    setFormBomItems(updated);
    setHasValidatedStock(true);
    setStockValidationSummary({
      totalItems: formBomItems.length,
      inStockItems: inStock,
      shortageItems: shortage,
    });

    showToast(
      shortage === 0
        ? isId
          ? "Validasi Stok Selesai: Seluruh item tersedia di stok gudang."
          : "Stock Validation Complete: All items available in warehouse stock."
        : isId
        ? `Validasi Stok Selesai: ${shortage} item memerlukan pembuatan PO Pengadaan.`
        : `Stock Validation Complete: ${shortage} item(s) require procurement PO.`,
      shortage === 0 ? "success" : "info"
    );
  };

  // Add Item Row
  const handleAddBomRow = () => {
    setFormBomItems((prev) => [
      ...prev,
      {
        id: "row-" + Math.random().toString(36).substring(2, 9),
        item_code: "",
        item_name: "",
        specification: "",
        part_number: "",
        qty: 1,
        uom: "PCS",
        estimated_unit_price: 0,
        remarks: "",
        current_free_stock: 0,
        shortage_qty: 0,
      },
    ]);
    setHasValidatedStock(false);
  };

  // Remove Item Row
  const handleRemoveBomRow = (id: string) => {
    if (formBomItems.length <= 1) {
      showToast(isId ? "Minimal 1 baris BOM harus diisi." : "At least one BOM item is required.", "info");
      return;
    }
    setFormBomItems((prev) => prev.filter((r) => r.id !== id));
    setHasValidatedStock(false);
  };

  // Update BOM Row
  const handleUpdateBomItem = (id: string, field: keyof BomItemRow, value: any) => {
    setFormBomItems((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        // Auto-match if changing item_code
        if (field === "item_code") {
          const matched = inventoryList.find((i) => i.item_code?.toLowerCase() === String(value).toLowerCase());
          if (matched) {
            return {
              ...r,
              item_code: value,
              item_id: matched.id,
              item_name: matched.name || r.item_name,
              specification: matched.dimension || matched.spec || r.specification,
              part_number: matched.spec || r.part_number,
              uom: matched.uom || r.uom || "PCS",
              estimated_unit_price: Number(matched.unit_price) || r.estimated_unit_price,
              current_free_stock: Number(matched.free_stock || matched.quantity || 0),
            };
          }
        }

        return { ...r, [field]: value };
      })
    );
    setHasValidatedStock(false);
  };

  // Total Estimated Budget
  const totalEstimatedCost = useMemo(() => {
    return formBomItems.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.estimated_unit_price) || 0), 0);
  }, [formBomItems]);

  // Submit and Issue Purchase Request (PR)
  const handleSubmitAndIssuePr = async () => {
    if (!formTitle.trim()) {
      showToast(isId ? "Judul permintaan wajib diisi." : "Requisition title is required.", "info");
      setActiveTab("HEADER_AUTH");
      return;
    }
    if (formBomItems.some((b) => !b.item_name.trim())) {
      showToast(isId ? "Setiap item BOM wajib memiliki nama barang." : "All BOM table items must have an item name.", "info");
      setActiveTab("BOM");
      return;
    }

    setIsSubmitting(true);
    try {
      const createRes = await apiFetch(
        "/api/general-requests",
        {
          method: "POST",
          body: JSON.stringify({
            title: formTitle.trim(),
            category: formCategory,
            department: formDepartment,
            priority: formPriority,
            target_delivery_date: formTargetDate || undefined,
            drawing_reference: formDrawingRef.trim() || undefined,
            justification: formJustification.trim() || undefined,
            items: formBomItems.map((b) => ({
              item_id: b.item_id || undefined,
              item_code: b.item_code || undefined,
              item_name: b.item_name.trim(),
              specification: b.specification?.trim() || undefined,
              part_number: b.part_number?.trim() || undefined,
              qty: Number(b.qty) || 1,
              uom: (b.uom || "PCS").toUpperCase(),
              estimated_unit_price: Number(b.estimated_unit_price) || 0,
              remarks: b.remarks?.trim() || undefined,
            })),
          }),
        },
        user?.username
      );

      if (!createRes.ok || !createRes.data?.id) {
        throw new Error(createRes.error || "Gagal membuat pengajuan permintaan.");
      }

      const requestId = createRes.data.id;

      const prRes = await apiFetch(
        `/api/general-requests/${requestId}/generate-pr`,
        { method: "POST" },
        user?.username
      );

      if (prRes.ok && prRes.data?.success) {
        showToast(
          isId
            ? `Berhasil Diterbitkan! Purchase Request ${prRes.data.pr_number} masuk ke antrean Pengadaan.`
            : `Requisition Issued! Purchase Request ${prRes.data.pr_number} sent to Procurement.`,
          "success"
        );

        // Reset
        setFormTitle("");
        setFormDrawingRef("");
        setFormJustification("");
        setFormTargetDate("");
        setFormBomItems([
          {
            id: "row-1",
            item_code: "",
            item_name: "",
            specification: "",
            part_number: "",
            qty: 1,
            uom: "PCS",
            estimated_unit_price: 0,
            remarks: "",
            current_free_stock: 0,
            shortage_qty: 0,
          },
        ]);
        setHasValidatedStock(false);
        fetchData();
      } else {
        showToast(prRes.error || "Gagal menerbitkan Purchase Request.", "error");
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || "Terjadi kesalahan sistem", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Detail View
  const openDetail = async (id: string) => {
    try {
      const res = await apiFetch(`/api/general-requests/${id}`, {}, user?.username);
      if (res.ok && res.data) {
        setSelectedDetail(res.data);
      } else {
        showToast(res.error || "Gagal memuat detail permintaan", "error");
      }
    } catch (err) {
      showToast("Gagal memuat detail", "error");
    }
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    return requests.filter((r) => {
      if (historyCategory !== "ALL" && r.category !== historyCategory) return false;
      if (historyStatus !== "ALL" && r.status !== historyStatus) return false;
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const mCode = r.request_code.toLowerCase().includes(q);
        const mTitle = r.title.toLowerCase().includes(q);
        const mReq = r.requester_name.toLowerCase().includes(q);
        const mPr = (r.pr_number || "").toLowerCase().includes(q);
        if (!mCode && !mTitle && !mReq && !mPr) return false;
      }
      return true;
    });
  }, [requests, historyCategory, historyStatus, historySearch]);

  return (
    <div className="space-y-6 pb-20 bg-stone-50 min-h-screen text-stone-900 p-6 rounded-3xl">
      {/* 1. Page Header (Standard Clean Stone ERP) */}
      <PageHeader
        title={isId ? "General Requests" : "General Requests"}
        subtitle={
          isId
            ? "Permintaan material internal, spesifikasi BOM & verifikasi ketersediaan stok"
            : "Internal Material Requisitions, BOM Specifications & Warehouse Stock Validation"
        }
        icon={<ClipboardList className="w-5 h-5 text-amber-700" />}
        iconBgClassName="bg-amber-50 border border-amber-200/80 text-amber-700"
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setActiveTab("BOM")}
              className="bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl px-3.5 py-2 shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isId ? "Buat Permintaan Baru" : "New Requisition"}</span>
            </Button>
            <Button
              onClick={() => {
                const el = document.getElementById("history-section");
                if (el) el.scrollIntoView({ behavior: "smooth" });
              }}
              variant="outline"
              className="text-xs font-bold rounded-xl border-stone-300 bg-white hover:bg-stone-100 text-stone-800 flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5 text-stone-500" />
              <span>{isId ? "Riwayat Permintaan" : "Requisition History"}</span>
            </Button>
          </div>
        }
      />

      {/* 2. Top Summary KPI Cards (Stone Palette) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 p-5 rounded-2xl shadow-xs">
          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
            {isId ? "Total Permintaan" : "Total Requisitions"}
          </div>
          <div className="text-2xl font-black text-stone-900 tracking-tight mt-1">{stats.total}</div>
          <div className="text-[10px] text-stone-500 font-medium mt-1">
            {isId ? "Permintaan aktif" : "Active requisitions"}
          </div>
        </div>

        <div className="bg-white border border-stone-200 p-5 rounded-2xl shadow-xs">
          <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
            {isId ? "Menunggu Review" : "Pending Review"}
          </div>
          <div className="text-2xl font-black text-stone-800 tracking-tight mt-1">{stats.pending_review}</div>
          <div className="text-[10px] text-stone-500 font-medium mt-1">
            {isId ? "Review otorisasi" : "Awaiting authorization"}
          </div>
        </div>

        <div className="bg-white border border-stone-200 p-5 rounded-2xl shadow-xs">
          <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
            {isId ? "Kekurangan Stok" : "Stock Shortage"}
          </div>
          <div className="text-2xl font-black text-stone-800 tracking-tight mt-1">{stats.urgent_open}</div>
          <div className="text-[10px] text-stone-500 font-medium mt-1">
            {isId ? "Butuh PO Pengadaan" : "Requires procurement PO"}
          </div>
        </div>

        <div className="bg-white border border-stone-200 p-5 rounded-2xl shadow-xs">
          <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
            {isId ? "PR Terbit" : "PR Issued"}
          </div>
          <div className="text-2xl font-black text-stone-900 tracking-tight mt-1">{stats.pr_generated}</div>
          <div className="text-[10px] text-stone-500 font-medium mt-1">
            {isId ? "Terhubung ke Procurement" : "Routed to purchasing"}
          </div>
        </div>
      </div>

      {/* 3. Section Switcher Tabs */}
      <div className="bg-stone-200/80 p-1 rounded-xl flex items-center gap-1 max-w-md border border-stone-300/80">
        <button
          onClick={() => setActiveTab("BOM")}
          className={cn(
            "flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
            activeTab === "BOM"
              ? "bg-white text-stone-900 shadow-xs border border-stone-200"
              : "text-stone-600 hover:text-stone-900"
          )}
        >
          <span>{isId ? "1. Bill of Materials (BOM)" : "1. Bill of Materials (BOM)"}</span>
          <span className="text-[10px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-mono">
            {formBomItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("HEADER_AUTH")}
          className={cn(
            "flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
            activeTab === "HEADER_AUTH"
              ? "bg-white text-stone-900 shadow-xs border border-stone-200"
              : "text-stone-600 hover:text-stone-900"
          )}
        >
          <span>{isId ? "2. Detail & Otorisasi PR" : "2. Header & Authorization"}</span>
        </button>
      </div>

      {/* SECTION VIEW 1: BILL OF MATERIALS (BOM) PLATFORM TABLE (100% Identical to Engineering Material Component) */}
      {activeTab === "BOM" && (
        <div className="space-y-6">
          <datalist id="warehouse-item-codes-datalist">
            {inventoryList.map((item) => (
              <option key={item.id} value={item.item_code}>
                {item.name} {item.dimension ? `(${item.dimension})` : ""} {item.spec ? `[${item.spec}]` : ""}
              </option>
            ))}
          </datalist>

          <div className="border border-stone-200 rounded-2xl bg-white shadow-sm overflow-hidden">
            {/* Table Header matching Engineering Material Component Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-stone-100/50 px-6 py-3.5 border-b border-stone-200 gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Material Components ({formBomItems.length})
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAddBomRow}
                  variant="secondary"
                  className="text-xs font-bold py-1.5 px-3 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200"
                >
                  Add Component
                </Button>
              </div>
            </div>

            {/* List of Component Rows (100% Identical structure & dimensions to BomItemRowEditor.tsx) */}
            <div className="divide-y divide-stone-100">
              {formBomItems.map((item, index) => (
                <div key={item.id} className="px-8 py-6 hover:bg-stone-50 transition-colors group relative flex gap-6 items-start">
                  {/* Index */}
                  <div className="text-[10px] font-bold text-stone-400 w-10 pt-4 text-center shrink-0 font-mono">
                    {String(index + 1).padStart(2, "0")}
                  </div>

                  <div className="flex-1 space-y-5">
                    {/* Row 1: Primary Identification */}
                    <div className="grid grid-cols-12 gap-5">
                      <div className="col-span-4 space-y-1.5">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1">
                          Item Code
                        </label>
                        <input
                          type="text"
                          list="warehouse-item-codes-datalist"
                          value={item.item_code || ""}
                          onChange={(e) => handleUpdateBomItem(item.id, "item_code", e.target.value)}
                          className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm uppercase outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 transition-all font-bold tracking-tight text-stone-950"
                          placeholder="SKU-XXXXX"
                        />
                      </div>

                      <div className="col-span-8 space-y-1.5">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1">
                          Component Name & Description
                        </label>
                        <input
                          type="text"
                          value={item.item_name}
                          onChange={(e) => handleUpdateBomItem(item.id, "item_name", e.target.value)}
                          className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 font-bold text-stone-900"
                          placeholder="Internal System Component Name"
                        />
                      </div>
                    </div>

                    {/* Row 2: Specifications & Logistics */}
                    <div className="grid grid-cols-12 gap-5 py-3 px-4 bg-stone-50/50 rounded-2xl border border-stone-100/50">
                      <div className="col-span-3 space-y-1.5">
                        <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1">
                          Dimensions
                        </label>
                        <input
                          type="text"
                          value={item.specification || ""}
                          onChange={(e) => handleUpdateBomItem(item.id, "specification", e.target.value)}
                          className="w-full bg-white border border-stone-100 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-stone-400 font-medium text-stone-900"
                          placeholder="L x W x H"
                        />
                      </div>

                      <div className="col-span-3 space-y-1.5">
                        <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1">
                          Technical Spec
                        </label>
                        <input
                          type="text"
                          value={item.part_number || ""}
                          onChange={(e) => handleUpdateBomItem(item.id, "part_number", e.target.value)}
                          className="w-full bg-white border border-stone-100 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-stone-400 font-medium text-stone-900"
                          placeholder="Standard Configuration"
                        />
                      </div>

                      <div className="col-span-2 space-y-1.5">
                        <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          value={item.qty}
                          min="1"
                          onChange={(e) => handleUpdateBomItem(item.id, "qty", parseFloat(e.target.value) || 0)}
                          className="w-full bg-white border border-stone-100 rounded-lg px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-900 font-bold text-center"
                        />
                      </div>

                      <div className="col-span-2 space-y-1.5">
                        <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1">
                          Uom
                        </label>
                        <input
                          type="text"
                          value={item.uom}
                          onChange={(e) => handleUpdateBomItem(item.id, "uom", e.target.value.toUpperCase())}
                          className="w-full bg-white border border-stone-100 rounded-lg px-3 py-2 text-[13px] text-stone-900 outline-none focus:border-stone-400 font-bold text-center uppercase"
                          placeholder="PCS"
                        />
                      </div>

                      <div className="col-span-2 space-y-1.5">
                        <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1 text-center block">
                          Stock
                        </label>
                        <div className="w-full border rounded-lg px-3 py-2 text-center text-xs font-bold font-mono bg-stone-100 border-stone-200 text-stone-700">
                          {item.current_free_stock || 0}
                        </div>
                      </div>
                    </div>

                    {/* Row 3: Financials & Reference */}
                    <div className="grid grid-cols-12 gap-5 px-1">
                      <div className="col-span-4 space-y-1.5 opacity-80">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1">
                          Matrix Unit Price (IDR)
                        </label>
                        <input
                          type="number"
                          value={item.estimated_unit_price}
                          onChange={(e) =>
                            handleUpdateBomItem(item.id, "estimated_unit_price", parseFloat(e.target.value) || 0)
                          }
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-900 outline-none focus:border-stone-900"
                        />
                      </div>

                      <div className="col-span-8 space-y-1.5">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1">
                          Reference / Remarks
                        </label>
                        <input
                          type="text"
                          value={item.remarks || ""}
                          onChange={(e) => handleUpdateBomItem(item.id, "remarks", e.target.value)}
                          className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 font-bold text-stone-900 placeholder:text-stone-400"
                          placeholder="Drawing Ref, Revision, or Note"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Delete Action Button */}
                  <div className="w-10 shrink-0 pt-10 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveBomRow(item.id)}
                      className="w-10 h-10 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 transition-all flex items-center justify-center font-bold text-xs cursor-pointer"
                      title="Delete Item"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Row Button */}
            <div className="px-6 py-4 bg-stone-50 border-t border-stone-200">
              <button
                type="button"
                onClick={handleAddBomRow}
                className="w-full flex items-center justify-center gap-2 py-3 text-xs uppercase bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl"
              >
                Add Component
              </button>
            </div>
          </div>

          {/* Footer Summary Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white rounded-2xl border border-stone-200 shadow-xs">
            <div className="text-xs text-stone-500 font-medium">
              {isId ? "Jumlah Item BOM:" : "BOM Items Listed:"}{" "}
              <span className="font-bold text-stone-900">{formBomItems.length} items</span>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider text-[10px]">
                  {isId ? "Total Estimasi Anggaran:" : "Total Estimated Cost:"}
                </span>
                <span className="text-xl font-black text-stone-900 font-mono">
                  Rp {totalEstimatedCost.toLocaleString("id-ID")}
                </span>
              </div>

              <Button
                onClick={() => setActiveTab("HEADER_AUTH")}
                variant="primary"
                className="bg-stone-900 hover:bg-black text-white rounded-xl font-bold text-xs px-5 py-2.5 shadow-xs"
              >
                <span>{isId ? "Lanjut ke Otorisasi PR" : "Proceed to Authorization"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION VIEW 2: REQUEST HEADER, STOCK VALIDITY & AUTHORIZATION */}
      {activeTab === "HEADER_AUTH" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card A: Request Header Details */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider pb-3 border-b border-stone-100">
                <span>{isId ? "1. Informasi Header Permintaan" : "1. Requisition Header Details"}</span>
              </h3>

              <div className="space-y-3.5">
                <div>
                  <label className="text-[11px] font-bold text-stone-700 block mb-1">
                    {isId ? "Judul Permintaan Pengadaan *" : "Requisition Title *"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={isId ? "Contoh: Penggantian Seal Hidrolik Mesin Paving Unit 2" : "e.g. Hydraulic Cylinder Seal Replacement"}
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-stone-700 block mb-1">
                      {isId ? "Kategori *" : "Category *"}
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 outline-none"
                    >
                      {Object.entries(CATEGORY_MAP).map(([k, v]) => (
                        <option key={k} value={k}>
                          {isId ? v.labelId : v.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-stone-700 block mb-1">
                      {isId ? "Departemen Pemohon *" : "Department *"}
                    </label>
                    <select
                      value={formDepartment}
                      onChange={(e) => setFormDepartment(e.target.value)}
                      className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 outline-none"
                    >
                      {DEPARTMENT_LIST.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-stone-700 block mb-1">
                      {isId ? "Tingkat Prioritas" : "Urgency Level"}
                    </label>
                    <select
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value as any)}
                      className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 outline-none"
                    >
                      <option value="NORMAL">{isId ? "Normal (Rutin)" : "Normal (Routine)"}</option>
                      <option value="URGENT">{isId ? "Mendesak (Stok Kritis)" : "Urgent (Stock Critical)"}</option>
                      <option value="CRITICAL">{isId ? "Kritis (Breakdown Mesin)" : "Critical (Machine Breakdown)"}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-stone-700 block mb-1">
                      {isId ? "Target Tanggal Dibutuhkan" : "Target Delivery Date"}
                    </label>
                    <input
                      type="date"
                      value={formTargetDate}
                      onChange={(e) => setFormTargetDate(e.target.value)}
                      className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-stone-700 block mb-1">
                    {isId ? "Ref. Gambar CAD / Manual Spesifikasi" : "CAD / Drawing Reference"}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DWG-MTC-2026-08"
                    value={formDrawingRef}
                    onChange={(e) => setFormDrawingRef(e.target.value)}
                    className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-stone-700 block mb-1">
                    {isId ? "Catatan Justifikasi Teknis" : "Technical Justification"}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={isId ? "Alasan kebutuhan operasional..." : "Technical justification for requisition..."}
                    value={formJustification}
                    onChange={(e) => setFormJustification(e.target.value)}
                    className="w-full text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Card B: Warehouse Stock Validity & Otorisasi PR */}
            <div className="space-y-6">
              {/* Warehouse Stock Validity Panel */}
              <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    <span>{isId ? "2. Validasi Stok Gudang" : "2. Warehouse Stock Validity"}</span>
                  </h3>

                  <Button
                    type="button"
                    onClick={handleValidateStock}
                    variant="outline"
                    size="sm"
                    className="rounded-xl font-bold border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800 text-xs"
                  >
                    {isId ? "Cek Stok Gudang" : "Validate Stock"}
                  </Button>
                </div>

                {hasValidatedStock ? (
                  <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 text-xs space-y-2">
                    <div className="font-black text-sm text-stone-900">
                      <span>
                        {stockValidationSummary.shortageItems === 0
                          ? isId
                            ? "100% Stok Tersedia di Gudang"
                            : "100% Stock Available in Warehouse"
                          : isId
                          ? `${stockValidationSummary.shortageItems} Item Memerlukan Pengadaan PO`
                          : `${stockValidationSummary.shortageItems} Item Shortage Detected`}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      {stockValidationSummary.shortageItems === 0
                        ? isId
                          ? "Seluruh item BOM yang diajukan tersedia dalam stok gudang aktif."
                          : "All requested BOM items exist in warehouse free stock."
                        : isId
                        ? "Item dengan kekurangan stok akan secara otomatis diteruskan ke tim Procurement untuk penerbitan Purchase Order (PO)."
                        : "Items with stock shortages will be automatically routed to Procurement for Purchase Order creation."}
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-500">
                    {isId
                      ? "Klik Cek Stok Gudang untuk memeriksa ketersediaan stok fisik secara real-time sebelum menerbitkan PR."
                      : "Click Validate Stock to check warehouse stock levels in real-time before issuing PR."}
                  </div>
                )}
              </div>

              {/* Action Box */}
              <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider pb-3 border-b border-stone-100">
                  <span>{isId ? "3. Otorisasi & Penerbitan PR" : "3. Authorization & Issue PR"}</span>
                </h3>

                <div className="space-y-3">
                  <Button
                    type="button"
                    onClick={handleSubmitAndIssuePr}
                    disabled={isSubmitting}
                    variant="primary"
                    className="w-full bg-stone-900 hover:bg-black text-white rounded-xl py-3.5 text-xs font-black shadow-xs"
                  >
                    <span>
                      {isSubmitting
                        ? isId
                          ? "Memproses..."
                          : "Processing..."
                        : isId
                        ? "Terbitkan Purchase Request (PR)"
                        : "Submit & Issue Purchase Request (PR)"}
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Ongoing Requisitions Log */}
          <div id="history-section" className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-stone-900 tracking-tight uppercase">
                  <span>{isId ? "Daftar Permintaan Berjalan" : "Ongoing Requisitions Log"}</span>
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={isId ? "Cari kode / judul..." : "Search code / title..."}
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full sm:w-64 px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-x-auto border border-stone-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3 pl-4">{isId ? "Kode & Permintaan" : "Requisition Code & Title"}</th>
                    <th className="p-3">{isId ? "Kategori & Dept" : "Category & Dept"}</th>
                    <th className="p-3">{isId ? "Pemohon" : "Requester"}</th>
                    <th className="p-3 text-center">{isId ? "Jumlah Item" : "Items"}</th>
                    <th className="p-3 text-right">{isId ? "Est. Biaya" : "Est Cost"}</th>
                    <th className="p-3 text-center">{isId ? "Status" : "Status"}</th>
                    <th className="p-3 pr-4 text-center">{isId ? "Aksi" : "Action"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-stone-400 text-xs italic">
                        {isId ? "Tidak ada data permintaan." : "No requisitions found."}
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((req) => (
                      <tr key={req.id} className="hover:bg-stone-50/50">
                        <td className="p-3 pl-4">
                          <div className="font-mono font-bold text-stone-900 text-xs">{req.request_code}</div>
                          <div className="font-bold text-stone-800 text-xs mt-0.5 line-clamp-1">{req.title}</div>
                        </td>

                        <td className="p-3">
                          <span className="font-bold text-stone-800">{req.category}</span>
                          <span className="block text-[10px] text-stone-400">{req.department}</span>
                        </td>

                        <td className="p-3">
                          <div className="font-bold text-stone-800">{req.requester_name}</div>
                          <div className="text-[10px] text-stone-400">Target: {req.target_delivery_date || "-"}</div>
                        </td>

                        <td className="p-3 text-center font-black font-mono">{req.item_count || 0}</td>

                        <td className="p-3 text-right font-mono font-bold text-stone-900">
                          Rp {req.estimated_total_cost.toLocaleString("id-ID")}
                        </td>

                        <td className="p-3 text-center">
                          {req.status === "PR_GENERATED" ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-100 text-stone-800 border border-stone-200">
                              PR Terbit ({req.pr_number})
                            </span>
                          ) : req.status === "APPROVED" ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-100 text-stone-800 border border-stone-200">
                              Approved
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-stone-100 text-stone-600 border border-stone-200">
                              Pending Review
                            </span>
                          )}
                        </td>

                        <td className="p-3 pr-4 text-center">
                          <Button
                            onClick={() => openDetail(req.id)}
                            variant="outline"
                            size="xs"
                            className="rounded-xl text-[10px] font-bold border-stone-200 bg-stone-50 hover:bg-stone-100"
                          >
                            Detail BOM
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. Detail Modal */}
      <Modal
        isOpen={!!selectedDetail}
        onClose={() => setSelectedDetail(null)}
        maxWidth="4xl"
        title={
          selectedDetail && (
            <div className="flex items-center justify-between w-full pr-8">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black bg-stone-100 text-stone-800 px-2.5 py-0.5 rounded-lg border border-stone-200">
                  {selectedDetail.request_code}
                </span>
                <span className="font-bold text-stone-900 text-sm">{selectedDetail.title}</span>
              </div>

              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border bg-stone-100 text-stone-800 border-stone-200">
                {selectedDetail.status}
              </span>
            </div>
          )
        }
      >
        {selectedDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs">
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">{isId ? "Departemen" : "Department"}</span>
                <span className="font-bold text-stone-800">{selectedDetail.department}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">{isId ? "Kategori" : "Category"}</span>
                <span className="font-bold text-stone-800">{selectedDetail.category}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">{isId ? "Pemohon" : "Requester"}</span>
                <span className="font-bold text-stone-800">{selectedDetail.requester_name}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">{isId ? "Target Tanggal" : "Target Date"}</span>
                <span className="font-bold text-stone-800">{selectedDetail.target_delivery_date || "-"}</span>
              </div>
            </div>

            {selectedDetail.pr_number && (
              <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl flex items-center justify-between text-xs">
                <span className="font-bold text-stone-900">
                  {isId ? "Purchase Request Terbit:" : "Linked Purchase Request:"}{" "}
                  <span className="font-mono font-black">{selectedDetail.pr_number}</span>
                </span>
                <Link to="/procurement" className="text-stone-800 font-bold hover:underline">
                  <span>{isId ? "Buka Modul Procurement" : "Go to Procurement"}</span>
                </Link>
              </div>
            )}

            <div className="overflow-x-auto border border-stone-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-2.5 pl-4">#</th>
                    <th className="p-2.5">{isId ? "Nama Part / Material" : "Item Name"}</th>
                    <th className="p-2.5">{isId ? "Spesifikasi" : "Specification"}</th>
                    <th className="p-2.5 text-center">{isId ? "Qty" : "Qty"}</th>
                    <th className="p-2.5 text-right">{isId ? "Harga Satuan" : "Est Price"}</th>
                    <th className="p-2.5 pr-4 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {selectedDetail.items?.map((it, idx) => (
                    <tr key={it.id}>
                      <td className="p-2.5 pl-4 font-mono text-stone-400">{idx + 1}</td>
                      <td className="p-2.5 font-bold text-stone-900">{it.item_name}</td>
                      <td className="p-2.5 text-stone-600">{it.specification || "-"}</td>
                      <td className="p-2.5 text-center font-black font-mono">
                        {it.qty} {it.uom}
                      </td>
                      <td className="p-2.5 text-right font-mono">Rp {(it.estimated_unit_price || 0).toLocaleString("id-ID")}</td>
                      <td className="p-2.5 pr-4 text-right font-black font-mono text-stone-900">
                        Rp {((it.qty || 0) * (it.estimated_unit_price || 0)).toLocaleString("id-ID")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs">
              <span className="text-stone-500 font-bold">{isId ? "Total Estimasi Biaya:" : "Total Est Cost:"}</span>
              <span className="text-base font-black text-stone-900 font-mono">
                Rp {selectedDetail.estimated_total_cost.toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
