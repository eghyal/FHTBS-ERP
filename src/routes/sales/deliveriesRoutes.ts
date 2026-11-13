import { Router } from "express";
import db from "../../db/database.ts";
import { requireRole, getActor } from "../../middleware/auth.ts";
import { isValidDailyAuthKey } from "../../utils/auth.ts";
import { logAudit } from "../../utils/audit.ts";
import { postDeliveryDispatchJournal } from "../../utils/accountingBridge.ts";
import { outboxService } from "../../services/outboxService.ts";
import { generateDNNumber, getDeliveryNoteItemsWithPrices } from "./helpers.ts";
import crypto from "crypto";

export function registerDeliveriesRoutes(salesRouter: Router) {
  salesRouter.get(
    "/api/sales/deliveries",
    requireRole([
      "WAREHOUSE",
      "FC",
      "BOD",
      "DIRECTOR",
      "ADMIN",
      "SALES",
      "FINANCE",
      "PRODUCTION",
      "ENGINEERING",
      "PURCHASING",
    ]),
    (req, res) => {
      try {
        const { status } = req.query;
        let query = `
      SELECT dn.*, 
             c.name as customer_name, 
             q.quotation_number, 
             q.title as quotation_title,
             p.name as project_name,
             (SELECT GROUP_CONCAT(p2.id, ', ') FROM projects p2 WHERE (dn.quotation_id IS NOT NULL AND p2.quotation_id = dn.quotation_id) OR (dn.project_id IS NOT NULL AND p2.id = dn.project_id)) as project_ids,
             (SELECT GROUP_CONCAT(p2.name, ', ') FROM projects p2 WHERE (dn.quotation_id IS NOT NULL AND p2.quotation_id = dn.quotation_id) OR (dn.project_id IS NOT NULL AND p2.id = dn.project_id)) as project_names
      FROM delivery_notes dn
      LEFT JOIN customers c ON dn.customer_id = c.id
      LEFT JOIN quotations q ON dn.quotation_id = q.id
      LEFT JOIN projects p ON dn.project_id = p.id
    `;
        let data;
        if (status) {
          query += ` WHERE dn.status = ? ORDER BY dn.created_at DESC`;
          data = db.prepare(query).all(status);
        } else {
          query += ` ORDER BY dn.created_at DESC`;
          data = db.prepare(query).all();
        }
        res.json(data);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch delivery notes" });
      }
    },
  );

  salesRouter.post(
    "/api/sales/deliveries",
    requireRole(["FC", "SALES"]),
    (req, res) => {
      try {
        const { customer_id, quotation_id, project_id, remarks, items, police_number, delivery_type, is_partial, delivery_date } =
          req.body;
        if (
          !customer_id ||
          !items ||
          !Array.isArray(items) ||
          items.length === 0
        ) {
          return res.status(400).json({ error: "Missing customer or items" });
        }

        const isPartialDelivery = Boolean(is_partial || delivery_type === "PARTIAL");

        if (!isPartialDelivery) {
          if (quotation_id) {
            const q = db
              .prepare("SELECT * FROM quotations WHERE id = ?")
              .get(quotation_id) as any;
            const relatedProjects = db
              .prepare("SELECT * FROM projects WHERE quotation_id = ?")
              .all(quotation_id) as any[];

            if (relatedProjects.length > 0) {
              const unfinished = relatedProjects.filter(
                (p) =>
                  p.status !== "FINISHED" &&
                  p.status !== "COMPLETED" &&
                  p.status !== "CLOSED",
              );
              if (unfinished.length > 0) {
                const unfinishedList = unfinished
                  .map((p) => `'${p.name}' (${p.status})`)
                  .join(", ");
                return res.status(400).json({
                  error: `Cannot issue Full Delivery Note: Quotation '${q?.quotation_number || quotation_id}' has unfinished project(s): ${unfinishedList}. You may issue a Partial Delivery Note instead if partial shipments are accepted.`,
                });
              }
            }
          } else if (project_id) {
            const proj = db
              .prepare("SELECT * FROM projects WHERE id = ?")
              .get(project_id) as any;
            if (proj) {
              const isProjectFinished =
                proj.status === "FINISHED" ||
                proj.status === "COMPLETED" ||
                proj.status === "CLOSED";
              if (!isProjectFinished) {
                return res.status(400).json({
                  error: `Cannot issue Full Delivery Note: Project '${proj.name}' is currently in '${proj.status}' status. You may issue a Partial Delivery Note instead for completed lots.`,
                });
              }
            }
          }
        }

        const dnId = "DN-" + crypto.randomUUID();
        const dnNumber = generateDNNumber();
        const nowIso = new Date().toISOString();
        const deliveryDateStr = delivery_date || nowIso;

        let resolvedProjectId = project_id || null;
        if (!resolvedProjectId && quotation_id) {
          const firstProj = db
            .prepare("SELECT id FROM projects WHERE quotation_id = ? ORDER BY created_at DESC LIMIT 1")
            .get(quotation_id) as any;
          if (firstProj) resolvedProjectId = firstProj.id;
        }

        const linkedProject = resolvedProjectId
          ? (db
              .prepare(
                `SELECT p.id, COALESCE(p.spk_number, s.spk_number) as spk_number
                 FROM projects p
                 LEFT JOIN spks s ON s.project_id = p.id
                 WHERE p.id = ? LIMIT 1`
              )
              .get(resolvedProjectId) as any)
          : null;

        const linkedFgr = resolvedProjectId
          ? (db
              .prepare(
                "SELECT id, fgr_number FROM finish_good_records WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"
              )
              .get(resolvedProjectId) as any)
          : null;

        const fgrId = req.body.fgr_id || linkedFgr?.id || null;
        const fgrNumber = req.body.fgr_number || linkedFgr?.fgr_number || null;
        const spkNumber = req.body.spk_number || linkedProject?.spk_number || null;
        const fulfillmentMode = req.body.fulfillment_mode || (resolvedProjectId ? "MTO" : "MTS");

        db.transaction(() => {
          db.prepare(
            "INSERT INTO delivery_notes (id, dn_number, customer_id, quotation_id, project_id, remarks, police_number, delivery_type, is_partial, fgr_id, fgr_number, spk_number, fulfillment_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(
            dnId,
            dnNumber,
            customer_id,
            quotation_id || null,
            resolvedProjectId,
            remarks || null,
            police_number || null,
            isPartialDelivery ? "PARTIAL" : "FULL",
            isPartialDelivery ? 1 : 0,
            fgrId,
            fgrNumber,
            spkNumber,
            fulfillmentMode
          );

          const insertItem = db.prepare(
            "INSERT INTO delivery_items (id, dn_id, item_id, qty, uom, remarks) VALUES (?, ?, ?, ?, ?, ?)",
          );
          for (const item of items) {
            let targetItemId = item.item_id;
            const itemName = item.item_name || item.name || item.title || "Commercial Item";
            const itemQty = Number(item.qty_delivered || item.qty || item.quantity || 1);
            const itemUom = item.uom || "Unit";

            if (!targetItemId) {
              targetItemId = "ITM-FG-" + crypto.randomUUID().substring(0, 8);
              db.prepare(
                "INSERT OR IGNORE INTO items (id, item_code, name, uom, type, unit_price, selling_price) VALUES (?, ?, ?, ?, 'FINISHED', 0, 0)",
              ).run(
                targetItemId,
                item.item_code || `FG-${targetItemId}`,
                itemName,
                itemUom,
              );
              db.prepare("INSERT OR IGNORE INTO inventory (item_id, physical_qty, available_qty, free_stock) VALUES (?, 0, 0, 0)").run(targetItemId);
            } else {
              const existingItem = db
                .prepare("SELECT id, name FROM items WHERE id = ?")
                .get(targetItemId) as any;
              if (!existingItem) {
                db.prepare(
                  "INSERT INTO items (id, item_code, name, uom, type, unit_price, selling_price) VALUES (?, ?, ?, ?, 'FINISHED', 0, 0)",
                ).run(
                  targetItemId,
                  item.item_code || `FG-${targetItemId}`,
                  itemName,
                  itemUom,
                );
                db.prepare("INSERT OR IGNORE INTO inventory (item_id, physical_qty, available_qty, free_stock) VALUES (?, 0, 0, 0)").run(targetItemId);
              } else if (itemName && (existingItem.name === "Commercial Item" || existingItem.name !== itemName)) {
                db.prepare("UPDATE items SET name = ?, uom = ? WHERE id = ?").run(
                  itemName,
                  itemUom,
                  targetItemId,
                );
              }
            }

            insertItem.run(
              "DNI-" + crypto.randomUUID(),
              dnId,
              targetItemId,
              itemQty,
              itemUom,
              item.remarks || null,
            );
          }

          outboxService.enqueue(
            db,
            "DELIVERY_NOTES",
            dnId,
            "CREATE",
            {
              id: dnId,
              dn_number: dnNumber,
              customer_id,
              project_id: project_id || null,
              quotation_id: quotation_id || null,
              status: "DRAFTED",
              delivery_date: deliveryDateStr,
              created_at: nowIso,
            },
            "BOTH"
          );
        })();

        res.json({ success: true, id: dnId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create Delivery Note" });
      }
    },
  );

  salesRouter.get(
    "/api/sales/deliveries/:id",
    requireRole(["WAREHOUSE", "FC", "SALES", "FINANCE"]),
    (req, res) => {
      try {
        const dn = db
          .prepare(
            `
      SELECT dn.*, 
             c.name as customer_name, c.address as customer_address, c.code as customer_code, c.phone as customer_phone, c.email as customer_email,
             q.quotation_number, q.title as quotation_title,
             p.name as project_name,
             (SELECT GROUP_CONCAT(p2.name, ', ') FROM projects p2 WHERE (dn.quotation_id IS NOT NULL AND p2.quotation_id = dn.quotation_id) OR (dn.project_id IS NOT NULL AND p2.id = dn.project_id)) as project_names
      FROM delivery_notes dn
      LEFT JOIN customers c ON dn.customer_id = c.id
      LEFT JOIN quotations q ON dn.quotation_id = q.id
      LEFT JOIN projects p ON dn.project_id = p.id
      WHERE dn.id = ?
    `,
          )
          .get(req.params.id) as any;

        if (!dn) return res.status(404).json({ error: "Delivery not found" });

        dn.items = getDeliveryNoteItemsWithPrices(dn.id);

        dn.signatures = db
          .prepare(
            `
      SELECT * FROM dn_signatures WHERE dn_id = ?
    `,
          )
          .all(req.params.id);

        res.json(dn);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch Dn details" });
      }
    },
  );

  salesRouter.put(
    "/api/sales/deliveries/:id",
    requireRole(["SALES", "FC"]),
    (req, res) => {
      try {
        const { customer_id, quotation_id, project_id, remarks, police_number, items } =
          req.body;
        const dnId = req.params.id;

        const dn = db
          .prepare("SELECT * FROM delivery_notes WHERE id = ?")
          .get(dnId) as any;
        if (!dn) return res.status(404).json({ error: "Delivery not found" });

        if (quotation_id) {
          const q = db
            .prepare("SELECT * FROM quotations WHERE id = ?")
            .get(quotation_id) as any;
          const relatedProjects = db
            .prepare("SELECT * FROM projects WHERE quotation_id = ?")
            .all(quotation_id) as any[];

          if (relatedProjects.length > 0) {
            const unfinished = relatedProjects.filter(
              (p) =>
                p.status !== "FINISHED" &&
                p.status !== "COMPLETED" &&
                p.status !== "CLOSED",
            );
            if (unfinished.length > 0) {
              const unfinishedList = unfinished
                .map((p) => `'${p.name}' (${p.status})`)
                .join(", ");
              return res.status(400).json({
                error: `Cannot issue Delivery Note: Quotation '${q?.quotation_number || quotation_id}' has unfinished project(s): ${unfinishedList}. All projects in the quotation must reach FINISHED state before a Delivery Note can be issued.`,
              });
            }
          }
        } else if (project_id) {
          const proj = db
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(project_id) as any;
          if (proj) {
            const isProjectFinished =
              proj.status === "FINISHED" ||
              proj.status === "COMPLETED" ||
              proj.status === "CLOSED";
            if (!isProjectFinished) {
              let quoItemCount = 0;
              if (proj.quotation_id) {
                const qCnt = db
                  .prepare(
                    "SELECT COUNT(*) as cnt FROM quotation_items WHERE quotation_id = ?",
                  )
                  .get(proj.quotation_id) as any;
                quoItemCount = qCnt?.cnt || 0;
              }
              return res.status(400).json({
                error: `Cannot issue Delivery Note: Project '${proj.name}' is currently in '${proj.status}' status. All ${quoItemCount > 0 ? quoItemCount + " items in the quotation" : "project items"} must reach FINISHED state before a Delivery Note can be issued.`,
              });
            }
          }
        }

        db.transaction(() => {
          db.prepare(
            `
            UPDATE delivery_notes 
            SET customer_id = ?, quotation_id = ?, project_id = ?, remarks = ?, police_number = ?, status = 'DRAFT', revision_note = NULL
            WHERE id = ?
          `,
          ).run(
            customer_id,
            quotation_id || null,
            project_id || null,
            remarks || null,
            police_number || null,
            dnId,
          );

          db.prepare("DELETE FROM delivery_items WHERE dn_id = ?").run(dnId);

          const insertItem = db.prepare(
            "INSERT INTO delivery_items (id, dn_id, item_id, qty, uom, remarks) VALUES (?, ?, ?, ?, ?, ?)",
          );

          const candidateItemIds = items.map((i: any) => i.item_id).filter(Boolean);
          const existingItemSet = new Set<string>();
          if (candidateItemIds.length > 0) {
            const placeholders = candidateItemIds.map(() => "?").join(",");
            const found = db.prepare(`SELECT id FROM items WHERE id IN (${placeholders})`).all(...candidateItemIds) as any[];
            for (const f of found) existingItemSet.add(f.id);
          }

          for (const item of items) {
            if (!existingItemSet.has(item.item_id)) {
              db.prepare(
                "INSERT INTO items (id, item_code, name, uom, category) VALUES (?, ?, ?, ?, 'FG')",
              ).run(
                item.item_id,
                item.item_code || `FG-${item.item_id}`,
                item.item_name || "Commercial Item",
                item.uom || "Unit",
              );
              existingItemSet.add(item.item_id);
            }

            insertItem.run(
              "DNI-" + Math.random().toString(36).substr(2, 9),
              dnId,
              item.item_id,
              item.qty,
              item.uom || "Unit",
              item.remarks || null,
            );
          }
        })();

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "UPDATE_DELIVERY",
          "DELIVERY_NOTE",
          dnId,
          `Revised delivery note ${dn.dn_number}`,
        );

        res.json({ success: true, id: dnId });
      } catch (error: any) {
        console.error(error);
        res
          .status(500)
          .json({
            error: "Failed to update delivery note",
            details: error.message,
          });
      }
    },
  );

  salesRouter.post(
    "/api/sales/deliveries/:id/authorize",
    requireRole([
      "SALES",
      "WAREHOUSE",
      "FC",
      "BOD",
      "DIRECTOR",
      "ADMIN",
      "SUPERADMIN",
    ]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      const username = getActor(req);
      const { pin } = req.body || {};

      if (pin && !isValidDailyAuthKey(username, pin)) {
        return res.status(400).json({ error: "Invalid authorization PIN" });
      }

      const isExec = [
        "FC",
        "BOD",
        "DIRECTOR",
        "ADMIN",
        "SUPERADMIN",
        "SUPER_ADMIN",
        "GOD_MODE",
      ].includes(userRole);

      if (
        !isExec &&
        userLevel !== "SUPER_ADMIN" &&
        userLevel !== "MANAGER"
      ) {
        return res.status(403).json({
          error:
            "Access denied. Only Department Managers or Executive accounts can authorize delivery notes.",
        });
      }

      try {
        const dnId = req.params.id;
        const dn = db
          .prepare("SELECT * FROM delivery_notes WHERE id = ?")
          .get(dnId) as any;

        if (!dn) {
          return res.status(404).json({ error: "Delivery note not found" });
        }

        if (dn.status !== "DRAFT" && dn.status !== "DRAFTED" && dn.status !== "REVISION") {
          return res.status(400).json({
            error: `Cannot authorize delivery note in '${dn.status}' status. Only DRAFT or REVISION notes can be authorized.`,
          });
        }

        db.prepare(
          "UPDATE delivery_notes SET status = 'AUTHORIZED', authorized_at = CURRENT_TIMESTAMP, authorized_by = ?, revision_note = NULL WHERE id = ?",
        ).run(username, dnId);

        logAudit(
          username,
          "AUTHORIZE_DELIVERY",
          "DELIVERY_NOTE",
          dnId,
          `Authorized delivery note ${dn.dn_number} by Manager/Executive`,
        );

        res.json({
          success: true,
          message: "Delivery note authorized successfully and forwarded to Warehouse.",
        });
      } catch (err: any) {
        console.error(err);
        res.status(500).json({
          error: "Failed to authorize delivery note",
          details: err.message,
        });
      }
    },
  );

  salesRouter.post(
    "/api/sales/deliveries/revise-dn",
    requireRole([
      "WAREHOUSE",
      "SALES",
      "FC",
      "BOD",
      "DIRECTOR",
      "ADMIN",
      "SUPERADMIN",
    ]),
    (req, res) => {
      const userRole = (req as any).userRole;
      const userLevel = (req as any).userLevel;
      const username = getActor(req);
      const { pin } = req.body || {};

      if (pin && !isValidDailyAuthKey(username, pin)) {
        return res.status(400).json({ error: "Invalid authorization PIN" });
      }

      const isExec = [
        "FC",
        "BOD",
        "DIRECTOR",
        "ADMIN",
        "SUPERADMIN",
      ].includes(userRole);
      if (!isExec && userLevel !== "MANAGER") {
        return res.status(403).json({
          error:
            "Access denied. Only Managers or Executive accounts can revise deliveries.",
        });
      }
      try {
        const { dn_id, revision_note } = req.body;
        if (!revision_note) {
          return res.status(400).json({ error: "Revision note is required" });
        }

        const dn = db
          .prepare("SELECT * FROM delivery_notes WHERE id = ?")
          .get(dn_id) as any;
        if (!dn) {
          return res.status(404).json({ error: "Delivery not found" });
        }

        db.prepare(
          "UPDATE delivery_notes SET status = 'REVISION', revision_note = ? WHERE id = ?",
        ).run(revision_note, dn_id);

        logAudit(
          (req.headers["x-user-email"] as string) || null,
          "REVISE_DELIVERY",
          "DELIVERY_NOTE",
          dn_id,
          `Revise delivery note ${dn.dn_number} with note: ${revision_note}`,
        );

        res.json({ success: true, message: "Delivery marked for revision" });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: "Failed to revise delivery", details: err.message });
      }
    },
  );

  salesRouter.post(
    "/api/sales/deliveries/:id/upload-dispatch",
    requireRole(["WAREHOUSE", "FC", "SALES"]),
    (req, res) => {
      const userRole = (req as any).userRole;
      if (
        userRole !== "FC" &&
        userRole !== "WAREHOUSE" &&
        userRole !== "SALES"
      ) {
        return res.status(403).json({
          error:
            "Access denied. Warehouse, Sales or FC accounts can authorize delivery dispatch approvals.",
        });
      }
      try {
        const { file_url } = req.body;
        const username = (req.headers["x-user-email"] ||
          req.headers["remote-user"] ||
          req.headers["x-forwarded-user"]) as string;
        const dn = db
          .prepare("SELECT * FROM delivery_notes WHERE id = ?")
          .get(req.params.id) as any;
        if (!dn) return res.status(404).json({ error: "Delivery not found" });
        if (dn.status === "DELIVERED")
          return res
            .status(400)
            .json({
              error:
                "Delivery note is already marked as DELIVERED.",
            });

        const items = db
          .prepare("SELECT * FROM delivery_items WHERE dn_id = ?")
          .all(req.params.id) as any[];

        db.transaction(() => {
          const moveHist = db.prepare(
            "INSERT INTO stock_movements (id, item_id, type, qty, reference_id, recorded_by, project_id) VALUES (?, ?, 'RELEASE', ?, ?, ?, ?)",
          );

          const rawItemIds = items.map((i: any) => i.item_id).filter(Boolean);
          const itemLookupMap = new Map<string, string>();
          if (rawItemIds.length > 0) {
            const placeholders = rawItemIds.map(() => "?").join(",");
            const foundItems = db.prepare(`SELECT id, item_code FROM items WHERE id IN (${placeholders}) OR item_code IN (${placeholders})`).all(...rawItemIds, ...rawItemIds) as any[];
            for (const fi of foundItems) {
              itemLookupMap.set(fi.id, fi.id);
              if (fi.item_code) itemLookupMap.set(fi.item_code, fi.id);
            }
          }

          for (const item of items) {
            const actualItemId = itemLookupMap.get(item.item_id) || item.item_id;

            db.prepare(
              "INSERT OR IGNORE INTO inventory (item_id, physical_qty, reserved_qty, available_qty, free_stock, allocated_stock) VALUES (?, 0, 0, 0, 0, 0)",
            ).run(actualItemId);

            const updateInv = db.prepare(
              `UPDATE inventory 
               SET free_stock = free_stock - ?,
                   available_qty = available_qty - ?,
                   physical_qty = physical_qty - ?
               WHERE item_id = ? AND free_stock >= ?`
            ).run(item.qty, item.qty, item.qty, actualItemId, item.qty);
            
            if (updateInv.changes === 0) {
              throw new Error(`Insufficient stock for item ${actualItemId}`);
            }

            moveHist.run(
              "SMV-" + crypto.randomUUID(),
              actualItemId,
              item.qty,
              dn.id,
              username,
              dn.project_id || null,
            );
          }

          db.prepare(
            `
          INSERT INTO dn_signatures (id, dn_id, role, signer_name, file_url) 
          VALUES (?, ?, ?, ?, ?)
       `,
          ).run(
            "DNS-" + crypto.randomUUID(),
            dn.id,
            "DISPATCH_PHASE",
            username,
            file_url,
          );

          db.prepare(
            "UPDATE delivery_notes SET status = 'IN_DELIVERY', shipped_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(req.params.id);
        })();

        try {
          const dnCostRow = db.prepare(`
            SELECT COALESCE(SUM(di.qty * COALESCE(i.unit_price, 0)), 0) as total_cogs
            FROM delivery_items di
            LEFT JOIN items i ON di.item_id = i.id
            WHERE di.dn_id = ?
          `).get(req.params.id) as { total_cogs: number };

          const totalCogs = Number(dnCostRow?.total_cogs || 0);
          if (totalCogs > 0) {
            postDeliveryDispatchJournal(db, {
              dn_id: req.params.id,
              dn_number: dn.dn_number || req.params.id,
              total_cogs: totalCogs,
              user: username || "WAREHOUSE",
            });
          }
        } catch (dnAccErr) {
          console.error("Automated Accounting postDeliveryDispatchJournal error:", dnAccErr);
        }

        res.json({ success: true });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: err.message || "Failed to dispatch delivery" });
      }
    },
  );

  salesRouter.post(
    "/api/sales/deliveries/:id/start-delivery",
    requireRole(["FC", "SALES", "WAREHOUSE"]),
    (req, res) => {
      try {
        const dn = db
          .prepare("SELECT * FROM delivery_notes WHERE id = ?")
          .get(req.params.id) as any;
        if (!dn) return res.status(404).json({ error: "Delivery not found" });

        if (dn.status !== "PENDING_DELIVERY") {
          return res.status(400).json({
            error:
              "Cannot start delivery. Warehouse must authorize dispatch first.",
          });
        }

        db.transaction(() => {
          db.prepare(
            "UPDATE delivery_notes SET status = 'IN_DELIVERY', shipped_at = COALESCE(shipped_at, CURRENT_TIMESTAMP) WHERE id = ?",
          ).run(req.params.id);
        })();
        res.json({ success: true });
      } catch (err: any) {
        console.error(err);
        res
          .status(500)
          .json({ error: err.message || "Failed to start delivery" });
      }
    },
  );

  salesRouter.post(
    "/api/sales/deliveries/:id/finish-delivery",
    requireRole(["FC", "SALES", "WAREHOUSE"]),
    (req, res) => {
      try {
        const { file_url } = req.body;
        const username = (req.headers["x-user-email"] ||
          req.headers["remote-user"] ||
          req.headers["x-forwarded-user"]) as string;
        const dn = db
          .prepare("SELECT * FROM delivery_notes WHERE id = ?")
          .get(req.params.id) as any;
        if (!dn) return res.status(404).json({ error: "Delivery not found" });
        if (dn.status !== "IN_DELIVERY" && dn.status !== "PENDING_DELIVERY")
          return res.status(400).json({ error: "DN must be IN_DELIVERY or PENDING_DELIVERY" });

        db.transaction(() => {
          db.prepare(
            `
          INSERT INTO dn_signatures (id, dn_id, role, signer_name, file_url) 
          VALUES (?, ?, ?, ?, ?)
       `,
          ).run(
            "DNS-" + crypto.randomUUID(),
            dn.id,
            "PARTY_2",
            username,
            file_url,
          );

          db.prepare(
            "UPDATE delivery_notes SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP WHERE id = ?",
          ).run(req.params.id);
        })();
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Failed to finish delivery" });
      }
    },
  );
}
