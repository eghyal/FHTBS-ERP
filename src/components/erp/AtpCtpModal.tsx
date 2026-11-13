import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Truck,
  FolderKanban,
  Gauge,
  Cpu,
  Calendar,
  Boxes,
  Clock,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";

interface AtpCtpItem {
  quotation_item_id: string | null;
  item_id: string | null;
  item_code: string;
  title: string;
  uom: string;
  ordered_qty: number;
  free_stock: number;
  atp_qty: number;
  net_mto_qty: number;
  unit_cycle_hours: number;
  est_mto_hours: number;
  fulfillment_mode: "MTS" | "HYBRID" | "MTO";
}

export interface AtpCtpAnalysis {
  quotation_id: string;
  quotation_number: string;
  customer_id: string;
  customer_name: string;
  quotation_title: string;
  quotation_status: string;
  recommended_mode: "MTS" | "HYBRID" | "MTO";
  can_fulfill_mts_immediately: boolean;
  is_full_mts_ready: boolean;
  ctp_promise_date: string;
  required_production_days: number;
  summary: {
    total_ordered_qty: number;
    total_atp_qty: number;
    total_net_mto_qty: number;
    total_mto_hours: number;
  };
  capacity_telemetry: {
    factory_factor_wma: number;
    total_machines: number;
    active_machines: number;
    down_machines: number;
    active_ndp_locks: number;
    shift_hours: number;
    effective_daily_capacity_hours: number;
    active_wip_backlog_hours: number;
  };
  items: AtpCtpItem[];
}

interface AtpCtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotationId: string | null;
  username?: string;
  onProceedToMtoProject?: (analysis: AtpCtpAnalysis) => void;
  onMtsDispatched?: () => void;
}

