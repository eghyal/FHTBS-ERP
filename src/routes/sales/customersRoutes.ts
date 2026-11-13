import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { cacheService } from "../../services/cacheService.ts";
import { outboxService } from "../../services/outboxService.ts";
import {
  getNextEntitySequence,
  generateSmartCustomerCode,
} from "../../utils/autoCoding.ts";
import crypto from "crypto";

export function registerCustomersRoutes(salesRouter: Router) {
  salesRouter.get(
    ["/api/sales/customers", "/api/customers"],
    requireRole(["WAREHOUSE", "FC", "SALES", "FINANCE", "ENGINEERING"]),
    (req, res) => {
      try {
        const cacheKey = "customers:overview_list";
        const cached = cacheService.get<any[]>(cacheKey);
        if (cached) {
          return res.json(cached);
        }

        const customers = db
          .prepare(
            `
      SELECT c.*,
        COALESCE(c.customer_segment, c.customer_type, 'B2B') as customer_segment,
        COALESCE(c.credit_limit, 0) as credit_limit,
        COALESCE(c.payment_terms_days, 30) as payment_terms_days,
        (SELECT COUNT(*) FROM delivery_notes dn WHERE dn.customer_id = c.id) as total_deliveries,
        (SELECT COUNT(*) FROM delivery_notes dn WHERE dn.customer_id = c.id AND dn.status = 'DELIVERED') as delivered_count,
        (SELECT COUNT(*) FROM delivery_notes dn WHERE dn.customer_id = c.id AND dn.status != 'DELIVERED') as pending_count,
        (SELECT COUNT(*) FROM quotations q WHERE q.archived_at IS NULL AND q.customer_id = c.id) as total_quotations,
        (SELECT COALESCE(SUM((SELECT COALESCE(SUM(qty * unit_price), 0) * (1 - COALESCE(q.discount_rate, 0) / 100) FROM quotation_items qi WHERE qi.quotation_id = q.id)), 0) FROM quotations q WHERE q.archived_at IS NULL AND q.customer_id = c.id AND q.status = 'APPROVED') as total_quotation_value,
        (SELECT COUNT(*) FROM quotations q WHERE q.archived_at IS NULL AND q.customer_id = c.id AND q.status = 'PENDING') as pending_quotations_count,
        (SELECT COALESCE(SUM(MAX(0, COALESCE(ci.grand_total, ci.total_amount, ci.amount, 0) - COALESCE(ci.amount_paid, 0))), 0)
         FROM commercial_invoices ci
         WHERE ci.customer_id = c.id AND ci.status != 'PAID' AND ci.payment_status != 'PAID') as active_ar_exposure,
        (SELECT COUNT(*) FROM shop_orders so WHERE so.customer_id = c.id OR (so.customer_phone = c.phone AND c.phone IS NOT NULL AND c.phone != '')) as b2c_orders_count,
        (SELECT COALESCE(SUM(so.total_amount), 0) FROM shop_orders so WHERE (so.customer_id = c.id OR (so.customer_phone = c.phone AND c.phone IS NOT NULL AND c.phone != '')) AND so.order_status != 'CANCELLED') as b2c_total_spent
      FROM customers c WHERE c.archived_at IS NULL
      ORDER BY c.created_at DESC
    `,
          )
          .all();

        cacheService.set(cacheKey, customers, 180, "customers");
        res.json(customers);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch customers" });
      }
    },
  );

  salesRouter.get(
    "/api/sales/customers/:id/details",
    requireRole(["WAREHOUSE", "FC", "SALES", "FINANCE", "ENGINEERING"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const customer = db
          .prepare("SELECT * FROM customers WHERE id = ? AND archived_at IS NULL")
          .get(id) as any;

        if (!customer) {
          return res.status(404).json({ error: "Customer not found" });
        }

        const quotations = db
          .prepare(
            `SELECT q.*, c.name as customer_name 
             FROM quotations q 
             LEFT JOIN customers c ON q.customer_id = c.id 
             WHERE q.archived_at IS NULL AND q.customer_id = ?
             ORDER BY q.created_at DESC`
          )
          .all(id) as any[];

        const processedQuotations = quotations.map((q) => {
          q.items = db
            .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
            .all(q.id);
          return q;
        });

        const deliveries = db
          .prepare(
            `SELECT * FROM delivery_notes WHERE customer_id = ? ORDER BY created_at DESC`
          )
          .all(id);

        const invoices = db
          .prepare(
            `SELECT * FROM commercial_invoices WHERE customer_id = ? ORDER BY created_at DESC`
          )
          .all(id) as any[];

        const projects = db
          .prepare(
            `SELECT DISTINCT p.* FROM projects p 
             LEFT JOIN quotations q ON p.quotation_id = q.id
             LEFT JOIN shop_orders so ON so.project_id = p.id
             WHERE q.customer_id = ? OR so.customer_id = ?
             ORDER BY p.created_at DESC`
          )
          .all(id, id);

        const shopOrders = db
          .prepare(
            `SELECT * FROM shop_orders
             WHERE customer_id = ?
                OR (customer_phone = ? AND ? IS NOT NULL AND ? != '')
                OR (LOWER(customer_email) = LOWER(?) AND ? IS NOT NULL AND ? != '')
             ORDER BY created_at DESC`
          )
          .all(
            id,
            customer.phone || "",
            customer.phone || null,
            customer.phone || "",
            customer.email || "",
            customer.email || null,
            customer.email || ""
          );

        const activeArExposure = invoices
          .filter((inv) => inv.status !== "PAID" && inv.payment_status !== "PAID")
          .reduce(
            (acc, inv) =>
              acc +
              Math.max(
                0,
                Number(inv.grand_total || inv.total_amount || inv.amount || 0) -
                  Number(inv.amount_paid || 0)
              ),
            0
          );

        res.json({
          success: true,
          customer: {
            ...customer,
            customer_segment: customer.customer_segment || customer.customer_type || "B2B",
            credit_limit: Number(customer.credit_limit) || 0,
            payment_terms_days: Number(customer.payment_terms_days) || 30,
            active_ar_exposure: activeArExposure,
          },
          quotations: processedQuotations,
          deliveries,
          invoices,
          projects,
          shop_orders: shopOrders,
        });
      } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch customer details", details: err.message });
      }
    }
  );

  salesRouter.get(
    "/api/sales/customers/:id/credit-check",
    requireRole(["WAREHOUSE", "FC", "SALES", "FINANCE", "ENGINEERING", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const additionalAmount = Number(req.query.amount) || 0;
        const customer = db
          .prepare("SELECT * FROM customers WHERE id = ? AND archived_at IS NULL")
          .get(id) as any;

        if (!customer) {
          return res.status(404).json({ error: "Customer not found" });
        }

        const creditLimit = Number(customer.credit_limit) || 0;
        const termsDays = Number(customer.payment_terms_days) || 30;

        const unpaidInvoices = db
          .prepare(
            `SELECT id, ci_number, created_at, grand_total, total_amount, amount, amount_paid
             FROM commercial_invoices
             WHERE customer_id = ? AND status != 'PAID' AND payment_status != 'PAID'`
          )
          .all(id) as any[];

        let activeArExposure = 0;
        let overdueArAmount = 0;
        let overdueInvoicesCount = 0;
        const nowMs = Date.now();

        for (const inv of unpaidInvoices) {
          const totalVal = Number(inv.grand_total || inv.total_amount || inv.amount || 0);
          const paidVal = Number(inv.amount_paid || 0);
          const balance = Math.max(0, totalVal - paidVal);
          activeArExposure += balance;

          const createdMs = new Date(inv.created_at || Date.now()).getTime();
          const ageDays = Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24));
          if (ageDays > termsDays && balance > 0) {
            overdueArAmount += balance;
            overdueInvoicesCount++;
          }
        }

        const projectedExposure = activeArExposure + additionalAmount;
        const isOverLimit = creditLimit > 0 && projectedExposure > creditLimit;
        const hasOverdueAr = overdueInvoicesCount > 0;
        const status = isOverLimit || hasOverdueAr ? "CREDIT_HOLD" : "HEALTHY";

        res.json({
          success: true,
          data: {
            customer_id: id,
            customer_name: customer.name,
            customer_segment: customer.customer_segment || "B2B",
            credit_limit: creditLimit,
            payment_terms_days: termsDays,
            active_ar_exposure: activeArExposure,
            additional_order_amount: additionalAmount,
            projected_exposure: projectedExposure,
            remaining_credit: creditLimit > 0 ? Math.max(0, creditLimit - activeArExposure) : null,
            utilization_pct: creditLimit > 0 ? Math.round((projectedExposure / creditLimit) * 100) : 0,
            overdue_ar_amount: overdueArAmount,
            overdue_invoices_count: overdueInvoicesCount,
            is_over_limit: isOverLimit,
            has_overdue_ar: hasOverdueAr,
            credit_status: status,
          },
        });
      } catch (err: any) {
        console.error("[Credit Check API] Error:", err);
        res.status(500).json({ error: "Failed to evaluate customer credit limit" });
      }
    }
  );

  salesRouter.get(
    "/api/sales/customers/:id/quotations",
    requireRole(["WAREHOUSE", "FC", "SALES", "FINANCE", "ENGINEERING"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const quotations = db
          .prepare(
            `SELECT q.*, c.name as customer_name 
             FROM quotations q 
             LEFT JOIN customers c ON q.customer_id = c.id 
             WHERE q.archived_at IS NULL AND q.customer_id = ?
             ORDER BY q.created_at DESC`
          )
          .all(id) as any[];

        const processedQuotations = quotations.map((q) => {
          q.items = db
            .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
            .all(q.id);
          return q;
        });

        res.json({ success: true, data: processedQuotations });
      } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch customer quotations", details: err.message });
      }
    }
  );

  salesRouter.post(
    ["/api/sales/customers", "/api/customers"],
    requireRole(["FC", "SALES"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      if (
        userRole !== "FC" &&
        (userRole !== "SALES" || userLevel !== "MANAGER")
      ) {
        return res
          .status(403)
          .json({
            error:
              "Access denied. Only FC or Sales Manager can manage customers.",
          });
      }
      try {
        const {
          name,
          contact_person,
          email,
          phone,
          address,
          npwp,
          customer_segment = "B2B",
          credit_limit = 0,
          payment_terms_days = 30,
        } = req.body;
        const id = "CUS-" + crypto.randomUUID();
        const existingCusts = db
          .prepare("SELECT code FROM customers WHERE archived_at IS NULL")
          .all() as any[];
        let seq = getNextEntitySequence("CUS", existingCusts);
        let finalCode = generateSmartCustomerCode(name || "CUSTOMER", seq);
        while (
          db.prepare("SELECT id FROM customers WHERE code = ? COLLATE NOCASE").get(finalCode)
        ) {
          seq++;
          finalCode = generateSmartCustomerCode(name || "CUSTOMER", seq);
        }

        db.prepare(
          `INSERT INTO customers (
             id, code, name, contact_person, email, phone, address, npwp,
             customer_type, customer_segment, credit_limit, payment_terms_days
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          finalCode,
          name,
          contact_person || null,
          email || null,
          phone || null,
          address || null,
          npwp || null,
          customer_segment || "B2B",
          customer_segment || "B2B",
          Number(credit_limit) || 0,
          Number(payment_terms_days) || 30,
        );

        cacheService.invalidateNamespace("customers");
        outboxService.enqueue(
          db,
          "CUSTOMERS",
          id,
          "CREATE",
          {
            id,
            code: finalCode,
            name,
            contact_person,
            email,
            phone,
            address,
            customer_segment: customer_segment || "B2B",
            credit_limit: Number(credit_limit) || 0,
            payment_terms_days: Number(payment_terms_days) || 30,
            created_at: new Date().toISOString(),
          },
          "BOTH"
        );

        res.json({ success: true, id, code: finalCode });
      } catch (err: any) {
        if (err.message?.includes("UNIQUE")) {
          return res
            .status(400)
            .json({ error: "Customer code must be unique" });
        }
        res.status(500).json({ error: "Failed to create customer" });
      }
    },
  );

  salesRouter.put(
    "/api/sales/customers/:id",
    requireRole(["FC", "SALES"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      if (
        userRole !== "FC" &&
        (userRole !== "SALES" || userLevel !== "MANAGER")
      ) {
        return res
          .status(403)
          .json({
            error:
              "Access denied. Only FC or Sales Manager can manage customers.",
          });
      }
      try {
        const { id } = req.params;
        const {
          code,
          name,
          contact_person,
          email,
          phone,
          address,
          npwp,
          customer_segment,
          credit_limit,
          payment_terms_days,
        } = req.body;
        db.prepare(
          `UPDATE customers
           SET code = ?,
               name = ?,
               contact_person = ?,
               email = ?,
               phone = ?,
               address = ?,
               npwp = ?,
               customer_segment = COALESCE(?, customer_segment),
               credit_limit = COALESCE(?, credit_limit),
               payment_terms_days = COALESCE(?, payment_terms_days)
           WHERE id = ?`,
        ).run(
          code,
          name,
          contact_person || null,
          email || null,
          phone || null,
          address || null,
          npwp || null,
          customer_segment !== undefined ? customer_segment : null,
          credit_limit !== undefined ? Number(credit_limit) : null,
          payment_terms_days !== undefined ? Number(payment_terms_days) : null,
          id,
        );
        cacheService.invalidateNamespace("customers");
        res.json({ success: true });
      } catch (err: any) {
        if (err.message?.includes("UNIQUE")) {
          return res
            .status(400)
            .json({ error: "Customer code must be unique" });
        }
        res.status(500).json({ error: "Failed to update customer" });
      }
    },
  );

  salesRouter.delete(
    "/api/sales/customers/:id",
    requireRole(["FC", "SALES"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      if (
        userRole !== "FC" &&
        (userRole !== "SALES" || userLevel !== "MANAGER")
      ) {
        return res
          .status(403)
          .json({
            error:
              "Access denied. Only FC or Sales Manager can manage customers.",
          });
      }
      try {
        const { id } = req.params;

        const dnCount = db
          .prepare(
            "SELECT COUNT(*) as count FROM delivery_notes WHERE customer_id = ?",
          )
          .get(id) as any;
        if (dnCount && dnCount.count > 0) {
          return res.status(400).json({
            error: "Cannot delete customer. Active delivery records exist.",
          });
        }

        const quoCount = db
          .prepare(
            "SELECT COUNT(*) as count FROM quotations WHERE customer_id = ?",
          )
          .get(id) as any;
        if (quoCount && quoCount.count > 0) {
          return res.status(400).json({
            error: "Cannot delete customer. Active quotation records exist.",
          });
        }

        const invCount = db
          .prepare(
            "SELECT COUNT(*) as count FROM commercial_invoices WHERE customer_id = ?",
          )
          .get(id) as any;
        if (invCount && invCount.count > 0) {
          return res.status(400).json({
            error:
              "Cannot delete customer. Active commercial invoices exist.",
          });
        }

        db.prepare(
          "UPDATE customers SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);
        cacheService.invalidateNamespace("customers");
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete customer" });
      }
    },
  );
}
