import { formatRupiah } from "@/utils/format";

const printHtmlViaIframe = (htmlContent: string) => {
  const existingFrame = document.getElementById("hr-print-iframe");
  if (existingFrame) {
    existingFrame.remove();
  }

  const iframe = document.createElement("iframe");
  iframe.id = "hr-print-iframe";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(htmlContent);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      window.print();
    }
  }, 350);
};

export const printOfficialPayslip = (payslip: any, user?: any) => {
  if (!payslip) return;
  const empName =
    payslip.employee_name ||
    user?.name ||
    payslip.employee_username ||
    user?.username ||
    "Employee";
  const empUsername = payslip.employee_username || user?.username || "-";
  const empRole = payslip.department || user?.role || "STAFF";
  const period = payslip.period_month || "-";
  const basic = Number(payslip.basic_salary || 0);
  const allowances = Number(payslip.allowances || 0);
  const deductions = Number(payslip.deductions || 0);
  const net = Number(payslip.net_salary || basic + allowances - deductions);
  const status = payslip.status === "PAID" ? "PAID (DISBURSED)" : "PUBLISHED / VERIFIED";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payslip - ${empName} (${period})</title>
  <style>
    * { box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    body { margin: 0; padding: 32px; color: #1c1917; background: #fff; }
    .sheet { max-width: 760px; margin: 0 auto; border: 1.5px solid #d6d3d1; border-radius: 16px; padding: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #b02524; padding-bottom: 18px; margin-bottom: 24px; }
    .brand { font-size: 20px; font-weight: 900; color: #b02524; letter-spacing: -0.02em; text-transform: uppercase; }
    .sub { font-size: 11px; color: #57534e; font-weight: 600; margin-top: 4px; }
    .badge { display: inline-block; padding: 4px 10px; background: #fef2f2; color: #b02524; border: 1px solid #fecaca; border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 16px; margin-bottom: 24px; font-size: 12px; }
    .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #78716c; font-weight: 700; }
    .meta-val { font-size: 13px; font-weight: 800; color: #1c1917; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
    th { background: #f5f5f4; color: #57534e; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; padding: 10px 14px; text-align: left; border-bottom: 1px solid #d6d3d1; }
    td { padding: 12px 14px; border-bottom: 1px solid #e7e5e4; font-weight: 600; }
    .num { font-family: 'JetBrains Mono', monospace; text-align: right; font-variant-numeric: tabular-nums; }
    .thp-box { background: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 12px; padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
    .thp-label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #065f46; letter-spacing: 0.06em; }
    .thp-val { font-size: 22px; font-weight: 900; color: #047857; font-family: monospace; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 20px; border-top: 1px dashed #d6d3d1; font-size: 11px; color: #57534e; }
    .sig-box { text-align: right; }
    .sig-line { margin-top: 44px; font-weight: 800; color: #1c1917; border-top: 1px solid #78716c; padding-top: 6px; display: inline-block; min-width: 180px; text-align: center; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">CV BATU EMAS GROUP • PAVING JOSS</div>
        <div class="sub">Human Capital Management & Corporate Payroll Division</div>
      </div>
      <div style="text-align:right">
        <span class="badge">OFFICIAL PAYSLIP</span>
        <div class="sub" style="margin-top:6px;font-family:monospace;">REF: ${payslip.id || "SLIP-VERIFIED"}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <div class="meta-label">Employee Name & ID</div>
        <div class="meta-val">${empName} (@${empUsername})</div>
      </div>
      <div>
        <div class="meta-label">Payroll Period</div>
        <div class="meta-val">${period}</div>
      </div>
      <div>
        <div class="meta-label">Department / Role</div>
        <div class="meta-val">${empRole}</div>
      </div>
      <div>
        <div class="meta-label">Disbursement Status</div>
        <div class="meta-val">${status}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Remuneration Component</th>
          <th>Category</th>
          <th class="num">Amount (IDR)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Basic Monthly Salary</td>
          <td>Fixed Earnings</td>
          <td class="num">${formatRupiah(basic)}</td>
        </tr>
        <tr>
          <td>Allowances, Overtime & KPI Incentives</td>
          <td style="color:#047857;">Additions (+)</td>
          <td class="num" style="color:#047857;">+${formatRupiah(allowances)}</td>
        </tr>
        <tr>
          <td>Statutory & Absence Deductions (Social Security, Income Tax & Unpaid Leave)</td>
          <td style="color:#be123c;">Deductions (-)</td>
          <td class="num" style="color:#be123c;">-${formatRupiah(deductions)}</td>
        </tr>
      </tbody>
    </table>

    <div class="thp-box">
      <div>
        <div class="thp-label">Net Take-Home Pay (THP)</div>
        <div style="font-size:11px;color:#047857;margin-top:2px;">Transferred to employee registered bank account</div>
      </div>
      <div class="thp-val">${formatRupiah(net)}</div>
    </div>

    <div class="footer">
      <div>
        <div>Printed Timestamp: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Jakarta" })} WIB</div>
        <div style="margin-top:4px;font-weight:700;color:#1c1917;">System Verification Seal: PAVINGJOSS-HRIS-VERIFIED✓</div>
      </div>
      <div class="sig-box">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#78716c;font-weight:800;">Authorized By</div>
        <div class="sig-line">HR & Finance Controller</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  printHtmlViaIframe(html);
};

export const printOfferingLetter = (candidate: any, customSalary?: number) => {
  if (!candidate) return;
  const candidateName = candidate.name || "Candidate";
  const jobTitle = candidate.job_title || "Staff";
  const department = candidate.job_department || candidate.department || "Operations";
  const offeredSalary =
    customSalary ||
    Number(candidate.offered_basic_salary) ||
    Number(candidate.job_salary_min) ||
    5500000;
  const offeredAllowances = Number(candidate.offered_allowances || 500000);
  const totalPackage = offeredSalary + offeredAllowances;
  const contractType =
    candidate.contract_type || candidate.job_contract_type || "FIXED_TERM";
  const contractDuration = Number(candidate.contract_duration_months || 12);
  const contractLabel =
    contractType === "PKWTT" || contractType === "PERMANENT"
      ? "Permanent Employment"
      : contractType === "PROBATION"
      ? `Probation Period (${contractDuration} Months)`
      : `Fixed-Term Employment Contract (${contractDuration} Months)`;
  const plannedJoinDate = candidate.planned_join_date
    ? new Date(candidate.planned_join_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Immediate / Upon Agreement";
  const letterNo = `OL/HR-BEG/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${String(candidate.id || "001").slice(-4)}`;
  const todayFormatted = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Offering Letter - ${candidateName}</title>
  <style>
    * { box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    body { margin: 0; padding: 36px; color: #1c1917; background: #fff; line-height: 1.6; }
    .sheet { max-width: 760px; margin: 0 auto; border: 1.5px solid #d6d3d1; border-radius: 16px; padding: 40px; }
    .header { border-bottom: 2px solid #b02524; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-size: 20px; font-weight: 900; color: #b02524; text-transform: uppercase; }
    .sub { font-size: 11px; color: #57534e; font-weight: 600; }
    h2 { font-size: 16px; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; margin: 20px 0 4px; color: #1c1917; }
    .doc-no { text-align: center; font-family: monospace; font-size: 12px; color: #57534e; margin-bottom: 24px; font-weight: 700; }
    p { font-size: 13px; margin: 10px 0; color: #292524; }
    .terms-box { background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 18px 22px; margin: 20px 0; }
    .term-row { display: grid; grid-template-columns: 210px 1fr; padding: 6px 0; font-size: 13px; border-bottom: 1px dashed #e7e5e4; }
    .term-row:last-child { border-bottom: 0; }
    .term-label { font-weight: 700; color: #57534e; }
    .term-val { font-weight: 800; color: #1c1917; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 44px; font-size: 12px; }
    .sig-line { margin-top: 56px; border-top: 1px solid #57534e; padding-top: 6px; font-weight: 800; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">CV BATU EMAS GROUP • PAVING JOSS</div>
        <div class="sub">Human Capital & Talent Acquisition Department</div>
      </div>
      <div style="text-align:right;font-size:12px;font-weight:700;color:#57534e;">
        ${todayFormatted}
      </div>
    </div>

    <h2>EMPLOYMENT OFFER LETTER</h2>
    <div class="doc-no">Reference No: ${letterNo}</div>

    <p>To:<br/><strong>${candidateName}</strong><br/>${candidate.email || ""} • ${candidate.phone || ""}</p>

    <p>Dear ${candidateName},</p>
    <p>Following the completion of your evaluation and interview process${Number(candidate.interview_overall_score) > 0 ? ` (Competency Score: <strong>${candidate.interview_overall_score}/100</strong>)` : ""}, Management of <strong>CV Batu Emas Group (Paving Joss)</strong> is pleased to extend a formal employment offer with the following position and compensation details:</p>

    <div class="terms-box">
      <div class="term-row">
        <span class="term-label">Position / Title</span>
        <span class="term-val">${jobTitle}</span>
      </div>
      <div class="term-row">
        <span class="term-label">Department / Division</span>
        <span class="term-val">${department}${candidate.job_work_center_id ? ` • Work Center: ${candidate.job_work_center_id}` : ""}</span>
      </div>
      <div class="term-row">
        <span class="term-label">Employment Type</span>
        <span class="term-val">${contractLabel}</span>
      </div>
      <div class="term-row">
        <span class="term-label">Planned Start Date</span>
        <span class="term-val">${plannedJoinDate}</span>
      </div>
      <div class="term-row">
        <span class="term-label">Basic Monthly Salary</span>
        <span class="term-val" style="font-family:monospace;color:#b02524;">${formatRupiah(offeredSalary)} / Month</span>
      </div>
      <div class="term-row">
        <span class="term-label">Fixed Allowances</span>
        <span class="term-val" style="font-family:monospace;color:#047857;">${formatRupiah(offeredAllowances)} / Month</span>
      </div>
      <div class="term-row">
        <span class="term-label">Total Gross Monthly Package</span>
        <span class="term-val" style="font-family:monospace;color:#1c1917;">${formatRupiah(totalPackage)} / Month</span>
      </div>
      <div class="term-row">
        <span class="term-label">Insurance & Benefits</span>
        <span class="term-val">Health Insurance, Social Security, KPI Incentives & Overtime Pay</span>
      </div>
      <div class="term-row">
        <span class="term-label">Annual Leave Quota</span>
        <span class="term-val">12 Working Days / Year</span>
      </div>
    </div>

    <p>To accept this employment offer, please sign below or confirm electronically via the Careers Portal (<code>/careers</code>) by submitting your National ID, Tax ID, Tax-Free Threshold status, and Payroll Bank Account details for Workforce ERP onboarding.</p>

    <div class="sig-grid">
      <div>
        <div>Sincerely,</div>
        <div style="color:#57534e;font-weight:600;">CV Batu Emas Group</div>
        <div class="sig-line">Head of Human Capital</div>
      </div>
      <div>
        <div>Accepted & Agreed By,</div>
        <div style="color:#57534e;font-weight:600;">Candidate</div>
        <div class="sig-line">${candidateName}</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  printHtmlViaIframe(html);
};

export const printPrqSummaryReport = (prq: any) => {
  if (!prq) return;
  const reqNo = prq.requisition_no || prq.requisition_number || prq.id;
  const period = prq.period_name || `${prq.period_month}/${prq.period_year}`;
  const details = Array.isArray(prq.details) ? prq.details : [];
  const totalGross = Number(prq.total_gross || details.reduce((s: number, d: any) => s + Number(d.gross_pay || 0), 0));
  const totalDed = Number(prq.total_deductions || details.reduce((s: number, d: any) => s + Number(d.total_deductions || 0), 0));
  const totalNet = Number(prq.total_net_pay || prq.total_net || details.reduce((s: number, d: any) => s + Number(d.net_pay || 0), 0));

  const rowsHtml = details
    .map(
      (d: any, i: number) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${d.employee_name || d.name || d.employee_username}</strong><br/><span style="font-size:10px;color:#78716c;">@${d.employee_username || d.username} • ${d.department || d.role || "STAFF"}</span></td>
        <td style="text-align:center;font-family:monospace;">${d.present_days ?? 22}/${d.working_days ?? 22}</td>
        <td class="num">${formatRupiah(d.basic_salary)}</td>
        <td class="num">${formatRupiah(Number(d.overtime_pay || 0) + Number(d.position_allowance || 0) + Number(d.kpi_bonus || 0) + Number(d.travel_allowance || 0) + Number(d.reimbursement_amount || 0))}</td>
        <td class="num">${formatRupiah(d.total_deductions)}</td>
        <td class="num"><strong>${formatRupiah(d.net_pay)}</strong></td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payroll Requisition Report - ${reqNo}</title>
  <style>
    * { box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    body { margin: 0; padding: 28px; color: #1c1917; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #b02524; padding-bottom: 14px; margin-bottom: 20px; }
    .brand { font-size: 18px; font-weight: 900; color: #b02524; text-transform: uppercase; }
    .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .kpi { background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 10px; padding: 12px 16px; }
    .kpi-label { font-size: 10px; text-transform: uppercase; color: #78716c; font-weight: 800; }
    .kpi-val { font-size: 16px; font-weight: 900; font-family: monospace; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f5f5f4; color: #57534e; text-transform: uppercase; font-size: 9px; letter-spacing: 0.06em; padding: 8px 10px; text-align: left; border-bottom: 1.5px solid #d6d3d1; }
    td { padding: 8px 10px; border-bottom: 1px solid #e7e5e4; }
    .num { font-family: monospace; text-align: right; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">PAYROLL REQUISITION SUMMARY REPORT (PRq)</div>
      <div style="font-size:11px;color:#57534e;font-weight:600;margin-top:2px;">Document No: ${reqNo} • Period: ${period}</div>
    </div>
    <div style="text-align:right;font-size:11px;font-weight:700;">
      Status: ${prq.status || "SUBMITTED"}<br/>
      Prepared By: @${prq.prepared_by || prq.submitted_by || "HR"}
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-label">Total Gross Payroll</div>
      <div class="kpi-val">${formatRupiah(totalGross)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Deductions (Social Security / Tax / Absence)</div>
      <div class="kpi-val" style="color:#be123c;">-${formatRupiah(totalDed)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Net Disbursement (THP)</div>
      <div class="kpi-val" style="color:#047857;">${formatRupiah(totalNet)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>No</th>
        <th>Employee</th>
        <th style="text-align:center;">Working Days</th>
        <th class="num">Basic Salary</th>
        <th class="num">Overtime & Allowances</th>
        <th class="num">Deductions</th>
        <th class="num">Net Pay (THP)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;

  printHtmlViaIframe(html);
};
