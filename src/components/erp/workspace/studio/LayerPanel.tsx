import React, { useRef } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Plus,
  Minus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Maximize2,
  ShieldCheck,
  X,
  AlertTriangle,
  Table as TableIcon,
  Type,
  Grid3X3,
  GripVertical,
  RotateCcw,
  SlidersHorizontal,
  Search,
  Lock,
  Check,
  Info,
  Upload,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  DocBlock,
  BlockCategory,
  LayoutPreset,
  TargetDepartment,
} from "@/types/workspace";
import {
  ERP_DEPARTMENT_OPTIONS,
  normalizeDepartmentToRole,
} from "@/constants/rbac";
import {
  normalizeHorizontalAlign,
  normalizeVerticalAlign,
} from "@/services/docxEngine";
import {
  LibraryItem,
  LIBRARY_ITEMS,
  CATEGORY_META,
  LIB_DRAG_MIME,
  BLOCK_TYPE_LABELS,
  DEPARTMENT_ROUTING_CONFIG,
  readAndCompressImageFile,
  PAPER_FORMAT_OPTIONS,
  extractTierFromRole,
  SignatureApprovalTier,
} from "./config";
import type { CanvaStudioState } from "./useStudioState";
import {
  VerticalAlignTopIcon,
  VerticalAlignCenterIcon,
  VerticalAlignBottomIcon,
} from "./StudioIcons";

interface StudioInspectorProps {
  isId: boolean;
  blocks: DocBlock[];
  selectedBlock: DocBlock | null;
  selectedIndex: number;
  onSelectBlock: (id: string | null) => void;
  onUpdateBlock: (id: string, updates: Partial<DocBlock>) => void;
  onDeleteBlock: (id: string) => void;
  onDuplicateBlock: (id: string) => void;
  onMoveBlock: (id: string, dir: "UP" | "DOWN") => void;
  onResetPosition: (id: string) => void;
  onSnapBlockCanvas: (id: string, target: "LEFT" | "CENTER" | "RIGHT" | "RESET") => void;
  docType: string;
  onDocTypeChange: (v: string) => void;
  department: string;
  onDepartmentChange: (v: string) => void;
  layoutPreset: LayoutPreset;
  onLayoutPresetChange: (v: LayoutPreset) => void;
  customWidthMm?: number;
  onCustomWidthMmChange?: (v: number) => void;
  customHeightMm?: number;
  onCustomHeightMmChange?: (v: number) => void;
  targetAuthName: string;
  onTargetAuthNameChange: (v: string) => void;
  targetAuthDept: TargetDepartment;
  targetAuthRole?: string;
  isHrFallbackRoute?: boolean;
  onTargetAuthDeptChange: (v: TargetDepartment) => void;
  onTargetAuthRoleChange?: (v: SignatureApprovalTier) => void;
  activeDeptConfig: (typeof DEPARTMENT_ROUTING_CONFIG)[TargetDepartment];
  readinessChecks?: Array<{ id: string; label: string; passed: boolean; isWarning?: boolean; detail: string }>;
  signerChain?: any[];
  versions?: any[];
  onCollapse?: () => void;
}

