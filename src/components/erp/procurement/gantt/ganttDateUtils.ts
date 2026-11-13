import type { WaveBottleneckMetric } from "../WaveBottleneckInsightPanel";
import type {
  CalendarDayTick,
  CalendarMonthSpan,
  CashflowSummaryData,
  EffectiveWaveDates,
  TimeScalePreset,
  WaveGanttRow,
} from "./ganttTypes";

export function addDays(iso: string, days: number): string {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function daysDiff(startIso: string, endIso: string): number {
  const s = new Date(`${String(startIso).slice(0, 10)}T00:00:00Z`);
  const e = new Date(`${String(endIso).slice(0, 10)}T00:00:00Z`);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatShortDate(iso?: string | null): string {
  if (!iso) return "—";
  const clean = String(iso).slice(0, 10);
  const parts = clean.split("-");
  if (parts.length !== 3) return clean;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mIdx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
  return `${parts[2]} ${months[mIdx]}`;
}

export function computeTimelineBounds(
  waves: WaveGanttRow[],
  getEffectiveWaveDates: (w: WaveGanttRow) => EffectiveWaveDates,
  todayIso: string,
  masterStartDate?: string | null,
  masterEndDate?: string | null,
) {
  const allDates: string[] = [
    todayIso,
    masterStartDate ? String(masterStartDate).slice(0, 10) : todayIso,
    masterEndDate ? String(masterEndDate).slice(0, 10) : todayIso,
  ];

  waves.forEach((w) => {
    const eff = getEffectiveWaveDates(w);
    if (eff.orderDate) allDates.push(eff.orderDate);
    if (eff.arrivalDate) allDates.push(eff.arrivalDate);
    if (w.production_need_date) allDates.push(w.production_need_date);
    const pEnd =
      w.process_end_date ||
      addDays(
        w.production_need_date || todayIso,
        Number(w.process_duration_days || 3),
      );
    allDates.push(pEnd);
    (w.items || []).forEach((it) => {
      const itemOrder = addDays(
        eff.arrivalDate || todayIso,
        -Number(it.lead_time_days || 4),
      );
      allDates.push(itemOrder);
      if (it.station_need_date) allDates.push(it.station_need_date);
    });
  });

  allDates.sort();

  const minDate = allDates[0] || todayIso;
  const maxDate = allDates[allDates.length - 1] || addDays(todayIso, 20);

  const timelineStartIso = addDays(minDate, -2);
  const timelineEndIso = addDays(
    maxDate,
    Math.max(3, 10 - daysDiff(minDate, maxDate)),
  );
  const totalSpanDays = Math.max(
    7,
    daysDiff(timelineStartIso, timelineEndIso),
  );

  return {
    timelineStartIso,
    timelineEndIso,
    totalSpanDays,
  };
}

export function computeMonthSpans(
  timelineStartIso: string,
  timelineEndIso: string,
  getPct: (isoDate?: string | null) => number,
): CalendarMonthSpan[] {
  const spans: CalendarMonthSpan[] = [];
  if (!timelineStartIso || !timelineEndIso) return spans;

  const start = new Date(`${timelineStartIso}T00:00:00Z`);
  const end = new Date(`${timelineEndIso}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return spans;

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const shortMonths = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  let currentYear = start.getUTCFullYear();
  let currentMonth = start.getUTCMonth();
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth();

  while (
    currentYear < endYear ||
    (currentYear === endYear && currentMonth <= endMonth)
  ) {
    const mStartDate = new Date(Date.UTC(currentYear, currentMonth, 1));
    const mEndDate = new Date(Date.UTC(currentYear, currentMonth + 1, 0));

    const mStartIso = mStartDate.toISOString().split("T")[0];
    const mEndIso = mEndDate.toISOString().split("T")[0];

    const boundedStartIso =
      mStartIso < timelineStartIso ? timelineStartIso : mStartIso;
    const boundedEndIso = mEndIso > timelineEndIso ? timelineEndIso : mEndIso;

    const startPct = getPct(boundedStartIso);
    const endPct = getPct(boundedEndIso);
    const widthPct = Math.max(0, endPct - startPct);

    if (widthPct > 0.4) {
      spans.push({
        label: `${months[currentMonth]} ${currentYear}`,
        shortLabel: `${shortMonths[currentMonth]} '${String(currentYear).slice(2)}`,
        startPct,
        widthPct,
      });
    }

    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }
  return spans;
}

export function computeStepDays(
  totalSpanDays: number,
  zoomLevel: number,
  timeScalePreset: TimeScalePreset,
): number {
  const estTrackWidth = 900 * (zoomLevel / 100);
  const maxComfortableTicks = Math.max(5, Math.floor(estTrackWidth / 42));
  const rawStep = Math.ceil(totalSpanDays / maxComfortableTicks);

  if (timeScalePreset === "DAY") {
    return Math.max(1, Math.min(2, rawStep));
  }
  if (timeScalePreset === "WEEK") {
    if (rawStep <= 2) return 2;
    if (rawStep <= 4) return 3;
    return 7;
  }
  // MONTH preset: cleaner macro intervals
  if (rawStep <= 3) return 5;
  if (rawStep <= 7) return 7;
  return 14;
}

