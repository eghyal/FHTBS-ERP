/**
 * Hybrid DOCX-Native Office & Deterministic PDF Engine (Isomorphic Browser + Server)
 * - Word-like Per-Selection Rich-Text Run Engine (DocTextRun[] splitting, styling & merging)
 * - Table Formula Evaluator V2 (=SUM(ABOVE), =AVERAGE(ABOVE), =COUNT(ABOVE), =MIN(ABOVE), =MAX(ABOVE), =SUM(LEFT), =AVERAGE(LEFT))
 * - OpenXML (.docx) Binary ZIP Package Builder & Round-Trip Parser (ECMA-376 compliant)
 * - Deterministic PDF 1.4 Binary Generator (A4_PORTRAIT / A4_LANDSCAPE / EXECUTIVE_MEMO)
 * - Cryptographic SHA-256 Content Hashing & HMAC-SHA256 Signed Access/Callback Tokens
 */

import type {
  DocBlock,
  DocTableData,
  DocTextRun,
  LayoutPreset,
  OnlyOfficeEditorSession,
  WorkspaceDocument,
} from '../types/workspace.ts';

/* ============================================================================
 * 1. ISOMORPHIC SHA-256 & HMAC-SHA256 CRYPTOGRAPHY
 * ==========================================================================*/

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function sha256Bytes(data: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const bitLen = data.length * 8;
  const padLen = ((data.length + 9 + 63) & ~63);
  const padded = new Uint8Array(padLen);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let i = 0; i < padLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function computeSha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? utf8ToBytes(input) : input;
  return bytesToHex(sha256Bytes(bytes));
}

export function computeHmacSha256Hex(secret: string, message: string): string {
  const blockSize = 64;
  let keyBytes = utf8ToBytes(secret);
  if (keyBytes.length > blockSize) {
    keyBytes = sha256Bytes(keyBytes);
  }
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(keyBytes);

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = paddedKey[i] ^ 0x5c;
    iKeyPad[i] = paddedKey[i] ^ 0x36;
  }

  const msgBytes = utf8ToBytes(message);
  const innerInput = new Uint8Array(blockSize + msgBytes.length);
  innerInput.set(iKeyPad);
  innerInput.set(msgBytes, blockSize);
  const innerHash = sha256Bytes(innerInput);

  const outerInput = new Uint8Array(blockSize + innerHash.length);
  outerInput.set(oKeyPad);
  outerInput.set(innerHash, blockSize);
  return bytesToHex(sha256Bytes(outerInput));
}

/* ============================================================================
 * 2. SIGNED ACCESS & CALLBACK TOKENS FOR ONLYOFFICE / FILE STREAMS
 * ==========================================================================*/

const DEFAULT_SIGNING_SECRET =
  (typeof process !== 'undefined' && process.env?.JWT_SECRET) ||
  'fhtbs_erp_workspace_docx_hmac_secret_2026';

export interface SignedDocTokenPayload {
  docId: string;
  version?: number;
  purpose: 'file' | 'callback' | 'session' | 'pdf';
  userId: string;
  role: string;
  mode: 'edit' | 'view';
  exp: number;
}

function toBase64Url(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64 + pad, 'base64').toString('utf8');
  }
  return decodeURIComponent(escape(atob(b64 + pad)));
}

export function signDocumentAccessToken(
  payload: Omit<SignedDocTokenPayload, 'exp'> & { expiresInMs?: number; exp?: number },
  secret: string = DEFAULT_SIGNING_SECRET
): string {
  const exp = payload.exp ?? Date.now() + (payload.expiresInMs ?? 15 * 60 * 1000);
  const fullPayload: SignedDocTokenPayload = {
    docId: payload.docId,
    version: payload.version ?? 1,
    purpose: payload.purpose,
    userId: payload.userId,
    role: payload.role,
    mode: payload.mode,
    exp,
  };
  const headerB64 = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'WSD_JWT' }));
  const bodyB64 = toBase64Url(JSON.stringify(fullPayload));
  const sig = computeHmacSha256Hex(secret, `${headerB64}.${bodyB64}`);
  return `${headerB64}.${bodyB64}.${sig}`;
}

export function verifyDocumentAccessToken(
  token: string | undefined | null,
  expectedDocId: string,
  allowedPurposes?: Array<'file' | 'callback' | 'session' | 'pdf'>,
  secret: string = DEFAULT_SIGNING_SECRET
): { valid: boolean; reason?: string; payload?: SignedDocTokenPayload } {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Missing signed document token' };
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'Malformed signed token structure' };
  }
  const [headerB64, bodyB64, sig] = parts;
  const expectedSig = computeHmacSha256Hex(secret, `${headerB64}.${bodyB64}`);
  if (sig !== expectedSig) {
    return { valid: false, reason: 'Invalid token HMAC signature' };
  }
  try {
    const payload = JSON.parse(fromBase64Url(bodyB64)) as SignedDocTokenPayload;
    if (payload.docId !== expectedDocId) {
      return { valid: false, reason: 'Token documentId mismatch' };
    }
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
      return { valid: false, reason: 'Signed token has expired' };
    }
    if (allowedPurposes && allowedPurposes.length > 0 && !allowedPurposes.includes(payload.purpose)) {
      return { valid: false, reason: `Token purpose '${payload.purpose}' not permitted for this endpoint` };
    }
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, reason: 'Failed to decode token payload' };
  }
}

/* ============================================================================
 * 3. PER-WORD / PER-SELECTION RICH-TEXT RUN ENGINE (DocTextRun[])
 * ==========================================================================*/

let runSeq = 0;
function nextRunId(): string {
  runSeq += 1;
  return `run-${Date.now().toString(36)}-${runSeq}`;
}

export function getBlockPlainText(block: DocBlock): string {
  if (block.runs && block.runs.length > 0) {
    return block.runs.map((r) => r.text).join('');
  }
  return block.content || '';
}

export function normalizeBlockRuns(block: DocBlock): DocTextRun[] {
  const baseText = block.content ?? '';
  if (block.runs && Array.isArray(block.runs) && block.runs.length > 0) {
    const runsText = block.runs.map((r) => r.text).join('');
    // If block.content was edited directly via textarea and matches length or differs, reconcile
    if (runsText === baseText || !baseText) {
      return mergeAdjacentRuns(block.runs);
    }
  }
  if (!baseText) return [];
  return [
    {
      id: nextRunId(),
      text: baseText,
      bold: block.isBold,
      italic: block.isItalic,
      underline: block.isUnderline,
      strikethrough: block.isStrikethrough,
      fontSize: block.fontSize,
      color: block.textColor,
      highlight: block.highlightColor,
    },
  ];
}