export const AtpCtpModal: React.FC<AtpCtpModalProps> = ({
  isOpen,
  onClose,
  quotationId,
  username,
  onProceedToMtoProject,
  onMtsDispatched,
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [analysis, setAnalysis] = useState<AtpCtpAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [dispatchingMts, setDispatchingMts] = useState(false);

  const fetchAnalysis = async () => {
    if (!quotationId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/quotations/${quotationId}/atp-ctp`, {}, username);
      if (res.ok && res.data) {
        setAnalysis(res.data);
      } else {
        showToast("Failed to analyze ATP/CTP for quotation", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error loading ATP/CTP engine", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && quotationId) {
      fetchAnalysis();
    } else if (!isOpen) {
      setAnalysis(null);
    }
  }, [isOpen, quotationId]);

  const handleFulfillMts = async () => {
    if (!analysis) return;
    setDispatchingMts(true);
    try {
      const res = await apiFetch(
        `/api/quotations/${analysis.quotation_id}/fulfill-mts`,
        {
          method: "POST",
          body: JSON.stringify({
            remarks: `Automated MTS Stock Dispatch from ATP/CTP Analyzer (${analysis.quotation_number})`,
          }),
        },
        username
      );
      if (res.ok) {
        const payload = res.data || {};
        showToast(
          `MTS Delivery Note ${payload.dn_number || ""} issued from free stock!`,
          "success"
        );
        if (onMtsDispatched) onMtsDispatched();
        if (payload.remaining_mto_qty > 0 && onProceedToMtoProject) {
          onProceedToMtoProject(analysis);
        } else {
          onClose();
          navigate("/deliveries");
        }
      } else {
        showToast(res.data?.error || "Failed to dispatch MTS Delivery Note", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Connection error while issuing MTS Delivery Note", "error");
    } finally {
      setDispatchingMts(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="ISA-95 / APICS Hybrid ATP & CTP Order Promise Engine"
      maxWidth="4xl"
    >
      {loading || !analysis ? (
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-16 bg-stone-100 rounded-xl" />
          <div className="grid grid-cols-4 gap-3">
            <div className="h-20 bg-stone-100 rounded-xl" />
            <div className="h-20 bg-stone-100 rounded-xl" />
            <div className="h-20 bg-stone-100 rounded-xl" />
            <div className="h-20 bg-stone-100 rounded-xl" />
          </div>
          <div className="h-44 bg-stone-100 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Top Recommendation Banner */}
          <div
            className={cn(
              "p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4",
              analysis.recommended_mode === "MTS"
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                : analysis.recommended_mode === "HYBRID"
                  ? "bg-amber-50/70 border-amber-200 text-amber-950"
                  : "bg-stone-50 border-stone-200 text-stone-900"
            )}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-600">
                <span className="font-mono font-bold text-stone-900">
                  {analysis.quotation_number}
                </span>
                <span aria-hidden="true">·</span>
                <span>{analysis.customer_name}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={cn(
                    "font-bold uppercase tracking-wider",
                    analysis.recommended_mode === "MTS"
                      ? "text-emerald-700"
                      : analysis.recommended_mode === "HYBRID"
                        ? "text-amber-700"
                        : "text-indigo-700"
                  )}
                >
                  Recommended Path: {analysis.recommended_mode}
                </span>
              </div>
              <p className="text-sm font-bold text-stone-900">
                {analysis.recommended_mode === "MTS"
                  ? "100% Free Stock Available (ATP) — Ready for immediate Delivery Order without shop floor production."
                  : analysis.recommended_mode === "HYBRID"
                    ? `Hybrid Fulfillment: ${analysis.summary.total_atp_qty} units ready in stock (ATP) · ${analysis.summary.total_net_mto_qty} units require MTO production.`
                    : `Make-to-Order (MTO): Requires ${analysis.summary.total_net_mto_qty} units (${analysis.summary.total_mto_hours} cycle hrs) scheduled across active workstations.`}
              </p>
            </div>

            <button
              type="button"
              onClick={fetchAnalysis}
              className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-700 flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Recalculate</span>
            </button>
          </div>

          {/* 4-Column Capacity & CTP Telemetry Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
                <span>Available Stock (ATP)</span>
                <Boxes className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-1.5 text-lg font-mono font-bold text-stone-900 tabular-nums">
                {analysis.summary.total_atp_qty}{" "}
                <span className="text-xs font-normal text-stone-500">
                  / {analysis.summary.total_ordered_qty}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-stone-500">
                Net MTO Needed:{" "}
                <span className="font-mono font-semibold text-stone-800 tabular-nums">
                  {analysis.summary.total_net_mto_qty}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
                <span>Factory Factor (WMA)</span>
                <Gauge className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-1.5 text-lg font-mono font-bold text-stone-900 tabular-nums">
                {analysis.capacity_telemetry.factory_factor_wma}%
              </div>
              <div className="mt-1 text-[11px] text-stone-500">
                Eff. Capacity:{" "}
                <span className="font-mono font-semibold text-stone-800 tabular-nums">
                  {analysis.capacity_telemetry.effective_daily_capacity_hours}h/day
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
                <span>Active Workstations</span>
                <Cpu className="w-4 h-4 text-stone-600" />
              </div>
              <div className="mt-1.5 text-lg font-mono font-bold text-stone-900 tabular-nums">
                {analysis.capacity_telemetry.active_machines}{" "}
                <span className="text-xs font-normal text-stone-500">
                  / {analysis.capacity_telemetry.total_machines} Healthy
                </span>
              </div>
              <div className="mt-1 text-[11px] text-stone-500">
                WIP Queue:{" "}
                <span className="font-mono font-semibold text-stone-800 tabular-nums">
                  {analysis.capacity_telemetry.active_wip_backlog_hours}h
                </span>
                {analysis.capacity_telemetry.active_ndp_locks > 0 && (
                  <span className="text-rose-600 font-semibold">
                    {" "}
                    · {analysis.capacity_telemetry.active_ndp_locks} NDP
                  </span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
                <span>CTP Promise Date</span>
                <Calendar className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-1.5 text-lg font-mono font-bold text-stone-900 tabular-nums">
                {analysis.ctp_promise_date}
              </div>
              <div className="mt-1 text-[11px] text-stone-500">
                Est. Lead Time:{" "}
                <span className="font-mono font-semibold text-stone-800 tabular-nums">
                  {analysis.required_production_days === 0
                    ? "Immediate (0d)"
                    : `${analysis.required_production_days} work day(s)`}
                </span>
              </div>
            </div>
          </div>

          {/* Line-Item ATP / CTP Table */}
          <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
            <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800">
                Line-Item ATP Stock &amp; BOP Cycle Breakdown
              </span>
              <span className="text-xs text-stone-500 font-mono tabular-nums">
                Total Est. MTO Cycle: {analysis.summary.total_mto_hours} hrs
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-[11px] font-semibold text-stone-500 bg-stone-50/50">
                    <th className="py-2.5 px-3.5">Item / Product</th>
                    <th className="py-2.5 px-3.5 text-right">Ordered</th>
                    <th className="py-2.5 px-3.5 text-right">Free Stock</th>
                    <th className="py-2.5 px-3.5 text-right">ATP Allocated</th>
                    <th className="py-2.5 px-3.5 text-right">Net MTO Qty</th>
                    <th className="py-2.5 px-3.5 text-right">BOP Cycle</th>
                    <th className="py-2.5 px-3.5 text-right">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {analysis.items.map((item, i) => (
                    <tr key={i} className="hover:bg-stone-50/80">
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-stone-900">{item.title}</div>
                        <div className="text-[11px] font-mono text-stone-500">
                          {item.item_code} · {item.uom}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-stone-900 tabular-nums">
                        {item.ordered_qty}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-stone-600 tabular-nums">
                        {item.free_stock}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-emerald-700 tabular-nums">
                        {item.atp_qty}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-amber-700 tabular-nums">
                        {item.net_mto_qty}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-stone-700 tabular-nums">
                        {item.est_mto_hours}h{" "}
                        <span className="text-[10px] text-stone-400">
                          ({item.unit_cycle_hours}h/u)
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold">
                        <span
                          className={cn(
                            item.fulfillment_mode === "MTS"
                              ? "text-emerald-700"
                              : item.fulfillment_mode === "HYBRID"
                                ? "text-amber-700"
                                : "text-indigo-700"
                          )}
                        >
                          {item.fulfillment_mode}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-stone-200">
            <div className="text-xs text-stone-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span>
                CTP formula accounts for BOP unit cycle time, active healthy machines, and WMA Factory Factor.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 shrink-0">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>

              {analysis.can_fulfill_mts_immediately &&
                (analysis.quotation_status === "APPROVED" ||
                  analysis.quotation_status === "AUTHORIZED") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleFulfillMts}
                    disabled={dispatchingMts}
                    leftIcon={<Truck className="w-3.5 h-3.5 text-emerald-700" />}
                    className="border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 whitespace-nowrap"
                  >
                    {dispatchingMts
                      ? "Dispatching MTS..."
                      : analysis.is_full_mts_ready
                        ? "Fulfill 100% via Stock (Issue MTS DN)"
                        : `Dispatch ${analysis.summary.total_atp_qty} Stock (Partial MTS DN)`}
                  </Button>
                )}

              {(analysis.quotation_status === "APPROVED" ||
                analysis.quotation_status === "AUTHORIZED") &&
                onProceedToMtoProject && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onProceedToMtoProject(analysis)}
                    leftIcon={<FolderKanban className="w-3.5 h-3.5" />}
                    className="whitespace-nowrap"
                  >
                    <span>
                      {analysis.summary.total_net_mto_qty > 0
                        ? `Create Work Order Project (CTP: ${analysis.ctp_promise_date})`
                        : "Create Replenishment Work Order Project"}
                    </span>
                  </Button>
                )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
