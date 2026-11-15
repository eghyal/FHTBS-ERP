import type {
  DocBlock,
  DocCommentThread,
  DocFootnote,
  DocPageSetup,
  DocTrackedChange,
  DocumentMetaEnvelope,
  DocumentPreflightIssue,
  DocumentPreflightReport,
  FindMatch,
  MailMergeSourceRecord,
  PaginatedPage,
  VersionDiffItem,
  WordDiffSegment,
} from "@/types/workspace";
import { evaluateTableFormula, formatCellValue } from "./docxEngine.ts";

export const DOC_META_BLOCK_ID = "__doc_meta__";

export const DEFAULT_PAGE_SETUP: DocPageSetup = {
  marginTopMm: 18,
  marginRightMm: 18,
  marginBottomMm: 18,
  marginLeftMm: 18,
  headerText: "",
  footerText: "",
  showPageNumbers: true,
  differentFirstPage: false,
  watermarkText: "DRAFT",
};

export function mmToPx(mm: number): number {
  return Math.round((Number(mm) || 0) * 3.7795275591);
}

export function isMetaBlock(block: Partial<DocBlock> | null | undefined): boolean {
  if (!block) return false;
  return block.type === "DOCUMENT_META" || block.id === DOC_META_BLOCK_ID;
}

export function stripMetaBlocks(blocks: DocBlock[] = []): DocBlock[] {
  return (blocks || []).filter((b) => !isMetaBlock(b));
}

export function extractDocumentMeta(blocks: DocBlock[] = []): DocumentMetaEnvelope {
  const metaBlock = (blocks || []).find((b) => isMetaBlock(b));
  const rawSetup = metaBlock?.pageSetup;
  const pageSetup: DocPageSetup = {
    marginTopMm: clampMargin(rawSetup?.marginTopMm, DEFAULT_PAGE_SETUP.marginTopMm),
    marginRightMm: clampMargin(rawSetup?.marginRightMm, DEFAULT_PAGE_SETUP.marginRightMm),
    marginBottomMm: clampMargin(rawSetup?.marginBottomMm, DEFAULT_PAGE_SETUP.marginBottomMm),
    marginLeftMm: clampMargin(rawSetup?.marginLeftMm, DEFAULT_PAGE_SETUP.marginLeftMm),
    headerText: typeof rawSetup?.headerText === "string" ? rawSetup.headerText : DEFAULT_PAGE_SETUP.headerText,
    footerText: typeof rawSetup?.footerText === "string" ? rawSetup.footerText : DEFAULT_PAGE_SETUP.footerText,
    showPageNumbers:
      typeof rawSetup?.showPageNumbers === "boolean" ? rawSetup.showPageNumbers : DEFAULT_PAGE_SETUP.showPageNumbers,
    differentFirstPage:
      typeof rawSetup?.differentFirstPage === "boolean"
        ? rawSetup.differentFirstPage
        : DEFAULT_PAGE_SETUP.differentFirstPage,
    watermarkText:
      typeof rawSetup?.watermarkText === "string" ? rawSetup.watermarkText : DEFAULT_PAGE_SETUP.watermarkText,
    customWidthMm: rawSetup?.customWidthMm,
    customHeightMm: rawSetup?.customHeightMm,
  };

  return {
    pageSetup,
    comments: Array.isArray(metaBlock?.comments) ? metaBlock!.comments : [],
    trackedChanges: Array.isArray(metaBlock?.trackedChanges) ? metaBlock!.trackedChanges : [],
    footnotes: Array.isArray(metaBlock?.footnotes) ? metaBlock!.footnotes : [],
  };
}

function clampMargin(val: unknown, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(5, Math.min(60, Math.round(n)));
}

export function mergeDocumentMeta(
  contentBlocks: DocBlock[],
  meta: Partial<DocumentMetaEnvelope>
): DocBlock[] {
  const clean = stripMetaBlocks(contentBlocks);
  const existingMeta = extractDocumentMeta(contentBlocks);
  const nextMeta: DocumentMetaEnvelope = {
    pageSetup: { ...existingMeta.pageSetup, ...(meta.pageSetup || {}) },
    comments: meta.comments ?? existingMeta.comments,
    trackedChanges: meta.trackedChanges ?? existingMeta.trackedChanges,
    footnotes: meta.footnotes ?? existingMeta.footnotes,
  };
  const metaBlock: DocBlock = {
    id: DOC_META_BLOCK_ID,
    type: "DOCUMENT_META",
    locked: true,
    isLocked: true,
    pageSetup: nextMeta.pageSetup,
    comments: nextMeta.comments,
    trackedChanges: nextMeta.trackedChanges,
    footnotes: nextMeta.footnotes,
  };
  return [...clean, metaBlock];
}

/* ============================================================================
 * 1. TEXT EXTRACTION & TELEMETRY
 * ==========================================================================*/

export function blockToPlainText(block: DocBlock): string {
  if (!block || isMetaBlock(block)) return "";
  if (block.type === "PAGE_BREAK") return "[Page Break]";
  if (block.type === "DIVIDER") return "---";

  const parts: string[] = [];
  if (block.title) parts.push(block.title);
  if (block.subtitle) parts.push(block.subtitle);

  if (Array.isArray(block.runs) && block.runs.length > 0) {
    parts.push(block.runs.map((r) => r.text || "").join(""));
  } else if (block.content) {
    parts.push(block.content);
  }

  if (Array.isArray(block.listItems) && block.listItems.length > 0) {
    parts.push(block.listItems.join("\n"));
  }

  if (Array.isArray(block.checklistItems) && block.checklistItems.length > 0) {
    parts.push(
      block.checklistItems.map((c) => `${c.checked ? "[x]" : "[ ]"} ${c.text}`).join("\n")
    );
  }

  if (block.addressData) {
    const a = block.addressData;
    const addrLines = [
      a.label,
      a.companyName || a.entityName,
      a.division || a.siteLocation,
      a.contactPerson || a.attentionTo,
      a.streetAddress,
      a.cityStateZip || a.cityPostal,
      a.phone,
      a.email,
    ].filter(Boolean);
    if (addrLines.length) parts.push(addrLines.join(" · "));
  }

  if (block.tableData) {
    const td = block.tableData;
    if (Array.isArray(td.headers) && td.headers.length) {
      parts.push(td.headers.join(" | "));
    }
    if (Array.isArray(td.rows)) {
      td.rows.forEach((row, rIdx) => {
        const evalRow = row
          .map((cell, cIdx) => {
            if (td.cellMeta?.[`${rIdx}-${cIdx}`]?.hidden) return null;
            const raw = String(cell || "");
            const fmt = td.cellFormats?.[`${rIdx}-${cIdx}`];
            return raw.startsWith("=")
              ? evaluateTableFormula(raw, rIdx, cIdx, td)
              : formatCellValue(raw, fmt);
          })
          .filter((v): v is string => v !== null);
        parts.push(evalRow.join(" | "));
      });
    }
  }

  const metaRows = Array.isArray(block.metaData)
    ? block.metaData
    : block.metadataRows || (block.metaData as any)?.items || [];
  if (Array.isArray(metaRows) && metaRows.length > 0) {
    parts.push(metaRows.map((m: any) => `${m.key || m.label || ""}: ${m.value || ""}`).join(" · "));
  }

  if (
    block.type === "SIGNATURE_COLUMN" ||
    block.type === "SIGNATURE_STAMP" ||
    block.type === "DUAL_SIGNATURE"
  ) {
    const sigParts = [
      block.targetDepartment,
      block.signatoryTitle || block.targetRole,
      block.signatoryName,
      block.secondarySignatoryTitle,
      block.secondarySignatoryName,
    ].filter(Boolean);
    if (sigParts.length) parts.push(sigParts.join(" · "));
  }

  if (block.type === "FOOTER" || block.type === "FOOTER_BLOCK") {
    const f = [block.footerLeftText, block.footerRightText].filter(Boolean);
    if (f.length) parts.push(f.join(" | "));
  }

  if (block.mediaData?.caption || block.caption) {
    parts.push(block.mediaData?.caption || block.caption || "");
  }

  return parts.join("\n").trim();
}

