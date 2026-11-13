import { isValidDailyAuthKey } from "../utils/auth.ts";
import { Router } from "express";
import db from "../db/database.ts";
import { requireRole, getActor } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { calculateEmployeePayroll } from "../lib/hrisEngine.ts";
import bcrypt from "bcrypt";
import crypto from "crypto";

export const router = Router();

    router.get(
      "/api/hr/payroll-requisitions",
      requireRole(["HR", "FINANCE", "FC", "BOD"]),
      (req, res) => {
        try {
          const reqs = db
            .prepare(
              "SELECT * FROM payroll_requisitions ORDER BY created_at DESC",
            )
            .all();
          res.json(reqs);
        } catch (e: any) {
          console.error("Fetch PRq failed:", e);
          res.status(500).json({ error: "Failed to fetch payroll requisitions" });
        }
      },
    );

    router.get(
      "/api/hr/payroll-requisitions/:id",
      requireRole(["HR", "FINANCE", "FC", "BOD"]),
      (req, res) => {
        try {
          const row = db
            .prepare("SELECT * FROM payroll_requisitions WHERE id = ?")
            .get(req.params.id) as any;
          if (!row) {
            return res.status(404).json({ error: "Payroll requisition not found" });
          }
          let details = [];
          try {
            details = JSON.parse(row.details_json || "[]");
          } catch (err) {
            details = [];
          }
          res.json({ ...row, details });
        } catch (e: any) {
          console.error("Fetch single PRq failed:", e);
          res.status(500).json({ error: "Failed to fetch payroll requisition" });
        }
      },
    );

    router.post(
      "/api/hr/payroll-requisitions/prepare",
      requireRole(["HR", "FINANCE", "FC"]),
      (req, res) => {
        try {
          const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ];
          const pMonth = Number(req.body.month) || (new Date().getMonth() + 1);
          const pYear = Number(req.body.year) || new Date().getFullYear();
          const periodName = `${monthNames[pMonth - 1] || pMonth} ${pYear}`;

          const monthPrefix = `${pYear}-${String(pMonth).padStart(2, "0")}`;

          const employees = db
            .prepare(
              "SELECT username, name, role, level FROM users WHERE status = 'APPROVED' OR status IS NULL OR status = '' OR status = 'ACTIVE'",
            )
            .all() as any[];

          const monthAttendances = db
            .prepare(
              `SELECT 
                employee_username, 
                COUNT(CASE WHEN status = 'PRESENT' OR status IS NULL THEN 1 END) as present_count,
                SUM(COALESCE(work_hours, 0)) as total_work_hours,
                SUM(CASE WHEN overtime_status != 'REJECTED' THEN COALESCE(overtime_hours, 0) ELSE 0 END) as total_ot_hours,
                SUM(COALESCE(labor_cost, 0)) as total_labor_cost
              FROM attendance_db.hr_attendances 
              WHERE date LIKE ? 
              GROUP BY LOWER(employee_username)`,
            )
            .all(`${monthPrefix}%`) as any[];
          const attendanceMap = new Map(
            monthAttendances.map((a) => [String(a.employee_username).toLowerCase(), a]),
          );

          // Pull approved factory project overtime schedules for this month
          const overtimeSchedules = db
            .prepare(
              `SELECT 
                pm.user_username,
                SUM(COALESCE(pos.overtime_hours, 0)) as total_sched_ot_hours
              FROM project_overtime_schedules pos
              JOIN production_manpower pm ON pos.manpower_id = pm.id
              WHERE pos.date LIKE ? AND pos.status = 'APPROVED'
              GROUP BY LOWER(pm.user_username)`,
            )
            .all(`${monthPrefix}%`) as any[];
          const otScheduleMap = new Map(
            overtimeSchedules.map((o) => [String(o.user_username).toLowerCase(), Number(o.total_sched_ot_hours) || 0]),
          );

          // Pull approved leaves in the target month and YTD annual leave usage
          const approvedLeaves = db
            .prepare(
              `SELECT employee_username, leave_type, start_date, end_date
               FROM hr_leaves
               WHERE status = 'APPROVED' AND start_date LIKE ?`,
            )
            .all(`${pYear}-%`) as any[];

          const leaveStatsMap = new Map<
            string,
            { unpaidDaysInMonth: number; paidLeaveDaysInMonth: number; annualPaidDaysYtd: number }
          >();

          approvedLeaves.forEach((lv) => {
            const uKey = String(lv.employee_username || "").toLowerCase();
            const cur = leaveStatsMap.get(uKey) || {
              unpaidDaysInMonth: 0,
              paidLeaveDaysInMonth: 0,
              annualPaidDaysYtd: 0,
            };
            const s = new Date(lv.start_date);
            const e = new Date(lv.end_date);
            const diffDays = Math.max(
              1,
              Math.ceil(Math.abs(e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1,
            );
            const isTargetMonth = String(lv.start_date || "").startsWith(monthPrefix);

            if (lv.leave_type === "Unpaid Leave") {
              if (isTargetMonth) cur.unpaidDaysInMonth += diffDays;
            } else {
              if (isTargetMonth) cur.paidLeaveDaysInMonth += diffDays;
              if (lv.leave_type === "Annual Paid Leave") {
                cur.annualPaidDaysYtd += diffDays;
              }
            }
            leaveStatsMap.set(uKey, cur);
          });

          // Identify factory direct labor workers
          const allProductionStaff = db.prepare("SELECT user_username FROM production_manpower").all() as any[];
          const productionStaffSet = new Set(allProductionStaff.map((p) => String(p.user_username).toLowerCase()));

          const allKpis = db
            .prepare(
              "SELECT employee_username, MAX(overall_score) as max_score FROM hr_kpis GROUP BY LOWER(employee_username)",
            )
            .all() as any[];
          const kpiMap = new Map(
            allKpis.map((k) => [String(k.employee_username).toLowerCase(), k.max_score]),
          );

          const allSalaries = db
            .prepare("SELECT * FROM hr_salaries")
            .all() as any[];
          const salaryMap = new Map(
            allSalaries.map((s) => [String(s.employee_username).toLowerCase(), s]),
          );

          const details = employees.map((emp) => {
            const empUsernameLower = String(emp.username || "").toLowerCase();
            const customSalary = salaryMap.get(empUsernameLower);

            const baseSalary = customSalary?.basic_salary !== undefined && customSalary?.basic_salary !== null
              ? Number(customSalary.basic_salary)
              : 0;

            const attData = attendanceMap.get(empUsernameLower);
            const lvStats = leaveStatsMap.get(empUsernameLower) || {
              unpaidDaysInMonth: 0,
              paidLeaveDaysInMonth: 0,
              annualPaidDaysYtd: 0,
            };

            const expectedDays = 22;
            const excessAnnualDays = Math.max(0, lvStats.annualPaidDaysYtd - 12);
            const deductibleLeaveDays = lvStats.unpaidDaysInMonth + excessAnnualDays;

            const rawPresent =
              attData?.present_count !== undefined && attData.present_count > 0
                ? Number(attData.present_count)
                : Math.max(0, expectedDays - deductibleLeaveDays);
            const presentDays = Math.max(0, Math.min(expectedDays, rawPresent));

            const schedOt = otScheduleMap.get(empUsernameLower) || 0;
            const attOt = Number(attData?.total_ot_hours) || 0;
            const totalOtHours = Number((attOt + schedOt).toFixed(1));

            const isProduction = emp.role === "PRODUCTION" || productionStaffSet.has(empUsernameLower);

            const positionAllowance = customSalary?.allowances !== undefined && customSalary?.allowances !== null
              ? Number(customSalary.allowances)
              : 0;
            const kpiScore = kpiMap.get(empUsernameLower) || 0;
            const otherDeductions = customSalary?.deductions || 0;

            const calc = calculateEmployeePayroll({
              username: emp.username,
              name: emp.name || emp.username,
              role: emp.role || "STAFF",
              level: emp.level || "STAFF",
              basicSalary: baseSalary,
              positionAllowance,
              kpiScore,
              presentDays,
              expectedDays,
              overtimeHours: totalOtHours,
              otherDeductions,
              costCategory: isProduction ? "DIRECT_LABOR" : undefined,
            });

            return {
              employee_username: emp.username,
              employee_name: emp.name || emp.username,
              department: emp.role || "Staff",
              position: emp.level || "Employee",
              username: emp.username,
              name: emp.name || emp.username,
              role: emp.role,
              level: emp.level,
              cost_category: isProduction ? "DIRECT_LABOR" : calc.costCategory,
              basic_salary: calc.basicSalary,
              present_days: presentDays,
              working_days: expectedDays,
              unpaid_leave_days: deductibleLeaveDays,
              paid_leave_days: lvStats.paidLeaveDaysInMonth,
              absent_days: Math.max(0, expectedDays - presentDays),
              absence_deduction: calc.absenceDeduction,
              overtime_hours: calc.overtimeHours,
              overtime_pay: calc.overtimePay,
              travel_days: 0,
              travel_allowance: calc.travelAllowance,
              reimbursement_amount: calc.reimbursementAmount,
              position_allowance: calc.positionAllowance,
              kpi_bonus: calc.kpiBonus,
              bpjs_deduction: calc.totalBPJSEmployeeDeduction,
              bpjs_kes_employee: calc.bpjsKesehatanEmployee,
              bpjs_kes_employer: calc.bpjsKesehatanEmployer,
              bpjs_tk_employee: calc.bpjsTKTotalEmployee,
              bpjs_tk_employer: calc.bpjsTKTotalEmployer,
              pph21_deduction: calc.pph21Deduction,
              other_deductions: calc.otherDeductions,
              gross_pay: calc.grossPay,
              total_deductions: calc.totalDeductions,
              net_pay: calc.netPay,
            };
          });

          res.json({
            period_month: pMonth,
            period_year: pYear,
            period_name: periodName,
            details,
          });
        } catch (e: any) {
          console.error("Prepare PRq failed:", e);
          res.status(500).json({ error: "Failed to prepare payroll requisition" });
        }
      },
    );

    router.post(
      "/api/hr/payroll-requisitions",
      requireRole(["HR", "FINANCE", "FC"]),
      (req, res) => {
        try {
          const { period_month, period_year, notes, details, submit } = req.body;
          const pMonth = Number(period_month) || new Date().getMonth() + 1;
          const pYear = Number(period_year) || new Date().getFullYear();

          const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ];
          const periodName = `${monthNames[pMonth - 1] || pMonth} ${pYear}`;

          const existing = db
            .prepare(
              "SELECT id, requisition_number, status FROM payroll_requisitions WHERE period_month = ? AND period_year = ? AND status NOT IN ('REJECTED', 'CANCELLED') LIMIT 1",
            )
            .get(pMonth, pYear) as any;

          if (existing) {
            return res.status(400).json({
              error: `Payroll Requisition untuk periode ${periodName} sudah terdaftar (${existing.requisition_number} - Status: ${existing.status}). Silakan edit dokumen tersebut.`,
            });
          }

          const userEmail = getActor(req);

          if (submit && req.body.pin) {
            if (!isValidDailyAuthKey(userEmail, req.body.pin)) {
              return res.status(400).json({
                error: "PIN Otorisasi / Auth Key Harian tidak valid. Silakan periksa PIN otorisasi Anda.",
              });
            }
          }

          const id = "PRQ-" + Date.now() + "-" + Math.floor(1000 + Math.random() * 9000);
          const reqNum = `PRQ/HR/${pYear}/${String(pMonth).padStart(2, "0")}/${Math.floor(100 + Math.random() * 900)}`;

          let totalGross = 0;
          let totalDeductions = 0;
          let totalNet = 0;
          let totalDirectLabor = 0;
          let totalOpex = 0;

          const sanitizedDetails = (details || []).map((d: any) => {
            const basic = Number(d.basic_salary || 0);
            const posAllow = Number(d.position_allowance || 0);
            const kpiBonus = Number(d.kpi_bonus || 0);
            const otPay = Number(d.overtime_pay || (Number(d.overtime_hours || 0) * 50000));
            const travelAllow = Number(d.travel_allowance || (Number(d.travel_days || 0) * 250000));
            const reimburse = Number(d.reimbursement_amount || 0);

            const gross = basic + posAllow + kpiBonus + otPay + travelAllow + reimburse;

            const absDed = Number(d.absence_deduction || 0);
            const bpjsDed = Number(d.bpjs_deduction || Math.round(basic * 0.03));
            const pph21Ded = Number(d.pph21_deduction || Math.round(basic * 0.02));
            const otherDed = Number(d.other_deductions || 0);

            const ded = absDed + bpjsDed + pph21Ded + otherDed;
            const net = Math.max(0, gross - ded);

            totalGross += gross;
            totalDeductions += ded;
            totalNet += net;

            const isDirectLabor = d.cost_category === "DIRECT_LABOR" || d.role === "PRODUCTION";
            if (isDirectLabor) {
              totalDirectLabor += gross;
            } else {
              totalOpex += gross;
            }

            return {
              ...d,
              cost_category: isDirectLabor ? "DIRECT_LABOR" : "OPERATIONAL_EXPENSE",
              gross_pay: gross,
              total_deductions: ded,
              net_pay: net,
            };
          });

          const status = submit ? "SUBMITTED" : "DRAFT";
          const submittedAt = submit ? new Date().toISOString() : null;

          db.prepare(
            `
            INSERT INTO payroll_requisitions (
              id, requisition_number, period_month, period_year, period_name,
              submitted_by, submitted_at, status, total_gross, total_deductions,
              total_net, notes, details_json, total_direct_labor, total_opex
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          ).run(
            id,
            reqNum,
            pMonth,
            pYear,
            periodName,
            userEmail,
            submittedAt,
            status,
            totalGross,
            totalDeductions,
            totalNet,
            notes || "",
            JSON.stringify(sanitizedDetails),
            totalDirectLabor,
            totalOpex,
          );

          logAudit(
            userEmail,
            submit ? "SUBMIT_PAYROLL_REQUISITION" : "CREATE_PAYROLL_REQUISITION",
            "HR",
            id,
            `Created Payroll Requisition ${reqNum} (${periodName}) - Total Net: ${totalNet}`,
          );

          res.json({
            success: true,
            id,
            requisition_number: reqNum,
            status,
            total_net: totalNet,
          });
        } catch (e: any) {
          console.error("Create PRq failed:", e);
          res.status(500).json({ error: "Failed to create payroll requisition" });
        }
      },
    );

    router.put(
      "/api/hr/payroll-requisitions/:id",
      requireRole(["HR", "FINANCE", "FC"]),
      (req, res) => {
        try {
          const { notes, details, submit } = req.body;
          const prq = db
            .prepare("SELECT * FROM payroll_requisitions WHERE id = ?")
            .get(req.params.id) as any;

          if (!prq) return res.status(404).json({ error: "PRq not found" });

          let totalGross = 0;
          let totalDeductions = 0;
          let totalNet = 0;
          let totalDirectLabor = 0;
          let totalOpex = 0;

          const sanitizedDetails = (details || []).map((d: any) => {
            const basic = Number(d.basic_salary || 0);
            const posAllow = Number(d.position_allowance || 0);
            const kpiBonus = Number(d.kpi_bonus || 0);
            const otPay = Number(d.overtime_pay || (Number(d.overtime_hours || 0) * 50000));
            const travelAllow = Number(d.travel_allowance || (Number(d.travel_days || 0) * 250000));
            const reimburse = Number(d.reimbursement_amount || 0);

            const gross = basic + posAllow + kpiBonus + otPay + travelAllow + reimburse;

            const absDed = Number(d.absence_deduction || 0);
            const bpjsDed = Number(d.bpjs_deduction || Math.round(basic * 0.03));
            const pph21Ded = Number(d.pph21_deduction || Math.round(basic * 0.02));
            const otherDed = Number(d.other_deductions || 0);

            const ded = absDed + bpjsDed + pph21Ded + otherDed;
            const net = Math.max(0, gross - ded);

            totalGross += gross;
            totalDeductions += ded;
            totalNet += net;

            const isDirectLabor = d.cost_category === "DIRECT_LABOR" || d.role === "PRODUCTION";
            if (isDirectLabor) {
              totalDirectLabor += gross;
            } else {
              totalOpex += gross;
            }

            return {
              ...d,
              cost_category: isDirectLabor ? "DIRECT_LABOR" : "OPERATIONAL_EXPENSE",
              gross_pay: gross,
              total_deductions: ded,
              net_pay: net,
            };
          });

          const status = submit ? "SUBMITTED" : "DRAFT";
          const userEmail = getActor(req);

          if (submit && req.body.pin) {
            if (!isValidDailyAuthKey(userEmail, req.body.pin)) {
              return res.status(400).json({
                error: "PIN Otorisasi / Auth Key Harian tidak valid. Silakan periksa PIN otorisasi Anda.",
              });
            }
          }

          db.prepare(
            `
            UPDATE payroll_requisitions
            SET notes = ?,
                details_json = ?,
                total_gross = ?,
                total_deductions = ?,
                total_net = ?,
                total_direct_labor = ?,
                total_opex = ?,
                status = ?,
                submitted_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE submitted_at END,
                rejection_reason = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          ).run(
            notes || "",
            JSON.stringify(sanitizedDetails),
            totalGross,
            totalDeductions,
            totalNet,
            totalDirectLabor,
            totalOpex,
            status,
            submit ? 1 : 0,
            req.params.id,
          );

          logAudit(
            userEmail,
            "UPDATE_PAYROLL_REQUISITION",
            "HR",
            req.params.id,
            `Updated PRq ${prq.requisition_number} to status ${status}`,
          );

          res.json({ success: true, status });
        } catch (e: any) {
          console.error("Update PRq failed:", e);
          res.status(500).json({ error: "Failed to update payroll requisition" });
        }
      },
    );

    router.post(
      "/api/hr/payroll-requisitions/:id/reject",
      requireRole(["FC", "FINANCE", "BOD", "HR", "ADMIN"]),
      (req, res) => {
        try {
          const reasonText = req.body.rejection_reason || req.body.reason;
          if (!reasonText) {
            return res.status(400).json({ error: "Alasan penolakan harus diisi." });
          }

          db.prepare(
            `
            UPDATE payroll_requisitions
            SET status = 'REJECTED',
                rejection_reason = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          ).run(reasonText, req.params.id);

          res.json({ success: true, message: "Pengajuan PRq berhasil ditolak." });
        } catch (e: any) {
          console.error("Reject PRq failed:", e);
          res.status(500).json({ error: "Failed to reject payroll requisition" });
        }
      },
    );

    router.post(
      "/api/hr/payroll-requisitions/:id/cancel",
      requireRole(["HR", "FINANCE", "FC", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          const userEmail = getActor(req);
          const { pin } = req.body;
          if (pin && !isValidDailyAuthKey(userEmail, pin)) {
            return res.status(400).json({
              error: "PIN Otorisasi / Auth Key Harian tidak valid.",
            });
          }

          const reasonText = req.body.cancel_reason || req.body.reason || "Dibatalkan oleh HR/Pemohon";
          const prq = db
            .prepare("SELECT * FROM payroll_requisitions WHERE id = ?")
            .get(req.params.id) as any;

          if (!prq) {
            return res.status(404).json({ error: "PRq tidak ditemukan." });
          }
          if (prq.status === "CONVERTED") {
            return res.status(400).json({
              error: "PRq yang sudah diterbitkan ke order pencairan Finance tidak dapat dibatalkan.",
            });
          }

          db.prepare(
            `
            UPDATE payroll_requisitions
            SET status = 'CANCELLED',
                rejection_reason = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
          ).run(`[CANCELED] ${reasonText}`, req.params.id);

          res.json({ success: true, message: "Pengajuan PRq berhasil dibatalkan." });
        } catch (e: any) {
          console.error("Cancel PRq failed:", e);
          res.status(500).json({ error: "Gagal membatalkan pengajuan PRq" });
        }
      },
    );

    router.delete(
      "/api/hr/payroll-requisitions/:id",
      requireRole(["HR", "FINANCE", "FC", "BOD", "ADMIN"]),
      (req, res) => {
        try {
          const prq = db
            .prepare("SELECT * FROM payroll_requisitions WHERE id = ?")
            .get(req.params.id) as any;

          if (!prq) {
            return res.status(404).json({ error: "PRq tidak ditemukan." });
          }

          if (prq.status !== "DRAFT" && prq.status !== "CANCELLED" && prq.status !== "REJECTED") {
            return res.status(400).json({
              error: "Hanya Draf atau PRq yang Dibatalkan/Ditolak yang dapat dihapus dari basis data.",
            });
          }

          db.prepare("DELETE FROM payroll_requisitions WHERE id = ?").run(req.params.id);
          res.json({ success: true, message: "Pengajuan PRq berhasil dihapus." });
        } catch (e: any) {
          console.error("Delete PRq failed:", e);
          res.status(500).json({ error: "Gagal menghapus pengajuan PRq" });
        }
      },
    );

    router.post(
      "/api/hr/payroll-requisitions/:id/convert",
      requireRole(["FC", "FINANCE", "BOD"]),
      (req, res) => {
        try {
          const { pin } = req.body;
          const userEmail = getActor(req);
          
          // Verify PIN if provided
          if (pin && !isValidDailyAuthKey(userEmail, pin)) {
            return res.status(400).json({ error: "Invalid authorization PIN" });
          }

          const prq = db
            .prepare("SELECT * FROM payroll_requisitions WHERE id = ?")
            .get(req.params.id) as any;

          if (!prq) {
            return res.status(404).json({ error: "Payroll requisition not found" });
          }
          if (prq.status !== "SUBMITTED" && prq.status !== "APPROVED") {
            return res.status(400).json({
              error: "Hanya pengajuan dengan status SUBMITTED yang dapat dikonversi ke Order Pencairan Finance.",
            });
          }

          const payrollId = "PAY-" + Date.now() + "-" + Math.floor(1000 + Math.random() * 9000);
          const voucherNumber = `PDV/FIN/${prq.period_year}/${String(prq.period_month).padStart(2, "0")}/${Math.floor(100 + Math.random() * 900)}`;

          let details = [];
          try {
            details = JSON.parse(prq.details_json || "[]");
          } catch (e) {
            details = [];
          }

          db.transaction(() => {
            // 1. Atomically mark PRq as CONVERTED first to guard against concurrent double-click conversion
            const updPrq = db
              .prepare(
                "UPDATE payroll_requisitions SET status = 'CONVERTED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('SUBMITTED', 'APPROVED')",
              )
              .run(prq.id);

            if (updPrq.changes === 0) {
              throw new Error(
                "Pengajuan PRq ini sudah dikonversi sebelumnya atau statusnya tidak valid.",
              );
            }

            // 2. Create Finance Payroll Disbursement Order (PDV)
            db.prepare(
              `
              INSERT INTO finance_payroll (
                id, prq_id, voucher_number, period_name, period_month, period_year,
                total_amount, details_json, status, total_direct_labor, total_opex
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFTED', ?, ?)
            `,
            ).run(
              payrollId,
              prq.id,
              voucherNumber,
              prq.period_name,
              prq.period_month,
              prq.period_year,
              prq.total_net,
              prq.details_json,
              prq.total_direct_labor || 0,
              prq.total_opex || 0,
            );

            // 3. Generate or update individual employee payslips without duplicating (employee_username, period_month)
            const findExistingSlip = db.prepare(`
              SELECT id FROM hr_payslips
              WHERE LOWER(employee_username) = LOWER(?) AND LOWER(TRIM(period_month)) = LOWER(TRIM(?))
              LIMIT 1
            `);
            const updatePayslip = db.prepare(`
              UPDATE hr_payslips
              SET basic_salary = ?, allowances = ?, deductions = ?, net_salary = ?, status = 'PUBLISHED'
              WHERE id = ?
            `);
            const insertPayslip = db.prepare(`
              INSERT INTO hr_payslips (id, employee_username, period_month, basic_salary, allowances, deductions, net_salary, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')
            `);

            details.forEach((d: any) => {
              const basicVal = d.basic_salary || 0;
              const allowVal = d.gross_pay ? d.gross_pay - basicVal : 0;
              const dedVal = d.total_deductions || 0;
              const netVal = d.net_pay || 0;

              const existingSlip = findExistingSlip.get(
                d.username,
                prq.period_name,
              ) as any;
              if (existingSlip) {
                updatePayslip.run(
                  basicVal,
                  allowVal,
                  dedVal,
                  netVal,
                  existingSlip.id,
                );
              } else {
                const slipId =
                  "SLIP-" +
                  Math.random().toString(36).substr(2, 9).toUpperCase();
                insertPayslip.run(
                  slipId,
                  d.username,
                  prq.period_name,
                  basicVal,
                  allowVal,
                  dedVal,
                  netVal,
                );
              }
            });

            logAudit(
              userEmail,
              "CONVERT_PRQ_TO_PAYROLL_ORDER",
              "FINANCE",
              payrollId,
              `Converted PRq ${prq.requisition_number} to Finance Order ${voucherNumber}`,
            );
          })();

          res.json({
            success: true,
            id: payrollId,
            voucher_number: voucherNumber,
            total_amount: prq.total_net,
          });
        } catch (e: any) {
          console.error("Convert PRq failed:", e);
          if (e.message?.includes("sudah dikonversi")) {
            return res.status(400).json({ error: e.message });
          }
          res.status(500).json({ error: "Failed to convert PRq to payroll order" });
        }
      },
    );

    // Cross-Module HRIS <-> ERP Production ManPower & Payroll Integrity Audit
    router.post(
      "/api/hr/sync-integrity",
      requireRole(["HR", "FINANCE", "FC", "BOD", "ADMIN", "DIRECTOR", "SUPERADMIN"]),
      (req, res) => {
        try {
          const actor = getActor(req);
          const todayStr = new Date().toISOString().slice(0, 10);

          let syncedSalaries = 0;
          let syncedManpower = 0;
          let activeLeaveSyncs = 0;

          const activeUsers = db
            .prepare(
              `SELECT id, username, name, role, level, status
               FROM users
               WHERE status = 'APPROVED' OR status = 'ACTIVE' OR status IS NULL`,
            )
            .all() as any[];

          const inactiveUsers = db
            .prepare(
              `SELECT username FROM users WHERE status IN ('INACTIVE', 'REJECTED', 'SUSPENDED')`,
            )
            .all() as any[];

          const activeLeavesToday = db
            .prepare(
              `SELECT employee_username FROM hr_leaves
               WHERE status = 'APPROVED' AND start_date <= ? AND end_date >= ?`,
            )
            .all(todayStr, todayStr) as any[];
          const onLeaveSet = new Set(
            activeLeavesToday.map((l) => String(l.employee_username || "").toLowerCase()),
          );

          // Pre-fetch salaries and manpower in bulk to avoid N+1 queries inside transaction loop
          const allSalaries = db
            .prepare("SELECT employee_username, basic_salary FROM hr_salaries")
            .all() as any[];
          const salaryByUsername = new Map(
            allSalaries.map((s) => [String(s.employee_username || "").toLowerCase(), s]),
          );

          const allManpower = db
            .prepare("SELECT id, user_username, status FROM production_manpower")
            .all() as any[];
          const manpowerByUsername = new Map(
            allManpower.map((m) => [String(m.user_username || "").toLowerCase(), m]),
          );

          db.transaction(() => {
            const insertSalaryStmt = db.prepare(
              `INSERT INTO hr_salaries (employee_username, basic_salary, allowances, deductions, updated_at)
               VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`,
            );
            const insertMpStmt = db.prepare(
              `INSERT INTO production_manpower (id, user_username, name, role, skill_level, status, hourly_rate)
               VALUES (?, ?, ?, 'Operator Produksi', ?, ?, ?)`,
            );
            const updateMpStmt = db.prepare(
              `UPDATE production_manpower SET status = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            );
            const deactivateMpStmt = db.prepare(
              `UPDATE production_manpower SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP
               WHERE LOWER(user_username) = LOWER(?) AND status != 'INACTIVE'`,
            );

            for (const u of activeUsers) {
              const uLower = String(u.username || "").toLowerCase();
              const sal = salaryByUsername.get(uLower);

              const defaultSalary =
                u.level === "MANAGER" ? 8500000 : u.role === "OPERATOR" ? 4800000 : 5500000;
              const defaultAllowance = u.level === "MANAGER" ? 1500000 : 500000;

              if (!sal) {
                insertSalaryStmt.run(u.username, defaultSalary, defaultAllowance);
                syncedSalaries++;
              }

              if (u.role === "OPERATOR") {
                const mp = manpowerByUsername.get(uLower);
                const isOnLeave = onLeaveSet.has(uLower);
                const targetMpStatus = isOnLeave ? "ON_LEAVE" : "AVAILABLE";
                const baseSal = Number(sal?.basic_salary || defaultSalary);
                const hrRate = Math.max(25000, Math.round(baseSal / 173));

                if (!mp) {
                  const mpId = "MP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
                  insertMpStmt.run(
                    mpId,
                    u.username,
                    u.name || u.username,
                    u.level === "MANAGER" ? "Supervisor" : "Senior",
                    targetMpStatus,
                    hrRate,
                  );
                  syncedManpower++;
                } else if (mp.status !== "BUSY" && mp.status !== "ON_DUTY" && mp.status !== targetMpStatus) {
                  updateMpStmt.run(targetMpStatus, u.name || u.username, mp.id);
                  if (isOnLeave) activeLeaveSyncs++;
                  else syncedManpower++;
                }
              } else {
                const staleMp = manpowerByUsername.get(uLower);
                if (staleMp) {
                  db.prepare(`DELETE FROM production_manpower_assignments WHERE manpower_id = ?`).run(staleMp.id);
                  db.prepare(`DELETE FROM production_manpower WHERE id = ?`).run(staleMp.id);
                }
              }
            }

            for (const iu of inactiveUsers) {
              const resMp = deactivateMpStmt.run(iu.username);
              if (resMp.changes > 0) syncedManpower += resMp.changes;
            }
          })();

          logAudit(
            actor,
            "HR_ERP_SYNC_INTEGRITY",
            "HR",
            "ALL",
            `HR-ERP Integrity Audit: ${activeUsers.length} active staff, ${syncedSalaries} salaries initialized, ${syncedManpower} ManPower synced, ${activeLeaveSyncs} leave statuses updated.`,
          );

          res.json({
            success: true,
            active_workforce: activeUsers.length,
            synced_salaries: syncedSalaries,
            synced_manpower: syncedManpower,
            active_leave_syncs: activeLeaveSyncs,
            message: `Audit & Sinkronisasi HR-ERP selesai: ${activeUsers.length} karyawan aktif diverifikasi (${syncedSalaries} master gaji dilengkapi, ${syncedManpower} ManPower Produksi disinkronkan).`,
          });
        } catch (e: any) {
          console.error("HR Sync Integrity failed:", e);
          res.status(500).json({ error: e.message || "Gagal menjalankan audit integritas HR-ERP" });
        }
      },
    );


