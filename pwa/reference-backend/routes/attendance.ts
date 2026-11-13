import { Router } from "express";
import db from "../db/database.ts";
import { requireRole } from "../middleware/auth.ts";
import { recalculateProjectFinancialSummary } from "../services/projectHppService.ts";
import { calculateTieredOvertimePay } from "../lib/hrisEngine.ts";

export const FACTORY_SHIFTS = [
  { id: "SHIFT_1", name: "Shift 1 - Pagi", start_time: "07:00", end_time: "15:00", standard_hours: 8, multiplier: 1.0, is_night: false },
  { id: "SHIFT_2", name: "Shift 2 - Siang/Sore", start_time: "15:00", end_time: "23:00", standard_hours: 8, multiplier: 1.0, is_night: false },
  { id: "SHIFT_3", name: "Shift 3 - Malam (Night Differential)", start_time: "23:00", end_time: "07:00", standard_hours: 8, multiplier: 1.1, is_night: true },
  { id: "GENERAL", name: "General Office / Normal", start_time: "08:00", end_time: "17:00", standard_hours: 8, multiplier: 1.0, is_night: false },
];

export const hrAttendanceRouter = Router();

// A simple write queue to serialize SQLite writes and prevent 'SQLITE_BUSY' concurrency lock errors
// when thousands of employees clock in at the exact same minute.
type Task<T> = () => T | Promise<T>;
class SQLiteWriteQueue {
  private queue: {
    task: Task<any>;
    resolve: (val: any) => void;
    reject: (err: any) => void;
  }[] = [];
  private isProcessing = false;

  public enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Yield to the event loop so this doesn't strictly block all other requests
    await new Promise((resolve) => setImmediate(resolve));

    while (this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift()!;
      try {
        const result = await task();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }

    this.isProcessing = false;
  }
}

const attendanceWriteQueue = new SQLiteWriteQueue();

const jakartaDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

let cachedTimeOffsetMs: number | null = null;
let lastTimeSyncAt = 0;
const TIME_SYNC_TTL_MS = 5 * 60 * 1000; // 5 minutes

const formatJakartaResult = (dt: Date) => {
  const parts = jakartaDateFormatter.formatToParts(dt);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return {
    dateStr: `${year}-${month}-${day}`,
    clockTime: dt.toISOString(),
  };
};

// Helper function to fetch tamper-proof global synchronized time for Jakarta GMT+7 area
const getSecureJakartaTime = async (): Promise<{
  dateStr: string;
  clockTime: string;
}> => {
  const nowMs = Date.now();
  if (cachedTimeOffsetMs !== null && nowMs - lastTimeSyncAt < TIME_SYNC_TTL_MS) {
    return formatJakartaResult(new Date(nowMs + cachedTimeOffsetMs));
  }

  const endpoints = [
    {
      url: "https://timeapi.io/api/Time/current/zone?timeZone=Asia/Jakarta",
      parser: (d: any) => d.dateTime,
    },
    {
      url: "https://worldtimeapi.org/api/timezone/Asia/Jakarta",
      parser: (d: any) => d.datetime,
    },
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const tId = setTimeout(() => controller.abort(), 1200);
      const response = await fetch(endpoint.url, { signal: controller.signal });
      clearTimeout(tId);

      if (response.ok) {
        const data = await response.json();
        const datetimeStr = endpoint.parser(data);
        if (datetimeStr) {
          let parsedStr = datetimeStr;
          if (
            !parsedStr.endsWith("Z") &&
            !/\+\d{2}:?\d{2}$/.test(parsedStr) &&
            !/-\d{2}:?\d{2}$/.test(parsedStr)
          ) {
            parsedStr = parsedStr + "+07:00";
          }

          const dt = new Date(parsedStr);
          if (!isNaN(dt.getTime())) {
            cachedTimeOffsetMs = dt.getTime() - Date.now();
            lastTimeSyncAt = Date.now();
            return formatJakartaResult(dt);
          }
        }
      }
    } catch {
      // Fallback to next source or server clock
    }
  }

  cachedTimeOffsetMs = 0;
  lastTimeSyncAt = Date.now();
  return formatJakartaResult(new Date());
};

