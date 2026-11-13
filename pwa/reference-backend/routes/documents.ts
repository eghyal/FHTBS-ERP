import { Router } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import db from "../db/database.ts";
import { outboxService } from "../services/outboxService.ts";
import { type AuthenticatedRequest } from "../middleware/auth.ts";
import { canUserApproveDepartment, normalizeDepartmentToRole } from "../constants/rbac.ts";
import { isValidDailyAuthKey } from "../utils/auth.ts";
import {
  createOnlyOfficeSession,
  extractBlocksFromDocxBuffer,
  generateDeterministicPdfBuffer,
  generateDocxBinaryBuffer,
  signDocumentAccessToken,
  verifyDocumentAccessToken,
} from "../services/docxEngine.ts";

export const workspaceDocumentsRouter = Router();

const STORAGE_DIR = "/tmp/workspace_docs";
try {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
} catch (_) {}

// Ensure workspace_documents, document_sequences, versions, events, and locks tables exist
function initWorkspaceTable() {
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

initWorkspaceTable();

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

function recordDocumentEvent(params: {
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

function saveDocxArtifactToDisk(docId: string, version: number, buffer: Uint8Array): string {
  const fileName = `${docId}_v${version}.docx`;
  const filePath = path.join(STORAGE_DIR, fileName);
  try {
    fs.writeFileSync(filePath, Buffer.from(buffer));
  } catch (_) {}
  return filePath;
}

function savePdfArtifactToDisk(docId: string, version: number, buffer: Uint8Array): string {
  const fileName = `${docId}_v${version}.pdf`;
  const filePath = path.join(STORAGE_DIR, fileName);
  try {
    fs.writeFileSync(filePath, Buffer.from(buffer));
  } catch (_) {}
  return filePath;
}

// Strict Zod Schema for Document Payload Validation (P0-06)
const docBlockSchema = z
  .object({
    id: z.string().optional(),
    type: z.string().min(1, "Block type is required"),
  })
  .passthrough();

const LAYOUT_PRESET_ENUM = z.enum([
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

const workspaceDocPayloadSchema = z.object({
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

const workspaceDocUpdateSchema = z.object({
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
function synchronizeSignatureBlocksRouting(blocks: any[], targetDept: string, targetRole: string): any[] {
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

function parseAndValidateBlocks(rawContent: any): { ok: boolean; blocks: any[]; error?: string } {
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

function isExecutiveOrFc(role?: string, level?: string): boolean {
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

function isStrictDocumentOwner(doc: any, authReq: AuthenticatedRequest): boolean {
  const username = (authReq.username || authReq.user?.username || "").toString().trim().toLowerCase();
  const userId = (authReq.userId || authReq.user?.id || "").toString().trim();
  const docUsername = (doc?.created_by_username || "").toString().trim().toLowerCase();
  const docUserId = (doc?.created_by_user_id || "").toString().trim();

  if (username && docUsername && username === docUsername) return true;
  if (userId && userId !== "system" && docUserId && docUserId !== "system" && userId === docUserId) return true;
  return false;
}

function canUserReadDocument(doc: any, authReq: AuthenticatedRequest): boolean {
  const userRole = authReq.userRole || authReq.user?.role || "";

  if (isStrictDocumentOwner(doc, authReq)) return true;
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

function canUserMutateDraft(doc: any, authReq: AuthenticatedRequest): boolean {
  return isStrictDocumentOwner(doc, authReq);
}

function getActiveLock(docId: string): { locked_by_username: string; locked_by_user_id?: string; expires_at: string } | null {
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

// 1. Get List of Workspace Documents (P1-05 Paginated, ACL Scoped, Optional Lightweight Projection)
workspaceDocumentsRouter.get("/api/workspace-documents", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { status, authorization_role, department, search, page, limit, include_content, lightweight } = req.query;

    let sql = "SELECT * FROM workspace_documents WHERE 1=1";
    const params: any[] = [];

    if (status && status !== "ALL") {
      sql += " AND status = ?";
      params.push(status);
    }

    if (authorization_role && authorization_role !== "ALL") {
      sql += " AND (authorization_role = ? OR authorization_department = ?)";
      params.push(authorization_role, authorization_role);
    }

    if (department && department !== "ALL") {
      sql += " AND (department = ? OR authorization_department = ?)";
      params.push(department, department);
    }

    if (search && typeof search === "string" && search.trim()) {
      sql += " AND (title LIKE ? OR document_code LIKE ? OR created_by_name LIKE ?)";
      const q = `%${search.trim()}%`;
      params.push(q, q, q);
    }

    sql += " ORDER BY updated_at DESC";

    const allRows = db.prepare(sql).all(...params) as any[];

    // Filter rows by ACL (owners, target dept, approved, or FC/Admin)
    const visibleRows = allRows.filter((r) => canUserReadDocument(r, authReq));

    const pageNum = Math.max(1, parseInt(String(page || "1"), 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(String(limit || "100"), 10) || 100));
    const total = visibleRows.length;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const pagedRows = visibleRows.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    const omitFullContent =
      lightweight === "true" || lightweight === "1" || include_content === "false" || include_content === "0";

    const formatted = pagedRows.map((r: any) => {
      let content: any[] = [];
      try {
        content = JSON.parse(r.content_json || "[]");
      } catch (_) {
        content = [];
      }
      const { content_json, legacy_content_json, ...rest } = r;
      return {
        ...rest,
        block_count: Array.isArray(content) ? content.length : 0,
        content: omitFullContent ? undefined : content,
      };
    });

    res.json({
      success: true,
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    console.error("Error fetching workspace documents:", err);
    res.status(500).json({ error: "Failed to fetch workspace documents: " + err.message });
  }
});

// 2. Get Pending Approvals (P1-01 Consistent FINANCE & Department Routing)
workspaceDocumentsRouter.get("/api/workspace-documents/pending-approvals", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const roleParam = (req.query.role as string) || authReq.userRole || authReq.user?.role || "";
    const deptParam = (req.query.department as string) || "";

    const rows = db
      .prepare("SELECT * FROM workspace_documents WHERE status = 'PENDING_APPROVAL' ORDER BY created_at DESC")
      .all() as any[];

    const filtered = rows.filter((r) => {
      if (roleParam && roleParam !== "ALL") {
        if (isExecutiveOrFc(roleParam)) return true;
        return (
          canUserApproveDepartment(roleParam, r.authorization_department) ||
          canUserApproveDepartment(roleParam, r.authorization_role) ||
          canUserApproveDepartment(roleParam, r.department)
        );
      }
      if (deptParam && deptParam !== "ALL") {
        return (
          normalizeDepartmentToRole(r.authorization_department) === normalizeDepartmentToRole(deptParam) ||
          normalizeDepartmentToRole(r.authorization_role) === normalizeDepartmentToRole(deptParam)
        );
      }
      return true;
    });

    const formatted = filtered.map((r: any) => {
      let content: any[] = [];
      try {
        content = JSON.parse(r.content_json || "[]");
      } catch (_) {
        content = [];
      }
      return {
        ...r,
        block_count: content.length,
        content,
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    console.error("Error fetching pending workspace approvals:", err);
    res.status(500).json({ error: "Failed to fetch pending approvals: " + err.message });
  }
});

// 3. Get Single Workspace Document (with ACL check, versions, and audit events)
workspaceDocumentsRouter.get("/api/workspace-documents/:id", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const doc: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (!canUserReadDocument(doc, authReq)) {
      return res.status(403).json({
        error: "Forbidden: You do not have permission to view this document.",
      });
    }

    let content: any[] = [];
    try {
      content = JSON.parse(doc.content_json || "[]");
    } catch (_) {
      content = [];
    }

    const versions = db
      .prepare(
        "SELECT id, document_id, version, file_path, file_hash, file_size, created_by_user_id, created_by_username, change_summary, created_at FROM workspace_document_versions WHERE document_id = ? ORDER BY version DESC"
      )
      .all(id);

    const events = db
      .prepare("SELECT * FROM workspace_document_events WHERE document_id = ? ORDER BY created_at DESC")
      .all(id);

    const activeLock = getActiveLock(id);

    res.json({
      success: true,
      data: {
        ...doc,
        content,
        versions,
        events,
        active_lock: activeLock,
      },
    });
  } catch (err: any) {
    console.error("Error fetching workspace document details:", err);
    res.status(500).json({ error: "Failed to fetch document details: " + err.message });
  }
});

// 4. Create New Workspace Document (P0-03, P0-04, P0-05, P0-06, P1-06, P1-07)
workspaceDocumentsRouter.post("/api/workspace-documents", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;

    // P0-06 Pre-validate content if string/array before or during Zod parse
    if (req.body && req.body.content !== undefined) {
      const contentCheck = parseAndValidateBlocks(req.body.content);
      if (!contentCheck.ok) {
        return res.status(400).json({
          error: contentCheck.error,
          fieldErrors: { content: [contentCheck.error] },
        });
      }
    }

    const validation = workspaceDocPayloadSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error:
          "Validation failed: " +
          validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        fieldErrors: validation.error.flatten().fieldErrors,
      });
    }

    const {
      title,
      document_type,
      department,
      content,
      content_format,
      layout_preset,
      custom_width_mm,
      custom_height_mm,
      authorization_role,
      authorization_department,
      authorization_user_name,
      submitForApproval,
      idempotency_key,
    } = validation.data;

    const blockCheck = parseAndValidateBlocks(content);
    if (!blockCheck.ok) {
      return res.status(400).json({
        error: blockCheck.error,
        fieldErrors: { content: [blockCheck.error] },
      });
    }
    let parsedContent = blockCheck.blocks;

    // Automatic routing follows inserted signature blocks; if no signature block exists in content, automatically route to HR
    const autoRoute = extractRoutingFromContent(parsedContent);
    const explicitRoute = resolveRoleAndDept(authorization_department, authorization_role);
    const finalAuthDept = autoRoute
      ? autoRoute.department
      : explicitRoute?.department || "HR";
    const finalAuthRole = autoRoute
      ? autoRoute.role
      : explicitRoute?.role || "HR_MANAGER";

    if (autoRoute) {
      parsedContent = synchronizeSignatureBlocksRouting(parsedContent, finalAuthDept, finalAuthRole);
    }

    const docId = "WSD-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
    const docCode = generateNextDocumentCode();
    const nowIso = new Date().toISOString();
    const safeCustomWidthMm = Number(custom_width_mm) || 210;
    const safeCustomHeightMm = Number(custom_height_mm) || 297;

    // P0-03: Verified identity strictly from JWT session
    const createdByUserId = authReq.userId || authReq.user?.id || "system";
    const createdByUsername = authReq.username || authReq.user?.username || "system";
    const createdByName = authReq.user?.name || createdByUsername;
    const createdByRole = authReq.userRole || authReq.user?.role || "STAFF";

    const initialStatus = submitForApproval ? "PENDING_APPROVAL" : "DRAFT";
    const contentJson = JSON.stringify(parsedContent);

    // Build canonical v1 .docx binary & SHA-256 hash
    const docxArtifact = generateDocxBinaryBuffer({
      id: docId,
      document_code: docCode,
      title: title.trim(),
      document_type,
      department,
      layout_preset,
      custom_width_mm: safeCustomWidthMm,
      custom_height_mm: safeCustomHeightMm,
      status: initialStatus,
      blocks: parsedContent,
    });
    const docxPath = saveDocxArtifactToDisk(docId, 1, docxArtifact.buffer);

    const runTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO workspace_documents (
          id, document_code, title, document_type, created_by_user_id, created_by_username, created_by_name,
          department, content_format, current_version, content_json, docx_file_path, file_hash,
          layout_preset, custom_width_mm, custom_height_mm, authorization_role, authorization_department,
          authorization_user_name, status, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        docId,
        docCode,
        title.trim(),
        document_type,
        createdByUserId,
        createdByUsername,
        createdByName,
        department,
        content_format || "DOCX",
        contentJson,
        docxPath,
        docxArtifact.sha256,
        layout_preset,
        safeCustomWidthMm,
        safeCustomHeightMm,
        finalAuthRole,
        finalAuthDept,
        authorization_user_name,
        initialStatus,
        idempotency_key || null,
        nowIso,
        nowIso
      );

      const verId = `WSV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO workspace_document_versions (
          id, document_id, version, file_path, file_hash, file_size,
          content_json, created_by_user_id, created_by_username, change_summary, created_at
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        verId,
        docId,
        docxPath,
        docxArtifact.sha256,
        docxArtifact.size,
        contentJson,
        createdByUserId,
        createdByUsername,
        "Initial document version v1",
        nowIso
      );

      recordDocumentEvent({
        documentId: docId,
        actorUserId: createdByUserId,
        actorUsername: createdByUsername,
        actorRole: createdByRole,
        eventType: "CREATED",
        fromStatus: null,
        toStatus: "DRAFT",
        note: `Created document ${docCode}`,
        createdAt: nowIso,
      });

      if (submitForApproval) {
        recordDocumentEvent({
          documentId: docId,
          actorUserId: createdByUserId,
          actorUsername: createdByUsername,
          actorRole: createdByRole,
          eventType: "SUBMITTED",
          fromStatus: "DRAFT",
          toStatus: "PENDING_APPROVAL",
          note: `Submitted on creation to ${finalAuthDept} (${finalAuthRole})`,
          createdAt: nowIso,
        });
      }

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        docId,
        "CREATE",
        {
          id: docId,
          document_code: docCode,
          title: title.trim(),
          authorization_role: finalAuthRole,
          authorization_department: finalAuthDept,
          status: initialStatus,
          current_version: 1,
          file_hash: docxArtifact.sha256,
        }
      );
    });

    runTx();

    res.json({
      success: true,
      message: `Document ${docCode} created successfully.`,
      data: {
        id: docId,
        document_code: docCode,
        title: title.trim(),
        document_type,
        created_by_user_id: createdByUserId,
        created_by_username: createdByUsername,
        created_by_name: createdByName,
        department,
        content_format: content_format || "DOCX",
        current_version: 1,
        content: parsedContent,
        block_count: parsedContent.length,
        file_hash: docxArtifact.sha256,
        layout_preset,
        custom_width_mm: safeCustomWidthMm,
        custom_height_mm: safeCustomHeightMm,
        authorization_role: finalAuthRole,
        authorization_department: finalAuthDept,
        authorization_user_name,
        status: initialStatus,
        created_at: nowIso,
        updated_at: nowIso,
      },
    });
  } catch (err: any) {
    console.error("Error creating workspace document:", err);
    res.status(500).json({ error: "Failed to create document: " + err.message });
  }
});

// 5. Update Workspace Document (P0-01, P0-06, P0-07, P0-08, P0-09, P1-06)
workspaceDocumentsRouter.put("/api/workspace-documents/:id", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    // P0-07 Immutability Guard: APPROVED and ARCHIVED documents are permanently locked
    if (existing.status === "APPROVED" || existing.status === "ARCHIVED") {
      return res.status(403).json({
        error: `Forbidden: ${existing.status} documents are legally locked and immutable. Please clone or create a revision to make changes.`,
      });
    }

    // P0-01 Security Guard: Disallow status changes via general PUT endpoint
    if (req.body.status !== undefined && req.body.status !== existing.status) {
      return res.status(400).json({
        error: "Status cannot be changed via general update. Use workflow endpoints (/submit, /approve, /revise).",
      });
    }

    // P0-01 State Machine Guard: General edits only allowed in DRAFT or REVISION_REQUIRED
    if (existing.status !== "DRAFT" && existing.status !== "REVISION_REQUIRED") {
      return res.status(403).json({
        error: `Cannot edit document while in '${existing.status}' status. Cancel submission first or await approver review.`,
      });
    }

    // Strict Ownership Guard: Only the creator of this document can edit/continue it
    if (!canUserMutateDraft(existing, authReq)) {
      return res.status(403).json({
        error: "Forbidden: Anda tidak memiliki akses untuk mengedit atau melanjutkan dokumen milik pengguna lain.",
      });
    }

    const currentUsername = authReq.username || authReq.user?.username || "system";
    const currentUserId = authReq.userId || authReq.user?.id || "system";
    const currentUserRole = authReq.userRole || authReq.user?.role || "STAFF";

    // P0-08 Active Lock Guard
    const activeLock = getActiveLock(id);
    if (
      activeLock &&
      activeLock.locked_by_username !== currentUsername &&
      !isExecutiveOrFc(currentUserRole, authReq.userLevel)
    ) {
      return res.status(423).json({
        error: `Document is currently locked for editing by '${activeLock.locked_by_username}' until ${activeLock.expires_at}.`,
        code: "LOCKED_BY_OTHER_USER",
        locked_by: activeLock.locked_by_username,
        expires_at: activeLock.expires_at,
      });
    }

    // P0-08 Optimistic Concurrency Control (expected_version)
    if (
      req.body.expected_version !== undefined &&
      Number(req.body.expected_version) !== Number(existing.current_version || 1)
    ) {
      return res.status(409).json({
        error: `Version conflict: expected version ${req.body.expected_version}, but server is at version ${existing.current_version || 1}.`,
        code: "VERSION_CONFLICT",
        current_version: existing.current_version || 1,
      });
    }

    if (req.body.content !== undefined) {
      const blockCheck = parseAndValidateBlocks(req.body.content);
      if (!blockCheck.ok) {
        return res.status(400).json({
          error: blockCheck.error,
          fieldErrors: { content: [blockCheck.error] },
        });
      }
    }

    const validation = workspaceDocUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error:
          "Validation failed: " +
          validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        fieldErrors: validation.error.flatten().fieldErrors,
      });
    }

    const {
      title,
      document_type,
      department,
      content,
      content_format,
      layout_preset,
      custom_width_mm,
      custom_height_mm,
      authorization_role,
      authorization_department,
      authorization_user_name,
      change_summary,
    } = validation.data;

    const nowIso = new Date().toISOString();
    let contentJson = existing.content_json;
    let parsedBlocks: any[] = [];
    try {
      parsedBlocks = JSON.parse(existing.content_json || "[]");
    } catch (_) {}

    const explicitRoute = resolveRoleAndDept(authorization_department, authorization_role);
    let finalAuthRole = explicitRoute?.role || authorization_role || existing.authorization_role;
    let finalAuthDept = explicitRoute?.department || authorization_department || existing.authorization_department;

    if (content !== undefined) {
      const checked = parseAndValidateBlocks(content);
      if (!checked.ok) {
        return res.status(400).json({ error: checked.error });
      }
      parsedBlocks = checked.blocks;
      const autoRoute = extractRoutingFromContent(parsedBlocks);
      if (autoRoute) {
        finalAuthRole = autoRoute.role;
        finalAuthDept = autoRoute.department;
        parsedBlocks = synchronizeSignatureBlocksRouting(parsedBlocks, finalAuthDept, finalAuthRole);
      } else {
        finalAuthRole = "HR_MANAGER";
        finalAuthDept = "HR";
      }
      contentJson = JSON.stringify(parsedBlocks);
    } else if (explicitRoute) {
      parsedBlocks = synchronizeSignatureBlocksRouting(parsedBlocks, finalAuthDept, finalAuthRole);
      contentJson = JSON.stringify(parsedBlocks);
    }

    const nextVersion = Number(existing.current_version || 1) + 1;
    const nextTitle = title?.trim() || existing.title;
    const nextLayout = (layout_preset || existing.layout_preset || "A4_PORTRAIT") as any;
    const nextCustomWidthMm = Number(custom_width_mm ?? existing.custom_width_mm) || 210;
    const nextCustomHeightMm = Number(custom_height_mm ?? existing.custom_height_mm) || 297;

    const docxArtifact = generateDocxBinaryBuffer({
      id,
      document_code: existing.document_code,
      title: nextTitle,
      document_type: document_type || existing.document_type,
      department: department || existing.department,
      layout_preset: nextLayout,
      custom_width_mm: nextCustomWidthMm,
      custom_height_mm: nextCustomHeightMm,
      status: existing.status,
      blocks: parsedBlocks,
    });
    const docxPath = saveDocxArtifactToDisk(id, nextVersion, docxArtifact.buffer);

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE workspace_documents SET
          title = COALESCE(?, title),
          document_type = COALESCE(?, document_type),
          department = COALESCE(?, department),
          content_format = COALESCE(?, content_format),
          current_version = ?,
          content_json = ?,
          docx_file_path = ?,
          file_hash = ?,
          layout_preset = COALESCE(?, layout_preset),
          custom_width_mm = ?,
          custom_height_mm = ?,
          authorization_role = COALESCE(?, authorization_role),
          authorization_department = COALESCE(?, authorization_department),
          authorization_user_name = COALESCE(?, authorization_user_name),
          updated_at = ?
        WHERE id = ?
      `).run(
        title?.trim() || null,
        document_type || null,
        department || null,
        content_format || null,
        nextVersion,
        contentJson,
        docxPath,
        docxArtifact.sha256,
        layout_preset || null,
        nextCustomWidthMm,
        nextCustomHeightMm,
        finalAuthRole || null,
        finalAuthDept || null,
        authorization_user_name ?? null,
        nowIso,
        id
      );

      const verId = `WSV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO workspace_document_versions (
          id, document_id, version, file_path, file_hash, file_size,
          content_json, created_by_user_id, created_by_username, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        verId,
        id,
        nextVersion,
        docxPath,
        docxArtifact.sha256,
        docxArtifact.size,
        contentJson,
        currentUserId,
        currentUsername,
        change_summary || `Updated document to v${nextVersion}`,
        nowIso
      );

      recordDocumentEvent({
        documentId: id,
        actorUserId: currentUserId,
        actorUsername: currentUsername,
        actorRole: currentUserRole,
        eventType: "UPDATED",
        fromStatus: existing.status,
        toStatus: existing.status,
        note: change_summary || `Saved revision v${nextVersion}`,
        createdAt: nowIso,
      });

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        {
          id,
          title: nextTitle,
          current_version: nextVersion,
          file_hash: docxArtifact.sha256,
          authorization_role: finalAuthRole,
          authorization_department: finalAuthDept,
          status: existing.status,
        }
      );
    });

    runTx();

    res.json({
      success: true,
      message: `Document ${existing.document_code} updated (v${nextVersion}).`,
      data: {
        id,
        document_code: existing.document_code,
        title: nextTitle,
        document_type: document_type || existing.document_type,
        created_by_user_id: existing.created_by_user_id,
        created_by_username: existing.created_by_username,
        created_by_name: existing.created_by_name,
        department: department || existing.department,
        content_format: content_format || existing.content_format || "DOCX",
        current_version: nextVersion,
        content: parsedBlocks,
        block_count: parsedBlocks.length,
        file_hash: docxArtifact.sha256,
        layout_preset: nextLayout,
        authorization_role: finalAuthRole,
        authorization_department: finalAuthDept,
        authorization_user_name: authorization_user_name ?? existing.authorization_user_name,
        status: existing.status,
        created_at: existing.created_at,
        updated_at: nowIso,
      },
    });
  } catch (err: any) {
    console.error("Error updating workspace document:", err);
    res.status(500).json({ error: "Failed to update document: " + err.message });
  }
});

// 6. Submit Document for Approval (Atomic transaction + RBAC owner check + Idempotency) (P0-02, P0-04, P1-06)
const handleSubmitApproval = (req: any, res: any) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    const idempotencyKey =
      req.body?.idempotency_key || (req.headers["x-idempotency-key"] as string) || null;

    // Idempotent replay support
    if (
      existing.status === "PENDING_APPROVAL" &&
      idempotencyKey &&
      existing.idempotency_key === idempotencyKey
    ) {
      return res.json({
        success: true,
        idempotent: true,
        message: `Document ${existing.document_code} already submitted (idempotent).`,
        data: {
          id,
          status: "PENDING_APPROVAL",
          current_version: existing.current_version || 1,
          authorization_role: existing.authorization_role,
          authorization_department: existing.authorization_department,
        },
      });
    }

    if (existing.status === "APPROVED" || existing.status === "ARCHIVED") {
      return res.status(400).json({ error: `Cannot submit an already ${existing.status} document.` });
    }

    if (existing.status !== "DRAFT" && existing.status !== "REVISION_REQUIRED") {
      return res.status(400).json({
        error: `Cannot submit document from status '${existing.status}'. Must be DRAFT or REVISION_REQUIRED.`,
      });
    }

    // P0-02 Owner or FC/Admin verification
    if (!canUserMutateDraft(existing, authReq)) {
      return res.status(403).json({
        error: "Forbidden: Only the document creator or FC can submit this document for approval.",
      });
    }

    const {
      content,
      title,
      department,
      layout_preset,
      custom_width_mm,
      custom_height_mm,
      authorization_role,
      authorization_department,
      authorization_user_name,
    } = req.body || {};
    const nowIso = new Date().toISOString();

    let contentJson = existing.content_json;
    let parsedBlocks: any[] = [];
    try {
      parsedBlocks = JSON.parse(existing.content_json || "[]");
    } catch (_) {}

    const explicitRoute = resolveRoleAndDept(authorization_department, authorization_role);
    let finalAuthRole = explicitRoute?.role || authorization_role || existing.authorization_role;
    let finalAuthDept = explicitRoute?.department || authorization_department || existing.authorization_department;

    if (content !== undefined) {
      const checked = parseAndValidateBlocks(content);
      if (!checked.ok) {
        return res.status(400).json({ error: checked.error });
      }
      parsedBlocks = checked.blocks;
      const autoRoute = extractRoutingFromContent(parsedBlocks);
      if (autoRoute) {
        finalAuthRole = autoRoute.role;
        finalAuthDept = autoRoute.department;
        parsedBlocks = synchronizeSignatureBlocksRouting(parsedBlocks, finalAuthDept, finalAuthRole);
      } else {
        finalAuthRole = "HR_MANAGER";
        finalAuthDept = "HR";
      }
      contentJson = JSON.stringify(parsedBlocks);
    } else {
      const autoRoute = extractRoutingFromContent(parsedBlocks);
      if (autoRoute) {
        finalAuthRole = autoRoute.role;
        finalAuthDept = autoRoute.department;
        parsedBlocks = synchronizeSignatureBlocksRouting(parsedBlocks, finalAuthDept, finalAuthRole);
      } else {
        finalAuthRole = "HR_MANAGER";
        finalAuthDept = "HR";
      }
      contentJson = JSON.stringify(parsedBlocks);
    }

    const currentUserId = authReq.userId || authReq.user?.id || "system";
    const currentUsername = authReq.username || authReq.user?.username || "system";
    const currentUserRole = authReq.userRole || authReq.user?.role || "STAFF";
    const nextVersion = Number(existing.current_version || 1) + 1;
    const nextTitle = title?.trim() || existing.title;
    const nextCustomWidthMm = Number(custom_width_mm ?? existing.custom_width_mm) || 210;
    const nextCustomHeightMm = Number(custom_height_mm ?? existing.custom_height_mm) || 297;

    const docxArtifact = generateDocxBinaryBuffer({
      id,
      document_code: existing.document_code,
      title: nextTitle,
      document_type: existing.document_type,
      department: department || existing.department,
      layout_preset: (layout_preset || existing.layout_preset || "A4_PORTRAIT") as any,
      custom_width_mm: nextCustomWidthMm,
      custom_height_mm: nextCustomHeightMm,
      status: "PENDING_APPROVAL",
      blocks: parsedBlocks,
    });
    const docxPath = saveDocxArtifactToDisk(id, nextVersion, docxArtifact.buffer);

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE workspace_documents SET
          title = COALESCE(?, title),
          department = COALESCE(?, department),
          layout_preset = COALESCE(?, layout_preset),
          custom_width_mm = ?,
          custom_height_mm = ?,
          current_version = ?,
          content_json = ?,
          docx_file_path = ?,
          file_hash = ?,
          authorization_role = ?,
          authorization_department = ?,
          authorization_user_name = COALESCE(?, authorization_user_name),
          status = 'PENDING_APPROVAL',
          idempotency_key = COALESCE(?, idempotency_key),
          updated_at = ?
        WHERE id = ?
      `).run(
        title?.trim() || null,
        department || null,
        layout_preset || null,
        nextCustomWidthMm,
        nextCustomHeightMm,
        nextVersion,
        contentJson,
        docxPath,
        docxArtifact.sha256,
        finalAuthRole,
        finalAuthDept,
        authorization_user_name ?? null,
        idempotencyKey,
        nowIso,
        id
      );

      const verId = `WSV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO workspace_document_versions (
          id, document_id, version, file_path, file_hash, file_size,
          content_json, created_by_user_id, created_by_username, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        verId,
        id,
        nextVersion,
        docxPath,
        docxArtifact.sha256,
        docxArtifact.size,
        contentJson,
        currentUserId,
        currentUsername,
        `Submitted for approval to ${finalAuthDept} (${finalAuthRole})`,
        nowIso
      );

      recordDocumentEvent({
        documentId: id,
        actorUserId: currentUserId,
        actorUsername: currentUsername,
        actorRole: currentUserRole,
        eventType: "SUBMITTED",
        fromStatus: existing.status,
        toStatus: "PENDING_APPROVAL",
        note: `Submitted to ${finalAuthDept} (${finalAuthRole})`,
        createdAt: nowIso,
      });

      // Clear editing lock upon submission
      db.prepare("DELETE FROM workspace_document_locks WHERE document_id = ?").run(id);

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        {
          id,
          status: "PENDING_APPROVAL",
          current_version: nextVersion,
          file_hash: docxArtifact.sha256,
          authorization_role: finalAuthRole,
          authorization_department: finalAuthDept,
        }
      );
    });

    runTx();

    res.json({
      success: true,
      message: `Document ${existing.document_code} submitted for ${finalAuthRole} approval.`,
      data: {
        id,
        status: "PENDING_APPROVAL",
        current_version: nextVersion,
        file_hash: docxArtifact.sha256,
        authorization_role: finalAuthRole,
        authorization_department: finalAuthDept,
      },
    });
  } catch (err: any) {
    console.error("Error submitting document for approval:", err);
    res.status(500).json({ error: "Failed to submit document: " + err.message });
  }
};

workspaceDocumentsRouter.post("/api/workspace-documents/:id/submit", handleSubmitApproval);
workspaceDocumentsRouter.post("/api/workspace-documents/:id/submit-approval", handleSubmitApproval);

// 7. Approve Document (P0-02, P0-03, P0-07, P1-06)
workspaceDocumentsRouter.post("/api/workspace-documents/:id/approve", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (existing.status !== "PENDING_APPROVAL") {
      return res.status(400).json({
        error: `Cannot approve document with status '${existing.status}'. Only PENDING_APPROVAL documents can be approved.`,
      });
    }

    // P0-02 Department RBAC & Level Enforcement + SLA Escalation Override
    const userRole = authReq.userRole || authReq.user?.role || "";
    const userLevel = authReq.userLevel || authReq.user?.level || "STAFF";
    const authDept = existing.authorization_department || existing.department;
    const escalatedTo = existing.escalated_to || "";

    const isEscalatedTarget =
      escalatedTo &&
      (canUserApproveDepartment(userRole, escalatedTo, userLevel) ||
        userRole.toUpperCase() === escalatedTo.toUpperCase());

    if (
      !canUserApproveDepartment(userRole, authDept, userLevel) &&
      !canUserApproveDepartment(userRole, existing.authorization_role, userLevel) &&
      !isEscalatedTarget
    ) {
      return res.status(403).json({
        error: `Unauthorized: User role '${userRole}' (${userLevel}) does not have authority to approve documents for department '${authDept}' or role '${existing.authorization_role}'. Minimum SUPERVISOR or MANAGER level required.`,
      });
    }

    // P0-03 Verified identity strictly from JWT session
    const approverUserId = authReq.userId || authReq.user?.id || "system";
    const approverUsername = authReq.username || authReq.user?.username || "approver";
    const approverName = authReq.user?.name || approverUsername || "Authorized Approver";
    const nowIso = new Date().toISOString();

    // Optional 6-digit Daily Auth Key verification (when submitted from ERP AuthorizeDocModal)
    const rawPin = req.body?.pin || req.body?.daily_key || req.body?.authPin;
    if (rawPin && typeof rawPin === "string" && rawPin.trim() !== "") {
      if (!isValidDailyAuthKey(approverUsername, rawPin.trim())) {
        return res.status(400).json({
          error: "Invalid 6-digit Daily Auth Key. Please verify your active daily key in your profile header.",
        });
      }
    }
    const approvalNote = typeof req.body?.approval_note === "string" ? req.body.approval_note.trim() : "";

    let parsedBlocks: any[] = [];
    try {
      parsedBlocks = JSON.parse(existing.content_json || "[]");
    } catch (_) {}

    const curVer = Number(existing.current_version || 1);
    const docxArtifact = generateDocxBinaryBuffer({
      id,
      document_code: existing.document_code,
      title: existing.title,
      document_type: existing.document_type,
      department: existing.department,
      layout_preset: existing.layout_preset || "A4_PORTRAIT",
      custom_width_mm: existing.custom_width_mm,
      custom_height_mm: existing.custom_height_mm,
      status: "APPROVED",
      blocks: parsedBlocks,
    });
    const docxPath = saveDocxArtifactToDisk(id, curVer, docxArtifact.buffer);

    const pdfArtifact = generateDeterministicPdfBuffer({
      id,
      document_code: existing.document_code,
      title: existing.title,
      document_type: existing.document_type,
      department: existing.department,
      layout_preset: existing.layout_preset || "A4_PORTRAIT",
      custom_width_mm: existing.custom_width_mm,
      custom_height_mm: existing.custom_height_mm,
      status: "APPROVED",
      authorization_department: existing.authorization_department,
      authorization_role: existing.authorization_role,
      approved_by: approverName,
      approved_at: nowIso,
      blocks: parsedBlocks,
    });
    const pdfPath = savePdfArtifactToDisk(id, curVer, pdfArtifact.buffer);

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE workspace_documents SET
          status = 'APPROVED',
          approved_by = ?,
          approved_by_user_id = ?,
          approved_by_username = ?,
          approved_by_role = ?,
          approved_at = ?,
          docx_file_path = ?,
          pdf_file_path = ?,
          file_hash = ?,
          approved_file_hash = ?,
          revision_note = NULL,
          locked_by_user_id = NULL,
          locked_by_username = NULL,
          locked_at = NULL,
          lock_expires_at = NULL,
          updated_at = ?
        WHERE id = ?
      `).run(
        approverName,
        approverUserId,
        approverUsername,
        userRole,
        nowIso,
        docxPath,
        pdfPath,
        docxArtifact.sha256,
        pdfArtifact.sha256,
        nowIso,
        id
      );

      db.prepare("DELETE FROM workspace_document_locks WHERE document_id = ?").run(id);

      try {
        db.prepare(`
          UPDATE workflow_approvals
          SET status = 'APPROVED', updated_at = ?
          WHERE document_type = 'Workspace Document' AND document_id = ?
        `).run(nowIso, id);
      } catch (_) {}

      recordDocumentEvent({
        documentId: id,
        actorUserId: approverUserId,
        actorUsername: approverUsername,
        actorRole: userRole,
        eventType: "APPROVED",
        fromStatus: "PENDING_APPROVAL",
        toStatus: "APPROVED",
        note: `Approved by ${approverName} (${userRole})${approvalNote ? ` — Note: ${approvalNote}` : ""}. SHA-256: ${pdfArtifact.sha256.slice(0, 16)}`,
        createdAt: nowIso,
      });

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        {
          id,
          status: "APPROVED",
          approved_by: approverName,
          approved_by_username: approverUsername,
          approved_by_role: userRole,
          approved_at: nowIso,
          file_hash: docxArtifact.sha256,
          approved_file_hash: pdfArtifact.sha256,
        }
      );
    });

    runTx();

    res.json({
      success: true,
      message: `Document ${existing.document_code} has been officially APPROVED by ${approverName}.`,
      data: {
        id,
        status: "APPROVED",
        approved_by: approverName,
        approved_by_user_id: approverUserId,
        approved_by_username: approverUsername,
        approved_by_role: userRole,
        approved_at: nowIso,
        file_hash: docxArtifact.sha256,
        approved_file_hash: pdfArtifact.sha256,
      },
    });
  } catch (err: any) {
    console.error("Error approving workspace document:", err);
    res.status(500).json({ error: "Failed to approve document: " + err.message });
  }
});

// 8. Request Revision / Reject Document (P0-02, P0-03, P1-06)
workspaceDocumentsRouter.post("/api/workspace-documents/:id/revise", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { revision_note } = req.body || {};

    if (!revision_note || typeof revision_note !== "string" || !revision_note.trim()) {
      return res.status(400).json({ error: "Revision note is required." });
    }

    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (existing.status !== "PENDING_APPROVAL") {
      return res.status(400).json({
        error: `Cannot request revision for document with status '${existing.status}'. Only PENDING_APPROVAL documents can be sent for revision.`,
      });
    }

    const userRole = authReq.userRole || authReq.user?.role || "";
    const authDept = existing.authorization_department || existing.department;

    if (
      !canUserApproveDepartment(userRole, authDept) &&
      !canUserApproveDepartment(userRole, existing.authorization_role)
    ) {
      return res.status(403).json({
        error: `Unauthorized: User role '${userRole}' does not have authority to reject/revise documents for department '${authDept}'.`,
      });
    }

    const reviserUserId = authReq.userId || authReq.user?.id || "system";
    const reviserUsername = authReq.username || authReq.user?.username || "manager";
    const reviserName = authReq.user?.name || reviserUsername || "Manager";
    const nowIso = new Date().toISOString();
    const formattedNote = `[${reviserName} (${userRole}) @ ${new Date().toLocaleDateString("id-ID")}] ${revision_note.trim()}`;

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE workspace_documents SET
          status = 'REVISION_REQUIRED',
          revision_note = ?,
          updated_at = ?
        WHERE id = ?
      `).run(formattedNote, nowIso, id);

      recordDocumentEvent({
        documentId: id,
        actorUserId: reviserUserId,
        actorUsername: reviserUsername,
        actorRole: userRole,
        eventType: "REVISION_REQUESTED",
        fromStatus: "PENDING_APPROVAL",
        toStatus: "REVISION_REQUIRED",
        note: formattedNote,
        createdAt: nowIso,
      });

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        { id, status: "REVISION_REQUIRED", revision_note: formattedNote }
      );
    });

    runTx();

    res.json({
      success: true,
      message: `Document ${existing.document_code} status set to Revision Required.`,
      data: {
        id,
        status: "REVISION_REQUIRED",
        revision_note: formattedNote,
      },
    });
  } catch (err: any) {
    console.error("Error requesting revision for workspace document:", err);
    res.status(500).json({ error: "Failed to request revision: " + err.message });
  }
});

// 9. Clone Document (for creating a new revision draft from an APPROVED document)
workspaceDocumentsRouter.post("/api/workspace-documents/:id/clone", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (!canUserMutateDraft(existing, authReq)) {
      return res.status(403).json({
        error: "Forbidden: Anda tidak dapat melanjutkan atau membuat revisi dari dokumen milik pengguna lain.",
      });
    }

    const newDocId = "WSD-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
    const newDocCode = generateNextDocumentCode();
    const nowIso = new Date().toISOString();

    const createdByUserId = authReq.userId || authReq.user?.id || "system";
    const createdByUsername = authReq.username || authReq.user?.username || "system";
    const createdByName = authReq.user?.name || createdByUsername;
    const createdByRole = authReq.userRole || authReq.user?.role || "STAFF";
    const newTitle = existing.status === "APPROVED" ? `[Revisi] ${existing.title}` : `${existing.title} (Salinan)`;

    let parsedBlocks: any[] = [];
    try {
      parsedBlocks = JSON.parse(existing.content_json || "[]");
    } catch (_) {}

    const docxArtifact = generateDocxBinaryBuffer({
      id: newDocId,
      document_code: newDocCode,
      title: newTitle,
      document_type: existing.document_type,
      department: existing.department,
      layout_preset: existing.layout_preset || "A4_PORTRAIT",
      status: "DRAFT",
      blocks: parsedBlocks,
    });
    const docxPath = saveDocxArtifactToDisk(newDocId, 1, docxArtifact.buffer);

    const runTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO workspace_documents (
          id, document_code, title, document_type, created_by_user_id, created_by_username, created_by_name,
          department, content_format, current_version, content_json, docx_file_path, file_hash,
          layout_preset, authorization_role, authorization_department,
          authorization_user_name, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DOCX', 1, ?, ?, ?, ?, ?, ?, '', 'DRAFT', ?, ?)
      `).run(
        newDocId,
        newDocCode,
        newTitle,
        existing.document_type,
        createdByUserId,
        createdByUsername,
        createdByName,
        existing.department,
        existing.content_json,
        docxPath,
        docxArtifact.sha256,
        existing.layout_preset,
        existing.authorization_role,
        existing.authorization_department,
        nowIso,
        nowIso
      );

      const verId = `WSV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO workspace_document_versions (
          id, document_id, version, file_path, file_hash, file_size,
          content_json, created_by_user_id, created_by_username, change_summary, created_at
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        verId,
        newDocId,
        docxPath,
        docxArtifact.sha256,
        docxArtifact.size,
        existing.content_json,
        createdByUserId,
        createdByUsername,
        `Cloned from ${existing.document_code}`,
        nowIso
      );

      recordDocumentEvent({
        documentId: newDocId,
        actorUserId: createdByUserId,
        actorUsername: createdByUsername,
        actorRole: createdByRole,
        eventType: "CREATED",
        fromStatus: null,
        toStatus: "DRAFT",
        note: `Cloned from ${existing.document_code} (${existing.id})`,
        createdAt: nowIso,
      });

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        newDocId,
        "CREATE",
        {
          id: newDocId,
          document_code: newDocCode,
          title: newTitle,
          status: "DRAFT",
          cloned_from: existing.id,
        }
      );
    });

    runTx();

    res.json({
      success: true,
      message: `Document cloned as new draft ${newDocCode}.`,
      data: {
        id: newDocId,
        document_code: newDocCode,
        title: newTitle,
        status: "DRAFT",
        current_version: 1,
        file_hash: docxArtifact.sha256,
      },
    });
  } catch (err: any) {
    console.error("Error cloning document:", err);
    res.status(500).json({ error: "Failed to clone document: " + err.message });
  }
});

// 10. Delete Document (P0-07)
workspaceDocumentsRouter.delete("/api/workspace-documents/:id", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    // P0-07 Immutability Guard: APPROVED, ARCHIVED, or PENDING_APPROVAL documents cannot be deleted
    if (existing.status === "APPROVED" || existing.status === "ARCHIVED") {
      return res.status(403).json({
        error: `Forbidden: ${existing.status} documents are legally locked and immutable records. They cannot be deleted.`,
      });
    }

    if (existing.status === "PENDING_APPROVAL") {
      return res.status(403).json({
        error: "Forbidden: Cannot delete a document while in PENDING_APPROVAL. Cancel submission first.",
      });
    }

    if (!canUserMutateDraft(existing, authReq)) {
      return res.status(403).json({
        error: "Forbidden: Anda tidak dapat menghapus dokumen milik pengguna lain.",
      });
    }

    const runTx = db.transaction(() => {
      db.prepare("DELETE FROM workspace_document_locks WHERE document_id = ?").run(id);
      db.prepare("DELETE FROM workspace_document_versions WHERE document_id = ?").run(id);
      db.prepare("DELETE FROM workspace_document_events WHERE document_id = ?").run(id);
      db.prepare("DELETE FROM workspace_documents WHERE id = ?").run(id);

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        id,
        "DELETE",
        { id, document_code: existing.document_code }
      );
    });

    runTx();

    res.json({ success: true, message: `Document ${existing.document_code} deleted.` });
  } catch (err: any) {
    console.error("Error deleting workspace document:", err);
    res.status(500).json({ error: "Failed to delete document: " + err.message });
  }
});

// 11. Cancel Submission (revert from PENDING_APPROVAL back to DRAFT)
workspaceDocumentsRouter.post("/api/workspace-documents/:id/cancel-submission", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (existing.status !== "PENDING_APPROVAL") {
      return res.status(400).json({
        error: "Only documents with status PENDING_APPROVAL can have submission cancelled.",
      });
    }

    if (!canUserMutateDraft(existing, authReq)) {
      return res.status(403).json({ error: "Forbidden: Only author or Admin can cancel submission." });
    }

    const actorUserId = authReq.userId || authReq.user?.id || "system";
    const actorUsername = authReq.username || authReq.user?.username || "system";
    const actorRole = authReq.userRole || authReq.user?.role || "STAFF";
    const nowIso = new Date().toISOString();

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE workspace_documents
        SET status = 'DRAFT', idempotency_key = NULL, updated_at = ?
        WHERE id = ?
      `).run(nowIso, id);

      recordDocumentEvent({
        documentId: id,
        actorUserId,
        actorUsername,
        actorRole,
        eventType: "CANCELLED_SUBMISSION",
        fromStatus: "PENDING_APPROVAL",
        toStatus: "DRAFT",
        note: "Submission cancelled by author; reverted to DRAFT",
        createdAt: nowIso,
      });

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        { id, status: "DRAFT" }
      );
    });

    runTx();

    res.json({
      success: true,
      message: "Document submission cancelled, reverted to DRAFT.",
      data: { id, status: "DRAFT" },
    });
  } catch (err: any) {
    console.error("Error cancelling submission:", err);
    res.status(500).json({ error: err.message });
  }
});