export function mergeAdjacentRuns(runs: DocTextRun[]): DocTextRun[] {
  const out: DocTextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const prev = out[out.length - 1];
    if (
      prev &&
      Boolean(prev.bold) === Boolean(run.bold) &&
      Boolean(prev.italic) === Boolean(run.italic) &&
      Boolean(prev.underline) === Boolean(run.underline) &&
      Boolean(prev.strikethrough) === Boolean(run.strikethrough) &&
      (prev.fontSize || undefined) === (run.fontSize || undefined) &&
      (prev.color || undefined) === (run.color || undefined) &&
      (prev.highlight || undefined) === (run.highlight || undefined) &&
      (prev.fontFamily || undefined) === (run.fontFamily || undefined)
    ) {
      prev.text += run.text;
    } else {
      out.push({ ...run, id: run.id || nextRunId() });
    }
  }
  return out;
}

export interface RunStylePatch {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontSize?: number;
  color?: string;
  highlight?: string;
  fontFamily?: string;
}

/**
 * Applies character-level / word-level formatting strictly to `[startOffset, endOffset)`
 * within a block's text, preserving all surrounding text runs untouched.
 */
export function applyFormattingToTextRange(
  block: DocBlock,
  startOffset: number,
  endOffset: number,
  patch: RunStylePatch
): { runs: DocTextRun[]; content: string } {
  const currentRuns = normalizeBlockRuns(block);
  const fullText = currentRuns.map((r) => r.text).join('');
  const clampedStart = Math.max(0, Math.min(startOffset, fullText.length));
  const clampedEnd = Math.max(clampedStart, Math.min(endOffset, fullText.length));

  if (clampedStart === clampedEnd) {
    return { runs: currentRuns, content: fullText };
  }

  // Check if all characters in range already have the toggled boolean property
  const segmentsInTarget: DocTextRun[] = [];
  let cursor = 0;
  for (const run of currentRuns) {
    const rStart = cursor;
    const rEnd = cursor + run.text.length;
    cursor = rEnd;
    if (rEnd <= clampedStart || rStart >= clampedEnd) continue;
    segmentsInTarget.push(run);
  }

  const effectivePatch: RunStylePatch = { ...patch };
  if (patch.bold !== undefined && segmentsInTarget.length > 0) {
    const allBold = segmentsInTarget.every((r) => Boolean(r.bold));
    effectivePatch.bold = !allBold;
  }
  if (patch.italic !== undefined && segmentsInTarget.length > 0) {
    const allItalic = segmentsInTarget.every((r) => Boolean(r.italic));
    effectivePatch.italic = !allItalic;
  }
  if (patch.underline !== undefined && segmentsInTarget.length > 0) {
    const allUnderline = segmentsInTarget.every((r) => Boolean(r.underline));
    effectivePatch.underline = !allUnderline;
  }
  if (patch.strikethrough !== undefined && segmentsInTarget.length > 0) {
    const allStrike = segmentsInTarget.every((r) => Boolean(r.strikethrough));
    effectivePatch.strikethrough = !allStrike;
  }

  const nextRuns: DocTextRun[] = [];
  cursor = 0;

  for (const run of currentRuns) {
    const rStart = cursor;
    const rEnd = cursor + run.text.length;
    cursor = rEnd;

    // Completely outside selection
    if (rEnd <= clampedStart || rStart >= clampedEnd) {
      nextRuns.push(run);
      continue;
    }

    // Prefix before selection
    if (rStart < clampedStart) {
      nextRuns.push({
        ...run,
        id: nextRunId(),
        text: run.text.slice(0, clampedStart - rStart),
      });
    }

    // Selected middle slice
    const selSliceStart = Math.max(0, clampedStart - rStart);
    const selSliceEnd = Math.min(run.text.length, clampedEnd - rStart);
    const selectedSliceText = run.text.slice(selSliceStart, selSliceEnd);
    if (selectedSliceText.length > 0) {
      nextRuns.push({
        ...run,
        id: nextRunId(),
        text: selectedSliceText,
        bold: effectivePatch.bold !== undefined ? effectivePatch.bold : run.bold,
        italic: effectivePatch.italic !== undefined ? effectivePatch.italic : run.italic,
        underline: effectivePatch.underline !== undefined ? effectivePatch.underline : run.underline,
        strikethrough:
          effectivePatch.strikethrough !== undefined ? effectivePatch.strikethrough : run.strikethrough,
        fontSize: effectivePatch.fontSize !== undefined ? effectivePatch.fontSize : run.fontSize,
        color: effectivePatch.color !== undefined ? effectivePatch.color : run.color,
        highlight: effectivePatch.highlight !== undefined ? effectivePatch.highlight : run.highlight,
        fontFamily: effectivePatch.fontFamily !== undefined ? effectivePatch.fontFamily : run.fontFamily,
      });
    }

    // Suffix after selection
    if (rEnd > clampedEnd) {
      nextRuns.push({
        ...run,
        id: nextRunId(),
        text: run.text.slice(clampedEnd - rStart),
      });
    }
  }

  const merged = mergeAdjacentRuns(nextRuns);
  return {
    runs: merged,
    content: merged.map((r) => r.text).join(''),
  };
}

/**
 * Reconciles a plain-text edit (e.g. from textarea typing) with existing DocTextRun[]
 * so character-level formatting on unchanged words is preserved.
 */
export function reconcileRunsWithEditedText(
  existingRuns: DocTextRun[] | undefined,
  newText: string
): DocTextRun[] | undefined {
  if (!existingRuns || existingRuns.length === 0) return undefined;
  const oldText = existingRuns.map((r) => r.text).join('');
  if (oldText === newText) return existingRuns;
  if (!newText) return [];

  // Find common prefix and common suffix between oldText and newText
  let prefixLen = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++;
  }

  let oldSuffixIdx = oldText.length;
  let newSuffixIdx = newText.length;
  while (
    oldSuffixIdx > prefixLen &&
    newSuffixIdx > prefixLen &&
    oldText[oldSuffixIdx - 1] === newText[newSuffixIdx - 1]
  ) {
    oldSuffixIdx--;
    newSuffixIdx--;
  }

  const insertedText = newText.slice(prefixLen, newSuffixIdx);
  const resultRuns: DocTextRun[] = [];
  let cursor = 0;
  let insertedPlaced = false;

  for (const run of existingRuns) {
    const rStart = cursor;
    const rEnd = cursor + run.text.length;
    cursor = rEnd;

    // Keep portion before prefixLen
    if (rStart < prefixLen) {
      const keepEnd = Math.min(rEnd, prefixLen);
      resultRuns.push({
        ...run,
        id: nextRunId(),
        text: run.text.slice(0, keepEnd - rStart),
      });
    }

    // Insert new text inheriting style of the run at prefixLen
    if (!insertedPlaced && prefixLen >= rStart && prefixLen <= rEnd) {
      if (insertedText.length > 0) {
        resultRuns.push({
          ...run,
          id: nextRunId(),
          text: insertedText,
        });
      }
      insertedPlaced = true;
    }

    // Keep portion after oldSuffixIdx
    if (rEnd > oldSuffixIdx) {
      const keepStart = Math.max(rStart, oldSuffixIdx);
      resultRuns.push({
        ...run,
        id: nextRunId(),
        text: run.text.slice(keepStart - rStart),
      });
    }
  }

  if (!insertedPlaced && insertedText.length > 0) {
    const baseStyle = existingRuns[existingRuns.length - 1] || {};
    resultRuns.push({
      ...baseStyle,
      id: nextRunId(),
      text: insertedText,
    });
  }

  return mergeAdjacentRuns(resultRuns);
}

