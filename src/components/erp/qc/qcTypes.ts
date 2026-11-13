export type LedgerMode = "MEASUREMENTS" | "NCR_CAPA";

export interface BopStepQcItem {
  id: string;
  project_id: string;
  step_sequence: number;
  process_name: string;
  station_id: string;
  station_name: string;
  cycle_time_minutes: number;
  status: string;
  completed_qty: number;
  target_qty: number;
  rework_qty: number;
  qc_hold_qty: number;
  qc_criteria_text: string;
  sop_instruction_text: string;
  inspections_count: number;
  fai_approved: boolean;
  fai_inspector?: string | null;
  latest_disposition: string | null;
  open_ncr_count: number;
}

export interface QcProjectItem {
  id: string;
  name: string;
  spk_number: string;
  customer_name: string;
  qty: number;
  lot_size: number;
  uom: string;
  status: string;
  bop_status: string;
  is_master_set: boolean;
  due_date: string;
  fgr_number: string | null;
  bop_steps: BopStepQcItem[];
  wots: any[];
  open_ncr_count: number;
  fai_completed_count: number;
  total_bop_steps: number;
}

export interface QcProcessSummary {
  active_mfg_projects_count: number;
  total_bop_steps_count: number;
  fai_approved_bop_count: number;
  total_inspections_count: number;
  overall_fpy_pct: number;
  open_ncr_count: number;
  total_ncr_count: number;
  total_copq: number;
}

export interface BopInspectFormState {
  inspection_type: string;
  wot_id: string;
  parameter_name: string;
  nominal_spec: string;
  tolerance_spec: string;
  measured_value: string;
  sample_size: string;
  passed_qty: string;
  defect_qty: string;
  disposition: string;
  notes: string;
}

export interface NcrFormState {
  project_id: string;
  bop_step_id: string;
  station_id: string;
  station_name: string;
  wot_id: string;
  defect_category: string;
  severity: string;
  defect_qty: string;
  disposition_action: string;
  root_cause: string;
  corrective_action: string;
  cost_of_poor_quality: string;
}
