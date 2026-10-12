import { Router } from "express";
import db from "../../db/database.ts";
import { logAudit } from "../../utils/audit.ts";
import { requireRole, getActor } from "../../middleware/auth.ts";
import { simulateMultiProjectSchedule } from "../../utils/scheduleEngineV2.ts";
import type { CapacityProfile, ProcessNodeV2, MaterialGate } from "../../utils/scheduleEngineV2.ts";

export const commandCenterRouter = Router();

// ==========================================
// 1. Production Command Center Unified Hub (FR-1)
// ==========================================
commandCenterRouter.get("/api/production/command-center", (req, res) => {
  try {
    // A. Fetch Active Projects with Process Graph
    const activeProjects = db.prepare(`
      SELECT id, name, spk_number, customer, due_date, status, factory_factor, priority
      FROM projects
      WHERE status NOT IN ('COMPLETED', 'FINISHED', 'CLOSED', 'CANCELLED')
      ORDER BY due_date ASC
    `).all() as any[];

    // B. Fetch Bill of Processes for Active Projects
    const bopRows = db.prepare(`
      SELECT b.*, s.station_name, s.station_code, i.name as machine_name, i.item_code as machine_code
      FROM bill_of_processes b
      LEFT JOIN stations s ON b.station_id = s.id
      LEFT JOIN items i ON (b.assigned_machine_id = i.id OR b.machine_id = i.id)
      WHERE b.project_id IN (${activeProjects.map(() => "?").join(",") || "''"})
      ORDER BY b.step_sequence ASC
    `).all(...activeProjects.map((p) => p.id)) as any[];

    // C. Fetch Material Readiness / Wave Gates
    const materialGates: MaterialGate[] = [];
    try {
      const gates = db.prepare(`
        SELECT mr.*, i.name as item_name
        FROM material_readiness mr
        LEFT JOIN items i ON mr.item_id = i.id
      `).all() as any[];
      for (const g of gates) {
        materialGates.push({
          processId: g.process_id,
          itemId: g.item_id,
          itemName: g.item_name || "Material",
          requiredQty: g.required_qty,
          readyQty: g.ready_qty,
          isReady: g.ready_qty >= g.required_qty,
          materialReadyAt: g.material_ready_at,
          waveId: g.source_wave_id,
        });
      }
    } catch (_) {}

    // D. Fetch Active Line Stops
    const activeLineStops = db.prepare(`
      SELECT * FROM stop_line_events WHERE status = 'ACTIVE'
    `).all() as any[];

    // E. Run Multi-Project Simulation Engine v2
    const mappedProjects = activeProjects.map((proj) => {
      const procs = bopRows
        .filter((b) => b.project_id === proj.id)
        .map((b) => {
          let predIds: string[] = [];
          try {
            predIds = JSON.parse(b.predecessor_ids || "[]");
          } catch (_) {}
          return {
            id: b.id,
            projectId: proj.id,
            projectName: proj.name,
            spkNumber: proj.spk_number,
            stepSequence: b.step_sequence || 1,
            processName: b.process_name || `Step ${b.step_sequence}`,
            stationId: b.station_id || "ST-01",
            stationName: b.station_name || "General Station",
            machineId: b.assigned_machine_id || b.machine_id,
            machineCode: b.machine_code || "MC-01",
            machineName: b.machine_name || "Standard Machine",
            cycleTimeMinutes: b.cycle_time_minutes || 2,
            setupTimeMinutes: b.setup_time_minutes || 0,
            scrapRate: b.scrap_rate || 0.02,
            manpowerRequired: b.manpower_allocated || 1,
            targetQty: proj.qty || 100,
            predecessorIds: predIds,
            status: b.status,
          } as ProcessNodeV2;
        });

      return {
        id: proj.id,
        name: proj.name,
        spkNumber: proj.spk_number,
        dueDate: proj.due_date || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
        factoryFactor: proj.factory_factor || 85,
        priority: proj.priority || 3,
        processes: procs,
      };
    });

    const activeProfile: CapacityProfile = {
      id: "DEFAULT_PROFILE",
      name: "Normal 8h Shift",
      hoursPerDay: 8,
      shiftStartHour: 8,
      shiftEndHour: 17,
      workOnSaturday: false,
      extraShiftCount: 0,
    };

    const simResult = simulateMultiProjectSchedule({
      projects: mappedProjects,
      materialGates,
      capacityProfile: activeProfile,
      activeLineStops: activeLineStops.map((s) => ({ stationId: s.station_id, resumeAt: s.est_resume_at })),
    });

    // F. Fetch Active WIP / WOT from task_travel_tags & production_lots
    const wotList = db.prepare(`
      SELECT 
        tt.id as tag_id,
        tt.tag_number,
        tt.project_id,
        p.name as project_name,
        p.spk_number,
        tt.bop_id,
        bop.process_name,
        bop.step_sequence,
        COALESCE(bop.station_id, s.id, 'ST-01') as station_id,
        COALESCE(s.station_name, 'Station ' || bop.step_sequence) as station_name,
        tt.operator_name,
        tt.qc_inspector,
        tt.qc_status,
        tt.good_qty,
        tt.scrap_qty,
        tt.started_at,
        tt.completed_at,
        tt.created_at,
        ndp.id as active_ndp_id,
        COALESCE(ndp.reason_category, ndp.ndp_number, 'NDP Issue') as ndp_title
      FROM task_travel_tags tt
      JOIN projects p ON tt.project_id = p.id
      LEFT JOIN bill_of_processes bop ON tt.bop_id = bop.id
      LEFT JOIN stations s ON bop.station_id = s.id
      LEFT JOIN notice_to_down_processes ndp ON (ndp.project_id = tt.project_id AND ndp.status = 'ACTIVE')
      ORDER BY tt.created_at DESC
      LIMIT 100
    `).all() as any[];

    // Calculate Dwell Time (Aging) & Status for each WOT
    const now = Date.now();
    const enrichedWots = wotList.map((w) => {
      const startTime = w.started_at ? new Date(w.started_at).getTime() : new Date(w.created_at).getTime();
      const dwellMinutes = Math.max(0, Math.round((now - startTime) / (60 * 1000)));

      let status = "QUEUED";
      if (w.completed_at) {
        status = "COMPLETED";
      } else if (w.active_ndp_id) {
        status = "HOLD_NDP";
      } else if (activeLineStops.some((s: any) => s.station_id === w.station_id)) {
        status = "LINE_STOP";
      } else if (w.started_at) {
        status = "RUNNING";
      }

      // Check matching project sim for ETC
      const pSim = simResult.projects.find((p) => p.projectId === w.project_id);

      return {
        ...w,
        dwell_minutes: dwellMinutes,
        dwell_hours: Number((dwellMinutes / 60).toFixed(1)),
        is_aging_alert: dwellMinutes > 240 && status === "RUNNING", // Alert if > 4 hours
        status,
        project_etc: pSim?.estimatedCompletionDate,
        project_risk: pSim?.riskLevel || "ON_TRACK",
      };
    });

    // G. Fetch Recent Event Feed (Zona D)
    const eventFeed = db.prepare(`
      SELECT * FROM wip_travel_events ORDER BY timestamp DESC LIMIT 40
    `).all() as any[];

    // H. Health Bar Statistics (Zona A)
    const totalActiveWipUnits = enrichedWots
      .filter((w) => w.status !== "COMPLETED")
      .reduce((sum, w) => sum + (Number(w.good_qty) || 1), 0);

    const runningWotsCount = enrichedWots.filter((w) => w.status === "RUNNING").length;
    const queuedWotsCount = enrichedWots.filter((w) => w.status === "QUEUED").length;
    const blockedCount = enrichedWots.filter((w) => w.status === "HOLD_NDP" || w.status === "LINE_STOP").length;
    const atRiskCount = simResult.projects.filter((p) => p.riskLevel !== "ON_TRACK").length;
    const materialBottleneckCount = simResult.projects.reduce((sum, p) => sum + p.materialBlockers.length, 0);

    res.json({
      success: true,
      data: {
        kpi: {
          total_active_wip_units: totalActiveWipUnits,
          running_wots_count: runningWotsCount,
          queued_wots_count: queuedWotsCount,
          blocked_count: blockedCount,
          at_risk_projects_count: atRiskCount,
          material_bottleneck_count: materialBottleneckCount,
          active_line_stops_count: activeLineStops.length,
          overall_confidence_score: simResult.overallConfidenceScore,
        },
        active_wots: enrichedWots,
        project_schedule_panel: simResult.projects,
        station_loads: simResult.criticalStationLoad,
        recent_events: eventFeed,
        active_line_stops: activeLineStops,
      },
    });
  } catch (err: any) {
    console.error("Error generating Production Command Center payload:", err);
    res.status(500).json({ error: "Failed to generate Command Center: " + err.message });
  }
});

