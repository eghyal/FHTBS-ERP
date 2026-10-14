export type WorkspaceStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REVISION_REQUIRED'
  | 'ARCHIVED';

export type WorkspaceDepartment =
  | 'SALES'
  | 'PURCHASING'
  | 'PPIC'
  | 'PRODUCTION'
  | 'QC'
  | 'WAREHOUSE'
  | 'FINANCE'
  | 'FC'
  | 'GENERAL';

export type TargetDepartment = WorkspaceDepartment;

export type WorkspaceRole =
  | 'SALES'
  | 'SALES_HEAD'
  | 'SALES_MANAGER'
  | 'PURCHASING'
  | 'PURCHASING_HEAD'
  | 'PURCHASING_MANAGER'
  | 'PPIC'
  | 'PPIC_HEAD'
  | 'PRODUCTION'
  | 'PRODUCTION_HEAD'
  | 'PRODUCTION_MANAGER'
  | 'QC'
  | 'QC_HEAD'
  | 'WAREHOUSE'
  | 'WAREHOUSE_HEAD'
  | 'WAREHOUSE_MANAGER'
  | 'FINANCE'
  | 'FINANCE_HEAD'
  | 'FINANCE_MANAGER'
  | 'FC'
  | 'ADMIN'
  | 'DIRECTOR'
  | 'BOD'
  | 'MANAGER'
  | 'STAFF';

export type LayoutPreset = 'A4_PORTRAIT' | 'A4_LANDSCAPE' | 'EXECUTIVE_MEMO';

export type ContentFormat = 'DOCX' | 'LEGACY_BLOCKS';

export type DocBlockType =
  | 'letterhead'
  | 'heading'
  | 'paragraph'
  | 'callout'
  | 'list'
  | 'table'
  | 'metadata'
  | 'address'
  | 'signature'
  | 'divider'
  | 'image'
  | 'chart'
  | 'page_break'
  | 'toc'
  // Legacy CanvaStudio block types
  | 'OFFICIAL_LETTERHEAD'
  | 'HEADER'
  | 'SENDER_ADDRESS'
  | 'RECIPIENT_ADDRESS'
  | 'PROJECT_SITE_ADDRESS'
  | 'TEXT'
  | 'CALLOUT'
  | 'LIST_POINTS'
  | 'TABLE'
  | 'METADATA_GRID'
  | 'SIGNATURE_COLUMN'
  | 'SIGNATURE_STAMP'
  | 'DUAL_SIGNATURE'
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
 * Mendukung pemformatan per-kata / per-karakter di dalam satu paragraf.
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
  streetAddress?: string;
  cityPostal?: string;
  attentionTo?: string;
  // Extended & legacy fields
  division?: string;
  siteLocation?: string;
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

export interface DocTableData {
  headers: string[];
  rows: string[][];
  columnWidths?: number[];
  colWidths?: number[];
  rowHeights?: number[];
  showTotals?: boolean;
  cellMeta?: Record<string, DocTableCellMeta>;
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
}

export interface DocBlock {
  id: string;
  type: DocBlockType;
  category?: 'header' | 'body' | 'table' | 'footer' | 'routing' | 'media' | 'BODY_TEXT' | 'SIGNATURE_COLUMN' | 'ADDRESS_TEMPLATE';
  stylePreset?: ParagraphStylePreset;
  headingLevel?: 1 | 2 | 3;
  title?: string;
  subtitle?: string;
  content?: string;
  richHtml?: string;
  runs?: DocTextRun[];
  fontFamily?: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  isStrikethrough?: boolean;
  fontSize?: number;
  lineHeight?: number;
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
  addressData?: DocAddressData;
  tableData?: DocTableData;
  metaData?: DocMetaData;
  mediaData?: DocMediaData;
  footnotes?: DocFootnote[];
  comments?: DocCommentThread[];
  trackedChanges?: DocTrackedChange[];
  pageSetup?: DocPageSetup;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  locked?: boolean;
  isLocked?: boolean;
  isTriggerActive?: boolean;
  style?: any;
  notes?: string;
  targetDepartment?: WorkspaceDepartment;
  targetRole?: WorkspaceRole;
  signatoryTitle?: string;
  signatoryName?: string;
}

export interface WorkspaceDocumentVersion {
  id: string;
  document_id: string;
  version: number;
  file_path: string;
  file_hash: string;
  file_size: number;
  created_by_user_id: string;
  created_at: string;
  change_summary?: string;
}

export interface WorkspaceDocumentEvent {
  id: string;
  document_id: string;
  actor_user_id: string;
  actor_role: string;
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
    | 'EXPORTED_PDF';
  from_status?: WorkspaceStatus | null;
  to_status?: WorkspaceStatus | null;
  note?: string | null;
  created_at: string;
}

export interface WorkspaceDocument {
  id: string;
  document_code: string;
  title: string;
  document_type: string;
  department: WorkspaceDepartment;
  status: WorkspaceStatus;
  layout_preset: LayoutPreset;
  content_format: ContentFormat;
  current_version: number;
  content?: DocBlock[];
  legacy_content_json?: string | null;
  docx_file_path?: string | null;
  pdf_file_path?: string | null;
  approved_file_hash?: string | null;
  created_by_user_id: string;
  created_by_username: string;
  created_by_name?: string;
  authorization_department?: WorkspaceDepartment | null;
  authorization_role?: WorkspaceRole | null;
  authorization_user_name?: string | null;
  approved_by_user_id?: string | null;
  approved_by_username?: string | null;
  approved_by_role?: string | null;
  approved_at?: string | null;
  revision_note?: string | null;
  locked_by_user_id?: string | null;
  locked_at?: string | null;
  lock_expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnlyOfficeEditorSession {
  documentId: string;
  documentKey: string;
  documentTitle: string;
  fileUrl: string;
  callbackUrl: string;
  mode: 'edit' | 'view';
  token: string;
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
  };
}
