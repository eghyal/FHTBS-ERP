import React, { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { generatePDF } from "@/lib/pdfGenerator";
import { Download, ShieldCheck, QrCode } from "lucide-react";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { QRCodeSVG } from "qrcode.react";
import { getUpstreamProductNodes } from "@/utils/bopGraph";
import {
  type BopProductRole,
  type BopQcParameter,
  resolveBopProductRole,
  parseLegacyQcCriteriaToParameters,
} from "./bopTypes";

interface BoPStep {
  id: string;
  step_sequence: number;
  process_name: string;
  node_type?: "PROCESS" | "PRODUCT";
  product_role?: BopProductRole | null;
  work_center_id?: string;
  work_center_name?: string;
  execution_type: "SERIAL" | "PARALLEL";
  predecessor_ids?: string[];
  standard_hours?: number;
  manpower_allocated?: number;
  shift_mode?: number;
  notes?: string;
  sop_instruction?: string;
  qc_criteria?: string;
  qc_parameters?: BopQcParameter[];
  bom_allocations?: any[];
  expected_yield_rate?: number;
}

interface BopRoutingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  steps: BoPStep[];
  projectBoms?: any[];
}

export const BopRoutingPreviewModal: React.FC<BopRoutingPreviewModalProps> = ({
  isOpen,
  onClose,
  project,
  steps,
  projectBoms = [],
}) => {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const printDocRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!project) return null;

  const handleExportPdf = async () => {
    if (!printDocRef.current) return;
    setIsExporting(true);
    try {
      await generatePDF(printDocRef.current, `BOP_Routing_Card_${project.spk_number || project.id}.pdf`);
      showToast("Process Routing Sheet exported as PDF", "success");
    } catch (err: any) {
      console.error(err);
      showToast(`PDF generation failed: ${err.message || String(err)}`, "error");
    } finally {
      setIsExporting(false);
    }
  };

  const issueDateStr = new Date().toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const verificationUrl = `${window.location.origin}/production/project/${project.id}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="6xl"
      title="Engineering Process Route Sheet (BoP)"
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
            disabled={isExporting}
            leftIcon={<Download className="w-4 h-4" />}
          >
            {isExporting ? "Exporting PDF..." : "Export PDF (A4)"}
          </Button>
        </div>
      }
    >
      <div className="flex-1 min-h-0 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
        <PdfPreviewWrapper>
          <PrintTemplate
            ref={printDocRef}
            documentTitleId="PROCESS ROUTING SHEET & BILL OF PROCESS (BOP)"
            documentTitleEn="PROCESS ROUTING SHEET & BILL OF PROCESS (BOP)"
            documentNameId="manufacturing route traveler & process sheet"
            documentNameEn="manufacturing route traveler & process sheet"
            date={issueDateStr}
            referenceNumber={`BOP-${project.spk_number || project.id}`}
            documentId={`BOP-${project.id}`}
            isDraft={false}
          >
            <div className="space-y-6 text-xs text-stone-800 font-sans">
              {/* Project Header Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-stone-50 border border-stone-200">
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Work Order No.</span>
                  <span className="font-bold text-stone-900 text-sm font-mono">{project.spk_number || "WO-UNASSIGNED"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Project Name</span>
                  <span className="font-bold text-stone-900 text-sm truncate block">{project.name}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Customer</span>
                  <span className="font-bold text-stone-900 text-sm truncate block">{project.customer || "Internal / Stock"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Routing Strategy</span>
                  <span className="font-bold text-stone-900 text-sm font-mono">Hybrid DAG</span>
                </div>
              </div>

              {/* Process Routing Table */}
              <div className="border border-stone-300 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-100 text-stone-700 text-[10px] font-bold uppercase tracking-wider border-b border-stone-300">
                      <th className="py-2.5 px-3 w-12 text-center">Seq</th>
                      <th className="py-2.5 px-3">Process / Product Milestone</th>
                      <th className="py-2.5 px-3 w-48">Material Details</th>
                      <th className="py-2.5 px-3 w-24 text-center">Role / Mode</th>
                      <th className="py-2.5 px-3">SOP &amp; IPQC / Final QC Checkpoints</th>
                      <th className="py-2.5 px-3 w-24 text-center">Sign-off</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-xs">
                    {steps.map((step, idx) => {
                      const isProduct = step.node_type === "PRODUCT";
                      const productRole = isProduct
                        ? step.product_role ||
                          resolveBopProductRole(step.id, steps as any[]) ||
                          "MATERIAL_INPUT"
                        : null;
                      const qcParams = isProduct
                        ? Array.isArray(step.qc_parameters) && step.qc_parameters.length > 0
                          ? step.qc_parameters
                          : step.qc_criteria
                          ? parseLegacyQcCriteriaToParameters(step.qc_criteria)
                          : []
                        : [];

                      return (
                        <tr
                          key={step.id || idx}
                          className={
                            isProduct
                              ? productRole === "WIP_SUB_ASSY"
                                ? "bg-indigo-50/50 hover:bg-indigo-100/40"
                                : productRole === "FINISHED_GOOD"
                                ? "bg-emerald-50/50 hover:bg-emerald-100/40"
                                : "bg-amber-50/60 hover:bg-amber-100/50"
                              : "hover:bg-stone-50/50"
                          }
                        >
                          <td className="py-2 px-3 text-center font-bold font-mono text-stone-600">
                            {String(step.step_sequence || idx + 1).padStart(2, "0")}
                          </td>
                          <td className="py-2 px-3 font-semibold text-stone-900">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isProduct && (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                                    productRole === "WIP_SUB_ASSY"
                                      ? "bg-indigo-100 text-indigo-900 border-indigo-300"
                                      : productRole === "FINISHED_GOOD"
                                      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                      : "bg-amber-200 text-amber-900 border-amber-300"
                                  }`}
                                >
                                  {productRole === "WIP_SUB_ASSY"
                                    ? "WIP · SUB-ASSY"
                                    : productRole === "FINISHED_GOOD"
                                    ? "FINISHED GOOD"
                                    : "MATERIAL INPUT"}
                                </span>
                              )}
                              <span>{step.process_name}</span>
                            </div>
                            {step.notes && (
                              <div className="text-[10px] text-stone-500 font-normal italic mt-0.5">{step.notes}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-[10px] text-stone-700">
                            {isProduct ? (
                              productRole === "FINISHED_GOOD" ? (
                                <span className="italic text-emerald-700 font-medium">
                                  Final Product Output
                                </span>
                              ) : (
                                (() => {
                                  let allocs: any[] = [];
                                  try { allocs = typeof step.bom_allocations === 'string' ? JSON.parse(step.bom_allocations) : step.bom_allocations || []; } catch(e){}
                                  if (allocs.length === 0) return <span className="italic text-stone-400">No specific BOM allocations</span>;
                                  return (
                                    <ul className="list-disc pl-3">
                                      {allocs.map((a: any, i: number) => {
                                        const bomRef = projectBoms.find(b => b.id === a.bom_id);
                                        const totalBomQty = Number((bomRef?.required_qty || bomRef?.qty) || 0);
                                        const uom = bomRef?.uom || a.uom || 'qty';
                                        const qVal = a.qty !== undefined ? Number(a.qty) : (a.fraction || 0) * totalBomQty;
                                        return (
                                          <li key={i}>{bomRef ? bomRef.item_name : (a.bom_name || String(a.bom_id).substring(0,8))} <span className="font-mono text-amber-700 font-bold ml-1">{qVal % 1 === 0 ? qVal : qVal.toFixed(2)} {uom} ({Math.round((a.fraction || 0) * 100)}%)</span></li>
                                        );
                                      })}
                                    </ul>
                                  );
                                })()
                              )
                            ) : (
                              (() => {
                                // Algebraic aggregation of materials from upstream PRODUCT nodes
                                const upstreamProducts = getUpstreamProductNodes(step.id, steps);
                                if (upstreamProducts.length === 0) return <span className="italic text-stone-400">Input requirement handled upstream</span>;
                                
                                const aggregated = new Map<string, number>();
                                upstreamProducts.forEach(prod => {
                                  let allocs: any[] = [];
                                  try { allocs = typeof prod.bom_allocations === 'string' ? JSON.parse(prod.bom_allocations) : prod.bom_allocations || []; } catch(e){}
                                  allocs.forEach(a => {
                                    const c = aggregated.get(a.bom_id) || 0;
                                    aggregated.set(a.bom_id, c + (a.fraction || 0));
                                  });
                                });

                                if (aggregated.size === 0) {
                                  return (
                                    <div className="flex flex-col gap-1">
                                      <span className="font-bold text-[9px] text-stone-500 uppercase">Input Material:</span>
                                      <ul className="list-disc pl-3">
                                        {upstreamProducts.map((p, i) => <li key={i}>{p?.process_name}</li>)}
                                      </ul>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="flex flex-col gap-1">
                                    <span className="font-bold text-[9px] text-blue-700 uppercase">Aggregated Material Requirements:</span>
                                    <ul className="list-disc pl-3">
                                      {Array.from(aggregated.entries()).map(([bomId, frac], i) => {
                                        const bomRef = projectBoms.find(b => b.id === bomId);
                                        return (
                                          <li key={i} className="text-stone-700">
                                            {bomRef ? `${bomRef.item_name} (${bomRef.item_code})` : String(bomId).substring(0,8)} 
                                            <span className="font-mono text-blue-700 font-bold ml-1">{Math.round(frac * 100)}%</span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                )
                              })()
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isProduct ? (
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                  productRole === "WIP_SUB_ASSY"
                                    ? "bg-indigo-100 text-indigo-800"
                                    : productRole === "FINISHED_GOOD"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {productRole === "WIP_SUB_ASSY"
                                  ? "IPQC GATE"
                                  : productRole === "FINISHED_GOOD"
                                  ? "FINAL QC"
                                  : "RAW INPUT"}
                              </span>
                            ) : (
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                  step.execution_type === "PARALLEL"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-stone-100 text-stone-700"
                                }`}
                              >
                                {step.execution_type || "SERIAL"}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-[11px] text-stone-600">
                            {isProduct ? (
                              productRole === "MATERIAL_INPUT" ? (
                                <span className="text-[10px] text-amber-800 font-medium italic">
                                  Raw Material Input Verification before Process
                                </span>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  {qcParams.length > 0 ? (
                                    <div className="space-y-1">
                                      {qcParams.map((qp, qIdx) => (
                                        <div
                                          key={qp.id || qIdx}
                                          className="flex items-center justify-between gap-2 text-[10px] bg-white/80 border border-stone-200 px-2 py-0.5 rounded"
                                        >
                                          <div>
                                            <span className="font-bold text-stone-900">
                                              {qp.parameter_name}
                                            </span>
                                            {qp.specification && (
                                              <span className="font-mono text-indigo-700 ml-1">
                                                ({qp.specification})
                                              </span>
                                            )}
                                          </div>
                                          <span className="font-mono text-[9px] text-stone-500">
                                            [{qp.measurement_method}]
                                            {qp.is_mandatory_gate !== false ? " • HOLD" : ""}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : step.qc_criteria ? (
                                    <div className="flex items-start gap-1">
                                      <span className="font-bold text-stone-700">QC:</span>
                                      <span>{step.qc_criteria}</span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-stone-500 italic">
                                      Standard Visual &amp; Dimensional QC Gate
                                    </span>
                                  )}
                                  {step.expected_yield_rate && (
                                    <div className="flex items-start gap-1">
                                      <span className="font-bold text-stone-700 text-[10px]">Yield:</span>
                                      <span className="text-[10px] font-mono text-stone-600">{step.expected_yield_rate}%</span>
                                    </div>
                                  )}
                                </div>
                              )
                            ) : step.sop_instruction ? (
                              <div className="flex items-start gap-1">
                                <span className="font-bold text-stone-700">SOP:</span>
                                <span>{step.sop_instruction}</span>
                              </div>
                            ) : (
                              <span className="text-stone-400 italic">Standard execution (QC at Output Product Card)</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center border-l border-stone-200">
                            <div className="h-6 border border-dashed border-stone-300 rounded bg-white"></div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-stone-50 font-bold border-t border-stone-300 text-stone-900">
                      <td colSpan={3} className="py-2 px-3 text-right uppercase tracking-wider text-[10px]">
                        Total Route Nodes:
                      </td>
                      <td colSpan={3} className="py-2 px-3 text-left text-[10px] text-stone-600 font-normal">
                        {steps.filter(s => s.node_type !== "PRODUCT").length} Processes, {steps.filter(s => s.node_type === "PRODUCT").length} Product Cards (Material Input / WIP IPQC / Finished Good)
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Unallocated Materials Warning */}
              {(() => {
                if (!projectBoms || projectBoms.length === 0) return null;
                const allocatedMap = new Map<string, number>();
                projectBoms.forEach(b => allocatedMap.set(b.id, 0));
                
                steps.forEach(s => {
                  if (s.node_type === "PRODUCT" && s.bom_allocations) {
                     let allocs: any[] = [];
                     try { allocs = typeof s.bom_allocations === 'string' ? JSON.parse(s.bom_allocations) : s.bom_allocations; } catch(e){}
                     allocs.forEach((a: any) => {
                       const curr = allocatedMap.get(a.bom_id) || 0;
                       allocatedMap.set(a.bom_id, curr + (a.fraction || 1));
                     });
                  }
                });
                
                const unallocated = projectBoms.filter(b => {
                  const alloc = allocatedMap.get(b.id) || 0;
                  return alloc < 0.99; // Not fully allocated
                });

                if (unallocated.length === 0) return null;

                return (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-800 font-bold text-xs mb-1">
                      <ShieldCheck className="w-4 h-4" />
                      Unallocated Material Warning
                    </div>
                    <p className="text-[10px] text-red-700 mb-2">
                      The following BOM items have not been fully allocated to any Product Milestone. These materials might be missing from the assembly floor:
                    </p>
                    <ul className="list-disc pl-4 text-[10px] text-red-700">
                      {unallocated.map(b => {
                         const alloc = allocatedMap.get(b.id) || 0;
                         return (
                           <li key={b.id}>
                             <span className="font-bold">{b.item_name} ({b.item_code})</span> 
                             — {Math.round(alloc * 100)}% allocated
                           </li>
                         );
                      })}
                    </ul>
                  </div>
                );
              })()}

              {/* Symmetrical Standard ERP Signatures & Traveler Verification */}
              <div className="mt-8 pt-4 border-t border-stone-200 space-y-4">
                <div className="flex items-start gap-3 p-3 bg-stone-50 border border-stone-200 rounded-xl text-left">
                  <div className="shrink-0 bg-white p-1.5 border border-stone-200 rounded-lg">
                    <QRCodeSVG value={verificationUrl} size={54} level="M" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9.5px] font-bold text-stone-500 uppercase tracking-wider">
                      Process Route Release &amp; Dual Verification
                    </div>
                    <p className="text-[10.5px] text-stone-600 leading-snug">
                      Official document authorized under two-phase protocol: Engineering Technical Approval &amp; Production Operational Acceptance.
                    </p>
                    <div className="text-[9px] font-mono text-stone-500">
                      <span className="font-bold text-stone-800 block">DIGITAL BOP: WO-{project.spk_number || project.id}</span>
                    </div>
                  </div>
                </div>

                {/* Dual Symmetrical Signatures: Engineering + Production */}
                <div className="grid grid-cols-2 gap-8 pt-2 items-start text-center">
                  {/* Column 1: Engineering Technical Authorization */}
                  <div className="border border-stone-200 bg-stone-50/50 rounded-2xl p-4 flex flex-col items-center">
                    <div className="text-[10px] font-black uppercase tracking-wider text-stone-700 mb-0.5">
                      Phase 1: Technical Authorization
                    </div>
                    <div className="text-[9px] text-stone-500 uppercase font-semibold mb-2">
                      Engineering Division
                    </div>
                    <div className="h-14 flex items-center justify-center my-1 w-full">
                      <div className="flex items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 py-1.5 rounded-xl w-full justify-center">
                        <QrCode className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div className="text-left">
                          <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                            Digitally Authorized
                          </div>
                          <div className="text-[8px] font-mono text-emerald-700 leading-none truncate max-w-[150px]">
                            {project.bop_authorized_by || "Head of Engineering"}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1.5 w-full">
                      {project.bop_authorized_by || "Engineering Manager"}
                    </div>
                    <div className="text-[9px] font-mono text-stone-500 mt-0.5">
                      {project.bop_authorized_at ? new Date(project.bop_authorized_at).toLocaleDateString() : issueDateStr}
                    </div>
                  </div>

                  {/* Column 2: Production Operational Acceptance */}
                  <div className="border border-stone-200 bg-stone-50/50 rounded-2xl p-4 flex flex-col items-center">
                    <div className="text-[10px] font-black uppercase tracking-wider text-stone-700 mb-0.5">
                      Phase 2: Operational Acceptance
                    </div>
                    <div className="text-[9px] text-stone-500 uppercase font-semibold mb-2">
                      Production &amp; Operations Division
                    </div>
                    <div className="h-14 flex items-center justify-center my-1 w-full">
                      {project.production_acceptance_status === "ACCEPTED" ? (
                        <div className="flex items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 py-1.5 rounded-xl w-full justify-center">
                          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                          <div className="text-left">
                            <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                              Operationally Accepted
                            </div>
                            <div className="text-[8px] font-mono text-emerald-700 leading-none truncate max-w-[150px]">
                              {project.production_accepted_by || "Production Manager"}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-1.5 rounded-xl w-full justify-center">
                          <div className="text-left">
                            <div className="text-[9px] font-black text-amber-800 uppercase leading-none mb-0.5">
                              Pending Sign-off
                            </div>
                            <div className="text-[8px] font-mono text-amber-700 leading-none">
                              Awaiting Production Sign-off
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-xs font-bold uppercase text-stone-900 border-t border-stone-200 pt-1.5 w-full">
                      {project.production_accepted_by || "Head of Production"}
                    </div>
                    <div className="text-[9px] font-mono text-stone-500 mt-0.5">
                      {project.production_accepted_at ? new Date(project.production_accepted_at).toLocaleDateString() : (project.bop_status === "AUTHORIZED" ? "Awaiting Manager PIN" : "-")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </PrintTemplate>
        </PdfPreviewWrapper>
      </div>
    </Modal>
  );
};
