import { Router } from "express";
import db from "../../db/database.ts";
import { syncCollectionToFirestore, deleteDocFromFirestore } from "../../db/firebaseSync.ts";
import crypto from "crypto";
import QRCode from "qrcode";
import { requireRole, getActor } from "../../middleware/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { isValidDailyAuthKey } from "../../utils/auth.ts";
import { syncProjectGanttTasks } from "../../utils/ganttUtils.ts";
import { generateSignedWotQr, verifyAndParseWotQr, signWotPayload } from "../../utils/qrCrypto.ts";

import {
  handleCreateNdp,
  handleGetNdps,
  handleGetActiveNdps,
  handleGetNdpImpactAnalysis,
  handlePreviewImpact,
  handleRescheduleTrigger,
  handleResolveNdp,
  emitProductionUpdate,
  preemptiveAutoPauseConflictingSteps,
} from "./utils.ts";

export const ndpRouter = Router();

ndpRouter.post("/api/production/ndp", handleCreateNdp);

ndpRouter.post("/api/ndps", handleCreateNdp);

ndpRouter.get("/api/production/ndp", handleGetNdps);

ndpRouter.get("/api/ndps", handleGetNdps);

ndpRouter.get("/api/production/ndp/active", handleGetActiveNdps);

ndpRouter.get("/api/ndps/active", handleGetActiveNdps);

ndpRouter.get("/api/production/projects/:id/ndps", (req, res) => {
  try {
    const { id } = req.params;
    const ndps = db.prepare(`
      SELECT n.*, p.name as project_name, p.spk_number,
             i.name as machine_name, i.item_code as machine_code, i.capacity_per_hour
      FROM notice_to_down_processes n
      LEFT JOIN projects p ON n.project_id = p.id
      LEFT JOIN items i ON (n.machine_id = i.id OR n.affected_machine_id = i.id)
      WHERE n.project_id = ?
         OR n.project_id = (SELECT spk_number FROM projects WHERE id = ?)
         OR n.project_id = (SELECT id FROM projects WHERE spk_number = ?)
      ORDER BY n.created_at DESC
    `).all(id, id, id) as any[];

    const formatted = ndps.map(n => ({
      ...n,
      ripple_analysis: n.ripple_analysis ? JSON.parse(n.ripple_analysis) : null
    }));

    res.json({ ok: true, success: true, ndps: formatted, data: formatted });
  } catch (err: any) {
    console.error("Error fetching project NDPs:", err);
    res.status(500).json({ error: err.message });
  }
});

ndpRouter.get("/api/ndps/:id/impact-analysis", handleGetNdpImpactAnalysis);

ndpRouter.get("/api/production/ndp/:id/impact-analysis", handleGetNdpImpactAnalysis);

ndpRouter.get("/api/ndps/preview-impact", handlePreviewImpact);

ndpRouter.get("/api/production/ndp/preview-impact", handlePreviewImpact);

ndpRouter.post("/api/ndps/:id/reschedule-trigger", handleRescheduleTrigger);

ndpRouter.post("/api/production/ndp/:id/reschedule-trigger", handleRescheduleTrigger);

ndpRouter.post("/api/production/ndp/:id/resolve", handleResolveNdp);

ndpRouter.patch("/api/ndps/:id/resolve", handleResolveNdp);

