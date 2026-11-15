import fs from "fs";
import path from "path";
import { z } from "zod";
import db from "../db/database.ts";
import { type AuthenticatedRequest } from "../middleware/auth.ts";
import { canUserApproveDepartment, normalizeDepartmentToRole } from "../constants/rbac.ts";

export const STORAGE_DIR = "/tmp/workspace_docs";
try {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
} catch (_) {}

// Ensure workspace_documents, document_sequences, versions, events, and locks tables exist
export function initWorkspaceTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_sequences (
        scope TEXT PRIMARY KEY,
        next_val INTEGER NOT NULL DEFAULT 1,
        next_value INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_documents (
        id TEXT PRIMARY KEY,
        document_code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        document_type TEXT NOT NULL,
        created_by_user_id TEXT DEFAULT 'system',
        created_by_username TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        department TEXT,
        content_format TEXT NOT NULL DEFAULT 'DOCX',
        current_version INTEGER NOT NULL DEFAULT 1,
        content_json TEXT NOT NULL,
        legacy_content_json TEXT,
        docx_file_path TEXT,
        pdf_file_path TEXT,
        file_hash TEXT,
        approved_file_hash TEXT,
        layout_preset TEXT DEFAULT 'A4_PORTRAIT',
        custom_width_mm INTEGER DEFAULT 210,
        custom_height_mm INTEGER DEFAULT 297,
        authorization_role TEXT DEFAULT 'HR_MANAGER',
        authorization_department TEXT DEFAULT 'HR',
        authorization_user_name TEXT,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        revision_note TEXT,
        approved_by TEXT,
        approved_by_user_id TEXT,
        approved_by_username TEXT,
        approved_by_role TEXT,
        approved_at TEXT,
        locked_by_user_id TEXT,
        locked_by_username TEXT,
        locked_at TEXT,
        lock_expires_at TEXT,
        idempotency_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ws_docs_auth ON workspace_documents(authorization_role, status);
      CREATE INDEX IF NOT EXISTS idx_ws_docs_dept_status ON workspace_documents(authorization_department, status);
      CREATE INDEX IF NOT EXISTS idx_ws_docs_creator ON workspace_documents(created_by_username);

      CREATE TABLE IF NOT EXISTS workspace_document_versions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        file_path TEXT,
        file_hash TEXT,
        file_size INTEGER DEFAULT 0,
        content_json TEXT NOT NULL,
        created_by_user_id TEXT,
        created_by_username TEXT,
        change_summary TEXT,
        created_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_doc_versions_unique
        ON workspace_document_versions(document_id, version);

      CREATE TABLE IF NOT EXISTS workspace_document_events (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        actor_user_id TEXT NOT NULL,
        actor_username TEXT,
        actor_role TEXT NOT NULL,
        event_type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        note TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ws_doc_events_doc
        ON workspace_document_events(document_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS workspace_document_locks (
        document_id TEXT PRIMARY KEY,
        locked_by_user_id TEXT,
        locked_by_username TEXT NOT NULL,
        locked_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);

    const alterColumns = [
      "ALTER TABLE document_sequences ADD COLUMN next_value INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE workspace_documents ADD COLUMN created_by_user_id TEXT DEFAULT 'system';",
      "ALTER TABLE workspace_documents ADD COLUMN content_format TEXT NOT NULL DEFAULT 'DOCX';",
      "ALTER TABLE workspace_documents ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1;",
      "ALTER TABLE workspace_documents ADD COLUMN legacy_content_json TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN docx_file_path TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN pdf_file_path TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN file_hash TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN approved_file_hash TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN authorization_department TEXT DEFAULT 'PURCHASING';",
      "ALTER TABLE workspace_documents ADD COLUMN approved_by_user_id TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN approved_by_username TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN approved_by_role TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN locked_by_user_id TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN locked_by_username TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN locked_at TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN lock_expires_at TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN idempotency_key TEXT;",
      "ALTER TABLE workspace_documents ADD COLUMN custom_width_mm INTEGER DEFAULT 210;",
      "ALTER TABLE workspace_documents ADD COLUMN custom_height_mm INTEGER DEFAULT 297;",
      "ALTER TABLE workspace_document_versions ADD COLUMN file_path TEXT;",
      "ALTER TABLE workspace_document_versions ADD COLUMN file_hash TEXT;",
      "ALTER TABLE workspace_document_versions ADD COLUMN file_size INTEGER DEFAULT 0;",
      "ALTER TABLE workspace_document_versions ADD COLUMN created_by_user_id TEXT;",
      "ALTER TABLE workspace_document_versions ADD COLUMN change_summary TEXT;",
      "ALTER TABLE workspace_document_locks ADD COLUMN locked_by_user_id TEXT;",
    ];

    for (const stmt of alterColumns) {
      try {
        db.exec(stmt);
      } catch (_) {}
    }
  } catch (err) {
    console.error("[WorkspaceDocuments] Error initializing schema:", err);
  }
}

// Atomic document code generator preventing race conditions and collision bugs (P0-05)
export function generateNextDocumentCode(customScopePrefix?: string): string {
  const dateStr = new Date().toISOString().slice(0, 7).replace("-", "");
  const scope = customScopePrefix || `DOC-${dateStr}`;
  const nowIso = new Date().toISOString();

  const runTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO document_sequences (scope, next_val, next_value, updated_at)
      VALUES (?, 1, 1, ?)
      ON CONFLICT(scope) DO UPDATE SET
        next_val = next_val + 1,
        next_value = next_val + 1,
        updated_at = excluded.updated_at
    `).run(scope, nowIso);

    const row: any = db.prepare("SELECT next_val, next_value FROM document_sequences WHERE scope = ?").get(scope);
    const seqVal = row?.next_val || row?.next_value || 1;
    const seqNum = String(seqVal).padStart(3, "0");
    return `${scope}-${seqNum}`;
  });

  return runTx();
}

export function recordDocumentEvent(params: {
  documentId: string;
  actorUserId: string;
  actorUsername: string;
  actorRole: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  createdAt?: string;
}) {
  const eventId = `WSE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = params.createdAt || new Date().toISOString();
  db.prepare(`
    INSERT INTO workspace_document_events (
      id, document_id, actor_user_id, actor_username, actor_role,
      event_type, from_status, to_status, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    params.documentId,
    params.actorUserId || "system",
    params.actorUsername || "system",
    params.actorRole || "STAFF",
    params.eventType,
    params.fromStatus ?? null,
    params.toStatus ?? null,
    params.note ?? null,
    nowIso
  );
  return eventId;
}

export function saveDocxArtifactToDisk(docId: string, version: number, buffer: Uint8Array): string {
  const fileName = `${docId}_v${version}.docx`;
  const filePath = path.join(STORAGE_DIR, fileName);
  try {
    fs.writeFileSync(filePath, Buffer.from(buffer));
  } catch (_) {}
  return filePath;
}

export function savePdfArtifactToDisk(docId: string, version: number, buffer: Uint8Array): string {
  const fileName = `${docId}_v${version}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);
  try {
    fs.writeFileSync(filePath, Buffer.from(buffer));
  } catch (_) {}
  return filePath;
}

// Strict Zod Schema for Document Payload Validation (P0-06)
export const docBlockSchema = z
  .object({
    id: z.string().optional(),
    type: z.string().min(1, "Block type is required"),
  })
  .passthrough();

export const LAYOUT_PRESET_ENUM = z.enum([
  "A4_PORTRAIT",
  "A4_LANDSCAPE",
  "F4_PORTRAIT",
  "F4_LANDSCAPE",
  "US_LETTER_PORTRAIT",
  "US_LETTER_LANDSCAPE",
  "US_LEGAL_PORTRAIT",
  "US_LEGAL_LANDSCAPE",
  "A3_PORTRAIT",
  "A3_LANDSCAPE",
  "A5_PORTRAIT",
  "A5_LANDSCAPE",
  "B5_PORTRAIT",
  "THERMAL_80MM",
  "EXECUTIVE_MEMO",
  "CUSTOM",
]);

export const workspaceDocPayloadSchema = z.object({
  title: z
    .string({ message: "Document title must be a string" })
    .trim()
    .min(1, "Document title is required")
    .max(255, "Title must not exceed 255 characters"),
  document_type: z.string().trim().min(1).max(64).optional().default("MEMORANDUM"),
  department: z.string().trim().max(64).optional().default("General"),
  content: z.union([z.array(docBlockSchema), z.string()]).optional().default([]),
  content_format: z.enum(["DOCX", "LEGACY_BLOCKS"]).optional().default("DOCX"),
  layout_preset: LAYOUT_PRESET_ENUM.optional().default("A4_PORTRAIT"),
  custom_width_mm: z.number().nullable().optional(),
  custom_height_mm: z.number().nullable().optional(),
  authorization_role: z.string().optional(),
  authorization_department: z.string().optional(),
  authorization_user_name: z.string().optional().default(""),
  submitForApproval: z.boolean().optional().default(false),
  idempotency_key: z.string().optional(),
});

export const workspaceDocUpdateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Document title cannot be empty")
    .max(255, "Title must not exceed 255 characters")
    .optional(),
  document_type: z.string().trim().min(1).max(64).optional(),
  department: z.string().trim().max(64).optional(),
  content: z.union([z.array(docBlockSchema), z.string()]).optional(),
  content_format: z.enum(["DOCX", "LEGACY_BLOCKS"]).optional(),
  layout_preset: LAYOUT_PRESET_ENUM.optional(),
  custom_width_mm: z.number().nullable().optional(),
  custom_height_mm: z.number().nullable().optional(),
  authorization_role: z.string().optional(),
  authorization_department: z.string().optional(),
  authorization_user_name: z.string().optional(),
  expected_version: z.number().int().positive().optional(),
  change_summary: z.string().max(500).optional(),
});

