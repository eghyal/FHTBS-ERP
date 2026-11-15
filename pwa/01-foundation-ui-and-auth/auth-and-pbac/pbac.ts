import { User, Role, Level } from "../contexts/AuthContext.tsx";

export const Action = {
  // Accounts & Workflow Engine
  MANAGE_ACCOUNTS: "MANAGE_ACCOUNTS",
  VIEW_WORKFLOW_QUEUE: "VIEW_WORKFLOW_QUEUE",
  AUTH_TIER1_APPROVAL: "AUTH_TIER1_APPROVAL",

  // Engineering & BOM
  MANAGE_BOM: "MANAGE_BOM",
  CREATE_PR_ENGINEERING: "CREATE_PR_ENGINEERING",
  VIEW_BOM: "VIEW_BOM",
  VIEW_DESIGN_REQUESTS: "VIEW_DESIGN_REQUESTS",

  // PPIC (Production Planning & Inventory Control)
  PLAN_PRODUCTION_MRP: "PLAN_PRODUCTION_MRP",
  RELEASE_WORK_ORDER: "RELEASE_WORK_ORDER",
  AUTHORIZE_CAPACITY_PLAN: "AUTHORIZE_CAPACITY_PLAN",

  // Production
  CREATE_PR_PRODUCTION: "CREATE_PR_PRODUCTION",
  CONSUME_MATERIAL: "CONSUME_MATERIAL",
  VIEW_PRODUCTION_ACTION: "VIEW_PRODUCTION_ACTION",
  MANAGE_PRODUCTION_CONFIG: "MANAGE_PRODUCTION_CONFIG",
  VIEW_PRODUCTION: "VIEW_PRODUCTION",
  ACCEPT_PRODUCTION_BOP: "ACCEPT_PRODUCTION_BOP",

  // QA / QC (Quality Assurance & Quality Control)
  INSPECT_QC: "INSPECT_QC",
  APPROVE_QC_RELEASE: "APPROVE_QC_RELEASE",
  MANAGE_QC_STANDARDS: "MANAGE_QC_STANDARDS",

  // Procurement / Purchasing
  CREATE_PO: "CREATE_PO",
  MANAGE_VENDORS: "MANAGE_VENDORS",
  MANAGE_PRICING: "MANAGE_PRICING",
  AUTH_PR: "AUTH_PR",
  AUTH_PR_URGENT: "AUTH_PR_URGENT",
  VIEW_VENDORS: "VIEW_VENDORS",
  VIEW_PRICING: "VIEW_PRICING",
  VIEW_PROCUREMENT: "VIEW_PROCUREMENT",

  // Warehouse / Inventory
  RECEIVE_PO: "RECEIVE_PO",
  DISPATCH_GOODS: "DISPATCH_GOODS",
  VIEW_LOW_STOCK: "VIEW_LOW_STOCK",
  WAREHOUSE_ACTION: "WAREHOUSE_ACTION",
  CONFIGURE_MACHINE: "CONFIGURE_MACHINE",
  VIEW_WAREHOUSE: "VIEW_WAREHOUSE",

  // Sales & Deliveries
  MANAGE_CUSTOMERS: "MANAGE_CUSTOMERS",
  AUTH_DELIVERY: "AUTH_DELIVERY",
  SALES_ACTION: "SALES_ACTION",
  CREATE_DELIVERY: "CREATE_DELIVERY",
  VIEW_CUSTOMERS: "VIEW_CUSTOMERS",
  VIEW_DELIVERIES: "VIEW_DELIVERIES",
  VIEW_INVOICES: "VIEW_INVOICES",
  VIEW_QUOTATIONS: "VIEW_QUOTATIONS",
  MANAGE_INVOICES: "MANAGE_INVOICES",
  VIEW_MASTER_DATA: "VIEW_MASTER_DATA",
  VIEW_FINANCE: "VIEW_FINANCE",
  MANAGE_FINANCE: "MANAGE_FINANCE",
  CREATE_QUOTATION: "CREATE_QUOTATION",

  // Finance & Accounting Granular Actions
  POST_JOURNAL: "POST_JOURNAL",
  AUTH_PAYROLL: "AUTH_PAYROLL",
  AUTH_EXPENSE: "AUTH_EXPENSE",
  MANAGE_PAYABLES: "MANAGE_PAYABLES",
  CLOSE_PERIOD: "CLOSE_PERIOD",
} as const;

export type Action = keyof typeof Action;

interface PBACContext {
  resourceId?: string;
  projectStatus?: string;
  ownerId?: string;
  [key: string]: any;
}

