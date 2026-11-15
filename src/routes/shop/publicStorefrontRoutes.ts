import { Router } from "express";
import db from "../../db/database.ts";
import crypto from "crypto";
import { calculateFinancialBreakdown } from "../../lib/financialEngine.ts";
import {
  getNextEntitySequence,
  generateSmartCustomerCode,
} from "../../utils/autoCoding.ts";

// Helper to generate unique order number e.g. SO-2609-AB482
const generateOrderNumber = () => {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let rand = "";
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const now = new Date();
  const yr = String(now.getFullYear()).slice(-2);
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  return `SO-${yr}${mo}-${rand}`;
};

function normalizeStorefrontMedia(coverInput: unknown, galleryInput: unknown): {
  primaryUrl: string;
  gallery: string[];
} {
  let rawList: unknown[] = [];
  if (Array.isArray(galleryInput)) {
    rawList = galleryInput;
  } else if (typeof galleryInput === "string" && galleryInput.trim()) {
    try {
      const parsed = JSON.parse(galleryInput);
      if (Array.isArray(parsed)) rawList = parsed;
    } catch {
      rawList = [];
    }
  }
  const seen = new Set<string>();
  let gallery: string[] = [];
  for (const entry of rawList) {
    if (typeof entry !== "string") continue;
    const clean = entry.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    gallery.push(clean);
  }
  const cleanCover = typeof coverInput === "string" ? coverInput.trim() : "";
  if (cleanCover) {
    gallery = [cleanCover, ...gallery.filter((u) => u !== cleanCover)];
    return { primaryUrl: cleanCover, gallery };
  }
  return {
    primaryUrl: gallery[0] || "",
    gallery,
  };
}

/**
 * Helper to build real synchronized gallery items and completed project portfolio
 * from active Shop Products, completed ERP Projects, and completed Shop Orders.
 */
