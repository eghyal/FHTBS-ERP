import crypto from "crypto";
import db from "../db/database.ts";
import { normalizeDepartmentToRole, canUserApproveDepartment } from "../constants/rbac.ts";

export interface WorkflowStepRecord {
  step_index: number;
  required_role: string;
  approved_by_username: string;
  approved_by_name: string;
  approved_by_role: string;
  approved_by_level: string;
  approved_at: string;
  note?: string;
  via_escalation?: boolean;
}

export interface ActiveWorkflowApproval {
  id: string;
  document_type: string;
  document_id: string;
  document_number: string;
  document_title: string;
  department: string;
  amount: number;
  matrix_id: string | null;
  is_parallel: boolean;
  required_roles: string[];
  approved_steps: WorkflowStepRecord[];
  current_step_index: number;
  current_step_role: string;
  status: "PENDING" | "APPROVED" | "REVISION" | "CANCELLED";
  step_started_at: string;
  sla_hours: number;
  escalate_to: string;
  escalated: boolean;
  escalated_to: string | null;
  escalated_at: string | null;
  elapsed_hours: number;
  sla_percentage: number;
  sla_status: "ON_TRACK" | "WARNING" | "BREACHED";
  remaining_hours: number;
  can_current_user_approve?: boolean;
}

const EXECUTIVE_ROLES = new Set(["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN", "GOD_MODE"]);

/**
 * Normalize legacy human-readable role labels (e.g. "Procurement Manager", "Finance Manager", "Director")
 * into canonical workflow role tokens so both seeded and user-created matrices work seamlessly.
 */
export function normalizeWorkflowRoleToken(rawRole: string, fallbackDept = "PURCHASING"): string {
  const token = (rawRole || "").trim().toUpperCase();
  if (!token) return "MANAGER";

  if (token === "SUPERVISOR" || token.endsWith("_SUPERVISOR")) return token;
  if (token === "MANAGER" || token.endsWith("_MANAGER")) return token;
  if (
    token === "FC" ||
    token === "DIRECTOR" ||
    token === "PLANT DIRECTOR" ||
    token === "PLANT_HEAD" ||
    token === "BOD" ||
    token.includes("BOARD") ||
    token.includes("CONTROLLER")
  ) {
    return "FC";
  }

  if (token.includes("PROCUREMENT") || token.includes("PURCHASING")) {
    return token.includes("SUPERVISOR") ? "PURCHASING_SUPERVISOR" : "PURCHASING_MANAGER";
  }
  if (token.includes("FINANCE") || token.includes("ACCOUNTING")) {
    return token.includes("SUPERVISOR") ? "FINANCE_SUPERVISOR" : "FINANCE_MANAGER";
  }
  if (token.includes("SALES") || token.includes("COMMERCIAL")) {
    return token.includes("SUPERVISOR") ? "SALES_SUPERVISOR" : "SALES_MANAGER";
  }
  if (token.includes("ENGINEERING") || token.includes("TEKNIK")) {
    return token.includes("SUPERVISOR") ? "ENGINEERING_SUPERVISOR" : "ENGINEERING_MANAGER";
  }
  if (token.includes("PRODUCTION") || token.includes("PRODUKSI")) {
    return token.includes("SUPERVISOR") ? "PRODUCTION_SUPERVISOR" : "PRODUCTION_MANAGER";
  }
  if (token.includes("WAREHOUSE") || token.includes("GUDANG") || token.includes("LOGISTIK")) {
    return token.includes("SUPERVISOR") ? "WAREHOUSE_SUPERVISOR" : "WAREHOUSE_MANAGER";
  }
  if (token.includes("PPIC")) {
    return token.includes("SUPERVISOR") ? "PPIC_SUPERVISOR" : "PPIC_MANAGER";
  }
  if (token.includes("QA") || token.includes("QC") || token.includes("QUALITY")) {
    return token.includes("SUPERVISOR") ? "QA_QC_SUPERVISOR" : "QA_QC_MANAGER";
  }
  if (token.includes("HR")) {
    return token.includes("SUPERVISOR") ? "HR_SUPERVISOR" : "HR_MANAGER";
  }

  return token.replace(/\s+/g, "_");
}