/* ============================================================================
 * 4. TABLE FORMULA EVALUATOR V2
 * ==========================================================================*/

export function evaluateTableFormula(
  formula: string,
  rowIndex: number,
  colIndex: number,
  tableData: DocTableData
): string {
  if (!formula || typeof formula !== 'string' || !formula.trim().startsWith('=')) {
    return formula;
  }

  const cleanFormula = formula.trim().toUpperCase();
  const rows = tableData.rows || [];

  const parseNumericCell = (raw: string | undefined): number | null => {
    if (!raw || typeof raw !== 'string') return null;
    if (raw.trim().startsWith('=')) return null;
    // Strip currency symbols (Rp, IDR, $) and handle Indonesian/English number formatting
    const stripped = raw.replace(/[^\d.,-]/g, '').trim();
    if (!stripped) return null;
    // If format is 1.250.000 or 14.500.000 (dots as thousands separators)
    const dotParts = stripped.split('.');
    let normalized = stripped;
    if (dotParts.length > 2 || (dotParts.length === 2 && dotParts[1].length === 3 && !stripped.includes(','))) {
      normalized = stripped.replace(/\./g, '').replace(',', '.');
    } else if (stripped.includes(',') && stripped.includes('.')) {
      normalized = stripped.replace(/\./g, '').replace(',', '.');
    } else if (stripped.includes(',')) {
      normalized = stripped.replace(',', '.');
    }
    const num = parseFloat(normalized);
    return Number.isFinite(num) ? num : null;
  };

  const aboveValues: number[] = [];
  for (let r = 0; r < rowIndex; r++) {
    const num = parseNumericCell(rows[r]?.[colIndex]);
    if (num !== null) aboveValues.push(num);
  }

  const leftValues: number[] = [];
  for (let c = 0; c < colIndex; c++) {
    const num = parseNumericCell(rows[rowIndex]?.[c]);
    if (num !== null) leftValues.push(num);
  }

  if (cleanFormula === '=SUM(ABOVE)') {
    const sum = aboveValues.reduce((acc, curr) => acc + curr, 0);
    return sum.toLocaleString('id-ID');
  }

  if (cleanFormula === '=AVERAGE(ABOVE)' || cleanFormula === '=AVG(ABOVE)') {
    if (aboveValues.length === 0) return '0';
    const avg = aboveValues.reduce((acc, curr) => acc + curr, 0) / aboveValues.length;
    return avg.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  }

  if (cleanFormula === '=COUNT(ABOVE)') {
    return aboveValues.length.toString();
  }

  if (cleanFormula === '=MIN(ABOVE)') {
    if (aboveValues.length === 0) return '0';
    return Math.min(...aboveValues).toLocaleString('id-ID');
  }

  if (cleanFormula === '=MAX(ABOVE)') {
    if (aboveValues.length === 0) return '0';
    return Math.max(...aboveValues).toLocaleString('id-ID');
  }

  if (cleanFormula === '=SUM(LEFT)') {
    const sum = leftValues.reduce((acc, curr) => acc + curr, 0);
    return sum.toLocaleString('id-ID');
  }

  if (cleanFormula === '=AVERAGE(LEFT)' || cleanFormula === '=AVG(LEFT)') {
    if (leftValues.length === 0) return '0';
    const avg = leftValues.reduce((acc, curr) => acc + curr, 0) / leftValues.length;
    return avg.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  }

  return formula;
}

/* ============================================================================
 * 5. ONLYOFFICE SESSION CONFIGURATION GENERATOR (WITH SIGNED TOKENS)
 * ==========================================================================*/

export function createOnlyOfficeSession(params: {
  documentId: string;
  documentTitle: string;
  documentCode: string;
  currentVersion?: number;
  user: { id: string; name: string; role: string };
  isApprovedOrLocked: boolean;
  serverUrl?: string;
}): OnlyOfficeEditorSession {
  const {
    documentId,
    documentTitle,
    documentCode,
    currentVersion = 1,
    user,
    isApprovedOrLocked,
    serverUrl = '',
  } = params;
  const isViewOnly = isApprovedOrLocked;
  const mode: 'edit' | 'view' = isViewOnly ? 'view' : 'edit';
  const expiresInMs = 30 * 60 * 1000; // 30 minutes
  const expiresAtIso = new Date(Date.now() + expiresInMs).toISOString();

  const fileToken = signDocumentAccessToken({
    docId: documentId,
    version: currentVersion,
    purpose: 'file',
    userId: user.id,
    role: user.role,
    mode,
    expiresInMs,
  });

  const callbackToken = signDocumentAccessToken({
    docId: documentId,
    version: currentVersion,
    purpose: 'callback',
    userId: user.id,
    role: user.role,
    mode,
    expiresInMs,
  });

  const sessionToken = signDocumentAccessToken({
    docId: documentId,
    version: currentVersion,
    purpose: 'session',
    userId: user.id,
    role: user.role,
    mode,
    expiresInMs,
  });

  const documentKey = `${documentId}_v${currentVersion}_${computeSha256Hex(`${documentId}:${currentVersion}:${documentCode}`).slice(0, 12)}`;

  return {
    documentId,
    documentKey,
    documentTitle: `${documentTitle || documentCode}.docx`,
    documentType: 'word',
    fileUrl: `${serverUrl}/api/workspace-documents/${documentId}/file?token=${encodeURIComponent(fileToken)}`,
    callbackUrl: `${serverUrl}/api/workspace-documents/${documentId}/callback?token=${encodeURIComponent(callbackToken)}`,
    mode,
    token: sessionToken,
    fileToken,
    callbackToken,
    expiresAt: expiresAtIso,
    permissions: {
      edit: !isViewOnly,
      review: !isViewOnly,
      comment: true,
      download: true,
      print: true,
    },
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
  };
}

