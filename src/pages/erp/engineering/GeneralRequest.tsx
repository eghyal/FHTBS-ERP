import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertOctagon,
  ArrowRight,
  Package,
  Layers,
  Wrench,
  FlaskConical,
  Boxes,
  ShieldCheck,
  Building2,
  Trash2,
  ExternalLink,
  Printer,
  ChevronRight,
  X,
  FileCheck,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

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

const CATEGORY_MAP: Record<string, { label: string; icon: any; color: string; desc: string }> = {
  MAINTENANCE: {
    label: "Pemeliharaan & Mesin",
    icon: Wrench,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Sparepart hidrolik, bearing, seal, oli, pompa, valve pabrik",
  },
  TOOLING: {
    label: "Cetakan & Moulding",
    icon: Layers,
    color: "bg-purple-50 text-purple-700 border-purple-200",
    desc: "Cetakan paving, batako, plat baja, matras, pisau pemotong",
  },
  RND: {
    label: "R&D & Uji Formula",
    icon: FlaskConical,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    desc: "Bahan uji lab, pigmen warna baru, aditif kimia, semen uji",
  },
  CONSUMABLE: {
    label: "Habis Pakai & APD",
    icon: Boxes,
    color: "bg-amber-50 text-amber-700 border-amber-200",
    desc: "Kawat las, sarung tangan, helm safety, strapping band, palet",
  },
  INFRASTRUCTURE: {
    label: "Sarana & Forklift",
    icon: Building2,
    color: "bg-stone-100 text-stone-700 border-stone-200",
    desc: "Lampu pabrik, perbaikan lantai kerja, ban forklift, genset",
  },
  SPECIAL_DESIGN: {
    label: "Desain Khusus / Prototipe",
    icon: Sparkles,
    color: "bg-rose-50 text-rose-700 border-rose-200",
    desc: "Produk precast custom, modifikasi jalur hopper/conveyor",
  },
};

const DEPARTMENTS = [
  "PRODUKSI",
  "MAINTENANCE & WORKSHOP",
  "R&D & LABORATORIUM",
  "WAREHOUSE & LOGISTIK",
  "QC / QA MUTU",
  "UMUM & GA",
  "ENGINEERING & DESAIN",
];

