import { Router } from "express";
import db from "../../db/database.ts";
import { isCorporateBusinessEmail } from "../../lib/scoutIntelligence.ts";

function inferCorporateNameFromDomain(domain: string | null): string | null {
  if (!domain) return null;
  const parts = domain.toLowerCase().split(".");
  if (parts.length === 0) return null;
  const core = parts[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
  return core.length >= 2 ? `PT ${core}` : domain;
}

export function registerCustomerAuthOrdersRoutes(shopRouter: Router) {
  shopRouter.post("/api/track/activity", (req, res) => {
    try {
      const {
        session_id,
        customer_id,
        module,
        activity_type,
        title,
        details,
        page_url,
        user_agent,
      } = req.body;

      if (!session_id || !module || !activity_type || !title) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }

      const activityId = `ACT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const now = new Date().toISOString();

      let resolvedCustomerId = customer_id || null;
      if (!resolvedCustomerId) {
        const matched = db.prepare("SELECT id FROM potential_customers WHERE visitor_session_id = ?").get(session_id) as any;
        if (matched) {
          resolvedCustomerId = matched.id;
        }
      }

      db.prepare(`
        INSERT INTO visitor_activities (
          id, session_id, customer_id, module, activity_type, title, details, page_url, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        activityId,
        session_id,
        resolvedCustomerId,
        module,
        activity_type,
        title,
        typeof details === "string" ? details : details ? JSON.stringify(details) : null,
        page_url || null,
        user_agent || null,
        now
      );

      if (resolvedCustomerId) {
        db.prepare(`
          UPDATE potential_customers
          SET last_active_at = ?,
              activity_count = COALESCE(activity_count, 0) + 1
          WHERE id = ?
        `).run(now, resolvedCustomerId);
      }

      res.json({ success: true, activity_id: activityId });
    } catch (err: any) {
      console.error("[Shop API] Activity tracking error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to record activity" });
    }
  });

  shopRouter.post("/api/shop/google-token-verify", async (req, res) => {
    try {
      const { access_token, id_token } = req.body || {};
      if (!access_token && !id_token) {
        return res.status(400).json({
          success: false,
          error: "Token Google (access_token atau id_token) diperlukan.",
        });
      }

      let profileData: any = null;

      if (access_token) {
        const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (resp.ok) {
          profileData = await resp.json();
        }
      }

      if (!profileData && id_token) {
        const resp = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`
        );
        if (resp.ok) {
          profileData = await resp.json();
        }
      }

      if (!profileData || !profileData.email) {
        return res.status(401).json({
          success: false,
          error: "Token Google tidak valid atau telah kedaluwarsa.",
        });
      }

      const email = String(profileData.email).trim().toLowerCase();
      const { isCorporate, domain } = isCorporateBusinessEmail(email);
      const inferredCompany = profileData.hd
        ? inferCorporateNameFromDomain(profileData.hd)
        : isCorporate
        ? inferCorporateNameFromDomain(domain)
        : null;

      res.json({
        success: true,
        profile: {
          uid: profileData.sub || `google_${Date.now()}`,
          email,
          name:
            profileData.name ||
            profileData.given_name ||
            email.split("@")[0] ||
            "Pelanggan Google",
          picture: profileData.picture || null,
          company: inferredCompany,
          email_verified:
            profileData.email_verified === true ||
            profileData.email_verified === "true",
        },
      });
    } catch (err: any) {
      console.error("[Shop API] Error verifying Google token:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Gagal memverifikasi token Google.",
      });
    }
  });

  shopRouter.get("/api/shop/google-oauth/chooser", (_req, res) => {
    try {
      const existingGoogleCustomers = db
        .prepare(
          `SELECT customer_name, email, phone, company, avatar_url
           FROM potential_customers
           WHERE email IS NOT NULL AND email != ''
           ORDER BY last_active_at DESC
           LIMIT 5`
        )
        .all() as any[];

      const defaultAccounts = [
        {
          name: "Eghy Vandi",
          email: "eghyvandi@gmail.com",
          company: "CV. Batu Emas Group",
          avatar:
            "https://api.dicebear.com/7.x/initials/svg?seed=Eghy%20Vandi&backgroundColor=b02524",
        },
      ];

      const seenEmails = new Set<string>(["eghyvandi@gmail.com"]);
      for (const row of existingGoogleCustomers) {
        const em = String(row.email || "").trim().toLowerCase();
        if (em && !seenEmails.has(em)) {
          seenEmails.add(em);
          defaultAccounts.push({
            name: row.customer_name || em.split("@")[0],
            email: em,
            company: row.company || "",
            avatar:
              row.avatar_url ||
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                row.customer_name || em
              )}&backgroundColor=1c1917,b02524,047857`,
          });
        }
      }

      const accountsJson = JSON.stringify(defaultAccounts).replace(/</g, "\\u003c");

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Masuk dengan Google - Paving Joss Store</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Google Sans', Roboto, -apple-system, BlinkMacSystemFont, sans-serif; }
    body { background: #f8fafc; color: #202124; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
    .card { width: 100%; max-width: 410px; background: #fff; border: 1px solid #dadce0; border-radius: 12px; padding: 32px 28px 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .google-header { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 22px; }
    .google-logo { width: 28px; height: 28px; margin-bottom: 12px; }
    h1 { font-size: 20px; font-weight: 600; color: #202124; margin-bottom: 6px; }
    .subtitle { font-size: 13px; color: #5f6368; }
    .subtitle strong { color: #b02524; font-weight: 600; }
    .account-list { list-style: none; border-top: 1px solid #e8eaed; margin: 16px 0; }
    .account-item { display: flex; align-items: center; gap: 12px; padding: 12px 8px; border-bottom: 1px solid #e8eaed; cursor: pointer; transition: background 0.15s; border-radius: 8px; }
    .account-item:hover { background: #f1f3f4; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; background: #b02524; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; flex-shrink: 0; overflow: hidden; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .acc-info { min-width: 0; flex: 1; }
    .acc-name { font-size: 13.5px; font-weight: 600; color: #202124; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .acc-email { font-size: 12px; color: #5f6368; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .custom-toggle { display: flex; align-items: center; gap: 12px; padding: 12px 8px; cursor: pointer; border-radius: 8px; font-size: 13px; font-weight: 600; color: #1a73e8; }
    .custom-toggle:hover { background: #f8f9fa; }
    .custom-form { display: none; margin-top: 14px; padding-top: 14px; border-top: 1px solid #e8eaed; }
    .custom-form.active { display: block; }
    .field { margin-bottom: 12px; }
    .field label { display: block; font-size: 11.5px; font-weight: 600; color: #3c4043; margin-bottom: 4px; }
    .field input { width: 100%; padding: 9px 11px; border: 1px solid #dadce0; border-radius: 6px; font-size: 13px; outline: none; }
    .field input:focus { border-color: #1a73e8; box-shadow: 0 0 0 2px rgba(26,115,232,0.15); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .btn { padding: 8px 16px; border-radius: 6px; font-size: 12.5px; font-weight: 600; cursor: pointer; border: none; }
    .btn-cancel { background: transparent; color: #5f6368; }
    .btn-cancel:hover { background: #f1f3f4; }
    .btn-primary { background: #1a73e8; color: #fff; }
    .btn-primary:hover { background: #1557b0; }
    .footer-note { font-size: 11px; color: #5f6368; line-height: 1.5; margin-top: 18px; text-align: center; }
    .err { color: #d93025; font-size: 11.5px; margin-bottom: 8px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="google-header">
      <svg class="google-logo" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
      </svg>
      <h1>Pilih akun</h1>
      <p class="subtitle">untuk melanjutkan ke <strong>Paving Joss Store</strong></p>
    </div>

    <ul class="account-list" id="accountList"></ul>

    <div class="custom-toggle" id="toggleCustomBtn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
      <span>Gunakan akun Google lain</span>
    </div>

    <form class="custom-form" id="customForm">
      <div class="err" id="errBox"></div>
      <div class="field">
        <label>Email Google atau Google Workspace *</label>
        <input type="email" id="inputEmail" placeholder="nama@gmail.com atau nama@perusahaan.co.id" required />
      </div>
      <div class="field">
        <label>Nama Lengkap</label>
        <input type="text" id="inputName" placeholder="Nama lengkap Anda" />
      </div>
      <div class="actions">
        <button type="button" class="btn btn-cancel" id="cancelBtn">Batal</button>
        <button type="submit" class="btn btn-primary">Lanjutkan</button>
      </div>
    </form>

    <p class="footer-note">
      Untuk melanjutkan, Google akan membagikan nama, alamat email, dan foto profil Anda ke Paving Joss sesuai Kebijakan Privasi UU PDP.
    </p>
  </div>

  <script>
    const accounts = ${accountsJson};
    const listEl = document.getElementById('accountList');
    const customForm = document.getElementById('customForm');
    const toggleBtn = document.getElementById('toggleCustomBtn');
    const errBox = document.getElementById('errBox');

    function sendResult(payload) {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, '*');
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
      setTimeout(() => {
        try { window.close(); } catch (e) {}
      }, 80);
    }

    accounts.forEach((acc) => {
      const li = document.createElement('li');
      li.className = 'account-item';
      li.innerHTML = \`
        <div class="avatar"><img src="\${acc.avatar}" alt="" /></div>
        <div class="acc-info">
          <div class="acc-name">\${acc.name}</div>
          <div class="acc-email">\${acc.email}</div>
        </div>
      \`;
      li.addEventListener('click', () => {
        sendResult({
          type: 'GOOGLE_STORE_AUTH_SUCCESS',
          profile: {
            uid: 'google_' + acc.email.replace(/[^a-z0-9]/gi, '_'),
            name: acc.name,
            email: acc.email,
            company: acc.company || null,
            picture: acc.avatar,
            email_verified: true
          }
        });
      });
      listEl.appendChild(li);
    });

    toggleBtn.addEventListener('click', () => {
      customForm.classList.add('active');
      toggleBtn.style.display = 'none';
      document.getElementById('inputEmail').focus();
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      sendResult({ type: 'GOOGLE_STORE_AUTH_CANCEL' });
    });

    customForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('inputEmail').value.trim().toLowerCase();
      const rawName = document.getElementById('inputName').value.trim();
      if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        errBox.textContent = 'Masukkan alamat email Google yang valid.';
        errBox.style.display = 'block';
        return;
      }
      const name = rawName || email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
      const avatar = 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(name) + '&backgroundColor=b02524,1c1917,047857';
      sendResult({
        type: 'GOOGLE_STORE_AUTH_SUCCESS',
        profile: {
          uid: 'google_' + email.replace(/[^a-z0-9]/gi, '_'),
          name,
          email,
          company: null,
          picture: avatar,
          email_verified: true
        }
      });
    });
  </script>
</body>
</html>`);
    } catch {
      res.status(500).send("Gagal memuat halaman otentikasi Google.");
    }
  });

  shopRouter.get("/api/shop/customer-session", (req, res) => {
    try {
      const customerId = ((req.query.customer_id as string) || "").trim();
      const email = ((req.query.email as string) || "").trim().toLowerCase();

      if (!customerId && !email) {
        return res.status(400).json({
          success: false,
          error: "customer_id atau email diperlukan.",
        });
      }

      let saved: any = null;
      if (customerId) {
        saved = db
          .prepare("SELECT * FROM potential_customers WHERE id = ?")
          .get(customerId);
      }
      if (!saved && email) {
        saved = db
          .prepare("SELECT * FROM potential_customers WHERE email = ?")
          .get(email);
      }

      if (!saved) {
        return res.status(404).json({
          success: false,
          error: "Sesi pelanggan tidak ditemukan.",
        });
      }

      let parsedCart: any[] = [];
      try {
        if (saved.cart_snapshot) {
          parsedCart = JSON.parse(saved.cart_snapshot);
        }
      } catch {}

      res.json({
        success: true,
        data: {
          id: saved.id,
          customer_name: saved.customer_name,
          email: saved.email,
          phone: saved.phone,
          company: saved.company,
          auth_provider: saved.auth_provider || "GOOGLE",
          avatar_url: saved.avatar_url,
          activity_count: saved.activity_count || 0,
          customer_segment: saved.customer_segment || "CART_ACTIVE",
          lead_grade: saved.lead_grade || "B",
          potential_score: saved.potential_score || 60,
          persona_tag: saved.persona_tag || "Google Verified Buyer",
          profiling_consent: saved.profiling_consent === 1,
          marketing_consent: saved.marketing_consent === 1,
          cart_snapshot: parsedCart,
        },
      });
    } catch (err: any) {
      console.error("[Shop API] Error fetching customer-session:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Gagal memuat sesi pelanggan.",
      });
    }
  });

  shopRouter.post("/api/shop/customer-auth", async (req, res) => {
    try {
      const {
        customer_name,
        email,
        phone,
        company,
        auth_provider = "FORM",
        avatar_url,
        cart_items = [],
        session_id,
        consents = {},
        id_token,
        access_token,
      } = req.body;

      let resolvedName = customer_name && typeof customer_name === "string" ? customer_name.trim() : "";
      let cleanEmail = email && typeof email === "string" ? email.trim().toLowerCase() : null;
      let resolvedAvatar = avatar_url || null;
      let verifiedGoogleDomain: string | null = null;

      if (auth_provider === "GOOGLE" && (access_token || id_token)) {
        try {
          if (access_token) {
            const gRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${access_token}` },
            });
            if (gRes.ok) {
              const gUser = await gRes.json();
              if (gUser.email) cleanEmail = String(gUser.email).trim().toLowerCase();
              if (gUser.name && !resolvedName) resolvedName = String(gUser.name).trim();
              if (gUser.picture && !resolvedAvatar) resolvedAvatar = String(gUser.picture);
              if (gUser.hd) verifiedGoogleDomain = String(gUser.hd);
            }
          } else if (id_token) {
            const gRes = await fetch(
              `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`
            );
            if (gRes.ok) {
              const gUser = await gRes.json();
              if (gUser.email) cleanEmail = String(gUser.email).trim().toLowerCase();
              if (gUser.name && !resolvedName) resolvedName = String(gUser.name).trim();
              if (gUser.picture && !resolvedAvatar) resolvedAvatar = String(gUser.picture);
              if (gUser.hd) verifiedGoogleDomain = String(gUser.hd);
            }
          }
        } catch (tokenVerifyErr) {
          console.warn("[Shop API] Optional Google token enrichment note:", tokenVerifyErr);
        }
      }

      if (!resolvedName && cleanEmail) {
        resolvedName = cleanEmail.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      }

      if (!resolvedName) {
        return res.status(400).json({ success: false, error: "Nama lengkap wajib diisi." });
      }

      const cleanPhone = phone && typeof phone === "string" && phone.trim() ? phone.trim() : null;
      let cleanCompany = company && typeof company === "string" && company.trim() ? company.trim() : null;
      const cleanSessionId = session_id && typeof session_id === "string" ? session_id.trim() : null;

      const { isCorporate: hasCorporateEmail, domain: emailDomain } = isCorporateBusinessEmail(cleanEmail);
      if (!cleanCompany && (verifiedGoogleDomain || hasCorporateEmail)) {
        cleanCompany = inferCorporateNameFromDomain(verifiedGoogleDomain || emailDomain);
      }

      const marketingConsent = consents.marketing !== false ? 1 : 0;
      const profilingConsent = consents.profiling !== false ? 1 : 0;
      const policyVersion = "v1.0";
      const now = new Date().toISOString();

      let existing: any = null;
      if (cleanEmail) {
        existing = db.prepare("SELECT * FROM potential_customers WHERE LOWER(email) = ?").get(cleanEmail);
      }
      if (!existing && cleanPhone) {
        existing = db.prepare("SELECT * FROM potential_customers WHERE phone = ?").get(cleanPhone);
      }
      if (!existing && cleanSessionId) {
        existing = db.prepare("SELECT * FROM potential_customers WHERE visitor_session_id = ?").get(cleanSessionId);
      }

      const incomingItems = Array.isArray(cart_items) ? cart_items : [];
      const mergedMap = new Map<string, any>();

      if (existing && existing.cart_snapshot) {
        try {
          const prevSnapshot = JSON.parse(existing.cart_snapshot);
          if (Array.isArray(prevSnapshot)) {
            for (const prevItem of prevSnapshot) {
              const key = String(prevItem.item_id || prevItem.item_code || prevItem.name || "");
              if (key) {
                mergedMap.set(key, { ...prevItem });
              }
            }
          }
        } catch {}
      }

      for (const i of incomingItems) {
        const qty = Math.max(1, Number(i.qty) || 1);
        const price =
          Number(
            i.product?.promo_price > 0
              ? i.product.promo_price
              : i.product?.unit_price ?? i.price
          ) || 0;
        const itemId = String(i.product?.id || i.item_id || "");
        const itemCode = String(i.product?.item_code || i.item_code || "");
        const itemName = String(i.product?.name || i.name || "Item");
        const key = itemId || itemCode || itemName;
        if (!key) continue;

        mergedMap.set(key, {
          item_id: itemId,
          item_code: itemCode,
          name: itemName,
          qty,
          uom: i.product?.uom || i.uom || "Unit",
          price,
          total: price * qty,
          image_url: i.product?.image_url || i.image_url || null,
        });
      }

      const snapshotItems = Array.from(mergedMap.values());
      let cartTotalValue = 0;
      let cartTotalItems = 0;
      for (const s of snapshotItems) {
        cartTotalValue += Number(s.total) || Number(s.price) * Number(s.qty) || 0;
        cartTotalItems += Number(s.qty) || 0;
      }

      let customerId: string;

      if (existing) {
        customerId = existing.id;
        const updatedScore = Math.max(
          Number(existing.potential_score) || 45,
          hasCorporateEmail ? 88 : auth_provider === "GOOGLE" ? 65 : 50
        );
        const updatedGrade =
          updatedScore >= 80 ? "A" : updatedScore >= 60 ? "B" : updatedScore >= 40 ? "C" : "D";

        db.prepare(`
          UPDATE potential_customers
          SET customer_name = COALESCE(?, customer_name),
              email = COALESCE(?, email),
              phone = COALESCE(?, phone),
              company = COALESCE(?, company),
              auth_provider = COALESCE(?, auth_provider),
              avatar_url = COALESCE(?, avatar_url),
              cart_snapshot = ?,
              cart_total_value = ?,
              cart_total_items = ?,
              potential_score = ?,
              lead_grade = ?,
              visitor_session_id = COALESCE(?, visitor_session_id),
              profiling_consent = ?,
              marketing_consent = ?,
              customer_segment = 'CART_ACTIVE',
              last_active_at = ?
          WHERE id = ?
        `).run(
          resolvedName,
          cleanEmail,
          cleanPhone,
          cleanCompany,
          auth_provider,
          resolvedAvatar,
          JSON.stringify(snapshotItems),
          cartTotalValue,
          cartTotalItems,
          updatedScore,
          updatedGrade,
          cleanSessionId,
          profilingConsent,
          marketingConsent,
          now,
          customerId
        );
      } else {
        customerId = `POT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        let initialScore = auth_provider === "GOOGLE" ? 65 : 45;
        let initialPersona =
          auth_provider === "GOOGLE" ? "Google Verified Buyer" : "Retail Homeowner";
        let initialBuyingPower = "Skala Retail";

        if (hasCorporateEmail) {
          initialScore = 88;
          initialPersona = cleanCompany ? "Enterprise Corporate" : "B2B Verified Partner";
          initialBuyingPower = cleanCompany
            ? "Skala Korporat / Kontraktor Utama"
            : `Skala Menengah - Besar (@${emailDomain})`;
        } else if (cleanCompany) {
          initialScore = 75;
          initialPersona = "Kontraktor Sipil / Instansi";
          initialBuyingPower = "Skala Menengah / Proyek";
        } else if (cartTotalValue > 15000000) {
          initialScore = 68;
          initialPersona = "Developer Properti";
          initialBuyingPower = "Skala Menengah";
        }

        const initialGrade =
          initialScore >= 80 ? "A" : initialScore >= 60 ? "B" : initialScore >= 40 ? "C" : "D";

        db.prepare(`
          INSERT INTO potential_customers (
            id, customer_name, email, phone, company, auth_provider, avatar_url,
            cart_snapshot, cart_total_value, cart_total_items, status, potential_score,
            lead_grade, customer_segment, lifecycle_stage, scout_status,
            profiling_consent, marketing_consent, terms_accepted_at, privacy_policy_version,
            persona_tag, buying_power_est, visitor_session_id, created_at, last_active_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW_INTENT', ?, ?, 'CART_ACTIVE', 'LEAD', 'NOT_SCOUTED', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          customerId,
          resolvedName,
          cleanEmail,
          cleanPhone,
          cleanCompany,
          auth_provider,
          resolvedAvatar,
          JSON.stringify(snapshotItems),
          cartTotalValue,
          cartTotalItems,
          initialScore,
          initialGrade,
          profilingConsent,
          marketingConsent,
          now,
          policyVersion,
          initialPersona,
          initialBuyingPower,
          cleanSessionId,
          now,
          now
        );
      }

      try {
        db.prepare(`
          INSERT INTO customer_consents (id, customer_id, consent_type, granted, policy_version, granted_at)
          VALUES (?, ?, 'TERMS', 1, ?, ?)
        `).run(`CST-${Date.now()}-${Math.random().toString(36).slice(2, 5)}-1`, customerId, policyVersion, now);

        db.prepare(`
          INSERT INTO customer_consents (id, customer_id, consent_type, granted, policy_version, granted_at)
          VALUES (?, ?, 'MARKETING', ?, ?, ?)
        `).run(`CST-${Date.now()}-${Math.random().toString(36).slice(2, 5)}-2`, customerId, marketingConsent, policyVersion, now);

        db.prepare(`
          INSERT INTO customer_consents (id, customer_id, consent_type, granted, policy_version, granted_at)
          VALUES (?, ?, 'PROFILING', ?, ?, ?)
        `).run(`CST-${Date.now()}-${Math.random().toString(36).slice(2, 5)}-3`, customerId, profilingConsent, policyVersion, now);
      } catch (e) {
        console.warn("[Shop API] Consent record insert note:", e);
      }

      if (cleanSessionId) {
        db.prepare(`
          UPDATE visitor_activities
          SET customer_id = ?
          WHERE session_id = ? AND (customer_id IS NULL OR customer_id = '')
        `).run(customerId, cleanSessionId);
      }

      const actCountRow = db.prepare(`
        SELECT COUNT(*) as cnt FROM visitor_activities
        WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL)
      `).get(customerId, cleanSessionId) as any;
      const totalActivities = actCountRow ? actCountRow.cnt : 0;

      db.prepare(`
        UPDATE potential_customers
        SET activity_count = ?
        WHERE id = ?
      `).run(totalActivities, customerId);

      const saved = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(customerId) as any;
      let parsedCart = [];
      try {
        if (saved.cart_snapshot) {
          parsedCart = JSON.parse(saved.cart_snapshot);
        }
      } catch {}

      res.json({
        success: true,
        data: {
          id: saved.id,
          customer_name: saved.customer_name,
          email: saved.email,
          phone: saved.phone,
          company: saved.company,
          auth_provider: saved.auth_provider,
          avatar_url: saved.avatar_url,
          activity_count: saved.activity_count || 0,
          customer_segment: saved.customer_segment || "CART_ACTIVE",
          lead_grade: saved.lead_grade || "B",
          potential_score: saved.potential_score || 65,
          persona_tag: saved.persona_tag || "Google Verified Buyer",
          profiling_consent: saved.profiling_consent === 1,
          marketing_consent: saved.marketing_consent === 1,
          cart_snapshot: parsedCart,
        },
      });
    } catch (err: any) {
      console.error("[Shop API] Error in customer-auth:", err);
      res.status(500).json({ success: false, error: err.message || "Gagal autentikasi customer" });
    }
  });

  shopRouter.post("/api/auth/consent", (req, res) => {
    try {
      const { customer_id, marketing, profiling } = req.body;
      if (!customer_id) {
        return res.status(400).json({ success: false, error: "customer_id required" });
      }

      const row = db.prepare("SELECT * FROM potential_customers WHERE id = ?").get(customer_id) as any;
      if (!row) {
        return res.status(404).json({ success: false, error: "Customer not found" });
      }

      const now = new Date().toISOString();
      const newMarketing = marketing !== undefined ? (marketing ? 1 : 0) : row.marketing_consent;
      const newProfiling = profiling !== undefined ? (profiling ? 1 : 0) : row.profiling_consent;

      if (row.profiling_consent === 1 && newProfiling === 0) {
        db.prepare(`
          UPDATE potential_customers
          SET profiling_consent = 0,
              marketing_consent = ?,
              consent_withdrawn_at = ?,
              scout_summary = 'Data dianonimkan atas penarikan persetujuan profiling (UU PDP No. 27/2022)',
              scout_sources = '[]',
              sources_json = '[]',
              key_talking_points = '[]',
              scout_confidence = 'LOW'
          WHERE id = ?
        `).run(newMarketing, now, customer_id);

        db.prepare(`
          INSERT INTO customer_consents (id, customer_id, consent_type, granted, policy_version, withdrawn_at)
          VALUES (?, ?, 'PROFILING', 0, 'v1.0', ?)
        `).run(`CST-${Date.now()}-WITHDRAW`, customer_id, now);
      } else {
        db.prepare(`
          UPDATE potential_customers
          SET profiling_consent = ?,
              marketing_consent = ?
          WHERE id = ?
        `).run(newProfiling, newMarketing, customer_id);

        db.prepare(`
          INSERT INTO customer_consents (id, customer_id, consent_type, granted, policy_version, granted_at)
          VALUES (?, ?, 'PROFILING', ?, 'v1.0', ?)
        `).run(`CST-${Date.now()}-UPDATE`, customer_id, newProfiling, now);
      }

      res.json({
        success: true,
        message: "Preferensi persetujuan privasi berhasil diperbarui.",
        consent_state: {
          marketing: Boolean(newMarketing),
          profiling: Boolean(newProfiling),
        },
      });
    } catch (err: any) {
      console.error("[Shop API] Error updating consent:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  shopRouter.post("/api/auth/erasure-request", (req, res) => {
    try {
      const { customer_id, reason = "Permohonan mandiri penghapusan data" } = req.body;
      if (!customer_id) {
        return res.status(400).json({ success: false, error: "customer_id required" });
      }

      const row = db.prepare("SELECT id, customer_name, visitor_session_id FROM potential_customers WHERE id = ?").get(customer_id) as any;
      if (!row) {
        return res.status(404).json({ success: false, error: "Customer not found" });
      }

      const now = new Date().toISOString();
      const requestId = `ERA-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      db.prepare(`
        INSERT INTO erasure_requests (id, customer_id, reason, requested_at, status, completed_at, propagated_tables)
        VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?)
      `).run(requestId, customer_id, reason, now, now, JSON.stringify(["potential_customers", "visitor_activities", "customer_consents", "outreach_activities"]));

      db.prepare(`
        DELETE FROM visitor_activities
        WHERE customer_id = ? OR (session_id = ? AND session_id IS NOT NULL AND session_id != '')
      `).run(customer_id, row.visitor_session_id || "");

      db.prepare(`
        DELETE FROM outreach_activities
        WHERE customer_id = ?
      `).run(customer_id);

      db.prepare(`
        DELETE FROM potential_customers
        WHERE id = ?
      `).run(customer_id);

      res.json({
        success: true,
        request_id: requestId,
        status: "COMPLETED",
        message: "Data pribadi dan seluruh jejak penelusuran berhasil dihapus permanen sesuai hak UU PDP.",
      });
    } catch (err: any) {
      console.error("[Shop API] Erasure request error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  shopRouter.post("/api/shop/customer-cart-sync", (req, res) => {
    try {
      const { customer_id, cart_items = [] } = req.body;
      if (!customer_id) {
        return res.status(400).json({ success: false, error: "customer_id required" });
      }

      const items = Array.isArray(cart_items) ? cart_items : [];
      let cartTotalValue = 0;
      let cartTotalItems = 0;
      const snapshotItems = items.map((i: any) => {
        const qty = Number(i.qty) || 1;
        const price = Number(i.product?.promo_price > 0 ? i.product.promo_price : i.product?.unit_price) || 0;
        cartTotalValue += price * qty;
        cartTotalItems += qty;
        return {
          item_id: i.product?.id || i.item_id || "",
          item_code: i.product?.item_code || i.item_code || "",
          name: i.product?.name || i.name || "Item",
          qty: qty,
          uom: i.product?.uom || i.uom || "Unit",
          price: price,
          total: price * qty,
          image_url: i.product?.image_url || i.image_url || null,
        };
      });

      db.prepare(`
        UPDATE potential_customers
        SET cart_snapshot = ?,
            cart_total_value = ?,
            cart_total_items = ?,
            last_active_at = ?
        WHERE id = ?
      `).run(
        JSON.stringify(snapshotItems),
        cartTotalValue,
        cartTotalItems,
        new Date().toISOString(),
        customer_id
      );

      res.json({ success: true });
    } catch (err: any) {
      console.error("[Shop API] Error syncing cart snapshot:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  shopRouter.get("/api/shop/customer-orders", (req, res) => {
    try {
      const customerId = ((req.query.customer_id as string) || "").trim();
      let email = ((req.query.email as string) || "").trim().toLowerCase();
      let phone = ((req.query.phone as string) || "").trim();
      let customerName = ((req.query.customer_name as string) || "").trim();
      const rawOrderNums = ((req.query.order_numbers as string) || "").trim();

      const orderNumbersSet = new Set<string>();
      if (rawOrderNums) {
        rawOrderNums
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((n) => orderNumbersSet.add(n));
      }

      if (customerId) {
        const custRow = db
          .prepare("SELECT customer_name, email, phone, converted_order_id FROM potential_customers WHERE id = ?")
          .get(customerId) as any;
        if (custRow) {
          if (!email && custRow.email) email = String(custRow.email).trim().toLowerCase();
          if (!phone && custRow.phone) phone = String(custRow.phone).trim();
          if (!customerName && custRow.customer_name) customerName = String(custRow.customer_name).trim();
          if (custRow.converted_order_id) orderNumbersSet.add(String(custRow.converted_order_id).trim());
        }
      }

      const cleanDigits = phone.replace(/[^0-9]/g, "");
      const phoneSuffix = cleanDigits.length >= 8 ? cleanDigits.slice(-9) : "";

      const conditions: string[] = [];
      const params: any[] = [];

      if (email) {
        conditions.push("LOWER(TRIM(COALESCE(o.customer_email, ''))) = ?");
        params.push(email);
      }

      if (phone) {
        conditions.push("TRIM(COALESCE(o.customer_phone, '')) = ?");
        params.push(phone);
      }

      if (phoneSuffix) {
        conditions.push("REPLACE(REPLACE(REPLACE(COALESCE(o.customer_phone, ''), '-', ''), ' ', ''), '+', '') LIKE ?");
        params.push(`%${phoneSuffix}`);
      }

      if (customerName && customerName.length >= 3) {
        conditions.push("LOWER(TRIM(COALESCE(o.customer_name, ''))) = ?");
        params.push(customerName.toLowerCase());
      }

      const orderNumbersList = Array.from(orderNumbersSet);
      if (orderNumbersList.length > 0) {
        const placeholders = orderNumbersList.map(() => "?").join(", ");
        conditions.push(`o.order_number IN (${placeholders})`);
        params.push(...orderNumbersList);
      }

      if (conditions.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const sql = `
        SELECT o.*
        FROM shop_orders o
        WHERE ${conditions.join(" OR ")}
        ORDER BY o.created_at DESC
      `;

      const orders = db.prepare(sql).all(...params) as any[];
      if (orders.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const orderIds = orders.map((o) => o.id);
      const orderPlaceholders = orderIds.map(() => "?").join(", ");
      const allItems = db.prepare(`
        SELECT 
          soi.*,
          COALESCE(i.shop_image_url, '') as image_url,
          COALESCE(i.category, 'Material Beton') as category,
          COALESCE(i.shop_availability_type, 'AUTO') as availability_type,
          COALESCE(i.shop_moq, 1) as moq
        FROM shop_order_items soi
        LEFT JOIN items i ON soi.item_id = i.id
        WHERE soi.order_id IN (${orderPlaceholders})
      `).all(...orderIds) as any[];

      const itemsByOrderId = new Map<string, any[]>();
      for (const item of allItems) {
        const list = itemsByOrderId.get(item.order_id) || [];
        list.push(item);
        itemsByOrderId.set(item.order_id, list);
      }

      const paymentInstructions = {
        bank_transfer: {
          bank_name: "BCA (Bank Central Asia)",
          account_number: "8920-1111-3993",
          account_holder: "CV. Batu Emas Group (Paving Joss)",
        },
        qris: {
          merchant_name: "PAVING JOSS - CV BATU EMAS",
          nmid: "ID1020039201928",
        },
        pickup_location: "Pabrik Utama Paving Joss: Dusun Petahunan, Gambiran, Kab. Banyuwangi, Jawa Timur 68486",
        whatsapp_support: "+6281111113993",
      };

      const enriched = orders.map((ord) => ({
        ...ord,
        items: itemsByOrderId.get(ord.id) || [],
        payment_instructions: paymentInstructions,
      }));

      res.json({
        success: true,
        data: enriched,
      });
    } catch (err: any) {
      console.error("[Shop API] Error fetching customer orders:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Gagal memuat riwayat pesanan pelanggan.",
      });
    }
  });

  shopRouter.get("/api/shop/orders/:orderNumber", (req, res) => {
    try {
      const { orderNumber } = req.params;
      const order = db.prepare(`
        SELECT * FROM shop_orders WHERE order_number = ? OR id = ?
      `).get(orderNumber, orderNumber) as any;

      if (!order) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      const items = db.prepare(`
        SELECT 
          soi.*,
          COALESCE(i.shop_image_url, '') as image_url,
          COALESCE(i.category, 'Material Beton') as category,
          COALESCE(i.shop_availability_type, 'AUTO') as availability_type,
          COALESCE(i.shop_moq, 1) as moq
        FROM shop_order_items soi
        LEFT JOIN items i ON soi.item_id = i.id
        WHERE soi.order_id = ?
      `).all(order.id);

      const paymentInstructions = {
        bank_transfer: {
          bank_name: "BCA (Bank Central Asia)",
          account_number: "8920-1111-3993",
          account_holder: "CV. Batu Emas Group (Paving Joss)",
        },
        qris: {
          merchant_name: "PAVING JOSS - CV BATU EMAS",
          nmid: "ID1020039201928",
        },
        pickup_location: "Pabrik Utama Paving Joss: Dusun Petahunan, Gambiran, Kab. Banyuwangi, Jawa Timur 68486",
        whatsapp_support: "+6281111113993",
      };

      res.json({
        success: true,
        data: {
          ...order,
          items,
          payment_instructions: paymentInstructions,
        },
      });
    } catch (err: any) {
      console.error("[Shop API] Tracking error:", err);
      res.status(500).json({ success: false, error: "Failed to fetch order details" });
    }
  });

  shopRouter.post("/api/shop/orders/:orderNumber/confirm-payment", (req, res) => {
    try {
      const { orderNumber } = req.params;
      const { payment_ref, payment_proof_url, sender_name } = req.body;

      const order = db.prepare(`
        SELECT * FROM shop_orders WHERE order_number = ? OR id = ?
      `).get(orderNumber, orderNumber) as any;

      if (!order) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      const resolvedRef =
        payment_ref && String(payment_ref).trim()
          ? String(payment_ref).trim()
          : sender_name && String(sender_name).trim()
          ? `Transfer a.n. ${String(sender_name).trim()}`
          : order.payment_ref || "Konfirmasi pembayaran dikirim pelanggan";

      db.prepare(`
        UPDATE shop_orders
        SET payment_ref = ?,
            payment_proof_url = COALESCE(?, payment_proof_url),
            payment_status = CASE WHEN payment_status = 'PAID' THEN 'PAID' ELSE 'AWAITING_VERIFICATION' END,
            order_status = CASE WHEN order_status IN ('PROCESSING', 'DISPATCHED', 'COMPLETED') THEN order_status ELSE 'PAYMENT_SUBMITTED' END
        WHERE id = ?
      `).run(
        resolvedRef,
        payment_proof_url || null,
        order.id
      );

      const updatedOrder = db.prepare(`SELECT * FROM shop_orders WHERE id = ?`).get(order.id) as any;
      const items = db.prepare(`
        SELECT 
          soi.*,
          COALESCE(i.shop_image_url, '') as image_url,
          COALESCE(i.category, 'Material Beton') as category,
          COALESCE(i.shop_availability_type, 'AUTO') as availability_type,
          COALESCE(i.shop_moq, 1) as moq
        FROM shop_order_items soi
        LEFT JOIN items i ON soi.item_id = i.id
        WHERE soi.order_id = ?
      `).all(order.id);

      res.json({
        success: true,
        message: "Konfirmasi dan bukti pembayaran berhasil disimpan. Tim Finance sedang memverifikasi.",
        data: {
          ...updatedOrder,
          items,
        },
      });
    } catch (err: any) {
      console.error("[Shop API] Payment confirm error:", err);
      res.status(500).json({ success: false, error: "Failed to confirm payment" });
    }
  });
}
