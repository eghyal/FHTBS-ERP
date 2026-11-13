import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole } from "../../middleware/auth.ts";
import { calculateFinancialBreakdown } from "../../lib/financialEngine.ts";
import { runScoutIntelligence } from "../../lib/scoutIntelligence.ts";
import { cacheService } from "../../services/cacheService.ts";
import { outboxService } from "../../services/outboxService.ts";
import {
  getNextEntitySequence,
  generateSmartCustomerCode,
} from "../../utils/autoCoding.ts";
import crypto from "crypto";

export function registerScoutLeadsRoutes(salesRouter: Router) {
  salesRouter.get(
    "/api/sales/leads",
    requireRole(["SALES", "FC", "WAREHOUSE"]),
    (req, res) => {
      try {
        const leads = db
          .prepare("SELECT * FROM crm_leads ORDER BY created_at DESC")
          .all();
        res.json(leads);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch leads" });
      }
    },
  );

  salesRouter.post(
    "/api/sales/leads/:id/convert",
    requireRole(["SALES", "FC", "WAREHOUSE"]),
    (req, res) => {
      try {
        const leadId = req.params.id;
        const lead = db
          .prepare("SELECT * FROM crm_leads WHERE id = ?")
          .get(leadId) as any;
        if (!lead) return res.status(404).json({ error: "Lead not found" });
        if (lead.status === "CONVERTED")
          return res.status(400).json({ error: "Lead already converted" });

        let resolvedCustomerId = "";
        let resolvedCode = "";
        const transaction = db.transaction(() => {
          const cleanContact = (lead.contact_info || "").trim();
          const existingMatch = db
            .prepare(
              `SELECT id, code, customer_segment FROM customers
               WHERE archived_at IS NULL
                 AND ((phone = ? AND phone IS NOT NULL AND phone != '')
                   OR (LOWER(email) = LOWER(?) AND email IS NOT NULL AND email != '')
                   OR LOWER(name) = LOWER(?))
               LIMIT 1`
            )
            .get(cleanContact, cleanContact, (lead.name || "").trim()) as any;

          if (existingMatch) {
            resolvedCustomerId = existingMatch.id;
            resolvedCode = existingMatch.code;
            const newSeg = existingMatch.customer_segment === "B2C" ? "OMNICHANNEL" : existingMatch.customer_segment || "B2B";
            db.prepare(
              `UPDATE customers
               SET customer_segment = ?,
                   source_lead_id = COALESCE(source_lead_id, ?),
                   phone = COALESCE(NULLIF(phone, ''), ?)
               WHERE id = ?`
            ).run(newSeg, leadId, cleanContact || null, resolvedCustomerId);
          } else {
            resolvedCustomerId = "CUS-" + crypto.randomUUID().substring(0, 8);
            const existingCusts = db
              .prepare("SELECT code FROM customers WHERE archived_at IS NULL")
              .all() as any[];
            let seq = getNextEntitySequence("CUS", existingCusts);
            resolvedCode = generateSmartCustomerCode(lead.name || "CUSTOMER", seq);
            while (
              db.prepare("SELECT id FROM customers WHERE code = ? COLLATE NOCASE").get(resolvedCode)
            ) {
              seq++;
              resolvedCode = generateSmartCustomerCode(lead.name || "CUSTOMER", seq);
            }
            db.prepare(
              `
            INSERT INTO customers (
              id, name, code, contact_person, phone,
              customer_type, customer_segment, credit_limit, payment_terms_days, source_lead_id
            )
            VALUES (?, ?, ?, ?, ?, 'B2B', 'B2B', 50000000, 30, ?)
          `,
            ).run(resolvedCustomerId, lead.name, resolvedCode, lead.name, lead.contact_info, leadId);
          }

          db.prepare(
            "UPDATE crm_leads SET status = 'CONVERTED', customer_id = ? WHERE id = ?",
          ).run(resolvedCustomerId, leadId);

          cacheService.invalidateNamespace("customers");
          outboxService.enqueue(
            db,
            "CRM_LEADS",
            leadId,
            "UPDATE",
            { id: leadId, status: "CONVERTED", customer_id: resolvedCustomerId },
            "BOTH"
          );
          outboxService.enqueue(
            db,
            "CUSTOMERS",
            resolvedCustomerId,
            "CREATE",
            {
              id: resolvedCustomerId,
              name: lead.name,
              code: resolvedCode,
              contact_person: lead.name,
              phone: lead.contact_info,
            },
            "BOTH"
          );
        });
        transaction();
        res.json({
          success: true,
          message: "Lead converted & unified into Master Customer",
          customer_id: resolvedCustomerId,
          code: resolvedCode,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to convert lead" });
      }
    },
  );

  salesRouter.delete(
    "/api/sales/leads/:id",
    requireRole(["SALES", "FC", "WAREHOUSE"]),
    (req, res) => {
      try {
        db.prepare("DELETE FROM crm_leads WHERE id = ?").run(req.params.id);
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to delete lead" });
      }
    },
  );

  // =========================================================================
  // POTENTIAL CUSTOMERS & AI SCOUT ENGINE ENDPOINTS (SCOUT AI - UU PDP ALIGNED)
  // =========================================================================

  salesRouter.get(
    "/api/sales/potential-customers",
    requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const search = ((req.query.search as string) || "").trim().toLowerCase();
        const status = ((req.query.status as string) || "ALL").trim();
        const persona = ((req.query.persona as string) || "ALL").trim();
        const segment = ((req.query.segment as string) || "ALL").trim();
        const grade = ((req.query.grade as string) || "ALL").trim();
        const consent = ((req.query.consent as string) || "ALL").trim();
        const scoutStatus = ((req.query.scout_status as string) || "ALL").trim();
        const cartMin = Number(req.query.cart_min) || 0;
        const sort = ((req.query.sort as string) || "recent").trim();

        let sql = "SELECT * FROM potential_customers WHERE 1=1";
        const params: any[] = [];

        if (search) {
          sql += " AND (LOWER(customer_name) LIKE ? OR LOWER(COALESCE(email, '')) LIKE ? OR LOWER(COALESCE(phone, '')) LIKE ? OR LOWER(COALESCE(company, '')) LIKE ?)";
          const term = `%${search}%`;
          params.push(term, term, term, term);
        }

        if (status && status !== "ALL") {
          sql += " AND status = ?";
          params.push(status);
        }

        if (persona && persona !== "ALL") {
          sql += " AND persona_tag = ?";
          params.push(persona);
        }

        if (segment && segment !== "ALL") {
          sql += " AND customer_segment = ?";
          params.push(segment);
        }

        if (grade && grade !== "ALL") {
          sql += " AND lead_grade = ?";
          params.push(grade);
        }

        if (consent && consent !== "ALL") {
          if (consent === "CONSENT_ACTIVE") {
            sql += " AND profiling_consent = 1";
          } else if (consent === "NO_CONSENT") {
            sql += " AND (profiling_consent = 0 OR profiling_consent IS NULL)";
          }
        }

        if (scoutStatus && scoutStatus !== "ALL") {
          sql += " AND scout_status = ?";
          params.push(scoutStatus);
        }

        if (cartMin > 0) {
          sql += " AND cart_total_value >= ?";
          params.push(cartMin);
        }

        if (sort === "score_desc") {
          sql += " ORDER BY potential_score DESC, created_at DESC";
        } else if (sort === "value_desc") {
          sql += " ORDER BY cart_total_value DESC, created_at DESC";
        } else if (sort === "activity_desc") {
          sql += " ORDER BY activity_count DESC, created_at DESC";
        } else {
          sql += " ORDER BY created_at DESC";
        }

        const rawLeads = db.prepare(sql).all(...params) as any[];

        const leads = rawLeads.map((row) => {
          let parsedCart: any[] = [];
          let parsedSources: string[] = [];
          let sourcesJson: any[] = [];
          let keyTalkingPoints: string[] = [];
          let recommendedProducts: string[] = [];
          let riskFlags: string[] = [];
          let leadScoreBreakdown: any = null;

          try { parsedCart = row.cart_snapshot ? JSON.parse(row.cart_snapshot) : []; } catch { parsedCart = []; }
          try { parsedSources = row.scout_sources ? JSON.parse(row.scout_sources) : []; } catch { parsedSources = []; }
          try { sourcesJson = row.sources_json ? JSON.parse(row.sources_json) : []; } catch { sourcesJson = []; }
          try { keyTalkingPoints = row.key_talking_points ? JSON.parse(row.key_talking_points) : []; } catch { keyTalkingPoints = []; }
          try { recommendedProducts = row.recommended_products ? JSON.parse(row.recommended_products) : []; } catch { recommendedProducts = []; }
          try { riskFlags = row.risk_flags ? JSON.parse(row.risk_flags) : []; } catch { riskFlags = []; }
          try { leadScoreBreakdown = row.lead_score_breakdown ? JSON.parse(row.lead_score_breakdown) : null; } catch { leadScoreBreakdown = null; }

          const gradeVal = row.lead_grade || (row.potential_score >= 80 ? "A" : row.potential_score >= 60 ? "B" : row.potential_score >= 40 ? "C" : "D");

          return {
            ...row,
            lead_grade: gradeVal,
            cart_snapshot: parsedCart,
            scout_sources: parsedSources,
            sources_json: sourcesJson,
            key_talking_points: keyTalkingPoints,
            recommended_products: recommendedProducts,
            risk_flags: riskFlags,
            lead_score_breakdown: leadScoreBreakdown,
          };
        });

        // Aggregate KPI Stats
        const allRows = db.prepare("SELECT potential_score, cart_total_value, status, lead_grade, profiling_consent, scout_status FROM potential_customers").all() as any[];
        const stats = {
          total_leads: allRows.length,
          grade_a_count: allRows.filter((r) => (r.lead_grade === "A" || r.potential_score >= 80)).length,
          grade_b_count: allRows.filter((r) => (r.lead_grade === "B" || (r.potential_score >= 60 && r.potential_score < 80))).length,
          grade_c_count: allRows.filter((r) => (r.lead_grade === "C" || (r.potential_score >= 40 && r.potential_score < 60))).length,
          grade_d_count: allRows.filter((r) => (r.lead_grade === "D" || (r.potential_score < 40))).length,
          scouted_count: allRows.filter((r) => r.scout_status === "SCOUTED").length,
          consented_count: allRows.filter((r) => r.profiling_consent === 1).length,
          total_cart_pipeline_value: allRows.reduce((sum, r) => sum + (Number(r.cart_total_value) || 0), 0),
          converted_count: allRows.filter((r) => r.status === "CONVERTED").length,
          contacted_count: allRows.filter((r) => r.status === "CONTACTED").length,
        };

        res.json({
          success: true,
          data: leads,
          stats,
        });
      } catch (err: any) {
        console.error("[Sales API] Error fetching potential customers:", err);
        res.status(500).json({ success: false, error: err.message || "Failed to fetch potential customers" });
      }
    }
  );

  salesRouter.get(
    "/api/sales/potential-customers/:id",
    requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const row = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id) as any;
        if (!row) {
          return res.status(404).json({ success: false, error: "Potential customer not found" });
        }

        let parsedCart = [];
        let parsedSources = [];
        let sourcesJson = [];
        let keyTalkingPoints = [];
        let recommendedProducts = [];
        let riskFlags = [];
        let leadScoreBreakdown = null;

        try { parsedCart = row.cart_snapshot ? JSON.parse(row.cart_snapshot) : []; } catch {}
        try { parsedSources = row.scout_sources ? JSON.parse(row.scout_sources) : []; } catch {}
        try { sourcesJson = row.sources_json ? JSON.parse(row.sources_json) : []; } catch {}
        try { keyTalkingPoints = row.key_talking_points ? JSON.parse(row.key_talking_points) : []; } catch {}
        try { recommendedProducts = row.recommended_products ? JSON.parse(row.recommended_products) : []; } catch {}
        try { riskFlags = row.risk_flags ? JSON.parse(row.risk_flags) : []; } catch {}
        try { leadScoreBreakdown = row.lead_score_breakdown ? JSON.parse(row.lead_score_breakdown) : null; } catch {}

        const activities = db.prepare(`
          SELECT id, module, activity_type, title, details, page_url, user_agent, created_at
          FROM visitor_activities
          WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL AND session_id != '')
          ORDER BY created_at DESC
          LIMIT 150
        `).all(row.id, row.visitor_session_id || "") as any[];

        const parsedActivities = activities.map((a) => {
          let detailsObj = null;
          try {
            detailsObj = a.details ? JSON.parse(a.details) : null;
          } catch {
            detailsObj = a.details;
          }
          return {
            ...a,
            details: detailsObj,
          };
        });

        const consents = db.prepare(`
          SELECT * FROM customer_consents
          WHERE customer_id = ?
          ORDER BY created_at DESC
        `).all(row.id) as any[];

        const outreach = db.prepare(`
          SELECT * FROM outreach_activities
          WHERE customer_id = ?
          ORDER BY sent_at DESC
        `).all(row.id) as any[];

        const feedback = db.prepare(`
          SELECT * FROM ai_feedback
          WHERE customer_id = ?
          ORDER BY created_at DESC
        `).all(row.id) as any[];

        const gradeVal = row.lead_grade || (row.potential_score >= 80 ? "A" : row.potential_score >= 60 ? "B" : row.potential_score >= 40 ? "C" : "D");

        res.json({
          success: true,
          data: {
            ...row,
            lead_grade: gradeVal,
            cart_snapshot: parsedCart,
            scout_sources: parsedSources,
            sources_json: sourcesJson,
            key_talking_points: keyTalkingPoints,
            recommended_products: recommendedProducts,
            risk_flags: riskFlags,
            lead_score_breakdown: leadScoreBreakdown,
            activities: parsedActivities,
            consents,
            outreach,
            feedback,
          },
        });
      } catch (err: any) {
        console.error("[Sales API] Error getting potential customer:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  salesRouter.get(
    "/api/sales/potential-customers/:id/activities",
    requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const row = db.prepare("SELECT id, visitor_session_id FROM potential_customers WHERE id = ?").get(req.params.id) as any;
        if (!row) {
          return res.status(404).json({ success: false, error: "Potential customer not found" });
        }

        const activities = db.prepare(`
          SELECT id, module, activity_type, title, details, page_url, user_agent, created_at
          FROM visitor_activities
          WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL AND session_id != '')
          ORDER BY created_at DESC
          LIMIT 200
        `).all(row.id, row.visitor_session_id || "") as any[];

        const parsed = activities.map((a) => {
          let detailsObj = null;
          try {
            detailsObj = a.details ? JSON.parse(a.details) : null;
          } catch {
            detailsObj = a.details;
          }
          return {
            ...a,
            details: detailsObj,
          };
        });

        res.json({ success: true, data: parsed });
      } catch (err: any) {
        console.error("[Sales API] Error getting lead activities:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  salesRouter.post(
    "/api/sales/potential-customers/:id/scout",
    requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
    async (req, res) => {
      try {
        const row = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id) as any;
        if (!row) {
          return res.status(404).json({ success: false, error: "Calon pelanggan tidak ditemukan." });
        }

        let parsedCart = [];
        try {
          parsedCart = row.cart_snapshot ? JSON.parse(row.cart_snapshot) : [];
        } catch {}

        const rawActivities = db.prepare(`
          SELECT module, activity_type, title, details, page_url, created_at
          FROM visitor_activities
          WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL AND session_id != '')
          ORDER BY created_at ASC
          LIMIT 150
        `).all(row.id, row.visitor_session_id || "") as any[];

        const parsedActivities = rawActivities.map((a) => {
          let detailsObj = null;
          try {
            detailsObj = a.details ? JSON.parse(a.details) : null;
          } catch {
            detailsObj = a.details;
          }
          return {
            module: a.module,
            activity_type: a.activity_type,
            title: a.title,
            details: detailsObj,
            page_url: a.page_url,
            created_at: a.created_at,
          };
        });

        const hasProfilingConsent = row.profiling_consent !== 0;

        db.prepare("UPDATE potential_customers SET scout_status = 'SCOUTING' WHERE id = ?").run(row.id);

        const analysis = await runScoutIntelligence({
          id: row.id,
          customer_name: row.customer_name,
          email: row.email,
          phone: row.phone,
          company: row.company,
          cart_snapshot: parsedCart,
          cart_total_value: row.cart_total_value,
          cart_total_items: row.cart_total_items,
          activities: parsedActivities,
          profiling_consent: hasProfilingConsent,
        });

        const now = new Date().toISOString();
        const newStatus = row.status === "NEW_INTENT" ? "SCOUTED" : row.status;
        const userSub = (req as any).user?.name || (req as any).user?.email || "Sales Agent";

        db.prepare(`
          UPDATE potential_customers
          SET potential_score = ?,
              lead_grade = ?,
              fit_score = ?,
              intent_score = ?,
              reachability_score = ?,
              persona_tag = ?,
              buying_power_est = ?,
              scout_company = ?,
              scout_role = ?,
              scout_summary = ?,
              scout_sources = ?,
              sources_json = ?,
              scout_recommendations = ?,
              key_talking_points = ?,
              recommended_products = ?,
              risk_flags = ?,
              scout_confidence = ?,
              lead_score_breakdown = ?,
              scout_status = 'SCOUTED',
              scout_triggered_by = ?,
              scouted_at = ?,
              status = ?
          WHERE id = ?
        `).run(
          analysis.potential_score,
          analysis.lead_grade,
          analysis.fit_score,
          analysis.intent_score,
          analysis.reachability_score,
          analysis.persona_tag,
          analysis.buying_power_est,
          analysis.scout_company,
          analysis.scout_role,
          analysis.scout_summary,
          JSON.stringify(analysis.scout_sources),
          JSON.stringify(analysis.sources_json),
          analysis.scout_recommendations,
          JSON.stringify(analysis.key_talking_points),
          JSON.stringify(analysis.recommended_products),
          JSON.stringify(analysis.risk_flags),
          analysis.confidence_level,
          JSON.stringify({ dimensions: analysis.dimensions, explanation: analysis.explanation, deep_osint: analysis.deep_osint }),
          userSub,
          now,
          newStatus,
          row.id
        );

        const updated = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(row.id) as any;
        res.json({
          success: true,
          message: hasProfilingConsent
            ? "Analisis Scout AI berhasil dijalankan dengan OSINT & web grounding."
            : "Analisis Scout First-Party berhasil. (Data enrichment publik dibatasi sesuai preferensi consent UU PDP).",
          data: {
            ...updated,
            lead_grade: analysis.lead_grade,
            cart_snapshot: parsedCart,
            scout_sources: analysis.scout_sources,
            sources_json: analysis.sources_json,
            key_talking_points: analysis.key_talking_points,
            recommended_products: analysis.recommended_products,
            risk_flags: analysis.risk_flags,
            lead_score_breakdown: { dimensions: analysis.dimensions, explanation: analysis.explanation },
            activities: parsedActivities,
          },
        });
      } catch (err: any) {
        console.error("[Sales API] Error running scout:", err);
        db.prepare("UPDATE potential_customers SET scout_status = 'SCOUT_FAILED' WHERE id = ?").run(req.params.id);
        res.status(500).json({ success: false, error: err.message || "Gagal menjalankan analisis Scout" });
      }
    }
  );

  salesRouter.post(
    "/api/sales/potential-customers/bulk-scout",
    requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
    async (req, res) => {
      try {
        const { customer_ids = [] } = req.body;
        if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
          return res.status(400).json({ success: false, error: "customer_ids array required" });
        }

        const limit = Math.min(25, customer_ids.length);
        const targetIds = customer_ids.slice(0, limit);
        let scoutedCount = 0;
        let skippedNoConsent = 0;
        const userSub = (req as any).user?.name || (req as any).user?.email || "Sales Agent";

        const targetPlaceholders = targetIds.map(() => "?").join(",");
        const customerRows = db.prepare(`SELECT * FROM potential_customers WHERE id IN (${targetPlaceholders})`).all(...targetIds) as any[];
        const customerMap = new Map<string, any>();
        for (const c of customerRows) customerMap.set(c.id, c);

        for (const id of targetIds) {
          const row = customerMap.get(id);
          if (!row) continue;

          const hasConsent = row.profiling_consent !== 0;
          if (!hasConsent) {
            skippedNoConsent++;
          }

          let parsedCart = [];
          try { parsedCart = row.cart_snapshot ? JSON.parse(row.cart_snapshot) : []; } catch {}

          const rawActivities = db.prepare(`
            SELECT module, activity_type, title, details, page_url, created_at
            FROM visitor_activities
            WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL AND session_id != '')
            ORDER BY created_at ASC
            LIMIT 80
          `).all(row.id, row.visitor_session_id || "") as any[];

          const parsedActivities = rawActivities.map((a) => {
            let detailsObj = null;
            try { detailsObj = a.details ? JSON.parse(a.details) : null; } catch { detailsObj = a.details; }
            return { module: a.module, activity_type: a.activity_type, title: a.title, details: detailsObj, page_url: a.page_url, created_at: a.created_at };
          });

          try {
            const analysis = await runScoutIntelligence({
              id: row.id,
              customer_name: row.customer_name,
              email: row.email,
              phone: row.phone,
              company: row.company,
              cart_snapshot: parsedCart,
              cart_total_value: row.cart_total_value,
              cart_total_items: row.cart_total_items,
              activities: parsedActivities,
              profiling_consent: hasConsent,
            });

            const now = new Date().toISOString();
            db.prepare(`
              UPDATE potential_customers
              SET potential_score = ?,
                  lead_grade = ?,
                  fit_score = ?,
                  intent_score = ?,
                  reachability_score = ?,
                  persona_tag = ?,
                  buying_power_est = ?,
                  scout_company = ?,
                  scout_role = ?,
                  scout_summary = ?,
                  scout_sources = ?,
                  sources_json = ?,
                  scout_recommendations = ?,
                  key_talking_points = ?,
                  recommended_products = ?,
                  risk_flags = ?,
                  scout_confidence = ?,
                  scout_status = 'SCOUTED',
                  scout_triggered_by = ?,
                  scouted_at = ?
              WHERE id = ?
            `).run(
              analysis.potential_score,
              analysis.lead_grade,
              analysis.fit_score,
              analysis.intent_score,
              analysis.reachability_score,
              analysis.persona_tag,
              analysis.buying_power_est,
              analysis.scout_company,
              analysis.scout_role,
              analysis.scout_summary,
              JSON.stringify(analysis.scout_sources),
              JSON.stringify(analysis.sources_json),
              analysis.scout_recommendations,
              JSON.stringify(analysis.key_talking_points),
              JSON.stringify(analysis.recommended_products),
              JSON.stringify(analysis.risk_flags),
              analysis.confidence_level,
              userSub,
              now,
              row.id
            );
            scoutedCount++;
          } catch (err) {
            console.error(`[Bulk Scout] Error scouting ${id}:`, err);
          }
        }

        res.json({
          success: true,
          total_requested: targetIds.length,
          scouted: scoutedCount,
          skipped_no_consent: skippedNoConsent,
          message: `Berhasil memproses Scout untuk ${scoutedCount} calon pelanggan.${skippedNoConsent > 0 ? ` (${skippedNoConsent} diproses terbatas first-party karena belum ada profiling consent).` : ""}`,
        });
      } catch (err: any) {
        console.error("[Sales API] Bulk scout error:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  salesRouter.post(
    "/api/sales/potential-customers/:id/request-consent",
    requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const lead = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id) as any;
        if (!lead) return res.status(404).json({ success: false, error: "Lead not found" });

        const now = new Date().toISOString();
        const outreachId = `OUT-${Date.now()}`;
        const userSub = (req as any).user?.name || (req as any).user?.email || "Sales Agent";

        db.prepare(`
          INSERT INTO outreach_activities (id, customer_id, channel, template_id, custom_note, sent_by, sent_at, status)
          VALUES (?, ?, 'EMAIL', 'CONSENT_REQUEST', 'Undangan persetujuan personalisasi penawaran proyek & kalkulasi mutu SNI', ?, ?, 'SENT')
        `).run(outreachId, lead.id, userSub, now);

        res.json({
          success: true,
          message: `Undangan persetujuan (Consent Request) telah dijadwalkan ke ${lead.email || lead.phone || lead.customer_name}.`,
        });
      } catch (err: any) {
        console.error("[Sales API] Error requesting consent:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  salesRouter.post(
    "/api/sales/outreach",
    requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { customer_id, channel = "WA", template_id, custom_note } = req.body;
        if (!customer_id) return res.status(400).json({ success: false, error: "customer_id required" });

        const now = new Date().toISOString();
        const outreachId = `OUT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const userSub = (req as any).user?.name || (req as any).user?.email || "Sales Agent";

        db.prepare(`
          INSERT INTO outreach_activities (id, customer_id, channel, template_id, custom_note, sent_by, sent_at, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'SENT')
        `).run(outreachId, customer_id, channel, template_id || "CUSTOM", custom_note || "Outreach dikirim", userSub, now);

        db.prepare(`
          UPDATE potential_customers
          SET status = 'CONTACTED',
              last_active_at = ?
          WHERE id = ? AND status IN ('NEW_INTENT', 'SCOUTED')
        `).run(now, customer_id);

        res.json({
          success: true,
          outreach_id: outreachId,
          message: "Aktivitas outreach berhasil dicatat.",
        });
      } catch (err: any) {
        console.error("[Sales API] Error logging outreach:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  salesRouter.post(
    "/api/sales/feedback",
    requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { customer_id, field, flag = "HELPFUL", note } = req.body;
        if (!customer_id || !field) {
          return res.status(400).json({ success: false, error: "customer_id and field required" });
        }

        const now = new Date().toISOString();
        const feedbackId = `FB-${Date.now()}`;
        const userSub = (req as any).user?.name || (req as any).user?.email || "Sales Agent";

        db.prepare(`
          INSERT INTO ai_feedback (id, customer_id, field, flag, note, flagged_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(feedbackId, customer_id, field, flag, note || null, userSub, now);

        res.json({
          success: true,
          feedback_id: feedbackId,
          message: flag === "WRONG_INFO" ? "Laporan info salah dicatat untuk evaluasi AI." : "Feedback positif berhasil dicatat.",
        });
      } catch (err: any) {
        console.error("[Sales API] Error logging AI feedback:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  const handleGetICP = (req: any, res: any) => {
    try {
      let config = db.prepare("SELECT * FROM scout_icp_config WHERE id = 'ICP-DEFAULT'").get() as any;
      if (!config) {
        config = {
          id: "ICP-DEFAULT",
          company_name: "Enterprise Commerce & Operations",
          target_industries: JSON.stringify(["Contractors & Construction", "Property Developers", "Manufacturing Plants", "Commercial Entities", "Distributors & Wholesalers"]),
          target_buyer_personas: JSON.stringify(["Project Manager", "Procurement Lead", "Purchasing Manager", "Operations Director", "Business Owner"]),
          priority_products: JSON.stringify(["Standard Industrial Products", "Custom Fabrications", "Specialized Components", "Bulk Wholesale Orders"]),
          scoring_weights: JSON.stringify({ behavioral_intent: 0.35, engagement: 0.20, profile_fit: 0.30, freshness: 0.15 }),
        };
      }

      res.json({
        success: true,
        data: {
          ...config,
          target_industries: JSON.parse(config.target_industries || "[]"),
          target_buyer_personas: JSON.parse(config.target_buyer_personas || "[]"),
          priority_products: JSON.parse(config.priority_products || "[]"),
          scoring_weights: JSON.parse(config.scoring_weights || "{}"),
        },
      });
    } catch (err: any) {
      console.error("[Sales API] Error getting ICP config:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  salesRouter.get("/api/sales/scout/icp", requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]), handleGetICP);
  salesRouter.get("/api/scout/templates/icp", requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]), handleGetICP);

  const handlePatchICP = (req: any, res: any) => {
    try {
      const payload = req.body.icp_config || req.body;
      const { target_industries, target_buyer_personas, priority_products, scoring_weights, company_name } = payload;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO scout_icp_config (id, company_name, target_industries, target_buyer_personas, priority_products, scoring_weights, updated_at)
        VALUES ('ICP-DEFAULT', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          company_name = COALESCE(excluded.company_name, scout_icp_config.company_name),
          target_industries = excluded.target_industries,
          target_buyer_personas = excluded.target_buyer_personas,
          priority_products = excluded.priority_products,
          scoring_weights = excluded.scoring_weights,
          updated_at = excluded.updated_at
      `).run(
        company_name || "Enterprise Commerce & Operations",
        JSON.stringify(target_industries || []),
        JSON.stringify(target_buyer_personas || []),
        JSON.stringify(priority_products || []),
        JSON.stringify(scoring_weights || {}),
        now
      );

      res.json({ success: true, message: "ICP Scout AI configuration updated successfully." });
    } catch (err: any) {
      console.error("[Sales API] Error updating ICP config:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  salesRouter.patch("/api/sales/scout/icp", requireRole(["SALES", "ADMIN", "GOD_MODE", "FC"]), handlePatchICP);
  salesRouter.patch("/api/scout/templates/icp", requireRole(["SALES", "ADMIN", "GOD_MODE", "FC"]), handlePatchICP);

  salesRouter.patch(
    "/api/sales/potential-customers/:id",
    requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { status, sales_notes, assigned_to } = req.body;
        const lead = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id) as any;
        if (!lead) {
          return res.status(404).json({ success: false, error: "Potential customer not found" });
        }

        db.prepare(`
          UPDATE potential_customers
          SET status = COALESCE(?, status),
              sales_notes = COALESCE(?, sales_notes),
              assigned_to = COALESCE(?, assigned_to)
          WHERE id = ?
        `).run(
          status !== undefined ? status : null,
          sales_notes !== undefined ? sales_notes : null,
          assigned_to !== undefined ? assigned_to : null,
          req.params.id
        );

        const updated = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id);
        res.json({ success: true, data: updated });
      } catch (err: any) {
        console.error("[Sales API] Error updating lead:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  salesRouter.delete(
    "/api/sales/potential-customers/:id",
    requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const targetId = req.params.id;
        const existing = db.prepare("SELECT id, customer_name FROM potential_customers WHERE id = ?").get(targetId) as any;
        if (!existing) {
          return res.status(404).json({ success: false, error: "Potential customer profile not found" });
        }

        const deleteTx = db.transaction(() => {
          db.prepare("DELETE FROM outreach_activities WHERE customer_id = ?").run(targetId);
          db.prepare("DELETE FROM customer_consents WHERE customer_id = ?").run(targetId);
          db.prepare("DELETE FROM ai_feedback WHERE customer_id = ?").run(targetId);
          db.prepare("DELETE FROM visitor_activities WHERE customer_id = ?").run(targetId);
          db.prepare("DELETE FROM potential_customers WHERE id = ?").run(targetId);
        });
        deleteTx();

        res.json({
          success: true,
          message: `Potential customer profile "${existing.customer_name}" deleted successfully.`,
        });
      } catch (err: any) {
        console.error("[Sales API] Error deleting lead:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  salesRouter.post(
    "/api/sales/potential-customers/bulk-delete",
    requireRole(["SALES", "FC", "WAREHOUSE", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const { customer_ids = [] } = req.body;
        if (!Array.isArray(customer_ids) || customer_ids.length === 0) {
          return res.status(400).json({ success: false, error: "customer_ids array required" });
        }

        const bulkDeleteTx = db.transaction((ids: string[]) => {
          const delOutreach = db.prepare("DELETE FROM outreach_activities WHERE customer_id = ?");
          const delConsents = db.prepare("DELETE FROM customer_consents WHERE customer_id = ?");
          const delFeedback = db.prepare("DELETE FROM ai_feedback WHERE customer_id = ?");
          const delActivities = db.prepare("DELETE FROM visitor_activities WHERE customer_id = ?");
          const delCustomer = db.prepare("DELETE FROM potential_customers WHERE id = ?");

          let deletedCount = 0;
          for (const id of ids) {
            delOutreach.run(id);
            delConsents.run(id);
            delFeedback.run(id);
            delActivities.run(id);
            const info = delCustomer.run(id);
            deletedCount += info.changes;
          }
          return deletedCount;
        });

        const deletedCount = bulkDeleteTx(customer_ids);
        res.json({
          success: true,
          deleted_count: deletedCount,
          message: `${deletedCount} potential customer profile(s) deleted successfully.`,
        });
      } catch (err: any) {
        console.error("[Sales API] Error bulk deleting leads:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );

  salesRouter.post(
    "/api/sales/potential-customers/:id/convert-to-quotation",
    requireRole(["SALES", "FC", "ADMIN", "GOD_MODE"]),
    (req, res) => {
      try {
        const lead = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(req.params.id) as any;
        if (!lead) {
          return res.status(404).json({ success: false, error: "Lead not found" });
        }

        let cartItems: any[] = [];
        try {
          cartItems = lead.cart_snapshot ? JSON.parse(lead.cart_snapshot) : [];
        } catch {}

        const nowIso = new Date().toISOString();

        // 1. Find or create customer
        let customer = db.prepare("SELECT * FROM customers WHERE (phone = ? AND phone IS NOT NULL) OR (email = ? AND email IS NOT NULL)").get(lead.phone, lead.email) as any;
        let customerId = customer?.id;

        if (!customer) {
          customerId = "CUS-" + crypto.randomUUID().substring(0, 8);
          const targetName = lead.company || lead.customer_name || "CUSTOMER";
          const existingCusts = db
            .prepare("SELECT code FROM customers WHERE archived_at IS NULL")
            .all() as any[];
          let seq = getNextEntitySequence("CUS", existingCusts);
          let code = generateSmartCustomerCode(targetName, seq);
          while (
            db.prepare("SELECT id FROM customers WHERE code = ? COLLATE NOCASE").get(code)
          ) {
            seq++;
            code = generateSmartCustomerCode(targetName, seq);
          }
          db.prepare(`
            INSERT INTO customers (id, code, name, contact_person, email, phone, address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            customerId,
            code,
            targetName,
            lead.customer_name,
            lead.email || null,
            lead.phone || null,
            "Dari Storefront Lead"
          );
          cacheService.invalidateNamespace("customers");
        }

        // 2. Create Quotation using canonical columns & financial breakdown
        const quotationId = "QUO-" + crypto.randomUUID().substring(0, 6).toUpperCase();
        const year = new Date().getFullYear();
        const count = ((db.prepare("SELECT COUNT(*) as cnt FROM quotations").get() as any)?.cnt || 0) + 1;
        const quotationNumber = `QUO/${year}/${String(count).padStart(3, "0")}/${quotationId.slice(-2)}`;

        const normalizedItems = cartItems.length > 0
          ? cartItems.map((item: any) => ({
              item_id: item.item_id || null,
              title: item.name || item.title || "Commercial Item",
              qty: Number(item.qty) || 1,
              uom: item.uom || "Unit",
              unit_price: Number(item.price || item.unit_price) || 0,
            }))
          : [{
              item_id: null,
              title: `Paket Penawaran Prospek - ${lead.company || lead.customer_name}`,
              qty: 1,
              uom: "Lot",
              unit_price: Number(lead.cart_total_value) || 0,
            }];

        const breakdown = calculateFinancialBreakdown({
          items: normalizedItems,
          discountRate: 0,
          taxRate: 11,
          pphRate: 0,
          taxScheme: "DPP_NILAI_LAIN",
          roundingFactor: 0,
        });

        db.prepare(`
          INSERT INTO quotations (
            id, quotation_number, customer_id, title, amount, validity_days, remarks, status,
            tax_rate, discount_rate, pph_rate, dpp, dpp_nilai_lain, tax_scheme,
            payment_terms, payment_method, rounding_factor, grand_total, created_at
          ) VALUES (
            ?, ?, ?, ?, ?, 14, ?, 'PENDING',
            11, 0, 0, ?, ?, 'DPP_NILAI_LAIN',
            'Net 14 Days', 'Transfer Bank', 0, ?, ?
          )
        `).run(
          quotationId,
          quotationNumber,
          customerId,
          `Penawaran Prospek Online: ${lead.company || lead.customer_name}`,
          breakdown.dpp,
          `Dikonversi dari prospek online shop (Skor Potensi: ${lead.potential_score || 50}/100, Persona: ${lead.persona_tag || 'Unverified'}). Catatan: ${lead.scout_recommendations || 'Follow-up standar.'}`,
          breakdown.dpp,
          breakdown.dppNilaiLain,
          breakdown.grandTotal,
          nowIso
        );

        const qiStmt = db.prepare(`
          INSERT INTO quotation_items (
            id, quotation_id, title, qty, uom, unit_price, item_id, barcode, discount_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `);

        let idx = 1;
        for (const item of normalizedItems) {
          qiStmt.run(
            `QI-${quotationId}-${idx++}`,
            quotationId,
            item.title,
            item.qty,
            item.uom,
            item.unit_price,
            item.item_id || null,
            null
          );
        }

        db.prepare(`
          UPDATE potential_customers
          SET status = 'CONVERTED',
              last_active_at = ?
          WHERE id = ?
        `).run(nowIso, lead.id);

        res.json({
          success: true,
          message: `Berhasil membuat Surat Penawaran ${quotationNumber}`,
          data: {
            quotation_id: quotationId,
            quotation_number: quotationNumber,
            customer_id: customerId,
          },
        });
      } catch (err: any) {
        console.error("[Sales API] Error converting to quotation:", err);
        res.status(500).json({ success: false, error: err.message });
      }
    }
  );
}
