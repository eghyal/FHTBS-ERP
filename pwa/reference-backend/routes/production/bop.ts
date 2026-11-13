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
  emitProductionUpdate,
  checkRecursivePredecessorsCompleted,
  getAvailableInputWipForBop,
  checkPredecessorsReadyForPipelining,
  autoResolveDownstreamProductNodes,
  preemptiveAutoPauseConflictingSteps,
  autoStartDownstreamProcesses,
} from "./utils.ts";

export const bopRouter = Router();

const isGhostProcurementBopRow = (row: any): boolean => {
  const idStr = String(row?.id || "").trim();
  const legacyIdStr = String(row?.legacy_task_id || "").trim();
  const nameStr = String(row?.process_name || "").trim();
  if (idStr.startsWith("BOP-TSK-") || legacyIdStr.startsWith("TSK-")) return true;
  if (
    nameStr.startsWith("[Procurement]") ||
    nameStr.startsWith("Materials:") ||
    nameStr.startsWith("Arrival:") ||
    nameStr.startsWith("Material Procurement") ||
    nameStr.startsWith("SPK Material Procurement") ||
    nameStr.startsWith("ECO Procurement Revision")
  ) {
    return true;
  }
  return false;
};

const purgeGhostProcurementBopRowsForProject = (projectId: string) => {
  try {
    const ghostRows = db
      .prepare(
        `SELECT id FROM bill_of_processes
         WHERE (project_id = ?
            OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
            OR project_id = (SELECT id FROM projects WHERE spk_number = ?))
           AND (
             id LIKE 'BOP-TSK-%'
             OR legacy_task_id LIKE 'TSK-%'
             OR process_name LIKE '[Procurement]%'
             OR process_name LIKE 'Materials:%'
             OR process_name LIKE 'Arrival:%'
             OR process_name LIKE 'Material Procurement%'
             OR process_name LIKE 'SPK Material Procurement%'
             OR process_name LIKE 'ECO Procurement Revision%'
           )`,
      )
      .all(projectId, projectId, projectId) as { id: string }[];

    if (ghostRows.length > 0) {
      const delStmt = db.prepare("DELETE FROM bill_of_processes WHERE id = ?");
      for (const g of ghostRows) {
        delStmt.run(g.id);
        deleteDocFromFirestore("bill_of_processes", g.id);
      }
    }
  } catch (e) {
    console.warn("Ghost BOP cleanup warning:", e);
  }
};

try {
  db.exec("ALTER TABLE bill_of_processes ADD COLUMN qc_parameters_json TEXT DEFAULT '[]';");
} catch (_) {}
try {
  db.exec("ALTER TABLE bill_of_processes ADD COLUMN product_role TEXT;");
} catch (_) {}

