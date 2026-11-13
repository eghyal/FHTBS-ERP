import { Router } from "express";
import db from "../db/database.ts";
import { requireRole, getActor } from "../middleware/auth.ts";
import { isValidDailyAuthKey } from "../utils/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { outboxService } from "../services/outboxService.ts";
import {
  ensureWorkflowApprovalRecord,
  recordWorkflowStepApproval,
} from "../services/workflowEngine.ts";

export const generalRequestsRouter = Router();

function generateNextRequestCode(): string {
  const now = new Date();
  const yearMonth = now.toISOString().slice(0, 7).replace("-", "");
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

function isFinishedGoodItem(item: { type?: string; item_type?: string; item_code?: string; category?: string }): boolean {
  const type = String(item.type || item.item_type || "").trim().toUpperCase();
  const code = String(item.item_code || "").trim().toUpperCase();
  const cat = String(item.category || "").trim().toUpperCase();
  return (
    type === "FINISHED" ||
    type === "FINISH_GOOD" ||
    type === "FINISH_GOODS" ||
    cat === "FG" ||
    code.startsWith("FG - ") ||
    code.startsWith("FG-") ||
    code.startsWith("FG ")
  );
}

function mapCategoryToItemType(category?: string): "RAW" | "TOOL" | "MACHINE" {
  const cat = String(category || "").trim().toUpperCase();
  if (cat === "TOOLING") return "TOOL";
  if (cat === "MAINTENANCE" || cat === "INFRASTRUCTURE") return "MACHINE";
  return "RAW";
}

function resolveItemMasterAndSsotPrice(rawItem: any): {
  masterItem: any | null;
  freeStock: number;
  ssotUnitPrice: number;
} {
  let masterItem: any = null;
  if (rawItem.item_id) {
    masterItem = db
      .prepare("SELECT * FROM items WHERE id = ? AND deleted_at IS NULL")
      .get(rawItem.item_id);
  }
  if (!masterItem && rawItem.item_code) {
    masterItem = db
      .prepare("SELECT * FROM items WHERE UPPER(TRIM(item_code)) = UPPER(TRIM(?)) AND deleted_at IS NULL")
      .get(String(rawItem.item_code));
  }
  if (!masterItem && rawItem.item_name) {
    masterItem = db
      .prepare("SELECT * FROM items WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND deleted_at IS NULL")
      .get(String(rawItem.item_name));
  }

  let freeStock = 0;
  let ssotUnitPrice = Number(rawItem.estimated_unit_price) || 0;

  if (masterItem) {
    const invRow = db
      .prepare("SELECT COALESCE(free_stock, available_qty, 0) as free_stock FROM inventory WHERE item_id = ?")
      .get(masterItem.id) as { free_stock: number } | undefined;
    freeStock = Math.max(0, Number(invRow?.free_stock || 0));

    const minVendorRow = db
      .prepare("SELECT MIN(unit_price) as min_price FROM item_supplier_prices WHERE item_id = ? AND unit_price > 0")
      .get(masterItem.id) as { min_price: number | null } | undefined;

    const authoritativePrice = Number(minVendorRow?.min_price || masterItem.unit_price || 0);
    if (authoritativePrice > 0) {
      ssotUnitPrice = authoritativePrice;
    }
  }

  return {
    masterItem,
    freeStock,
    ssotUnitPrice,
  };
}

/**
 * Core Closed-Loop Bridge: Evaluates live warehouse Free Stock for an approved General Request,
 * computes Net Shortage per item, and issues an AUTHORIZED Purchase Request (PR-GEN-...)
 * directly into the active Procurement Queue.
 */
function issueAuthorizedPrForGeneralRequest(
  requestId: string,
  actor: string,
  docSignature: string,
): {
  status: "STOCK_READY" | "PR_GENERATED";
  pr_id: string | null;
  pr_number: string | null;
  shortage_items_count: number;
  in_stock_items_count: number;
  net_procurement_cost: number;
} {
  const gr = db.prepare("SELECT * FROM general_requests WHERE id = ?").get(requestId) as any;
  if (!gr) {
    throw new Error("General request not found");
  }

  if (gr.pr_id && gr.pr_number) {
    const existingPr = db.prepare("SELECT id, pr_number, status FROM purchase_requests WHERE id = ?").get(gr.pr_id) as any;
    if (existingPr && existingPr.status !== "CANCELLED") {
      if (existingPr.status === "DRAFTED") {
        db.prepare(
          `UPDATE purchase_requests
           SET status = 'AUTHORIZED',
               authorized_at = COALESCE(authorized_at, CURRENT_TIMESTAMP),
               authorized_doc = COALESCE(authorized_doc, ?),
               workflow_current_role = 'COMPLETED'
           WHERE id = ?`,
        ).run(docSignature, existingPr.id);
      }
      return {
        status: "PR_GENERATED",
        pr_id: existingPr.id,
        pr_number: existingPr.pr_number,
        shortage_items_count: 1,
        in_stock_items_count: 0,
        net_procurement_cost: Number(gr.estimated_total_cost) || 0,
      };
    }
  }

  const items = db
    .prepare("SELECT * FROM general_request_items WHERE request_id = ? ORDER BY created_at ASC")
    .all(requestId) as any[];
  if (!items || items.length === 0) {
    throw new Error("General request has no BOM items to process");
  }

  // Ensure system GENERAL anchor exists in projects
  const generalProject = db.prepare("SELECT id FROM projects WHERE id = 'GENERAL'").get() as any;
  if (!generalProject) {
    db.prepare(
      "INSERT OR IGNORE INTO projects (id, name, customer, status) VALUES ('GENERAL', 'General Procurement & Administrative', 'Internal Factory', 'INTERNAL_OVERHEAD')",
    ).run();
  }

  let deliveryDateStr = gr.target_delivery_date;
  if (!deliveryDateStr) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    deliveryDateStr = d.toISOString().split("T")[0];
  }

  const evaluatedItems = items.map((item) => {
    const { masterItem, freeStock, ssotUnitPrice } = resolveItemMasterAndSsotPrice(item);
    const reqQty = Math.max(0, Number(item.qty) || 1);
    const shortageQty = Math.max(0, reqQty - freeStock);
    const finalUnitPrice = ssotUnitPrice > 0 ? ssotUnitPrice : Number(item.estimated_unit_price) || 0;

    return {
      ...item,
      masterItem,
      freeStock,
      reqQty,
      shortageQty,
      finalUnitPrice,
    };
  });

  const shortageItems = evaluatedItems.filter((it) => it.shortageQty > 0);
  const inStockItemsCount = evaluatedItems.length - shortageItems.length;
  const netProcurementCost = shortageItems.reduce(
    (sum, it) => sum + it.shortageQty * it.finalUnitPrice,
    0,
  );
  const fullBomCost = evaluatedItems.reduce(
    (sum, it) => sum + it.reqQty * it.finalUnitPrice,
    0,
  );

  const updateReqItemSnapshot = db.prepare(`
    UPDATE general_request_items
    SET item_id = COALESCE(?, item_id),
        item_code = COALESCE(?, item_code),
        available_stock_snapshot = ?,
        shortage_qty = ?,
        estimated_unit_price = ?,
        estimated_subtotal = ?
    WHERE id = ?
  `);

  // Case A: 100% of items are already available in Warehouse Free Stock (Net Shortage = 0)
  if (shortageItems.length === 0) {
    db.transaction(() => {
      for (const ev of evaluatedItems) {
        updateReqItemSnapshot.run(
          ev.masterItem?.id || ev.item_id || null,
          ev.masterItem?.item_code || ev.item_code || null,
          ev.freeStock,
          0,
          ev.finalUnitPrice,
          ev.reqQty * ev.finalUnitPrice,
          ev.id,
        );
      }

      db.prepare(`
        UPDATE general_requests
        SET status = 'STOCK_READY',
            approved_by = ?,
            approved_at = CURRENT_TIMESTAMP,
            authorized_doc = ?,
            revision_note = NULL,
            estimated_total_cost = ?,
            workflow_current_role = 'COMPLETED',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(actor, docSignature, fullBomCost, requestId);
    })();

    return {
      status: "STOCK_READY",
      pr_id: null,
      pr_number: null,
      shortage_items_count: 0,
      in_stock_items_count: inStockItemsCount,
      net_procurement_cost: 0,
    };
  }

  // Case B: One or more items have Net Shortage > 0 -> Generate AUTHORIZED PR for Procurement Queue
  const prId = "PR-" + Math.random().toString(36).substring(2, 11);
  const prNumber = generateNextPrNumber();
  const prRemarks = `[General Request ${gr.request_code}] ${gr.title} — Dept: ${gr.department} | ${gr.justification || "Authorized Department Requisition"}`;

  const insertPr = db.prepare(`
    INSERT INTO purchase_requests (
      id, pr_number, project_id, general_request_id, requested_by,
      drawing_reference, total_estimated_cost, status,
      authorized_at, authorized_doc, urgency, category,
      remarks, expected_delivery_date,
      workflow_step_index, workflow_total_steps, workflow_current_role,
      created_at
    ) VALUES (
      ?, ?, 'GENERAL', ?, ?,
      ?, ?, 'AUTHORIZED',
      CURRENT_TIMESTAMP, ?, ?, ?,
      ?, ?,
      1, 1, 'COMPLETED',
      CURRENT_TIMESTAMP
    )
  `);

  const insertPrItem = db.prepare(`
    INSERT INTO pr_items (
      id, pr_id, item_id, dimension, spec, qty, unit_price, expected_delivery_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    insertPr.run(
      prId,
      prNumber,
      requestId,
      gr.requester_name || actor,
      gr.drawing_reference || gr.request_code,
      netProcurementCost,
      docSignature,
      gr.priority || "NORMAL",
      gr.category || "GENERAL",
      prRemarks,
      deliveryDateStr,
    );

    for (const ev of evaluatedItems) {
      let resolvedItemId = ev.masterItem?.id || ev.item_id || null;
      let resolvedItemCode = ev.masterItem?.item_code || ev.item_code || null;
      const cleanDimension = (ev.dimension || ev.masterItem?.dimension || "").trim();
      const cleanSpec = (ev.part_number || ev.specification || ev.masterItem?.spec || "").trim();

      if (!resolvedItemId && ev.shortageQty > 0) {
        const mappedType = mapCategoryToItemType(gr.category);
        const generatedItemId = "ITM-GEN-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        resolvedItemCode = resolvedItemCode || generatedItemId;

        db.prepare(
          `INSERT OR IGNORE INTO items (
            id, item_code, name, uom, dimension, spec, type, category, unit_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          generatedItemId,
          resolvedItemCode,
          ev.item_name || "General Procurement Item",
          (ev.uom || "PCS").toUpperCase(),
          cleanDimension,
          cleanSpec,
          mappedType,
          gr.category || "GENERAL",
          ev.finalUnitPrice,
        );

        db.prepare(
          "INSERT OR IGNORE INTO inventory (item_id, free_stock, allocated_stock, physical_qty, available_qty) VALUES (?, 0, 0, 0, 0)",
        ).run(generatedItemId);

        resolvedItemId = generatedItemId;
      }

      updateReqItemSnapshot.run(
        resolvedItemId,
        resolvedItemCode,
        ev.freeStock,
        ev.shortageQty,
        ev.finalUnitPrice,
        ev.shortageQty > 0 ? ev.shortageQty * ev.finalUnitPrice : ev.reqQty * ev.finalUnitPrice,
        ev.id,
      );

      // Only push items with positive Net Shortage to Procurement PR
      if (ev.shortageQty > 0 && resolvedItemId) {
        const priId = "PRI-" + Math.random().toString(36).substring(2, 11);
        const formattedPrSpec = [
          ev.part_number ? `Part/Spec: ${ev.part_number}` : "",
          ev.specification && ev.specification !== cleanDimension ? ev.specification : "",
          ev.remarks ? `Note: ${ev.remarks}` : "",
        ]
          .filter(Boolean)
          .join(" · ") || cleanSpec || ev.item_name;

        insertPrItem.run(
          priId,
          prId,
          resolvedItemId,
          cleanDimension,
          formattedPrSpec,
          ev.shortageQty,
          ev.finalUnitPrice,
          deliveryDateStr,
        );
      }
    }

    db.prepare(`
      UPDATE general_requests
      SET status = 'PR_GENERATED',
          pr_id = ?,
          pr_number = ?,
          approved_by = ?,
          approved_at = CURRENT_TIMESTAMP,
          authorized_doc = ?,
          revision_note = NULL,
          estimated_total_cost = ?,
          workflow_current_role = 'COMPLETED',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(prId, prNumber, actor, docSignature, netProcurementCost, requestId);
  })();

  try {
    outboxService.enqueue(
      db,
      "PURCHASE_REQUESTS",
      prId,
      "CREATE",
      {
        id: prId,
        pr_number: prNumber,
        project_id: "GENERAL",
        general_request_id: requestId,
        status: "AUTHORIZED",
        category: gr.category,
        item_count: shortageItems.length,
        total_estimated_cost: netProcurementCost,
      },
      "BOTH",
    );
  } catch (_) {}

  return {
    status: "PR_GENERATED",
    pr_id: prId,
    pr_number: prNumber,
    shortage_items_count: shortageItems.length,
    in_stock_items_count: inStockItemsCount,
    net_procurement_cost: netProcurementCost,
  };
}

// 1. KPI Stats Summary for Executive / Engineering / Procurement Overview
generalRequestsRouter.get("/api/general-requests/stats", (req, res) => {
  try {
    const stats = db
      .prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('SUBMITTED', 'REVISION') THEN 1 ELSE 0 END) as pending_review,
          SUM(CASE WHEN status IN ('APPROVED', 'STOCK_READY') THEN 1 ELSE 0 END) as ready_for_pr,
          SUM(CASE WHEN status IN ('PR_GENERATED', 'PO_ISSUED', 'PO_AUTHORIZED', 'PARTIAL_RECEIVED', 'COMPLETED') THEN 1 ELSE 0 END) as pr_generated,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_grn,
          SUM(CASE WHEN priority IN ('URGENT', 'CRITICAL') AND status NOT IN ('COMPLETED', 'STOCK_READY') THEN 1 ELSE 0 END) as urgent_open,
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
        completed_grn: Number(stats?.completed_grn || 0),
        urgent_open: Number(stats?.urgent_open || 0),
        total_budget_est: Number(stats?.total_budget_est || 0),
      },
    });
  } catch (err: any) {
    console.error("Error fetching general request stats:", err);
    res.status(500).json({ error: "Failed to fetch stats: " + err.message });
  }
});

// 2. List General Requests with End-to-End Procurement Telemetry (PR -> PO -> GRN)
generalRequestsRouter.get("/api/general-requests", (req, res) => {
  try {
    const { status, category, department, priority, search } = req.query;
    const currentUser = {
      username: getActor(req),
      role: (req as any).userRole || "ENGINEERING",
      level: (req as any).userLevel || "STAFF",
    };

    let query = `
      SELECT 
        gr.*,
        COUNT(DISTINCT gri.id) as item_count,
        COALESCE(SUM(gri.shortage_qty), 0) as total_shortage_qty,
        COALESCE(pr.status, NULL) as linked_pr_status,
        COALESCE(pr.authorized_at, NULL) as linked_pr_authorized_at,
        COALESCE(po_agg.po_numbers, gr.po_number) as linked_po_numbers,
        COALESCE(po_agg.po_statuses, NULL) as linked_po_statuses,
        COALESCE(po_agg.supplier_names, gr.supplier_name) as linked_supplier_names,
        COALESCE(po_agg.total_ordered_qty, 0) as total_ordered_qty,
        COALESCE(po_agg.total_received_qty, 0) as total_received_qty,
        COALESCE(po_agg.passed_grn_count, 0) as passed_grn_count
      FROM general_requests gr
      LEFT JOIN general_request_items gri ON gr.id = gri.request_id
      LEFT JOIN purchase_requests pr ON gr.pr_id = pr.id
      LEFT JOIN (
        SELECT 
          pri.pr_id,
          GROUP_CONCAT(DISTINCT po.po_number) as po_numbers,
          GROUP_CONCAT(DISTINCT po.status) as po_statuses,
          GROUP_CONCAT(DISTINCT po.supplier_name) as supplier_names,
          SUM(pri.qty) as total_ordered_qty,
          COALESCE((
            SELECT SUM(gi.qty_received)
            FROM grn_items gi
            JOIN grns g ON gi.grn_id = g.id
            WHERE g.po_id IN (SELECT DISTINCT pri2.po_id FROM pr_items pri2 WHERE pri2.pr_id = pri.pr_id AND pri2.po_id IS NOT NULL)
              AND g.qc_status IN ('PASSED', 'CONDITIONAL')
          ), 0) as total_received_qty,
          (
            SELECT COUNT(DISTINCT g2.id)
            FROM grns g2
            WHERE g2.po_id IN (SELECT DISTINCT pri3.po_id FROM pr_items pri3 WHERE pri3.pr_id = pri.pr_id AND pri3.po_id IS NOT NULL)
              AND g2.qc_status IN ('PASSED', 'CONDITIONAL')
          ) as passed_grn_count
        FROM pr_items pri
        LEFT JOIN purchase_orders po ON pri.po_id = po.id AND po.status != 'CANCELLED'
        GROUP BY pri.pr_id
      ) po_agg ON gr.pr_id = po_agg.pr_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && typeof status === "string" && status !== "ALL") {
      query += " AND gr.status = ?";
      params.push(status);
    }

    if (category && typeof category === "string" && category !== "ALL") {
      query += " AND gr.category = ?";
      params.push(category);
    }

    if (department && typeof department === "string" && department !== "ALL") {
      query += " AND gr.department = ?";
      params.push(department);
    }

    if (priority && typeof priority === "string" && priority !== "ALL") {
      query += " AND gr.priority = ?";
      params.push(priority);
    }

    if (search && typeof search === "string" && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      query += ` AND (
        LOWER(gr.request_code) LIKE ? OR 
        LOWER(gr.title) LIKE ? OR 
        LOWER(gr.requester_name) LIKE ? OR 
        LOWER(COALESCE(gr.justification, '')) LIKE ? OR 
        LOWER(COALESCE(gr.pr_number, '')) LIKE ? OR
        LOWER(COALESCE(gr.po_number, '')) LIKE ?
      )`;
      params.push(term, term, term, term, term, term);
    }

    query += " GROUP BY gr.id ORDER BY gr.created_at DESC";

    const rows = db.prepare(query).all(...params) as any[];

    // Reconcile live downstream status & workflow step metadata
    const enrichedRows = rows.map((r) => {
      let resolvedStatus = r.status;
      if (r.pr_id) {
        const ordQty = Number(r.total_ordered_qty || 0);
        const recQty = Number(r.total_received_qty || 0);
        const poStatuses = String(r.linked_po_statuses || "");

        if ((ordQty > 0 && recQty >= ordQty && Number(r.passed_grn_count) > 0) || poStatuses.includes("RECEIVED") || poStatuses.includes("FINISHED")) {
          resolvedStatus = "COMPLETED";
        } else if (recQty > 0) {
          resolvedStatus = "PARTIAL_RECEIVED";
        } else if (poStatuses.includes("ISSUED") || poStatuses.includes("PARTIAL")) {
          resolvedStatus = "PO_AUTHORIZED";
        } else if (r.linked_po_numbers) {
          resolvedStatus = "PO_ISSUED";
        }
      }

      if (resolvedStatus !== r.status && ["PO_ISSUED", "PO_AUTHORIZED", "PARTIAL_RECEIVED", "COMPLETED"].includes(resolvedStatus)) {
        try {
          db.prepare("UPDATE general_requests SET status = ?, po_number = COALESCE(?, po_number) WHERE id = ?").run(
            resolvedStatus,
            r.linked_po_numbers || null,
            r.id,
          );
        } catch (_) {}
      }

      let wfInfo: any = null;
      if (resolvedStatus === "SUBMITTED") {
        try {
          wfInfo = ensureWorkflowApprovalRecord({
            documentType: "General Request",
            documentId: r.id,
            documentNumber: r.request_code || r.id,
            documentTitle: r.title || r.request_code,
            department: r.department || "ENGINEERING",
            amount: Number(r.estimated_total_cost) || 0,
            createdAt: r.created_at,
          });
        } catch (_) {}
      }

      return {
        ...r,
        status: resolvedStatus,
        workflow_step_index: wfInfo ? wfInfo.current_step_index : r.workflow_step_index || 0,
        workflow_total_steps: wfInfo ? wfInfo.required_roles.length : r.workflow_total_steps || 1,
        workflow_current_role:
          resolvedStatus === "SUBMITTED"
            ? wfInfo?.current_step_role || r.workflow_current_role || `${r.department}_MANAGER`
            : "COMPLETED",
        approved_steps: wfInfo?.approved_steps || [],
      };
    });

    res.json(enrichedRows);
  } catch (err: any) {
    console.error("Error fetching general requests:", err);
    res.status(500).json({ error: "Failed to fetch general requests: " + err.message });
  }
});

// 3. Get Single General Request with Itemized BOM, SSOT Price, Stock Snapshot, and Downstream PR/PO/GRN Details
generalRequestsRouter.get("/api/general-requests/:id", (req, res) => {
  try {
    const { id } = req.params;
    const request = db
      .prepare("SELECT * FROM general_requests WHERE id = ? OR request_code = ?")
      .get(id, id) as any;
    if (!request) {
      return res.status(404).json({ error: "General request not found" });
    }

    const items = db
      .prepare(`
        SELECT 
          gri.*,
          COALESCE(inv.free_stock, inv.available_qty, 0) as current_free_stock,
          COALESCE(i.name, gri.item_name) as master_item_name,
          COALESCE(i.dimension, gri.dimension, '') as resolved_dimension,
          COALESCE(
            (SELECT MIN(isp.unit_price) FROM item_supplier_prices isp WHERE isp.item_id = i.id AND isp.unit_price > 0),
            i.unit_price,
            gri.estimated_unit_price,
            0
          ) as ssot_unit_price,
          COALESCE(pri.qty, gri.shortage_qty, 0) as pr_ordered_qty,
          po.po_number as item_po_number,
          po.status as item_po_status,
          po.supplier_name as item_supplier_name,
          COALESCE((
            SELECT SUM(gi.qty_received)
            FROM grn_items gi
            JOIN grns g ON gi.grn_id = g.id
            WHERE g.po_id = po.id AND gi.item_id = i.id AND g.qc_status IN ('PASSED', 'CONDITIONAL')
          ), 0) as item_received_qty
        FROM general_request_items gri
        LEFT JOIN items i ON gri.item_id = i.id OR (gri.item_code IS NOT NULL AND gri.item_code != '' AND UPPER(TRIM(gri.item_code)) = UPPER(TRIM(i.item_code)))
        LEFT JOIN inventory inv ON i.id = inv.item_id
        LEFT JOIN pr_items pri ON (pri.pr_id = ? AND pri.item_id = i.id)
        LEFT JOIN purchase_orders po ON pri.po_id = po.id AND po.status != 'CANCELLED'
        WHERE gri.request_id = ?
        ORDER BY gri.created_at ASC
      `)
      .all(request.pr_id || "", request.id) as any[];

    let linkedPr: any = null;
    let linkedPos: any[] = [];
    let linkedGrns: any[] = [];

    if (request.pr_id) {
      linkedPr = db.prepare("SELECT * FROM purchase_requests WHERE id = ?").get(request.pr_id);
      linkedPos = db
        .prepare(`
          SELECT DISTINCT po.*
          FROM purchase_orders po
          JOIN pr_items pri ON pri.po_id = po.id
          WHERE pri.pr_id = ? AND po.status != 'CANCELLED'
          ORDER BY po.created_at DESC
        `)
        .all(request.pr_id) as any[];

      if (linkedPos.length > 0) {
        const poIds = linkedPos.map((p) => p.id);
        const ph = poIds.map(() => "?").join(",");
        linkedGrns = db
          .prepare(`
            SELECT g.*, po.po_number, po.supplier_name
            FROM grns g
            JOIN purchase_orders po ON g.po_id = po.id
            WHERE g.po_id IN (${ph})
            ORDER BY g.created_at DESC
          `)
          .all(...poIds) as any[];
      }
    }

    res.json({
      ...request,
      items: items.map((it) => {
        const freeStock = Number(it.current_free_stock || 0);
        const reqQty = Number(it.qty || 1);
        const computedShortage =
          request.status === "SUBMITTED" || request.status === "REVISION"
            ? Math.max(0, reqQty - freeStock)
            : Number(it.shortage_qty ?? Math.max(0, reqQty - freeStock));
        return {
          ...it,
          shortage_qty: computedShortage,
        };
      }),
      linkedPr,
      linkedPos,
      linkedGrns,
    });
  } catch (err: any) {
    console.error("Error fetching general request details:", err);
    res.status(500).json({ error: "Failed to fetch general request details: " + err.message });
  }
});

// 4. Create New General Request with Non-FG SSOT & Net Shortage Snapshot
generalRequestsRouter.post(
  "/api/general-requests",
  requireRole(["ENGINEERING", "PRODUCTION", "WAREHOUSE", "PURCHASING", "FINANCE", "PPIC", "QA_QC", "HR", "SALES", "FC", "ADMIN", "SUPERADMIN"]),
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

      // Enforce SSOT: Block Finished Goods in General Requests
      for (const item of items) {
        const { masterItem } = resolveItemMasterAndSsotPrice(item);
        if (isFinishedGoodItem(item) || (masterItem && isFinishedGoodItem(masterItem))) {
          return res.status(400).json({
            error: `SSOT Violation: Finished Goods (${item.item_code || item.item_name}) cannot be requested via General Request. Finished Goods belong exclusively to Production & Shop Management.`,
          });
        }
      }

      const actor = getActor(req);
      const userRow = db.prepare("SELECT name, username FROM users WHERE username = ?").get(actor) as any;
      const requesterName = userRow?.name || actor || "Staff";

      const requestId = "GRQ-" + Math.random().toString(36).substring(2, 11);
      const requestCode = generateNextRequestCode();

      const evaluatedItems = items.map((item: any) => {
        const { masterItem, freeStock, ssotUnitPrice } = resolveItemMasterAndSsotPrice(item);
        const qty = Math.max(1, Number(item.qty) || 1);
        const shortageQty = Math.max(0, qty - freeStock);
        const unitPrice = ssotUnitPrice > 0 ? ssotUnitPrice : Math.max(0, Number(item.estimated_unit_price) || 0);
        const effectiveCostQty = shortageQty > 0 ? shortageQty : qty;

        return {
          raw: item,
          masterItem,
          freeStock,
          qty,
          shortageQty,
          unitPrice,
          subtotal: effectiveCostQty * unitPrice,
        };
      });

      const totalShortageCost = evaluatedItems.reduce(
        (sum, it) => sum + it.shortageQty * it.unitPrice,
        0,
      );
      const totalFullCost = evaluatedItems.reduce(
        (sum, it) => sum + it.qty * it.unitPrice,
        0,
      );
      const totalEst = totalShortageCost > 0 ? totalShortageCost : totalFullCost;

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
          dimension, specification, part_number, qty, uom,
          available_stock_snapshot, shortage_qty,
          estimated_unit_price, estimated_subtotal, remarks
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?
        )
      `);

      db.transaction(() => {
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

        for (const ev of evaluatedItems) {
          const item = ev.raw;
          const itemId = ev.masterItem?.id || item.item_id || null;
          const itemCode = ev.masterItem?.item_code || item.item_code || null;
          const itemName = (item.item_name || ev.masterItem?.name || "Requested Item").trim();
          const dimension = item.dimension || ev.masterItem?.dimension || item.specification || null;
          const spec = item.specification || ev.masterItem?.spec || null;
          const partNo = item.part_number || ev.masterItem?.spec || null;
          const uom = (item.uom || ev.masterItem?.uom || "PCS").toUpperCase();
          const remarks = item.remarks || null;

          insertItem.run(
            "GRI-" + Math.random().toString(36).substring(2, 11),
            requestId,
            itemId,
            itemCode,
            itemName,
            dimension,
            spec,
            partNo,
            ev.qty,
            uom,
            ev.freeStock,
            ev.shortageQty,
            ev.unitPrice,
            ev.subtotal,
            remarks,
          );
        }
      })();

      // Register in ERP Workflow Engine for Department Authorization
      const wfApproval = ensureWorkflowApprovalRecord({
        documentType: "General Request",
        documentId: requestId,
        documentNumber: requestCode,
        documentTitle: title.trim(),
        department,
        amount: totalEst,
      });

      db.prepare(`
        UPDATE general_requests
        SET workflow_step_index = 0,
            workflow_total_steps = ?,
            workflow_current_role = ?,
            step_started_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        wfApproval.required_roles.length,
        wfApproval.current_step_role,
        requestId,
      );

      logAudit(
        actor,
        "CREATE_GENERAL_REQUEST",
        "GENERAL_REQUEST",
        requestId,
        `Created General Request ${requestCode}: ${title} (${items.length} items, Est Rp ${totalEst.toLocaleString("id-ID")}) — Awaiting [${wfApproval.current_step_role}] authorization.`,
      );

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
            `🚨 **Urgent Non-Project Requisition Submitted!**\n**No:** ${requestCode}\n**Title:** ${title}\n**Department:** ${department} (${category})\n**Priority:** ${priority}\n**Next Authorization Stage:** ${wfApproval.current_step_role}`,
          );
        } catch (_) {}
      }

      res.json({
        success: true,
        id: requestId,
        request_code: requestCode,
        workflow_current_role: wfApproval.current_step_role,
        message: `General Request ${requestCode} submitted. Awaiting department authorization from [${wfApproval.current_step_role}].`,
      });
    } catch (err: any) {
      console.error("Error creating general request:", err);
      res.status(500).json({ error: "Failed to create general request: " + err.message });
    }
  },
);

// 5. Update / Resubmit Existing General Request (Draft, Submitted, or Revision)
generalRequestsRouter.put(
  "/api/general-requests/:id",
  requireRole(["ENGINEERING", "PRODUCTION", "WAREHOUSE", "PURCHASING", "FINANCE", "PPIC", "QA_QC", "HR", "SALES", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const existing = db.prepare("SELECT * FROM general_requests WHERE id = ?").get(id) as any;
      if (!existing) {
        return res.status(404).json({ error: "General request not found" });
      }

      if (["PR_GENERATED", "PO_ISSUED", "PO_AUTHORIZED", "PARTIAL_RECEIVED", "COMPLETED"].includes(existing.status)) {
        return res.status(400).json({ error: "Requests that have already generated an active PR/PO cannot be modified" });
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

      if (Array.isArray(items)) {
        for (const item of items) {
          const { masterItem } = resolveItemMasterAndSsotPrice(item);
          if (isFinishedGoodItem(item) || (masterItem && isFinishedGoodItem(masterItem))) {
            return res.status(400).json({
              error: `SSOT Violation: Finished Goods (${item.item_code || item.item_name}) cannot be requested via General Request.`,
            });
          }
        }
      }

      const actor = getActor(req);
      let totalEst = existing.estimated_total_cost;
      const resolvedDept = department || existing.department;

      db.transaction(() => {
        if (Array.isArray(items) && items.length > 0) {
          db.prepare("DELETE FROM general_request_items WHERE request_id = ?").run(id);

          const insertItem = db.prepare(`
            INSERT INTO general_request_items (
              id, request_id, item_id, item_code, item_name,
              dimension, specification, part_number, qty, uom,
              available_stock_snapshot, shortage_qty,
              estimated_unit_price, estimated_subtotal, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          let shortageSum = 0;
          let fullSum = 0;

          items.forEach((item: any) => {
            const { masterItem, freeStock, ssotUnitPrice } = resolveItemMasterAndSsotPrice(item);
            const qty = Math.max(1, Number(item.qty) || 1);
            const shortageQty = Math.max(0, qty - freeStock);
            const price = ssotUnitPrice > 0 ? ssotUnitPrice : Math.max(0, Number(item.estimated_unit_price) || 0);
            const effectiveQty = shortageQty > 0 ? shortageQty : qty;
            const subtotal = effectiveQty * price;

            shortageSum += shortageQty * price;
            fullSum += qty * price;

            insertItem.run(
              "GRI-" + Math.random().toString(36).substring(2, 11),
              id,
              masterItem?.id || item.item_id || null,
              masterItem?.item_code || item.item_code || null,
              item.item_name || masterItem?.name || "Item",
              item.dimension || masterItem?.dimension || item.specification || null,
              item.specification || masterItem?.spec || null,
              item.part_number || masterItem?.spec || null,
              qty,
              (item.uom || masterItem?.uom || "PCS").toUpperCase(),
              freeStock,
              shortageQty,
              price,
              subtotal,
              item.remarks || null,
            );
          });

          totalEst = shortageSum > 0 ? shortageSum : fullSum;
        }

        // Reset workflow approval record to PENDING when revised & resubmitted
        db.prepare("DELETE FROM workflow_approvals WHERE document_type = 'General Request' AND document_id = ?").run(id);

        const wfApproval = ensureWorkflowApprovalRecord({
          documentType: "General Request",
          documentId: id,
          documentNumber: existing.request_code,
          documentTitle: title || existing.title,
          department: resolvedDept,
          amount: totalEst,
        });

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
            status = 'SUBMITTED',
            revision_note = NULL,
            workflow_step_index = 0,
            workflow_total_steps = ?,
            workflow_current_role = ?,
            step_started_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          title || existing.title,
          category || existing.category,
          resolvedDept,
          priority || existing.priority,
          justification !== undefined ? justification : existing.justification,
          drawing_reference !== undefined ? drawing_reference : existing.drawing_reference,
          technical_specs !== undefined ? technical_specs : existing.technical_specs,
          target_delivery_date !== undefined ? target_delivery_date : existing.target_delivery_date,
          totalEst,
          wfApproval.required_roles.length,
          wfApproval.current_step_role,
          id,
        );
      })();

      logAudit(
        actor,
        "UPDATE_GENERAL_REQUEST",
        "GENERAL_REQUEST",
        id,
        `Updated and resubmitted General Request ${existing.request_code}`,
      );

      res.json({ success: true, message: `General request ${existing.request_code} updated and resubmitted for authorization.` });
    } catch (err: any) {
      console.error("Error updating general request:", err);
      res.status(500).json({ error: "Failed to update general request: " + err.message });
    }
  },
);