/**
 * Resolves the matching Dynamic Approval Matrix for a document type and transaction amount.
 */
export function resolveWorkflowMatrix(
  documentType: string,
  amount: number,
  defaultDept = "PURCHASING",
): {
  matrixId: string | null;
  roles: string[];
  isParallel: boolean;
} {
  const numericAmount = Number(amount) || 0;
  try {
    const matrices = db
      .prepare(
        `SELECT * FROM workflow_matrices
         WHERE LOWER(TRIM(document_type)) = LOWER(TRIM(?))
         ORDER BY COALESCE(min_amount, 0) ASC, created_at DESC`,
      )
      .all(documentType) as any[];

    for (const m of matrices) {
      const min = Number(m.min_amount ?? 0);
      const hasMax = m.max_amount !== null && m.max_amount !== undefined && m.max_amount !== "";
      const max = hasMax ? Number(m.max_amount) : Infinity;

      if (numericAmount >= min && numericAmount <= max) {
        let parsedRoles: string[] = [];
        try {
          parsedRoles = JSON.parse(m.roles || "[]");
        } catch {
          parsedRoles = [String(m.roles || "MANAGER")];
        }
        const normalized = parsedRoles
          .map((r) => normalizeWorkflowRoleToken(String(r), defaultDept))
          .filter(Boolean);
        if (normalized.length > 0) {
          return {
            matrixId: m.id,
            roles: normalized,
            isParallel: Boolean(m.is_parallel),
          };
        }
      }
    }
  } catch (err) {
    console.error("[WorkflowEngine] Error resolving matrix:", err);
  }

  // Fallback default tiered rules when no custom matrix matches
  if (documentType === "Purchase Order") {
    if (numericAmount <= 10_000_000) {
      return { matrixId: null, roles: ["SUPERVISOR", "PURCHASING_MANAGER"], isParallel: false };
    }
    if (numericAmount <= 50_000_000) {
      return { matrixId: null, roles: ["PURCHASING_MANAGER", "FINANCE_MANAGER"], isParallel: false };
    }
    return { matrixId: null, roles: ["PURCHASING_MANAGER", "FINANCE_MANAGER", "FC"], isParallel: false };
  }

  if (documentType === "Purchase Request") {
    if (numericAmount <= 5_000_000) {
      return { matrixId: null, roles: ["SUPERVISOR"], isParallel: false };
    }
    if (numericAmount <= 25_000_000) {
      return { matrixId: null, roles: ["SUPERVISOR", "MANAGER"], isParallel: false };
    }
    return { matrixId: null, roles: ["MANAGER", "FC"], isParallel: false };
  }

  if (documentType === "Quotation") {
    if (numericAmount <= 25_000_000) {
      return { matrixId: null, roles: ["SUPERVISOR", "SALES_MANAGER"], isParallel: false };
    }
    if (numericAmount <= 100_000_000) {
      return { matrixId: null, roles: ["SALES_MANAGER", "FINANCE_MANAGER"], isParallel: false };
    }
    return { matrixId: null, roles: ["SALES_MANAGER", "FC"], isParallel: false };
  }

  return {
    matrixId: null,
    roles: ["SUPERVISOR", "MANAGER"],
    isParallel: false,
  };
}

/**
 * Resolves the SLA rule for a given document type and current step role.
 */
