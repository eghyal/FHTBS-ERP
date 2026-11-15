import { Router } from "express";
import crypto from "crypto";
import db from "../db/database.ts";
import { requireRole, getActor, type AuthenticatedRequest } from "../middleware/auth.ts";
import { isValidDailyAuthKey } from "../utils/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { syncCollectionToFirestore } from "../db/firebaseSync.ts";
import {
  evaluateClosingWindow,
  assertClosingWindowOpen,
  resolvePeriodKey,
  buildFullClosingWorkspaceState,
  createClosingSnapshot,
  ensureAccountingPeriodExists,
} from "../utils/closingEngine.ts";

export const closingRouter = Router();

const REOPEN_ALLOWED_ROLES = ["BOD", "FC", "DIRECTOR"];

function isFinanceCloserAuthorized(req: AuthenticatedRequest): boolean {
  const role = String(req.userRole || req.user?.role || "").trim().toUpperCase();
  const level = String(req.userLevel || req.user?.level || "").trim().toUpperCase();
  if (["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN", "SUPER_ADMIN", "GOD_MODE"].includes(role)) {
    return true;
  }
  if (level === "SUPER_ADMIN") return true;
  if (role === "FINANCE" && (level === "MANAGER" || level === "SUPERVISOR")) return true;
  return false;
}

function getAllChecklistSyncRow(itemId: string) {
  return db.prepare("SELECT * FROM closing_required_items WHERE id = ?").get(itemId) as any;
}

// 1. Lightweight Closing Summary for Proactive ERP Reminder Banners
closingRouter.get(
  "/api/finance/closing-status/summary",
  requireRole(["FC", "BOD", "ADMIN", "FINANCE", "HR", "WAREHOUSE", "DIRECTOR", "SALES", "PURCHASING", "PRODUCTION"]),
  (req, res) => {
    try {
      const windowStatus = evaluateClosingWindow();
      const targetKey = req.query.period_key
        ? resolvePeriodKey(null, null, String(req.query.period_key))
        : windowStatus.default_closing_period_key;

      const state = buildFullClosingWorkspaceState(db, targetKey);
      const pendingItems = (state.items || [])
        .filter((i: any) => i.is_required && i.status !== "VERIFIED")
        .map((i: any) => ({
          id: i.id,
          item_code: i.item_code,
          title: i.title,
          assigned_role: i.assigned_role,
          requirement_type: i.requirement_type,
          status: i.status,
          due_day: i.due_day,
        }));

      res.json({
        success: true,
        period_key: state.period?.period_key || targetKey,
        period_name: state.period?.period_name || state.financial_preview?.period_name,
        period_status: state.period?.status || "OPEN",
        window_status: windowStatus,
        checklist_summary: state.checklist_summary,
        hris_prq_status: {
          prq_status: state.hris_prq_summary?.prq_status || "MISSING",
          payroll_status: state.hris_prq_summary?.payroll_status || "MISSING",
          is_reconciled: Boolean(state.hris_prq_summary?.is_reconciled),
        },
        pending_items: pendingItems,
        gates: state.gates,
      });
    } catch (e: any) {
      console.error("[ClosingSummary] Error:", e);
      res.status(500).json({ error: e?.message || "Failed to load book closing summary." });
    }
  },
);

// 2. Full Book-Closing Workspace Payload for a Period
closingRouter.get(
  "/api/finance/closing/:periodKey",
  requireRole(["FC", "BOD", "ADMIN", "FINANCE", "HR", "WAREHOUSE", "DIRECTOR"]),
  (req, res) => {
    try {
      const periodKey = resolvePeriodKey(null, null, req.params.periodKey);
      const state = buildFullClosingWorkspaceState(db, periodKey);
      res.json({ success: true, ...state });
    } catch (e: any) {
      console.error("[ClosingWorkspace] Error:", e);
      res.status(500).json({ error: e?.message || "Failed to load book closing workspace." });
    }
  },
);

