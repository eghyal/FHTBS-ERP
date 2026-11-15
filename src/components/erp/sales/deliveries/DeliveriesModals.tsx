import React from "react";
import {
  AlertTriangle,
  Download,
  Layers,
  Plus,
  QrCode,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { PrintTemplate } from "@/components/erp/PrintTemplate";
import { A5LandscapePrintTemplate } from "@/components/erp/A5PrintTemplate";
import { PdfPreviewWrapper } from "@/components/shared/PdfPreviewWrapper";
import { CloudFileUploader } from "@/components/shared/CloudFileUploader";

export interface DeliveriesModalsProps {
  customers: any[];
  quotations: any[];
  projects: any[];
  fgItems: any[];
  isSubmitting: boolean;
  showToast: (
    msg: string,
    type?: "success" | "error" | "info" | "warning",
  ) => void;

  // Create / Revise Delivery Modal
  showDeliveryModal: boolean;
  setShowDeliveryModal: React.Dispatch<React.SetStateAction<boolean>>;
  revisingDn: any;
  setRevisingDn: React.Dispatch<React.SetStateAction<any>>;
  deliveryForm: {
    customer_id: string;
    quotation_id: string;
    project_id: string;
    remarks: string;
    items: any[];
    police_number: string;
    delivery_type: string;
    is_partial: boolean;
  };
  setDeliveryForm: React.Dispatch<React.SetStateAction<any>>;
  handleCreateDelivery: (e: React.FormEvent) => void;

  // Item Select Modal
  showItemSelectModal: boolean;
  setShowItemSelectModal: React.Dispatch<React.SetStateAction<boolean>>;
  addItemToDelivery: (item: any) => void;

  // Revise Note Modal
  showReviseModal: boolean;
  setShowReviseModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedDnToRevise: any;
  revisionNote: string;
  setRevisionNote: React.Dispatch<React.SetStateAction<string>>;
  handleReviseDn: (e: React.FormEvent) => void;

  // Finish Delivery Modal
  showFinishModal: boolean;
  setShowFinishModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFinishDn: any;
  finishCloudUrl: string;
  setFinishCloudUrl: React.Dispatch<React.SetStateAction<string>>;
  finishDnFile: File | null;
  setFinishDnFile: React.Dispatch<React.SetStateAction<File | null>>;
  setAuthDocName: React.Dispatch<React.SetStateAction<string>>;
  handleFinishDelivery: (e: React.FormEvent) => void;

  // Preview Delivery Note Document Modal
  previewDn: any;
  setPreviewDn: React.Dispatch<React.SetStateAction<any>>;
  printDocRef: React.RefObject<HTMLDivElement | null>;
  exportPdf: () => void;

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

  // Authorize Modal
  showAuthorizeModal: boolean;
  setShowAuthorizeModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedDnToAuth: any;
  setAuthPin: React.Dispatch<React.SetStateAction<string>>;
  submitAuthorizeDn: (pin: string) => void;

  // Receipt Modal (A5 Landscape)
  showReceiptModal: boolean;
  setShowReceiptModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedReceiptDn: any;
  receiptForm: {
    received_by: string;
    delivered_by: string;
    authorized_by: string;
    receipt_date: string;
    notes: string;
  };
  receiptDocRef: React.RefObject<HTMLDivElement | null>;
  handleExportReceiptPdf: () => void;
}

export const DeliveriesModals = React.memo(function DeliveriesModals({
  customers,
  quotations,
  projects,
  fgItems,
  isSubmitting,
  showToast,
  showDeliveryModal,
  setShowDeliveryModal,
  revisingDn,
  setRevisingDn,
  deliveryForm,
  setDeliveryForm,
  handleCreateDelivery,
  showItemSelectModal,
  setShowItemSelectModal,
  addItemToDelivery,
  showReviseModal,
  setShowReviseModal,
  selectedDnToRevise,
  revisionNote,
  setRevisionNote,
  handleReviseDn,
  showFinishModal,
  setShowFinishModal,
  selectedFinishDn,
  finishCloudUrl,
  setFinishCloudUrl,
  finishDnFile,
  setFinishDnFile,
  setAuthDocName,
  handleFinishDelivery,
  previewDn,
  setPreviewDn,
  printDocRef,
  exportPdf,
  confirmModal,
  setConfirmModal,
  showAuthorizeModal,
  setShowAuthorizeModal,
  selectedDnToAuth,
  setAuthPin,
  submitAuthorizeDn,
  showReceiptModal,
  setShowReceiptModal,
  selectedReceiptDn,
  receiptForm,
  receiptDocRef,
  handleExportReceiptPdf,
}: DeliveriesModalsProps) {
  return (
    <>
      {/* Initiate Delivery Modal */}
      <Modal
        isOpen={showDeliveryModal}
        onClose={() => {
          setShowDeliveryModal(false);
          setRevisingDn(null);
        }}
        title={
          revisingDn
            ? `Revise Outbound Note: ${revisingDn.dn_number}`
            : "Initiate Outbound Note"
        }
        maxWidth="5xl"
        contentClassName="p-0 flex flex-col min-h-0"
      >
        <form onSubmit={handleCreateDelivery} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 sm:p-6 overflow-y-auto space-y-6 bg-stone-50 flex-1 min-h-0">
            <div className="flex flex-col mb-6">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                Destination / Customer <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={deliveryForm.customer_id}
                onChange={(e) => {
                  const cid = e.target.value;
                  setDeliveryForm((prev: any) => ({
                    ...prev,
                    customer_id: cid,
                    quotation_id: "",
                    project_id: "",
                    items: [],
                  }));
                }}
                className="w-full px-4 py-3 bg-white border border-stone-200 text-sm font-bold text-stone-900 rounded-xl focus:border-stone-400 outline-none transition-all shadow-sm"
              >
                <option value="">-- Select Destination --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            {deliveryForm.customer_id && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="flex flex-col">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                    Related Quotation <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={deliveryForm.quotation_id}
                    onChange={(e) => {
                      const qid = e.target.value;
                      const selectedQuo = quotations.find((q) => q.id === qid);
                      const relatedProjects = projects.filter(
                        (p) =>
                          p.quotation_id === qid ||
                          (selectedQuo &&
                            p.quotation_number ===
                              selectedQuo.quotation_number),
                      );

                      let newItems: any[] = [];
                      if (relatedProjects.length > 0) {
                        for (const proj of relatedProjects) {
                          const matchingFg = fgItems.find(
                            (i) =>
                              i.item_code === `FG-${proj.id}` ||
                              i.item_code === `FG-${proj.id}-SUB`,
                          );
                          const pQty =
                            Number(proj.qty) > 0
                              ? Number(proj.proj_qty || proj.qty)
                              : 1;
                          if (matchingFg) {
                            newItems.push({
                              item_id: matchingFg.id,
                              item_code: matchingFg.item_code,
                              item_name: `${matchingFg.name} (${proj.name})`,
                              qty: pQty,
                              uom: matchingFg.uom || proj.uom || "Unit",
                            });
                          } else {
                            newItems.push({
                              item_id: proj.id,
                              item_code: `FG-${proj.id}`,
                              item_name: `Finish Good - ${proj.name}`,
                              qty: pQty,
                              uom: proj.uom || "Unit",
                            });
                          }
                        }
                      } else if (
                        selectedQuo &&
                        selectedQuo.items &&
                        selectedQuo.items.length > 0
                      ) {
                        newItems = selectedQuo.items.map((it: any) => {
                          return {
                            item_id: it.id,
                            item_code:
                              it.item_code || `QI-${it.id.slice(0, 8)}`,
                            item_name:
                              it.title ||
                              it.description ||
                              it.item_name ||
                              "Commercial Product",
                            qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
                            uom: it.uom || "Unit",
                          };
                        });
                      }

                      setDeliveryForm((prev: any) => ({
                        ...prev,
                        quotation_id: qid,
                        project_id:
                          relatedProjects.length > 0
                            ? relatedProjects[0].id
                            : "",
                        items: newItems,
                      }));
                    }}
                    className="w-full px-4 py-3 bg-white border border-stone-200 text-sm font-bold text-stone-900 rounded-xl focus:border-stone-400 outline-none transition-all shadow-sm"
                  >
                    <option value="">-- Select Related Quotation --</option>
                    {(Array.isArray(quotations) ? quotations : [])
                      .filter((q) => {
                        const selectedCustomerObj = (
                          Array.isArray(customers) ? customers : []
                        ).find((c) => c.id === deliveryForm.customer_id);
                        return (
                          q.customer_id === deliveryForm.customer_id ||
                          (selectedCustomerObj &&
                            q.customer_name &&
                            q.customer_name.toLowerCase().trim() ===
                              selectedCustomerObj.name.toLowerCase().trim())
                        );
                      })
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.quotation_number || q.id} -{" "}
                          {q.title || "Quotation"} ({q.status})
                        </option>
                      ))}
                  </select>

                  {/* Bulk Order / Related Projects Status Card */}
                  {deliveryForm.quotation_id &&
                    (() => {
                      const selectedQuo = (
                        Array.isArray(quotations) ? quotations : []
                      ).find((q) => q.id === deliveryForm.quotation_id);
                      const relatedProjects = (
                        Array.isArray(projects) ? projects : []
                      ).filter(
                        (p) =>
                          p.quotation_id === deliveryForm.quotation_id ||
                          (selectedQuo &&
                            p.quotation_number ===
                              selectedQuo.quotation_number),
                      );
                      const unfinished = (
                        Array.isArray(relatedProjects) ? relatedProjects : []
                      ).filter(
                        (p) =>
                          p.status !== "FINISHED" &&
                          p.status !== "COMPLETED" &&
                          p.status !== "CLOSED",
                      );

                      return (
                        <div className="mt-3 space-y-2">
                          {relatedProjects.length > 0 ? (
                            <div className="p-3 bg-stone-100/80 border border-stone-200 rounded-xl text-xs space-y-2">
                              <div className="flex items-center justify-between font-bold text-stone-800">
                                <span className="flex items-center gap-1.5 uppercase text-[10px] tracking-wider text-stone-600">
                                  <Layers className="w-3.5 h-3.5 text-stone-500" />{" "}
                                  Bulk Order Scope ({relatedProjects.length}{" "}
                                  Projects)
                                </span>
                                {unfinished.length === 0 ? (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-extrabold rounded uppercase tracking-wider">
                                    ✓ All Finished
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-extrabold rounded uppercase tracking-wider">
                                    {unfinished.length} Pending Unfinished
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1">
                                {relatedProjects.map((p) => {
                                  const isDone =
                                    p.status === "FINISHED" ||
                                    p.status === "COMPLETED" ||
                                    p.status === "CLOSED";
                                  return (
                                    <div
                                      key={p.id}
                                      className="flex items-center justify-between py-1 border-b border-stone-200/50 last:border-0 text-[11px]"
                                    >
                                      <span className="font-mono text-stone-700">
                                        {p.id} -{" "}
                                        <span className="font-sans font-bold text-stone-900">
                                          {p.name}
                                        </span>
                                      </span>
                                      <span
                                        className={cn(
                                          "px-1.5 py-0.5 text-[9px] font-extrabold rounded uppercase tracking-wider",
                                          isDone
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                            : "bg-amber-50 text-amber-700 border border-amber-200",
                                        )}
                                      >
                                        {p.status}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-xs text-stone-600 font-medium italic">
                              Using items from the quotation.
                            </div>
                          )}

                          {unfinished.length > 0 && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <div className="font-extrabold uppercase tracking-wide text-[10px] text-amber-950">
                                  Partial Lots Available
                                </div>
                                <div className="mt-0.5 text-[11px] leading-snug text-amber-800">
                                  Some projects are still in progress (
                                  {unfinished.map((u) => u.name).join(", ")}).
                                  You can select{" "}
                                  <strong>Partial Lot Delivery</strong> below to
                                  ship finished units ahead of schedule.
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </div>

                {/* Delivery Mode: Full vs Partial */}
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-stone-600">
                    Shipment Type
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDeliveryForm((prev: any) => ({
                          ...prev,
                          delivery_type: "FULL",
                          is_partial: false,
                        }))
                      }
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        !deliveryForm.is_partial
                          ? "bg-white border-blue-600 shadow-sm ring-2 ring-blue-500/20"
                          : "bg-stone-100/50 border-stone-200 opacity-60 hover:opacity-100",
                      )}
                    >
                      <div className="text-xs font-bold text-stone-900">
                        Full Delivery
                      </div>
                      <div className="text-[10px] text-stone-500">
                        Ship the entire order in full
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDeliveryForm((prev: any) => ({
                          ...prev,
                          delivery_type: "PARTIAL",
                          is_partial: true,
                        }))
                      }
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        deliveryForm.is_partial
                          ? "bg-white border-amber-600 shadow-sm ring-2 ring-amber-500/20"
                          : "bg-stone-100/50 border-stone-200 opacity-60 hover:opacity-100",
                      )}
                    >
                      <div className="text-xs font-bold text-amber-900">
                        Partial Lot Delivery
                      </div>
                      <div className="text-[10px] text-amber-700">
                        Ship in batches per lot
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-2">
                    Vehicle License Plate{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., DK 1234 AB"
                    value={deliveryForm.police_number}
                    onChange={(e) =>
                      setDeliveryForm((prev: any) => ({
                        ...prev,
                        police_number: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-full px-4 py-3 bg-white border border-stone-200 text-sm font-extrabold text-stone-900 rounded-xl focus:border-stone-400 outline-none transition-all shadow-sm"
                  />
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-stone-200">
              <div className="flex items-center justify-between mb-4 mt-6">
                <span className="text-sm font-bold text-stone-900 uppercase tracking-wide">
                  Delivery Payload
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    leftIcon={<Layers className="w-3.5 h-3.5" />}
                    onClick={() => {
                      if (!deliveryForm.quotation_id) {
                        showToast("Please select a Quotation first.", "error");
                        return;
                      }
                      const selectedQuo = quotations.find(
                        (q) => q.id === deliveryForm.quotation_id,
                      );
                      if (
                        selectedQuo &&
                        selectedQuo.items &&
                        selectedQuo.items.length > 0
                      ) {
                        const newItems = selectedQuo.items.map((qi: any) => ({
                          item_id: qi.id,
                          item_code: "WO-ITEM",
                          item_name: qi.title,
                          qty: qi.qty,
                          uom: qi.uom || "Unit",
                        }));
                        setDeliveryForm((prev: any) => ({
                          ...prev,
                          items: [...prev.items, ...newItems],
                        }));
                        showToast(
                          "Deliverables loaded from Work Order.",
                          "success",
                        );
                      } else {
                        showToast(
                          "No items found in the selected Quotation.",
                          "error",
                        );
                      }
                    }}
                  >
                    Load Work Order Deliverables
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                    onClick={() => setShowItemSelectModal(true)}
                  >
                    Add Items
                  </Button>
                </div>
              </div>

              <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Spec</TableHead>
                      <TableHead className="w-36 text-right">Qty</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveryForm.items.length === 0 && (
                      <TableEmpty colSpan={3} message="No products added." />
                    )}
                    {deliveryForm.items.map((it, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-stone-900">
                          <div className="font-mono tabular-nums text-[10px] text-stone-400 font-bold mb-1">
                            {it.item_code}
                          </div>
                          {it.item_name}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Input
                              type="number"
                              min={0.1}
                              step="0.1"
                              value={it.qty}
                              onChange={(e) => {
                                const newItems = [...deliveryForm.items];
                                newItems[idx].qty =
                                  parseFloat(e.target.value) || 0;
                                setDeliveryForm({
                                  ...deliveryForm,
                                  items: newItems,
                                });
                              }}
                              className="w-20 font-mono tabular-nums text-xs text-center"
                            />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                              {it.uom}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              const n = [...deliveryForm.items];
                              n.splice(idx, 1);
                              setDeliveryForm({ ...deliveryForm, items: n });
                            }}
                            className="text-stone-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Textarea
              label="Remarks"
              rows={2}
              value={deliveryForm.remarks}
              onChange={(e) =>
                setDeliveryForm({ ...deliveryForm, remarks: e.target.value })
              }
            />
          </div>

          <div className="px-5 py-3.5 sm:px-6 border-t border-stone-200 flex flex-wrap justify-end gap-2.5 bg-white shrink-0">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowDeliveryModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Processing..." : "Create Draft Manifest"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Item Select Modal */}
      <Modal
        isOpen={showItemSelectModal}
        onClose={() => setShowItemSelectModal(false)}
        title="Select Available SKUs (FG)"
        maxWidth="2xl"
      >
        <div className="space-y-3">
          {fgItems.map((item) => {
            return (
              <div
                key={item.id}
                onClick={() => addItemToDelivery(item)}
                className={cn(
                  "p-4 border bg-white rounded-2xl hover:border-stone-400 cursor-pointer transition-all flex justify-between items-center gap-3 group shadow-sm hover:shadow-md border-stone-200",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="text-[10px] font-bold font-mono text-stone-400">
                      {item.item_code}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-stone-900 truncate">
                    {item.name}
                  </div>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest bg-stone-100 text-stone-500 px-3 py-1 rounded-md group-hover:bg-stone-800 group-hover:text-white transition-colors shrink-0">
                  Select
                </div>
              </div>
            );
          })}
          {fgItems.length === 0 && (
            <div className="py-12 text-center text-stone-500 text-sm font-medium">
              No Finish Good SKUs are available in inventory yet. Use the
              Production/Engineering module to create FINISH_GOODS.
            </div>
          )}
        </div>
      </Modal>

      {/* Revise Modal */}
      <Modal
        isOpen={showReviseModal && selectedDnToRevise !== null}
        onClose={() => setShowReviseModal(false)}
        maxWidth="2xl"
        title={
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              Revise Delivery Note
            </h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">
              Return to Sales for Changes
            </p>
          </div>
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2.5 w-full">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowReviseModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="revise-dn-form"
              disabled={isSubmitting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isSubmitting ? "Processing..." : "Submit Revision"}
            </Button>
          </div>
        }
      >
        <form id="revise-dn-form" onSubmit={handleReviseDn} className="space-y-5">
          {selectedDnToRevise && (
            <div className="p-4 sm:p-5 bg-stone-50 rounded-2xl border border-stone-100">
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1.5">
                Draft DN Reference
              </div>
              <div className="text-base font-bold text-stone-900">
                {selectedDnToRevise.dn_number}
              </div>
              <div className="text-xs text-stone-500 mt-1 font-medium italic">
                Customer: {selectedDnToRevise.customer_name}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5 bg-rose-50/50 rounded-2xl border border-rose-100/50">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
            </div>
            <div className="w-full min-w-0">
              <h4 className="text-xs font-bold text-stone-900 mb-1">
                Revision Note
              </h4>
              <p className="text-[10px] text-stone-500 leading-relaxed mb-3">
                Provide clear instructions on what needs to be changed exactly
                like adding a note on a field condition. This will be sent back
                to the sales team.
              </p>
              <textarea
                required
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                placeholder="E.g., Incorrect finish good quantities or wrong project..."
                className="w-full h-24 bg-white border border-stone-200 text-stone-900 text-sm rounded-lg px-4 py-3 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 outline-none transition-all shadow-sm resize-none"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Finish Delivery Modal with standard file upload */}
      <Modal
        isOpen={showFinishModal}
        onClose={() => {
          setShowFinishModal(false);
          setFinishDnFile(null);
          setAuthDocName("");
        }}
        title="Finish Delivery"
        maxWidth="2xl"
        footer={
          selectedFinishDn ? (
            <div className="flex flex-wrap justify-end gap-2.5 w-full">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowFinishModal(false);
                  setFinishCloudUrl("");
                  setFinishDnFile(null);
                  setAuthDocName("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={isSubmitting || (!finishCloudUrl && !finishDnFile)}
                type="submit"
                form="finish-dn-form"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {isSubmitting ? "Completing..." : "Confirm Completion"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {selectedFinishDn && (
          <form id="finish-dn-form" onSubmit={handleFinishDelivery} className="space-y-5">
            <div className="p-4 sm:p-5 bg-stone-50 rounded-2xl border border-stone-100">
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-1.5">
                Delivery Reference
              </div>
              <div className="text-base font-bold text-stone-900">
                {selectedFinishDn.dn_number}
              </div>
              <div className="text-xs text-stone-500 mt-1 font-medium italic">
                Customer: {selectedFinishDn.customer_name}
              </div>
            </div>

            <div className="space-y-2">
              <CloudFileUploader
                label="Customer Signed Manifest (Direct Cloud Storage)"
                accept=".pdf,.png,.jpg,.jpeg"
                maxSizeMb={20}
                value={finishCloudUrl}
                onChange={(url) => setFinishCloudUrl(url)}
                onUploadSuccess={(url, file) => {
                  setFinishCloudUrl(url);
                  setAuthDocName(file.name);
                }}
                pathPrefix="delivery_receipts"
              />
              <p className="text-[10px] text-rose-500 font-medium tracking-wide uppercase mt-1">
                * Manifest must be signed by the receiving party (Customer /
                Client).
              </p>
            </div>
          </form>
        )}
      </Modal>

      {/* Preview Delivery Note Document - standard layout and export styling */}
      <Modal
        isOpen={!!previewDn}
        onClose={() => setPreviewDn(null)}
        title="Delivery Note Document"
        maxWidth="6xl"
        contentClassName="p-0 flex flex-col min-h-0 bg-stone-100"
        footer={
          previewDn ? (
            <div className="w-full flex flex-wrap items-center justify-end gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPreviewDn(null)}
              >
                Close
              </Button>
              <Button
                variant="dark"
                size="sm"
                onClick={() => exportPdf()}
                isLoading={isSubmitting}
                leftIcon={!isSubmitting ? <Download className="w-4 h-4" /> : undefined}
              >
                {isSubmitting ? "Generating..." : "Export PDF (A4)"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {previewDn && (
          <div className="flex-1 min-h-0 w-full bg-stone-100/80 p-3 sm:p-6 custom-scrollbar overflow-y-auto">
              <PdfPreviewWrapper>
                <PrintTemplate
                  ref={printDocRef}
                  documentTitleId="DELIVERY NOTE"
                  documentTitleEn="DELIVERY NOTE"
                  documentNameId="delivery note"
                  documentNameEn="delivery note"
                  date={new Date(previewDn.created_at).toLocaleDateString(
                    "en-US",
                    {
                      timeZone: "Asia/Jakarta",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    },
                  )}
                  referenceNumber={previewDn.dn_number}
                  documentId={previewDn.dn_number || previewDn.id}
                  isDraft={previewDn.status === "DRAFT"}
                  signatureStatus="signed"
                >
                  {/* Grid Info */}
                  <div className="grid grid-cols-2 gap-10 mb-8 pb-4 border-b border-stone-200">
                    <div>
                      <div className="text-[10px] font-extrabold tracking-widest uppercase text-stone-900 mb-2 border-b border-stone-150 pb-1">
                        Destined To (Consignee)
                      </div>
                      <div className="text-lg font-black text-stone-950 uppercase tracking-tight mb-1.5">
                        {previewDn.customer_name}
                      </div>
                      <div className="text-xs font-semibold text-stone-800 leading-relaxed whitespace-pre-wrap">
                        {previewDn.customer_address}
                      </div>
                      {previewDn.customer_email && (
                        <div className="text-xs font-medium text-stone-600 mt-1">
                          {previewDn.customer_email}
                        </div>
                      )}
                      {previewDn.customer_phone && (
                        <div className="text-xs font-medium text-stone-600 mt-0.5">
                          {previewDn.customer_phone}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-extrabold tracking-widest uppercase text-stone-900 mb-2 border-b border-stone-150 pb-1">
                        Logistics Reference
                      </div>
                      <div className="flex justify-between items-center text-xs font-medium mb-2">
                        <span className="text-stone-900 uppercase tracking-wider font-bold text-[10px]">
                          Ref. Quotation:
                        </span>
                        <span className="font-black bg-stone-50 text-stone-950 px-3 py-1 rounded text-xs tracking-wider uppercase border border-stone-300 font-mono shadow-2xs">
                          {previewDn.quotation_number || "-"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-medium mb-2">
                        <span className="text-stone-900 uppercase tracking-wider font-bold text-[10px]">
                          Product Status:
                        </span>
                        <span className="font-black bg-stone-50 text-stone-900 px-3 py-1 rounded text-xs tracking-wider uppercase border border-stone-300 shadow-2xs">
                          ASSEMBLED
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-medium mb-2">
                        <span className="text-stone-900 uppercase tracking-wider font-bold text-[10px]">
                          Police Number:
                        </span>
                        <span className="font-black bg-stone-50 text-stone-950 px-3 py-1 rounded text-xs tracking-wider uppercase border border-stone-300 font-mono shadow-2xs">
                          {previewDn.police_number || "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="flex-1 relative">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b-2 border-stone-900 bg-stone-50/50">
                          <th className="py-3 px-3 font-black text-stone-900 uppercase tracking-wider text-xs w-12 text-center">
                            No
                          </th>
                          <th className="py-3 px-3 font-black text-stone-900 uppercase tracking-wider text-xs w-36">
                            Item Code
                          </th>
                          <th className="py-3 px-3 font-black text-stone-900 uppercase tracking-wider text-xs">
                            Product Description
                          </th>
                          <th className="py-3 px-3 font-black text-stone-900 uppercase tracking-wider text-xs text-center w-28">
                            Quantity
                          </th>
                          <th className="py-3 px-3 font-black text-stone-900 uppercase tracking-wider text-xs text-center w-24">
                            UOM
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewDn.items?.map((it: any, i: number) => (
                          <tr key={i} className="border-b border-stone-200">
                            <td className="py-4 px-3 text-sm font-bold text-center text-stone-800">
                              {String(i + 1).padStart(2, "0")}
                            </td>
                            <td className="py-4 px-3 font-mono text-xs font-bold text-stone-700">
                              {it.item_code}
                            </td>
                            <td className="py-4 px-3 text-sm font-black text-stone-950 uppercase tracking-tight leading-snug">
                              {it.item_name}
                            </td>
                            <td className="py-4 px-3 text-base font-black text-center font-mono text-stone-950">
                              {it.qty}
                            </td>
                            <td className="py-4 px-3 text-xs font-black text-center text-stone-800 uppercase tracking-wider">
                              {it.uom}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {previewDn.remarks && (
                      <div className="mt-8 p-4 bg-stone-50/70 border border-stone-200 rounded-xl">
                        <div className="text-[9.5px] font-black uppercase tracking-wider text-stone-900 mb-1">
                          Outbound Remarks
                        </div>
                        <div className="text-xs font-semibold text-stone-800 leading-relaxed italic">
                          {previewDn.remarks}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Standardized multi-column logistics signatures for Delivery Note */}
                  <div className="mt-auto grid grid-cols-4 gap-4 pt-8 border-t border-stone-200">
                    <div className="text-center font-sans">
                      <div className="text-[8px] text-stone-900 uppercase tracking-widest font-bold mb-4">
                        Received by Customer
                      </div>
                      <div className="h-12 flex flex-col justify-end items-center mb-1">
                        {previewDn.signatures
                          ?.find((s: any) => s.role === "PARTY_2")
                          ?.file_url?.includes("Digitally") ? (
                          <div className="flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-2.5 py-1 rounded-lg">
                            <QrCode className="w-5 h-5 text-emerald-600" />
                            <div className="text-left">
                              <div className="text-[8px] font-black text-emerald-800 uppercase">
                                Validated
                              </div>
                              <div className="text-[7px] font-mono text-emerald-700">
                                Digital Sign
                              </div>
                            </div>
                          </div>
                        ) : previewDn.signatures
                            ?.find((s: any) => s.role === "PARTY_2")
                            ?.file_url?.startsWith("/uploads") ? (
                          <div className="text-[7px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded w-full uppercase tracking-widest text-center mt-auto">
                            [EXTERNAL SIG. ON FILE]
                          </div>
                        ) : (
                          <div className="text-[8px] opacity-0">.</div>
                        )}
                      </div>
                      <div className="pt-2 flex flex-col justify-center items-center">
                        <div className="w-28 border-b border-stone-400 mb-1"></div>
                        {previewDn.signatures
                          ?.find((s: any) => s.role === "PARTY_2")
                          ?.file_url?.includes("Digitally") ? (
                          <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider italic">
                            Auto-Assigned
                          </span>
                        ) : (
                          <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                            Date: ____/____/2026
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-center font-sans">
                      <div className="text-[8px] text-stone-900 uppercase tracking-widest font-bold mb-4">
                        Driver
                      </div>
                      <div className="h-12 flex items-center justify-center">
                        <div className="text-[8px] opacity-0">.</div>
                      </div>
                      <div className="pt-2 flex flex-col justify-center items-center">
                        <div className="w-28 border-b border-stone-400 mb-1"></div>
                        <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                          Date: ____/____/2026
                        </span>
                      </div>
                    </div>
                    <div className="text-center font-sans">
                      <div className="text-[8px] text-stone-900 uppercase tracking-widest font-bold mb-4">
                        Security
                      </div>
                      <div className="h-12 flex items-center justify-center">
                        <div className="text-[8px] opacity-0">.</div>
                      </div>
                      <div className="pt-2 flex flex-col justify-center items-center">
                        <div className="w-28 border-b border-stone-400 mb-1"></div>
                        <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                          Date: ____/____/2026
                        </span>
                      </div>
                    </div>
                    <div className="text-center font-sans flex flex-col items-center">
                      <div className="text-[8px] text-stone-900 uppercase tracking-widest font-bold mb-4">
                        Approve by Warehouse Manager
                      </div>
                      <div className="h-14 flex items-center justify-center w-full mb-1">
                        {previewDn.signatures
                          ?.find((s: any) => s.role === "DISPATCH_PHASE")
                          ?.file_url?.includes("Digitally") ? (
                          <div className="flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-2.5 py-1 rounded-lg">
                            <QrCode className="w-5 h-5 text-emerald-600" />
                            <div className="text-left">
                              <div className="text-[8px] font-black text-emerald-800 uppercase">
                                Validated
                              </div>
                              <div className="text-[7px] font-mono text-emerald-700">
                                Digital PIN
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="border border-dashed border-stone-300 rounded-lg px-2 py-1 bg-stone-50">
                            <span className="text-[8px] font-bold text-stone-400 uppercase tracking-wider">
                              Awaiting PIN
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] font-black text-stone-900 uppercase">
                        Warehouse Manager
                      </p>
                      <div className="pt-2 flex flex-col justify-center items-center">
                        <div className="w-28 border-b border-stone-100 mb-1"></div>
                        {previewDn.signatures
                          ?.find((s: any) => s.role === "DISPATCH_PHASE")
                          ?.file_url?.includes("Digitally") ? (
                          <span className="text-[7.5px] text-emerald-600 font-bold tracking-widest uppercase flex items-center gap-1">
                            VALIDATED SECURELY
                          </span>
                        ) : (
                          <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                            AWAITING AUTHORIZATION
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </PrintTemplate>
              </PdfPreviewWrapper>
          </div>
        )}
      </Modal>

      {/* Standard confirmation modal rendering */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Authorize Delivery Note Modal */}
      <AuthorizeDocModal
        isOpen={showAuthorizeModal && !!selectedDnToAuth}
        onClose={() => {
          setShowAuthorizeModal(false);
          setAuthPin("");
        }}
        docType="Delivery Note"
        docNumber={selectedDnToAuth?.dn_number || ""}
        status={selectedDnToAuth?.status}
        partnerName={
          customers.find((c) => c.id === selectedDnToAuth?.customer_id)?.name ||
          selectedDnToAuth?.customer_id
        }
        projectName={
          projects.find((p) => p.id === selectedDnToAuth?.project_id)?.name ||
          selectedDnToAuth?.project_id
        }
        isSubmitting={isSubmitting}
        onAuthorize={submitAuthorizeDn}
      />

      {/* Delivery Receipt Document Modal (A5 Landscape, Dual Language, Standard ERP Modal) */}
      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title="Delivery Receipt Note Preview (A5 Landscape)"
        maxWidth="5xl"
        contentClassName="p-0 flex flex-col min-h-0 bg-stone-100"
        footer={
          showReceiptModal ? (
            <div className="w-full flex flex-wrap items-center justify-end gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowReceiptModal(false)}
              >
                Close
              </Button>
              <Button
                variant="dark"
                size="sm"
                onClick={handleExportReceiptPdf}
                isLoading={isSubmitting}
                leftIcon={!isSubmitting ? <Download className="w-4 h-4" /> : undefined}
              >
                {isSubmitting ? "Generating..." : "Export PDF (A5 Landscape)"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {showReceiptModal && (
          <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 custom-scrollbar bg-stone-100/80 flex justify-center items-start">
              <PdfPreviewWrapper>
                <A5LandscapePrintTemplate
                  ref={receiptDocRef}
                  documentTitleId="DELIVERY RECEIPT NOTE"
                  documentTitleEn="DELIVERY RECEIPT NOTE"
                  documentNameId="Receipt Note"
                  documentNameEn="Receipt Note"
                  date={
                    receiptForm.receipt_date ||
                    new Date().toISOString().split("T")[0]
                  }
                  referenceNumber={
                    selectedReceiptDn
                      ? `RCT-${selectedReceiptDn.dn_number || selectedReceiptDn.id}`
                      : `RCT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-FORM`
                  }
                  documentId={
                    selectedReceiptDn
                      ? `RCT-${selectedReceiptDn.dn_number || selectedReceiptDn.id}`
                      : `RCT-FORM-01`
                  }
                  isDraft={false}
                >
                  {/* HEADER SECTION (Consignee & Dispatch) */}
                  <div className="grid grid-cols-2 gap-6 mb-2">
                    {/* Recipient */}
                    <div>
                      <div className="grid grid-cols-[65px_1fr] gap-x-2 gap-y-1 text-[9px] text-stone-900">
                        <div className="font-medium text-stone-600">Name</div>
                        <div className="font-bold border-b border-dotted border-stone-300 min-h-[12px]">
                          {selectedReceiptDn?.customer_name || ""}
                        </div>

                        <div className="font-medium text-stone-600">
                          Address
                        </div>
                        <div className="border-b border-dotted border-stone-300 min-h-[12px]">
                          {selectedReceiptDn?.customer_address || ""}
                        </div>

                        <div className="font-medium text-stone-600">
                          Ref / Order
                        </div>
                        <div className="font-bold border-b border-dotted border-stone-300 min-h-[12px]">
                          {selectedReceiptDn?.quotation_number
                            ? `Quo: ${selectedReceiptDn.quotation_number}`
                            : selectedReceiptDn?.project_names ||
                              selectedReceiptDn?.project_name ||
                              ""}
                        </div>
                      </div>
                    </div>

                    {/* Dispatch Info */}
                    <div>
                      <div className="grid grid-cols-[85px_1fr] gap-x-2 gap-y-1 text-[9px] text-stone-900">
                        <div className="font-medium text-stone-600">
                          License Plate
                        </div>
                        <div className="font-bold font-mono border-b border-dotted border-stone-300 min-h-[12px]">
                          {selectedReceiptDn?.police_number || ""}
                        </div>

                        <div className="font-medium text-stone-600">Driver</div>
                        <div className="border-b border-dotted border-stone-300 min-h-[12px]"></div>

                        <div className="font-medium text-stone-600">
                          Ref. No.
                        </div>
                        <div className="font-bold font-mono border-b border-dotted border-stone-300 min-h-[12px]">
                          {selectedReceiptDn?.dn_number || ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* STATEMENT */}
                  <div className="bg-stone-50 border border-stone-200 rounded p-1.5 mb-3 text-[9px] text-stone-800 leading-relaxed">
                    <div>
                      <span className="font-bold text-stone-900">
                        Acknowledgement:
                      </span>{" "}
                      Goods listed below have been physically delivered and
                      received in good condition and complete quantity.
                    </div>
                  </div>

                  {/* ITEMS TABLE */}
                  <div className="flex-1 relative mb-3 border border-stone-300 rounded overflow-hidden flex flex-col">
                    <table className="w-full text-left border-collapse border-spacing-0">
                      <thead>
                        <tr className="bg-stone-100 border-b border-stone-300 text-stone-900">
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[6%] text-center border-r border-stone-300">
                            No
                          </th>
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[18%] border-r border-stone-300">
                            Code
                          </th>
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[36%] border-r border-stone-300">
                            Description &amp; Specification
                          </th>
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[10%] text-center border-r border-stone-300">
                            Qty
                          </th>
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[10%] text-center border-r border-stone-300">
                            Unit
                          </th>
                          <th className="py-2 px-2 font-bold uppercase tracking-wider text-[9px] w-[20%]">
                            Remarks
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReceiptDn?.items &&
                        selectedReceiptDn.items.length > 0
                          ? selectedReceiptDn.items.map(
                              (it: any, i: number) => (
                                <tr
                                  key={i}
                                  className="text-[9px] text-stone-900"
                                >
                                  <td className="py-2 px-2 text-center border-r border-b border-stone-300 font-medium text-stone-400">
                                    {String(i + 1).padStart(2, "0")}
                                  </td>
                                  <td className="py-2 px-2 font-mono font-bold text-stone-800 border-r border-b border-stone-300">
                                    {it.item_code || "\u00A0"}
                                  </td>
                                  <td className="py-2 px-2 font-bold text-stone-900 border-r border-b border-stone-300">
                                    {it.item_name || "\u00A0"}
                                  </td>
                                  <td className="py-2 px-2 text-center font-bold font-mono border-r border-b border-stone-300">
                                    {it.qty || "\u00A0"}
                                  </td>
                                  <td className="py-2 px-2 text-center font-medium uppercase text-stone-600 border-r border-b border-stone-300">
                                    {it.uom || "\u00A0"}
                                  </td>
                                  <td className="py-2 px-2 text-stone-600 border-b border-stone-300">
                                    {it.remarks || "\u00A0"}
                                  </td>
                                </tr>
                              ),
                            )
                          : [1, 2, 3, 4, 5, 6, 7].map((num) => (
                              <tr key={num} className="text-[9px] h-7">
                                <td className="py-1.5 px-2 text-center border-r border-b border-stone-300 font-medium text-stone-400">
                                  {String(num).padStart(2, "0")}
                                </td>
                                <td className="py-1.5 px-2 border-r border-b border-stone-300">
                                  &nbsp;
                                </td>
                                <td className="py-1.5 px-2 border-r border-b border-stone-300">
                                  &nbsp;
                                </td>
                                <td className="py-1.5 px-2 border-r border-b border-stone-300">
                                  &nbsp;
                                </td>
                                <td className="py-1.5 px-2 border-r border-b border-stone-300">
                                  &nbsp;
                                </td>
                                <td className="py-1.5 px-2 border-b border-stone-300">
                                  &nbsp;
                                </td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>

                  {/* HANDOVER REMARKS & SIGNATURES */}
                  <div className="mt-auto pt-2 border-t border-stone-200">
                    <div className="flex gap-2 items-baseline mb-4">
                      <div className="text-[9px] font-bold text-stone-900 uppercase tracking-widest shrink-0">
                        Special Remarks:
                      </div>
                      <div className="flex-1 border-b border-dotted border-stone-400 text-[9px] font-medium text-stone-800 px-1 pb-0.5 min-h-[16px]">
                        {selectedReceiptDn?.remarks || ""}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-stone-900 mb-10">
                          Delivered By
                        </div>
                        <div className="w-[80%] border-b border-stone-900 mx-auto mb-4"></div>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-stone-900 mb-10">
                          Received By
                        </div>
                        <div className="w-[80%] border-b border-stone-900 mx-auto mb-4"></div>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-stone-900 mb-10">
                          Logistics Officer
                        </div>
                        <div className="w-[80%] border-b border-stone-900 mx-auto mb-4"></div>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-stone-900 mb-10">
                          Acknowledged By
                        </div>
                        <div className="w-[80%] border-b border-stone-900 mx-auto mb-4"></div>
                      </div>
                    </div>
                  </div>
                </A5LandscapePrintTemplate>
              </PdfPreviewWrapper>
          </div>
        )}
      </Modal>
    </>
  );
});