export function getRolePolicies(): Record<Role, Action[]> {
  const allActions = Object.values(Action) as Action[];
  return {
    FC: allActions,
    ADMIN: allActions,
    SUPERADMIN: allActions,
    BOD: allActions,
    DIRECTOR: allActions,
    ENGINEERING: [
      Action.VIEW_BOM,
      Action.VIEW_WAREHOUSE,
      Action.CREATE_PR_ENGINEERING,
      // Supervisor & Manager tier actions:
      Action.MANAGE_BOM,
      Action.CONFIGURE_MACHINE,
      Action.AUTH_TIER1_APPROVAL,
      Action.VIEW_WORKFLOW_QUEUE,
      Action.AUTH_PR,
      // Manager-only tier actions:
      Action.AUTH_PR_URGENT,
      Action.VIEW_MASTER_DATA,
    ],
    PPIC: [
      Action.VIEW_DESIGN_REQUESTS,
      Action.CREATE_PR_ENGINEERING,
      Action.CREATE_PR_PRODUCTION,
      Action.VIEW_PRODUCTION,
      Action.VIEW_BOM,
      Action.VIEW_WAREHOUSE,
      Action.VIEW_LOW_STOCK,
      Action.VIEW_PROCUREMENT,
      Action.PLAN_PRODUCTION_MRP,
      // Supervisor & Manager tier actions:
      Action.RELEASE_WORK_ORDER,
      Action.MANAGE_PRODUCTION_CONFIG,
      Action.ACCEPT_PRODUCTION_BOP,
      Action.AUTH_TIER1_APPROVAL,
      Action.VIEW_WORKFLOW_QUEUE,
      Action.AUTH_PR,
      // Manager-only tier actions:
      Action.AUTHORIZE_CAPACITY_PLAN,
      Action.AUTH_PR_URGENT,
      Action.VIEW_MASTER_DATA,
    ],
    PURCHASING: [
      Action.CREATE_PO,
      Action.VIEW_LOW_STOCK,
      Action.VIEW_VENDORS,
      Action.VIEW_PRICING,
      Action.VIEW_PROCUREMENT,
      Action.VIEW_WAREHOUSE,
      // Supervisor & Manager tier actions:
      Action.MANAGE_PRICING,
      Action.AUTH_TIER1_APPROVAL,
      Action.VIEW_WORKFLOW_QUEUE,
      Action.AUTH_PR,
      // Manager-only tier actions:
      Action.MANAGE_VENDORS,
      Action.AUTH_PR_URGENT,
      Action.VIEW_MASTER_DATA,
    ],
    WAREHOUSE: [
      Action.RECEIVE_PO,
      Action.DISPATCH_GOODS,
      Action.VIEW_LOW_STOCK,
      Action.CREATE_DELIVERY,
      Action.CONSUME_MATERIAL,
      Action.VIEW_WAREHOUSE,
      Action.VIEW_DELIVERIES,
      // Supervisor & Manager tier actions:
      Action.WAREHOUSE_ACTION,
      Action.AUTH_TIER1_APPROVAL,
      Action.VIEW_WORKFLOW_QUEUE,
      Action.AUTH_PR,
      // Manager-only tier actions:
      Action.AUTH_DELIVERY,
      Action.VIEW_MASTER_DATA,
    ],
    QA_QC: [
      Action.INSPECT_QC,
      Action.RECEIVE_PO,
      Action.VIEW_PRODUCTION,
      Action.VIEW_WAREHOUSE,
      Action.VIEW_PROCUREMENT,
      Action.VIEW_BOM,
      Action.VIEW_DELIVERIES,
      // Supervisor & Manager tier actions:
      Action.APPROVE_QC_RELEASE,
      Action.ACCEPT_PRODUCTION_BOP,
      Action.AUTH_TIER1_APPROVAL,
      Action.VIEW_WORKFLOW_QUEUE,
      // Manager-only tier actions:
      Action.MANAGE_QC_STANDARDS,
      Action.VIEW_MASTER_DATA,
    ],
    PRODUCTION: [
      Action.CREATE_PR_PRODUCTION,
      Action.CONSUME_MATERIAL,
      Action.VIEW_PRODUCTION_ACTION,
      Action.VIEW_PRODUCTION,
      Action.VIEW_WAREHOUSE,
      // Supervisor & Manager tier actions:
      Action.MANAGE_PRODUCTION_CONFIG,
      Action.CONFIGURE_MACHINE,
      Action.ACCEPT_PRODUCTION_BOP,
      Action.AUTH_TIER1_APPROVAL,
      Action.VIEW_WORKFLOW_QUEUE,
      Action.AUTH_PR,
      // Manager-only tier actions:
      Action.AUTH_PR_URGENT,
    ],
    SALES: [
      Action.CREATE_DELIVERY,
      Action.VIEW_CUSTOMERS,
      Action.VIEW_DELIVERIES,
      Action.VIEW_INVOICES,
      Action.VIEW_QUOTATIONS,
      Action.CREATE_QUOTATION,
      Action.VIEW_WAREHOUSE,
      // Supervisor & Manager tier actions:
      Action.MANAGE_CUSTOMERS,
      Action.AUTH_DELIVERY,
      Action.AUTH_TIER1_APPROVAL,
      Action.VIEW_WORKFLOW_QUEUE,
      // Manager-only tier actions:
      Action.SALES_ACTION,
      Action.MANAGE_INVOICES,
      Action.VIEW_MASTER_DATA,
    ],
    FINANCE: [
      Action.VIEW_FINANCE,
      Action.VIEW_INVOICES,
      Action.VIEW_QUOTATIONS,
      Action.VIEW_DELIVERIES,
      Action.VIEW_CUSTOMERS,
      Action.VIEW_PROCUREMENT,
      Action.VIEW_VENDORS,
      Action.VIEW_PRICING,
      Action.VIEW_WAREHOUSE,
      Action.POST_JOURNAL,
      // Supervisor & Manager tier actions:
      Action.MANAGE_INVOICES,
      Action.MANAGE_PAYABLES,
      Action.AUTH_TIER1_APPROVAL,
      Action.VIEW_WORKFLOW_QUEUE,
      // Manager-only tier actions:
      Action.MANAGE_FINANCE,
      Action.AUTH_PAYROLL,
      Action.AUTH_EXPENSE,
      Action.CLOSE_PERIOD,
      Action.VIEW_MASTER_DATA,
    ],
    HR: [
      Action.VIEW_MASTER_DATA,
      Action.AUTH_TIER1_APPROVAL,
      Action.VIEW_WORKFLOW_QUEUE,
    ],
  };
}

