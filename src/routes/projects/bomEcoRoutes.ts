import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { isValidDailyAuthKey } from "../../utils/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import {
  getNextCategorySequence,
  generateSmartSku,
} from "../../utils/autoCoding.ts";

export function registerBomEcoRoutes(router: Router) {
  router.delete(
    "/api/projects/:projectId/bom/:bomId",
    requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC", "ADMIN"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      if (userRole !== "FC" && userRole !== "ADMIN" && userLevel !== "MANAGER") {
        return res
          .status(403)
          .json({
            error:
              "Access denied. Only FC or Engineering/PPIC/Production Manager can delete BOM items.",
          });
      }
      try {
        const { projectId, bomId } = req.params;
        const consumption = db
          .prepare(
            "SELECT SUM(qty_consumed) as total FROM bom_item_consumption WHERE bom_id = ?",
          )
          .get(bomId) as { total: number };
        if (consumption && consumption.total > 0) {
          return res
            .status(400)
            .json({ error: "Cannot delete item with recorded consumption." });
        }

        db.transaction(() => {
          db.prepare("DELETE FROM bom_item_consumption WHERE bom_id = ?").run(
            bomId,
          );
          db.prepare("DELETE FROM work_order_items WHERE bom_id = ?").run(
            bomId,
          );
          db.prepare("DELETE FROM boms WHERE id = ? AND project_id = ?").run(
            bomId,
            projectId,
          );
        })();

        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete BOM item" });
      }
    },
  );

  router.get("/api/projects/:id/eco-history", (req, res) => {
    try {
      const projectId = req.params.id;
      const type = req.query.type as string;
      let query = "SELECT * FROM eco_logs WHERE project_id = ?";
      const params: any[] = [projectId];
      if (type) {
        query += " AND (UPPER(doc_type) = ? OR (doc_type IS NULL AND ? = 'BOM'))";
        params.push(type.toUpperCase(), type.toUpperCase());
      }
      query += " ORDER BY created_at DESC";
      const logs = db.prepare(query).all(...params) as any[];
      const parsed = logs.map((l) => {
        const prevData = l.previous_bom ? JSON.parse(l.previous_bom) : [];
        const currData = l.current_bom ? JSON.parse(l.current_bom) : [];
        return {
          ...l,
          previous_bom: prevData,
          current_bom: currData,
          previous_bop: prevData,
          current_bop: currData,
        };
      });
      res.json(parsed);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(
    "/api/projects/:id/boms/authorize",
    requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        const isExecutive = ["FC", "ADMIN", "SUPERADMIN", "BOD", "DIRECTOR"].includes(String(userRole || "").toUpperCase());
        if (!isExecutive && userLevel !== "MANAGER" && userLevel !== "SUPERVISOR" && !(req as any).userEmail?.includes("admin")) {
          return res.status(403).json({ error: "Access denied. Only Supervisor, Manager, or FC can authorize BOM." });
        }

        const projectId = req.params.id;
        const { pin } = req.body;
        if (!pin) return res.status(400).json({ error: "PIN is required" });

        const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "admin";
        if (!isValidDailyAuthKey(userIdentifier, pin)) {
          return res.status(400).json({ error: "Invalid Daily Internal Auth Key." });
        }

        const now = new Date().toISOString();
        db.prepare("UPDATE projects SET bom_status = 'AUTHORIZED', bom_authorized_by = ?, bom_authorized_at = ?, bom_revision_note = NULL WHERE id = ?").run(userIdentifier, now, projectId);

        logAudit(userIdentifier, "BOM_AUTHORIZED", "BOM", projectId, `BOM Document Authorized by ${userIdentifier}`);
        res.json({ success: true, bom_status: 'AUTHORIZED', bom_authorized_by: userIdentifier, bom_authorized_at: now });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.post(
    "/api/projects/:id/boms/revise",
    requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        const isExecutive = ["FC", "ADMIN", "SUPERADMIN", "BOD", "DIRECTOR"].includes(String(userRole || "").toUpperCase());
        if (!isExecutive && userLevel !== "MANAGER" && userLevel !== "SUPERVISOR" && !(req as any).userEmail?.includes("admin")) {
          return res.status(403).json({ error: "Access denied. Only Supervisor, Manager, or FC can revise BOM." });
        }

        const projectId = req.params.id;
        const { note } = req.body;
        if (!note) return res.status(400).json({ error: "Revision note is required" });

        const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "admin";

        db.prepare("UPDATE projects SET bom_status = 'REVISION', bom_revision_note = ? WHERE id = ?").run(note, projectId);

        logAudit(userIdentifier, "BOM_REVISION", "BOM", projectId, "BOM Marked for Revision. Note: " + note);
        res.json({ success: true, bom_status: 'REVISION', bom_revision_note: note });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  router.post(
    "/api/projects/:id/boms/sync",
    requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const projectId = req.params.id;
        const { items, auth_pin, eco_reason, is_draft } = req.body;

        const project = db
          .prepare("SELECT status, bom_status, bom_prepared_by, bom_prepared_at FROM projects WHERE id = ?")
          .get(projectId) as any;
        if (!project || project.status !== "ACTIVE") {
          return res.status(400).json({
            error:
              "Cannot modify BOM of a project that is not ACTIVE. Current status: " +
              (project?.status || "NOT FOUND"),
          });
        }

        const hasManufacturing = db.prepare("SELECT count(*) as c FROM work_orders WHERE project_id = ?").get(projectId) as any;
        const hasStartedTasks = db.prepare("SELECT count(*) as c FROM project_tasks WHERE project_id = ? AND progress > 0").get(projectId) as any;
        const isManufacturing = hasManufacturing.c > 0 || hasStartedTasks.c > 0;

        const existingBomsSnapshot = db
          .prepare(`
            SELECT 
        b.*, 
        (b.required_qty * COALESCE((SELECT qty FROM projects WHERE id = b.project_id), 1)) as total_required_qty,
        i.item_code, i.name, i.uom
            FROM boms b
            LEFT JOIN items i ON b.item_id = i.id
            WHERE b.project_id = ?
          `)
          .all(projectId);

        if (!Array.isArray(items)) {
          return res.status(400).json({
            error: "Invalid BOM items payload: expected an array of components.",
          });
        }

        const resolvedMasterItems = new Map<any, any>();
        for (const item of items) {
          let existingItem: any = null;
          if (item.item_id) {
            existingItem = db
              .prepare("SELECT * FROM items WHERE id = ? AND deleted_at IS NULL")
              .get(item.item_id);
          }
          if (!existingItem && item.item_code) {
            existingItem = db
              .prepare("SELECT * FROM items WHERE item_code = ? COLLATE NOCASE AND deleted_at IS NULL")
              .get(String(item.item_code).trim());
          }
          if (!existingItem) {
            return res.status(400).json({
              error: `Unregistered SKU "${item.item_code || item.name || "Unknown"}". All BOM components must be registered in Warehouse > Inventory Master before saving or submitting a BOM.`,
            });
          }
          resolvedMasterItems.set(item, existingItem);
        }

        const userIdentifier = req.headers["x-user-email"] as string || req.headers["x-user-id"] as string || (req as any).userEmail || (req as any).username || "admin";
        const now = new Date().toISOString();
        const isAuthorizedState = project.bom_status === 'AUTHORIZED';
        const isEco = !is_draft && (isAuthorizedState || !!auth_pin || !!eco_reason);

        let ecoId = "";
        let ecoNum = "";

        if (is_draft) {
          const currentBomStatus = project.bom_status || 'DRAFT';
          if (!isManufacturing && currentBomStatus !== 'PENDING' && currentBomStatus !== 'AUTHORIZED') {
             db.prepare("UPDATE projects SET bom_status = 'DRAFT', bq_updated_at = ? WHERE id = ?").run(now, projectId);
          } else {
             db.prepare("UPDATE projects SET bq_updated_at = ? WHERE id = ?").run(now, projectId);
          }
        } else if (isEco) {
          if (!auth_pin) {
            return res.status(400).json({ error: "BOM has already been authorized. Changes require ECO authorization with a Daily Internal Auth Key (PIN).", require_eco: true });
          }
          if (!isValidDailyAuthKey(userIdentifier, auth_pin)) {
            return res.status(400).json({ error: "Invalid or incorrect Daily Internal Auth Key." });
          }
          if (!eco_reason || !eco_reason.trim()) {
            return res.status(400).json({ error: "Engineering Change Order (ECO) reason is required." });
          }
          db.prepare("UPDATE projects SET bom_status = 'AUTHORIZED', bom_authorized_by = ?, bom_authorized_at = ?, bom_revision_note = NULL, bq_updated_at = ? WHERE id = ?").run(userIdentifier, now, now, projectId);
          logAudit(userIdentifier, "ECO_SUBMITTED", "BOM", projectId, `BOM changed via ECO revision. Reason: ${eco_reason}`);
        } else {
          db.prepare("UPDATE projects SET bom_status = 'PENDING', bom_submitted_by = ?, bom_submitted_at = ?, bom_prepared_by = COALESCE(bom_prepared_by, ?), bom_prepared_at = COALESCE(bom_prepared_at, ?), bom_revision_note = NULL, bq_updated_at = ? WHERE id = ?").run(userIdentifier, now, userIdentifier, now, now, projectId);
          logAudit(userIdentifier, "BOM_SUBMITTED", "BOM", projectId, `BOM submitted for approval by ${userIdentifier}`);
        }

        const transaction = db.transaction(() => {
          const existingBoms = db
            .prepare("SELECT * FROM boms WHERE project_id = ?")
            .all(projectId) as any[];
          const existingBomIds = new Set(existingBoms.map((b) => b.id));
          const newItemsMap = new Map();

          const insertBom = db.prepare(
            "INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, unit_price, reference, target_project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          );
          const insertBomConsumption = db.prepare(
            "INSERT INTO bom_item_consumption (id, bom_id, qty_consumed) VALUES (?, ?, ?)",
          );
          const updateBom = db.prepare(
            "UPDATE boms SET required_qty = ?, dimension = ?, spec = ?, unit_price = ?, reference = ?, target_project_id = ? WHERE id = ?",
          );

          db.prepare(
            "UPDATE projects SET bq_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(projectId);

          for (const item of items) {
            const existingItem = resolvedMasterItems.get(item);
            const itemId = existingItem.id;
            const masterDimension = existingItem.dimension ?? item.dimension ?? "";
            const masterSpec = existingItem.spec ?? item.spec ?? "";
            const resolvedUnitPrice = Number(item.unit_price) || Number(existingItem.unit_price) || 0;

            db.prepare(
              "INSERT OR IGNORE INTO inventory (item_id, free_stock, allocated_stock) VALUES (?, 0, 0)",
            ).run(itemId);

            newItemsMap.set(itemId, {
              ...item,
              item_id: itemId,
              item_code: existingItem.item_code,
              name: existingItem.name,
              uom: existingItem.uom,
              dimension: masterDimension,
              spec: masterSpec,
              unit_price: resolvedUnitPrice,
            });

            const existing = existingBoms.find((b) => b.item_id === itemId);
            let bomId = "";
            if (existing) {
              bomId = existing.id;
              updateBom.run(
                Number(item.required_qty) || 0,
                masterDimension,
                masterSpec,
                resolvedUnitPrice,
                item.reference || "",
                item.target_project_id || null,
                existing.id,
              );
              existingBomIds.delete(existing.id);
            } else {
              bomId = "BOM-" + Math.random().toString(36).substr(2, 9);
              insertBom.run(
                bomId,
                projectId,
                itemId,
                masterDimension,
                masterSpec,
                Number(item.required_qty) || 0,
                resolvedUnitPrice,
                item.reference || "",
                item.target_project_id || null,
              );
              insertBomConsumption.run(
                "BIC-" + Math.random().toString(36).substr(2, 9),
                bomId,
                0,
              );
            }
          }

          if (isManufacturing) {
            const getProjectIncoming = db.prepare(`
              SELECT COALESCE(SUM(pri.qty), 0) - COALESCE((
                SELECT SUM(gi.qty_received)
                FROM grn_items gi
                JOIN grns g ON gi.grn_id = g.id
                JOIN purchase_orders po ON g.po_id = po.id
                JOIN pr_items pri2 ON po.id = pri2.po_id AND gi.item_id = pri2.item_id
                JOIN purchase_requests pr2 ON pri2.pr_id = pr2.id
                WHERE pr2.project_id = ? AND gi.item_id = ? AND g.qc_status IN ('PASSED', 'CONDITIONAL')
              ), 0) as incoming
              FROM pr_items pri
              JOIN purchase_requests pr ON pri.pr_id = pr.id
              WHERE pr.project_id = ? AND pri.item_id = ? AND pr.status != 'CANCELLED'
            `);
            
            const getFreeStock = db.prepare(`SELECT COALESCE(free_stock, 0) as f FROM inventory WHERE item_id = ?`);
            
            let prId = null;
            let hasShortage = false;

            for (const item of items) {
              const itemId = item.item_id || Array.from(newItemsMap.keys()).find(k => newItemsMap.get(k) === item);
              if (!itemId) continue;

              const required = Number(item.required_qty);
              const freeStockRow = getFreeStock.get(itemId) as any;
              const freeStock = freeStockRow ? Number(freeStockRow.f) : 0;
              
              const incomingRow = getProjectIncoming.get(projectId, itemId, projectId, itemId) as any;
              const incoming = incomingRow ? Number(incomingRow.incoming) : 0;

              const existingAllocRow = db.prepare(`SELECT COALESCE(SUM(qty), 0) as alloc FROM stock_movements WHERE project_id = ? AND item_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION')`).get(projectId, itemId) as any;
              const existingAlloc = existingAllocRow ? Number(existingAllocRow.alloc) : 0;

              const shortage = Math.max(0, required - (freeStock + incoming + existingAlloc));

              if (shortage > 0) {
                hasShortage = true;
              }
            }
            
            if (hasShortage) {
               const todayStr = new Date().toISOString().split("T")[0];
               const nextWeekStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
               db.prepare(
                 "INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status, pr_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
               ).run(
                 "TSK-" + Math.random().toString(36).substr(2, 9),
                 projectId,
                 "ECO Procurement Revision",
                 todayStr,
                 nextWeekStr,
                 0,
                 "PENDING",
                 prId
               );
            }
          }

          for (const bomId of existingBomIds) {
            const consumption = db
              .prepare(
                "SELECT qty_consumed FROM bom_item_consumption WHERE bom_id = ?",
              )
              .get(bomId) as any;
            if (!consumption || consumption.qty_consumed === 0) {
              db.prepare(
                "DELETE FROM bom_item_consumption WHERE bom_id = ?",
              ).run(bomId);
              db.prepare("DELETE FROM work_order_items WHERE bom_id = ?").run(
                bomId,
              );
              db.prepare("DELETE FROM boms WHERE id = ?").run(bomId);
            }
          }
        });

        transaction();

        if (isEco) {
          try {
            ecoId = "ECO-" + Math.random().toString(36).substr(2, 9);
            ecoNum = `ECO-${projectId}-${Date.now().toString().slice(-4)}`;
            const currentBoms = db.prepare(`
              SELECT 
        b.*, 
        (b.required_qty * COALESCE((SELECT qty FROM projects WHERE id = b.project_id), 1)) as total_required_qty,
        i.item_code, i.name, i.uom
              FROM boms b
              LEFT JOIN items i ON b.item_id = i.id
              WHERE b.project_id = ?
            `).all(projectId);

            db.prepare(`
              INSERT INTO eco_logs (id, project_id, doc_type, eco_number, eco_reason, authorized_by, authorized_at, previous_bom, current_bom)
              VALUES (?, ?, 'BOM', ?, ?, ?, ?, ?, ?)
            `).run(
              ecoId,
              projectId,
              ecoNum,
              eco_reason || "BOM Technical Revision & Material Re-allocation",
              userIdentifier,
              now,
              JSON.stringify(existingBomsSnapshot || []),
              JSON.stringify(currentBoms || [])
            );
          } catch (ecoErr) {
            console.error("Failed to insert ECO log:", ecoErr);
          }
        }

        res.json({
          success: true,
          is_eco: isEco,
          is_draft: !!is_draft,
          bom_status: is_draft ? (project.bom_status || 'DRAFT') : (isEco ? 'AUTHORIZED' : 'PENDING'),
          eco_number: ecoNum || null,
          eco_id: ecoId || null,
          updated_at: now
        });
      } catch (error: any) {
        console.error("Error during BOM sync:", error);
        res.status(500).json({ error: error?.message || "Failed to sync BQ" });
      }
    },
  );

  router.post(
    "/api/boms/submit",
    requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const {
          project_id,
          items,
          expected_delivery_date,
        } = req.body;

        const insertBom = db.prepare(
          "INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, reference, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        );
        const insertBomConsumption = db.prepare(
          "INSERT INTO bom_item_consumption (id, bom_id, qty_consumed) VALUES (?, ?, ?)",
        );
        const insertTask = db.prepare(
          "INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status, pr_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        );

        const transaction = db.transaction(() => {
          let prId = null;
          let hasShortage = false;

          for (const item of items) {
            let itemId = item.item_id;

            if (!itemId || item.is_new) {
              itemId =
                "ITEM-" +
                Math.random().toString(36).substr(2, 5).toUpperCase();
              const rawCat = (item.type || item.category || "RAW").toString().trim().toUpperCase();
              const allActiveItems = db
                .prepare("SELECT item_code, type, item_type, category FROM items WHERE deleted_at IS NULL")
                .all() as any[];
              const itemName = (item.name || item.item_code || "New Material").toString().trim();
              let seq = getNextCategorySequence(rawCat, allActiveItems);
              let smartCode = generateSmartSku(rawCat, itemName, seq);
              while (db.prepare("SELECT id FROM items WHERE item_code = ? COLLATE NOCASE").get(smartCode)) {
                seq++;
                smartCode = generateSmartSku(rawCat, itemName, seq);
              }
              const roleUpper = ((req as any).userRole || "").toString().trim().toUpperCase();
              const canSetPrice = ["PURCHASING", "FC", "ADMIN", "SUPERADMIN", "BOD", "DIRECTOR"].includes(roleUpper);
              const resolvedInitialPrice = canSetPrice ? (Number(item.unit_price) || 0) : 0;

              db.prepare(
                "INSERT INTO items (id, item_code, name, uom, dimension, spec, type, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              ).run(
                itemId,
                smartCode,
                itemName,
                (item.uom || "PCS").toString().trim().toUpperCase(),
                item.dimension || "",
                item.spec || "",
                "RAW",
                resolvedInitialPrice,
              );
              db.prepare(
                "INSERT OR IGNORE INTO inventory (item_id, physical_qty, reserved_qty, available_qty, free_stock, allocated_stock) VALUES (?, 0, 0, 0, 0, 0)",
              ).run(itemId);
            }

            const bomId = "BOM-" + Math.random().toString(36).substr(2, 9);
            insertBom.run(
              bomId,
              project_id,
              itemId,
              item.dimension,
              item.spec,
              item.required_qty,
              item.reference,
              item.unit_price || 0,
            );
            insertBomConsumption.run(
              "BIC-" + Math.random().toString(36).substr(2, 9),
              bomId,
              0,
            );

            let currentFreeStock = 0;
            if (itemId && !item.is_new) {
              const inv = db
                .prepare("SELECT free_stock FROM inventory WHERE item_id = ?")
                .get(itemId) as any;
              currentFreeStock = inv ? inv.free_stock : 0;
            }

            const otherBomsReq = db
              .prepare(
                `
          SELECT COALESCE(SUM(b.required_qty), 0) as total_req
          FROM boms b
          JOIN projects p ON b.project_id = p.id
          WHERE b.item_id = ? AND p.status IN ('DRAFT', 'ACTIVE')
        `,
              )
              .get(itemId) as any;
            const totalOtherReq = otherBomsReq.total_req;

            const incomingSupply = db
              .prepare(
                `
          SELECT COALESCE(SUM(doi.qty_received), 0) as total_incoming
          FROM grn_items doi
          JOIN grns d ON doi.grn_id = d.id
          WHERE doi.item_id = ? AND d.inventory_updated_at IS NULL
        `,
              )
              .get(itemId) as any;
            const totalIncoming = incomingSupply.total_incoming;

            const pendingPoSupply = db
              .prepare(
                `
           SELECT COALESCE(SUM(poi.qty), 0) as total_po
           FROM pr_items poi
           JOIN purchase_requests pr ON poi.pr_id = pr.id
           WHERE poi.item_id = ? AND pr.status IN ('DRAFTED', 'AUTHORIZED', 'PO_ISSUED')
        `,
              )
              .get(itemId) as any;
            const totalPoIncoming = pendingPoSupply.total_po;

            const effectiveAvailable = Math.max(
              0,
              currentFreeStock +
                totalIncoming +
                totalPoIncoming -
                totalOtherReq,
            );

            const actualShortage = Math.max(
              0,
              item.required_qty - effectiveAvailable,
            );

            if (actualShortage > 0) {
              hasShortage = true;
            }

            item.final_item_id = itemId;
            item.actual_shortage = actualShortage;
          }

          const todayStr = new Date().toISOString().split("T")[0];

          const itemsWithDeliveries = items.filter(
            (i: any) => i.actual_shortage > 0 && i.expected_delivery_date,
          );

          if (itemsWithDeliveries.length > 0) {
            const deliveryGroups = new Map();
            for (const i of itemsWithDeliveries) {
              if (!deliveryGroups.has(i.expected_delivery_date))
                deliveryGroups.set(i.expected_delivery_date, []);
              deliveryGroups.get(i.expected_delivery_date).push(i);
            }

            for (const [date, grp] of deliveryGroups.entries()) {
              const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
              let details = grp.map((g: any) => g.item_code).join(", ");
              if (details.length > 40)
                details = details.substring(0, 37) + "...";
              insertTask.run(
                taskId,
                project_id,
                `Arrival: ${details}`,
                todayStr,
                date,
                0,
                "PENDING",
                prId,
              );
            }
          }

          if (!hasShortage || itemsWithDeliveries.length === 0) {
            const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
            let endDateStr = expected_delivery_date || "";
            if (!endDateStr) {
              const d = new Date();
              d.setDate(d.getDate() + 3);
              endDateStr = d.toISOString().split("T")[0];
            }
            const prText = prId ? `(PR Generated)` : `(Stock Fulfilled)`;
            insertTask.run(
              taskId,
              project_id,
              `Material Procurement ${prText}`,
              todayStr,
              endDateStr,
              0,
              "PENDING",
              prId,
            );
          }

          return prId;
        });

        const generatedPrId = transaction();
        logAudit(
          req.headers["x-user-email"] as string,
          "BOM_SYNC",
          "PROJECT",
          project_id,
          `BOM synchronized with ${items.length} items. PR ID: ${generatedPrId || "None"}`,
        );
        res.json({ success: true, pr_id: generatedPrId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to submit BOM" });
      }
    },
  );
}