// Factory Shifts Definition Endpoint
hrAttendanceRouter.get("/api/hr/shifts", (req, res) => {
  res.json({ ok: true, data: FACTORY_SHIFTS });
});

hrAttendanceRouter.get("/api/hr/attendances", (req, res) => {
  try {
    const { date, project_id, shift } = req.query;
    let query = `
      SELECT 
        a.*, 
        u.name as employee_name, 
        u.role as employee_role,
        p.name as project_name, 
        p.spk_number,
        pm.hourly_rate as pm_hourly_rate
      FROM attendance_db.hr_attendances a
      LEFT JOIN users u ON a.employee_username = u.username
      LEFT JOIN projects p ON a.project_id = p.id
      LEFT JOIN production_manpower pm ON pm.user_username = a.employee_username
      WHERE 1=1
    `;
    const params: any[] = [];

    if (date) {
      query += " AND a.date = ?";
      params.push(date);
    }
    if (project_id) {
      query += " AND a.project_id = ?";
      params.push(project_id);
    }
    if (shift) {
      query += " AND a.shift = ?";
      params.push(shift);
    }

    query += " ORDER BY a.date DESC, a.clock_in DESC";
    const attendances = db.prepare(query).all(...params);
    res.json(attendances);
  } catch (e: any) {
    console.error("Fetch attendances failed:", e);
    res.status(500).json({ error: "Failed to fetch attendances" });
  }
});

// Attendance & Labor Cost Analytics Summary
hrAttendanceRouter.get("/api/hr/attendances/summary", (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM
    const currentMonth = month ? String(month) : new Date().toISOString().substring(0, 7);

    const stats = db
      .prepare(
        `
      SELECT 
        COUNT(*) as total_records,
        SUM(COALESCE(work_hours, 0)) as total_work_hours,
        SUM(COALESCE(overtime_hours, 0)) as total_overtime_hours,
        SUM(COALESCE(labor_cost, 0)) as total_labor_cost,
        COUNT(DISTINCT employee_username) as active_employees
      FROM attendance_db.hr_attendances
      WHERE date LIKE ?
    `,
      )
      .get(`${currentMonth}%`) as any;

    const shiftBreakdown = db
      .prepare(
        `
      SELECT 
        COALESCE(shift, 'SHIFT_1') as shift,
        COUNT(*) as count,
        SUM(COALESCE(work_hours, 0)) as shift_hours,
        SUM(COALESCE(labor_cost, 0)) as shift_cost
      FROM attendance_db.hr_attendances
      WHERE date LIKE ?
      GROUP BY shift
    `,
      )
      .all(`${currentMonth}%`);

    const projectLabor = db
      .prepare(
        `
      SELECT 
        COALESCE(a.project_id, 'UNASSIGNED') as project_id,
        COALESCE(p.name, 'Umum / Non-Proyek') as project_name,
        p.spk_number,
        COUNT(*) as head_count,
        SUM(COALESCE(a.work_hours, 0)) as total_hours,
        SUM(COALESCE(a.overtime_hours, 0)) as total_ot_hours,
        SUM(COALESCE(a.labor_cost, 0)) as total_labor_cost
      FROM attendance_db.hr_attendances a
      LEFT JOIN projects p ON a.project_id = p.id
      WHERE a.date LIKE ?
      GROUP BY a.project_id
      ORDER BY total_labor_cost DESC
    `,
      )
      .all(`${currentMonth}%`);

    res.json({
      ok: true,
      month: currentMonth,
      summary: {
        total_records: stats?.total_records || 0,
        total_work_hours: Number((stats?.total_work_hours || 0).toFixed(1)),
        total_overtime_hours: Number((stats?.total_overtime_hours || 0).toFixed(1)),
        total_labor_cost: Number(stats?.total_labor_cost || 0),
        active_employees: stats?.active_employees || 0,
      },
      shiftBreakdown,
      projectLabor,
    });
  } catch (e: any) {
    console.error("Fetch attendance summary failed:", e);
    res.status(500).json({ error: "Failed to fetch attendance summary" });
  }
});