// 3. Add Custom Required Item (Active 15-24 Window Only, Period Not HARD_CLOSED)
closingRouter.post(
  "/api/finance/closing/:periodKey/items",
  requireRole(["FC", "BOD", "ADMIN", "FINANCE"]),
  (req, res) => {
    try {
      assertClosingWindowOpen();
      const periodKey = resolvePeriodKey(null, null, req.params.periodKey);
      const period = ensureAccountingPeriodExists(db, periodKey);

      if (period.status === "HARD_CLOSED") {
        return res.status(400).json({
          error: `Period ${periodKey} is HARD_CLOSED and permanently locked.`,
        });
      }

      const {
        title,
        description,
        category = "ADJUSTMENT",
        assigned_role = "FINANCE",
        requirement_type = "UPLOAD_AND_FORM",
        due_day = 24,
        form_schema = [],
      } = req.body;

      if (!title || String(title).trim().length < 3) {
        return res.status(400).json({ error: "Item title must be at least 3 characters." });
      }
      if (!["UPLOAD_AND_FORM", "FORM_ONLY"].includes(requirement_type)) {
        return res.status(400).json({ error: "Custom item type must be UPLOAD_AND_FORM or FORM_ONLY." });
      }

      const itemCode = `REQ_CUSTOM_${Date.now().toString(36).toUpperCase()}`;
      const id = `CRI-${periodKey}-${itemCode}`;
      const defaultSchema =
        Array.isArray(form_schema) && form_schema.length > 0
          ? form_schema
          : [
              {
                key: "notes",
                label: "Verification Notes",
                type: "textarea",
                required: true,
                placeholder: "Enter supporting details or reconciliation summary...",
              },
            ];

      db.prepare(`
        INSERT INTO closing_required_items (
          id, period_key, item_code, category, title, description, assigned_role,
          requirement_type, is_required, due_day, status, form_schema_json, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'PENDING', ?, 99)
      `).run(
        id,
        periodKey,
        itemCode,
        String(category).toUpperCase(),
        String(title).trim(),
        String(description || "").trim(),
        String(assigned_role).toUpperCase(),
        requirement_type,
        Math.min(24, Math.max(15, Number(due_day) || 24)),
        JSON.stringify(defaultSchema),
      );

      const saved = getAllChecklistSyncRow(id);
      if (saved) syncCollectionToFirestore("closing_required_items", id, saved);

      logAudit(
        getActor(req),
        "ADD_CLOSING_REQUIRED_ITEM",
        "FINANCE_CLOSING",
        id,
        `Added custom required closing item '${title}' for ${periodKey}`,
      );

      res.status(201).json({ success: true, id, item: saved });
    } catch (e: any) {
      const msg = e?.message || "Failed to add closing item.";
      res.status(msg.startsWith("CLOSING_WINDOW_LOCKED") ? 403 : 400).json({ error: msg });
    }
  },
);

// 4. Delete Custom Required Item (Default 10 templates cannot be removed)
closingRouter.delete(
  "/api/finance/closing/:periodKey/items/:itemId",
  requireRole(["FC", "BOD", "ADMIN", "FINANCE"]),
  (req, res) => {
    try {
      assertClosingWindowOpen();
      const periodKey = resolvePeriodKey(null, null, req.params.periodKey);
      const period = ensureAccountingPeriodExists(db, periodKey);

      if (period.status === "HARD_CLOSED") {
        return res.status(400).json({ error: "Period is HARD_CLOSED and cannot be modified." });
      }

      const item = db
        .prepare("SELECT * FROM closing_required_items WHERE id = ? AND period_key = ?")
        .get(req.params.itemId, periodKey) as any;
      if (!item) {
        return res.status(404).json({ error: "Closing item not found." });
      }
      if (!String(item.item_code || "").startsWith("REQ_CUSTOM_")) {
        return res.status(403).json({
          error: "Standard ERP closing items cannot be deleted.",
        });
      }

      db.prepare("DELETE FROM closing_required_items WHERE id = ?").run(item.id);
      logAudit(
        getActor(req),
        "DELETE_CLOSING_REQUIRED_ITEM",
        "FINANCE_CLOSING",
        item.id,
        `Deleted custom closing item ${item.title} (${periodKey})`,
      );
      res.json({ success: true });
    } catch (e: any) {
      const msg = e?.message || "Failed to delete closing item.";
      res.status(msg.startsWith("CLOSING_WINDOW_LOCKED") ? 403 : 400).json({ error: msg });
    }
  },
);

