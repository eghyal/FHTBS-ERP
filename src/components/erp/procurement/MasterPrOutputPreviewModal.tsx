import React, { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { canViewDocFinancials } from "@/utils/rbacFinancials";
import { ConfidentialBadge } from "@/components/shared/ConfidentialBadge";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { generatePDF } from "@/lib/pdfGenerator";
import { formatIDR } from "@/lib/utils";
import { Download, QrCode } from "lucide-react";

export interface MasterPrPreviewLine {
  id: string;
  wave_number: number;
  station_focus: string;
  lot_split_label?: string;
  item_code: string;
  item_name: string;
  spec?: string;
  uom: string;
  product_node_name?: string | null;
  preferred_supplier_name?: string | null;
  order_release_date?: string | null;
  expected_delivery_date: string;
  production_need_date?: string | null;
  allocated_wave_qty: number;
  baseline_required_qty?: number;
  unit_price: number;
  subtotal_cost: number;
  line_status: "UNSYNCED" | "PR_DRAFTED" | "PR_AUTHORIZED" | "PO_LINKED" | "GRN_RECEIVED";
  po_number?: string | null;
}

export interface ReconciliationRow {
  item_code: string;
  item_name: string;
  uom: string;
  product_node_name?: string | null;
  baseline_required_qty: number;
  total_allocated_qty: number;
  variance_qty: number;
  is_balanced: boolean;
  wave_splits: {
    wave_number: number;
    station_focus: string;
    allocated_qty: number;
    target_arrival_date: string;
    wave_status: string;
  }[];
}

interface MasterPrOutputPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  spkNumber?: string | null;
  planCode?: string | null;
  strategyLabel: string;
  masterPrNumber: string;
  masterPrStatus: string; // UNSYNCED | DRAFTED | AUTHORIZED | ORDERED
  createdAt?: string | null;
  requesterName?: string | null;
  lines: MasterPrPreviewLine[];
  reconciliationMatrix: ReconciliationRow[];
  totalEstimatedBudget: number;
  canAuthorizeMasterPr?: boolean;
  isAuthorizing?: boolean;
  onAuthorizeMasterPr?: () => void;
  isPushingAllPr?: boolean;
  onSyncAllWavesToPr?: () => void;
  hasSavedPlan?: boolean;
}

