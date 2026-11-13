/**
 * Pure domain helpers for Purchasing & Vendor Scoring routes.
 */
export function computeSupplierBatchMetrics(
  sup: any,
  itemPrices: { item_id: string; unit_price: number }[],
  totalItemsCount: number,
) {
  const passed = Number(sup.passed_count || 0);
  const rejected = Number(sup.rejected_count || 0);
  const conditional = Number(sup.conditional_count || 0);
  const onTimeCount = Number(sup.on_time_count || 0);
  const totalGrns = passed + rejected + conditional;

  const totalQtyReceived = Number(sup.total_qty_received || 0);
  const totalQtyPassed = Number(sup.total_qty_passed || 0);

  const qualityScore =
    totalQtyReceived > 0
      ? Math.round((totalQtyPassed / totalQtyReceived) * 100)
      : totalGrns > 0
        ? Math.round(((passed + conditional * 0.7) / totalGrns) * 100)
        : 96;

  const deliveryTimeliness =
    totalGrns > 0 ? Math.round((onTimeCount / totalGrns) * 100) : 95;

  const onTimeScore =
    totalGrns > 0
      ? Math.round(qualityScore * 0.6 + deliveryTimeliness * 0.4)
      : 95;

  const fulfilledCount = itemPrices.length;
  const totalItemsInBatch = totalItemsCount || 1;
  const matchPercent = Math.min(
    100,
    Math.round((fulfilledCount / totalItemsInBatch) * 100),
  );
  const proximityKm =
    (parseInt(String(sup.id || "").replace(/\D/g, ""), 10) % 25) + 3 || 12;
  const leadTimeDays = Math.max(2, Math.round(proximityKm / 5));
  const compositeScore = Math.round(
    matchPercent * 0.5 +
      onTimeScore * 0.4 +
      Math.max(0, 100 - proximityKm * 2) * 0.1,
  );

  return {
    ...sup,
    item_prices: itemPrices,
    matchPercent,
    fulfilledCount,
    totalItemsInBatch,
    proximityKm,
    leadTimeDays,
    qualityScore,
    deliveryTimeliness,
    onTimeScore,
    compositeScore,
  };
}

