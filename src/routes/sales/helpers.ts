import db from "../../db/database.ts";

/**
 * Pure domain helpers for Sales & Outbound Delivery routes.
 */
export const generateDNNumber = (): string => {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const iso = new Date().toISOString();
  return `DN-${iso.slice(2, 4)}${iso.slice(5, 7)}-${result}`;
};

export function batchGetDeliveryNoteItemsWithPrices(dnIds: string[]): Map<string, any[]> {
  const resultMap = new Map<string, any[]>();
  try {
    if (!dnIds || dnIds.length === 0) return resultMap;
    const uniqueDnIds = Array.from(new Set(dnIds.filter(Boolean)));
    if (uniqueDnIds.length === 0) return resultMap;

    const dnPlaceholders = uniqueDnIds.map(() => "?").join(",");

    // 1. Batch query Delivery Notes
    const dns = db
      .prepare(
        `
      SELECT dn.*, p.quotation_id as p_quotation_id 
      FROM delivery_notes dn 
      LEFT JOIN projects p ON dn.project_id = p.id 
      WHERE dn.id IN (${dnPlaceholders})
    `,
      )
      .all(...uniqueDnIds) as any[];

    const dnMap = new Map<string, any>();
    const allQuoIds = new Set<string>();
    const allProjIds = new Set<string>();

    for (const dn of dns) {
      dnMap.set(dn.id, dn);
      const qId = dn.quotation_id || dn.p_quotation_id;
      if (qId) allQuoIds.add(qId);
      if (dn.project_id) allProjIds.add(dn.project_id);
    }

    // 2. Batch query Quotations & Quotation Items
    const quoMap = new Map<string, any>();
    const qiMap = new Map<string, any[]>();
    if (allQuoIds.size > 0) {
      const quoIdsArr = Array.from(allQuoIds);
      const quoPlaceholders = quoIdsArr.map(() => "?").join(",");
      const quots = db.prepare(`SELECT * FROM quotations WHERE id IN (${quoPlaceholders})`).all(...quoIdsArr) as any[];
      for (const q of quots) quoMap.set(q.id, q);

      const qis = db.prepare(`SELECT * FROM quotation_items WHERE quotation_id IN (${quoPlaceholders})`).all(...quoIdsArr) as any[];
      for (const qi of qis) {
        if (!qiMap.has(qi.quotation_id)) qiMap.set(qi.quotation_id, []);
        qiMap.get(qi.quotation_id)!.push(qi);
      }
    }

    // 3. Batch query Related Projects
    const projectsByQuo = new Map<string, any[]>();
    const projectsById = new Map<string, any>();
    const projClauses: string[] = [];
    const projParams: any[] = [];
    if (allQuoIds.size > 0) {
      const qArr = Array.from(allQuoIds);
      projClauses.push(`quotation_id IN (${qArr.map(() => "?").join(",")})`);
      projParams.push(...qArr);
    }
    if (allProjIds.size > 0) {
      const pArr = Array.from(allProjIds);
      projClauses.push(`id IN (${pArr.map(() => "?").join(",")})`);
      projParams.push(...pArr);
    }

    if (projClauses.length > 0) {
      const projs = db.prepare(`SELECT * FROM projects WHERE ${projClauses.join(" OR ")}`).all(...projParams) as any[];
      for (const p of projs) {
        projectsById.set(p.id, p);
        if (p.quotation_id) {
          if (!projectsByQuo.has(p.quotation_id)) projectsByQuo.set(p.quotation_id, []);
          projectsByQuo.get(p.quotation_id)!.push(p);
        }
      }
    }

    // 4. Batch query Delivery Items
    const rawDeliveryItems = db
      .prepare(
        `
      SELECT di.*, i.item_code as i_item_code, i.name as i_name, i.unit_price as i_unit_price, i.uom as i_uom
      FROM delivery_items di
      LEFT JOIN items i ON di.item_id = i.id
      WHERE di.dn_id IN (${dnPlaceholders})
    `,
      )
      .all(...uniqueDnIds) as any[];

    const diByDn = new Map<string, any[]>();
    for (const di of rawDeliveryItems) {
      if (!diByDn.has(di.dn_id)) diByDn.set(di.dn_id, []);
      diByDn.get(di.dn_id)!.push(di);
    }

    // 5. In-Memory Resolution for all DNs (O(1) lookups, constant 4 queries total)
    for (const dnId of uniqueDnIds) {
      const dn = dnMap.get(dnId);
      if (!dn) {
        resultMap.set(dnId, []);
        continue;
      }

      const quoId = dn.quotation_id || dn.p_quotation_id;
      const quotation = quoId ? quoMap.get(quoId) : null;
      const quotationItems = quoId ? (qiMap.get(quoId) || []) : [];
      const relatedProjects = quoId
        ? (projectsByQuo.get(quoId) || [])
        : (dn.project_id && projectsById.has(dn.project_id) ? [projectsById.get(dn.project_id)] : []);
      const dnItems = diByDn.get(dnId) || [];

      const itemsWithPrices = dnItems.map((di: any, idx: number) => {
        const cleanItemId = (di.item_id || "").toString();
        const cleanItemCode = (di.i_item_code || "").toString();
        const cleanName = (di.i_name || di.remarks || "").toString().toLowerCase().trim();

        let matchedProject = relatedProjects.find((p: any) => {
          if (!p) return false;
          const cleanProjId = (p.id || "").toString();
          const cleanProjName = (p.name || "").toString().toLowerCase().trim();

          if (
            cleanProjId === cleanItemId ||
            cleanItemId === `ITEM-${cleanProjId}` ||
            cleanItemId === `FG-${cleanProjId}` ||
            cleanItemCode === `FG-${cleanProjId}` ||
            cleanItemCode === `FG-${cleanProjId}-SUB`
          ) {
            return true;
          }

          if (cleanProjName.length > 2 && cleanName.length > 2) {
            if (cleanName === cleanProjName || cleanName.includes(cleanProjName) || cleanProjName.includes(cleanName)) {
              return true;
            }
          }
          return false;
        });

        if (!matchedProject && relatedProjects.length === dnItems.length) {
          matchedProject = relatedProjects[idx];
        }

        let matchedQi: any = null;
        if (matchedProject && matchedProject.quotation_item_id) {
          matchedQi = quotationItems.find((qi: any) => qi.id === matchedProject.quotation_item_id);
        }
        if (!matchedQi) {
          matchedQi = quotationItems.find((qi: any) => {
            const cleanQiId = (qi.id || "").toString();
            return (
              cleanQiId === cleanItemId ||
              cleanQiId === cleanItemCode ||
              cleanItemCode === `QI-${cleanQiId.slice(0, 8)}` ||
              cleanItemId === `QI-${cleanQiId.slice(0, 8)}`
            );
          });
        }
        if (!matchedQi && cleanName.length > 2) {
          matchedQi = quotationItems.find((qi: any) => {
            const cleanQiTitle = (qi.title || "").toString().toLowerCase().trim();
            if (!cleanQiTitle) return false;
            return (
              cleanQiTitle === cleanName ||
              cleanName.includes(cleanQiTitle) ||
              cleanQiTitle.includes(cleanName)
            );
          });
        }
        if (!matchedQi && matchedProject) {
          const projIdx = relatedProjects.findIndex((p: any) => p.id === matchedProject.id);
          if (projIdx >= 0 && quotationItems[projIdx]) {
            matchedQi = quotationItems[projIdx];
          }
        }
        if (!matchedQi) {
          if (quotationItems.length === dnItems.length) {
            matchedQi = quotationItems[idx];
          } else if (quotationItems[idx]) {
            matchedQi = quotationItems[idx];
          } else if (quotationItems.length === 1) {
            matchedQi = quotationItems[0];
          }
        }

        let itemName = "";
        const isGenericName = (name: string) => {
          if (!name) return true;
          const l = name.toLowerCase().trim();
          return l === "commercial item" || l === "commercial trade item" || l === "item delivery" || l === "unit" || l === "fg-item" || l === "finish good";
        };

        if (matchedQi?.title) {
          itemName = matchedQi.title;
        } else if (matchedProject?.name) {
          itemName = matchedProject.name;
        } else if (di.i_name && !isGenericName(di.i_name)) {
          itemName = di.i_name;
        } else if (di.remarks && !isGenericName(di.remarks)) {
          itemName = di.remarks;
        } else {
          itemName = "Commercial Trade Item";
        }

        const itemCode =
          di.i_item_code ||
          (matchedQi ? `QI-${matchedQi.id.slice(0, 8)}` : `FG-${(di.item_id || "").slice(0, 8)}`);
        const uom = di.uom || matchedQi?.uom || di.i_uom || matchedProject?.uom || "Unit";
        const qty = Number(di.qty) || 1;

        let unitPrice = 0;
        if (matchedQi && Number(matchedQi.unit_price) > 0) {
          unitPrice = Number(matchedQi.unit_price);
        } else if (Number(di.i_unit_price) > 0) {
          unitPrice = Number(di.i_unit_price);
        } else if (quotationItems[idx] && Number(quotationItems[idx].unit_price) > 0) {
          unitPrice = Number(quotationItems[idx].unit_price);
        } else if (
          quotation &&
          Number(quotation.amount) > 0 &&
          dnItems.length > 0
        ) {
          const discountRate = Number(quotation.discount_rate) || 0;
          const grossQuotationAmount = discountRate > 0 && Number(quotation.dpp) > 0
            ? Math.round(Number(quotation.dpp) / (1 - discountRate / 100))
            : Number(quotation.amount);
          const totalQty = dnItems.reduce(
            (acc: number, cur: any) => acc + (Number(cur.qty) || 1),
            0,
          );
          unitPrice = Math.round(grossQuotationAmount / (totalQty || 1));
        }

        const subtotal = Math.round(qty * unitPrice);

        return {
          ...di,
          item_name: itemName,
          item_code: itemCode,
          uom,
          qty,
          unit_price: unitPrice,
          subtotal,
        };
      });

      resultMap.set(dnId, itemsWithPrices);
    }

    return resultMap;
  } catch (e) {
    console.error("Error resolving batch delivery items with prices:", e);
    return resultMap;
  }
}

export function getDeliveryNoteItemsWithPrices(dnId: string) {
  if (!dnId) return [];
  const map = batchGetDeliveryNoteItemsWithPrices([dnId]);
  return map.get(dnId) || [];
}
