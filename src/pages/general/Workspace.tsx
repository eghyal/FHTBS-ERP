import React, { useState, useEffect, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import {
  FileText,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  CanvaStudioEditor,
  DEPARTMENT_ROUTING_CONFIG,
  OFFICIAL_KOP_SURAT_BLOCK,
} from "@/components/erp/workspace/StudioEditor";
import { getPaperDimensions } from "@/components/erp/workspace/studio/config";
import { DocumentSheetRenderer } from "@/components/erp/workspace/BlockRenderer";
import { generatePDF } from "@/lib/pdfGenerator";
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
  normalizeDepartmentToRole,
  canUserApproveDepartment,
} from "@/constants/rbac";
import { TEMPLATE_PRESETS } from "@/components/erp/workspace/workspacePresets";
import { WorkspaceModals } from "@/components/erp/workspace/WorkspaceModals";
import {
  WorkspaceStatusBadge,
  WorkspaceQuickStartSection,
  WorkspaceSavedDraftsBar,
  WorkspaceLibrarySection,
} from "@/components/erp/workspace/WorkspaceLibraryView";

export function DocumentWorkspace() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isId = false;

  const [docs, setDocs] = useState<WorkspaceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "SAVED_DRAFTS" | "ACTION_REQUIRED" | "MY_DOCS">("ALL");
  const [templatesExpanded, setTemplatesExpanded] = useState(true);
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

  // Strict per-user ownership check: only the exact creator account can access, edit, continue, clone, or delete private drafts
  const isDocOwner = useCallback(
    (doc: WorkspaceDocument | null | undefined): boolean => {
      if (!doc || !user) return false;
      const currentUsername = String(user.username || "").trim().toLowerCase();
      const docUsername = String(doc.created_by_username || (doc as any).createdByUsername || "").trim().toLowerCase();
      if (
        currentUsername &&
        currentUsername !== "system" &&
        docUsername &&
        docUsername !== "system" &&
        currentUsername === docUsername
      ) {
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

  const isPrivateDraftDoc = useCallback((doc: WorkspaceDocument | null | undefined): boolean => {
    const status = String(doc?.status || "").trim().toUpperCase();
    return status === "DRAFT" || status === "REVISION_REQUIRED";
  }, []);

  // Preview & Authorization Action Modal States
  const [previewDoc, setPreviewDoc] = useState<WorkspaceDocument | null>(null);
  const openPreviewDoc = useCallback(
    (doc: WorkspaceDocument) => {
      if (isPrivateDraftDoc(doc) && !isDocOwner(doc)) {
        showToast(
          isId
            ? "Akses Ditolak: Draft dokumen bersifat privat bagi pembuatnya."
            : "Access Denied: Draft documents are private to their creator.",
          "error"
        );
        return;
      }
      setPreviewDoc(doc);
    },
    [isDocOwner, isPrivateDraftDoc, isId, showToast]
  );
  const [authorizeTargetDoc, setAuthorizeTargetDoc] = useState<WorkspaceDocument | null>(null);
  const [approvalNoteInput, setApprovalNoteInput] = useState("");
  const [reviseTargetDoc, setReviseTargetDoc] = useState<WorkspaceDocument | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isExportingPreviewPdf, setIsExportingPreviewPdf] = useState(false);
  const [exportingPdfDocId, setExportingPdfDocId] = useState<string | null>(null);
  const [offscreenExportDoc, setOffscreenExportDoc] = useState<WorkspaceDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceDocument | null>(null);
  const previewSheetRef = React.useRef<HTMLDivElement | null>(null);
  const offscreenExportRef = React.useRef<HTMLDivElement | null>(null);

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

  // Defense-in-depth: strictly hide non-owner DRAFT and REVISION_REQUIRED documents from all views & counters
  const visibleDocs = useMemo(() => {
    return docs.filter((d) => {
      if (isPrivateDraftDoc(d)) {
        return isDocOwner(d);
      }
      return true;
    });
  }, [docs, isDocOwner, isPrivateDraftDoc]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: visibleDocs.length,
      pending: visibleDocs.filter((d) => d.status === "PENDING_APPROVAL").length,
      draft: visibleDocs.filter((d) => d.status === "DRAFT").length,
      approved: visibleDocs.filter((d) => d.status === "APPROVED").length,
      revision: visibleDocs.filter((d) => d.status === "REVISION_REQUIRED").length,
    };
  }, [visibleDocs]);

  // Filtered + sorted documents list
  const filteredDocs = useMemo(() => {
    let list = visibleDocs;
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
    } else if (activeTab === "SAVED_DRAFTS") {
      list = list.filter(
        (d) => isDocOwner(d) && (d.status === "DRAFT" || d.status === "REVISION_REQUIRED")
      );
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
  }, [visibleDocs, activeTab, statusFilter, departmentFilter, searchQuery, sortMode, user, isDocOwner]);

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
    if (isPrivateDraftDoc(doc) && !isDocOwner(doc)) {
      showToast(
        isId
          ? "Akses Ditolak: Draft dokumen bersifat privat bagi pembuatnya."
          : "Access Denied: Draft documents are private to their creator.",
        "error"
      );
      return;
    }
    setHistoryDoc(doc);
    setIsLoadingHistory(true);
    try {
      const [verRes, evtRes] = await Promise.all([
        apiFetch(`/api/workspace-documents/${doc.id}/versions`, {}, user?.username),
        apiFetch(`/api/workspace-documents/${doc.id}/events`, {}, user?.username),
      ]);
      if (!verRes.ok || !evtRes.ok) {
        showToast(verRes.error || evtRes.error || "Forbidden: Cannot view document history", "error");
        setHistoryDoc(null);
        return;
      }
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
    if (isPrivateDraftDoc(doc) && !isDocOwner(doc)) {
      showToast(
        isId
          ? "Akses Ditolak: Draft dokumen bersifat privat bagi pembuatnya."
          : "Access Denied: Draft documents are private to their creator.",
        "error"
      );
      return;
    }
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

  // Export High-Resolution 300-DPI Multi-Page Precision PDF (1:1 Edit = Preview = Export)
  const handleDownloadPdf = async (doc: WorkspaceDocument) => {
    if (isPrivateDraftDoc(doc) && !isDocOwner(doc)) {
      showToast(
        isId
          ? "Akses Ditolak: Draft dokumen bersifat privat bagi pembuatnya."
          : "Access Denied: Draft documents are private to their creator.",
        "error"
      );
      return;
    }
    const safeCode = (doc.document_code || doc.docNumber || doc.id).replace(/[^a-zA-Z0-9-_]/g, "_");
    const filename = `${safeCode}_v${doc.current_version || doc.version || 1}.pdf`;
    const preset = doc.layout_preset || "A4_PORTRAIT";
    const paperDims = getPaperDimensions(preset, doc.custom_width_mm, doc.custom_height_mm);

    if (previewSheetRef.current && previewDoc?.id === doc.id) {
      try {
        setIsExportingPreviewPdf(true);
        setExportingPdfDocId(doc.id);
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
        console.error("Preview PDF capture failed:", err);
      } finally {
        setIsExportingPreviewPdf(false);
        setExportingPdfDocId(null);
      }
    }

    // Precision offscreen multi-page Editor sheet capture when triggered directly from Document List
    try {
      setIsExportingPreviewPdf(true);
      setExportingPdfDocId(doc.id);
      setOffscreenExportDoc(doc);
      // Allow offscreen DocumentSheetRenderer + ResizeObserver pagination + web fonts/QR to settle
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 340));

      if (offscreenExportRef.current) {
        await generatePDF(offscreenExportRef.current, filename, {
          orientation: paperDims.orientation,
          format: [paperDims.widthMm, paperDims.heightMm],
          marginMm: 0,
        });
        showToast(
          isId ? `PDF Presisi (${filename}) berhasil diunduh.` : `Precision PDF (${filename}) downloaded.`,
          "success"
        );
        return;
      }
    } catch (err) {
      console.error("Offscreen precision PDF capture fallback:", err);
    } finally {
      setOffscreenExportDoc(null);
      setIsExportingPreviewPdf(false);
      setExportingPdfDocId(null);
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

  const renderStatusBadge = useCallback(
    (status: string) => <WorkspaceStatusBadge status={status} isId={isId} />,
    [isId]
  );

  const handleToggleTemplates = useCallback(() => {
    setTemplatesExpanded((prev) => !prev);
  }, []);

  const handleViewAllDrafts = useCallback(() => {
    setActiveTab("SAVED_DRAFTS");
  }, []);

  const handleLaunchBlankStudio = useCallback(() => {
    handleLaunchStudio();
  }, [handleLaunchStudio]);

  return (
    <div className="space-y-4 pb-20 animate-in fade-in duration-300">
      {/* 1. Compact Workspace Top Header */}
      <PageHeader
        title="Document Workspace Studio"
        subtitle={`Official ERP templates · ${stats.total} total · ${stats.pending} pending authorization`}
        icon={<FileText className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2 shrink-0">
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
              className="whitespace-nowrap shrink-0"
            >
              Import .DOCX
            </Button>
            <Button
              size="sm"
              onClick={handleLaunchBlankStudio}
              leftIcon={<Plus className="w-4 h-4" />}
              className="whitespace-nowrap shrink-0"
            >
              New Document
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={fetchDocs}
              disabled={isLoading}
              title="Refresh Documents"
              aria-label="Refresh Documents"
              className="shrink-0"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {/* 2. Quick Start Template Cards */}
      <WorkspaceQuickStartSection
        templatesExpanded={templatesExpanded}
        onToggleExpand={handleToggleTemplates}
        onLaunchStudio={handleLaunchStudio}
      />

      {/* 3. Concise Saved Drafts Resume Bar */}
      <WorkspaceSavedDraftsBar
        drafts={myResumableDrafts}
        isId={isId}
        onViewAllDrafts={handleViewAllDrafts}
        onEditDraft={handleEditExistingDoc}
        onDeleteDraft={setDeleteTarget}
      />

      {/* 4. Tabbed Document Library */}
      <WorkspaceLibrarySection
        activeTab={activeTab}
        onTabChange={setActiveTab}
        totalVisibleCount={visibleDocs.length}
        resumableDraftCount={myResumableDrafts.length}
        pendingCount={stats.pending}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        departmentFilter={departmentFilter}
        onDepartmentFilterChange={setDepartmentFilter}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isLoading={isLoading}
        loadError={loadError}
        filteredDocs={filteredDocs}
        isId={isId}
        exportingPdfDocId={exportingPdfDocId}
        isDocOwner={isDocOwner}
        canApproveDoc={canApproveDoc}
        onRefresh={fetchDocs}
        onLaunchBlankStudio={handleLaunchBlankStudio}
        onOpenPreview={openPreviewDoc}
        onAuthorize={setAuthorizeTargetDoc}
        onRevise={setReviseTargetDoc}
        onClone={handleCloneDocument}
        onEdit={handleEditExistingDoc}
        onDownloadPdf={handleDownloadPdf}
        onOpenHistory={handleOpenHistory}
        onDelete={setDeleteTarget}
      />

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

      {/* Offscreen Multi-Page Editor Sheet Renderer for direct Document List PDF Export */}
      {offscreenExportDoc && (
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            left: "-20000px",
            top: 0,
            pointerEvents: "none",
            zIndex: -99999,
          }}
        >
          <DocumentSheetRenderer
            ref={offscreenExportRef}
            blocks={offscreenExportDoc.content || []}
            layoutPreset={offscreenExportDoc.layout_preset || "A4_PORTRAIT"}
            customWidthMm={offscreenExportDoc.custom_width_mm}
            customHeightMm={offscreenExportDoc.custom_height_mm}
            documentStatus={offscreenExportDoc.status}
            documentCode={offscreenExportDoc.document_code}
            documentId={offscreenExportDoc.id}
            docType={offscreenExportDoc.document_type}
            department={offscreenExportDoc.department}
            createdByName={offscreenExportDoc.created_by_name}
            approvedByName={
              offscreenExportDoc.approved_by || offscreenExportDoc.approvedBy || undefined
            }
            approvedAt={
              offscreenExportDoc.approved_at || offscreenExportDoc.approvedAt || undefined
            }
          />
        </div>
      )}
    </div>
  );
}