// 6. Standard ERP Revise Endpoint for General Request
generalRequestsRouter.post(
  "/api/general-requests/:id/revise",
  requireRole([
    "ENGINEERING",
    "PRODUCTION",
    "PURCHASING",
    "FINANCE",
    "WAREHOUSE",
    "PPIC",
    "QA_QC",
    "HR",
    "SALES",
    "FC",
    "DIRECTOR",
    "BOD",
    "ADMIN",
    "SUPERADMIN",
  ]),
  (req, res) => {
    const userRole = (req as any).userRole || "ENGINEERING";
    const userLevel = (req as any).userLevel || "STAFF";
    const actor = getActor(req);
    const isExec = ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"].includes(userRole);

    if (!isExec && userLevel !== "MANAGER" && userLevel !== "SUPERVISOR") {
      return res.status(403).json({
        error: "Access denied. Only Supervisors, Managers, or Executive accounts can return a General Request for revision.",
      });
    }

    try {
      const { id } = req.params;
      const { revision_note, pin } = req.body;

      if (pin && !isValidDailyAuthKey((req.headers["x-user-email"] as string) || actor, pin)) {
        return res.status(400).json({ error: "Invalid 6-digit Daily Authorization PIN" });
      }

      if (!revision_note || !String(revision_note).trim()) {
        return res.status(400).json({ error: "Revision note is required" });
      }

      const existing = db.prepare("SELECT * FROM general_requests WHERE id = ?").get(id) as any;
      if (!existing) {
        return res.status(404).json({ error: "General request not found" });
      }

      if (["PR_GENERATED", "PO_ISSUED", "PO_AUTHORIZED", "COMPLETED"].includes(existing.status)) {
        return res.status(400).json({ error: "Cannot revise a request that has already entered active procurement" });
      }

      db.transaction(() => {
        db.prepare(
          `UPDATE general_requests
           SET status = 'REVISION',
               revision_note = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(String(revision_note).trim(), id);

        db.prepare(
          `UPDATE workflow_approvals
           SET status = 'REVISION',
               updated_at = CURRENT_TIMESTAMP
           WHERE document_type = 'General Request' AND document_id = ?`,
        ).run(id);
      })();

      logAudit(
        actor,
        "REVISE_GENERAL_REQUEST",
        "GENERAL_REQUEST",
        id,
        `General Request ${existing.request_code} returned for revision: ${revision_note}`,
      );

      res.json({
        success: true,
        message: `General Request ${existing.request_code} marked for revision.`,
      });
    } catch (err: any) {
      console.error("Error revising general request:", err);
      res.status(500).json({ error: "Failed to revise request: " + err.message });
    }
  },
);

// 7. Standard ERP e-Approval for General Request + Automatic AUTHORIZED PR Generation (Net Shortage)
generalRequestsRouter.post(
  "/api/general-requests/:id/approve",
  requireRole(["ENGINEERING", "PRODUCTION", "PURCHASING", "FINANCE", "WAREHOUSE", "PPIC", "QA_QC", "HR", "SALES", "FC", "DIRECTOR", "BOD", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const { pin, authorized_doc } = req.body || {};
      const actor = getActor(req);
      const userRole = (req as any).userRole || "ENGINEERING";
      const userLevel = (req as any).userLevel || "STAFF";

      if (
        pin !== undefined &&
        !isValidDailyAuthKey((req.headers["x-user-email"] as string) || actor, pin)
      ) {
        return res.status(400).json({ error: "Invalid 6-digit Daily Authorization PIN" });
      }

      const existing = db.prepare("SELECT * FROM general_requests WHERE id = ?").get(id) as any;
      if (!existing) {
        return res.status(404).json({ error: "General request not found" });
      }

      if (["PR_GENERATED", "PO_ISSUED", "PO_AUTHORIZED", "COMPLETED"].includes(existing.status)) {
        return res.status(400).json({ error: "Request is already authorized and in Procurement" });
      }

      const wfResult = recordWorkflowStepApproval({
        documentType: "General Request",
        documentId: id,
        documentNumber: existing.request_code || id,
        documentTitle: existing.title || existing.request_code,
        department: existing.department || "ENGINEERING",
        amount: Number(existing.estimated_total_cost) || 0,
        user: {
          username: actor,
          name: (req as any).user?.name || actor,
          role: userRole,
          level: userLevel,
        },
        executiveFastTrackAllSteps: true,
      });

      if (!wfResult.ok) {
        return res.status(403).json({ error: wfResult.error });
      }

      const docSignature =
        authorized_doc ||
        `Authorized by ${actor} (${userRole}/${userLevel}) on ${new Date().toISOString()}`;

      if (wfResult.isFinalStep) {
        db.prepare(`
          UPDATE general_requests SET 
            status = 'APPROVED',
            approved_by = ?,
            approved_at = CURRENT_TIMESTAMP,
            authorized_doc = ?,
            revision_note = NULL,
            updated_at = CURRENT_TIMESTAMP,
            workflow_step_index = ?,
            workflow_total_steps = ?,
            workflow_current_role = 'COMPLETED'
          WHERE id = ?
        `).run(
          actor,
          docSignature,
          wfResult.approval.required_roles.length,
          wfResult.approval.required_roles.length,
          id,
        );

        // Immediately bridge into Procurement Queue (Net Shortage -> AUTHORIZED PR)
        const prOutcome = issueAuthorizedPrForGeneralRequest(id, actor, docSignature);

        logAudit(
          actor,
          "APPROVE_GENERAL_REQUEST_AND_ISSUE_PR",
          "GENERAL_REQUEST",
          id,
          prOutcome.pr_number
            ? `Final authorization [${wfResult.completedStepRole}] for ${existing.request_code}. Issued AUTHORIZED PR ${prOutcome.pr_number} (${prOutcome.shortage_items_count} net shortage item(s)) to Procurement Queue.`
            : `Final authorization [${wfResult.completedStepRole}] for ${existing.request_code}. 100% of items available in Warehouse Free Stock (STOCK_READY).`,
        );

        return res.json({
          success: true,
          is_final_step: true,
          completed_step: wfResult.completedStepRole,
          next_step: null,
          status: prOutcome.status,
          pr_id: prOutcome.pr_id,
          pr_number: prOutcome.pr_number,
          shortage_items_count: prOutcome.shortage_items_count,
          in_stock_items_count: prOutcome.in_stock_items_count,
          message: prOutcome.pr_number
            ? `Authorized! Purchase Request ${prOutcome.pr_number} (AUTHORIZED · ${prOutcome.shortage_items_count} net shortage item(s)) is now live in the Procurement Queue.`
            : `Authorized! All ${prOutcome.in_stock_items_count} item(s) are 100% available in Warehouse Free Stock (No external PO required).`,
        });
      } else {
        db.prepare(`
          UPDATE general_requests SET 
            workflow_step_index = ?,
            workflow_total_steps = ?,
            workflow_current_role = ?,
            step_started_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          wfResult.approval.current_step_index,
          wfResult.approval.required_roles.length,
          wfResult.nextStepRole,
          id,
        );

        logAudit(
          actor,
          "APPROVE_GENERAL_REQUEST_STEP",
          "GENERAL_REQUEST",
          id,
          `Approved step [${wfResult.completedStepRole}] for general request ${existing.request_code} (${existing.title}). Next stage: [${wfResult.nextStepRole}]`,
        );

        return res.json({
          success: true,
          is_final_step: false,
          completed_step: wfResult.completedStepRole,
          next_step: wfResult.nextStepRole,
          message: `Stage [${wfResult.completedStepRole}] authorized. Awaiting next stage: [${wfResult.nextStepRole}].`,
        });
      }
    } catch (err: any) {
      console.error("Error approving general request:", err);
      res.status(500).json({ error: "Failed to approve request: " + err.message });
    }
  },
);

// 8. Manual / Direct Bridge to Convert Approved General Request to Authorized PR
generalRequestsRouter.post(
  "/api/general-requests/:id/generate-pr",
  requireRole(["PPIC", "ENGINEERING", "PURCHASING", "WAREHOUSE", "PRODUCTION", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const actor = getActor(req);
      const userRole = (req as any).userRole || "PURCHASING";
      const userLevel = (req as any).userLevel || "MANAGER";

      const gr = db.prepare("SELECT * FROM general_requests WHERE id = ?").get(id) as any;
      if (!gr) {
        return res.status(404).json({ error: "General request not found" });
      }

      const docSignature =
        gr.authorized_doc ||
        `Authorized by ${actor} (${userRole}/${userLevel}) on ${new Date().toISOString()}`;

      const outcome = issueAuthorizedPrForGeneralRequest(id, actor, docSignature);

      logAudit(
        actor,
        "GENERATE_PR_FROM_GENERAL_REQUEST",
        "PURCHASE_REQUEST",
        outcome.pr_id || id,
        outcome.pr_number
          ? `Generated AUTHORIZED Purchase Request ${outcome.pr_number} from General Request ${gr.request_code} (${outcome.shortage_items_count} net shortage item(s)).`
          : `Verified General Request ${gr.request_code} is 100% satisfied by Warehouse Free Stock.`,
      );

      res.json({
        success: true,
        status: outcome.status,
        pr_id: outcome.pr_id,
        pr_number: outcome.pr_number,
        shortage_items_count: outcome.shortage_items_count,
        in_stock_items_count: outcome.in_stock_items_count,
        message: outcome.pr_number
          ? `Purchase Request ${outcome.pr_number} (AUTHORIZED) has been issued to the Procurement Queue!`
          : `All items are available in Warehouse Free Stock (Status: STOCK_READY).`,
      });
    } catch (err: any) {
      console.error("Error generating PR from general request:", err);
      res.status(500).json({ error: "Failed to generate PR: " + err.message });
    }
  },
);

// 9. Delete General Request
generalRequestsRouter.delete(
  "/api/general-requests/:id",
  requireRole(["PPIC", "ENGINEERING", "PRODUCTION", "PURCHASING", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const { id } = req.params;
      const gr = db.prepare("SELECT * FROM general_requests WHERE id = ?").get(id) as any;
      if (!gr) {
        return res.status(404).json({ error: "General request not found" });
      }

      if (["PR_GENERATED", "PO_ISSUED", "PO_AUTHORIZED", "COMPLETED"].includes(gr.status)) {
        return res.status(400).json({ error: "Cannot delete a request that already has an active PR/PO in Procurement" });
      }

      db.transaction(() => {
        db.prepare("DELETE FROM workflow_approvals WHERE document_type = 'General Request' AND document_id = ?").run(id);
        db.prepare("DELETE FROM general_requests WHERE id = ?").run(id);
      })();

      logAudit(
        getActor(req),
        "DELETE_GENERAL_REQUEST",
        "GENERAL_REQUEST",
        id,
        `Deleted General Request ${gr.request_code}`,
      );

      res.json({ success: true, message: `Request ${gr.request_code} deleted successfully.` });
    } catch (err: any) {
      console.error("Error deleting general request:", err);
      res.status(500).json({ error: "Failed to delete general request: " + err.message });
    }
  },
);
