import { Action, hasPermission, hasGodMode } from "@/utils/pbac";

export interface NavItemConfig {
  name: string;
  path: string;
  action?: Action;
  roles?: string[];
  badge?: string;
  fcOnly?: boolean;
}

export interface NavGroupConfig {
  group: string;
  /**
   * If specified, only users whose department role is in `allowedRoles` (or GodMode/Executive roles)
   * can see this navigation group. This enforces strict private department workspaces.
   */
  allowedRoles?: string[];
  items: NavItemConfig[];
}

export interface FilteredNavItem extends NavItemConfig {
  translatedName: string;
}

export interface FilteredNavGroup {
  group: string;
  translatedGroup: string;
  items: FilteredNavItem[];
}

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    group: "Sales & Business",
    allowedRoles: ["SALES"],
    items: [
      {
        name: "Potential Customers",
        path: "/potential-customers",
        roles: ["SALES", "FC", "ADMIN", "GOD_MODE"],
        badge: "AI Scout",
      },
      {
        name: "Customer Profiles",
        path: "/customers",
        action: Action.VIEW_CUSTOMERS,
      },
      {
        name: "Quotations & NTP",
        path: "/quotations",
        action: Action.VIEW_QUOTATIONS,
      },
      {
        name: "Delivery Manifests",
        path: "/deliveries",
        action: Action.VIEW_DELIVERIES,
      },
      {
        name: "Shop Management",
        path: "/shop-management",
        roles: ["SALES", "FC", "ADMIN", "GOD_MODE"],
        badge: "B2C",
      },
    ],
  },
  {
    group: "Engineering",
    allowedRoles: ["ENGINEERING"],
    items: [
      {
        name: "Bill of Materials",
        path: "/engineering",
        action: Action.VIEW_BOM,
      },
      {
        name: "Bill of Process",
        path: "/engineering/bop",
        action: Action.VIEW_BOM,
      },
    ],
  },
  {
    group: "PPIC",
    allowedRoles: ["PPIC"],
    items: [
      {
        name: "PPIC Planning Hub",
        path: "/ppic",
        action: Action.PLAN_PRODUCTION_MRP,
      },
      {
        name: "Design Requests",
        path: "/requests",
        action: Action.VIEW_DESIGN_REQUESTS,
      },
      {
        name: "Material Allocations",
        path: "/ppic/material-allocations",
        action: Action.PLAN_PRODUCTION_MRP,
      },
      {
        name: "Procurement Plan",
        path: "/procurement-plan",
        action: Action.PLAN_PRODUCTION_MRP,
      },
    ],
  },
  {
    group: "Procurement",
    allowedRoles: ["PURCHASING"],
    items: [
      {
        name: "Supplier Profiles",
        path: "/vendors",
        action: Action.VIEW_VENDORS,
      },
      {
        name: "Sourcing & Pricing",
        path: "/pricing",
        action: Action.VIEW_PRICING,
      },
      {
        name: "Purchase Orders",
        path: "/procurement",
        action: Action.VIEW_PROCUREMENT,
      },
    ],
  },
  {
    group: "Manufacturing",
    allowedRoles: ["PRODUCTION"],
    items: [
      {
        name: "Manpower Roster",
        path: "/production/manpower",
        action: Action.VIEW_PRODUCTION,
      },
      {
        name: "Machine Fleet",
        path: "/production/machines",
        action: Action.VIEW_PRODUCTION,
      },
      {
        name: "Shop Floor Execution",
        path: "/production",
        action: Action.VIEW_PRODUCTION,
      },
      {
        name: "Floor Terminal",
        path: "/shopfloor",
        action: Action.VIEW_PRODUCTION,
      },
    ],
  },
  {
    group: "Quality Control",
    allowedRoles: ["QA_QC"],
    items: [
      {
        name: "Incoming Material",
        path: "/qc/incoming-material",
        action: Action.INSPECT_QC,
      },
      {
        name: "Process Quality Control",
        path: "/qc/process-inspection",
        action: Action.INSPECT_QC,
      },
    ],
  },
  {
    group: "Warehouse",
    allowedRoles: [
      "WAREHOUSE",
      "PPIC",
      "ENGINEERING",
      "PURCHASING",
      "PRODUCTION",
      "SALES",
      "QA_QC",
      "FINANCE",
    ],
    items: [
      {
        name: "Warehouse Inventory",
        path: "/warehouse",
        action: Action.VIEW_WAREHOUSE,
      },
    ],
  },
  {
    group: "Finance",
    allowedRoles: ["FINANCE"],
    items: [
      {
        name: "Financial Overview",
        path: "/finance",
        action: Action.VIEW_FINANCE,
      },
      {
        name: "Accounts Receivable",
        path: "/invoices",
        action: Action.VIEW_INVOICES,
      },
      {
        name: "AR Aging & Dunning",
        path: "/ar-aging",
        action: Action.VIEW_FINANCE,
      },
      {
        name: "Accounts Payable",
        path: "/payables",
        action: Action.VIEW_FINANCE,
      },
      { name: "Payroll", path: "/payroll", action: Action.VIEW_FINANCE },
      {
        name: "General Ledger",
        path: "/general-ledger",
        action: Action.VIEW_FINANCE,
      },
      {
        name: "Book Closing",
        path: "/book-closing",
        action: Action.VIEW_FINANCE,
      },
      {
        name: "Cash Flow Forecasting",
        path: "/cashflow-forecast",
        action: Action.VIEW_FINANCE,
      },
    ],
  },
  {
    group: "General",
    items: [
      {
        name: "General Request",
        path: "/general-requests",
      },
      {
        name: "Document Workspace",
        path: "/document-workspace",
      },
    ],
  },
  {
    group: "Human Resources",
    items: [
      { name: "Staff Self Service", path: "/ess" },
      {
        name: "HRIS Portal",
        path: "/hr",
        roles: ["HR", "FC", "ADMIN", "SUPERADMIN", "BOD", "DIRECTOR", "GOD_MODE"],
      },
    ],
  },
  {
    group: "System & Master Data",
    items: [
      {
        name: "Master Data Hub",
        path: "/data-center",
        roles: ["FC", "ADMIN", "SUPERADMIN", "BOD", "DIRECTOR", "GOD_MODE"],
      },
      {
        name: "Access Control",
        path: "/manage-accounts",
        action: Action.MANAGE_ACCOUNTS,
      },
      {
        name: "Workflow & Automation",
        path: "/workflow",
        action: Action.VIEW_WORKFLOW_QUEUE,
      },
      {
        name: "Public Web CMS",
        path: "/cms-public",
        roles: ["FC", "ADMIN", "SALES", "HR", "GOD_MODE"],
        badge: "CMS",
      },
      {
        name: "Cloud Migration & Sync",
        path: "/cloud-migration",
        fcOnly: true,
      },
      { name: "System Logs", path: "/logs", fcOnly: true },
    ],
  },
];