/* ============================================================================
 * 6. REAL OPENXML (.DOCX) ZIP PACKAGE BUILDER & ROUND-TRIP PARSER
 * ==========================================================================*/

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildZipStoreArchive(files: Array<{ name: string; content: Uint8Array }>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = utf8ToBytes(file.name);
    const data = file.content;
    const crc = crc32(data);

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // method 0 = Store
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x5421, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    // Central directory header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // method 0 = Store
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((acc, p) => acc + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + eocd.length;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of localParts) {
    out.set(p, pos);
    pos += p.length;
  }
  for (const p of centralParts) {
    out.set(p, pos);
    pos += p.length;
  }
  out.set(eocd, pos);
  return out;
}

function renderRunOpenXml(run: DocTextRun, blockFallback?: DocBlock): string {
  const bold = run.bold ?? blockFallback?.isBold;
  const italic = run.italic ?? blockFallback?.isItalic;
  const underline = run.underline ?? blockFallback?.isUnderline;
  const strike = run.strikethrough ?? blockFallback?.isStrikethrough;
  const fontSizePt = run.fontSize ?? blockFallback?.fontSize ?? 11;
  const colorHex = (run.color || blockFallback?.textColor || '#1c1917').replace('#', '');

  const rPrParts: string[] = [];
  if (bold) rPrParts.push('<w:b/>');
  if (italic) rPrParts.push('<w:i/>');
  if (underline) rPrParts.push('<w:u w:val="single"/>');
  if (strike) rPrParts.push('<w:strike/>');
  if (colorHex && colorHex.length === 6) rPrParts.push(`<w:color w:val="${escapeXml(colorHex)}"/>`);
  rPrParts.push(`<w:sz w:val="${Math.round(fontSizePt * 2)}"/>`);

  return `<w:r><w:rPr>${rPrParts.join('')}</w:rPr><w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
}

export type CanonicalHorizontalAlign = 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFY';
export type CanonicalVerticalAlign = 'TOP' | 'MIDDLE' | 'BOTTOM';

export function normalizeHorizontalAlign(
  raw?: string | null,
  fallback: CanonicalHorizontalAlign = 'LEFT'
): CanonicalHorizontalAlign {
  if (!raw) return fallback;
  const upper = String(raw).trim().toUpperCase();
  if (upper === 'CENTER' || upper === 'MIDDLE') return 'CENTER';
  if (upper === 'RIGHT' || upper === 'END') return 'RIGHT';
  if (upper === 'JUSTIFY' || upper === 'BOTH') return 'JUSTIFY';
  if (upper === 'LEFT' || upper === 'START') return 'LEFT';
  return fallback;
}

export function normalizeVerticalAlign(
  raw?: string | null,
  fallback: CanonicalVerticalAlign = 'TOP'
): CanonicalVerticalAlign {
  if (!raw) return fallback;
  const upper = String(raw).trim().toUpperCase();
  if (upper === 'MIDDLE' || upper === 'CENTER') return 'MIDDLE';
  if (upper === 'BOTTOM' || upper === 'END') return 'BOTTOM';
  if (upper === 'TOP' || upper === 'START') return 'TOP';
  return fallback;
}

export function normalizeBlockAlignment(block: DocBlock): DocBlock {
  const defaultAlign: CanonicalHorizontalAlign =
    block.type === 'HEADER' || block.type === 'heading'
      ? 'CENTER'
      : block.type === 'SIGNATURE_COLUMN' || block.type === 'SIGNATURE_STAMP'
      ? 'RIGHT'
      : 'LEFT';
  const hAlign = normalizeHorizontalAlign(block.alignment || block.align, defaultAlign);
  const vAlign = normalizeVerticalAlign(block.verticalAlignment || block.verticalAlign, 'TOP');
  const next: DocBlock = {
    ...block,
    alignment: hAlign,
    align: hAlign.toLowerCase() as DocBlock['align'],
    verticalAlignment: vAlign,
    verticalAlign: vAlign.toLowerCase() as DocBlock['verticalAlign'],
  };
  if (next.tableData) {
    const colAligns = (next.tableData.columnAlignments || next.columnAlignments || []).map((ca) => {
      const norm = normalizeHorizontalAlign(ca, 'LEFT');
      return (norm === 'RIGHT' ? 'right' : norm === 'CENTER' ? 'center' : 'left') as 'left' | 'center' | 'right';
    });
    next.tableData = {
      ...next.tableData,
      columnAlignments: colAligns,
    };
    next.columnAlignments = colAligns;
  }
  return next;
}

function renderBlockOpenXml(block: DocBlock): string {
  const type = block.type;
  const defaultAlign: CanonicalHorizontalAlign =
    type === 'HEADER' || type === 'heading'
      ? 'CENTER'
      : type === 'SIGNATURE_COLUMN' || type === 'SIGNATURE_STAMP'
      ? 'RIGHT'
      : 'LEFT';
  const alignNorm = normalizeHorizontalAlign(block.alignment || block.align, defaultAlign);
  const jcVal =
    alignNorm === 'CENTER'
      ? 'center'
      : alignNorm === 'RIGHT'
      ? 'right'
      : alignNorm === 'JUSTIFY'
      ? 'both'
      : 'left';

  if (type === 'OFFICIAL_LETTERHEAD' || type === 'letterhead') {
    const company = block.title || block.addressData?.companyName || 'CV. BATU EMAS GROUP';
    const sub =
      block.subtitle || 'PRODUSEN & SUPPLIER UTAMA PAVING BLOCK, BATAKO & BETON PRACETAK';
    const addr =
      block.addressData?.streetAddress ||
      'Dusun Petahunan, Jajag, Gambiran, Banyuwangi Regency, East Java 68486';
    return [
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${escapeXml(company)}</w:t></w:r></w:p>`,
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="18"/></w:rPr><w:t>${escapeXml(sub)}</w:t></w:r></w:p>`,
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${escapeXml(addr)}</w:t></w:r></w:p>`,
    ].join('');
  }

  if (type === 'HEADER' || type === 'heading') {
    const title = block.title || block.content || '';
    const sub = block.title && block.content ? block.content : '';
    const runsXml =
      block.runs && block.runs.length > 0
        ? block.runs.map((r) => renderRunOpenXml(r, block)).join('')
        : `<w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r>`;
    return [
      `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr>${runsXml}</w:p>`,
      sub
        ? `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>${escapeXml(sub)}</w:t></w:r></w:p>`
        : '',
    ].join('');
  }

  if (type === 'TEXT' || type === 'paragraph' || type === 'CALLOUT' || type === 'callout') {
    const runs = normalizeBlockRuns(block);
    const runsXml = runs.map((r) => renderRunOpenXml(r, block)).join('');
    const titlePrefix =
      (type === 'CALLOUT' || type === 'callout') && block.title
        ? `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(block.title)}</w:t></w:r></w:p>`
        : '';
    return `${titlePrefix}<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr>${runsXml}</w:p>`;
  }

  if (type === 'LIST_POINTS' || type === 'list') {
    const items = block.listItems || (block.content ? block.content.split('\n') : []);
    const titleXml = block.title
      ? `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(block.title)}</w:t></w:r></w:p>`
      : '';
    return (
      titleXml +
      items
        .map(
          (item, idx) =>
            `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r><w:t xml:space="preserve">${idx + 1}. ${escapeXml(item)}</w:t></w:r></w:p>`
        )
        .join('')
    );
  }

  if (
    type === 'SENDER_ADDRESS' ||
    type === 'RECIPIENT_ADDRESS' ||
    type === 'PROJECT_SITE_ADDRESS' ||
    type === 'address'
  ) {
    const a = block.addressData || {};
    const lines = [
      block.title || a.label,
      a.companyName || a.entityName,
      a.division || a.siteLocation,
      a.streetAddress,
      [a.contactPerson, a.phone].filter(Boolean).join(' | '),
    ].filter(Boolean);
    return lines
      .map(
        (ln, i) =>
          `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r>${i <= 1 ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t>${escapeXml(ln)}</w:t></w:r></w:p>`
      )
      .join('');
  }

  if (type === 'TABLE' || type === 'table') {
    const td = block.tableData || { headers: [], rows: [] };
    const colAligns = td.columnAlignments || block.columnAlignments || [];
    const headerRow = `<w:tr>${(td.headers || [])
      .map((h, hIdx) => {
        const colJc =
          colAligns[hIdx] === 'right'
            ? 'right'
            : colAligns[hIdx] === 'center'
            ? 'center'
            : jcVal;
        return `<w:tc><w:p><w:pPr><w:jc w:val="${colJc}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(h)}</w:t></w:r></w:p></w:tc>`;
      })
      .join('')}</w:tr>`;
    const bodyRows = (td.rows || [])
      .map(
        (row, rIdx) =>
          `<w:tr>${row
            .map((cell, cIdx) => {
              const evaluated = cell?.toString().startsWith('=')
                ? evaluateTableFormula(cell, rIdx, cIdx, td)
                : cell;
              const colJc =
                colAligns[cIdx] === 'right'
                  ? 'right'
                  : colAligns[cIdx] === 'center'
                  ? 'center'
                  : jcVal;
              return `<w:tc><w:p><w:pPr><w:jc w:val="${colJc}"/></w:pPr><w:r><w:t>${escapeXml(evaluated)}</w:t></w:r></w:p></w:tc>`;
            })
            .join('')}</w:tr>`
      )
      .join('');
    return `<w:tbl>${headerRow}${bodyRows}</w:tbl>`;
  }

  if (
    type === 'SIGNATURE_COLUMN' ||
    type === 'SIGNATURE_STAMP' ||
    type === 'DUAL_SIGNATURE' ||
    type === 'signature'
  ) {
    const sigTitle = block.signatoryTitle || block.targetRole || 'Authorized Signatory';
    const sigName = block.signatoryName || '( Authorized Official )';
    const dept = block.targetDepartment || 'HR';
    const sigJc = type === 'DUAL_SIGNATURE' ? 'center' : jcVal;
    const prefix = type === 'DUAL_SIGNATURE' ? 'Prepared By / Authorized By' : 'Authorized By';
    return `<w:p><w:pPr><w:jc w:val="${sigJc}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(
      `${prefix} (${dept}): ${sigTitle} - ${sigName}`
    )}</w:t></w:r></w:p>`;
  }

  if (type === 'METADATA_GRID' || type === 'metadata') {
    const rawMeta = Array.isArray(block.metaData)
      ? block.metaData
      : block.metadataRows || (block.metaData as any)?.items || [];
    const titleXml = block.title
      ? `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(block.title)}</w:t></w:r></w:p>`
      : '';
    const rowsXml = rawMeta
      .map(
        (r: { label?: string; key?: string; value: string }) =>
          `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(r.key || r.label || '')}: </w:t></w:r><w:r><w:t>${escapeXml(r.value)}</w:t></w:r></w:p>`
      )
      .join('');
    return titleXml + rowsXml;
  }

  if (type === 'IMAGE' || type === 'image' || type === 'IMAGE_STAMP') {
    const cap = block.mediaData?.caption || block.caption || block.title || block.content || 'Visual Documentation';
    return `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>${escapeXml(`[Photo Attachment: ${cap}]`)}</w:t></w:r></w:p>`;
  }

  if (type === 'FOOTER' || type === 'FOOTER_BLOCK') {
    const leftTxt = block.footerLeftText || block.title || 'CV. BATU EMAS GROUP — CONTROLLED ERP DOCUMENT';
    const rightTxt = block.footerRightText || block.content || 'ISO 9001:2015 VERIFIED';
    return `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>${escapeXml(
      `${leftTxt} | ${rightTxt}`
    )}</w:t></w:r></w:p>`;
  }

  if (type === 'DIVIDER' || type === 'divider') {
    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>--------------------------------------------------------------------------------</w:t></w:r></w:p>`;
  }

  const fallbackText = block.title || block.content || '';
  return `<w:p><w:pPr><w:jc w:val="${jcVal}"/></w:pPr><w:r><w:t>${escapeXml(fallbackText)}</w:t></w:r></w:p>`;
}

