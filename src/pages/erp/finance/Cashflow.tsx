import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { formatIDR } from "@/lib/utils";
import { RefreshCw, TrendingUp, Landmark, Flame, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";

interface ForecastWeek {
  week_label: string;
  inflows: number;
  outflows: number;
  net: number;
  projected_balance: number;
}

const formatWeekLabel = (label: string): string => {
  if (!label) return "";
  return label
    .replace(/Minggu Ini/gi, "Current Week")
    .replace(/Minggu Ke-(\d+)/gi, "Week $1")
    .replace(/Minggu (\d+)/gi, "Week $1");
};

export default function CashflowForecasting() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const fetchForecast = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(
        "/api/finance/cashflow-forecast",
        {},
        user?.username
      );
      if (res.ok && res.data) {
        setData(res.data);
      } else {
        showToast("Failed to load cash flow forecast", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Connection error", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, []);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <PageHeader
        title="Cash Flow & Treasury"
        subtitle="Liquidity & cash balance projections"
        icon={<TrendingUp className="w-5 h-5" />}
        actions={
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={fetchForecast}
            disabled={isLoading}
            title="Refresh Forecast"
            aria-label="Refresh Forecast"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        }
      />

      {/* Treasury & Liquidity KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Current Cash & Bank"
          value={formatIDR(data?.starting_cash || 0)}
          subtitle="Account 1101 starting liquidity"
          icon={<Landmark />}
          variant="emerald"
          isLoading={isLoading}
        />
        <StatCard
          label="Weekly Burn Rate"
          value={formatIDR(data?.burn_rate_weekly || 0)}
          subtitle="Avg PO & payroll obligations"
          icon={<Flame />}
          variant="amber"
          isLoading={isLoading}
        />
        <StatCard
          label="Cash Runway"
          value={data?.runway_weeks ? `${data.runway_weeks} Weeks` : "-"}
          subtitle="Estimated liquidity coverage"
          icon={<Clock />}
          variant="default"
          isLoading={isLoading}
        />
      </div>

      {/* 4-Week Rolling Forecast Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200">
          <h3 className="font-semibold text-stone-900 text-sm">
            Rolling 4-Week Cash Flow Projection
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Forecasted net position combining customer invoice due dates and vendor disbursement schedules.
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time Horizon</TableHead>
              <TableHead className="text-right">Projected Inflow (AR)</TableHead>
              <TableHead className="text-right">
                Projected Outflow (AP & Payroll)
              </TableHead>
              <TableHead className="text-right">Net Cash Flow</TableHead>
              <TableHead className="text-right">
                Projected Closing Balance
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!data?.forecast || data.forecast.length === 0) ? (
              <TableEmpty
                colSpan={5}
                message="No cash flow forecast projections available."
              />
            ) : (
              data.forecast.map((item: ForecastWeek, idx: number) => (
                <TableRow key={idx}>
                  <TableCell className="font-semibold text-stone-900">
                    {formatWeekLabel(item.week_label)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-emerald-700 tabular-nums">
                    +{formatIDR(item.inflows)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium text-rose-700 tabular-nums">
                    -{formatIDR(item.outflows)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono font-semibold tabular-nums ${
                      item.net >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {item.net >= 0 ? "+" : ""}
                    {formatIDR(item.net)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-stone-900 text-sm tabular-nums">
                    {formatIDR(item.projected_balance)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

