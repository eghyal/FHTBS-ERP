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
import { calculateTieredOvertimePay } from "../../lib/hrisEngine.ts";
import { calculateWotCycleEstimation, computeStationManpowerBalancing } from "../../utils/wotCycle.ts";

import {
  emitProductionUpdate,
  checkPredecessorsReadyForPipelining,
  preemptiveAutoPauseConflictingSteps,
  invalidatePlanningCache,
} from "./utils.ts";
import { syncProjectPlannedWavesWithMasterDates } from "../purchasing/procurementPlanRoutes.ts";


export const oeeRouter = Router();

oeeRouter.get(
      "/api/production/analytics",
      requireRole(["PPIC", "PRODUCTION", "ENGINEERING"]),
      (req, res) => {
        try {
          // 1. Vendor Reliability (Lead Time Analysis)
          const vendorReliability = db
            .prepare(
              `
        SELECT 
          po.supplier_name,
          AVG(julianday(g.received_date) - julianday(po.created_at)) as avg_lead_time,
          COUNT(g.id) as total_deliveries
        FROM purchase_orders po 
        JOIN grns g ON po.id = g.po_id
        WHERE po.archived_at IS NULL AND po.status IN ('RECEIVED', 'PARTIAL')
        GROUP BY po.supplier_name
      `,
            )
            .all() as any[];

          // 2. Consumption Habits (BOM vs Actual)
          const consumptionHabits = db
            .prepare(
              `
        SELECT 
          p.name as project_name,
          SUM(b.required_qty * COALESCE(p.qty, 1)) as total_required,
          SUM(COALESCE(bic.qty_consumed, 0)) as total_consumed
        FROM projects p
        JOIN boms b ON p.id = b.project_id
        LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
        WHERE p.status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED')
        GROUP BY p.id
      `,
            )
            .all() as any[];

          // 3. Current Active Personnel
          const activePersonnel = db
            .prepare(
              `
        SELECT COUNT(DISTINCT lre.operator_name) as count
        FROM lot_routing_executions lre
        WHERE lre.status IN ('RUNNING', 'IN_PROGRESS') AND lre.operator_name IS NOT NULL AND lre.operator_name != ''
      `,
            )
            .get() as any;

          

          res.json({ vendorReliability, consumptionHabits, activePersonnel: activePersonnel?.count || 0 });
        } catch (error) {
          console.error(error);
          res
            .status(500)
            .json({ error: "Failed to fetch production insights" });
        }
      },
    );

oeeRouter.get("/api/work-centers", (req, res) => {
      try {
        const wcs = db.prepare("SELECT * FROM work_centers").all();
        res.json(wcs);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch work centers" });
      }
    });

oeeRouter.post("/api/work-centers", (req, res) => {
      try {
        const {
          id,
          name,
          manpower_count,
          hours_per_day,
          days_per_week,
          efficiency_index,
          status,
        } = req.body;
        const capacity_per_week =
          manpower_count * hours_per_day * days_per_week;
        db.prepare(
          `
        INSERT INTO work_centers (id, name, manpower_count, hours_per_day, days_per_week, capacity_per_week, efficiency_index, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          manpower_count = excluded.manpower_count,
          hours_per_day = excluded.hours_per_day,
          days_per_week = excluded.days_per_week,
          capacity_per_week = excluded.capacity_per_week,
          efficiency_index = excluded.efficiency_index,
          status = excluded.status
      `,
        ).run(
          id,
          name,
          manpower_count,
          hours_per_day,
          days_per_week,
          capacity_per_week,
          efficiency_index || 1.0,
          status || "ACTIVE",
        );
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update work center" });
      }
    });

oeeRouter.post(
      "/api/work-centers/bulk",
      requireRole(["FC", "PPIC", "PRODUCTION", "ENGINEERING"]),
      (req, res) => {
        const userRole = (req as any).userRole;
        const userLevel = (req as any).userLevel;
        if (userRole !== "FC" && userRole !== "PPIC" && userLevel !== "MANAGER") {
          return res
            .status(403)
            .json({
              error:
                "Access denied. Only FC, PPIC, or production/engineering managers can configure work centers.",
            });
        }
        try {
          const { centers } = req.body;
          const stmt = db.prepare(`
        INSERT INTO work_centers (id, name, manpower_count, hours_per_day, days_per_week, capacity_per_week, efficiency_index, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          manpower_count = excluded.manpower_count,
          hours_per_day = excluded.hours_per_day,
          days_per_week = excluded.days_per_week,
          capacity_per_week = excluded.capacity_per_week,
          efficiency_index = excluded.efficiency_index,
          status = excluded.status
      `);

          const transaction = db.transaction(() => {
            for (const wc of centers) {
              const capacity =
                wc.manpower_count * wc.hours_per_day * wc.days_per_week;
              stmt.run(
                wc.id,
                wc.name,
                wc.manpower_count,
                wc.hours_per_day,
                wc.days_per_week,
                capacity,
                wc.efficiency_index || 1.0,
                wc.status || "ACTIVE",
              );
            }
          });
          transaction();
          res.json({ success: true });
        } catch (error) {
          console.error(error);
          res.status(500).json({ error: "Failed to bulk update work centers" });
        }
      },
    );

