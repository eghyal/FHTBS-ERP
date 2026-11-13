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
import { recalculateProjectFinancialSummary } from "../../services/projectHppService.ts";
import { postMaterialIssuanceJournal } from "../../utils/accountingBridge.ts";
import { calculateTieredOvertimePay } from "../../lib/hrisEngine.ts";
import { calculateWotCycleEstimation, computeStationManpowerBalancing } from "../../utils/wotCycle.ts";

import {
  emitProductionUpdate,
  syncProjectMaterialAndWakeProcesses,
  handleAcknowledgeFr,
  handleFulfillFr,
  handleRejectFr,
  handleCloseFr,
} from "./utils.ts";


export const cuttingRouter = Router();

cuttingRouter.post("/api/work-orders/:id/release", (req, res) => {
      try {
        const woId = req.params.id;
        const wo = db
          .prepare("SELECT * FROM work_orders WHERE id = ?")
          .get(woId) as any;
        if (!wo) return res.status(404).json({ error: "Work order not found" });
        if (["RELEASED", "IN_PROGRESS", "COMPLETED"].includes(String(wo.status || "").toUpperCase())) {
          return res.status(400).json({ error: `Work order is already in ${wo.status} state.` });
        }

        const transaction = db.transaction(() => {
          const lockWo = db
            .prepare(
              "UPDATE work_orders SET status = 'RELEASED', wip_status = 'IN_BUFFER' WHERE id = ? AND COALESCE(status, 'DRAFT') NOT IN ('RELEASED', 'IN_PROGRESS', 'COMPLETED')"
            )
            .run(woId);
          if (lockWo.changes === 0) {
            throw new Error("Work order has already been released or completed.");
          }

          // Hard Stock Reservation on Release with Pre-Flight Check
          const woItems = db
            .prepare("SELECT * FROM work_order_items WHERE wo_id = ?")
            .all(woId) as any[];

          // 1. Pre-flight check: Verify sufficient available free stock for all components
          for (const item of woItems) {
            const stockRow = db.prepare(`
              SELECT COALESCE(inv.available_qty, inv.free_stock, 0) as available_qty, i.name as item_name
              FROM inventory inv
              JOIN items i ON inv.item_id = i.id
              WHERE inv.item_id = (SELECT item_id FROM boms WHERE id = ?)
            `).get(item.bom_id) as { available_qty: number; item_name: string } | undefined;

            const freeStock = stockRow ? Number(stockRow.available_qty || 0) : 0;
            const required = Number(item.qty_to_consume || 0);

            if (freeStock < required) {
              throw new Error(
                `Insufficient stock for component "${stockRow?.item_name || 'Material'}". Required: ${required}, Available Free Stock: ${freeStock}`
              );
            }
          }

          const updateInventory = db.prepare(`
            UPDATE inventory 
            SET free_stock = free_stock - ?, 
                available_qty = MAX(0, COALESCE(available_qty, free_stock) - ?),
                allocated_stock = COALESCE(allocated_stock, 0) + ?,
                reserved_qty = COALESCE(reserved_qty, 0) + ?
            WHERE item_id = (SELECT item_id FROM boms WHERE id = ?) AND free_stock >= ?
          `);

          const recordMovement = db.prepare(`
            INSERT INTO stock_movements (id, item_id, project_id, type, qty, reference_id, recorded_by)
            VALUES (?, (SELECT item_id FROM boms WHERE id = ?), ?, 'ALLOCATION', ?, ?, ?)
          `);

          for (const item of woItems) {
            const info = updateInventory.run(
              item.qty_to_consume,
              item.qty_to_consume,
              item.qty_to_consume,
              item.qty_to_consume,
              item.bom_id,
              item.qty_to_consume
            );
            if (info.changes === 0) {
              throw new Error(`Insufficient stock for allocation of BOM item ${item.bom_id}`);
            }
            recordMovement.run(
              "MOV-" + Math.random().toString(36).substr(2, 9),
              item.bom_id,
              wo.project_id || null,
              item.qty_to_consume,
              woId,
              getActor(req),
            );
          }

          // Assign initial Work Center from routing if defined, or create auto-routing if missing
          let firstRouting = db.prepare(`
            SELECT work_center_id, step_sequence 
            FROM work_center_routings 
            WHERE project_id = ? 
            ORDER BY step_sequence ASC 
            LIMIT 1
          `).get(wo.project_id) as { work_center_id: string; step_sequence: number } | undefined;

          if (!firstRouting) {
            // Auto-generate project routing sequence from existing work centers
            const allCenters = db.prepare("SELECT id, name FROM work_centers ORDER BY name ASC").all() as any[];
            if (allCenters.length > 0) {
              const insertRouting = db.prepare(`
                INSERT INTO work_center_routings (id, project_id, step_sequence, work_center_id, operation_name, standard_cycle_time_mins)
                VALUES (?, ?, ?, ?, ?, ?)
              `);
              allCenters.forEach((center, idx) => {
                const routId = "ROUT-AUTO-" + Date.now() + "-" + idx + "-" + Math.random().toString(36).substring(2, 5);
                insertRouting.run(
                  routId,
                  wo.project_id,
                  idx + 1,
                  center.id,
                  `${center.name} Operation`,
                  30
                );
              });
              firstRouting = { work_center_id: allCenters[0].id, step_sequence: 1 };
            }
          }

          if (firstRouting) {
            db.prepare(
              "UPDATE work_orders SET status = 'RELEASED', current_work_center_id = ?, current_step_sequence = ?, wip_status = 'IN_BUFFER' WHERE id = ?",
            ).run(firstRouting.work_center_id, firstRouting.step_sequence, woId);

            db.prepare(`
              UPDATE work_centers 
              SET current_wip_count = (
                SELECT COUNT(*) FROM work_orders WHERE current_work_center_id = ? AND status IN ('RELEASED', 'IN_PROGRESS')
              ) WHERE id = ?
            `).run(firstRouting.work_center_id, firstRouting.work_center_id);
          }
        });

        transaction();
        if (wo.project_id) {
          try {
            syncProjectMaterialAndWakeProcesses(wo.project_id, getActor(req));
          } catch (e) {
            console.error("Error in syncProjectMaterialAndWakeProcesses on WO release:", e);
          }
        }
        res.json({ success: true });
      } catch (error: any) {
        console.error(error);
        res
          .status(400)
          .json({ error: error.message || "Failed to release work order" });
      }
    });

cuttingRouter.post("/api/work-orders/:id/complete", (req, res) => {
      try {
        const woId = req.params.id;
        const wo = db
          .prepare("SELECT * FROM work_orders WHERE id = ?")
          .get(woId) as any;
        if (!wo) return res.status(404).json({ error: "Work order not found" });
        if (String(wo.status || "").toUpperCase() === "COMPLETED") {
          return res.status(400).json({ error: "Work order is already completed." });
        }

        const prevWorkCenterId = wo.current_work_center_id;

        const transaction = db.transaction(() => {
          const updWo = db.prepare(
            "UPDATE work_orders SET status = 'COMPLETED', wip_status = 'COMPLETED', current_work_center_id = NULL, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND COALESCE(status, '') != 'COMPLETED'",
          ).run(woId);
          if (updWo.changes === 0) {
            throw new Error("Work order is already completed.");
          }

          // Consume Allocated & Reserved Stock on Complete safely (prevent negative values)
          const woItems = db
            .prepare("SELECT * FROM work_order_items WHERE wo_id = ?")
            .all(woId) as any[];

          const updateInventory = db.prepare(`
            UPDATE inventory 
            SET allocated_stock = MAX(0, COALESCE(allocated_stock, 0) - ?),
                reserved_qty = MAX(0, COALESCE(reserved_qty, 0) - ?),
                physical_qty = MAX(0, COALESCE(physical_qty, 0) - ?)
            WHERE item_id = (SELECT item_id FROM boms WHERE id = ?)
          `);

          const recordConsumption = db.prepare(`
            INSERT INTO stock_movements (id, item_id, project_id, type, qty, reference_id, recorded_by)
            VALUES (?, (SELECT item_id FROM boms WHERE id = ?), ?, 'CONSUMPTION', ?, ?, ?)
          `);

          const upsertBOMConsumption = db.prepare(`
            INSERT INTO bom_item_consumption (id, bom_id, qty_consumed)
            VALUES (?, ?, ?)
            ON CONFLICT(bom_id) DO UPDATE SET
              qty_consumed = bom_item_consumption.qty_consumed + excluded.qty_consumed,
              updated_at = CURRENT_TIMESTAMP
          `);

          for (const item of woItems) {
            const consumeQty = Number(item.qty_to_consume || 0);
            updateInventory.run(consumeQty, consumeQty, consumeQty, item.bom_id);
            recordConsumption.run(
              "MOV-" + Math.random().toString(36).substr(2, 9),
              item.bom_id,
              wo.project_id || null,
              -consumeQty,
              woId,
              getActor(req),
            );
            upsertBOMConsumption.run(
              "BIC-" + Math.random().toString(36).substr(2, 9),
              item.bom_id,
              consumeQty,
            );
          }

          if (prevWorkCenterId) {
            db.prepare(`
              UPDATE work_centers 
              SET current_wip_count = (
                SELECT COUNT(*) FROM work_orders WHERE current_work_center_id = ? AND status IN ('RELEASED', 'IN_PROGRESS')
              ) WHERE id = ?
            `).run(prevWorkCenterId, prevWorkCenterId);
          }
        });

        transaction();
        res.json({ success: true });
      } catch (error: any) {
        console.error(error);
        res
          .status(400)
          .json({ error: error.message || "Failed to complete work order" });
      }
    });

