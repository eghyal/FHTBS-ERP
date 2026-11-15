import React, { useState, useEffect, useMemo } from "react";
import {
  Cloud,
  Database,
  RefreshCw,
  ShieldCheck,
  Activity,
  Layers,
  Play,
  HardDrive,
  Search,
  Factory,
  Package,
  Briefcase,
  CircleDollarSign,
  Shield,
  Clock,
  DownloadCloud,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Button,
  Card,
  Badge,
  Input,
  StatCard,
  Tabs,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { SupabaseSyncPanel } from "@/components/erp/SupabaseSyncPanel";
import { IntegrityReconciliationWidget } from "@/components/erp/IntegrityReconciliationWidget";
import { DatabaseBackupPanel } from "@/components/erp/DatabaseBackupPanel";

interface TableStat {
  table: string;
  exists: boolean;
  rowCount: number;
}

interface MigrationSummary {
  batchId: string;
  startedAt: string;
  completedAt: string;
  totalTables: number;
  totalRows: number;
  overallStatus: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  results: Array<{
    tableName: string;
    rowCount: number;
    migratedCount: number;
    checksum: string;
    status: string;
    durationMs: number;
    error?: string;
  }>;
}

type DomainCategory =
  | "ALL"
  | "PRODUCTION"
  | "INVENTORY"
  | "COMMERCIAL"
  | "FINANCE_HR"
  | "GOVERNANCE";

type EngineMode = "HYBRID_SYNC" | "FIRESTORE_PRIMARY" | "SQLITE_FALLBACK";

interface DomainConfig {
  id: DomainCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DOMAINS: DomainConfig[] = [
  { id: "ALL", label: "All Tables", icon: Layers },
  { id: "PRODUCTION", label: "Production", icon: Factory },
  { id: "INVENTORY", label: "Inventory", icon: Package },
  { id: "COMMERCIAL", label: "Commercial", icon: Briefcase },
  { id: "FINANCE_HR", label: "Finance & HR", icon: CircleDollarSign },
  { id: "GOVERNANCE", label: "Governance", icon: Shield },
];

export default function CloudMigrationHub() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [rehydratingAll, setRehydratingAll] = useState(false);
  const [rehydratingTable, setRehydratingTable] = useState<string | null>(null);

  const [dbMode, setDbMode] = useState<EngineMode>("HYBRID_SYNC");
  const [tableStats, setTableStats] = useState<TableStat[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [lastSummary, setLastSummary] = useState<MigrationSummary | null>(null);
  const [syncStats, setSyncStats] = useState<any>(null);
  const [sqliteWal, setSqliteWal] = useState<any>(null);
  const [outboxStats, setOutboxStats] = useState<any>(null);
  const [retryingOutbox, setRetryingOutbox] = useState(false);
  const [pullingDeltas, setPullingDeltas] = useState(false);
  const [checkpointingWal, setCheckpointingWal] = useState(false);
  const [filterDomain, setFilterDomain] = useState<DomainCategory>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<
    "tables" | "supabase" | "integrity" | "backup" | "batch_logs"
  >("tables");
  const [syncingSupabaseTable, setSyncingSupabaseTable] = useState<
    string | null
  >(null);

  const normalizeDbMode = (raw?: string): EngineMode => {
    if (raw === "FIRESTORE_PRIMARY" || raw === "FIRESTORE_ONLY") {
      return "FIRESTORE_PRIMARY";
    }
    if (raw === "SQLITE_FALLBACK") {
      return "SQLITE_FALLBACK";
    }
    return "HYBRID_SYNC";
  };

  const fetchStatus = async () => {
    try {
      const res = await apiFetch("/api/migration/status");
      if (res.ok && res.data) {
        setDbMode(normalizeDbMode(res.data.dbMode));
        setTableStats(res.data.tableStats || []);
        setTotalRecords(res.data.totalSQLiteRecords || 0);
        setLastSummary(res.data.lastSummary || null);
        setSyncStats(res.data.syncStats || null);
        setSqliteWal(res.data.sqliteWal || null);
      }
      try {
        const outboxRes = await apiFetch("/api/sync/outbox/status");
        if (outboxRes.ok && outboxRes.data?.stats) {
          setOutboxStats(outboxRes.data.stats);
        }
      } catch (_e) {
        // Non-blocking
      }
    } catch (err: any) {
      console.error("Failed to load migration status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      if (!document.hidden) fetchStatus();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleStartFullMigration = async () => {
    if (migrating) return;
    setMigrating(true);
    showToast("Starting full cloud synchronization...", "info");

    try {
      const res = await apiFetch("/api/migration/start", { method: "POST" });
      if (res.ok && res.data?.summary) {
        const syncedRows =
          res.data.summary.totalRows ??
          res.data.summary.totalMigratedRows ??
          0;
        setLastSummary(res.data.summary);
        showToast(
          `Sync completed: ${Number(syncedRows).toLocaleString()} records replicated.`,
          "success",
        );
        fetchStatus();
      } else {
        showToast(res.error || res.data?.error || "Migration failed", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to trigger migration", "error");
    } finally {
      setMigrating(false);
    }
  };

  const handleRehydrateAll = async () => {
    if (rehydratingAll) return;
    setRehydratingAll(true);
    showToast("Pulling records from cloud database to local storage...", "info");
    try {
      const res = await apiFetch("/api/supabase/rehydrate", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res.ok && res.data?.success) {
        showToast(
          res.data.message ||
            `Restored ${Number(res.data.totalRestoredRows || 0).toLocaleString()} rows across ${res.data.tablesRestored || 0} tables.`,
          "success",
        );
        fetchStatus();
      } else {
        showToast(
          res.error || res.data?.error || "Failed to pull records from cloud",
          "error",
        );
      }
    } catch (err: any) {
      showToast(err.message || "Error restoring data", "error");
    } finally {
      setRehydratingAll(false);
    }
  };

  const handleRehydrateSingleTable = async (tableName: string) => {
    setRehydratingTable(tableName);
    try {
      const res = await apiFetch("/api/supabase/rehydrate", {
        method: "POST",
        body: JSON.stringify({ table: tableName }),
      });
      if (res.ok && res.data?.success) {
        showToast(
          res.data.message || `Table ${tableName} pulled from cloud.`,
          "success",
        );
        fetchStatus();
      } else {
        showToast(
          res.error || res.data?.error || `Failed to pull ${tableName}`,
          "error",
        );
      }
    } catch (err: any) {
      showToast(err.message || "Error", "error");
    } finally {
      setRehydratingTable(null);
    }
  };

  const handleSyncTableToSupabase = async (tableName: string) => {
    setSyncingSupabaseTable(tableName);
    try {
      const res = await apiFetch(`/api/supabase/sync-table/${tableName}`, {
        method: "POST",
      });
      if (res.ok && res.data?.success) {
        showToast(
          res.data.message || `Table ${tableName} pushed to cloud.`,
          "success",
        );
        fetchStatus();
      } else {
        showToast(
          res.error || res.data?.error || `Failed to push ${tableName}`,
          "error",
        );
        setActiveTab("supabase");
      }
    } catch (err: any) {
      showToast(err.message || "Error syncing table", "error");
    } finally {
      setSyncingSupabaseTable(null);
    }
  };

  const handleRetryOutbox = async () => {
    if (retryingOutbox) return;
    setRetryingOutbox(true);
    try {
      const res = await apiFetch("/api/sync/outbox/process", {
        method: "POST",
      });
      if (res.ok) {
        showToast("Outbox queue flushed", "success");
        fetchStatus();
      } else {
        showToast(
          res.error || res.data?.error || "Failed to flush outbox",
          "error",
        );
      }
    } catch (e: any) {
      showToast(e.message || "Failed to flush outbox", "error");
    } finally {
      setRetryingOutbox(false);
    }
  };

  const handleReplayDlq = async () => {
    try {
      const res = await apiFetch("/api/sync/outbox/replay-dlq", {
        method: "POST",
      });
      if (res.ok) {
        showToast("Dead-letter queue replay triggered", "success");
        fetchStatus();
      } else {
        showToast(
          res.error || res.data?.error || "Failed to replay DLQ",
          "error",
        );
      }
    } catch (e: any) {
      showToast(e.message || "Failed to replay DLQ", "error");
    }
  };

  const handlePullDeltas = async () => {
    if (pullingDeltas) return;
    setPullingDeltas(true);
    try {
      const res = await apiFetch("/api/supabase/delta-sync", {
        method: "POST",
      });
      if (res.ok && res.data?.success) {
        showToast(
          res.data.message || "Delta synchronization completed.",
          "success",
        );
        fetchStatus();
      } else {
        showToast(
          res.error || res.data?.error || "Delta synchronization failed",
          "error",
        );
      }
    } catch (err: any) {
      showToast(err.message || "Delta sync error", "error");
    } finally {
      setPullingDeltas(false);
    }
  };

  const handleWalCheckpoint = async () => {
    if (checkpointingWal) return;
    setCheckpointingWal(true);
    try {
      const res = await apiFetch("/api/sqlite/wal-checkpoint", {
        method: "POST",
        body: JSON.stringify({ mode: "PASSIVE" }),
      });
      if (res.ok && res.data?.success) {
        if (res.data.telemetry) {
          setSqliteWal(res.data.telemetry);
        }
        showToast("Local WAL checkpoint completed.", "success");
      } else {
        showToast(res.error || "WAL checkpoint failed", "error");
      }
    } catch (err: any) {
      showToast(err.message || "WAL checkpoint error", "error");
    } finally {
      setCheckpointingWal(false);
    }
  };

  const handleChangeDbMode = async (newMode: EngineMode) => {
    try {
      const res = await apiFetch("/api/migration/mode", {
        method: "POST",
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) {
        setDbMode(normalizeDbMode(res.data?.currentMode || newMode));
        showToast(`Sync mode updated to ${newMode}`, "success");
      } else {
        showToast(
          res.error || res.data?.error || "Failed to update mode",
          "error",
        );
      }
    } catch (err: any) {
      showToast(err.message || "Error updating mode", "error");
    }
  };

  const getDomainForTable = (name: string): DomainCategory => {
    if (
      [
        "projects",
        "spks",
        "ntps",
        "boms",
        "bom_templates",
        "bom_template_items",
        "bop_versions",
        "bill_of_processes",
        "product_node_lifecycle",
        "production_manpower",
        "project_stations",
        "production_manpower_assignments",
        "production_lots",
        "lot_routing_executions",
        "task_travel_tags",
        "notice_to_down_processes",
        "ndps",
        "finish_good_records",
        "wip_movements",
        "work_orders",
        "work_order_items",
        "work_order_tickets",
        "project_tasks",
        "work_centers",
        "production_stations",
        "eco_logs",
      ].includes(name)
    ) {
      return "PRODUCTION";
    }
    if (
      [
        "items",
        "inventory",
        "stock_movements",
        "delivery_notes",
        "delivery_items",
        "delivery_receipts",
        "delivery_receipt_items",
        "inventory_labels",
        "inventory_reservations",
      ].includes(name)
    ) {
      return "INVENTORY";
    }
    if (
      [
        "quotations",
        "quotation_items",
        "crm_leads",
        "shop_customers",
        "shop_orders",
        "shop_order_items",
        "purchase_requests",
        "pr_items",
        "procurement_plans",
        "procurement_plan_waves",
        "procurement_plan_items",
        "purchase_orders",
        "grns",
        "grn_items",
        "commercial_invoices",
        "customers",
        "suppliers",
        "item_supplier_prices",
        "item_price_history",
      ].includes(name)
    ) {
      return "COMMERCIAL";
    }
    if (
      [
        "chart_of_accounts",
        "accounting_periods",
        "closing_required_items",
        "closing_snapshots",
        "finance_transactions",
        "journal_entries",
        "journal_entry_lines",
        "finance_payroll",
        "payroll_requisitions",
        "hr_jobs",
        "hr_applications",
        "hr_kpis",
        "hr_leaves",
        "hr_salaries",
        "hr_payslips",
        "bank_accounts",
        "hr_attendances",
      ].includes(name)
    ) {
      return "FINANCE_HR";
    }
    return "GOVERNANCE";
  };

  const filteredTables = useMemo(() => {
    return tableStats.filter((t) => {
      const domain = getDomainForTable(t.table);
      if (filterDomain !== "ALL" && domain !== filterDomain) return false;
      if (
        searchQuery &&
        !t.table.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    });
  }, [tableStats, filterDomain, searchQuery]);

  const domainCounts = useMemo(() => {
    const counts: Record<DomainCategory, number> = {
      ALL: tableStats.length,
      PRODUCTION: 0,
      INVENTORY: 0,
      COMMERCIAL: 0,
      FINANCE_HR: 0,
      GOVERNANCE: 0,
    };
    tableStats.forEach((t) => {
      const d = getDomainForTable(t.table);
      if (counts[d] !== undefined) {
        counts[d]++;
      }
    });
    return counts;
  }, [tableStats]);

  const totalFilteredRows = useMemo(() => {
    return filteredTables.reduce((acc, curr) => acc + (curr.rowCount || 0), 0);
  }, [filteredTables]);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Cloud Migration & Sync"
        subtitle="Cloud synchronization & schema status"
        icon={<Cloud className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={fetchStatus}
              disabled={loading}
              title="Refresh Status"
              aria-label="Refresh Status"
            >
              <RefreshCw
                className={cn(
                  "w-3.5 h-3.5 text-stone-500",
                  loading && "animate-spin text-amber-600",
                )}
              />
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handlePullDeltas}
              disabled={pullingDeltas || rehydratingAll || migrating}
              isLoading={pullingDeltas}
              leftIcon={
                !pullingDeltas ? (
                  <RefreshCw className="w-3.5 h-3.5 text-stone-600" />
                ) : undefined
              }
            >
              Pull Deltas
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleRehydrateAll}
              disabled={rehydratingAll || migrating}
              isLoading={rehydratingAll}
              leftIcon={
                !rehydratingAll ? (
                  <DownloadCloud className="w-3.5 h-3.5 text-emerald-600" />
                ) : undefined
              }
            >
              Pull All from Cloud
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleStartFullMigration}
              disabled={migrating || rehydratingAll}
              isLoading={migrating}
              leftIcon={
                !migrating ? (
                  <Play className="w-3.5 h-3.5 fill-current" />
                ) : undefined
              }
            >
              {migrating ? "Syncing..." : "Push All to Cloud"}
            </Button>
          </div>
        }
      />

      {migrating && (
        <Card className="bg-amber-50/90 border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
              <RefreshCw className="w-4 h-4 animate-spin" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900">
                Cloud Synchronization in Progress
              </div>
              <div className="text-[11px] text-amber-700">
                Replicating tables to PostgreSQL cloud storage...
              </div>
            </div>
          </div>
          <Badge variant="warning" dot>
            Processing
          </Badge>
        </Card>
      )}

      {/* Compact Standard KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Tracked Tables"
          value={tableStats.length.toLocaleString()}
          subtitle={`${totalRecords.toLocaleString()} total local rows`}
          icon={Layers}
          variant="default"
          isLoading={loading}
        />
        <StatCard
          label="Cloud Synced"
          value={(syncStats?.totalSyncedItems || 0).toLocaleString()}
          subtitle="PostgreSQL primary records"
          icon={Cloud}
          variant="success"
          isLoading={loading}
        />
        <StatCard
          label="Outbox Queue"
          value={(outboxStats?.pendingCount || 0).toLocaleString()}
          subtitle={`${(outboxStats?.completedCount || 0).toLocaleString()} committed · ${outboxStats?.deadLetterCount || 0} DLQ`}
          icon={Activity}
          variant={
            (outboxStats?.deadLetterCount || 0) > 0
              ? "danger"
              : (outboxStats?.pendingCount || 0) > 0
                ? "warning"
                : "default"
          }
          isLoading={loading}
        />
        <StatCard
          label="Local Cache"
          value={`SQLite ${sqliteWal?.journalMode || "WAL"}`}
          subtitle={`${sqliteWal?.cdcHookedTables || tableStats.length} CDC tables active`}
          icon={HardDrive}
          variant="info"
          isLoading={loading}
        />
      </div>

      {/* Mode & Queue Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          activeId={activeTab}
          onChange={setActiveTab}
          items={[
            {
              id: "tables",
              label: "Collections",
              icon: <Layers className="w-3.5 h-3.5" />,
              badge: tableStats.length,
            },
            {
              id: "supabase",
              label: "Cloud Sync",
              icon: <Database className="w-3.5 h-3.5 text-emerald-600" />,
            },
            {
              id: "integrity",
              label: "Data Integrity",
              icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />,
            },
            {
              id: "backup",
              label: "Backups",
              icon: <Cloud className="w-3.5 h-3.5 text-stone-600" />,
            },
            {
              id: "batch_logs",
              label: "Sync Logs",
              icon: <Clock className="w-3.5 h-3.5" />,
              badge: lastSummary?.results?.length || 0,
            },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center p-0.5 rounded-xl bg-stone-100 border border-stone-200/80">
            {(
              [
                { id: "HYBRID_SYNC", label: "Write-Through" },
                { id: "FIRESTORE_PRIMARY", label: "Cloud Primary" },
                { id: "SQLITE_FALLBACK", label: "Local Edge" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleChangeDbMode(m.id)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap",
                  dbMode === m.id
                    ? "bg-white text-stone-900 shadow-2xs border border-stone-200/90"
                    : "text-stone-500 hover:text-stone-900",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={handleWalCheckpoint}
            isLoading={checkpointingWal}
            disabled={checkpointingWal}
          >
            WAL Checkpoint
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={handleRetryOutbox}
            isLoading={retryingOutbox}
            disabled={retryingOutbox}
          >
            Flush Outbox
          </Button>

          {(outboxStats?.deadLetterCount || 0) > 0 && (
            <Button
              type="button"
              variant="danger_soft"
              size="xs"
              onClick={handleReplayDlq}
            >
              Replay DLQ
            </Button>
          )}
        </div>
      </div>

      {activeTab === "supabase" && (
        <SupabaseSyncPanel onDataChanged={fetchStatus} />
      )}

      {activeTab === "integrity" && (
        <IntegrityReconciliationWidget onDataChanged={fetchStatus} />
      )}

      {activeTab === "backup" && (
        <DatabaseBackupPanel onDataChanged={fetchStatus} />
      )}

      {activeTab !== "supabase" &&
        activeTab !== "integrity" &&
        activeTab !== "backup" && (
          <Card padding="none" className="overflow-hidden">
            {activeTab === "tables" ? (
              <>
                <div className="p-4 border-b border-stone-200/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-stone-50/40">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 no-scrollbar">
                    {DOMAINS.map((d) => {
                      const IconComp = d.icon;
                      const isSelected = filterDomain === d.id;
                      const count = domainCounts[d.id] || 0;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setFilterDomain(d.id)}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all inline-flex items-center gap-1.5 cursor-pointer border",
                            isSelected
                              ? "bg-white text-stone-900 border-stone-200/90 shadow-2xs"
                              : "bg-transparent text-stone-600 border-transparent hover:bg-stone-200/60",
                          )}
                        >
                          <IconComp
                            className={cn(
                              "w-3.5 h-3.5",
                              isSelected ? "text-stone-900" : "text-stone-400",
                            )}
                          />
                          <span>{d.label}</span>
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums",
                              isSelected
                                ? "bg-stone-900 text-white"
                                : "bg-stone-200 text-stone-600",
                            )}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-full lg:w-64">
                      <Input
                        type="text"
                        placeholder="Search table name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        icon={<Search className="w-3.5 h-3.5" />}
                      />
                    </div>
                    <span className="hidden sm:inline text-xs text-stone-500 font-mono tabular-nums whitespace-nowrap">
                      <strong className="text-stone-800">
                        {totalFilteredRows.toLocaleString()}
                      </strong>{" "}
                      rows
                    </span>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table Name</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead className="text-right">Local Rows</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Checksum</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTables.length === 0 ? (
                      <TableEmpty
                        colSpan={6}
                        message="No tables found matching your filter."
                      />
                    ) : (
                      filteredTables.map((t) => {
                        const domain = getDomainForTable(t.table);
                        const tableLog = lastSummary?.results?.find(
                          (r) => r.tableName === t.table,
                        );
                        const isTableRehydrating = rehydratingTable === t.table;

                        return (
                          <TableRow key={t.table}>
                            <TableCell>
                              <span className="font-mono font-bold text-stone-900 text-xs">
                                {t.table}
                              </span>
                            </TableCell>

                            <TableCell>
                              <Badge variant="neutral" size="sm">
                                {domain}
                              </Badge>
                            </TableCell>

                            <TableCell className="text-right font-mono tabular-nums font-bold text-stone-900 text-xs">
                              {t.rowCount.toLocaleString()}
                            </TableCell>

                            <TableCell>
                              <Badge
                                variant={t.rowCount > 0 ? "success" : "default"}
                                size="sm"
                                dot
                              >
                                {t.rowCount > 0 ? "Active" : "Empty"}
                              </Badge>
                            </TableCell>

                            <TableCell className="font-mono tabular-nums text-[11px] text-stone-500">
                              {tableLog?.checksum
                                ? `${tableLog.checksum.substring(0, 12)}...`
                                : "Verified"}
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="xs"
                                  onClick={() =>
                                    handleSyncTableToSupabase(t.table)
                                  }
                                  disabled={
                                    syncingSupabaseTable === t.table ||
                                    isTableRehydrating ||
                                    migrating
                                  }
                                  leftIcon={
                                    syncingSupabaseTable === t.table ? (
                                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                                    ) : (
                                      <Database className="w-3 h-3 text-emerald-600" />
                                    )
                                  }
                                >
                                  Push
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="xs"
                                  onClick={() =>
                                    handleRehydrateSingleTable(t.table)
                                  }
                                  disabled={
                                    isTableRehydrating ||
                                    syncingSupabaseTable === t.table ||
                                    migrating
                                  }
                                  leftIcon={
                                    isTableRehydrating ? (
                                      <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                                    ) : (
                                      <DownloadCloud className="w-3 h-3 text-stone-600" />
                                    )
                                  }
                                >
                                  Pull
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </>
            ) : (
              <>
                <div className="p-4 border-b border-stone-200/80 flex items-center justify-between bg-stone-50/40">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                      Batch Execution Log
                    </h3>
                    <p className="text-xs text-stone-500 font-mono mt-0.5">
                      {lastSummary
                        ? `Batch ${lastSummary.batchId} · ${new Date(lastSummary.completedAt).toLocaleString("en-US")}`
                        : "No batch executed in this session."}
                    </p>
                  </div>
                  {lastSummary && (
                    <Badge
                      variant={
                        lastSummary.overallStatus === "SUCCESS"
                          ? "success"
                          : "warning"
                      }
                      dot
                    >
                      {lastSummary.overallStatus}
                    </Badge>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table Name</TableHead>
                      <TableHead className="text-right">Source Rows</TableHead>
                      <TableHead className="text-right">Synced Rows</TableHead>
                      <TableHead>Checksum</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!lastSummary?.results?.length ? (
                      <TableEmpty
                        colSpan={6}
                        message="Run 'Push All to Cloud' to generate a batch synchronization log."
                      />
                    ) : (
                      lastSummary.results.map((r) => (
                        <TableRow key={r.tableName}>
                          <TableCell className="font-mono font-bold text-xs text-stone-900">
                            {r.tableName}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-xs">
                            {r.rowCount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-xs font-bold">
                            {r.migratedCount.toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-stone-500">
                            {r.checksum.length > 14
                              ? `${r.checksum.substring(0, 14)}...`
                              : r.checksum}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-xs text-stone-500">
                            {r.durationMs} ms
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                r.status === "SUCCESS"
                                  ? "success"
                                  : r.status === "SKIPPED"
                                    ? "neutral"
                                    : "danger"
                              }
                              size="sm"
                            >
                              {r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </>
            )}
          </Card>
        )}
    </div>
  );
}
