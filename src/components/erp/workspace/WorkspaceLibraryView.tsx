import React, { memo } from "react";
import { Button, Input, Select, Tabs } from "@/components/ui";
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
  FilePlus2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Inbox,
  Copy,
  Lock,
  History,
  Download,
} from "lucide-react";
import { DEPARTMENT_ROUTING_CONFIG } from "@/components/erp/workspace/StudioEditor";
import { TargetDepartment, WorkspaceDocument } from "@/types/workspace";
import { ERP_DEPARTMENT_OPTIONS, normalizeDepartmentToRole } from "@/constants/rbac";
import {
  TEMPLATE_PRESETS,
  TEMPLATE_ICONS,
  TEMPLATE_ACCENTS,
  STATUS_META,
  relativeTime,
} from "@/components/erp/workspace/workspacePresets";

export type WorkspaceTabId = "ALL" | "SAVED_DRAFTS" | "ACTION_REQUIRED" | "MY_DOCS";
export type WorkspaceSortMode = "newest" | "oldest" | "title";

export const WorkspaceStatusBadge = memo(function WorkspaceStatusBadge({
  status,
  isId = false,
}: {
  status: string;
  isId?: boolean;
}) {
  const meta = STATUS_META[status] || STATUS_META.DRAFT;
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border", meta.cls)}>
      {isId ? meta.labelId : status.replace(/_/g, " ")}
    </span>
  );
});

export interface WorkspaceQuickStartProps {
  templatesExpanded: boolean;
  onToggleExpand: () => void;
  onLaunchStudio: (templateId?: string) => void;
}