// ==========================================
// 2. Read-Only WIP Movement Window Table (FR-2)
// ==========================================
commandCenterRouter.get("/api/wip/movements", (req, res) => {
  try {
    const { project_id, station_id, event_type, search, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT e.*, p.name as project_name, p.spk_number
      FROM wip_travel_events e
      LEFT JOIN projects p ON e.project_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (project_id && project_id !== "ALL") {
      sql += " AND e.project_id = ?";
      params.push(project_id);
    }
    if (station_id && station_id !== "ALL") {
      sql += " AND (e.from_station_id = ? OR e.to_station_id = ?)";
      params.push(station_id, station_id);
    }
    if (event_type && event_type !== "ALL") {
      sql += " AND e.event_type = ?";
      params.push(event_type);
    }
    if (search && typeof search === "string" && search.trim()) {
      sql += " AND (e.tag_number LIKE ? OR e.user_name LIKE ? OR p.name LIKE ? OR p.spk_number LIKE ?)";
      const q = `%${search.trim()}%`;
      params.push(q, q, q, q);
    }

    sql += " ORDER BY e.timestamp DESC LIMIT ? OFFSET ?";
    params.push(Number(limit) || 50, Number(offset) || 0);

    const rows = db.prepare(sql).all(...params) as any[];
    const totalCount = db.prepare("SELECT COUNT(*) as count FROM wip_travel_events").get() as any;

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: totalCount?.count || 0,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      },
    });
  } catch (err: any) {
    console.error("Error fetching WIP movements:", err);
    res.status(500).json({ error: "Failed to fetch WIP movements: " + err.message });
  }
});

