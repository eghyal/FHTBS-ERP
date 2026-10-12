export type LayoutPreset = "A4_PORTRAIT" | "A4_LANDSCAPE" | "EXECUTIVE_MEMO";

export type BlockCategory = "BODY_TEXT" | "ADDRESS_TEMPLATE" | "SIGNATURE_COLUMN";

export type DocBlockType =
  // Body Text Templates
  | "HEADER"
  | "TEXT"
  | "CALLOUT"
  | "LIST_POINTS"
  | "TABLE"
  | "METADATA_GRID"
  // Address Templates
  | "OFFICIAL_LETTERHEAD"
  | "SENDER_ADDRESS"
  | "RECIPIENT_ADDRESS"
  | "PROJECT_SITE_ADDRESS"
  | "CONTACT_CARD"
  // Signature Column Templates
  | "SIGNATURE_COLUMN"
  | "SIGNATURE_STAMP"
  | "DUAL_SIGNATURE";

export type TargetDepartment =
  | "PURCHASING"
  | "FINANCE"
  | "PRODUCTION"
  | "FACTORY_CONTROLLER"
  | "MANAGEMENT"
  | "WAREHOUSE"
  | "GENERAL";

export type AuthorizationRole =
  | "PURCHASING_MANAGER"
  | "FINANCE_HEAD"
  | "PRODUCTION_MANAGER"
  | "FACTORY_CONTROLLER"
  | "PLANT_HEAD"
  | "WAREHOUSE_SUPERVISOR"
  | "ADMIN";

export interface DocBlock {
  id: string;
  type: DocBlockType;
  category: BlockCategory;
  title?: string;
  subtitle?: string;
  content?: string;
  style?: "NORMAL" | "WARNING" | "SUCCESS" | "INFO" | "OFFICIAL";
  alignment?: "LEFT" | "CENTER" | "RIGHT";
  
  // For List / Bullet points
  listItems?: string[];

  // For Address Templates
  addressData?: {
    companyName?: string;
    division?: string;
    streetAddress?: string;
    cityStateZip?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    siteLocation?: string;
  };

  // For Signature Column Graphic Containers (Auto-Trigger)
  targetDepartment?: TargetDepartment;
  targetRole?: AuthorizationRole;
  signatoryTitle?: string;
  signatoryName?: string;
  signatoryNik?: string;
  notes?: string;
  isTriggerActive?: boolean;

  // For Data Tables
  tableData?: {
    headers: string[];
    rows: string[][];
  };

  // Container sizing & free positioning (Hold & Move mouse resize / drag)
  width?: number | string;
  height?: number | string;
  x?: number;
  y?: number;
  isLocked?: boolean;

  // For Metadata Grid
  metaData?: {
    key: string;
    value: string;
  }[];
}

export interface WorkspaceDocument {
  id: string;
  document_code: string;
  title: string;
  document_type: string;
  created_by_username: string;
  created_by_name: string;
  department: string;
  content: DocBlock[];
  layout_preset: LayoutPreset;
  authorization_role: string;
  authorization_department?: string;
  authorization_user_name?: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REVISION_REQUIRED";
  revision_note?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}
