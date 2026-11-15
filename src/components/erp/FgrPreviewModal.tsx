import React, { useRef, useState } from "react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Printer, Download, X, Award } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getShortCode } from "@/lib/utils";
import { generatePDF } from "@/lib/pdfGenerator";

interface FgrPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fgr?: any;
  project?: any;
  itemId?: string;
  fgCode?: string;
}

export const FgrPreviewModal: React.FC<FgrPreviewModalProps> = ({
  isOpen,
  onClose,
  fgr,
  project,
  itemId,
  fgCode,
}) => {
  const printDocRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const currentFgCode =
    fgCode || fgr?.item_code || (project ? `FG-${project.id}` : "FG-REC");
  const currentItemId =
    itemId || fgr?.item_id || fgr?.id || (project ? `ITM-FG-${project.id}` : "ITM-FG");
  const fgrNumber =
    fgr?.fgr_number ||
    `FGR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${
      project?.spk_number || "001"
    }`;
  const totalQty = fgr?.quantity || fgr?.qty_passed || project?.qty || 1;
  const uom = fgr?.uom || project?.uom || "UNIT";
  const serialNumber =
    fgr?.serial_number || `SN-${(project?.id || Date.now().toString()).slice(-6)}`;
  const warehouse = fgr?.target_warehouse || "Warehouse FG-01";

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsExporting(true);
    try {
      await generatePDF(printDocRef.current, `${fgrNumber}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="6xl"
      hideCloseButton={true}
      title={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-stone-900 tracking-tight">
                  Finished Goods Record (FGR) Certificate
                </span>
                <Badge variant="success" size="sm">
                  QA Authorized
                </Badge>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-stone-500 mt-0.5 truncate">
                Ref: {fgrNumber} · SPK: {project?.spk_number || project?.id || "-"} · A4 Portrait Standard
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.print()}
              leftIcon={<Printer className="w-3.5 h-3.5" />}
            >
              Print
            </Button>
            <Button
              variant="dark"
              size="sm"
              onClick={handleExportPdf}
              isLoading={isExporting}
              leftIcon={!isExporting ? <Download className="w-3.5 h-3.5" /> : undefined}
            >
              {isExporting ? "Generating..." : "Export PDF (A4)"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              leftIcon={<X className="w-3.5 h-3.5" />}
            >
              Close
            </Button>
          </div>
        </div>
      }
      contentClassName="p-0 flex flex-col min-h-0 bg-stone-100"
    >
      <div className="flex-1 min-h-0 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
          <PrintTemplate
            ref={printDocRef}
            documentTitleId="FINISHED GOOD RECORD"
            documentTitleEn="FINISH GOOD RECORD"
            documentNameId="finished good record"
            documentNameEn="finish good record"
            date={new Date(
              fgr?.created_at || fgr?.inspected_at || Date.now()
            ).toLocaleDateString("en-GB", {
              timeZone: "Asia/Jakarta",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            referenceNumber={fgrNumber}
            documentId={getShortCode(currentFgCode)}
            signatureStatus="signed"
          >
            {/* Grid Metadata */}
            <div className="grid grid-cols-2 gap-6 mb-6 border-b border-stone-200 pb-4">
              <div>
                <div className="text-[9px] font-bold tracking-widest uppercase text-stone-500 mb-1.5">
                  Item Identification
                </div>
                <div className="text-xl font-black text-stone-900 mb-1 font-mono tabular-nums tracking-tight leading-none">
                  {getShortCode(currentItemId)}
                </div>
                <div className="text-[10px] font-mono text-stone-600 uppercase tracking-wider flex items-center gap-2 flex-wrap">
                  <span>LOT: {getShortCode(currentFgCode)}</span>
                  <span>·</span>
                  <span>SKU: {getShortCode(currentItemId)}</span>
                  <span>·</span>
                  <span>SN: {serialNumber}</span>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="text-[9px] font-bold tracking-widest uppercase text-stone-500 mb-1">
                  Production &amp; QA Context
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-stone-500 uppercase font-bold">
                    Project Stream:
                  </span>
                  <span className="font-bold text-stone-900 uppercase">
                    {project?.name || fgr?.project_name || "-"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-stone-500 uppercase font-bold">
                    Work Order Ref:
                  </span>
                  <span className="font-mono font-bold text-stone-900 tabular-nums uppercase">
                    {project?.spk_number || fgr?.spk_number || "BATCH"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-stone-500 uppercase font-bold">
                    Target Warehouse:
                  </span>
                  <span className="font-bold text-stone-800">{warehouse}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-stone-500 uppercase font-bold">
                    Inspected By:
                  </span>
                  <span className="font-bold uppercase text-stone-900">
                    {fgr?.inspected_by ||
                      fgr?.inspector_id ||
                      user?.name ||
                      user?.username ||
                      "QA/QC Lead"}
                  </span>
                </div>
              </div>
            </div>

            {/* Certification Clause */}
            <div className="p-4 bg-white rounded-xl border border-stone-200 mb-6 w-full">
              <div className="text-[9px] font-bold uppercase tracking-widest text-stone-900 mb-1">
                Certification Clause &amp; Engineering BOP Gate Verification
              </div>
              <p className="text-[10px] text-stone-600 leading-relaxed">
                This Finished Goods Record (FGR) certifies that all Engineering Bill of Process (BOP) stations have passed First Article Inspection (FAI) and In-Process Quality Control (IPQC), with zero unresolved Non-Conformance Reports (NCR).
              </p>
            </div>

            {/* Lot Table */}
            <div className="flex-1 relative w-full mb-6">
              <table className="w-full text-left border-collapse border border-stone-200 text-xs">
                <thead>
                  <tr className="border-b border-stone-300 bg-stone-50">
                    <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[10px] w-12 text-center">
                      No
                    </th>
                    <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[10px] w-32">
                      Item ID
                    </th>
                    <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[10px]">
                      Finished Good Lot Description
                    </th>
                    <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[10px] text-right w-32">
                      Passed Yield
                    </th>
                    <th className="py-2 px-3 font-bold text-stone-900 uppercase tracking-wider text-[10px] w-20 text-center">
                      UOM
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-stone-200">
                    <td className="py-2.5 px-3 text-[11px] font-mono font-bold text-center text-stone-500 tabular-nums">
                      01
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] font-bold text-stone-800 tabular-nums">
                      {getShortCode(currentItemId)}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-bold text-stone-900 leading-snug uppercase">
                      Finished Good Assembly — {project?.name || fgr?.project_name}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-bold text-right font-mono text-emerald-800 tabular-nums">
                      {Number(totalQty).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-[10px] tracking-wider uppercase font-bold text-stone-600 text-center">
                      {uom}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </PrintTemplate>
        </PdfPreviewWrapper>
      </div>
    </Modal>
  );
};
