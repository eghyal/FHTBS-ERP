import assert from "node:assert/strict";
import { getRolePolicies, hasPermission, Action, ACTIONS_REQUIRING_MANAGER } from "../utils/pbac.ts";
import { normalizeDepartmentToRole, canUserApproveDepartment } from "../constants/rbac.ts";
import { User } from "../contexts/AuthContext.tsx";

console.log("\n=======================================================");
console.log("       FINANCE RBAC & PBAC POLICY VERIFICATION         ");
console.log("=======================================================\n");

// 1. Verify FINANCE Role in RBAC
console.log("[TEST 1] Verifying FINANCE role normalization and approval authority...");
assert.equal(normalizeDepartmentToRole("FINANCE"), "FINANCE");
assert.equal(normalizeDepartmentToRole("finance"), "FINANCE");
assert.equal(normalizeDepartmentToRole("KEUANGAN"), "FINANCE");
assert.equal(normalizeDepartmentToRole("ACCOUNTING"), "FINANCE");

assert.equal(canUserApproveDepartment("FC", "FINANCE"), true, "FC can approve Finance");
assert.equal(canUserApproveDepartment("FINANCE", "FINANCE"), true, "Finance can approve Finance");
assert.equal(canUserApproveDepartment("SALES", "FINANCE"), false, "Sales cannot approve Finance");
assert.equal(canUserApproveDepartment("PURCHASING", "FINANCE"), false, "Purchasing cannot approve Finance");
console.log("  ✓ Test 1 Passed: FINANCE role normalization and approval boundaries verified.");

// 2. Verify Finance Policies in PBAC
console.log("[TEST 2] Verifying FINANCE Role Policies in PBAC...");
const rolePolicies = getRolePolicies();
assert.ok(rolePolicies.FINANCE, "FINANCE role policies must be defined");
assert.ok(rolePolicies.FINANCE.includes(Action.VIEW_FINANCE), "FINANCE must include VIEW_FINANCE");
assert.ok(rolePolicies.FINANCE.includes(Action.VIEW_INVOICES), "FINANCE must include VIEW_INVOICES");
assert.ok(rolePolicies.FINANCE.includes(Action.VIEW_MASTER_DATA), "FINANCE must include VIEW_MASTER_DATA");
assert.ok(rolePolicies.FINANCE.includes(Action.POST_JOURNAL), "FINANCE must include POST_JOURNAL");
assert.ok(rolePolicies.FINANCE.includes(Action.MANAGE_FINANCE), "FINANCE must include MANAGE_FINANCE");
assert.ok(rolePolicies.FINANCE.includes(Action.MANAGE_INVOICES), "FINANCE must include MANAGE_INVOICES");
assert.ok(rolePolicies.FINANCE.includes(Action.MANAGE_PAYABLES), "FINANCE must include MANAGE_PAYABLES");
assert.ok(rolePolicies.FINANCE.includes(Action.AUTH_PAYROLL), "FINANCE must include AUTH_PAYROLL");
assert.ok(rolePolicies.FINANCE.includes(Action.AUTH_EXPENSE), "FINANCE must include AUTH_EXPENSE");
assert.ok(rolePolicies.FINANCE.includes(Action.CLOSE_PERIOD), "FINANCE must include CLOSE_PERIOD");
console.log("  ✓ Test 2 Passed: FINANCE policies successfully defined in getRolePolicies.");

// 3. Verify Finance Staff Permissions (Read & Operational without managerial authority)
console.log("[TEST 3] Verifying Finance Staff permissions...");
const financeStaffUser: User = {
  id: "U-FIN-STAFF",
  username: "fin_staff",
  role: "FINANCE",
  level: "STAFF",
  name: "Finance Staff",
  status: "APPROVED",
};

// Staff SHOULD have:
assert.equal(hasPermission(financeStaffUser, Action.VIEW_FINANCE), true, "Staff can view finance");
assert.equal(hasPermission(financeStaffUser, Action.VIEW_INVOICES), true, "Staff can view invoices");
assert.equal(hasPermission(financeStaffUser, Action.VIEW_MASTER_DATA), true, "Staff can view master data");
assert.equal(hasPermission(financeStaffUser, Action.POST_JOURNAL), true, "Staff can post journal entries");

// Staff SHOULD NOT have managerial authority:
assert.equal(hasPermission(financeStaffUser, Action.MANAGE_FINANCE), false, "Staff cannot manage finance");
assert.equal(hasPermission(financeStaffUser, Action.MANAGE_INVOICES), false, "Staff cannot manage invoices");
assert.equal(hasPermission(financeStaffUser, Action.MANAGE_PAYABLES), false, "Staff cannot manage payables");
assert.equal(hasPermission(financeStaffUser, Action.AUTH_PAYROLL), false, "Staff cannot authorize payroll");
assert.equal(hasPermission(financeStaffUser, Action.AUTH_EXPENSE), false, "Staff cannot authorize expenses");
assert.equal(hasPermission(financeStaffUser, Action.CLOSE_PERIOD), false, "Staff cannot close accounting periods");
console.log("  ✓ Test 3 Passed: Finance Staff permissions correctly enforced without managerial override.");

// 4. Verify Finance Manager Permissions (Full operational & executive finance authority)
console.log("[TEST 4] Verifying Finance Manager permissions...");
const financeManagerUser: User = {
  id: "U-FIN-MGR",
  username: "fin_mgr",
  role: "FINANCE",
  level: "MANAGER",
  name: "Finance Manager",
  status: "APPROVED",
};

// Manager SHOULD have all Staff permissions + Managerial actions:
assert.equal(hasPermission(financeManagerUser, Action.VIEW_FINANCE), true, "Manager can view finance");
assert.equal(hasPermission(financeManagerUser, Action.VIEW_INVOICES), true, "Manager can view invoices");
assert.equal(hasPermission(financeManagerUser, Action.VIEW_MASTER_DATA), true, "Manager can view master data");
assert.equal(hasPermission(financeManagerUser, Action.POST_JOURNAL), true, "Manager can post journal");
assert.equal(hasPermission(financeManagerUser, Action.MANAGE_FINANCE), true, "Manager can manage finance");
assert.equal(hasPermission(financeManagerUser, Action.MANAGE_INVOICES), true, "Manager can manage invoices");
assert.equal(hasPermission(financeManagerUser, Action.MANAGE_PAYABLES), true, "Manager can manage payables");
assert.equal(hasPermission(financeManagerUser, Action.AUTH_PAYROLL), true, "Manager can authorize payroll");
assert.equal(hasPermission(financeManagerUser, Action.AUTH_EXPENSE), true, "Manager can authorize expenses");
assert.equal(hasPermission(financeManagerUser, Action.CLOSE_PERIOD), true, "Manager can close accounting periods");

// Non-finance domains should still be blocked for Finance Manager:
assert.equal(hasPermission(financeManagerUser, Action.MANAGE_BOM), false, "Finance Manager cannot manage BOM");
assert.equal(hasPermission(financeManagerUser, Action.AUTH_DELIVERY), false, "Finance Manager cannot authorize delivery");
console.log("  ✓ Test 4 Passed: Finance Manager has full finance actions while respecting domain boundaries.");

console.log("\n=======================================================");
console.log("   ALL FINANCE RBAC & PBAC POLICY TESTS PASSED 100%!  ");
console.log("=======================================================\n");
