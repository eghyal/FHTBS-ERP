import React, { useEffect, useState } from "react";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { History, Activity, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  created_at: string;
}

export function AuditTimeline({
  resourceType,
  resourceId,
  initialLimit = 4,
  defaultCollapsed = false,
}: {
  resourceType?: string;
  resourceId?: string;
  initialLimit?: number;
  defaultCollapsed?: boolean;
}) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(defaultCollapsed);
  const [isExpandedAll, setIsExpandedAll] = useState(false);
  const { user } = useAuth();
  const { language: _language } = useLanguage();

  useEffect(() => {
    setIsSectionCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  useEffect(() => {
    let mounted = true;
    const fetchLogs = async () => {
      const url = resourceId
        ? `/api/audit-trail?resource_id=${resourceId}`
        : `/api/audit-trail`;

      try {
        const res = await apiFetch(url, {}, user?.username);
        if (res.ok && mounted) {
          setLogs(Array.isArray(res.data) ? res.data : []);
        }
      } catch (err) {
        console.error("Failed to fetch audit trail", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchLogs();

    // Auto-refresh every 30 seconds for real-time observability
    const interval = setInterval(() => {
      if (!document.hidden) fetchLogs();
    }, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [resourceId, resourceType, user?.username]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32 text-stone-400">
        <Activity className="w-5 h-5 animate-pulse" />
      </div>
    );
  }

  const hasOverflow = logs.length > initialLimit;
  const visibleLogs = isExpandedAll ? logs : logs.slice(0, initialLimit);
  const hiddenCount = Math.max(0, logs.length - initialLimit);

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          !isSectionCollapsed && "border-b border-stone-100 pb-3.5",
        )}
      >
        <button
          type="button"
          onClick={() => setIsSectionCollapsed((prev) => !prev)}
          className="flex items-center gap-2 text-left group cursor-pointer"
        >
          <History className="w-4 h-4 text-stone-900 shrink-0" />
          <h3 className="text-xs sm:text-sm font-bold text-stone-900 uppercase tracking-widest group-hover:text-stone-700 transition-colors">
            Activity Journal
          </h3>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/80 tabular-nums">
            {logs.length}
          </span>
        </button>

        <div className="flex items-center gap-1.5">
          {!isSectionCollapsed && hasOverflow && (
            <button
              type="button"
              onClick={() => setIsExpandedAll((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200/70 transition-colors cursor-pointer"
            >
              <span>{isExpandedAll ? "Compact" : `All (${logs.length})`}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsSectionCollapsed((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200/80 transition-colors cursor-pointer"
            title={isSectionCollapsed ? "Expand Activity Journal" : "Collapse Activity Journal"}
          >
            <span>{isSectionCollapsed ? "Expand" : "Collapse"}</span>
            {isSectionCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {isSectionCollapsed ? (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-stone-50/80 border border-stone-100 text-[11px] text-stone-500">
          <span>
            {logs.length === 0
              ? "No activity logs recorded."
              : `Latest: ${logs[0]?.action} by ${logs[0]?.user_email}`}
          </span>
          <button
            type="button"
            onClick={() => setIsSectionCollapsed(false)}
            className="font-bold text-stone-800 hover:underline cursor-pointer ml-2 shrink-0"
          >
            Show Journal
          </button>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-6 text-stone-400 text-xs font-bold uppercase tracking-widest border border-stone-100 rounded-2xl bg-stone-50/50">
          No activity logs found.
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={cn(
              "relative border-l-2 border-stone-100 ml-3.5 space-y-5 pl-5",
              isExpandedAll && logs.length > 8 && "max-h-[420px] overflow-y-auto pr-2 custom-scrollbar",
            )}
          >
            {visibleLogs.map((log) => (
              <div key={log.id} className="relative">
                <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-white border-2 border-stone-300 shadow-2xs" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider tabular-nums">
                    {new Date(log.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-xs sm:text-sm text-stone-900 font-semibold leading-snug">
                    {log.action}
                  </span>
                  <span className="text-[11px] text-stone-500">
                    by{" "}
                    <span className="font-bold text-stone-700">
                      {log.user_email}
                    </span>
                  </span>
                  {log.details && (
                    <p className="text-[11px] font-mono text-stone-600 mt-1.5 bg-stone-50 p-2 rounded-lg border border-stone-100 break-words leading-relaxed">
                      {log.details}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {hasOverflow && (
            <div className="pt-2 border-t border-stone-100 flex justify-center">
              <button
                type="button"
                onClick={() => setIsExpandedAll((prev) => !prev)}
                className="w-full py-2 px-3 rounded-xl bg-stone-50 hover:bg-stone-100 border border-stone-200/70 text-[11px] font-bold text-stone-700 hover:text-stone-950 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {isExpandedAll ? (
                  <>
                    <span>Show Less (Top {initialLimit} Entries)</span>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    <span>
                      Show All {logs.length} Activities (+{hiddenCount} more)
                    </span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