export function resolveRoleAndDept(
  deptOrRole?: string | null,
  explicitRole?: string | null
): { role: string; department: string } | null {
  const dept = (deptOrRole || "").toString().trim().toUpperCase();
  const role = (explicitRole || "").toString().trim().toUpperCase();
  const combined = `${dept} ${role}`;
  if (!dept && !role) return null;

  const isSupervisorTier = role === "SUPERVISOR" || role.endsWith("_SUPERVISOR");
  const isFcTier =
    role === "FC" ||
    dept === "FC" ||
    combined.includes("CONTROLLER") ||
    combined.includes("PLANT") ||
    combined.includes("DIREKSI") ||
    combined.includes("MANAGEMENT");

  if (isFcTier) {
    return { role: "FC", department: "FC" };
  }
  if (combined.includes("FINANCE") || combined.includes("KEUANGAN") || combined.includes("ACCOUNTING")) {
    return {
      role: isSupervisorTier ? "FINANCE_SUPERVISOR" : "FINANCE_MANAGER",
      department: "FINANCE",
    };
  }
  if (combined.includes("PROD")) {
    return {
      role: isSupervisorTier ? "PRODUCTION_SUPERVISOR" : "PRODUCTION_MANAGER",
      department: "PRODUCTION",
    };
  }
  if (combined.includes("WAREHOUSE") || combined.includes("GUDANG") || combined.includes("LOGISTIK")) {
    return {
      role: isSupervisorTier ? "WAREHOUSE_SUPERVISOR" : "WAREHOUSE_MANAGER",
      department: "WAREHOUSE",
    };
  }
  if (dept === "HR" || combined.includes("HUMAN RESOURCE") || combined.includes("HRD") || role === "HR" || role.startsWith("HR_")) {
    return {
      role: isSupervisorTier ? "HR_SUPERVISOR" : "HR_MANAGER",
      department: "HR",
    };
  }
  if (combined.includes("ENGINEER") || combined.includes("TEKNIK") || combined.includes("BOP")) {
    return {
      role: isSupervisorTier ? "ENGINEERING_SUPERVISOR" : "ENGINEERING_MANAGER",
      department: "ENGINEERING",
    };
  }
  if (combined.includes("SALES") || combined.includes("COMMERCIAL") || combined.includes("MARKETING")) {
    return {
      role: isSupervisorTier ? "SALES_SUPERVISOR" : "SALES_MANAGER",
      department: "SALES",
    };
  }
  if (combined.includes("PPIC")) {
    return {
      role: isSupervisorTier ? "PPIC_SUPERVISOR" : "PPIC_MANAGER",
      department: "PPIC",
    };
  }
  if (dept === "QC" || dept === "QA_QC" || combined.includes("QUALITY")) {
    return {
      role: isSupervisorTier ? "QA_QC_SUPERVISOR" : "QA_QC_MANAGER",
      department: "QA_QC",
    };
  }
  if (combined.includes("PURCHAS") || combined.includes("PENGADAAN") || combined.includes("PROCUREMENT")) {
    return {
      role: isSupervisorTier ? "PURCHASING_SUPERVISOR" : "PURCHASING_MANAGER",
      department: "PURCHASING",
    };
  }
  if (role || dept) {
    return { role: role || `${dept}_MANAGER`, department: dept || "HR" };
  }
  return null;
}

