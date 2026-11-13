export type ERPDepartmentRole =
  | "FC"
  | "HR"
  | "ENGINEERING"
  | "PPIC"
  | "PURCHASING"
  | "WAREHOUSE"
  | "QA_QC"
  | "PRODUCTION"
  | "OPERATOR"
  | "SALES"
  | "FINANCE";

export type ERPLevel = "STAFF" | "SUPERVISOR" | "MANAGER";

export interface ERPDepartmentOption {
  value: ERPDepartmentRole;
  label: string;
  nameEn: string;
  badgeColor: string;
  description?: string;
}

export interface ERPLevelOption {
  value: ERPLevel;
  label: string;
  badgeColor: string;
  description: string;
}

export const ERP_LEVEL_OPTIONS: ERPLevelOption[] = [
  {
    value: "STAFF",
    label: "Staff (Operational Execution)",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-700",
    description: "Draft transaction entry, daily operations, and baseline record logging.",
  },
  {
    value: "SUPERVISOR",
    label: "Supervisor (Supervision & Tier-1 Approval)",
    badgeColor: "bg-amber-50 border-amber-200 text-amber-800",
    description: "Full operational execution, shift/technical control, verification & Tier-1 Approval (low-to-medium value).",
  },
  {
    value: "MANAGER",
    label: "Manager (Department Head & Tier-2+ Approval)",
    badgeColor: "bg-emerald-50 border-emerald-200 text-emerald-800",
    description: "Full departmental authorization, Tier-2+ Approval, master data governance & policy.",
  },
];

export const ERP_DEPARTMENT_OPTIONS: ERPDepartmentOption[] = [
  {
    value: "FC",
    label: "FC",
    nameEn: "FC",
    badgeColor: "bg-stone-900 border-stone-800 text-white",
    description: "God-mode system access, cross-departmental authority & final escalation target.",
  },
  {
    value: "SALES",
    label: "Sales & Commercial",
    nameEn: "Sales & Commercial",
    badgeColor: "bg-stone-100 border-stone-300 text-stone-800",
    description: "Customer quotations, commercial contracts, customer master & Delivery Orders (DO).",
  },
  {
    value: "ENGINEERING",
    label: "Engineering & R&D",
    nameEn: "Engineering & R&D",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-800",
    description: "Bill of Materials (BOM), Bill of Process (BOP), Smart SKU registration & technical specs.",
  },
  {
    value: "PPIC",
    label: "PPIC (Production Planning & Inventory Control)",
    nameEn: "PPIC (Planning & Material Control)",
    badgeColor: "bg-blue-50 border-blue-200 text-blue-800",
    description: "Plant capacity planning, Master Production Schedule (MPS/MRP), Work Orders (WO) & material allocation.",
  },
  {
    value: "PURCHASING",
    label: "Purchasing & Procurement",
    nameEn: "Purchasing & Procurement",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-700",
    description: "Vendor sourcing, price matrix governance, Purchase Requests (PR) & Purchase Orders (PO).",
  },
  {
    value: "WAREHOUSE",
    label: "Warehouse & Logistics",
    nameEn: "Warehouse & Logistics",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-700",
    description: "Goods Receipt Notes (GRN), physical storage, QR labels, stock transfers & dispatch.",
  },
  {
    value: "QA_QC",
    label: "QA / QC (Quality Assurance & Control)",
    nameEn: "QA / QC (Quality Assurance & Control)",
    badgeColor: "bg-purple-50 border-purple-200 text-purple-800",
    description: "Incoming goods inspection (GRN QC), in-process WIP QC, Finished Goods (FGR) & NCR disposition.",
  },
  {
    value: "PRODUCTION",
    label: "Production & Shopfloor (Back-Office / Supervisor)",
    nameEn: "Production & Shopfloor (Back-Office)",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-800",
    description: "Back-office production supervision, work centers, manpower planning, WOT control & NDP resolution.",
  },
  {
    value: "OPERATOR",
    label: "Operator Produksi (Shop Floor - Mobile Only)",
    nameEn: "Shop Floor Operator (Mobile Only)",
    badgeColor: "bg-amber-50 border-amber-200 text-amber-800",
    description: "Dedicated shop-floor machine operator. Syncs to ManPower & uses Android/iOS Mobile App for Message, ESS & 2-Way Shop Floor.",
  },
  {
    value: "FINANCE",
    label: "Finance & Accounting",
    nameEn: "Finance & Accounting",
    badgeColor: "bg-stone-100 border-stone-200 text-stone-800",
    description: "Commercial invoicing, AR/AP, General Ledger (GL), cash/bank, taxation & period closing.",
  },
  {
    value: "HR",
    label: "Human Resource (HRIS)",
    nameEn: "Human Resource (HR)",
    badgeColor: "bg-stone-100 border-stone-300 text-stone-800",
    description: "Personnel management, attendance, leave requests, KPI evaluation, contracts & payroll.",
  },
];