export function hasGodMode(user: User | null | undefined): boolean {
  if (!user) return false;
  const roleUpper = (user.role || "").toString().trim().toUpperCase();
  return ["FC", "ADMIN", "SUPERADMIN", "BOD", "DIRECTOR", "GOD_MODE"].includes(roleUpper);
}

/**
 * Actions requiring at least SUPERVISOR or MANAGER level (blocked for STAFF).
 * STAFF can freely create and edit daily operational drafts, while SUPERVISOR & MANAGER authorize and release.
 */
export const ACTIONS_REQUIRING_SUPERVISOR_OR_MANAGER: Action[] = [
  Action.AUTH_TIER1_APPROVAL,
  Action.VIEW_WORKFLOW_QUEUE,
  Action.AUTH_PR,
  Action.AUTH_DELIVERY,
  Action.ACCEPT_PRODUCTION_BOP,
  Action.RELEASE_WORK_ORDER,
  Action.APPROVE_QC_RELEASE,
];

/**
 * Actions strictly requiring MANAGER level (blocked for both STAFF and SUPERVISOR).
 * Covers strategic Tier-2+ approvals, master vendor/contract control, and period close.
 */
export const ACTIONS_REQUIRING_MANAGER: Action[] = [
  Action.AUTH_PR_URGENT,
  Action.MANAGE_VENDORS,
  Action.SALES_ACTION,
  Action.MANAGE_FINANCE,
  Action.AUTH_PAYROLL,
  Action.AUTH_EXPENSE,
  Action.CLOSE_PERIOD,
  Action.MANAGE_QC_STANDARDS,
  Action.AUTHORIZE_CAPACITY_PLAN,
  Action.MANAGE_ACCOUNTS,
];

/**
 * Helper to compute the exact effective actions for any (role, level) combination.
 */
export function getEffectiveActionsForRoleAndLevel(
  role: Role | string,
  level: Level | string = "STAFF",
): Action[] {
  const roleUpper = (role || "").toString().trim().toUpperCase();
  if (["FC", "ADMIN", "SUPERADMIN", "BOD", "DIRECTOR"].includes(roleUpper)) {
    return Object.values(Action) as Action[];
  }
  const baseActions = getRolePolicies()[roleUpper as Role] || [];
  const normLevel = (level || "STAFF").toString().trim().toUpperCase();

  return baseActions.filter((act) => {
    if (ACTIONS_REQUIRING_MANAGER.includes(act)) {
      return normLevel === "MANAGER";
    }
    if (ACTIONS_REQUIRING_SUPERVISOR_OR_MANAGER.includes(act)) {
      return normLevel === "SUPERVISOR" || normLevel === "MANAGER";
    }
    return true;
  });
}

