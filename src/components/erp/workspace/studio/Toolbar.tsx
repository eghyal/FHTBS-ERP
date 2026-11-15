import React, {
  useState,
  useEffect,
  useRef,
} from "react";
import {
  FileText,
  Files,
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
  Grid3X3,
  Undo2,
  Redo2,
  Printer,
  Keyboard,
  PanelLeft,
  SlidersHorizontal,
  Search,
  Lock,
  Check,
  Upload,
  Download,
  Calculator,
  CheckSquare,
  SeparatorHorizontal,
  FileCheck2,
  Image as ImageIcon,
  GitCompare,
  Database,
  Ruler,
  ShieldAlert,
  FileCode,
  FileSpreadsheet,
  BookOpen,
  PanelRight,
  MessageSquare,
  GitPullRequest,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  DocBlock,
  LayoutPreset,
  TargetDepartment,
} from "@/types/workspace";
import { ERP_DEPARTMENT_OPTIONS, normalizeDepartmentToRole } from "@/constants/rbac";
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
    docTitle,
    setDocTitle,
    setDirty,
    docType,
    setDocType,
    layoutPreset,
    setLayoutPreset,
    customWidthMm,
    setCustomWidthMm,
    customHeightMm,
    setCustomHeightMm,
    viewMode,
    setViewMode,
    layoutMode,
    pageSetup,
    updatePageSetup,
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
    insertBlock,
    blocks,
    blocksRef,
    applyBlocks,
    department,
    setDepartment,
    selectedBlock,
    updateBlock,
    notify,
    versions,
    isTrackChangesEnabled,
    setIsTrackChangesEnabled,
    trackedChanges,
    acceptAllTrackedChanges,
    rejectAllTrackedChanges,
    comments,
    preflightReport,
    findOpen,
    setFindOpen,
    setMailMergeOpen,
    activeMergeRecord,
    isMergePreview,
    setPageSetupModalOpen,
    setCompareModalOpen,
    requestSubmitWithPreflight,
    activeRibbonTab,
    setActiveRibbonTab,
    ribbonCollapsed,
    setRibbonCollapsed,
    leftReviewTab,
    showLeftReviewDrawer,
    openLeftReviewPanel,
    toggleLeftReviewRail,
    rightInspectorOpen,
    showRightPanel,
    toggleRightInspector,
  } = state;
  const {
    handleImportDocx,
    handleExportDocx,
    handleExportPdf,
    handleExportHtml,
    handleExportMarkdown,
    handleExportTxt,
  } = exportHandlers;

  const [openMenu, setOpenMenu] = useState<
    "text" | "address" | "signature" | "footer" | "export" | null
  >(null);
  const ribbonPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTrackCount = trackedChanges.filter((c) => c.status === "PENDING").length;
  const openCommentsCount = comments.filter((c) => !c.resolved).length;
  const reviewAttentionCount =
    pendingTrackCount + openCommentsCount + preflightReport.errorCount + preflightReport.warningCount;
  const currentPaperLabel =
    PAPER_FORMAT_OPTIONS.find((p) => p.value === layoutPreset)?.label || layoutPreset;

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
      const maxInsertIdx = current.length;
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
  const isLeftRailVisible = Boolean(leftReviewTab && layoutMode !== "FOCUS") || showLeftReviewDrawer;
  const isRightRailVisible = (rightInspectorOpen && layoutMode !== "FOCUS") || showRightPanel;

  return (
    <div className="shrink-0 z-20 bg-white border-b border-stone-200 print:hidden">
      {/* Row 1: Slim Editorial Title & Primary Actions Header (48px) */}
      <header className="h-12 px-3 sm:px-4 flex items-center justify-between gap-3">
        {/* Left Zone: Close + Left Rail Toggle + Title + Deterministic Save Indicator */}
        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-xl">
          <button
            type="button"
            onClick={requestClose}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer relative shrink-0"
            title="Close Studio"
          >
            <X className="w-4 h-4" />
            {dirty && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-600" />}
          </button>

          <button
            type="button"
            onClick={toggleLeftReviewRail}
            className={cn(
              "p-1.5 rounded-lg border text-xs transition-colors cursor-pointer shrink-0 flex items-center gap-1",
              isLeftRailVisible
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900"
            )}
            title="Toggle Pages & Review Rail"
          >
            <PanelLeft className="w-3.5 h-3.5" />
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
              className="text-xs sm:text-sm font-bold text-stone-900 bg-transparent hover:bg-stone-100/80 focus:bg-white border border-transparent hover:border-stone-200 focus:border-stone-900 rounded-lg px-2 py-1 outline-none transition-all truncate w-full"
            />
            <span
              className={cn(
                "hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 whitespace-nowrap",
                dirty
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-stone-50 text-stone-600 border-stone-200"
              )}
            >
              {dirty ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
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

        {/* Right Zone: Undo/Redo + Edit/Preview + Export + Save/Submit + Inspector Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Undo / Redo */}
          <div className="hidden sm:flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={undo}
              disabled={past.length === 0}
              className="p-1 rounded-md text-stone-600 hover:bg-white hover:text-stone-900 disabled:opacity-30 cursor-pointer transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={future.length === 0}
              className="p-1 rounded-md text-stone-600 hover:bg-white hover:text-stone-900 disabled:opacity-30 cursor-pointer transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Edit / Preview Segmented Control */}
          <div className="hidden md:flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => setViewMode("edit")}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0",
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
                "px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap shrink-0",
                viewMode === "preview" ? "bg-stone-900 text-white shadow-2xs" : "text-stone-500 hover:text-stone-900"
              )}
            >
              <Eye className="w-3 h-3" />
              <span>Preview</span>
            </button>
          </div>

          {/* Export Dropdown + Precision PDF */}
          <input
            ref={docxInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={handleImportDocx}
          />
          <div className="hidden sm:flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpenMenu((m) => (m === "export" ? null : "export"))}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                  openMenu === "export"
                    ? "bg-stone-900 text-white"
                    : "text-stone-700 hover:bg-white hover:text-stone-900"
                )}
              >
                <Download className="w-3 h-3" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {openMenu === "export" && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-stone-200 rounded-xl shadow-xl p-1.5 z-50 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      handleExportDocx();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-100 text-xs font-semibold text-stone-800 flex items-center gap-2 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-stone-500" />
                    <span>Word Package (.DOCX)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      handleExportHtml();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-100 text-xs font-semibold text-stone-800 flex items-center gap-2 cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5 text-stone-500" />
                    <span>Printable Web (.HTML)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      handleExportMarkdown();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-100 text-xs font-semibold text-stone-800 flex items-center gap-2 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-stone-500" />
                    <span>Markdown (.MD)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      handleExportTxt();
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-100 text-xs font-semibold text-stone-800 flex items-center gap-2 cursor-pointer"
                  >
                    <AlignLeft className="w-3.5 h-3.5 text-stone-500" />
                    <span>Plain Text (.TXT)</span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-2 py-1 rounded-md text-[11px] font-bold text-stone-900 bg-white shadow-3xs hover:bg-stone-900 hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors disabled:opacity-50"
              title="Export Precision PDF"
            >
              <Printer className="w-3 h-3" />
              <span>{isExportingPdf ? "PDF…" : "PDF"}</span>
            </button>
          </div>

          <div className="h-4 w-px bg-stone-200 hidden sm:block" />

          {/* Primary Save / Submit Actions */}
          {isApproved ? (
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold whitespace-nowrap shrink-0">
                <Lock className="w-3 h-3 text-emerald-600" />
                <span>APPROVED</span>
              </span>
              {onClone && (
                <Button
                  onClick={onClone}
                  variant="primary"
                  size="sm"
                  className="rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Clone Revision</span>
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
                className="rounded-lg border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-stone-700" />
                <span className="hidden sm:inline">Save Draft</span>
              </Button>

              <Button
                onClick={() => requestSubmitWithPreflight(true)}
                disabled={isSaving}
                variant="primary"
                size="sm"
                className="rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Submit ({targetAuthDept})</span>
              </Button>
            </>
          )}

          {/* Right Inspector Toggle (Desktop & Mobile) */}
          <button
            type="button"
            onClick={toggleRightInspector}
            className={cn(
              "p-1.5 rounded-lg border transition-colors cursor-pointer shrink-0",
              isRightRailVisible
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900"
            )}
            title="Toggle Document & Block Inspector"
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Row 2A: WordCraft 4-Tab Ribbon Bar */}
      <div className="h-9 px-3 sm:px-4 bg-stone-50/90 border-t border-stone-200/80 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1">
          {(
            [
              { id: "INSERT", label: "Insert", count: 0 },
              { id: "LAYOUT", label: "Layout", count: 0 },
              { id: "REVIEW", label: "Review", count: reviewAttentionCount },
              { id: "DATA", label: "Data & Routing", count: 0 },
            ] as const
          ).map((tab) => {
            const active = activeRibbonTab === tab.id && !ribbonCollapsed;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveRibbonTab(tab.id);
                  if (ribbonCollapsed) setRibbonCollapsed(false);
                }}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                  active
                    ? "bg-white text-stone-900 border border-stone-200 shadow-2xs"
                    : activeRibbonTab === tab.id && ribbonCollapsed
                    ? "text-stone-900 bg-stone-200/60"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/50"
                )}
              >
                <span>{tab.label}</span>
                {tab.id === "REVIEW" && tab.count > 0 && (
                  <span className="font-mono tabular-nums text-[9.5px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-200">
                    {tab.count}
                  </span>
                )}
                {tab.id === "DATA" && isMergePreview && activeMergeRecord && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" title="Live Merge Active" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden lg:inline-flex items-center gap-1.5 font-mono tabular-nums text-[10px] text-stone-500 whitespace-nowrap">
            <span>{currentPaperLabel}</span>
            <span>·</span>
            <span>{pageSetup.marginTopMm}mm</span>
            <span>·</span>
            <span>
              Route: {isHrFallbackRoute ? "HR (Auto)" : `${targetAuthDept} (${currentRoleTier})`}
            </span>
          </span>

          <button
            type="button"
            onClick={() => setRibbonCollapsed((c) => !c)}
            className="p-1 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-200/70 cursor-pointer"
            title={ribbonCollapsed ? "Expand Ribbon" : "Collapse Ribbon"}
          >
            {ribbonCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Row 2B: Active Ribbon Panel */}
      {!ribbonCollapsed && (
        <div className="bg-white border-t border-stone-200/70 px-3 sm:px-4 py-1.5 flex items-center justify-between gap-2 overflow-visible flex-wrap">
          <input
            ref={ribbonPhotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleRibbonPhotoUpload}
          />

          {/* TAB 1: INSERT */}
          {activeRibbonTab === "INSERT" && (
            isEditable ? (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Text & Lists */}
                  <div className="flex items-center gap-0.5 bg-stone-50 p-0.5 rounded-lg border border-stone-200">
                    <button
                      type="button"
                      onClick={() => handleQuickInsertByKey("HEADER")}
                      className="px-2 py-1 rounded-md text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      title="Insert Document Heading"
                    >
                      <Type className="w-3.5 h-3.5" />
                      <span>Heading</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickInsertByKey("TEXT")}
                      className="px-2 py-1 rounded-md text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      title="Insert Narrative Paragraph"
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                      <span>Paragraph</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickInsertByKey("METADATA_GRID")}
                      className="px-2 py-1 rounded-md text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      title="Insert Reference Grid"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Meta Grid</span>
                    </button>

                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenMenu((m) => (m === "text" ? null : "text"))}
                        className={cn(
                          "px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                          openMenu === "text"
                            ? "bg-stone-900 text-white"
                            : "text-stone-700 hover:bg-white"
                        )}
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                        <span>Lists & Notes</span>
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {openMenu === "text" && (
                        <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-stone-200 rounded-xl shadow-xl p-1.5 z-50 space-y-0.5">
                          {[
                            { key: "LIST_POINTS", icon: ListOrdered, label: "Numbered Policy Points" },
                            { key: "CHECKLIST_BLOCK", icon: CheckSquare, label: "QC / Handover Checklist" },
                            { key: "TERMS_BLOCK", icon: FileCheck2, label: "Commercial Terms & Clauses" },
                            { key: "CALLOUT", icon: AlertTriangle, label: "Important Callout Box" },
                            { key: "DIVIDER", icon: SeparatorHorizontal, label: "Section Divider Line" },
                          ].map((it) => {
                            const IIcon = it.icon;
                            return (
                              <button
                                key={it.key}
                                type="button"
                                onClick={() => handleQuickInsertByKey(it.key)}
                                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-stone-100 flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer"
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

                  {/* Tables */}
                  <div className="flex items-center gap-0.5 bg-stone-50 p-0.5 rounded-lg border border-stone-200">
                    <button
                      type="button"
                      onClick={() => handleQuickInsertByKey("TABLE")}
                      className="px-2 py-1 rounded-md text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      title="Insert Specification Table"
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      <span>Table</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickInsertByKey("BUDGET_TABLE")}
                      className="px-2 py-1 rounded-md text-[11px] font-bold text-stone-700 hover:bg-stone-900 hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      title="Insert Auto-Sum Budget Table"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Budget Table</span>
                    </button>
                  </div>

                  {/* Photo / Media */}
                  <div className="flex items-center gap-0.5 bg-stone-50 p-0.5 rounded-lg border border-stone-200">
                    <button
                      type="button"
                      onClick={() => ribbonPhotoInputRef.current?.click()}
                      className="px-2 py-1 rounded-md text-[11px] font-bold bg-stone-900 hover:bg-stone-800 text-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      title="Upload Photo from Device"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Upload Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickInsertByKey("IMAGE")}
                      className="px-2 py-1 rounded-md text-[11px] font-bold text-stone-700 hover:bg-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      title="Insert Photo Frame"
                    >
                      <Plus className="w-3 h-3" />
                      <span className="hidden md:inline">Frame</span>
                    </button>
                  </div>

                  {/* Address, Sign-off & Footer */}
                  <div className="flex items-center gap-1">
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenMenu((m) => (m === "address" ? null : "address"))}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                          openMenu === "address"
                            ? "bg-stone-900 text-white border-stone-900"
                            : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                        )}
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Address</span>
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {openMenu === "address" && (
                        <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-stone-200 rounded-xl shadow-xl p-1.5 z-50 space-y-0.5">
                          {[
                            { key: "RECIPIENT_ADDRESS", icon: Building2, label: "Recipient / Partner Address (To)" },
                            { key: "SENDER_ADDRESS", icon: MapPin, label: "Sender Identity (From)" },
                            { key: "PROJECT_SITE_ADDRESS", icon: MapPin, label: "Project Delivery Site" },
                          ].map((it) => {
                            const IIcon = it.icon;
                            return (
                              <button
                                key={it.key}
                                type="button"
                                onClick={() => handleQuickInsertByKey(it.key)}
                                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-stone-100 flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer"
                              >
                                <IIcon className="w-4 h-4 text-stone-600 shrink-0" />
                                <span>{it.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenMenu((m) => (m === "signature" ? null : "signature"))}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                          openMenu === "signature"
                            ? "bg-stone-900 text-white border-stone-900"
                            : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                        )}
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>Sign-off</span>
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {openMenu === "signature" && (
                        <div className="absolute left-0 top-full mt-1.5 w-72 bg-white border border-stone-200 rounded-xl shadow-xl p-1.5 z-50 space-y-0.5 max-h-80 overflow-y-auto custom-scrollbar">
                          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            Signature Block Format
                          </div>
                          {LIBRARY_ITEMS.filter((i) => i.category === "SIGNATURE_COLUMN").map((it) => {
                            const IIcon = it.icon;
                            return (
                              <button
                                key={it.key}
                                type="button"
                                onClick={() => handleQuickInsertByKey(it.key)}
                                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-stone-100 flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer"
                              >
                                <IIcon className="w-4 h-4 text-stone-700 shrink-0" />
                                <span className="truncate">{it.labelEn}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenMenu((m) => (m === "footer" ? null : "footer"))}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
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
                        <div className="absolute right-0 sm:left-0 top-full mt-1.5 w-68 bg-white border border-stone-200 rounded-xl shadow-xl p-1.5 z-50 space-y-0.5">
                          {LIBRARY_ITEMS.filter((i) => i.category === "FOOTER_TEMPLATE").map((it) => {
                            const IIcon = it.icon;
                            return (
                              <button
                                key={it.key}
                                type="button"
                                onClick={() => handleQuickInsertByKey(it.key)}
                                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-stone-100 flex items-center gap-2 text-xs font-semibold text-stone-800 cursor-pointer"
                              >
                                <IIcon className="w-4 h-4 text-stone-700 shrink-0" />
                                <span className="truncate">{it.labelEn}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => handleQuickInsertByKey("PAGE_BREAK")}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    title="Insert Explicit Page Break"
                  >
                    <SeparatorHorizontal className="w-3.5 h-3.5 text-stone-600" />
                    <span>Page Break</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickInsertIndex(blocks.length)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-stone-900 text-white hover:bg-stone-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    title="Open Full Block Catalog"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>All Blocks</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between w-full py-0.5 text-xs text-stone-600">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-stone-400" />
                  <span>
                    {isApproved
                      ? "Document is permanently approved and locked. Clone a revision to insert or edit blocks."
                      : "Preview mode is active. Switch back to Edit mode to insert blocks."}
                  </span>
                </span>
                {!isApproved && (
                  <button
                    type="button"
                    onClick={() => setViewMode("edit")}
                    className="px-2.5 py-1 rounded-md bg-stone-900 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Switch to Edit
                  </button>
                )}
              </div>
            )
          )}

          {/* TAB 2: LAYOUT */}
          {activeRibbonTab === "LAYOUT" && (
            <div className="flex items-center justify-between gap-3 w-full flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-stone-50 px-2 py-1 rounded-lg border border-stone-200">
                  <span className="text-[10px] font-bold uppercase text-stone-500">Paper</span>
                  <select
                    value={layoutPreset}
                    onChange={(e) => {
                      setLayoutPreset(e.target.value as LayoutPreset);
                      setDirty(true);
                    }}
                    className="text-[11px] font-bold bg-transparent text-stone-900 outline-none cursor-pointer"
                  >
                    {PAPER_FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {layoutPreset === "CUSTOM" && (
                  <div className="flex items-center gap-1 bg-stone-50 px-2 py-1 rounded-lg border border-stone-200 text-[10px] font-mono tabular-nums">
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
                      title="Width (mm)"
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
                      title="Height (mm)"
                    />
                    <span className="text-stone-500 font-sans font-bold">mm</span>
                  </div>
                )}

                <div className="flex items-center gap-1 bg-stone-50 p-0.5 rounded-lg border border-stone-200">
                  <span className="px-1.5 text-[10px] font-bold uppercase text-stone-500">Margins</span>
                  {[
                    { label: "10mm", val: 10 },
                    { label: "18mm", val: 18 },
                    { label: "25mm", val: 25 },
                  ].map((m) => (
                    <button
                      key={m.val}
                      type="button"
                      onClick={() =>
                        updatePageSetup({
                          marginTopMm: m.val,
                          marginRightMm: m.val,
                          marginBottomMm: m.val,
                          marginLeftMm: m.val,
                        })
                      }
                      className={cn(
                        "px-2 py-1 rounded-md text-[10.5px] font-mono font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                        pageSetup.marginTopMm === m.val && pageSetup.marginLeftMm === m.val
                          ? "bg-stone-900 text-white"
                          : "text-stone-700 hover:bg-white"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setPageSetupModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-[11px] font-bold text-stone-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-stone-600" />
                  <span>Header, Footer & Watermark…</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: REVIEW */}
          {activeRibbonTab === "REVIEW" && (
            <div className="flex items-center justify-between gap-2 w-full flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {isEditable && (
                  <div className="flex items-center gap-1 bg-stone-50 p-0.5 rounded-lg border border-stone-200">
                    <button
                      type="button"
                      onClick={() => setIsTrackChangesEnabled((v) => !v)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                        isTrackChangesEnabled
                          ? "bg-amber-600 text-white"
                          : "text-stone-700 hover:bg-white"
                      )}
                    >
                      <GitPullRequest className="w-3.5 h-3.5" />
                      <span>Track Changes: {isTrackChangesEnabled ? "ON" : "OFF"}</span>
                      {pendingTrackCount > 0 && (
                        <span className="font-mono tabular-nums text-[10px] px-1 rounded bg-black/15">
                          {pendingTrackCount}
                        </span>
                      )}
                    </button>

                    {pendingTrackCount > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={acceptAllTrackedChanges}
                          className="px-2 py-1 rounded-md text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                        >
                          Accept All
                        </button>
                        <button
                          type="button"
                          onClick={rejectAllTrackedChanges}
                          className="px-2 py-1 rounded-md text-[11px] font-bold text-rose-700 hover:bg-rose-100 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                        >
                          Reject All
                        </button>
                      </>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => openLeftReviewPanel("COMMENTS")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                    leftReviewTab === "COMMENTS"
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Margin Comments</span>
                  <span className="font-mono tabular-nums text-[10px] opacity-80">
                    ({openCommentsCount})
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFindOpen(!findOpen)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                    findOpen
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                  )}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Find & Replace</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCompareModalOpen(true)}
                  disabled={versions.length === 0}
                  className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40 text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  title={
                    versions.length === 0
                      ? "Save at least one version to compare changes"
                      : "Compare Saved Versions"
                  }
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>Version Diff</span>
                  {versions.length > 0 && (
                    <span className="font-mono tabular-nums text-[10px] text-stone-500">
                      ({versions.length})
                    </span>
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => openLeftReviewPanel("PREFLIGHT")}
                className={cn(
                  "px-2.5 py-1 rounded-lg border text-[11px] font-bold font-mono tabular-nums flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ml-auto",
                  preflightReport.errorCount > 0
                    ? "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
                    : preflightReport.warningCount > 0
                    ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                    : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                )}
              >
                {preflightReport.errorCount > 0 ? (
                  <ShieldAlert className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {preflightReport.errorCount > 0
                    ? `Preflight: ${preflightReport.errorCount} Error(s)`
                    : preflightReport.warningCount > 0
                    ? `Preflight: ${preflightReport.warningCount} Warning(s)`
                    : "Preflight Check Passed"}
                </span>
              </button>
            </div>
          )}

          {/* TAB 4: DATA & ROUTING */}
          {activeRibbonTab === "DATA" && (
            <div className="flex items-center justify-between gap-2 w-full flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setMailMergeOpen(true)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                    isMergePreview && activeMergeRecord
                      ? "bg-emerald-700 text-white border-emerald-700"
                      : "bg-white text-stone-800 border-stone-200 hover:bg-stone-100"
                  )}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>
                    {isMergePreview && activeMergeRecord
                      ? `Mail Merge: ${activeMergeRecord.label}`
                      : "ERP Live Mail Merge"}
                  </span>
                </button>

                {!isApproved && (
                  <button
                    type="button"
                    onClick={() => docxInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import .DOCX</span>
                  </button>
                )}

                <div className="flex items-center gap-1.5 bg-stone-50 px-2 py-1 rounded-lg border border-stone-200">
                  <span className="text-[10px] font-bold uppercase text-stone-500">Type</span>
                  <select
                    value={docType}
                    disabled={!isEditable}
                    onChange={(e) => {
                      setDocType(e.target.value);
                      setDirty(true);
                    }}
                    className="text-[11px] font-bold bg-transparent text-stone-900 outline-none cursor-pointer disabled:opacity-60"
                  >
                    <option value="MEMORANDUM">Memorandum</option>
                    <option value="INTERNAL_POLICY">Internal Policy / SOP</option>
                    <option value="AUTHORIZATION_LETTER">Authorization Letter</option>
                    <option value="SURAT_PERINTAH">Work Order Letter</option>
                    <option value="BERITA_ACARA">Handover Certificate</option>
                    <option value="LAINNYA">Other</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 bg-stone-50 px-2 py-1 rounded-lg border border-stone-200">
                  <span className="text-[10px] font-bold uppercase text-stone-500">Origin</span>
                  <select
                    value={normalizeDepartmentToRole(department)}
                    disabled={!isEditable}
                    onChange={(e) => {
                      setDepartment(e.target.value);
                      setDirty(true);
                    }}
                    className="text-[11px] font-bold bg-transparent text-stone-900 outline-none cursor-pointer disabled:opacity-60"
                  >
                    {ERP_DEPARTMENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Authorization Routing Controls */}
              <div
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] ml-auto shrink-0",
                  isHrFallbackRoute
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-stone-100 border-stone-200 text-stone-900"
                )}
              >
                <ShieldCheck
                  className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    isHrFallbackRoute ? "text-amber-600" : "text-stone-700"
                  )}
                />
                {isHrFallbackRoute ? (
                  <span className="font-bold text-amber-900 whitespace-nowrap">
                    Auto-Route: HR (No Signature)
                  </span>
                ) : isEditable ? (
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="text-stone-500 font-semibold">Route:</span>
                    <select
                      value={targetAuthDept}
                      onChange={(e) => handleChangeTargetDepartment(e.target.value as TargetDepartment)}
                      className="font-bold text-stone-900 bg-transparent outline-none cursor-pointer"
                    >
                      {ERP_DEPARTMENT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {targetAuthDept !== "FC" && (
                      <>
                        <span className="text-stone-400">·</span>
                        <select
                          value={currentRoleTier}
                          onChange={(e) => handleChangeTargetRole(e.target.value as SignatureApprovalTier)}
                          className="font-bold text-stone-700 bg-transparent outline-none cursor-pointer text-[10.5px]"
                        >
                          <option value="SUPERVISOR">Supervisor</option>
                          <option value="MANAGER">Manager</option>
                          <option value="FC">FC</option>
                        </select>
                      </>
                    )}
                  </div>
                ) : (
                  <span className="font-bold text-stone-900 whitespace-nowrap">
                    {activeDeptConfig.deptNameEn} ({currentRoleTier})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StudioStatusBar({ state }: { state: CanvaStudioState }) {
  const {
    isId,
    blocks,
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
    leftReviewTab,
    openLeftReviewPanel,
    layoutMode,
    setLayoutMode,
    showRuler,
    setShowRuler,
    paginatedPages,
    activePageNumber,
    docStats,
    preflightReport,
    isMergePreview,
    activeMergeRecord,
    comments,
    trackedChanges,
  } = state;

  const openCommentsCount = comments.filter((c) => !c.resolved).length;
  const pendingTrackCount = trackedChanges.filter((c) => c.status === "PENDING").length;

  return (
    <>
      <footer className="h-8 sm:h-9 bg-white border-t border-stone-200 px-3 hidden sm:flex items-center justify-between gap-3 text-[11px] text-stone-500 font-medium shrink-0 z-10 overflow-x-auto no-scrollbar print:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-0.5 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => openLeftReviewPanel("PAGES")}
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                leftReviewTab === "PAGES" && layoutMode !== "FOCUS"
                  ? "bg-white text-stone-900 shadow-2xs"
                  : "text-stone-600 hover:text-stone-900"
              )}
              title="Pages Menu"
            >
              <Files className="w-3 h-3" />
              <span>Pages</span>
            </button>
            <button
              type="button"
              onClick={() => openLeftReviewPanel("OUTLINE")}
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                leftReviewTab === "OUTLINE" && layoutMode !== "FOCUS"
                  ? "bg-white text-stone-900 shadow-2xs"
                  : "text-stone-600 hover:text-stone-900"
              )}
              title="Outline"
            >
              <BookOpen className="w-3 h-3" />
              <span>Outline</span>
            </button>
            <button
              type="button"
              onClick={() => openLeftReviewPanel("COMMENTS")}
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-bold font-mono tabular-nums flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                leftReviewTab === "COMMENTS" && layoutMode !== "FOCUS"
                  ? "bg-white text-stone-900 shadow-2xs"
                  : "text-stone-600 hover:text-stone-900"
              )}
              title="Margin Comments"
            >
              <MessageSquare className="w-3 h-3" />
              <span>{openCommentsCount}</span>
            </button>
            <button
              type="button"
              onClick={() => openLeftReviewPanel("CHANGES")}
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-bold font-mono tabular-nums flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                leftReviewTab === "CHANGES" && layoutMode !== "FOCUS"
                  ? "bg-white text-stone-900 shadow-2xs"
                  : "text-stone-600 hover:text-stone-900"
              )}
              title="Track Changes"
            >
              <GitPullRequest className="w-3 h-3" />
              <span>{pendingTrackCount}</span>
            </button>
          </div>

          <span className="flex items-center gap-1 font-mono tabular-nums text-[10.5px] font-semibold text-stone-700 whitespace-nowrap">
            P{activePageNumber}/{paginatedPages.length} · {docStats.words}w · {docStats.characters}c · {blocks.length} blk
          </span>

          <button
            type="button"
            onClick={() => openLeftReviewPanel("PREFLIGHT")}
            className={cn(
              "px-2 py-0.5 rounded-md border text-[10px] font-bold font-mono tabular-nums flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
              preflightReport.errorCount > 0
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : preflightReport.warningCount > 0
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-emerald-50 text-emerald-800 border-emerald-200"
            )}
            title="Inspect Deterministic Document Preflight"
          >
            {preflightReport.errorCount > 0 ? (
              <ShieldAlert className="w-3 h-3" />
            ) : (
              <CheckCircle2 className="w-3 h-3" />
            )}
            <span>
              {preflightReport.errorCount > 0
                ? `${preflightReport.errorCount} ERR`
                : preflightReport.warningCount > 0
                ? `${preflightReport.warningCount} WARN`
                : "Preflight OK"}
            </span>
          </button>

          {isMergePreview && activeMergeRecord && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold truncate max-w-44">
              Merge: {activeMergeRecord.label}
            </span>
          )}
        </div>

        {/* Right Controls: Layout Switcher / Zoom / Ruler / Grid / Shortcuts */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            {(["PAGINATED", "CONTINUOUS", "FOCUS"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setLayoutMode(m)}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[10px] font-bold capitalize whitespace-nowrap shrink-0 cursor-pointer transition-colors",
                  layoutMode === m
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-500 hover:text-stone-900"
                )}
              >
                {m.toLowerCase()}
              </button>
            ))}
          </div>

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
              className="px-1.5 font-mono tabular-nums text-[10px] font-bold text-stone-700 hover:text-stone-900 cursor-pointer"
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
              title="Fit to Width"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowRuler((r) => !r)}
            className={cn(
              "flex px-2 py-1 rounded-lg border text-[10px] font-bold items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
              showRuler
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
            )}
          >
            <Ruler className="w-3 h-3" />
            <span>Ruler</span>
          </button>

          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            className={cn(
              "flex px-2 py-1 rounded-lg border text-[10px] font-bold items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
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
            className="p-1.5 rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 cursor-pointer shrink-0"
            title="Keyboard Shortcuts"
          >
            <Keyboard className="w-3 h-3" />
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