export function computeDocumentStats(
  blocks: DocBlock[],
  pageCount: number
): { words: number; characters: number; blocks: number; pages: number } {
  const content = stripMetaBlocks(blocks);
  const fullText = content.map(blockToPlainText).filter(Boolean).join(" ");
  const words = fullText.trim() ? fullText.trim().split(/\s+/).filter(Boolean).length : 0;
  return {
    words,
    characters: fullText.length,
    blocks: content.length,
    pages: Math.max(1, pageCount),
  };
}

export function summarizeBlockChange(block: DocBlock | undefined | null): string {
  if (!block) return "(empty)";
  const text = blockToPlainText(block).replace(/\s+/g, " ").trim();
  if (!text) return block.type;
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

/* ============================================================================
 * 2. DETERMINISTIC MULTI-PAGE PAGINATOR
 * ==========================================================================*/

export function estimateBlockHeightPx(block: DocBlock, printableWidthPx: number): number {
  if (block.height && Number(block.height) > 20) return Number(block.height) + 12;
  const safeWidth = Math.max(240, printableWidthPx || 620);
  const charsPerLine = Math.max(36, Math.floor(safeWidth / 7.4));

  switch (block.type) {
    case "OFFICIAL_LETTERHEAD":
      return 126;
    case "HEADER":
      return 64 + (block.content ? Math.ceil(block.content.length / charsPerLine) * 20 : 0);
    case "DIVIDER":
      return 24;
    case "PAGE_BREAK":
      return 0;
    case "METADATA_GRID": {
      const rows = Array.isArray(block.metaData)
        ? block.metaData.length
        : block.metadataRows?.length || 4;
      return 48 + Math.ceil(rows / 2) * 38;
    }
    case "SENDER_ADDRESS":
    case "RECIPIENT_ADDRESS":
    case "PROJECT_SITE_ADDRESS":
    case "CONTACT_CARD":
      return 132;
    case "TEXT":
    case "CALLOUT": {
      const txt =
        Array.isArray(block.runs) && block.runs.length > 0
          ? block.runs.map((r) => r.text).join("")
          : block.content || "";
      const lineCount = txt
        .split("\n")
        .reduce((acc, ln) => acc + Math.max(1, Math.ceil(ln.length / charsPerLine)), 0);
      const fontSize = Number(block.fontSize) || 12;
      const lineH = Math.round(fontSize * (Number(block.lineHeight) || 1.6));
      return (block.title ? 32 : 0) + lineCount * lineH + 22;
    }
    case "LIST_POINTS":
    case "CHECKLIST": {
      const count =
        block.type === "CHECKLIST"
          ? block.checklistItems?.length || 3
          : block.listItems?.length || 3;
      return 38 + count * 26;
    }
    case "TABLE": {
      const rows = block.tableData?.rows?.length || block.tableRows?.length || 2;
      return 74 + rows * 34 + (block.tableData?.showTotals ? 34 : 0);
    }
    case "IMAGE":
      return Math.min(520, Number(block.mediaData?.heightPx) || 260) + 46;
    case "SIGNATURE_COLUMN":
    case "SIGNATURE_STAMP":
    case "DUAL_SIGNATURE":
      return 165;
    case "FOOTER":
    case "FOOTER_BLOCK":
      return 68;
    default:
      return 76;
  }
}

export function paginateDocumentBlocks(
  blocks: DocBlock[],
  paperDims: { widthPx: number; heightPx: number; widthMm: number; heightMm: number },
  pageSetup: DocPageSetup,
  measuredHeights?: Record<string, number>
): PaginatedPage[] {
  const clean = stripMetaBlocks(blocks);
  if (clean.length === 0) {
    return [{ pageNumber: 1, totalPages: 1, blocks: [], usedHeightPx: 0, availableHeightPx: 900 }];
  }

  const topPx = mmToPx(pageSetup.marginTopMm);
  const bottomPx = mmToPx(pageSetup.marginBottomMm);
  const leftPx = mmToPx(pageSetup.marginLeftMm);
  const rightPx = mmToPx(pageSetup.marginRightMm);

  const runningHeaderAllowance = 0;
  const runningFooterAllowance = pageSetup.showPageNumbers ? 26 : 0;

  const printableWidthPx = Math.max(220, paperDims.widthPx - leftPx - rightPx);
  const availableHeightPx = Math.max(
    260,
    paperDims.heightPx - topPx - bottomPx - runningHeaderAllowance - runningFooterAllowance
  );

  const pages: PaginatedPage[] = [];
  let currentBlocks: DocBlock[] = [];
  let currentHeight = 0;
  const blockGapPx = 24; // Exact match to Tailwind gap-6 (24px) in Canvas & DocumentSheetRenderer

  for (const block of clean) {
    if (block.type === "PAGE_BREAK") {
      pages.push({
        pageNumber: pages.length + 1,
        totalPages: 0,
        blocks: currentBlocks,
        usedHeightPx: currentHeight,
        availableHeightPx,
      });
      currentBlocks = [];
      currentHeight = 0;
      continue;
    }

    const measured = measuredHeights?.[block.id];
    const bHeight =
      typeof measured === "number" && measured > 0
        ? measured
        : estimateBlockHeightPx(block, printableWidthPx);
    const needed = currentBlocks.length > 0 ? bHeight + blockGapPx : bHeight;

    if (currentBlocks.length > 0 && currentHeight + needed > availableHeightPx) {
      pages.push({
        pageNumber: pages.length + 1,
        totalPages: 0,
        blocks: currentBlocks,
        usedHeightPx: currentHeight,
        availableHeightPx,
      });
      currentBlocks = [block];
      currentHeight = bHeight;
    } else {
      currentBlocks.push(block);
      currentHeight += needed;
    }
  }

  if (currentBlocks.length > 0 || pages.length === 0) {
    pages.push({
      pageNumber: pages.length + 1,
      totalPages: 0,
      blocks: currentBlocks,
      usedHeightPx: currentHeight,
      availableHeightPx,
    });
  }

  const totalPages = pages.length;
  return pages.map((p) => ({ ...p, totalPages }));
}

/* ============================================================================
 * 3. NAVIGATION OUTLINE BUILDER
 * ==========================================================================*/

export interface OutlineNode {
  id: string;
  blockId: string;
  title: string;
  type: string;
  level: 1 | 2 | 3;
}

export function buildDocumentOutline(blocks: DocBlock[]): OutlineNode[] {
  const clean = stripMetaBlocks(blocks);
  const nodes: OutlineNode[] = [];
  for (const block of clean) {
    if (block.type === "OFFICIAL_LETTERHEAD") {
      nodes.push({
        id: `out-${block.id}`,
        blockId: block.id,
        title: block.title || "Official Letterhead",
        type: "LETTERHEAD",
        level: 1,
      });
    } else if (block.type === "HEADER") {
      nodes.push({
        id: `out-${block.id}`,
        blockId: block.id,
        title: block.title || block.content || "Heading",
        type: "HEADER",
        level: block.headingLevel || 1,
      });
    } else if (block.stylePreset === "HEADING_1" || block.stylePreset === "HEADING_2" || block.stylePreset === "HEADING_3" || block.stylePreset === "TITLE") {
      const txt = blockToPlainText(block).split("\n")[0] || "Section";
      nodes.push({
        id: `out-${block.id}`,
        blockId: block.id,
        title: txt.slice(0, 64),
        type: block.stylePreset,
        level: block.stylePreset === "HEADING_3" ? 3 : block.stylePreset === "HEADING_2" ? 2 : 1,
      });
    } else if (block.title && block.type !== "FOOTER" && block.type !== "FOOTER_BLOCK") {
      nodes.push({
        id: `out-${block.id}`,
        blockId: block.id,
        title: block.title.slice(0, 64),
        type: String(block.type),
        level: 2,
      });
    } else if (
      block.type === "SIGNATURE_COLUMN" ||
      block.type === "SIGNATURE_STAMP" ||
      block.type === "DUAL_SIGNATURE"
    ) {
      nodes.push({
        id: `out-${block.id}`,
        blockId: block.id,
        title: `Signatory: ${block.signatoryTitle || block.targetDepartment || "Approval"}`,
        type: "SIGNATURE",
        level: 2,
      });
    }
  }
  return nodes;
}

/* ============================================================================
 * 4. DETERMINISTIC FIND & REPLACE ENGINE
 * ==========================================================================*/

function scanStringForMatches(
  text: string,
  query: string,
  caseSensitive: boolean,
  blockId: string,
  fieldPath: string,
  out: FindMatch[]
) {
  if (!text || !query) return;
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let start = 0;
  while (true) {
    const idx = hay.indexOf(needle, start);
    if (idx === -1) break;
    const exStart = Math.max(0, idx - 18);
    const exEnd = Math.min(text.length, idx + query.length + 18);
    out.push({
      id: `${blockId}::${fieldPath}::${idx}`,
      blockId,
      fieldPath,
      startIndex: idx,
      endIndex: idx + query.length,
      excerpt: `${exStart > 0 ? "..." : ""}${text.slice(exStart, exEnd)}${exEnd < text.length ? "..." : ""}`,
    });
    start = idx + Math.max(1, needle.length);
  }
}

export function findMatchesInBlocks(
  blocks: DocBlock[],
  query: string,
  caseSensitive = false
): FindMatch[] {
  const q = query;
  if (!q) return [];
  const matches: FindMatch[] = [];

  for (const b of stripMetaBlocks(blocks)) {
    if (b.title) scanStringForMatches(b.title, q, caseSensitive, b.id, "title", matches);
    if (b.subtitle) scanStringForMatches(b.subtitle, q, caseSensitive, b.id, "subtitle", matches);

    if (Array.isArray(b.runs) && b.runs.length > 0) {
      b.runs.forEach((r, idx) => {
        scanStringForMatches(r.text || "", q, caseSensitive, b.id, `runs.${idx}`, matches);
      });
    } else if (b.content) {
      scanStringForMatches(b.content, q, caseSensitive, b.id, "content", matches);
    }

    if (Array.isArray(b.listItems)) {
      b.listItems.forEach((item, idx) =>
        scanStringForMatches(item, q, caseSensitive, b.id, `listItems.${idx}`, matches)
      );
    }

    if (Array.isArray(b.checklistItems)) {
      b.checklistItems.forEach((item, idx) =>
        scanStringForMatches(item.text, q, caseSensitive, b.id, `checklistItems.${idx}`, matches)
      );
    }

    if (b.addressData) {
      for (const k of [
        "companyName",
        "division",
        "siteLocation",
        "contactPerson",
        "streetAddress",
        "cityStateZip",
        "phone",
        "email",
      ] as const) {
        if (b.addressData[k]) {
          scanStringForMatches(String(b.addressData[k]), q, caseSensitive, b.id, `address.${k}`, matches);
        }
      }
    }

    if (b.tableData) {
      (b.tableData.headers || []).forEach((h, idx) =>
        scanStringForMatches(h, q, caseSensitive, b.id, `tableH.${idx}`, matches)
      );
      (b.tableData.rows || []).forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          scanStringForMatches(String(cell || ""), q, caseSensitive, b.id, `tableC.${rIdx}.${cIdx}`, matches);
        });
      });
    }

    const metaRows = Array.isArray(b.metaData) ? b.metaData : b.metadataRows || [];
    if (Array.isArray(metaRows)) {
      metaRows.forEach((m: any, idx: number) => {
        scanStringForMatches(String(m.value || ""), q, caseSensitive, b.id, `meta.${idx}`, matches);
      });
    }

    if (b.signatoryName) {
      scanStringForMatches(b.signatoryName, q, caseSensitive, b.id, "signatoryName", matches);
    }
    if (b.signatoryTitle) {
      scanStringForMatches(b.signatoryTitle, q, caseSensitive, b.id, "signatoryTitle", matches);
    }
  }

  return matches;
}

