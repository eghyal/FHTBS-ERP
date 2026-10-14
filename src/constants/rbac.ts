export type ERPDepartmentRole =
  | "FC"
  | "HR"
  | "ENGINEERING"
  | "PURCHASING"
  | "WAREHOUSE"
  | "PRODUCTION"
  | "SALES";

export interface ERPDepartmentOption {
  value: ERPDepartmentRole;
  label: string;
  nameEn: string;
  badgeColor: string;
}

export const ERP_DEPARTMENT_OPTIONS: ERPDepartmentOption[] = [
  {
    value: "FC",
    label: "Full Control (FC)",
    nameEn: "Full Control (FC)",
    badgeColor: "bg-purple-50 border-purple-200 text-purple-700",
  },
  {
    value: "HR",
    label: "Human Resource (HR)",
    nameEn: "Human Resource (HR)",
    badgeColor: "bg-rose-50 border-rose-200 text-rose-700",
  },
  {
    value: "ENGINEERING",
    label: "Engineering",
    nameEn: "Engineering",
    badgeColor: "bg-indigo-50 border-indigo-200 text-indigo-700",
  },
  {
    value: "PURCHASING",
    label: "Purchasing",
    nameEn: "Purchasing",
    badgeColor: "bg-blue-50 border-blue-200 text-blue-700",
  },
  {
    value: "WAREHOUSE",
    label: "Warehouse",
    nameEn: "Warehouse",
    badgeColor: "bg-amber-50 border-amber-200 text-amber-700",
  },
  {
    value: "PRODUCTION",
    label: "Production",
    nameEn: "Production",
    badgeColor: "bg-emerald-50 border-emerald-200 text-emerald-700",
  },
  {
    value: "SALES",
    label: "Sales",
    nameEn: "Sales",
    badgeColor: "bg-sky-50 border-sky-200 text-sky-700",
  },
];

/**
  Normalizes any legacy department string or role code to one of the 7 official ERP RBAC Roles.
 */
export function normalizeDepartmentToRole(deptOrRole?: string): ERPDepartmentRole {
  if (!deptOrRole) return "FC";
  const upper = deptOrRole.trim().toUpperCase();

  if (upper === "FC" || upper.includes("FULL CONTROL") || upper.includes("FACTORY_CONTROLLER") || upper === "ADMIN" || upper === "MANAGEMENT" || upper === "BOD" || upper === "DIRECTOR") {
    return "FC";
  }
  if (upper === "HR" || upper.includes("HUMAN RESOURCE") || upper.includes("HRIS")) {
    return "HR";
  }
  if (upper === "ENGINEERING" || upper.includes("ENGINEER") || upper.includes("IT") || upper.includes("R&D") || upper.includes("QUALITY CONTROL")) {
    return "ENGINEERING";
  }
  if (upper === "PURCHASING" || upper.includes("PROCUREMENT") || upper.includes("PENGADAAN")) {
    return "PURCHASING";
  }
  if (upper === "WAREHOUSE" || upper.includes("GUDANG") || upper.includes("LOGISTIC") || upper.includes("INVENTORY")) {
    return "WAREHOUSE";
  }
  if (upper === "PRODUCTION" || upper.includes("PRODUKSI") || upper.includes("PLANT") || upper.includes("WORKSHOP") || upper.includes("MAINTENANCE") || upper.includes("OPERATIONS")) {
    return "PRODUCTION";
  }
  if (upper === "SALES" || upper.includes("COMMERCIAL") || upper.includes("FINANCE") || upper.includes("MARKETING")) {
    return "SALES";
  }

  return "FC";
}

/**
  Returns the official label for display in dropdowns & tables.
 */
export function getDepartmentLabel(deptOrRole?: string): string {
  const role = normalizeDepartmentToRole(deptOrRole);
  const opt = ERP_DEPARTMENT_OPTIONS.find((o) => o.value === role);
  return opt ? opt.label : "Full Control (FC)";
}

/**
  Checks if a user's role grants approval authority over a target department/role.
  FC / Admin has universal approval authority.
 */
export function canUserApproveDepartment(userRole?: string, targetDeptOrRole?: string): boolean {
  if (!userRole) return false;
  const userRoleNorm = normalizeDepartmentToRole(userRole);
  if (userRoleNorm === "FC") return true;

  const targetNorm = normalizeDepartmentToRole(targetDeptOrRole);
  return userRoleNorm === targetNorm;
}
