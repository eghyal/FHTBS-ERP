import React, { useMemo } from "react";
import {
  Users,
  Clock,
  CalendarDays,
  Briefcase,
  Award,
  Repeat,
  ArrowUpRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "motion/react";
import { formatRupiah } from "@/utils/format";

interface HrDashboardTabProps {
  users: any[];
  jobs: any[];
  applications: any[];
  kpis: any[];
  handovers: any[];
  attendances: any[];
  leaves: any[];
  salaries?: any[];
  payrollRequisitions?: any[];
  onNavigateTab: (tab: string) => void;
}

const STAGE_META: Record<
  string,
  { label: string; color: string; glassBg: string }
> = {
  APPLIED: {
    label: "Applied",
    color: "#646876",
    glassBg: "from-stone-400/70 to-stone-500/70",
  },
  INTERVIEW: {
    label: "Interview",
    color: "#F25730",
    glassBg: "from-[#F25730]/80 to-[#FF7852]/80",
  },
  OFFER_MADE: {
    label: "Offer Sent",
    color: "#F59E0B",
    glassBg: "from-amber-400/80 to-orange-500/80",
  },
  ACCEPTED: {
    label: "Onboarded",
    color: "#10B981",
    glassBg: "from-emerald-400/85 to-teal-500/85",
  },
};

export const HrDashboardTab: React.FC<HrDashboardTabProps> = React.memo(
  ({
    users,
    jobs,
    applications,
    kpis,
    handovers,
    attendances,
    leaves,
    salaries = [],
    onNavigateTab,
  }) => {
    const todayStr = useMemo(() => {
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date());
        const y = parts.find((p) => p.type === "year")?.value;
        const m = parts.find((p) => p.type === "month")?.value;
        const d = parts.find((p) => p.type === "day")?.value;
        return `${y}-${m}-${d}`;
      } catch {
        return new Date().toISOString().slice(0, 10);
      }
    }, []);

    const salaryMap = useMemo(() => {
      const m = new Map<string, any>();
      (salaries || []).forEach((s) => {
        if (s.employee_username) {
          m.set(String(s.employee_username).toLowerCase(), s);
        }
      });
      return m;
    }, [salaries]);

    const activeUsers = useMemo(
      () =>
        (users || []).filter(
          (u) => !u.status || u.status === "APPROVED" || u.status === "ACTIVE",
        ),
      [users],
    );

    const todayAttendances = useMemo(
      () => (attendances || []).filter((a) => a.date === todayStr),
      [attendances, todayStr],
    );

    const todayAttendanceMap = useMemo(() => {
      const m = new Map<string, any>();
      todayAttendances.forEach((a) => {
        if (a.employee_username) {
          m.set(String(a.employee_username).toLowerCase(), a);
        }
      });
      return m;
    }, [todayAttendances]);

    const attendanceRatePct = useMemo(() => {
      if (activeUsers.length === 0) return 0;
      const uniquePresent = todayAttendanceMap.size;
      return Math.min(
        100,
        Math.round((uniquePresent / activeUsers.length) * 100),
      );
    }, [todayAttendanceMap, activeUsers]);

    const activeLeavesToday = useMemo(() => {
      return (leaves || []).filter((lv) => {
        if (lv.status !== "APPROVED") return false;
        const start = String(lv.start_date || "").slice(0, 10);
        const end = String(lv.end_date || "").slice(0, 10);
        return start <= todayStr && end >= todayStr;
      });
    }, [leaves, todayStr]);

    const openJobsCount = useMemo(
      () => (jobs || []).filter((j) => j.status === "OPEN").length,
      [jobs],
    );

    const avgKpiScore = useMemo(() => {
      if (!kpis || kpis.length === 0) return "4.8";
      const sum = kpis.reduce(
        (acc, k) => acc + Number(k.overall_score || 0),
        0,
      );
      return (sum / kpis.length).toFixed(1);
    }, [kpis]);

    // 5-Dimension KPI Breakdown
    const kpiDimensions = useMemo(() => {
      if (!kpis || kpis.length === 0) {
        return [
          { label: "Comm", score: 4.8 },
          { label: "Output", score: 4.7 },
          { label: "Trust", score: 4.9 },
          { label: "Lead", score: 4.6 },
          { label: "Tech", score: 4.8 },
        ];
      }
      const n = kpis.length;
      const sum = kpis.reduce(
        (acc, k) => ({
          comm: acc.comm + Number(k.score_communication || 0),
          prod: acc.prod + Number(k.score_productivity || 0),
          rel: acc.rel + Number(k.score_reliability || 0),
          lead: acc.lead + Number(k.score_leadership || 0),
          tech: acc.tech + Number(k.score_technical || 0),
        }),
        { comm: 0, prod: 0, rel: 0, lead: 0, tech: 0 },
      );
      return [
        { label: "Comm", score: Number((sum.comm / n).toFixed(1)) },
        { label: "Output", score: Number((sum.prod / n).toFixed(1)) },
        { label: "Trust", score: Number((sum.rel / n).toFixed(1)) },
        { label: "Lead", score: Number((sum.lead / n).toFixed(1)) },
        { label: "Tech", score: Number((sum.tech / n).toFixed(1)) },
      ];
    }, [kpis]);

    // Division Headcount & Compensation Breakdown
    const departmentData = useMemo(() => {
      const map: Record<
        string,
        { name: string; count: number; totalSalary: number }
      > = {};
      activeUsers.forEach((u) => {
        const dept = u.role || "STAFF";
        if (!map[dept]) {
          map[dept] = { name: dept, count: 0, totalSalary: 0 };
        }
        map[dept].count += 1;
        const sal = salaryMap.get(String(u.username || "").toLowerCase());
        map[dept].totalSalary +=
          Number(sal?.basic_salary || 0) + Number(sal?.allowances || 0);
      });
      return Object.values(map)
        .sort((a, b) => b.count - a.count)
        .map((item) => ({
          ...item,
          sharePct:
            activeUsers.length > 0
              ? Math.round((item.count / activeUsers.length) * 100)
              : 0,
        }));
    }, [activeUsers, salaryMap]);

    const totalMonthlyPayrollBase = useMemo(() => {
      return departmentData.reduce((acc, d) => acc + d.totalSalary, 0);
    }, [departmentData]);

    const pipelineData = useMemo(() => {
      const stages = ["APPLIED", "INTERVIEW", "OFFER_MADE", "ACCEPTED"];
      return stages.map((stage) => {
        const count = (applications || []).filter(
          (a) => a.status === stage,
        ).length;
        const pct =
          applications.length > 0
            ? Math.round((count / applications.length) * 100)
            : 0;
        const meta = STAGE_META[stage];
        return {
          key: stage,
          label: meta.label,
          color: meta.color,
          glassBg: meta.glassBg,
          count,
          pct,
        };
      });
    }, [applications]);

    const kpiTrendData = useMemo(() => {
      if (!kpis || kpis.length === 0) {
        return [
          { period: "Q1", score: 4.2 },
          { period: "Q2", score: 4.4 },
          { period: "Q3", score: 4.6 },
          { period: "Q4", score: 4.8 },
        ];
      }
      const byPeriod: Record<string, { total: number; count: number }> = {};
      kpis.forEach((k) => {
        const p = k.period_name || "Current";
        if (!byPeriod[p]) byPeriod[p] = { total: 0, count: 0 };
        byPeriod[p].total += Number(k.overall_score || 0);
        byPeriod[p].count += 1;
      });
      return Object.entries(byPeriod).map(([period, val]) => ({
        period,
        score: Number((val.total / val.count).toFixed(2)),
      }));
    }, [kpis]);

    const pendingHandovers = useMemo(
      () => (handovers || []).filter((h) => h.status !== "COMPLETED").length,
      [handovers],
    );

    return (
      <div className="space-y-7">

        {/* ===================================================================
            ROW 2: 2 TRANSLUCENT GLASS VISUAL PANELS
            (Left: Division Composition 7 Cols | Right: 360° Performance Wave 5 Cols)
            =================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Division Composition (Layered Translucent Glass Bars) */}
          <div className="lg:col-span-7 hris-glass-panel p-6 sm:p-8 rounded-[32px] relative overflow-hidden flex flex-col justify-between space-y-6">
            <div className="absolute -left-16 -top-16 w-64 h-64 bg-gradient-to-br from-[#FF7852]/14 via-[#FF9E80]/12 to-amber-300/12 dark:from-[#FF5722]/32 dark:via-[#FF7852]/26 dark:to-amber-500/22 rounded-full blur-3xl pointer-events-none z-0" />

            <div className="relative z-10 flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <h3 className="text-xl sm:text-2xl tracking-[-0.03em] text-[#121318]">
                  <span className="font-light text-[#646876]">Team </span>
                  <span className="font-extrabold">Composition</span>
                </h3>
              </div>

              <div className="px-3.5 py-1.5 rounded-2xl bg-white/75 backdrop-blur-md border border-white text-xs font-bold text-[#121318] tabular-nums shadow-2xs">
                {formatRupiah(totalMonthlyPayrollBase)} / mo
              </div>
            </div>

            {/* Translucent Layered Glass Bar Stack */}
            <div className="relative z-10 space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {departmentData.length === 0 ? (
                <div className="py-12 text-center text-xs font-medium text-[#8E929F]">
                  No active divisions
                </div>
              ) : (
                departmentData.map((dept, i) => {
                  const barGradients = [
                    "from-[#F25730]/85 to-[#FF7852]/85",
                    "from-emerald-500/85 to-teal-400/85",
                    "from-sky-500/85 to-blue-400/85",
                    "from-amber-500/85 to-orange-400/85",
                  ];
                  const grad = barGradients[i % barGradients.length];

                  return (
                    <div
                      key={dept.name}
                      className="relative overflow-hidden p-4 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/90 shadow-[0_4px_16px_rgba(18,19,24,0.03)] flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold tracking-tight text-[#121318] text-sm">
                          {dept.name}
                        </span>
                        <div className="flex items-center gap-3 tabular-nums">
                          <span className="font-medium text-[#646876]">
                            {dept.totalSalary > 0
                              ? formatRupiah(dept.totalSalary)
                              : "—"}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-white/90 border border-white font-extrabold text-[#121318] shadow-2xs">
                            {dept.count} ({dept.sharePct}%)
                          </span>
                        </div>
                      </div>

                      {/* Glass Track + Translucent Inner Bar */}
                      <div className="w-full h-2.5 rounded-full bg-stone-200/50 overflow-hidden p-0.5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(6, dept.sharePct)}%` }}
                          transition={{ duration: 0.7, delay: i * 0.06 }}
                          className={`h-full rounded-full bg-gradient-to-r ${grad}`}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right 5 Cols: 360° Performance Wave (Translucent Glass Chart + 5 Tiles) */}
          <div className="lg:col-span-5 hris-glass-panel p-6 sm:p-8 rounded-[32px] relative overflow-hidden flex flex-col justify-between space-y-6">
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-gradient-to-bl from-emerald-400/18 via-teal-300/16 to-sky-300/14 dark:from-emerald-400/32 dark:via-teal-400/28 dark:to-cyan-400/22 rounded-full blur-3xl pointer-events-none z-0" />

            <div className="relative z-10 flex items-baseline justify-between gap-4">
              <h3 className="text-xl sm:text-2xl tracking-[-0.03em] text-[#121318]">
                <span className="font-light text-[#646876]">Performance </span>
                <span className="font-extrabold">Pulse</span>
              </h3>
              <span className="text-2xl font-extrabold tracking-[-0.04em] text-emerald-600 tabular-nums">
                {avgKpiScore}★
              </span>
            </div>

            {/* Translucent Glass Wave Chart */}
            <div className="relative z-10 h-44 w-full rounded-3xl bg-white/55 backdrop-blur-xl border border-white p-3 shadow-inner">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={kpiTrendData}
                  margin={{ top: 10, right: 12, left: -24, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="glassKpiWave" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="period"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#646876", fontWeight: 700 }}
                  />
                  <YAxis
                    domain={[0, 5]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#8E929F", fontWeight: 600 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.9)",
                      backdropFilter: "blur(16px)",
                      borderColor: "#FFFFFF",
                      borderRadius: "16px",
                      fontSize: "12px",
                      fontWeight: 700,
                      boxShadow: "0 12px 30px rgba(18,19,24,0.08)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    name="Score"
                    stroke="#10B981"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#glassKpiWave)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 5 Clean Frosted Glass Competency Tiles */}
            <div className="relative z-10 grid grid-cols-5 gap-2">
              {kpiDimensions.map((dim) => (
                <div
                  key={dim.label}
                  className="p-3 rounded-2xl bg-white/65 backdrop-blur-md border border-white text-center shadow-2xs"
                >
                  <span className="text-[10px] font-medium text-[#8E929F] block truncate">
                    {dim.label}
                  </span>
                  <span className="text-sm sm:text-base font-extrabold text-[#121318] tabular-nums mt-0.5 block">
                    {dim.score.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===================================================================
            ROW 3: HIRING FUNNEL (5 COLS) + ACTIVE TEAM ROSTER (7 COLS)
            =================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 5 Cols: Talent Funnel */}
          <div className="lg:col-span-5 hris-glass-panel p-6 sm:p-8 rounded-[32px] relative overflow-hidden flex flex-col justify-between space-y-6">
            <div className="absolute -right-12 -top-12 w-56 h-56 bg-gradient-to-bl from-amber-400/12 to-orange-400/10 dark:from-amber-500/22 dark:to-[#FF7852]/20 rounded-full blur-3xl pointer-events-none z-0" />
            <div className="flex items-center justify-between relative z-10">
              <h3 className="text-xl sm:text-2xl tracking-[-0.03em] text-[#121318]">
                <span className="font-light text-[#646876]">Talent </span>
                <span className="font-extrabold">Funnel</span>
              </h3>
              <button
                type="button"
                onClick={() => onNavigateTab("candidates")}
                className="px-3.5 py-1.5 rounded-full bg-white/80 hover:bg-white border border-white text-xs font-bold text-[#121318] shadow-2xs transition-all cursor-pointer"
              >
                {applications.length} Total
              </button>
            </div>

            <div className="space-y-3">
              {pipelineData.map((item) => (
                <div
                  key={item.key}
                  className="p-3.5 rounded-2xl bg-white/60 backdrop-blur-xl border border-white/90 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#32353E]">
                      {item.label}
                    </span>
                    <span className="font-extrabold text-[#121318] tabular-nums">
                      {item.count}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-stone-200/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${item.glassBg} transition-all duration-500`}
                      style={{
                        width:
                          item.count === 0 ? "0%" : `${Math.max(8, item.pct)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div
                onClick={() => onNavigateTab("vacancies")}
                className="p-4 rounded-2xl bg-white/70 hover:bg-white backdrop-blur-md border border-white flex items-center justify-between cursor-pointer transition-all shadow-2xs"
              >
                <span className="text-xs font-semibold text-[#646876] flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[#F25730]" />
                  <span>Open Roles</span>
                </span>
                <span className="text-lg font-extrabold text-[#121318] tabular-nums">
                  {openJobsCount}
                </span>
              </div>

              <div
                onClick={() => onNavigateTab("handover")}
                className="p-4 rounded-2xl bg-white/70 hover:bg-white backdrop-blur-md border border-white flex items-center justify-between cursor-pointer transition-all shadow-2xs"
              >
                <span className="text-xs font-semibold text-[#646876] flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-emerald-600" />
                  <span>Handovers</span>
                </span>
                <span className="text-lg font-extrabold text-[#121318] tabular-nums">
                  {pendingHandovers}
                </span>
              </div>
            </div>
          </div>

          {/* Right 7 Cols: Clean Frosted Glass Team Roster */}
          <div className="lg:col-span-7 hris-glass-panel p-6 sm:p-8 rounded-[32px] relative overflow-hidden flex flex-col justify-between space-y-5">
            <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-gradient-to-tr from-teal-400/12 to-emerald-300/10 dark:from-teal-400/22 dark:to-emerald-400/20 rounded-full blur-3xl pointer-events-none z-0" />
            <div className="flex items-center justify-between relative z-10">
              <h3 className="text-xl sm:text-2xl tracking-[-0.03em] text-[#121318]">
                <span className="font-light text-[#646876]">Active </span>
                <span className="font-extrabold">Roster</span>
              </h3>
              <button
                type="button"
                onClick={() => onNavigateTab("directory")}
                className="px-3.5 py-1.5 rounded-full bg-white/80 hover:bg-white border border-white text-xs font-bold text-[#121318] shadow-2xs transition-all cursor-pointer flex items-center gap-1"
              >
                <span>View All</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl bg-white/55 backdrop-blur-xl border border-white max-h-[340px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-white/85 backdrop-blur-md border-b border-stone-200/60 text-[11px] font-bold text-[#8E929F]">
                  <tr>
                    <th className="py-3.5 px-4">Member</th>
                    <th className="py-3.5 px-4">Division</th>
                    <th className="py-3.5 px-4 text-center">Shift</th>
                    <th className="py-3.5 px-4 text-right">Base Salary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200/40 text-[#121318]">
                  {activeUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-12 text-center text-[#8E929F] font-medium"
                      >
                        No team members registered.
                      </td>
                    </tr>
                  ) : (
                    activeUsers.slice(0, 7).map((emp) => {
                      const uKey = String(emp.username || "").toLowerCase();
                      const todayAtt = todayAttendanceMap.get(uKey);
                      const onLeaveToday = activeLeavesToday.some(
                        (lv) =>
                          String(lv.employee_username || "").toLowerCase() ===
                          uKey,
                      );
                      const sal = salaryMap.get(uKey);

                      return (
                        <tr
                          key={emp.id || emp.username}
                          className="hover:bg-white/70 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-white border border-stone-200/80 shadow-2xs flex items-center justify-center text-[11px] font-extrabold text-[#121318] shrink-0">
                                {String(emp.name || emp.username || "U")
                                  .substring(0, 2)
                                  .toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-[#121318] text-xs">
                                  {emp.name || emp.username}
                                </div>
                                <div className="text-[11px] text-[#8E929F]">
                                  @{emp.username}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className="px-2.5 py-1 bg-white/80 text-[#32353E] border border-white rounded-xl text-[11px] font-bold shadow-2xs">
                              {emp.role || "STAFF"}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-center">
                            {onLeaveToday ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50/90 text-amber-700 text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                Leave
                              </span>
                            ) : todayAtt ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50/90 text-emerald-700 text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {todayAtt.clock_out ? "Done" : "Active"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-100/80 text-[#8E929F] text-[11px] font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-stone-300" />
                                Offline
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right font-bold tabular-nums text-[#121318]">
                            {sal?.basic_salary
                              ? formatRupiah(sal.basic_salary)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
