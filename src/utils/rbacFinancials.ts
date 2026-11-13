/**
 * Centralized Role-Based Access Control (RBAC) for Financial Figures & Price Masking.
 * Restricts monetary amounts (Rp values) in chat cards and chat document previews
 * to Financial Controllers (FC), Executive/Admin accounts, and the relevant Department Manager.
 */

export interface UserAuthContext {
  username?: string;
  role?: string;
  level?: string;
  name?: string;
}

/**
 * Evaluates whether a user is authorized to view authentic financial amounts (prices)
 * for a specific document type.
 *
 * Rules:
 * - FC, ADMIN, SUPERADMIN, DIRECTOR, BOD always have full financial visibility across all documents.
 * - Department Managers only have visibility for documents within their domain:
 *   - QUOTATION: SALES managers
 *   - PR / PO: PROCUREMENT, PURCHASING, or ENGINEERING managers
 *   - INVOICE: ACCOUNTING, FINANCE managers
 *   - NTP / PROJECT: PRODUCTION, PPIC, or ENGINEERING managers
 * - General staff and users from other departments are masked ("Confidential").
 */
export function canViewDocFinancials(
  user?: UserAuthContext | null,
  docType?: string | null,
): boolean {
  if (!user) return false;

  const role = String(user.role || "").toUpperCase().trim();
  const level = String(user.level || "").toUpperCase().trim();
  const isManager = level === "MANAGER";

  // Executive & Universal Financial Authority
  if (
    role === "FC" ||
    role === "FINANCIAL_CONTROLLER" ||
    role === "DIRECTOR" ||
    role === "BOD" ||
    role === "ADMIN" ||
    role === "SUPERADMIN" ||
    role === "GOD_MODE"
  ) {
    return true;
  }

  const type = String(docType || "").toUpperCase().trim();

  switch (type) {
    case "QUOTATION":
      return isManager && (role === "SALES" || role.startsWith("SALES_"));

    case "PR":
    case "PO":
      return (
        isManager &&
        (role === "PROCUREMENT" ||
          role === "PURCHASING" ||
          role === "ENGINEERING")
      );

    case "INVOICE":
    case "COMMERCIAL_INVOICE":
      return role === "ACCOUNTING" || role === "FINANCE";

    case "NTP":
    case "PROJECT":
      return (
        isManager &&
        (role === "PRODUCTION" ||
          role === "PPIC" ||
          role === "ENGINEERING" ||
          role === "OPERATIONS" ||
          role === "SALES")
      );

    default:
      return isManager;
  }
}

export const CONFIDENTIAL_PRICE_MASK = "[CONFIDENTIAL]";

/**
 * Replaces monetary amounts (Rp, IDR, $, etc.) in a string with "[CONFIDENTIAL]".
 * Used to censor price figures in message introductory text and public forum spaces for unauthorized personnel.
 */
export function maskPriceText(text: string): string {
  if (!text) return text;
  return text.replace(
    /(?:Rp\.?|IDR|\$)\s*[\d]+(?:[.,]\d+)*(?:\s*(?:juta|miliar|ribu|k|mio|b))?/gi,
    CONFIDENTIAL_PRICE_MASK,
  );
}

export { ConfidentialBadge } from "@/components/shared/ConfidentialBadge";

