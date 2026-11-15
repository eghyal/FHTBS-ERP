import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Plus,
  Minus,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Combine,
  SplitSquareVertical,
  Calculator,
  Palette,
  Rows3,
  Columns3,
  Check,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CellFormatType,
  DocBlock,
  DocTableCellMeta,
  DocTableData,
} from "@/types/workspace";
import {
  applyPastedMatrixToTable,
  colIndexToLetter,
  computeRangeTelemetry,
  deleteTableColumnAt,
  deleteTableRowAt,
  evaluateTableFormula,
  formatA1Coord,
  formatCellValue,
  formatRangeCoord,
  insertTableColumnAt,
  insertTableRowAt,
  mergeTableCellRange,
  normalizeCellRange,
  parseClipboardMatrix,
  serializeTableRangeToTSV,
  sortTableByColumn,
  unmergeTableCellRange,
} from "@/services/docxEngine";
import { cleanBoldMarkdown } from "./config";

interface GridCraftTableEditorProps {
  block: DocBlock;
  editable: boolean;
  isSelected: boolean;
  isId: boolean;
  alignClass: string;
  vAlignClass: string;
  normAlign: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY";
  onUpdate: (updates: Partial<DocBlock>) => void;
  onSelectBlock?: () => void;
  onTableColResizeStart?: (
    e: React.MouseEvent,
    blockId: string,
    colIndex: number,
    currentWidth: number
  ) => void;
  onTableRowResizeStart?: (
    e: React.MouseEvent,
    blockId: string,
    rowIndex: number,
    currentHeight: number
  ) => void;
}

const CELL_FILL_SWATCHES: Array<{ label: string; value: string; border: string }> = [
  { label: "None", value: "", border: "border-stone-300" },
  { label: "Slate", value: "#F1F5F9", border: "border-slate-300" },
  { label: "Warm Stone", value: "#F5F5F4", border: "border-stone-300" },
  { label: "Emerald", value: "#ECFDF5", border: "border-emerald-300" },
  { label: "Amber", value: "#FFFBEB", border: "border-amber-300" },
  { label: "Sky", value: "#F0F9FF", border: "border-sky-300" },
  { label: "Rose", value: "#FFF1F2", border: "border-rose-300" },
];

const FORMAT_OPTIONS: Array<{ value: CellFormatType; label: string; short: string }> = [
  { value: "TEXT", label: "Auto / Text", short: "Auto" },
  { value: "NUMBER", label: "Number (1.250)", short: "1.23" },
  { value: "CURRENCY_IDR", label: "IDR (Rp 1.250.000)", short: "IDR" },
  { value: "CURRENCY_USD", label: "USD ($1,250.00)", short: "USD" },
  { value: "PERCENT", label: "Percent (12,5%)", short: "%" },
];

