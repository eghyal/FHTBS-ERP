import { Router } from "express";
import db from "../../db/database.ts";
import { syncCollectionToFirestore, deleteDocFromFirestore } from "../../db/firebaseSync.ts";
import crypto from "crypto";
import QRCode from "qrcode";
import { requireRole } from "../../middleware/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { isValidDailyAuthKey } from "../../utils/auth.ts";
import { syncProjectGanttTasks } from "../../utils/ganttUtils.ts";
import { generateSignedWotQr, verifyAndParseWotQr, signWotPayload } from "../../utils/qrCrypto.ts";

export const manpowerRouter = Router();

manpowerRouter.get("/api/production/manpower", (req, res) => {
      try {
        const { shift, status, specialization, search } = req.query;
        let query = `
          SELECT mp.*, 
                 p.name as active_project_name, 
                 COALESCE(p.spk_number, s.spk_number, p.spk_id, p.id) as active_spk_number,
                 p.customer as active_customer,
                 u.role as hris_role,
                 u.level as hris_level,
                 u.status as hris_status
          FROM production_manpower mp
          LEFT JOIN projects p ON mp.active_project_id = p.id
          LEFT JOIN spks s ON (p.spk_id = s.id OR p.id = s.project_id)
          LEFT JOIN users u ON LOWER(TRIM(mp.user_username)) = LOWER(TRIM(u.username))
          WHERE mp.archived_at IS NULL
            AND (u.role IS NULL OR UPPER(TRIM(u.role)) = 'OPERATOR')
        `;
        const params: any[] = [];

        if (shift && shift !== "ALL") {
          query += ` AND mp.shift = ?`;
          params.push(shift);
        }
        if (status && status !== "ALL") {
          query += ` AND mp.status = ?`;
          params.push(status);
        }
        if (specialization && specialization !== "ALL") {
          query += ` AND mp.specialization = ?`;
          params.push(specialization);
        }
        if (search) {
          query += ` AND (mp.name LIKE ? OR mp.nik LIKE ? OR mp.role_title LIKE ? OR mp.specialization LIKE ?)`;
          const searchTerm = `%${search}%`;
          params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY 
          CASE mp.status 
            WHEN 'ON_DUTY' THEN 1 
            WHEN 'AVAILABLE' THEN 2 
            WHEN 'REST' THEN 3 
            WHEN 'ON_LEAVE' THEN 4 
            ELSE 5 
          END, mp.name ASC`;

        const rows = db.prepare(query).all(...params) as any[];

        const formatted = rows.map((r) => {
          let certs = [];
          try {
            certs = typeof r.certifications === "string" ? JSON.parse(r.certifications) : r.certifications || [];
          } catch (e) {
            certs = [];
          }
          return {
            ...r,
            certifications: certs,
          };
        });

        res.json(formatted);
      } catch (err: any) {
        console.error("Error fetching manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.post("/api/production/manpower/reset-defaults", async (req, res) => {
      try {
        const existingMp = db.prepare(`SELECT id FROM production_manpower`).all() as Array<{ id: string }>;
        const existingAssignments = db.prepare(`SELECT id FROM production_manpower_assignments`).all() as Array<{ id: string }>;

        const tx = db.transaction(() => {
          db.prepare(`DELETE FROM production_manpower_assignments`).run();
          db.prepare(`DELETE FROM production_manpower`).run();
        });

        tx();

        for (const a of existingAssignments) {
          deleteDocFromFirestore("production_manpower_assignments", a.id).catch(() => {});
        }
        for (const m of existingMp) {
          deleteDocFromFirestore("production_manpower", m.id).catch(() => {});
        }

        res.json({
          success: true,
          message: "Manpower roster cleared. Register approved operators via HRIS Directory to populate Shop Floor Manpower.",
        });
      } catch (err: any) {
        console.error("Error clearing manpower defaults:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.get("/api/production/manpower/hris-candidates", (req, res) => {
      try {
        // Strictly query only dedicated Shop Floor Operators (role = 'OPERATOR').
        // Back-office users (PRODUCTION, ENGINEERING, QA_QC, etc.) are excluded from shop-floor operator manpower.
        const candidates = db.prepare(`
          SELECT u.id, u.username, u.name, u.role, u.level, u.status, u.created_at,
                 mp.id as linked_manpower_id,
                 mp.nik as linked_nik,
                 mp.role_title as linked_role_title,
                 mp.shift as linked_shift,
                 mp.status as linked_status
          FROM users u
          LEFT JOIN production_manpower mp ON LOWER(TRIM(u.username)) = LOWER(TRIM(mp.user_username)) AND mp.archived_at IS NULL
          WHERE UPPER(TRIM(COALESCE(u.role, ''))) = 'OPERATOR'
          ORDER BY u.name ASC
        `).all() as any[];

        res.json(candidates);
      } catch (err: any) {
        console.error("Error fetching HRIS production candidates:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.post("/api/production/manpower/sync-hris", (req, res) => {
      try {
        // First purge any Back-Office user accidentally present in production_manpower
        db.prepare(`
          DELETE FROM production_manpower
          WHERE user_username IN (
            SELECT username FROM users WHERE UPPER(TRIM(COALESCE(role, ''))) != 'OPERATOR'
          )
        `).run();

        const prodUsers = db.prepare(`
          SELECT u.*, mp.id as mp_id
          FROM users u
          LEFT JOIN production_manpower mp ON LOWER(TRIM(u.username)) = LOWER(TRIM(mp.user_username)) AND mp.archived_at IS NULL
          WHERE UPPER(TRIM(COALESCE(u.role, ''))) = 'OPERATOR'
        `).all() as any[];

        let importedCount = 0;
        let updatedCount = 0;

        const syncTx = db.transaction(() => {
          const insertStmt = db.prepare(`
            INSERT INTO production_manpower (
              id, user_username, nik, name, role_title, skill_level, specialization, shift, status,
              phone, email, hourly_rate, certifications, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const user of prodUsers) {
            if (!user.mp_id) {
              const id = `mp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
              const generatedNik = user.employee_no || `MP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
              
              let spec = "Machining (CNC / Milling)";
              let title = "Production Operator / Technician";
              const uLower = (user.username + " " + user.name).toLowerCase();
              if (uLower.includes("weld")) { spec = "Welding & Fabrication"; title = "Welder / Fabricator"; }
              else if (uLower.includes("fitter") || uLower.includes("assembl")) { spec = "Assembly & Fitting"; title = "Assembly Technician"; }
              else if (uLower.includes("qc") || uLower.includes("inspect")) { spec = "Quality Control"; title = "QC Inspector"; }
              else if (uLower.includes("finish") || uLower.includes("paint") || uLower.includes("coat")) { spec = "Finishing & Coating"; title = "Finishing Specialist"; }
              else if (uLower.includes("electr") || uLower.includes("wire")) { spec = "Electrical & Wiring"; title = "Electrical Technician"; }
              else if (uLower.includes("tool") || uLower.includes("die")) { spec = "Machining (CNC / Milling)"; title = "Tool & Die Specialist"; }

              insertStmt.run(
                id,
                user.username,
                generatedNik,
                user.name,
                title,
                user.level === "MANAGER" ? "MASTER" : "SENIOR",
                spec,
                "SHIFT_1",
                "AVAILABLE",
                "+62 812-0000-0000",
                `${user.username}@factory.local`,
                48000,
                JSON.stringify(["HRIS Onboarded", "Safety Induction Certified"]),
                "Synchronized from HRIS Operator Roster."
              );
              importedCount++;
            } else {
              // Update user name / details if modified in users
              db.prepare(`
                UPDATE production_manpower
                SET name = COALESCE(?, name),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(user.name, user.mp_id);
              updatedCount++;
            }
          }
        });

        syncTx();

        res.json({
          success: true,
          importedCount,
          updatedCount,
          message: `HRIS Sync complete: ${importedCount} shop-floor operators imported, ${updatedCount} profiles refreshed.`
        });
      } catch (err: any) {
        console.error("Error syncing with HRIS:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.get("/api/production/manpower/stats", (req, res) => {
      try {
        const allMp = db.prepare(`
          SELECT mp.*
          FROM production_manpower mp
          LEFT JOIN users u ON LOWER(TRIM(mp.user_username)) = LOWER(TRIM(u.username))
          WHERE mp.archived_at IS NULL
            AND (u.role IS NULL OR UPPER(TRIM(u.role)) = 'OPERATOR')
        `).all() as any[];
        const totalCount = allMp.length;
        const onDutyCount = allMp.filter((m) => m.status === "ON_DUTY").length;
        const availableCount = allMp.filter((m) => m.status === "AVAILABLE").length;
        const onLeaveCount = allMp.filter((m) => m.status === "ON_LEAVE").length;
        const restCount = allMp.filter((m) => m.status === "REST").length;

        const totalHours = allMp.reduce((acc, m) => acc + (Number(m.total_hours_worked) || 0), 0);
        const avgEfficiency = totalCount > 0
          ? Math.round((allMp.reduce((acc, m) => acc + (Number(m.efficiency_rating) || 90), 0) / totalCount) * 10) / 10
          : 0;

        const shifts = {
          SHIFT_1: allMp.filter((m) => m.shift === "SHIFT_1").length,
          SHIFT_2: allMp.filter((m) => m.shift === "SHIFT_2").length,
          SHIFT_3: allMp.filter((m) => m.shift === "SHIFT_3").length,
          GENERAL: allMp.filter((m) => m.shift === "GENERAL").length,
        };

        const skillTiers = {
          MASTER: allMp.filter((m) => m.skill_level === "MASTER").length,
          SENIOR: allMp.filter((m) => m.skill_level === "SENIOR").length,
          JUNIOR: allMp.filter((m) => m.skill_level === "JUNIOR").length,
          APPRENTICE: allMp.filter((m) => m.skill_level === "APPRENTICE").length,
        };

        res.json({
          total: totalCount,
          onDuty: onDutyCount,
          available: availableCount,
          onLeave: onLeaveCount,
          rest: restCount,
          totalHours: Math.round(totalHours * 10) / 10,
          avgEfficiency,
          utilizationRate: totalCount > 0 ? Math.round((onDutyCount / totalCount) * 100) : 0,
          shifts,
          skillTiers
        });
      } catch (err: any) {
        console.error("Error fetching manpower stats:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.post("/api/production/manpower", (req, res) => {
      try {
        const {
          user_username,
          nik,
          name,
          role_title,
          skill_level,
          specialization,
          shift,
          status,
          phone,
          email,
          hourly_rate,
          certifications,
          notes,
        } = req.body;

        if (!name || !role_title || !specialization) {
          return res.status(400).json({ error: "Name, Role Title, and Specialization are required" });
        }

        const generatedNik = nik?.trim() || `MP-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
        const id = `mp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const certsStr = Array.isArray(certifications) ? JSON.stringify(certifications) : "[]";

        db.prepare(`
          INSERT INTO production_manpower (
            id, user_username, nik, name, role_title, skill_level, specialization, shift, status,
            phone, email, hourly_rate, certifications, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          user_username || null,
          generatedNik,
          name,
          role_title,
          skill_level || "SENIOR",
          specialization,
          shift || "SHIFT_1",
          status || "AVAILABLE",
          phone || null,
          email || null,
          Number(hourly_rate) || 45000,
          certsStr,
          notes || null
        );

        const created = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(id);
        res.json({ success: true, manpower: created, message: "New manpower registered successfully" });
      } catch (err: any) {
        console.error("Error adding manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.put("/api/production/manpower/:id", (req, res) => {
      try {
        const { id } = req.params;
        const {
          user_username,
          nik,
          name,
          role_title,
          skill_level,
          specialization,
          shift,
          status,
          phone,
          email,
          hourly_rate,
          certifications,
          notes,
          efficiency_rating,
          total_hours_worked,
        } = req.body;

        const existing = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(id);
        if (!existing) {
          return res.status(404).json({ error: "Manpower not found" });
        }

        const certsStr = Array.isArray(certifications) ? JSON.stringify(certifications) : (typeof certifications === "string" ? certifications : "[]");

        db.transaction(() => {
          db.prepare(`
            UPDATE production_manpower
            SET user_username = COALESCE(?, user_username),
                nik = COALESCE(?, nik),
                name = COALESCE(?, name),
                role_title = COALESCE(?, role_title),
                skill_level = COALESCE(?, skill_level),
                specialization = COALESCE(?, specialization),
                shift = COALESCE(?, shift),
                status = COALESCE(?, status),
                phone = ?,
                email = ?,
                hourly_rate = COALESCE(?, hourly_rate),
                certifications = ?,
                notes = ?,
                efficiency_rating = COALESCE(?, efficiency_rating),
                total_hours_worked = COALESCE(?, total_hours_worked),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            user_username,
            nik,
            name,
            role_title,
            skill_level,
            specialization,
            shift,
            status,
            phone || null,
            email || null,
            hourly_rate !== undefined ? Number(hourly_rate) : null,
            certsStr,
            notes || null,
            efficiency_rating !== undefined ? Number(efficiency_rating) : null,
            total_hours_worked !== undefined ? Number(total_hours_worked) : null,
            id
          );

          if (status === 'ON_LEAVE' || status === 'INACTIVE') {
            db.prepare(`
              UPDATE production_manpower_assignments
              SET status = 'CANCELLED'
              WHERE manpower_id = ? AND status IN ('ACTIVE', 'SCHEDULED')
            `).run(id);
          }
        })();

        const updated = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(id);
        res.json({ success: true, manpower: updated, message: "Manpower updated successfully" });
      } catch (err: any) {
        console.error("Error updating manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.delete("/api/production/manpower/:id", (req, res) => {
      try {
        const { id } = req.params;

        const activeAssgn = db.prepare(`SELECT COUNT(*) as count FROM production_manpower_assignments WHERE manpower_id = ? AND status = 'ACTIVE'`).get(id) as any;
        if (activeAssgn && activeAssgn.count > 0) {
          return res.status(400).json({ error: "Cannot delete operator while they have an ACTIVE assignment. Please release them first." });
        }

        db.prepare(`
          UPDATE production_manpower
          SET archived_at = CURRENT_TIMESTAMP, status = 'ON_LEAVE'
          WHERE id = ?
        `).run(id);

        res.json({ success: true, message: "Manpower record archived successfully" });
      } catch (err: any) {
        console.error("Error archiving manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.post("/api/production/manpower/:id/assign", (req, res) => {
      try {
        const { id } = req.params;
        const { project_id, task_name, bop_id, planned_hours, remarks, shift } = req.body;

        const mp = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(id) as any;
        if (!mp) {
          return res.status(404).json({ error: "Manpower not found" });
        }

        if (mp.status === 'ON_DUTY') {
          return res.status(400).json({ error: `Operator ${mp.name} is already assigned to a task. Release them first.` });
        }

        const assignId = `asgn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const assignDate = new Date().toISOString().slice(0, 10);

        const runTx = db.transaction(() => {
          // Record assignment
          db.prepare(`
            INSERT INTO production_manpower_assignments (
              id, manpower_id, project_id, task_name, bop_id, shift,
              assigned_date, planned_hours, status, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
          `).run(
            assignId,
            id,
            project_id || null,
            task_name || "Production Operation",
            bop_id || null,
            shift || mp.shift,
            assignDate,
            Number(planned_hours) || 8,
            remarks || null
          );

          // Update manpower state to ON_DUTY
          db.prepare(`
            UPDATE production_manpower
            SET status = 'ON_DUTY',
                active_project_id = ?,
                active_task_name = ?,
                shift = COALESCE(?, shift),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(project_id || null, task_name || "Active Operation", shift || null, id);
        });

        runTx();

        res.json({ success: true, message: `Assigned ${mp.name} to operation successfully.` });
      } catch (err: any) {
        console.error("Error assigning manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.post("/api/production/manpower/:id/release", (req, res) => {
      try {
        const { id } = req.params;
        const { actual_hours, notes } = req.body;

        const mp = db.prepare(`SELECT * FROM production_manpower WHERE id = ?`).get(id) as any;
        if (!mp) {
          return res.status(404).json({ error: "Manpower not found" });
        }

        const workedHours = Number(actual_hours) || 8;

        const runTx = db.transaction(() => {
          // Close active assignment if any
          db.prepare(`
            UPDATE production_manpower_assignments
            SET status = 'COMPLETED',
                actual_hours = ?,
                remarks = CASE WHEN remarks IS NOT NULL THEN remarks || ' | ' || ? ELSE ? END
            WHERE manpower_id = ? AND status = 'ACTIVE'
          `).run(workedHours, notes || "Released normally", notes || "Released normally", id);

          // Update manpower state to AVAILABLE and increment stats
          db.prepare(`
            UPDATE production_manpower
            SET status = 'AVAILABLE',
                active_project_id = NULL,
                active_task_name = NULL,
                total_hours_worked = total_hours_worked + ?,
                completed_tasks_count = completed_tasks_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(workedHours, id);
        });

        runTx();

        res.json({ success: true, message: `${mp.name} has been released and is now Available.` });
      } catch (err: any) {
        console.error("Error releasing manpower:", err);
        res.status(500).json({ error: err.message });
      }
    });

manpowerRouter.get("/api/production/manpower/:id/assignments", (req, res) => {
      try {
        const { id } = req.params;
        const rows = db.prepare(`
          SELECT a.*, p.name as project_name, COALESCE(p.spk_number, s.spk_number, p.spk_id, p.id) as spk_number
          FROM production_manpower_assignments a
          LEFT JOIN projects p ON a.project_id = p.id
          LEFT JOIN spks s ON (p.spk_id = s.id OR p.id = s.project_id)
          WHERE a.manpower_id = ?
          ORDER BY a.created_at DESC
          LIMIT 25
        `).all(id);
        res.json(rows);
      } catch (err: any) {
        console.error("Error fetching assignments:", err);
        res.status(500).json({ error: err.message });
      }
    });