function replaceRange(str: string, start: number, end: number, repl: string): string {
  return `${str.slice(0, start)}${repl}${str.slice(end)}`;
}

export function replaceSingleMatchInBlocks(
  blocks: DocBlock[],
  match: FindMatch,
  replacement: string
): DocBlock[] {
  return blocks.map((b) => {
    if (b.id !== match.blockId || b.isLocked || b.locked) return b;
    const next = JSON.parse(JSON.stringify(b)) as DocBlock;
    const fp = match.fieldPath;

    if (fp === "title" && typeof next.title === "string") {
      next.title = replaceRange(next.title, match.startIndex, match.endIndex, replacement);
    } else if (fp === "subtitle" && typeof next.subtitle === "string") {
      next.subtitle = replaceRange(next.subtitle, match.startIndex, match.endIndex, replacement);
    } else if (fp === "content" && typeof next.content === "string") {
      next.content = replaceRange(next.content, match.startIndex, match.endIndex, replacement);
    } else if (fp === "signatoryName" && typeof next.signatoryName === "string") {
      next.signatoryName = replaceRange(next.signatoryName, match.startIndex, match.endIndex, replacement);
    } else if (fp === "signatoryTitle" && typeof next.signatoryTitle === "string") {
      next.signatoryTitle = replaceRange(next.signatoryTitle, match.startIndex, match.endIndex, replacement);
    } else if (fp.startsWith("runs.") && Array.isArray(next.runs)) {
      const idx = Number(fp.split(".")[1]);
      if (next.runs[idx]) {
        next.runs[idx].text = replaceRange(next.runs[idx].text, match.startIndex, match.endIndex, replacement);
        next.content = next.runs.map((r) => r.text).join("");
      }
    } else if (fp.startsWith("listItems.") && Array.isArray(next.listItems)) {
      const idx = Number(fp.split(".")[1]);
      if (typeof next.listItems[idx] === "string") {
        next.listItems[idx] = replaceRange(next.listItems[idx], match.startIndex, match.endIndex, replacement);
      }
    } else if (fp.startsWith("checklistItems.") && Array.isArray(next.checklistItems)) {
      const idx = Number(fp.split(".")[1]);
      if (next.checklistItems[idx]) {
        next.checklistItems[idx].text = replaceRange(
          next.checklistItems[idx].text,
          match.startIndex,
          match.endIndex,
          replacement
        );
      }
    } else if (fp.startsWith("address.") && next.addressData) {
      const key = fp.slice("address.".length);
      if (typeof next.addressData[key] === "string") {
        next.addressData[key] = replaceRange(next.addressData[key], match.startIndex, match.endIndex, replacement);
      }
    } else if (fp.startsWith("tableH.") && next.tableData?.headers) {
      const idx = Number(fp.split(".")[1]);
      if (typeof next.tableData.headers[idx] === "string") {
        next.tableData.headers[idx] = replaceRange(
          next.tableData.headers[idx],
          match.startIndex,
          match.endIndex,
          replacement
        );
      }
    } else if (fp.startsWith("tableC.") && next.tableData?.rows) {
      const [, rStr, cStr] = fp.split(".");
      const r = Number(rStr);
      const c = Number(cStr);
      if (next.tableData.rows[r] && typeof next.tableData.rows[r][c] === "string") {
        next.tableData.rows[r][c] = replaceRange(
          next.tableData.rows[r][c],
          match.startIndex,
          match.endIndex,
          replacement
        );
      }
    } else if (fp.startsWith("meta.")) {
      const idx = Number(fp.split(".")[1]);
      if (Array.isArray(next.metaData) && next.metaData[idx]) {
        next.metaData[idx].value = replaceRange(
          String(next.metaData[idx].value || ""),
          match.startIndex,
          match.endIndex,
          replacement
        );
      }
    }
    return next;
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceAllMatchesInBlocks(
  blocks: DocBlock[],
  query: string,
  replacement: string,
  caseSensitive = false
): { blocks: DocBlock[]; count: number } {
  if (!query) return { blocks, count: 0 };
  const rx = new RegExp(escapeRegExp(query), caseSensitive ? "g" : "gi");
  let count = 0;

  const rep = (val: string): string =>
    val.replace(rx, () => {
      count += 1;
      return replacement;
    });

  const nextBlocks = blocks.map((b) => {
    if (isMetaBlock(b) || b.isLocked || b.locked) return b;
    const next = JSON.parse(JSON.stringify(b)) as DocBlock;
    if (typeof next.title === "string") next.title = rep(next.title);
    if (typeof next.subtitle === "string") next.subtitle = rep(next.subtitle);
    if (Array.isArray(next.runs) && next.runs.length > 0) {
      next.runs = next.runs.map((r) => ({ ...r, text: rep(r.text || "") }));
      next.content = next.runs.map((r) => r.text).join("");
    } else if (typeof next.content === "string") {
      next.content = rep(next.content);
    }
    if (Array.isArray(next.listItems)) {
      next.listItems = next.listItems.map((i) => rep(i));
    }
    if (Array.isArray(next.checklistItems)) {
      next.checklistItems = next.checklistItems.map((c) => ({ ...c, text: rep(c.text) }));
    }
    if (next.addressData) {
      for (const k of [
        "companyName",
        "division",
        "siteLocation",
        "contactPerson",
        "streetAddress",
        "cityStateZip",
        "phone",
        "email",
      ] as const) {
        if (typeof next.addressData[k] === "string") next.addressData[k] = rep(next.addressData[k]);
      }
    }
    if (next.tableData) {
      if (Array.isArray(next.tableData.headers)) {
        next.tableData.headers = next.tableData.headers.map((h) => rep(h));
      }
      if (Array.isArray(next.tableData.rows)) {
        next.tableData.rows = next.tableData.rows.map((r) => r.map((c) => rep(String(c || ""))));
      }
    }
    if (Array.isArray(next.metaData)) {
      next.metaData = next.metaData.map((m: any) => ({ ...m, value: rep(String(m.value || "")) }));
    }
    if (typeof next.signatoryName === "string") next.signatoryName = rep(next.signatoryName);
    if (typeof next.signatoryTitle === "string") next.signatoryTitle = rep(next.signatoryTitle);
    return next;
  });

  return { blocks: nextBlocks, count };
}

/* ============================================================================
 * 5. DETERMINISTIC VERSION DIFF & WORD-LEVEL REDLINE ENGINE
 * ==========================================================================*/

export function computeWordDiff(beforeText: string, afterText: string): WordDiffSegment[] {
  const a = beforeText.split(/(\s+)/).filter((t) => t.length > 0);
  const b = afterText.split(/(\s+)/).filter((t) => t.length > 0);
  if (a.length === 0 && b.length === 0) return [];
  if (a.length * b.length > 25000) {
    return [
      ...(beforeText ? [{ kind: "removed" as const, text: beforeText }] : []),
      ...(afterText ? [{ kind: "added" as const, text: afterText }] : []),
    ];
  }

  const m = a.length;
  const n = b.length;
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }
  }

  const raw: WordDiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      raw.push({ kind: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ kind: "removed", text: a[i] });
      i++;
    } else {
      raw.push({ kind: "added", text: b[j] });
      j++;
    }
  }
  while (i < m) raw.push({ kind: "removed", text: a[i++] });
  while (j < n) raw.push({ kind: "added", text: b[j++] });

  const merged: WordDiffSegment[] = [];
  for (const seg of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === seg.kind) {
      prev.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

export function compareDocumentVersions(
  baseBlocksRaw: DocBlock[],
  targetBlocksRaw: DocBlock[]
): VersionDiffItem[] {
  const baseBlocks = stripMetaBlocks(baseBlocksRaw);
  const targetBlocks = stripMetaBlocks(targetBlocksRaw);

  const baseMap = new Map(baseBlocks.map((b) => [b.id, b]));
  const targetMap = new Map(targetBlocks.map((b) => [b.id, b]));
  const items: VersionDiffItem[] = [];
  const processedBase = new Set<string>();

  for (const tb of targetBlocks) {
    const bb = baseMap.get(tb.id);
    const afterText = blockToPlainText(tb);
    const label = tb.title || tb.type;
    if (!bb) {
      items.push({
        id: `diff-add-${tb.id}`,
        blockId: tb.id,
        blockType: String(tb.type),
        label,
        status: "ADDED",
        beforeText: "",
        afterText,
        wordDiff: afterText ? [{ kind: "added", text: afterText }] : [],
      });
    } else {
      processedBase.add(bb.id);
      const beforeText = blockToPlainText(bb);
      const isSame =
        beforeText === afterText &&
        JSON.stringify(bb.tableData || null) === JSON.stringify(tb.tableData || null) &&
        bb.alignment === tb.alignment;

      items.push({
        id: `diff-${tb.id}`,
        blockId: tb.id,
        blockType: String(tb.type),
        label,
        status: isSame ? "UNCHANGED" : "MODIFIED",
        beforeText,
        afterText,
        wordDiff: isSame
          ? [{ kind: "equal", text: afterText }]
          : computeWordDiff(beforeText, afterText),
      });
    }
  }

  for (const bb of baseBlocks) {
    if (!targetMap.has(bb.id) && !processedBase.has(bb.id)) {
      const beforeText = blockToPlainText(bb);
      items.push({
        id: `diff-rem-${bb.id}`,
        blockId: bb.id,
        blockType: String(bb.type),
        label: bb.title || bb.type,
        status: "REMOVED",
        beforeText,
        afterText: "",
        wordDiff: beforeText ? [{ kind: "removed", text: beforeText }] : [],
      });
    }
  }

  return items;
}

/* ============================================================================
 * 6. ERP LIVE MAIL MERGE TOKEN ENGINE
 * ==========================================================================*/

const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function extractMergeTokensFromBlocks(blocks: DocBlock[]): string[] {
  const found = new Set<string>();
  for (const b of stripMetaBlocks(blocks)) {
    const text = JSON.stringify(b);
    let m: RegExpExecArray | null;
    const rx = new RegExp(TOKEN_REGEX.source, "g");
    while ((m = rx.exec(text)) !== null) {
      found.add(m[1]);
    }
  }
  return Array.from(found);
}

export function resolveStringWithMailMerge(
  input: string,
  fields: Record<string, string>
): string {
  if (!input || !input.includes("{{")) return input;
  return input.replace(TOKEN_REGEX, (full, key) => {
    const cleanKey = String(key).trim();
    if (Object.prototype.hasOwnProperty.call(fields, cleanKey)) {
      return fields[cleanKey] ?? "";
    }
    const lowerMatch = Object.entries(fields).find(([k]) => k.toLowerCase() === cleanKey.toLowerCase());
    return lowerMatch ? lowerMatch[1] : full;
  });
}

export function applyMailMergeToBlocks(
  blocks: DocBlock[],
  record: MailMergeSourceRecord | Record<string, string> | null
): DocBlock[] {
  if (!record) return blocks;
  const fields = "fields" in record && typeof record.fields === "object" ? (record as MailMergeSourceRecord).fields : (record as Record<string, string>);
  const s = (v?: string) => (typeof v === "string" ? resolveStringWithMailMerge(v, fields) : v);

  return blocks.map((b) => {
    if (isMetaBlock(b)) return b;
    const next: DocBlock = { ...b };
    if (next.title) next.title = s(next.title);
    if (next.subtitle) next.subtitle = s(next.subtitle);
    if (next.content) next.content = s(next.content);
    if (Array.isArray(next.runs)) {
      next.runs = next.runs.map((r) => ({ ...r, text: resolveStringWithMailMerge(r.text || "", fields) }));
    }
    if (Array.isArray(next.listItems)) {
      next.listItems = next.listItems.map((i) => resolveStringWithMailMerge(i, fields));
    }
    if (Array.isArray(next.checklistItems)) {
      next.checklistItems = next.checklistItems.map((c) => ({
        ...c,
        text: resolveStringWithMailMerge(c.text, fields),
      }));
    }
    if (next.addressData) {
      const addrCopy = { ...next.addressData };
      for (const key of Object.keys(addrCopy)) {
        if (typeof addrCopy[key] === "string") {
          addrCopy[key] = resolveStringWithMailMerge(addrCopy[key], fields);
        }
      }
      next.addressData = addrCopy;
    }
    if (next.tableData) {
      next.tableData = {
        ...next.tableData,
        headers: (next.tableData.headers || []).map((h) => resolveStringWithMailMerge(h, fields)),
        rows: (next.tableData.rows || []).map((row) =>
          row.map((cell) => resolveStringWithMailMerge(String(cell || ""), fields))
        ),
      };
    }
    if (Array.isArray(next.metaData)) {
      next.metaData = next.metaData.map((m: any) => ({
        ...m,
        value: typeof m.value === "string" ? resolveStringWithMailMerge(m.value, fields) : m.value,
      }));
    }
    if (next.signatoryName) next.signatoryName = s(next.signatoryName);
    if (next.signatoryTitle) next.signatoryTitle = s(next.signatoryTitle);
    if (next.secondarySignatoryName) next.secondarySignatoryName = s(next.secondarySignatoryName);
    if (next.footerLeftText) next.footerLeftText = s(next.footerLeftText);
    if (next.footerRightText) next.footerRightText = s(next.footerRightText);
    return next;
  });
}

/* ============================================================================
 * 7. DETERMINISTIC STRICT PREFLIGHT INSPECTOR (--strict)
 * ==========================================================================*/

export function runDocumentPreflight(
  blocks: DocBlock[],
  meta: DocumentMetaEnvelope,
  opts: { title?: string; printableWidthPx?: number } = {}
): DocumentPreflightReport {
  const issues: DocumentPreflightIssue[] = [];
  const content = stripMetaBlocks(blocks);

  const trimmedTitle = (opts.title || "").trim();
  if (
    !trimmedTitle ||
    trimmedTitle.toLowerCase() === "untitled document" ||
    trimmedTitle.toLowerCase() === "dokumen baru tanpa judul"
  ) {
    issues.push({
      id: "pre-title",
      severity: "WARNING",
      code: "MISSING_TITLE",
      messageId: "Judul dokumen masih menggunakan placeholder default.",
      messageEn: "Document title still uses the default placeholder.",
    });
  }

  const substantiveBlocks = content.filter(
    (b) => b.type !== "OFFICIAL_LETTERHEAD" && b.type !== "PAGE_BREAK" && b.type !== "DIVIDER"
  );
  if (substantiveBlocks.length === 0) {
    issues.push({
      id: "pre-empty",
      severity: "ERROR",
      code: "EMPTY_DOCUMENT",
      messageId: "Dokumen belum memiliki blok isi selain kop surat.",
      messageEn: "Document has no body content blocks beyond letterhead.",
    });
  }

  let hasSignatureBlock = false;
  const maxWidth = opts.printableWidthPx || 720;

  for (const b of content) {
    // 1. Unresolved {{token}} check
    const plain = blockToPlainText(b);
    const matches = plain.match(TOKEN_REGEX);
    if (matches && matches.length > 0) {
      issues.push({
        id: `pre-tok-${b.id}`,
        severity: "ERROR",
        code: "UNRESOLVED_TOKEN",
        blockId: b.id,
        messageId: `Variabel Mail Merge belum terisi: ${Array.from(new Set(matches)).join(", ")}`,
        messageEn: `Unresolved Mail Merge token(s): ${Array.from(new Set(matches)).join(", ")}`,
      });
    }

    // 2. Table formula check (#ERR!, #CYCLE!, #DIV/0!, #REF!, #NAME?)
    if (b.type === "TABLE" && b.tableData?.rows) {
      b.tableData.rows.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
          const s = String(cell || "");
          if (s.startsWith("=")) {
            const val = evaluateTableFormula(s, rIdx, cIdx, b.tableData!);
            if (val.startsWith("#")) {
              issues.push({
                id: `pre-formula-${b.id}-${rIdx}-${cIdx}`,
                severity: "ERROR",
                code: "FORMULA_ERROR",
                blockId: b.id,
                messageId: `Formula sel tabel bermasalah (${val}) pada baris ${rIdx + 1}, kolom ${cIdx + 1}.`,
                messageEn: `Broken table formula (${val}) at row ${rIdx + 1}, col ${cIdx + 1}.`,
              });
            }
          }
        });
      });
    }

    // 3. Signature completeness check
    if (
      b.type === "SIGNATURE_COLUMN" ||
      b.type === "SIGNATURE_STAMP" ||
      b.type === "DUAL_SIGNATURE"
    ) {
      hasSignatureBlock = true;
      if (!(b.signatoryName || "").trim()) {
        issues.push({
          id: `pre-sig-${b.id}`,
          severity: "WARNING",
          code: "MISSING_SIGNATORY",
          blockId: b.id,
          messageId: "Blok tanda tangan belum mencantumkan nama pejabat penandatangan.",
          messageEn: "Signature block is missing a designated signatory name.",
        });
      }
    }

    // 4. Print area width overflow check
    const explicitW = typeof b.width === "number" ? b.width : 0;
    if (explicitW > maxWidth + 8) {
      issues.push({
        id: `pre-ovf-${b.id}`,
        severity: "WARNING",
        code: "BLOCK_OVERFLOW",
        blockId: b.id,
        messageId: `Lebar blok (${explicitW}px) melebihi batas margin area cetak (${maxWidth}px).`,
        messageEn: `Block width (${explicitW}px) exceeds printable margin boundary (${maxWidth}px).`,
      });
    }
  }

  if (!hasSignatureBlock && substantiveBlocks.length > 0) {
    issues.push({
      id: "pre-no-sig",
      severity: "WARNING",
      code: "NO_SIGNATURE_BLOCK",
      messageId: "Belum ada blok otorisasi/tanda tangan pada dokumen.",
      messageEn: "No authorization or signature block present in the document.",
    });
  }

  const openComments = (meta.comments || []).filter((c) => !c.resolved);
  if (openComments.length > 0) {
    issues.push({
      id: "pre-comments",
      severity: "WARNING",
      code: "UNRESOLVED_COMMENTS",
      blockId: openComments[0]?.blockId,
      messageId: `${openComments.length} utas komentar ulasan masih berstatus Open/Unresolved.`,
      messageEn: `${openComments.length} review comment thread(s) remain unresolved.`,
    });
  }

  const pendingChanges = (meta.trackedChanges || []).filter((c) => c.status === "PENDING");
  if (pendingChanges.length > 0) {
    issues.push({
      id: "pre-changes",
      severity: "WARNING",
      code: "PENDING_TRACK_CHANGES",
      blockId: pendingChanges[0]?.blockId,
      messageId: `${pendingChanges.length} revisi Track Changes belum di-Accept atau Reject.`,
      messageEn: `${pendingChanges.length} tracked revision(s) have not been Accepted or Rejected.`,
    });
  }

  const errorCount = issues.filter((i) => i.severity === "ERROR").length;
  const warningCount = issues.filter((i) => i.severity === "WARNING").length;

  return {
    passed: errorCount === 0,
    errorCount,
    warningCount,
    issues,
  };
}