export function resolveWorkflowSla(
  documentType: string,
  stepRole: string,
): { slaHours: number; escalateTo: string } {
  const normStep = normalizeWorkflowRoleToken(stepRole);
  try {
    const slas = db
      .prepare(
        `SELECT * FROM workflow_slas
         WHERE LOWER(TRIM(document_type)) = LOWER(TRIM(?))
         ORDER BY created_at DESC`,
      )
      .all(documentType) as any[];

    // Try exact or partial step match first
    for (const s of slas) {
      const ruleStep = normalizeWorkflowRoleToken(s.step || "");
      if (
        ruleStep === normStep ||
        (normStep.includes("SUPERVISOR") && ruleStep.includes("SUPERVISOR")) ||
        (normStep.includes("MANAGER") && ruleStep.includes("MANAGER")) ||
        s.step?.toLowerCase() === "pending approval"
      ) {
        return {
          slaHours: Math.max(0.1, Number(s.sla_hours) || 24),
          escalateTo: normalizeWorkflowRoleToken(s.escalate_to || "DIRECTOR"),
        };
      }
    }

    if (slas.length > 0) {
      return {
        slaHours: Math.max(0.1, Number(slas[0].sla_hours) || 24),
        escalateTo: normalizeWorkflowRoleToken(slas[0].escalate_to || "DIRECTOR"),
      };
    }
  } catch (err) {
    console.error("[WorkflowEngine] Error resolving SLA:", err);
  }

  // Intelligent default SLA escalation hierarchy:
  // SUPERVISOR -> MANAGER (12h), MANAGER -> FC (24h)
  if (normStep.includes("SUPERVISOR")) {
    return { slaHours: 12, escalateTo: "MANAGER" };
  }
  return { slaHours: 24, escalateTo: "FC" };
}

/**
 * Checks whether a user has authority to approve a specific workflow step (including SLA escalation override).
 */
export function canUserAuthorizeWorkflowStep(
  user: { role?: string; level?: string; username?: string },
  approval: {
    department?: string;
    current_step_role: string;
    is_parallel?: boolean | number;
    required_roles?: string[];
    approved_steps?: WorkflowStepRecord[];
    escalated?: boolean | number;
    escalated_to?: string | null;
  },
): boolean {
  const userRole = (user.role || "").trim().toUpperCase();
  const userLevel = (user.level || "STAFF").trim().toUpperCase();

  if (!userRole) return false;

  // Executive / Full Control accounts can authorize any step
  if (EXECUTIVE_ROLES.has(userRole) || userLevel === "SUPER_ADMIN") {
    return true;
  }

  // Check if SLA was breached and escalated to this user's role or level
  if (approval.escalated && approval.escalated_to) {
    const escTarget = normalizeWorkflowRoleToken(approval.escalated_to);
    if (matchesRoleAndLevel(userRole, userLevel, escTarget, approval.department || "GENERAL")) {
      return true;
    }
  }

  // If parallel mode, user can approve if ANY unapproved required role matches their role & level
  if (approval.is_parallel && Array.isArray(approval.required_roles)) {
    const approvedSet = new Set((approval.approved_steps || []).map((s) => s.required_role));
    for (const reqRole of approval.required_roles) {
      if (!approvedSet.has(reqRole)) {
        if (matchesRoleAndLevel(userRole, userLevel, reqRole, approval.department || "GENERAL")) {
          return true;
        }
      }
    }
  }

  return matchesRoleAndLevel(
    userRole,
    userLevel,
    approval.current_step_role,
    approval.department || "GENERAL",
  );
}

