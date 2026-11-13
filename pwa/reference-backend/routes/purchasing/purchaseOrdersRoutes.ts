import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { isValidDailyAuthKey } from "../../utils/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { syncProcurementTaskGantt } from "../../utils/ganttUtils.ts";
import { calculateFinancialBreakdown, type TaxScheme } from "../../lib/financialEngine.ts";
import { outboxService } from "../../services/outboxService.ts";
import { recordWorkflowStepApproval } from "../../services/workflowEngine.ts";
import {
  rollbackPrItemsForPlanOrWave,
  reconcileWaveAndPlanLifecycleByPo,
} from "./procurementPlanRoutes.ts";

export function registerPurchaseOrdersRoutes(purchasingRouter: Router) {
  purchasingRouter.post(
    "/api/purchasing/create-po",
    requireRole(["PURCHASING"]),
    (req, res) => {
      try {
        const {
          supplier_id,
          supplier_name,
          pr_item_ids,
          auth_doc_name,
          urgency,
          tax_category,
          tax_scheme,
          ppn_rate,
          pph_rate,
          payment_terms,
          supplier_npwp,
          rounding_factor,
        } = req.body;
        let { expected_date } = req.body;

        const category = tax_category || "GOODS";
        const parsedPpnRate = ppn_rate !== undefined && ppn_rate !== null ? Number(ppn_rate) : 12;
        const parsedPphRate = pph_rate !== undefined && pph_rate !== null ? Number(pph_rate) : (category === "SERVICES" ? 2 : 0);

        let defaultNpwp = supplier_npwp || null;
        let defaultTaxScheme = tax_scheme || (parsedPpnRate === 0 ? "NON_PKP" : "DPP_NILAI_LAIN");
        let defaultPaymentTerms = payment_terms || "Net 30 Days";

        if (supplier_id) {
          const supRow = db.prepare("SELECT npwp, tax_scheme, payment_terms FROM suppliers WHERE id = ?").get(supplier_id) as any;
          if (supRow) {
            if (!defaultNpwp && supRow.npwp) defaultNpwp = supRow.npwp;
            if (!tax_scheme && supRow.tax_scheme) defaultTaxScheme = supRow.tax_scheme;
            if (!payment_terms && supRow.payment_terms) defaultPaymentTerms = supRow.payment_terms;
          }
        }

        const poId = "PO-" + Math.random().toString(36).substr(2, 9);
        const poNumber =
          "PO-" +
          new Date().getFullYear() +
          "-" +
          Math.floor(100000 + Math.random() * 900000);

        const insertPo = db.prepare(
          `INSERT INTO purchase_orders (
            id, po_number, supplier_id, supplier_name, supplier_npwp, expected_date, auth_doc_name, 
            status, urgency, tax_category, tax_scheme, ppn_rate, pph_rate, payment_terms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFTED', ?, ?, ?, ?, ?, ?)`,
        );
        const updatePrItem = db.prepare(
          "UPDATE pr_items SET po_id = ? WHERE id = ?",
        );
        const checkPrStatus = db.prepare(`
        SELECT COUNT(*) as pending_count 
        FROM pr_items 
        WHERE pr_id = (SELECT pr_id FROM pr_items WHERE id = ?) AND po_id IS NULL
      `);
        const updatePrStatus = db.prepare(
          "UPDATE purchase_requests SET status = 'ORDERED' WHERE id = (SELECT pr_id FROM pr_items WHERE id = ?)",
        );

        const transaction = db.transaction(() => {
          if (pr_item_ids && pr_item_ids.length > 0) {
            const placeholders = pr_item_ids.map(() => "?").join(",");
            const inactiveProjects = db
              .prepare(
                `
            SELECT DISTINCT p.id, p.name, p.status 
            FROM pr_items pri
            JOIN purchase_requests pr ON pri.pr_id = pr.id
            JOIN projects p ON pr.project_id = p.id
            WHERE pri.id IN (${placeholders}) AND p.status IN ('CANCELLED', 'CLOSED', 'FINISHED') AND pr.project_id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
          `,
              )
              .all(...pr_item_ids) as any[];

            if (inactiveProjects.length > 0) {
              throw new Error(
                `Cannot create PO for closed/cancelled projects: ${inactiveProjects.map((p) => `${p.name} (${p.status})`).join(", ")}`,
              );
            }
          }

          if (!expected_date && pr_item_ids && pr_item_ids.length > 0) {
            const placeholders = pr_item_ids.map(() => "?").join(",");
            const minDateRow = db
              .prepare(
                `SELECT MIN(expected_delivery_date) as min_date FROM pr_items WHERE id IN (${placeholders}) AND expected_delivery_date IS NOT NULL`,
              )
              .get(...pr_item_ids) as { min_date: string };
            expected_date = minDateRow?.min_date || null;
          }

          insertPo.run(
            poId,
            poNumber,
            supplier_id || null,
            supplier_name,
            defaultNpwp,
            expected_date || null,
            auth_doc_name || null,
            urgency || "NORMAL",
            category,
            defaultTaxScheme,
            parsedPpnRate,
            parsedPphRate,
            defaultPaymentTerms,
          );

          let totalAmount = 0;
          for (const prItemId of pr_item_ids) {
            const prItemInfo = db
              .prepare(
                "SELECT item_id, qty, unit_price as requested_price, po_id FROM pr_items WHERE id = ?",
              )
              .get(prItemId) as any;
              
            if (prItemInfo.po_id) {
               throw new Error("One or more PR items are already assigned to another PO.");
            }

            const supplierPriceRow = db
              .prepare(
                "SELECT unit_price FROM item_supplier_prices WHERE item_id = ? AND supplier_id = ?",
              )
              .get(prItemInfo.item_id, supplier_id) as
              { unit_price: number } | undefined;

            let finalUnitPrice = supplierPriceRow?.unit_price;
            if (finalUnitPrice === undefined) {
              const globalItemPrice = db
                .prepare("SELECT unit_price FROM items WHERE id = ?")
                .get(prItemInfo.item_id) as { unit_price: number };
              finalUnitPrice =
                globalItemPrice?.unit_price ||
                prItemInfo.requested_price ||
                0;
            }

            updatePrItem.run(poId, prItemId);

            db.prepare("UPDATE pr_items SET unit_price = ? WHERE id = ?").run(
              finalUnitPrice,
              prItemId,
            );

            totalAmount += Number(prItemInfo.qty) * finalUnitPrice;

            const { pending_count } = checkPrStatus.get(prItemId) as any;
            if (pending_count === 0) {
              updatePrStatus.run(prItemId);
            } else {
              db.prepare(
                "UPDATE purchase_requests SET status = 'PARTIAL_ORDERED' WHERE id = (SELECT pr_id FROM pr_items WHERE id = ?)",
              ).run(prItemId);
            }
          }

          try {
            const placeholders = pr_item_ids.map(() => "?").join(",");
            const linkedPrs = db.prepare(`
              SELECT DISTINCT pr.id, pr.pr_number, pr.general_request_id
              FROM pr_items pri
              JOIN purchase_requests pr ON pri.pr_id = pr.id
              WHERE pri.id IN (${placeholders})
            `).all(...pr_item_ids) as any[];

            for (const lpr of linkedPrs) {
              db.prepare(`
                UPDATE general_requests
                SET status = 'PO_ISSUED',
                    po_id = ?,
                    po_number = ?,
                    supplier_name = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE pr_id = ? OR id = ?
              `).run(poId, poNumber, supplier_name || "Supplier", lpr.id, lpr.general_request_id || "");
            }
          } catch (syncErr) {
            console.error("Failed to sync General Request to PO:", syncErr);
          }

          const breakdown = calculateFinancialBreakdown({
            dpp: totalAmount,
            taxRate: parsedPpnRate,
            pphRate: parsedPphRate,
            taxScheme: defaultTaxScheme as TaxScheme,
            roundingFactor: rounding_factor !== undefined && rounding_factor !== null ? Number(rounding_factor) : 0,
          });

          db.prepare(
            `UPDATE purchase_orders 
             SET total_amount = ?, dpp = ?, dpp_nilai_lain = ?, ppn = ?, pph = ?, rounding_factor = ?, grand_total = ?, tax_scheme = ? 
             WHERE id = ?`,
          ).run(
            breakdown.dpp, 
            breakdown.dpp, 
            breakdown.dppNilaiLain, 
            breakdown.ppnAmount, 
            breakdown.pphAmount, 
            breakdown.roundingFactor, 
            breakdown.grandTotal, 
            breakdown.taxScheme, 
            poId
          );

          outboxService.enqueue(
            db,
            "PURCHASE_ORDERS",
            poId,
            "CREATE",
            {
              id: poId,
              po_number: poNumber,
              status: "DRAFTED",
              supplier_id,
              total_amount: breakdown.grandTotal,
              grand_total: breakdown.grandTotal,
              created_at: new Date().toISOString()
            },
            "BOTH"
          );

          return poNumber;
        });

        const finalPoNumber = transaction();

        logAudit(
          req.headers["x-user-email"] as string,
          "CREATE_PO",
          "PO",
          poId,
          `PO ${finalPoNumber} created for ${supplier_name}`,
        );

        try {
          if (pr_item_ids && pr_item_ids.length > 0) {
            const placeholders = pr_item_ids.map(() => "?").join(",");
            const prIds = db
              .prepare(
                `SELECT DISTINCT pr_id FROM pr_items WHERE id IN (${placeholders})`,
              )
              .all(...pr_item_ids) as { pr_id: string }[];
            for (const { pr_id } of prIds) {
              syncProcurementTaskGantt(pr_id);
            }
          }
        } catch (err) {
          console.error("Post-PO Gantt sync failed:", err);
        }

        res.json({ success: true, id: poId, po_number: finalPoNumber });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create PO" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/po/:id/cancel",
    requireRole(["PURCHASING"]),
    (req, res) => {
      try {
        const poId = req.params.id;

        const hasGrns =
          (
            db
              .prepare("SELECT COUNT(*) as count FROM grns WHERE po_id = ?")
              .get(poId) as any
          ).count > 0;
        if (hasGrns) {
          return res.status(400).json({
            error:
              "Cannot cancel a PO that has receipt records (GRN). Please contact warehouse to revert first.",
          });
        }

        db.transaction(() => {
          db.prepare(
            "UPDATE purchase_orders SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(poId);

          const prIds = db
            .prepare("SELECT DISTINCT pr_id FROM pr_items WHERE po_id = ?")
            .all(poId) as { pr_id: string }[];

          rollbackPrItemsForPlanOrWave({ poId });

          for (const { pr_id } of prIds) {
            db.prepare(
              `UPDATE general_requests
               SET status = 'PR_GENERATED',
                   po_id = NULL,
                   po_number = NULL,
                   supplier_name = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE pr_id = ? OR po_id = ?`,
            ).run(pr_id, poId);
            syncProcurementTaskGantt(pr_id);
          }
        })();
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to cancel PO" });
      }
    },
  );

  purchasingRouter.put(
    "/api/purchasing/po/:id",
    requireRole(["PURCHASING", "FC"]),
    (req, res) => {
      try {
        const poId = req.params.id;
        const {
          supplier_name,
          supplier_npwp,
          currency,
          exchange_rate,
          vat_rate,
          ppn_rate,
          pph_rate,
          tax_category,
          tax_scheme,
          shipping_fee,
          expected_date,
          remarks,
          payment_terms,
          rounding_factor,
        } = req.body;

        const po = db
          .prepare("SELECT * FROM purchase_orders WHERE id = ?")
          .get(poId) as any;
        if (!po) return res.status(404).json({ error: "PO not found" });

        const category = tax_category || po.tax_category || "GOODS";
        const finalPpnRate = ppn_rate !== undefined && ppn_rate !== null ? Number(ppn_rate) : (vat_rate !== undefined && vat_rate !== null ? Number(vat_rate) : Number(po.ppn_rate ?? 12));
        const finalPphRate = pph_rate !== undefined && pph_rate !== null ? Number(pph_rate) : Number(po.pph_rate ?? (category === "SERVICES" ? 2 : 0));
        const finalTaxScheme = (tax_scheme || po.tax_scheme || (finalPpnRate === 0 ? "NON_PKP" : "DPP_NILAI_LAIN")) as TaxScheme;

        const baseAmount = po.dpp > 0 ? po.dpp : (po.total_amount || 0);

        const breakdown = calculateFinancialBreakdown({
          dpp: baseAmount,
          taxRate: finalPpnRate,
          pphRate: finalPphRate,
          taxScheme: finalTaxScheme,
          roundingFactor: rounding_factor !== undefined && rounding_factor !== null ? Number(rounding_factor) : (po.rounding_factor !== undefined && po.rounding_factor !== null ? Number(po.rounding_factor) : 0),
        });

        db.transaction(() => {
          db.prepare(
            `
              UPDATE purchase_orders 
              SET supplier_name = ?, 
                  supplier_npwp = ?,
                  currency = ?, 
                  exchange_rate = ?, 
                  vat_rate = ?, 
                  ppn_rate = ?, 
                  pph_rate = ?, 
                  tax_category = ?,
                  tax_scheme = ?,
                  shipping_fee = ?, 
                  expected_date = ?, 
                  remarks = ?, 
                  payment_terms = ?,
                  dpp = ?,
                  dpp_nilai_lain = ?,
                  ppn = ?,
                  pph = ?,
                  rounding_factor = ?,
                  grand_total = ?,
                  status = 'PENDING',
                  revision_note = NULL
              WHERE id = ?
            `,
          ).run(
            supplier_name || po.supplier_name,
            supplier_npwp !== undefined ? supplier_npwp : po.supplier_npwp,
            currency || po.currency,
            exchange_rate || po.exchange_rate,
            finalPpnRate,
            finalPpnRate,
            finalPphRate,
            category,
            breakdown.taxScheme,
            shipping_fee ?? po.shipping_fee,
            expected_date || po.expected_date,
            remarks || po.remarks,
            payment_terms || po.payment_terms,
            breakdown.dpp,
            breakdown.dppNilaiLain,
            breakdown.ppnAmount,
            breakdown.pphAmount,
            breakdown.roundingFactor,
            breakdown.grandTotal,
            poId,
          );
          reconcileWaveAndPlanLifecycleByPo(poId);
        })();

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "UPDATE_PO",
          "PURCHASE_ORDER",
          poId,
          `Revised PO ${po.po_number}`,
        );

        res.json({ success: true, message: "PO updated successfully" });
      } catch (error: any) {
        console.error(error);
        res
          .status(500)
          .json({ error: "Failed to update PO", details: error.message });
      }
    },
  );

  purchasingRouter.delete(
    "/api/purchasing/po/:id",
    requireRole(["PURCHASING"]),
    (req, res) => {
      try {
        const poId = req.params.id;
        const po = db
          .prepare("SELECT status FROM purchase_orders WHERE id = ?")
          .get(poId) as { status: string };
        if (po && po.status !== "DRAFTED" && po.status !== "CANCELLED") {
          return res
            .status(400)
            .json({ error: "Only drafted or cancelled POs can be deleted." });
        }

        db.transaction(() => {
          const grns = db
            .prepare("SELECT id FROM grns WHERE po_id = ?")
            .all(poId) as { id: string }[];
          for (const { id: grnId } of grns) {
            db.prepare("DELETE FROM inventory_labels WHERE grn_id = ?").run(
              grnId,
            );
            db.prepare("DELETE FROM grn_items WHERE grn_id = ?").run(grnId);
          }
          db.prepare("DELETE FROM grns WHERE po_id = ?").run(poId);

          const prIds = db
            .prepare("SELECT DISTINCT pr_id FROM pr_items WHERE po_id = ?")
            .all(poId) as { pr_id: string }[];

          rollbackPrItemsForPlanOrWave({ poId });

          for (const { pr_id } of prIds) {
            syncProcurementTaskGantt(pr_id);
          }
          db.prepare(
            "UPDATE purchase_orders SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(poId);
        })();
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete PO" });
      }
    },
  );

  purchasingRouter.get(
    "/api/purchasing/pos",
    requireRole([
      "PURCHASING",
      "WAREHOUSE",
      "QA_QC",
      "PPIC",
      "PRODUCTION",
      "ENGINEERING",
      "FC",
      "BOD",
      "DIRECTOR",
      "ADMIN",
      "FINANCE",
      "SALES",
    ]),
    (_req, res) => {
      try {
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

        const pos = db
          .prepare(
            `
        SELECT 
          po.*,
          s.phone as supplier_phone,
          s.email as supplier_email,
          COUNT(pri.id) as item_count,
          GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers,
          MAX(CASE WHEN pr.status = 'CANCELLED' THEN 1 ELSE 0 END) as has_cancelled_pr,
          (
            SELECT COUNT(g.id)
            FROM grns g
            LEFT JOIN grn_items gi ON gi.grn_id = g.id
            WHERE g.po_id = po.id
              AND (g.qc_status = 'REJECTED' OR COALESCE(gi.qty_rejected, 0) > 0)
          ) as has_rejected_grn,
          COALESCE(SUM(pri.qty), 0) - COALESCE((
            SELECT SUM(COALESCE(gi.qty_passed, CASE WHEN g.qc_status = 'REJECTED' THEN 0 ELSE gi.qty_received END))
            FROM grn_items gi
            JOIN grns g ON gi.grn_id = g.id
            WHERE g.po_id = po.id AND g.qc_status IN ('PASSED', 'CONDITIONAL')
          ), 0) as pending_qty
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN pr_items pri ON po.id = pri.po_id
        LEFT JOIN purchase_requests pr ON pri.pr_id = pr.id
        WHERE po.archived = 0 AND (po.status != 'CANCELLED' OR (po.status = 'CANCELLED' AND po.cancelled_at >= datetime('now', '-1 day')))
        GROUP BY po.id
        ORDER BY po.created_at DESC
      `,
          )
          .all();
        res.json(pos);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch POs" });
      }
    },
  );

  purchasingRouter.get(
    "/api/purchasing/pending-receipts",
    requireRole(["WAREHOUSE", "QA_QC", "PURCHASING", "PPIC"]),
    (_req, res) => {
      try {
        const items = db
          .prepare(
            `
        SELECT 
          i.id as item_id,
          i.item_code,
          i.name as item_name,
          i.uom,
          po.id as po_id,
          po.po_number,
          po.supplier_name,
          s.phone as supplier_phone,
          s.email as supplier_email,
          pri.qty as ordered_qty,
          COALESCE((
            SELECT SUM(COALESCE(gi.qty_passed, CASE WHEN g.qc_status = 'REJECTED' THEN 0 ELSE gi.qty_received END)) 
            FROM grn_items gi 
            JOIN grns g ON gi.grn_id = g.id 
            WHERE g.po_id = po.id AND gi.item_id = i.id AND g.qc_status IN ('PASSED', 'CONDITIONAL')
          ), 0) as received_qty
        FROM pr_items pri
        JOIN items i ON pri.item_id = i.id
        JOIN purchase_orders po ON pri.po_id = po.id
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        WHERE po.status IN ('ISSUED', 'PARTIAL')
        GROUP BY i.id, i.item_code, i.name, i.uom, po.id, po.po_number, po.supplier_name,
          s.phone,
          s.email, pri.qty
        HAVING ordered_qty - received_qty > 0
        ORDER BY po.created_at ASC
      `,
          )
          .all();

        const result = items.map((item: any) => ({
          ...item,
          pending_qty: item.ordered_qty - item.received_qty,
        }));

        res.json(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch pending receipts" });
      }
    },
  );

  purchasingRouter.get(
    "/api/purchasing/po/:id",
    requireRole([
      "PURCHASING",
      "WAREHOUSE",
      "QA_QC",
      "PPIC",
      "PRODUCTION",
      "ENGINEERING",
      "FC",
      "BOD",
      "DIRECTOR",
      "ADMIN",
      "FINANCE",
      "SALES",
    ]),
    (req, res) => {
      try {
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
        WHERE po.id = ?
        GROUP BY po.id
      `,
          )
          .get(req.params.id);

        if (!po) return res.status(404).json({ error: "PO not found" });

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
          .all(req.params.id, req.params.id, req.params.id);

        res.json({ ...(po as any), items });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch PO details" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/po/:id/issue-reject",
    requireRole(["PURCHASING", "QA_QC", "WAREHOUSE", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const poId = req.params.id;
        const { reject_doc_name } = req.body;
        db.transaction(() => {
          db.prepare(
            "UPDATE purchase_orders SET status = 'ISSUED' WHERE id = ?",
          ).run(poId);
          reconcileWaveAndPlanLifecycleByPo(poId);
        })();
        logAudit(
          req.headers["x-user-email"] as string,
          "ISSUE_REJECT",
          "PO",
          poId,
          `Reject document ${reject_doc_name} issued. PO is now back to ISSUED status.`,
        );
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to issue reject" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/po/:id/finish",
    requireRole(["PURCHASING", "QA_QC", "WAREHOUSE", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const poId = req.params.id;
        db.prepare(
          "UPDATE purchase_orders SET status = 'FINISHED' WHERE id = ?",
        ).run(poId);
        reconcileWaveAndPlanLifecycleByPo(poId);
        logAudit(
          req.headers["x-user-email"] as string,
          "FINISH_PO",
          "PO",
          poId,
          `PO forced finished`,
        );
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to finish PO" });
      }
    },
  );

  purchasingRouter.post(
    "/api/purchasing/revise-po",
    requireRole([
      "PURCHASING",
      "FINANCE",
      "ENGINEERING",
      "PRODUCTION",
      "WAREHOUSE",
      "PPIC",
      "QA_QC",
      "FC",
      "BOD",
      "DIRECTOR",
      "ADMIN",
    ]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      const isExec = ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"].includes(
        userRole,
      );
      if (!isExec && userLevel !== "MANAGER" && userLevel !== "SUPERVISOR") {
        return res.status(403).json({
          error:
            "Access denied. Only Supervisors, Managers, or Executive accounts can revise POs.",
        });
      }
      try {
        const { po_id, revision_note, pin } = req.body;
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
          "UPDATE purchase_orders SET status = 'REVISION', revision_note = ? WHERE id = ?",
        ).run(revision_note, po_id);
        reconcileWaveAndPlanLifecycleByPo(po_id);

        const po = db
          .prepare("SELECT po_number FROM purchase_orders WHERE id = ?")
          .get(po_id) as any;
        logAudit(
          req.headers["x-user-email"] as string,
          "REVISE_PO",
          "PO",
          po_id,
          `PO ${po?.po_number} marked for revision. Note: ${revision_note}`,
        );

        res.json({ success: true, message: "PO marked for revision" });
      } catch (error) {
        console.error("Failed to revise PO:", error);
        res.status(500).json({ error: "Failed to revise PO" });
      }
    },
  );

  purchasingRouter.post("/api/purchasing/authorize-po", (req, res) => {
    const userRole = (req as any).userRole || "STAFF";
    const userLevel = (req as any).userLevel || "STAFF";
    const username = (req as any).username || (req.headers["x-user-email"] as string) || userRole;
    try {
      const { po_id, auth_doc_name, pin } = req.body;

      if (
        pin !== undefined &&
        !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
      ) {
        return res.status(400).json({ error: "Invalid Daily Authorization PIN" });
      }

      const po = db
        .prepare("SELECT * FROM purchase_orders WHERE id = ?")
        .get(po_id) as any;
      if (!po) return res.status(404).json({ error: "PO not found" });

      const poAmount = Number(po.grand_total || po.total_amount || 0);

      const wfResult = recordWorkflowStepApproval({
        documentType: "Purchase Order",
        documentId: po_id,
        documentNumber: po.po_number || po_id,
        documentTitle: `PO Supplier: ${po.supplier_name || "Vendor"}`,
        department: "PURCHASING",
        amount: poAmount,
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
        auth_doc_name ||
        `Authorized by ${username} (${userRole}/${userLevel}) on ${new Date().toISOString()}`;

      const transaction = db.transaction(() => {
        if (wfResult.isFinalStep) {
          db.prepare(
            `UPDATE purchase_orders
             SET status = 'ISSUED',
                 authorized_at = CURRENT_TIMESTAMP,
                 auth_doc_name = ?,
                 workflow_step_index = ?,
                 workflow_total_steps = ?,
                 workflow_current_role = 'COMPLETED'
             WHERE id = ?`,
          ).run(
            docSignature,
            wfResult.approval.required_roles.length,
            wfResult.approval.required_roles.length,
            po_id,
          );
          try {
            db.prepare(
              `UPDATE general_requests
               SET status = 'PO_AUTHORIZED',
                   po_id = COALESCE(po_id, ?),
                   po_number = COALESCE(po_number, ?),
                   supplier_name = COALESCE(supplier_name, ?),
                   updated_at = CURRENT_TIMESTAMP
               WHERE po_id = ? OR pr_id IN (SELECT pr_id FROM pr_items WHERE po_id = ?)`,
            ).run(po_id, po.po_number, po.supplier_name || "Vendor", po_id, po_id);
          } catch (_) {}
        } else {
          db.prepare(
            `UPDATE purchase_orders
             SET status = 'PENDING',
                 auth_doc_name = ?,
                 workflow_step_index = ?,
                 workflow_total_steps = ?,
                 workflow_current_role = ?,
                 step_started_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).run(
            docSignature,
            wfResult.approval.current_step_index,
            wfResult.approval.required_roles.length,
            wfResult.nextStepRole,
            po_id,
          );
        }
      });

      transaction();
      reconcileWaveAndPlanLifecycleByPo(po_id);
      logAudit(
        req.headers["x-user-email"] as string,
        wfResult.isFinalStep ? "AUTHORIZE_PO" : "AUTHORIZE_PO_STEP",
        "PO",
        po_id,
        `PO ${po.po_number} step [${wfResult.completedStepRole}] authorized with document: ${docSignature}.`,
      );

      if (wfResult.isFinalStep) {
        try {
          const prs = db
            .prepare("SELECT DISTINCT pr_id FROM pr_items WHERE po_id = ?")
            .all(po_id) as { pr_id: string }[];
          for (const { pr_id } of prs) {
            syncProcurementTaskGantt(pr_id);
          }
        } catch (err) {
          console.error("Post-authorization Gantt sync failed:", err);
        }
      }

      res.json({
        success: true,
        is_final_step: wfResult.isFinalStep,
        completed_step: wfResult.completedStepRole,
        next_step: wfResult.nextStepRole,
        message: wfResult.isFinalStep
          ? `PO ${po.po_number} is officially ISSUED!`
          : `Stage [${wfResult.completedStepRole}] approved. Awaiting next authorization stage: [${wfResult.nextStepRole}].`,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to authorize PO" });
    }
  });
}
