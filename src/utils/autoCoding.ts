/**
 * Smart Auto-Coding System (System-Generated Standardized Identity Codes)
 *
 * Formats:
 * 1. Warehouse SKU: [PREFIX] - [INITIALS + KEY SPEC] - [3-DIGIT CATEGORY SEQ]
 *    Examples:
 *    - Finish Good: "Pin Mixer K300" (Seq 1) -> "FG - PMK300 - 001"
 *    - Raw Material: "Mild Steel Plate" (Seq 2) -> "RW - MSP - 002"
 *    - Machine Asset: "Hydraulic Press 50T" (Seq 4) -> "MC - HP50T - 004"
 *    - Raw Material: "Semen Portland" (Seq 15) -> "RW - SMP - 015"
 *
 * 2. Customer Profile: CUS-[3-LETTER INITIALS]-[3-DIGIT SEQ]
 *    Example: "Amtra Electric" (Seq 10) -> "CUS-AEL-010"
 *
 * 3. Supplier Profile: SUP-[3-LETTER INITIALS]-[3-DIGIT SEQ]
 *    Example: "PT Baja Jaya Sentosa" (Seq 1) -> "SUP-BJS-001"
 *
 * 4. Project ID: PRJ - [2-DIGIT YEAR].[3-DIGIT ANNUAL SEQ]
 *    Examples:
 *    - Year 2026, Seq 1  -> "PRJ - 26.001"
 *    - Year 2026, Seq 10 -> "PRJ - 26.010"
 *    - Year 2027, Seq 10 -> "PRJ - 27.010" (resets per year)
 */

export const ITEM_CATEGORY_PREFIX_MAP: Record<string, string> = {
  FINISH_GOOD: "FG",
  FINISHED: "FG",
  FINISH_GOODS: "FG",
  RAW: "RW",
  RAW_MATERIAL: "RW",
  MACHINE: "MC",
  CONSUMABLE: "CS",
  TOOL: "TL",
  SPAREPART: "SP",
  GENERAL: "GN",
  WIP: "WP",
};

const STOP_WORDS = new Set([
  "DAN",
  "AND",
  "OR",
  "ATAU",
  "FOR",
  "UNTUK",
  "DENGAN",
  "WITH",
  "OF",
  "THE",
  "DI",
  "KE",
  "DARI",
]);

const STANDALONE_UNITS = new Set([
  "MM",
  "CM",
  "M",
  "M2",
  "M3",
  "KG",
  "GR",
  "TON",
  "T",
  "LTR",
  "L",
  "ML",
  "PCS",
  "UNIT",
  "SET",
  "LOT",
  "ROLL",
  "SHEET",
  "LEMBAR",
  "BATANG",
  "SAK",
  "ZAK",
  "BOX",
  "PACK",
  "INCH",
  "IN",
  "W",
  "KW",
  "HP",
  "V",
  "KVA",
]);

const LEGAL_ENTITY_PREFIXES = new Set([
  "PT",
  "CV",
  "UD",
  "TB",
  "PD",
  "PERUM",
  "PERUSDA",
  "YAYASAN",
  "KOPERASI",
  "BAPAK",
  "BPK",
  "IBU",
  "SDR",
  "TN",
  "NY",
  "MR",
  "MRS",
  "MS",
  "DR",
  "IR",
  "HJ",
  "H",
]);

const LEGAL_ENTITY_SUFFIXES = new Set(["TBK", "PERSERO", "LTD", "PTE", "INC", "CORP", "LLC"]);

/**
 * Resolve 2-letter category prefix from item type
 */
export function getCategoryPrefix(type?: string): string {
  const normalized = (type || "RAW").trim().toUpperCase();
  return ITEM_CATEGORY_PREFIX_MAP[normalized] || "RW";
}

/**
 * Format sequence number to 3 digits (001, 002, ..., 999)
 */
export function formatSequence3(seq: number): string {
  const safeNum = Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : 1;
  return String(safeNum).padStart(3, "0");
}