hrAttendanceRouter.post("/api/hr/attendances/clock-in", async (req, res) => {
  try {
    const authReq = req as any;
    const actorUsername = authReq.username || authReq.user?.username;
    const actorRole = (authReq.userRole || "").toUpperCase();
    const isHrOrSupervisor = ["FC", "HR", "ADMIN", "BOD", "DIRECTOR", "MANAGER", "PRODUCTION"].includes(actorRole);

    // Employees clock in for themselves; Supervisors/HR can clock in on behalf of floor labor
    const username = (isHrOrSupervisor && req.body.employee_username)
      ? String(req.body.employee_username).trim()
      : actorUsername;

    if (!username) return res.status(401).json({ error: "Unauthorized. Valid employee session required." });

    const secureTime = await getSecureJakartaTime();
    const dateStr = secureTime.dateStr;
    const clockTime = secureTime.clockTime;
    const location = req.body.location || null;
    const shift = req.body.shift || "SHIFT_1";
    const projectId = req.body.project_id || null;

    // Fetch employee rate from production_manpower or default
    const mp = db.prepare("SELECT hourly_rate FROM production_manpower WHERE user_username = ?").get(username) as any;
    const defaultRate = mp?.hourly_rate || 45000;

    // Phase 2: Serialized DB Write via WriteQueue
    await attendanceWriteQueue.enqueue(() => {
      const existing = db
        .prepare(
          "SELECT * FROM attendance_db.hr_attendances WHERE employee_username = ? AND date = ?",
        )
        .get(username, dateStr) as any;
      if (existing) {
        throw new Error("Already clocked in today");
      }

      const id = "ATT-" + Math.random().toString(36).substr(2, 9).toUpperCase();
      db.prepare(
        `
        INSERT INTO attendance_db.hr_attendances (
          id, employee_username, date, clock_in, clock_in_location, shift, project_id, hourly_rate, overtime_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NONE')
      `,
      ).run(id, username, dateStr, clockTime, location, shift, projectId, defaultRate);

      // Sync production manpower status to ON_DUTY if registered as shop floor manpower
      try {
        db.prepare(
          "UPDATE production_manpower SET status = 'ON_DUTY', updated_at = CURRENT_TIMESTAMP WHERE user_username = ?"
        ).run(username);
      } catch (mpErr) {
        // Ignore if user is not in production manpower
      }
    });

    res.json({ success: true, shift, project_id: projectId });
  } catch (e: any) {
    console.error("Clock In failed:", e);
    if (e.message === "Already clocked in today") {
      res.status(400).json({ error: e.message });
    } else {
      res.status(500).json({ error: "Failed to clock in securely" });
    }
  }
});

