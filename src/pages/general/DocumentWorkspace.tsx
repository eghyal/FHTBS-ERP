import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
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
  AlertOctagon,
  Clock,
  Search,
  Filter,
  LayoutGrid,
  List as ListIcon,
  Trash2,
  ArrowUpDown,
  CheckCircle2,
  ClipboardList,
  Banknote,
  FilePlus2,
  ChevronRight,
  Inbox,
  Copy,
  Lock,
} from "lucide-react";
import {
  CanvaStudioEditor,
  DEPARTMENT_ROUTING_CONFIG,
  OFFICIAL_KOP_SURAT_BLOCK,
} from "@/components/erp/workspace/CanvaStudioEditor";
import {
  DocBlock,
  LayoutPreset,
  TargetDepartment,
  WorkspaceDocument,
} from "@/types/workspace";
import {
  ERP_DEPARTMENT_OPTIONS,
  getDepartmentLabel,
  normalizeDepartmentToRole,
  canUserApproveDepartment,
} from "@/constants/rbac";

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
        title: "CV. BATU EMAS GROUP",
        subtitle: "PRODUSEN & SUPPLIER UTAMA PAVING BLOCK, BATAKO & BETON PRACETAK",
        addressData: {
          companyName: "CV. BATU EMAS GROUP",
          division: "Pabrik Utama & Kantor Banyuwangi",
          streetAddress: "Dusun Petahunan, Jajag, Gambiran, Banyuwangi Regency, East Java 68486",
          phone: "0811-1111-3993",
          email: "pavingjoss@gmail.com",
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
        title: "CV. BATU EMAS GROUP",
        subtitle: "DIVISI OPERASIONAL PABRIK & REKAYASA TEKNIK",
        addressData: {
          companyName: "CV. BATU EMAS GROUP",
          streetAddress: "Dusun Petahunan, Jajag, Gambiran, Banyuwangi 68486",
          phone: "0811-1111-3993",
          email: "pavingjoss@gmail.com",
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
          companyName: "Batching Plant Utama Banyuwangi",
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
        title: "CV. BATU EMAS GROUP",
        subtitle: "HEAD OFFICE & FINANCIAL TREASURY",
        addressData: {
          companyName: "CV. BATU EMAS GROUP",
          streetAddress: "Dusun Petahunan, Jajag, Gambiran, Banyuwangi 68486",
          phone: "0811-1111-3993",
          email: "pavingjoss@gmail.com",
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
          companyName: "CV. Batu Emas Group",
          division: "Departemen Maintenance & Workshop",
          contactPerson: "Ir. Hendra Gunawan",
          streetAddress: "Gedung Workshop Plant Banyuwangi",
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

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PURCHASING_MEMO: FileText,
  PRODUCTION_POLICY: ClipboardList,
  FINANCE_DISBURSEMENT: Banknote,
};

const TEMPLATE_ACCENTS: Record<string, { chip: string; hover: string }> = {
  PURCHASING_MEMO: { chip: "bg-stone-100 text-stone-800", hover: "hover:border-stone-400 hover:bg-stone-50/60" },
  PRODUCTION_POLICY: { chip: "bg-stone-100 text-stone-800", hover: "hover:border-stone-400 hover:bg-stone-50/60" },
  FINANCE_DISBURSEMENT: { chip: "bg-stone-100 text-stone-800", hover: "hover:border-stone-400 hover:bg-stone-50/60" },
};

const STATUS_META: Record<string, { labelId: string; cls: string }> = {
  DRAFT: { labelId: "Draft", cls: "bg-stone-100 text-stone-700 border-stone-200" },
  PENDING_APPROVAL: { labelId: "Menunggu Otorisasi", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  APPROVED: { labelId: "Disetujui", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  REVISION_REQUIRED: { labelId: "Perlu Revisi", cls: "bg-rose-50 text-rose-800 border-rose-200" },
};

function relativeTime(iso: string, isId: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return isId ? "baru saja" : "just now";
  if (mins < 60) return `${mins} ${isId ? "mnt lalu" : "m ago"}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${isId ? "jam lalu" : "h ago"}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${isId ? "hari lalu" : "d ago"}`;
  return new Date(iso).toLocaleDateString("id-ID");
}

export function DocumentWorkspace() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const isId = language === "id";

  const [docs, setDocs] = useState<WorkspaceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "ACTION_REQUIRED" | "MY_DOCS">("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "title">("newest");

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
  const [studioInitialStatus, setStudioInitialStatus] = useState<string>("DRAFT");
  const [isSaving, setIsSaving] = useState(false);

  // Preview & Authorization Action Modal States
  const [previewDoc, setPreviewDoc] = useState<WorkspaceDocument | null>(null);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [targetReviseDocId, setTargetReviseDocId] = useState<string | null>(null);
  const [revisionNoteInput, setRevisionNoteInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceDocument | null>(null);

  // Fetch Documents from Backend
  const fetchDocs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch("/api/workspace-documents", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        setDocs(res.data);
      } else if (!res.ok) {
        setLoadError(res.error || (isId ? "Gagal memuat dokumen" : "Failed to load documents"));
      }
    } catch (err: any) {
      console.error("Error fetching workspace docs:", err);
      setLoadError(err?.message || (isId ? "Gagal memuat dokumen workspace" : "Failed to load workspace documents"));
    } finally {
      setIsLoading(false);
    }
  }, [user?.username, isId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: docs.length,
      pending: docs.filter((d) => d.status === "PENDING_APPROVAL").length,
      draft: docs.filter((d) => d.status === "DRAFT").length,
      approved: docs.filter((d) => d.status === "APPROVED").length,
      revision: docs.filter((d) => d.status === "REVISION_REQUIRED").length,
    };
  }, [docs]);

  // Filtered + sorted documents list
  const filteredDocs = useMemo(() => {
    let list = docs;
    if (activeTab === "ACTION_REQUIRED") {
      list = list.filter((d) => d.status === "PENDING_APPROVAL");
      const userRoleNorm = normalizeDepartmentToRole(user?.role);
      if (userRoleNorm !== "FC") {
        list = list.filter(
          (d) =>
            canUserApproveDepartment(user?.role, d.authorization_department) ||
            canUserApproveDepartment(user?.role, d.authorization_role) ||
            canUserApproveDepartment(user?.role, d.department)
        );
      }
    } else if (activeTab === "MY_DOCS") {
      list = list.filter((d) => d.created_by_username === user?.username);
    }

    if (statusFilter !== "ALL") {
      list = list.filter((d) => d.status === statusFilter);
    }

    if (departmentFilter !== "ALL") {
      list = list.filter(
        (d) =>
          normalizeDepartmentToRole(d.authorization_department) === departmentFilter ||
          normalizeDepartmentToRole(d.authorization_role) === departmentFilter ||
          normalizeDepartmentToRole(d.department) === departmentFilter
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

    const sorted = [...list];
    if (sortMode === "newest") {
      sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    } else if (sortMode === "oldest") {
      sorted.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
    } else {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [docs, activeTab, statusFilter, departmentFilter, searchQuery, sortMode, user]);

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
    setStudioInitialStatus("DRAFT");
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
    setStudioInitialStatus(doc.status);
    setIsStudioOpen(true);
  };

  // Save Document handler invoked from Studio Editor
  const handleSaveFromStudio = async (
    docData: {
      title: string;
      document_type: string;
      department: string;
      content: DocBlock[];
      layout_preset: LayoutPreset;
      authorization_role: string;
      authorization_department: string;
      authorization_user_name: string;
      submitForApproval: boolean;
    },
    opts?: { closeAfter?: boolean }
  ) => {
    const closeAfter = opts?.closeAfter !== false;
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
      };

      let res;
      if (editingDocId) {
        if (docData.submitForApproval) {
          // P0-04 Atomic Submit Endpoint
          res = await apiFetch(`/api/workspace-documents/${editingDocId}/submit`, {
            method: "POST",
            body: JSON.stringify(payload),
          }, user?.username);
        } else {
          // Normal Draft Update
          res = await apiFetch(`/api/workspace-documents/${editingDocId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          }, user?.username);
        }
      } else {
        // Create New Document
        res = await apiFetch("/api/workspace-documents", {
          method: "POST",
          body: JSON.stringify(payload),
        }, user?.username);

        if (res.ok && res.data?.id && docData.submitForApproval) {
          // Atomically transition newly created document to PENDING_APPROVAL
          const submitRes = await apiFetch(`/api/workspace-documents/${res.data.id}/submit`, {
            method: "POST",
            body: JSON.stringify(payload),
          }, user?.username);

          if (!submitRes.ok) {
            showToast(
              submitRes.error || (isId ? "Dokumen tersimpan namun gagal diajukan untuk otorisasi." : "Document saved but submission failed."),
              "error"
            );
            fetchDocs();
            return;
          }
        }
      }

      if (res.ok) {
        showToast(
          docData.submitForApproval
            ? isId
              ? `Dokumen berhasil diajukan dan diteruskan ke ${docData.authorization_department} untuk otorisasi!`
              : `Document submitted to ${docData.authorization_department} department for authorization!`
            : isId
            ? "Dokumen berhasil disimpan sebagai draft."
            : "Document saved as draft.",
          "success"
        );
        if (closeAfter) setIsStudioOpen(false);
        fetchDocs();
      } else {
        showToast(res.error || "Gagal menyimpan dokumen", "error");
        throw new Error(res.error || "save_failed");
      }
    } catch (err: any) {
      if (err?.message !== "save_failed" && !String(err?.message).length) {
        showToast(err.message || "Terjadi kesalahan sistem", "error");
      }
      throw err;
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

  // Delete Document (drafts / own documents)
  const handleDeleteDocument = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch(`/api/workspace-documents/${deleteTarget.id}`, {
        method: "DELETE",
      }, user?.username);
      if (res.ok) {
        showToast(isId ? "Dokumen dihapus." : "Document deleted.", "success");
        setDeleteTarget(null);
        fetchDocs();
      } else {
        showToast(res.error || "Gagal menghapus dokumen", "error");
      }
    } catch (err) {
      showToast("Gagal menghapus dokumen", "error");
    }
  };

  // Clone Document (P0-07 Immutability workflow: clone approved doc to start a new revision draft)
  const handleCloneDocument = async (doc: WorkspaceDocument) => {
    try {
      const res = await apiFetch(`/api/workspace-documents/${doc.id}/clone`, {
        method: "POST",
      }, user?.username);

      if (res.ok && res.data?.id) {
        showToast(
          isId
            ? `Dokumen berhasil disalin sebagai draf baru (${res.data.document_code}).`
            : `Document cloned as new draft (${res.data.document_code}).`,
          "success"
        );
        fetchDocs();
        const fullDocRes = await apiFetch(`/api/workspace-documents/${res.data.id}`, {}, user?.username);
        if (fullDocRes.ok && fullDocRes.data) {
          handleEditExistingDoc(fullDocRes.data);
        }
      } else {
        showToast(res.error || "Gagal menduplikasi dokumen", "error");
      }
    } catch (err) {
      showToast("Gagal menduplikasi dokumen", "error");
    }
  };

  /* ============================ RENDER ============================ */

  const renderStatusBadge = (status: string) => {
    const meta = STATUS_META[status] || STATUS_META.DRAFT;
    return (
      <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border", meta.cls)}>
        {isId ? meta.labelId : status.replace(/_/g, " ")}
      </span>
    );
  };

  const renderDocActions = (doc: WorkspaceDocument, compact?: boolean) => {
    const isApproved = doc.status === "APPROVED";
    const canDelete =
      (doc.status === "DRAFT" || doc.status === "REVISION_REQUIRED") &&
      doc.created_by_username === user?.username;
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setPreviewDoc(doc);
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 cursor-pointer transition-colors"
          title={isId ? "Pratinjau & otorisasi" : "Preview & authorize"}
        >
          <Eye className="w-3.5 h-3.5 text-stone-500" />
          {!compact && <span>{isId ? "Pratinjau" : "Preview"}</span>}
        </button>

        {isApproved ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCloneDocument(doc);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold bg-stone-900 border border-stone-900 text-amber-400 hover:bg-black cursor-pointer transition-colors"
            title={isId ? "Klon & Buat Versi Revisi Baru" : "Clone & Create New Revision"}
          >
            <Copy className="w-3.5 h-3.5" />
            {!compact && <span>{isId ? "Klon Revisi" : "Clone Revision"}</span>}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditExistingDoc(doc);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold bg-stone-900 border border-stone-900 text-white hover:bg-stone-800 cursor-pointer transition-colors"
            title={isId ? "Buka di Studio Editor" : "Open in Studio Editor"}
          >
            <PenTool className="w-3.5 h-3.5 text-amber-300" />
            {!compact && <span>{isId ? "Edit" : "Edit"}</span>}
          </button>
        )}

        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(doc);
            }}
            className="inline-flex items-center p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
            title={isId ? "Hapus dokumen" : "Delete document"}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20 bg-stone-50 min-h-screen text-stone-900 p-6 rounded-3xl">
      {/* 1. Page Header */}
      <PageHeader
        title={isId ? "Studio Dokumen Workspace" : "Document Workspace Studio"}
        subtitle={
          isId
            ? "Editor visual dokumen resmi ERP."
            : "Official ERP document editor."
        }
        icon={<FileText className="w-5 h-5 text-amber-700" />}
        iconBgClassName="bg-amber-50 border border-amber-200/80 text-amber-700 shadow-2xs"
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleLaunchStudio()}
              variant="primary"
              className="bg-stone-900 hover:bg-black text-white rounded-xl font-bold text-xs px-3.5 py-2 shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isId ? "Dokumen Baru" : "New Document"}</span>
            </Button>
            <Button
              onClick={fetchDocs}
              variant="outline"
              className="text-xs font-bold rounded-xl border-stone-300 bg-white hover:bg-stone-100 text-stone-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-stone-500", isLoading && "animate-spin")} />
              <span>{isId ? "Segarkan" : "Refresh"}</span>
            </Button>
          </div>
        }
      />

      {/* 2. Quick Stats (clickable filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {[
          {
            key: "ALL",
            label: isId ? "Total Dokumen" : "Total Documents",
            value: stats.total,
            icon: FileText,
            chip: "bg-stone-100 text-stone-700",
          },
          {
            key: "PENDING_APPROVAL",
            label: isId ? "Menunggu Otorisasi" : "Pending Approval",
            value: stats.pending,
            icon: Clock,
            chip: "bg-amber-50 text-amber-800 border border-amber-200/60",
          },
          {
            key: "DRAFT",
            label: "Draft",
            value: stats.draft,
            icon: PenTool,
            chip: "bg-stone-100 text-stone-600",
          },
          {
            key: "REVISION_REQUIRED",
            label: isId ? "Perlu Revisi" : "Needs Revision",
            value: stats.revision,
            icon: AlertOctagon,
            chip: "bg-rose-50 text-rose-800 border border-rose-200/60",
          },
          {
            key: "APPROVED",
            label: isId ? "Disetujui" : "Approved",
            value: stats.approved,
            icon: CheckCircle2,
            chip: "bg-emerald-50 text-emerald-800 border border-emerald-200/60",
          },
        ].map((s) => {
          const SIcon = s.icon;
          const active = statusFilter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={cn(
                "p-3 rounded-2xl border bg-white text-left transition-all cursor-pointer flex items-center gap-3",
                active
                  ? "border-stone-900 ring-2 ring-stone-900/10 shadow-2xs"
                  : "border-stone-200 hover:border-stone-300 hover:shadow-2xs"
              )}
            >
              <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold", s.chip)}>
                <SIcon className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-black text-stone-900 leading-none">{s.value}</span>
                <span className="block text-[10px] font-bold text-stone-500 truncate mt-1">{s.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Template Gallery */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-stone-900">
              {isId ? "Mulai Cepat dari Template" : "Quick Start from Template"}
            </h3>
            <p className="text-[11px] text-stone-500 mt-0.5">
              {isId
                ? "Satu klik untuk membuka studio dengan struktur dokumen yang sudah siap pakai."
                : "One click opens the studio with a ready-made document structure."}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {/* Blank document */}
          <button
            onClick={() => handleLaunchStudio()}
            className="group text-left p-4 rounded-2xl border-2 border-dashed border-stone-300 hover:border-stone-900 hover:bg-stone-50/60 transition-all cursor-pointer flex flex-col gap-2"
          >
            <span className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 group-hover:bg-stone-900 group-hover:text-white flex items-center justify-center transition-colors">
              <FilePlus2 className="w-4.5 h-4.5" />
            </span>
            <span className="text-xs font-black text-stone-900">
              {isId ? "Dokumen Kosong" : "Blank Document"}
            </span>
            <span className="text-[10.5px] text-stone-500 leading-snug">
              {isId
                ? "Mulai dari kanvas bersih dengan Kop Resmi & TTD Purchasing."
                : "Start from a clean canvas with Official Letterhead & Purchasing sign-off."}
            </span>
            <span className="mt-auto pt-1 text-[10px] font-bold text-stone-800 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isId ? "Buka Studio" : "Open Studio"} <ChevronRight className="w-3 h-3" />
            </span>
          </button>

          {TEMPLATE_PRESETS.map((tpl) => {
            const TIcon = TEMPLATE_ICONS[tpl.id] || FileText;
            const accent = TEMPLATE_ACCENTS[tpl.id] || TEMPLATE_ACCENTS.PURCHASING_MEMO;
            return (
              <button
                key={tpl.id}
                onClick={() => handleLaunchStudio(tpl.id)}
                className={cn(
                  "group text-left p-4 rounded-2xl border border-stone-200 bg-white transition-all cursor-pointer flex flex-col gap-2 shadow-2xs",
                  accent.hover
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center font-bold", accent.chip)}>
                    <TIcon className="w-4.5 h-4.5" />
                  </span>
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200/80">
                    {tpl.targetDept}
                  </span>
                </div>
                <span className="text-xs font-black text-stone-900 leading-snug">
                  {isId ? tpl.titleId : tpl.titleEn}
                </span>
                <span className="text-[10.5px] text-stone-500 leading-snug line-clamp-2">
                  {isId ? tpl.descriptionId : tpl.descriptionEn}
                </span>
                <span className="mt-auto pt-1 text-[10px] font-bold text-stone-800 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isId ? "Gunakan Template" : "Use Template"} <ChevronRight className="w-3 h-3" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Document Library */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-stone-100 pb-4">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTab("ALL")}
              className={cn(
                "py-1.5 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                activeTab === "ALL"
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "bg-stone-100 text-stone-600 hover:text-stone-900"
              )}
            >
              {isId ? "Semua Dokumen" : "All Documents"} ({docs.length})
            </button>
            <button
              onClick={() => setActiveTab("ACTION_REQUIRED")}
              className={cn(
                "py-1.5 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                activeTab === "ACTION_REQUIRED"
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "bg-stone-100 text-stone-600 hover:text-stone-900"
              )}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>{isId ? "Perlu Otorisasi" : "Action Required"}</span>
              {stats.pending > 0 && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black",
                    activeTab === "ACTION_REQUIRED" ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-800"
                  )}
                >
                  {stats.pending}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("MY_DOCS")}
              className={cn(
                "py-1.5 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                activeTab === "MY_DOCS"
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "bg-stone-100 text-stone-600 hover:text-stone-900"
              )}
            >
              {isId ? "Dokumen Saya" : "My Documents"}
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="text-xs pl-7 pr-6 py-2 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 outline-none focus:border-stone-900 cursor-pointer appearance-none"
              >
                <option value="ALL">{isId ? "Semua Role RBAC ERP" : "All ERP RBAC Roles"}</option>
                {ERP_DEPARTMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Filter className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
                className="text-xs pl-7 pr-6 py-2 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 outline-none focus:border-stone-900 cursor-pointer appearance-none"
              >
                <option value="newest">{isId ? "Terbaru" : "Newest"}</option>
                <option value="oldest">{isId ? "Terlama" : "Oldest"}</option>
                <option value="title">{isId ? "Judul A-Z" : "Title A-Z"}</option>
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder={isId ? "Cari judul / kode…" : "Search title / code…"}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 sm:w-60 pl-8 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-stone-900 font-medium"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200/80">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-lg cursor-pointer transition-colors",
                  viewMode === "grid" ? "bg-white shadow-2xs text-stone-900" : "text-stone-400 hover:text-stone-700"
                )}
                title={isId ? "Tampilan kartu" : "Grid view"}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1.5 rounded-lg cursor-pointer transition-colors",
                  viewMode === "list" ? "bg-white shadow-2xs text-stone-900" : "text-stone-400 hover:text-stone-700"
                )}
                title={isId ? "Tampilan tabel" : "List view"}
              >
                <ListIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          /* Skeleton */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 rounded-2xl border border-stone-200 space-y-3 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-24 bg-stone-200 rounded" />
                  <div className="h-5 w-16 bg-stone-200 rounded-full" />
                </div>
                <div className="h-4 w-3/4 bg-stone-200 rounded" />
                <div className="h-3 w-1/2 bg-stone-100 rounded" />
                <div className="h-8 w-full bg-stone-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          /* Error state with retry */
          <div className="py-14 text-center space-y-3">
            <AlertOctagon className="w-10 h-10 text-rose-400 mx-auto" />
            <p className="text-sm font-bold text-stone-700">
              {isId ? "Gagal memuat dokumen workspace" : "Failed to load workspace documents"}
            </p>
            <p className="text-xs text-stone-500 max-w-md mx-auto">{loadError}</p>
            <Button
              onClick={fetchDocs}
              variant="outline"
              className="rounded-xl text-xs font-bold border-stone-300 mx-auto cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isId ? "Coba Lagi" : "Retry"}</span>
            </Button>
          </div>
        ) : filteredDocs.length === 0 ? (
          /* Empty state */
          <div className="py-14 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
              <FileText className="w-7 h-7" />
            </div>
            <p className="text-sm font-bold text-stone-700">
              {isId ? "Belum ada dokumen yang cocok" : "No matching documents"}
            </p>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              {isId
                ? "Ubah filter atau buat dokumen baru menggunakan template di atas."
                : "Adjust filters or create a new document using the templates above."}
            </p>
            <Button
              onClick={() => handleLaunchStudio()}
              variant="primary"
              className="bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-bold mx-auto cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isId ? "Buat Dokumen" : "Create Document"}</span>
            </Button>
          </div>
        ) : viewMode === "grid" ? (
          /* ---- GRID (card) VIEW ---- */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredDocs.map((doc) => {
              const targetDept = normalizeDepartmentToRole(doc.authorization_department) as TargetDepartment;
              const deptConfig = DEPARTMENT_ROUTING_CONFIG[targetDept] || DEPARTMENT_ROUTING_CONFIG.FC;
              return (
                <div
                  key={doc.id}
                  onClick={() => setPreviewDoc(doc)}
                  className="group p-4 rounded-2xl border border-stone-200 bg-white hover:border-stone-400 hover:shadow-md transition-all cursor-pointer flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold text-stone-400 truncate">
                      {doc.document_code}
                    </span>
                    {renderStatusBadge(doc.status)}
                  </div>
                  <div>
                    <div className="text-sm font-black text-stone-900 leading-snug line-clamp-2">
                      {doc.title}
                    </div>
                    <div className="text-[10px] text-stone-400 mt-1">
                      {doc.document_type} · {doc.layout_preset}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9.5px] font-bold border", deptConfig.badgeColor)}>
                      <ShieldCheck className="w-3 h-3" />
                      <span className="truncate max-w-36">{deptConfig.deptNameId}</span>
                    </span>
                  </div>
                  <div className="mt-auto pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-stone-700 truncate">{doc.created_by_name}</div>
                      <div className="text-[9.5px] text-stone-400">
                        {isId ? "diubah" : "updated"} {relativeTime(doc.updated_at, isId)}
                      </div>
                    </div>
                    {renderDocActions(doc, true)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ---- LIST (table) VIEW ---- */
          <div className="overflow-x-auto border border-stone-200 rounded-2xl shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3 pl-4">{isId ? "Kode & Judul Dokumen" : "Code & Title"}</th>
                  <th className="p-3">{isId ? "Target Otorisasi" : "Routing Target"}</th>
                  <th className="p-3">{isId ? "Pembuat" : "Author"}</th>
                  <th className="p-3 text-center">{isId ? "Status" : "Status"}</th>
                  <th className="p-3 pr-4 text-center">{isId ? "Aksi" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredDocs.map((doc) => {
                  const targetDept = normalizeDepartmentToRole(doc.authorization_department) as TargetDepartment;
                  const deptConfig = DEPARTMENT_ROUTING_CONFIG[targetDept] || DEPARTMENT_ROUTING_CONFIG.FC;
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => setPreviewDoc(doc)}
                      className="hover:bg-stone-50/60 transition-colors cursor-pointer"
                    >
                      <td className="p-3 pl-4">
                        <div className="font-mono font-bold text-stone-900 text-xs">{doc.document_code}</div>
                        <div className="font-black text-stone-800 text-xs mt-0.5 line-clamp-1">{doc.title}</div>
                        <div className="text-[10px] text-stone-400 mt-0.5">
                          {doc.document_type} · {doc.layout_preset}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border", deptConfig.badgeColor)}>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{deptConfig.deptNameId}</span>
                        </div>
                        <div className="text-[10px] text-stone-400 mt-1 font-mono">{doc.authorization_role}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-stone-800">{doc.created_by_name}</div>
                        <div className="text-[10px] text-stone-400">
                          {relativeTime(doc.updated_at, isId)} · {doc.department}
                        </div>
                      </td>
                      <td className="p-3 text-center">{renderStatusBadge(doc.status)}</td>
                      <td className="p-3 pr-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {renderDocActions(doc)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 5. CANVA STUDIO FULLSCREEN WORKSPACE EDITOR              */}
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
          initialStatus={studioInitialStatus}
          onClone={() => {
            const currentDoc = docs.find((d) => d.id === editingDocId);
            if (currentDoc) {
              setIsStudioOpen(false);
              handleCloneDocument(currentDoc);
            }
          }}
          onSave={handleSaveFromStudio}
          onClose={() => setIsStudioOpen(false)}
          isSaving={isSaving}
          isId={isId}
        />
      )}

      {/* ======================================================== */}
      {/* 6. HIGH-FIDELITY DOCUMENT PREVIEW & APPROVAL MODAL       */}
      {/* ======================================================== */}
      <Modal
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        maxWidth="4xl"
        title={
          previewDoc && (
            <div className="flex items-center justify-between w-full pr-8">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs font-black bg-stone-100 text-stone-800 px-2.5 py-0.5 rounded-lg border shrink-0">
                  {previewDoc.document_code}
                </span>
                <span className="font-bold text-stone-900 text-sm truncate max-w-md">{previewDoc.title}</span>
              </div>
              {renderStatusBadge(previewDoc.status)}
            </div>
          )
        }
      >
        {previewDoc && (
          <div className="space-y-6">
            {/* Metadata Bar */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs">
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">
                  {isId ? "Pembuat Dokumen" : "Author"}
                </span>
                <span className="font-bold text-stone-800">
                  {previewDoc.created_by_name} ({previewDoc.department})
                </span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">
                  {isId ? "Target Departemen Otorisasi" : "Target Authorization Dept"}
                </span>
                <span className="font-bold text-blue-800">{previewDoc.authorization_department || "PURCHASING"}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">
                  {isId ? "Tanggal Terbit" : "Issued Date"}
                </span>
                <span className="font-bold text-stone-800">
                  {new Date(previewDoc.created_at).toLocaleDateString("id-ID")}
                </span>
              </div>
            </div>

            {/* Revision Note Alert */}
            {previewDoc.revision_note && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-rose-900 flex items-center gap-1.5">
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                  <span>{isId ? "Catatan Revisi Otorisasi:" : "Authorization Revision Note:"}</span>
                </div>
                <div className="text-rose-800 italic">{previewDoc.revision_note}</div>
              </div>
            )}

            {/* Document Sheet Render */}
            <div className="bg-white border border-stone-300 rounded-2xl p-10 space-y-6 shadow-sm font-sans max-h-[550px] overflow-y-auto custom-scrollbar">
              {previewDoc.content?.map((b, bIdx) => (
                <div key={bIdx} className="space-y-2">
                  {b.type === "OFFICIAL_LETTERHEAD" && (
                    <div className="text-center space-y-1.5 pb-4 border-b-2 border-stone-900 relative">
                      <div className="flex items-center justify-between pb-1">
                        <div className="w-12 h-12 shrink-0 flex items-center justify-center">
                          <img
                            src="/logo.png"
                            alt="Logo"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        </div>
                        <div className="text-center flex-1 px-4">
                          <h2 className="text-base font-black tracking-tight text-stone-950 uppercase font-sans">
                            {b.title || "CV. BATU EMAS GROUP"}
                          </h2>
                          <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">
                            {b.subtitle || "PRODUSEN & SUPPLIER UTAMA PAVING BLOCK, BATAKO & BETON PRACETAK"}
                          </p>
                          <p className="text-[9px] text-stone-600 mt-0.5 font-medium">
                            {b.addressData?.streetAddress} · {b.addressData?.cityStateZip || "Banyuwangi 68486, Indonesia"}
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

                  {b.type === "HEADER" && (
                    <div className="text-center space-y-1 border-b border-stone-100 pb-3">
                      <h3 className="text-base font-black tracking-tight text-stone-900 uppercase">{b.title}</h3>
                      <div className="text-xs font-bold text-stone-500 font-mono">{b.content}</div>
                    </div>
                  )}

                  {(b.type === "SENDER_ADDRESS" ||
                    b.type === "RECIPIENT_ADDRESS" ||
                    b.type === "PROJECT_SITE_ADDRESS") && (
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

                  {b.type === "TEXT" && (
                    <p className="text-xs text-stone-800 leading-relaxed font-normal whitespace-pre-line">{b.content}</p>
                  )}

                  {b.type === "CALLOUT" && (
                    <div
                      className={cn(
                        "p-3.5 rounded-xl border text-xs space-y-1",
                        b.style === "WARNING"
                          ? "bg-amber-50 border-amber-300 text-amber-950"
                          : b.style === "SUCCESS"
                          ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                          : "bg-blue-50 border-blue-300 text-blue-950"
                      )}
                    >
                      <div className="font-bold uppercase text-[10px] tracking-wide">{b.title}</div>
                      <div className="text-stone-800 leading-relaxed">{b.content}</div>
                    </div>
                  )}

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

                  {b.type === "TABLE" && (
                    <div className="space-y-1.5">
                      {b.title && <div className="font-bold text-stone-900 text-xs">{b.title}</div>}
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
                    </div>
                  )}

                  {b.type === "METADATA_GRID" && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {b.metaData?.map((m, mIdx) => (
                        <div
                          key={mIdx}
                          className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between"
                        >
                          <span className="font-bold text-stone-600">{m.key}:</span>
                          <span className="font-mono font-bold text-stone-900">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(b.type === "SIGNATURE_COLUMN" ||
                    b.type === "SIGNATURE_STAMP" ||
                    b.type === "DUAL_SIGNATURE") && (
                    <div className="pt-6 mt-6 border-t border-stone-200 flex items-center justify-between text-center text-xs">
                      <div className="w-48 text-center space-y-1">
                        <div className="text-[10px] text-stone-400 font-bold uppercase">
                          {isId ? "Dibuat Oleh" : "Created By"}
                        </div>
                        <div className="h-14 flex items-center justify-center text-stone-400 italic text-[11px]">
                          [ Signed ]
                        </div>
                        <div className="font-bold text-stone-900">{previewDoc.created_by_name}</div>
                        <div className="text-[10px] text-stone-500">{previewDoc.department}</div>
                      </div>

                      <div className="w-56 text-center space-y-1 border border-stone-200 rounded-2xl p-3 bg-stone-50/70">
                        <div className="text-[10px] text-blue-800 font-bold uppercase">
                          {isId ? "Otorisasi" : "Authorization"}{" "}
                          {b.targetDepartment || previewDoc.authorization_department}
                        </div>
                        <div className="h-12 flex items-center justify-center">
                          {previewDoc.status === "APPROVED" ? (
                            <span className="px-3 py-1 bg-emerald-600 text-white rounded-md text-[10px] font-black uppercase tracking-widest shadow-2xs">
                              ✓ APPROVED
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold">
                              {isId ? "MENUNGGU OTORISASI" : "AWAITING AUTHORIZATION"}
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-stone-900">{b.signatoryTitle}</div>
                        <div className="text-[9px] text-stone-400 font-mono">
                          {previewDoc.approved_at
                            ? `${isId ? "Disetujui" : "Approved"}: ${new Date(previewDoc.approved_at).toLocaleDateString("id-ID")}`
                            : isId
                            ? "Menunggu Tindakan Otorisator"
                            : "Awaiting Authorizer Action"}
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
                    <span>
                      {isId ? "Otorisasi Diperlukan:" : "Authorization Required:"}{" "}
                      {previewDoc.authorization_department} ({previewDoc.authorization_role})
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-800 mt-0.5">
                    {isId
                      ? "Dokumen ini telah diarahkan ke antrean otorisasi Anda untuk dibaca dan disetujui."
                      : "This document was routed to your authorization queue for review."}
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
                    {isId ? "Minta Revisi" : "Request Revision"}
                  </Button>

                  <Button
                    onClick={() => handleApproveDocument(previewDoc.id)}
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl px-5 py-2 shadow-2xs"
                  >
                    {isId ? "Setujui & Otorisasi Dokumen" : "Approve & Authorize"}
                  </Button>
                </div>
              </div>
            )}

            {/* Approved Document Immutability Banner & Clone Action (P0-07) */}
            {previewDoc.status === "APPROVED" && (
              <div className="p-4 bg-stone-900 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                    <Lock className="w-4 h-4" />
                    <span>
                      {isId
                        ? "Dokumen Resmi Telah Diotorisasi (Terkunci Permanen)"
                        : "Official Document Approved (Permanently Locked)"}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-300">
                    {isId
                      ? "Dokumen ini sah dan immutable. Untuk melakukan perubahan, salin menjadi draf revisi baru."
                      : "This document is legally binding and immutable. To make changes, clone into a new revision draft."}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={() => {
                      const docToClone = previewDoc;
                      setPreviewDoc(null);
                      handleCloneDocument(docToClone);
                    }}
                    variant="primary"
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl px-4 py-2 shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{isId ? "Klon & Buat Versi Revisi Baru" : "Clone for New Revision"}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ======================================================== */}
      {/* 7. REVISION NOTE MODAL                                   */}
      {/* ======================================================== */}
      <Modal
        isOpen={showRevisionModal}
        onClose={() => setShowRevisionModal(false)}
        maxWidth="md"
        title={
          <span className="font-bold text-stone-900 text-sm">
            {isId ? "Buat Catatan Revisi Dokumen" : "Create Document Revision Note"}
          </span>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-600">
            {isId
              ? "Masukkan poin koreksi atau instruksi revisi yang wajib diperbaiki oleh pembuat dokumen sebelum dapat diotorisasi."
              : "Enter correction points the author must fix before this document can be authorized."}
          </p>

          <textarea
            rows={4}
            value={revisionNoteInput}
            onChange={(e) => setRevisionNoteInput(e.target.value)}
            placeholder={isId ? "Tuliskan catatan revisi di sini…" : "Write revision notes here…"}
            className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl font-medium outline-none focus:border-amber-500"
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <Button
              onClick={() => setShowRevisionModal(false)}
              variant="outline"
              className="rounded-xl text-xs font-bold border-stone-200"
            >
              {isId ? "Batal" : "Cancel"}
            </Button>
            <Button
              onClick={handleSubmitRevisionNote}
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold px-4 py-2"
            >
              {isId ? "Kirim Catatan Revisi" : "Send Revision Note"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* 8. DELETE CONFIRMATION                                   */}
      {/* ======================================================== */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={isId ? "Hapus Dokumen Workspace" : "Delete Workspace Document"}
        message={
          isId
            ? `Dokumen "${deleteTarget?.title}" (${deleteTarget?.document_code}) akan dihapus permanen dan tidak dapat dikembalikan. Lanjutkan?`
            : `Document "${deleteTarget?.title}" (${deleteTarget?.document_code}) will be permanently deleted. Continue?`
        }
        confirmText={isId ? "Ya, Hapus" : "Yes, Delete"}
        cancelText={isId ? "Batal" : "Cancel"}
        isDestructive
        onConfirm={handleDeleteDocument}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