const parseQcParametersJson = (raw: any, fallbackCriteria?: string | null): any[] => {
  let parsed: any[] = [];
  if (Array.isArray(raw)) {
    parsed = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) parsed = p;
    } catch (_) {}
  }
  const cleaned = parsed
    .filter((x) => x && (x.parameter_name || x.specification))
    .map((x, idx) => ({
      id: String(x.id || `qcp_${idx + 1}`),
      parameter_name: String(x.parameter_name || "Inspection Parameter").trim(),
      specification: String(x.specification || "Standard Spec").trim(),
      measurement_method: String(x.measurement_method || "Visual / Gauge").trim(),
      is_mandatory_gate: x.is_mandatory_gate !== false,
    }));

  if (cleaned.length === 0 && fallbackCriteria && String(fallbackCriteria).trim()) {
    const rawStr = String(fallbackCriteria).trim();
    const parts = rawStr
      .split(/[;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.map((part, idx) => {
      const colonIdx = part.indexOf(":");
      if (colonIdx > 0) {
        return {
          id: `qcp_legacy_${idx + 1}`,
          parameter_name: part.slice(0, colonIdx).trim(),
          specification: part.slice(colonIdx + 1).trim(),
          measurement_method: "Visual / Caliper",
          is_mandatory_gate: true,
        };
      }
      return {
        id: `qcp_legacy_${idx + 1}`,
        parameter_name: `Checkpoint #${idx + 1}`,
        specification: part,
        measurement_method: "Visual / Caliper",
        is_mandatory_gate: true,
      };
    });
  }
  return cleaned;
};

const formatQcParametersToSummaryText = (params: any[], existingNotes?: string | null): string => {
  if (Array.isArray(params) && params.length > 0) {
    return params
      .map(
        (p) =>
          `${p.parameter_name}: ${p.specification}${
            p.measurement_method ? ` [${p.measurement_method}]` : ""
          }`,
      )
      .join("; ");
  }
  return String(existingNotes || "").trim();
};

const enrichBopStepsWithProcurementSummary = (
  projectId: string,
  bopList: any[],
): any[] => {
  const cleanList = (bopList || []).filter((r) => !isGhostProcurementBopRow(r));
  if (cleanList.length === 0) return [];

  // Map BOM id -> item_id, item_code, item_name
  let projectBoms: any[] = [];
  try {
    projectBoms = db
      .prepare(
        `SELECT b.*, i.item_code, i.name as item_name, i.uom
         FROM boms b
         LEFT JOIN items i ON b.item_id = i.id
         WHERE b.project_id = ?
            OR b.project_id = (SELECT spk_number FROM projects WHERE id = ?)
            OR b.project_id = (SELECT id FROM projects WHERE spk_number = ?)`,
      )
      .all(projectId, projectId, projectId) as any[];
  } catch (_) {}
  const bomById = new Map<string, any>();
  projectBoms.forEach((b) => {
    if (b.id) bomById.set(String(b.id), b);
  });

  // Fetch active Procurement Plan items + waves for this project
  let planWaveItems: any[] = [];
  try {
    planWaveItems = db
      .prepare(
        `SELECT
           ppi.item_id,
           ppi.item_code,
           ppi.allocated_wave_qty as planned_qty,
           ppi.process_step_name,
           ppi.station_name,
           ppi.source_pr_id,
           ppi.source_pr_item_id,
           w.wave_number,
           w.wave_name,
           w.target_order_date,
           w.target_arrival_date,
           w.production_need_date,
           w.status as wave_status,
           w.generated_pr_number,
           w.generated_po_number,
           pp.plan_code
         FROM procurement_plan_items ppi
         JOIN procurement_plan_waves w ON ppi.wave_id = w.id
         JOIN procurement_plans pp ON ppi.plan_id = pp.id
         WHERE (pp.project_id = ?
            OR pp.project_id = (SELECT spk_number FROM projects WHERE id = ?)
            OR pp.project_id = (SELECT id FROM projects WHERE spk_number = ?))
           AND pp.status != 'ARCHIVED'
         ORDER BY pp.updated_at DESC, w.wave_number ASC`,
      )
      .all(projectId, projectId, projectId) as any[];
  } catch (_) {}

  // Fetch active PR / PO items for this project
  let prPoRows: any[] = [];
  try {
    prPoRows = db
      .prepare(
        `SELECT
           pri.item_id,
           pri.qty,
           COALESCE(pri.expected_delivery_date, pr.expected_delivery_date) as expected_delivery_date,
           pr.pr_number,
           pr.status as pr_status,
           pr.remarks as pr_remarks,
           po.po_number,
           po.status as po_status
         FROM pr_items pri
         JOIN purchase_requests pr ON pri.pr_id = pr.id
         LEFT JOIN purchase_orders po ON pri.po_id = po.id
         WHERE (pr.project_id = ?
            OR pr.project_id = (SELECT spk_number FROM projects WHERE id = ?)
            OR pr.project_id = (SELECT id FROM projects WHERE spk_number = ?))
           AND COALESCE(pr.archived, 0) = 0
           AND pr.status != 'CANCELLED'
         ORDER BY pr.created_at DESC`,
      )
      .all(projectId, projectId, projectId) as any[];
  } catch (_) {}

  const validStepIds = new Set(cleanList.map((r) => String(r.id)));

  // Parse predecessor_ids once so we can compute topological roles and find downstream consumers
  const parsedCleanList = cleanList.map((item) => {
    let preds: string[] = [];
    try {
      preds =
        typeof item.predecessor_ids === "string"
          ? JSON.parse(item.predecessor_ids || "[]")
          : Array.isArray(item.predecessor_ids)
            ? item.predecessor_ids
            : [];
    } catch (_) {
      preds = [];
    }
    const validPreds = preds.map(String).filter((pid) => validStepIds.has(pid));
    return {
      ...item,
      predecessor_ids: validPreds,
    };
  });

  // Compute outgoing map for topological role detection
  const outgoingByStepId = new Map<string, any[]>();
  parsedCleanList.forEach((s) => outgoingByStepId.set(String(s.id), []));
  parsedCleanList.forEach((s) => {
    for (const pid of s.predecessor_ids) {
      const list = outgoingByStepId.get(String(pid)) || [];
      list.push(s);
      outgoingByStepId.set(String(pid), list);
    }
  });

  return parsedCleanList.map((item) => {
    const isProductNode =
      String(item.node_type || "").toUpperCase() === "PRODUCT";

    if (!isProductNode) {
      // PROCESS nodes focus strictly on operation & SOP; QC parameters live on downstream PRODUCT (WIP / FG) cards
      return {
        ...item,
        product_role: null,
        qc_parameters: [],
        qc_criteria: "",
      };
    }

    const incomingNodes = parsedCleanList.filter((p) =>
      item.predecessor_ids.includes(String(p.id)),
    );
    const outgoingNodes = outgoingByStepId.get(String(item.id)) || [];

    // 3-Role Automatic Topological Classification:
    // 1. MATERIAL_INPUT: incomingCount === 0 (connected before a process)
    // 2. WIP_SUB_ASSY: incomingCount > 0 && outgoingCount > 0 (after a process, feeding a downstream process)
    // 3. FINISHED_GOOD: incomingCount > 0 && outgoingCount === 0 (terminal output after final process)
    const productRole: "MATERIAL_INPUT" | "WIP_SUB_ASSY" | "FINISHED_GOOD" =
      incomingNodes.length === 0
        ? "MATERIAL_INPUT"
        : outgoingNodes.length > 0
          ? "WIP_SUB_ASSY"
          : "FINISHED_GOOD";

    // Auto-inherit legacy qc_criteria from upstream PROCESS nodes if this WIP/FG Product card has none yet
    const inheritedProcessQc =
      productRole !== "MATERIAL_INPUT"
        ? incomingNodes
            .filter(
              (p) =>
                String(p.node_type || "PROCESS").toUpperCase() === "PROCESS" &&
                p.qc_criteria &&
                String(p.qc_criteria).trim(),
            )
            .map((p) => `${p.process_name}: ${String(p.qc_criteria).trim()}`)
            .join("; ")
        : "";

    const qcParams =
      productRole === "MATERIAL_INPUT"
        ? []
        : parseQcParametersJson(
            item.qc_parameters || item.qc_parameters_json,
            item.qc_criteria || inheritedProcessQc,
          );
    const syncedQcCriteria =
      productRole === "MATERIAL_INPUT"
        ? String(item.qc_criteria || "").trim()
        : formatQcParametersToSummaryText(
            qcParams,
            item.qc_criteria || inheritedProcessQc,
          );

    let allocs: any[] = [];
    try {
      allocs =
        typeof item.bom_allocations === "string"
          ? JSON.parse(item.bom_allocations || "[]")
          : Array.isArray(item.bom_allocations)
            ? item.bom_allocations
            : [];
    } catch (_) {
      allocs = [];
    }

    // FINISHED_GOOD does not allocate raw/WIP BOM materials
    if (productRole === "FINISHED_GOOD") {
      allocs = [];
    }

    // Find downstream PROCESS consumer (where process.predecessor_ids includes this PRODUCT node id)
    const downstreamProcess = outgoingNodes.find(
      (other) =>
        String(other.node_type || "PROCESS").toUpperCase() === "PROCESS",
    );
    const consumingProcessName = downstreamProcess?.process_name || null;

    if (allocs.length === 0) {
      return {
        ...item,
        product_role: productRole,
        qc_parameters: qcParams,
        qc_criteria: syncedQcCriteria,
        bom_allocations: [],
        procurement_summary: null,
        lifecycle_status:
          item.product_node_lifecycle_status || item.lifecycle_status,
        completed_qty:
          item.product_node_qty !== null
            ? Math.max(
                Number(item.completed_qty || 0),
                Number(item.product_node_qty || 0),
              )
            : item.completed_qty,
      };
    }

    // Match Procurement Plan Wave & PR/PO for this Product Card's allocated BOM items
    const prodNodeNameTag = `[${item.process_name}]`;
    const enrichedAllocs = allocs.map((a: any) => {
      const bomRow = a.bom_id ? bomById.get(String(a.bom_id)) : null;
      const itemId = a.item_id || bomRow?.item_id || null;

      const matchedWave =
        planWaveItems.find(
          (w) =>
            String(w.item_id) === String(itemId) &&
            (String(w.process_step_name || "").includes(prodNodeNameTag) ||
              (consumingProcessName &&
                String(w.process_step_name || "").includes(
                  consumingProcessName,
                ))),
        ) || planWaveItems.find((w) => String(w.item_id) === String(itemId));

      const matchedPr =
        prPoRows.find(
          (p) =>
            String(p.item_id) === String(itemId) &&
            (!matchedWave?.generated_pr_number ||
              p.pr_number === matchedWave.generated_pr_number),
        ) || prPoRows.find((p) => String(p.item_id) === String(itemId));

      return {
        ...a,
        bom_name: a.bom_name || bomRow?.item_name || a.bom_id,
        item_code: bomRow?.item_code || matchedWave?.item_code || null,
        uom: a.uom || bomRow?.uom || "PCS",
        wave_number: matchedWave?.wave_number || null,
        plan_code: matchedWave?.plan_code || null,
        target_arrival_date:
          matchedWave?.target_arrival_date ||
          matchedPr?.expected_delivery_date ||
          null,
        production_need_date: matchedWave?.production_need_date || null,
        pr_number:
          matchedWave?.generated_pr_number || matchedPr?.pr_number || null,
        pr_status: matchedPr?.pr_status || matchedWave?.wave_status || null,
        po_number:
          matchedWave?.generated_po_number || matchedPr?.po_number || null,
        po_status: matchedPr?.po_status || null,
        consuming_process_name: consumingProcessName,
      };
    });

    const primaryWave = enrichedAllocs.find(
      (ea: any) => ea.wave_number || ea.pr_number || ea.target_arrival_date,
    );

    const procurementSummary = primaryWave
      ? {
          plan_code: primaryWave.plan_code,
          wave_number: primaryWave.wave_number,
          target_arrival_date: primaryWave.target_arrival_date,
          production_need_date: primaryWave.production_need_date,
          pr_number: primaryWave.pr_number,
          pr_status: primaryWave.pr_status,
          po_number: primaryWave.po_number,
          po_status: primaryWave.po_status,
          consuming_process_name: consumingProcessName,
        }
      : consumingProcessName
        ? {
            plan_code: null,
            wave_number: null,
            target_arrival_date: null,
            production_need_date: downstreamProcess?.start_date || null,
            pr_number: null,
            pr_status: "UNPLANNED",
            po_number: null,
            po_status: null,
            consuming_process_name: consumingProcessName,
          }
        : null;

    return {
      ...item,
      product_role: productRole,
      qc_parameters: qcParams,
      qc_criteria: syncedQcCriteria,
      bom_allocations: enrichedAllocs,
      procurement_summary: procurementSummary,
      lifecycle_status:
        item.product_node_lifecycle_status || item.lifecycle_status,
      completed_qty:
        item.product_node_qty !== null
          ? Math.max(
              Number(item.completed_qty || 0),
              Number(item.product_node_qty || 0),
            )
          : item.completed_qty,
    };
  });
};

bopRouter.get("/api/production/bop", async (req, res) => {
      try {
        const { project_id } = req.query;
        if (!project_id) {
          return res.status(400).json({ error: "project_id is required" });
        }

        const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];
        if (typeof project_id === "string" && nonMfgIds.includes(project_id.toUpperCase())) {
          return res.json([]);
        }

        // Purge any ghost procurement process nodes (BOP-TSK-...) first
        purgeGhostProcurementBopRowsForProject(String(project_id));

        // Run auto-resolve and integrity check on product nodes
        autoResolveDownstreamProductNodes(project_id as string, "System Auto-Check");

        // Primary: Fetch from local SQLite to guarantee zero node loss
        let bopList = db.prepare(
          `SELECT * FROM bill_of_processes 
           WHERE project_id = ? 
              OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
              OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
           ORDER BY step_sequence ASC`
        ).all(project_id, project_id, project_id) as any[];

        if (!bopList || bopList.length === 0) {
          // Fallback to Firestore (HybridDB) if SQLite has no records for this project
          try {
            const { hybridDb } = await import("../../db/firestoreAdapter.ts");
            const allFsList = await hybridDb.readCollection<any>("bill_of_processes");
            const fsList = (allFsList || []).filter(
              (row: any) =>
                String(row?.project_id) === String(project_id) &&
                !isGhostProcurementBopRow(row)
            );
            if (fsList.length > 0) {
              bopList = fsList;
              bopList.sort((a, b) => (Number(a.step_sequence) || 0) - (Number(b.step_sequence) || 0));
            }
          } catch (fsErr) {
            console.warn("Firestore fallback warning fetching BOP list:", fsErr);
          }
        } else {
          // Asynchronously sync clean local records to Firestore
          bopList
            .filter((item) => !isGhostProcurementBopRow(item))
            .forEach((item) => {
              syncCollectionToFirestore("bill_of_processes", item.id, item);
            });
        }

        const formatted = enrichBopStepsWithProcurementSummary(
          String(project_id),
          bopList || [],
        );

        res.json(formatted);
      } catch (err: any) {
        console.error("Error fetching BoP list:", err);
        res.status(500).json({ error: err.message });
      }
    });

    bopRouter.get(["/api/production/project/:projectId/bop-steps", "/api/production/projects/:projectId/bop-steps", "/api/production/projects/:projectId/bop", "/api/production/project/:projectId/bop"], (req, res) => {
      try {
        const { projectId } = req.params;
        purgeGhostProcurementBopRowsForProject(String(projectId));
        const bopList = db.prepare(
          `SELECT * FROM bill_of_processes 
           WHERE project_id = ? 
              OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
              OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
           ORDER BY step_sequence ASC`
        ).all(projectId, projectId, projectId) as any[];

        const formatted = enrichBopStepsWithProcurementSummary(
          String(projectId),
          bopList || [],
        );
        res.json(formatted);
      } catch (err: any) {
        console.error("Error fetching project bop-steps:", err);
        res.status(500).json({ error: "Failed to fetch BOP steps" });
      }
    });

    bopRouter.post(
      "/api/production/bop/publish-version",
      requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC", "ADMIN", "SUPERADMIN"]),
      async (req, res) => {
        try {
          const { project_id, version_number } = req.body;
          if (!project_id || !version_number) {
            return res.status(400).json({ error: "project_id and version_number are required" });
          }

          const actor = getActor(req);

          // 1. Fetch all current BoP steps for this project
          const bopList = db.prepare(
            `SELECT * FROM bill_of_processes 
             WHERE project_id = ? 
                OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
                OR project_id = (SELECT id FROM projects WHERE spk_number = ?)
             ORDER BY step_sequence ASC`
          ).all(project_id, project_id, project_id) as any[];

          if (!bopList || bopList.length === 0) {
            return res.status(400).json({ error: "Cannot publish empty BoP routing. Add steps first." });
          }

          // 2. Mark previous versions as inactive
          db.prepare("UPDATE bop_versions SET is_active = 0 WHERE project_id = ?").run(project_id);

          // 3. Create version record
          const versionId = `BOP-VER-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          db.prepare(
            `INSERT INTO bop_versions (id, project_id, version_number, routing_json, published_at, published_by, is_active)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 1)`
          ).run(versionId, project_id, String(version_number).trim(), JSON.stringify(bopList), actor);

          // 4. Update project timestamp
          try {
            db.prepare("UPDATE projects SET bq_updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(project_id);
          } catch (_) {}

          logAudit(
            actor,
            "PUBLISH_BOP_VERSION",
            "BOP_VERSION",
            versionId,
            `Published BoP routing version ${version_number} with ${bopList.length} steps for project ${project_id}`
          );

          emitProductionUpdate("BOP_VERSION_PUBLISHED", {
            project_id,
            version_id: versionId,
            version_number,
            step_count: bopList.length,
          });

          res.json({
            success: true,
            version_id: versionId,
            version_number,
            message: `Version ${version_number} published successfully with ${bopList.length} steps.`,
          });
        } catch (err: any) {
          console.error("Error publishing BoP version:", err);
          res.status(500).json({ error: err.message || "Failed to publish BoP version" });
        }
      }
    );

bopRouter.get("/api/production/bop/:id/wip-status", (req, res) => {
      try {
        const { id } = req.params;
        const bop = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id) as any;
        if (!bop) return res.status(404).json({ error: "BOP not found" });

        const wipInfo = getAvailableInputWipForBop(id, bop.project_id);
        res.json(wipInfo);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.post("/api/production/bop/:id/status", requireRole(["PRODUCTION", "PPIC", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
      try {
        const { id } = req.params;
        const { status, progress, actual_start_date, actual_end_date } = req.body;

        const current = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ?`).get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP item not found" });
        }

        const userIdentifier = getActor(req);

        // Validate Seri Dependency & Active NDPs
        if (status === 'RUNNING' || status === 'COMPLETED' || status === 'PAUSED') {
          // Check for active NDPs
          const activeNdp = db.prepare(`SELECT COUNT(*) as count FROM notice_to_down_processes WHERE bop_id = ? AND status = 'ACTIVE'`).get(id) as any;
          if (activeNdp && activeNdp.count > 0) {
            return res.status(400).json({ error: "Cannot change status while there is an ACTIVE downtime notice (NDP). Resolve it first." });
          }

          if (status === 'RUNNING' && current.node_type !== 'PRODUCT') {
            const assignmentsForThisStep = db.prepare(`
              SELECT manpower_id FROM production_manpower_assignments 
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?))
                AND status NOT IN ('CANCELLED', 'COMPLETED')
            `).all(id, current.project_id, current.process_name) as any[];

            if (assignmentsForThisStep.length === 0) {
              return res.status(400).json({ error: "Cannot start task! No manpower is assigned to this process. Please assign an operator first." });
            }

            preemptiveAutoPauseConflictingSteps(id, current.project_id, userIdentifier);
          }

          // Predecessor & Material Buffer (WIP) Check:
          // For RUNNING: Pipelining check (at least 1 completed WOT from predecessors) AND Material Availability
          if (status === 'RUNNING') {
            const predCheck = checkPredecessorsReadyForPipelining(id, current.project_id);
            if (!predCheck.isReady) {
              return res.status(400).json({
                error: `Tidak dapat memulai tahapan '${current.process_name}'! Belum ada WOT (Work Order Ticket) yang selesai pada proses prasyarat: ${predCheck.incompleteNodeNames.join(", ")}`
              });
            }

            const wipCheck = getAvailableInputWipForBop(id, current.project_id);
            if (wipCheck.isStarved) {
              return res.status(400).json({
                error: `Tidak dapat menjalankan '${current.process_name}'! Stok bahan setengah jadi (WIP) dari '${wipCheck.bottleneckProcess}' belum tersedia (Input minimum selesai: ${wipCheck.minInputProduced}, sudah diolah: ${wipCheck.currentConsumed}).`
              });
            }
          } else if (status === 'COMPLETED') {
            // For full completion: All predecessors must be 100% completed
            const predCheck = checkRecursivePredecessorsCompleted(id, current.project_id);
            if (!predCheck.isCompleted) {
              return res.status(400).json({
                error: `Tidak dapat menyelesaikan tahapan! Tahapan sebelumnya belum selesai secara menyeluruh: ${predCheck.incompleteNodeNames.join(", ")}`
              });
            }
          }
        }

        const projectObj = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(current.project_id) as any;
        const totalProjectQty = projectObj?.qty || 1;

        const newActualStart = actual_start_date || (status === 'RUNNING' && !current.actual_start_date ? new Date().toISOString() : current.actual_start_date);
        const newActualEnd = actual_end_date || (status === 'COMPLETED' ? new Date().toISOString() : current.actual_end_date);
        const newProgress = progress !== undefined ? progress : (status === 'COMPLETED' ? 100 : (status === 'RUNNING' ? (current.progress || 25) : current.progress));
        const newCompletedQty = status === 'COMPLETED' ? totalProjectQty : current.completed_qty;

        let predIds: string[] = [];
        try {
          predIds = Array.isArray(current.predecessor_ids)
            ? current.predecessor_ids
            : JSON.parse(current.predecessor_ids || "[]");
        } catch (e) {
          predIds = [];
        }

        const requestedPauseType = req.body.pause_type;
        const requestedIsManual = req.body.is_manual_pause;

        let newIsManualPause = 0;
        let newPauseType = 'NONE';

        if (status === 'PAUSED') {
          if (requestedIsManual !== undefined) {
            newIsManualPause = requestedIsManual ? 1 : 0;
          } else if (requestedPauseType !== undefined) {
            newIsManualPause = requestedPauseType === 'MANUAL' ? 1 : 0;
          } else {
            newIsManualPause = 1;
          }
          newPauseType = requestedPauseType || (newIsManualPause ? 'MANUAL' : 'AUTO');
        } else {
          newIsManualPause = 0;
          newPauseType = 'NONE';
        }

        const executeStatusChangeTransaction = db.transaction(() => {
          db.prepare(`
            UPDATE bill_of_processes
            SET status = ?, is_manual_pause = ?, pause_type = ?, progress = ?, completed_qty = ?, actual_start_date = ?, actual_end_date = ?,
                completed_by_operator = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_by_operator END,
                completed_at_timestamp = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE completed_at_timestamp END
            WHERE id = ?
          `).run(status, newIsManualPause, newPauseType, newProgress, newCompletedQty, newActualStart, newActualEnd, status, userIdentifier, status, id);

          db.prepare(`
            UPDATE project_tasks
            SET status = ?, is_manual_pause = ?, pause_type = ?, progress = ?, actual_start_date = ?, actual_end_date = ?
            WHERE id = ?
          `).run(status, newIsManualPause, newPauseType, newProgress, newActualStart, newActualEnd, id);

          // Update operator allocation status accordingly
          if (status === 'RUNNING') {
            db.prepare(`
              UPDATE production_manpower_assignments
              SET status = 'ACTIVE'
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?)) AND status IN ('SCHEDULED', 'PAUSED')
            `).run(id, current.project_id, current.process_name);
          } else if (status === 'PAUSED') {
            db.prepare(`
              UPDATE production_manpower_assignments
              SET status = 'PAUSED'
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?)) AND status = 'ACTIVE'
            `).run(id, current.project_id, current.process_name);
          } else if (status === 'COMPLETED') {
            db.prepare(`
              UPDATE production_manpower_assignments
              SET status = 'COMPLETED'
              WHERE (bop_id = ? OR (bop_id IS NULL AND project_id = ? AND task_name = ?)) AND status IN ('ACTIVE', 'SCHEDULED', 'PAUSED_NDP', 'PAUSED')
            `).run(id, current.project_id, current.process_name);
          }

          // Also sync lot_routing_executions so the tickets move!
          const projectLots = db.prepare(`SELECT * FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC`).all(current.project_id) as any[];
          
          let cumulativeStartOffsetMs = 0;
          const cycleTimeMins = current.cycle_time_minutes || 10;
          const assignment = db.prepare(`SELECT planned_hours FROM production_manpower_assignments WHERE bop_id = ? AND status IN ('ACTIVE', 'SCHEDULED', 'PAUSED') LIMIT 1`).get(current.id) as any;
          const workingHoursPerDay = assignment?.planned_hours || 8;
          const realTimeMultiplier = 24 / workingHoursPerDay;
          const nowMs = Date.now();

          for (const lot of projectLots) {
             const lotStartMs = nowMs + cumulativeStartOffsetMs;
             const lotStartIso = new Date(lotStartMs).toISOString();
             
             const workMs = (lot.target_qty || 1) * cycleTimeMins * 60 * 1000;
             cumulativeStartOffsetMs += (workMs * realTimeMultiplier);

             let lotTargetStatus = status;
             if (status === 'RUNNING') {
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
               lotTargetStatus = isLotUnlocked ? 'RUNNING' : 'LOCKED';
             }

             const exec = db.prepare(`SELECT id FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot.id, id) as any;
             if (exec) {
                db.prepare(`
                  UPDATE lot_routing_executions 
                  SET status = ?, 
                      operator_name = COALESCE(NULLIF(operator_name, ''), ?), 
                      good_qty = CASE WHEN ? = 'COMPLETED' THEN ? ELSE good_qty END,
                      start_time = COALESCE(start_time, ?), 
                      end_time = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE end_time END 
                  WHERE id = ?
                `).run(lotTargetStatus, userIdentifier, status, lot.target_qty || 0, lotStartIso, status, exec.id);
             } else {
                const newId = "LEX-" + Math.random().toString(36).substr(2, 9);
                db.prepare(`
                  INSERT INTO lot_routing_executions (id, lot_id, bop_id, status, good_qty, operator_name, start_time, end_time) 
                  VALUES (?, ?, ?, ?, CASE WHEN ? = 'COMPLETED' THEN ? ELSE 0 END, ?, ?, CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END)
                `).run(newId, lot.id, id, lotTargetStatus, status, lot.target_qty || 0, userIdentifier, lotStartIso, status);
             }
          }

          if (status === 'COMPLETED') {
            autoResolveDownstreamProductNodes(current.project_id, userIdentifier);
            autoStartDownstreamProcesses(current.project_id, userIdentifier);
          } else if (status === 'RUNNING') {
            autoStartDownstreamProcesses(current.project_id, userIdentifier);
          }

          logAudit(userIdentifier, "BOP_STATUS_UPDATE", "BOP", id, `BoP step '${current.process_name}' status changed from ${current.status} to ${status}`);
        });

        executeStatusChangeTransaction();

        emitProductionUpdate("BOP_STATUS_CHANGED", { bopId: id, status, projectId: current.project_id });

        res.json({ success: true, message: `Task updated to ${status}` });
      } catch (err: any) {
        console.error("Error updating BoP status:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.post("/api/production/bop/:id/increment", requireRole(["PRODUCTION", "PPIC", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
      try {
        const { id } = req.params;
        const { increment = 1, set_completed_qty } = req.body || {};

        const current = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ?`).get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP item not found" });
        }

        const project = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(current.project_id) as any;
        const targetQty = project?.qty || 1;

        const userIdentifier = getActor(req);

        // Check for active NDPs
        const activeNdp = db.prepare(`SELECT COUNT(*) as count FROM notice_to_down_processes WHERE bop_id = ? AND status = 'ACTIVE'`).get(id) as any;
        if (activeNdp && activeNdp.count > 0) {
          return res.status(400).json({ error: "Cannot process units while downtime notice (NDP) is active." });
        }

        // Validate Material Availability (WIP Ledger Buffer)
        // If this process has predecessors, it cannot produce more units than min(completed_qty of predecessors)
        const wipCheck = getAvailableInputWipForBop(id, current.project_id);
        const requestedQtyToAdd = set_completed_qty !== undefined ? (Number(set_completed_qty) - Number(current.completed_qty || 0)) : Number(increment);
        
        if (requestedQtyToAdd > 0 && wipCheck.availableQty < requestedQtyToAdd) {
          // Auto-pause station to STARVED state if no input material is available
          db.prepare(`UPDATE bill_of_processes SET status = 'PAUSED', is_manual_pause = 0, pause_type = 'STARVED' WHERE id = ?`).run(id);
          db.prepare(`UPDATE project_tasks SET status = 'PAUSED', is_manual_pause = 0, pause_type = 'STARVED' WHERE id = ?`).run(id);
          db.prepare(`UPDATE lot_routing_executions SET status = 'PAUSED' WHERE bop_id = ? AND status = 'RUNNING'`).run(id);
          
          emitProductionUpdate("BOP_STATUS_CHANGED", { bopId: id, status: "PAUSED", projectId: current.project_id, reason: "STARVED" });

          return res.status(400).json({ 
            error: `Insufficient Work-In-Progress (WIP) buffer! Station '${current.process_name}' requires input from '${wipCheck.bottleneckProcess}' (Available: ${wipCheck.availableQty} units, Required: ${requestedQtyToAdd} units).`,
            isStarved: true,
            bottleneckProcess: wipCheck.bottleneckProcess,
            availableQty: wipCheck.availableQty,
            minInputProduced: wipCheck.minInputProduced,
            currentConsumed: wipCheck.currentConsumed
          });
        }

        let newCompletedQty = set_completed_qty !== undefined ? Number(set_completed_qty) : ((current.completed_qty || 0) + Number(increment));
        if (isNaN(newCompletedQty) || newCompletedQty < 0) newCompletedQty = 0;
        if (newCompletedQty > targetQty) newCompletedQty = targetQty;

        const newProgress = Math.min(100, Math.round((newCompletedQty / targetQty) * 100));
        let newStatus = current.status;
        if (current.status === 'PENDING' && newCompletedQty > 0) {
          newStatus = 'RUNNING';
        }
        if (newCompletedQty >= targetQty) {
          newStatus = 'COMPLETED';
        }

        const now = new Date().toISOString();
        const newActualStart = current.actual_start_date || now;
        const newActualEnd = newStatus === 'COMPLETED' ? (current.actual_end_date || now) : current.actual_end_date;

        db.transaction(() => {
          db.prepare(`
            UPDATE bill_of_processes
            SET completed_qty = ?,
                progress = ?,
                status = ?,
                actual_start_date = ?,
                actual_end_date = ?,
                completed_by_operator = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_by_operator END,
                completed_at_timestamp = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE completed_at_timestamp END
            WHERE id = ?
          `).run(newCompletedQty, newProgress, newStatus, newActualStart, newActualEnd, newStatus, userIdentifier, newStatus, id);

          db.prepare(`
            UPDATE project_tasks
            SET progress = ?, status = ?, actual_start_date = ?, actual_end_date = ?
            WHERE id = ?
          `).run(newProgress, newStatus, newActualStart, newActualEnd, id);

          // Update Lots execution dynamically for piece flow
          const projectLots = db.prepare(`SELECT * FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC`).all(current.project_id) as any[];
          let remainingQtyToAllocate = newCompletedQty;

          for (const lot of projectLots) {
            const lotTarget = lot.target_qty || 1;
            const lotGoodQty = Math.min(lotTarget, Math.max(0, remainingQtyToAllocate));
            remainingQtyToAllocate -= lotGoodQty;

            const lotStatus = lotGoodQty >= lotTarget ? 'COMPLETED' : (lotGoodQty > 0 ? 'RUNNING' : 'PENDING');

            const exec = db.prepare(`SELECT id FROM lot_routing_executions WHERE lot_id = ? AND bop_id = ?`).get(lot.id, id) as any;
            if (exec) {
              db.prepare(`
                UPDATE lot_routing_executions
                SET good_qty = ?, status = ?, operator_name = ?,
                    start_time = COALESCE(start_time, ?),
                    end_time = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE end_time END
                WHERE id = ?
              `).run(lotGoodQty, lotStatus, userIdentifier, now, lotStatus, exec.id);
            } else if (lotGoodQty > 0) {
              const newExecId = "LEX-" + Math.random().toString(36).substr(2, 9);
              db.prepare(`
                INSERT INTO lot_routing_executions (id, lot_id, bop_id, status, good_qty, operator_name, start_time, end_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END)
              `).run(newExecId, lot.id, id, lotStatus, lotGoodQty, userIdentifier, now, lotStatus);
            }
          }

          // Trigger pipelining: If at least 1 WOT / unit is finished, downstream dependent steps can start!
          if (newCompletedQty > 0) {
            autoStartDownstreamProcesses(current.project_id, userIdentifier);
          }

          if (newStatus === 'COMPLETED') {
            autoResolveDownstreamProductNodes(current.project_id, userIdentifier);
          }
        })();

        emitProductionUpdate("BOP_INCREMENT", { bopId: id, completedQty: newCompletedQty, progress: newProgress, status: newStatus, projectId: current.project_id });

        res.json({
          success: true,
          completed_qty: newCompletedQty,
          target_qty: targetQty,
          progress: newProgress,
          status: newStatus,
          process_name: current.process_name
        });
      } catch (err: any) {
        console.error("Error incrementing BoP unit:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.post("/api/production/bop/:id/schedule", requireRole(["PPIC", "PRODUCTION", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
      try {
        const { id } = req.params;
        const { start_date, end_date, standard_hours, cycle_time_minutes, shift_mode } = req.body;

        const current = db.prepare(`SELECT * FROM bill_of_processes WHERE id = ?`).get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP item not found" });
        }

        const hoursNum = Number(standard_hours) || current.standard_hours || 8;
        const cycleTimeNum = Number(cycle_time_minutes) || current.cycle_time_minutes || (hoursNum * 60);
        const shiftModeNum = Number(shift_mode) || current.shift_mode || 1;

        db.prepare(`
          UPDATE bill_of_processes
          SET start_date = COALESCE(?, start_date),
              end_date = COALESCE(?, end_date),
              standard_hours = ?,
              cycle_time_minutes = ?,
              shift_mode = ?
          WHERE id = ?
        `).run(start_date || null, end_date || null, hoursNum, cycleTimeNum, shiftModeNum, id);

        db.prepare(`
          UPDATE project_tasks
          SET start_date = COALESCE(?, start_date),
              end_date = COALESCE(?, end_date),
              required_hours = ?
          WHERE id = ? OR (project_id = ? AND task_name = ?)
        `).run(start_date || null, end_date || null, hoursNum, id, current.project_id, current.process_name);

        logAudit("admin", "BOP_SCHEDULE_UPDATE", "BOP", id, `Updated schedule & cycle time plan for '${current.process_name}': Cycle Time ${cycleTimeNum}m/unit, Std Hours ${hoursNum}h`);

        res.json({ success: true, message: "Schedule & cycle time plan updated successfully" });
      } catch (err: any) {
        console.error("Error updating BoP schedule:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.patch("/api/production/bop/:id", requireRole(["PRODUCTION", "PPIC", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
      try {
        const { id } = req.params;
        const { cycle_time_minutes, station_id, process_name, standard_hours } = req.body;

        const current = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP item not found" });
        }

        const newCycle = cycle_time_minutes !== undefined ? Number(cycle_time_minutes) : current.cycle_time_minutes;
        const newStation = station_id !== undefined ? station_id : current.station_id;
        const newProcessName = process_name !== undefined ? process_name : current.process_name;
        const newStdHours = standard_hours !== undefined ? Number(standard_hours) : (newCycle ? Number((newCycle / 60).toFixed(2)) : current.standard_hours);

        db.prepare(`
          UPDATE bill_of_processes
          SET cycle_time_minutes = ?,
              station_id = ?,
              process_name = ?,
              standard_hours = ?
          WHERE id = ?
        `).run(newCycle, newStation, newProcessName, newStdHours, id);

        const updated = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id);
        try {
          syncCollectionToFirestore("bill_of_processes", id, updated);
        } catch (syncErr) {}
        res.json({ success: true, data: updated });
      } catch (err: any) {
        console.error("Error updating BoP step:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.put("/api/production/bop/:id/machine", requireRole(["PRODUCTION", "PPIC", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
      try {
        const { id } = req.params;
        const { 
          machine_id, 
          alternative_machine_ids, 
          setup_time_minutes, 
          teardown_time_minutes, 
          cycle_time_minutes,
          force_bypass 
        } = req.body;
        
        const current = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP process item not found" });
        }
        
        const targetMachineId = machine_id || req.body.assigned_machine_id || null;

        if (targetMachineId) {
          const machine = db.prepare("SELECT * FROM items WHERE id = ?").get(targetMachineId) as any;
          if (!machine) {
            return res.status(404).json({ error: "Machine not found" });
          }

          const allowsBypass = Boolean(machine.bypass_multi_station || force_bypass);
          
          if (!allowsBypass) {
            // Check across all active projects/processes
            const conflict = db.prepare(`
              SELECT b.id, b.process_name, p.id as project_id, p.name as project_name
              FROM bill_of_processes b
              JOIN projects p ON b.project_id = p.id
              WHERE b.assigned_machine_id = ?
                AND b.id != ?
                AND p.status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED')
                AND COALESCE(b.lifecycle_status, 'ACTIVE') NOT IN ('COMPLETED', 'FINISHED', 'CANCELLED')
              LIMIT 1
            `).get(targetMachineId, id) as any;

            if (conflict) {
              return res.status(400).json({ 
                error: `Machine [${machine.name || machine.item_code}] is currently assigned to Project [${conflict.project_name}] Process [${conflict.process_name}]. Cannot double-assign.` 
              });
            }
          }
        }
        
        // Format alternative machines
        let altJson = '[]';
        if (Array.isArray(alternative_machine_ids)) {
          altJson = JSON.stringify(alternative_machine_ids);
        } else if (typeof alternative_machine_ids === 'string') {
          altJson = alternative_machine_ids;
        }

        // Release previous machine schedule if changing
        if (current.assigned_machine_id && current.assigned_machine_id !== targetMachineId) {
          db.prepare(`
            UPDATE machine_schedules
            SET is_active = 0, released_at = CURRENT_TIMESTAMP
            WHERE machine_id = ? AND process_id = ? AND is_active = 1
          `).run(current.assigned_machine_id, id);
        }

        // Update bill_of_processes
        db.prepare(`
          UPDATE bill_of_processes 
          SET assigned_machine_id = ?,
              machine_id = ?,
              alternative_machine_ids = ?,
              setup_time_minutes = COALESCE(?, setup_time_minutes, 0),
              teardown_time_minutes = COALESCE(?, teardown_time_minutes, 0),
              cycle_time_minutes = COALESCE(?, cycle_time_minutes)
          WHERE id = ?
        `).run(
          targetMachineId, 
          targetMachineId,
          altJson, 
          setup_time_minutes !== undefined ? Number(setup_time_minutes) : null,
          teardown_time_minutes !== undefined ? Number(teardown_time_minutes) : null,
          cycle_time_minutes !== undefined ? Number(cycle_time_minutes) : null,
          id
        );

        // Record in machine_schedules if assigned
        if (targetMachineId) {
          const existingSched = db.prepare(`
            SELECT id FROM machine_schedules 
            WHERE machine_id = ? AND process_id = ? AND is_active = 1
          `).get(targetMachineId, id);

          if (!existingSched) {
            db.prepare(`
              INSERT INTO machine_schedules (
                id, machine_id, project_id, station_id, process_id, assigned_at, is_active, bypass_station_lock
              ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, ?)
            `).run(
              "SCHED-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
              targetMachineId,
              current.project_id,
              current.station_id || "STATION-DEFAULT",
              id,
              req.body.force_bypass ? 1 : 0
            );
          }

          // Update machine status to ASSIGNED if AVAILABLE
          db.prepare(`
            UPDATE items 
            SET machine_status = 'ASSIGNED'
            WHERE id = ? AND (machine_status = 'AVAILABLE' OR machine_status IS NULL)
          `).run(targetMachineId);
        }
        
        const updated = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id);
        res.json(updated);
      } catch (err: any) {
        console.error("Error updating machine assignment:", err);
        res.status(500).json({ error: err.message });
      }
    });

