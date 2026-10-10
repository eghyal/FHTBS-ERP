import db from "../db/database.ts";
import { cacheService } from "../services/cacheService.ts";
import { outboxService } from "../services/outboxService.ts";
import crypto from "crypto";

export class MasterDataRepository {
  /**
   * Get all customers (Cached with LRU cache)
   */
  getCustomers(): any[] {
    const cacheKey = "customers:all";
    const cached = cacheService.get<any[]>(cacheKey);
    if (cached) return cached;

    const customers = db.prepare(`
      SELECT id, code, name, email, phone, address, tax_id, payment_terms, created_at
      FROM customers
      ORDER BY name ASC
    `).all() as any[];

    cacheService.set(cacheKey, customers, 300, "customers");
    return customers;
  }

  /**
   * Insert new customer with Outbox & Cache Invalidation
   */
  createCustomer(data: {
    code?: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_id?: string;
    payment_terms?: string;
  }, userEmail: string) {
    const id = "CUST-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const nowIso = new Date().toISOString();

    const result = db.transaction(() => {
      db.prepare(`
        INSERT INTO customers (id, code, name, email, phone, address, tax_id, payment_terms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.code || null,
        data.name,
        data.email || null,
        data.phone || null,
        data.address || null,
        data.tax_id || null,
        data.payment_terms || "Net 30",
        nowIso
      );

      outboxService.enqueue(
        db,
        "CUSTOMERS",
        id,
        "CREATE",
        { id, ...data, created_by: userEmail, created_at: nowIso },
        "BOTH"
      );

      return { id, name: data.name };
    })();

    cacheService.invalidateNamespace("customers");
    return result;
  }

  /**
   * Get all suppliers (Cached with LRU cache)
   */
  getSuppliers(): any[] {
    const cacheKey = "suppliers:all";
    const cached = cacheService.get<any[]>(cacheKey);
    if (cached) return cached;

    const suppliers = db.prepare(`
      SELECT id, code, name, contact_person, email, phone, address, tax_id, tax_scheme, ppn_rate, payment_terms, created_at
      FROM suppliers
      ORDER BY name ASC
    `).all() as any[];

    cacheService.set(cacheKey, suppliers, 300, "suppliers");
    return suppliers;
  }

  /**
   * Insert new supplier with Outbox & Cache Invalidation
   */
  createSupplier(data: {
    code?: string;
    name: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_id?: string;
    tax_scheme?: string;
    ppn_rate?: number;
    payment_terms?: string;
  }, userEmail: string) {
    const id = "SUP-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const nowIso = new Date().toISOString();

    const result = db.transaction(() => {
      db.prepare(`
        INSERT INTO suppliers (
          id, code, name, contact_person, email, phone, address, tax_id, tax_scheme, ppn_rate, payment_terms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.code || null,
        data.name,
        data.contact_person || null,
        data.email || null,
        data.phone || null,
        data.address || null,
        data.tax_id || null,
        data.tax_scheme || "DPP_NILAI_LAIN",
        data.ppn_rate || 0.12,
        data.payment_terms || "Net 30",
        nowIso
      );

      outboxService.enqueue(
        db,
        "SUPPLIERS",
        id,
        "CREATE",
        { id, ...data, created_by: userEmail, created_at: nowIso },
        "BOTH"
      );

      return { id, name: data.name };
    })();

    cacheService.invalidateNamespace("suppliers");
    return result;
  }
}

export const masterDataRepository = new MasterDataRepository();
