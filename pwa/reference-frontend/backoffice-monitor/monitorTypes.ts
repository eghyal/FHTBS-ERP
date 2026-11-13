export type HubCategory =
  | "APPROVALS"
  | "PROJECTS"
  | "QUOTATIONS"
  | "PROCUREMENT"
  | "INVENTORY"
  | "DELIVERIES"
  | "CONTACTS"
  | "FINANCE";

export type ApprovalDocFilter = "ALL" | "PR" | "PO" | "QUOTATION" | "DELIVERY";

export type InspectorItemType =
  | "PR"
  | "PO"
  | "QUOTATION"
  | "DELIVERY"
  | "PROJECT"
  | "SKU"
  | "CONTACT"
  | "FINANCE_METRIC";

export interface MobileMonitorHubProps {
  onSwitchToFullOverview?: () => void;
  defaultTab?: "HOME" | "ROLE_HUB";
  initialCategory?: HubCategory;
}
