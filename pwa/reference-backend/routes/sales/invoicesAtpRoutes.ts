import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { calculateFinancialBreakdown } from "../../lib/financialEngine.ts";
import {
  postCommercialInvoiceJournal,
  postFinalSettlementInvoiceJournal,
} from "../../utils/accountingBridge.ts";
import { outboxService } from "../../services/outboxService.ts";
import {
  generateDNNumber,
  batchGetDeliveryNoteItemsWithPrices,
  getDeliveryNoteItemsWithPrices,
} from "./helpers.ts";
import crypto from "crypto";

function evaluateItemsAtpCtp(rawItems: any[]) {
  const latestFfRow = db
    .prepare("SELECT new_wma_ff, achieved_ff FROM factory_factor_history ORDER BY created_at DESC LIMIT 1")
    .get() as any;
  const avgProjFfRow = db
    .prepare("SELECT AVG(COALESCE(factory_factor, 85)) as avg_ff FROM projects WHERE status NOT IN ('CANCELLED')")
    .get() as any;
  const factoryFactorWma = Number(
    (latestFfRow?.new_wma_ff ?? latestFfRow?.achieved_ff ?? avgProjFfRow?.avg_ff ?? 85).toFixed(1)
  );

  const machineRows = db
    .prepare(
      `SELECT id, name, item_code, COALESCE(operational_status, machine_status, 'AVAILABLE') as status,
              COALESCE(capacity_per_hour, 10) as capacity_per_hour
       FROM items
       WHERE item_type = 'MACHINE' OR type = 'MACHINE' OR machine_category IS NOT NULL`
    )
    .all() as any[];

  const activeNdpMachines = db
    .prepare(
      `SELECT DISTINCT COALESCE(affected_machine_id, machine_id) as m_id
       FROM (
         SELECT affected_machine_id, machine_id, status FROM ndps WHERE status IN ('ACTIVE', 'ACKNOWLEDGED')
         UNION ALL
         SELECT affected_machine_id, machine_id, status FROM notice_to_down_processes WHERE status IN ('ACTIVE', 'OPEN')
       )
       WHERE COALESCE(affected_machine_id, machine_id) IS NOT NULL`
    )
    .all() as any[];
  const lockedMachineIds = new Set(activeNdpMachines.map((r) => r.m_id));

  const totalMachines = Math.max(1, machineRows.length || 4);
  const downMachinesCount = machineRows.filter(
    (m) => lockedMachineIds.has(m.id) || String(m.status).toUpperCase() === "DOWN" || String(m.status).toUpperCase() === "MAINTENANCE"
  ).length;
  const activeMachinesCount = Math.max(1, totalMachines - downMachinesCount);

  const wipBacklogRow = db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE
           WHEN b.status = 'COMPLETED' THEN 0
           ELSE COALESCE(b.standard_hours, 8) * (1.0 - COALESCE(b.progress, 0) / 100.0)
         END
       ), 0) as backlog_hours
       FROM bill_of_processes b
       JOIN projects p ON b.project_id = p.id
       WHERE p.status IN ('ACTIVE', 'IN_PROGRESS', 'RUNNING')`
    )
    .get() as any;
  const wipBacklogHours = Number((wipBacklogRow?.backlog_hours || 0).toFixed(1));

  const shiftHours = 8;
  const effectiveDailyCapacityHours = Number(
    (activeMachinesCount * shiftHours * (factoryFactorWma / 100)).toFixed(2)
  );

  const evaluatedItems = (rawItems || []).map((it, idx) => {
    const orderedQty = Math.max(0, Number(it.qty ?? it.quantity ?? 1));
    const itemTitle = String(it.title || it.item_name || it.name || `Item ${idx + 1}`).trim();
    const uom = String(it.uom || "Unit");

    let matchedItem: any = null;
    if (it.item_id) {
      matchedItem = db
        .prepare(
          `SELECT i.id, i.item_code, i.name, i.uom, i.type,
                  COALESCE(inv.free_stock, inv.available_qty, i.stock_quantity, 0) as free_stock
           FROM items i
           LEFT JOIN inventory inv ON inv.item_id = i.id
           WHERE i.id = ? OR i.item_code = ?
           LIMIT 1`
        )
        .get(it.item_id, it.item_id);
    }
    if (!matchedItem && itemTitle) {
      matchedItem = db
        .prepare(
          `SELECT i.id, i.item_code, i.name, i.uom, i.type,
                  COALESCE(inv.free_stock, inv.available_qty, i.stock_quantity, 0) as free_stock
           FROM items i
           LEFT JOIN inventory inv ON inv.item_id = i.id
           WHERE LOWER(TRIM(i.name)) = LOWER(TRIM(?))
              OR LOWER(TRIM(i.item_code)) = LOWER(TRIM(?))
           ORDER BY CASE WHEN i.type IN ('FINISHED', 'FINISH_GOOD') THEN 0 ELSE 1 END,
                    COALESCE(inv.free_stock, 0) DESC
           LIMIT 1`
        )
        .get(itemTitle, itemTitle);
    }

    const freeStock = Math.max(0, Number(matchedItem?.free_stock || 0));
    const atpQty = Math.min(orderedQty, freeStock);
    const netMtoQty = Math.max(0, orderedQty - atpQty);

    const histBop = db
      .prepare(
        `SELECT SUM(COALESCE(b.cycle_time_minutes, b.standard_hours * 60, 30)) / 60.0 as total_cycle_hrs,
                MAX(COALESCE(p.qty, 1)) as proj_qty
         FROM bill_of_processes b
         JOIN projects p ON b.project_id = p.id
         WHERE LOWER(p.name) LIKE '%' || LOWER(?) || '%'
         GROUP BY p.id
         ORDER BY p.created_at DESC
         LIMIT 1`
      )
      .get(itemTitle.slice(0, 24)) as any;

    let unitCycleHours = 0.25;
    if (histBop && Number(histBop.total_cycle_hrs) > 0) {
      const perUnit = Number(histBop.total_cycle_hrs) / Math.max(1, Number(histBop.proj_qty));
      unitCycleHours = Math.min(8, Math.max(0.05, Number(perUnit.toFixed(2))));
    }

    const estMtoHours = Number((netMtoQty * unitCycleHours).toFixed(2));
    const itemMode: "MTS" | "HYBRID" | "MTO" =
      netMtoQty === 0 ? "MTS" : atpQty > 0 ? "HYBRID" : "MTO";

    return {
      quotation_item_id: it.id || null,
      item_id: matchedItem?.id || it.item_id || null,
      item_code: matchedItem?.item_code || it.barcode || "CUSTOM-MTO",
      title: itemTitle,
      uom,
      ordered_qty: orderedQty,
      free_stock: freeStock,
      atp_qty: atpQty,
      net_mto_qty: netMtoQty,
      unit_cycle_hours: unitCycleHours,
      est_mto_hours: estMtoHours,
      fulfillment_mode: itemMode,
    };
  });

  const totalOrderedQty = evaluatedItems.reduce((acc, i) => acc + i.ordered_qty, 0);
  const totalAtpQty = evaluatedItems.reduce((acc, i) => acc + i.atp_qty, 0);
  const totalNetMtoQty = evaluatedItems.reduce((acc, i) => acc + i.net_mto_qty, 0);
  const totalMtoHours = Number(
    evaluatedItems.reduce((acc, i) => acc + i.est_mto_hours, 0).toFixed(2)
  );

  const recommendedMode: "MTS" | "HYBRID" | "MTO" =
    totalNetMtoQty === 0 && totalOrderedQty > 0
      ? "MTS"
      : totalAtpQty > 0 && totalNetMtoQty > 0
        ? "HYBRID"
        : "MTO";

  const effectiveQueueHours = totalNetMtoQty > 0 ? totalMtoHours + Math.min(wipBacklogHours * 0.25, 24) : 0;
  const requiredProductionDays =
    totalNetMtoQty === 0
      ? 0
      : Math.max(1, Math.ceil(effectiveQueueHours / Math.max(1, effectiveDailyCapacityHours)));

  const ctpDate = new Date();
  let daysAdded = 0;
  while (daysAdded < requiredProductionDays) {
    ctpDate.setDate(ctpDate.getDate() + 1);
    if (ctpDate.getDay() !== 0) {
      daysAdded++;
    }
  }
  const ctpPromiseDate = ctpDate.toISOString().split("T")[0];

  return {
    recommended_mode: recommendedMode,
    can_fulfill_mts_immediately: totalAtpQty > 0,
    is_full_mts_ready: totalNetMtoQty === 0 && totalOrderedQty > 0,
    ctp_promise_date: ctpPromiseDate,
    required_production_days: requiredProductionDays,
    summary: {
      total_ordered_qty: totalOrderedQty,
      total_atp_qty: totalAtpQty,
      total_net_mto_qty: totalNetMtoQty,
      total_mto_hours: totalMtoHours,
    },
    capacity_telemetry: {
      factory_factor_wma: factoryFactorWma,
      total_machines: totalMachines,
      active_machines: activeMachinesCount,
      down_machines: downMachinesCount,
      active_ndp_locks: lockedMachineIds.size,
      shift_hours: shiftHours,
      effective_daily_capacity_hours: effectiveDailyCapacityHours,
      active_wip_backlog_hours: wipBacklogHours,
    },
    items: evaluatedItems,
  };
}

export function registerInvoicesAtpRoutes(salesRouter: Router) {
  // --- BANK ACCOUNTS ----
  salesRouter.get("/api/bank-accounts", (req, res) => {
    try {
      const accounts = db
        .prepare("SELECT * FROM bank_accounts ORDER BY created_at DESC")
        .all();
      res.json(accounts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch bank accounts" });
    }
  });

  salesRouter.post(
    "/api/bank-accounts",
    requireRole(["FC", "SALES", "PURCHASING", "WAREHOUSE", "ENGINEERING"]),
    (req, res) => {
      try {
        const { bank_name, account_number, account_holder, branch } =
          req.body;
        if (!bank_name || !account_number || !account_holder) {
          return res.status(400).json({ error: "Missing required fields" });
        }
        const id =
          "BNK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
        db.prepare(
          "INSERT INTO bank_accounts (id, bank_name, account_number, account_holder, branch) VALUES (?, ?, ?, ?, ?)",
        ).run(id, bank_name, account_number, account_holder, branch || null);

        logAudit(
          (req.headers["x-user-username"] as string) || null,
          "REGISTER_BANK_ACCOUNT",
          "BANK_ACCOUNT",
          id,
          `Registered bank ${bank_name} - ${account_number}`,
        );
        res.json({ success: true, id });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to register bank account" });
      }
    },
  );

  salesRouter.delete(
    "/api/bank-accounts/:id",
    requireRole(["FC", "SALES", "PURCHASING", "WAREHOUSE", "ENGINEERING"]),
    (req, res) => {
      try {
        db.prepare("DELETE FROM bank_accounts WHERE id = ?").run(
          req.params.id,
        );
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete bank account" });
      }
    },
  );

  // --- COMMERCIAL INVOICES ----
  salesRouter.get("/api/sales/invoices", requireRole(["FC", "SALES", "FINANCE"]), (req, res) => {
    try {
      const invoices = db
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
       JOIN delivery_notes dn ON ci.dn_id = dn.id
       LEFT JOIN customers c ON ci.customer_id = c.id
       LEFT JOIN projects p ON ci.project_id = p.id
       LEFT JOIN quotations q ON p.quotation_id = q.id
       LEFT JOIN quotations q2 ON dn.quotation_id = q2.id
       LEFT JOIN bank_accounts bk ON ci.bank_account_id = bk.id
       ORDER BY ci.created_at DESC
     `,
        )
        .all() as any[];

      const allDnIds = invoices.map((inv) => inv.dn_id).filter(Boolean);
      const batchItemsMap = batchGetDeliveryNoteItemsWithPrices(allDnIds);

      for (let inv of invoices) {
        inv.items = batchItemsMap.get(inv.dn_id) || [];

        const breakdown = calculateFinancialBreakdown({
          items: inv.items,
          grossAmount: Number(inv.gross_amount),
          discountRate: inv.discount_rate !== undefined && inv.discount_rate !== null ? Number(inv.discount_rate) : Number(inv.quotation_discount_rate || 0),
          discountAmount: inv.discount_amount !== undefined && inv.discount_amount !== null && Number(inv.discount_amount) > 0 ? Number(inv.discount_amount) : undefined,
          taxRate: inv.ppn_rate !== undefined && inv.ppn_rate !== null ? Number(inv.ppn_rate) : Number(inv.quotation_tax_rate || 12),
          pphRate: inv.pph_rate !== undefined && inv.pph_rate !== null ? Number(inv.pph_rate) : Number(inv.quotation_pph_rate || 0),
          dpp: inv.dpp !== undefined && Number(inv.dpp) > 0 ? Number(inv.dpp) : Number(inv.quotation_dpp || 0),
          roundingFactor: inv.rounding_factor !== undefined && inv.rounding_factor !== null && Number(inv.rounding_factor) !== 0 ? Number(inv.rounding_factor) : Number(inv.quotation_rounding_factor || 0),
          grandTotal: Number(inv.grand_total) || Number(inv.total_amount) || Number(inv.quotation_grand_total),
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
      }

      res.json(invoices);
    } catch (err) {
      console.error("Invoices Query Error: ", err);
      res.status(500).json({ error: "Query failed" });
    }
  });

  salesRouter.get(
    "/api/sales/unbilled-deliveries",
    requireRole(["FC", "SALES", "FINANCE"]),
    (req, res) => {
      try {
        const unbilled = db
          .prepare(
            `
        SELECT dn.*, COALESCE(c.name, dn.customer_id) as customer_name, p.name as project_name,
               (SELECT GROUP_CONCAT(p2.name, ', ') FROM projects p2 WHERE (dn.quotation_id IS NOT NULL AND p2.quotation_id = dn.quotation_id) OR (dn.project_id IS NOT NULL AND p2.id = dn.project_id)) as project_names, 
               COALESCE(NULLIF(q.dpp, 0), q.amount, q2.dpp, q2.amount) as quotation_amount, 
               COALESCE(q.discount_rate, q2.discount_rate, 0) as quotation_discount_rate,
               COALESCE(q.rounding_factor, q2.rounding_factor, 0) as quotation_rounding_factor,
               COALESCE(q.title, q2.title) as quotation_title, 
               COALESCE(q.tax_rate, q2.tax_rate, 12) as quotation_tax_rate,
               COALESCE(q.pph_rate, q2.pph_rate, 2) as quotation_pph_rate,
               COALESCE(q.grand_total, q2.grand_total) as quotation_grand_total,
               COALESCE(q.dpp, q2.dpp) as quotation_dpp
        FROM delivery_notes dn
        LEFT JOIN customers c ON dn.customer_id = c.id
        LEFT JOIN projects p ON dn.project_id = p.id
        LEFT JOIN quotations q ON p.quotation_id = q.id
        LEFT JOIN quotations q2 ON dn.quotation_id = q2.id
        WHERE dn.status = 'DELIVERED' AND dn.invoiced_at IS NULL
        ORDER BY dn.created_at DESC
     `,
          )
          .all() as any[];

        const unbilledDnIds = unbilled.map((dn) => dn.id).filter(Boolean);
        const unbilledBatchItems = batchGetDeliveryNoteItemsWithPrices(unbilledDnIds);

        for (let dn of unbilled) {
          dn.items = unbilledBatchItems.get(dn.id) || [];
          const breakdown = calculateFinancialBreakdown({
            items: dn.items,
            discountRate: Number(dn.quotation_discount_rate) || 0,
            taxRate: Number(dn.quotation_tax_rate) || 12,
            pphRate: Number(dn.quotation_pph_rate) || 0,
            dpp: Number(dn.quotation_dpp) || undefined,
            roundingFactor: Number(dn.quotation_rounding_factor) || undefined,
            grandTotal: Number(dn.quotation_grand_total) || undefined,
          });

          dn.gross_amount = breakdown.grossAmount;
          dn.quotation_gross_amount = breakdown.grossAmount;
          dn.discount_rate = breakdown.discountRate;
          dn.discount_amount = breakdown.discountAmount;
          dn.rounding_factor = breakdown.roundingFactor;
          dn.calculated_dpp = breakdown.dpp;
          dn.calculated_ppn = breakdown.ppnAmount;
          dn.calculated_pph = breakdown.pphAmount;
          dn.calculated_grand_total = breakdown.grandTotal;
        }

        res.json(unbilled);
      } catch (err) {
        console.error("Error fetching unbilled deliveries:", err);
        res.status(500).json({ error: "Query failed" });
      }
    },
  );

  salesRouter.post(
    "/api/sales/invoice/:dn_id",
    requireRole(["FC", "SALES", "FINANCE"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      if (
        userRole !== "FC" &&
        userRole !== "FINANCE" &&
        (userRole !== "SALES" || userLevel !== "MANAGER")
      ) {
        return res
          .status(403)
          .json({
            error:
              "Access denied. Only FC, Finance, or Sales Manager can generate commercial invoices.",
          });
      }
      try {
        const {
          amount,
          gross_amount,
          discount_rate,
          discount_amount,
          rounding_factor,
          grand_total,
          bank_account_id,
          payment_terms,
          ppn_rate,
          pph_rate,
          job_description,
        } = req.body;
        const dnId = req.params.dn_id;
        const dn = db
          .prepare("SELECT * FROM delivery_notes WHERE id = ?")
          .get(dnId) as any;
        if (!dn) return res.status(404).json({ error: "Delivery not found" });
        if (dn.status !== "DELIVERED")
          return res
            .status(400)
            .json({ error: "Only DELIVERED notes can be invoiced." });
        if (dn.invoiced_at)
          return res
            .status(400)
            .json({ error: "Delivery already invoiced." });

        const quoId = dn.quotation_id;
        let quotation = quoId
          ? (db.prepare("SELECT * FROM quotations WHERE id = ?").get(quoId) as any)
          : (dn.project_id ? (db.prepare("SELECT q.* FROM quotations q JOIN projects p ON p.quotation_id = q.id WHERE p.id = ?").get(dn.project_id) as any) : null);

        if (!quotation && dn.customer_id) {
          quotation = db.prepare("SELECT * FROM quotations WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1").get(dn.customer_id) as any;
        }

        let finalJobDesc = job_description;
        if (!finalJobDesc) {
          if (quotation?.title) {
            finalJobDesc = quotation.title;
          } else if (dn.project_id) {
            const proj = db
              .prepare("SELECT name FROM projects WHERE id = ?")
              .get(dn.project_id) as any;
            finalJobDesc =
              proj?.name || `Commercial Trade Delivery (DN: ${dn.dn_number})`;
          } else {
            finalJobDesc = `Commercial Trade Delivery (DN: ${dn.dn_number})`;
          }
        }

        let ciId = "CI-" + crypto.randomUUID();
        let dParts = new Date().toISOString().split("T")[0].split("-");
        let ciNumber = `CI-${dParts[0]}${dParts[1]}-${Math.floor(
          Math.random() * 1000,
        )
          .toString()
          .padStart(3, "0")}`;

        const items = getDeliveryNoteItemsWithPrices(dn.id);

        const breakdown = calculateFinancialBreakdown({
          items,
          grossAmount: Number(gross_amount) > 0 ? Number(gross_amount) : undefined,
          discountRate: discount_rate !== undefined && discount_rate !== null ? Number(discount_rate) : (Number(quotation?.discount_rate) || 0),
          discountAmount: discount_amount !== undefined && discount_amount !== null && Number(discount_amount) > 0 ? Number(discount_amount) : undefined,
          taxRate: ppn_rate !== undefined && ppn_rate !== null ? Number(ppn_rate) : (Number(quotation?.tax_rate) || 12),
          pphRate: pph_rate !== undefined && pph_rate !== null ? Number(pph_rate) : (Number(quotation?.pph_rate) || 0),
          dpp: req.body.dpp !== undefined && Number(req.body.dpp) > 0 ? Number(req.body.dpp) : (Number(amount) > 0 ? Number(amount) : Number(quotation?.dpp || 0)),
          roundingFactor: rounding_factor !== undefined && rounding_factor !== null ? Number(rounding_factor) : Number(quotation?.rounding_factor || 0),
          grandTotal: Number(grand_total) > 0 ? Number(grand_total) : Number(quotation?.grand_total || 0),
        });

        let linkedDpInvoice: any = null;
        if (quotation?.id || quotation?.dp_invoice_id) {
          linkedDpInvoice = db
            .prepare(
              `SELECT * FROM commercial_invoices
               WHERE (id = ? OR quotation_id = ?) AND invoice_category = 'DOWN_PAYMENT'
               ORDER BY created_at DESC LIMIT 1`
            )
            .get(quotation?.dp_invoice_id || "__NONE__", quotation?.id || "__NONE__") as any;
        }

        const invoiceCategory = linkedDpInvoice ? "FINAL_SETTLEMENT" : "STANDARD";
        const parentInvoiceId = linkedDpInvoice ? linkedDpInvoice.id : null;
        const dpDeductionAmount = linkedDpInvoice
          ? Math.round(Number(linkedDpInvoice.grand_total || linkedDpInvoice.total_amount || 0))
          : 0;
        const dpDppDeducted = linkedDpInvoice
          ? Math.round(Number(linkedDpInvoice.dpp || linkedDpInvoice.amount || 0))
          : 0;
        const dpPpnDeducted = linkedDpInvoice
          ? Math.round(Number(linkedDpInvoice.ppn || 0))
          : 0;

        const effectivePayableTotal = Math.max(0, breakdown.grandTotal - dpDeductionAmount);
        const effectiveJobDesc = linkedDpInvoice
          ? `${finalJobDesc} (Pelunasan Final - Potong DP ${linkedDpInvoice.ci_number})`
          : finalJobDesc;

        db.transaction(() => {
          db.prepare(
            `
            INSERT INTO commercial_invoices (
              id, ci_number, dn_id, customer_id, project_id, quotation_id,
              invoice_category, parent_invoice_id, dp_deduction_amount, dpp_nilai_lain,
              amount, gross_amount, discount_rate, discount_amount, dpp, rounding_factor,
              ppn, pph, total_amount, grand_total,
              bank_account_id, payment_terms, ppn_rate, pph_rate, job_description
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         `,
          ).run(
            ciId,
            ciNumber,
            dn.id,
            dn.customer_id,
            dn.project_id || null,
            quotation?.id || null,
            invoiceCategory,
            parentInvoiceId,
            dpDeductionAmount,
            breakdown.dppNilaiLain,
            breakdown.dpp,
            breakdown.grossAmount,
            breakdown.discountRate,
            breakdown.discountAmount,
            breakdown.dpp,
            breakdown.roundingFactor,
            breakdown.ppnAmount,
            breakdown.pphAmount,
            effectivePayableTotal,
            effectivePayableTotal,
            bank_account_id || null,
            payment_terms || "Net 30",
            breakdown.taxRate,
            breakdown.pphRate,
            effectiveJobDesc,
          );

          db.prepare(
            "UPDATE delivery_notes SET invoiced_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(dn.id);

          const nowIso = new Date().toISOString();

          outboxService.enqueue(
            db,
            "COMMERCIAL_INVOICES",
            ciId,
            "CREATE",
            {
              id: ciId,
              ci_number: ciNumber,
              dn_id: dn.id,
              project_id: dn.project_id || null,
              invoice_category: invoiceCategory,
              dp_deduction_amount: dpDeductionAmount,
              total_amount: effectivePayableTotal,
              grand_total: effectivePayableTotal,
              status: "ISSUED",
              payment_status: "UNPAID",
              created_at: nowIso,
            },
            "BOTH"
          );
        })();

        try {
          if (invoiceCategory === "FINAL_SETTLEMENT" && linkedDpInvoice) {
            postFinalSettlementInvoiceJournal(db, {
              ci_id: ciId,
              ci_number: ciNumber,
              full_dpp: breakdown.dpp,
              full_ppn: breakdown.ppnAmount,
              pph: breakdown.pphAmount,
              dp_dpp_deducted: dpDppDeducted,
              dp_ppn_deducted: dpPpnDeducted,
              user: (req.headers["x-user-email"] as string) || "SALES",
            });
          } else {
            postCommercialInvoiceJournal(db, {
              ci_id: ciId,
              ci_number: ciNumber,
              dpp: breakdown.dpp,
              ppn: breakdown.ppnAmount,
              pph: breakdown.pphAmount,
              grand_total: breakdown.grandTotal,
              user: (req.headers["x-user-email"] as string) || "SALES",
            });
          }
        } catch (invAccErr) {
          console.error("Automated Accounting postCommercialInvoiceJournal error:", invAccErr);
        }

        res.json({
          success: true,
          id: ciId,
          ci_number: ciNumber,
          invoice_category: invoiceCategory,
          dp_deduction_amount: dpDeductionAmount,
        });
      } catch (err: any) {
        console.error("Invoicing Error: ", err);
        res.status(500).json({ error: "Failed to generate invoice." });
      }
    },
  );

  salesRouter.get(
    "/api/sales/business-schema-audit",
    requireRole(["FC", "SALES", "FINANCE", "WAREHOUSE", "ENGINEERING", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const b2cSummary = db.prepare(`
          SELECT
            COUNT(*) as total_b2c_orders,
            SUM(CASE WHEN fulfillment_mode IN ('MTO', 'HYBRID') OR project_id IS NOT NULL THEN 1 ELSE 0 END) as mto_orders_count,
            SUM(CASE WHEN project_id IS NOT NULL THEN 1 ELSE 0 END) as linked_spk_count,
            SUM(CASE WHEN production_status = 'PENDING_SPK' AND project_id IS NULL THEN 1 ELSE 0 END) as pending_spk_count,
            SUM(CASE WHEN dpp_nilai_lain > 0 OR tax_scheme = 'DPP_NILAI_LAIN' THEN 1 ELSE 0 END) as tax_standardized_count
          FROM shop_orders
        `).get() as any;

        const customerSummary = db.prepare(`
          SELECT
            COUNT(*) as total_customers,
            SUM(CASE WHEN COALESCE(customer_segment, customer_type, 'B2B') = 'B2B' THEN 1 ELSE 0 END) as b2b_customers,
            SUM(CASE WHEN COALESCE(customer_segment, customer_type, 'B2B') = 'B2C' THEN 1 ELSE 0 END) as b2c_customers,
            SUM(CASE WHEN COALESCE(customer_segment, '') = 'OMNICHANNEL' THEN 1 ELSE 0 END) as omnichannel_customers,
            SUM(CASE WHEN COALESCE(credit_limit, 0) > 0 THEN 1 ELSE 0 END) as credit_monitored_customers
          FROM customers
          WHERE archived_at IS NULL
        `).get() as any;

        const leadsSummary = db.prepare(`
          SELECT
            (SELECT COUNT(*) FROM crm_leads) as total_crm_leads,
            (SELECT COUNT(*) FROM crm_leads WHERE status = 'CONVERTED' OR customer_id IS NOT NULL) as converted_crm_leads,
            (SELECT COUNT(*) FROM potential_customers) as total_potential_customers,
            (SELECT COUNT(*) FROM potential_customers WHERE status = 'CONVERTED' OR customer_id IS NOT NULL) as linked_potential_customers
        `).get() as any;

        const invoiceSummary = db.prepare(`
          SELECT
            COUNT(*) as total_invoices,
            SUM(CASE WHEN COALESCE(invoice_category, 'STANDARD') = 'DOWN_PAYMENT' THEN 1 ELSE 0 END) as dp_invoices_count,
            SUM(CASE WHEN COALESCE(invoice_category, 'STANDARD') = 'FINAL_SETTLEMENT' THEN 1 ELSE 0 END) as settlement_invoices_count,
            SUM(CASE WHEN COALESCE(dp_deduction_amount, 0) > 0 THEN dp_deduction_amount ELSE 0 END) as total_dp_knockoff_value,
            SUM(CASE WHEN status != 'PAID' AND payment_status != 'PAID' THEN MAX(0, COALESCE(grand_total, total_amount, amount, 0) - COALESCE(amount_paid, 0)) ELSE 0 END) as total_active_ar
          FROM commercial_invoices
        `).get() as any;

        const coa2106 = db.prepare(`
          SELECT COALESCE(SUM(credit - debit), 0) as unearned_dp_balance
          FROM journal_entry_lines
          WHERE account_code = '2106'
        `).get() as any;

        res.json({
          success: true,
          data: {
            b2c_mto_spk: {
              total_b2c_orders: Number(b2cSummary?.total_b2c_orders) || 0,
              mto_orders_count: Number(b2cSummary?.mto_orders_count) || 0,
              linked_spk_count: Number(b2cSummary?.linked_spk_count) || 0,
              pending_spk_count: Number(b2cSummary?.pending_spk_count) || 0,
              tax_standardized_count: Number(b2cSummary?.tax_standardized_count) || 0,
            },
            customer_unification: {
              total_customers: Number(customerSummary?.total_customers) || 0,
              b2b_customers: Number(customerSummary?.b2b_customers) || 0,
              b2c_customers: Number(customerSummary?.b2c_customers) || 0,
              omnichannel_customers: Number(customerSummary?.omnichannel_customers) || 0,
              credit_monitored_customers: Number(customerSummary?.credit_monitored_customers) || 0,
              total_crm_leads: Number(leadsSummary?.total_crm_leads) || 0,
              converted_crm_leads: Number(leadsSummary?.converted_crm_leads) || 0,
              total_potential_customers: Number(leadsSummary?.total_potential_customers) || 0,
              linked_potential_customers: Number(leadsSummary?.linked_potential_customers) || 0,
            },
            financial_governance: {
              tax_regulation: "PMK 131/2024 (DPP Nilai Lain 11/12 × 12% = 11% Efektif)",
              total_invoices: Number(invoiceSummary?.total_invoices) || 0,
              dp_invoices_count: Number(invoiceSummary?.dp_invoices_count) || 0,
              settlement_invoices_count: Number(invoiceSummary?.settlement_invoices_count) || 0,
              total_dp_knockoff_value: Number(invoiceSummary?.total_dp_knockoff_value) || 0,
              unearned_dp_balance_coa2106: Number(coa2106?.unearned_dp_balance) || 0,
              total_active_ar: Number(invoiceSummary?.total_active_ar) || 0,
            },
          },
        });
      } catch (err: any) {
        console.error("[Business Schema Audit API] Error:", err);
        res.status(500).json({ error: "Failed to compute business schema audit" });
      }
    }
  );

  // ==========================================
  // --- ROADMAP PHASE 2: HYBRID ATP / CTP ENGINE API ---
  // ==========================================

  salesRouter.get(
    "/api/quotations/:id/atp-ctp",
    requireRole(["SALES", "FC", "ENGINEERING", "PRODUCTION", "WAREHOUSE", "FINANCE"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const quotation = db
          .prepare(
            `SELECT q.*, COALESCE(c.name, q.customer_id) as customer_name
             FROM quotations q
             LEFT JOIN customers c ON q.customer_id = c.id
             WHERE q.id = ?`
          )
          .get(id) as any;

        if (!quotation) {
          return res.status(404).json({ error: "Quotation not found" });
        }

        const qItems = db
          .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
          .all(id) as any[];

        const itemsToEvaluate =
          qItems.length > 0
            ? qItems
            : [
                {
                  id: null,
                  title: quotation.title || "Order Item",
                  qty: Number(quotation.qty) || 1,
                  uom: "Unit",
                },
              ];

        const evaluation = evaluateItemsAtpCtp(itemsToEvaluate);

        res.json({
          quotation_id: quotation.id,
          quotation_number: quotation.quotation_number,
          customer_id: quotation.customer_id,
          customer_name: quotation.customer_name,
          quotation_title: quotation.title,
          quotation_status: quotation.status,
          ...evaluation,
        });
      } catch (err: any) {
        console.error("Error computing quotation ATP/CTP:", err);
        res.status(500).json({ error: "Failed to evaluate ATP/CTP", details: err.message });
      }
    }
  );

  salesRouter.post(
    "/api/sales/atp-ctp-check",
    requireRole(["SALES", "FC", "ENGINEERING", "PRODUCTION", "WAREHOUSE"]),
    (req, res) => {
      try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (items.length === 0) {
          return res.status(400).json({ error: "No items provided for ATP/CTP evaluation" });
        }
        const evaluation = evaluateItemsAtpCtp(items);
        res.json(evaluation);
      } catch (err: any) {
        console.error("Error in ad-hoc ATP/CTP check:", err);
        res.status(500).json({ error: "Failed to evaluate ATP/CTP", details: err.message });
      }
    }
  );

  salesRouter.post(
    "/api/quotations/:id/fulfill-mts",
    requireRole(["SALES", "FC", "WAREHOUSE"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const { police_number, driver_name, remarks } = req.body || {};

        const quotation = db
          .prepare("SELECT * FROM quotations WHERE id = ?")
          .get(id) as any;
        if (!quotation) {
          return res.status(404).json({ error: "Quotation not found" });
        }

        if (quotation.status !== "APPROVED" && quotation.status !== "AUTHORIZED" && quotation.status !== "PROCESSED") {
          return res.status(400).json({
            error: "Quotation must be APPROVED or AUTHORIZED before dispatching MTS stock.",
          });
        }

        const qItems = db
          .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
          .all(id) as any[];
        const evaluation = evaluateItemsAtpCtp(
          qItems.length > 0
            ? qItems
            : [{ id: null, title: quotation.title || "Item", qty: Number(quotation.qty) || 1, uom: "Unit" }]
        );

        const mtsItems = evaluation.items.filter((it) => it.atp_qty > 0 && it.item_id);
        if (mtsItems.length === 0) {
          return res.status(400).json({
            error: "No Available-to-Promise (ATP) free stock found for this quotation. Please proceed via Make-to-Order (SPK-Project).",
          });
        }

        const dnId = "DN-" + crypto.randomUUID();
        const dnNumber = generateDNNumber();
        const nowIso = new Date().toISOString();
        const isPartial = evaluation.summary.total_net_mto_qty > 0;
        const userEmail = (req.headers["x-user-email"] as string) || "SALES";

        db.transaction(() => {
          db.prepare(
            `INSERT INTO delivery_notes (
               id, dn_number, customer_id, quotation_id, project_id, remarks,
               police_number, driver_name, delivery_type, is_partial, fulfillment_mode, status, delivery_date
             ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'MTS', 'DRAFTED', ?)`
          ).run(
            dnId,
            dnNumber,
            quotation.customer_id,
            quotation.id,
            remarks || `MTS Direct Stock Fulfillment from Quotation ${quotation.quotation_number}`,
            police_number || null,
            driver_name || null,
            isPartial ? "PARTIAL" : "FULL",
            isPartial ? 1 : 0,
            nowIso
          );

          const insertDnItem = db.prepare(
            "INSERT INTO delivery_items (id, dn_id, item_id, qty, uom, remarks) VALUES (?, ?, ?, ?, ?, ?)"
          );

          for (const item of mtsItems) {
            insertDnItem.run(
              "DNI-" + crypto.randomUUID(),
              dnId,
              item.item_id,
              item.atp_qty,
              item.uom,
              `ATP Stock Fulfillment (${item.atp_qty}/${item.ordered_qty} ${item.uom})`
            );

            db.prepare(
              `UPDATE inventory
               SET free_stock = MAX(0, COALESCE(free_stock, 0) - ?),
                   available_qty = MAX(0, COALESCE(available_qty, 0) - ?),
                   allocated_stock = COALESCE(allocated_stock, 0) + ?
               WHERE item_id = ?`
            ).run(item.atp_qty, item.atp_qty, item.atp_qty, item.item_id);

            db.prepare(
              `INSERT INTO stock_movements (id, item_id, type, qty, reference_id, recorded_by)
               VALUES (?, ?, 'ALLOCATION', ?, ?, ?)`
            ).run("SMV-" + crypto.randomUUID(), item.item_id, item.atp_qty, dnId, userEmail);
          }

          if (!isPartial) {
            db.prepare("UPDATE quotations SET status = 'PROCESSED' WHERE id = ?").run(quotation.id);
          }

          outboxService.enqueue(
            db,
            "DELIVERY_NOTES",
            dnId,
            "CREATE",
            {
              id: dnId,
              dn_number: dnNumber,
              customer_id: quotation.customer_id,
              quotation_id: quotation.id,
              fulfillment_mode: "MTS",
              status: "DRAFTED",
              delivery_date: nowIso,
              created_at: nowIso,
            },
            "BOTH"
          );
        })();

        logAudit(
          userEmail,
          "FULFILL_MTS_DELIVERY",
          "QUOTATION",
          quotation.id,
          `Issued MTS Delivery Note ${dnNumber} for Quotation ${quotation.quotation_number} (${mtsItems.length} item lines)`
        );

        res.json({
          success: true,
          dn_id: dnId,
          dn_number: dnNumber,
          fulfillment_mode: "MTS",
          is_partial: isPartial,
          remaining_mto_qty: evaluation.summary.total_net_mto_qty,
          ctp_promise_date: evaluation.ctp_promise_date,
        });
      } catch (err: any) {
        console.error("Failed to execute MTS fulfillment:", err);
        res.status(500).json({ error: "Failed to execute MTS fulfillment", details: err.message });
      }
    }
  );
}
