import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { calculateFractionalBomRemaining } from "./helpers.ts";

export function registerMrpProcurementRoutes(router: Router) {
  router.get("/api/projects/:id/shortage-analysis", (req, res) => {
    try {
      const projectId = req.params.id;

      const project = db
        .prepare(
          "SELECT id, name, spk_number, start_date, due_date, bom_status, bop_status FROM projects WHERE id = ?",
        )
        .get(projectId) as any;
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (project.bom_status !== "AUTHORIZED") {
        return res.json([]);
      }

      const boms = db
        .prepare(
          `
      SELECT 
        b.id as bom_id,
        b.item_id, 
        i.item_code,
        i.name as item_name,
        b.dimension, 
        b.spec, 
        b.required_qty as unit_required_qty,
        COALESCE(p.qty, 1) as project_qty,
        (b.required_qty * COALESCE(p.qty, 1)) as required_qty,
        i.uom,
        COALESCE(i.lead_time_days, 4) as lead_time_days,
        COALESCE(bic.qty_consumed, 0) as consumed
      FROM boms b
      JOIN items i ON b.item_id = i.id
      JOIN projects p ON b.project_id = p.id
      LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
      WHERE b.project_id = ?
    `,
        )
        .all(projectId) as any[];

      const bops = db
        .prepare("SELECT * FROM bill_of_processes WHERE project_id = ? ORDER BY step_sequence ASC")
        .all(projectId) as any[];
      const bopAllocMap = new Map<string, number>();
      const bopStepNameByBomId = new Map<string, string>();
      bops.forEach((b) => {
        let allocs = [];
        try {
          allocs =
            typeof b.bom_allocations === "string"
              ? JSON.parse(b.bom_allocations)
              : b.bom_allocations || [];
        } catch (e) {}
        allocs.forEach((a: any) => {
          const current = bopAllocMap.get(a.bom_id) || 0;
          bopAllocMap.set(a.bom_id, current + (a.fraction || 1));
          if (a.bom_id && !bopStepNameByBomId.has(a.bom_id)) {
            bopStepNameByBomId.set(
              a.bom_id,
              b.process_name || b.station_name || "Manufacturing Process",
            );
          }
        });
      });

      // Pull active Procurement Plan & Wave Schedule for this project (to feed Planned Delivery Dates into Design Requests)
      let activePlan: any = null;
      const planItemScheduleMap = new Map<
        string,
        {
          plan_id: string;
          plan_code: string;
          wave_id: string;
          wave_number: number;
          wave_name: string;
          wave_status: string;
          target_order_date: string;
          target_arrival_date: string;
          production_need_date: string;
          process_step_name: string;
          station_name: string;
          planned_qty: number;
          generated_pr_number: string | null;
        }
      >();

      try {
        activePlan = db
          .prepare(
            `SELECT id, plan_code, status, lead_time_buffer_days
             FROM procurement_plans
             WHERE (project_id = ? OR spk_number = ?)
               AND status != 'ARCHIVED'
             ORDER BY created_at DESC
             LIMIT 1`,
          )
          .get(projectId, project.spk_number || projectId) as any;

        if (activePlan?.id) {
          const planRows = db
            .prepare(
              `SELECT
                 ppi.item_id,
                 ppi.bom_id,
                 ppi.allocated_wave_qty,
                 ppi.process_step_name,
                 ppi.station_name,
                 w.id as wave_id,
                 w.wave_number,
                 w.wave_name,
                 w.status as wave_status,
                 w.target_order_date,
                 w.target_arrival_date,
                 w.production_need_date,
                 w.generated_pr_number
               FROM procurement_plan_items ppi
               JOIN procurement_plan_waves w ON ppi.wave_id = w.id
               WHERE ppi.plan_id = ?
               ORDER BY w.wave_number ASC`,
            )
            .all(activePlan.id) as any[];

          for (const pr of planRows) {
            const key = String(pr.item_id);
            const existing = planItemScheduleMap.get(key);
            if (!existing) {
              planItemScheduleMap.set(key, {
                plan_id: activePlan.id,
                plan_code: activePlan.plan_code,
                wave_id: pr.wave_id,
                wave_number: Number(pr.wave_number || 1),
                wave_name: pr.wave_name || `Wave ${pr.wave_number || 1}`,
                wave_status: pr.wave_status || "PLANNED",
                target_order_date: pr.target_order_date,
                target_arrival_date: pr.target_arrival_date,
                production_need_date: pr.production_need_date,
                process_step_name:
                  pr.process_step_name || "Manufacturing Process",
                station_name: pr.station_name || "Workstation",
                planned_qty: Number(pr.allocated_wave_qty || 0),
                generated_pr_number: pr.generated_pr_number || null,
              });
            } else {
              existing.planned_qty = Number(
                (
                  existing.planned_qty + Number(pr.allocated_wave_qty || 0)
                ).toFixed(4),
              );
              if (
                pr.target_arrival_date &&
                pr.target_arrival_date < existing.target_arrival_date
              ) {
                existing.target_arrival_date = pr.target_arrival_date;
                existing.target_order_date = pr.target_order_date;
                existing.production_need_date = pr.production_need_date;
                existing.wave_number = Number(pr.wave_number || 1);
                existing.wave_name = pr.wave_name;
              }
            }
          }
        }
      } catch (_e) {
        // Ignore if procurement_plans table not initialized yet
      }

      const projectAllocations = db
        .prepare(
          `
      SELECT item_id, SUM(qty) as total_alloc
      FROM stock_movements
      WHERE project_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION', 'GRN')
      GROUP BY item_id
    `,
        )
        .all(projectId) as any[];
      const projectAllocMap = new Map(
        projectAllocations.map((a) => [a.item_id, a.total_alloc]),
      );

      const projectPrs = db
        .prepare(
          `
      SELECT
        pri.item_id,
        SUM(pri.qty) as total_pr_qty,
        GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers,
        MIN(pri.expected_delivery_date) as earliest_expected_date
      FROM pr_items pri
      JOIN purchase_requests pr ON pri.pr_id = pr.id
      WHERE pr.project_id = ? AND pr.status != 'CANCELLED' AND pr.status != 'COMPLETED'
      GROUP BY pri.item_id
    `,
        )
        .all(projectId) as any[];
      const projectPrMap = new Map(
        projectPrs.map((p) => [
          p.item_id,
          {
            qty: p.total_pr_qty,
            numbers: p.pr_numbers,
            expected_date: p.earliest_expected_date || null,
          },
        ]),
      );

      if (boms.length === 0) return res.json([]);
      const itemIds = [...new Set(boms.map((b) => b.item_id))];
      const placeholders = itemIds.map(() => "?").join(",");

      const inventory = db
        .prepare(
          `SELECT item_id, free_stock FROM inventory WHERE item_id IN (${placeholders})`,
        )
        .all(...itemIds) as any[];

      const otherCommitments = db
        .prepare(
          `
      SELECT item_id, SUM(qty) as allocated
      FROM stock_movements
      WHERE type IN ('ALLOCATION', 'GRN_ALLOCATION', 'GRN') AND project_id != ? AND project_id IS NOT NULL AND item_id IN (${placeholders})
      GROUP BY item_id
    `,
        )
        .all(projectId, ...itemIds) as any[];
      const otherCommitMap = new Map(
        otherCommitments.map((c) => [c.item_id, c.allocated]),
      );

      const invMap = new Map(
        inventory.map((i) => {
          const otherComm = otherCommitMap.get(i.item_id) || 0;
          return [i.item_id, Math.max(0, i.free_stock - otherComm)];
        }),
      );

      const todayIso = new Date().toISOString().split("T")[0];
      const defaultNeedDate = project.start_date
        ? String(project.start_date).slice(0, 10)
        : todayIso;
      const defaultBackwardDeliveryDate = (() => {
        const d = new Date(`${defaultNeedDate}T00:00:00Z`);
        if (Number.isNaN(d.getTime())) return todayIso;
        d.setUTCDate(d.getUTCDate() - 3);
        return d.toISOString().split("T")[0];
      })();

      const analysis = boms.map((bom) => {
        const prData = projectPrMap.get(bom.item_id) || {
          qty: 0,
          numbers: null,
          expected_date: null,
        };
        const pr_numbers = prData.numbers ? prData.numbers.split(",") : [];
        const stock = invMap.get(bom.item_id) || 0;
        const allocated = projectAllocMap.get(bom.item_id) || 0;

        const ordered = prData.qty;

        const remainingToBuild = calculateFractionalBomRemaining(
          db,
          projectId,
          bom.bom_id,
          bom.required_qty,
          bom.consumed,
          bom.project_qty,
          bom.unit_required_qty,
        );

        const receivedQty = bom.consumed || 0;

        const shortage = Math.max(
          0,
          remainingToBuild - (allocated + stock + ordered + receivedQty),
        );
        const can_allocate = Math.min(stock, shortage);

        const fractionAllocated = bopAllocMap.get(bom.bom_id) || 0;
        const planMeta = planItemScheduleMap.get(String(bom.item_id)) || null;
        const resolvedExpectedDate =
          planMeta?.target_arrival_date ||
          prData.expected_date ||
          defaultBackwardDeliveryDate;

        return {
          ...bom,
          allocated,
          ordered,
          pr_numbers,
          free_stock: stock,
          shortage,
          can_allocate,
          received_by_production: receivedQty,
          fraction_allocated: fractionAllocated,
          expected_date: resolvedExpectedDate,
          planned_delivery_date: resolvedExpectedDate,
          planned_order_date: planMeta?.target_order_date || null,
          production_need_date:
            planMeta?.production_need_date || defaultNeedDate,
          planned_wave_number: planMeta?.wave_number || null,
          planned_wave_name: planMeta?.wave_name || null,
          planned_wave_status: planMeta?.wave_status || null,
          bop_process_name:
            planMeta?.process_step_name ||
            bopStepNameByBomId.get(bom.bom_id) ||
            "Cutting & Preparation",
          station_name: planMeta?.station_name || null,
          plan_id: planMeta?.plan_id || activePlan?.id || null,
          plan_code: planMeta?.plan_code || activePlan?.plan_code || null,
          planned_wave_qty: planMeta?.planned_qty || null,
        };
      });

      res.json(analysis);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch shortage analysis" });
    }
  });

  router.get("/api/spks/:id/shortage-analysis", (req, res) => {
    try {
      const spkId = req.params.id;

      const spk = db
        .prepare("SELECT * FROM spks WHERE id = ?")
        .get(spkId) as any;
      if (!spk) {
        return res.status(404).json({ error: "SPK not found" });
      }

      const projects = db
        .prepare(
          `
        SELECT p.id, p.name, COALESCE(p.qty, 1) as qty, p.uom, p.status, p.spk_id
        FROM projects p
        WHERE (p.spk_id = ? OR p.id = ?) AND p.bom_status = 'AUTHORIZED'
        ORDER BY p.name ASC
      `,
        )
        .all(spkId, spk.project_id) as any[];

      if (projects.length === 0) {
        return res.json({ spk, projects: [], items: [] });
      }

      const projectIds = projects.map((p) => p.id);
      const pPlaceholders = projectIds.map(() => "?").join(",");

      const bomRows = db
        .prepare(
          `
        SELECT 
          b.id as bom_id,
          b.project_id,
          p.name as project_name,
          COALESCE(p.qty, 1) as project_qty,
          COALESCE(p.uom, 'Unit') as project_uom,
          b.item_id,
          i.item_code,
          i.name as item_name,
          i.uom,
          b.dimension,
          b.spec,
          b.required_qty as unit_required_qty,
          (b.required_qty * COALESCE(p.qty, 1)) as total_required,
          COALESCE(
            (SELECT MIN(unit_price) FROM item_supplier_prices WHERE item_id = i.id),
            i.unit_price,
            b.unit_price,
            0
          ) as unit_price,
          COALESCE(bic.qty_consumed, 0) as consumed
        FROM boms b
        JOIN items i ON b.item_id = i.id
        JOIN projects p ON b.project_id = p.id
        LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
        WHERE b.project_id IN (${pPlaceholders})
        ORDER BY i.item_code ASC
      `,
        )
        .all(...projectIds) as any[];

      if (bomRows.length === 0) {
        return res.json({ spk, projects, items: [] });
      }

      const itemIds = [...new Set(bomRows.map((b) => b.item_id))];
      const itemPlaceholders = itemIds.map(() => "?").join(",");

      const inventory = db
        .prepare(
          `SELECT item_id, free_stock FROM inventory WHERE item_id IN (${itemPlaceholders})`,
        )
        .all(...itemIds) as any[];
      const invMap = new Map(
        inventory.map((i) => [i.item_id, i.free_stock || 0]),
      );

      const allocations = db
        .prepare(
          `
        SELECT item_id, SUM(qty) as total_alloc
        FROM stock_movements
        WHERE project_id IN (${pPlaceholders}) AND type IN ('ALLOCATION', 'GRN_ALLOCATION', 'GRN')
        GROUP BY item_id
      `,
        )
        .all(...projectIds) as any[];
      const allocMap = new Map(
        allocations.map((a) => [a.item_id, a.total_alloc]),
      );

      const prs = db
        .prepare(
          `
        SELECT pri.item_id, SUM(pri.qty) as total_pr_qty, GROUP_CONCAT(DISTINCT pr.pr_number) as pr_numbers
        FROM pr_items pri
        JOIN purchase_requests pr ON pri.pr_id = pr.id
        WHERE (pr.project_id IN (${pPlaceholders}) OR pr.spk_id = ?) AND pr.status != 'CANCELLED' AND pr.status != 'COMPLETED'
        GROUP BY pri.item_id
      `,
        )
        .all(...projectIds, spkId) as any[];
      const prMap = new Map(
        prs.map((p) => [
          p.item_id,
          { qty: p.total_pr_qty, numbers: p.pr_numbers },
        ]),
      );

      const aggregatedMap = new Map<string, any>();

      for (const row of bomRows) {
        if (!aggregatedMap.has(row.item_id)) {
          aggregatedMap.set(row.item_id, {
            item_id: row.item_id,
            item_code: row.item_code,
            item_name: row.item_name,
            uom: row.uom,
            dimension: row.dimension,
            spec: row.spec,
            unit_price: row.unit_price,
            total_required: 0,
            total_consumed: 0,
            project_breakdown: [] as any[],
          });
        }

        const item = aggregatedMap.get(row.item_id);
        const trueRemaining = calculateFractionalBomRemaining(db, row.project_id, row.bom_id, row.total_required, row.consumed, row.project_qty, row.unit_required_qty);
        item.total_required += Number(row.total_required);
        item.total_consumed += Number(row.consumed);
        item.true_remaining = (item.true_remaining || 0) + trueRemaining;
        item.project_breakdown.push({
          project_id: row.project_id,
          project_name: row.project_name,
          project_qty: row.project_qty,
          project_uom: row.project_uom,
          unit_required_qty: row.unit_required_qty,
          required_qty: row.total_required,
          consumed: row.consumed,
        });
      }

      const items = Array.from(aggregatedMap.values()).map((item) => {
        const stock = invMap.get(item.item_id) || 0;
        const allocated = allocMap.get(item.item_id) || 0;
        const prData = prMap.get(item.item_id) || { qty: 0, numbers: null };
        const ordered = prData.qty;
        const pr_numbers = prData.numbers ? prData.numbers.split(",") : [];

        const remainingToBuild = item.true_remaining !== undefined ? item.true_remaining : Math.max(0, item.total_required - item.total_consumed);
        const shortage = Math.max(
          0,
          remainingToBuild - (allocated + stock + ordered),
        );
        const can_allocate = Math.min(stock, shortage);

        return {
          ...item,
          free_stock: stock,
          allocated,
          ordered,
          pr_numbers,
          shortage,
          can_allocate,
          qty_to_order: shortage,
        };
      });

      res.json({
        spk,
        projects,
        items,
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({
        error: "Failed to fetch SPK shortage analysis",
        details: error.message,
      });
    }
  });

  router.post(
    "/api/spks/:id/generate-prs",
    requireRole(["PRODUCTION", "PPIC", "ENGINEERING", "WAREHOUSE", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const spkId = req.params.id;
        const {
          items: customItems,
          expected_delivery_date,
          drawing_reference,
          urgency,
          category,
        } = req.body || {};

        const spk = db
          .prepare("SELECT * FROM spks WHERE id = ?")
          .get(spkId) as any;
        if (!spk) {
          return res.status(404).json({ error: "SPK not found" });
        }

        const projects = db
          .prepare(
            `
          SELECT id, name, COALESCE(qty, 1) as qty, bom_status, bop_status FROM projects WHERE spk_id = ? OR id = ?
        `,
          )
          .all(spkId, spk.project_id) as any[];

        if (projects.length === 0) {
          return res
            .status(400)
            .json({ error: "No projects found under this SPK" });
        }

        const unauthorizedProjects = projects.filter(p => p.bom_status !== 'AUTHORIZED');
        if (unauthorizedProjects.length > 0) {
           const names = unauthorizedProjects.map(p => p.name).join(", ");
           return res.status(400).json({ error: `Cannot generate PRs. The following projects are missing BOM authorization: ${names}` });
        }

        const primaryProjectId = spk.project_id || projects[0].id;
        const projectIds = projects.map((p) => p.id);
        const pPlaceholders = projectIds.map(() => "?").join(",");

        const transaction = db.transaction(() => {
          let prId = null;
          let prNumber = null;
          let itemsToPr: any[] = [];

          if (Array.isArray(customItems) && customItems.length > 0) {
            itemsToPr = customItems.filter(
              (it: any) => Number(it.qty_to_order) > 0,
            );
          } else {
            const rawBomRows = db
              .prepare(
                `
              SELECT 
                b.id as bom_id,
                b.project_id,
                b.item_id,
                b.dimension,
                b.spec,
                COALESCE(i.unit_price, b.unit_price, 0) as unit_price,
                b.required_qty as unit_required_qty,
                COALESCE(p.qty, 1) as project_qty,
                (b.required_qty * COALESCE(p.qty, 1)) as total_required,
                COALESCE(bic.qty_consumed, 0) as consumed
              FROM boms b
              JOIN items i ON b.item_id = i.id
              JOIN projects p ON b.project_id = p.id
              LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
              WHERE b.project_id IN (${pPlaceholders})
            `,
              )
              .all(...projectIds) as any[];
              
            const aggregatedBomMap = new Map();
            for (const r of rawBomRows) {
               const trueRemaining = calculateFractionalBomRemaining(db, r.project_id, r.bom_id, r.total_required, r.consumed, r.project_qty, r.unit_required_qty);
               if (!aggregatedBomMap.has(r.item_id)) {
                  aggregatedBomMap.set(r.item_id, {
                     item_id: r.item_id,
                     dimension: r.dimension,
                     spec: r.spec,
                     unit_price: r.unit_price,
                     total_required: 0,
                     total_consumed: 0,
                     true_remaining: 0
                  });
               }
               const agg = aggregatedBomMap.get(r.item_id);
               agg.total_required += r.total_required;
               agg.total_consumed += r.consumed;
               agg.true_remaining += trueRemaining;
            }
            const bomRows = Array.from(aggregatedBomMap.values());

            const itemIds = bomRows.map((b) => b.item_id);
            let invMap = new Map();
            if (itemIds.length > 0) {
              const placeholders = itemIds.map(() => "?").join(",");
              const inventory = db
                .prepare(
                  `SELECT item_id, free_stock FROM inventory WHERE item_id IN (${placeholders})`,
                )
                .all(...itemIds) as any[];
              invMap = new Map(
                inventory.map((i) => [i.item_id, i.free_stock || 0]),
              );
            }

            const activeSupply = db
              .prepare(
                `
              SELECT item_id, SUM(qty) as total_qty FROM (
                SELECT pri.item_id, pri.qty 
                FROM pr_items pri
                JOIN purchase_requests pr ON pri.pr_id = pr.id
                WHERE (pr.project_id IN (${pPlaceholders}) OR pr.spk_id = ?) AND pr.status IN ('DRAFTED', 'AUTHORIZED') AND pri.po_id IS NULL
                UNION ALL
                SELECT pri.item_id, pri.qty
                FROM pr_items pri
                JOIN purchase_requests pr ON pri.pr_id = pr.id
                JOIN purchase_orders po ON pri.po_id = po.id
                WHERE (pr.project_id IN (${pPlaceholders}) OR pr.spk_id = ?) AND po.archived = 0 AND po.status IN ('ISSUED', 'PARTIAL')
              ) GROUP BY item_id
            `,
              )
              .all(...projectIds, spkId, ...projectIds, spkId) as any[];
            const supplyMap = new Map(
              activeSupply.map((s) => [s.item_id, s.total_qty]),
            );

            for (const bom of bomRows) {
              const required = bom.total_required;
              const consumed = bom.total_consumed;
              const trueRemaining = bom.true_remaining;
              const stock = invMap.get(bom.item_id) || 0;
              const pipeSupply = supplyMap.get(bom.item_id) || 0;

              const remainingToBuild = trueRemaining !== undefined ? trueRemaining : Math.max(0, required - consumed);

              const stockToAllocate = Math.min(
                stock,
                Math.max(0, remainingToBuild - pipeSupply),
              );
              if (stockToAllocate > 0) {
                const info = db
                  .prepare(
                    "UPDATE inventory SET free_stock = free_stock - ?, allocated_stock = COALESCE(allocated_stock, 0) + ? WHERE item_id = ? AND free_stock >= ?",
                  )
                  .run(
                    stockToAllocate,
                    stockToAllocate,
                    bom.item_id,
                    stockToAllocate,
                  );

                if (info.changes > 0) {
                  const movId =
                    "MOV-" + Math.random().toString(36).substr(2, 9);
                  db.prepare(
                    "INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by) VALUES (?, ?, ?, 'ALLOCATION', ?, 'SYSTEM_SPK_MRP')",
                  ).run(movId, bom.item_id, primaryProjectId, stockToAllocate);

                  const resId = "RES-" + Math.random().toString(36).substr(2, 9);
                  db.prepare(
                    "INSERT INTO inventory_reservations (id, item_id, project_id, spk_id, qty, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')"
                  ).run(resId, bom.item_id, primaryProjectId, spkId, stockToAllocate);

                  const labelId =
                    "LBL-" + Math.random().toString(36).substr(2, 9);
                  db.prepare(
                    "INSERT INTO inventory_labels (id, item_id, grn_id, original_qty, current_qty, project_id) VALUES (?, ?, NULL, ?, ?, ?)",
                  ).run(
                    labelId,
                    bom.item_id,
                    stockToAllocate,
                    stockToAllocate,
                    primaryProjectId,
                  );
                } else {
                   throw new Error(`Concurrency error: Not enough stock to allocate for item ${bom.item_id}. Please refresh and try again.`);
                }
              }
            }
          }

          if (itemsToPr.length > 0) {
            prId = "PR-" + Math.random().toString(36).substr(2, 9);
            prNumber =
              "PR-" +
              new Date().getFullYear() +
              "-" +
              Math.floor(100000 + Math.random() * 900000);

            let deliveryDateStr = expected_delivery_date;
            if (!deliveryDateStr) {
              const d = new Date();
              d.setDate(d.getDate() + 14);
              deliveryDateStr = d.toISOString().split("T")[0];
            }

            db.prepare(
              "INSERT INTO purchase_requests (id, pr_number, project_id, spk_id, drawing_reference, status, urgency, category) VALUES (?, ?, ?, ?, ?, 'DRAFTED', ?, ?)",
            ).run(
              prId,
              prNumber,
              primaryProjectId,
              spkId,
              drawing_reference ||
                `Bulk PR for SPK ${spk.spk_number || spk.title}`,
              urgency || "NORMAL",
              category || "PROJECT",
            );

            const insertPrItem = db.prepare(
              "INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, unit_price, expected_delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            );

            for (const item of itemsToPr) {
              insertPrItem.run(
                "PRI-" + Math.random().toString(36).substr(2, 9),
                prId,
                item.item_id,
                item.dimension || null,
                item.spec || null,
                item.qty_to_order,
                item.unit_price || 0,
                item.expected_delivery_date || null,
              );
            }

            const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
            db.prepare(
              "INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status, pr_id) VALUES (?, ?, ?, ?, ?, 0, 'PENDING', ?)",
            ).run(
              taskId,
              primaryProjectId,
              `SPK Material Procurement (${spk.spk_number || "Bulk"})`,
              new Date().toISOString().split("T")[0],
              deliveryDateStr,
              prId,
            );
          }

          return {
            success: true,
            pr_created: itemsToPr.length > 0,
            pr_number: prNumber,
            pr_id: prId,
            spk_number: spk.spk_number,
          };
        });

        const result = transaction();
        res.json(result);
      } catch (error: any) {
        console.error(error);
        res.status(500).json({
          error: error.message || "Failed to generate SPK Bulk PR",
        });
      }
    },
  );

  router.get("/api/projects/:id/work-orders", (req, res) => {
    try {
      const wots = db
        .prepare(
          `
      SELECT w.*,
        COALESCE(w.wot_number, w.lot_number) as wo_number,
        (SELECT COUNT(*) FROM boms b WHERE b.project_id = w.project_id) as item_count
      FROM work_order_tickets w
      WHERE w.project_id = ?
      ORDER BY w.created_at DESC
    `,
        )
        .all(req.params.id) as any[];

      if (wots.length > 0) {
        return res.json(wots);
      }

      const wos = db
        .prepare(
          `
      SELECT wo.*, 
        (SELECT COUNT(*) FROM work_order_items WHERE wo_id = wo.id) as item_count
      FROM work_orders wo
      WHERE wo.project_id = ?
      ORDER BY wo.created_at DESC
    `,
        )
        .all(req.params.id);
      res.json(wos);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch work orders" });
    }
  });

  router.post("/api/projects/:id/work-orders", (req, res) => {
    try {
      const projectId = req.params.id;
      const project = db
        .prepare("SELECT status, qty FROM projects WHERE id = ?")
        .get(projectId) as any;
      if (
        project &&
        (project.status === "FINISHED" || project.status === "CLOSED")
      ) {
        return res.status(400).json({
          error: "Cannot create Work Order for a finished or closed project.",
        });
      }

      const { items } = req.body;

      const woId = "WO-" + Math.random().toString(36).substr(2, 9);
      const wotId = "WOT-" + woId;
      const woNumber =
        "WOT-" +
        new Date().getFullYear() +
        "-" +
        Math.floor(100000 + Math.random() * 900000);

      db.transaction(() => {
        db.prepare(
          `INSERT INTO work_order_tickets (
             id, project_id, lot_number, wot_number, qty, status, legacy_wo_id
           ) VALUES (?, ?, ?, ?, ?, 'PLANNED', ?)`
        ).run(wotId, projectId, woNumber, woNumber, Number(project?.qty) || 1, woId);

        db.prepare(
          "INSERT INTO work_orders (id, wo_number, project_id, status) VALUES (?, ?, ?, 'DRAFT')",
        ).run(woId, woNumber, projectId);

        if (Array.isArray(items)) {
          const insertItem = db.prepare(
            "INSERT INTO work_order_items (id, wo_id, bom_id, qty_to_consume) VALUES (?, ?, ?, ?)",
          );
          for (const item of items) {
            insertItem.run(
              "WOI-" + Math.random().toString(36).substr(2, 9),
              woId,
              item.bom_id,
              item.qty_to_consume,
            );
          }
        }
      })();

      res.json({ success: true, wo_id: wotId, wot_id: wotId, wo_number: woNumber, wot_number: woNumber });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create work order" });
    }
  });

  router.post(
    "/api/projects/:id/generate-prs",
    requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const projectId = req.params.id;
        const project = db
          .prepare("SELECT status, bom_status, bop_status FROM projects WHERE id = ?")
          .get(projectId) as any;
        if (!project) return res.status(404).json({ error: "Project not found" });
        if (
          project.status === "FINISHED" || project.status === "CLOSED"
        ) {
          return res.status(400).json({
            error: "Cannot generate PRs for a finished or closed project.",
          });
        }
        if (project.bom_status !== 'AUTHORIZED') {
          return res.status(400).json({ error: "Cannot generate PR: Bill of Materials (BOM) is not authorized." });
        }

        const {
          expected_delivery_date,
          drawing_reference,
          items: customItems,
          item_expected_dates = {},
          urgency,
          category,
          remarks,
          wave_number,
        } = req.body || {};

        const projectInfo = db
          .prepare("SELECT spk_id FROM projects WHERE id = ?")
          .get(projectId) as any;

        const transaction = db.transaction(() => {
          let prId = null;
          let prNumber = null;
          let itemsToPr = [];

          const boms = db
            .prepare(
              `
        SELECT 
          b.item_id, 
          MAX(b.dimension) as dimension, 
          MAX(b.spec) as spec, 
          MAX(i.unit_price) as unit_price,
          SUM(b.required_qty * COALESCE(p.qty, 1)) as total_required,
          COALESCE(SUM(bic.qty_consumed), 0) as total_consumed
        FROM boms b
        JOIN items i ON b.item_id = i.id
        JOIN projects p ON b.project_id = p.id
        LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
        WHERE b.project_id = ?
        GROUP BY b.item_id
      `,
            )
            .all(projectId) as any[];

          let invMap = new Map();
          if (boms.length > 0) {
            const itemIds = [...new Set(boms.map((b) => b.item_id))];
            const placeholders = itemIds.map(() => "?").join(",");
            const inventory = db
              .prepare(
                `SELECT item_id, free_stock FROM inventory WHERE item_id IN (${placeholders})`,
              )
              .all(...itemIds) as any[];
            invMap = new Map(inventory.map((i) => [i.item_id, i.free_stock]));
          }

          const currentProjectSupply = db
            .prepare(
              `
        SELECT item_id, SUM(qty) as total_qty FROM (
          SELECT pri.item_id, pri.qty 
          FROM pr_items pri
          JOIN purchase_requests pr ON pri.pr_id = pr.id
          WHERE pr.project_id = ? AND pr.status IN ('DRAFTED', 'AUTHORIZED') AND pri.po_id IS NULL
          UNION ALL
          SELECT pri.item_id, pri.qty
          FROM pr_items pri
          JOIN purchase_requests pr ON pri.pr_id = pr.id
          JOIN purchase_orders po ON pri.po_id = po.id
          WHERE pr.project_id = ? AND po.archived = 0 AND po.status IN ('ISSUED', 'PARTIAL')
        ) GROUP BY item_id
      `,
            )
            .all(projectId, projectId) as any[];
          const projectSupplyMap = new Map(
            currentProjectSupply.map((s) => [s.item_id, s.total_qty]),
          );

          if (Array.isArray(customItems) && customItems.length > 0) {
            itemsToPr = customItems.filter((it) => it.qty_to_order > 0);
          } else {
            for (const bom of boms) {
              const required = bom.total_required;
              const consumed = bom.total_consumed;
              const trueRemaining = bom.true_remaining;
              const stock = invMap.get(bom.item_id) || 0;
              const pipeSupply = projectSupplyMap.get(bom.item_id) || 0;

              const remainingToBuild = typeof trueRemaining !== 'undefined' ? trueRemaining : Math.max(0, required - consumed);

              let shortage = Math.max(
                0,
                remainingToBuild - (stock + pipeSupply),
              );

              const stockToAllocate = Math.min(stock, Math.max(0, remainingToBuild - pipeSupply));
              if (stockToAllocate > 0) {
                const info = db.prepare(
                  "UPDATE inventory SET free_stock = free_stock - ?, allocated_stock = COALESCE(allocated_stock, 0) + ? WHERE item_id = ? AND free_stock >= ?"
                ).run(stockToAllocate, stockToAllocate, bom.item_id, stockToAllocate);
                
                if (info.changes === 0) {
                  throw new Error(`Insufficient stock for allocation of item ${bom.item_id}`);
                }
                
                const movId = "MOV-" + Math.random().toString(36).substr(2, 9);
                db.prepare(
                  "INSERT INTO stock_movements (id, item_id, project_id, type, qty, recorded_by) VALUES (?, ?, ?, 'ALLOCATION', ?, 'SYSTEM_MRP')"
                ).run(movId, bom.item_id, projectId, stockToAllocate);
                
                const labelId = "LBL-" + Math.random().toString(36).substr(2, 9);
                db.prepare(
                  "INSERT INTO inventory_labels (id, item_id, grn_id, original_qty, current_qty, project_id) VALUES (?, ?, NULL, ?, ?, ?)"
                ).run(labelId, bom.item_id, stockToAllocate, stockToAllocate, projectId);
              }

              if (shortage > 0) {
                itemsToPr.push({
                  item_id: bom.item_id,
                  dimension: bom.dimension,
                  spec: bom.spec,
                  unit_price: bom.unit_price,
                  qty_to_order: shortage,
                  target_project_id: bom.target_project_id,
                  expected_delivery_date:
                    item_expected_dates[bom.item_id] ||
                    expected_delivery_date,
                });
              }
            }
          }

          if (itemsToPr.length > 0) {
            prId = "PR-" + Math.random().toString(36).substr(2, 9);
            prNumber =
              "PR-" +
              new Date().getFullYear() +
              "-" +
              Math.floor(100000 + Math.random() * 900000);

            let deliveryDateStr = expected_delivery_date;
            if (!deliveryDateStr) {
              const d = new Date();
              d.setDate(d.getDate() + 14);
              deliveryDateStr = d.toISOString().split("T")[0];
            }

            const finalRemarks = remarks || (wave_number ? `Procurement Wave ${wave_number}` : null);
            db.prepare(
              "INSERT INTO purchase_requests (id, pr_number, project_id, spk_id, drawing_reference, status, urgency, category, remarks, expected_delivery_date) VALUES (?, ?, ?, ?, ?, 'DRAFTED', ?, ?, ?, ?)",
            ).run(
              prId,
              prNumber,
              projectId,
              projectInfo?.spk_id || null,
              drawing_reference || null,
              urgency || "NORMAL",
              category || "PROJECT",
              finalRemarks,
              deliveryDateStr,
            );

            if (urgency === "URGENT" || urgency === "CRITICAL") {
              const threadId = "THREAD-GENERAL";
              const msgId = "SYS-" + Math.random().toString(36).substr(2, 9);
              const projectName = db
                .prepare("SELECT name FROM projects WHERE id = ?")
                .get(projectId) as { name: string };
              db.prepare(
                "INSERT INTO chat_messages (id, thread_id, sender_username, content) VALUES (?, ?, ?, ?)",
              ).run(
                msgId,
                threadId,
                "SYSTEM",
                `⚠️ **Urgent Procurement Alert!** ⚠️**Urgency:** 🚨 ${urgency}**Project:** 🏗️ ${projectName?.name || "Unknown"}**PR Number:** 📜 ${prNumber}Immediate attention required! ⚡`,
              );
            }

            const insertPrItem = db.prepare(
              "INSERT INTO pr_items (id, pr_id, item_id, dimension, spec, qty, unit_price, expected_delivery_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            );
            const insertTask = db.prepare(
              "INSERT INTO project_tasks (id, project_id, task_name, start_date, end_date, progress, status, pr_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            );

            for (const item of itemsToPr) {
              insertPrItem.run(
                "PRI-" + Math.random().toString(36).substr(2, 9),
                prId,
                item.item_id,
                item.dimension || null,
                item.spec || null,
                item.qty_to_order,
                item.unit_price || 0,
                item.expected_delivery_date || null,
              );
            }

            if (!["CONSUMABLE", "TRANSPORTATION", "OTHERS"].includes(projectId)) {
              const todayStr = new Date().toISOString().split("T")[0];
              const itemsWithDeliveries = itemsToPr.filter(
                (i) => i.expected_delivery_date,
              );

              if (itemsWithDeliveries.length > 0) {
                const deliveryGroups = new Map();
                for (const i of itemsWithDeliveries) {
                  if (!deliveryGroups.has(i.expected_delivery_date))
                    deliveryGroups.set(i.expected_delivery_date, []);
                  deliveryGroups.get(i.expected_delivery_date).push(i);
                }

                for (const [date, grp] of deliveryGroups.entries()) {
                  const taskId =
                    "TSK-" + Math.random().toString(36).substr(2, 9);
                  let names = [];
                  for (const g of grp) {
                    const itm = db
                      .prepare("SELECT item_code FROM items WHERE id = ?")
                      .get(g.item_id) as any;
                    if (itm) names.push(itm.item_code);
                  }
                  let details = names.join(", ");
                  if (details.length > 40)
                    details = details.substring(0, 37) + "...";
                  insertTask.run(
                    taskId,
                    projectId,
                    `Materials: ${details}`,
                    todayStr,
                    date,
                    0,
                    "PENDING",
                    prId,
                  );
                }
              } else {
                const taskId =
                  "TSK-" + Math.random().toString(36).substr(2, 9);
                insertTask.run(
                  taskId,
                  projectId,
                  `Material Procurement (PR Generated)`,
                  todayStr,
                  deliveryDateStr,
                  0,
                  "PENDING",
                  prId,
                );
              }
            }
          }

          return {
            success: true,
            pr_created: itemsToPr.length > 0,
            pr_number: prNumber,
          };
        });

        const result = transaction();
        res.json(result);
      } catch (error: any) {
        console.error(error);
        res
          .status(500)
          .json({ error: error.message || "Failed to generate PRs" });
      }
    },
  );
}
