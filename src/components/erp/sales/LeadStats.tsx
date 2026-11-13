import React from "react";
import { Users, Award, TrendingUp, ShoppingBag, ShieldCheck } from "lucide-react";
import { StatsSummary } from "@/types/scout";
import { formatIDR } from "@/lib/utils";
import { StatCard } from "@/components/ui/StatCard";

interface PotentialCustomersStatsProps {
  stats: StatsSummary;
}

export function PotentialCustomersStats({ stats }: PotentialCustomersStatsProps) {
  const conversionRate =
    stats.total_leads > 0
      ? Math.round((stats.converted_count / stats.total_leads) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
      <StatCard
        title="Total Leads"
        value={stats.total_leads.toLocaleString()}
        subtitle={`${stats.scouted_count} profiled`}
        icon={Users}
        color="stone"
      />
      <StatCard
        title="Grade A (High)"
        value={stats.grade_a_count}
        subtitle="Immediate closing priority"
        icon={Award}
        color="stone"
      />
      <StatCard
        title="Grade B (Medium)"
        value={stats.grade_b_count}
        subtitle="Nurturing pipeline"
        icon={TrendingUp}
        color="stone"
      />
      <StatCard
        title="Pipeline Value"
        value={formatIDR(stats.total_cart_pipeline_value)}
        subtitle="Active cart intent"
        icon={ShoppingBag}
        color="stone"
      />
      <StatCard
        title="Conversions"
        value={stats.converted_count}
        subtitle={`${conversionRate}% Rate · ${stats.consented_count} consented`}
        icon={ShieldCheck}
        color="stone"
        className="col-span-2 lg:col-span-1"
      />
    </div>
  );
}

