/**
 * Engine untuk pemrosesan Dokumen DOCX dan Evaluasi Formula Tabel V2
 * Termasuk dukungan formula Word/Excel: =SUM(ABOVE), =AVERAGE(ABOVE), =COUNT(ABOVE)
 * Serta helper konfigurasi sesi OnlyOffice Document Server
 */

import { DocBlock, DocTableData, OnlyOfficeEditorSession } from '../types/workspace.ts';

/**
 * Mengevaluasi formula tabel seperti =SUM(ABOVE), =AVERAGE(ABOVE), =COUNT(ABOVE)
 */
export function evaluateTableFormula(
  formula: string,
  rowIndex: number,
  colIndex: number,
  tableData: DocTableData
): string {
  if (!formula || !formula.startsWith('=')) {
    return formula;
  }

  const cleanFormula = formula.trim().toUpperCase();
  const rows = tableData.rows || [];

  // Ambil angka dari sel-sel di atasnya dalam kolom yang sama
  const aboveValues: number[] = [];
  for (let r = 0; r < rowIndex; r++) {
    const valStr = rows[r]?.[colIndex] || '0';
    // Hilangkan pemisah ribuan atau simbol mata uang
    const cleanNumStr = valStr.replace(/[^0-9.-]+/g, '');
    const num = parseFloat(cleanNumStr);
    if (!isNaN(num)) {
      aboveValues.push(num);
    }
  }

  // Ambil angka dari sel-sel di sebelah kiri dalam baris yang sama
  const leftValues: number[] = [];
  for (let c = 0; c < colIndex; c++) {
    const valStr = rows[rowIndex]?.[c] || '0';
    const cleanNumStr = valStr.replace(/[^0-9.-]+/g, '');
    const num = parseFloat(cleanNumStr);
    if (!isNaN(num)) {
      leftValues.push(num);
    }
  }

  if (cleanFormula === '=SUM(ABOVE)') {
    const sum = aboveValues.reduce((acc, curr) => acc + curr, 0);
    return sum.toLocaleString('id-ID');
  }

  if (cleanFormula === '=AVERAGE(ABOVE)') {
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

  return formula;
}

/**
 * Membuat payload konfigurasi sesi OnlyOffice Document Server
 */
export function createOnlyOfficeSession(params: {
  documentId: string;
  documentTitle: string;
  documentCode: string;
  user: { id: string; name: string; role: string };
  isApprovedOrLocked: boolean;
  serverUrl?: string;
}): OnlyOfficeEditorSession {
  const { documentId, documentTitle, documentCode, user, isApprovedOrLocked, serverUrl = '' } = params;
  const isViewOnly = isApprovedOrLocked;

  // Key dokumen unik per revisi / update
  const documentKey = `${documentId}_${documentCode}_${Date.now()}`;

  return {
    documentId,
    documentKey,
    documentTitle: `${documentTitle}.docx`,
    fileUrl: `${serverUrl}/api/workspace-documents/${documentId}/file`,
    callbackUrl: `${serverUrl}/api/workspace-documents/${documentId}/callback`,
    mode: isViewOnly ? 'view' : 'edit',
    token: 'jwt-session-token-placeholder',
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

/**
 * Export blocks to formatted text / XML preview helper
 */
export function convertBlocksToSummaryHtml(blocks: DocBlock[]): string {
  if (!blocks || !Array.isArray(blocks)) return '';
  return blocks
    .map((b) => {
      if (b.type === 'heading' || b.type === 'HEADER') {
        return `<h${b.headingLevel || 2}>${b.content || b.title || ''}</h${b.headingLevel || 2}>`;
      }
      if (b.type === 'paragraph' || b.type === 'TEXT') {
        return `<p>${b.content || ''}</p>`;
      }
      if (b.type === 'callout' || b.type === 'CALLOUT') {
        return `<div class="callout">${b.content || ''}</div>`;
      }
      return '';
    })
    .join('\n');
}
