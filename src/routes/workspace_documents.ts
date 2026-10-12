import { Router } from "express";
import db from "../db/database.ts";
import { outboxService } from "../services/outboxService.ts";

export const workspaceDocumentsRouter = Router();

// Ensure workspace_documents table exists
function initWorkspaceTable() {
  try {
    db.exec(`
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
  } catch (err) {
    console.error("[WorkspaceDocuments] Error initializing schema:", err);
  }
}

initWorkspaceTable();

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

// 2. Get Pending Approvals (e.g. for Purchasing Manager Dashboard or General Action Required)
workspaceDocumentsRouter.get("/api/workspace-documents/pending-approvals", (req, res) => {
  try {
    const { role } = req.query;

    let sql = "SELECT * FROM workspace_documents WHERE status = 'PENDING_APPROVAL'";
    const params: any[] = [];

    if (role && typeof role === "string" && role.trim()) {
      sql += " AND (authorization_role = ? OR authorization_role = 'ALL' OR authorization_role = '')";
      params.push(role.trim());
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

// 4. Create New Workspace Document
workspaceDocumentsRouter.post("/api/workspace-documents", (req, res) => {
  try {
    const {
      title,
      document_type = "MEMORANDUM",
      department = "General",
      content = [],
      layout_preset = "A4_PORTRAIT",
      authorization_role = "PURCHASING_MANAGER",
      authorization_user_name = "",
      status = "DRAFT",
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Document title is required" });
    }

    const docId = "WSD-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
    const dateStr = new Date().toISOString().slice(0, 7).replace("-", "");
    const seqRow: any = db.prepare("SELECT COUNT(*) as count FROM workspace_documents").get();
    const seqNum = String((seqRow?.count || 0) + 1).padStart(3, "0");
    const docCode = `DOC-${dateStr}-${seqNum}`;

    const nowIso = new Date().toISOString();
    const createdByUsername = (req.headers["x-user-username"] as string) || "system";
    const createdByName = (req.headers["x-user-name"] as string) || createdByUsername;

    const contentJson = typeof content === "string" ? content : JSON.stringify(content || []);

    db.prepare(`
      INSERT INTO workspace_documents (
        id, document_code, title, document_type, created_by_username, created_by_name,
        department, content_json, layout_preset, authorization_role, authorization_user_name,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      authorization_role,
      authorization_user_name,
      status,
      nowIso,
      nowIso
    );

    try {
      outboxService.enqueue(
        null,
        "WORKSPACE_DOCUMENTS",
        docId,
        "CREATE",
        { id: docId, document_code: docCode, title, authorization_role, status }
      );
    } catch (_) {}

    res.json({
      success: true,
      message: `Document ${docCode} created successfully.`,
      data: {
        id: docId,
        document_code: docCode,
        title,
        status,
      },
    });
  } catch (err: any) {
    console.error("Error creating workspace document:", err);
    res.status(500).json({ error: "Failed to create document: " + err.message });
  }
});

// 5. Update Workspace Document
workspaceDocumentsRouter.put("/api/workspace-documents/:id", (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      document_type,
      department,
      content,
      layout_preset,
      authorization_role,
      authorization_user_name,
      status,
    } = req.body;

    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);
    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    const nowIso = new Date().toISOString();
    const contentJson = content !== undefined ? (typeof content === "string" ? content : JSON.stringify(content)) : existing.content_json;

    db.prepare(`
      UPDATE workspace_documents SET
        title = COALESCE(?, title),
        document_type = COALESCE(?, document_type),
        department = COALESCE(?, department),
        content_json = ?,
        layout_preset = COALESCE(?, layout_preset),
        authorization_role = COALESCE(?, authorization_role),
        authorization_user_name = COALESCE(?, authorization_user_name),
        status = COALESCE(?, status),
        updated_at = ?
      WHERE id = ?
    `).run(
      title?.trim() || null,
      document_type || null,
      department || null,
      contentJson,
      layout_preset || null,
      authorization_role || null,
      authorization_user_name || null,
      status || null,
      nowIso,
      id
    );

    try {
      outboxService.enqueue(
        null,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        { id, title, authorization_role, status }
      );
    } catch (_) {}

    res.json({ success: true, message: `Document ${existing.document_code} updated.` });
  } catch (err: any) {
    console.error("Error updating workspace document:", err);
    res.status(500).json({ error: "Failed to update document: " + err.message });
  }
});

// 6. Submit Document for Approval
workspaceDocumentsRouter.post("/api/workspace-documents/:id/submit-approval", (req, res) => {
  try {
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE workspace_documents SET
        status = 'PENDING_APPROVAL',
        updated_at = ?
      WHERE id = ?
    `).run(nowIso, id);

    try {
      outboxService.enqueue(
        null,
        "WORKSPACE_DOCUMENTS",
        id,
        "UPDATE",
        { id, status: "PENDING_APPROVAL", authorization_role: existing.authorization_role }
      );
    } catch (_) {}

    res.json({
      success: true,
      message: `Document ${existing.document_code} submitted for ${existing.authorization_role} approval.`,
    });
  } catch (err: any) {
    console.error("Error submitting document for approval:", err);
    res.status(500).json({ error: "Failed to submit document: " + err.message });
  }
});

// 7. Approve Document
workspaceDocumentsRouter.post("/api/workspace-documents/:id/approve", (req, res) => {
  try {
    const { id } = req.params;
    const approverName = (req.headers["x-user-name"] as string) || (req.headers["x-user-username"] as string) || "Authorized Approver";

    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    const nowIso = new Date().toISOString();

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
        { id, status: "APPROVED", approved_by: approverName }
      );
    } catch (_) {}

    res.json({
      success: true,
      message: `Document ${existing.document_code} has been approved by ${approverName}.`,
    });
  } catch (err: any) {
    console.error("Error approving workspace document:", err);
    res.status(500).json({ error: "Failed to approve document: " + err.message });
  }
});

// 8. Request Revision / Reject Document
workspaceDocumentsRouter.post("/api/workspace-documents/:id/revise", (req, res) => {
  try {
    const { id } = req.params;
    const { revision_note } = req.body;
    const reviserName = (req.headers["x-user-name"] as string) || (req.headers["x-user-username"] as string) || "Manager";

    if (!revision_note || !revision_note.trim()) {
      return res.status(400).json({ error: "Revision note is required" });
    }

    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
    }

    const nowIso = new Date().toISOString();
    const formattedNote = `[${reviserName} @ ${new Date().toLocaleDateString("id-ID")}] ${revision_note.trim()}`;

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

    res.json({
      success: true,
      message: `Document ${existing.document_code} status set to Revision Required.`,
    });
  } catch (err: any) {
    console.error("Error requesting revision for workspace document:", err);
    res.status(500).json({ error: "Failed to request revision: " + err.message });
  }
});

// 9. Delete Document
workspaceDocumentsRouter.delete("/api/workspace-documents/:id", (req, res) => {
  try {
    const { id } = req.params;
    const existing: any = db.prepare("SELECT * FROM workspace_documents WHERE id = ?").get(id);

    if (!existing) {
      return res.status(404).json({ error: "Document not found" });
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
