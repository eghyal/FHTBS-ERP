import React from "react";
import {
  AlertOctagon,
  Archive,
  Copy,
  Download,
  FileText,
  History,
  PenTool,
  Printer,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ReviseDocModal } from "@/components/erp/ReviseDocModal";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { DocumentSheetRenderer } from "@/components/erp/workspace/BlockRenderer";
import { getDailyAuthKey } from "@/utils/auth";
import {
  WorkspaceDocument,
  WorkspaceDocumentVersion,
  WorkspaceDocumentEvent,
} from "@/types/workspace";

export interface WorkspaceModalsProps {
  user: any;
  isId: boolean;
  previewDoc: WorkspaceDocument | null;
  setPreviewDoc: React.Dispatch<React.SetStateAction<WorkspaceDocument | null>>;
  previewSheetRef: React.RefObject<HTMLDivElement | null>;
  renderStatusBadge: (status: string) => React.ReactNode;
  isDocOwner: (doc: WorkspaceDocument | null | undefined) => boolean;
  canApproveDoc: (doc: WorkspaceDocument | null) => boolean;
  handleEditExistingDoc: (doc: WorkspaceDocument) => void;
  handleOpenHistory: (doc: WorkspaceDocument) => void;
  handleCancelSubmission: (doc: WorkspaceDocument) => void;
  handleCloneDocument: (doc: WorkspaceDocument) => void;
  handleArchiveDocument: (doc: WorkspaceDocument) => void;
  handleDownloadDocx: (doc: WorkspaceDocument) => void;
  handleDownloadPdf: (doc: WorkspaceDocument) => void;
  isProcessingAction: boolean;
  isExportingPreviewPdf: boolean;

  // Authorize Modal
  authorizeTargetDoc: WorkspaceDocument | null;
  setAuthorizeTargetDoc: React.Dispatch<
    React.SetStateAction<WorkspaceDocument | null>
  >;
  approvalNoteInput: string;
  setApprovalNoteInput: React.Dispatch<React.SetStateAction<string>>;
  handleConfirmAuthorizeDocument: (pin: string) => void;

  // Revise Modal
  reviseTargetDoc: WorkspaceDocument | null;
  setReviseTargetDoc: React.Dispatch<
    React.SetStateAction<WorkspaceDocument | null>
  >;
  handleConfirmReviseDocument: (note: string) => void;

  // Delete Confirm Modal
  deleteTarget: WorkspaceDocument | null;
  setDeleteTarget: React.Dispatch<React.SetStateAction<WorkspaceDocument | null>>;
  handleDeleteDocument: () => void;

  // Version History & Audit Trail Modal
  historyDoc: WorkspaceDocument | null;
  setHistoryDoc: React.Dispatch<React.SetStateAction<WorkspaceDocument | null>>;
  isLoadingHistory: boolean;
  versionsList: WorkspaceDocumentVersion[];
  eventsList: WorkspaceDocumentEvent[];
  restoringVersion: number | null;
  handleRestoreVersion: (docId: string, versionNumber: number) => void;
}

