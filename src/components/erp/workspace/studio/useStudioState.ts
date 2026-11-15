import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Save, X, Keyboard, Check } from "lucide-react";
import {
  DocBlock,
  BlockCategory,
  LayoutPreset,
  TargetDepartment,
  WorkspaceSignerStep,
  DocPageSetup,
  DocCommentThread,
  DocTrackedChange,
  DocFootnote,
  WorkspaceLayoutMode,
  MailMergeSourceRecord,
  MailMergeSourceType,
  FindMatch,
} from "@/types/workspace";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/utils/api";
import {
  normalizeHorizontalAlign,
  normalizeVerticalAlign,
  normalizeBlockAlignment,
} from "@/services/docxEngine";
import {
  extractDocumentMeta,
  stripMetaBlocks,
  mergeDocumentMeta,
  paginateDocumentBlocks,
  buildDocumentOutline,
  findMatchesInBlocks,
  replaceSingleMatchInBlocks,
  replaceAllMatchesInBlocks,
  applyMailMergeToBlocks,
  runDocumentPreflight,
  computeDocumentStats,
  summarizeBlockChange,
  mmToPx,
} from "@/services/workspaceDocumentUtils";
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
  const { user } = useAuth();
  const actorUsername = user?.username || "staff";
  const actorRole = user?.role || "STAFF";
  const documentCode = initialDocumentCode || documentId || null;
  const [docTitle, setDocTitle] = useState(initialTitle || "Untitled Document");
  const [docType, setDocType] = useState(initialDocType || "MEMORANDUM");
  const [department, setDepartment] = useState(initialDepartment || "General");
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>(initialLayoutPreset);
  const [customWidthMm, setCustomWidthMm] = useState<number>(initialCustomWidthMm || 210);
  const [customHeightMm, setCustomHeightMm] = useState<number>(initialCustomHeightMm || 297);

  /* ---------- WordCraft Meta Envelope (PageSetup, Comments, TrackChanges, Footnotes) ---------- */
  const initialMeta = useMemo(() => extractDocumentMeta(initialBlocks || []), []);
  const [pageSetup, setPageSetup] = useState<DocPageSetup>(initialMeta.pageSetup);
  const [comments, setComments] = useState<DocCommentThread[]>(initialMeta.comments);
  const [trackedChanges, setTrackedChanges] = useState<DocTrackedChange[]>(initialMeta.trackedChanges);
  const [footnotes] = useState<DocFootnote[]>(initialMeta.footnotes);

  /* ---------- Routing (auto-triggered by signature blocks, fallback to HR when none) ---------- */
  const visibleInitialBlocks = useMemo(() => stripMetaBlocks(initialBlocks || []), []);
  const initialSigBlocks = visibleInitialBlocks.filter(
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
    const list = stripMetaBlocks(rawList && rawList.length > 0 ? [...rawList] : []);
    const kopIndex = list.findIndex((b) => b.type === "OFFICIAL_LETTERHEAD");
    let kopBlock: DocBlock;
    if (kopIndex === -1) {
      kopBlock = { ...OFFICIAL_KOP_SURAT_BLOCK, isLocked: true, width: "100%", x: 0, y: 0 };
    } else {
      const existingKop = list.splice(kopIndex, 1)[0];
      kopBlock = { ...OFFICIAL_KOP_SURAT_BLOCK, ...existingKop, isLocked: true, width: "100%", x: 0, y: 0 };
    }

    const bodyBlocks = list.filter(
      (b) => b.type !== "OFFICIAL_LETTERHEAD" && b.type !== "FOOTER" && b.type !== "FOOTER_BLOCK"
    );
    const footerBlocks = list
      .filter((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK")
      .map((b) => ({ ...b, width: "100%", x: 0, y: 0 }));

    return [kopBlock, ...bodyBlocks, ...footerBlocks].map((b) => normalizeBlockAlignment(b));
  }, []);

  const [blocks, setBlocksState] = useState<DocBlock[]>(() =>
    normalizeBlocksStructure(visibleInitialBlocks)
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
  const [showLeftPanel, setShowLeftPanel] = useState(false); // mobile library drawer
  const [showRightPanel, setShowRightPanel] = useState(false); // mobile inspector drawer
  const [rightInspectorOpen, setRightInspectorOpen] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1280 : true
  );
  const [showLeftReviewDrawer, setShowLeftReviewDrawer] = useState(false);
  const [activeRibbonTab, setActiveRibbonTab] = useState<"INSERT" | "LAYOUT" | "REVIEW" | "DATA">(
    initialStatus === "APPROVED" ? "REVIEW" : "INSERT"
  );
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [layoutMode, setLayoutMode] = useState<WorkspaceLayoutMode>("PAGINATED");
  const [showRuler, setShowRuler] = useState<boolean>(true);
  const [leftReviewTab, setLeftReviewTab] = useState<
    "PAGES" | "OUTLINE" | "COMMENTS" | "CHANGES" | "PREFLIGHT" | null
  >(() => (typeof window !== "undefined" && window.innerWidth >= 1280 ? "PAGES" : null));
  const [activePageNumber, setActivePageNumber] = useState<number>(1);
  const lastPageJumpAtRef = useRef<number>(0);
  const [isTrackChangesEnabled, setIsTrackChangesEnabled] = useState<boolean>(false);
  const [commentFilter, setCommentFilter] = useState<"OPEN" | "RESOLVED" | "ALL">("OPEN");
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const [pageSetupModalOpen, setPageSetupModalOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [preflightGuardOpen, setPreflightGuardOpen] = useState(false);

  // Find & Replace
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // ERP Live Mail Merge
  const [mailMergeOpen, setMailMergeOpen] = useState(false);
  const [mailMergeSourceType, setMailMergeSourceType] = useState<"ALL" | MailMergeSourceType>("ALL");
  const [mailMergeSearch, setMailMergeSearch] = useState("");
  const [mailMergeRecords, setMailMergeRecords] = useState<MailMergeSourceRecord[]>([]);
  const [mailMergeLoading, setMailMergeLoading] = useState(false);
  const [activeMergeRecord, setActiveMergeRecord] = useState<MailMergeSourceRecord | null>(null);
  const [isMergePreview, setIsMergePreview] = useState(false);

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
  const lastTrackedEditRef = useRef<{ blockId: string; ts: number } | null>(null);

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

  const recordBlockRevision = useCallback(
    (
      type: DocTrackedChange["type"],
      blockId: string,
      beforeBlock: DocBlock | undefined,
      afterBlock: DocBlock | undefined,
      targetIndex?: number
    ) => {
      if (!isTrackChangesEnabled) return;
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const beforeSummary = summarizeBlockChange(beforeBlock);
      const afterSummary = summarizeBlockChange(afterBlock);

      setTrackedChanges((prev) => {
        const last = lastTrackedEditRef.current;
        if (
          type !== "INSERT" &&
          type !== "DELETE" &&
          last &&
          last.blockId === blockId &&
          now - last.ts < 3500
        ) {
          const existingIdx = [...prev]
            .reverse()
            .findIndex((c) => c.blockId === blockId && c.status === "PENDING" && (c.type === "FORMAT" || c.type === "TABLE_EDIT"));
          if (existingIdx !== -1) {
            const realIdx = prev.length - 1 - existingIdx;
            const updated = [...prev];
            updated[realIdx] = {
              ...updated[realIdx],
              afterSummary,
              createdAt: nowIso,
            };
            lastTrackedEditRef.current = { blockId, ts: now };
            return updated;
          }
        }
        lastTrackedEditRef.current = { blockId, ts: now };
        return [
          ...prev,
          {
            id: `tc-${now}-${Math.random().toString(36).slice(2, 6)}`,
            blockId,
            type,
            authorUsername: actorUsername,
            authorRole: actorRole,
            beforeSummary,
            afterSummary,
            status: "PENDING",
            createdAt: nowIso,
            snapshotBlock: beforeBlock ? JSON.parse(JSON.stringify(beforeBlock)) : undefined,
            targetIndex,
          },
        ];
      });
    },
    [isTrackChangesEnabled, actorUsername, actorRole]
  );

  const updateBlock = useCallback(
    (id: string, updates: Partial<DocBlock>) => {
      const beforeBlock = blocksRef.current.find((b) => b.id === id);
      let modifiedTarget: DocBlock | undefined;
      const nextList = blocksRef.current.map((b) => {
        if (b.id !== id) return b;
        if (b.type === "OFFICIAL_LETTERHEAD" || b.isLocked) {
          modifiedTarget = {
            ...b,
            width: updates.width !== undefined ? updates.width : b.width,
            height: updates.height !== undefined ? updates.height : b.height,
          };
          return modifiedTarget;
        }
        const modified: DocBlock = { ...b, ...updates };
        if (b.type === "FOOTER" || b.type === "FOOTER_BLOCK") {
          modified.x = 0;
          modified.y = 0;
          modified.width = "100%";
          delete modified.height;
        }
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
        modifiedTarget = modified;
        return modified;
      });
      applyBlocks(nextList);
      if (beforeBlock && modifiedTarget) {
        const revType: DocTrackedChange["type"] =
          updates.tableData !== undefined || beforeBlock.type === "TABLE" ? "TABLE_EDIT" : "FORMAT";
        recordBlockRevision(revType, id, beforeBlock, modifiedTarget);
      }
    },
    [applyBlocks, recordBlockRevision]
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
          const prevSig = current[existingSigIdx];
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
          recordBlockRevision("FORMAT", block.id, prevSig, block, replaceIdx);
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
      const firstFooterIdx = current.findIndex((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
      let idx: number;
      if (isFooterItem) {
        // Footer blocks always stay at the bottom of the document
        idx = current.length;
      } else {
        const maxInsertIdx = firstFooterIdx >= 0 ? firstFooterIdx : current.length;
        if (atIndex !== undefined && atIndex !== null) {
          idx = Math.max(1, Math.min(atIndex, maxInsertIdx)); // never above locked kop or below footer
        } else if (selectedBlockId) {
          const selIdx = current.findIndex((b) => b.id === selectedBlockId);
          idx = selIdx >= 0 ? Math.max(1, Math.min(selIdx + 1, maxInsertIdx)) : maxInsertIdx;
        } else {
          idx = maxInsertIdx;
        }
      }
      const next = [...current.slice(0, idx), block, ...current.slice(idx)];
      applyBlocks(next);
      recordBlockRevision("INSERT", block.id, undefined, block, idx);
      setSelectedBlockId(block.id);
      setQuickInsertIndex(null);
      notify(
        isId ? `Blok "${item.labelId}" ditambahkan.` : `"${item.labelEn}" block added.`,
        "success"
      );
    },
    [applyBlocks, department, isId, notify, selectedBlockId, targetAuthDept, recordBlockRevision]
  );

  const deleteBlock = useCallback(
    (id: string) => {
      const targetIdx = blocksRef.current.findIndex((b) => b.id === id);
      const target = targetIdx >= 0 ? blocksRef.current[targetIdx] : undefined;
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
      recordBlockRevision("DELETE", id, target, undefined, targetIdx);
      applyBlocks(blocksRef.current.filter((b) => b.id !== id));
      if (selectedBlockId === id) setSelectedBlockId(null);
    },
    [applyBlocks, isId, notify, selectedBlockId, recordBlockRevision]
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
          isId ? "Footer dokumen terkunci di bagian bawah dan tidak dapat diduplikasi." : "Pinned document footer cannot be duplicated.",
          "info"
        );
        return;
      }
      const copy: DocBlock = { ...JSON.parse(JSON.stringify(target)), id: newBlockId() };
      const idx = blocksRef.current.findIndex((b) => b.id === id);
      const next = [...blocksRef.current];
      next.splice(idx + 1, 0, copy);
      applyBlocks(next);
      recordBlockRevision("INSERT", copy.id, undefined, copy, idx + 1);
      setSelectedBlockId(copy.id);
    },
    [applyBlocks, isId, notify, recordBlockRevision]
  );

  const moveBlock = useCallback(
    (id: string, direction: "UP" | "DOWN") => {
      const current = blocksRef.current;
      const idx = current.findIndex((b) => b.id === id);
      if (idx === -1) return;
      if (current[idx].type === "OFFICIAL_LETTERHEAD" || current[idx].isLocked) return;
      const isFooter = current[idx].type === "FOOTER" || current[idx].type === "FOOTER_BLOCK";
      if (isFooter) return; // footer stays anchored at the bottom of the page
      if (direction === "UP" && idx <= 1) return; // kop stays at index 0
      const firstFooterIdx = current.findIndex((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
      const lastMovableIdx = firstFooterIdx >= 0 ? firstFooterIdx - 1 : current.length - 1;
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
      if (current[fromIdx].type === "OFFICIAL_LETTERHEAD" || current[fromIdx].isLocked) return;
      if (current[fromIdx].type === "FOOTER" || current[fromIdx].type === "FOOTER_BLOCK") return;
      if (current[toIdx].type === "FOOTER" || current[toIdx].type === "FOOTER_BLOCK") return;
      const next = [...current];
      const [moved] = next.splice(fromIdx, 1);
      toIdx = next.findIndex((b) => b.id === targetId);
      const firstFooterIdx = next.findIndex((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
      const maxInsert = firstFooterIdx >= 0 ? firstFooterIdx : next.length;
      const insertAt = pos === "before" ? toIdx : toIdx + 1;
      next.splice(Math.max(1, Math.min(insertAt, maxInsert)), 0, moved); // never above locked kop or below footer
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
      if (
        !currentBlock ||
        currentBlock.isLocked ||
        currentBlock.type === "OFFICIAL_LETTERHEAD" ||
        currentBlock.type === "FOOTER" ||
        currentBlock.type === "FOOTER_BLOCK"
      ) {
        return;
      }
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
    if (
      !currentBlock ||
      currentBlock.isLocked ||
      currentBlock.type === "OFFICIAL_LETTERHEAD" ||
      currentBlock.type === "FOOTER" ||
      currentBlock.type === "FOOTER_BLOCK"
    ) {
      return;
    }
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
    if (
      !currentBlock ||
      currentBlock.isLocked ||
      currentBlock.type === "OFFICIAL_LETTERHEAD" ||
      currentBlock.type === "FOOTER" ||
      currentBlock.type === "FOOTER_BLOCK"
    ) {
      return;
    }
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

  /* ---------- WordCraft Document Meta envelope getter ---------- */
  const getBlocksWithMeta = useCallback(() => {
    return mergeDocumentMeta(blocksRef.current, {
      pageSetup,
      comments,
      trackedChanges,
      footnotes,
    });
  }, [pageSetup, comments, trackedChanges, footnotes]);

  /* ---------- Save ---------- */
  const handleSave = useCallback(
    async (submitForApproval: boolean, closeAfter: boolean) => {
      const currentBlocks = blocksRef.current;
      const contentWithMeta = mergeDocumentMeta(currentBlocks, {
        pageSetup,
        comments,
        trackedChanges,
        footnotes,
      });
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
            content: contentWithMeta,
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
      pageSetup,
      comments,
      trackedChanges,
      footnotes,
      notify,
    ]
  );

  /* ---------- WordCraft Review Actions (Page Setup, Comments, Track Changes) ---------- */
  const updatePageSetup = useCallback((patch: Partial<DocPageSetup>) => {
    setPageSetup((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const addCommentThread = useCallback(
    (blockId: string, text: string, selectedText = "") => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const newThread: DocCommentThread = {
        id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        blockId,
        selectedText,
        authorUsername: actorUsername,
        authorRole: actorRole,
        text: trimmed,
        resolved: false,
        createdAt: new Date().toISOString(),
        replies: [],
      };
      setComments((prev) => [newThread, ...prev]);
      setDirty(true);
      setLeftReviewTab("COMMENTS");
      notify("Margin comment added.", "success");
    },
    [actorUsername, actorRole, notify]
  );

  const replyToComment = useCallback(
    (threadId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setComments((prev) =>
        prev.map((c) =>
          c.id === threadId
            ? {
                ...c,
                replies: [
                  ...c.replies,
                  {
                    id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    authorUsername: actorUsername,
                    authorRole: actorRole,
                    text: trimmed,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : c
        )
      );
      setDirty(true);
    },
    [actorUsername, actorRole]
  );

  const toggleResolveComment = useCallback((threadId: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === threadId ? { ...c, resolved: !c.resolved } : c))
    );
    setDirty(true);
  }, []);

  const deleteCommentThread = useCallback((threadId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== threadId));
    setDirty(true);
  }, []);

  const acceptTrackedChange = useCallback(
    (changeId: string) => {
      setTrackedChanges((prev) =>
        prev.map((c) => (c.id === changeId ? { ...c, status: "ACCEPTED" } : c))
      );
      setDirty(true);
      notify("Revision accepted.", "success");
    },
    [notify]
  );

  const rejectTrackedChange = useCallback(
    (changeId: string) => {
      const target = trackedChanges.find((c) => c.id === changeId);
      if (!target || target.status !== "PENDING") return;
      if (target.type === "INSERT") {
        applyBlocks(blocksRef.current.filter((b) => b.id !== target.blockId));
      } else if (target.type === "DELETE" && target.snapshotBlock) {
        const list = [...blocksRef.current];
        const idx = Math.max(1, Math.min(target.targetIndex ?? list.length, list.length));
        list.splice(idx, 0, target.snapshotBlock);
        applyBlocks(list);
      } else if (target.snapshotBlock) {
        applyBlocks(
          blocksRef.current.map((b) => (b.id === target.blockId ? target.snapshotBlock! : b))
        );
      }
      setTrackedChanges((prev) =>
        prev.map((c) => (c.id === changeId ? { ...c, status: "REJECTED" } : c))
      );
      setDirty(true);
      notify("Revision rejected and content restored.", "info");
    },
    [trackedChanges, applyBlocks, notify]
  );

  const acceptAllTrackedChanges = useCallback(() => {
    setTrackedChanges((prev) =>
      prev.map((c) => (c.status === "PENDING" ? { ...c, status: "ACCEPTED" } : c))
    );
    setDirty(true);
    notify("All pending tracked changes accepted.", "success");
  }, [notify]);

  const rejectAllTrackedChanges = useCallback(() => {
    const pending = trackedChanges.filter((c) => c.status === "PENDING");
    if (pending.length === 0) return;
    let next = [...blocksRef.current];
    for (let i = pending.length - 1; i >= 0; i--) {
      const ch = pending[i];
      if (ch.type === "INSERT") {
        next = next.filter((b) => b.id !== ch.blockId);
      } else if (ch.type === "DELETE" && ch.snapshotBlock) {
        const idx = Math.max(1, Math.min(ch.targetIndex ?? next.length, next.length));
        next.splice(idx, 0, ch.snapshotBlock);
      } else if (ch.snapshotBlock) {
        next = next.map((b) => (b.id === ch.blockId ? ch.snapshotBlock! : b));
      }
    }
    applyBlocks(next);
    setTrackedChanges((prev) =>
      prev.map((c) => (c.status === "PENDING" ? { ...c, status: "REJECTED" } : c))
    );
    setDirty(true);
    notify("All pending tracked changes rejected and reverted.", "info");
  }, [trackedChanges, applyBlocks, notify]);

  /* ---------- Pagination, Outline, Stats, Find & Replace, Preflight ---------- */
  const registerBlockHeight = useCallback((blockId: string, heightPx: number) => {
    if (!Number.isFinite(heightPx) || heightPx <= 0) return;
    const rounded = Math.round(heightPx);
    setMeasuredHeights((prev) => {
      if (prev[blockId] !== undefined && Math.abs(prev[blockId] - rounded) <= 5) {
        return prev;
      }
      return { ...prev, [blockId]: rounded };
    });
  }, []);

  const paperDims = useMemo(
    () => getPaperDimensions(layoutPreset, customWidthMm, customHeightMm),
    [layoutPreset, customWidthMm, customHeightMm]
  );

  const displayBlocks = useMemo(
    () => (isMergePreview && activeMergeRecord ? applyMailMergeToBlocks(blocks, activeMergeRecord) : blocks),
    [blocks, isMergePreview, activeMergeRecord]
  );

  const paginatedPages = useMemo(
    () => paginateDocumentBlocks(displayBlocks, paperDims, pageSetup, measuredHeights),
    [displayBlocks, paperDims, pageSetup, measuredHeights]
  );

  const outlineNodes = useMemo(() => buildDocumentOutline(blocks), [blocks]);

  const docStats = useMemo(
    () => computeDocumentStats(blocks, paginatedPages.length),
    [blocks, paginatedPages.length]
  );

  const jumpToBlock = useCallback((blockId: string) => {
    if (!blockId) return;
    setSelectedBlockId(blockId);
    setTimeout(() => {
      const el = document.getElementById(`doc-container-${blockId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 40);
  }, []);

  /* ---------- Left-Side Page Menu Sync & Operations ---------- */
  useEffect(() => {
    setActivePageNumber((prev) => Math.max(1, Math.min(prev, Math.max(1, paginatedPages.length))));
  }, [paginatedPages.length]);

  useEffect(() => {
    if (!selectedBlockId) return;
    const owner = paginatedPages.find((p) => p.blocks.some((b) => b.id === selectedBlockId));
    if (owner) {
      setActivePageNumber(owner.pageNumber);
    }
  }, [selectedBlockId, paginatedPages]);

  const jumpToPage = useCallback(
    (pageNumber: number) => {
      const target = Math.max(1, Math.min(pageNumber, Math.max(1, paginatedPages.length)));
      lastPageJumpAtRef.current = Date.now();
      if (layoutMode === "CONTINUOUS") {
        setLayoutMode("PAGINATED");
      }
      setActivePageNumber(target);
      const pageObj = paginatedPages.find((p) => p.pageNumber === target);
      const focusBlock =
        pageObj?.blocks.find((b) => b.type !== "OFFICIAL_LETTERHEAD") ||
        pageObj?.blocks[0];
      if (focusBlock) {
        setSelectedBlockId(focusBlock.id);
      }
      setTimeout(() => {
        const container = scrollRef.current;
        const pageEl =
          container?.querySelector<HTMLElement>(`[data-studio-page="${target}"]`) ||
          document.querySelector<HTMLElement>(`[data-studio-page="${target}"]`);
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    },
    [layoutMode, paginatedPages]
  );

  const extractBodyPageSlices = useCallback((): {
    kopBlock: DocBlock;
    slices: DocBlock[][];
    footerBlocks: DocBlock[];
  } => {
    const raw = blocksRef.current;
    const kopBlock =
      raw.find((b) => b.type === "OFFICIAL_LETTERHEAD") ||
      ({ ...OFFICIAL_KOP_SURAT_BLOCK, isLocked: true, width: "100%", x: 0, y: 0 } as DocBlock);
    const rawById = new Map<string, DocBlock>();
    for (const b of raw) {
      rawById.set(b.id, b);
    }

    const footerBlocks = raw.filter(
      (b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK"
    );
    const slices: DocBlock[][] = paginatedPages.map((p) =>
      p.blocks
        .filter(
          (b) =>
            b.type !== "OFFICIAL_LETTERHEAD" &&
            b.type !== "FOOTER" &&
            b.type !== "FOOTER_BLOCK"
        )
        .map((b) => rawById.get(b.id) || b)
    );
    return { kopBlock, slices, footerBlocks };
  }, [paginatedPages]);

  const commitPageSlices = useCallback(
    (kopBlock: DocBlock, slices: DocBlock[][], footerBlocks: DocBlock[]) => {
      const rebuilt: DocBlock[] = [kopBlock];
      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        const hasMoreNonEmptyAfter = slices.slice(i + 1).some((s) => s.length > 0);
        if (i > 0 && (slice.length > 0 || hasMoreNonEmptyAfter)) {
          rebuilt.push(buildBlock("PAGE_BREAK", isId, department, targetAuthDept, "PAGE_BREAK"));
        }
        rebuilt.push(...slice);
      }
      rebuilt.push(...footerBlocks);
      applyBlocks(rebuilt);
    },
    [applyBlocks, department, isId, targetAuthDept]
  );

  const addNewPage = useCallback(
    (afterPageNumber?: number) => {
      if (viewMode !== "edit" || initialStatus === "APPROVED") {
        notify("Document is currently in read-only mode.", "info");
        return;
      }
      const starterBlock: DocBlock = {
        ...buildBlock("TEXT", isId, department, targetAuthDept, "TEXT"),
        content: isId
          ? "Halaman baru — klik di sini untuk mulai menulis konten..."
          : "New page — click here to start writing...",
      };
      const pageBreak = buildBlock("PAGE_BREAK", isId, department, targetAuthDept, "PAGE_BREAK");
      const current = [...blocksRef.current];
      const firstFooterIdx = current.findIndex((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK");
      const maxInsertIdx = firstFooterIdx >= 0 ? firstFooterIdx : current.length;

      let insertIdx = maxInsertIdx;
      const targetAfter = afterPageNumber
        ? Math.max(1, Math.min(afterPageNumber, paginatedPages.length))
        : paginatedPages.length;
      const targetPageObj = paginatedPages.find((p) => p.pageNumber === targetAfter);

      if (afterPageNumber && targetAfter < paginatedPages.length && targetPageObj) {
        const movableIds = targetPageObj.blocks
          .filter(
            (b) =>
              b.type !== "OFFICIAL_LETTERHEAD" &&
              b.type !== "FOOTER" &&
              b.type !== "FOOTER_BLOCK"
          )
          .map((b) => b.id);
        if (movableIds.length > 0) {
          const lastId = movableIds[movableIds.length - 1];
          const foundIdx = current.findIndex((b) => b.id === lastId);
          if (foundIdx >= 0) {
            insertIdx = Math.min(foundIdx + 1, maxInsertIdx);
          }
        } else if (targetAfter === 1) {
          const kopIdx = current.findIndex((b) => b.type === "OFFICIAL_LETTERHEAD");
          insertIdx = Math.min(Math.max(1, kopIdx + 1), maxInsertIdx);
        }
        const nextIsBreakOrEnd =
          insertIdx >= maxInsertIdx || current[insertIdx]?.type === "PAGE_BREAK";
        const inserted: DocBlock[] = nextIsBreakOrEnd
          ? [pageBreak, starterBlock]
          : [pageBreak, starterBlock, buildBlock("PAGE_BREAK", isId, department, targetAuthDept, "PAGE_BREAK")];
        const next = [...current.slice(0, insertIdx), ...inserted, ...current.slice(insertIdx)];
        applyBlocks(next);
      } else {
        const next = [...current.slice(0, maxInsertIdx), pageBreak, starterBlock, ...current.slice(maxInsertIdx)];
        applyBlocks(next);
      }

      setSelectedBlockId(starterBlock.id);
      const nextPageNum = targetAfter + 1;
      setActivePageNumber(nextPageNum);
      lastPageJumpAtRef.current = Date.now();
      if (layoutMode === "CONTINUOUS") setLayoutMode("PAGINATED");
      setTimeout(() => {
        const pageEl =
          scrollRef.current?.querySelector<HTMLElement>(`[data-studio-page="${nextPageNum}"]`) ||
          document.getElementById(`doc-container-${starterBlock.id}`);
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 60);
      notify(`Page ${nextPageNum} added.`, "success");
    },
    [
      applyBlocks,
      department,
      initialStatus,
      isId,
      layoutMode,
      notify,
      paginatedPages,
      targetAuthDept,
      viewMode,
    ]
  );

  const duplicatePage = useCallback(
    (pageNumber: number) => {
      if (viewMode !== "edit" || initialStatus === "APPROVED") {
        notify("Document is currently in read-only mode.", "info");
        return;
      }
      const idx = pageNumber - 1;
      if (idx < 0 || idx >= paginatedPages.length) return;
      const { kopBlock, slices, footerBlocks } = extractBodyPageSlices();
      const sourceSlice = slices[idx] || [];
      const clonedSlice: DocBlock[] =
        sourceSlice.length > 0
          ? sourceSlice.map((b) => ({
              ...JSON.parse(JSON.stringify(b)),
              id: newBlockId(),
            }))
          : [
              {
                ...buildBlock("TEXT", isId, department, targetAuthDept, "TEXT"),
                content: isId
                  ? "Salinan halaman baru..."
                  : "Duplicated page content...",
              },
            ];
      const nextSlices = [...slices.slice(0, idx + 1), clonedSlice, ...slices.slice(idx + 1)];
      commitPageSlices(kopBlock, nextSlices, footerBlocks);
      const nextPageNum = idx + 2;
      if (clonedSlice[0]) {
        setSelectedBlockId(clonedSlice[0].id);
      }
      setActivePageNumber(nextPageNum);
      lastPageJumpAtRef.current = Date.now();
      setTimeout(() => {
        const pageEl = scrollRef.current?.querySelector<HTMLElement>(`[data-studio-page="${nextPageNum}"]`);
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 60);
      notify(`Page ${pageNumber} duplicated as Page ${nextPageNum}.`, "success");
    },
    [
      commitPageSlices,
      department,
      extractBodyPageSlices,
      initialStatus,
      isId,
      notify,
      paginatedPages.length,
      targetAuthDept,
      viewMode,
    ]
  );

  const reorderPages = useCallback(
    (fromPageNumber: number, toPageNumber: number) => {
      if (viewMode !== "edit" || initialStatus === "APPROVED") {
        notify("Document is currently in read-only mode.", "info");
        return;
      }
      const fromIdx = fromPageNumber - 1;
      const toIdx = toPageNumber - 1;
      if (
        fromIdx === toIdx ||
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= paginatedPages.length ||
        toIdx >= paginatedPages.length
      ) {
        return;
      }
      const { kopBlock, slices, footerBlocks } = extractBodyPageSlices();
      const nextSlices = [...slices];
      const [moved] = nextSlices.splice(fromIdx, 1);
      nextSlices.splice(toIdx, 0, moved);
      commitPageSlices(kopBlock, nextSlices, footerBlocks);
      setActivePageNumber(toPageNumber);
      lastPageJumpAtRef.current = Date.now();
      setTimeout(() => {
        const pageEl = scrollRef.current?.querySelector<HTMLElement>(`[data-studio-page="${toPageNumber}"]`);
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 60);
      notify(`Moved Page ${fromPageNumber} to Page ${toPageNumber}.`, "success");
    },
    [
      commitPageSlices,
      extractBodyPageSlices,
      initialStatus,
      notify,
      paginatedPages.length,
      viewMode,
    ]
  );

  const deletePage = useCallback(
    (pageNumber: number) => {
      if (viewMode !== "edit" || initialStatus === "APPROVED") {
        notify("Document is currently in read-only mode.", "info");
        return;
      }
      if (paginatedPages.length <= 1) {
        notify("Document must contain at least one page.", "info");
        return;
      }
      const idx = pageNumber - 1;
      if (idx < 0 || idx >= paginatedPages.length) return;
      const { kopBlock, slices, footerBlocks } = extractBodyPageSlices();
      const removedSlice = slices[idx] || [];
      if (selectedBlockId && removedSlice.some((b) => b.id === selectedBlockId)) {
        setSelectedBlockId(null);
      }
      const nextSlices = slices.filter((_, sIdx) => sIdx !== idx);
      commitPageSlices(kopBlock, nextSlices, footerBlocks);
      const nextActive = Math.max(1, Math.min(pageNumber, nextSlices.length));
      setActivePageNumber(nextActive);
      notify(`Page ${pageNumber} deleted (Ctrl+Z to undo).`, "info");
    },
    [
      commitPageSlices,
      extractBodyPageSlices,
      initialStatus,
      notify,
      paginatedPages.length,
      selectedBlockId,
      viewMode,
    ]
  );

  const findMatches = useMemo<FindMatch[]>(
    () => findMatchesInBlocks(blocks, findQuery, caseSensitive),
    [blocks, findQuery, caseSensitive]
  );

  useEffect(() => {
    setActiveMatchIndex((idx) => (findMatches.length === 0 ? 0 : Math.min(idx, findMatches.length - 1)));
  }, [findMatches.length]);

  const nextMatch = useCallback(() => {
    if (findMatches.length === 0) return;
    setActiveMatchIndex((prev) => {
      const nextIdx = (prev + 1) % findMatches.length;
      jumpToBlock(findMatches[nextIdx].blockId);
      return nextIdx;
    });
  }, [findMatches, jumpToBlock]);

  const prevMatch = useCallback(() => {
    if (findMatches.length === 0) return;
    setActiveMatchIndex((prev) => {
      const nextIdx = (prev - 1 + findMatches.length) % findMatches.length;
      jumpToBlock(findMatches[nextIdx].blockId);
      return nextIdx;
    });
  }, [findMatches, jumpToBlock]);

  const replaceCurrentMatch = useCallback(() => {
    if (findMatches.length === 0) return;
    const targetMatch = findMatches[activeMatchIndex] || findMatches[0];
    const next = replaceSingleMatchInBlocks(blocksRef.current, targetMatch, replaceQuery);
    applyBlocks(next);
    setDirty(true);
    notify("Replaced 1 occurrence.", "success");
  }, [findMatches, activeMatchIndex, replaceQuery, applyBlocks, notify]);

  const replaceAllMatches = useCallback(() => {
    if (!findQuery) return;
    const { blocks: next, count } = replaceAllMatchesInBlocks(
      blocksRef.current,
      findQuery,
      replaceQuery,
      caseSensitive
    );
    if (count === 0) {
      notify("No matching occurrences found.", "info");
      return;
    }
    applyBlocks(next);
    setDirty(true);
    notify(`Replaced ${count} occurrence(s).`, "success");
  }, [findQuery, replaceQuery, caseSensitive, applyBlocks, notify]);

  const printableWidthPx = useMemo(
    () => Math.max(220, paperDims.widthPx - mmToPx(pageSetup.marginLeftMm) - mmToPx(pageSetup.marginRightMm)),
    [paperDims.widthPx, pageSetup.marginLeftMm, pageSetup.marginRightMm]
  );

  const preflightReport = useMemo(
    () =>
      runDocumentPreflight(
        displayBlocks,
        { pageSetup, comments, trackedChanges, footnotes },
        { title: docTitle, printableWidthPx }
      ),
    [displayBlocks, pageSetup, comments, trackedChanges, footnotes, docTitle, printableWidthPx]
  );

  const requestSubmitWithPreflight = useCallback(
    (closeAfter = true) => {
      if (preflightReport.errorCount > 0) {
        setPreflightGuardOpen(true);
        setLeftReviewTab("PREFLIGHT");
        return;
      }
      handleSave(true, closeAfter);
    },
    [preflightReport.errorCount, handleSave]
  );

  /* ---------- ERP Live Mail Merge ---------- */
  const loadMailMergeSources = useCallback(
    async (type = mailMergeSourceType, q = mailMergeSearch) => {
      setMailMergeLoading(true);
      try {
        const res = await apiFetch(
          `/api/workspace-documents/mail-merge-sources?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`,
          {},
          actorUsername
        );
        const list = (res.data as any)?.data || [];
        setMailMergeRecords(Array.isArray(list) ? list : []);
      } catch {
        setMailMergeRecords([]);
      } finally {
        setMailMergeLoading(false);
      }
    },
    [mailMergeSourceType, mailMergeSearch, actorUsername]
  );

  useEffect(() => {
    if (mailMergeOpen) {
      loadMailMergeSources(mailMergeSourceType, mailMergeSearch);
    }
  }, [mailMergeOpen, mailMergeSourceType]);

  const insertMergeToken = useCallback(
    (token: string) => {
      const chip = `{{${token}}}`;
      const sel = blocksRef.current.find((b) => b.id === selectedBlockId);
      if (sel && !sel.isLocked && sel.type !== "OFFICIAL_LETTERHEAD") {
        const curText = sel.content || "";
        const spacer = curText && !curText.endsWith(" ") ? " " : "";
        updateBlock(sel.id, { content: `${curText}${spacer}${chip}` });
        notify(`Inserted token ${chip} into selected block.`, "success");
        return;
      }
      const newBlock: DocBlock = {
        ...buildBlock("TEXT", false, department),
        content: `Reference Data: ${chip}`,
      };
      const insertAt = blocksRef.current.length;
      const next = [...blocksRef.current.slice(0, insertAt), newBlock, ...blocksRef.current.slice(insertAt)];
      applyBlocks(next);
      setSelectedBlockId(newBlock.id);
      notify(`Added paragraph block with ${chip}.`, "success");
    },
    [selectedBlockId, updateBlock, department, applyBlocks, notify]
  );

  const applyMergePermanently = useCallback(
    (record: MailMergeSourceRecord) => {
      const merged = applyMailMergeToBlocks(blocksRef.current, record);
      applyBlocks(merged);
      setIsMergePreview(false);
      setActiveMergeRecord(null);
      setDirty(true);
      notify(`Applied live ERP record "${record.label}" to document.`, "success");
    },
    [applyBlocks, notify]
  );

  const batchGenerateDrafts = useCallback(
    async (records: MailMergeSourceRecord[]) => {
      if (!records.length) return;
      const targetDocId = documentId || "template";
      const res = await apiFetch(
        `/api/workspace-documents/${targetDocId}/batch-merge`,
        {
          method: "POST",
          body: JSON.stringify({
            records,
            title: docTitle,
            content: getBlocksWithMeta(),
          }),
        },
        actorUsername
      );
      if (res.ok) {
        const count = (res.data as any)?.count || records.length;
        notify(`Generated ${count} personalized draft document(s) in Workspace.`, "success");
        setMailMergeOpen(false);
      } else {
        notify(res.error || "Batch draft generation failed.", "error");
      }
    },
    [documentId, docTitle, getBlocksWithMeta, actorUsername, notify]
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

      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          requestSubmitWithPreflight(true);
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
        if (
          blk &&
          blk.type !== "OFFICIAL_LETTERHEAD" &&
          blk.type !== "FOOTER" &&
          blk.type !== "FOOTER_BLOCK" &&
          !blk.isLocked
        ) {
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
        if (findOpen) {
          setFindOpen(false);
        } else if (pageSetupModalOpen) {
          setPageSetupModalOpen(false);
        } else if (mailMergeOpen) {
          setMailMergeOpen(false);
        } else if (compareModalOpen) {
          setCompareModalOpen(false);
        } else if (quickInsertIndex !== null) {
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
  }, [handleSave, requestSubmitWithPreflight, undo, redo, duplicateBlock, deleteBlock, updateBlock, selectedBlockId, viewMode, quickInsertIndex, showShortcuts, showCloseConfirm, findOpen, pageSetupModalOpen, mailMergeOpen, compareModalOpen]);

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

  /* ---------- Responsive Rail Toggles (Desktop + Mobile/Tablet Drawer) ---------- */
  const openLeftReviewPanel = useCallback(
    (tab: "PAGES" | "OUTLINE" | "COMMENTS" | "CHANGES" | "PREFLIGHT") => {
      setLeftReviewTab(tab);
      if (layoutMode === "FOCUS") setLayoutMode("PAGINATED");
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setShowLeftReviewDrawer(true);
      }
    },
    [layoutMode]
  );

  const toggleLeftReviewRail = useCallback(() => {
    const isSmall = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isSmall) {
      setShowLeftReviewDrawer((prev) => {
        const next = !prev;
        if (next && !leftReviewTab) setLeftReviewTab("PAGES");
        return next;
      });
      if (layoutMode === "FOCUS") setLayoutMode("PAGINATED");
    } else {
      if (layoutMode === "FOCUS") {
        setLayoutMode("PAGINATED");
        setLeftReviewTab("PAGES");
        return;
      }
      setLeftReviewTab((prev) => (prev ? null : "PAGES"));
    }
  }, [layoutMode, leftReviewTab]);

  const toggleRightInspector = useCallback(() => {
    const isSmall = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isSmall) {
      setShowRightPanel((prev) => !prev);
    } else {
      if (layoutMode === "FOCUS") {
        setLayoutMode("PAGINATED");
        setRightInspectorOpen(true);
        return;
      }
      setRightInspectorOpen((prev) => !prev);
    }
  }, [layoutMode]);

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
    actorUsername,
    actorRole,
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
    displayBlocks,
    getBlocksWithMeta,
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
    rightInspectorOpen,
    setRightInspectorOpen,
    showLeftReviewDrawer,
    setShowLeftReviewDrawer,
    activeRibbonTab,
    setActiveRibbonTab,
    ribbonCollapsed,
    setRibbonCollapsed,
    openLeftReviewPanel,
    toggleLeftReviewRail,
    toggleRightInspector,
    zoomLevel,
    setZoomLevel,
    showGrid,
    setShowGrid,
    viewMode,
    setViewMode,
    layoutMode,
    setLayoutMode,
    showRuler,
    setShowRuler,
    leftReviewTab,
    setLeftReviewTab,
    pageSetup,
    updatePageSetup,
    comments,
    commentFilter,
    setCommentFilter,
    addCommentThread,
    replyToComment,
    toggleResolveComment,
    deleteCommentThread,
    trackedChanges,
    isTrackChangesEnabled,
    setIsTrackChangesEnabled,
    acceptTrackedChange,
    rejectTrackedChange,
    acceptAllTrackedChanges,
    rejectAllTrackedChanges,
    footnotes,
    paginatedPages,
    activePageNumber,
    setActivePageNumber,
    lastPageJumpAtRef,
    jumpToPage,
    addNewPage,
    duplicatePage,
    reorderPages,
    deletePage,
    registerBlockHeight,
    outlineNodes,
    docStats,
    jumpToBlock,
    findOpen,
    setFindOpen,
    findQuery,
    setFindQuery,
    replaceQuery,
    setReplaceQuery,
    caseSensitive,
    setCaseSensitive,
    findMatches,
    activeMatchIndex,
    setActiveMatchIndex,
    nextMatch,
    prevMatch,
    replaceCurrentMatch,
    replaceAllMatches,
    preflightReport,
    preflightGuardOpen,
    setPreflightGuardOpen,
    requestSubmitWithPreflight,
    mailMergeOpen,
    setMailMergeOpen,
    mailMergeSourceType,
    setMailMergeSourceType,
    mailMergeSearch,
    setMailMergeSearch,
    mailMergeRecords,
    mailMergeLoading,
    activeMergeRecord,
    setActiveMergeRecord,
    isMergePreview,
    setIsMergePreview,
    loadMailMergeSources,
    insertMergeToken,
    applyMergePermanently,
    batchGenerateDrafts,
    pageSetupModalOpen,
    setPageSetupModalOpen,
    compareModalOpen,
    setCompareModalOpen,
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
