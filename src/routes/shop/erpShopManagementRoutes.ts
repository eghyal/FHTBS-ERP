import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import crypto from "crypto";
import { cacheService } from "../../services/cacheService.ts";
import { hybridDb } from "../../db/firestoreAdapter.ts";
import { scheduleImmediateWriteThrough } from "../../services/outboxService.ts";
import {
  postJournalEntry,
  postDeliveryDispatchJournal,
  postDownPaymentInvoiceJournal,
  postFinalSettlementInvoiceJournal,
} from "../../utils/accountingBridge.ts";

function parseGalleryUrls(raw: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const entry of list) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  return cleaned;
}

function normalizeLockedCatalogMedia(coverInput: unknown, galleryInput: unknown): {
  primaryUrl: string | null;
  gallery: string[];
  galleryJson: string;
} {
  const cleanCover = typeof coverInput === "string" ? coverInput.trim() : "";
  let gallery = parseGalleryUrls(galleryInput);

  if (cleanCover) {
    // Locked Main Cover invariant: keep primaryUrl locked strictly at index 0
    gallery = [cleanCover, ...gallery.filter((u) => u !== cleanCover)];
    return {
      primaryUrl: cleanCover,
      gallery,
      galleryJson: JSON.stringify(gallery),
    };
  }

  // Only promote gallery[0] if admin explicitly cleared/removed the cover photo
  const promoted = gallery[0] || null;
  return {
    primaryUrl: promoted,
    gallery,
    galleryJson: JSON.stringify(gallery),
  };
}

