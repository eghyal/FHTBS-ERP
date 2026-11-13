import React, { useState, useEffect, useCallback } from "react";
import {
  PackageCheck,
  Truck,
  Receipt,
  Layers,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  FileCheck2,
  Sparkles,
  Building2,
  Calendar,
} from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { canViewDocFinancials } from "@/utils/rbacFinancials";
import { ConfidentialBadge } from "@/components/shared/ConfidentialBadge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/contexts/ToastContext";

interface PartialDeliveryWaveRow {
  wave_id: string;
  wave_number: number;
  wave_name: string;
  station_focus: string;
  wot_lot_range: string;
  wot_batch_ratio: number;
  material_status: string;
  target_order_date: string;
  target_arrival_date: string;
  production_need_date: string;
  target_fg_delivery_date: string;
  target_fg_lot_qty: number;
  estimated_material_cost: number;
  estimated_billing_value: number;
  stage: "MATERIAL_WAVE" | "FG_RELEASED" | "DO_DELIVERED" | "INVOICED";
  fgr_id: string | null;
  fgr_number: string | null;
  fgr_qty: number;
  fgr_status: string | null;
  fgr_created_at: string | null;
  linked_dn_id: string | null;
  linked_dn_number: string | null;
  dn_status: string | null;
  dn_delivered_at: string | null;
  linked_ci_id: string | null;
  linked_ci_number: string | null;
  ci_amount: number;
  ci_status: string | null;
  ci_billing_mode: string | null;
}

interface PartialDeliveryChainResponse {
  plan_id: string;
  plan_code: string;
  project_id: string;
  project_name: string;
  customer_id: string;
  customer_name: string;
  spk_number: string | null;
  master_pr_id: string | null;
  master_pr_number: string | null;
  wot_header: {
    id: string;
    wot_number: string;
    total_lots: number;
    lot_size: number;
    status: string;
  } | null;
  summary: {
    total_waves: number;
    fg_released_waves: number;
    do_delivered_waves: number;
    invoiced_waves: number;
    ready_for_consolidated_invoice_count: number;
    total_fg_units_planned: number;
    total_fg_units_delivered: number;
    total_project_contract_value: number;
    total_invoiced_value: number;
  };
  waves: PartialDeliveryWaveRow[];
}

interface PartialDeliveryValueChainPanelProps {
  planId: string;
  selectedWaveNumbers?: number[];
  onDataUpdated?: () => void;
}

export const PartialDeliveryValueChainPanel: React.FC<
  PartialDeliveryValueChainPanelProps