// Warehouse Machine BOP Integration Endpoints
bopRouter.get("/api/production/machines/:machineId/bop-assignments", (req, res) => {
  try {
    const { machineId } = req.params;
    const machine = db.prepare("SELECT * FROM items WHERE id = ?").get(machineId) as any;
    if (!machine) {
      return res.status(404).json({ error: "Machine asset not found in warehouse inventory." });
    }

    // Active BOP assignments
    const assignments = db.prepare(`
      SELECT b.id as bop_id, b.project_id, b.process_name, b.step_sequence, b.cycle_time_minutes,
             b.setup_time_minutes, b.teardown_time_minutes, b.status as bop_status, b.progress,
             b.work_center_name, b.station_id,
             p.name as project_name, p.spk_number, p.customer, p.status as project_status
      FROM bill_of_processes b
      JOIN projects p ON b.project_id = p.id
      WHERE (b.assigned_machine_id = ? OR b.machine_id = ?)
        AND p.status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED', 'ARCHIVED')
      ORDER BY p.name ASC, b.step_sequence ASC
    `).all(machineId, machineId) as any[];

    // Active manufacturing projects for linking options
    const activeProjects = db.prepare(`
      SELECT id, name, spk_number, customer, status, bop_status
      FROM projects
      WHERE status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED', 'ARCHIVED')
      ORDER BY name ASC
    `).all() as any[];

    // Unassigned BOP processes across active projects
    const availableBops = db.prepare(`
      SELECT b.id, b.project_id, b.process_name, b.step_sequence, b.work_center_name,
             p.name as project_name, p.spk_number
      FROM bill_of_processes b
      JOIN projects p ON b.project_id = p.id
      WHERE (b.assigned_machine_id IS NULL OR b.assigned_machine_id = '')
        AND UPPER(b.node_type) NOT IN ('PRODUCT', 'START', 'END')
        AND p.status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED', 'ARCHIVED')
      ORDER BY p.name ASC, b.step_sequence ASC
    `).all() as any[];

    res.json({
      ok: true,
      machine,
      assignments,
      activeProjects,
      availableBops
    });
  } catch (err: any) {
    console.error("Error fetching machine BOP assignments:", err);
    res.status(500).json({ error: err.message });
  }
});

