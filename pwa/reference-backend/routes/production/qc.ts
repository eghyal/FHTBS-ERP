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
import { postProductionFinishJournal } from "../../utils/accountingBridge.ts";
import { calculateTieredOvertimePay } from "../../lib/hrisEngine.ts";
import { calculateWotCycleEstimation, computeStationManpowerBalancing } from "../../utils/wotCycle.ts";

import {
  emitProductionUpdate,
  autoResolveDownstreamProductNodes,
  invalidatePlanningCache,
  autoStartDownstreamProcesses,
} from "./utils.ts";

import { evaluateProjectScmSupplyGate, backflushBomConsumptionForUnits } from "./cutting.ts";
import { resolveStepStationKey, runStationAutoOrchestration } from "./assembly.ts";

export const qcRouter = Router();

qcRouter.get("/api/production/unit-progress", (req, res) => {
      try {
        const { project_id, spk_id } = req.query;
        if (!project_id && !spk_id) {
          return res.status(400).json({ error: "project_id or spk_id required" });
        }
        let list: any[] = [];
        if (project_id) {
          list = db.prepare("SELECT * FROM unit_process_progress WHERE project_id = ?").all(project_id);
        } else if (spk_id) {
          list = db.prepare("SELECT * FROM unit_process_progress WHERE spk_id = ?").all(spk_id);
        }
        res.json(list);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

qcRouter.post("/api/production/unit-progress", (req, res) => {
      try {
        const { project_id, spk_id, unit_code, bop_id, status, completed_by } = req.body;
        if (!project_id || !unit_code || !bop_id) {
          return res.status(400).json({ error: "project_id, unit_code, and bop_id are required" });
        }

        const existing = db.prepare("SELECT * FROM unit_process_progress WHERE project_id = ? AND unit_code = ? AND bop_id = ?")
          .get(project_id, unit_code, bop_id) as any;

        const now = new Date().toISOString();
        if (existing) {
          db.prepare(`
            UPDATE unit_process_progress
            SET status = ?,
                completed_time = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_time END,
                completed_by = COALESCE(?, completed_by)
            WHERE id = ?
          `).run(status || 'COMPLETED', status || 'COMPLETED', now, completed_by || 'Operator', existing.id);
        } else {
          const newId = `upp_${Date.now()}_${Math.random().toString(36).substring(2,6)}`;
          db.prepare(`
            INSERT INTO unit_process_progress (id, project_id, spk_id, unit_code, bop_id, status, start_time, completed_time, completed_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(newId, project_id, spk_id || null, unit_code, bop_id, status || 'COMPLETED', now, status === 'COMPLETED' ? now : null, completed_by || 'Operator');
        }

        res.json({ success: true, message: `Unit ${unit_code} status updated to ${status}` });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

qcRouter.get("/api/production/travel-tags", (req, res) => {
      try {
        const { bop_id, project_id, lot_id } = req.query;
        let query = `
          SELECT tt.*, bop.process_name, p.name as project_name, p.spk_number
          FROM task_travel_tags tt
          LEFT JOIN bill_of_processes bop ON tt.bop_id = bop.id
          LEFT JOIN projects p ON tt.project_id = p.id
        `;
        const params: any[] = [];
        const whereClauses: string[] = [];

        if (lot_id) {
          whereClauses.push(`tt.lot_id = ?`);
          params.push(lot_id);
        }
        if (bop_id) {
          whereClauses.push(`tt.bop_id = ?`);
          params.push(bop_id);
        }
        if (project_id) {
          whereClauses.push(`tt.project_id = ?`);
          params.push(project_id);
        }

        if (whereClauses.length > 0) {
          query += ` WHERE ` + whereClauses.join(" AND ");
        }
        query += ` ORDER BY tt.created_at DESC`;

        const tags = db.prepare(query).all(...params);
        res.json(tags);
      } catch (err: any) {
        console.error("Error fetching travel tags:", err);
        res.status(500).json({ error: err.message });
      }
    });

qcRouter.post("/api/production/travel-tags/verify", (req, res) => {
      try {
        const { qr_payload, tag_number, lot_id } = req.body;
        let query = `
          SELECT tt.*, bop.process_name, bop.step_sequence, p.name as project_name, p.spk_number
          FROM task_travel_tags tt
          LEFT JOIN bill_of_processes bop ON tt.bop_id = bop.id
          LEFT JOIN projects p ON tt.project_id = p.id
        `;
        let tag = null;

        if (tag_number) {
          tag = db.prepare(query + ` WHERE tt.tag_number = ?`).get(tag_number);
        } else if (lot_id) {
          tag = db.prepare(query + ` WHERE tt.lot_id = ? ORDER BY tt.created_at DESC LIMIT 1`).get(lot_id);
        } else if (qr_payload) {
          let parsed: any = null;
          try {
            parsed = typeof qr_payload === 'string' ? JSON.parse(qr_payload) : qr_payload;
          } catch (e) {
            // raw string search
          }
          if (parsed?.tag_number) {
            tag = db.prepare(query + ` WHERE tt.tag_number = ?`).get(parsed.tag_number);
          } else if (parsed?.lot_id) {
            tag = db.prepare(query + ` WHERE tt.lot_id = ? ORDER BY tt.created_at DESC LIMIT 1`).get(parsed.lot_id);
          } else {
            tag = db.prepare(query + ` WHERE tt.qr_payload LIKE ?`).get(`%${qr_payload}%`);
          }
        }

        if (!tag) {
          return res.status(404).json({ valid: false, error: "QR Tag not found or not registered in the system." });
        }

        res.json({ valid: true, tag, message: "QR Tag officially verified and authentic." });
      } catch (err: any) {
        console.error("Error verifying travel tag:", err);
        res.status(500).json({ valid: false, error: err.message });
      }
    });

qcRouter.post("/api/production/travel-tags", (req, res) => {
      try {
        const {
          project_id,
          bop_id,
          lot_id,
          lot_number,
          operator_name,
          operator_team,
          qc_inspector,
          qc_status,
          good_qty,
          scrap_qty,
          verified_by
        } = req.body;

        if (!project_id || !bop_id || !operator_name) {
          return res.status(400).json({ error: "project_id, bop_id, and operator_name are required" });
        }

        const bop = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ?`).get(bop_id) as any;
        const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(project_id) as any;

        // Calculate total downtime for this bop if any
        const downtimeSum = db.prepare(`
          SELECT SUM(actual_down_minutes) as total_down
          FROM notice_to_down_processes
          WHERE bop_id = ?
        `).get(bop_id) as { total_down: number };

        const lotSuffix = lot_number ? `-${lot_number.split('-').pop()}` : '';
        const tagNumber = `TAG-${project?.spk_number || 'SPK'}${lotSuffix}-S${bop?.step_sequence || '1'}-${Date.now().toString().slice(-4)}`;
        const tagId = `tag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const startedAt = bop?.actual_start_date || new Date().toISOString();
        const completedAt = new Date().toISOString();

        const qrPayloadObj = {
          tag_number: tagNumber,
          spk_number: project?.spk_number || "N/A",
          project_name: project?.name || "N/A",
          lot_id: lot_id || null,
          lot_number: lot_number || null,
          step_sequence: bop?.step_sequence,
          process_name: bop?.process_name,
          work_center: bop?.work_center_name || "Factory Floor",
          operator: operator_name,
          team: operator_team || "Production Crew",
          started_at: startedAt,
          completed_at: completedAt,
          total_downtime_minutes: downtimeSum?.total_down || 0,
          qc_inspector: qc_inspector || verified_by || "QC Department",
          qc_status: qc_status || "PASSED",
          good_qty: Number(good_qty) || 1,
          scrap_qty: Number(scrap_qty) || 0
        };

        const qrPayloadStr = JSON.stringify(qrPayloadObj);

        const runTransaction = db.transaction(() => {
          db.prepare(`
            INSERT INTO task_travel_tags (
              id, tag_number, project_id, bop_id, lot_id, lot_number, qr_payload, operator_name, operator_team,
              qc_inspector, qc_status, good_qty, scrap_qty, started_at, completed_at,
              total_downtime_minutes, verified_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            tagId,
            tagNumber,
            project_id,
            bop_id,
            lot_id || null,
            lot_number || null,
            qrPayloadStr,
            operator_name,
            operator_team || null,
            qc_inspector || verified_by || null,
            qc_status || 'PASSED',
            Number(good_qty) || 1,
            Number(scrap_qty) || 0,
            startedAt,
            completedAt,
            downtimeSum?.total_down || 0,
            verified_by || null
          );

          // If lot_id is provided, mark that lot execution as COMPLETED and unlock next step for this lot
          if (lot_id) {
            db.prepare(`
              UPDATE lot_routing_executions
              SET status = 'COMPLETED', good_qty = ?, scrap_qty = ?, end_time = ?, operator_name = ?
              WHERE lot_id = ? AND bop_id = ?
            `).run(Number(good_qty) || 1, Number(scrap_qty) || 0, completedAt, operator_name, lot_id, bop_id);

            // Increment completed_qty on the bop step
            db.prepare(`
              UPDATE bill_of_processes
              SET completed_qty = COALESCE(completed_qty, 0) + ?
              WHERE id = ?
            `).run(Number(good_qty) || 1, bop_id);

            // Check any dependent downstream steps for this lot and unlock them if all their predecessors are completed for this lot
            const allSteps = db.prepare(`SELECT * FROM bill_of_processes WHERE project_id = ? AND node_type != 'PRODUCT' ORDER BY step_sequence ASC`).all(project_id) as any[];
            for (const otherStep of allSteps) {
              if (otherStep.id === bop_id) continue;
              let otherPredIds: string[] = [];
              try {
                otherPredIds = Array.isArray(otherStep.predecessor_ids)
                  ? otherStep.predecessor_ids
                  : JSON.parse(otherStep.predecessor_ids || "[]");
              } catch (e) {
                otherPredIds = [];
              }

              if (otherPredIds.includes(bop_id)) {
                // Check if all predecessors for this lot are completed
                let allPredsDoneForLot = true;
                for (const pId of otherPredIds) {
                  const pExec = db.prepare(`SELECT status, good_qty FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot_id, pId) as any;
                  if (!pExec || (pExec.status !== 'COMPLETED' && (pExec.good_qty || 0) < 1)) {
                    allPredsDoneForLot = false;
                    break;
                  }
                }

                if (allPredsDoneForLot) {
                  const nextStatus = otherStep.status === 'RUNNING' ? 'RUNNING' : 'READY';
                  const otherExec = db.prepare(`SELECT id, status FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot_id, otherStep.id) as any;
                  if (otherExec) {
                    if (otherExec.status !== 'COMPLETED') {
                      db.prepare(`UPDATE lot_routing_executions SET status = ? WHERE id = ?`).run(nextStatus, otherExec.id);
                    }
                  } else {
                    const newLexId = "LEX-" + Math.random().toString(36).substr(2, 9);
                    db.prepare(`
                      INSERT INTO lot_routing_executions (id, lot_id, bop_id, status, good_qty, operator_name, start_time)
                      VALUES (?, ?, ?, ?, 0, ?, ?)
                    `).run(newLexId, lot_id, otherStep.id, nextStatus, operator_name, nextStatus === 'RUNNING' ? completedAt : null);
                  }
                }
              }
            }
          }

          // Mark BoP and Task as COMPLETED, recording operator details if not already completed
          const bopCheck = db.prepare(`SELECT completed_qty, standard_hours FROM bill_of_processes WHERE id = ?`).get(bop_id) as any;
          if (!lot_id || (bopCheck && project && bopCheck.completed_qty >= (project.qty || 1))) {
            db.prepare(`
              UPDATE bill_of_processes
              SET status = 'COMPLETED', progress = 100, actual_end_date = ?, completed_by_operator = ?, completed_at_timestamp = ?
              WHERE id = ?
            `).run(completedAt, operator_name, completedAt, bop_id);

            db.prepare(`
              UPDATE project_tasks
              SET status = 'COMPLETED', progress = 100, actual_end_date = ?
              WHERE id = ?
            `).run(completedAt, bop_id);
          }

          // Auto-start downstream processes via pipelining (1 WOT completed is enough)
          autoStartDownstreamProcesses(project_id, operator_name);
          // Auto-complete any successor PRODUCT nodes if all their preceding processes are completed
          autoResolveDownstreamProductNodes(project_id, operator_name);
          logAudit(operator_name, "TRAVEL_TAG_ISSUED", "TRAVEL_TAG", tagId, `Issued Travel Tag ${tagNumber} for BoP step ${bop_id}`);
        });

        runTransaction();

        const createdTag = db.prepare(`SELECT * FROM task_travel_tags WHERE id = ?`).get(tagId);
        res.json({ success: true, tag: createdTag, message: "Travel Tag & QR-Code generated. Task completed." });
      } catch (err: any) {
        console.error("Error creating travel tag:", err);
        res.status(500).json({ error: err.message });
      }
    });

qcRouter.post(
  "/api/production/projects/:id/finish-and-inbound",
  requireRole(["QA_QC", "PRODUCTION", "WAREHOUSE", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
      try {
        const { id } = req.params;
        const { notes, fg_location, serial_number, total_fg_qty } = req.body;

        const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        // HARD INTERLOCK ON FINAL QC & FGR:
        // 1. Check for unresolved OPEN Non-Conformance Reports (NCRs)
        ensureQcProcessTables();
        const openNcrs = db.prepare(`
          SELECT ncr_number, defect_category, station_name
          FROM qc_ncr_logs
          WHERE project_id = ? AND status = 'OPEN'
        `).all(id) as any[];
        if (openNcrs.length > 0) {
          const ncrList = openNcrs
            .map((n: any) => `${n.ncr_number} (${n.defect_category} @ ${n.station_name || "Station"})`)
            .join(", ");
          return res.status(409).json({
            code: "FGR_OPEN_NCR_INTERLOCK",
            error: `Final QC & FGR Interlock: Cannot authorize Finished Goods Release while ${openNcrs.length} Non-Conformance Report(s) remain OPEN [${ncrList}]. Resolve and verify CAPA actions first.`,
            open_ncrs: openNcrs,
          });
        }

        // 2. All Deferred Fitment items and BOM materials MUST be 100% supplied & verified before FGR!
        const scmGateFinal = evaluateProjectScmSupplyGate(id);
        if (scmGateFinal.open_deferred_fitments && scmGateFinal.open_deferred_fitments.length > 0) {
          const debtNames = scmGateFinal.open_deferred_fitments
            .map((d: any) => `${d.item_code} (${d.item_name})`)
            .join(", ");
          return res.status(409).json({
            code: "FGR_DEFERRED_DEBT_INTERLOCK",
            error: `Final QC & FGR Interlock: There are ${scmGateFinal.open_deferred_fitments.length} material(s) with 'Deferred Fitment' status not yet supplied/installed [${debtNames}]. Complete supply and verify installation before issuing FGR!`,
            scm_gate: scmGateFinal,
            open_deferred_fitments: scmGateFinal.open_deferred_fitments,
          });
        }
        if (!scmGateFinal.fgr_gate_ready) {
          const incompleteItems = scmGateFinal.items
            .filter((it: any) => it.effective_supplied_qty < it.required_qty && it.deferred_status !== "INSTALLED_VERIFIED")
            .map((it: any) => `${it.item_code} (${it.effective_supplied_qty}/${it.required_qty} ${it.uom})`)
            .join(", ");
          return res.status(409).json({
            code: "FGR_MATERIAL_INCOMPLETE_INTERLOCK",
            error: `Final QC & FGR Interlock: BOM materials are not 100% fulfilled for all finished good units [${incompleteItems}]. Complete the final supply wave or authorize material substitution before issuing FGR.`,
            scm_gate: scmGateFinal,
          });
        }

        // 1. Check or Auto-Complete remaining steps during handover
        // Verify all BOP steps have passed First Article Inspection (FAI) before releasing FGR
        const bopSteps = db.prepare(`
          SELECT * FROM bill_of_processes
          WHERE project_id = ? AND COALESCE(UPPER(node_type), 'PROCESS') NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY step_sequence ASC
        `).all(id) as any[];

        if (bopSteps.length > 0) {
          const passedFaiStepIds = new Set(
            (
              db
                .prepare(
                  `SELECT DISTINCT bop_id FROM qc_bop_inspections WHERE project_id = ? AND inspection_type = 'FAI' AND disposition = 'PASSED'`,
                )
                .all(id) as { bop_id: string }[]
            ).map((r) => r.bop_id),
          );
          const unverifiedFaiSteps = bopSteps.filter((st) => !passedFaiStepIds.has(st.id));
          if (unverifiedFaiSteps.length > 0) {
            const missingNames = unverifiedFaiSteps
              .map((st) => `Step #${st.step_sequence || 1} (${st.process_name})`)
              .join(", ");
            return res.status(409).json({
              code: "FGR_FAI_INCOMPLETE_INTERLOCK",
              error: `Final QC & FGR Interlock: Cannot release Finished Goods Record while ${unverifiedFaiSteps.length} BOP step(s) have not yet passed First Article Inspection (FAI): [${missingNames}].`,
            });
          }
        }

        const fgItemCode = `FG-${project.id}`;
        let createdItemId = "";
        let fgrNumber = `FGR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${project.spk_number || project.id.slice(-6)}`;
        let fgrId = `fgr_${Date.now()}`;
        const totalQty = total_fg_qty !== undefined ? Number(total_fg_qty) : (Number(project.qty) || 1);
        const uom = project.uom || "UNIT";
        const sn = serial_number || `SN-${Date.now().toString().slice(-6)}`;

        // Compute Post-Completion Execution Summary & Auto-Adjusting WMA Factory Factor
        const activeNdpsAll = db.prepare(`
          SELECT * FROM notice_to_down_processes WHERE project_id = ?
        `).all(id) as any[];

        const wotsAll = db.prepare(`
          SELECT * FROM work_order_tickets WHERE project_id = ?
        `).all(id) as any[];

        const shiftHours = Number(project.shift_hours) || 8;
        const plannedFf = Number(project.factory_factor) || 85;
        const targetProjectQty = Number(project.qty) || totalQty || 1;

        let totalPlannedMinutes = 0;
        let totalActualMinutes = 0;
        const stepBreakdown = bopSteps.map((step: any, idx: number) => {
          const ctMins = Number(step.cycle_time_minutes) || 30;
          const mp = Math.max(1, Number(step.manpower_count) || 1);
          const plannedStepMins = (ctMins * targetProjectQty) / (mp * (plannedFf / 100));
          let actualStepMins = plannedStepMins;
          if (step.actual_start_date && step.actual_end_date) {
            const diffMs = new Date(step.actual_end_date).getTime() - new Date(step.actual_start_date).getTime();
            if (diffMs > 60000) {
              actualStepMins = Math.min(plannedStepMins * 2.5, Math.max(plannedStepMins * 0.4, diffMs / 60000));
            }
          }
          const stepNdpCount = activeNdpsAll.filter((n: any) => n.bop_id === step.id).length;
          if (stepNdpCount > 0 && actualStepMins === plannedStepMins) {
            actualStepMins = plannedStepMins * (1 + stepNdpCount * 0.15);
          }
          totalPlannedMinutes += plannedStepMins;
          totalActualMinutes += actualStepMins;
          return {
            step_id: step.id,
            step_sequence: step.step_sequence || (idx + 1),
            process_name: step.process_name || `Step ${idx + 1}`,
            planned_hours: Number((plannedStepMins / 60).toFixed(2)),
            actual_hours: Number((actualStepMins / 60).toFixed(2)),
            variance_hours: Number(((actualStepMins - plannedStepMins) / 60).toFixed(2)),
            efficiency_pct: Number(((plannedStepMins / Math.max(1, actualStepMins)) * 100).toFixed(1)),
            ndp_incidents: stepNdpCount,
            rework_qty: Number(step.rework_qty) || 0,
            qc_hold_qty: Number(step.qc_hold_qty) || 0,
          };
        });

        const ndpDowntimeHours = activeNdpsAll.reduce((acc: number, n: any) => {
          if (n.down_started_at && n.resumed_at) {
            const hrs = (new Date(n.resumed_at).getTime() - new Date(n.down_started_at).getTime()) / 3600000;
            return acc + Math.max(0.25, Math.min(48, hrs));
          }
          return acc + (Number(n.estimated_down_hours) ? Math.min(8, Number(n.estimated_down_hours) * 0.25) : 1.5);
        }, 0);

        const plannedTotalHours = Number(project.planned_total_hours) > 0
          ? Number(project.planned_total_hours)
          : Math.max(1, Number((totalPlannedMinutes / 60).toFixed(2)));

        const actualTotalHours = Math.max(
          0.5,
          Number(((totalActualMinutes / 60) + (ndpDowntimeHours * 0.35)).toFixed(2))
        );

        // Achieved Factory Factor for this project: (Planned Hours / Actual Hours) * Planned FF
        const rawAchievedFf = (plannedTotalHours / Math.max(0.5, actualTotalHours)) * plannedFf;
        const achievedFf = Number(Math.min(135, Math.max(40, rawAchievedFf)).toFixed(1));

        // Calculate Weighted Moving Average (WMA) across historical completed projects
        const historyRows = db.prepare(`
          SELECT achieved_ff FROM factory_factor_history ORDER BY created_at ASC LIMIT 20
        `).all() as any[];

        const series = [
          ...(historyRows.length === 0 ? [plannedFf] : historyRows.map((r: any) => Number(r.achieved_ff) || 85)),
          achievedFf,
        ];
        let weightedSum = 0;
        let weightTotal = 0;
        series.forEach((val, i) => {
          const weight = i + 1; // Linearly increasing weight so recent completions carry highest weight
          weightedSum += val * weight;
          weightTotal += weight;
        });
        const newWmaFf = Number((weightedSum / Math.max(1, weightTotal)).toFixed(1));
        const previousWmaFf = historyRows.length > 0
          ? Number((db.prepare(`SELECT new_wma_ff FROM factory_factor_history ORDER BY created_at DESC LIMIT 1`).get() as any)?.new_wma_ff || plannedFf)
          : plannedFf;
        const ffDelta = Number((newWmaFf - previousWmaFf).toFixed(1));

        const totalRejectUnits = wotsAll.reduce((s: number, w: any) => s + (Number(w.reject_units) || 0), 0);
        const totalReworkUnits = wotsAll.reduce((s: number, w: any) => s + (Number(w.rework_units) || Number(w.rework_qty) || 0), 0);

        const executionSummary = {
          project_id: id,
          project_name: project.name,
          spk_number: project.spk_number || id,
          completed_at: new Date().toISOString(),
          target_qty: targetProjectQty,
          actual_fg_qty: totalQty,
          qty_inbounded: totalQty,
          uom,
          total_reject_qty: totalRejectUnits,
          total_rework_qty: totalReworkUnits,
          first_pass_yield_pct: Number(((Math.max(0, totalQty - totalRejectUnits) / Math.max(1, totalQty)) * 100).toFixed(1)),
          planned_total_hours: plannedTotalHours,
          actual_total_hours: actualTotalHours,
          planned_duration_hours: plannedTotalHours,
          actual_duration_hours: actualTotalHours,
          planned_days: Number((plannedTotalHours / shiftHours).toFixed(1)),
          actual_days: Number((actualTotalHours / shiftHours).toFixed(1)),
          ndp_incidents_count: activeNdpsAll.length,
          ndp_downtime_hours: Number(ndpDowntimeHours.toFixed(1)),
          total_ndp_downtime_hours: Number(ndpDowntimeHours.toFixed(1)),
          planned_factory_factor: plannedFf,
          achieved_factory_factor: achievedFf,
          previous_wma_factory_factor: previousWmaFf,
          new_wma_factory_factor: newWmaFf,
          factory_factor_delta: ffDelta,
          factory_factor_calibration: {
            planned_ff: plannedFf,
            achieved_ff: achievedFf,
            previous_wma_ff: previousWmaFf,
            new_wma_ff: newWmaFf,
            delta: ffDelta,
          },
          fgr_number: fgrNumber,
          fg_sku_code: fgItemCode,
          fg_sku: fgItemCode,
          step_breakdown: stepBreakdown,
        };

        const runTransaction = db.transaction(() => {
          // 1. Mark all BoP process steps for this project as COMPLETED
          db.prepare(`
            UPDATE bill_of_processes
            SET status = 'COMPLETED', progress = 100, completed_qty = COALESCE(NULLIF(completed_qty, 0), ?), actual_end_date = COALESCE(actual_end_date, CURRENT_TIMESTAMP)
            WHERE project_id = ? AND status != 'COMPLETED'
          `).run(totalQty, id);

          // Mark all WOTs for this project as COMPLETED
          db.prepare(`
            UPDATE work_order_tickets
            SET status = 'COMPLETED', good_units = COALESCE(NULLIF(good_units, 0), qty), completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
            WHERE project_id = ? AND status != 'COMPLETED'
          `).run(id);

          // Auto-resolve any active downtime notices
          db.prepare(`
            UPDATE notice_to_down_processes
            SET status = 'RESOLVED', resumed_at = CURRENT_TIMESTAMP
            WHERE project_id = ? AND status = 'ACTIVE'
          `).run(id);

          // 2. Update Project Status to COMPLETED + Save Execution Summary & WMA Factory Factor
          db.prepare(`
            UPDATE projects
            SET status = 'COMPLETED',
                completed_at = CURRENT_TIMESTAMP,
                archived_at = CURRENT_TIMESTAMP,
                planned_total_hours = ?,
                actual_total_hours = ?,
                project_performance_factor = ?,
                factory_factor = ?,
                execution_summary_json = ?
            WHERE id = ?
          `).run(
            plannedTotalHours,
            actualTotalHours,
            achievedFf,
            newWmaFf,
            JSON.stringify(executionSummary),
            id
          );

          // Save Factory Factor WMA History & Global Setting
          db.prepare(`
            INSERT INTO factory_factor_history (
              id, project_id, project_name, planned_hours, actual_hours, planned_ff, achieved_ff, new_wma_ff
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `FFH-${Date.now()}`,
            id,
            project.name,
            plannedTotalHours,
            actualTotalHours,
            plannedFf,
            achievedFf,
            newWmaFf
          );

          db.prepare(`
            INSERT INTO system_settings (key, value, updated_at)
            VALUES ('global_factory_factor', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
          `).run(String(newWmaFf));

          // 3. Calculate accurate Unit HPP & Check or Create Finish Good SKU in Items table
          let hppSummary: any = null;
          try {
            hppSummary = recalculateProjectFinancialSummary(db, id);
          } catch (hppErr) {
            console.warn("Could not recalculate project HPP during FGR:", hppErr);
          }
          const fgUnitCost =
            hppSummary && Number(hppSummary.unitHpp) > 0
              ? Number(hppSummary.unitHpp)
              : Number(project.budget) > 0
              ? Math.round(Number(project.budget) / Math.max(1, totalQty))
              : 0;

          let existingItem = db.prepare(`SELECT * FROM items WHERE item_code = ?`).get(fgItemCode) as any;

          if (!existingItem) {
            createdItemId = `item_fg_${Date.now()}`;
            db.prepare(`
              INSERT INTO items (
                id, item_code, name, spec, uom, type, category, min_stock, max_stock, unit_price, description
              ) VALUES (?, ?, ?, ?, ?, 'FINISHED', 'MANUFACTURED_FG', 1, 100, ?, ?)
            `).run(
              createdItemId,
              fgItemCode,
              `[FG] ${project.name}`,
              `Finished Good for Project ${project.name}`,
              uom,
              fgUnitCost,
              `Manufactured Finish Good from SPK ${project.spk_number || project.id}`
            );

            // Add Initial Inventory Record
            db.prepare(`
              INSERT INTO inventory (
                item_id, physical_qty, free_stock, allocated_stock, reserved_qty, available_qty
              ) VALUES (?, ?, ?, 0, 0, ?)
              ON CONFLICT(item_id) DO UPDATE SET
                physical_qty = physical_qty + excluded.physical_qty,
                free_stock = free_stock + excluded.free_stock,
                available_qty = available_qty + excluded.available_qty
            `).run(createdItemId, totalQty, totalQty, totalQty);
          } else {
            createdItemId = existingItem.id;
            if (fgUnitCost > 0) {
              db.prepare(`UPDATE items SET unit_price = ? WHERE id = ?`).run(fgUnitCost, existingItem.id);
            }
            // Increment Inventory Stock
            db.prepare(`
              UPDATE inventory
              SET physical_qty = physical_qty + ?,
                  free_stock = free_stock + ?,
                  available_qty = available_qty + ?
              WHERE item_id = ?
            `).run(totalQty, totalQty, totalQty, existingItem.id);
          }

          // Stock movement log
          try {
            db.prepare(`
              INSERT INTO stock_movements (id, item_id, type, qty, reference_id, project_id)
              VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?)
            `).run(
              `SMV-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              createdItemId,
              totalQty,
              project.id,
              project.id
            );
          } catch (e) {}

          // 4. Create Finish Good Record (FGR)
          try {
            db.prepare(`
              CREATE TABLE IF NOT EXISTS finish_good_records (
                id TEXT PRIMARY KEY,
                fgr_number TEXT UNIQUE NOT NULL,
                project_id TEXT NOT NULL,
                item_code TEXT NOT NULL,
                item_name TEXT,
                serial_number TEXT,
                quantity REAL DEFAULT 1,
                uom TEXT DEFAULT 'UNIT',
                status TEXT DEFAULT 'APPROVED',
                notes TEXT,
                inspected_by TEXT,
                target_warehouse TEXT DEFAULT 'WAREHOUSE_FG_1',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
              )
            `).run();

            db.prepare(`
              INSERT INTO finish_good_records (
                id, fgr_number, project_id, item_code, item_name, serial_number,
                quantity, uom, status, notes, inspected_by, target_warehouse
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)
            `).run(
              fgrId,
              fgrNumber,
              id,
              fgItemCode,
              `[FG] ${project.name}`,
              sn,
              totalQty,
              uom,
              notes || `Handover from Production Hub. Location: ${fg_location || 'Warehouse FG-01'}`,
              getActor(req),
              fg_location || "WAREHOUSE_FG_1"
            );
          } catch (fgrErr) {
            console.error("Error creating FGR record:", fgrErr);
          }

          // 5. Post Production Finish Accounting Journal (Dr 1103 FG Inventory / Cr 1105 WIP & Absorbed Labor/Overhead)
          try {
            const existingFinishJe = db
              .prepare("SELECT id FROM journal_entries WHERE reference_type = 'PRODUCTION_FINISH' AND reference_id = ?")
              .get(id) as any;
            if (!existingFinishJe) {
              const matCost = Number(hppSummary?.totalBomCost) || Math.max(0, fgUnitCost * totalQty);
              const labCost = Number(hppSummary?.totalLaborCost) || 0;
              const ovhCost = Number(hppSummary?.totalOverheadCost) || 0;
              if (matCost + labCost + ovhCost > 0) {
                postProductionFinishJournal(db, {
                  project_id: id,
                  spk_number: project.spk_number || id,
                  total_material_cost: matCost,
                  total_labor_cost: labCost,
                  total_overhead_cost: ovhCost,
                  user: getActor(req) || "QA_QC_FGR",
                });
              }
            }
          } catch (jeErr) {
            console.warn("Automated Production Finish GL journal warning:", jeErr);
          }
        });

        runTransaction();

        emitProductionUpdate("PROJECT_FINISHED", {
          project_id: id,
          fgr_number: fgrNumber,
          fg_code: fgItemCode,
          new_wma_factory_factor: newWmaFf,
          execution_summary: executionSummary,
        });

        res.json({
          success: true,
          message: `Project ${project.name} finished! SKU ${fgItemCode} transferred to Warehouse & Factory Factor updated to ${newWmaFf}%.`,
          item_id: createdItemId,
          fg_code: fgItemCode,
          fgr_number: fgrNumber,
          new_wma_factory_factor: newWmaFf,
          achieved_factory_factor: achievedFf,
          factory_factor_delta: ffDelta,
          execution_summary: executionSummary,
          fgr: {
            id: fgrId,
            fgr_number: fgrNumber,
            project_id: id,
            item_code: fgItemCode,
            item_id: createdItemId,
            item_name: `[FG] ${project.name}`,
            serial_number: sn,
            quantity: totalQty,
            uom: uom,
            target_warehouse: fg_location || "WAREHOUSE_FG_1",
            created_at: new Date().toISOString()
          }
        });
      } catch (err: any) {
        console.error("Error finishing project:", err);
        res.status(500).json({ error: err.message });
      }
    });

qcRouter.get("/api/production/projects/:id/fgr", (req, res) => {
      try {
        const { id } = req.params;
        try {
          db.prepare(`
            CREATE TABLE IF NOT EXISTS finish_good_records (
              id TEXT PRIMARY KEY,
              fgr_number TEXT UNIQUE NOT NULL,
              project_id TEXT NOT NULL,
              item_code TEXT NOT NULL,
              item_name TEXT,
              serial_number TEXT,
              quantity REAL DEFAULT 1,
              uom TEXT DEFAULT 'UNIT',
              status TEXT DEFAULT 'APPROVED',
              notes TEXT,
              inspected_by TEXT,
              target_warehouse TEXT DEFAULT 'WAREHOUSE_FG_1',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (project_id) REFERENCES projects(id)
            )
          `).run();
        } catch (e) {}

        const fgr = db.prepare(`SELECT * FROM finish_good_records WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`).get(id) as any;
        const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
        const fgItem = db.prepare(`SELECT * FROM items WHERE item_code LIKE ?`).get(`FG-${id}%`) as any;

        res.json({
          fgr: fgr || null,
          project: project || null,
          fg_item: fgItem || null
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });


qcRouter.put("/api/production/wots/:id/status", (req, res) => {
      try {
        const { status, operator_name, notes, process_id } = req.body;
        const wotId = req.params.id;
        
        const wot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(wotId) as any;
        if (!wot) return res.status(404).json({ error: "WOT not found" });

        db.prepare(`
          UPDATE work_order_tickets 
          SET status = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(status, wotId);

        if (notes || operator_name) {
           db.prepare(`
             INSERT INTO wot_history 
             (id, wot_id, project_id, process_id, station_id, operator_name, completed_at, qty, scrap_qty, notes)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 0, ?)
           `).run(
             crypto.randomUUID(), 
             wot.id, 
             wot.project_id, 
             process_id || wot.current_process_id || 'UNKNOWN', 
             wot.current_station_id || null, 
             operator_name || 'System', 
             wot.qty || 1, 
             notes || `Status changed to ${status}`
           );
        }

        emitProductionUpdate("WOT_STATUS_CHANGED", { wotId, status });
        res.json({ ok: true, status });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

qcRouter.get("/api/production/wots/:id/genealogy", (req, res) => {
      try {
        const wotId = req.params.id;
        const wot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(wotId) as any;
        if (!wot) return res.status(404).json({ error: "WOT not found" });

        const history = db.prepare(`
          SELECT * FROM wot_history WHERE wot_id = ? ORDER BY completed_at ASC
        `).all(wotId);
        
        let logs = [];
        try {
          logs = db.prepare(`
            SELECT * FROM wot_travel_logs WHERE wot_id = ? ORDER BY created_at ASC
          `).all(wotId);
        } catch(e) {}
        
        let tags = [];
        try {
          tags = db.prepare(`
            SELECT * FROM task_travel_tags WHERE lot_id = ? OR lot_id = ? ORDER BY created_at ASC
          `).all(wotId, wot.lot_number);
        } catch(e) {}
        
        res.json({ wot, history, logs, tags });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

// ============================================================================
// PRODUCTION HUB V2: SETUP & MASTER COMMIT, QR SCAN TRANSITION, DUAL-VECTOR

// SCM Engineering Action 2: Material Gap Engineering Concession (Substitute Material OR Deferred Fitment / Pasang Menyusul)
qcRouter.post("/api/production/projects/:id/scm-engineering-concession", (req, res) => {
  try {
    const { id } = req.params;
    const {
      bom_id,
      action, // 'SUBSTITUTE_MATERIAL' | 'DEFER_FITMENT' | 'RESOLVE_DEFERRED_FITMENT' | 'REVOKE_CONCESSION'
      substitute_item_id,
      substitute_qty,
      concession_notes,
      authorized_by,
    } = req.body || {};

    if (!bom_id || !action) {
      return res.status(400).json({ error: "bom_id and action are required" });
    }

    const actor = authorized_by || getActor(req) || "Lead Manufacturing Engineer";
    const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
    const bomRow = db.prepare(`
      SELECT b.*, i.item_code, i.name as item_name, i.uom
      FROM boms b
      JOIN items i ON b.item_id = i.id
      WHERE b.id = ? AND b.project_id = ?
    `).get(bom_id, id) as any;

    if (!bomRow) {
      return res.status(404).json({ error: "BOM item not found for this project" });
    }

    let actionMessage = "";

    db.transaction(() => {
      if (action === "SUBSTITUTE_MATERIAL") {
        if (!substitute_item_id) {
          throw new Error("Please select a substitute material item from the Warehouse catalog first.");
        }
        const subItem = db.prepare(`
          SELECT i.*, COALESCE(inv.free_stock, inv.available_qty, 0) as free_stock,
                 COALESCE(inv.physical_qty, COALESCE(inv.free_stock, 0) + COALESCE(inv.allocated_stock, 0), 0) as physical_qty
          FROM items i
          LEFT JOIN inventory inv ON i.id = inv.item_id
          WHERE i.id = ?
        `).get(substitute_item_id) as any;

        if (!subItem) {
          throw new Error("Substitute item not found in Master Inventory.");
        }

        const gateCurrent = evaluateProjectScmSupplyGate(id);
        const currentItemStat = gateCurrent.items.find((it) => it.bom_id === bom_id);
        const remainingNeeded = Math.max(0.0001, currentItemStat?.unsupplied_to_floor_qty || Number(bomRow.required_qty) || 1);
        const subQtyToIssue = Math.max(0.0001, Number(substitute_qty) || remainingNeeded);
        const subFreeStock = Math.max(0, Number(subItem.free_stock) || 0);

        if (subFreeStock < subQtyToIssue) {
          throw new Error(
            `Free stock for substitute item [${subItem.item_code} - ${subItem.name}] in Warehouse is only ${subFreeStock} ${subItem.uom || "PCS"}, insufficient to supply ${subQtyToIssue}.`
          );
        }

        // Deduct substitute item from Warehouse Inventory and issue to Shop Floor WIP
        db.prepare(`
          UPDATE inventory
          SET physical_qty = MAX(0, COALESCE(physical_qty, 0) - ?),
              free_stock = MAX(0, COALESCE(free_stock, 0) - ?),
              available_qty = MAX(0, COALESCE(available_qty, 0) - ?)
          WHERE item_id = ?
        `).run(subQtyToIssue, subQtyToIssue, subQtyToIssue, subItem.id);

        db.prepare(`
          INSERT INTO material_dispatches (id, project_id, item_id, station_id, dispatch_qty, status)
          VALUES (?, ?, ?, ?, ?, 'RECEIVED_BY_PRODUCTION')
        `).run(
          `MDSP-SUB-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
          id,
          subItem.id,
          bomRow.station_id || null,
          subQtyToIssue
        );

        db.prepare(`
          INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by, reference_id)
          VALUES (?, ?, ?, 'ISSUE_TO_WIP', ?, ?, ?)
        `).run(
          `SMV-SUB-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
          subItem.id,
          id,
          subQtyToIssue,
          actor,
          `ENG-SUB-${bomRow.item_code}-TO-${subItem.item_code}`
        );

        const nextSubSupplied = Number((Number(bomRow.substitute_qty_supplied || 0) + subQtyToIssue).toFixed(4));
        db.prepare(`
          UPDATE boms
          SET engineering_concession_type = 'SUBSTITUTED',
              substitute_item_id = ?,
              substitute_item_code = ?,
              substitute_item_name = ?,
              substitute_qty_supplied = ?,
              concession_notes = ?,
              concession_authorized_by = ?,
              concession_authorized_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          subItem.id,
          subItem.item_code,
          subItem.name,
          nextSubSupplied,
          concession_notes || `Temporary substitution approved by Engineering (${subItem.item_code})`,
          actor,
          bom_id
        );

        db.prepare(`
          INSERT INTO production_process_threads (
            id, project_id, process_name, author, role, message, is_pinned
          ) VALUES (?, ?, 'Engineering & SCM Concession', ?, 'ENGINEERING', ?, 1)
        `).run(
          `TH-SUB-${Date.now()}`,
          id,
          actor,
          `[ENGINEERING MATERIAL SUBSTITUTION] Material [${bomRow.item_code} - ${bomRow.item_name}] temporarily substituted with [${subItem.item_code} - ${subItem.name}] for ${subQtyToIssue} ${subItem.uom || bomRow.uom}. Note: ${concession_notes || "Approved by Engineering to maintain shopfloor flow."}`
        );

        actionMessage = `Material Substitution Approved: ${subQtyToIssue} ${subItem.uom || bomRow.uom} of [${subItem.item_code} - ${subItem.name}] supplied from Warehouse to Shopfloor replacing [${bomRow.item_code}].`;
      } else if (action === "DEFER_FITMENT") {
        db.prepare(`
          UPDATE boms
          SET engineering_concession_type = 'DEFERRED_FITMENT',
              deferred_status = 'OPEN_DEBT',
              concession_notes = ?,
              concession_authorized_by = ?,
              concession_authorized_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          concession_notes || "Deferred Fitment — Must be supplied & installed before Final QC & FGR",
          actor,
          bom_id
        );

        db.prepare(`
          INSERT INTO production_process_threads (
            id, project_id, process_name, author, role, message, is_pinned
          ) VALUES (?, ?, 'Engineering & SCM Concession', ?, 'ENGINEERING', ?, 1)
        `).run(
          `TH-DEF-${Date.now()}`,
          id,
          actor,
          `[DEFERRED FITMENT] Material [${bomRow.item_code} - ${bomRow.item_name}] authorized for 'Deferred Fitment' by ${actor}. Intermediate station interlocks unlocked so WIP continues flowing, and locked as Component Debt at the Final QC & FGR Gate.`
        );

        actionMessage = `'Deferred Fitment' mode activated for [${bomRow.item_code}]: Shopfloor is permitted to proceed without being blocked by this item, and is automatically locked at the Final QC & FGR Gate until resolved.`;
      } else if (action === "RESOLVE_DEFERRED_FITMENT") {
        // Check if primary material is in warehouse and needs to be issued to floor now, or mark verified
        const gateNow = evaluateProjectScmSupplyGate(id);
        const itemStat = gateNow.items.find((it) => it.bom_id === bom_id);
        const deficit = Math.max(0, Number(itemStat?.unsupplied_to_floor_qty || 0));
        const availInWh = Math.max(0, Number(itemStat?.available_in_warehouse_to_issue || 0));

        if (deficit > 0 && availInWh > 0) {
          const takeNow = Math.min(deficit, availInWh);
          db.prepare(`
            UPDATE inventory
            SET physical_qty = MAX(0, COALESCE(physical_qty, 0) - ?),
                free_stock = MAX(0, COALESCE(free_stock, 0) - ?),
                available_qty = MAX(0, COALESCE(available_qty, 0) - ?)
            WHERE item_id = ?
          `).run(takeNow, takeNow, takeNow, bomRow.item_id);

          db.prepare(`
            INSERT INTO material_dispatches (id, project_id, item_id, station_id, dispatch_qty, status)
            VALUES (?, ?, ?, ?, ?, 'RECEIVED_BY_PRODUCTION')
          `).run(
            `MDSP-CAT-${Date.now()}`,
            id,
            bomRow.item_id,
            bomRow.station_id || null,
            takeNow
          );
        }

        db.prepare(`
          UPDATE boms
          SET deferred_status = 'INSTALLED_VERIFIED',
              received_by_production = required_qty,
              concession_notes = ?,
              concession_authorized_by = ?,
              concession_authorized_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          concession_notes || "Deferred material has been supplied and verified installed prior to Final QC & FGR",
          actor,
          bom_id
        );

        db.prepare(`
          INSERT INTO production_process_threads (
            id, project_id, process_name, author, role, message, is_pinned
          ) VALUES (?, ?, 'Final QC & FGR Catch-Up Gate', ?, 'QUALITY_CONTROL', ?, 1)
        `).run(
          `TH-VER-${Date.now()}`,
          id,
          actor,
          `[DEFERRED FITMENT RESOLVED & INSTALLED] Deferred material [${bomRow.item_code} - ${bomRow.item_name}] has been supplied and verified installed by ${actor}. Final QC & FGR Interlock for this item is now unlocked.`
        );

        actionMessage = `Component Debt [${bomRow.item_code}] Resolved & Verified Installed! Final QC & FGR Gate for this material is now unlocked.`;
      } else if (action === "REVOKE_CONCESSION") {
        db.prepare(`
          UPDATE boms
          SET engineering_concession_type = 'NONE',
              deferred_status = 'NONE',
              concession_notes = NULL
          WHERE id = ?
        `).run(bom_id);
        actionMessage = `Engineering concession status for [${bomRow.item_code}] has been reset to standard.`;
      } else {
        throw new Error(`Unknown concession action: ${action}`);
      }
    })();

    const gateAfter = evaluateProjectScmSupplyGate(id);
    emitProductionUpdate("SCM_CONCESSION_UPDATED", {
      project_id: id,
      bom_id,
      action,
      scm_gate: gateAfter,
    });

    res.json({
      ok: true,
      action,
      message: actionMessage,
      scm_gate: gateAfter,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});


// Dual-Vector Cross-Project Cascading NDP (Machine Breakdown + Material SKU NG)
qcRouter.post("/api/production/ndp/cascade", (req, res) => {
  try {
    const {
      project_id,
      bop_id,
      reason_category, // 'MACHINE_BREAKDOWN' | 'MATERIAL_NG' | 'QUALITY_ISSUE' | 'TOOLING_DAMAGE'
      affected_machine_id,
      affected_item_id,
      affected_item_code,
      affected_item_name,
      ng_qty,
      estimated_down_hours,
      description,
      urgency,
      reported_by,
      auto_request_replacement,
    } = req.body;

    if (!project_id || !bop_id) {
      return res.status(400).json({ error: "project_id and bop_id are required." });
    }

    const actor = reported_by || getActor(req) || "Shop Floor Supervisor";
    const primaryStep = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ?`).get(bop_id) as any;
    const primaryProject = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(project_id) as any;

    const effectiveMachineId = affected_machine_id || primaryStep?.assigned_machine_id || primaryStep?.machine_id || null;
    const effectiveHours = Number(estimated_down_hours) || (reason_category === "MACHINE_BREAKDOWN" ? 24 : 8);
    const primaryNdpId = `NDP-${Date.now().toString(36).toUpperCase()}`;
    const primaryNdpCode = `NDP-${new Date().toISOString().slice(5, 10).replace("-", "")}-${Math.floor(100 + Math.random() * 900)}`;

    let cascadeScope = "SINGLE_PROCESS";
    if (reason_category === "MACHINE_BREAKDOWN" && effectiveMachineId) {
      cascadeScope = "CROSS_PROJECT_MACHINE";
    } else if (reason_category === "MATERIAL_NG" && (affected_item_id || affected_item_code)) {
      cascadeScope = "CROSS_PROJECT_MATERIAL_SKU";
    }

    const cascadedImpacts: Array<{
      project_id: string;
      project_name: string;
      bop_id: string;
      process_name: string;
      reason: string;
      ndp_id: string;
    }> = [];

    db.transaction(() => {
      // 1. Pause Primary Process & Insert Primary NDP
      db.prepare(`
        UPDATE bill_of_processes SET status = 'PAUSED' WHERE id = ?
      `).run(bop_id);

      db.prepare(`
        INSERT INTO notice_to_down_processes (
          id, ndp_code, ndp_number, project_id, bop_id, station_id,
          machine_id, affected_machine_id, affected_item_id, affected_item_code, affected_item_name,
          ng_qty, reason_category, reason_detail, authorized_by, cascade_scope, description, estimated_down_hours,
          status, down_started_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        primaryNdpId,
        primaryNdpCode,
        primaryNdpCode,
        project_id,
        bop_id,
        primaryStep?.station_id || null,
        effectiveMachineId,
        effectiveMachineId,
        affected_item_id || null,
        affected_item_code || null,
        affected_item_name || null,
        Number(ng_qty) || 0,
        reason_category || "MACHINE_BREAKDOWN",
        description || `Halted due to ${reason_category}`,
        actor,
        cascadeScope,
        description || `Halted due to ${reason_category}`,
        effectiveHours
      );

      // 2. Vector A: Cross-Project Shared Machine Breakdown Cascade
      if (reason_category === "MACHINE_BREAKDOWN" && effectiveMachineId) {
        db.prepare(`
          UPDATE items SET operational_status = 'DOWN', machine_status = 'BROKEN' WHERE id = ?
        `).run(effectiveMachineId);

        const intersectingMachineSteps = db.prepare(`
          SELECT b.*, p.name as project_name
          FROM bill_of_processes b
          JOIN projects p ON b.project_id = p.id
          WHERE b.id != ?
            AND (b.assigned_machine_id = ? OR b.machine_id = ?)
            AND b.status != 'COMPLETED'
            AND p.status NOT IN ('COMPLETED', 'CANCELLED')
        `).all(bop_id, effectiveMachineId, effectiveMachineId) as any[];

        intersectingMachineSteps.forEach((step, idx) => {
          const childNdpId = `NDP-CAS-${Date.now().toString(36).toUpperCase()}-${idx}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
          const childNdpNumber = `${primaryNdpCode}-M${idx + 1}`;
          const childDesc = `[Cascaded Machine Stop from ${primaryProject?.name || project_id}] Shared machine breakdown: ${description || "Machine Down"}`;
          db.prepare(`UPDATE bill_of_processes SET status = 'PAUSED' WHERE id = ?`).run(step.id);

          db.prepare(`
            INSERT INTO notice_to_down_processes (
              id, ndp_code, ndp_number, project_id, bop_id, station_id,
              machine_id, affected_machine_id, reason_category, reason_detail, authorized_by, cascade_scope, parent_ndp_id,
              description, estimated_down_hours, status, down_started_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MACHINE_BREAKDOWN', ?, ?, 'CROSS_PROJECT_MACHINE', ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(
            childNdpId,
            childNdpNumber,
            childNdpNumber,
            step.project_id,
            step.id,
            step.station_id || null,
            effectiveMachineId,
            effectiveMachineId,
            childDesc,
            actor,
            primaryNdpId,
            childDesc,
            effectiveHours
          );

          cascadedImpacts.push({
            project_id: step.project_id,
            project_name: step.project_name || step.project_id,
            bop_id: step.id,
            process_name: step.process_name,
            reason: `Uses downed machine (${effectiveMachineId})`,
            ndp_id: childNdpId,
          });
        });
      }

      // 3. Vector B: Cross-Project Material SKU NG (Defective Material after Warehouse Dispatch) Cascade
      if (reason_category === "MATERIAL_NG" && (affected_item_id || affected_item_code)) {
        // Find all active projects that use this same Material SKU in their BOM
        const matchingBomProjects = db.prepare(`
          SELECT DISTINCT b.project_id, b.item_id, i.item_code, i.name as item_name, p.name as project_name
          FROM boms b
          JOIN projects p ON b.project_id = p.id
          LEFT JOIN items i ON (b.item_id = i.id OR b.item_id = i.item_code)
          WHERE p.status NOT IN ('COMPLETED', 'CANCELLED')
            AND (
              (b.item_id IS NOT NULL AND b.item_id = ?)
              OR (i.item_code IS NOT NULL AND UPPER(i.item_code) = UPPER(?))
              OR (i.name IS NOT NULL AND UPPER(i.name) = UPPER(?))
            )
        `).all(
          affected_item_id || "",
          affected_item_code || "",
          affected_item_name || ""
        ) as any[];

        let skuCascadeIdx = 0;
        for (const bomProj of matchingBomProjects) {
          const projSteps = db.prepare(`
            SELECT * FROM bill_of_processes
            WHERE project_id = ?
              AND id != ?
              AND status != 'COMPLETED'
              AND (node_type IS NULL OR UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END'))
            ORDER BY step_sequence ASC
          `).all(bomProj.project_id, bop_id) as any[];

          // Identify steps that allocate this BOM item, or first active/running step in that project
          let targetStepsForSku = projSteps.filter((st: any) => {
            const allocRaw = st.material_allocations || st.bom_allocations;
            if (!allocRaw) return false;
            const raw = String(allocRaw);
            return (
              (affected_item_id && raw.includes(affected_item_id)) ||
              (affected_item_code && raw.toUpperCase().includes(String(affected_item_code).toUpperCase()))
            );
          });

          if (targetStepsForSku.length === 0 && bomProj.project_id !== project_id && projSteps.length > 0) {
            const runningOrFirst = projSteps.find((s: any) => s.status === "RUNNING") || projSteps[0];
            if (runningOrFirst) targetStepsForSku = [runningOrFirst];
          }

          for (const step of targetStepsForSku) {
            skuCascadeIdx += 1;
            const childNdpId = `NDP-MAT-${Date.now().toString(36).toUpperCase()}-${skuCascadeIdx}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
            const childNdpNumber = `${primaryNdpCode}-S${skuCascadeIdx}`;
            const childDesc = `[Cascaded Material SKU NG Alert from ${primaryProject?.name || project_id}] Shared SKU [${affected_item_code || affected_item_name}] flagged NG after warehouse dispatch: ${description || "Material quality defect"}`;
            db.prepare(`UPDATE bill_of_processes SET status = 'PAUSED' WHERE id = ?`).run(step.id);

            db.prepare(`
              INSERT INTO notice_to_down_processes (
                id, ndp_code, ndp_number, project_id, bop_id, station_id,
                affected_item_id, affected_item_code, affected_item_name, ng_qty,
                reason_category, reason_detail, authorized_by, cascade_scope, parent_ndp_id,
                description, estimated_down_hours, status, down_started_at, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MATERIAL_NG', ?, ?, 'CROSS_PROJECT_MATERIAL_SKU', ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(
              childNdpId,
              childNdpNumber,
              childNdpNumber,
              step.project_id,
              step.id,
              step.station_id || null,
              affected_item_id || bomProj.item_id || null,
              affected_item_code || bomProj.item_code || null,
              affected_item_name || bomProj.item_name || null,
              Number(ng_qty) || 0,
              childDesc,
              actor,
              primaryNdpId,
              childDesc,
              effectiveHours
            );

            cascadedImpacts.push({
              project_id: step.project_id,
              project_name: bomProj.project_name || step.project_id,
              bop_id: step.id,
              process_name: step.process_name,
              reason: `Consumes same Material SKU (${affected_item_code || affected_item_name})`,
              ndp_id: childNdpId,
            });
          }
        }

        // Auto-create urgent Material Replacement Floor Request to Warehouse/Procurement
        if (auto_request_replacement !== false) {
          try {
            const frId = `FR-NG-${Date.now().toString(36).toUpperCase()}`;
            const reqCode = `FR-NG-${Math.floor(1000 + Math.random() * 9000)}`;
            const itemTitle = `${affected_item_code ? `[${affected_item_code}] ` : ""}${affected_item_name || "Defective Material Replacement"}`;
            const reasonStr = `Material NG detected on shop floor (${primaryNdpCode}): ${description || "Replace defective batch"}`;
            db.prepare(`
              INSERT INTO floor_requests (
                id, request_code, type, category, status, requested_by, station_id, project_id, process_id,
                title, description, item_name, qty_required, reason, created_at
              ) VALUES (?, ?, 'MATERIAL', 'CRITICAL', 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
              frId,
              reqCode,
              actor,
              primaryStep?.station_id || "STN-01",
              project_id,
              bop_id,
              `URGENT NG REPLACEMENT: ${itemTitle}`,
              reasonStr,
              itemTitle,
              Math.max(1, Number(ng_qty) || 1),
              reasonStr
            );
          } catch (e) {}
        }
      }
    })();

    invalidatePlanningCache();
    emitProductionUpdate("NDP_TRIGGERED", {
      ndp_id: primaryNdpId,
      ndp_code: primaryNdpCode,
      project_id,
      bop_id,
      reason_category,
      cascade_scope: cascadeScope,
      cascaded_count: cascadedImpacts.length,
      cascaded_impacts: cascadedImpacts,
    });

    res.json({
      ok: true,
      ndp_id: primaryNdpId,
      ndp_code: primaryNdpCode,
      cascade_scope: cascadeScope,
      cascaded_count: cascadedImpacts.length,
      cascaded_impacts: cascadedImpacts,
      message:
        cascadedImpacts.length > 0
          ? `NDP [${primaryNdpCode}] issued & cascaded to ${cascadedImpacts.length} intersecting process(es) across projects!`
          : `NDP [${primaryNdpCode}] issued and process halted.`,
    });
  } catch (err: any) {
    console.error("Error issuing cascading NDP:", err);
    res.status(500).json({ error: err.message || "Failed to issue NDP" });
  }
});


// Tactical Control 3: Quality Hold & Rework Loop Trigger
qcRouter.post("/api/production/control/qc-rework", (req, res) => {
  try {
    const { project_id, bop_id, wot_id, action_type, qty, reason, inspector } = req.body;
    if (!bop_id) return res.status(400).json({ error: "bop_id is required" });

    const unitCount = Math.max(1, Number(qty) || 1);
    const actor = inspector || getActor(req) || "QC Inspector";

    db.transaction(() => {
      if (action_type === "QC_HOLD") {
        db.prepare(`
          UPDATE bill_of_processes
          SET qc_hold_qty = COALESCE(qc_hold_qty, 0) + ?
          WHERE id = ?
        `).run(unitCount, bop_id);

        if (wot_id) {
          db.prepare(`
            UPDATE work_order_tickets
            SET qc_hold_qty = COALESCE(qc_hold_qty, 0) + ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(unitCount, wot_id);
        }
      } else {
        // REWORK_LOOP
        db.prepare(`
          UPDATE bill_of_processes
          SET rework_qty = COALESCE(rework_qty, 0) + ?,
              status = 'RUNNING'
          WHERE id = ?
        `).run(unitCount, bop_id);

        if (wot_id) {
          db.prepare(`
            UPDATE work_order_tickets
            SET rework_units = COALESCE(rework_units, 0) + ?,
                rework_qty = COALESCE(rework_qty, 0) + ?,
                current_bop_id = ?,
                status = 'IN_PROGRESS',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(unitCount, unitCount, bop_id, wot_id);
        }
      }

      // Also post an automatic note to the contextual thread
      const step = db.prepare(`SELECT process_name FROM bill_of_processes WHERE id = ?`).get(bop_id) as any;
      db.prepare(`
        INSERT INTO production_process_threads (
          id, project_id, bop_id, process_name, wot_id, author, role, message, is_pinned
        ) VALUES (?, ?, ?, ?, ?, ?, 'QUALITY_CONTROL', ?, 1)
      `).run(
        `TH-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        project_id,
        bop_id,
        step?.process_name || "Process",
        wot_id || null,
        actor,
        `[${action_type === "QC_HOLD" ? "QC HOLD" : "REWORK LOOP"}] ${unitCount} unit(s) flagged: ${reason || "Requires inspection/rework"}`
      );
    })();

    emitProductionUpdate("QC_REWORK_TRIGGERED", { project_id, bop_id, wot_id, action_type, qty: unitCount });
    res.json({
      ok: true,
      message: `${unitCount} unit(s) placed on ${action_type === "QC_HOLD" ? "Quality Hold" : "Rework Loop"}.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// 3. Unit-Level Intra-Station Pipeline (Rule 11.1) & WOT-Level Inter-Station Auto-Transfer (Rule 11.2)
qcRouter.post(
  ["/api/production/projects/:id/wot-pipeline-advance", "/api/production/projects/:id/wot/unit-pipeline"],
  (req, res) => {
    try {
      const { id } = req.params;
      const {
        wot_id,
        bop_id,
        units_delta,
        delta_good_units,
        scrap_delta,
        force_inter_station_transfer,
        complete_full_wot,
        operator_name,
      } = req.body;
      const actor = operator_name || getActor(req) || "Operator";

      const step = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ? AND project_id = ?`).get(bop_id, id) as any;
      if (!step) return res.status(404).json({ error: "Process step not found" });

      const projectStations = db.prepare(`
        SELECT * FROM project_stations
        WHERE project_id = ?
           OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
           OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
        ORDER BY station_sequence ASC, station_code ASC
      `).all(id, id, id) as any[];

      const allSteps = db.prepare(`
        SELECT * FROM bill_of_processes
        WHERE project_id = ? AND (node_type IS NULL OR UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END'))
        ORDER BY step_sequence ASC
      `).all(id) as any[];

      const wots = db.prepare(`SELECT * FROM work_order_tickets WHERE project_id = ? ORDER BY created_at ASC`).all(id) as any[];
      const targetWot =
        (wot_id ? wots.find((w) => w.id === wot_id) : null) ||
        wots.find((w) => w.current_bop_id === bop_id) ||
        wots.find((w) => w.status === "IN_PROGRESS") ||
        wots[0];

      if (!targetWot) {
        return res.status(400).json({ error: "No WOT ticket found for this project. Commit Setup & Master first." });
      }

      // =======================================================================
      // 4-GATE MANUFACTURING ORCHESTRA ENGINE INTERLOCKS ON UNIT PIPELINE
      // =======================================================================
      // GATE 1: Point-of-Use (POU) & Partial Wave Quota Ceiling (Otomatis Batasi Plafon Qty WOT Sesuai Stok Terkirim)
      const scmGate = evaluateProjectScmSupplyGate(id);
      const stepQuota = scmGate.process_producible_quotas?.[step.id];
      const currentStepDone = Number(step.completed_qty) || 0;
      const maxProducibleAtStep = stepQuota ? stepQuota.max_producible_qty : scmGate.target_project_qty;

      if (maxProducibleAtStep <= currentStepDone && currentStepDone < scmGate.target_project_qty) {
        const blockingItems =
          stepQuota && stepQuota.blocking_items.length > 0
            ? stepQuota.blocking_items
            : scmGate.items.filter((it) => it.scm_stage !== "SUPPLIED_TO_FLOOR");
        return res.status(409).json({
          code: "SCM_MATERIAL_NOT_SUPPLIED",
          error: scmGate.can_partial_wave_issue
            ? `Batas Plafon Wave Tercapai (${currentStepDone}/${maxProducibleAtStep} unit) pada [${step.process_name}]: Terdapat stok tambahan di Gudang untuk [${blockingItems.map((u: any) => u.item_code).join(", ")}]. Lakukan 'Supply Partial Wave' dari Gudang untuk menaikkan plafon produksi!`
            : `Batas Plafon Wave Tercapai (${currentStepDone}/${maxProducibleAtStep} unit) pada [${step.process_name}]: Stok material Point-of-Use [${blockingItems.map((u: any) => u.item_code).join(", ")}] di lantai produksi habis. Otorisasi 'Substitusi Material' atau 'Pasang Menyusul (Deferred Fitment)' untuk melanjutkan!`,
          can_issue_from_warehouse: scmGate.can_issue_from_warehouse,
          can_partial_wave_issue: scmGate.can_partial_wave_issue,
          has_warehouse_shortage: scmGate.has_warehouse_shortage,
          scm_gate: scmGate,
          shortages: blockingItems,
        });
      }

      // GATE 2: Machine Health & Active NDP Lockdown Interlock
      const stepMachineId = step.assigned_machine_id || step.machine_id;
      const activeStepNdp = db.prepare(`
        SELECT * FROM notice_to_down_processes
        WHERE status IN ('ACTIVE', 'OPEN', 'BLOCKED_PENDING_PROCUREMENT')
          AND (bop_id = ? OR (machine_id IS NOT NULL AND machine_id = ?) OR (affected_machine_id IS NOT NULL AND affected_machine_id = ?))
        LIMIT 1
      `).get(step.id, stepMachineId || "__NONE__", stepMachineId || "__NONE__") as any;

      if (activeStepNdp) {
        return res.status(409).json({
          code: "MACHINE_NDP_LOCKDOWN",
          error: `Interlock Engineering: Proses [${step.process_name}] terkunci oleh NDP aktif [${activeStepNdp.ndp_code || activeStepNdp.ndp_number || activeStepNdp.reason_category}]. Selesaikan NDP terlebih dahulu.`,
        });
      }

      const wotQty = Math.max(1, Number(targetWot.qty) || 10);
      const deltaGood = Math.max(1, Number(units_delta ?? delta_good_units) || 1);
      const deltaScrap = Math.max(0, Number(scrap_delta) || 0);
      const forceFullWot = Boolean(force_inter_station_transfer || complete_full_wot);

      // GATE 3: Engineering Predecessor DAG & Mass-Balance Conservation Interlock
      const currentStationId = resolveStepStationKey(step, projectStations);
      let stepPredIds: string[] = [];
      try {
        stepPredIds =
          typeof step.predecessor_ids === "string"
            ? JSON.parse(step.predecessor_ids || "[]")
            : Array.isArray(step.predecessor_ids)
            ? step.predecessor_ids
            : [];
      } catch (e) {
        stepPredIds = [];
      }
      const stepIdxInRoute = allSteps.findIndex((s) => s.id === step.id);
      const upstreamSteps =
        stepPredIds.length > 0
          ? allSteps.filter((s) => stepPredIds.includes(s.id))
          : stepIdxInRoute > 0
          ? [allSteps[stepIdxInRoute - 1]]
          : [];

      for (const upStep of upstreamSteps) {
        const upDone = Number(upStep.completed_qty) || 0;
        const upStationId = resolveStepStationKey(upStep, projectStations);
        const isSameStation = upStationId === currentStationId;

        if (isSameStation && upDone < 1 && upStep.status !== "COMPLETED") {
          return res.status(409).json({
            code: "PREDECESSOR_STARVED",
            error: `Interlock Engineering (Rule 11.1 Intra-Station): Proses hulu [${upStep.process_name}] belum menyelesaikan minimal 1 unit (Output: ${upDone} pcs).`,
          });
        }
        const effectiveInterStationLotGate = Math.min(wotQty, maxProducibleAtStep);
        if (!isSameStation && upDone < effectiveInterStationLotGate && upStep.status !== "COMPLETED") {
          return res.status(409).json({
            code: "INTER_STATION_GATE_LOCKED",
            error: `Interlock Engineering (Rule 11.2 Inter-Station): Stasiun hulu [${upStep.process_name}] belum menyelesaikan kuota Lot WOT (${upDone}/${effectiveInterStationLotGate} pcs).`,
          });
        }
      }

      let progressMap: Record<string, number> = {};
      try {
        progressMap = targetWot.process_progress_json ? JSON.parse(targetWot.process_progress_json) : {};
      } catch (e) {
        progressMap = {};
      }

      const projectRow = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
      const totalProjectQty = Math.max(wotQty, Number(projectRow?.qty) || 100);
      const remainingWaveAllowanceAtStep = Math.max(0, maxProducibleAtStep - currentStepDone);

      const prevWotStepUnits = Number(progressMap[step.id]) || 0;
      const desiredWotUnits = forceFullWot
        ? Math.min(wotQty, prevWotStepUnits + remainingWaveAllowanceAtStep)
        : Math.min(wotQty, prevWotStepUnits + Math.min(deltaGood, remainingWaveAllowanceAtStep));
      const nextWotStepUnits = Math.max(prevWotStepUnits, desiredWotUnits);
      progressMap[step.id] = nextWotStepUnits;

      const actualUnitDelta = Math.max(
        1,
        Math.min(remainingWaveAllowanceAtStep, nextWotStepUnits - prevWotStepUnits || deltaGood)
      );
      const maxAllowedByUpstream =
        upstreamSteps.length > 0
          ? Math.min(
              ...upstreamSteps.map((u) =>
                u.status === "COMPLETED" ? totalProjectQty : Math.max(wotQty, Number(u.completed_qty) || 0)
              )
            )
          : totalProjectQty;

      // Dynamically cap step output at the Point-of-Use Wave Quota Ceiling (maxProducibleAtStep)
      const newStepCompletedQty = Math.min(
        totalProjectQty,
        maxProducibleAtStep,
        maxAllowedByUpstream,
        currentStepDone + actualUnitDelta
      );
      const isStepFullyCompletedForProject = newStepCompletedQty >= totalProjectQty;
      const isWotFinishedAtThisStep = nextWotStepUnits >= Math.min(wotQty, maxProducibleAtStep);

      // Identify downstream processes in SAME station (Rule 11.1) vs NEXT station (Rule 11.2)
      const downstreamSteps = allSteps.filter((s) => {
        let preds: string[] = [];
        try {
          preds = typeof s.predecessor_ids === "string" ? JSON.parse(s.predecessor_ids || "[]") : (s.predecessor_ids || []);
        } catch (e) {}
        return preds.includes(step.id) || (!preds.length && s.step_sequence === step.step_sequence + 1);
      });

      const unlockedIntraStationSteps: string[] = [];
      const transferredToNextStationSteps: string[] = [];
      let orchestrationEvents: any[] = [];
      let backflushedItems: any[] = [];

      db.transaction(() => {
        const pct = Math.min(100, Math.round((newStepCompletedQty / totalProjectQty) * 100));
        db.prepare(`
          UPDATE bill_of_processes
          SET completed_qty = ?,
              progress = ?,
              status = CASE WHEN ? >= 100 THEN 'COMPLETED' ELSE 'RUNNING' END,
              actual_start_date = COALESCE(actual_start_date, CURRENT_TIMESTAMP),
              actual_end_date = CASE WHEN ? >= 100 THEN CURRENT_TIMESTAMP ELSE actual_end_date END
          WHERE id = ?
        `).run(newStepCompletedQty, pct, pct, pct, step.id);

        // GATE 4: Real-Time BOM Backflush & Scrap Accounting
        backflushedItems = backflushBomConsumptionForUnits(
          id,
          step.id,
          targetWot.id,
          actualUnitDelta,
          deltaScrap,
          actor
        );

        // Rule 11.1: Intra-Station 1-Piece Pipeline — Unlock downstream process in SAME station as soon as >= 1 unit completed!
        if (nextWotStepUnits >= 1) {
          for (const ds of downstreamSteps) {
            const dsStation = resolveStepStationKey(ds, projectStations);
            if (dsStation === currentStationId && ds.status !== "COMPLETED" && ds.status !== "RUNNING" && !ds.is_manual_pause) {
              db.prepare(`
                UPDATE bill_of_processes
                SET status = 'RUNNING',
                    actual_start_date = COALESCE(actual_start_date, CURRENT_TIMESTAMP)
                WHERE id = ?
              `).run(ds.id);
              unlockedIntraStationSteps.push(ds.process_name);
            }
          }
        }

        // Rule 11.2: Inter-Station Minimum 1 WOT Auto-Transfer Gate
        let nextWotStatus = targetWot.status === "PENDING" ? "IN_PROGRESS" : targetWot.status;
        let nextBopId = step.id;
        let nextStationId = currentStationId;

        if (isWotFinishedAtThisStep) {
          for (const ds of downstreamSteps) {
            const dsStation = resolveStepStationKey(ds, projectStations);
            if (dsStation !== currentStationId) {
              nextWotStatus = "TRANSFERRED";
              nextBopId = ds.id;
              nextStationId = dsStation;
              const dsStMeta = projectStations.find((ps) => ps.id === dsStation || ps.station_code === dsStation);
              transferredToNextStationSteps.push(`${ds.process_name} (${dsStMeta?.station_code || dsStation})`);

              if (ds.status !== "COMPLETED" && !ds.is_manual_pause) {
                db.prepare(`
                  UPDATE bill_of_processes
                  SET status = 'RUNNING',
                      actual_start_date = COALESCE(actual_start_date, CURRENT_TIMESTAMP)
                  WHERE id = ?
                `).run(ds.id);
              }
            } else {
              nextBopId = ds.id;
            }
          }

          if (downstreamSteps.length === 0) {
            nextWotStatus = "COMPLETED";
          }
        }

        db.prepare(`
          UPDATE work_order_tickets
          SET process_progress_json = ?,
              good_units = ?,
              reject_units = COALESCE(reject_units, 0) + ?,
              status = ?,
              current_bop_id = ?,
              bop_id = ?,
              station_id = ?,
              current_station_id = ?,
              source_station_id = ?,
              target_station_id = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          JSON.stringify(progressMap),
          nextWotStepUnits,
          deltaScrap,
          nextWotStatus,
          nextBopId,
          nextBopId,
          nextStationId,
          nextStationId,
          currentStationId,
          nextStationId,
          targetWot.id
        );

        try {
          db.prepare(`
            INSERT INTO wot_travel_logs (
              id, wot_id, event_type, station_id, process_id, machine_id, user_name, timestamp, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
          `).run(
            `WTL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            targetWot.id,
            transferredToNextStationSteps.length > 0
              ? "INTER_STATION_TRANSFER"
              : unlockedIntraStationSteps.length > 0
              ? "INTRA_STATION_1PC_FLOW"
              : "UNIT_PROGRESS",
            currentStationId,
            step.id,
            step.assigned_machine_id || null,
            actor,
            JSON.stringify({
              wot_units_completed: nextWotStepUnits,
              wot_target_qty: wotQty,
              unlocked_intra_station: unlockedIntraStationSteps,
              transferred_inter_station: transferredToNextStationSteps,
            })
          );
        } catch (e) {}

        orchestrationEvents = runStationAutoOrchestration(id, undefined, actor);
      })();

      emitProductionUpdate("WOT_PIPELINE_ADVANCED", {
        project_id: id,
        wot_id: targetWot.id,
        bop_id: step.id,
        wot_units_completed: nextWotStepUnits,
        unlocked_intra_station: unlockedIntraStationSteps,
        transferred_inter_station: transferredToNextStationSteps,
        orchestration_events: orchestrationEvents,
      });

      res.json({
        ok: true,
        wot_id: targetWot.id,
        wot_number: targetWot.wot_number,
        wot_units_completed: nextWotStepUnits,
        wot_qty: wotQty,
        is_step_completed: isStepFullyCompletedForProject,
        unlocked_intra_station: unlockedIntraStationSteps,
        transferred_inter_station: transferredToNextStationSteps,
        orchestration_events: orchestrationEvents,
        message:
          transferredToNextStationSteps.length > 0
            ? `Rule 11.2 Inter-Station Transfer: WOT ${targetWot.wot_number} (${wotQty} pcs) completed ${step.process_name} & auto-transferred to ${transferredToNextStationSteps.join(", ")}!`
            : unlockedIntraStationSteps.length > 0
            ? `Rule 11.1 Intra-Station 1-Piece Flow: Unit #${nextWotStepUnits} completed at ${step.process_name} → Unlocked ${unlockedIntraStationSteps.join(", ")} in same station!`
            : `Logged +${deltaGood} unit(s) on ${targetWot.wot_number} at ${step.process_name} (${nextWotStepUnits}/${wotQty} pcs).`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ============================================================================
// BOP-INTEGRATED PROCESS QUALITY CONTROL (IPQC, FAI, NCR, COPQ & FPY)
// ============================================================================
function ensureQcProcessTables() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS qc_bop_inspections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      bop_id TEXT NOT NULL,
      wot_id TEXT,
      lot_number TEXT,
      station_name TEXT,
      process_name TEXT,
      step_sequence INTEGER DEFAULT 1,
      inspection_type TEXT DEFAULT 'IPQC',
      parameter_name TEXT NOT NULL,
      nominal_spec TEXT,
      tolerance_spec TEXT,
      measured_value TEXT,
      uom TEXT DEFAULT 'mm',
      sample_size INTEGER DEFAULT 5,
      passed_qty INTEGER DEFAULT 5,
      defect_qty INTEGER DEFAULT 0,
      disposition TEXT DEFAULT 'PASSED',
      checklist_json TEXT,
      inspector_name TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS qc_ncr_logs (
      id TEXT PRIMARY KEY,
      ncr_number TEXT UNIQUE NOT NULL,
      project_id TEXT NOT NULL,
      bop_id TEXT,
      wot_id TEXT,
      lot_number TEXT,
      station_name TEXT,
      process_name TEXT,
      defect_category TEXT NOT NULL,
      severity TEXT DEFAULT 'MAJOR',
      affected_qty INTEGER DEFAULT 1,
      disposition_action TEXT DEFAULT 'REWORK',
      root_cause TEXT,
      corrective_action TEXT,
      estimated_copq_idr REAL DEFAULT 0,
      status TEXT DEFAULT 'OPEN',
      reported_by TEXT,
      resolved_by TEXT,
      resolved_at DATETIME,
      replacement_pr_id TEXT,
      replacement_pr_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  try {
    const ncrCols = db.prepare("PRAGMA table_info(qc_ncr_logs)").all() as any[];
    const ncrColNames = new Set(ncrCols.map((c) => c.name));
    if (!ncrColNames.has("replacement_pr_id")) {
      db.prepare("ALTER TABLE qc_ncr_logs ADD COLUMN replacement_pr_id TEXT").run();
    }
    if (!ncrColNames.has("replacement_pr_number")) {
      db.prepare("ALTER TABLE qc_ncr_logs ADD COLUMN replacement_pr_number TEXT").run();
    }
  } catch (_) {}
}

/**
 * Helper to trigger BOM Material Shortage alert to PPIC and create a Draft Replacement PR
 * whenever units are scrapped during Process QC or NCR disposition.
 */
function createScrapMaterialReplacementPr(params: {
  projectId: string;
  bopStepId?: string | null;
  stationName: string;
  scrapQty: number;
  reasonRef: string;
  actor: string;
}): { prId: string | null; prNumber: string | null } {
  const { projectId, bopStepId, stationName, scrapQty, reasonRef, actor } = params;
  if (!projectId || scrapQty <= 0) return { prId: null, prNumber: null };

  try {
    // 1. Log Notice to Down Process / PPIC Material Shortage Alert
    const ndpId = `NDP-SCRAP-${Date.now().toString(36).toUpperCase()}`;
    db.prepare(`
      INSERT INTO notice_to_down_processes (
        id, project_id, bop_id, station_name, reason_category, reason_detail, status, reported_by
      ) VALUES (?, ?, ?, ?, 'MATERIAL_SHORTAGE', ?, 'ACTIVE', ?)
    `).run(
      ndpId,
      projectId,
      bopStepId || null,
      stationName,
      `[QC SCRAP REPLENISHMENT] ${scrapQty} PCS scrapped at ${stationName} (${reasonRef}). Material replacement required for PPIC/Purchasing.`,
      actor
    );

    // 2. Check Project BOM to generate Replacement Purchase Request (PR)
    const bomItems = db.prepare(`
      SELECT b.item_id, b.dimension, b.spec, b.required_qty, COALESCE(b.unit_price, i.unit_price, 0) as unit_price
      FROM boms b
      LEFT JOIN items i ON b.item_id = i.id
      WHERE b.project_id = ?
    `).all(projectId) as any[];

    if (bomItems.length === 0) {
      return { prId: null, prNumber: null };
    }

    const prId = `PR-SCRAP-${Date.now().toString(36).toUpperCase()}`;
    const prNumber = `PR-SCRAP-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
    const expectedDate = new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0];

    let totalEstCost = 0;
    for (const bi of bomItems) {
      const repQty = Math.max(1, Math.ceil(Number(bi.required_qty || 1) * scrapQty));
      totalEstCost += repQty * Number(bi.unit_price || 0);
    }

    db.prepare(`
      INSERT INTO purchase_requests (
        id, pr_number, project_id, expected_delivery_date, total_estimated_cost,
        status, urgency, remarks, category
      ) VALUES (?, ?, ?, ?, ?, 'DRAFTED', 'URGENT', ?, 'PROJECT')
    `).run(
      prId,
      prNumber,
      projectId,
      expectedDate,
      totalEstCost,
      `Auto-generated Replacement PR from QC Scrap (${scrapQty} PCS @ ${stationName} - ${reasonRef})`
    );

    const insertPrItem = db.prepare(`
      INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, expected_delivery_date, qty, unit_price, revision_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const bi of bomItems) {
      const repQty = Math.max(1, Math.ceil(Number(bi.required_qty || 1) * scrapQty));
      insertPrItem.run(
        `PRI-SCRAP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        prId,
        bi.item_id,
        bi.dimension || null,
        bi.spec || null,
        expectedDate,
        repQty,
        Number(bi.unit_price || 0),
        `QC Scrap Replacement (${reasonRef})`
      );
    }

    return { prId, prNumber };
  } catch (err) {
    console.error("Failed to create scrap replacement PR:", err);
    return { prId: null, prNumber: null };
  }
}

qcRouter.get(
  "/api/qc/process-hub",
  requireRole(["QA_QC", "PRODUCTION", "PPIC", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      ensureQcProcessTables();
      const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];

      const rawProjects = db.prepare(`
        SELECT p.*,
               (SELECT fgr_number FROM finish_good_records f WHERE f.project_id = p.id ORDER BY f.created_at DESC LIMIT 1) as fgr_number
        FROM projects p
        WHERE p.deleted_at IS NULL
          AND p.status NOT IN ('CANCELLED', 'INTERNAL_OVERHEAD')
        ORDER BY p.created_at DESC
      `).all() as any[];

      const mfgProjects = rawProjects.filter((p) => {
        const uId = String(p.id || "").toUpperCase();
        const uName = String(p.name || "").toUpperCase();
        return (
          !nonMfgIds.includes(uId) &&
          !uName.includes("CONSUMABLE") &&
          !uName.includes("TRANSPORTATION") &&
          !uName.includes("OTHER PROCUREMENT") &&
          !uName.includes("GENERAL PROCUREMENT") &&
          p.bop_status === "AUTHORIZED"
        );
      });

      const allBopSteps = db.prepare(`
        SELECT b.*,
               COALESCE(s.station_name, ps.station_name, b.work_center_name, 'Station ' || COALESCE(b.step_sequence, 1)) as resolved_station_name
        FROM bill_of_processes b
        LEFT JOIN stations s ON (b.station_id = s.id OR b.station_id = s.station_code)
        LEFT JOIN production_stations ps ON b.station_id = ps.id
        WHERE COALESCE(UPPER(b.node_type), 'PROCESS') NOT IN ('PRODUCT', 'START', 'END')
        ORDER BY b.step_sequence ASC
      `).all() as any[];

      const allWots = db.prepare(`
        SELECT * FROM work_order_tickets ORDER BY created_at ASC
      `).all() as any[];

      const rawInspections = db.prepare(`
        SELECT i.*, p.name as project_name, p.spk_number
        FROM qc_bop_inspections i
        LEFT JOIN projects p ON i.project_id = p.id
        ORDER BY i.created_at DESC
        LIMIT 300
      `).all() as any[];

      const inspections = rawInspections.map((i) => ({
        ...i,
        bop_step_id: i.bop_id,
        inspected_at: i.created_at,
      }));

      const rawNcrLogs = db.prepare(`
        SELECT n.*, p.name as project_name, p.spk_number
        FROM qc_ncr_logs n
        LEFT JOIN projects p ON n.project_id = p.id
        ORDER BY n.created_at DESC
        LIMIT 200
      `).all() as any[];

      const ncrLogs = rawNcrLogs.map((n) => ({
        ...n,
        bop_step_id: n.bop_id,
        defect_qty: Number(n.affected_qty) || 1,
        cost_of_poor_quality: Number(n.estimated_copq_idr) || 0,
      }));

      // Build enriched project list with BOP steps & WOTs
      let totalBopStepsCount = 0;
      let faiApprovedBopCount = 0;

      const enrichedProjects = mfgProjects.map((proj) => {
        const targetProjQty = Number(proj.qty) || 1;
        const steps = allBopSteps
          .filter(
            (b) =>
              b.project_id === proj.id ||
              (proj.spk_number && b.project_id === proj.spk_number)
          )
          .map((step) => {
            const stepInspections = inspections.filter((i) => i.bop_id === step.id);
            const stepNcrs = ncrLogs.filter((n) => n.bop_id === step.id);
            const faiRecord = stepInspections.find((i) => i.inspection_type === "FAI" && i.disposition === "PASSED");
            const latestInspection = stepInspections[0] || null;
            const resolvedStation = step.resolved_station_name || step.work_center_name || `Station ${step.step_sequence}`;
            const isFaiApproved = Boolean(faiRecord);
            totalBopStepsCount += 1;
            if (isFaiApproved) faiApprovedBopCount += 1;
            return {
              ...step,
              station_name: resolvedStation,
              station_label: resolvedStation,
              target_qty: Number(step.target_qty) || targetProjQty,
              completed_qty: Number(step.completed_qty) || 0,
              rework_qty: Number(step.rework_qty) || 0,
              qc_hold_qty: Number(step.qc_hold_qty) || 0,
              qc_criteria_text:
                step.qc_criteria ||
                "Verify dimensional tolerance (±0.05 mm), surface finish integrity, and zero visual defects per engineering drawing.",
              sop_instruction_text:
                step.sop_instruction ||
                "Follow standard station operating procedure, calibrate measuring gauge prior to cycle, and verify first piece.",
              fai_approved: isFaiApproved,
              fai_inspector: faiRecord?.inspector_name || null,
              inspections_count: stepInspections.length,
              open_ncr_count: stepNcrs.filter((n) => n.status === "OPEN").length,
              latest_disposition: latestInspection?.disposition || null,
              step_inspections: stepInspections,
            };
          });

        const wots = allWots.filter((w) => w.project_id === proj.id);
        const projNcrs = ncrLogs.filter((n) => n.project_id === proj.id);
        const projInspections = inspections.filter((i) => i.project_id === proj.id);
        const openNcrCount = projNcrs.filter((n) => n.status === "OPEN").length;
        const faiCompletedCount = steps.filter((s) => s.fai_approved).length;

        return {
          id: proj.id,
          name: proj.name,
          spk_number: proj.spk_number || proj.id,
          customer_name: proj.customer || proj.customer_name || "Internal Order",
          qty: targetProjQty,
          uom: proj.uom || "PCS",
          lot_size: Number(proj.lot_size) || 10,
          is_master_set: Boolean(proj.is_master_set),
          status: proj.status,
          bop_status: proj.bop_status || "AUTHORIZED",
          due_date: proj.due_date,
          fgr_number: proj.fgr_number || null,
          bop_steps: steps,
          wots,
          inspections_count: projInspections.length,
          open_ncr_count: openNcrCount,
          open_ncrs_count: openNcrCount,
          fai_completed_count: faiCompletedCount,
          total_bop_steps: steps.length,
        };
      });

      // Compute Station FPY & COPQ Analytics
      const stationStatsMap = new Map<
        string,
        {
          station_name: string;
          total_inspected: number;
          total_passed: number;
          total_defects: number;
          open_ncrs: number;
          total_copq_idr: number;
        }
      >();

      allBopSteps.forEach((st) => {
        const sName = st.resolved_station_name || st.work_center_name || "General Station";
        if (!stationStatsMap.has(sName)) {
          stationStatsMap.set(sName, {
            station_name: sName,
            total_inspected: 0,
            total_passed: 0,
            total_defects: 0,
            open_ncrs: 0,
            total_copq_idr: 0,
          });
        }
      });

      inspections.forEach((insp) => {
        const sName = insp.station_name || "General Station";
        const entry = stationStatsMap.get(sName) || {
          station_name: sName,
          total_inspected: 0,
          total_passed: 0,
          total_defects: 0,
          open_ncrs: 0,
          total_copq_idr: 0,
        };
        entry.total_inspected += Math.max(0, Number(insp.sample_size) || 0);
        entry.total_passed += Math.max(0, Number(insp.passed_qty) || 0);
        entry.total_defects += Math.max(0, Number(insp.defect_qty) || 0);
        stationStatsMap.set(sName, entry);
      });

      ncrLogs.forEach((ncr) => {
        const sName = ncr.station_name || "General Station";
        const entry = stationStatsMap.get(sName) || {
          station_name: sName,
          total_inspected: 0,
          total_passed: 0,
          total_defects: 0,
          open_ncrs: 0,
          total_copq_idr: 0,
        };
        if (ncr.status === "OPEN") entry.open_ncrs += 1;
        entry.total_copq_idr += Math.max(0, Number(ncr.estimated_copq_idr) || 0);
        stationStatsMap.set(sName, entry);
      });

      const stationAnalytics = Array.from(stationStatsMap.values()).map((st) => ({
        ...st,
        total_sample: st.total_inspected,
        total_defect: st.total_defects,
        open_ncr: st.open_ncrs,
        copq: st.total_copq_idr,
        fpy_pct:
          st.total_inspected > 0
            ? Number(((st.total_passed / st.total_inspected) * 100).toFixed(1))
            : 100,
      }));

      const totalSampleGlobal = inspections.reduce((s, i) => s + Math.max(0, Number(i.sample_size) || 0), 0);
      const totalPassedGlobal = inspections.reduce((s, i) => s + Math.max(0, Number(i.passed_qty) || 0), 0);
      const overallFpyPct =
        totalSampleGlobal > 0
          ? Number(((totalPassedGlobal / totalSampleGlobal) * 100).toFixed(1))
          : 100;
      const openNcrGlobal = ncrLogs.filter((n) => n.status === "OPEN").length;
      const totalCopqGlobal = ncrLogs.reduce((s, n) => s + Math.max(0, Number(n.estimated_copq_idr) || 0), 0);

      res.json({
        ok: true,
        projects: enrichedProjects,
        inspections,
        ncr_logs: ncrLogs,
        station_analytics: stationAnalytics,
        summary: {
          active_mfg_projects_count: enrichedProjects.filter((p) => p.status !== "COMPLETED").length,
          total_bop_steps_count: totalBopStepsCount,
          fai_approved_bop_count: faiApprovedBopCount,
          total_inspections_count: inspections.length,
          overall_fpy_pct: overallFpyPct,
          open_ncr_count: openNcrGlobal,
          total_ncr_count: ncrLogs.length,
          total_copq: totalCopqGlobal,
        },
      });
    } catch (err: any) {
      console.error("Failed to load QC Process Hub:", err);
      res.status(500).json({ error: err.message || "Failed to load QC Process Hub" });
    }
  }
);

qcRouter.post(
  "/api/qc/bop-inspections",
  requireRole(["QA_QC", "ENGINEERING", "PRODUCTION", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      ensureQcProcessTables();
      const {
        project_id,
        bop_id,
        bop_step_id,
        wot_id,
        lot_number,
        station_name,
        process_name,
        step_sequence,
        inspection_type = "IPQC",
        parameter_name,
        nominal_spec,
        tolerance_spec,
        measured_value,
        uom = "mm",
        sample_size = 5,
        passed_qty = 5,
        defect_qty = 0,
        disposition = "PASSED",
        checklist_items = [],
        notes,
      } = req.body;

      const resolvedBopId = bop_id || bop_step_id;

      if (!project_id || !resolvedBopId || !parameter_name) {
        return res.status(400).json({ error: "project_id, bop_step_id, and parameter_name are required" });
      }

      const stepRow = db.prepare(`
        SELECT b.*, COALESCE(s.station_name, ps.station_name, b.work_center_name, 'Station ' || COALESCE(b.step_sequence, 1)) as resolved_station_name
        FROM bill_of_processes b
        LEFT JOIN stations s ON (b.station_id = s.id OR b.station_id = s.station_code)
        LEFT JOIN production_stations ps ON b.station_id = ps.id
        WHERE b.id = ?
      `).get(resolvedBopId) as any;

      const wotRow = wot_id
        ? (db.prepare("SELECT lot_number FROM work_order_tickets WHERE id = ?").get(wot_id) as any)
        : null;

      const actor = getActor(req) || "QA/QC Inspector";
      const id = `QCI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const finalStationName = station_name || stepRow?.resolved_station_name || "Shop Floor Station";
      const finalProcessName = process_name || stepRow?.process_name || "Process Step";
      const finalSequence = Number(step_sequence) || Number(stepRow?.step_sequence) || 1;
      const finalLotNumber = lot_number || wotRow?.lot_number || null;

      db.transaction(() => {
        db.prepare(`
          INSERT INTO qc_bop_inspections (
            id, project_id, bop_id, wot_id, lot_number, station_name, process_name, step_sequence,
            inspection_type, parameter_name, nominal_spec, tolerance_spec, measured_value, uom,
            sample_size, passed_qty, defect_qty, disposition, checklist_json, inspector_name, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          project_id,
          resolvedBopId,
          wot_id || null,
          finalLotNumber,
          finalStationName,
          finalProcessName,
          finalSequence,
          inspection_type,
          parameter_name,
          nominal_spec || "-",
          tolerance_spec || "±0.05",
          measured_value || "-",
          uom,
          Number(sample_size) || 1,
          Number(passed_qty) || 0,
          Number(defect_qty) || 0,
          disposition,
          JSON.stringify(checklist_items || []),
          actor,
          notes || null
        );

        if (Number(defect_qty) > 0) {
          if (disposition === "REWORK" || disposition === "REJECTED") {
            db.prepare(`
              UPDATE bill_of_processes
              SET rework_qty = COALESCE(rework_qty, 0) + ?
              WHERE id = ?
            `).run(Number(defect_qty), resolvedBopId);
          } else if (disposition === "HOLD" || disposition === "SCRAP") {
            db.prepare(`
              UPDATE bill_of_processes
              SET qc_hold_qty = COALESCE(qc_hold_qty, 0) + ?
              WHERE id = ?
            `).run(Number(defect_qty), resolvedBopId);
          }
        }

        // Lock WOT if FAI failed or disposition is REJECTED / HOLD
        if (disposition === "REJECTED" || disposition === "HOLD") {
          if (wot_id) {
            db.prepare(`
              UPDATE work_order_tickets
              SET status = 'ON_HOLD'
              WHERE id = ? AND status NOT IN ('COMPLETED', 'FINISHED')
            `).run(wot_id);
          } else if (stepRow?.station_id) {
            db.prepare(`
              UPDATE work_order_tickets
              SET status = 'ON_HOLD'
              WHERE project_id = ? AND station_id = ? AND status NOT IN ('COMPLETED', 'FINISHED')
            `).run(project_id, stepRow.station_id);
          }
        }
      })();

      logAudit(
        actor,
        "QC_BOP_INSPECTION",
        "BOP_INSPECTION",
        id,
        `Logged ${inspection_type} inspection on ${finalProcessName} (${parameter_name}): ${disposition}`
      );

      res.json({
        ok: true,
        id,
        message: `${inspection_type} inspection recorded (${disposition}).`,
      });
    } catch (err: any) {
      console.error("Failed to record BOP inspection:", err);
      res.status(500).json({ error: err.message || "Failed to record BOP inspection" });
    }
  }
);

qcRouter.post(
  "/api/qc/ncr",
  requireRole(["QA_QC", "ENGINEERING", "PRODUCTION", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      ensureQcProcessTables();
      const {
        project_id,
        bop_id,
        bop_step_id,
        wot_id,
        lot_number,
        station_name,
        process_name,
        defect_category,
        severity = "MAJOR",
        affected_qty,
        defect_qty,
        disposition_action = "REWORK",
        root_cause,
        corrective_action,
        estimated_copq_idr,
        cost_of_poor_quality,
      } = req.body;

      if (!project_id || !defect_category) {
        return res.status(400).json({ error: "project_id and defect_category are required" });
      }

      const resolvedBopId = bop_id || bop_step_id || null;
      const resolvedQty = Math.max(1, Number(affected_qty ?? defect_qty) || 1);
      const resolvedCopq = Math.max(0, Number(estimated_copq_idr ?? cost_of_poor_quality) || 0);

      const stepRow = resolvedBopId
        ? (db.prepare(`
            SELECT b.*, COALESCE(s.station_name, ps.station_name, b.work_center_name, 'Station ' || COALESCE(b.step_sequence, 1)) as resolved_station_name
            FROM bill_of_processes b
            LEFT JOIN stations s ON (b.station_id = s.id OR b.station_id = s.station_code)
            LEFT JOIN production_stations ps ON b.station_id = ps.id
            WHERE b.id = ?
          `).get(resolvedBopId) as any)
        : null;

      const wotRow = wot_id
        ? (db.prepare("SELECT lot_number FROM work_order_tickets WHERE id = ?").get(wot_id) as any)
        : null;

      const actor = getActor(req) || "QA/QC Inspector";
      const id = `NCR-${Date.now().toString(36).toUpperCase()}`;
      const ncrNumber = `NCR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;
      const resolvedStationName = station_name || stepRow?.resolved_station_name || "Shop Floor Station";

      let replacementPrInfo: { prId: string | null; prNumber: string | null } = {
        prId: null,
        prNumber: null,
      };

      db.transaction(() => {
        if (disposition_action === "SCRAP" && resolvedQty > 0) {
          replacementPrInfo = createScrapMaterialReplacementPr({
            projectId: project_id,
            bopStepId: resolvedBopId,
            stationName: resolvedStationName,
            scrapQty: resolvedQty,
            reasonRef: ncrNumber,
            actor,
          });
        }

        db.prepare(`
          INSERT INTO qc_ncr_logs (
            id, ncr_number, project_id, bop_id, wot_id, lot_number, station_name, process_name,
            defect_category, severity, affected_qty, disposition_action, root_cause, corrective_action,
            estimated_copq_idr, status, reported_by, replacement_pr_id, replacement_pr_number
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
        `).run(
          id,
          ncrNumber,
          project_id,
          resolvedBopId,
          wot_id || null,
          lot_number || wotRow?.lot_number || null,
          resolvedStationName,
          process_name || stepRow?.process_name || "General Process",
          defect_category,
          severity,
          resolvedQty,
          disposition_action,
          root_cause || null,
          corrective_action || null,
          resolvedCopq,
          actor,
          replacementPrInfo.prId,
          replacementPrInfo.prNumber
        );

        if (resolvedBopId && resolvedQty > 0) {
          if (disposition_action === "REWORK") {
            db.prepare(`
              UPDATE bill_of_processes
              SET rework_qty = COALESCE(rework_qty, 0) + ?
              WHERE id = ?
            `).run(resolvedQty, resolvedBopId);
          } else if (disposition_action === "SCRAP" || disposition_action === "HOLD") {
            db.prepare(`
              UPDATE bill_of_processes
              SET qc_hold_qty = COALESCE(qc_hold_qty, 0) + ?
              WHERE id = ?
            `).run(resolvedQty, resolvedBopId);
          }
        }

        // Lock WOT in Shop Floor when NCR is issued
        if (wot_id) {
          db.prepare(`
            UPDATE work_order_tickets
            SET status = 'ON_HOLD'
            WHERE id = ? AND status NOT IN ('COMPLETED', 'FINISHED')
          `).run(wot_id);
        } else if (stepRow?.station_id) {
          db.prepare(`
            UPDATE work_order_tickets
            SET status = 'ON_HOLD'
            WHERE project_id = ? AND station_id = ? AND status NOT IN ('COMPLETED', 'FINISHED')
          `).run(project_id, stepRow.station_id);
        }
      })();

      logAudit(
        actor,
        "CREATE_NCR",
        "NCR",
        id,
        `Issued Non-Conformance Report ${ncrNumber} (${defect_category} - ${disposition_action})${replacementPrInfo.prNumber ? ` -> Auto-PR ${replacementPrInfo.prNumber}` : ""}`
      );

      res.json({
        ok: true,
        id,
        ncr_number: ncrNumber,
        replacement_pr_number: replacementPrInfo.prNumber,
        message: replacementPrInfo.prNumber
          ? `NCR ${ncrNumber} created (${disposition_action}). Auto-triggered PPIC Shortage & Replacement PR ${replacementPrInfo.prNumber}.`
          : `NCR ${ncrNumber} created with disposition: ${disposition_action}. Station WOT locked pending resolution.`,
      });
    } catch (err: any) {
      console.error("Failed to create NCR:", err);
      res.status(500).json({ error: err.message || "Failed to create NCR" });
    }
  }
);

qcRouter.post(
  "/api/qc/ncr/:id/resolve",
  requireRole(["QA_QC", "ENGINEERING", "PRODUCTION", "FC", "ADMIN", "SUPERADMIN"]),
  (req, res) => {
    try {
      ensureQcProcessTables();
      const { id } = req.params;
      const { corrective_action } = req.body;
      const actor = getActor(req) || "QA/QC Inspector";

      const ncr = db.prepare("SELECT * FROM qc_ncr_logs WHERE id = ?").get(id) as any;
      if (!ncr) {
        return res.status(404).json({ error: "NCR record not found" });
      }

      db.transaction(() => {
        db.prepare(`
          UPDATE qc_ncr_logs
          SET status = 'RESOLVED',
              corrective_action = COALESCE(?, corrective_action),
              resolved_by = ?,
              resolved_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(corrective_action || null, actor, id);

        const restoreQty = Math.max(0, Number(ncr.affected_qty) || 0);
        if (ncr.bop_id && restoreQty > 0 && ncr.status === "OPEN") {
          if (ncr.disposition_action === "REWORK") {
            db.prepare(`
              UPDATE bill_of_processes
              SET rework_qty = MAX(0, COALESCE(rework_qty, 0) - ?)
              WHERE id = ?
            `).run(restoreQty, ncr.bop_id);
          } else if (ncr.disposition_action === "HOLD" || ncr.disposition_action === "SCRAP") {
            db.prepare(`
              UPDATE bill_of_processes
              SET qc_hold_qty = MAX(0, COALESCE(qc_hold_qty, 0) - ?)
              WHERE id = ?
            `).run(restoreQty, ncr.bop_id);
          }
        }

        // Unlock WOTs if no other OPEN NCR remains on this project/BOP step
        const remainingOpen = db.prepare(`
          SELECT COUNT(*) as cnt FROM qc_ncr_logs
          WHERE project_id = ? AND COALESCE(bop_id, '') = COALESCE(?, '') AND status = 'OPEN' AND id != ?
        `).get(ncr.project_id, ncr.bop_id || "", id) as { cnt: number };

        if ((remainingOpen?.cnt || 0) === 0) {
          if (ncr.wot_id) {
            db.prepare(`
              UPDATE work_order_tickets
              SET status = 'IN_PROGRESS'
              WHERE id = ? AND status = 'ON_HOLD'
            `).run(ncr.wot_id);
          } else if (ncr.project_id) {
            db.prepare(`
              UPDATE work_order_tickets
              SET status = 'IN_PROGRESS'
              WHERE project_id = ? AND status = 'ON_HOLD'
            `).run(ncr.project_id);
          }
        }
      })();

      logAudit(actor, "RESOLVE_NCR", "NCR", id, `Resolved NCR ${ncr.ncr_number} and restored station WOT/BOP hold quantities`);
      res.json({
        ok: true,
        message: `NCR ${ncr.ncr_number} marked as RESOLVED, Rework/Hold quantities restored, and WOT unlocked.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to resolve NCR" });
    }
  }
);