export const MasterPrOutputPreviewModal: React.FC<MasterPrOutputPreviewModalProps> = ({
  isOpen,
  onClose,
  projectName,
  spkNumber,
  planCode,
  strategyLabel,
  masterPrNumber,
  masterPrStatus,
  createdAt,
  requesterName,
  lines,
  totalEstimatedBudget,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const printDocRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const canViewPrices = canViewDocFinancials(user, "PR");
  const isDraftOrUnsynced =
    masterPrStatus === "UNSYNCED" ||
    masterPrStatus === "DRAFTED" ||
    masterPrStatus === "PENDING";
  const isAuthorizedOrOrdered =
    masterPrStatus === "AUTHORIZED" ||
    masterPrStatus === "APPROVED" ||
    masterPrStatus === "ORDERED" ||
    masterPrStatus === "PARTIAL_PO";

  const docRefNumber = planCode || masterPrNumber || "PP-DRAFT";

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsExporting(true);
    try {
      const safeRef = docRefNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
      await generatePDF(
        printDocRef.current,
        `${safeRef}_${projectName.replace(/\s+/g, "_")}.pdf`,
        {
          orientation: "portrait",
          format: "a4",
        },
      );
      showToast("Procurement Plan PDF exported", "success");
    } catch (err) {
      console.error("Failed to export Procurement Plan PDF:", err);
      showToast("Failed to export PDF", "error");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "short",
        day: "numeric",
      });

  const formatDeliveryDate = (rawDate?: string | null) => {
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
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Procurement Plan Document"
      maxWidth="5xl"
      contentClassName="p-0 flex flex-col h-[85vh] border-t border-stone-100"
    >
      <div className="flex-1 w-full bg-stone-50 p-2 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
          <PrintTemplate
            ref={printDocRef}
            documentTitleId="PROCUREMENT PLAN"
            documentTitleEn="PROCUREMENT PLAN"
            documentNameId="procurement plan"
            documentNameEn="procurement plan"
            date={formattedDate}
            referenceNumber={docRefNumber}
            documentId={docRefNumber}
            isDraft={isDraftOrUnsynced}
          >
            {/* Standard ERP 2-Column Document Header (Matching Purchase Request / PO) */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2">
                  Project Assignment
                </div>
                <div className="text-xl font-black text-stone-900 uppercase flex items-center gap-2">
                  {projectName}
                </div>
                <div className="text-xs text-stone-600 mt-2 font-bold">
                  Corporate Project Intake • Material Procurement Plan
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2">
                  Document References
                </div>
                <div className="text-base font-black text-stone-900 font-mono">
                  Ref: {masterPrNumber}
                </div>
                {spkNumber && (
                  <div className="text-xs font-bold text-stone-800 font-mono mt-0.5">
                    WO: {spkNumber}
                  </div>
                )}
              </div>
            </div>

            {/* Strategy & Reference Box (Matching Purchase Request Document) */}
            <div className="mb-6 p-4 bg-white rounded-lg border border-stone-200">
              <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-1">
                Execution Strategy &amp; Wave Reference
              </div>
              <div className="text-sm font-black text-stone-900 tracking-tight leading-tight uppercase">
                <span className="text-stone-500 font-normal text-xs mr-2">
                  Strategy Mode:
                </span>
                <span className="font-mono text-stone-900">
                  {strategyLabel} ({new Set(lines.map((l) => l.wave_number)).size} Wave Schedule)
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
                    <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-xs w-20">
                      Wave
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 uppercase tracking-wider text-xs">
                      Item Code &amp; Description
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-24">
                      Quantity
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-20">
                      UOM
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-center uppercase tracking-wider text-xs w-32">
                      Expected Delivery
                    </th>
                    <th className="py-3 px-3 font-extrabold text-stone-900 text-right uppercase tracking-wider text-xs w-32">
                      Est. Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150">
                  {lines.map((line, idx) => (
                    <tr key={line.id || idx}>
                      <td className="py-4 px-3 font-mono font-bold text-stone-900 text-xs">
                        Wave {line.wave_number}
                      </td>
                      <td className="py-4 px-3">
                        <div className="font-mono font-bold text-stone-900 text-xs">
                          {line.item_code}
                        </div>
                        <div className="text-sm font-black text-stone-900 uppercase tracking-tight mt-0.5">
                          {line.item_name}
                        </div>
                        {(line.preferred_supplier_name || line.spec) && (
                          <div className="text-[10px] text-stone-500 mt-0.5 font-medium">
                            {[line.preferred_supplier_name, line.spec]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-3 text-center font-bold text-stone-900 text-sm tabular-nums">
                        {Number(line.allocated_wave_qty) || 0}
                      </td>
                      <td className="py-4 px-3 text-center text-stone-600 font-extrabold uppercase tracking-wider text-xs">
                        {line.uom}
                      </td>
                      <td className="py-4 px-3 text-center text-stone-700 font-mono text-xs whitespace-nowrap">
                        {formatDeliveryDate(line.expected_delivery_date)}
                      </td>
                      <td className="py-4 px-3 text-right font-mono font-bold text-stone-900 text-xs tabular-nums">
                        {canViewPrices ? formatIDR(line.subtotal_cost || 0) : <ConfidentialBadge />}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-stone-300">
                    <td
                      colSpan={5}
                      className="py-3 px-3 text-right font-extrabold text-stone-900 uppercase tracking-wider text-xs"
                    >
                      Est. Grand Total
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-stone-900 text-sm tabular-nums">
                      {canViewPrices ? formatIDR(totalEstimatedBudget) : <ConfidentialBadge size="sm" />}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Authorized Signatures (Exact Match to ERP Standard) */}
            <div className="mt-8 pt-6 border-t border-stone-200 grid grid-cols-2 gap-8 text-center">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-1">
                  Prepared By
                </div>
                <div className="text-[10px] text-stone-500 uppercase font-bold mb-3">
                  Procurement Team
                </div>
                <div className="h-14 flex items-center justify-center">
                  <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">
                    <QrCode className="w-6 h-6 text-emerald-600" />
                    <div className="text-left">
                      <div className="text-[9px] font-black text-emerald-800 uppercase">
                        Validated Plan
                      </div>
                      <div className="text-[8px] font-mono text-emerald-700">
                        {requesterName || user?.name || formattedDate}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1">
                  Procurement Planner
                </div>
              </div>

              <div>
                <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-1">
                  Approved By
                </div>
                <div className="text-[10px] text-stone-500 uppercase font-bold mb-3">
                  Department Manager
                </div>
                <div className="h-14 flex items-center justify-center">
                  {isAuthorizedOrOrdered ? (
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

      {/* Standard ERP Document Export Window Footer */}
      <div className="p-6 border-t border-stone-100 bg-white flex justify-center gap-4">
        <Button
          variant="secondary"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl text-sm"
        >
          Close
        </Button>
        <Button
          variant="dark"
          onClick={handleExportPdf}
          isLoading={isExporting}
          className="px-6 py-2.5 rounded-xl text-sm shadow-md"
        >
          {!isExporting && <Download className="w-4 h-4" />}
          {isExporting ? "Generating..." : "Export PDF (A4)"}
        </Button>
      </div>
    </Modal>
  );
};
