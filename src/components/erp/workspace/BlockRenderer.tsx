import React, { forwardRef } from "react";
import {
  CheckCircle2,
  CheckSquare,
  AlertTriangle,
  Image as ImageIcon,
  Lock,
  Landmark,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import {
  DocBlock,
  DocTableData,
  LayoutPreset,
  WorkspaceStatus,
  WorkspaceSignerStep,
} from "../../../types/workspace.ts";
import {
  evaluateTableFormula,
  formatCellValue,
  normalizeHorizontalAlign,
  normalizeVerticalAlign,
} from "../../../services/docxEngine.ts";
import {
  DEPARTMENT_ROUTING_CONFIG,
  getPaperDimensions,
  extractTierFromRole,
  cleanBoldMarkdown,
} from "./studio/config.ts";

/** Normalize metadata items from both Studio `{ key, value }[]` and legacy `{ label, value }[]` */
export function normalizeMetadataRows(
  block: DocBlock,
  documentCode?: string | null
): Array<{ key: string; value: string }> {
  if (Array.isArray(block.metaData) && block.metaData.length > 0) {
    return block.metaData.map((m: any) => ({
      key: String(m?.key ?? m?.label ?? ""),
      value: String(m?.value ?? ""),
    }));
  }
  if (Array.isArray(block.metadataRows) && block.metadataRows.length > 0) {
    return block.metadataRows.map((m: any) => ({
      key: String(m?.label ?? m?.key ?? ""),
      value: String(m?.value ?? ""),
    }));
  }
  const metaObj = block.metaData as any;
  if (metaObj && Array.isArray(metaObj.items) && metaObj.items.length > 0) {
    return metaObj.items.map((m: any) => ({
      key: String(m?.label ?? m?.key ?? ""),
      value: String(m?.value ?? ""),
    }));
  }
  if (metaObj && typeof metaObj === "object" && !Array.isArray(metaObj)) {
    return [
      { key: "Doc Number", value: metaObj.docNumber || documentCode || "DOC-AUTO-GEN" },
      { key: "Issued Date", value: metaObj.docDate || new Date().toISOString().split("T")[0] },
      { key: "Subject", value: metaObj.subject || block.title || "Official ERP Document" },
      { key: "Classification", value: metaObj.classification || "INTERNAL CONTROLLED" },
    ];
  }
  return [];
}

export interface SharedBlockRendererProps {
  block: DocBlock;
  isApprovalPreview?: boolean;
  tableDataOverride?: DocTableData;
  documentStatus?: WorkspaceStatus | string;
  approvedByName?: string;
  approvedAt?: string;
  documentCode?: string | null;
  documentId?: string | null;
  docType?: string;
  department?: string;
  createdByName?: string;
}

export const SharedBlockRenderer: React.FC<SharedBlockRendererProps> = ({
  block,
  tableDataOverride,
  documentStatus = "DRAFT",
  approvedByName,
  approvedAt,
  documentCode,
  documentId,
  docType,
  department = "General",
  createdByName,
}) => {
  const type = block.type;
  const isApproved = documentStatus === "APPROVED";
  const effectiveDocRef =
    documentCode || documentId || `DOC/ERP/${new Date().getFullYear()}`;

  const defaultAlign =
    type === "HEADER" || type === "heading"
      ? "CENTER"
      : type === "SIGNATURE_COLUMN" || type === "SIGNATURE_STAMP"
      ? "RIGHT"
      : "LEFT";
  const normAlign = normalizeHorizontalAlign(block.alignment || block.align, defaultAlign);
  const normVAlign = normalizeVerticalAlign(block.verticalAlignment || block.verticalAlign, "TOP");

  const alignClass =
    normAlign === "CENTER"
      ? "text-center"
      : normAlign === "RIGHT"
      ? "text-right"
      : normAlign === "JUSTIFY"
      ? "text-justify"
      : "text-left";

  const vJustifyClass =
    normVAlign === "MIDDLE"
      ? "justify-center"
      : normVAlign === "BOTTOM"
      ? "justify-end"
      : "justify-start";

  const flexRowJustifyClass =
    normAlign === "CENTER"
      ? "justify-center"
      : normAlign === "RIGHT"
      ? "justify-end"
      : "justify-start";

  const blockTextStyle: React.CSSProperties = {
    fontSize: block.fontSize ? `${block.fontSize}px` : undefined,
    fontWeight: block.isBold || block.fontWeight === "bold" ? 700 : undefined,
    fontStyle: block.isItalic || block.italic ? "italic" : undefined,
    textDecoration:
      (block.isUnderline || block.underline) && (block.isStrikethrough || block.strikethrough)
        ? "underline line-through"
        : block.isUnderline || block.underline
        ? "underline"
        : block.isStrikethrough || block.strikethrough
        ? "line-through"
        : undefined,
    color: block.textColor || undefined,
    backgroundColor: block.highlightColor || undefined,
  };

  /* --- 1. OFFICIAL LETTERHEAD (Exact 1:1 match to Studio & PrintTemplate.tsx) --- */
  if (type === "letterhead" || type === "OFFICIAL_LETTERHEAD") {
    const companyName = block.companyName || block.title || "CV. BATU EMAS GROUP";
    const streetAddress =
      block.addressLine ||
      block.addressData?.streetAddress ||
      "Dusun Petahunan, Jajag, Gambiran, Banyuwangi Regency, East Java 68486";
    const phone = block.addressData?.phone || "0811-1111-3993";
    const email = block.addressData?.email || "pavingjoss@gmail.com";

    return (
      <div className="w-full border-b-[2.5px] border-black pb-3 mb-2 bg-white relative z-10 flex items-center gap-4 shrink-0 select-none">
        <div className="w-13 h-13 shrink-0 flex items-center justify-center">
          <img
            src={block.logoUrl || "/logo.png"}
            alt="Logo"
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-black tracking-tight uppercase leading-none mb-1 text-base sm:text-lg">
            {companyName}
          </h1>
          <div className="font-semibold text-stone-700 leading-normal text-[10.5px]">
            {streetAddress}
            <br />
            <span className="font-bold text-black">Phone:</span> {phone} &nbsp;|&nbsp;{" "}
            <span className="font-bold text-black">Email:</span> {email}
          </div>
        </div>
        <div className="flex items-center gap-3 text-right shrink-0">
          <div className="flex flex-col items-end">
            <div className="font-bold tracking-widest uppercase mb-0.5 text-[9px] text-stone-500">
              {isApproved ? "Valid Doc ID:" : "Doc Ref ID:"}
            </div>
            <div className="font-mono font-bold text-black border border-stone-300 px-2 py-0.5 bg-stone-50 rounded-xs text-[10px]">
              {effectiveDocRef}
            </div>
          </div>
          {isApproved ? (
            <div className="w-11 h-11 bg-white border border-stone-300 p-0.5 flex items-center justify-center shrink-0 rounded-xs shadow-2xs">
              <QRCodeSVG
                value={`https://fhtbs-erp.shared/doc/${effectiveDocRef}`}
                size={38}
                level="M"
                fgColor="#000000"
              />
            </div>
          ) : (
            <div className="h-11 px-2.5 bg-stone-50 border border-dashed border-stone-300 flex flex-col items-center justify-center shrink-0 rounded-xs">
              <span className="text-[7.5px] font-black uppercase tracking-wider text-stone-500 leading-none mb-0.5">
                PENDING
              </span>
              <span className="text-[7px] font-bold uppercase tracking-wider text-stone-400 leading-none">
                AUTH
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* --- 2. ADDRESS BLOCKS (Exact 1:1 match to Studio Canvas) --- */
  if (
    type === "address" ||
    type === "SENDER_ADDRESS" ||
    type === "RECIPIENT_ADDRESS" ||
    type === "PROJECT_SITE_ADDRESS"
  ) {
    const palette =
      type === "RECIPIENT_ADDRESS"
        ? "bg-blue-50/50 border-blue-200/80"
        : type === "PROJECT_SITE_ADDRESS"
        ? "bg-emerald-50/50 border-emerald-200/80"
        : "bg-stone-50 border-stone-200";
    const labelColor =
      type === "RECIPIENT_ADDRESS"
        ? "text-blue-600"
        : type === "PROJECT_SITE_ADDRESS"
        ? "text-emerald-700"
        : "text-stone-400";
    const a = block.addressData || {};
    const labelText =
      block.title ||
      a.label ||
      (type === "PROJECT_SITE_ADDRESS"
        ? "PROJECT JOB SITE LOCATION"
        : type === "RECIPIENT_ADDRESS"
        ? "RECIPIENT / PARTNER (TO)"
        : "SENDER ADDRESS (FROM)");

    return (
      <div
        className={cn(
          "border rounded-xl p-3.5 space-y-1 text-xs w-full h-full min-h-full flex flex-col",
          vJustifyClass,
          alignClass,
          palette
        )}
      >
        {labelText && (
          <span className={cn("block w-full text-[10px] font-black uppercase tracking-wider", labelColor, alignClass)}>
            {cleanBoldMarkdown(labelText)}
          </span>
        )}
        {(a.companyName || a.entityName || a.attentionTo) && (
          <span className={cn("block w-full font-bold text-stone-900 text-sm", alignClass)}>
            {cleanBoldMarkdown(a.companyName || a.entityName || a.attentionTo || "")}
          </span>
        )}
        {(a.division || a.siteLocation) && (
          <span className={cn("block w-full text-stone-700 font-medium", alignClass)}>
            {cleanBoldMarkdown(a.division || a.siteLocation || "")}
          </span>
        )}
        {a.streetAddress && (
          <span className={cn("block w-full text-stone-600 text-[11px]", alignClass)}>
            {cleanBoldMarkdown(a.streetAddress)}
          </span>
        )}
        {(a.cityPostal || a.cityStateZip) && (
          <span className={cn("block w-full text-stone-600 text-[11px]", alignClass)}>
            {cleanBoldMarkdown(a.cityPostal || a.cityStateZip || "")}
          </span>
        )}
        {(a.contactPerson || a.phone || a.email || a.siteCoordinates) && (
          <div
            className={cn(
              "flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500 font-mono",
              flexRowJustifyClass
            )}
          >
            {a.contactPerson && (
              <span className={cn("flex-1 min-w-40", alignClass)}>
                {cleanBoldMarkdown(a.contactPerson)}
              </span>
            )}
            {a.phone && (
              <span className={cn("w-44", alignClass)}>
                {cleanBoldMarkdown(a.phone)}
              </span>
            )}
            {a.email && <span className={alignClass}>{cleanBoldMarkdown(a.email)}</span>}
            {a.siteCoordinates && (
              <span className={cn("font-bold text-stone-700", alignClass)}>
                {cleanBoldMarkdown(a.siteCoordinates)}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  /* --- 3. HEADER / HEADING (Exact 1:1 match to Studio Canvas) --- */
  if (type === "heading" || type === "HEADER") {
    const titleText = cleanBoldMarkdown(block.title || (!block.title ? block.content || "" : ""));
    const subText = cleanBoldMarkdown(
      block.title && block.content ? block.content : block.subtitle || ""
    );

    return (
      <div
        className={cn(
          "space-y-1 py-2 w-full h-full min-h-full flex flex-col",
          vJustifyClass,
          alignClass
        )}
        style={blockTextStyle}
      >
        <span
          style={{ fontSize: block.fontSize ? `${block.fontSize}px` : undefined }}
          className={cn(
            "block w-full text-lg font-black tracking-tight text-stone-950 uppercase",
            alignClass
          )}
        >
          {titleText}
        </span>
        {subText && (
          <span
            className={cn(
              "block w-full text-xs font-bold text-stone-500 font-mono tracking-wider",
              alignClass
            )}
          >
            {subText}
          </span>
        )}
      </div>
    );
  }

  /* --- 4. PARAGRAPH & TEXT (Exact 1:1 match to Studio Canvas) --- */
  if (type === "paragraph" || type === "TEXT") {
    const isBoldText = block.isBold || block.fontWeight === "bold";

    if (block.runs && block.runs.length > 0) {
      return (
        <div
          className={cn(
            "w-full h-full min-h-full flex flex-col flex-1",
            vJustifyClass,
            alignClass
          )}
        >
          {block.title && (
            <div className={cn("text-xs font-bold text-stone-900 uppercase tracking-wider mb-1", alignClass)}>
              {cleanBoldMarkdown(block.title)}
            </div>
          )}
          <div
            style={blockTextStyle}
            className={cn(
              "whitespace-pre-line w-full text-xs text-stone-800 leading-relaxed",
              alignClass,
              isBoldText ? "font-bold text-stone-950" : "font-normal"
            )}
          >
            {block.runs.map((run) => {
              const runStyle: React.CSSProperties = {
                fontSize: run.fontSize ? `${run.fontSize}px` : undefined,
                fontWeight: run.bold ? 700 : undefined,
                fontStyle: run.italic ? "italic" : undefined,
                textDecoration:
                  run.underline && run.strikethrough
                    ? "underline line-through"
                    : run.underline
                    ? "underline"
                    : run.strikethrough
                    ? "line-through"
                    : undefined,
                color: run.color || undefined,
                backgroundColor: run.highlight || undefined,
              };
              return (
                <span key={run.id} style={runStyle}>
                  {cleanBoldMarkdown(run.text)}
                </span>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "w-full h-full min-h-full flex flex-col flex-1",
          vJustifyClass,
          alignClass
        )}
      >
        {block.title && (
          <div className={cn("text-xs font-bold text-stone-900 uppercase tracking-wider mb-1", alignClass)}>
            {cleanBoldMarkdown(block.title)}
          </div>
        )}
        <div
          style={blockTextStyle}
          className={cn(
            "whitespace-pre-line w-full text-xs text-stone-800 leading-relaxed",
            alignClass,
            isBoldText ? "font-bold text-stone-950" : "font-normal"
          )}
        >
          {cleanBoldMarkdown(block.content || "")}
        </div>
      </div>
    );
  }

  /* --- 5. CALLOUT (Exact 1:1 match to Studio Canvas) --- */
  if (type === "callout" || type === "CALLOUT") {
    const styleVariant = block.style || block.calloutTone || "INFO";
    return (
      <div
        className={cn(
          "p-4 rounded-xl border space-y-1 text-xs w-full h-full min-h-full flex flex-col",
          vJustifyClass,
          alignClass,
          styleVariant === "WARNING"
            ? "bg-amber-50/80 border-amber-300"
            : styleVariant === "SUCCESS"
            ? "bg-emerald-50/80 border-emerald-300"
            : styleVariant === "DANGER"
            ? "bg-rose-50/80 border-rose-300"
            : "bg-blue-50/80 border-blue-300"
        )}
      >
        <div
          className={cn(
            "font-bold flex items-center gap-1.5 uppercase text-[11px] tracking-wide shrink-0",
            flexRowJustifyClass
          )}
        >
          <AlertTriangle
            className={cn(
              "w-3.5 h-3.5 shrink-0",
              styleVariant === "WARNING"
                ? "text-amber-600"
                : styleVariant === "SUCCESS"
                ? "text-emerald-600"
                : styleVariant === "DANGER"
                ? "text-rose-600"
                : "text-blue-600"
            )}
          />
          {block.title && (
            <span className={cn("block w-full uppercase", alignClass)}>
              {cleanBoldMarkdown(block.title)}
            </span>
          )}
        </div>
        <div
          style={blockTextStyle}
          className={cn(
            "whitespace-pre-line leading-relaxed text-stone-800 w-full",
            alignClass,
            block.isBold ? "font-bold" : "font-medium"
          )}
        >
          {cleanBoldMarkdown(block.content || "")}
        </div>
      </div>
    );
  }

  /* --- 6. LIST_POINTS & CHECKLIST (Exact 1:1 match to Studio Canvas) --- */
  if (type === "list" || type === "LIST_POINTS" || type === "CHECKLIST") {
    const items =
      block.listItems && block.listItems.length > 0
        ? block.listItems
        : block.content
        ? block.content.split("\n").filter((line) => line.trim() !== "")
        : [];
    const isChecklist = block.listStyle === "CHECKLIST" || type === "CHECKLIST";
    const isBullet = !isChecklist && block.listStyle === "BULLET";

    return (
      <div
        className={cn(
          "space-y-1.5 text-xs text-stone-800 w-full h-full min-h-full flex flex-col",
          vJustifyClass,
          alignClass
        )}
        style={blockTextStyle}
      >
        {block.title && (
          <span className={cn("block w-full font-bold text-stone-900", alignClass)}>
            {cleanBoldMarkdown(block.title)}
          </span>
        )}
        <ol className="space-y-1">
          {items.map((item, liIdx) => (
            <li key={liIdx} className={cn("flex items-start gap-2", flexRowJustifyClass)}>
              {isChecklist ? (
                <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              ) : isBullet ? (
                <span className="text-stone-400 font-bold shrink-0 w-5 text-center select-none">•</span>
              ) : (
                <span className="text-stone-400 font-bold shrink-0 w-5 text-right select-none">
                  {liIdx + 1}.
                </span>
              )}
              <span className={cn("flex-1 leading-relaxed", alignClass)}>
                {cleanBoldMarkdown(item)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  /* --- 7. TABLE (Exact 1:1 match to Studio Canvas with colWidths, rowHeights & Formulas) --- */
  if (type === "table" || type === "TABLE") {
    const td = tableDataOverride || block.tableData || { headers: [], rows: [] };
    const headers = td.headers || block.tableHeaders || [];
    const rows = td.rows || block.tableRows || [];
    const colWidths = td.colWidths || [];
    const rowHeights = td.rowHeights || [];
    const colAligns = td.columnAlignments || block.columnAlignments || [];
    const cellFormats = td.cellFormats || block.cellFormats || {};

    const vAlignClass =
      normVAlign === "TOP"
        ? "align-top"
        : normVAlign === "BOTTOM"
        ? "align-bottom"
        : "align-middle";

    const getColumnAlignClass = (cIdx: number) => {
      const ca = colAligns[cIdx];
      if (ca === "center") return "text-center";
      if (ca === "right") return "text-right";
      if (ca === "left") return "text-left";
      return alignClass;
    };

    const effectiveTableData: DocTableData = {
      headers,
      rows,
      colWidths,
      rowHeights,
      columnAlignments: colAligns,
      cellFormats,
    };

    return (
      <div className="space-y-1.5 text-xs w-full">
        {block.title && (
          <span className={cn("block w-full font-bold text-stone-900", alignClass)}>
            {cleanBoldMarkdown(block.title)}
          </span>
        )}
        <div className="overflow-x-auto border border-stone-200 rounded-xl relative">
          <table className="w-full text-left border-collapse table-fixed">
            {headers.length > 0 && (
              <thead>
                <tr className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200">
                  {headers.map((h, hIdx) => {
                    const colW = colWidths[hIdx];
                    const colAlignCls = getColumnAlignClass(hIdx);
                    return (
                      <th
                        key={hIdx}
                        style={colW ? { width: `${colW}px` } : undefined}
                        className={cn(
                          "p-1 relative border-r border-stone-200/80 last:border-r-0",
                          vAlignClass,
                          colAlignCls
                        )}
                      >
                        <span className={cn("block font-bold text-stone-700 px-1.5 py-1", colAlignCls)}>
                          {cleanBoldMarkdown(h)}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.map((row, rIdx) => {
                const rowH = rowHeights[rIdx] || 36;
                return (
                  <tr
                    key={rIdx}
                    style={{ height: `${rowH}px` }}
                    className="border-b border-stone-100 last:border-b-0"
                  >
                    {row.map((cell, cIdx) => {
                      const colW = colWidths[cIdx];
                      const rawStr = cell?.toString() || "";
                      const isFormula = rawStr.trim().startsWith("=");
                      const cellFormat = cellFormats[`${rIdx}-${cIdx}`];
                      const evaluatedVal = isFormula
                        ? evaluateTableFormula(rawStr, rIdx, cIdx, effectiveTableData)
                        : formatCellValue(rawStr, cellFormat);
                      const colAlignCls = getColumnAlignClass(cIdx);

                      return (
                        <td
                          key={cIdx}
                          style={colW ? { width: `${colW}px` } : undefined}
                          className={cn(
                            "p-1 relative border-r border-stone-100 last:border-r-0",
                            isFormula && "bg-stone-50/90",
                            vAlignClass,
                            colAlignCls
                          )}
                        >
                          <div className="flex items-center gap-1">
                            {isFormula && (
                              <span
                                className="px-1 py-0.2 rounded bg-stone-200/80 text-stone-700 font-mono text-[9px] font-black shrink-0"
                                title={rawStr}
                              >
                                fx
                              </span>
                            )}
                            <span
                              className={cn(
                                "block w-full text-stone-800 px-1.5 py-1",
                                colAlignCls,
                                isFormula && "font-bold text-stone-950 font-mono"
                              )}
                            >
                              {cleanBoldMarkdown(evaluatedVal)}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* --- 8. METADATA GRID (Exact 1:1 match to Studio Canvas) --- */
  if (type === "metadata" || type === "METADATA_GRID") {
    const metaItems = normalizeMetadataRows(block, effectiveDocRef);
    return (
      <div className="space-y-2 w-full">
        {block.title && (
          <span className={cn("block w-full font-bold text-stone-900 text-xs", alignClass)}>
            {cleanBoldMarkdown(block.title)}
          </span>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {metaItems.map((m, mIdx) => (
            <div
              key={mIdx}
              className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl flex items-center gap-2"
            >
              <span className="font-bold text-stone-600 w-28 shrink-0 truncate">
                {cleanBoldMarkdown(m.key)}
              </span>
              <span className="font-mono font-bold text-stone-900 flex-1 text-right wrap-break-word">
                {cleanBoldMarkdown(m.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* --- 9 & 10. SIGNATURE COLUMN / STAMP & DUAL SIGNATURE (Exact 1:1 match to Studio & ERP Print Standard) --- */
  if (
    type === "signature" ||
    type === "SIGNATURE_COLUMN" ||
    type === "SIGNATURE_STAMP" ||
    type === "DUAL_SIGNATURE"
  ) {
    const targetDeptKey = block.targetDepartment || "HR";
    const deptCfg =
      DEPARTMENT_ROUTING_CONFIG[targetDeptKey] || DEPARTMENT_ROUTING_CONFIG.HR;
    const roleTier = extractTierFromRole(block.targetRole, targetDeptKey);
    const approverDisplay = cleanBoldMarkdown(
      block.signatoryName ||
        (isApproved && approvedByName ? approvedByName : "") ||
        "( Officer Name )"
    );
    const approverTitleDisplay = cleanBoldMarkdown(
      block.signatoryTitle || deptCfg.signatoryTitleEn
    );

    if (type === "DUAL_SIGNATURE") {
      return (
        <div className="mt-6 pt-3 border-t border-stone-200 grid grid-cols-2 gap-8 text-center">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
              Prepared By
            </div>
            <div className="text-[10px] text-stone-500 uppercase font-bold mb-1">
              {department || "General"} Department
            </div>
            <div className="h-12 flex items-center justify-center my-1">
              <div className="flex items-center gap-2 border border-stone-200 bg-stone-50 px-3 py-1.5 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                <div className="text-left">
                  <div className="text-[9px] font-black text-stone-800 uppercase leading-none mb-0.5">
                    Originator Recorded
                  </div>
                  <div className="text-[8px] font-mono text-stone-500 leading-none">
                    {department || "General"} Dept
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-300 pt-1">
              {createdByName || `${department || "General"} Officer`}
            </div>
          </div>

          <div>
            <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
              Authorized By
            </div>
            <div className="text-[10px] text-stone-500 uppercase font-bold mb-1 text-center">
              {approverTitleDisplay}
            </div>
            <div className="h-12 flex items-center justify-center my-1">
              {isApproved ? (
                <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg shadow-2xs">
                  <QRCodeSVG
                    value={`https://fhtbs-erp.shared/auth/${effectiveDocRef}/${targetDeptKey}/${approverDisplay}`}
                    size={22}
                    fgColor="#059669"
                  />
                  <div className="text-left">
                    <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                      Authorized & Verified
                    </div>
                    <div className="text-[8px] font-mono text-emerald-700 leading-none">
                      {targetDeptKey} • {roleTier}
                      {approvedAt
                        ? ` • ${new Date(approvedAt).toLocaleDateString("en-GB")}`
                        : ""}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 border border-dashed border-stone-300 bg-stone-50/80 px-3 py-1.5 rounded-lg">
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <div className="text-left">
                    <div className="text-[9px] font-black text-stone-600 uppercase leading-none mb-0.5">
                      Awaiting Authorization
                    </div>
                    <div className="text-[8px] font-mono text-stone-500 leading-none">
                      Route: {targetDeptKey} • {roleTier}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-300 pt-1">
              {approverDisplay}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-6 pt-3 border-t border-stone-200">
        <div className={cn("flex", flexRowJustifyClass)}>
          <div className="w-64 text-center">
            <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
              Authorized By
            </div>
            <div className="text-[10px] text-stone-500 uppercase font-bold mb-1 text-center">
              {approverTitleDisplay}
            </div>
            <div className="h-12 flex items-center justify-center my-1">
              {isApproved ? (
                <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg shadow-2xs">
                  <QRCodeSVG
                    value={`https://fhtbs-erp.shared/auth/${effectiveDocRef}/${targetDeptKey}/${approverDisplay}`}
                    size={22}
                    fgColor="#059669"
                  />
                  <div className="text-left">
                    <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                      Authorized & Verified
                    </div>
                    <div className="text-[8px] font-mono text-emerald-700 leading-none">
                      {targetDeptKey} • {roleTier}
                      {approvedAt
                        ? ` • ${new Date(approvedAt).toLocaleDateString("en-GB")}`
                        : ""}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 border border-dashed border-stone-300 bg-stone-50/80 px-3 py-1.5 rounded-lg">
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <div className="text-left">
                    <div className="text-[9px] font-black text-stone-600 uppercase leading-none mb-0.5">
                      Awaiting Authorization
                    </div>
                    <div className="text-[8px] font-mono text-stone-500 leading-none">
                      Route: {targetDeptKey} • {roleTier}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-1 text-xs font-bold uppercase text-stone-900 border-t border-stone-300 pt-1">
              {approverDisplay}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* --- 11. ERP FOOTER TEMPLATES (Exact 1:1 match to Studio Canvas & PrintTemplate.tsx) --- */
  if (type === "FOOTER" || type === "FOOTER_BLOCK") {
    const variant = block.footerVariant || "ERP_STANDARD";
    const rawLeft = block.footerLeftText ?? block.title ?? "";
    const isDefaultVerificationText =
      !rawLeft ||
      rawLeft ===
        "This document has been digitally authorized and computationally verified within the CV. Batu Emas Group ERP Ecosystem." ||
      rawLeft ===
        "This document is computationally issued and validated. Valid without physical signature." ||
      rawLeft ===
        "This document has been digitally authorized and computationally verified. Legally valid with system verification.";

    const leftVal = isDefaultVerificationText
      ? isApproved
        ? "This document has been digitally authorized and computationally verified. Legally valid with system verification."
        : "This document is computationally issued and validated. Valid without physical signature."
      : rawLeft;

    const rawRight = block.footerRightText ?? block.content ?? "";
    const rightVal =
      !rawRight || rawRight === "OFFICIAL ERP SYSTEM DOCUMENT"
        ? docType
          ? docType.replace(/_/g, " ")
          : "OFFICIAL ERP DOCUMENT"
        : rawRight;
    const rightSubtitle = block.subtitle ?? "OFFICIAL WORKSPACE DOCUMENT";

    if (variant === "BANK_PAYMENT") {
      return (
        <div className="w-full pt-3 border-t-2 border-black z-20 bg-white shrink-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 text-[10px] text-stone-700">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="font-bold text-black uppercase tracking-wide flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-black shrink-0" />
                <span>OFFICIAL CORPORATE BANK ACCOUNT & PAYMENT INSTRUCTIONS</span>
              </div>
              <div className="font-bold text-black uppercase tracking-wide text-[10px]">
                {cleanBoldMarkdown(leftVal)}
              </div>
              <div className="text-[9px] text-stone-500 uppercase tracking-wide leading-tight">
                Official system registry reference: {effectiveDocRef}. Please include Document Reference on bank transfer receipt.
              </div>
            </div>
            <div className="text-right shrink-0 w-48">
              <div className="text-[10px] text-black block font-bold uppercase tracking-wide text-right">
                {cleanBoldMarkdown(rightVal)}
              </div>
              <div className="text-[9px] text-stone-500 block uppercase tracking-wide">
                FINANCE & TREASURY CONTROL
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (variant === "ISO_COMPLIANCE") {
      return (
        <div className="w-full pt-3 border-t-2 border-black z-20 bg-white shrink-0">
          <div className="grid grid-cols-3 gap-2 text-[10px] border border-stone-300 bg-stone-50 p-2.5">
            <div>
              <span className="text-stone-500 block uppercase text-[9px] tracking-wide">QUALITY STANDARD</span>
              <span className="font-bold text-black uppercase tracking-wide">ISO 9001:2015 QMS</span>
            </div>
            <div className="text-center border-x border-stone-300 px-2">
              <span className="text-stone-500 block uppercase text-[9px] tracking-wide">CONTROL STATUS</span>
              <span className="font-bold text-black uppercase tracking-wide text-center text-[10px] block">
                {cleanBoldMarkdown(leftVal)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-stone-500 block uppercase text-[9px] tracking-wide">DISTRIBUTION</span>
              <span className="font-bold text-black uppercase tracking-wide text-right text-[10px] block">
                {cleanBoldMarkdown(rightVal)}
              </span>
            </div>
          </div>
        </div>
      );
    }

    if (variant === "CONFIDENTIAL") {
      return (
        <div className="w-full pt-3 border-t-2 border-black z-20 bg-white shrink-0 flex items-center justify-between gap-4 text-[10px]">
          <div className="flex items-center gap-2 text-black flex-1 min-w-0">
            <Lock className="w-3.5 h-3.5 text-black shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-bold uppercase tracking-wide block text-black text-[10px] leading-tight mb-0.5">
                STRICTLY CONFIDENTIAL — INTERNAL CORPORATE USE ONLY
              </span>
              <span className="text-stone-500 uppercase tracking-wide text-[9px] block">
                {cleanBoldMarkdown(leftVal)}
              </span>
            </div>
          </div>
          <div className="text-right max-w-[30%] shrink-0 w-48">
            <span className="text-right font-bold text-black uppercase tracking-wide text-[10px] block">
              {cleanBoldMarkdown(rightVal)}
            </span>
            <span className="text-[9px] text-stone-500 block uppercase tracking-wide">
              Ref: {effectiveDocRef}
            </span>
          </div>
        </div>
      );
    }

    // Default: ERP_STANDARD (Exact 1:1 match with PrintTemplate.tsx & Studio Canvas)
    return (
      <div className="w-full pt-3 border-t-2 border-black z-20 bg-white shrink-0">
        <div className="flex justify-between items-end gap-4">
          <div className="max-w-[70%] flex-1 min-w-0">
            <div className="text-[10px] text-black font-bold uppercase tracking-wide leading-tight mb-1">
              {cleanBoldMarkdown(leftVal)}
            </div>
            <div className="text-[9px] text-stone-500 uppercase tracking-wide leading-tight">
              Official system registry reference: {effectiveDocRef}.
            </div>
          </div>
          <div className="text-right max-w-[30%] w-56 shrink-0">
            <span className="text-[10px] text-black block font-bold uppercase tracking-wide text-right">
              {cleanBoldMarkdown(rightVal)}
            </span>
            <span className="text-[9px] text-stone-500 block uppercase tracking-wide text-right">
              {cleanBoldMarkdown(rightSubtitle)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  /* --- 12. SECTION DIVIDER --- */
  if (type === "divider" || type === "DIVIDER") {
    return (
      <div className="py-2">
        <hr className="border-t-2 border-stone-900" />
      </div>
    );
  }

  /* --- 13. PHOTO / IMAGE & IMAGE_STAMP BLOCK (Exact 1:1 match to Studio Canvas) --- */
  if (type === "IMAGE" || type === "image" || type === "IMAGE_STAMP") {
    const imgUrl = block.mediaData?.imageUrl || block.imageUrl || "";
    const captionVal = block.mediaData?.caption ?? block.caption ?? block.content ?? "";
    const imgHeightPx =
      block.mediaData?.heightPx ||
      (typeof block.height === "number" ? block.height : undefined);

    return (
      <div className={cn("w-full flex flex-col gap-2", alignClass)}>
        {imgUrl ? (
          <div className="relative w-full">
            <div className="overflow-hidden rounded-lg border border-stone-200 bg-stone-50/40">
              <img
                src={imgUrl}
                alt={captionVal || "Document Photo"}
                style={{
                  width: "100%",
                  height: imgHeightPx ? `${imgHeightPx}px` : "auto",
                  objectFit: imgHeightPx ? "cover" : "contain",
                }}
                className="block w-full select-none"
              />
            </div>
          </div>
        ) : (
          <div className="w-full min-h-[140px] rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 flex flex-col items-center justify-center p-6 text-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-stone-200/70 text-stone-500 flex items-center justify-center">
              <ImageIcon className="w-4.5 h-4.5" />
            </div>
            <div className="text-xs font-bold text-stone-500">
              {captionVal || "Visual Documentation / Photo Attachment"}
            </div>
          </div>
        )}

        {captionVal && (
          <span className={cn("block w-full text-[11px] italic text-stone-600 font-medium", alignClass)}>
            {cleanBoldMarkdown(captionVal)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="text-xs text-stone-500 italic py-1">
      {block.content || `[${block.type} Block]`}
    </div>
  );
};

/* ============================================================================
 * UNIFIED 1:1 DOCUMENT SHEET RENDERER (Matches Studio .studio-sheet & ERP PrintTemplate)
 * ==========================================================================*/
export interface DocumentSheetRendererProps {
  blocks: DocBlock[];
  layoutPreset?: LayoutPreset;
  customWidthMm?: number | null;
  customHeightMm?: number | null;
  documentStatus?: WorkspaceStatus | string;
  documentCode?: string | null;
  documentId?: string | null;
  docType?: string;
  department?: string;
  createdByName?: string;
  approvedByName?: string;
  approvedAt?: string;
  signerChain?: WorkspaceSignerStep[];
  className?: string;
}

export const DocumentSheetRenderer = forwardRef<HTMLDivElement, DocumentSheetRendererProps>(
  (
    {
      blocks = [],
      layoutPreset = "A4_PORTRAIT",
      customWidthMm,
      customHeightMm,
      documentStatus = "DRAFT",
      documentCode,
      documentId,
      docType = "MEMORANDUM",
      department = "General",
      createdByName,
      approvedByName,
      approvedAt,
      signerChain,
      className,
    },
    ref
  ) => {
    const isApproved = documentStatus === "APPROVED";
    const paperDims = getPaperDimensions(layoutPreset, customWidthMm, customHeightMm);
    const headerBlock = blocks.find((b) => b.type === "HEADER" || b.type === "heading");
    const headerRef = headerBlock?.content
      ? headerBlock.content.replace(/^(NO\.?|REF\.?|NOMOR)\s*[:.]?\s*/i, "").trim()
      : "";
    const effectiveDocCode =
      documentCode || headerRef || documentId || `DOC/ERP/${new Date().getFullYear()}`;
    const hasFooterBlock = blocks.some(
      (b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK"
    );

    const defaultFooterBlock: DocBlock = {
      id: "auto-erp-footer",
      type: "FOOTER",
      category: "FOOTER_TEMPLATE",
      footerVariant: "ERP_STANDARD",
      footerLeftText: isApproved
        ? "This document has been digitally authorized and computationally verified. Legally valid with system verification."
        : "This document is computationally issued and validated. Valid without physical signature.",
      footerRightText: docType ? docType.replace(/_/g, " ") : "OFFICIAL ERP DOCUMENT",
      subtitle: "OFFICIAL WORKSPACE DOCUMENT",
    };

    return (
      <div
        ref={ref}
        style={{
          width: `${paperDims.widthPx}px`,
          minHeight: `${paperDims.heightPx}px`,
        }}
        className={cn(
          "studio-sheet bg-white shadow-xl rounded-xl border border-stone-300 relative print:shadow-none print:border-none z-0 shrink-0 flex flex-col box-border text-stone-900 font-sans",
          paperDims.paddingClass,
          className
        )}
      >
        {/* ERP Standard Diagonal DRAFT Watermark (Exact 1:1 match with Studio & PrintTemplate.tsx) */}
        {!isApproved && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden rounded-xl">
            <div className="text-[150px] font-black text-stone-900 opacity-[0.03] select-none rotate-[-45deg] tracking-widest uppercase">
              DRAFT
            </div>
          </div>
        )}

        {/* Blocks flow (Exact 1:1 coordinate space, gap-6, width, height & x/y offsets as Studio) */}
        <div className="flex-1 flex flex-col gap-6 relative z-10 w-full">
          {blocks.map((block, idx) => {
            const isKop =
              block.type === "OFFICIAL_LETTERHEAD" ||
              block.type === "letterhead" ||
              Boolean(block.isLocked);
            const isFooter = block.type === "FOOTER" || block.type === "FOOTER_BLOCK";
            const isImage =
              block.type === "IMAGE" ||
              block.type === "image" ||
              block.type === "IMAGE_STAMP";
            const isMoved = !isKop && !isFooter && Boolean(block.x || block.y);
            const blockAlign = normalizeHorizontalAlign(
              block.alignment || block.align,
              isImage
                ? "CENTER"
                : block.type === "HEADER" || block.type === "heading"
                ? "CENTER"
                : block.type === "SIGNATURE_COLUMN" || block.type === "SIGNATURE_STAMP"
                ? "RIGHT"
                : "LEFT"
            );
            const hasCustomWidth =
              !isKop &&
              !isFooter &&
              Boolean(block.width || (isImage && block.mediaData?.widthPx));
            const selfAlignClass =
              hasCustomWidth && !isMoved
                ? blockAlign === "LEFT"
                  ? "mr-auto"
                  : blockAlign === "RIGHT"
                  ? "ml-auto"
                  : blockAlign === "CENTER"
                  ? "mx-auto"
                  : ""
                : "";

            return (
              <div
                key={block.id || idx}
                style={{
                  width:
                    isKop || isFooter
                      ? "100%"
                      : block.width
                      ? typeof block.width === "number"
                        ? `${block.width}px`
                        : block.width
                      : isImage && block.mediaData?.widthPx
                      ? `${block.mediaData.widthPx}px`
                      : "100%",
                  minHeight: block.height
                    ? typeof block.height === "number"
                      ? `${block.height}px`
                      : block.height
                    : undefined,
                  maxWidth: "100%",
                  transform:
                    !isKop && !isFooter && (block.x || block.y)
                      ? `translate(${block.x || 0}px, ${block.y || 0}px)`
                      : undefined,
                }}
                className={cn(
                  "relative rounded-xl",
                  selfAlignClass,
                  isFooter ? "mt-auto pt-8 w-full px-0 py-1" : isKop ? "w-full px-0 py-1" : "p-2"
                )}
              >
                <SharedBlockRenderer
                  block={block}
                  isApprovalPreview={true}
                  documentStatus={documentStatus}
                  approvedByName={approvedByName}
                  approvedAt={approvedAt}
                  documentCode={effectiveDocCode}
                  documentId={documentId}
                  docType={docType}
                  department={department}
                  createdByName={createdByName}
                />
              </div>
            );
          })}

          {/* Sequential Multi-Signer Approval Progress Tracker */}
          {signerChain && signerChain.length > 0 && (
            <div className="w-full px-3 py-2.5 rounded-xl border border-stone-200 bg-stone-50/70 flex flex-wrap items-center justify-between gap-2 text-[10px]">
              <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-stone-700">
                <ShieldCheck className="w-3.5 h-3.5 text-stone-700" />
                <span>Approval Chain ({signerChain.filter((s) => s.status === "APPROVED").length}/{signerChain.length})</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {signerChain.map((step, sIdx) => (
                  <React.Fragment key={step.step}>
                    <div
                      className={cn(
                        "px-2 py-0.5 rounded-md border font-bold flex items-center gap-1",
                        step.status === "APPROVED"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-white border-stone-200 text-stone-600"
                      )}
                    >
                      <span>#{step.step}</span>
                      <span>{step.department}</span>
                      <span className="text-stone-400">•</span>
                      <span>{extractTierFromRole(step.role, step.department)}</span>
                    </div>
                    {sIdx < signerChain.length - 1 && (
                      <span className="text-stone-400 font-bold">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Automatic ERP Standard Footer when document does not have an explicit FOOTER block */}
          {!hasFooterBlock && (
            <div className="mt-auto pt-8 w-full px-0 py-1 relative">
              <SharedBlockRenderer
                block={defaultFooterBlock}
                isApprovalPreview={true}
                documentStatus={documentStatus}
                approvedByName={approvedByName}
                approvedAt={approvedAt}
                documentCode={effectiveDocCode}
                documentId={documentId}
                docType={docType}
                department={department}
                createdByName={createdByName}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
);

DocumentSheetRenderer.displayName = "DocumentSheetRenderer";