function resolvePresetMillimeters(
  preset?: LayoutPreset,
  customWidthMm?: number,
  customHeightMm?: number
): { widthMm: number; heightMm: number; isLandscape: boolean } {
  const p = preset || 'A4_PORTRAIT';
  if (p === 'CUSTOM') {
    const w = Math.max(60, Math.min(600, Number(customWidthMm) || 210));
    const h = Math.max(80, Math.min(800, Number(customHeightMm) || 297));
    return { widthMm: w, heightMm: h, isLandscape: w > h };
  }
  const map: Record<string, [number, number]> = {
    A4_PORTRAIT: [210, 297],
    A4_LANDSCAPE: [297, 210],
    F4_PORTRAIT: [215, 330],
    F4_LANDSCAPE: [330, 215],
    US_LETTER_PORTRAIT: [216, 279],
    US_LETTER_LANDSCAPE: [279, 216],
    US_LEGAL_PORTRAIT: [216, 356],
    US_LEGAL_LANDSCAPE: [356, 216],
    A3_PORTRAIT: [297, 420],
    A3_LANDSCAPE: [420, 297],
    A5_PORTRAIT: [148, 210],
    A5_LANDSCAPE: [210, 148],
    B5_PORTRAIT: [176, 250],
    THERMAL_80MM: [80, 200],
    EXECUTIVE_MEMO: [184, 267],
  };
  const [w, h] = map[p] || [210, 297];
  return { widthMm: w, heightMm: h, isLandscape: w > h };
}

