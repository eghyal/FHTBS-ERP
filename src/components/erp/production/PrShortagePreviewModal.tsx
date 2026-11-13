import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";

export interface PrShortageRow {
  id: string;
  item_id?: string;
  item_code: string;
  name: string;
  qty: string;
  uom?: string;
  unit?: string;
  unit_price?: string;
  free_stock?: number;
  shortage_qty?: number;
  qty_to_order?: number;
  expected_date?: string;
  notFound?: boolean;
}

interface PrShortagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  revisingPr: any;
  bomRows: PrShortageRow[];
  setBomRows: React.Dispatch<React.SetStateAction<any[]>>;
  urgency: "NORMAL" | "URGENT" | "CRITICAL";
  setUrgency: (val: "NORMAL" | "URGENT" | "CRITICAL") => void;
  onSubmitPr: () => void;
  isSubmitting: boolean;
}

export const PrShortagePreviewModal = React.memo<PrShortagePreviewModalProps>(function PrShortagePreviewModal({
  isOpen,
  onClose,
  revisingPr,
  bomRows,
  setBomRows,
  urgency,
  setUrgency,
  onSubmitPr,
  isSubmitting,
}) {
  const shortageRows = useMemo(
    () => bomRows.filter((r) => (r.shortage_qty || 0) > 0),
    [bomRows]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
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
                <div className="text-xs font-bold text-rose-800 uppercase tracking-widest mb-1.5">
                  Revision Requested
                </div>
                <div className="text-sm font-medium text-rose-700 leading-relaxed max-w-3xl">
                  "{revisingPr.revision_note}"
                </div>
              </div>
            </div>
          )}
          {shortageRows.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <div className="text-stone-900 font-medium">
                Sufficient Stock Available
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!revisingPr && (
                <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg text-orange-800 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">Shortage Detected</div>
                    <div>Items will be added to the PR.</div>
                  </div>
                </div>
              )}
              <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                <div className="p-4 border-b border-stone-100 bg-stone-50 flex items-center justify-end gap-4">
                  <div className="text-right">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
                      PR Urgency Level
                    </label>
                    <Select
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value as any)}
                      className={cn(
                        "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest border border-stone-200 outline-none cursor-pointer transition-all shadow-sm h-auto",
                        urgency === "NORMAL" && "bg-blue-50 text-blue-600",
                        urgency === "URGENT" && "bg-orange-50 text-orange-600",
                        urgency === "CRITICAL" && "bg-rose-50 text-rose-600 animate-pulse",
                      )}
                    >
                      <option value="NORMAL">Normal</option>
                      <option value="URGENT">Urgent</option>
                      <option value="CRITICAL">Critical</option>
                    </Select>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Shortage</TableHead>
                      <TableHead className="text-center">Exp. Delivery Date</TableHead>
                      <TableHead className="text-right">Req Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shortageRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-mono font-bold text-stone-900">
                            {row.item_code}
                          </div>
                          <div className="text-xs text-stone-500">
                            {row.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-stone-600 font-bold font-mono tabular-nums">
                          {row.shortage_qty} {row.uom}
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="date"
                            value={(row as any).expected_date || ""}
                            onChange={(e) => {
                              setBomRows((rows) =>
                                rows.map((r) =>
                                  r.id === row.id
                                    ? {
                                        ...r,
                                        expected_date: e.target.value,
                                      }
                                    : r,
                                ),
                              );
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="w-24 ml-auto">
                            <Input
                              type="number"
                              min="0"
                              value={
                                (row as any).qty_to_order !== undefined
                                  ? (row as any).qty_to_order
                                  : row.shortage_qty
                              }
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setBomRows((rows) => {
                                  const newRows = [...rows];
                                  const rowIdx = newRows.findIndex(
                                    (r) => r.id === row.id,
                                  );
                                  if (rowIdx > -1) {
                                    newRows[rowIdx] = {
                                      ...newRows[rowIdx],
                                      qty_to_order: val,
                                    };
                                  }
                                  return newRows;
                                });
                              }}
                              className="text-right font-mono tabular-nums font-bold"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
        <div className="p-6 border-t border-stone-100 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmitPr} isLoading={isSubmitting}>
            {revisingPr ? "Submit Revision" : "Finalize & Print PR"}
          </Button>
        </div>
      </div>
    </Modal>
  );
});
