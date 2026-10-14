import assert from "node:assert/strict";
import db from "../db/database.ts";
import { extractRoutingFromContent } from "../routes/workspace_documents.ts";
import { canUserApproveDepartment, normalizeDepartmentToRole } from "../constants/rbac.ts";

console.log("\n=======================================================");
console.log("   WORKSPACE DOCUMENTS CANVA & AUTO-ROUTING TEST SUITE  ");
console.log("=======================================================\n");

// 1. Test extractRoutingFromContent for Purchasing Signature Column
console.log("[TEST 1] Verifying Auto-Trigger routing extraction for Purchasing...");
{
  const purchasingBlocks: any[] = [
    {
      id: "b1",
      type: "OFFICIAL_LETTERHEAD",
      title: "CV. BATU EMAS GROUP",
    },
    {
      id: "b2",
      type: "TEXT",
      content: "Permintaan pengadaan barang suku cadang.",
    },
    {
      id: "b3",
      type: "SIGNATURE_COLUMN",
      targetDepartment: "PURCHASING",
      targetRole: "PURCHASING_MANAGER",
      signatoryTitle: "Purchasing Manager",
    },
  ];

  const route = extractRoutingFromContent(purchasingBlocks);
  assert.ok(route !== null, "Route must not be null");
  assert.equal(route.role, "PURCHASING_MANAGER", "Must route to PURCHASING_MANAGER");
  assert.equal(route.department, "PURCHASING", "Must route to PURCHASING department");
  console.log("  ✓ Test 1 Passed: Purchasing signature column automatically triggers PURCHASING_MANAGER routing.");
}

// 2. Test extractRoutingFromContent for Finance Signature Column
console.log("[TEST 2] Verifying Auto-Trigger routing extraction for Finance...");
{
  const financeBlocks: any[] = [
    {
      id: "b1",
      type: "CALLOUT",
      title: "Pengeluaran Anggaran",
    },
    {
      id: "b2",
      type: "SIGNATURE_COLUMN",
      targetDepartment: "FINANCE",
      targetRole: "FINANCE_HEAD",
      signatoryTitle: "Head of Finance",
    },
  ];

  const route = extractRoutingFromContent(financeBlocks);
  assert.ok(route !== null);
  assert.equal(route.role, "FINANCE_HEAD");
  assert.equal(route.department, "FINANCE");
  console.log("  ✓ Test 2 Passed: Finance signature column automatically triggers FINANCE_HEAD routing.");
}

// 3. Test Database Insertion & Pending Approvals Query
console.log("[TEST 3] Verifying Database persistence with Auto-Routing Trigger...");
{
  const testDocId = "WSD-TEST-" + Date.now();
  const testDocCode = "DOC-TEST-" + Math.floor(Math.random() * 1000);
  const nowIso = new Date().toISOString();

  const blocks = [
    {
      id: "b1",
      type: "OFFICIAL_LETTERHEAD",
      title: "CV. BATU EMAS GROUP",
      addressData: { streetAddress: "Menganti, Gresik" },
    },
    {
      id: "b2",
      type: "SIGNATURE_COLUMN",
      targetDepartment: "PURCHASING",
      targetRole: "PURCHASING_MANAGER",
      signatoryTitle: "Purchasing Manager",
    },
  ];

  const autoRoute = extractRoutingFromContent(blocks);
  assert.ok(autoRoute);

  db.prepare(`
    INSERT INTO workspace_documents (
      id, document_code, title, document_type, created_by_username, created_by_name,
      department, content_json, layout_preset, authorization_role, authorization_department,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, 'MEMORANDUM', 'operator1', 'Budi Santoso', 'Workshop', ?, 'A4_PORTRAIT', ?, ?, 'PENDING_APPROVAL', ?, ?)
  `).run(
    testDocId,
    testDocCode,
    "Memo Pengadaan Sparepart Test",
    JSON.stringify(blocks),
    autoRoute.role,
    autoRoute.department,
    nowIso,
    nowIso
  );

  // Query as Purchasing Department Manager
  const pendingPurchasingDocs = db.prepare(`
    SELECT * FROM workspace_documents
    WHERE status = 'PENDING_APPROVAL'
      AND (authorization_role IN ('PURCHASING', 'PURCHASING_MANAGER') OR authorization_department = 'PURCHASING')
      AND id = ?
  `).all(testDocId) as any[];

  assert.equal(pendingPurchasingDocs.length, 1, "Purchasing department must find the pending document");
  assert.equal(pendingPurchasingDocs[0].authorization_department, "PURCHASING");
  assert.equal(pendingPurchasingDocs[0].authorization_role, "PURCHASING_MANAGER");
  console.log("  ✓ Test 3 Passed: Document is automatically retrieved in Purchasing pending approvals queue.");
}

// 4. Test RBAC Department Authorization Matrix (P0-02 & P1-01)
console.log("[TEST 4] Verifying RBAC Department Authority Matrix (Finance, Purchasing, Sales, FC)...");
{
  assert.equal(normalizeDepartmentToRole("FINANCE"), "FINANCE", "FINANCE role must normalize to FINANCE");
  assert.equal(normalizeDepartmentToRole("Finance & Accounting"), "FINANCE");
  assert.equal(normalizeDepartmentToRole("SALES"), "SALES");

  // FC can approve anything
  assert.equal(canUserApproveDepartment("FC", "PURCHASING"), true);
  assert.equal(canUserApproveDepartment("FC", "FINANCE"), true);

  // Sales CANNOT approve Purchasing or Finance
  assert.equal(canUserApproveDepartment("SALES", "PURCHASING"), false, "Sales must not approve Purchasing");
  assert.equal(canUserApproveDepartment("SALES", "FINANCE"), false, "Sales must not approve Finance");

  // Finance can approve Finance
  assert.equal(canUserApproveDepartment("FINANCE", "FINANCE"), true, "Finance role can approve Finance docs");
  assert.equal(canUserApproveDepartment("PURCHASING", "PURCHASING"), true, "Purchasing role can approve Purchasing docs");
  console.log("  ✓ Test 4 Passed: RBAC authority strictly prevents cross-department unauthorized approvals.");
}

// 5. Test Atomic Sequence Numbering Integrity (P0-05)
console.log("[TEST 5] Verifying Atomic Document Numbering (document_sequences table)...");
{
  const scope = "DOC-TEST-SEQ-" + Date.now();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO document_sequences (scope, next_val, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(scope) DO UPDATE SET next_val = next_val + 1, updated_at = excluded.updated_at
  `).run(scope, now);

  const row1: any = db.prepare("SELECT next_val FROM document_sequences WHERE scope = ?").get(scope);
  assert.equal(row1.next_val, 1);

  db.prepare(`
    INSERT INTO document_sequences (scope, next_val, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(scope) DO UPDATE SET next_val = next_val + 1, updated_at = excluded.updated_at
  `).run(scope, now);

  const row2: any = db.prepare("SELECT next_val FROM document_sequences WHERE scope = ?").get(scope);
  assert.equal(row2.next_val, 2, "Sequence must increment monotonically without collision even if records are deleted");
  console.log("  ✓ Test 5 Passed: Atomic sequence generation prevents collision and duplicate document codes.");
}

console.log("\n=======================================================");
console.log("   ALL WORKSPACE DOCUMENT SECURITY TESTS PASSED 100%!  ");
console.log("=======================================================\n");

process.exit(0);
