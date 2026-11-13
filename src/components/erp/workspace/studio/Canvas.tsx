import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  FileText,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Palette,
  Highlighter,
  CaseSensitive,
  Plus,
  Minus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Building2,
  MapPin,
  CheckCircle2,
  PenTool,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ShieldCheck,
  Send,
  Save,
  X,
  Sparkles,
  Layers,
  Eye,
  AlertTriangle,
  Table as TableIcon,
  ListOrdered,
  Type,
  UserCheck,
  Grid3X3,
  GripVertical,
  Move,
  RotateCcw,
  Undo2,
  Redo2,
  Printer,
  Keyboard,
  PanelLeft,
  SlidersHorizontal,
  Search,
  Lock,
  Check,
  Info,
  Upload,
  Download,
  Calculator,
  Landmark,
  CheckSquare,
  SeparatorHorizontal,
  FileCheck2,
  Image as ImageIcon,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { generatePDF } from "@/lib/pdfGenerator";
import {
  DocBlock,
  DocBlockType,
  BlockCategory,
  LayoutPreset,
  TargetDepartment,
  AuthorizationRole,
} from "@/types/workspace";
import { ERP_DEPARTMENT_OPTIONS } from "@/constants/rbac";
import {
  evaluateTableFormula,
  parseDocxPackageToBlocks,
  generateDocxBinaryBuffer,
  generateDeterministicPdfBuffer,
  normalizeHorizontalAlign,
  normalizeVerticalAlign,
  normalizeBlockAlignment,
} from "@/services/docxEngine";
import {
  DEPARTMENT_ROUTING_CONFIG,
  LIBRARY_ITEMS,
  LIB_DRAG_MIME,
  BLOCK_TYPE_LABELS,
  readAndCompressImageFile,
  getPaperDimensions,
  extractTierFromRole,
  cleanBoldMarkdown,
} from "./config";
import type { CanvaStudioState } from "./useStudioState";

interface InlineTextProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  editable: boolean;
  multiline?: boolean;
  onEnter?: () => void;
  style?: React.CSSProperties;
  onFocus?: () => void;
  onBlur?: () => void;
}

