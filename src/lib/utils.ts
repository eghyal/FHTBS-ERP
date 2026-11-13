/**
 * Safe re-export shim for legacy imports from "@/lib/utils".
 * All canonical implementations now reside in "@/utils/format".
 */
export {
  cn,
  useEscapeKey,
  formatCurrency,
  parseCurrency,
  formatIDR,
  formatIDRWithDecimals,
  parseRawNumber,
  formatNumberWithDots,
  formatRupiah,
  toRupiahInt,
  calculateLineTotal,
  formatLocalDate,
  getShortCode,
  isFinishGoodItem,
  getInitials,
  stripMarkdown,
  formatMsgTime,
} from "@/utils/format";