cuttingRouter.post("/api/production/work-orders/:id/move-wip", (req, res) => {
      try {
        const woId = req.params.id;
        const { to_work_center_id, step_sequence, operation_name, good_qty, scrap_qty, notes } = req.body;

        if (!to_work_center_id || step_sequence === undefined) {
          return res.status(400).json({ error: "Missing required fields: to_work_center_id, step_sequence" });
        }

        const wo = db.prepare("SELECT * FROM work_orders WHERE id = ?").get(woId) as any;
        if (!wo) return res.status(404).json({ error: "Work Order not found" });

        const from_work_center_id = wo.current_work_center_id;

        const destWc = db.prepare("SELECT * FROM work_centers WHERE id = ?").get(to_work_center_id) as any;
        if (!destWc) return res.status(404).json({ error: "Destination Work Center not found" });

        const currentWipRow = db.prepare(`
          SELECT COUNT(*) as count 
          FROM work_orders 
          WHERE current_work_center_id = ? AND status IN ('RELEASED', 'IN_PROGRESS') AND id != ?
        `).get(to_work_center_id, woId) as { count: number };

        const currentDestWip = currentWipRow?.count || 0;
        const wipLimit = Number(destWc.wip_limit || 20);

        if (currentDestWip >= wipLimit) {
          return res.status(400).json({
            error: `CONWIP Limit Reached: Work Center "${destWc.name}" is at maximum WIP capacity (${currentDestWip}/${wipLimit} units). Clear downstream bottlenecks before advancing.`,
            destWcName: destWc.name,
            currentDestWip,
            wipLimit,
          });
        }

        const transaction = db.transaction(() => {
          const movementId = "WIP-MOV-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
          db.prepare(`
            INSERT INTO wip_movements (id, work_order_id, from_work_center_id, to_work_center_id, step_sequence, good_qty, scrap_qty, operator_email, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            movementId,
            woId,
            from_work_center_id || null,
            to_work_center_id,
            step_sequence,
            good_qty || 1,
            scrap_qty || 0,
            getActor(req),
            notes || `Moved to ${destWc.name} (Step ${step_sequence}: ${operation_name || 'Processing'})`
          );

          db.prepare(`
            UPDATE work_orders 
            SET current_work_center_id = ?, 
                current_step_sequence = ?, 
                status = 'IN_PROGRESS', 
                wip_status = 'IN_PROCESS' 
            WHERE id = ?
          `).run(to_work_center_id, step_sequence, woId);

          if (from_work_center_id) {
            db.prepare(`
              UPDATE work_centers 
              SET current_wip_count = (
                SELECT COUNT(*) FROM work_orders WHERE current_work_center_id = ? AND status IN ('RELEASED', 'IN_PROGRESS')
              ) WHERE id = ?
            `).run(from_work_center_id, from_work_center_id);
          }

          db.prepare(`
            UPDATE work_centers 
            SET current_wip_count = (
              SELECT COUNT(*) FROM work_orders WHERE current_work_center_id = ? AND status IN ('RELEASED', 'IN_PROGRESS')
            ) WHERE id = ?
          `).run(to_work_center_id, to_work_center_id);

          logAudit(
            getActor(req),
            "MOVE_WIP_STAGE",
            "WORK_ORDER",
            woId,
            `Moved WO ${wo.wo_number} to ${destWc.name} (Step ${step_sequence})`
          );
        });

        transaction();
        res.json({ success: true, message: `Work Order ${wo.wo_number} moved to ${destWc.name}` });
      } catch (error: any) {
        console.error("Error moving WIP stage:", error);
        res.status(500).json({ error: error.message || "Failed to move WIP stage" });
      }
    });


cuttingRouter.post(["/api/production/bop", "/api/production/bop/sync"], (req, res) => {
      try {
        const { project_id, steps, auth_pin, eco_reason, is_draft } = req.body;
        if (!project_id || !Array.isArray(steps)) {
          return res.status(400).json({ error: "project_id and steps array are required" });
        }

        const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];
        if (typeof project_id === "string" && nonMfgIds.includes(project_id.toUpperCase())) {
          return res.status(400).json({ error: "Internal procurement categories cannot have BoP records." });
        }

        const callerRole = ((req as any).userRole || (req.headers["x-user-role"] as string) || "").toString().toUpperCase();
        if (callerRole === "PRODUCTION") {
          return res.status(403).json({
            error: "Akses ditolak. Divisi Produksi hanya memiliki hak Read-Only pada BOP. Pembuatan dan perubahan alur proses BOP dikelola oleh Engineering."
          });
        }

        const project = db.prepare("SELECT status, bop_status, bom_status FROM projects WHERE id = ?").get(project_id) as any;
        const projStatusUpper = (project?.status || "").toString().toUpperCase();
        
        if (!project || ["CLOSED", "CANCELLED", "FINISHED"].includes(projStatusUpper)) {
          return res.status(400).json({
            error: "Cannot modify BOP of a closed or cancelled project. Current status: " + (project?.status || "NOT FOUND"),
          });
        }

        // Enforce: Cannot submit BOP for approval if BOM is not authorized yet
        if (!is_draft) {
          const currentBomStatus = (project.bom_status || 'DRAFT').toUpperCase();
          if (currentBomStatus !== 'AUTHORIZED') {
            return res.status(400).json({
              error: `Tidak dapat mengajukan (submit) BOP untuk otorisasi karena Bill of Materials (BOM/BOQ) proyek ini belum ter-otorisasi (Status BOM saat ini: ${project.bom_status || 'DRAFT'}). Anda tetap dapat menyimpan alur proses sebagai Draft (SAVE DRAFT) sampai BOM disetujui.`,
              bom_not_authorized: true,
              current_bom_status: project.bom_status || 'DRAFT'
            });
          }

          // Enforce: Station requirement (>= 1 station) and all processes assigned
          const projectStations = db.prepare(`
            SELECT id, station_code, station_name FROM project_stations 
            WHERE project_id = ? 
               OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
               OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
            ORDER BY station_sequence ASC, station_code ASC
          `).all(project_id, project_id, project_id) as any[];
          if (projectStations.length < 1) {
            return res.status(400).json({
              error: "Validation Failed: At least 1 workstation must be registered (>= 1) before submitting BOP for approval.",
              no_stations: true
            });
          }

          const processSteps = steps.filter((s: any) => (s.node_type || "PROCESS") === "PROCESS");
          if (processSteps.length === 0) {
            return res.status(400).json({
              error: "Validation Failed: At least 1 manufacturing process step is required before submitting BOP for approval."
            });
          }

          const validStationIds = new Set(projectStations.flatMap((st: any) => [st.id, st.station_code].filter(Boolean)));
          const unassignedSteps = processSteps.filter((s: any) => !s.station_id || !validStationIds.has(s.station_id));
          if (unassignedSteps.length > 0) {
            const unassignedNames = unassignedSteps.map((s: any) => s.process_name || 'Unnamed Process').join(", ");
            return res.status(400).json({
              error: `Validation Failed: All processes must be assigned to a station before submitting for approval. Found ${unassignedSteps.length} unassigned process(es): ${unassignedNames}.`,
              unassigned_processes: unassignedSteps.map((s: any) => s.id)
            });
          }
        }

        const hasManufacturing = db.prepare("SELECT count(*) as c FROM work_orders WHERE project_id = ?").get(project_id) as any;
        const hasStartedTasks = db.prepare("SELECT count(*) as c FROM project_tasks WHERE project_id = ? AND progress > 0").get(project_id) as any;
        const isManufacturing = hasManufacturing.c > 0 || hasStartedTasks.c > 0 || project.status === "MANUFACTURING";

        const userIdentifier = getActor(req);
        const now = new Date().toISOString();
        const isAuthorizedState = project.bop_status === 'AUTHORIZED';
        const isEco = !is_draft && (isAuthorizedState || !!auth_pin || !!eco_reason);

        if (is_draft) {
          const currentBopStatus = project.bop_status || 'DRAFT';
          if (currentBopStatus !== 'PENDING' && currentBopStatus !== 'AUTHORIZED') {
            db.prepare("UPDATE projects SET bop_status = 'DRAFT' WHERE id = ?").run(project_id);
          }
        } else if (isEco) {
          if (!auth_pin) {
            return res.status(400).json({
              error: "BOP telah diotorisasi sebelumnya. Perubahan memerlukan otorisasi ECO dengan Daily Internal Auth Key (PIN).",
              require_eco: true,
            });
          }
          if (!isValidDailyAuthKey(userIdentifier, auth_pin)) {
            return res.status(400).json({ error: "Daily Internal Auth Key tidak valid atau salah." });
          }
          if (!eco_reason || !eco_reason.trim()) {
            return res.status(400).json({ error: "Alasan perubahan teknis (ECO Reason) wajib diisi." });
          }
          db.prepare("UPDATE projects SET bop_status = 'AUTHORIZED', bop_authorized_by = ?, bop_authorized_at = ?, bop_revision_note = NULL WHERE id = ?").run(userIdentifier, now, project_id);
          logAudit(userIdentifier, "ECO_SUBMITTED", "BOP", project_id, `BOP changed via ECO. Reason: ${eco_reason || "N/A"}`);
        } else {
          // Standard initial submission or re-submission from REVISION/DRAFT
          db.prepare("UPDATE projects SET bop_status = 'PENDING', bop_submitted_by = ?, bop_submitted_at = ?, bop_prepared_by = COALESCE(bop_prepared_by, ?), bop_prepared_at = COALESCE(bop_prepared_at, ?), bop_revision_note = NULL WHERE id = ?").run(userIdentifier, now, userIdentifier, now, project_id);
          logAudit(userIdentifier, "BOP_SUBMITTED", "BOP", project_id, `BOP submitted for approval by ${userIdentifier}`);
        }

        // Validate BOM Allocations
        const totalAllocations: Record<string, number> = {};
        for (const step of steps) {
          if (step.node_type === 'PRODUCT' && step.bom_allocations) {
            let allocations: any[] = [];
            try {
              allocations = typeof step.bom_allocations === 'string' ? JSON.parse(step.bom_allocations) : step.bom_allocations;
            } catch (e) {}
            if (Array.isArray(allocations)) {
              for (const alloc of allocations) {
                if (alloc.bom_id && alloc.fraction) {
                  totalAllocations[alloc.bom_id] = (totalAllocations[alloc.bom_id] || 0) + Number(alloc.fraction);
                  // Float precision fix
                  if (totalAllocations[alloc.bom_id] > 1.0001) {
                     return res.status(400).json({ error: `Total allocation for BOM item ${alloc.bom_id} exceeds 100%.` });
                  }
                }
              }
            }
          }
        }

        const runTransaction = db.transaction(() => {
          // Keep existing actual progress/status if updating
          const existing = db.prepare(`SELECT * FROM bill_of_processes WHERE project_id = ?`).all(project_id) as any[];
          const existingMap = new Map(existing.map(e => [e.id, e]));

          // Get new IDs
          const newStepIds = steps.map((s: any) => s.id).filter(Boolean);
          
          // Clean up dependent child tables first to avoid FOREIGN KEY constraint failed
          if (newStepIds.length > 0) {
            const placeholders = newStepIds.map(() => '?').join(',');
            try {
              db.prepare(`DELETE FROM task_travel_tags WHERE project_id = ? AND bop_id NOT IN (${placeholders})`).run(project_id, ...newStepIds);
            } catch (e) { console.warn("Travel tags clean error:", e); }
            try {
              db.prepare(`DELETE FROM notice_to_down_processes WHERE project_id = ? AND bop_id NOT IN (${placeholders})`).run(project_id, ...newStepIds);
            } catch (e) { console.warn("NDP clean error:", e); }
            try {
              db.prepare(`DELETE FROM production_manpower_assignments WHERE project_id = ? AND bop_id NOT IN (${placeholders})`).run(project_id, ...newStepIds);
            } catch (e) { console.warn("Manpower clean error:", e); }
            try {
              db.prepare(`DELETE FROM lot_routing_executions WHERE bop_id IN (SELECT id FROM bill_of_processes WHERE project_id = ? AND id NOT IN (${placeholders}))`).run(project_id, ...newStepIds);
            } catch (e) { console.warn("Lot exec clean error:", e); }

            db.prepare(`DELETE FROM bill_of_processes WHERE project_id = ? AND id NOT IN (${placeholders})`).run(project_id, ...newStepIds);
            db.prepare(`DELETE FROM project_tasks WHERE project_id = ? AND id NOT IN (${placeholders})`).run(project_id, ...newStepIds);
          } else {
            try { db.prepare(`DELETE FROM task_travel_tags WHERE project_id = ?`).run(project_id); } catch (e) {}
            try { db.prepare(`DELETE FROM notice_to_down_processes WHERE project_id = ?`).run(project_id); } catch (e) {}
            try { db.prepare(`DELETE FROM production_manpower_assignments WHERE project_id = ?`).run(project_id); } catch (e) {}
            try { db.prepare(`DELETE FROM lot_routing_executions WHERE bop_id IN (SELECT id FROM bill_of_processes WHERE project_id = ?)`).run(project_id); } catch (e) {}

            db.prepare(`DELETE FROM bill_of_processes WHERE project_id = ?`).run(project_id);
            db.prepare(`DELETE FROM project_tasks WHERE project_id = ?`).run(project_id);
          }

          try {
            db.exec("ALTER TABLE bill_of_processes ADD COLUMN qc_parameters_json TEXT DEFAULT '[]';");
          } catch (_) {}
          try {
            db.exec("ALTER TABLE bill_of_processes ADD COLUMN product_role TEXT;");
          } catch (_) {}

          const insertStmt = db.prepare(`
            INSERT INTO bill_of_processes (
              id, project_id, step_sequence, process_name, node_type, work_center_id, work_center_name,
              execution_type, predecessor_ids, standard_hours, manpower_allocated, shift_mode,
              start_date, end_date, actual_start_date, actual_end_date, status, progress, notes,
              completed_by_operator, completed_at_timestamp, cycle_time_minutes, qc_criteria, sop_instruction,
              bom_allocations, lifecycle_status, expected_yield_rate, station_id, assigned_machine_id,
              assigned_machine_ids_json, machine_efficiency_multiplier, setup_time_minutes, teardown_time_minutes,
              qc_parameters_json, product_role
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              step_sequence = excluded.step_sequence,
              process_name = excluded.process_name,
              node_type = excluded.node_type,
              work_center_id = excluded.work_center_id,
              work_center_name = excluded.work_center_name,
              execution_type = excluded.execution_type,
              predecessor_ids = excluded.predecessor_ids,
              standard_hours = excluded.standard_hours,
              manpower_allocated = excluded.manpower_allocated,
              shift_mode = excluded.shift_mode,
              start_date = excluded.start_date,
              end_date = excluded.end_date,
              notes = excluded.notes,
              cycle_time_minutes = excluded.cycle_time_minutes,
              qc_criteria = excluded.qc_criteria,
              sop_instruction = excluded.sop_instruction,
              bom_allocations = excluded.bom_allocations,
              lifecycle_status = excluded.lifecycle_status,
              expected_yield_rate = excluded.expected_yield_rate,
              station_id = excluded.station_id,
              assigned_machine_id = excluded.assigned_machine_id,
              assigned_machine_ids_json = excluded.assigned_machine_ids_json,
              machine_efficiency_multiplier = excluded.machine_efficiency_multiplier,
              setup_time_minutes = excluded.setup_time_minutes,
              teardown_time_minutes = excluded.teardown_time_minutes,
              qc_parameters_json = excluded.qc_parameters_json,
              product_role = excluded.product_role
          `);

          // Also mirror to project_tasks so existing Gantt charts/reporting stay in sync automatically
          const insertTaskStmt = db.prepare(`
            INSERT INTO project_tasks (
              id, project_id, task_name, work_center_id, required_hours, start_date, end_date,
              actual_start_date, actual_end_date, progress, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              task_name = excluded.task_name,
              work_center_id = excluded.work_center_id,
              required_hours = excluded.required_hours,
              start_date = excluded.start_date,
              end_date = excluded.end_date
          `);

          let cumulativeDayOffset = 0;
          const today = new Date();
          const todayIso = today.toISOString().split("T")[0];

          const allStepIds = new Set(steps.map((s: any) => String(s.id || "")));
          const outgoingCountByStepId = new Map<string, number>();
          steps.forEach((s: any) => {
            const preds = Array.isArray(s.predecessor_ids) ? s.predecessor_ids : [];
            preds.forEach((pid: any) => {
              const pStr = String(pid);
              if (allStepIds.has(pStr)) {
                outgoingCountByStepId.set(pStr, (outgoingCountByStepId.get(pStr) || 0) + 1);
              }
            });
          });

          steps.forEach((step: any, index: number) => {
            const bopId = step.id || `bop_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`;
            const prev = existingMap.get(bopId);
            
            const nodeType = step.node_type || 'PROCESS';
            const validPreds = (Array.isArray(step.predecessor_ids) ? step.predecessor_ids : []).filter((pid: any) =>
              allStepIds.has(String(pid)),
            );
            const incomingCount = validPreds.length;
            const outgoingCount = outgoingCountByStepId.get(String(bopId)) || 0;

            const resolvedProductRole =
              nodeType === "PRODUCT"
                ? incomingCount === 0
                  ? "MATERIAL_INPUT"
                  : outgoingCount > 0
                    ? "WIP_SUB_ASSY"
                    : "FINISHED_GOOD"
                : null;

            const standardHours = nodeType === 'PRODUCT' ? 0 : (Number(step.standard_hours) || Number(prev?.standard_hours) || 1);
            const manpower = nodeType === 'PRODUCT' ? 0 : (Number(step.manpower_allocated) || Number(prev?.manpower_allocated) || 1);
            const shiftMode = nodeType === 'PRODUCT' ? 0 : (Number(step.shift_mode) || Number(prev?.shift_mode) || 1);
            const durationDays = Math.max(1, Math.ceil(standardHours / 8));

            let startDate = step.start_date || prev?.start_date;
            let endDate = step.end_date || prev?.end_date;

            if (!startDate || startDate === "" || startDate === "null" || startDate === "undefined") {
              const startObj = new Date(today);
              if (step.execution_type === 'SERIAL') {
                startObj.setDate(startObj.getDate() + cumulativeDayOffset);
              }
              startDate = !isNaN(startObj.getTime()) ? startObj.toISOString().split("T")[0] : todayIso;
            }

            if (!endDate || endDate === "" || endDate === "null" || endDate === "undefined") {
              const startParsed = new Date(startDate);
              const endObj = !isNaN(startParsed.getTime()) ? new Date(startParsed) : new Date(today);
              endObj.setDate(endObj.getDate() + durationDays);
              endDate = !isNaN(endObj.getTime()) ? endObj.toISOString().split("T")[0] : todayIso;
            }

            // Guaranteed non-null fallback dates
            if (!startDate) startDate = todayIso;
            if (!endDate) endDate = startDate || todayIso;

            if (step.execution_type === 'SERIAL') {
              cumulativeDayOffset += durationDays;
            }

            const status = prev?.status || step.status || 'PENDING';
            const progress = prev?.progress || step.progress || 0;

            const cycleTimeMins = Number(step.cycle_time_minutes) || Number(prev?.cycle_time_minutes) || (standardHours > 0 ? standardHours * 60 : 15);

            // Sanitize work_center_id against work_centers foreign key constraint
            let targetWcId: string | null = step.work_center_id ? String(step.work_center_id).trim() : null;
            if (!targetWcId || targetWcId === "" || targetWcId === "undefined" || targetWcId === "null") {
              targetWcId = null;
            } else {
              const wcCheck = db.prepare("SELECT id FROM work_centers WHERE id = ?").get(targetWcId) as any;
              if (!wcCheck) {
                if (step.work_center_name && String(step.work_center_name).trim() !== "") {
                  const wcNameStr = String(step.work_center_name).trim();
                  const wcNameCheck = db.prepare("SELECT id FROM work_centers WHERE name = ? OR code = ?").get(wcNameStr, wcNameStr) as any;
                  if (wcNameCheck) {
                    targetWcId = wcNameCheck.id;
                  } else {
                    try {
                      db.prepare("INSERT OR IGNORE INTO work_centers (id, name, manpower_count, hours_per_day) VALUES (?, ?, 1, 8)")
                        .run(targetWcId, wcNameStr);
                    } catch (e) {
                      console.warn("Could not auto-insert work_center:", e);
                      targetWcId = null;
                    }
                  }
                } else {
                  targetWcId = null;
                }
              }
            }

            let bomAllocationsStr = '[]';
            if (nodeType === 'PRODUCT' && resolvedProductRole !== 'FINISHED_GOOD' && step.bom_allocations) {
              bomAllocationsStr = typeof step.bom_allocations === 'string' ? step.bom_allocations : JSON.stringify(step.bom_allocations);
            }

            let qcParamsList: any[] = [];
            if (nodeType === 'PRODUCT' && resolvedProductRole !== 'MATERIAL_INPUT') {
              if (Array.isArray(step.qc_parameters)) {
                qcParamsList = step.qc_parameters;
              } else if (typeof step.qc_parameters_json === 'string') {
                try {
                  qcParamsList = JSON.parse(step.qc_parameters_json || '[]');
                } catch (_) {}
              }
            }
            const qcParamsJsonStr = JSON.stringify(qcParamsList);
            const effectiveQcCriteria =
              nodeType === 'PRODUCT'
                ? qcParamsList.length > 0
                  ? qcParamsList
                      .map(
                        (p: any) =>
                          `${p.parameter_name}: ${p.specification}${
                            p.measurement_method ? ` [${p.measurement_method}]` : ""
                          }`,
                      )
                      .join("; ")
                  : step.qc_criteria || null
                : null;

            const effectiveStationId = step.station_id !== undefined ? (step.station_id || null) : (prev?.station_id || null);
            const effectiveAssignedMachineId = step.assigned_machine_id !== undefined ? (step.assigned_machine_id || null) : (prev?.assigned_machine_id || null);
            const effectiveAssignedMachineIdsJson = step.assigned_machine_ids_json !== undefined
              ? (typeof step.assigned_machine_ids_json === "string" ? step.assigned_machine_ids_json : JSON.stringify(step.assigned_machine_ids_json || []))
              : (prev?.assigned_machine_ids_json || (effectiveAssignedMachineId ? JSON.stringify([effectiveAssignedMachineId]) : "[]"));
            const effectiveSpeedMultiplier = Number(step.machine_efficiency_multiplier) || Number(prev?.machine_efficiency_multiplier) || 1.0;

            insertStmt.run(
              bopId,
              project_id,
              index + 1,
              step.process_name,
              nodeType,
              targetWcId,
              step.work_center_name || null,
              step.execution_type || 'SERIAL',
              JSON.stringify(validPreds),
              standardHours,
              manpower,
              shiftMode,
              startDate,
              endDate,
              prev?.actual_start_date || null,
              prev?.actual_end_date || null,
              status,
              progress,
              step.notes || null,
              prev?.completed_by_operator || null,
              prev?.completed_at_timestamp || null,
              cycleTimeMins,
              effectiveQcCriteria,
              step.sop_instruction || null,
              bomAllocationsStr,
              
              step.lifecycle_status || prev?.lifecycle_status || 'Planned',
              step.expected_yield_rate ?? 100.0,
              
              effectiveStationId,
              effectiveAssignedMachineId,
              effectiveAssignedMachineIdsJson,
              effectiveSpeedMultiplier,
              Number(step.setup_time_minutes ?? prev?.setup_time_minutes) || 0,
              Number(step.teardown_time_minutes ?? prev?.teardown_time_minutes) || 0,
              qcParamsJsonStr,
              resolvedProductRole
            );

            // Mirror into project_tasks
            insertTaskStmt.run(
              bopId,
              project_id,
              step.process_name,
              targetWcId,
              standardHours,
              startDate,
              endDate,
              prev?.actual_start_date || null,
              prev?.actual_end_date || null,
              progress,
              status
            );
          });
        });

        const existingBefore = db.prepare(`SELECT id FROM bill_of_processes WHERE project_id = ?`).all(project_id) as any[];
        const existingIdsBefore = new Set(existingBefore.map(e => e.id));

        try {
          db.pragma("foreign_keys = OFF;");
          runTransaction();
        } finally {
          db.pragma("foreign_keys = ON;");
        }

        // --- COMPREHENSIVE DUAL-WRITE & FIRESTORE SYNC ---
        const currentSavedRows = db.prepare("SELECT * FROM bill_of_processes WHERE project_id = ? ORDER BY step_sequence ASC").all(project_id) as any[];
        const currentSavedIds = new Set(currentSavedRows.map(r => r.id));

        // Insert ECO log entry if this update is an authorized ECO revision
        if (isEco) {
          try {
            const ecoId = `eco_bop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const ecoCount = (db.prepare("SELECT count(*) as c FROM eco_logs WHERE project_id = ? AND doc_type = 'BOP'").get(project_id) as any)?.c || 0;
            const ecoNum = `ECO-BOP-${project_id}-REV${String(ecoCount + 1).padStart(2, "0")}`;

            db.prepare(`
              INSERT INTO eco_logs (id, project_id, doc_type, eco_number, eco_reason, authorized_by, authorized_at, previous_bom, current_bom)
              VALUES (?, ?, 'BOP', ?, ?, ?, ?, ?, ?)
            `).run(
              ecoId,
              project_id,
              ecoNum,
              eco_reason || "BOP Process Routing & Workflow Technical Revision",
              userIdentifier,
              now,
              JSON.stringify(existingBefore || []),
              JSON.stringify(currentSavedRows || [])
            );
          } catch (ecoErr) {
            console.error("Failed to insert BOP ECO log:", ecoErr);
          }
        }

        // 1. Delete removed steps from Firestore
        for (const oldId of existingIdsBefore) {
          if (!currentSavedIds.has(oldId)) {
            deleteDocFromFirestore("bill_of_processes", oldId);
          }
        }

        // 2. Sync all current saved steps to Firestore
        for (const bopRow of currentSavedRows) {
          syncCollectionToFirestore("bill_of_processes", bopRow.id, bopRow);
        }

        // 3. Sync project record to Firestore
        const projRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(project_id) as any;
        if (projRow) {
          syncCollectionToFirestore("projects", project_id, projRow);
        }

        // 4. Recalculate Gantt Tasks based on updated BOP DAG Precedence Graph
        syncProjectGanttTasks(project_id);

        res.json({ success: true, message: "Bill of Process saved successfully", count: currentSavedRows.length });
      } catch (err: any) {
        console.error("Error saving BoP:", err);
        res.status(500).json({ error: err.message });
      }
    });

cuttingRouter.post(
      "/api/projects/:id/bop/authorize",
      requireRole(["ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]),
      (req, res) => {
        try {
          const userRole = ((req as any).userRole || (req.headers["x-user-role"] as string) || "").toString().toUpperCase();
          const userLevel = (req as any).userLevel;
          if (userRole === "PRODUCTION") {
            return res.status(403).json({ error: "Access denied. BOP Technical Authorization is restricted to Engineering." });
          }
          if (userRole !== "FC" && userRole !== "ADMIN" && userRole !== "SUPERADMIN" && userLevel !== "MANAGER" && !(req as any).userEmail?.includes("admin")) {
            return res.status(403).json({ error: "Access denied. Only Engineering Manager or FC/Admin can authorize BOP." });
          }

          const projectId = req.params.id;
          const { pin } = req.body;
          if (!pin) return res.status(400).json({ error: "PIN is required" });

          const proj = db.prepare("SELECT bom_status FROM projects WHERE id = ?").get(projectId) as any;
          if (proj && (proj.bom_status || 'DRAFT').toUpperCase() !== 'AUTHORIZED') {
            return res.status(400).json({
              error: `Tidak dapat mengotorisasi BOP karena Bill of Materials (BOM/BOQ) proyek ini belum ter-otorisasi (Status BOM saat ini: ${proj.bom_status || 'DRAFT'}). Otorisasi BOM terlebih dahulu.`,
              bom_not_authorized: true
            });
          }

          const projStations = db.prepare(`
            SELECT id, station_code FROM project_stations 
            WHERE project_id = ? 
               OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
               OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
          `).all(projectId, projectId, projectId) as any[];
          if (projStations.length < 1) {
            return res.status(400).json({
              error: "Cannot authorize BOP: At least 1 workstation must be registered (>= 1) for this project."
            });
          }

          const bopProcessSteps = db.prepare("SELECT id, process_name, station_id FROM bill_of_processes WHERE project_id = ? AND (node_type = 'PROCESS' OR node_type IS NULL)").all(projectId) as any[];
          if (bopProcessSteps.length === 0) {
            return res.status(400).json({
              error: "Cannot authorize BOP: At least 1 manufacturing process step is required."
            });
          }

          const validStationIds = new Set(projStations.flatMap((st: any) => [st.id, st.station_code].filter(Boolean)));
          const unassignedSteps = bopProcessSteps.filter(s => !s.station_id || !validStationIds.has(s.station_id));
          if (unassignedSteps.length > 0) {
            const unassignedNames = unassignedSteps.map((s: any) => s.process_name || 'Unnamed Process').join(", ");
            return res.status(400).json({
              error: `Cannot authorize BOP: All processes must be assigned to a station. Found ${unassignedSteps.length} unassigned process(es): ${unassignedNames}.`
            });
          }

          const userIdentifier = getActor(req);
          if (!isValidDailyAuthKey(userIdentifier, pin)) {
            return res.status(400).json({ error: "Invalid Daily Internal Auth Key." });
          }

          const now = new Date().toISOString();
          db.prepare("UPDATE projects SET bop_status = 'AUTHORIZED', bop_authorized_by = ?, bop_authorized_at = ?, bop_revision_note = NULL WHERE id = ?").run(userIdentifier, now, projectId);

          logAudit(userIdentifier, "BOP_AUTHORIZED", "BOP", projectId, `BOP Technical Routing Authorized by ${userIdentifier}`);
          res.json({ success: true, bop_status: 'AUTHORIZED', bop_authorized_by: userIdentifier, bop_authorized_at: now });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      }
    );

    // ========================================================
    // PHASE 2: PRODUCTION OPERATIONAL ACCEPTANCE
    // ========================================================
    cuttingRouter.post(
      "/api/production/projects/:id/production-accept",
      requireRole(["PPIC", "PRODUCTION", "FC", "ADMIN", "SUPERADMIN"]),
      (req, res) => {
        try {
          const userRole = ((req as any).userRole || (req.headers["x-user-role"] as string) || "").toString().toUpperCase();
          const userLevel = ((req as any).userLevel || (req.headers["x-user-level"] as string) || "").toString().toUpperCase();
          const isGodMode = ["FC", "ADMIN", "SUPERADMIN"].includes(userRole);

          if (!isGodMode && userLevel !== "MANAGER") {
            return res.status(403).json({ error: "Access denied. Only Production Manager or Admin can sign operational acceptance." });
          }

          const projectId = req.params.id;
          const { pin, notes } = req.body;
          if (!pin) {
            return res.status(400).json({ error: "Daily Internal Auth Key (PIN) is required" });
          }

          const userIdentifier = getActor(req);
          if (!isValidDailyAuthKey(userIdentifier, pin)) {
            return res.status(400).json({ error: "Daily Internal Auth Key tidak valid atau salah." });
          }

          const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
          if (!project) {
            return res.status(404).json({ error: "Project not found" });
          }

          // Strict prerequisite: Engineering Technical sign-off must be completed
          if ((project.bop_status || "").toUpperCase() !== "AUTHORIZED") {
            return res.status(400).json({
              error: "BOP must first be technically authorized by Engineering before Production Operational Acceptance."
            });
          }

          const now = new Date().toISOString();
          db.prepare(`
            UPDATE projects 
            SET production_acceptance_status = 'ACCEPTED',
                production_accepted_by = ?,
                production_accepted_at = ?,
                production_acceptance_notes = ?
            WHERE id = ?
          `).run(userIdentifier, now, notes || null, projectId);

          logAudit(
            userIdentifier,
            "PRODUCTION_BOP_ACCEPTED",
            "PROJECT",
            projectId,
            `BOP Operational Acceptance signed by Production Manager ${userIdentifier}`
          );

          emitProductionUpdate("PRODUCTION_BOP_ACCEPTED", {
            projectId,
            production_acceptance_status: "ACCEPTED",
            production_accepted_by: userIdentifier,
            production_accepted_at: now
          });

          const updatedProject = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
          try {
            syncCollectionToFirestore("projects", projectId, updatedProject);
          } catch (e) {}

          res.json({
            ok: true,
            success: true,
            production_acceptance_status: "ACCEPTED",
            production_accepted_by: userIdentifier,
            production_accepted_at: now,
            project: updatedProject
          });
        } catch (err: any) {
          console.error("Error signing production acceptance:", err);
          res.status(500).json({ error: err.message || "Failed to sign production acceptance" });
        }
      }
    );

cuttingRouter.post(
      "/api/projects/:id/bop/revise",
      requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC"]),
      (req, res) => {
        try {
          const userRole = (req as any).userRole;
          const userLevel = (req as any).userLevel;
          if (userRole !== "FC" && userLevel !== "MANAGER" && !(req as any).userEmail?.includes("admin")) {
            return res.status(403).json({ error: "Access denied. Only Manager or FC can revise BOP." });
          }

          const projectId = req.params.id;
          const { note } = req.body;
          if (!note) return res.status(400).json({ error: "Revision note is required" });

          const userIdentifier = getActor(req);

          db.prepare("UPDATE projects SET bop_status = 'REVISION', bop_revision_note = ? WHERE id = ?").run(note, projectId);

          logAudit(userIdentifier, "BOP_REVISION", "BOP", projectId, "BOP Marked for Revision. Note: " + note);
          res.json({ success: true, bop_status: 'REVISION', bop_revision_note: note });
        } catch (err: any) {
          res.status(500).json({ error: err.message });
        }
      }
    );


cuttingRouter.get("/api/floor-requests", (req, res) => {
      try {
        const { status, type, project_id, station_id, requested_by, limit = 100, page = 1 } = req.query;
        let query = `
          SELECT 
            fr.*,
            p.name as project_name,
            p.spk_number,
            st.station_name,
            st.station_code,
            pr.pr_number,
            pr.status as pr_status,
            bom_item.name as bom_item_name,
            bom_item.item_code as bom_item_code,
            tool_item.name as tool_item_name,
            tool_item.item_code as tool_item_code
          FROM floor_requests fr
          LEFT JOIN projects p ON fr.project_id = p.id
          LEFT JOIN stations st ON fr.station_id = st.id
          LEFT JOIN purchase_requests pr ON fr.pr_id = pr.id
          LEFT JOIN items bom_item ON fr.bom_item_id = bom_item.id
          LEFT JOIN items tool_item ON fr.tool_item_id = tool_item.id
          WHERE 1=1
        `;
        const params: any[] = [];
        if (status && status !== 'ALL') { query += " AND fr.status = ?"; params.push(status); }
        if (type && type !== 'ALL') { query += " AND fr.type = ?"; params.push(type); }
        if (project_id) { query += " AND fr.project_id = ?"; params.push(project_id); }
        if (station_id) { query += " AND fr.station_id = ?"; params.push(station_id); }
        if (requested_by) { query += " AND fr.requested_by = ?"; params.push(requested_by); }
        
        query += " ORDER BY fr.created_at DESC LIMIT ? OFFSET ?";
        const limitNum = Number(limit);
        const offsetNum = (Number(page) - 1) * limitNum;
        params.push(limitNum, offsetNum);
        
        const rawData = db.prepare(query).all(...params) as any[];
        const data = rawData.map(r => ({
          ...r,
          photo_urls: typeof r.photo_urls === 'string' ? JSON.parse(r.photo_urls || "[]") : (r.photo_urls || []),
          fulfillment_photo_urls: typeof r.fulfillment_photo_urls === 'string' ? JSON.parse(r.fulfillment_photo_urls || "[]") : (r.fulfillment_photo_urls || [])
        }));

        // Compute aggregate statistics for the side panel header & KPI widgets
        const statsRow = db.prepare(`
          SELECT 
            COUNT(*) as total_all,
            SUM(CASE WHEN DATE(created_at) = DATE('now') THEN 1 ELSE 0 END) as total_today,
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status IN ('ACKNOWLEDGED', 'IN_PROGRESS') THEN 1 ELSE 0 END) as in_progress_count,
            SUM(CASE WHEN status IN ('FULFILLED', 'RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) as fulfilled_count,
            AVG(CASE WHEN fulfilled_at IS NOT NULL THEN (julianday(fulfilled_at) - julianday(created_at)) * 24 * 60 ELSE NULL END) as avg_response_minutes
          FROM floor_requests
        `).get() as any;

        const totalAll = Number(statsRow?.total_all || 0);
        const fulfilledCount = Number(statsRow?.fulfilled_count || 0);
        const fulfillmentRate = totalAll > 0 ? Math.round((fulfilledCount / totalAll) * 100) : 100;

        res.json({ 
          ok: true, 
          data,
          total: totalAll,
          stats: {
            total_today: Number(statsRow?.total_today || 0),
            pending_count: Number(statsRow?.pending_count || 0),
            in_progress_count: Number(statsRow?.in_progress_count || 0),
            fulfilled_count: fulfilledCount,
            avg_response_minutes: Math.round(Number(statsRow?.avg_response_minutes || 14)),
            fulfillment_rate: fulfillmentRate
          }
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

cuttingRouter.get("/api/floor-requests/:id", (req, res) => {
      try {
        const { id } = req.params;
        const r = db.prepare(`
          SELECT 
            fr.*,
            p.name as project_name,
            p.spk_number,
            st.station_name,
            pr.pr_number,
            pr.status as pr_status,
            bom_item.name as bom_item_name,
            tool_item.name as tool_item_name
          FROM floor_requests fr
          LEFT JOIN projects p ON fr.project_id = p.id
          LEFT JOIN stations st ON fr.station_id = st.id
          LEFT JOIN purchase_requests pr ON fr.pr_id = pr.id
          LEFT JOIN items bom_item ON fr.bom_item_id = bom_item.id
          LEFT JOIN items tool_item ON fr.tool_item_id = tool_item.id
          WHERE fr.id = ?
        `).get(id) as any;

        if (!r) return res.status(404).json({ error: "Floor request not found" });

        res.json({
          ok: true,
          data: {
            ...r,
            photo_urls: typeof r.photo_urls === 'string' ? JSON.parse(r.photo_urls || "[]") : (r.photo_urls || []),
            fulfillment_photo_urls: typeof r.fulfillment_photo_urls === 'string' ? JSON.parse(r.fulfillment_photo_urls || "[]") : (r.fulfillment_photo_urls || [])
          }
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

cuttingRouter.post("/api/floor-requests", (req, res) => {
      try {
        const { 
          type, category, station_id, project_id, process_id, wot_id, 
          title, description, qty_required, unit, requested_by, photo_urls,
          bom_item_id, item_name, tool_item_id, requested_machine_category, reason,
          auto_pr
        } = req.body;

        const id = crypto.randomUUID();
        const codeRow = db.prepare("SELECT COUNT(*) as count FROM floor_requests").get() as any;
        const seq = String((codeRow?.count || 0) + 1).padStart(4, "0");
        const request_code = `FR-${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2, '0')}-${seq}`;

        const reqType = type || 'MATERIAL';
        const reqCategory = category || 'NORMAL';
        const reqTitle = title || `${reqType} Request at Station`;
        const reqBy = requested_by || 'Floor Operator';

        // Check if material shortage requires auto-PR (Section 6.3)
        let generatedPrId = null;
        let generatedPrNumber = null;
        let finalStatus = 'PENDING';

        const shouldTriggerAutoPr = Boolean(auto_pr) || reqType === 'MATERIAL' || reqType === 'MATERIAL_REQUEST';
        let reservedFromStockQty = 0;

        if (shouldTriggerAutoPr && Number(qty_required) > 0) {
          try {
            const reqQtyNum = Number(qty_required) || 1;
            let itemIdToProcure = bom_item_id || tool_item_id;

            db.transaction(() => {
              if (!itemIdToProcure && item_name) {
                const existing = db.prepare("SELECT id FROM items WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) OR UPPER(TRIM(item_code)) = UPPER(TRIM(?))").get(item_name, item_name) as any;
                if (existing) {
                  itemIdToProcure = existing.id;
                } else {
                  itemIdToProcure = crypto.randomUUID();
                  const fakeCode = "AUTO-MAT-" + Math.random().toString(36).substring(2, 8).toUpperCase();
                  db.prepare(`
                    INSERT INTO items (id, item_code, name, type, uom, unit_price, min_stock, max_stock)
                    VALUES (?, ?, ?, 'RAW', ?, 0, 0, 0)
                  `).run(itemIdToProcure, fakeCode, item_name, unit || 'PCS');
                  db.prepare(`
                    INSERT OR IGNORE INTO inventory (item_id, physical_qty, available_qty, free_stock, allocated_stock, reserved_qty)
                    VALUES (?, 0, 0, 0, 0, 0)
                  `).run(itemIdToProcure);
                }
              }

              // 1. Check Inventory Free Stock first & create hard reservation if stock is available
              let deficitQty = reqQtyNum;
              if (itemIdToProcure && project_id) {
                const invRow = db.prepare(`
                  SELECT COALESCE(free_stock, available_qty, 0) as free_stock
                  FROM inventory WHERE item_id = ?
                `).get(itemIdToProcure) as any;
                const availFree = Math.max(0, Number(invRow?.free_stock || 0));
                if (availFree > 0) {
                  reservedFromStockQty = Math.min(availFree, reqQtyNum);
                  deficitQty = Math.max(0, reqQtyNum - reservedFromStockQty);

                  db.prepare(`
                    UPDATE inventory
                    SET free_stock = MAX(0, COALESCE(free_stock, 0) - ?),
                        available_qty = MAX(0, COALESCE(available_qty, 0) - ?),
                        allocated_stock = COALESCE(allocated_stock, 0) + ?,
                        reserved_qty = COALESCE(reserved_qty, 0) + ?
                    WHERE item_id = ?
                  `).run(reservedFromStockQty, reservedFromStockQty, reservedFromStockQty, reservedFromStockQty, itemIdToProcure);

                  db.prepare(`
                    INSERT INTO inventory_reservations (id, item_id, project_id, spk_id, qty, status)
                    VALUES (?, ?, ?, ?, ?, 'ACTIVE')
                  `).run(
                    `RES-FR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
                    itemIdToProcure,
                    project_id,
                    request_code,
                    reservedFromStockQty
                  );
                }
              }

              // 2. If deficit remains (or auto_pr explicitly requested), generate PENDING Purchase Request in Procurement
              if (deficitQty > 0 && itemIdToProcure) {
                const prId = crypto.randomUUID();
                const prNumRow = db.prepare("SELECT COUNT(*) as count FROM purchase_requests").get() as any;
                const prSeq = String((prNumRow?.count || 0) + 1).padStart(4, "0");
                generatedPrNumber = `PR-${new Date().getFullYear()}-${prSeq}-${Math.floor(10 + Math.random() * 89)}`;
                generatedPrId = prId;

                const prUrgency = reqCategory === 'URGENT' || reqCategory === 'CRITICAL' ? 'CRITICAL' : 'URGENT';
                const prRemarks = `Auto-synced from Shop Floor Request ${request_code}: ${reqTitle}. Shortage Qty: ${deficitQty} ${unit || 'PCS'}${reservedFromStockQty > 0 ? ` (${reservedFromStockQty} reserved from warehouse stock)` : ''}. Reason: ${description || reason || 'Production Floor Shortage'}`;

                db.prepare(`
                  INSERT INTO purchase_requests (id, pr_number, project_id, request_date, status, requested_by, notes, remarks, urgency, category)
                  VALUES (?, ?, ?, CURRENT_DATE, 'PENDING', ?, ?, ?, ?, 'FLOOR_REQUEST')
                `).run(prId, generatedPrNumber, project_id || 'GENERAL', reqBy, prRemarks, prRemarks, prUrgency);

                db.prepare(`
                  INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, expected_delivery_date)
                  VALUES (?, ?, ?, NULL, ?, ?, date('now', '+7 days'))
                `).run(
                  crypto.randomUUID(),
                  prId,
                  itemIdToProcure,
                  description || reqTitle || 'Shop Floor Shortage Request',
                  deficitQty
                );
              }
            })();

            finalStatus = generatedPrId ? 'IN_PROGRESS' : (reservedFromStockQty >= reqQtyNum ? 'ACKNOWLEDGED' : 'PENDING');
          } catch (prErr) {
            console.error("Auto PR Generation failed:", prErr);
          }
        }


        db.prepare(`
          INSERT INTO floor_requests 
          (id, request_code, type, category, status, requested_by, station_id, project_id, process_id, wot_id, 
           title, description, qty_required, unit, photo_urls, bom_item_id, item_name, tool_item_id, 
           requested_machine_category, reason, auto_pr, pr_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, request_code, reqType, reqCategory, finalStatus, reqBy, 
          station_id || null, project_id || null, process_id || null, wot_id || null, 
          reqTitle, description || null, qty_required ? Number(qty_required) : null, unit || null, 
          photo_urls ? JSON.stringify(photo_urls) : null,
          bom_item_id || null, item_name || null, tool_item_id || null,
          requested_machine_category || null, reason || null,
          generatedPrId ? 1 : 0, generatedPrId
        );
        
        // Audit log in production_logs (Section 2.4)
        const logId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO production_logs 
          (id, log_type, project_id, wot_id, station_id, process_id, user_role, details, timestamp)
          VALUES (?, 'FLOOR_REQUEST_CREATED', ?, ?, ?, ?, 'OPERATOR', ?, CURRENT_TIMESTAMP)
        `).run(logId, project_id || null, wot_id || null, station_id || null, process_id || null, JSON.stringify({ 
          title: reqTitle, 
          description, 
          request_code, 
          type: reqType,
          category: reqCategory,
          qty_required, 
          unit,
          auto_pr_generated: Boolean(generatedPrId),
          pr_number: generatedPrNumber,
          photo_urls 
        }));
        
        emitProductionUpdate("NEW_FLOOR_REQUEST", { 
          id, 
          request_code, 
          type: reqType, 
          category: reqCategory,
          title: reqTitle,
          status: finalStatus,
          pr_id: generatedPrId,
          pr_number: generatedPrNumber
        });

        res.json({ 
          ok: true, 
          success: true,
          id, 
          request_code,
          status: finalStatus,
          pr_id: generatedPrId,
          pr_number: generatedPrNumber,
          message: generatedPrId ? `Floor Request ${request_code} created and Emergency Purchase Request ${generatedPrNumber} dispatched to Procurement.` : `Floor Request ${request_code} dispatched.`
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

cuttingRouter.patch("/api/floor-requests/:id/acknowledge", handleAcknowledgeFr);

cuttingRouter.post("/api/floor-requests/:id/acknowledge", handleAcknowledgeFr);

cuttingRouter.patch("/api/floor-requests/:id/fulfill", handleFulfillFr);

cuttingRouter.post("/api/floor-requests/:id/fulfill", handleFulfillFr);

cuttingRouter.patch("/api/floor-requests/:id/reject", handleRejectFr);

cuttingRouter.post("/api/floor-requests/:id/reject", handleRejectFr);

cuttingRouter.patch("/api/floor-requests/:id/close", handleCloseFr);

cuttingRouter.post("/api/floor-requests/:id/close", handleCloseFr);

cuttingRouter.patch("/api/floor-requests/:id", (req, res) => {
      try {
        const { id } = req.params;
        const { status, user_id, fulfillment_notes, fulfillment_photo_urls, reason } = req.body;
        
        if (status === 'ACKNOWLEDGED') return handleAcknowledgeFr(req, res);
        if (status === 'FULFILLED' || status === 'RESOLVED') return handleFulfillFr(req, res);
        if (status === 'REJECTED') return handleRejectFr(req, res);
        if (status === 'CLOSED') return handleCloseFr(req, res);

        db.prepare("UPDATE floor_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status || 'PENDING', id);
        emitProductionUpdate("FLOOR_REQUEST_UPDATED", { id, status });
        res.json({ ok: true, id, status });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

cuttingRouter.patch("/api/floor-requests/:id/:action", (req, res) => {
      const { action } = req.params;
      if (action === 'acknowledge') return handleAcknowledgeFr(req, res);
      if (action === 'fulfill') return handleFulfillFr(req, res);
      if (action === 'reject') return handleRejectFr(req, res);
      if (action === 'close') return handleCloseFr(req, res);
      res.status(400).json({ error: `Unknown action: ${action}` });
    });

cuttingRouter.post("/api/warehouse/scan-to-production", (req, res) => {
      try {
        const { qr_code } = req.body;
        // In a real scenario, this would parse the QR to find a specific dispatch or GRN ID.
        // For now, we simulate receiving the material and automatically resolving pending procurement NDPs.
        
        // Find all NDPs that are pending procurement
        const pendingNdps = db.prepare(`
          SELECT * FROM notice_to_down_processes 
          WHERE status = 'BLOCKED_PENDING_PROCUREMENT'
        `).all() as any[];

        let resolvedCount = 0;
        const now = new Date().toISOString();

        for (const ndp of pendingNdps) {
           db.prepare(`
             UPDATE notice_to_down_processes 
             SET status = 'RESOLVED', resolved_by = 'SYSTEM_AUTO', resolved_at = ?
             WHERE id = ?
           `).run(now, ndp.id);
           resolvedCount++;
           
           // Optionally, also resume the related BOP if needed.
        }

        res.json({ ok: true, message: `Material Received. ${resolvedCount} pending NDPs resolved automatically.` });
      } catch (err: any) {
        console.error("Error in scan-to-production:", err);
        res.status(500).json({ error: err.message });
      }
    });


// Helper: Evaluate Engineering & SCM Shop Floor Material Supply Gate (Gate 1 — Adaptive Staggered SCM & Wave Orchestra)
export function evaluateProjectScmSupplyGate(projectId: string) {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS bom_item_consumption (
        id TEXT PRIMARY KEY,
        bom_id TEXT NOT NULL,
        project_id TEXT,
        bop_id TEXT,
        wot_id TEXT,
        item_id TEXT,
        qty_consumed REAL DEFAULT 0,
        scrap_qty REAL DEFAULT 0,
        recorded_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const alterCols = [
      "ALTER TABLE boms ADD COLUMN bop_process_id TEXT",
      "ALTER TABLE boms ADD COLUMN station_id TEXT",
      "ALTER TABLE boms ADD COLUMN engineering_concession_type TEXT DEFAULT 'NONE'",
      "ALTER TABLE boms ADD COLUMN substitute_item_id TEXT",
      "ALTER TABLE boms ADD COLUMN substitute_item_code TEXT",
      "ALTER TABLE boms ADD COLUMN substitute_item_name TEXT",
      "ALTER TABLE boms ADD COLUMN substitute_qty_supplied REAL DEFAULT 0",
      "ALTER TABLE boms ADD COLUMN deferred_status TEXT DEFAULT 'NONE'",
      "ALTER TABLE boms ADD COLUMN concession_notes TEXT",
      "ALTER TABLE boms ADD COLUMN concession_authorized_by TEXT",
      "ALTER TABLE boms ADD COLUMN concession_authorized_at DATETIME",
      "ALTER TABLE bill_of_processes ADD COLUMN material_allocations TEXT DEFAULT '[]'",
      "ALTER TABLE bill_of_processes ADD COLUMN bom_allocations TEXT DEFAULT '[]'",
    ];
    for (const sql of alterCols) {
      try {
        db.prepare(sql).run();
      } catch (e) {}
    }
  } catch (e) {}

  const projectRow = db.prepare(`SELECT qty, lot_size, spk_number FROM projects WHERE id = ?`).get(projectId) as any;
  const totalProjectQty = Math.max(1, Number(projectRow?.qty) || 100);
  const defaultLotSize = Math.max(1, Number(projectRow?.lot_size) || Math.min(10, totalProjectQty));

  const allSteps = db.prepare(`
    SELECT id, process_name, step_sequence, station_id, completed_qty, status,
           COALESCE(NULLIF(material_allocations, '[]'), bom_allocations, '[]') as material_allocations,
           bom_allocations
    FROM bill_of_processes
    WHERE project_id = ? AND (node_type IS NULL OR UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END'))
    ORDER BY step_sequence ASC
  `).all(projectId) as any[];

  const firstBopStep = allSteps[0] || null;

  const bomItems = db.prepare(`
    SELECT b.id as bom_id, b.item_id, b.required_qty, b.dimension, b.spec,
           COALESCE(b.received_by_production, 0) as received_by_production,
           b.bop_process_id, b.station_id,
           COALESCE(b.engineering_concession_type, 'NONE') as engineering_concession_type,
           b.substitute_item_id, b.substitute_item_code, b.substitute_item_name,
           COALESCE(b.substitute_qty_supplied, 0) as substitute_qty_supplied,
           COALESCE(b.deferred_status, 'NONE') as deferred_status,
           b.concession_notes, b.concession_authorized_by, b.concession_authorized_at,
           i.item_code, i.name as item_name, i.uom,
           COALESCE(inv.free_stock, inv.available_qty, 0) as free_stock,
           COALESCE(inv.allocated_stock, inv.reserved_qty, 0) as allocated_stock,
           COALESCE(inv.physical_qty, COALESCE(inv.free_stock, 0) + COALESCE(inv.allocated_stock, 0), 0) as physical_qty
    FROM boms b
    JOIN items i ON b.item_id = i.id
    LEFT JOIN inventory inv ON b.item_id = inv.item_id
    WHERE b.project_id = ?
    ORDER BY i.item_code ASC
  `).all(projectId) as any[];

  const itemsStatus = bomItems.map((b) => {
    const reqQty = Math.max(0, Number(b.required_qty) || 0);

    // Resolve Point-of-Use (POU) BOP Step for this BOM item
    let pouStep = b.bop_process_id ? allSteps.find((s) => s.id === b.bop_process_id) : null;
    if (!pouStep && allSteps.length > 0) {
      // Check if any BOP step references this item in material_allocations or bom_allocations
      const matchedByAlloc = allSteps.find((s) => {
        const allocSource = s.material_allocations || s.bom_allocations;
        if (!allocSource) return false;
        const raw = String(allocSource).toUpperCase();
        return (
          (b.item_id && raw.includes(String(b.item_id).toUpperCase())) ||
          (b.item_code && raw.includes(String(b.item_code).toUpperCase())) ||
          (b.bom_id && raw.includes(String(b.bom_id).toUpperCase()))
        );
      });
      pouStep = matchedByAlloc || firstBopStep;
    }

    const pouBopId = pouStep?.id || b.bop_process_id || null;
    const pouProcessName = pouStep?.process_name || "Step #01 (Primary Fabrication)";
    const pouStepSequence = Number(pouStep?.step_sequence) || 1;
    const pouStationId = b.station_id || pouStep?.station_id || null;

    // 1. Warehouse Reserved Stock (ACTIVE + ISSUED + SUPPLIED + CONSUMED)
    const resRow = db.prepare(`
      SELECT 
        COALESCE(SUM(qty), 0) as reserved_qty,
        COALESCE(SUM(CASE WHEN status IN ('ISSUED', 'SUPPLIED', 'CONSUMED') THEN qty ELSE 0 END), 0) as issued_res_qty
      FROM inventory_reservations
      WHERE project_id = ? AND item_id = ? AND status IN ('ACTIVE', 'ISSUED', 'SUPPLIED', 'CONSUMED')
    `).get(projectId, b.item_id) as any;

    // 2. Physical Dispatches from Warehouse to Shop Floor WIP
    const dispRow = db.prepare(`
      SELECT COALESCE(SUM(dispatch_qty), 0) as dispatched_qty
      FROM material_dispatches
      WHERE project_id = ? AND item_id = ? AND status IN ('RECEIVED', 'RECEIVED_BY_PRODUCTION', 'ISSUED', 'SUPPLIED')
    `).get(projectId, b.item_id) as any;

    // 3. Stock Movements of type ISSUE_TO_WIP / CONSUMPTION / RELEASE / TRANSFER
    const movRow = db.prepare(`
      SELECT COALESCE(SUM(qty), 0) as moved_qty
      FROM stock_movements
      WHERE project_id = ? AND item_id = ? AND type IN ('ISSUE_TO_WIP', 'CONSUMPTION', 'RELEASE', 'TRANSFER')
    `).get(projectId, b.item_id) as any;

    // 4. BOM Backflush Consumption recorded on Shop Floor
    let backflushQty = 0;
    try {
      const bfRow = db.prepare(`
        SELECT COALESCE(SUM(qty_consumed), 0) as consumed_qty
        FROM bom_item_consumption
        WHERE bom_id = ?
      `).get(b.bom_id) as any;
      backflushQty = Number(bfRow?.consumed_qty || 0);
    } catch (e) {}

    // 5. Open Procurement PRs
    const prRow = db.prepare(`
      SELECT COALESCE(SUM(pri.qty), 0) as pr_qty,
             GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers
      FROM pr_items pri
      JOIN purchase_requests pr ON pri.pr_id = pr.id
      WHERE pr.project_id = ? AND pri.item_id = ? AND pr.status NOT IN ('CANCELLED', 'REJECTED')
    `).get(projectId, b.item_id) as any;

    const reservedQty = Number(resRow?.reserved_qty || 0);
    const issuedResQty = Number(resRow?.issued_res_qty || 0);
    const dispatchedQty = Number(dispRow?.dispatched_qty || 0);
    const movedQty = Number(movRow?.moved_qty || 0);
    const receivedByProd = Number(b.received_by_production || 0);
    const substituteQtySupplied = Math.max(0, Number(b.substitute_qty_supplied) || 0);

    const suppliedToFloorQty = Math.max(issuedResQty, dispatchedQty, movedQty, receivedByProd, backflushQty);
    const effectiveSuppliedQty = Number((suppliedToFloorQty + substituteQtySupplied).toFixed(4));
    const prQty = Number(prRow?.pr_qty || 0);
    const freeStock = Math.max(0, Number(b.free_stock || 0));

    // Available physical stock in warehouse that has NOT yet been issued to floor
    const unissuedReservedInWh = Math.max(0, reservedQty - suppliedToFloorQty);
    const totalAvailableInWarehouseNow = unissuedReservedInWh + freeStock;
    const totalWarehouseCoverage = effectiveSuppliedQty + totalAvailableInWarehouseNow;
    const uncoveredShortage = Math.max(0, reqQty - Math.max(effectiveSuppliedQty, reservedQty + substituteQtySupplied));
    const netDeficitAfterFree = Math.max(0, reqQty - totalWarehouseCoverage);
    const unsuppliedToFloorQty = Math.max(0, Number((reqQty - effectiveSuppliedQty).toFixed(4)));
    const availableInWarehouseToIssue = Math.min(unsuppliedToFloorQty, totalAvailableInWarehouseNow);

    const concessionType = String(b.engineering_concession_type || "NONE").toUpperCase();
    const deferredStatus = String(b.deferred_status || "NONE").toUpperCase();
    const isDeferredOpen = concessionType === "DEFERRED_FITMENT" && deferredStatus === "OPEN_DEBT";
    const isDeferredVerified = concessionType === "DEFERRED_FITMENT" && deferredStatus === "INSTALLED_VERIFIED";

    // Producible Wave Quota Ceiling for this BOM item:
    // Otomatis batasi plafon qty WOT sesuai stok terkirim (atau penuh jika Deferred Fitment aktif)
    const rawProducibleUnits =
      reqQty <= 0
        ? totalProjectQty
        : Math.min(totalProjectQty, Math.floor(((effectiveSuppliedQty + 1e-6) / reqQty) * totalProjectQty));

    const effectiveStepProducibleUnits =
      isDeferredOpen || isDeferredVerified ? totalProjectQty : rawProducibleUnits;

    const waveCoveragePct =
      reqQty <= 0 ? 100 : Math.min(100, Math.round((effectiveSuppliedQty / reqQty) * 100));

    const scmStage:
      | "SUPPLIED_TO_FLOOR"
      | "PARTIAL_WAVE_SUPPLIED"
      | "DEFERRED_BYPASS_ACTIVE"
      | "READY_IN_WAREHOUSE_TO_ISSUE"
      | "AWAITING_PROCUREMENT_GRN" =
      reqQty <= 0 || effectiveSuppliedQty >= reqQty || isDeferredVerified
        ? "SUPPLIED_TO_FLOOR"
        : isDeferredOpen
        ? "DEFERRED_BYPASS_ACTIVE"
        : effectiveSuppliedQty > 0
        ? "PARTIAL_WAVE_SUPPLIED"
        : totalWarehouseCoverage >= reqQty || availableInWarehouseToIssue > 0
        ? "READY_IN_WAREHOUSE_TO_ISSUE"
        : "AWAITING_PROCUREMENT_GRN";

    return {
      bom_id: b.bom_id,
      item_id: b.item_id,
      item_code: b.item_code,
      item_name: b.item_name,
      uom: b.uom || "PCS",
      required_qty: reqQty,
      reserved_qty: Math.max(reservedQty, suppliedToFloorQty),
      supplied_to_floor_qty: suppliedToFloorQty,
      substitute_item_id: b.substitute_item_id || null,
      substitute_item_code: b.substitute_item_code || null,
      substitute_item_name: b.substitute_item_name || null,
      substitute_qty_supplied: substituteQtySupplied,
      effective_supplied_qty: effectiveSuppliedQty,
      unsupplied_to_floor_qty: unsuppliedToFloorQty,
      available_in_warehouse_to_issue: Number(availableInWarehouseToIssue.toFixed(4)),
      available_stock: Number(totalAvailableInWarehouseNow.toFixed(4)),
      shortage_to_floor_qty: unsuppliedToFloorQty,
      consumed_backflush_qty: Number(backflushQty.toFixed(2)),
      remaining_wip_floor_qty: Number(Math.max(0, effectiveSuppliedQty - backflushQty).toFixed(2)),
      free_stock: freeStock,
      pr_ordered_qty: prQty,
      pr_numbers: prRow?.pr_numbers || null,
      uncovered_shortage: uncoveredShortage,
      net_deficit_to_procure: Math.max(0, netDeficitAfterFree - prQty),
      bop_process_id: pouBopId,
      bop_process_name: pouProcessName,
      bop_step_sequence: pouStepSequence,
      station_id: pouStationId,
      engineering_concession_type: concessionType,
      deferred_status: deferredStatus,
      concession_notes: b.concession_notes || null,
      concession_authorized_by: b.concession_authorized_by || null,
      concession_authorized_at: b.concession_authorized_at || null,
      wave_coverage_pct: waveCoveragePct,
      raw_producible_units: rawProducibleUnits,
      max_producible_units: effectiveStepProducibleUnits,
      scm_stage: scmStage,
      status:
        scmStage === "SUPPLIED_TO_FLOOR"
          ? "SUPPLIED_TO_FLOOR"
          : scmStage === "DEFERRED_BYPASS_ACTIVE"
          ? "DEFERRED_FITMENT_OPEN"
          : scmStage === "PARTIAL_WAVE_SUPPLIED"
          ? "PARTIAL_WAVE_SUPPLIED"
          : reservedQty >= reqQty
          ? "RESERVED_READY"
          : totalWarehouseCoverage >= reqQty
          ? "AVAILABLE_TO_RESERVE"
          : prQty >= netDeficitAfterFree
          ? "PR_IN_PROCUREMENT"
          : "SHORTAGE_UNCOVERED",
    };
  });

  // Compute Point-of-Use (POU) & Wave Quota Ceilings per BOP Process Step
  const processProducibleQuotas: Record<
    string,
    {
      bop_id: string;
      process_name: string;
      step_sequence: number;
      completed_qty: number;
      target_qty: number;
      max_producible_qty: number;
      remaining_producible_under_wave: number;
      is_pou_unlocked: boolean;
      wave_ceiling_active: boolean;
      pou_direct_items_count: number;
      blocking_items: any[];
      deferred_items: any[];
    }
  > = {};

  allSteps.forEach((step, idx) => {
    const stepSeq = Number(step.step_sequence) || idx + 1;
    const stepCompletedQty = Number(step.completed_qty) || 0;
    // A process at sequence `stepSeq` is governed by BOM items whose Point-of-Use is at or upstream of `stepSeq`
    const governingItems = itemsStatus.filter((it) => (Number(it.bop_step_sequence) || 1) <= stepSeq);
    const directItems = itemsStatus.filter(
      (it) => it.bop_process_id === step.id || (!it.bop_process_id && idx === 0)
    );

    const maxProdQty =
      governingItems.length === 0
        ? totalProjectQty
        : Math.min(totalProjectQty, ...governingItems.map((it) => it.max_producible_units));

    const blockingItems = governingItems.filter(
      (it) => it.max_producible_units <= stepCompletedQty && stepCompletedQty < totalProjectQty
    );
    const deferredItems = governingItems.filter(
      (it) => it.engineering_concession_type === "DEFERRED_FITMENT" && it.deferred_status === "OPEN_DEBT"
    );

    processProducibleQuotas[step.id] = {
      bop_id: step.id,
      process_name: step.process_name,
      step_sequence: stepSeq,
      completed_qty: stepCompletedQty,
      target_qty: totalProjectQty,
      max_producible_qty: maxProdQty,
      remaining_producible_under_wave: Math.max(0, maxProdQty - stepCompletedQty),
      is_pou_unlocked: maxProdQty > stepCompletedQty || stepCompletedQty >= totalProjectQty || step.status === "COMPLETED",
      wave_ceiling_active: maxProdQty < totalProjectQty,
      pou_direct_items_count: directItems.length,
      blocking_items: blockingItems,
      deferred_items: deferredItems,
    };
  });

  const suppliedCount = itemsStatus.filter((it) => it.scm_stage === "SUPPLIED_TO_FLOOR").length;
  const partialSuppliedCount = itemsStatus.filter((it) => it.scm_stage === "PARTIAL_WAVE_SUPPLIED").length;
  const openDeferredFitments = itemsStatus.filter(
    (it) => it.engineering_concession_type === "DEFERRED_FITMENT" && it.deferred_status === "OPEN_DEBT"
  );

  const allStrictlySupplied =
    itemsStatus.length === 0 || itemsStatus.every((it) => it.scm_stage === "SUPPLIED_TO_FLOOR");

  // Shop floor can execute if all items are supplied OR if active/next process is unlocked via Point-of-Use, Partial Wave, Substitution, or Deferred Fitment
  const activeOrNextStep =
    allSteps.find((s) => s.status === "RUNNING" || s.status === "IN_PROGRESS") ||
    allSteps.find((s) => s.status !== "COMPLETED") ||
    allSteps[0];
  const activeStepQuota = activeOrNextStep ? processProducibleQuotas[activeOrNextStep.id] : null;
  const anyStepUnlocked =
    itemsStatus.length === 0 ||
    Object.values(processProducibleQuotas).some((q) => q.is_pou_unlocked && q.completed_qty < q.target_qty);

  const allReservedReady =
    itemsStatus.length === 0 ||
    itemsStatus.every(
      (it) =>
        it.scm_stage === "SUPPLIED_TO_FLOOR" ||
        it.scm_stage === "READY_IN_WAREHOUSE_TO_ISSUE" ||
        it.available_in_warehouse_to_issue >= it.unsupplied_to_floor_qty
    );

  const canPartialWaveIssue = itemsStatus.some((it) => it.available_in_warehouse_to_issue > 0);
  const canIssueFromWarehouse =
    itemsStatus.length > 0 &&
    !allStrictlySupplied &&
    itemsStatus.every(
      (it) =>
        it.scm_stage === "SUPPLIED_TO_FLOOR" ||
        it.scm_stage === "DEFERRED_BYPASS_ACTIVE" ||
        it.available_in_warehouse_to_issue >= it.unsupplied_to_floor_qty
    );

  const hasWarehouseShortage = itemsStatus.some(
    (it) =>
      it.unsupplied_to_floor_qty > it.available_in_warehouse_to_issue &&
      it.scm_stage !== "DEFERRED_BYPASS_ACTIVE"
  );
  const unsuppliedItemsCount = itemsStatus.filter((it) => it.scm_stage !== "SUPPLIED_TO_FLOOR").length;
  const shortageCount = itemsStatus.filter((it) => it.scm_stage === "AWAITING_PROCUREMENT_GRN").length;

  const projectProducibleCeiling =
    itemsStatus.length === 0
      ? totalProjectQty
      : Math.min(totalProjectQty, ...itemsStatus.map((it) => it.max_producible_units));

  const fgrGateReady =
    openDeferredFitments.length === 0 &&
    itemsStatus.every(
      (it) => it.effective_supplied_qty >= it.required_qty || it.deferred_status === "INSTALLED_VERIFIED"
    );

  return {
    ok: true,
    project_id: projectId,
    target_project_qty: totalProjectQty,
    default_lot_size: defaultLotSize,
    total_bom_items: itemsStatus.length,
    supplied_count: suppliedCount,
    partial_supplied_count: partialSuppliedCount,
    all_ready: allStrictlySupplied,
    all_supplied_to_floor: allStrictlySupplied,
    any_step_unlocked: anyStepUnlocked,
    active_step_unlocked: activeStepQuota ? activeStepQuota.is_pou_unlocked : anyStepUnlocked,
    active_step_producible_ceiling: activeStepQuota
      ? activeStepQuota.max_producible_qty
      : projectProducibleCeiling,
    project_producible_ceiling: projectProducibleCeiling,
    all_reserved_ready: allReservedReady,
    can_issue_from_warehouse: canIssueFromWarehouse,
    can_partial_wave_issue: canPartialWaveIssue,
    has_warehouse_shortage: hasWarehouseShortage,
    unsupplied_items_count: unsuppliedItemsCount,
    shortage_items_count: shortageCount,
    open_deferred_fitments: openDeferredFitments,
    fgr_gate_ready: fgrGateReady,
    process_producible_quotas: processProducibleQuotas,
    items: itemsStatus,
  };
}

// Helper: Gate 4 — Automatic BOM Backflush & Scrap Accounting upon WOT Step Progress (Point-of-Use Aware)
export function backflushBomConsumptionForUnits(
  projectId: string,
  bopId: string,
  wotId: string,
  deltaGoodUnits: number,
  deltaScrapUnits: number,
  actor: string
) {
  try {
    const totalDeltaUnits = Math.max(0, Number(deltaGoodUnits) || 0) + Math.max(0, Number(deltaScrapUnits) || 0);
    if (totalDeltaUnits <= 0) return [];

    const projectRow = db.prepare(`SELECT qty FROM projects WHERE id = ?`).get(projectId) as any;
    const totalProjectQty = Math.max(1, Number(projectRow?.qty) || 100);

    const allSteps = db.prepare(`
      SELECT id FROM bill_of_processes
      WHERE project_id = ? AND (node_type IS NULL OR UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END'))
      ORDER BY step_sequence ASC
    `).all(projectId) as any[];

    const isPrimaryFabricationStep = allSteps.length === 0 || allSteps[0].id === bopId;

    const bomItems = db.prepare(`
      SELECT id as bom_id, item_id, required_qty, bop_process_id, substitute_item_id,
             COALESCE(substitute_qty_supplied, 0) as substitute_qty_supplied
      FROM boms WHERE project_id = ?
    `).all(projectId) as any[];

    const backflushed: Array<{ bom_id: string; item_id: string; qty_consumed: number }> = [];

    for (const bom of bomItems) {
      // Backflush at the item's Point-of-Use BOP step (or at the primary step if unassigned)
      const matchesPou = bom.bop_process_id
        ? bom.bop_process_id === bopId
        : isPrimaryFabricationStep;
      if (!matchesPou) continue;

      const reqQty = Math.max(0, Number(bom.required_qty) || 0);
      if (reqQty <= 0) continue;

      const unitBomRatio = reqQty / totalProjectQty;
      const qtyToBackflush = Number((unitBomRatio * totalDeltaUnits).toFixed(4));
      if (qtyToBackflush <= 0) continue;

      const existingRow = db.prepare(`
        SELECT COALESCE(SUM(qty_consumed), 0) as already_consumed
        FROM bom_item_consumption
        WHERE bom_id = ?
      `).get(bom.bom_id) as any;
      const alreadyConsumed = Number(existingRow?.already_consumed || 0);
      const cappedConsume = Math.max(0, Math.min(qtyToBackflush, reqQty - alreadyConsumed));

      if (cappedConsume > 0) {
        db.prepare(`
          INSERT INTO bom_item_consumption (
            id, bom_id, project_id, bop_id, wot_id, item_id, qty_consumed, scrap_qty, recorded_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `BIC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          bom.bom_id,
          projectId,
          bopId,
          wotId,
          bom.substitute_item_id && Number(bom.substitute_qty_supplied) > 0 ? bom.substitute_item_id : bom.item_id,
          cappedConsume,
          Number((unitBomRatio * Math.max(0, deltaScrapUnits)).toFixed(4)),
          actor
        );
        backflushed.push({ bom_id: bom.bom_id, item_id: bom.item_id, qty_consumed: cappedConsume });
      }
    }
    return backflushed;
  } catch (e) {
    console.warn("BOM Backflush non-fatal warning:", e);
    return [];
  }
}

// Real-Time BOM Reservation, Warehouse Supply & Procurement Readiness Check for a Project
cuttingRouter.get("/api/production/projects/:id/material-readiness", (req, res) => {
  try {
    const { id } = req.params;
    const gate = evaluateProjectScmSupplyGate(id);
    res.json(gate);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Official SCM Action: Issue / Supply BOM Materials from Warehouse to Shop Floor WIP (Full or Partial Wave)
cuttingRouter.post("/api/production/projects/:id/scm-issue-to-floor", (req, res) => {
  try {
    const { id } = req.params;
    const { station_id, notes, issue_mode, bom_id, custom_quantities } = req.body || {};
    const actor = getActor(req) || "Warehouse & SCM Officer";

    const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
    if (!project) return res.status(404).json({ error: "Project not found" });

    const gateBefore = evaluateProjectScmSupplyGate(id);
    if (gateBefore.all_supplied_to_floor && !bom_id) {
      return res.json({
        ok: true,
        already_supplied: true,
        message: "All BOM materials have already been 100% supplied to the Shop Floor (WIP).",
        scm_gate: gateBefore,
      });
    }

    // Determine whether we are executing FULL issue or PARTIAL_WAVE issue
    const effectiveMode =
      issue_mode === "PARTIAL_WAVE" || bom_id || custom_quantities || gateBefore.has_warehouse_shortage
        ? "PARTIAL_WAVE"
        : "FULL";

    const targetItems = bom_id
      ? gateBefore.items.filter((it) => it.bom_id === bom_id || it.item_id === bom_id)
      : gateBefore.items;

    // Check if there is any physical stock available in Warehouse to issue in this wave
    const issuableItems = targetItems.filter((it) => {
      const requestedCustom =
        custom_quantities && custom_quantities[it.bom_id] !== undefined
          ? Number(custom_quantities[it.bom_id])
          : it.available_in_warehouse_to_issue;
      return Math.min(it.available_in_warehouse_to_issue, requestedCustom) > 0;
    });

    if (issuableItems.length === 0) {
      const shortageItems = targetItems.filter((it) => it.unsupplied_to_floor_qty > 0);
      const shortageText = shortageItems
        .map(
          (s) =>
            `${s.item_code} (${s.item_name}): Requires ${s.unsupplied_to_floor_qty} ${s.uom} more, Ready in Warehouse: 0 ${s.uom}${
              s.pr_numbers ? ` [PR: ${s.pr_numbers}]` : ""
            }`
        )
        .join("; ");
      return res.status(409).json({
        code: "WAREHOUSE_STOCK_SHORTAGE",
        error: `No physical stock in Warehouse is currently ready to issue for [${shortageText}]. Use 'Material Substitution' or 'Deferred Fitment' so shop floor execution can proceed while awaiting Procurement GRN.`,
        scm_gate: gateBefore,
        shortages: shortageItems,
      });
    }

    const issuedItemsSummary: string[] = [];
    let totalIssuedCost = 0;

    db.transaction(() => {
      for (const item of issuableItems) {
        const neededToFloor = Math.max(0, item.unsupplied_to_floor_qty);
        if (neededToFloor <= 0) continue;

        const requestedCustom =
          custom_quantities && custom_quantities[item.bom_id] !== undefined
            ? Math.max(0, Number(custom_quantities[item.bom_id]) || 0)
            : neededToFloor;

        const qtyToIssueNow = Number(
          Math.min(neededToFloor, item.available_in_warehouse_to_issue, requestedCustom).toFixed(4)
        );
        if (qtyToIssueNow <= 0) continue;

        // Check how much is currently in ACTIVE reservation vs Free Stock
        const activeResRows = db.prepare(`
          SELECT id, qty FROM inventory_reservations
          WHERE project_id = ? AND item_id = ? AND status = 'ACTIVE'
          ORDER BY rowid ASC
        `).all(id, item.item_id) as any[];

        const activeReservedSum = activeResRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
        const takeFromReserved = Math.min(qtyToIssueNow, activeReservedSum);
        const takeFromFree = Math.max(0, Number((qtyToIssueNow - takeFromReserved).toFixed(4)));

        // Deduct physical_qty & allocated_stock (and free_stock if unreserved portion was taken)
        db.prepare(`
          UPDATE inventory
          SET physical_qty = MAX(0, COALESCE(physical_qty, 0) - ?),
              allocated_stock = MAX(0, COALESCE(allocated_stock, 0) - ?),
              reserved_qty = MAX(0, COALESCE(reserved_qty, 0) - ?),
              free_stock = MAX(0, COALESCE(free_stock, 0) - ?),
              available_qty = MAX(0, COALESCE(available_qty, 0) - ?)
          WHERE item_id = ?
        `).run(qtyToIssueNow, takeFromReserved, takeFromReserved, takeFromFree, takeFromFree, item.item_id);

        // Update or split ACTIVE reservations proportionally to qtyToIssueNow
        let remainingToMarkIssued = takeFromReserved;
        for (const rRow of activeResRows) {
          if (remainingToMarkIssued <= 0) break;
          const rQty = Number(rRow.qty) || 0;
          if (rQty <= remainingToMarkIssued + 1e-6) {
            db.prepare(`UPDATE inventory_reservations SET status = 'ISSUED' WHERE id = ?`).run(rRow.id);
            remainingToMarkIssued -= rQty;
          } else {
            // Partial wave from an active reservation: reduce ACTIVE row and insert ISSUED row
            db.prepare(`UPDATE inventory_reservations SET qty = ? WHERE id = ?`).run(
              Number((rQty - remainingToMarkIssued).toFixed(4)),
              rRow.id
            );
            db.prepare(`
              INSERT INTO inventory_reservations (id, item_id, project_id, spk_id, qty, status)
              VALUES (?, ?, ?, ?, ?, 'ISSUED')
            `).run(
              `RES-WAV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
              item.item_id,
              id,
              project.spk_number || id,
              Number(remainingToMarkIssued.toFixed(4))
            );
            remainingToMarkIssued = 0;
          }
        }

        if (takeFromFree > 0) {
          db.prepare(`
            INSERT INTO inventory_reservations (id, item_id, project_id, spk_id, qty, status)
            VALUES (?, ?, ?, ?, ?, 'ISSUED')
          `).run(
            `RES-ISS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
            item.item_id,
            id,
            project.spk_number || id,
            takeFromFree
          );
        }

        // Insert official Warehouse-to-Floor Dispatch record
        db.prepare(`
          INSERT INTO material_dispatches (id, project_id, item_id, station_id, dispatch_qty, status)
          VALUES (?, ?, ?, ?, ?, 'RECEIVED_BY_PRODUCTION')
        `).run(
          `MDSP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          id,
          item.item_id,
          station_id || item.station_id || null,
          qtyToIssueNow
        );

        // Insert immutable Stock Movement (ISSUE_TO_WIP)
        db.prepare(`
          INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by, reference_id)
          VALUES (?, ?, ?, 'ISSUE_TO_WIP', ?, ?, ?)
        `).run(
          `SMV-WIP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          item.item_id,
          id,
          qtyToIssueNow,
          actor,
          `SCM-${effectiveMode}-${project.spk_number || id}`
        );

        try {
          const newReceived = Number((item.supplied_to_floor_qty + qtyToIssueNow).toFixed(4));
          db.prepare(`
            UPDATE boms SET received_by_production = ? WHERE id = ?
          `).run(newReceived, item.bom_id);
        } catch (e) {}

        const newTotalForItem = Number((item.effective_supplied_qty + qtyToIssueNow).toFixed(2));
        issuedItemsSummary.push(
          `${item.item_code} (+${qtyToIssueNow} ${item.uom} → Floor Total: ${newTotalForItem}/${item.required_qty} ${item.uom})`
        );

        try {
          const priceRow = db
            .prepare("SELECT COALESCE(unit_price, 0) as unit_price FROM items WHERE id = ? OR item_code = ?")
            .get(item.item_id, item.item_code) as { unit_price: number } | undefined;
          const unitCost = Number(priceRow?.unit_price) || 0;
          totalIssuedCost += qtyToIssueNow * unitCost;
        } catch (e) {}
      }

      // Post Automated WIP Material Issuance GL Journal (Dr 1105 WIP / Cr 1104 Raw Materials)
      if (totalIssuedCost > 0) {
        try {
          postMaterialIssuanceJournal(db, {
            project_id: id,
            spk_number: project.spk_number || id,
            material_cost: Math.round(totalIssuedCost),
            reference_id: `SCM-WIP-${id}-${Date.now()}`,
            item_summary: issuedItemsSummary.join(", ").slice(0, 120),
            user: actor,
          });
        } catch (jeErr) {
          console.warn("Automated WIP Material Issue GL journal warning:", jeErr);
        }
      }

      // Auto-fulfill pending material floor_requests if fully supplied
      try {
        db.prepare(`
          UPDATE floor_requests
          SET status = 'FULFILLED',
              fulfilled_by = ?,
              fulfilled_at = CURRENT_TIMESTAMP,
              fulfillment_notes = 'Fulfilled via SCM Warehouse Wave Material Issue to Shop Floor WIP'
          WHERE project_id = ? AND status IN ('PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS')
            AND UPPER(COALESCE(type, '')) LIKE '%MATERIAL%'
        `).run(actor, id);
      } catch (e) {}

      // Post audit trail to Shop Floor Communication Thread
      try {
        db.prepare(`
          INSERT INTO production_process_threads (
            id, project_id, process_name, author, role, message, is_pinned
          ) VALUES (?, ?, 'SCM Warehouse Gate', ?, 'WAREHOUSE_SCM', ?, 1)
        `).run(
          `TH-SCM-${Date.now()}`,
          id,
          actor,
          `[SCM ${effectiveMode === "PARTIAL_WAVE" ? "PARTIAL WAVE SUPPLY" : "FULL MATERIAL ISSUE"}] Material supplied from Warehouse to Shop Floor (WIP): ${issuedItemsSummary.join(", ")}. ${notes ? `Notes: ${notes}` : "WOT Producible Ceiling updated automatically."}`
        );
      } catch (e) {}
    })();

    const gateAfter = evaluateProjectScmSupplyGate(id);
    emitProductionUpdate("SCM_MATERIAL_ISSUED_TO_FLOOR", {
      project_id: id,
      issue_mode: effectiveMode,
      issued_by: actor,
      issued_items: issuedItemsSummary,
      scm_gate: gateAfter,
    });

    res.json({
      ok: true,
      issue_mode: effectiveMode,
      message:
        effectiveMode === "PARTIAL_WAVE" && !gateAfter.all_supplied_to_floor
          ? `Partial Wave Supply Completed: ${issuedItemsSummary.join(", ")}. WOT Producible Ceiling is now unlocked up to ${gateAfter.active_step_producible_ceiling} / ${gateAfter.target_project_qty} units!`
          : `SCM Material Issue Completed: ${issuedItemsSummary.join(", ")} fully supplied to the Shop Floor (WIP).`,
      scm_gate: gateAfter,
    });
  } catch (err: any) {
    console.error("Error in scm-issue-to-floor:", err);
    res.status(500).json({ error: err.message });
  }
});

// SCM Engineering Action 1: Assign Point-of-Use (POU) Process Step & Station to a BOM Item
cuttingRouter.post("/api/production/projects/:id/scm-assign-pou", (req, res) => {
  try {
    const { id } = req.params;
    const { bom_id, bop_process_id, station_id } = req.body || {};
    if (!bom_id) return res.status(400).json({ error: "bom_id is required" });

    const step = bop_process_id
      ? (db.prepare(`SELECT id, process_name, station_id, step_sequence FROM bill_of_processes WHERE id = ?`).get(bop_process_id) as any)
      : null;

    db.prepare(`
      UPDATE boms
      SET bop_process_id = ?,
          station_id = ?
      WHERE id = ? AND project_id = ?
    `).run(bop_process_id || null, station_id || step?.station_id || null, bom_id, id);

    const gateAfter = evaluateProjectScmSupplyGate(id);
    emitProductionUpdate("SCM_POU_UPDATED", { project_id: id, bom_id, bop_process_id, scm_gate: gateAfter });

    res.json({
      ok: true,
      message: step
        ? `Point-of-Use (POU) material mapped to Process #${step.step_sequence} (${step.process_name}). Upstream steps prior to this stage are now free from this material interlock!`
        : `Point-of-Use (POU) material reset to Process #01.`,
      scm_gate: gateAfter,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

