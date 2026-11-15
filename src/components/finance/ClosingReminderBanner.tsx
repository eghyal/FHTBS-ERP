import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  Lock,
  AlertTriangle,
  ArrowRight,
  FileCheck2,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

interface ClosingSummaryPayload {
  period_key: string;
  period_name: string;
  period_status: "OPEN" | "SOFT_LOCKED" | "HARD_CLOSED";
  window_status: {
    is_open: boolean;
    current_day: number;
    current_date: string;
    current_period_key: string;
    default_closing_period_key?: string;
    days_remaining: number;
    days_until_open: number;
    next_window_label: string;
    message: string;
  };
  checklist_summary: {
    total_items: number;
    required_total: number;
    required_verified: number;
    required_pending: number;
    completion_pct: number;
    all_required_satisfied: boolean;
    pending_titles: string[];
  };
  hris_prq_status: {
    prq_status: string;
    payroll_status: string;
    is_reconciled: boolean;
  };
  pending_items: Array<{
    id: string;
    item_code: string;
    title: string;
    assigned_role: string;
    requirement_type: string;
    status: string;
    due_day: number;
  }>;
  gates: {
    can_submit_items: boolean;
    can_soft_lock: boolean;
    can_hard_close: boolean;
    can_generate_report: boolean;
    blocking_reasons: string[];
  };
}

interface ClosingReminderBannerProps {
  periodKey?: string;
  compact?: boolean;
  refreshKey?: number;
  className?: string;
}

export const ClosingReminderBanner: React.FC<ClosingReminderBannerProps> = ({
  periodKey,
  compact = false,
  refreshKey = 0,
  className,
}) => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<ClosingSummaryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    try {
      const qs = periodKey ? `?period_key=${encodeURIComponent(periodKey)}` : "";
      const res = await apiFetch(
        `/api/finance/closing-status/summary${qs}`,
        {},
        user?.username,
      );
      if (res.ok && res.data?.success) {
        setSummary(res.data as ClosingSummaryPayload);
      }
    } catch {
      // Silent fallback if user lacks access or transient network error
    } finally {
      setIsLoading(false);
    }
  }, [periodKey, user?.username]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, refreshKey]);

  if (isLoading || !summary) return null;

  const isWindowOpen = summary.window_status.is_open;
  const isHardClosed = summary.period_status === "HARD_CLOSED";
  const allSatisfied = summary.checklist_summary.all_required_satisfied;
  const targetUrl = `/book-closing?period=${encodeURIComponent(summary.period_key)}`;

  const badgeVariant = isHardClosed
    ? "success"
    : isWindowOpen
      ? allSatisfied
        ? "success"
        : "warning"
      : "neutral";

  const iconBoxClasses = isHardClosed
    ? "bg-emerald-50 border-emerald-200/80 text-emerald-700"
    : isWindowOpen
      ? allSatisfied
        ? "bg-emerald-50 border-emerald-200/80 text-emerald-700"
        : "bg-amber-50 border-amber-200/80 text-amber-700"
      : "bg-stone-100 border-stone-200/80 text-stone-600";

  if (compact) {
    return (
      <div
        className={cn(
          "bg-white border border-stone-200/80 rounded-2xl px-4 py-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3",
          className,
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-8 h-8 rounded-xl border flex items-center justify-center shrink-0",
              iconBoxClasses,
            )}
          >
            {isHardClosed ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : isWindowOpen ? (
              <CalendarClock className="w-4 h-4" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0 text-xs">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-bold text-stone-900">
                Book Closing · {summary.period_name || summary.period_key}
              </span>
              <Badge variant={badgeVariant} size="sm" dot>
                {isHardClosed
                  ? "HARD_CLOSED"
                  : isWindowOpen
                    ? `Active · ${summary.window_status.days_remaining}d left`
                    : `Locked · Opens in ${summary.window_status.days_until_open}d`}
              </Badge>
              <span className="font-mono tabular-nums text-stone-700 font-semibold">
                {summary.checklist_summary.required_verified}/
                {summary.checklist_summary.required_total} Verified
              </span>
              <span aria-hidden="true" className="text-stone-300">
                ·
              </span>
              <span className="text-stone-500 font-mono">
                PRq {summary.hris_prq_status.prq_status}
              </span>
            </div>
          </div>
        </div>
        <Link
          to={targetUrl}
          className="h-8 px-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-stone-700 hover:text-stone-900 bg-white border border-stone-200/90 hover:border-stone-300 rounded-xl hover:bg-stone-50 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
        >
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Book Closing</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs transition-colors",
        className,
      )}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div
            className={cn(
              "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5",
              iconBoxClasses,
            )}
          >
            {isHardClosed ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : isWindowOpen ? (
              <CalendarClock className="w-4 h-4" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
          </div>
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-stone-900">
                {isHardClosed
                  ? `Period ${summary.period_key} Sealed`
                  : isWindowOpen
                    ? `Closing Window Active · ${summary.window_status.days_remaining}d left`
                    : `Closing Window Locked · Opens ${summary.window_status.next_window_label}`}
              </span>
              <Badge variant={badgeVariant} size="sm" dot>
                {summary.period_status}
              </Badge>
              <span className="text-stone-500 font-mono text-[11px]">
                PRq: <strong className="text-stone-800">{summary.hris_prq_status.prq_status}</strong>
                {" / "}
                PDV: <strong className="text-stone-800">{summary.hris_prq_status.payroll_status}</strong>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2.5 min-w-[220px] flex-1 max-w-md">
                <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      allSatisfied ? "bg-emerald-600" : "bg-amber-500",
                    )}
                    style={{ width: `${summary.checklist_summary.completion_pct}%` }}
                  />
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-stone-800 whitespace-nowrap">
                  {summary.checklist_summary.required_verified}/
                  {summary.checklist_summary.required_total} ({summary.checklist_summary.completion_pct}%)
                </span>
              </div>

              {!allSatisfied && summary.pending_items.length > 0 && (
                <p className="text-xs text-stone-500 truncate">
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-amber-600 align-text-bottom" />
                  Pending:{" "}
                  <span className="font-medium text-stone-800">
                    {summary.pending_items
                      .slice(0, 3)
                      .map((p) => p.title)
                      .join(" · ")}
                    {summary.pending_items.length > 3
                      ? ` (+${summary.pending_items.length - 3} more)`
                      : ""}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={targetUrl}
            className="h-9 px-3.5 inline-flex items-center gap-2 text-xs font-bold text-white bg-stone-900 hover:bg-stone-800 border border-stone-900 rounded-xl transition-colors whitespace-nowrap shrink-0 shadow-2xs"
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Open Book Closing</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ClosingReminderBanner;
