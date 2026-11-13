import React, { useState, useEffect, useCallback } from "react";
import {
  Download,
  RefreshCw,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Button,
  Card,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui";
import { cn } from "@/lib/utils";

interface BackupSnapshot {
  backup_id: string;
  dump_type: string;
  total_tables: number;
  total_records: number;
  table_counts: Record<string, number>;
  checksum: string;
  size_bytes: number;
  created_at: string;
}

export const DatabaseBackupPanel: React.FC<{ onDataChanged?: () => void }> =
  React.memo(({ onDataChanged }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [triggering, setTriggering] = useState(false);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [snapshots, setSnapshots] = useState<BackupSnapshot[]>([]);

    const isFullControl =
      user?.role === "FC" ||
      user?.role === "GOD_MODE" ||
      user?.role === "SUPERADMIN" ||
      user?.level === "SUPER_ADMIN";

    const fetchSnapshots = useCallback(async () => {
      setLoading(true);
      try {
        const res = await apiFetch("/api/backup/snapshots");
        if (res.ok && res.data) {
          setSnapshots(res.data.snapshots || []);
        } else {
          showToast(res.error || "Failed to load backup snapshots", "error");
        }
      } catch (e: any) {
        console.error(e);
        showToast("Error loading backup snapshots", "error");
      } finally {
        setLoading(false);
      }
    }, [showToast]);

    useEffect(() => {
      fetchSnapshots();
    }, [fetchSnapshots]);

    const handleTriggerBackup = async () => {
      if (!isFullControl) {
        showToast(
          "Full Control (FC) authorization required to create backups",
          "error",
        );
        return;
      }
      if (triggering) return;
      setTriggering(true);
      showToast("Creating cloud backup snapshot...", "info");
      try {
        const res = await apiFetch("/api/backup/trigger-dump", {
          method: "POST",
        });
        if (res.ok && res.data?.success) {
          showToast(
            res.data.message || "Backup snapshot created successfully.",
            "success",
          );
          fetchSnapshots();
          if (onDataChanged) onDataChanged();
        } else {
          showToast(
            res.error || res.data?.error || "Failed to create backup snapshot",
            "error",
          );
        }
      } catch (e: any) {
        showToast(e.message || "Error creating backup snapshot", "error");
      } finally {
        setTriggering(false);
      }
    };

    const handleDownloadBackup = async (backupId: string) => {
      setDownloadingId(backupId);
      try {
        const a = document.createElement("a");
        a.href = `/api/backup/download/${encodeURIComponent(backupId)}`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast("Downloading backup archive...", "info");
      } catch (e: any) {
        showToast(e.message || "Failed to download backup", "error");
      } finally {
        setDownloadingId(null);
      }
    };

    return (
      <Card padding="none" className="overflow-hidden">
        <div className="p-4 border-b border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/40">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-stone-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900">
              Cloud Backup Snapshots
            </h3>
            <Badge variant="neutral" size="sm">
              {snapshots.length} saved
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={fetchSnapshots}
              disabled={loading || triggering}
              leftIcon={
                <RefreshCw
                  className={cn(
                    "w-3.5 h-3.5",
                    loading && "animate-spin text-amber-600",
                  )}
                />
              }
            >
              Refresh
            </Button>

            {isFullControl && (
              <Button
                type="button"
                variant="primary"
                size="xs"
                onClick={handleTriggerBackup}
                disabled={loading || triggering}
                isLoading={triggering}
                leftIcon={
                  !triggering ? (
                    <Sparkles className="w-3.5 h-3.5" />
                  ) : undefined
                }
              >
                Create Snapshot
              </Button>
            )}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Snapshot ID &amp; Created At</TableHead>
              <TableHead>Type &amp; Scope</TableHead>
              <TableHead className="text-right">Total Rows</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="text-center">Checksum</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.length === 0 ? (
              <TableEmpty
                colSpan={6}
                message="No backup snapshots saved yet. Click 'Create Snapshot' to generate a backup."
              />
            ) : (
              snapshots.map((s) => (
                <TableRow key={s.backup_id}>
                  <TableCell>
                    <div className="font-bold font-mono text-xs text-stone-900">
                      {s.backup_id}
                    </div>
                    <div className="text-[11px] text-stone-500 flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="w-3 h-3 text-stone-400" />
                      {new Date(s.created_at).toLocaleString("en-US")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" size="sm">
                        {s.dump_type}
                      </Badge>
                      <span className="text-[11px] text-stone-600 font-mono tabular-nums">
                        {s.total_tables} tables
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-stone-900">
                    {s.total_records.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-xs text-stone-600">
                    {(s.size_bytes / 1024).toFixed(1)} KB
                  </TableCell>
                  <TableCell className="text-center font-mono text-[11px] text-stone-500">
                    {s.checksum
                      ? `${s.checksum.slice(0, 10)}...${s.checksum.slice(-4)}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => handleDownloadBackup(s.backup_id)}
                      disabled={downloadingId === s.backup_id}
                      isLoading={downloadingId === s.backup_id}
                      leftIcon={
                        <Download className="w-3 h-3 text-stone-600" />
                      }
                    >
                      Download JSON
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    );
  });
DatabaseBackupPanel.displayName = "DatabaseBackupPanel";