// 5. Submit Form Values & Evidence Attachments for a Required Item
closingRouter.put(
  "/api/finance/closing/:periodKey/items/:itemId/submit",
  requireRole(["FC", "BOD", "ADMIN", "FINANCE", "HR", "WAREHOUSE", "DIRECTOR"]),
  (req, res) => {
    try {
      assertClosingWindowOpen();
      const periodKey = resolvePeriodKey(null, null, req.params.periodKey);
      const period = ensureAccountingPeriodExists(db, periodKey);

      if (period.status === "HARD_CLOSED") {
        return res.status(400).json({
          error: `Period ${periodKey} is HARD_CLOSED and permanently sealed.`,
        });
      }

      const item = db
        .prepare("SELECT * FROM closing_required_items WHERE id = ? AND period_key = ?")
        .get(req.params.itemId, periodKey) as any;

      if (!item) {
        return res.status(404).json({ error: "Closing item not found." });
      }
      if (item.requirement_type === "AUTO_GATE") {
        return res.status(400).json({
          error: "AUTO_GATE items are evaluated automatically by the ERP.",
        });
      }

      const payload = req.body.payload && typeof req.body.payload === "object" ? req.body.payload : {};
      const attachmentUrls: string[] = Array.isArray(req.body.attachment_urls)
        ? req.body.attachment_urls.map((u: any) => String(u || "").trim()).filter(Boolean)
        : [];

      let formSchema: any[] = [];
      try {
        formSchema = JSON.parse(item.form_schema_json || "[]");
      } catch {
        formSchema = [];
      }

      for (const field of formSchema) {
        if (!field.required) continue;
        const val = payload[field.key];
        if (field.type === "boolean") {
          if (val !== true) {
            return res.status(400).json({
              error: `Required confirmation '${field.label}' must be checked.`,
            });
          }
        } else if (field.type === "currency" || field.type === "number") {
          if (val === undefined || val === null || val === "" || isNaN(Number(val))) {
            return res.status(400).json({
              error: `Numeric field '${field.label}' is required.`,
            });
          }
        } else {
          if (val === undefined || val === null || String(val).trim() === "") {
            return res.status(400).json({
              error: `Required field '${field.label}' cannot be empty.`,
            });
          }
        }
      }

      if (item.requirement_type === "UPLOAD_AND_FORM" && attachmentUrls.length === 0) {
        return res.status(400).json({
          error: "At least one supporting document must be attached.",
        });
      }

      const actor = getActor(req);
      db.prepare(`
        UPDATE closing_required_items
        SET status = 'SUBMITTED',
            payload_json = ?,
            attachment_urls_json = ?,
            submitted_by = ?,
            submitted_at = CURRENT_TIMESTAMP,
            verified_by = NULL,
            verified_at = NULL,
            rejection_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        JSON.stringify(payload),
        JSON.stringify(attachmentUrls),
        actor,
        item.id,
      );

      const updated = getAllChecklistSyncRow(item.id);
      if (updated) syncCollectionToFirestore("closing_required_items", item.id, updated);

      logAudit(
        actor,
        "SUBMIT_CLOSING_ITEM",
        "FINANCE_CLOSING",
        item.id,
        `Submitted closing required item ${item.item_code} for ${periodKey} (${attachmentUrls.length} attachments)`,
      );

      res.json({ success: true, item: updated });
    } catch (e: any) {
      const msg = e?.message || "Failed to save closing item.";
      res.status(msg.startsWith("CLOSING_WINDOW_LOCKED") ? 403 : 400).json({ error: msg });
    }
  },
);

// 6. Verify or Reject a Submitted Required Item (Finance Manager / FC / BOD)
closingRouter.put(
  "/api/finance/closing/:periodKey/items/:itemId/verify",
  requireRole(["FC", "BOD", "ADMIN", "FINANCE"]),
  (req: AuthenticatedRequest, res) => {
    try {
      assertClosingWindowOpen();
      if (!isFinanceCloserAuthorized(req)) {
        return res.status(403).json({
          error: "Access denied: Finance Manager/Supervisor, FC, or BOD authorization required.",
        });
      }

      const periodKey = resolvePeriodKey(null, null, req.params.periodKey);
      const period = ensureAccountingPeriodExists(db, periodKey);
      if (period.status === "HARD_CLOSED") {
        return res.status(400).json({
          error: "Period is HARD_CLOSED and cannot be modified.",
        });
      }

      const item = db
        .prepare("SELECT * FROM closing_required_items WHERE id = ? AND period_key = ?")
        .get(req.params.itemId, periodKey) as any;
      if (!item) {
        return res.status(404).json({ error: "Closing item not found." });
      }
      if (item.requirement_type === "AUTO_GATE") {
        return res.status(400).json({
          error: "AUTO_GATE items are verified automatically via source modules.",
        });
      }

      const action = String(req.body.action || "VERIFY").toUpperCase();
      if (!["VERIFY", "REJECT"].includes(action)) {
        return res.status(400).json({ error: "Action must be VERIFY or REJECT." });
      }

      const actor = getActor(req);
      if (action === "VERIFY") {
        if (item.status !== "SUBMITTED" && item.status !== "VERIFIED") {
          return res.status(400).json({
            error: "Item must be SUBMITTED before verification.",
          });
        }
        db.prepare(`
          UPDATE closing_required_items
          SET status = 'VERIFIED',
              verified_by = ?,
              verified_at = CURRENT_TIMESTAMP,
              rejection_reason = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(actor, item.id);
      } else {
        const reason = String(req.body.rejection_reason || req.body.reason || "").trim();
        if (!reason) {
          return res.status(400).json({ error: "Revision reason is required." });
        }
        db.prepare(`
          UPDATE closing_required_items
          SET status = 'REJECTED',
              verified_by = NULL,
              verified_at = NULL,
              rejection_reason = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(reason, item.id);
      }

      const updated = getAllChecklistSyncRow(item.id);
      if (updated) syncCollectionToFirestore("closing_required_items", item.id, updated);

      logAudit(
        actor,
        action === "VERIFY" ? "VERIFY_CLOSING_ITEM" : "REJECT_CLOSING_ITEM",
        "FINANCE_CLOSING",
        item.id,
        `${action} closing item ${item.item_code} (${periodKey})`,
      );

      res.json({ success: true, item: updated });
    } catch (e: any) {
      const msg = e?.message || "Failed to verify closing item.";
      res.status(msg.startsWith("CLOSING_WINDOW_LOCKED") ? 403 : 400).json({ error: msg });
    }
  },
);

// 7. Soft-Lock Period for End-of-Month Reconciliation (15-24 Window Only)
closingRouter.post(
  "/api/finance/closing/:periodKey/soft-lock",
  requireRole(["FC", "BOD", "ADMIN", "FINANCE"]),
  (req: AuthenticatedRequest, res) => {
    try {
      assertClosingWindowOpen();
      if (!isFinanceCloserAuthorized(req)) {
        return res.status(403).json({
          error: "Access denied: Soft-Lock requires Finance Manager, FC, or BOD authorization.",
        });
      }

      const periodKey = resolvePeriodKey(null, null, req.params.periodKey);
      const period = ensureAccountingPeriodExists(db, periodKey);
      if (period.status === "HARD_CLOSED") {
        return res.status(400).json({
          error: "Period is HARD_CLOSED. Use BOD/FC reopen governance first.",
        });
      }

      const actor = getActor(req);
      const nowIso = new Date().toISOString();
      db.prepare(`
        UPDATE accounting_periods
        SET status = 'SOFT_LOCKED',
            locked_by = ?,
            locked_at = ?,
            notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(actor, nowIso, req.body.notes || null, period.id);

      const updatedPeriod = db.prepare("SELECT * FROM accounting_periods WHERE id = ?").get(period.id) as any;
      if (updatedPeriod) syncCollectionToFirestore("accounting_periods", period.id, updatedPeriod);

      logAudit(actor, "SOFT_LOCK_PERIOD", "ACCOUNTING_PERIOD", period.id, `Soft-locked period ${periodKey}`);
      res.json({ success: true, period: updatedPeriod });
    } catch (e: any) {
      const msg = e?.message || "Failed to soft-lock period.";
      res.status(msg.startsWith("CLOSING_WINDOW_LOCKED") ? 403 : 400).json({ error: msg });
    }
  },
);

// 8. Hard Close & Create Immutable Closing Snapshot (15-24 Window + 100% Required Items + PIN)
closingRouter.post(
  "/api/finance/closing/:periodKey/hard-close",
  requireRole(["FC", "BOD", "ADMIN", "FINANCE"]),
  (req: AuthenticatedRequest, res) => {
    try {
      assertClosingWindowOpen();
      if (!isFinanceCloserAuthorized(req)) {
        return res.status(403).json({
          error: "Access denied: Hard Close requires Finance Manager, FC, or BOD authorization.",
        });
      }

      const actor = getActor(req);
      const { pin, notes } = req.body;
      if (!pin || !isValidDailyAuthKey(actor, pin)) {
        return res.status(400).json({
          error: "Invalid Daily Authorization PIN for Hard Close.",
        });
      }

      const periodKey = resolvePeriodKey(null, null, req.params.periodKey);
      const state = buildFullClosingWorkspaceState(db, periodKey);

      if (state.period?.status === "HARD_CLOSED") {
        return res.status(400).json({ error: `Period ${periodKey} is already HARD_CLOSED.` });
      }

      if (!state.checklist_summary.all_required_satisfied) {
        return res.status(403).json({
          error: `Hard Close blocked: ${state.checklist_summary.required_pending} required item(s) remain unverified.`,
          missing_items: state.checklist_summary.pending_titles,
        });
      }

      if (!state.financial_preview.trial_balance_summary.is_balanced) {
        return res.status(400).json({
          error: "Hard Close blocked: Trial Balance is out of balance.",
        });
      }

      let snapshotMeta: any = null;
      db.transaction(() => {
        snapshotMeta = createClosingSnapshot(db, periodKey, actor, notes);
        const nowIso = new Date().toISOString();
        db.prepare(`
          UPDATE accounting_periods
          SET status = 'HARD_CLOSED',
              locked_by = COALESCE(locked_by, ?),
              locked_at = COALESCE(locked_at, ?),
              closed_by = ?,
              closed_at = ?,
              notes = COALESCE(?, notes)
          WHERE period_key = ?
        `).run(actor, nowIso, actor, nowIso, notes || null, periodKey);
      })();

      const sealedPeriod = db.prepare("SELECT * FROM accounting_periods WHERE period_key = ?").get(periodKey) as any;
      const sealedSnap = db.prepare("SELECT * FROM closing_snapshots WHERE id = ?").get(snapshotMeta.id) as any;
      if (sealedPeriod) syncCollectionToFirestore("accounting_periods", sealedPeriod.id, sealedPeriod);
      if (sealedSnap) syncCollectionToFirestore("closing_snapshots", sealedSnap.id, sealedSnap);

      logAudit(
        actor,
        "HARD_CLOSE_PERIOD",
        "ACCOUNTING_PERIOD",
        sealedPeriod?.id || periodKey,
        `Sealed HARD_CLOSED period ${periodKey} (Snapshot ${snapshotMeta.id} v${snapshotMeta.version})`,
      );

      res.json({
        success: true,
        period: sealedPeriod,
        snapshot: snapshotMeta,
      });
    } catch (e: any) {
      const msg = e?.message || "Failed to hard-close period.";
      res.status(msg.startsWith("CLOSING_WINDOW_LOCKED") ? 403 : 400).json({ error: msg });
    }
  },
);

// 9. Strictly Controlled Reopen of HARD_CLOSED Period (BOD / FC / DIRECTOR ONLY + Audit Log + PIN)
closingRouter.post(
  "/api/finance/closing/:periodKey/reopen",
  requireRole(["BOD", "FC", "DIRECTOR"]),
  (req: AuthenticatedRequest, res) => {
    try {
      const actorRole = String(req.userRole || req.user?.role || "").trim().toUpperCase();
      if (!REOPEN_ALLOWED_ROLES.includes(actorRole)) {
        return res.status(403).json({
          error: "Access denied: Only BOD or Finance Controller (FC) may reopen a HARD_CLOSED period.",
        });
      }

      const actor = getActor(req);
      const { pin, reopen_reason } = req.body;
      if (!pin || !isValidDailyAuthKey(actor, pin)) {
        return res.status(400).json({ error: "Invalid BOD/FC Daily Authorization PIN." });
      }
      if (!reopen_reason || String(reopen_reason).trim().length < 10) {
        return res.status(400).json({
          error: "Audit reason must be at least 10 characters.",
        });
      }

      const periodKey = resolvePeriodKey(null, null, req.params.periodKey);
      const period = db.prepare("SELECT * FROM accounting_periods WHERE period_key = ?").get(periodKey) as any;
      if (!period) {
        return res.status(404).json({ error: `Period ${periodKey} not found.` });
      }
      if (period.status !== "HARD_CLOSED") {
        return res.status(400).json({
          error: `Period ${periodKey} is not HARD_CLOSED (current: ${period.status}).`,
        });
      }

      const cleanReason = String(reopen_reason).trim();
      const nowIso = new Date().toISOString();

      db.prepare(`
        UPDATE accounting_periods
        SET status = 'SOFT_LOCKED',
            reopened_by = ?,
            reopened_at = ?,
            reopen_reason = ?,
            reopen_count = COALESCE(reopen_count, 0) + 1
        WHERE id = ?
      `).run(actor, nowIso, cleanReason, period.id);

      const updatedPeriod = db.prepare("SELECT * FROM accounting_periods WHERE id = ?").get(period.id) as any;
      if (updatedPeriod) syncCollectionToFirestore("accounting_periods", period.id, updatedPeriod);

      logAudit(
        actor,
        "REOPEN_HARD_CLOSED_PERIOD",
        "ACCOUNTING_PERIOD",
        period.id,
        `BOD/FC (${actorRole}) reopened HARD_CLOSED period ${periodKey} -> SOFT_LOCKED. Reason: ${cleanReason}`,
      );

      res.json({ success: true, period: updatedPeriod });
    } catch (e: any) {
      console.error("[ReopenPeriod] Error:", e);
      res.status(500).json({ error: e?.message || "Failed to reopen HARD_CLOSED period." });
    }
  },
);

// 10. Official Monthly Closing Financial Report Gate
// Blocked unless 100% Required Items VERIFIED (during 15-24 window) OR Sealed HARD_CLOSED Snapshot exists.
closingRouter.get(
  "/api/finance/closing/:periodKey/report",
  requireRole(["FC", "BOD", "ADMIN", "FINANCE", "DIRECTOR"]),
  (req, res) => {
    try {
      const periodKey = resolvePeriodKey(null, null, req.params.periodKey);
      const period = db.prepare("SELECT * FROM accounting_periods WHERE period_key = ?").get(periodKey) as any;

      if (period?.status === "HARD_CLOSED") {
        const snapshot = db
          .prepare(
            "SELECT * FROM closing_snapshots WHERE period_key = ? ORDER BY version DESC, sealed_at DESC LIMIT 1",
          )
          .get(periodKey) as any;
        if (snapshot) {
          const tbParsed = JSON.parse(snapshot.trial_balance_json || "{}");
          return res.json({
            success: true,
            is_sealed_snapshot: true,
            snapshot_id: snapshot.id,
            version: snapshot.version,
            sealed_by: snapshot.sealed_by,
            sealed_at: snapshot.sealed_at,
            period,
            summary: JSON.parse(snapshot.summary_json || "{}"),
            pnl: JSON.parse(snapshot.pnl_json || "{}"),
            trial_balance: tbParsed.rows || [],
            trial_balance_summary: tbParsed.summary || {},
            balance_sheet: tbParsed.balance_sheet || {},
            hris_prq_summary: JSON.parse(snapshot.prq_summary_json || "{}"),
            checklist_manifest: JSON.parse(snapshot.checklist_manifest_json || "[]"),
            tax_bank_summary: JSON.parse(snapshot.tax_bank_summary_json || "{}"),
          });
        }
      }

      // Unsealed period: strictly enforce 15-24 closing schedule AND 100% Required Items verified
      assertClosingWindowOpen();
      const state = buildFullClosingWorkspaceState(db, periodKey);

      if (!state.checklist_summary.all_required_satisfied) {
        return res.status(403).json({
          error: `Monthly report locked: ${state.checklist_summary.required_pending} required item(s) pending verification.`,
          missing_items: state.checklist_summary.pending_titles,
          checklist_summary: state.checklist_summary,
        });
      }

      if (!state.financial_preview.trial_balance_summary.is_balanced) {
        return res.status(400).json({
          error: "Monthly report blocked: Trial Balance is out of balance.",
        });
      }

      res.json({
        success: true,
        is_sealed_snapshot: false,
        period: state.period,
        window_status: state.window_status,
        pnl: state.financial_preview.pnl,
        trial_balance: state.financial_preview.trial_balance,
        trial_balance_summary: state.financial_preview.trial_balance_summary,
        balance_sheet: state.financial_preview.balance_sheet,
        hris_prq_summary: state.hris_prq_summary,
        checklist_manifest: state.items,
        tax_bank_summary: state.financial_preview.tax_bank_summary,
      });
    } catch (e: any) {
      const msg = e?.message || "Failed to generate monthly closing report.";
      res.status(msg.startsWith("CLOSING_WINDOW_LOCKED") ? 403 : 400).json({ error: msg });
    }
  },
);
