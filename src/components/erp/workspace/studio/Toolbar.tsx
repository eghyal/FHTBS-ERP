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
  LIBRARY_ITEMS,
  buildBlock,
  readAndCompressImageFile,
  PAPER_FORMAT_OPTIONS,
  extractTierFromRole,
  SignatureApprovalTier,
} from "./config";
import type { CanvaStudioState } from "./useStudioState";
import type { StudioExportHandlers } from "./ExportEngine";
import {
  VerticalAlignTopIcon,
  VerticalAlignCenterIcon,
  VerticalAlignBottomIcon,
} from "./StudioIcons";

interface FloatingTextToolbarProps {
  isId: boolean;
  x: number;
  y: number;
  selectedText: string;
  selectedBlock?: DocBlock | null;
  targetInput?: HTMLInputElement | HTMLTextAreaElement | null;
  onApplyStyle: (patch: Partial<DocBlock>) => void;
  onWrapText: (prefix: string, suffix: string) => void;
  onTransformCase: () => void;
  onClose: () => void;
}

function FloatingTextToolbar({
  isId,
  x,
  y,
  selectedText: _selectedText,
  selectedBlock,
  targetInput,
  onApplyStyle,
  onWrapText,
  onTransformCase,
  onClose,
}: FloatingTextToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);

  const colors = [
    { label: isId ? "Hitam" : "Black", value: "#18181b" },
    { label: isId ? "Abu-abu" : "Slate", value: "#475569" },
    { label: isId ? "Biru" : "Blue", value: "#2563eb" },
    { label: isId ? "Hijau" : "Emerald", value: "#059669" },
    { label: isId ? "Kuning" : "Amber", value: "#d97706" },
    { label: isId ? "Merah" : "Rose", value: "#e11d48" },
  ];

  const highlights = [
    { label: isId ? "Tanpa Sorotan" : "None", value: "" },
    { label: isId ? "Kuning Cerah" : "Yellow", value: "#fef08a" },
    { label: isId ? "Biru Muda" : "Cyan", value: "#bae6fd" },
    { label: isId ? "Hijau Muda" : "Green", value: "#bbf7d0" },
    { label: isId ? "Merah Muda" : "Pink", value: "#fecdd3" },
  ];

  const fontSizes = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28];
  const currentFontSize = selectedBlock?.fontSize || 12;

  return (
    <div
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: y < 70 ? "translate(-50%, 10px)" : "translate(-50%, -100%)",
      }}
      className="fixed z-[999] bg-stone-900/95 backdrop-blur-md text-white border border-stone-700/80 rounded-2xl shadow-2xl px-2 py-1.5 flex items-center gap-1 select-none animate-in fade-in zoom-in-95 duration-150"
      onMouseDown={(e) => {
        // Prevent stealing focus from input or deselecting text
        e.preventDefault();
      }}
    >
      {/* Pointer arrow */}
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-stone-900/95 border-stone-700/80 rotate-45 pointer-events-none",
          y < 70 ? "-top-1.5 border-t border-l" : "-bottom-1.5 border-b border-r"
        )}
      />

      {/* 1. Styling Group: Bold, Italic, Underline, Strikethrough */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            if (selectedBlock) onApplyStyle({ isBold: !selectedBlock.isBold });
          }}
          title={isId ? "Tebal (Bold)" : "Bold"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.isBold ? "bg-blue-600 text-white font-black" : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <Bold className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (selectedBlock) onApplyStyle({ isItalic: !selectedBlock.isItalic });
          }}
          title={isId ? "Miring (Italic)" : "Italic"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.isItalic ? "bg-blue-600 text-white" : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <Italic className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (selectedBlock) onApplyStyle({ isUnderline: !selectedBlock.isUnderline });
          }}
          title={isId ? "Garis Bawah (Underline)" : "Underline"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.isUnderline ? "bg-blue-600 text-white" : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <Underline className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (selectedBlock) onApplyStyle({ isStrikethrough: !selectedBlock.isStrikethrough });
          }}
          title={isId ? "Coret (Strikethrough)" : "Strikethrough"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.isStrikethrough ? "bg-blue-600 text-white" : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-stone-700 mx-0.5" />

      {/* 2. Text Alignment Group */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onApplyStyle({ alignment: "LEFT" })}
          title={isId ? "Rata Kiri" : "Align Left"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            (selectedBlock?.alignment || "LEFT") === "LEFT"
              ? "bg-stone-800 text-blue-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ alignment: "CENTER" })}
          title={isId ? "Rata Tengah" : "Center"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.alignment === "CENTER"
              ? "bg-stone-800 text-blue-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ alignment: "RIGHT" })}
          title={isId ? "Rata Kanan" : "Align Right"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.alignment === "RIGHT"
              ? "bg-stone-800 text-blue-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ alignment: "JUSTIFY" })}
          title={isId ? "Rata Kiri-Kanan (Justify)" : "Justify"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.alignment === "JUSTIFY"
              ? "bg-stone-800 text-blue-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-stone-700 mx-0.5" />

      {/* 2b. Vertical Alignment Group */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onApplyStyle({ verticalAlignment: "TOP" })}
          title={isId ? "Rata Atas (Vertical Top)" : "Vertical Top"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            (selectedBlock?.verticalAlignment || "TOP") === "TOP"
              ? "bg-stone-800 text-amber-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <VerticalAlignTopIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ verticalAlignment: "MIDDLE" })}
          title={isId ? "Rata Tengah Vertikal (Vertical Middle)" : "Vertical Middle"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.verticalAlignment === "MIDDLE"
              ? "bg-stone-800 text-amber-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <VerticalAlignCenterIcon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ verticalAlignment: "BOTTOM" })}
          title={isId ? "Rata Bawah (Vertical Bottom)" : "Vertical Bottom"}
          className={cn(
            "p-1.5 rounded-lg transition-colors cursor-pointer",
            selectedBlock?.verticalAlignment === "BOTTOM"
              ? "bg-stone-800 text-amber-400 font-bold"
              : "text-stone-300 hover:text-white hover:bg-stone-800"
          )}
        >
          <VerticalAlignBottomIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-px h-4 bg-stone-700 mx-0.5" />

      {/* 3. Sizing (Memperbesar / Memperkecil Teks) */}
      <div className="relative flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onApplyStyle({ fontSize: Math.max(9, currentFontSize - 1) })}
          title={isId ? "Perkecil Teks (-1px)" : "Decrease font size"}
          className="p-1 rounded-md text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer"
        >
          <Minus className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => setShowSizeDropdown((v) => !v)}
          title={isId ? "Pilih Ukuran Font" : "Choose font size"}
          className="font-mono text-[11px] font-bold text-stone-200 px-1.5 py-0.5 hover:bg-stone-800 rounded cursor-pointer"
        >
          {currentFontSize}px
        </button>
        <button
          type="button"
          onClick={() => onApplyStyle({ fontSize: Math.min(48, currentFontSize + 1) })}
          title={isId ? "Perbesar Teks (+1px)" : "Increase font size"}
          className="p-1 rounded-md text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer"
        >
          <Plus className="w-3 h-3" />
        </button>

        {showSizeDropdown && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-stone-800 border border-stone-700 rounded-xl shadow-xl py-1 px-1 flex flex-col gap-0.5 z-50">
            {fontSizes.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => {
                  onApplyStyle({ fontSize: sz });
                  setShowSizeDropdown(false);
                }}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-mono rounded hover:bg-stone-700 text-left cursor-pointer",
                  currentFontSize === sz ? "text-blue-400 font-bold bg-stone-700/60" : "text-stone-300"
                )}
              >
                {sz}px
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-stone-700 mx-0.5" />

      {/* 4. Text Color & Highlight */}
      <div className="relative flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            setShowColorPicker((v) => !v);
            setShowHighlightPicker(false);
          }}
          title={isId ? "Warna Teks" : "Text Color"}
          className="p-1.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer relative"
        >
          <Palette className="w-3.5 h-3.5" />
          {selectedBlock?.textColor && (
            <span
              className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full border border-stone-900"
              style={{ backgroundColor: selectedBlock.textColor }}
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowHighlightPicker((v) => !v);
            setShowColorPicker(false);
          }}
          title={isId ? "Sorotan Latar (Highlight)" : "Text Highlight"}
          className="p-1.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer relative"
        >
          <Highlighter className="w-3.5 h-3.5" />
          {selectedBlock?.highlightColor && (
            <span
              className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full border border-stone-900"
              style={{ backgroundColor: selectedBlock.highlightColor }}
            />
          )}
        </button>

        {showColorPicker && (
          <div className="absolute top-full right-0 mt-1.5 bg-stone-800 border border-stone-700 rounded-xl shadow-xl p-1.5 flex items-center gap-1.5 z-50">
            {colors.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  onApplyStyle({ textColor: c.value });
                  setShowColorPicker(false);
                }}
                title={c.label}
                className="w-4 h-4 rounded-full border border-stone-600 hover:scale-125 transition-transform cursor-pointer"
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        )}

        {showHighlightPicker && (
          <div className="absolute top-full right-0 mt-1.5 bg-stone-800 border border-stone-700 rounded-xl shadow-xl p-1.5 flex items-center gap-1.5 z-50">
            {highlights.map((h) => (
              <button
                key={h.value || "none"}
                type="button"
                onClick={() => {
                  onApplyStyle({ highlightColor: h.value });
                  setShowHighlightPicker(false);
                }}
                title={h.label}
                className="w-4 h-4 rounded-full border border-stone-600 hover:scale-125 transition-transform cursor-pointer flex items-center justify-center text-[9px]"
                style={{ backgroundColor: h.value || "#292524" }}
              >
                {!h.value && <X className="w-2.5 h-2.5 text-stone-400" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-stone-700 mx-0.5" />

      {/* 5. Transform Case & Close */}
      <button
        type="button"
        onClick={onTransformCase}
        title={isId ? "Ubah Huruf Besar/Kecil (Case)" : "Toggle Text Case"}
        className="p-1.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 cursor-pointer"
      >
        <CaseSensitive className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={onClose}
        title={isId ? "Tutup Toolbar" : "Close toolbar"}
        className="p-1 text-stone-400 hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export function StudioToolbar({
  state,
  exportHandlers,
}: {
  state: CanvaStudioState;
  exportHandlers: StudioExportHandlers;
}) {
  const {
    isId,
    requestClose,
    dirty,
    setShowLeftPanel,
    docTitle,
    setDocTitle,
    setDirty,
    layoutPreset,
    setLayoutPreset,
    customWidthMm,
    setCustomWidthMm,
    customHeightMm,
    setCustomHeightMm,
    viewMode,
    setViewMode,
    setSelectedBlockId,
    setQuickInsertIndex,
    isEditable,
    targetAuthDept,
    targetAuthRole,
    isHrFallbackRoute,
    handleChangeTargetDepartment,
    handleChangeTargetRole,
    activeDeptConfig,
    undo,
    past,
    redo,
    future,
    docxInputRef,
    isApproved,
    isExportingPdf,
    onClone,
    handleSave,
    isSaving,
    setShowRightPanel,
    insertBlock,
    blocks,
    blocksRef,
    applyBlocks,
    department,
    selectedBlock,
    updateBlock,
    notify,
  } = state;
  const { handleImportDocx, handleExportDocx, handleExportPdf } = exportHandlers;

  const [openMenu, setOpenMenu] = useState<
    "text" | "address" | "signature" | "footer" | null
  >(null);
  const ribbonPhotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenu]);

  const handleQuickInsertByKey = (itemKey: string) => {
    const item = LIBRARY_ITEMS.find((i) => i.key === itemKey);
    if (item) {
      insertBlock(item, null);
    }
    setOpenMenu(null);
  };

  const handleRibbonPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { dataUrl, width } = await readAndCompressImageFile(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();

      // If an IMAGE block is currently selected, update its photo directly
      if (selectedBlock && selectedBlock.type === "IMAGE") {
        updateBlock(selectedBlock.id, {
          width,
          mediaData: {
            ...(selectedBlock.mediaData || { mediaType: "IMAGE" }),
            mediaType: "IMAGE",
            imageUrl: dataUrl,
            widthPx: width,
            caption:
              selectedBlock.mediaData?.caption ||
              cleanName ||
              "Visual Documentation",
          },
        });
        notify(`Photo "${file.name}" updated.`, "success");
        return;
      }

      // Otherwise create & insert a new IMAGE block with the uploaded photo
      const newPhotoBlock = buildBlock("IMAGE", isId, department, targetAuthDept, "IMAGE");
      newPhotoBlock.width = width;
      newPhotoBlock.alignment = "CENTER";
      newPhotoBlock.mediaData = {
        mediaType: "IMAGE",
        imageUrl: dataUrl,
        widthPx: width,
        caption: cleanName
          ? `Documentation: ${cleanName}`
          : "Photo Caption / Field Documentation",
      };

      const current = blocksRef.current;
      const footerIdx = current.findIndex((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
      const maxInsertIdx = footerIdx >= 0 ? footerIdx : current.length;
      const selIdx = selectedBlock ? current.findIndex((b) => b.id === selectedBlock.id) : -1;
      const insertIdx = selIdx >= 0 ? Math.min(selIdx + 1, maxInsertIdx) : maxInsertIdx;

      const next = [...current.slice(0, insertIdx), newPhotoBlock, ...current.slice(insertIdx)];
      applyBlocks(next);
      setSelectedBlockId(newPhotoBlock.id);
      notify(`Photo "${file.name}" added to document.`, "success");
    } catch {
      notify("Failed to load image file.", "error");
    }
  };

  const currentRoleTier = extractTierFromRole(targetAuthRole, targetAuthDept);

  return (
    <div className="shrink-0 z-20 bg-white border-b border-stone-200">
      {/* Row 1: Main Studio Header */}
      <header className="h-14 px-3 sm:px-4 flex items-center justify-between gap-3">
        {/* Left Zone: Close + Document Title + Save Status */}
        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-md">
          <button
            type="button"
            onClick={requestClose}
            className="p-2 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer relative shrink-0"
            title="Close Studio"
          >
            <X className="w-4 h-4" />
            {dirty && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500" />}
          </button>

          <button
            type="button"
            onClick={() => setShowLeftPanel(true)}
            className="lg:hidden p-2 rounded-xl text-stone-500 hover:bg-stone-100 cursor-pointer shrink-0"
            title="Open Block Library"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-stone-200 hidden sm:block shrink-0" />

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <input
              type="text"
              value={docTitle}
              onChange={(e) => {
                setDocTitle(e.target.value);
                setDirty(true);
              }}
              placeholder="Document Title…"
              className="text-xs sm:text-sm font-bold text-stone-900 bg-stone-50/70 hover:bg-stone-100 focus:bg-white border border-stone-200/80 focus:border-stone-900 rounded-lg px-2.5 py-1.5 outline-none transition-all truncate w-full"
            />
            <span
              className={cn(
                "hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border shrink-0",
                dirty
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-stone-100 text-stone-700 border-stone-200"
              )}
            >
              {dirty ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>Unsaved</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>Saved</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Center Zone: Paper Size + Custom Dimensions + Edit/Preview Toggle + Live Routing Preview Badge */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <select
            value={layoutPreset}
            onChange={(e) => {
              setLayoutPreset(e.target.value as LayoutPreset);
              setDirty(true);
            }}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-stone-800 outline-none focus:border-stone-900 cursor-pointer"
            title="Paper Format"
          >
            {PAPER_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {layoutPreset === "CUSTOM" && (
            <div className="flex items-center gap-1 bg-stone-100 px-2 py-1 rounded-lg border border-stone-200 text-[10px] font-mono">
              <input
                type="number"
                min={60}
                max={600}
                value={customWidthMm}
                onChange={(e) => {
                  setCustomWidthMm(Math.max(60, Math.min(600, Number(e.target.value) || 210)));
                  setDirty(true);
                }}
                className="w-12 px-1 py-0.5 bg-white border border-stone-300 rounded text-center font-bold text-stone-900"
                title="Custom Width (mm)"
              />
              <span className="text-stone-400">×</span>
              <input
                type="number"
                min={80}
                max={840}
                value={customHeightMm}
                onChange={(e) => {
                  setCustomHeightMm(Math.max(80, Math.min(840, Number(e.target.value) || 297)));
                  setDirty(true);
                }}
                className="w-12 px-1 py-0.5 bg-white border border-stone-300 rounded text-center font-bold text-stone-900"
                title="Custom Height (mm)"
              />
              <span className="text-stone-500 font-sans font-bold">mm</span>
            </div>
          )}

          <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer",
                viewMode === "edit" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-500 hover:text-stone-900"
              )}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("preview");
                setSelectedBlockId(null);
                setQuickInsertIndex(null);
              }}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer",
                viewMode === "preview" ? "bg-stone-900 text-white shadow-2xs" : "text-stone-500 hover:text-stone-900"
              )}
            >
              <Eye className="w-3 h-3" />
              <span>Preview</span>
            </button>
          </div>

          <div
            className={cn(
              "hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] shrink-0",
              isHrFallbackRoute
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-stone-100 border-stone-200 text-stone-900"
            )}
            title={
              isHrFallbackRoute
                ? "No signature block inserted — automatically routes to Human Resource (HR)"
                : `Signature-driven routing to ${targetAuthDept} (${currentRoleTier})`
            }
          >
            <ShieldCheck
              className={cn(
                "w-3.5 h-3.5 shrink-0",
                isHrFallbackRoute ? "text-amber-600" : "text-stone-700"
              )}
            />
            {isHrFallbackRoute ? (
              <span className="font-bold text-amber-900">
                Auto-Route: HR (No Signature)
              </span>
            ) : isEditable ? (
              <div className="flex items-center gap-1">
                <span className="text-stone-500">Route:</span>
                <select
                  value={targetAuthDept}
                  onChange={(e) => handleChangeTargetDepartment(e.target.value as TargetDepartment)}
                  className="font-bold text-stone-900 bg-transparent outline-none cursor-pointer"
                  title="Select Target Authorization Department"
                >
                  {ERP_DEPARTMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {targetAuthDept !== "FC" && (
                  <>
                    <span className="text-stone-400">•</span>
                    <select
                      value={currentRoleTier}
                      onChange={(e) => handleChangeTargetRole(e.target.value as SignatureApprovalTier)}
                      className="font-bold text-stone-700 bg-transparent outline-none cursor-pointer text-[10px]"
                      title="Select Target Approval Role Tier"
                    >
                      <option value="SUPERVISOR">Supervisor</option>
                      <option value="MANAGER">Manager</option>
                      <option value="FC">FC</option>
                    </select>
                  </>
                )}
              </div>
            ) : (
              <span className="font-bold text-stone-900">
                {activeDeptConfig.deptNameEn} ({currentRoleTier})
              </span>
            )}
          </div>
        </div>

        {/* Right Zone: Undo/Redo + File Actions (DOCX/PDF/Print) + Save Draft & Submit */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Undo / Redo */}
          <div className="hidden sm:flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={undo}
              disabled={past.length === 0}
              className="p-1.5 rounded-md text-stone-600 hover:bg-white hover:text-stone-900 disabled:opacity-30 cursor-pointer transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={future.length === 0}
              className="p-1.5 rounded-md text-stone-600 hover:bg-white hover:text-stone-900 disabled:opacity-30 cursor-pointer transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* DOCX & PDF Export Toolbar */}
          <input
            ref={docxInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleImportDocx}
          />
          <div className="hidden sm:flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            {!isApproved && (
              <button
                type="button"
                onClick={() => docxInputRef.current?.click()}
                className="px-2 py-1 rounded-md text-[11px] font-bold text-stone-700 hover:bg-white hover:text-stone-900 flex items-center gap-1 cursor-pointer transition-colors"
                title={isId ? "Impor file .DOCX" : "Import .DOCX"}
              >
                <Upload className="w-3 h-3" />
                <span className="hidden lg:inline">Import</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportDocx}
              className="px-2 py-1 rounded-md text-[11px] font-bold text-stone-700 hover:bg-white hover:text-stone-900 flex items-center gap-1 cursor-pointer transition-colors"
              title={isId ? "Unduh file .DOCX" : "Export .DOCX"}
            >
              <Download className="w-3 h-3" />
              <span>DOCX</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-2 py-1 rounded-md text-[11px] font-bold text-stone-900 bg-white shadow-3xs hover:bg-stone-900 hover:text-white flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
              title={isId ? "Unduh PDF Presisi Siap Cetak" : "Export Precision PDF"}
            >
              <Printer className="w-3 h-3" />
              <span>{isExportingPdf ? "PDF…" : "PDF"}</span>
            </button>
          </div>

          <div className="h-4 w-px bg-stone-200 hidden sm:block" />

          {/* Primary Save / Submit Actions */}
          {isApproved ? (
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                <Lock className="w-3 h-3 text-emerald-600" />
                <span>APPROVED</span>
              </span>
              {onClone && (
                <Button
                  onClick={onClone}
                  variant="primary"
                  size="sm"
                  className="rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isId ? "Buat Revisi" : "Clone Revision"}</span>
                </Button>
              )}
            </div>
          ) : (
            <>
              <Button
                onClick={() => handleSave(false, false)}
                disabled={isSaving}
                variant="outline"
                size="sm"
                className="rounded-lg border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-stone-700" />
                <span>{isId ? "Simpan Draft" : "Save Draft"}</span>
              </Button>

              <Button
                onClick={() => handleSave(true, true)}
                disabled={isSaving}
                variant="primary"
                size="sm"
                className="rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {isId ? `Ajukan (${targetAuthDept})` : `Submit (${targetAuthDept})`}
                </span>
              </Button>
            </>
          )}

          <button
            type="button"
            onClick={() => setShowRightPanel(true)}
            className="lg:hidden p-2 rounded-xl text-stone-500 hover:bg-stone-100 cursor-pointer"
            title={isId ? "Pengaturan" : "Inspector"}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Row 2: Top Insert & Format Ribbon Menu (replaces permanent left sidebar) */}
      {isEditable && (
        <div className="bg-stone-50/90 border-t border-stone-200/80 px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 overflow-visible flex-wrap">
          <input
            ref={ribbonPhotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleRibbonPhotoUpload}
          />

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 mr-1 hidden xl:inline">
              {isId ? "Sisipkan Elemen:" : "Insert Elements:"}
            </span>

            {/* 1. Text & Content Group */}
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-stone-200 shadow-3xs">
              <button
                type="button"
                onClick={() => handleQuickInsertByKey("HEADER")}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                title={isId ? "Tambah Judul Dokumen" : "Insert Document Heading"}
              >
                <Type className="w-3.5 h-3.5" />
                <span>{isId ? "Judul" : "Heading"}</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickInsertByKey("TEXT")}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                title={isId ? "Tambah Paragraf Narasi" : "Insert Narrative Paragraph"}
              >
                <AlignLeft className="w-3.5 h-3.5" />
                <span>{isId ? "Paragraf" : "Paragraph"}</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickInsertByKey("METADATA_GRID")}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                title={isId ? "Tambah Grid Nomor & Referensi" : "Insert Reference Grid"}
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isId ? "Grid Info" : "Meta Grid"}</span>
              </button>

              {/* Dropdown for Lists, Checklist, Callout, Divider */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setOpenMenu((m) => (m === "text" ? null : "text"))}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors",
                    openMenu === "text"
                      ? "bg-stone-900 text-white"
                      : "text-stone-700 hover:bg-stone-100"
                  )}
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>{isId ? "Poin & Catatan" : "Lists & Notes"}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {openMenu === "text" && (
                  <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-stone-200 rounded-2xl shadow-xl p-1.5 z-50 space-y-0.5">
                    {[
                      { key: "LIST_POINTS", icon: ListOrdered, label: isId ? "Poin Instruksi Bernomor" : "Numbered Policy Points" },
                      { key: "CHECKLIST_BLOCK", icon: CheckSquare, label: isId ? "Checklist Inspeksi QC / BAST" : "QC / Handover Checklist" },
                      { key: "TERMS_BLOCK", icon: FileCheck2, label: isId ? "Klausul Syarat & Ketentuan" : "Commercial Terms & Clauses" },
                      { key: "CALLOUT", icon: AlertTriangle, label: isId ? "Kotak Perhatian / Peringatan" : "Important Callout Box" },
                      { key: "DIVIDER", icon: SeparatorHorizontal, label: isId ? "Garis Pemisah Seksi" : "Section Divider Line" },
                    ].map((it) => {
                      const IIcon = it.icon;
                      return (
                        <button
                          key={it.key}
                          type="button"
                          onClick={() => handleQuickInsertByKey(it.key)}
                          className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-stone-100 flex items-center gap-2.5 text-xs font-bold text-stone-800 cursor-pointer"
                        >
                          <IIcon className="w-4 h-4 text-stone-600 shrink-0" />
                          <span>{it.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Table Group */}
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-stone-200 shadow-3xs">
              <button
                type="button"
                onClick={() => handleQuickInsertByKey("TABLE")}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                title={isId ? "Tambah Tabel Spesifikasi" : "Insert Specification Table"}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>{isId ? "Tabel" : "Table"}</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickInsertByKey("BUDGET_TABLE")}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-emerald-800 bg-emerald-50/70 hover:bg-emerald-600 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                title={isId ? "Tambah Tabel RAB dengan Rumus =SUM Otomatis" : "Insert Auto-Sum Budget Table"}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isId ? "Tabel RAB" : "Budget Table"}</span>
              </button>
            </div>

            {/* 3. Photo / Visual Documentation Group (Prominent Feature) */}
            <div className="flex items-center gap-1 bg-indigo-50/80 p-0.5 rounded-xl border border-indigo-200 shadow-3xs">
              <button
                type="button"
                onClick={() => ribbonPhotoInputRef.current?.click()}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title={
                  isId
                    ? "Unggah Foto dari Perangkat (Bebas Resize, Perataan & Caption)"
                    : "Upload Photo from Device (Free Resize, Alignment & Caption)"
                }
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{isId ? "+ Upload Photo" : "+ Upload Photo"}</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickInsertByKey("IMAGE")}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-900 hover:bg-indigo-100 flex items-center gap-1 cursor-pointer transition-colors"
                title={isId ? "Sisipkan Bingkai Blok Foto" : "Insert Photo Block Frame"}
              >
                <Plus className="w-3 h-3" />
                <span className="hidden md:inline">{isId ? "Blok Foto" : "Photo Frame"}</span>
              </button>
            </div>

            {/* 4. Address Group Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === "address" ? null : "address"))}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 cursor-pointer transition-colors shadow-3xs",
                  openMenu === "address"
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                )}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>{isId ? "Alamat" : "Address"}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {openMenu === "address" && (
                <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-stone-200 rounded-2xl shadow-xl p-1.5 z-50 space-y-0.5">
                  {[
                    { key: "RECIPIENT_ADDRESS", icon: Building2, label: isId ? "Tujuan Rekanan / Klien (To)" : "Recipient / Partner Address (To)" },
                    { key: "SENDER_ADDRESS", icon: MapPin, label: isId ? "Identitas Pengirim (From)" : "Sender Identity (From)" },
                    { key: "PROJECT_SITE_ADDRESS", icon: MapPin, label: isId ? "Lokasi Proyek Lapangan" : "Project Delivery Site" },
                  ].map((it) => {
                    const IIcon = it.icon;
                    return (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => handleQuickInsertByKey(it.key)}
                        className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-stone-100 flex items-center gap-2.5 text-xs font-bold text-stone-800 cursor-pointer"
                      >
                        <IIcon className="w-4 h-4 text-stone-600 shrink-0" />
                        <span>{it.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 5. Signature & Routing Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === "signature" ? null : "signature"))}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 cursor-pointer transition-colors shadow-3xs",
                  openMenu === "signature"
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                )}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>{isId ? "Otorisasi & TTD" : "Sign-off"}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {openMenu === "signature" && (
                <div className="absolute left-0 top-full mt-1.5 w-72 bg-white border border-stone-200 rounded-2xl shadow-xl p-1.5 z-50 space-y-0.5 max-h-80 overflow-y-auto custom-scrollbar">
                  <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-stone-400">
                    {isId ? "Format Kolom Tanda Tangan" : "Signature Block Format"}
                  </div>
                  {LIBRARY_ITEMS.filter((i) => i.category === "SIGNATURE_COLUMN").map((it) => {
                    const IIcon = it.icon;
                    return (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => handleQuickInsertByKey(it.key)}
                        className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-stone-100 flex items-center gap-2.5 text-xs font-bold text-stone-800 cursor-pointer"
                      >
                        <IIcon className="w-4 h-4 text-stone-700 shrink-0" />
                        <span className="truncate">{isId ? it.labelId : it.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 6. ERP Footer Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === "footer" ? null : "footer"))}
                className={cn(
                  "px-2.5 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 cursor-pointer transition-colors shadow-3xs",
                  openMenu === "footer"
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                )}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Footer ERP</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {openMenu === "footer" && (
                <div className="absolute right-0 sm:left-0 top-full mt-1.5 w-68 bg-white border border-stone-200 rounded-2xl shadow-xl p-1.5 z-50 space-y-0.5">
                  {LIBRARY_ITEMS.filter((i) => i.category === "FOOTER_TEMPLATE").map((it) => {
                    const IIcon = it.icon;
                    return (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => handleQuickInsertByKey(it.key)}
                        className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-stone-100 flex items-center gap-2.5 text-xs font-bold text-stone-800 cursor-pointer"
                      >
                        <IIcon className="w-4 h-4 text-stone-700 shrink-0" />
                        <span className="truncate">{isId ? it.labelId : it.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right side of Ribbon: Full Block Catalog Picker */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => setQuickInsertIndex(blocks.length)}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-stone-900 text-white hover:bg-stone-800 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              title={isId ? "Buka Katalog Lengkap Semua Blok" : "Open Full Block Catalog"}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{isId ? "Katalog Blok" : "All Blocks"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StudioStatusBar({ state }: { state: CanvaStudioState }) {
  const {
    isId,
    blocks,
    viewMode,
    zoomLevel,
    setZoomLevel,
    handleFitZoom,
    showGrid,
    setShowGrid,
    setShowShortcuts,
    selectionToolbar,
    setSelectionToolbar,
    isEditable,
    selectedBlockId,
    updateBlock,
    handleWrapSelection,
    handleTransformCase,
  } = state;

  return (
    <>
      <footer className="h-9 bg-white border-t border-stone-200 px-3 hidden sm:flex items-center justify-between text-[11px] text-stone-500 font-medium shrink-0 z-10 print:hidden">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-semibold text-stone-700">
            <Layers className="w-3.5 h-3.5 text-stone-400" />
            {blocks.length} {isId ? "Blok" : "Blocks"}
          </span>
          <span className="text-stone-300">|</span>
          <span>
            {viewMode === "preview"
              ? isId
                ? "Mode Pratinjau Cetak"
                : "Print Preview Mode"
              : isId
              ? "Mode Edit Kanvas"
              : "Canvas Edit Mode"}
          </span>
        </div>

        {/* Compact Zoom / Fit / Grid / Shortcuts Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(40, z - 10))}
              className="p-1 hover:bg-white rounded text-stone-600 hover:text-stone-900 cursor-pointer"
              title="Zoom Out (Ctrl+-)"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="px-1.5 font-mono text-[10px] font-bold text-stone-700 hover:text-stone-900 cursor-pointer"
              title="Reset 100%"
            >
              {zoomLevel}%
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
              className="p-1 hover:bg-white rounded text-stone-600 hover:text-stone-900 cursor-pointer"
              title="Zoom In (Ctrl++)"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleFitZoom}
              className="p-1 hover:bg-white rounded text-stone-600 hover:text-stone-900 cursor-pointer"
              title={isId ? "Pas Lebar Layar" : "Fit to Width"}
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            className={cn(
              "px-2 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors",
              showGrid
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
            )}
          >
            <Grid3X3 className="w-3 h-3" />
            <span>Grid</span>
          </button>

          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            className="px-2 py-1 rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Keyboard className="w-3 h-3" />
            <span>{isId ? "Pintasan" : "Shortcuts"}</span>
          </button>
        </div>
      </footer>
      {/* ============ 8. FLOATING TEXT SELECTION TOOLBAR ============ */}
      {selectionToolbar.visible && isEditable && (
        <FloatingTextToolbar
          isId={isId}
          x={selectionToolbar.x}
          y={selectionToolbar.y}
          selectedText={selectionToolbar.selectedText}
          selectedBlock={blocks.find((b) => b.id === (selectionToolbar.blockId || selectedBlockId)) || null}
          targetInput={selectionToolbar.targetInput}
          onApplyStyle={(patch) => {
            const targetId = selectionToolbar.blockId || selectedBlockId;
            if (targetId) {
              updateBlock(targetId, patch);
            }
          }}
          onWrapText={handleWrapSelection}
          onTransformCase={handleTransformCase}
          onClose={() => setSelectionToolbar((prev) => ({ ...prev, visible: false }))}
        />
      )}
    </>
  );
}
