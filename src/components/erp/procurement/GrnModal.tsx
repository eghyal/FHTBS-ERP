import React, { memo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { ClipboardCheck, ShieldCheck, Layers } from "lucide-react";

interface GrnModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPoDetails: any;
  handleCompleteGrn: (e: React.FormEvent) => void;
  grnForm: {
    received_date: string;
    qc_status: string;
    remarks: string;
  };
  setGrnForm: React.Dispatch<
    React.SetStateAction<{
      received_date: string;
      qc_status: string;
      remarks: string;
      engineering_user?: string;
      qc_user?: string;
    }>
  >;
  grnItems: any[];
  setGrnItems: React.Dispatch<React.SetStateAction<any[]>>;
  grnAuthPin: string;
  setGrnAuthPin: (val: string) => void;
  isSubmitting: boolean;
  user: any;
}

export const GrnModal = memo(function GrnModal({
  isOpen,
  onClose,
  selectedPoDetails,
  handleCompleteGrn,
  grnForm,
  setGrnForm,
  grnItems,
  setGrnItems,
  grnAuthPin,
  setGrnAuthPin,
  isSubmitting,
  user,
}: GrnModalProps) {
  if (!selectedPoDetails) return null;

  const syncOverallStatusFromItems = (updatedItems: any[]) => {
    let totalDeliv = 0;
    let totalPass = 0;
    let totalRej = 0;
    for (const it of updatedItems) {
      const deliv = Math.max(0, Number(it.qty_received || 0));
      const rej = Math.max(0, Math.min(deliv, Number(it.qty_rejected || 0)));
      const pass =
        it.qty_passed !== undefined
          ? Math.max(0, Math.min(deliv, Number(it.qty_passed)))
          : Math.max(0, deliv - rej);
      totalDeliv += deliv;
      totalPass += pass;
      totalRej += rej;
    }
    let nextStatus = grnForm.qc_status;
    if (totalDeliv > 0) {
      if (totalPass === 0 && totalRej > 0) {
        nextStatus = "REJECTED";
      } else if (totalPass > 0 && totalRej > 0) {
        nextStatus = "CONDITIONAL";
      } else if (totalPass > 0 && totalRej === 0) {
        nextStatus = "PASSED";
      }
    }
    if (nextStatus !== grnForm.qc_status) {
      setGrnForm((prev) => ({ ...prev, qc_status: nextStatus }));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="6xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-stone-100 border border-stone-200/80 rounded-lg flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-4 h-4 text-stone-700" />
          </div>
          <div>
            <div className="text-base font-bold text-stone-900 tracking-tight">
              Incoming Material QC &amp; Receiving Confirmation (GRN)
            </div>
            <div className="text-[11px] text-stone-500 font-mono tabular-nums font-semibold uppercase mt-0.5">
              {selectedPoDetails?.po_number || "N/A"} · Supplier:{" "}
              {selectedPoDetails?.supplier_name || "Vendor"}
            </div>
          </div>
        </div>
      }
      footer={
        <div className="flex flex-wrap justify-between items-center gap-2 w-full">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => {
              const updated = grnItems.map((item) => {
                const pending = Math.max(
                  0,
                  Number(item.qty || 0) - Number(item.received_qty || 0)
                );
                return {
                  ...item,
                  qty_received: pending,
                  qty_passed: pending,
                  qty_rejected: 0,
                };
              });
              setGrnItems(updated);
              syncOverallStatusFromItems(updated);
            }}
          >
            Auto-Fill All Pending (100% Pass)
          </Button>
          <div className="flex gap-2.5">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              form="grn-form"
              type="submit"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Processing..." : "Confirm QC & Issue GRN"}
            </Button>
          </div>
        </div>
      }
    >
      <form id="grn-form" onSubmit={handleCompleteGrn} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Received Date"
            required
            type="date"
            value={grnForm.received_date}
            onChange={(e) =>
              setGrnForm({ ...grnForm, received_date: e.target.value })
            }
          />
          <Select
            label="Overall GRN QC Disposition"
            value={grnForm.qc_status}
            onChange={(e) => {
              const nextStatus = e.target.value;
              setGrnForm({ ...grnForm, qc_status: nextStatus });
              if (nextStatus === "REJECTED") {
                setGrnItems((prev) =>
                  prev.map((it) => ({
                    ...it,
                    qty_passed: 0,
                    qty_rejected: Number(it.qty_received || 0),
                  }))
                );
              } else if (nextStatus === "PASSED") {
                setGrnItems((prev) =>
                  prev.map((it) => ({
                    ...it,
                    qty_passed: Number(it.qty_received || 0),
                    qty_rejected: 0,
                  }))
                );
              }
            }}
          >
            <option value="PASSED">Passed (All Items Conform)</option>
            <option value="CONDITIONAL">
              Conditional / Partial Pass (Split Pass &amp; Reject)
            </option>
            <option value="REJECTED">Rejected (Hold / Return to Vendor)</option>
          </Select>
        </div>

        <div className="p-3.5 bg-stone-50 border border-stone-200/80 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-xs uppercase">
              {(user?.name || user?.username || "P").charAt(0)}
            </div>
            <div>
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                Inspector &amp; Receiver
              </div>
              <div className="text-xs font-bold text-stone-900 mt-0.5">
                {user?.name || user?.username || "QA/QC Team"}{" "}
                <span className="font-medium text-stone-500 text-[10px]">
                  ({user?.role || "QA_QC"})
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/80 text-[10px] font-bold tracking-wider uppercase">
            <ShieldCheck className="w-3.5 h-3.5" /> BOM Spec &amp; Split QC Gate
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-stone-500" />
              Per-Item BOM Specification Check &amp; Split Quantity Disposition
            </label>
            <span className="text-[10px] font-mono text-stone-500">
              Only <strong>QC Passed</strong> qty enters Warehouse Stock
            </span>
          </div>

          <div className="overflow-x-auto border border-stone-200 rounded-xl">
            <Table compact className="min-w-[820px]">
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>Material &amp; Engineering BOM Spec</TableHead>
                <TableHead className="w-40">Batch / COA Ref</TableHead>
                <TableHead className="text-center w-24">Pending PO</TableHead>
                <TableHead className="text-right w-28">Qty Delivered</TableHead>
                <TableHead className="text-right w-28">QC Passed</TableHead>
                <TableHead className="text-right w-28">QC Rejected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grnItems.map((item, idx) => {
                const pendingVolume = Math.max(
                  0,
                  Number(item.qty || 0) - Number(item.received_qty || 0)
                );
                const qtyDelivered = Math.max(0, Number(item.qty_received ?? pendingVolume));
                const qtyRejected = Math.max(
                  0,
                  Math.min(qtyDelivered, Number(item.qty_rejected ?? 0))
                );
                const qtyPassed =
                  item.qty_passed !== undefined
                    ? Math.max(0, Math.min(qtyDelivered, Number(item.qty_passed)))
                    : Math.max(0, qtyDelivered - qtyRejected);

                return (
                  <TableRow key={item.item_id || idx}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-stone-900 tabular-nums tracking-tight">
                          {item.item_code}
                        </span>
                        {qtyRejected > 0 && (
                          <Badge variant="danger" size="sm">
                            {qtyRejected} Rej
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-stone-800 truncate max-w-[230px] mt-0.5">
                        {item.item_name}
                      </div>
                      {(item.dimension || item.spec) ? (
                        <div className="text-[10px] font-mono text-emerald-800 bg-emerald-50/70 border border-emerald-200/70 px-1.5 py-0.5 rounded mt-1 inline-block">
                          BOM Spec: {[item.dimension, item.spec].filter(Boolean).join(" · ")}
                        </div>
                      ) : (
                        <div className="text-[10px] font-mono text-stone-400 mt-0.5">
                          Standard Catalog Tolerance
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <input
                        type="text"
                        placeholder="COA / Lot #..."
                        value={item.batch_lot_number || ""}
                        onChange={(e) => {
                          const next = [...grnItems];
                          next[idx] = {
                            ...next[idx],
                            batch_lot_number: e.target.value,
                          };
                          setGrnItems(next);
                        }}
                        className="w-full h-8 bg-stone-50 border border-stone-200/90 hover:bg-white rounded-lg px-2 text-[11px] font-mono tabular-nums text-stone-800 focus:bg-white focus:border-stone-400 outline-none transition-all"
                      />
                    </TableCell>

                    <TableCell className="text-center">
                      <span className="text-xs font-bold text-stone-900 font-mono tabular-nums">
                        {pendingVolume}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 ml-1">
                        {item.uom}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max={pendingVolume}
                          value={qtyDelivered}
                          onChange={(e) => {
                            const newDeliv = Math.max(
                              0,
                              Math.min(pendingVolume, Number(e.target.value) || 0)
                            );
                            const newRej = Math.min(newDeliv, qtyRejected);
                            const newPass = Math.max(0, newDeliv - newRej);
                            const next = [...grnItems];
                            next[idx] = {
                              ...next[idx],
                              qty_received: newDeliv,
                              qty_passed: newPass,
                              qty_rejected: newRej,
                            };
                            setGrnItems(next);
                            syncOverallStatusFromItems(next);
                          }}
                          className="w-full h-8 bg-stone-50 border border-stone-200/90 hover:bg-white rounded-lg px-2 pr-8 text-right text-xs font-mono tabular-nums font-bold text-stone-900 focus:bg-white focus:border-stone-400 outline-none transition-all"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-stone-400 uppercase pointer-events-none">
                          {item.uom}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max={qtyDelivered}
                          value={qtyPassed}
                          onChange={(e) => {
                            const newPass = Math.max(
                              0,
                              Math.min(qtyDelivered, Number(e.target.value) || 0)
                            );
                            const newRej = Math.max(0, qtyDelivered - newPass);
                            const next = [...grnItems];
                            next[idx] = {
                              ...next[idx],
                              qty_passed: newPass,
                              qty_rejected: newRej,
                            };
                            setGrnItems(next);
                            syncOverallStatusFromItems(next);
                          }}
                          className="w-full h-8 bg-emerald-50/60 border border-emerald-200 hover:bg-white rounded-lg px-2 pr-8 text-right text-xs font-mono tabular-nums font-bold text-emerald-800 focus:bg-white focus:border-emerald-500 outline-none transition-all"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-emerald-600 uppercase pointer-events-none">
                          {item.uom}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max={qtyDelivered}
                          value={qtyRejected}
                          onChange={(e) => {
                            const newRej = Math.max(
                              0,
                              Math.min(qtyDelivered, Number(e.target.value) || 0)
                            );
                            const newPass = Math.max(0, qtyDelivered - newRej);
                            const next = [...grnItems];
                            next[idx] = {
                              ...next[idx],
                              qty_passed: newPass,
                              qty_rejected: newRej,
                            };
                            setGrnItems(next);
                            syncOverallStatusFromItems(next);
                          }}
                          className="w-full h-8 bg-rose-50/60 border border-rose-200 hover:bg-white rounded-lg px-2 pr-8 text-right text-xs font-mono tabular-nums font-bold text-rose-700 focus:bg-white focus:border-rose-500 outline-none transition-all"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-rose-500 uppercase pointer-events-none">
                          {item.uom}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </div>

        <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-xl flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-white border border-emerald-200/80 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="w-full">
            <h4 className="text-xs font-bold text-stone-900 mb-0.5">
              Embedded Smart e-Approval PIN
            </h4>
            <p className="text-[11px] text-stone-500 leading-relaxed mb-2.5">
              Enter your 6-digit authorization PIN to digitally sign and release this Goods Receiving Note (GRN).
            </p>
            <Input
              type="password"
              maxLength={6}
              required
              value={grnAuthPin}
              onChange={(e) => setGrnAuthPin(e.target.value.toUpperCase())}
              placeholder="Enter 6-digit PIN"
              className="font-mono tracking-[0.5em] bg-white"
            />
          </div>
        </div>

        <Textarea
          label="Notes / Dimensional Observations / Vendor Claim Remarks"
          placeholder="Record caliper measurements, surface condition, or reason for partial/full rejection..."
          value={grnForm.remarks}
          onChange={(e) =>
            setGrnForm({ ...grnForm, remarks: e.target.value })
          }
          className="h-20 resize-none"
        />
      </form>
    </Modal>
  );
});