export default function GeneralRequest() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [requests, setRequests] = useState<GeneralRequestData[]>([]);
  const [stats, setStats] = useState<any>({
    total: 0,
    pending_review: 0,
    ready_for_pr: 0,
    pr_generated: 0,
    urgent_open: 0,
    total_budget_est: 0,
  });
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedPriority, setSelectedPriority] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<GeneralRequestData | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<keyof typeof CATEGORY_MAP>("MAINTENANCE");
  const [formDepartment, setFormDepartment] = useState("MAINTENANCE & WORKSHOP");
  const [formPriority, setFormPriority] = useState<"NORMAL" | "URGENT" | "CRITICAL">("NORMAL");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [formDrawingRef, setFormDrawingRef] = useState("");
  const [formJustification, setFormJustification] = useState("");
  const [formTechnicalSpecs, setFormTechnicalSpecs] = useState("");
  const [formBomItems, setFormBomItems] = useState<BomItemRow[]>([
    {
      id: "row-" + Math.random().toString(36).substring(2, 9),
      item_name: "",
      specification: "",
      part_number: "",
      qty: 1,
      uom: "PCS",
      estimated_unit_price: 0,
      remarks: "",
    },
  ]);

  const printAreaRef = useRef<HTMLDivElement>(null);

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
    } catch (err: any) {
      console.error("Error loading general requests:", err);
      showToast("Gagal memuat data permintaan pengadaan", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openDetail = async (id: string) => {
    setIsDetailLoading(true);
    try {
      const res = await apiFetch(`/api/general-requests/${id}`, {}, user?.username);
      if (res.ok && res.data) {
        setSelectedDetail(res.data);
      } else {
        showToast(res.error || "Gagal memuat detail permintaan", "error");
      }
    } catch (err: any) {
      showToast("Gagal memuat detail", "error");
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast(`Kode ${code} disalin ke clipboard`, "info");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Add Item to BOM Form
  const handleAddBomRow = () => {
    setFormBomItems((prev) => [
      ...prev,
      {
        id: "row-" + Math.random().toString(36).substring(2, 9),
        item_name: "",
        specification: "",
        part_number: "",
        qty: 1,
        uom: "PCS",
        estimated_unit_price: 0,
        remarks: "",
      },
    ]);
  };

  // Remove Item from BOM Form
  const handleRemoveBomRow = (id: string) => {
    if (formBomItems.length <= 1) {
      showToast("Minimal satu item BOM harus disertakan", "warning");
      return;
    }
    setFormBomItems((prev) => prev.filter((r) => r.id !== id));
  };

  // Update BOM item field
  const handleUpdateBomItem = (id: string, field: keyof BomItemRow, value: any) => {
    setFormBomItems((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return { ...r, [field]: value };
      })
    );
  };

  // Quick Pick Item from Inventory Master
  const handleSelectInventoryMaster = (rowId: string, inventoryId: string) => {
    const inv = inventoryList.find((i) => i.id === inventoryId);
    if (!inv) return;

    setFormBomItems((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          item_id: inv.id,
          item_code: inv.item_code || "",
          item_name: inv.name || "",
          specification: inv.spec || inv.dimension || "",
          uom: inv.uom || "PCS",
          estimated_unit_price: Number(inv.unit_price) || 0,
          current_free_stock: Number(inv.free_stock || inv.quantity || 0),
        };
      })
    );
  };

  // Calculate live total BOM cost
  const formTotalCost = useMemo(() => {
    return formBomItems.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.estimated_unit_price) || 0), 0);
  }, [formBomItems]);

  // Submit New Request
  const handleSubmitNewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast("Judul permintaan wajib diisi", "warning");
      return;
    }
    if (formBomItems.some((b) => !b.item_name.trim())) {
      showToast("Setiap baris BOM wajib memiliki nama barang / part", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: formTitle.trim(),
        category: formCategory,
        department: formDepartment,
        priority: formPriority,
        target_delivery_date: formTargetDate || undefined,
        drawing_reference: formDrawingRef.trim() || undefined,
        justification: formJustification.trim() || undefined,
        technical_specs: formTechnicalSpecs.trim() || undefined,
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
      };

      const res = await apiFetch("/api/general-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      }, user?.username);

      if (res.ok && res.data?.success) {
        showToast(res.data.message || "Permintaan berhasil diajukan!", "success");
        setIsCreateModalOpen(false);
        // Reset form
        setFormTitle("");
        setFormJustification("");
        setFormDrawingRef("");
        setFormTechnicalSpecs("");
        setFormTargetDate("");
        setFormBomItems([
          {
            id: "row-" + Math.random().toString(36).substring(2, 9),
            item_name: "",
            specification: "",
            part_number: "",
            qty: 1,
            uom: "PCS",
            estimated_unit_price: 0,
            remarks: "",
          },
        ]);
        fetchData();
      } else {
        showToast(res.error || "Gagal mengajukan permintaan", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Terjadi kesalahan sistem", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Approve Request
  const handleApproveRequest = async (id: string) => {
    try {
      const res = await apiFetch(`/api/general-requests/${id}/approve`, { method: "POST" }, user?.username);
      if (res.ok && res.data?.success) {
        showToast(res.data.message || "Permintaan disetujui!", "success");
        if (selectedDetail && selectedDetail.id === id) {
          openDetail(id);
        }
        fetchData();
      } else {
        showToast(res.error || "Gagal menyetujui permintaan", "error");
      }
    } catch (err: any) {
      showToast("Gagal menyetujui permintaan", "error");
    }
  };

  // Convert to PR (1-Click ROBUST BRIDGE)
  const handleGeneratePr = async (id: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/general-requests/${id}/generate-pr`, { method: "POST" }, user?.username);
      if (res.ok && res.data?.success) {
        showToast(
          `Sukses! Purchase Requisition ${res.data.pr_number} telah diterbitkan dan masuk ke antrean Pengadaan.`,
          "success"
        );
        if (selectedDetail && selectedDetail.id === id) {
          openDetail(id);
        }
        fetchData();
      } else {
        showToast(res.error || "Gagal menerbitkan Purchase Requisition", "error");
      }
    } catch (err: any) {
      showToast("Terjadi kesalahan saat membuat PR", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered List
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (selectedCategory !== "ALL" && r.category !== selectedCategory) return false;
      if (selectedPriority !== "ALL" && r.priority !== selectedPriority) return false;
      if (selectedStatus !== "ALL" && r.status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = r.request_code.toLowerCase().includes(q);
        const matchTitle = r.title.toLowerCase().includes(q);
        const matchReq = r.requester_name.toLowerCase().includes(q);
        const matchPr = (r.pr_number || "").toLowerCase().includes(q);
        const matchJust = (r.justification || "").toLowerCase().includes(q);
        if (!matchCode && !matchTitle && !matchReq && !matchPr && !matchJust) return false;
      }
      return true;
    });
  }, [requests, selectedCategory, selectedPriority, selectedStatus, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header & Title Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#b02524] animate-pulse"></span>
            <span className="text-[11px] font-black uppercase tracking-wider text-stone-500">
              Engineering & Procurement Integration
            </span>
          </div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight mt-1 flex items-center gap-2">
            General Request <span className="text-stone-400 font-normal">|</span>
            <span className="text-stone-600 font-semibold text-lg">BOM & Pengadaan Non-Project</span>
          </h1>
          <p className="text-xs text-stone-500 font-medium mt-1 max-w-2xl leading-relaxed">
            Pusat pengajuan pengadaan pabrik di luar kontrak SPK konsumen. Rancang spesifikasi teknis (CAD/Desain)
            dan rincian item BOM untuk suku cadang mesin, cetakan moulding, trial R&D formula, dan operasional pabrik.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            onClick={() => fetchData()}
            variant="ghost"
            size="sm"
            className="text-stone-600 hover:bg-stone-100 rounded-xl"
            title="Muat ulang data"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>

          <Button
            onClick={() => setIsCreateModalOpen(true)}
            variant="primary"
            className="bg-[#b02524] hover:bg-red-800 text-white rounded-xl shadow-xs flex items-center gap-2 px-4 py-2.5 font-bold text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Ajukan General Request Baru</span>
          </Button>
        </div>
      </div>

      {/* Cross-Link Notice to Project Requests */}
      <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 text-stone-600">
          <div className="w-8 h-8 rounded-xl bg-white border border-stone-200 text-[#b02524] flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-stone-800">Menghilangkan Ketergantungan Alur (Lag of Flow):</span> PR yang dibuat
            di sini langsung terintegrasi ke modul Pengadaan tanpa mewajibkan SPK Proyek konsumen.
          </div>
        </div>
        <Link
          to="/requests"
          className="text-[#b02524] font-bold hover:underline inline-flex items-center gap-1 shrink-0"
        >
          <span>Ke Permintaan SPK Proyek</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 2. Executive KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Total Diajukan</p>
          <p className="text-2xl font-black text-stone-900 mt-1">{stats.total}</p>
          <span className="text-[10px] text-stone-400 font-medium">Permintaan umum</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Menunggu Review</p>
          <p className="text-2xl font-black text-amber-700 mt-1">{stats.pending_review}</p>
          <span className="text-[10px] text-stone-400 font-medium">Perlu verifikasi teknis</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Siap Terbit PR</p>
          <p className="text-2xl font-black text-blue-700 mt-1">{stats.ready_for_pr}</p>
          <span className="text-[10px] text-stone-400 font-medium">Telah disetujui</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">PR Terbit</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{stats.pr_generated}</p>
          <span className="text-[10px] text-stone-400 font-medium">Masuk pengadaan PO</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Mendesak / Kritis</p>
          <p className="text-2xl font-black text-rose-700 mt-1">{stats.urgent_open}</p>
          <span className="text-[10px] text-stone-400 font-medium">Breakdown / Prioritas</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Estimasi Anggaran</p>
          <p className="text-base font-black text-[#b02524] mt-2 truncate" title={`Rp ${stats.total_budget_est.toLocaleString("id-ID")}`}>
            Rp {Math.round(stats.total_budget_est / 1000000)} Jt
          </p>
          <span className="text-[10px] text-stone-400 font-medium">Total biaya terencana</span>
        </div>
      </div>

      {/* 3. Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedCategory("ALL")}
          className={cn(
            "px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border",
            selectedCategory === "ALL"
              ? "bg-stone-900 text-white border-stone-900 shadow-xs"
              : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
          )}
        >
          Semua Kategori ({requests.length})
        </button>

        {Object.entries(CATEGORY_MAP).map(([catKey, catMeta]) => {
          const Icon = catMeta.icon;
          const count = requests.filter((r) => r.category === catKey).length;
          return (
            <button
              key={catKey}
              onClick={() => setSelectedCategory(catKey)}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-2",
                selectedCategory === catKey
                  ? "bg-[#b02524] text-white border-[#b02524] shadow-xs"
                  : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{catMeta.label}</span>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", selectedCategory === catKey ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. Search and Secondary Filters */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari kode GRQ, judul, pemohon, no PR..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#b02524]/20 focus:border-[#b02524]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-stone-500 font-semibold">
            <Filter className="w-3.5 h-3.5" />
            <span>Prioritas:</span>
          </div>
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-medium text-stone-700 focus:outline-none"
          >
            <option value="ALL">Semua Prioritas</option>
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Mendesak (Urgent)</option>
            <option value="CRITICAL">Kritis (Breakdown)</option>
          </select>

          <div className="flex items-center gap-1.5 text-xs text-stone-500 font-semibold ml-2">
            <span>Status:</span>
          </div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-medium text-stone-700 focus:outline-none"
          >
            <option value="ALL">Semua Status</option>
            <option value="SUBMITTED">Menunggu Review</option>
            <option value="APPROVED">Disetujui (Siap PR)</option>
            <option value="PR_GENERATED">PR Terbit</option>
          </select>
        </div>
      </div>

      {/* 5. Main Requests Table */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-4 pl-6">Kode & Permintaan</th>
                <th className="p-4">Kategori & Dept</th>
                <th className="p-4">Pemohon & Target</th>
                <th className="p-4 text-center">BOM Items</th>
                <th className="p-4 text-right">Est. Anggaran</th>
                <th className="p-4 text-center">Prioritas</th>
                <th className="p-4 text-center">Status Alur</th>
                <th className="p-4 pr-6 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-stone-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-stone-400 mb-2" />
                    Memuat daftar general request...
                  </td>
                </tr>
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-stone-400">
                    <Package className="w-10 h-10 mx-auto text-stone-300 mb-2" />
                    Belum ada permintaan pengadaan non-project yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const cat = CATEGORY_MAP[req.category] || CATEGORY_MAP.MAINTENANCE;
                  const Icon = cat.icon;
                  return (
                    <tr key={req.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-800 text-[11px] bg-stone-100 px-2 py-0.5 rounded-md">
                            {req.request_code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyCode(req.request_code)}
                            className="text-stone-400 hover:text-stone-700"
                            title="Salin kode"
                          >
                            {copiedCode === req.request_code ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <p className="font-bold text-stone-900 mt-1 max-w-xs line-clamp-1">{req.title}</p>
                        {req.drawing_reference && (
                          <span className="text-[10px] text-stone-400 font-medium">Ref: {req.drawing_reference}</span>
                        )}
                      </td>

                      <td className="p-4">
                        <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border", cat.color)}>
                          <Icon className="w-3 h-3" />
                          <span>{cat.label}</span>
                        </div>
                        <p className="text-[10px] text-stone-500 font-medium mt-1 truncate max-w-[140px]">
                          {req.department}
                        </p>
                      </td>

                      <td className="p-4">
                        <p className="font-bold text-stone-800">{req.requester_name}</p>
                        <p className="text-[10px] text-stone-400 font-medium mt-0.5">
                          Target: {req.target_delivery_date || "-"}
                        </p>
                      </td>

                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-stone-100 text-stone-700 font-black text-[11px]">
                          <Boxes className="w-3 h-3 text-stone-500" />
                          {req.item_count || 0} Item
                        </span>
                      </td>

                      <td className="p-4 text-right font-black text-stone-900">
                        Rp {req.estimated_total_cost.toLocaleString("id-ID")}
                      </td>

                      <td className="p-4 text-center">
                        {req.priority === "CRITICAL" ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 border border-rose-300">
                            🚨 Kritis
                          </span>
                        ) : req.priority === "URGENT" ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                            ⚡ Urgent
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-stone-100 text-stone-600">
                            Normal
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-center">
                        {req.status === "PR_GENERATED" ? (
                          <div>
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center gap-1 mx-auto max-w-[120px]">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              PR Terbit
                            </span>
                            {req.pr_number && (
                              <Link
                                to="/procurement"
                                className="text-[10px] text-[#b02524] font-bold hover:underline mt-1 inline-flex items-center gap-0.5"
                                title="Buka modul pengadaan"
                              >
                                <span>{req.pr_number}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </Link>
                            )}
                          </div>
                        ) : req.status === "APPROVED" ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-300 inline-block">
                            ✓ Disetujui
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 inline-block">
                            Menunggu Review
                          </span>
                        )}
                      </td>

                      <td className="p-4 pr-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            onClick={() => openDetail(req.id)}
                            variant="outline"
                            size="sm"
                            className="rounded-xl text-xs font-bold border-stone-200 hover:bg-stone-50"
                          >
                            Detail BOM
                          </Button>

                          {req.status === "APPROVED" && (
                            <Button
                              onClick={() => handleGeneratePr(req.id)}
                              variant="primary"
                              size="sm"
                              className="rounded-xl text-xs font-bold bg-[#b02524] hover:bg-red-800 text-white shadow-xs"
                              title="Terbitkan Purchase Requisition (PR)"
                            >
                              Buat PR
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. MODAL PENGAJUAN BARU (COMBINE BOM + DESIGN REQUEST) */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        maxWidth="6xl"
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#b02524]/10 text-[#b02524] flex items-center justify-center">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-stone-900">Pengajuan General Request & BOM Teknis</h2>
              <p className="text-xs text-stone-500 font-medium">
                Penyusunan spesifikasi desain teknik dan daftar kebutuhan bahan baku/sparepart non-project.
              </p>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSubmitNewRequest} className="space-y-6">
          {/* Section 1: Desain & Kebutuhan Teknis */}
          <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200/80 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#b02524]" />
              1. Identitas & Desain Kebutuhan Teknis
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Judul Permintaan *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Penggantian Seal Hidrolik Mesin Paving Block Unit 2"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-[#b02524]/20 focus:border-[#b02524]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Kategori Non-Project *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as any)}
                  className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-[#b02524]/20 focus:border-[#b02524]"
                >
                  {Object.entries(CATEGORY_MAP).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Departemen Pemohon *</label>
                <select
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-[#b02524]/20 focus:border-[#b02524]"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Tingkat Prioritas</label>
                <select
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value as any)}
                  className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-[#b02524]/20 focus:border-[#b02524]"
                >
                  <option value="NORMAL">Normal (Jadwal Pengadaan Rutin)</option>
                  <option value="URGENT">Mendesak / Urgent (Stok Kritis)</option>
                  <option value="CRITICAL">Kritis / Emergency (Mesin Breakdown)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Target Tanggal Dibutuhkan</label>
                <input
                  type="date"
                  value={formTargetDate}
                  onChange={(e) => setFormTargetDate(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-[#b02524]/20 focus:border-[#b02524]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Ref. Gambar / CAD / Standar Teknis</label>
                <input
                  type="text"
                  placeholder="Contoh: DWG-MTC-2026-08 / Manual Book P-100"
                  value={formDrawingRef}
                  onChange={(e) => setFormDrawingRef(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-[#b02524]/20 focus:border-[#b02524]"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-stone-700">Justifikasi & Alasan Kebutuhan</label>
                <textarea
                  rows={2}
                  placeholder="Jelaskan alasan mengapa kebutuhan ini diperlukan pabrik (contoh: pencegahan downtime mesin cetak saat pesanan padat)..."
                  value={formJustification}
                  onChange={(e) => setFormJustification(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-stone-200 rounded-xl font-medium focus:ring-2 focus:ring-[#b02524]/20 focus:border-[#b02524]"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Bill of Materials (BOM) Editor */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-[#b02524]" />
                  2. Rincian Bill of Materials (BOM) & Spareparts
                </h3>
                <p className="text-[11px] text-stone-500 font-medium mt-0.5">
                  Pilih dari master inventory atau masukkan item/part custom baru beserta estimasi biaya.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={handleAddBomRow}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs font-bold border-stone-200 hover:bg-stone-50 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Baris BOM</span>
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto border border-stone-200 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3 pl-4">Pilih dari Master / Nama Barang *</th>
                    <th className="p-3">Spesifikasi / Dimensi</th>
                    <th className="p-3">Part No. / Kode</th>
                    <th className="p-3 w-20 text-center">Qty</th>
                    <th className="p-3 w-20">Satuan</th>
                    <th className="p-3 w-32 text-right">Est. Harga (Rp)</th>
                    <th className="p-3 w-32 text-right">Subtotal (Rp)</th>
                    <th className="p-3 w-12 pr-4 text-center">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {formBomItems.map((item, idx) => {
                    const subtotal = (Number(item.qty) || 0) * (Number(item.estimated_unit_price) || 0);
                    return (
                      <tr key={item.id} className="hover:bg-stone-50/50">
                        <td className="p-3 pl-4 space-y-1.5">
                          {/* Optional master selector */}
                          <select
                            onChange={(e) => handleSelectInventoryMaster(item.id, e.target.value)}
                            defaultValue=""
                            className="w-full text-[11px] p-1.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-600 focus:outline-none"
                          >
                            <option value="">-- Pilih dari Stok Gudang (Opsional) --</option>
                            {inventoryList.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.item_code ? `[${inv.item_code}] ` : ""}
                                {inv.name} (Sisa: {inv.free_stock || inv.quantity || 0} {inv.uom})
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            required
                            placeholder="Nama Part / Material..."
                            value={item.item_name}
                            onChange={(e) => handleUpdateBomItem(item.id, "item_name", e.target.value)}
                            className="w-full text-xs p-1.5 bg-white border border-stone-200 rounded-lg font-bold text-stone-900 focus:outline-none focus:border-[#b02524]"
                          />
                        </td>

                        <td className="p-3">
                          <input
                            type="text"
                            placeholder="Spesifikasi / Grade..."
                            value={item.specification || ""}
                            onChange={(e) => handleUpdateBomItem(item.id, "specification", e.target.value)}
                            className="w-full text-xs p-1.5 bg-white border border-stone-200 rounded-lg focus:outline-none"
                          />
                        </td>

                        <td className="p-3">
                          <input
                            type="text"
                            placeholder="Part # / OEM..."
                            value={item.part_number || ""}
                            onChange={(e) => handleUpdateBomItem(item.id, "part_number", e.target.value)}
                            className="w-full text-xs p-1.5 bg-white border border-stone-200 rounded-lg font-mono focus:outline-none"
                          />
                        </td>

                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            required
                            value={item.qty}
                            onChange={(e) => handleUpdateBomItem(item.id, "qty", parseFloat(e.target.value) || 0)}
                            className="w-20 text-xs p-1.5 text-center bg-white border border-stone-200 rounded-lg font-black focus:outline-none"
                          />
                        </td>

                        <td className="p-3">
                          <input
                            type="text"
                            placeholder="PCS"
                            value={item.uom}
                            onChange={(e) => handleUpdateBomItem(item.id, "uom", e.target.value.toUpperCase())}
                            className="w-20 text-xs p-1.5 bg-white border border-stone-200 rounded-lg uppercase text-center font-bold focus:outline-none"
                          />
                        </td>

                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={item.estimated_unit_price}
                            onChange={(e) =>
                              handleUpdateBomItem(item.id, "estimated_unit_price", parseFloat(e.target.value) || 0)
                            }
                            className="w-32 text-xs p-1.5 text-right bg-white border border-stone-200 rounded-lg font-mono focus:outline-none"
                          />
                        </td>

                        <td className="p-3 text-right font-black text-stone-900 font-mono">
                          Rp {subtotal.toLocaleString("id-ID")}
                        </td>

                        <td className="p-3 pr-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveBomRow(item.id)}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Hapus baris"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Footer Summary */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-200/80">
              <div className="text-xs text-stone-500 font-medium">
                Jumlah Item: <span className="font-bold text-stone-800">{formBomItems.length} baris BOM</span>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">Total Estimasi Anggaran:</span>
                <span className="text-xl font-black text-[#b02524] font-mono">
                  Rp {formTotalCost.toLocaleString("id-ID")}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              variant="outline"
              className="rounded-xl border-stone-200 text-stone-600"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              variant="primary"
              className="bg-[#b02524] hover:bg-red-800 text-white rounded-xl font-bold px-6 py-2.5 shadow-xs"
            >
              {isSubmitting ? "Menyimpan..." : "Kirim Pengajuan General Request"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 7. MODAL DETAIL REQUEST & 1-CLICK GENERATE PR */}
      <Modal
        isOpen={!!selectedDetail}
        onClose={() => setSelectedDetail(null)}
        maxWidth="5xl"
        title={
          selectedDetail && (
            <div className="flex items-center justify-between gap-4 w-full pr-8">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-black bg-stone-100 text-stone-800 px-2.5 py-1 rounded-lg border border-stone-200">
                  {selectedDetail.request_code}
                </span>
                <h2 className="text-lg font-black text-stone-900">{selectedDetail.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                {selectedDetail.status === "PR_GENERATED" ? (
                  <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ✓ PR Diterbitkan
                  </span>
                ) : selectedDetail.status === "APPROVED" ? (
                  <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 text-blue-800 border border-blue-300">
                    Disetujui
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                    Menunggu Review
                  </span>
                )}
              </div>
            </div>
          )
        }
      >
        {selectedDetail && (
          <div className="space-y-6">
            {/* Header Meta Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-200 text-xs">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase">Departemen</p>
                <p className="font-bold text-stone-800 mt-0.5">{selectedDetail.department}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase">Kategori</p>
                <p className="font-bold text-stone-800 mt-0.5">
                  {CATEGORY_MAP[selectedDetail.category]?.label || selectedDetail.category}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase">Pemohon</p>
                <p className="font-bold text-stone-800 mt-0.5">{selectedDetail.requester_name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase">Target Kebutuhan</p>
                <p className="font-bold text-stone-800 mt-0.5">{selectedDetail.target_delivery_date || "-"}</p>
              </div>
            </div>

            {/* Justification & Drawing Reference */}
            {(selectedDetail.justification || selectedDetail.drawing_reference) && (
              <div className="bg-white p-4 rounded-2xl border border-stone-200 text-xs space-y-2">
                {selectedDetail.drawing_reference && (
                  <p className="text-stone-600">
                    <strong className="text-stone-800">Referensi Gambar / Spesifikasi Teknis:</strong>{" "}
                    <span className="font-mono bg-stone-100 px-2 py-0.5 rounded text-stone-800 font-bold">
                      {selectedDetail.drawing_reference}
                    </span>
                  </p>
                )}
                {selectedDetail.justification && (
                  <p className="text-stone-600 leading-relaxed">
                    <strong className="text-stone-800">Justifikasi Kebutuhan:</strong> {selectedDetail.justification}
                  </p>
                )}
              </div>
            )}

            {/* Linked PR Notice if generated */}
            {selectedDetail.pr_number && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-900">
                      Telah Terbit Purchase Requisition: <span className="font-mono font-black">{selectedDetail.pr_number}</span>
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      Permintaan ini telah diteruskan ke tim Pengadaan & Pembelian (Procurement).
                    </p>
                  </div>
                </div>
                <Link to="/procurement">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-emerald-300 text-emerald-800 hover:bg-emerald-100 flex items-center gap-1.5 text-xs font-bold"
                  >
                    <span>Buka Procurement</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            )}

            {/* Items BOM Table */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-[#b02524]" />
                Daftar Item Kebutuhan (Bill of Materials)
              </h3>

              <div className="overflow-x-auto border border-stone-200 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="p-3 pl-4">No</th>
                      <th className="p-3">Nama Part / Barang</th>
                      <th className="p-3">Spesifikasi & Part No.</th>
                      <th className="p-3 text-center">Stok Gudang</th>
                      <th className="p-3 text-center">Qty Diminta</th>
                      <th className="p-3 text-right">Harga Satuan (Rp)</th>
                      <th className="p-3 pr-4 text-right">Subtotal (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {selectedDetail.items && selectedDetail.items.length > 0 ? (
                      selectedDetail.items.map((it, idx) => (
                        <tr key={it.id} className="hover:bg-stone-50/50">
                          <td className="p-3 pl-4 text-stone-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="p-3 font-bold text-stone-900">
                            {it.item_name}
                            {it.item_code && <span className="text-[10px] font-mono text-stone-400 ml-1.5">[{it.item_code}]</span>}
                          </td>
                          <td className="p-3 text-stone-600">
                            {it.specification || "-"}
                            {it.part_number && (
                              <span className="block text-[10px] font-mono text-stone-500">PN: {it.part_number}</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold font-mono",
                                (it.current_free_stock || 0) > 0 ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-400"
                              )}
                            >
                              {it.current_free_stock || 0} {it.uom}
                            </span>
                          </td>
                          <td className="p-3 text-center font-black text-stone-900 font-mono">
                            {it.qty} {it.uom}
                          </td>
                          <td className="p-3 text-right font-mono text-stone-700">
                            Rp {(it.estimated_unit_price || 0).toLocaleString("id-ID")}
                          </td>
                          <td className="p-3 pr-4 text-right font-black font-mono text-stone-900">
                            Rp {((it.qty || 0) * (it.estimated_unit_price || 0)).toLocaleString("id-ID")}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-stone-400">
                          Tidak ada rincian item BOM.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-stone-50/80 border-t border-stone-200 font-black">
                      <td colSpan={6} className="p-3 pl-4 text-right uppercase tracking-wider text-stone-600 text-[10px]">
                        Total Estimasi Biaya Pengadaan:
                      </td>
                      <td className="p-3 pr-4 text-right font-mono text-sm text-[#b02524]">
                        Rp {selectedDetail.estimated_total_cost.toLocaleString("id-ID")}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Bottom Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-stone-200">
              <div className="text-xs text-stone-400 font-medium">
                Dibuat pada: {new Date(selectedDetail.created_at).toLocaleString("id-ID")}
                {selectedDetail.approved_by && ` • Disetujui oleh: ${selectedDetail.approved_by}`}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => window.print()}
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-stone-200 text-stone-600 flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Disposisi</span>
                </Button>

                {selectedDetail.status === "SUBMITTED" && (
                  <Button
                    onClick={() => handleApproveRequest(selectedDetail.id)}
                    variant="primary"
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Setujui Permintaan Teknis</span>
                  </Button>
                )}

                {selectedDetail.status !== "PR_GENERATED" && (
                  <Button
                    onClick={() => handleGeneratePr(selectedDetail.id)}
                    disabled={isSubmitting}
                    variant="primary"
                    size="sm"
                    className="bg-[#b02524] hover:bg-red-800 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? "Menerbitkan..." : "Terbitkan Purchase Requisition (PR)"}</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