/**
 * Helper to extract consonants from an uppercase word (excluding first character)
 */
function getInternalConsonants(word: string): string[] {
  const chars: string[] = [];
  for (let i = 1; i < word.length; i++) {
    const ch = word[i];
    if (!"AIUEO".includes(ch) && /[A-Z]/.test(ch)) {
      chars.push(ch);
    }
  }
  return chars;
}

/**
 * Extract smart middle code (Initials + Key Alphanumeric Spec) from an Item Name
 * Examples:
 * - "Pin Mixer K300" -> "PMK300"
 * - "Mild Steel Plate" -> "MSP"
 * - "Hydraulic Press 50T" -> "HP50T"
 * - "Semen Portland" -> "SMP"
 * - "Paving Block Bata 20x10x6 cm" -> "PBB20X10X6"
 */
export function extractItemMiddleCode(name: string): string {
  const cleaned = (name || "").trim().toUpperCase();
  if (!cleaned) return "";

  const rawTokens = cleaned
    .split(/[\s\-/,_()[\]+&:;]+/)
    .map((t) => t.replace(/[^A-Z0-9.]/g, ""))
    .filter(Boolean);

  if (rawTokens.length === 0) return "";

  const wordTokens: string[] = [];
  const specTokens: string[] = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i];
    const hasDigit = /\d/.test(tok);

    if (hasDigit) {
      // Check if pure number followed by a unit token (e.g., "50" + "T" -> "50T", "10" + "MM" -> "10MM")
      const isPureNumber = /^\d+(\.\d+)?$/.test(tok);
      const nextTok = i + 1 < rawTokens.length ? rawTokens[i + 1] : "";
      if (isPureNumber && nextTok && STANDALONE_UNITS.has(nextTok)) {
        const cleanSpec = (tok + nextTok).replace(/[^A-Z0-9]/g, "");
        if (cleanSpec) specTokens.push(cleanSpec);
        i++; // skip the merged unit token
      } else {
        const cleanSpec = tok.replace(/[^A-Z0-9]/g, "");
        if (cleanSpec) specTokens.push(cleanSpec);
        // If next token is a standalone measurement unit (e.g. "20X10X6" followed by "CM"), skip the unit token
        if (nextTok && STANDALONE_UNITS.has(nextTok)) {
          i++;
        }
      }
    } else {
      const pureAlpha = tok.replace(/[^A-Z]/g, "");
      if (!pureAlpha) continue;
      if (STOP_WORDS.has(pureAlpha)) continue;
      // Ignore standalone unit at the very end if we already have words
      if (i === rawTokens.length - 1 && wordTokens.length >= 2 && STANDALONE_UNITS.has(pureAlpha)) {
        continue;
      }
      wordTokens.push(pureAlpha);
    }
  }

  let wordInitials = "";

  if (specTokens.length > 0) {
    // When key alphanumeric specs exist (e.g. K300, 50T, 20X10X6):
    if (wordTokens.length >= 2) {
      wordInitials = wordTokens
        .slice(0, 4)
        .map((w) => w[0])
        .join("");
    } else if (wordTokens.length === 1) {
      const w = wordTokens[0];
      const consonants = getInternalConsonants(w);
      if (consonants.length > 0) {
        wordInitials = w[0] + consonants[0];
      } else {
        wordInitials = w.slice(0, 2);
      }
    }
  } else {
    // Pure word tokens without alphanumeric spec: aim for 3 representative letters
    if (wordTokens.length >= 3) {
      wordInitials = wordTokens
        .slice(0, 4)
        .map((w) => w[0])
        .join("");
    } else if (wordTokens.length === 2) {
      const w1 = wordTokens[0];
      const w2 = wordTokens[1];
      const w1Consonants = getInternalConsonants(w1);
      if (w1Consonants.length > 0) {
        wordInitials = w1[0] + w1Consonants[0] + w2[0];
      } else if (w1.length >= 2) {
        wordInitials = w1.slice(0, 2) + w2[0];
      } else {
        wordInitials = (w1[0] + w2.slice(0, 2)).slice(0, 3);
      }
    } else if (wordTokens.length === 1) {
      const w = wordTokens[0];
      const consonants = getInternalConsonants(w);
      if (consonants.length >= 2) {
        wordInitials = w[0] + consonants[0] + consonants[1];
      } else {
        wordInitials = w.slice(0, 3);
      }
    }
  }

  // Combine word initials + key spec tokens (cap total spec length to keep SKU concise)
  const combinedSpecs = specTokens.slice(0, 2).join("");
  const result = `${wordInitials}${combinedSpecs}`.trim();
  return result || cleaned.replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