function matchesRoleAndLevel(
  userRole: string,
  userLevel: string,
  requiredStepRole: string,
  docDepartment: string,
): boolean {
  const reqToken = normalizeWorkflowRoleToken(requiredStepRole, docDepartment);
  const normUserDept = normalizeDepartmentToRole(userRole) || userRole;
  const normDocDept = normalizeDepartmentToRole(docDepartment) || docDepartment;

  // Executive targets
  if (reqToken === "DIRECTOR" || reqToken === "BOD" || reqToken === "FC") {
    return userRole === reqToken || EXECUTIVE_ROLES.has(userRole);
  }

  // Generic SUPERVISOR step (must be Supervisor or Manager in the document's department, or Purchasing/Engineering)
  if (reqToken === "SUPERVISOR") {
    const hasLevel = userLevel === "SUPERVISOR" || userLevel === "MANAGER";
    if (!hasLevel) return false;
    if (!normDocDept || normDocDept === "GENERAL") return true;
    return normUserDept === normDocDept || canUserApproveDepartment(userRole, normDocDept);
  }

  // Generic MANAGER step (must be Manager in the document's department)
  if (reqToken === "MANAGER") {
    if (userLevel !== "MANAGER") return false;
    if (!normDocDept || normDocDept === "GENERAL") return true;
    return normUserDept === normDocDept || canUserApproveDepartment(userRole, normDocDept);
  }

  // Department-specific Supervisor (e.g., PURCHASING_SUPERVISOR, QA_QC_SUPERVISOR, PPIC_SUPERVISOR)
  if (reqToken.endsWith("_SUPERVISOR")) {
    const targetDept = reqToken.replace(/_SUPERVISOR$/, "");
    const normTarget = normalizeDepartmentToRole(targetDept) || targetDept;
    const hasLevel = userLevel === "SUPERVISOR" || userLevel === "MANAGER";
    return hasLevel && normUserDept === normTarget;
  }

  // Department-specific Manager / Head (e.g., PURCHASING_MANAGER, FINANCE_MANAGER, SALES_MANAGER, PPIC_MANAGER, QA_QC_MANAGER)
  if (reqToken.endsWith("_MANAGER") || reqToken.endsWith("_HEAD")) {
    const targetDept = reqToken.replace(/_(MANAGER|HEAD)$/, "");
    const normTarget = normalizeDepartmentToRole(targetDept) || targetDept;
    return userLevel === "MANAGER" && normUserDept === normTarget;
  }

  // Direct department name match (e.g., "PURCHASING", "FINANCE", "QA_QC", "PPIC")
  const normReqDept = normalizeDepartmentToRole(reqToken);
  if (normReqDept) {
    return (userLevel === "MANAGER" || userLevel === "SUPERVISOR") && normUserDept === normReqDept;
  }

  return userRole === reqToken;
}

/**
 * Registers or synchronizes a pending ERP document into `workflow_approvals`.
 */
