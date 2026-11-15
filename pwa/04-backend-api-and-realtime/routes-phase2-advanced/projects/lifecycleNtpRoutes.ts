import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { syncCollectionToFirestore } from "../../db/firebaseSync.ts";
import {
  getNextProjectSequence,
  generateSmartProjectId,
} from "../../utils/autoCoding.ts";
import { recalculateProjectFinancialSummary } from "../../services/projectHppService.ts";
import { postProductionFinishJournal } from "../../utils/accountingBridge.ts";
import { checkQuotationExpired } from "./helpers.ts";
import crypto from "crypto";

export function registerLifecycleNtpRoutes(router: Router) {
  const syncUnifiedNtpNumbers = () => {
    try {
      db.prepare(
        `UPDATE projects
         SET ntp_number = id,
             spk_number = id
         WHERE id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
           AND (ntp_number IS NULL OR ntp_number != id OR spk_number IS NULL OR spk_number != id)`
      ).run();

      db.prepare(
        `UPDATE ntps
         SET ntp_number = project_id
         WHERE project_id IS NOT NULL AND (ntp_number IS NULL OR ntp_number != project_id)`
      ).run();

      db.prepare(
        `UPDATE spks
         SET spk_number = project_id
         WHERE project_id IS NOT NULL AND (spk_number IS NULL OR spk_number != project_id)`
      ).run();

      const missingProjects = db
        .prepare(
          `SELECT p.id, p.quotation_id, p.created_at, p.ntp_id
           FROM projects p
           LEFT JOIN ntps n ON n.project_id = p.id
           WHERE p.id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
             AND p.archived_at IS NULL
             AND n.id IS NULL`
        )
        .all() as any[];

      if (missingProjects.length > 0) {
        const insertNtp = db.prepare(
          `INSERT INTO ntps (id, ntp_number, project_id, quotation_id, created_at, status)
           VALUES (?, ?, ?, ?, ?, 'ISSUED')`
        );
        const updateProjNtp = db.prepare(
          `UPDATE projects SET ntp_id = ?, ntp_number = ? WHERE id = ?`
        );
        for (const mp of missingProjects) {
          const newNtpId =
            mp.ntp_id ||
            "NTP-" + Math.random().toString(36).substring(2, 9).toUpperCase();
          insertNtp.run(
            newNtpId,
            mp.id,
            mp.id,
            mp.quotation_id || null,
            mp.created_at || new Date().toISOString()
          );
          updateProjNtp.run(newNtpId, mp.id, mp.id);
        }
      }
    } catch (e) {
      console.warn("NTP number unification sync warning:", e);
    }
  };

  syncUnifiedNtpNumbers();

  router.post(
    "/api/projects/:id/finish",
    requireRole(["ENGINEERING", "PRODUCTION", "PPIC", "QA_QC", "WAREHOUSE", "FC", "ADMIN", "SUPERADMIN", "DIRECTOR", "BOD"]),
    (req, res) => {
      try {
        const projectId = req.params.id;
        
        const project: any = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
        if (!project) return res.status(404).json({ error: "Project not found" });

        const incompleteBoP = db.prepare(`SELECT COUNT(*) as count FROM bill_of_processes WHERE project_id = ? AND status != 'COMPLETED'`).get(project.id) as any;
        if (incompleteBoP && incompleteBoP.count > 0) {
           return res.status(400).json({ error: `Cannot finish project: There are ${incompleteBoP.count} incomplete production process step(s) (BoP).` });
        }

        const activeNdp = db.prepare(`SELECT COUNT(*) as count FROM notice_to_down_processes WHERE project_id = ? AND status = 'ACTIVE'`).get(project.id) as any;
        if (activeNdp && activeNdp.count > 0) {
           return res.status(400).json({ error: `Cannot finish project: There are ${activeNdp.count} active downtime report(s) (NDP). Please resolve them first.` });
        }

        let itemId = null;
        let totalQty = project.qty || 1;
        const isGeneral = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"].includes(projectId);
        const fgCode = `FG-${project.id}`;
        const fgName = project.name;
        const firstUom = project.uom || "Unit";
        const fgrNumber = `FGR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${project.spk_number || project.id.slice(-6)}`;
        const fgrId = `fgr_${Date.now()}`;
        const sn = `SN-${Date.now().toString().slice(-6)}`;

        let hppSummary: any = null;
        try {
          hppSummary = recalculateProjectFinancialSummary(db, project.id);
        } catch (hppErr) {
          console.warn("Project financial summary calculation note:", hppErr);
        }
        const unitHpp = hppSummary?.fullCosting?.unitHpp || hppSummary?.unitHpp || 0;
        const userEmailStr = (req.headers["x-user-email"] as string) || "PRODUCTION_MANAGER";

        const transaction = db.transaction(() => {
          db.prepare(
            "UPDATE projects SET status = 'FINISHED', completed_at = CURRENT_TIMESTAMP, archived_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(projectId);

          if (!isGeneral) {
            const existingItem = db.prepare("SELECT * FROM items WHERE item_code = ?").get(fgCode) as any;
            
            if (!existingItem) {
              itemId = "ITM-" + crypto.randomUUID();
              db.prepare(
                "INSERT INTO items (id, item_code, name, spec, uom, type, category, min_stock, max_stock, unit_price, description) VALUES (?, ?, ?, ?, ?, 'FINISHED', 'MANUFACTURED_FG', 1, 100, ?, ?)",
              ).run(
                itemId,
                fgCode,
                fgName,
                `Finished Good for Project ${project.name}`,
                firstUom,
                unitHpp,
                `Manufactured Finish Good from SPK ${project.spk_number || project.id}`
              );
              db.prepare(
                "INSERT INTO inventory (item_id, physical_qty, free_stock, allocated_stock, available_qty) VALUES (?, ?, ?, 0, ?) ON CONFLICT(item_id) DO UPDATE SET physical_qty = physical_qty + excluded.physical_qty, free_stock = free_stock + excluded.free_stock, available_qty = available_qty + excluded.available_qty",
              ).run(itemId, totalQty, totalQty, totalQty);
            } else {
              itemId = existingItem.id;
              db.prepare(
                "UPDATE items SET unit_price = ? WHERE id = ?",
              ).run(unitHpp, itemId);
              db.prepare(
                "UPDATE inventory SET physical_qty = physical_qty + ?, free_stock = free_stock + ?, available_qty = available_qty + ? WHERE item_id = ?",
              ).run(totalQty, totalQty, totalQty, itemId);
            }

            db.prepare(
              "INSERT INTO stock_movements (id, item_id, type, qty, reference_id, project_id, recorded_by) VALUES (?, ?, 'FINISHED_GOOD_INTAKE', ?, ?, ?, ?)",
            ).run(
              "SMV-" + crypto.randomUUID(),
              itemId,
              totalQty,
              project.id,
              project.id,
              userEmailStr
            );

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
                INSERT OR REPLACE INTO finish_good_records (
                  id, fgr_number, project_id, item_code, item_name, serial_number,
                  quantity, uom, status, notes, inspected_by, target_warehouse
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)
              `).run(
                fgrId,
                fgrNumber,
                projectId,
                fgCode,
                fgName,
                sn,
                totalQty,
                firstUom,
                `Finished Good handover from Project ${project.name}`,
                userEmailStr,
                "WAREHOUSE_FG_1"
              );
            } catch (fgrErr) {
              console.error("Error saving FGR:", fgrErr);
            }
            
            logAudit(
              userEmailStr,
              "RECORD_FINISHED_GOOD",
              "PROJECT",
              project.id,
              `Recorded ${totalQty} ${firstUom} as Finished Good for project ${project.id}. Unit HPP: Rp ${unitHpp.toLocaleString("id-ID")}`,
            );
          }

          logAudit(
            userEmailStr,
            "FINISH_PROJECT",
            "PROJECT",
            projectId,
            "Project finished and archived cleanly with FGR and WIP capitalization.",
          );
        });

        transaction();

        if (hppSummary) {
          try {
            postProductionFinishJournal(db, {
              project_id: project.id,
              spk_number: project.spk_number || project.id,
              total_material_cost: Number(hppSummary.totalBomCost || hppSummary.materialOnly?.totalHpp || 0),
              total_labor_cost: Number(hppSummary.totalLaborCost || 0),
              total_overhead_cost: Number(hppSummary.totalOverheadCost || 0),
              user: (req.headers["x-user-email"] as string) || "PRODUCTION_QC_FINISH",
            });
          } catch (finishJournalErr) {
            console.error("Automated Accounting postProductionFinishJournal error:", finishJournalErr);
          }
        }
        res.json({ 
          success: true, 
          item_id: itemId, 
          qty: totalQty, 
          fg_code: fgCode,
          fgr_number: fgrNumber,
          fgr: {
            id: fgrId,
            fgr_number: fgrNumber,
            item_code: fgCode,
            item_id: itemId,
            quantity: totalQty,
            uom: firstUom,
            serial_number: sn
          }
        });
      } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message || "Failed to finish project" });
      }
    },
  );

  router.post(
    "/api/projects/:id/archive",
    requireRole(["ENGINEERING", "FC", "SALES", "PRODUCTION", "PPIC", "QA_QC", "WAREHOUSE", "PURCHASING", "BOD", "ADMIN"]),
    (req, res) => {
      try {
        const projectId = req.params.id;
        const project = db
          .prepare("SELECT * FROM projects WHERE id = ?")
          .get(projectId) as any;
        if (!project)
          return res.status(404).json({ error: "Project not found" });

        db.prepare(
          "UPDATE projects SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(projectId);

        logAudit(
          (req.headers["x-user-email"] as string) || (req as any).userName || "System",
          "ARCHIVE_PROJECT",
          "PROJECT",
          projectId,
          "Project manually archived.",
        );
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to archive project" });
      }
    },
  );

  router.post(
    "/api/projects",
    requireRole(["SALES", "FC"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      if (userRole !== "FC" && userRole !== "SALES") {
        return res.status(403).json({
          error:
            "Access denied. Only Sales or FC accounts can create Projects.",
        });
      }
      try {
        const {
          name,
          due_date,
          customer,
          remarks,
          tasks,
          parent_project_id,
          urgency,
          quotation_id,
        } = req.body;

        if (!quotation_id) {
          return res.status(400).json({
            error: "Quotation reference is required to create a project",
          });
        }
        const quotation = db
          .prepare("SELECT * FROM quotations WHERE id = ?")
          .get(quotation_id) as any;
        if (!quotation) {
          return res
            .status(400)
            .json({ error: "Referenced Quotation not found" });
        }

        if (quotation.status !== "APPROVED" && quotation.status !== "AUTHORIZED") {
          return res
            .status(400)
            .json({ error: "Referenced Quotation is not APPROVED or AUTHORIZED yet" });
        }

        if (checkQuotationExpired(quotation)) {
          db.prepare(
            "UPDATE quotations SET status = 'EXPIRED' WHERE id = ?",
          ).run(quotation_id);
          return res.status(400).json({
            error:
              "Referenced Quotation has expired and is no longer valid for project creation",
          });
        }

        const customerObj = db
          .prepare("SELECT name FROM customers WHERE id = ?")
          .get(quotation.customer_id) as any;
        const finalCustomer =
          customerObj?.name || customer || quotation.customer_id;

        const currentYear = new Date().getFullYear();
        const existingProjects = db
          .prepare("SELECT id, name, status, created_at, due_date FROM projects")
          .all() as any[];
        let nextSeq = getNextProjectSequence(existingProjects, currentYear);
        let projectId = generateSmartProjectId(nextSeq, currentYear);

        const checkStmt = db.prepare("SELECT id FROM projects WHERE id = ?");
        while (checkStmt.get(projectId)) {
          nextSeq++;
          projectId = generateSmartProjectId(nextSeq, currentYear);
        }

        const spkId =
          "SPK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
        const spkNumber = projectId;
        const spkTitle = `SPK for Project - ${name}`;

        const transaction = db.transaction(() => {
          if (quotation_id) {
             const checkProject = db.prepare("SELECT id FROM projects WHERE quotation_id = ?").get(quotation_id) as any;
             if (checkProject) {
                throw new Error(`Quotation already converted to project (ID: ${checkProject.id})`);
             }
          }

          const quotationItems = db
            .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
            .all(quotation_id) as any[];
          const firstUom = quotationItems[0]?.uom || "Unit";

          const matchingQuoItem = quotationItems.find(
            (qi) =>
              qi.id === req.body.quotation_item_id ||
              (qi.title &&
                name &&
                qi.title.toLowerCase().trim() === name.toLowerCase().trim()),
          );

          const actualQty =
            req.body.qty !== undefined && req.body.qty !== null && Number(req.body.qty) > 0
              ? Number(req.body.qty)
              : matchingQuoItem
                ? Number(matchingQuoItem.qty)
                : quotationItems.length === 1
                  ? Number(quotationItems[0].qty)
                  : 1;

          const actualUom =
            req.body.uom || matchingQuoItem?.uom || firstUom || "Unit";
          const actualQuoItemId =
            req.body.quotation_item_id || matchingQuoItem?.id || null;

          const ntpId =
            "NTP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
          const ntpNumber = projectId;

          db.prepare(
            "INSERT INTO projects (id, name, due_date, customer, remarks, parent_project_id, urgency, quotation_id, spk_id, spk_number, ntp_id, ntp_number, status, lifecycle_stage, qty, uom, quotation_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(
            projectId,
            name,
            due_date,
            finalCustomer,
            remarks,
            parent_project_id || null,
            urgency || "NORMAL",
            quotation_id,
            spkId,
            spkNumber,
            ntpId,
            ntpNumber,
            "ACTIVE",
            "ENGINEERING_PREP",
            actualQty,
            actualUom,
            actualQuoItemId,
          );

          db.prepare(
            `
        INSERT INTO spks (id, spk_number, project_id, quotation_id, title)
        VALUES (?, ?, ?, ?, ?)
      `,
          ).run(spkId, spkNumber, projectId, quotation_id, spkTitle);

          db.prepare(
            "UPDATE quotations SET status = 'PROCESSED' WHERE id = ?",
          ).run(quotation_id);

          db.prepare(
            "INSERT INTO ntps (id, ntp_number, project_id, quotation_id, created_at, status) VALUES (?, ?, ?, ?, ?, 'ISSUED')",
          ).run(
            ntpId,
            ntpNumber,
            projectId,
            quotation_id,
            new Date().toISOString(),
          );

          const msgId = "MSG-" + Math.random().toString(36).substr(2, 9);
          const ntpMeta = {
            status: "ISSUED",
            amount: 0,
            partnerName: finalCustomer,
            urgency: urgency || "NORMAL",
            requiresAuth: false,
            url: `/quotations?tab=ntp&ntp_id=${encodeURIComponent(projectId)}`,
            sharedByRole: "SYSTEM",
          };
          const ntpMarker = `🔗 *Shared Resource: ${name}* (NTP) #${projectId} |META:${JSON.stringify(ntpMeta)}`;
          const broadcastContent = `🚀 **Project Execution Initiated!** 🚀\n**NTP / Project:** ${name} (${projectId})\n**Client:** 🏢 ${finalCustomer}\nOfficial Notice to Proceed (NTP) has been issued. The project is now ACTIVE and authorized for execution.\n\n${ntpMarker}`;

          db.prepare(
            `
        INSERT INTO chat_messages (id, thread_id, sender_username, content) 
        VALUES (?, ?, ?, ?)
      `,
          ).run(
            msgId,
            "THREAD-GENERAL",
            (req.headers["x-user-email"] as string) || "system",
            broadcastContent,
          );

          if (parent_project_id) {
            const parentBoms = db
              .prepare(
                "SELECT item_id, dimension, spec, required_qty, unit_price, reference FROM boms WHERE project_id = ?",
              )
              .all(parent_project_id) as any[];
            const bomInsert = db.prepare(`
          INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, unit_price, reference)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
            for (const item of parentBoms) {
              bomInsert.run(
                "BOM-" + Math.random().toString(36).substr(2, 9),
                projectId,
                item.item_id,
                item.dimension,
                item.spec,
                item.required_qty,
                item.unit_price,
                item.reference,
              );
            }

            const newBoms = db
              .prepare("SELECT id FROM boms WHERE project_id = ?")
              .all(projectId) as { id: string }[];
            for (const b of newBoms) {
              db.prepare(
                "INSERT INTO bom_item_consumption (id, bom_id, qty_consumed) VALUES (?, ?, ?)",
              ).run(
                "BIC-" + Math.random().toString(36).substr(2, 9),
                b.id,
                0,
              );
            }
          }

          if (Array.isArray(tasks) && tasks.length > 0) {
            const taskInsert = db.prepare(`
          INSERT INTO project_tasks (id, project_id, task_name, work_center_id, required_hours, start_date, end_date, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
            const bopInsert = db.prepare(`
          INSERT INTO bill_of_processes (
            id, project_id, step_sequence, process_name, node_type, work_center_id,
            standard_hours, cycle_time_minutes, start_date, end_date, status, progress, legacy_task_id
          ) VALUES (?, ?, ?, ?, 'PROCESS', ?, ?, ?, ?, ?, 'PENDING', 0, ?)
        `);
            let seq = 1;
            for (const task of tasks) {
              const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
              const sDate = task.start_date || new Date().toISOString().split("T")[0];
              const eDate = task.end_date || sDate;
              const reqHrs = Number(task.required_hours) > 0 ? Number(task.required_hours) : 8;
              taskInsert.run(
                taskId,
                projectId,
                task.task_name || "Task",
                task.work_center_id || null,
                reqHrs,
                sDate,
                eDate,
                "PENDING",
              );
              bopInsert.run(
                "BOP-" + taskId,
                projectId,
                seq++,
                task.task_name || "Task",
                task.work_center_id || null,
                reqHrs,
                reqHrs * 60,
                sDate,
                eDate,
                taskId
              );
            }
          } else if (parent_project_id) {
            const parentBopSteps = db
              .prepare(
                "SELECT process_name as task_name, work_center_id, standard_hours as required_hours, cycle_time_minutes FROM bill_of_processes WHERE project_id = ? ORDER BY step_sequence ASC",
              )
              .all(parent_project_id) as any[];
            const parentTasks = parentBopSteps.length > 0
              ? parentBopSteps
              : (db
                  .prepare(
                    "SELECT task_name, work_center_id, required_hours FROM project_tasks WHERE project_id = ?",
                  )
                  .all(parent_project_id) as any[]);
            const taskInsert = db.prepare(`
          INSERT INTO project_tasks (id, project_id, task_name, work_center_id, required_hours, start_date, end_date, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
            const bopInsert = db.prepare(`
          INSERT INTO bill_of_processes (
            id, project_id, step_sequence, process_name, node_type, work_center_id,
            standard_hours, cycle_time_minutes, start_date, end_date, status, progress, legacy_task_id
          ) VALUES (?, ?, ?, ?, 'PROCESS', ?, ?, ?, ?, ?, 'PENDING', 0, ?)
        `);
            const todayStr = new Date().toISOString().split("T")[0];
            const nextWeekStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0];
            let seq = 1;
            for (const task of parentTasks) {
              const taskId = "TSK-" + Math.random().toString(36).substr(2, 9);
              const reqHrs = Number(task.required_hours) > 0 ? Number(task.required_hours) : 8;
              const cycleMins = Number(task.cycle_time_minutes) > 0 ? Number(task.cycle_time_minutes) : reqHrs * 60;
              taskInsert.run(
                taskId,
                projectId,
                task.task_name,
                task.work_center_id,
                reqHrs,
                todayStr,
                nextWeekStr,
                "PENDING",
              );
              bopInsert.run(
                "BOP-" + taskId,
                projectId,
                seq++,
                task.task_name,
                task.work_center_id || null,
                reqHrs,
                cycleMins,
                todayStr,
                nextWeekStr,
                taskId
              );
            }
          }
        });

        transaction();

        try {
          const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
          if (projectRow) syncCollectionToFirestore("projects", projectId, projectRow);
          const spkRow = db.prepare("SELECT * FROM spks WHERE id = ?").get(spkId) as any;
          if (spkRow) syncCollectionToFirestore("spks", spkId, spkRow);
          const ntpRow = db.prepare("SELECT * FROM ntps WHERE project_id = ?").get(projectId) as any;
          if (ntpRow) syncCollectionToFirestore("ntps", ntpRow.id, ntpRow);
          syncCollectionToFirestore("quotations", quotation_id, { id: quotation_id, status: 'PROCESSED' });
        } catch (syncErr) {
          console.error("Firestore sync error for project creation:", syncErr);
        }

        const ntpDoc = db
          .prepare(`
            SELECT n.*, p.due_date, p.name as project_name, p.qty, p.uom, q.quotation_number, s.spk_number
            FROM ntps n
            LEFT JOIN projects p ON p.id = n.project_id
            LEFT JOIN quotations q ON q.id = n.quotation_id
            LEFT JOIN spks s ON s.project_id = n.project_id
            WHERE n.project_id = ?
          `)
          .get(projectId);
        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "CREATE_PROJECT",
          "PROJECT",
          projectId,
          `Created project ${name} referenced to quotation ${quotation.quotation_number}`,
        );
        res.json({ success: true, data: { id: projectId, ntp: ntpDoc } });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: "Failed to create project", details: err.message });
      }
    },
  );

  router.post(
    "/api/projects/:id/ntp",
    requireRole(["ENGINEERING", "FC", "SALES"]),
    (req, res) => {
      try {
        const { id } = req.params;
        const project = db
          .prepare("SELECT * FROM projects WHERE id = ?")
          .get(id) as any;
        if (!project)
          return res.status(404).json({ error: "Project not found" });

        const existingNtp = db
          .prepare("SELECT * FROM ntps WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
          .get(id) as any;
        if (existingNtp) {
          db.prepare(
            "UPDATE ntps SET ntp_number = ? WHERE id = ?",
          ).run(id, existingNtp.id);
          db.prepare(
            "UPDATE projects SET status = CASE WHEN status = 'PENDING_NTP' THEN 'ACTIVE' ELSE status END, ntp_id = COALESCE(ntp_id, ?), ntp_number = ? WHERE id = ?",
          ).run(existingNtp.id, id, id);
          return res.json({
            success: true,
            idempotent: true,
            data: { ntp_id: existingNtp.id, ntp_number: id },
          });
        }

        const ntpId =
          "NTP-" + Math.random().toString(36).substr(2, 6).toUpperCase();
        const ntpNumber = id;

        const transaction = db.transaction(() => {
          db.prepare(
            `
        INSERT INTO ntps (id, ntp_number, project_id, quotation_id, status)
        VALUES (?, ?, ?, ?, 'ISSUED')
      `,
          ).run(ntpId, ntpNumber, id, project.quotation_id);

          db.prepare(
            "UPDATE projects SET status = 'ACTIVE', ntp_id = ?, ntp_number = ? WHERE id = ?",
          ).run(ntpId, ntpNumber, id);

          const userEmail =
            (req.headers["x-user-email"] as string) || "system";
          const userObj = db
            .prepare(
              "SELECT username, name, role FROM users WHERE username = ? OR id = ?",
            )
            .get(userEmail, userEmail) as any;
          const author = userObj?.username || "system";
          const authorRole = userObj?.role || "FC";

          const forumId = "POST-" + Math.random().toString(36).substr(2, 9);
          db.prepare(
            `
        INSERT INTO forum_posts (id, title, content, author_username, author_role, category, shared_resource_type, shared_resource_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
          ).run(
            forumId,
            `Broadcast: Project Activation - ${project.name}`,
            `Notice to Proceed (NTP) has been officially issued for project **${project.name}** (NTP No: ${ntpNumber}). 
        
The project is now set to **ACTIVE** and manufacturing processes (PR, PO, Production) are cleared to proceed. 
Referenced Quotation ID: ${project.quotation_id || "N/A"}.`,
            author,
            authorRole,
            "ANNOUNCEMENT",
            "PROJECT",
            id,
          );

          const messageId = "MSG-" + Math.random().toString(36).substr(2, 9);
          const manualNtpMeta = {
            status: "ISSUED",
            amount: 0,
            partnerName: project.customer || "Corporate Client",
            urgency: project.urgency || "NORMAL",
            requiresAuth: false,
            url: `/quotations?tab=ntp&ntp_id=${encodeURIComponent(id)}`,
            sharedByRole: authorRole,
          };
          const manualNtpMarker = `🔗 *Shared Resource: ${project.name}* (NTP) #${id} |META:${JSON.stringify(manualNtpMeta)}`;
          const manualBroadcastContent = `📢 **NTP ISSUED**: Project [${project.name}] (${id}) is now ACTIVE and authorized for execution.\n\n${manualNtpMarker}`;

          db.prepare(
            `
        INSERT INTO chat_messages (id, thread_id, sender_username, content)
        VALUES (?, 'THREAD-GENERAL', ?, ?)
      `,
          ).run(
            messageId,
            author,
            manualBroadcastContent,
          );
        });

        transaction();

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "ISSUE_NTP",
          "PROJECT",
          id,
          `Issued NTP ${ntpNumber} for project ${project.name}`,
        );
        res.json({
          success: true,
          data: { ntp_id: ntpId, ntp_number: ntpNumber },
        });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: "Failed to issue NTP", details: err.message });
      }
    },
  );

  router.get("/api/ntps", (req, res) => {
    try {
      syncUnifiedNtpNumbers();
      const ntps = db
        .prepare(
          `
      SELECT n.*,
             COALESCE(n.project_id, n.ntp_number) as ntp_number,
             p.name as project_name,
             COALESCE(NULLIF(p.customer, ''), c.name, q.customer_name_manual, 'Corporate Client') as customer_name,
             p.due_date as due_date,
             COALESCE(p.qty, 1) as qty,
             COALESCE(p.uom, 'Unit') as uom,
             COALESCE(p.urgency, 'NORMAL') as urgency,
             COALESCE(p.status, 'ACTIVE') as project_status,
             COALESCE(p.lifecycle_stage, 'ENGINEERING_PREP') as lifecycle_stage,
             p.remarks as remarks,
             q.quotation_number as quotation_number,
             COALESCE(q.grand_total, q.amount, 0) as quotation_amount
      FROM ntps n
      LEFT JOIN projects p ON n.project_id = p.id
      LEFT JOIN quotations q ON COALESCE(n.quotation_id, p.quotation_id) = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE p.id IS NOT NULL
        AND p.id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
        AND p.archived_at IS NULL
      ORDER BY COALESCE(n.created_at, p.created_at) DESC
    `,
        )
        .all();
      res.json({ success: true, data: ntps });
    } catch (err: any) {
      console.error(err);
      res
        .status(500)
        .json({ error: "Failed to fetch NTPs", details: err.message });
    }
  });

  router.get("/api/ntps/:id", (req, res) => {
    try {
      syncUnifiedNtpNumbers();
      const { id } = req.params;
      const row = db
        .prepare(
          `
      SELECT n.*,
             COALESCE(n.project_id, n.ntp_number) as ntp_number,
             p.id as resolved_project_id,
             p.name as project_name,
             COALESCE(NULLIF(p.customer, ''), c.name, q.customer_name_manual, 'Corporate Client') as customer_name,
             p.due_date as due_date,
             COALESCE(p.qty, 1) as qty,
             COALESCE(p.uom, 'Unit') as uom,
             COALESCE(p.urgency, 'NORMAL') as urgency,
             COALESCE(p.status, 'ACTIVE') as project_status,
             COALESCE(p.lifecycle_stage, 'ENGINEERING_PREP') as lifecycle_stage,
             p.remarks as remarks,
             p.quotation_id as resolved_quotation_id,
             q.quotation_number as quotation_number,
             COALESCE(q.grand_total, q.amount, 0) as quotation_amount
      FROM ntps n
      LEFT JOIN projects p ON n.project_id = p.id
      LEFT JOIN quotations q ON COALESCE(n.quotation_id, p.quotation_id) = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE n.id = ? OR n.project_id = ? OR n.ntp_number = ? OR p.id = ?
      ORDER BY n.created_at DESC
      LIMIT 1
    `,
        )
        .get(id, id, id, id) as any;

      if (!row) {
        return res.status(404).json({ error: "NTP document not found" });
      }

      const projectPayload = {
        id: row.resolved_project_id || row.project_id,
        name: row.project_name,
        customer: row.customer_name,
        due_date: row.due_date,
        qty: row.qty,
        uom: row.uom,
        urgency: row.urgency,
        status: row.project_status,
        lifecycle_stage: row.lifecycle_stage,
        remarks: row.remarks,
        quotation_id: row.resolved_quotation_id || row.quotation_id,
        ntp_id: row.id,
        ntp_number: row.ntp_number,
      };

      res.json({
        success: true,
        data: {
          ntp: row,
          project: projectPayload,
        },
      });
    } catch (err: any) {
      console.error(err);
      res
        .status(500)
        .json({ error: "Failed to fetch NTP details", details: err.message });
    }
  });

  router.post(
    "/api/projects/bulk",
    requireRole(["SALES", "FC"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      if (userRole !== "FC" && userRole !== "SALES") {
        return res
          .status(403)
          .json({
            error:
              "Access denied. Only Sales or FC accounts can bulk create projects.",
          });
      }
      try {
        const { common, projects } = req.body;
        if (!Array.isArray(projects) || projects.length === 0) {
          return res.status(400).json({ error: "No projects provided" });
        }

        if (!common.quotation_id) {
          return res.status(400).json({
            error:
              "Common Quotation reference is required for bulk project creation",
          });
        }

        const transaction = db.transaction(() => {
          const quotation = db
            .prepare("SELECT * FROM quotations WHERE id = ?")
            .get(common.quotation_id) as any;
          if (!quotation) {
            throw new Error("Referenced Quotation not found");
          }

          if (quotation.status !== "APPROVED" && quotation.status !== "AUTHORIZED") {
            throw new Error("Referenced Quotation is not APPROVED or AUTHORIZED yet");
          }

          if (checkQuotationExpired(quotation)) {
            db.prepare(
              "UPDATE quotations SET status = 'EXPIRED' WHERE id = ?",
            ).run(common.quotation_id);
            throw new Error("Referenced Quotation has expired");
          }

          db.prepare(
            "UPDATE quotations SET status = 'PROCESSED' WHERE id = ?",
          ).run(common.quotation_id);

          const projectInsert = db.prepare(
            "INSERT INTO projects (id, name, due_date, customer, remarks, parent_project_id, urgency, quotation_id, spk_id, spk_number, ntp_id, ntp_number, status, lifecycle_stage, qty, uom, quotation_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          );
          const bomSelect = db.prepare(
            "SELECT item_id, dimension, spec, required_qty, unit_price, reference FROM boms WHERE project_id = ?",
          );
          const bomInsert = db.prepare(`
        INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, unit_price, reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
          const consumptionInsert = db.prepare(
            "INSERT INTO bom_item_consumption (id, bom_id, qty_consumed) VALUES (?, ?, ?)",
          );
          const existStmt = db.prepare(
            "SELECT id FROM projects WHERE id = ?",
          );

          const quotationItems = db
            .prepare("SELECT * FROM quotation_items WHERE quotation_id = ?")
            .all(common.quotation_id) as any[];
          const firstUom = quotationItems[0]?.uom || "Unit";

          const currentYear = new Date().getFullYear();
          const existingProjects = db
            .prepare("SELECT id, name, status, created_at, due_date FROM projects")
            .all() as any[];
          let nextSeq = getNextProjectSequence(existingProjects, currentYear);

          for (const p of projects) {
            let pId = generateSmartProjectId(nextSeq, currentYear);

            while (existStmt.get(pId)) {
              nextSeq++;
              pId = generateSmartProjectId(nextSeq, currentYear);
            }
            nextSeq++;

            const parentId = p.parent_project_id || common.parent_project_id;

            const spkId =
              "SPK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            const spkNumber = pId;

            const ntpId =
              "NTP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
            const ntpNumber = pId;

            const matchingQuoItem = quotationItems.find(
              (qi) =>
                qi.id === p.quotation_item_id ||
                (qi.title &&
                  p.name &&
                  qi.title.toLowerCase().trim() === p.name.toLowerCase().trim()),
            );

            const projectQty =
              p.qty !== undefined && p.qty !== null && Number(p.qty) > 0
                ? Number(p.qty)
                : matchingQuoItem
                  ? Number(matchingQuoItem.qty)
                  : 1;

            const projectUom = p.uom || matchingQuoItem?.uom || firstUom || "Unit";
            const quoItemId = p.quotation_item_id || matchingQuoItem?.id || null;

            projectInsert.run(
              pId,
              p.name,
              common.due_date,
              common.customer,
              p.remarks || common.remarks,
              parentId || null,
              common.urgency || "NORMAL",
              common.quotation_id,
              spkId,
              spkNumber,
              ntpId,
              ntpNumber,
              "ACTIVE",
              "ENGINEERING_PREP",
              projectQty,
              projectUom,
              quoItemId,
            );

            db.prepare(
              `INSERT INTO spks (id, spk_number, project_id, quotation_id, title) VALUES (?, ?, ?, ?, ?)`,
            ).run(
              spkId,
              spkNumber,
              pId,
              common.quotation_id,
              `SPK for Project - ${p.name}`,
            );

            db.prepare(
              "INSERT INTO ntps (id, ntp_number, project_id, quotation_id, created_at, status) VALUES (?, ?, ?, ?, ?, 'ISSUED')",
            ).run(
              ntpId,
              ntpNumber,
              pId,
              common.quotation_id,
              new Date().toISOString(),
            );

            if (parentId) {
              const parentBoms = bomSelect.all(parentId) as any[];
              for (const item of parentBoms) {
                const bomId =
                  "BOM-" + Math.random().toString(36).substr(2, 9);
                bomInsert.run(
                  bomId,
                  pId,
                  item.item_id,
                  item.dimension,
                  item.spec,
                  item.required_qty,
                  item.unit_price,
                  item.reference,
                );
                consumptionInsert.run(
                  "BIC-" + Math.random().toString(36).substr(2, 9),
                  bomId,
                  0,
                );
              }
            }

            logAudit(
              req.headers["x-user-email"] as string,
              "BULK_CREATE_PROJECT",
              "PROJECT",
              pId,
              `Project ${p.name} created via bulk.`,
            );

            const msgId = "MSG-" + Math.random().toString(36).substr(2, 9);
            const bulkNtpMeta = {
              status: "ISSUED",
              amount: 0,
              partnerName: common.customer || "Corporate Client",
              urgency: common.urgency || "NORMAL",
              requiresAuth: false,
              url: `/quotations?tab=ntp&ntp_id=${encodeURIComponent(pId)}`,
              sharedByRole: "SYSTEM",
            };
            const bulkNtpMarker = `🔗 *Shared Resource: ${p.name}* (NTP) #${pId} |META:${JSON.stringify(bulkNtpMeta)}`;
            const bulkBroadcastContent = `📦 **Project Execution Initiated!** 📦\n**NTP / Project:** ${p.name} (${pId})\n**Client:** 🏢 ${common.customer || "N/A"}\n**Target Date:** 📅 ${common.due_date || "Per Schedule"}\nOfficial Notice to Proceed (NTP) has been issued. Project is active and ready for execution.\n\n${bulkNtpMarker}`;

            db.prepare(
              `
          INSERT INTO chat_messages (id, thread_id, sender_username, content) 
          VALUES (?, ?, ?, ?)
        `,
            ).run(
              msgId,
              "THREAD-GENERAL",
              "SYSTEM",
              bulkBroadcastContent,
            );
          }
        });

        let firstProjectId = null;
        transaction();
        try {
          const firstProjName = projects[0]?.name;
          firstProjectId = db
            .prepare(
              "SELECT id FROM projects WHERE name = ? ORDER BY created_at DESC LIMIT 1",
            )
            .get(firstProjName) as any;
        } catch (e) {}

        const ntpDoc = firstProjectId
          ? db
              .prepare(`
                SELECT n.*, p.due_date, p.name as project_name, p.qty, p.uom, q.quotation_number, s.spk_number
                FROM ntps n
                LEFT JOIN projects p ON p.id = n.project_id
                LEFT JOIN quotations q ON q.id = n.quotation_id
                LEFT JOIN spks s ON s.project_id = n.project_id
                WHERE n.project_id = ?
              `)
              .get(firstProjectId.id)
          : null;
        res.json({
          success: true,
          count: projects.length,
          data: { ntp: ntpDoc },
        });
      } catch (error: any) {
        console.error(error);
        res.status(500).json({
          error: "Failed to create projects in bulk",
          details: error.message,
        });
      }
    },
  );

  router.delete(
    "/api/projects/:projectId/tasks/:taskId",
    requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC", "ADMIN"]),
    (req, res) => {
      try {
        const { projectId, taskId } = req.params;
        const project = db
          .prepare("SELECT status FROM projects WHERE id = ?")
          .get(projectId) as any;
        if (
          project &&
          (project.status === "FINISHED" || project.status === "CLOSED")
        ) {
          return res.status(400).json({
            error: "Cannot delete task from a finished or closed project.",
          });
        }
        db.prepare(
          "DELETE FROM project_tasks WHERE id = ? AND project_id = ?",
        ).run(taskId, projectId);
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete task" });
      }
    },
  );

  router.post(
    "/api/projects/:id/close",
    requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC", "ADMIN"]),
    (req, res) => {
      const { id } = req.params;
      try {
        db.transaction(() => {
          db.prepare(
            "UPDATE purchase_requests SET status = 'CANCELLED' WHERE project_id = ? AND status IN ('DRAFTED', 'AUTHORIZED')",
          ).run(id);

          db.prepare(
            "UPDATE projects SET status = 'CLOSED', archived_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(id);

          db.prepare(
            "UPDATE delivery_notes SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP WHERE project_id = ? AND status != 'DELIVERED'",
          ).run(id);

          logAudit(
            (req.headers["x-user-email"] as string) || "SYSTEM",
            "PROJECT_CLOSED",
            "PROJECT",
            id,
            `Project ${id} closed. Net allocations reclaimed, and related delivery notes updated to DELIVERED status.`,
          );
        })();

        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  router.post("/api/projects/:id/reserve-stock", (req, res) => {
    res.json({ success: true, message: "Reservation is disabled." });
  });

  router.post(
    "/api/projects/:id/repeat",
    requireRole(["ENGINEERING", "PPIC", "PRODUCTION", "FC", "ADMIN"]),
    (req, res) => {
      const { id } = req.params;
      const { new_name, new_due_date } = req.body;

      try {
        let newProjectId = "";
        db.transaction(() => {
          const parentProject = db
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(id) as any;
          if (!parentProject) throw new Error("Parent project not found");

          newProjectId = "PRJ-" + Math.random().toString(36).substr(2, 9);

          db.prepare(
            `
        INSERT INTO projects (id, name, due_date, customer, remarks, parent_project_id, status, quotation_id, qty, uom, urgency)
        VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)
      `,
          ).run(
            newProjectId,
            new_name || `Repeat of ${parentProject.name}`,
            new_due_date || parentProject.due_date,
            parentProject.customer,
            parentProject.remarks,
            id,
            parentProject.quotation_id || null,
            parentProject.qty || 1,
            parentProject.uom || "Unit",
            parentProject.urgency || "NORMAL",
          );

          const boms = db
            .prepare("SELECT * FROM boms WHERE project_id = ?")
            .all(id) as any[];
          const insertBom = db.prepare(`
        INSERT INTO boms (id, project_id, item_id, dimension, spec, required_qty, unit_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
          for (const bom of boms) {
            const newBomId = "BOM-" + Math.random().toString(36).substr(2, 9);
            insertBom.run(
              newBomId,
              newProjectId,
              bom.item_id,
              bom.dimension,
              bom.spec,
              bom.required_qty,
              bom.unit_price,
            );
          }

          const tasks = db
            .prepare("SELECT * FROM project_tasks WHERE project_id = ?")
            .all(id) as any[];
          const insertTask = db.prepare(`
        INSERT INTO project_tasks (id, project_id, task_name, work_center_id, required_hours, start_date, end_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `);

          const parentStart = new Date(
            parentProject.created_at || Date.now(),
          );
          const newStart = new Date();
          const shiftMs = newStart.getTime() - parentStart.getTime();

          for (const task of tasks) {
            const newTaskId =
              "TSK-" + Math.random().toString(36).substr(2, 9);

            let newStartDate = task.start_date;
            let newEndDate = task.end_date;

            if (task.start_date && task.end_date) {
              const sd = new Date(task.start_date);
              const ed = new Date(task.end_date);
              if (!isNaN(sd.getTime()) && !isNaN(ed.getTime())) {
                sd.setTime(sd.getTime() + shiftMs);
                ed.setTime(ed.getTime() + shiftMs);
                newStartDate = sd.toISOString().split("T")[0];
                newEndDate = ed.toISOString().split("T")[0];
              }
            }

            const finalStart = newStartDate || new Date().toISOString().split("T")[0];
            const finalEnd = newEndDate || finalStart;

            insertTask.run(
              newTaskId,
              newProjectId,
              task.task_name || "Task",
              task.work_center_id || null,
              task.required_hours || 0,
              finalStart,
              finalEnd,
            );
          }
        })();

        logAudit(
          req.headers["x-user-email"] as string,
          "REPEAT_PROJECT",
          "PROJECT",
          newProjectId,
          `Created repeat of project ${id}`,
        );
        res.json({ success: true, id: newProjectId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to repeat project" });
      }
    },
  );

  router.delete(
    "/api/projects/:id",
    requireRole(["FC", "ENGINEERING"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      if (
        userRole !== "FC" &&
        (userRole !== "ENGINEERING" || userLevel !== "MANAGER")
      ) {
        return res
          .status(403)
          .json({
            error:
              "Access denied. Only FC or Engineering Manager can delete projects.",
          });
      }
      try {
        const projectId = req.params.id;
        db.transaction(() => {
          db.prepare(
            "UPDATE projects SET status = 'CANCELLED', archived_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(projectId);

          db.prepare(
            "UPDATE purchase_requests SET status = 'CANCELLED' WHERE project_id = ? AND status IN ('DRAFTED', 'AUTHORIZED')",
          ).run(projectId);

          const uniqueItems = db
            .prepare("SELECT DISTINCT item_id FROM boms WHERE project_id = ?")
            .all(projectId) as { item_id: string }[];
          for (const { item_id } of uniqueItems) {
            const allocResult = db
              .prepare(
                `
          SELECT COALESCE(SUM(qty), 0) as total_alloc
          FROM stock_movements
          WHERE project_id = ? AND item_id = ? AND type IN ('ALLOCATION', 'GRN_ALLOCATION')
        `,
              )
              .get(projectId, item_id) as any;

            const consumeResult = db
              .prepare(
                `
          SELECT COALESCE(SUM(ABS(qty)), 0) as total_consumed
          FROM stock_movements
          WHERE project_id = ? AND item_id = ? AND type = 'CONSUMPTION'
        `,
              )
              .get(projectId, item_id) as any;

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
                projectId,
                projectAllocated,
                "Auto-release on cancel",
              );
            }
          }

          db.prepare(
            "UPDATE project_tasks SET status = 'COMPLETED' WHERE project_id = ? AND status != 'COMPLETED'",
          ).run(projectId);

          logAudit(
            req.headers["x-user-email"] as string,
            "CANCEL_PROJECT",
            "PROJECT",
            projectId,
            "Project cancelled and resources released.",
          );
        })();
        res.json({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to cancel project" });
      }
    },
  );

  router.post(
    "/api/projects/:id/create-fg-sku",
    requireRole(["FC", "QA_QC", "PRODUCTION", "ENGINEERING", "WAREHOUSE"]),
    (req, res) => {
      try {
        if (["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"].includes(req.params.id)) {
          return res.status(400).json({
            error: "Cannot create finished good for general procurement",
          });
        }
        const project = db
          .prepare("SELECT * FROM projects WHERE id = ?")
          .get(req.params.id) as any;
        if (!project)
          return res.status(404).json({ error: "Project not found" });

        const incompleteBoP = db.prepare(`SELECT COUNT(*) as count FROM bill_of_processes WHERE project_id = ? AND status != 'COMPLETED'`).get(project.id) as any;
        if (incompleteBoP && incompleteBoP.count > 0) {
           return res.status(400).json({ error: `Cannot generate FGR: There are ${incompleteBoP.count} incomplete production steps (BoP).` });
        }

        const activeNdp = db.prepare(`SELECT COUNT(*) as count FROM notice_to_down_processes WHERE project_id = ? AND status = 'ACTIVE'`).get(project.id) as any;
        if (activeNdp && activeNdp.count > 0) {
           return res.status(400).json({ error: `Cannot generate FGR: There are ${activeNdp.count} active downtime notices (NDP). Resolve them first.` });
        }

        const existingFg = db.prepare("SELECT * FROM items WHERE item_code = ?").get(`FG-${project.id}`);
        if (existingFg)
          return res.status(400).json({ error: "Finished goods have already been created for this project." });

        const itemId = "ITM-" + crypto.randomUUID();
        const fgCode = `FG-${project.id}`;
        const fgName = project.name;

        const totalQty = project.qty || 1;
        const firstUom = project.uom || "Unit";

        let hppSummary = null;
        try {
          hppSummary = recalculateProjectFinancialSummary(db, project.id);
        } catch (hppErr) {
          console.warn("Could not calculate project financial summary on FG creation:", hppErr);
        }

        const unitHpp = hppSummary?.fullCosting?.unitHpp || hppSummary?.unitHpp || 0;
        const userEmail = (req.headers["x-user-email"] as string) || "SYSTEM";

        db.transaction(() => {
          db.prepare(
            "INSERT INTO items (id, item_code, name, spec, uom, type, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ).run(
            itemId,
            fgCode,
            fgName,
            `Finished Good for Project ${project.name}`,
            firstUom,
            "FINISHED",
            unitHpp,
          );
          db.prepare(
            "INSERT INTO inventory (item_id, free_stock, allocated_stock, physical_qty, available_qty) VALUES (?, ?, 0, ?, ?)",
          ).run(itemId, totalQty, totalQty, totalQty);
          db.prepare(
            "INSERT INTO stock_movements (id, item_id, type, qty, reference_id, project_id, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ).run(
            "SMV-" + crypto.randomUUID(),
            itemId,
            "FINISHED_GOOD_INTAKE",
            totalQty,
            project.id,
            project.id,
            userEmail,
          );

          db.prepare(
            "UPDATE projects SET status = 'FINISHED', archived_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'FINISHED'",
          ).run(project.id);
        })();

        if (hppSummary) {
          try {
            postProductionFinishJournal(db, {
              project_id: project.id,
              spk_number: project.spk_number || project.id,
              total_material_cost: Number(hppSummary.totalBomCost || hppSummary.materialOnly?.totalHpp || 0),
              total_labor_cost: Number(hppSummary.totalLaborCost || 0),
              total_overhead_cost: Number(hppSummary.totalOverheadCost || 0),
              user: userEmail,
            });
          } catch (finishJournalErr) {
            console.error("Automated Accounting postProductionFinishJournal error:", finishJournalErr);
          }
        }

        logAudit(
          userEmail,
          "RECORD_FINISHED_GOOD",
          "PROJECT",
          project.id,
          `Recorded ${totalQty} ${firstUom} as Finished Good for project ${project.id}. Unit HPP: Rp ${unitHpp.toLocaleString("id-ID")}`,
        );
        res.json({ success: true, item_id: itemId, qty: totalQty, unit_hpp: unitHpp, hpp_breakdown: hppSummary });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to record finished goods" });
      }
    },
  );

  router.get("/api/projects/:id/end-to-end-pipeline", (req, res) => {
    try {
      const { id } = req.params;
      const project = db
        .prepare(
          `SELECT p.*,
                  COALESCE(p.spk_number, s.spk_number) as resolved_spk_number,
                  COALESCE(p.ntp_number, n.ntp_number) as resolved_ntp_number,
                  q.quotation_number, q.status as quotation_status, COALESCE(q.grand_total, q.amount, 0) as quotation_amount
           FROM projects p
           LEFT JOIN spks s ON s.project_id = p.id
           LEFT JOIN ntps n ON n.project_id = p.id
           LEFT JOIN quotations q ON q.id = p.quotation_id
           WHERE p.id = ?
           LIMIT 1`
        )
        .get(id) as any;

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const bomCount = (db.prepare("SELECT COUNT(*) as cnt FROM boms WHERE project_id = ?").get(id) as any)?.cnt || 0;
      const bopStats = db
        .prepare(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
                  SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress
           FROM bill_of_processes WHERE project_id = ?`
        )
        .get(id) as any;

      const wotStats = db
        .prepare(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
                  SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
                  COALESCE(SUM(completed_qty), 0) as completed_qty
           FROM work_order_tickets WHERE project_id = ?`
        )
        .get(id) as any;

      const dispatchCount = (db.prepare("SELECT COUNT(*) as cnt FROM material_dispatches WHERE project_id = ?").get(id) as any)?.cnt || 0;
      const prCount = (db.prepare("SELECT COUNT(*) as cnt FROM purchase_requests WHERE project_id = ?").get(id) as any)?.cnt || 0;

      const fgr = db
        .prepare("SELECT * FROM finish_good_records WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(id) as any;

      const deliveryNotes = db
        .prepare(
          `SELECT id, dn_number, status, delivery_type, fgr_number, fulfillment_mode, created_at
           FROM delivery_notes
           WHERE project_id = ? OR (quotation_id IS NOT NULL AND quotation_id = ?)
           ORDER BY created_at DESC`
        )
        .all(id, project.quotation_id || "") as any[];

      const latestDn = deliveryNotes[0] || null;

      const invoices = db
        .prepare(
          `SELECT id, ci_number as invoice_number, status, COALESCE(grand_total, total_amount, amount, 0) as total_amount, created_at
           FROM commercial_invoices
           WHERE project_id = ?
              OR (quotation_id IS NOT NULL AND quotation_id = ?)
              OR (dn_id IS NOT NULL AND dn_id IN (SELECT id FROM delivery_notes WHERE project_id = ?))
           ORDER BY created_at DESC`
        )
        .all(id, project.quotation_id || "", id) as any[];

      const latestInvoice = invoices[0] || null;

      const isProjectFinished =
        project.status === "FINISHED" ||
        project.status === "COMPLETED" ||
        project.status === "CLOSED" ||
        Boolean(fgr);

      const isMasterSet = Boolean(project.is_master_set) || (wotStats?.total || 0) > 0;
      const hasEngineeringPrep = bomCount > 0 || (bopStats?.total || 0) > 0;
      const hasShopFloorStarted =
        (wotStats?.in_progress || 0) > 0 ||
        (wotStats?.completed || 0) > 0 ||
        (bopStats?.in_progress || 0) > 0 ||
        (bopStats?.completed || 0) > 0 ||
        isProjectFinished;

      const fulfillmentMode = (bopStats?.total || 0) > 0 || bomCount > 0 ? "MTO" : (latestDn?.fulfillment_mode || "MTO");

      const stages = [
        {
          key: "QUOTATION",
          step: 1,
          isaLevel: "ISA-95 L4 (CRM/Sales)",
          label: "Commercial Quotation",
          docNumber: project.quotation_number || project.quotation_id || "Direct Order",
          status: "COMPLETED",
          summary: project.quotation_status || "PROCESSED",
        },
        {
          key: "SPK_PROJECT",
          step: 2,
          isaLevel: "ISA-95 L4➔L3 Handshake",
          label: "Unified SPK-Project & NTP",
          docNumber: project.resolved_spk_number || project.id,
          subDocNumber: project.resolved_ntp_number || null,
          status: project.status === "PENDING_NTP" ? "IN_PROGRESS" : "COMPLETED",
          summary: `${project.qty || 1} ${project.uom || "Unit"} • ${project.status}`,
        },
        {
          key: "ENGINEERING_SCM",
          step: 3,
          isaLevel: "APICS MPC / BOM & BOP",
          label: "Engineering & SCM Gate",
          docNumber: `${bomCount} BOM • ${bopStats?.total || 0} BOP`,
          subDocNumber: dispatchCount > 0 ? `${dispatchCount} Mat. Dispatched` : prCount > 0 ? `${prCount} PR Issued` : null,
          status: isMasterSet || isProjectFinished
            ? "COMPLETED"
            : hasEngineeringPrep
              ? "IN_PROGRESS"
              : "PENDING",
          summary: isMasterSet ? "Master Committed" : hasEngineeringPrep ? "Drafting BOM/BOP" : "Awaiting Setup",
        },
        {
          key: "SHOP_FLOOR_WOT",
          step: 4,
          isaLevel: "ISA-95 L3 MES / Traveler",
          label: "WOT Shop Floor & QC",
          docNumber: `${wotStats?.completed || 0}/${wotStats?.total || 0} WOT Lots`,
          subDocNumber: `${bopStats?.completed || 0}/${bopStats?.total || 0} BOP Steps`,
          status: isProjectFinished
            ? "COMPLETED"
            : hasShopFloorStarted || isMasterSet
              ? "IN_PROGRESS"
              : "PENDING",
          summary: isProjectFinished
            ? "100% Complete"
            : `${wotStats?.completed_qty || 0}/${project.qty || 1} ${project.uom || "Unit"} Verified`,
        },
        {
          key: "FGR_INBOUND",
          step: 5,
          isaLevel: "ISA-95 L3➔L4 Inbound FG",
          label: "Finished Goods (FGR)",
          docNumber: fgr?.fgr_number || (isProjectFinished ? `FGR-${project.id}` : "Pending FGR"),
          subDocNumber: fgr?.unit_hpp ? `HPP Rp ${Math.round(Number(fgr.unit_hpp)).toLocaleString("id-ID")}` : null,
          status: isProjectFinished ? "COMPLETED" : "PENDING",
          summary: isProjectFinished ? "Capitalized to FG" : "Awaiting Final QC",
        },
        {
          key: "DELIVERY_NOTE",
          step: 6,
          isaLevel: "APICS Outbound Logistics",
          label: "Delivery Note (Surat Jalan)",
          docNumber: latestDn?.dn_number || "Not Issued",
          subDocNumber: latestDn ? `${latestDn.status} (${latestDn.delivery_type || "FULL"})` : null,
          status: latestDn
            ? latestDn.status === "DELIVERED" || latestDn.status === "DISPATCHED" || latestDn.status === "APPROVED"
              ? "COMPLETED"
              : "IN_PROGRESS"
            : "PENDING",
          summary: latestDn ? `${deliveryNotes.length} DN Issued` : "Awaiting Dispatch",
        },
        {
          key: "COMMERCIAL_INVOICE",
          step: 7,
          isaLevel: "ISA-95 L4 AR Settlement",
          label: "Commercial Invoice",
          docNumber: latestInvoice?.invoice_number || "Not Invoiced",
          subDocNumber: latestInvoice?.status || null,
          status: latestInvoice
            ? latestInvoice.status === "PAID" || latestInvoice.status === "ISSUED" || latestInvoice.status === "SENT"
              ? "COMPLETED"
              : "IN_PROGRESS"
            : "PENDING",
          summary: latestInvoice ? `Status: ${latestInvoice.status}` : "Awaiting Billing",
        },
      ];

      let nextAction = {
        label: "View Commercial Invoice",
        path: "/invoices",
        stageKey: "COMMERCIAL_INVOICE",
      };

      if (!isMasterSet && !isProjectFinished) {
        nextAction = {
          label: "Setup BOM/BOP & Commit Master",
          path: `/ppic/projects/${id}`,
          stageKey: "ENGINEERING_SCM",
        };
      } else if (!isProjectFinished) {
        nextAction = {
          label: "Execute Shop Floor WOT & Finalize FGR",
          path: `/production/projects/${id}`,
          stageKey: "SHOP_FLOOR_WOT",
        };
      } else if (!latestDn) {
        nextAction = {
          label: "Issue Delivery Note (Surat Jalan)",
          path: `/deliveries?project_id=${id}`,
          stageKey: "DELIVERY_NOTE",
        };
      } else if (!latestInvoice) {
        nextAction = {
          label: "Generate Commercial Invoice",
          path: `/invoices?project_id=${id}`,
          stageKey: "COMMERCIAL_INVOICE",
        };
      }

      res.json({
        projectId: id,
        projectName: project.name,
        customer: project.customer,
        fulfillmentMode,
        spkNumber: project.resolved_spk_number || project.id,
        ntpNumber: project.resolved_ntp_number || null,
        fgrNumber: fgr?.fgr_number || null,
        stages,
        nextAction,
      });
    } catch (err: any) {
      console.error("Failed to compute end-to-end pipeline:", err);
      res.status(500).json({ error: "Failed to compute end-to-end pipeline", details: err.message });
    }
  });
}
