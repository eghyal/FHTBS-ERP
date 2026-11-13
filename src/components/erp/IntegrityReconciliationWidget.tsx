import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Wrench,
  Scale,
  Package,
  FileText,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Button,
  Card,
  Badge,
  StatCard,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui";
import { cn, formatIDR } from "@/lib/utils";

interface StockDiscrepancy {
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  physical_qty: number;
  free_stock: number;
  allocated_stock: number;
  total_inventory_qty: number;
  calculated_movement_qty: number;
  variance: number;
  status: "BALANCED" | "DISCREPANCY";
}

interface GlUnbalancedEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  reference_type: string;
  description: string;
  total_debit: number;
  total_credit: number;
  line_debit_sum: number;
  line_credit_sum: number;
  variance: number;
  is_balanced: boolean;
}

interface IntegrityReport {
  timestamp: string;
  stockIntegrity: {
    isHealthy: boolean;
    totalItemsAudited: number;
    discrepancyCount: number;
    totalPhysicalQtySum: number;
    totalCalculatedQtySum: number;
    discrepancies: StockDiscrepancy[];
    sampleAuditedItems: StockDiscrepancy[];
  };
  generalLedgerIntegrity: {
    isHealthy: boolean;
    totalDebit: number;
    totalCredit: number;
    variance: number;
    totalEntriesAudited: number;
    unbalancedCount: number;
    unbalancedJournals: GlUnbalancedEntry[];
    recentJournals: GlUnbalancedEntry[];
  };
}

