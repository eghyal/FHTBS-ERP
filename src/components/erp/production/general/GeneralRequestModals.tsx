import React from "react";
import { AlertTriangle, Download, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { ReviseDocModal } from "@/components/erp/ReviseDocModal";
import { BomRegistrySearchModal } from "@/components/erp/production/modals/BomSearchModal";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { getDepartmentLabel } from "@/constants/rbac";

export interface GeneralRequestModalsProps {
  printRef: React.RefObject<HTMLDivElement | null>;
  searchModal: {
    isOpen: boolean;
    rowId: string | null;
  };
  setSearchModal: React.Dispatch<
    React.SetStateAction<{
      isOpen: boolean;
      rowId: string | null;
    }>
  >;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  isSearching: boolean;
  searchResults: any[];
  selectItemFromSearch: (item: any) => void;

  // Authorize & Revise Modals
  showAuthorizeModal: boolean;
  setShowAuthorizeModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedPrToAuth: any;
  isSubmitting: boolean;
  handleAuthorizePr: (pin: string) => void;
  showReviseModal: boolean;
  setShowReviseModal: React.Dispatch<React.SetStateAction<boolean>>;
  handleRevisePr: (note: string) => void;

  // Preview A4 Modal
  showPreviewModal: boolean;
  setShowPreviewModal: React.Dispatch<React.SetStateAction<boolean>>;
  previewPrData: any;
  handleExportPDF: () => void;

  // PR Preview / Revise Setup Modal
  showPrModal: boolean;
  setShowPrModal: React.Dispatch<React.SetStateAction<boolean>>;
  revisingPr: any;
  setRevisingPr: React.Dispatch<React.SetStateAction<any>>;
  selectedDepartment: string;
  urgency: "NORMAL" | "URGENT" | "CRITICAL";
  setUrgency: React.Dispatch<
    React.SetStateAction<"NORMAL" | "URGENT" | "CRITICAL">
  >;
  bomRows: any[];
  setBomRows: (rows: any) => void;
  handleSubmitPr: () => void;

  // Confirm Modal
  confirmModal: {
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  };
  setConfirmModal: React.Dispatch<
    React.SetStateAction<{
      isOpen: boolean;
      title: string;
      message: string;
      action: () => void;
    }>
  >;
}

export const GeneralRequestModals = React.memo(function GeneralRequestModals({
  printRef,
  searchModal,
  setSearchModal,
  searchTerm,
  setSearchTerm,
  isSearching,
  searchResults,
  selectItemFromSearch,
  showAuthorizeModal,
  setShowAuthorizeModal,
  selectedPrToAuth,
  isSubmitting,
  handleAuthorizePr,
  showReviseModal,
  setShowReviseModal,
  handleRevisePr,
  showPreviewModal,
  setShowPreviewModal,
  previewPrData,
  handleExportPDF,
  showPrModal,
  setShowPrModal,
  revisingPr,
  setRevisingPr,
  selectedDepartment,
  urgency,
  setUrgency,
  bomRows,
  setBomRows,
  handleSubmitPr,
  confirmModal,
  setConfirmModal,
}: GeneralRequestModalsProps) {
  return (
    <>
      {/* Registry Database Search Modal (Identical to Engineering BOM Search Modal) */}
      <BomRegistrySearchModal
        isOpen={searchModal.isOpen}
        onClose={() => {
          setSearchModal({ isOpen: false, rowId: null });
          setSearchTerm("");
        }}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isSearching={isSearching}
        searchResults={searchResults}
        selectItemFromSearch={selectItemFromSearch}
        title="Non-FG Registry Database Search (SSOT)"
      />

      {/* Authorize Modal (Identical to Design Requests) */}
      <AuthorizeDocModal
        isOpen={showAuthorizeModal && !!selectedPrToAuth}
        onClose={() => setShowAuthorizeModal(false)}
        docType="Purchase Request"
        docNumber={selectedPrToAuth?.pr_number || ""}
        status={selectedPrToAuth?.status || "DRAFTED"}
        projectName={selectedPrToAuth?.title || selectedPrToAuth?.project_name}
        partnerLabel="Department"
        partnerName={
          selectedPrToAuth?.department
            ? getDepartmentLabel(selectedPrToAuth.department)
            : undefined
        }
        amount={selectedPrToAuth?.total_estimated_cost}
        isSubmitting={isSubmitting}
        onAuthorize={handleAuthorizePr}
      />

      {/* Revise Modal (Identical to Design Requests) */}
      <ReviseDocModal
        isOpen={showReviseModal && !!selectedPrToAuth}
        onClose={() => setShowReviseModal(false)}
        docType="Purchase Request"
        docNumber={selectedPrToAuth?.pr_number || ""}
        status={selectedPrToAuth?.status || "DRAFTED"}
        projectName={selectedPrToAuth?.title || selectedPrToAuth?.project_name}
        isSubmitting={isSubmitting}
        onRevise={handleRevisePr}
      />

      {/* Preview Modal with A4 PrintTemplate & QR Signatures (Identical to Design Requests) */}
      <Modal
        isOpen={showPreviewModal && !!previewPrData}
        onClose={() => setShowPreviewModal(false)}
        title="Purchase Request Document"
        maxWidth="5xl"
        contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
      >
        {previewPrData && (
          <>
            <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
              <PdfPreviewWrapper>
                <PrintTemplate
                  ref={printRef}
                  documentTitleId="PURCHASE REQUEST"
                  documentTitleEn="PURCHASE REQUEST"
                  documentNameId="purchase request"
                  documentNameEn="purchase request"
                  date={
                    previewPrData.created_at
                      ? new Date(previewPrData.created_at).toLocaleDateString(
                          "en-US",
                          {
                            timeZone: "Asia/Jakarta",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          },
                        )
                      : ""
                  }
                  referenceNumber={previewPrData.pr_number}
                  documentId={previewPrData.pr_number || previewPrData.id}
                  isDraft={previewPrData.status === "DRAFTED"}
                >
                  {/* PR Document Header matching Design Requests */}
                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2">
                        Department Assignment
                      </div>
                      <div className="text-xl font-black text-stone-900 uppercase flex items-center gap-2 flex-wrap">
                        {previewPrData.category && (
                          <span className="px-2.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 rounded-md border border-amber-200 font-bold uppercase">
                            {previewPrData.category}
                          </span>
                        )}
                        <span>{previewPrData.project_name}</span>
                      </div>
                      <div className="text-xs text-stone-600 mt-2 font-bold">
                        {getDepartmentLabel(
                          previewPrData.department || "PRODUCTION",
                        )}{" "}
                        · Material Requisition
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2">
                        Document References
                      </div>
                      <div className="text-base font-black text-stone-900 font-mono">
                        Dept:{" "}
                        {getDepartmentLabel(
                          previewPrData.department || "PRODUCTION",
                        )}
                      </div>
                      {previewPrData.created_by && (
                        <div className="text-xs font-bold text-stone-800 font-mono mt-0.5">
                          Req By: {previewPrData.created_by}
                        </div>
                      )}
                      {previewPrData.urgency &&
                        previewPrData.urgency !== "NORMAL" && (
                          <div className="text-xs font-extrabold text-rose-600 uppercase tracking-wider mt-1">
                            {previewPrData.urgency} PRIORITY REQUEST
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Drawing / Specification Reference Area */}
                  <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200">
                    <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-1">
                      Specification &amp; Reference Drawing
                    </div>
                    <div className="text-sm font-black text-stone-900 tracking-tight leading-tight uppercase">
                      <span className="text-stone-500 font-normal text-xs mr-2">
                        Reference Drawing:
                      </span>
                      <span className="font-mono text-stone-900">
                        {previewPrData.drawing_reference &&
                        previewPrData.drawing_reference !==
                          "Terlampir dalam sistem" &&
                        previewPrData.drawing_reference !==
                          "TERLAMPIR DALAM SISTEM"
                          ? previewPrData.drawing_reference
                          : "Attached in System"}
                      </span>
                    </div>
                  </div>

                  {/* Material Items Table */}
                  <div className="flex-1 w-full">
                    <div className="text-sm text-stone-900 uppercase tracking-widest font-black mb-3 ml-1">
                      Requested Material Specifications
                    </div>
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-stone-300 bg-white">
                          <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-xs">
                            Item Code &amp; Description
                          </th>
                          <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-28">
                            Quantity
                          </th>
                          <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-24">
                            UOM
                          </th>
                          <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-36">
                            Expected Delivery
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-150">
                        {previewPrData.items &&
                          previewPrData.items.map((row: any, i: number) => (
                            <tr key={i}>
                              <td className="py-4 px-3">
                                <div className="font-mono font-bold text-stone-900 text-xs">
                                  {row.item_code}
                                </div>
                                <div className="text-sm font-black text-stone-900 uppercase tracking-tight mt-0.5">
                                  {row.name}
                                </div>
                                {(row.dimension || row.spec) && (
                                  <div className="text-[10px] text-stone-500 mt-0.5 font-medium">
                                    {[row.dimension, row.spec]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                                {Number(row.shortage_qty) || 0}
                              </td>
                              <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">
                                {row.uom}
                              </td>
                              <td className="py-4 px-3 text-center text-stone-700 font-mono text-xs whitespace-nowrap">
                                {(() => {
                                  const rawDate =
                                    row.expected_delivery_date ||
                                    row.expected_date ||
                                    previewPrData.expected_delivery_date;
                                  if (!rawDate) return "-";
                                  try {
                                    const d = new Date(rawDate);
                                    if (isNaN(d.getTime())) return rawDate;
                                    return d.toLocaleDateString("en-US", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    });
                                  } catch {
                                    return rawDate;
                                  }
                                })()}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Authorized Signatures for PR */}
                  <div className="mt-8 pt-6 border-t border-stone-200 grid grid-cols-2 gap-8 text-center">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-1">
                        Requested By
                      </div>
                      <div className="text-[10px] text-stone-500 uppercase font-bold mb-3">
                        {getDepartmentLabel(
                          previewPrData.department || "PRODUCTION",
                        )}{" "}
                        Team
                      </div>
                      <div className="h-14 flex items-center justify-center">
                        <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">
                          <QrCode className="w-6 h-6 text-emerald-600" />
                          <div className="text-left">
                            <div className="text-[9px] font-black text-emerald-800 uppercase">
                              Validated Requisition
                            </div>
                            <div className="text-[8px] font-mono text-emerald-700">
                              {new Date(
                                previewPrData.created_at || Date.now(),
                              ).toLocaleDateString("en-US")}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                        Department Supervisor
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-1">
                        Approved By
                      </div>
                      <div className="text-[10px] text-stone-500 uppercase font-bold mb-3">
                        {getDepartmentLabel(
                          previewPrData.department || "PRODUCTION",
                        )}{" "}
                        Manager
                      </div>
                      <div className="h-14 flex items-center justify-center">
                        {previewPrData.status === "AUTHORIZED" ||
                        previewPrData.status === "PARTIAL_ORDERED" ||
                        previewPrData.status === "ORDERED" ||
                        previewPrData.status === "RECEIVED" ||
                        !!previewPrData.authorized_doc ? (
                          <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">
                            <QrCode className="w-6 h-6 text-emerald-600" />
                            <div className="text-left">
                              <div className="text-[9px] font-black text-emerald-800 uppercase">
                                Digitally Authorized
                              </div>
                              <div className="text-[8px] font-mono text-emerald-700">
                                Validated Securely
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="border border-dashed border-stone-300 rounded-lg px-4 py-2 bg-stone-50">
                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                              Awaiting PIN Authorization
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                        Department Manager
                      </div>
                    </div>
                  </div>
                </PrintTemplate>
              </PdfPreviewWrapper>
            </div>
            <div className="p-6 border-t border-stone-100 bg-white flex justify-center gap-4">
              <Button
                variant="secondary"
                onClick={() => setShowPreviewModal(false)}
                className="px-6 py-2.5 rounded-xl text-sm"
              >
                Close
              </Button>
              <Button
                variant="dark"
                onClick={() => handleExportPDF()}
                isLoading={isSubmitting}
                className="px-6 py-2.5 rounded-xl text-sm shadow-md"
              >
                {!isSubmitting && <Download className="w-4 h-4" />}
                {isSubmitting ? "Generating..." : "Export PDF (A4)"}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Purchase Request Preview / Revise Modal (Identical to Design Requests) */}
      <Modal
        isOpen={showPrModal}
        onClose={() => {
          setShowPrModal(false);
          setRevisingPr(null);
        }}
        title={
          revisingPr
            ? `Revise Purchase Request: ${revisingPr.pr_number}`
            : "Purchase Request Preview"
        }
        maxWidth="2xl"
        contentClassName="p-0 border-t border-stone-100"
      >
        <div className="w-full">
          <div className="p-6 bg-[#F9F9F8]">
            {revisingPr && revisingPr.revision_note && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 shadow-sm mb-6 w-full">
                <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-rose-800 uppercase tracking-widest mb-1">
                    Management Revision Note:
                  </div>
                  <div className="text-sm font-medium text-rose-700 leading-relaxed">
                    &quot;{revisingPr.revision_note}&quot;
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-stone-200/80 rounded-xl p-6 shadow-sm space-y-6 w-full">
              <div className="border-b border-stone-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-stone-900">
                    Department: {getDepartmentLabel(selectedDepartment)}
                  </h4>
                  <p className="text-xs text-stone-500 mt-1">
                    The following shortage items will be requested from
                    Purchasing.
                  </p>
                </div>

                {/* PR Urgency Selector */}
                <div className="min-w-[200px]">
                  <Select
                    label="PR Urgency Level"
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value as any)}
                    className={cn(
                      urgency === "CRITICAL"
                        ? "bg-rose-50 border-rose-200 text-rose-700"
                        : urgency === "URGENT"
                          ? "bg-amber-50 border-amber-200 text-amber-700"
                          : "",
                    )}
                  >
                    <option value="NORMAL">Normal Priority</option>
                    <option value="URGENT">Urgent Priority</option>
                    <option value="CRITICAL">Critical / Line Stop</option>
                  </Select>
                </div>
              </div>

              <div className="bg-white border border-stone-200/80 rounded-xl overflow-hidden shadow-2xs">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Shortage</TableHead>
                      <TableHead className="text-center w-40">
                        Exp. Delivery Date
                      </TableHead>
                      <TableHead className="text-right w-32">Req Qty</TableHead>
                      <TableHead>UOM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bomRows
                      .filter((r) => (r.shortage_qty || 0) > 0)
                      .map((row, idx) => (
                        <TableRow key={idx} className="hover:bg-transparent">
                          <TableCell className="font-medium text-stone-900">
                            <div>
                              <span className="font-mono font-bold mr-1.5">
                                {row.item_code}
                              </span>
                              {row.name}
                            </div>
                            <div className="text-[10px] text-stone-500 font-normal">
                              {[row.dimension, row.spec]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-stone-500">
                            {row.shortage_qty}
                          </TableCell>
                          <TableCell className="px-4">
                            <Input
                              type="date"
                              required
                              className="text-center font-mono text-xs h-8"
                              value={row.expected_date || ""}
                              onChange={(e) => {
                                const newRows = [...bomRows];
                                const targetIdx = newRows.findIndex(
                                  (r) => r.id === row.id,
                                );
                                if (targetIdx !== -1) {
                                  newRows[targetIdx].expected_date =
                                    e.target.value;
                                  setBomRows(newRows);
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              className="text-right font-mono tabular-nums font-bold h-8"
                              value={
                                row.qty_to_order !== undefined
                                  ? row.qty_to_order
                                  : row.shortage_qty
                              }
                              onChange={(e) => {
                                const val = Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                );
                                const newRows = [...bomRows];
                                const targetIdx = newRows.findIndex(
                                  (r) => r.id === row.id,
                                );
                                if (targetIdx !== -1) {
                                  newRows[targetIdx].qty_to_order = val;
                                  setBomRows(newRows);
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-stone-500">
                            {row.uom}
                          </TableCell>
                        </TableRow>
                      ))}
                    {bomRows.filter((r) => (r.shortage_qty || 0) > 0).length ===
                      0 && (
                      <TableEmpty
                        colSpan={5}
                        message="All items are in stock. No PR needed."
                      />
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-stone-200/80 bg-white flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPrModal(false)}
            >
              Cancel
            </Button>
            {bomRows.filter(
              (r) =>
                (r.qty_to_order !== undefined
                  ? r.qty_to_order
                  : r.shortage_qty || 0) > 0,
            ).length > 0 && (
              <Button
                onClick={handleSubmitPr}
                disabled={isSubmitting}
                isLoading={isSubmitting}
                variant="primary"
              >
                {isSubmitting ? "Submitting..." : "Finalize & Print PR"}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
});