/* ============================================================================
 * 8. DETERMINISTIC MULTI-FORMAT SERIALIZERS (.HTML / .MD / .TXT)
 * ==========================================================================*/

function escHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportBlocksToHtml(
  blocks: DocBlock[],
  meta: DocumentMetaEnvelope,
  opts: { title: string; documentCode?: string; department?: string; status?: string }
): string {
  const clean = stripMetaBlocks(blocks);
  const parts: string[] = [];
  const footerParts: string[] = [];

  for (const b of clean) {
    if (b.type === "FOOTER" || b.type === "FOOTER_BLOCK") {
      const leftTxt = b.footerLeftText || b.title || "This document is computationally issued and validated. Valid without physical signature.";
      const rightTxt = b.footerRightText || b.content || "OFFICIAL ERP DOCUMENT";
      const rightSub = b.subtitle || "OFFICIAL WORKSPACE DOCUMENT";
      footerParts.push(
        `<div style="border-top:2px solid #000000;padding-top:10px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
          <div style="max-width:70%;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#000000;line-height:1.35;">${escHtml(leftTxt)}</div>
          <div style="text-align:right;max-width:30%;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#000000;">${escHtml(rightTxt)}</div>
            <div style="font-size:9px;text-transform:uppercase;color:#78716c;">${escHtml(rightSub)}</div>
          </div>
        </div>`
      );
      continue;
    }
    if (b.type === "PAGE_BREAK") {
      parts.push(`<div style="page-break-after:always;border-top:1px dashed #d6d3d1;margin:24px 0;"></div>`);
      continue;
    }
    if (b.type === "DIVIDER") {
      parts.push(`<hr style="border:none;border-top:1px solid #d6d3d1;margin:16px 0;" />`);
      continue;
    }
    if (b.type === "OFFICIAL_LETTERHEAD") {
      const a = b.addressData || {};
      parts.push(
        `<header style="border-bottom:3px solid #1c1917;padding-bottom:14px;margin-bottom:20px;text-align:center;">
          <h1 style="margin:0;font-size:20px;letter-spacing:0.04em;color:#1c1917;">${escHtml(b.title || a.companyName || "CV. BATU EMAS GROUP")}</h1>
          <p style="margin:4px 0 0;font-size:11px;font-weight:700;color:#57534e;text-transform:uppercase;">${escHtml(b.subtitle || "")}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#57534e;">${escHtml(a.streetAddress || "")} · Tel: ${escHtml(a.phone || "")} · ${escHtml(a.email || "")}</p>
        </header>`
      );
      continue;
    }
    if (b.type === "HEADER") {
      const align = String(b.alignment || b.align || "center").toLowerCase();
      parts.push(
        `<div style="text-align:${align};margin:14px 0;">
          <h2 style="margin:0;font-size:16px;color:#1c1917;">${escHtml(b.title || "")}</h2>
          ${b.content ? `<p style="margin:4px 0 0;font-size:12px;color:#57534e;">${escHtml(b.content)}</p>` : ""}
        </div>`
      );
      continue;
    }
    if (b.type === "TEXT" || b.type === "CALLOUT") {
      const align = String(b.alignment || b.align || "left").toLowerCase();
      const body = Array.isArray(b.runs) && b.runs.length
        ? b.runs
            .map((r) => {
              let t = escHtml(r.text || "");
              if (r.bold) t = `<strong>${t}</strong>`;
              if (r.italic) t = `<em>${t}</em>`;
              if (r.underline) t = `<u>${t}</u>`;
              if (r.strikethrough) t = `<s>${t}</s>`;
              return t;
            })
            .join("")
        : escHtml(b.content || "").replace(/\n/g, "<br/>");
      if (b.type === "CALLOUT") {
        parts.push(
          `<aside style="background:#f5f5f4;border:1px solid #d6d3d1;border-radius:6px;padding:12px 14px;margin:12px 0;text-align:${align};">
            ${b.title ? `<strong style="display:block;font-size:12px;margin-bottom:4px;">${escHtml(b.title)}</strong>` : ""}
            <div style="font-size:13px;line-height:1.6;">${body}</div>
          </aside>`
        );
      } else {
        parts.push(
          `<p style="font-size:${Number(b.fontSize) || 13}px;line-height:${Number(b.lineHeight) || 1.6};text-align:${align};margin:10px 0;color:#1c1917;">${body}</p>`
        );
      }
      continue;
    }
    if (b.type === "LIST_POINTS" || b.type === "CHECKLIST") {
      const items =
        b.type === "CHECKLIST"
          ? (b.checklistItems || []).map((c) => `${c.checked ? "☑" : "☐"} ${c.text}`)
          : b.listItems || [];
      parts.push(
        `<div style="margin:12px 0;">
          ${b.title ? `<h3 style="font-size:13px;margin:0 0 6px;">${escHtml(b.title)}</h3>` : ""}
          <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.6;">
            ${items.map((item) => `<li>${escHtml(item)}</li>`).join("")}
          </ul>
        </div>`
      );
      continue;
    }
    if (b.type === "TABLE" && b.tableData) {
      const td = b.tableData;
      const colAligns = td.columnAlignments || b.columnAlignments || [];
      const ths = (td.headers || [])
        .map((h, hIdx) => {
          const align = colAligns[hIdx] || "left";
          return `<th style="border:1px solid #d6d3d1;background:#f5f5f4;padding:6px 8px;text-align:${align};font-size:11px;">${escHtml(h)}</th>`;
        })
        .join("");
      const trs = (td.rows || [])
        .map(
          (row, rIdx) =>
            `<tr style="${td.zebraStriping && rIdx % 2 === 1 ? "background:#fafaf9;" : ""}">${row
              .map((c, cIdx) => {
                const key = `${rIdx}-${cIdx}`;
                const meta = td.cellMeta?.[key];
                if (meta?.hidden) return "";
                const fmt = td.cellFormats?.[key];
                const raw = String(c || "");
                const v = raw.startsWith("=")
                  ? evaluateTableFormula(raw, rIdx, cIdx, td)
                  : formatCellValue(raw, fmt);
                const align = meta?.textAlign || colAligns[cIdx] || "left";
                const bg = meta?.backgroundColor ? `background:${meta.backgroundColor};` : "";
                const fw = meta?.bold || raw.startsWith("=") ? "font-weight:700;" : "";
                const fs = meta?.italic ? "font-style:italic;" : "";
                const rs = meta?.rowSpan && meta.rowSpan > 1 ? ` rowspan="${meta.rowSpan}"` : "";
                const cs = meta?.colSpan && meta.colSpan > 1 ? ` colspan="${meta.colSpan}"` : "";
                return `<td${rs}${cs} style="border:1px solid #e7e5e4;padding:6px 8px;font-size:12px;text-align:${align};${bg}${fw}${fs}">${escHtml(v)}</td>`;
              })
              .join("")}</tr>`
        )
        .join("");
      parts.push(
        `<div style="margin:14px 0;">
          ${b.title ? `<div style="font-size:12px;font-weight:700;margin-bottom:6px;">${escHtml(b.title)}</div>` : ""}
          <table style="width:100%;border-collapse:collapse;"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
        </div>`
      );
      continue;
    }
    if (b.type === "METADATA_GRID") {
      const rows = Array.isArray(b.metaData) ? b.metaData : b.metadataRows || [];
      parts.push(
        `<dl style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;background:#fafaf9;border:1px solid #e7e5e4;padding:10px;border-radius:6px;margin:12px 0;">
          ${rows
            .map(
              (m: any) =>
                `<div><dt style="font-size:10px;color:#78716c;text-transform:uppercase;">${escHtml(m.key || m.label || "")}</dt><dd style="margin:2px 0 0;font-size:12px;font-weight:600;">${escHtml(m.value || "")}</dd></div>`
            )
            .join("")}
        </dl>`
      );
      continue;
    }
    if (
      b.type === "SENDER_ADDRESS" ||
      b.type === "RECIPIENT_ADDRESS" ||
      b.type === "PROJECT_SITE_ADDRESS" ||
      b.type === "CONTACT_CARD"
    ) {
      const a = b.addressData || {};
      const lines = [
        a.companyName || a.entityName,
        a.division || a.siteLocation,
        a.contactPerson,
        a.streetAddress,
        a.cityStateZip || a.cityPostal,
        [a.phone, a.email].filter(Boolean).join(" · "),
      ].filter(Boolean);
      parts.push(
        `<div style="border:1px solid #e7e5e4;border-radius:6px;padding:10px 12px;margin:10px 0;font-size:12px;line-height:1.5;">
          ${b.title ? `<div style="font-size:10px;font-weight:700;color:#78716c;text-transform:uppercase;margin-bottom:4px;">${escHtml(b.title)}</div>` : ""}
          ${lines.map((l) => `<div>${escHtml(String(l))}</div>`).join("")}
        </div>`
      );
      continue;
    }
    if (
      b.type === "SIGNATURE_COLUMN" ||
      b.type === "SIGNATURE_STAMP" ||
      b.type === "DUAL_SIGNATURE"
    ) {
      parts.push(
        `<div style="margin:24px 0 12px;display:flex;justify-content:flex-end;">
          <div style="text-align:center;min-width:200px;">
            <div style="font-size:11px;color:#57534e;">${escHtml(b.signatoryTitle || b.targetRole || "Authorized Official")}</div>
            <div style="height:48px;"></div>
            <div style="border-top:1px solid #1c1917;padding-top:4px;font-size:12px;font-weight:700;">${escHtml(b.signatoryName || "( Authorized Signatory )")}</div>
          </div>
        </div>`
      );
      continue;
    }
    const plain = blockToPlainText(b);
    if (plain) parts.push(`<p style="font-size:12px;margin:8px 0;">${escHtml(plain)}</p>`);
  }

  const ps = meta.pageSetup;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escHtml(opts.title || "ERP Document")}</title>
  <style>
    @page { margin: ${ps.marginTopMm}mm ${ps.marginRightMm}mm ${ps.marginBottomMm}mm ${ps.marginLeftMm}mm; }
    body { font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif; color: #1c1917; background: #fafaf9; margin: 0; padding: 32px 16px; }
    .sheet { max-width: 800px; min-height: 260mm; margin: 0 auto; background: #ffffff; border: 1px solid #e7e5e4; padding: ${ps.marginTopMm}mm ${ps.marginRightMm}mm ${ps.marginBottomMm}mm ${ps.marginLeftMm}mm; display: flex; flex-direction: column; box-sizing: border-box; }
    .sheet-body { flex: 1; }
    .sheet-footers { margin-top: auto; padding-top: 16px; ${ps.showPageNumbers ? "padding-bottom: 4px;" : ""} display: flex; flex-direction: column; gap: 10px; }
    .page-foot { font-size: 9.5px; font-family: monospace; color: #78716c; display: flex; justify-content: flex-end; margin-top: ${footerParts.length > 0 ? "8px" : "12px"}; }
  </style>
</head>
<body>
  <article class="sheet">
    <div class="sheet-body">
      ${parts.join("\n")}
    </div>
    ${footerParts.length > 0 ? `<div class="sheet-footers">${footerParts.join("\n")}</div>` : ""}
    ${ps.showPageNumbers ? `<footer class="page-foot"><span>Page 1 of 1</span></footer>` : ""}
  </article>
</body>
</html>`;
}

export function exportBlocksToMarkdown(
  blocks: DocBlock[],
  meta: DocumentMetaEnvelope,
  title: string
): string {
  const clean = stripMetaBlocks(blocks);
  const out: string[] = [`# ${title || "Official ERP Document"}`, ""];

  for (const b of clean) {
    if (b.type === "PAGE_BREAK" || b.type === "DIVIDER") {
      out.push("---", "");
      continue;
    }
    if (b.type === "OFFICIAL_LETTERHEAD") {
      const a = b.addressData || {};
      out.push(`> **${b.title || a.companyName || "CV. BATU EMAS GROUP"}**`);
      if (b.subtitle) out.push(`> ${b.subtitle}`);
      if (a.streetAddress) out.push(`> ${a.streetAddress}`);
      out.push("");
      continue;
    }
    if (b.type === "HEADER") {
      out.push(`## ${b.title || b.content || ""}`);
      if (b.title && b.content) out.push(`*${b.content}*`);
      out.push("");
      continue;
    }
    if (b.type === "TEXT") {
      const text = Array.isArray(b.runs) && b.runs.length ? b.runs.map((r) => r.text).join("") : b.content || "";
      out.push(text, "");
      continue;
    }
    if (b.type === "CALLOUT") {
      if (b.title) out.push(`> **${b.title}**`);
      out.push(`> ${b.content || ""}`, "");
      continue;
    }
    if (b.type === "LIST_POINTS") {
      if (b.title) out.push(`### ${b.title}`);
      (b.listItems || []).forEach((item, i) => out.push(`${i + 1}. ${item}`));
      out.push("");
      continue;
    }
    if (b.type === "CHECKLIST") {
      if (b.title) out.push(`### ${b.title}`);
      (b.checklistItems || []).forEach((c) => out.push(`- [${c.checked ? "x" : " "}] ${c.text}`));
      out.push("");
      continue;
    }
    if (b.type === "TABLE" && b.tableData) {
      if (b.title) out.push(`### ${b.title}`);
      const headers = b.tableData.headers || [];
      out.push(`| ${headers.join(" | ")} |`);
      out.push(`| ${headers.map(() => "---").join(" | ")} |`);
      (b.tableData.rows || []).forEach((row, rIdx) => {
        const vals = row.map((c, cIdx) =>
          String(c || "").startsWith("=") ? evaluateTableFormula(c, rIdx, cIdx, b.tableData!) : String(c || "")
        );
        out.push(`| ${vals.join(" | ")} |`);
      });
      out.push("");
      continue;
    }
    const plain = blockToPlainText(b);
    if (plain) out.push(plain, "");
  }

  return out.join("\n");
}

export function exportBlocksToPlainText(
  blocks: DocBlock[],
  _meta: DocumentMetaEnvelope,
  title: string
): string {
  const clean = stripMetaBlocks(blocks);
  const out: string[] = [title || "Official ERP Document", "=".repeat(Math.max(20, (title || "").length)), ""];
  for (const b of clean) {
    const plain = blockToPlainText(b);
    if (plain) out.push(plain, "");
  }
  return out.join("\n");
}
