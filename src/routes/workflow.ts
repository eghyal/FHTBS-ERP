import { Router } from "express";
import db from "../db/database.ts";
import { requireRole, requireMinimumLevel } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { isValidDailyAuthKey } from "../utils/auth.ts";
import { syncProcurementTaskGantt } from "../utils/ganttUtils.ts";
import {
  syncAndGetActiveWorkflowApprovals,
  evaluateAllWorkflowSlas,
  recordWorkflowStepApproval,
} from "../services/workflowEngine.ts";
import crypto from "crypto";

export const router = Router();

router.get("/api/workflow/matrices", requireMinimumLevel("SUPERVISOR"), (req, res) => {
  try {
    const rows = db
      .prepare("SELECT * FROM workflow_matrices ORDER BY document_type ASC, min_amount ASC")
      .all() as any[];
    const matrices = rows.map((r) => {
      let parsedRoles: string[] = [];
      try {
        parsedRoles = JSON.parse(r.roles || "[]");
      } catch {
        parsedRoles = [String(r.roles || "MANAGER")];
      }
      return {
        ...r,
        roles: parsedRoles,
      };
    });
    res.json(matrices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch matrices" });
  }
});

router.post(
  "/api/workflow/matrices",
  requireRole(["FC", "DIRECTOR", "BOD", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const {
        id,
        document_type,
        min_amount,
        max_amount,
        roles,
        is_parallel,
      } = req.body;
      const targetId = id || `MATRIX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const existing = db
        .prepare("SELECT * FROM workflow_matrices WHERE id = ?")
        .get(targetId);

      const cleanRoles = Array.isArray(roles)
        ? roles.map((r) => String(r).trim()).filter(Boolean)
        : String(roles || "MANAGER")
            .split(",")
            .map((r) => r.trim())
            .filter(Boolean);

      db.prepare(
        `
      INSERT INTO workflow_matrices (id, document_type, min_amount, max_amount, roles, is_parallel)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        document_type = excluded.document_type,
        min_amount = excluded.min_amount,
        max_amount = excluded.max_amount,
        roles = excluded.roles,
        is_parallel = excluded.is_parallel
    `,
      ).run(
        targetId,
        document_type,
        Number(min_amount) || 0,
        max_amount !== null && max_amount !== undefined && max_amount !== "" ? Number(max_amount) : null,
        JSON.stringify(cleanRoles),
        is_parallel ? 1 : 0,
      );

      db.prepare(
        `
      INSERT INTO workflow_audit_logs (id, username, action, target_type, target_id, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      ).run(
        crypto.randomUUID(),
        (req as any).username || (req as any).user?.username || "FC",
        existing ? "UPDATE" : "CREATE",
        "MATRIX",
        targetId,
        JSON.stringify({ ...req.body, roles: cleanRoles }),
      );

      res.json({ success: true, id: targetId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to save matrix" });
    }
  },
);

router.delete(
  "/api/workflow/matrices/:id",
  requireRole(["FC", "DIRECTOR", "BOD", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const existing = db
        .prepare("SELECT * FROM workflow_matrices WHERE id = ?")
        .get(req.params.id);
      db.prepare("DELETE FROM workflow_matrices WHERE id = ?").run(
        req.params.id,
      );

      db.prepare(
        `
      INSERT INTO workflow_audit_logs (id, username, action, target_type, target_id, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      ).run(
        crypto.randomUUID(),
        (req as any).username || (req as any).user?.username || "FC",
        "DELETE",
        "MATRIX",
        req.params.id,
        JSON.stringify(existing),
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete matrix" });
    }
  },
);

router.get("/api/workflow/slas", requireMinimumLevel("SUPERVISOR"), (req, res) => {
  try {
    const slas = db
      .prepare("SELECT * FROM workflow_slas ORDER BY document_type ASC, sla_hours ASC")
      .all();
    res.json(slas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch slas" });
  }
});

router.post(
  "/api/workflow/slas",
  requireRole(["FC", "DIRECTOR", "BOD", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const { id, document_type, step, sla_hours, escalate_to } = req.body;
      const targetId = id || `SLA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const existing = db
        .prepare("SELECT * FROM workflow_slas WHERE id = ?")
        .get(targetId);

      db.prepare(
        `
      INSERT INTO workflow_slas (id, document_type, step, sla_hours, escalate_to)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        document_type = excluded.document_type,
        step = excluded.step,
        sla_hours = excluded.sla_hours,
        escalate_to = excluded.escalate_to
    `,
      ).run(targetId, document_type, step, Number(sla_hours) || 24, escalate_to);

      db.prepare(
        `
      INSERT INTO workflow_audit_logs (id, username, action, target_type, target_id, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      ).run(
        crypto.randomUUID(),
        (req as any).username || (req as any).user?.username || "FC",
        existing ? "UPDATE" : "CREATE",
        "SLA",
        targetId,
        JSON.stringify(req.body),
      );

      res.json({ success: true, id: targetId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to save SLA" });
    }
  },
);

router.delete(
  "/api/workflow/slas/:id",
  requireRole(["FC", "DIRECTOR", "BOD", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      const existing = db
        .prepare("SELECT * FROM workflow_slas WHERE id = ?")
        .get(req.params.id);
      db.prepare("DELETE FROM workflow_slas WHERE id = ?").run(
        req.params.id,
      );

      db.prepare(
        `
      INSERT INTO workflow_audit_logs (id, username, action, target_type, target_id, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      ).run(
        crypto.randomUUID(),
        (req as any).username || (req as any).user?.username || "FC",
        "DELETE",
        "SLA",
        req.params.id,
        JSON.stringify(existing),
      );

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete sla" });
    }
  },
);

// Live Active Workflow Approvals & Real-Time SLA Monitor
router.get("/api/workflow/active-approvals", requireMinimumLevel("SUPERVISOR"), (req, res) => {
  try {
    // Automatically run SLA check so overdue items are escalated in real-time
    evaluateAllWorkflowSlas("SYSTEM_SLA_MONITOR");

    const currentUser = {
      username: (req as any).username || (req as any).user?.username || "",
      role: (req as any).userRole || (req as any).user?.role || "",
      level: (req as any).userLevel || (req as any).user?.level || "STAFF",
    };

    const items = syncAndGetActiveWorkflowApprovals(currentUser);
    res.json({
      success: true,
      data: items,
    });
  } catch (err: any) {
    console.error("Failed to fetch active workflow approvals:", err);
    res.status(500).json({ error: "Failed to fetch active workflow approvals: " + err.message });
  }
});

// Trigger Manual/Scheduled SLA Evaluation & Auto-Escalation Sweep
router.post("/api/workflow/evaluate-slas", requireMinimumLevel("SUPERVISOR"), (req, res) => {
  try {
    const actor = (req as any).username || (req as any).user?.username || "SUPERVISOR";
    const result = evaluateAllWorkflowSlas(actor);
    res.json({
      success: true,
      ...result,
      message:
        result.newlyEscalatedCount > 0
          ? `${result.newlyEscalatedCount} document(s) exceeded SLA limits and were automatically escalated.`
          : `All ${result.evaluatedCount} active document(s) have been evaluated against SLA thresholds.`,
    });
  } catch (err: any) {
    console.error("Error evaluating SLAs:", err);
    res.status(500).json({ error: "Failed to evaluate SLAs: " + err.message });
  }
});

// Direct Multi-Step Approval Execution from Workflow Queue
router.post("/api/workflow/approve-step", requireMinimumLevel("SUPERVISOR"), (req, res) => {
  try {
    const { document_type, document_id, note, pin, fast_track_all } = req.body;
    if (!document_type || !document_id) {
      return res.status(400).json({ error: "document_type and document_id are required" });
    }

    const username = (req as any).username || (req as any).user?.username || "approver";
    const userRole = (req as any).userRole || (req as any).user?.role || "STAFF";
    const userLevel = (req as any).userLevel || (req as any).user?.level || "STAFF";
    const userName = (req as any).user?.name || username;

    if (pin && typeof pin === "string" && pin.trim() !== "") {
      if (!isValidDailyAuthKey(username, pin.trim())) {
        return res.status(400).json({ error: "Invalid 6-digit Daily Authorization PIN." });
      }
    }

    const existingWfa = db
      .prepare("SELECT * FROM workflow_approvals WHERE document_type = ? AND document_id = ?")
      .get(document_type, document_id) as any;

    const result = recordWorkflowStepApproval({
      documentType: document_type,
      documentId: document_id,
      documentNumber: existingWfa?.document_number || document_id,
      documentTitle: existingWfa?.document_title || document_id,
      department: existingWfa?.department || "GENERAL",
      amount: existingWfa?.amount || 0,
      user: {
        username,
        name: userName,
        role: userRole,
        level: userLevel,
      },
      note,
      executiveFastTrackAllSteps: Boolean(fast_track_all),
    });

    if (!result.ok) {
      return res.status(403).json({ error: result.error });
    }

    const signatureDoc = `Authorized by ${userName} (${userRole}/${userLevel}) on ${new Date().toISOString()}`;

    // Update step progress or finalize underlying ERP document
    if (document_type === "Purchase Request") {
      if (result.isFinalStep) {
        db.prepare(
          `UPDATE purchase_requests
           SET status = 'AUTHORIZED',
               authorized_at = CURRENT_TIMESTAMP,
               authorized_doc = ?,
               workflow_step_index = ?,
               workflow_total_steps = ?,
               workflow_current_role = 'COMPLETED'
           WHERE id = ?`,
        ).run(
          signatureDoc,
          result.approval.required_roles.length,
          result.approval.required_roles.length,
          document_id,
        );
        syncProcurementTaskGantt(document_id);
      } else {
        db.prepare(
          `UPDATE purchase_requests
           SET workflow_step_index = ?,
               workflow_total_steps = ?,
               workflow_current_role = ?,
               step_started_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(
          result.approval.current_step_index,
          result.approval.required_roles.length,
          result.nextStepRole,
          document_id,
        );
      }
    } else if (document_type === "Purchase Order") {
      if (result.isFinalStep) {
        db.prepare(
          `UPDATE purchase_orders
           SET status = 'ISSUED',
               authorized_at = CURRENT_TIMESTAMP,
               auth_doc_name = ?,
               workflow_step_index = ?,
               workflow_total_steps = ?,
               workflow_current_role = 'COMPLETED'
           WHERE id = ?`,
        ).run(
          signatureDoc,
          result.approval.required_roles.length,
          result.approval.required_roles.length,
          document_id,
        );
      } else {
        db.prepare(
          `UPDATE purchase_orders
           SET status = 'PENDING',
               workflow_step_index = ?,
               workflow_total_steps = ?,
               workflow_current_role = ?,
               step_started_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(
          result.approval.current_step_index,
          result.approval.required_roles.length,
          result.nextStepRole,
          document_id,
        );
      }
    } else if (document_type === "Quotation") {
      if (result.isFinalStep) {
        db.prepare(
          `UPDATE quotations
           SET status = 'APPROVED',
               workflow_step_index = ?,
               workflow_total_steps = ?,
               workflow_current_role = 'COMPLETED'
           WHERE id = ?`,
        ).run(
          result.approval.required_roles.length,
          result.approval.required_roles.length,
          document_id,
        );
      } else {
        db.prepare(
          `UPDATE quotations
           SET workflow_step_index = ?,
               workflow_total_steps = ?,
               workflow_current_role = ?,
               step_started_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(
          result.approval.current_step_index,
          result.approval.required_roles.length,
          result.nextStepRole,
          document_id,
        );
      }
    } else if (document_type === "General Request") {
      if (result.isFinalStep) {
        db.prepare(
          `UPDATE general_requests
           SET status = 'APPROVED',
               approved_by = ?,
               approved_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               workflow_step_index = ?,
               workflow_total_steps = ?,
               workflow_current_role = 'COMPLETED'
           WHERE id = ?`,
        ).run(
          username,
          result.approval.required_roles.length,
          result.approval.required_roles.length,
          document_id,
        );
      } else {
        db.prepare(
          `UPDATE general_requests
           SET workflow_step_index = ?,
               workflow_total_steps = ?,
               workflow_current_role = ?,
               step_started_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(
          result.approval.current_step_index,
          result.approval.required_roles.length,
          result.nextStepRole,
          document_id,
        );
      }
    } else if (document_type === "Workspace Document") {
      if (result.isFinalStep) {
        const nowIso = new Date().toISOString();
        db.prepare(
          `UPDATE workspace_documents
           SET status = 'APPROVED',
               approved_by = ?,
               approved_by_username = ?,
               approved_by_role = ?,
               approved_at = ?,
               updated_at = ?
           WHERE id = ?`,
        ).run(userName, username, userRole, nowIso, nowIso, document_id);
      }
    }

    logAudit(
      username,
      result.isFinalStep ? "WORKFLOW_FINAL_APPROVE" : "WORKFLOW_STEP_APPROVE",
      document_type.toUpperCase(),
      document_id,
      `Approved step [${result.completedStepRole}] for ${result.approval.document_number}. ${
        result.isFinalStep ? "All steps complete (FINAL)." : `Next step: ${result.nextStepRole}`
      }`,
    );

    res.json({
      success: true,
      is_final_step: result.isFinalStep,
      completed_step: result.completedStepRole,
      next_step: result.nextStepRole,
      approval: result.approval,
      message: result.isFinalStep
        ? `All authorization matrix stages for ${result.approval.document_number} are complete. Document is officially approved!`
        : `Stage [${result.completedStepRole}] approved. Document routed to next stage: [${result.nextStepRole}].`,
    });
  } catch (err: any) {
    console.error("Error approving workflow step:", err);
    res.status(500).json({ error: "Failed to approve workflow step: " + err.message });
  }
});

router.get("/api/workflow/audit_logs", requireMinimumLevel("SUPERVISOR"), (req, res) => {
  try {
    const logs = db
      .prepare(
        "SELECT * FROM workflow_audit_logs ORDER BY created_at DESC LIMIT 100",
      )
      .all();
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});


