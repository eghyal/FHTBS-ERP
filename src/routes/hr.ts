import { hrAttendanceRouter } from "./attendance.ts";
import bcrypt from "bcrypt";
import { Router } from "express";
import db from "../db/database.ts";
import { requireRole, getActor } from "../middleware/auth.ts";
import { logAudit } from "../utils/audit.ts";
import { syncCollectionToFirestore } from "../db/firebaseSync.ts";
import { parseCandidateBankInfo } from "./hr/helpers.ts";

export const hrRouter = Router();
    // HR Salaries API - Strictly restricted to Executive & HR roles
    hrRouter.get("/api/hr/salaries", requireRole(["FC", "HR", "BOD", "ADMIN"]), (req, res) => {
      try {
        const salaries = db.prepare("SELECT * FROM hr_salaries").all();
        res.json(salaries);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch salaries" });
      }
    });

    hrRouter.post("/api/hr/salaries", requireRole(["FC", "HR", "ADMIN"]), (req, res) => {
      try {
        const { employee_username, basic_salary, allowances, deductions } = req.body;
        const dbUser = db.prepare("SELECT username FROM users WHERE LOWER(username) = LOWER(?)").get(employee_username) as any;
        const canonicalUsername = dbUser ? dbUser.username : employee_username;

        db.prepare(
          `INSERT INTO hr_salaries (employee_username, basic_salary, allowances, deductions, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(employee_username) DO UPDATE SET
             basic_salary = excluded.basic_salary,
             allowances = excluded.allowances,
             deductions = excluded.deductions,
             updated_at = CURRENT_TIMESTAMP
          `
        ).run(
          canonicalUsername,
          Number(basic_salary) || 0,
          Number(allowances) || 0,
          Number(deductions) || 0
        );

        res.json({ success: true });
      } catch (error) {
        console.error("Save salary error:", error);
        res.status(500).json({ error: "Failed to save salary configuration" });
      }
    });



    // Gap 5 Solved: Sweeper Engine / Redact
    hrRouter.post("/api/hr/sweep-data", requireRole(["FC", "HR"]), (req, res) => {
      try {
        // redact applications older than 6 months and rejected
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const dateString = sixMonthsAgo.toISOString();

        const info = db
          .prepare(
            `
            UPDATE hr_applications 
            SET name = 'REDACTED', email = 'redacted@deleted.loc', phone = 'REDACTED', linkedin_url = '', experience = 'REDACTED', resume_text = 'REDACTED'
            WHERE status = 'REJECTED' AND applied_at < ? AND name != 'REDACTED'
         `,
          )
          .run(dateString);

        logAudit(
          getActor(req),
          "DATA_SWEEP",
          "APPLICATION",
          "BATCH",
          `Redacted ${info.changes} rejected applications older than 6 months.`,
        );

        res.json({ success: true, redacted_count: info.changes });
      } catch (e: any) {
        res.status(500).json({ error: "Failed to sweep data" });
      }
    });

    hrRouter.get("/api/hr/jobs", (req, res) => {
      try {
        const jobs = db
          .prepare(
            "SELECT * FROM hr_jobs WHERE archived_at IS NULL ORDER BY created_at DESC",
          )
          .all();
        res.json(jobs);
      } catch (e: any) {
        console.error("Fetch HR jobs failed:", e);
        res.status(500).json({ error: "Failed to fetch job vacancies" });
      }
    });

    // Gap 1 Solved: Candidate Portal (Application Tracking & Self-Service Offering Confirmation)
    hrRouter.post("/api/hr/track", (req, res) => {
      try {
        const { email, tracking_id } = req.body;
        if (!email || !tracking_id)
          return res
            .status(400)
            .json({ error: "Email and Tracking ID are required" });

        const application = db
          .prepare(
            `
          SELECT 
            a.id, 
            a.name,
            a.email,
            a.phone,
            a.status, 
            a.applied_at, 
            a.notes, 
            a.onboarding_token,
            a.token_used,
            a.interview_date,
            a.interviewer_name,
            a.score_technical,
            a.score_communication,
            a.score_reliability,
            a.score_culture_fit,
            a.interview_overall_score,
            a.offered_basic_salary,
            a.offered_allowances,
            a.contract_type,
            a.contract_duration_months,
            a.planned_join_date,
            a.nik_ktp,
            a.npwp,
            a.ptkp_status,
            a.bank_name,
            a.bank_account_number,
            j.id as job_id,
            j.title as job_title, 
            j.department,
            j.location,
            j.type as job_type,
            j.salary_string,
            j.salary_min,
            j.salary_max,
            j.employment_type_default,
            j.target_work_center_id
          FROM hr_applications a
          JOIN hr_jobs j ON a.job_id = j.id
          WHERE LOWER(TRIM(a.email)) = LOWER(TRIM(?)) AND UPPER(TRIM(a.id)) = UPPER(TRIM(?))
        `,
          )
          .get(email, tracking_id);

        if (!application)
          return res
            .status(404)
            .json({ error: "Application not found or data mismatch." });

        res.json(application);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to track application" });
      }
    });

    // Self-Service Candidate Offer Acceptance & Onboarding Dossier Submission from Careers Portal
    hrRouter.post("/api/hr/track/respond", (req, res) => {
      try {
        const {
          email,
          tracking_id,
          join_date,
          id_card_number,
          nik_ktp,
          npwp,
          ptkp_status,
          bank_name,
          bank_account_number,
          bank_account_info,
          candidate_notes,
        } = req.body;

        if (!email || !tracking_id) {
          return res.status(400).json({ error: "Email dan Tracking ID wajib diisi." });
        }

        const application = db
          .prepare(
            `SELECT a.*, j.title as job_title, j.department
             FROM hr_applications a
             JOIN hr_jobs j ON a.job_id = j.id
             WHERE LOWER(TRIM(a.email)) = LOWER(TRIM(?)) AND UPPER(TRIM(a.id)) = UPPER(TRIM(?))`,
          )
          .get(email, tracking_id) as any;

        if (!application) {
          return res.status(404).json({ error: "Data lamaran tidak ditemukan." });
        }

        if (!["OFFER_MADE", "ACCEPTED", "INTERVIEW"].includes(application.status)) {
          return res.status(400).json({
            error: `Konfirmasi tawaran kerja hanya dapat dilakukan pada tahap Offering (status saat ini: ${application.status}).`,
          });
        }

        const resolvedNik = String(nik_ktp || id_card_number || application.nik_ktp || "").trim();
        const resolvedNpwp = String(npwp || application.npwp || "").trim();
        const resolvedPtkp = String(ptkp_status || application.ptkp_status || "TK/0").trim();
        const resolvedJoinDate = String(join_date || application.planned_join_date || "").trim();

        const { resolvedBankName, resolvedBankNumber } = parseCandidateBankInfo(
          bank_name,
          bank_account_number,
          bank_account_info,
          application.bank_name,
          application.bank_account_number,
        );

        const timestamp = new Date().toLocaleString("id-ID");
        const dossierSummary = [
          `[KONFIRMASI OFFERING & BERKAS MANDIRI - ${timestamp}]`,
          resolvedJoinDate ? `Mulai Kerja: ${resolvedJoinDate}` : null,
          resolvedNik ? `NIK KTP: ${resolvedNik}` : null,
          resolvedNpwp ? `NPWP: ${resolvedNpwp}` : null,
          resolvedPtkp ? `PTKP: ${resolvedPtkp}` : null,
          resolvedBankName || resolvedBankNumber
            ? `Rekening Payroll: ${[resolvedBankName, resolvedBankNumber].filter(Boolean).join(" - ")}`
            : null,
          candidate_notes ? `Catatan Kandidat: ${candidate_notes}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        const updatedNotes = application.notes
          ? `${application.notes}\n${dossierSummary}`
          : dossierSummary;

        const nextStatus =
          application.status === "OFFER_MADE" ? "ACCEPTED" : application.status;
        const token =
          application.onboarding_token ||
          "TKN-" + Math.random().toString(36).substring(2, 9).toUpperCase();

        db.prepare(
          `UPDATE hr_applications
           SET status = ?, notes = ?, onboarding_token = ?,
               planned_join_date = COALESCE(NULLIF(?, ''), planned_join_date),
               nik_ktp = COALESCE(NULLIF(?, ''), nik_ktp),
               npwp = COALESCE(NULLIF(?, ''), npwp),
               ptkp_status = COALESCE(NULLIF(?, ''), ptkp_status),
               bank_name = COALESCE(NULLIF(?, ''), bank_name),
               bank_account_number = COALESCE(NULLIF(?, ''), bank_account_number)
           WHERE id = ?`,
        ).run(
          nextStatus,
          updatedNotes,
          token,
          resolvedJoinDate,
          resolvedNik,
          resolvedNpwp,
          resolvedPtkp,
          resolvedBankName,
          resolvedBankNumber,
          application.id,
        );

        logAudit(
          "CANDIDATE_PORTAL",
          "CONFIRM_OFFERING",
          "APPLICATION",
          application.id,
          `Candidate ${application.name} confirmed job offer for ${application.job_title} (${dossierSummary})`,
        );

        const refreshed = db
          .prepare(
            `SELECT 
              a.*,
              j.id as job_id, j.title as job_title, j.department, j.location, j.type as job_type,
              j.salary_string, j.salary_min, j.salary_max, j.employment_type_default, j.target_work_center_id
             FROM hr_applications a
             JOIN hr_jobs j ON a.job_id = j.id
             WHERE a.id = ?`,
          )
          .get(application.id);

        res.json({
          success: true,
          message: "Konfirmasi penerimaan Offering Letter dan berkas onboarding berhasil disimpan ke HRIS.",
          data: refreshed,
        });
      } catch (e: any) {
        console.error("Failed to record candidate response:", e);
        res.status(500).json({ error: "Gagal menyimpan konfirmasi kandidat." });
      }
    });

    // Resolving Gap: Katalog Produk Website Publik Terintegrasi Penuh dengan Master Inventory ERP
    hrRouter.get("/api/public/products", (req, res) => {
      try {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        );
        const rawProducts = db
          .prepare(
            `SELECT 
              i.id, 
              i.item_code, 
              i.name, 
              i.dimension, 
              i.uom, 
              COALESCE(i.unit_price, 0) as unit_price, 
              COALESCE(i.shop_promo_price, 0) as promo_price,
              i.category,
              i.description,
              COALESCE(NULLIF(TRIM(i.shop_image_url), ''), '') as image_url,
              COALESCE(i.shop_gallery_urls, '[]') as shop_gallery_urls,
              COALESCE(i.shop_badge, '') as badge,
              COALESCE(i.spec, '') as spec,
              COALESCE(i.shop_featured, 0) as is_featured,
              COALESCE(i.shop_availability_type, 'AUTO') as availability_type,
              COALESCE(i.shop_moq, 1) as moq,
              COALESCE(i.shop_lead_time_days, 3) as lead_time_days,
              COALESCE(inv.available_qty, 0) as available_qty,
              COALESCE(inv.physical_qty, 0) as physical_qty
            FROM items i
            LEFT JOIN inventory inv ON i.id = inv.item_id
            WHERE i.deleted_at IS NULL
              AND COALESCE(i.is_published_shop, 1) = 1
              AND ((i.type IN ('FINISHED', 'FINISH_GOOD', 'FINISH_GOODS')) OR (i.item_code LIKE 'FG - %' OR i.item_code LIKE 'FG-%'))
              AND (i.type != 'MACHINE' OR i.type IS NULL) AND (i.item_code NOT LIKE 'MC - %' AND i.item_code NOT LIKE 'MC-%')
            ORDER BY 
              CASE WHEN i.shop_featured = 1 THEN 0 ELSE 1 END,
              i.name ASC`,
          )
          .all() as any[];

        const products = rawProducts.map((item) => {
          let gallery: string[] = [];
          try {
            const parsed = JSON.parse(item.shop_gallery_urls || "[]");
            if (Array.isArray(parsed)) {
              gallery = parsed.filter((u) => typeof u === "string" && u.trim() !== "").map((u) => u.trim());
            }
          } catch {
            gallery = [];
          }
          const primaryUrl = typeof item.image_url === "string" ? item.image_url.trim() : "";
          if (primaryUrl) {
            gallery = [primaryUrl, ...gallery.filter((u) => u !== primaryUrl)];
          }
          return {
            ...item,
            image_url: primaryUrl || gallery[0] || "",
            gallery_urls: gallery,
          };
        });

        res.json(products);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch public products" });
      }
    });

    // Resolving Gap: Alur Penjualan Terpotong
    hrRouter.post("/api/public/leads", (req, res) => {
      try {
        const { id, name, contact_info, intent } = req.body;
        db.prepare(
          `
          INSERT INTO crm_leads (id, name, contact_info, intent)
          VALUES (?, ?, ?, ?)
        `,
        ).run(id || crypto.randomUUID(), name, contact_info, intent);
        res.json({ success: true, message: "Lead captured successfully" });
      } catch (e: any) {
        console.error("Failed to capture lead:", e);
        res.status(500).json({ error: "Failed to capture lead" });
      }
    });

    // Direct End-to-End Bridge: Public & Shop Project RFQ -> CRM Lead + Customer + Official Sales ERP Quotation
    hrRouter.post("/api/public/rfq", (req, res) => {
      try {
        const {
          customer_name,
          company,
          phone,
          email,
          project_location,
          item_id,
          item_name,
          item_code,
          uom,
          qty,
          unit_price,
          notes,
          source_module,
        } = req.body;

        if (!customer_name || (!phone && !email)) {
          return res.status(400).json({
            error: "Nama Pemohon serta Nomor WhatsApp/Telepon atau Email wajib diisi.",
          });
        }

        const cleanName = String(customer_name).trim();
        const cleanCompany = company ? String(company).trim() : cleanName;
        const cleanPhone = phone ? String(phone).trim() : "";
        const cleanEmail = email ? String(email).trim() : "";
        const cleanLocation = project_location ? String(project_location).trim() : "Jawa Timur";
        const requestedQty = Math.max(1, Number(qty) || 100);
        const nowIso = new Date().toISOString();

        // Lookup item if item_id provided
        let resolvedItem: any = null;
        if (item_id) {
          resolvedItem = db
            .prepare("SELECT * FROM items WHERE id = ? OR item_code = ? LIMIT 1")
            .get(item_id, item_id) as any;
        }

        const finalItemName =
          resolvedItem?.name || item_name || "Paket Material Beton & Fabrikasi Proyek";
        const finalUom = resolvedItem?.uom || uom || "M2";
        const basePrice =
          Number(resolvedItem?.unit_price) > 0
            ? Number(resolvedItem.unit_price)
            : Number(unit_price) > 0
            ? Number(unit_price)
            : 125000;

        const dpp = Math.round(requestedQty * basePrice);
        const dppNilaiLain = Math.round(dpp * (11 / 12));
        const ppn = Math.round(dpp * 0.11);
        const grandTotal = dpp + ppn;

        const leadId = "LEAD-" + Math.random().toString(36).substring(2, 9).toUpperCase();
        const quotationId = "QUO-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        const year = new Date().getFullYear();
        const count =
          ((db.prepare("SELECT COUNT(*) as cnt FROM quotations").get() as any)?.cnt || 0) + 1;
        const quotationNumber = `QUO/${year}/${String(count).padStart(3, "0")}/${quotationId.slice(-2)}`;

        let customerId = "";

        db.transaction(() => {
          // 1. Record in crm_leads
          db.prepare(
            `INSERT INTO crm_leads (id, name, contact_info, intent)
             VALUES (?, ?, ?, ?)`,
          ).run(
            leadId,
            `${cleanCompany} (${cleanName})`,
            `${cleanPhone}${cleanEmail ? " / " + cleanEmail : ""}`,
            `[${source_module || "PUBLIC_RFQ"}] ${finalItemName} - ${requestedQty} ${finalUom} (${cleanLocation}) -> ${quotationNumber}`,
          );

          // 2. Find or create Customer in ERP Master Customers
          const existingCust = db
            .prepare(
              `SELECT id FROM customers 
               WHERE (phone = ? AND phone IS NOT NULL AND phone != '')
                  OR (email = ? AND email IS NOT NULL AND email != '')
               LIMIT 1`,
            )
            .get(cleanPhone, cleanEmail) as any;

          if (existingCust) {
            customerId = existingCust.id;
          } else {
            customerId = "CUS-" + Math.random().toString(36).substring(2, 9).toUpperCase();
            const prefix = cleanCompany
              .slice(0, 3)
              .toUpperCase()
              .replace(/[^A-Z]/g, "CUS")
              .padEnd(3, "X");
            const code = `${prefix}-${Math.floor(100 + Math.random() * 900)}`;
            db.prepare(
              `INSERT INTO customers (id, code, name, contact_person, email, phone, address)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              customerId,
              code,
              cleanCompany,
              cleanName,
              cleanEmail || null,
              cleanPhone || null,
              cleanLocation,
            );
          }

          // 3. Also record in potential_customers for Sales Scout AI visibility
          try {
            const potId = "POT-" + Math.random().toString(36).substring(2, 9).toUpperCase();
            db.prepare(
              `INSERT INTO potential_customers (
                id, customer_name, company, email, phone, status, potential_score, persona_tag,
                cart_total_value, cart_snapshot, scout_recommendations, last_active_at, created_at
              ) VALUES (?, ?, ?, ?, ?, 'CONVERTED', 90, 'B2B Project RFQ', ?, ?, ?, ?, ?)`,
            ).run(
              potId,
              cleanName,
              cleanCompany,
              cleanEmail || null,
              cleanPhone || null,
              dpp,
              JSON.stringify([
                {
                  item_id: resolvedItem?.id || item_id || null,
                  name: finalItemName,
                  qty: requestedQty,
                  uom: finalUom,
                  unit_price: basePrice,
                },
              ]),
              `Permintaan Penawaran Proyek (RFQ) dari ${source_module || "Portal Publik"} untuk lokasi ${cleanLocation}. Otomatis terkonversi ke ${quotationNumber}.`,
              nowIso,
              nowIso,
            );
          } catch (potErr) {
            // Ignore if potential_customers optional columns differ
          }

          // 4. Create Official Draft Quotation in ERP Sales
          const remarksText = [
            `Permintaan Penawaran Proyek (RFQ) dari ${source_module || "Portal Publik/Shop"}.`,
            `Lokasi Proyek: ${cleanLocation}.`,
            `Kontak: ${cleanName} (${cleanPhone}${cleanEmail ? ", " + cleanEmail : ""}).`,
            notes ? `Catatan Spesifikasi: ${notes}` : null,
          ]
            .filter(Boolean)
            .join(" ");

          db.prepare(
            `INSERT INTO quotations (
              id, quotation_number, customer_id, title, amount, validity_days, remarks, status,
              tax_rate, discount_rate, pph_rate, dpp, dpp_nilai_lain, tax_scheme,
              payment_terms, payment_method, rounding_factor, grand_total, created_at
            ) VALUES (
              ?, ?, ?, ?, ?, 14, ?, 'PENDING',
              11, 0, 0, ?, ?, 'DPP_NILAI_LAIN',
              'Net 14 Days', 'Transfer Bank', 0, ?, ?
            )`,
          ).run(
            quotationId,
            quotationNumber,
            customerId,
            `Penawaran Proyek: ${finalItemName} (${cleanCompany})`,
            dpp,
            remarksText,
            dpp,
            dppNilaiLain,
            grandTotal,
            nowIso,
          );

          db.prepare(
            `INSERT INTO quotation_items (
              id, quotation_id, title, qty, uom, unit_price, item_id, barcode, discount_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          ).run(
            `QI-${quotationId}-1`,
            quotationId,
            finalItemName,
            requestedQty,
            finalUom,
            basePrice,
            resolvedItem?.id || null,
            resolvedItem?.item_code || item_code || null,
          );
        })();

        logAudit(
          "PUBLIC_RFQ",
          "CREATE_RFQ_QUOTATION",
          "QUOTATION",
          quotationId,
          `Created project RFQ quotation ${quotationNumber} for ${cleanCompany} (${finalItemName} x ${requestedQty} ${finalUom})`,
        );

        res.json({
          success: true,
          message: `Permintaan Penawaran Proyek berhasil tercatat dengan nomor ${quotationNumber}.`,
          data: {
            quotation_id: quotationId,
            quotation_number: quotationNumber,
            customer_id: customerId,
            lead_id: leadId,
            item_name: finalItemName,
            qty: requestedQty,
            uom: finalUom,
            estimated_dpp: dpp,
            estimated_grand_total: grandTotal,
          },
        });
      } catch (e: any) {
        console.error("Failed to create public RFQ:", e);
        res.status(500).json({
          error: e.message || "Gagal membuat pengajuan penawaran proyek.",
        });
      }
    });

    // Gap 4 Solved: Public Directory
    hrRouter.get("/api/public/team", (req, res) => {
      try {
        const team = db
          .prepare(
            "SELECT name, role FROM users WHERE status = 'APPROVED' AND level IN ('DIRECTOR', 'MANAGER', 'STAFF') LIMIT 24",
          )
          .all();
        res.json(team);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch public team data" });
      }
    });

    // Gap 2 Solved: CMS Settings (Supports public, shop, careers)
    hrRouter.get("/api/cms/:page", (req, res) => {
      try {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        );
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");

        const pageKey = String(req.params.page || "").trim().toLowerCase();
        db.prepare(
          `CREATE TABLE IF NOT EXISTS cms_settings (
            page TEXT PRIMARY KEY,
            content_json TEXT NOT NULL
          )`
        ).run();
        const existingCms = db
          .prepare("SELECT content_json FROM cms_settings WHERE page = ?")
          .get(pageKey) as any;
        if (existingCms && existingCms.content_json) {
          res.json(JSON.parse(existingCms.content_json));
        } else {
          res.json({});
        }
      } catch (e: any) {
        console.error("Failed to fetch CMS data:", e);
        res.status(500).json({ error: "Failed to fetch CMS data" });
      }
    });

    const saveCmsSettingsHandler = (req: any, res: any) => {
      try {
        const pageKey = String(req.params.page || "").trim().toLowerCase();
        if (!pageKey) {
          return res.status(400).json({ error: "CMS page key is required" });
        }

        db.prepare(
          `CREATE TABLE IF NOT EXISTS cms_settings (
            page TEXT PRIMARY KEY,
            content_json TEXT NOT NULL
          )`
        ).run();

        const payloadObj = req.body || {};
        const serializedPayload = JSON.stringify(payloadObj);

        db.prepare(
          `
           INSERT INTO cms_settings (page, content_json) VALUES (?, ?)
           ON CONFLICT(page) DO UPDATE SET content_json = excluded.content_json
         `,
        ).run(pageKey, serializedPayload);

        // Broadcast real-time CMS update immediately to all connected WebSocket clients
        try {
          const io = (global as any).io;
          if (io) {
            io.emit("cms:updated", {
              page: pageKey,
              data: payloadObj,
              updatedAt: Date.now(),
            });
          }
        } catch {}

        try {
          logAudit(
            getActor(req),
            "UPDATE_CMS_SETTINGS",
            "CMS",
            pageKey,
            `Updated CMS configuration for page: ${pageKey}`,
          );
          // Only sync to Firestore if payload is under 850KB (Firestore 1MB doc limit)
          if (serializedPayload.length < 850_000) {
            syncCollectionToFirestore("cms_settings", pageKey, {
              page: pageKey,
              content_json: serializedPayload,
            });
          }
        } catch (auditErr) {
          console.warn("[CMS] Non-fatal audit/sync warning:", auditErr);
        }

        res.json({ success: true, page: pageKey, updatedAt: Date.now() });
      } catch (e: any) {
        console.error("Failed to update CMS data:", e);
        res.status(500).json({ error: e?.message || "Failed to update CMS data" });
      }
    };

    const cmsAllowedRoles = [
      "FC",
      "HR",
      "ADMIN",
      "BOD",
      "SALES",
      "MANAGER",
      "FINANCE",
      "ENGINEER",
      "PRODUCTION",
      "PROCUREMENT",
      "WAREHOUSE",
    ];

    hrRouter.put("/api/cms/:page", requireRole(cmsAllowedRoles), saveCmsSettingsHandler);
    hrRouter.post("/api/cms/:page", requireRole(cmsAllowedRoles), saveCmsSettingsHandler);

    hrRouter.get("/api/hr/jobs-public", (req, res) => {
      try {
        const jobs = db
          .prepare(
            `SELECT * FROM hr_jobs
             WHERE status = 'OPEN'
               AND archived_at IS NULL
               AND COALESCE(hired_count, 0) < COALESCE(NULLIF(headcount_quota, 0), 1)
             ORDER BY created_at DESC`,
          )
          .all();
        res.json(jobs);
      } catch (e: any) {
        console.error("Fetch HR jobs public failed:", e);
        res.status(500).json({ error: "Failed to fetch job vacancies" });
      }
    });

    hrRouter.post("/api/hr/jobs", (req, res) => {
      try {
        const {
          title,
          department,
          location,
          type,
          description,
          requirements,
          benefits,
          salary_string,
          salary_min,
          salary_max,
          headcount_quota,
          employment_type_default,
          target_work_center_id,
          closing_date,
          pamphlet_bg_color,
          pamphlet_accent_color,
        } = req.body;
        if (!title || !department || !description) {
          return res
            .status(400)
            .json({ error: "Title, Department and Description are required" });
        }
        const id =
          "JOB-" + Math.random().toString(36).substr(2, 9).toUpperCase();

        const quota = Math.max(1, Number(headcount_quota) || 1);
        const salMin = Math.max(0, Number(salary_min) || 0);
        const salMax = Math.max(salMin, Number(salary_max) || salMin);
        const computedSalaryStr =
          salary_string ||
          (salMin > 0
            ? salMax > salMin
              ? `Rp ${salMin.toLocaleString("id-ID")} - Rp ${salMax.toLocaleString("id-ID")}`
              : `Rp ${salMin.toLocaleString("id-ID")}`
            : "");

        db.prepare(
          `
          INSERT INTO hr_jobs (
            id, title, department, location, type, description, requirements, benefits,
            salary_string, salary_min, salary_max, headcount_quota, hired_count,
            employment_type_default, target_work_center_id, closing_date,
            pamphlet_bg_color, pamphlet_accent_color
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
        `,
        ).run(
          id,
          title,
          department,
          location || "Head Office",
          type || "Full-time",
          description,
          requirements || "[]",
          benefits || "[]",
          computedSalaryStr,
          salMin,
          salMax,
          quota,
          employment_type_default || "PKWT",
          target_work_center_id || null,
          closing_date || null,
          pamphlet_bg_color || "#1c1917",
          pamphlet_accent_color || "#ca8a04",
        );

        logAudit(
          getActor(req),
          "CREATE_JOB",
          "JOB",
          id,
          `Created job vacancy ${title} for ${department} (Quota: ${quota}, Budget: ${computedSalaryStr || "N/A"})`,
        );
        res.json({ success: true, id });
      } catch (e: any) {
        console.error("Create HR job failed:", e);
        res.status(500).json({ error: "Failed to create job vacancy" });
      }
    });

    hrRouter.put("/api/hr/jobs/:id", (req, res) => {
      try {
        const {
          title,
          department,
          location,
          type,
          status,
          description,
          requirements,
          benefits,
          salary_string,
          salary_min,
          salary_max,
          headcount_quota,
          hired_count,
          employment_type_default,
          target_work_center_id,
          closing_date,
          pamphlet_bg_color,
          pamphlet_accent_color,
        } = req.body;

        const existingJob = db
          .prepare("SELECT * FROM hr_jobs WHERE id = ?")
          .get(req.params.id) as any;

        const quota = Math.max(
          1,
          Number(headcount_quota ?? existingJob?.headcount_quota) || 1,
        );
        const hired = Math.max(
          0,
          Number(hired_count ?? existingJob?.hired_count) || 0,
        );
        const salMin = Math.max(
          0,
          Number(salary_min ?? existingJob?.salary_min) || 0,
        );
        const salMax = Math.max(
          salMin,
          Number(salary_max ?? existingJob?.salary_max) || salMin,
        );
        const computedSalaryStr =
          salary_string !== undefined && String(salary_string).trim() !== ""
            ? salary_string
            : salMin > 0
            ? salMax > salMin
              ? `Rp ${salMin.toLocaleString("id-ID")} - Rp ${salMax.toLocaleString("id-ID")}`
              : `Rp ${salMin.toLocaleString("id-ID")}`
            : existingJob?.salary_string || "";

        const finalStatus =
          hired >= quota && status !== "OPEN"
            ? "CLOSED"
            : status || existingJob?.status || "OPEN";

        db.prepare(
          `
          UPDATE hr_jobs 
          SET title = ?, department = ?, location = ?, type = ?, status = ?,
              description = ?, requirements = ?, benefits = ?, salary_string = ?,
              salary_min = ?, salary_max = ?, headcount_quota = ?, hired_count = ?,
              employment_type_default = ?, target_work_center_id = ?, closing_date = ?,
              pamphlet_bg_color = ?, pamphlet_accent_color = ?
          WHERE id = ?
        `,
        ).run(
          title,
          department,
          location,
          type,
          finalStatus,
          description,
          requirements,
          benefits,
          computedSalaryStr,
          salMin,
          salMax,
          quota,
          hired,
          employment_type_default || existingJob?.employment_type_default || "PKWT",
          target_work_center_id !== undefined
            ? target_work_center_id || null
            : existingJob?.target_work_center_id || null,
          closing_date !== undefined
            ? closing_date || null
            : existingJob?.closing_date || null,
          pamphlet_bg_color || "#1c1917",
          pamphlet_accent_color || "#ca8a04",
          req.params.id,
        );

        logAudit(
          getActor(req),
          "UPDATE_JOB",
          "JOB",
          req.params.id,
          `Updated job vacancy ${title} (Quota: ${hired}/${quota}, Status: ${finalStatus})`,
        );
        res.json({ success: true, status: finalStatus });
      } catch (e: any) {
        console.error("Update HR job failed:", e);
        res.status(500).json({ error: "Failed to update job vacancy" });
      }
    });

    hrRouter.delete("/api/hr/jobs/:id", (req, res) => {
      try {
        db.prepare(
          "UPDATE hr_jobs SET archived_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(req.params.id);
        logAudit(
          getActor(req),
          "DELETE_JOB",
          "JOB",
          req.params.id,
          `Deleted job vacancy`,
        );
        res.json({ success: true });
      } catch (e: any) {
        console.error("Delete HR job failed:", e);
        res.status(500).json({ error: "Failed to delete job vacancy" });
      }
    });

    // 2. Candidate Applications
    hrRouter.get("/api/hr/applications", (req, res) => {
      try {
        const apps = db
          .prepare(
            `
          SELECT a.*,
                 COALESCE(j.title, 'Position') as job_title,
                 j.department as job_department,
                 j.location as job_location,
                 j.salary_string as job_salary_string,
                 j.salary_string as job_salary_range,
                 j.salary_min as job_salary_min,
                 j.salary_max as job_salary_max,
                 j.employment_type_default as job_contract_type,
                 j.employment_type_default as job_employment_type_default,
                 j.target_work_center_id as job_work_center_id,
                 j.target_work_center_id as target_work_center_id,
                 j.headcount_quota as job_headcount_quota,
                 j.hired_count as job_hired_count
          FROM hr_applications a
          LEFT JOIN hr_jobs j ON a.job_id = j.id
          ORDER BY a.applied_at DESC
        `,
          )
          .all();
        res.json(apps);
      } catch (e: any) {
        console.error("Fetch applications failed:", e);
        res
          .status(500)
          .json({ error: "Failed to fetch candidate applications" });
      }
    });

    hrRouter.post("/api/hr/applications", (req, res) => {
      try {
        const {
          job_id,
          name,
          email,
          phone,
          linkedin_url,
          experience,
          resume_text,
        } = req.body;
        if (!job_id || !name || !email || !phone) {
          return res
            .status(400)
            .json({
              error: "Job ID, Name, Email, and Phone number are required",
            });
        }

        // Check vacancy status & quota
        const job = db
          .prepare("SELECT * FROM hr_jobs WHERE id = ?")
          .get(job_id) as any;
        if (job && job.status === "CLOSED") {
          return res.status(400).json({
            error: "Lowongan pekerjaan ini telah ditutup (kuota terpenuhi).",
          });
        }

        // Anti-Dumping & Duplication Check (Missing Link 1 Solved)
        const existingApp = db
          .prepare(
            `SELECT id FROM hr_applications WHERE email = ? AND job_id = ?`,
          )
          .get(email, job_id);
        if (existingApp) {
          return res
            .status(400)
            .json({
              error:
                "Candidate with this email has already applied for this position.",
            });
        }

        const id =
          "APP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        db.prepare(
          `
          INSERT INTO hr_applications (
            id, job_id, name, email, phone, linkedin_url, experience, resume_text, status,
            offered_basic_salary, contract_type
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPLIED', ?, ?)
        `,
        ).run(
          id,
          job_id,
          name,
          email,
          phone,
          linkedin_url || "",
          experience || "",
          resume_text || "",
          Number(job?.salary_min || 0),
          job?.employment_type_default || "PKWT",
        );

        logAudit(
          "PUBLIC",
          "SUBMIT_APPLICATION",
          "APPLICATION",
          id,
          `Candidate ${name} applied for job ID ${job_id}`,
        );

        console.log(
          `-----------------------------------------------------------`,
        );
        console.log(
          `[MAIL SERVICE] MENSIMULASIKAN PENGIRIMAN EMAIL PENDAFTARAN`,
        );
        console.log(`To: ${email}`);
        console.log(`Subject: Application Received - CV Batu Emas Group`);
        console.log(
          `Body: Halo ${name}, Terimakasih telah melamar. Anda bisa melacak status lamaran dengan ID: ${id}`,
        );
        console.log(`Status: Sukses`);
        console.log(
          `-----------------------------------------------------------`,
        );

        res.json({
          success: true,
          id,
          message: "Application submitted and email tracking ID sent",
        });
      } catch (e: any) {
        console.error("Submit application failed:", e);
        res.status(500).json({ error: "Failed to submit application form" });
      }
    });

    hrRouter.put("/api/hr/applications/:id/status", async (req, res) => {
      try {
        const {
          status,
          notes,
          interview_date,
          interviewer_name,
          score_technical,
          score_communication,
          score_reliability,
          score_culture_fit,
          offered_basic_salary,
          offered_allowances,
          contract_type,
          contract_duration_months,
          planned_join_date,
        } = req.body;

        const existing = db
          .prepare("SELECT * FROM hr_applications WHERE id = ?")
          .get(req.params.id) as any;

        if (!existing) {
          return res.status(404).json({ error: "Application not found" });
        }

        const sTech =
          score_technical !== undefined
            ? Number(score_technical)
            : Number(existing.score_technical || 0);
        const sComm =
          score_communication !== undefined
            ? Number(score_communication)
            : Number(existing.score_communication || 0);
        const sRel =
          score_reliability !== undefined
            ? Number(score_reliability)
            : Number(existing.score_reliability || 0);
        const sCult =
          score_culture_fit !== undefined
            ? Number(score_culture_fit)
            : Number(existing.score_culture_fit || 0);
        const hasScores = sTech > 0 || sComm > 0 || sRel > 0 || sCult > 0;
        const overallScore = hasScores
          ? Number(((sTech + sComm + sRel + sCult) / 4).toFixed(1))
          : Number(existing.interview_overall_score || 0);

        db.prepare(
          `
          UPDATE hr_applications
          SET status = ?,
              notes = ?,
              interview_date = COALESCE(?, interview_date),
              interviewer_name = COALESCE(?, interviewer_name),
              score_technical = ?,
              score_communication = ?,
              score_reliability = ?,
              score_culture_fit = ?,
              interview_overall_score = ?,
              offered_basic_salary = COALESCE(?, offered_basic_salary),
              offered_allowances = COALESCE(?, offered_allowances),
              contract_type = COALESCE(?, contract_type),
              contract_duration_months = COALESCE(?, contract_duration_months),
              planned_join_date = COALESCE(?, planned_join_date)
          WHERE id = ?
        `,
        ).run(
          status || existing.status,
          notes !== undefined ? notes : existing.notes,
          interview_date ?? null,
          interviewer_name ?? null,
          sTech,
          sComm,
          sRel,
          sCult,
          overallScore,
          offered_basic_salary !== undefined ? Number(offered_basic_salary) : null,
          offered_allowances !== undefined ? Number(offered_allowances) : null,
          contract_type ?? null,
          contract_duration_months !== undefined ? Number(contract_duration_months) : null,
          planned_join_date ?? null,
          req.params.id,
        );

        // Real-time Email Notifications
        if (
          ["SCREENING", "INTERVIEW", "REJECTED", "OFFER_MADE", "ACCEPTED"].includes(status)
        ) {
          console.log(
            `[EMAIL GATEWAY] Sending email notification to candidate for Application ${req.params.id}. Status changed to ${status}.`,
          );
          logAudit(
            "SYSTEM",
            "EMAIL_SENT",
            "APPLICATION",
            req.params.id,
            `Notified candidate of status ${status}`,
          );
        }

        // Gap 2 Solved: Automasi Onboarding HRIS ke ERP Master Data (users table)
        if (status === "ACCEPTED" && !existing.onboarding_token) {
          const token =
            "TKN-" + Math.random().toString(36).substr(2, 9).toUpperCase();
          db.prepare(
            `UPDATE hr_applications SET onboarding_token = ? WHERE id = ?`,
          ).run(token, req.params.id);
          console.log(
            `[EMAIL GATEWAY] Sending Onboarding Token to candidate for Application ${req.params.id}: ${token}`,
          );
          logAudit(
            "SYSTEM",
            "TOKEN_GENERATED",
            "APPLICATION",
            req.params.id,
            `Generated onboarding token for candidate.`,
          );
        }

        logAudit(
          getActor(req),
          "UPDATE_APPLICATION_STATUS",
          "APPLICATION",
          req.params.id,
          `Updated candidate application status to ${status}`,
        );
        res.json({ success: true, interview_overall_score: overallScore });
      } catch (e: any) {
        console.error("Update application status failed:", e);
        res
          .status(500)
          .json({ error: "Failed to update candidate application status" });
      }
    });

    // Dedicated Endpoint for Structured Interview Scorecard & Commercial Offering (PKWT/PKWTT)
    hrRouter.put("/api/hr/applications/:id/evaluation", (req, res) => {
      try {
        const {
          status,
          notes,
          interview_date,
          interviewer_name,
          score_technical,
          score_communication,
          score_reliability,
          score_culture_fit,
          offered_basic_salary,
          offered_allowances,
          contract_type,
          contract_duration_months,
          planned_join_date,
          nik_ktp,
          npwp,
          ptkp_status,
          bank_name,
          bank_account_number,
        } = req.body;

        const existing = db
          .prepare("SELECT * FROM hr_applications WHERE id = ?")
          .get(req.params.id) as any;

        if (!existing) {
          return res.status(404).json({ error: "Candidate application not found" });
        }

        const sTech = Math.max(0, Math.min(100, Number(score_technical ?? existing.score_technical ?? 0)));
        const sComm = Math.max(0, Math.min(100, Number(score_communication ?? existing.score_communication ?? 0)));
        const sRel = Math.max(0, Math.min(100, Number(score_reliability ?? existing.score_reliability ?? 0)));
        const sCult = Math.max(0, Math.min(100, Number(score_culture_fit ?? existing.score_culture_fit ?? 0)));
        const overallScore =
          sTech > 0 || sComm > 0 || sRel > 0 || sCult > 0
            ? Number(((sTech + sComm + sRel + sCult) / 4).toFixed(1))
            : Number(existing.interview_overall_score || 0);

        const nextStatus = status || existing.status;
        const token =
          nextStatus === "ACCEPTED" && !existing.onboarding_token
            ? "TKN-" + Math.random().toString(36).substr(2, 9).toUpperCase()
            : existing.onboarding_token;

        db.prepare(
          `UPDATE hr_applications
           SET status = ?,
               notes = ?,
               onboarding_token = ?,
               interview_date = ?,
               interviewer_name = ?,
               score_technical = ?,
               score_communication = ?,
               score_reliability = ?,
               score_culture_fit = ?,
               interview_overall_score = ?,
               offered_basic_salary = ?,
               offered_allowances = ?,
               contract_type = ?,
               contract_duration_months = ?,
               planned_join_date = ?,
               nik_ktp = COALESCE(NULLIF(?, ''), nik_ktp),
               npwp = COALESCE(NULLIF(?, ''), npwp),
               ptkp_status = COALESCE(NULLIF(?, ''), ptkp_status),
               bank_name = COALESCE(NULLIF(?, ''), bank_name),
               bank_account_number = COALESCE(NULLIF(?, ''), bank_account_number)
           WHERE id = ?`,
        ).run(
          nextStatus,
          notes !== undefined ? notes : existing.notes,
          token,
          interview_date ?? existing.interview_date ?? new Date().toISOString().split("T")[0],
          interviewer_name ?? existing.interviewer_name ?? getActor(req),
          sTech,
          sComm,
          sRel,
          sCult,
          overallScore,
          Number(offered_basic_salary ?? existing.offered_basic_salary ?? 0),
          Number(offered_allowances ?? existing.offered_allowances ?? 0),
          contract_type || existing.contract_type || "PKWT",
          Number(contract_duration_months ?? existing.contract_duration_months ?? 12),
          planned_join_date || existing.planned_join_date || null,
          nik_ktp ?? "",
          npwp ?? "",
          ptkp_status ?? "",
          bank_name ?? "",
          bank_account_number ?? "",
          req.params.id,
        );

        logAudit(
          getActor(req),
          "EVALUATE_CANDIDATE",
          "APPLICATION",
          req.params.id,
          `Evaluated ${existing.name}: Interview Score ${overallScore}/100, Offer Rp ${Number(offered_basic_salary || existing.offered_basic_salary || 0).toLocaleString("id-ID")} (${contract_type || existing.contract_type || "PKWT"}), Status -> ${nextStatus}`,
        );

        res.json({
          success: true,
          interview_overall_score: overallScore,
          status: nextStatus,
        });
      } catch (e: any) {
        console.error("Save candidate evaluation failed:", e);
        res.status(500).json({ error: e.message || "Failed to save candidate evaluation" });
      }
    });

    // Direct 1-Click HR Onboarding for ACCEPTED Candidates
    // Atomically synchronizes: users (NIP, KTP, NPWP, PTKP, Bank, Contract, Work Center) + hr_salaries + production_manpower + hr_kpis (Initial Probation Baseline) + hr_jobs (Quota Auto-Close)
    hrRouter.post(
      "/api/hr/applications/:id/onboard",
      requireRole(["FC", "HR", "ADMIN", "BOD", "DIRECTOR"]),
      async (req, res) => {
        try {
          const application = db
            .prepare(
              `SELECT a.*,
                      j.title as job_title,
                      j.department,
                      j.salary_min as job_salary_min,
                      j.employment_type_default as job_contract_type,
                      j.target_work_center_id as job_work_center_id,
                      j.headcount_quota as job_headcount_quota,
                      j.hired_count as job_hired_count
               FROM hr_applications a
               JOIN hr_jobs j ON a.job_id = j.id
               WHERE a.id = ?`,
            )
            .get(req.params.id) as any;

          if (!application) {
            return res.status(404).json({ error: "Application not found" });
          }

          const rawUsername = (
            req.body.username ||
            application.email?.split("@")[0] ||
            application.name?.toLowerCase().replace(/[^a-z0-9]/g, "")
          )
            .trim()
            .toLowerCase();

          const existingUser = db
            .prepare(`SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)`)
            .get(rawUsername) as any;

          if (existingUser) {
            return res.status(400).json({
              error: `Account with username '${rawUsername}' already exists in Directory.`,
            });
          }

          let role = req.body.role || "";
          if (!role) {
            const dept = (application.department || "").toUpperCase();
            if (dept.includes("ENG")) role = "ENGINEERING";
            else if (dept.includes("SALES")) role = "SALES";
            else if (dept.includes("PURCHAS") || dept.includes("PROC")) role = "PURCHASING";
            else if (dept.includes("WARE") || dept.includes("GUDANG") || dept.includes("LOGIST")) role = "WAREHOUSE";
            else if (dept.includes("PROD") || dept.includes("FABRIK") || dept.includes("PABRIK")) role = "PRODUCTION";
            else if (dept.includes("FIN")) role = "FINANCE";
            else if (dept.includes("HR") || dept.includes("SDM")) role = "HR";
            else role = "PRODUCTION";
          }

          const level = req.body.level || "STAFF";
          const basicSalary =
            Number(req.body.basic_salary) ||
            Number(application.offered_basic_salary) ||
            Number(application.job_salary_min) ||
            5000000;
          const allowances =
            req.body.allowances !== undefined
              ? Number(req.body.allowances)
              : Number(application.offered_allowances) || 500000;
          const hourlyRate =
            Number(req.body.hourly_rate) || Math.round(basicSalary / 173);

          const year = new Date().getFullYear();
          const totalUsersCount =
            ((db.prepare("SELECT COUNT(*) as cnt FROM users").get() as any)?.cnt || 0) + 1;
          const employeeNo =
            String(req.body.employee_no || "").trim() ||
            `EMP-${year}-${String(totalUsersCount).padStart(4, "0")}`;

          const nikKtp = String(req.body.nik_ktp ?? application.nik_ktp ?? "").trim();
          const npwp = String(req.body.npwp ?? application.npwp ?? "").trim();
          const ptkpStatus = String(
            req.body.ptkp_status || application.ptkp_status || "TK/0",
          ).trim();
          const bankName = String(
            req.body.bank_name ?? application.bank_name ?? "",
          ).trim();
          const bankAccountNumber = String(
            req.body.bank_account_number ?? application.bank_account_number ?? "",
          ).trim();
          const contractType = String(
            req.body.contract_type ||
              application.contract_type ||
              application.job_contract_type ||
              "PKWT",
          ).trim();
          const contractDurationMonths = Math.max(
            1,
            Number(
              req.body.contract_duration_months ??
                application.contract_duration_months ??
                12,
            ) || 12,
          );
          const joinDate =
            String(
              req.body.join_date ||
                application.planned_join_date ||
                new Date().toISOString().split("T")[0],
            ).trim();

          let contractEndDate = String(req.body.contract_end_date || "").trim();
          if (
            !contractEndDate &&
            (contractType === "PKWT" || contractType === "PROBATION")
          ) {
            const d = new Date(joinDate);
            if (!isNaN(d.getTime())) {
              d.setMonth(d.getMonth() + contractDurationMonths);
              contractEndDate = d.toISOString().split("T")[0];
            }
          }

          const workCenterId =
            role === "PRODUCTION"
              ? String(
                  req.body.work_center_id ||
                    application.job_work_center_id ||
                    "WC-FAB",
                ).trim()
              : null;

          const defaultPassword = req.body.password || "paving123";
          const hashedPassword = await bcrypt.hash(defaultPassword, 12);
          const userId =
            "USR-" + Math.random().toString(36).substr(2, 9).toUpperCase();

          let jobAutoClosed = false;
          let initialKpiCreated = false;

          db.transaction(() => {
            // 1. Insert Master Employee into users
            db.prepare(
              `INSERT INTO users (
                 id, username, password, name, role, level, status, is_approved,
                 employee_no, nik_ktp, npwp, ptkp_status, bank_name, bank_account_number,
                 contract_type, join_date, contract_end_date, work_center_id
               )
               VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              userId,
              rawUsername,
              hashedPassword,
              application.name,
              role,
              level,
              employeeNo,
              nikKtp || null,
              npwp || null,
              ptkpStatus,
              bankName || null,
              bankAccountNumber || null,
              contractType,
              joinDate,
              contractEndDate || null,
              workCenterId,
            );

            // 2. Insert Master Compensation & Tax Profile into hr_salaries
            db.prepare(
              `INSERT INTO hr_salaries (
                 employee_username, basic_salary, allowances, deductions,
                 ptkp_status, bpjs_kesehatan_active, bpjs_tk_active, updated_at
               )
               VALUES (?, ?, ?, 0, ?, 1, 1, CURRENT_TIMESTAMP)
               ON CONFLICT(employee_username) DO UPDATE SET
                 basic_salary = excluded.basic_salary,
                 allowances = excluded.allowances,
                 ptkp_status = excluded.ptkp_status,
                 updated_at = CURRENT_TIMESTAMP`,
            ).run(rawUsername, basicSalary, allowances, ptkpStatus);

            // 3. Register Shop Floor Operator in production_manpower ONLY when role is OPERATOR
            if (role === "OPERATOR") {
              const mpId =
                "MP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
              db.prepare(
                `INSERT INTO production_manpower (
                   id, user_username, name, role, skill_level, status, hourly_rate, work_center_id
                 )
                 VALUES (?, ?, ?, ?, ?, 'AVAILABLE', ?, ?)
                 ON CONFLICT(id) DO NOTHING`,
              ).run(
                mpId,
                rawUsername,
                application.name,
                application.job_title || "Operator Produksi",
                level === "MANAGER" ? "Supervisor" : "Senior",
                hourlyRate,
                workCenterId,
              );
            }

            // 4. Seed Initial Probation Baseline KPI from Interview Scorecard
            const sTechRaw = Number(application.score_technical || 0);
            const sCommRaw = Number(application.score_communication || 0);
            const sRelRaw = Number(application.score_reliability || 0);
            const sCultRaw = Number(application.score_culture_fit || 0);
            if (sTechRaw > 0 || sCommRaw > 0 || sRelRaw > 0 || sCultRaw > 0) {
              const toFive = (v: number) =>
                v > 5
                  ? Math.max(1, Math.min(5, Math.round(v / 20)))
                  : Math.max(1, Math.min(5, Math.round(v || 4)));
              const kpiComm = toFive(sCommRaw || 80);
              const kpiTech = toFive(sTechRaw || 80);
              const kpiRel = toFive(sRelRaw || 80);
              const kpiProd = toFive(Math.round(((sTechRaw || 80) + (sRelRaw || 80)) / 2));
              const kpiLead = toFive(sCultRaw || 80);
              const kpiOverall = Number(
                ((kpiComm + kpiProd + kpiRel + kpiLead + kpiTech) / 5).toFixed(2),
              );

              const actorName = getActor(req);
              const validEvaluator =
                (
                  db
                    .prepare(
                      "SELECT username FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1",
                    )
                    .get(actorName) as any
                )?.username ||
                (
                  db
                    .prepare(
                      "SELECT username FROM users WHERE role IN ('HR', 'FC', 'ADMIN') LIMIT 1",
                    )
                    .get() as any
                )?.username ||
                rawUsername;

              const kpiId =
                "KPI-" + Math.random().toString(36).substr(2, 9).toUpperCase();
              db.prepare(
                `INSERT INTO hr_kpis (
                   id, employee_username, evaluator_username, period_name,
                   score_communication, score_productivity, score_reliability, score_leadership, score_technical,
                   overall_score, evaluation_notes
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              ).run(
                kpiId,
                rawUsername,
                validEvaluator,
                `Initial Onboarding Baseline (${year})`,
                kpiComm,
                kpiProd,
                kpiRel,
                kpiLead,
                kpiTech,
                kpiOverall,
                `Otomatis dikonversi dari Scorecard Interview Rekrutmen (${application.interview_overall_score || 80}/100) untuk evaluasi masa percobaan (${contractType}).`,
              );
              initialKpiCreated = true;
            }

            // 5. Mark application as ACCEPTED + Onboarded
            db.prepare(
              `UPDATE hr_applications
               SET status = 'ACCEPTED',
                   token_used = 1,
                   nik_ktp = COALESCE(NULLIF(?, ''), nik_ktp),
                   npwp = COALESCE(NULLIF(?, ''), npwp),
                   ptkp_status = COALESCE(NULLIF(?, ''), ptkp_status),
                   bank_name = COALESCE(NULLIF(?, ''), bank_name),
                   bank_account_number = COALESCE(NULLIF(?, ''), bank_account_number)
               WHERE id = ?`,
            ).run(
              nikKtp,
              npwp,
              ptkpStatus,
              bankName,
              bankAccountNumber,
              application.id,
            );

            // 6. Increment Vacancy hired_count & Auto-Close if Quota Reached
            const currentJob = db
              .prepare("SELECT id, headcount_quota, hired_count, status FROM hr_jobs WHERE id = ?")
              .get(application.job_id) as any;
            if (currentJob) {
              const quota = Math.max(1, Number(currentJob.headcount_quota) || 1);
              const newHired = (Number(currentJob.hired_count) || 0) + 1;
              const nextJobStatus = newHired >= quota ? "CLOSED" : currentJob.status;
              if (nextJobStatus === "CLOSED" && currentJob.status === "OPEN") {
                jobAutoClosed = true;
              }
              db.prepare(
                `UPDATE hr_jobs SET hired_count = ?, status = ? WHERE id = ?`,
              ).run(newHired, nextJobStatus, currentJob.id);
            }
          })();

          logAudit(
            getActor(req),
            "ONBOARD_CANDIDATE",
            "USER",
            userId,
            `Onboarded candidate ${application.name} (@${rawUsername}, NIP: ${employeeNo}) to ${role} (${contractType}) with salary Rp ${basicSalary.toLocaleString("id-ID")}`,
          );

          res.json({
            success: true,
            user_id: userId,
            username: rawUsername,
            employee_no: employeeNo,
            role,
            job_auto_closed: jobAutoClosed,
            initial_kpi_created: initialKpiCreated,
            message: `Kandidat ${application.name} (@${rawUsername} • ${employeeNo}) berhasil di-onboard ke Master Karyawan, Payroll${role === "OPERATOR" ? `, ManPower & Work Center ${workCenterId}` : ""}${initialKpiCreated ? ", & Baseline KPI" : ""}!${jobAutoClosed ? " Kuota lowongan terpenuhi dan otomatis ditutup (CLOSED)." : ""}`,
          });
        } catch (e: any) {
          console.error("Candidate direct onboarding failed:", e);
          res.status(500).json({ error: e.message || "Failed to onboard candidate" });
        }
      },
    );

    // HR Directory Employee Creation & Profile Management (Syncs users + hr_salaries + production_manpower)
    hrRouter.post(
      "/api/hr/directory",
      requireRole(["FC", "HR", "ADMIN", "BOD", "DIRECTOR"]),
      async (req, res) => {
        try {
          const {
            username,
            name,
            password,
            role,
            level,
            status,
            basic_salary,
            allowances,
            deductions,
            hourly_rate,
            employee_no,
            nik_ktp,
            npwp,
            ptkp_status,
            bank_name,
            bank_account_number,
            contract_type,
            join_date,
            contract_end_date,
            work_center_id,
          } = req.body;

          if (!username || !name) {
            return res.status(400).json({ error: "Username and full name are required" });
          }

          const cleanUsername = String(username).trim().toLowerCase();
          const existing = db
            .prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")
            .get(cleanUsername);
          if (existing) {
            return res.status(400).json({ error: "Username already exists" });
          }

          const userId = "USR-" + Math.random().toString(36).substr(2, 9).toUpperCase();
          const hashedPassword = await bcrypt.hash(password || "paving123", 12);
          const empRole = role || "PRODUCTION";
          const empLevel = level || "STAFF";
          const empStatus = status || "APPROVED";
          const isApproved = empStatus === "APPROVED" ? 1 : 0;
          const baseSal = Number(basic_salary) || 0;
          const allowSal = Number(allowances) || 0;
          const dedSal = Number(deductions) || 0;
          const hrRate = Number(hourly_rate) || (baseSal > 0 ? Math.round(baseSal / 173) : 45000);

          const year = new Date().getFullYear();
          const totalUsersCount =
            ((db.prepare("SELECT COUNT(*) as cnt FROM users").get() as any)?.cnt || 0) + 1;
          const finalEmployeeNo =
            String(employee_no || "").trim() ||
            `EMP-${year}-${String(totalUsersCount).padStart(4, "0")}`;
          const finalPtkp = String(ptkp_status || "TK/0").trim();
          const finalContractType = String(contract_type || "PKWT").trim();
          const finalJoinDate =
            String(join_date || new Date().toISOString().split("T")[0]).trim();
          const finalWorkCenter =
            empRole === "OPERATOR" || empRole === "PRODUCTION"
              ? String(work_center_id || "WC-FAB").trim()
              : null;

          db.transaction(() => {
            db.prepare(
              `INSERT INTO users (
                 id, username, password, name, role, level, status, is_approved,
                 employee_no, nik_ktp, npwp, ptkp_status, bank_name, bank_account_number,
                 contract_type, join_date, contract_end_date, work_center_id
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              userId,
              cleanUsername,
              hashedPassword,
              name.trim(),
              empRole,
              empLevel,
              empStatus,
              isApproved,
              finalEmployeeNo,
              nik_ktp ? String(nik_ktp).trim() : null,
              npwp ? String(npwp).trim() : null,
              finalPtkp,
              bank_name ? String(bank_name).trim() : null,
              bank_account_number ? String(bank_account_number).trim() : null,
              finalContractType,
              finalJoinDate,
              contract_end_date ? String(contract_end_date).trim() : null,
              finalWorkCenter,
            );

            db.prepare(
              `INSERT INTO hr_salaries (
                 employee_username, basic_salary, allowances, deductions,
                 ptkp_status, bpjs_kesehatan_active, bpjs_tk_active, updated_at
               )
               VALUES (?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP)
               ON CONFLICT(employee_username) DO UPDATE SET
                 basic_salary = excluded.basic_salary,
                 allowances = excluded.allowances,
                 deductions = excluded.deductions,
                 ptkp_status = excluded.ptkp_status,
                 updated_at = CURRENT_TIMESTAMP`,
            ).run(cleanUsername, baseSal, allowSal, dedSal, finalPtkp);

            if (empRole === "OPERATOR") {
              const existingMp = db
                .prepare("SELECT id FROM production_manpower WHERE LOWER(user_username) = LOWER(?)")
                .get(cleanUsername) as any;
              if (!existingMp) {
                const mpId = "MP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
                db.prepare(
                  `INSERT INTO production_manpower (
                     id, user_username, nik, name, role, role_title, skill_level, specialization, status, hourly_rate, work_center_id
                   )
                   VALUES (?, ?, ?, ?, 'Operator Produksi', 'Production Operator', ?, 'Machining (CNC / Milling)', ?, ?, ?)`,
                ).run(
                  mpId,
                  cleanUsername,
                  finalEmployeeNo,
                  name.trim(),
                  empLevel === "MANAGER" ? "MASTER" : "SENIOR",
                  empStatus === "APPROVED" ? "AVAILABLE" : "INACTIVE",
                  hrRate,
                  finalWorkCenter,
                );
              }
            }
          })();

          logAudit(
            getActor(req),
            "CREATE_DIRECTORY_EMPLOYEE",
            "USER",
            userId,
            `Added employee ${name} (@${cleanUsername}, NIP: ${finalEmployeeNo}) in ${empRole}`,
          );

          res.json({
            success: true,
            id: userId,
            username: cleanUsername,
            employee_no: finalEmployeeNo,
          });
        } catch (e: any) {
          console.error("Create directory employee failed:", e);
          res.status(500).json({ error: e.message || "Failed to create employee" });
        }
      },
    );

    hrRouter.put(
      "/api/hr/directory/:id",
      requireRole(["FC", "HR", "ADMIN", "BOD", "DIRECTOR"]),
      async (req, res) => {
        try {
          const {
            name,
            role,
            level,
            status,
            basic_salary,
            allowances,
            deductions,
            hourly_rate,
            password,
            employee_no,
            nik_ktp,
            npwp,
            ptkp_status,
            bank_name,
            bank_account_number,
            contract_type,
            join_date,
            contract_end_date,
            work_center_id,
          } = req.body;

          const targetUser = db
            .prepare("SELECT * FROM users WHERE id = ? OR LOWER(username) = LOWER(?)")
            .get(req.params.id, req.params.id) as any;

          if (!targetUser) {
            return res.status(404).json({ error: "Employee not found" });
          }

          const updatedName = name !== undefined ? String(name).trim() : targetUser.name;
          const updatedRole = role || targetUser.role;
          const updatedLevel = level || targetUser.level || "STAFF";
          const updatedStatus = status || targetUser.status || "APPROVED";
          const isApproved = updatedStatus === "APPROVED" ? 1 : 0;
          const updatedEmpNo =
            employee_no !== undefined ? String(employee_no).trim() : targetUser.employee_no;
          const updatedNik =
            nik_ktp !== undefined ? String(nik_ktp).trim() : targetUser.nik_ktp;
          const updatedNpwp =
            npwp !== undefined ? String(npwp).trim() : targetUser.npwp;
          const updatedPtkp =
            ptkp_status !== undefined
              ? String(ptkp_status).trim()
              : targetUser.ptkp_status || "TK/0";
          const updatedBankName =
            bank_name !== undefined ? String(bank_name).trim() : targetUser.bank_name;
          const updatedBankNo =
            bank_account_number !== undefined
              ? String(bank_account_number).trim()
              : targetUser.bank_account_number;
          const updatedContractType =
            contract_type !== undefined
              ? String(contract_type).trim()
              : targetUser.contract_type || "PKWT";
          const updatedJoinDate =
            join_date !== undefined ? String(join_date).trim() : targetUser.join_date;
          const updatedContractEndDate =
            contract_end_date !== undefined
              ? String(contract_end_date).trim()
              : targetUser.contract_end_date;
          const updatedWorkCenter =
            work_center_id !== undefined
              ? work_center_id || null
              : targetUser.work_center_id || null;

          db.transaction(() => {
            db.prepare(
              `UPDATE users
               SET name = ?, role = ?, level = ?, status = ?, is_approved = ?,
                   employee_no = ?, nik_ktp = ?, npwp = ?, ptkp_status = ?,
                   bank_name = ?, bank_account_number = ?, contract_type = ?,
                   join_date = ?, contract_end_date = ?, work_center_id = ?
               WHERE id = ?`,
            ).run(
              updatedName,
              updatedRole,
              updatedLevel,
              updatedStatus,
              isApproved,
              updatedEmpNo || null,
              updatedNik || null,
              updatedNpwp || null,
              updatedPtkp,
              updatedBankName || null,
              updatedBankNo || null,
              updatedContractType,
              updatedJoinDate || null,
              updatedContractEndDate || null,
              updatedWorkCenter,
              targetUser.id,
            );

            if (
              basic_salary !== undefined ||
              allowances !== undefined ||
              deductions !== undefined ||
              ptkp_status !== undefined
            ) {
              const curSal = db
                .prepare("SELECT * FROM hr_salaries WHERE LOWER(employee_username) = LOWER(?)")
                .get(targetUser.username) as any;
              const newBasic =
                basic_salary !== undefined
                  ? Number(basic_salary)
                  : Number(curSal?.basic_salary || 0);
              const newAllow =
                allowances !== undefined
                  ? Number(allowances)
                  : Number(curSal?.allowances || 0);
              const newDed =
                deductions !== undefined
                  ? Number(deductions)
                  : Number(curSal?.deductions || 0);

              db.prepare(
                `INSERT INTO hr_salaries (
                   employee_username, basic_salary, allowances, deductions, ptkp_status, updated_at
                 )
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(employee_username) DO UPDATE SET
                   basic_salary = excluded.basic_salary,
                   allowances = excluded.allowances,
                   deductions = excluded.deductions,
                   ptkp_status = excluded.ptkp_status,
                   updated_at = CURRENT_TIMESTAMP`,
              ).run(targetUser.username, newBasic, newAllow, newDed, updatedPtkp);
            }

            // Sync with production_manpower
            const existingMp = db
              .prepare("SELECT * FROM production_manpower WHERE LOWER(user_username) = LOWER(?)")
              .get(targetUser.username) as any;

            const calcRate =
              hourly_rate !== undefined
                ? Number(hourly_rate)
                : basic_salary !== undefined && Number(basic_salary) > 0
                  ? Math.round(Number(basic_salary) / 173)
                  : existingMp?.hourly_rate || 45000;

            if (updatedRole === "OPERATOR") {
              if (existingMp) {
                const mpStatus =
                  updatedStatus !== "APPROVED"
                    ? "INACTIVE"
                    : existingMp.status === "INACTIVE"
                      ? "AVAILABLE"
                      : existingMp.status;
                db.prepare(
                  `UPDATE production_manpower
                   SET name = ?, status = ?, hourly_rate = ?, work_center_id = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?`,
                ).run(
                  updatedName,
                  mpStatus,
                  calcRate,
                  updatedWorkCenter || existingMp.work_center_id || "WC-FAB",
                  existingMp.id,
                );
              } else {
                const mpId = "MP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
                db.prepare(
                  `INSERT INTO production_manpower (
                     id, user_username, nik, name, role, role_title, skill_level, specialization, status, hourly_rate, work_center_id
                   )
                   VALUES (?, ?, ?, ?, 'Operator Produksi', 'Production Operator', ?, 'Machining (CNC / Milling)', ?, ?, ?)`,
                ).run(
                  mpId,
                  targetUser.username,
                  updatedEmpNo || `MP-${new Date().getFullYear()}-099`,
                  updatedName,
                  updatedLevel === "MANAGER" ? "MASTER" : "SENIOR",
                  updatedStatus === "APPROVED" ? "AVAILABLE" : "INACTIVE",
                  calcRate,
                  updatedWorkCenter || "WC-FAB",
                );
              }
            } else if (existingMp) {
              // Back-Office roles do not belong in production_manpower
              db.prepare(`DELETE FROM production_manpower_assignments WHERE manpower_id = ?`).run(existingMp.id);
              db.prepare(`DELETE FROM production_manpower WHERE id = ?`).run(existingMp.id);
            }
          })();

          if (password && String(password).trim().length >= 4) {
            const hashed = await bcrypt.hash(String(password).trim(), 12);
            db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, targetUser.id);
          }

          logAudit(
            getActor(req),
            "UPDATE_DIRECTORY_EMPLOYEE",
            "USER",
            targetUser.id,
            `Updated employee profile @${targetUser.username} (Role: ${updatedRole}, Level: ${updatedLevel}, Status: ${updatedStatus})`,
          );

          res.json({ success: true });
        } catch (e: any) {
          console.error("Update directory employee failed:", e);
          res.status(500).json({ error: e.message || "Failed to update employee profile" });
        }
      },
    );

    hrRouter.post("/api/auth/exchange-token", async (req, res) => {
      try {
        const { token, password } = req.body;
        const application = db
          .prepare(
            `SELECT a.*, j.title as job_title, j.department FROM hr_applications a JOIN hr_jobs j ON a.job_id = j.id WHERE a.onboarding_token = ? AND a.token_used = 0 AND a.status = 'ACCEPTED'`,
          )
          .get(token) as any;

        if (!application) {
          return res
            .status(400)
            .json({ error: "Invalid, expired, or already used token." });
        }

        const existingUser = db
          .prepare(`SELECT id FROM users WHERE username = ?`)
          .get(application.email);
        if (existingUser) {
          return res
            .status(400)
            .json({ error: "Account already exists for this email." });
        }

        const userId =
          "USR-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        const hashedPassword = await bcrypt.hash(password, 12);

        let role = "STAFF";
        const dept = (application.department || "").toUpperCase();
        if (dept.includes("ENG")) role = "ENGINEERING";
        else if (dept.includes("SALES")) role = "SALES";
        else if (dept.includes("PURCHAS") || dept.includes("PROC")) role = "PURCHASING";
        else if (dept.includes("WARE") || dept.includes("GUDANG")) role = "WAREHOUSE";
        else if (dept.includes("PROD") || dept.includes("FABRIK")) role = "PRODUCTION";
        else if (dept.includes("HR") || dept.includes("SDM")) role = "HR";
        else role = "STAFF";

        db.transaction(() => {
          db.prepare(
            `
            INSERT INTO users (id, username, password, name, role, level, status, is_approved)
            VALUES (?, ?, ?, ?, ?, 'STAFF', 'APPROVED', 1)
          `,
          ).run(
            userId,
            application.email,
            hashedPassword,
            application.name,
            role,
          );

          db.prepare(
            `INSERT INTO hr_salaries (employee_username, basic_salary, allowances, deductions, updated_at)
             VALUES (?, 5000000, 500000, 0, CURRENT_TIMESTAMP)
             ON CONFLICT(employee_username) DO NOTHING`,
          ).run(application.email);

          if (role === "OPERATOR") {
            const mpId = "MP-" + Math.random().toString(36).substr(2, 9).toUpperCase();
            db.prepare(
              `INSERT INTO production_manpower (id, user_username, name, role, skill_level, status, hourly_rate)
               VALUES (?, ?, ?, ?, 'Senior', 'AVAILABLE', 45000)`,
            ).run(mpId, application.email, application.name, application.job_title || "Operator Produksi");
          }

          db.prepare(
            `UPDATE hr_applications SET token_used = 1 WHERE id = ?`,
          ).run(application.id);
        })();

        logAudit(
          application.email,
          "ONBOARDING_TOKEN_EXCHANGED",
          "USER",
          userId,
          `User created account using onboarding token.`,
        );
        res.json({
          success: true,
          message: "Account created successfully. You can now login.",
        });
      } catch (e: any) {
        console.error("Token exchange failed:", e);
        res.status(500).json({ error: "Failed to exchange token" });
      }
    });

    // 3. Employee KPI Appraisal Performance Reviews
    hrRouter.get("/api/hr/kpis", (req, res) => {
      try {
        const { employee } = req.query;
        let kpis;
        if (employee) {
          kpis = db
            .prepare(
              `
            SELECT k.*,
                   COALESCE(u.name, k.employee_username) as employee_name,
                   COALESCE(ev.name, k.evaluator_username) as evaluator_name
            FROM hr_kpis k
            LEFT JOIN users u ON LOWER(k.employee_username) = LOWER(u.username)
            LEFT JOIN users ev ON LOWER(k.evaluator_username) = LOWER(ev.username)
            WHERE LOWER(k.employee_username) = LOWER(?)
            ORDER BY k.created_at DESC
          `,
            )
            .all(employee);
        } else {
          kpis = db
            .prepare(
              `
            SELECT k.*,
                   COALESCE(u.name, k.employee_username) as employee_name,
                   COALESCE(ev.name, k.evaluator_username) as evaluator_name
            FROM hr_kpis k
            LEFT JOIN users u ON LOWER(k.employee_username) = LOWER(u.username)
            LEFT JOIN users ev ON LOWER(k.evaluator_username) = LOWER(ev.username)
            ORDER BY k.created_at DESC
          `,
            )
            .all();
        }
        res.json(kpis);
      } catch (e: any) {
        console.error("Fetch KPIs failed:", e);
        res.status(500).json({ error: "Failed to fetch appraisal ratings" });
      }
    });

    hrRouter.post("/api/hr/kpis", (req, res) => {
      try {
        const {
          employee_username,
          period_name,
          score_communication,
          score_productivity,
          score_reliability,
          score_leadership,
          score_technical,
          evaluation_notes,
        } = req.body;

        const evaluator = getActor(req);

        if (!employee_username || !period_name) {
          return res
            .status(400)
            .json({ error: "Employee and Appraisal Period Name are required" });
        }

        const id =
          "KPI-" + Math.random().toString(36).substr(2, 9).toUpperCase();

        const c = Number(score_communication || 0);
        const p = Number(score_productivity || 0);
        const r = Number(score_reliability || 0);
        const l = Number(score_leadership || 0);
        const t = Number(score_technical || 0);
        const overall = Number(((c + p + r + l + t) / 5).toFixed(2));

        db.prepare(
          `
          INSERT INTO hr_kpis (id, employee_username, evaluator_username, period_name, score_communication, score_productivity, score_reliability, score_leadership, score_technical, overall_score, evaluation_notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          id,
          employee_username,
          evaluator,
          period_name,
          c,
          p,
          r,
          l,
          t,
          overall,
          evaluation_notes || "",
        );

        logAudit(
          evaluator,
          "SUBMIT_KPI",
          "USER",
          employee_username,
          `Submitted KPI review for period ${period_name} with score ${overall}`,
        );
        res.json({ success: true, id, overall_score: overall });
      } catch (e: any) {
        console.error("Create KPI appraisal failed:", e);
        res.status(500).json({ error: "Failed to submit employee evaluation" });
      }
    });

    // 4. Employee Handover Task Tracker
    hrRouter.get("/api/hr/handovers", (req, res) => {
      try {
        const handovers = db
          .prepare(
            `
          SELECT h.*,
                 COALESCE(u1.name, h.resigning_username) as resigning_name,
                 COALESCE(u2.name, h.successor_username) as successor_name
          FROM hr_handovers h
          LEFT JOIN users u1 ON LOWER(h.resigning_username) = LOWER(u1.username)
          LEFT JOIN users u2 ON LOWER(h.successor_username) = LOWER(u2.username)
          ORDER BY h.created_at DESC
        `,
          )
          .all();
        res.json(handovers);
      } catch (e: any) {
        console.error("Fetch handovers failed:", e);
        res
          .status(500)
          .json({ error: "Failed to retrieve employee handover documents" });
      }
    });

    hrRouter.post("/api/hr/handovers", (req, res) => {
      try {
        const {
          resigning_username,
          successor_username,
          target_last_date,
          handover_notes,
          checklist_json,
        } = req.body;
        if (!resigning_username || !successor_username || !target_last_date) {
          return res
            .status(400)
            .json({
              error:
                "Resigning username, successor username, and target date are required",
            });
        }
        const id =
          "HO-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        db.prepare(
          `
          INSERT INTO hr_handovers (id, resigning_username, successor_username, target_last_date, status, handover_notes, checklist_json)
          VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
        `,
        ).run(
          id,
          resigning_username,
          successor_username,
          target_last_date,
          handover_notes || "",
          checklist_json || "[]",
        );

        logAudit(
          getActor(req),
          "CREATE_HANDOVER",
          "USER",
          resigning_username,
          `Initiated exit transition handover to ${successor_username}`,
        );
        res.json({ success: true, id });
      } catch (e: any) {
        console.error("Create handover failed:", e);
        res
          .status(500)
          .json({ error: "Failed to instantiate handover tracker" });
      }
    });

    hrRouter.put("/api/hr/handovers/:id", (req, res) => {
      try {
        const { status, handover_notes, checklist_json } = req.body;
        const handover = db
          .prepare("SELECT * FROM hr_handovers WHERE id = ?")
          .get(req.params.id) as any;

        if (!handover) {
          return res.status(404).json({ error: "Handover document not found" });
        }

        db.transaction(() => {
          db.prepare(
            `
            UPDATE hr_handovers
            SET status = ?, handover_notes = ?, checklist_json = ?
            WHERE id = ?
          `,
          ).run(status, handover_notes, checklist_json, req.params.id);

          // Automatically deactivate resigning employee account & shop floor availability when handover is 100% COMPLETED
          if (status === "COMPLETED" && handover.resigning_username) {
            db.prepare(
              `UPDATE users SET status = 'INACTIVE', is_approved = 0 WHERE LOWER(username) = LOWER(?)`,
            ).run(handover.resigning_username);

            try {
              db.prepare(
                `UPDATE production_manpower SET status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP WHERE LOWER(user_username) = LOWER(?)`,
              ).run(handover.resigning_username);
            } catch (_) {}
          }
        })();

        logAudit(
          getActor(req),
          "UPDATE_HANDOVER",
          "USER",
          req.params.id,
          `Updated handover progress to status: ${status}${status === "COMPLETED" ? ` (Auto-deactivated @${handover.resigning_username})` : ""}`,
        );
        res.json({
          success: true,
          offboarded_user: status === "COMPLETED" ? handover.resigning_username : null,
        });
      } catch (e: any) {
        console.error("Update handover document failed:", e);
        res
          .status(500)
          .json({ error: "Failed to modify handover tracking logs" });
      }
    });

    // 5. Attendance & Time Tracking
    hrRouter.use(hrAttendanceRouter);

    // 6. Leave Management (Cuti)
    hrRouter.get("/api/hr/leaves", (req, res) => {
      try {
        const leaves = db
          .prepare(
            `
          SELECT l.*,
                 COALESCE(u.name, l.employee_username) as employee_name,
                 u.role as employee_role,
                 u.level as employee_level,
                 COALESCE(approver.name, l.approved_by) as approver_name
          FROM hr_leaves l
          LEFT JOIN users u ON LOWER(l.employee_username) = LOWER(u.username)
          LEFT JOIN users approver ON LOWER(l.approved_by) = LOWER(approver.username)
          ORDER BY l.created_at DESC
        `,
          )
          .all();
        res.json(leaves);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch leaves" });
      }
    });

    hrRouter.post("/api/hr/leaves", (req, res) => {
      try {
        const { employee_username, leave_type, start_date, end_date } =
          req.body;
        if (!employee_username || !start_date || !end_date) {
          return res.status(400).json({
            error: "Username karyawan, tanggal mulai, dan tanggal selesai wajib diisi.",
          });
        }
        if (String(start_date) > String(end_date)) {
          return res.status(400).json({
            error: "Tanggal selesai cuti tidak boleh lebih awal dari tanggal mulai.",
          });
        }

        // Prevent overlapping active leave requests for the same employee
        const overlappingLeave = db
          .prepare(
            `SELECT id, start_date, end_date, status FROM hr_leaves
             WHERE LOWER(employee_username) = LOWER(?)
               AND status IN ('PENDING', 'APPROVED')
               AND start_date <= ? AND end_date >= ?
             LIMIT 1`,
          )
          .get(employee_username, end_date, start_date) as any;

        if (overlappingLeave) {
          return res.status(400).json({
            error: `Terdapat pengajuan cuti aktif (${overlappingLeave.status}) yang beririsan pada rentang tanggal ${overlappingLeave.start_date} s/d ${overlappingLeave.end_date}.`,
          });
        }

        const reason = req.body.reason ? String(req.body.reason).trim() : null;
        const id =
          "LV-" + Math.random().toString(36).substr(2, 9).toUpperCase();

        // Check if applicant is Manager or FC
        let initialStatus = "PENDING";
        let approvedBy = null;
        let managerNote = null;

        if (employee_username) {
          const emp = db
            .prepare(
              `SELECT username, role, level FROM users WHERE LOWER(username) = LOWER(?)`,
            )
            .get(employee_username) as any;
          if (
            emp &&
            (emp.level === "MANAGER" ||
              emp.role === "FC" ||
              emp.role === "GOD_MODE")
          ) {
            initialStatus = "APPROVED";
            approvedBy = emp.username;
            managerNote =
              "Otomatis disetujui (Hak Akses Manager / FC - Tanpa Approval)";
          }
        }

        db.prepare(
          `
          INSERT INTO hr_leaves (id, employee_username, leave_type, start_date, end_date, reason, status, approved_by, manager_note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          id,
          employee_username,
          leave_type,
          start_date,
          end_date,
          reason,
          initialStatus,
          approvedBy,
          managerNote,
        );

        syncCollectionToFirestore("hr_leaves", id, {
          id,
          employee_username,
          leave_type,
          start_date,
          end_date,
          reason,
          status: initialStatus,
          approved_by: approvedBy,
          manager_note: managerNote,
          created_at: new Date().toISOString()
        });

        res.json({
          success: true,
          id,
          auto_approved: initialStatus === "APPROVED",
          status: initialStatus,
          message:
            initialStatus === "APPROVED"
              ? "Pengajuan cuti langsung disetujui secara otomatis (Akses Level Manager / FC)."
              : "Permohonan cuti berhasil diajukan dan dikirim ke Manager untuk persetujuan.",
        });
      } catch (e: any) {
        console.error("Failed to submit leave request:", e);
        res.status(500).json({ error: "Failed to submit leave request" });
      }
    });

    hrRouter.put("/api/hr/leaves/:id/status", (req, res) => {
      try {
        const { status, manager_note } = req.body;
        const approved_by = getActor(req);

        try {
          db.prepare(
            `
            UPDATE hr_leaves SET status = ?, approved_by = ?, manager_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
          `,
          ).run(status, approved_by, manager_note || null, req.params.id);
        } catch (err) {
          db.prepare(
            `
            UPDATE hr_leaves SET status = ?, approved_by = ? WHERE id = ?
          `,
          ).run(status, approved_by, req.params.id);
        }

        // Sync production manpower status if employee is in shop floor and leave covers today
        try {
          const leaveRec = db.prepare("SELECT employee_username, start_date, end_date FROM hr_leaves WHERE id = ?").get(req.params.id) as any;
          if (leaveRec && leaveRec.employee_username) {
            const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
            const isCurrentlyOnLeave =
              status === "APPROVED" &&
              String(leaveRec.start_date) <= todayStr &&
              String(leaveRec.end_date) >= todayStr;
            const newMpStatus = isCurrentlyOnLeave ? "ON_LEAVE" : "AVAILABLE";
            db.prepare(
              "UPDATE production_manpower SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE LOWER(user_username) = LOWER(?)"
            ).run(newMpStatus, leaveRec.employee_username);
          }
        } catch (mpErr) {
          // ignore if user not in manpower
        }

        syncCollectionToFirestore("hr_leaves", req.params.id, {
          id: req.params.id,
          status,
          approved_by,
          manager_note: manager_note || null,
          updated_at: new Date().toISOString()
        });

        res.json({ success: true });
      } catch (e: any) {
        res.status(500).json({ error: "Failed to update leave status" });
      }
    });

    // 7. Payslips (Gaji)
    hrRouter.get("/api/hr/payslips", (req, res) => {
      try {
        const username = getActor(req);
        const user = db
          .prepare("SELECT role, level FROM users WHERE LOWER(username) = LOWER(?)")
          .get(username) as any;

        const isAdmin =
          user &&
          (["HR", "FC", "FINANCE", "ADMIN", "BOD", "DIRECTOR", "SUPERADMIN", "GOD_MODE"].includes(user.role) ||
            user.level === "MANAGER");

        let query = `
          SELECT p.*, COALESCE(u.name, p.employee_username) as employee_name
          FROM hr_payslips p
          LEFT JOIN users u ON LOWER(p.employee_username) = LOWER(u.username)
        `;

        if (!isAdmin) {
          query += ` WHERE LOWER(p.employee_username) = LOWER(@username) AND p.status IN ('PUBLISHED', 'PAID') `;
        }

        query += ` ORDER BY p.period_month DESC `;

        const payslips = db.prepare(query).all(isAdmin ? {} : { username });
        res.json(payslips);
      } catch (e: any) {
        res.status(500).json({ error: "Failed to fetch payslips" });
      }
    });

    hrRouter.post("/api/hr/payslips", requireRole(["HR", "FC"]), (req, res) => {
      try {
        const {
          employee_username,
          period_month,
          basic_salary,
          allowances,
          deductions,
        } = req.body;
        if (!employee_username || !period_month) {
          return res.status(400).json({
            error: "Username karyawan dan periode bulan wajib diisi.",
          });
        }
        const net_salary =
          (Number(basic_salary) || 0) +
          (Number(allowances) || 0) -
          (Number(deductions) || 0);

        const id =
          "PAY-" + Math.random().toString(36).substr(2, 9).toUpperCase();

        db.transaction(() => {
          const existingSlip = db
            .prepare(
              `SELECT id FROM hr_payslips
               WHERE LOWER(employee_username) = LOWER(?) AND LOWER(TRIM(period_month)) = LOWER(TRIM(?))
               LIMIT 1`,
            )
            .get(employee_username, period_month) as any;

          if (existingSlip) {
            throw new Error(
              `Slip gaji untuk ${employee_username} pada periode ${period_month} sudah pernah diterbitkan.`,
            );
          }

          db.prepare(
            `
            INSERT INTO hr_payslips (id, employee_username, period_month, basic_salary, allowances, deductions, net_salary, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')
          `,
          ).run(
            id,
            employee_username,
            period_month,
            basic_salary,
            allowances,
            deductions,
            net_salary,
          );

          // Get employee name for details
          const emp = db
            .prepare("SELECT name FROM users WHERE username = ?")
            .get(employee_username) as any;
          const empName = emp ? emp.name : employee_username;

          const details = [
            {
              username: employee_username,
              name: empName,
              base_salary: basic_salary,
              present_days: 22,
              allowances: allowances,
              deductions: deductions,
              net_pay: net_salary,
            },
          ];

          const payrollId =
            "PAY-" + Math.random().toString(36).substr(2, 9).toUpperCase();
          db.prepare(
            `
            INSERT INTO finance_payroll (id, period_name, total_amount, details_json, status)
            VALUES (?, ?, ?, ?, 'DRAFTED')
          `,
          ).run(
            payrollId,
            `Ad-hoc ${period_month} (${empName})`,
            net_salary,
            JSON.stringify(details),
          );

          const nowIso = new Date().toISOString();
          syncCollectionToFirestore("hr_payslips", id, {
            id,
            employee_username,
            period_month,
            basic_salary,
            allowances,
            deductions,
            net_salary,
            status: 'PUBLISHED',
            created_at: nowIso
          });
          syncCollectionToFirestore("finance_payroll", payrollId, {
            id: payrollId,
            period_name: `Ad-hoc ${period_month} (${empName})`,
            total_amount: net_salary,
            details_json: details,
            status: 'DRAFTED',
            created_at: nowIso
          });
        })();

        res.json({ success: true, id });
      } catch (e: any) {
        if (e.message?.includes("sudah pernah diterbitkan")) {
          return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: "Failed to generate payslip" });
      }
    });