// ==========================================
// 3. Immutable WIP Event Writer with Idempotency (FR-1.5, FR-5)
// ==========================================
commandCenterRouter.post("/api/wip/events", (req, res) => {
  try {
    const {
      wot_id,
      tag_number,
      project_id,
      event_type, // START, QR_SCAN, TRANSFER, NDP_BLOCK, RESUME, WOT_COMPLETE, LINE_STOP, HOLD
      from_station_id,
      to_station_id,
      machine_code,
      operator_name,
      qty = 1,
      good_units = 1,
      reject_units = 0,
      metadata = {},
      idempotency_key,
    } = req.body;

    if (!tag_number && !wot_id) {
      return res.status(400).json({ error: "tag_number or wot_id is required" });
    }

    const key = idempotency_key || `EVT-${tag_number}-${event_type}-${Date.now().toString().slice(0, 8)}`;

    // Check idempotency
    const existing = db.prepare("SELECT * FROM wip_travel_events WHERE idempotency_key = ?").get(key);
    if (existing) {
      return res.json({
        success: true,
        message: "Event already recorded (idempotent duplicate ignored).",
        data: existing,
      });
    }

    const eventId = "WEVT-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
    const nowIso = new Date().toISOString();
    const actor = getActor(req) || operator_name || "Floor Operator";

    db.prepare(`
      INSERT INTO wip_travel_events (
        id, wot_id, tag_number, project_id, event_type,
        from_station_id, to_station_id, machine_code,
        user_name, qty, good_units, reject_units,
        metadata, timestamp, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      wot_id || null,
      tag_number,
      project_id || null,
      event_type || "QR_SCAN",
      from_station_id || null,
      to_station_id || null,
      machine_code || null,
      actor,
      qty,
      good_units,
      reject_units,
      typeof metadata === "string" ? metadata : JSON.stringify(metadata),
      nowIso,
      key
    );

    // Update Travel Tag Status accordingly
    if (tag_number) {
      if (event_type === "START") {
        db.prepare("UPDATE task_travel_tags SET started_at = COALESCE(started_at, ?) WHERE tag_number = ?").run(nowIso, tag_number);
      } else if (event_type === "WOT_COMPLETE") {
        db.prepare("UPDATE task_travel_tags SET completed_at = ?, good_qty = ?, scrap_qty = ? WHERE tag_number = ?").run(nowIso, good_units, reject_units, tag_number);
      }
    }

    res.json({
      success: true,
      message: `WIP Event ${event_type} successfully recorded.`,
      eventId,
    });
  } catch (err: any) {
    console.error("Error recording WIP event:", err);
    res.status(500).json({ error: "Failed to record WIP event: " + err.message });
  }
});

// ==========================================
// 4. Schedule What-If Simulator (FR-3.4)
// ==========================================
commandCenterRouter.post("/api/schedule/simulate", (req, res) => {
  try {
    const {
      hours_per_day = 8,
      work_on_saturday = false,
      extra_shift_count = 0,
      override_factory_factor,
    } = req.body;

    const activeProjects = db.prepare(`
      SELECT id, name, spk_number, due_date, factory_factor, priority
      FROM projects
      WHERE status NOT IN ('COMPLETED', 'FINISHED', 'CLOSED', 'CANCELLED')
    `).all() as any[];

    const bopRows = db.prepare(`
      SELECT b.*, s.station_name, i.name as machine_name, i.item_code as machine_code
      FROM bill_of_processes b
      LEFT JOIN stations s ON b.station_id = s.id
      LEFT JOIN items i ON (b.assigned_machine_id = i.id OR b.machine_id = i.id)
    `).all() as any[];

    const mappedProjects = activeProjects.map((p) => {
      const procs = bopRows
        .filter((b) => b.project_id === p.id)
        .map((b) => ({
          id: b.id,
          projectId: p.id,
          projectName: p.name,
          spkNumber: p.spk_number,
          stepSequence: b.step_sequence || 1,
          processName: b.process_name || `Step ${b.step_sequence}`,
          stationId: b.station_id || "ST-01",
          stationName: b.station_name || "General Station",
          machineId: b.assigned_machine_id || b.machine_id,
          machineCode: b.machine_code || "MC-01",
          cycleTimeMinutes: b.cycle_time_minutes || 2,
          setupTimeMinutes: b.setup_time_minutes || 0,
          scrapRate: b.scrap_rate || 0.02,
          manpowerRequired: b.manpower_allocated || 1,
          targetQty: p.qty || 100,
          predecessorIds: JSON.parse(b.predecessor_ids || "[]"),
        } as ProcessNodeV2));

      return {
        id: p.id,
        name: p.name,
        spkNumber: p.spk_number,
        dueDate: p.due_date || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
        factoryFactor: override_factory_factor ? Number(override_factory_factor) : (p.factory_factor || 85),
        priority: p.priority || 3,
        processes: procs,
      };
    });

    const scenarioProfile: CapacityProfile = {
      id: "SIM_SCENARIO",
      name: `Simulated ${hours_per_day}h/Day ${work_on_saturday ? "+Sat" : ""}`,
      hoursPerDay: Number(hours_per_day),
      shiftStartHour: 8,
      shiftEndHour: 8 + Number(hours_per_day) + 1,
      workOnSaturday: Boolean(work_on_saturday),
      extraShiftCount: Number(extra_shift_count),
    };

    const sim = simulateMultiProjectSchedule({
      projects: mappedProjects,
      capacityProfile: scenarioProfile,
    });

    res.json({
      success: true,
      data: sim,
    });
  } catch (err: any) {
    console.error("Error in schedule simulation:", err);
    res.status(500).json({ error: "Failed to simulate schedule: " + err.message });
  }
});

// ==========================================
// 5. Baseline Plan Commitment (FR-3.3)
// ==========================================
commandCenterRouter.post("/api/schedule/baseline", requireRole(["FC", "PRODUCTION", "MANAGER", "ADMIN"]), (req, res) => {
  try {
    const { project_id, snapshot_json, confidence_score = 88 } = req.body;
    const actor = (req.headers["x-user-name"] as string) || (req.headers["x-user-username"] as string) || "FC Lead";

    const planId = "SCHED-V1-" + Date.now();
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO schedule_plans (
        id, project_id, version, status, confidence_score, snapshot_json, created_by, approved_by, created_at
      ) VALUES (?, ?, ?, 'BASELINE', ?, ?, ?, ?, ?)
    `).run(
      planId,
      project_id || null,
      1,
      confidence_score,
      typeof snapshot_json === "string" ? snapshot_json : JSON.stringify(snapshot_json || {}),
      actor,
      actor,
      nowIso
    );

    logAudit(
      actor,
      "PRODUCTION_BASELINE_ESTABLISHED",
      "SCHEDULE_PLAN",
      planId,
      `Established Schedule Baseline v1 (${planId}) with Confidence ${confidence_score}%`
    );

    res.json({
      success: true,
      message: "Schedule Baseline v1 has been officially locked and established.",
      planId,
    });
  } catch (err: any) {
    console.error("Error creating baseline plan:", err);
    res.status(500).json({ error: "Failed to establish baseline: " + err.message });
  }
});

