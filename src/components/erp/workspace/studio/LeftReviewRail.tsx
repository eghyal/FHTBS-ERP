import React, { useMemo, useState } from "react";
import {
  Files,
  ListTree,
  MessageSquare,
  GitPullRequest,
  ShieldAlert,
  Check,
  X,
  RotateCcw,
  Send,
  CheckCircle2,
  AlertTriangle,
  CornerDownRight,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Trash2,
  Copy,
  FilePlus2,
  GripVertical,
  Image as ImageIcon,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocBlock } from "@/types/workspace";
import { getPaperDimensions } from "./config";
import type { CanvaStudioState } from "./useStudioState";

function renderMiniatureBlock(block: DocBlock) {
  const alignClass =
    block.alignment === "CENTER"
      ? "items-center"
      : block.alignment === "RIGHT"
      ? "items-end"
      : "items-start";

  switch (block.type) {
    case "OFFICIAL_LETTERHEAD":
    case "letterhead":
      return (
        <div
          key={block.id}
          className="w-full rounded-[2px] bg-stone-900/90 px-1.5 py-1 flex items-center justify-between gap-1 shrink-0"
        >
          <div className="w-2 h-2 rounded-[1px] bg-amber-400/90 shrink-0" />
          <div className="flex-1 space-y-0.5">
            <div className="h-[2.5px] w-3/4 bg-white/90 rounded-full" />
            <div className="h-[1.5px] w-1/2 bg-stone-400 rounded-full" />
          </div>
        </div>
      );

    case "HEADER":
    case "heading":
      return (
        <div key={block.id} className={cn("w-full flex flex-col gap-0.5 py-0.5", alignClass)}>
          <div className="h-[4px] w-3/4 bg-stone-800 rounded-full" />
          {block.content && <div className="h-[2px] w-1/2 bg-stone-400 rounded-full" />}
        </div>
      );

    case "METADATA_GRID":
    case "SENDER_ADDRESS":
    case "RECIPIENT_ADDRESS":
    case "PROJECT_SITE_ADDRESS":
    case "CONTACT_CARD":
      return (
        <div
          key={block.id}
          className="w-full rounded-[2px] border border-stone-200 bg-stone-50 p-1 grid grid-cols-2 gap-1"
        >
          <div className="h-[2px] w-4/5 bg-stone-400 rounded-full" />
          <div className="h-[2px] w-3/4 bg-stone-300 rounded-full" />
          <div className="h-[2px] w-2/3 bg-stone-300 rounded-full" />
          <div className="h-[2px] w-4/5 bg-stone-400 rounded-full" />
        </div>
      );

    case "TABLE":
      return (
        <div
          key={block.id}
          className="w-full rounded-[2px] border border-stone-300 overflow-hidden bg-white"
        >
          <div className="h-1.5 bg-stone-800/80 w-full" />
          <div className="grid grid-cols-3 gap-px bg-stone-200">
            <div className="h-1 bg-white" />
            <div className="h-1 bg-white" />
            <div className="h-1 bg-white" />
            <div className="h-1 bg-stone-50" />
            <div className="h-1 bg-stone-50" />
            <div className="h-1 bg-stone-50" />
          </div>
        </div>
      );

    case "IMAGE":
    case "image":
    case "IMAGE_STAMP":
      return (
        <div
          key={block.id}
          className="w-full h-5 rounded-[2px] border border-stone-200 bg-stone-100 flex items-center justify-center"
        >
          <ImageIcon className="w-2.5 h-2.5 text-stone-400" />
        </div>
      );

    case "CALLOUT":
      return (
        <div
          key={block.id}
          className="w-full rounded-[2px] border-l-2 border-amber-500 bg-amber-50/80 px-1 py-0.5 space-y-0.5"
        >
          <div className="h-[2.5px] w-2/3 bg-amber-900/50 rounded-full" />
          <div className="h-[2px] w-4/5 bg-amber-800/35 rounded-full" />
        </div>
      );

    case "LIST_POINTS":
    case "CHECKLIST":
      return (
        <div key={block.id} className="w-full space-y-0.5 py-0.5">
          {[0.82, 0.7, 0.76].map((w, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-stone-500 shrink-0" />
              <div
                style={{ width: `${Math.round(w * 100)}%` }}
                className="h-[2px] bg-stone-300 rounded-full"
              />
            </div>
          ))}
        </div>
      );

    case "SIGNATURE_COLUMN":
    case "SIGNATURE_STAMP":
      return (
        <div key={block.id} className={cn("w-full flex flex-col pt-0.5", alignClass)}>
          <div className="w-10 rounded-[2px] border border-stone-200 bg-stone-50/80 p-1 space-y-1">
            <div className="h-1.5 border-b border-dashed border-stone-400" />
            <div className="h-[2px] w-full bg-stone-600 rounded-full" />
          </div>
        </div>
      );

    case "DUAL_SIGNATURE":
      return (
        <div key={block.id} className="w-full grid grid-cols-2 gap-1.5 pt-0.5">
          {[0, 1].map((col) => (
            <div
              key={col}
              className="rounded-[2px] border border-stone-200 bg-stone-50/80 p-1 space-y-1"
            >
              <div className="h-1.5 border-b border-dashed border-stone-400" />
              <div className="h-[2px] w-full bg-stone-600 rounded-full" />
            </div>
          ))}
        </div>
      );

    case "DIVIDER":
      return <div key={block.id} className="w-full h-px bg-stone-300 my-0.5" />;

    case "FOOTER":
    case "FOOTER_BLOCK":
      return (
        <div
          key={block.id}
          className="w-full pt-1 border-t border-stone-200 flex items-center justify-between gap-1"
        >
          <div className="h-[2px] w-1/2 bg-stone-400 rounded-full" />
          <div className="h-[2px] w-1/4 bg-stone-300 rounded-full" />
        </div>
      );

    default: {
      const hasHeadingPreset =
        block.stylePreset === "HEADING_1" ||
        block.stylePreset === "HEADING_2" ||
        block.stylePreset === "TITLE";
      return (
        <div key={block.id} className={cn("w-full flex flex-col gap-[2.5px] py-0.5", alignClass)}>
          {(block.title || hasHeadingPreset) && (
            <div className="h-[3px] w-3/5 bg-stone-700 rounded-full" />
          )}
          <div className="h-[2px] w-full bg-stone-300 rounded-full" />
          <div className="h-[2px] w-[88%] bg-stone-300 rounded-full" />
          <div className="h-[2px] w-[62%] bg-stone-200 rounded-full" />
        </div>
      );
    }
  }
}