/**
 * Actions permitted in the Mobile Companion App ("Smart Mobile Micro-Actions"):
 * Includes all viewing actions plus quick managerial/supervisory approvals
 */
export const VIEW_ONLY_ACTIONS: Action[] = [
  Action.VIEW_BOM,
  Action.VIEW_DESIGN_REQUESTS,
  Action.VIEW_PRODUCTION,
  Action.VIEW_LOW_STOCK,
  Action.VIEW_VENDORS,
  Action.VIEW_PRICING,
  Action.VIEW_PROCUREMENT,
  Action.VIEW_WAREHOUSE,
  Action.VIEW_CUSTOMERS,
  Action.VIEW_DELIVERIES,
  Action.VIEW_INVOICES,
  Action.VIEW_QUOTATIONS,
  Action.VIEW_MASTER_DATA,
  Action.VIEW_FINANCE,
  Action.VIEW_WORKFLOW_QUEUE,
  // Smart Mobile Micro-Actions (1-Tap Approvals & Field Confirmations)
  Action.AUTH_TIER1_APPROVAL,
  Action.AUTH_PR,
  Action.AUTH_PR_URGENT,
  Action.AUTH_DELIVERY,
  Action.ACCEPT_PRODUCTION_BOP,
  Action.APPROVE_QC_RELEASE,
  Action.AUTH_EXPENSE,
];

export const FORCE_DESKTOP_SESSION_KEY = "erp_force_desktop_mode";

export function isExemptMobileInteractivePath(pathname: string): boolean {
  if (!pathname) return false;
  return (
    pathname === "/ess" ||
    pathname.startsWith("/ess/") ||
    pathname === "/forum" ||
    pathname.startsWith("/forum/") ||
    pathname === "/login" ||
    pathname === "/hr-login" ||
    pathname === "/" ||
    pathname === "/careers" ||
    pathname.startsWith("/careers/") ||
    pathname === "/shop" ||
    pathname.startsWith("/shop/")
  );
}

export interface DesktopRouteMeta {
  title: string;
  category: string;
  reason: string;
  desktopFeatures: string[];
}

export function getDesktopRequiredRouteMeta(pathname: string): DesktopRouteMeta | null {
  if (!pathname) return null;

  if (pathname === "/document-workspace") {
    return {
      title: "Document Studio",
      category: "Desktop Only",
      reason: "A4 print layouts and multi-page document editing require a desktop screen.",
      desktopFeatures: [
        "Real-time A4 print preview & layout editor",
        "Multi-column pricing tables & signature blocks",
        "PDF export & document numbering",
      ],
    };
  }
  if (
    pathname === "/engineering" ||
    pathname.startsWith("/engineering/bop") ||
    pathname.startsWith("/projects/") ||
    pathname.startsWith("/project/") ||
    pathname === "/requests" ||
    pathname === "/general-requests"
  ) {
    return {
      title: "Engineering & Project Studio",
      category: "Desktop Only",
      reason: "BOM trees, BOP routing, and project WOT tables require a desktop screen.",
      desktopFeatures: [
        "BOM hierarchy & material allocation",
        "BOP stage routing & machine hours",
        "Project WOT & engineering requisitions",
      ],
    };
  }
  if (pathname === "/pricing") {
    return {
      title: "Sourcing & Pricing Matrix",
      category: "Desktop Only",
      reason: "Multi-vendor price matrices and bulk BOM sync require a desktop screen.",
      desktopFeatures: [
        "Side-by-side vendor price comparison",
        "Bulk BOM material price sync",
        "Historical cost trend analysis",
      ],
    };
  }
  if (
    pathname === "/general-ledger" ||
    pathname === "/book-closing" ||
    pathname === "/ar-aging" ||
    pathname === "/cashflow-forecast" ||
    pathname === "/payroll" ||
    pathname === "/invoices" ||
    pathname === "/payables"
  ) {
    return {
      title: "Finance & Accounting Studio",
      category: "Desktop Only",
      reason: "General ledger journals, AR/AP spreadsheets, and payroll runs require a desktop screen.",
      desktopFeatures: [
        "General Ledger & journal entries",
        "AR/AP aging & invoice billing tables",
        "Cashflow forecasting & batch payroll",
      ],
    };
  }
  if (
    pathname === "/data-center" ||
    pathname === "/import" ||
    pathname === "/workflow" ||
    pathname === "/manage-accounts" ||
    pathname === "/cloud-migration" ||
    pathname === "/migration" ||
    pathname === "/logs" ||
    pathname === "/hr"
  ) {
    return {
      title: "Admin & Master Data Studio",
      category: "Desktop Only",
      reason: "Master data tables, HRIS admin, and access controls require a desktop workstation.",
      desktopFeatures: [
        "RBAC/PBAC access control & audit logs",
        "Master database import & cloud sync",
        "Full HRIS directory & payroll configuration",
      ],
    };
  }
  if (
    pathname === "/shop-management" ||
    pathname === "/potential-customers" ||
    pathname === "/production/manpower"
  ) {
    return {
      title: "Operations Configuration",
      category: "Desktop Only",
      reason: "Product catalogs, lead pipelines, and shift capacity tables require a desktop screen.",
      desktopFeatures: [
        "Retail catalog & pricing management",
        "Shopfloor shift & manpower scheduling",
        "Operational report exports",
      ],
    };
  }

  return null;
}