// ==========================================
// 6. Mid-Production Adjustment Sessions (FR-4)
// ==========================================
commandCenterRouter.post("/api/adjustments", requireRole(["FC", "PRODUCTION", "MANAGER", "ADMIN"]), (req, res) => {
  try {
    const {
      type, // NDP, PRIORITY_INSERT, LINE_STOP, MATERIAL_DELAY, SCOPE_CHANGE, SHIFT_OVERRIDE
      ref_id,
      project_id,
      scope = "STATION",
      severity = "MEDIUM",
      impact_details,
    } = req.body;

    const actor = (req.headers["x-user-name"] as string) || "Production Controller";
    const adjId = "ADJ-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO adjustment_events (
        id, type, ref_id, project_id, scope, severity, impact_snapshot_json, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)
    `).run(
      adjId,
      type || "SCOPE_CHANGE",
      ref_id || null,
      project_id || null,
      scope,
      severity,
      typeof impact_details === "string" ? impact_details : JSON.stringify(impact_details || {}),
      actor,
      nowIso
    );

    res.json({
      success: true,
      message: `Adjustment session ${adjId} created in DRAFT state.`,
      adjustmentId: adjId,
    });
  } catch (err: any) {
    console.error("Error creating adjustment session:", err);
    res.status(500).json({ error: "Failed to create adjustment session: " + err.message });
  }
});

commandCenterRouter.post("/api/adjustments/:id/approve", requireRole(["FC", "PRODUCTION", "MANAGER", "ADMIN"]), (req, res) => {
  try {
    const { id } = req.params;
    const actor = (req.headers["x-user-name"] as string) || "Production Manager";

    const adj = db.prepare("SELECT * FROM adjustment_events WHERE id = ?").get(id) as any;
    if (!adj) {
      return res.status(404).json({ error: "Adjustment session not found" });
    }

    const nowIso = new Date().toISOString();

    // 1. Mark adjustment as APPROVED
    db.prepare("UPDATE adjustment_events SET status = 'APPROVED', approved_by = ? WHERE id = ?").run(actor, id);

    // 2. Increment Baseline Plan version (e.g. v2, v3)
    const latestPlan = db.prepare("SELECT * FROM schedule_plans ORDER BY version DESC LIMIT 1").get() as any;
    const newVersion = (latestPlan?.version || 1) + 1;
    const newPlanId = `SCHED-V${newVersion}-${Date.now()}`;

    db.prepare(`
      INSERT INTO schedule_plans (
        id, project_id, version, status, confidence_score, snapshot_json, created_by, approved_by, created_at
      ) VALUES (?, ?, ?, 'ADJUSTED', ?, ?, ?, ?, ?)
    `).run(
      newPlanId,
      adj.project_id || null,
      newVersion,
      82,
      adj.impact_snapshot_json || "{}",
      actor,
      actor,
      nowIso
    );

    logAudit(
      actor,
      "PRODUCTION_REBASELINE_APPROVED",
      "ADJUSTMENT_EVENT",
      id,
      `Approved Adjustment ${id} (${adj.type}) and committed Baseline Schedule v${newVersion}`
    );

    res.json({
      success: true,
      message: `Adjustment approved! Baseline Schedule updated to version v${newVersion}.`,
      planId: newPlanId,
      newVersion,
    });
  } catch (err: any) {
    console.error("Error approving adjustment:", err);
    res.status(500).json({ error: "Failed to approve adjustment: " + err.message });
  }
});

// ==========================================
// 7. Stop Line as First-Class Event (FR-3.6 - FR-3.8)
// ==========================================
commandCenterRouter.post("/api/production/stop-line", requireRole(["FC", "PRODUCTION", "MANAGER", "ADMIN"]), (req, res) => {
  try {
    const {
      station_id,
      scope = "STATION",
      reason_code,
      reason_text,
      est_resume_hours = 4,
    } = req.body;

    if (!station_id || !reason_code) {
      return res.status(400).json({ error: "station_id and reason_code are required" });
    }

    const actor = (req.headers["x-user-name"] as string) || "Supervisor";
    const stopId = "STOP-" + Date.now();
    const nowIso = new Date().toISOString();
    const estResume = new Date(Date.now() + Number(est_resume_hours) * 3600 * 1000).toISOString();

    db.prepare(`
      INSERT INTO stop_line_events (
        id, station_id, scope, reason_code, reason_text, started_at, est_resume_at, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).run(
      stopId,
      station_id,
      scope,
      reason_code,
      reason_text || "Emergency line interruption",
      nowIso,
      estResume,
      actor,
      nowIso
    );

    // Write WIP Event
    db.prepare(`
      INSERT INTO wip_travel_events (
        id, event_type, from_station_id, to_station_id, user_name, metadata, timestamp, idempotency_key
      ) VALUES (?, 'LINE_STOP', ?, ?, ?, ?, ?, ?)
    `).run(
      "EVT-" + stopId,
      station_id,
      station_id,
      actor,
      JSON.stringify({ reason_code, reason_text, est_resume_at: estResume }),
      nowIso,
      "STOP-" + stopId
    );

    logAudit(
      actor,
      "PRODUCTION_STOP_LINE_DECLARED",
      "STOP_LINE",
      stopId,
      `Declared STOP LINE at Station ${station_id}: ${reason_code}`
    );

    res.json({
      success: true,
      message: `Stop Line declared at Station ${station_id}. Interrupted WOTs set to ON_HOLD.`,
      stopId,
    });
  } catch (err: any) {
    console.error("Error declaring stop line:", err);
    res.status(500).json({ error: "Failed to declare stop line: " + err.message });
  }
});