export const WorkspaceModals = React.memo(function WorkspaceModals({
  user,
  isId,
  previewDoc,
  setPreviewDoc,
  previewSheetRef,
  renderStatusBadge,
  isDocOwner,
  canApproveDoc,
  handleEditExistingDoc,
  handleOpenHistory,
  handleCancelSubmission,
  handleCloneDocument,
  handleArchiveDocument,
  handleDownloadDocx,
  handleDownloadPdf,
  isProcessingAction,
  isExportingPreviewPdf,
  authorizeTargetDoc,
  setAuthorizeTargetDoc,
  approvalNoteInput,
  setApprovalNoteInput,
  handleConfirmAuthorizeDocument,
  reviseTargetDoc,
  setReviseTargetDoc,
  handleConfirmReviseDocument,
  deleteTarget,
  setDeleteTarget,
  handleDeleteDocument,
  historyDoc,
  setHistoryDoc,
  isLoadingHistory,
  versionsList,
  eventsList,
  restoringVersion,
  handleRestoreVersion,
}: WorkspaceModalsProps) {
  return (
    <>
      {/* ======================================================== */}
      {/* 6. HIGH-FIDELITY DOCUMENT PREVIEW & APPROVAL MODAL       */}
      {/* ======================================================== */}
      <Modal
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        maxWidth="5xl"
        contentClassName="p-0 flex flex-col h-[85vh] bg-stone-100 border-t border-stone-100"
        title={
          previewDoc && (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-stone-900 text-white rounded-xl">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-stone-900 truncate max-w-md">
                    {previewDoc.title}
                  </h3>
                  {renderStatusBadge(previewDoc.status)}
                </div>
                <p className="text-xs text-stone-500 font-mono">
                  {previewDoc.document_code} • {previewDoc.document_type} •{" "}
                  {isId ? "Tujuan Otorisasi:" : "Target Route:"}{" "}
                  <b className="text-stone-800">
                    {previewDoc.authorization_department || "PURCHASING"}
                  </b>
                </p>
              </div>
            </div>
          )
        }
      >
        {previewDoc && (
          <>
            {/* Scrollable Preview Body (Standard ERP Gray Backdrop + A4 Print Sheet) */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-6 bg-stone-50 space-y-4 custom-scrollbar">
              {/* Revision Note Alert (For Staff & Approvers when revision note exists) */}
              {previewDoc.revision_note && (
                <div className="max-w-[794px] mx-auto p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs flex items-start justify-between gap-4 shadow-2xs">
                  <div className="space-y-1">
                    <div className="font-bold text-rose-900 flex items-center gap-1.5">
                      <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        {isId
                          ? "Catatan Revisi dari Pejabat Otorisasi:"
                          : "Revision Note from Approver:"}
                      </span>
                    </div>
                    <div className="text-rose-800 font-medium leading-relaxed">
                      &quot;{previewDoc.revision_note}&quot;
                    </div>
                  </div>
                  {previewDoc.status !== "APPROVED" &&
                    isDocOwner(previewDoc) && (
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={() => {
                          const docToEdit = previewDoc;
                          setPreviewDoc(null);
                          handleEditExistingDoc(docToEdit);
                        }}
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        {isId ? "Perbaiki di Studio" : "Edit & Resubmit"}
                      </Button>
                    )}
                </div>
              )}

              {/* Crisp 1:1 ERP Print Sheet Preview (Captured by generatePDF at 300 DPI) */}
              <PdfPreviewWrapper>
                <DocumentSheetRenderer
                  ref={previewSheetRef}
                  blocks={previewDoc.content || []}
                  layoutPreset={previewDoc.layout_preset || "A4_PORTRAIT"}
                  customWidthMm={previewDoc.custom_width_mm}
                  customHeightMm={previewDoc.custom_height_mm}
                  documentStatus={previewDoc.status}
                  documentCode={previewDoc.document_code}
                  documentId={previewDoc.id}
                  docType={previewDoc.document_type}
                  department={previewDoc.department}
                  createdByName={previewDoc.created_by_name}
                  approvedByName={
                    previewDoc.approved_by || previewDoc.approvedBy || undefined
                  }
                  approvedAt={
                    previewDoc.approved_at || previewDoc.approvedAt || undefined
                  }
                  signerChain={previewDoc.signer_chain}
                />
              </PdfPreviewWrapper>
            </div>

            {/* Standardized Bottom Action Bar */}
            <div className="p-4 sm:p-6 border-t border-stone-100 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span>
                  {isId ? "Pembuat:" : "Author:"}{" "}
                  <b className="text-stone-900">{previewDoc.created_by_name}</b>{" "}
                  ({previewDoc.department})
                </span>
                <span className="text-stone-300">|</span>
                <span className="font-mono text-[11px]">
                  v{previewDoc.current_version || previewDoc.version || 1} •{" "}
                  {previewDoc.layout_preset || "A4_PORTRAIT"}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => handleOpenHistory(previewDoc)}
                  leftIcon={<History className="w-3.5 h-3.5" />}
                >
                  {isId ? "Riwayat Versi" : "Version History"}
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {/* Pending Approval Actions for Manager / Approver */}
                {previewDoc.status === "PENDING_APPROVAL" &&
                  canApproveDoc(previewDoc) && (
                    <>
                      <Button
                        action="authorize"
                        onClick={() => setAuthorizeTargetDoc(previewDoc)}
                        disabled={isProcessingAction}
                        className="px-6 shadow-md"
                      >
                        {isId ? "Authorize Document" : "Authorize Document"}
                      </Button>
                      <Button
                        action="revise"
                        onClick={() => setReviseTargetDoc(previewDoc)}
                        disabled={isProcessingAction}
                        className="px-5"
                      >
                        {isId ? "Revise" : "Revise"}
                      </Button>
                    </>
                  )}

                {/* Pending Approval Revert for Document Creator */}
                {previewDoc.status === "PENDING_APPROVAL" &&
                  isDocOwner(previewDoc) && (
                    <Button
                      variant="outline"
                      onClick={() => handleCancelSubmission(previewDoc)}
                      disabled={isProcessingAction}
                      leftIcon={<Undo2 className="w-4 h-4" />}
                    >
                      {isId ? "Tarik ke Draft" : "Revert to Draft"}
                    </Button>
                  )}

                {/* Draft / Revision Edit in Studio for Document Creator */}
                {(previewDoc.status === "DRAFT" ||
                  previewDoc.status === "REVISION_REQUIRED") &&
                  isDocOwner(previewDoc) && (
                    <Button
                      variant="primary"
                      onClick={() => {
                        const docToEdit = previewDoc;
                        setPreviewDoc(null);
                        handleEditExistingDoc(docToEdit);
                      }}
                      leftIcon={<PenTool className="w-4 h-4" />}
                    >
                      {previewDoc.status === "REVISION_REQUIRED"
                        ? isId
                          ? "Perbaiki & Ajukan Ulang"
                          : "Edit & Resubmit"
                        : isId
                          ? "Lanjutkan di Studio"
                          : "Continue in Studio"}
                    </Button>
                  )}

                {/* Approved Actions: Clone Revision & Archive */}
                {previewDoc.status === "APPROVED" && isDocOwner(previewDoc) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const docToClone = previewDoc;
                      setPreviewDoc(null);
                      handleCloneDocument(docToClone);
                    }}
                    leftIcon={<Copy className="w-4 h-4" />}
                  >
                    {isId ? "Buat Revisi" : "Clone Revision"}
                  </Button>
                )}
                {previewDoc.status === "APPROVED" &&
                  canApproveDoc(previewDoc) && (
                    <Button
                      variant="amber_soft"
                      size="sm"
                      onClick={() => handleArchiveDocument(previewDoc)}
                      disabled={isProcessingAction}
                      leftIcon={<Archive className="w-3.5 h-3.5" />}
                    >
                      {isId ? "Arsipkan" : "Archive"}
                    </Button>
                  )}

                {/* Export DOCX & Export PDF (A4) */}
                <Button
                  variant="outline"
                  onClick={() => handleDownloadDocx(previewDoc)}
                  leftIcon={<Download className="w-4 h-4" />}
                >
                  .DOCX
                </Button>
                <Button
                  variant="dark"
                  onClick={() => handleDownloadPdf(previewDoc)}
                  disabled={isExportingPreviewPdf}
                  leftIcon={<Printer className="w-4 h-4" />}
                  className="px-6 shadow-md"
                >
                  {isExportingPreviewPdf ? "Generating PDF..." : "Export PDF"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPreviewDoc(null)}
                  className="px-6"
                >
                  {isId ? "Tutup" : "Close"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* ======================================================== */}
      {/* 7A. STANDARD ERP AUTHORIZE MODAL (6-DIGIT DAILY KEY)     */}
      {/* ======================================================== */}
      <AuthorizeDocModal
        isOpen={!!authorizeTargetDoc}
        onClose={() => {
          setAuthorizeTargetDoc(null);
          setApprovalNoteInput("");
        }}
        docType={authorizeTargetDoc?.document_type || "Workspace Document"}
        docNumber={authorizeTargetDoc?.document_code || ""}
        subtitle={
          authorizeTargetDoc
            ? `${authorizeTargetDoc.title} • ROUTING: ${authorizeTargetDoc.authorization_department || "PURCHASING"}`
            : undefined
        }
        status={authorizeTargetDoc?.status || "PENDING_APPROVAL"}
        partnerLabel={isId ? "Dibuat Oleh (Staf)" : "Created By (Staff)"}
        partnerName={
          authorizeTargetDoc
            ? `${authorizeTargetDoc.created_by_name} (${authorizeTargetDoc.department})`
            : undefined
        }
        projectName={
          authorizeTargetDoc
            ? `Target: ${authorizeTargetDoc.authorization_department}`
            : undefined
        }
        isSubmitting={isProcessingAction}
        onAuthorize={handleConfirmAuthorizeDocument}
        submitLabel={
          isId
            ? "Otorisasi & Sahkan Dokumen"
            : "Authorize & Release Document"
        }
      >
        <div className="space-y-3">
          {user?.username && (
            <div className="p-3 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                  {isId
                    ? "Kunci Otorisasi Harian Anda (Aktif Hari Ini)"
                    : "Your Active Daily Auth Key"}
                </span>
                <span className="text-[11px] text-stone-600">
                  {isId
                    ? "Ketik 6 digit kunci di bawah pada kolom verifikasi untuk mengesahkan dokumen."
                    : "Enter this 6-digit daily key below to digitally sign and release."}
                </span>
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-white border border-stone-300 font-mono text-sm font-black tracking-widest text-stone-900 select-all">
                {getDailyAuthKey(user.username)}
              </span>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block mb-1">
              {isId
                ? "Catatan Persetujuan Pejabat (Opsional)"
                : "Approver Endorsement Note (Optional)"}
            </label>
            <input
              type="text"
              value={approvalNoteInput}
              onChange={(e) => setApprovalNoteInput(e.target.value)}
              placeholder={
                isId
                  ? "Mis: Disetujui sesuai plafon anggaran kuartal berjalan..."
                  : "E.g., Approved in accordance with quarterly budget..."
              }
              className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-800 outline-none focus:border-stone-900"
            />
          </div>
        </div>
      </AuthorizeDocModal>

      {/* ======================================================== */}
      {/* 7B. STANDARD ERP REVISE MODAL (MANAGER NOTES FOR STAFF)  */}
      {/* ======================================================== */}
      <ReviseDocModal
        isOpen={!!reviseTargetDoc}
        onClose={() => setReviseTargetDoc(null)}
        docType={reviseTargetDoc?.document_type || "Workspace Document"}
        docNumber={reviseTargetDoc?.document_code || ""}
        subtitle={
          isId
            ? "KEMBALIKAN KE STAF PEMBUAT UNTUK PERBAIKAN / REVISI"
            : "RETURN TO AUTHOR FOR REVISION"
        }
        status={reviseTargetDoc?.status || "PENDING_APPROVAL"}
        partnerLabel={isId ? "Staf Pembuat" : "Document Author"}
        partnerName={
          reviseTargetDoc
            ? `${reviseTargetDoc.created_by_name} (${reviseTargetDoc.department})`
            : undefined
        }
        projectName={reviseTargetDoc?.title}
        isSubmitting={isProcessingAction}
        onRevise={handleConfirmReviseDocument}
      />

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

      {/* ======================================================== */}
      {/* 9. VERSION HISTORY, SNAPSHOT RESTORE & AUDIT TRAIL MODAL */}
      {/* ======================================================== */}
      <Modal
        isOpen={!!historyDoc}
        onClose={() => setHistoryDoc(null)}
        maxWidth="3xl"
        title={
          historyDoc && (
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-amber-700" />
              <span className="font-bold text-stone-900 text-sm">
                {isId
                  ? "Riwayat Versi & Jejak Audit Immutable:"
                  : "Version History & Immutable Audit Trail:"}{" "}
                {historyDoc.document_code}
              </span>
            </div>
          )
        }
      >
        {historyDoc && (
          <div className="space-y-6 text-xs">
            {isLoadingHistory ? (
              <div className="py-12 text-center text-stone-500">
                {isId
                  ? "Memuat snapshot versi & log audit..."
                  : "Loading version snapshots & audit logs..."}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Snapshot Versions Column */}
                <div className="space-y-2.5">
                  <h4 className="font-black text-stone-900 uppercase tracking-wider text-[11px] border-b border-stone-200 pb-1.5">
                    {isId
                      ? "Snapshot Versi Dokumen"
                      : "Document Version Snapshots"}{" "}
                    ({versionsList.length})
                  </h4>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {versionsList.map((ver) => (
                      <div
                        key={ver.id || ver.version}
                        className="p-3 rounded-xl border border-stone-200 bg-stone-50 flex items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-stone-200/80 text-stone-900 border border-stone-300 font-mono font-bold text-[10px]">
                              v{ver.version}
                            </span>
                            <span className="font-bold text-stone-800 truncate">
                              {ver.changeSummary ||
                                ver.change_summary ||
                                "Document Snapshot"}
                            </span>
                          </div>
                          <div className="text-[10px] text-stone-500">
                            {ver.createdByName || ver.created_by_username} •{" "}
                            {new Date(
                              ver.createdAt || ver.created_at,
                            ).toLocaleString("en-GB")}
                          </div>
                          {(ver.contentHash || ver.file_hash) && (
                            <div className="text-[9px] font-mono text-stone-400 truncate">
                              SHA-256:{" "}
                              {(ver.contentHash || ver.file_hash || "").slice(
                                0,
                                16,
                              )}
                              ...
                            </div>
                          )}
                        </div>
                        {historyDoc.status !== "APPROVED" &&
                          historyDoc.status !== "ARCHIVED" &&
                          isDocOwner(historyDoc) && (
                            <button
                              type="button"
                              disabled={restoringVersion === ver.version}
                              onClick={() =>
                                handleRestoreVersion(historyDoc.id, ver.version)
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-stone-800 font-bold text-[10px] shrink-0 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3 text-stone-700" />
                              <span>
                                {restoringVersion === ver.version
                                  ? "..."
                                  : "Restore"}
                              </span>
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Immutable Audit Events Column */}
                <div className="space-y-2.5">
                  <h4 className="font-black text-stone-900 uppercase tracking-wider text-[11px] border-b border-stone-200 pb-1.5">
                    Transactional Audit Trail ({eventsList.length})
                  </h4>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {eventsList.map((evt) => (
                      <div
                        key={evt.id}
                        className="p-2.5 rounded-xl border border-stone-200 bg-white space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-800 border border-stone-200">
                            {evt.eventType || evt.event_type}
                          </span>
                          <span className="text-[10px] text-stone-400">
                            {new Date(
                              evt.createdAt || evt.created_at,
                            ).toLocaleString("en-GB")}
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-stone-800">
                          {evt.actorName || evt.actor_username}{" "}
                          <span className="text-stone-500 font-normal">
                            ({evt.actorRole || evt.actor_role})
                          </span>
                        </div>
                        {(evt.previousStatus ||
                          evt.from_status ||
                          evt.nextStatus ||
                          evt.to_status) && (
                          <div className="text-[10px] font-mono text-emerald-700">
                            {evt.previousStatus || evt.from_status || "NONE"} →{" "}
                            {evt.nextStatus ||
                              evt.to_status ||
                              evt.previousStatus}
                          </div>
                        )}
                        {(evt.notes || evt.note) && (
                          <div className="text-[10px] text-stone-600 italic">
                            {evt.notes || evt.note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
});