// 12. Archive Document (Strictly APPROVED -> ARCHIVED, FC / Admin only)
workspaceDocumentsRouter.post("/api/workspace-documents/:id/archive", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    const userRole = authReq.userRole || authReq.user?.role || "";
    if (!isExecutiveOrFc(userRole, authReq.userLevel)) {
      return res.status(403).json({
        error: "Forbidden: Only Factory Controller (FC) or Admin can archive approved documents.",
      });
    }

    if (existing.status !== "APPROVED") {
      return res.status(400).json({
        error: `Only APPROVED documents can be archived (current status: '${existing.status}').`,
      });
    }

    const actorUserId = authReq.userId || authReq.user?.id || "system";
    const actorUsername = authReq.username || authReq.user?.username || "system";
    const nowIso = new Date().toISOString();

    const runTx = db.transaction(() => {
      db.prepare(`UPDATE workspace_documents SET status = 'ARCHIVED', updated_at = ? WHERE id = ?`).run(
        nowIso,
        id
      );

      recordDocumentEvent({
        documentId: id,
        actorUserId,
        actorUsername,
        actorRole: userRole,
        eventType: "ARCHIVED",
        fromStatus: "APPROVED",
        toStatus: "ARCHIVED",
        note: "Archived by Factory Controller / Admin",
        createdAt: nowIso,
      });

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        { id, status: "ARCHIVED" }
      );
    });

    runTx();

    res.json({
      success: true,
      message: "Document archived successfully.",
      data: { id, status: "ARCHIVED" },
    });
  } catch (err: any) {
    console.error("Error archiving document:", err);
    res.status(500).json({ error: err.message });
  }
});

