import { apiFetch } from "@/utils/api";
import React, { useEffect, useState, useMemo } from "react";
import {
  Search,
  User,
  Activity,
  Clock,
  Shield,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Database,
} from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";
import { useAuth } from "@/contexts/AuthContext";
import {
  Button,
  Card,
  Input,
  Select,
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

interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  created_at: string;
}

export default function Logs() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [resourceFilter, setResourceFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/audit-trail", {}, user?.username);
      if (res.ok) {
        setLogs(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch logs", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const resourceTypes = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.resource_type) set.add(l.resource_type);
    });
    return Array.from(set).sort();
  }, [logs]);

  const stats = useMemo(() => {
    let creates = 0;
    let updatesAndApprovals = 0;
    let deletionsAndRejections = 0;
    logs.forEach((l) => {
      const act = (l.action || "").toUpperCase();
      if (act.includes("CREATE") || act.includes("IMPORT")) creates++;
      else if (act.includes("DELETE") || act.includes("REJECT"))
        deletionsAndRejections++;
      else updatesAndApprovals++;
    });
    return {
      total: logs.length,
      creates,
      updatesAndApprovals,
      deletionsAndRejections,
    };
  }, [logs]);

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (resourceFilter !== "ALL" && log.resource_type !== resourceFilter) {
          return false;
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          log.user_email?.toLowerCase().includes(q) ||
          log.action?.toLowerCase().includes(q) ||
          log.details?.toLowerCase().includes(q) ||
          log.resource_id?.toLowerCase().includes(q) ||
          log.resource_type?.toLowerCase().includes(q)
        );
      }),
    [logs, searchQuery, resourceFilter],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, resourceFilter]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("CREATE") || action.includes("IMPORT"))
      return "success";
    if (action.includes("DELETE") || action.includes("REJECT")) return "danger";
    if (action.includes("UPDATE") || action.includes("EDIT")) return "info";
    if (action.includes("AUTH") || action.includes("APPROVE")) return "purple";
    return "neutral";
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="System Audit Logs"
        subtitle="System activity and transaction audit trail"
        icon={<Activity className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="success" dot className="px-3 py-1.5">
              <Shield className="w-3.5 h-3.5 mr-1" /> Monitored
            </Badge>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={fetchLogs}
              disabled={isLoading}
              title="Refresh System Logs"
              aria-label="Refresh System Logs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      <Card padding="none">
        <div className="p-4 sm:p-5 border-b border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/40">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 max-w-2xl">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Search by user, action, resource ID, or details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-3.5 h-3.5" />}
              />
            </div>
            <div className="w-full sm:w-52">
              <Select
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
                icon={<Database className="w-3.5 h-3.5" />}
              >
                <option value="ALL">All Modules ({logs.length})</option>
                {resourceTypes.map((rt) => (
                  <option key={rt} value={rt}>
                    {rt}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="text-xs text-stone-500 font-mono tabular-nums">
            Showing <strong className="text-stone-800">{filteredLogs.length}</strong> events
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp (WIB)</TableHead>
              <TableHead>Actor / User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Audit Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16">
                  <Loader text="Loading audit logs..." />
                </TableCell>
              </TableRow>
            ) : paginatedLogs.length === 0 ? (
              <TableEmpty
                colSpan={5}
                icon={<Activity className="w-6 h-6" />}
                message="No activity logs found matching the filter criteria."
              />
            ) : (
              paginatedLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 font-mono tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-stone-400" />
                      {new Date(log.created_at).toLocaleString("en-US", {
                        timeZone: "Asia/Jakarta",
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-stone-100 border border-stone-200/80 rounded-full flex items-center justify-center shrink-0">
                        <User className="w-3 h-3 text-stone-500" />
                      </div>
                      <span className="text-xs font-bold text-stone-800 font-mono">
                        {log.user_email || "SYSTEM"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={getActionBadgeVariant(log.action)}
                      size="sm"
                    >
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-bold text-stone-800">
                      {log.resource_type}
                    </div>
                    {log.resource_id && (
                      <div className="text-[11px] text-stone-400 font-mono tabular-nums truncate max-w-[180px]">
                        {log.resource_id}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-stone-600 max-w-md">
                    {log.details}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Controls */}
        {!isLoading && totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3.5 border-t border-stone-100 bg-stone-50/50 gap-3">
            <span className="text-xs text-stone-500 font-medium">
              Showing{" "}
              <span className="font-bold text-stone-800 font-mono tabular-nums">
                {(currentPage - 1) * itemsPerPage + 1}
              </span>{" "}
              to{" "}
              <span className="font-bold text-stone-800 font-mono tabular-nums">
                {Math.min(currentPage * itemsPerPage, filteredLogs.length)}
              </span>{" "}
              of{" "}
              <span className="font-bold text-stone-800 font-mono tabular-nums">
                {filteredLogs.length}
              </span>{" "}
              records
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </Button>
              <span className="px-2 text-xs font-bold text-stone-700 font-mono tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="xs"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
