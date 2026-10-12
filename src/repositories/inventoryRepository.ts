import db from "../db/database.ts";
import { outboxService } from "../services/outboxService.ts";
import { cacheService } from "../services/cacheService.ts";
import crypto from "crypto";

export interface StockAdjustmentDto {
  item_id: string;
  warehouse_id?: string;
  adjustment_type: "INCREASE" | "DECREASE" | "SET";
  quantity: number;
  reason: string;
  cost_per_unit?: number;
}

export interface StockTransferDto {
  item_id: string;
  source_warehouse_id: string;
  target_warehouse_id: string;
  quantity: number;
  notes?: string;
}

export class InventoryRepository {
  /**
   * Get list of items with cached master data support
   */
  getItems(filter: { search?: string; type?: string; limit?: number }) {
    // If no specific search filter is provided, use cache
    const isGenericQuery = !filter.search && (!filter.type || filter.type === "ALL");
    const cacheKey = `items:generic_list_${filter.limit || 500}`;

    if (isGenericQuery) {
      const cached = cacheService.get<any[]>(cacheKey);
      if (cached) return cached;
    }

    let query = `
      SELECT
        i.id,
        i.item_code,
        i.name,
        i.dimension,
        i.spec,
        i.type,
        i.uom,
        i.unit_price,
        i.lead_time_days,
        COALESCE(inv.free_stock, 0) as free_stock,
        COALESCE(inv.allocated_stock, 0) as allocated_stock,
        (COALESCE(inv.free_stock, 0) + COALESCE(inv.allocated_stock, 0)) as total_stock
      FROM items i
      LEFT JOIN inventory inv ON i.id = inv.item_id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filter.type && filter.type !== "ALL") {
      query += " AND i.type = ?";
      params.push(filter.type);
    }

    if (filter.search && filter.search.trim()) {
      const s = `%${filter.search.trim()}%`;
      query += " AND (i.item_code LIKE ? OR i.name LIKE ?)";
      params.push(s, s);
    }

    query += ` ORDER BY i.name ASC LIMIT ${Math.min(filter.limit || 500, 1000)}`;

    const items = db.prepare(query).all(...params) as any[];

    if (isGenericQuery) {
      cacheService.set(cacheKey, items, 180, "items");
    }

    return items;
  }

  /**
   * Insert new Inventory Item with Transactional Outbox and Cache Invalidation
   */
  createItem(item: {
    item_code: string;
    name: string;
    type?: string;
    uom?: string;
    dimension?: string | null;
    spec?: string | null;
    unit_price?: number;
    lead_time_days?: number;
    initial_stock?: number;
  }) {
    const existing = db.prepare("SELECT id FROM items WHERE item_code = ?").get(item.item_code);
    if (existing) {
      throw new Error(`Item code ${item.item_code} already exists.`);
    }

    const id = "ITM-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const nowIso = new Date().toISOString();

    const result = db.transaction(() => {
      // 1. Insert Item
      db.prepare(`
        INSERT INTO items (
          id, item_code, name, dimension, spec, type, uom, unit_price, lead_time_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        item.item_code,
        item.name,
        item.dimension || null,
        item.spec || null,
        item.type || "RAW",
        item.uom || "PCS",
        item.unit_price || 0,
        item.lead_time_days || 0
      );

      // 2. Insert Inventory baseline
      const initialStock = Math.max(0, item.initial_stock || 0);
      db.prepare(`
        INSERT INTO inventory (item_id, free_stock, allocated_stock)
        VALUES (?, ?, 0)
      `).run(id, initialStock);

      // 3. Outbox Event
      outboxService.enqueue(
        db,
        "INVENTORY_ITEMS",
        id,
        "CREATE",
        {
          id,
          item_code: item.item_code,
          name: item.name,
          type: item.type || "RAW",
          uom: item.uom || "PCS",
          unit_price: item.unit_price || 0,
          created_at: nowIso,
        },
        "BOTH"
      );

      return { id, item_code: item.item_code, name: item.name };
    })();

    // Invalidate Items Cache
    cacheService.invalidateNamespace("items");

    return result;
  }

  /**
   * Atomic stock adjustment with ledger recording and outbox event
   */
  adjustStock(dto: StockAdjustmentDto, userEmail: string) {
    const item = db.prepare("SELECT id, name, item_code FROM items WHERE id = ?").get(dto.item_id) as any;
    if (!item) {
      throw new Error("Item tidak ditemukan.");
    }

    const nowIso = new Date().toISOString();
    const ledgerId = "STK-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    const result = db.transaction(() => {
      const currentInv = (db.prepare("SELECT free_stock, allocated_stock FROM inventory WHERE item_id = ?").get(dto.item_id) as any) || {
        free_stock: 0,
        allocated_stock: 0,
      };

      let newFreeStock = currentInv.free_stock;
      let qtyDelta = 0;

      if (dto.adjustment_type === "INCREASE") {
        qtyDelta = dto.quantity;
        newFreeStock += dto.quantity;
      } else if (dto.adjustment_type === "DECREASE") {
        if (currentInv.free_stock < dto.quantity) {
          throw new Error(`Stok tidak mencukupi untuk pengurangan. Stok tersedia: ${currentInv.free_stock}`);
        }
        qtyDelta = -dto.quantity;
        newFreeStock -= dto.quantity;
      } else if (dto.adjustment_type === "SET") {
        qtyDelta = dto.quantity - currentInv.free_stock;
        newFreeStock = dto.quantity;
      }

      // 1. Update inventory
      db.prepare(`
        INSERT INTO inventory (item_id, free_stock, allocated_stock, physical_qty, available_qty)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(item_id) DO UPDATE SET
          free_stock = ?,
          physical_qty = ?,
          available_qty = ?
      `).run(
        dto.item_id,
        newFreeStock,
        currentInv.allocated_stock,
        newFreeStock + currentInv.allocated_stock,
        newFreeStock,
        newFreeStock,
        newFreeStock + currentInv.allocated_stock,
        newFreeStock
      );

      // 1b. Synchronize items.stock_quantity (K1 fix)
      db.prepare("UPDATE items SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
        newFreeStock,
        dto.item_id
      );

      // 2. Insert into stock_ledger / stock_movements
      try {
        db.prepare(`
          INSERT INTO stock_ledger (
            id, item_id, warehouse_id, movement_type, qty, unit_cost, notes, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          ledgerId,
          dto.item_id,
          dto.warehouse_id || "MAIN",
          "ADJUSTMENT_" + dto.adjustment_type,
          qtyDelta,
          dto.cost_per_unit || 0,
          dto.reason,
          userEmail,
          nowIso
        );
      } catch (e) {
        // Table might be stock_movements
        try {
          db.prepare(`
            INSERT INTO stock_movements (
              id, item_id, type, qty, reference_id, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            ledgerId,
            dto.item_id,
            "ADJUSTMENT",
            qtyDelta,
            "ADJUST",
            dto.reason,
            nowIso
          );
        } catch (e2) {}
      }

      // 3. Outbox Event
      outboxService.enqueue(
        db,
        "INVENTORY_STOCK",
        dto.item_id,
        "UPDATE",
        {
          item_id: dto.item_id,
          free_stock: newFreeStock,
          allocated_stock: currentInv.allocated_stock,
          delta: qtyDelta,
          reason: dto.reason,
          updated_by: userEmail,
          updated_at: nowIso,
        },
        "BOTH"
      );

      return {
        item_id: dto.item_id,
        item_name: item.name,
        previous_stock: currentInv.free_stock,
        new_stock: newFreeStock,
        delta: qtyDelta,
      };
    })();

    // Invalidate items cache
    cacheService.invalidateNamespace("items");

    return result;
  }

  /**
   * Atomic warehouse stock transfer with transactional outbox
   */
  transferStock(dto: StockTransferDto, userEmail: string) {
    const item = db.prepare("SELECT id, name, item_code FROM items WHERE id = ?").get(dto.item_id) as any;
    if (!item) {
      throw new Error("Item tidak ditemukan.");
    }

    if (dto.source_warehouse_id === dto.target_warehouse_id) {
      throw new Error("Gudang tujuan tidak boleh sama dengan gudang asal.");
    }

    const nowIso = new Date().toISOString();
    const transferId = "TRF-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    const result = db.transaction(() => {
      // Ensure warehouse_stock table exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS warehouse_stock (
          warehouse_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          quantity REAL DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (warehouse_id, item_id)
        );
      `);

      const currentInv = (db.prepare("SELECT free_stock, allocated_stock FROM inventory WHERE item_id = ?").get(dto.item_id) as any) || {
        free_stock: 0,
        allocated_stock: 0,
      };

      // Check warehouse-specific stock if recorded, fallback to overall free_stock
      const sourceStock = db
        .prepare("SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND item_id = ?")
        .get(dto.source_warehouse_id, dto.item_id) as any;

      const availableInSource = sourceStock ? Number(sourceStock.quantity) : Number(currentInv.free_stock);

      if (availableInSource < dto.quantity && currentInv.free_stock < dto.quantity) {
        throw new Error(
          `Stok di gudang asal [${dto.source_warehouse_id}] tidak mencukupi untuk transfer. Stok tersedia: ${availableInSource}`
        );
      }

      // 1. Deduct from source warehouse
      db.prepare(`
        INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(warehouse_id, item_id) DO UPDATE SET
          quantity = warehouse_stock.quantity - excluded.quantity,
          updated_at = CURRENT_TIMESTAMP
      `).run(dto.source_warehouse_id, dto.item_id, dto.quantity);

      // 2. Add to target warehouse
      db.prepare(`
        INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(warehouse_id, item_id) DO UPDATE SET
          quantity = warehouse_stock.quantity + excluded.quantity,
          updated_at = CURRENT_TIMESTAMP
      `).run(dto.target_warehouse_id, dto.item_id, dto.quantity);

      // 3. Record transfer in stock_movements
      try {
        db.prepare(`
          INSERT INTO stock_movements (
            id, item_id, type, qty, reference_id, recorded_by, created_at
          ) VALUES (?, ?, 'TRANSFER', ?, ?, ?, ?)
        `).run(
          transferId,
          dto.item_id,
          dto.quantity,
          `${dto.source_warehouse_id}->${dto.target_warehouse_id}`,
          userEmail,
          nowIso
        );
      } catch (e) {
        // Fallback for schema variants
        try {
          db.prepare(`
            INSERT INTO stock_ledger (
              id, item_id, warehouse_id, movement_type, qty, unit_cost, notes, created_by, created_at
            ) VALUES (?, ?, ?, 'TRANSFER', ?, 0, ?, ?, ?)
          `).run(
            transferId,
            dto.item_id,
            dto.target_warehouse_id,
            dto.quantity,
            `From ${dto.source_warehouse_id}: ${dto.notes || ""}`,
            userEmail,
            nowIso
          );
        } catch (e2) {}
      }

      // Outbox Event
      outboxService.enqueue(
        db,
        "INVENTORY_TRANSFER",
        transferId,
        "CREATE",
        {
          transfer_id: transferId,
          item_id: dto.item_id,
          item_name: item.name,
          source_warehouse: dto.source_warehouse_id,
          target_warehouse: dto.target_warehouse_id,
          quantity: dto.quantity,
          transferred_by: userEmail,
          transferred_at: nowIso,
        },
        "BOTH"
      );

      return {
        transfer_id: transferId,
        item_id: dto.item_id,
        item_name: item.name,
        source_warehouse_id: dto.source_warehouse_id,
        target_warehouse_id: dto.target_warehouse_id,
        quantity: dto.quantity,
      };
    })();

    cacheService.invalidateNamespace("items");
    return result;
  }
}

export const inventoryRepository = new InventoryRepository();
