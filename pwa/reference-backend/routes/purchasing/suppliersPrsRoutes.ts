import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { isValidDailyAuthKey } from "../../utils/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { syncProcurementTaskGantt } from "../../utils/ganttUtils.ts";
import { cacheService } from "../../services/cacheService.ts";
import { outboxService } from "../../services/outboxService.ts";
import {
  getNextEntitySequence,
  generateSmartSupplierCode,
} from "../../utils/autoCoding.ts";
import { recordWorkflowStepApproval } from "../../services/workflowEngine.ts";
import { computeSupplierBatchMetrics } from "./helpers.ts";

const ALL_PR_ROLES = [
  "PURCHASING",
  "ENGINEERING",
  "PRODUCTION",
  "WAREHOUSE",
  "PPIC",
  "QA_QC",
  "FC",
  "BOD",
  "DIRECTOR",
  "ADMIN",
  "SUPERADMIN",
  "FINANCE",
  "SALES",
  "HR",
];

export function registerSuppliersPrsRoutes(purchasingRouter: Router) {
  purchasingRouter.get(
    "/api/suppliers",
    requireRole(["PURCHASING", "WAREHOUSE", "FC", "ENGINEERING", "PRODUCTION", "SALES", "ADMIN"]),
    (_req, res) => {
      try {
        const cacheKey = "suppliers:all";
        const cached = cacheService.get<any[]>(cacheKey);
        if (cached) return res.json(cached);

        const suppliers = db
          .prepare(
            `
        SELECT 
          s.*,
          (
            SELECT COUNT(g.id) 
            FROM grns g 
            JOIN purchase_orders po ON po.id = g.po_id 
            WHERE po.supplier_id = s.id AND g.qc_status = 'REJECTED'
          ) as rejected_count,
          (
            SELECT COUNT(g.id) 
            FROM grns g 
            JOIN purchase_orders po ON po.id = g.po_id 
            WHERE po.supplier_id = s.id AND g.qc_status = 'CONDITIONAL'
          ) as conditional_count,
          (
            SELECT COUNT(g.id) 
            FROM grns g 
            JOIN purchase_orders po ON po.id = g.po_id 
            WHERE po.supplier_id = s.id AND g.qc_status = 'PASSED'
          ) as passed_count,
          (
            SELECT COUNT(g.id)
            FROM grns g
            JOIN purchase_orders po ON po.id = g.po_id
            WHERE po.supplier_id = s.id
              AND (po.expected_date IS NULL OR po.expected_date = '' OR date(g.received_date) <= date(po.expected_date))
          ) as on_time_count,
          (
            SELECT COUNT(po.id) 
            FROM purchase_orders po
            WHERE po.supplier_id = s.id
          ) as total_orders
        FROM suppliers s 
        ORDER BY s.name ASC
      `,
          )
          .all();

        cacheService.set(cacheKey, suppliers, 180, "suppliers");
        res.json(suppliers);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch suppliers" });
      }
    },
  );

  purchasingRouter.get(
    "/api/purchasing/suppliers-by-items",
    requireRole(["PURCHASING", "WAREHOUSE", "FC", "ENGINEERING"]),
    (req, res) => {
      try {
        const itemIdsQuery = req.query.item_ids as string;
        const itemIds = itemIdsQuery
          ? itemIdsQuery.split(",").map((s) => s.trim()).filter(Boolean)
          : [];

        const suppliers = db
          .prepare(
            `
              SELECT 
                s.*,
                COALESCE(grn_stats.rejected_count, 0) as rejected_count,
                COALESCE(grn_stats.conditional_count, 0) as conditional_count,
                COALESCE(grn_stats.passed_count, 0) as passed_count,
                COALESCE(grn_stats.on_time_count, 0) as on_time_count,
                COALESCE(po_stats.total_orders, 0) as total_orders
              FROM suppliers s
              LEFT JOIN (
                SELECT po.supplier_id,
                       COUNT(po.id) as total_orders
                FROM purchase_orders po
                WHERE po.supplier_id IS NOT NULL
                GROUP BY po.supplier_id
              ) po_stats ON po_stats.supplier_id = s.id
              LEFT JOIN (
                SELECT po.supplier_id,
                       SUM(CASE WHEN g.qc_status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_count,
                       SUM(CASE WHEN g.qc_status = 'CONDITIONAL' THEN 1 ELSE 0 END) as conditional_count,
                       SUM(CASE WHEN g.qc_status = 'PASSED' THEN 1 ELSE 0 END) as passed_count,
                       SUM(CASE WHEN po.expected_date IS NULL OR po.expected_date = '' OR date(g.received_date) <= date(po.expected_date) THEN 1 ELSE 0 END) as on_time_count
                FROM grns g
                JOIN purchase_orders po ON po.id = g.po_id
                WHERE po.supplier_id IS NOT NULL
                GROUP BY po.supplier_id
              ) grn_stats ON grn_stats.supplier_id = s.id
              ORDER BY s.name ASC
            `,
          )
          .all() as any[];

        const priceMapBySupplier = new Map<string, { item_id: string; unit_price: number }[]>();
        if (itemIds.length > 0) {
          const placeholders = itemIds.map(() => "?").join(",");
          const allPrices = db
            .prepare(
              `SELECT supplier_id, item_id, unit_price FROM item_supplier_prices WHERE item_id IN (${placeholders})`,
            )
            .all(...itemIds) as {
            supplier_id: string;
            item_id: string;
            unit_price: number;
          }[];
          for (const p of allPrices) {
            const list = priceMapBySupplier.get(p.supplier_id) || [];
            list.push({ item_id: p.item_id, unit_price: p.unit_price });
            priceMapBySupplier.set(p.supplier_id, list);
          }
        }

        const mappedSuppliers = suppliers.map((sup) =>
          computeSupplierBatchMetrics(
            sup,
            priceMapBySupplier.get(sup.id) || [],
            itemIds.length,
          ),
        );

        res.json(mappedSuppliers);
      } catch (error) {
        console.error("Failed to fetch suppliers by items:", error);
        res.status(500).json({ error: "Failed to fetch suppliers by items" });
      }
    },
  );

  purchasingRouter.post(
    "/api/suppliers",
    requireRole(["FC", "PURCHASING"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      if (
        userRole !== "FC" &&
        (userRole !== "PURCHASING" || userLevel !== "MANAGER")
      ) {
        return res
          .status(403)
          .json({
            error:
              "Access denied. Only FC or Purchasing Manager can manage vendors.",
          });
      }
      try {
        const { name, contact_person, email, phone, address, npwp, tax_scheme, payment_terms } =
          req.body;
        const id = "SUP-" + Math.random().toString(36).substr(2, 9);

        const existingSuppliers = db
          .prepare("SELECT code FROM suppliers")
          .all() as any[];
        let seq = getNextEntitySequence("SUP", existingSuppliers);
        let finalCode = generateSmartSupplierCode(name || "SUPPLIER", seq);

        while (
          db.prepare("SELECT id FROM suppliers WHERE code = ? COLLATE NOCASE").get(finalCode)
        ) {
          seq++;
          finalCode = generateSmartSupplierCode(name || "SUPPLIER", seq);
        }

        db.prepare(
          "INSERT INTO suppliers (id, name, code, contact_person, email, phone, address, npwp, tax_scheme, payment_terms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          id,
          name,
          finalCode,
          contact_person || null,
          email || null,
          phone || null,
          address || null,
          npwp || null,
          tax_scheme || "DPP_NILAI_LAIN",
          payment_terms || "Net 30 Days",
        );

        cacheService.invalidateNamespace("suppliers");
        outboxService.enqueue(
          db,
          "SUPPLIERS",
          id,
          "CREATE",
          {
            id,
            name,
            code: finalCode,
            contact_person: contact_person || null,
            email: email || null,
            phone: phone || null,
            address: address || null,
            npwp: npwp || null,
            tax_scheme: tax_scheme || "DPP_NILAI_LAIN",
            payment_terms: payment_terms || "Net 30 Days",
            created_at: new Date().toISOString()
          },
          "BOTH"
        );

        res.json({ success: true, id, code: finalCode });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create supplier" });
      }
    },
  );

  purchasingRouter.put(
    "/api/suppliers/:id",
    requireRole(["FC", "PURCHASING"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      if (
        userRole !== "FC" &&
        (userRole !== "PURCHASING" || userLevel !== "MANAGER")
      ) {
        return res
          .status(403)
          .json({
            error:
              "Access denied. Only FC or Purchasing Manager can manage vendors.",
          });
      }
      try {
        const { name, code, contact_person, email, phone, address, npwp, tax_scheme, payment_terms } =
          req.body;
        db.prepare(
          `
          UPDATE suppliers 
          SET name = ?, code = ?, contact_person = ?, email = ?, phone = ?, address = ?, npwp = ?, tax_scheme = ?, payment_terms = ?
          WHERE id = ?
        `,
        ).run(
          name,
          code,
          contact_person,
          email,
          phone,
          address,
          npwp || null,
          tax_scheme || "DPP_NILAI_LAIN",
          payment_terms || "Net 30 Days",
          req.params.id,
        );
        
        cacheService.invalidateNamespace("suppliers");
        outboxService.enqueue(
          db,
          "SUPPLIERS",
          req.params.id,
          "UPDATE",
          {
            id: req.params.id,
            name,
            code,
            contact_person,
            email,
            phone,
            address,
            npwp: npwp || null,
            tax_scheme: tax_scheme || "DPP_NILAI_LAIN",
            payment_terms: payment_terms || "Net 30 Days",
            updated_at: new Date().toISOString(),
          },
          "BOTH"
        );
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update supplier" });
      }
    },
  );

  purchasingRouter.delete(
    "/api/suppliers/:id",
    requireRole(["FC", "PURCHASING"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      if (
        userRole !== "FC" &&
        (userRole !== "PURCHASING" || userLevel !== "MANAGER")
      ) {
        return res
          .status(403)
          .json({
            error:
              "Access denied. Only FC or Purchasing Manager can manage vendors.",
          });
      }
      try {
        const poCount = (
          db
            .prepare(
              "SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ?",
            )
            .get(req.params.id) as any
        ).count;
        if (poCount > 0) {
          return res.status(400).json({
            error: "Cannot delete supplier with active purchase orders.",
          });
        }
        db.transaction(() => {
          db.prepare(
            "DELETE FROM item_supplier_prices WHERE supplier_id = ?",
          ).run(req.params.id);
          db.prepare(
            "DELETE FROM item_price_history WHERE supplier_id = ?",
          ).run(req.params.id);
          db.prepare("DELETE FROM suppliers WHERE id = ?").run(req.params.id);
        })();
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete supplier" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/pr/:id/cancel",
    requireRole(ALL_PR_ROLES),
    (req, res) => {
      try {
        const pr = db
          .prepare("SELECT status, general_request_id FROM purchase_requests WHERE id = ?")
          .get(req.params.id) as any;
        if (pr && (pr.status === "ORDERED" || pr.status === "RECEIVED")) {
          return res.status(400).json({
            error:
              "Cannot cancel a PR that has already been converted to a PO or received.",
          });
        }
        db.transaction(() => {
          db.prepare(
            "UPDATE purchase_requests SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(req.params.id);
          db.prepare(
            "UPDATE project_tasks SET status = 'CANCELLED' WHERE pr_id = ?",
          ).run(req.params.id);
          if (pr?.general_request_id) {
            db.prepare(
              "UPDATE general_requests SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ).run(pr.general_request_id);
          }
        })();
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to cancel PR" });
      }
    },
  );

  purchasingRouter.put(
    "/api/purchasing/pr/:id",
    requireRole(ALL_PR_ROLES),
    (req, res) => {
      try {
        const {
          urgency,
          expected_delivery_date,
          remarks,
          title,
          department,
          category,
          drawing_reference,
          items,
        } = req.body;
        const prId = req.params.id;

        const pr = db
          .prepare("SELECT * FROM purchase_requests WHERE id = ?")
          .get(prId) as any;
        if (!pr) return res.status(404).json({ error: "PR not found" });

        db.transaction(() => {
          let totalEstCost = 0;

          if (items && Array.isArray(items)) {
            const itemIds = items.map((i: any) => i.item_id).filter(Boolean);
            if (itemIds.length > 0) {
              const placeholders = itemIds.map(() => "?").join(",");
              db.prepare(
                `DELETE FROM pr_items WHERE pr_id = ? AND item_id NOT IN (${placeholders})`,
              ).run(prId, ...itemIds);
            } else {
              db.prepare(`DELETE FROM pr_items WHERE pr_id = ?`).run(prId);
            }
            for (const item of items) {
              if (!item.item_id) continue;
              const existingItem = db
                .prepare("SELECT id, unit_price FROM items WHERE id = ?")
                .get(item.item_id) as any;
              if (!existingItem) {
                db.prepare(
                  "INSERT INTO items (id, item_code, name, uom, category) VALUES (?, ?, ?, ?, 'RAW')",
                ).run(
                  item.item_id,
                  item.item_code || `RAW-${item.item_id}`,
                  item.name || "Custom Item",
                  item.uom || "Unit",
                );
              }

              const resolvedPrice =
                Number(item.unit_price) ||
                Number(
                  (
                    db
                      .prepare(
                        "SELECT MIN(unit_price) as min_p FROM item_supplier_prices WHERE item_id = ? AND unit_price > 0",
                      )
                      .get(item.item_id) as any
                  )?.min_p,
                ) ||
                Number(existingItem?.unit_price) ||
                0;

              const qtyToOrder = Number(item.qty_to_order ?? item.qty ?? 0);
              totalEstCost += qtyToOrder * resolvedPrice;

              const updated = db
                .prepare(
                  `
                  UPDATE pr_items
                  SET qty = ?, expected_delivery_date = ?, unit_price = COALESCE(?, unit_price), dimension = COALESCE(?, dimension), spec = COALESCE(?, spec)
                  WHERE pr_id = ? AND item_id = ?
                `,
                )
                .run(
                  qtyToOrder,
                  item.expected_delivery_date || null,
                  resolvedPrice || null,
                  item.dimension || null,
                  item.spec || null,
                  prId,
                  item.item_id,
                );

              if (updated.changes === 0) {
                db.prepare(
                  `
                        INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, unit_price, expected_delivery_date) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     `,
                ).run(
                  "PRI-" + Math.random().toString(36).substr(2, 9),
                  prId,
                  item.item_id,
                  item.dimension || "",
                  item.spec || "",
                  qtyToOrder,
                  resolvedPrice,
                  item.expected_delivery_date || null,
                );
              }
            }
          }

          db.prepare(
            `
              UPDATE purchase_requests 
              SET urgency = COALESCE(?, urgency), 
                  status = 'DRAFTED', 
                  revision_note = NULL,
                  expected_delivery_date = COALESCE(?, expected_delivery_date),
                  remarks = COALESCE(?, remarks),
                  title = COALESCE(?, title),
                  department = COALESCE(?, department),
                  category = COALESCE(?, category),
                  drawing_reference = COALESCE(?, drawing_reference),
                  total_estimated_cost = CASE WHEN ? > 0 THEN ? ELSE total_estimated_cost END,
                  workflow_step_index = 0,
                  workflow_current_role = 'SUPERVISOR'
              WHERE id = ?
            `,
          ).run(
            urgency || null,
            expected_delivery_date || null,
            remarks || null,
            title || null,
            department || null,
            category || null,
            drawing_reference || null,
            totalEstCost,
            totalEstCost,
            prId,
          );

          db.prepare(
            "DELETE FROM workflow_approvals WHERE document_type = 'Purchase Request' AND document_id = ?",
          ).run(prId);
        })();

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "UPDATE_PR",
          "PURCHASE_REQUEST",
          prId,
          `Revised PR ${pr.pr_number}`,
        );

        res.json({ success: true, message: "PR updated successfully" });
      } catch (error: any) {
        console.error(error);
        res
          .status(500)
          .json({ error: "Failed to update PR", details: error.message });
      }
    },
  );

  purchasingRouter.delete(
    "/api/purchasing/pr/:id",
    requireRole(ALL_PR_ROLES),
    (req, res) => {
      try {
        const pr = db
          .prepare("SELECT status FROM purchase_requests WHERE id = ?")
          .get(req.params.id) as any;
        if (pr && (pr.status === "ORDERED" || pr.status === "RECEIVED")) {
          return res.status(400).json({
            error:
              "Cannot delete a PR that has already been converted to a PO or received.",
          });
        }
        const transaction = db.transaction(() => {
          db.prepare(
            "UPDATE purchase_requests SET archived = 1, archived_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(req.params.id);
        });
        transaction();
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete PR" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/clear-prs",
    requireRole(ALL_PR_ROLES),
    (_req, res) => {
      try {
        db.prepare(
          "UPDATE purchase_requests SET archived = 1, archived_at = CURRENT_TIMESTAMP WHERE status IN ('ORDERED', 'RECEIVED', 'CANCELLED')",
        ).run();
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to clear PRs" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/archive-pr/:id",
    requireRole(ALL_PR_ROLES),
    (req, res) => {
      try {
        db.prepare(
          "UPDATE purchase_requests SET archived = 1, archived_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to archive individual PR" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/clear-pos",
    requireRole(["PURCHASING"]),
    (_req, res) => {
      try {
        db.prepare(
          "UPDATE purchase_orders SET archived = 1 WHERE status IN ('FINISHED', 'CANCELLED', 'RECEIVED')",
        ).run();
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to clear POs" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/archive-po/:id",
    requireRole(["PURCHASING"]),
    (req, res) => {
      try {
        db.prepare(
          "UPDATE purchase_orders SET archived = 1 WHERE id = ?",
        ).run(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to archive individual PO" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/generate-general-pr",
    requireRole(ALL_PR_ROLES),
    (req, res) => {
      try {
        const {
          department = "PRODUCTION",
          category = "MAINTENANCE",
          title,
          remarks,
          drawing_reference,
          expected_delivery_date,
          urgency = "NORMAL",
          items = [],
        } = req.body || {};

        if (!Array.isArray(items) || items.length === 0) {
          return res.status(400).json({
            error: "Minimal 1 item Non-FG dengan kekurangan stok (Shortage > 0) diperlukan untuk menerbitkan PR.",
          });
        }

        const validItems = items.filter(
          (it: any) => Number(it.qty_to_order ?? it.qty ?? 0) > 0,
        );
        if (validItems.length === 0) {
          return res.json({
            success: true,
            pr_created: false,
            message: "Stok Gudang mencukupi (Tidak diperlukan PR).",
          });
        }

        const username =
          (req as any).username ||
          (req.headers["x-user-email"] as string) ||
          "staff";
        const userRow = db
          .prepare("SELECT name FROM users WHERE username = ?")
          .get(username) as any;
        const requesterName = userRow?.name || username;

        db.prepare(
          `INSERT OR IGNORE INTO projects (id, name, customer_name, status, qty, uom)
           VALUES ('GENERAL', 'General Departmental Operations', 'Internal Operations', 'INTERNAL_OVERHEAD', 1, 'LOT')`,
        ).run();

        const prId = "PR-" + Math.random().toString(36).substr(2, 9);
        const prNumber =
          "PR-" +
          new Date().getFullYear() +
          "-" +
          Math.floor(100000 + Math.random() * 900000);

        let deliveryDateStr = expected_delivery_date;
        if (!deliveryDateStr) {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          deliveryDateStr = d.toISOString().split("T")[0];
        }

        const normDept = String(department || "PRODUCTION").toUpperCase();
        const normCat = String(category || "MAINTENANCE").toUpperCase();
        const finalTitle =
          (title || remarks || `General Request - ${normDept}`).trim();

        const transaction = db.transaction(() => {
          let totalEstimatedCost = 0;
          const preparedItems: any[] = [];

          for (const rawIt of validItems) {
            const existingItem = rawIt.item_id
              ? (db
                  .prepare("SELECT * FROM items WHERE id = ?")
                  .get(rawIt.item_id) as any)
              : rawIt.item_code
                ? (db
                    .prepare(
                      "SELECT * FROM items WHERE LOWER(item_code) = LOWER(?)",
                    )
                    .get(rawIt.item_code) as any)
                : null;

            const checkCat = String(
              existingItem?.category || existingItem?.type || rawIt.category || "",
            ).toUpperCase();
            const checkCode = String(
              existingItem?.item_code || rawIt.item_code || "",
            ).toUpperCase();
            const checkName = String(
              existingItem?.name || rawIt.name || rawIt.item_name || "",
            ).toUpperCase();

            if (
              checkCat === "FINISHED" ||
              checkCat === "FINISH_GOOD" ||
              checkCat === "FG" ||
              checkCode.startsWith("FG-") ||
              checkName.startsWith("FG -")
            ) {
              throw new Error(
                `Item "${checkName || checkCode}" adalah Finished Good (FG). General Request hanya diizinkan untuk material/komponen Non-FG.`,
              );
            }

            let finalItemId = existingItem?.id || rawIt.item_id;
            if (!existingItem) {
              finalItemId =
                rawIt.item_id ||
                "ITM-GEN-" +
                  Math.random().toString(36).substr(2, 6).toUpperCase();
              const autoCode =
                rawIt.item_code ||
                `SKU-GEN-${Math.floor(10000 + Math.random() * 90000)}`;
              db.prepare(
                `INSERT OR IGNORE INTO items (id, item_code, name, dimension, spec, type, item_type, uom, unit_price, category)
                 VALUES (?, ?, ?, ?, ?, 'RAW', 'MATERIAL', ?, ?, ?)`,
              ).run(
                finalItemId,
                autoCode,
                rawIt.name || rawIt.item_name || "General Item",
                rawIt.dimension || null,
                rawIt.spec || rawIt.specification || null,
                (rawIt.uom || "PCS").toUpperCase(),
                Number(rawIt.unit_price) || 0,
                normCat,
              );
              db.prepare(
                `INSERT OR IGNORE INTO inventory (item_id, physical_qty, reserved_qty, available_qty, free_stock, allocated_stock)
                 VALUES (?, 0, 0, 0, 0, 0)`,
              ).run(finalItemId);
            }

            const ssotRow = db
              .prepare(
                `SELECT COALESCE(
                   (SELECT MIN(isp.unit_price) FROM item_supplier_prices isp WHERE isp.item_id = ? AND isp.unit_price > 0),
                   (SELECT unit_price FROM items WHERE id = ?),
                   0
                 ) as ssot_price`,
              )
              .get(finalItemId, finalItemId) as any;

            const unitPrice =
              Number(rawIt.unit_price) > 0
                ? Number(rawIt.unit_price)
                : Number(ssotRow?.ssot_price || 0);
            const qtyToOrder = Number(rawIt.qty_to_order ?? rawIt.qty ?? 1);
            totalEstimatedCost += qtyToOrder * unitPrice;

            preparedItems.push({
              item_id: finalItemId,
              dimension: rawIt.dimension || existingItem?.dimension || null,
              spec:
                rawIt.spec ||
                rawIt.specification ||
                existingItem?.spec ||
                null,
              qty: qtyToOrder,
              unit_price: unitPrice,
              expected_delivery_date:
                rawIt.expected_delivery_date || deliveryDateStr,
            });
          }

          db.prepare(
            `INSERT INTO purchase_requests (
              id, pr_number, project_id, department, category, title, remarks,
              drawing_reference, expected_delivery_date, total_estimated_cost,
              status, urgency, requested_by, created_by,
              workflow_step_index, workflow_total_steps, workflow_current_role
            ) VALUES (?, ?, 'GENERAL', ?, ?, ?, ?, ?, ?, ?, 'DRAFTED', ?, ?, ?, 0, 1, 'SUPERVISOR')`,
          ).run(
            prId,
            prNumber,
            normDept,
            normCat,
            finalTitle,
            remarks || finalTitle,
            drawing_reference || "Attached in System",
            deliveryDateStr,
            totalEstimatedCost,
            urgency || "NORMAL",
            requesterName,
            requesterName,
          );

          const insertPrItem = db.prepare(
            `INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, unit_price, expected_delivery_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          );

          for (const pItem of preparedItems) {
            insertPrItem.run(
              "PRI-" + Math.random().toString(36).substr(2, 9),
              prId,
              pItem.item_id,
              pItem.dimension,
              pItem.spec,
              pItem.qty,
              pItem.unit_price,
              pItem.expected_delivery_date,
            );
          }
        });

        transaction();

        logAudit(
          username,
          "CREATE_GENERAL_PR",
          "PURCHASE_REQUEST",
          prId,
          `Created General Purchase Request ${prNumber} (${normDept} / ${normCat})`,
        );

        res.json({
          success: true,
          pr_created: true,
          pr_id: prId,
          pr_number: prNumber,
        });
      } catch (error: any) {
        console.error("Failed to generate general PR:", error);
        res.status(400).json({
          error: error.message || "Failed to generate Purchase Request",
        });
      }
    },
  );

  purchasingRouter.get(
    "/api/purchasing/prs",
    requireRole(ALL_PR_ROLES),
    (req, res) => {
      try {
        const scope = String(req.query.scope || "").toUpperCase();
        let scopeFilter = "";
        if (scope === "GENERAL") {
          scopeFilter = `AND (
            pr.project_id IN ('GENERAL', 'CONSUMABLE', 'TRANSPORTATION', 'OTHERS')
            OR pr.category IN ('MAINTENANCE', 'TOOLING', 'RND', 'CONSUMABLE', 'INFRASTRUCTURE', 'SPECIAL_DESIGN', 'GENERAL')
            OR pr.general_request_id IS NOT NULL
          )`;
        } else if (scope === "PROJECT") {
          scopeFilter = `AND pr.project_id NOT IN ('GENERAL', 'CONSUMABLE', 'TRANSPORTATION', 'OTHERS')
            AND COALESCE(pr.category, 'PROJECT') IN ('PROJECT', 'PRODUCTION', 'ENGINEERING', 'PROCUREMENT')
            AND pr.general_request_id IS NULL`;
        }

        const prs = db
          .prepare(
            `
        SELECT 
          pr.*, 
          COALESCE(pr.title, pr.remarks, p.name, pr.project_id) as project_name, 
          COALESCE(pr.title, pr.remarks, p.name, pr.project_id) as title,
          COALESCE(pr.department, 'PRODUCTION') as department,
          COALESCE(pr.requested_by, pr.created_by, 'Staff') as created_by,
          s.spk_number,
          COUNT(pri.id) as item_count,
          COALESCE(NULLIF(pr.total_estimated_cost, 0), SUM(pri.qty * COALESCE(pri.unit_price, 0)), 0) as total_estimated_cost,
          (SELECT GROUP_CONCAT(DISTINCT po.po_number) FROM pr_items pri2 JOIN purchase_orders po ON pri2.po_id = po.id WHERE pri2.pr_id = pr.id) as po_numbers,
          (SELECT GROUP_CONCAT(DISTINCT g.id) FROM pr_items pri3 JOIN grns g ON g.po_id = pri3.po_id WHERE pri3.pr_id = pr.id) as grn_ids,
          (SELECT pp.id FROM procurement_plans pp WHERE (pp.master_pr_id = pr.id OR pp.id IN (SELECT pri_p.plan_id FROM pr_items pri_p WHERE pri_p.pr_id = pr.id AND pri_p.plan_id IS NOT NULL)) AND pp.status != 'ARCHIVED' ORDER BY pp.created_at DESC LIMIT 1) as procurement_plan_id,
          (SELECT pp.plan_code FROM procurement_plans pp WHERE (pp.master_pr_id = pr.id OR pp.id IN (SELECT pri_p.plan_id FROM pr_items pri_p WHERE pri_p.pr_id = pr.id AND pri_p.plan_id IS NOT NULL)) AND pp.status != 'ARCHIVED' ORDER BY pp.created_at DESC LIMIT 1) as procurement_plan_code,
          (SELECT pp.total_waves FROM procurement_plans pp WHERE (pp.master_pr_id = pr.id OR pp.id IN (SELECT pri_p.plan_id FROM pr_items pri_p WHERE pri_p.pr_id = pr.id AND pri_p.plan_id IS NOT NULL)) AND pp.status != 'ARCHIVED' ORDER BY pp.created_at DESC LIMIT 1) as procurement_plan_waves_count
        FROM purchase_requests pr
        LEFT JOIN projects p ON pr.project_id = p.id
        LEFT JOIN spks s ON pr.spk_id = s.id OR p.spk_id = s.id
        LEFT JOIN pr_items pri ON pr.id = pri.pr_id
        WHERE COALESCE(pr.archived, 0) = 0
          AND pr.archived_at IS NULL
          AND (pr.status != 'CANCELLED' OR (pr.status = 'CANCELLED' AND pr.cancelled_at >= datetime('now', '-1 day')))
          ${scopeFilter}
        GROUP BY pr.id
        ORDER BY pr.created_at DESC
      `,
          )
          .all();
        res.json(prs);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch PRs" });
      }
    },
  );

  purchasingRouter.get(
    "/api/purchasing/pr/:id",
    requireRole(ALL_PR_ROLES),
    (req, res) => {
      try {
        let pr = db
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
        WHERE pr.id = ?
      `,
          )
          .get(req.params.id) as any;

        if (!pr) {
          pr = db
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
          WHERE pr.pr_number = ?
        `,
            )
            .get(req.params.id) as any;
        }

        if (!pr) return res.status(404).json({ error: "PR not found" });

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
          .all(pr.id);

        res.json({ ...pr, items });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch PR details" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/revise-pr",
    requireRole(ALL_PR_ROLES),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      const actor =
        (req as any).username ||
        (req.headers["x-user-email"] as string) ||
        userRole ||
        "Manager";
      const isExec = ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"].includes(
        userRole,
      );
      if (!isExec && userLevel !== "MANAGER" && userLevel !== "SUPERVISOR") {
        return res.status(403).json({
          error:
            "Access denied. Only Supervisors, Managers, or Executive accounts can revise Purchase Requisitions.",
        });
      }
      try {
        const { pr_id, revision_note, pin } = req.body;
        if (
          pin &&
          !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
        ) {
          return res.status(400).json({ error: "Invalid Daily Authorization PIN" });
        }
        if (!revision_note) {
          return res.status(400).json({ error: "Revision note is required" });
        }

        db.prepare(
          "UPDATE purchase_requests SET status = 'REVISION', revision_note = ? WHERE id = ?",
        ).run(revision_note, pr_id);

        const pr = db
          .prepare("SELECT pr_number, project_id, general_request_id FROM purchase_requests WHERE id = ?")
          .get(pr_id) as any;

        if (pr?.general_request_id) {
          db.prepare(
            "UPDATE general_requests SET status = 'REVISION', revision_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(revision_note, pr.general_request_id);
        }

        // Propagate Revision back to any linked Procurement Wave Plan so planner can revise & resubmit
        try {
          const linkedPlans = db
            .prepare(
              `SELECT id, plan_code FROM procurement_plans
               WHERE status != 'ARCHIVED'
                 AND (
                   master_pr_id = ?
                   OR id IN (SELECT plan_id FROM pr_items WHERE pr_id = ? AND plan_id IS NOT NULL)
                   OR id IN (SELECT plan_id FROM procurement_plan_waves WHERE generated_pr_id = ?)
                 )`,
            )
            .all(pr_id, pr_id, pr_id) as { id: string; plan_code: string }[];

          for (const lp of linkedPlans) {
            db.prepare(
              `UPDATE procurement_plans
               SET status = 'REVISION',
                   revision_note = ?,
                   revised_by = ?,
                   revised_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            ).run(revision_note, actor, lp.id);

            db.prepare(
              `UPDATE procurement_plan_waves
               SET status = CASE
                 WHEN status IN ('PO_DRAFTED', 'PO_ISSUED', 'GRN_PARTIAL', 'GRN_RECEIVED') THEN status
                 ELSE 'REVISION'
               END
               WHERE plan_id = ?`,
            ).run(lp.id);
          }
        } catch (planRevErr) {
          console.warn("Could not propagate PR revision to procurement_plans:", planRevErr);
        }

        logAudit(
          req.headers["x-user-email"] as string,
          "REVISE_PR",
          "PR",
          pr_id,
          `PR ${pr?.pr_number} marked for revision and returned to Procurement Wave Plan. Note: ${revision_note}`,
        );

        res.json({
          success: true,
          message:
            "PR marked for revision and returned to Procurement Wave Plan for strategy adjustment.",
        });
      } catch (error) {
        console.error("Failed to revise PR:", error);
        res.status(500).json({ error: "Failed to revise PR" });
      }
    },
  );

  purchasingRouter.post("/api/purchasing/authorize-pr", (req, res) => {
    const userRole = (req as any).userRole || "STAFF";
    const userLevel = (req as any).userLevel || "STAFF";
    const username = (req as any).username || (req.headers["x-user-email"] as string) || userRole;

    try {
      const { pr_id, authorized_doc, pin } = req.body;

      if (
        pin !== undefined &&
        !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
      ) {
        return res.status(400).json({ error: "Invalid Daily Authorization PIN" });
      }

      const prDoc = db
        .prepare("SELECT * FROM purchase_requests WHERE id = ?")
        .get(pr_id) as any;
      if (!prDoc) return res.status(404).json({ error: "PR not found" });

      const estRow = db
        .prepare("SELECT COALESCE(SUM(qty * COALESCE(unit_price, 0)), 0) as total FROM pr_items WHERE pr_id = ?")
        .get(pr_id) as any;
      const prAmount = Number(prDoc.total_estimated_cost || estRow?.total || 0);
      const prDept =
        prDoc.department ||
        (prDoc.category === "PRODUCTION"
          ? "PRODUCTION"
          : prDoc.project_id === "GENERAL"
            ? userRole
            : "ENGINEERING");

      const wfResult = recordWorkflowStepApproval({
        documentType: "Purchase Request",
        documentId: pr_id,
        documentNumber: prDoc.pr_number || pr_id,
        documentTitle: prDoc.title || prDoc.remarks || `PR ${prDoc.pr_number}`,
        department: prDept,
        amount: prAmount,
        user: {
          username,
          name: (req as any).user?.name || username,
          role: userRole,
          level: userLevel,
        },
        executiveFastTrackAllSteps: true,
      });

      if (!wfResult.ok) {
        return res.status(403).json({
          error: wfResult.error,
        });
      }

      const docSignature =
        authorized_doc ||
        `Authorized by ${username} (${userRole}/${userLevel}) on ${new Date().toISOString()}`;

      if (wfResult.isFinalStep) {
        db.prepare(
          `UPDATE purchase_requests
           SET status = 'AUTHORIZED',
               revision_note = NULL,
               authorized_at = CURRENT_TIMESTAMP,
               authorized_doc = ?,
               workflow_step_index = ?,
               workflow_total_steps = ?,
               workflow_current_role = 'COMPLETED'
           WHERE id = ?`,
        ).run(
          docSignature,
          wfResult.approval.required_roles.length,
          wfResult.approval.required_roles.length,
          pr_id,
        );
        if (prDoc.general_request_id) {
          db.prepare(
            `UPDATE general_requests
             SET status = 'PR_GENERATED',
                 approved_by = ?,
                 approved_at = CURRENT_TIMESTAMP,
                 authorized_doc = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).run(username, docSignature, prDoc.general_request_id);
        }

        // Propagate Authorization back to linked Procurement Wave Plan
        try {
          const linkedPlans = db
            .prepare(
              `SELECT id FROM procurement_plans
               WHERE status != 'ARCHIVED'
                 AND (
                   master_pr_id = ?
                   OR id IN (SELECT plan_id FROM pr_items WHERE pr_id = ? AND plan_id IS NOT NULL)
                   OR id IN (SELECT plan_id FROM procurement_plan_waves WHERE generated_pr_id = ?)
                 )`,
            )
            .all(pr_id, pr_id, pr_id) as { id: string }[];

          for (const lp of linkedPlans) {
            db.prepare(
              `UPDATE procurement_plans
               SET status = 'PR_AUTHORIZED',
                   revision_note = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            ).run(lp.id);

            db.prepare(
              `UPDATE procurement_plan_waves
               SET status = CASE
                 WHEN status IN ('PO_DRAFTED', 'PO_ISSUED', 'GRN_PARTIAL', 'GRN_RECEIVED') THEN status
                 ELSE 'PR_AUTHORIZED'
               END
               WHERE plan_id = ?`,
            ).run(lp.id);
          }
        } catch (planAuthErr) {
          console.warn("Could not propagate PR authorization to procurement_plans:", planAuthErr);
        }

        syncProcurementTaskGantt(pr_id);
      } else {
        db.prepare(
          `UPDATE purchase_requests
           SET workflow_step_index = ?,
               workflow_total_steps = ?,
               workflow_current_role = ?,
               step_started_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(
          wfResult.approval.current_step_index,
          wfResult.approval.required_roles.length,
          wfResult.nextStepRole,
          pr_id,
        );
      }

      logAudit(
        req.headers["x-user-email"] as string,
        wfResult.isFinalStep ? "AUTHORIZE_PR" : "AUTHORIZE_PR_STEP",
        "PR",
        pr_id,
        `PR ${prDoc?.pr_number} step [${wfResult.completedStepRole}] authorized with doc: ${docSignature}`,
      );

      res.json({
        success: true,
        is_final_step: wfResult.isFinalStep,
        completed_step: wfResult.completedStepRole,
        next_step: wfResult.nextStepRole,
        message: wfResult.isFinalStep
          ? `PR ${prDoc.pr_number} is officially fully authorized!`
          : `Stage [${wfResult.completedStepRole}] approved. Awaiting next authorization stage: [${wfResult.nextStepRole}].`,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to authorize PR" });
    }
  });

  purchasingRouter.get(
    "/api/purchasing/pending-prs",
    requireRole(["PURCHASING", "WAREHOUSE"]),
    (_req, res) => {
      try {
        const pendingPrs = db
          .prepare(
            `
        SELECT 
          pri.id as pr_item_id,
          pr.id as pr_id,
          i.id as item_id,
          pr.pr_number,
          COALESCE(pr.project_id, 'GENERAL') as project_id,
          COALESCE(p.name, pr.project_id, 'General Operations') as project_name,
          i.item_code,
          i.name as item_name,
          i.type as item_type,
          pri.dimension,
          pri.spec,
          pri.qty,
          i.uom,
          COALESCE(NULLIF(pri.unit_price, 0), (SELECT MIN(isp.unit_price) FROM item_supplier_prices isp WHERE isp.item_id = i.id AND isp.unit_price > 0), i.unit_price, 0) as unit_price,
          pr.created_at,
          pri.expected_delivery_date,
          pr.drawing_reference,
          pr.status,
          pr.urgency,
          pr.category,
          COALESCE(pr.remarks, pr.notes) as remarks,
          COALESCE(gr.requester_name, pr.requested_by) as requested_by,
          gr.request_code as general_request_code,
          gr.title as general_request_title,
          gr.department as general_request_department,
          gr.justification as general_request_justification
        FROM pr_items pri
        JOIN purchase_requests pr ON pri.pr_id = pr.id
        LEFT JOIN projects p ON pr.project_id = p.id
        JOIN items i ON pri.item_id = i.id
        LEFT JOIN general_requests gr ON (pr.general_request_id = gr.id OR gr.pr_id = pr.id)
        WHERE pri.po_id IS NULL
          AND pri.plan_id IS NULL
          AND COALESCE(pr.archived, 0) = 0
          AND (p.status IS NULL OR pr.project_id IN ('GENERAL', 'CONSUMABLE', 'TRANSPORTATION', 'OTHERS') OR p.status NOT IN ('CANCELLED', 'CLOSED', 'FINISHED'))
          AND (pr.status NOT IN ('DRAFTED', 'REVISION', 'CANCELLED') OR (pr.status = 'CANCELLED' AND pr.cancelled_at >= datetime('now', '-1 day')))
        ORDER BY
          CASE pr.urgency WHEN 'CRITICAL' THEN 1 WHEN 'URGENT' THEN 2 ELSE 3 END ASC,
          pr.created_at DESC
      `,
          )
          .all();
        res.json(pendingPrs);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch pending PRs" });
      }
    },
  );
}