export const WORKFLOW_SIGNER_OPTIONS = [
  { value: "SUPERVISOR", label: "Department Supervisor (Tier 1)", group: "Generic Tier" },
  { value: "MANAGER", label: "Department Manager (Tier 2)", group: "Generic Tier" },
  { value: "SALES_SUPERVISOR", label: "Sales Supervisor", group: "Department Supervisor" },
  { value: "ENGINEERING_SUPERVISOR", label: "Engineering Supervisor", group: "Department Supervisor" },
  { value: "PPIC_SUPERVISOR", label: "PPIC Supervisor", group: "Department Supervisor" },
  { value: "PURCHASING_SUPERVISOR", label: "Purchasing Supervisor", group: "Department Supervisor" },
  { value: "WAREHOUSE_SUPERVISOR", label: "Warehouse Supervisor", group: "Department Supervisor" },
  { value: "QA_QC_SUPERVISOR", label: "QA/QC Supervisor", group: "Department Supervisor" },
  { value: "PRODUCTION_SUPERVISOR", label: "Production Supervisor", group: "Department Supervisor" },
  { value: "FINANCE_SUPERVISOR", label: "Finance Supervisor", group: "Department Supervisor" },
  { value: "HR_SUPERVISOR", label: "HR Supervisor", group: "Department Supervisor" },
  { value: "SALES_MANAGER", label: "Sales Manager", group: "Department Manager" },
  { value: "ENGINEERING_MANAGER", label: "Engineering Manager", group: "Department Manager" },
  { value: "PPIC_MANAGER", label: "PPIC Manager", group: "Department Manager" },
  { value: "PURCHASING_MANAGER", label: "Purchasing Manager", group: "Department Manager" },
  { value: "WAREHOUSE_MANAGER", label: "Warehouse Manager", group: "Department Manager" },
  { value: "QA_QC_MANAGER", label: "QA/QC Manager", group: "Department Manager" },
  { value: "PRODUCTION_MANAGER", label: "Production Manager", group: "Department Manager" },
  { value: "FINANCE_MANAGER", label: "Finance Manager", group: "Department Manager" },
  { value: "HR_MANAGER", label: "HR Manager", group: "Department Manager" },
  { value: "FC", label: "FC", group: "FC" },
];

/**
 * Normalizes any legacy department string or role code to one of the official ERP RBAC Roles.
 */
