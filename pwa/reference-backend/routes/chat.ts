import { Router } from "express";
import db from "../db/database.ts";
import crypto from "crypto";
import { isValidDailyAuthKey } from "../utils/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { syncProcurementTaskGantt } from "../utils/ganttUtils.ts";
import { calculateFinancialBreakdown } from "../lib/financialEngine.ts";
import { batchGetDeliveryNoteItemsWithPrices } from "./sales/helpers.ts";

export const chatRouter = Router();

// Ensure new chat_messages columns exist even without server restart
try {
  const cols = db.prepare("PRAGMA table_info(chat_messages)").all() as any[];
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("forwarded_from")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN forwarded_from TEXT;");
  }
  if (!colNames.has("reply_to_id")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN reply_to_id TEXT;");
  }
  if (!colNames.has("reply_to_sender")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN reply_to_sender TEXT;");
  }
  if (!colNames.has("reply_to_content")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN reply_to_content TEXT;");
  }
  if (!colNames.has("is_pinned")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN is_pinned INTEGER DEFAULT 0;");
  }
  if (!colNames.has("pinned_by")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN pinned_by TEXT;");
  }
} catch (e) {
  // Ignore if already exists
}

function getAuthUsername(req: any): string | null {
  return req.username || req.user?.username || (req.headers?.["x-user-email"] as string) || (req.headers?.["remote-user"] as string) || null;
}

chatRouter.get("/api/chat/unread", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });
    const row = db
      .prepare(
        `
    SELECT COUNT(*) as unread_count
    FROM chat_messages m
    JOIN chat_participants p ON m.thread_id = p.thread_id
    WHERE p.username = ?
      AND m.sender_username != ?
      AND COALESCE(m.is_deleted, 0) = 0
      AND (m.read_by NOT LIKE '%' || ? || '%' OR m.read_by IS NULL)
  `,
      )
      .get(username, username, username) as { unread_count: number } | undefined;

    const unreadCount = row?.unread_count || 0;

    const senderRows = db
      .prepare(
        `
    SELECT m.sender_username, COUNT(*) as count
    FROM chat_messages m
    JOIN chat_participants p ON m.thread_id = p.thread_id
    WHERE p.username = ?
      AND m.sender_username != ?
      AND COALESCE(m.is_deleted, 0) = 0
      AND (m.read_by NOT LIKE '%' || ? || '%' OR m.read_by IS NULL)
    GROUP BY m.sender_username
  `,
      )
      .all(username, username, username) as { sender_username: string; count: number }[];

    const unreadBySender: Record<string, number> = {};
    for (const r of senderRows) {
      if (r.sender_username) {
        unreadBySender[r.sender_username] = r.count;
      }
    }

    const latestMsg = db
      .prepare(
        `
    SELECT m.id, m.thread_id, m.sender_username, m.content, m.file_name, m.file_type, m.created_at
    FROM chat_messages m
    JOIN chat_participants p ON m.thread_id = p.thread_id
    WHERE p.username = ?
      AND m.sender_username != ?
      AND COALESCE(m.is_deleted, 0) = 0
      AND (m.read_by NOT LIKE '%' || ? || '%' OR m.read_by IS NULL)
    ORDER BY m.created_at DESC
    LIMIT 1
  `,
      )
      .get(username, username, username) as any;

    res.json({
      success: true,
      count: unreadCount,
      unread_count: unreadCount,
      unread_by_sender: unreadBySender,
      latest_message: latestMsg || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

chatRouter.get("/api/chat/threads", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const threads = db
      .prepare(
        `
       SELECT t.*, 
       (SELECT COUNT(*) FROM chat_participants cp2 WHERE cp2.thread_id = t.id) as participant_count,
       (SELECT content FROM chat_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message,
       (SELECT file_name FROM chat_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_file_name,
       (SELECT file_type FROM chat_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_file_type,
       (SELECT created_at FROM chat_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
       (SELECT sender_username FROM chat_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_sender,
       (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id AND COALESCE(m.is_deleted, 0) = 0 AND m.sender_username != ? AND (m.read_by NOT LIKE '%' || ? || '%' OR m.read_by IS NULL)) as unread_count
       FROM chat_threads t
       JOIN chat_participants p ON t.id = p.thread_id
       WHERE p.username = ?
       ORDER BY COALESCE((SELECT MAX(created_at) FROM chat_messages m WHERE m.thread_id = t.id), t.created_at) DESC
     `,
      )
      .all(username, username, username) as any[];

    for (let t of threads) {
      t.participants = db
        .prepare("SELECT username FROM chat_participants WHERE thread_id = ?")
        .all(t.id)
        .map((x: any) => x.username);
    }

    res.json(threads);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

function findOrCreateDirectThread(userA: string, userB: string): string {
  const existing = db
    .prepare(
      `
     SELECT t.id FROM chat_threads t
     JOIN chat_participants p1 ON t.id = p1.thread_id AND LOWER(p1.username) = LOWER(?)
     JOIN chat_participants p2 ON t.id = p2.thread_id AND LOWER(p2.username) = LOWER(?)
     WHERE t.is_group = 0
     LIMIT 1
   `,
    )
    .get(userA, userB) as any;

  if (existing?.id) {
    return existing.id;
  }

  const id = "THR-" + crypto.randomUUID();
  db.prepare(
    "INSERT INTO chat_threads (id, name, is_group, created_by) VALUES (?, ?, 0, ?)",
  ).run(id, null, userA);

  const uniqueUsers = Array.from(new Set([userA, userB]));
  for (const u of uniqueUsers) {
    db.prepare(
      "INSERT OR IGNORE INTO chat_participants (thread_id, username) VALUES (?, ?)",
    ).run(id, u);
  }
  return id;
}

chatRouter.post("/api/chat/threads", (req, res) => {
  try {
    const { name, is_group, participants } = req.body;
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const safeParticipants = Array.isArray(participants) ? [...participants] : [];
    if (!safeParticipants.includes(username)) {
      safeParticipants.push(username);
    }

    if (!is_group && safeParticipants.length === 2) {
      const existing = db
        .prepare(
          `
       SELECT t.id FROM chat_threads t
       JOIN chat_participants p1 ON t.id = p1.thread_id AND LOWER(p1.username) = LOWER(?)
       JOIN chat_participants p2 ON t.id = p2.thread_id AND LOWER(p2.username) = LOWER(?)
       WHERE t.is_group = 0
       LIMIT 1
     `,
        )
        .get(safeParticipants[0], safeParticipants[1]) as any;

      if (existing) {
        return res.json({ success: true, id: existing.id });
      }
    }

    const id = "THR-" + crypto.randomUUID();

    db.transaction(() => {
      db.prepare(
        "INSERT INTO chat_threads (id, name, is_group, created_by) VALUES (?, ?, ?, ?)",
      ).run(id, name || null, is_group ? 1 : 0, username);

      for (let p of safeParticipants) {
        db.prepare(
          "INSERT OR IGNORE INTO chat_participants (thread_id, username) VALUES (?, ?)",
        ).run(id, p);
      }
    })();

    res.json({ success: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create thread" });
  }
});

chatRouter.post("/api/chat/threads/:id/participants", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const { users } = req.body;

    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(req.params.id) as any;

    if (!thread || !thread.is_group)
      return res
        .status(400)
        .json({ error: "Invalid thread or not a group" });

    db.transaction(() => {
      for (let u of (users || [])) {
        db.prepare(
          "INSERT OR IGNORE INTO chat_participants (thread_id, username) VALUES (?, ?)",
        ).run(req.params.id, u);
      }
    })();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to add participants" });
  }
});

chatRouter.delete("/api/chat/threads/:id/participants/:username", (req, res) => {
  try {
    const currentUser = getAuthUsername(req);
    if (!currentUser)
      return res.status(401).json({ error: "Unauthorized" });

    const threadId = req.params.id;
    const targetUser = req.params.username;

    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(threadId) as any;

    if (!thread || !thread.is_group)
      return res
        .status(400)
        .json({ error: "Invalid thread or not a group" });

    db.prepare(
      "DELETE FROM chat_participants WHERE thread_id = ? AND username = ?",
    ).run(threadId, targetUser);

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to remove participant" });
  }
});

chatRouter.delete("/api/chat/threads/:id", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });
    const threadId = req.params.id;

    const thread = db
      .prepare("SELECT * FROM chat_threads WHERE id = ?")
      .get(threadId) as any;

    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    if (thread.id === "THREAD-GENERAL") {
      return res.status(403).json({ error: "General forum thread cannot be deleted" });
    }

    const roleUpper = ((req as any).userRole || "").toUpperCase();
    const isOwner = thread.created_by && thread.created_by.toLowerCase() === username.toLowerCase();
    const isExecutive = ["FC", "ADMIN", "SUPERADMIN", "BOD", "DIRECTOR"].includes(roleUpper);

    if (!isOwner && !isExecutive) {
      return res.status(403).json({ error: "Only the thread creator or an administrator can delete this thread" });
    }

    db.prepare("DELETE FROM chat_messages WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM chat_participants WHERE thread_id = ?").run(threadId);
    db.prepare("DELETE FROM chat_threads WHERE id = ?").run(threadId);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete thread" });
  }
});