oeeRouter.delete("/api/work-centers/:id", (req, res) => {
      try {
        const tasksCountRow = db
          .prepare(
            "SELECT COUNT(*) as count FROM project_tasks WHERE work_center_id = ?",
          )
          .get(req.params.id) as { count: number };
        if (tasksCountRow.count > 0) {
          return res.status(400).json({
            error:
              "Cannot delete work center because it is assigned to existing tasks.",
          });
        }
        db.prepare("DELETE FROM work_centers WHERE id = ?").run(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete work center" });
      }
    });


oeeRouter.post("/api/production/work-centers/:id/wip-limit", (req, res) => {
      try {
        const wcId = req.params.id;
        const { wip_limit } = req.body;
        const num = parseInt(wip_limit, 10);
        if (isNaN(num) || num < 1) {
          return res.status(400).json({ error: "Invalid CONWIP limit value. Must be a positive integer." });
        }

        db.prepare("UPDATE work_centers SET wip_limit = ? WHERE id = ?").run(num, wcId);

        logAudit(
          getActor(req),
          "UPDATE_CONWIP_LIMIT",
          "WORK_CENTER",
          wcId,
          `Updated CONWIP limit to ${num} units for Work Center ${wcId}`
        );

        res.json({ success: true, wip_limit: num });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

oeeRouter.get("/api/production/work-center-routings", (req, res) => {
      try {
        const { project_id } = req.query;
        let query = `
          SELECT r.*, wc.name as work_center_name, wc.wip_limit, p.name as project_name
          FROM work_center_routings r
          JOIN work_centers wc ON r.work_center_id = wc.id
          LEFT JOIN projects p ON r.project_id = p.id
        `;
        const params: any[] = [];
        if (project_id) {
          query += " WHERE r.project_id = ?";
          params.push(project_id);
        }
        query += " ORDER BY r.step_sequence ASC";

        const routings = db.prepare(query).all(...params);
        res.json(routings);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

oeeRouter.post("/api/production/work-center-routings", (req, res) => {
      try {
        const { project_id, routings } = req.body;
        if (!project_id || !Array.isArray(routings)) {
          return res.status(400).json({ error: "Invalid payload: project_id and routings array required." });
        }

        const transaction = db.transaction(() => {
          db.prepare("DELETE FROM work_center_routings WHERE project_id = ?").run(project_id);

          const stmt = db.prepare(`
            INSERT INTO work_center_routings (id, project_id, step_sequence, work_center_id, operation_name, standard_cycle_time_mins)
            VALUES (?, ?, ?, ?, ?, ?)
          `);

          routings.forEach((r: any, idx: number) => {
            const id = "ROUT-" + Date.now() + "-" + idx + "-" + Math.random().toString(36).substring(2, 5);
            stmt.run(
              id,
              project_id,
              r.step_sequence || (idx + 1),
              r.work_center_id,
              r.operation_name || `Step ${idx + 1}`,
              r.standard_cycle_time_mins || 30
            );
          });
        });

        transaction();
        res.json({ success: true, count: routings.length });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });


oeeRouter.post("/api/production/projects/:id/set-master", (req, res) => {
      try {
        const { id } = req.params;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        const bopSteps = db.prepare("SELECT * FROM bill_of_processes WHERE project_id = ? AND node_type != 'PRODUCT'").all(id) as any[];
        if (bopSteps.length === 0) {
          return res.status(400).json({ error: "No Bill of Process (BoP) steps found for this project. Please build routing first." });
        }

        const userIdentifier = getActor(req);

        // Initialize Product Node Lifecycles
        const productNodes = db.prepare("SELECT * FROM bill_of_processes WHERE project_id = ? AND node_type = 'PRODUCT'").all(id) as any[];
        const insertLifecycle = db.prepare(`
          INSERT INTO product_node_lifecycle (id, project_id, bop_step_id, status, qty, location)
          VALUES (?, ?, ?, 'PLANNED', 0, 'STAGING')
        `);

        for (const node of productNodes) {
          const existing = db.prepare("SELECT id FROM product_node_lifecycle WHERE bop_step_id = ?").get(node.id);
          if (!existing) {
            insertLifecycle.run(crypto.randomUUID(), id, node.id);
          }
        }

        db.prepare(`
          UPDATE projects
          SET is_master_set = 1, master_set_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(id);

        logAudit(userIdentifier, "MASTER_DATA_SET", "PROJECT", id, `Master Data & Operator Assignments set and locked for project ${project.name}`);

        res.json({ success: true, message: "Master Data & Assignments set successfully" });
      } catch (err: any) {
        console.error("Error setting master data:", err);
        res.status(500).json({ error: err.message });
      }
    });

oeeRouter.post("/api/production/projects/:id/unlock-master", (req, res) => {
      try {
        const { id } = req.params;
        db.prepare(`UPDATE projects SET is_master_set = 0 WHERE id = ?`).run(id);
        res.json({ success: true, message: "Master Data unlocked for editing" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

oeeRouter.post("/api/production/projects/:id/start-all", (req, res) => {
      try {
        const { id } = req.params;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }

        const activeNdp = db.prepare(`SELECT COUNT(*) as count FROM notice_to_down_processes WHERE project_id = ? AND status = 'ACTIVE'`).get(id) as any;
        if (activeNdp && activeNdp.count > 0) {
          return res.status(400).json({ error: "Cannot start production line while there is an ACTIVE downtime notice (NDP). Resolve it first." });
        }

        const bopSteps = db.prepare("SELECT * FROM bill_of_processes WHERE project_id = ? AND node_type != 'PRODUCT' ORDER BY step_sequence ASC").all(id) as any[];
        if (bopSteps.length === 0) {
          return res.status(400).json({ error: "No routing process steps found." });
        }

        const userIdentifier = getActor(req);
        const nowIso = new Date().toISOString();

        let startedCount = 0;
        const projectLots = db.prepare(`SELECT * FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC`).all(id) as any[];

        db.transaction(() => {
          for (let i = 0; i < bopSteps.length; i++) {
            const step = bopSteps[i];
            if (step.status === 'COMPLETED' || step.status === 'RUNNING') continue;

            const predCheck = checkPredecessorsReadyForPipelining(step.id, id);
            
            // Check step predecessors specifically for lots
            let predIds: string[] = [];
            if (step.predecessor_ids) {
              try {
                const parsed = JSON.parse(step.predecessor_ids);
                if (Array.isArray(parsed)) predIds = parsed;
              } catch (e) {
                predIds = [];
              }
            } else if (i > 0) {
              predIds = [bopSteps[i - 1].id];
            }

            for (const lot of projectLots) {
              let isLotUnlocked = true;
              const procPredIds = predIds.filter(pId => {
                const pNode = db.prepare(`SELECT node_type FROM bill_of_processes WHERE id = ?`).get(pId) as any;
                return !pNode || pNode.node_type !== 'PRODUCT';
              });
              if (procPredIds.length > 0) {
                for (const predId of procPredIds) {
                  const predExec = db.prepare(`SELECT status, good_qty FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot.id, predId) as any;
                  if (!predExec || (predExec.status !== 'COMPLETED' && (predExec.good_qty || 0) < (lot.target_qty || 1))) {
                    isLotUnlocked = false;
                    break;
                  }
                }
              }

              const lotInitialStatus = isLotUnlocked && predCheck.isReady ? 'RUNNING' : 'LOCKED';

              const exec = db.prepare(`SELECT id, status FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot.id, step.id) as any;
              if (exec) {
                if (exec.status !== 'COMPLETED') {
                  db.prepare(`
                    UPDATE lot_routing_executions
                    SET status = ?,
                        operator_name = COALESCE(NULLIF(operator_name, ''), ?),
                        start_time = CASE WHEN ? = 'RUNNING' THEN COALESCE(start_time, ?) ELSE start_time END
                    WHERE id = ?
                  `).run(lotInitialStatus, userIdentifier, lotInitialStatus, nowIso, exec.id);
                }
              } else {
                const newId = "LEX-" + Math.random().toString(36).substr(2, 9);
                db.prepare(`
                  INSERT INTO lot_routing_executions (id, lot_id, bop_id, status, good_qty, operator_name, start_time)
                  VALUES (?, ?, ?, ?, 0, ?, ?)
                `).run(newId, lot.id, step.id, lotInitialStatus, userIdentifier, lotInitialStatus === 'RUNNING' ? nowIso : null);
              }
            }

            // Only start the actual station if predecessors are ready for pipelining
            if (!predCheck.isReady) {
               continue; 
            }

            // Check if any assigned operator for this step is ALREADY active on a station running in this project
            const stepAssignments = db.prepare(`
              SELECT DISTINCT manpower_id 
              FROM production_manpower_assignments 
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?))
                AND status NOT IN ('CANCELLED', 'COMPLETED')
            `).all(step.id, id, step.process_name) as any[];

            const activeMpIds = stepAssignments.map(a => a.manpower_id).filter(Boolean);
            let isOperatorAlreadyRunning = false;
            if (activeMpIds.length > 0) {
              const placeholders = activeMpIds.map(() => '?').join(',');
              const alreadyRunningCount = db.prepare(`
                SELECT COUNT(*) as count
                FROM bill_of_processes b
                JOIN production_manpower_assignments a 
                  ON (a.bop_id = b.id OR (a.bop_id IS NULL AND a.project_id = b.project_id AND a.task_name = b.process_name))
                WHERE a.manpower_id IN (${placeholders})
                  AND b.project_id = ?
                  AND b.status = 'RUNNING'
                  AND b.id != ?
              `).get(...activeMpIds, id, step.id) as any;

              if (alreadyRunningCount && alreadyRunningCount.count > 0) {
                isOperatorAlreadyRunning = true;
              }
            }

            // If operator is already busy on an earlier station, leave downstream station ready for when operator switches
            if (isOperatorAlreadyRunning) {
              continue;
            }

            preemptiveAutoPauseConflictingSteps(step.id, id, userIdentifier);

            // At this point, the station is ready to start
            db.prepare(`
              UPDATE bill_of_processes
              SET status = 'RUNNING',
                  progress = CASE WHEN progress = 0 THEN 25 ELSE progress END,
                  actual_start_date = COALESCE(actual_start_date, ?)
              WHERE id = ?
            `).run(nowIso, step.id);

            db.prepare(`
              UPDATE project_tasks
              SET status = 'RUNNING',
                  progress = CASE WHEN progress = 0 THEN 25 ELSE progress END,
                  actual_start_date = COALESCE(actual_start_date, ?)
              WHERE id = ?
            `).run(nowIso, step.id);

            db.prepare(`
              UPDATE production_manpower_assignments
              SET status = 'ACTIVE'
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?)) AND status IN ('SCHEDULED', 'PAUSED')
            `).run(step.id, id, step.process_name);

            startedCount++;
          }

          logAudit(userIdentifier, "BOP_START_READY", "PROJECT", id, `Started ${startedCount} available production stations for project ${project.name}`);
        })();

        res.json({ success: true, message: `Activated ${startedCount} ready stations based on dependency constraints.`, started_count: startedCount });
      } catch (err: any) {
        console.error("Error starting available production stations:", err);
        res.status(500).json({ error: err.message });
      }
    });


    // Production Lots endpoint
    oeeRouter.get("/api/production/projects/:id/lots", (req, res) => {
      try {
        const { id: projectId } = req.params;
        const lots = db.prepare(`
          SELECT * FROM production_lots 
          WHERE project_id = ? 
             OR spk_id = (SELECT spk_number FROM projects WHERE id = ?)
             OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
          ORDER BY lot_number ASC
        `).all(projectId, projectId, projectId);
        res.json({ success: true, lots });
      } catch (err: any) {
        console.error("Error fetching lots:", err);
        res.status(500).json({ error: "Failed to fetch production lots" });
      }
    });

    // Station WOT ETAs endpoint
    oeeRouter.get("/api/production/projects/:id/wot-eta", (req, res) => {
      try {
        const { id: projectId } = req.params;
        const stations = db.prepare(`
          SELECT * FROM project_stations 
          WHERE project_id = ? OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
          ORDER BY station_sequence ASC
        `).all(projectId, projectId);

        const stationEtas = (stations || []).map((s: any, idx: number) => ({
          station_id: s.id,
          station_name: s.station_name,
          sequence: s.station_sequence || (idx + 1),
          estimated_start_time: new Date(Date.now() + idx * 3600000).toISOString(),
          estimated_finish_time: new Date(Date.now() + (idx + 1) * 3600000).toISOString(),
          lead_time_minutes: 60,
        }));

        res.json({ success: true, station_etas: stationEtas });
      } catch (err: any) {
        console.error("Error fetching wot-eta:", err);
        res.status(500).json({ error: "Failed to fetch station ETAs" });
      }
    });

    // WOT Critical Path Method (CPM) endpoint
    oeeRouter.get("/api/production/projects/:id/wot-cpm", (req, res) => {
      try {
        const { id: projectId } = req.params;
        const wotQty = Number(req.query.wot_qty) || 10;
        const bops = db.prepare(`
          SELECT * FROM bill_of_processes 
          WHERE project_id = ? OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
          ORDER BY step_sequence ASC
        `).all(projectId, projectId) as any[];

        let cumulativeMinutes = 0;
        const nodes = (bops || []).map((b: any, idx: number) => {
          const ct = Number(b.cycle_time_minutes) || 15;
          const duration = Math.round(ct * wotQty);
          const es = cumulativeMinutes;
          cumulativeMinutes += duration;
          return {
            id: b.id,
            name: b.process_name || `Step ${idx + 1}`,
            step_sequence: b.step_sequence || (idx + 1),
            cycle_time_minutes: ct,
            duration_minutes: duration,
            early_start: es,
            early_finish: cumulativeMinutes,
            late_start: es,
            late_finish: cumulativeMinutes,
            slack_minutes: 0,
            is_critical: true,
          };
        });

        const totalLeadTimeMinutes = cumulativeMinutes;
        const totalLeadTimeDays = Number((totalLeadTimeMinutes / (8 * 60)).toFixed(2));

        res.json({
          success: true,
          totalLeadTimeMinutes,
          totalLeadTimeDays,
          nodes,
        });
      } catch (err: any) {
        console.error("Error calculating wot-cpm:", err);
        res.status(500).json({ error: "Failed to calculate CPM" });
      }
    });

    // Production Capacity Gap Analysis endpoint
    oeeRouter.get("/api/production/projects/:id/gap-analysis", (req, res) => {
      try {
        res.json({
          success: true,
          gaps: [],
          status: "BALANCED",
          bottleneck_step: null,
          recommended_lot_size: 10,
        });
      } catch (err: any) {
        console.error("Error calculating gap-analysis:", err);
        res.status(500).json({ error: "Failed to calculate gap analysis" });
      }
    });

    // Mathematical Cycle Estimation for 1 WOT from Root to Finish & Per Station
    oeeRouter.get("/api/production/projects/:id/wot-cycle-estimation", (req, res) => {
      try {
        const { id: projectId } = req.params;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });

        const factoryFactor = project.factory_factor || 85;
        const wotQty = req.query.wot_qty ? Number(req.query.wot_qty) : (project.lot_size || 10);

        // Fetch Bill of Processes with Station info
        const bops = db.prepare(`
          SELECT b.*, 
                 COALESCE(s.id, 'STATION_DEFAULT') as station_id,
                 COALESCE(s.station_name, 'Station 1') as station_name,
                 COALESCE(s.station_sequence, 1) as station_sequence
          FROM bill_of_processes b
          LEFT JOIN project_stations s ON b.station_id = s.id
          WHERE b.project_id = ?
          ORDER BY COALESCE(s.station_sequence, 1) ASC, b.step_sequence ASC
        `).all(projectId) as any[];

        // Fetch operator assignments
        const assignments = db.prepare(`
          SELECT * FROM production_manpower_assignments
          WHERE project_id = ? AND status NOT IN ('CANCELLED', 'COMPLETED')
        `).all(projectId) as any[];

        const nodes: any[] = bops.map((b) => {
          let predIds: string[] = [];
          try {
            predIds = b.predecessor_ids ? JSON.parse(b.predecessor_ids) : [];
          } catch (e) {
            predIds = [];
          }

          const opIds = assignments
            .filter((a: any) => a.bop_id === b.id)
            .map((a: any) => a.manpower_id || a.operator_id || a.user_id);

          return {
            id: b.id,
            name: b.process_name,
            stationId: b.station_id,
            stationName: b.station_name,
            stationSequence: b.station_sequence,
            cycleTimeMinutes: b.cycle_time_minutes || 10,
            predecessorIds: predIds,
            assignedOperatorIds: opIds,
            manpowerCount: Math.max(1, opIds.length || b.manpower_required || 1),
            targetQty: project.target_quantity || 100,
            completedQty: b.completed_quantity || 0,
            wipBufferQty: b.wip_quantity || 0,
            status: b.status || "PENDING",
          };
        });

        const estimation = calculateWotCycleEstimation({
          projectId,
          wotQty,
          factoryFactor,
          workingHoursPerDay: 8,
          nodes,
        });

        res.json({ ok: true, success: true, estimation });
      } catch (err: any) {
        console.error("WOT Cycle Estimation Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Station-Scoped Manpower Auto-Balancing Algorithm
    oeeRouter.post("/api/production/stations/:stationId/rebalance-manpower", (req, res) => {
      try {
        const { stationId } = req.params;
        const station = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any;
        if (!station) return res.status(404).json({ error: "Station not found" });

        const projectId = station.project_id;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
        const wotQty = project?.lot_size || 10;

        const bops = db.prepare(`
          SELECT * FROM bill_of_processes 
          WHERE station_id = ? OR (project_id = ? AND station_id IS NULL)
          ORDER BY step_sequence ASC
        `).all(stationId, projectId) as any[];

        const assignments = db.prepare(`
          SELECT a.*, pm.name as user_name
          FROM production_manpower_assignments a
          LEFT JOIN production_manpower pm ON a.manpower_id = pm.id
          WHERE a.project_id = ? AND a.status NOT IN ('CANCELLED', 'COMPLETED')
        `).all(projectId) as any[];

        // Extract station operators
        const operatorMap = new Map<string, string>();
        assignments.forEach((a: any) => {
          const opId = a.manpower_id || a.operator_id || a.user_id;
          if (opId) {
            operatorMap.set(opId, a.user_name || a.operator_name || opId);
          }
        });

        const operators = Array.from(operatorMap.entries()).map(([id, name]) => ({ id, name }));

        const nodes: any[] = bops.map((b) => {
          let predIds: string[] = [];
          try {
            predIds = b.predecessor_ids ? JSON.parse(b.predecessor_ids) : [];
          } catch (e) {
            predIds = [];
          }

          const opIds = assignments
            .filter((a: any) => a.bop_id === b.id)
            .map((a: any) => a.manpower_id || a.operator_id || a.user_id);

          return {
            id: b.id,
            name: b.process_name,
            stationId,
            stationName: station.station_name,
            stationSequence: station.station_sequence || 1,
            cycleTimeMinutes: b.cycle_time_minutes || 10,
            predecessorIds: predIds,
            assignedOperatorIds: opIds,
            manpowerCount: Math.max(1, opIds.length || 1),
            targetQty: project?.target_quantity || 100,
            completedQty: b.completed_quantity || 0,
            wipBufferQty: b.wip_quantity || 0,
            status: b.status || "PENDING",
          };
        });

        const result = computeStationManpowerBalancing({
          stationId,
          wotQty,
          processes: nodes,
          operators,
        });

        emitProductionUpdate("MANPOWER_REBALANCED", { stationId, result });

        res.json({ ok: true, success: true, result });
      } catch (err: any) {
        console.error("Manpower Rebalance Error:", err);
        res.status(500).json({ error: err.message });
      }
    });


// Overtime Management & Direct Labor Integration with Project HPP
oeeRouter.get("/api/production/projects/:id/overtime", (req, res) => {
  try {
    const projectId = req.params.id;
    const query = `
      SELECT 
        pos.*,
        pm.name as operator_name,
        pm.role as operator_role,
        pm.user_username,
        COALESCE(pos.hourly_rate, pm.hourly_rate, 45000) as hourly_rate,
        ps.name as station_name
      FROM project_overtime_schedules pos
      LEFT JOIN production_manpower pm ON pos.manpower_id = pm.id
      LEFT JOIN project_stations ps ON pos.station_id = ps.id
      WHERE pos.project_id = ?
      ORDER BY pos.date DESC, pos.created_at DESC
    `;
    const rows = db.prepare(query).all(projectId) as any[];

    const data = rows.map((r: any) => {
      const rate = Number(r.hourly_rate) || 45000;
      const otHrs = Number(r.overtime_hours) || 2;
      const otCalc = calculateTieredOvertimePay(rate * 173, 0, otHrs);
      const estCost = Number(r.estimated_cost) > 0 
        ? Number(r.estimated_cost) 
        : (otCalc.totalPay > 0 ? otCalc.totalPay : Math.round(otHrs * rate * 1.5));
      return {
        ...r,
        hourly_rate: rate,
        estimated_overtime_cost: estCost,
      };
    });

    res.json({ ok: true, data });
  } catch (err: any) {
    console.error("Failed to fetch project overtime schedules:", err);
    res.status(500).json({ error: err.message });
  }
});

oeeRouter.post("/api/production/projects/:id/overtime", (req, res) => {
  try {
    const projectId = req.params.id;
    const { manpower_id, station_id, date, overtime_hours, reason, status = "APPROVED" } = req.body;

    if (!manpower_id || !date) {
      return res.status(400).json({ error: "Manpower and date are required" });
    }

    const mp = db.prepare("SELECT * FROM production_manpower WHERE id = ?").get(manpower_id) as any;
    const rate = Number(mp?.hourly_rate) || 45000;
    const otHrs = Number(overtime_hours) || 2;
    const otCalc = calculateTieredOvertimePay(rate * 173, 0, otHrs);
    const estCost = otCalc.totalPay > 0 ? otCalc.totalPay : Math.round(otHrs * rate * 1.5);
    const id = "OT-" + Math.random().toString(36).substring(2, 9).toUpperCase();
    const userEmail = getActor(req);

    db.prepare(`
      INSERT INTO project_overtime_schedules (
        id, project_id, manpower_id, station_id, date, overtime_hours, reason, status, created_by, hourly_rate, estimated_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      projectId,
      manpower_id,
      station_id || null,
      date,
      otHrs,
      reason || "Pengejaran target deadline SPK",
      status,
      userEmail,
      rate,
      estCost,
    );

    // Synchronize to Project HPP & Financial Summaries directly
    try {
      recalculateProjectFinancialSummary(db, projectId);
    } catch (hppErr) {
      console.warn("Auto-recalculation of HPP on overtime creation skipped:", hppErr);
    }

    res.json({
      ok: true,
      message: "Overtime schedule created successfully",
      data: {
        id,
        project_id: projectId,
        manpower_id,
        station_id,
        date,
        overtime_hours: otHrs,
        reason,
        status,
        hourly_rate: rate,
        estimated_overtime_cost: estCost,
        operator_name: mp?.name,
        operator_role: mp?.role,
      },
    });
  } catch (err: any) {
    console.error("Failed to create overtime schedule:", err);
    res.status(500).json({ error: err.message });
  }
});

oeeRouter.delete("/api/production/projects/:id/overtime/:overtimeId", (req, res) => {
      try {
        const { id: projectId, overtimeId } = req.params;
        db.prepare("DELETE FROM project_overtime_schedules WHERE id = ?").run(overtimeId);

        // Recalculate Project HPP
        try {
          recalculateProjectFinancialSummary(db, projectId);
        } catch (hppErr) {
          console.warn("Auto-recalculation of HPP on overtime deletion skipped:", hppErr);
        }

        res.json({ success: true, message: "Overtime schedule deleted and HPP updated" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });


// CROSS-PROJECT NDP, TACTICAL CONTROLS, COMMUNICATION & FACTORY FACTOR WMA
// ============================================================================

oeeRouter.get("/api/production/factory-factor-wma", (req, res) => {
  try {
    const globalRow = db.prepare(`SELECT value FROM system_settings WHERE key = 'global_factory_factor'`).get() as any;
    const rawHistory = db.prepare(`
      SELECT * FROM factory_factor_history ORDER BY created_at DESC LIMIT 15
    `).all() as any[];

    const history = rawHistory.map((h: any, idx: number) => {
      const olderEntry = rawHistory[idx + 1];
      const prevWmaForEntry = olderEntry ? Number(olderEntry.new_wma_ff) : Number(h.planned_ff) || 85.0;
      return {
        ...h,
        calculated_project_ff: Number(h.achieved_ff ?? h.calculated_project_ff ?? 85.0),
        previous_wma_ff: Number(h.previous_wma_ff ?? prevWmaForEntry),
        new_wma_ff: Number(h.new_wma_ff ?? 85.0),
        planned_hours: Number(h.planned_hours ?? 0),
        actual_hours: Number(h.actual_hours ?? 0),
      };
    });

    const currentWma = globalRow?.value
      ? Number(globalRow.value)
      : history.length > 0
      ? Number(history[0].new_wma_ff)
      : 85.0;

    const prevWma = history.length > 1 ? Number(history[1].new_wma_ff) : 85.0;
    const delta = Number((currentWma - prevWma).toFixed(1));

    res.json({
      ok: true,
      current_wma_ff: currentWma,
      previous_wma_ff: prevWma,
      delta,
      trend: currentWma >= 100 ? "OPTIMAL" : delta >= 0 ? "IMPROVING" : "DECLINING",
      history,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

oeeRouter.get("/api/production/projects/:id/execution-summary", (req, res) => {
  try {
    const { id } = req.params;
    const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
    if (!project) return res.status(404).json({ error: "Project not found" });

    let summary = null;
    if (project.execution_summary_json) {
      try {
        summary = JSON.parse(project.execution_summary_json);
      } catch (e) {}
    }

    const fgr = db.prepare(`SELECT * FROM finish_good_records WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`).get(id) as any;
    const ffHistory = db.prepare(`SELECT * FROM factory_factor_history ORDER BY created_at DESC LIMIT 10`).all() as any[];

    res.json({
      ok: true,
      project_status: project.status,
      execution_summary: summary,
      fgr,
      ff_history: ffHistory,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


oeeRouter.post("/api/production/projects/:id/commit-plan", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      start_date,
      lot_size,
      factory_factor,
      shift_hours,
      planned_completion_date,
      planned_total_hours,
      process_configs, // Array of { id, station_id, assigned_machine_id, cycle_time_minutes, manpower_count }
    } = req.body;

    const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
    if (!project) return res.status(404).json({ error: "Project not found" });

    if (project.bop_status !== "AUTHORIZED") {
      return res.status(400).json({
        error: "Rencana proses (BOP) belum disetujui / diotorisasi oleh Engineering. Otorisasi BOP diperlukan sebelum merilis ke produksi."
      });
    }

    const actor = getActor(req) || "PPIC Planner";
    const effectiveLotSize = Math.max(1, Number(lot_size) || Number(project.lot_size) || 10);
    const effectiveFf = Math.max(10, Math.min(150, Number(factory_factor) || Number(project.factory_factor) || 85));
    const effectiveShiftHours = Math.max(1, Math.min(24, Number(shift_hours) || 8));
    const effectiveStartDate = start_date || project.start_date || new Date().toISOString().slice(0, 10);

    let reservedItemsCount = 0;
    let shortageItemsCount = 0;
    let autoGeneratedPrNumber: string | null = null;
    let autoGeneratedPrId: string | null = null;

    const reservedItemsDetail: Array<{
      item_name: string;
      required_qty: number;
      reserved_qty: number;
      shortage_qty: number;
      uom: string;
    }> = [];
    const autoPrsCreatedDetail: Array<{
      pr_id: string;
      item_name: string;
      deficit_qty: number;
      uom: string;
    }> = [];

    // 1. Update Project, Process Parameters, Hard Stock Reservations & Auto-PR Shortage Sync in Atomic Transaction
    db.transaction(() => {
      db.prepare(`
        UPDATE projects
        SET start_date = ?,
            lot_size = ?,
            factory_factor = ?,
            shift_hours = ?,
            planned_completion_date = ?,
            planned_total_hours = ?,
            is_master_set = 1,
            master_set_at = CURRENT_TIMESTAMP,
            committed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        effectiveStartDate,
        effectiveLotSize,
        effectiveFf,
        effectiveShiftHours,
        planned_completion_date || null,
        Number(planned_total_hours) || 0,
        id
      );

      if (Array.isArray(process_configs)) {
        const updateStepStmt = db.prepare(`
          UPDATE bill_of_processes
          SET station_id = COALESCE(?, station_id),
              assigned_machine_id = ?,
              assigned_machine_ids_json = ?,
              machine_id = ?,
              machine_efficiency_multiplier = COALESCE(?, machine_efficiency_multiplier, 1.0),
              eligible_operators_json = COALESCE(?, eligible_operators_json, '[]'),
              cycle_time_minutes = COALESCE(?, cycle_time_minutes),
              manpower_count = COALESCE(?, manpower_count),
              standard_hours = COALESCE(?, standard_hours),
              transfer_mode = COALESCE(?, transfer_mode),
              qc_parameters_json = COALESCE(?, qc_parameters_json)
          WHERE id = ? AND project_id = ?
        `);
        for (const cfg of process_configs) {
          if (!cfg.id) continue;
          const qcParamsArr = Array.isArray(cfg.qc_parameters) ? cfg.qc_parameters : null;
          const qcSumCt =
            qcParamsArr && qcParamsArr.length > 0
              ? qcParamsArr.reduce(
                  (acc: number, p: any) => acc + Math.max(0.5, Number(p?.cycle_time_minutes) || 5),
                  0
                )
              : null;
          const ct = qcSumCt !== null ? Number(qcSumCt.toFixed(1)) : Number(cfg.cycle_time_minutes) || 15;
          const assignedIds: string[] = Array.isArray(cfg.assigned_machine_ids)
            ? cfg.assigned_machine_ids.filter(Boolean)
            : cfg.assigned_machine_id
            ? [String(cfg.assigned_machine_id)]
            : [];
          const machineCount = assignedIds.length;
          const speedFactor =
            machineCount > 1
              ? Math.max(1.0, Number(cfg.machine_efficiency_multiplier) || 1.5)
              : 1.0;
          const compoundDivisor =
            machineCount > 1 ? Math.pow(speedFactor, machineCount - 1) : 1.0;
          const effectiveCt = ct / (compoundDivisor * (effectiveFf / 100));
          const stdHrs = Number(((effectiveCt * (Number(project.qty) || 1)) / 60).toFixed(2));
          const eligOpsJson = Array.isArray(cfg.eligible_operators)
            ? JSON.stringify(cfg.eligible_operators)
            : typeof cfg.eligible_operators_json === "string"
            ? cfg.eligible_operators_json
            : "[]";
          const primaryMachineId = assignedIds[0] || null;
          const qcParamsJsonStr = qcParamsArr ? JSON.stringify(qcParamsArr) : null;
          updateStepStmt.run(
            cfg.station_id || null,
            primaryMachineId,
            JSON.stringify(assignedIds),
            primaryMachineId,
            speedFactor,
            eligOpsJson,
            ct,
            Math.max(1, machineCount || Number(cfg.manpower_count) || 1),
            stdHrs,
            cfg.transfer_mode || null,
            qcParamsJsonStr,
            cfg.id,
            id
          );
        }
      }

      // 1B. Hard Stock Reservation & Auto-Sync BOM Shortages to Procurement PR
      const bomItems = db.prepare(`
        SELECT b.id as bom_id, b.item_id, b.required_qty, b.dimension, b.spec,
               i.item_code, i.name as item_name, i.uom, i.unit_price
        FROM boms b
        JOIN items i ON b.item_id = i.id
        WHERE b.project_id = ?
      `).all(id) as any[];

      const shortageToProcure: Array<{
        item_id: string;
        item_code: string;
        item_name: string;
        dimension: string | null;
        spec: string | null;
        qty: number;
      }> = [];

      for (const bom of bomItems) {
        const reqQty = Math.max(0, Number(bom.required_qty) || 0);
        if (reqQty <= 0) continue;

        const existingRes = db.prepare(`
          SELECT COALESCE(SUM(qty), 0) as total
          FROM inventory_reservations
          WHERE project_id = ? AND item_id = ? AND status IN ('ACTIVE', 'CONSUMED')
        `).get(id, bom.item_id) as any;
        const alreadyReserved = Number(existingRes?.total || 0);

        const neededToReserve = Math.max(0, reqQty - alreadyReserved);
        let newlyReserved = 0;

        if (neededToReserve > 0) {
          const invRow = db.prepare(`
            SELECT COALESCE(free_stock, available_qty, 0) as free_stock
            FROM inventory WHERE item_id = ?
          `).get(bom.item_id) as any;
          const availFree = Math.max(0, Number(invRow?.free_stock || 0));

          if (availFree > 0) {
            newlyReserved = Math.min(availFree, neededToReserve);
            db.prepare(`
              UPDATE inventory
              SET free_stock = MAX(0, COALESCE(free_stock, 0) - ?),
                  available_qty = MAX(0, COALESCE(available_qty, 0) - ?),
                  allocated_stock = COALESCE(allocated_stock, 0) + ?,
                  reserved_qty = COALESCE(reserved_qty, 0) + ?
              WHERE item_id = ?
            `).run(newlyReserved, newlyReserved, newlyReserved, newlyReserved, bom.item_id);

            db.prepare(`
              INSERT INTO inventory_reservations (id, item_id, project_id, spk_id, qty, status)
              VALUES (?, ?, ?, ?, ?, 'ACTIVE')
            `).run(
              `RES-PLAN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
              bom.item_id,
              id,
              project.spk_number || id,
              newlyReserved
            );

            db.prepare(`
              INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by, reference_id)
              VALUES (?, ?, ?, 'ALLOCATION', ?, ?, ?)
            `).run(
              `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
              bom.item_id,
              id,
              newlyReserved,
              actor,
              `COMMIT_PLAN_${id}`
            );
            reservedItemsCount += 1;
          }
        } else {
          reservedItemsCount += 1;
        }

        // Check if there is still a deficit after existing + newly reserved stock and existing open PRs
        const existingPrRow = db.prepare(`
          SELECT COALESCE(SUM(pri.qty), 0) as total
          FROM pr_items pri
          JOIN purchase_requests pr ON pri.pr_id = pr.id
          WHERE pr.project_id = ? AND pri.item_id = ? AND pr.status NOT IN ('CANCELLED', 'REJECTED')
        `).get(id, bom.item_id) as any;
        const alreadyInPr = Number(existingPrRow?.total || 0);

        const netDeficit = Math.max(0, reqQty - (alreadyReserved + newlyReserved + alreadyInPr));
        reservedItemsDetail.push({
          item_name: bom.item_name || bom.item_code || "Material",
          required_qty: reqQty,
          reserved_qty: alreadyReserved + newlyReserved,
          shortage_qty: netDeficit,
          uom: bom.uom || "PCS",
        });
        if (netDeficit > 0) {
          shortageToProcure.push({
            item_id: bom.item_id,
            item_code: bom.item_code,
            item_name: bom.item_name,
            dimension: bom.dimension || null,
            spec: bom.spec || null,
            qty: netDeficit,
          });
        }
      }

      if (shortageToProcure.length > 0) {
        shortageItemsCount = shortageToProcure.length;
        const prCountRow = db.prepare("SELECT COUNT(*) as count FROM purchase_requests").get() as any;
        const prSeq = String((prCountRow?.count || 0) + 1).padStart(4, "0");
        autoGeneratedPrNumber = `PR-${new Date().getFullYear()}-${prSeq}-${Math.floor(10 + Math.random() * 89)}`;
        autoGeneratedPrId = crypto.randomUUID();
        const prNotes = `Auto-synced BOM Shortage on Production Plan Commit for [${project.spk_number || id}] ${project.name} (${shortageToProcure.length} item deficit)`;

        db.prepare(`
          INSERT INTO purchase_requests (
            id, pr_number, project_id, spk_id, request_date, status, requested_by, notes, remarks, urgency, category
          ) VALUES (?, ?, ?, ?, CURRENT_DATE, 'PENDING', ?, ?, ?, ?, 'BOM_SHORTAGE')
        `).run(
          autoGeneratedPrId,
          autoGeneratedPrNumber,
          id,
          project.spk_number || id,
          actor,
          prNotes,
          prNotes,
          project.urgency === "CRITICAL" || project.urgency === "HIGH" ? "CRITICAL" : "URGENT"
        );

        const insertPrItemStmt = db.prepare(`
          INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, expected_delivery_date)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const sh of shortageToProcure) {
          insertPrItemStmt.run(
            crypto.randomUUID(),
            autoGeneratedPrId,
            sh.item_id,
            sh.dimension,
            sh.spec || `BOM Shortage for ${project.name}`,
            sh.qty,
            effectiveStartDate
          );
          autoPrsCreatedDetail.push({
            pr_id: autoGeneratedPrNumber || autoGeneratedPrId,
            item_name: sh.item_name || sh.item_code,
            deficit_qty: sh.qty,
            uom: "PCS",
          });
        }
      }
    })();

    // 2. Generate or Refresh WOT Tickets with Signed QR Codes for Shop Floor Execution
    const targetQty = Math.max(1, Number(project.qty) || 10);
    const numLots = Math.max(1, Math.ceil(targetQty / effectiveLotSize));
    const spkClean = (project.spk_number || project.id).replace(/[^a-zA-Z0-9-]/g, "");

    const firstStep = db.prepare(`
      SELECT * FROM bill_of_processes
      WHERE project_id = ? AND (node_type IS NULL OR UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END'))
      ORDER BY step_sequence ASC LIMIT 1
    `).get(id) as any;

    const existingWots = db.prepare(`
      SELECT * FROM work_order_tickets WHERE project_id = ? ORDER BY created_at ASC
    `).all(id) as any[];

    const generatedWots: any[] = [];
    const hasStartedWots = existingWots.some((w: any) => w.status === "IN_PROGRESS" || w.status === "COMPLETED");

    const firstProjectStation = db.prepare(`
      SELECT id, station_code FROM project_stations
      WHERE project_id = ? OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
      ORDER BY station_sequence ASC, station_code ASC LIMIT 1
    `).get(id, id) as any;
    const defaultFirstStationId = firstStep?.station_id || firstProjectStation?.id || null;

    if (!hasStartedWots) {
      db.prepare(`DELETE FROM work_order_tickets WHERE project_id = ?`).run(id);

      for (let i = 0; i < numLots; i++) {
        const isLast = i === numLots - 1;
        const wotQty = isLast ? targetQty - i * effectiveLotSize : effectiveLotSize;
        const seqStr = String(i + 1).padStart(3, "0");
        const wotNumber = `WOT-${spkClean}-${seqStr}`;
        const wotId = `wot_${id}_${seqStr}_${Date.now().toString(36)}`;

        const qrInfo = await generateSignedWotQr({
          id: wotId,
          wot_number: wotNumber,
          project_id: id,
          bop_id: firstStep?.id || "BOP-START",
          station_id: defaultFirstStationId || "UNASSIGNED",
          machine_id: firstStep?.assigned_machine_id || undefined,
          qty: wotQty,
        });

        db.prepare(`
          INSERT INTO work_order_tickets (
            id, wot_number, lot_number, project_id, bop_id, current_bop_id, station_id, machine_id,
            qty, good_units, reject_units, rework_units, status, qr_code_string, qr_signature, qr_code_data_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'PENDING', ?, ?, ?)
        `).run(
          wotId,
          wotNumber,
          wotNumber,
          id,
          firstStep?.id || null,
          null,
          defaultFirstStationId,
          firstStep?.assigned_machine_id || null,
          wotQty,
          qrInfo.qrString,
          qrInfo.signature,
          qrInfo.qrDataUrl
        );

        generatedWots.push({
          id: wotId,
          wot_number: wotNumber,
          lot_number: wotNumber,
          project_id: id,
          bop_id: firstStep?.id || null,
          process_name: firstStep?.process_name || "Initial Process",
          station_id: defaultFirstStationId,
          machine_id: firstStep?.assigned_machine_id || null,
          qty: wotQty,
          target_qty: wotQty,
          status: "PENDING",
          qr_code_string: qrInfo.qrString,
          qr_code_data_url: qrInfo.qrDataUrl,
        });
      }
    } else {
      generatedWots.push(...existingWots);
    }

    // 3. Auto-Sync any PLANNED waves on active Procurement Plan to the newly committed Master Schedule horizon
    const procurementWaveSync = syncProjectPlannedWavesWithMasterDates(id, actor);

    invalidatePlanningCache();
    emitProductionUpdate("PLAN_COMMITTED", {
      project_id: id,
      start_date: effectiveStartDate,
      wots_count: generatedWots.length,
      auto_pr_number: autoGeneratedPrNumber,
      procurement_wave_sync: procurementWaveSync,
    });

    const prNote = autoGeneratedPrNumber
      ? ` Auto-synced ${shortageItemsCount} shortage item(s) to Procurement [${autoGeneratedPrNumber}].`
      : reservedItemsCount > 0
      ? ` ${reservedItemsCount} BOM material(s) hard-reserved in Warehouse.`
      : "";
    const waveNote =
      procurementWaveSync && Number(procurementWaveSync.synced_waves_count || 0) > 0
        ? ` Auto-aligned ${procurementWaveSync.synced_waves_count} PLANNED wave(s) in [${procurementWaveSync.plan_code}].`
        : "";

    res.json({
      ok: true,
      message: `Production plan committed (${generatedWots.length} WOT QR tag(s)).${prNote}${waveNote}`,
      wots: generatedWots,
      start_date: effectiveStartDate,
      planned_completion_date,
      reserved_items: reservedItemsDetail,
      auto_prs_created: autoPrsCreatedDetail,
      procurement_wave_sync: procurementWaveSync,
      material_sync: {
        reserved_items_count: reservedItemsCount,
        shortage_items_count: shortageItemsCount,
        generated_pr_id: autoGeneratedPrId,
        generated_pr_number: autoGeneratedPrNumber,
      },
    });
  } catch (err: any) {
    console.error("Error committing production plan:", err);
    res.status(500).json({ error: err.message || "Failed to commit production plan" });
  }
});


// Tactical Control 1: Machine Reroute & Failover Switch
oeeRouter.post("/api/production/control/machine-reroute", (req, res) => {
  try {
    const { project_id, bop_id, new_machine_id, resolve_active_ndp, notes } = req.body;
    if (!bop_id) return res.status(400).json({ error: "bop_id is required" });

    const machine = new_machine_id
      ? (db.prepare(`SELECT * FROM items WHERE id = ?`).get(new_machine_id) as any)
      : null;

    db.transaction(() => {
      db.prepare(`
        UPDATE bill_of_processes
        SET assigned_machine_id = ?,
            machine_id = ?,
            status = CASE WHEN status = 'PAUSED' THEN 'RUNNING' ELSE status END
        WHERE id = ?
      `).run(new_machine_id || null, new_machine_id || null, bop_id);

      if (resolve_active_ndp) {
        db.prepare(`
          UPDATE notice_to_down_processes
          SET status = 'RESOLVED',
              resumed_at = CURRENT_TIMESTAMP,
              resolution_notes = ?
          WHERE bop_id = ? AND status = 'ACTIVE'
        `).run(
          notes || `Failover rerouted to machine ${machine?.item_code || new_machine_id || "Manual Workstation"}`,
          bop_id
        );
      }
    })();

    invalidatePlanningCache();
    emitProductionUpdate("MACHINE_REROUTED", { project_id, bop_id, new_machine_id });
    res.json({
      ok: true,
      message: `Process rerouted to ${machine ? `[${machine.item_code}] ${machine.name}` : "Backup Workstation"} successfully.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Tactical Control 2: Lot Split & Partial Transfer (Split WOT)
oeeRouter.post("/api/production/control/split-wot", async (req, res) => {
  try {
    const { wot_id, split_qty, target_bop_id, operator_name } = req.body;
    const parentWot = db.prepare(`SELECT * FROM work_order_tickets WHERE id = ?`).get(wot_id) as any;
    if (!parentWot) return res.status(404).json({ error: "Parent WOT not found" });

    const splitAmount = Number(split_qty);
    const currentQty = Number(parentWot.qty) || 0;
    if (!splitAmount || splitAmount <= 0 || splitAmount >= currentQty) {
      return res.status(400).json({
        error: `Split quantity must be between 1 and ${Math.max(1, currentQty - 1)}.`,
      });
    }

    const remainingQty = currentQty - splitAmount;
    const childSeq = (Number(parentWot.split_sequence) || 0) + 1;
    const childWotNumber = `${parentWot.wot_number}-S${childSeq}`;
    const childWotId = `wot_split_${Date.now().toString(36)}`;

    const qrInfo = await generateSignedWotQr({
      id: childWotId,
      wot_number: childWotNumber,
      project_id: parentWot.project_id,
      bop_id: target_bop_id || parentWot.current_bop_id || parentWot.bop_id || "BOP",
      station_id: parentWot.station_id || "STN-01",
      qty: splitAmount,
    });

    db.transaction(() => {
      db.prepare(`
        UPDATE work_order_tickets
        SET qty = ?, split_sequence = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(remainingQty, childSeq, parentWot.id);

      db.prepare(`
        INSERT INTO work_order_tickets (
          id, wot_number, lot_number, project_id, bop_id, current_bop_id, station_id, machine_id,
          qty, good_units, reject_units, rework_units, status, parent_wot_id, split_sequence,
          qr_code_string, qr_signature, qr_code_data_url, last_scanned_by, last_scanned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'IN_PROGRESS', ?, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        childWotId,
        childWotNumber,
        childWotNumber,
        parentWot.project_id,
        target_bop_id || parentWot.bop_id,
        target_bop_id || parentWot.current_bop_id,
        parentWot.station_id,
        parentWot.machine_id,
        splitAmount,
        splitAmount,
        parentWot.id,
        qrInfo.qrString,
        qrInfo.signature,
        qrInfo.qrDataUrl,
        operator_name || getActor(req) || "Supervisor"
      );

      if (target_bop_id) {
        db.prepare(`
          UPDATE bill_of_processes
          SET status = 'RUNNING', actual_start_date = COALESCE(actual_start_date, CURRENT_TIMESTAMP)
          WHERE id = ?
        `).run(target_bop_id);
      }
    })();

    emitProductionUpdate("WOT_SPLIT", {
      project_id: parentWot.project_id,
      parent_wot_id: parentWot.id,
      child_wot_id: childWotId,
      child_wot_number: childWotNumber,
      split_qty: splitAmount,
    });

    res.json({
      ok: true,
      child_wot: {
        id: childWotId,
        wot_number: childWotNumber,
        qty: splitAmount,
        qr_code_data_url: qrInfo.qrDataUrl,
        qr_code_string: qrInfo.qrString,
      },
      message: `Split ${splitAmount} units into ${childWotNumber} (${remainingQty} units remain on ${parentWot.wot_number}).`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Tactical Control 4: Inline Overtime & Shift Boost Injection
oeeRouter.post("/api/production/control/shift-boost", (req, res) => {
  try {
    const { project_id, bop_id, extra_hours, boost_date, reason, authorized_by } = req.body;
    if (!project_id) return res.status(400).json({ error: "project_id is required" });

    const hours = Math.max(1, Math.min(16, Number(extra_hours) || 2));
    const dateStr = boost_date || new Date().toISOString().slice(0, 10);

    db.transaction(() => {
      if (bop_id) {
        db.prepare(`
          UPDATE bill_of_processes
          SET overtime_hours = COALESCE(overtime_hours, 0) + ?
          WHERE id = ?
        `).run(hours, bop_id);
      }

      db.prepare(`
        UPDATE projects
        SET shift_hours = MIN(24, COALESCE(shift_hours, 8) + ?)
        WHERE id = ?
      `).run(hours, project_id);

      try {
        db.prepare(`
          INSERT INTO project_overtime_schedules (
            id, project_id, station_id, date, overtime_hours, reason, status, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', ?)
        `).run(
          `OT-${Date.now()}`,
          project_id,
          bop_id || "ALL",
          dateStr,
          hours,
          reason || "Shop Floor Bottleneck Recovery Boost",
          authorized_by || getActor(req) || "Production Lead"
        );
      } catch (e) {}
    })();

    invalidatePlanningCache();
    emitProductionUpdate("SHIFT_BOOST_INJECTED", { project_id, bop_id, extra_hours: hours });
    res.json({
      ok: true,
      message: `+${hours}h Overtime / Shift Boost injected successfully.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Shop Floor Communication Hub Endpoints
oeeRouter.get("/api/production/projects/:id/communications", (req, res) => {
  try {
    const { id } = req.params;
    const threads = db.prepare(`
      SELECT * FROM production_process_threads
      WHERE project_id = ?
      ORDER BY is_pinned DESC, created_at DESC
      LIMIT 100
    `).all(id);

    const handovers = db.prepare(`
      SELECT * FROM production_shift_handovers
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 30
    `).all(id);

    const floorRequests = db.prepare(`
      SELECT * FROM floor_requests
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(id);

    res.json({
      ok: true,
      threads,
      handovers,
      floor_requests: floorRequests,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

oeeRouter.post("/api/production/projects/:id/threads", (req, res) => {
  try {
    const { id } = req.params;
    const { bop_id, process_name, wot_id, wot_number, author, role, message, is_pinned } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    const threadId = `TH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const sender = author || getActor(req) || "Production User";

    db.prepare(`
      INSERT INTO production_process_threads (
        id, project_id, bop_id, process_name, wot_id, wot_number, author, role, message, is_pinned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      threadId,
      id,
      bop_id || null,
      process_name || "General Floor",
      wot_id || null,
      wot_number || null,
      sender,
      role || "PRODUCTION",
      String(message).trim(),
      is_pinned ? 1 : 0
    );

    const created = db.prepare(`SELECT * FROM production_process_threads WHERE id = ?`).get(threadId);
    emitProductionUpdate("NEW_PROCESS_THREAD", { project_id: id, thread: created });
    res.json({ ok: true, thread: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

oeeRouter.put("/api/production/threads/:threadId/pin", (req, res) => {
  try {
    const { threadId } = req.params;
    const existing = db.prepare(`SELECT * FROM production_process_threads WHERE id = ?`).get(threadId) as any;
    if (!existing) return res.status(404).json({ error: "Thread message not found" });

    const nextPin = existing.is_pinned ? 0 : 1;
    db.prepare(`UPDATE production_process_threads SET is_pinned = ? WHERE id = ?`).run(nextPin, threadId);
    emitProductionUpdate("THREAD_PIN_UPDATED", { project_id: existing.project_id, threadId, is_pinned: nextPin });
    res.json({ ok: true, is_pinned: nextPin });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

oeeRouter.post("/api/production/projects/:id/shift-handover", (req, res) => {
  try {
    const { id } = req.params;
    const { shift, outgoing_lead, incoming_lead, summary, pinned_alerts } = req.body;
    if (!summary || !String(summary).trim()) {
      return res.status(400).json({ error: "Handover summary is required" });
    }

    const handoverId = `SH-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const sender = outgoing_lead || getActor(req) || "Shift Supervisor";

    db.prepare(`
      INSERT INTO production_shift_handovers (
        id, project_id, shift, outgoing_lead, incoming_lead, summary, pinned_alerts, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run(
      handoverId,
      id,
      shift || "SHIFT_1",
      sender,
      incoming_lead || "Next Shift Lead",
      String(summary).trim(),
      pinned_alerts || null
    );

    const created = db.prepare(`SELECT * FROM production_shift_handovers WHERE id = ?`).get(handoverId);
    emitProductionUpdate("NEW_SHIFT_HANDOVER", { project_id: id, handover: created });
    res.json({ ok: true, handover: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cross-Project Schedule & Resource Contention Matrix for Setup & Master
oeeRouter.get("/api/production/cross-project-schedule", (req, res) => {
  try {
    const excludeProjectId = String(req.query.exclude_project_id || "");
    const activeProjects = db.prepare(`
      SELECT p.*
      FROM projects p
      WHERE p.status NOT IN ('COMPLETED', 'CANCELLED', 'FINISHED', 'CLOSED', 'PENDING_NTP', 'INTERNAL_OVERHEAD')
        AND p.id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
        AND UPPER(COALESCE(p.name, '')) NOT LIKE '%CONSUMABLE%'
        AND UPPER(COALESCE(p.name, '')) NOT LIKE '%TRANSPORTATION%'
        AND UPPER(COALESCE(p.name, '')) NOT LIKE '%OTHER PROCUREMENT%'
        AND UPPER(COALESCE(p.name, '')) NOT LIKE '%OTHERS PROCUREMENT%'
        AND UPPER(COALESCE(p.name, '')) NOT LIKE '%GENERAL PROCUREMENT%'
        AND p.deleted_at IS NULL AND p.archived_at IS NULL
      ORDER BY COALESCE(p.start_date, p.created_at) ASC
    `).all() as any[];

    const allSteps = db.prepare(`
      SELECT b.*, i.item_code as machine_code, i.name as machine_name,
             COALESCE(ps.station_name, s.station_name) as station_name,
             COALESCE(ps.station_code, s.station_code) as station_code
      FROM bill_of_processes b
      LEFT JOIN items i ON (b.assigned_machine_id = i.id OR b.machine_id = i.id)
      LEFT JOIN project_stations ps ON b.station_id = ps.id
      LEFT JOIN stations s ON b.station_id = s.id
      WHERE b.node_type IS NULL OR UPPER(b.node_type) NOT IN ('PRODUCT', 'START', 'END')
      ORDER BY b.step_sequence ASC
    `).all() as any[];

    const activeNdps = db.prepare(`
      SELECT * FROM notice_to_down_processes WHERE status = 'ACTIVE'
    `).all() as any[];

    const projectSchedules = activeProjects.map((proj: any) => {
      const steps = allSteps.filter((s: any) => s.project_id === proj.id);
      const completedSteps = steps.filter((s: any) => s.status === "COMPLETED").length;
      const runningSteps = steps.filter((s: any) => s.status === "RUNNING");
      const progressPct = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;

      const qty = Math.max(1, Number(proj.qty) || 10);
      const ff = Math.max(20, Number(proj.factory_factor) || 85) / 100;
      const shiftHrs = Math.max(1, Number(proj.shift_hours) || 8);

      const totalHours = steps.reduce((sum: number, st: any) => {
        const ct = Number(st.cycle_time_minutes) || 20;
        const mp = Math.max(1, Number(st.manpower_count) || 1);
        return sum + (ct * qty) / (mp * ff * 60);
      }, 0);

      const estDays = Math.max(1, Math.ceil(totalHours / shiftHrs));
      const startDate = proj.start_date || new Date(proj.created_at || Date.now()).toISOString().slice(0, 10);
      const estEndDateObj = new Date(startDate);
      estEndDateObj.setDate(estEndDateObj.getDate() + estDays);
      const estEndDate = proj.planned_completion_date || estEndDateObj.toISOString().slice(0, 10);

      const assignedMachines = Array.from(
        new Set(
          steps
            .map((s: any) => s.assigned_machine_id || s.machine_id)
            .filter(Boolean)
        )
      );

      const assignedStations = Array.from(
        new Set(
          steps
            .map((s: any) => s.station_id)
            .filter(Boolean)
        )
      );

      const projNdps = activeNdps.filter((n: any) => n.project_id === proj.id);

      return {
        id: proj.id,
        name: proj.name,
        spk_number: proj.spk_number || proj.id,
        customer: proj.customer || "Internal",
        status: proj.status,
        urgency: proj.urgency || "NORMAL",
        qty,
        uom: proj.uom || "UNIT",
        lot_size: Number(proj.lot_size) || 10,
        factory_factor: Number(proj.factory_factor) || 85,
        start_date: startDate,
        estimated_end_date: estEndDate,
        due_date: proj.due_date || proj.end_date || estEndDate,
        total_hours: Number(totalHours.toFixed(1)),
        estimated_days: estDays,
        progress_pct: progressPct,
        total_steps: steps.length,
        completed_steps: completedSteps,
        running_steps: runningSteps.map((r: any) => ({
          id: r.id,
          process_name: r.process_name,
          station_id: r.station_id,
          machine_id: r.assigned_machine_id || r.machine_id,
          machine_code: r.machine_code,
        })),
        assigned_machines: assignedMachines,
        assigned_stations: assignedStations,
        active_ndps_count: projNdps.length,
        is_current_project: proj.id === excludeProjectId,
        steps: steps.map((s: any) => ({
          id: s.id,
          process_name: s.process_name,
          step_sequence: s.step_sequence,
          status: s.status,
          station_id: s.station_id,
          station_name: s.station_name || s.station_id,
          machine_id: s.assigned_machine_id || s.machine_id,
          machine_code: s.machine_code,
          machine_name: s.machine_name,
          cycle_time_minutes: Number(s.cycle_time_minutes) || 20,
        })),
      };
    });

    res.json({
      ok: true,
      projects: projectSchedules,
      concurrent_projects: projectSchedules.filter((p: any) => !p.is_current_project),
    });
  } catch (err: any) {
    console.error("Error in cross-project-schedule:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// WOT-CENTRIC STATION AUTO-ORCHESTRATION & DUAL WIP FLOW ENGINE (Rules 11.1 & 11.2)
// ============================================================================