/**
 * Extract 3 representative uppercase letters from a Company / Customer / Supplier Name
 * Strips legal prefixes (PT, CV, UD, Bapak, Ibu, etc.)
 * Examples:
 * - "Amtra Electric" -> "AEL"
 * - "PT Baja Jaya Sentosa" -> "BJS"
 * - "Holcim" -> "HOL"
 */
export function extractEntityInitials(name: string): string {
  const cleaned = (name || "").trim().toUpperCase();
  if (!cleaned) return "";

  const rawWords = cleaned
    .split(/[\s\-/,_()[\]+&.:;]+/)
    .map((w) => w.replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean);

  if (rawWords.length === 0) return "";

  // Strip leading legal entity prefixes (e.g., PT, CV, UD, BPK)
  let coreWords = [...rawWords];
  while (coreWords.length > 1 && LEGAL_ENTITY_PREFIXES.has(coreWords[0])) {
    coreWords.shift();
  }

  // Strip trailing legal suffixes (e.g., TBK, LTD) if more than 1 word remains
  while (coreWords.length > 1 && LEGAL_ENTITY_SUFFIXES.has(coreWords[coreWords.length - 1])) {
    coreWords.pop();
  }

  // Filter out minor stop words if we still have enough words
  const filtered = coreWords.filter((w) => !STOP_WORDS.has(w));
  const words = filtered.length > 0 ? filtered : coreWords;

  let code = "";
  if (words.length >= 3) {
    code = words[0][0] + words[1][0] + words[2][0];
  } else if (words.length === 2) {
    const w1 = words[0];
    const w2 = words[1];
    if (w2.length >= 2) {
      code = w1[0] + w2.slice(0, 2);
    } else {
      code = (w1.slice(0, 2) + w2[0]).slice(0, 3);
    }
  } else if (words.length === 1) {
    code = words[0].slice(0, 3);
  }

  return code.padEnd(3, "X").slice(0, 3);
}

/**
 * Determine which category prefix an existing inventory item belongs to
 */
export function resolveItemCategoryPrefix(item: {
  type?: string;
  item_type?: string;
  category?: string;
  item_code?: string;
}): string {
  const code = (item.item_code || "").trim().toUpperCase();
  const prefixMatch = code.match(/^([A-Z]{2})\s*-\s*/);
  if (prefixMatch) {
    const p = prefixMatch[1];
    if (p === "RM") return "RW"; // Legacy RM counts toward Raw Material (RW)
    if (["FG", "RW", "MC", "CS", "TL", "SP", "GN", "WP"].includes(p)) {
      return p;
    }
  }

  const t = (item.type || "").trim().toUpperCase();
  const it = (item.item_type || "").trim().toUpperCase();
  const cat = (item.category || "").trim().toUpperCase();

  if (t === "FINISH_GOOD" || t === "FINISHED" || t === "FINISH_GOODS") return "FG";
  if (t === "MACHINE" || it === "MACHINE") return "MC";
  if (t === "TOOL" || it === "TOOL") return "TL";
  if (t === "CONSUMABLE" || it === "CONSUMABLE" || cat === "CONSUMABLE") return "CS";
  if (t === "SPAREPART" || cat === "SPAREPART") return "SP";
  if (t === "GENERAL") return "GN";
  return "RW";
}

/**
 * Calculate the next 3-digit sequence number for a given item category
 * based on existing items in that category.
 */