export function isDesktopHeavyWorkPath(pathname: string): boolean {
  return getDesktopRequiredRouteMeta(pathname) !== null;
}

export function isMobileReadOnlyActive(): boolean {
  if (typeof window === "undefined") return false;
  const isMobileViewport = window.innerWidth < 1024;
  if (!isMobileViewport) return false;

  try {
    const isForceDesktop =
      sessionStorage.getItem(FORCE_DESKTOP_SESSION_KEY) === "true";
    if (isForceDesktop) return false;
  } catch {
    // Ignore storage errors
  }

  const pathname = window.location.pathname || "";
  if (isExemptMobileInteractivePath(pathname)) {
    return false;
  }

  return true;
}

/**
 * Evaluates full desktop 3-Tier RBAC + PBAC permission without mobile read-only lock.
 * Enforces STAFF vs SUPERVISOR vs MANAGER hierarchy.
 */
export function hasDesktopPermission(
  user: User | null | undefined,
  action: Action,
  context?: PBACContext,
): boolean {
  if (!user) return false;

  // 1. Check God Mode overrides everything on Desktop
  if (hasGodMode(user)) {
    return true;
  }

  // 2. Base role permissions
  const rolePolicies = getRolePolicies();
  const allowedActions = rolePolicies[user.role] || [];
  if (!allowedActions.includes(action)) return false;

  const userLevel = (user.level || "STAFF").toString().trim().toUpperCase();

  // 3. Level-based 3-Tier PBAC restrictions
  if (ACTIONS_REQUIRING_MANAGER.includes(action) && userLevel !== "MANAGER") {
    return false;
  }

  if (
    ACTIONS_REQUIRING_SUPERVISOR_OR_MANAGER.includes(action) &&
    userLevel !== "SUPERVISOR" &&
    userLevel !== "MANAGER"
  ) {
    return false;
  }

  // 4. Optional contextual PBAC rules (e.g. only modify if project status is DRAFT)
  if (context) {
    if (
      action === Action.MANAGE_BOM &&
      context.projectStatus &&
      context.projectStatus !== "DRAFT" &&
      context.projectStatus !== "ACTIVE"
    ) {
      return false;
    }
  }

  return true;
}

export function hasPermission(
  user: User | null | undefined,
  action: Action,
  context?: PBACContext,
): boolean {
  if (!user) return false;

  if (isMobileReadOnlyActive()) {
    if (!VIEW_ONLY_ACTIONS.includes(action)) {
      return false;
    }
  }

  return hasDesktopPermission(user, action, context);
}

export interface RoleMonitoringProfile {
  role: Role;
  hubLabelId: string;
  hubLabelEn: string;
  titleId: string;
  titleEn: string;
  subtitleId: string;
  subtitleEn: string;
  staffFocusId: string;
  managerFocusId: string;
  mobileCapabilitiesId: string[];
  lockedCapabilitiesId: string[];
}

