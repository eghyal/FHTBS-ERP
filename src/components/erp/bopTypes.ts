import {
  type BopProductRole,
  resolveBopProductRole,
  checkHasCycle,
} from "@/utils/bopGraph";

export { type BopProductRole, resolveBopProductRole, checkHasCycle };

export interface BopQcParameter {
  id: string;
  parameter_name: string;
  specification: string;
  measurement_method: string;
  is_mandatory_gate?: boolean;
  cycle_time_minutes?: number;
}

export interface BoPStepRow {
  id: string;
  step_sequence: number;
  process_name: string;
  node_type?: "PROCESS" | "PRODUCT";
  product_role?: BopProductRole | null;
  work_center_id?: string;
  work_center_name?: string;
  execution_type: "SERIAL" | "PARALLEL";
  shift_mode?: number;
  manpower_allocated?: number;
  standard_hours?: number;
  cycle_time_minutes?: number;
  assigned_machine_id?: string;
  alternative_machine_ids?: string[];
  setup_time_minutes?: number;
  teardown_time_minutes?: number;
  predecessor_ids: string[];
  sop_instruction?: string;
  qc_criteria?: string;
  qc_parameters?: BopQcParameter[];
  notes?: string;
  status?: string;
  progress?: number;
  bom_allocations?: {
    bom_id: string;
    fraction: number;
    qty?: number;
    uom?: string;
    bom_name?: string;
    priority_tier?: "AUTO" | "CRITICAL_MAIN" | "CORE_PROCESS" | "SUPPORTING";
    planned_wave_number?: number;
    planned_delivery_date?: string;
    production_need_date?: string;
    pr_number?: string;
    pr_status?: string;
    po_number?: string;
    po_status?: string;
    plan_code?: string;
    consuming_process_name?: string;
  }[];
  procurement_summary?: {
    plan_code?: string;
    wave_number?: number;
    target_arrival_date?: string;
    production_need_date?: string;
    pr_number?: string;
    pr_status?: string;
    po_number?: string;
    po_status?: string;
    consuming_process_name?: string;
  } | null;
  lifecycle_status?: string;
  expected_yield_rate?: number;
  station_id?: string;
  lot_size?: number;
  transfer_mode?: string;
}

export const calculateQcGateCycleTime = (
  params?: BopQcParameter[],
  fallbackCt?: number,
): number => {
  if (Array.isArray(params) && params.length > 0) {
    const sum = params.reduce(
      (acc, p) => acc + Math.max(0.5, Number(p?.cycle_time_minutes) || 5),
      0,
    );
    return Number(Math.max(0.5, sum).toFixed(1));
  }
  return Math.max(1, Number(fallbackCt) || 10);
};

export const isBopQcGateStep = (s: any): boolean => {
  if (!s) return false;
  const nodeType = String(s.node_type || "").toUpperCase();
  if (nodeType !== "PRODUCT") return false;
  const role = String(s.product_role || "").toUpperCase();
  if (role === "MATERIAL_INPUT") return false;
  if (role === "WIP_SUB_ASSY" || role === "FINISHED_GOOD") return true;
  let preds: string[] = [];
  try {
    preds =
      typeof s.predecessor_ids === "string"
        ? JSON.parse(s.predecessor_ids)
        : Array.isArray(s.predecessor_ids)
          ? s.predecessor_ids
          : [];
  } catch (_) {}
  if (preds.length > 0) return true;
  const parsedQc = parseLegacyQcCriteriaToParameters(
    s.qc_parameters || s.qc_parameters_json,
    s.qc_criteria,
  );
  return parsedQc.length > 0;
};

export const formatQcParametersSummary = (
  params?: BopQcParameter[],
  fallbackCriteria?: string,
): string => {
  if (Array.isArray(params) && params.length > 0) {
    return params
      .filter((p) => p && (p.parameter_name || p.specification))
      .map(
        (p) =>
          `${p.parameter_name || "Check"}: ${p.specification || "Spec"}${
            p.measurement_method ? ` [${p.measurement_method}]` : ""
          }${Number(p.cycle_time_minutes) > 0 ? ` (${p.cycle_time_minutes}m)` : ""}`,
      )
      .join("; ");
  }
  return String(fallbackCriteria || "").trim();
};

export const parseLegacyQcCriteriaToParameters = (
  rawParams?: any,
  fallbackCriteria?: string,
): BopQcParameter[] => {
  let list: any[] = [];
  if (Array.isArray(rawParams)) {
    list = rawParams;
  } else if (typeof rawParams === "string" && rawParams.trim()) {
    try {
      const p = JSON.parse(rawParams);
      if (Array.isArray(p)) list = p;
    } catch (_) {}
  }

  const cleaned = list
    .filter((x) => x && (x.parameter_name || x.specification))
    .map((x, idx) => ({
      id: String(x.id || `qcp_${Date.now()}_${idx}`),
      parameter_name: String(x.parameter_name || "Parameter").trim(),
      specification: String(x.specification || "").trim(),
      measurement_method: String(x.measurement_method || "Visual / Caliper").trim(),
      is_mandatory_gate: x.is_mandatory_gate !== false,
      cycle_time_minutes:
        Number(x.cycle_time_minutes) > 0 ? Number(x.cycle_time_minutes) : 5,
    }));

  if (cleaned.length > 0) return cleaned;

  const rawText = String(fallbackCriteria || "").trim();
  if (!rawText) return [];

  return rawText
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part, idx) => {
      const bracketMatch = part.match(/^(.*?)\s*\[([^\]]+)\]$/);
      const body = bracketMatch ? bracketMatch[1].trim() : part;
      const tool = bracketMatch ? bracketMatch[2].trim() : "Visual / Caliper";
      const colonIdx = body.indexOf(":");
      if (colonIdx > 0) {
        return {
          id: `qcp_init_${idx + 1}`,
          parameter_name: body.slice(0, colonIdx).trim(),
          specification: body.slice(colonIdx + 1).trim(),
          measurement_method: tool,
          is_mandatory_gate: true,
          cycle_time_minutes: 5,
        };
      }
      return {
        id: `qcp_init_${idx + 1}`,
        parameter_name: `Checkpoint #${idx + 1}`,
        specification: body,
        measurement_method: tool,
        is_mandatory_gate: true,
        cycle_time_minutes: 5,
      };
    });
};

