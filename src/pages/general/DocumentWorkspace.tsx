import React, { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  FileText,
  Plus,
  RefreshCw,
  Eye,
  PenTool,
  ShieldCheck,
  CheckCircle2,
  AlertOctagon,
  Building2,
  Clock,
  Sparkles,
  ArrowRight,
  Filter,
  Search,
  Printer
} from "lucide-react";
import { CanvaStudioEditor, DEPARTMENT_ROUTING_CONFIG, OFFICIAL_KOP_SURAT_BLOCK } from "@/components/erp/workspace/CanvaStudioEditor";
import {
  DocBlock,
  LayoutPreset,
  TargetDepartment,
  WorkspaceDocument,
} from "@/types/workspace";

// Preset Templates that illustrate the Canva concept
const TEMPLATE_PRESETS = [
  {
    id: "PURCHASING_MEMO",
    titleId: "Memo Pengadaan Suku Cadang & Barang",
    titleEn: "Procurement & Sparepart Memo",
    type: "MEMORANDUM",
    targetDept: "PURCHASING" as TargetDepartment,
    descriptionId: "Dilengkapi Kop Resmi, Alamat Vendor, Tabel Kebutuhan & Kolom TTD Purchasing (Auto-Trigger)",
    descriptionEn: "Features Official Letterhead, Vendor Address, Material Table & Purchasing Signature",
    defaultBlocks: [
      {
        id: "b1",
        type: "OFFICIAL_LETTERHEAD" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "PT FATHIN BUMI PRATAMA",
        subtitle: "PRODUSEN & SUPPLIER UTAMA PAVING BLOCK, BATAKO & BETON PRACETAK",
        addressData: {
          companyName: "PT FATHIN BUMI PRATAMA",
          division: "Plant Workshop & Head Office",
          streetAddress: "Jl. Raya Boboh No. 88, Menganti, Gresik - Jawa Timur",
          phone: "+62 812-3456-7890 / (031) 7912345",
          email: "operasional@pavingjoss.com",
        },
        style: "OFFICIAL" as const,
        alignment: "CENTER" as const,
      },
      {
        id: "b2",
        type: "HEADER" as const,
        category: "BODY_TEXT" as const,
        title: "MEMORANDUM PERMINTAAN PENGADAAN SUKU CADANG",
        content: `NO: MEMO/PURCH/${new Date().getFullYear()}/001`,
        alignment: "CENTER" as const,
      },
      {
        id: "b3",
        type: "RECIPIENT_ADDRESS" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "DITUJUKAN KEPADA REKANAN / VENDOR (TO)",
        addressData: {
          companyName: "Kepada Yth: PT Mitra Mesin Hidrolik Surabaya",
          division: "Divisi Sales & Supply Chain B2B",
          contactPerson: "Up: Bpk. Haryanto (Sales Representative)",
          streetAddress: "Kawasan Industri Gresik Blok C-12, Jawa Timur",
          phone: "+62 811-9876-5432",
        },
      },
      {
        id: "b4",
        type: "TEXT" as const,
        category: "BODY_TEXT" as const,
        content:
          "Sehubungan dengan perawatan rutin lini mesin press hidrolik Paving Block Line #2, kami mengajukan permohonan pengadaan suku cadang kritis sesuai matriks kebutuhan di bawah ini guna menghindari risiko downtime pada target jadwal produksi.",
      },
      {
        id: "b5",
        type: "TABLE" as const,
        category: "BODY_TEXT" as const,
        title: "Matriks Komponen Kebutuhan Pengadaan",
        tableData: {
          headers: ["No", "Nama Part / Komponen", "Spesifikasi / Merk", "Qty", "Urgensi"],
          rows: [
            ["1", "Solenoid Directional Valve", "Yuken DSG-03-3C2-D24-50", "2 Pcs", "Mendesak (Critical)"],
            ["2", "Hydraulic Filter Element", "Return Line 10 Micron", "4 Pcs", "Normal"],
            ["3", "Seal Kit Silinder Utama", "Polyurethane 140x160x15", "2 Set", "Mendesak (Critical)"],
          ],
        },
      },
      {
        id: "b6",
        type: "CALLOUT" as const,
        category: "BODY_TEXT" as const,
        style: "WARNING" as const,
        title: "KETENTUAN PENGIRIMAN & SPESIFIKASI",
        content:
          "Barang wajib dilengkapi Certificate of Analysis (CoA) pabrikan dan diantar langsung ke Gudang Bahan Baku Menganti paling lambat 3 hari kerja setelah otorisasi PO diterbitkan.",
      },
      {
        id: "b7",
        type: "SIGNATURE_COLUMN" as const,
        category: "SIGNATURE_COLUMN" as const,
        title: "Kolom Otorisasi Departemen Purchasing",
        subtitle: "Tanda Tangan Pengesahan Manager Pengadaan",
        targetDepartment: "PURCHASING" as TargetDepartment,
        targetRole: "PURCHASING_MANAGER" as const,
        signatoryTitle: "Purchasing Manager (Manager Pengadaan)",
        notes: "Dokumen ini otomatis diteruskan ke Departemen Purchasing untuk dibaca dan diotorisasi.",
        isTriggerActive: true,
      },
    ],
  },
  {
    id: "PRODUCTION_POLICY",
    titleId: "Instruksi Kerja & Regulasi Produksi",
    titleEn: "Plant Operating Instructions & Policy",
    type: "INTERNAL_POLICY",
    targetDept: "PRODUCTION" as TargetDepartment,
    descriptionId: "Kop Resmi, Alamat Lokasi Proyek, Poin Regulasi & Kolom TTD Produksi (Auto-Trigger)",
    descriptionEn: "Features Letterhead, Site Location, Operating Steps & Production Signature",
    defaultBlocks: [
      {
        id: "b1",
        type: "OFFICIAL_LETTERHEAD" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "PT FATHIN BUMI PRATAMA",
        subtitle: "DIVISI OPERASIONAL PABRIK & REKAYASA TEKNIK",
        addressData: {
          companyName: "PT FATHIN BUMI PRATAMA",
          streetAddress: "Workshop Pabrik Menganti Line #1 & #2, Gresik",
          phone: "(031) 7912345",
          email: "produksi@pavingjoss.com",
        },
        style: "OFFICIAL" as const,
        alignment: "CENTER" as const,
      },
      {
        id: "b2",
        type: "HEADER" as const,
        category: "BODY_TEXT" as const,
        title: "STANDARD OPERATING PROCEDURE: QUALITY CONTROL PAVING K-400",
        content: `NO: SOP/PROD/${new Date().getFullYear()}/012`,
        alignment: "CENTER" as const,
      },
      {
        id: "b3",
        type: "PROJECT_SITE_ADDRESS" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "LOKASI KERJA & BATCHING PLANT",
        addressData: {
          companyName: "Batching Plant Utama Gresik",
          siteLocation: "Lini Press Mesin Otomatis #1",
          contactPerson: "Supervisor Shift: Bpk. Mulyono",
          streetAddress: "Area Produksi Paving K-400 / K-500 Heavy Duty",
        },
      },
      {
        id: "b4",
        type: "LIST_POINTS" as const,
        category: "BODY_TEXT" as const,
        title: "Standar Prosedur Mutu Produksi:",
        listItems: [
          "1. Uji kelembapan pasir silika dan agregat sebelum proses batch mixing dimulai.",
          "2. Pertahankan rasio water-cement ratio pada toleransi maksimum 0.32.",
          "3. Lakukan penimbangan sampel fisik setiap 500 unit batako/paving press.",
          "4. Catat nomor lot travel tag (WOT) pada lembar kendali proses QR.",
        ],
      },
      {
        id: "b5",
        type: "SIGNATURE_COLUMN" as const,
        category: "SIGNATURE_COLUMN" as const,
        title: "Kolom Otorisasi Departemen Produksi",
        subtitle: "Pengesahan Production Manager",
        targetDepartment: "PRODUCTION" as TargetDepartment,
        targetRole: "PRODUCTION_MANAGER" as const,
        signatoryTitle: "Production Manager / Kepala Pabrik",
        notes: "Dokumen ini otomatis diteruskan ke Departemen Produksi untuk dibaca dan disetujui.",
        isTriggerActive: true,
      },
    ],
  },
  {
    id: "FINANCE_DISBURSEMENT",
    titleId: "Otorisasi Anggaran & Pengeluaran Dana",
    titleEn: "Budget Authorization & Finance Release",
    type: "AUTHORIZATION_LETTER",
    targetDept: "FINANCE" as TargetDepartment,
    descriptionId: "Kop Resmi, Alamat Pengirim, Callout Anggaran & Kolom TTD Finance (Auto-Trigger)",
    descriptionEn: "Features Letterhead, Sender Address, Budget Callout & Finance Signature",
    defaultBlocks: [
      {
        id: "b1",
        type: "OFFICIAL_LETTERHEAD" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "PT FATHIN BUMI PRATAMA",
        subtitle: "HEAD OFFICE & FINANCIAL TREASURY",
        addressData: {
          companyName: "PT FATHIN BUMI PRATAMA",
          streetAddress: "Jl. Raya Boboh No. 88, Menganti, Gresik",
          phone: "(031) 7912345",
          email: "finance@pavingjoss.com",
        },
        style: "OFFICIAL" as const,
        alignment: "CENTER" as const,
      },
      {
        id: "b2",
        type: "HEADER" as const,
        category: "BODY_TEXT" as const,
        title: "SURAT OTORISASI PENCAIRAN ANGGARAN WORKSHOP",
        content: `NO: FIN/DISBURSE/${new Date().getFullYear()}/045`,
        alignment: "CENTER" as const,
      },
      {
        id: "b3",
        type: "SENDER_ADDRESS" as const,
        category: "ADDRESS_TEMPLATE" as const,
        title: "DIVISI PEMOHON ANGGARAN",
        addressData: {
          companyName: "PT Fathin Bumi Pratama",
          division: "Departemen Maintenance & Workshop",
          contactPerson: "Ir. Hendra Gunawan",
          streetAddress: "Gedung Workshop Plant Menganti",
          phone: "Ext. 102",
        },
      },
      {
        id: "b4",
        type: "CALLOUT" as const,
        category: "BODY_TEXT" as const,
        style: "INFO" as const,
        title: "RINGKASAN ALOKASI ANGGARAN OPERASIONAL",
        content:
          "Total anggaran yang diajukan sebesar Rp 14.500.000 (Empat Belas Juta Lima Ratus Ribu Rupiah) untuk perbaikan darurat gearbox conveyor batching plant.",
      },
      {
        id: "b5",
        type: "SIGNATURE_COLUMN" as const,
        category: "SIGNATURE_COLUMN" as const,
        title: "Kolom Otorisasi Departemen Keuangan",
        subtitle: "Pengesahan Head of Finance",
        targetDepartment: "FINANCE" as TargetDepartment,
        targetRole: "FINANCE_HEAD" as const,
        signatoryTitle: "Head of Finance & Accounting",
        notes: "Dokumen ini otomatis diteruskan ke Departemen Keuangan untuk verifikasi anggaran & otorisasi.",
        isTriggerActive: true,
      },
    ],
  },
];