export const GridCraftTableEditor: React.FC<GridCraftTableEditorProps> = ({
  block,
  editable,
  isSelected,
  isId,
  alignClass,
  vAlignClass,
  normAlign,
  onUpdate,
  onSelectBlock,
  onTableColResizeStart,
  onTableRowResizeStart,
}) => {
  const td: DocTableData = useMemo(() => {
    const raw = block.tableData || { headers: ["Column A", "Column B"], rows: [["", ""]] };
    const headers = Array.isArray(raw.headers) && raw.headers.length > 0 ? raw.headers : ["Column A"];
    const rows =
      Array.isArray(raw.rows) && raw.rows.length > 0
        ? raw.rows.map((r) =>
            Array.from({ length: headers.length }, (_, cIdx) => String(r?.[cIdx] ?? ""))
          )
        : [Array.from({ length: headers.length }, () => "")];
    return {
      ...raw,
      headers,
      rows,
      colWidths: raw.colWidths || raw.columnWidths || [],
      rowHeights: raw.rowHeights || [],
      columnAlignments: raw.columnAlignments || block.columnAlignments || [],
      cellFormats: raw.cellFormats || block.cellFormats || {},
      cellMeta: raw.cellMeta || {},
      zebraStriping: Boolean(raw.zebraStriping),
    };
  }, [block.tableData, block.columnAlignments, block.cellFormats]);

  const colWidths = td.colWidths || [];
  const rowHeights = td.rowHeights || [];
  const colAligns = td.columnAlignments || [];
  const cellFormats = td.cellFormats || {};
  const cellMetaMap = td.cellMeta || {};
  const zebraStriping = Boolean(td.zebraStriping);

  // Selection & editing state
  const [selectionAnchor, setSelectionAnchor] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [selectionFocus, setSelectionFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [sortDirections, setSortDirections] = useState<Record<number, "asc" | "desc">>({});
  const [showColorMenu, setShowColorMenu] = useState(false);

  const cellInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const formulaBarInputRef = useRef<HTMLInputElement | null>(null);

  const showSpreadsheetChrome = editable && isSelected;

  // Clamp selection coordinates when table rows/cols shrink
  useEffect(() => {
    const maxR = Math.max(0, td.rows.length - 1);
    const maxC = Math.max(0, td.headers.length - 1);
    setSelectionAnchor((prev) => ({
      r: Math.min(prev.r, maxR),
      c: Math.min(prev.c, maxC),
    }));
    setSelectionFocus((prev) => ({
      r: Math.min(prev.r, maxR),
      c: Math.min(prev.c, maxC),
    }));
  }, [td.rows.length, td.headers.length]);

  useEffect(() => {
    if (!isDraggingRange) return;
    const stopDrag = () => setIsDraggingRange(false);
    window.addEventListener("mouseup", stopDrag);
    return () => window.removeEventListener("mouseup", stopDrag);
  }, [isDraggingRange]);

  const normRange = useMemo(
    () => normalizeCellRange(selectionAnchor, selectionFocus),
    [selectionAnchor, selectionFocus]
  );

  const hasMultiCellSelection =
    normRange.r1 !== normRange.r2 || normRange.c1 !== normRange.c2;

  const activeCellValue = td.rows[selectionAnchor.r]?.[selectionAnchor.c] ?? "";
  const activeCellKey = `${selectionAnchor.r}-${selectionAnchor.c}`;
  const activeCellFormat: CellFormatType = cellFormats[activeCellKey] || "TEXT";
  const activeCellMeta: DocTableCellMeta = cellMetaMap[activeCellKey] || {};

  // Check if current selection overlaps any merged region
  const selectionHasMergedCells = useMemo(() => {
    for (let r = normRange.r1; r <= normRange.r2; r++) {
      for (let c = normRange.c1; c <= normRange.c2; c++) {
        const m = cellMetaMap[`${r}-${c}`];
        if (m && ((m.rowSpan && m.rowSpan > 1) || (m.colSpan && m.colSpan > 1) || m.hidden)) {
          return true;
        }
      }
    }
    return false;
  }, [normRange, cellMetaMap]);

  const rangeTelemetry = useMemo(
    () => computeRangeTelemetry(td, selectionAnchor, selectionFocus),
    [td, selectionAnchor, selectionFocus]
  );

  const commitTableData = useCallback(
    (nextTd: DocTableData) => {
      onUpdate({
        columnAlignments: nextTd.columnAlignments,
        cellFormats: nextTd.cellFormats,
        tableData: nextTd,
      });
    },
    [onUpdate]
  );

  const updateHeader = (colIdx: number, val: string) => {
    const headers = [...td.headers];
    headers[colIdx] = cleanBoldMarkdown(val);
    commitTableData({ ...td, headers });
  };

  const updateCell = (r: number, c: number, val: string) => {
    const rows = td.rows.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? val : cell)) : row
    );
    commitTableData({ ...td, rows });
  };

  const getColumnAlignClass = (cIdx: number, cellAlign?: "left" | "center" | "right") => {
    const ca = cellAlign || colAligns[cIdx];
    if (ca === "center") return "text-center";
    if (ca === "right") return "text-right";
    if (ca === "left") return "text-left";
    return alignClass;
  };

  // Detect if active cell is currently expecting a point-and-click cell/range reference
  const isFormulaExpectingRef = (rawVal: string): boolean => {
    const trimmed = String(rawVal || "").trim();
    if (!trimmed.startsWith("=")) return false;
    return /[=(,+\-*/^:<>!&]\s*([A-Z]{1,3}[1-9]\d*(?::[A-Z]{1,3}[1-9]\d*)?)?$/i.test(trimmed);
  };

  const injectCoordIntoActiveFormula = (refCoord: string) => {
    const currentRaw = String(td.rows[selectionAnchor.r]?.[selectionAnchor.c] ?? "");
    const replaced = currentRaw.replace(
      /([=(,+\-*/^:<>!&]\s*)([A-Z]{1,3}[1-9]\d*(?::[A-Z]{1,3}[1-9]\d*)?)?$/i,
      `$1${refCoord}`
    );
    updateCell(selectionAnchor.r, selectionAnchor.c, replaced);
  };

  const focusCellInput = (r: number, c: number) => {
    setTimeout(() => {
      const el = cellInputRefs.current[`${r}-${c}`];
      if (el) {
        el.focus();
      }
    }, 0);
  };

  const moveSelection = (dr: number, dc: number, expandRange = false) => {
    const maxR = Math.max(0, td.rows.length - 1);
    const maxC = Math.max(0, td.headers.length - 1);
    const base = expandRange ? selectionFocus : selectionAnchor;
    let nextR = Math.max(0, Math.min(maxR, base.r + dr));
    let nextC = Math.max(0, Math.min(maxC, base.c + dc));

    // Skip hidden merged cells
    const meta = cellMetaMap[`${nextR}-${nextC}`];
    if (meta?.hidden) {
      nextR = Math.max(0, Math.min(maxR, nextR + (dr !== 0 ? dr : 0)));
      nextC = Math.max(0, Math.min(maxC, nextC + (dc !== 0 ? dc : 0)));
    }

    if (expandRange) {
      setSelectionFocus({ r: nextR, c: nextC });
    } else {
      setSelectionAnchor({ r: nextR, c: nextC });
      setSelectionFocus({ r: nextR, c: nextC });
      setEditingCell({ r: nextR, c: nextC });
      focusCellInput(nextR, nextC);
    }
  };

  // Apply formatting / alignment / fill to all cells in current selection range
  const applyRangeFormat = (fmt: CellFormatType) => {
    const nextFormats: Record<string, CellFormatType> = { ...cellFormats };
    for (let r = normRange.r1; r <= normRange.r2; r++) {
      for (let c = normRange.c1; c <= normRange.c2; c++) {
        nextFormats[`${r}-${c}`] = fmt;
      }
    }
    commitTableData({ ...td, cellFormats: nextFormats });
  };

  const applyRangeMetaPatch = (patch: Partial<DocTableCellMeta>) => {
    const nextMeta: Record<string, DocTableCellMeta> = { ...cellMetaMap };
    for (let r = normRange.r1; r <= normRange.r2; r++) {
      for (let c = normRange.c1; c <= normRange.c2; c++) {
        const key = `${r}-${c}`;
        nextMeta[key] = {
          ...(nextMeta[key] || {}),
          ...patch,
        };
      }
    }
    commitTableData({ ...td, cellMeta: nextMeta });
  };

  const clearSelectedRangeValues = () => {
    const nextRows = td.rows.map((row, rIdx) =>
      row.map((val, cIdx) =>
        rIdx >= normRange.r1 &&
        rIdx <= normRange.r2 &&
        cIdx >= normRange.c1 &&
        cIdx <= normRange.c2
          ? ""
          : val
      )
    );
    commitTableData({ ...td, rows: nextRows });
  };

  const handleInsertFunction = (fnName: string) => {
    const r = selectionAnchor.r;
    const c = selectionAnchor.c;
    // If multi-cell range is selected and target cell is below or right of range, or insert into active cell
    if (hasMultiCellSelection) {
      const rangeStr = formatRangeCoord(
        { r: normRange.r1, c: normRange.c1 },
        { r: normRange.r2, c: normRange.c2 }
      );
      // If there is a cell right below normRange.r2, place formula there, or if active cell is empty
      if (normRange.r2 + 1 < td.rows.length && !td.rows[normRange.r2 + 1]?.[normRange.c2]) {
        const targetR = normRange.r2 + 1;
        const targetC = normRange.c2;
        updateCell(targetR, targetC, `=${fnName}(${rangeStr})`);
        setSelectionAnchor({ r: targetR, c: targetC });
        setSelectionFocus({ r: targetR, c: targetC });
        return;
      }
    }

    // Default: build range A1:A{r} if r > 0, else =FN(ABOVE)
    const expr =
      fnName === "IF"
        ? `=IF(${colIndexToLetter(Math.max(0, c - 1))}${r + 1}>0, "OK", "CHECK")`
        : fnName === "ROUND"
        ? `=ROUND(${colIndexToLetter(Math.max(0, c - 1))}${r + 1}, 0)`
        : r > 0
        ? `=${fnName}(${colIndexToLetter(c)}1:${colIndexToLetter(c)}${r})`
        : `=${fnName}(ABOVE)`;

    if (td.rows[r]?.[c] !== undefined) {
      updateCell(r, c, expr);
      setEditingCell({ r, c });
      focusCellInput(r, c);
    }
  };

  const handleAppendSummaryRow = (fnName: "SUM" | "AVERAGE" | "COUNT" | "MIN" | "MAX") => {
    const rowCount = td.rows.length;
    const labelMap: Record<string, string> = {
      SUM: "TOTAL",
      AVERAGE: "AVERAGE",
      COUNT: "COUNT",
      MIN: "MIN",
      MAX: "MAX",
    };
    const newRow = td.headers.map((_, cIdx) => {
      if (cIdx === 0) return "";
      if (cIdx === 1 && td.headers.length > 2) return labelMap[fnName] || fnName;
      if (cIdx === 0 && td.headers.length <= 2) return labelMap[fnName] || fnName;
      const colLet = colIndexToLetter(cIdx);
      const hasNumericAbove = td.rows.some((r) => {
        const raw = String(r[cIdx] || "").replace(/[^\d.,-]/g, "").trim();
        return raw.length > 0 && !Number.isNaN(parseFloat(raw));
      });
      return hasNumericAbove || cIdx === td.headers.length - 1
        ? `=${fnName}(${colLet}1:${colLet}${rowCount})`
        : "";
    });
    const nextRowIdx = td.rows.length;
    const nextMeta: Record<string, DocTableCellMeta> = { ...cellMetaMap };
    td.headers.forEach((_, cIdx) => {
      nextMeta[`${nextRowIdx}-${cIdx}`] = {
        ...(nextMeta[`${nextRowIdx}-${cIdx}`] || {}),
        bold: true,
        backgroundColor: "#F5F5F4",
      };
    });
    commitTableData({
      ...td,
      rows: [...td.rows, newRow],
      cellMeta: nextMeta,
    });
  };

  const handleSortColumn = (colIdx: number) => {
    const nextDir: "asc" | "desc" = sortDirections[colIdx] === "asc" ? "desc" : "asc";
    setSortDirections((prev) => ({ ...prev, [colIdx]: nextDir }));
    commitTableData(sortTableByColumn(td, colIdx, nextDir));
  };

  // Clipboard Copy / Paste on Table Container
  const handleTableCopy = (e: React.ClipboardEvent) => {
    if (!showSpreadsheetChrome) return;
    // Allow normal copy inside input if user selected substring inside a single input and no multi-cell selection
    const activeEl = document.activeElement as HTMLInputElement | null;
    if (
      !hasMultiCellSelection &&
      activeEl &&
      activeEl.tagName === "INPUT" &&
      activeEl.selectionStart !== activeEl.selectionEnd
    ) {
      return;
    }
    e.preventDefault();
    const tsv = serializeTableRangeToTSV(td, selectionAnchor, selectionFocus, true);
    e.clipboardData.setData("text/plain", tsv);
  };

  const handleTablePaste = (e: React.ClipboardEvent) => {
    if (!showSpreadsheetChrome) return;
    const rawClip = e.clipboardData.getData("text/plain");
    if (!rawClip) return;
    const matrix = parseClipboardMatrix(rawClip);
    // If it's multi-row or multi-column (contains tab or newline), handle as grid paste
    if (matrix.length > 1 || (matrix[0] && matrix[0].length > 1)) {
      e.preventDefault();
      const updated = applyPastedMatrixToTable(td, selectionAnchor.r, selectionAnchor.c, matrix);
      commitTableData(updated);
      setSelectionFocus({
        r: selectionAnchor.r + matrix.length - 1,
        c: selectionAnchor.c + (matrix[0]?.length || 1) - 1,
      });
    }
  };

  return (
    <div
      className="space-y-1.5 text-xs w-full"
      onCopy={handleTableCopy}
      onPaste={handleTablePaste}
    >
      {/* Optional Table Title */}
      {(block.title || showSpreadsheetChrome) && (
        <input
          type="text"
          readOnly={!editable}
          value={cleanBoldMarkdown(block.title || "")}
          onChange={(e) => onUpdate({ title: cleanBoldMarkdown(e.target.value) })}
          onFocus={onSelectBlock}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          placeholder={isId ? "Judul tabel (opsional)" : "Table title (optional)"}
          className={cn(
            "bg-transparent outline-none w-full p-0 m-0 border-0 rounded-sm font-bold text-stone-900 transition-colors",
            editable && "hover:bg-stone-100/70 focus:bg-stone-100/90 px-1 py-0.5",
            alignClass
          )}
        />
      )}

      {/* ============ GRIDCRAFT FORMULA BAR & CONTEXT TOOLBAR (EDIT + SELECTED ONLY) ============ */}
      {showSpreadsheetChrome && (
        <div
          className="rounded-xl border border-stone-200 bg-stone-50/95 p-1.5 space-y-1.5 shadow-2xs select-none print:hidden"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Row 1: Coordinate Badge + fx Formula Input + Quick Functions */}
          <div className="flex items-center gap-1.5">
            <div
              className="px-2 py-1 rounded-lg bg-stone-900 text-white font-mono tabular-nums text-[10.5px] font-bold min-w-[54px] text-center shrink-0"
              title="Active Cell / Selected Range Coordinate"
            >
              {formatRangeCoord(selectionAnchor, selectionFocus)}
            </div>

            <div className="flex items-center flex-1 min-w-0 bg-white border border-stone-200 rounded-lg px-2 py-1 focus-within:border-stone-900 transition-colors">
              <span className="font-mono italic font-black text-[11px] text-stone-500 pr-2 border-r border-stone-200 mr-2 shrink-0 select-none">
                fx
              </span>
              <input
                ref={formulaBarInputRef}
                type="text"
                value={activeCellValue}
                onChange={(e) => updateCell(selectionAnchor.r, selectionAnchor.c, e.target.value)}
                onFocus={() => setEditingCell(selectionAnchor)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setEditingCell(null);
                    moveSelection(1, 0, false);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setEditingCell(null);
                  }
                }}
                placeholder="Enter value or formula (e.g. =SUM(B1:B4), =B1*C1, =IF(C1>100, 'OK', 'LOW'))"
                className="w-full text-[11.5px] font-mono text-stone-900 bg-transparent outline-none"
              />
            </div>

            {/* Quick Function Generators */}
            <div className="hidden sm:flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-stone-200 shrink-0">
              {(["SUM", "AVERAGE", "COUNT", "MIN", "MAX", "IF", "ROUND"] as const).map((fn) => (
                <button
                  key={fn}
                  type="button"
                  onClick={() => handleInsertFunction(fn)}
                  className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold text-stone-700 hover:bg-stone-900 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  title={`Insert =${fn}(...) into active cell`}
                >
                  {fn === "AVERAGE" ? "AVG" : fn}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Structural Row/Col Ops, Merge, Sort, Format, Alignment & Fill */}
          <div className="flex items-center justify-between gap-1.5 flex-wrap pt-0.5 border-t border-stone-200/70">
            <div className="flex items-center gap-1 flex-wrap">
              {/* Positional Row Operations */}
              <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-stone-200">
                <span className="px-1 text-[9px] font-bold uppercase text-stone-400 flex items-center gap-0.5">
                  <Rows3 className="w-2.5 h-2.5" /> R{selectionAnchor.r + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    commitTableData(insertTableRowAt(td, selectionAnchor.r, "above"));
                  }}
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-stone-700 hover:bg-stone-100 cursor-pointer whitespace-nowrap"
                  title="Insert Row Above Active Cell"
                >
                  +↑
                </button>
                <button
                  type="button"
                  onClick={() => {
                    commitTableData(insertTableRowAt(td, selectionAnchor.r, "below"));
                    setSelectionAnchor((p) => ({ ...p, r: p.r + 1 }));
                    setSelectionFocus((p) => ({ ...p, r: p.r + 1 }));
                  }}
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-stone-700 hover:bg-stone-100 cursor-pointer whitespace-nowrap"
                  title="Insert Row Below Active Cell"
                >
                  +↓
                </button>
                <button
                  type="button"
                  disabled={td.rows.length <= 1}
                  onClick={() => {
                    commitTableData(deleteTableRowAt(td, selectionAnchor.r));
                  }}
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-35 cursor-pointer"
                  title="Delete Active Row"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>

              {/* Positional Column Operations */}
              <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-stone-200">
                <span className="px-1 text-[9px] font-bold uppercase text-stone-400 flex items-center gap-0.5">
                  <Columns3 className="w-2.5 h-2.5" /> {colIndexToLetter(selectionAnchor.c)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    commitTableData(
                      insertTableColumnAt(td, selectionAnchor.c, "left", isId ? "Kolom" : "Column")
                    );
                  }}
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-stone-700 hover:bg-stone-100 cursor-pointer whitespace-nowrap"
                  title="Insert Column Left"
                >
                  +←
                </button>
                <button
                  type="button"
                  onClick={() => {
                    commitTableData(
                      insertTableColumnAt(td, selectionAnchor.c, "right", isId ? "Kolom" : "Column")
                    );
                    setSelectionAnchor((p) => ({ ...p, c: p.c + 1 }));
                    setSelectionFocus((p) => ({ ...p, c: p.c + 1 }));
                  }}
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-stone-700 hover:bg-stone-100 cursor-pointer whitespace-nowrap"
                  title="Insert Column Right"
                >
                  +→
                </button>
                <button
                  type="button"
                  disabled={td.headers.length <= 1}
                  onClick={() => {
                    commitTableData(deleteTableColumnAt(td, selectionAnchor.c));
                  }}
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-35 cursor-pointer"
                  title="Delete Active Column"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>

              {/* Merge / Unmerge + Sort */}
              <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-stone-200">
                {selectionHasMergedCells ? (
                  <button
                    type="button"
                    onClick={() => {
                      commitTableData(unmergeTableCellRange(td, selectionAnchor, selectionFocus));
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-900 text-white flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    title="Unmerge Selected Cells"
                  >
                    <SplitSquareVertical className="w-3 h-3" />
                    <span>Unmerge</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!hasMultiCellSelection}
                    onClick={() => {
                      commitTableData(mergeTableCellRange(td, selectionAnchor, selectionFocus));
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-40 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    title="Select 2+ cells (Shift+Click or Drag) to Merge"
                  >
                    <Combine className="w-3 h-3" />
                    <span>Merge</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleSortColumn(selectionAnchor.c)}
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-stone-700 hover:bg-stone-100 flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                  title={`Sort Column ${colIndexToLetter(selectionAnchor.c)} (${
                    sortDirections[selectionAnchor.c] === "asc" ? "Z→A" : "A→Z"
                  })`}
                >
                  {sortDirections[selectionAnchor.c] === "asc" ? (
                    <ArrowUp className="w-3 h-3" />
                  ) : sortDirections[selectionAnchor.c] === "desc" ? (
                    <ArrowDown className="w-3 h-3" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3" />
                  )}
                  <span>Sort</span>
                </button>
              </div>
            </div>

            {/* Right Group: Cell Format, Text Style, Alignment, Fill Swatches, Summary Row */}
            <div className="flex items-center gap-1 flex-wrap ml-auto">
              {/* Cell Format Selector */}
              <div className="flex items-center bg-white p-0.5 rounded-lg border border-stone-200">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => applyRangeFormat(opt.value)}
                    title={opt.label}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold cursor-pointer transition-colors whitespace-nowrap",
                      activeCellFormat === opt.value
                        ? "bg-stone-900 text-white"
                        : "text-stone-600 hover:bg-stone-100"
                    )}
                  >
                    {opt.short}
                  </button>
                ))}
              </div>

              {/* Cell Bold / Italic / Alignment */}
              <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-stone-200">
                <button
                  type="button"
                  onClick={() => applyRangeMetaPatch({ bold: !activeCellMeta.bold })}
                  className={cn(
                    "p-1 rounded cursor-pointer transition-colors",
                    activeCellMeta.bold ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
                  )}
                  title="Bold Selected Cell(s)"
                >
                  <Bold className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => applyRangeMetaPatch({ italic: !activeCellMeta.italic })}
                  className={cn(
                    "p-1 rounded cursor-pointer transition-colors",
                    activeCellMeta.italic ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
                  )}
                  title="Italic Selected Cell(s)"
                >
                  <Italic className="w-3 h-3" />
                </button>
                {(
                  [
                    { a: "left", icon: AlignLeft },
                    { a: "center", icon: AlignCenter },
                    { a: "right", icon: AlignRight },
                  ] as const
                ).map(({ a, icon: AIcon }) => {
                  const curA =
                    activeCellMeta.textAlign ||
                    colAligns[selectionAnchor.c] ||
                    (normAlign === "CENTER" ? "center" : normAlign === "RIGHT" ? "right" : "left");
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => applyRangeMetaPatch({ textAlign: a })}
                      className={cn(
                        "p-1 rounded cursor-pointer transition-colors",
                        curA === a ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
                      )}
                      title={`Align ${a}`}
                    >
                      <AIcon className="w-3 h-3" />
                    </button>
                  );
                })}
              </div>

              {/* Cell Background Fill Picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColorMenu((s) => !s)}
                  className="px-2 py-1 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                  title="Cell Fill Color & Zebra Striping"
                >
                  <Palette className="w-3 h-3" />
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-stone-300"
                    style={{ backgroundColor: activeCellMeta.backgroundColor || "#FFFFFF" }}
                  />
                </button>
                {showColorMenu && (
                  <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-stone-200 rounded-xl shadow-lg p-2 w-48 space-y-2">
                    <div className="text-[9.5px] font-bold uppercase text-stone-500">Cell Fill</div>
                    <div className="grid grid-cols-7 gap-1">
                      {CELL_FILL_SWATCHES.map((sw) => (
                        <button
                          key={sw.label}
                          type="button"
                          onClick={() => {
                            applyRangeMetaPatch({ backgroundColor: sw.value || undefined });
                            setShowColorMenu(false);
                          }}
                          title={sw.label}
                          style={{ backgroundColor: sw.value || "#FFFFFF" }}
                          className={cn(
                            "w-5 h-5 rounded-md border cursor-pointer flex items-center justify-center",
                            sw.border
                          )}
                        >
                          {(activeCellMeta.backgroundColor || "") === sw.value && (
                            <Check className="w-2.5 h-2.5 text-stone-900" />
                          )}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        commitTableData({ ...td, zebraStriping: !zebraStriping });
                        setShowColorMenu(false);
                      }}
                      className={cn(
                        "w-full py-1 px-2 rounded-lg text-[10px] font-bold border flex items-center justify-between cursor-pointer",
                        zebraStriping
                          ? "bg-stone-900 text-white border-stone-900"
                          : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                      )}
                    >
                      <span>Zebra Alternating Rows</span>
                      {zebraStriping && <Check className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Append Summary Row */}
              <button
                type="button"
                onClick={() => handleAppendSummaryRow("SUM")}
                className="px-2 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Append Auto-Sum Total Row"
              >
                <Calculator className="w-3 h-3" />
                <span>+Total Row</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MAIN TABLE SURFACE ============ */}
      <div className="overflow-x-auto border border-stone-200 rounded-xl relative select-none">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            {/* Optional GridCraft Coordinate Header Row (A, B, C...) — Visible ONLY when selected in Edit Mode */}
            {showSpreadsheetChrome && (
              <tr className="bg-stone-200/75 text-stone-600 border-b border-stone-300 font-mono text-[10px] select-none print:hidden">
                <th className="w-7 py-0.5 text-center border-r border-stone-300 bg-stone-200/90 text-[9px] font-black text-stone-500">
                  #
                </th>
                {td.headers.map((_, cIdx) => {
                  const colW = colWidths[cIdx] || 120;
                  const isColInRange = cIdx >= normRange.c1 && cIdx <= normRange.c2;
                  return (
                    <th
                      key={`coord-col-${cIdx}`}
                      style={{ width: `${colW}px` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Select entire column
                        setSelectionAnchor({ r: 0, c: cIdx });
                        setSelectionFocus({ r: Math.max(0, td.rows.length - 1), c: cIdx });
                      }}
                      className={cn(
                        "py-0.5 px-1.5 border-r border-stone-300 last:border-r-0 text-center font-bold cursor-pointer transition-colors",
                        isColInRange
                          ? "bg-stone-900 text-white"
                          : "hover:bg-stone-300/70 text-stone-700"
                      )}
                      title={`Column ${colIndexToLetter(cIdx)} — Click to select column`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>{colIndexToLetter(cIdx)}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            )}

            {/* Document Table Column Headers Row */}
            <tr className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200">
              {showSpreadsheetChrome && (
                <th
                  className="w-7 p-0 text-center border-r border-stone-200 bg-stone-100 text-[9px] font-mono font-bold text-stone-400 select-none print:hidden"
                  title="Header Row"
                >
                  H
                </th>
              )}
              {td.headers.map((h, hIdx) => {
                const colW = colWidths[hIdx];
                const colAlignCls = getColumnAlignClass(hIdx);
                return (
                  <th
                    key={hIdx}
                    style={colW ? { width: `${colW}px` } : undefined}
                    className={cn(
                      "p-1 relative group/th border-r border-stone-200/80 last:border-r-0 transition-colors",
                      vAlignClass,
                      colAlignCls
                    )}
                  >
                    <div className="flex items-center gap-0.5">
                      <input
                        type="text"
                        readOnly={!editable}
                        value={cleanBoldMarkdown(h)}
                        onChange={(e) => updateHeader(hIdx, e.target.value)}
                        onFocus={() => {
                          if (onSelectBlock) onSelectBlock();
                        }}
                        onMouseDown={(e) => {
                          if (onSelectBlock) onSelectBlock();
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={`Column ${colIndexToLetter(hIdx)}`}
                        className={cn(
                          "bg-transparent outline-none w-full font-bold text-stone-700 px-1.5 py-1 rounded-sm",
                          editable && "hover:bg-stone-200/60 focus:bg-white focus:ring-1 focus:ring-stone-400",
                          colAlignCls
                        )}
                      />
                    </div>
                    {showSpreadsheetChrome && onTableColResizeStart && (
                      <div
                        onMouseDown={(e) => onTableColResizeStart(e, block.id, hIdx, colW || 120)}
                        className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize hover:bg-stone-900/80 z-20 group-hover/th:bg-stone-400/50 transition-colors"
                        title="Drag to resize column width"
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {td.rows.map((row, rIdx) => {
              const rowH = rowHeights[rIdx] || 36;
              const isRowInRange = rIdx >= normRange.r1 && rIdx <= normRange.r2;
              return (
                <tr
                  key={rIdx}
                  style={{ height: `${rowH}px` }}
                  className={cn(
                    "border-b border-stone-100 last:border-b-0 relative group/tr",
                    zebraStriping && rIdx % 2 === 1 && "bg-stone-50/60"
                  )}
                >
                  {/* Row Coordinate Index (1, 2, 3...) — Visible ONLY when selected in Edit Mode */}
                  {showSpreadsheetChrome && (
                    <td
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectionAnchor({ r: rIdx, c: 0 });
                        setSelectionFocus({ r: rIdx, c: Math.max(0, td.headers.length - 1) });
                      }}
                      className={cn(
                        "w-7 p-0 text-center border-r border-stone-200 font-mono tabular-nums text-[10px] font-bold cursor-pointer select-none transition-colors print:hidden",
                        isRowInRange
                          ? "bg-stone-900 text-white"
                          : "bg-stone-100/90 text-stone-500 hover:bg-stone-200"
                      )}
                      title={`Row ${rIdx + 1} — Click to select row`}
                    >
                      {rIdx + 1}
                    </td>
                  )}

                  {row.map((cell, cIdx) => {
                    const cellKey = `${rIdx}-${cIdx}`;
                    const meta = cellMetaMap[cellKey];
                    if (meta?.hidden) return null;

                    const colW = colWidths[cIdx];
                    const rawStr = String(cell ?? "");
                    const isFormula = rawStr.trim().startsWith("=");
                    const isAnchor = selectionAnchor.r === rIdx && selectionAnchor.c === cIdx;
                    const isFocused =
                      showSpreadsheetChrome &&
                      editingCell?.r === rIdx &&
                      editingCell?.c === cIdx;
                    const isInSelectedRange =
                      showSpreadsheetChrome &&
                      rIdx >= normRange.r1 &&
                      rIdx <= normRange.r2 &&
                      cIdx >= normRange.c1 &&
                      cIdx <= normRange.c2;

                    const cellFormat = cellFormats[cellKey];
                    const evaluatedVal = isFormula
                      ? evaluateTableFormula(rawStr, rIdx, cIdx, td)
                      : formatCellValue(rawStr, cellFormat);
                    const displayValue = isFocused ? rawStr : evaluatedVal;

                    const colAlignCls = getColumnAlignClass(cIdx, meta?.textAlign);
                    const isNumericCell =
                      isFormula ||
                      cellFormat === "NUMBER" ||
                      cellFormat === "CURRENCY_IDR" ||
                      cellFormat === "CURRENCY_USD" ||
                      cellFormat === "PERCENT";
                    const isFormulaError =
                      !isFocused && isFormula && String(evaluatedVal).startsWith("#");

                    return (
                      <td
                        key={cIdx}
                        rowSpan={meta?.rowSpan && meta.rowSpan > 1 ? meta.rowSpan : undefined}
                        colSpan={meta?.colSpan && meta.colSpan > 1 ? meta.colSpan : undefined}
                        style={{
                          width:
                            colW && (!meta?.colSpan || meta.colSpan <= 1) ? `${colW}px` : undefined,
                          backgroundColor: meta?.backgroundColor || undefined,
                        }}
                        onMouseDown={(e) => {
                          if (!editable) return;
                          e.stopPropagation();
                          if (onSelectBlock && !isSelected) {
                            onSelectBlock();
                          }
                          // Point-to-reference formula insertion
                          if (
                            showSpreadsheetChrome &&
                            editingCell &&
                            (editingCell.r !== rIdx || editingCell.c !== cIdx) &&
                            isFormulaExpectingRef(
                              td.rows[selectionAnchor.r]?.[selectionAnchor.c] ?? ""
                            )
                          ) {
                            e.preventDefault();
                            injectCoordIntoActiveFormula(formatA1Coord(rIdx, cIdx));
                            return;
                          }
                          if (e.shiftKey) {
                            setSelectionFocus({ r: rIdx, c: cIdx });
                            setEditingCell(null);
                          } else {
                            setSelectionAnchor({ r: rIdx, c: cIdx });
                            setSelectionFocus({ r: rIdx, c: cIdx });
                            setEditingCell({ r: rIdx, c: cIdx });
                            setIsDraggingRange(true);
                          }
                        }}
                        onMouseEnter={() => {
                          if (isDraggingRange && showSpreadsheetChrome) {
                            setSelectionFocus({ r: rIdx, c: cIdx });
                          }
                        }}
                        className={cn(
                          "p-1 relative border-r border-stone-100 last:border-r-0 transition-colors",
                          !meta?.backgroundColor && isFormula && !isFocused && "bg-stone-50/70",
                          isInSelectedRange && !isAnchor && "bg-sky-500/10",
                          showSpreadsheetChrome &&
                            isAnchor &&
                            "ring-2 ring-inset ring-stone-900 bg-sky-50/30 z-10",
                          vAlignClass,
                          colAlignCls
                        )}
                      >
                        <div className="flex items-center gap-1">
                          {showSpreadsheetChrome && isFormula && !isFocused && (
                            <span
                              className={cn(
                                "px-1 py-0.2 rounded font-mono text-[8.5px] font-black shrink-0 select-none print:hidden",
                                isFormulaError
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-stone-200/80 text-stone-700"
                              )}
                              title={`${formatA1Coord(rIdx, cIdx)}: ${rawStr}`}
                            >
                              fx
                            </span>
                          )}
                          <input
                            ref={(el) => {
                              cellInputRefs.current[cellKey] = el;
                            }}
                            type="text"
                            readOnly={!editable}
                            value={cleanBoldMarkdown(displayValue)}
                            onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                            onFocus={() => {
                              if (onSelectBlock && !isSelected) onSelectBlock();
                              setSelectionAnchor({ r: rIdx, c: cIdx });
                              if (!isDraggingRange) {
                                setSelectionFocus({ r: rIdx, c: cIdx });
                              }
                              setEditingCell({ r: rIdx, c: cIdx });
                            }}
                            onBlur={() => {
                              setEditingCell((prev) =>
                                prev?.r === rIdx && prev?.c === cIdx ? null : prev
                              );
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") {
                                e.preventDefault();
                                setEditingCell(null);
                                moveSelection(e.shiftKey ? -1 : 1, 0, false);
                              } else if (e.key === "Tab") {
                                e.preventDefault();
                                setEditingCell(null);
                                if (e.shiftKey) {
                                  if (cIdx > 0) moveSelection(0, -1, false);
                                  else if (rIdx > 0) {
                                    const prevR = rIdx - 1;
                                    const lastC = td.headers.length - 1;
                                    setSelectionAnchor({ r: prevR, c: lastC });
                                    setSelectionFocus({ r: prevR, c: lastC });
                                    focusCellInput(prevR, lastC);
                                  }
                                } else {
                                  if (cIdx < td.headers.length - 1) moveSelection(0, 1, false);
                                  else if (rIdx < td.rows.length - 1) {
                                    const nextR = rIdx + 1;
                                    setSelectionAnchor({ r: nextR, c: 0 });
                                    setSelectionFocus({ r: nextR, c: 0 });
                                    focusCellInput(nextR, 0);
                                  }
                                }
                              } else if (e.key === "ArrowDown" && (!isFocused || e.altKey || e.shiftKey)) {
                                e.preventDefault();
                                moveSelection(1, 0, e.shiftKey);
                              } else if (e.key === "ArrowUp" && (!isFocused || e.altKey || e.shiftKey)) {
                                e.preventDefault();
                                moveSelection(-1, 0, e.shiftKey);
                              } else if (
                                (e.key === "Delete" || e.key === "Backspace") &&
                                hasMultiCellSelection
                              ) {
                                e.preventDefault();
                                clearSelectedRangeValues();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                setEditingCell(null);
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            placeholder={showSpreadsheetChrome ? "—" : ""}
                            className={cn(
                              "bg-transparent outline-none w-full text-stone-800 px-1.5 py-1 rounded-sm",
                              colAlignCls,
                              (isFormula || meta?.bold) && "font-bold text-stone-950",
                              meta?.italic && "italic",
                              isNumericCell && "font-mono tabular-nums",
                              isFormulaError && "text-rose-600 font-bold"
                            )}
                          />
                        </div>

                        {showSpreadsheetChrome && onTableColResizeStart && (
                          <div
                            onMouseDown={(e) =>
                              onTableColResizeStart(e, block.id, cIdx, colW || 120)
                            }
                            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-stone-900/80 z-20 transition-colors"
                          />
                        )}
                      </td>
                    );
                  })}

                  {showSpreadsheetChrome && onTableRowResizeStart && (
                    <td className="p-0 border-none w-0 print:hidden">
                      <div
                        onMouseDown={(e) => onTableRowResizeStart(e, block.id, rIdx, rowH)}
                        className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize hover:bg-stone-900/80 z-20 group-hover/tr:bg-stone-400/50 transition-colors"
                        title="Drag to resize row height"
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ============ GRIDCRAFT STATUS & LIVE TELEMETRY FOOTER (EDIT + SELECTED ONLY) ============ */}
      {showSpreadsheetChrome && (
        <div
          className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-stone-100/90 border border-stone-200 text-[10px] font-mono tabular-nums text-stone-600 select-none print:hidden flex-wrap"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-stone-900">
              {td.rows.length}R × {td.headers.length}C
            </span>
            <span>·</span>
            <span>
              Range: <strong className="text-stone-900">{rangeTelemetry?.coordLabel || "A1"}</strong>
            </span>
            {hasMultiCellSelection && (
              <span className="text-stone-500">({rangeTelemetry?.cellCount || 1} cells)</span>
            )}
          </div>

          {rangeTelemetry && rangeTelemetry.numericCount > 0 ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span>
                COUNT: <strong className="text-stone-900">{rangeTelemetry.numericCount}</strong>
              </span>
              <span>
                SUM:{" "}
                <strong className="text-emerald-700">
                  {rangeTelemetry.sum.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                </strong>
              </span>
              <span>
                AVG:{" "}
                <strong className="text-stone-900">
                  {rangeTelemetry.avg.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                </strong>
              </span>
              <span>
                MIN:{" "}
                <strong className="text-stone-900">
                  {rangeTelemetry.min.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                </strong>
              </span>
              <span>
                MAX:{" "}
                <strong className="text-stone-900">
                  {rangeTelemetry.max.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                </strong>
              </span>
            </div>
          ) : (
            <div className="text-stone-500 font-sans text-[10px]">
              Tip: Use <code className="font-mono font-bold text-stone-700">=SUM(B1:B4)</code>,{" "}
              <code className="font-mono font-bold text-stone-700">=B1*C1</code>, or{" "}
              <code className="font-mono font-bold text-stone-700">Shift+Click</code> cells to select a range
            </div>
          )}
        </div>
      )}
    </div>
  );
};
