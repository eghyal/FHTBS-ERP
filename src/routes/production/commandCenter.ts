import { Router } from "express";
import db from "../../db/database.ts";
import { logAudit } from "../../utils/audit.ts";
import { requireRole, getActor } from "../../middleware/auth.ts";
import { simulateMultiProjectSchedule } from "../../utils/scheduleEngine.ts";
import type { CapacityProfile, ProcessNodeV2, MaterialGate } from "../../utils/scheduleEngine.ts";

export const commandCenterRouter = Router();

// ==========================================
// 1. Production Command Center Unified Hub (FR-1)
// ==========================================
commandCenterRouter.get("/api/production/command-center", (req, res) => {
  try {
    // A. Fetch Active Manufacturing Projects with Process Graph & WOT/BOP counts (Strictly excluding Non-Project categories)
    const activeProjects = db.prepare(`
      SELECT 
        p.id, 
        p.name, 
        COALESCE(p.spk_number, spk.spk_number) as spk_number, 
        p.customer, 
        COALESCE(
          CASE WHEN p.due_date IS NOT NULL AND p.due_date != '2099-12-31' AND p.due_date != '' THEN p.due_date ELSE NULL END,
          CASE WHEN spk.due_date IS NOT NULL AND spk.due_date != '2099-12-31' AND spk.due_date != '' THEN spk.due_date ELSE NULL END,
          CASE WHEN spk.target_completion_date IS NOT NULL AND spk.target_completion_date != '2099-12-31' AND spk.target_completion_date != '' THEN spk.target_completion_date ELSE NULL END,
          p.planned_completion_date,
          p.due_date
        ) as due_date, 
        p.start_date,
        p.status, 
        p.factory_factor, 
        p.priority,
        p.urgency,
        COALESCE(p.qty, 1) as qty,
        COALESCE(p.lot_size, 0) as lot_size,
        COALESCE(p.is_master_set, 0) as is_master_set,
        COALESCE(p.bop_status, 'DRAFT') as bop_status,
        p.bop_authorized_by,
        p.bop_authorized_at,
        p.completed_at,
        p.uom,
        p.actual_total_hours,
        p.planned_total_hours,
        p.project_performance_factor,
        (SELECT COUNT(*) FROM work_order_tickets w WHERE w.project_id = p.id) as wot_count,
        (SELECT COUNT(*) FROM work_order_tickets w WHERE w.project_id = p.id AND w.status = 'COMPLETED') as completed_wot_count,
        (SELECT COUNT(*) FROM bill_of_processes b WHERE b.project_id = p.id AND (b.node_type IS NULL OR UPPER(b.node_type) NOT IN ('PRODUCT', 'START', 'END'))) as bop_count,
        (SELECT COUNT(*) FROM bill_of_processes b WHERE b.project_id = p.id AND (b.node_type IS NULL OR UPPER(b.node_type) NOT IN ('PRODUCT', 'START', 'END')) AND b.status = 'COMPLETED') as completed_bop_count
      FROM projects p
      LEFT JOIN spks spk ON (p.spk_id = spk.id OR p.spk_number = spk.spk_number OR p.id = spk.project_id)
      WHERE p.deleted_at IS NULL
        AND (p.archived_at IS NULL OR p.status IN ('COMPLETED', 'FINISHED'))
        AND p.status NOT IN ('CLOSED', 'CANCELLED', 'PENDING_NTP', 'INTERNAL_OVERHEAD')
        AND p.id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
        AND UPPER(COALESCE(p.name, '')) NOT LIKE '%CONSUMABLE%'
        AND UPPER(COALESCE(p.name, '')) NOT LIKE '%TRANSPORTATION%'
        AND UPPER(COALESCE(p.name, '')) NOT LIKE '%OTHER PROCUREMENT%'
        AND UPPER(COALESCE(p.name, '')) NOT LIKE '%OTHERS PROCUREMENT%'
        AND UPPER(COALESCE(p.name, '')) NOT LIKE '%GENERAL PROCUREMENT%'
      GROUP BY p.id
      ORDER BY 
        CASE WHEN p.status IN ('COMPLETED', 'FINISHED') THEN 1 ELSE 0 END ASC,
        due_date ASC
    `).all() as any[];

    // B. Fetch Bill of Processes for Active Projects
    const bopRows = activeProjects.length > 0 ? (db.prepare(`
      SELECT b.*, 
             COALESCE(ps.station_name, s.station_name) as station_name, 
             COALESCE(ps.station_code, s.station_code) as station_code, 
             i.name as machine_name, 
             i.item_code as machine_code
      FROM bill_of_processes b
      LEFT JOIN project_stations ps ON b.station_id = ps.id
      LEFT JOIN stations s ON b.station_id = s.id
      LEFT JOIN items i ON (b.assigned_machine_id = i.id OR b.machine_id = i.id)
      WHERE b.project_id IN (${activeProjects.map(() => "?").join(",")})
      ORDER BY b.step_sequence ASC
    `).all(...activeProjects.map((p) => p.id)) as any[]) : [];

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

    // E. Run Multi-Project Simulation Engine v2 (Only for Engineering-Authorized Projects)
    const nonFinishedProjects = activeProjects.filter(
      (p) => p.status !== "COMPLETED" && p.status !== "FINISHED" && p.bop_status === "AUTHORIZED"
    );
    const mappedProjects = nonFinishedProjects.map((proj) => {
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

    // Fetch FGR records for Completed / Finished Projects
    const fgrMap = new Map<string, any>();
    try {
      const fgrRows = db
        .prepare(`SELECT * FROM finish_good_records ORDER BY inspected_at DESC, created_at DESC`)
        .all() as any[];
      for (const f of fgrRows) {
        if (f.project_id && !fgrMap.has(String(f.project_id))) {
          fgrMap.set(String(f.project_id), f);
        }
      }
    } catch (_) {}

    // Enrich Active Projects with simulation & readiness telemetry
    const enrichedProjects = activeProjects.map((proj) => {
      const pSim = simResult.projects.find((p) => p.projectId === proj.id);
      const isMasterSet = Boolean(proj.is_master_set) || Number(proj.wot_count) > 0;
      const bopCount = Number(proj.bop_count) || 0;
      const completedBopCount = Number(proj.completed_bop_count) || 0;
      const wotCount = Number(proj.wot_count) || 0;
      const completedWotCount = Number(proj.completed_wot_count) || 0;
      const fgrRecord = fgrMap.get(String(proj.id)) || null;

      let overallProgress = 0;
      if (proj.status === "COMPLETED" || proj.status === "FINISHED") {
        overallProgress = 100;
      } else if (bopCount > 0) {
        overallProgress = Math.round((completedBopCount / bopCount) * 100);
      } else if (wotCount > 0) {
        overallProgress = Math.round((completedWotCount / wotCount) * 100);
      }

      return {
        id: proj.id,
        name: proj.name,
        spk_number: proj.spk_number || proj.id,
        customer_name: proj.customer || "General Customer",
        qty: Number(proj.qty) || 1,
        uom: proj.uom || "PCS",
        lot_size: Number(proj.lot_size) || 0,
        is_master_set: isMasterSet,
        due_date: proj.due_date,
        start_date: proj.start_date,
        completed_at: proj.completed_at || fgrRecord?.inspected_at || fgrRecord?.created_at || null,
        urgency: proj.urgency || "NORMAL",
        priority: proj.priority || 3,
        status: proj.status || "DRAFT",
        bop_status: proj.bop_status || "DRAFT",
        bop_authorized_by: proj.bop_authorized_by || null,
        bop_authorized_at: proj.bop_authorized_at || null,
        wot_count: wotCount,
        completed_wot_count: completedWotCount,
        bop_count: bopCount,
        completed_bop_count: completedBopCount,
        overall_progress: overallProgress,
        factory_factor: Number(proj.factory_factor || 85),
        actual_total_hours: Number(proj.actual_total_hours || 0),
        planned_total_hours: Number(proj.planned_total_hours || 0),
        fgr_number: fgrRecord?.fgr_number || null,
        fgr: fgrRecord,
        risk_level: pSim?.riskLevel || "ON_TRACK",
        estimated_completion_date: pSim?.estimatedCompletionDate || proj.due_date,
      };
    });

    // G. Fetch Recent Event Feed (Zona D)
    const eventFeed = db.prepare(`
      SELECT * FROM wip_travel_events ORDER BY timestamp DESC LIMIT 40
    `).all() as any[];

    // H. Health Bar Statistics (Zona A) - Active manufacturing only considers Engineering-authorized BOPs
    const awaitingBopProjectsCount = enrichedProjects.filter(
      (p) => p.bop_status !== "AUTHORIZED" && p.status !== "COMPLETED" && p.status !== "FINISHED"
    ).length;
    const totalActiveProjectsCount = enrichedProjects.filter(
      (p) => p.bop_status === "AUTHORIZED" && p.status !== "COMPLETED" && p.status !== "FINISHED"
    ).length;
    const needsSetupProjectsCount = enrichedProjects.filter(
      (p) => p.bop_status === "AUTHORIZED" && !p.is_master_set && p.status !== "COMPLETED" && p.status !== "FINISHED"
    ).length;
    const inProgressProjectsCount = enrichedProjects.filter(
      (p) => p.bop_status === "AUTHORIZED" && p.is_master_set && p.status !== "COMPLETED" && p.status !== "FINISHED"
    ).length;
    const finishedProjectsCount = enrichedProjects.filter(
      (p) => p.status === "COMPLETED" || p.status === "FINISHED"
    ).length;

    const totalActiveWipUnits = enrichedWots
      .filter((w) => w.status !== "COMPLETED")
      .reduce((sum, w) => sum + (Number(w.good_qty) || 1), 0);

    const runningWotsCount = enrichedWots.filter((w) => w.status === "RUNNING").length;
    const queuedWotsCount = enrichedWots.filter((w) => w.status === "QUEUED").length;
    const blockedCount = enrichedWots.filter((w) => w.status === "HOLD_NDP" || w.status === "LINE_STOP").length;
    const atRiskCount = simResult.projects.filter((p) => p.riskLevel !== "ON_TRACK").length;
    const materialBottleneckCount = simResult.projects.reduce((sum, p) => sum + p.materialBlockers.length, 0);

    // Fetch Procurement Plans, Waves & Linked PR/POs for Unified PPIC Gantt Pipeline
    let procurementWavesByProject = new Map<string, any[]>();
    let posByProject = new Map<string, any[]>();
    try {
      const waveRows = db.prepare(`
        SELECT w.*, pp.project_id, pp.plan_code, pp.strategy_mode
        FROM procurement_plan_waves w
        JOIN procurement_plans pp ON w.plan_id = pp.id
        WHERE pp.status != 'ARCHIVED'
        ORDER BY w.wave_number ASC
      `).all() as any[];
      for (const w of waveRows) {
        const pid = String(w.project_id || "");
        if (!procurementWavesByProject.has(pid)) procurementWavesByProject.set(pid, []);
        procurementWavesByProject.get(pid)!.push(w);
      }
    } catch (_) {}

    try {
      const poRows = db.prepare(`
        SELECT DISTINCT
          po.id as po_id,
          po.po_number,
          po.supplier_name,
          po.status as po_status,
          po.created_at as order_date,
          po.expected_date,
          pr.project_id,
          pr.pr_number
        FROM pr_items pri
        JOIN purchase_requests pr ON pri.pr_id = pr.id
        LEFT JOIN purchase_orders po ON pri.po_id = po.id
        WHERE pr.project_id IS NOT NULL
        ORDER BY po.created_at DESC
      `).all() as any[];
      for (const row of poRows) {
        const pid = String(row.project_id || "");
        if (!posByProject.has(pid)) posByProject.set(pid, []);
        posByProject.get(pid)!.push(row);
      }
    } catch (_) {}

    const isCommandCenterQcGate = (b: any): boolean => {
      const nt = String(b.node_type || "").toUpperCase();
      if (nt !== "PRODUCT") return false;
      const role = String(b.product_role || "").toUpperCase();
      if (role === "MATERIAL_INPUT") return false;
      if (role === "WIP_SUB_ASSY" || role === "FINISHED_GOOD") return true;
      try {
        const preds = JSON.parse(b.predecessor_ids || "[]");
        if (Array.isArray(preds) && preds.length > 0) return true;
      } catch (_) {}
      try {
        const qcp = JSON.parse(b.qc_parameters_json || "[]");
        if (Array.isArray(qcp) && qcp.length > 0) return true;
      } catch (_) {}
      return Boolean(b.qc_criteria && String(b.qc_criteria).trim() !== "");
    };

    const ganttPipeline = enrichedProjects
      .filter((p) => p.status !== "COMPLETED" && p.status !== "FINISHED")
      .map((proj) => {
        const pSim = simResult.projects.find((s) => s.projectId === proj.id);
        const projBops = bopRows.filter((b) => {
          if (b.project_id !== proj.id) return false;
          const nt = String(b.node_type || "PROCESS").toUpperCase();
          if (nt === "START" || nt === "END") return false;
          if (nt === "PRODUCT") return isCommandCenterQcGate(b);
          return true;
        });
        const waves = procurementWavesByProject.get(String(proj.id)) || [];
        const linkedPos = posByProject.get(String(proj.id)) || [];

        const baseStartMs = proj.start_date
          ? new Date(proj.start_date).getTime()
          : Date.now() - 2 * 86400000;
        const safeStartMs = isNaN(baseStartMs) ? Date.now() : baseStartMs;

        const estEndStr = pSim?.estimatedCompletionDate || proj.due_date;
        const rawEndMs = estEndStr ? new Date(estEndStr).getTime() : safeStartMs + 10 * 86400000;
        const safeEndMs =
          isNaN(rawEndMs) || rawEndMs <= safeStartMs
            ? safeStartMs + Math.max(4, projBops.length * 2) * 86400000
            : rawEndMs;

        const totalSpanMs = Math.max(2 * 86400000, safeEndMs - safeStartMs);

        // Build BOP station & IPQC stage bars across the production span
        const stepCount = Math.max(1, projBops.length);
        let qcGatesCount = 0;
        let totalQcParams = 0;
        let totalProcCtMins = 0;
        let totalQcCtMins = 0;

        const bopBars = projBops.map((b, idx) => {
          const segStartMs = safeStartMs + (totalSpanMs * idx) / stepCount;
          const segEndMs = safeStartMs + (totalSpanMs * (idx + 1)) / stepCount;
          const isQcGate = isCommandCenterQcGate(b);
          let qcParamsArr: any[] = [];
          try {
            const parsed = JSON.parse(b.qc_parameters_json || "[]");
            if (Array.isArray(parsed)) qcParamsArr = parsed;
          } catch (_) {}
          const qcParamsCount = isQcGate ? Math.max(1, qcParamsArr.length) : qcParamsArr.length;
          const ctMins =
            qcParamsArr.length > 0
              ? qcParamsArr.reduce(
                  (acc: number, p: any) => acc + Math.max(0.5, Number(p?.cycle_time_minutes) || 5),
                  0
                )
              : Number(b.cycle_time_minutes) || (isQcGate ? 8 : 20);

          if (isQcGate || qcParamsArr.length > 0) {
            qcGatesCount += 1;
            totalQcParams += qcParamsCount;
            totalQcCtMins += ctMins;
          }
          totalProcCtMins += ctMins;

          return {
            id: b.id,
            step_sequence: b.step_sequence || idx + 1,
            process_name: b.process_name || `Step ${idx + 1}`,
            station_name: b.station_name || b.station_id || "Station",
            node_type: b.node_type || "PROCESS",
            is_qc_gate: isQcGate,
            qc_params_count: qcParamsCount,
            cycle_time_minutes: Number(ctMins.toFixed(1)),
            status: b.status || "PENDING",
            start_date: new Date(segStartMs).toISOString().slice(0, 10),
            end_date: new Date(segEndMs).toISOString().slice(0, 10),
          };
        });

        // Build Procurement bars from saved waves or linked PR/POs or baseline lead-time window
        const procurementBars: any[] = [];
        if (waves.length > 0) {
          waves.forEach((w) => {
            procurementBars.push({
              id: w.id,
              label: `Wave #${w.wave_number}: ${w.station_focus || w.wave_name}`,
              doc_ref: w.generated_po_number || w.generated_pr_number || w.plan_code,
              status: w.status || "PLANNED",
              start_date: String(w.target_order_date || new Date(safeStartMs - 3 * 86400000).toISOString()).slice(0, 10),
              end_date: String(w.target_arrival_date || w.production_need_date || new Date(safeStartMs + 2 * 86400000).toISOString()).slice(0, 10),
              need_date: String(w.production_need_date || "").slice(0, 10),
              wot_lot_range: w.wot_lot_range || "All Lots",
            });
          });
        } else if (linkedPos.length > 0) {
          const seenRef = new Set<string>();
          linkedPos.forEach((po, idx) => {
            const refKey = po.po_number || po.pr_number || `PR-${idx}`;
            if (seenRef.has(refKey)) return;
            seenRef.add(refKey);
            const ordMs = po.order_date ? new Date(po.order_date).getTime() : safeStartMs - 3 * 86400000;
            const etaMs = po.expected_date ? new Date(po.expected_date).getTime() : ordMs + 4 * 86400000;
            procurementBars.push({
              id: `${proj.id}-po-${idx}`,
              label: po.po_number ? `${po.po_number} (${po.supplier_name || "Vendor"})` : `PR ${po.pr_number} (Sourcing)`,
              doc_ref: refKey,
              status: po.po_status || "PR_PENDING",
              start_date: new Date(isNaN(ordMs) ? safeStartMs - 3 * 86400000 : ordMs).toISOString().slice(0, 10),
              end_date: new Date(isNaN(etaMs) ? safeStartMs + 1 * 86400000 : Math.max(ordMs + 86400000, etaMs)).toISOString().slice(0, 10),
              need_date: new Date(safeStartMs).toISOString().slice(0, 10),
              wot_lot_range: `Lot 1–${Math.max(1, proj.wot_count || 1)}`,
            });
          });
        } else {
          // Baseline Material Readiness Window prior to / overlapping WOT Lot #1
          const matStartMs = safeStartMs - 3 * 86400000;
          const matEndMs = safeStartMs + Math.min(3 * 86400000, totalSpanMs * 0.35);
          procurementBars.push({
            id: `${proj.id}-mat-wave-1`,
            label: "Wave #1: BOM Material Staging & PR/PO Lead Time",
            doc_ref: "MRP-WAVE-01",
            status: proj.is_master_set ? "READY" : "PLANNED",
            start_date: new Date(matStartMs).toISOString().slice(0, 10),
            end_date: new Date(matEndMs).toISOString().slice(0, 10),
            need_date: new Date(safeStartMs).toISOString().slice(0, 10),
            wot_lot_range: `Lot 1–${Math.max(1, proj.wot_count || 1)}`,
          });
        }

        const lotSizeVal = Math.max(1, Number(proj.lot_size) || 10);
        const orderQtyVal = Math.max(1, Number(proj.qty) || 100);
        const ffRatio = Math.max(0.5, Number(proj.factory_factor || 85) / 100);
        const wotQcHours = Number(((totalQcCtMins * lotSizeVal) / (60 * ffRatio)).toFixed(2));
        const orderQcHours = Number(((totalQcCtMins * orderQtyVal) / (60 * ffRatio)).toFixed(1));
        const qcSharePct =
          totalProcCtMins > 0 ? Math.min(100, Math.round((totalQcCtMins / totalProcCtMins) * 100)) : 0;

        // Material-to-Process Readiness Matrix per Station
        const stationGroupMap = new Map<
          string,
          {
            station_name: string;
            processes_count: number;
            qc_gates_count: number;
            station_start: string;
          }
        >();
        bopBars.forEach((bb) => {
          const stName = bb.station_name || "General Station";
          if (!stationGroupMap.has(stName)) {
            stationGroupMap.set(stName, {
              station_name: stName,
              processes_count: 0,
              qc_gates_count: 0,
              station_start: bb.start_date,
            });
          }
          const grp = stationGroupMap.get(stName)!;
          if (bb.is_qc_gate) grp.qc_gates_count += 1;
          else grp.processes_count += 1;
        });

        const materialReadinessMatrix = Array.from(stationGroupMap.values()).map((stGrp, sIdx) => {
          const matchedWave = procurementBars[Math.min(sIdx, Math.max(0, procurementBars.length - 1))];
          const waveEta = matchedWave?.end_date || new Date(safeStartMs).toISOString().slice(0, 10);
          const stStartMs = new Date(`${stGrp.station_start}T00:00:00Z`).getTime();
          const etaMs = new Date(`${waveEta}T00:00:00Z`).getTime();
          const delayDays =
            !isNaN(stStartMs) && !isNaN(etaMs)
              ? Math.max(0, Math.round((etaMs - stStartMs) / 86400000))
              : 0;
          const isReceived =
            matchedWave?.status === "GRN_RECEIVED" || matchedWave?.status === "READY";
          return {
            station_name: stGrp.station_name,
            processes_count: stGrp.processes_count,
            qc_gates_count: stGrp.qc_gates_count,
            wave_ref: matchedWave?.doc_ref || "MRP-WAVE-01",
            wave_status: matchedWave?.status || "PLANNED",
            wave_eta: waveEta,
            station_start: stGrp.station_start,
            delay_days: isReceived ? 0 : delayDays,
            readiness_status: isReceived
              ? "READY"
              : delayDays > 0
              ? "PO_DELAY_RISK"
              : "STAGED_ON_TIME",
          };
        });

        return {
          project_id: proj.id,
          project_name: proj.name,
          spk_number: proj.spk_number,
          customer_name: proj.customer_name,
          bop_status: proj.bop_status,
          is_master_set: proj.is_master_set,
          risk_level: proj.risk_level,
          overall_progress: proj.overall_progress,
          qty: proj.qty,
          uom: proj.uom,
          lot_size: proj.lot_size || 10,
          wot_count: proj.wot_count,
          production_start: new Date(safeStartMs).toISOString().slice(0, 10),
          production_end: new Date(safeEndMs).toISOString().slice(0, 10),
          due_date: proj.due_date ? String(proj.due_date).slice(0, 10) : new Date(safeEndMs).toISOString().slice(0, 10),
          bop_bars: bopBars,
          procurement_bars: procurementBars,
          qc_load_summary: {
            qc_gates_count: qcGatesCount,
            total_qc_params: totalQcParams,
            wot_qc_hours: wotQcHours,
            order_qc_hours: orderQcHours,
            qc_share_pct: qcSharePct,
            is_qc_bottleneck: qcGatesCount > 0 && (qcSharePct >= 18 || wotQcHours >= 2.5),
          },
          material_readiness_matrix: materialReadinessMatrix,
        };
      });

    res.json({
      success: true,
      data: {
        kpi: {
          total_active_projects_count: totalActiveProjectsCount,
          needs_setup_projects_count: needsSetupProjectsCount,
          in_progress_projects_count: inProgressProjectsCount,
          finished_projects_count: finishedProjectsCount,
          awaiting_bop_projects_count: awaitingBopProjectsCount,
          total_active_wip_units: totalActiveWipUnits,
          running_wots_count: runningWotsCount,
          queued_wots_count: queuedWotsCount,
          blocked_count: blockedCount,
          at_risk_projects_count: atRiskCount,
          material_bottleneck_count: materialBottleneckCount,
          active_line_stops_count: activeLineStops.length,
          overall_confidence_score: simResult.overallConfidenceScore,
        },
        active_projects: enrichedProjects,
        active_wots: enrichedWots,
        project_schedule_panel: simResult.projects,
        station_loads: simResult.criticalStationLoad,
        recent_events: eventFeed,
        active_line_stops: activeLineStops,
        gantt_pipeline: ganttPipeline,
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
      SELECT id, name, spk_number, due_date, factory_factor, priority, qty
      FROM projects
      WHERE status NOT IN ('COMPLETED', 'FINISHED', 'CLOSED', 'CANCELLED', 'PENDING_NTP', 'INTERNAL_OVERHEAD')
        AND id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
        AND deleted_at IS NULL AND archived_at IS NULL
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
commandCenterRouter.post("/api/schedule/baseline", requireRole(["FC", "PPIC", "PRODUCTION", "MANAGER", "ADMIN"]), (req, res) => {
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
commandCenterRouter.post("/api/adjustments", requireRole(["FC", "PPIC", "PRODUCTION", "MANAGER", "ADMIN"]), (req, res) => {
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

commandCenterRouter.post("/api/adjustments/:id/approve", requireRole(["FC", "PPIC", "PRODUCTION", "MANAGER", "ADMIN"]), (req, res) => {
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
