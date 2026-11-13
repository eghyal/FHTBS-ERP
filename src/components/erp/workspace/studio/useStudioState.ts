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
  WorkspaceSignerStep,
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
  CanvaStudioEditorProps,
  DEPARTMENT_ROUTING_CONFIG,
  OFFICIAL_KOP_SURAT_BLOCK,
  LibraryItem,
  LIBRARY_ITEMS,
  BLOCK_TYPE_LABELS,
  newBlockId,
  buildBlock,
  DragGuideState,
  ResizeState,
  DragState,
  HISTORY_LIMIT,
  getPaperDimensions,
  resolveCanonicalRoleForDeptAndTier,
  extractTierFromRole,
  getSignatoryTitleForDeptAndTier,
  SignatureApprovalTier,
} from "./config";

export function useCanvaStudioState({
  documentId,
  initialDocumentCode,
  initialTitle,
  initialDocType,
  initialDepartment,
  initialAuthRole,
  initialAuthDepartment = "HR",
  initialAuthName = "",
  initialBlocks,
  initialLayoutPreset = "A4_PORTRAIT",
  initialCustomWidthMm = 210,
  initialCustomHeightMm = 297,
  initialStatus,
  versions = [],
  events = [],
  onClone,
  onSave,
  onClose,
  isSaving,
  isId: _isIdProp = false,
}: CanvaStudioEditorProps) {
  const isId = false;
  const documentCode = initialDocumentCode || documentId || null;
  const [docTitle, setDocTitle] = useState(initialTitle || "Untitled Document");
  const [docType, setDocType] = useState(initialDocType || "MEMORANDUM");
  const [department, setDepartment] = useState(initialDepartment || "General");
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>(initialLayoutPreset);
  const [customWidthMm, setCustomWidthMm] = useState<number>(initialCustomWidthMm || 210);
  const [customHeightMm, setCustomHeightMm] = useState<number>(initialCustomHeightMm || 297);

  /* ---------- Routing (auto-triggered by signature blocks, fallback to HR when none) ---------- */
  const initialSigBlocks = (initialBlocks || []).filter(
    (b) => b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE"
  );
  const initialHasSig = initialSigBlocks.length > 0;
  const initialPrimarySig = initialSigBlocks[initialSigBlocks.length - 1];
  const computedInitialDept: TargetDepartment = initialHasSig
    ? ((initialPrimarySig?.targetDepartment as TargetDepartment) ||
        (initialAuthDepartment as TargetDepartment) ||
        "HR")
    : "HR";
  const computedInitialRole: string = initialHasSig
    ? resolveCanonicalRoleForDeptAndTier(
        computedInitialDept,
        initialPrimarySig?.targetRole || initialAuthRole || "MANAGER"
      )
    : "HR_MANAGER";

  const [targetAuthRole, setTargetAuthRole] = useState<string>(computedInitialRole);
  const [targetAuthDept, setTargetAuthDept] = useState<TargetDepartment>(computedInitialDept);
  const [targetAuthName, setTargetAuthName] = useState(initialAuthName || "");
  const [isHrFallbackRoute, setIsHrFallbackRoute] = useState<boolean>(!initialHasSig);

  /* ---------- Canvas blocks + undo/redo history ---------- */
  const normalizeBlocksStructure = useCallback((rawList: DocBlock[]): DocBlock[] => {
    let list = rawList && rawList.length > 0 ? [...rawList] : [];
    const kopIndex = list.findIndex((b) => b.type === "OFFICIAL_LETTERHEAD");
    let kopBlock: DocBlock;
    if (kopIndex === -1) {
      kopBlock = { ...OFFICIAL_KOP_SURAT_BLOCK, isLocked: true, width: "100%", x: 0, y: 0 };
    } else {
      const existingKop = list.splice(kopIndex, 1)[0];
      kopBlock = { ...OFFICIAL_KOP_SURAT_BLOCK, ...existingKop, isLocked: true, width: "100%", x: 0, y: 0 };
    }

    const footerBlocks = list
      .filter((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK")
      .map((b) => ({ ...b, width: "100%", x: 0, y: 0 }));
    const bodyBlocks = list.filter(
      (b) => b.type !== "OFFICIAL_LETTERHEAD" && b.type !== "FOOTER" && b.type !== "FOOTER_BLOCK"
    );
    // Keep only the latest footer block pinned at the bottom if one exists; allow zero footers when deleted by user
    const pinnedFooter: DocBlock[] =
      footerBlocks.length > 0 ? [footerBlocks[footerBlocks.length - 1]] : [];

    return [kopBlock, ...bodyBlocks, ...pinnedFooter].map((b) => normalizeBlockAlignment(b));
  }, []);

  const [blocks, setBlocksState] = useState<DocBlock[]>(() =>
    normalizeBlocksStructure(initialBlocks && initialBlocks.length > 0 ? [...initialBlocks] : [])
  );
  const blocksRef = useRef(blocks);
  const [past, setPast] = useState<DocBlock[][]>([]);
  const [future, setFuture] = useState<DocBlock[][]>([]);
  const historyBatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchPending = useRef(false);

  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  /* ---------- Selection & interaction ---------- */
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [liveDimensions, setLiveDimensions] = useState<{ width: number; height: number } | null>(null);
  const [alignGuides, setAlignGuides] = useState<DragGuideState | null>(null);

  // Floating text selection formatting toolbar
  const [selectionToolbar, setSelectionToolbar] = useState<{
    visible: boolean;
    x: number;
    y: number;
    selectedText: string;
    targetInput: HTMLInputElement | HTMLTextAreaElement | null;
    blockId?: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    selectedText: "",
    targetInput: null,
    blockId: null,
  });

  // HTML5 drag & drop reorder / library insert
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ id: string; pos: "before" | "after" } | null>(null);

  // Hover Popover Tooltip for canvas blocks
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [hoveredBlockRect, setHoveredBlockRect] = useState<{ width: number; height: number } | null>(null);

  // Table Column & Row Resizing state
  const [tableResizing, setTableResizing] = useState<{
    blockId: string;
    type: "col" | "row";
    index: number;
    startX: number;
    startY: number;
    initialSize: number;
  } | null>(null);

  const handleTableColResizeStart = useCallback(
    (e: React.MouseEvent, blockId: string, colIndex: number, currentWidth: number) => {
      e.stopPropagation();
      e.preventDefault();
      setTableResizing({
        blockId,
        type: "col",
        index: colIndex,
        startX: e.clientX,
        startY: e.clientY,
        initialSize: currentWidth || 120,
      });
    },
    []
  );

  const handleTableRowResizeStart = useCallback(
    (e: React.MouseEvent, blockId: string, rowIndex: number, currentHeight: number) => {
      e.stopPropagation();
      e.preventDefault();
      setTableResizing({
        blockId,
        type: "row",
        index: rowIndex,
        startX: e.clientX,
        startY: e.clientY,
        initialSize: currentHeight || 36,
      });
    },
    []
  );

  /* ---------- Studio chrome ---------- */
  const [sidebarTab, setSidebarTab] = useState<BlockCategory>("BODY_TEXT");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [showLeftPanel, setShowLeftPanel] = useState(false); // mobile drawer
  const [showRightPanel, setShowRightPanel] = useState(false); // mobile drawer
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [quickInsertIndex, setQuickInsertIndex] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [notice, setNotice] = useState<{ id: number; text: string; tone: "info" | "success" | "error" } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const blocksContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const docxInputRef = useRef<HTMLInputElement | null>(null);

  const notify = useCallback((text: string, tone: "info" | "success" | "error" = "info") => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ id: Date.now(), text, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  /* ---------- Routing sync (auto-routes from signature blocks; falls back to HR when 0 signature blocks exist) ---------- */
  const routingDeptRef = useRef<string>(`${targetAuthDept}:${targetAuthRole}:${isHrFallbackRoute ? "FALLBACK" : "SIG"}`);
  const syncRoutingFromBlocks = useCallback(
    (list: DocBlock[]) => {
      const sigBlocks = list.filter(
        (b) => b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE"
      );

      // Rule: If there are NO signature blocks in the document, automatically route to Human Resource (HR)
      if (sigBlocks.length === 0) {
        const nextKey = "HR:HR_MANAGER:FALLBACK";
        setTargetAuthDept("HR");
        setTargetAuthRole("HR_MANAGER");
        setIsHrFallbackRoute(true);
        if (routingDeptRef.current !== nextKey) {
          routingDeptRef.current = nextKey;
          notify(
            "No signature block detected — document automatically routed to Human Resource (HR).",
            "info"
          );
        }
        return;
      }

      const sig = sigBlocks[sigBlocks.length - 1];
      const dept: TargetDepartment = (sig.targetDepartment as TargetDepartment) || "HR";
      const config = DEPARTMENT_ROUTING_CONFIG[dept] || DEPARTMENT_ROUTING_CONFIG.HR;
      const resolvedRole = resolveCanonicalRoleForDeptAndTier(dept, sig.targetRole || config.role);
      const nextKey = `${dept}:${resolvedRole}:SIG`;

      setTargetAuthDept(dept);
      setTargetAuthRole(resolvedRole);
      setIsHrFallbackRoute(false);

      if (routingDeptRef.current !== nextKey) {
        routingDeptRef.current = nextKey;
        const tierLabel = extractTierFromRole(resolvedRole, dept);
        notify(
          `Authorization auto-routed to ${config.deptNameEn} (${tierLabel}).`,
          "info"
        );
      }
    },
    [notify]
  );

  /* ---------- Core block mutators with history ---------- */
  const applyBlocks = useCallback(
    (next: DocBlock[], opts?: { history?: boolean }) => {
      const normalized = normalizeBlocksStructure(next);
      const withHistory = opts?.history !== false;
      if (withHistory) {
        // Batch rapid changes (typing) into a single history entry
        if (!batchPending.current) {
          setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), blocksRef.current]);
          batchPending.current = true;
        }
        if (historyBatchTimer.current) clearTimeout(historyBatchTimer.current);
        historyBatchTimer.current = setTimeout(() => {
          batchPending.current = false;
        }, 900);
        setFuture([]);
        setDirty(true);
      }
      blocksRef.current = normalized;
      setBlocksState(normalized);
      syncRoutingFromBlocks(normalized);
    },
    [normalizeBlocksStructure, syncRoutingFromBlocks]
  );

  /* ---------- Explicit Target Department & Role Tier Changers ---------- */
  const handleChangeTargetDepartment = useCallback(
    (newDept: TargetDepartment, customTier?: SignatureApprovalTier) => {
      const config = DEPARTMENT_ROUTING_CONFIG[newDept] || DEPARTMENT_ROUTING_CONFIG.HR;
      const currentTier = customTier || extractTierFromRole(targetAuthRole, newDept);
      const effectiveTier: SignatureApprovalTier = newDept === "FC" ? "FC" : currentTier === "FC" ? "MANAGER" : currentTier;
      const canonicalRole = resolveCanonicalRoleForDeptAndTier(newDept, effectiveTier);
      const sigTitle = getSignatoryTitleForDeptAndTier(newDept, effectiveTier);

      routingDeptRef.current = `${newDept}:${canonicalRole}:SIG`;
      setTargetAuthDept(newDept);
      setTargetAuthRole(canonicalRole);
      setIsHrFallbackRoute(false);
      setDirty(true);

      const updatedBlocks = blocksRef.current.map((b) => {
        if (b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE") {
          return {
            ...b,
            targetDepartment: newDept,
            targetRole: canonicalRole,
            signatoryTitle: sigTitle,
            title: `Authorization Sign-off: ${config.deptNameEn}`,
            subtitle: `Official Signature ${sigTitle}`,
          };
        }
        return b;
      });
      blocksRef.current = updatedBlocks;
      setBlocksState(updatedBlocks);
      notify(`Target authorization updated to ${config.deptNameEn} (${effectiveTier}).`, "info");
    },
    [notify, targetAuthRole]
  );

  const handleChangeTargetRole = useCallback(
    (newTier: SignatureApprovalTier) => {
      const effectiveDept: TargetDepartment = newTier === "FC" ? "FC" : targetAuthDept === "FC" ? "HR" : targetAuthDept;
      const config = DEPARTMENT_ROUTING_CONFIG[effectiveDept] || DEPARTMENT_ROUTING_CONFIG.HR;
      const canonicalRole = resolveCanonicalRoleForDeptAndTier(effectiveDept, newTier);
      const sigTitle = getSignatoryTitleForDeptAndTier(effectiveDept, newTier);

      routingDeptRef.current = `${effectiveDept}:${canonicalRole}:SIG`;
      setTargetAuthDept(effectiveDept);
      setTargetAuthRole(canonicalRole);
      setIsHrFallbackRoute(false);
      setDirty(true);

      const updatedBlocks = blocksRef.current.map((b) => {
        if (b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE") {
          return {
            ...b,
            targetDepartment: effectiveDept,
            targetRole: canonicalRole,
            signatoryTitle: sigTitle,
            title: `Authorization Sign-off: ${config.deptNameEn}`,
            subtitle: `Official Signature ${sigTitle}`,
          };
        }
        return b;
      });
      blocksRef.current = updatedBlocks;
      setBlocksState(updatedBlocks);
      notify(`Target authorization role updated to ${sigTitle}.`, "info");
    },
    [notify, targetAuthDept]
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    if (historyBatchTimer.current) {
      clearTimeout(historyBatchTimer.current);
      batchPending.current = false;
    }
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([blocks, ...future].slice(0, HISTORY_LIMIT));
    blocksRef.current = prev;
    setBlocksState(prev);
    setDirty(true);
    syncRoutingFromBlocks(prev);
  }, [past, future, blocks, syncRoutingFromBlocks]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    if (historyBatchTimer.current) {
      clearTimeout(historyBatchTimer.current);
      batchPending.current = false;
    }
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past, blocks].slice(-HISTORY_LIMIT));
    blocksRef.current = next;
    setBlocksState(next);
    setDirty(true);
    syncRoutingFromBlocks(next);
  }, [past, future, blocks, syncRoutingFromBlocks]);

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) || null,
    [blocks, selectedBlockId]
  );

  const updateBlock = useCallback(
    (id: string, updates: Partial<DocBlock>) => {
      applyBlocks(
        blocksRef.current.map((b) => {
          if (b.id !== id) return b;
          if (b.type === "OFFICIAL_LETTERHEAD" || b.isLocked) {
            return {
              ...b,
              width: updates.width !== undefined ? updates.width : b.width,
              height: updates.height !== undefined ? updates.height : b.height,
            };
          }
          const modified: DocBlock = { ...b, ...updates };
          if (updates.alignment !== undefined || updates.align !== undefined) {
            const normA = normalizeHorizontalAlign(
              (updates.alignment || updates.align) as string,
              b.type === "HEADER" ? "CENTER" : "LEFT"
            );
            modified.alignment = normA;
            modified.align = normA.toLowerCase() as DocBlock["align"];
          }
          if (updates.verticalAlignment !== undefined || updates.verticalAlign !== undefined) {
            const normV = normalizeVerticalAlign(
              (updates.verticalAlignment || updates.verticalAlign) as string,
              "TOP"
            );
            modified.verticalAlignment = normV;
            modified.verticalAlign = normV.toLowerCase() as DocBlock["verticalAlign"];
          }
          if (
            (b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE") &&
            (updates.targetDepartment !== undefined || updates.targetRole !== undefined)
          ) {
            const nextDept = (updates.targetDepartment || b.targetDepartment || "HR") as TargetDepartment;
            const nextTier = updates.targetRole
              ? extractTierFromRole(updates.targetRole, nextDept)
              : extractTierFromRole(b.targetRole, nextDept);
            const effectiveDept: TargetDepartment = nextTier === "FC" ? "FC" : nextDept;
            const cfg = DEPARTMENT_ROUTING_CONFIG[effectiveDept] || DEPARTMENT_ROUTING_CONFIG.HR;
            const canonicalRole = resolveCanonicalRoleForDeptAndTier(effectiveDept, nextTier);
            const sigTitle =
              updates.signatoryTitle !== undefined
                ? updates.signatoryTitle
                : getSignatoryTitleForDeptAndTier(effectiveDept, nextTier);
            modified.targetDepartment = effectiveDept;
            modified.targetRole = canonicalRole;
            modified.signatoryTitle = sigTitle;
            modified.title = `Authorization Sign-off: ${cfg.deptNameEn}`;
            modified.subtitle = `Official Signature ${sigTitle}`;
          }
          return modified;
        })
      );
    },
    [applyBlocks]
  );

  /* ---------- Insert / delete / duplicate / reorder ---------- */
  const insertBlock = useCallback(
    (item: LibraryItem, atIndex?: number | null) => {
      if (item.locked || item.type === "OFFICIAL_LETTERHEAD") {
        notify(
          isId
            ? "Kop Surat Resmi sudah terpasang permanen di posisi paling atas dan terkunci."
            : "Official Letterhead is already permanently locked at the top.",
          "info"
        );
        const kop = blocksRef.current.find((b) => b.type === "OFFICIAL_LETTERHEAD");
        if (kop) setSelectedBlockId(kop.id);
        return;
      }
      const isSigItem =
        item.type === "SIGNATURE_COLUMN" || item.type === "SIGNATURE_STAMP" || item.type === "DUAL_SIGNATURE";
      const effectiveDept = isSigItem ? item.dept || targetAuthDept : item.dept;
      const block = buildBlock(item.type, isId, department, effectiveDept, item.key);
      const current = blocksRef.current;

      // If inserting a signature block and one already exists on canvas, replace existing signature block(s) in-place so old routing blocks never conflict
      if (isSigItem) {
        const existingSigIdx = current.findIndex(
          (b) => b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE"
        );
        if (existingSigIdx >= 0) {
          const filtered = current.filter(
            (b, i) =>
              i === existingSigIdx ||
              (b.type !== "SIGNATURE_COLUMN" && b.type !== "SIGNATURE_STAMP" && b.type !== "DUAL_SIGNATURE")
          );
          const replaceIdx = filtered.findIndex(
            (b) => b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE"
          );
          const next = [...filtered];
          next[replaceIdx] = block;
          applyBlocks(next);
          setSelectedBlockId(block.id);
          setQuickInsertIndex(null);
          notify(
            isId
              ? `Kolom otorisasi diperbarui ke "${item.labelId}".`
              : `Authorization block updated to "${item.labelEn}".`,
            "success"
          );
          return;
        }
      }

      const isFooterItem = item.type === "FOOTER" || item.type === "FOOTER_BLOCK";
      if (isFooterItem) {
        const footerBlock: DocBlock = { ...block, width: "100%", x: 0, y: 0 };
        const withoutOldFooter = current.filter(
          (b) => b.type !== "FOOTER" && b.type !== "FOOTER_BLOCK"
        );
        const next = [...withoutOldFooter, footerBlock];
        applyBlocks(next);
        setSelectedBlockId(footerBlock.id);
        setQuickInsertIndex(null);
        notify(
          isId
            ? `Footer dokumen "${item.labelId}" terpasang otomatis di posisi paling bawah.`
            : `Document footer "${item.labelEn}" automatically pinned to the bottom.`,
          "success"
        );
        return;
      }

      let idx: number;
      const footerIdx = current.findIndex((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
      const maxInsertIdx = footerIdx >= 0 ? footerIdx : current.length;
      if (atIndex !== undefined && atIndex !== null) {
        idx = Math.max(1, Math.min(atIndex, maxInsertIdx)); // never above locked kop or below pinned footer
      } else if (selectedBlockId) {
        const selIdx = current.findIndex((b) => b.id === selectedBlockId);
        idx = selIdx >= 0 ? Math.min(selIdx + 1, maxInsertIdx) : maxInsertIdx;
      } else {
        idx = maxInsertIdx;
      }
      const next = [...current.slice(0, idx), block, ...current.slice(idx)];
      applyBlocks(next);
      setSelectedBlockId(block.id);
      setQuickInsertIndex(null);
      notify(
        isId ? `Blok "${item.labelId}" ditambahkan.` : `"${item.labelEn}" block added.`,
        "success"
      );
    },
    [applyBlocks, department, isId, notify, selectedBlockId, targetAuthDept]
  );

  const deleteBlock = useCallback(
    (id: string) => {
      const target = blocksRef.current.find((b) => b.id === id);
      if (!target) return;
      if (target.type === "OFFICIAL_LETTERHEAD" || target.isLocked) {
        notify(
          isId
            ? "Kop Surat Resmi bersifat permanen dan tidak dapat dihapus demi integritas dokumen."
            : "Official Letterhead is permanent and cannot be deleted.",
          "error"
        );
        return;
      }
      const isFooterTarget = target.type === "FOOTER" || target.type === "FOOTER_BLOCK";
      applyBlocks(blocksRef.current.filter((b) => b.id !== id));
      if (selectedBlockId === id) setSelectedBlockId(null);
      if (isFooterTarget) {
        notify(
          "Document footer removed. You can re-add an ERP footer anytime from the Left Panel.",
          "info"
        );
      }
    },
    [applyBlocks, isId, notify, selectedBlockId]
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      const target = blocksRef.current.find((b) => b.id === id);
      if (!target) return;
      if (target.type === "OFFICIAL_LETTERHEAD" || target.isLocked) {
        notify(
          isId ? "Kop Surat Resmi tidak dapat diduplikasi." : "Official Letterhead cannot be duplicated.",
          "error"
        );
        return;
      }
      if (target.type === "FOOTER" || target.type === "FOOTER_BLOCK") {
        notify(
          isId ? "Footer dokumen hanya satu dan selalu berada di posisi paling bawah." : "Only one document footer is allowed at the bottom.",
          "info"
        );
        return;
      }
      const copy: DocBlock = { ...JSON.parse(JSON.stringify(target)), id: newBlockId() };
      const idx = blocksRef.current.findIndex((b) => b.id === id);
      const next = [...blocksRef.current];
      next.splice(idx + 1, 0, copy);
      applyBlocks(next);
      setSelectedBlockId(copy.id);
    },
    [applyBlocks, isId, notify]
  );

  const moveBlock = useCallback(
    (id: string, direction: "UP" | "DOWN") => {
      const current = blocksRef.current;
      const idx = current.findIndex((b) => b.id === id);
      if (idx === -1) return;
      if (
        current[idx].type === "OFFICIAL_LETTERHEAD" ||
        current[idx].type === "FOOTER" ||
        current[idx].type === "FOOTER_BLOCK" ||
        current[idx].isLocked
      )
        return;
      if (direction === "UP" && idx <= 1) return; // kop stays at index 0
      const footerIdx = current.findIndex((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
      const lastMovableIdx = footerIdx >= 0 ? footerIdx - 1 : current.length - 1;
      if (direction === "DOWN" && idx >= lastMovableIdx) return;
      const targetIdx = direction === "UP" ? idx - 1 : idx + 1;
      const next = [...current];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      applyBlocks(next);
    },
    [applyBlocks]
  );

  const reorderBlock = useCallback(
    (dragId: string, targetId: string, pos: "before" | "after") => {
      if (dragId === targetId) return;
      const current = blocksRef.current;
      const fromIdx = current.findIndex((b) => b.id === dragId);
      let toIdx = current.findIndex((b) => b.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return;
      if (
        current[fromIdx].type === "OFFICIAL_LETTERHEAD" ||
        current[fromIdx].type === "FOOTER" ||
        current[fromIdx].type === "FOOTER_BLOCK" ||
        current[fromIdx].isLocked
      )
        return;
      const next = [...current];
      const [moved] = next.splice(fromIdx, 1);
      toIdx = next.findIndex((b) => b.id === targetId);
      const footerIdx = next.findIndex((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
      const maxInsert = footerIdx >= 0 ? footerIdx : next.length;
      const insertAt = pos === "before" ? toIdx : toIdx + 1;
      next.splice(Math.max(1, Math.min(insertAt, maxInsert)), 0, moved); // never above locked kop or below pinned footer
      applyBlocks(next);
    },
    [applyBlocks]
  );

  const resetBlockPosition = useCallback(
    (id: string) => {
      applyBlocks(
        blocksRef.current.map((b) => (b.id === id ? { ...b, x: 0, y: 0 } : b))
      );
    },
    [applyBlocks]
  );

  const snapBlockOnCanvas = useCallback(
    (id: string, target: "LEFT" | "CENTER" | "RIGHT" | "RESET") => {
      if (target === "RESET") {
        resetBlockPosition(id);
        return;
      }
      const el = document.getElementById(`doc-container-${id}`);
      const containerEl = blocksContainerRef.current;
      const contentWidth = containerEl?.clientWidth || (sheetRef.current ? sheetRef.current.clientWidth - 96 : 704);
      const currentBlock = blocksRef.current.find((b) => b.id === id);
      if (!currentBlock) return;
      const blockW =
        typeof currentBlock.width === "number"
          ? currentBlock.width
          : el?.offsetWidth || contentWidth;
      const naturalLeft = el ? el.offsetLeft : 0;

      let nextX = 0;
      if (target === "LEFT") {
        nextX = Math.round(0 - naturalLeft);
      } else if (target === "CENTER") {
        nextX = Math.round((contentWidth - blockW) / 2 - naturalLeft);
      } else if (target === "RIGHT") {
        nextX = Math.round(contentWidth - blockW - naturalLeft);
      }

      applyBlocks(
        blocksRef.current.map((b) => (b.id === id ? { ...b, x: nextX } : b))
      );
    },
    [applyBlocks, resetBlockPosition]
  );

  /* ---------- Free-position drag (hold & move) with Smart Magnetic Alignment ---------- */
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const zoomFactor = zoomLevel / 100;
      const deltaX = (e.clientX - dragging.startX) / zoomFactor;
      const deltaY = (e.clientY - dragging.startY) / zoomFactor;

      let newX = Math.round(dragging.initialX + deltaX);
      let newY = Math.round(dragging.initialY + deltaY);
      if (showGrid) {
        newX = Math.round(newX / 10) * 10;
        newY = Math.round(newY / 10) * 10;
      }

      // Smart Magnetic Alignment (Canvas Margins, Center Line, and Peer Block Edges/Centers)
      // IMPORTANT: HTMLElement.offsetLeft / offsetTop are measured relative to `blocksContainerRef`
      // and do NOT include CSS `transform: translate(x, y)`.
      let snappedVertical: { x: number; label: string } | undefined;
      let snappedHorizontal: { y: number; label: string } | undefined;

      const movingEl = document.getElementById("doc-container-" + dragging.blockId);
      const containerEl = blocksContainerRef.current;
      const sheetEl = sheetRef.current;
      if (movingEl && (containerEl || sheetEl)) {
        const SNAP_THRESHOLD = 7;
        const blockW = movingEl.offsetWidth;
        const blockH = movingEl.offsetHeight;

        const naturalLeft = movingEl.offsetLeft;
        const naturalTop = movingEl.offsetTop;

        const candidateLeft = naturalLeft + newX;
        const candidateRight = candidateLeft + blockW;
        const candidateCenterX = candidateLeft + blockW / 2;

        const candidateTop = naturalTop + newY;
        const candidateBottom = candidateTop + blockH;
        const candidateCenterY = candidateTop + blockH / 2;

        const contentWidth = containerEl ? containerEl.clientWidth : (sheetEl!.clientWidth - 96);
        const contentHeight = containerEl ? containerEl.clientHeight : (sheetEl!.clientHeight - 96);
        const contentCenterX = contentWidth / 2;
        const contentCenterY = contentHeight / 2;

        // 1. Snap to Canvas Horizontal Center (Garis Tengah Kanvas -> X = 0 for 100% width block)
        if (Math.abs(candidateCenterX - contentCenterX) <= SNAP_THRESHOLD) {
          newX = Math.round(contentCenterX - naturalLeft - blockW / 2);
          snappedVertical = {
            x: Math.round(contentCenterX),
            label: isId ? "Garis Tengah Kanvas (Center X)" : "Canvas Center X",
          };
        }
        // 2. Snap to Canvas Left Margin (x = 0)
        else if (Math.abs(candidateLeft - 0) <= SNAP_THRESHOLD) {
          newX = Math.round(0 - naturalLeft);
          snappedVertical = {
            x: 0,
            label: isId ? "Batas Margin Kiri (0px)" : "Left Margin (0px)",
          };
        }
        // 3. Snap to Canvas Right Margin (x = contentWidth)
        else if (Math.abs(candidateRight - contentWidth) <= SNAP_THRESHOLD) {
          newX = Math.round(contentWidth - naturalLeft - blockW);
          snappedVertical = {
            x: Math.round(contentWidth),
            label: isId ? "Batas Margin Kanan" : "Right Margin",
          };
        }

        // 4. Snap to Natural Flow Y (y = 0) or Canvas Vertical Center
        if (Math.abs(newY) <= SNAP_THRESHOLD) {
          newY = 0;
          snappedHorizontal = {
            y: Math.round(naturalTop),
            label: isId ? "Posisi Alur Normal (Y: 0px)" : "Natural Flow (Y: 0px)",
          };
        } else if (Math.abs(candidateCenterY - contentCenterY) <= SNAP_THRESHOLD) {
          newY = Math.round(contentCenterY - naturalTop - blockH / 2);
          snappedHorizontal = {
            y: Math.round(contentCenterY),
            label: isId ? "Garis Tengah Kanvas (Vertikal)" : "Canvas Vertical Center",
          };
        }

        // 5. Align with other blocks on sheet (including their translate(x, y) offsets!)
        for (const other of blocksRef.current) {
          if (other.id === dragging.blockId) continue;
          const otherEl = document.getElementById("doc-container-" + other.id);
          if (!otherEl) continue;

          const otherW = otherEl.offsetWidth;
          const otherH = otherEl.offsetHeight;
          const otherLeft = otherEl.offsetLeft + (other.x || 0);
          const otherRight = otherLeft + otherW;
          const otherCenterX = otherLeft + otherW / 2;

          const otherTop = otherEl.offsetTop + (other.y || 0);
          const otherBottom = otherTop + otherH;
          const otherCenterY = otherTop + otherH / 2;
          const otherLabel = other.title || BLOCK_TYPE_LABELS[other.type] || other.type;

          // Horizontal Center with other block
          if (!snappedVertical && Math.abs(candidateCenterX - otherCenterX) <= SNAP_THRESHOLD) {
            newX = Math.round(otherCenterX - naturalLeft - blockW / 2);
            snappedVertical = {
              x: Math.round(otherCenterX),
              label: isId ? `Sejajar Tengah (${otherLabel})` : `Align Center (${otherLabel})`,
            };
          }
          // Left Edge with other block
          if (!snappedVertical && Math.abs(candidateLeft - otherLeft) <= SNAP_THRESHOLD) {
            newX = Math.round(otherLeft - naturalLeft);
            snappedVertical = {
              x: Math.round(otherLeft),
              label: isId ? `Rata Kiri (${otherLabel})` : `Align Left (${otherLabel})`,
            };
          }
          // Right Edge with other block
          if (!snappedVertical && Math.abs(candidateRight - otherRight) <= SNAP_THRESHOLD) {
            newX = Math.round(otherRight - naturalLeft - blockW);
            snappedVertical = {
              x: Math.round(otherRight),
              label: isId ? `Rata Kanan (${otherLabel})` : `Align Right (${otherLabel})`,
            };
          }

          // Vertical Center with other block
          if (!snappedHorizontal && Math.abs(candidateCenterY - otherCenterY) <= SNAP_THRESHOLD) {
            newY = Math.round(otherCenterY - naturalTop - blockH / 2);
            snappedHorizontal = {
              y: Math.round(otherCenterY),
              label: isId ? `Sejajar Tengah Y (${otherLabel})` : `Align Middle Y (${otherLabel})`,
            };
          }
          // Top Edge with other block
          if (!snappedHorizontal && Math.abs(candidateTop - otherTop) <= SNAP_THRESHOLD) {
            newY = Math.round(otherTop - naturalTop);
            snappedHorizontal = {
              y: Math.round(otherTop),
              label: isId ? `Rata Atas (${otherLabel})` : `Align Top (${otherLabel})`,
            };
          }
          // Bottom Edge with other block
          if (!snappedHorizontal && Math.abs(candidateBottom - otherBottom) <= SNAP_THRESHOLD) {
            newY = Math.round(otherBottom - naturalTop - blockH);
            snappedHorizontal = {
              y: Math.round(otherBottom),
              label: isId ? `Rata Bawah (${otherLabel})` : `Align Bottom (${otherLabel})`,
            };
          }
        }
      }

      setAlignGuides(
        snappedVertical || snappedHorizontal ? { vertical: snappedVertical, horizontal: snappedHorizontal } : null
      );

      // Clamp inside a sane canvas range so a block can never get lost off-sheet
      newX = Math.max(-160, Math.min(820, newX));
      newY = Math.max(-120, Math.min(4000, newY));

      const next = blocksRef.current.map((b) => (b.id === dragging.blockId ? { ...b, x: newX, y: newY } : b));
      blocksRef.current = next;
      setBlocksState(next);
    };

    const handleMouseUp = () => {
      setAlignGuides(null);
      applyBlocks(blocksRef.current); // commit single history entry
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, zoomLevel, showGrid, applyBlocks, isId]);

  const handleStartDrag = (e: React.MouseEvent, blockId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const currentBlock = blocksRef.current.find((b) => b.id === blockId);
    if (!currentBlock || currentBlock.isLocked || currentBlock.type === "OFFICIAL_LETTERHEAD") return;
    setSelectedBlockId(blockId);
    setDragging({
      blockId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentBlock.x || 0,
      initialY: currentBlock.y || 0,
    });
  };

  /* ---------- Resize handles ---------- */
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const zoomFactor = zoomLevel / 100;
      const deltaX = (e.clientX - resizing.startX) / zoomFactor;
      const deltaY = (e.clientY - resizing.startY) / zoomFactor;

      let newWidth = resizing.startWidth;
      let newHeight = resizing.startHeight;
      if (resizing.handle === "se" || resizing.handle === "e") {
        newWidth = Math.max(220, Math.min(780, Math.round(resizing.startWidth + deltaX)));
        if (showGrid) newWidth = Math.round(newWidth / 10) * 10;
      }
      if (resizing.handle === "se" || resizing.handle === "s") {
        newHeight = Math.max(60, Math.min(1200, Math.round(resizing.startHeight + deltaY)));
        if (showGrid) newHeight = Math.round(newHeight / 10) * 10;
      }
      setLiveDimensions({ width: newWidth, height: newHeight });
      const next = blocksRef.current.map((b) =>
        b.id === resizing.blockId
          ? {
              ...b,
              width: newWidth,
              height: newHeight,
              ...(b.type === "IMAGE" || b.type === "image"
                ? {
                    mediaData: {
                      ...(b.mediaData || { mediaType: "IMAGE" }),
                      widthPx: newWidth,
                      heightPx: newHeight,
                    },
                  }
                : {}),
            }
          : b
      );
      blocksRef.current = next;
      setBlocksState(next);
    };

    const handleMouseUp = () => {
      applyBlocks(blocksRef.current);
      setResizing(null);
      setLiveDimensions(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, zoomLevel, showGrid, applyBlocks]);

  const handleStartResize = (e: React.MouseEvent, blockId: string, handle: "se" | "e" | "s") => {
    e.preventDefault();
    e.stopPropagation();
    const containerElem = document.getElementById(`doc-container-${blockId}`);
    if (!containerElem) return;
    const rect = containerElem.getBoundingClientRect();
    const currentBlock = blocksRef.current.find((b) => b.id === blockId);
    const startW = typeof currentBlock?.width === "number" ? currentBlock.width : rect.width;
    const startH = typeof currentBlock?.height === "number" ? currentBlock.height : rect.height;
    setResizing({
      blockId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: startW,
      startHeight: startH,
    });
    setLiveDimensions({ width: Math.round(startW), height: Math.round(startH) });
  };

  /* ---------- Table Column & Row Resizing Handler ---------- */
  useEffect(() => {
    if (!tableResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const zoomFactor = zoomLevel / 100;
      const targetBlock = blocksRef.current.find((b) => b.id === tableResizing.blockId);
      if (!targetBlock || !targetBlock.tableData) return;

      if (tableResizing.type === "col") {
        const deltaX = (e.clientX - tableResizing.startX) / zoomFactor;
        const newWidth = Math.max(40, Math.round(tableResizing.initialSize + deltaX));
        const colWidths = [
          ...(targetBlock.tableData.colWidths || targetBlock.tableData.headers.map(() => 120)),
        ];
        colWidths[tableResizing.index] = newWidth;
        updateBlock(targetBlock.id, {
          tableData: {
            ...targetBlock.tableData,
            colWidths,
          },
        });
      } else {
        const deltaY = (e.clientY - tableResizing.startY) / zoomFactor;
        const newHeight = Math.max(24, Math.round(tableResizing.initialSize + deltaY));
        const rowHeights = [
          ...(targetBlock.tableData.rowHeights || targetBlock.tableData.rows.map(() => 36)),
        ];
        rowHeights[tableResizing.index] = newHeight;
        updateBlock(targetBlock.id, {
          tableData: {
            ...targetBlock.tableData,
            rowHeights,
          },
        });
      }
    };

    const handleMouseUp = () => {
      setTableResizing(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [tableResizing, zoomLevel, updateBlock]);

  /* ---------- Selection & Floating Text Toolbar ---------- */
  useEffect(() => {
    const handleSelection = () => {
      // 1. Check if activeElement is an input or textarea within sheetRef
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
        sheetRef.current?.contains(activeEl)
      ) {
        const input = activeEl as HTMLInputElement | HTMLTextAreaElement;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        if (start !== end) {
          const text = input.value.slice(start, end).trim();
          if (text.length > 0) {
            const rect = input.getBoundingClientRect();
            const container = input.closest("[data-block-id]");
            const blockId = container?.getAttribute("data-block-id") || null;
            if (blockId) {
              setSelectedBlockId(blockId);
            }
            setSelectionToolbar({
              visible: true,
              x: rect.left + rect.width / 2,
              y: Math.max(12, rect.top - 54),
              selectedText: text,
              targetInput: input,
              blockId: blockId,
            });
            return;
          }
        }
      }

      // 2. Check window.getSelection() for any text highlighted inside sheetRef
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (sheetRef.current && sheetRef.current.contains(range.commonAncestorContainer)) {
            const rect = range.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const node = range.commonAncestorContainer;
              const elem = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
              const container = elem?.closest?.("[data-block-id]");
              const blockId = container?.getAttribute("data-block-id") || null;
              if (blockId) {
                setSelectedBlockId(blockId);
              }
              setSelectionToolbar({
                visible: true,
                x: rect.left + rect.width / 2,
                y: Math.max(12, rect.top - 54),
                selectedText: sel.toString(),
                targetInput: null,
                blockId: blockId,
              });
              return;
            }
          }
        }
      }

      setSelectionToolbar((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    };

    document.addEventListener("selectionchange", handleSelection);
    window.addEventListener("mouseup", handleSelection);
    window.addEventListener("keyup", handleSelection);
    return () => {
      document.removeEventListener("selectionchange", handleSelection);
      window.removeEventListener("mouseup", handleSelection);
      window.removeEventListener("keyup", handleSelection);
    };
  }, []);

  const handleWrapSelection = useCallback((prefix: string, suffix: string) => {
    if (selectionToolbar.targetInput) {
      const input = selectionToolbar.targetInput;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const val = input.value;
      const sel = val.slice(start, end);
      let newVal: string;
      if (sel.startsWith(prefix) && sel.endsWith(suffix) && sel.length >= prefix.length + suffix.length) {
        newVal = val.slice(0, start) + sel.slice(prefix.length, sel.length - suffix.length) + val.slice(end);
      } else {
        newVal = val.slice(0, start) + prefix + sel + suffix + val.slice(end);
      }
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, newVal);
      } else {
        input.value = newVal;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [selectionToolbar.targetInput]);

  const handleTransformCase = useCallback(() => {
    if (selectionToolbar.targetInput) {
      const input = selectionToolbar.targetInput;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const val = input.value;
      const sel = val.slice(start, end);
      let transformed: string;
      if (sel === sel.toUpperCase()) {
        transformed = sel.toLowerCase();
      } else if (sel === sel.toLowerCase()) {
        transformed = sel.replace(/\b\w/g, (c) => c.toUpperCase());
      } else {
        transformed = sel.toUpperCase();
      }
      const newVal = val.slice(0, start) + transformed + val.slice(end);
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        input instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, newVal);
      } else {
        input.value = newVal;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [selectionToolbar.targetInput]);

  /* ---------- Save ---------- */
  const handleSave = useCallback(
    async (submitForApproval: boolean, closeAfter: boolean) => {
      const currentBlocks = blocksRef.current;
      const sigBlocks = currentBlocks.filter(
        (b) => b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE"
      );
      const effectiveDept: TargetDepartment =
        sigBlocks.length === 0
          ? "HR"
          : ((sigBlocks[sigBlocks.length - 1].targetDepartment as TargetDepartment) || targetAuthDept || "HR");
      const effectiveRole: string =
        sigBlocks.length === 0
          ? "HR_MANAGER"
          : resolveCanonicalRoleForDeptAndTier(
              effectiveDept,
              sigBlocks[sigBlocks.length - 1].targetRole || targetAuthRole || "MANAGER"
            );

      try {
        await onSave(
          {
            title: docTitle.trim() || "Untitled Document",
            document_type: docType,
            department: department || "General",
            content: currentBlocks,
            layout_preset: layoutPreset,
            custom_width_mm: layoutPreset === "CUSTOM" ? customWidthMm : null,
            custom_height_mm: layoutPreset === "CUSTOM" ? customHeightMm : null,
            authorization_role: effectiveRole,
            authorization_department: effectiveDept,
            authorization_user_name: targetAuthName.trim(),
            submitForApproval,
          },
          { closeAfter }
        );
        setDirty(false);
        setLastSavedAt(new Date());
        if (!closeAfter) {
          notify("Draft saved. You can keep editing.", "success");
        }
      } catch {
        // parent already surfaced the error toast; keep dirty flag on
      }
    },
    [
      onSave,
      docTitle,
      docType,
      department,
      layoutPreset,
      customWidthMm,
      customHeightMm,
      targetAuthRole,
      targetAuthDept,
      targetAuthName,
      notify,
    ]
  );

  /* ---------- Close with unsaved-changes guard ---------- */
  const requestClose = useCallback(() => {
    if (dirty) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  }, [dirty, onClose]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* ---------- Keyboard shortcuts ---------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = !!target?.closest("input, textarea, select, [contenteditable=true]");
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          handleSave(true, true);
        } else {
          handleSave(false, false);
        }
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        if (isTyping) return; // let native input undo work
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        if (isTyping) return;
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        if (isTyping || !selectedBlockId) return;
        e.preventDefault();
        duplicateBlock(selectedBlockId);
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoomLevel((z) => Math.min(150, z + 10));
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        setZoomLevel((z) => Math.max(40, z - 10));
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        setZoomLevel(100);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isTyping && selectedBlockId && viewMode === "edit") {
        e.preventDefault();
        deleteBlock(selectedBlockId);
        return;
      }
      // Arrow-key micro-nudging (1px normal, 10px with Shift) when a block is selected and not typing
      if (
        !isTyping &&
        selectedBlockId &&
        viewMode === "edit" &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")
      ) {
        const blk = blocksRef.current.find((b) => b.id === selectedBlockId);
        if (blk && blk.type !== "OFFICIAL_LETTERHEAD" && !blk.isLocked) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
          updateBlock(selectedBlockId, {
            x: Math.round((blk.x || 0) + dx),
            y: Math.round((blk.y || 0) + dy),
          });
          return;
        }
      }
      if (e.key === "Escape") {
        if (quickInsertIndex !== null) {
          setQuickInsertIndex(null);
        } else if (showShortcuts) {
          setShowShortcuts(false);
        } else if (showCloseConfirm) {
          setShowCloseConfirm(false);
        } else {
          setSelectedBlockId(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, undo, redo, duplicateBlock, deleteBlock, updateBlock, selectedBlockId, viewMode, quickInsertIndex, showShortcuts, showCloseConfirm]);

  useEffect(() => {
    const cleanup = () => document.body.classList.remove("printing-workspace");
    window.addEventListener("afterprint", cleanup);
    return () => {
      window.removeEventListener("afterprint", cleanup);
      document.body.classList.remove("printing-workspace");
    };
  }, []);

  /* ---------- Zoom fit-to-width ---------- */
  const handleFitZoom = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const dims = getPaperDimensions(layoutPreset, customWidthMm, customHeightMm);
    const fit = Math.floor(((scroller.clientWidth - 48) / dims.widthPx) * 100);
    setZoomLevel(Math.max(40, Math.min(150, fit)));
  }, [layoutPreset, customWidthMm, customHeightMm]);

  /* ---------- Library filtering ---------- */
  const filteredLibrary = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return LIBRARY_ITEMS.filter((item) => {
      if (!q && item.category !== sidebarTab) return false;
      if (!q) return true;
      return (
        item.labelId.toLowerCase().includes(q) ||
        item.labelEn.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q) ||
        (item.dept || "").toLowerCase().includes(q)
      );
    });
  }, [libraryQuery, sidebarTab]);

  /* ---------- Signer Chain & Pre-Submission Readiness Checks ---------- */
  const isApproved = initialStatus === "APPROVED";
  const isEditable = viewMode === "edit" && !isApproved;

  const signerChain = useMemo<WorkspaceSignerStep[]>(() => {
    const sigBlocks = blocks.filter(
      (b) => b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE"
    );
    if (sigBlocks.length === 0) {
      return [
        {
          step: 1,
          department: "HR",
          role: "HR_MANAGER",
          signatoryTitle: "Human Resources Manager (Auto Fallback)",
          signatoryName: targetAuthName || undefined,
          status: isApproved ? "APPROVED" : "PENDING",
        },
      ];
    }
    return sigBlocks.map((b, idx) => {
      const dept = (b.targetDepartment || "HR") as TargetDepartment;
      const tier = extractTierFromRole(b.targetRole, dept);
      const role = resolveCanonicalRoleForDeptAndTier(dept, tier);
      return {
        step: idx + 1,
        blockId: b.id,
        department: dept,
        role,
        signatoryTitle: b.signatoryTitle || getSignatoryTitleForDeptAndTier(dept, tier),
        signatoryName: b.signatoryName || undefined,
        status: isApproved ? "APPROVED" : "PENDING",
      };
    });
  }, [blocks, isApproved, targetAuthName]);

  const readinessChecks = useMemo(() => {
    const hasValidTitle = docTitle.trim().length >= 3 && docTitle.trim().toLowerCase() !== "untitled document";
    const hasLetterhead = blocks.some((b) => b.type === "OFFICIAL_LETTERHEAD");
    const bodyBlocks = blocks.filter(
      (b) =>
        b.type !== "OFFICIAL_LETTERHEAD" &&
        b.type !== "FOOTER" &&
        b.type !== "FOOTER_BLOCK" &&
        b.type !== "SIGNATURE_COLUMN" &&
        b.type !== "SIGNATURE_STAMP" &&
        b.type !== "DUAL_SIGNATURE"
    );
    const hasBodyContent = bodyBlocks.length > 0;
    const sigBlocks = blocks.filter(
      (b) => b.type === "SIGNATURE_COLUMN" || b.type === "SIGNATURE_STAMP" || b.type === "DUAL_SIGNATURE"
    );
    const hasExplicitSig = sigBlocks.length > 0;

    return [
      {
        id: "title",
        label: "Official Document Title",
        passed: hasValidTitle,
        detail: hasValidTitle ? docTitle : "Rename from 'Untitled Document'",
      },
      {
        id: "letterhead",
        label: "ERP Official Letterhead",
        passed: hasLetterhead,
        detail: "CV. Batu Emas Group Locked Header",
      },
      {
        id: "content",
        label: "Document Body Blocks",
        passed: hasBodyContent,
        detail: `${bodyBlocks.length} body block(s) configured`,
      },
      {
        id: "routing",
        label: "Approval Routing Target",
        passed: true,
        isWarning: !hasExplicitSig,
        detail: hasExplicitSig
          ? `Signature Route: ${targetAuthDept} (${extractTierFromRole(targetAuthRole, targetAuthDept)})`
          : "No signature block — Auto-Routes to HR (Human Resource)",
      },
    ];
  }, [blocks, docTitle, targetAuthDept, targetAuthRole]);

  const activeDeptConfig = DEPARTMENT_ROUTING_CONFIG[targetAuthDept] || DEPARTMENT_ROUTING_CONFIG.HR;

  return {
    isId,
    documentId,
    documentCode,
    initialStatus,
    versions,
    events,
    onClone,
    onClose,
    isSaving,
    docTitle,
    setDocTitle,
    docType,
    setDocType,
    department,
    setDepartment,
    layoutPreset,
    setLayoutPreset,
    customWidthMm,
    setCustomWidthMm,
    customHeightMm,
    setCustomHeightMm,
    targetAuthRole,
    setTargetAuthRole,
    targetAuthDept,
    setTargetAuthDept,
    targetAuthName,
    setTargetAuthName,
    isHrFallbackRoute,
    signerChain,
    readinessChecks,
    blocks,
    setBlocksState,
    blocksRef,
    past,
    future,
    dirty,
    setDirty,
    lastSavedAt,
    selectedBlockId,
    setSelectedBlockId,
    selectedBlock,
    dragging,
    resizing,
    liveDimensions,
    alignGuides,
    selectionToolbar,
    setSelectionToolbar,
    dragBlockId,
    setDragBlockId,
    dropIndicator,
    setDropIndicator,
    hoveredBlockId,
    setHoveredBlockId,
    hoveredBlockRect,
    setHoveredBlockRect,
    tableResizing,
    handleTableColResizeStart,
    handleTableRowResizeStart,
    sidebarTab,
    setSidebarTab,
    libraryQuery,
    setLibraryQuery,
    showLeftPanel,
    setShowLeftPanel,
    showRightPanel,
    setShowRightPanel,
    zoomLevel,
    setZoomLevel,
    showGrid,
    setShowGrid,
    viewMode,
    setViewMode,
    quickInsertIndex,
    setQuickInsertIndex,
    showShortcuts,
    setShowShortcuts,
    showCloseConfirm,
    setShowCloseConfirm,
    isExportingPdf,
    setIsExportingPdf,
    notice,
    setNotice,
    sheetRef,
    blocksContainerRef,
    scrollRef,
    docxInputRef,
    notify,
    applyBlocks,
    handleChangeTargetDepartment,
    handleChangeTargetRole,
    undo,
    redo,
    updateBlock,
    insertBlock,
    deleteBlock,
    duplicateBlock,
    moveBlock,
    reorderBlock,
    resetBlockPosition,
    snapBlockOnCanvas,
    handleStartDrag,
    handleStartResize,
    handleWrapSelection,
    handleTransformCase,
    handleSave,
    requestClose,
    handleFitZoom,
    filteredLibrary,
    activeDeptConfig,
    isApproved,
    isEditable,
  };
}

export type CanvaStudioState = ReturnType<typeof useCanvaStudioState>;
