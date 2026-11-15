import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { isValidDailyAuthKey } from "../../utils/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { calculateFinancialBreakdown } from "../../lib/financialEngine.ts";
import {
  postDeliveryDispatchJournal,
  postDownPaymentInvoiceJournal,
  postJournalEntry,
} from "../../utils/accountingBridge.ts";
import { outboxService } from "../../services/outboxService.ts";
import { recordWorkflowStepApproval } from "../../services/workflowEngine.ts";
import crypto from "crypto";

export function registerQuotationsRoutes(salesRouter: Router) {
  salesRouter.get(["/api/quotations", "/api/sales/quotations"], (req, res) => {
    try {
      const quotations = db
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
      WHERE q.archived_at IS NULL
      ORDER BY q.created_at DESC
    `,
        )
        .all() as any[];

      const now = new Date();
      const processedQuotations = quotations.map((q) => {
        if (q.status === "APPROVED" || q.status === "PENDING") {
          const createdDate = new Date(q.created_at);
          const diffTime = Math.abs(now.getTime() - createdDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays > (q.validity_days || 20)) {
            q.status = "EXPIRED";
            db.prepare(
              "UPDATE quotations SET status = 'EXPIRED' WHERE id = ?",
            ).run(q.id);
          }
        }

        q.items = db
          .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
          .all(q.id);
        return q;
      });

      res.json({ success: true, data: processedQuotations });
    } catch (err: any) {
      console.error(err);
      res
        .status(500)
        .json({ error: "Failed to fetch quotations", details: err.message });
    }
  });

  salesRouter.post(
    ["/api/quotations", "/api/sales/quotations"],
    requireRole(["FC", "SALES", "ENGINEERING", "DIRECTOR", "ADMIN", "SUPERADMIN", "BOD"]),
    (req, res) => {
      console.log("QUOTATION_DEBUG:", JSON.stringify(req.body));
      const userRole = ((req as any).userRole || "").toString().toUpperCase();
      const GOD_ROLES = ["FC", "BOD", "DIRECTOR", "SYSTEM_ADMIN", "SUPERADMIN", "ADMIN", "GOD_MODE"];
      const userLevel = (((req as any).userLevel || "") as string).toUpperCase();
      const isGod = GOD_ROLES.includes(userRole) || userLevel === "SUPER_ADMIN";
      const isSales = userRole.includes("SALES");
      const isEngineering = userRole.includes("ENGINEERING");
      const isExecutive = isGod || userRole === "FC" || userRole === "BOD";

      if (!isGod && !isSales && !isEngineering && !isExecutive) {
        return res.status(403).json({
          error:
            "Access denied. Only Sales, Engineering, or Management accounts can create Quotations.",
        });
      }
      try {
        const { customer_id, title, validity_days, remarks, items } =
          req.body;
        if (
          !customer_id ||
          !title ||
          !items ||
          !Array.isArray(items) ||
          items.length === 0
        ) {
          console.log("QUOTATION_DEBUG_ERROR: Missing fields", req.body);
          return res.status(400).json({
            error:
              "Missing required fields: customer_id, title, and items are required",
          });
        }

        for (const item of items) {
          let itemRow: any = null;
          if (item.item_id) {
            itemRow = db.prepare("SELECT * FROM items WHERE id = ?").get(item.item_id);
          } else if (item.item_code) {
            itemRow = db.prepare("SELECT * FROM items WHERE item_code = ?").get(item.item_code);
          }

          const itCode = (item.item_code || itemRow?.item_code || "").trim().toUpperCase();
          const itType = (itemRow?.type || "").toUpperCase();

          const isMachine = itType === "MACHINE" || itCode.startsWith("MC - ") || itCode.startsWith("MC-");
          if (isMachine) {
            return res.status(400).json({
              error: `Machine items (${itCode || item.title || "Machine"}) cannot be included in commercial Quotations.`,
            });
          }

          const isFinishGood = itType === "FINISHED" || itType === "FINISH_GOOD" || itType === "FINISH_GOODS" || itCode.startsWith("FG - ") || itCode.startsWith("FG-");
          if (itemRow && !isFinishGood) {
            return res.status(400).json({
              error: `Only Finish Goods (FG - ...) can be included in Quotations. Item [${itCode || item.title}] (${itemRow.type || "Non-FG"}) is not permitted.`,
            });
          }
        }

        const id =
          "QUO-" + Math.random().toString(36).substr(2, 6).toUpperCase();
        const dParts = new Date().toISOString().split("T")[0].split("-");
        const quotation_number = `QUO/${dParts[0]}/${Math.floor(
          Math.random() * 1000,
        )
          .toString()
          .padStart(3, "0")}/${id.substring(4, 6)}`;

        const newStatus =
          req.body.status && ["DRAFT", "PENDING"].includes(req.body.status)
            ? req.body.status
            : "PENDING";

        const discountRateVal = Number(req.body.discount_rate) || 0;
        const taxRateVal = Number(req.body.tax_rate) || 0;
        const pphRateVal = Number(req.body.pph_rate) || 0;
        const taxSchemeVal = req.body.tax_scheme || (taxRateVal > 0 ? "DPP_NILAI_LAIN" : "NON_PKP");
        const paymentTermsVal = req.body.payment_terms || req.body.payment_method || "Net 30 Days";

        const breakdown = calculateFinancialBreakdown({
          items: items.map((it: any) => ({
            qty: Number(it.qty || it.quantity || 1),
            unit_price: Number(it.unit_price || it.price || 0),
          })),
          discountRate: discountRateVal,
          taxRate: taxRateVal,
          pphRate: pphRateVal,
          taxScheme: taxSchemeVal,
          roundingFactor: Number(req.body.rounding_factor) || 0,
        });

        const salesChannelVal = req.body.sales_channel || "B2B_PROJECT";
        const settlementTypeVal = req.body.settlement_type || (salesChannelVal === "DIRECT_RETAIL" ? "IMMEDIATE" : "CREDIT_TERM");
        const receiptNumberVal = req.body.receipt_number || null;
        const customerNameManual = req.body.customer_name_manual || null;
        const customerPhoneManual = req.body.customer_phone_manual || null;
        const paymentRefVal = req.body.payment_reference || null;
        const cashTenderedVal = Number(req.body.cash_tendered) || 0;
        const changeDueVal = Number(req.body.change_due) || 0;
        const paidAtVal = req.body.paid_at || (settlementTypeVal === "IMMEDIATE" ? new Date().toISOString() : null);

        const transaction = db.transaction(() => {
          db.prepare(
            `
        INSERT INTO quotations (
          id, quotation_number, customer_id, title, amount, validity_days, remarks, status,
          tax_rate, discount_rate, npwp_tax_id, pph_rate, dpp, dpp_nilai_lain, tax_scheme,
          payment_terms, payment_method, rounding_factor, grand_total,
          sales_channel, settlement_type, receipt_number, customer_name_manual,
          customer_phone_manual, payment_reference, cash_tendered, change_due, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
          ).run(
            id,
            quotation_number,
            customer_id,
            title,
            breakdown.dpp,
            validity_days ? Number(validity_days) : 20,
            remarks || null,
            newStatus,
            taxRateVal,
            discountRateVal,
            req.body.npwp_tax_id || null,
            pphRateVal,
            breakdown.dpp,
            breakdown.dppNilaiLain,
            taxSchemeVal,
            paymentTermsVal,
            paymentTermsVal,
            breakdown.roundingFactor,
            breakdown.grandTotal,
            salesChannelVal,
            settlementTypeVal,
            receiptNumberVal,
            customerNameManual,
            customerPhoneManual,
            paymentRefVal,
            cashTenderedVal,
            changeDueVal,
            paidAtVal,
          );

          const itemStmt = db.prepare(`
        INSERT INTO quotation_items (id, quotation_id, title, qty, uom, unit_price, item_id, barcode, discount_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
          for (const item of items) {
            const itemId =
              "QI-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            const itemTitle = item.title || item.item_name || item.name || "Commercial Item";
            const itemQty = Number(item.qty || item.quantity || 1);
            const itemUom = item.uom || "Unit";
            const itemUnitPrice = Number(item.unit_price || item.price || 0);

            itemStmt.run(
              itemId,
              id,
              itemTitle,
              itemQty,
              itemUom,
              itemUnitPrice,
              item.item_id || null,
              item.barcode || null,
              Number(item.discount_amount) || 0,
            );
          }

          outboxService.enqueue(
            db,
            "QUOTATIONS",
            id,
            "CREATE",
            {
              id,
              quotation_number,
              customer_id,
              title,
              amount: breakdown.dpp,
              validity_days: validity_days ? Number(validity_days) : 20,
              remarks: remarks || null,
              status: newStatus,
              tax_rate: taxRateVal,
              discount_rate: discountRateVal,
              grand_total: breakdown.grandTotal,
              created_at: new Date().toISOString()
            },
            "BOTH"
          );
        });
        transaction();

        const fullQuotation = db
          .prepare(
            `
      SELECT q.*, c.name as customer_name,
        COALESCE(NULLIF(q.customer_name_manual, ''), c.name, 'Pelanggan Umum (Walk-in)') as display_customer_name
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = ?
    `,
          )
          .get(id) as any;

        if (fullQuotation) {
          fullQuotation.items = db
            .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
            .all(id);
        }

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "CREATE_QUOTATION",
          "QUOTATION",
          id,
          `Created quotation ${quotation_number}`,
        );
        res.json({
          success: true,
          data: fullQuotation || { id, quotation_number },
        });
      } catch (err: any) {
        console.error(err);
        res.status(500).json({
          error: "Failed to create quotation",
          details: err.message,
        });
      }
    },
  );

  // ==========================================
  // UNIFIED ADAPTIVE ENGINE: RETAIL & B2C QUICK SETTLE
  // ==========================================
  salesRouter.post(
    "/api/sales/orders/quick-settle",
    requireRole(["FC", "SALES", "ENGINEERING", "DIRECTOR", "ADMIN", "SUPERADMIN", "BOD", "WAREHOUSE"]),
    (req, res) => {
      try {
        const {
          customer_id = "CUS-WALKIN",
          customer_name_manual,
          customer_phone_manual,
          title = "Penjualan Langsung / Retail Kasir",
          payment_method = "CASH",
          payment_reference,
          cash_tendered = 0,
          discount_rate = 0,
          tax_rate = 0,
          pph_rate = 0,
          tax_scheme = "NON_PKP",
          remarks,
          items,
        } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: "Daftar barang penjualan tidak boleh kosong" });
        }

        const userEmail = ((req.headers["x-user-email"] || req.headers["remote-user"] || "KASIR") as string);
        const nowIso = new Date().toISOString();
        const dParts = nowIso.split("T")[0].split("-");
        const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();

        const quotationId = "QUO-RTL-" + crypto.randomUUID().substring(0, 8).toUpperCase();
        const quotationNumber = `QUO/RTL/${dParts[0]}/${dParts[1]}/${randomSuffix}`;
        const receiptNumber = `RCP/${dParts[0]}${dParts[1]}/${randomSuffix}`;
        const dnId = "DN-RTL-" + crypto.randomUUID().substring(0, 8).toUpperCase();
        const dnNumber = `DN/RTL/${dParts[0]}${dParts[1]}/${randomSuffix}`;
        const ciId = "INV-RTL-" + crypto.randomUUID().substring(0, 8).toUpperCase();
        const ciNumber = `INV/RTL/${dParts[0]}${dParts[1]}/${randomSuffix}`;

        const breakdown = calculateFinancialBreakdown({
          items: items.map((it: any) => ({
            qty: Number(it.qty || 1),
            unit_price: Number(it.unit_price || 0),
          })),
          discountRate: Number(discount_rate) || 0,
          taxRate: Number(tax_rate) || 0,
          pphRate: Number(pph_rate) || 0,
          taxScheme: tax_scheme,
          roundingFactor: 0,
        });

        if (payment_method === "CASH" && Number(cash_tendered) < breakdown.grandTotal) {
          return res.status(400).json({
            error: `Jumlah Uang Tunai Kurang. Total Tagihan: Rp ${breakdown.grandTotal.toLocaleString("id-ID")}, Diterima: Rp ${Number(cash_tendered).toLocaleString("id-ID")}`,
          });
        }

        const effectiveCashTendered = payment_method === "CASH" 
          ? Number(cash_tendered)
          : breakdown.grandTotal;
        const effectiveChangeDue = payment_method === "CASH"
          ? Math.max(0, effectiveCashTendered - breakdown.grandTotal)
          : 0;

        let totalRetailCogs = 0;

        const transaction = db.transaction(() => {
          db.prepare(`
            INSERT INTO quotations (
              id, quotation_number, customer_id, title, amount, validity_days, remarks,
              status, tax_rate, discount_rate, pph_rate, dpp, dpp_nilai_lain, tax_scheme,
              payment_terms, payment_method, rounding_factor, grand_total,
              sales_channel, settlement_type, receipt_number,
              customer_name_manual, customer_phone_manual, payment_reference,
              cash_tendered, change_due, paid_at, created_at
            ) VALUES (?, ?, ?, ?, ?, 30, ?, 'APPROVED', ?, ?, ?, ?, ?, ?, 'Tunai / Lunas', ?, ?, ?, 'DIRECT_RETAIL', 'IMMEDIATE', ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            quotationId,
            quotationNumber,
            customer_id,
            title,
            breakdown.dpp,
            remarks || 'Transaksi Penjualan Ritel Langsung (POS/Kasir)',
            Number(tax_rate) || 0,
            Number(discount_rate) || 0,
            Number(pph_rate) || 0,
            breakdown.dpp,
            breakdown.dppNilaiLain,
            tax_scheme,
            payment_method,
            breakdown.roundingFactor,
            breakdown.grandTotal,
            receiptNumber,
            customer_name_manual || null,
            customer_phone_manual || null,
            payment_reference || null,
            effectiveCashTendered,
            effectiveChangeDue,
            nowIso,
            nowIso
          );

          const itemStmt = db.prepare(`
            INSERT INTO quotation_items (id, quotation_id, title, qty, uom, unit_price, item_id, barcode, discount_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const it of items) {
            const qiId = "QI-" + crypto.randomUUID().substring(0, 8).toUpperCase();
            const qtyVal = Number(it.qty || 1);
            const priceVal = Number(it.unit_price || 0);

            itemStmt.run(
              qiId,
              quotationId,
              it.title || "Item Retail",
              qtyVal,
              it.uom || "PCS",
              priceVal,
              it.item_id || null,
              it.barcode || null,
              Number(it.discount_amount) || 0
            );

            if (it.item_id) {
              const invRow = db.prepare("SELECT COALESCE(free_stock, 0) as free, COALESCE(physical_qty, 0) as phys FROM inventory WHERE item_id = ?").get(it.item_id) as any;
              const freeStockAvail = invRow ? Number(invRow.free) : 0;
              if (freeStockAvail < qtyVal) {
                throw new Error(`Stok tidak mencukupi untuk item [${it.title || it.item_id}]. Tersedia: ${freeStockAvail}, Diminta: ${qtyVal}`);
              }

              const itemMaster = db.prepare("SELECT COALESCE(unit_price, 0) as cost FROM items WHERE id = ?").get(it.item_id) as any;
              totalRetailCogs += (itemMaster ? Number(itemMaster.cost) : priceVal) * qtyVal;

              db.prepare(`
                UPDATE inventory
                SET physical_qty = MAX(0, COALESCE(physical_qty, 0) - ?),
                    available_qty = MAX(0, COALESCE(available_qty, 0) - ?),
                    free_stock = MAX(0, COALESCE(free_stock, 0) - ?)
                WHERE item_id = ?
              `).run(qtyVal, qtyVal, qtyVal, it.item_id);

              db.prepare(`
                INSERT INTO stock_movements (id, item_id, type, qty, reference_id, recorded_by, created_at)
                VALUES (?, ?, 'CONSUMPTION', ?, ?, ?, ?)
              `).run(
                "SM-" + crypto.randomUUID().substring(0, 8),
                it.item_id,
                qtyVal,
                receiptNumber,
                userEmail,
                nowIso
              );
            }
          }

          db.prepare(`
            INSERT INTO delivery_notes (
              id, dn_number, customer_id, status, authorized_by, shipped_at, delivered_at, remarks, created_at
            ) VALUES (?, ?, ?, 'DELIVERED', ?, ?, ?, 'Serah terima langsung kasir / Direct carry-out', ?)
          `).run(dnId, dnNumber, customer_id, userEmail, nowIso, nowIso, nowIso);

          for (const it of items) {
            if (it.item_id) {
              db.prepare(`
                INSERT INTO delivery_items (id, dn_id, delivery_id, item_id, qty, qty_delivered, uom, remarks, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Retail hand-over', 'Retail hand-over')
              `).run(
                "DNI-" + crypto.randomUUID().substring(0, 8),
                dnId,
                dnId,
                it.item_id,
                Number(it.qty || 1),
                Number(it.qty || 1),
                it.uom || "PCS"
              );
            }
          }

          db.prepare(`
            INSERT INTO commercial_invoices (
              id, ci_number, dn_id, customer_id, amount, status, created_at, paid_at,
              sales_channel, receipt_number, payment_method, payment_reference, is_direct_settled
            ) VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?, 'DIRECT_RETAIL', ?, ?, ?, 1)
          `).run(
            ciId,
            ciNumber,
            dnId,
            customer_id,
            breakdown.grandTotal,
            nowIso,
            nowIso,
            receiptNumber,
            payment_method,
            payment_reference || null
          );

          try {
            const ppnAmt = breakdown.ppnAmount || 0;
            const revenueDpp = breakdown.dpp || breakdown.grandTotal;

            const journalLines = [
              {
                account_code: payment_method === "TRANSFER" ? "1108" : "1101",
                account_name: payment_method === "TRANSFER" ? "Bank Operasional (Penjualan Retail)" : "Kas Kasir / Retail (Penjualan Tunai)",
                debit: breakdown.grandTotal,
                credit: 0,
                memo: `Penerimaan Kas No. Struk: ${receiptNumber}`
              },
              {
                account_code: "4101",
                account_name: "Pendapatan Penjualan Ritel / Direct Sales",
                debit: 0,
                credit: revenueDpp,
                memo: `DPP Penjualan Ritel ${receiptNumber}`
              }
            ];

            if (ppnAmt > 0) {
              journalLines.push({
                account_code: "2102",
                account_name: "VAT / PPN Payable (Hutang Pajak Keluaran)",
                debit: 0,
                credit: ppnAmt,
                memo: `PPN Penjualan Ritel ${receiptNumber}`
              });
            }

            postJournalEntry(db, {
              reference_type: "INVOICE_PAYMENT",
              reference_id: ciId,
              reference_number: receiptNumber,
              description: `Penerimaan Kas & Penyerahan Barang Ritel (${receiptNumber})`,
              entry_date: nowIso,
              lines: journalLines,
              created_by: userEmail
            });

            if (totalRetailCogs > 0) {
              postDeliveryDispatchJournal(db, {
                dn_id: dnId,
                dn_number: dnNumber,
                total_cogs: totalRetailCogs,
                user: userEmail,
              });
            }
          } catch (jErr) {
            console.warn("Accounting journal posting note:", jErr);
          }

          outboxService.enqueue(
            db,
            "QUOTATIONS",
            quotationId,
            "UPDATE",
            {
              id: quotationId,
              quotation_number: quotationNumber,
              customer_id,
              receipt_number: receiptNumber,
              status: 'APPROVED',
              grand_total: breakdown.grandTotal,
              sales_channel: 'DIRECT_RETAIL',
              paid_at: nowIso
            },
            "BOTH"
          );
        });

        transaction();

        logAudit(userEmail, "QUICK_RETAIL_SALE", "QUOTATION", quotationId, `Direct retail sale ${receiptNumber} IDR ${breakdown.grandTotal}`);

        res.json({
          success: true,
          data: {
            quotation_id: quotationId,
            quotation_number: quotationNumber,
            receipt_number: receiptNumber,
            ci_number: ciNumber,
            dn_number: dnNumber,
            grand_total: breakdown.grandTotal,
            payment_method,
            cash_tendered: effectiveCashTendered,
            change_due: effectiveChangeDue,
            paid_at: nowIso,
            customer_name: customer_name_manual || "Pelanggan Umum (Walk-in)"
          }
        });
      } catch (err: any) {
        console.error("QUICK_SETTLE_ERROR:", err);
        res.status(500).json({ error: "Gagal memproses transaksi retail", details: err.message });
      }
    }
  );

  salesRouter.get("/api/sales/receipts/:id", (req, res) => {
    try {
      const { id } = req.params;
      const quotation = db.prepare(`
        SELECT q.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
        FROM quotations q
        LEFT JOIN customers c ON q.customer_id = c.id
        WHERE q.id = ? OR q.receipt_number = ? OR q.quotation_number = ?
      `).get(id, id, id) as any;

      if (!quotation) {
        return res.status(404).json({ error: "Sales receipt not found" });
      }

      quotation.items = db.prepare(`
        SELECT qi.*, i.item_code, COALESCE(qi.barcode, i.barcode, '') as item_barcode
        FROM quotation_items qi
        LEFT JOIN items i ON qi.item_id = i.id
        WHERE qi.quotation_id = ?
      `).all(quotation.id);

      res.json({ success: true, data: quotation });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Failed to load receipt details", details: err.message });
    }
  });

  salesRouter.get("/api/sales/retail-catalog", (req, res) => {
    try {
      const q = (req.query.q as string || "").trim();
      const typeFilter = (req.query.type as string || "").trim();
      let query = `
        SELECT i.id, i.item_code, i.name, i.uom, i.type,
               COALESCE(i.unit_price, 0) as material_cost,
               COALESCE(i.selling_price, i.unit_price, 0) as selling_price,
               COALESCE(i.selling_price, i.unit_price, 0) as unit_price,
               COALESCE(inv.physical_qty, 0) as physical_qty,
               COALESCE(inv.available_qty, 0) as available_qty
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id
        WHERE i.deleted_at IS NULL
      `;
      const params: any[] = [];
      if (typeFilter === "FINISHED") {
        query += ` AND ((i.type IN ('FINISHED', 'FINISH_GOOD', 'FINISH_GOODS')) OR (i.item_code LIKE 'FG - %' OR i.item_code LIKE 'FG-%')) AND i.type != 'MACHINE' AND i.item_code NOT LIKE 'MC - %' AND i.item_code NOT LIKE 'MC-%'`;
      } else if (typeFilter) {
        query += ` AND i.type = ?`;
        params.push(typeFilter);
      }
      if (q) {
        query += ` AND (i.name LIKE ? OR i.item_code LIKE ? OR COALESCE(i.barcode, '') LIKE ?)`;
        const wildcard = `%${q}%`;
        params.push(wildcard, wildcard, wildcard);
      }
      query += ` ORDER BY i.name ASC LIMIT 500`;

      const items = db.prepare(query).all(...params);
      res.json({ success: true, data: items });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Failed to retrieve product catalog", details: err.message });
    }
  });

  salesRouter.post(
    "/api/quotations/:id/authorize",
    requireRole(["FC", "SALES", "FINANCE", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"]),
    (req, res) => {
      try {
        const params = req.params as any;
        const { id } = params;
        const { pin } = req.body;
        const userRole = (req as any).userRole || "SALES";
        const userLevel = (req as any).userLevel || "STAFF";
        const username = (req as any).username || (req.headers["x-user-email"] as string) || userRole;

        if (
          !pin ||
          !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
        ) {
          return res.status(400).json({ error: "Invalid authorization PIN" });
        }

        const quotation = db
          .prepare("SELECT * FROM quotations WHERE id = ?")
          .get(id) as any;

        if (!quotation) {
          return res.status(404).json({ error: "Quotation not found" });
        }

        if (quotation.status !== "PENDING" && quotation.status !== "DRAFT") {
          return res
            .status(400)
            .json({ error: `Quotation is already in ${quotation.status} status` });
        }

        const quoAmount = Number(quotation.grand_total || quotation.amount || 0);
        const wfResult = recordWorkflowStepApproval({
          documentType: "Quotation",
          documentId: id,
          documentNumber: quotation.quotation_number || id,
          documentTitle: quotation.title || quotation.quotation_number,
          department: "SALES",
          amount: quoAmount,
          user: {
            username,
            name: (req as any).user?.name || username,
            role: userRole,
            level: userLevel,
          },
          executiveFastTrackAllSteps: true,
        });

        if (!wfResult.ok) {
          return res.status(403).json({ error: wfResult.error });
        }

        const { credit_override_reason } = req.body;
        if (quotation.customer_id) {
          const cust = db
            .prepare("SELECT id, name, credit_limit, payment_terms_days FROM customers WHERE id = ?")
            .get(quotation.customer_id) as any;
          const creditLimit = Number(cust?.credit_limit) || 0;
          if (creditLimit > 0) {
            const arRow = db
              .prepare(
                `SELECT COALESCE(SUM(MAX(0, COALESCE(grand_total, total_amount, amount, 0) - COALESCE(amount_paid, 0))), 0) as active_ar
                 FROM commercial_invoices
                 WHERE customer_id = ? AND status != 'PAID' AND payment_status != 'PAID'`
              )
              .get(quotation.customer_id) as any;
            const activeAr = Number(arRow?.active_ar) || 0;
            const orderTotal = Number(quotation.grand_total || quotation.amount || 0);
            if (activeAr + orderTotal > creditLimit && !credit_override_reason && req.body.enforce_credit_gate === true) {
              return res.status(400).json({
                error: `CREDIT_LIMIT_EXCEEDED: Eksposur piutang pelanggan ${cust.name} (Rp ${(activeAr + orderTotal).toLocaleString("id-ID")}) melebihi plafon Credit Limit (Rp ${creditLimit.toLocaleString("id-ID")}). Harap sertakan otorisasi override.`,
                credit_hold: true,
              });
            }
          }
        }

        if (wfResult.isFinalStep) {
          db.prepare(
            `UPDATE quotations
             SET status = 'APPROVED',
                 credit_override_reason = COALESCE(?, credit_override_reason),
                 workflow_step_index = ?,
                 workflow_total_steps = ?,
                 workflow_current_role = 'COMPLETED'
             WHERE id = ?`,
          ).run(
            credit_override_reason || null,
            wfResult.approval.required_roles.length,
            wfResult.approval.required_roles.length,
            id,
          );
        } else {
          db.prepare(
            `UPDATE quotations
             SET status = 'PENDING',
                 credit_override_reason = COALESCE(?, credit_override_reason),
                 workflow_step_index = ?,
                 workflow_total_steps = ?,
                 workflow_current_role = ?,
                 step_started_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).run(
            credit_override_reason || null,
            wfResult.approval.current_step_index,
            wfResult.approval.required_roles.length,
            wfResult.nextStepRole,
            id,
          );
        }

        outboxService.enqueue(
          db,
          "QUOTATIONS",
          id,
          "UPDATE",
          { id, status: wfResult.isFinalStep ? "APPROVED" : "PENDING", updated_at: new Date().toISOString() },
          "BOTH"
        );

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "AUTHORIZE_QUOTATION",
          "QUOTATION",
          id,
          `Authorized quotation ${quotation.quotation_number}${credit_override_reason ? ` (Credit Override: ${credit_override_reason})` : ""}`,
        );

        res.json({
          success: true,
          message: "Quotation authorized successfully",
        });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({
            error: "Failed to authorize quotation",
            details: err.message,
          });
      }
    },
  );

  salesRouter.post(
    "/api/sales/quotations/:id/create-dp-invoice",
    requireRole(["FC", "SALES", "FINANCE", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const dpPercentage = Math.min(95, Math.max(5, Number(req.body?.dp_percentage) || 50));
        const bankAccountId = req.body?.bank_account_id || null;
        const userEmail = ((req.headers["x-user-email"] as string) || "FINANCE_DP");

        const quotation = db.prepare("SELECT * FROM quotations WHERE id = ?").get(id) as any;
        if (!quotation) {
          return res.status(404).json({ error: "Quotation not found" });
        }

        const existingDp = db
          .prepare(
            `SELECT id, ci_number, grand_total, dpp, ppn
             FROM commercial_invoices
             WHERE (quotation_id = ? OR id = ?) AND invoice_category = 'DOWN_PAYMENT'
             LIMIT 1`
          )
          .get(id, quotation.dp_invoice_id || "__NONE__") as any;

        if (existingDp) {
          return res.json({
            success: true,
            already_exists: true,
            message: `Faktur Uang Muka (DP) ${existingDp.ci_number} sudah diterbitkan untuk Quotation ini.`,
            data: existingDp,
          });
        }

        const quoItems = db.prepare("SELECT * FROM quotation_items WHERE quotation_id = ?").all(id) as any[];
        const fullBreakdown = calculateFinancialBreakdown({
          items: quoItems.map((it) => ({
            qty: Number(it.qty || 1),
            unit_price: Number(it.unit_price || 0),
          })),
          grossAmount: Number(quotation.amount) > 0 ? undefined : Number(quotation.grand_total),
          discountRate: Number(quotation.discount_rate) || 0,
          taxRate: quotation.tax_rate !== undefined && quotation.tax_rate !== null ? Number(quotation.tax_rate) : 12,
          pphRate: Number(quotation.pph_rate) || 0,
          taxScheme: (quotation.tax_scheme as any) || "DPP_NILAI_LAIN",
        });

        const dpRatio = dpPercentage / 100;
        const dpDpp = Math.round(fullBreakdown.dpp * dpRatio);
        const dpBreakdown = calculateFinancialBreakdown({
          grossAmount: dpDpp,
          taxRate: fullBreakdown.taxRate,
          pphRate: fullBreakdown.pphRate,
          taxScheme: fullBreakdown.taxScheme,
        });

        const dParts = new Date().toISOString().split("T")[0].split("-");
        const rand = Math.floor(100 + Math.random() * 900);
        const dnId = `DN-DP-${Date.now()}-${rand}`;
        const dnNumber = `DN-${dParts[0].slice(-2)}${dParts[1]}-DP${rand}`;
        const ciId = `CI-DP-${Date.now()}-${rand}`;
        const ciNumber = `CI-${dParts[0]}${dParts[1]}-DP${rand}`;

        const linkedProject = db
          .prepare("SELECT id FROM projects WHERE quotation_id = ? LIMIT 1")
          .get(id) as any;

        db.transaction(() => {
          db.prepare(`
            INSERT INTO delivery_notes (
              id, dn_number, customer_id, project_id, quotation_id, status,
              authorized_by, shipped_at, delivered_at, invoiced_at, remarks, created_at
            ) VALUES (?, ?, ?, ?, ?, 'DELIVERED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
          `).run(
            dnId,
            dnNumber,
            quotation.customer_id,
            linkedProject?.id || null,
            id,
            userEmail,
            `Termin Uang Muka (DP ${dpPercentage}%) - Ref Quotation ${quotation.quotation_number}`
          );

          db.prepare(`
            INSERT INTO commercial_invoices (
              id, ci_number, dn_id, customer_id, project_id, quotation_id,
              invoice_category, dpp_nilai_lain,
              amount, gross_amount, discount_rate, discount_amount, dpp, rounding_factor,
              ppn, pph, total_amount, grand_total,
              bank_account_id, payment_terms, ppn_rate, pph_rate, job_description, status, payment_status
            ) VALUES (
              ?, ?, ?, ?, ?, ?,
              'DOWN_PAYMENT', ?,
              ?, ?, 0, 0, ?, 0,
              ?, ?, ?, ?,
              ?, ?, ?, ?, ?, 'UNPAID', 'UNPAID'
            )
          `).run(
            ciId,
            ciNumber,
            dnId,
            quotation.customer_id,
            linkedProject?.id || null,
            id,
            dpBreakdown.dppNilaiLain,
            dpBreakdown.dpp,
            dpBreakdown.grossAmount,
            dpBreakdown.dpp,
            dpBreakdown.ppnAmount,
            dpBreakdown.pphAmount,
            dpBreakdown.grandTotal,
            dpBreakdown.grandTotal,
            bankAccountId,
            `Down Payment (${dpPercentage}%)`,
            dpBreakdown.taxRate,
            dpBreakdown.pphRate,
            `Faktur Uang Muka (DP ${dpPercentage}%) - ${quotation.title} (${quotation.quotation_number})`
          );

          db.prepare(
            `UPDATE quotations SET dp_percentage = ?, dp_invoice_id = ? WHERE id = ?`
          ).run(dpPercentage, ciId, id);

          postDownPaymentInvoiceJournal(db, {
            ci_id: ciId,
            ci_number: ciNumber,
            dp_dpp: dpBreakdown.dpp,
            dp_ppn: dpBreakdown.ppnAmount,
            dp_grand_total: dpBreakdown.grandTotal,
            is_paid: false,
            user: userEmail,
          });
        })();

        res.json({
          success: true,
          message: `Faktur Uang Muka (DP ${dpPercentage}%) ${ciNumber} berhasil diterbitkan & dijurnal ke COA 2106 (Uang Muka Pelanggan).`,
          data: {
            id: ciId,
            ci_number: ciNumber,
            dp_percentage: dpPercentage,
            dpp: dpBreakdown.dpp,
            dpp_nilai_lain: dpBreakdown.dppNilaiLain,
            ppn: dpBreakdown.ppnAmount,
            grand_total: dpBreakdown.grandTotal,
          },
        });
      } catch (err: any) {
        console.error("[Create B2B DP Invoice Error]:", err);
        res.status(500).json({ error: "Gagal menerbitkan Faktur DP: " + (err.message || "Internal error") });
      }
    }
  );

  salesRouter.put(
    "/api/quotations/:id",
    requireRole(["FC", "SALES", "ENGINEERING"]),
    (req, res) => {
      try {
        const params = req.params as any;
        const { id } = params;
        const {
          title,
          validity_days,
          remarks,
          items,
          tax_rate,
          discount_rate,
          npwp_tax_id,
          pph_rate,
        } = req.body;

        if (
          !title ||
          !items ||
          !Array.isArray(items) ||
          items.length === 0
        ) {
          return res.status(400).json({ error: "Missing required fields: title and items are required" });
        }

        for (const item of items) {
          let itemRow: any = null;
          if (item.item_id) {
            itemRow = db.prepare("SELECT * FROM items WHERE id = ?").get(item.item_id);
          } else if (item.item_code) {
            itemRow = db.prepare("SELECT * FROM items WHERE item_code = ?").get(item.item_code);
          }

          const itCode = (item.item_code || itemRow?.item_code || "").trim().toUpperCase();
          const itType = (itemRow?.type || "").toUpperCase();

          const isMachine = itType === "MACHINE" || itCode.startsWith("MC - ") || itCode.startsWith("MC-");
          if (isMachine) {
            return res.status(400).json({
              error: `Machine items (${itCode || item.title || "Machine"}) cannot be included in commercial Quotations.`,
            });
          }

          const isFinishGood = itType === "FINISHED" || itType === "FINISH_GOOD" || itType === "FINISH_GOODS" || itCode.startsWith("FG - ") || itCode.startsWith("FG-");
          if (itemRow && !isFinishGood) {
            return res.status(400).json({
              error: `Only Finish Goods (FG - ...) can be included in Quotations. Item [${itCode || item.title}] (${itemRow.type || "Non-FG"}) is not permitted.`,
            });
          }
        }

        const quotation = db
          .prepare("SELECT * FROM quotations WHERE id = ?")
          .get(id) as any;

        if (!quotation) {
          return res.status(404).json({ error: "Quotation not found" });
        }

        if (quotation.status === "PROCESSED") {
          return res.status(400).json({ error: "Cannot delete a processed quotation as it is linked to active projects." });
        }

        db.transaction(() => {
          const newStatus =
            req.body.status && ["DRAFT", "PENDING"].includes(req.body.status)
              ? req.body.status
              : "PENDING";
          const discountRateVal = Number(discount_rate) || 0;
          const taxRateVal = Number(tax_rate) || 0;
          const pphRateVal = Number(pph_rate) || 0;
          const taxSchemeVal = req.body.tax_scheme || (taxRateVal > 0 ? "DPP_NILAI_LAIN" : "NON_PKP");
          const paymentTermsVal = req.body.payment_terms || req.body.payment_method || quotation.payment_terms || "Net 30 Days";

          const breakdown = calculateFinancialBreakdown({
            items: (items || []).map((it: any) => ({
              qty: Number(it.qty || 1),
              unit_price: Number(it.unit_price || 0),
            })),
            discountRate: discountRateVal,
            taxRate: taxRateVal,
            pphRate: pphRateVal,
            taxScheme: taxSchemeVal,
            roundingFactor: Number(req.body.rounding_factor) || 0,
          });

          db.prepare(
            `
            UPDATE quotations 
            SET title = ?, amount = ?, validity_days = ?, remarks = ?, status = ?, revision_note = NULL,
                tax_rate = ?, discount_rate = ?, npwp_tax_id = ?, pph_rate = ?,
                dpp = ?, dpp_nilai_lain = ?, tax_scheme = ?, payment_terms = ?, payment_method = ?,
                rounding_factor = ?, grand_total = ?
            WHERE id = ?
          `,
          ).run(
            title,
            breakdown.dpp,
            validity_days ? Number(validity_days) : 20,
            remarks || null,
            newStatus,
            taxRateVal,
            discountRateVal,
            npwp_tax_id || null,
            pphRateVal,
            breakdown.dpp,
            breakdown.dppNilaiLain,
            taxSchemeVal,
            paymentTermsVal,
            paymentTermsVal,
            breakdown.roundingFactor,
            breakdown.grandTotal,
            id,
          );

          db.prepare(
            "DELETE FROM quotation_items WHERE quotation_id = ?",
          ).run(id);

          const itemStmt = db.prepare(`
            INSERT INTO quotation_items (id, quotation_id, title, qty, uom, unit_price, item_id, barcode, discount_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const item of items) {
            const itemId =
              "QI-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            const itemTitle = item.title || item.item_name || item.name || "Commercial Item";
            const itemQty = Number(item.qty || item.quantity || 1);
            const itemUom = item.uom || "Unit";
            const itemUnitPrice = Number(item.unit_price || item.price || 0);

            itemStmt.run(
              itemId,
              id,
              itemTitle,
              itemQty,
              itemUom,
              itemUnitPrice,
              item.item_id || null,
              item.barcode || null,
              Number(item.discount_amount) || 0,
            );
          }
        })();

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "UPDATE_QUOTATION",
          "QUOTATION",
          id,
          `Revised quotation ${quotation.quotation_number}`,
        );

        res.json({
          success: true,
          message: "Quotation updated successfully",
        });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({
            error: "Failed to update quotation",
            details: err.message,
          });
      }
    },
  );

  salesRouter.delete(
    "/api/quotations/:id",
    requireRole(["FC", "SALES", "ENGINEERING"]),
    (req, res) => {
      try {
        const params = req.params as any;
        const { id } = params;

        const quotation = db
          .prepare("SELECT * FROM quotations WHERE id = ?")
          .get(id) as any;
        if (!quotation) {
          return res.status(404).json({ error: "Quotation not found" });
        }

        if (quotation.status === "PROCESSED") {
          return res.status(400).json({ error: "Cannot delete a processed quotation as it is linked to active projects." });
        }

        db.transaction(() => {
          db.prepare(
            "UPDATE spks SET quotation_id = NULL WHERE quotation_id = ?",
          ).run(id);
          db.prepare(
            "UPDATE ntps SET quotation_id = NULL WHERE quotation_id = ?",
          ).run(id);
          db.prepare(
            "UPDATE projects SET quotation_id = NULL WHERE quotation_id = ?",
          ).run(id);
          db.prepare(
            "DELETE FROM quotation_items WHERE quotation_id = ?",
          ).run(id);
          db.prepare(
            "UPDATE quotations SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(id);
        })();

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "DELETE_QUOTATION",
          "QUOTATION",
          id,
          `Deleted quotation ${quotation.quotation_number}`,
        );

        res.json({
          success: true,
          message: "Quotation deleted successfully",
        });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({
            error: "Failed to delete quotation",
            details: err.message,
          });
      }
    },
  );

  salesRouter.post(
    "/api/quotations/:id/revise",
    requireRole(["FC", "SALES", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"]),
    (req, res) => {
      try {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        const isExec = [
          "FC",
          "BOD",
          "DIRECTOR",
          "ADMIN",
          "SUPERADMIN",
        ].includes(userRole);
        if (!isExec && userLevel !== "MANAGER") {
          return res.status(403).json({
            error:
              "Access denied. Only Managers or Executive accounts can revise Quotations.",
          });
        }

        const params = req.params as any;
        const { id } = params;
        const { pin, revision_note } = req.body;

        if (
          !pin ||
          !isValidDailyAuthKey(req.headers["x-user-email"] as string, pin)
        ) {
          return res.status(400).json({ error: "Invalid authorization PIN" });
        }
        if (!revision_note) {
          return res.status(400).json({ error: "Revision note is required" });
        }

        const quotation = db
          .prepare("SELECT * FROM quotations WHERE id = ?")
          .get(id) as any;

        if (!quotation) {
          return res.status(404).json({ error: "Quotation not found" });
        }

        db.prepare(
          "UPDATE quotations SET status = 'REVISION', revision_note = ? WHERE id = ?",
        ).run(revision_note, id);
        
        outboxService.enqueue(
          db,
          "QUOTATIONS",
          id,
          "UPDATE",
          { id, status: 'REVISION', revision_note, updated_at: new Date().toISOString() },
          "BOTH"
        );

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "REVISE_QUOTATION",
          "QUOTATION",
          id,
          `Revise quotation ${quotation.quotation_number} with note: ${revision_note}`,
        );

        res.json({ success: true, message: "Quotation marked for revision" });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: "Failed to revise quotation", details: err.message });
      }
    }
  );

  salesRouter.get("/api/spks", (req, res) => {
    try {
      const spks = db
        .prepare(
          `
      SELECT 
        s.*, 
        p.name as project_name, 
        q.quotation_number,
        (SELECT COUNT(*) FROM projects WHERE spk_id = s.id OR id = s.project_id) as project_count,
        (SELECT SUM(COALESCE(qty, 1)) FROM projects WHERE spk_id = s.id OR id = s.project_id) as total_qty,
        (SELECT GROUP_CONCAT(name, ', ') FROM projects WHERE spk_id = s.id OR id = s.project_id) as project_names,
        EXISTS(SELECT 1 FROM purchase_requests WHERE (spk_id = s.id OR project_id = s.project_id) AND status != 'CANCELLED') as has_pr
      FROM spks s
      LEFT JOIN projects p ON s.project_id = p.id
      LEFT JOIN quotations q ON s.quotation_id = q.id
      ORDER BY s.created_at DESC
    `,
        )
        .all();
      res.json({ success: true, data: spks });
    } catch (err: any) {
      console.error(err);
      res
        .status(500)
        .json({ error: "Failed to fetch SPKs", details: err.message });
    }
  });
}