export const IntegrityReconciliationWidget: React.FC<{
  onDataChanged?: () => void;
}> = React.memo(({ onDataChanged }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"STOCK" | "GL">("STOCK");

  const isFullControl =
    user?.role === "FC" ||
    user?.role === "GOD_MODE" ||
    user?.role === "SUPERADMIN" ||
    user?.level === "SUPER_ADMIN";

  const fetchIntegrityStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/integrity/health-check");
      if (res.ok && res.data?.report) {
        setReport(res.data.report);
      } else {
        showToast(res.error || "Failed to load integrity report", "error");
      }
    } catch (e: any) {
      console.error(e);
      showToast("Error running integrity check", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchIntegrityStatus();
  }, [fetchIntegrityStatus]);

  const handleAutoRepair = async () => {
    if (!isFullControl) {
      showToast("Full Control (FC) authorization required", "error");
      return;
    }
    if (repairing) return;
    setRepairing(true);
    try {
      const res = await apiFetch("/api/integrity/auto-repair", {
        method: "POST",
      });
      if (res.ok && res.data?.success) {
        showToast(res.data.message || "Integrity auto-repair completed", "success");
        setReport(res.data.updatedReport || null);
        if (onDataChanged) onDataChanged();
      } else {
        showToast(
          res.error || res.data?.error || "Failed to execute auto-repair",
          "error",
        );
      }
    } catch (e: any) {
      showToast(e.message || "Error running auto-repair", "error");
    } finally {
      setRepairing(false);
    }
  };

  const isOverallHealthy =
    Boolean(report?.stockIntegrity?.isHealthy) &&
    Boolean(report?.generalLedgerIntegrity?.isHealthy);

  const stockRows = report?.stockIntegrity?.discrepancies?.length
    ? report.stockIntegrity.discrepancies
    : report?.stockIntegrity?.sampleAuditedItems || [];

  const glRows = report?.generalLedgerIntegrity?.unbalancedJournals?.length
    ? report.generalLedgerIntegrity.unbalancedJournals
    : report?.generalLedgerIntegrity?.recentJournals || [];

  return (
    <div className="space-y-4">
      {/* Summary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Stock Audit"
          value={
            report?.stockIntegrity?.isHealthy
              ? "Balanced"
              : `${report?.stockIntegrity?.discrepancyCount || 0} Discrepancies`
          }
          subtitle={`${report?.stockIntegrity?.totalItemsAudited || 0} SKUs verified`}
          icon={Package}
          variant={report?.stockIntegrity?.isHealthy ? "success" : "warning"}
          isLoading={loading}
        />
        <StatCard
          label="Physical vs Movement"
          value={`${(report?.stockIntegrity?.totalPhysicalQtySum || 0).toLocaleString()} u`}
          subtitle={`Movement sum: ${(report?.stockIntegrity?.totalCalculatedQtySum || 0).toLocaleString()} u`}
          icon={Package}
          variant="default"
          isLoading={loading}
        />
        <StatCard
          label="General Ledger"
          value={
            report?.generalLedgerIntegrity?.isHealthy
              ? "Balanced"
              : `${report?.generalLedgerIntegrity?.unbalancedCount || 0} Unbalanced`
          }
          subtitle={`${report?.generalLedgerIntegrity?.totalEntriesAudited || 0} journals audited`}
          icon={Scale}
          variant={
            report?.generalLedgerIntegrity?.isHealthy ? "success" : "danger"
          }
          isLoading={loading}
        />
        <StatCard
          label="Total Ledger Volume"
          value={formatIDR(report?.generalLedgerIntegrity?.totalDebit || 0)}
          subtitle={`Variance: ${formatIDR(report?.generalLedgerIntegrity?.variance || 0)}`}
          icon={FileText}
          variant="default"
          isLoading={loading}
        />
      </div>

      {/* Main Table Card */}
      <Card padding="none" className="overflow-hidden">
        <div className="p-4 border-b border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/40">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveSubTab("STOCK")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 border",
                activeSubTab === "STOCK"
                  ? "bg-white text-stone-900 border-stone-200/90 shadow-2xs"
                  : "bg-transparent text-stone-600 border-transparent hover:bg-stone-200/60",
              )}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Warehouse Stock</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("GL")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 border",
                activeSubTab === "GL"
                  ? "bg-white text-stone-900 border-stone-200/90 shadow-2xs"
                  : "bg-transparent text-stone-600 border-transparent hover:bg-stone-200/60",
              )}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>General Ledger</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={fetchIntegrityStatus}
              disabled={loading || repairing}
              leftIcon={
                <RefreshCw
                  className={cn(
                    "w-3.5 h-3.5",
                    loading && "animate-spin text-amber-600",
                  )}
                />
              }
            >
              Run Check
            </Button>

            {isFullControl && (
              <Button
                type="button"
                variant={isOverallHealthy ? "secondary" : "primary"}
                size="xs"
                onClick={handleAutoRepair}
                disabled={loading || repairing || isOverallHealthy}
                isLoading={repairing}
                leftIcon={
                  !repairing ? <Wrench className="w-3.5 h-3.5" /> : undefined
                }
              >
                {isOverallHealthy ? "All Reconciled" : "Auto-Repair"}
              </Button>
            )}
          </div>
        </div>

        {activeSubTab === "STOCK" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Master Stock</TableHead>
                <TableHead className="text-right">Movement Sum</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockRows.length === 0 ? (
                <TableEmpty
                  colSpan={5}
                  message="No stock items found for reconciliation."
                />
              ) : (
                stockRows.map((item) => (
                  <TableRow key={item.item_id}>
                    <TableCell>
                      <div className="font-bold text-xs text-stone-900">
                        {item.item_name}
                      </div>
                      <div className="text-[11px] font-mono text-stone-500">
                        {item.item_code} · {item.uom}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">
                      {item.physical_qty.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs text-stone-700">
                      {item.calculated_movement_qty.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs">
                      {item.variance === 0 ? (
                        <span className="text-stone-400">0</span>
                      ) : item.variance > 0 ? (
                        <span className="text-amber-600 font-bold">
                          +{item.variance}
                        </span>
                      ) : (
                        <span className="text-rose-600 font-bold">
                          {item.variance}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          item.status === "BALANCED" ? "success" : "warning"
                        }
                        size="sm"
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Journal Entry</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {glRows.length === 0 ? (
                <TableEmpty
                  colSpan={5}
                  message="No journal entries found."
                />
              ) : (
                glRows.map((je) => (
                  <TableRow key={je.id}>
                    <TableCell>
                      <div className="font-bold font-mono text-xs text-stone-900">
                        {je.entry_number}
                      </div>
                      <div className="text-[11px] text-stone-500 font-mono">
                        {je.reference_type} ·{" "}
                        {new Date(je.entry_date).toLocaleDateString("en-US")}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-stone-700 max-w-xs truncate">
                      {je.description}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs text-emerald-800">
                      {formatIDR(je.total_debit)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs text-stone-800">
                      {formatIDR(je.total_credit)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={je.is_balanced ? "success" : "danger"}
                        size="sm"
                      >
                        {je.is_balanced ? "BALANCED" : "UNBALANCED"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
});
IntegrityReconciliationWidget.displayName = "IntegrityReconciliationWidget";
