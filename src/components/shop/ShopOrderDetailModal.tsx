import React from "react";
import { Link } from "react-router-dom";
import {
  Phone,
  ExternalLink,
  Factory,
  Receipt,
  ArrowRight,
  Truck,
} from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { ShopOrder } from "@/types/shop";

interface ShopOrderDetailModalProps {
  selectedOrder: ShopOrder | null;
  onClose: () => void;
  isTriggeringSpkId: string | null;
  isCreatingInvoiceId: string | null;
  isDispatchingId: string | null;
  onTriggerSpk: (order: ShopOrder) => void;
  onUpdateOrderStatus: (orderId: string, newStatus: string, newPaymentStatus?: string) => void;
  onCreateInvoice: (order: ShopOrder, category?: "DOWN_PAYMENT" | "FINAL_SETTLEMENT" | "STANDARD") => void;
  onDispatchToDo: (order: ShopOrder) => void;
}

export const ShopOrderDetailModal = React.memo<ShopOrderDetailModalProps>(function ShopOrderDetailModal({
  selectedOrder,
  onClose,
  isTriggeringSpkId,
  isCreatingInvoiceId,
  isDispatchingId,
  onTriggerSpk,
  onUpdateOrderStatus,
  onCreateInvoice,
  onDispatchToDo,
}) {
  if (!selectedOrder) return null;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Order Details: ${selectedOrder.order_number}`}
      maxWidth="2xl"
    >
      <div className="space-y-4 text-xs text-stone-700">
        {/* Header Status Bar */}
        <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Order Placed</span>
            <span className="font-bold text-stone-900 font-mono tabular-nums">
              {new Date(selectedOrder.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Payment Status</span>
            <Badge variant={selectedOrder.payment_status === "PAID" ? "success" : "warning"} size="sm">
              {selectedOrder.payment_status}
            </Badge>
          </div>
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Fulfillment Status</span>
            <Badge variant="info" size="sm">
              {selectedOrder.order_status.replace("_", " ")}
            </Badge>
          </div>
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Grand Total</span>
            <span className="font-black text-stone-900 font-mono tabular-nums text-sm">
              {formatIDR(selectedOrder.total_amount)}
            </span>
          </div>
        </div>

        {/* Customer & Shipping Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-white rounded-xl border border-stone-200 space-y-1">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Customer</span>
            <div className="font-bold text-stone-900">{selectedOrder.customer_name}</div>
            <div className="text-stone-600 font-mono tabular-nums flex items-center gap-1">
              <Phone className="w-3 h-3 text-stone-400" />
              <span>{selectedOrder.customer_phone}</span>
            </div>
            {selectedOrder.customer_email && (
              <div className="text-stone-500">{selectedOrder.customer_email}</div>
            )}
          </div>

          <div className="p-3 bg-white rounded-xl border border-stone-200 space-y-1">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">
              Shipping &amp; Destination
            </span>
            <div className="font-bold text-stone-900">
              {selectedOrder.delivery_method === "PICKUP" ? "Customer Stockyard Pickup" : "Fleet Delivery"}
            </div>
            <div className="text-stone-600 leading-relaxed">{selectedOrder.delivery_address}</div>
            {selectedOrder.customer_notes && (
              <div className="text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 text-[11px] mt-2">
                <span className="font-bold">Note: </span>
                {selectedOrder.customer_notes}
              </div>
            )}
          </div>
        </div>

        {/* Payment Verification & Proof (Required except COD) */}
        {selectedOrder.payment_method !== "COD" && (
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Payment Verification &amp; Uploaded Proof
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="mb-1">
                  <span className="text-stone-500 font-medium mr-1.5">Payment Type:</span>
                  <Badge variant={selectedOrder.is_dp === 1 ? "warning" : "success"} size="sm">
                    {selectedOrder.is_dp === 1 ? "Down Payment (DP) - 50%" : "Full Payment (100%)"}
                  </Badge>
                </div>
                {selectedOrder.is_dp === 1 && (
                  <div className="mt-1.5">
                    <span className="text-stone-500 font-medium mr-1.5">Paid DP Amount:</span>
                    <span className="font-mono tabular-nums font-bold text-stone-900">
                      {formatIDR(selectedOrder.dp_amount || 0)}
                    </span>
                  </div>
                )}
                {selectedOrder.delivery_distance ? (
                  <div className="mt-1.5">
                    <span className="text-stone-500 font-medium mr-1.5">Delivery Distance:</span>
                    <span className="font-mono tabular-nums font-semibold text-stone-900">
                      {selectedOrder.delivery_distance} km
                    </span>
                  </div>
                ) : null}
              </div>

              <div>
                <span className="text-stone-500 font-medium block mb-1.5">Transfer / QRIS Proof:</span>
                {selectedOrder.payment_proof_url ? (
                  <div className="space-y-2">
                    <a
                      href={selectedOrder.payment_proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-stone-50 border border-stone-200 text-amber-800 hover:text-amber-900 font-bold text-[11px] transition-colors cursor-pointer shadow-2xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Payment Proof</span>
                    </a>
                    <div className="mt-2 border border-stone-200 rounded-lg overflow-hidden max-w-[120px] aspect-square bg-white flex items-center justify-center">
                      <img
                        src={selectedOrder.payment_proof_url}
                        alt="Transfer Proof"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-stone-400 italic">Transfer proof not uploaded yet</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Line Items Table */}
        <div className="border border-stone-200 rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedOrder.items?.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <span className="font-bold text-stone-900">{it.item_name}</span>
                    <span className="text-[10px] text-stone-400 block font-mono tabular-nums">{it.item_code}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-semibold">
                    {it.qty} {it.uom}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-stone-600">
                    {formatIDR(it.unit_price)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-bold text-stone-900">
                    {formatIDR(it.total_price)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Omnichannel Tax & Production Work Order Governance */}
        <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Tax Breakdown (Alternative Tax Base 11/12)
            </span>
            <div className="flex justify-between text-stone-600">
              <span>Taxable Base (Revenue Base):</span>
              <span className="font-mono tabular-nums font-bold text-stone-900">
                {formatIDR(selectedOrder.dpp_amount || Math.round((selectedOrder.subtotal || selectedOrder.total_amount) / 1.11))}
              </span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Alternative Tax Base (11/12):</span>
              <span className="font-mono tabular-nums font-semibold text-stone-800">
                {formatIDR(
                  selectedOrder.dpp_nilai_lain ||
                    Math.round(
                      (selectedOrder.dpp_amount || Math.round((selectedOrder.subtotal || selectedOrder.total_amount) / 1.11)) *
                        (11 / 12)
                    )
                )}
              </span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>VAT 12% (Effective 11%):</span>
              <span className="font-mono tabular-nums font-semibold text-stone-800">
                {formatIDR(
                  selectedOrder.ppn_amount ||
                    (selectedOrder.subtotal || selectedOrder.total_amount) -
                      (selectedOrder.dpp_amount || Math.round((selectedOrder.subtotal || selectedOrder.total_amount) / 1.11))
                )}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 border-t sm:border-t-0 sm:border-l border-stone-200 pt-3 sm:pt-0 sm:pl-4">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
              Fulfillment &amp; Production Work Order
            </span>
            <div className="flex items-center justify-between">
              <span className="text-stone-600">Fulfillment Mode:</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-white border border-stone-200 text-stone-800">
                {selectedOrder.fulfillment_mode || (selectedOrder.is_dp === 1 ? "MTO" : "MTS")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-600">Production Work Order:</span>
              {selectedOrder.spk_number ? (
                <Link
                  to="/spks"
                  className="font-mono tabular-nums font-bold text-stone-900 underline hover:text-stone-700"
                >
                  {selectedOrder.spk_number} ({selectedOrder.bop_progress || 0}% BOP)
                </Link>
              ) : (
                <span className="text-stone-400 italic">Not issued yet</span>
              )}
            </div>
            {!selectedOrder.spk_number && selectedOrder.order_status !== "CANCELLED" && (
              <div className="pt-1">
                <Button
                  variant="secondary"
                  size="xs"
                  isLoading={isTriggeringSpkId === selectedOrder.id}
                  onClick={() => onTriggerSpk(selectedOrder)}
                  leftIcon={<Factory className="w-3.5 h-3.5 text-stone-700" />}
                >
                  Trigger Production Work Order (BOP &amp; WOT)
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Status Update & ERP Handoff Actions */}
        <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Quick Status:</span>
            {selectedOrder.payment_status !== "PAID" && (
              <Button
                variant="success"
                size="xs"
                onClick={() => onUpdateOrderStatus(selectedOrder.id, "PROCESSING", "PAID")}
              >
                Mark as Paid
              </Button>
            )}
            {selectedOrder.order_status !== "COMPLETED" && (
              <Button
                variant="primary"
                size="xs"
                onClick={() => onUpdateOrderStatus(selectedOrder.id, "COMPLETED")}
              >
                Mark Completed
              </Button>
            )}
            {selectedOrder.order_status !== "CANCELLED" && (
              <Button
                variant="danger_soft"
                size="xs"
                onClick={() => onUpdateOrderStatus(selectedOrder.id, "CANCELLED")}
              >
                Cancel
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {selectedOrder.is_dp === 1 && !selectedOrder.dp_ci_number && !selectedOrder.ci_number && selectedOrder.order_status !== "CANCELLED" && (
              <Button
                variant="secondary"
                size="xs"
                isLoading={isCreatingInvoiceId === selectedOrder.id}
                onClick={() => onCreateInvoice(selectedOrder, "DOWN_PAYMENT")}
                leftIcon={<Receipt className="w-3.5 h-3.5 text-amber-600" />}
              >
                Issue DP Invoice (COA 2106)
              </Button>
            )}
            {selectedOrder.dp_ci_number && !selectedOrder.final_ci_number && selectedOrder.order_status !== "CANCELLED" && (
              <Button
                variant="secondary"
                size="xs"
                isLoading={isCreatingInvoiceId === selectedOrder.id}
                onClick={() => onCreateInvoice(selectedOrder, "FINAL_SETTLEMENT")}
                leftIcon={<Receipt className="w-3.5 h-3.5 text-emerald-700" />}
              >
                Issue Settlement Invoice (Knock-off DP)
              </Button>
            )}
            {selectedOrder.ci_number || selectedOrder.final_ci_number ? (
              <Link
                to="/invoices"
                className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-bold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Invoice: {selectedOrder.final_ci_number || selectedOrder.ci_number}</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            ) : (
              selectedOrder.order_status !== "CANCELLED" &&
              selectedOrder.is_dp !== 1 && (
                <Button
                  variant="secondary"
                  size="xs"
                  isLoading={isCreatingInvoiceId === selectedOrder.id}
                  onClick={() => onCreateInvoice(selectedOrder, "STANDARD")}
                  leftIcon={<Receipt className="w-3.5 h-3.5 text-amber-600" />}
                >
                  Issue Official Invoice
                </Button>
              )
            )}
            {selectedOrder.order_status !== "DISPATCHED" &&
              selectedOrder.order_status !== "COMPLETED" &&
              selectedOrder.order_status !== "CANCELLED" && (
                <Button
                  variant="primary"
                  size="xs"
                  isLoading={isDispatchingId === selectedOrder.id}
                  onClick={() => onDispatchToDo(selectedOrder)}
                  leftIcon={<Truck className="w-3.5 h-3.5" />}
                >
                  Generate &amp; Dispatch DO
                </Button>
              )}
            <Link
              to="/deliveries"
              className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-bold rounded-lg bg-stone-900 hover:bg-stone-800 text-white shadow-2xs"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Open Deliveries</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </Modal>
  );
});
