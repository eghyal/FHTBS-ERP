import React from 'react';
import {
  FileText,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  Hash,
  Calendar,
  Building,
  User,
  MapPin,
  Phone,
  Mail,
} from 'lucide-react';
import { DocBlock, DocTableData } from '../../../types/workspace.ts';
import { evaluateTableFormula } from '../../../services/docxEngine.ts';

interface SharedBlockRendererProps {
  block: DocBlock;
  isApprovalPreview?: boolean;
  tableDataOverride?: DocTableData;
}

export const SharedBlockRenderer: React.FC<SharedBlockRendererProps> = ({
  block,
  isApprovalPreview = false,
  tableDataOverride,
}) => {
  const type = block.type;

  // 1. OFFICIAL LETTERHEAD
  if (type === 'letterhead' || type === 'OFFICIAL_LETTERHEAD') {
    return (
      <div className="w-full pb-4 mb-4 border-b-2 border-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-black text-2xl shadow-sm">
              ERP
            </div>
            <div>
              <h1 className="text-xl font-bold uppercase tracking-wider text-slate-900 leading-tight">
                PT. NUSANTARA ERP INTEGRASI
              </h1>
              <p className="text-xs text-slate-600 font-medium">
                Industrial Manufacturing & Corporate Document Studio
              </p>
              <p className="text-[11px] text-slate-500">
                Kawasan Industri MM2100, Cikarang Barat, Bekasi 17530 | Tel: (021) 8990-1234
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-800 text-[11px] font-semibold tracking-wide border border-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              ISO 9001:2015 CERTIFIED
            </div>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-mono tracking-wider">
              OFFICIAL SYSTEM DOCUMENT
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. HEADING
  if (type === 'heading' || type === 'HEADER') {
    const level = block.headingLevel || 2;
    const text = block.content || block.title || '';
    const alignClass =
      block.align === 'center' || block.alignment === 'center'
        ? 'text-center'
        : block.align === 'right' || block.alignment === 'right'
        ? 'text-right'
        : 'text-left';

    if (level === 1) {
      return (
        <h1 className={`text-2xl font-bold text-slate-900 mt-4 mb-2 tracking-tight ${alignClass}`}>
          {text}
        </h1>
      );
    }
    if (level === 2) {
      return (
        <h2 className={`text-lg font-bold text-slate-800 mt-3 mb-1.5 ${alignClass}`}>
          {text}
        </h2>
      );
    }
    return (
      <h3 className={`text-base font-semibold text-slate-800 mt-2 mb-1 ${alignClass}`}>
        {text}
      </h3>
    );
  }

  // 3. PARAGRAPH & TEXT
  if (type === 'paragraph' || type === 'TEXT') {
    const alignClass =
      block.align === 'center' || block.alignment === 'center'
        ? 'text-center'
        : block.align === 'right' || block.alignment === 'right'
        ? 'text-right'
        : block.align === 'justify' || block.alignment === 'justify'
        ? 'text-justify'
        : 'text-left';

    // Jika memiliki Runs (Word-like Rich Text character formatting)
    if (block.runs && block.runs.length > 0) {
      return (
        <p className={`text-sm text-slate-700 leading-relaxed my-2 ${alignClass}`}>
          {block.runs.map((run) => {
            let className = '';
            if (run.bold) className += ' font-bold';
            if (run.italic) className += ' italic';
            if (run.underline) className += ' underline';
            if (run.strikethrough) className += ' line-through';
            return (
              <span key={run.id} className={className} style={{ color: run.color }}>
                {run.text}
              </span>
            );
          })}
        </p>
      );
    }

    return (
      <p className={`text-sm text-slate-700 leading-relaxed my-2 ${alignClass}`}>
        {block.content || ''}
      </p>
    );
  }

  // 4. CALLOUT
  if (type === 'callout' || type === 'CALLOUT') {
    return (
      <div className="my-3 p-3.5 rounded-lg border border-amber-200 bg-amber-50/70 text-amber-900 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed font-medium">
          {block.title && <div className="font-bold mb-0.5 text-amber-950">{block.title}</div>}
          {block.content || ''}
        </div>
      </div>
    );
  }

  // 5. LIST & LIST_POINTS
  if (type === 'list' || type === 'LIST_POINTS') {
    const items = block.listItems || (block.content ? block.content.split('\n') : []);
    const isNumbered = block.listStyle === 'NUMBERED';

    if (isNumbered) {
      return (
        <ol className="list-decimal list-inside my-2 space-y-1 text-sm text-slate-700">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ol>
      );
    }

    return (
      <ul className="list-disc list-inside my-2 space-y-1 text-sm text-slate-700">
        {items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    );
  }

  // 6. TABLE
  if (type === 'table' || type === 'TABLE') {
    const tableData = tableDataOverride || block.tableData;
    if (!tableData || !tableData.headers) {
      return <div className="text-xs text-slate-400 italic py-2">Tabel Kosong</div>;
    }

    const { headers, rows, zebraStriping = true } = tableData;

    return (
      <div className="my-3 overflow-x-auto rounded border border-slate-300">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-300">
              {headers.map((h, i) => (
                <th key={i} className="py-2 px-3 border-r border-slate-200 last:border-r-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const rowBg = zebraStriping && rIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white';
              return (
                <tr key={rIdx} className={`border-b border-slate-200 last:border-b-0 ${rowBg}`}>
                  {row.map((cell, cIdx) => {
                    const isFormula = cell?.toString().startsWith('=');
                    const displayVal = isFormula
                      ? evaluateTableFormula(cell, rIdx, cIdx, tableData)
                      : cell;

                    return (
                      <td
                        key={cIdx}
                        className={`py-2 px-3 border-r border-slate-200 last:border-r-0 ${
                          isFormula ? 'font-semibold text-slate-900 bg-emerald-50/40' : 'text-slate-700'
                        }`}
                      >
                        {displayVal}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // 7. METADATA & METADATA_GRID
  if (type === 'metadata' || type === 'METADATA_GRID') {
    const meta = block.metaData || {};
    const items = meta.items || [
      { label: 'Nomor Dokumen', value: meta.docNumber || 'DOC-AUTO-GEN' },
      { label: 'Tanggal Dokumen', value: meta.docDate || new Date().toISOString().split('T')[0] },
      { label: 'Perihal / Subjek', value: meta.subject || block.title || 'Dokumen Resmi ERP' },
      { label: 'Klasifikasi', value: meta.classification || 'INTERNAL' },
    ];

    return (
      <div className="my-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {items.map((item, idx) => (
            <div key={idx} className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                {item.label}
              </span>
              <p className="font-semibold text-slate-800 truncate">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 8. ADDRESS BLOCKS
  if (
    type === 'address' ||
    type === 'SENDER_ADDRESS' ||
    type === 'RECIPIENT_ADDRESS' ||
    type === 'PROJECT_SITE_ADDRESS'
  ) {
    const addr = block.addressData || {};
    const isRecipient = type === 'RECIPIENT_ADDRESS' || addr.attentionTo;

    return (
      <div className="my-3 p-3 rounded-md bg-slate-50/60 border border-slate-200 text-xs leading-relaxed text-slate-700 max-w-sm">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
          {isRecipient ? 'Kepada Yth:' : 'Alamat Pengirim / Divisi:'}
        </div>
        {addr.attentionTo && (
          <p className="font-bold text-slate-900">U.p.: {addr.attentionTo}</p>
        )}
        {addr.companyName && <p className="font-semibold text-slate-800">{addr.companyName}</p>}
        {addr.division && <p className="text-slate-600">{addr.division}</p>}
        {addr.streetAddress && <p>{addr.streetAddress}</p>}
        {addr.cityPostal && <p>{addr.cityPostal}</p>}
        {addr.cityStateZip && <p>{addr.cityStateZip}</p>}
        {addr.phone && <p className="text-[11px] text-slate-500">Telp: {addr.phone}</p>}
      </div>
    );
  }

  // 9. SIGNATURES & APPROVAL COLUMNS
  if (
    type === 'signature' ||
    type === 'SIGNATURE_COLUMN' ||
    type === 'SIGNATURE_STAMP' ||
    type === 'DUAL_SIGNATURE'
  ) {
    const signatoryName = block.signatoryName || block.title || 'Pejabat Berwenang';
    const signatoryRole = block.signatoryTitle || block.targetRole || 'Authorized Signatory';
    const dept = block.targetDepartment || 'CORPORATE';

    return (
      <div className="my-6 pt-4 border-t border-slate-200">
        <div className="flex justify-between items-end gap-6">
          <div className="text-center w-52 p-3 rounded-lg border border-slate-200 bg-white shadow-xs">
            <p className="text-[11px] font-medium text-slate-500 mb-8">
              Disiapkan Oleh ({dept}):
            </p>
            <div className="border-b border-slate-400 w-36 mx-auto mb-1"></div>
            <p className="text-xs font-bold text-slate-800">{signatoryName}</p>
            <p className="text-[10px] text-slate-500 uppercase">{signatoryRole}</p>
          </div>

          <div className="text-center w-52 p-3 rounded-lg border border-emerald-300 bg-emerald-50/30 shadow-xs relative">
            <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              VERIFIED
            </div>
            <p className="text-[11px] font-medium text-slate-600 mb-8">
              Disetujui Oleh (Otoritas):
            </p>
            <div className="border-b border-emerald-500 w-36 mx-auto mb-1"></div>
            <p className="text-xs font-bold text-emerald-950">Manager / Kepala Departemen</p>
            <p className="text-[10px] text-emerald-700 uppercase">
              Elektronik Signature & Timestamp
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 10. DIVIDER
  if (type === 'divider' || type === 'DIVIDER') {
    return <hr className="my-4 border-t border-slate-300" />;
  }

  return (
    <div className="text-xs text-slate-500 italic py-1">
      {block.content || `[${block.type} Block]`}
    </div>
  );
};