export function DocumentWorkspace() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const isId = language === "id";

  const [docs, setDocs] = useState<WorkspaceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"ALL" | "ACTION_REQUIRED" | "MY_DOCS">("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Canva Studio Modal & Editor States
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [studioInitialTitle, setStudioInitialTitle] = useState("");
  const [studioInitialDocType, setStudioInitialDocType] = useState("MEMORANDUM");
  const [studioInitialDepartment, setStudioInitialDepartment] = useState("General");
  const [studioInitialAuthRole, setStudioInitialAuthRole] = useState("PURCHASING_MANAGER");
  const [studioInitialAuthDept, setStudioInitialAuthDept] = useState("PURCHASING");
  const [studioInitialAuthName, setStudioInitialAuthName] = useState("");
  const [studioInitialBlocks, setStudioInitialBlocks] = useState<DocBlock[]>([]);
  const [studioInitialLayoutPreset, setStudioInitialLayoutPreset] = useState<LayoutPreset>("A4_PORTRAIT");
  const [isSaving, setIsSaving] = useState(false);

  // Preview & Authorization Action Modal States
  const [previewDoc, setPreviewDoc] = useState<WorkspaceDocument | null>(null);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [targetReviseDocId, setTargetReviseDocId] = useState<string | null>(null);
  const [revisionNoteInput, setRevisionNoteInput] = useState("");

  // Fetch Documents from Backend
  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/workspace-documents", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        setDocs(res.data);
      }
    } catch (err) {
      console.error("Error fetching workspace docs:", err);
      showToast(isId ? "Gagal memuat dokumen workspace" : "Failed to load workspace documents", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  // Filter pending approvals
  const pendingActionDocs = useMemo(() => {
    return docs.filter((d) => d.status === "PENDING_APPROVAL");
  }, [docs]);

  // Filtered documents list
  const filteredDocs = useMemo(() => {
    let list = docs;
    if (activeTab === "ACTION_REQUIRED") {
      list = pendingActionDocs;
    } else if (activeTab === "MY_DOCS") {
      list = list.filter((d) => d.created_by_username === user?.username);
    }

    if (departmentFilter !== "ALL") {
      list = list.filter(
        (d) =>
          d.authorization_department === departmentFilter ||
          d.authorization_role?.includes(departmentFilter) ||
          d.department === departmentFilter
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.document_code.toLowerCase().includes(q) ||
          d.created_by_name?.toLowerCase().includes(q) ||
          d.authorization_role?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [docs, activeTab, pendingActionDocs, departmentFilter, searchQuery, user]);

  // Launch Studio Editor with Template or Blank
  const handleLaunchStudio = (templateId?: string) => {
    setEditingDocId(null);
    if (templateId) {
      const selected = TEMPLATE_PRESETS.find((t) => t.id === templateId) || TEMPLATE_PRESETS[0];
      setStudioInitialTitle(isId ? selected.titleId : selected.titleEn);
      setStudioInitialDocType(selected.type);
      setStudioInitialDepartment((user as any)?.department || "General");
      setStudioInitialAuthDept(selected.targetDept);
      setStudioInitialAuthRole(
        DEPARTMENT_ROUTING_CONFIG[selected.targetDept]?.role || "PURCHASING_MANAGER"
      );
      setStudioInitialAuthName("");
      setStudioInitialBlocks(JSON.parse(JSON.stringify(selected.defaultBlocks)));
      setStudioInitialLayoutPreset("A4_PORTRAIT");
    } else {
      // Blank Document with standard official Kop + Purchasing Signature Column
      setStudioInitialTitle(isId ? "Dokumen Baru Tanpa Judul" : "New Blank Document");
      setStudioInitialDocType("MEMORANDUM");
      setStudioInitialDepartment((user as any)?.department || "General");
      setStudioInitialAuthDept("PURCHASING");
      setStudioInitialAuthRole("PURCHASING_MANAGER");
      setStudioInitialAuthName("");
      setStudioInitialBlocks([
        {
          ...OFFICIAL_KOP_SURAT_BLOCK,
          isLocked: true,
        },
        {
          id: "blk-2",
          type: "HEADER",
          category: "BODY_TEXT",
          title: "MEMORANDUM RESMI INTERNAL",
          content: `NO: MEMO/PJ/${new Date().getFullYear()}/001`,
          alignment: "CENTER",
        },
        {
          id: "blk-3",
          type: "TEXT",
          category: "BODY_TEXT",
          content:
            "Ketikkan teks isi atau instruksi kerja Anda di sini. Anda dapat memasang blok alamat atau kolom tanda tangan departemen lain dari panel kiri.",
          alignment: "LEFT",
        },
        {
          id: "blk-4",
          type: "SIGNATURE_COLUMN",
          category: "SIGNATURE_COLUMN",
          title: "Kolom Otorisasi Departemen Purchasing",
          subtitle: "Tanda Tangan Pengesahan Manager Pengadaan",
          targetDepartment: "PURCHASING",
          targetRole: "PURCHASING_MANAGER",
          signatoryTitle: "Purchasing Manager (Manager Pengadaan)",
          notes: "Dokumen ini otomatis diteruskan ke Departemen Purchasing untuk dibaca dan diotorisasi.",
          isTriggerActive: true,
        },
      ]);
      setStudioInitialLayoutPreset("A4_PORTRAIT");
    }

    setIsStudioOpen(true);
  };

  // Launch Studio for Existing Document
  const handleEditExistingDoc = (doc: WorkspaceDocument) => {
    setEditingDocId(doc.id);
    setStudioInitialTitle(doc.title);
    setStudioInitialDocType(doc.document_type);
    setStudioInitialDepartment(doc.department || "General");
    setStudioInitialAuthRole(doc.authorization_role || "PURCHASING_MANAGER");
    setStudioInitialAuthDept(doc.authorization_department || "PURCHASING");
    setStudioInitialAuthName(doc.authorization_user_name || "");
    setStudioInitialBlocks(doc.content || []);
    setStudioInitialLayoutPreset(doc.layout_preset || "A4_PORTRAIT");
    setIsStudioOpen(true);
  };

  // Save Document handler invoked from Studio Editor
  const handleSaveFromStudio = async (docData: {
    title: string;
    document_type: string;
    department: string;
    content: DocBlock[];
    layout_preset: LayoutPreset;
    authorization_role: string;
    authorization_department: string;
    authorization_user_name: string;
    submitForApproval: boolean;
  }) => {
    setIsSaving(true);
    try {
      const payload = {
        title: docData.title,
        document_type: docData.document_type,
        department: docData.department,
        content: docData.content,
        layout_preset: docData.layout_preset,
        authorization_role: docData.authorization_role,
        authorization_department: docData.authorization_department,
        authorization_user_name: docData.authorization_user_name,
        status: docData.submitForApproval ? "PENDING_APPROVAL" : editingDocId ? undefined : "DRAFT",
      };

      let res;
      if (editingDocId) {
        res = await apiFetch(`/api/workspace-documents/${editingDocId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        }, user?.username);

        if (res.ok && docData.submitForApproval) {
          await apiFetch(`/api/workspace-documents/${editingDocId}/submit-approval`, {
            method: "POST",
          }, user?.username);
        }
      } else {
        res = await apiFetch("/api/workspace-documents", {
          method: "POST",
          body: JSON.stringify(payload),
        }, user?.username);

        if (res.ok && res.data?.id && docData.submitForApproval) {
          await apiFetch(`/api/workspace-documents/${res.data.id}/submit-approval`, {
            method: "POST",
          }, user?.username);
        }
      }

      if (res.ok) {
        showToast(
          docData.submitForApproval
            ? isId
              ? `Dokumen berhasil diteruskan ke Departemen ${docData.authorization_department} untuk diotorisasi!`
              : `Document submitted to ${docData.authorization_department} department for authorization!`
            : isId
            ? "Dokumen berhasil disimpan sebagai draft."
            : "Document saved as draft.",
          "success"
        );
        setIsStudioOpen(false);
        fetchDocs();
      } else {
        showToast(res.error || "Gagal menyimpan dokumen", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Terjadi kesalahan sistem", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Approve Document
  const handleApproveDocument = async (docId: string) => {
    try {
      const res = await apiFetch(`/api/workspace-documents/${docId}/approve`, {
        method: "POST",
      }, user?.username);

      if (res.ok) {
        showToast(isId ? "Dokumen berhasil disetujui & diotorisasi (APPROVED)." : "Document authorized (APPROVED).", "success");
        fetchDocs();
        setPreviewDoc(null);
      } else {
        showToast(res.error || "Gagal menyetujui dokumen", "error");
      }
    } catch (err) {
      showToast("Gagal memproses otorisasi", "error");
    }
  };

  // Submit Revision Note
  const handleSubmitRevisionNote = async () => {
    if (!targetReviseDocId || !revisionNoteInput.trim()) {
      showToast(isId ? "Catatan revisi wajib diisi." : "Revision note is required.", "info");
      return;
    }

    try {
      const res = await apiFetch(`/api/workspace-documents/${targetReviseDocId}/revise`, {
        method: "POST",
        body: JSON.stringify({ revision_note: revisionNoteInput.trim() }),
      }, user?.username);

      if (res.ok) {
        showToast(isId ? "Catatan revisi telah dikirimkan ke pembuat dokumen." : "Revision note sent to author.", "success");
        setShowRevisionModal(false);
        setRevisionNoteInput("");
        setTargetReviseDocId(null);
        setPreviewDoc(null);
        fetchDocs();
      } else {
        showToast(res.error || "Gagal mengirim revisi", "error");
      }
    } catch (err) {
      showToast("Terjadi kesalahan sistem", "error");
    }
  };

  return (
    <div className="space-y-6 pb-20 bg-stone-50 min-h-screen text-stone-900 p-6 rounded-3xl">
      {/* 1. Page Header */}
      <PageHeader
        title={isId ? "Workspace Dokumen (Canva Studio)" : "Document Workspace Studio"}
        subtitle={
          isId
            ? "Desain dokumen resmi persis Canva: Template Body Text, Alamat, dan Signature Kolom yang otomatis men-trigger otorisasi ke departemen tujuan."
            : "Visual document studio with Canva-style body text, address templates, and auto-routing signature columns."
        }
        icon={<FileText className="w-5 h-5 text-amber-700" />}
        iconBgClassName="bg-amber-50 border border-amber-200/80 text-amber-700"
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleLaunchStudio()}
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs px-3.5 py-2 shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isId ? "Buat Dokumen Baru (Canva)" : "New Canvas Document"}</span>
            </Button>
            <Button
              onClick={fetchDocs}
              variant="outline"
              className="text-xs font-bold rounded-xl border-stone-300 bg-white hover:bg-stone-100 text-stone-800 flex items-center gap-1.5 shadow-2xs"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-stone-500", isLoading && "animate-spin")} />
              <span>{isId ? "Segarkan" : "Refresh"}</span>
            </Button>
          </div>
        }
      />

      {/* 2. Action Required & Document History List Tabs */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
        {/* Filter Bar & Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-100 pb-4">
          {/* Main Status Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTab("ALL")}
              className={cn(
                "py-2 px-3.5 rounded-xl text-xs font-bold transition-all",
                activeTab === "ALL"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-stone-100 text-stone-600 hover:text-stone-900"
              )}
            >
              {isId ? "Semua Dokumen" : "All Documents"} ({docs.length})
            </button>

            <button
              onClick={() => setActiveTab("ACTION_REQUIRED")}
              className={cn(
                "py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5",
                activeTab === "ACTION_REQUIRED"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-stone-100 text-stone-600 hover:text-stone-900"
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{isId ? "Perlu Otorisasi (Pending)" : "Pending Approvals"}</span>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-mono font-black",
                activeTab === "ACTION_REQUIRED" ? "bg-amber-800 text-white" : "bg-stone-200 text-stone-800"
              )}>
                {pendingActionDocs.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("MY_DOCS")}
              className={cn(
                "py-2 px-3.5 rounded-xl text-xs font-bold transition-all",
                activeTab === "MY_DOCS"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "bg-stone-100 text-stone-600 hover:text-stone-900"
              )}
            >
              {isId ? "Dokumen Saya" : "My Documents"}
            </button>
          </div>

          {/* Department Filter & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Department Filter Dropdown */}
            <div className="relative">
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="text-xs pl-7 pr-6 py-2 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="ALL">{isId ? "Semua Departemen Otorisasi" : "All Target Depts"}</option>
                <option value="PURCHASING">Dept. Purchasing (Pengadaan)</option>
                <option value="FINANCE">Dept. Keuangan (Finance)</option>
                <option value="PRODUCTION">Dept. Produksi (Plant)</option>
                <option value="FACTORY_CONTROLLER">Factory Controller (FC)</option>
                <option value="MANAGEMENT">Direksi & GM</option>
                <option value="WAREHOUSE">Gudang & Logistik</option>
              </select>
              <Filter className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder={isId ? "Cari judul / kode..." : "Search title / code..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 sm:w-60 pl-8 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-amber-500 font-medium"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Document Table */}
        <div className="overflow-x-auto border border-stone-200 rounded-2xl shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-3 pl-4">{isId ? "Kode & Judul Dokumen" : "Code & Title"}</th>
                <th className="p-3">{isId ? "Target Otorisasi (Dept)" : "Routing Target (Dept)"}</th>
                <th className="p-3">{isId ? "Pembuat Dokumen" : "Author"}</th>
                <th className="p-3 text-center">{isId ? "Status" : "Status"}</th>
                <th className="p-3 pr-4 text-center">{isId ? "Aksi" : "Action"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-stone-400 text-xs italic space-y-2">
                    <FileText className="w-8 h-8 text-stone-300 mx-auto" />
                    <p>{isId ? "Tidak ada dokumen yang sesuai dengan filter." : "No workspace documents match filter."}</p>
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => {
                  const targetDept = (doc.authorization_department || "PURCHASING") as TargetDepartment;
                  const deptConfig = DEPARTMENT_ROUTING_CONFIG[targetDept] || DEPARTMENT_ROUTING_CONFIG.PURCHASING;

                  return (
                    <tr key={doc.id} className="hover:bg-stone-50/60 transition-colors">
                      {/* Code & Title */}
                      <td className="p-3 pl-4">
                        <div className="font-mono font-bold text-stone-900 text-xs">{doc.document_code}</div>
                        <div className="font-black text-stone-800 text-xs mt-0.5 line-clamp-1">{doc.title}</div>
                        <div className="text-[10px] text-stone-400 mt-0.5">{doc.document_type} · {doc.layout_preset}</div>
                      </td>

                      {/* Routing Target Dept */}
                      <td className="p-3">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-2xs bg-blue-50 border-blue-200 text-blue-900">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                          <span>{deptConfig.deptNameId}</span>
                        </div>
                        <div className="text-[10px] text-stone-400 mt-1 font-mono">
                          {doc.authorization_role}
                        </div>
                      </td>

                      {/* Author */}
                      <td className="p-3">
                        <div className="font-bold text-stone-800">{doc.created_by_name}</div>
                        <div className="text-[10px] text-stone-400">
                          {new Date(doc.created_at).toLocaleDateString("id-ID")} · {doc.department}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border",
                            doc.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : doc.status === "PENDING_APPROVAL"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : doc.status === "REVISION_REQUIRED"
                              ? "bg-rose-50 text-rose-800 border-rose-200"
                              : "bg-stone-100 text-stone-700 border-stone-200"
                          )}
                        >
                          {doc.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-3 pr-4 text-center space-x-1.5">
                        <Button
                          onClick={() => setPreviewDoc(doc)}
                          variant="outline"
                          size="xs"
                          className="rounded-xl text-[10px] font-bold border-stone-200 bg-white hover:bg-stone-100 text-stone-700 gap-1"
                        >
                          <Eye className="w-3 h-3 text-stone-500" />
                          <span>{isId ? "Pratinjau" : "Preview"}</span>
                        </Button>

                        <Button
                          onClick={() => handleEditExistingDoc(doc)}
                          variant="secondary"
                          size="xs"
                          className="rounded-xl text-[10px] font-bold border-stone-200 bg-stone-100 hover:bg-stone-200 text-stone-800 gap-1"
                        >
                          <PenTool className="w-3 h-3 text-amber-700" />
                          <span>{isId ? "Edit Canvas" : "Edit Canvas"}</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. CANVA STUDIO FULLSCREEN WORKSPACE EDITOR MODAL        */}
      {/* ======================================================== */}
      {isStudioOpen && (
        <CanvaStudioEditor
          documentId={editingDocId}
          initialTitle={studioInitialTitle}
          initialDocType={studioInitialDocType}
          initialDepartment={studioInitialDepartment}
          initialAuthRole={studioInitialAuthRole}
          initialAuthDepartment={studioInitialAuthDept}
          initialAuthName={studioInitialAuthName}
          initialBlocks={studioInitialBlocks}
          initialLayoutPreset={studioInitialLayoutPreset}
          onSave={handleSaveFromStudio}
          onClose={() => setIsStudioOpen(false)}
          isSaving={isSaving}
          isId={isId}
        />
      )}

      {/* ======================================================== */}
      {/* 5. HIGH-FIDELITY DOCUMENT PREVIEW & APPROVAL MODAL       */}
      {/* ======================================================== */}
      <Modal
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        maxWidth="4xl"
        title={
          previewDoc && (
            <div className="flex items-center justify-between w-full pr-8">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black bg-stone-100 text-stone-800 px-2.5 py-0.5 rounded-lg border">
                  {previewDoc.document_code}
                </span>
                <span className="font-bold text-stone-900 text-sm truncate max-w-md">{previewDoc.title}</span>
              </div>

              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border",
                previewDoc.status === "APPROVED"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : previewDoc.status === "PENDING_APPROVAL"
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-stone-100 text-stone-700 border-stone-200"
              )}>
                {previewDoc.status}
              </span>
            </div>
          )
        }
      >
        {previewDoc && (
          <div className="space-y-6">
            {/* Metadata Bar */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs">
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">Pembuat Dokumen</span>
                <span className="font-bold text-stone-800">{previewDoc.created_by_name} ({previewDoc.department})</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">Target Departemen Otorisasi</span>
                <span className="font-bold text-blue-800">{previewDoc.authorization_department || "PURCHASING"}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">Tanggal Terbit</span>
                <span className="font-bold text-stone-800">{new Date(previewDoc.created_at).toLocaleDateString("id-ID")}</span>
              </div>
            </div>

            {/* Revision Note Alert */}
            {previewDoc.revision_note && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-rose-900 flex items-center gap-1.5">
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                  <span>Catatan Revisi Otorisasi:</span>
                </div>
                <div className="text-rose-800 italic">{previewDoc.revision_note}</div>
              </div>
            )}

            {/* Document A4 Paper Render Container */}
            <div className="bg-white border border-stone-300 rounded-2xl p-10 space-y-6 shadow-sm font-sans max-h-[550px] overflow-y-auto custom-scrollbar">
              {previewDoc.content?.map((b, bIdx) => (
                <div key={bIdx} className="space-y-2">
                  {/* Official Letterhead */}
                  {b.type === "OFFICIAL_LETTERHEAD" && (
                    <div className="text-center space-y-1.5 pb-4 border-b-2 border-stone-900 relative">
                      <div className="flex items-center justify-between pb-1">
                        <div className="w-12 h-12 rounded-xl bg-amber-600 text-white flex flex-col items-center justify-center font-black shadow-xs shrink-0">
                          <span className="text-lg leading-none">PJ</span>
                          <span className="text-[7px] font-mono tracking-tighter uppercase mt-0.5">EST. 2018</span>
                        </div>
                        <div className="text-center flex-1 px-4">
                          <h2 className="text-base font-black tracking-tight text-stone-950 uppercase font-sans">
                            {b.title || "PT FATHIN BUMI PRATAMA"}
                          </h2>
                          <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">
                            {b.subtitle || "PRODUSEN & SUPPLIER UTAMA PAVING BLOCK, BATAKO & BETON PRACETAK"}
                          </p>
                          <p className="text-[9px] text-stone-600 mt-0.5 font-medium">
                            {b.addressData?.streetAddress} · {b.addressData?.cityStateZip || "Gresik 61174, Indonesia"}
                          </p>
                          <p className="text-[9px] text-stone-500 font-mono">
                            Telp: {b.addressData?.phone} · Email: {b.addressData?.email}
                          </p>
                        </div>
                        <div className="w-12 h-12 flex flex-col items-center justify-center text-center font-mono text-[8px] text-stone-400 font-bold uppercase shrink-0 border border-stone-200 rounded-lg bg-stone-50/50">
                          <span>ISO 9001</span>
                          <span className="text-[6px] text-stone-400">REGISTERED</span>
                        </div>
                      </div>
                      <div className="h-0.75 bg-stone-950 w-full" />
                      <div className="h-px bg-stone-950 w-full -mt-1" />
                    </div>
                  )}

                  {/* Header Title */}
                  {b.type === "HEADER" && (
                    <div className="text-center space-y-1 border-b border-stone-100 pb-3">
                      <h3 className="text-base font-black tracking-tight text-stone-900 uppercase">{b.title}</h3>
                      <div className="text-xs font-bold text-stone-500 font-mono">{b.content}</div>
                    </div>
                  )}

                  {/* Address Blocks */}
                  {(b.type === "SENDER_ADDRESS" || b.type === "RECIPIENT_ADDRESS" || b.type === "PROJECT_SITE_ADDRESS") && (
                    <div className="p-3.5 bg-stone-50/80 border border-stone-200 rounded-xl space-y-1 text-xs">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">{b.title}</div>
                      <div className="font-bold text-stone-900">{b.addressData?.companyName}</div>
                      <div className="text-stone-700">{b.addressData?.division || b.addressData?.siteLocation}</div>
                      <div className="text-stone-600 text-[11px]">{b.addressData?.streetAddress}</div>
                      {b.addressData?.phone && (
                        <div className="text-stone-500 text-[10px] font-mono">Kontak: {b.addressData?.phone}</div>
                      )}
                    </div>
                  )}

                  {/* Paragraph */}
                  {b.type === "TEXT" && (
                    <p className="text-xs text-stone-800 leading-relaxed font-normal whitespace-pre-line">{b.content}</p>
                  )}

                  {/* Callout */}
                  {b.type === "CALLOUT" && (
                    <div className={cn(
                      "p-3.5 rounded-xl border text-xs space-y-1",
                      b.style === "WARNING" ? "bg-amber-50 border-amber-300 text-amber-950" : "bg-blue-50 border-blue-300 text-blue-950"
                    )}>
                      <div className="font-bold uppercase text-[10px] tracking-wide">{b.title}</div>
                      <div className="text-stone-800 leading-relaxed">{b.content}</div>
                    </div>
                  )}

                  {/* List Points */}
                  {b.type === "LIST_POINTS" && (
                    <div className="space-y-1 text-xs text-stone-800">
                      {b.title && <div className="font-bold text-stone-900">{b.title}</div>}
                      <ul className="space-y-1 pl-1">
                        {b.listItems?.map((li, liIdx) => (
                          <li key={liIdx} className="leading-relaxed">{li}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Table */}
                  {b.type === "TABLE" && (
                    <div className="overflow-x-auto border border-stone-200 rounded-xl text-xs">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-stone-100 border-b border-stone-200 font-bold text-stone-700">
                            {b.tableData?.headers.map((h, idx) => (
                              <th key={idx} className="p-2.5">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {b.tableData?.rows.map((r, rIdx) => (
                            <tr key={rIdx} className="border-b border-stone-100 hover:bg-stone-50/50">
                              {r.map((c, cIdx) => (
                                <td key={cIdx} className="p-2.5 text-stone-800">{c}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Signature Column */}
                  {(b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP") && (
                    <div className="pt-6 mt-6 border-t border-stone-200 flex items-center justify-between text-center text-xs">
                      <div className="w-48 text-center space-y-1">
                        <div className="text-[10px] text-stone-400 font-bold uppercase">Dibuat Oleh</div>
                        <div className="h-14 flex items-center justify-center text-stone-400 italic text-[11px]">
                          [ Signed ]
                        </div>
                        <div className="font-bold text-stone-900">{previewDoc.created_by_name}</div>
                        <div className="text-[10px] text-stone-500">{previewDoc.department}</div>
                      </div>

                      <div className="w-56 text-center space-y-1 border border-stone-200 rounded-2xl p-3 bg-stone-50/70">
                        <div className="text-[10px] text-blue-800 font-bold uppercase">
                          Otorisasi {b.targetDepartment || previewDoc.authorization_department}
                        </div>
                        <div className="h-12 flex items-center justify-center">
                          {previewDoc.status === "APPROVED" ? (
                            <span className="px-3 py-1 bg-emerald-600 text-white rounded-md text-[10px] font-black uppercase tracking-widest shadow-2xs">
                              ✓ APPROVED
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold">
                              MENUNGGU OTORISASI
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-stone-900">{b.signatoryTitle}</div>
                        <div className="text-[9px] text-stone-400 font-mono">
                          {previewDoc.approved_at
                            ? `Disetujui: ${new Date(previewDoc.approved_at).toLocaleDateString("id-ID")}`
                            : "Menunggu Tindakan Otorisator"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Approval Action Controls */}
            {previewDoc.status === "PENDING_APPROVAL" && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span>Otorisasi Diperlukan: {previewDoc.authorization_department} ({previewDoc.authorization_role})</span>
                  </div>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    Dokumen ini telah diarahkan ke antrean otorisasi Anda untuk dibaca dan disetujui.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={() => {
                      setTargetReviseDocId(previewDoc.id);
                      setShowRevisionModal(true);
                    }}
                    variant="outline"
                    className="bg-white hover:bg-stone-100 border-stone-300 text-stone-800 font-bold text-xs rounded-xl"
                  >
                    Minta Revisi
                  </Button>

                  <Button
                    onClick={() => handleApproveDocument(previewDoc.id)}
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl px-5 py-2 shadow-2xs"
                  >
                    Setujui & Otorisasi Dokumen
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ======================================================== */}
      {/* 6. REVISION NOTE MODAL                                   */}
      {/* ======================================================== */}
      <Modal
        isOpen={showRevisionModal}
        onClose={() => setShowRevisionModal(false)}
        maxWidth="md"
        title={<span className="font-bold text-stone-900 text-sm">Buat Catatan Revisi Dokumen</span>}
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-600">
            Masukkan poin koreksi atau instruksi revisi yang wajib diperbaiki oleh pembuat dokumen sebelum dapat diotorisasi.
          </p>

          <textarea
            rows={4}
            value={revisionNoteInput}
            onChange={(e) => setRevisionNoteInput(e.target.value)}
            placeholder="Tuliskan catatan revisi di sini..."
            className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl font-medium outline-none focus:border-amber-500"
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <Button
              onClick={() => setShowRevisionModal(false)}
              variant="outline"
              className="rounded-xl text-xs font-bold border-stone-200"
            >
              Batal
            </Button>
            <Button
              onClick={handleSubmitRevisionNote}
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold px-4 py-2"
            >
              Kirim Catatan Revisi
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