export function getNextCategorySequence(
  targetType: string,
  existingItems: Array<{
    type?: string;
    item_type?: string;
    category?: string;
    item_code?: string;
  }> = []
): number {
  const targetPrefix = getCategoryPrefix(targetType);
  let countInCategory = 0;
  let maxTrailingSeq = 0;

  for (const item of existingItems) {
    const itemPrefix = resolveItemCategoryPrefix(item);
    if (itemPrefix === targetPrefix) {
      countInCategory++;
      const code = (item.item_code || "").trim().toUpperCase();
      // Extract trailing sequence number ONLY if it matches our 3-part format: PREFIX - MIDDLE - SEQ
      const parts = code.split(/\s*-\s*/);
      if (parts.length >= 3) {
        const lastPart = parts[parts.length - 1];
        if (/^\d{1,4}$/.test(lastPart)) {
          const parsed = parseInt(lastPart, 10);
          if (parsed > maxTrailingSeq && parsed < 9000) {
            maxTrailingSeq = parsed;
          }
        }
      }
    }
  }

  return Math.max(countInCategory + 1, maxTrailingSeq + 1);
}

/**
 * Generate full standardized Warehouse SKU Code
 * Format: [PREFIX] - [MIDDLE_CODE] - [00X]
 */
export function generateSmartSku(
  type: string,
  name: string,
  sequenceNumber = 1
): string {
  const prefix = getCategoryPrefix(type);
  const seqStr = formatSequence3(sequenceNumber);
  const middle = extractItemMiddleCode(name);
  if (!middle) {
    return `${prefix} - ___ - ${seqStr}`;
  }
  return `${prefix} - ${middle} - ${seqStr}`;
}

/**
 * Calculate next sequence number for Supplier or Customer list
 */
export function getNextEntitySequence(
  entityPrefix: "SUP" | "CUS",
  existingEntities: Array<{ code?: string }> = []
): number {
  const count = existingEntities.length;
  let maxSeq = 0;
  const regex = new RegExp(`^${entityPrefix}-[A-Z0-9]{2,5}-(\\d{1,4})$`, "i");

  for (const ent of existingEntities) {
    const c = (ent.code || "").trim().toUpperCase();
    const match = c.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSeq && num < 9000) {
        maxSeq = num;
      }
    }
  }

  return Math.max(count + 1, maxSeq + 1);
}

/**
 * Generate full standardized Supplier Code: SUP-[3_LETTERS]-[00X]
 */
export function generateSmartSupplierCode(
  name: string,
  sequenceNumber = 1
): string {
  const seqStr = formatSequence3(sequenceNumber);
  const initials = extractEntityInitials(name);
  if (!initials) {
    return `SUP-___-${seqStr}`;
  }
  return `SUP-${initials}-${seqStr}`;
}

/**
 * Generate full standardized Customer Code: CUS-[3_LETTERS]-[00X]
 */
export function generateSmartCustomerCode(
  name: string,
  sequenceNumber = 1
): string {
  const seqStr = formatSequence3(sequenceNumber);
  const initials = extractEntityInitials(name);
  if (!initials) {
    return `CUS-___-${seqStr}`;
  }
  return `CUS-${initials}-${seqStr}`;
}

const NON_MFG_PROJECT_IDS = new Set([
  "CONSUMABLE",
  "TRANSPORTATION",
  "OTHERS",
  "GENERAL",
]);

/**
 * Extract 2-digit year string (e.g. 2026 -> "26", 2027 -> "27")
 */
