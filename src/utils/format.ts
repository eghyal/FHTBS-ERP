import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect } from "react";

/**
 * ClassName merger utility (Tailwind + clsx).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Global Escape key listener hook.
 */
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onEscape]);
}

/**
 * Canonical Indonesian Rupiah (IDR), numeric, and date formatting utilities.
 */
const idrBaseFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const idrDecimalFormatterCache = new Map<number, Intl.NumberFormat>();

function getDecimalFormatter(decimals: number): Intl.NumberFormat {
  let fmt = idrDecimalFormatterCache.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    idrDecimalFormatterCache.set(decimals, fmt);
  }
  return fmt;
}

const enDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function formatCurrency(
  value: string | number | undefined | null,
): string {
  if (value === undefined || value === null || value === "") return "";
  const stringValue =
    typeof value === "number" ? value.toString() : value.replace(/[^\d]/g, "");
  if (!stringValue) return "";
  return stringValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function parseCurrency(value: string): number {
  return Number(value.replace(/,/g, ""));
}

export const formatIDR = (
  amount: number | string | null | undefined,
): string => {
  const raw = typeof amount === "string" ? parseFloat(amount) : Number(amount || 0);
  const value = Number.isFinite(raw) ? raw : 0;
  return idrBaseFormatter
    .format(value)
    .replace(/^Rp\s*/, "Rp\u00A0")
    .replace(/\s+/g, "\u00A0");
};

export const formatIDRWithDecimals = (
  amount: number | string | null | undefined,
  decimals = 2,
): string => {
  const raw = typeof amount === "string" ? parseFloat(amount) : Number(amount || 0);
  const value = Number.isFinite(raw) ? raw : 0;
  return getDecimalFormatter(decimals)
    .format(value)
    .replace(/^Rp\s*/, "Rp\u00A0")
    .replace(/\s+/g, "\u00A0");
};

export const parseRawNumber = (formattedValue: string): number => {
  if (!formattedValue) return 0;
  return parseFloat(formattedValue.replace(/[^\d]/g, "")) || 0;
};

export const formatNumberWithDots = (val: string | number): string => {
  const strVal = String(val ?? "").replace(/[^\d]/g, "");
  if (!strVal) return "";
  return strVal.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export const formatRupiah = (val: unknown): string => {
  const num = Math.round(Number(val) || 0);
  return idrBaseFormatter.format(num);
};

/**
 * Parses and rounds any monetary value to exact integer Rupiah (avoiding fractional floating points).
 */
export const toRupiahInt = (val: unknown): number => {
  if (typeof val === "number") return Number.isFinite(val) ? Math.round(val) : 0;
  if (val === null || val === undefined || val === "") return 0;
  const parsed = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
  return Number.isNaN(parsed) ? 0 : Math.round(parsed);
};

/**
 * Calculates subtotal with exact integer math: price * qty - discount.
 */
export const calculateLineTotal = (
  unitPrice: number,
  qty: number,
  discountPercent: number = 0,
): number => {
  const p = Math.round(Number(unitPrice) || 0);
  const q = Math.max(0, Number(qty) || 0);
  const gross = p * q;
  if (discountPercent <= 0) return Math.round(gross);
  const discountAmt = Math.round((gross * discountPercent) / 100);
  return Math.max(0, Math.round(gross - discountAmt));
};

export const formatLocalDate = (isoOrString: string): string => {
  if (!isoOrString) return "-";
  const date = new Date(isoOrString);
  if (Number.isNaN(date.getTime())) return "-";
  return enDateFormatter.format(date);
};

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Formats a code containing a full UUID into a concise uppercase short code.
 */
export const getShortCode = (rawCode: string | null | undefined): string => {
  if (!rawCode) return "";
  const match = rawCode.match(UUID_REGEX);
  if (match) {
    const fullUuid = match[0];
    const shortUuid = fullUuid.split("-")[0].toUpperCase();
    return rawCode.replace(fullUuid, shortUuid).toUpperCase();
  }
  return rawCode.toUpperCase();
};

/**
 * Checks whether an inventory item belongs to the Finished Goods (FG) category.
 */
export function isFinishGoodItem(item: any): boolean {
  if (!item) return false;
  const cat = String(item.category || item.type || "").toUpperCase().trim();
  const name = String(item.name || item.item_name || "").toUpperCase().trim();
  const code = String(item.item_code || item.id || "").toUpperCase().trim();
  const isMachine = cat === "MACHINE" || code.startsWith("MC - ") || code.startsWith("MC-");
  if (isMachine) return false;
  return (
    cat === "FINISHED" ||
    cat === "FINISH_GOOD" ||
    cat === "FINISH_GOODS" ||
    cat === "FINISHED_GOOD" ||
    cat === "FG" ||
    name.startsWith("FG -") ||
    name.startsWith("FG-") ||
    code.startsWith("FG -") ||
    code.startsWith("FG-")
  );
}

/**
 * Extracts 1-2 uppercase initials from a full name or username.
 */
export const getInitials = (name?: string | null): string => {
  if (!name) return "U";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return String(name).trim().substring(0, 2).toUpperCase() || "U";
};

/**
 * Strips markdown formatting and internal ERP metadata tags for plain-text previews.
 */
export const stripMarkdown = (text: string | null | undefined): string | null => {
  if (!text) return text ?? null;
  return text
    .replace(/\|META:\{.*\}$/s, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1");
};

/**
 * Formats an ISO or SQL timestamp into a localized HH:MM string (Asia/Jakarta).
 */
export const formatMsgTime = (rawTime: string | null | undefined): string => {
  if (!rawTime) return "--:--";
  try {
    const d = new Date(
      rawTime.replace(" ", "T") + (rawTime.includes("Z") ? "" : "Z"),
    );
    return isNaN(d.getTime())
      ? "--:--"
      : d.toLocaleTimeString("en-US", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          minute: "2-digit",
        });
  } catch {
    return "--:--";
  }
};