// 13. Heartbeat Lock for Multi-User Safety (P0-08 / P0-09)
workspaceDocumentsRouter.post("/api/workspace-documents/:id/lock", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const currentUserId = authReq.userId || authReq.user?.id || "unknown";
    const currentUsername = authReq.username || authReq.user?.username || "unknown_user";
    const currentUserRole = authReq.userRole || authReq.user?.role || "STAFF";
    const forceTakeover = Boolean(req.body?.force) && isExecutiveOrFc(currentUserRole, authReq.userLevel);
    const action = req.body?.action || "acquire";

    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    const activeLock = getActiveLock(id);

    if (action === "release" || action === "unlock") {
      if (
        activeLock &&
        activeLock.locked_by_username !== currentUsername &&
        !forceTakeover &&
        !isExecutiveOrFc(currentUserRole, authReq.userLevel)
      ) {
        return res.status(403).json({ error: "Cannot release a lock owned by another user." });
      }
      db.prepare("DELETE FROM workspace_document_locks WHERE document_id = ?").run(id);
      db.prepare(`
        UPDATE workspace_documents
        SET locked_by_user_id = NULL, locked_by_username = NULL, locked_at = NULL, lock_expires_at = NULL
        WHERE id = ?
      `).run(id);
      return res.json({ success: true, locked: false, message: "Lock released." });
    }

    if (existing.status === "APPROVED" || existing.status === "ARCHIVED") {
      return res.status(409).json({ error: `Cannot lock an ${existing.status} document: immutable record.` });
    }

    if (activeLock && activeLock.locked_by_username !== currentUsername && !forceTakeover) {
      return res.status(423).json({
        error: `Document is already locked by '${activeLock.locked_by_username}' until ${activeLock.expires_at}.`,
        code: "LOCKED_BY_OTHER_USER",
        locked_by: activeLock.locked_by_username,
        expires_at: activeLock.expires_at,
      });
    }

    if (!canUserMutateDraft(existing, authReq)) {
      return res.status(403).json({
        error: "Forbidden: Anda tidak dapat mengunci atau mengedit dokumen milik pengguna lain.",
      });
    }

    const now = new Date();
    const expires = new Date(now.getTime() + 120000); // 2 minutes heartbeat
    const nowIso = now.toISOString();
    const expIso = expires.toISOString();

    const runTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO workspace_document_locks (document_id, locked_by_user_id, locked_by_username, locked_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
          locked_by_user_id = excluded.locked_by_user_id,
          locked_by_username = excluded.locked_by_username,
          locked_at = excluded.locked_at,
          expires_at = excluded.expires_at
      `).run(id, currentUserId, currentUsername, nowIso, expIso);

      db.prepare(`
        UPDATE workspace_documents
        SET locked_by_user_id = ?, locked_by_username = ?, locked_at = ?, lock_expires_at = ?
        WHERE id = ?
      `).run(currentUserId, currentUsername, nowIso, expIso, id);
    });

    runTx();

    res.json({
      success: true,
      locked: true,
      data: {
        document_id: id,
        locked_by: currentUsername,
        locked_by_user_id: currentUserId,
        locked_at: nowIso,
        expires_at: expIso,
      },
    });
  } catch (err: any) {
    console.error("Error updating document lock:", err);
    res.status(500).json({ error: err.message });
  }
});

// 13b. Release Lock
workspaceDocumentsRouter.delete("/api/workspace-documents/:id/lock", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const currentUsername = authReq.username || authReq.user?.username || "";
    const currentUserRole = authReq.userRole || authReq.user?.role || "";

    const activeLock = getActiveLock(id);
    if (
      activeLock &&
      activeLock.locked_by_username !== currentUsername &&
      !isExecutiveOrFc(currentUserRole, authReq.userLevel)
    ) {
      return res.status(403).json({ error: "Cannot release a lock owned by another user." });
    }

    db.prepare("DELETE FROM workspace_document_locks WHERE document_id = ?").run(id);
    db.prepare(`
      UPDATE workspace_documents
      SET locked_by_user_id = NULL, locked_by_username = NULL, locked_at = NULL, lock_expires_at = NULL
      WHERE id = ?
    `).run(id);

    res.json({ success: true, message: "Lock released." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Document Version History (P0-09)
workspaceDocumentsRouter.get("/api/workspace-documents/:id/versions", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }
    if (!canUserReadDocument(existing, authReq)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const rawVersions: any[] = db
      .prepare(`
        SELECT * FROM workspace_document_versions
        WHERE document_id = ?
        ORDER BY version DESC
      `)
      .all(id);

    const versions = rawVersions.map((v) => ({
      ...v,
      documentId: v.document_id,
      contentHash: v.file_hash,
      docxPath: v.file_path,
      createdBy: v.created_by_user_id,
      createdByName: v.created_by_username,
      changeSummary: v.change_summary,
      createdAt: v.created_at,
    }));

    res.json({ success: true, data: versions, versions });
  } catch (err: any) {
    console.error("Error fetching document versions:", err);
    res.status(500).json({ error: err.message });
  }
});

// 14b. Document Audit Events History (P1-07)
workspaceDocumentsRouter.get("/api/workspace-documents/:id/events", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }
    if (!canUserReadDocument(existing, authReq)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const rawEvents: any[] = db
      .prepare(`
        SELECT * FROM workspace_document_events
        WHERE document_id = ?
        ORDER BY created_at DESC
      `)
      .all(id);

    const events = rawEvents.map((e) => ({
      ...e,
      documentId: e.document_id,
      eventType: e.event_type,
      actorId: e.actor_user_id,
      actorName: e.actor_username,
      actorRole: e.actor_role,
      previousStatus: e.from_status,
      nextStatus: e.to_status,
      notes: e.note,
      createdAt: e.created_at,
    }));

    res.json({ success: true, data: events, events });
  } catch (err: any) {
    console.error("Error fetching document events:", err);
    res.status(500).json({ error: err.message });
  }
});

// 15. Restore Document Version (P0-09 & P1-06)
const handleRestoreVersion = (req: any, res: any) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const version = req.params.version ?? req.body?.version;

    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (existing.status === "APPROVED" || existing.status === "ARCHIVED" || existing.status === "PENDING_APPROVAL") {
      return res.status(403).json({
        error: `Cannot restore version while document is in '${existing.status}' status.`,
      });
    }

    if (!canUserMutateDraft(existing, authReq)) {
      return res.status(403).json({
        error: "Forbidden: Only the document author or Factory Controller can restore versions.",
      });
    }

    const targetVersion: any = db
      .prepare(`
        SELECT * FROM workspace_document_versions
        WHERE document_id = ? AND version = ?
      `)
      .get(id, Number(version));

    if (!targetVersion) {
      return res.status(404).json({ error: `Version ${version} not found for document.` });
    }

    let restoredBlocks: any[] = [];
    try {
      restoredBlocks = JSON.parse(targetVersion.content_json || "[]");
    } catch (_) {}

    const currentUserId = authReq.userId || authReq.user?.id || "system";
    const currentUsername = authReq.username || authReq.user?.username || "system";
    const currentUserRole = authReq.userRole || authReq.user?.role || "STAFF";
    const nextVersion = Number(existing.current_version || 1) + 1;
    const nowIso = new Date().toISOString();

    const docxArtifact = generateDocxBinaryBuffer({
      id,
      document_code: existing.document_code,
      title: existing.title,
      document_type: existing.document_type,
      department: existing.department,
      layout_preset: existing.layout_preset || "A4_PORTRAIT",
      status: existing.status,
      blocks: restoredBlocks,
    });
    const docxPath = saveDocxArtifactToDisk(id, nextVersion, docxArtifact.buffer);

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE workspace_documents
        SET content_json = ?, current_version = ?, docx_file_path = ?, file_hash = ?, updated_at = ?
        WHERE id = ?
      `).run(targetVersion.content_json, nextVersion, docxPath, docxArtifact.sha256, nowIso, id);

      const verId = `WSV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO workspace_document_versions (
          id, document_id, version, file_path, file_hash, file_size,
          content_json, created_by_user_id, created_by_username, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        verId,
        id,
        nextVersion,
        docxPath,
        docxArtifact.sha256,
        docxArtifact.size,
        targetVersion.content_json,
        currentUserId,
        currentUsername,
        `Restored from v${version} as v${nextVersion}`,
        nowIso
      );

      recordDocumentEvent({
        documentId: id,
        actorUserId: currentUserId,
        actorUsername: currentUsername,
        actorRole: currentUserRole,
        eventType: "VERSION_RESTORED",
        fromStatus: existing.status,
        toStatus: existing.status,
        note: `Restored content from version ${version} into version ${nextVersion}`,
        createdAt: nowIso,
      });

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        {
          id,
          current_version: nextVersion,
          file_hash: docxArtifact.sha256,
          restored_from_version: Number(version),
        }
      );
    });

    runTx();

    const updatedDoc = {
      id,
      version: nextVersion,
      current_version: nextVersion,
      restored_from: Number(version),
      file_hash: docxArtifact.sha256,
      content: restoredBlocks,
    };

    res.json({
      success: true,
      message: `Restored document to version ${version} (saved as revision v${nextVersion}).`,
      data: updatedDoc,
      document: updatedDoc,
    });
  } catch (err: any) {
    console.error("Error restoring document version:", err);
    res.status(500).json({ error: err.message });
  }
};

workspaceDocumentsRouter.post("/api/workspace-documents/:id/restore-version", handleRestoreVersion);
workspaceDocumentsRouter.post("/api/workspace-documents/:id/versions/:version/restore", handleRestoreVersion);

// 15b. Migrate Legacy Blocks to Canonical DOCX Format (Section 8.7)
workspaceDocumentsRouter.post("/api/workspace-documents/:id/migrate-docx", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (!canUserMutateDraft(existing, authReq)) {
      return res.status(403).json({ error: "Forbidden: Hanya pembuat dokumen yang dapat mengubah format dokumen ini." });
    }

    let parsedBlocks: any[] = [];
    try {
      parsedBlocks = JSON.parse(existing.content_json || "[]");
    } catch (_) {}

    const currentUserId = authReq.userId || authReq.user?.id || "system";
    const currentUsername = authReq.username || authReq.user?.username || "system";
    const currentUserRole = authReq.userRole || authReq.user?.role || "STAFF";
    const nextVersion = Number(existing.current_version || 1) + 1;
    const nowIso = new Date().toISOString();

    const docxArtifact = generateDocxBinaryBuffer({
      id,
      document_code: existing.document_code,
      title: existing.title,
      document_type: existing.document_type,
      department: existing.department,
      layout_preset: existing.layout_preset || "A4_PORTRAIT",
      status: existing.status,
      blocks: parsedBlocks,
    });
    const docxPath = saveDocxArtifactToDisk(id, nextVersion, docxArtifact.buffer);

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE workspace_documents
        SET content_format = 'DOCX',
            legacy_content_json = COALESCE(legacy_content_json, content_json),
            current_version = ?,
            docx_file_path = ?,
            file_hash = ?,
            updated_at = ?
        WHERE id = ?
      `).run(nextVersion, docxPath, docxArtifact.sha256, nowIso, id);

      const verId = `WSV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO workspace_document_versions (
          id, document_id, version, file_path, file_hash, file_size,
          content_json, created_by_user_id, created_by_username, change_summary, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        verId,
        id,
        nextVersion,
        docxPath,
        docxArtifact.sha256,
        docxArtifact.size,
        existing.content_json,
        currentUserId,
        currentUsername,
        "Migrated LEGACY_BLOCKS to canonical DOCX format",
        nowIso
      );

      recordDocumentEvent({
        documentId: id,
        actorUserId: currentUserId,
        actorUsername: currentUsername,
        actorRole: currentUserRole,
        eventType: "MIGRATED_TO_DOCX",
        fromStatus: existing.status,
        toStatus: existing.status,
        note: `Migrated to canonical DOCX v${nextVersion} (SHA-256: ${docxArtifact.sha256.slice(0, 16)})`,
        createdAt: nowIso,
      });

      outboxService.enqueue(
        db,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        {
          id,
          content_format: "DOCX",
          current_version: nextVersion,
          file_hash: docxArtifact.sha256,
        }
      );
    });

    runTx();

    res.json({
      success: true,
      message: `Document ${existing.document_code} migrated to canonical DOCX format (v${nextVersion}).`,
      data: {
        id,
        content_format: "DOCX",
        current_version: nextVersion,
        file_hash: docxArtifact.sha256,
        docx_file_path: docxPath,
      },
    });
  } catch (err: any) {
    console.error("Error migrating document to DOCX:", err);
    res.status(500).json({ error: err.message });
  }
});

// 16. OnlyOffice Editor Session Gateway (GET & POST) (P0-10 & Section 8.5)
const handleEditorSession = (req: any, res: any) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const doc: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (!canUserReadDocument(doc, authReq)) {
      return res.status(403).json({ error: "Forbidden: You do not have access to open this editor session." });
    }

    const currentUserId = authReq.userId || authReq.user?.id || "guest";
    const currentUsername = authReq.username || authReq.user?.username || "Guest";
    const currentUserRole = authReq.userRole || authReq.user?.role || "GUEST";
    const canEdit =
      (doc.status === "DRAFT" || doc.status === "REVISION_REQUIRED") &&
      canUserMutateDraft(doc, authReq);

    const host = req.get("host") || "localhost:3000";
    const protocol = req.protocol || "http";
    const serverUrl = `${protocol}://${host}`;

    const sessionData = createOnlyOfficeSession({
      documentId: doc.id,
      documentTitle: doc.title,
      documentCode: doc.document_code,
      currentVersion: Number(doc.current_version || 1),
      user: {
        id: currentUserId,
        name: currentUsername,
        role: currentUserRole,
      },
      isApprovedOrLocked: !canEdit,
      serverUrl,
    });

    res.json({ success: true, data: sessionData });
  } catch (err: any) {
    console.error("Error creating editor session:", err);
    res.status(500).json({ error: err.message });
  }
};