ndpRouter.post("/api/production/ndp/:id/resume", (req, res) => {
      try {
        const { id } = req.params;
        const ndp = db.prepare(`SELECT * FROM notice_to_down_processes WHERE id = ?`).get(id) as any;
        if (!ndp) {
          return res.status(404).json({ error: "NDP not found" });
        }

        const startTime = new Date(ndp.down_started_at).getTime();
        const now = Date.now();
        const downMinutes = Math.max(1, Math.round((now - startTime) / (1000 * 60)));
        const userIdentifier = getActor(req);

        const runTransaction = db.transaction(() => {
          db.prepare(`
            UPDATE notice_to_down_processes
            SET status = 'RESOLVED', resumed_at = CURRENT_TIMESTAMP, actual_down_minutes = ?
            WHERE id = ?
          `).run(downMinutes, id);

          // Apply preemptive auto-pause for conflicting running steps assigned to the same operator
          preemptiveAutoPauseConflictingSteps(ndp.bop_id, ndp.project_id, userIdentifier);

          // Return task to RUNNING
          db.prepare(`UPDATE bill_of_processes SET status = 'RUNNING', is_manual_pause = 0, pause_type = 'NONE' WHERE id = ?`).run(ndp.bop_id);
          db.prepare(`UPDATE project_tasks SET status = 'RUNNING', is_manual_pause = 0, pause_type = 'NONE' WHERE id = ?`).run(ndp.bop_id);

          // Dual-write to Firestore
          const nowIso = new Date().toISOString();
          syncCollectionToFirestore("notice_to_down_processes", id, {
             id, status: 'RESOLVED', resumed_at: nowIso, actual_down_minutes: downMinutes
          });
          syncCollectionToFirestore("bill_of_processes", ndp.bop_id, {
             id: ndp.bop_id, project_id: ndp.project_id, status: 'RUNNING', is_manual_pause: 0, pause_type: 'NONE'
          });

          // Resume operator allocations
          db.prepare(`
            UPDATE production_manpower_assignments
            SET status = 'ACTIVE'
            WHERE bop_id = ? AND status = 'PAUSED_NDP'
          `).run(ndp.bop_id);

          logAudit(userIdentifier, "NDP_RESOLVED", "NDP", id, `Resolved downtime NDP ${ndp.ndp_number}. Task resumed.`);
        });

        runTransaction();

        emitProductionUpdate("BOP_STATUS_CHANGED", { bopId: ndp.bop_id, status: "RUNNING", projectId: ndp.project_id });
        emitProductionUpdate("NDP_RESOLVED", { ndpId: id, bopId: ndp.bop_id, projectId: ndp.project_id });

        res.json({ success: true, message: `Task resumed. Total downtime recorded: ${downMinutes} minutes.` });
      } catch (err: any) {
        console.error("Error resuming NDP:", err);
        res.status(500).json({ error: err.message });
      }
    });

ndpRouter.post("/api/production/ndp/procure", (req, res) => {
      try {
        const { project_id, ndp_number, item_id, qty, expected_delivery_date, urgency } = req.body;

        if (!project_id || !ndp_number || !item_id || !qty) {
          return res.status(400).json({ error: "Missing required fields for downtime procurement" });
        }

        // Retrieve item info
        const item = db.prepare("SELECT * FROM items WHERE id = ?").get(item_id) as any;
        if (!item) {
          return res.status(404).json({ error: "Selected item not found in catalog" });
        }

        const prId = "PR-" + Math.random().toString(36).substr(2, 9);
        const prNumber = "PR-" + new Date().getFullYear() + "-" + Math.floor(100000 + Math.random() * 900000);

        let deliveryDateStr = expected_delivery_date;
        if (!deliveryDateStr) {
          const d = new Date();
          d.setDate(d.getDate() + 5); // 5 days delivery for downtime recovery
          deliveryDateStr = d.toISOString().split("T")[0];
        }

        const activeUrgency = urgency || "CRITICAL";

        const runTx = db.transaction(() => {
          // 1. Insert into purchase_requests
          db.prepare(`
            INSERT INTO purchase_requests (
              id, pr_number, project_id, drawing_reference, status, urgency, category, expected_delivery_date
            ) VALUES (?, ?, ?, ?, 'DRAFTED', ?, 'PROJECT', ?)
          `).run(
            prId,
            prNumber,
            project_id,
            `Downtime Procurement recovery for NDP: ${ndp_number}`,
            activeUrgency,
            deliveryDateStr
          );

          // 2. Insert into pr_items
          db.prepare(`
            INSERT INTO pr_items (
              id, pr_id, item_id, qty, unit_price, expected_delivery_date, spec
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            "PRI-" + Math.random().toString(36).substr(2, 9),
            prId,
            item_id,
            Number(qty),
            Number(item.unit_price) || 0,
            deliveryDateStr,
            `Required to resolve downtime NDP: ${ndp_number}`
          );

          // 3. Post notification to general thread
          const threadId = "THREAD-GENERAL";
          const msgId = "SYS-" + Math.random().toString(36).substr(2, 9);
          const projectName = db.prepare("SELECT name FROM projects WHERE id = ?").get(project_id) as { name: string };
          
          db.prepare(`
            INSERT INTO chat_messages (id, thread_id, sender_username, content)
            VALUES (?, ?, ?, ?)
          `).run(
            msgId,
            threadId,
            "SYSTEM",
            `**CRITICAL PRODUCTION DOWNTIME PURCHASE REQUEST**\n\n**Downtime Event:** ${ndp_number}\n**Required Item:** ${item.name} (${item.item_code})\n**Quantity:** ${qty} ${item.uom}\n**Project:** ${projectName?.name || "Unknown"}\n**Urgency:** ${activeUrgency}\n\nImmediate procurement action is required to resume manufacturing operations!`
          );
        });

        runTx();

        res.json({ success: true, pr_number: prNumber, message: `Procurement request ${prNumber} created and linked to project.` });
      } catch (err: any) {
        console.error("Error creating downtime PR:", err);
        res.status(500).json({ error: err.message });
      }
    });

