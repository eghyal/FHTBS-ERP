import { Router } from "express";
import { z } from "zod";
import db from "../db/database.ts";
import { outboxService } from "../services/outboxService.ts";
import { type AuthenticatedRequest } from "../middleware/auth.ts";
import { canUserApproveDepartment } from "../constants/rbac.ts";

export const workspaceDocumentsRouter = Router();

// Ensure workspace_documents and document_sequences tables exist
function initWorkspaceTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_sequences (
        scope TEXT PRIMARY KEY,
        next_val INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_documents (
        id TEXT PRIMARY KEY,
        document_code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        document_type TEXT NOT NULL,
        created_by_username TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        department TEXT,
        content_json TEXT NOT NULL,
        layout_preset TEXT DEFAULT 'A4_PORTRAIT',
        authorization_role TEXT DEFAULT 'PURCHASING_MANAGER',
        authorization_department TEXT DEFAULT 'PURCHASING',
        authorization_user_name TEXT,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        revision_note TEXT,
        approved_by TEXT,
        approved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ws_docs_auth ON workspace_documents(authorization_role, status);
      CREATE INDEX IF NOT EXISTS idx_ws_docs_creator ON workspace_documents(created_by_username);
    `);

    try {
      db.exec("ALTER TABLE workspace_documents ADD COLUMN authorization_department TEXT DEFAULT 'PURCHASING';");
    } catch (_) {}
  } catch (err) {
    console.error("[WorkspaceDocuments] Error initializing schema:", err);
  }
}

initWorkspaceTable();

// Atomic document code generator preventing race conditions and collision bugs (P0-05)
function generateNextDocumentCode(): string {
  const dateStr = new Date().toISOString().slice(0, 7).replace("-", "");
  const scope = `DOC-${dateStr}`;
  const nowIso = new Date().toISOString();

  const runTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO document_sequences (scope, next_val, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(scope) DO UPDATE SET
        next_val = next_val + 1,
        updated_at = excluded.updated_at
    `).run(scope, nowIso);

    const row: any = db.prepare("SELECT next_val FROM document_sequences WHERE scope = ?").get(scope);
    const seqNum = String(row?.next_val || 1).padStart(3, "0");
    return `${scope}-${seqNum}`;
  });

  return runTx();
}

// Zod Schema for Document Payload Validation (P0-06)
const workspaceDocPayloadSchema = z.object({
  title: z.string().trim().min(1, "Document title is required").max(255, "Title must not exceed 255 characters"),
  document_type: z.string().optional().default("MEMORANDUM"),
  department: z.string().optional().default("General"),
  content: z.union([z.array(z.any()), z.string()]).optional().default([]),
  layout_preset: z.enum(["A4_PORTRAIT", "A4_LANDSCAPE", "EXECUTIVE_MEMO"]).optional().default("A4_PORTRAIT"),
  authorization_role: z.string().optional(),
  authorization_department: z.string().optional(),
  authorization_user_name: z.string().optional().default(""),
});

// Helper to auto-extract authorization department and role from signature column blocks
export function extractRoutingFromContent(content: any[]): { role: string; department: string } | null {
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block?.type === "SIGNATURE_COLUMN" || block?.type === "SIGNATURE_STAMP") {
      const dept = (block.targetDepartment || block.department || "").toUpperCase();
      const role = (block.targetRole || block.authorization_role || "").toUpperCase();
      if (dept.includes("PURCHAS") || role.includes("PURCHAS")) {
        return { role: "PURCHASING_MANAGER", department: "PURCHASING" };
      }
      if (dept.includes("FINANCE") || dept.includes("KEUANGAN") || role.includes("FINANCE")) {
        return { role: "FINANCE_HEAD", department: "FINANCE" };
      }
      if (dept.includes("PROD") || role.includes("PROD")) {
        return { role: "PRODUCTION_MANAGER", department: "PRODUCTION" };
      }
      if (dept.includes("FC") || dept.includes("CONTROLLER") || role.includes("CONTROLLER")) {
        return { role: "FACTORY_CONTROLLER", department: "FACTORY_CONTROLLER" };
      }
      if (dept.includes("PLANT") || dept.includes("DIREKSI") || role.includes("PLANT")) {
        return { role: "PLANT_HEAD", department: "MANAGEMENT" };
      }
      if (dept.includes("WAREHOUSE") || dept.includes("GUDANG") || role.includes("WAREHOUSE")) {
        return { role: "WAREHOUSE_SUPERVISOR", department: "WAREHOUSE" };
      }
      if (block.targetRole) {
        return { role: block.targetRole, department: dept || "GENERAL" };
      }
    }
  }
  return null;
}