workspaceDocumentsRouter.get("/api/workspace-documents/:id/editor-session", handleEditorSession);
workspaceDocumentsRouter.post("/api/workspace-documents/:id/editor-session", handleEditorSession);

// 17. OnlyOffice Document File Stream Gateway (Protected by HMAC-SHA256 Signed Token or Session ACL)
workspaceDocumentsRouter.get("/api/workspace-documents/:id/file", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const rawToken =
      (req.query.token as string) ||
      (req.headers["x-document-token"] as string) ||
      undefined;

    const doc: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Security Gate: Verify signed token if provided; otherwise require valid authenticated user with read ACL
    if (rawToken) {
      const verification = verifyDocumentAccessToken(rawToken, id, ["file", "session"]);
      if (!verification.valid) {
        return res.status(403).json({
          error: `Forbidden: Invalid or expired file access token (${verification.reason}).`,
        });
      }
    } else if (!authReq.userId || !canUserReadDocument(doc, authReq)) {
      return res.status(403).json({
        error: "Forbidden: Valid signed document token or authorized session required to stream DOCX file.",
      });
    }

    let parsedBlocks: any[] = [];
    try {
      parsedBlocks = JSON.parse(doc.content_json || "[]");
    } catch (_) {}

    const docxArtifact = generateDocxBinaryBuffer({
      id: doc.id,
      document_code: doc.document_code,
      title: doc.title,
      document_type: doc.document_type,
      department: doc.department,
      layout_preset: doc.layout_preset || "A4_PORTRAIT",
      custom_width_mm: doc.custom_width_mm,
      custom_height_mm: doc.custom_height_mm,
      status: doc.status,
      blocks: parsedBlocks,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${(doc.document_code || "document").replace(/[^a-zA-Z0-9_-]/g, "_")}.docx"`
    );
    res.setHeader("X-Document-SHA256", docxArtifact.sha256);
    res.setHeader("X-Document-Version", String(doc.current_version || 1));
    res.send(Buffer.from(docxArtifact.buffer));
  } catch (err: any) {
    console.error("Error serving document file:", err);
    res.status(500).json({ error: err.message });
  }
});