export function getYearSuffix2(yearOrDate?: number | string | Date): string {
  let fullYear = new Date().getFullYear();
  if (typeof yearOrDate === "number" && Number.isFinite(yearOrDate)) {
    fullYear = yearOrDate < 100 ? 2000 + yearOrDate : yearOrDate;
  } else if (yearOrDate instanceof Date && !isNaN(yearOrDate.getTime())) {
    fullYear = yearOrDate.getFullYear();
  } else if (typeof yearOrDate === "string" && yearOrDate.trim()) {
    const trimmed = yearOrDate.trim();
    if (/^\d{4}$/.test(trimmed)) {
      fullYear = parseInt(trimmed, 10);
    } else if (/^\d{2}$/.test(trimmed)) {
      fullYear = 2000 + parseInt(trimmed, 10);
    } else {
      const parsedDate = new Date(trimmed);
      if (!isNaN(parsedDate.getTime())) {
        fullYear = parsedDate.getFullYear();
      }
    }
  }
  return String(fullYear).slice(-2).padStart(2, "0");
}

/**
 * Calculate the next 3-digit sequence number for a Project ID in a given year.
 * Sequence resets to 001 every new year (e.g., 2026 -> PRJ - 26.YYY, 2027 -> PRJ - 27.YYY).
 */
export function getNextProjectSequence(
  existingProjects: Array<{
    id?: string;
    created_at?: string;
    due_date?: string;
    status?: string;
    name?: string;
  }> = [],
  targetYear: number = new Date().getFullYear()
): number {
  const xx = getYearSuffix2(targetYear);
  const fullYearStr = `20${xx}`;
  let countInYear = 0;
  let maxSeqInYear = 0;

  // Matches standard "PRJ - 26.010" or "PRJ-26.010"
  const standardRegex = /^PRJ\s*-\s*(\d{2})\.(\d{1,4})(?:\b|-)/i;
  // Matches legacy year-prefixed IDs like "PRJ-26-XXXX" or "PRJ-2026-001"
  const legacyYearRegex = /^PRJ\s*-\s*(\d{2,4})\s*-\s*([A-Z0-9]+)/i;

  for (const proj of existingProjects) {
    const rawId = String(proj.id || "").trim().toUpperCase();
    const rawName = String(proj.name || "").trim().toUpperCase();
    const rawStatus = String(proj.status || "").trim().toUpperCase();

    if (
      !rawId ||
      NON_MFG_PROJECT_IDS.has(rawId) ||
      NON_MFG_PROJECT_IDS.has(rawName) ||
      rawStatus === "INTERNAL_OVERHEAD"
    ) {
      continue;
    }

    const stdMatch = rawId.match(standardRegex);
    if (stdMatch) {
      const idYear2 = stdMatch[1];
      const seqNum = parseInt(stdMatch[2], 10);
      if (idYear2 === xx) {
        countInYear++;
        if (seqNum > maxSeqInYear && seqNum < 9000) {
          maxSeqInYear = seqNum;
        }
      }
      continue;
    }

    const legMatch = rawId.match(legacyYearRegex);
    if (legMatch) {
      const idYear2 = legMatch[1].slice(-2);
      if (idYear2 === xx) {
        countInYear++;
        if (/^\d{1,4}$/.test(legMatch[2])) {
          const seqNum = parseInt(legMatch[2], 10);
          if (seqNum > maxSeqInYear && seqNum < 9000) {
            maxSeqInYear = seqNum;
          }
        }
      }
      continue;
    }

    // Fallback for legacy projects without year in ID: check created_at or due_date year
    const dateStr = String(proj.created_at || proj.due_date || "").trim();
    if (dateStr.startsWith(fullYearStr)) {
      countInYear++;
    } else if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime()) && String(d.getFullYear()) === fullYearStr) {
        countInYear++;
      }
    }
  }

  return Math.max(countInYear + 1, maxSeqInYear + 1);
}

/**
 * Generate full standardized Project ID: PRJ - XX.YYY
 * Examples:
 * - Year 2026, Seq 1  -> "PRJ - 26.001"
 * - Year 2026, Seq 10 -> "PRJ - 26.010"
 * - Year 2027, Seq 10 -> "PRJ - 27.010"
 */
export function generateSmartProjectId(
  sequenceNumber = 1,
  targetYear: number = new Date().getFullYear()
): string {
  const xx = getYearSuffix2(targetYear);
  const yyy = formatSequence3(sequenceNumber);
  return `PRJ - ${xx}.${yyy}`;
}

