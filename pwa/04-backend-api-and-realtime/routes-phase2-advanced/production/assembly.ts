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

import { emitProductionUpdate, invalidatePlanningCache } from "./utils.ts";

import { evaluateProjectScmSupplyGate } from "./cutting.ts";

export const assemblyRouter = Router();

assemblyRouter.get("/api/production/stations/list", (req, res) => {
      try {
        const stations = db.prepare(`
          SELECT s.*, p.name as project_name, p.spk_number
          FROM project_stations s
          LEFT JOIN projects p ON s.project_id = p.id
          ORDER BY s.station_sequence ASC, s.station_name ASC
        `).all();
        res.json({ ok: true, data: stations });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.get("/api/production/stations/:stationId/preflight", (req, res) => {
      try {
        const { stationId } = req.params;
        const station = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any
          || db.prepare("SELECT * FROM stations WHERE id = ?").get(stationId) as any;

        if (!station) {
          return res.status(404).json({ error: "Station not found" });
        }

        const projectId = station.project_id;

        // 1. Manpower check
        const manpowerCount = db.prepare(`
          SELECT COUNT(*) as count FROM production_manpower_assignments 
          WHERE (station_id = ? OR (project_id = ? AND status = 'ACTIVE'))
        `).get(stationId, projectId) as any;

        const hasManpower = (manpowerCount?.count || 0) > 0;

        // 2. Active NDP check for this station or assigned machine
        const activeNdps = db.prepare(`
          SELECT n.* FROM notice_to_down_processes n
          LEFT JOIN bill_of_processes b ON (n.bop_id = b.id OR n.affected_machine_id = b.assigned_machine_id)
          WHERE (b.station_id = ? OR n.bop_id = ?) AND n.status = 'ACTIVE'
        `).all(stationId, stationId) as any[];

        const noActiveNdp = activeNdps.length === 0;

        // 3. Queued WOTs
        const queuedWots = db.prepare(`
          SELECT COUNT(*) as count FROM work_order_tickets 
          WHERE (current_station_id = ? OR target_station_id = ? OR project_id = ?) 
          AND status IN ('QUEUED', 'IN_PROGRESS', 'RUNNING', 'TRANSFERRED', 'PLANNED')
        `).get(stationId, stationId, projectId) as any;

        const queuedWotCount = queuedWots?.count || 0;

        // 4. Material ready check
        const pendingMatReq = db.prepare(`
          SELECT COUNT(*) as count FROM floor_requests
          WHERE project_id = ? AND status IN ('PENDING', 'IN_PROGRESS')
        `).get(projectId) as any;

        const isMaterialReady = (pendingMatReq?.count || 0) === 0;

        // 5. Upstream sequence check
        const allStations = db.prepare(`
          SELECT id, station_sequence FROM project_stations 
          WHERE project_id = ? ORDER BY station_sequence ASC
        `).all(projectId) as any[];

        const currIdx = allStations.findIndex((s: any) => s.id === stationId);
        let previousStationOk = true;
        if (currIdx > 0) {
          const prevStation = allStations[currIdx - 1];
          const prevWotCount = db.prepare(`
            SELECT COUNT(*) as count FROM wot_history 
            WHERE station_id = ?
          `).get(prevStation.id) as any;
          previousStationOk = (prevWotCount?.count || 0) > 0 || queuedWotCount > 0;
        }

        const ready = hasManpower && noActiveNdp && (queuedWotCount > 0 || isMaterialReady);

        res.json({
          ok: true,
          ready,
          station,
          checklist: {
            hasManpower,
            isMaterialReady,
            noActiveNdp,
            previousStationOk
          },
          details: {
            activeManpowerCount: manpowerCount?.count || 0,
            queuedWotCount,
            activeNdpCount: activeNdps.length
          }
        });
      } catch (err: any) {
        console.error("Preflight error:", err);
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.post("/api/production/stations/:stationId/start-production", (req, res) => {
      try {
        const { stationId } = req.params;
        const station = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any
          || db.prepare("SELECT * FROM stations WHERE id = ?").get(stationId) as any;

        if (!station) return res.status(404).json({ error: "Station not found" });

        // Unqueue or start first WOT
        const eligibleWot = db.prepare(`
          SELECT * FROM work_order_tickets 
          WHERE (current_station_id = ? OR target_station_id = ? OR (project_id = ? AND current_station_id IS NULL))
          AND status IN ('QUEUED', 'TRANSFERRED', 'PLANNED')
          ORDER BY lot_number ASC LIMIT 1
        `).get(stationId, stationId, station.project_id) as any;

        if (eligibleWot) {
          db.prepare(`
            UPDATE work_order_tickets 
            SET status = 'IN_PROGRESS', current_station_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(stationId, eligibleWot.id);
        }

        emitProductionUpdate("STATION_STARTED", { stationId, wotId: eligibleWot?.id });

        res.json({
          ok: true,
          success: true,
          message: `Station ${station.name || station.station_name || stationId} started successfully`,
          wot_id: eligibleWot?.id || null
        });
      } catch (err: any) {
        console.error("Start production error:", err);
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.post("/api/production/stations/:stationId/start", (req, res) => {
      try {
        const { stationId } = req.params;
        
        // 1. Check for blocking NDPs
        const activeNdps = db.prepare(`
          SELECT id FROM notice_to_down_processes 
          WHERE bop_id = ? AND status = 'ACTIVE' AND reason_category IN ('MATERIAL_SHORTAGE', 'MACHINE_BREAKDOWN')
        `).all(stationId);
        
        if (activeNdps.length > 0) {
          return res.status(400).json({ error: "Station is blocked by an active NDP." });
        }

        // 2. Find the next eligible WOT in queue
        // A WOT is eligible if it's currently at this station and is QUEUED, TRANSFERRED, or PLANNED (if first station)
        const eligibleWot = db.prepare(`
          SELECT * FROM work_order_tickets 
          WHERE (current_station_id = ? OR target_station_id = ?) 
          AND status IN ('QUEUED', 'TRANSFERRED', 'PLANNED')
          ORDER BY lot_number ASC LIMIT 1
        `).get(stationId, stationId) as any;

        if (!eligibleWot) {
          return res.status(404).json({ error: "No WOT in queue for this station." });
        }

        db.prepare(`
          UPDATE work_order_tickets 
          SET status = 'RUNNING', current_station_id = ?, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(stationId, eligibleWot.id);

        res.json({ success: true, message: "Station started processing WOT", wot_id: eligibleWot.id });
      } catch (err: any) {
        console.error("WOT Start Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Human Control: Pause Station Processing
    assemblyRouter.post("/api/production/stations/:stationId/pause", (req, res) => {
      try {
        const { stationId } = req.params;
        const { reason } = req.body;

        const updated = db.prepare(`
          UPDATE work_order_tickets
          SET status = 'PAUSED', updated_at = CURRENT_TIMESTAMP
          WHERE (current_station_id = ? OR target_station_id = ?) AND status IN ('RUNNING', 'IN_PROGRESS')
        `).run(stationId, stationId);

        emitProductionUpdate("STATION_PAUSED", { stationId, reason });

        res.json({
          ok: true,
          success: true,
          message: `Station execution paused (${updated.changes} active WOTs paused)`,
          pausedCount: updated.changes
        });
      } catch (err: any) {
        console.error("Station Pause Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Human Control: Resume / Continue Station Processing
    assemblyRouter.post("/api/production/stations/:stationId/resume", (req, res) => {
      try {
        const { stationId } = req.params;

        // Check if blocked by active NDPs
        const activeNdps = db.prepare(`
          SELECT id FROM notice_to_down_processes 
          WHERE bop_id = ? AND status = 'ACTIVE' AND reason_category IN ('MATERIAL_SHORTAGE', 'MACHINE_BREAKDOWN')
        `).all(stationId);

        if (activeNdps.length > 0) {
          return res.status(400).json({ error: "Cannot resume: Station is blocked by active NDP. Resolve NDP first." });
        }

        const updated = db.prepare(`
          UPDATE work_order_tickets
          SET status = 'RUNNING', updated_at = CURRENT_TIMESTAMP
          WHERE (current_station_id = ? OR target_station_id = ?) AND status = 'PAUSED'
        `).run(stationId, stationId);

        emitProductionUpdate("STATION_RESUMED", { stationId });

        res.json({
          ok: true,
          success: true,
          message: `Station execution continued (${updated.changes} WOTs resumed)`,
          resumedCount: updated.changes
        });
      } catch (err: any) {
        console.error("Station Resume Error:", err);
        res.status(500).json({ error: err.message });
      }
    });


assemblyRouter.post("/api/production/wot/:id/complete", (req, res) => {
      try {
        const { id } = req.params;
        const wot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(id) as any;
        if (!wot) return res.status(404).json({ error: "WOT not found" });

        // Find current station sequence
        const currentStation = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(wot.current_station_id) as any;
        if (!currentStation) return res.status(400).json({ error: "WOT has no valid current station" });

        // Find next station in sequence
        const nextStation = db.prepare(`
          SELECT * FROM project_stations 
          WHERE project_id = ? AND station_sequence > ? 
          ORDER BY station_sequence ASC LIMIT 1
        `).get(wot.project_id, currentStation.station_sequence) as any;

        if (nextStation) {
          // Transfer to next station
          db.prepare(`
            UPDATE work_order_tickets 
            SET status = 'TRANSFERRED', target_station_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(nextStation.id, id);
        } else {
          // Last station, mark completed
          db.prepare(`
            UPDATE work_order_tickets 
            SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(id);
        }

        res.json({ success: true, message: "WOT completed and transferred" });
      } catch (err: any) {
        console.error("WOT Complete Error:", err);
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.post("/api/production/stations/:stationId/transfer-ready-wot", (req, res) => {
      try {
        const { stationId } = req.params;
        const currentStation = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any;
        if (!currentStation) return res.status(404).json({ error: "Station not found" });

        const nextStation = db.prepare(`
          SELECT * FROM project_stations 
          WHERE project_id = ? AND station_sequence > ? 
          ORDER BY station_sequence ASC LIMIT 1
        `).get(currentStation.project_id, currentStation.station_sequence) as any;

        // Find running or queued WOT at this station
        const readyWot = db.prepare(`
          SELECT * FROM work_order_tickets 
          WHERE project_id = ? AND (current_station_id = ? OR (target_station_id = ? AND status = 'TRANSFERRED'))
            AND status IN ('RUNNING', 'QUEUED')
          ORDER BY lot_number ASC LIMIT 1
        `).get(currentStation.project_id, stationId, stationId) as any;

        if (!readyWot) {
          return res.status(400).json({ error: "No active WOT found to transfer at this station" });
        }

        if (nextStation) {
          db.prepare(`
            UPDATE work_order_tickets 
            SET status = 'TRANSFERRED', current_station_id = ?, target_station_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(stationId, nextStation.id, readyWot.id);
        } else {
          db.prepare(`
            UPDATE work_order_tickets 
            SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(readyWot.id);
        }

        emitProductionUpdate("WOT_UPDATED", { projectId: currentStation.project_id, stationId, wotId: readyWot.id });
        res.json({ success: true, message: `WOT ${readyWot.lot_number} successfully transferred to ${nextStation ? nextStation.station_name : 'Finished Goods'}`, wot: readyWot });
      } catch (err: any) {
        console.error("Transfer ready WOT error:", err);
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.get("/api/production/projects/:id/wots", (req, res) => {
      try {
        const wots = db.prepare(`
          SELECT w.*, 
                 b.process_name as current_process_name, 
                 COALESCE(s.station_name, 'Station') as current_station_name,
                 (SELECT COUNT(*) FROM wot_history h WHERE h.wot_id = w.id AND h.notes != 'Lot ticket generated') as completed_steps_count
          FROM work_order_tickets w
          LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
          LEFT JOIN project_stations s ON w.current_station_id = s.id
          WHERE w.project_id = ? 
          ORDER BY w.lot_number ASC
        `).all(req.params.id);
        res.json({ wots });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.post("/api/production/projects/:id/wots/generate", async (req, res) => {
      try {
        const projectId = req.params.id;
        const { lot_size } = req.body;
        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });

        const totalQty = Number(project.qty) || 1;
        const lotSize = Math.max(1, Number(lot_size) || Number(project.lot_size) || 50);
        const numLots = Math.ceil(totalQty / lotSize);

        const processes = db.prepare(`
          SELECT * FROM bill_of_processes 
          WHERE project_id = ? AND UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY step_sequence ASC
        `).all(projectId) as any[];

        const firstProcess = processes[0] || null;
        const existingCount = db.prepare("SELECT COUNT(*) as count FROM work_order_tickets WHERE project_id = ?").get(projectId) as any;
        const startIdx = existingCount?.count || 0;

        const codePrefix = project.spk_number?.replace(/[^A-Za-z0-9]/g, '') || project.name?.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PRJ';
        const createdWots: any[] = [];

        for (let i = 0; i < numLots; i++) {
          const lotNum = `WOT-${codePrefix}-${String(startIdx + i + 1).padStart(3, '0')}`;
          const wotId = crypto.randomUUID();
          const lotQty = (i === numLots - 1 && (totalQty % lotSize !== 0)) ? (totalQty % lotSize) : lotSize;
          
          const qrInfo = generateSignedWotQr({
            wot_id: wotId,
            lot: lotNum,
            prj: project.spk_number || project.name,
            st: firstProcess?.station_name || "ST-01",
            proc: firstProcess?.process_name || "General",
            mch: firstProcess?.assigned_machine_id || "MANUAL",
            qty: lotQty
          });

          let qrDataUrl = "";
          try {
            qrDataUrl = await QRCode.toDataURL(qrInfo.rawJson, {
              width: 256,
              margin: 1,
              errorCorrectionLevel: 'M'
            });
          } catch (e) {
            console.warn("QR code data URL generation error", e);
          }

          db.prepare(`
            INSERT INTO work_order_tickets 
            (id, project_id, lot_number, qty, status, current_station_id, current_process_id, machine_id, qr_payload, qr_image_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).run(
            wotId, 
            projectId, 
            lotNum, 
            lotQty, 
            firstProcess?.station_id || null, 
            firstProcess?.id || null, 
            firstProcess?.assigned_machine_id || null,
            qrInfo.rawJson,
            qrDataUrl
          );

          db.prepare(`
            INSERT INTO wot_history 
            (id, wot_id, project_id, process_id, station_id, operator_name, completed_at, qty, scrap_qty, notes)
            VALUES (?, ?, ?, ?, ?, 'System', CURRENT_TIMESTAMP, ?, 0, 'Lot ticket generated')
          `).run(crypto.randomUUID(), wotId, projectId, firstProcess?.id || 'INIT', firstProcess?.station_id || null, lotQty);

          // Initial travel log entry
          try {
            db.prepare(`
              INSERT INTO wot_travel_logs (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
              VALUES (?, ?, 'START', ?, ?, ?, 'System', ?)
            `).run(
              crypto.randomUUID(),
              wotId,
              firstProcess?.station_id || null,
              firstProcess?.id || null,
              firstProcess?.assigned_machine_id || null,
              JSON.stringify({ action: 'Lot ticket generated with signed QR', qty: lotQty })
            );
          } catch (_) {}

          createdWots.push({
            id: wotId,
            lot_number: lotNum,
            qty: lotQty,
            status: 'QUEUED',
            qr_payload: qrInfo.rawJson,
            qr_image_url: qrDataUrl
          });
        }

        emitProductionUpdate("WOTS_GENERATED", { projectId, count: createdWots.length });
        res.json({ ok: true, success: true, count: createdWots.length, wots: createdWots });

      } catch (err: any) {
        console.error("Generate WOTs error:", err);
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.get(["/api/production/scan-wot", "/api/production/wots/validate-process"], (req, res) => {
      try {
        const rawLot = req.query.lot_number || req.query.lot || req.query.wot_id || req.query.id || "";
        const lotNumber = String(rawLot).trim();
        if (!lotNumber) {
          return res.status(400).json({ error: "Lot number is required" });
        }

        let target = lotNumber;
        let isEncryptedPayload = false;
        try {
          // Check if it's base64 encoded JSON (the secure payload we generate)
          if (!lotNumber.startsWith('{')) {
            const decodedStr = Buffer.from(lotNumber, 'base64').toString('utf8');
            if (decodedStr.startsWith('{')) {
              isEncryptedPayload = true;
              const parsed = JSON.parse(decodedStr);
              target = parsed.lot_number || parsed.lot || parsed.wot_id || parsed.id || lotNumber;
              
              // Verify HMAC signature
              if (parsed.sig) {
                const secretKey = process.env.QR_SECRET_KEY || 'AI_STUDIO_ERP_SECURE_QR_2026';
                const hmac = crypto.createHmac('sha256', secretKey);
                const { sig, ...payloadWithoutSig } = parsed;
                hmac.update(JSON.stringify(payloadWithoutSig));
                const expectedSignature = hmac.digest('hex');
                if (expectedSignature !== sig) {
                   return res.status(403).json({ error: "Invalid QR Security Signature. This QR Code may be forged." });
                }
              }
            }
          }
          if (lotNumber.startsWith('{') && lotNumber.endsWith('}')) {
            const parsed = JSON.parse(lotNumber);
            target = parsed.lot_number || parsed.lot || parsed.tag_number || parsed.wot_id || parsed.id || lotNumber;
          }
        } catch (e) {}

        const wot = db.prepare(`
          SELECT w.*, p.name as project_name, p.qty as project_qty, p.uom as project_uom,
                 b.process_name as current_process_name,
                 COALESCE(s.station_name, 'Station') as current_station_name,
                 i.name as machine_name, i.item_code as machine_code,
                 COALESCE(b.assigned_machine_id, b.machine_id) as effective_machine_id
          FROM work_order_tickets w
          LEFT JOIN projects p ON w.project_id = p.id
          LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
          LEFT JOIN project_stations s ON w.current_station_id = s.id
          LEFT JOIN items i ON COALESCE(b.assigned_machine_id, b.machine_id) = i.id
          WHERE w.lot_number = ? OR w.id = ? OR w.lot_number LIKE ?
        `).get(target, target, `%${target}%`) as any;

        if (!wot) {
          return res.status(404).json({ error: `WOT tidak ditemukan dengan kode: "${target}"` });
        }

        const bopSteps = db.prepare(`
          SELECT b.*, COALESCE(s.station_name, 'Station') as station_name, i.name as machine_name, i.item_code as machine_code, 
                 COALESCE(i.operational_status, i.machine_status, 'AVAILABLE') as machine_status,
                 COALESCE(b.assigned_machine_id, b.machine_id) as effective_machine_id
          FROM bill_of_processes b
          LEFT JOIN project_stations s ON b.station_id = s.id
          LEFT JOIN items i ON COALESCE(b.assigned_machine_id, b.machine_id) = i.id
          WHERE b.project_id = ? AND UPPER(b.node_type) NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY b.step_sequence ASC
        `).all(wot.project_id) as any[];

        const history = db.prepare(`
          SELECT h.*, b.process_name, COALESCE(s.station_name, 'Station') as station_name
          FROM wot_history h
          LEFT JOIN bill_of_processes b ON h.process_id = b.id
          LEFT JOIN project_stations s ON h.station_id = s.id
          WHERE h.wot_id = ?
          ORDER BY h.completed_at ASC
        `).all(wot.id) as any[];

        const completedProcessIds = new Set(
          history
            .filter((h: any) => h.notes !== 'Lot ticket generated')
            .map((h: any) => h.process_id)
        );

        const activeProcess = bopSteps.find((step: any) => !completedProcessIds.has(step.id)) || null;

        let activeNdp: any = null;
        const targetMachineId = activeProcess ? (activeProcess.assigned_machine_id || activeProcess.machine_id) : null;
        if (targetMachineId) {
          activeNdp = db.prepare(`
            SELECT * FROM notice_to_down_processes 
            WHERE (machine_id = ? OR affected_machine_id = ?) AND status = 'ACTIVE'
          `).get(targetMachineId, targetMachineId) as any;
        }

        res.json({
          ok: true,
          wot: {
            ...wot,
            process_name: activeProcess ? activeProcess.process_name : wot.current_process_name,
            station_name: activeProcess ? activeProcess.station_name : wot.current_station_name,
            machine_code: activeProcess ? activeProcess.machine_code : wot.machine_code,
            machine_name: activeProcess ? activeProcess.machine_name : wot.machine_name,
            effective_machine_id: activeProcess ? activeProcess.effective_machine_id : wot.effective_machine_id,
            is_completed: !activeProcess
          },
          activeProcess: activeProcess ? {
            ...activeProcess,
            is_machine_down: Boolean(activeNdp || activeProcess.machine_status === 'BROKEN'),
            active_ndp: activeNdp || null
          } : null,
          history,
          allSteps: bopSteps
        });
      } catch (err: any) {
        console.error("Scan WOT error:", err);
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.post("/api/production/wots/:id/complete-process", (req, res) => {
      try {
        const wotId = req.params.id;
        const { process_id, operator_name, scrap_qty, rework_qty, good_qty, reject_qty, reject_reason, notes } = req.body;

        const wot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(wotId) as any;
        if (!wot) return res.status(404).json({ error: "WOT not found" });

        const effectiveProcessId = process_id || wot.current_process_id;
        let process = effectiveProcessId ? db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(effectiveProcessId) as any : null;
        
        if (!process) {
          // Fallback to first incomplete process
          const historyIds = (db.prepare("SELECT process_id FROM wot_history WHERE wot_id = ?").all(wot.id) as any[]).map(h => h.process_id);
          const candidate = db.prepare(`
            SELECT * FROM bill_of_processes 
            WHERE project_id = ? AND UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END')
            ORDER BY step_sequence ASC
          `).all(wot.project_id) as any[];
          process = candidate.find(c => !historyIds.includes(c.id)) || candidate[0];
        }

        if (!process) return res.status(404).json({ error: "No active process step found for this WOT" });

        const procMachineId = process.assigned_machine_id || process.machine_id;
        if (procMachineId) {
          const activeNdp = db.prepare("SELECT * FROM notice_to_down_processes WHERE (machine_id = ? OR affected_machine_id = ?) AND status = 'ACTIVE'").get(procMachineId, procMachineId) as any;
          if (activeNdp) {
            return res.status(400).json({
              error: `Machine [${procMachineId}] is currently down under an active NDP (${activeNdp.ndp_number}). Resolve the NDP before completing this process!`
            });
          }
        }

        const scrapCount = Math.max(0, Number(scrap_qty || reject_qty) || 0);
        const reworkCount = Math.max(0, Number(rework_qty) || 0);
        const completedQty = Math.max(1, Number(good_qty) || (Number(wot.qty) || 1) - scrapCount);
        const opName = operator_name || "Floor Operator";

        const allProcesses = db.prepare(`
          SELECT id, step_sequence, station_id, process_name FROM bill_of_processes 
          WHERE project_id = ? AND UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY step_sequence ASC
        `).all(wot.project_id) as any[];

        const currIdx = allProcesses.findIndex((p: any) => p.id === process.id);
        const nextProcess = (currIdx !== -1 && currIdx < allProcesses.length - 1) ? allProcesses[currIdx + 1] : null;

        // First Article Inspection (FAI) Interlock on Step #1 before WOT completion
        if (currIdx === 0 && !req.body.bypass_fai) {
          try {
            const faiTableExists = db
              .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='qc_bop_inspections'")
              .get() as any;
            if (faiTableExists) {
              const faiPassed = db
                .prepare(
                  `SELECT id FROM qc_bop_inspections
                   WHERE project_id = ? AND bop_id = ? AND inspection_type = 'FAI' AND disposition = 'PASSED'
                   LIMIT 1`
                )
                .get(wot.project_id, process.id) as any;
              if (!faiPassed) {
                return res.status(409).json({
                  code: "FAI_APPROVAL_REQUIRED",
                  error: `First Article Inspection (FAI) Interlock: Step #1 (${process.process_name || "Initial Process"}) requires FAI approval from QA/QC in Process Quality Control before completing the first WOT lot.`,
                });
              }
            }
          } catch (faiErr) {
            console.warn("FAI check warning:", faiErr);
          }
        }

        let travelTagNumber = `TAG-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

        db.transaction(() => {
          db.prepare(`
            INSERT INTO wot_history 
            (id, wot_id, project_id, process_id, station_id, operator_name, completed_at, qty, scrap_qty, notes)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
          `).run(
            crypto.randomUUID(), 
            wot.id, 
            wot.project_id, 
            process.id, 
            process.station_id || null, 
            opName, 
            completedQty, 
            scrapCount, 
            reject_reason || notes || `Completed process: ${process.process_name}`
          );

          db.prepare(`
            INSERT INTO production_wot_genealogy
            (id, wot_id, project_id, station_id, process_id, operator_name, yield_qty, scrap_qty, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            wot.id,
            wot.project_id,
            process.station_id || null,
            process.id,
            opName,
            completedQty,
            scrapCount,
            reject_reason || notes || 'Verified process completion'
          );

          // Auto-generate task travel tag record
          try {
            const tagId = crypto.randomUUID();
            const qrPayload = JSON.stringify({
              tag_number: travelTagNumber,
              wot_id: wot.id,
              lot_number: wot.lot_number,
              project_id: wot.project_id,
              process_id: process.id,
              station_id: process.station_id,
              good_qty: completedQty,
              scrap_qty: scrapCount,
              rework_qty: reworkCount,
              completed_at: new Date().toISOString()
            });
            db.prepare(`
              INSERT INTO task_travel_tags
              (id, tag_number, project_id, bop_id, lot_id, operator_name, good_qty, scrap_qty, qc_status, qr_payload, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PASSED', ?, CURRENT_TIMESTAMP)
            `).run(
              tagId,
              travelTagNumber,
              wot.project_id,
              process.id,
              wot.lot_number || wot.id,
              opName,
              completedQty,
              scrapCount,
              qrPayload
            );
          } catch (tagErr) {
            console.warn("Could not insert travel tag:", tagErr);
          }

          try {
            db.prepare(`
              INSERT INTO wot_travel_logs
              (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              crypto.randomUUID(),
              wot.id,
              nextProcess ? (process.station_id === nextProcess.station_id ? 'INTRA_STATION_TRANSFER' : 'INTER_STATION_TRANSFER') : 'WOT_COMPLETED',
              process.station_id || null,
              process.id,
              procMachineId || null,
              opName,
              JSON.stringify({
                good_qty: completedQty,
                scrap_qty: scrapCount,
                rework_qty: reworkCount,
                next_process_id: nextProcess?.id,
                next_station_id: nextProcess?.station_id
              })
            );
          } catch (logErr) {
            console.warn("Could not insert wot_travel_log:", logErr);
          }

          // Update WOT state
          if (nextProcess) {
            const isSameStation = process.station_id === nextProcess.station_id;
            const nextStatus = isSameStation ? 'QUEUED' : 'TRANSFERRED';
            db.prepare(`
              UPDATE work_order_tickets 
              SET status = ?,
                  current_process_id = ?,
                  current_station_id = ?,
                  good_units = COALESCE(good_units, 0) + ?,
                  reject_units = COALESCE(reject_units, 0) + ?,
                  rework_units = COALESCE(rework_units, 0) + ?,
                  machine_id = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(nextStatus, nextProcess.id, nextProcess.station_id || null, completedQty, scrapCount, reworkCount, procMachineId || null, wot.id);
          } else {
            db.prepare(`
              UPDATE work_order_tickets 
              SET status = 'COMPLETED',
                  current_process_id = NULL,
                  good_units = COALESCE(good_units, 0) + ?,
                  reject_units = COALESCE(reject_units, 0) + ?,
                  rework_units = COALESCE(rework_units, 0) + ?,
                  machine_id = ?,
                  completed_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(completedQty, scrapCount, reworkCount, procMachineId || null, wot.id);
          }

          const totalDone = db.prepare(`
            SELECT COALESCE(SUM(qty), 0) as total 
            FROM wot_history 
            WHERE process_id = ? AND notes != 'Lot ticket generated'
          `).get(process.id) as any;

          const project = db.prepare("SELECT qty FROM projects WHERE id = ?").get(wot.project_id) as any;
          const prjQty = project?.qty || 1;
          const bopTotal = totalDone?.total || completedQty;
          const bopStatus = bopTotal >= prjQty ? 'COMPLETED' : 'RUNNING';
          const bopProgress = Math.min(100, Math.round((bopTotal / prjQty) * 100));

          db.prepare(`
            UPDATE bill_of_processes 
            SET completed_qty = ?, status = ?, progress = ?,
                actual_end_date = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE actual_end_date END
            WHERE id = ?
          `).run(bopTotal, bopStatus, bopProgress, bopStatus, process.id);

          // Insert production log entry
          try {
            db.prepare(`
              INSERT INTO production_logs
              (id, log_type, project_id, wot_id, station_id, process_id, user_role, details, timestamp)
              VALUES (?, 'WOT_COMPLETE', ?, ?, ?, ?, 'OPERATOR', ?, CURRENT_TIMESTAMP)
            `).run(
              crypto.randomUUID(),
              wot.project_id,
              wot.id,
              process.station_id || null,
              process.id,
              JSON.stringify({
                lot_number: wot.lot_number,
                process_name: process.process_name,
                good_qty: completedQty,
                reject_qty: scrapCount,
                is_final_step: !nextProcess
              })
            );
          } catch (logErr) {
            console.warn("Could not insert log entry", logErr);
          }
        })();
        
        invalidatePlanningCache();

        emitProductionUpdate("WOT_COMPLETED_STEP", {
          wotId: wot.id,
          processId: process.id,
          projectId: wot.project_id,
          nextProcessId: nextProcess?.id || null,
          isFinished: !nextProcess
        });

        res.json({
          ok: true,
          success: true,
          is_final_step: !nextProcess,
          next_process_id: nextProcess ? nextProcess.id : null,
          message: nextProcess 
            ? `Proses "${process.process_name}" selesai. WOT dialihkan ke langkah berikutnya.` 
            : `WOT telah menyelesaikan seluruh langkah produksi (Root-to-Finish)!`
        });
      } catch (err: any) {
        console.error("Complete WOT error:", err);
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.post("/api/wots/generate-qr-batch", async (req, res) => {
      try {
        const { project_id, wot_ids } = req.body;
        if (!project_id) return res.status(400).json({ error: "project_id is required" });

        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(project_id) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });

        let wotsQuery = `
          SELECT w.*, p.name as project_name, p.spk_number,
                 s.station_name, b.process_name,
                 i.name as machine_name, i.item_code as machine_code
          FROM work_order_tickets w
          LEFT JOIN projects p ON w.project_id = p.id
          LEFT JOIN project_stations s ON w.current_station_id = s.id
          LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
          LEFT JOIN items i ON w.machine_id = i.id
          WHERE w.project_id = ?
        `;
        const params: any[] = [project_id];
        if (Array.isArray(wot_ids) && wot_ids.length > 0) {
          const placeholders = wot_ids.map(() => '?').join(',');
          wotsQuery += ` AND w.id IN (${placeholders})`;
          params.push(...wot_ids);
        }
        wotsQuery += " ORDER BY w.lot_number ASC";

        const wots = db.prepare(wotsQuery).all(...params) as any[];

        const updatedWots = [];

        for (const wot of wots) {
          const qrInfo = generateSignedWotQr({
            wot_id: wot.id,
            lot: wot.lot_number,
            prj: project.spk_number || project.name,
            st: wot.station_name || "ST-01",
            proc: wot.process_name || "General",
            mch: wot.machine_code || wot.machine_name || "MANUAL",
            qty: wot.qty
          });
          
          const payloadStr = qrInfo.rawJson;
          const qrDataUrl = await QRCode.toDataURL(payloadStr, { width: 256, margin: 1, errorCorrectionLevel: 'M' });

          db.prepare(`
            UPDATE work_order_tickets
            SET qr_payload = ?, qr_image_url = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(payloadStr, qrDataUrl, wot.id);

          // Travel log entry for QR generation if not yet created
          const hasLog = db.prepare("SELECT id FROM wot_travel_logs WHERE wot_id = ? AND event_type = 'START'").get(wot.id);
          if (!hasLog) {
            db.prepare(`
              INSERT INTO wot_travel_logs (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
              VALUES (?, ?, 'START', ?, ?, ?, 'System', ?)
            `).run(crypto.randomUUID(), wot.id, wot.current_station_id || null, wot.current_process_id || null, wot.machine_id || null, JSON.stringify({ action: 'QR Generated with HMAC-SHA256 signature' }));
          }

          updatedWots.push({
            ...wot,
            qr_payload: payloadStr,
            qr_image_url: qrDataUrl
          });
        }

        res.json({ ok: true, success: true, count: updatedWots.length, wots: updatedWots });
      } catch (err: any) {
        console.error("Batch QR generate error:", err);
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.post("/api/wots/scan", (req, res) => {
      try {
        const { qr_payload, user_id, device_info, station_id } = req.body;
        if (!qr_payload) return res.status(400).json({ error: "qr_payload is required" });

        const verification = verifyAndParseWotQr(String(qr_payload).trim());
        if (!verification.isValid) {
          // Log security audit for rejected scan
          try {
            db.prepare(`
              INSERT INTO production_logs 
              (id, log_type, project_id, user_id, user_role, device_info, details, timestamp)
              VALUES (?, 'REJECTED_SCAN', NULL, ?, 'OPERATOR', ?, ?, CURRENT_TIMESTAMP)
            `).run(
              crypto.randomUUID(),
              user_id || null,
              device_info || 'ShopFloorTerminal',
              JSON.stringify({ raw_input: String(qr_payload).substring(0, 200), reason: verification.reason })
            );
          } catch (_) {}

          return res.status(400).json({
            ok: true,
            is_valid: false,
            reason: verification.reason,
            message: "Tanda tangan keamanan QR tidak valid (HMAC Mismatch atau data rusak). Pindai ditolak.",
            next_action: "SCAN_REJECTED"
          });
        }

        const lotIdentifier = verification.payload?.lot || verification.payload?.wot_id || String(qr_payload).trim();

        const wot = db.prepare(`
          SELECT w.*, p.name as project_name, p.spk_number,
                 s.station_name, s.id as station_id,
                 b.process_name, b.id as bop_id, b.cycle_time_minutes,
                 i.name as machine_name, i.item_code as machine_code,
                 COALESCE(i.operational_status, i.machine_status, 'AVAILABLE') as machine_status
          FROM work_order_tickets w
          LEFT JOIN projects p ON w.project_id = p.id
          LEFT JOIN project_stations s ON w.current_station_id = s.id
          LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
          LEFT JOIN items i ON w.machine_id = i.id
          WHERE w.lot_number = ? OR w.id = ? OR w.lot_number LIKE ?
        `).get(lotIdentifier, lotIdentifier, `%${lotIdentifier}%`) as any;

        if (!wot) {
          return res.status(404).json({ is_valid: false, message: `WOT tidak ditemukan: "${lotIdentifier}"` });
        }

        // Check if machine has active breakdown / NDP
        let isMachineDown = false;
        let ndpReason = "";
        if (wot.machine_id) {
          const activeNdp = db.prepare(`
            SELECT * FROM notice_to_down_processes 
            WHERE (machine_id = ? OR affected_machine_id = ?) AND status = 'ACTIVE'
          `).get(wot.machine_id, wot.machine_id) as any;
          if (activeNdp) {
            isMachineDown = true;
            ndpReason = activeNdp.reason_detail || activeNdp.reason_category || "Breakdown";
          }
        }

        if (isMachineDown) {
          return res.json({
            ok: true,
            is_valid: false,
            wot,
            message: `Mesin ${wot.machine_code || wot.machine_name} sedang dalam status NDP LOCKDOWN (${ndpReason}). Tidak dapat memproses WOT saat ini.`,
            next_action: "MACHINE_BLOCKED"
          });
        }

        // Check station mismatch if station_id provided by terminal
        if (station_id && wot.current_station_id && station_id !== wot.current_station_id) {
          return res.json({
            ok: true,
            is_valid: false,
            wot,
            message: `WOT ini terdaftar di ${wot.station_name || 'Station lain'}, Anda memindai di stasiun yang berbeda.`,
            next_action: "STATION_MISMATCH"
          });
        }

        // Insert immutable production log for QR scan
        const logId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO production_logs 
          (id, log_type, project_id, wot_id, station_id, process_id, machine_id, user_id, user_role, device_info, details, timestamp)
          VALUES (?, 'QR_SCAN', ?, ?, ?, ?, ?, ?, 'OPERATOR', ?, ?, CURRENT_TIMESTAMP)
        `).run(
          logId,
          wot.project_id,
          wot.id,
          wot.current_station_id,
          wot.current_process_id,
          wot.machine_id,
          user_id || null,
          device_info || 'ShopFloorTerminal',
          JSON.stringify({ lot: wot.lot_number, scanned_at: new Date().toISOString() })
        );

        // Insert into wot_travel_logs
        db.prepare(`
          INSERT INTO wot_travel_logs
          (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
          VALUES (?, ?, 'QR_SCAN', ?, ?, ?, 'Operator', ?)
        `).run(
          crypto.randomUUID(),
          wot.id,
          wot.current_station_id,
          wot.current_process_id,
          wot.machine_id,
          JSON.stringify({ device: device_info || 'ShopFloorTerminal' })
        );

        emitProductionUpdate("WOT_SCANNED", { wot_id: wot.id, lot_number: wot.lot_number });

        return res.json({
          ok: true,
          is_valid: true,
          wot,
          message: `WOT [${wot.lot_number}] validated for station ${wot.station_name || 'General'}.`,
          next_action: "CONFIRM_COMPLETION"
        });
      } catch (err: any) {
        console.error("Scan error:", err);
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.post("/api/wots/confirm-completion", (req, res) => {
      try {
        const { wot_id, user_id, user_name, good_units, reject_units, rework_units, reject_reason, notes, device_info } = req.body;
        if (!wot_id) return res.status(400).json({ error: "wot_id is required" });

        const wot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(wot_id) as any;
        if (!wot) return res.status(404).json({ error: "WOT not found" });

        const goodQty = Math.max(0, Number(good_units) || Number(wot.qty) || 1);
        const rejectQty = Math.max(0, Number(reject_units) || 0);
        const reworkQty = Math.max(0, Number(rework_units) || 0);
        const completedTotal = goodQty + rejectQty;
        const opName = user_name || "Shop Floor Operator";

        // Find current process
        const process = wot.current_process_id 
          ? db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(wot.current_process_id) as any
          : null;

        // Find all processes for this project ordered by sequence
        const allProcesses = db.prepare(`
          SELECT * FROM bill_of_processes 
          WHERE project_id = ? AND UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END')
          ORDER BY step_sequence ASC
        `).all(wot.project_id) as any[];

        const currIdx = process ? allProcesses.findIndex((p: any) => p.id === process.id) : 0;
        const activeStep = process || allProcesses[0] || null;
        const nextProcess = (currIdx !== -1 && currIdx < allProcesses.length - 1) ? allProcesses[currIdx + 1] : null;

        // First Article Inspection (FAI) Interlock on Step #1 before WOT completion
        if (currIdx === 0 && activeStep && !req.body.bypass_fai) {
          try {
            const faiTableExists = db
              .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='qc_bop_inspections'")
              .get() as any;
            if (faiTableExists) {
              const faiPassed = db
                .prepare(
                  `SELECT id FROM qc_bop_inspections
                   WHERE project_id = ? AND bop_id = ? AND inspection_type = 'FAI' AND disposition = 'PASSED'
                   LIMIT 1`
                )
                .get(wot.project_id, activeStep.id) as any;
              if (!faiPassed) {
                return res.status(409).json({
                  code: "FAI_APPROVAL_REQUIRED",
                  error: `First Article Inspection (FAI) Interlock: Step #1 (${activeStep.process_name || "Initial Process"}) requires FAI approval from QA/QC in Process Quality Control before completing the first WOT lot.`,
                });
              }
            }
          } catch (faiErr) {
            console.warn("FAI check warning:", faiErr);
          }
        }

        let gateStatus = "TRANSFER_GATE_OPEN";
        let newStatus = "COMPLETED";
        let nextStationId = null;
        let nextProcessId = null;

        if (nextProcess) {
          const isSameStation = process && process.station_id === nextProcess.station_id;
          if (isSameStation) {
            // Intra-station transfer: piece flow / instant advance to next process
            gateStatus = "INTRA_STATION_ADVANCED";
            newStatus = "RUNNING";
            nextStationId = process.station_id;
            nextProcessId = nextProcess.id;
          } else {
            // Inter-station transfer: gate rule minimal 1 WOT completed
            gateStatus = "TRANSFER_GATE_OPEN";
            newStatus = "TRANSFERRED";
            nextStationId = nextProcess.station_id;
            nextProcessId = nextProcess.id;
          }
        } else {
          // Final process completed
          gateStatus = "FINAL_PRODUCT_READY";
          newStatus = "FINISHED";
        }

        const logId = crypto.randomUUID();

        db.transaction(() => {
          // Update WOT
          db.prepare(`
            UPDATE work_order_tickets
            SET status = ?,
                current_station_id = ?,
                current_process_id = ?,
                good_units = COALESCE(good_units, 0) + ?,
                reject_units = COALESCE(reject_units, 0) + ?,
                rework_units = COALESCE(rework_units, 0) + ?,
                completed_units = COALESCE(completed_units, 0) + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newStatus, nextStationId, nextProcessId, goodQty, rejectQty, reworkQty, completedTotal, wot.id);

          // Insert production log
          db.prepare(`
            INSERT INTO production_logs
            (id, log_type, project_id, wot_id, station_id, process_id, machine_id, user_id, user_role, device_info, details, timestamp)
            VALUES (?, 'WOT_COMPLETE', ?, ?, ?, ?, ?, ?, 'OPERATOR', ?, ?, CURRENT_TIMESTAMP)
          `).run(
            logId,
            wot.project_id,
            wot.id,
            wot.current_station_id,
            wot.current_process_id,
            wot.machine_id,
            user_id || null,
            device_info || 'ShopFloorTerminal',
            JSON.stringify({ good_units: goodQty, reject_units: rejectQty, rework_units: reworkQty, reject_reason, notes, gate_status: gateStatus })
          );

          // Insert wot_travel_logs
          db.prepare(`
            INSERT INTO wot_travel_logs
            (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
            VALUES (?, ?, 'WOT_COMPLETE', ?, ?, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            wot.id,
            wot.current_station_id,
            wot.current_process_id,
            wot.machine_id,
            opName,
            JSON.stringify({ good_units: goodQty, reject_units: rejectQty, rework_units: reworkQty, gate_status: gateStatus })
          );

          if (gateStatus === 'TRANSFER_GATE_OPEN' || gateStatus === 'INTRA_STATION_ADVANCED') {
            db.prepare(`
              INSERT INTO wot_travel_logs
              (id, wot_id, event_type, station_id, process_id, machine_id, user_name, metadata)
              VALUES (?, ?, 'TRANSFER', ?, ?, ?, ?, ?)
            `).run(
              crypto.randomUUID(),
              wot.id,
              nextStationId,
              nextProcessId,
              null,
              opName,
              JSON.stringify({ type: gateStatus === 'INTRA_STATION_ADVANCED' ? 'INTRA_STATION' : 'INTER_STATION' })
            );
          }
        })();
        
        invalidatePlanningCache();

        emitProductionUpdate("WOT_COMPLETED", { wot_id: wot.id, gate_status: gateStatus });

        const updatedWot = db.prepare("SELECT * FROM work_order_tickets WHERE id = ?").get(wot.id);
        res.json({ ok: true, success: true, wot: updatedWot, log_id: logId, gate_status: gateStatus });
      } catch (err: any) {
        console.error("Confirm completion error:", err);
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.get("/api/wots/:id/travel-log", (req, res) => {
      try {
        const wotId = req.params.id;
        const logs = db.prepare(`
          SELECT tl.*, s.station_name, b.process_name, i.item_code as machine_code, i.name as machine_name
          FROM wot_travel_logs tl
          LEFT JOIN project_stations s ON tl.station_id = s.id
          LEFT JOIN bill_of_processes b ON tl.process_id = b.id
          LEFT JOIN items i ON tl.machine_id = i.id
          WHERE tl.wot_id = ?
          ORDER BY tl.created_at ASC, tl.timestamp ASC
        `).all(wotId);
        res.json({ ok: true, data: logs });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

assemblyRouter.get("/api/production/projects/:id/wots/history", (req, res) => {
      try {
        const history = db.prepare(`
          SELECT h.*, w.lot_number, b.process_name, COALESCE(s.station_name, 'Station') as station_name
          FROM wot_history h
          JOIN work_order_tickets w ON h.wot_id = w.id
          LEFT JOIN bill_of_processes b ON h.process_id = b.id
          LEFT JOIN project_stations s ON h.station_id = s.id
          WHERE h.project_id = ?
          ORDER BY h.completed_at DESC
        `).all(req.params.id);
        res.json({ ok: true, history });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });


// Mandatory WOT QR Scan Handshake: Starts Project / Auto-Completes Previous Step & Starts Target Step
assemblyRouter.post("/api/production/wot/scan-transition", (req, res) => {
  try {
    const {
      project_id,
      qr_input, // Raw QR JSON string, WOT ID, or WOT Number
      target_bop_id,
      operator_name,
      good_qty,
      scrap_qty,
      notes,
      strict_reservation_gate,
      supervisor_override,
      force_material_override,
    } = req.body;

    const actor = operator_name || getActor(req) || "Shop Floor Operator";

    // 1. Resolve WOT from qr_input
    let wot: any = null;
    if (qr_input) {
      const trimmed = String(qr_input).trim();
      const parsed = verifyAndParseWotQr(trimmed);
      if (parsed.valid && parsed.payload) {
        wot = db.prepare(`SELECT * FROM work_order_tickets WHERE id = ? OR wot_number = ?`).get(
          parsed.payload.id,
          parsed.payload.wot_number
        );
      }
      if (!wot) {
        try {
          const obj = JSON.parse(trimmed);
          const candidateId = obj.id || obj.wot_id || obj.wot_number || obj.code;
          if (candidateId) {
            wot = db.prepare(`SELECT * FROM work_order_tickets WHERE id = ? OR wot_number = ?`).get(candidateId, candidateId);
          }
        } catch (e) {}
      }
      if (!wot) {
        wot = db.prepare(`
          SELECT * FROM work_order_tickets
          WHERE id = ? OR UPPER(wot_number) = UPPER(?) OR qr_code_string = ?
        `).get(trimmed, trimmed, trimmed);
      }
    }

    const effectiveProjectId = wot?.project_id || project_id;
    if (!effectiveProjectId) {
      return res.status(400).json({ error: "Could not identify Project or WOT from QR scan." });
    }

    if (!wot) {
      return res.status(404).json({
        error: `WOT QR code "${qr_input}" not found. Please scan a valid WOT QR tag generated from Setup & Master.`,
      });
    }

    const allSteps = db.prepare(`
      SELECT * FROM bill_of_processes
      WHERE project_id = ? AND (node_type IS NULL OR UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END'))
      ORDER BY step_sequence ASC
    `).all(effectiveProjectId) as any[];

    if (allSteps.length === 0) {
      return res.status(400).json({ error: "No BOP route processes declared for this project." });
    }

    // Determine target BOP step: either explicitly selected or the next logical step in route sequence
    let targetStep: any = null;
    if (target_bop_id) {
      targetStep = allSteps.find((s: any) => s.id === target_bop_id);
    }
    if (!targetStep) {
      if (!wot.current_bop_id) {
        targetStep = allSteps[0];
      } else {
        const currentIdx = allSteps.findIndex((s: any) => s.id === wot.current_bop_id);
        if (currentIdx >= 0 && currentIdx + 1 < allSteps.length) {
          targetStep = allSteps[currentIdx + 1];
        } else {
          targetStep = allSteps[currentIdx] || allSteps[0];
        }
      }
    }

    // Check if target step is blocked by an active NDP
    const activeNdp = db.prepare(`
      SELECT * FROM notice_to_down_processes
      WHERE bop_id = ? AND status = 'ACTIVE'
    `).get(targetStep.id) as any;

    if (activeNdp) {
      return res.status(409).json({
        error: `Process "${targetStep.process_name}" is currently halted by active NDP [${activeNdp.ndp_code || activeNdp.reason_category}]. Resolve the NDP before scanning into this process.`,
      });
    }

    // Idempotency Guard: Prevent rapid duplicate scan of the same WOT into the exact same step within 3 seconds
    if (wot.current_bop_id === targetStep.id && wot.last_scanned_at) {
      const lastScanMs = new Date(wot.last_scanned_at).getTime();
      if (!isNaN(lastScanMs) && Date.now() - lastScanMs < 3000) {
        return res.json({
          ok: true,
          is_duplicate_scan: true,
          wot_id: wot.id,
          wot_number: wot.wot_number,
          started_process: {
            id: targetStep.id,
            name: targetStep.process_name,
            step_sequence: targetStep.step_sequence,
          },
          completed_previous_steps: [],
          message: `WOT ${wot.wot_number} is already active at [${targetStep.process_name}].`,
        });
      }
    }

    const targetIdx = allSteps.findIndex((s: any) => s.id === targetStep.id);

    // =========================================================================
    // 4-GATE MANUFACTURING ORCHESTRA ENGINE VALIDATION (POINT-OF-USE & WAVE QUOTA)
    // =========================================================================
    // GATE 1: Point-of-Use (POU) & Partial Wave Quota Gate
    const scmGate = evaluateProjectScmSupplyGate(effectiveProjectId);
    const stepQuota = scmGate.process_producible_quotas?.[targetStep.id];
    const isStepBlockedByScm = stepQuota ? !stepQuota.is_pou_unlocked : !scmGate.all_supplied_to_floor;

    if (isStepBlockedByScm) {
      const blockingList =
        stepQuota && stepQuota.blocking_items.length > 0
          ? stepQuota.blocking_items
          : scmGate.items.filter((it) => it.scm_stage !== "SUPPLIED_TO_FLOOR");

      const missingList = blockingList
        .map(
          (u: any) =>
            `${u.item_code} [POU: ${u.bop_process_name}] (Plafon: ${u.max_producible_units}/${scmGate.target_project_qty} unit, Disuplai: ${u.effective_supplied_qty}/${u.required_qty} ${u.uom}, Siap Kirim di Gudang: ${u.available_in_warehouse_to_issue} ${u.uom})`
        )
        .join(", ");

      const errMsg = scmGate.can_partial_wave_issue
        ? `Interlock SCM Point-of-Use [${targetStep.process_name}]: Terdapat stok di Gudang yang siap disuplai bertahap (Partial Wave) untuk [${missingList}]. Klik 'Supply Partial Wave dari Gudang' atau gunakan fitur 'Substitusi / Pasang Menyusul' untuk membuka plafon produksi!`
        : `Interlock SCM Point-of-Use [${targetStep.process_name}]: Kuota material untuk proses ini telah mencapai batas stok terkirim (${stepQuota?.max_producible_qty ?? 0}/${scmGate.target_project_qty} unit) karena [${missingList}]. Gunakan 'Substitusi Material Alternatif', 'Pasang Menyusul (Deferred Fitment)', atau ubah Point-of-Use agar proses tetap berjalan!`;

      return res.status(409).json({
        code: "SCM_MATERIAL_NOT_SUPPLIED",
        error: errMsg,
        reservation_gate_blocked: true,
        can_issue_from_warehouse: scmGate.can_issue_from_warehouse,
        can_partial_wave_issue: scmGate.can_partial_wave_issue,
        has_warehouse_shortage: scmGate.has_warehouse_shortage,
        scm_gate: scmGate,
        unreserved_items: blockingList,
        shortages: blockingList.map((u: any) => ({
          bom_id: u.bom_id,
          item_id: u.item_id,
          item_code: u.item_code,
          item_name: u.item_name || u.item_code,
          uom: u.uom,
          required_qty: Number(u.required_qty || 0),
          reserved_qty: Number(u.reserved_qty || 0) + Number(u.free_stock || 0),
          supplied_to_floor_qty: Number(u.effective_supplied_qty || 0),
          available_in_warehouse_to_issue: Number(u.available_in_warehouse_to_issue || 0),
          shortage_qty: Math.max(0, Number(u.required_qty || 0) - Number(u.effective_supplied_qty || 0)),
          bop_process_id: u.bop_process_id,
          bop_process_name: u.bop_process_name,
          max_producible_units: u.max_producible_units,
          scm_stage: u.scm_stage,
          pr_numbers: u.pr_numbers,
        })),
      });
    }

    // GATE 2: Machine Health & NDP Lockdown Interlock
    const targetMachineId = targetStep.assigned_machine_id || targetStep.machine_id;
    const activeStepNdp = db.prepare(`
      SELECT * FROM notice_to_down_processes
      WHERE status IN ('ACTIVE', 'OPEN', 'BLOCKED_PENDING_PROCUREMENT')
        AND (bop_id = ? OR (machine_id IS NOT NULL AND machine_id = ?) OR (affected_machine_id IS NOT NULL AND affected_machine_id = ?))
      LIMIT 1
    `).get(targetStep.id, targetMachineId || "__NONE__", targetMachineId || "__NONE__") as any;

    if (activeStepNdp) {
      return res.status(409).json({
        code: "MACHINE_NDP_LOCKDOWN",
        error: `Interlock Engineering (Mesin/Proses Down): Proses [${targetStep.process_name}] terkunci oleh NDP aktif [${activeStepNdp.ndp_code || activeStepNdp.ndp_number || activeStepNdp.reason_category}]. Selesaikan NDP atau lakukan Machine Reroute terlebih dahulu.`,
      });
    }

    const bomCheckRows = db.prepare(`
      SELECT b.item_id, b.required_qty, i.item_code, i.name as item_name,
             COALESCE(inv.free_stock, inv.available_qty, 0) as free_stock,
             (SELECT COALESCE(SUM(ir.qty), 0) FROM inventory_reservations ir WHERE ir.project_id = b.project_id AND ir.item_id = b.item_id AND ir.status IN ('ACTIVE', 'ISSUED', 'SUPPLIED', 'CONSUMED')) as reserved_qty
      FROM boms b
      JOIN items i ON b.item_id = i.id
      LEFT JOIN inventory inv ON b.item_id = inv.item_id
      WHERE b.project_id = ?
    `).all(effectiveProjectId) as any[];
    const unreservedItems = bomCheckRows.filter(
      (r) => Number(r.reserved_qty || 0) + Number(r.free_stock || 0) < Number(r.required_qty || 0)
    );

    const completedPreviousSteps: string[] = [];
    const rawWotBatchQty = Number(good_qty) > 0 ? Number(good_qty) : (Number(wot.qty) || 1);
    const remainingQuotaAtTarget = stepQuota
      ? Math.max(1, stepQuota.max_producible_qty - (Number(targetStep.completed_qty) || 0))
      : rawWotBatchQty;
    const wotBatchQty = Math.min(rawWotBatchQty, remainingQuotaAtTarget);
    const scrapUnits = Math.max(0, Number(scrap_qty) || 0);
    let orchestrationEvents: any[] = [];

    db.transaction(() => {
      // 1. Ensure Project is marked IN_PROGRESS upon first QR scan
      db.prepare(`
        UPDATE projects
        SET status = CASE WHEN status IN ('DRAFT', 'PLANNED', 'PENDING') THEN 'IN_PROGRESS' ELSE status END,
            start_date = COALESCE(start_date, date('now'))
        WHERE id = ?
      `).run(effectiveProjectId);

      // 1B. Auto-reserve any newly arrived Free Stock for BOM items that were not yet fully reserved
      for (const row of bomCheckRows) {
        const deficit = Math.max(0, Number(row.required_qty || 0) - Number(row.reserved_qty || 0));
        const availFree = Math.max(0, Number(row.free_stock || 0));
        if (deficit > 0 && availFree > 0) {
          const takeQty = Math.min(deficit, availFree);
          db.prepare(`
            UPDATE inventory
            SET free_stock = MAX(0, COALESCE(free_stock, 0) - ?),
                available_qty = MAX(0, COALESCE(available_qty, 0) - ?),
                allocated_stock = COALESCE(allocated_stock, 0) + ?,
                reserved_qty = COALESCE(reserved_qty, 0) + ?
            WHERE item_id = ?
          `).run(takeQty, takeQty, takeQty, takeQty, row.item_id);

          db.prepare(`
            INSERT INTO inventory_reservations (id, item_id, project_id, spk_id, qty, status)
            VALUES (?, ?, ?, ?, ?, 'ACTIVE')
          `).run(
            `RES-WOT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
            row.item_id,
            effectiveProjectId,
            wot.wot_number,
            takeQty
          );
        }
      }

      // 2. Automatically complete all predecessor steps before targetIdx
      for (let i = 0; i < targetIdx; i++) {
        const prevStep = allSteps[i];
        if (prevStep.status !== "COMPLETED") {
          const newCompletedQty = Math.min(
            Number(prevStep.target_qty) || 999999,
            (Number(prevStep.completed_qty) || 0) + wotBatchQty
          );
          db.prepare(`
            UPDATE bill_of_processes
            SET status = 'COMPLETED',
                progress = 100,
                completed_qty = CASE WHEN completed_qty < ? THEN ? ELSE completed_qty END,
                actual_start_date = COALESCE(actual_start_date, CURRENT_TIMESTAMP),
                actual_end_date = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(wotBatchQty, newCompletedQty, prevStep.id);

          completedPreviousSteps.push(prevStep.process_name);

          try {
            db.prepare(`
              INSERT INTO wot_history (id, wot_id, project_id, process_id, station_id, operator_name, completed_at, qty, scrap_qty, notes)
              VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
            `).run(
              crypto.randomUUID(),
              wot.id,
              effectiveProjectId,
              prevStep.id,
              prevStep.station_id || null,
              actor,
              wotBatchQty,
              scrapUnits,
              `Auto-completed via downstream WOT QR scan at ${targetStep.process_name}`
            );
          } catch (e) {}
        }
      }

      // 3. Start the Target Step via QR Scan
      db.prepare(`
        UPDATE bill_of_processes
        SET status = 'RUNNING',
            actual_start_date = COALESCE(actual_start_date, CURRENT_TIMESTAMP),
            last_scanned_wot_id = ?,
            last_scanned_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(wot.id, targetStep.id);

      // 4. Update the WOT record
      let progressMap: Record<string, number> = {};
      try {
        progressMap = wot.process_progress_json ? JSON.parse(wot.process_progress_json) : {};
      } catch (e) {
        progressMap = {};
      }
      for (let i = 0; i < targetIdx; i++) {
        progressMap[allSteps[i].id] = wotBatchQty;
      }

      db.prepare(`
        UPDATE work_order_tickets
        SET current_bop_id = ?,
            bop_id = ?,
            station_id = COALESCE(?, station_id),
            current_station_id = COALESCE(?, current_station_id),
            machine_id = COALESCE(?, machine_id),
            status = 'IN_PROGRESS',
            process_progress_json = ?,
            good_units = ?,
            reject_units = COALESCE(reject_units, 0) + ?,
            last_scanned_at = CURRENT_TIMESTAMP,
            last_scanned_by = ?,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        targetStep.id,
        targetStep.id,
        targetStep.station_id || null,
        targetStep.station_id || null,
        targetStep.assigned_machine_id || null,
        JSON.stringify(progressMap),
        wotBatchQty,
        scrapUnits,
        actor,
        wot.id
      );

      // 5. Log to wot_travel_logs
      try {
        db.prepare(`
          INSERT INTO wot_travel_logs (
            id, wot_id, event_type, station_id, process_id, machine_id, user_name, timestamp, metadata
          ) VALUES (?, ?, 'SCAN_START', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        `).run(
          `WTL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          wot.id,
          targetStep.station_id || "UNASSIGNED",
          targetStep.id,
          targetStep.assigned_machine_id || null,
          actor,
          JSON.stringify({
            project_id: effectiveProjectId,
            qty_good: wotBatchQty,
            qty_ng: scrapUnits,
            notes: notes || (completedPreviousSteps.length > 0
              ? `QR Scan started "${targetStep.process_name}" & completed predecessor: ${completedPreviousSteps.join(", ")}`
              : `QR Scan started initial process "${targetStep.process_name}"`)
          })
        );
      } catch (e) {}

      // 6. Execute 3-Phase Station Operator Auto-Orchestration upon QR scan
      try {
        orchestrationEvents = runStationAutoOrchestration(effectiveProjectId, targetStep.station_id || undefined, actor);
      } catch (e) {}
    })();

    emitProductionUpdate("WOT_SCANNED", {
      project_id: effectiveProjectId,
      wot_id: wot.id,
      wot_number: wot.wot_number,
      target_bop_id: targetStep.id,
      target_process_name: targetStep.process_name,
      completed_previous_steps: completedPreviousSteps,
      orchestration_events: orchestrationEvents,
      operator: actor,
    });

    res.json({
      ok: true,
      wot_id: wot.id,
      wot_number: wot.wot_number,
      started_process: {
        id: targetStep.id,
        name: targetStep.process_name,
        step_sequence: targetStep.step_sequence,
      },
      completed_previous_steps: completedPreviousSteps,
      orchestration_events: orchestrationEvents,
      reservation_warning:
        unreservedItems.length > 0
          ? `${unreservedItems.length} BOM item(s) have active procurement shortages.`
          : null,
      message: completedPreviousSteps.length > 0
        ? `WOT ${wot.wot_number} scanned: Completed [${completedPreviousSteps.join(", ")}] & started [${targetStep.process_name}].`
        : `WOT ${wot.wot_number} scanned: Project & process [${targetStep.process_name}] started!`,
    });
  } catch (err: any) {
    console.error("Error in WOT QR scan transition:", err);
    res.status(500).json({ error: err.message || "Failed to process WOT QR scan" });
  }
});



// Helper: Resolve effective station key for a BOP step using project_stations (no hardcoded STN-01)
export function resolveStepStationKey(step: any, projectStations: any[]): string {
  const raw = step?.station_id ? String(step.station_id).trim() : "";
  if (raw) {
    const matched = projectStations.find((ps) => ps.id === raw || ps.station_code === raw);
    if (matched) return matched.id;
    return raw;
  }
  if (projectStations.length > 0) {
    return projectStations[0].id;
  }
  return "UNASSIGNED";
}

// Helper: Run 3-Phase Intra-Station Operator Orchestrator
export function runStationAutoOrchestration(projectId: string, stationId?: string, actor = "Auto-Orchestrator") {
  const projectStations = db.prepare(`
    SELECT * FROM project_stations
    WHERE project_id = ?
       OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
       OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
    ORDER BY station_sequence ASC, station_code ASC
  `).all(projectId, projectId, projectId) as any[];

  const allSteps = db.prepare(`
    SELECT * FROM bill_of_processes
    WHERE project_id = ?
      AND (node_type IS NULL OR UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END'))
    ORDER BY step_sequence ASC
  `).all(projectId) as any[];

  const matchesTargetStation = (s: any, targetStId: string) => {
    const resolved = resolveStepStationKey(s, projectStations);
    if (resolved === targetStId || s.station_id === targetStId) return true;
    const stObj = projectStations.find((ps) => ps.id === targetStId || ps.station_code === targetStId);
    if (stObj && (s.station_id === stObj.id || s.station_id === stObj.station_code || resolved === stObj.id)) {
      return true;
    }
    return false;
  };

  const stationSteps = stationId
    ? allSteps.filter((s) => matchesTargetStation(s, stationId))
    : allSteps;

  const wots = db.prepare(`
    SELECT * FROM work_order_tickets WHERE project_id = ? ORDER BY created_at ASC
  `).all(projectId) as any[];

  const activeNdps = db.prepare(`
    SELECT * FROM notice_to_down_processes WHERE project_id = ? AND status = 'ACTIVE'
  `).all(projectId) as any[];

  const orchestrationEvents: Array<{
    phase: "PHASE_1_PRIORITY_MERGE" | "PHASE_2_WORK_STEAL" | "PHASE_3_AUTO_SWITCH";
    operator: string;
    from_process?: string;
    to_process: string;
    station_id: string;
    reason: string;
  }> = [];

  // Group steps by resolved station key
  const stationGroups: Record<string, any[]> = {};
  stationSteps.forEach((st) => {
    const key = resolveStepStationKey(st, projectStations);
    if (!stationGroups[key]) stationGroups[key] = [];
    stationGroups[key].push(st);
  });

  for (const [stId, stepsInStation] of Object.entries(stationGroups)) {
    const stationMeta = projectStations.find((ps) => ps.id === stId || ps.station_code === stId);
    const stationCodeLabel = stationMeta?.station_code || stId;

    // Parse eligible operators per step or synthesize station pool
    const stationOperatorPool = new Set<string>();
    const stepEligibleMap: Record<string, string[]> = {};

    stepsInStation.forEach((s) => {
      let elig: string[] = [];
      try {
        elig = s.eligible_operators_json ? JSON.parse(s.eligible_operators_json) : [];
      } catch (e) {
        elig = [];
      }
      if (!Array.isArray(elig) || elig.length === 0) {
        const suffix = stationCodeLabel.replace(/[^A-Z0-9]/gi, "").slice(-2) || "01";
        elig = [`OP-${suffix}-A`, `OP-${suffix}-B`];
      }
      stepEligibleMap[s.id] = elig;
      elig.forEach((op) => stationOperatorPool.add(op));
    });

    // Determine which steps have ready WIP (Rule 11.1 intra-station >= 1 unit OR Rule 11.2 inter-station WOT ready)
    // Governed by Point-of-Use & Wave Quota Ceiling per BOP step
    const scmGateForOrch = evaluateProjectScmSupplyGate(projectId);
    const stepWipReady: Record<string, { ready: boolean; isMerge: boolean; backlogUnits: number }> = {};

    stepsInStation.forEach((s) => {
      let preds: string[] = [];
      try {
        preds = typeof s.predecessor_ids === "string" ? JSON.parse(s.predecessor_ids || "[]") : (s.predecessor_ids || []);
      } catch (e) {}

      const isMerge = preds.length > 1;
      const hasActiveNdp = activeNdps.some((n) => n.bop_id === s.id);
      const stepQuota = scmGateForOrch.process_producible_quotas?.[s.id];
      const isPouUnlocked = stepQuota ? stepQuota.is_pou_unlocked : scmGateForOrch.all_supplied_to_floor;
      if (!isPouUnlocked || hasActiveNdp || s.status === "COMPLETED" || s.is_manual_pause) {
        stepWipReady[s.id] = { ready: false, isMerge, backlogUnits: 0 };
        return;
      }

      const maxTargetUnderWave = stepQuota
        ? stepQuota.max_producible_qty
        : wots.reduce((acc, w) => acc + (Number(w.qty) || 10), 0) || 100;

      if (preds.length === 0) {
        const done = Number(s.completed_qty) || 0;
        stepWipReady[s.id] = {
          ready: done < maxTargetUnderWave,
          isMerge: false,
          backlogUnits: Math.max(0, maxTargetUnderWave - done),
        };
      } else {
        let allPredsSatisfied = true;
        let minAvailableFromPreds = Infinity;

        for (const pid of preds) {
          const predStep = allSteps.find((ps) => ps.id === pid);
          if (!predStep) continue;
          const sameStation = resolveStepStationKey(predStep, projectStations) === stId;
          const predDone = Number(predStep.completed_qty) || 0;
          const wotLotSize = Number(wots[0]?.qty) || 10;

          let predHasMandatoryQcGate = String(predStep.node_type || "").toUpperCase() === "PRODUCT";
          if (!predHasMandatoryQcGate && predStep.qc_parameters_json) {
            try {
              const qp = JSON.parse(predStep.qc_parameters_json);
              if (Array.isArray(qp) && qp.some((p: any) => p && p.is_mandatory_gate !== false)) {
                predHasMandatoryQcGate = true;
              }
            } catch (_) {}
          }

          if (predHasMandatoryQcGate) {
            // Mandatory IPQC / FQC Hold Gate: Downstream process is strictly locked until QC inspection is COMPLETED
            if (predStep.status !== "COMPLETED") {
              allPredsSatisfied = false;
            }
            minAvailableFromPreds = Math.min(
              minAvailableFromPreds,
              predStep.status === "COMPLETED" ? Math.max(wotLotSize, predDone) : 0
            );
          } else if (sameStation) {
            if (predDone < 1 && predStep.status !== "COMPLETED") {
              allPredsSatisfied = false;
            }
            minAvailableFromPreds = Math.min(minAvailableFromPreds, predDone);
          } else {
            const hasTransferredWot =
              predDone >= wotLotSize ||
              predStep.status === "COMPLETED" ||
              wots.some((w) => w.status === "TRANSFERRED" || w.status === "COMPLETED" || w.current_bop_id === s.id);
            if (!hasTransferredWot) {
              allPredsSatisfied = false;
            }
            minAvailableFromPreds = Math.min(minAvailableFromPreds, predDone);
          }
        }

        const myDone = Number(s.completed_qty) || 0;
        const availBacklog = Math.max(0, (minAvailableFromPreds === Infinity ? 10 : minAvailableFromPreds) - myDone);
        stepWipReady[s.id] = {
          ready: allPredsSatisfied && availBacklog > 0,
          isMerge,
          backlogUnits: availBacklog,
        };
      }
    });

    const prioritizedSteps = [...stepsInStation].sort((a, b) => {
      const infoA = stepWipReady[a.id];
      const infoB = stepWipReady[b.id];
      if (infoA?.isMerge !== infoB?.isMerge) return infoA?.isMerge ? -1 : 1;
      return (infoB?.backlogUnits || 0) - (infoA?.backlogUnits || 0);
    });

    for (const step of prioritizedSteps) {
      const wip = stepWipReady[step.id];
      if (wip?.ready && step.status !== "RUNNING" && !step.is_manual_pause) {
        const eligibleOps = stepEligibleMap[step.id] || Array.from(stationOperatorPool);
        const chosenOp = eligibleOps[0] || "OP-AUTO";
        const phaseType = wip.isMerge
          ? "PHASE_1_PRIORITY_MERGE"
          : step.step_sequence === 1
          ? "PHASE_3_AUTO_SWITCH"
          : "PHASE_2_WORK_STEAL";

        db.prepare(`
          UPDATE bill_of_processes
          SET status = 'RUNNING',
              actual_start_date = COALESCE(actual_start_date, CURRENT_TIMESTAMP),
              manpower_count = MAX(1, COALESCE(manpower_count, 1))
          WHERE id = ?
        `).run(step.id);

        orchestrationEvents.push({
          phase: phaseType,
          operator: chosenOp,
          to_process: step.process_name,
          station_id: stationCodeLabel,
          reason: wip.isMerge
            ? `Phase 1 Priority Merge Gate: Assigned ${chosenOp} to ${step.process_name} (All predecessor branches ready)`
            : phaseType === "PHASE_2_WORK_STEAL"
            ? `Phase 2 Work Stealing: Routed ${chosenOp} to ${step.process_name} (${wip.backlogUnits} WIP units ready in station)`
            : `Phase 3 Auto-Switch: Cycled ${chosenOp} to upstream process ${step.process_name}`,
        });
      }
    }
  }

  return orchestrationEvents;
}

// 0. GET Station Orchestration Clusters for StationClusteredConveyorBoard
assemblyRouter.get("/api/production/projects/:id/station-orchestration", (req, res) => {
  try {
    const { id } = req.params;
    const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as any;
    const projectStations = db.prepare(`
      SELECT * FROM project_stations
      WHERE project_id = ?
         OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
         OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
      ORDER BY station_sequence ASC, station_code ASC
    `).all(id, id, id) as any[];

    const allSteps = db.prepare(`
      SELECT * FROM bill_of_processes
      WHERE project_id = ?
        AND (node_type IS NULL OR UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END'))
      ORDER BY step_sequence ASC
    `).all(id) as any[];

    const wots = db.prepare(`
      SELECT * FROM work_order_tickets WHERE project_id = ? ORDER BY created_at ASC
    `).all(id) as any[];

    const activeNdps = db.prepare(`
      SELECT * FROM notice_to_down_processes WHERE project_id = ? AND status = 'ACTIVE'
    `).all(id) as any[];

    const targetQty = Math.max(1, Number(project?.qty) || 100);
    const groupedMap = new Map<string, { station: any; steps: any[] }>();

    projectStations.forEach((st, idx) => {
      groupedMap.set(st.id, {
        station: {
          station_id: st.id,
          station_code: st.station_code || `STN-${String(idx + 1).padStart(2, "0")}`,
          station_name: st.station_name || st.station_code || `Station ${idx + 1}`,
          station_sequence: Number(st.station_sequence) || idx + 1,
        },
        steps: [],
      });
    });

    allSteps.forEach((step) => {
      const rawStId = step.station_id ? String(step.station_id).trim() : "";
      let matchedKey: string | null = null;
      for (const [k, val] of groupedMap.entries()) {
        if (k === rawStId || val.station.station_code === rawStId) {
          matchedKey = k;
          break;
        }
      }
      if (!matchedKey && rawStId) {
        matchedKey = rawStId;
        groupedMap.set(rawStId, {
          station: {
            station_id: rawStId,
            station_code: rawStId,
            station_name: step.station_name || rawStId,
            station_sequence: groupedMap.size + 1,
          },
          steps: [],
        });
      } else if (!matchedKey) {
        const firstKey = Array.from(groupedMap.keys())[0];
        if (firstKey) {
          matchedKey = firstKey;
        } else {
          matchedKey = "UNASSIGNED";
          if (!groupedMap.has("UNASSIGNED")) {
            groupedMap.set("UNASSIGNED", {
              station: {
                station_id: "UNASSIGNED",
                station_code: "UNASSIGNED",
                station_name: "Unassigned Workstation",
                station_sequence: 99,
              },
              steps: [],
            });
          }
        }
      }
      groupedMap.get(matchedKey!)!.steps.push(step);
    });

    const stationClusters = Array.from(groupedMap.values())
      .filter((g) => g.steps.length > 0)
      .sort((a, b) => a.station.station_sequence - b.station.station_sequence)
      .map((g, sIdx, arr) => {
        const stId = g.station.station_id;
        const stCode = g.station.station_code;
        const stationOps = new Set<string>();
        const activeOps = new Set<string>();

        const enrichedProcesses = g.steps.map((step, pIdx) => {
          let eligOps: string[] = [];
          try {
            eligOps = step.eligible_operators_json ? JSON.parse(step.eligible_operators_json) : [];
          } catch (e) {}
          eligOps.forEach((op) => stationOps.add(op));
          if (step.status === "RUNNING") {
            eligOps.forEach((op) => activeOps.add(op));
          }

          let preds: string[] = [];
          try {
            preds = typeof step.predecessor_ids === "string" ? JSON.parse(step.predecessor_ids || "[]") : (step.predecessor_ids || []);
          } catch (e) {}

          const stepNdps = activeNdps.filter((n) => n.bop_id === step.id);
          const prevInStation = pIdx > 0 ? g.steps[pIdx - 1] : null;
          const prevCompletedUnits = prevInStation
            ? Number(prevInStation.completed_qty) || 0
            : targetQty;
          const myCompletedUnits = Number(step.completed_qty) || 0;
          const intraStationWipAvailable =
            pIdx === 0 ? Math.max(0, targetQty - myCompletedUnits) : Math.max(0, prevCompletedUnits - myCompletedUnits);
          const isUnlockedBy1PieceFlow =
            pIdx === 0 || (Number(prevInStation?.completed_qty) || 0) >= 1 || prevInStation?.status === "COMPLETED";

          return {
            ...step,
            station_id: stId,
            station_code: stCode,
            eligible_operators: eligOps,
            predecessor_ids: preds,
            is_merge_node: preds.length > 1,
            active_ndps: stepNdps,
            intra_station_wip_available: intraStationWipAvailable,
            is_unlocked_by_1pc_flow: isUnlockedBy1PieceFlow,
          };
        });

        const allDone = enrichedProcesses.every((p) => p.status === "COMPLETED");
        const anyRunning = enrichedProcesses.some((p) => p.status === "RUNNING");
        const anyPaused = enrichedProcesses.some((p) => p.status === "PAUSED");
        const stationStatus = allDone ? "COMPLETED" : anyRunning ? "RUNNING" : anyPaused ? "PAUSED" : "READY";

        const prevCluster = sIdx > 0 ? arr[sIdx - 1] : null;
        const completedWotsInThisStation = wots.filter(
          (w) =>
            w.status === "COMPLETED" ||
            (w.status === "TRANSFERRED" &&
              (w.source_station_id === stId || w.source_station_id === stCode || w.station_id !== stId))
        ).length;
        const interStationGateUnlocked =
          sIdx === 0 ||
          wots.some(
            (w) =>
              w.station_id === stId ||
              w.station_id === stCode ||
              w.target_station_id === stId ||
              w.target_station_id === stCode ||
              w.status === "COMPLETED"
          ) ||
          (prevCluster
            ? prevCluster.steps.every((ps: any) => (Number(ps.completed_qty) || 0) >= (Number(project?.lot_size) || 10))
            : true);

        // Build structured operators list for StationClusteredConveyorBoard
        const operatorNames = Array.from(stationOps);
        if (operatorNames.length === 0) {
          operatorNames.push(`OP-${stCode}-01`);
        }
        const structuredOperators = operatorNames.map((opName, opIdx) => {
          const runningProc = enrichedProcesses.find(
            (p) => p.status === "RUNNING" && (p.eligible_operators?.includes(opName) || opIdx === 0)
          );
          const isBusy = Boolean(runningProc);
          const reason = runningProc?.is_merge_node
            ? "PRIORITY_MERGE"
            : runningProc && runningProc.step_sequence > 1
            ? "WORK_STEAL"
            : runningProc
            ? "AUTO_SWITCH"
            : "INITIAL_ASSIGN";
          return {
            operator_id: `OP-${stId}-${opIdx + 1}`,
            operator_name: opName,
            status: isBusy ? "BUSY" : "IDLE",
            orchestration_reason: reason,
            current_process_id: runningProc?.id || null,
          };
        });

        // Build Digital Shadow Board WOT buckets for this station
        const stationStepIds = enrichedProcesses.map((p) => p.id);
        const hasStationNdp = enrichedProcesses.some((p) => (p.active_ndps?.length || 0) > 0);
        const shadowBoard = {
          to_do: wots.filter(
            (w) =>
              (w.status === "PENDING" || w.status === "QUEUED" || w.status === "TRANSFERRED") &&
              (sIdx === 0 || w.station_id === stId || w.station_id === stCode || w.target_station_id === stId)
          ),
          doing: wots.filter(
            (w) =>
              w.status === "IN_PROGRESS" &&
              !hasStationNdp &&
              (stationStepIds.includes(w.current_bop_id || w.bop_id) || w.station_id === stId || w.station_id === stCode)
          ),
          done: wots.filter((w) => {
            if (w.status === "COMPLETED") return true;
            try {
              const prog = w.process_progress_json ? JSON.parse(w.process_progress_json) : {};
              return stationStepIds.length > 0 && stationStepIds.every((sid) => (Number(prog[sid]) || 0) >= (Number(w.qty) || 1));
            } catch (e) {
              return false;
            }
          }),
          blocked: hasStationNdp
            ? wots.filter(
                (w) =>
                  w.status !== "COMPLETED" &&
                  (stationStepIds.includes(w.current_bop_id || w.bop_id) || w.station_id === stId || w.station_id === stCode)
              )
            : [],
        };

        return {
          ...g.station,
          status: stationStatus,
          total_operators_pool: Array.from(stationOps),
          active_operators_pool: Array.from(activeOps),
          operators: structuredOperators,
          shadow_board: shadowBoard,
          processes: enrichedProcesses,
          completed_wots_count: completedWotsInThisStation,
          inter_station_gate_unlocked: interStationGateUnlocked,
          next_station_id: sIdx + 1 < arr.length ? arr[sIdx + 1].station.station_id : null,
          next_station_name: sIdx + 1 < arr.length ? arr[sIdx + 1].station.station_name : "Finished Goods Inbound",
        };
      });

    res.json({ ok: true, station_clusters: stationClusters });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Single "Start Production" Station Trigger & 3-Phase Auto-Orchestration
assemblyRouter.post(
  [
    "/api/production/projects/:id/stations/:stationId/start-production",
    "/api/production/projects/:id/stations/:stationId/orchestrate",
  ],
  (req, res) => {
    try {
      const { id, stationId } = req.params;
      const { supervisor_override } = req.body || {};
      const actor = getActor(req) || "Shop Floor Supervisor";
      const isOrchestrateOnly = req.path.endsWith("/orchestrate");

      const projectStations = db.prepare(`
        SELECT * FROM project_stations
        WHERE project_id = ?
           OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
           OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
        ORDER BY station_sequence ASC, station_code ASC
      `).all(id, id, id) as any[];

      const matchedStationRow = projectStations.find(
        (ps) => ps.id === stationId || ps.station_code === stationId
      );

      const allProjectSteps = db.prepare(`
        SELECT * FROM bill_of_processes
        WHERE project_id = ?
          AND (node_type IS NULL OR UPPER(node_type) NOT IN ('PRODUCT', 'START', 'END'))
        ORDER BY step_sequence ASC
      `).all(id) as any[];

      const stepsInStation = allProjectSteps.filter((s) => {
        const resolved = resolveStepStationKey(s, projectStations);
        return (
          s.station_id === stationId ||
          resolved === stationId ||
          (matchedStationRow &&
            (s.station_id === matchedStationRow.id ||
              s.station_id === matchedStationRow.station_code ||
              resolved === matchedStationRow.id))
        );
      });

      if (stepsInStation.length === 0) {
        return res.status(404).json({ error: `No BOP processes found in station ${stationId}` });
      }

      if (isOrchestrateOnly) {
        const orchestrationEvents = runStationAutoOrchestration(id, stationId, actor);
        emitProductionUpdate("PROCESS_CONTROL_UPDATED", {
          project_id: id,
          station_id: stationId,
          action: "ORCHESTRATE",
          orchestration_events: orchestrationEvents,
        });
        return res.json({
          ok: true,
          station_id: stationId,
          orchestration_events: orchestrationEvents,
          message: `Executed 3-Phase Station Operator Auto-Orchestration (${orchestrationEvents.length} transition(s)).`,
        });
      }

      // Gate 1: Point-of-Use & Wave Quota Check before starting station production
      const scmGate = evaluateProjectScmSupplyGate(id);
      const entryStep = stepsInStation[0];
      const entryQuota = entryStep ? scmGate.process_producible_quotas?.[entryStep.id] : null;
      const canStartStationUnderPou = entryQuota ? entryQuota.is_pou_unlocked : scmGate.all_supplied_to_floor;
      if (!canStartStationUnderPou) {
        const blocking = entryQuota?.blocking_items || scmGate.items.filter((i) => i.scm_stage !== "SUPPLIED_TO_FLOOR");
        return res.status(409).json({
          code: "SCM_MATERIAL_NOT_SUPPLIED",
          error: scmGate.can_partial_wave_issue
            ? `Interlock SCM Point-of-Use: Material stasiun tersedia di Gudang untuk disuplai bertahap (Partial Wave). Klik 'Supply Partial Wave dari Gudang' terlebih dahulu!`
            : `Interlock SCM Point-of-Use: Stasiun ini membutuhkan ${blocking.length} material BOM yang belum disuplai ke lantai produksi. Gunakan 'Substitusi Material' atau 'Pasang Menyusul' untuk melanjutkan.`,
          scm_gate: scmGate,
        });
      }

      // Check active NDPs in this station
      const stepIds = stepsInStation.map((s) => s.id);
      const activeNdp = db.prepare(`
        SELECT * FROM notice_to_down_processes
        WHERE project_id = ? AND status = 'ACTIVE' AND bop_id IN (${stepIds.map(() => "?").join(",")})
        LIMIT 1
      `).get(id, ...stepIds) as any;

      if (activeNdp && !supervisor_override) {
        return res.status(409).json({
          error: `Station ${matchedStationRow?.station_code || stationId} has an active NDP [${activeNdp.ndp_code || activeNdp.reason_category}] on process. Resolve the NDP before starting station production.`,
        });
      }

      const wots = db.prepare(`SELECT * FROM work_order_tickets WHERE project_id = ? ORDER BY created_at ASC`).all(id) as any[];
      const canonicalStationId = matchedStationRow?.id || stationId;

      let orchestrationEvents: any[] = [];
      db.transaction(() => {
        db.prepare(`
          UPDATE projects
          SET status = CASE WHEN status IN ('DRAFT', 'PLANNED', 'PENDING') THEN 'IN_PROGRESS' ELSE status END,
              start_date = COALESCE(start_date, date('now'))
          WHERE id = ?
        `).run(id);

        // Start the entry process(es) of this station immediately
        const firstStationStep = stepsInStation[0];
        db.prepare(`
          UPDATE bill_of_processes
          SET status = 'RUNNING',
              is_manual_pause = 0,
              actual_start_date = COALESCE(actual_start_date, CURRENT_TIMESTAMP)
          WHERE id = ?
        `).run(firstStationStep.id);

        // Ensure at least 1 WOT is active at this station
        const queuedWot =
          wots.find((w) => (w.station_id === canonicalStationId || w.station_id === stationId) && w.status !== "COMPLETED") ||
          wots.find((w) => w.status === "TRANSFERRED" || w.status === "PENDING" || w.status === "QUEUED") ||
          wots[0];

        if (queuedWot) {
          db.prepare(`
            UPDATE work_order_tickets
            SET status = 'IN_PROGRESS',
                current_bop_id = ?,
                bop_id = ?,
                station_id = ?,
                current_station_id = ?,
                started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(firstStationStep.id, firstStationStep.id, canonicalStationId, canonicalStationId, queuedWot.id);
        }

        orchestrationEvents = runStationAutoOrchestration(id, canonicalStationId, actor);
      })();

      invalidatePlanningCache();
      emitProductionUpdate("STATION_PRODUCTION_STARTED", {
        project_id: id,
        station_id: canonicalStationId,
        orchestration_events: orchestrationEvents,
      });

      res.json({
        ok: true,
        station_id: canonicalStationId,
        orchestration_events: orchestrationEvents,
        message: `Station ${matchedStationRow?.station_code || stationId} production started with 3-Phase Operator Auto-Orchestration.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// 2. Granular Pause / Continue for Station or Individual Process
assemblyRouter.post(
  ["/api/production/projects/:id/process-control", "/api/production/projects/:id/station-control"],
  (req, res) => {
    try {
      const { id } = req.params;
      const { bop_id, station_id, action, reason } = req.body; // action: 'PAUSE' | 'CONTINUE' | 'ORCHESTRATE'
      const actor = getActor(req) || "Supervisor";

      const projectStations = db.prepare(`
        SELECT * FROM project_stations
        WHERE project_id = ?
           OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
           OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
      `).all(id, id, id) as any[];
      const matchedSt = station_id
        ? projectStations.find((ps) => ps.id === station_id || ps.station_code === station_id)
        : null;

      let orchestrationEvents: any[] = [];

      db.transaction(() => {
        if (action === "PAUSE") {
          if (bop_id) {
            db.prepare(`
              UPDATE bill_of_processes
              SET status = 'PAUSED', is_manual_pause = 1
              WHERE id = ? AND project_id = ?
            `).run(bop_id, id);
          } else if (station_id) {
            db.prepare(`
              UPDATE bill_of_processes
              SET status = 'PAUSED', is_manual_pause = 1
              WHERE project_id = ? AND (station_id = ? OR station_id = ? OR station_id = ?) AND status = 'RUNNING'
            `).run(id, station_id, matchedSt?.id || station_id, matchedSt?.station_code || station_id);
          }
          orchestrationEvents = runStationAutoOrchestration(id, station_id, actor);
        } else if (action === "CONTINUE") {
          if (bop_id) {
            const activeNdp = db.prepare(`
              SELECT * FROM notice_to_down_processes WHERE bop_id = ? AND status = 'ACTIVE'
            `).get(bop_id) as any;
            if (activeNdp) {
              throw new Error(`Cannot continue process while NDP [${activeNdp.ndp_code || activeNdp.reason_category}] is active.`);
            }
            db.prepare(`
              UPDATE bill_of_processes
              SET status = 'RUNNING', is_manual_pause = 0, actual_start_date = COALESCE(actual_start_date, CURRENT_TIMESTAMP)
              WHERE id = ? AND project_id = ?
            `).run(bop_id, id);
          } else if (station_id) {
            db.prepare(`
              UPDATE bill_of_processes
              SET status = 'RUNNING', is_manual_pause = 0, actual_start_date = COALESCE(actual_start_date, CURRENT_TIMESTAMP)
              WHERE project_id = ? AND (station_id = ? OR station_id = ? OR station_id = ?) AND status = 'PAUSED'
            `).run(id, station_id, matchedSt?.id || station_id, matchedSt?.station_code || station_id);
          }
          orchestrationEvents = runStationAutoOrchestration(id, station_id, actor);
        } else if (action === "ORCHESTRATE") {
          orchestrationEvents = runStationAutoOrchestration(id, station_id, actor);
        }
      })();

      emitProductionUpdate("PROCESS_CONTROL_UPDATED", {
        project_id: id,
        bop_id,
        station_id,
        action,
        orchestration_events: orchestrationEvents,
      });

      res.json({
        ok: true,
        action,
        orchestration_events: orchestrationEvents,
        message:
          action === "PAUSE"
            ? `Paused ${bop_id ? "process" : `station ${matchedSt?.station_code || station_id}`} & re-orchestrated available operators.`
            : action === "CONTINUE"
            ? `Resumed ${bop_id ? "process" : `station ${matchedSt?.station_code || station_id}`} execution.`
            : `Executed 3-Phase Station Operator Auto-Orchestration (${orchestrationEvents.length} transition(s)).`,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

