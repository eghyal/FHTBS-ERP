import type { WaveBottleneckMetric } from "../WaveBottleneckInsightPanel";
import type { ManufacturingStrategyMode } from "../ProcurementPlanWorkspace";

export interface WaveGanttItem {
  id: string;
  item_code: string;
  item_name: string;
  uom: string;
  allocated_wave_qty: number;
  unit_price: number;
  subtotal_cost: number;
  lead_time_days: number;
  station_code: string;
  station_need_date: string;
  process_step_name: string;
  product_node_name?: string;
  priority_tier?: string;
  preferred_supplier_name?: string;
}

export interface WaveGanttRow {
  id: string;
  wave_number: number;
  station_focus: string;
  bop_process_summary: string;
  target_order_date: string;
  target_arrival_date: string;
  feasible_arrival_date?: string;
  production_need_date: string;
  process_end_date?: string;
  max_lead_time_days: number;
  process_duration_days?: number;
  wot_lot_range?: string;
  total_qty_units: number;
  estimated_cost: number;
  status?: string;
  items: WaveGanttItem[];
}

export type TimeScalePreset = "DAY" | "WEEK" | "MONTH";

export interface WaveScheduleEntry {
  waveNumber: number;
  orderDate: string;
  arrivalDate: string;
}

export interface WaveScheduleSnapshot {
  timestamp: number;
  label: string;
  entries: WaveScheduleEntry[];
}

export interface CalendarMonthSpan {
  label: string;
  shortLabel: string;
  startPct: number;
  widthPct: number;
}

export interface CalendarDayTick {
  iso: string;
  dayNum: string;
  weekday: string;
  pct: number;
  isWeekend: boolean;
}

export interface WaveOutlayItem {
  waveNumber: number;
  stationFocus: string;
  orderDate: string;
  arrivalDate: string;
  cost: number;
  cumulative: number;
  sharePct: number;
  cumPct: number;
  orderPct: number;
  arrivalPct: number;
}

export interface CashflowSummaryData {
  totalBudget: number;
  waveOutlays: WaveOutlayItem[];
  peakWave: WaveOutlayItem | null;
}

export interface EffectiveWaveDates {
  orderDate: string;
  arrivalDate: string;
  isDragging: boolean;
}

export interface WaveDragState {
  waveNumber: number;
  batchWaveNumbers: number[];
  mode: "MOVE" | "RESIZE_LEFT" | "RESIZE_RIGHT";
  initialClientX: number;
  deltaDays: number;
  initialWavesMap: Record<
    number,
    { orderDate: string; arrivalDate: string; prodNeedDate: string }
  >;
  currentOrderDate: string;
  currentArrivalDate: string;
}

export interface InteractiveWaveGanttCanvasProps {
  waves: WaveGanttRow[];
  projectName?: string;
  spkNumber?: string | null;
  planCode?: string | null;
  masterStartDate?: string | null;
  masterEndDate?: string | null;
  earliestFeasibleStart?: string | null;
  isLocked?: boolean;
  onActivateStrategyPlanning?: () => void;
  onWaveDateChange: (
    waveNumber: number,
    newOrderDate: string,
    newArrivalDate: string,
  ) => void;
  onBatchWaveDateChange?: (
    updates: {
      waveNumber: number;
      newOrderDate: string;
      newArrivalDate: string;
    }[],
  ) => void;
  onLiveBottleneckMetricsUpdate?: (metrics: WaveBottleneckMetric[]) => void;
  selectedWaveNumbers?: number[];
  onSelectedWavesChange?: (waveNumbers: number[]) => void;
  strategyMode?: ManufacturingStrategyMode;
  onStrategyModeChange?: (mode: ManufacturingStrategyMode) => void;
  wotLotsPerWave?: number;
  totalWotLots?: number;
  onWotLotsPerWaveChange?: (lots: number) => void;
  leadTimeBufferDays?: number;
  onLeadTimeBufferDaysChange?: (days: number) => void;
  vendorSlipSimDays?: number;
  onApplyVendorSlipSimulation?: (days: number) => void;
  onAutoRealignSchedule?: () => void;
  onResetDatesToBaseline?: () => void;
  activeSavedPlanId?: string | null;
  isSaving?: boolean;
  onSavePlan?: () => void;
  submitStrategyLabel?: string;
  isSyncingMasterDates?: boolean;
  onSyncWaveDatesToMaster?: (planId: string) => void;
  isPushingAllPr?: boolean;
  onPushAllWavesToPr?: (planId: string) => void;
}
