import React, { useState, useEffect, useCallback } from "react";
import {
  Database,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
  Plus,
  Trash2,
  Zap,
  Terminal,
  Layers,
  KeyRound,
  DownloadCloud,
  Sparkles,
} from "lucide-react";
import { supabase, supabaseUrl } from "@/utils/supabase";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import {
  Button,
  Card,
  Badge,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui";
import { cn } from "@/lib/utils";

interface TodoItem {
  id: number;
  name: string;
  is_complete?: boolean;
  created_at?: string;
}

interface SupabaseServerStatus {
  connected: boolean;
  architecture?: string;
  latencyMs: number;
  projectUrl: string;
  keyMode: string;
  hasServiceRoleKey: boolean;
  directPgConnected?: boolean;
  schemaAutoInitialized?: boolean;
  publishableKeyMasked?: string;
  todosTable?: {
    exists: boolean;
    rowCount: number;
    rows: TodoItem[];
    error: string | null;
  };
  erpSyncTable?: {
    exists: boolean;
    rowCount: number;
    recentRecords: Array<{
      collection_name: string;
      record_id: string;
      synced_at: string;
    }>;
    error: string | null;
  };
  bridgeStats?: {
    totalSupabaseSynced: number;
    lastSupabaseSyncedAt: string | null;
    lastSupabaseError: string | null;
    totalRehydratedRecords?: number;
    lastRehydratedAt?: string | null;
  };
  securityHardening?: {
    jwtSecretStrong: boolean;
    jwtSecretLength: number;
    jwtSecretSource: "ENV_PRODUCTION" | "CRYPTO_GENERATED_64B";
    envJwtConfigured: boolean;
    databaseUrlConfigured: boolean;
    directPgPoolConnected: boolean;
    serviceRoleKeyConfigured: boolean;
    erpSyncRlsLockedToServiceRole: boolean;
    erpSyncPolicies: Array<{ policyname: string; roles: string[] }>;
    staticPasscodeBypassDisabled: boolean;
    bcryptOnlyExecutiveAuth: boolean;
  };
  sqlSetupScript?: string;
  error?: string;
}

export const SupabaseSyncPanel: React.FC<{ onDataChanged?: () => void }> =
  React.memo(({ onDataChanged }) => {
    const { showToast } = useToast();

    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [clientTodoError, setClientTodoError] = useState<string | null>(null);
    const [loadingTodos, setLoadingTodos] = useState(false);
    const [newTodoName, setNewTodoName] = useState("");
    const [addingTodo, setAddingTodo] = useState(false);

    const [serverStatus, setServerStatus] =
      useState<SupabaseServerStatus | null>(null);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [syncingAll, setSyncingAll] = useState(false);
    const [rehydrating, setRehydrating] = useState(false);
    const [initializingSchema, setInitializingSchema] = useState(false);
    const [hardeningRls, setHardeningRls] = useState(false);
    const [copiedSql, setCopiedSql] = useState(false);
    const [showSqlDrawer, setShowSqlDrawer] = useState(false);

    const getTodos = useCallback(async () => {
      setLoadingTodos(true);
      try {
        const { data: todosData, error } = await supabase
          .from("todos")
          .select("*")
          .order("id", { ascending: true });

        if (error) {
          setClientTodoError(error.message);
        } else if (todosData) {
          setTodos(todosData as TodoItem[]);
          setClientTodoError(null);
        }
      } catch (err: any) {
        setClientTodoError(err?.message || "Failed to query todos table");
      } finally {
        setLoadingTodos(false);
      }
    }, []);

    const fetchServerStatus = useCallback(async () => {
      setLoadingStatus(true);
      try {
        const res = await apiFetch("/api/supabase/status");
        if (res.ok && res.data) {
          setServerStatus(res.data);
          if (
            res.data.todosTable &&
            !res.data.todosTable.exists &&
            res.data.erpSyncTable &&
            !res.data.erpSyncTable.exists
          ) {
            setShowSqlDrawer(true);
          }
        }
      } catch (err: any) {
        console.error("Failed to fetch Supabase server status:", err);
      } finally {
        setLoadingStatus(false);
      }
    }, []);

    const refreshAll = useCallback(() => {
      getTodos();
      fetchServerStatus();
      if (onDataChanged) onDataChanged();
    }, [getTodos, fetchServerStatus, onDataChanged]);

    useEffect(() => {
      getTodos();
      fetchServerStatus();
    }, [getTodos, fetchServerStatus]);

    const handleAddTodo = async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newTodoName.trim();
      if (!trimmed || addingTodo) return;

      setAddingTodo(true);
      try {
        const { data, error } = await supabase
          .from("todos")
          .insert([{ name: trimmed, is_complete: false }])
          .select();

        if (error) {
          showToast(
            `Insert error: ${error.message}. Run the SQL Setup Script first.`,
            "error",
          );
          setShowSqlDrawer(true);
        } else {
          setNewTodoName("");
          if (data && data.length > 0) {
            setTodos((prev) => [...prev, ...(data as TodoItem[])]);
          } else {
            await getTodos();
          }
          showToast("Record saved to PostgreSQL.", "success");
          fetchServerStatus();
        }
      } catch (err: any) {
        showToast(err?.message || "Failed to insert item", "error");
      } finally {
        setAddingTodo(false);
      }
    };

    const handleToggleTodo = async (todo: TodoItem) => {
      try {
        const nextState = !todo.is_complete;
        const { error } = await supabase
          .from("todos")
          .update({ is_complete: nextState })
          .eq("id", todo.id);

        if (error) {
          showToast(error.message, "error");
        } else {
          setTodos((prev) =>
            prev.map((t) =>
              t.id === todo.id ? { ...t, is_complete: nextState } : t,
            ),
          );
        }
      } catch (err: any) {
        showToast(err?.message || "Update failed", "error");
      }
    };

    const handleDeleteTodo = async (id: number) => {
      try {
        const { error } = await supabase.from("todos").delete().eq("id", id);
        if (error) {
          showToast(error.message, "error");
        } else {
          setTodos((prev) => prev.filter((t) => t.id !== id));
          showToast("Record deleted", "info");
          fetchServerStatus();
        }
      } catch (err: any) {
        showToast(err?.message || "Delete failed", "error");
      }
    };

    const handleSyncCoreErpTables = async () => {
      if (syncingAll) return;
      setSyncingAll(true);
      showToast("Pushing core ERP tables to cloud...", "info");
      try {
        const res = await apiFetch("/api/supabase/sync-all", {
          method: "POST",
        });
        if (res.ok && res.data?.success) {
          showToast(
            `Synced ${Number(res.data.totalSynced || 0).toLocaleString()} records across ${res.data.tablesProcessed} tables.`,
            "success",
          );
          refreshAll();
        } else {
          showToast(
            res.error || res.data?.error || "Failed to sync ERP tables.",
            "error",
          );
          setShowSqlDrawer(true);
        }
      } catch (err: any) {
        showToast(err?.message || "Sync error", "error");
      } finally {
        setSyncingAll(false);
      }
    };

    const handleRehydrateFromSupabase = async () => {
      if (rehydrating) return;
      setRehydrating(true);
      showToast("Restoring records from cloud to local SQLite...", "info");
      try {
        const res = await apiFetch("/api/supabase/rehydrate", {
          method: "POST",
          body: JSON.stringify({}),
        });
        if (res.ok && res.data?.success) {
          showToast(
            res.data.message ||
              `Restored ${Number(res.data.totalRestoredRows || 0).toLocaleString()} records across ${res.data.tablesRestored || 0} tables.`,
            "success",
          );
          refreshAll();
        } else {
          showToast(
            res.error || res.data?.error || "Failed to restore from cloud.",
            "error",
          );
        }
      } catch (err: any) {
        showToast(err?.message || "Restore failed", "error");
      } finally {
        setRehydrating(false);
      }
    };

    const handleAutoInitSchema = async () => {
      if (initializingSchema) return;
      setInitializingSchema(true);
      try {
        const res = await apiFetch("/api/supabase/init-schema", {
          method: "POST",
        });
        if (res.ok && res.data?.autoExecuted) {
          showToast(res.data.message, "success");
          refreshAll();
        } else {
          setShowSqlDrawer(true);
          showToast(
            res.data?.message || "Run the SQL Setup Script in SQL Editor.",
            "info",
          );
        }
      } catch (err: any) {
        showToast(
          err?.message || "Schema initialization check failed",
          "error",
        );
      } finally {
        setInitializingSchema(false);
      }
    };

    const handleHardenRls = async () => {
      if (hardeningRls) return;
      setHardeningRls(true);
      try {
        const res = await apiFetch("/api/supabase/harden-rls", {
          method: "POST",
        });
        if (res.ok && res.data?.success) {
          showToast("RLS policies locked to service_role.", "success");
          refreshAll();
        } else {
          showToast(
            res.data?.message || res.error || "Failed to apply RLS policies.",
            "error",
          );
        }
      } catch (err: any) {
        showToast(err?.message || "Failed to lock RLS", "error");
      } finally {
        setHardeningRls(false);
      }
    };

    const handleCopySql = async () => {
      const script = serverStatus?.sqlSetupScript || "";
      if (!script) return;
      try {
        await navigator.clipboard.writeText(script);
        setCopiedSql(true);
        showToast("SQL script copied to clipboard.", "success");
        setTimeout(() => setCopiedSql(false), 2500);
      } catch {
        showToast("Failed to copy script", "error");
      }
    };

    const isFullyReady =
      Boolean(serverStatus?.todosTable?.exists) &&
      Boolean(serverStatus?.erpSyncTable?.exists);

    const sec = serverStatus?.securityHardening;

    return (
      <div className="space-y-4">
        {/* Clean Connection & Controls Bar */}
        <Card>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-stone-900">
                  Cloud Connection &amp; Schema Controls
                </h3>
                <Badge
                  variant={isFullyReady ? "success" : "warning"}
                  size="sm"
                  dot
                >
                  {isFullyReady ? "Connected" : "Setup Required"}
                </Badge>
                {sec?.erpSyncRlsLockedToServiceRole && (
                  <Badge variant="neutral" size="sm">
                    RLS Locked
                  </Badge>
                )}
              </div>

              <div className="text-xs text-stone-500 font-mono flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{serverStatus?.projectUrl || supabaseUrl}</span>
                {serverStatus?.latencyMs !== undefined && (
                  <>
                    <span>·</span>
                    <span>Latency: {serverStatus.latencyMs} ms</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={handleAutoInitSchema}
                isLoading={initializingSchema}
                disabled={initializingSchema}
                leftIcon={
                  !initializingSchema ? (
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  ) : undefined
                }
              >
                Init Schema
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={handleHardenRls}
                isLoading={hardeningRls}
                disabled={hardeningRls}
                leftIcon={<KeyRound className="w-3 h-3 text-stone-600" />}
              >
                Lock RLS
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => setShowSqlDrawer((v) => !v)}
                leftIcon={<Terminal className="w-3.5 h-3.5 text-stone-600" />}
              >
                {showSqlDrawer ? "Hide SQL" : "SQL Script"}
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={handleRehydrateFromSupabase}
                isLoading={rehydrating}
                disabled={rehydrating || syncingAll}
                leftIcon={
                  !rehydrating ? (
                    <DownloadCloud className="w-3.5 h-3.5 text-emerald-600" />
                  ) : undefined
                }
              >
                Pull Core Tables
              </Button>

              <Button
                type="button"
                variant="primary"
                size="xs"
                onClick={handleSyncCoreErpTables}
                isLoading={syncingAll}
                disabled={syncingAll || rehydrating}
                leftIcon={
                  !syncingAll ? <Zap className="w-3.5 h-3.5" /> : undefined
                }
              >
                Push Core Tables
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                onClick={refreshAll}
                disabled={loadingStatus || loadingTodos}
                title="Refresh Connection Status"
              >
                <RefreshCw
                  className={cn(
                    "w-3.5 h-3.5 text-stone-600",
                    (loadingStatus || loadingTodos) &&
                      "animate-spin text-emerald-600",
                  )}
                />
              </Button>
            </div>
          </div>
        </Card>

        {/* Optional SQL Script Drawer */}
        {showSqlDrawer && serverStatus?.sqlSetupScript && (
          <Card className="bg-stone-900 text-stone-100 border-stone-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-stone-800">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                  PostgreSQL Setup Script
                </h4>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Run this script in the Supabase SQL Editor if tables are not
                  yet initialized.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={handleCopySql}
                leftIcon={
                  copiedSql ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )
                }
              >
                {copiedSql ? "Copied" : "Copy Script"}
              </Button>
            </div>
            <pre className="text-[11px] font-mono leading-relaxed text-stone-200 bg-stone-950/90 p-3.5 rounded-lg border border-stone-800 overflow-x-auto max-h-64">
              {serverStatus.sqlSetupScript}
            </pre>
          </Card>
        )}

        {/* Dual Column Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Panel: Recent Replicated Records */}
          <Card padding="none" className="overflow-hidden flex flex-col">
            <div className="p-4 border-b border-stone-200/80 bg-stone-50/40 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800">
                  Recent Replicated Records
                </h3>
                <Badge
                  variant={
                    serverStatus?.erpSyncTable?.exists ? "success" : "warning"
                  }
                  size="sm"
                >
                  {(
                    serverStatus?.erpSyncTable?.rowCount || 0
                  ).toLocaleString()}{" "}
                  rows
                </Badge>
              </div>
              <span className="font-mono tabular-nums text-[11px] text-stone-500">
                Session Ops:{" "}
                <strong className="text-stone-900">
                  {serverStatus?.bridgeStats?.totalSupabaseSynced || 0}
                </strong>
              </span>
            </div>

            {serverStatus?.erpSyncTable?.error && (
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200/80 flex items-center justify-between gap-2 text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="font-mono text-[11px]">
                    {serverStatus.erpSyncTable.error}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setShowSqlDrawer(true)}
                >
                  SQL Script
                </Button>
              </div>
            )}

            <div className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Collection</TableHead>
                    <TableHead>Record ID</TableHead>
                    <TableHead className="text-right">Synced At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!serverStatus?.erpSyncTable?.recentRecords?.length ? (
                    <TableEmpty
                      colSpan={3}
                      message={
                        serverStatus?.erpSyncTable?.exists
                          ? "No recent sync records. Click 'Push Core Tables' to populate."
                          : "Initialize schema using 'Init Schema' or 'SQL Script'."
                      }
                    />
                  ) : (
                    serverStatus.erpSyncTable.recentRecords.map((rec, idx) => (
                      <TableRow
                        key={`${rec.collection_name}-${rec.record_id}-${idx}`}
                      >
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-stone-800">
                            <Layers className="w-3 h-3 text-emerald-600" />
                            {rec.collection_name}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-stone-700">
                          {rec.record_id}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-[11px] text-stone-500">
                          {rec.synced_at
                            ? new Date(rec.synced_at).toLocaleString("en-US")
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Right Panel: Connection Test Table */}
          <Card padding="none" className="overflow-hidden flex flex-col">
            <div className="p-4 border-b border-stone-200/80 bg-stone-50/40 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800">
                  Client SDK Ping Test (public.todos)
                </h3>
                <Badge
                  variant={
                    !clientTodoError && serverStatus?.todosTable?.exists
                      ? "success"
                      : "warning"
                  }
                  size="sm"
                >
                  {todos.length} rows
                </Badge>
              </div>
            </div>

            <form
              onSubmit={handleAddTodo}
              className="p-3 border-b border-stone-100 bg-white flex items-center gap-2"
            >
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Add test record..."
                  value={newTodoName}
                  onChange={(e) => setNewTodoName(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={addingTodo}
                disabled={addingTodo || !newTodoName.trim()}
                leftIcon={
                  !addingTodo ? <Plus className="w-3.5 h-3.5" /> : undefined
                }
              >
                Add
              </Button>
            </form>

            {clientTodoError && (
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200/80 flex items-center justify-between gap-2 text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="font-mono text-[11px]">
                    {clientTodoError}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setShowSqlDrawer(true)}
                >
                  SQL Script
                </Button>
              </div>
            )}

            <div className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-28 text-center">Status</TableHead>
                    <TableHead className="w-20 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todos.length === 0 ? (
                    <TableEmpty
                      colSpan={4}
                      message="No test records found."
                    />
                  ) : (
                    todos.map((todo) => (
                      <TableRow key={todo.id}>
                        <TableCell className="font-mono tabular-nums text-xs text-stone-500">
                          #{todo.id}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => handleToggleTodo(todo)}
                            className={cn(
                              "text-xs font-semibold text-left cursor-pointer hover:underline",
                              todo.is_complete
                                ? "line-through text-stone-400"
                                : "text-stone-900",
                            )}
                          >
                            {todo.name}
                          </button>
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleTodo(todo)}
                            className="cursor-pointer"
                          >
                            <Badge
                              variant={todo.is_complete ? "success" : "neutral"}
                              size="sm"
                            >
                              {todo.is_complete ? "Done" : "Pending"}
                            </Badge>
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteTodo(todo.id)}
                            className="w-7 h-7 inline-flex items-center justify-center bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 border border-rose-200/70 rounded-lg transition-colors cursor-pointer shadow-2xs"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>
    );
  });
SupabaseSyncPanel.displayName = "SupabaseSyncPanel";
