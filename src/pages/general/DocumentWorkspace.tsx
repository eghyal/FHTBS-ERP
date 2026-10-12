import React, { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { FileText, Plus, RefreshCw } from "lucide-react";

interface DocBlock {
  id: string;
  type: "HEADER" | "TEXT" | "CALLOUT" | "TABLE" | "METADATA_GRID" | "SIGNATURE_STAMP";
  title?: string;
  content?: string;
  style?: "NORMAL" | "WARNING" | "SUCCESS" | "INFO";
  tableData?: { headers: string[]; rows: string[][] };
  metaData?: { key: string; value: string }[];
}

interface WorkspaceDoc {
  id: string;
  document_code: string;
  title: string;
  document_type: string;
  created_by_username: string;
  created_by_name: string;
  department: string;
  content: DocBlock[];
  layout_preset: "A4_PORTRAIT" | "A4_LANDSCAPE" | "EXECUTIVE_MEMO";
  authorization_role: string;
  authorization_user_name?: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REVISION_REQUIRED";
  revision_note?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_PRESETS = [
  {
    id: "MEMO",
    titleId: "Memorandum Internal",
    titleEn: "Internal Memorandum",
    type: "MEMORANDUM",
    defaultBlocks: [
      {
        id: "b1",
        type: "HEADER" as const,
        title: "MEMORANDUM INTERNAL",
        content: "PT FATHIN BUMI PRATAMA - PAVING JOSS ERP",
      },
      {
        id: "b2",
        type: "METADATA_GRID" as const,
        metaData: [
          { key: "Kepada (To)", value: "Tim Purchasing & Procurement" },
          { key: "Dari (From)", value: "Plant Management" },
          { key: "Tanggal (Date)", value: new Date().toLocaleDateString("id-ID") },
          { key: "Sifat", value: "Penting / Segera" },
        ],
      },
      {
        id: "b3",
        type: "TEXT" as const,
        content:
          "Sehubungan dengan efisiensi alur kerja pengadaan luar proyek, dokumen ini diterbitkan sebagai panduan resmi pelaksanaan instruksi kerja.",
      },
      {
        id: "b4",
        type: "CALLOUT" as const,
        style: "INFO" as const,
        title: "Instruksi Khusus Pengadaan",
        content:
          "Seluruh pengadaan barang konsumabel dan sparepart non-SPK wajib melewati verifikasi penanggung jawab yang ditunjuk.",
      },
      {
        id: "b5",
        type: "SIGNATURE_STAMP" as const,
        title: "Kolom Otorisasi & Pengesahan",
      },
    ],
  },
  {
    id: "POLICY",
    titleId: "Kebijakan & Prosedur Pabrik",
    titleEn: "Internal Plant Policy",
    type: "INTERNAL_POLICY",
    defaultBlocks: [
      {
        id: "b1",
        type: "HEADER" as const,
        title: "STANDARD OPERATING POLICY & PROCEDURE",
        content: "DIVISI WORKSHOP & GENERAL AFFAIRS",
      },
      {
        id: "b2",
        type: "TEXT" as const,
        content:
          "Prosedur kerja standar ini berlaku untuk seluruh personel pabrik guna menjaga standar kualitas keselamatan dan efisiensi material.",
      },
      {
        id: "b3",
        type: "TABLE" as const,
        title: "Matriks Komponen Kebutuhan",
        tableData: {
          headers: ["No", "Kategori Barang", "Standar Pemakaian", "Keterangan"],
          rows: [
            ["1", "Pelumas & Oli Mesin", "20 Literc / Bulan", "Rutin Maintenance"],
            ["2", "APD & Sarung Tangan", "1 Pasang / Minggu / Operator", "Safety Mandatory"],
          ],
        },
      },
      {
        id: "b4",
        type: "SIGNATURE_STAMP" as const,
        title: "Persetujuan Kebijakan",
      },
    ],
  },
  {
    id: "TECH_SPEC",
    titleId: "Spesifikasi Teknis Peralatan",
    titleEn: "Technical Equipment Specification",
    type: "TECHNICAL_SPEC",
    defaultBlocks: [
      {
        id: "b1",
        type: "HEADER" as const,
        title: "SPESIFIKASI TEKNIS & KEBUTUHAN PERALATAN",
        content: "ENGINEERING & MAINTENANCE WORKSHOP",
      },
      {
        id: "b2",
        type: "METADATA_GRID" as const,
        metaData: [
          { key: "Nama Alat / Part", value: "Hydraulic Power Pack Unit" },
          { key: "Lokasi Mesin", value: "Line Paving Block Press #2" },
          { key: "Target Pemasangan", value: "3 Hari Kerja" },
        ],
      },
      {
        id: "b3",
        type: "CALLOUT" as const,
        style: "WARNING" as const,
        title: "Catatan Kritis Toleransi Teknis",
        content: "Tekanan kerja maksimum 250 Bar dengan standar fluida ISO VG 68.",
      },
      {
        id: "b4",
        type: "SIGNATURE_STAMP" as const,
        title: "Otorisasi Rekayasa Teknis",
      },
    ],
  },
];

const AUTH_ROLES = [
  { value: "PURCHASING_MANAGER", label: "Purchasing Manager (Manager Pengadaan)" },
  { value: "FACTORY_CONTROLLER", label: "Factory Controller (FC)" },
  { value: "PRODUCTION_MANAGER", label: "Production Manager (Manager Produksi)" },
  { value: "PLANT_HEAD", label: "Plant Head / General Manager" },
  { value: "FINANCE_HEAD", label: "Head of Finance" },
];

export function DocumentWorkspace() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();
  const isId = language === "id";

  const [docs, setDocs] = useState<WorkspaceDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"ALL" | "ACTION_REQUIRED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Editor Modal States
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState("MEMORANDUM");
  const [docDepartment, setDocDepartment] = useState("General");
  const [docAuthRole, setDocAuthRole] = useState("PURCHASING_MANAGER");
  const [docAuthName, setDocAuthName] = useState("");
  const [docBlocks, setDocBlocks] = useState<DocBlock[]>([]);
  const [layoutPreset, setLayoutPreset] = useState<"A4_PORTRAIT" | "A4_LANDSCAPE" | "EXECUTIVE_MEMO">("A4_PORTRAIT");
  const [isSaving, setIsSaving] = useState(false);

  // Revision Modal State
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [targetReviseDocId, setTargetReviseDocId] = useState<string | null>(null);
  const [revisionNoteInput, setRevisionNoteInput] = useState("");

  // Preview Modal
  const [previewDoc, setPreviewDoc] = useState<WorkspaceDoc | null>(null);

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

  // Filter Action Required for current user's role
  const pendingActionDocs = useMemo(() => {
    return docs.filter((d) => d.status === "PENDING_APPROVAL");
  }, [docs]);

  const filteredDocs = useMemo(() => {
    let list = activeTab === "ACTION_REQUIRED" ? pendingActionDocs : docs;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.document_code.toLowerCase().includes(q) ||
          d.created_by_name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [docs, activeTab, pendingActionDocs, searchQuery]);

  // Handle New Document Template Selection
  const handleOpenNewDocModal = (presetId?: string) => {
    setEditingDocId(null);
    const selectedTemplate = TEMPLATE_PRESETS.find((p) => p.id === presetId) || TEMPLATE_PRESETS[0];

    setDocTitle(isId ? selectedTemplate.titleId : selectedTemplate.titleEn);
    setDocType(selectedTemplate.type);
    setDocDepartment((user as any)?.department || "General");
    setDocAuthRole("PURCHASING_MANAGER");
    setDocAuthName("");
    setDocBlocks(JSON.parse(JSON.stringify(selectedTemplate.defaultBlocks)));
    setLayoutPreset("A4_PORTRAIT");
    setShowEditorModal(true);
  };

  // Open Edit Existing Doc
  const handleOpenEditDoc = (doc: WorkspaceDoc) => {
    setEditingDocId(doc.id);
    setDocTitle(doc.title);
    setDocType(doc.document_type);
    setDocDepartment(doc.department || "General");
    setDocAuthRole(doc.authorization_role || "PURCHASING_MANAGER");
    setDocAuthName(doc.authorization_user_name || "");
    setDocBlocks(doc.content || []);
    setLayoutPreset(doc.layout_preset || "A4_PORTRAIT");
    setShowEditorModal(true);
  };

  // Block Manipulation (Canva-like workspace builder)
  const handleAddBlock = (type: DocBlock["type"]) => {
    const newBlock: DocBlock = {
      id: "b-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      type,
      title: type === "CALLOUT" ? "Catatan Penting" : type === "HEADER" ? "JUDUL DOKUMEN" : undefined,
      content:
        type === "TEXT"
          ? "Ketikkan uraian teks atau instruksi kerja di sini..."
          : type === "CALLOUT"
          ? "Isi catatan atau regulasi khusus..."
          : undefined,
      style: "NORMAL",
      metaData:
        type === "METADATA_GRID"
          ? [
              { key: "Parameter 1", value: "Nilai Parameter" },
              { key: "Parameter 2", value: "Keterangan Tambahan" },
            ]
          : undefined,
      tableData:
        type === "TABLE"
          ? {
              headers: ["Kolom 1", "Kolom 2", "Kolom 3"],
              rows: [["Data 1", "Data 2", "Data 3"]],
            }
          : undefined,
    };
    setDocBlocks((prev) => [...prev, newBlock]);
  };

  const handleUpdateBlockContent = (id: string, field: keyof DocBlock, value: any) => {
    setDocBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b))
    );
  };

  const handleRemoveBlock = (id: string) => {
    setDocBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  // Save Document
  const handleSaveDocument = async (submitForApproval = false) => {
    if (!docTitle.trim()) {
      showToast(isId ? "Judul dokumen wajib diisi." : "Document title is required.", "info");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: docTitle.trim(),
        document_type: docType,
        department: docDepartment,
        content: docBlocks,
        layout_preset: layoutPreset,
        authorization_role: docAuthRole,
        authorization_user_name: docAuthName.trim(),
        status: submitForApproval ? "PENDING_APPROVAL" : editingDocId ? undefined : "DRAFT",
      };

      let res;
      if (editingDocId) {
        res = await apiFetch(`/api/workspace-documents/${editingDocId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        }, user?.username);

        if (res.ok && submitForApproval) {
          await apiFetch(`/api/workspace-documents/${editingDocId}/submit-approval`, {
            method: "POST",
          }, user?.username);
        }
      } else {
        res = await apiFetch("/api/workspace-documents", {
          method: "POST",
          body: JSON.stringify(payload),
        }, user?.username);

        if (res.ok && res.data?.id && submitForApproval) {
          await apiFetch(`/api/workspace-documents/${res.data.id}/submit-approval`, {
            method: "POST",
          }, user?.username);
        }
      }

      if (res.ok) {
        showToast(
          submitForApproval
            ? isId
              ? "Dokumen berhasil diajukan untuk otorisasi manajer."
              : "Document submitted for manager approval."
            : isId
            ? "Dokumen berhasil disimpan ke workspace."
            : "Document saved to workspace.",
          "success"
        );
        setShowEditorModal(false);
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

  // Approve Document Action
  const handleApproveDocument = async (docId: string) => {
    try {
      const res = await apiFetch(`/api/workspace-documents/${docId}/approve`, {
        method: "POST",
      }, user?.username);

      if (res.ok) {
        showToast(isId ? "Dokumen berhasil disetujui (Approved)." : "Document approved.", "success");
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
        title="Document Workspace"
        subtitle={
          isId
            ? "Pusat pembuatan memorandum internal, kebijakan operasional & dokumen tata kelola"
            : "Internal Memorandums, Factory Operating Policies & Corporate Governance"
        }
        icon={<FileText className="w-5 h-5 text-amber-700" />}
        iconBgClassName="bg-amber-50 border border-amber-200/80 text-amber-700"
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleOpenNewDocModal()}
              className="bg-stone-900 hover:bg-black text-white rounded-xl font-bold text-xs px-3.5 py-2 shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isId ? "Buat Dokumen Kosong" : "Create Blank Document"}</span>
            </Button>
            <Button
              onClick={fetchDocs}
              variant="outline"
              className="text-xs font-bold rounded-xl border-stone-300 bg-white hover:bg-stone-100 text-stone-800 flex items-center gap-1.5"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-stone-500", isLoading && "animate-spin")} />
              <span>{isId ? "Segarkan" : "Refresh"}</span>
            </Button>
          </div>
        }
      />

      {/* 2. Top Banner & Template Quick Launchers */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-sm font-black text-stone-900 tracking-tight uppercase">
              {isId ? "Pilih Template Dokumen Resmi" : "Select Official Document Template"}
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {isId
                ? "Gunakan layout siap pakai atau buat desain kanvas kosong sesuai kebutuhan."
                : "Use ready-made layout templates or build a custom blank canvas document."}
            </p>
          </div>

          <Button
            onClick={() => handleOpenNewDocModal()}
            className="bg-stone-900 hover:bg-black text-white rounded-xl font-bold text-xs px-4 py-2.5 shadow-xs"
          >
            {isId ? "+ Buat Dokumen Kosong" : "+ Create Blank Document"}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TEMPLATE_PRESETS.map((tmpl) => (
            <div
              key={tmpl.id}
              onClick={() => handleOpenNewDocModal(tmpl.id)}
              className="p-4 bg-stone-50 hover:bg-stone-100/80 border border-stone-200 rounded-xl cursor-pointer transition-all space-y-2 group"
            >
              <div className="text-xs font-black text-stone-900 group-hover:text-black">
                {isId ? tmpl.titleId : tmpl.titleEn}
              </div>
              <div className="text-[10px] text-stone-500 font-medium">
                {tmpl.defaultBlocks.length} Visual Blocks • Preset {tmpl.type}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Action Required & Document History List Tabs */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("ALL")}
              className={cn(
                "py-2 px-4 rounded-xl text-xs font-bold transition-all",
                activeTab === "ALL"
                  ? "bg-stone-900 text-white shadow-xs"
                  : "bg-stone-100 text-stone-600 hover:text-stone-900"
              )}
            >
              {isId ? "Semua Dokumen Workspace" : "All Workspace Documents"} ({docs.length})
            </button>

            <button
              onClick={() => setActiveTab("ACTION_REQUIRED")}
              className={cn(
                "py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                activeTab === "ACTION_REQUIRED"
                  ? "bg-stone-900 text-white shadow-xs"
                  : "bg-stone-100 text-stone-600 hover:text-stone-900"
              )}
            >
              <span>{isId ? "Perlu Otorisasi (Action Required)" : "Pending Approvals"}</span>
              <span className="bg-stone-200 text-stone-900 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                {pendingActionDocs.length}
              </span>
            </button>
          </div>

          <input
            type="text"
            placeholder={isId ? "Cari judul / kode..." : "Search title / code..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none"
          />
        </div>

        {/* Document Table */}
        <div className="overflow-x-auto border border-stone-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-3 pl-4">{isId ? "Kode & Judul Dokumen" : "Code & Title"}</th>
                <th className="p-3">{isId ? "Tipe & Dept" : "Type & Dept"}</th>
                <th className="p-3">{isId ? "Pembuat" : "Author"}</th>
                <th className="p-3">{isId ? "Role Otorisasi" : "Authorization Role"}</th>
                <th className="p-3 text-center">{isId ? "Status" : "Status"}</th>
                <th className="p-3 pr-4 text-center">{isId ? "Aksi" : "Action"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-stone-400 text-xs italic">
                    {isId ? "Belum ada dokumen dalam workspace." : "No documents found in workspace."}
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-stone-50/50">
                    <td className="p-3 pl-4">
                      <div className="font-mono font-bold text-stone-900 text-xs">{doc.document_code}</div>
                      <div className="font-bold text-stone-800 text-xs mt-0.5 line-clamp-1">{doc.title}</div>
                    </td>

                    <td className="p-3">
                      <span className="font-bold text-stone-800">{doc.document_type}</span>
                      <span className="block text-[10px] text-stone-400">{doc.department}</span>
                    </td>

                    <td className="p-3">
                      <div className="font-bold text-stone-800">{doc.created_by_name}</div>
                      <div className="text-[10px] text-stone-400">
                        {new Date(doc.created_at).toLocaleDateString("id-ID")}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="font-bold text-stone-800">{doc.authorization_role}</div>
                      <div className="text-[10px] text-stone-400">{doc.authorization_user_name || "-"}</div>
                    </td>

                    <td className="p-3 text-center">
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border",
                          doc.status === "APPROVED"
                            ? "bg-stone-100 text-stone-900 border-stone-300 font-extrabold"
                            : doc.status === "PENDING_APPROVAL"
                            ? "bg-stone-100 text-stone-700 border-stone-200"
                            : doc.status === "REVISION_REQUIRED"
                            ? "bg-stone-200 text-stone-800 border-stone-300"
                            : "bg-stone-50 text-stone-600 border-stone-200"
                        )}
                      >
                        {doc.status}
                      </span>
                    </td>

                    <td className="p-3 pr-4 text-center space-x-1">
                      <Button
                        onClick={() => setPreviewDoc(doc)}
                        variant="outline"
                        size="xs"
                        className="rounded-xl text-[10px] font-bold border-stone-200 bg-stone-50 hover:bg-stone-100"
                      >
                        {isId ? "Prinjau" : "Preview"}
                      </Button>

                      {doc.status !== "APPROVED" && (
                        <Button
                          onClick={() => handleOpenEditDoc(doc)}
                          variant="secondary"
                          size="xs"
                          className="rounded-xl text-[10px] font-bold border-stone-200 bg-stone-100 hover:bg-stone-200 text-stone-800"
                        >
                          {isId ? "Edit Canvas" : "Edit Canvas"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Interactive Canva-Like Workspace Editor Modal */}
      <Modal
        isOpen={showEditorModal}
        onClose={() => setShowEditorModal(false)}
        maxWidth="5xl"
        title={
          <div className="flex items-center justify-between w-full pr-8">
            <span className="font-bold text-stone-900 text-sm">
              {editingDocId ? (isId ? "Edit Canvas Dokumen" : "Edit Workspace Document") : (isId ? "Buat Dokumen Workspace Baru" : "Create New Document")}
            </span>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Metadata Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-stone-50 border border-stone-200 rounded-xl">
            <div>
              <label className="text-[10px] font-bold text-stone-700 block mb-1">
                {isId ? "Judul Dokumen *" : "Document Title *"}
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-bold outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-stone-700 block mb-1">
                {isId ? "Tipe Dokumen" : "Document Type"}
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-medium outline-none"
              >
                <option value="MEMORANDUM">Memorandum Internal</option>
                <option value="INTERNAL_POLICY">Kebijakan Pabrik</option>
                <option value="TECHNICAL_SPEC">Spesifikasi Teknis</option>
                <option value="OFFICIAL_NOTICE">Pengumuman Resmi</option>
                <option value="AUTHORIZATION_LETTER">Surat Kuasa & Otorisasi</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-stone-700 block mb-1">
                {isId ? "Role Otorisasi Penanggung Jawab *" : "Authorization Role *"}
              </label>
              <select
                value={docAuthRole}
                onChange={(e) => setDocAuthRole(e.target.value)}
                className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-bold outline-none"
              >
                {AUTH_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Canva Visual Block Builder Toolbar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-stone-200">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider shrink-0">
              {isId ? "Tambah Blok Canva:" : "Add Canvas Block:"}
            </span>
            <button
              onClick={() => handleAddBlock("TEXT")}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-lg shrink-0"
            >
              + Paragraf Teks
            </button>
            <button
              onClick={() => handleAddBlock("CALLOUT")}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-lg shrink-0"
            >
              + Kotak Sorotan / Catatan
            </button>
            <button
              onClick={() => handleAddBlock("TABLE")}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-lg shrink-0"
            >
              + Tabel Data
            </button>
            <button
              onClick={() => handleAddBlock("METADATA_GRID")}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-lg shrink-0"
            >
              + Grid Informasi Key-Value
            </button>
          </div>

          {/* Visual Canvas Paper Stream */}
          <div className="bg-stone-200/50 p-6 rounded-2xl space-y-4 max-h-[500px] overflow-y-auto border border-stone-300/80">
            {docBlocks.map((block, idx) => (
              <div key={block.id} className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-3 relative group">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <span className="text-[10px] font-bold font-mono text-stone-400">
                    BLOK {idx + 1}: {block.type}
                  </span>

                  <button
                    onClick={() => handleRemoveBlock(block.id)}
                    className="text-stone-400 hover:text-stone-800 font-bold text-xs"
                  >
                    Hapus Blok
                  </button>
                </div>

                {block.type === "HEADER" && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={block.title || ""}
                      onChange={(e) => handleUpdateBlockContent(block.id, "title", e.target.value)}
                      className="w-full text-base font-black text-center text-stone-900 border-b border-stone-200 outline-none pb-1 uppercase"
                    />
                    <input
                      type="text"
                      value={block.content || ""}
                      onChange={(e) => handleUpdateBlockContent(block.id, "content", e.target.value)}
                      className="w-full text-xs text-center text-stone-500 font-bold outline-none"
                    />
                  </div>
                )}

                {block.type === "TEXT" && (
                  <textarea
                    rows={3}
                    value={block.content || ""}
                    onChange={(e) => handleUpdateBlockContent(block.id, "content", e.target.value)}
                    className="w-full text-xs p-2 bg-stone-50 border border-stone-200 rounded-lg outline-none font-medium leading-relaxed"
                  />
                )}

                {block.type === "CALLOUT" && (
                  <div className="p-3 bg-stone-100 border border-stone-300 rounded-lg space-y-1">
                    <input
                      type="text"
                      value={block.title || ""}
                      onChange={(e) => handleUpdateBlockContent(block.id, "title", e.target.value)}
                      className="w-full text-xs font-bold text-stone-900 bg-transparent outline-none"
                      placeholder="Judul Sorotan..."
                    />
                    <textarea
                      rows={2}
                      value={block.content || ""}
                      onChange={(e) => handleUpdateBlockContent(block.id, "content", e.target.value)}
                      className="w-full text-xs text-stone-700 bg-transparent outline-none font-medium"
                    />
                  </div>
                )}

                {block.type === "METADATA_GRID" && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {block.metaData?.map((m, mIdx) => (
                      <div key={mIdx} className="p-2 bg-stone-50 border border-stone-200 rounded-lg flex items-center justify-between">
                        <span className="font-bold text-stone-600">{m.key}:</span>
                        <span className="font-mono text-stone-900">{m.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {block.type === "TABLE" && (
                  <div className="overflow-x-auto border border-stone-200 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-stone-100 font-bold border-b border-stone-200">
                          {block.tableData?.headers.map((h, hIdx) => (
                            <th key={hIdx} className="p-2">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.tableData?.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="border-b border-stone-100">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-2 text-stone-800">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {block.type === "SIGNATURE_STAMP" && (
                  <div className="p-4 border border-dashed border-stone-300 rounded-xl text-center space-y-2 bg-stone-50">
                    <div className="text-xs font-bold text-stone-700 uppercase">
                      {block.title || "Kolom Pengesahan Otorisasi"}
                    </div>
                    <div className="text-[10px] text-stone-400">
                      Otorisasi Otomatis oleh Role: <span className="font-bold text-stone-800">{docAuthRole}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-stone-200">
            <Button
              onClick={() => setShowEditorModal(false)}
              variant="outline"
              className="rounded-xl text-xs font-bold border-stone-200"
            >
              Batal
            </Button>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => handleSaveDocument(false)}
                disabled={isSaving}
                variant="secondary"
                className="bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl font-bold text-xs px-4 py-2.5"
              >
                Simpan Draft
              </Button>

              <Button
                onClick={() => handleSaveDocument(true)}
                disabled={isSaving}
                variant="primary"
                className="bg-stone-900 hover:bg-black text-white rounded-xl font-bold text-xs px-5 py-2.5 shadow-xs"
              >
                Kirim untuk Otorisasi ({docAuthRole})
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* 5. Document Preview & Approval Modal */}
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
                <span className="font-bold text-stone-900 text-sm">{previewDoc.title}</span>
              </div>

              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border bg-stone-100 text-stone-800 border-stone-200">
                {previewDoc.status}
              </span>
            </div>
          )
        }
      >
        {previewDoc && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs">
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">Pembuat Dokumen</span>
                <span className="font-bold text-stone-800">{previewDoc.created_by_name} ({previewDoc.department})</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">Role Otorisasi</span>
                <span className="font-bold text-stone-800">{previewDoc.authorization_role}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-stone-400 uppercase block">Tanggal</span>
                <span className="font-bold text-stone-800">{new Date(previewDoc.created_at).toLocaleDateString("id-ID")}</span>
              </div>
            </div>

            {previewDoc.revision_note && (
              <div className="p-3 bg-stone-200 border border-stone-300 rounded-xl text-xs space-y-1">
                <div className="font-bold text-stone-900">Catatan Revisi Otorisasi:</div>
                <div className="text-stone-700 italic">{previewDoc.revision_note}</div>
              </div>
            )}

            {/* Document Canvas Render */}
            <div className="bg-white border border-stone-300 rounded-2xl p-8 space-y-6 shadow-xs font-sans">
              {previewDoc.content?.map((b, bIdx) => (
                <div key={bIdx} className="space-y-2">
                  {b.type === "HEADER" && (
                    <div className="text-center space-y-1 border-b pb-4">
                      <h2 className="text-lg font-black tracking-tight text-stone-900 uppercase">{b.title}</h2>
                      <div className="text-xs font-bold text-stone-500">{b.content}</div>
                    </div>
                  )}

                  {b.type === "TEXT" && (
                    <p className="text-xs text-stone-800 leading-relaxed font-medium">{b.content}</p>
                  )}

                  {b.type === "CALLOUT" && (
                    <div className="p-4 bg-stone-100 border border-stone-300 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-stone-900">{b.title}</div>
                      <div className="text-stone-700 leading-relaxed">{b.content}</div>
                    </div>
                  )}

                  {b.type === "METADATA_GRID" && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {b.metaData?.map((m, mIdx) => (
                        <div key={mIdx} className="p-2 bg-stone-50 border border-stone-200 rounded-lg flex justify-between">
                          <span className="font-bold text-stone-600">{m.key}:</span>
                          <span className="font-mono text-stone-900">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {b.type === "TABLE" && (
                    <div className="overflow-x-auto border border-stone-200 rounded-lg text-xs">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-stone-100 border-b border-stone-200 font-bold">
                            {b.tableData?.headers.map((h, idx) => (
                              <th key={idx} className="p-2">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {b.tableData?.rows.map((r, rIdx) => (
                            <tr key={rIdx} className="border-b border-stone-100">
                              {r.map((c, cIdx) => (
                                <td key={cIdx} className="p-2 text-stone-800">{c}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {b.type === "SIGNATURE_STAMP" && (
                    <div className="pt-6 mt-6 border-t border-stone-200 flex items-center justify-between text-center text-xs">
                      <div>
                        <div className="text-[10px] text-stone-400 font-bold uppercase">Dibuat Oleh</div>
                        <div className="h-12"></div>
                        <div className="font-bold text-stone-900">{previewDoc.created_by_name}</div>
                      </div>

                      <div>
                        <div className="text-[10px] text-stone-400 font-bold uppercase">Disetujui ({previewDoc.authorization_role})</div>
                        <div className="h-12 flex items-center justify-center">
                          {previewDoc.status === "APPROVED" && (
                            <span className="px-3 py-1 bg-stone-900 text-white rounded-md text-[10px] font-black uppercase tracking-widest">
                              APPROVED
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-stone-900">
                          {previewDoc.approved_by || previewDoc.authorization_user_name || "Otorisator Resmi"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Approval Controls */}
            {previewDoc.status === "PENDING_APPROVAL" && (
              <div className="p-4 bg-stone-100 border border-stone-300 rounded-xl flex items-center justify-between gap-4">
                <div className="text-xs font-bold text-stone-800">
                  Otorisasi Diperlukan untuk Role: <span className="font-mono text-stone-900">{previewDoc.authorization_role}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setTargetReviseDocId(previewDoc.id);
                      setShowRevisionModal(true);
                    }}
                    variant="outline"
                    className="bg-white hover:bg-stone-200 border-stone-300 text-stone-800 font-bold text-xs rounded-xl"
                  >
                    Buat Catatan Revisi
                  </Button>

                  <Button
                    onClick={() => handleApproveDocument(previewDoc.id)}
                    variant="primary"
                    className="bg-stone-900 hover:bg-black text-white font-bold text-xs rounded-xl px-5 py-2"
                  >
                    Approve Dokumen
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 6. Revision Modal */}
      <Modal
        isOpen={showRevisionModal}
        onClose={() => setShowRevisionModal(false)}
        maxWidth="md"
        title={<span className="font-bold text-stone-900 text-sm">Buat Catatan Revisi Dokumen</span>}
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-600">
            Masukkan poin koreksi atau instruksi revisi yang wajib diperbaiki oleh pembuat dokumen.
          </p>

          <textarea
            rows={4}
            value={revisionNoteInput}
            onChange={(e) => setRevisionNoteInput(e.target.value)}
            placeholder="Tuliskan catatan revisi di sini..."
            className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-xl font-medium outline-none"
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
              className="bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-bold px-4 py-2"
            >
              Kirim Catatan Revisi
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