export function ensureWorkflowApprovalRecord(params: {
  documentType: string;
  documentId: string;
  documentNumber: string;
  documentTitle?: string;
  department?: string;
  amount?: number;
  createdAt?: string;
  forcedRoles?: string[];
}): ActiveWorkflowApproval {
  const {
    documentType,
    documentId,
    documentNumber,
    documentTitle = "",
    department = "PURCHASING",
    amount = 0,
    createdAt,
    forcedRoles,
  } = params;

  const existing = db
    .prepare("SELECT * FROM workflow_approvals WHERE document_type = ? AND document_id = ?")
    .get(documentType, documentId) as any;

  if (existing) {
    return enrichWorkflowApprovalRow(existing);
  }

  const resolved = resolveWorkflowMatrix(documentType, amount, department);
  const roles = forcedRoles && forcedRoles.length > 0 ? forcedRoles : resolved.roles;
  const firstStepRole = roles[0] || "MANAGER";
  const sla = resolveWorkflowSla(documentType, firstStepRole);
  const id = `WFA-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
  const stepStart = createdAt || new Date().toISOString();

  db.prepare(
    `INSERT OR IGNORE INTO workflow_approvals (
      id, document_type, document_id, document_number, document_title,
      department, amount, matrix_id, is_parallel, required_roles_json,
      approved_steps_json, current_step_index, current_step_role, status,
      step_started_at, sla_hours, escalate_to, escalated, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, ?, 'PENDING', ?, ?, ?, 0, ?, ?)`,
  ).run(
    id,
    documentType,
    documentId,
    documentNumber,
    documentTitle,
    department,
    Number(amount) || 0,
    resolved.matrixId,
    resolved.isParallel ? 1 : 0,
    JSON.stringify(roles),
    firstStepRole,
    stepStart,
    sla.slaHours,
    sla.escalateTo,
    stepStart,
    new Date().toISOString(),
  );

  const inserted = db
    .prepare("SELECT * FROM workflow_approvals WHERE document_type = ? AND document_id = ?")
    .get(documentType, documentId) as any;

  return enrichWorkflowApprovalRow(inserted);
}

export function enrichWorkflowApprovalRow(row: any, currentUser?: { role?: string; level?: string; username?: string }): ActiveWorkflowApproval {
  let requiredRoles: string[] = ["MANAGER"];
  let approvedSteps: WorkflowStepRecord[] = [];
  try {
    requiredRoles = JSON.parse(row.required_roles_json || '["MANAGER"]');
  } catch {}
  try {
    approvedSteps = JSON.parse(row.approved_steps_json || "[]");
  } catch {}

  const startedMs = new Date(row.step_started_at || row.created_at || Date.now()).getTime();
  const elapsedHours = Math.max(0, (Date.now() - startedMs) / (1000 * 60 * 60));
  const slaHours = Math.max(0.1, Number(row.sla_hours) || 24);
  const slaPercentage = Math.min(999, Math.round((elapsedHours / slaHours) * 100));
  const remainingHours = Number((slaHours - elapsedHours).toFixed(1));

  let slaStatus: "ON_TRACK" | "WARNING" | "BREACHED" = "ON_TRACK";
  if (elapsedHours >= slaHours || Boolean(row.escalated)) {
    slaStatus = "BREACHED";
  } else if (slaPercentage >= 75) {
    slaStatus = "WARNING";
  }

  const enriched: ActiveWorkflowApproval = {
    id: row.id,
    document_type: row.document_type,
    document_id: row.document_id,
    document_number: row.document_number,
    document_title: row.document_title || row.document_number,
    department: row.department || "GENERAL",
    amount: Number(row.amount) || 0,
    matrix_id: row.matrix_id || null,
    is_parallel: Boolean(row.is_parallel),
    required_roles: requiredRoles,
    approved_steps: approvedSteps,
    current_step_index: Number(row.current_step_index) || 0,
    current_step_role: row.current_step_role || requiredRoles[0] || "MANAGER",
    status: row.status || "PENDING",
    step_started_at: row.step_started_at || row.created_at,
    sla_hours: slaHours,
    escalate_to: row.escalate_to || "DIRECTOR",
    escalated: Boolean(row.escalated),
    escalated_to: row.escalated_to || null,
    escalated_at: row.escalated_at || null,
    elapsed_hours: Number(elapsedHours.toFixed(1)),
    sla_percentage: slaPercentage,
    sla_status: slaStatus,
    remaining_hours: remainingHours,
  };

  if (currentUser) {
    enriched.can_current_user_approve = canUserAuthorizeWorkflowStep(currentUser, enriched);
  }

  return enriched;
}

/**
 * Synchronizes all pending ERP documents (PR, PO, Quotation, General Request, Workspace Document)
 * into `workflow_approvals` and returns the live approval queue with real-time SLA metrics.
 */
export function syncAndGetActiveWorkflowApprovals(currentUser?: {
  role?: string;
  level?: string;
  username?: string;
}): ActiveWorkflowApproval[] {
  try {
    // 1. Sync Pending Purchase Requests (status = 'DRAFTED')
    const pendingPrs = db
      .prepare(
        `SELECT pr.id, pr.pr_number, pr.project_id, pr.category, pr.remarks, pr.created_at,
                COALESCE(pr.total_estimated_cost, (SELECT SUM(qty * COALESCE(unit_price, 0)) FROM pr_items WHERE pr_id = pr.id), 0) as est_amount
         FROM purchase_requests pr
         WHERE COALESCE(pr.archived, 0) = 0 AND pr.status = 'DRAFTED'`,
      )
      .all() as any[];

    const activeKeys = new Set<string>();

    for (const pr of pendingPrs) {
      const dept = pr.category === "PRODUCTION" ? "PRODUCTION" : "ENGINEERING";
      ensureWorkflowApprovalRecord({
        documentType: "Purchase Request",
        documentId: pr.id,
        documentNumber: pr.pr_number || pr.id,
        documentTitle: pr.remarks || `PR Project ${pr.project_id || "General"}`,
        department: dept,
        amount: Number(pr.est_amount) || 0,
        createdAt: pr.created_at,
      });
      activeKeys.add(`Purchase Request:${pr.id}`);
    }

    // 2. Sync Pending Purchase Orders (status IN ('DRAFTED', 'PENDING'))
    const pendingPos = db
      .prepare(
        `SELECT id, po_number, supplier_name, COALESCE(grand_total, total_amount, 0) as total_val, created_at
         FROM purchase_orders
         WHERE COALESCE(archived, 0) = 0 AND status IN ('DRAFTED', 'PENDING')`,
      )
      .all() as any[];

    for (const po of pendingPos) {
      ensureWorkflowApprovalRecord({
        documentType: "Purchase Order",
        documentId: po.id,
        documentNumber: po.po_number || po.id,
        documentTitle: `PO Supplier: ${po.supplier_name || "Vendor"}`,
        department: "PURCHASING",
        amount: Number(po.total_val) || 0,
        createdAt: po.created_at,
      });
      activeKeys.add(`Purchase Order:${po.id}`);
    }

    // 3. Sync Pending Quotations (status IN ('PENDING', 'DRAFT'))
    const pendingQuos = db
      .prepare(
        `SELECT id, quotation_number, title, COALESCE(grand_total, amount, 0) as total_val, created_at
         FROM quotations
         WHERE archived_at IS NULL AND status IN ('PENDING', 'DRAFT')`,
      )
      .all() as any[];

    for (const q of pendingQuos) {
      ensureWorkflowApprovalRecord({
        documentType: "Quotation",
        documentId: q.id,
        documentNumber: q.quotation_number || q.id,
        documentTitle: q.title || q.quotation_number,
        department: "SALES",
        amount: Number(q.total_val) || 0,
        createdAt: q.created_at,
      });
      activeKeys.add(`Quotation:${q.id}`);
    }

    // 4. Sync Pending General Requests (status = 'SUBMITTED')
    const pendingGrqs = db
      .prepare(
        `SELECT id, request_code, title, department, COALESCE(estimated_total_cost, 0) as total_val, created_at
         FROM general_requests
         WHERE status = 'SUBMITTED'`,
      )
      .all() as any[];

    for (const grq of pendingGrqs) {
      ensureWorkflowApprovalRecord({
        documentType: "General Request",
        documentId: grq.id,
        documentNumber: grq.request_code || grq.id,
        documentTitle: grq.title || grq.request_code,
        department: grq.department || "ENGINEERING",
        amount: Number(grq.total_val) || 0,
        createdAt: grq.created_at,
      });
      activeKeys.add(`General Request:${grq.id}`);
    }

    // 5. Sync Pending Workspace Documents (status = 'PENDING_APPROVAL')
    const pendingDocs = db
      .prepare(
        `SELECT id, document_code, title, authorization_department, authorization_role, department, created_at, updated_at
         FROM workspace_documents
         WHERE status = 'PENDING_APPROVAL'`,
      )
      .all() as any[];

    for (const doc of pendingDocs) {
      const targetDept = doc.authorization_department || doc.department || "PURCHASING";
      const targetRole = doc.authorization_role || `${targetDept}_MANAGER`;
      ensureWorkflowApprovalRecord({
        documentType: "Workspace Document",
        documentId: doc.id,
        documentNumber: doc.document_code || doc.id,
        documentTitle: doc.title || doc.document_code,
        department: targetDept,
        amount: 0,
        createdAt: doc.updated_at || doc.created_at,
        forcedRoles: [normalizeWorkflowRoleToken(targetRole, targetDept)],
      });
      activeKeys.add(`Workspace Document:${doc.id}`);
    }

    // Mark any stale PENDING records in workflow_approvals whose underlying documents are no longer pending
    const existingPendingRows = db
      .prepare("SELECT * FROM workflow_approvals WHERE status = 'PENDING' ORDER BY created_at DESC")
      .all() as any[];

    const activeList: ActiveWorkflowApproval[] = [];
    for (const row of existingPendingRows) {
      const key = `${row.document_type}:${row.document_id}`;
      if (!activeKeys.has(key)) {
        db.prepare("UPDATE workflow_approvals SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
          row.id,
        );
        continue;
      }
      activeList.push(enrichWorkflowApprovalRow(row, currentUser));
    }

    return activeList;
  } catch (err) {
    console.error("[WorkflowEngine] Error syncing active workflow approvals:", err);
    return [];
  }
}

/**
 * Evaluates all active workflow approvals against SLA rules and automatically escalates breached items.
 */
export function evaluateAllWorkflowSlas(actorUsername = "SYSTEM_SLA_ENGINE"): {
  evaluatedCount: number;
  newlyEscalatedCount: number;
  escalatedItems: { document_number: string; document_type: string; from_role: string; escalated_to: string }[];
} {
  const active = syncAndGetActiveWorkflowApprovals();
  const escalatedItems: { document_number: string; document_type: string; from_role: string; escalated_to: string }[] = [];
  const nowIso = new Date().toISOString();

  for (const item of active) {
    if (item.elapsed_hours >= item.sla_hours && !item.escalated) {
      const targetRole = normalizeWorkflowRoleToken(item.escalate_to || "DIRECTOR", item.department);

      db.prepare(
        `UPDATE workflow_approvals
         SET escalated = 1,
             escalated_to = ?,
             escalated_at = ?,
             updated_at = ?
         WHERE id = ?`,
      ).run(targetRole, nowIso, nowIso, item.id);

      // Propagate escalated_to to underlying ERP table so module-level authorize buttons also unlock
      if (item.document_type === "Purchase Request") {
        db.prepare("UPDATE purchase_requests SET escalated_to = ? WHERE id = ?").run(targetRole, item.document_id);
      } else if (item.document_type === "Purchase Order") {
        db.prepare("UPDATE purchase_orders SET escalated_to = ? WHERE id = ?").run(targetRole, item.document_id);
      } else if (item.document_type === "Quotation") {
        db.prepare("UPDATE quotations SET escalated_to = ? WHERE id = ?").run(targetRole, item.document_id);
      } else if (item.document_type === "General Request") {
        db.prepare("UPDATE general_requests SET escalated_to = ? WHERE id = ?").run(targetRole, item.document_id);
      } else if (item.document_type === "Workspace Document") {
        db.prepare("UPDATE workspace_documents SET escalated_to = ? WHERE id = ?").run(targetRole, item.document_id);
      }

      db.prepare(
        `INSERT INTO workflow_audit_logs (id, username, action, target_type, target_id, changes)
         VALUES (?, ?, 'SLA_AUTO_ESCALATION', ?, ?, ?)`,
      ).run(
        crypto.randomUUID(),
        actorUsername,
        item.document_type.toUpperCase().replace(/\s+/g, "_"),
        item.document_number,
        JSON.stringify({
          document_id: item.document_id,
          document_number: item.document_number,
          step_breached: item.current_step_role,
          elapsed_hours: item.elapsed_hours,
          sla_hours: item.sla_hours,
          escalated_to: targetRole,
        }),
      );

      escalatedItems.push({
        document_number: item.document_number,
        document_type: item.document_type,
        from_role: item.current_step_role,
        escalated_to: targetRole,
      });
    }
  }

  return {
    evaluatedCount: active.length,
    newlyEscalatedCount: escalatedItems.length,
    escalatedItems,
  };
}

/**
 * Advances or completes a multi-step approval for a document.
 * Returns `isFinalStep: true` when all required matrix steps have been satisfied.
 */
export function recordWorkflowStepApproval(params: {
  documentType: string;
  documentId: string;
  documentNumber: string;
  documentTitle?: string;
  department?: string;
  amount?: number;
  user: { username: string; name?: string; role: string; level: string };
  note?: string;
  executiveFastTrackAllSteps?: boolean;
}): {
  ok: boolean;
  error?: string;
  isFinalStep: boolean;
  approval: ActiveWorkflowApproval;
  completedStepRole: string;
  nextStepRole: string | null;
} {
  const instance = ensureWorkflowApprovalRecord({
    documentType: params.documentType,
    documentId: params.documentId,
    documentNumber: params.documentNumber,
    documentTitle: params.documentTitle,
    department: params.department,
    amount: params.amount,
  });

  // Auto-evaluate SLA on the fly in case this item is already overdue
  if (instance.elapsed_hours >= instance.sla_hours && !instance.escalated) {
    evaluateAllWorkflowSlas("SYSTEM_SLA_AUTO");
  }

  const refreshedRow = db
    .prepare("SELECT * FROM workflow_approvals WHERE id = ?")
    .get(instance.id) as any;
  const current = enrichWorkflowApprovalRow(refreshedRow, params.user);

  if (!canUserAuthorizeWorkflowStep(params.user, current)) {
    return {
      ok: false,
      error: `Access denied. Current stage requires authorization from [${current.current_step_role}]${
        current.escalated_to ? ` or escalated authority [${current.escalated_to}]` : ""
      }. Your current role: ${params.user.role} (${params.user.level}).`,
      isFinalStep: false,
      approval: current,
      completedStepRole: current.current_step_role,
      nextStepRole: current.current_step_role,
    };
  }

  const nowIso = new Date().toISOString();
  const approvedSteps = [...current.approved_steps];
  const completedStepRole = current.current_step_role;

  const newStepRecord: WorkflowStepRecord = {
    step_index: current.current_step_index,
    required_role: completedStepRole,
    approved_by_username: params.user.username,
    approved_by_name: params.user.name || params.user.username,
    approved_by_role: params.user.role,
    approved_by_level: params.user.level,
    approved_at: nowIso,
    note: params.note,
    via_escalation: current.escalated,
  };

  approvedSteps.push(newStepRecord);

  const isExec = EXECUTIVE_ROLES.has(params.user.role.toUpperCase());
  const nextIndex = current.current_step_index + 1;
  const allStepsDone =
    (params.executiveFastTrackAllSteps && isExec) ||
    nextIndex >= current.required_roles.length;

  let nextStepRole: string | null = null;

  if (allStepsDone) {
    db.prepare(
      `UPDATE workflow_approvals
       SET approved_steps_json = ?,
           current_step_index = ?,
           status = 'APPROVED',
           completed_at = ?,
           updated_at = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify(approvedSteps),
      current.required_roles.length,
      nowIso,
      nowIso,
      current.id,
    );
  } else {
    nextStepRole = current.required_roles[nextIndex];
    const nextSla = resolveWorkflowSla(params.documentType, nextStepRole);
    db.prepare(
      `UPDATE workflow_approvals
       SET approved_steps_json = ?,
           current_step_index = ?,
           current_step_role = ?,
           step_started_at = ?,
           sla_hours = ?,
           escalate_to = ?,
           escalated = 0,
           escalated_to = NULL,
           escalated_at = NULL,
           updated_at = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify(approvedSteps),
      nextIndex,
      nextStepRole,
      nowIso,
      nextSla.slaHours,
      nextSla.escalateTo,
      nowIso,
      current.id,
    );
  }

  db.prepare(
    `INSERT INTO workflow_audit_logs (id, username, action, target_type, target_id, changes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    params.user.username,
    allStepsDone ? "WORKFLOW_FINAL_APPROVED" : "WORKFLOW_STEP_APPROVED",
    params.documentType.toUpperCase().replace(/\s+/g, "_"),
    params.documentNumber,
    JSON.stringify({
      document_id: params.documentId,
      completed_step: completedStepRole,
      next_step: nextStepRole,
      is_final: allStepsDone,
      actor_role: params.user.role,
      actor_level: params.user.level,
      note: params.note || null,
    }),
  );

  const finalRow = db.prepare("SELECT * FROM workflow_approvals WHERE id = ?").get(current.id) as any;
  return {
    ok: true,
    isFinalStep: allStepsDone,
    approval: enrichWorkflowApprovalRow(finalRow, params.user),
    completedStepRole,
    nextStepRole,
  };
}