export function StudioInspector({
  isId,
  blocks,
  selectedBlock,
  selectedIndex,
  onSelectBlock,
  onUpdateBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
  onResetPosition,
  onSnapBlockCanvas,
  docType,
  onDocTypeChange,
  department,
  onDepartmentChange,
  layoutPreset,
  onLayoutPresetChange,
  customWidthMm = 210,
  onCustomWidthMmChange,
  customHeightMm = 297,
  onCustomHeightMmChange,
  targetAuthName,
  onTargetAuthNameChange,
  targetAuthDept,
  targetAuthRole = "HR_MANAGER",
  isHrFallbackRoute = false,
  onTargetAuthDeptChange,
  onTargetAuthRoleChange,
  activeDeptConfig,
  readinessChecks = [],
  signerChain = [],
  versions = [],
  onCollapse,
}: StudioInspectorProps) {
  const isKop = selectedBlock?.type === "OFFICIAL_LETTERHEAD" || Boolean(selectedBlock?.isLocked);
  const isFooter = selectedBlock?.type === "FOOTER" || selectedBlock?.type === "FOOTER_BLOCK";
  const firstFooterIdx = blocks.findIndex((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
  const lastBodyMovableIdx = firstFooterIdx >= 0 ? firstFooterIdx - 1 : blocks.length - 1;
  const isSignature =
    selectedBlock?.type === "SIGNATURE_COLUMN" ||
    selectedBlock?.type === "SIGNATURE_STAMP" ||
    selectedBlock?.type === "DUAL_SIGNATURE";
  const isMoved = !isKop && !isFooter && Boolean(selectedBlock?.x || selectedBlock?.y);

  const curHorizontalAlign = selectedBlock
    ? normalizeHorizontalAlign(
        selectedBlock.alignment || selectedBlock.align,
        selectedBlock.type === "HEADER"
          ? "CENTER"
          : selectedBlock.type === "SIGNATURE_COLUMN" || selectedBlock.type === "SIGNATURE_STAMP"
          ? "RIGHT"
          : "LEFT"
      )
    : "LEFT";
  const curVerticalAlign = selectedBlock
    ? normalizeVerticalAlign(selectedBlock.verticalAlignment || selectedBlock.verticalAlign, "TOP")
    : "TOP";
  const inspectorPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const handleInspectorPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedBlock) return;
    try {
      const { dataUrl, width } = await readAndCompressImageFile(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
      onUpdateBlock(selectedBlock.id, {
        width: selectedBlock.width || width,
        mediaData: {
          ...(selectedBlock.mediaData || { mediaType: "IMAGE" }),
          mediaType: "IMAGE",
          imageUrl: dataUrl,
          widthPx: typeof selectedBlock.width === "number" ? selectedBlock.width : width,
          caption:
            selectedBlock.mediaData?.caption ||
            cleanName ||
            (isId ? "Keterangan Foto" : "Photo Caption"),
        },
      });
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="p-3 border-b border-stone-200/80 bg-stone-50 flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs font-black text-stone-900 uppercase tracking-tight flex items-center gap-1.5">
          <SlidersHorizontal className="w-4 h-4 text-stone-700" />
          {isId ? "Inspektor" : "Inspector"}
        </span>
        <div className="flex items-center gap-1.5">
          {selectedBlock && (
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-stone-200/80 text-stone-700 truncate max-w-36">
              {BLOCK_TYPE_LABELS[selectedBlock.type] || selectedBlock.type}
            </span>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 cursor-pointer shrink-0"
              title="Collapse Inspector"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs custom-scrollbar">
        {selectedBlock ? (
          isKop ? (
            /* ---- Locked Kop Surat info ---- */
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>{isId ? "Kop Surat Resmi Terstandarisasi" : "Standardized Official Letterhead"}</span>
                </div>
                <p className="text-[11px] text-amber-900/90 leading-relaxed font-medium">
                  {isId
                    ? "Kop surat ini adalah identitas resmi CV. BATU EMAS GROUP yang disamakan persis dengan dokumen penawaran resmi dan tidak dapat diedit maupun dihapus demi standar tata naskah dinas."
                    : "This letterhead is the official CV. BATU EMAS GROUP identity, matching exported quotations, and cannot be edited or deleted."}
                </p>
              </div>
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5 text-[11px] text-stone-700">
                <span className="text-[10px] font-bold text-stone-600 uppercase block mb-1">
                  {isId ? "Data Resmi Terdaftar" : "Registered Official Data"}
                </span>
                <div><b>Legal Entity:</b> CV. BATU EMAS GROUP</div>
                <div><b>Plant & Office:</b> Dusun Petahunan, Jajag, Gambiran, Banyuwangi 68486</div>
                <div><b>Phone:</b> 0811-1111-3993</div>
                <div><b>Email:</b> pavingjoss@gmail.com</div>
                <div className="text-amber-700 font-bold flex items-center gap-1 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isId ? "Terpasang permanen di atas lembar" : "Permanently pinned at sheet top"}</span>
                </div>
              </div>
              <button
                onClick={() => onSelectBlock(null)}
                className="w-full py-2 rounded-xl text-xs font-bold bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer"
              >
                {isId ? "Tutup pilihan" : "Deselect"}
              </button>
            </div>
          ) : (
            /* ---- Editable block props ---- */
            <div className="space-y-4">
              {/* Order & Canvas Alignment controls (locked for pinned Footer) */}
              {isFooter ? (
                <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-900 uppercase">
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                    <span>{isId ? "Posisi Footer Terkunci di Bawah" : "Footer Pinned at Bottom"}</span>
                  </div>
                  <p className="text-[10.5px] text-amber-800/90 leading-snug">
                    {isId
                      ? "Blok footer selalu menempel di dasar halaman dan otomatis naik sedikit di atas nomor halaman saat aktif."
                      : "Footer stays anchored at the bottom of the page and shifts cleanly above page numbers when enabled."}
                  </p>
                </div>
              ) : (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-stone-700 uppercase">
                    {isId ? "Posisi & Urutan Kanvas" : "Canvas Order & Position"}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-stone-500">
                    #{selectedIndex + 1} / {blocks.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => onMoveBlock(selectedBlock.id, "UP")}
                    disabled={selectedIndex <= 1}
                    className="py-1.5 px-2 rounded-lg text-[10.5px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <ChevronUp className="w-3 h-3" /> {isId ? "Naik" : "Up"}
                  </button>
                  <button
                    onClick={() => onMoveBlock(selectedBlock.id, "DOWN")}
                    disabled={selectedIndex >= lastBodyMovableIdx}
                    className="py-1.5 px-2 rounded-lg text-[10.5px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1"
                  >
                    <ChevronDown className="w-3 h-3" /> {isId ? "Turun" : "Down"}
                  </button>
                </div>

                {/* Quick Canvas Block Snap (Left Margin / Center Page / Right Margin) */}
                <div>
                  <label className="text-[9.5px] font-bold text-stone-500 uppercase block mb-1">
                    {isId ? "Ratakan Kotak Blok di Kanvas" : "Align Block Box on Canvas"}
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => onSnapBlockCanvas(selectedBlock.id, "LEFT")}
                      className="py-1.5 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-900 hover:text-white border border-stone-200 text-stone-700 cursor-pointer flex items-center justify-center gap-1 transition-colors"
                      title={isId ? "Tempel ke margin kiri halaman" : "Snap block to left margin"}
                    >
                      <AlignLeft className="w-3 h-3" />
                      <span>{isId ? "Kiri" : "Left"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSnapBlockCanvas(selectedBlock.id, "CENTER")}
                      className="py-1.5 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-900 hover:text-white border border-stone-200 text-stone-700 cursor-pointer flex items-center justify-center gap-1 transition-colors"
                      title={isId ? "Tengahkan kotak blok di halaman" : "Center block horizontally on page"}
                    >
                      <AlignCenter className="w-3 h-3" />
                      <span>{isId ? "Tengah" : "Center"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSnapBlockCanvas(selectedBlock.id, "RIGHT")}
                      className="py-1.5 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-900 hover:text-white border border-stone-200 text-stone-700 cursor-pointer flex items-center justify-center gap-1 transition-colors"
                      title={isId ? "Tempel ke margin kanan halaman" : "Snap block to right margin"}
                    >
                      <AlignRight className="w-3 h-3" />
                      <span>{isId ? "Kanan" : "Right"}</span>
                    </button>
                  </div>
                </div>

                {/* Exact X / Y Coordinate Micro-Adjusters */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <label className="text-[9.5px] font-bold text-stone-500 uppercase block mb-0.5">
                      Offset X (px)
                    </label>
                    <input
                      type="number"
                      value={selectedBlock.x || 0}
                      onChange={(e) =>
                        onUpdateBlock(selectedBlock.id, {
                          x: Number.isFinite(parseInt(e.target.value, 10))
                            ? parseInt(e.target.value, 10)
                            : 0,
                        })
                      }
                      className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-900"
                    />
                  </div>
                  <div>
                    <label className="text-[9.5px] font-bold text-stone-500 uppercase block mb-0.5">
                      Offset Y (px)
                    </label>
                    <input
                      type="number"
                      value={selectedBlock.y || 0}
                      onChange={(e) =>
                        onUpdateBlock(selectedBlock.id, {
                          y: Number.isFinite(parseInt(e.target.value, 10))
                            ? parseInt(e.target.value, 10)
                            : 0,
                        })
                      }
                      className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-900"
                    />
                  </div>
                </div>

                {isMoved && (
                  <button
                    onClick={() => onResetPosition(selectedBlock.id)}
                    className="w-full py-1.5 px-2 rounded-lg text-[10.5px] font-bold bg-stone-900 hover:bg-stone-800 text-white cursor-pointer flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {isId
                      ? `Reset ke Posisi Normal (0, 0)`
                      : `Reset to Natural Flow (0, 0)`}
                  </button>
                )}
              </div>
              )}

              {/* Universal Content Alignment & Typography (Available for all editable blocks) */}
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1.5">
                    {isId ? "Perataan Teks & Konten (Horizontal)" : "Horizontal Text & Content Alignment"}
                  </label>
                  <div className="grid grid-cols-4 gap-1 bg-stone-100 p-1 rounded-xl">
                    {(
                      [
                        { v: "LEFT", icon: AlignLeft, label: isId ? "Rata Kiri" : "Align Left" },
                        { v: "CENTER", icon: AlignCenter, label: isId ? "Rata Tengah" : "Center" },
                        { v: "RIGHT", icon: AlignRight, label: isId ? "Rata Kanan" : "Align Right" },
                        { v: "JUSTIFY", icon: AlignJustify, label: isId ? "Rata Kiri-Kanan" : "Justify" },
                      ] as const
                    ).map(({ v, icon: AIcon, label }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          if (selectedBlock.type === "TABLE" && selectedBlock.tableData) {
                            const colAlignVal: "left" | "center" | "right" =
                              v === "CENTER" ? "center" : v === "RIGHT" ? "right" : "left";
                            const updatedCols = selectedBlock.tableData.headers.map(() => colAlignVal);
                            onUpdateBlock(selectedBlock.id, {
                              alignment: v,
                              columnAlignments: updatedCols,
                              tableData: {
                                ...selectedBlock.tableData,
                                columnAlignments: updatedCols,
                              },
                            });
                          } else {
                            onUpdateBlock(selectedBlock.id, { alignment: v });
                          }
                        }}
                        title={label}
                        className={cn(
                          "py-1.5 rounded-lg flex items-center justify-center cursor-pointer transition-all",
                          curHorizontalAlign === v
                            ? "bg-stone-900 shadow-2xs text-white font-bold"
                            : "text-stone-500 hover:text-stone-900 hover:bg-white/60"
                        )}
                      >
                        <AIcon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1.5">
                    {isId ? "Perataan Vertikal (Dalam Blok)" : "Vertical Alignment (Inside Block)"}
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-stone-100 p-1 rounded-xl">
                    {(
                      [
                        { v: "TOP", icon: VerticalAlignTopIcon, label: isId ? "Atas" : "Top" },
                        { v: "MIDDLE", icon: VerticalAlignCenterIcon, label: isId ? "Tengah" : "Middle" },
                        { v: "BOTTOM", icon: VerticalAlignBottomIcon, label: isId ? "Bawah" : "Bottom" },
                      ] as const
                    ).map(({ v, icon: VIcon, label }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { verticalAlignment: v })}
                        title={label}
                        className={cn(
                          "py-1.5 rounded-lg flex items-center justify-center gap-1 text-[10px] font-bold cursor-pointer transition-all",
                          curVerticalAlign === v
                            ? "bg-stone-900 shadow-2xs text-white font-bold"
                            : "text-stone-500 hover:text-stone-900 hover:bg-white/60"
                        )}
                      >
                        <VIcon className="w-3.5 h-3.5" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {(selectedBlock.type === "HEADER" ||
                  selectedBlock.type === "TEXT" ||
                  selectedBlock.type === "CALLOUT" ||
                  selectedBlock.type === "LIST_POINTS") && (
                  <div>
                    <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1.5">
                      {isId ? "Gaya & Ukuran Font" : "Style & Font Size"}
                    </label>
                    <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { isBold: !selectedBlock.isBold })}
                        title={isId ? "Tebal (Bold)" : "Bold"}
                        className={cn(
                          "p-1.5 rounded-lg flex-1 flex items-center justify-center transition-all cursor-pointer",
                          selectedBlock.isBold ? "bg-stone-900 shadow-2xs text-white font-black" : "text-stone-500 hover:text-stone-900"
                        )}
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { isItalic: !selectedBlock.isItalic })}
                        title={isId ? "Miring (Italic)" : "Italic"}
                        className={cn(
                          "p-1.5 rounded-lg flex-1 flex items-center justify-center transition-all cursor-pointer",
                          selectedBlock.isItalic ? "bg-stone-900 shadow-2xs text-white" : "text-stone-500 hover:text-stone-900"
                        )}
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { isUnderline: !selectedBlock.isUnderline })}
                        title={isId ? "Garis Bawah (Underline)" : "Underline"}
                        className={cn(
                          "p-1.5 rounded-lg flex-1 flex items-center justify-center transition-all cursor-pointer",
                          selectedBlock.isUnderline ? "bg-stone-900 shadow-2xs text-white" : "text-stone-500 hover:text-stone-900"
                        )}
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { isStrikethrough: !selectedBlock.isStrikethrough })}
                        title={isId ? "Coret (Strikethrough)" : "Strikethrough"}
                        className={cn(
                          "p-1.5 rounded-lg flex-1 flex items-center justify-center transition-all cursor-pointer",
                          selectedBlock.isStrikethrough ? "bg-stone-900 shadow-2xs text-white" : "text-stone-500 hover:text-stone-900"
                        )}
                      >
                        <Strikethrough className="w-3.5 h-3.5" />
                      </button>

                      <div className="w-px h-4 bg-stone-300 mx-0.5" />

                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { fontSize: Math.max(9, (selectedBlock.fontSize || 12) - 1) })}
                        title={isId ? "Perkecil font (-1px)" : "Decrease font size"}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-[10.5px] font-bold text-stone-700 px-1 min-w-[28px] text-center">
                        {selectedBlock.fontSize || 12}px
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateBlock(selectedBlock.id, { fontSize: Math.min(48, (selectedBlock.fontSize || 12) + 1) })}
                        title={isId ? "Perbesar font (+1px)" : "Increase font size"}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Callout style */}
              {selectedBlock.type === "CALLOUT" && (
                <div>
                  <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1.5">
                    {isId ? "Gaya Catatan" : "Callout Style"}
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { v: "WARNING", label: isId ? "Penting" : "Warning", cls: "bg-amber-100 text-amber-800 border-amber-300" },
                        { v: "INFO", label: "Info", cls: "bg-blue-100 text-blue-800 border-blue-300" },
                        { v: "SUCCESS", label: isId ? "Sukses" : "Success", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
                      ] as const
                    ).map(({ v, label, cls }) => (
                      <button
                        key={v}
                        onClick={() => onUpdateBlock(selectedBlock.id, { style: v })}
                        className={cn(
                          "py-1.5 rounded-lg text-[10.5px] font-bold border cursor-pointer transition-all",
                          cls,
                          selectedBlock.style === v ? "ring-2 ring-stone-900/20" : "opacity-60 hover:opacity-100"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Photo / Image Inspector Controls */}
              {selectedBlock.type === "IMAGE" && (
                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-3">
                  <input
                    ref={inspectorPhotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleInspectorPhotoChange}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-indigo-950 uppercase flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-700" />
                      <span>{isId ? "Pengaturan Foto & Caption" : "Photo & Caption Settings"}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => inspectorPhotoInputRef.current?.click()}
                      className="flex-1 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {selectedBlock.mediaData?.imageUrl
                          ? isId
                            ? "Ganti Foto"
                            : "Replace Photo"
                          : isId
                          ? "Unggah Foto"
                          : "Upload Photo"}
                      </span>
                    </button>
                    {selectedBlock.mediaData?.imageUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateBlock(selectedBlock.id, {
                            mediaData: {
                              ...(selectedBlock.mediaData || { mediaType: "IMAGE" }),
                              imageUrl: "",
                            },
                          })
                        }
                        className="py-2 px-2.5 rounded-lg bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-bold cursor-pointer"
                        title={isId ? "Hapus gambar dari bingkai" : "Clear image"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Quick Width Presets for Photo */}
                  <div>
                    <label className="text-[9.5px] font-bold text-indigo-900 uppercase block mb-1">
                      {isId ? "Ukuran Cepat Lebar Foto" : "Quick Photo Width Presets"}
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { label: "25%", w: 200 },
                        { label: "50%", w: 360 },
                        { label: "75%", w: 520 },
                        { label: "100%", w: 680 },
                      ].map((p) => {
                        const curW = selectedBlock.mediaData?.widthPx || (typeof selectedBlock.width === "number" ? selectedBlock.width : 440);
                        return (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() =>
                              onUpdateBlock(selectedBlock.id, {
                                width: p.w,
                                mediaData: {
                                  ...(selectedBlock.mediaData || { mediaType: "IMAGE" }),
                                  widthPx: p.w,
                                },
                              })
                            }
                            className={cn(
                              "py-1 rounded-lg text-[10px] font-bold border cursor-pointer transition-colors",
                              curW === p.w
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-stone-700 border-stone-200 hover:bg-indigo-100/60"
                            )}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Photo Horizontal Alignment */}
                  <div>
                    <label className="text-[9.5px] font-bold text-indigo-900 uppercase block mb-1">
                      {isId ? "Perataan Posisi Foto" : "Photo Alignment"}
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { v: "LEFT", icon: AlignLeft, label: isId ? "Kiri" : "Left" },
                          { v: "CENTER", icon: AlignCenter, label: isId ? "Tengah" : "Center" },
                          { v: "RIGHT", icon: AlignRight, label: isId ? "Kanan" : "Right" },
                        ] as const
                      ).map(({ v, icon: AIcon, label }) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => onUpdateBlock(selectedBlock.id, { alignment: v })}
                          className={cn(
                            "py-1.5 px-2 rounded-lg text-[10px] font-bold border flex items-center justify-center gap-1 cursor-pointer transition-colors",
                            curHorizontalAlign === v
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-stone-700 border-stone-200 hover:bg-indigo-100/60"
                          )}
                        >
                          <AIcon className="w-3 h-3" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Caption Input */}
                  <div>
                    <label className="text-[9.5px] font-bold text-indigo-900 uppercase block mb-1">
                      {isId ? "Caption / Keterangan Foto" : "Photo Caption"}
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.mediaData?.caption ?? selectedBlock.content ?? ""}
                      onChange={(e) =>
                        onUpdateBlock(selectedBlock.id, {
                          content: e.target.value,
                          mediaData: {
                            ...(selectedBlock.mediaData || { mediaType: "IMAGE" }),
                            caption: e.target.value,
                          },
                        })
                      }
                      placeholder={
                        isId
                          ? "Tulis keterangan foto (kosongkan jika tanpa caption)…"
                          : "Enter photo caption (leave blank to hide)…"
                      }
                      className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-indigo-200 rounded-lg outline-none focus:border-indigo-600 font-medium text-stone-800"
                    />
                  </div>
                </div>
              )}

              {/* GridCraft Table Inspector Controls */}
              {selectedBlock.type === "TABLE" && selectedBlock.tableData && (
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-stone-900 uppercase flex items-center gap-1.5">
                      <TableIcon className="w-3.5 h-3.5 text-stone-700" />
                      <span>{isId ? "Pengaturan Tabel GridCraft" : "GridCraft Table Settings"}</span>
                    </span>
                    <span className="font-mono tabular-nums text-[10px] font-bold text-stone-600 bg-white px-2 py-0.5 rounded border border-stone-200">
                      {selectedBlock.tableData.rows.length}R × {selectedBlock.tableData.headers.length}C
                    </span>
                  </div>

                  {/* Zebra Striping Toggle */}
                  <div className="flex items-center justify-between bg-white px-2.5 py-2 rounded-lg border border-stone-200">
                    <div>
                      <div className="text-[10.5px] font-bold text-stone-800">
                        {isId ? "Baris Selang-Seling (Zebra)" : "Zebra Alternating Rows"}
                      </div>
                      <div className="text-[9.5px] text-stone-500">
                        {isId ? "Warna latar baris genap otomatis" : "Subtle shading on alternating rows"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateBlock(selectedBlock.id, {
                          tableData: {
                            ...selectedBlock.tableData!,
                            zebraStriping: !selectedBlock.tableData!.zebraStriping,
                          },
                        })
                      }
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors cursor-pointer",
                        selectedBlock.tableData.zebraStriping
                          ? "bg-stone-900 text-white border-stone-900"
                          : "bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200"
                      )}
                    >
                      {selectedBlock.tableData.zebraStriping ? "ON" : "OFF"}
                    </button>
                  </div>

                  {/* Equalize Columns & Reset Row Heights */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateBlock(selectedBlock.id, {
                          tableData: {
                            ...selectedBlock.tableData!,
                            colWidths: undefined,
                          },
                        })
                      }
                      className="py-1.5 px-2 rounded-lg bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      title={isId ? "Samakan lebar seluruh kolom" : "Distribute column widths equally"}
                    >
                      <Grid3X3 className="w-3 h-3 text-stone-500" />
                      <span>{isId ? "Samakan Kolom" : "Equalize Cols"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateBlock(selectedBlock.id, {
                          tableData: {
                            ...selectedBlock.tableData!,
                            rowHeights: undefined,
                          },
                        })
                      }
                      className="py-1.5 px-2 rounded-lg bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      title={isId ? "Reset tinggi seluruh baris ke otomatis" : "Reset all row heights to auto"}
                    >
                      <RotateCcw className="w-3 h-3 text-stone-500" />
                      <span>{isId ? "Reset Tinggi" : "Auto Row Height"}</span>
                    </button>
                  </div>

                  {/* Quick Add Row / Column / Summary Row */}
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const td = selectedBlock.tableData!;
                        const colCount = td.headers.length;
                        onUpdateBlock(selectedBlock.id, {
                          tableData: {
                            ...td,
                            rows: [...td.rows, Array.from({ length: colCount }, () => "")],
                          },
                        });
                      }}
                      className="py-1.5 px-2 rounded-lg bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isId ? "Baris" : "Row"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const td = selectedBlock.tableData!;
                        const nextColNum = td.headers.length + 1;
                        onUpdateBlock(selectedBlock.id, {
                          tableData: {
                            ...td,
                            headers: [
                              ...td.headers,
                              isId ? `Kolom ${nextColNum}` : `Column ${nextColNum}`,
                            ],
                            rows: td.rows.map((r) => [...r, ""]),
                          },
                        });
                      }}
                      className="py-1.5 px-2 rounded-lg bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isId ? "Kolom" : "Col"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const td = selectedBlock.tableData!;
                        const colCount = td.headers.length;
                        const lastRowIdx = td.rows.length;
                        const summaryRow = Array.from({ length: colCount }, (_, ci) => {
                          if (ci === 0) return "TOTAL";
                          if (lastRowIdx === 0) return "0";
                          const colLetter = String.fromCharCode(65 + (ci % 26));
                          return `=SUM(${colLetter}1:${colLetter}${lastRowIdx})`;
                        });
                        const nextMeta = { ...(td.cellMeta || {}) };
                        for (let ci = 0; ci < colCount; ci++) {
                          nextMeta[`${lastRowIdx}:${ci}`] = {
                            ...(nextMeta[`${lastRowIdx}:${ci}`] || {}),
                            bold: true,
                            backgroundColor: "#F5F5F4",
                            textAlign: ci === 0 ? "left" : "right",
                          };
                        }
                        onUpdateBlock(selectedBlock.id, {
                          tableData: {
                            ...td,
                            rows: [...td.rows, summaryRow],
                            cellMeta: nextMeta,
                          },
                        });
                      }}
                      className="py-1.5 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      title={isId ? "Tambah baris TOTAL (=SUM) otomatis" : "Append automatic TOTAL (=SUM) row"}
                    >
                      <span className="font-mono font-black">Σ</span>
                      <span>Total</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Footer Template Variant Selector & Editable Text Fields */}
              {(selectedBlock.type === "FOOTER" || selectedBlock.type === "FOOTER_BLOCK") && (
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-stone-700 uppercase block mb-1.5">
                      {isId ? "Model Template Footer ERP" : "ERP Footer Template Variant"}
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(
                        [
                          { v: "ERP_STANDARD", label: isId ? "Standar Verifikasi Digital ERP" : "Standard ERP Digital Verification" },
                          { v: "BANK_PAYMENT", label: isId ? "Instruksi Pembayaran & Rekening Bank" : "Bank Account & Payment Instructions" },
                          { v: "ISO_COMPLIANCE", label: isId ? "Kendali Mutu ISO 9001:2015" : "ISO 9001:2015 Quality Control" },
                          { v: "CONFIDENTIAL", label: isId ? "Klausul Kerahasiaan Internal" : "Strict Confidentiality Notice" },
                        ] as const
                      ).map(({ v, label }) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => onUpdateBlock(selectedBlock.id, { footerVariant: v })}
                          className={cn(
                            "p-2 rounded-lg text-left text-[11px] font-bold border transition-all flex items-center justify-between cursor-pointer",
                            (selectedBlock.footerVariant || "ERP_STANDARD") === v
                              ? "bg-stone-900 text-white border-stone-900"
                              : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                          )}
                        >
                          <span>{label}</span>
                          {(selectedBlock.footerVariant || "ERP_STANDARD") === v && (
                            <Check className="w-3.5 h-3.5 text-white" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-stone-200">
                    <div>
                      <label className="text-[9.5px] font-bold text-stone-600 uppercase block mb-0.5">
                        {isId ? "Teks Verifikasi Kiri" : "Left Verification Statement"}
                      </label>
                      <input
                        type="text"
                        value={
                          selectedBlock.footerLeftText ??
                          selectedBlock.title ??
                          "This document is computationally issued and validated. Valid without physical signature."
                        }
                        onChange={(e) =>
                          onUpdateBlock(selectedBlock.id, {
                            footerLeftText: e.target.value,
                            title: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1.5 text-[11px] bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-900"
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-stone-600 uppercase block mb-0.5">
                        {isId ? "Judul Kanan Atas" : "Right Top Document Label"}
                      </label>
                      <input
                        type="text"
                        value={
                          selectedBlock.footerRightText ??
                          selectedBlock.content ??
                          (docType ? docType.replace(/_/g, " ") : "OFFICIAL ERP DOCUMENT")
                        }
                        onChange={(e) =>
                          onUpdateBlock(selectedBlock.id, {
                            footerRightText: e.target.value,
                            content: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1.5 text-[11px] font-bold uppercase bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-900"
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-stone-600 uppercase block mb-0.5">
                        {isId ? "Subjudul Kanan Bawah" : "Right Bottom Subtitle"}
                      </label>
                      <input
                        type="text"
                        value={selectedBlock.subtitle ?? "OFFICIAL WORKSPACE DOCUMENT"}
                        onChange={(e) =>
                          onUpdateBlock(selectedBlock.id, {
                            subtitle: e.target.value,
                          })
                        }
                        className="w-full px-2 py-1.5 text-[11px] uppercase bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-900"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Signature routing config */}
              {isSignature && (
                <div className="p-3 rounded-xl bg-stone-100 border border-stone-200 space-y-3">
                  <div className="font-bold text-stone-900 flex items-center justify-between gap-1.5">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-stone-900" />
                      <span>Signature Routing Target</span>
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-stone-900 text-white">
                      AUTO-ROUTE
                    </span>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-700 block mb-1">
                      Target Department *
                    </label>
                    <select
                      value={selectedBlock.targetDepartment || "HR"}
                      onChange={(e) =>
                        onUpdateBlock(selectedBlock.id, {
                          targetDepartment: e.target.value as TargetDepartment,
                        })
                      }
                      className="w-full text-xs p-2 bg-white border border-stone-300 rounded-lg font-bold text-stone-900 outline-none cursor-pointer"
                    >
                      {ERP_DEPARTMENT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-700 block mb-1">
                      Required Approval Role *
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(["SUPERVISOR", "MANAGER", "FC"] as SignatureApprovalTier[]).map((tier) => {
                        const activeTier = extractTierFromRole(
                          selectedBlock.targetRole,
                          selectedBlock.targetDepartment
                        );
                        return (
                          <button
                            key={tier}
                            type="button"
                            onClick={() =>
                              onUpdateBlock(selectedBlock.id, {
                                targetRole: tier,
                                ...(tier === "FC" ? { targetDepartment: "FC" as TargetDepartment } : {}),
                              })
                            }
                            className={cn(
                              "py-1.5 px-2 rounded-lg text-[10px] font-bold border cursor-pointer transition-colors",
                              activeTier === tier
                                ? "bg-stone-900 text-white border-stone-900"
                                : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                            )}
                          >
                            {tier === "FC" ? "FC" : tier === "SUPERVISOR" ? "Supervisor" : "Manager"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-700 block mb-1">
                      Signatory Title
                    </label>
                    <input
                      type="text"
                      value={selectedBlock.signatoryTitle || ""}
                      onChange={(e) => onUpdateBlock(selectedBlock.id, { signatoryTitle: e.target.value })}
                      className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-medium outline-none focus:border-stone-900"
                    />
                  </div>
                </div>
              )}

              {/* Container size */}
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-stone-700 uppercase flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5 text-stone-700" />
                    <span>Container Size</span>
                  </span>
                  <span className="text-[10px] text-stone-600 font-mono font-bold">
                    {selectedBlock.width ? `${selectedBlock.width}px` : "100%"} ×{" "}
                    {selectedBlock.height ? `${selectedBlock.height}px` : "Auto"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => onUpdateBlock(selectedBlock.id, { width: undefined, height: undefined, x: 0 })}
                    className="py-1 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-900 hover:text-white border border-stone-200 text-stone-700 cursor-pointer transition-colors"
                  >
                    100%
                  </button>
                  <button
                    onClick={() => onUpdateBlock(selectedBlock.id, { width: 540 })}
                    className="py-1 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-900 hover:text-white border border-stone-200 text-stone-700 cursor-pointer transition-colors"
                  >
                    75%
                  </button>
                  <button
                    onClick={() => onUpdateBlock(selectedBlock.id, { width: 360 })}
                    className="py-1 px-2 rounded-lg text-[10px] font-bold bg-white hover:bg-stone-900 hover:text-white border border-stone-200 text-stone-700 cursor-pointer transition-colors"
                  >
                    50%
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <label className="text-[9.5px] font-bold text-stone-500 uppercase block mb-0.5">
                      Width (px)
                    </label>
                    <input
                      type="number"
                      min={180}
                      max={1100}
                      placeholder="Auto (100%)"
                      value={typeof selectedBlock.width === "number" ? selectedBlock.width : ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        onUpdateBlock(selectedBlock.id, {
                          width: Number.isFinite(val) && val > 0 ? val : undefined,
                        });
                      }}
                      className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-900"
                    />
                  </div>
                  <div>
                    <label className="text-[9.5px] font-bold text-stone-500 uppercase block mb-0.5">
                      Min Height (px)
                    </label>
                    <input
                      type="number"
                      min={36}
                      max={1400}
                      placeholder="Auto"
                      value={typeof selectedBlock.height === "number" ? selectedBlock.height : ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        onUpdateBlock(selectedBlock.id, {
                          height: Number.isFinite(val) && val > 0 ? val : undefined,
                        });
                      }}
                      className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-900"
                    />
                  </div>
                </div>
              </div>

              {/* Duplicate / delete */}
              <div className="pt-2 border-t border-stone-100 flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onDuplicateBlock(selectedBlock.id)}
                  className="flex-1 rounded-xl text-xs font-bold gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate</span>
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onDeleteBlock(selectedBlock.id)}
                  className="flex-1 rounded-xl text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </Button>
              </div>
            </div>
          )
        ) : (
          /* ---- Document-level settings ---- */
          <div className="space-y-4">
            {/* Live Routing & HR Fallback Status Card */}
            <div
              className={cn(
                "p-3 rounded-xl border space-y-1.5",
                isHrFallbackRoute
                  ? "bg-amber-50/90 border-amber-200"
                  : "bg-stone-100 border-stone-200"
              )}
            >
              <div className="font-bold text-stone-900 flex items-center justify-between gap-1.5 text-xs">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck
                    className={cn(
                      "w-4 h-4",
                      isHrFallbackRoute ? "text-amber-600" : "text-stone-800"
                    )}
                  />
                  <span>Active Approval Routing</span>
                </span>
                <span
                  className={cn(
                    "text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase",
                    isHrFallbackRoute
                      ? "bg-amber-200/80 text-amber-900"
                      : "bg-stone-900 text-white"
                  )}
                >
                  {isHrFallbackRoute ? "HR FALLBACK" : "SIGNATURE ROUTE"}
                </span>
              </div>
              <div className="text-[11px] text-stone-900">
                Target Department: <b>{activeDeptConfig.deptNameEn}</b>
              </div>
              <div className="text-[10px] text-stone-600 font-mono">
                Target Role: <b>{targetAuthRole}</b>
              </div>
              <p className="text-[10.5px] text-stone-600 leading-snug">
                {isHrFallbackRoute
                  ? "No signature block is placed on the canvas. This document will automatically route to Human Resource (HR) upon submission."
                  : activeDeptConfig.descriptionEn}
              </p>
            </div>

            {/* Pre-Submission Readiness Checker */}
            {readinessChecks.length > 0 && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                <span className="text-[10px] font-bold text-stone-600 uppercase flex items-center justify-between">
                  <span>Pre-Submission Readiness</span>
                  <span className="font-mono text-stone-800">
                    {readinessChecks.filter((c) => c.passed).length}/{readinessChecks.length}
                  </span>
                </span>
                <div className="space-y-1.5">
                  {readinessChecks.map((chk) => (
                    <div
                      key={chk.id}
                      className="flex items-start gap-2 p-2 rounded-lg bg-white border border-stone-200/80 text-[11px]"
                    >
                      {chk.passed ? (
                        <CheckCircle2
                          className={cn(
                            "w-3.5 h-3.5 shrink-0 mt-0.5",
                            chk.isWarning ? "text-amber-500" : "text-emerald-600"
                          )}
                        />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-stone-800 leading-tight">{chk.label}</div>
                        <div className="text-[10px] text-stone-500 truncate">{chk.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Doc type & department */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
              <span className="text-[10px] font-bold text-stone-600 uppercase block">
                Document Settings
              </span>
              <div>
                <label className="text-[9px] text-stone-500 font-bold block mb-0.5">
                  Document Type
                </label>
                <select
                  value={docType}
                  onChange={(e) => onDocTypeChange(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-bold outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="MEMORANDUM">Memorandum</option>
                  <option value="INTERNAL_POLICY">Internal Policy / SOP</option>
                  <option value="AUTHORIZATION_LETTER">Authorization Letter</option>
                  <option value="SURAT_PERINTAH">Work Order Letter</option>
                  <option value="BERITA_ACARA">Handover Certificate</option>
                  <option value="LAINNYA">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] text-stone-500 font-bold block mb-0.5">
                  Authoring Department
                </label>
                <select
                  value={normalizeDepartmentToRole(department)}
                  onChange={(e) => onDepartmentChange(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-medium outline-none focus:border-amber-500 cursor-pointer"
                >
                  {ERP_DEPARTMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-stone-500 font-bold block mb-0.5">
                  Target Authorization Department
                </label>
                <select
                  value={targetAuthDept}
                  onChange={(e) => onTargetAuthDeptChange(e.target.value as TargetDepartment)}
                  className="w-full text-xs p-2 bg-white border border-stone-300 rounded-lg font-bold text-stone-900 outline-none focus:border-stone-900 cursor-pointer"
                >
                  {ERP_DEPARTMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {onTargetAuthRoleChange && (
                <div>
                  <label className="text-[9px] text-stone-500 font-bold block mb-1">
                    Target Approval Role Tier
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["SUPERVISOR", "MANAGER", "FC"] as SignatureApprovalTier[]).map((tier) => {
                      const activeTier = extractTierFromRole(targetAuthRole, targetAuthDept);
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => onTargetAuthRoleChange(tier)}
                          className={cn(
                            "py-1.5 px-2 rounded-lg text-[10px] font-bold border cursor-pointer transition-colors",
                            activeTier === tier
                              ? "bg-stone-900 text-white border-stone-900"
                              : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100"
                          )}
                        >
                          {tier === "FC" ? "FC" : tier === "SUPERVISOR" ? "Supervisor" : "Manager"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="text-[9px] text-stone-500 font-bold block mb-0.5">
                  Authorizer Name (optional)
                </label>
                <input
                  type="text"
                  value={targetAuthName}
                  onChange={(e) => onTargetAuthNameChange(e.target.value)}
                  placeholder="e.g. Mr. Haryanto"
                  className="w-full text-xs p-2 bg-white border border-stone-200 rounded-lg font-medium outline-none focus:border-stone-900"
                />
              </div>
            </div>

            {/* Layout preset & Custom Dimensions */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
              <span className="text-[10px] font-bold text-stone-600 uppercase block">
                Paper Format & Size
              </span>
              <select
                value={layoutPreset}
                onChange={(e) => onLayoutPresetChange(e.target.value as LayoutPreset)}
                className="w-full text-xs p-2 bg-white border border-stone-300 rounded-lg font-bold text-stone-900 outline-none focus:border-stone-900 cursor-pointer"
              >
                {PAPER_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {layoutPreset === "CUSTOM" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5">
                      Width (mm)
                    </label>
                    <input
                      type="number"
                      min={60}
                      max={600}
                      value={customWidthMm}
                      onChange={(e) =>
                        onCustomWidthMmChange?.(
                          Math.max(60, Math.min(600, Number(e.target.value) || 210))
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-900"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5">
                      Height (mm)
                    </label>
                    <input
                      type="number"
                      min={80}
                      max={840}
                      value={customHeightMm}
                      onChange={(e) =>
                        onCustomHeightMmChange?.(
                          Math.max(80, Math.min(840, Number(e.target.value) || 297))
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono font-bold bg-white border border-stone-200 rounded-lg outline-none focus:border-stone-900"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sequential Multi-Signer Progress Tracker */}
            {signerChain.length > 0 && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                <span className="text-[10px] font-bold text-stone-600 uppercase block">
                  Sequential Signer Chain ({signerChain.length})
                </span>
                <div className="space-y-1.5">
                  {signerChain.map((step: any) => (
                    <div
                      key={step.step}
                      className="p-2 rounded-lg bg-white border border-stone-200 flex items-center justify-between text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-stone-900 truncate">
                          Step #{step.step}: {step.department}
                        </div>
                        <div className="text-[10px] text-stone-500 font-mono truncate">
                          {step.signatoryTitle}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                          step.status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        )}
                      >
                        {step.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revision History Timeline */}
            {versions && versions.length > 0 && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                <span className="text-[10px] font-bold text-stone-600 uppercase block">
                  Revision History ({versions.length})
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                  {versions.map((ver: any) => (
                    <div
                      key={ver.id || ver.version}
                      className="p-2 rounded-lg bg-white border border-stone-200 text-[10.5px]"
                    >
                      <div className="flex items-center justify-between font-bold text-stone-800">
                        <span>Version v{ver.version}</span>
                        <span className="text-[9.5px] font-mono text-stone-400">
                          {ver.created_at
                            ? new Date(ver.created_at).toLocaleDateString("en-GB")
                            : ""}
                        </span>
                      </div>
                      <div className="text-[10px] text-stone-500 truncate">
                        {ver.change_summary || ver.changeSummary || `Saved by ${ver.created_by_username || "User"}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Structure / layers list */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-stone-600 uppercase block">
                Document Structure
              </span>
              <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
                {blocks.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => onSelectBlock(b.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white border border-transparent hover:border-stone-200 transition-all cursor-pointer"
                  >
                    <span className="text-[9px] font-mono font-bold text-stone-400 w-5 shrink-0">{i + 1}</span>
                    <span className="text-[11px] font-bold text-stone-700 truncate flex-1">
                      {BLOCK_TYPE_LABELS[b.type] || b.type}
                    </span>
                    {(b.type === "OFFICIAL_LETTERHEAD" || b.type === "FOOTER" || b.type === "FOOTER_BLOCK" || b.isLocked) && (
                      <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function LayerPanel({
  state,
  mode,
}: {
  state: CanvaStudioState;
  mode: "left-desktop" | "right-desktop" | "overlays";
}) {
  const {
    isId,
    insertBlock,
    libraryQuery,
    setLibraryQuery,
    sidebarTab,
    setSidebarTab,
    filteredLibrary,
    blocks,
    selectedBlock,
    setSelectedBlockId,
    updateBlock,
    deleteBlock,
    duplicateBlock,
    moveBlock,
    resetBlockPosition,
    snapBlockOnCanvas,
    docType,
    setDocType,
    setDirty,
    department,
    setDepartment,
    layoutPreset,
    setLayoutPreset,
    customWidthMm,
    setCustomWidthMm,
    customHeightMm,
    setCustomHeightMm,
    targetAuthName,
    setTargetAuthName,
    targetAuthDept,
    targetAuthRole,
    isHrFallbackRoute,
    handleChangeTargetDepartment,
    handleChangeTargetRole,
    activeDeptConfig,
    readinessChecks,
    signerChain,
    versions,
    showLeftPanel,
    setShowLeftPanel,
    showRightPanel,
    setShowRightPanel,
    rightInspectorOpen,
    setRightInspectorOpen,
    layoutMode,
    quickInsertIndex,
    setQuickInsertIndex,
  } = state;

  const renderLibraryItem = (item: LibraryItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        draggable={!item.locked}
        onDragStart={(e) => {
          if (item.locked) return;
          e.dataTransfer.setData(LIB_DRAG_MIME, item.key);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => insertBlock(item, null)}
        className={cn(
          "w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer group flex items-start gap-2.5",
          item.locked
            ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50"
            : "border-stone-200 bg-white hover:border-stone-900 hover:bg-stone-50/80 hover:shadow-2xs"
        )}
        title={
          item.locked
            ? "Permanently installed on canvas"
            : "Click to insert, or drag onto the canvas"
        }
      >
        <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", item.accent)}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-stone-900 truncate">
              {item.labelEn}
            </span>
            {item.locked && <Lock className="w-3 h-3 text-amber-600 shrink-0" />}
          </span>
          <span className="block text-[10.5px] text-stone-500 leading-snug mt-0.5 line-clamp-2">
            {item.descEn}
          </span>
        </span>
        <span className="shrink-0 mt-1 text-stone-300 group-hover:text-stone-900 transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </span>
      </button>
    );
  };

  const renderLibrary = () => (
    <>
      {/* Search & 4 Clear Category Tabs */}
      <div className="p-3 border-b border-stone-200/80 space-y-2.5 bg-stone-50/60">
        <div className="relative">
          <input
            type="text"
            value={libraryQuery}
            onChange={(e) => setLibraryQuery(e.target.value)}
            placeholder="Search block templates…"
            className="w-full pl-8 pr-7 py-2 text-xs bg-white border border-stone-200 rounded-xl outline-none focus:border-stone-900 font-medium"
          />
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          {libraryQuery && (
            <button
              type="button"
              onClick={() => setLibraryQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 bg-stone-200/70 p-1 rounded-xl">
          {(
            [
              { key: "BODY_TEXT", labelId: "Konten", labelEn: "Content" },
              { key: "ADDRESS_TEMPLATE", labelId: "Alamat", labelEn: "Address" },
              { key: "SIGNATURE_COLUMN", labelId: "Otorisasi", labelEn: "Sign-off" },
              { key: "FOOTER_TEMPLATE", labelId: "Footer", labelEn: "Footer" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setSidebarTab(tab.key);
                setLibraryQuery("");
              }}
              className={cn(
                "py-1.5 px-1 rounded-lg text-[10px] font-bold tracking-tight transition-all cursor-pointer text-center truncate",
                sidebarTab === tab.key && !libraryQuery
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "text-stone-600 hover:text-stone-900 hover:bg-white/50"
              )}
            >
              {tab.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {filteredLibrary.length === 0 && (
          <div className="text-center py-8 text-stone-400 text-xs space-y-2">
            <Search className="w-6 h-6 mx-auto text-stone-300" />
            <p>No matching blocks.</p>
          </div>
        )}
        {(Object.keys(CATEGORY_META) as BlockCategory[]).map((cat) => {
          const items = filteredLibrary.filter((i) => i.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center justify-between">
                <span>{CATEGORY_META[cat].labelEn}</span>
                <span className="text-[9px] font-mono text-stone-400">{items.length}</span>
              </div>
              {cat === "SIGNATURE_COLUMN" && (
                <div className="bg-stone-100 border border-stone-200 rounded-xl p-2 text-[10px] text-stone-700 leading-snug flex gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-stone-900 shrink-0 mt-0.5" />
                  <span>
                    Adding a signature block auto-routes the document to that department. Without a signature, it routes to HR.
                  </span>
                </div>
              )}
              <div className="space-y-1.5">{items.map(renderLibraryItem)}</div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="p-2.5 border-t border-stone-200/80 bg-stone-50/60 text-[10px] text-stone-500 flex items-center gap-1.5">
        <GripVertical className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        <span>Click or drag blocks onto the sheet.</span>
      </div>
    </>
  );

  if (mode === "left-desktop") {
    return (
      <aside className="hidden lg:flex w-72 xl:w-80 bg-white border-r border-stone-200/90 flex-col shrink-0 z-10">
        {renderLibrary()}
      </aside>
    );
  }

  if (mode === "right-desktop") {
    if (!rightInspectorOpen || layoutMode === "FOCUS") return null;
    return (
        <aside className="hidden lg:flex w-72 xl:w-80 bg-white border-l border-stone-200/90 flex-col shrink-0 z-10">
          <StudioInspector
            isId={isId}
            blocks={blocks}
            selectedBlock={selectedBlock}
            selectedIndex={selectedBlock ? blocks.findIndex((b) => b.id === selectedBlock.id) : -1}
            onSelectBlock={setSelectedBlockId}
            onUpdateBlock={updateBlock}
            onDeleteBlock={deleteBlock}
            onDuplicateBlock={duplicateBlock}
            onMoveBlock={moveBlock}
            onResetPosition={resetBlockPosition}
            onSnapBlockCanvas={snapBlockOnCanvas}
            docType={docType}
            onDocTypeChange={(v) => {
              setDocType(v);
              setDirty(true);
            }}
            department={department}
            onDepartmentChange={(v) => {
              setDepartment(v);
              setDirty(true);
            }}
            layoutPreset={layoutPreset}
            onLayoutPresetChange={(v) => {
              setLayoutPreset(v);
              setDirty(true);
            }}
            customWidthMm={customWidthMm}
            onCustomWidthMmChange={(v) => {
              setCustomWidthMm(v);
              setDirty(true);
            }}
            customHeightMm={customHeightMm}
            onCustomHeightMmChange={(v) => {
              setCustomHeightMm(v);
              setDirty(true);
            }}
            targetAuthName={targetAuthName}
            onTargetAuthNameChange={(v) => {
              setTargetAuthName(v);
              setDirty(true);
            }}
            targetAuthDept={targetAuthDept}
            targetAuthRole={targetAuthRole}
            isHrFallbackRoute={isHrFallbackRoute}
            onTargetAuthDeptChange={handleChangeTargetDepartment}
            onTargetAuthRoleChange={handleChangeTargetRole}
            activeDeptConfig={activeDeptConfig}
            readinessChecks={readinessChecks}
            signerChain={signerChain}
            versions={versions}
            onCollapse={() => setRightInspectorOpen(false)}
          />
        </aside>
    );
  }

  return (
    <>
      {/* ============ 5. MOBILE DRAWERS ============ */}
      {showLeftPanel && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-stone-950/40" onClick={() => setShowLeftPanel(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="p-3 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wide text-stone-900">
                Block Library
              </span>
              <button
                onClick={() => setShowLeftPanel(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderLibrary()}
          </aside>
        </div>
      )}

      {showRightPanel && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-stone-950/40" onClick={() => setShowRightPanel(false)} />
          <aside className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-3 border-b border-stone-200 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wide text-stone-900">
                Inspector & Settings
              </span>
              <button
                onClick={() => setShowRightPanel(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <StudioInspector
              isId={isId}
              blocks={blocks}
              selectedBlock={selectedBlock}
              selectedIndex={selectedBlock ? blocks.findIndex((b) => b.id === selectedBlock.id) : -1}
              onSelectBlock={(id) => {
                setSelectedBlockId(id);
                if (id) setShowRightPanel(false);
              }}
              onUpdateBlock={updateBlock}
              onDeleteBlock={(id) => {
                deleteBlock(id);
                setShowRightPanel(false);
              }}
              onDuplicateBlock={duplicateBlock}
              onMoveBlock={moveBlock}
              onResetPosition={resetBlockPosition}
              onSnapBlockCanvas={snapBlockOnCanvas}
              docType={docType}
              onDocTypeChange={(v) => {
                setDocType(v);
                setDirty(true);
              }}
              department={department}
              onDepartmentChange={(v) => {
                setDepartment(v);
                setDirty(true);
              }}
              layoutPreset={layoutPreset}
              onLayoutPresetChange={(v) => {
                setLayoutPreset(v);
                setDirty(true);
              }}
              customWidthMm={customWidthMm}
              onCustomWidthMmChange={(v) => {
                setCustomWidthMm(v);
                setDirty(true);
              }}
              customHeightMm={customHeightMm}
              onCustomHeightMmChange={(v) => {
                setCustomHeightMm(v);
                setDirty(true);
              }}
              targetAuthName={targetAuthName}
              onTargetAuthNameChange={(v) => {
                setTargetAuthName(v);
                setDirty(true);
              }}
              targetAuthDept={targetAuthDept}
              targetAuthRole={targetAuthRole}
              isHrFallbackRoute={isHrFallbackRoute}
              onTargetAuthDeptChange={handleChangeTargetDepartment}
              onTargetAuthRoleChange={handleChangeTargetRole}
              activeDeptConfig={activeDeptConfig}
              readinessChecks={readinessChecks}
              signerChain={signerChain}
              versions={versions}
            />
          </aside>
        </div>
      )}

      {/* ============ 6. QUICK INSERT PICKER ============ */}
      {quickInsertIndex !== null && (
        <div
          className="fixed inset-0 z-[65] flex items-center justify-center bg-stone-950/30 p-4"
          onClick={() => setQuickInsertIndex(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-stone-900">
                  {isId ? "Sisipkan Blok Baru" : "Insert New Block"}
                </div>
                <div className="text-[11px] text-stone-500">
                  {isId
                    ? `Blok akan ditempatkan pada posisi #${quickInsertIndex + 1} dokumen.`
                    : `Block will be placed at position #${quickInsertIndex + 1}.`}
                </div>
              </div>
              <button
                onClick={() => setQuickInsertIndex(null)}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 custom-scrollbar">
              {LIBRARY_ITEMS.filter((i) => !i.locked).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => insertBlock(item, quickInsertIndex)}
                    className="text-left p-2.5 rounded-xl border border-stone-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 transition-all cursor-pointer flex items-start gap-2.5"
                  >
                    <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", item.accent)}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-stone-900 truncate">
                        {isId ? item.labelId : item.labelEn}
                      </span>
                      <span className="block text-[10px] text-stone-500 leading-snug mt-0.5 line-clamp-2">
                        {isId ? item.descId : item.descEn}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