// Helper to auto-extract authorization department and role from signature column blocks (scans backwards so the latest/bottom block wins)
export function extractRoutingFromContent(content: any[]): { role: string; department: string } | null {
  if (!Array.isArray(content)) return null;
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (
      block?.type === "SIGNATURE_COLUMN" ||
      block?.type === "SIGNATURE_STAMP" ||
      block?.type === "DUAL_SIGNATURE" ||
      block?.type === "signature"
    ) {
      const resolved = resolveRoleAndDept(
        block.targetDepartment || block.department,
        block.targetRole || block.authorization_role
      );
      if (resolved) return resolved;
    }
  }
  return null;
}

// Synchronize all signature blocks in content with the final resolved department & role
export function synchronizeSignatureBlocksRouting(blocks: any[], targetDept: string, targetRole: string): any[] {
  if (!Array.isArray(blocks) || !targetDept) return blocks;
  return blocks.map((b) => {
    if (
      b &&
      (b.type === "SIGNATURE_COLUMN" ||
        b.type === "SIGNATURE_STAMP" ||
        b.type === "DUAL_SIGNATURE" ||
        b.type === "signature")
    ) {
      return {
        ...b,
        targetDepartment: targetDept,
        targetRole: targetRole,
      };
    }
    return b;
  });
}

