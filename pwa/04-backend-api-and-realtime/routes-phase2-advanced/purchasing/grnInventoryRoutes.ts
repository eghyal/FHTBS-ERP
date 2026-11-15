import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { syncProcurementTaskGantt } from "../../utils/ganttUtils.ts";
import { postGoodsReceiptJournal, assertAccountingPeriodOpen } from "../../utils/accountingBridge.ts";
import { syncProjectMaterialAndWakeProcesses } from "../production/utils.ts";
import { cacheService } from "../../services/cacheService.ts";
import { outboxService } from "../../services/outboxService.ts";
import { reconcileWaveAndPlanLifecycleByPo } from "./procurementPlanRoutes.ts";

export function registerGrnInventoryRoutes(purchasingRouter: Router) {
  const ensureGrnItemSplitColumns = () => {
    try {
      const cols = db.prepare("PRAGMA table_info(grn_items)").all() as any[];
      const names = new Set(cols.map((c) => c.name));
      if (!names.has("qty_passed")) {
        db.prepare("ALTER TABLE grn_items ADD COLUMN qty_passed REAL").run();
      }
      if (!names.has("qty_rejected")) {
        db.prepare("ALTER TABLE grn_items ADD COLUMN qty_rejected REAL DEFAULT 0").run();
      }
      if (!names.has("batch_lot_number")) {
        db.prepare("ALTER TABLE grn_items ADD COLUMN batch_lot_number TEXT").run();
      }
    } catch (_) {}
  };

  purchasingRouter.post(
    "/api/purchasing/complete-grn",
    requireRole(["QA_QC", "WAREHOUSE", "PURCHASING", "ENGINEERING", "PRODUCTION", "FC", "ADMIN"]),
    (req, res) => {
      try {
        ensureGrnItemSplitColumns();
        const {
          po_id,
          received_date,
          engineering_user,
          qc_user,
          qc_status,
          remarks,
          rejected_grn_doc,
          items,
        } = req.body;

        const poCheck = db.prepare("SELECT status FROM purchase_orders WHERE id = ?").get(po_id) as any;
        if (!poCheck) {
          return res.status(404).json({ error: "Purchase Order (PO) not found." });
        }
        if (
          poCheck.status !== "ISSUED" &&
          poCheck.status !== "PARTIAL" &&
          poCheck.status !== "REJECTED"
        ) {
          return res.status(400).json({
            error: `Goods Receipt Note (GRN) rejected. PO status [${poCheck.status}] is not eligible for receiving (must be ISSUED, PARTIAL, or REJECTED for re-issue).`,
          });
        }

        const grnId = "GRN-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        const isReissue = rejected_grn_doc || poCheck.status === "REJECTED" ? 1 : 0;

        // Compute aggregate passed & rejected across items to derive accurate GRN disposition
        let totalDeliveredBatch = 0;
        let totalPassedBatch = 0;
        let totalRejectedBatch = 0;
        for (const item of items || []) {
          const deliv = Math.max(0, Number(item.qty_received || 0));
          const rej =
            item.qty_rejected !== undefined
              ? Math.max(0, Math.min(deliv, Number(item.qty_rejected || 0)))
              : qc_status === "REJECTED"
                ? deliv
                : 0;
          const pass =
            item.qty_passed !== undefined
              ? Math.max(0, Math.min(deliv, Number(item.qty_passed)))
              : Math.max(0, deliv - rej);
          totalDeliveredBatch += deliv;
          totalPassedBatch += pass;
          totalRejectedBatch += rej;
        }

        let effectiveQcStatus = qc_status || "PASSED";
        if (totalDeliveredBatch > 0) {
          if (totalPassedBatch === 0 && totalRejectedBatch > 0) {
            effectiveQcStatus = "REJECTED";
          } else if (totalPassedBatch > 0 && totalRejectedBatch > 0) {
            effectiveQcStatus = "CONDITIONAL";
          }
        }

        const insertGrn = db.prepare(`
        INSERT INTO grns (id, po_id, received_date, engineering_user, qc_user, qc_status, remarks, rejected_grn_doc, is_reissue)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
        const insertGrnItem = db.prepare(`
        INSERT INTO grn_items (id, grn_id, item_id, dimension, spec, qty_received, qty_passed, qty_rejected, batch_lot_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
        const updatePoStatus = db.prepare(
          "UPDATE purchase_orders SET status = ? WHERE id = ?",
        );

        const transaction = db.transaction(() => {
          for (const item of items) {
            const qtyRec = Math.max(0, Number(item.qty_received || 0));
            const qtyRej =
              item.qty_rejected !== undefined
                ? Math.max(0, Math.min(qtyRec, Number(item.qty_rejected || 0)))
                : effectiveQcStatus === "REJECTED"
                  ? qtyRec
                  : 0;
            const qtyPass =
              item.qty_passed !== undefined
                ? Math.max(0, Math.min(qtyRec, Number(item.qty_passed)))
                : Math.max(0, qtyRec - qtyRej);

            if (qtyPass > 0) {
              const orderedRow = db.prepare("SELECT COALESCE(SUM(qty), 0) as total FROM pr_items WHERE po_id = ? AND item_id = ?").get(po_id, item.item_id) as any;
              const prevRecRow = db.prepare(`
                SELECT COALESCE(SUM(COALESCE(gi.qty_passed, CASE WHEN g.qc_status = 'REJECTED' THEN 0 ELSE gi.qty_received END)), 0) as total
                FROM grn_items gi
                JOIN grns g ON gi.grn_id = g.id
                WHERE g.po_id = ? AND gi.item_id = ? AND g.qc_status IN ('PASSED', 'CONDITIONAL')
              `).get(po_id, item.item_id) as any;

              const orderedQty = orderedRow ? Number(orderedRow.total) : 0;
              const prevRecQty = prevRecRow ? Number(prevRecRow.total) : 0;

              if (orderedQty > 0 && (prevRecQty + qtyPass) > orderedQty) {
                throw new Error(`Over-receiving rejected! Item [${item.item_id}]: Ordered ${orderedQty}, Already Passed ${prevRecQty}, Incoming Passed ${qtyPass} (Exceeds PO Quantity).`);
              }
            }
          }

          insertGrn.run(
            grnId,
            po_id,
            received_date,
            engineering_user || (req as any).user?.name || (req as any).user?.username || "Authorized Staff",
            qc_user || engineering_user || (req as any).user?.name || (req as any).user?.username || "Authorized Staff",
            effectiveQcStatus,
            remarks || null,
            rejected_grn_doc || null,
            isReissue,
          );

          for (const item of items) {
            const qtyRec = Math.max(0, Number(item.qty_received || 0));
            const qtyRej =
              item.qty_rejected !== undefined
                ? Math.max(0, Math.min(qtyRec, Number(item.qty_rejected || 0)))
                : effectiveQcStatus === "REJECTED"
                  ? qtyRec
                  : 0;
            const qtyPass =
              item.qty_passed !== undefined
                ? Math.max(0, Math.min(qtyRec, Number(item.qty_passed)))
                : Math.max(0, qtyRec - qtyRej);

            const grnItemId =
              "GRI-" + Math.random().toString(36).substr(2, 9).toUpperCase();
            insertGrnItem.run(
              grnItemId,
              grnId,
              item.item_id,
              item.dimension || null,
              item.spec || null,
              qtyRec,
              qtyPass,
              qtyRej,
              item.batch_lot_number || null,
            );
          }

          const poItems = db
            .prepare(
              "SELECT item_id, SUM(qty) as ordered_qty FROM pr_items WHERE po_id = ? GROUP BY item_id"
            )
            .all(po_id) as { item_id: string, ordered_qty: number }[];
            
          const grnItems = db
            .prepare(
              `SELECT gi.item_id, SUM(COALESCE(gi.qty_passed, CASE WHEN g.qc_status = 'REJECTED' THEN 0 ELSE gi.qty_received END)) as received_qty
               FROM grn_items gi
               JOIN grns g ON gi.grn_id = g.id
               WHERE g.po_id = ? AND g.qc_status IN ('PASSED', 'CONDITIONAL')
               GROUP BY gi.item_id`
            )
            .all(po_id) as { item_id: string, received_qty: number }[];

          let allItemsFullyReceived = true;
          let anyItemReceived = false;
          let totalReceivedGlobal = 0;

          const receivedMap = new Map();
          grnItems.forEach(g => {
            receivedMap.set(g.item_id, g.received_qty);
            totalReceivedGlobal += g.received_qty;
          });

          poItems.forEach(p => {
            const recQty = receivedMap.get(p.item_id) || 0;
            if (recQty < p.ordered_qty) {
              allItemsFullyReceived = false;
            }
            if (recQty > 0) {
              anyItemReceived = true;
            }
          });

          let newStatus = "ISSUED";
          if (poItems.length > 0 && allItemsFullyReceived) {
            newStatus = "RECEIVED";
          } else if (anyItemReceived) {
            newStatus = "PARTIAL";
          } else if (effectiveQcStatus === "REJECTED" && totalReceivedGlobal === 0) {
            newStatus = "REJECTED";
          }

          updatePoStatus.run(newStatus, po_id);

          const nowIso = new Date().toISOString();
          outboxService.enqueue(
            db,
            "GRNS",
            grnId,
            "CREATE",
            {
              id: grnId,
              po_id,
              qc_status: effectiveQcStatus,
              received_date: nowIso.split("T")[0],
              status: "COMPLETED",
              created_at: nowIso
            },
            "BOTH"
          );
          outboxService.enqueue(
            db,
            "PURCHASE_ORDERS",
            po_id,
            "UPDATE",
            {
              id: po_id,
              status: newStatus,
              updated_at: nowIso
            },
            "BOTH"
          );

          try {
            if (qc_status === "PASSED" || newStatus === "RECEIVED") {
              db.prepare(`
                UPDATE general_requests
                SET status = 'COMPLETED',
                    grn_id = ?,
                    received_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE po_id = ? 
                   OR pr_id IN (SELECT pr_id FROM pr_items WHERE po_id = ?)
                   OR id IN (SELECT general_request_id FROM purchase_requests WHERE id IN (SELECT pr_id FROM pr_items WHERE po_id = ?))
              `).run(grnId, po_id, po_id, po_id);
            } else if (newStatus === "PARTIAL") {
              db.prepare(`
                UPDATE general_requests
                SET status = 'PARTIAL_RECEIVED',
                    grn_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE po_id = ? 
                   OR pr_id IN (SELECT pr_id FROM pr_items WHERE po_id = ?)
                   OR id IN (SELECT general_request_id FROM purchase_requests WHERE id IN (SELECT pr_id FROM pr_items WHERE po_id = ?))
              `).run(grnId, po_id, po_id, po_id);
            }
          } catch (grnSyncErr) {
            console.error("Failed to sync General Request from GRN:", grnSyncErr);
          }

          return grnId;
        });

        transaction();
        cacheService.invalidateNamespace("suppliers");
        reconcileWaveAndPlanLifecycleByPo(po_id);
        logAudit(
          req.headers["x-user-email"] as string,
          "COMPLETE_GRN",
          "GRN",
          po_id,
          `GRN completed for PO ${po_id}. Status: ${effectiveQcStatus}`,
        );

        try {
          const prs = db
            .prepare("SELECT DISTINCT pr_id FROM pr_items WHERE po_id = ?")
            .all(po_id) as { pr_id: string }[];
          for (const { pr_id } of prs) {
            syncProcurementTaskGantt(pr_id);
            
            const reqData = db.prepare("SELECT project_id FROM purchase_requests WHERE id = ?").get(pr_id) as any;
            if (reqData && reqData.project_id) {
              syncProjectMaterialAndWakeProcesses(
                reqData.project_id, 
                (req.headers["x-user-email"] as string) || "SYSTEM_GRN"
              );
            }
          }
        } catch (err) {
          console.error("Post-GRN Gantt sync failed:", err);
        }

        res.json({ success: true, grn_id: grnId, qc_status: effectiveQcStatus });
      } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error?.message || "Failed to complete GRN" });
      }
    },
  );

  purchasingRouter.get(
    "/api/warehouse/pending-incoming",
    requireRole(["WAREHOUSE", "QA_QC", "PURCHASING", "FC", "ADMIN"]),
    (_req, res) => {
      try {
        const pendingGRNs = db
          .prepare(
            `
        SELECT 
          g.*,
          po.po_number,
          po.supplier_name
        FROM grns g
        JOIN purchase_orders po ON g.po_id = po.id
        WHERE g.inventory_updated_at IS NULL AND g.qc_status IN ('PASSED', 'CONDITIONAL', 'REJECTED')
        ORDER BY g.received_date ASC
      `,
          )
          .all();

        const grnItems = db
          .prepare(
            `
        SELECT gi.*, i.item_code, i.name as item_name
        FROM grn_items gi
        JOIN items i ON gi.item_id = i.id
        WHERE gi.grn_id IN (
          SELECT id FROM grns WHERE inventory_updated_at IS NULL AND qc_status IN ('PASSED', 'CONDITIONAL', 'REJECTED')
        )
      `,
          )
          .all() as any[];

        const formatted = pendingGRNs.map((g: any) => ({
          ...g,
          items: grnItems.filter((i) => i.grn_id === g.id),
        }));

        res.json(formatted);
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: "Failed to fetch pending incoming GRNs" });
      }
    },
  );

  purchasingRouter.get(
    "/api/purchasing/grns",
    requireRole(["QA_QC", "WAREHOUSE", "PURCHASING", "PPIC", "ENGINEERING", "PRODUCTION", "FC", "ADMIN"]),
    (_req, res) => {
      try {
        ensureGrnItemSplitColumns();
        const allGrns = db
          .prepare(
            `
        SELECT 
          g.*,
          CASE WHEN g.inventory_updated_at IS NOT NULL THEN 1 ELSE 0 END as intake_completed,
          po.po_number,
          po.supplier_name,
          po.expected_date as po_expected_date,
          (SELECT GROUP_CONCAT(DISTINCT pr.pr_number) FROM pr_items pri JOIN purchase_requests pr ON pri.pr_id = pr.id WHERE pri.po_id = po.id) as pr_numbers,
          (SELECT GROUP_CONCAT(DISTINCT pr.project_id) FROM pr_items pri JOIN purchase_requests pr ON pri.pr_id = pr.id WHERE pri.po_id = po.id) as project_ids
        FROM grns g
        JOIN purchase_orders po ON g.po_id = po.id
        ORDER BY g.received_date DESC, g.rowid DESC
        LIMIT 200
      `
          )
          .all() as any[];

        const grnItems = db
          .prepare(
            `
        SELECT gi.*,
               COALESCE(gi.qty_passed, CASE WHEN g.qc_status = 'REJECTED' THEN 0 ELSE gi.qty_received END) as effective_qty_passed,
               COALESCE(gi.qty_rejected, CASE WHEN g.qc_status = 'REJECTED' THEN gi.qty_received ELSE 0 END) as effective_qty_rejected,
               i.item_code,
               i.name as item_name,
               i.uom,
               COALESCE(gi.dimension, i.dimension) as dimension,
               COALESCE(gi.spec, i.spec) as spec
        FROM grn_items gi
        JOIN grns g ON gi.grn_id = g.id
        JOIN items i ON gi.item_id = i.id
      `
          )
          .all() as any[];

        const formatted = allGrns.map((g: any) => ({
          ...g,
          items: grnItems.filter((i) => i.grn_id === g.id),
        }));

        res.json(formatted);
      } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch GRN history" });
      }
    }
  );

  purchasingRouter.post(
    "/api/purchasing/grn/:id/qc-inspect",
    requireRole(["QA_QC", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const { qc_status, remarks } = req.body;
        const validStatuses = ["PASSED", "CONDITIONAL", "REJECTED"];
        const normalizedStatus = String(qc_status || "").trim().toUpperCase();
        if (!validStatuses.includes(normalizedStatus)) {
          return res.status(400).json({ error: "Invalid QC status. Must be PASSED, CONDITIONAL, or REJECTED." });
        }

        const grn = db.prepare("SELECT * FROM grns WHERE id = ?").get(id) as any;
        if (!grn) {
          return res.status(404).json({ error: "GRN not found" });
        }
        if (grn.inventory_updated_at) {
          return res.status(400).json({ error: "GRN has already been intaken into physical inventory by Warehouse." });
        }

        const inspector = (req as any).username || (req as any).userEmail || "QA_QC Inspector";
        db.prepare(
          `UPDATE grns
           SET qc_status = ?,
               qc_user = ?,
               remarks = COALESCE(?, remarks)
           WHERE id = ?`
        ).run(normalizedStatus, inspector, remarks || null, id);

        if (grn.po_id) {
          reconcileWaveAndPlanLifecycleByPo(grn.po_id);
        }

        logAudit(
          inspector,
          "QC_INSPECT_GRN",
          "GRN",
          id,
          `QA/QC updated GRN ${id} disposition to ${normalizedStatus}`
        );

        res.json({
          success: true,
          id,
          qc_status: normalizedStatus,
          qc_user: inspector,
        });
      } catch (err: any) {
        console.error("Failed to update GRN QC status:", err);
        res.status(500).json({ error: err?.message || "Failed to update GRN QC status" });
      }
    }
  );

  purchasingRouter.post(
    "/api/warehouse/intake-grn",
    requireRole(["WAREHOUSE", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const { grn_id } = req.body;

        const grn = db
          .prepare("SELECT * FROM grns WHERE id = ?")
          .get(grn_id) as any;
        if (!grn) return res.status(404).json({ error: "GRN not found" });
        if (String(grn.qc_status || "").toUpperCase() === "REJECTED") {
          return res.status(400).json({
            error: `Warehouse Intake Blocked: GRN [${grn_id}] was REJECTED by QA/QC and cannot be intaken into physical inventory. Please issue a replacement GRN.`,
          });
        }
        if (grn.inventory_updated_at)
          return res
            .status(400)
            .json({ error: "GRN already intaken into inventory" });

        const items = db
          .prepare("SELECT * FROM grn_items WHERE grn_id = ?")
          .all(grn_id) as any[];

        const updateInventory = db.prepare(
          `INSERT INTO inventory (item_id, physical_qty, reserved_qty, available_qty, free_stock, allocated_stock) 
           VALUES (?, ?, 0, ?, ?, 0) 
           ON CONFLICT(item_id) DO UPDATE SET 
             physical_qty = COALESCE(inventory.physical_qty, 0) + excluded.physical_qty,
             available_qty = COALESCE(inventory.available_qty, 0) + excluded.available_qty,
             free_stock = COALESCE(inventory.free_stock, 0) + excluded.free_stock`,
        );
        const insertMovement = db.prepare(
          "INSERT INTO stock_movements (id, item_id, project_id, type, qty, reference_id) VALUES (?, ?, ?, ?, ?, ?)",
        );
        const insertLabel = db.prepare(
          "INSERT INTO inventory_labels (id, item_id, grn_id, original_qty, current_qty, project_id) VALUES (?, ?, ?, ?, ?, ?)",
        );

        const createdLabels: any[] = [];
        assertAccountingPeriodOpen(db);
        db.transaction(() => {
          const updGrn = db.prepare(
            "UPDATE grns SET inventory_updated_at = CURRENT_TIMESTAMP WHERE id = ? AND inventory_updated_at IS NULL",
          ).run(grn_id);
          if (updGrn.changes === 0) {
            throw new Error("GRN already intaken into inventory.");
          }

          db.prepare(`
            UPDATE notice_to_down_processes
            SET status = 'RESOLVED', resumed_at = CURRENT_TIMESTAMP, reason_detail = reason_detail || ' [AUTO-RESOLVED by Warehouse Scan]'
            WHERE reason_category = 'MATERIAL_SHORTAGE' AND status = 'ACTIVE'
            AND project_id IN (
              SELECT project_id FROM purchase_orders WHERE id = ?
            )
          `).run(grn.po_id);

          for (const item of items) {
            const prevReceivedResult = db
              .prepare(
                `
            SELECT COALESCE(SUM(COALESCE(gi.qty_passed, CASE WHEN g.qc_status = 'REJECTED' THEN 0 ELSE gi.qty_received END)), 0) as total
            FROM grn_items gi
            JOIN grns g ON gi.grn_id = g.id
            WHERE g.po_id = ? AND gi.item_id = ? AND g.id != ? AND g.qc_status IN ('PASSED', 'CONDITIONAL')
          `,
              )
              .get(grn.po_id, item.item_id, grn_id) as { total: number };

            let remainingToSkip = prevReceivedResult.total;
            let remainingQty =
              item.qty_passed !== undefined && item.qty_passed !== null
                ? Number(item.qty_passed)
                : Number(item.qty_received || 0);

            const prItems = db
              .prepare(
                `
            SELECT pri.id, pri.qty, pr.project_id 
            FROM pr_items pri
            JOIN purchase_requests pr ON pri.pr_id = pr.id
            WHERE pri.po_id = ? AND pri.item_id = ?
            ORDER BY pr.created_at ASC
          `,
              )
              .all(grn.po_id, item.item_id) as {
              id: string;
              qty: number;
              project_id: string;
            }[];

            for (const prItem of prItems) {
              if (remainingQty <= 0) break;

              let prItemRemainingQty = prItem.qty;
              if (remainingToSkip > 0) {
                const skipAmount = Math.min(
                  remainingToSkip,
                  prItemRemainingQty,
                );
                prItemRemainingQty -= skipAmount;
                remainingToSkip -= skipAmount;
              }

              if (prItemRemainingQty > 0) {
                const allocateQty = Math.min(
                  remainingQty,
                  prItemRemainingQty,
                );
                const labelId =
                  "LBL-" +
                  Math.random().toString(36).substr(2, 9).toUpperCase();

                const isProjectSpecific =
                  Boolean(prItem.project_id) &&
                  !["GENERAL", "CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(
                    String(prItem.project_id).toUpperCase(),
                  );

                if (isProjectSpecific) {
                  db.prepare(
                    `INSERT INTO inventory (item_id, physical_qty, reserved_qty, available_qty, free_stock, allocated_stock)
                     VALUES (?, ?, ?, 0, 0, ?)
                     ON CONFLICT(item_id) DO UPDATE SET
                       physical_qty = COALESCE(inventory.physical_qty, 0) + excluded.physical_qty,
                       reserved_qty = COALESCE(inventory.reserved_qty, 0) + excluded.reserved_qty,
                       allocated_stock = COALESCE(inventory.allocated_stock, 0) + excluded.allocated_stock`,
                  ).run(item.item_id, allocateQty, allocateQty, allocateQty);

                  db.prepare(
                    `INSERT INTO inventory_reservations (id, item_id, project_id, spk_id, qty, status)
                     VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
                  ).run(
                    `RES-GRN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
                    item.item_id,
                    prItem.project_id,
                    grn_id,
                    allocateQty,
                  );
                } else {
                  updateInventory.run(item.item_id, allocateQty, allocateQty, allocateQty);
                }

                insertMovement.run(
                  "MOV-" + Math.random().toString(36).substr(2, 9),
                  item.item_id,
                  prItem.project_id || null,
                  isProjectSpecific ? "GRN_ALLOCATION" : "GRN",
                  allocateQty,
                  grn_id,
                );
                insertLabel.run(
                  labelId,
                  item.item_id,
                  grn_id,
                  allocateQty,
                  allocateQty,
                  prItem.project_id || null,
                );
                createdLabels.push({
                  id: labelId,
                  item_id: item.item_id,
                  qty: allocateQty,
                  project_id: prItem.project_id || null,
                });
                remainingQty -= allocateQty;
              }
            }

            if (remainingQty > 0) {
              updateInventory.run(item.item_id, remainingQty, remainingQty, remainingQty);
              insertMovement.run(
                "MOV-" + Math.random().toString(36).substr(2, 9),
                item.item_id,
                null,
                "GRN",
                remainingQty,
                grn_id,
              );
              const labelId =
                "LBL-" +
                Math.random().toString(36).substr(2, 9).toUpperCase();
              insertLabel.run(
                labelId,
                item.item_id,
                grn_id,
                remainingQty,
                remainingQty,
                null,
              );
              createdLabels.push({
                id: labelId,
                item_id: item.item_id,
                qty: remainingQty,
                project_id: null,
              });
            }
          }

          try {
            const linkedPrIds = db
              .prepare("SELECT DISTINCT pr_id FROM pr_items WHERE po_id = ?")
              .all(grn.po_id) as { pr_id: string }[];

            for (const { pr_id } of linkedPrIds) {
              const unreceivedItems = db
                .prepare(
                  `SELECT COUNT(*) as cnt
                   FROM pr_items pri
                   LEFT JOIN purchase_orders po ON pri.po_id = po.id
                   WHERE pri.pr_id = ?
                     AND (pri.po_id IS NULL OR po.status NOT IN ('RECEIVED', 'FINISHED'))`,
                )
                .get(pr_id) as { cnt: number };

              if ((unreceivedItems?.cnt || 0) === 0) {
                db.prepare(
                  "UPDATE purchase_requests SET status = 'RECEIVED' WHERE id = ?",
                ).run(pr_id);
              }
            }

            db.prepare(`
              UPDATE general_requests
              SET status = 'COMPLETED',
                  grn_id = ?,
                  received_at = COALESCE(received_at, CURRENT_TIMESTAMP),
                  updated_at = CURRENT_TIMESTAMP
              WHERE po_id = ? 
                 OR pr_id IN (SELECT pr_id FROM pr_items WHERE po_id = ?)
                 OR id IN (SELECT general_request_id FROM purchase_requests WHERE id IN (SELECT pr_id FROM pr_items WHERE po_id = ?))
            `).run(grn_id, grn.po_id, grn.po_id, grn.po_id);
          } catch (_) {}
        })();

        cacheService.invalidateNamespace("items");

        const poRow = grn.po_id
          ? (db
              .prepare(
                "SELECT po_number, supplier_name FROM purchase_orders WHERE id = ? OR po_number = ?",
              )
              .get(grn.po_id, grn.po_id) as any)
          : null;
        const poNumber = poRow?.po_number || grn.po_id || "N/A";
        const supplierName = poRow?.supplier_name || "Supplier Partner";

        try {
          const grnValRow = db.prepare(`
            SELECT COALESCE(SUM(gi.qty_received * COALESCE(pri.unit_price, i.unit_price, 0)), 0) as total_val
            FROM grn_items gi
            LEFT JOIN pr_items pri ON (pri.po_id = ? AND pri.item_id = gi.item_id)
            LEFT JOIN items i ON gi.item_id = i.id
            WHERE gi.grn_id = ?
          `).get(grn.po_id, grn_id) as { total_val: number };

          const grnValue = Number(grnValRow?.total_val || 0);
          if (grnValue > 0) {
            postGoodsReceiptJournal(db, {
              grn_id,
              po_number: poNumber,
              total_inventory_cost: grnValue,
              user: (req.headers["x-user-email"] as string) || "WAREHOUSE",
            });
          }
        } catch (accErr) {
          console.error("Automated Accounting postGoodsReceiptJournal error:", accErr);
        }

        const uniqueLabelItemIds = Array.from(new Set(createdLabels.map((l) => l.item_id).filter(Boolean)));
        const itemInfoMap = new Map<string, any>();
        if (uniqueLabelItemIds.length > 0) {
          const ph = uniqueLabelItemIds.map(() => "?").join(",");
          const rows = db
            .prepare(`SELECT id, item_code, name, uom, dimension, spec, asset_class FROM items WHERE id IN (${ph})`)
            .all(...uniqueLabelItemIds) as any[];
          for (const r of rows) {
            itemInfoMap.set(r.id, r);
          }
        }

        const fullLabels = createdLabels.map((lbl) => {
          const itemInfo = itemInfoMap.get(lbl.item_id) || {};
          return {
            ...itemInfo,
            ...lbl,
            po_number: poNumber,
            supplier_name: supplierName,
            grn_id,
            received_date: grn.received_date || new Date().toISOString(),
          };
        });

        try {
          const projectIds = Array.from(new Set(createdLabels.map(l => l.project_id).filter(Boolean)));
          for (const pid of projectIds) {
            syncProjectMaterialAndWakeProcesses(pid, (req.headers["x-user-email"] as string) || "WAREHOUSE_INTAKE");
          }
        } catch (syncErr) {
          console.error("Error syncing project material wake after GRN intake:", syncErr);
        }

        outboxService.enqueue(
          db,
          "GRNS",
          grn_id,
          "UPDATE",
          { id: grn_id, qc_status: grn.qc_status || "PASSED", status: "STORED", updated_at: new Date().toISOString() },
          "BOTH"
        );
        for (const lbl of createdLabels) {
          outboxService.enqueue(
            db,
            "INVENTORY_LABELS",
            lbl.id,
            "CREATE",
            lbl,
            "BOTH"
          );
        }

        logAudit(
          req.headers["x-user-email"] as string,
          "WAREHOUSE_INTAKE",
          "GRN",
          grn_id,
          `GRN ${grn_id} intaken to warehouse.`,
        );
        res.json({
          success: true,
          labels: fullLabels,
          po_number: poNumber,
          supplier_name: supplierName,
          grn_id,
          received_date: grn.received_date || new Date().toISOString(),
        });
      } catch (error: any) {
        console.error(error);
        res
          .status(500)
          .json({ error: error.message || "Failed to intake GRN" });
      }
    },
  );

  purchasingRouter.post(
    "/api/warehouse/return-grn",
    requireRole(["WAREHOUSE", "QA_QC", "PURCHASING", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const id = req.body.grn_id || req.body.id;
        if (!id) return res.status(400).json({ error: "Missing GRN ID" });

        const grn = db
          .prepare("SELECT * FROM grns WHERE id = ?")
          .get(id) as any;
        if (!grn) return res.status(404).json({ error: "GRN not found" });
        if (grn.inventory_updated_at)
          return res.status(400).json({ error: "GRN already processed" });

        db.prepare(
          "UPDATE grns SET inventory_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        logAudit(
          req.headers["x-user-email"] as string,
          "WAREHOUSE_RETURN",
          "GRN",
          id,
          `Rejected GRN ${id} marked as returned to supplier.`,
        );
        res.json({ success: true });
      } catch (e: any) {
        console.error(e);
        res
          .status(500)
          .json({ error: e.message || "Failed to process return" });
      }
    },
  );

  purchasingRouter.post(
    "/api/inventory/return",
    requireRole(["PRODUCTION", "PPIC", "WAREHOUSE", "QA_QC", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const { item_id, qty, project_id, recorded_by } = req.body;

        const transaction = db.transaction(() => {
          if (project_id) {
            const project = db
              .prepare("SELECT status FROM projects WHERE id = ?")
              .get(project_id) as { status: string } | undefined;
            if (project && project.status === "FINISHED") {
              throw new Error("Cannot return items for a finished project.");
            }
          }

          db.prepare(
            `UPDATE inventory
             SET free_stock = COALESCE(free_stock, 0) + ?,
                 available_qty = COALESCE(available_qty, 0) + ?,
                 physical_qty = COALESCE(physical_qty, 0) + ?
             WHERE item_id = ?`,
          ).run(qty, qty, qty, item_id);

          const movId = "MOV-" + Math.random().toString(36).substr(2, 9);
          db.prepare(
            "INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by) VALUES (?, ?, ?, ?, ?, ?)",
          ).run(
            movId,
            item_id,
            project_id || null,
            "RETURN",
            qty,
            recorded_by || "SHOP_FLOOR",
          );

          if (project_id) {
            const bom = db
              .prepare(
                "SELECT id FROM boms WHERE project_id = ? AND item_id = ?",
              )
              .get(project_id, item_id) as { id: string } | undefined;
            if (bom) {
              db.prepare(
                "UPDATE bom_item_consumption SET qty_consumed = MAX(0, qty_consumed - ?), updated_at = CURRENT_TIMESTAMP WHERE bom_id = ?",
              ).run(qty, bom.id);
              
              db.prepare(
                "UPDATE boms SET received_by_production = MAX(0, COALESCE(received_by_production, 0) - ?) WHERE id = ?",
              ).run(qty, bom.id);
            }
          }
        });

        transaction();
        cacheService.invalidateNamespace("items");
        res.json({ success: true });
      } catch (err: any) {
        console.error(err);
        res
          .status(400)
          .json({ error: err.message || "Failed to return item" });
      }
    },
  );

  purchasingRouter.post(
    "/api/inventory/consume",
    requireRole(["PRODUCTION", "PPIC", "WAREHOUSE", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const { item_id, qty, project_id, recorded_by } = req.body;

        const transaction = db.transaction(() => {
          if (project_id) {
            const project = db
              .prepare("SELECT id, name, qty, status FROM projects WHERE id = ?")
              .get(project_id) as { id: string; name: string; qty: number; status: string } | undefined;
            if (!project) {
              throw new Error("Target project not found.");
            }
            if (project.status === "FINISHED") {
              throw new Error("Cannot consume items for a finished project.");
            }

            const bom = db
              .prepare(
                `SELECT b.id, b.required_qty, COALESCE(i.name, i.item_code, b.item_id) as item_name, COALESCE(i.uom, 'PCS') as uom
                 FROM boms b
                 LEFT JOIN items i ON (b.item_id = i.id OR b.item_id = i.item_code)
                 WHERE b.project_id = ? AND (b.item_id = ? OR b.item_id = (SELECT item_code FROM items WHERE id = ?))`
              )
              .get(project_id, item_id, item_id) as { id: string; required_qty: number; item_name: string; uom: string } | undefined;

            if (!bom) {
              throw new Error(
                `Item is not allocated in the Bill of Materials (BOM) for Project ${project.name || project_id}. Checkout is restricted.`
              );
            }

            const spkQty = Number(project.qty) || 1;
            const totalSpkRequired = Number(bom.required_qty) * spkQty;
            const bic = db
              .prepare("SELECT qty_consumed FROM bom_item_consumption WHERE bom_id = ?")
              .get(bom.id) as { qty_consumed: number } | undefined;
            const currentConsumed = Number(bic?.qty_consumed || 0);
            const remainingAllowed = Math.max(0, totalSpkRequired - currentConsumed);

            if (qty > remainingAllowed) {
              throw new Error(
                `Checkout of ${qty} ${bom.uom} exceeds SPK engineering limit! Total SPK required: ${totalSpkRequired} ${bom.uom} (BOM ${bom.required_qty} × ${spkQty} SPK Qty), already consumed: ${currentConsumed} ${bom.uom}. Maximum remaining allowed: ${remainingAllowed} ${bom.uom}.`
              );
            }
          }

          const inv = db
            .prepare("SELECT COALESCE(free_stock, 0) as free_stock, COALESCE(allocated_stock, 0) as allocated_stock FROM inventory WHERE item_id = ?")
            .get(item_id) as { free_stock: number; allocated_stock: number } | undefined;

          if (!inv) {
            throw new Error(`Insufficient stock for item ${item_id}`);
          }

          let remainingQtyToConsume = qty;

          if (project_id) {
            const labelAllocations = db.prepare(
              "SELECT SUM(current_qty) as total FROM inventory_labels WHERE item_id = ? AND project_id = ?"
            ).get(item_id, project_id) as { total: number };
            
            const allocAvailable = Math.min(inv.allocated_stock, labelAllocations?.total || 0);
            
            if (allocAvailable > 0) {
              const toConsumeFromAlloc = Math.min(allocAvailable, remainingQtyToConsume);
              db.prepare(
                `UPDATE inventory
                 SET allocated_stock = MAX(0, COALESCE(allocated_stock, 0) - ?),
                     reserved_qty = MAX(0, COALESCE(reserved_qty, 0) - ?),
                     physical_qty = MAX(0, COALESCE(physical_qty, 0) - ?)
                 WHERE item_id = ?`
              ).run(toConsumeFromAlloc, toConsumeFromAlloc, toConsumeFromAlloc, item_id);
              
              const labels = db.prepare(
                 "SELECT id, current_qty FROM inventory_labels WHERE item_id = ? AND project_id = ? AND current_qty > 0 ORDER BY created_at ASC"
              ).all(item_id, project_id) as any[];
              
              let labelDeduct = toConsumeFromAlloc;
              for (const lbl of labels) {
                 if (labelDeduct <= 0) break;
                 const deduct = Math.min(lbl.current_qty, labelDeduct);
                 db.prepare("UPDATE inventory_labels SET current_qty = current_qty - ? WHERE id = ?").run(deduct, lbl.id);
                 labelDeduct -= deduct;
              }
              
              remainingQtyToConsume -= toConsumeFromAlloc;
            }
          }

          if (remainingQtyToConsume > 0) {
            const info = db.prepare(
              `UPDATE inventory
               SET free_stock = free_stock - ?,
                   available_qty = MAX(0, COALESCE(available_qty, free_stock) - ?),
                   physical_qty = MAX(0, COALESCE(physical_qty, free_stock) - ?)
               WHERE item_id = ? AND free_stock >= ?`
            ).run(remainingQtyToConsume, remainingQtyToConsume, remainingQtyToConsume, item_id, remainingQtyToConsume);
            if (info.changes === 0) {
              throw new Error(`Insufficient stock for item ${item_id}`);
            }
          }

          const movId = "MOV-" + Math.random().toString(36).substr(2, 9);
          db.prepare(
            "INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by) VALUES (?, ?, ?, ?, ?, ?)",
          ).run(
            movId,
            item_id,
            project_id || null,
            "CONSUMPTION",
            -qty,
            recorded_by || "SHOP_FLOOR",
          );

          if (project_id) {
            const bom = db
              .prepare(
                "SELECT id FROM boms WHERE project_id = ? AND (item_id = ? OR item_id = (SELECT item_code FROM items WHERE id = ?))",
              )
              .get(project_id, item_id, item_id) as { id: string } | undefined;
            if (bom) {
              const bicId = "BIC-" + Math.random().toString(36).substr(2, 9);
              db.prepare(`
                INSERT INTO bom_item_consumption (id, bom_id, qty_consumed, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(bom_id) DO UPDATE SET qty_consumed = qty_consumed + excluded.qty_consumed, updated_at = CURRENT_TIMESTAMP
              `).run(bicId, bom.id, qty);
              
              db.prepare(
                "UPDATE boms SET received_by_production = COALESCE(received_by_production, 0) + ? WHERE id = ?",
              ).run(qty, bom.id);
            }
          }
        });

        transaction();
        cacheService.invalidateNamespace("items");
        if (project_id) {
          try {
            syncProjectMaterialAndWakeProcesses(project_id, recorded_by || (req.headers["x-user-email"] as string) || "WAREHOUSE_STAFF");
          } catch (e) {
            console.error("Error in syncProjectMaterialAndWakeProcesses on consume:", e);
          }
        }
        logAudit(
          req.headers["x-user-email"] as string,
          "CONSUME_STOCK",
          "ITEM",
          item_id,
          `Consumed ${qty} for project ${project_id || "OTHERS"}. Recorded by ${recorded_by}`,
        );
        res.json({ success: true });
      } catch (error: any) {
        console.error(error);
        res
          .status(400)
          .json({ error: error.message || "Failed to consume item" });
      }
    },
  );

  purchasingRouter.get(
    "/api/warehouse/item-allocation-info",
    requireRole(["WAREHOUSE", "QA_QC", "PURCHASING", "PPIC", "PRODUCTION", "ENGINEERING", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const { po_number, item_id } = req.query;
        const po = db
          .prepare("SELECT id FROM purchase_orders WHERE po_number = ?")
          .get(po_number) as { id: string } | undefined;

        if (!po) {
          return res.json({ projects: [] });
        }

        const prItems = db
          .prepare(
            `
        SELECT DISTINCT pr.project_id
        FROM pr_items pri
        JOIN purchase_requests pr ON pri.pr_id = pr.id
        WHERE pri.po_id = ? AND pri.item_id = ? AND pr.project_id IS NOT NULL
      `,
          )
          .all(po.id, item_id) as { project_id: string }[];

        res.json({ projects: prItems.map((p) => p.project_id) });
      } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    },
  );
}