export function registerErpShopManagementRoutes(shopRouter: Router) {
  shopRouter.get(
    "/api/erp/shop-management/orders",
    requireRole(["SALES", "FINANCE", "WAREHOUSE", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const status = (req.query.status as string || "ALL").trim();
        const q = (req.query.q as string || "").trim();

        let sql = `
          SELECT 
            o.*,
            (SELECT COUNT(*) FROM shop_order_items WHERE order_id = o.id) as item_count
          FROM shop_orders o
          WHERE 1=1
        `;
        const params: any[] = [];

        if (status && status !== "ALL") {
          sql += ` AND o.order_status = ?`;
          params.push(status);
        }

        if (q) {
          sql += ` AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.delivery_city LIKE ?)`;
          const wildcard = `%${q}%`;
          params.push(wildcard, wildcard, wildcard, wildcard);
        }

        sql += ` ORDER BY o.created_at DESC`;

        const orders = db.prepare(sql).all(...params) as any[];
        if (orders.length === 0) {
          return res.json({ success: true, data: [] });
        }

        const orderIds = orders.map((o) => o.id);
        const orderPlaceholders = orderIds.map(() => "?").join(", ");
        const allItems = db
          .prepare(`SELECT * FROM shop_order_items WHERE order_id IN (${orderPlaceholders})`)
          .all(...orderIds) as any[];

        const itemsByOrderId = new Map<string, any[]>();
        for (const item of allItems) {
          const list = itemsByOrderId.get(item.order_id) || [];
          list.push(item);
          itemsByOrderId.set(item.order_id, list);
        }

        const ciByDnStmt = db.prepare(
          `SELECT id, ci_number, invoice_category FROM commercial_invoices
           WHERE dn_id = ? OR shop_order_id = ? OR job_description LIKE ?
           ORDER BY created_at DESC`
        );
        const custCodeStmt = db.prepare(`SELECT code FROM customers WHERE id = ? LIMIT 1`);
        const projStmt = db.prepare(
          `SELECT p.status as project_status, p.spk_number,
                  (SELECT AVG(COALESCE(b.progress, 0)) FROM bill_of_processes b WHERE b.project_id = p.id) as bop_progress
           FROM projects p WHERE p.id = ? LIMIT 1`
        );

        const enrichedOrders = orders.map((ord) => {
          const linkedCis = ciByDnStmt.all(
            ord.delivery_note_id || "__NONE__",
            ord.id,
            `%${ord.order_number}%`
          ) as any[];
          const latestCi = linkedCis[0] || null;
          const dpCi = linkedCis.find((c) => c.invoice_category === "DOWN_PAYMENT") || null;
          const finalCi = linkedCis.find((c) => c.invoice_category === "FINAL_SETTLEMENT" || c.invoice_category === "STANDARD") || null;

          let custCode: string | null = null;
          if (ord.customer_id) {
            const cRow = custCodeStmt.get(ord.customer_id) as any;
            custCode = cRow?.code || null;
          }

          let projectStatus: string | null = null;
          let bopProgress = 0;
          if (ord.project_id) {
            const pRow = projStmt.get(ord.project_id) as any;
            if (pRow) {
              projectStatus = pRow.project_status;
              bopProgress = Math.round(Number(pRow.bop_progress) || 0);
              if ((projectStatus === "COMPLETED" || bopProgress >= 100) && ord.production_status !== "COMPLETED") {
                db.prepare("UPDATE shop_orders SET production_status = 'COMPLETED' WHERE id = ?").run(ord.id);
                ord.production_status = "COMPLETED";
              }
            }
          }

          const orderItems = itemsByOrderId.get(ord.id) || [];
          const hasMto = orderItems.some((it) => it.fulfillment_type === "MAKE_TO_ORDER" || Number(it.mto_qty) > 0);
          const subtotalVal = Number(ord.subtotal_amount) || Number(ord.total_amount) || 0;
          const dppVal = Number(ord.dpp_amount) > 0 ? Number(ord.dpp_amount) : Math.round(subtotalVal / 1.11);
          const dppNilaiLainVal = Number(ord.dpp_nilai_lain) > 0 ? Number(ord.dpp_nilai_lain) : Math.round((dppVal * 11) / 12);
          const ppnVal = Number(ord.ppn_amount) > 0 ? Number(ord.ppn_amount) : Math.max(0, subtotalVal - dppVal);

          return {
            ...ord,
            customer_code: custCode,
            dpp_amount: dppVal,
            dpp_nilai_lain: dppNilaiLainVal,
            ppn_amount: ppnVal,
            tax_scheme: ord.tax_scheme || "DPP_NILAI_LAIN",
            fulfillment_mode: ord.fulfillment_mode || (hasMto ? "MTO" : "MTS"),
            production_status: ord.production_status || (ord.project_id ? "IN_PRODUCTION" : hasMto ? "PENDING_SPK" : "NOT_REQUIRED"),
            project_status: projectStatus,
            bop_progress: bopProgress,
            ci_id: latestCi?.id || null,
            ci_number: latestCi?.ci_number || null,
            dp_invoice_id: dpCi?.id || ord.dp_invoice_id || null,
            dp_ci_number: dpCi?.ci_number || null,
            final_invoice_id: finalCi?.id || ord.final_invoice_id || null,
            final_ci_number: finalCi?.ci_number || null,
            items: orderItems,
          };
        });

        res.json({
          success: true,
          data: enrichedOrders,
        });
      } catch (err: any) {
        console.error("[ERP Shop API] Orders list error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch orders" });
      }
    }
  );

  shopRouter.get(
    "/api/erp/shop-management/stats",
    requireRole(["SALES", "FINANCE", "WAREHOUSE", "FC", "ADMIN", "GOD_MODE"]),
    (_req, res) => {
      try {
        const totals = db.prepare(`
          SELECT 
            COUNT(*) as total_orders,
            SUM(CASE WHEN order_status = 'PENDING_PAYMENT' THEN 1 ELSE 0 END) as pending_payment_count,
            SUM(CASE WHEN order_status = 'PROCESSING' OR payment_status = 'PAID' AND order_status != 'DISPATCHED' AND order_status != 'COMPLETED' THEN 1 ELSE 0 END) as ready_to_dispatch_count,
            SUM(CASE WHEN order_status = 'DISPATCHED' THEN 1 ELSE 0 END) as dispatched_count,
            SUM(CASE WHEN order_status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_count,
            SUM(CASE WHEN payment_status = 'PAID' OR order_status IN ('PROCESSING', 'DISPATCHED', 'COMPLETED') THEN total_amount ELSE 0 END) as total_revenue,
            AVG(CASE WHEN payment_status = 'PAID' OR order_status IN ('PROCESSING', 'DISPATCHED', 'COMPLETED') THEN total_amount ELSE NULL END) as avg_order_value
          FROM shop_orders
        `).get() as any;

        const catalogStats = db.prepare(`
          SELECT 
            COUNT(i.id) as total_skus,
            SUM(CASE WHEN i.is_published_shop = 1 THEN 1 ELSE 0 END) as published_skus,
            SUM(CASE WHEN i.is_published_shop = 1 AND COALESCE(inv.physical_qty, 0) > 0 THEN 1 ELSE 0 END) as ready_stock_skus,
            SUM(CASE WHEN i.is_published_shop = 1 AND (COALESCE(inv.physical_qty, 0) <= 0 OR i.shop_availability_type = 'MAKE_TO_ORDER') THEN 1 ELSE 0 END) as mto_skus
          FROM items i
          LEFT JOIN inventory inv ON i.id = inv.item_id
          WHERE i.deleted_at IS NULL AND (i.type = 'FINISHED' OR i.type = 'FINISH_GOOD')
        `).get() as any;

        res.json({
          success: true,
          data: {
            total_skus: catalogStats?.total_skus || 0,
            published_skus: catalogStats?.published_skus || 0,
            ready_stock_skus: catalogStats?.ready_stock_skus || 0,
            mto_skus: catalogStats?.mto_skus || 0,
            total_orders: totals?.total_orders || 0,
            pending_payment: totals?.pending_payment_count || 0,
            ready_to_dispatch: totals?.ready_to_dispatch_count || 0,
            dispatched: totals?.dispatched_count || 0,
            completed: totals?.completed_count || 0,
            total_revenue: totals?.total_revenue || 0,
            avg_order_value: totals?.avg_order_value || 0,
          },
        });
      } catch (err: any) {
        console.error("[ERP Shop API] Stats error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch shop stats" });
      }
    }
  );

  shopRouter.put(
    "/api/erp/shop-management/orders/:id/status",
    requireRole(["SALES", "FINANCE", "WAREHOUSE", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const { order_status, payment_status, tracking_number, fleet_notes } = req.body;

        const order = db.prepare("SELECT * FROM shop_orders WHERE id = ?").get(id) as any;
        if (!order) {
          return res.status(404).json({ success: false, error: "Order not found" });
        }

        const prevPaymentStatus = order.payment_status;

        db.prepare(`
          UPDATE shop_orders
          SET order_status = COALESCE(?, order_status),
              payment_status = COALESCE(?, payment_status),
              tracking_number = COALESCE(?, tracking_number),
              fleet_notes = COALESCE(?, fleet_notes),
              dispatched_at = CASE WHEN ? = 'DISPATCHED' AND dispatched_at IS NULL THEN CURRENT_TIMESTAMP ELSE dispatched_at END,
              paid_at = CASE WHEN ? = 'PAID' AND paid_at IS NULL THEN CURRENT_TIMESTAMP ELSE paid_at END
          WHERE id = ?
        `).run(
          order_status || null,
          payment_status || null,
          tracking_number || null,
          fleet_notes || null,
          order_status,
          payment_status,
          id
        );

        if (payment_status === "PAID" && prevPaymentStatus !== "PAID") {
          try {
            const userEmail = (req.headers["x-user-email"] as string) || "FC_SHOP";
            const totalAmt = Math.round(Number(order.total_amount) || 0);
            const ppnAmt = Math.round(Number(order.ppn_amount) || 0);
            const netRevenueAmt = Math.max(0, totalAmt - ppnAmt);
            if (totalAmt > 0) {
              const jLines: any[] = [
                {
                  account_code: order.payment_method === "TRANSFER_MANUAL" || order.payment_method === "QRIS" ? "1108" : "1101",
                  account_name: "Penerimaan Kas & Bank Shop (B2C)",
                  debit: totalAmt,
                  credit: 0,
                  memo: `Penerimaan Pembayaran B2C Shop ${order.order_number}`,
                },
                {
                  account_code: "4101",
                  account_name: "Pendapatan Usaha Penjualan Shop B2C",
                  debit: 0,
                  credit: netRevenueAmt,
                  memo: `Omset Shop B2C ${order.order_number}`,
                },
              ];
              if (ppnAmt > 0) {
                jLines.push({
                  account_code: "2102",
                  account_name: "VAT / PPN Payable (Hutang Pajak Keluaran)",
                  debit: 0,
                  credit: ppnAmt,
                  memo: `PPN Keluaran Shop B2C ${order.order_number}`,
                });
              }
              postJournalEntry(db, {
                reference_type: "COMMERCIAL_INVOICE",
                reference_id: order.id,
                reference_number: order.order_number,
                description: `Pengakuan Omset Penjualan B2C Shop #${order.order_number}`,
                created_by: userEmail,
                lines: jLines,
              });
            }
          } catch (jErr) {
            console.warn("[Shop Status API] Revenue journal posting note:", jErr);
          }
        }

        res.json({
          success: true,
          message: `Order ${order.order_number} status updated successfully.`,
        });
      } catch (err: any) {
        console.error("[ERP Shop API] Status update error:", err);
        res.status(500).json({ success: false, error: "Failed to update order status" });
      }
    }
  );

  shopRouter.post(
    "/api/erp/shop-management/orders/:id/dispatch-do",
    requireRole(["SALES", "WAREHOUSE", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const { driver_name, vehicle_plate, dispatch_notes } = req.body;

        const order = db.prepare("SELECT * FROM shop_orders WHERE id = ?").get(id) as any;
        if (!order) {
          return res.status(404).json({ success: false, error: "Order not found" });
        }

        if (order.delivery_note_id) {
          const existingDn = db
            .prepare("SELECT id, dn_number FROM delivery_notes WHERE id = ?")
            .get(order.delivery_note_id) as any;
          if (existingDn) {
            return res.json({
              success: true,
              already_exists: true,
              message: `Surat Jalan ${existingDn.dn_number} sudah diterbitkan untuk pesanan ini.`,
              data: {
                dn_id: existingDn.id,
                dn_number: existingDn.dn_number,
              },
            });
          }
        }

        const items = db.prepare("SELECT * FROM shop_order_items WHERE order_id = ?").all(id) as any[];

        let customerId = "CUS-B2C-SHOP";
        try {
          const custMatch = db.prepare("SELECT id FROM customers WHERE (phone = ? AND phone IS NOT NULL AND phone != '') OR (email = ? AND email IS NOT NULL AND email != '') LIMIT 1")
            .get(order.customer_phone || "", order.customer_email || "") as any;
          if (custMatch) {
            customerId = custMatch.id;
          } else {
            db.prepare(`
              INSERT OR IGNORE INTO customers (id, name, code, contact_person, phone)
              VALUES ('CUS-B2C-SHOP', 'Pelanggan Ritel Storefront (B2C)', 'CUS-B2C', 'Pelanggan Ritel', '080000000000')
            `).run();
          }
        } catch {
          customerId = "CUS-B2C-SHOP";
        }

        const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let rand = "";
        for (let i = 0; i < 4; i++) {
          rand += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const now = new Date();
        const yr = String(now.getFullYear()).slice(-2);
        const mo = String(now.getMonth() + 1).padStart(2, "0");
        const dnNumber = `DN-${yr}${mo}-B2C-${rand}`;
        const dnId = `DN-${Date.now()}-${rand}`;

        let totalCogs = 0;

        db.transaction(() => {
          const lockRes = db.prepare(`
            UPDATE shop_orders
            SET order_status = 'DISPATCHED',
                tracking_number = ?,
                fleet_notes = ?,
                delivery_note_id = ?,
                dispatched_at = CURRENT_TIMESTAMP
            WHERE id = ? AND delivery_note_id IS NULL
          `).run(
            dnNumber,
            `${vehicle_plate ? vehicle_plate + " - " : ""}${driver_name || "Dispatch Driver"}`,
            dnId,
            id
          );

          if (lockRes.changes === 0) {
            throw new Error("ALREADY_DISPATCHED");
          }

          db.prepare(`
            INSERT INTO delivery_notes (
              id, dn_number, customer_id, project_id, quotation_id, delivery_date, status,
              vehicle_plate, driver_name, shipping_address, recipient_contact, notes, created_at, delivered_at
            ) VALUES (
              ?, ?, ?, NULL, NULL, CURRENT_DATE, 'DELIVERED',
              ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
          `).run(
            dnId,
            dnNumber,
            customerId,
            vehicle_plate || "Internal Fleet",
            driver_name || "Factory Driver",
            order.delivery_address,
            `${order.customer_name} (${order.customer_phone})`,
            dispatch_notes || `B2C Shop Order ${order.order_number}`
          );

          const dnItemInsert = db.prepare(`
            INSERT INTO delivery_items (
              id, dn_id, delivery_id, item_id, item_code, item_name, uom, qty, qty_delivered, remarks, notes
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `);

          const userEmail = (req.headers["x-user-email"] as string) || "LOGISTICS_B2C";

          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const qty = Number(it.qty) || 1;

            dnItemInsert.run(
              `DNI-${dnId}-${i + 1}`,
              dnId,
              dnId,
              it.item_id,
              it.item_code,
              it.item_name,
              it.uom,
              qty,
              qty,
              `From B2C Order ${order.order_number}`,
              `From B2C Order ${order.order_number}`
            );

            const itemMaster = db.prepare("SELECT COALESCE(unit_price, 0) as price FROM items WHERE id = ?").get(it.item_id) as any;
            const cost = (itemMaster ? Number(itemMaster.price) : Number(it.unit_price)) || 0;
            totalCogs += cost * qty;

            db.prepare(`
              UPDATE inventory
              SET physical_qty = MAX(0, COALESCE(physical_qty, 0) - ?),
                  reserved_qty = MAX(0, COALESCE(reserved_qty, 0) - ?),
                  allocated_stock = MAX(0, COALESCE(allocated_stock, 0) - ?),
                  free_stock = MAX(0, COALESCE(free_stock, 0) - ?),
                  available_qty = MAX(0, COALESCE(available_qty, 0) - ?)
              WHERE item_id = ?
            `).run(qty, qty, qty, qty, qty, it.item_id);

            db.prepare(`
              INSERT INTO stock_movements (id, item_id, type, qty, reference_id, recorded_by, created_at)
              VALUES (?, ?, 'RELEASE', ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
              "SM-" + crypto.randomUUID().substring(0, 8),
              it.item_id,
              qty,
              dnNumber,
              userEmail
            );
          }

          if (totalCogs > 0) {
            try {
              postDeliveryDispatchJournal(db, {
                dn_id: dnId,
                dn_number: dnNumber,
                total_cogs: totalCogs,
                user: userEmail,
              });
            } catch (cogsErr) {
              console.warn("[Shop Dispatch API] COGS journal posting note:", cogsErr);
            }
          }
        })();

        res.json({
          success: true,
          message: `Delivery Note ${dnNumber} created, stock released, and order dispatched.`,
          data: {
            dn_id: dnId,
            dn_number: dnNumber,
          },
        });
      } catch (err: any) {
        if (err?.message === "ALREADY_DISPATCHED") {
          return res.status(409).json({
            success: false,
            error: "Pesanan ini sudah diterbitkan Surat Jalan (DO) pada sesi lain.",
          });
        }
        console.error("[ERP Shop API] Dispatch error:", err);
        res.status(500).json({ success: false, error: "Failed to dispatch order: " + err.message });
      }
    }
  );

  shopRouter.post(
    "/api/erp/shop-management/orders/:id/trigger-spk",
    requireRole(["SALES", "WAREHOUSE", "FC", "ENGINEERING", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const order = db.prepare("SELECT * FROM shop_orders WHERE id = ?").get(id) as any;
        if (!order) {
          return res.status(404).json({ success: false, error: "Shop order not found" });
        }

        if (order.project_id) {
          const existingProj = db
            .prepare("SELECT id, name, spk_number, status FROM projects WHERE id = ?")
            .get(order.project_id) as any;
          if (existingProj) {
            return res.json({
              success: true,
              already_exists: true,
              message: `SPK Produksi ${existingProj.spk_number} sudah aktif untuk pesanan B2C ini.`,
              data: {
                project_id: existingProj.id,
                spk_number: existingProj.spk_number,
                status: existingProj.status,
              },
            });
          }
        }

        const items = db.prepare("SELECT * FROM shop_order_items WHERE order_id = ?").all(id) as any[];
        const totalUnits = items.reduce((acc, it) => acc + Math.max(1, Number(it.mto_qty || it.qty || 1)), 0);
        const leadDays = Math.max(3, ...items.map((it) => Number(it.estimated_lead_days) || 5));

        const dueDateObj = new Date();
        dueDateObj.setDate(dueDateObj.getDate() + leadDays);
        const dueDateStr = dueDateObj.toISOString().split("T")[0];

        const dParts = new Date().toISOString().split("T")[0].split("-");
        const rand = Math.floor(100 + Math.random() * 900);
        const projectId = `PRJ-B2C-${Date.now()}-${rand}`;
        const spkId = `SPK-B2C-${Date.now()}-${rand}`;
        const spkNumber = `SPK/${dParts[0]}${dParts[1]}/B2C-${rand}`;
        const projectName = `B2C MTO #${order.order_number} - ${order.customer_name}`;

        db.transaction(() => {
          db.prepare(`
            INSERT INTO projects (
              id, name, spk_number, priority, due_date, customer, remarks, status, urgency, factory_factor, created_at
            ) VALUES (?, ?, ?, 2, ?, ?, ?, 'IN_PROGRESS', 'HIGH', 85, CURRENT_TIMESTAMP)
          `).run(
            projectId,
            projectName,
            spkNumber,
            dueDateStr,
            order.customer_name,
            `Omnichannel B2C MTO Order #${order.order_number} (${items.map((i) => `${i.item_name} x${i.qty}`).join(", ")})`
          );

          db.prepare(`
            INSERT INTO spks (
              id, spk_number, project_id, title, due_date, target_completion_date, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', CURRENT_TIMESTAMP)
          `).run(spkId, spkNumber, projectId, projectName, dueDateStr, dueDateStr);

          const standardSteps = [
            {
              seq: 1,
              name: "1. Persiapan Material & Mixing / Cutting",
              wcId: "WC-CUT",
              wcName: "Cutting & Material Prep",
              hours: Math.max(2, Math.round(totalUnits * 0.15)),
              cycleMins: 10,
            },
            {
              seq: 2,
              name: "2. Pencetakan / Fabrikasi Utama (MTO Execution)",
              wcId: "WC-FAB",
              wcName: "Fabrication & Welding",
              hours: Math.max(4, Math.round(totalUnits * 0.25)),
              cycleMins: 15,
            },
            {
              seq: 3,
              name: "3. Curing, Finishing & Inpeksi Final QC",
              wcId: "WC-QC",
              wcName: "Quality Control & Inspection",
              hours: Math.max(2, Math.round(totalUnits * 0.1)),
              cycleMins: 8,
            },
          ];

          const bopInsert = db.prepare(`
            INSERT INTO bill_of_processes (
              id, project_id, step_sequence, process_name, node_type,
              work_center_id, work_center_name, execution_type, predecessor_ids,
              standard_hours, manpower_allocated, cycle_time_minutes,
              start_date, end_date, status, progress, notes
            ) VALUES (?, ?, ?, ?, 'PROCESS', ?, ?, 'SERIAL', ?, ?, 2, ?, CURRENT_DATE, ?, ?, 0, ?)
          `);

          let prevBopId: string | null = null;
          let firstBopId: string | null = null;

          for (const st of standardSteps) {
            const bopId = `BOP-${projectId}-${st.seq}`;
            if (!firstBopId) firstBopId = bopId;
            const preds = prevBopId ? JSON.stringify([prevBopId]) : "[]";
            bopInsert.run(
              bopId,
              projectId,
              st.seq,
              st.name,
              st.wcId,
              st.wcName,
              preds,
              st.hours,
              st.cycleMins,
              dueDateStr,
              st.seq === 1 ? "RUNNING" : "SCHEDULED",
              `Auto-generated BOP for B2C Order ${order.order_number}`
            );
            prevBopId = bopId;
          }

          const wotId = `WOT-B2C-${Date.now()}-${rand}`;
          const lotNumber = `LOT-${order.order_number}`;
          db.prepare(`
            INSERT INTO work_order_tickets (
              id, project_id, lot_number, qty, status, current_process_id, started_at, created_at
            ) VALUES (?, ?, ?, ?, 'RUNNING', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(wotId, projectId, lotNumber, totalUnits, firstBopId);

          db.prepare(`
            UPDATE shop_orders
            SET project_id = ?,
                spk_number = ?,
                production_status = 'IN_PRODUCTION',
                fulfillment_mode = CASE WHEN fulfillment_mode = 'MTS' THEN 'MTO' ELSE fulfillment_mode END,
                order_status = CASE WHEN order_status IN ('PENDING_PAYMENT', 'PAID', 'PAYMENT_SUBMITTED') THEN 'PROCESSING' ELSE order_status END
            WHERE id = ?
          `).run(projectId, spkNumber, id);
        })();

        res.json({
          success: true,
          message: `SPK Produksi ${spkNumber} beserta Routing BOP & Work Order Ticket (WOT) berhasil diterbitkan ke Lantai Produksi!`,
          data: {
            project_id: projectId,
            spk_number: spkNumber,
            due_date: dueDateStr,
            production_status: "IN_PRODUCTION",
          },
        });
      } catch (err: any) {
        console.error("[ERP Shop API] Trigger SPK error:", err);
        res.status(500).json({
          success: false,
          error: "Gagal menerbitkan SPK Produksi B2C: " + (err.message || "Internal error"),
        });
      }
    }
  );

  shopRouter.post(
    "/api/erp/shop-management/orders/:id/create-invoice",
    requireRole(["SALES", "FINANCE", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const requestedCategory = (req.body?.invoice_category || "").toUpperCase();
        const order = db.prepare("SELECT * FROM shop_orders WHERE id = ?").get(id) as any;
        if (!order) {
          return res.status(404).json({ success: false, error: "Order not found" });
        }

        const existingInvoices = db
          .prepare(
            `SELECT id, ci_number, dn_id, invoice_category, grand_total, dpp, ppn
             FROM commercial_invoices 
             WHERE (dn_id = ? AND dn_id IS NOT NULL)
                OR shop_order_id = ?
                OR job_description LIKE ? 
             ORDER BY created_at ASC`
          )
          .all(order.delivery_note_id || "__NONE__", order.id, `%${order.order_number}%`) as any[];

        const existingDpInv = existingInvoices.find((inv) => inv.invoice_category === "DOWN_PAYMENT");
        const existingFinalInv = existingInvoices.find(
          (inv) => inv.invoice_category === "FINAL_SETTLEMENT" || inv.invoice_category === "STANDARD"
        );

        let invoiceCategory: "STANDARD" | "DOWN_PAYMENT" | "FINAL_SETTLEMENT" = "STANDARD";
        if (requestedCategory === "DOWN_PAYMENT" || requestedCategory === "FINAL_SETTLEMENT" || requestedCategory === "STANDARD") {
          invoiceCategory = requestedCategory as any;
        } else if (Number(order.is_dp) === 1 && Number(order.dp_amount) > 0) {
          invoiceCategory = existingDpInv ? "FINAL_SETTLEMENT" : "DOWN_PAYMENT";
        }

        if (invoiceCategory === "DOWN_PAYMENT" && existingDpInv) {
          return res.json({
            success: true,
            already_exists: true,
            message: `Faktur Uang Muka (DP) ${existingDpInv.ci_number} sudah diterbitkan untuk pesanan ini.`,
            data: {
              ci_id: existingDpInv.id,
              ci_number: existingDpInv.ci_number,
              dn_id: existingDpInv.dn_id,
              invoice_category: "DOWN_PAYMENT",
            },
          });
        }

        if ((invoiceCategory === "FINAL_SETTLEMENT" || invoiceCategory === "STANDARD") && existingFinalInv) {
          return res.json({
            success: true,
            already_exists: true,
            message: `Commercial Invoice ${existingFinalInv.ci_number} sudah diterbitkan untuk pesanan ini.`,
            data: {
              ci_id: existingFinalInv.id,
              ci_number: existingFinalInv.ci_number,
              dn_id: existingFinalInv.dn_id,
              invoice_category: existingFinalInv.invoice_category,
            },
          });
        }

        const items = db.prepare("SELECT * FROM shop_order_items WHERE order_id = ?").all(id) as any[];
        const userEmail = (req.headers["x-user-email"] as string) || "FINANCE_SHOP";

        let customerId = order.customer_id || "CUS-B2C-SHOP";
        try {
          if (!order.customer_id) {
            const custMatch = db
              .prepare(
                `SELECT id FROM customers 
                 WHERE (phone = ? AND phone IS NOT NULL AND phone != '') 
                    OR (LOWER(email) = ? AND email IS NOT NULL AND email != '') 
                 LIMIT 1`
              )
              .get(order.customer_phone || "", (order.customer_email || "").toLowerCase()) as any;
            if (custMatch) {
              customerId = custMatch.id;
            } else {
              customerId = "CUS-" + Math.random().toString(36).substring(2, 9).toUpperCase();
              const prefix = (order.customer_name || "CUS")
                .slice(0, 3)
                .toUpperCase()
                .replace(/[^A-Z]/g, "CUS")
                .padEnd(3, "X");
              db.prepare(
                `INSERT INTO customers (id, code, name, contact_person, email, phone, address, customer_type, customer_segment)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'B2C', 'B2C')`
              ).run(
                customerId,
                `${prefix}-${Math.floor(100 + Math.random() * 900)}`,
                order.customer_name,
                order.customer_name,
                order.customer_email || null,
                order.customer_phone || null,
                order.delivery_address || "Storefront Customer"
              );
            }
            db.prepare("UPDATE shop_orders SET customer_id = ? WHERE id = ?").run(customerId, id);
          }
        } catch {
          db.prepare(`
            INSERT OR IGNORE INTO customers (id, name, code, contact_person, phone)
            VALUES ('CUS-B2C-SHOP', 'Pelanggan Ritel Storefront (B2C)', 'CUS-B2C', 'Pelanggan Ritel', '080000000000')
          `).run();
          customerId = "CUS-B2C-SHOP";
        }

        let dnId = order.delivery_note_id;
        let dnNumber = order.tracking_number;

        const dParts = new Date().toISOString().split("T")[0].split("-");
        const rand = Math.floor(100 + Math.random() * 900);
        const suffixPrefix = invoiceCategory === "DOWN_PAYMENT" ? "DP" : invoiceCategory === "FINAL_SETTLEMENT" ? "FIN" : "S";
        const ciId = `CI-SHOP-${Date.now()}-${rand}`;
        const ciNumber = `CI-${dParts[0]}${dParts[1]}-${suffixPrefix}${rand}`;

        const subtotalAmt = Math.round(Number(order.subtotal_amount) || Number(order.total_amount) || 0);
        const shippingAmt = Math.round(Number(order.shipping_cost) || 0);
        const fullGrandTotal = Math.round(Number(order.total_amount) || subtotalAmt + shippingAmt);
        const fullDpp = Number(order.dpp_amount) > 0 ? Math.round(Number(order.dpp_amount)) : Math.round(fullGrandTotal / 1.11);
        const fullDppNilaiLain = Number(order.dpp_nilai_lain) > 0 ? Math.round(Number(order.dpp_nilai_lain)) : Math.round((fullDpp * 11) / 12);
        const fullPpn = Math.max(0, fullGrandTotal - fullDpp);

        const isPaid = order.payment_status === "PAID" || order.payment_status === "VERIFIED";

        let targetGrandTotal = fullGrandTotal;
        let targetDpp = fullDpp;
        let targetDppNilaiLain = fullDppNilaiLain;
        let targetPpn = fullPpn;
        let dpDeductionAmount = 0;
        let parentInvoiceId: string | null = null;
        let jobDesc = `Penjualan Toko Pabrik (Shop Order #${order.order_number} - ${order.customer_name})`;

        if (invoiceCategory === "DOWN_PAYMENT") {
          targetGrandTotal = Math.round(Number(order.dp_amount) || fullGrandTotal * 0.5);
          targetDpp = Math.round(targetGrandTotal / 1.11);
          targetDppNilaiLain = Math.round((targetDpp * 11) / 12);
          targetPpn = Math.max(0, targetGrandTotal - targetDpp);
          jobDesc = `Faktur Uang Muka (DP) B2C Storefront #${order.order_number} - ${order.customer_name}`;
        } else if (invoiceCategory === "FINAL_SETTLEMENT" && existingDpInv) {
          parentInvoiceId = existingDpInv.id;
          dpDeductionAmount = Math.round(Number(existingDpInv.grand_total) || Number(order.dp_amount) || 0);
          targetGrandTotal = Math.max(0, fullGrandTotal - dpDeductionAmount);
          targetDpp = fullDpp;
          targetDppNilaiLain = fullDppNilaiLain;
          targetPpn = fullPpn;
          jobDesc = `Faktur Pelunasan Final B2C #${order.order_number} (Potong DP ${existingDpInv.ci_number})`;
        }

        db.transaction(() => {
          if (!dnId || invoiceCategory === "FINAL_SETTLEMENT") {
            dnId = `DN-SHOP-${Date.now()}-${rand}`;
            dnNumber = `DN-${dParts[0].slice(-2)}${dParts[1]}-B2C-${rand}`;

            db.prepare(`
              INSERT INTO delivery_notes (
                id, dn_number, customer_id, project_id, quotation_id, delivery_date, status,
                vehicle_plate, driver_name, shipping_address, recipient_contact, notes, created_at, delivered_at, invoiced_at
              ) VALUES (
                ?, ?, ?, ?, NULL, CURRENT_DATE, 'DELIVERED',
                'Internal Fleet', 'Factory Logistics', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
              )
            `).run(
              dnId,
              dnNumber,
              customerId,
              order.project_id || null,
              order.delivery_address || "Storefront Delivery",
              `${order.customer_name} (${order.customer_phone})`,
              `Delivery Note (${invoiceCategory}) for Shop Order ${order.order_number}`
            );

            const dnItemInsert = db.prepare(`
              INSERT INTO delivery_items (
                id, dn_id, delivery_id, item_id, item_code, item_name, uom, qty, qty_delivered, remarks, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (let i = 0; i < items.length; i++) {
              const it = items[i];
              const qty = Number(it.qty) || 1;
              dnItemInsert.run(
                `DNI-${dnId}-${i + 1}`,
                dnId,
                dnId,
                it.item_id,
                it.item_code,
                it.item_name,
                it.uom,
                qty,
                qty,
                `From B2C Order ${order.order_number}`,
                `From B2C Order ${order.order_number}`
              );

              if (
                invoiceCategory !== "DOWN_PAYMENT" &&
                order.order_status !== "DISPATCHED" &&
                order.order_status !== "COMPLETED" &&
                !order.delivery_note_id
              ) {
                db.prepare(`
                  UPDATE inventory
                  SET physical_qty = MAX(0, COALESCE(physical_qty, 0) - ?),
                      reserved_qty = MAX(0, COALESCE(reserved_qty, 0) - ?),
                      free_stock = MAX(0, COALESCE(free_stock, 0) - ?),
                      available_qty = MAX(0, COALESCE(available_qty, 0) - ?)
                  WHERE item_id = ?
                `).run(qty, qty, qty, qty, it.item_id);
              }
            }

            db.prepare(`
              UPDATE shop_orders
              SET delivery_note_id = COALESCE(delivery_note_id, ?),
                  tracking_number = COALESCE(tracking_number, ?),
                  order_status = CASE WHEN order_status = 'PENDING_PAYMENT' THEN 'PROCESSING' ELSE order_status END
              WHERE id = ?
            `).run(dnId, dnNumber, id);
          } else {
            db.prepare("UPDATE delivery_notes SET invoiced_at = CURRENT_TIMESTAMP WHERE id = ?").run(dnId);
          }

          db.prepare(`
            INSERT INTO commercial_invoices (
              id, ci_number, dn_id, customer_id, project_id, shop_order_id,
              invoice_category, parent_invoice_id, dp_deduction_amount, dpp_nilai_lain,
              amount, gross_amount, discount_rate, discount_amount, dpp, rounding_factor,
              ppn, pph, total_amount, grand_total, sales_channel,
              payment_terms, ppn_rate, pph_rate, job_description, status, amount_paid
            ) VALUES (
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?, 0, 0, ?, 0,
              ?, 0, ?, ?, 'B2C_STOREFRONT',
              'Due on Receipt', 12, 0, ?, ?, ?
            )
          `).run(
            ciId,
            ciNumber,
            dnId,
            customerId,
            order.project_id || null,
            order.id,
            invoiceCategory,
            parentInvoiceId,
            dpDeductionAmount,
            targetDppNilaiLain,
            targetDpp,
            fullGrandTotal,
            targetDpp,
            targetPpn,
            targetGrandTotal,
            targetGrandTotal,
            jobDesc,
            isPaid ? "PAID" : "ISSUED",
            isPaid ? targetGrandTotal : invoiceCategory === "DOWN_PAYMENT" ? Number(order.dp_amount) || 0 : 0
          );

          if (invoiceCategory === "DOWN_PAYMENT") {
            db.prepare("UPDATE shop_orders SET dp_invoice_id = ? WHERE id = ?").run(ciId, id);
            postDownPaymentInvoiceJournal(db, {
              ci_id: ciId,
              ci_number: ciNumber,
              dp_dpp: targetDpp,
              dp_ppn: targetPpn,
              dp_grand_total: targetGrandTotal,
              is_paid: isPaid,
              user: userEmail,
            });
          } else if (invoiceCategory === "FINAL_SETTLEMENT" && existingDpInv) {
            db.prepare("UPDATE shop_orders SET final_invoice_id = ? WHERE id = ?").run(ciId, id);
            const dpDppDeducted = Math.round(Number(existingDpInv.dpp) || dpDeductionAmount / 1.11);
            const dpPpnDeducted = Math.max(0, dpDeductionAmount - dpDppDeducted);
            postFinalSettlementInvoiceJournal(db, {
              ci_id: ciId,
              ci_number: ciNumber,
              full_dpp: fullDpp,
              full_ppn: fullPpn,
              pph: 0,
              dp_dpp_deducted: dpDppDeducted,
              dp_ppn_deducted: dpPpnDeducted,
              user: userEmail,
            });
          } else {
            db.prepare("UPDATE shop_orders SET final_invoice_id = ? WHERE id = ?").run(ciId, id);
            const existingJournal = db
              .prepare("SELECT id FROM journal_entries WHERE reference_number = ? OR reference_id = ? LIMIT 1")
              .get(order.order_number, order.id) as any;

            if (!existingJournal && targetGrandTotal > 0) {
              const jLines: any[] = [
                {
                  account_code: isPaid ? "1108" : "1102",
                  account_name: isPaid ? "Penerimaan Kas & Bank Shop (B2C)" : "Piutang Usaha Penjualan (AR)",
                  debit: targetGrandTotal,
                  credit: 0,
                  memo: `Tagihan Invoice ${ciNumber} (${order.order_number})`,
                },
                {
                  account_code: "4101",
                  account_name: "Pendapatan Usaha Penjualan Shop B2C",
                  debit: 0,
                  credit: targetDpp,
                  memo: `Pendapatan Penjualan ${ciNumber} (DPP Nilai Lain: Rp ${targetDppNilaiLain.toLocaleString("id-ID")})`,
                },
              ];
              if (targetPpn > 0) {
                jLines.push({
                  account_code: "2102",
                  account_name: "VAT / PPN Payable (Hutang Pajak Keluaran)",
                  debit: 0,
                  credit: targetPpn,
                  memo: `PPN Keluaran ${ciNumber}`,
                });
              }
              postJournalEntry(db, {
                reference_type: "COMMERCIAL_INVOICE",
                reference_id: ciId,
                reference_number: ciNumber,
                description: `Faktur Penjualan Resmi Toko Pabrik ${ciNumber} (Ref: ${order.order_number})`,
                created_by: userEmail,
                lines: jLines,
              });
            }
          }
        })();

        res.json({
          success: true,
          message:
            invoiceCategory === "DOWN_PAYMENT"
              ? `Faktur Uang Muka (DP) ${ciNumber} berhasil diterbitkan & dijurnal ke Akun Uang Muka Pelanggan (COA 2106).`
              : invoiceCategory === "FINAL_SETTLEMENT"
                ? `Faktur Pelunasan Final ${ciNumber} berhasil diterbitkan dengan pemotongan DP otomatis!`
                : `Commercial Invoice ${ciNumber} berhasil diterbitkan dan dijurnal ke modul Finance.`,
          data: {
            ci_id: ciId,
            ci_number: ciNumber,
            dn_id: dnId,
            dn_number: dnNumber,
            invoice_category: invoiceCategory,
            dp_deduction_amount: dpDeductionAmount,
          },
        });
      } catch (err: any) {
        console.error("[ERP Shop API] Create invoice error:", err);
        res.status(500).json({
          success: false,
          error: "Gagal menerbitkan Commercial Invoice: " + (err.message || "Internal error"),
        });
      }
    }
  );

  shopRouter.post(
    "/api/erp/shop-management/sync-integrity",
    requireRole(["SALES", "FINANCE", "WAREHOUSE", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const userEmail = (req.headers["x-user-email"] as string) || "SYSTEM_AUDIT";
        let syncedSkus = 0;
        let createdJournals = 0;
        let linkedDeliveries = 0;

        db.transaction(() => {
          const finishedItems = db
            .prepare(
              `SELECT id FROM items WHERE deleted_at IS NULL AND (type = 'FINISHED' OR type = 'FINISH_GOOD')`
            )
            .all() as any[];

          for (const it of finishedItems) {
            db.prepare(
              `INSERT OR IGNORE INTO inventory (item_id, physical_qty, reserved_qty, available_qty, free_stock, allocated_stock)
               VALUES (?, 0, 0, 0, 0, 0)`
            ).run(it.id);

            const info = db
              .prepare(
                `UPDATE inventory
                 SET available_qty = MAX(0, COALESCE(physical_qty, 0) - COALESCE(reserved_qty, 0)),
                     free_stock = MAX(0, COALESCE(physical_qty, 0) - COALESCE(reserved_qty, 0))
                 WHERE item_id = ?`
              )
              .run(it.id);
            syncedSkus += info.changes;
          }

          const paidOrders = db
            .prepare(`SELECT * FROM shop_orders WHERE payment_status IN ('PAID', 'VERIFIED')`)
            .all() as any[];

          for (const ord of paidOrders) {
            const hasJournal = db
              .prepare(
                `SELECT id FROM journal_entries 
                 WHERE reference_id = ? OR reference_number = ? OR description LIKE ? 
                 LIMIT 1`
              )
              .get(ord.id, ord.order_number, `%${ord.order_number}%`);

            if (!hasJournal && Number(ord.total_amount) > 0) {
              const totalAmt = Math.round(Number(ord.total_amount) || 0);
              const ppnAmt = Math.round(Number(ord.ppn_amount) || 0);
              const netRev = Math.max(0, totalAmt - ppnAmt);
              const jLines: any[] = [
                {
                  account_code: "1108",
                  account_name: "Penerimaan Kas & Bank Shop (B2C)",
                  debit: totalAmt,
                  credit: 0,
                  memo: `Rekonsiliasi Pembayaran Shop ${ord.order_number}`,
                },
                {
                  account_code: "4101",
                  account_name: "Pendapatan Usaha Penjualan Shop B2C",
                  debit: 0,
                  credit: netRev,
                  memo: `Pendapatan Penjualan Shop ${ord.order_number}`,
                },
              ];
              if (ppnAmt > 0) {
                jLines.push({
                  account_code: "2102",
                  account_name: "VAT / PPN Payable (Hutang Pajak Keluaran)",
                  debit: 0,
                  credit: ppnAmt,
                  memo: `PPN Keluaran Shop ${ord.order_number}`,
                });
              }
              try {
                postJournalEntry(db, {
                  reference_type: "COMMERCIAL_INVOICE",
                  reference_id: ord.id,
                  reference_number: ord.order_number,
                  description: `Rekonsiliasi Otomatis Omset Shop #${ord.order_number}`,
                  created_by: userEmail,
                  lines: jLines,
                });
                createdJournals++;
              } catch {
                // ignore if journal helper skips
              }
            }
          }

          const unlinkedOrders = db
            .prepare(
              `SELECT id, tracking_number FROM shop_orders 
               WHERE delivery_note_id IS NULL AND tracking_number IS NOT NULL AND tracking_number != ''`
            )
            .all() as any[];

          for (const uo of unlinkedOrders) {
            const dn = db
              .prepare(`SELECT id FROM delivery_notes WHERE dn_number = ? LIMIT 1`)
              .get(uo.tracking_number) as any;
            if (dn) {
              db.prepare(`UPDATE shop_orders SET delivery_note_id = ? WHERE id = ?`).run(dn.id, uo.id);
              linkedDeliveries++;
            }
          }
        })();

        res.json({
          success: true,
          message: `Sinkronisasi & Audit selesai: ${syncedSkus} SKU diselaraskan, ${createdJournals} jurnal direkonsiliasi, ${linkedDeliveries} DO ditautkan.`,
          data: {
            synced_skus: syncedSkus,
            reconciled_journals: createdJournals,
            linked_deliveries: linkedDeliveries,
            audited_at: new Date().toISOString(),
          },
        });
      } catch (err: any) {
        console.error("[ERP Shop API] Sync integrity error:", err);
        res.status(500).json({
          success: false,
          error: "Gagal menjalankan sinkronisasi integritas: " + err.message,
        });
      }
    }
  );

  shopRouter.get(
    "/api/erp/shop-management/catalog",
    requireRole(["SALES", "FINANCE", "WAREHOUSE", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const q = (req.query.q as string || "").trim();
        let sql = `
          SELECT 
            i.id,
            i.item_code,
            i.name,
            i.dimension,
            i.spec,
            i.category,
            i.description,
            i.uom,
            COALESCE(i.unit_price, 0) as unit_price,
            COALESCE(i.shop_promo_price, 0) as shop_promo_price,
            COALESCE(i.shop_weight_kg, 2.5) as shop_weight_kg,
            COALESCE(i.shop_image_url, '') as shop_image_url,
            COALESCE(i.shop_gallery_urls, '[]') as shop_gallery_urls,
            COALESCE(i.shop_badge, '') as shop_badge,
            COALESCE(i.shop_featured, 0) as shop_featured,
            COALESCE(i.is_published_shop, 0) as is_published_shop,
            COALESCE(i.shop_availability_type, 'AUTO') as shop_availability_type,
            COALESCE(i.shop_lead_time_days, 3) as shop_lead_time_days,
            COALESCE(i.shop_moq, 1) as shop_moq,
            COALESCE(i.shop_specs, '') as shop_specs,
            COALESCE(inv.available_qty, 0) as available_qty,
            COALESCE(inv.physical_qty, 0) as physical_qty
          FROM items i
          LEFT JOIN inventory inv ON i.id = inv.item_id
          WHERE i.deleted_at IS NULL 
            AND ((i.type IN ('FINISHED', 'FINISH_GOOD', 'FINISH_GOODS')) OR (i.item_code LIKE 'FG - %' OR i.item_code LIKE 'FG-%'))
            AND (i.type != 'MACHINE' OR i.type IS NULL) AND (i.item_code NOT LIKE 'MC - %' AND i.item_code NOT LIKE 'MC-%')
        `;
        const params: any[] = [];

        if (q) {
          sql += ` AND (i.name LIKE ? OR i.item_code LIKE ? OR i.category LIKE ?)`;
          const wildcard = `%${q}%`;
          params.push(wildcard, wildcard, wildcard);
        }

        sql += ` ORDER BY i.is_published_shop DESC, i.name ASC`;

        const rawCatalog = db.prepare(sql).all(...params) as any[];
        const catalog = rawCatalog.map((row) => {
          const media = normalizeLockedCatalogMedia(row.shop_image_url, row.shop_gallery_urls);
          return {
            ...row,
            shop_image_url: media.primaryUrl || "",
            shop_gallery_urls: media.galleryJson,
          };
        });

        res.json({
          success: true,
          data: catalog,
        });
      } catch (err: any) {
        console.error("[ERP Shop API] Catalog error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch catalog" });
      }
    }
  );

  shopRouter.put(
    "/api/erp/shop-management/catalog/:id",
    requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const {
          unit_price,
          is_published_shop,
          shop_image_url,
          shop_gallery_urls,
          shop_promo_price,
          shop_weight_kg,
          shop_badge,
          shop_featured,
          shop_availability_type,
          shop_lead_time_days,
          shop_moq,
          shop_specs,
          category,
          description,
        } = req.body;

        const item = db.prepare("SELECT * FROM items WHERE id = ?").get(id) as any;
        if (!item) {
          return res.status(404).json({ success: false, error: "Item not found" });
        }

        const hasMediaUpdate = shop_image_url !== undefined || shop_gallery_urls !== undefined;
        let nextImageUrl: string | null = item.shop_image_url ?? null;
        let nextGalleryJson: string = item.shop_gallery_urls ?? "[]";

        if (hasMediaUpdate) {
          // If only gallery is updated without specifying shop_image_url, keep existing cover locked
          const effectiveCover =
            shop_image_url !== undefined ? shop_image_url : item.shop_image_url;
          const effectiveGallery =
            shop_gallery_urls !== undefined ? shop_gallery_urls : item.shop_gallery_urls;
          const normalized = normalizeLockedCatalogMedia(effectiveCover, effectiveGallery);
          nextImageUrl = normalized.primaryUrl;
          nextGalleryJson = normalized.galleryJson;
        }

        db.prepare(`
          UPDATE items
          SET unit_price = COALESCE(?, unit_price),
              selling_price = COALESCE(?, unit_price, selling_price),
              is_published_shop = COALESCE(?, is_published_shop),
              shop_image_url = ?,
              shop_gallery_urls = ?,
              shop_promo_price = COALESCE(?, shop_promo_price),
              shop_weight_kg = COALESCE(?, shop_weight_kg),
              shop_badge = COALESCE(?, shop_badge),
              shop_featured = COALESCE(?, shop_featured),
              shop_availability_type = COALESCE(?, shop_availability_type),
              shop_lead_time_days = COALESCE(?, shop_lead_time_days),
              shop_moq = COALESCE(?, shop_moq),
              shop_specs = COALESCE(?, shop_specs),
              category = COALESCE(?, category),
              description = COALESCE(?, description)
          WHERE id = ?
        `).run(
          unit_price !== undefined ? Number(unit_price) : null,
          unit_price !== undefined ? Number(unit_price) : null,
          is_published_shop !== undefined ? (is_published_shop ? 1 : 0) : null,
          nextImageUrl,
          nextGalleryJson,
          shop_promo_price !== undefined ? Number(shop_promo_price) : null,
          shop_weight_kg !== undefined ? Number(shop_weight_kg) : null,
          shop_badge !== undefined ? shop_badge : null,
          shop_featured !== undefined ? (shop_featured ? 1 : 0) : null,
          shop_availability_type !== undefined ? shop_availability_type : null,
          shop_lead_time_days !== undefined ? Number(shop_lead_time_days) : null,
          shop_moq !== undefined ? Number(shop_moq) : null,
          shop_specs !== undefined ? shop_specs : null,
          category !== undefined ? category : null,
          description !== undefined ? description : null,
          id
        );

        const updatedRow = db.prepare("SELECT * FROM items WHERE id = ?").get(id) as any;

        // 1. Invalidate backend memory cache
        cacheService.invalidateNamespace("items");

        // 2. Push immediately to Cloud SSOT (PostgreSQL Primary) & flush WAL outbox
        scheduleImmediateWriteThrough();
        if (updatedRow) {
          void hybridDb.write("items", id, updatedRow).catch((syncErr) => {
            console.warn("[ERP Shop API] Non-fatal Cloud SSOT catalog sync note:", syncErr?.message || syncErr);
          });
        }

        // 3. Broadcast real-time update to all connected Shop & ERP clients via WebSocket
        try {
          const io = (global as any).io;
          if (io) {
            io.emit("shop:catalog_updated", {
              itemId: id,
              updatedAt: Date.now(),
              action: "CATALOG_UPDATED",
            });
          }
        } catch {}

        res.json({
          success: true,
          message: `Product ${item.name} shop configuration updated.`,
          data: updatedRow,
        });
      } catch (err: any) {
        console.error("[ERP Shop API] Catalog update error:", err);
        res.status(500).json({ success: false, error: "Failed to update catalog item" });
      }
    }
  );
}