function buildPublicShowcaseData() {
  // 1. Active published Shop Products (Finished Goods)
  const rawShopItems = db.prepare(`
    SELECT 
      i.id,
      i.item_code,
      i.name,
      i.dimension,
      i.spec,
      i.category,
      i.description,
      i.uom,
      COALESCE(i.unit_price, 0) as unit_price,
      COALESCE(CASE WHEN i.shop_availability_type = 'MAKE_TO_ORDER' OR i.unit_price <= 0 THEN 0 ELSE i.shop_promo_price END, 0) as promo_price,
      COALESCE(NULLIF(TRIM(i.shop_image_url), ''), '') as image_url,
      COALESCE(i.shop_gallery_urls, '[]') as shop_gallery_urls,
      COALESCE(i.shop_badge, '') as badge,
      COALESCE(i.shop_featured, 0) as is_featured,
      COALESCE(CASE WHEN i.shop_availability_type = 'MAKE_TO_ORDER' OR i.unit_price <= 0 THEN 'MAKE_TO_ORDER' ELSE i.shop_availability_type END, 'AUTO') as availability_type,
      COALESCE(inv.available_qty, 0) as available_qty,
      COALESCE(inv.physical_qty, 0) as physical_qty
    FROM items i
    LEFT JOIN inventory inv ON i.id = inv.item_id
    WHERE i.deleted_at IS NULL
      AND ((i.type IN ('FINISHED', 'FINISH_GOOD', 'FINISH_GOODS')) OR (i.item_code LIKE 'FG - %' OR i.item_code LIKE 'FG-%'))
      AND (i.type != 'MACHINE' OR i.type IS NULL) AND (i.item_code NOT LIKE 'MC - %' AND i.item_code NOT LIKE 'MC-%')
      AND COALESCE(i.is_published_shop, 1) = 1
    ORDER BY i.shop_featured DESC, i.name ASC
  `).all() as any[];

  const galleryItems: any[] = rawShopItems.map((item) => {
    const media = normalizeStorefrontMedia(item.image_url, item.shop_gallery_urls);
    return {
      id: String(item.id),
      item_code: item.item_code || "",
      name: item.name,
      dimension: item.dimension || item.spec || "",
      spec: item.spec || item.description || "",
      category: item.category && String(item.category).trim() !== "" ? String(item.category).trim() : "Katalog Pabrik",
      badge: item.badge || (Number(item.available_qty) > 0 ? "READY STOCK" : "MADE TO ORDER"),
      image_url: media.primaryUrl,
      gallery_urls: media.gallery,
      uom: item.uom || "PCS",
      available_qty: Number(item.available_qty || 0),
      unit_price: Number(item.unit_price || 0),
      source_type: "SHOP_PRODUCT",
    };
  });

  // 2. Completed ERP Projects
  const completedErpProjects = db.prepare(`
    SELECT 
      p.id,
      p.name,
      p.customer,
      p.status,
      p.qty,
      p.uom,
      p.spk_number,
      p.ntp_id,
      p.created_at,
      p.completed_at,
      p.archived_at,
      p.due_date,
      qc.address as quotation_address,
      s.title as spk_spec,
      fg.id as fg_item_id,
      fg.item_code as fg_item_code,
      fg.name as fg_name,
      fg.dimension as fg_dimension,
      fg.spec as fg_spec,
      fg.category as fg_category,
      fg.shop_image_url as fg_image_url,
      fg.shop_gallery_urls as fg_gallery_urls,
      (SELECT COALESCE(SUM(fgr.quantity), 0) FROM finish_good_records fgr WHERE fgr.project_id = p.id AND fgr.status = 'APPROVED') as total_fg_qty,
      (SELECT COALESCE(SUM(COALESCE(NULLIF(di.qty_delivered, 0), di.qty, 0)), 0) FROM delivery_notes dn JOIN delivery_items di ON di.dn_id = dn.id WHERE dn.project_id = p.id AND dn.status = 'DELIVERED') as total_delivered_qty,
      (SELECT dc.address FROM delivery_notes dn JOIN customers dc ON dn.customer_id = dc.id WHERE dn.project_id = p.id AND dc.address IS NOT NULL AND dc.address != '' LIMIT 1) as delivery_address
    FROM projects p
    LEFT JOIN quotations q ON p.quotation_id = q.id
    LEFT JOIN customers qc ON q.customer_id = qc.id
    LEFT JOIN spks s ON s.project_id = p.id
    LEFT JOIN items fg ON fg.item_code = ('FG-' || p.id) AND fg.deleted_at IS NULL
    WHERE p.status IN ('FINISHED', 'COMPLETED', 'CLOSED')
      AND p.id NOT IN ('CONSUMABLE', 'TRANSPORTATION', 'OTHERS', 'GENERAL')
    ORDER BY COALESCE(p.completed_at, p.archived_at, p.created_at) DESC
  `).all() as any[];

  const existingFgItemIds = new Set(galleryItems.map((g) => String(g.id)));
  const portfolioProjects: any[] = [];

  for (const prj of completedErpProjects) {
    let fgGallery: string[] = [];
    try {
      fgGallery = JSON.parse(prj.fg_gallery_urls || "[]");
    } catch {
      fgGallery = [];
    }
    if (!Array.isArray(fgGallery)) fgGallery = [];
    fgGallery = fgGallery.filter((u) => typeof u === "string" && u.trim() !== "");
    const primaryImg = typeof prj.fg_image_url === "string" ? prj.fg_image_url.trim() : (fgGallery[0] || "");

    const completedVol = Number(prj.total_delivered_qty) > 0
      ? Number(prj.total_delivered_qty)
      : Number(prj.total_fg_qty) > 0
      ? Number(prj.total_fg_qty)
      : Number(prj.qty || 0);
    const uomLabel = prj.uom || "PCS";
    const formattedVolume = completedVol > 0
      ? `${completedVol.toLocaleString("id-ID")} ${uomLabel}`
      : `Proyek Selesai (${uomLabel})`;

    const dateStr = prj.completed_at || prj.archived_at || prj.created_at || prj.due_date || "";
    const parsedYear = dateStr ? String(new Date(dateStr).getFullYear()) : String(new Date().getFullYear());
    const yearStr = !isNaN(Number(parsedYear)) && Number(parsedYear) > 2000 ? parsedYear : String(new Date().getFullYear());

    const locationStr =
      (prj.delivery_address && String(prj.delivery_address).trim()) ||
      (prj.quotation_address && String(prj.quotation_address).trim()) ||
      "Jawa Timur";

    const materialStr =
      (prj.fg_name && prj.fg_spec ? `${prj.fg_name} (${prj.fg_spec})` : prj.fg_name) ||
      prj.spk_spec ||
      prj.name;

    portfolioProjects.push({
      id: `ERP-${prj.id}`,
      project_code: prj.id,
      project_name: prj.name,
      client_name: prj.customer || "Mitra Proyek B2B",
      location: locationStr,
      supply_volume: formattedVolume,
      product_used: materialStr,
      year: yearStr,
      image_url: primaryImg,
      testimonial_quote: "",
      testimonial_author: prj.spk_number ? `SPK Terverifikasi: ${prj.spk_number}` : `ID Proyek: ${prj.id}`,
      source_type: "ERP_PROJECT",
    });

    if (!prj.fg_item_id || !existingFgItemIds.has(String(prj.fg_item_id))) {
      galleryItems.push({
        id: `PRJ-GAL-${prj.id}`,
        item_code: prj.id,
        name: prj.name,
        dimension: `${prj.customer || "Proyek Selesai"} · ${formattedVolume}`,
        spec: materialStr,
        category: "Proyek Selesai",
        badge: "PROYEK SELESAI",
        image_url: primaryImg,
        gallery_urls: fgGallery,
        uom: uomLabel,
        available_qty: completedVol,
        unit_price: 0,
        source_type: "ERP_PROJECT",
      });
    }
  }

  // 3. Completed / Delivered Shop Orders
  const completedShopOrders = db.prepare(`
    SELECT 
      so.id,
      so.order_number,
      so.customer_name,
      c.name as customer_company,
      so.delivery_address,
      so.delivery_city,
      so.order_status,
      so.created_at
    FROM shop_orders so
    LEFT JOIN customers c ON so.customer_id = c.id
    WHERE so.order_status IN ('COMPLETED', 'DELIVERED')
    ORDER BY so.created_at DESC
    LIMIT 12
  `).all() as any[];

  for (const so of completedShopOrders) {
    const orderItems = db.prepare(`
      SELECT 
        soi.item_name,
        soi.qty,
        soi.uom,
        i.shop_image_url
      FROM shop_order_items soi
      LEFT JOIN items i ON soi.item_id = i.id
      WHERE soi.order_id = ?
    `).all(so.id) as any[];

    if (orderItems.length === 0) continue;

    const totalOrderQty = orderItems.reduce((acc, it) => acc + Number(it.qty || 0), 0);
    const primaryUom = orderItems[0]?.uom || "PCS";
    const materialsSummary = orderItems
      .map((it) => `${it.item_name} (${Number(it.qty || 0).toLocaleString("id-ID")} ${it.uom || "PCS"})`)
      .join(", ");
    const firstItemImg = orderItems.find((it) => it.shop_image_url && String(it.shop_image_url).trim() !== "")?.shop_image_url || "";

    const yr = so.created_at ? String(new Date(so.created_at).getFullYear()) : String(new Date().getFullYear());

    portfolioProjects.push({
      id: `SHOP-${so.order_number || so.id}`,
      project_code: so.order_number,
      project_name: `Suplai Material Toko Pabrik #${so.order_number}`,
      client_name: so.customer_company || so.customer_name || "Pelanggan Toko Pabrik",
      location: so.delivery_city || so.delivery_address || "Jawa Timur",
      supply_volume: `${totalOrderQty.toLocaleString("id-ID")} ${primaryUom}`,
      product_used: materialsSummary,
      year: yr,
      image_url: firstItemImg ? String(firstItemImg).trim() : "",
      testimonial_quote: "",
      testimonial_author: `Order Selesai: ${so.order_number}`,
      source_type: "SHOP_ORDER",
    });
  }

  const categories = Array.from(
    new Set(
      galleryItems
        .map((item) => item.category)
        .filter((cat): cat is string => typeof cat === "string" && cat.trim() !== "")
    )
  );

  return {
    galleryItems,
    categories,
    portfolioProjects,
  };
}