// 18. OnlyOffice Callback Webhook (Protected by Signed Token / HMAC Verification)
workspaceDocumentsRouter.post("/api/workspace-documents/:id/callback", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const rawToken =
      (req.query.token as string) ||
      (req.headers["x-document-token"] as string) ||
      req.body?.token ||
      undefined;

    const doc: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!doc) {
      return res.status(404).json({ error: 1, message: "Document not found" });
    }

    // Security Gate: Verify callback token or authenticated editor session
    let actorUserId = authReq.userId || authReq.user?.id || "onlyoffice";
    let actorUsername = authReq.username || authReq.user?.username || "onlyoffice";
    let actorRole = authReq.userRole || authReq.user?.role || "STAFF";

    if (rawToken) {
      const verification = verifyDocumentAccessToken(rawToken, id, ["callback", "session"]);
      if (!verification.valid) {
        return res.status(403).json({
          error: 1,
          message: `Forbidden: Invalid or expired callback token (${verification.reason}).`,
        });
      }
      if (verification.payload?.mode !== "edit") {
        return res.status(403).json({
          error: 1,
          message: "Forbidden: View-only token cannot commit callback changes.",
        });
      }
      actorUserId = verification.payload.userId;
      actorUsername = verification.payload.userId;
      actorRole = verification.payload.role;
    } else if (!authReq.userId || !canUserMutateDraft(doc, authReq)) {
      return res.status(403).json({
        error: 1,
        message: "Forbidden: Unsigned callback rejected.",
      });
    }

    if (doc.status === "APPROVED" || doc.status === "ARCHIVED" || doc.status === "PENDING_APPROVAL") {
      return res.status(403).json({
        error: 1,
        message: `Forbidden: Cannot save callback changes to document with status '${doc.status}'.`,
      });
    }

    const { status, url, blocks, docxBase64 } = req.body || {};

    // OnlyOffice status 2 (Ready for saving) or 6 (Force save)
    if (status === 2 || status === 6 || Array.isArray(blocks) || typeof docxBase64 === "string") {
      let updatedBlocks: any[] | null = null;
      if (Array.isArray(blocks)) {
        updatedBlocks = blocks;
      } else if (typeof docxBase64 === "string" && docxBase64.length > 0) {
        const buf = new Uint8Array(Buffer.from(docxBase64, "base64"));
        updatedBlocks = extractBlocksFromDocxBuffer(buf);
      }

      if (!updatedBlocks) {
        try {
          updatedBlocks = JSON.parse(doc.content_json || "[]");
        } catch (_) {
          updatedBlocks = [];
        }
      }

      const contentJson = JSON.stringify(updatedBlocks);
      const nextVersion = Number(doc.current_version || 1) + 1;
      const nowIso = new Date().toISOString();

      const docxArtifact = generateDocxBinaryBuffer({
        id: doc.id,
        document_code: doc.document_code,
        title: doc.title,
        document_type: doc.document_type,
        department: doc.department,
        layout_preset: doc.layout_preset || "A4_PORTRAIT",
        status: doc.status,
        blocks: updatedBlocks,
      });
      const docxPath = saveDocxArtifactToDisk(doc.id, nextVersion, docxArtifact.buffer);

      const runTx = db.transaction(() => {
        db.prepare(`
          UPDATE workspace_documents
          SET content_json = ?, current_version = ?, docx_file_path = ?, file_hash = ?, updated_at = ?
          WHERE id = ?
        `).run(contentJson, nextVersion, docxPath, docxArtifact.sha256, nowIso, id);

        const verId = `WSV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        db.prepare(`
          INSERT INTO workspace_document_versions (
            id, document_id, version, file_path, file_hash, file_size,
            content_json, created_by_user_id, created_by_username, change_summary, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          verId,
          id,
          nextVersion,
          docxPath,
          docxArtifact.sha256,
          docxArtifact.size,
          contentJson,
          actorUserId,
          actorUsername,
          `Saved via OnlyOffice callback (status ${status || 2})`,
          nowIso
        );

        recordDocumentEvent({
          documentId: id,
          actorUserId,
          actorUsername,
          actorRole,
          eventType: "UPDATED",
          fromStatus: doc.status,
          toStatus: doc.status,
          note: `OnlyOffice callback save v${nextVersion}${url ? ` (${url})` : ""}`,
          createdAt: nowIso,
        });

        outboxService.enqueue(
          db,
          "WORKSPACE_DOCUMENTS",
          id,
          "UPDATE",
          {
            id,
            current_version: nextVersion,
            file_hash: docxArtifact.sha256,
          }
        );
      });

      runTx();
    }

    res.json({ error: 0 });
  } catch (err: any) {
    console.error("Error handling OnlyOffice callback:", err);
    res.status(500).json({ error: 1, message: err.message });
  }
});

