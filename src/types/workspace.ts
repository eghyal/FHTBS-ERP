export type WorkspaceStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REVISION_REQUIRED'
  | 'ARCHIVED';

export type WorkspaceDepartment =
  | 'FC'
  | 'HR'
  | 'ENGINEERING'
  | 'PPIC'
  | 'PURCHASING'
  | 'WAREHOUSE'
  | 'QA_QC'
  | 'QC'
  | 'PRODUCTION'
  | 'SALES'
  | 'FINANCE'
  | 'GENERAL';

export type TargetDepartment = WorkspaceDepartment;

export type WorkspaceRole =
  | 'FC'
  | 'HR'
  | 'HR_SUPERVISOR'
  | 'HR_MANAGER'
  | 'ENGINEERING'
  | 'ENGINEERING_SUPERVISOR'
  | 'ENGINEERING_MANAGER'
  | 'ENGINEERING_HEAD'
  | 'SALES'
  | 'SALES_SUPERVISOR'
  | 'SALES_HEAD'
  | 'SALES_MANAGER'
  | 'PURCHASING'
  | 'PURCHASING_SUPERVISOR'
  | 'PURCHASING_HEAD'
  | 'PURCHASING_MANAGER'
  | 'PPIC'
  | 'PPIC_SUPERVISOR'
  | 'PPIC_MANAGER'
  | 'PPIC_HEAD'
  | 'PRODUCTION'
  | 'PRODUCTION_SUPERVISOR'
  | 'PRODUCTION_HEAD'
  | 'PRODUCTION_MANAGER'
  | 'QA_QC'
  | 'QA_QC_SUPERVISOR'
  | 'QA_QC_MANAGER'
  | 'QC'
  | 'QC_HEAD'
  | 'WAREHOUSE'
  | 'WAREHOUSE_HEAD'
  | 'WAREHOUSE_MANAGER'
  | 'WAREHOUSE_SUPERVISOR'
  | 'FINANCE'
  | 'FINANCE_SUPERVISOR'
  | 'FINANCE_HEAD'
  | 'FINANCE_MANAGER'
  | 'SUPERVISOR'
  | 'MANAGER'
  | 'STAFF';

export type AuthorizationRole = WorkspaceRole | string;

export type BlockCategory =
  | 'BODY_TEXT'
  | 'ADDRESS_TEMPLATE'
  | 'SIGNATURE_COLUMN'
  | 'FOOTER_TEMPLATE';

export type LayoutPreset =
  | 'A4_PORTRAIT'
  | 'A4_LANDSCAPE'
  | 'F4_PORTRAIT'
  | 'F4_LANDSCAPE'
  | 'US_LETTER_PORTRAIT'
  | 'US_LETTER_LANDSCAPE'
  | 'US_LEGAL_PORTRAIT'
  | 'US_LEGAL_LANDSCAPE'
  | 'A3_PORTRAIT'
  | 'A3_LANDSCAPE'
  | 'A5_PORTRAIT'
  | 'A5_LANDSCAPE'
  | 'B5_PORTRAIT'
  | 'THERMAL_80MM'
  | 'EXECUTIVE_MEMO'
  | 'CUSTOM';

export type ContentFormat = 'DOCX' | 'LEGACY_BLOCKS';

export type DocBlockType =
  | 'OFFICIAL_LETTERHEAD'
  | 'HEADER'
  | 'SENDER_ADDRESS'
  | 'RECIPIENT_ADDRESS'
  | 'PROJECT_SITE_ADDRESS'
  | 'TEXT'
  | 'CALLOUT'
  | 'LIST_POINTS'
  | 'CHECKLIST'
  | 'TABLE'
  | 'METADATA_GRID'
  | 'SIGNATURE_COLUMN'
  | 'SIGNATURE_STAMP'
  | 'DUAL_SIGNATURE'
  | 'FOOTER'
  | 'FOOTER_BLOCK'
  | 'DIVIDER'
  | 'IMAGE'
  | 'CONTACT_CARD';

export type ParagraphStylePreset =
  | 'NORMAL'
  | 'TITLE'
  | 'SUBTITLE'
  | 'HEADING_1'
  | 'HEADING_2'
  | 'HEADING_3'
  | 'QUOTE'
  | 'CAPTION';

export type ListStyleType = 'BULLET' | 'NUMBERED' | 'MULTILEVEL_LEGAL' | 'CHECKLIST';

/**
 * Representasi Rich-Text Character Run setara WordprocessingML (<w:r>)
 * Mendukung pemformatan per-kata / per-seleksi di dalam satu paragraf.
 */
export interface DocTextRun {
  id: string;
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  highlight?: string;
  commentId?: string;
  revisionType?: 'INSERT' | 'DELETE' | 'FORMAT';
  revisionAuthor?: string;
  revisionTimestamp?: string;
}

export interface DocAddressData {
  recipientName?: string;
  companyName?: string;
  entityName?: string;
  label?: string;
  streetAddress?: string;
  cityPostal?: string;
  attentionTo?: string;
  contactPerson?: string;
  division?: string;
  siteLocation?: string;
  siteCoordinates?: string;
  cityStateZip?: string;
  phone?: string;
  email?: string;
  [key: string]: any;
}