/** Single-line inline input that blends into the document canvas. */
function InlineInput({ value, onChange, className, placeholder, editable, onEnter, style, onFocus, onBlur }: InlineTextProps) {
  const cleanVal = cleanBoldMarkdown(value || "");

  if (!editable) {
    return (
      <span style={style} className={cn("block w-full", className)}>
        {cleanVal || <span className="opacity-40">{placeholder}</span>}
      </span>
    );
  }
  return (
    <input
      type="text"
      value={cleanVal}
      placeholder={placeholder}
      onChange={(e) => onChange(cleanBoldMarkdown(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
        e.stopPropagation();
      }}
      onFocus={() => {
        if (onFocus) onFocus();
      }}
      onBlur={() => {
        if (onBlur) onBlur();
      }}
      onMouseDown={(e) => {
        if (onFocus) onFocus();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      style={style}
      className={cn(
        "bg-transparent outline-none w-full rounded-sm transition-colors",
        "hover:bg-stone-100/70 focus:bg-stone-100/90 focus:ring-1 focus:ring-stone-400/60",
        className
      )}
    />
  );
}

/** Auto-growing textarea for paragraph blocks that expands to content height while respecting vertical alignment. */
function InlineTextarea({ value, onChange, className, placeholder, editable, style, onFocus }: InlineTextProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const cleanVal = cleanBoldMarkdown(value || "");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const adjustHeight = () => {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight + 2, 24)}px`;
    };

    adjustHeight();

    const parent = el.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => {
      adjustHeight();
    });
    ro.observe(parent);

    return () => ro.disconnect();
  }, [cleanVal, editable, style]);

  if (!editable) {
    return (
      <div style={style} className={cn("whitespace-pre-line w-full", className)}>
        {cleanVal || <span className="opacity-40">{placeholder}</span>}
      </div>
    );
  }
  return (
    <textarea
      ref={ref}
      value={cleanVal}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => onChange(cleanBoldMarkdown(e.target.value))}
      onKeyDown={(e) => e.stopPropagation()}
      onFocus={() => {
        if (onFocus) onFocus();
      }}
      onMouseDown={(e) => {
        if (onFocus) onFocus();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      style={style}
      className={cn(
        "bg-transparent outline-none w-full resize-none rounded-sm transition-colors",
        "hover:bg-stone-100/70 focus:bg-stone-100/90 focus:ring-1 focus:ring-stone-400/60",
        className
      )}
    />
  );
}

/* ============================================================
 * BLOCK CONTENT RENDERER (inline-editable when `editable`)
 * ==========================================================*/
interface BlockContentProps {
  block: DocBlock;
  editable: boolean;
  isId: boolean;
  documentId: string | null;
  documentCode?: string | null;
  docType?: string;
  isApproved?: boolean;
  department: string;
  isSelected: boolean;
  onUpdate: (updates: Partial<DocBlock>) => void;
  onSelectBlock?: () => void;
  onTableColResizeStart?: (e: React.MouseEvent, blockId: string, colIndex: number, currentWidth: number) => void;
  onTableRowResizeStart?: (e: React.MouseEvent, blockId: string, rowIndex: number, currentHeight: number) => void;
}

function BlockContent({
  block,
  editable,
  isId,
  documentId,
  documentCode,
  docType,
  isApproved,
  department,
  isSelected,
  onUpdate,
  onSelectBlock,
  onTableColResizeStart,
  onTableRowResizeStart,
}: BlockContentProps) {
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null);
  const [lastFocusedCell, setLastFocusedCell] = useState<{ r: number; c: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const handlePhotoUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { dataUrl, width } = await readAndCompressImageFile(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
      const nextWidth = typeof block.width === "number" ? block.width : width;
      onUpdate({
        width: nextWidth,
        mediaData: {
          ...(block.mediaData || { mediaType: "IMAGE" }),
          mediaType: "IMAGE",
          imageUrl: dataUrl,
          widthPx: nextWidth,
          caption:
            block.mediaData?.caption ||
            cleanName ||
            (isId ? "Keterangan Foto / Dokumentasi Lapangan" : "Photo Caption / Field Documentation"),
        },
      });
    } catch {
      // ignore
    }
  };

  const updateAddress = (field: keyof NonNullable<DocBlock["addressData"]>, value: string) => {
    onUpdate({ addressData: { ...block.addressData, [field]: value } });
  };

  const updateListItem = (idx: number, value: string) => {
    const items = [...(block.listItems || [])];
    items[idx] = value;
    onUpdate({ listItems: items });
  };
  const addListItem = (afterIdx: number) => {
    const items = [...(block.listItems || [])];
    items.splice(afterIdx + 1, 0, "");
    onUpdate({ listItems: items });
  };
  const removeListItem = (idx: number) => {
    const items = [...(block.listItems || [])];
    items.splice(idx, 1);
    onUpdate({ listItems: items });
  };

  const updateHeader = (idx: number, value: string) => {
    if (!block.tableData) return;
    const headers = [...block.tableData.headers];
    headers[idx] = value;
    onUpdate({ tableData: { ...block.tableData, headers } });
  };
  const updateCell = (r: number, c: number, value: string) => {
    if (!block.tableData) return;
    const rows = block.tableData.rows.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row
    );
    onUpdate({ tableData: { ...block.tableData, rows } });
  };
  const addRow = () => {
    if (!block.tableData) return;
    const colCount = block.tableData.headers.length;
    onUpdate({
      tableData: {
        ...block.tableData,
        rows: [...block.tableData.rows, Array.from({ length: colCount }, () => "")],
      },
    });
  };
  const removeRow = () => {
    if (!block.tableData || block.tableData.rows.length <= 1) return;
    onUpdate({
      tableData: { ...block.tableData, rows: block.tableData.rows.slice(0, -1) },
    });
  };
  const addCol = () => {
    if (!block.tableData) return;
    onUpdate({
      tableData: {
        headers: [...block.tableData.headers, isId ? `Kolom ${block.tableData.headers.length + 1}` : `Column ${block.tableData.headers.length + 1}`],
        rows: block.tableData.rows.map((r) => [...r, ""]),
      },
    });
  };
  const removeCol = () => {
    if (!block.tableData || block.tableData.headers.length <= 1) return;
    onUpdate({
      tableData: {
        headers: block.tableData.headers.slice(0, -1),
        rows: block.tableData.rows.map((r) => r.slice(0, -1)),
      },
    });
  };

  const normalizedMetaList = useMemo(() => {
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
    return [];
  }, [block.metaData, block.metadataRows]);

  const updateMeta = (idx: number, field: "key" | "value", value: string) => {
    const meta = [...normalizedMetaList];
    meta[idx] = { ...meta[idx], [field]: value };
    onUpdate({ metaData: meta });
  };
  const addMeta = () => {
    onUpdate({ metaData: [...normalizedMetaList, { key: "", value: "" }] });
  };
  const removeMeta = (idx: number) => {
    const meta = [...normalizedMetaList];
    meta.splice(idx, 1);
    onUpdate({ metaData: meta });
  };

  const defaultAlign =
    block.type === "HEADER"
      ? "CENTER"
      : block.type === "SIGNATURE_COLUMN" || block.type === "SIGNATURE_STAMP"
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
    fontWeight: block.isBold ? 700 : undefined,
    fontStyle: block.isItalic ? "italic" : undefined,
    textDecoration:
      block.isUnderline && block.isStrikethrough
        ? "underline line-through"
        : block.isUnderline
        ? "underline"
        : block.isStrikethrough
        ? "line-through"
        : undefined,
    color: block.textColor || undefined,
    backgroundColor: block.highlightColor || undefined,
  };

  switch (block.type) {
    /* --- 1. OFFICIAL LETTERHEAD (locked, read-only) --- */
    case "OFFICIAL_LETTERHEAD":
    case "letterhead": {
      const effectiveRef = documentCode || documentId || `DOC/ERP/${new Date().getFullYear()}`;
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
              {block.companyName || block.title || "CV. BATU EMAS GROUP"}
            </h1>
            <div className="font-semibold text-stone-700 leading-normal text-[10.5px]">
              {block.addressLine ||
                block.addressData?.streetAddress ||
                "Dusun Petahunan, Jajag, Gambiran, Banyuwangi Regency, East Java 68486"}
              <br />
              <span className="font-bold text-black">Phone:</span> {block.addressData?.phone || "0811-1111-3993"}{" "}
              &nbsp;|&nbsp; <span className="font-bold text-black">Email:</span>{" "}
              {block.addressData?.email || "pavingjoss@gmail.com"}
            </div>
          </div>
          <div className="flex items-center gap-3 text-right shrink-0">
            <div className="flex flex-col items-end">
              <div className="font-bold tracking-widest uppercase mb-0.5 text-[9px] text-stone-500">
                {isApproved ? "Valid Doc ID:" : "Doc Ref ID:"}
              </div>
              <div className="font-mono font-bold text-black border border-stone-300 px-2 py-0.5 bg-stone-50 rounded-xs text-[10px]">
                {effectiveRef}
              </div>
            </div>
            {isApproved ? (
              <div className="w-11 h-11 bg-white border border-stone-300 p-0.5 flex items-center justify-center shrink-0 rounded-xs shadow-2xs">
                <QRCodeSVG
                  value={`https://fhtbs-erp.shared/doc/${effectiveRef}`}
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

    /* --- 2. ADDRESS BLOCKS --- */
    case "SENDER_ADDRESS":
    case "RECIPIENT_ADDRESS":
    case "PROJECT_SITE_ADDRESS": {
      const palette =
        block.type === "RECIPIENT_ADDRESS"
          ? "bg-blue-50/50 border-blue-200/80"
          : block.type === "PROJECT_SITE_ADDRESS"
          ? "bg-emerald-50/50 border-emerald-200/80"
          : "bg-stone-50 border-stone-200";
      const labelColor =
        block.type === "RECIPIENT_ADDRESS"
          ? "text-blue-600"
          : block.type === "PROJECT_SITE_ADDRESS"
          ? "text-emerald-700"
          : "text-stone-400";
      const a = block.addressData || {};
      return (
        <div
          className={cn(
            "border rounded-xl p-3.5 space-y-1 text-xs w-full h-full min-h-full flex flex-col",
            vJustifyClass,
            alignClass,
            palette
          )}
        >
          <InlineInput
            editable={editable}
            value={block.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            onFocus={onSelectBlock}
            placeholder={isId ? "Label blok alamat" : "Address block label"}
            className={cn("text-[10px] font-black uppercase tracking-wider", labelColor, alignClass)}
          />
          <InlineInput
            editable={editable}
            value={a.companyName || ""}
            onChange={(v) => updateAddress("companyName", v)}
            onFocus={onSelectBlock}
            placeholder={isId ? "Nama perusahaan / penerima" : "Company / recipient name"}
            className={cn("font-bold text-stone-900 text-sm", alignClass)}
          />
          <InlineInput
            editable={editable}
            value={a.division || a.siteLocation || ""}
            onChange={(v) =>
              updateAddress(block.type === "PROJECT_SITE_ADDRESS" ? "siteLocation" : "division", v)
            }
            onFocus={onSelectBlock}
            placeholder={isId ? "Divisi / lokasi site" : "Division / site location"}
            className={cn("text-stone-700 font-medium", alignClass)}
          />
          <InlineInput
            editable={editable}
            value={a.streetAddress || ""}
            onChange={(v) => updateAddress("streetAddress", v)}
            onFocus={onSelectBlock}
            placeholder={isId ? "Alamat jalan" : "Street address"}
            className={cn("text-stone-600 text-[11px]", alignClass)}
          />
          <div className={cn("flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500 font-mono", flexRowJustifyClass)}>
            <InlineInput
              editable={editable}
              value={a.contactPerson || ""}
              onChange={(v) => updateAddress("contactPerson", v)}
              onFocus={onSelectBlock}
              placeholder={isId ? "Kontak person" : "Contact person"}
              className={cn("flex-1 min-w-40", alignClass)}
            />
            <InlineInput
              editable={editable}
              value={a.phone || ""}
              onChange={(v) => updateAddress("phone", v)}
              onFocus={onSelectBlock}
              placeholder={isId ? "Telepon" : "Phone"}
              className={cn("w-44", alignClass)}
            />
          </div>
        </div>
      );
    }

    /* --- 3. HEADER --- */
    case "HEADER":
      return (
        <div
          className={cn("space-y-1 py-2 w-full h-full min-h-full flex flex-col", vJustifyClass, alignClass)}
          style={blockTextStyle}
        >
          <InlineInput
            editable={editable}
            value={block.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            onFocus={onSelectBlock}
            placeholder={isId ? "JUDUL DOKUMEN" : "DOCUMENT TITLE"}
            style={{ fontSize: block.fontSize ? `${block.fontSize}px` : undefined }}
            className={cn("text-lg font-black tracking-tight text-stone-950 uppercase", alignClass)}
          />
          <InlineInput
            editable={editable}
            value={block.content || ""}
            onChange={(v) => onUpdate({ content: v })}
            onFocus={onSelectBlock}
            placeholder="NO: REF/PJ/001"
            className={cn("text-xs font-bold text-stone-500 font-mono tracking-wider", alignClass)}
          />
        </div>
      );

    /* --- 4. TEXT PARAGRAPH --- */
    case "TEXT":
      return (
        <div className={cn("w-full h-full min-h-full flex flex-col flex-1", vJustifyClass, alignClass)}>
          <InlineTextarea
            editable={editable}
            value={block.content || ""}
            onChange={(v) => onUpdate({ content: v })}
            onFocus={onSelectBlock}
            placeholder={isId ? "Ketik isi paragraf di sini..." : "Type paragraph content here..."}
            style={blockTextStyle}
            className={cn(
              "text-xs text-stone-800 leading-relaxed w-full",
              alignClass,
              block.isBold ? "font-bold text-stone-950" : "font-normal"
            )}
          />
        </div>
      );

    /* --- 5. CALLOUT --- */
    case "CALLOUT":
      return (
        <div
          className={cn(
            "p-4 rounded-xl border space-y-1 text-xs w-full h-full min-h-full flex flex-col",
            vJustifyClass,
            alignClass,
            block.style === "WARNING"
              ? "bg-amber-50/80 border-amber-300"
              : block.style === "SUCCESS"
              ? "bg-emerald-50/80 border-emerald-300"
              : "bg-blue-50/80 border-blue-300"
          )}
        >
          <div className={cn("font-bold flex items-center gap-1.5 uppercase text-[11px] tracking-wide shrink-0", flexRowJustifyClass)}>
            <AlertTriangle
              className={cn(
                "w-3.5 h-3.5 shrink-0",
                block.style === "WARNING"
                  ? "text-amber-600"
                  : block.style === "SUCCESS"
                  ? "text-emerald-600"
                  : "text-blue-600"
              )}
            />
            <InlineInput
              editable={editable}
              value={block.title || ""}
              onChange={(v) => onUpdate({ title: v })}
              onFocus={onSelectBlock}
              placeholder={isId ? "Judul catatan" : "Callout title"}
              className={cn("uppercase", alignClass)}
            />
          </div>
          <InlineTextarea
            editable={editable}
            value={block.content || ""}
            onChange={(v) => onUpdate({ content: v })}
            onFocus={onSelectBlock}
            placeholder={isId ? "Isi catatan penting..." : "Callout content..."}
            style={blockTextStyle}
            className={cn(
              "leading-relaxed text-stone-800 w-full",
              alignClass,
              block.isBold ? "font-bold" : "font-medium"
            )}
          />
        </div>
      );

    /* --- 6. LIST POINTS & CHECKLIST --- */
    case "LIST_POINTS":
    case "CHECKLIST":
    case "list": {
      const isChecklist = block.listStyle === "CHECKLIST" || block.type === "CHECKLIST";
      const isBullet = !isChecklist && block.listStyle === "BULLET";
      return (
        <div
          className={cn("space-y-1.5 text-xs text-stone-800 w-full h-full min-h-full flex flex-col", vJustifyClass, alignClass)}
          style={blockTextStyle}
        >
          <InlineInput
            editable={editable}
            value={block.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            onFocus={onSelectBlock}
            placeholder={isId ? "Judul daftar (opsional)" : "List title (optional)"}
            className={cn("font-bold text-stone-900", alignClass)}
          />
          <ol className="space-y-1">
            {(block.listItems || []).map((item, liIdx) => (
              <li key={liIdx} className={cn("flex items-start gap-2 group/li", flexRowJustifyClass)}>
                {isChecklist ? (
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                ) : isBullet ? (
                  <span className="text-stone-400 font-bold shrink-0 w-5 text-center select-none">•</span>
                ) : (
                  <span className="text-stone-400 font-bold shrink-0 w-5 text-right select-none">
                    {liIdx + 1}.
                  </span>
                )}
                <InlineInput
                  editable={editable}
                  value={item}
                  onChange={(v) => updateListItem(liIdx, v)}
                  onEnter={() => addListItem(liIdx)}
                  onFocus={onSelectBlock}
                  placeholder={isId ? "Tulis poin..." : "Write a point..."}
                  className={cn("flex-1 leading-relaxed", alignClass)}
                />
                {editable && isSelected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeListItem(liIdx);
                    }}
                    className="opacity-0 group-hover/li:opacity-100 p-0.5 text-stone-300 hover:text-rose-500 transition-opacity cursor-pointer shrink-0"
                    title={isId ? "Hapus poin" : "Remove point"}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {editable && isSelected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                addListItem((block.listItems || []).length - 1);
              }}
              className={cn("text-[10px] font-bold text-stone-900 hover:text-stone-700 flex items-center gap-1 cursor-pointer", flexRowJustifyClass)}
            >
              <Plus className="w-3 h-3" />
              {isId ? "Tambah poin" : "Add point"}
            </button>
          )}
        </div>
      );
    }

    /* --- 7. TABLE (fully editable with column & row resizing + per-column alignment + DOCX Formula Engine) --- */
    case "TABLE": {
      const td = block.tableData || { headers: [], rows: [] };
      const colWidths = td.colWidths || [];
      const rowHeights = td.rowHeights || [];
      const colAligns = td.columnAlignments || block.columnAlignments || [];

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

      const cycleColumnAlignment = (cIdx: number) => {
        if (!block.tableData) return;
        const currentList: Array<"left" | "center" | "right"> = td.headers.map(
          (_, i) => colAligns[i] || (normAlign === "CENTER" ? "center" : normAlign === "RIGHT" ? "right" : "left")
        );
        const cur = currentList[cIdx] || "left";
        const nextVal: "left" | "center" | "right" =
          cur === "left" ? "center" : cur === "center" ? "right" : "left";
        currentList[cIdx] = nextVal;
        onUpdate({
          columnAlignments: currentList,
          tableData: {
            ...block.tableData,
            columnAlignments: currentList,
          },
        });
      };

      const applyQuickFormula = (formulaExpr: string, label: string) => {
        if (!block.tableData) return;
        const headers = block.tableData.headers;
        const rows = block.tableData.rows.map((r) => [...r]);
        if (lastFocusedCell && rows[lastFocusedCell.r] && rows[lastFocusedCell.r][lastFocusedCell.c] !== undefined) {
          rows[lastFocusedCell.r][lastFocusedCell.c] = formulaExpr;
          onUpdate({ tableData: { ...block.tableData, rows } });
          return;
        }
        // Otherwise append a summary row with the formula in numeric columns
        const newRow = headers.map((_, cIdx) => {
          if (cIdx === 0) return "";
          if (cIdx === 1) return label;
          const hasNumericAbove = rows.some((r) => {
            const raw = (r[cIdx] || "").replace(/[^\d.,-]/g, "").trim();
            return raw.length > 0 && !Number.isNaN(parseFloat(raw));
          });
          return hasNumericAbove || cIdx === headers.length - 2 ? formulaExpr : "";
        });
        onUpdate({
          tableData: {
            ...block.tableData,
            rows: [...rows, newRow],
          },
        });
      };

      return (
        <div className="space-y-1.5 text-xs">
          <InlineInput
            editable={editable}
            value={block.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            onFocus={onSelectBlock}
            placeholder={isId ? "Judul tabel (opsional)" : "Table title (optional)"}
            className={cn("font-bold text-stone-900", alignClass)}
          />
          <div className="overflow-x-auto border border-stone-200 rounded-xl relative select-none">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200">
                  {td.headers.map((h, hIdx) => {
                    const colW = colWidths[hIdx] || 120;
                    const colAlignCls = getColumnAlignClass(hIdx);
                    const curColAlign =
                      colAligns[hIdx] ||
                      (normAlign === "CENTER" ? "center" : normAlign === "RIGHT" ? "right" : "left");
                    return (
                      <th
                        key={hIdx}
                        style={{ width: `${colW}px` }}
                        className={cn(
                          "p-1 relative group/th border-r border-stone-200/80 last:border-r-0 transition-colors",
                          vAlignClass,
                          colAlignCls
                        )}
                      >
                        <div className="flex items-center gap-0.5">
                          <InlineInput
                            editable={editable}
                            value={h}
                            onChange={(v) => updateHeader(hIdx, v)}
                            onFocus={onSelectBlock}
                            placeholder={`Column ${hIdx + 1}`}
                            className={cn("font-bold text-stone-700 px-1.5 py-1 flex-1", colAlignCls)}
                          />
                          {editable && isSelected && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                cycleColumnAlignment(hIdx);
                              }}
                              title={
                                isId
                                  ? `Perataan Kolom ${hIdx + 1}: ${curColAlign.toUpperCase()} (Klik untuk ubah L/C/R)`
                                  : `Column ${hIdx + 1} Alignment: ${curColAlign.toUpperCase()} (Click to cycle L/C/R)`
                              }
                              className="opacity-0 group-hover/th:opacity-100 focus:opacity-100 p-1 rounded bg-stone-200/80 hover:bg-stone-900 hover:text-white text-stone-700 transition-all cursor-pointer shrink-0"
                            >
                              {curColAlign === "center" ? (
                                <AlignCenter className="w-2.5 h-2.5" />
                              ) : curColAlign === "right" ? (
                                <AlignRight className="w-2.5 h-2.5" />
                              ) : (
                                <AlignLeft className="w-2.5 h-2.5" />
                              )}
                            </button>
                          )}
                        </div>
                        {editable && isSelected && onTableColResizeStart && (
                          <div
                            onMouseDown={(e) => onTableColResizeStart(e, block.id, hIdx, colW)}
                            className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize hover:bg-stone-900/80 z-20 group-hover/th:bg-stone-400/50 transition-colors"
                            title={isId ? "Seret untuk meresize lebar kolom" : "Drag to resize column width"}
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
                  return (
                    <tr
                      key={rIdx}
                      style={{ height: `${rowH}px` }}
                      className="border-b border-stone-100 hover:bg-stone-50/50 relative group/tr"
                    >
                      {row.map((cell, cIdx) => {
                        const colW = colWidths[cIdx] || 120;
                        const isFormula = typeof cell === "string" && cell.trim().startsWith("=");
                        const isFocused = editingCell?.r === rIdx && editingCell?.c === cIdx;
                        const evaluatedVal =
                          isFormula && !isFocused
                            ? evaluateTableFormula(cell, rIdx, cIdx, td)
                            : cell;
                        const colAlignCls = getColumnAlignClass(cIdx);

                        return (
                          <td
                            key={cIdx}
                            style={{ width: `${colW}px` }}
                            className={cn(
                              "p-1 relative border-r border-stone-100 last:border-r-0",
                              isFormula && !isFocused && "bg-stone-50/90",
                              vAlignClass,
                              colAlignCls
                            )}
                          >
                            <div className="flex items-center gap-1">
                              {isFormula && !isFocused && (
                                <span
                                  className="px-1 py-0.2 rounded bg-stone-200/80 text-stone-700 font-mono text-[9px] font-black shrink-0"
                                  title={cell}
                                >
                                  fx
                                </span>
                              )}
                              <InlineInput
                                editable={editable}
                                value={evaluatedVal}
                                onChange={(v) => updateCell(rIdx, cIdx, v)}
                                onFocus={() => {
                                  if (onSelectBlock) onSelectBlock();
                                  setEditingCell({ r: rIdx, c: cIdx });
                                  setLastFocusedCell({ r: rIdx, c: cIdx });
                                }}
                                onBlur={() => {
                                  setEditingCell((prev) =>
                                    prev?.r === rIdx && prev?.c === cIdx ? null : prev
                                  );
                                }}
                                placeholder="—"
                                className={cn(
                                  "text-stone-800 px-1.5 py-1",
                                  colAlignCls,
                                  isFormula && "font-bold text-stone-950 font-mono"
                                )}
                              />
                            </div>
                            {editable && isSelected && onTableColResizeStart && (
                              <div
                                onMouseDown={(e) => onTableColResizeStart(e, block.id, cIdx, colW)}
                                className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-stone-900/80 z-20 transition-colors"
                              />
                            )}
                          </td>
                        );
                      })}
                      {editable && isSelected && onTableRowResizeStart && (
                        <td className="p-0 border-none w-0">
                          <div
                            onMouseDown={(e) => onTableRowResizeStart(e, block.id, rIdx, rowH)}
                            className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize hover:bg-stone-900/80 z-20 group-hover/tr:bg-stone-400/50 transition-colors"
                            title={isId ? "Seret untuk meresize tinggi baris" : "Drag to resize row height"}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {editable && isSelected && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); addRow(); }}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-stone-100 text-stone-800 border border-stone-200 hover:bg-stone-200 cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> {isId ? "Baris" : "Row"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); removeRow(); }}
                disabled={td.rows.length <= 1}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 disabled:opacity-40 cursor-pointer flex items-center gap-1"
              >
                <Minus className="w-3 h-3" /> {isId ? "Baris" : "Row"}
              </button>
              <span className="w-px h-4 bg-stone-200" />
              <button
                onClick={(e) => { e.stopPropagation(); addCol(); }}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-stone-100 text-stone-800 border border-stone-200 hover:bg-stone-200 cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> {isId ? "Kolom" : "Column"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); removeCol(); }}
                disabled={td.headers.length <= 1}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white text-stone-600 border border-stone-200 hover:bg-stone-100 disabled:opacity-40 cursor-pointer flex items-center gap-1"
              >
                <Minus className="w-3 h-3" /> {isId ? "Kolom" : "Column"}
              </button>
              <span className="w-px h-4 bg-stone-200" />
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-stone-500 px-1">
                <Calculator className="w-3 h-3 text-stone-700" />
                {isId ? "Rumus:" : "Formula:"}
              </span>
              {[
                { expr: "=SUM(ABOVE)", label: "SUM", rowLabel: "TOTAL (SUM)" },
                { expr: "=AVERAGE(ABOVE)", label: "AVG", rowLabel: "AVERAGE (AVG)" },
                { expr: "=COUNT(ABOVE)", label: "COUNT", rowLabel: "ITEM COUNT (COUNT)" },
                { expr: "=MIN(ABOVE)", label: "MIN", rowLabel: "MINIMUM (MIN)" },
                { expr: "=MAX(ABOVE)", label: "MAX", rowLabel: "MAXIMUM (MAX)" },
              ].map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    applyQuickFormula(f.expr, f.rowLabel);
                  }}
                  title={
                    lastFocusedCell
                      ? isId
                        ? `Masukkan ${f.expr} ke sel aktif`
                        : `Insert ${f.expr} into active cell`
                      : isId
                      ? `Tambah baris kalkulasi ${f.expr}`
                      : `Append ${f.expr} summary row`
                  }
                  className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-stone-900 text-white hover:bg-stone-800 cursor-pointer transition-colors"
                >
                  ={f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    /* --- 8. METADATA GRID --- */
    case "METADATA_GRID":
    case "metadata":
      return (
        <div className="space-y-2 w-full">
          <InlineInput
            editable={editable}
            value={block.title || ""}
            onChange={(v) => onUpdate({ title: v })}
            onFocus={onSelectBlock}
            placeholder={isId ? "Judul grid (opsional)" : "Grid title (optional)"}
            className={cn("font-bold text-stone-900 text-xs", alignClass)}
          />
          <div className="grid grid-cols-2 gap-2 text-xs">
            {normalizedMetaList.map((m, mIdx) => (
              <div
                key={mIdx}
                className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl flex items-center gap-2 group/meta"
              >
                <InlineInput
                  editable={editable}
                  value={m.key}
                  onChange={(v) => updateMeta(mIdx, "key", v)}
                  onFocus={onSelectBlock}
                  placeholder={isId ? "Label" : "Key"}
                  className="font-bold text-stone-600 w-28 shrink-0"
                />
                <InlineInput
                  editable={editable}
                  value={m.value}
                  onChange={(v) => updateMeta(mIdx, "value", v)}
                  onFocus={onSelectBlock}
                  placeholder={isId ? "Nilai" : "Value"}
                  className="font-mono font-bold text-stone-900 flex-1 text-right"
                />
                {editable && isSelected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMeta(mIdx);
                    }}
                    className="opacity-0 group-hover/meta:opacity-100 text-stone-300 hover:text-rose-500 cursor-pointer shrink-0 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {editable && isSelected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                addMeta();
              }}
              className="text-[10px] font-bold text-stone-900 hover:text-stone-700 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              {isId ? "Tambah metadata" : "Add metadata"}
            </button>
          )}
        </div>
      );

    /* --- 9. SIGNATURE COLUMN / STAMP --- */
    case "SIGNATURE_COLUMN":
    case "SIGNATURE_STAMP":
    case "signature": {
      const targetDeptKey = block.targetDepartment || "HR";
      const deptCfg =
        DEPARTMENT_ROUTING_CONFIG[targetDeptKey] ||
        DEPARTMENT_ROUTING_CONFIG.HR;
      const roleTier = extractTierFromRole(block.targetRole, targetDeptKey);
      const effectiveRef = documentCode || documentId || `DOC/ERP/${new Date().getFullYear()}`;
      return (
        <div className="mt-6 pt-3 border-t border-stone-200">
          <div className={cn("flex", flexRowJustifyClass)}>
            <div className="w-64 text-center">
              <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
                Authorized By
              </div>
              <InlineInput
                editable={editable}
                value={block.signatoryTitle || deptCfg.signatoryTitleEn}
                onChange={(v) => onUpdate({ signatoryTitle: v })}
                onFocus={onSelectBlock}
                placeholder="Signatory title"
                className="text-[10px] text-stone-500 uppercase font-bold mb-1 text-center"
              />
              <div className="h-12 flex items-center justify-center my-1">
                {isApproved ? (
                  <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg shadow-2xs">
                    <QRCodeSVG
                      value={`https://fhtbs-erp.shared/auth/${effectiveRef}/${targetDeptKey}/${block.signatoryName || "( Officer Name )"}`}
                      size={22}
                      fgColor="#059669"
                    />
                    <div className="text-left">
                      <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                        Authorized & Verified
                      </div>
                      <div className="text-[8px] font-mono text-emerald-700 leading-none">
                        {targetDeptKey} • {roleTier}
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
                <InlineInput
                  editable={editable}
                  value={block.signatoryName || ""}
                  onChange={(v) => onUpdate({ signatoryName: v })}
                  onFocus={onSelectBlock}
                  placeholder="( Officer Name )"
                  className="text-center uppercase"
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    /* --- 10. DUAL SIGNATURE --- */
    case "DUAL_SIGNATURE": {
      const targetDeptKey = block.targetDepartment || "HR";
      const deptCfg =
        DEPARTMENT_ROUTING_CONFIG[targetDeptKey] ||
        DEPARTMENT_ROUTING_CONFIG.HR;
      const roleTier = extractTierFromRole(block.targetRole, targetDeptKey);
      const effectiveRef = documentCode || documentId || `DOC/ERP/${new Date().getFullYear()}`;
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
              {department || "General"} Officer
            </div>
          </div>

          <div>
            <div className="text-xs font-black uppercase tracking-wider text-stone-900 mb-0.5">
              Authorized By
            </div>
            <InlineInput
              editable={editable}
              value={block.signatoryTitle || deptCfg.signatoryTitleEn}
              onChange={(v) => onUpdate({ signatoryTitle: v })}
              onFocus={onSelectBlock}
              placeholder="Signatory title"
              className="text-[10px] text-stone-500 uppercase font-bold mb-1 text-center"
            />
            <div className="h-12 flex items-center justify-center my-1">
              {isApproved ? (
                <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-lg shadow-2xs">
                  <QRCodeSVG
                    value={`https://fhtbs-erp.shared/auth/${effectiveRef}/${targetDeptKey}/${block.signatoryName || "( Officer Name )"}`}
                    size={22}
                    fgColor="#059669"
                  />
                  <div className="text-left">
                    <div className="text-[9px] font-black text-emerald-800 uppercase leading-none mb-0.5">
                      Authorized & Verified
                    </div>
                    <div className="text-[8px] font-mono text-emerald-700 leading-none">
                      {targetDeptKey} • {roleTier}
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
              <InlineInput
                editable={editable}
                value={block.signatoryName || ""}
                onChange={(v) => onUpdate({ signatoryName: v })}
                onFocus={onSelectBlock}
                placeholder="( Officer Name )"
                className="text-center uppercase"
              />
            </div>
          </div>
        </div>
      );
    }

    /* ---------- 12. ERP FOOTER TEMPLATES ---------- */
    case "FOOTER":
    case "FOOTER_BLOCK": {
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
      const refDisplay = documentCode || documentId || `DOC/ERP/${new Date().getFullYear()}`;

      if (variant === "BANK_PAYMENT") {
        return (
          <div className="w-full pt-3 border-t-2 border-black z-20 bg-white shrink-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 text-[10px] text-stone-700">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="font-bold text-black uppercase tracking-wide flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-black shrink-0" />
                  <span>OFFICIAL CORPORATE BANK ACCOUNT & PAYMENT INSTRUCTIONS</span>
                </div>
                <InlineInput
                  editable={editable}
                  value={leftVal}
                  onChange={(v) => onUpdate({ footerLeftText: v, title: v })}
                  onFocus={onSelectBlock}
                  placeholder="Bank Details & Account Number..."
                  className="font-bold text-black uppercase tracking-wide text-[10px]"
                />
                <div className="text-[9px] text-stone-500 uppercase tracking-wide leading-tight">
                  Official system registry reference: {refDisplay}. Please include Document Reference on bank transfer receipt.
                </div>
              </div>
              <div className="text-right shrink-0 w-48">
                <InlineInput
                  editable={editable}
                  value={rightVal}
                  onChange={(v) => onUpdate({ footerRightText: v, content: v })}
                  onFocus={onSelectBlock}
                  placeholder="FINANCE CONTROL"
                  className="text-[10px] text-black block font-bold uppercase tracking-wide text-right"
                />
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
                <InlineInput
                  editable={editable}
                  value={leftVal}
                  onChange={(v) => onUpdate({ footerLeftText: v, title: v })}
                  onFocus={onSelectBlock}
                  className="font-bold text-black uppercase tracking-wide text-center text-[10px]"
                />
              </div>
              <div className="text-right">
                <span className="text-stone-500 block uppercase text-[9px] tracking-wide">DISTRIBUTION</span>
                <InlineInput
                  editable={editable}
                  value={rightVal}
                  onChange={(v) => onUpdate({ footerRightText: v, content: v })}
                  onFocus={onSelectBlock}
                  className="font-bold text-black uppercase tracking-wide text-right text-[10px]"
                />
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
                <InlineInput
                  editable={editable}
                  value={leftVal}
                  onChange={(v) => onUpdate({ footerLeftText: v, title: v })}
                  onFocus={onSelectBlock}
                  className="text-stone-500 uppercase tracking-wide text-[9px]"
                />
              </div>
            </div>
            <div className="text-right max-w-[30%] shrink-0 w-48">
              <InlineInput
                editable={editable}
                value={rightVal}
                onChange={(v) => onUpdate({ footerRightText: v, content: v })}
                onFocus={onSelectBlock}
                className="text-right font-bold text-black uppercase tracking-wide text-[10px]"
              />
              <span className="text-[9px] text-stone-500 block uppercase tracking-wide">
                Ref: {refDisplay}
              </span>
            </div>
          </div>
        );
      }

      // ERP_STANDARD (Exact 1:1 match with PrintTemplate.tsx & inline-editable)
      return (
        <div className="w-full pt-3 border-t-2 border-black z-20 bg-white shrink-0">
          <div className="flex justify-between items-end gap-4">
            <div className="max-w-[70%] flex-1 min-w-0">
              <InlineInput
                editable={editable}
                value={leftVal}
                onChange={(v) => onUpdate({ footerLeftText: v, title: v })}
                onFocus={onSelectBlock}
                className="text-[10px] text-black font-bold uppercase tracking-wide leading-tight mb-1"
              />
              <div className="text-[9px] text-stone-500 uppercase tracking-wide leading-tight">
                Official system registry reference: {refDisplay}.
              </div>
            </div>
            <div className="text-right max-w-[30%] w-56 shrink-0">
              <InlineInput
                editable={editable}
                value={rightVal}
                onChange={(v) => onUpdate({ footerRightText: v, content: v })}
                onFocus={onSelectBlock}
                className="text-[10px] text-black block font-bold uppercase tracking-wide text-right"
              />
              <InlineInput
                editable={editable}
                value={rightSubtitle}
                onChange={(v) => onUpdate({ subtitle: v })}
                onFocus={onSelectBlock}
                className="text-[9px] text-stone-500 block uppercase tracking-wide text-right"
              />
            </div>
          </div>
        </div>
      );
    }

    /* ---------- 13. SECTION DIVIDER ---------- */
    case "DIVIDER":
    case "divider": {
      return (
        <div className="py-2">
          <hr className="border-t-2 border-stone-900" />
        </div>
      );
    }

    /* ---------- 14. PHOTO / IMAGE BLOCK ---------- */
    case "IMAGE":
    case "image": {
      const imgUrl = block.mediaData?.imageUrl || "";
      const captionVal = block.mediaData?.caption ?? block.content ?? "";
      const imgHeightPx = block.mediaData?.heightPx || (typeof block.height === "number" ? block.height : undefined);

      return (
        <div className={cn("w-full flex flex-col gap-2", alignClass)}>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUploadChange}
          />

          {imgUrl ? (
            <div className="relative group/img w-full">
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

              {editable && isSelected && (
                <div
                  className="absolute bottom-2 right-2 flex items-center gap-1 bg-stone-900/90 backdrop-blur-xs text-white px-2 py-1 rounded-lg shadow-lg text-[10px] font-bold z-20 print:hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 cursor-pointer"
                    title={isId ? "Ganti Foto" : "Replace Photo"}
                  >
                    <Upload className="w-3 h-3" />
                    <span>{isId ? "Ganti Foto" : "Replace"}</span>
                  </button>
                  <span className="w-px h-3.5 bg-stone-700 mx-0.5" />
                  {[
                    { label: "50%", w: 360 },
                    { label: "75%", w: 520 },
                    { label: "100%", w: 680 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() =>
                        onUpdate({
                          width: p.w,
                          mediaData: {
                            ...(block.mediaData || { mediaType: "IMAGE" }),
                            widthPx: p.w,
                          },
                        })
                      }
                      className="px-1.5 py-0.5 rounded hover:bg-stone-800 text-stone-200 hover:text-white cursor-pointer font-mono"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectBlock) onSelectBlock();
                if (editable) photoInputRef.current?.click();
              }}
              className={cn(
                "w-full min-h-[180px] rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50/80 transition-colors flex flex-col items-center justify-center p-6 text-center gap-2",
                editable ? "cursor-pointer" : "cursor-default"
              )}
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold text-stone-800">
                {isId ? "Klik untuk Mengunggah Foto Dokumentasi" : "Click to Upload Documentation Photo"}
              </div>
              <div className="text-[10.5px] text-stone-500 max-w-xs">
                {isId
                  ? "Format JPG, PNG, atau WEBP. Ukuran foto dapat di-resize bebas dengan menarik sudut blok."
                  : "Supports JPG, PNG, WEBP. Freely resize by dragging the block corners."}
              </div>
            </div>
          )}

          {/* Inline Photo Caption */}
          {(editable || captionVal) && (
            <InlineInput
              editable={editable}
              value={captionVal}
              onChange={(v) =>
                onUpdate({
                  content: v,
                  mediaData: {
                    ...(block.mediaData || { mediaType: "IMAGE" }),
                    caption: v,
                  },
                })
              }
              onFocus={onSelectBlock}
              placeholder={
                isId
                  ? "Ketik caption / keterangan foto di sini (opsional)…"
                  : "Type photo caption here (optional)…"
              }
              className={cn("text-[11px] italic text-stone-600 font-medium", alignClass)}
            />
          )}
        </div>
      );
    }

    default:
      return null;
  }
}


export function StudioCanvas({ state }: { state: CanvaStudioState }) {
  const {
    isId,
    documentId,
    documentCode,
    docType,
    isApproved,
    department,
    layoutPreset,
    zoomLevel,
    showGrid,
    isEditable,
    scrollRef,
    sheetRef,
    blocksContainerRef,
    alignGuides,
    blocks,
    blocksRef,
    selectedBlockId,
    setSelectedBlockId,
    setQuickInsertIndex,
    insertBlock,
    hoveredBlockId,
    setHoveredBlockId,
    hoveredBlockRect,
    setHoveredBlockRect,
    dragging,
    resizing,
    liveDimensions,
    dragBlockId,
    setDragBlockId,
    dropIndicator,
    setDropIndicator,
    reorderBlock,
    handleStartDrag,
    handleStartResize,
    deleteBlock,
    updateBlock,
    resetBlockPosition,
    moveBlock,
    duplicateBlock,
    handleTableColResizeStart,
    handleTableRowResizeStart,
  } = state;

  const headerBlock = blocks.find((b) => b.type === "HEADER" || b.type === "heading");
  const headerRef = headerBlock?.content
    ? headerBlock.content.replace(/^(NO\.?|REF\.?|NOMOR)\s*[:.]?\s*/i, "").trim()
    : "";
  const effectiveDocCode = documentCode || headerRef || documentId || `DOC/ERP/${new Date().getFullYear()}`;
  const hasFooterBlock = blocks.some((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
  const paperDims = getPaperDimensions(
    layoutPreset,
    (state as any).customWidthMm,
    (state as any).customHeightMm
  );

  return (
        <main
          ref={scrollRef}
          onClick={() => {
            setSelectedBlockId(null);
            setQuickInsertIndex(null);
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(LIB_DRAG_MIME)) e.preventDefault();
          }}
          onDrop={(e) => {
            const key = e.dataTransfer.getData(LIB_DRAG_MIME);
            if (key) {
              e.preventDefault();
              const item = LIBRARY_ITEMS.find((i) => i.key === key);
              if (item) insertBlock(item, null);
            }
          }}
          className="studio-canvas-scroll flex-1 bg-stone-200/70 overflow-auto p-4 sm:p-8 flex justify-center items-start custom-scrollbar bg-[radial-gradient(#d6d3d1_1px,transparent_1px)] [background-size:16px_16px]"
        >
          <div
            ref={sheetRef}
            style={{
              width: `${paperDims.widthPx}px`,
              minHeight: `${paperDims.heightPx}px`,
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: "top center",
              transition: "transform 0.15s ease-out",
            }}
            className={cn(
              "studio-sheet bg-white shadow-xl rounded-xl border border-stone-300 relative print:shadow-none print:border-none z-0 shrink-0 flex flex-col",
              paperDims.paddingClass
            )}
          >
            {/* ERP Standard Diagonal DRAFT Watermark (Matches PrintTemplate.tsx) */}
            {!isApproved && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden rounded-xl">
                <div className="text-[150px] font-black text-stone-900 opacity-[0.03] select-none rotate-[-45deg] tracking-widest uppercase">
                  DRAFT
                </div>
              </div>
            )}

            {/* Grid overlay */}
            {showGrid && isEditable && (
              <div className="absolute inset-0 pointer-events-none rounded-xl overflow-hidden z-0 opacity-40 print:hidden">
                <svg className="w-full h-full" width="100%" height="100%">
                  <defs>
                    <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="1,2" />
                    </pattern>
                    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                      <rect width="50" height="50" fill="url(#smallGrid)" />
                      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#94a3b8" strokeWidth="0.8" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              </div>
            )}

            {/* Blocks flow (coordinate origin for all block offsetLeft/offsetTop & smart alignment guides) */}
            <div
              ref={blocksContainerRef}
              className="flex-1 flex flex-col gap-6 relative z-10 w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Auto Align Guidelines (Smart Magnetic Alignment Guides inside blocksContainerRef coordinate space) */}
              {alignGuides?.vertical && (
                <div
                  className="absolute -top-12 -bottom-12 pointer-events-none z-50 transition-all duration-75"
                  style={{ left: `${alignGuides.vertical.x}px` }}
                >
                  <div className="w-[2px] h-full bg-stone-900 shadow-[0_0_10px_rgba(28,25,23,0.5)]" />
                  <div className="absolute top-3 -translate-x-1/2 bg-stone-900 text-white font-mono text-[10px] font-black px-2.5 py-1 rounded-md shadow-xl flex items-center gap-1.5 whitespace-nowrap z-50 animate-in fade-in zoom-in-95 duration-100">
                    <AlignCenter className="w-3 h-3 text-amber-300" />
                    <span>{alignGuides.vertical.label}</span>
                  </div>
                </div>
              )}
              {alignGuides?.horizontal && (
                <div
                  className="absolute -left-12 -right-12 pointer-events-none z-50 transition-all duration-75"
                  style={{ top: `${alignGuides.horizontal.y}px` }}
                >
                  <div className="h-[2px] w-full bg-stone-900 shadow-[0_0_10px_rgba(28,25,23,0.5)]" />
                  <div className="absolute left-4 -translate-y-1/2 bg-stone-900 text-white font-mono text-[10px] font-black px-2.5 py-1 rounded-md shadow-xl flex items-center gap-1.5 whitespace-nowrap z-50 animate-in fade-in zoom-in-95 duration-100">
                    <AlignCenter className="w-3 h-3 text-amber-300 rotate-90" />
                    <span>{alignGuides.horizontal.label}</span>
                  </div>
                </div>
              )}

              {blocks.map((block, idx) => {
                const isSelected = selectedBlockId === block.id;
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
                  <React.Fragment key={block.id}>
                    {/* Gap quick-insert zone (rendered before body blocks & before footer so footer stays pinned via mt-auto) */}
                    {isEditable && idx >= 1 && (
                      <div className="relative h-4 -my-3 group/gap z-20 flex items-center justify-center">
                        <div className="absolute inset-x-8 top-1/2 h-px bg-blue-300 opacity-0 group-hover/gap:opacity-100 transition-opacity" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuickInsertIndex(idx);
                          }}
                          className="relative opacity-0 group-hover/gap:opacity-100 transition-opacity w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md hover:scale-110 cursor-pointer"
                          title={isId ? "Sisipkan blok di sini" : "Insert block here"}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <div
                      id={`doc-container-${block.id}`}
                      data-block-id={block.id}
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
                      onMouseEnter={(e) => {
                        setHoveredBlockId(block.id);
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredBlockRect({
                          width: Math.round(rect.width),
                          height: Math.round(rect.height),
                        });
                      }}
                      onMouseLeave={() => {
                        if (hoveredBlockId === block.id) {
                          setHoveredBlockId(null);
                          setHoveredBlockRect(null);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditable) setSelectedBlockId(block.id);
                      }}
                      onDragOver={(e) => {
                        if (!isEditable) return;
                        if (dragBlockId || e.dataTransfer.types.includes(LIB_DRAG_MIME)) {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = isFooter ? "before" : e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                          setDropIndicator({ id: block.id, pos });
                        }
                      }}
                      onDragLeave={() => {
                        if (dropIndicator?.id === block.id) setDropIndicator(null);
                      }}
                      onDrop={(e) => {
                        if (!isEditable) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pos = isFooter ? "before" : e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                        const libKey = e.dataTransfer.getData(LIB_DRAG_MIME);
                        if (libKey) {
                          const item = LIBRARY_ITEMS.find((i) => i.key === libKey);
                          if (item) {
                            const targetIdx = blocksRef.current.findIndex((b) => b.id === block.id);
                            insertBlock(item, pos === "before" ? targetIdx : targetIdx + 1);
                          }
                        } else if (dragBlockId) {
                          reorderBlock(dragBlockId, block.id, pos);
                        }
                        setDropIndicator(null);
                        setDragBlockId(null);
                      }}
                      className={cn(
                        "relative group/block transition-shadow rounded-xl",
                        selfAlignClass,
                        isFooter ? "mt-auto pt-8 w-full px-0 py-1" : isKop ? "w-full px-0 py-1" : "p-2",
                        isEditable && isSelected
                          ? "ring-2 ring-blue-500 bg-blue-50/10"
                          : isEditable
                          ? "hover:ring-1 hover:ring-stone-300"
                          : "",
                        isEditable && isKop && "hover:ring-amber-300",
                        dragging && dragging.blockId === block.id && "opacity-90 shadow-2xl ring-2 ring-amber-500 cursor-grabbing z-30"
                      )}
                    >
                      {/* Hover Tooltip Popover */}
                      {isEditable && hoveredBlockId === block.id && !dragging && !resizing && !isSelected && (
                        <div className="absolute -top-8 left-2 bg-stone-900/95 backdrop-blur-md text-white border border-stone-700/80 rounded-lg px-2.5 py-1 text-[10px] font-mono shadow-xl z-40 flex items-center gap-2 pointer-events-none animate-in fade-in duration-100">
                          <span className="font-bold text-amber-400 uppercase tracking-wide">
                            {BLOCK_TYPE_LABELS[block.type] || block.type}
                          </span>
                          <span className="text-stone-500">|</span>
                          <span className="text-stone-300">
                            {hoveredBlockRect ? `${hoveredBlockRect.width}px × ${hoveredBlockRect.height}px` : "Auto"}
                          </span>
                          {block.isLocked && (
                            <>
                              <span className="text-stone-500">|</span>
                              <span className="text-amber-300 font-bold flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5" /> Locked
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Drop indicator lines */}
                      {dropIndicator?.id === block.id && dropIndicator.pos === "before" && (
                        <div className="absolute -top-2 inset-x-0 h-1 bg-blue-500 rounded-full z-40 pointer-events-none" />
                      )}
                      {dropIndicator?.id === block.id && dropIndicator.pos === "after" && (
                        <div className="absolute -bottom-2 inset-x-0 h-1 bg-blue-500 rounded-full z-40 pointer-events-none" />
                      )}

                      {/* Left handles: reorder grip + free move */}
                      {isEditable && isSelected && !isKop && !isFooter && (
                        <div className="absolute -top-3.5 left-2 flex items-center bg-blue-600 text-white rounded-lg shadow-md z-30 text-[10px] font-bold overflow-hidden">
                          <span
                            draggable
                            onDragStart={(e) => {
                              setDragBlockId(block.id);
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", block.id);
                            }}
                            onDragEnd={() => {
                              setDragBlockId(null);
                              setDropIndicator(null);
                            }}
                            className="flex items-center gap-1 px-2 py-1 hover:bg-blue-700 cursor-grab active:cursor-grabbing"
                            title={isId ? "Seret untuk mengubah urutan blok" : "Drag to reorder block"}
                          >
                            <GripVertical className="w-3 h-3 text-blue-200" />
                            <span className="hidden sm:inline">{isId ? "Urutkan" : "Reorder"}</span>
                          </span>
                          <span className="w-px h-4 bg-blue-500" />
                          <span
                            onMouseDown={(e) => handleStartDrag(e, block.id)}
                            className="flex items-center gap-1 px-2 py-1 hover:bg-blue-700 cursor-grab active:cursor-grabbing"
                            title={isId ? "Tahan & geser untuk posisi bebas" : "Hold & drag for free positioning"}
                          >
                            <Move className="w-3 h-3 text-amber-300" />
                            <span className="hidden sm:inline">{isId ? "Geser" : "Move"}</span>
                            {isMoved && (
                              <span className="font-mono text-[9px] text-blue-200 bg-blue-800/80 px-1 rounded">
                                ({block.x || 0}, {block.y || 0})
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      {/* Pinned bottom badge for Footer */}
                      {isEditable && isSelected && isFooter && (
                        <div className="absolute -top-3.5 left-2 flex items-center gap-1.5 bg-stone-900 text-amber-400 rounded-lg px-2.5 py-1 shadow-md z-30 text-[10px] font-bold">
                          <Lock className="w-3 h-3" />
                          <span>{isId ? "Footer Otomatis di Bawah (Rata Header)" : "Auto-Pinned Bottom Footer"}</span>
                        </div>
                      )}

                      {/* Live drag tooltip */}
                      {dragging && dragging.blockId === block.id && (
                        <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-blue-900 text-white text-[10px] font-mono px-2.5 py-1 rounded-md shadow-xl z-50 flex items-center gap-1.5 pointer-events-none">
                          <Move className="w-3 h-3 text-amber-300" />
                          <span>
                            X: {block.x || 0}px, Y: {block.y || 0}px {showGrid ? "(snap)" : ""}
                          </span>
                        </div>
                      )}

                      {/* Right floating toolbar with quick text & block alignment */}
                      {isEditable && isSelected && (
                        <div className="absolute -top-3.5 right-2 flex items-center gap-0.5 bg-stone-900 text-white rounded-lg px-1.5 py-0.5 shadow-md z-30 text-[10px] font-bold">
                          {isKop ? (
                            <span className="text-amber-400 flex items-center gap-1 px-1">
                              <Lock className="w-3 h-3" />
                              <span>{isId ? "Kop Resmi Terkunci" : "Official Letterhead Locked"}</span>
                            </span>
                          ) : isFooter ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBlock(block.id);
                              }}
                              className="p-1 hover:bg-rose-600 rounded text-rose-300 hover:text-white cursor-pointer flex items-center gap-1"
                              title={isId ? "Hapus Footer" : "Delete Footer"}
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>{isId ? "Hapus" : "Remove"}</span>
                            </button>
                          ) : (
                            <>
                              <span className="text-stone-400 font-mono px-1">#{idx + 1}</span>
                              {(
                                [
                                  { v: "LEFT", icon: AlignLeft, label: isId ? "Rata Kiri" : "Align Left" },
                                  { v: "CENTER", icon: AlignCenter, label: isId ? "Rata Tengah" : "Align Center" },
                                  { v: "RIGHT", icon: AlignRight, label: isId ? "Rata Kanan" : "Align Right" },
                                  { v: "JUSTIFY", icon: AlignJustify, label: isId ? "Rata Kiri-Kanan" : "Justify" },
                                ] as const
                              ).map(({ v, icon: AIcon, label }) => {
                                const curA = normalizeHorizontalAlign(
                                  block.alignment || block.align,
                                  block.type === "HEADER"
                                    ? "CENTER"
                                    : block.type === "SIGNATURE_COLUMN" || block.type === "SIGNATURE_STAMP"
                                    ? "RIGHT"
                                    : "LEFT"
                                );
                                return (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateBlock(block.id, { alignment: v });
                                    }}
                                    className={cn(
                                      "p-1 rounded cursor-pointer transition-colors",
                                      curA === v
                                        ? "bg-white text-stone-900"
                                        : "text-stone-300 hover:bg-stone-800 hover:text-white"
                                    )}
                                    title={label}
                                  >
                                    <AIcon className="w-3 h-3" />
                                  </button>
                                );
                              })}
                              <span className="w-px h-3.5 bg-stone-700 mx-0.5" />
                              {isMoved && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    resetBlockPosition(block.id);
                                  }}
                                  className="p-1 hover:bg-stone-800 text-amber-300 hover:text-white rounded cursor-pointer"
                                  title={isId ? "Reset posisi ke alur dokumen (0, 0)" : "Reset position to flow (0, 0)"}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveBlock(block.id, "UP");
                                }}
                                disabled={idx <= 1}
                                className="p-1 hover:bg-stone-800 disabled:opacity-30 rounded cursor-pointer"
                                title={isId ? "Pindah ke atas" : "Move up"}
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveBlock(block.id, "DOWN");
                                }}
                                disabled={idx === blocks.length - 1}
                                className="p-1 hover:bg-stone-800 disabled:opacity-30 rounded cursor-pointer"
                                title={isId ? "Pindah ke bawah" : "Move down"}
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicateBlock(block.id);
                                }}
                                className="p-1 hover:bg-stone-800 rounded cursor-pointer"
                                title={isId ? "Duplikat (Ctrl+D)" : "Duplicate (Ctrl+D)"}
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteBlock(block.id);
                                }}
                                className="p-1 hover:bg-rose-600 rounded text-rose-300 hover:text-white cursor-pointer"
                                title={isId ? "Hapus (Delete)" : "Delete (Del)"}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Resize handles */}
                      {isEditable && isSelected && !isKop && !isFooter && (
                        <>
                          <div
                            onMouseDown={(e) => handleStartResize(e, block.id, "se")}
                            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-blue-600 border-2 border-white rounded-xs shadow-md cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                            title={isId ? "Tahan & geser untuk ubah ukuran" : "Hold & drag to resize"}
                          />
                          <div
                            onMouseDown={(e) => handleStartResize(e, block.id, "s")}
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-2 bg-blue-500/80 border border-white rounded-full shadow-2xs cursor-ns-resize z-40 hover:bg-blue-600 transition-colors"
                          />
                          <div
                            onMouseDown={(e) => handleStartResize(e, block.id, "e")}
                            className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-8 bg-blue-500/80 border border-white rounded-full shadow-2xs cursor-ew-resize z-40 hover:bg-blue-600 transition-colors"
                          />
                          {resizing && resizing.blockId === block.id && liveDimensions && (
                            <div className="absolute -bottom-8 right-0 bg-stone-900/90 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-lg z-50 pointer-events-none">
                              {liveDimensions.width}px × {liveDimensions.height}px
                            </div>
                          )}
                        </>
                      )}

                      {/* Block body */}
                      <BlockContent
                        block={block}
                        editable={isEditable && !isKop}
                        isId={isId}
                        documentId={documentId}
                        documentCode={effectiveDocCode}
                        docType={docType}
                        isApproved={isApproved}
                        department={department}
                        isSelected={isSelected}
                        onUpdate={(updates) => updateBlock(block.id, updates)}
                        onSelectBlock={() => setSelectedBlockId(block.id)}
                        onTableColResizeStart={handleTableColResizeStart}
                        onTableRowResizeStart={handleTableRowResizeStart}
                      />
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Trailing quick-insert + Automatic ERP Standard Footer when no explicit FOOTER block is present */}
              {!hasFooterBlock && (
                <>
                  {isEditable && blocks.length > 0 && (
                    <div className="relative h-4 -my-3 group/gap z-20 flex items-center justify-center">
                      <div className="absolute inset-x-8 top-1/2 h-px bg-blue-300 opacity-0 group-hover/gap:opacity-100 transition-opacity" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuickInsertIndex(blocks.length);
                        }}
                        className="relative opacity-0 group-hover/gap:opacity-100 transition-opacity w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md hover:scale-110 cursor-pointer"
                        title={isId ? "Sisipkan blok di akhir" : "Insert block at end"}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="mt-auto pt-8 w-full px-0 py-1 relative">
                    <BlockContent
                      block={{
                        id: "auto-erp-footer",
                        type: "FOOTER",
                        category: "FOOTER_TEMPLATE",
                        footerVariant: "ERP_STANDARD",
                        footerLeftText: isApproved
                          ? "This document has been digitally authorized and computationally verified. Legally valid with system verification."
                          : "This document is computationally issued and validated. Valid without physical signature.",
                        footerRightText: docType ? docType.replace(/_/g, " ") : "OFFICIAL ERP DOCUMENT",
                        subtitle: "OFFICIAL WORKSPACE DOCUMENT",
                      }}
                      editable={false}
                      isId={isId}
                      documentId={documentId}
                      documentCode={effectiveDocCode}
                      docType={docType}
                      isApproved={isApproved}
                      department={department}
                      isSelected={false}
                      onUpdate={() => {}}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
  );
}