// 19. Deterministic PDF Export & Verification Endpoint (GET & POST)
const handleExportPdf = (req: any, res: any) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const rawToken =
      (req.query.token as string) ||
      (req.headers["x-document-token"] as string) ||
      req.body?.token ||
      undefined;

    const doc: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (rawToken) {
      const verification = verifyDocumentAccessToken(rawToken, id, ["pdf", "file", "session"]);
      if (!verification.valid) {
        return res.status(403).json({ error: `Forbidden: ${verification.reason}` });
      }
    } else if (!authReq.userId || !canUserReadDocument(doc, authReq)) {
      return res.status(403).json({
        error: "Forbidden: You do not have permission to export this document.",
      });
    }

    let parsedBlocks: any[] = [];
    try {
      parsedBlocks = JSON.parse(doc.content_json || "[]");
    } catch (_) {}

    const pdfArtifact = generateDeterministicPdfBuffer({
      id: doc.id,
      document_code: doc.document_code,
      title: doc.title,
      document_type: doc.document_type,
      department: doc.department,
      layout_preset: doc.layout_preset || "A4_PORTRAIT",
      custom_width_mm: doc.custom_width_mm,
      custom_height_mm: doc.custom_height_mm,
      status: doc.status,
      authorization_department: doc.authorization_department,
      authorization_role: doc.authorization_role,
      approved_by: doc.approved_by,
      approved_at: doc.approved_at,
      blocks: parsedBlocks,
    });

    const curVer = Number(doc.current_version || 1);
    const pdfPath = savePdfArtifactToDisk(doc.id, curVer, pdfArtifact.buffer);

    const actorUserId = authReq.userId || authReq.user?.id || "system";
    const actorUsername = authReq.username || authReq.user?.username || "system";
    const actorRole = authReq.userRole || authReq.user?.role || "STAFF";

    recordDocumentEvent({
      documentId: id,
      actorUserId,
      actorUsername,
      actorRole,
      eventType: "EXPORTED_PDF",
      fromStatus: doc.status,
      toStatus: doc.status,
      note: `Generated deterministic PDF (${pdfArtifact.pageSize.orientation}, SHA-256: ${pdfArtifact.sha256.slice(0, 16)})`,
    });

    const wantsBinary =
      req.method === "GET" ||
      req.query.download === "1" ||
      req.query.format === "binary" ||
      (req.headers.accept && req.headers.accept.includes("application/pdf"));

    if (wantsBinary) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${(doc.document_code || "document").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf"`
      );
      res.setHeader("X-Document-SHA256", pdfArtifact.sha256);
      return res.send(Buffer.from(pdfArtifact.buffer));
    }

    const pdfDownloadToken = signDocumentAccessToken({
      docId: doc.id,
      version: curVer,
      purpose: "pdf",
      userId: actorUserId,
      role: actorRole,
      mode: "view",
    });

    res.json({
      success: true,
      message: `Deterministic PDF generated for ${doc.document_code}`,
      data: {
        document_id: doc.id,
        document_code: doc.document_code,
        title: doc.title,
        status: doc.status,
        layout_preset: doc.layout_preset || "A4_PORTRAIT",
        page_size: pdfArtifact.pageSize,
        file_path: pdfPath,
        file_size: pdfArtifact.size,
        sha256: pdfArtifact.sha256,
        download_url: `/api/workspace-documents/${doc.id}/export/pdf?token=${encodeURIComponent(pdfDownloadToken)}&download=1`,
        ready_for_print: true,
      },
    });
  } catch (err: any) {
    console.error("Error exporting PDF:", err);
    res.status(500).json({ error: err.message });
  }
};

workspaceDocumentsRouter.get("/api/workspace-documents/:id/export/pdf", handleExportPdf);
workspaceDocumentsRouter.post("/api/workspace-documents/:id/export/pdf", handleExportPdf);

export default workspaceDocumentsRouter;