export function getRoleMonitoringProfile(role: Role): RoleMonitoringProfile {
  const profiles: Record<Role, RoleMonitoringProfile> = {
    FC: {
      role: "FC",
      hubLabelId: "Exec Hub",
      hubLabelEn: "Exec Hub",
      titleId: "Executive Hub",
      titleEn: "Executive Hub",
      subtitleId: "Cash flow, projects & PIN approvals",
      subtitleEn: "Cash flow, projects & PIN approvals",
      staffFocusId: "Live KPIs and project status.",
      managerFocusId: "PIN approvals, cash flow & project oversight.",
      mobileCapabilitiesId: [
        "PIN approvals (PR, PO, QTN, DN)",
        "Revenue, AR/AP & project tracking",
        "Messages & HR Portal",
      ],
      lockedCapabilitiesId: [
        "BOM/BOP & Document Studio",
        "Master data & RBAC admin",
      ],
    },
    SUPERADMIN: {
      role: "SUPERADMIN",
      hubLabelId: "SuperAdmin Hub",
      hubLabelEn: "SuperAdmin Hub",
      titleId: "SuperAdmin Hub",
      titleEn: "SuperAdmin Hub",
      subtitleId: "System governance, RBAC & SLA monitoring",
      subtitleEn: "System governance, RBAC & SLA monitoring",
      staffFocusId: "System health and security logs.",
      managerFocusId: "Full RBAC/PBAC, SLA escalation & PIN approvals.",
      mobileCapabilitiesId: [
        "PIN approvals & SLA overrides",
        "Cross-module KPI & audit monitoring",
        "Messages & HR Portal",
      ],
      lockedCapabilitiesId: [
        "BOM/BOP & Document Studio",
        "Master data & RBAC admin",
      ],
    },
    BOD: {
      role: "BOD",
      hubLabelId: "Board Hub",
      hubLabelEn: "Board Hub",
      titleId: "Board Hub",
      titleEn: "Board Hub",
      subtitleId: "Financials, margins & board approvals",
      subtitleEn: "Financials, margins & board approvals",
      staffFocusId: "Financial summary and project status.",
      managerFocusId: "Board approvals, revenue & margin oversight.",
      mobileCapabilitiesId: [
        "PIN document approvals",
        "Revenue, COGS & margin summary",
        "Messages & HR Portal",
      ],
      lockedCapabilitiesId: [
        "Sourcing matrix & Document Studio",
        "General ledger & journal entries",
      ],
    },
    DIRECTOR: {
      role: "DIRECTOR",
      hubLabelId: "Director Hub",
      hubLabelEn: "Director Hub",
      titleId: "Director Hub",
      titleEn: "Director Hub",
      subtitleId: "Projects, shopfloor & approvals",
      subtitleEn: "Projects, shopfloor & approvals",
      staffFocusId: "Cross-division project tracking.",
      managerFocusId: "PIN approvals & project risk monitoring.",
      mobileCapabilitiesId: [
        "PIN approvals (PR, PO, QTN, DN)",
        "Project deadlines & shopfloor load",
        "Messages & HR Portal",
      ],
      lockedCapabilitiesId: [
        "BOM/BOP cost editing",
        "Master data & machine setup",
      ],
    },
    ADMIN: {
      role: "ADMIN",
      hubLabelId: "Admin Hub",
      hubLabelEn: "Admin Hub",
      titleId: "Admin Hub",
      titleEn: "Admin Hub",
      subtitleId: "Document queues & module status",
      subtitleEn: "Document queues & module status",
      staffFocusId: "System and module status.",
      managerFocusId: "Document queues & PIN approvals.",
      mobileCapabilitiesId: [
        "PIN approvals & project status",
        "Stock, PO & quotation lookup",
        "Messages & HR Portal",
      ],
      lockedCapabilitiesId: [
        "RBAC account management",
        "Data import & workflow rules",
      ],
    },
    SALES: {
      role: "SALES",
      hubLabelId: "Sales Hub",
      hubLabelEn: "Sales Hub",
      titleId: "Sales Hub",
      titleEn: "Sales Hub",
      subtitleId: "Quotations, clients & deliveries",
      subtitleEn: "Quotations, clients & deliveries",
      staffFocusId: "Quotations, client contacts & deliveries.",
      managerFocusId: "Approve quotations & deliveries with Daily PIN.",
      mobileCapabilitiesId: [
        "Quotation & delivery PIN approval",
        "1-tap client call & email",
        "Delivery status tracking",
      ],
      lockedCapabilitiesId: [
        "Multi-item quotation editor",
        "Catalog & Document Studio",
      ],
    },
    ENGINEERING: {
      role: "ENGINEERING",
      hubLabelId: "Eng Hub",
      hubLabelEn: "Eng Hub",
      titleId: "Engineering Hub",
      titleEn: "Engineering Hub",
      subtitleId: "Projects, PR approvals & stock",
      subtitleEn: "Projects, PR approvals & stock",
      staffFocusId: "Project status and component stock.",
      managerFocusId: "Approve PRs with Daily PIN & track projects.",
      mobileCapabilitiesId: [
        "PR PIN approval & revision",
        "Project & component stock lookup",
        "Team Messages & HR Portal",
      ],
      lockedCapabilitiesId: [
        "BOM tree & BOP studio",
        "Cost & machine hour calculators",
      ],
    },
    PPIC: {
      role: "PPIC",
      hubLabelId: "PPIC Hub",
      hubLabelEn: "PPIC Hub",
      titleId: "PPIC & MRP Hub",
      titleEn: "PPIC & MRP Hub",
      subtitleId: "Master schedule, Work Order release & material readiness",
      subtitleEn: "Master schedule, Work Order release & material readiness",
      staffFocusId: "Material readiness and Work Order schedules.",
      managerFocusId: "Approve material PRs, release Work Orders & capacity plans.",
      mobileCapabilitiesId: [
        "Material PR Tier-1/Tier-2 approval",
        "Work Order & project readiness tracking",
        "Low-stock & bottleneck alerts",
      ],
      lockedCapabilitiesId: [
        "Master Gantt & MRP studio",
        "Multi-station BOP capacity planner",
      ],
    },
    PURCHASING: {
      role: "PURCHASING",
      hubLabelId: "Sourcing Hub",
      hubLabelEn: "Sourcing Hub",
      titleId: "Purchasing Hub",
      titleEn: "Purchasing Hub",
      subtitleId: "POs, PRs, restock alerts & vendors",
      subtitleEn: "POs, PRs, restock alerts & vendors",
      staffFocusId: "Active POs, low stock & vendor contacts.",
      managerFocusId: "Approve POs & PRs with Daily PIN.",
      mobileCapabilitiesId: [
        "PO & PR PIN approval",
        "Low-stock alerts & PO status",
        "1-tap supplier call & email",
      ],
      lockedCapabilitiesId: [
        "Sourcing price matrix",
        "Multi-line PO creation",
      ],
    },
    WAREHOUSE: {
      role: "WAREHOUSE",
      hubLabelId: "Inventory Hub",
      hubLabelEn: "Inventory Hub",
      titleId: "Warehouse Hub",
      titleEn: "Warehouse Hub",
      subtitleId: "SKU stock, alerts & deliveries",
      subtitleEn: "SKU stock, alerts & deliveries",
      staffFocusId: "SKU stock levels and delivery queue.",
      managerFocusId: "Stock alerts and delivery PIN approvals.",
      mobileCapabilitiesId: [
        "Instant SKU stock lookup",
        "Low-stock alerts & deliveries",
        "Delivery & PR PIN approval",
      ],
      lockedCapabilitiesId: [
        "Bulk stock adjustment & GRN entry",
        "Master SKU configuration",
      ],
    },
    QA_QC: {
      role: "QA_QC",
      hubLabelId: "QA/QC Hub",
      hubLabelEn: "QA/QC Hub",
      titleId: "Quality Control Hub",
      titleEn: "Quality Control Hub",
      subtitleId: "GRN inspections, WIP quality & NCR dispositions",
      subtitleEn: "GRN inspections, WIP quality & NCR dispositions",
      staffFocusId: "Incoming GRN QC queue and lot inspection status.",
      managerFocusId: "Approve QC releases, NCR dispositions & quality holds.",
      mobileCapabilitiesId: [
        "GRN & WOT quality status lookup",
        "1-tap QC release approval",
        "NCR & defect alert notifications",
      ],
      lockedCapabilitiesId: [
        "Master QC specification studio",
        "Detailed lab inspection forms",
      ],
    },
    PRODUCTION: {
      role: "PRODUCTION",
      hubLabelId: "Shopfloor Hub",
      hubLabelEn: "Shopfloor Hub",
      titleId: "Production Hub",
      titleEn: "Production Hub",
      subtitleId: "Active NTPs, WIP & deadline alerts",
      subtitleEn: "Active NTPs, WIP & deadline alerts",
      staffFocusId: "Active NTP schedules and WIP status.",
      managerFocusId: "Project deadlines and PR PIN approvals.",
      mobileCapabilitiesId: [
        "Active project & NTP progress",
        "Deadline risk alerts",
        "PR PIN approval & HR Portal",
      ],
      lockedCapabilitiesId: [
        "WOT lot setup & BOP handover",
        "Manpower & machine scheduling",
      ],
    },
    FINANCE: {
      role: "FINANCE",
      hubLabelId: "Finance Hub",
      hubLabelEn: "Finance Hub",
      titleId: "Finance Hub",
      titleEn: "Finance Hub",
      subtitleId: "Revenue, AR/AP & approvals",
      subtitleEn: "Revenue, AR/AP & approvals",
      staffFocusId: "Receivables, payables & cash summary.",
      managerFocusId: "Revenue, margin oversight & PIN approvals.",
      mobileCapabilitiesId: [
        "Net revenue, COGS & AR/AP summary",
        "PO & quotation inspection",
        "Manager PIN approvals & HR Portal",
      ],
      lockedCapabilitiesId: [
        "General ledger & journal entries",
        "AR aging & batch payroll tables",
      ],
    },
    HR: {
      role: "HR",
      hubLabelId: "HRIS Hub",
      hubLabelEn: "HRIS Hub",
      titleId: "HR Portal Hub",
      titleEn: "HR Portal Hub",
      subtitleId: "Attendance, leave approvals & payslips",
      subtitleEn: "Attendance, leave approvals & payslips",
      staffFocusId: "Daily attendance and leave balance.",
      managerFocusId: "Team leave approvals and attendance.",
      mobileCapabilitiesId: [
        "GPS clock-in/out & leave requests",
        "1-tap team leave approval",
        "Digital payslips & Messages",
      ],
      lockedCapabilitiesId: [
        "Master employee & contract database",
        "Payroll & KPI matrix configuration",
      ],
    },
  };

  return profiles[role] || profiles.SALES;
}