export const WorkspaceQuickStartSection = memo(function WorkspaceQuickStartSection({
  templatesExpanded,
  onToggleExpand,
  onLaunchStudio,
}: WorkspaceQuickStartProps) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl px-4 py-3.5 shadow-2xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-stone-600">
            Quick Start
          </span>
          <span className="text-xs text-stone-400 hidden sm:inline">
            Select a blank canvas or official department template
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          <span>{templatesExpanded ? "Hide Templates" : "Show Templates"}</span>
          {templatesExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {templatesExpanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => onLaunchStudio()}
            className="group text-left p-3.5 rounded-xl border-2 border-dashed border-stone-300 hover:border-stone-900 hover:bg-stone-50/60 transition-all cursor-pointer flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-lg bg-stone-100 text-stone-700 group-hover:bg-stone-900 group-hover:text-white flex items-center justify-center transition-colors">
                <FilePlus2 className="w-4 h-4" />
              </span>
              <span className="text-[10px] font-mono text-stone-400">CUSTOM</span>
            </div>
            <span className="text-xs font-black text-stone-900">Blank Document</span>
            <span className="text-[11px] text-stone-500 leading-snug">
              Clean canvas with Official Letterhead & Sign-off.
            </span>
          </button>

          {TEMPLATE_PRESETS.map((tpl) => {
            const TIcon = TEMPLATE_ICONS[tpl.id] || FileText;
            const accent = TEMPLATE_ACCENTS[tpl.id] || TEMPLATE_ACCENTS.PURCHASING_MEMO;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onLaunchStudio(tpl.id)}
                className={cn(
                  "group text-left p-3.5 rounded-xl border border-stone-200 bg-white transition-all cursor-pointer flex flex-col gap-1.5",
                  accent.hover
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center font-bold", accent.chip)}>
                    <TIcon className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-mono font-bold text-stone-500">
                    {tpl.targetDept}
                  </span>
                </div>
                <span className="text-xs font-black text-stone-900 leading-snug">
                  {tpl.titleEn}
                </span>
                <span className="text-[11px] text-stone-500 leading-snug line-clamp-2">
                  {tpl.descriptionEn}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export interface WorkspaceSavedDraftsBarProps {
  drafts: WorkspaceDocument[];
  isId?: boolean;
  onViewAllDrafts: () => void;
  onEditDraft: (doc: WorkspaceDocument) => void;
  onDeleteDraft: (doc: WorkspaceDocument) => void;
}

export const WorkspaceSavedDraftsBar = memo(function WorkspaceSavedDraftsBar({
  drafts,
  isId = false,
  onViewAllDrafts,
  onEditDraft,
  onDeleteDraft,
}: WorkspaceSavedDraftsBarProps) {
  if (drafts.length === 0) return null;

  return (
    <div className="bg-white text-stone-900 rounded-2xl px-4 py-3.5 border border-stone-200 shadow-2xs space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PenTool className="w-3.5 h-3.5 text-stone-700" />
          <span className="text-xs font-bold tracking-tight text-stone-900">Saved Drafts</span>
          <span className="font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-stone-700">
            {drafts.length}
          </span>
        </div>
        {drafts.length > 3 && (
          <button
            type="button"
            onClick={onViewAllDrafts}
            className="text-[11px] font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <span>View all drafts</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {drafts.slice(0, 3).map((draft) => (
          <div
            key={draft.id}
            onClick={() => onEditDraft(draft)}
            className="group px-3.5 py-2.5 rounded-xl bg-stone-50 hover:bg-stone-100/80 border border-stone-200 hover:border-stone-400 transition-colors cursor-pointer flex items-center justify-between gap-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-stone-500">
                <span className="truncate font-semibold text-stone-700">{draft.document_code}</span>
                <span>·</span>
                <span
                  className={cn(
                    "font-bold px-1.5 py-0.2 rounded border text-[9.5px]",
                    draft.status === "REVISION_REQUIRED"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-amber-50 text-amber-800 border-amber-200"
                  )}
                >
                  {draft.status === "REVISION_REQUIRED" ? "NEEDS REVISION" : "DRAFT"}
                </span>
              </div>
              <div className="text-xs font-bold text-stone-900 truncate mt-1">{draft.title}</div>
              <div className="text-[10px] text-stone-500 tabular-nums mt-0.5">
                Saved {relativeTime(draft.updated_at, isId)} · v{draft.current_version || draft.version || 1}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditDraft(draft);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-800 text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <PenTool className="w-3 h-3" />
                <span>Resume</span>
              </button>
              <Button
                type="button"
                variant="danger_soft"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteDraft(draft);
                }}
                title="Delete draft"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export interface WorkspaceDocActionsProps {
  doc: WorkspaceDocument;
  compact?: boolean;
  isId?: boolean;
  owner: boolean;
  userHasApproveRight: boolean;
  exportingPdfDocId: string | null;
  onOpenPreview: (doc: WorkspaceDocument) => void;
  onAuthorize: (doc: WorkspaceDocument) => void;
  onRevise: (doc: WorkspaceDocument) => void;
  onClone: (doc: WorkspaceDocument) => void;
  onEdit: (doc: WorkspaceDocument) => void;
  onDownloadPdf: (doc: WorkspaceDocument) => void;
  onOpenHistory: (doc: WorkspaceDocument) => void;
  onDelete: (doc: WorkspaceDocument) => void;
}

export const WorkspaceDocActions = memo(function WorkspaceDocActions({
  doc,
  compact,
  isId = false,
  owner,
  userHasApproveRight,
  exportingPdfDocId,
  onOpenPreview,
  onAuthorize,
  onRevise,
  onClone,
  onEdit,
  onDownloadPdf,
  onOpenHistory,
  onDelete,
}: WorkspaceDocActionsProps) {
  const isApproved = doc.status === "APPROVED";
  const isArchived = doc.status === "ARCHIVED";
  const isPending = doc.status === "PENDING_APPROVAL";
  const isDraftOrRevision = doc.status === "DRAFT" || doc.status === "REVISION_REQUIRED";
  const canDelete = isDraftOrRevision && owner;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenPreview(doc);
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
              onAuthorize(doc);
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
              onRevise(doc);
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
            onClone(doc);
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
            onEdit(doc);
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
          onDownloadPdf(doc);
        }}
        disabled={exportingPdfDocId === doc.id}
        className="inline-flex items-center p-1.5 rounded-lg bg-white border border-stone-200 text-stone-600 hover:bg-stone-100 disabled:opacity-50 cursor-pointer transition-colors"
        title={isId ? "Ekspor PDF Presisi" : "Export Precision PDF"}
      >
        <Download className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenHistory(doc);
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
            onDelete(doc);
          }}
          title={isId ? "Hapus dokumen saya" : "Delete my document"}
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
        </Button>
      )}
    </div>
  );
});

export interface WorkspaceLibrarySectionProps {
  activeTab: WorkspaceTabId;
  onTabChange: (tab: WorkspaceTabId) => void;
  totalVisibleCount: number;
  resumableDraftCount: number;
  pendingCount: number;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  departmentFilter: string;
  onDepartmentFilterChange: (dept: string) => void;
  sortMode: WorkspaceSortMode;
  onSortModeChange: (sort: WorkspaceSortMode) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  isLoading: boolean;
  loadError: string | null;
  filteredDocs: WorkspaceDocument[];
  isId?: boolean;
  exportingPdfDocId: string | null;
  isDocOwner: (doc: WorkspaceDocument) => boolean;
  canApproveDoc: (doc: WorkspaceDocument) => boolean;
  onRefresh: () => void;
  onLaunchBlankStudio: () => void;
  onOpenPreview: (doc: WorkspaceDocument) => void;
  onAuthorize: (doc: WorkspaceDocument) => void;
  onRevise: (doc: WorkspaceDocument) => void;
  onClone: (doc: WorkspaceDocument) => void;
  onEdit: (doc: WorkspaceDocument) => void;
  onDownloadPdf: (doc: WorkspaceDocument) => void;
  onOpenHistory: (doc: WorkspaceDocument) => void;
  onDelete: (doc: WorkspaceDocument) => void;
}

export const WorkspaceLibrarySection = memo(function WorkspaceLibrarySection({
  activeTab,
  onTabChange,
  totalVisibleCount,
  resumableDraftCount,
  pendingCount,
  statusFilter,
  onStatusFilterChange,
  departmentFilter,
  onDepartmentFilterChange,
  sortMode,
  onSortModeChange,
  searchQuery,
  onSearchQueryChange,
  viewMode,
  onViewModeChange,
  isLoading,
  loadError,
  filteredDocs,
  isId = false,
  exportingPdfDocId,
  isDocOwner,
  canApproveDoc,
  onRefresh,
  onLaunchBlankStudio,
  onOpenPreview,
  onAuthorize,
  onRevise,
  onClone,
  onEdit,
  onDownloadPdf,
  onOpenHistory,
  onDelete,
}: WorkspaceLibrarySectionProps) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4 overflow-hidden">
      {/* Clean Single-Strip Navigation + Filter Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-stone-100 pb-4">
        <Tabs
          activeId={activeTab}
          onChange={onTabChange}
          mobileColumns={2}
          size="sm"
          className="max-w-full shrink-0"
          items={[
            {
              id: "ALL",
              label: "All Documents",
              icon: <FileText className="w-3.5 h-3.5" />,
              badge: totalVisibleCount,
            },
            {
              id: "SAVED_DRAFTS",
              label: "Saved Drafts",
              icon: <Clock className="w-3.5 h-3.5" />,
              badge: resumableDraftCount > 0 ? resumableDraftCount : undefined,
            },
            {
              id: "ACTION_REQUIRED",
              label: "Action Required",
              icon: <Inbox className="w-3.5 h-3.5" />,
              badge: pendingCount > 0 ? pendingCount : undefined,
            },
            {
              id: "MY_DOCS",
              label: "My Documents",
              icon: <PenTool className="w-3.5 h-3.5" />,
            },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2 flex-1 xl:justify-end">
          <div className="w-[calc(50%-0.25rem)] sm:w-36 shrink-0">
            <Select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              icon={<Filter className="w-3.5 h-3.5" />}
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="REVISION_REQUIRED">Needs Revision</option>
              <option value="APPROVED">Approved</option>
            </Select>
          </div>
          <div className="w-[calc(50%-0.25rem)] sm:w-40 shrink-0">
            <Select
              value={departmentFilter}
              onChange={(e) => onDepartmentFilterChange(e.target.value)}
              icon={<Filter className="w-3.5 h-3.5" />}
            >
              <option value="ALL">All Departments</option>
              {ERP_DEPARTMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-full sm:w-32 shrink-0">
            <Select
              value={sortMode}
              onChange={(e) => onSortModeChange(e.target.value as WorkspaceSortMode)}
              icon={<ArrowUpDown className="w-3.5 h-3.5" />}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title">Title A-Z</option>
            </Select>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
            <div className="flex-1 min-w-0">
              <Input
                type="text"
                placeholder="Search title / code…"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                icon={<Search className="w-3.5 h-3.5" />}
              />
            </div>

            <div className="flex items-center shrink-0 bg-stone-100 p-1 rounded-xl border border-stone-200/80 h-9">
              <button
                type="button"
                onClick={() => onViewModeChange("grid")}
                className={cn(
                  "h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors",
                  viewMode === "grid"
                    ? "bg-white shadow-2xs text-stone-900"
                    : "text-stone-400 hover:text-stone-700"
                )}
                title="Grid view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange("list")}
                className={cn(
                  "h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors",
                  viewMode === "list"
                    ? "bg-white shadow-2xs text-stone-900"
                    : "text-stone-400 hover:text-stone-700"
                )}
                title="List view"
              >
                <ListIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl border border-stone-200 space-y-3 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 bg-stone-200 rounded" />
                <div className="h-5 w-16 bg-stone-200 rounded-full" />
              </div>
              <div className="h-4 w-3/4 bg-stone-200 rounded" />
              <div className="h-3 w-1/2 bg-stone-100 rounded" />
              <div className="h-8 w-full bg-stone-100 rounded-lg" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="py-14 text-center space-y-3">
          <AlertOctagon className="w-10 h-10 text-rose-400 mx-auto" />
          <p className="text-sm font-bold text-stone-700">Failed to load workspace documents</p>
          <p className="text-xs text-stone-500 max-w-md mx-auto">{loadError}</p>
          <Button
            onClick={onRefresh}
            variant="outline"
            className="rounded-xl text-xs font-bold border-stone-300 mx-auto cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </Button>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="py-14 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
            <FileText className="w-7 h-7" />
          </div>
          <p className="text-sm font-bold text-stone-700">No matching documents</p>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Adjust filters or create a new document using the Quick Start templates above.
          </p>
          <Button
            onClick={onLaunchBlankStudio}
            variant="primary"
            className="mx-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Document</span>
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredDocs.map((doc) => {
            const targetDept = normalizeDepartmentToRole(doc.authorization_department) as TargetDepartment;
            const deptConfig = DEPARTMENT_ROUTING_CONFIG[targetDept] || DEPARTMENT_ROUTING_CONFIG.FC;
            const owner = isDocOwner(doc);
            const userHasApproveRight = canApproveDoc(doc);
            return (
              <div
                key={doc.id}
                onClick={() => onOpenPreview(doc)}
                className="group p-4 rounded-xl border border-stone-200 bg-white hover:border-stone-400 transition-colors cursor-pointer flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono tabular-nums text-[11px] font-bold text-stone-500 truncate">
                    {doc.document_code}
                  </span>
                  <WorkspaceStatusBadge status={doc.status} isId={isId} />
                </div>

                <div>
                  <div className="text-sm font-black text-stone-900 leading-snug line-clamp-2">
                    {doc.title}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-1 flex items-center gap-1.5 flex-wrap">
                    <span>{doc.document_type}</span>
                    <span>·</span>
                    <span className="font-medium text-stone-700">{deptConfig.deptNameId}</span>
                    <span>·</span>
                    <span className="font-mono text-[10px]">{doc.layout_preset}</span>
                  </div>
                </div>

                {doc.revision_note && (
                  <div
                    className="text-[11px] text-rose-800 bg-rose-50/70 px-2.5 py-1.5 rounded-lg border border-rose-200 italic line-clamp-2"
                    title={doc.revision_note}
                  >
                    "{doc.revision_note}"
                  </div>
                )}

                <div className="mt-auto pt-2.5 border-t border-stone-100 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-stone-700 truncate">{doc.created_by_name}</div>
                    <div className="text-[10px] text-stone-400 tabular-nums">
                      Updated {relativeTime(doc.updated_at, isId)}
                    </div>
                  </div>
                  <WorkspaceDocActions
                    doc={doc}
                    compact
                    isId={isId}
                    owner={owner}
                    userHasApproveRight={userHasApproveRight}
                    exportingPdfDocId={exportingPdfDocId}
                    onOpenPreview={onOpenPreview}
                    onAuthorize={onAuthorize}
                    onRevise={onRevise}
                    onClone={onClone}
                    onEdit={onEdit}
                    onDownloadPdf={onDownloadPdf}
                    onOpenHistory={onOpenHistory}
                    onDelete={onDelete}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto border border-stone-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-3 pl-4">Code & Title</th>
                <th className="p-3">Routing Target</th>
                <th className="p-3">Author</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredDocs.map((doc) => {
                const targetDept = normalizeDepartmentToRole(doc.authorization_department) as TargetDepartment;
                const deptConfig = DEPARTMENT_ROUTING_CONFIG[targetDept] || DEPARTMENT_ROUTING_CONFIG.FC;
                const owner = isDocOwner(doc);
                const userHasApproveRight = canApproveDoc(doc);
                return (
                  <tr
                    key={doc.id}
                    onClick={() => onOpenPreview(doc)}
                    className="hover:bg-stone-50/70 transition-colors cursor-pointer"
                  >
                    <td className="p-3 pl-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums font-bold text-stone-900 text-xs">
                          {doc.document_code}
                        </span>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {doc.layout_preset}
                        </span>
                      </div>
                      <div className="font-bold text-stone-800 text-xs mt-0.5 line-clamp-1">
                        {doc.title}
                      </div>
                      {doc.revision_note && (
                        <div className="text-[10.5px] text-rose-700 italic mt-0.5 truncate max-w-sm">
                          "{doc.revision_note}"
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-stone-800 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                        <span>{deptConfig.deptNameId}</span>
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5 font-mono">{doc.authorization_role}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-stone-800">{doc.created_by_name}</div>
                      <div className="text-[10px] text-stone-400 tabular-nums">
                        {relativeTime(doc.updated_at, isId)} · {doc.department}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <WorkspaceStatusBadge status={doc.status} isId={isId} />
                    </td>
                    <td className="p-3 pr-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <WorkspaceDocActions
                          doc={doc}
                          isId={isId}
                          owner={owner}
                          userHasApproveRight={userHasApproveRight}
                          exportingPdfDocId={exportingPdfDocId}
                          onOpenPreview={onOpenPreview}
                          onAuthorize={onAuthorize}
                          onRevise={onRevise}
                          onClone={onClone}
                          onEdit={onEdit}
                          onDownloadPdf={onDownloadPdf}
                          onOpenHistory={onOpenHistory}
                          onDelete={onDelete}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