export interface BopEngineeringEditorProps {
  projectId: string;
  project: any;
  onRefreshProject?: () => void;
  showPrintModal?: boolean;
  onPrintModalClose?: () => void;
  readOnly?: boolean;
}

export const PRESET_TEMPLATES: Record<
  string,
  {
    title: string;
    category: string;
    desc: string;
    steps: Partial<BoPStepRow & { temp_predecessor_indices?: number[] }>[];
  }
> = {
  noodle_demo: {
    title: "Fundamental Concept: Making Instant Noodles (Serial vs Parallel)",
    category: "Core Concepts",
    desc: "Real-world demonstration of Serial flow (must wait 100% for water to boil) and Parallel flow (preparing the bowl & seasoning concurrently without waiting).",
    steps: [
      {
        process_name: "Boil Water in Pot until Boiling",
        qc_criteria: "Water boiled completely (100°C)",
        temp_predecessor_indices: [],
      },
      {
        process_name: "Prepare a Clean Bowl",
        qc_criteria: "Bowl is dry & clean",
        temp_predecessor_indices: [],
      },
      {
        process_name: "Open Packaging & Pour Seasoning",
        qc_criteria: "Oil and dry seasoning spread evenly",
        temp_predecessor_indices: [1],
      },
      {
        process_name: "Chop Fresh Chili & Fried Shallots",
        qc_criteria: "Finely sliced and hygienic",
        temp_predecessor_indices: [],
      },
      {
        process_name: "Add Noodles to Boiling Water & Cook for 3 Mins",
        qc_criteria: "Optimal noodle texture (al dente)",
        temp_predecessor_indices: [0],
      },
      {
        process_name: "Drain & Mix Noodles in Seasoning Bowl",
        qc_criteria: "Thoroughly mixed noodles and toppings",
        temp_predecessor_indices: [2, 3, 4],
      },
      {
        process_name: "Stir Well & Serve Warm",
        qc_criteria: "Warm serving temperature & plated neatly",
        temp_predecessor_indices: [5],
      },
    ],
  },
  sheet_metal: {
    title: "Sheet Metal Fabrication & Enclosure",
    category: "Fabrication Industry",
    desc: "Parallel branches (Box Frame & Panel Components) converging into Assembly & Powder Coating.",
    steps: [
      {
        process_name: "Raw Material Prep & Sheet Shearing",
        qc_criteria: "Verify sheet thickness & grade",
        temp_predecessor_indices: [],
      },
      {
        process_name: "CNC Laser Cutting Enclosure Parts",
        qc_criteria: "Check cut edge squareness & piercing",
        temp_predecessor_indices: [0],
      },
      {
        process_name: "CNC Press Brake Bending (Box Body)",
        qc_criteria: "Flange angle 90° ± 0.5°",
        temp_predecessor_indices: [1],
      },
      {
        process_name: "Internal Bracket Stamping & Stud Welds",
        qc_criteria: "Stud pull torque check",
        temp_predecessor_indices: [0],
      },
      {
        process_name: "TIG Welded Assembly & Seam Grinding",
        qc_criteria: "Continuous seamless weld, no pinholes",
        temp_predecessor_indices: [2, 3],
      },
      {
        process_name: "Chemical Degreasing & Pre-treatment",
        qc_criteria: "Water-break free test",
        temp_predecessor_indices: [4],
      },
      {
        process_name: "Electrostatic Powder Coating (RAL 7035)",
        qc_criteria: "DFT 70-90 microns",
        temp_predecessor_indices: [5],
      },
      {
        process_name: "Final QC Audit & Crating",
        qc_criteria: "Full dimensional & aesthetic check",
        temp_predecessor_indices: [6],
      },
    ],
  },
  cnc_machining: {
    title: "Precision CNC Machining & Assembly",
    category: "Precision Machining",
    desc: "Parallel Machining (Lathe Shaft & Milling Base components) converging at Assembly & CMM Quality Control.",
    steps: [
      {
        process_name: "Billet Material Sawing & Facing",
        qc_criteria: "Material cert & size check",
        temp_predecessor_indices: [],
      },
      {
        process_name: "CNC 3-Axis / 5-Axis Base Milling",
        qc_criteria: "Flatness within 0.02mm",
        temp_predecessor_indices: [0],
      },
      {
        process_name: "CNC Precision Lathe Turning (Shaft)",
        qc_criteria: "Diameter tolerance h6",
        temp_predecessor_indices: [0],
      },
      {
        process_name: "Manual Deburring & Ultra Cleaning",
        qc_criteria: "Zero burrs under 10x magnification",
        temp_predecessor_indices: [1, 2],
      },
      {
        process_name: "CMM Coordinate Dimensional Inspection",
        qc_criteria: "GD&T inspection report passed",
        temp_predecessor_indices: [3],
      },
      {
        process_name: "VCI Anti-rust Vacuum Packaging",
        qc_criteria: "Desiccant packet included",
        temp_predecessor_indices: [4],
      },
    ],
  },
};