chatRouter.get("/api/chat/threads/:id/messages", (req, res) => {
  try {
    const messages = db
      .prepare(
        "SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC",
      )
      .all(req.params.id);
    res.json(messages);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

chatRouter.post("/api/chat/threads/:id/read", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const messages = db
      .prepare(
        "SELECT id, read_by FROM chat_messages WHERE thread_id = ? AND sender_username != ? AND (read_by IS NULL OR read_by NOT LIKE '%' || ? || '%')",
      )
      .all(req.params.id, username, username) as any[];

    const updateStmt = db.prepare(
      "UPDATE chat_messages SET read_by = ? WHERE id = ?",
    );

    db.transaction(() => {
      for (const msg of messages) {
        let currentArr: string[] = [];
        try {
          currentArr = JSON.parse(msg.read_by || "[]");
        } catch (e) {}
        if (!currentArr.includes(username)) {
          currentArr.push(username);
          updateStmt.run(JSON.stringify(currentArr), msg.id);
        }
      }
    })();
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to read messages" });
  }
});

chatRouter.post("/api/chat/threads/:id/messages", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const {
      content,
      file_url,
      file_name,
      file_size,
      file_type,
      forwarded_from,
      reply_to_id,
      reply_to_sender,
      reply_to_content,
    } = req.body;
    const id = "MSG-" + crypto.randomUUID();

    // Ensure thread exists if sending to THREAD-GENERAL or similar
    const threadExists = db
      .prepare("SELECT id FROM chat_threads WHERE id = ?")
      .get(req.params.id);
    if (!threadExists && req.params.id === "THREAD-GENERAL") {
      db.prepare(
        "INSERT OR IGNORE INTO chat_threads (id, name, is_group, created_by) VALUES ('THREAD-GENERAL', 'General Discussion', 1, ?)",
      ).run(username);
      db.prepare(
        "INSERT OR IGNORE INTO chat_participants (thread_id, username) VALUES ('THREAD-GENERAL', ?)",
      ).run(username);
    }

    db.prepare(
      `
     INSERT INTO chat_messages (
       id, thread_id, sender_username, content,
       file_url, file_name, file_size, file_type,
       forwarded_from, reply_to_id, reply_to_sender, reply_to_content
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   `,
    ).run(
      id,
      req.params.id,
      username,
      content || null,
      file_url || null,
      file_name || null,
      file_size || null,
      file_type || null,
      forwarded_from || null,
      reply_to_id || null,
      reply_to_sender || null,
      reply_to_content || null,
    );

    res.json({ success: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Multi-recipient Forward endpoint (supports forwarding to multiple users and/or group threads at once)
chatRouter.post("/api/chat/forward", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const {
      target_thread_ids,
      target_usernames,
      content,
      file_url,
      file_name,
      file_size,
      file_type,
      forwarded_from,
      note,
    } = req.body;

    const resolvedThreadIds = new Set<string>(
      Array.isArray(target_thread_ids) ? target_thread_ids.filter(Boolean) : [],
    );

    const insertMsg = db.prepare(`
      INSERT INTO chat_messages (
        id, thread_id, sender_username, content,
        file_url, file_name, file_size, file_type, forwarded_from
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createdThreadIds: string[] = [];

    db.transaction(() => {
      if (Array.isArray(target_usernames)) {
        for (const targetUser of target_usernames) {
          if (!targetUser || targetUser === username) continue;
          const dmThreadId = findOrCreateDirectThread(username, targetUser);
          resolvedThreadIds.add(dmThreadId);
          createdThreadIds.push(dmThreadId);
        }
      }

      for (const tid of resolvedThreadIds) {
        const fwdMsgId = "MSG-" + crypto.randomUUID();
        insertMsg.run(
          fwdMsgId,
          tid,
          username,
          content || null,
          file_url || null,
          file_name || null,
          file_size || null,
          file_type || null,
          forwarded_from || username,
        );

        // If user added an accompanying note when forwarding, send it right after
        if (note && String(note).trim()) {
          const noteMsgId = "MSG-" + crypto.randomUUID();
          insertMsg.run(
            noteMsgId,
            tid,
            username,
            String(note).trim(),
            null,
            null,
            null,
            null,
            null,
          );
        }
      }
    })();

    res.json({
      success: true,
      recipient_count: resolvedThreadIds.size,
      thread_ids: Array.from(resolvedThreadIds),
    });
  } catch (e) {
    console.error("Failed to forward message:", e);
    res.status(500).json({ error: "Failed to forward message" });
  }
});

// Toggle Pin / Unpin message in thread
chatRouter.post("/api/chat/messages/:id/pin", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const msg = db
      .prepare("SELECT id, thread_id, is_pinned, is_deleted FROM chat_messages WHERE id = ?")
      .get(req.params.id) as any;

    if (!msg || msg.is_deleted) {
      return res.status(404).json({ error: "Message not found" });
    }

    const newPinned = msg.is_pinned ? 0 : 1;
    db.prepare(
      "UPDATE chat_messages SET is_pinned = ?, pinned_by = ? WHERE id = ?",
    ).run(newPinned, newPinned ? username : null, req.params.id);

    res.json({ success: true, is_pinned: Boolean(newPinned), pinned_by: newPinned ? username : null });
  } catch (e) {
    console.error("Failed to toggle message pin:", e);
    res.status(500).json({ error: "Failed to toggle message pin" });
  }
});

// Fetch ERP References for Chat Composer & Live Status Lookup for Shared ERP Cards
chatRouter.get("/api/chat/erp-references", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const prs = db
      .prepare(
        `
      SELECT pr.id, pr.pr_number as doc_number, COALESCE(p.name, pr.project_id, 'General') as title,
             pr.status, pr.total_estimated_cost as amount, pr.urgency, pr.project_id as partner_name,
             pr.created_at
      FROM purchase_requests pr
      LEFT JOIN projects p ON pr.project_id = p.id
      WHERE COALESCE(pr.archived, 0) = 0
      ORDER BY pr.created_at DESC
      LIMIT 40
    `,
      )
      .all() as any[];

    const pos = db
      .prepare(
        `
      SELECT po.id, po.po_number as doc_number, po.supplier_name as title,
             po.status, COALESCE(po.grand_total, po.total_amount, 0) as amount,
             po.urgency, po.supplier_name as partner_name, po.created_at
      FROM purchase_orders po
      WHERE COALESCE(po.archived, 0) = 0
      ORDER BY po.created_at DESC
      LIMIT 40
    `,
      )
      .all() as any[];

    const projects = db
      .prepare(
        `
      SELECT p.id,
             p.id as doc_number,
             p.name as title,
             COALESCE(n.status, p.status, 'ISSUED') as ntp_status,
             p.status,
             COALESCE(
               (SELECT pfs.total_revenue FROM project_financial_summaries pfs WHERE pfs.project_id = p.id),
               (SELECT COALESCE(q.grand_total, q.amount, 0) FROM quotations q WHERE q.id = p.quotation_id),
               (SELECT SUM(b.required_qty * COALESCE(p.qty, 1) * b.unit_price) FROM boms b WHERE b.project_id = p.id),
               0
             ) as amount,
             COALESCE(p.urgency, 'NORMAL') as urgency,
             COALESCE(NULLIF(p.customer, ''), 'Internal') as partner_name,
             p.created_at
      FROM projects p
      LEFT JOIN ntps n ON n.project_id = p.id
      WHERE p.id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
        AND p.archived_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT 40
    `,
      )
      .all() as any[];

    const quotations = db
      .prepare(
        `
      SELECT q.id, q.quotation_number as doc_number, q.title,
             q.status, COALESCE(q.grand_total, q.amount, 0) as amount,
             'NORMAL' as urgency, COALESCE(c.name, 'Customer') as partner_name, q.created_at
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.archived_at IS NULL
      ORDER BY q.created_at DESC
      LIMIT 30
    `,
      )
      .all() as any[];

    const invoices = db
      .prepare(
        `
      SELECT ci.id, ci.ci_number as doc_number, COALESCE(ci.job_description, ci.ci_number) as title,
             ci.status, COALESCE(ci.grand_total, ci.total_amount, ci.amount, 0) as amount,
             'NORMAL' as urgency, COALESCE(c.name, 'Customer') as partner_name, ci.created_at
      FROM commercial_invoices ci
      LEFT JOIN customers c ON ci.customer_id = c.id
      ORDER BY ci.created_at DESC
      LIMIT 30
    `,
      )
      .all() as any[];

    const items = [
      ...projects.map((r) => ({
        id: r.id,
        doc_number: r.id,
        type: "NTP",
        title: `${r.id} - ${r.title}`,
        subtitle: r.title,
        status: r.ntp_status || r.status || "ISSUED",
        amount: Number(r.amount || 0),
        urgency: r.urgency || "NORMAL",
        partner_name: r.partner_name,
        requires_auth: ["DRAFT", "PENDING", "PENDING_NTP"].includes(
          String(r.status || "").toUpperCase(),
        ),
        url: `/quotations?tab=ntp&ntp_id=${encodeURIComponent(r.id)}`,
      })),
      ...prs.map((r) => ({
        id: r.id,
        doc_number: r.doc_number || r.id,
        type: "PR",
        title: `${r.doc_number} - ${r.title}`,
        subtitle: r.title,
        status: r.status || "DRAFTED",
        amount: Number(r.amount || 0),
        urgency: r.urgency || "NORMAL",
        partner_name: r.partner_name,
        requires_auth: ["DRAFT", "DRAFTED", "PENDING", "REVISION"].includes(
          String(r.status || "").toUpperCase(),
        ),
        url: `/engineering?tab=pr&highlight=${encodeURIComponent(r.id)}`,
      })),
      ...pos.map((r) => ({
        id: r.id,
        doc_number: r.doc_number || r.id,
        type: "PO",
        title: `${r.doc_number} - ${r.title}`,
        subtitle: r.title,
        status: r.status || "DRAFTED",
        amount: Number(r.amount || 0),
        urgency: r.urgency || "NORMAL",
        partner_name: r.partner_name,
        requires_auth: ["DRAFT", "DRAFTED", "PENDING", "REVISION"].includes(
          String(r.status || "").toUpperCase(),
        ),
        url: `/procurement?tab=po&highlight=${encodeURIComponent(r.id)}`,
      })),
      ...projects.map((r) => ({
        id: r.id,
        doc_number: r.id,
        type: "PROJECT",
        title: `${r.id} - ${r.title}`,
        subtitle: r.title,
        status: r.status || "ACTIVE",
        amount: Number(r.amount || 0),
        urgency: r.urgency || "NORMAL",
        partner_name: r.partner_name,
        requires_auth: ["DRAFT", "PENDING", "PENDING_NTP"].includes(
          String(r.status || "").toUpperCase(),
        ),
        url: `/quotations?tab=ntp&ntp_id=${encodeURIComponent(r.id)}`,
      })),
      ...quotations.map((r) => ({
        id: r.id,
        doc_number: r.doc_number || r.id,
        type: "QUOTATION",
        title: `${r.doc_number} - ${r.title}`,
        subtitle: r.title,
        status: r.status || "DRAFT",
        amount: Number(r.amount || 0),
        urgency: "NORMAL",
        partner_name: r.partner_name,
        requires_auth: ["DRAFT", "PENDING", "REVISION"].includes(
          String(r.status || "").toUpperCase(),
        ),
        url: `/quotations?highlight=${encodeURIComponent(r.id)}`,
      })),
      ...invoices.map((r) => ({
        id: r.id,
        doc_number: r.doc_number || r.id,
        type: "INVOICE",
        title: `${r.doc_number} - ${r.title}`,
        subtitle: r.title,
        status: r.status || "UNPAID",
        amount: Number(r.amount || 0),
        urgency: "NORMAL",
        partner_name: r.partner_name,
        requires_auth: ["DRAFT", "PENDING"].includes(String(r.status || "").toUpperCase()),
        url: `/invoices?highlight=${encodeURIComponent(r.id)}`,
      })),
    ];

    res.json({ success: true, items });
  } catch (e) {
    console.error("Failed to fetch ERP references:", e);
    res.status(500).json({ error: "Failed to fetch ERP references" });
  }
});

// Unified In-Place ERP Document Preview from Messages
chatRouter.get("/api/chat/erp-document-preview/:type/:id", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const rawType = String(req.params.type || "").trim().toUpperCase();
    const docId = String(req.params.id || "").trim();
    if (!docId) {
      return res.status(400).json({ error: "Document ID is required" });
    }

    // 1. NTP / PROJECT / WO
    if (rawType === "NTP" || rawType === "PROJECT" || rawType === "WO") {
      let row = db
        .prepare(
          `
        SELECT n.*,
               COALESCE(n.project_id, n.ntp_number, p.id) as ntp_number,
               p.id as resolved_project_id,
               p.name as project_name,
               COALESCE(NULLIF(p.customer, ''), c.name, q.customer_name_manual, 'Corporate Client') as customer_name,
               p.due_date as due_date,
               COALESCE(p.qty, 1) as qty,
               COALESCE(p.uom, 'Unit') as uom,
               COALESCE(p.urgency, 'NORMAL') as urgency,
               COALESCE(p.status, 'ACTIVE') as project_status,
               COALESCE(p.lifecycle_stage, 'ENGINEERING_PREP') as lifecycle_stage,
               p.remarks as remarks,
               p.quotation_id as resolved_quotation_id,
               q.quotation_number as quotation_number,
               COALESCE(q.grand_total, q.amount, 0) as quotation_amount
        FROM ntps n
        LEFT JOIN projects p ON n.project_id = p.id
        LEFT JOIN quotations q ON COALESCE(n.quotation_id, p.quotation_id) = q.id
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE n.id = ? OR n.project_id = ? OR n.ntp_number = ? OR p.id = ? OR p.spk_number = ?
        ORDER BY n.created_at DESC
        LIMIT 1
      `,
        )
        .get(docId, docId, docId, docId, docId) as any;

      if (!row) {
        const projOnly = db
          .prepare(
            `
          SELECT p.*,
                 COALESCE(NULLIF(p.customer, ''), c.name, q.customer_name_manual, 'Corporate Client') as customer_name,
                 q.quotation_number as quotation_number,
                 COALESCE(q.grand_total, q.amount, 0) as quotation_amount
          FROM projects p
          LEFT JOIN quotations q ON p.quotation_id = q.id
          LEFT JOIN customers c ON q.customer_id = c.id
          WHERE p.id = ? OR p.ntp_number = ? OR p.spk_number = ?
          LIMIT 1
        `,
          )
          .get(docId, docId, docId) as any;

        if (!projOnly) {
          return res.status(404).json({ error: "Project / NTP document not found" });
        }

        row = {
          id: projOnly.id,
          ntp_number: projOnly.ntp_number || projOnly.id,
          project_id: projOnly.id,
          resolved_project_id: projOnly.id,
          project_name: projOnly.name,
          customer_name: projOnly.customer_name,
          due_date: projOnly.due_date,
          qty: projOnly.qty || 1,
          uom: projOnly.uom || "Unit",
          urgency: projOnly.urgency || "NORMAL",
          status: projOnly.status || "ISSUED",
          project_status: projOnly.status || "ACTIVE",
          lifecycle_stage: projOnly.lifecycle_stage || "ENGINEERING_PREP",
          remarks: projOnly.remarks,
          quotation_id: projOnly.quotation_id,
          resolved_quotation_id: projOnly.quotation_id,
          quotation_number: projOnly.quotation_number,
          quotation_amount: projOnly.quotation_amount,
          created_at: projOnly.created_at,
        };
      }

      const projectPayload = {
        id: row.resolved_project_id || row.project_id || docId,
        name: row.project_name,
        customer: row.customer_name,
        due_date: row.due_date,
        qty: row.qty,
        uom: row.uom,
        urgency: row.urgency,
        status: row.project_status,
        lifecycle_stage: row.lifecycle_stage,
        remarks: row.remarks,
        quotation_id: row.resolved_quotation_id || row.quotation_id,
        ntp_id: row.id,
        ntp_number: row.ntp_number,
      };

      return res.json({
        success: true,
        docType: "NTP",
        data: { ntp: row, project: projectPayload },
      });
    }

    // 2. QUOTATION
    if (rawType === "QUOTATION" || rawType === "QT") {
      const q = db
        .prepare(
          `
        SELECT q.*,
          c.name as customer_name, c.npwp as customer_npwp, c.phone as customer_phone, c.email as customer_email,
          COALESCE(NULLIF(q.customer_name_manual, ''), c.name, 'Pelanggan Umum (Walk-in)') as display_customer_name,
          COALESCE(NULLIF(q.customer_phone_manual, ''), c.phone, '-') as display_customer_phone,
          (SELECT COALESCE(SUM(qty * unit_price), 0) * (1 - COALESCE(q.discount_rate, 0) / 100) FROM quotation_items qi WHERE qi.quotation_id = q.id) as net_amount,
          (SELECT p.id FROM projects p WHERE p.quotation_id = q.id AND p.archived_at IS NULL ORDER BY p.created_at DESC LIMIT 1) as linked_project_id,
          (SELECT COALESCE(p.id, n.ntp_number) FROM projects p LEFT JOIN ntps n ON n.project_id = p.id WHERE p.quotation_id = q.id AND p.archived_at IS NULL ORDER BY p.created_at DESC LIMIT 1) as linked_ntp_number
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE q.id = ? OR q.quotation_number = ?
        LIMIT 1
      `,
        )
        .get(docId, docId) as any;

      if (!q) {
        return res.status(404).json({ error: "Quotation document not found" });
      }

      q.items = db
        .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
        .all(q.id);

      return res.json({
        success: true,
        docType: "QUOTATION",
        data: q,
      });
    }

    // 3. PURCHASE ORDER (PO)
    if (rawType === "PO") {
      const po = db
        .prepare(
          `
        SELECT po.*,
               s.phone as supplier_phone,
               s.email as supplier_email,
               GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers,
               GROUP_CONCAT(DISTINCT pr.project_id) as project_ids,
               GROUP_CONCAT(DISTINCT pr.drawing_reference) as drawing_references
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN pr_items pri ON po.id = pri.po_id
        LEFT JOIN purchase_requests pr ON pri.pr_id = pr.id
        WHERE po.id = ? OR po.po_number = ?
        GROUP BY po.id
        LIMIT 1
      `,
        )
        .get(docId, docId) as any;

      if (!po) {
        return res.status(404).json({ error: "Purchase Order (PO) not found" });
      }

      const items = db
        .prepare(
          `
        SELECT
          i.id as item_id,
          i.item_code,
          i.name as item_name,
          i.uom,
          i.unit_price as db_unit_price,
          COALESCE(MAX(pri.dimension), i.dimension) as dimension,
          COALESCE(MAX(pri.spec), i.spec) as spec,
          SUM(pri.qty) as qty,
          MAX(pri.unit_price) as unit_price,
          COALESCE((
            SELECT SUM(COALESCE(gi.qty_passed, CASE WHEN g.qc_status = 'REJECTED' THEN 0 ELSE gi.qty_received END))
            FROM grn_items gi
            JOIN grns g ON gi.grn_id = g.id
            WHERE g.po_id = ? AND gi.item_id = i.id AND g.qc_status IN ('PASSED', 'CONDITIONAL')
          ), 0) as received_qty,
          COALESCE((
            SELECT SUM(COALESCE(gi.qty_rejected, CASE WHEN g.qc_status = 'REJECTED' THEN gi.qty_received ELSE 0 END))
            FROM grn_items gi
            JOIN grns g ON gi.grn_id = g.id
            WHERE g.po_id = ? AND gi.item_id = i.id
          ), 0) as rejected_qty
        FROM pr_items pri
        JOIN items i ON pri.item_id = i.id
        WHERE pri.po_id = ?
        GROUP BY i.id, i.item_code, i.name, i.uom, i.unit_price, i.dimension, i.spec
      `,
        )
        .all(po.id, po.id, po.id);

      return res.json({
        success: true,
        docType: "PO",
        data: { ...po, items },
      });
    }

    // 4. PURCHASE REQUEST (PR / REQ)
    if (rawType === "PR" || rawType === "REQ") {
      const pr = db
        .prepare(
          `
        SELECT
          pr.*,
          COALESCE(pr.title, pr.remarks, p.name, pr.project_id) as project_name,
          COALESCE(pr.title, pr.remarks, p.name, pr.project_id) as title,
          COALESCE(pr.department, 'PRODUCTION') as department,
          COALESCE(pr.requested_by, pr.created_by, 'Staff') as created_by,
          s.spk_number
        FROM purchase_requests pr
        LEFT JOIN projects p ON pr.project_id = p.id
        LEFT JOIN spks s ON pr.spk_id = s.id OR p.spk_id = s.id
        WHERE pr.id = ? OR pr.pr_number = ?
        LIMIT 1
      `,
        )
        .get(docId, docId) as any;

      if (!pr) {
        return res.status(404).json({ error: "Purchase Request (PR) not found" });
      }

      const items = db
        .prepare(
          `
        SELECT pri.*,
               i.item_code,
               i.name as item_name,
               i.uom,
               COALESCE(inv.free_stock, 0) as free_stock
        FROM pr_items pri
        LEFT JOIN items i ON pri.item_id = i.id
        LEFT JOIN inventory inv ON inv.item_id = i.id
        WHERE pri.pr_id = ?
        ORDER BY COALESCE(pri.wave_number, 1) ASC, pri.id ASC
      `,
        )
        .all(pr.id) as any[];

      const estTotal =
        Number(pr.total_estimated_cost) > 0
          ? Number(pr.total_estimated_cost)
          : items.reduce(
              (acc, it) => acc + Number(it.qty || 0) * Number(it.unit_price || 0),
              0,
            );

      return res.json({
        success: true,
        docType: "PR",
        data: { ...pr, total_estimated_cost: estTotal, items },
      });
    }

    // 5. COMMERCIAL INVOICE (INVOICE / CI)
    if (rawType === "INVOICE" || rawType === "CI") {
      const inv = db
        .prepare(
          `
        SELECT ci.*, dn.dn_number, COALESCE(c.name, ci.customer_id) as customer_name, p.name as project_name,
               (SELECT GROUP_CONCAT(p2.name, ', ') FROM projects p2 WHERE (dn.quotation_id IS NOT NULL AND p2.quotation_id = dn.quotation_id) OR (dn.project_id IS NOT NULL AND p2.id = dn.project_id) OR (ci.project_id IS NOT NULL AND p2.id = ci.project_id)) as project_names,
               bk.bank_name, bk.account_number, bk.account_holder, bk.branch,
               c.address as customer_address, c.email as customer_email, c.phone as customer_phone,
               COALESCE(q.discount_rate, q2.discount_rate, ci.discount_rate, 0) as quotation_discount_rate,
               COALESCE(q.tax_rate, q2.tax_rate, ci.ppn_rate, 12) as quotation_tax_rate,
               COALESCE(q.pph_rate, q2.pph_rate, ci.pph_rate, 2) as quotation_pph_rate,
               COALESCE(q.rounding_factor, q2.rounding_factor, ci.rounding_factor, 0) as quotation_rounding_factor,
               COALESCE(q.dpp, q2.dpp, ci.dpp, ci.amount) as quotation_dpp,
               COALESCE(q.grand_total, q2.grand_total, ci.grand_total, ci.total_amount) as quotation_grand_total
        FROM commercial_invoices ci
        LEFT JOIN delivery_notes dn ON ci.dn_id = dn.id
        LEFT JOIN customers c ON ci.customer_id = c.id
        LEFT JOIN projects p ON ci.project_id = p.id
        LEFT JOIN quotations q ON p.quotation_id = q.id
        LEFT JOIN quotations q2 ON dn.quotation_id = q2.id
        LEFT JOIN bank_accounts bk ON ci.bank_account_id = bk.id
        WHERE ci.id = ? OR ci.ci_number = ?
        LIMIT 1
      `,
        )
        .get(docId, docId) as any;

      if (!inv) {
        return res.status(404).json({ error: "Commercial Invoice not found" });
      }

      const batchItemsMap = inv.dn_id
        ? batchGetDeliveryNoteItemsWithPrices([inv.dn_id])
        : new Map<string, any[]>();
      inv.items = inv.dn_id ? batchItemsMap.get(inv.dn_id) || [] : [];

      const breakdown = calculateFinancialBreakdown({
        items: inv.items,
        grossAmount: Number(inv.gross_amount),
        discountRate:
          inv.discount_rate !== undefined && inv.discount_rate !== null
            ? Number(inv.discount_rate)
            : Number(inv.quotation_discount_rate || 0),
        discountAmount:
          inv.discount_amount !== undefined &&
          inv.discount_amount !== null &&
          Number(inv.discount_amount) > 0
            ? Number(inv.discount_amount)
            : undefined,
        taxRate:
          inv.ppn_rate !== undefined && inv.ppn_rate !== null
            ? Number(inv.ppn_rate)
            : Number(inv.quotation_tax_rate || 12),
        pphRate:
          inv.pph_rate !== undefined && inv.pph_rate !== null
            ? Number(inv.pph_rate)
            : Number(inv.quotation_pph_rate || 0),
        dpp:
          inv.dpp !== undefined && Number(inv.dpp) > 0
            ? Number(inv.dpp)
            : Number(inv.quotation_dpp || 0),
        roundingFactor:
          inv.rounding_factor !== undefined &&
          inv.rounding_factor !== null &&
          Number(inv.rounding_factor) !== 0
            ? Number(inv.rounding_factor)
            : Number(inv.quotation_rounding_factor || 0),
        grandTotal:
          Number(inv.grand_total) ||
          Number(inv.total_amount) ||
          Number(inv.quotation_grand_total),
      });

      const amountPaid = Number(inv.amount_paid) || 0;
      inv.gross_amount = breakdown.grossAmount;
      inv.discount_rate = breakdown.discountRate;
      inv.discount_amount = breakdown.discountAmount;
      inv.rounding_factor = breakdown.roundingFactor;
      inv.dpp = breakdown.dpp;
      inv.amount = breakdown.dpp;
      inv.ppn_rate = breakdown.taxRate;
      inv.pph_rate = breakdown.pphRate;
      inv.ppn = breakdown.ppnAmount;
      inv.pph = breakdown.pphAmount;
      inv.grand_total = breakdown.grandTotal;
      inv.total_amount = breakdown.grandTotal;
      inv.amount_paid = amountPaid;
      inv.remaining_amount = Math.max(0, breakdown.grandTotal - amountPaid);
      inv.issue_date = inv.created_at || new Date().toISOString();

      let days = 30;
      if (inv.payment_terms === "Net 14") days = 14;
      else if (inv.payment_terms === "Net 30") days = 30;
      else if (inv.payment_terms === "Net 45") days = 45;
      else if (inv.payment_terms === "Net 60") days = 60;
      else if (inv.payment_terms === "Net 90") days = 90;
      else if (inv.payment_terms === "Due on Receipt") days = 0;

      const issueDateObj = new Date(inv.created_at || Date.now());
      issueDateObj.setDate(issueDateObj.getDate() + days);
      inv.due_date = issueDateObj.toISOString();

      const bankAccounts = db
        .prepare("SELECT * FROM bank_accounts ORDER BY created_at ASC")
        .all();

      return res.json({
        success: true,
        docType: "INVOICE",
        data: { invoice: inv, bankAccounts },
      });
    }

    return res.status(400).json({ error: `Unsupported document preview type: ${rawType}` });
  } catch (e: any) {
    console.error("Failed to fetch ERP document preview:", e);
    res.status(500).json({ error: e.message || "Failed to load document preview" });
  }
});

// Direct Manager Authorization from Interactive Chat Card
chatRouter.post("/api/chat/erp-authorize", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const { type, id, pin, thread_id } = req.body;
    if (!type || !id || !pin) {
      return res.status(400).json({ error: "Document type, ID, and 6-digit Daily Auth Key are required." });
    }

    if (!isValidDailyAuthKey(username, String(pin).trim())) {
      return res.status(400).json({ error: "Invalid 6-digit Daily Auth Key. Please check your profile menu." });
    }

    const userRow = db
      .prepare("SELECT role, level, name FROM users WHERE LOWER(username) = LOWER(?)")
      .get(username) as any;

    const userRole = String((req as any).userRole || userRow?.role || "").toUpperCase();
    const userLevel = String((req as any).userLevel || userRow?.level || "").toUpperCase();
    const isExec = ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"].includes(userRole);
    const isManager = isExec || userLevel === "MANAGER";

    if (!isManager) {
      return res.status(403).json({
        error: "Only Department Managers or Executive accounts can authorize ERP documents.",
      });
    }

    const docType = String(type).toUpperCase();
    let docLabel = String(id);
    let newStatus = "AUTHORIZED";

    if (docType === "PR") {
      const pr = db
        .prepare("SELECT id, pr_number, status FROM purchase_requests WHERE id = ? OR pr_number = ?")
        .get(id, id) as any;
      if (!pr) return res.status(404).json({ error: "Purchase Requisition (PR) not found." });
      docLabel = pr.pr_number || pr.id;
      newStatus = "AUTHORIZED";
      const sig = `Authorized via Chat by ${username} (${userRole}) on ${new Date().toISOString()}`;
      db.prepare(
        "UPDATE purchase_requests SET status = 'AUTHORIZED', authorized_at = CURRENT_TIMESTAMP, authorized_doc = ? WHERE id = ?",
      ).run(sig, pr.id);
      try {
        syncProcurementTaskGantt(pr.id);
      } catch {}
      logAudit(username, "AUTHORIZE_PR", "PR", pr.id, `PR ${docLabel} authorized directly from Messages by ${username}`);
    } else if (docType === "PO") {
      const po = db
        .prepare("SELECT id, po_number, status FROM purchase_orders WHERE id = ? OR po_number = ?")
        .get(id, id) as any;
      if (!po) return res.status(404).json({ error: "Purchase Order (PO) not found." });
      docLabel = po.po_number || po.id;
      newStatus = "ISSUED";
      const sig = `Authorized via Chat by ${username} (${userRole}) on ${new Date().toISOString()}`;
      db.prepare(
        "UPDATE purchase_orders SET status = 'ISSUED', authorized_at = CURRENT_TIMESTAMP, auth_doc_name = ? WHERE id = ?",
      ).run(sig, po.id);
      logAudit(username, "AUTHORIZE_PO", "PO", po.id, `PO ${docLabel} authorized & issued directly from Messages by ${username}`);
    } else if (docType === "QUOTATION") {
      const q = db
        .prepare("SELECT id, quotation_number, status FROM quotations WHERE id = ? OR quotation_number = ?")
        .get(id, id) as any;
      if (!q) return res.status(404).json({ error: "Quotation not found." });
      docLabel = q.quotation_number || q.id;
      newStatus = "APPROVED";
      db.prepare("UPDATE quotations SET status = 'APPROVED' WHERE id = ?").run(q.id);
      logAudit(username, "APPROVE_QUOTATION", "QUOTATION", q.id, `Quotation ${docLabel} approved via Messages by ${username}`);
    } else if (docType === "PROJECT" || docType === "NTP") {
      const p = db
        .prepare("SELECT id, ntp_number, spk_number, name, status FROM projects WHERE id = ? OR ntp_number = ? OR spk_number = ?")
        .get(id, id, id) as any;
      if (!p) return res.status(404).json({ error: "Project / NTP not found." });
      docLabel = p.id;
      newStatus = "ISSUED";
      db.prepare("UPDATE projects SET status = 'ACTIVE', ntp_number = ?, spk_number = ? WHERE id = ?").run(p.id, p.id, p.id);
      db.prepare("UPDATE ntps SET status = 'ISSUED', ntp_number = ? WHERE project_id = ?").run(p.id, p.id);
      logAudit(username, "AUTHORIZE_NTP", "NTP", p.id, `NTP ${docLabel} authorized via Messages by ${username}`);
    } else {
      return res.status(400).json({ error: `Direct authorization is not supported for type ${docType}.` });
    }

    // Post an automatic authorization confirmation message into the chat thread
    if (thread_id) {
      const confirmMsgId = "MSG-" + crypto.randomUUID();
      const confirmText = `✅ *Digital e-Approval Confirmed*\nDocument **${docType} (${docLabel})** has been authorized by **${userRow?.name || username}** (${userRole} · ${isExec ? "EXEC" : userLevel}) → Status: **${newStatus}**.`;
      db.prepare(
        `INSERT INTO chat_messages (id, thread_id, sender_username, content) VALUES (?, ?, ?, ?)`,
      ).run(confirmMsgId, thread_id, username, confirmText);
    }

    res.json({
      success: true,
      doc_type: docType,
      doc_label: docLabel,
      new_status: newStatus,
      authorized_by: username,
    });
  } catch (e: any) {
    console.error("Failed to authorize ERP document from chat:", e);
    res.status(500).json({ error: e.message || "Failed to authorize document" });
  }
});

chatRouter.delete("/api/chat/messages/:id", (req, res) => {
  try {
    const username = getAuthUsername(req);
    if (!username) return res.status(401).json({ error: "Unauthorized" });

    const msg = db
      .prepare("SELECT sender_username FROM chat_messages WHERE id = ?")
      .get(req.params.id) as any;

    if (!msg) return res.status(404).json({ error: "Message not found" });

    const roleUpper = ((req as any).userRole || "").toUpperCase();
    const isOwner = msg.sender_username === username;
    const isExecutive = ["FC", "ADMIN", "SUPERADMIN"].includes(roleUpper);

    if (!isOwner && !isExecutive) {
      return res.status(403).json({ error: "Forbidden. Can only delete your own messages." });
    }

    db.prepare(
      "UPDATE chat_messages SET is_deleted = 1, is_pinned = 0, content = 'This message was deleted', file_url = NULL, file_name = NULL, file_size = NULL, file_type = NULL WHERE id = ?",
    ).run(req.params.id);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete message" });
  }
});