// 1. Get List of Workspace Documents
workspaceDocumentsRouter.get("/api/workspace-documents", (req, res) => {
  try {
    const { status, authorization_role, search } = req.query;

    let sql = "SELECT * FROM workspace_documents WHERE 1=1";
    const params: any[] = [];

    if (status && status !== "ALL") {
      sql += " AND status = ?";
      params.push(status);
    }

    if (authorization_role && authorization_role !== "ALL") {
      sql += " AND authorization_role = ?";
      params.push(authorization_role);
    }

    if (search && typeof search === "string" && search.trim()) {
      sql += " AND (title LIKE ? OR document_code LIKE ? OR created_by_name LIKE ?)";
      const q = `%${search.trim()}%`;
      params.push(q, q, q);
    }

    sql += " ORDER BY updated_at DESC";

    const rows = db.prepare(sql).all(...params);

    const formatted = rows.map((r: any) => {
      let content = [];
      try {
        content = JSON.parse(r.content_json || "[]");
      } catch (e) {
        content = [];
      }
      return {
        ...r,
        content,
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    console.error("Error fetching workspace documents:", err);
    res.status(500).json({ error: "Failed to fetch workspace documents: " + err.message });
  }
});

// 2. Get Pending Approvals
workspaceDocumentsRouter.get("/api/workspace-documents/pending-approvals", (req, res) => {
  try {
    const { role, department } = req.query;

    let sql = "SELECT * FROM workspace_documents WHERE status = 'PENDING_APPROVAL'";
    const params: any[] = [];

    if (role && typeof role === "string" && role.trim()) {
      const r = role.trim();
      if (r === "PURCHASING" || r === "PURCHASING_MANAGER") {
        sql += " AND (authorization_role IN ('PURCHASING', 'PURCHASING_MANAGER') OR authorization_department = 'PURCHASING' OR authorization_role = 'ALL' OR authorization_role = '')";
      } else if (r === "FINANCE" || r === "FINANCE_HEAD" || r === "FINANCE_MANAGER") {
        sql += " AND (authorization_role IN ('FINANCE', 'FINANCE_HEAD', 'FINANCE_MANAGER') OR authorization_department = 'FINANCE' OR authorization_role = 'ALL' OR authorization_role = '')";
      } else if (r === "PRODUCTION" || r === "PRODUCTION_MANAGER") {
        sql += " AND (authorization_role IN ('PRODUCTION', 'PRODUCTION_MANAGER') OR authorization_department = 'PRODUCTION' OR authorization_role = 'ALL' OR authorization_role = '')";
      } else {
        sql += " AND (authorization_role = ? OR authorization_department = ? OR authorization_role = 'ALL' OR authorization_role = '')";
        params.push(r, r);
      }
    } else if (department && typeof department === "string" && department.trim()) {
      sql += " AND (authorization_department = ? OR authorization_role LIKE ?)";
      params.push(department.trim(), `%${department.trim()}%`);
    }

    sql += " ORDER BY created_at DESC";

    const rows = db.prepare(sql).all(...params);

    const formatted = rows.map((r: any) => {
      let content = [];
      try {
        content = JSON.parse(r.content_json || "[]");
      } catch (e) {
        content = [];
      }
      return {
        ...r,
        content,
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err: any) {
    console.error("Error fetching pending workspace approvals:", err);
    res.status(500).json({ error: "Failed to fetch pending approvals: " + err.message });
  }
});

// 3. Get Single Workspace Document
workspaceDocumentsRouter.get("/api/workspace-documents/:id", (req, res) => {
  try {
    const { id } = req.params;
    const doc: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }

    let content = [];
    try {
      content = JSON.parse(doc.content_json || "[]");
    } catch (e) {
      content = [];
    }

    res.json({
      success: true,
      data: {
        ...doc,
        content,
      },
    });
  } catch (err: any) {
    console.error("Error fetching workspace document details:", err);
    res.status(500).json({ error: "Failed to fetch document details: " + err.message });
  }
});

// 4. Create New Workspace Document (P0-03 & P0-05 & P0-06)
workspaceDocumentsRouter.post("/api/workspace-documents", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const validation = workspaceDocPayloadSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed: " + validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        fieldErrors: validation.error.flatten().fieldErrors,
      });
    }

    const {
      title,
      document_type,
      department,
      content,
      layout_preset,
      authorization_role,
      authorization_department,
      authorization_user_name,
    } = validation.data;

    let parsedContent: any[] = [];
    if (Array.isArray(content)) {
      parsedContent = content;
    } else if (typeof content === "string") {
      try {
        const p = JSON.parse(content || "[]");
        if (!Array.isArray(p)) {
          return res.status(400).json({ error: "Content must be a JSON array of blocks." });
        }
        parsedContent = p;
      } catch (e: any) {
        return res.status(400).json({ error: "Malformed content JSON: " + e.message });
      }
    }

    const autoRoute = extractRoutingFromContent(parsedContent);
    const finalAuthRole = autoRoute?.role || authorization_role || "PURCHASING_MANAGER";
    const finalAuthDept = autoRoute?.department || authorization_department || department || "PURCHASING";

    const docId = "WSD-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
    const docCode = generateNextDocumentCode();

    const nowIso = new Date().toISOString();
    // P0-03: Verified identity from JWT session, never untrusted request headers
    const createdByUsername = authReq.username || authReq.user?.username || "system";
    const createdByName = authReq.user?.name || createdByUsername;

    const contentJson = JSON.stringify(parsedContent);

    db.prepare(`
      INSERT INTO workspace_documents (
        id, document_code, title, document_type, created_by_username, created_by_name,
        department, content_json, layout_preset, authorization_role, authorization_department,
        authorization_user_name, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)
    `).run(
      docId,
      docCode,
      title.trim(),
      document_type,
      createdByUsername,
      createdByName,
      department,
      contentJson,
      layout_preset,
      finalAuthRole,
      finalAuthDept,
      authorization_user_name,
      nowIso,
      nowIso
    );

    try {
      outboxService.enqueue(
        null,
        "WORKSPACE_DOCUMENTS",
        docId,
        "CREATE",
        { id: docId, document_code: docCode, title, authorization_role: finalAuthRole, authorization_department: finalAuthDept, status: "DRAFT" }
      );
    } catch (_) {}

    res.json({
      success: true,
      message: `Document ${docCode} created successfully.`,
      data: {
        id: docId,
        document_code: docCode,
        title,
        authorization_role: finalAuthRole,
        authorization_department: finalAuthDept,
        status: "DRAFT",
      },
    });
  } catch (err: any) {
    console.error("Error creating workspace document:", err);
    res.status(500).json({ error: "Failed to create document: " + err.message });
  }
});

