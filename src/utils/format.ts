export const formatRupiah = (val: any) => {
  const num = Math.round(Number(val) || 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);
};

/**
 * Parses and rounds any monetary value to exact integer Rupiah (avoiding fractional floating points).
 */
export const toRupiahInt = (val: any): number => {
  if (typeof val === "number") return Math.round(val);
  const parsed = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  return isNaN(parsed) ? 0 : Math.round(parsed);
};

/**
 * Calculates subtotal with exact integer math: price * qty - discount.
 */
export const calculateLineTotal = (unitPrice: number, qty: number, discountPercent: number = 0): number => {
  const p = Math.round(unitPrice);
  const q = Math.max(0, qty);
  const gross = p * q;
  if (discountPercent <= 0) return Math.round(gross);
  const discountAmt = Math.round((gross * discountPercent) / 100);
  return Math.max(0, Math.round(gross - discountAmt));
};

export const formatLocalDate = (isoOrString: string) => {
  if (!isoOrString) return "-";
  return new Date(isoOrString).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};
