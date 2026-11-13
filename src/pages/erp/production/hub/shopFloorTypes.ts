export interface ProductionShopFloorProps {
  projectId: string;
  project: any;
  spkData: any;
  bom: any[];
  processSteps: any[];
  stations: any[];
  itemsCatalog: any[];
  wots: any[];
  activeNdps: any[];
  factoryFactor: number;
  onRefresh: (silent?: boolean) => void;
  onNavigateToSetup?: () => void;
  user: any;
}

export interface ScmReadinessItem {
  bom_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  required_qty: number;
  reserved_qty: number;
  supplied_to_floor_qty: number;
  effective_supplied_qty?: number;
  unsupplied_to_floor_qty?: number;
  available_in_warehouse_to_issue?: number;
  consumed_backflush_qty: number;
  remaining_wip_floor_qty: number;
  available_stock: number;
  shortage_to_floor_qty: number;
  bop_process_id?: string | null;
  bop_process_name?: string;
  bop_step_sequence?: number;
  engineering_concession_type?: string;
  substitute_item_id?: string | null;
  substitute_item_code?: string | null;
  substitute_item_name?: string | null;
  substitute_qty_supplied?: number;
  deferred_status?: string;
  concession_notes?: string | null;
  wave_coverage_pct?: number;
  raw_producible_units?: number;
  max_producible_units?: number;
  scm_stage: string;
  uom: string;
}

export interface ProcessProducibleQuota {
  bop_id: string;
  process_name: string;
  step_sequence: number;
  completed_qty: number;
  target_qty: number;
  max_producible_qty: number;
  remaining_producible_under_wave: number;
  is_pou_unlocked: boolean;
  wave_ceiling_active: boolean;
  pou_direct_items_count: number;
  blocking_items: any[];
  deferred_items: any[];
}

export interface ScmReadinessState {
  all_ready: boolean;
  all_supplied_to_floor: boolean;
  any_step_unlocked?: boolean;
  active_step_unlocked?: boolean;
  active_step_producible_ceiling?: number;
  project_producible_ceiling?: number;
  target_project_qty?: number;
  can_issue_from_warehouse: boolean;
  can_partial_wave_issue?: boolean;
  has_warehouse_shortage: boolean;
  total_bom_items: number;
  supplied_count: number;
  partial_supplied_count?: number;
  fgr_gate_ready?: boolean;
  open_deferred_fitments?: any[];
  process_producible_quotas?: Record<string, ProcessProducibleQuota>;
  items: ScmReadinessItem[];
}