// 5. Update Workspace Document (P0-01 & P0-07)
workspaceDocumentsRouter.put("/api/workspace-documents/:id", (req, res) => {
  try {
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    // P0-07 Immutability Guard: APPROVED documents are permanently locked
    if (existing.status === "APPROVED") {
      return res.status(403).json({
        error: "Forbidden: APPROVED documents are legally locked and immutable. Please clone or create a revision to make changes.",
      });
    }

    // P0-01 Security Guard: Disallow status changes via general PUT endpoint
    if (req.body.status !== undefined && req.body.status !== existing.status) {
      return res.status(400).json({
        error: "Status cannot be changed via general update. Use workflow endpoints (/submit, /approve, /revise).",
      });
    }

    const {
      title,
      document_type,
      department,
      content,
      layout_preset,
      authorization_role,
      authorization_department,
      authorization_user_name,
    } = req.body;

    const nowIso = new Date().toISOString();
    let contentJson = existing.content_json;
    let finalAuthRole = authorization_role || existing.authorization_role;
    let finalAuthDept = authorization_department || existing.authorization_department;

    if (content !== undefined) {
      let parsedContent: any[] = [];
      if (Array.isArray(content)) {
        parsedContent = content;
      } else if (typeof content === "string") {
        try {
          const p = JSON.parse(content || "[]");
          if (!Array.isArray(p)) {
            return res.status(400).json({ error: "Content must be a JSON array of blocks." });
          }
          parsedContent = p;
        } catch (e: any) {
          return res.status(400).json({ error: "Malformed content JSON: " + e.message });
        }
      }
      contentJson = JSON.stringify(parsedContent);
      const autoRoute = extractRoutingFromContent(parsedContent);
      if (autoRoute) {
        finalAuthRole = autoRoute.role;
        finalAuthDept = autoRoute.department;
      }
    }

    db.prepare(`
      UPDATE workspace_documents SET
        title = COALESCE(?, title),
        document_type = COALESCE(?, document_type),
        department = COALESCE(?, department),
        content_json = ?,
        layout_preset = COALESCE(?, layout_preset),
        authorization_role = COALESCE(?, authorization_role),
        authorization_department = COALESCE(?, authorization_department),
        authorization_user_name = COALESCE(?, authorization_user_name),
        updated_at = ?
      WHERE id = ?
    `).run(
      title?.trim() || null,
      document_type || null,
      department || null,
      contentJson,
      layout_preset || null,
      finalAuthRole || null,
      finalAuthDept || null,
      authorization_user_name || null,
      nowIso,
      id
    );

    try {
      outboxService.enqueue(
        null,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        { id, title: title || existing.title, authorization_role: finalAuthRole, status: existing.status }
      );
    } catch (_) {}

    res.json({
      success: true,
      message: `Document ${existing.document_code} updated.`,
      data: {
        id,
        authorization_role: finalAuthRole,
        authorization_department: finalAuthDept,
      }
    });
  } catch (err: any) {
    console.error("Error updating workspace document:", err);
    res.status(500).json({ error: "Failed to update document: " + err.message });
  }
});