> = ({ planId, selectedWaveNumbers = [], onDataUpdated }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canSeeFinancials = canViewDocFinancials(user, "PO");

  const [chainData, setChainData] =
    useState<PartialDeliveryChainResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [selectedDoWaveIds, setSelectedDoWaveIds] = useState<string[]>([]);
  const [billingModeFilter, setBillingModeFilter] = useState<
    "FLEXIBLE_PER_DO" | "CONSOLIDATED_MULTI_DO"
  >("FLEXIBLE_PER_DO");

  const fetchChainData = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/purchasing/procurement-plans/${planId}/partial-delivery-chain`,
        {
          headers: {
            "x-user-role": user?.role || "ADMIN",
            "x-user-email": user?.email || "system@erp.local",
          },
        },
      );
      if (!res.ok) throw new Error("Failed to load WOT Partial Delivery chain");
      const data = (await res.json()) as PartialDeliveryChainResponse;
      setChainData(data);

      // Default select all uninvoiced DO_DELIVERED waves for quick consolidated billing
      const uninvoicedDoIds = (data.waves || [])
        .filter((w) => w.stage === "DO_DELIVERED" && !w.linked_ci_id)
        .map((w) => w.wave_id);
      setSelectedDoWaveIds(uninvoicedDoIds);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [planId, user?.role, user?.email]);

  useEffect(() => {
    fetchChainData();
  }, [fetchChainData]);

  const handleReleaseWotFg = async (wave: PartialDeliveryWaveRow) => {
    const key = `fg-${wave.wave_id}`;
    setBusyActionKey(key);
    try {
      const res = await fetch(
        `/api/purchasing/procurement-plans/${planId}/waves/${wave.wave_id}/release-wot-fg`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-role": user?.role || "ADMIN",
            "x-user-email": user?.email || "qc@erp.local",
          },
          body: JSON.stringify({
            fg_qty: wave.target_fg_lot_qty,
            target_warehouse: "WAREHOUSE_FG_1",
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to release WOT FG");
      showToast(
        data.message ||
          `Batch ${data.fgr_number} released to FG Warehouse (${wave.target_fg_lot_qty} SET).`,
        "success",
      );
      await fetchChainData();
      onDataUpdated?.();
    } catch (err: any) {
      showToast(
        err.message || "Could not release WOT batch to FG",
        "error",
      );
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleCreatePartialDo = async (wave: PartialDeliveryWaveRow) => {
    const key = `do-${wave.wave_id}`;
    setBusyActionKey(key);
    try {
      const res = await fetch(
        `/api/purchasing/procurement-plans/${planId}/waves/${wave.wave_id}/create-partial-do`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-role": user?.role || "ADMIN",
            "x-user-email": user?.email || "logistics@erp.local",
          },
          body: JSON.stringify({
            police_number: `B ${9100 + wave.wave_number * 17} KXA`,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to issue Partial DO");
      showToast(
        data.message ||
          `Surat Jalan Parsial ${data.dn_number} delivered to customer.`,
        "success",
      );
      await fetchChainData();
      onDataUpdated?.();
    } catch (err: any) {
      showToast(
        err.message || "Could not issue Partial Delivery Order",
        "error",
      );
    } finally {
      setBusyActionKey(null);
    }
  };

  const handleCreateInvoice = async (
    mode: "SINGLE_DO" | "CONSOLIDATED_DO",
    waveIds: string[],
  ) => {
    if (waveIds.length === 0) return;
    const key =
      mode === "CONSOLIDATED_DO"
        ? "inv-consolidated"
        : `inv-${waveIds[0]}`;
    setBusyActionKey(key);
    try {
      const res = await fetch(
        `/api/purchasing/procurement-plans/${planId}/create-partial-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-role": user?.role || "ADMIN",
            "x-user-email": user?.email || "finance@erp.local",
          },
          body: JSON.stringify({
            billing_mode: mode,
            wave_ids: waveIds,
            payment_terms: "Net 30",
            ppn_rate: 11,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to create Customer Invoice");
      showToast(
        data.message || `Commercial Invoice ${data.ci_number} generated.`,
        "success",
      );
      await fetchChainData();
      onDataUpdated?.();
    } catch (err: any) {
      showToast(
        err.message || "Could not create Customer Invoice",
        "error",
      );
    } finally {
      setBusyActionKey(null);
    }
  };

  if (loading && !chainData) {
    return (
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 text-center text-xs text-stone-500">
        Loading WOT Partial Delivery &amp; Customer Billing Value Chain...
      </div>
    );
  }

  if (!chainData) return null;

  const { summary, waves } = chainData;
  const displayedWaves =
    selectedWaveNumbers.length > 0
      ? waves.filter((w) => selectedWaveNumbers.includes(w.wave_number))
      : waves;

  const toggleSelectDoWave = (waveId: string) => {
    setSelectedDoWaveIds((prev) =>
      prev.includes(waveId)
        ? prev.filter((id) => id !== waveId)
        : [...prev, waveId],
    );
  };

  const selectedWavesForConsolidatedBilling = waves.filter(
    (w) =>
      selectedDoWaveIds.includes(w.wave_id) &&
      w.stage === "DO_DELIVERED" &&
      !w.linked_ci_id,
  );
  const consolidatedPreviewValue = selectedWavesForConsolidatedBilling.reduce(
    (s, w) => s + Number(w.estimated_billing_value || 0),
    0,
  );

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden shadow-2xs space-y-0">
      {/* Top Strategy Header */}
      <div className="px-4 py-3.5 bg-stone-50 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-mono font-bold uppercase">
              Large-Lot Partial Delivery Strategy
            </span>
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              End-to-End WOT Lot Fulfillment: Procurement Wave → QC FG Batch →
              Partial DO → Flexible Customer Invoicing
            </h3>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Deliver finished goods partially per completed WOT Lot batch to
            accelerate customer handover and cash collection—either billed
            immediately per Partial DO or consolidated across multiple DOs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Billing Strategy Mode Selector */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-stone-200/80 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-xs">
            <button
              type="button"
              onClick={() => setBillingModeFilter("FLEXIBLE_PER_DO")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                billingModeFilter === "FLEXIBLE_PER_DO"
                  ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs"
                  : "text-stone-600 dark:text-stone-400"
              }`}
            >
              Tagih per DO Parsial
            </button>
            <button
              type="button"
              onClick={() => setBillingModeFilter("CONSOLIDATED_MULTI_DO")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                billingModeFilter === "CONSOLIDATED_MULTI_DO"
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "text-stone-600 dark:text-stone-400"
              }`}
            >
              Gabung Multi-DO di Akhir ({summary.ready_for_consolidated_invoice_count})
            </button>
          </div>

          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={fetchChainData}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            className="text-xs"
          >
            Refresh Chain
          </Button>
        </div>
      </div>

      {/* 4-Stage Value Chain KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 dark:divide-stone-800 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/40">
        <div className="px-4 py-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-stone-500">
            <span>1. Procurement Waves</span>
            <Layers className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <div className="text-base font-mono font-bold tabular-nums text-stone-900 dark:text-stone-100">
            {summary.total_waves} Waves ·{" "}
            {chainData.wot_header
              ? `${chainData.wot_header.total_lots} WOT Lots`
              : `${summary.total_fg_units_planned} SET`}
          </div>
          <div className="text-[11px] text-stone-500 font-mono">
            Master PR: {chainData.master_pr_number || "Auto-Routed"}
          </div>
        </div>

        <div className="px-4 py-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <span>2. QC Released FG Batches</span>
            <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-base font-mono font-bold tabular-nums text-stone-900 dark:text-stone-100">
            {summary.fg_released_waves} / {summary.total_waves} Batches Ready
          </div>
          <div className="text-[11px] text-stone-500 font-mono">
            Target Output: {summary.total_fg_units_planned} SET Finished Goods
          </div>
        </div>

        <div className="px-4 py-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
            <span>3. Partial Delivery Orders (DO)</span>
            <Truck className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="text-base font-mono font-bold tabular-nums text-stone-900 dark:text-stone-100">
            {summary.do_delivered_waves} / {summary.total_waves} Partial DOs
          </div>
          <div className="text-[11px] text-stone-500 font-mono">
            Delivered: {summary.total_fg_units_delivered} /{" "}
            {summary.total_fg_units_planned} SET ({chainData.customer_name})
          </div>
        </div>

        <div className="px-4 py-3 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <span>4. Customer Invoicing</span>
            <Receipt className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-base font-mono font-bold tabular-nums text-stone-900 dark:text-stone-100">
            {summary.invoiced_waves} / {summary.total_waves} Waves Billed
          </div>
          <div className="text-[11px] text-stone-500 font-mono tabular-nums flex items-center gap-1.5 flex-wrap">
            <span>Billed:</span>
            {canSeeFinancials ? (
              <span>{formatIDR(summary.total_invoiced_value)}</span>
            ) : (
              <ConfidentialBadge />
            )}
            <span>/</span>
            {canSeeFinancials ? (
              <span>{formatIDR(summary.total_project_contract_value)}</span>
            ) : (
              <ConfidentialBadge />
            )}
          </div>
        </div>
      </div>

      {/* Consolidated Multi-DO Billing Action Bar (when Consolidated Mode or >=1 Delivered DO is ready) */}
      {(billingModeFilter === "CONSOLIDATED_MULTI_DO" ||
        selectedWavesForConsolidatedBilling.length > 1) && (
        <div className="px-4 py-3 bg-indigo-50/80 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FileCheck2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-indigo-950 dark:text-indigo-200">
                Consolidated Multi-DO Customer Billing:
              </span>{" "}
              <span className="text-indigo-800 dark:text-indigo-300 font-mono">
                {selectedWavesForConsolidatedBilling.length} Delivered Partial
                DO(s) selected
              </span>
              {canSeeFinancials && selectedWavesForConsolidatedBilling.length > 0 && (
                <span className="ml-2 font-mono font-bold text-indigo-900 dark:text-indigo-100">
                  · Est. DPP {formatIDR(consolidatedPreviewValue)} (+11% PPN)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="xs"
              variant="primary"
              disabled={selectedWavesForConsolidatedBilling.length === 0}
              isLoading={busyActionKey === "inv-consolidated"}
              onClick={() =>
                handleCreateInvoice(
                  "CONSOLIDATED_DO",
                  selectedWavesForConsolidatedBilling.map((w) => w.wave_id),
                )
              }
              leftIcon={<Sparkles className="w-3.5 h-3.5" />}
              className="text-xs font-semibold"
            >
              Generate Consolidated Invoice (
              {selectedWavesForConsolidatedBilling.length} DO)
            </Button>
          </div>
        </div>
      )}

      {/* Per-Wave / Per-WOT Lot Batch End-to-End Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900 text-[10.5px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
              <th className="py-2.5 px-3 w-8 text-center">
                <input
                  type="checkbox"
                  checked={
                    selectedWavesForConsolidatedBilling.length > 0 &&
                    selectedWavesForConsolidatedBilling.length ===
                      waves.filter((w) => w.stage === "DO_DELIVERED").length
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedDoWaveIds(
                        waves
                          .filter((w) => w.stage === "DO_DELIVERED" && !w.linked_ci_id)
                          .map((w) => w.wave_id),
                      );
                    } else {
                      setSelectedDoWaveIds([]);
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-stone-300 accent-indigo-600 cursor-pointer"
                  title="Select delivered DOs for Consolidated Invoicing"
                />
              </th>
              <th className="py-2.5 px-3">Wave &amp; WOT Lot Batch</th>
              <th className="py-2.5 px-3">1. Material Wave Arrival</th>
              <th className="py-2.5 px-3">2. WOT Final QC &amp; FG Batch</th>
              <th className="py-2.5 px-3">3. Partial Delivery (Surat Jalan)</th>
              <th className="py-2.5 px-3">4. Flexible Customer Invoice</th>
              <th className="py-2.5 px-3 text-right">Next Value-Chain Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200/80 dark:divide-stone-800 text-xs">
            {displayedWaves.map((w) => {
              const isDoSelectable =
                w.stage === "DO_DELIVERED" && !w.linked_ci_id;
              const isChecked = selectedDoWaveIds.includes(w.wave_id);

              return (
                <tr
                  key={w.wave_id}
                  className="hover:bg-stone-50/70 dark:hover:bg-stone-850/40 transition-colors"
                >
                  <td className="py-3 px-3 text-center">
                    <input
                      type="checkbox"
                      disabled={!isDoSelectable}
                      checked={isDoSelectable && isChecked}
                      onChange={() => toggleSelectDoWave(w.wave_id)}
                      className="w-3.5 h-3.5 rounded border-stone-300 accent-indigo-600 disabled:opacity-30 cursor-pointer"
                    />
                  </td>

                  {/* Wave & WOT Lot Batch */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900">
                        W{w.wave_number}
                      </span>
                      <div>
                        <div className="font-bold text-stone-900 dark:text-stone-100">
                          {w.wot_lot_range} · {w.target_fg_lot_qty} SET FG
                        </div>
                        <div className="text-[11px] text-stone-500">
                          {w.station_focus} ({Math.round(w.wot_batch_ratio * 100)}%
                          Contract Share)
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Stage 1: Material Wave */}
                  <td className="py-3 px-3 font-mono text-[11px] tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 font-bold text-stone-800 dark:text-stone-200 text-[10px]">
                        {w.material_status}
                      </span>
                      <ArrowRight className="w-3 h-3 text-stone-400" />
                      <span className="text-stone-700 dark:text-stone-300">
                        Arr: {w.target_arrival_date}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-stone-500 mt-0.5">
                      BOP Need: {w.production_need_date}
                    </div>
                  </td>

                  {/* Stage 2: WOT Final QC & FG Release */}
                  <td className="py-3 px-3 font-mono text-[11px] tabular-nums">
                    {w.fgr_number ? (
                      <div className="space-y-0.5">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-[10.5px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{w.fgr_number}</span>
                        </div>
                        <div className="text-[10.5px] text-stone-500">
                          Released: {w.fgr_qty} SET · WAREHOUSE_FG_1
                        </div>
                      </div>
                    ) : (
                      <div className="text-stone-400 dark:text-stone-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>Target FG: {w.target_fg_delivery_date}</span>
                        </div>
                        <span className="text-[10px]">
                          Awaiting WOT Lot QC Release
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Stage 3: Partial DO */}
                  <td className="py-3 px-3 font-mono text-[11px] tabular-nums">
                    {w.linked_dn_number ? (
                      <div className="space-y-0.5">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold text-[10.5px]">
                          <Truck className="w-3 h-3 text-indigo-600" />
                          <span>{w.linked_dn_number}</span>
                        </div>
                        <div className="text-[10.5px] text-stone-500 flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          <span className="truncate max-w-[140px]">
                            {chainData.customer_name}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-stone-400 dark:text-stone-500 text-[10.5px]">
                        Not Shipped Yet
                      </span>
                    )}
                  </td>

                  {/* Stage 4: Customer Invoice */}
                  <td className="py-3 px-3 font-mono text-[11px] tabular-nums">
                    {w.linked_ci_number ? (
                      <div className="space-y-0.5">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold text-[10.5px]">
                          <Receipt className="w-3 h-3 text-amber-600" />
                          <span>{w.linked_ci_number}</span>
                        </div>
                        <div className="text-[10.5px] text-stone-600 dark:text-stone-400">
                          {w.ci_billing_mode === "CONSOLIDATED_DO"
                            ? "Consolidated Multi-DO"
                            : "Single DO Invoice"}{" "}
                          ·{" "}
                          {canSeeFinancials
                            ? formatIDR(
                                w.ci_amount || w.estimated_billing_value,
                              )
                            : <ConfidentialBadge />}
                        </div>
                      </div>
                    ) : (
                      <div className="text-stone-500">
                        <div>
                          Est. Billing:{" "}
                          <strong className="text-stone-800 dark:text-stone-200">
                            {canSeeFinancials ? (
                              formatIDR(w.estimated_billing_value)
                            ) : (
                              <ConfidentialBadge />
                            )}
                          </strong>
                        </div>
                        <span className="text-[10px] text-stone-400">
                          {w.linked_dn_id
                            ? "Ready for Per-DO or Consolidated Invoice"
                            : "Deliver Partial DO first"}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Action Column */}
                  <td className="py-3 px-3 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {w.stage === "MATERIAL_WAVE" && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          isLoading={busyActionKey === `fg-${w.wave_id}`}
                          onClick={() => handleReleaseWotFg(w)}
                          leftIcon={<PackageCheck className="w-3.5 h-3.5" />}
                          className="text-xs font-semibold whitespace-nowrap"
                        >
                          1. Release WOT Lot to FG
                        </Button>
                      )}

                      {w.stage === "FG_RELEASED" && (
                        <Button
                          type="button"
                          size="xs"
                          variant="primary"
                          isLoading={busyActionKey === `do-${w.wave_id}`}
                          onClick={() => handleCreatePartialDo(w)}
                          leftIcon={<Truck className="w-3.5 h-3.5" />}
                          className="text-xs font-semibold whitespace-nowrap"
                        >
                          2. Issue Partial DO
                        </Button>
                      )}

                      {w.stage === "DO_DELIVERED" && (
                        <Button
                          type="button"
                          size="xs"
                          variant="primary"
                          isLoading={busyActionKey === `inv-${w.wave_id}`}
                          onClick={() =>
                            handleCreateInvoice("SINGLE_DO", [w.wave_id])
                          }
                          leftIcon={<Receipt className="w-3.5 h-3.5" />}
                          className="text-xs font-semibold whitespace-nowrap"
                        >
                          3. Invoice This DO
                        </Button>
                      )}

                      {w.stage === "INVOICED" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono text-[11px] font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Completed &amp; Billed</span>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