export function normalizeDepartmentToRole(deptOrRole?: string): ERPDepartmentRole {
  if (!deptOrRole) return "FC";
  const upper = deptOrRole.trim().toUpperCase();

  if (
    upper === "FC" ||
    upper.includes("FULL CONTROL") ||
    upper.includes("FACTORY_CONTROLLER") ||
    upper === "ADMIN" ||
    upper === "SUPERADMIN" ||
    upper === "MANAGEMENT" ||
    upper === "BOD" ||
    upper === "DIRECTOR"
  ) {
    return "FC";
  }
  if (upper === "OPERATOR" || upper.includes("OPERATOR PRODUKSI") || upper === "SHOPFLOOR_OPERATOR") {
    return "OPERATOR";
  }
  if (upper === "QA_QC" || upper === "QC_QA" || upper === "QC" || upper === "QA" || upper.includes("QUALITY")) {
    return "QA_QC";
  }
  if (upper === "PPIC" || upper.includes("PLANNING") || upper.includes("MRP")) {
    return "PPIC";
  }
  if (
    upper === "HR" ||
    upper === "GA_UMUM" ||
    upper === "GA" ||
    upper === "UMUM" ||
    upper === "GENERAL" ||
    upper.includes("HUMAN RESOURCE") ||
    upper.includes("HRIS") ||
    upper.includes("GENERAL AFFAIR")
  ) {
    return "HR";
  }
  if (
    upper === "ENGINEERING" ||
    upper === "RND_LAB" ||
    upper.includes("ENGINEER") ||
    upper.includes("IT") ||
    upper.includes("R&D") ||
    upper.includes("RND") ||
    upper.includes("LAB")
  ) {
    return "ENGINEERING";
  }
  if (upper === "PURCHASING" || upper.includes("PROCUREMENT") || upper.includes("PENGADAAN")) {
    return "PURCHASING";
  }
  if (upper === "WAREHOUSE" || upper.includes("GUDANG") || upper.includes("LOGISTIC") || upper.includes("INVENTORY")) {
    return "WAREHOUSE";
  }
  if (
    upper === "PRODUCTION" ||
    upper.includes("PRODUKSI") ||
    upper.includes("PLANT") ||
    upper.includes("WORKSHOP") ||
    upper.includes("MAINTENANCE") ||
    upper.includes("OPERATIONS")
  ) {
    return "PRODUCTION";
  }
  if (
    upper === "FINANCE" ||
    upper.includes("FINANCE") ||
    upper.includes("ACCOUNTING") ||
    upper.includes("KEUANGAN") ||
    upper.includes("PAYROLL") ||
    upper.includes("INVOICE")
  ) {
    return "FINANCE";
  }
  if (upper === "SALES" || upper.includes("COMMERCIAL") || upper.includes("MARKETING")) {
    return "SALES";
  }

  return "FC";
}

/**
 * Returns the official label for display in dropdowns & tables.
 */
export function getDepartmentLabel(deptOrRole?: string): string {
  const role = normalizeDepartmentToRole(deptOrRole);
  const opt = ERP_DEPARTMENT_OPTIONS.find((o) => o.value === role);
  return opt ? opt.label : "FC";
}

/**
 * Checks if a user's role grants approval authority over a target department/role.
 * FC has God-mode universal approval authority.
 * Also supports SUPERVISOR and MANAGER level checks.
 */
export function canUserApproveDepartment(
  userRole?: string,
  targetDeptOrRole?: string,
  userLevel?: string,
): boolean {
  if (!userRole) return false;
  const rawRole = userRole.trim().toUpperCase();
  if (["FC", "ADMIN", "SUPERADMIN", "DIRECTOR", "BOD", "GOD_MODE"].includes(rawRole)) {
    return true;
  }

  // If userLevel is explicitly provided and is STAFF, cannot approve departmental documents
  if (userLevel && userLevel.trim().toUpperCase() === "STAFF") {
    return false;
  }

  const userRoleNorm = normalizeDepartmentToRole(userRole);
  if (userRoleNorm === "FC") return true;

  const targetUpper = (targetDeptOrRole || "").trim().toUpperCase();
  // Check if target specifies MANAGER specifically while user is SUPERVISOR
  if (
    targetUpper.includes("MANAGER") ||
    targetUpper.includes("HEAD")
  ) {
    if (userLevel && userLevel.trim().toUpperCase() === "SUPERVISOR") {
      return false;
    }
  }

  const targetNorm = normalizeDepartmentToRole(targetDeptOrRole);
  return userRoleNorm === targetNorm;
}