// 6. Submit Document for Approval (Atomic transaction) (P0-04)
const handleSubmitApproval = (req: any, res: any) => {
  try {
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (existing.status === "APPROVED") {
      return res.status(400).json({ error: "Cannot submit an already APPROVED document." });
    }

    const { content, title, department, authorization_role, authorization_department } = req.body || {};
    const nowIso = new Date().toISOString();

    let contentJson = existing.content_json;
    let finalAuthRole = authorization_role || existing.authorization_role;
    let finalAuthDept = authorization_department || existing.authorization_department;

    if (content !== undefined) {
      let parsedContent: any[] = [];
      if (Array.isArray(content)) {
        parsedContent = content;
      } else if (typeof content === "string") {
        try {
          const p = JSON.parse(content || "[]");
          if (!Array.isArray(p)) {
            return res.status(400).json({ error: "Content must be an array of blocks." });
          }
          parsedContent = p;
        } catch (e: any) {
          return res.status(400).json({ error: "Malformed content JSON." });
        }
      }
      contentJson = JSON.stringify(parsedContent);
      const autoRoute = extractRoutingFromContent(parsedContent);
      if (autoRoute) {
        finalAuthRole = autoRoute.role;
        finalAuthDept = autoRoute.department;
      }
    }

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE workspace_documents SET
          title = COALESCE(?, title),
          department = COALESCE(?, department),
          content_json = ?,
          authorization_role = ?,
          authorization_department = ?,
          status = 'PENDING_APPROVAL',
          updated_at = ?
        WHERE id = ?
      `).run(
        title?.trim() || null,
        department || null,
        contentJson,
        finalAuthRole,
        finalAuthDept,
        nowIso,
        id
      );

      try {
        outboxService.enqueue(
          null,
          "WORKSPACE_DOCUMENTS",
          id,
          "UPDATE",
          { id, status: "PENDING_APPROVAL", authorization_role: finalAuthRole, authorization_department: finalAuthDept }
        );
      } catch (_) {}
    });

    runTx();

    res.json({
      success: true,
      message: `Document ${existing.document_code} submitted for ${finalAuthRole} approval.`,
      data: {
        id,
        status: "PENDING_APPROVAL",
        authorization_role: finalAuthRole,
        authorization_department: finalAuthDept,
      }
    });
  } catch (err: any) {
    console.error("Error submitting document for approval:", err);
    res.status(500).json({ error: "Failed to submit document: " + err.message });
  }
};

workspaceDocumentsRouter.post("/api/workspace-documents/:id/submit", handleSubmitApproval);
workspaceDocumentsRouter.post("/api/workspace-documents/:id/submit-approval", handleSubmitApproval);

// 7. Approve Document (P0-02 & P0-03)
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

    // P0-02 Penegakan RBAC departemen
    const userRole = authReq.userRole || authReq.user?.role || "";
    const authDept = existing.authorization_department || existing.department;

    if (!canUserApproveDepartment(userRole, authDept) && !canUserApproveDepartment(userRole, existing.authorization_role)) {
      return res.status(403).json({
        error: `Unauthorized: User role '${userRole}' does not have authority to approve documents for department '${authDept}' or role '${existing.authorization_role}'.`,
      });
    }

    // P0-03 Verified identity from JWT session
    const approverName = authReq.user?.name || authReq.username || "Authorized Approver";
    const nowIso = new Date().toISOString();

    const runTx = db.transaction(() => {
      db.prepare(`
        UPDATE workspace_documents SET
          status = 'APPROVED',
          approved_by = ?,
          approved_at = ?,
          revision_note = NULL,
          updated_at = ?
        WHERE id = ?
      `).run(approverName, nowIso, nowIso, id);

      try {
        outboxService.enqueue(
          null,
          "WORKSPACE_DOCUMENTS",
          id,
          "UPDATE",
          { id, status: "APPROVED", approved_by: approverName, approved_at: nowIso }
        );
      } catch (_) {}
    });

    runTx();

    res.json({
      success: true,
      message: `Document ${existing.document_code} has been officially APPROVED by ${approverName}.`,
      data: {
        id,
        status: "APPROVED",
        approved_by: approverName,
        approved_at: nowIso,
      }
    });
  } catch (err: any) {
    console.error("Error approving workspace document:", err);
    res.status(500).json({ error: "Failed to approve document: " + err.message });
  }
});

// 8. Request Revision / Reject Document (P0-02 & P0-03)
workspaceDocumentsRouter.post("/api/workspace-documents/:id/revise", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { revision_note } = req.body;

    if (!revision_note || !revision_note.trim()) {
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

    if (!canUserApproveDepartment(userRole, authDept) && !canUserApproveDepartment(userRole, existing.authorization_role)) {
      return res.status(403).json({
        error: `Unauthorized: User role '${userRole}' does not have authority to reject/revise documents for department '${authDept}'.`,
      });
    }

    const reviserName = authReq.user?.name || authReq.username || "Manager";
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

      try {
        outboxService.enqueue(
          null,
          "WORKSPACE_DOCUMENTS",
          id,
          "UPDATE",
          { id, status: "REVISION_REQUIRED", revision_note: formattedNote }
        );
      } catch (_) {}
    });

    runTx();

    res.json({
      success: true,
      message: `Document ${existing.document_code} status set to Revision Required.`,
      data: {
        id,
        status: "REVISION_REQUIRED",
        revision_note: formattedNote,
      }
    });
  } catch (err: any) {
    console.error("Error requesting revision for workspace document:", err);
    res.status(500).json({ error: "Failed to request revision: " + err.message });
  }
});

// 9. Clone Document (e.g. for creating a new revision from an APPROVED document)
workspaceDocumentsRouter.post("/api/workspace-documents/:id/clone", (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    const newDocId = "WSD-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
    const newDocCode = generateNextDocumentCode();
    const nowIso = new Date().toISOString();

    const createdByUsername = authReq.username || authReq.user?.username || "system";
    const createdByName = authReq.user?.name || createdByUsername;
    const newTitle = existing.status === "APPROVED" ? `[Revisi] ${existing.title}` : `${existing.title} (Salinan)`;

    db.prepare(`
      INSERT INTO workspace_documents (
        id, document_code, title, document_type, created_by_username, created_by_name,
        department, content_json, layout_preset, authorization_role, authorization_department,
        authorization_user_name, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)
    `).run(
      newDocId,
      newDocCode,
      newTitle,
      existing.document_type,
      createdByUsername,
      createdByName,
      existing.department,
      existing.content_json,
      existing.layout_preset,
      existing.authorization_role,
      existing.authorization_department,
      "",
      nowIso,
      nowIso
    );

    res.json({
      success: true,
      message: `Document cloned as new draft ${newDocCode}.`,
      data: {
        id: newDocId,
        document_code: newDocCode,
        title: newTitle,
        status: "DRAFT",
      }
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

    // P0-07 Immutability Guard: APPROVED documents CANNOT be deleted!
    if (existing.status === "APPROVED") {
      return res.status(403).json({
        error: "Forbidden: APPROVED documents are legally locked and immutable records. They cannot be deleted.",
      });
    }

    const currentUsername = authReq.username || authReq.user?.username;
    const currentUserRole = authReq.userRole || authReq.user?.role;
    const isOwner = existing.created_by_username === currentUsername;
    const isFcAdmin = currentUserRole === "FC" || currentUserRole === "ADMIN" || currentUserRole === "FACTORY_CONTROLLER";

    if (!isOwner && !isFcAdmin) {
      return res.status(403).json({
        error: "Forbidden: Only the author or Factory Controller can delete this document draft.",
      });
    }

    db.prepare("DELETE FROM workspace_documents WHERE id = ?").run(id);

    try {
      outboxService.enqueue(
        null,
        "WORKSPACE_DOCUMENTS",
        id,
        "DELETE",
        { id }
      );
    } catch (_) {}

    res.json({ success: true, message: `Document ${existing.document_code} deleted.` });
  } catch (err: any) {
    console.error("Error deleting workspace document:", err);
    res.status(500).json({ error: "Failed to delete document: " + err.message });
  }
});
