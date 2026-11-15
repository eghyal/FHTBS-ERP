/**
 * Pure domain helpers for Projects & Engineering BoM/BoP routes.
 */
export function checkQuotationExpired(quotation: any): boolean {
  if (!quotation) return true;
  if (quotation.status === "PROCESSED") return false;
  if (quotation.status === "EXPIRED") return true;
  const createdDate = new Date(quotation.created_at);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - createdDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > (quotation.validity_days || 20);
}

/**
 * Calculates true remaining material requirement using BoP fractional allocations and physical shop floor progress.
 */
export function calculateFractionalBomRemaining(
  db: any,
  projectId: string,
  bomId: string,
  defaultRequired: number,
  defaultConsumed: number,
  projectQty: number,
  unitRequiredQty: number,
): number {
  const bops = db
    .prepare(
      "SELECT id, completed_qty, bom_allocations FROM bill_of_processes WHERE project_id = ? AND node_type = 'PRODUCT'",
    )
    .all(projectId) as any[];
  if (bops.length === 0) {
    return Math.max(0, defaultRequired - defaultConsumed);
  }

  let isAllocated = false;
  let trueRemaining = 0;

  for (const bop of bops) {
    let allocs: any[] = [];
    try {
      allocs =
        typeof bop.bom_allocations === "string"
          ? JSON.parse(bop.bom_allocations)
          : bop.bom_allocations || [];
    } catch (e) {}
    const alloc = allocs.find((a: any) => a.bom_id === bomId);
    if (alloc) {
      isAllocated = true;
      const fraction = Number(alloc.fraction) || 1;
      const completed = Number(bop.completed_qty) || 0;
      const nodeNeeded = Math.max(0, projectQty - completed);
      trueRemaining += nodeNeeded * unitRequiredQty * fraction;
    }
  }

  if (isAllocated) {
    return trueRemaining;
  }
  return Math.max(0, defaultRequired - defaultConsumed);
}
