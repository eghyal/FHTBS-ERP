import React, { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { generatePDF } from "@/lib/pdfGenerator";
import { Download, ShieldCheck } from "lucide-react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";

interface NtpPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  ntp: any;
}

export const NtpPreviewModal: React.FC<NtpPreviewModalProps> = ({
  isOpen,
  onClose,
  project,
  ntp,
}) => {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const printDocRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!project || !ntp) return null;

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsExporting(true);
    try {
      await generatePDF(
        printDocRef.current,
        `NTP_${project.id || ntp.ntp_number}.pdf`,
      );
      showToast("Notice to Proceed PDF generated", "success");
    } catch (err) {
      console.error(err);
      showToast("PDF generation failed", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const issueDateStr = ntp.created_at
    ? new Date(ntp.created_at).toLocaleDateString("en-US", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });

  const deadlineRaw =
    project.due_date ||
    project.deadline ||
    project.target_due_date ||
    project.project_due_date ||
    ntp.due_date ||
    "";

  const deadlineFormattedEn = deadlineRaw
    ? new Date(deadlineRaw).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
    : "Per Agreed Schedule";

  const refNo = project.id || ntp.ntp_number || ntp.id || "WO/NTP-DRAFT";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="6xl"
      title="Notice to Proceed (NTP)"
      contentClassName="p-0 flex flex-col min-h-0 bg-stone-100"
      footer={
        <div className="w-full flex flex-wrap items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportPdf}
            isLoading={isExporting}
            leftIcon={!isExporting ? <Download className="w-4 h-4" /> : undefined}
          >
            {isExporting ? "Generating..." : "Export PDF (A4)"}
          </Button>
        </div>
      }
    >
      <div className="flex-1 min-h-0 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
        <PrintTemplate
          ref={printDocRef}
          documentTitleId="NOTICE TO PROCEED (NTP / WORK ORDER)"
          documentTitleEn="NOTICE TO PROCEED & PROJECT CHARTER"
          documentNameId="formal notice to proceed"
          documentNameEn="formal notice to proceed"
          date={issueDateStr}
          referenceNumber={refNo}
          documentId={refNo}
          isDraft={
            !ntp.ntp_number ||
            ntp.status === "DRAFT" ||
            ntp.status === "DRAFTED" ||
            ntp.status === "PENDING"
          }
        >
          {/* Section 1: Recipient & Project Charter Info Block */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
              <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1.5 flex items-center justify-between">
                <span>Target Recipient Unit</span>
              </div>
              <div className="text-xs font-black text-stone-900 uppercase tracking-tight">
                OPERATIONS & LOGISTICS DIVISION
              </div>
              <div className="text-[10px] text-stone-500 font-bold uppercase tracking-wide mt-0.5">
                Manufacturing & Supply Chain Execution
              </div>
              <div className="text-[11px] text-stone-700 font-semibold mt-2 pt-2 border-t border-stone-200 flex items-center justify-between">
                <span>Digital Facility - Production Control Unit</span>
                <span className="text-[9px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">Active Mandate</span>
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
              <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-1.5 flex items-center justify-between">
                <span>Subject Project</span>
                <span className="text-[9px] font-mono font-bold bg-white text-stone-900 border border-stone-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                  ID: {project.id}
                </span>
              </div>
              <div className="text-xs font-black text-stone-900 uppercase tracking-tight truncate" title={project.name}>
                {project.name}
              </div>
              <div className="mt-2 pt-2 border-t border-stone-200 grid grid-cols-2 gap-2 text-left">
                <div>
                  <div className="text-[9px] text-stone-400 font-bold uppercase tracking-widest">Quantity / Qty</div>
                  <div className="text-xs font-black text-stone-900 font-mono mt-0.5 whitespace-nowrap">
                    {project.qty || project.quotation_qty || 1} {project.uom || "Unit"}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-stone-400 font-bold uppercase tracking-widest">Sales Ref / Quo</div>
                  <div className="text-xs font-bold text-stone-800 font-mono mt-0.5 whitespace-nowrap truncate" title={ntp.quotation_number || project.quotation_id || "-"}>
                    {ntp.quotation_number || project.quotation_id || "-"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Authorization Declaration & Execution Mandate */}
          <div className="mb-4 p-3.5 bg-white text-stone-900 rounded-lg border border-stone-200 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-600">
                Formal Operational Clearance
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider bg-stone-100 text-stone-800 border border-stone-300 px-2 py-0.5 rounded">
                Official Execution Mandate
              </span>
            </div>

            <div className="text-sm font-black text-stone-900 uppercase tracking-tight leading-snug">
              Mandatory Execution for Project:{" "}
              <span className="font-mono bg-stone-100 px-2 py-0.5 rounded border border-stone-300 text-stone-900 whitespace-nowrap">
                {project.id}
              </span>
            </div>

            <div className="text-xs mt-2 leading-relaxed">
              <p className="text-stone-800 font-medium leading-snug">
                • Operational teams are hereby fully authorized to initiate manufacturing, procurement (PR/PO), and logistics activities. All execution protocols must strictly adhere to the referenced quotation, quality tolerances, and technical specifications.
              </p>
            </div>

            {/* Target Deadline Strip */}
            <div className="mt-3 p-2.5 bg-stone-50 border border-stone-200 rounded-md grid grid-cols-2 gap-4 items-center">
              <div>
                <div className="text-[9px] uppercase font-black tracking-widest text-stone-500">
                  Project Execution Deadline
                </div>
                <div className="text-xs font-black text-stone-900 font-mono mt-0.5 flex items-baseline gap-1.5 flex-wrap">
                  <span className="whitespace-nowrap">{deadlineFormattedEn}</span>
                </div>
              </div>
              <div className="text-right border-l border-stone-200 pl-4">
                <div className="text-[9px] uppercase font-black tracking-widest text-stone-500">
                  Effective Issue Date
                </div>
                <div className="text-xs font-bold text-stone-900 font-mono mt-0.5 whitespace-nowrap">
                  {issueDateStr}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Project Specifications Summary Strip */}
          <div className="mb-4 bg-stone-50 border border-stone-200 rounded-lg p-2.5">
            <div className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1.5">
              Project Execution Parameters
            </div>
            <div className="grid grid-cols-3 gap-3 text-left">
              <div>
                <div className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider">Work Center / Facility</div>
                <div className="text-[10.5px] font-bold text-stone-800 mt-0.5 truncate">
                  Manufacturing & Assembly Hub
                </div>
              </div>
              <div>
                <div className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider">Technical Reference / Routing</div>
                <div className="text-[10.5px] font-bold text-stone-800 mt-0.5 truncate">
                  BOP Routing & Approved BOM
                </div>
              </div>
              <div>
                <div className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider">Inspection Standard / QC</div>
                <div className="text-[10.5px] font-bold text-stone-800 mt-0.5 truncate">
                  CV. Batu Emas Group Quality Standard
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Workflow Directives & Protocols */}
          <div className="mb-4">
            <div className="text-xs text-stone-900 uppercase tracking-widest font-black mb-2 flex items-center justify-between">
              <span>
                Workflow Directives & Standard Protocols
              </span>
              <span className="text-[9px] font-mono text-stone-400 font-normal uppercase">
                3 Standard SOP Stages
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  step: "01",
                  titleEn: "RESOURCE ALLOCATION & MATERIAL PROCUREMENT",
                  descEn: "Procurement teams to immediately initiate Purchase Requests (PR) for all materials & components listed in the approved Bill of Materials (BOM).",
                },
                {
                  step: "02",
                  titleEn: "PRODUCTION SCHEDULING & MACHINE ALLOCATION",
                  descEn: "Manufacturing floor managers to designate priority work centers, machine capacity allocation, and WOT execution schedules.",
                },
                {
                  step: "03",
                  titleEn: "QUALITY CONTROL (QC) & TOLERANCE SYNC",
                  descEn: "Dimensional inspection protocols, strength testing, and acceptance criteria must be strictly synchronized with project technical tolerances.",
                },
              ].map((d) => (
                <div
                  key={d.step}
                  className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-stone-200"
                >
                  <div className="w-7 h-7 rounded bg-stone-100 border border-stone-300 text-stone-900 flex items-center justify-center text-xs font-mono font-black shrink-0">
                    {d.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-[11px] font-black text-stone-900 uppercase tracking-wide">
                        {d.titleEn}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-stone-800 font-medium mt-0.5 leading-snug">
                      {d.descEn}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 5: Compliance Remarks */}
          <div className="mb-4 p-3 bg-stone-50 rounded-lg border border-stone-200">
            <h4 className="text-[10px] font-black text-stone-900 uppercase tracking-widest mb-1 flex items-center justify-between">
              <span>
                Operational Compliance Remarks
              </span>
              <span className="text-[8.5px] font-mono text-stone-400">SOP-REF: STD/OPS/2026</span>
            </h4>
            <p className="text-[11px] text-stone-800 font-semibold italic leading-relaxed">
              "{project.remarks ||
                "Standard operating procedures (SOP) apply throughout the project lifecycle. No additional operational constraints noted."}"
            </p>
          </div>
        </PrintTemplate>
</PdfPreviewWrapper>
      </div>
    </Modal>
  );
};