export function parseAndValidateBlocks(rawContent: any): { ok: boolean; blocks: any[]; error?: string } {
  if (rawContent === undefined || rawContent === null) {
    return { ok: true, blocks: [] };
  }
  let arr: any[];
  if (Array.isArray(rawContent)) {
    arr = rawContent;
  } else if (typeof rawContent === "string") {
    try {
      const parsed = JSON.parse(rawContent || "[]");
      if (!Array.isArray(parsed)) {
        return { ok: false, blocks: [], error: "Content must be a JSON array of document blocks." };
      }
      arr = parsed;
    } catch (e: any) {
      return { ok: false, blocks: [], error: "Malformed content JSON: " + e.message };
    }
  } else {
    return { ok: false, blocks: [], error: "Content must be an array of document blocks." };
  }

  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    if (!b || typeof b !== "object" || typeof b.type !== "string" || !b.type.trim()) {
      return { ok: false, blocks: [], error: `Invalid block at index ${i}: 'type' string is required.` };
    }
    const rawAlign = (b.alignment || b.align || "").toString().trim().toUpperCase();
    const defaultAlign =
      b.type === "HEADER" || b.type === "heading"
        ? "CENTER"
        : b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP"
        ? "RIGHT"
        : "LEFT";
    const normAlign =
      rawAlign === "CENTER" || rawAlign === "RIGHT" || rawAlign === "JUSTIFY" || rawAlign === "LEFT"
        ? rawAlign
        : defaultAlign;
    const rawVAlign = (b.verticalAlignment || b.verticalAlign || "").toString().trim().toUpperCase();
    const normVAlign =
      rawVAlign === "MIDDLE" || rawVAlign === "BOTTOM" || rawVAlign === "TOP" ? rawVAlign : "TOP";

    arr[i] = {
      ...b,
      alignment: normAlign,
      align: normAlign.toLowerCase(),
      verticalAlignment: normVAlign,
      verticalAlign: normVAlign.toLowerCase(),
      x: typeof b.x === "number" && Number.isFinite(b.x) ? Math.round(b.x) : 0,
      y: typeof b.y === "number" && Number.isFinite(b.y) ? Math.round(b.y) : 0,
    };
  }
  return { ok: true, blocks: arr };
}