commandCenterRouter.post("/api/production/stop-line/:id/resume", requireRole(["FC", "PRODUCTION", "MANAGER", "ADMIN"]), (req, res) => {
  try {
    const { id } = req.params;
    const actor = (req.headers["x-user-name"] as string) || "Supervisor";

    const stop = db.prepare("SELECT * FROM stop_line_events WHERE id = ?").get(id) as any;
    if (!stop) {
      return res.status(404).json({ error: "Stop line event not found" });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const started = new Date(stop.started_at);
    const lostHours = Math.max(0.1, Number(((now.getTime() - started.getTime()) / (3600 * 1000)).toFixed(2)));

    db.prepare(`
      UPDATE stop_line_events SET
        status = 'RESUMED',
        actual_resume_at = ?,
        lost_manhours = ?,
        approved_by = ?
      WHERE id = ?
    `).run(nowIso, lostHours, actor, id);

    // Record Resume in WIP events
    db.prepare(`
      INSERT INTO wip_travel_events (
        id, event_type, from_station_id, to_station_id, user_name, metadata, timestamp, idempotency_key
      ) VALUES (?, 'RESUME', ?, ?, ?, ?, ?, ?)
    `).run(
      "EVT-RESUME-" + id,
      stop.station_id,
      stop.station_id,
      actor,
      JSON.stringify({ lost_manhours: lostHours, resumed_at: nowIso }),
      nowIso,
      "RESUME-" + id
    );

    logAudit(
      actor,
      "PRODUCTION_LINE_RESUMED",
      "STOP_LINE",
      id,
      `Resumed Station ${stop.station_id} after ${lostHours} hours lost.`
    );

    res.json({
      success: true,
      message: `Station ${stop.station_id} successfully resumed. Recorded ${lostHours} lost manhours.`,
      lost_manhours: lostHours,
    });
  } catch (err: any) {
    console.error("Error resuming line:", err);
    res.status(500).json({ error: "Failed to resume stop line: " + err.message });
  }
});