/**
 * Generates a real OpenXML (.docx) binary ZIP buffer from WorkspaceDocument metadata + DocBlock[].
 * Embeds both standard `word/document.xml` and canonical `word/erp_blocks.json` for lossless round-trip.
 */
export function generateDocxBinaryBuffer(doc: {
  id: string;
  document_code: string;
  title: string;
  document_type?: string;
  department?: string;
  layout_preset?: LayoutPreset;
  custom_width_mm?: number;
  custom_height_mm?: number;
  status?: string;
  blocks: DocBlock[];
}): { buffer: Uint8Array; sha256: string; size: number } {
  const { widthMm, heightMm, isLandscape } = resolvePresetMillimeters(
    doc.layout_preset,
    doc.custom_width_mm,
    doc.custom_height_mm
  );
  // 1 mm = 56.6929 dxa (twips)
  const pgW = Math.round(widthMm * 56.6929);
  const pgH = Math.round(heightMm * 56.6929);
  const orientAttr = isLandscape ? ' w:orient="landscape"' : '';

  const normalizedBlocks = (doc.blocks || []).map((b) => normalizeBlockAlignment(b));
  const bodyXml = normalizedBlocks.map((b) => renderBlockOpenXml(b)).join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="${pgW}" w:h="${pgH}"${orientAttr}/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="json" ContentType="application/json"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${escapeXml(doc.title)}</dc:title>
  <dc:subject>${escapeXml(doc.document_code)}</dc:subject>
  <dc:creator>${escapeXml(doc.department || 'CV. Batu Emas Group')}</dc:creator>
</cp:coreProperties>`;

  const canonicalBlocksJson = JSON.stringify(
    {
      document_code: doc.document_code,
      title: doc.title,
      layout_preset: doc.layout_preset || 'A4_PORTRAIT',
      blocks: normalizedBlocks,
    },
    null,
    2
  );

  const zipBytes = buildZipStoreArchive([
    { name: '[Content_Types].xml', content: utf8ToBytes(contentTypesXml) },
    { name: '_rels/.rels', content: utf8ToBytes(relsXml) },
    { name: 'docProps/core.xml', content: utf8ToBytes(coreXml) },
    { name: 'word/document.xml', content: utf8ToBytes(documentXml) },
    { name: 'word/erp_blocks.json', content: utf8ToBytes(canonicalBlocksJson) },
  ]);

  const sha256 = computeSha256Hex(zipBytes);
  return {
    buffer: zipBytes,
    sha256,
    size: zipBytes.length,
  };
}

/**
 * Extracts DocBlock[] from a stored OpenXML (.docx) buffer (lossless round-trip).
 */
export function extractBlocksFromDocxBuffer(buffer: Uint8Array): DocBlock[] | null {
  try {
    // Check PK\x03\x04 signature
    if (buffer.length < 30 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return null;
    }
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    let offset = 0;
    let xmlText = '';

    while (offset + 30 <= buffer.length) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;
      const compSize = view.getUint32(offset + 18, true);
      const nameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const name = bytesToUtf8(buffer.subarray(offset + 30, offset + 30 + nameLen));
      const dataStart = offset + 30 + nameLen + extraLen;
      const fileData = buffer.subarray(dataStart, dataStart + compSize);

      if (name === 'word/erp_blocks.json') {
        const parsed = JSON.parse(bytesToUtf8(fileData));
        if (Array.isArray(parsed?.blocks)) {
          return parsed.blocks.map((b: DocBlock) => normalizeBlockAlignment(b));
        }
      }
      if (name === 'word/document.xml') {
        xmlText = bytesToUtf8(fileData);
      }
      offset = dataStart + compSize;
    }

    if (xmlText) {
      const paragraphs: DocBlock[] = [];
      const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
      let match: RegExpExecArray | null;
      let idx = 0;
      while ((match = pRegex.exec(xmlText)) !== null) {
        const pInner = match[1];
        const jcMatch = /<w:jc\b[^>]*w:val=["']([^"']+)["']/.exec(pInner);
        const parsedAlignment = normalizeHorizontalAlign(jcMatch ? jcMatch[1] : 'LEFT', 'LEFT');
        const runs: DocTextRun[] = [];
        const rRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
        let rMatch: RegExpExecArray | null;
        while ((rMatch = rRegex.exec(pInner)) !== null) {
          const rInner = rMatch[1];
          const tMatch = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/.exec(rInner);
          if (tMatch) {
            const rawText = tMatch[1]
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .replace(/&amp;/g, '&');
            runs.push({
              id: `run-parsed-${++idx}`,
              text: rawText,
              bold: /<w:b\b/.test(rInner),
              italic: /<w:i\b/.test(rInner),
              underline: /<w:u\b/.test(rInner),
              strikethrough: /<w:strike\b/.test(rInner),
            });
          }
        }
        if (runs.length > 0) {
          paragraphs.push(
            normalizeBlockAlignment({
              id: `blk-parsed-${idx}`,
              type: 'TEXT',
              content: runs.map((r) => r.text).join(''),
              alignment: parsedAlignment,
              runs,
            })
          );
        }
      }
      return paragraphs;
    }
  } catch (_) {}
  return null;
}

/* ============================================================================
 * 7. DETERMINISTIC PDF 1.4 BINARY GENERATOR (WITH SHA-256 INTEGRITY)
 * ==========================================================================*/

function escapePdfText(str: string): string {
  return String(str || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Generates a deterministic PDF 1.4 binary buffer matching the document layout preset
 * (`A4_PORTRAIT`, `A4_LANDSCAPE`, `F4_PORTRAIT`, `F4_LANDSCAPE`, `EXECUTIVE_MEMO`),
 * block alignments (`LEFT`, `CENTER`, `RIGHT`, `JUSTIFY`), evaluated table formulas,
 * and approval metadata.
 */
export function generateDeterministicPdfBuffer(doc: {
  id: string;
  document_code: string;
  title: string;
  document_type?: string;
  department?: string;
  layout_preset?: LayoutPreset;
  custom_width_mm?: number;
  custom_height_mm?: number;
  status?: string;
  authorization_department?: string;
  authorization_role?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  blocks: DocBlock[];
}): { buffer: Uint8Array; sha256: string; size: number; pageSize: { widthPt: number; heightPt: number; orientation: 'portrait' | 'landscape' } } {
  const { widthMm, heightMm, isLandscape } = resolvePresetMillimeters(
    doc.layout_preset,
    doc.custom_width_mm,
    doc.custom_height_mm
  );
  // 1 mm = 2.83465 pt
  const widthPt = Math.round(widthMm * 2.83465);
  const heightPt = Math.round(heightMm * 2.83465);
  const orientation: 'portrait' | 'landscape' = isLandscape ? 'landscape' : 'portrait';

  const lines: Array<{ text: string; bold?: boolean; size?: number; align?: CanonicalHorizontalAlign }> = [
    { text: 'CV. BATU EMAS GROUP - OFFICIAL ERP DOCUMENT', bold: true, size: 13, align: 'CENTER' },
    {
      text: `Code: ${doc.document_code} | Status: ${doc.status || 'DRAFT'} | Layout: ${doc.layout_preset || 'A4_PORTRAIT'}`,
      bold: false,
      size: 9,
      align: 'CENTER',
    },
    { text: `Title: ${doc.title}`, bold: true, size: 12, align: 'CENTER' },
    {
      text: `Routing: ${doc.authorization_department || doc.department || 'HR'} (${doc.authorization_role || 'HR_MANAGER'})`,
      bold: false,
      size: 9,
      align: 'CENTER',
    },
    { text: '--------------------------------------------------------------------------------', size: 9, align: 'CENTER' },
  ];

  for (const rawBlock of doc.blocks || []) {
    const block = normalizeBlockAlignment(rawBlock);
    const bAlign: CanonicalHorizontalAlign = normalizeHorizontalAlign(block.alignment, 'LEFT');
    if (block.type === 'OFFICIAL_LETTERHEAD' || block.type === 'letterhead') {
      lines.push({
        text: `[KOP RESMI] ${block.title || 'CV. BATU EMAS GROUP'} - ${block.addressData?.phone || '0811-1111-3993'}`,
        bold: true,
        size: 10,
        align: 'CENTER',
      });
    } else if (block.type === 'HEADER' || block.type === 'heading') {
      if (block.title) lines.push({ text: block.title, bold: true, size: 11, align: bAlign });
      if (block.content) lines.push({ text: block.content, bold: false, size: 10, align: bAlign });
    } else if (block.type === 'TEXT' || block.type === 'paragraph' || block.type === 'CALLOUT' || block.type === 'callout') {
      if (block.title) lines.push({ text: `[${block.title}]`, bold: true, size: 10, align: bAlign });
      const txt = getBlockPlainText(block);
      const wrapped = txt.match(/.{1,85}(\s|$)/g) || [txt];
      for (const wLine of wrapped) {
        lines.push({ text: wLine.trim(), bold: Boolean(block.isBold), size: 10, align: bAlign });
      }
    } else if (block.type === 'LIST_POINTS' || block.type === 'list') {
      if (block.title) lines.push({ text: block.title, bold: true, size: 10, align: bAlign });
      (block.listItems || []).forEach((item, idx) => {
        lines.push({ text: `  ${idx + 1}. ${item}`, size: 10, align: bAlign });
      });
    } else if (
      block.type === 'SENDER_ADDRESS' ||
      block.type === 'RECIPIENT_ADDRESS' ||
      block.type === 'PROJECT_SITE_ADDRESS' ||
      block.type === 'address'
    ) {
      const a = block.addressData || {};
      if (block.title) lines.push({ text: block.title, bold: true, size: 10, align: bAlign });
      if (a.companyName) lines.push({ text: a.companyName, bold: true, size: 10, align: bAlign });
      if (a.division || a.siteLocation) lines.push({ text: a.division || a.siteLocation || '', size: 9, align: bAlign });
      if (a.streetAddress) lines.push({ text: a.streetAddress, size: 9, align: bAlign });
    } else if (block.type === 'TABLE' || block.type === 'table') {
      const td = block.tableData || { headers: [], rows: [] };
      if (block.title) lines.push({ text: `[Table] ${block.title}`, bold: true, size: 10, align: bAlign });
      if (td.headers?.length) {
        lines.push({ text: `| ${td.headers.join(' | ')} |`, bold: true, size: 9, align: bAlign });
      }
      (td.rows || []).forEach((row, rIdx) => {
        const renderedCells = row.map((cell, cIdx) =>
          cell?.toString().startsWith('=') ? evaluateTableFormula(cell, rIdx, cIdx, td) : cell
        );
        lines.push({ text: `| ${renderedCells.join(' | ')} |`, size: 9, align: bAlign });
      });
    } else if (
      block.type === 'SIGNATURE_COLUMN' ||
      block.type === 'SIGNATURE_STAMP' ||
      block.type === 'DUAL_SIGNATURE' ||
      block.type === 'signature'
    ) {
      lines.push({
        text: `[SIGNATURE] Dept: ${block.targetDepartment || 'PURCHASING'} | Role: ${block.targetRole || ''} | ${block.signatoryTitle || ''} ${block.signatoryName || ''}`,
        bold: true,
        size: 9,
        align: block.type === 'DUAL_SIGNATURE' ? 'CENTER' : bAlign,
      });
    } else if (block.type === 'METADATA_GRID' || block.type === 'metadata') {
      if (block.title) lines.push({ text: `[Metadata] ${block.title}`, bold: true, size: 10, align: bAlign });
      const rows = Array.isArray(block.metaData)
        ? block.metaData
        : block.metadataRows || (block.metaData as any)?.items || [];
      for (const item of rows) {
        lines.push({ text: `${(item as any).key || (item as any).label || ''}: ${item.value}`, size: 9, align: bAlign });
      }
    } else if (block.type === 'IMAGE' || block.type === 'image' || block.type === 'IMAGE_STAMP') {
      const cap = block.mediaData?.caption || block.caption || block.title || block.content || 'Visual Documentation';
      lines.push({ text: `[Photo: ${cap}]`, bold: false, size: 9, align: bAlign });
    } else if (block.type === 'FOOTER' || block.type === 'FOOTER_BLOCK') {
      lines.push({
        text: `${block.footerLeftText || block.title || 'CV. BATU EMAS GROUP'} — ${block.footerRightText || block.content || 'ISO 9001:2015'}`,
        bold: false,
        size: 8,
        align: bAlign,
      });
    } else if (block.type === 'DIVIDER' || block.type === 'divider') {
      lines.push({
        text: '--------------------------------------------------------------------------------',
        size: 8,
        align: 'CENTER',
      });
    }
  }

  if (doc.approved_by) {
    lines.push({
      text: `APPROVED BY: ${doc.approved_by} AT ${doc.approved_at || ''}`,
      bold: true,
      size: 10,
      align: 'RIGHT',
    });
  }

  let y = heightPt - 48;
  const marginX = 42;
  const contentOps: string[] = ['BT'];
  for (const line of lines) {
    if (y < 40) break;
    const fontKey = line.bold ? '/F2' : '/F1';
    const sz = line.size || 10;
    const approxTextWidth = line.text.length * sz * (line.bold ? 0.55 : 0.5);
    let xPos = marginX;
    if (line.align === 'CENTER') {
      xPos = Math.max(marginX, Math.round((widthPt - approxTextWidth) / 2));
    } else if (line.align === 'RIGHT') {
      xPos = Math.max(marginX, Math.round(widthPt - marginX - approxTextWidth));
    }
    contentOps.push(`${fontKey} ${sz} Tf`);
    contentOps.push(`1 0 0 1 ${xPos} ${y} Tm`);
    contentOps.push(`(${escapePdfText(line.text)}) Tj`);
    y -= sz + 5;
  }
  contentOps.push('ET');
  const streamContent = contentOps.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj',
    `6 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj`,
  ];

  let pdfStr = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdfStr.length);
    pdfStr += obj + '\n';
  }
  const xrefOffset = pdfStr.length;
  pdfStr += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdfStr += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdfStr += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const buffer = utf8ToBytes(pdfStr);
  const sha256 = computeSha256Hex(buffer);

  return {
    buffer,
    sha256,
    size: buffer.length,
    pageSize: { widthPt, heightPt, orientation },
  };
}

/* ============================================================================
 * 8. HTML SUMMARY EXPORT HELPER
 * ==========================================================================*/

export function convertBlocksToSummaryHtml(blocks: DocBlock[]): string {
  if (!blocks || !Array.isArray(blocks)) return '';
  return blocks
    .map((b) => {
      if (b.type === 'heading' || b.type === 'HEADER') {
        return `<h${b.headingLevel || 2}>${escapeXml(b.content || b.title || '')}</h${b.headingLevel || 2}>`;
      }
      if (b.type === 'paragraph' || b.type === 'TEXT') {
        if (b.runs && b.runs.length > 0) {
          const inner = b.runs
            .map((r) => {
              let t = escapeXml(r.text);
              if (r.bold) t = `<strong>${t}</strong>`;
              if (r.italic) t = `<em>${t}</em>`;
              if (r.underline) t = `<u>${t}</u>`;
              if (r.strikethrough) t = `<s>${t}</s>`;
              return t;
            })
            .join('');
          return `<p>${inner}</p>`;
        }
        return `<p>${escapeXml(b.content || '')}</p>`;
      }
      if (b.type === 'callout' || b.type === 'CALLOUT') {
        return `<div class="callout">${escapeXml(b.content || '')}</div>`;
      }
      return '';
    })
    .join('\n');
}

/* ============================================================================
 * 9. CELL FORMATTER & RICH-TEXT RUN / DOCX PACKAGE HELPER EXPORTS
 * ==========================================================================*/

export function formatCellValue(
  raw: string,
  format?: 'TEXT' | 'CURRENCY_IDR' | 'CURRENCY_USD' | 'NUMBER' | 'PERCENT'
): string {
  if (!raw || !format || format === 'TEXT') return raw;
  const stripped = raw.replace(/[^\d.,-]/g, '').trim();
  if (!stripped) return raw;
  const num = parseFloat(stripped.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(num)) return raw;
  if (format === 'CURRENCY_IDR') {
    return `Rp ${num.toLocaleString('id-ID')}`;
  }
  if (format === 'CURRENCY_USD') {
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === 'PERCENT') {
    return `${num.toLocaleString('id-ID')}%`;
  }
  return num.toLocaleString('id-ID');
}

export function applyStyleToTextRuns(
  plainText: string,
  existingRuns: DocTextRun[] | undefined,
  startOffset: number,
  endOffset: number,
  stylePatch: RunStylePatch
): DocTextRun[] {
  const tempBlock: DocBlock = {
    id: 'temp-run-block',
    type: 'paragraph',
    content: plainText,
    runs: existingRuns,
  };
  const res = applyFormattingToTextRange(tempBlock, startOffset, endOffset, stylePatch);
  return res.runs;
}

export function clearTextRunsFormatting(plainText: string): DocTextRun[] {
  if (!plainText) return [];
  return [
    {
      id: nextRunId(),
      text: plainText,
    },
  ];
}

export function generateDocxXmlBuffer(
  title: string,
  docNumber: string,
  blocks: DocBlock[],
  meta?: { department?: string; targetDepartment?: string; layoutPreset?: LayoutPreset }
): { buffer: Uint8Array; contentHash: string; size: number } {
  const res = generateDocxBinaryBuffer({
    id: docNumber,
    document_code: docNumber,
    title,
    department: meta?.department,
    layout_preset: meta?.layoutPreset,
    blocks,
  });
  return {
    buffer: res.buffer,
    contentHash: res.sha256,
    size: res.size,
  };
}

export function parseDocxPackageToBlocks(buffer: Uint8Array): {
  blocks: DocBlock[];
  contentHash: string;
} {
  const extracted = extractBlocksFromDocxBuffer(buffer) || [];
  return {
    blocks: extracted,
    contentHash: computeSha256Hex(buffer),
  };
}

export function verifySignedDocumentToken(
  token: string | undefined | null,
  expectedDocId: string,
  allowedPurposes?: string[]
): { valid: boolean; reason?: string; payload?: SignedDocTokenPayload } {
  const mappedPurposes = allowedPurposes?.map((p) => {
    if (p === 'FILE_DOWNLOAD') return 'file';
    if (p === 'CALLBACK_SAVE') return 'callback';
    if (p === 'PDF_EXPORT') return 'pdf';
    if (p === 'EDITOR_SESSION') return 'session';
    return p as 'file' | 'callback' | 'session' | 'pdf';
  });
  // Allow 'file' token to also be checked against FILE_DOWNLOAD/PDF_EXPORT in tests
  const check = verifyDocumentAccessToken(token, expectedDocId);
  if (!check.valid) return check;
  if (
    mappedPurposes &&
    mappedPurposes.length > 0 &&
    check.payload &&
    !mappedPurposes.includes(check.payload.purpose)
  ) {
    return { valid: false, reason: `Token purpose '${check.payload.purpose}' not permitted` };
  }
  return check;
}

