import { Router } from "express";
import db from "../db/database.ts";
import { requireRole, getActor } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { outboxService } from "../services/outboxService.ts";

export const generalRequestsRouter = Router();

// Helper to get next sequence code for general requests (e.g. GRQ-202610-0001)
function generateNextRequestCode(): string {
  const now = new Date();
  const yearMonth = now.toISOString().slice(0, 7).replace("-", ""); // e.g. 202610
  const prefix = `GRQ-${yearMonth}-`;

  const lastRow = db
    .prepare("SELECT request_code FROM general_requests WHERE request_code LIKE ? ORDER BY request_code DESC LIMIT 1")
    .get(`${prefix}%`) as { request_code: string } | undefined;

  let seq = 1;
  if (lastRow?.request_code) {
    const parts = lastRow.request_code.split("-");
    const lastNum = parseInt(parts[2], 10);
    if (!isNaN(lastNum)) {
      seq = lastNum + 1;
    }
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// Helper to get next PR Number
function generateNextPrNumber(): string {
  const now = new Date();
  const yearMonth = now.toISOString().slice(0, 7).replace("-", "");
  const prefix = `PR-GEN-${yearMonth}-`;

  const lastRow = db
    .prepare("SELECT pr_number FROM purchase_requests WHERE pr_number LIKE ? ORDER BY pr_number DESC LIMIT 1")
    .get(`${prefix}%`) as { pr_number: string } | undefined;

  let seq = 1;
  if (lastRow?.pr_number) {
    const parts = lastRow.pr_number.split("-");
    const lastNum = parseInt(parts[3] || parts[2], 10);
    if (!isNaN(lastNum)) {
      seq = lastNum + 1;
    }
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// 1. KPI Stats Summary for Executive / Engineering Overview
generalRequestsRouter.get("/api/general-requests/stats", (req, res) => {
  try {
    const stats = db
      .prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END) as pending_review,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as ready_for_pr,
          SUM(CASE WHEN status = 'PR_GENERATED' THEN 1 ELSE 0 END) as pr_generated,
          SUM(CASE WHEN priority IN ('URGENT', 'CRITICAL') AND status != 'PR_GENERATED' THEN 1 ELSE 0 END) as urgent_open,
          COALESCE(SUM(estimated_total_cost), 0) as total_budget_est
        FROM general_requests
      `)
      .get() as any;

    res.json({
      success: true,
      stats: {
        total: Number(stats?.total || 0),
        pending_review: Number(stats?.pending_review || 0),
        ready_for_pr: Number(stats?.ready_for_pr || 0),
        pr_generated: Number(stats?.pr_generated || 0),
        urgent_open: Number(stats?.urgent_open || 0),
        total_budget_est: Number(stats?.total_budget_est || 0),
      },
    });
  } catch (err: any) {
    console.error("Error fetching general request stats:", err);
    res.status(500).json({ error: "Failed to fetch stats: " + err.message });
  }
});

// 2. List General Requests with Filters & Search
generalRequestsRouter.get("/api/general-requests", (req, res) => {
  try {
    const { status, category, department, priority, search } = req.query;

    let query = `
      SELECT 
        gr.*,
        COUNT(gri.id) as item_count,
        COALESCE(pr.status, NULL) as linked_pr_status,
        COALESCE(pr.authorized_at, NULL) as linked_pr_authorized_at
      FROM general_requests gr
      LEFT JOIN general_request_items gri ON gr.id = gri.request_id
      LEFT JOIN purchase_requests pr ON gr.pr_id = pr.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && typeof status === "string") {
      query += " AND gr.status = ?";
      params.push(status);
    }

    if (category && typeof category === "string") {
      query += " AND gr.category = ?";
      params.push(category);
    }

    if (department && typeof department === "string") {
      query += " AND gr.department = ?";
      params.push(department);
    }

    if (priority && typeof priority === "string") {
      query += " AND gr.priority = ?";
      params.push(priority);
    }

    if (search && typeof search === "string" && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      query += ` AND (
        LOWER(gr.request_code) LIKE ? OR 
        LOWER(gr.title) LIKE ? OR 
        LOWER(gr.requester_name) LIKE ? OR 
        LOWER(gr.justification) LIKE ? OR 
        LOWER(COALESCE(gr.pr_number, '')) LIKE ?
      )`;
      params.push(term, term, term, term, term);
    }

    query += " GROUP BY gr.id ORDER BY gr.created_at DESC";

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err: any) {
    console.error("Error fetching general requests:", err);
    res.status(500).json({ error: "Failed to fetch general requests: " + err.message });
  }
});

// 3. Get Single General Request with itemized BOM and stock availability
generalRequestsRouter.get("/api/general-requests/:id", (req, res) => {
  try {
    const { id } = req.params;
    const request = db.prepare("SELECT * FROM general_requests WHERE id = ? OR request_code = ?").get(id, id) as any;
    if (!request) {
      return res.status(404).json({ error: "General request not found" });
    }

    const items = db
      .prepare(`
        SELECT 
          gri.*,
          COALESCE(inv.free_stock, inv.quantity, 0) as current_free_stock,
          COALESCE(inv.name, gri.item_name) as master_item_name
        FROM general_request_items gri
        LEFT JOIN inventory inv ON gri.item_id = inv.id OR (gri.item_code IS NOT NULL AND gri.item_code = inv.item_code)
        WHERE gri.request_id = ?
        ORDER BY gri.created_at ASC
      `)
      .all(request.id) as any[];

    let linkedPr: any = null;
    if (request.pr_id) {
      linkedPr = db.prepare("SELECT * FROM purchase_requests WHERE id = ?").get(request.pr_id);
    }

    res.json({
      ...request,
      items,
      linkedPr,
    });
  } catch (err: any) {
    console.error("Error fetching general request details:", err);
    res.status(500).json({ error: "Failed to fetch general request details: " + err.message });
  }
});

// 4. Create New General Request with BOM Specification
generalRequestsRouter.post(
  "/api/general-requests",
  requireRole(["ENGINEERING", "PRODUCTION", "WAREHOUSE", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const {
        title,
        category,
        department,
        priority = "NORMAL",
        justification,
        drawing_reference,
        technical_specs,
        attachments_json = "[]",
        target_delivery_date,
        items = [],
      } = req.body;

      if (!title || !category || !department) {
        return res.status(400).json({ error: "Title, Category, and Department are required" });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "At least one BOM specification item is required" });
      }

      const actor = getActor(req);
      const userRow = db.prepare("SELECT name, username FROM users WHERE username = ?").get(actor) as any;
      const requesterName = userRow?.name || actor || "Staff";

      const requestId = "GRQ-" + Math.random().toString(36).substring(2, 11);
      const requestCode = generateNextRequestCode();

      // Calculate total
      let totalEst = 0;
      items.forEach((item: any) => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.estimated_unit_price) || 0;
        totalEst += qty * price;
      });

      const insertReq = db.prepare(`
        INSERT INTO general_requests (
          id, request_code, title, category, department,
          requester_name, requester_username, priority,
          justification, drawing_reference, technical_specs,
          attachments_json, target_delivery_date, status,
          estimated_total_cost, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, 'SUBMITTED',
          ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);

      const insertItem = db.prepare(`
        INSERT INTO general_request_items (
          id, request_id, item_id, item_code, item_name,
          specification, part_number, qty, uom,
          estimated_unit_price, estimated_subtotal, remarks
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
        )
      `);

      const runTx = db.transaction(() => {
        insertReq.run(
          requestId,
          requestCode,
          title.trim(),
          category,
          department,
          requesterName,
          actor,
          priority,
          justification || null,
          drawing_reference || null,
          technical_specs || null,
          typeof attachments_json === "string" ? attachments_json : JSON.stringify(attachments_json),
          target_delivery_date || null,
          totalEst,
        );

        items.forEach((item: any) => {
          const itemId = item.item_id || null;
          const itemCode = item.item_code || null;
          const itemName = item.item_name?.trim() || "Item Permintaan";
          const spec = item.specification || null;
          const partNo = item.part_number || null;
          const qty = Number(item.qty) || 1;
          const uom = (item.uom || "PCS").toUpperCase();
          const unitPrice = Number(item.estimated_unit_price) || 0;
          const subtotal = qty * unitPrice;
          const remarks = item.remarks || null;

          insertItem.run(
            "GRI-" + Math.random().toString(36).substring(2, 11),
            requestId,
            itemId,
            itemCode,
            itemName,
            spec,
            partNo,
            qty,
            uom,
            unitPrice,
            subtotal,
            remarks,
          );
        });
      });

      runTx();

      logAudit(
        actor,
        "CREATE_GENERAL_REQUEST",
        "GENERAL_REQUEST",
        requestId,
        `Created General Request ${requestCode}: ${title} (${items.length} items, Est Rp ${totalEst.toLocaleString("id-ID")})`
      );

      // Post forum alert if URGENT or CRITICAL
      if (priority === "URGENT" || priority === "CRITICAL") {
        try {
          const msgId = "SYS-" + Math.random().toString(36).substring(2, 9);
          db.prepare(`
            INSERT INTO chat_messages (id, thread_id, sender_username, content) 
            VALUES (?, ?, ?, ?)
          `).run(
            msgId,
            "THREAD-GENERAL",
            "SYSTEM",
            `🚨 **Permintaan Pengadaan Non-Project Darurat!**\n**No:** ${requestCode}\n**Judul:** ${title}\n**Departemen:** ${department} (${category})\n**Prioritas:** ${priority}\nMohon tim Engineering & Procurement segera menindaklanjuti.`
          );
        } catch (_) {}
      }

      res.json({
        success: true,
        id: requestId,
        request_code: requestCode,
        message: `General Request ${requestCode} berhasil diajukan dengan ${items.length} item BOM.`,
      });
    } catch (err: any) {
      console.error("Error creating general request:", err);
      res.status(500).json({ error: "Failed to create general request: " + err.message });
    }
  }
);

// 5. Update Existing General Request
generalRequestsRouter.put(
  "/api/general-requests/:id",
  requireRole(["ENGINEERING", "PRODUCTION", "WAREHOUSE", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const existing = db.prepare("SELECT * FROM general_requests WHERE id = ?").get(id) as any;
      if (!existing) {
        return res.status(404).json({ error: "General request not found" });
      }

      if (existing.status === "PR_GENERATED") {
        return res.status(400).json({ error: "Permintaan yang sudah dibuatkan PR tidak dapat diubah" });
      }

      const {
        title,
        category,
        department,
        priority = "NORMAL",
        justification,
        drawing_reference,
        technical_specs,
        target_delivery_date,
        items,
      } = req.body;

      const actor = getActor(req);

      let totalEst = existing.estimated_total_cost;
      const runTx = db.transaction(() => {
        if (Array.isArray(items)) {
          totalEst = items.reduce((acc: number, it: any) => acc + (Number(it.qty) || 0) * (Number(it.estimated_unit_price) || 0), 0);
          db.prepare("DELETE FROM general_request_items WHERE request_id = ?").run(id);

          const insertItem = db.prepare(`
            INSERT INTO general_request_items (
              id, request_id, item_id, item_code, item_name,
              specification, part_number, qty, uom,
              estimated_unit_price, estimated_subtotal, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          items.forEach((item: any) => {
            const qty = Number(item.qty) || 1;
            const price = Number(item.estimated_unit_price) || 0;
            insertItem.run(
              "GRI-" + Math.random().toString(36).substring(2, 11),
              id,
              item.item_id || null,
              item.item_code || null,
              item.item_name || "Item",
              item.specification || null,
              item.part_number || null,
              qty,
              (item.uom || "PCS").toUpperCase(),
              price,
              qty * price,
              item.remarks || null,
            );
          });
        }

        db.prepare(`
          UPDATE general_requests SET
            title = COALESCE(?, title),
            category = COALESCE(?, category),
            department = COALESCE(?, department),
            priority = COALESCE(?, priority),
            justification = ?,
            drawing_reference = ?,
            technical_specs = ?,
            target_delivery_date = ?,
            estimated_total_cost = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          title || existing.title,
          category || existing.category,
          department || existing.department,
          priority || existing.priority,
          justification !== undefined ? justification : existing.justification,
          drawing_reference !== undefined ? drawing_reference : existing.drawing_reference,
          technical_specs !== undefined ? technical_specs : existing.technical_specs,
          target_delivery_date !== undefined ? target_delivery_date : existing.target_delivery_date,
          totalEst,
          id,
        );
      });

      runTx();
      res.json({ success: true, message: `General request ${existing.request_code} updated.` });
    } catch (err: any) {
      console.error("Error updating general request:", err);
      res.status(500).json({ error: "Failed to update general request: " + err.message });
    }
  }
);

// 6. Approve General Request
generalRequestsRouter.post(
  "/api/general-requests/:id/approve",
  requireRole(["ENGINEERING", "PRODUCTION", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const actor = getActor(req);

      const existing = db.prepare("SELECT * FROM general_requests WHERE id = ?").get(id) as any;
      if (!existing) {
        return res.status(404).json({ error: "General request not found" });
      }

      if (existing.status === "PR_GENERATED") {
        return res.status(400).json({ error: "Permintaan sudah dalam status PR Generated" });
      }

      db.prepare(`
        UPDATE general_requests SET 
          status = 'APPROVED',
          approved_by = ?,
          approved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(actor, id);

      logAudit(
        actor,
        "APPROVE_GENERAL_REQUEST",
        "GENERAL_REQUEST",
        id,
        `Approved general request ${existing.request_code} (${existing.title})`
      );

      res.json({ success: true, message: `Permintaan ${existing.request_code} telah disetujui & siap dibuatkan PR.` });
    } catch (err: any) {
      console.error("Error approving general request:", err);
      res.status(500).json({ error: "Failed to approve request: " + err.message });
    }
  }
);