hrAttendanceRouter.put("/api/hr/attendances/clock-out", async (req, res) => {
  try {
    const authReq = req as any;
    const actorUsername = authReq.username || authReq.user?.username;
    const actorRole = (authReq.userRole || "").toUpperCase();
    const isHrOrSupervisor = ["FC", "HR", "ADMIN", "BOD", "DIRECTOR", "MANAGER", "PRODUCTION"].includes(actorRole);

    const username = (isHrOrSupervisor && req.body.employee_username)
      ? String(req.body.employee_username).trim()
      : actorUsername;

    if (!username) return res.status(401).json({ error: "Unauthorized. Valid employee session required." });

    const secureTime = await getSecureJakartaTime();
    const dateStr = secureTime.dateStr;
    const clockTime = secureTime.clockTime;
    const location = req.body.location || null;

    let updatedProjectId: string | null = null;

    // Phase 2: Serialized DB Write via WriteQueue
    await attendanceWriteQueue.enqueue(() => {
      const existing = db
        .prepare(
          "SELECT * FROM attendance_db.hr_attendances WHERE employee_username = ? AND date = ?",
        )
        .get(username, dateStr) as any;
      if (!existing) {
        throw new Error("Not clocked in today");
      }
      if (existing.clock_out) {
        throw new Error("Already clocked out today");
      }

      updatedProjectId = existing.project_id || null;

      // Calculate work hours
      const clockInTime = new Date(existing.clock_in).getTime();
      const clockOutTime = new Date(clockTime).getTime();
      let diffHours = Math.max(0, (clockOutTime - clockInTime) / (1000 * 60 * 60));
      if (isNaN(diffHours) || diffHours > 24) diffHours = 8; // fallback standard shift

      const standardHours = 8;
      const otHours = Math.max(0, Number((diffHours - standardHours).toFixed(1)));
      const regularHours = Math.min(diffHours, standardHours);

      const rate = Number(existing.hourly_rate) || 45000;
      const otCalc = calculateTieredOvertimePay(rate * 173, 0, otHours);
      const otCost = otCalc.totalPay > 0 ? otCalc.totalPay : Math.round(otHours * rate * 1.5);
      const regularCost = Math.round(regularHours * rate);
      const totalLaborCost = regularCost + otCost;

      const overtimeStatus = otHours > 0 ? (existing.overtime_status === 'APPROVED' ? 'APPROVED' : 'PENDING') : 'NONE';

      const upd = db.prepare(
        `
        UPDATE attendance_db.hr_attendances
        SET clock_out = ?, 
            clock_out_location = ?,
            work_hours = ?,
            overtime_hours = ?,
            overtime_status = ?,
            labor_cost = ?
        WHERE id = ? AND clock_out IS NULL
      `,
      ).run(
        clockTime,
        location,
        Number(diffHours.toFixed(1)),
        otHours,
        overtimeStatus,
        totalLaborCost,
        existing.id,
      );

      if (upd.changes === 0) {
        throw new Error("Already clocked out today");
      }

      // Sync production manpower status back to AVAILABLE if on shop floor
      try {
        db.prepare(
          "UPDATE production_manpower SET status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP WHERE user_username = ?"
        ).run(username);
      } catch (mpErr) {
        // Ignore if user is not in production manpower
      }
    });

    // If assigned to a project, immediately trigger HPP recalculation
    if (updatedProjectId) {
      try {
        recalculateProjectFinancialSummary(db, updatedProjectId);
      } catch (hppErr) {
        console.warn("Auto-recalculation of HPP on clock-out skipped:", hppErr);
      }
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("Clock Out failed:", e);
    if (e.message === "Not clocked in today" || e.message === "Already clocked out today") {
      res.status(400).json({ error: e.message });
    } else {
      res.status(500).json({ error: "Failed to clock out securely" });
    }
  }
});

// Record or request Overtime on an attendance record
hrAttendanceRouter.post("/api/hr/attendances/:id/overtime", async (req, res) => {
  try {
    const { id } = req.params;
    const { overtime_hours, overtime_reason, project_id } = req.body;
    const otHrs = Number(overtime_hours) || 0;

    const existing = db
      .prepare("SELECT * FROM attendance_db.hr_attendances WHERE id = ?")
      .get(id) as any;

    if (!existing) {
      return res.status(404).json({ error: "Attendance record not found" });
    }

    const targetProjectId = project_id || existing.project_id;
    const rate = Number(existing.hourly_rate) || 45000;
    const regHours = Math.max(0, (Number(existing.work_hours) || 8) - otHrs);
    const otCalc = calculateTieredOvertimePay(rate * 173, 0, otHrs);
    const otCost = otCalc.totalPay > 0 ? otCalc.totalPay : Math.round(otHrs * rate * 1.5);
    const regCost = Math.round(regHours * rate);
    const totalLaborCost = regCost + otCost;

    db.prepare(`
      UPDATE attendance_db.hr_attendances
      SET overtime_hours = ?,
          overtime_reason = ?,
          overtime_status = 'PENDING',
          project_id = ?,
          labor_cost = ?
      WHERE id = ?
    `).run(otHrs, overtime_reason || "Lembur Pabrik", targetProjectId, totalLaborCost, id);

    if (targetProjectId) {
      try {
        recalculateProjectFinancialSummary(db, targetProjectId);
      } catch (err) {
        console.warn("Project HPP recalculate skipped:", err);
      }
    }

    res.json({ ok: true, message: "Overtime recorded successfully" });
  } catch (e: any) {
    console.error("Record overtime failed:", e);
    res.status(500).json({ error: e.message || "Failed to record overtime" });
  }
});

// Approve or Reject Overtime on an Attendance Record
hrAttendanceRouter.put(
  "/api/hr/attendances/:id/overtime-status",
  requireRole(["FC", "HR", "ADMIN", "PRODUCTION", "BOD", "DIRECTOR", "MANAGER"]),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'APPROVED' | 'REJECTED'

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ error: "Status must be APPROVED or REJECTED" });
    }

    const existing = db
      .prepare("SELECT * FROM attendance_db.hr_attendances WHERE id = ?")
      .get(id) as any;

    if (!existing) {
      return res.status(404).json({ error: "Attendance record not found" });
    }

    const workHours = Number(existing.work_hours || 8);
    const regHours = Math.min(workHours > 0 ? workHours : 8, 8);
    const otHrs = Number(existing.overtime_hours || 0);
    const rate = Number(existing.hourly_rate || 45000);
    const regCost = Math.round(regHours * rate);
    let updatedLaborCost = regCost;

    if (status === "APPROVED" && otHrs > 0) {
      const otCalc = calculateTieredOvertimePay(rate * 173, 0, otHrs);
      const otCost = otCalc.totalPay > 0 ? otCalc.totalPay : Math.round(otHrs * rate * 1.5);
      updatedLaborCost = regCost + otCost;
    }

    db.prepare(`
      UPDATE attendance_db.hr_attendances
      SET overtime_status = ?,
          labor_cost = ?
      WHERE id = ?
    `).run(status, updatedLaborCost, id);

    // If linked to a project, recalculate project HPP
    if (existing.project_id) {
      try {
        recalculateProjectFinancialSummary(db, existing.project_id);
      } catch (hppErr) {
        console.warn("Recalculate HPP skipped:", hppErr);
      }
    }

    res.json({ ok: true, message: `Overtime status updated to ${status}`, labor_cost: updatedLaborCost });
  } catch (e: any) {
    console.error("Update overtime status failed:", e);
    res.status(500).json({ error: e.message || "Failed to update overtime status" });
  }
});

