import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Button,
  Modal,
  Badge,
  Input,
  Select,
  Tabs,
} from "@/components/ui";
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
  History,
  Download,
  Upload,
  RotateCcw,
  KeyRound,
  Archive,
  Undo2,
  Printer,
} from "lucide-react";
import {
  CanvaStudioEditor,
  DEPARTMENT_ROUTING_CONFIG,
  OFFICIAL_KOP_SURAT_BLOCK,
} from "@/components/erp/workspace/StudioEditor";
import { getPaperDimensions } from "@/components/erp/workspace/studio/config";
import {
  SharedBlockRenderer,
  DocumentSheetRenderer,
} from "@/components/erp/workspace/BlockRenderer";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ReviseDocModal } from "@/components/erp/ReviseDocModal";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { generatePDF } from "@/lib/pdfGenerator";
import { getDailyAuthKey } from "@/utils/auth";
import { parseDocxPackageToBlocks } from "@/services/docxEngine";
import {
  DocBlock,
  LayoutPreset,
  TargetDepartment,
  WorkspaceDocument,
  WorkspaceDocumentVersion,
  WorkspaceDocumentEvent,
} from "@/types/workspace";
import {
  ERP_DEPARTMENT_OPTIONS,
  normalizeDepartmentToRole,
  canUserApproveDepartment,
} from "@/constants/rbac";

import {
  TEMPLATE_PRESETS,
  TEMPLATE_ICONS,
  TEMPLATE_ACCENTS,
  STATUS_META,
  relativeTime,
} from "@/components/erp/workspace/workspacePresets";
import { WorkspaceModals } from "@/components/erp/workspace/WorkspaceModals";