export interface DocTableCellMeta {
  rowSpan?: number;
  colSpan?: number;
  hidden?: boolean;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  isFormula?: boolean;
  formulaExpression?: string;
}

export type CellFormatType = 'TEXT' | 'CURRENCY_IDR' | 'CURRENCY_USD' | 'NUMBER' | 'PERCENT';

export interface DocTableData {
  headers: string[];
  rows: string[][];
  columnWidths?: number[];
  colWidths?: number[];
  rowHeights?: number[];
  showTotals?: boolean;
  cellMeta?: Record<string, DocTableCellMeta>;
  cellFormats?: Record<string, CellFormatType>;
  columnAlignments?: Array<'left' | 'center' | 'right'>;
  zebraStriping?: boolean;
  borderColor?: string;
}

export type DocMetaData = any;

export interface DocMediaData {
  mediaType: 'IMAGE' | 'BAR_CHART' | 'LINE_CHART' | 'SHAPE_CALLOUT';
  caption?: string;
  imageUrl?: string;
  widthPx?: number;
  heightPx?: number;
  wrapMode?: 'INLINE' | 'FLOAT_LEFT' | 'FLOAT_RIGHT';
  chartLabels?: string[];
  chartValues?: number[];
  chartUnit?: string;
}

export interface DocFootnote {
  id: string;
  number: number;
  referenceBlockId: string;
  text: string;
}

export interface DocCommentReply {
  id: string;
  authorUsername: string;
  authorRole: string;
  text: string;
  createdAt: string;
}

export interface DocCommentThread {
  id: string;
  blockId: string;
  selectedText: string;
  authorUsername: string;
  authorRole: string;
  text: string;
  resolved: boolean;
  createdAt: string;
  replies: DocCommentReply[];
}

export interface DocTrackedChange {
  id: string;
  blockId: string;
  type: 'INSERT' | 'DELETE' | 'FORMAT' | 'TABLE_EDIT';
  authorUsername: string;
  authorRole: string;
  beforeSummary: string;
  afterSummary: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
}

export interface DocPageSetup {
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  headerText: string;
  footerText: string;
  showPageNumbers: boolean;
  differentFirstPage: boolean;
  watermarkText?: string;
  customWidthMm?: number;
  customHeightMm?: number;
}