// Manual Attendance Entry / Correction by HR / Admin / Supervisor
hrAttendanceRouter.post(
  "/api/hr/attendances/manual",
  requireRole(["FC", "HR", "ADMIN", "BOD", "DIRECTOR", "MANAGER", "PRODUCTION"]),
  async (req, res) => {
    try {
      const {
        id,
        employee_username,
        date,
        clock_in_time, // HH:mm or ISO
        clock_out_time, // HH:mm or ISO
        shift,
        project_id,
        overtime_hours,
        overtime_status,
        overtime_reason,
        status,
      } = req.body;

      if (!employee_username || !date) {
        return res
          .status(400)
          .json({ error: "Employee username and date (YYYY-MM-DD) are required" });
      }

      const buildIso = (dateStr: string, timeVal?: string) => {
        if (!timeVal) return null;
        if (timeVal.includes("T")) return timeVal;
        return new Date(`${dateStr}T${timeVal}:00+07:00`).toISOString();
      };

      const clockInIso = buildIso(date, clock_in_time || "08:00")!;
      let clockOutIso = clock_out_time ? buildIso(date, clock_out_time) : null;

      // Handle overnight shift (e.g. SHIFT_3 23:00 -> 07:00 next day)
      if (clockInIso && clockOutIso) {
        const inMs = new Date(clockInIso).getTime();
        const outMs = new Date(clockOutIso).getTime();
        if (outMs <= inMs) {
          clockOutIso = new Date(outMs + 24 * 60 * 60 * 1000).toISOString();
        }
      }

      const mp = db
        .prepare("SELECT hourly_rate FROM production_manpower WHERE LOWER(user_username) = LOWER(?)")
        .get(employee_username) as any;
      const sal = db
        .prepare("SELECT basic_salary FROM hr_salaries WHERE LOWER(employee_username) = LOWER(?)")
        .get(employee_username) as any;
      const rate =
        Number(mp?.hourly_rate) ||
        (sal?.basic_salary ? Math.round(Number(sal.basic_salary) / 173) : 45000);

      let workHours = 0;
      if (clockInIso && clockOutIso) {
        const diff = (new Date(clockOutIso).getTime() - new Date(clockInIso).getTime()) / (1000 * 60 * 60);
        workHours = diff > 0 && diff <= 24 ? Number(diff.toFixed(1)) : 8;
      }

      const otHrs =
        overtime_hours !== undefined && overtime_hours !== ""
          ? Number(overtime_hours)
          : Math.max(0, Number((workHours - 8).toFixed(1)));

      const finalOtStatus =
        otHrs > 0 ? overtime_status || "APPROVED" : "NONE";

      const regHours = Math.min(workHours || 8, 8);
      const otCalc = calculateTieredOvertimePay(rate * 173, 0, otHrs);
      const otCost = otCalc.totalPay > 0 ? otCalc.totalPay : Math.round(otHrs * rate * 1.5);
      const totalLaborCost =
        Math.round(regHours * rate) +
        (otHrs > 0 && finalOtStatus !== "REJECTED" ? otCost : 0);

      let targetRecordId = id;
      let previousProjectId: string | null = null;

      await attendanceWriteQueue.enqueue(() => {
        const existing = id
          ? (db
              .prepare("SELECT * FROM attendance_db.hr_attendances WHERE id = ?")
              .get(id) as any)
          : (db
              .prepare(
                "SELECT * FROM attendance_db.hr_attendances WHERE LOWER(employee_username) = LOWER(?) AND date = ?",
              )
              .get(employee_username, date) as any);

        if (existing) {
          targetRecordId = existing.id;
          previousProjectId = existing.project_id || null;
          db.prepare(
            `UPDATE attendance_db.hr_attendances
             SET clock_in = ?,
                 clock_out = ?,
                 shift = ?,
                 project_id = ?,
                 work_hours = ?,
                 overtime_hours = ?,
                 overtime_status = ?,
                 overtime_reason = ?,
                 hourly_rate = ?,
                 labor_cost = ?,
                 status = ?
             WHERE id = ?`,
          ).run(
            clockInIso,
            clockOutIso,
            shift || existing.shift || "SHIFT_1",
            project_id !== undefined ? project_id || null : existing.project_id,
            workHours,
            otHrs,
            finalOtStatus,
            overtime_reason || existing.overtime_reason || "HR Manual Adjustment",
            rate,
            totalLaborCost,
            status || "PRESENT",
            existing.id,
          );
        } else {
          targetRecordId = "ATT-" + Math.random().toString(36).substr(2, 9).toUpperCase();
          db.prepare(
            `INSERT INTO attendance_db.hr_attendances (
               id, employee_username, date, clock_in, clock_out, clock_in_location,
               shift, project_id, work_hours, overtime_hours, overtime_status,
               overtime_reason, hourly_rate, labor_cost, status
             ) VALUES (?, ?, ?, ?, ?, 'HR Manual Entry', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            targetRecordId,
            employee_username,
            date,
            clockInIso,
            clockOutIso,
            shift || "SHIFT_1",
            project_id || null,
            workHours,
            otHrs,
            finalOtStatus,
            overtime_reason || "HR Manual Entry",
            rate,
            totalLaborCost,
            status || "PRESENT",
          );
        }
      });

      const projectsToRecalc = new Set<string>();
      if (previousProjectId) projectsToRecalc.add(previousProjectId);
      if (project_id) projectsToRecalc.add(project_id);
      for (const pid of projectsToRecalc) {
        try {
          recalculateProjectFinancialSummary(db, pid);
        } catch (_) {}
      }

      res.json({ ok: true, success: true, id: targetRecordId });
    } catch (e: any) {
      console.error("Manual attendance save failed:", e);
      res.status(500).json({ error: e.message || "Failed to save manual attendance" });
    }
  },
);