bopRouter.post("/api/production/machines/:machineId/link-bop", requireRole(["PRODUCTION", "PPIC", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
  try {
    const { machineId } = req.params;
    const { bop_id, cycle_time_minutes, setup_time_minutes, teardown_time_minutes, force_bypass } = req.body;

    if (!bop_id) {
      return res.status(400).json({ error: "bop_id is required" });
    }

    const machine = db.prepare("SELECT * FROM items WHERE id = ?").get(machineId) as any;
    if (!machine) {
      return res.status(404).json({ error: "Machine asset not found in warehouse inventory." });
    }

    const bop = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(bop_id) as any;
    if (!bop) {
      return res.status(404).json({ error: "Target BOP process node not found." });
    }

    const allowsBypass = Boolean(machine.bypass_multi_station || force_bypass);
    if (!allowsBypass) {
      const conflict = db.prepare(`
        SELECT b.id, b.process_name, p.name as project_name
        FROM bill_of_processes b
        JOIN projects p ON b.project_id = p.id
        WHERE (b.assigned_machine_id = ? OR b.machine_id = ?)
          AND b.id != ?
          AND p.status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED')
          AND COALESCE(b.lifecycle_status, 'ACTIVE') NOT IN ('COMPLETED', 'FINISHED', 'CANCELLED')
        LIMIT 1
      `).get(machineId, machineId, bop_id) as any;

      if (conflict) {
        return res.status(400).json({
          error: `Machine [${machine.name}] is already assigned to Project [${conflict.project_name}] Process [${conflict.process_name}]. Enable multi-station bypass to allow multi-project assignment.`
        });
      }
    }

    // Link machine to BOP
    db.prepare(`
      UPDATE bill_of_processes
      SET assigned_machine_id = ?,
          machine_id = ?,
          cycle_time_minutes = COALESCE(?, cycle_time_minutes),
          setup_time_minutes = COALESCE(?, setup_time_minutes),
          teardown_time_minutes = COALESCE(?, teardown_time_minutes)
      WHERE id = ?
    `).run(
      machineId,
      machineId,
      cycle_time_minutes !== undefined ? Number(cycle_time_minutes) : null,
      setup_time_minutes !== undefined ? Number(setup_time_minutes) : null,
      teardown_time_minutes !== undefined ? Number(teardown_time_minutes) : null,
      bop_id
    );

    // Record schedule
    db.prepare(`
      INSERT INTO machine_schedules (
        id, machine_id, project_id, station_id, process_id, assigned_at, is_active, bypass_station_lock
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, ?)
    `).run(
      "SCHED-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
      machineId,
      bop.project_id,
      bop.station_id || "STATION-DEFAULT",
      bop_id,
      force_bypass ? 1 : 0
    );

    // Update machine status
    db.prepare(`
      UPDATE items
      SET machine_status = 'ASSIGNED',
          operational_status = COALESCE(NULLIF(operational_status, ''), 'OPERATIONAL')
      WHERE id = ?
    `).run(machineId);

    const updatedBop = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(bop_id);
    res.json({ ok: true, bop: updatedBop, message: `Successfully linked machine ${machine.name} to BOP process ${bop.process_name}` });
  } catch (err: any) {
    console.error("Error linking machine to BOP:", err);
    res.status(500).json({ error: err.message });
  }
});

bopRouter.post("/api/production/machines/:machineId/unlink-bop", requireRole(["PRODUCTION", "PPIC", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
  try {
    const { machineId } = req.params;
    const { bop_id } = req.body;

    if (!bop_id) {
      return res.status(400).json({ error: "bop_id is required" });
    }

    db.prepare(`
      UPDATE bill_of_processes
      SET assigned_machine_id = NULL,
          machine_id = NULL
      WHERE id = ? AND (assigned_machine_id = ? OR machine_id = ?)
    `).run(bop_id, machineId, machineId);

    db.prepare(`
      UPDATE machine_schedules
      SET is_active = 0, released_at = CURRENT_TIMESTAMP
      WHERE machine_id = ? AND process_id = ? AND is_active = 1
    `).run(machineId, bop_id);

    // Check if machine has remaining active assignments
    const remaining = db.prepare(`
      SELECT count(*) as count
      FROM bill_of_processes b
      JOIN projects p ON b.project_id = p.id
      WHERE (b.assigned_machine_id = ? OR b.machine_id = ?)
        AND p.status NOT IN ('FINISHED', 'CLOSED', 'CANCELLED', 'ARCHIVED')
    `).get(machineId, machineId) as any;

    if (!remaining || remaining.count === 0) {
      db.prepare(`
        UPDATE items
        SET machine_status = 'AVAILABLE'
        WHERE id = ? AND machine_status = 'ASSIGNED'
      `).run(machineId);
    }

    res.json({ ok: true, message: "Successfully unlinked machine from BOP process." });
  } catch (err: any) {
    console.error("Error unlinking machine from BOP:", err);
    res.status(500).json({ error: err.message });
  }
});

bopRouter.put("/api/production/bop/:id/station", requireRole(["PRODUCTION", "PPIC", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
      try {
        const { id } = req.params;
        const { station_id } = req.body;

        const current = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id) as any;
        if (!current) {
          return res.status(404).json({ error: "BoP process item not found" });
        }

        // Validate station exists if provided
        let targetStationId: string | null = station_id ? String(station_id).trim() : null;
        if (targetStationId && targetStationId !== "") {
          const stn = db.prepare("SELECT * FROM project_stations WHERE id = ? OR station_code = ?").get(targetStationId, targetStationId) as any;
          if (stn) {
            targetStationId = stn.id;
          }
        } else {
          targetStationId = null;
        }

        db.prepare(`
          UPDATE bill_of_processes
          SET station_id = ?
          WHERE id = ?
        `).run(targetStationId, id);

        const updated = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id);
        try {
          syncCollectionToFirestore("bill_of_processes", id, updated);
        } catch (syncErr) {}

        res.json({ success: true, data: updated });
      } catch (err: any) {
        console.error("Error updating BoP process station:", err);
        res.status(500).json({ error: err.message });
      }
    });

bopRouter.post("/api/production/bop/:id/increment-lot", requireRole(["PRODUCTION", "PPIC", "ENGINEERING", "FC", "ADMIN", "SUPERADMIN"]), (req, res) => {
      try {
        const { id } = req.params;
        const current = db.prepare("SELECT * FROM bill_of_processes WHERE id = ?").get(id) as any;
        if (!current) return res.status(404).json({ error: "BoP item not found" });

        const firstLot = db.prepare("SELECT target_qty FROM production_lots WHERE project_id = ? ORDER BY lot_number ASC LIMIT 1").get(current.project_id) as any;
        const lotSize = Math.max(1, Number(firstLot?.target_qty || 10));

        const project = db.prepare("SELECT qty FROM projects WHERE id = ?").get(current.project_id) as any;
        const targetQty = project?.qty || 1;

        const currentQty = Number(current.completed_qty || 0);
        const nextLotTarget = Math.min(targetQty, (Math.floor(currentQty / lotSize) + 1) * lotSize);
        const qtyToAdd = nextLotTarget - currentQty;

        if (qtyToAdd <= 0) {
          return res.json({ success: true, message: "All lots already completed for this step", completed_qty: currentQty });
        }

        // Call internal increment with qtyToAdd
        const wipCheck = getAvailableInputWipForBop(id, current.project_id);
        if (wipCheck.availableQty < qtyToAdd) {
          return res.status(400).json({
            error: `Insufficient WIP stock to process 1 full lot (${qtyToAdd} units). Available: ${wipCheck.availableQty} units.`,
            availableQty: wipCheck.availableQty,
            bottleneckProcess: wipCheck.bottleneckProcess
          });
        }

        const userIdentifier = getActor(req);
        const now = new Date().toISOString();
        const newCompletedQty = nextLotTarget;
        const newProgress = Math.min(100, Math.round((newCompletedQty / targetQty) * 100));
        const newStatus = newCompletedQty >= targetQty ? 'COMPLETED' : 'RUNNING';

        db.transaction(() => {
          db.prepare(`
            UPDATE bill_of_processes
            SET completed_qty = ?, progress = ?, status = ?,
                actual_start_date = COALESCE(actual_start_date, ?),
                actual_end_date = CASE WHEN ? = 'COMPLETED' THEN ? ELSE actual_end_date END,
                completed_by_operator = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_by_operator END
            WHERE id = ?
          `).run(newCompletedQty, newProgress, newStatus, now, newStatus, now, newStatus, userIdentifier, id);

          db.prepare(`
            UPDATE project_tasks
            SET progress = ?, status = ?, actual_start_date = COALESCE(actual_start_date, ?),
                actual_end_date = CASE WHEN ? = 'COMPLETED' THEN ? ELSE actual_end_date END
            WHERE id = ?
          `).run(newProgress, newStatus, now, newStatus, now, id);

          autoStartDownstreamProcesses(current.project_id, userIdentifier);
          if (newStatus === 'COMPLETED') {
            autoResolveDownstreamProductNodes(current.project_id, userIdentifier);
          }
        })();

        emitProductionUpdate("BOP_INCREMENT", { bopId: id, completedQty: newCompletedQty, progress: newProgress, status: newStatus, projectId: current.project_id });
        res.json({ success: true, completed_qty: newCompletedQty, progress: newProgress, status: newStatus, added_qty: qtyToAdd });
      } catch (err: any) {
        console.error("Increment lot error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // ==========================================
    // PROJECT STATIONS MANAGEMENT ENDPOINTS
    // ==========================================

    const resolveStationProjectMeta = (rawProjectId: string) => {
      const proj = db.prepare(`
        SELECT id, spk_number FROM projects WHERE id = ? OR spk_number = ? LIMIT 1
      `).get(rawProjectId, rawProjectId) as any;
      return {
        canonicalId: proj?.id || rawProjectId,
        spkNumber: proj?.spk_number || rawProjectId,
        rawId: rawProjectId
      };
    };

    // Get all stations for a specific project (starts from 0, no default auto-seeding)
    bopRouter.get("/api/production/projects/:projectId/stations", (req, res) => {
      try {
        const { projectId } = req.params;
        if (!projectId) {
          return res.status(400).json({ error: "projectId is required" });
        }

        const { canonicalId, spkNumber, rawId } = resolveStationProjectMeta(projectId);

        // Clean up any legacy auto-seeded default stations (STN-01..03) for this project if unused by BOP steps
        try {
          db.prepare(`
            DELETE FROM project_stations
            WHERE project_id IN (?, ?, ?)
              AND station_code IN ('STN-01', 'STN-02', 'STN-03')
              AND station_name IN (
                'Station 1: Fabrication & Cutting',
                'Station 2: Sub-Assembly & Welding',
                'Station 3: Finishing & Final QC'
              )
              AND id NOT IN (
                SELECT DISTINCT station_id FROM bill_of_processes
                WHERE project_id IN (?, ?, ?) AND station_id IS NOT NULL AND station_id != ''
              )
              AND station_code NOT IN (
                SELECT DISTINCT station_id FROM bill_of_processes
                WHERE project_id IN (?, ?, ?) AND station_id IS NOT NULL AND station_id != ''
              )
          `).run(canonicalId, spkNumber, rawId, canonicalId, spkNumber, rawId, canonicalId, spkNumber, rawId);
        } catch (cleanupErr) {}

        const stations = db.prepare(`
          SELECT * FROM project_stations 
          WHERE project_id IN (?, ?, ?)
          ORDER BY station_sequence ASC, station_code ASC
        `).all(canonicalId, spkNumber, rawId) as any[];

        res.json({ ok: true, stations });
      } catch (err: any) {
        console.error("Error fetching project stations:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Create a new station for a project
    bopRouter.post("/api/production/projects/:projectId/stations", (req, res) => {
      try {
        const { projectId } = req.params;
        const { station_code, station_name, station_type, max_manpower, work_center_id, description, station_sequence } = req.body;

        if (!projectId || !station_code || !station_name) {
          return res.status(400).json({ error: "projectId, station_code, and station_name are required" });
        }

        const { canonicalId, spkNumber, rawId } = resolveStationProjectMeta(projectId);
        const cleanCode = String(station_code).trim().toUpperCase();
        const cleanName = String(station_name).trim();

        // Check uniqueness of station_code in project across canonical ID and SPK number
        const existing = db.prepare(`
          SELECT id FROM project_stations 
          WHERE project_id IN (?, ?, ?) AND UPPER(station_code) = UPPER(?)
        `).get(canonicalId, spkNumber, rawId, cleanCode);

        if (existing) {
          return res.status(400).json({ error: `Station code '${cleanCode}' is already used in this project.` });
        }

        // Determine sequence
        const maxSeqRow = db.prepare(`
          SELECT MAX(station_sequence) as max_seq FROM project_stations WHERE project_id IN (?, ?, ?)
        `).get(canonicalId, spkNumber, rawId) as any;
        const nextSeq = station_sequence !== undefined && Number(station_sequence) > 0
          ? Number(station_sequence)
          : (maxSeqRow?.max_seq || 0) + 1;

        const stationId = `STATION-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        let effectiveMaxManpower = max_manpower ? Math.max(1, Number(max_manpower) || 5) : 5;
        if (work_center_id) {
          const wc = db.prepare("SELECT manpower_count FROM work_centers WHERE id = ?").get(work_center_id) as any;
          if (wc?.manpower_count) effectiveMaxManpower = Math.max(1, Number(wc.manpower_count));
        }

        db.prepare(`
          INSERT INTO project_stations (
            id, project_id, station_code, station_name, station_type, max_manpower, work_center_id, description, station_sequence, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'IDLE')
        `).run(
          stationId,
          canonicalId,
          cleanCode,
          cleanName,
          station_type || 'SERIAL',
          effectiveMaxManpower,
          work_center_id || null,
          description || null,
          nextSeq
        );

        const created = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId);
        try {
          syncCollectionToFirestore("project_stations", stationId, created);
        } catch (e) {}

        res.json({ ok: true, success: true, station: created });
      } catch (err: any) {
        console.error("Error creating project station:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Update an existing station
    bopRouter.put("/api/production/projects/:projectId/stations/:stationId", (req, res) => {
      try {
        const { projectId, stationId } = req.params;
        const { station_code, station_name, station_type, max_manpower, work_center_id, description, station_sequence } = req.body;

        const current = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any;
        if (!current) {
          return res.status(404).json({ error: "Station not found" });
        }

        const { canonicalId, spkNumber, rawId } = resolveStationProjectMeta(projectId);
        const cleanCode = station_code ? String(station_code).trim().toUpperCase() : current.station_code;
        const cleanName = station_name ? String(station_name).trim() : current.station_name;

        // Check uniqueness if code changed
        if (cleanCode !== current.station_code) {
          const duplicate = db.prepare(`
            SELECT id FROM project_stations 
            WHERE project_id IN (?, ?, ?) AND UPPER(station_code) = UPPER(?) AND id != ?
          `).get(canonicalId, spkNumber, rawId, cleanCode, stationId);

          if (duplicate) {
            return res.status(400).json({ error: `Station code '${cleanCode}' is already used in this project.` });
          }
        }

        const targetMaxManpower = max_manpower !== undefined ? Math.max(1, Number(max_manpower) || current.max_manpower || 5) : (current.max_manpower || 5);
        const targetSequence = station_sequence !== undefined && Number(station_sequence) > 0
          ? Number(station_sequence)
          : (current.station_sequence || 1);

        db.transaction(() => {
          db.prepare(`
            UPDATE project_stations 
            SET project_id = ?,
                station_code = ?,
                station_name = ?,
                station_type = COALESCE(?, station_type),
                max_manpower = ?,
                work_center_id = COALESCE(?, work_center_id),
                description = COALESCE(?, description),
                station_sequence = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            canonicalId,
            cleanCode,
            cleanName,
            station_type,
            targetMaxManpower,
            work_center_id,
            description,
            targetSequence,
            stationId
          );

          // If any bill_of_processes referenced the old station_code directly, update to stationId
          if (current.station_code && cleanCode !== current.station_code) {
            db.prepare(`
              UPDATE bill_of_processes
              SET station_id = ?
              WHERE project_id IN (?, ?, ?) AND station_id = ?
            `).run(stationId, canonicalId, spkNumber, rawId, current.station_code);
          }
        })();

        const updated = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId);
        try {
          syncCollectionToFirestore("project_stations", stationId, updated);
        } catch (e) {}

        res.json({ ok: true, success: true, station: updated });
      } catch (err: any) {
        console.error("Error updating project station:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Delete a single station
    bopRouter.delete("/api/production/projects/:projectId/stations/:stationId", (req, res) => {
      try {
        const { projectId, stationId } = req.params;
        const { canonicalId, spkNumber, rawId } = resolveStationProjectMeta(projectId);

        const current = db.prepare("SELECT * FROM project_stations WHERE id = ?").get(stationId) as any;
        if (!current) {
          return res.status(404).json({ error: "Station not found" });
        }

        db.transaction(() => {
          // Unlink station from any associated BOP processes (match both id and station_code)
          db.prepare(`
            UPDATE bill_of_processes
            SET station_id = NULL
            WHERE project_id IN (?, ?, ?) AND (station_id = ? OR station_id = ?)
          `).run(canonicalId, spkNumber, rawId, stationId, current.station_code || "");

          // Clean up manpower assignments on this station
          db.prepare("DELETE FROM production_manpower_assignments WHERE station_id = ? OR station_id = ?").run(stationId, current.station_code || "");

          // Delete station
          db.prepare("DELETE FROM project_stations WHERE id = ?").run(stationId);

          // Resequence remaining stations cleanly (1..N)
          const remaining = db.prepare(`
            SELECT id FROM project_stations
            WHERE project_id IN (?, ?, ?)
            ORDER BY station_sequence ASC, station_code ASC
          `).all(canonicalId, spkNumber, rawId) as any[];
          const reseqStmt = db.prepare("UPDATE project_stations SET station_sequence = ? WHERE id = ?");
          remaining.forEach((st, idx) => {
            reseqStmt.run(idx + 1, st.id);
          });
        })();

        try {
          deleteDocFromFirestore("project_stations", stationId);
        } catch (e) {}

        res.json({ ok: true, success: true, message: "Station deleted successfully" });
      } catch (err: any) {
        console.error("Error deleting project station:", err);
        res.status(500).json({ error: err.message });
      }
    });

    // Clear all stations for a project (Reset to 0)
    bopRouter.delete("/api/production/projects/:projectId/stations", (req, res) => {
      try {
        const { projectId } = req.params;
        const { canonicalId, spkNumber, rawId } = resolveStationProjectMeta(projectId);

        const existingStations = db.prepare(`
          SELECT id, station_code FROM project_stations WHERE project_id IN (?, ?, ?)
        `).all(canonicalId, spkNumber, rawId) as any[];

        db.transaction(() => {
          db.prepare(`
            UPDATE bill_of_processes
            SET station_id = NULL
            WHERE project_id IN (?, ?, ?)
          `).run(canonicalId, spkNumber, rawId);

          for (const st of existingStations) {
            db.prepare("DELETE FROM production_manpower_assignments WHERE station_id = ? OR station_id = ?").run(st.id, st.station_code || "");
          }

          db.prepare(`
            DELETE FROM project_stations WHERE project_id IN (?, ?, ?)
          `).run(canonicalId, spkNumber, rawId);
        })();

        for (const st of existingStations) {
          try {
            deleteDocFromFirestore("project_stations", st.id);
          } catch (e) {}
        }

        res.json({ ok: true, success: true, deleted_count: existingStations.length, stations: [] });
      } catch (err: any) {
        console.error("Error clearing project stations:", err);
        res.status(500).json({ error: err.message });
      }
    });

