import { Router } from "express";
import db from "../../db/database.ts";
import { logAudit } from "../../utils/audit.ts";
import { validateManpowerSequentialAssignment } from "../../utils/bopGraph.ts";
import { syncProjectGanttTasks } from "../../utils/ganttUtils.ts";
import {
  calculateProjectLaborCost,
  calculateProjectMaterialCost,
  calculateProjectOverheadCost,
  recalculateProjectFinancialSummary,
} from "../../services/projectHppService.ts";

export function registerOverviewTasksRoutes(router: Router) {
  router.get("/api/projects/:id/cost-summary", (req, res) => {
    try {
      const projectId = req.params.id;
      
      const materialBudget = db
        .prepare(
          `
      SELECT SUM(b.required_qty * COALESCE(p.qty, 1) * b.unit_price) as total_budget
      FROM boms b
      JOIN projects p ON b.project_id = p.id
      WHERE b.project_id = ?
    `,
        )
        .get(projectId) as { total_budget: number };

      const laborBudget = db
        .prepare(
          `
      SELECT SUM(standard_hours * COALESCE(manpower_allocated, 1) * 50000) as total_labor_budget
      FROM bill_of_processes
      WHERE project_id = ?
    `,
        )
        .get(projectId) as { total_labor_budget: number };

      const actualMaterialCost = calculateProjectMaterialCost(db, projectId);
      const laborBreakdown = calculateProjectLaborCost(db, projectId);
      const actualLaborCost = laborBreakdown.totalLaborCost;
      const actualOverheadCost = calculateProjectOverheadCost(db, projectId);

      let hppBreakdown = null;
      try {
        hppBreakdown = recalculateProjectFinancialSummary(db, projectId);
      } catch (reErr) {
        console.warn("Auto-recalculation of project financial summary skipped:", reErr);
      }

      res.json({
        budget: (materialBudget.total_budget || 0) + (laborBudget.total_labor_budget || 0),
        actual: actualMaterialCost + actualLaborCost + actualOverheadCost,
        material_budget: materialBudget.total_budget || 0,
        labor_budget: laborBudget.total_labor_budget || 0,
        actual_material: actualMaterialCost,
        actual_labor: actualLaborCost,
        actual_overhead: actualOverheadCost,
        actual_cost_material: actualMaterialCost,
        actual_cost_full: actualMaterialCost + actualLaborCost + actualOverheadCost,
        material_only_hpp: actualMaterialCost,
        full_absorption_hpp: actualMaterialCost + actualLaborCost + actualOverheadCost,
        labor_breakdown: laborBreakdown,
        hpp_breakdown: hppBreakdown,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch cost summary" });
    }
  });

  router.get("/api/projects/:id/hpp", (req, res) => {
    try {
      const projectId = req.params.id;
      const hppBreakdown = recalculateProjectFinancialSummary(db, projectId);
      res.json({ ok: true, data: hppBreakdown });
    } catch (error: any) {
      console.error("Failed to fetch project HPP:", error);
      res.status(500).json({ error: error.message || "Failed to calculate project HPP" });
    }
  });

  router.post("/api/projects/:id/recalculate-hpp", (req, res) => {
    try {
      const projectId = req.params.id;
      const hppBreakdown = recalculateProjectFinancialSummary(db, projectId);
      res.json({ ok: true, message: "Project HPP successfully recalculated", data: hppBreakdown });
    } catch (error: any) {
      console.error("Failed to recalculate project HPP:", error);
      res.status(500).json({ error: error.message || "Failed to recalculate project HPP" });
    }
  });

  router.get("/api/projects", (req, res) => {
    try {
      const { archived } = req.query;
      let query = `
      SELECT p.*,
             (SELECT COUNT(*) FROM project_stations ps WHERE ps.project_id = p.id) as station_count, 
             (SELECT COUNT(*) FROM work_order_tickets w WHERE w.project_id = p.id) as total_wots,
             (SELECT COUNT(*) FROM work_order_tickets w WHERE w.project_id = p.id AND w.status IN ('COMPLETED', 'FINISHED')) as completed_wots,
             COALESCE((SELECT SUM(b.required_qty * COALESCE(p.qty, 1) * b.unit_price) FROM boms b WHERE b.project_id = p.id), 0) +
             COALESCE((SELECT SUM(standard_hours * COALESCE(manpower_allocated, 1) * 50000) FROM bill_of_processes WHERE project_id = p.id), 0) as est_budget,
             COALESCE((SELECT SUM(b.required_qty * COALESCE(p.qty, 1) * b.unit_price) FROM boms b WHERE b.project_id = p.id), 0) as est_material_budget,
             COALESCE((SELECT SUM(pri.qty * pri.unit_price) FROM pr_items pri JOIN purchase_requests pr ON pri.pr_id = pr.id WHERE pr.project_id = p.id AND pr.status != 'CANCELLED'), 
                      (SELECT SUM(b.required_qty * COALESCE(p.qty, 1) * b.unit_price) FROM boms b WHERE b.project_id = p.id), 0) as actual_cost_material,
             COALESCE((SELECT pfs.total_labor_cost FROM project_financial_summaries pfs WHERE pfs.project_id = p.id), (SELECT SUM(COALESCE(actual_hours, 0) * 50000) FROM production_manpower_assignments WHERE project_id = p.id AND status = 'COMPLETED'), 0) as actual_cost_labor,
             COALESCE((SELECT pfs.total_overhead_cost FROM project_financial_summaries pfs WHERE pfs.project_id = p.id), 0) as actual_cost_overhead,
             COALESCE((SELECT pfs.full_cogs FROM project_financial_summaries pfs WHERE pfs.project_id = p.id), (SELECT pfs.total_cogs FROM project_financial_summaries pfs WHERE pfs.project_id = p.id), 0) as actual_cost_full,
             COALESCE((SELECT SUM(pri.qty * pri.unit_price) FROM pr_items pri JOIN purchase_requests pr ON pri.pr_id = pr.id WHERE pr.project_id = p.id AND pr.status != 'CANCELLED'), 0) +
             COALESCE((SELECT pfs.total_labor_cost FROM project_financial_summaries pfs WHERE pfs.project_id = p.id), (SELECT SUM(COALESCE(actual_hours, 0) * 50000) FROM production_manpower_assignments WHERE project_id = p.id AND status = 'COMPLETED'), 0) as actual_cost,
             COALESCE(p.qty, (SELECT SUM(qty) FROM quotation_items WHERE quotation_id = p.quotation_id), 1) as quotation_qty
      FROM projects p 
    `;
      if (archived === "true") {
        query += " WHERE p.archived_at IS NOT NULL";
      } else if (archived === "all") {
        query += " WHERE p.status != 'PENDING_NTP'";
      } else {
        query += " WHERE p.archived_at IS NULL AND p.status != 'PENDING_NTP'";
      }
      
      query += " AND p.id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL') AND p.status != 'INTERNAL_OVERHEAD' AND UPPER(COALESCE(p.name, '')) NOT LIKE '%CONSUMABLE%' AND UPPER(COALESCE(p.name, '')) NOT LIKE '%TRANSPORTATION%' AND UPPER(COALESCE(p.name, '')) NOT LIKE '%OTHER PROCUREMENT%' AND UPPER(COALESCE(p.name, '')) NOT LIKE '%OTHERS PROCUREMENT%' AND UPPER(COALESCE(p.name, '')) NOT LIKE '%GENERAL PROCUREMENT%'";
      query += " ORDER BY p.due_date ASC, p.created_at DESC";
      const projects = db.prepare(query).all();
      res.json(projects);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  router.get("/api/project-tasks", (req, res) => {
    try {
      const tasks = db.prepare(`
        SELECT t.*, wc.name as work_center_name, p.name as project_name
        FROM project_tasks t
        LEFT JOIN work_centers wc ON t.work_center_id = wc.id
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.status != 'CANCELLED'
          AND t.project_id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
        ORDER BY t.start_date ASC
      `).all();
      res.json(tasks);
    } catch (error) {
      console.error("Failed to fetch project tasks:", error);
      res.status(500).json({ error: "Failed to fetch project tasks" });
    }
  });

  router.post("/api/tasks/:id", (req, res) => {
    try {
      const {
        start_date,
        end_date,
        required_hours,
        progress,
        status,
        actual_start_date,
        actual_end_date,
        work_center_id,
      } = req.body;
      const { id } = req.params;

      const updates = [];
      const params = [];

      if (start_date !== undefined) {
        updates.push("start_date = ?");
        params.push(start_date);
      }
      if (end_date !== undefined) {
        updates.push("end_date = ?");
        params.push(end_date);
      }
      if (required_hours !== undefined) {
        updates.push("required_hours = ?");
        params.push(required_hours);
      }
      if (progress !== undefined) {
        updates.push("progress = ?");
        params.push(progress);
      }
      if (status !== undefined) {
        updates.push("status = ?");
        params.push(status);
      }
      if (actual_start_date !== undefined) {
        updates.push("actual_start_date = ?");
        params.push(actual_start_date);
      }
      if (actual_end_date !== undefined) {
        updates.push("actual_end_date = ?");
        params.push(actual_end_date);
      }
      if (work_center_id !== undefined) {
        updates.push("work_center_id = ?");
        params.push(work_center_id);
      }

      if (updates.length === 0) return res.json({ success: true });

      params.push(id);
      db.prepare(
        `UPDATE project_tasks SET ${updates.join(", ")} WHERE id = ?`,
      ).run(...params);

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  router.get("/api/gantt", (req, res) => {
    try {
      const projects = db
        .prepare(
          "SELECT * FROM projects WHERE archived_at IS NULL AND status NOT IN ('PENDING_NTP', 'INTERNAL_OVERHEAD') AND id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL') AND UPPER(COALESCE(name, '')) NOT LIKE '%CONSUMABLE%' AND UPPER(COALESCE(name, '')) NOT LIKE '%TRANSPORTATION%' AND UPPER(COALESCE(name, '')) NOT LIKE '%OTHER PROCUREMENT%' AND UPPER(COALESCE(name, '')) NOT LIKE '%OTHERS PROCUREMENT%' AND UPPER(COALESCE(name, '')) NOT LIKE '%GENERAL PROCUREMENT%' ORDER BY due_date ASC",
        )
        .all() as any[];

      for (const p of projects) {
        syncProjectGanttTasks(p.id);
      }

      const tasks = db
        .prepare(
          `
      SELECT t.*, wc.name as work_center_name 
      FROM project_tasks t
      LEFT JOIN work_centers wc ON t.work_center_id = wc.id
      WHERE t.status != 'CANCELLED'
      ORDER BY t.start_date ASC
    `,
        )
        .all() as any[];

      const tasksByProject: Record<string, any[]> = {};
      for (const t of tasks) {
        if (!tasksByProject[t.project_id]) tasksByProject[t.project_id] = [];
        tasksByProject[t.project_id].push(t);
      }

      if (projects.length === 0) return res.json([]);

      const counts = db
        .prepare(
          `
      SELECT 
        p.id as project_id,
        (SELECT SUM(required_qty * COALESCE(p.qty, 1)) FROM boms WHERE project_id = p.id) as total_bom,
        (SELECT SUM(qty_consumed) FROM bom_item_consumption bic JOIN boms b ON b.id = bic.bom_id WHERE b.project_id = p.id) as total_consumed
      FROM projects p
      WHERE p.archived_at IS NULL
    `,
        )
        .all() as any[];

      const countMap: Record<string, any> = {};
      for (const count of counts) {
        countMap[count.project_id] = count;
      }

      const projectsWithTasks = projects.map((p) => {
        const count = countMap[p.id];
        const totalBom = count?.total_bom || 0;
        const totalConsumed = count?.total_consumed || 0;

        let materialStatus: "UNAVAILABLE" | "READY" = "READY";
        if (totalBom > 0 && totalConsumed <= 0) {
          materialStatus = "UNAVAILABLE";
        }

        return {
          ...p,
          material_status: materialStatus,
          tasks: tasksByProject[p.id] || [],
        };
      });

      res.json(projectsWithTasks);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch gantt data" });
    }
  });

  router.put("/api/projects/:id/factory-factor", (req, res) => {
    try {
      const { factory_factor } = req.body;
      if (typeof factory_factor !== 'number') {
        return res.status(400).json({ error: "Invalid factory_factor" });
      }
      db.prepare("UPDATE projects SET factory_factor = ? WHERE id = ?").run(factory_factor, req.params.id);
      res.json({ success: true, factory_factor });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update factory factor" });
    }
  });

  router.get("/api/projects/:id", (req, res) => {
    try {
      const projectId = req.params.id;
      syncProjectGanttTasks(projectId);

      const project = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId) as any;
      if (!project)
        return res.status(404).json({ error: "Project not found" });

      const bop = db
        .prepare(
          `SELECT * FROM bill_of_processes 
           WHERE project_id = ? OR project_id = (SELECT spk_number FROM projects WHERE id = ?)
           ORDER BY step_sequence ASC`
        )
        .all(projectId, projectId);

      const bopSteps = db
        .prepare(
          `SELECT b.id, b.project_id, b.process_name as task_name,
                  COALESCE(b.start_date, '') as start_date,
                  COALESCE(b.end_date, '') as end_date,
                  b.actual_start_date, b.actual_end_date,
                  COALESCE(b.progress, 0) as progress,
                  COALESCE(b.status, 'PENDING') as status,
                  b.work_center_id,
                  COALESCE(wc.name, b.work_center_name) as work_center_name,
                  COALESCE(b.standard_hours, 8) as required_hours,
                  b.legacy_task_id
           FROM bill_of_processes b
           LEFT JOIN work_centers wc ON b.work_center_id = wc.id
           WHERE (b.project_id = ? OR b.project_id = (SELECT spk_number FROM projects WHERE id = ?))
             AND COALESCE(b.status, 'PENDING') != 'CANCELLED'
           ORDER BY b.step_sequence ASC`
        )
        .all(projectId, projectId) as any[];

      const legacyTasks = db
        .prepare(
          `SELECT t.*, wc.name as work_center_name 
           FROM project_tasks t
           LEFT JOIN work_centers wc ON t.work_center_id = wc.id
           WHERE t.project_id = ? AND t.status != 'CANCELLED'
           ORDER BY t.start_date ASC`,
        )
        .all(projectId) as any[];

      const tasks = bopSteps.length > 0 ? bopSteps : legacyTasks;

      const prs = db
        .prepare(
          `
      SELECT 
        pr.pr_number, 
        pr.status, 
        pr.created_at, 
        COUNT(pri.id) as item_count,
        EXISTS(SELECT 1 FROM pr_items pri2 WHERE pri2.pr_id = pr.id AND pri2.po_id IS NOT NULL) as has_po
      FROM purchase_requests pr
      LEFT JOIN pr_items pri ON pr.id = pri.pr_id
      WHERE pr.project_id = ?
      GROUP BY pr.id
      ORDER BY pr.created_at DESC
    `,
        )
        .all(req.params.id);

      const bom = db
        .prepare(
          `
      SELECT 
        b.*, 
        (b.required_qty * COALESCE((SELECT qty FROM projects WHERE id = b.project_id), 1)) as total_required_qty,
        COALESCE(i.item_code, (SELECT item_code FROM items WHERE id = b.item_id), 'N/A') as item_code, 
        COALESCE(i.name, (SELECT name FROM items WHERE id = b.item_id), 'Unknown Item') as item_name, 
        COALESCE(i.uom, (SELECT uom FROM items WHERE id = b.item_id), 'PCS') as uom, 
        COALESCE(b.dimension, i.dimension) as dimension,
        COALESCE(b.spec, i.spec) as spec,
        COALESCE(
          (SELECT MIN(unit_price) FROM item_supplier_prices WHERE item_id = i.id),
          i.unit_price,
          b.unit_price,
          0
        ) as matrix_unit_price,
        COALESCE(inv.free_stock, 0) as free_stock,
        COALESCE(inv.allocated_stock, 0) as allocated_stock,
        bic.qty_consumed,
        (
          SELECT GROUP_CONCAT(pr.pr_number || ' (' || pri.qty || ')', ', ')
          FROM pr_items pri
          JOIN purchase_requests pr ON pri.pr_id = pr.id
          WHERE (pri.item_id = b.item_id OR pri.item_id = i.id) AND pr.project_id = b.project_id AND pr.status != 'CANCELLED'
        ) as pr_numbers,
        (
          SELECT SUM(pri.qty)
          FROM pr_items pri
          JOIN purchase_requests pr ON pri.pr_id = pr.id
          WHERE (pri.item_id = b.item_id OR pri.item_id = i.id) AND pr.project_id = b.project_id AND pr.status != 'CANCELLED'
        ) as total_pr_qty
      FROM boms b
      LEFT JOIN items i ON (b.item_id = i.id OR b.item_id = i.item_code)
      LEFT JOIN inventory inv ON (b.item_id = inv.item_id OR i.id = inv.item_id)
      LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
      WHERE b.project_id = ?
    `,
        )
        .all(req.params.id);

      const deliveries = db
        .prepare(
          `
       SELECT dn.*, COALESCE(c.name, dn.customer_id) as customer_name 
       FROM delivery_notes dn 
       LEFT JOIN customers c ON dn.customer_id = c.id
       WHERE dn.project_id = ? 
       ORDER BY dn.created_at DESC
    `,
        )
        .all(req.params.id);

      const fgs = db
        .prepare(
          `
       SELECT * FROM items WHERE (type = 'FINISHED' OR type = 'FINISH_GOOD') AND item_code LIKE ?
    `,
        )
        .all(`FG-${req.params.id}%`);

      const invoices = db
        .prepare(
          `
       SELECT ci.*, COALESCE(c.name, ci.customer_id) as customer_name
       FROM commercial_invoices ci
       LEFT JOIN customers c ON ci.customer_id = c.id
       WHERE ci.project_id = ?
       ORDER BY ci.created_at DESC
    `,
        )
        .all(req.params.id) as any[];

      for (let inv of invoices) {
        inv.items = db
          .prepare(
            `
            SELECT di.*, 
                   COALESCE(i.item_code, 'FG-' || dn.project_id) as item_code, 
                   COALESCE(i.name, p.name, 'Commercial Trade Item') as item_name
            FROM delivery_items di
            JOIN delivery_notes dn ON di.dn_id = dn.id
            LEFT JOIN items i ON di.item_id = i.id
            LEFT JOIN projects p ON dn.project_id = p.id
            WHERE di.dn_id = ?
          `,
          )
          .all(inv.dn_id);
      }

      let quotation_items = project.quotation_id
        ? (db
            .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
            .all(project.quotation_id) as any[])
        : [];

      if (quotation_items.length > 0) {
        const matchedItem = quotation_items.find(
          (qi) =>
            qi.id === project.quotation_item_id ||
            (qi.title &&
              project.name &&
              qi.title.toLowerCase().trim() === project.name.toLowerCase().trim()),
        );
        if (matchedItem) {
          matchedItem.qty = Number(project.qty) > 0 ? Number(project.qty) : matchedItem.qty;
          matchedItem.uom = project.uom || matchedItem.uom;
          quotation_items = [
            matchedItem,
            ...quotation_items.filter((qi) => qi.id !== matchedItem.id),
          ];
        }
      }

      const wots = db
        .prepare(`
          SELECT w.*, 
                 COALESCE(w.wot_number, w.lot_number) as wo_number,
                 COALESCE(i.name, 'Unassigned') as machine_name,
                 COALESCE(b.process_name, 'Process') as current_process_name
          FROM work_order_tickets w
          LEFT JOIN items i ON w.machine_id = i.id
          LEFT JOIN bill_of_processes b ON w.current_process_id = b.id
          WHERE w.project_id = ?
          ORDER BY w.created_at ASC
        `)
        .all(req.params.id) as any[];

      const legacyWos = db
        .prepare("SELECT * FROM work_orders WHERE project_id = ?")
        .all(req.params.id) as any[];

      const work_orders = wots.length > 0 ? wots : legacyWos;

      const recent_production_logs = db
        .prepare(`
          SELECT pl.*, 
                 COALESCE(i.name, 'N/A') as machine_name,
                 COALESCE(u.name, 'Operator') as user_name
          FROM production_logs pl
          LEFT JOIN items i ON pl.machine_id = i.id
          LEFT JOIN users u ON pl.user_id = u.id
          WHERE pl.project_id = ?
          ORDER BY pl.timestamp DESC
          LIMIT 10
        `)
        .all(req.params.id);

      const active_ndps = db
        .prepare(`
          SELECT n.*, i.name as machine_name, i.item_code as machine_code
          FROM ndps n
          LEFT JOIN items i ON n.affected_machine_id = i.id
          WHERE (n.status = 'ACTIVE' OR n.status = 'ACKNOWLEDGED')
            AND (
              n.affected_machine_id IN (
                SELECT assigned_machine_id FROM bill_of_processes WHERE project_id = ?
              )
              OR n.affected_machine_id IN (
                SELECT machine_id FROM work_order_tickets WHERE project_id = ?
              )
            )
        `)
        .all(req.params.id, req.params.id);

      const active_floor_requests = db
        .prepare(`
          SELECT fr.*, u.name as requester_name
          FROM floor_requests fr
          LEFT JOIN users u ON fr.requested_by = u.id
          WHERE fr.project_id = ? AND fr.status IN ('PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS')
          ORDER BY fr.requested_at DESC
        `)
        .all(req.params.id);

      const manpower_assignments = db
        .prepare(`
          SELECT 
            pma.*, 
            pm.name as manpower_name, 
            pm.role_title, 
            pm.nik,
            pm.skill_level
          FROM production_manpower_assignments pma
          JOIN production_manpower pm ON pma.manpower_id = pm.id
          WHERE pma.project_id = ?
          ORDER BY pma.created_at DESC
        `)
        .all(req.params.id);

      let spk = null;
      if (project.spk_id) {
        spk = db.prepare("SELECT * FROM spks WHERE id = ?").get(project.spk_id) as any;
      } else if (project.spk_number) {
        spk = db.prepare("SELECT * FROM spks WHERE spk_number = ?").get(project.spk_number) as any;
      } else {
        spk = db.prepare("SELECT * FROM spks WHERE project_id = ?").get(project.id) as any;
      }

      let sibling_projects: any[] = [];
      if (spk) {
        sibling_projects = db
          .prepare("SELECT id, name, COALESCE(qty, 1) as qty, uom, status, spk_number FROM projects WHERE spk_id = ? OR id = ? OR spk_number = ?")
          .all(spk.id, spk.project_id, spk.spk_number) as any[];
      } else {
        sibling_projects = [{ id: project.id, name: project.name, qty: project.qty || 1, uom: project.uom || "Unit", status: project.status, spk_number: project.spk_number }];
      }

      let hpp_breakdown = null;
      try {
        hpp_breakdown = recalculateProjectFinancialSummary(db, projectId);
      } catch (hppErr) {
        console.warn("Could not calculate HPP breakdown for project:", hppErr);
      }

      const authoritativeDueDate =
        (spk?.due_date && spk.due_date !== "2099-12-31" ? spk.due_date : null) ||
        (spk?.target_completion_date && spk.target_completion_date !== "2099-12-31" ? spk.target_completion_date : null) ||
        (project.due_date && project.due_date !== "2099-12-31" ? project.due_date : null) ||
        project.end_date ||
        project.due_date;

      const enrichedProject = {
        ...project,
        due_date: authoritativeDueDate,
        ntp_deadline: authoritativeDueDate,
      };

      res.json({
        project: enrichedProject,
        spk,
        sibling_projects,
        tasks,
        bop,
        processes: bop,
        bopSteps,
        prs,
        bom,
        deliveries,
        fgs,
        invoices,
        quotation_items,
        work_orders,
        wots,
        recent_production_logs,
        active_ndps,
        active_floor_requests,
        manpower_assignments,
        hpp_breakdown,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch project details" });
    }
  });

  router.get("/api/projects/:id/bom", (req, res) => {
    try {
      const { id } = req.params;
      const bom = db
        .prepare(
          `
      SELECT 
        b.*, 
        (b.required_qty * COALESCE((SELECT qty FROM projects WHERE id = b.project_id), 1)) as total_required_qty,
        COALESCE(i.item_code, (SELECT item_code FROM items WHERE id = b.item_id), 'N/A') as item_code, 
        COALESCE(i.name, (SELECT name FROM items WHERE id = b.item_id), 'Unknown Item') as item_name, 
        COALESCE(i.uom, (SELECT uom FROM items WHERE id = b.item_id), 'PCS') as uom, 
        COALESCE(b.dimension, i.dimension) as dimension,
        COALESCE(b.spec, i.spec) as spec,
        COALESCE(
          (SELECT MIN(unit_price) FROM item_supplier_prices WHERE item_id = i.id),
          i.unit_price,
          b.unit_price,
          0
        ) as matrix_unit_price,
        COALESCE(inv.free_stock, 0) as free_stock,
        COALESCE(inv.allocated_stock, 0) as allocated_stock,
        bic.qty_consumed
      FROM boms b
      LEFT JOIN items i ON (b.item_id = i.id OR b.item_id = i.item_code)
      LEFT JOIN inventory inv ON (b.item_id = inv.item_id OR i.id = inv.item_id)
      LEFT JOIN bom_item_consumption bic ON b.id = bic.bom_id
      WHERE b.project_id = ?
    `
        )
        .all(id);
      res.json({ ok: true, bom });
    } catch (error) {
      console.error("Failed to fetch project BOM:", error);
      res.status(500).json({ error: "Failed to fetch project BOM" });
    }
  });

  router.get("/api/projects/:id/spk", (req, res) => {
    try {
      const { id } = req.params;
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
      let spk = null;
      if (project?.spk_id) {
        spk = db.prepare("SELECT * FROM spks WHERE id = ?").get(project.spk_id) as any;
      } else if (project?.spk_number) {
        spk = db.prepare("SELECT * FROM spks WHERE spk_number = ?").get(project.spk_number) as any;
      } else {
        spk = db.prepare("SELECT * FROM spks WHERE project_id = ?").get(id) as any;
      }
      res.json({ ok: true, spk });
    } catch (error) {
      console.error("Failed to fetch project SPK:", error);
      res.status(500).json({ error: "Failed to fetch project SPK" });
    }
  });

  router.get("/api/projects/:id/manpower-assignments", (req, res) => {
    try {
      const { id } = req.params;

      try {
        db.prepare(`
          DELETE FROM production_manpower_assignments 
          WHERE project_id = ? 
            AND status NOT IN ('COMPLETED', 'CANCELLED')
            AND id NOT IN (
              SELECT MIN(id) 
              FROM production_manpower_assignments 
              WHERE project_id = ? AND status NOT IN ('COMPLETED', 'CANCELLED')
              GROUP BY manpower_id, COALESCE(station_id, ''), COALESCE(bop_id, ''), COALESCE(task_name, '')
            )
        `).run(id, id);
      } catch (e) {
        // ignore cleanup errors
      }

      const assignments = db
        .prepare(`
          SELECT 
            pma.*, 
            pm.name as manpower_name, 
            pm.role_title, 
            pm.nik,
            pm.skill_level,
            pm.phone,
            pm.status as operator_status
          FROM production_manpower_assignments pma
          JOIN production_manpower pm ON pma.manpower_id = pm.id
          WHERE pma.project_id = ?
          ORDER BY pma.created_at DESC
        `)
        .all(id);

      res.json(assignments);
    } catch (err: any) {
      console.error("Error fetching operator allocations:", err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/api/projects/:id/manpower-assignments", (req, res) => {
    try {
      const { id } = req.params;
      const { manpower_id, task_name, bop_id, station_id, start_date, end_date, planned_hours, remarks, shift } = req.body;

      const mp = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(manpower_id) as any;
      if (!mp) {
        return res.status(404).json({ error: "Manpower not found" });
      }

      const existingAssignments = db.prepare(`
        SELECT pma.*, bop.process_name, bop.step_sequence, bop.id as bop_step_id, ps.station_name, ps.station_code
        FROM production_manpower_assignments pma
        LEFT JOIN bill_of_processes bop ON (pma.bop_id = bop.id OR (pma.bop_id IS NULL AND pma.task_name = bop.process_name AND bop.project_id = pma.project_id))
        LEFT JOIN project_stations ps ON pma.station_id = ps.id
        WHERE pma.project_id = ? AND pma.manpower_id = ? 
          AND pma.status NOT IN ('COMPLETED', 'CANCELLED')
      `).all(id, manpower_id) as any[];

      const anyActiveAssignment = db.prepare(`
        SELECT pma.*, ps.station_name, ps.station_code
        FROM production_manpower_assignments pma
        LEFT JOIN project_stations ps ON pma.station_id = ps.id
        WHERE pma.manpower_id = ? AND pma.status NOT IN ('COMPLETED', 'CANCELLED')
      `).get(manpower_id) as any;

      if (anyActiveAssignment) {
        const stepLabel = (anyActiveAssignment.station_code ? `${anyActiveAssignment.station_code} - ${anyActiveAssignment.station_name}` : null) || 
                          anyActiveAssignment.task_name || 
                          "stasiun lain";
        return res.status(400).json({ 
          error: `Operator "${mp.name}" sudah aktif ditugaskan pada "${stepLabel}". Tidak bisa ditugaskan ke stasiun/proses lain sebelum tugas sebelumnya diselesaikan.`
        });
      }

      if (bop_id && existingAssignments.length > 0) {
        const allBopSteps = db.prepare(`SELECT * FROM bill_of_processes WHERE project_id = ?`).all(id) as any[];
        const existingBopIds = existingAssignments
          .map(a => a.bop_step_id || a.bop_id)
          .filter(Boolean);

        const validation = validateManpowerSequentialAssignment(bop_id, existingBopIds, allBopSteps);
        if (!validation.isValid) {
          return res.status(400).json({
            error: validation.message
          });
        }
      }

      const assignId = `asgn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const plannedHoursNum = Number(planned_hours) || 8;
      
      const runTx = db.transaction(() => {
        db.prepare(`
          INSERT INTO production_manpower_assignments (
            id, manpower_id, project_id, task_name, bop_id, station_id, shift,
            assigned_date, target_end_date, planned_hours, status, remarks
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?)
        `).run(
          assignId,
          manpower_id,
          id,
          task_name || "Production Operation",
          bop_id || null,
          station_id || null,
          shift || mp.shift || "SHIFT_1",
          start_date || new Date().toISOString().slice(0, 10),
          end_date || null,
          plannedHoursNum,
          remarks || null
        );

        if (bop_id) {
          db.prepare(`
            UPDATE bill_of_processes 
            SET start_date = COALESCE(?, start_date),
                end_date = COALESCE(?, end_date),
                standard_hours = CASE WHEN ? > 0 THEN ? ELSE standard_hours END
            WHERE id = ?
          `).run(start_date || null, end_date || null, plannedHoursNum, plannedHoursNum, bop_id);

          db.prepare(`
            UPDATE project_tasks 
            SET start_date = COALESCE(?, start_date),
                end_date = COALESCE(?, end_date),
                required_hours = CASE WHEN ? > 0 THEN ? ELSE required_hours END
            WHERE id = ? OR (project_id = ? AND task_name = ?)
          `).run(start_date || null, end_date || null, plannedHoursNum, plannedHoursNum, bop_id, id, task_name);
        } else if (task_name) {
          db.prepare(`
            UPDATE project_tasks 
            SET start_date = COALESCE(?, start_date),
                end_date = COALESCE(?, end_date),
                required_hours = CASE WHEN ? > 0 THEN ? ELSE required_hours END
            WHERE project_id = ? AND task_name = ?
          `).run(start_date || null, end_date || null, plannedHoursNum, plannedHoursNum, id, task_name);

          db.prepare(`
            UPDATE bill_of_processes 
            SET start_date = COALESCE(?, start_date),
                end_date = COALESCE(?, end_date),
                standard_hours = CASE WHEN ? > 0 THEN ? ELSE standard_hours END
            WHERE project_id = ? AND process_name = ?
          `).run(start_date || null, end_date || null, plannedHoursNum, plannedHoursNum, id, task_name);
        }
      });

      runTx();

      res.json({ success: true, assignment_id: assignId });
    } catch (err: any) {
      console.error("Error creating capacity plan:", err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete("/api/projects/:id/manpower-assignments/:assignmentId", (req, res) => {
    try {
      db.prepare("DELETE FROM production_manpower_assignments WHERE id = ?").run(req.params.assignmentId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting assignment:", err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/api/projects/:id/tasks", (req, res) => {
    try {
      const project = db
        .prepare("SELECT status FROM projects WHERE id = ?")
        .get(req.params.id) as any;
      if (
        project &&
        (project.status === "FINISHED" || project.status === "CLOSED")
      ) {
        return res.status(400).json({
          error: "Cannot add task to a finished or closed project.",
        });
      }
      const { task_name, start_date, end_date, progress, status, work_center_id, required_hours } = req.body;
      const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
      const bopId = "BOP-" + taskId;
      const sDate = start_date || new Date().toISOString().split("T")[0];
      const eDate = end_date || sDate;
      const reqHours = Number(required_hours) > 0 ? Number(required_hours) : 8;

      db.transaction(() => {
        const nextSeqRow = db
          .prepare("SELECT COALESCE(MAX(step_sequence), 0) + 1 as next_seq FROM bill_of_processes WHERE project_id = ?")
          .get(req.params.id) as any;
        const nextSeq = nextSeqRow?.next_seq || 1;

        db.prepare(
          `INSERT INTO bill_of_processes (
             id, project_id, step_sequence, process_name, node_type, work_center_id,
             standard_hours, cycle_time_minutes, start_date, end_date, progress, status, legacy_task_id
           ) VALUES (?, ?, ?, ?, 'PROCESS', ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          bopId,
          req.params.id,
          nextSeq,
          task_name || "Task",
          work_center_id || null,
          reqHours,
          reqHours * 60,
          sDate,
          eDate,
          progress || 0,
          status || "PENDING",
          taskId
        );

        db.prepare(
          "INSERT INTO project_tasks (id, project_id, task_name, work_center_id, required_hours, start_date, end_date, progress, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          taskId,
          req.params.id,
          task_name || "Task",
          work_center_id || null,
          reqHours,
          sDate,
          eDate,
          progress || 0,
          status || "PENDING",
        );
      })();
      res.json({ success: true, id: bopId, task_id: taskId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to add task" });
    }
  });

  router.put("/api/tasks/:id/progress", (req, res) => {
    try {
      const {
        progress,
        status,
        actual_start_date,
        actual_end_date,
        work_center_id,
        required_hours,
      } = req.body;
      const taskId = req.params.id;

      db.transaction(() => {
        const currentBop = db
          .prepare("SELECT * FROM bill_of_processes WHERE id = ? OR legacy_task_id = ?")
          .get(taskId, taskId) as any;
        const currentTask = db
          .prepare("SELECT * FROM project_tasks WHERE id = ?")
          .get(currentBop?.legacy_task_id || taskId) as any;

        const baseRecord = currentBop || currentTask;
        if (!baseRecord) return;

        let finalStartDate =
          actual_start_date !== undefined
            ? actual_start_date
            : baseRecord.actual_start_date;
        let finalEndDate =
          actual_end_date !== undefined
            ? actual_end_date
            : baseRecord.actual_end_date;

        let finalWorkCenter =
          work_center_id !== undefined
            ? work_center_id
            : baseRecord.work_center_id;
        let finalRequiredHours =
          required_hours !== undefined
            ? required_hours
            : (baseRecord.standard_hours ?? baseRecord.required_hours);

        if (status === "IN_PROGRESS" && !finalStartDate) {
          finalStartDate = new Date().toISOString();
        }
        if (status === "COMPLETED" && !finalEndDate) {
          finalEndDate = new Date().toISOString();
          if (!finalStartDate) finalStartDate = new Date().toISOString();
        }

        let validWorkCenter: string | null = null;
        if (finalWorkCenter && typeof finalWorkCenter === "string" && finalWorkCenter.trim() !== "") {
          const wcCheck = db.prepare("SELECT id FROM work_centers WHERE id = ?").get(finalWorkCenter.trim()) as any;
          if (wcCheck) validWorkCenter = finalWorkCenter.trim();
        }

        if (currentBop) {
          db.prepare(
            `UPDATE bill_of_processes
             SET progress = ?, status = ?, actual_start_date = ?, actual_end_date = ?, work_center_id = ?, standard_hours = ?
             WHERE id = ?`
          ).run(
            progress,
            status,
            finalStartDate,
            finalEndDate,
            validWorkCenter,
            finalRequiredHours || 8,
            currentBop.id
          );
        }

        if (currentTask) {
          db.prepare(
            "UPDATE project_tasks SET progress = ?, status = ?, actual_start_date = ?, actual_end_date = ?, work_center_id = ?, required_hours = ? WHERE id = ?",
          ).run(
            progress,
            status,
            finalStartDate,
            finalEndDate,
            validWorkCenter,
            finalRequiredHours || null,
            currentTask.id,
          );
        }

        const targetProjectId = baseRecord.project_id;
        if (targetProjectId) {
          const allBops = db
            .prepare("SELECT status FROM bill_of_processes WHERE project_id = ?")
            .all(targetProjectId) as any[];
          const allSteps = allBops.length > 0
            ? allBops
            : (db.prepare("SELECT status FROM project_tasks WHERE project_id = ?").all(targetProjectId) as any[]);

          const task = { project_id: targetProjectId };
          if (
            allSteps.length > 0 &&
            allSteps.every((t) => t.status === "COMPLETED")
          ) {
            const project = db
              .prepare("SELECT status FROM projects WHERE id = ?")
              .get(task.project_id) as any;
            if (project && project.status !== "FINISHED") {
              db.prepare(
                "UPDATE projects SET status = 'FINISHED' WHERE id = ?",
              ).run(task.project_id);

              const uniqueItems = db
                .prepare(
                  "SELECT DISTINCT item_id FROM boms WHERE project_id = ?",
                )
                .all(task.project_id) as { item_id: string }[];
              for (const { item_id } of uniqueItems) {
                const allocResult = db
                  .prepare(
                    `
                  SELECT COALESCE(SUM(qty), 0) as total_alloc
                  FROM stock_movements
                  WHERE project_id = ? AND item_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION')
                `,
                  )
                  .get(task.project_id, item_id) as any;

                const consumeResult = db
                  .prepare(
                    `
                  SELECT COALESCE(SUM(ABS(qty)), 0) as total_consumed
                  FROM stock_movements
                  WHERE project_id = ? AND item_id = ? AND type = 'CONSUMPTION'
                `,
                  )
                  .get(task.project_id, item_id) as any;

                const remaining =
                  (allocResult.total_alloc || 0) -
                  (consumeResult.total_consumed || 0);
                const projectAllocated = Math.max(0, remaining);
                if (projectAllocated > 0) {
                  db.prepare(
                    "INSERT INTO stock_movements (id, item_id, project_id, type, qty, reference_id) VALUES (?, ?, ?, 'RELEASE', ?, ?)",
                  ).run(
                    "MOV-" + Math.random().toString(36).substr(2, 9),
                    item_id,
                    task.project_id,
                    projectAllocated,
                    "Auto-release on auto-archive",
                  );
                }
              }
              logAudit(
                null,
                "AUTO_ARCHIVE",
                "PROJECT",
                task.project_id,
                "Project automatically finished as all tasks are completed.",
              );
            }
          }
        }
      })();

      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });
}
