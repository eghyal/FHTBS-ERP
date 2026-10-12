import db from "../db/database.ts";

export function runFinanceRollup() {
  try {
    const invoices = db.prepare("SELECT * FROM commercial_invoices").all() as any[];
    
    let total_receivable = 0;
    let total_billed = 0;
    let total_revenue_realized = 0;
    let total_tax_collected = 0;
    const invMap = new Map();

    invoices.forEach((inv) => {
      const dpp = Number(inv.amount) || 0;
      const ppn = Number(inv.tax_amount) || 0;
      const pph = Number(inv.pph_amount) || 0;
      const totalAmount = Number(inv.total_amount) > 0 ? Number(inv.total_amount) : Math.floor(dpp + ppn - pph);
      const paid = Number(inv.amount_paid) || 0;
      
      total_billed += dpp;
      total_receivable += Math.max(0, totalAmount - paid);
      
      const ratio = totalAmount > 0 ? Math.min(1, paid / totalAmount) : (paid > 0 ? 1 : 0);
      total_revenue_realized += Math.round(ratio * dpp);
      total_tax_collected += Math.round(ratio * ppn);
      
      invMap.set(inv.id, {
        dpp, ppn, pph, totalAmount, netRatio: totalAmount > 0 ? dpp / totalAmount : (100 / 112)
      });
    });

    const transactions = db.prepare(`
      SELECT ft.*, 
        CASE 
          WHEN ft.type = 'OUT' AND ft.category IN ('PAYABLE', 'CONSUMABLE', 'TRANSPORTATION', 'OTHERS') THEN (
            SELECT CASE WHEN COUNT(DISTINCT pr.project_id) > 0 THEN 1 ELSE 0 END
            FROM purchase_orders po
            JOIN pr_items pri ON po.id = pri.po_id
            JOIN purchase_requests pr ON pri.pr_id = pr.id
            WHERE po.id = ft.reference_id 
             AND pr.project_id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
          )
          ELSE 0
        END as is_cogs
      FROM finance_transactions ft
    `).all() as any[];

    let total_cogs = 0;
    let total_opex = 0;
    let total_received = 0;
    let total_payable = 0;
    
    const monthlyDataMap = new Map();
    
    transactions.forEach((tx) => {
      if (tx.transaction_date) {
        const date = new Date(tx.transaction_date);
        const month = date.toLocaleString("default", { month: "short", year: "2-digit" });
        
        if (!monthlyDataMap.has(month)) {
          monthlyDataMap.set(month, { name: month, revenue: 0, tax: 0, cogs: 0, opex: 0, profit: 0 });
        }
        
        const monthData = monthlyDataMap.get(month);
        
        if (tx.type === "IN") {
          total_received += tx.amount;
          if (tx.category === "RECEIVABLE" && tx.reference_id && invMap.has(tx.reference_id)) {
            const invInfo = invMap.get(tx.reference_id);
            const netRev = Math.round(tx.amount * invInfo.netRatio);
            const taxPortion = tx.amount - netRev;
            monthData.revenue += netRev;
            monthData.tax += taxPortion;
            monthData.profit += netRev;
          } else if (tx.category === "RECEIVABLE") {
            const netRev = Math.round(tx.amount * (100 / 112));
            const taxPortion = tx.amount - netRev;
            monthData.revenue += netRev;
            monthData.tax += taxPortion;
            monthData.profit += netRev;
          } else {
            monthData.revenue += tx.amount;
            monthData.profit += tx.amount;
          }
        } else if (tx.type === "OUT") {
          if (tx.is_cogs === 1) {
            total_cogs += tx.amount;
            monthData.cogs += tx.amount;
            monthData.profit -= tx.amount;
          } else {
            total_opex += tx.amount;
            monthData.opex += tx.amount;
            monthData.profit -= tx.amount;
          }
        }
      }
    });

    if (total_revenue_realized === 0 && total_received > 0) {
      total_revenue_realized = Math.round(total_received * (100 / 112));
      total_tax_collected = total_received - total_revenue_realized;
    }

    const payables = db.prepare("SELECT SUM(total_amount - COALESCE(amount_paid, 0)) as total FROM purchase_orders WHERE status NOT IN ('DRAFT', 'CANCELLED')").get() as any;
    total_payable = payables?.total || 0;

    // Direct Labor (BTKL) and Overhead from Project Financial Summaries
    let total_labor_cogs = 0;
    try {
      const laborCogsRow = db.prepare(`
        SELECT COALESCE(SUM(total_labor_cost), 0) as total_labor
        FROM project_financial_summaries
      `).get() as any;
      total_labor_cogs = Number(laborCogsRow?.total_labor || 0);
    } catch (e) {
      console.warn("Could not fetch labor cogs for rollup:", e);
    }

    const total_material_cogs = total_cogs;
    const total_full_cogs = total_material_cogs + total_labor_cogs;

    const gross_margin = total_revenue_realized - total_full_cogs;
    const net_profit = gross_margin - total_opex;
    const operating_margin = total_revenue_realized > 0 ? (net_profit / total_revenue_realized) * 100 : 0;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO finance_global_summary (
          id, total_receivable, total_payable, total_billed, total_revenue_realized, total_tax_collected,
          total_cogs, total_material_cogs, total_labor_cogs, total_opex, gross_margin, net_profit, operating_margin, last_updated
        )
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          total_receivable = excluded.total_receivable,
          total_payable = excluded.total_payable,
          total_billed = excluded.total_billed,
          total_revenue_realized = excluded.total_revenue_realized,
          total_tax_collected = excluded.total_tax_collected,
          total_cogs = excluded.total_cogs,
          total_material_cogs = excluded.total_material_cogs,
          total_labor_cogs = excluded.total_labor_cogs,
          total_opex = excluded.total_opex,
          gross_margin = excluded.gross_margin,
          net_profit = excluded.net_profit,
          operating_margin = excluded.operating_margin,
          last_updated = CURRENT_TIMESTAMP
      `).run(
        total_receivable,
        total_payable,
        total_billed,
        total_revenue_realized,
        total_tax_collected,
        total_full_cogs,
        total_material_cogs,
        total_labor_cogs,
        total_opex,
        gross_margin,
        net_profit,
        operating_margin,
      );

      for (const [month, data] of monthlyDataMap.entries()) {
        db.prepare(`
          INSERT INTO finance_monthly_summaries (month_year, revenue, tax, cogs, material_cogs, labor_cogs, opex, profit, last_updated)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(month_year) DO UPDATE SET
            revenue = excluded.revenue,
            tax = excluded.tax,
            cogs = excluded.cogs,
            material_cogs = excluded.material_cogs,
            labor_cogs = excluded.labor_cogs,
            opex = excluded.opex,
            profit = excluded.profit,
            last_updated = CURRENT_TIMESTAMP
        `).run(month, data.revenue, data.tax, data.cogs, data.cogs, 0, data.opex, data.profit);
      }
    })();

  } catch (err) {
    console.error("Finance rollup error:", err);
  }
}