/**
 * Centralized Route-Level PBAC + RBAC Guard for Shortcut Buttons & Cross-Module Links.
 * Mirrors the exact ProtectedRoute matrix in App.tsx so users never see shortcut buttons
 * to routes where their role or permission level would be rejected.
 */
export function canAccessErpRoute(
  user: User | null | undefined,
  routePath: string
): boolean {
  if (!user) return false;
  if (hasGodMode(user)) return true;

  const cleanPath = routePath.split("?")[0].replace(/\/+$/, "") || "/";
  const userRole = String(user.role || "").toUpperCase();

  const checkRoleAndAction = (
    allowedRoles?: string[],
    requiredAction?: Action
  ): boolean => {
    if (allowedRoles && allowedRoles.length > 0) {
      if (!allowedRoles.includes(userRole)) return false;
    }
    if (requiredAction) {
      if (!hasPermission(user, requiredAction)) return false;
    }
    return true;
  };

  if (cleanPath === "/hr" || cleanPath.startsWith("/hr/")) {
    return userRole === "HR";
  }
  if (cleanPath === "/ppic" || cleanPath.startsWith("/ppic/projects") || cleanPath.startsWith("/ppic/setup-master") || cleanPath === "/ppic/material-allocations" || cleanPath === "/procurement-plan") {
    return checkRoleAndAction(["PPIC"], Action.PLAN_PRODUCTION_MRP);
  }
  if (cleanPath === "/production" || cleanPath === "/production/manpower" || cleanPath === "/shopfloor" || cleanPath.startsWith("/production/project")) {
    return checkRoleAndAction(["PRODUCTION"], Action.VIEW_PRODUCTION);
  }
  if (cleanPath === "/production/machines") {
    return checkRoleAndAction(["PRODUCTION", "ENGINEERING"], Action.VIEW_PRODUCTION);
  }
  if (cleanPath === "/qc/incoming-material" || cleanPath === "/qc/process-inspection") {
    return checkRoleAndAction(["QA_QC"], Action.INSPECT_QC);
  }
  if (cleanPath === "/engineering" || cleanPath.startsWith("/engineering/bop")) {
    return checkRoleAndAction(["ENGINEERING"], Action.VIEW_BOM);
  }
  if (cleanPath === "/procurement") {
    return checkRoleAndAction(["PURCHASING"], Action.VIEW_PROCUREMENT);
  }
  if (cleanPath === "/pricing") {
    return checkRoleAndAction(["PURCHASING"], Action.VIEW_PRICING);
  }
  if (cleanPath === "/vendors") {
    return checkRoleAndAction(["PURCHASING"], Action.VIEW_VENDORS);
  }
  if (cleanPath === "/warehouse") {
    return checkRoleAndAction(undefined, Action.VIEW_WAREHOUSE);
  }
  if (cleanPath === "/data-center" || cleanPath === "/import") {
    return checkRoleAndAction(undefined, Action.VIEW_MASTER_DATA);
  }
  if (cleanPath === "/quotations" || cleanPath === "/shop-management" || cleanPath === "/potential-customers") {
    return checkRoleAndAction(["SALES"], Action.VIEW_QUOTATIONS);
  }
  if (cleanPath === "/customers") {
    return checkRoleAndAction(["SALES"], Action.VIEW_CUSTOMERS);
  }
  if (cleanPath === "/deliveries") {
    return checkRoleAndAction(["SALES"], Action.VIEW_DELIVERIES);
  }
  if (cleanPath === "/invoices") {
    return checkRoleAndAction(["FINANCE"], Action.VIEW_INVOICES);
  }
  if (
    cleanPath === "/finance" ||
    cleanPath === "/general-ledger" ||
    cleanPath === "/payables" ||
    cleanPath === "/payroll" ||
    cleanPath === "/ar-aging" ||
    cleanPath === "/cashflow-forecast"
  ) {
    return checkRoleAndAction(["FINANCE"], Action.VIEW_FINANCE);
  }
  if (cleanPath === "/book-closing") {
    return checkRoleAndAction(["FINANCE", "HR", "WAREHOUSE", "FC", "BOD", "DIRECTOR"]);
  }

  return true;
}

