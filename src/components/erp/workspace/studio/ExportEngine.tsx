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
import { OFFICIAL_KOP_SURAT_BLOCK, getPaperDimensions } from "./config";
import type { CanvaStudioState } from "./useStudioState";

export function useExportEngine(state: CanvaStudioState) {
  const {
    isId,
    documentId,
    docTitle,
    setDocTitle,
    docType,
    department,
    layoutPreset,
    customWidthMm,
    customHeightMm,
    initialStatus,
    targetAuthDept,
    targetAuthRole,
    blocksRef,
    applyBlocks,
    notify,
    sheetRef,
    viewMode,
    setViewMode,
    zoomLevel,
    setZoomLevel,
    selectedBlockId,
    setSelectedBlockId,
    showGrid,
    setShowGrid,
    setIsExportingPdf,
  } = state;

  const handlePrint = useCallback(() => {
    setViewMode("preview");
    setZoomLevel(100);
    setSelectedBlockId(null);
    document.body.classList.add("printing-workspace");
    setTimeout(() => {
      window.print();
    }, 60);
  }, []);

  const handleImportDocx = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const arrayBuf = await file.arrayBuffer();
        const parsed = parseDocxPackageToBlocks(new Uint8Array(arrayBuf));
        if (!parsed.blocks || parsed.blocks.length === 0) {
          notify(
            isId
              ? "Tidak ditemukan blok konten yang valid di dalam file .DOCX tersebut."
              : "No valid document blocks found in the .DOCX file.",
            "error"
          );
          return;
        }
        const nonKopImported = parsed.blocks.filter(
          (b) => b.type !== "OFFICIAL_LETTERHEAD" && b.type !== "letterhead"
        );
        const currentKop =
          blocksRef.current.find((b) => b.type === "OFFICIAL_LETTERHEAD") || OFFICIAL_KOP_SURAT_BLOCK;
        const existingSig = blocksRef.current.find(
          (b) =>
            b.type === "SIGNATURE_COLUMN" ||
            b.type === "SIGNATURE_STAMP" ||
            b.type === "DUAL_SIGNATURE"
        );
        const importedHasSig = nonKopImported.some(
          (b) =>
            b.type === "SIGNATURE_COLUMN" ||
            b.type === "SIGNATURE_STAMP" ||
            b.type === "DUAL_SIGNATURE"
        );
        const nextBlocks: DocBlock[] = [
          { ...OFFICIAL_KOP_SURAT_BLOCK, ...currentKop, isLocked: true },
          ...nonKopImported,
          ...(!importedHasSig && existingSig ? [existingSig] : []),
        ];
        applyBlocks(nextBlocks);
        if (!docTitle || docTitle === "Untitled Document" || docTitle === "Dokumen Baru Tanpa Judul" || docTitle === "New Blank Document") {
          const cleanFileName = file.name.replace(/\.docx$/i, "").replace(/[_-]+/g, " ");
          if (cleanFileName) setDocTitle(cleanFileName);
        }
        notify(
          isId
            ? `Berhasil mengimpor ${nonKopImported.length} blok dari "${file.name}".`
            : `Imported ${nonKopImported.length} blocks from "${file.name}".`,
          "success"
        );
      } catch {
        notify(
          isId ? "Gagal membaca paket file .DOCX." : "Failed to parse .DOCX package.",
          "error"
        );
      }
    },
    [applyBlocks, docTitle, isId, notify]
  );

  const handleExportDocx = useCallback(() => {
    try {
      const safeCode = (docTitle || documentId || "ERP_Document")
        .trim()
        .replace(/[^a-zA-Z0-9-_]/g, "_");
      const generated = generateDocxBinaryBuffer({
        id: documentId || "DOC-STUDIO",
        document_code: documentId || safeCode,
        title: docTitle || "Official ERP Document",
        document_type: docType,
        department,
        layout_preset: layoutPreset,
        custom_width_mm: customWidthMm,
        custom_height_mm: customHeightMm,
        status: initialStatus || "DRAFT",
        blocks: blocksRef.current,
      });
      const blob = new Blob([generated.buffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${safeCode}.docx`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify(
        isId ? "Berkas .DOCX berhasil diekspor." : ".DOCX package exported.",
        "success"
      );
    } catch {
      notify(isId ? "Gagal mengekspor .DOCX." : "Failed to export .DOCX.", "error");
    }
  }, [docTitle, documentId, docType, department, layoutPreset, customWidthMm, customHeightMm, initialStatus, isId, notify]);

  const handleExportPdf = useCallback(async () => {
    const safeCode = (docTitle || documentId || "ERP_Document")
      .trim()
      .replace(/[^a-zA-Z0-9-_]/g, "_");
    const filename = `${safeCode}_${layoutPreset}.pdf`;
    const paperDims = getPaperDimensions(layoutPreset, customWidthMm, customHeightMm);

    if (sheetRef.current) {
      const prevMode = viewMode;
      const prevZoom = zoomLevel;
      const prevSelected = selectedBlockId;
      const prevGrid = showGrid;
      try {
        setIsExportingPdf(true);
        setSelectedBlockId(null);
        setShowGrid(false);
        setViewMode("preview");
        setZoomLevel(100);
        await new Promise((r) => setTimeout(r, 140));

        await generatePDF(sheetRef.current, filename, {
          orientation: paperDims.orientation,
          format: [paperDims.widthMm, paperDims.heightMm],
          marginMm: 0,
        });
        notify(
          isId
            ? `PDF Presisi (${paperDims.shortLabel}) berhasil diunduh.`
            : `Precision PDF (${paperDims.shortLabel}) exported.`,
          "success"
        );
        return;
      } catch (err) {
        console.error("High-DPI PDF capture fallback:", err);
      } finally {
        setViewMode(prevMode);
        setZoomLevel(prevZoom);
        setSelectedBlockId(prevSelected);
        setShowGrid(prevGrid);
        setIsExportingPdf(false);
      }
    }

    try {
      const generated = generateDeterministicPdfBuffer({
        id: documentId || "DOC-STUDIO",
        document_code: documentId || safeCode,
        title: docTitle || "Official ERP Document",
        document_type: docType,
        department,
        layout_preset: layoutPreset,
        custom_width_mm: customWidthMm,
        custom_height_mm: customHeightMm,
        status: initialStatus || "DRAFT",
        authorization_department: targetAuthDept,
        authorization_role: targetAuthRole,
        blocks: blocksRef.current,
      });
      const blob = new Blob([generated.buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = filename;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify(
        isId ? `PDF (${paperDims.shortLabel}) berhasil diunduh.` : `PDF (${paperDims.shortLabel}) exported.`,
        "success"
      );
    } catch {
      notify(isId ? "Gagal mengekspor PDF." : "Failed to export PDF.", "error");
    }
  }, [docTitle, documentId, docType, department, layoutPreset, customWidthMm, customHeightMm, initialStatus, targetAuthDept, targetAuthRole, viewMode, zoomLevel, selectedBlockId, showGrid, isId, notify]);

  return {
    handlePrint,
    handleImportDocx,
    handleExportDocx,
    handleExportPdf,
  };
}

export type StudioExportHandlers = ReturnType<typeof useExportEngine>;

export function ExportEngine({
  state,
}: {
  state: CanvaStudioState;
  exportHandlers?: StudioExportHandlers;
}) {
  const {
    isId,
    notice,
    setNotice,
    showCloseConfirm,
    setShowCloseConfirm,
    handleSave,
    isSaving,
    setDirty,
    onClose,
    showShortcuts,
    setShowShortcuts,
  } = state;

  return (
    <>
      {/* ============ 4. FLOATING NOTICE PILL ============ */}
      {notice && (
        <div
          key={notice.id}
          className={cn(
            "fixed bottom-12 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200",
            notice.tone === "success" && "bg-emerald-600 text-white",
            notice.tone === "error" && "bg-rose-600 text-white",
            notice.tone === "info" && "bg-stone-900 text-white"
          )}
        >
          {notice.tone === "success" ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : notice.tone === "error" ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          )}
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ============ 7. UNSAVED CHANGES CONFIRM ============ */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4.5 h-4.5" />
              </span>
              <div>
                <div className="text-sm font-black text-stone-900">
                  {isId ? "Perubahan belum disimpan" : "Unsaved changes"}
                </div>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  {isId
                    ? "Ada perubahan pada dokumen yang belum tersimpan. Simpan sebagai draft sebelum keluar?"
                    : "This document has unsaved changes. Save as draft before leaving?"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={async () => {
                  setShowCloseConfirm(false);
                  await handleSave(false, true);
                }}
                disabled={isSaving}
                variant="primary"
                className="rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold w-full"
              >
                {isId ? "Simpan Draft & Keluar" : "Save Draft & Exit"}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowCloseConfirm(false)}
                  variant="outline"
                  className="rounded-xl text-xs font-bold flex-1 border-stone-200"
                >
                  {isId ? "Lanjut Mengedit" : "Keep Editing"}
                </Button>
                <Button
                  onClick={() => {
                    setDirty(false);
                    setShowCloseConfirm(false);
                    onClose();
                  }}
                  variant="outline"
                  className="rounded-xl text-xs font-bold flex-1 text-rose-600 border-rose-200 hover:bg-rose-50"
                >
                  {isId ? "Keluar Tanpa Simpan" : "Exit Without Saving"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ 8. SHORTCUTS HELP ============ */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-black text-stone-900 flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-stone-500" />
                {isId ? "Pintasan Keyboard" : "Keyboard Shortcuts"}
              </div>
              <button
                onClick={() => setShowShortcuts(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="divide-y divide-stone-100 text-xs">
              {[
                ["Arrow Keys (←↑→↓)", isId ? "Geser presisi blok 1px (Shift + Panah = 10px)" : "Micro-nudge block 1px (Shift + Arrow = 10px)"],
                ["Ctrl / Cmd + Z", isId ? "Urungkan perubahan" : "Undo"],
                ["Ctrl / Cmd + Shift + Z", isId ? "Ulangi perubahan" : "Redo"],
                ["Ctrl / Cmd + S", isId ? "Simpan draft (tanpa keluar)" : "Save draft (stay open)"],
                ["Ctrl / Cmd + Shift + S", isId ? "Simpan & kirim untuk otorisasi" : "Save & submit for approval"],
                ["Ctrl / Cmd + D", isId ? "Duplikat blok terpilih" : "Duplicate selected block"],
                ["Delete / Backspace", isId ? "Hapus blok terpilih" : "Delete selected block"],
                ["Ctrl / Cmd + (+ / - / 0)", isId ? "Zoom masuk / keluar / reset" : "Zoom in / out / reset"],
                ["Esc", isId ? "Batal pilih blok / tutup panel" : "Deselect block / close panel"],
              ].map(([keys, label]) => (
                <div key={keys} className="flex items-center justify-between py-2">
                  <span className="text-stone-600 font-medium">{label}</span>
                  <kbd className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 font-mono text-[10px] font-bold text-stone-700">
                    {keys}
                  </kbd>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-stone-100 border border-stone-200 text-[11px] text-stone-800 leading-snug">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-stone-600" />
              <span>
                {isId
                  ? "Seret gagang ⋮⋮ pada blok terpilih untuk mengubah urutan, atau seret blok dari panel kiri langsung ke kanvas."
                  : "Drag the ⋮⋮ grip on a selected block to reorder, or drag blocks from the left panel straight onto the canvas."}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
