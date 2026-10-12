import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import db from "../db/database.ts";
import { requireAuth, requireRole, populateUserSession, AuthenticatedRequest, JWT_SECRET } from "../middleware/auth.ts";
import { IdempotencyGuard } from "../lib/idempotency.ts";
import { inventoryRepository } from "../repositories/inventoryRepository.ts";
import { executeTransactionalSalesOrder } from "../services/transactionalSalesService.ts";
import { outboxService } from "../services/outboxService.ts";

console.log("\n=======================================================");
console.log("    PRD AUDIT FINDINGS VERIFICATION TEST SUITE (K1-K5)  ");
console.log("=======================================================\n");

// -------------------------------------------------------------------
// TEST K3: DEACTIVATED / NON-APPROVED USER CANNOT AUTHENTICATE
// -------------------------------------------------------------------
console.log("[TEST K3] Verifying no ghost session for non-approved users...");
{
  const testGhostUsername = "test_ghost_" + Date.now();
  // Ensure user is in DB as PENDING or not in DB
  const token = jwt.sign(
    { id: "ghost-id-999", username: testGhostUsername, role: "ADMIN", level: "STAFF" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const req: any = {
    headers: { authorization: `Bearer ${token}` },
    cookies: {},
  };
  const res: any = {};
  let nextCalled = false;
  populateUserSession(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user, undefined, "Non-approved / non-existent user must not be populated as user session");
  assert.equal(req.userId, undefined, "req.userId must remain undefined for unverified accounts");
  console.log("  ✓ K3 Passed: Ghost session without DB approval is strictly rejected.");
}

// -------------------------------------------------------------------
// TEST K4: NO USERNAME HARDCODED BACKDOOR
// -------------------------------------------------------------------
console.log("[TEST K4] Verifying RBAC backdoor removal...");
{
  const guard = requireRole(["PURCHASING"]);

  // User with username 'ludy' or 'eghy' but standard STAFF level and non-executive role
  const backdoorCandidate: any = {
    userId: "USR-test-1",
    username: "eghy",
    userRole: "OPERATOR",
    userLevel: "STAFF",
  };

  let denied = false;
  const mockRes: any = {
    status: (code: number) => {
      if (code === 403) denied = true;
      return { json: () => {} };
    },
  };

  guard(backdoorCandidate, mockRes, () => {});
  assert.equal(denied, true, "Username 'eghy' without SUPER_ADMIN level or permitted role must be denied 403");

  // Legitimate SUPER_ADMIN level or GOD_MODE role passes
  let superAdminPassed = false;
  const superAdminReq: any = {
    userId: "USR-super-1",
    username: "super_operator",
    userRole: "GOD_MODE",
    userLevel: "SUPER_ADMIN",
  };
  guard(superAdminReq, mockRes, () => {
    superAdminPassed = true;
  });
  assert.equal(superAdminPassed, true, "SUPER_ADMIN / GOD_MODE role must be authorized");
  console.log("  ✓ K4 Passed: Hardcoded username backdoors removed; RBAC & God Mode properly enforced.");
}

// -------------------------------------------------------------------
// TEST T1 & T2: IDEMPOTENCY GUARD ACQUIRE & RELEASE
// -------------------------------------------------------------------
console.log("[TEST T1 & T2] Verifying Idempotency inFlight locking...");
{
  const testKey = "idemp_test_" + Date.now();
  assert.equal(IdempotencyGuard.acquire(testKey), true, "First acquire must succeed");
  assert.equal(IdempotencyGuard.acquire(testKey), false, "Parallel acquire for same key must be rejected");
  assert.equal(IdempotencyGuard.isInFlight(testKey), true, "Key must report in-flight");

  IdempotencyGuard.release(testKey);
  assert.equal(IdempotencyGuard.isInFlight(testKey), false, "Key must no longer be in-flight after release");
  assert.equal(IdempotencyGuard.acquire(testKey), true, "Key can be acquired again after release");
  IdempotencyGuard.release(testKey);
  console.log("  ✓ T1 & T2 Passed: InFlight locking acquire/release operates correctly.");
}

// -------------------------------------------------------------------
// TEST K1: ATOMIC STOCK SYNCHRONIZATION
// -------------------------------------------------------------------
console.log("[TEST K1] Verifying atomic stock sync (items.stock_quantity vs inventory.free_stock)...");
{
  const testItemId = "ITEM_SYNC_" + Date.now();
  const testItemCode = "SYNC_" + Date.now();
  db.prepare(`
    INSERT INTO items (id, name, item_code, stock_quantity, unit_price, uom, type)
    VALUES (?, 'Batako Sync Test', ?, 100, 5000, 'pcs', 'FINISHED')
  `).run(testItemId, testItemCode);

  db.prepare(`
    INSERT INTO inventory (item_id, physical_qty, available_qty, free_stock, allocated_stock)
    VALUES (?, 100, 100, 100, 0)
  `).run(testItemId);

  // Execute Sales Order for 15 units
  const orderResult = executeTransactionalSalesOrder({
    customerId: "CUST-TEST-1",
    items: [{ itemId: testItemId, quantity: 15, unitPrice: 5000 }],
    userId: "TEST_CASHIER",
  });

  assert.equal(orderResult.status, "CONFIRMED");

  // Verify BOTH tables were atomically deducted to 85
  const itemAfter = db.prepare("SELECT stock_quantity FROM items WHERE id = ?").get(testItemId) as any;
  const invAfter = db.prepare("SELECT free_stock, physical_qty, available_qty FROM inventory WHERE item_id = ?").get(testItemId) as any;

  assert.equal(Number(itemAfter.stock_quantity), 85, "items.stock_quantity must be 85");
  assert.equal(Number(invAfter.free_stock), 85, "inventory.free_stock must be 85");
  assert.equal(Number(invAfter.available_qty), 85, "inventory.available_qty must be 85");

  // Now adjust stock via inventoryRepository.adjustStock
  inventoryRepository.adjustStock(
    {
      item_id: testItemId,
      adjustment_type: "SET",
      quantity: 120,
      reason: "Stock Opname physical verification",
    },
    "auditor@pavingjoss.com"
  );

  const itemAfterAdj = db.prepare("SELECT stock_quantity FROM items WHERE id = ?").get(testItemId) as any;
  const invAfterAdj = db.prepare("SELECT free_stock FROM inventory WHERE item_id = ?").get(testItemId) as any;

  assert.equal(Number(itemAfterAdj.stock_quantity), 120, "items.stock_quantity must update to 120 on adjustStock");
  assert.equal(Number(invAfterAdj.free_stock), 120, "inventory.free_stock must update to 120 on adjustStock");
  console.log("  ✓ K1 Passed: Dual-model stock conflict resolved; items and inventory stay 100% in sync.");
}

// -------------------------------------------------------------------
// TEST K2: REAL WAREHOUSE STOCK TRANSFER
// -------------------------------------------------------------------
console.log("[TEST K2] Verifying real warehouse stock transfer mutations...");
{
  const trfItemId = "ITEM_TRF_" + Date.now();
  const trfItemCode = "TRF_" + Date.now();
  db.prepare(`
    INSERT INTO items (id, name, item_code, stock_quantity, unit_price, uom, type)
    VALUES (?, 'Paving Transfer Test', ?, 50, 4000, 'pcs', 'FINISHED')
  `).run(trfItemId, trfItemCode);

  db.prepare(`
    INSERT INTO inventory (item_id, physical_qty, available_qty, free_stock, allocated_stock)
    VALUES (?, 50, 50, 50, 0)
  `).run(trfItemId);

  // Initialize source warehouse stock at 50
  db.prepare(`
    INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, updated_at)
    VALUES ('WH_CENTRAL', ?, 50, CURRENT_TIMESTAMP)
  `).run(trfItemId);

  // Execute transfer of 20 units from WH_CENTRAL to WH_BRANCH_EAST
  const trfResult = inventoryRepository.transferStock(
    {
      item_id: trfItemId,
      source_warehouse_id: "WH_CENTRAL",
      target_warehouse_id: "WH_BRANCH_EAST",
      quantity: 20,
      notes: "Dispatch to East Branch Yard",
    },
    "logistics@pavingjoss.com"
  );

  assert.equal(trfResult.quantity, 20);

  // Check warehouse_stock records
  const sourceWh = db.prepare("SELECT quantity FROM warehouse_stock WHERE warehouse_id = 'WH_CENTRAL' AND item_id = ?").get(trfItemId) as any;
  const targetWh = db.prepare("SELECT quantity FROM warehouse_stock WHERE warehouse_id = 'WH_BRANCH_EAST' AND item_id = ?").get(trfItemId) as any;

  assert.equal(Number(sourceWh.quantity), 30, "Source warehouse must decrease by 20 to 30");
  assert.equal(Number(targetWh.quantity), 20, "Target warehouse must increase by 20 to 20");
  console.log("  ✓ K2 Passed: transferStock() accurately mutates warehouse balances atomically.");
}

console.log("\n=======================================================");
console.log("   ALL PRD AUDIT VERIFICATION TESTS PASSED 100%!       ");
console.log("=======================================================\n");

outboxService.stopWorker();
process.exit(0);
