import assert from "node:assert/strict";
import db from "../db/database.ts";
import { extractRoutingFromContent } from "../routes/workspace_documents.ts";

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
      title: "PT FATHIN BUMI PRATAMA",
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
      title: "PT FATHIN BUMI PRATAMA",
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

console.log("\n=======================================================");
console.log("   ALL WORKSPACE DOCUMENT TESTS PASSED 100%!           ");
console.log("=======================================================\n");

process.exit(0);