export function isExecutiveOrFc(role?: string, level?: string): boolean {
  const r = (role || "").toUpperCase();
  const l = (level || "").toUpperCase();
  return (
    r === "FC" ||
    r === "ADMIN" ||
    r === "SUPER_ADMIN" ||
    r === "SUPERADMIN" ||
    r === "DIRECTOR" ||
    r === "BOD" ||
    r === "FACTORY_CONTROLLER" ||
    r === "PLANT_HEAD" ||
    l === "SUPER_ADMIN" ||
    normalizeDepartmentToRole(r) === "FC"
  );
}

export function isStrictDocumentOwner(doc: any, authReq: AuthenticatedRequest): boolean {
  const username = (authReq.username || authReq.user?.username || "").toString().trim().toLowerCase();
  const userId = (authReq.userId || authReq.user?.id || "").toString().trim();
  const docUsername = (doc?.created_by_username || "").toString().trim().toLowerCase();
  const docUserId = (doc?.created_by_user_id || "").toString().trim();

  if (
    username &&
    username !== "system" &&
    docUsername &&
    docUsername !== "system" &&
    username === docUsername
  ) {
    return true;
  }
  if (userId && userId !== "system" && docUserId && docUserId !== "system" && userId === docUserId) {
    return true;
  }
  return false;
}

export function isPrivateDraftStatus(status?: string): boolean {
  const normalized = (status || "").toString().trim().toUpperCase();
  return normalized === "DRAFT" || normalized === "REVISION_REQUIRED";
}

export function canUserReadDocument(doc: any, authReq: AuthenticatedRequest): boolean {
  if (!doc) return false;

  if (isStrictDocumentOwner(doc, authReq)) return true;

  // Strictly private statuses: DRAFT and REVISION_REQUIRED are accessible ONLY to their creator
  // (never exposed to FC/Admin, executives, or same-department colleagues until submitted)
  if (isPrivateDraftStatus(doc.status)) {
    return false;
  }

  const userRole = authReq.userRole || authReq.user?.role || "";
  if (isExecutiveOrFc(userRole, authReq.userLevel)) return true;
  if (doc.status === "APPROVED") return true;

  // Target department or author department match
  if (
    canUserApproveDepartment(userRole, doc.authorization_department) ||
    canUserApproveDepartment(userRole, doc.authorization_role) ||
    canUserApproveDepartment(userRole, doc.department)
  ) {
    return true;
  }

  return false;
}

export function canUserMutateDraft(doc: any, authReq: AuthenticatedRequest): boolean {
  return isStrictDocumentOwner(doc, authReq);
}

export function canTokenAccessPrivateDraft(
  doc: any,
  tokenPayload: { userId?: string } | undefined,
  authReq: AuthenticatedRequest
): boolean {
  if (!doc || !isPrivateDraftStatus(doc.status)) return true;
  if (authReq.userId && !isStrictDocumentOwner(doc, authReq)) {
    return false;
  }
  const tokenUser = (tokenPayload?.userId || "").toString().trim();
  if (!tokenUser || tokenUser === "system" || tokenUser === "guest" || tokenUser === "onlyoffice") {
    return false;
  }
  const docUserId = (doc.created_by_user_id || "").toString().trim();
  const docUsername = (doc.created_by_username || "").toString().trim().toLowerCase();
  if (docUserId && docUserId !== "system") {
    return tokenUser === docUserId || (docUsername !== "" && tokenUser.toLowerCase() === docUsername);
  }
  if (docUsername && docUsername !== "system") {
    return tokenUser.toLowerCase() === docUsername;
  }
  return false;
}

export function getActiveLock(
  docId: string
): { locked_by_username: string; locked_by_user_id?: string; expires_at: string } | null {
  try {
    const lock: any = db
      .prepare("SELECT * FROM workspace_document_locks WHERE document_id = ?")
      .get(docId);
    if (!lock) return null;
    if (new Date(lock.expires_at).getTime() <= Date.now()) {
      db.prepare("DELETE FROM workspace_document_locks WHERE document_id = ?").run(docId);
      return null;
    }
    return lock;
  } catch (_) {
    return null;
  }
}