export function DocumentWorkspace() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isId = false;

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
  const [studioSessionKey, setStudioSessionKey] = useState(0);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocCode, setEditingDocCode] = useState<string | null>(null);
  const [studioInitialTitle, setStudioInitialTitle] = useState("");
  const [studioInitialDocType, setStudioInitialDocType] = useState("MEMORANDUM");
  const [studioInitialDepartment, setStudioInitialDepartment] = useState("PRODUCTION");
  const [studioInitialAuthRole, setStudioInitialAuthRole] = useState("PURCHASING_MANAGER");
  const [studioInitialAuthDept, setStudioInitialAuthDept] = useState("PURCHASING");
  const [studioInitialAuthName, setStudioInitialAuthName] = useState("");
  const [studioInitialBlocks, setStudioInitialBlocks] = useState<DocBlock[]>([]);
  const [studioInitialLayoutPreset, setStudioInitialLayoutPreset] = useState<LayoutPreset>("A4_PORTRAIT");
  const [studioInitialCustomWidthMm, setStudioInitialCustomWidthMm] = useState<number>(210);
  const [studioInitialCustomHeightMm, setStudioInitialCustomHeightMm] = useState<number>(297);
  const [studioInitialVersions, setStudioInitialVersions] = useState<WorkspaceDocumentVersion[]>([]);
  const [studioInitialStatus, setStudioInitialStatus] = useState<string>("DRAFT");
  const [isSaving, setIsSaving] = useState(false);
  const docxImportInputRef = React.useRef<HTMLInputElement | null>(null);

  // Strict per-user ownership check: only the exact creator account can edit, continue, clone, or delete
  const isDocOwner = useCallback(
    (doc: WorkspaceDocument | null | undefined): boolean => {
      if (!doc || !user) return false;
      const currentUsername = String(user.username || "").trim().toLowerCase();
      const docUsername = String(doc.created_by_username || (doc as any).createdByUsername || "").trim().toLowerCase();
      if (currentUsername && docUsername && currentUsername === docUsername) {
        return true;
      }
      const currentUserId = Number((user as any).id);
      const docUserId = Number(doc.created_by_user_id ?? (doc as any).createdByUserId);
      if (Number.isFinite(currentUserId) && currentUserId > 0 && Number.isFinite(docUserId) && docUserId > 0) {
        return currentUserId === docUserId;
      }
      return false;
    },
    [user]
  );

  // Preview & Authorization Action Modal States
  const [previewDoc, setPreviewDoc] = useState<WorkspaceDocument | null>(null);
  const [authorizeTargetDoc, setAuthorizeTargetDoc] = useState<WorkspaceDocument | null>(null);
  const [approvalNoteInput, setApprovalNoteInput] = useState("");
  const [reviseTargetDoc, setReviseTargetDoc] = useState<WorkspaceDocument | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isExportingPreviewPdf, setIsExportingPreviewPdf] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceDocument | null>(null);
  const previewSheetRef = React.useRef<HTMLDivElement | null>(null);

  // Version History, Snapshot Restore & Audit Trail States
  const [historyDoc, setHistoryDoc] = useState<WorkspaceDocument | null>(null);
  const [versionsList, setVersionsList] = useState<WorkspaceDocumentVersion[]>([]);
  const [eventsList, setEventsList] = useState<WorkspaceDocumentEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  // Fetch Documents from Backend (properly unwrapping { success, data: [...] } envelope)
  const fetchDocs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch("/api/workspace-documents", {}, user?.username);
      const rawPayload = res.data as any;
      const list = Array.isArray(rawPayload)
        ? rawPayload
        : Array.isArray(rawPayload?.data)
        ? rawPayload.data
        : null;
      if (res.ok && list) {
        setDocs(list);
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
      list = list.filter((d) => isDocOwner(d));
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
  }, [docs, activeTab, statusFilter, departmentFilter, searchQuery, sortMode, user, isDocOwner]);

  // Saved drafts & revisions owned strictly by the current logged-in user (for quick resume)
  const myResumableDrafts = useMemo(() => {
    return docs
      .filter(
        (d) =>
          isDocOwner(d) &&
          (d.status === "DRAFT" || d.status === "REVISION_REQUIRED")
      )
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [docs, isDocOwner]);

  // Launch Studio Editor with Template or Blank
  const handleLaunchStudio = (templateId?: string) => {
    setEditingDocId(null);
    setEditingDocCode(null);
    if (templateId) {
      const selected = TEMPLATE_PRESETS.find((t) => t.id === templateId) || TEMPLATE_PRESETS[0];
      setStudioInitialTitle(isId ? selected.titleId : selected.titleEn);
      setStudioInitialDocType(selected.type);
      setStudioInitialDepartment(
        normalizeDepartmentToRole((user as any)?.department || user?.role || selected.targetDept)
      );
      setStudioInitialAuthDept(selected.targetDept);
      setStudioInitialAuthRole(
        DEPARTMENT_ROUTING_CONFIG[selected.targetDept]?.role || "PURCHASING_MANAGER"
      );
      setStudioInitialAuthName("");
      setStudioInitialBlocks(JSON.parse(JSON.stringify(selected.defaultBlocks)));
      setStudioInitialLayoutPreset("A4_PORTRAIT");
    } else {
      const userDeptNorm = (normalizeDepartmentToRole((user as any)?.department || user?.role) ||
        "PURCHASING") as TargetDepartment;
      const defaultRouteCfg =
        DEPARTMENT_ROUTING_CONFIG[userDeptNorm] || DEPARTMENT_ROUTING_CONFIG.PURCHASING;

      setStudioInitialTitle(isId ? "Dokumen Baru Tanpa Judul" : "New Blank Document");
      setStudioInitialDocType("MEMORANDUM");
      setStudioInitialDepartment(userDeptNorm);
      setStudioInitialAuthDept(userDeptNorm);
      setStudioInitialAuthRole(defaultRouteCfg.role);
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
          title: "OFFICIAL INTERNAL MEMORANDUM",
          content: `NO: MEMO/PJ/${new Date().getFullYear()}/001`,
          alignment: "CENTER",
        },
        {
          id: "blk-3",
          type: "TEXT",
          category: "BODY_TEXT",
          content:
            "Type your document content or work instructions here. You can insert address blocks or department signature columns from the left panel.",
          alignment: "LEFT",
        },
        {
          id: "blk-4",
          type: "SIGNATURE_COLUMN",
          category: "SIGNATURE_COLUMN",
          title: isId
            ? `Kolom Otorisasi & Pengesahan: ${defaultRouteCfg.deptNameId}`
            : `Authorization Sign-off: ${defaultRouteCfg.deptNameEn}`,
          subtitle: isId
            ? `Tanda Tangan Resmi ${defaultRouteCfg.signatoryTitleId}`
            : `Official Signature ${defaultRouteCfg.signatoryTitleEn}`,
          targetDepartment: userDeptNorm,
          targetRole: defaultRouteCfg.role,
          signatoryTitle: isId ? defaultRouteCfg.signatoryTitleId : defaultRouteCfg.signatoryTitleEn,
          notes: isId ? defaultRouteCfg.descriptionId : defaultRouteCfg.descriptionEn,
          isTriggerActive: true,
          alignment: "RIGHT",
        },
        {
          id: "blk-5-footer",
          type: "FOOTER",
          category: "FOOTER_TEMPLATE",
          footerVariant: "ERP_STANDARD",
          footerLeftText:
            "This document is computationally issued and validated. Valid without physical signature.",
          footerRightText: "MEMORANDUM",
          subtitle: "OFFICIAL WORKSPACE DOCUMENT",
          title:
            "This document is computationally issued and validated. Valid without physical signature.",
          content: "MEMORANDUM",
          alignment: "LEFT",
        },
      ]);
      setStudioInitialLayoutPreset("A4_PORTRAIT");
    }
    setStudioInitialCustomWidthMm(210);
    setStudioInitialCustomHeightMm(297);
    setStudioInitialVersions([]);
    setStudioInitialStatus("DRAFT");
    setStudioSessionKey((k) => k + 1);
    setIsStudioOpen(true);
  };

  // Direct Import .DOCX file into Unified Studio
  const handleDirectImportDocx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const arrayBuf = await file.arrayBuffer();
      const parsed = parseDocxPackageToBlocks(new Uint8Array(arrayBuf));
      if (!parsed.blocks || parsed.blocks.length === 0) {
        showToast(
          isId
            ? "Tidak ditemukan blok dokumen yang valid di dalam berkas .DOCX."
            : "No valid document blocks found in the .DOCX file.",
          "error"
        );
        return;
      }
      const nonKop = parsed.blocks.filter(
        (b) => b.type !== "OFFICIAL_LETTERHEAD" && b.type !== "letterhead"
      );
      const importedSig = [...nonKop]
        .reverse()
        .find(
          (b) =>
            b.type === "SIGNATURE_COLUMN" ||
            b.type === "SIGNATURE_STAMP" ||
            b.type === "DUAL_SIGNATURE"
        );
      const hasSig = Boolean(importedSig);
      const importDept = (importedSig?.targetDepartment ||
        normalizeDepartmentToRole((user as any)?.department || user?.role) ||
        "PURCHASING") as TargetDepartment;
      const importRouteCfg =
        DEPARTMENT_ROUTING_CONFIG[importDept] || DEPARTMENT_ROUTING_CONFIG.PURCHASING;

      const cleanTitle = file.name.replace(/\.docx$/i, "").replace(/[_-]+/g, " ").trim();
      const hasImportedFooter = nonKop.some((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
      setEditingDocId(null);
      setEditingDocCode(null);
      setStudioInitialTitle(cleanTitle || (isId ? "Dokumen Impor DOCX" : "Imported DOCX Document"));
      setStudioInitialDocType("MEMORANDUM");
      setStudioInitialDepartment(importDept);
      setStudioInitialAuthDept(importDept);
      setStudioInitialAuthRole(importRouteCfg.role);
      setStudioInitialAuthName("");
      setStudioInitialBlocks([
        { ...OFFICIAL_KOP_SURAT_BLOCK, isLocked: true },
        ...nonKop,
        ...(!hasSig
          ? [
              {
                id: "blk-sig-import",
                type: "SIGNATURE_COLUMN" as const,
                category: "SIGNATURE_COLUMN" as const,
                title: isId
                  ? `Kolom Otorisasi & Pengesahan: ${importRouteCfg.deptNameId}`
                  : `Authorization Sign-off: ${importRouteCfg.deptNameEn}`,
                subtitle: isId
                  ? `Tanda Tangan Resmi ${importRouteCfg.signatoryTitleId}`
                  : `Official Signature ${importRouteCfg.signatoryTitleEn}`,
                targetDepartment: importDept,
                targetRole: importRouteCfg.role,
                signatoryTitle: isId ? importRouteCfg.signatoryTitleId : importRouteCfg.signatoryTitleEn,
                notes: isId ? importRouteCfg.descriptionId : importRouteCfg.descriptionEn,
                isTriggerActive: true,
              },
            ]
          : []),
        ...(!hasImportedFooter
          ? [
              {
                id: "blk-footer-import",
                type: "FOOTER" as const,
                category: "FOOTER_TEMPLATE" as const,
                footerVariant: "ERP_STANDARD" as const,
                footerLeftText:
                  "This document is computationally issued and validated. Valid without physical signature.",
                footerRightText: "MEMORANDUM",
                subtitle: "OFFICIAL WORKSPACE DOCUMENT",
                title:
                  "This document is computationally issued and validated. Valid without physical signature.",
                content: "MEMORANDUM",
                alignment: "LEFT" as const,
              },
            ]
          : []),
      ]);
      setStudioInitialLayoutPreset("A4_PORTRAIT");
      setStudioInitialStatus("DRAFT");
      setStudioSessionKey((k) => k + 1);
      setIsStudioOpen(true);
      showToast(
        isId
          ? `Berkas "${file.name}" berhasil dibuka di Unified Document Studio.`
          : `Opened "${file.name}" in Unified Document Studio.`,
        "success"
      );
    } catch {
      showToast(
        isId ? "Gagal membaca berkas .DOCX" : "Failed to parse .DOCX file",
        "error"
      );
    }
  };

  // Launch Studio for Existing Document (Strict Owner Enforcement + Latest Snapshot Load)
  const handleEditExistingDoc = async (doc: WorkspaceDocument) => {
    if (!isDocOwner(doc)) {
      showToast(
        isId
          ? "Akses Ditolak: Anda tidak memiliki izin untuk mengedit atau melanjutkan dokumen milik pengguna lain."
          : "Access Denied: You cannot edit or continue documents owned by another user.",
        "error"
      );
      return;
    }

    if (doc.status === "APPROVED" || doc.status === "ARCHIVED") {
      showToast(
        isId
          ? "Dokumen final terkunci permanen. Gunakan fitur 'Buat Revisi' untuk membuat draft baru."
          : "Finalized documents are locked. Use 'Clone Revision' to start a new draft.",
        "info"
      );
      return;
    }

    if (doc.status === "PENDING_APPROVAL") {
      showToast(
        isId
          ? "Dokumen sedang menunggu otorisasi. Tarik pengajuan kembali ke Draft jika ingin mengedit."
          : "Document is pending approval. Revert to Draft first to edit.",
        "info"
      );
      return;
    }

    let targetDoc = doc;
    try {
      const res = await apiFetch(`/api/workspace-documents/${doc.id}`, {}, user?.username);
      const latest = (res.data as any)?.data || res.data;
      if (res.ok && latest && latest.id) {
        targetDoc = latest;
      }
    } catch {
      // Fallback to in-memory doc if network fetch fails
    }

    setEditingDocId(targetDoc.id);
    setEditingDocCode(targetDoc.document_code || null);
    setStudioInitialTitle(targetDoc.title);
    setStudioInitialDocType(targetDoc.document_type || "MEMORANDUM");
    setStudioInitialDepartment(
      normalizeDepartmentToRole(targetDoc.department || targetDoc.authorization_department || "PRODUCTION")
    );
    setStudioInitialAuthRole(targetDoc.authorization_role || "PURCHASING_MANAGER");
    setStudioInitialAuthDept(
      normalizeDepartmentToRole(targetDoc.authorization_department || "PURCHASING")
    );
    setStudioInitialAuthName(targetDoc.authorization_user_name || "");
    setStudioInitialBlocks(
      Array.isArray(targetDoc.content) ? JSON.parse(JSON.stringify(targetDoc.content)) : []
    );
    setStudioInitialLayoutPreset(targetDoc.layout_preset || "A4_PORTRAIT");
    setStudioInitialCustomWidthMm(Number(targetDoc.custom_width_mm) || 210);
    setStudioInitialCustomHeightMm(Number(targetDoc.custom_height_mm) || 297);
    setStudioInitialVersions(Array.isArray((targetDoc as any).versions) ? (targetDoc as any).versions : []);
    setStudioInitialStatus(targetDoc.status || "DRAFT");
    setStudioSessionKey((k) => k + 1);
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
      custom_width_mm?: number | null;
      custom_height_mm?: number | null;
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
        custom_width_mm: docData.custom_width_mm ?? 210,
        custom_height_mm: docData.custom_height_mm ?? 297,
        authorization_role: docData.authorization_role,
        authorization_department: docData.authorization_department,
        authorization_user_name: docData.authorization_user_name,
        submitForApproval: docData.submitForApproval,
      };

      let res;
      if (editingDocId) {
        if (docData.submitForApproval) {
          // P0-04 Atomic Submit Endpoint
          res = await apiFetch(
            `/api/workspace-documents/${editingDocId}/submit`,
            {
              method: "POST",
              body: JSON.stringify(payload),
            },
            user?.username
          );
        } else {
          // Normal Draft Update
          res = await apiFetch(
            `/api/workspace-documents/${editingDocId}`,
            {
              method: "PUT",
              body: JSON.stringify(payload),
            },
            user?.username
          );
        }
      } else {
        // Create New Document (Backend supports atomic submitForApproval or DRAFT creation)
        res = await apiFetch(
          "/api/workspace-documents",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          user?.username
        );
      }

      const savedDoc = (res.data as any)?.data || res.data;

      if (res.ok && savedDoc?.id) {
        // Bind the document ID to the active Studio session so subsequent Save Draft or Close & Resume works seamlessly
        setEditingDocId(savedDoc.id);
        setStudioInitialTitle(docData.title);
        setStudioInitialDocType(docData.document_type);
        setStudioInitialDepartment(docData.department);
        setStudioInitialAuthRole(docData.authorization_role);
        setStudioInitialAuthDept(docData.authorization_department);
        setStudioInitialAuthName(docData.authorization_user_name);
        setStudioInitialBlocks(JSON.parse(JSON.stringify(docData.content)));
        setStudioInitialLayoutPreset(docData.layout_preset);
        setStudioInitialCustomWidthMm(Number(docData.custom_width_mm) || 210);
        setStudioInitialCustomHeightMm(Number(docData.custom_height_mm) || 297);
        setStudioInitialStatus(
          docData.submitForApproval ? "PENDING_APPROVAL" : savedDoc.status || "DRAFT"
        );

        // Immediately upsert into local docs state so even before fetchDocs finishes, the draft is visible and resumable
        setDocs((prev) => {
          const exists = prev.some((d) => d.id === savedDoc.id);
          if (exists) {
            return prev.map((d) => (d.id === savedDoc.id ? { ...d, ...savedDoc } : d));
          }
          return [savedDoc as WorkspaceDocument, ...prev];
        });

        showToast(
          docData.submitForApproval
            ? isId
              ? `Dokumen berhasil diajukan ke Departemen ${docData.authorization_department} untuk otorisasi!`
              : `Document submitted to ${docData.authorization_department} department for authorization!`
            : isId
            ? "Draft dokumen berhasil disimpan dan siap dilanjutkan kapan saja."
            : "Document draft saved and ready to resume anytime.",
          "success"
        );
        if (closeAfter) setIsStudioOpen(false);
        await fetchDocs();
      } else {
        showToast(res.error || (isId ? "Gagal menyimpan dokumen" : "Failed to save document"), "error");
        throw new Error(res.error || "save_failed");
      }
    } catch (err: any) {
      if (err?.message !== "save_failed" && !String(err?.message).length) {
        showToast(err.message || "A system error occurred", "error");
      }
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Check if current logged-in user has authority to approve/revise a document
  const canApproveDoc = useCallback(
    (doc: WorkspaceDocument | null): boolean => {
      if (!doc || !user) return false;
      const roleNorm = normalizeDepartmentToRole(user.role);
      if (roleNorm === "FC") return true;
      return (
        canUserApproveDepartment(user.role, doc.authorization_department) ||
        canUserApproveDepartment(user.role, doc.authorization_role) ||
        canUserApproveDepartment(user.role, doc.department)
      );
    },
    [user]
  );

  // Approve Document with 6-Digit Daily Auth Key (ERP Standard AuthorizeDocModal)
  const handleConfirmAuthorizeDocument = async (pin: string) => {
    if (!authorizeTargetDoc) return;
    setIsProcessingAction(true);
    try {
      const res = await apiFetch(
        `/api/workspace-documents/${authorizeTargetDoc.id}/approve`,
        {
          method: "POST",
          body: JSON.stringify({
            pin: pin.trim(),
            approval_note: approvalNoteInput.trim() || undefined,
          }),
        },
        user?.username
      );

      if (res.ok) {
        showToast(
          isId
            ? `Dokumen ${authorizeTargetDoc.document_code} berhasil diotorisasi dengan Daily Auth Key!`
            : `Document ${authorizeTargetDoc.document_code} authorized (APPROVED).`,
          "success"
        );
        setAuthorizeTargetDoc(null);
        setApprovalNoteInput("");
        setPreviewDoc(null);
        fetchDocs();
      } else {
        showToast(res.error || (isId ? "Gagal mengotorisasi dokumen" : "Failed to approve document"), "error");
      }
    } catch {
      showToast(isId ? "Gagal memproses otorisasi" : "Failed to process authorization", "error");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Submit Revision Note (ERP Standard ReviseDocModal)
  const handleConfirmReviseDocument = async (note: string) => {
    if (!reviseTargetDoc || !note.trim()) return;
    setIsProcessingAction(true);
    try {
      const res = await apiFetch(
        `/api/workspace-documents/${reviseTargetDoc.id}/revise`,
        {
          method: "POST",
          body: JSON.stringify({ revision_note: note.trim() }),
        },
        user?.username
      );

      if (res.ok) {
        showToast(
          isId
            ? "Catatan revisi berhasil dikirim ke pembuat dokumen."
            : "Revision note sent to author.",
          "success"
        );
        setReviseTargetDoc(null);
        setPreviewDoc(null);
        fetchDocs();
      } else {
        showToast(res.error || (isId ? "Gagal mengirim catatan revisi" : "Failed to send revision note"), "error");
      }
    } catch {
      showToast("A system error occurred", "error");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Cancel Submission / Revert PENDING_APPROVAL back to DRAFT (Strict Owner Only)
  const handleCancelSubmission = async (doc: WorkspaceDocument) => {
    if (!isDocOwner(doc)) {
      showToast(
        isId
          ? "Akses Ditolak: Hanya pembuat dokumen yang dapat menarik kembali pengajuan ke status Draft."
          : "Access Denied: Only the document creator can revert a submission to Draft.",
        "error"
      );
      return;
    }
    setIsProcessingAction(true);
    try {
      const res = await apiFetch(
        `/api/workspace-documents/${doc.id}/cancel-submission`,
        { method: "POST" },
        user?.username
      );
      if (res.ok) {
        showToast(
          isId
            ? `Pengajuan ${doc.document_code} ditarik kembali ke status Draft.`
            : `Submission ${doc.document_code} reverted to Draft.`,
          "info"
        );
        setPreviewDoc(null);
        fetchDocs();
      } else {
        showToast(res.error || (isId ? "Gagal menarik pengajuan" : "Failed to cancel submission"), "error");
      }
    } catch {
      showToast(isId ? "Gagal menarik pengajuan" : "Failed to cancel submission", "error");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Archive Approved Document
  const handleArchiveDocument = async (doc: WorkspaceDocument) => {
    setIsProcessingAction(true);
    try {
      const res = await apiFetch(
        `/api/workspace-documents/${doc.id}/archive`,
        { method: "POST" },
        user?.username
      );
      if (res.ok) {
        showToast(
          isId ? `Dokumen ${doc.document_code} berhasil diarsipkan.` : `Document ${doc.document_code} archived.`,
          "success"
        );
        setPreviewDoc(null);
        fetchDocs();
      } else {
        showToast(res.error || (isId ? "Gagal mengarsipkan dokumen" : "Failed to archive document"), "error");
      }
    } catch {
      showToast(isId ? "Gagal mengarsipkan dokumen" : "Failed to archive document", "error");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Delete Document (Strict Owner Only & Non-Final Only)
  const handleDeleteDocument = async () => {
    if (!deleteTarget) return;
    if (!isDocOwner(deleteTarget)) {
      showToast(
        isId
          ? "Akses Ditolak: Anda tidak dapat menghapus dokumen milik pengguna lain."
          : "Access Denied: You cannot delete documents belonging to another user.",
        "error"
      );
      setDeleteTarget(null);
      return;
    }
    try {
      const res = await apiFetch(`/api/workspace-documents/${deleteTarget.id}`, {
        method: "DELETE",
      }, user?.username);
      if (res.ok) {
        showToast(isId ? "Dokumen berhasil dihapus." : "Document deleted.", "success");
        setDeleteTarget(null);
        fetchDocs();
      } else {
        showToast(res.error || "Failed to delete document", "error");
      }
    } catch (err) {
      showToast("Failed to delete document", "error");
    }
  };

  // Clone Document (Strict Owner Only: clone own approved doc to start a new revision draft)
  const handleCloneDocument = async (doc: WorkspaceDocument) => {
    if (!isDocOwner(doc)) {
      showToast(
        isId
          ? "Akses Ditolak: Anda tidak dapat melanjutkan atau membuat revisi dari dokumen milik pengguna lain."
          : "Access Denied: You cannot clone or continue documents created by another user.",
        "error"
      );
      return;
    }
    try {
      const res = await apiFetch(`/api/workspace-documents/${doc.id}/clone`, {
        method: "POST",
      }, user?.username);

      const clonedPayload = (res.data as any)?.data || res.data;
      if (res.ok && clonedPayload?.id) {
        showToast(
          isId
            ? `Salinan revisi baru berhasil dibuat (${clonedPayload.document_code}).`
            : `Document cloned as new draft (${clonedPayload.document_code}).`,
          "success"
        );
        await fetchDocs();
        const fullDocRes = await apiFetch(`/api/workspace-documents/${clonedPayload.id}`, {}, user?.username);
        const fullDoc = (fullDocRes.data as any)?.data || fullDocRes.data;
        if (fullDocRes.ok && fullDoc) {
          handleEditExistingDoc(fullDoc);
        }
      } else {
        showToast(res.error || "Failed to clone document", "error");
      }
    } catch (err) {
      showToast("Failed to clone document", "error");
    }
  };

  // Open Version History & Immutable Audit Trail Modal
  const handleOpenHistory = async (doc: WorkspaceDocument) => {
    setHistoryDoc(doc);
    setIsLoadingHistory(true);
    try {
      const [verRes, evtRes] = await Promise.all([
        apiFetch(`/api/workspace-documents/${doc.id}/versions`, {}, user?.username),
        apiFetch(`/api/workspace-documents/${doc.id}/events`, {}, user?.username),
      ]);
      const verRaw = (verRes.data as any)?.data || verRes.data;
      const evtRaw = (evtRes.data as any)?.data || evtRes.data;
      const verData = verRaw?.versions || (Array.isArray(verRaw) ? verRaw : []);
      const evtData = evtRaw?.events || (Array.isArray(evtRaw) ? evtRaw : []);
      setVersionsList(verData);
      setEventsList(evtData);
    } catch {
      showToast("Failed to load version history", "error");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Restore Document Snapshot to a specific version (Strict Owner Only)
  const handleRestoreVersion = async (docId: string, versionNumber: number) => {
    if (historyDoc && !isDocOwner(historyDoc)) {
      showToast(
        isId
          ? "Akses Ditolak: Hanya pembuat dokumen yang dapat memulihkan versi dokumen."
          : "Access Denied: Only the document creator can restore document versions.",
        "error"
      );
      return;
    }
    setRestoringVersion(versionNumber);
    try {
      const res = await apiFetch(
        `/api/workspace-documents/${docId}/versions/${versionNumber}/restore`,
        { method: "POST" },
        user?.username
      );
      if (res.ok) {
        showToast(
          isId
            ? `Dokumen berhasil dipulihkan ke snapshot v${versionNumber}.`
            : `Document restored to snapshot v${versionNumber}.`,
          "success"
        );
        fetchDocs();
        if (historyDoc) {
          handleOpenHistory(historyDoc);
        }
      } else {
        showToast(res.error || "Failed to restore document version", "error");
      }
    } catch {
      showToast("Failed to restore document version", "error");
    } finally {
      setRestoringVersion(null);
    }
  };

  // Download Real OpenXML .DOCX Package
  const handleDownloadDocx = async (doc: WorkspaceDocument) => {
    try {
      const response = await fetch(`/api/workspace-documents/${doc.id}/file`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      const safeCode = (doc.document_code || doc.docNumber || doc.id).replace(/[^a-zA-Z0-9-_]/g, "_");
      a.download = `${safeCode}.docx`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast(isId ? "Gagal mengunduh berkas .DOCX" : "Failed to download .DOCX", "error");
    }
  };

  // Export High-Resolution 300-DPI PDF (Matches Procurement & Sales ERP PDF exports)
  const handleDownloadPdf = async (doc: WorkspaceDocument) => {
    const safeCode = (doc.document_code || doc.docNumber || doc.id).replace(/[^a-zA-Z0-9-_]/g, "_");
    const filename = `${safeCode}_v${doc.current_version || doc.version || 1}.pdf`;

    if (previewSheetRef.current && previewDoc?.id === doc.id) {
      try {
        setIsExportingPreviewPdf(true);
        const preset = doc.layout_preset || "A4_PORTRAIT";
        const paperDims = getPaperDimensions(preset, doc.custom_width_mm, doc.custom_height_mm);
        await generatePDF(previewSheetRef.current, filename, {
          orientation: paperDims.orientation,
          format: [paperDims.widthMm, paperDims.heightMm],
          marginMm: 0,
        });
        showToast(
          isId ? `PDF Presisi (${filename}) berhasil diunduh.` : `Precision PDF (${filename}) downloaded.`,
          "success"
        );
        return;
      } catch (err) {
        console.error("Client PDF capture fallback to server PDF:", err);
      } finally {
        setIsExportingPreviewPdf(false);
      }
    }

    try {
      const response = await fetch(`/api/workspace-documents/${doc.id}/export/pdf`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("PDF export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = filename;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      showToast(isId ? "Gagal mengunduh berkas .PDF" : "Failed to download .PDF", "error");
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
    const isArchived = doc.status === "ARCHIVED";
    const isPending = doc.status === "PENDING_APPROVAL";
    const isDraftOrRevision = doc.status === "DRAFT" || doc.status === "REVISION_REQUIRED";
    const owner = isDocOwner(doc);
    const userHasApproveRight = canApproveDoc(doc);
    const canDelete = isDraftOrRevision && owner;
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPreviewDoc(doc);
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 cursor-pointer transition-colors"
          title={isId ? "Pratinjau & Otorisasi" : "Preview & Authorize"}
        >
          <Eye className="w-3.5 h-3.5 text-stone-500" />
          {!compact && <span>{isId ? "Pratinjau" : "Preview"}</span>}
        </button>

        {isPending && userHasApproveRight && (
          <>
            <Button
              size="xs"
              action="authorize"
              onClick={(e) => {
                e.stopPropagation();
                setAuthorizeTargetDoc(doc);
              }}
              title={isId ? "Otorisasi dengan Daily Key" : "Authorize with Daily Key"}
            >
              {isId ? "Authorize" : "Authorize"}
            </Button>
            <Button
              size="xs"
              action="revise"
              onClick={(e) => {
                e.stopPropagation();
                setReviseTargetDoc(doc);
              }}
              title={isId ? "Minta Revisi dengan Catatan" : "Request Revision"}
            >
              {isId ? "Revise" : "Revise"}
            </Button>
          </>
        )}

        {owner && isApproved && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCloneDocument(doc);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold bg-stone-900 border border-stone-900 text-white hover:bg-stone-800 cursor-pointer transition-colors"
            title={isId ? "Klon & Buat Versi Revisi Baru" : "Clone & Create New Revision"}
          >
            <Copy className="w-3.5 h-3.5" />
            {!compact && <span>{isId ? "Buat Revisi" : "Clone Revision"}</span>}
          </button>
        )}

        {owner && isDraftOrRevision && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleEditExistingDoc(doc);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold bg-stone-900 border border-stone-900 text-white hover:bg-stone-800 cursor-pointer transition-colors"
            title={isId ? "Lanjutkan Draft di Studio Editor" : "Continue Draft in Studio Editor"}
          >
            <PenTool className="w-3.5 h-3.5 text-white" />
            {!compact && (
              <span>
                {doc.status === "REVISION_REQUIRED"
                  ? isId
                    ? "Perbaiki"
                    : "Revise"
                  : isId
                  ? "Lanjutkan"
                  : "Continue"}
              </span>
            )}
          </button>
        )}

        {!owner && !isArchived && (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-stone-100 border border-stone-200 text-stone-500 select-none"
            title={
              isId
                ? `Dokumen milik ${doc.created_by_name} (Hanya Baca — Tidak dapat diedit/dihapus oleh akun lain)`
                : `Owned by ${doc.created_by_name} (Read-only)`
            }
          >
            <Lock className="w-3 h-3 text-stone-400" />
            {!compact && <span>{isId ? "Hanya Baca" : "Read Only"}</span>}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenHistory(doc);
          }}
          className="inline-flex items-center p-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 hover:bg-stone-100 cursor-pointer transition-colors"
          title={isId ? "Riwayat Versi & Audit Trail" : "Version History & Audit Trail"}
        >
          <History className="w-3.5 h-3.5" />
        </button>

        {canDelete && (
          <Button
            type="button"
            variant="danger_soft"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(doc);
            }}
            title={isId ? "Hapus dokumen saya" : "Delete my document"}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-300">
      {/* 1. Page Header */}
      <PageHeader
        title="Document Workspace Studio"
        subtitle="Official ERP document templates"
        icon={<FileText className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={docxImportInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleDirectImportDocx}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => docxImportInputRef.current?.click()}
              leftIcon={<Upload className="w-4 h-4" />}
            >
              {isId ? "Impor .DOCX" : "Import .DOCX"}
            </Button>
            <Button
              size="sm"
              onClick={() => handleLaunchStudio()}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              {isId ? "Dokumen Baru" : "New Document"}
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={fetchDocs}
              disabled={isLoading}
              title={isId ? "Segarkan Dokumen" : "Refresh Documents"}
              aria-label={isId ? "Segarkan Dokumen" : "Refresh Documents"}
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {/* 2B. Resume Saved Drafts Banner */}
      {myResumableDrafts.length > 0 && (
        <div className="bg-stone-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-stone-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
                <PenTool className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-black tracking-tight flex items-center gap-2">
                  <span>Saved Drafts</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-white text-stone-900">
                    {myResumableDrafts.length}
                  </span>
                </h3>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {myResumableDrafts.slice(0, 6).map((draft) => (
              <div
                key={draft.id}
                onClick={() => handleEditExistingDoc(draft)}
                className="group p-3.5 rounded-xl bg-stone-800/90 hover:bg-stone-800 border border-stone-700 hover:border-stone-500 transition-all cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-stone-300 truncate">
                      {draft.document_code}
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-black uppercase",
                        draft.status === "REVISION_REQUIRED"
                          ? "bg-rose-500/20 text-rose-200 border border-rose-400/30"
                          : "bg-white/10 text-stone-200"
                      )}
                    >
                      {draft.status === "REVISION_REQUIRED"
                        ? isId
                          ? "Perlu Revisi"
                          : "Needs Revision"
                        : "Draft"}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white truncate">{draft.title}</div>
                  <div className="text-[10px] text-stone-400">
                    {isId ? "Terakhir disimpan" : "Last saved"} {relativeTime(draft.updated_at, isId)} · v
                    {draft.current_version || draft.version || 1}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditExistingDoc(draft);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-stone-900 hover:bg-stone-100 text-[11px] font-black cursor-pointer transition-colors"
                  >
                    <PenTool className="w-3 h-3" />
                    <span>{isId ? "Lanjutkan" : "Resume"}</span>
                  </button>
                  <Button
                    type="button"
                    variant="danger_soft"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(draft);
                    }}
                    title={isId ? "Hapus draft" : "Delete draft"}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            className="group text-left p-4 rounded-xl border-2 border-dashed border-stone-300 hover:border-stone-900 hover:bg-stone-50/60 transition-all cursor-pointer flex flex-col gap-2"
          >
            <span className="w-9 h-9 rounded-lg bg-stone-100 text-stone-700 group-hover:bg-stone-900 group-hover:text-white flex items-center justify-center transition-colors">
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
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-4 overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4 min-w-0">
          {/* Standardized Modular Tabs */}
          <Tabs
            activeId={activeTab}
            onChange={setActiveTab}
            mobileColumns={3}
            size="sm"
            className="max-w-full shrink-0"
            items={[
              {
                id: "ALL",
                label: isId ? "Semua Dokumen" : "All Documents",
                icon: <FileText className="w-3.5 h-3.5" />,
                badge: docs.length,
              },
              {
                id: "ACTION_REQUIRED",
                label: isId ? "Perlu Otorisasi" : "Action Required",
                icon: <Inbox className="w-3.5 h-3.5" />,
                badge: stats.pending > 0 ? stats.pending : undefined,
              },
              {
                id: "MY_DOCS",
                label: isId ? "Dokumen Saya" : "My Documents",
                icon: <PenTool className="w-3.5 h-3.5" />,
              },
            ]}
          />

          {/* Standardized Modular Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full 2xl:w-auto flex-1 min-w-full xl:min-w-[660px] justify-end">
            <div className="w-[calc(50%-0.25rem)] sm:w-36 min-w-0 shrink-0">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                icon={<Filter className="w-3.5 h-3.5" />}
              >
                <option value="ALL">{isId ? "Semua Status" : "All Statuses"}</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="REVISION_REQUIRED">Needs Revision</option>
                <option value="APPROVED">Approved</option>
              </Select>
            </div>
            <div className="w-[calc(50%-0.25rem)] sm:w-44 min-w-0 shrink-0">
              <Select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                icon={<Filter className="w-3.5 h-3.5" />}
              >
                <option value="ALL">{isId ? "Semua Departemen" : "All Departments"}</option>
                {ERP_DEPARTMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="w-full sm:w-32 min-w-0 shrink-0">
              <Select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
                icon={<ArrowUpDown className="w-3.5 h-3.5" />}
              >
                <option value="newest">{isId ? "Terbaru" : "Newest"}</option>
                <option value="oldest">{isId ? "Terlama" : "Oldest"}</option>
                <option value="title">{isId ? "Judul A-Z" : "Title A-Z"}</option>
              </Select>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <div className="flex-1 min-w-0">
                <Input
                  type="text"
                  placeholder={isId ? "Cari judul / kode…" : "Search title / code…"}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  icon={<Search className="w-3.5 h-3.5" />}
                />
              </div>

              {/* View toggle */}
              <div className="flex items-center shrink-0 bg-stone-100 p-1 rounded-xl border border-stone-200/80 h-9">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors",
                    viewMode === "grid"
                      ? "bg-white shadow-2xs text-stone-900"
                      : "text-stone-400 hover:text-stone-700",
                  )}
                  title={isId ? "Tampilan kartu" : "Grid view"}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors",
                    viewMode === "list"
                      ? "bg-white shadow-2xs text-stone-900"
                      : "text-stone-400 hover:text-stone-700",
                  )}
                  title={isId ? "Tampilan tabel" : "List view"}
                >
                  <ListIcon className="w-3.5 h-3.5" />
                </button>
              </div>
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
              className="mx-auto cursor-pointer"
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9.5px] font-bold border", deptConfig.badgeColor)}>
                      <ShieldCheck className="w-3 h-3" />
                      <span className="truncate max-w-36">{deptConfig.deptNameId}</span>
                    </span>
                    {doc.revision_note && (
                      <span
                        className="text-[10px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200 italic truncate max-w-full"
                        title={doc.revision_note}
                      >
                        "{doc.revision_note}"
                      </span>
                    )}
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
                        <div className="text-[10px] text-stone-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>
                            {doc.document_type} · {doc.layout_preset}
                          </span>
                          {doc.revision_note && (
                            <span className="text-[10px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 italic truncate max-w-xs">
                              "{doc.revision_note}"
                            </span>
                          )}
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
      {/* 5. UNIFIED DOCUMENT STUDIO (CANVA + DOCX ENGINE)         */}
      {/* ======================================================== */}
      {isStudioOpen && (
        <CanvaStudioEditor
          key={`studio-session-${studioSessionKey}`}
          documentId={editingDocId}
          initialDocumentCode={editingDocCode}
          initialTitle={studioInitialTitle}
          initialDocType={studioInitialDocType}
          initialDepartment={studioInitialDepartment}
          initialAuthRole={studioInitialAuthRole}
          initialAuthDepartment={studioInitialAuthDept}
          initialAuthName={studioInitialAuthName}
          initialBlocks={studioInitialBlocks}
          initialLayoutPreset={studioInitialLayoutPreset}
          initialCustomWidthMm={studioInitialCustomWidthMm}
          initialCustomHeightMm={studioInitialCustomHeightMm}
          initialStatus={studioInitialStatus}
          versions={studioInitialVersions}
          onClone={() => {
            const currentDoc = docs.find((d) => d.id === editingDocId);
            if (currentDoc && isDocOwner(currentDoc)) {
              setIsStudioOpen(false);
              handleCloneDocument(currentDoc);
            }
          }}
          onSave={handleSaveFromStudio}
          onClose={() => {
            setIsStudioOpen(false);
            fetchDocs();
          }}
          isSaving={isSaving}
          isId={isId}
        />
      )}

      <WorkspaceModals
        user={user}
        isId={isId}
        previewDoc={previewDoc}
        setPreviewDoc={setPreviewDoc}
        previewSheetRef={previewSheetRef}
        renderStatusBadge={renderStatusBadge}
        isDocOwner={isDocOwner}
        canApproveDoc={canApproveDoc}
        handleEditExistingDoc={handleEditExistingDoc}
        handleOpenHistory={handleOpenHistory}
        handleCancelSubmission={handleCancelSubmission}
        handleCloneDocument={handleCloneDocument}
        handleArchiveDocument={handleArchiveDocument}
        handleDownloadDocx={handleDownloadDocx}
        handleDownloadPdf={handleDownloadPdf}
        isProcessingAction={isProcessingAction}
        isExportingPreviewPdf={isExportingPreviewPdf}
        authorizeTargetDoc={authorizeTargetDoc}
        setAuthorizeTargetDoc={setAuthorizeTargetDoc}
        approvalNoteInput={approvalNoteInput}
        setApprovalNoteInput={setApprovalNoteInput}
        handleConfirmAuthorizeDocument={handleConfirmAuthorizeDocument}
        reviseTargetDoc={reviseTargetDoc}
        setReviseTargetDoc={setReviseTargetDoc}
        handleConfirmReviseDocument={handleConfirmReviseDocument}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        handleDeleteDocument={handleDeleteDocument}
        historyDoc={historyDoc}
        setHistoryDoc={setHistoryDoc}
        isLoadingHistory={isLoadingHistory}
        versionsList={versionsList}
        eventsList={eventsList}
        restoringVersion={restoringVersion}
        handleRestoreVersion={handleRestoreVersion}
      />
    </div>
  );
}