export function LeftReviewRail({ state }: { state: CanvaStudioState }) {
  const {
    layoutMode,
    layoutPreset,
    customWidthMm,
    customHeightMm,
    pageSetup,
    leftReviewTab,
    setLeftReviewTab,
    paginatedPages,
    activePageNumber,
    jumpToPage,
    addNewPage,
    duplicatePage,
    reorderPages,
    deletePage,
    outlineNodes,
    docStats,
    selectedBlockId,
    selectedBlock,
    jumpToBlock,
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
    preflightReport,
    isEditable,
    showLeftReviewDrawer,
    setShowLeftReviewDrawer,
  } = state;

  const [newCommentText, setNewCommentText] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [dragPageNum, setDragPageNum] = useState<number | null>(null);
  const [pageDropTarget, setPageDropTarget] = useState<{
    pageNumber: number;
    pos: "before" | "after";
  } | null>(null);

  const paperDims = useMemo(
    () => getPaperDimensions(layoutPreset, customWidthMm, customHeightMm),
    [layoutPreset, customWidthMm, customHeightMm]
  );

  const showDesktopRail = layoutMode !== "FOCUS" && leftReviewTab !== null;
  const showMobileDrawer = showLeftReviewDrawer && leftReviewTab !== null;

  if (!showDesktopRail && !showMobileDrawer) {
    return null;
  }

  const activeTab = leftReviewTab || "PAGES";
  const openCommentsCount = comments.filter((c) => !c.resolved).length;
  const pendingChangesCount = trackedChanges.filter((c) => c.status === "PENDING").length;
  const preflightCount = preflightReport.errorCount + preflightReport.warningCount;

  const filteredComments = comments.filter((c) => {
    if (commentFilter === "OPEN") return !c.resolved;
    if (commentFilter === "RESOLVED") return c.resolved;
    return true;
  });

  const handleCloseRail = () => {
    setShowLeftReviewDrawer(false);
    if (typeof window === "undefined" || window.innerWidth >= 1024) {
      setLeftReviewTab(null);
    }
  };

  const handleDropOnPage = (targetPageNumber: number, pos: "before" | "after") => {
    if (dragPageNum === null || !isEditable) return;
    const fromIdx = dragPageNum - 1;
    const rawSlot = pos === "before" ? targetPageNumber - 1 : targetPageNumber;
    const destIdx = fromIdx < rawSlot ? rawSlot - 1 : rawSlot;
    if (destIdx !== fromIdx) {
      reorderPages(dragPageNum, destIdx + 1);
    }
    setDragPageNum(null);
    setPageDropTarget(null);
  };

  const renderRailBody = () => (
    <>
      {/* Compact 5-Tab Segmented Rail Navigation */}
      <div className="p-1.5 border-b border-stone-200 bg-white flex items-center gap-1">
        <button
          type="button"
          onClick={() => setLeftReviewTab("PAGES")}
          className={cn(
            "flex-1 h-7 px-1.5 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
            activeTab === "PAGES"
              ? "bg-stone-900 text-white"
              : "text-stone-600 hover:bg-stone-100"
          )}
          title="Pages Menu"
        >
          <Files className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono tabular-nums">{paginatedPages.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setLeftReviewTab("OUTLINE")}
          className={cn(
            "flex-1 h-7 px-1.5 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
            activeTab === "OUTLINE"
              ? "bg-stone-900 text-white"
              : "text-stone-600 hover:bg-stone-100"
          )}
          title="Document Outline"
        >
          <ListTree className="w-3.5 h-3.5 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setLeftReviewTab("COMMENTS")}
          className={cn(
            "flex-1 h-7 px-1.5 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
            activeTab === "COMMENTS"
              ? "bg-stone-900 text-white"
              : "text-stone-600 hover:bg-stone-100"
          )}
          title="Margin Comments"
        >
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          {openCommentsCount > 0 && (
            <span className="font-mono tabular-nums">{openCommentsCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setLeftReviewTab("CHANGES")}
          className={cn(
            "flex-1 h-7 px-1.5 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
            activeTab === "CHANGES"
              ? "bg-stone-900 text-white"
              : "text-stone-600 hover:bg-stone-100"
          )}
          title="Track Changes"
        >
          <GitPullRequest className="w-3.5 h-3.5 shrink-0" />
          {pendingChangesCount > 0 && (
            <span className="font-mono tabular-nums">{pendingChangesCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setLeftReviewTab("PREFLIGHT")}
          className={cn(
            "flex-1 h-7 px-1.5 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors",
            activeTab === "PREFLIGHT"
              ? "bg-stone-900 text-white"
              : preflightReport.errorCount > 0
              ? "text-rose-700 bg-rose-50 hover:bg-rose-100"
              : "text-stone-600 hover:bg-stone-100"
          )}
          title="Strict Preflight Inspector"
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          {preflightCount > 0 && (
            <span className="font-mono tabular-nums">{preflightCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={handleCloseRail}
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer shrink-0"
          title="Collapse Left Rail"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Contextual Pane Subheader */}
      <div className="px-3 py-2 border-b border-stone-200/80 bg-stone-50 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-stone-900 truncate">
            {activeTab === "PAGES"
              ? `Pages (${paginatedPages.length})`
              : activeTab === "OUTLINE"
              ? `Outline (${outlineNodes.length})`
              : activeTab === "COMMENTS"
              ? `Comments (${openCommentsCount} open)`
              : activeTab === "CHANGES"
              ? `Track Changes (${pendingChangesCount})`
              : "Strict Preflight"}
          </div>
          {activeTab === "PAGES" && (
            <div className="text-[10px] text-stone-500 font-mono tabular-nums truncate">
              {paperDims.shortLabel} · P{activePageNumber}/{paginatedPages.length}
            </div>
          )}
        </div>
        {activeTab === "PAGES" && isEditable && (
          <button
            type="button"
            onClick={() => addNewPage()}
            className="px-2 py-1 rounded-lg bg-stone-900 text-white hover:bg-stone-800 text-[10.5px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            title="Append a blank page at end"
          >
            <Plus className="w-3 h-3" />
            <span>New Page</span>
          </button>
        )}
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {/* 0. PAGES MENU TAB */}
        {activeTab === "PAGES" && (
          <div className="space-y-2.5">
            {paginatedPages.map((page) => {
              const isActive = activePageNumber === page.pageNumber;
              const isDraggingThis = dragPageNum === page.pageNumber;
              const isDropBefore =
                pageDropTarget?.pageNumber === page.pageNumber &&
                pageDropTarget.pos === "before";
              const isDropAfter =
                pageDropTarget?.pageNumber === page.pageNumber &&
                pageDropTarget.pos === "after";
              const canDragReorder = isEditable && paginatedPages.length > 1;
              const movableCount = page.blocks.filter(
                (b) => b.type !== "OFFICIAL_LETTERHEAD"
              ).length;

              return (
                <div
                  key={page.pageNumber}
                  draggable={canDragReorder}
                  onDragStart={(e) => {
                    if (!canDragReorder) return;
                    setDragPageNum(page.pageNumber);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(page.pageNumber));
                  }}
                  onDragEnd={() => {
                    setDragPageNum(null);
                    setPageDropTarget(null);
                  }}
                  onDragOver={(e) => {
                    if (!canDragReorder || dragPageNum === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos: "before" | "after" =
                      e.clientY - rect.top < rect.height / 2 ? "before" : "after";
                    setPageDropTarget({ pageNumber: page.pageNumber, pos });
                  }}
                  onDragLeave={() => {
                    if (pageDropTarget?.pageNumber === page.pageNumber) {
                      setPageDropTarget(null);
                    }
                  }}
                  onDrop={(e) => {
                    if (!canDragReorder || dragPageNum === null) return;
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos: "before" | "after" =
                      e.clientY - rect.top < rect.height / 2 ? "before" : "after";
                    handleDropOnPage(page.pageNumber, pos);
                  }}
                  onClick={() => jumpToPage(page.pageNumber)}
                  className={cn(
                    "relative group rounded-xl border p-2 transition-all cursor-pointer select-none",
                    isActive
                      ? "bg-white border-stone-900 ring-2 ring-stone-900/10 shadow-xs"
                      : "bg-white/80 border-stone-200 hover:border-stone-400 hover:bg-white",
                    isDraggingThis && "opacity-45 scale-[0.98]"
                  )}
                >
                  {isDropBefore && (
                    <div className="absolute -top-1.5 inset-x-1 h-0.5 bg-stone-900 rounded-full z-20 pointer-events-none" />
                  )}
                  {isDropAfter && (
                    <div className="absolute -bottom-1.5 inset-x-1 h-0.5 bg-stone-900 rounded-full z-20 pointer-events-none" />
                  )}

                  {/* Miniature Scaled Paper Sheet Surface */}
                  <div className="flex justify-center">
                    <div
                      style={{
                        aspectRatio: `${paperDims.widthPx} / ${paperDims.heightPx}`,
                      }}
                      className={cn(
                        "w-36 bg-white rounded-md border overflow-hidden flex flex-col p-2 gap-1 relative shadow-[0_1px_3px_rgba(28,25,23,0.08)]",
                        isActive ? "border-stone-400" : "border-stone-200"
                      )}
                    >
                      <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                        {page.blocks.length === 0 ? (
                          <div className="flex-1 flex items-center justify-center text-[9px] text-stone-400 italic">
                            Blank Page
                          </div>
                        ) : (
                          page.blocks
                            .filter((b) => b.type !== "FOOTER" && b.type !== "FOOTER_BLOCK")
                            .slice(0, 12)
                            .map((blk) => renderMiniatureBlock(blk))
                        )}
                      </div>

                      {page.blocks
                        .filter((b) => b.type === "FOOTER" || b.type === "FOOTER_BLOCK")
                        .map((blk) => (
                          <div key={blk.id} className="mt-auto pt-1 shrink-0">
                            {renderMiniatureBlock(blk)}
                          </div>
                        ))}

                      {pageSetup.showPageNumbers && (
                        <div className="pt-0.5 flex items-center justify-end text-[7px] font-mono text-stone-400 tabular-nums shrink-0">
                          <span>{page.pageNumber}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Page Thumbnail Footer Bar & Quick Actions */}
                  <div
                    className="mt-2 pt-1.5 border-t border-stone-100 flex items-center justify-between gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => jumpToPage(page.pageNumber)}
                      className="flex items-center gap-1.5 min-w-0 cursor-pointer text-left"
                      title={`Jump to Page ${page.pageNumber}`}
                    >
                      {canDragReorder && (
                        <GripVertical className="w-3 h-3 text-stone-400 shrink-0 cursor-grab" />
                      )}
                      <span
                        className={cn(
                          "font-mono tabular-nums text-[11px] font-bold",
                          isActive ? "text-stone-900" : "text-stone-700"
                        )}
                      >
                        P{page.pageNumber}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-stone-400 truncate">
                        {movableCount} blk
                      </span>
                    </button>

                    {isEditable && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={page.pageNumber === 1}
                          onClick={() => reorderPages(page.pageNumber, page.pageNumber - 1)}
                          className="p-1 rounded hover:bg-stone-100 text-stone-500 hover:text-stone-900 disabled:opacity-25 cursor-pointer disabled:cursor-default"
                          title="Move Page Up"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={page.pageNumber === paginatedPages.length}
                          onClick={() => reorderPages(page.pageNumber, page.pageNumber + 1)}
                          className="p-1 rounded hover:bg-stone-100 text-stone-500 hover:text-stone-900 disabled:opacity-25 cursor-pointer disabled:cursor-default"
                          title="Move Page Down"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicatePage(page.pageNumber)}
                          className="p-1 rounded hover:bg-stone-100 text-stone-500 hover:text-stone-900 cursor-pointer"
                          title="Duplicate Page"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => addNewPage(page.pageNumber)}
                          className="p-1 rounded hover:bg-stone-100 text-stone-500 hover:text-stone-900 cursor-pointer"
                          title="Insert Page After"
                        >
                          <FilePlus2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={paginatedPages.length <= 1}
                          onClick={() => deletePage(page.pageNumber)}
                          className="p-1 rounded hover:bg-rose-50 text-stone-400 hover:text-rose-600 disabled:opacity-25 cursor-pointer disabled:cursor-default"
                          title={
                            paginatedPages.length <= 1
                              ? "Cannot delete the only page"
                              : `Delete Page ${page.pageNumber}`
                          }
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 1. OUTLINE TAB */}
        {activeTab === "OUTLINE" && (
          <>
            <div className="bg-white border border-stone-200 rounded-xl p-2.5 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[10px] text-stone-500">Words · Chars</div>
                <div className="font-mono font-bold text-stone-900 tabular-nums mt-0.5">
                  {docStats.words.toLocaleString()} · {docStats.characters.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-stone-500">Pages · Blocks</div>
                <div className="font-mono font-bold text-stone-900 tabular-nums mt-0.5">
                  {docStats.pages} · {docStats.blocks}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="px-1 text-[11px] font-semibold text-stone-500">
                Document Navigation ({outlineNodes.length})
              </div>
              {outlineNodes.length === 0 ? (
                <div className="p-4 text-center bg-white border border-stone-200 rounded-xl text-xs text-stone-500">
                  Add a Header, titled section, or Signature block to build the document outline.
                </div>
              ) : (
                <div className="space-y-1">
                  {outlineNodes.map((node) => {
                    const isActive = selectedBlockId === node.blockId;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => jumpToBlock(node.blockId)}
                        className={cn(
                          "w-full text-left px-2.5 py-2 rounded-lg border text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer",
                          node.level === 2 && "pl-4",
                          node.level === 3 && "pl-6",
                          isActive
                            ? "bg-stone-900 text-white border-stone-900"
                            : "bg-white text-stone-800 border-stone-200 hover:bg-stone-100"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold truncate">{node.title}</div>
                          <div
                            className={cn(
                              "text-[10px] font-mono truncate",
                              isActive ? "text-stone-300" : "text-stone-400"
                            )}
                          >
                            {node.type}
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* 2. COMMENTS TAB */}
        {activeTab === "COMMENTS" && (
          <>
            <div className="flex items-center gap-1 bg-stone-200/70 p-1 rounded-lg">
              {(["OPEN", "RESOLVED", "ALL"] as const).map((flt) => (
                <button
                  key={flt}
                  type="button"
                  onClick={() => setCommentFilter(flt)}
                  className={cn(
                    "flex-1 py-1 px-2 rounded-md text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0",
                    commentFilter === flt
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-600 hover:text-stone-900"
                  )}
                >
                  {flt === "OPEN" ? `Open (${openCommentsCount})` : flt === "RESOLVED" ? "Resolved" : "All"}
                </button>
              ))}
            </div>

            {selectedBlock && (
              <div className="bg-white border border-stone-200 rounded-xl p-2.5 space-y-2">
                <div className="text-[11px] font-semibold text-stone-700 truncate">
                  Comment on: {selectedBlock.title || selectedBlock.type}
                </div>
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  rows={2}
                  placeholder="Write a margin review note..."
                  className="w-full text-xs border border-stone-200 rounded-lg p-2 outline-none focus:border-stone-900 resize-none bg-stone-50"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!newCommentText.trim()}
                    onClick={() => {
                      addCommentThread(selectedBlock.id, newCommentText);
                      setNewCommentText("");
                    }}
                    className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-[11px] font-semibold hover:bg-stone-800 disabled:opacity-40 cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Send className="w-3 h-3" />
                    <span>Post Comment</span>
                  </button>
                </div>
              </div>
            )}

            {!selectedBlock && (
              <div className="px-2.5 py-2 rounded-xl border border-stone-200 bg-white text-[11px] text-stone-500">
                Select any block on the canvas to attach a new margin comment.
              </div>
            )}

            <div className="space-y-2">
              {filteredComments.length === 0 ? (
                <div className="p-4 text-center bg-white border border-stone-200 rounded-xl text-xs text-stone-500">
                  No comments match this filter.
                </div>
              ) : (
                filteredComments.map((thread) => (
                  <div
                    key={thread.id}
                    className={cn(
                      "rounded-xl border p-2.5 space-y-2 bg-white transition-colors",
                      thread.resolved ? "border-stone-200 opacity-75" : "border-amber-200"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => jumpToBlock(thread.blockId)}
                        className="text-left min-w-0 flex-1 cursor-pointer hover:underline"
                      >
                        <div className="text-[11px] font-bold text-stone-900 truncate">
                          {thread.authorUsername}
                        </div>
                        <div className="text-[10px] text-stone-500 font-mono tabular-nums">
                          {thread.authorRole} · {new Date(thread.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleResolveComment(thread.id)}
                          className={cn(
                            "p-1 rounded-md border text-[10px] cursor-pointer",
                            thread.resolved
                              ? "border-stone-200 text-stone-600 hover:bg-stone-100"
                              : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                          )}
                          title={thread.resolved ? "Reopen Comment" : "Mark Resolved"}
                        >
                          {thread.resolved ? <RotateCcw className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCommentThread(thread.id)}
                          className="p-1 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Delete Thread"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-stone-800 leading-relaxed whitespace-pre-wrap">
                      {thread.text}
                    </p>

                    {thread.replies.length > 0 && (
                      <div className="space-y-1.5 pt-1.5 border-t border-stone-100">
                        {thread.replies.map((rep) => (
                          <div key={rep.id} className="flex items-start gap-1.5 text-[11px] text-stone-700">
                            <CornerDownRight className="w-3 h-3 text-stone-400 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold text-stone-900">{rep.authorUsername}: </span>
                              <span>{rep.text}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1 pt-1">
                      <input
                        type="text"
                        value={replyDrafts[thread.id] || ""}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [thread.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (replyDrafts[thread.id] || "").trim()) {
                            replyToComment(thread.id, replyDrafts[thread.id]);
                            setReplyDrafts((prev) => ({ ...prev, [thread.id]: "" }));
                          }
                        }}
                        placeholder="Reply..."
                        className="flex-1 min-w-0 text-[11px] px-2 py-1 border border-stone-200 rounded-md bg-stone-50 outline-none focus:border-stone-900"
                      />
                      <button
                        type="button"
                        disabled={!(replyDrafts[thread.id] || "").trim()}
                        onClick={() => {
                          replyToComment(thread.id, replyDrafts[thread.id] || "");
                          setReplyDrafts((prev) => ({ ...prev, [thread.id]: "" }));
                        }}
                        className="p-1.5 rounded-md bg-stone-900 text-white disabled:opacity-30 cursor-pointer shrink-0"
                        title="Send Reply"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* 3. TRACK CHANGES TAB */}
        {activeTab === "CHANGES" && (
          <>
            <div className="bg-white border border-stone-200 rounded-xl p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-stone-900">Track Changes</div>
                  <div className="text-[10px] text-stone-500">
                    {isTrackChangesEnabled ? "Recording block & table edits" : "Paused (direct edit)"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => setIsTrackChangesEnabled((v) => !v)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors whitespace-nowrap shrink-0",
                    isTrackChangesEnabled
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200"
                  )}
                >
                  {isTrackChangesEnabled ? "Tracking ON" : "Enable"}
                </button>
              </div>

              {pendingChangesCount > 0 && isEditable && (
                <div className="flex items-center gap-1.5 pt-2 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={acceptAllTrackedChanges}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
                  >
                    Accept All ({pendingChangesCount})
                  </button>
                  <button
                    type="button"
                    onClick={rejectAllTrackedChanges}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold hover:bg-rose-100 cursor-pointer whitespace-nowrap"
                  >
                    Reject All
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {trackedChanges.length === 0 ? (
                <div className="p-4 text-center bg-white border border-stone-200 rounded-xl text-xs text-stone-500">
                  Enable Track Changes to capture redline inserts, edits, and deletions.
                </div>
              ) : (
                [...trackedChanges].reverse().map((chg) => (
                  <div
                    key={chg.id}
                    className={cn(
                      "rounded-xl border p-2.5 space-y-1.5 bg-white",
                      chg.status === "PENDING" ? "border-stone-300" : "border-stone-200 opacity-70"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-stone-900">
                        {chg.type} · {chg.authorUsername}
                      </span>
                      <span
                        className={cn(
                          "font-mono font-bold",
                          chg.status === "PENDING"
                            ? "text-amber-700"
                            : chg.status === "ACCEPTED"
                            ? "text-emerald-700"
                            : "text-rose-700"
                        )}
                      >
                        {chg.status}
                      </span>
                    </div>

                    {chg.beforeSummary && chg.beforeSummary !== "(empty)" && (
                      <div className="text-[11px] text-rose-700 bg-rose-50/70 rounded px-2 py-1 line-through break-words">
                        {chg.beforeSummary}
                      </div>
                    )}
                    {chg.afterSummary && chg.afterSummary !== "(empty)" && (
                      <div className="text-[11px] text-emerald-800 bg-emerald-50/70 rounded px-2 py-1 underline decoration-emerald-500 break-words">
                        {chg.afterSummary}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => jumpToBlock(chg.blockId)}
                        className="text-[10px] font-semibold text-stone-500 hover:text-stone-900 cursor-pointer"
                      >
                        Locate Block
                      </button>
                      {chg.status === "PENDING" && isEditable && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => acceptTrackedChange(chg.id)}
                            className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-700 cursor-pointer"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectTrackedChange(chg.id)}
                            className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-semibold hover:bg-rose-700 cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* 4. STRICT PREFLIGHT TAB */}
        {activeTab === "PREFLIGHT" && (
          <>
            <div
              className={cn(
                "rounded-xl border p-3 space-y-1",
                preflightReport.errorCount > 0
                  ? "bg-rose-50 border-rose-200 text-rose-900"
                  : preflightReport.warningCount > 0
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-emerald-50 border-emerald-200 text-emerald-900"
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                {preflightReport.issues.length === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {preflightReport.issues.length === 0
                    ? "Strict Preflight Passed"
                    : `${preflightReport.errorCount} Error(s) · ${preflightReport.warningCount} Warning(s)`}
                </span>
              </div>
              <p className="text-[11px] opacity-85 leading-snug">
                Deterministic integrity verification before submission or PDF export.
              </p>
            </div>

            <div className="space-y-2">
              {preflightReport.issues.map((issue) => (
                <div
                  key={issue.id}
                  className={cn(
                    "rounded-xl border bg-white p-2.5 space-y-1.5",
                    issue.severity === "ERROR" ? "border-rose-200" : "border-amber-200"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                    <span
                      className={
                        issue.severity === "ERROR" ? "text-rose-700" : "text-amber-700"
                      }
                    >
                      {issue.severity} · {issue.code}
                    </span>
                  </div>
                  <p className="text-xs text-stone-800 leading-snug">{issue.messageEn}</p>
                  {issue.blockId && (
                    <button
                      type="button"
                      onClick={() => jumpToBlock(issue.blockId!)}
                      className="text-[11px] font-semibold text-stone-900 hover:underline cursor-pointer"
                    >
                      Jump to Issue →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      {showDesktopRail && (
        <aside className="w-72 shrink-0 bg-stone-50 border-r border-stone-200 hidden lg:flex flex-col overflow-hidden print:hidden z-10">
          {renderRailBody()}
        </aside>
      )}

      {showMobileDrawer && (
        <div className="fixed inset-0 z-[60] lg:hidden print:hidden">
          <div
            className="absolute inset-0 bg-stone-950/40"
            onClick={() => setShowLeftReviewDrawer(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-stone-50 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-left duration-200">
            {renderRailBody()}
          </aside>
        </div>
      )}
    </>
  );
}