export function computeFilteredNavGroups(
  user: any,
  t: (key: string) => string,
): FilteredNavGroup[] {
  const userRole = String(user?.role || "").trim().toUpperCase();
  const isGod = hasGodMode(user);
  const isWarehouseUser = userRole === "WAREHOUSE" || isGod;

  return NAV_GROUPS.map((group) => {
    // Enforce strict private department navigation lock (unless GodMode/Executive)
    if (!isGod && group.allowedRoles && group.allowedRoles.length > 0) {
      if (!group.allowedRoles.includes(userRole)) {
        return {
          group: group.group,
          translatedGroup: t(group.group),
          items: [],
        };
      }
    }

    let items = group.items.filter((item) => {
      if (isGod) return true;
      if (item.fcOnly) return userRole === "FC";
      if (item.roles && item.roles.length > 0) {
        return item.roles.includes(userRole);
      }
      if (item.action) return hasPermission(user, item.action);
      return true;
    });

    // Shared Inventory Master & Balances label adaptation for non-Warehouse departments
    if (group.group === "Warehouse" && !isWarehouseUser) {
      items = items.map((item) => {
        if (item.path === "/warehouse") {
          return {
            ...item,
            name: "Inventory Master & Balances",
          };
        }
        return item;
      });
    }

    if (group.group === "Human Resources") {
      const isManagerOrSupervisorOrFc =
        user?.level === "MANAGER" ||
        user?.level === "SUPERVISOR" ||
        userRole === "FC" ||
        userRole === "HR" ||
        isGod;
      items = items.map((item) => {
        if (item.path === "/ess") {
          return {
            ...item,
            name: isManagerOrSupervisorOrFc
              ? "Manager Self Service"
              : "Staff Self Service",
          };
        }
        return item;
      });
    }

    const displayGroupName =
      group.group === "Warehouse" && !isWarehouseUser
        ? "Inventory"
        : group.group;

    return {
      group: group.group,
      translatedGroup: t(displayGroupName),
      items: items.map((item) => ({
        ...item,
        translatedName: t(item.name),
      })),
    };
  }).filter((g) => g.items.length > 0);
}