export function computeDayTicks(
  totalSpanDays: number,
  stepDays: number,
  timelineStartIso: string,
  timelineEndIso: string,
): CalendarDayTick[] {
  const list: CalendarDayTick[] = [];
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (let d = 0; d <= totalSpanDays; d += stepDays) {
    const tickIso = addDays(timelineStartIso, d);
    if (tickIso > timelineEndIso) break;
    const dObj = new Date(`${tickIso}T00:00:00Z`);
    const dayOfWeek = dObj.getUTCDay();
    const parts = tickIso.split("-");
    const dayNum = parts[2] || "01";

    list.push({
      iso: tickIso,
      dayNum,
      weekday: weekdays[dayOfWeek] || "Mon",
      pct: (d / totalSpanDays) * 100,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    });
  }
  return list;
}

export function computeLiveBottleneckMetrics(
  waves: WaveGanttRow[],
  getEffectiveWaveDates: (w: WaveGanttRow) => EffectiveWaveDates,
  todayIso: string,
  leadTimeBufferDays: number,
): WaveBottleneckMetric[] {
  return waves.map((w) => {
    const eff = getEffectiveWaveDates(w);
    const orderDate = eff.orderDate;
    const arrivalDate = eff.arrivalDate;
    const prodNeedDate = w.production_need_date || arrivalDate;
    const actualDurationDays = Math.max(1, daysDiff(orderDate, arrivalDate));
    const maxLt = Math.max(Number(w.max_lead_time_days || 4), actualDurationDays);

    const feasibleOrder = orderDate < todayIso ? todayIso : orderDate;
    const effectiveArrival =
      orderDate < todayIso ? addDays(feasibleOrder, maxLt) : arrivalDate;

    const plannedSlack = daysDiff(arrivalDate, prodNeedDate);
    const feasibleSlack = daysDiff(effectiveArrival, prodNeedDate);
    const delayDays = Math.max(0, -feasibleSlack, -plannedSlack);

    const isBottleneck =
      effectiveArrival > prodNeedDate || arrivalDate > prodNeedDate;
    const severity: "CRITICAL" | "WARNING" | "OPTIMAL" = isBottleneck
      ? "CRITICAL"
      : orderDate < todayIso ||
          feasibleSlack < leadTimeBufferDays ||
          actualDurationDays < Number(w.max_lead_time_days || 4)
        ? "WARNING"
        : "OPTIMAL";

    let reason = "Procurement duration and handover window on schedule";
    if (isBottleneck) {
      reason = `Arrival ${delayDays}d past scheduled BOP process start`;
    } else if (actualDurationDays < Number(w.max_lead_time_days || 4)) {
      reason = `Procurement duration (${actualDurationDays}d) compressed below max item LT (${w.max_lead_time_days}d)`;
    } else if (orderDate < todayIso) {
      reason = `Order release date has passed; handover buffer compressed to ${feasibleSlack}d`;
    } else if (feasibleSlack < leadTimeBufferDays) {
      reason = `Tight handover gap (${feasibleSlack}d vs ${leadTimeBufferDays}d target buffer)`;
    }

    return {
      waveNumber: w.wave_number,
      stationFocus: w.station_focus,
      orderDate,
      arrivalDate,
      effectiveArrivalDate: effectiveArrival,
      bopStartDate: prodNeedDate,
      slackDays: isBottleneck ? -delayDays : Math.min(plannedSlack, feasibleSlack),
      isBottleneck,
      severity,
      reason,
      itemsCount: w.items?.length || 0,
    } as WaveBottleneckMetric;
  });
}

export function computeCashflowSummary(
  waves: WaveGanttRow[],
  getEffectiveWaveDates: (w: WaveGanttRow) => EffectiveWaveDates,
  getPct: (isoDate?: string | null) => number,
): CashflowSummaryData {
  const totalBudget = waves.reduce(
    (sum, w) => sum + Number(w.estimated_cost || 0),
    0,
  );
  let cumulative = 0;
  const waveOutlays = waves.map((w) => {
    const eff = getEffectiveWaveDates(w);
    const cost = Number(w.estimated_cost || 0);
    cumulative += cost;
    const sharePct = totalBudget > 0 ? Math.round((cost / totalBudget) * 100) : 0;
    const cumPct =
      totalBudget > 0 ? Math.round((cumulative / totalBudget) * 100) : 0;
    return {
      waveNumber: w.wave_number,
      stationFocus: w.station_focus,
      orderDate: eff.orderDate,
      arrivalDate: eff.arrivalDate,
      cost,
      cumulative,
      sharePct,
      cumPct,
      orderPct: getPct(eff.orderDate),
      arrivalPct: getPct(eff.arrivalDate),
    };
  });
  const peakWave = [...waveOutlays].sort((a, b) => b.cost - a.cost)[0] || null;
  return { totalBudget, waveOutlays, peakWave };
}