export function registerPublicStorefrontRoutes(shopRouter: Router) {
  shopRouter.get("/api/shop/products", (req, res) => {
    try {
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const category = (req.query.category as string || "").trim();
      const q = (req.query.q as string || "").trim();
      const sort = (req.query.sort as string || "popular").trim();
      const featuredOnly = req.query.featured === "true" || req.query.featured === "1";

      let sql = `
        SELECT 
          i.id,
          i.item_code,
          i.name,
          i.dimension,
          i.spec,
          i.category,
          i.description,
          i.uom,
          COALESCE(i.unit_price, 0) as unit_price,
          COALESCE(CASE WHEN i.shop_availability_type = 'MAKE_TO_ORDER' OR i.unit_price <= 0 THEN 0 ELSE i.shop_promo_price END, 0) as promo_price,
          COALESCE(i.shop_weight_kg, 2.5) as weight_kg,
          COALESCE(NULLIF(TRIM(i.shop_image_url), ''), '') as image_url,
          COALESCE(i.shop_gallery_urls, '[]') as shop_gallery_urls,
          COALESCE(i.shop_badge, '') as badge,
          COALESCE(i.shop_featured, 0) as is_featured,
          COALESCE(CASE WHEN i.shop_availability_type = 'MAKE_TO_ORDER' OR i.unit_price <= 0 THEN 'MAKE_TO_ORDER' ELSE i.shop_availability_type END, 'AUTO') as availability_type,
          COALESCE(i.shop_lead_time_days, 3) as lead_time_days,
          COALESCE(i.shop_moq, 1) as moq,
          COALESCE(i.shop_specs, '') as technical_specs,
          COALESCE(inv.available_qty, 0) as available_qty,
          COALESCE(inv.physical_qty, 0) as physical_qty
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id
        WHERE i.deleted_at IS NULL
          AND ((i.type IN ('FINISHED', 'FINISH_GOOD', 'FINISH_GOODS')) OR (i.item_code LIKE 'FG - %' OR i.item_code LIKE 'FG-%'))
          AND (i.type != 'MACHINE' OR i.type IS NULL) AND (i.item_code NOT LIKE 'MC - %' AND i.item_code NOT LIKE 'MC-%')
          AND COALESCE(i.is_published_shop, 1) = 1
      `;

      const params: any[] = [];

      if (category && category !== "ALL" && category !== "Semua") {
        sql += ` AND i.category = ?`;
        params.push(category);
      }

      if (q) {
        sql += ` AND (i.name LIKE ? OR i.item_code LIKE ? OR i.description LIKE ? OR i.spec LIKE ?)`;
        const wildcard = `%${q}%`;
        params.push(wildcard, wildcard, wildcard, wildcard);
      }

      if (featuredOnly) {
        sql += ` AND i.shop_featured = 1`;
      }

      if (sort === "price_asc") {
        sql += ` ORDER BY CASE WHEN i.shop_promo_price > 0 THEN i.shop_promo_price ELSE i.unit_price END ASC`;
      } else if (sort === "price_desc") {
        sql += ` ORDER BY CASE WHEN i.shop_promo_price > 0 THEN i.shop_promo_price ELSE i.unit_price END DESC`;
      } else if (sort === "name_asc") {
        sql += ` ORDER BY i.name ASC`;
      } else {
        sql += ` ORDER BY i.shop_featured DESC, i.name ASC`;
      }

      const rawItems = db.prepare(sql).all(...params) as any[];
      const items = rawItems.map((item) => {
        const media = normalizeStorefrontMedia(item.image_url, item.shop_gallery_urls);
        return {
          ...item,
          image_url: media.primaryUrl,
          gallery_urls: media.gallery,
          shop_gallery_urls: JSON.stringify(media.gallery),
        };
      });

      const categoriesRows = db.prepare(`
        SELECT DISTINCT category 
        FROM items 
        WHERE ((type IN ('FINISHED', 'FINISH_GOOD', 'FINISH_GOODS')) OR (item_code LIKE 'FG - %' OR item_code LIKE 'FG-%'))
          AND (type != 'MACHINE' OR type IS NULL) AND (item_code NOT LIKE 'MC - %' AND item_code NOT LIKE 'MC-%')
          AND deleted_at IS NULL 
          AND category IS NOT NULL 
          AND category != ''
          AND COALESCE(is_published_shop, 1) = 1
        ORDER BY category ASC
      `).all() as any[];

      const categories = categoriesRows.map(c => c.category);

      res.json({
        success: true,
        data: items,
        categories,
      });
    } catch (err: any) {
      console.error("[Shop API] Error fetching products:", err);
      res.status(500).json({ success: false, error: "Failed to fetch shop products" });
    }
  });

  shopRouter.get("/api/public/showcase", (_req, res) => {
    try {
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      const { galleryItems, categories, portfolioProjects } = buildPublicShowcaseData();
      res.json({
        success: true,
        data: {
          gallery_items: galleryItems,
          categories,
          portfolio_projects: portfolioProjects,
        },
      });
    } catch (err: any) {
      console.error("[Public Showcase API] Error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to load public showcase data",
      });
    }
  });

  shopRouter.get("/api/public/products", (_req, res) => {
    try {
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      const { galleryItems, categories } = buildPublicShowcaseData();
      res.json({
        success: true,
        data: galleryItems,
        categories,
      });
    } catch (err: any) {
      console.error("[Public Products API] Error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to load public products",
      });
    }
  });

  shopRouter.get("/api/shop/products/:id", (req, res) => {
    try {
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      const { id } = req.params;
      const item = db.prepare(`
        SELECT 
          i.id,
          i.item_code,
          i.name,
          i.dimension,
          i.spec,
          i.category,
          i.description,
          i.uom,
          COALESCE(i.unit_price, 0) as unit_price,
          COALESCE(CASE WHEN i.shop_availability_type = 'MAKE_TO_ORDER' OR i.unit_price <= 0 THEN 0 ELSE i.shop_promo_price END, 0) as promo_price,
          COALESCE(i.shop_weight_kg, 2.5) as weight_kg,
          COALESCE(NULLIF(TRIM(i.shop_image_url), ''), '') as image_url,
          COALESCE(i.shop_gallery_urls, '[]') as shop_gallery_urls,
          COALESCE(i.shop_badge, '') as badge,
          COALESCE(i.shop_featured, 0) as is_featured,
          COALESCE(CASE WHEN i.shop_availability_type = 'MAKE_TO_ORDER' OR i.unit_price <= 0 THEN 'MAKE_TO_ORDER' ELSE i.shop_availability_type END, 'AUTO') as availability_type,
          COALESCE(i.shop_lead_time_days, 3) as lead_time_days,
          COALESCE(i.shop_moq, 1) as moq,
          COALESCE(i.shop_specs, '') as technical_specs,
          COALESCE(inv.available_qty, 0) as available_qty,
          COALESCE(inv.physical_qty, 0) as physical_qty
        FROM items i
        LEFT JOIN inventory inv ON i.id = inv.item_id
        WHERE i.id = ? AND i.deleted_at IS NULL
      `).get(id) as any;

      if (!item) {
        return res.status(404).json({ success: false, error: "Product not found" });
      }

      const media = normalizeStorefrontMedia(item.image_url, item.shop_gallery_urls);

      res.json({
        success: true,
        data: {
          ...item,
          image_url: media.primaryUrl,
          gallery_urls: media.gallery,
          shop_gallery_urls: JSON.stringify(media.gallery),
        },
      });
    } catch (err: any) {
      console.error("[Shop API] Error fetching product detail:", err);
      res.status(500).json({ success: false, error: "Failed to fetch product detail" });
    }
  });

  shopRouter.post("/api/shop/checkout", (req, res) => {
    try {
      const {
        customer_name,
        customer_phone,
        customer_email,
        delivery_address,
        delivery_city,
        delivery_method,
        payment_method,
        customer_notes,
        items,
        delivery_distance = 0,
        is_dp = 0,
        dp_amount = 0,
        payment_proof_url = null,
      } = req.body;

      if (!customer_name || !customer_phone || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Customer name, phone number, and at least one item are required.",
        });
      }

      if (delivery_method === "DELIVERY" && (!delivery_address || !delivery_address.trim())) {
        return res.status(400).json({
          success: false,
          error: "Delivery address is required for home delivery orders.",
        });
      }

      const orderId = `SO-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const orderNumber = generateOrderNumber();

      const aggregatedLines = new Map<string, number>();
      for (const line of items) {
        const itemId = String(line?.item_id || "").trim();
        const qty = Math.floor(Number(line?.qty));
        if (!itemId || !qty || qty <= 0 || !Number.isFinite(qty)) {
          return res.status(400).json({
            success: false,
            error: "All item quantities must be positive whole numbers.",
          });
        }
        aggregatedLines.set(itemId, (aggregatedLines.get(itemId) || 0) + qty);
      }

      let shippingCost = 0;
      const safeDistance = Math.max(0, Number(delivery_distance) || 0);
      if (delivery_method === "DELIVERY") {
        shippingCost = Math.round(safeDistance * 10000);
      }

      const initialPaymentStatus =
        payment_method === "COD"
          ? "UNPAID"
          : payment_proof_url
            ? "AWAITING_VERIFICATION"
            : "PENDING_PAYMENT";

      const initialOrderStatus =
        payment_method === "COD"
          ? "PENDING_VERIFICATION"
          : payment_proof_url
            ? "PAYMENT_SUBMITTED"
            : "PENDING_PAYMENT";

      let subtotal = 0;
      let totalWeight = 0;
      let grandTotal = 0;
      const resolvedItems: any[] = [];

      db.transaction(() => {
        const itemLookupStmt = db.prepare(`
          SELECT id, item_code, name, uom, unit_price, shop_promo_price, shop_weight_kg, shop_availability_type
          FROM items
          WHERE id = ? AND deleted_at IS NULL
        `);
        const invLookupStmt = db.prepare(
          "SELECT COALESCE(available_qty, 0) as avail FROM inventory WHERE item_id = ?"
        );
        const atomicReserveStmt = db.prepare(`
          UPDATE inventory
          SET reserved_qty = COALESCE(reserved_qty, 0) + ?,
              allocated_stock = COALESCE(allocated_stock, 0) + ?,
              available_qty = COALESCE(available_qty, 0) - ?,
              free_stock = MAX(0, COALESCE(free_stock, 0) - ?)
          WHERE item_id = ? AND COALESCE(available_qty, 0) >= ?
        `);

        let hasMtoItem = false;
        let hasMtsItem = false;

        for (const [itemId, qty] of aggregatedLines.entries()) {
          const itemRow = itemLookupStmt.get(itemId) as any;
          if (!itemRow) {
            throw new Error(`CHECKOUT_VALIDATION:Item with ID ${itemId} was not found.`);
          }

          const isMakeToOrder =
            itemRow.shop_availability_type === "MAKE_TO_ORDER" ||
            Number(itemRow.unit_price) <= 0;

          let itemFulfillmentType: "READY_STOCK" | "MAKE_TO_ORDER" = isMakeToOrder
            ? "MAKE_TO_ORDER"
            : "READY_STOCK";
          let mtoQty = isMakeToOrder ? qty : 0;

          if (!isMakeToOrder) {
            const reserveResult = atomicReserveStmt.run(
              qty,
              qty,
              qty,
              qty,
              itemRow.id,
              qty
            );
            if (reserveResult.changes === 0) {
              const invRow = invLookupStmt.get(itemRow.id) as any;
              const availableStock = invRow ? Number(invRow.avail) || 0 : 0;
              if (req.body.allow_mto_fallback === true) {
                if (availableStock > 0) {
                  atomicReserveStmt.run(
                    availableStock,
                    availableStock,
                    availableStock,
                    availableStock,
                    itemRow.id,
                    availableStock
                  );
                  hasMtsItem = true;
                }
                mtoQty = Math.max(0, qty - availableStock);
                itemFulfillmentType = "MAKE_TO_ORDER";
                hasMtoItem = true;
              } else {
                throw new Error(
                  `CHECKOUT_VALIDATION:Stok tidak mencukupi untuk [${itemRow.name}]. Tersedia: ${availableStock}, Diminta: ${qty}.`
                );
              }
            } else {
              hasMtsItem = true;
            }
          } else {
            hasMtoItem = true;
          }

          const effectivePrice =
            itemRow.shop_promo_price > 0 ? itemRow.shop_promo_price : itemRow.unit_price;
          const lineTotal = effectivePrice * qty;
          const weight = (itemRow.shop_weight_kg || 2.5) * qty;

          subtotal += lineTotal;
          totalWeight += weight;

          resolvedItems.push({
            id: `SOI-${orderId}-${resolvedItems.length + 1}`,
            order_id: orderId,
            item_id: itemRow.id,
            item_code: itemRow.item_code,
            item_name: itemRow.name,
            uom: itemRow.uom,
            qty,
            unit_price: effectivePrice,
            total_price: lineTotal,
            weight_kg: weight,
            fulfillment_type: itemFulfillmentType,
            mto_qty: mtoQty,
            estimated_lead_days: itemFulfillmentType === "MAKE_TO_ORDER" ? 5 : 1,
          });
        }

        grandTotal = subtotal + shippingCost;

        const dppAmount = Math.round(subtotal / 1.11);
        const taxBreakdown = calculateFinancialBreakdown({
          grossAmount: dppAmount,
          taxRate: 12,
          taxScheme: "DPP_NILAI_LAIN",
        });
        const dppNilaiLain = taxBreakdown.dppNilaiLain;
        const ppnAmount = Math.max(0, subtotal - dppAmount);

        const fulfillmentMode: "MTS" | "MTO" | "HYBRID" =
          hasMtoItem && hasMtsItem ? "HYBRID" : hasMtoItem ? "MTO" : "MTS";
        const productionStatus = hasMtoItem ? "PENDING_SPK" : "NOT_REQUIRED";

        let resolvedCustomerId: string | null = null;
        const cleanEmail = customer_email ? customer_email.trim().toLowerCase() : "";
        const cleanPhone = customer_phone ? customer_phone.trim() : "";
        const cleanName = customer_name ? customer_name.trim() : "Pelanggan Storefront";

        try {
          const existingCustomer = db
            .prepare(
              `SELECT id, customer_type, customer_segment FROM customers
               WHERE archived_at IS NULL
                 AND ((phone = ? AND phone IS NOT NULL AND phone != '')
                   OR (LOWER(email) = ? AND email IS NOT NULL AND email != ''))
               LIMIT 1`
            )
            .get(cleanPhone, cleanEmail) as any;

          if (existingCustomer) {
            resolvedCustomerId = existingCustomer.id;
            const prevSeg = String(existingCustomer.customer_segment || existingCustomer.customer_type || "B2C").toUpperCase();
            const newSegment = prevSeg === "B2B" || prevSeg === "OMNICHANNEL" ? "OMNICHANNEL" : "B2C";
            db.prepare(
              `UPDATE customers
               SET customer_segment = ?,
                   phone = COALESCE(NULLIF(phone, ''), ?),
                   email = COALESCE(NULLIF(email, ''), ?),
                   address = COALESCE(NULLIF(address, ''), ?)
               WHERE id = ?`
            ).run(newSegment, cleanPhone || null, cleanEmail || null, (delivery_address || "").trim() || null, resolvedCustomerId);
          } else {
            resolvedCustomerId = `CUS-B2C-${Date.now().toString(36).toUpperCase()}`;
            const existingCusts = db
              .prepare("SELECT code FROM customers WHERE archived_at IS NULL")
              .all() as any[];
            let seq = getNextEntitySequence("CUS", existingCusts);
            let custCode = generateSmartCustomerCode(cleanName, seq);
            while (db.prepare("SELECT id FROM customers WHERE code = ? COLLATE NOCASE").get(custCode)) {
              seq++;
              custCode = generateSmartCustomerCode(cleanName, seq);
            }
            db.prepare(
              `INSERT INTO customers (
                 id, code, name, contact_person, email, phone, address,
                 customer_type, customer_segment, credit_limit, payment_terms_days
               ) VALUES (?, ?, ?, ?, ?, ?, ?, 'B2C', 'B2C', 0, 0)`
            ).run(
              resolvedCustomerId,
              custCode,
              cleanName,
              cleanName,
              cleanEmail || null,
              cleanPhone || null,
              (delivery_address || "Storefront B2C").trim()
            );
          }
        } catch (custErr) {
          console.warn("[Shop Checkout] Customer unification note:", custErr);
        }

        db.prepare(`
          INSERT INTO shop_orders (
            id, order_number, customer_id, customer_name, customer_phone, customer_email,
            delivery_address, delivery_city, delivery_method, shipping_cost,
            subtotal_amount, dpp_amount, dpp_nilai_lain, ppn_amount, tax_scheme,
            total_amount, payment_method, payment_status,
            order_status, fulfillment_mode, production_status,
            customer_notes, payment_proof_url, is_dp, dp_amount, delivery_distance, created_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, 'DPP_NILAI_LAIN',
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
          )
        `).run(
          orderId,
          orderNumber,
          resolvedCustomerId,
          cleanName,
          cleanPhone,
          cleanEmail || null,
          (delivery_address || "").trim(),
          delivery_city ? delivery_city.trim() : "Banyuwangi",
          delivery_method || "DELIVERY",
          shippingCost,
          subtotal,
          dppAmount,
          dppNilaiLain,
          ppnAmount,
          grandTotal,
          payment_method || "TRANSFER_MANUAL",
          initialPaymentStatus,
          initialOrderStatus,
          fulfillmentMode,
          productionStatus,
          customer_notes ? customer_notes.trim() : null,
          payment_proof_url || null,
          Number(is_dp) || 0,
          Number(dp_amount) || 0,
          Number(delivery_distance) || 0
        );

        const itemInsert = db.prepare(`
          INSERT INTO shop_order_items (
            id, order_id, item_id, item_code, item_name, uom, qty, unit_price, total_price, weight_kg,
            fulfillment_type, mto_qty, estimated_lead_days
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `);

        for (const item of resolvedItems) {
          itemInsert.run(
            item.id,
            item.order_id,
            item.item_id,
            item.item_code,
            item.item_name,
            item.uom,
            item.qty,
            item.unit_price,
            item.total_price,
            item.weight_kg,
            item.fulfillment_type || "READY_STOCK",
            item.mto_qty || 0,
            item.estimated_lead_days || 1
          );
        }

        try {
          if (cleanEmail || cleanPhone) {
            db.prepare(`
              UPDATE potential_customers
              SET status = 'CONVERTED',
                  converted_order_id = ?,
                  customer_id = COALESCE(?, customer_id),
                  phone = COALESCE(NULLIF(?, ''), phone),
                  customer_name = COALESCE(NULLIF(?, ''), customer_name),
                  cart_snapshot = '[]',
                  cart_total_value = 0,
                  cart_total_items = 0,
                  last_active_at = ?
              WHERE (LOWER(email) = ? AND email IS NOT NULL AND email != '')
                 OR (phone = ? AND phone IS NOT NULL AND phone != '')
            `).run(orderNumber, resolvedCustomerId, cleanPhone, cleanName, new Date().toISOString(), cleanEmail, cleanPhone);
          }
        } catch (convErr) {
          console.warn("[Shop API] Potential customer conversion sync note:", convErr);
        }
      })();

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
          order_id: orderId,
          order_number: orderNumber,
          subtotal,
          shipping_cost: shippingCost,
          total_amount: grandTotal,
          total_weight_kg: totalWeight,
          payment_method,
          payment_status: initialPaymentStatus,
          order_status: initialOrderStatus,
          items: resolvedItems,
          payment_instructions: paymentInstructions,
        },
      });
    } catch (err: any) {
      if (err?.message?.startsWith("CHECKOUT_VALIDATION:")) {
        return res.status(400).json({
          success: false,
          error: err.message.replace("CHECKOUT_VALIDATION:", ""),
        });
      }
      console.error("[Shop API] Checkout error:", err);
      res.status(500).json({ success: false, error: "Checkout failed: " + err.message });
    }
  });
}
