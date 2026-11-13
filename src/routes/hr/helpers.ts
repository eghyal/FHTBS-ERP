/**
 * Pure domain helpers for HRIS & Candidate Onboarding routes.
 */
export function parseCandidateBankInfo(
  bankName?: string | null,
  bankAccountNumber?: string | null,
  bankAccountInfo?: string | null,
  fallbackBankName?: string | null,
  fallbackBankNumber?: string | null,
): { resolvedBankName: string; resolvedBankNumber: string } {
  let resolvedBankName = String(bankName || fallbackBankName || "").trim();
  let resolvedBankNumber = String(
    bankAccountNumber || fallbackBankNumber || "",
  ).trim();

  if (!resolvedBankName && !resolvedBankNumber && bankAccountInfo) {
    const parts = String(bankAccountInfo)
      .split(/[-–—/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      resolvedBankName = parts[0];
      resolvedBankNumber = parts.slice(1).join(" ");
    } else {
      resolvedBankNumber = String(bankAccountInfo).trim();
    }
  }

  return { resolvedBankName, resolvedBankNumber };
}