export interface DocSignatureSlot {
  id: string;
  roleTitle: string;
  signerName?: string;
  department?: WorkspaceDepartment | string;
  targetRole?: WorkspaceRole | string;
  signedAt?: string;
  signatureUrl?: string;
  isRequired?: boolean;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface WorkspaceSignerStep {
  step: number;
  blockId?: string;
  department: WorkspaceDepartment | string;
  role: WorkspaceRole | string;
  signatoryTitle: string;
  signatoryName?: string;
  status: 'PENDING' | 'APPROVED' | 'REVISION_REQUIRED';
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export interface DocBlock {
  id: string;
  type: DocBlockType | string;
  category?: BlockCategory | string;
  stylePreset?: ParagraphStylePreset;
  headingLevel?: 1 | 2 | 3;
  title?: string;
  subtitle?: string;
  content?: string;
  richHtml?: string;
  runs?: DocTextRun[];
  fontFamily?: string;
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textCase?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  fontSize?: number;
  lineHeight?: number;
  lineSpacing?: number;
  letterSpacing?: number;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  firstLineIndentPx?: number;
  hangingIndentPx?: number;
  textColor?: string;
  highlightColor?: string;
  align?: 'left' | 'center' | 'right' | 'justify' | 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFY';
  alignment?: 'left' | 'center' | 'right' | 'justify' | 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFY';
  verticalAlign?: 'top' | 'middle' | 'bottom' | 'TOP' | 'MIDDLE' | 'BOTTOM';
  verticalAlignment?: 'top' | 'middle' | 'bottom' | 'TOP' | 'MIDDLE' | 'BOTTOM';
  listStyle?: ListStyleType;
  listItems?: string[];
  calloutTone?: 'INFO' | 'WARNING' | 'SUCCESS' | 'DANGER';
  addressData?: DocAddressData;
  tableData?: DocTableData;
  tableHeaders?: string[];
  tableRows?: string[][];
  tableZebra?: boolean;
  cellFormats?: Record<string, CellFormatType>;
  columnAlignments?: Array<'left' | 'center' | 'right'>;
  metaData?: DocMetaData;
  metadataRows?: Array<{ label: string; value: string }>;
  mediaData?: DocMediaData;
  imageUrl?: string;
  caption?: string;
  companyName?: string;
  tagline?: string;
  addressLine?: string;
  isoNumber?: string;
  logoUrl?: string;
  signatureSlots?: DocSignatureSlot[];
  signatureData?: {
    preparedBy?: string;
    preparedRole?: string;
    checkedBy?: string;
    checkedRole?: string;
    approvedBy?: string;
    approvedRole?: string;
    approvedDate?: string;
    stampUrl?: string;
  };
  secondarySignatoryName?: string;
  secondarySignatoryTitle?: string;
  footnotes?: DocFootnote[];
  comments?: DocCommentThread[];
  trackedChanges?: DocTrackedChange[];
  pageSetup?: DocPageSetup;
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
  locked?: boolean;
  isLocked?: boolean;
  isTriggerActive?: boolean;
  style?: any;
  notes?: string;
  targetDepartment?: WorkspaceDepartment;
  targetRole?: WorkspaceRole | string;
  signatoryTitle?: string;
  signatoryName?: string;
  footerVariant?: 'ERP_STANDARD' | 'BANK_PAYMENT' | 'ISO_COMPLIANCE' | 'CONFIDENTIAL';
  footerLeftText?: string;
  footerRightText?: string;
  checklistItems?: Array<{ text: string; checked: boolean }>;
}

export interface WorkspaceDocumentVersion {
  id: string;
  document_id?: string;
  documentId?: string;
  version: number;
  file_path?: string;
  docxPath?: string;
  file_hash?: string;
  contentHash?: string;
  file_size?: number;
  content_json?: string;
  created_by_user_id?: string;
  createdBy?: string;
  created_by_username?: string;
  createdByName?: string;
  created_at: string;
  createdAt?: string;
  change_summary?: string;
  changeSummary?: string;
}

export interface WorkspaceDocumentEvent {
  id: string;
  document_id?: string;
  documentId?: string;
  actor_user_id?: string;
  actorId?: string;
  actor_username?: string;
  actorName?: string;
  actor_role: string;
  actorRole?: string;
  event_type:
    | 'CREATED'
    | 'UPDATED'
    | 'SUBMITTED'
    | 'APPROVED'
    | 'REVISION_REQUESTED'
    | 'CANCELLED_SUBMISSION'
    | 'ARCHIVED'
    | 'VERSION_RESTORED'
    | 'MIGRATED_TO_DOCX'
    | 'EXPORTED_PDF'
    | string;
  eventType?: string;
  from_status?: WorkspaceStatus | null;
  previousStatus?: WorkspaceStatus | null;
  to_status?: WorkspaceStatus | null;
  nextStatus?: WorkspaceStatus | null;
  note?: string | null;
  notes?: string | null;
  created_at: string;
  createdAt?: string;
}

export interface WorkspaceDocument {
  id: string;
  document_code: string;
  docNumber?: string;
  title: string;
  document_type: string;
  type?: string;
  department: WorkspaceDepartment | string;
  status: WorkspaceStatus;
  layout_preset: LayoutPreset;
  custom_width_mm?: number | null;
  custom_height_mm?: number | null;
  content_format: ContentFormat;
  current_version: number;
  version?: number;
  content?: DocBlock[];
  blocks?: DocBlock[];
  block_count?: number;
  legacy_content_json?: string | null;
  docx_file_path?: string | null;
  pdf_file_path?: string | null;
  file_hash?: string | null;
  contentHash?: string | null;
  approved_file_hash?: string | null;
  created_by_user_id: string;
  createdBy?: string;
  created_by_username: string;
  created_by_name?: string;
  createdByName?: string;
  authorization_department?: WorkspaceDepartment | string | null;
  targetDepartment?: WorkspaceDepartment | string | null;
  authorization_role?: WorkspaceRole | string | null;
  authorizationRole?: WorkspaceRole | string | null;
  authorization_user_name?: string | null;
  signer_chain?: WorkspaceSignerStep[];
  approved_by?: string | null;
  approvedBy?: string | null;
  approved_by_user_id?: string | null;
  approved_by_username?: string | null;
  approved_by_role?: string | null;
  approved_at?: string | null;
  approvedAt?: string | null;
  revision_note?: string | null;
  locked_by_user_id?: string | null;
  locked_by_username?: string | null;
  locked_at?: string | null;
  lock_expires_at?: string | null;
  versions?: WorkspaceDocumentVersion[];
  events?: WorkspaceDocumentEvent[];
  created_at: string;
  updated_at: string;
}

export interface OnlyOfficeEditorSession {
  documentId: string;
  documentKey: string;
  documentTitle: string;
  fileType?: 'docx';
  documentType?: 'word';
  fileUrl?: string;
  docxDownloadUrl?: string;
  pdfDownloadUrl?: string;
  callbackUrl: string;
  documentServerUrl?: string | null;
  mode: 'edit' | 'view' | 'ONLYOFFICE_SERVER' | 'NATIVE_DOCX';
  token?: string;
  accessToken?: string;
  fileToken?: string;
  callbackToken?: string;
  contentHash?: string;
  version?: number;
  expiresAt?: string;
  permissions: {
    edit: boolean;
    review: boolean;
    comment: boolean;
    download: boolean;
    print: boolean;
  };
  user: {
    id: string;
    name: string;
    role: string;
    department?: string;
  };
}

export type OnlyOfficeSessionConfig = OnlyOfficeEditorSession;