// 7. ROBUST BRIDGE: 1-Click Convert General Request to Official Purchase Requisition (PR)
generalRequestsRouter.post(
  "/api/general-requests/:id/generate-pr",
  requireRole(["ENGINEERING", "PURCHASING", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const actor = getActor(req);

      const gr = db.prepare("SELECT * FROM general_requests WHERE id = ?").get(id) as any;
      if (!gr) {
        return res.status(404).json({ error: "General request not found" });
      }

      if (gr.status === "PR_GENERATED" && gr.pr_number) {
        return res.status(400).json({
          error: `PR sudah pernah dibuat untuk permintaan ini: ${gr.pr_number}`,
          pr_id: gr.pr_id,
          pr_number: gr.pr_number,
        });
      }

      const items = db.prepare("SELECT * FROM general_request_items WHERE request_id = ?").all(id) as any[];
      if (!items || items.length === 0) {
        return res.status(400).json({ error: "Permintaan tidak memiliki item BOM untuk diproses" });
      }

      // Ensure system general anchor exists
      const generalProject = db.prepare("SELECT id FROM projects WHERE id = 'GENERAL'").get() as any;
      if (!generalProject) {
        db.prepare(
          "INSERT OR IGNORE INTO projects (id, name, customer, status) VALUES ('GENERAL', 'General Procurement & Administrative', 'Internal Factory', 'ACTIVE')"
        ).run();
      }

      const prId = "PR-" + Math.random().toString(36).substring(2, 11);
      const prNumber = generateNextPrNumber();

      let deliveryDateStr = gr.target_delivery_date;
      if (!deliveryDateStr) {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        deliveryDateStr = d.toISOString().split("T")[0];
      }

      const prRemarks = `[General Request ${gr.request_code}] ${gr.title} - Dept: ${gr.department} | ${gr.justification || ""}`;

      const insertPr = db.prepare(`
        INSERT INTO purchase_requests (
          id, pr_number, project_id, drawing_reference,
          total_estimated_cost, status, urgency, category,
          remarks, expected_delivery_date, created_at
        ) VALUES (
          ?, ?, 'GENERAL', ?,
          ?, 'DRAFTED', ?, ?,
          ?, ?, CURRENT_TIMESTAMP
        )
      `);

      const insertPrItem = db.prepare(`
        INSERT INTO pr_items (
          id, pr_id, item_id, dimension, spec, qty, unit_price, expected_delivery_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateGr = db.prepare(`
        UPDATE general_requests SET
          status = 'PR_GENERATED',
          pr_id = ?,
          pr_number = ?,
          approved_by = COALESCE(approved_by, ?),
          approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      const runTx = db.transaction(() => {
        // 1. Insert PR
        insertPr.run(
          prId,
          prNumber,
          gr.drawing_reference || gr.request_code,
          gr.estimated_total_cost,
          gr.priority || "NORMAL",
          gr.category || "GENERAL",
          prRemarks,
          deliveryDateStr,
        );

        // 2. Insert PR Items
        items.forEach((item: any) => {
          const priId = "PRI-" + Math.random().toString(36).substring(2, 11);
          const itemSpec = item.part_number
            ? `[${item.item_name}] Part: ${item.part_number} - ${item.specification || ""}`
            : `[${item.item_name}] ${item.specification || ""}`;

          insertPrItem.run(
            priId,
            prId,
            item.item_id || null,
            item.uom || "PCS",
            itemSpec,
            item.qty,
            item.estimated_unit_price,
            deliveryDateStr,
          );
        });

        // 3. Mark General Request as PR_GENERATED
        updateGr.run(prId, prNumber, actor, id);
      });

      runTx();

      logAudit(
        actor,
        "GENERATE_PR_FROM_GENERAL_REQUEST",
        "PURCHASE_REQUEST",
        prId,
        `Generated Purchase Request ${prNumber} from General Request ${gr.request_code} with ${items.length} items.`
      );

      // Trigger Outbox event for cloud sync
      try {
        outboxService.enqueueEvent({
          aggregate_type: "PURCHASE_REQUESTS",
          aggregate_id: prId,
          event_type: "CREATE",
          payload: {
            id: prId,
            pr_number: prNumber,
            project_id: "GENERAL",
            category: gr.category,
            item_count: items.length,
          },
        });
      } catch (_) {}

      res.json({
        success: true,
        pr_id: prId,
        pr_number: prNumber,
        message: `Purchase Request ${prNumber} berhasil diterbitkan dan masuk ke antrean Pengadaan / Procurement!`,
      });
    } catch (err: any) {
      console.error("Error generating PR from general request:", err);
      res.status(500).json({ error: "Failed to generate PR: " + err.message });
    }
  }
);

// 8. Delete General Request
generalRequestsRouter.delete(
  "/api/general-requests/:id",
  requireRole(["ENGINEERING", "PRODUCTION", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const gr = db.prepare("SELECT * FROM general_requests WHERE id = ?").get(id) as any;
      if (!gr) {
        return res.status(404).json({ error: "General request not found" });
      }

      if (gr.status === "PR_GENERATED") {
        return res.status(400).json({ error: "Tidak dapat menghapus permintaan yang sudah terbit PR-nya" });
      }

      db.prepare("DELETE FROM general_requests WHERE id = ?").run(id);

      logAudit(
        getActor(req),
        "DELETE_GENERAL_REQUEST",
        "GENERAL_REQUEST",
        id,
        `Deleted General Request ${gr.request_code}`
      );

      res.json({ success: true, message: `Permintaan ${gr.request_code} berhasil dihapus.` });
    } catch (err: any) {
      console.error("Error deleting general request:", err);
      res.status(500).json({ error: "Failed to delete general request: " + err.message });
    }
  }
);
