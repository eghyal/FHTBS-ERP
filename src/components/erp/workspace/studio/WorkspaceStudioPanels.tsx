import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Replace,
  ChevronUp,
  ChevronDown,
  X,
  Sliders,
  Database,
  Sparkles,
  GitCompareArrows,
  AlertTriangle,
  Check,
  CopyPlus,
  Play,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { MailMergeSourceRecord, MailMergeSourceType } from "@/types/workspace";
import {
  compareDocumentVersions,
  extractMergeTokensFromBlocks,
  stripMetaBlocks,
} from "@/services/workspaceDocumentUtils";
import type { CanvaStudioState } from "./useStudioState";

export function WorkspaceStudioPanels({ state }: { state: CanvaStudioState }) {
  const {
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
    nextMatch,
    prevMatch,
    replaceCurrentMatch,
    replaceAllMatches,
    pageSetupModalOpen,
    setPageSetupModalOpen,
    pageSetup,
    updatePageSetup,
    mailMergeOpen,
    setMailMergeOpen,
    mailMergeSourceType,
    setMailMergeSourceType,
    mailMergeSearch,
    setMailMergeSearch,
    mailMergeRecords,
    mailMergeLoading,
    loadMailMergeSources,
    activeMergeRecord,
    setActiveMergeRecord,
    isMergePreview,
    setIsMergePreview,
    insertMergeToken,
    applyMergePermanently,
    batchGenerateDrafts,
    blocks,
    compareModalOpen,
    setCompareModalOpen,
    versions,
    preflightGuardOpen,
    setPreflightGuardOpen,
    preflightReport,
    jumpToBlock,
    handleSave,
    openLeftReviewPanel,
    isEditable,
  } = state;

  /* ---------- Mail Merge Multi-Selection State ---------- */
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const focusedRecord = useMemo(
    () => mailMergeRecords.find((r) => r.id === focusedRecordId) || mailMergeRecords[0] || null,
    [mailMergeRecords, focusedRecordId]
  );

  const documentTokens = useMemo(() => extractMergeTokensFromBlocks(blocks), [blocks]);

  /* ---------- Version Compare State ---------- */
  const [baseVerKey, setBaseVerKey] = useState<string>(() =>
    versions && versions.length > 0 ? String(versions[versions.length - 1].version) : "LIVE"
  );
  const [targetVerKey, setTargetVerKey] = useState<string>("LIVE");
  const [diffChangedOnly, setDiffChangedOnly] = useState(true);

  useEffect(() => {
    if (compareModalOpen && versions && versions.length > 0) {
      setBaseVerKey(String(versions[0].version));
      setTargetVerKey("LIVE");
    }
  }, [compareModalOpen, versions]);

  const resolveBlocksForKey = (key: string) => {
    if (key === "LIVE") return stripMetaBlocks(blocks);
    const found = (versions || []).find((v: any) => String(v.version) === key);
    if (!found) return [];
    try {
      const parsed = typeof found.content_json === "string" ? JSON.parse(found.content_json) : found.content_json;
      return Array.isArray(parsed) ? stripMetaBlocks(parsed) : [];
    } catch {
      return [];
    }
  };

  const versionDiffItems = useMemo(() => {
    if (!compareModalOpen) return [];
    const baseB = resolveBlocksForKey(baseVerKey);
    const targetB = resolveBlocksForKey(targetVerKey);
    return compareDocumentVersions(baseB, targetB);
  }, [compareModalOpen, baseVerKey, targetVerKey, blocks, versions]);

  const displayedDiffItems = useMemo(
    () => (diffChangedOnly ? versionDiffItems.filter((i) => i.status !== "UNCHANGED") : versionDiffItems),
    [versionDiffItems, diffChangedOnly]
  );

  const diffCounts = useMemo(
    () => ({
      added: versionDiffItems.filter((i) => i.status === "ADDED").length,
      modified: versionDiffItems.filter((i) => i.status === "MODIFIED").length,
      removed: versionDiffItems.filter((i) => i.status === "REMOVED").length,
    }),
    [versionDiffItems]
  );

  return (
    <>
      {/* 1. FLOATING FIND & REPLACE DRAWER (Ctrl+F) */}
      {findOpen && (
        <div className="fixed top-28 right-6 z-[75] w-88 bg-white border border-stone-200 rounded-2xl shadow-2xl p-3 space-y-2.5 print:hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-stone-500" />
              Find & Replace
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono tabular-nums text-stone-500">
                {findQuery ? (findMatches.length > 0 ? `${activeMatchIndex + 1} / ${findMatches.length}` : "0 / 0") : "—"}
              </span>
              <button
                type="button"
                onClick={() => setFindOpen(false)}
                className="p-1 rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              autoFocus
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.shiftKey ? prevMatch() : nextMatch();
                }
              }}
              placeholder="Search text across blocks & tables..."
              className="flex-1 min-w-0 text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg outline-none focus:border-stone-900 bg-stone-50"
            />
            <button
              type="button"
              onClick={() => setCaseSensitive((c) => !c)}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-[11px] font-mono font-bold cursor-pointer shrink-0",
                caseSensitive
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-600 border-stone-200 hover:bg-stone-100"
              )}
              title="Match Case"
            >
              Aa
            </button>
            <button
              type="button"
              onClick={prevMatch}
              disabled={findMatches.length === 0}
              className="p-1.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-100 disabled:opacity-30 cursor-pointer shrink-0"
              title="Previous Match"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={nextMatch}
              disabled={findMatches.length === 0}
              className="p-1.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-100 disabled:opacity-30 cursor-pointer shrink-0"
              title="Next Match"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {isEditable && (
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0">
                <Replace className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={replaceQuery}
                  onChange={(e) => setReplaceQuery(e.target.value)}
                  placeholder="Replace with..."
                  className="w-full text-xs pl-8 pr-2.5 py-1.5 border border-stone-200 rounded-lg outline-none focus:border-stone-900 bg-stone-50"
                />
              </div>
              <button
                type="button"
                disabled={findMatches.length === 0}
                onClick={replaceCurrentMatch}
                className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-[11px] font-semibold text-stone-800 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                Replace
              </button>
              <button
                type="button"
                disabled={findMatches.length === 0}
                onClick={replaceAllMatches}
                className="px-2.5 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-800 text-[11px] font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
              >
                All
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. PAGE SETUP MODAL */}
      {pageSetupModalOpen && (
        <div
          className="fixed inset-0 z-[80] bg-stone-950/40 flex items-center justify-center p-4 print:hidden"
          onClick={() => setPageSetupModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-xl max-h-[90dvh] overflow-y-auto p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-stone-900">
                <Sliders className="w-4 h-4 text-stone-600" />
                <span>Page Setup & Margins</span>
              </div>
              <button
                type="button"
                onClick={() => setPageSetupModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-700">Margins (millimeters)</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { label: "Narrow 10mm", val: 10 },
                    { label: "Standard 18mm", val: 18 },
                    { label: "Wide 25mm", val: 25 },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() =>
                        updatePageSetup({
                          marginTopMm: p.val,
                          marginRightMm: p.val,
                          marginBottomMm: p.val,
                          marginLeftMm: p.val,
                        })
                      }
                      className="px-2 py-1 rounded-md border border-stone-200 bg-stone-50 hover:bg-stone-100 text-[10px] font-semibold text-stone-700 cursor-pointer whitespace-nowrap"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    ["Top (mm)", "marginTopMm"],
                    ["Bottom (mm)", "marginBottomMm"],
                    ["Left (mm)", "marginLeftMm"],
                    ["Right (mm)", "marginRightMm"],
                  ] as const
                ).map(([label, key]) => (
                  <label key={key} className="block text-[11px] text-stone-600 space-y-1">
                    <span>{label}</span>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={pageSetup[key]}
                      onChange={(e) =>
                        updatePageSetup({ [key]: Math.max(5, Math.min(60, Number(e.target.value) || 18)) })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 font-mono text-xs font-bold text-stone-900 bg-stone-50 focus:bg-white outline-none focus:border-stone-900"
                    />
                  </label>
                ))}
              </div>

              <label className="block text-xs text-stone-700 space-y-1">
                <span className="font-semibold">Draft / Classification Watermark</span>
                <input
                  type="text"
                  value={pageSetup.watermarkText ?? "DRAFT"}
                  onChange={(e) => updatePageSetup({ watermarkText: e.target.value })}
                  placeholder="DRAFT, CONFIDENTIAL, or blank for none"
                  className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50 focus:bg-white outline-none focus:border-stone-900"
                />
              </label>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs text-stone-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pageSetup.showPageNumbers}
                    onChange={(e) => updatePageSetup({ showPageNumbers: e.target.checked })}
                    className="rounded border-stone-300"
                  />
                  <span>Show automatic Page X of Y numbers (bottom-right)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-stone-100">
              <Button
                onClick={() => setPageSetupModalOpen(false)}
                variant="primary"
                className="bg-stone-900 text-white rounded-xl text-xs font-bold px-4 py-2"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. ERP LIVE MAIL MERGE MODAL */}
      {mailMergeOpen && (
        <div
          className="fixed inset-0 z-[80] bg-stone-950/40 flex items-center justify-center p-4 print:hidden"
          onClick={() => setMailMergeOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-5xl max-h-[90dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-700" />
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    ERP Live Data Mail Merge & Batch Draft Generator
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Bind live PostgreSQL/ERP Customers, Vendors, Employees, Projects, Quotations & POs via {"{{tokens}}"}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMailMergeOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-stone-200 bg-stone-50 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 flex-wrap">
                {(["ALL", "CUSTOMER", "VENDOR", "EMPLOYEE", "PROJECT", "QUOTATION", "PO"] as const).map(
                  (t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMailMergeSourceType(t)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0",
                        mailMergeSourceType === t
                          ? "bg-stone-900 text-white"
                          : "bg-white border border-stone-200 text-stone-700 hover:bg-stone-100"
                      )}
                    >
                      {t}
                    </button>
                  )
                )}
              </div>
              <div className="flex-1 min-w-[200px] flex items-center gap-1.5">
                <input
                  type="text"
                  value={mailMergeSearch}
                  onChange={(e) => setMailMergeSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadMailMergeSources(mailMergeSourceType, mailMergeSearch);
                  }}
                  placeholder="Search ERP records by name or code..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-xs outline-none focus:border-stone-900"
                />
                <button
                  type="button"
                  onClick={() => loadMailMergeSources(mailMergeSourceType, mailMergeSearch)}
                  className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  Search
                </button>
              </div>
            </div>

            {documentTokens.length > 0 && (
              <div className="px-5 py-2 border-b border-stone-100 bg-amber-50/60 text-[11px] text-amber-900 flex items-center gap-2 flex-wrap">
                <span className="font-semibold">Tokens currently in document:</span>
                <span className="font-mono">{documentTokens.map((t) => `{{${t}}}`).join(" · ")}</span>
              </div>
            )}

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 overflow-hidden min-h-[320px]">
              {/* Left: Record list */}
              <div className="border-r border-stone-200 overflow-y-auto p-3 space-y-1.5">
                {mailMergeLoading ? (
                  <div className="p-8 text-center text-xs text-stone-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading live ERP records...
                  </div>
                ) : mailMergeRecords.length === 0 ? (
                  <div className="p-8 text-center text-xs text-stone-500">
                    No matching ERP records found.
                  </div>
                ) : (
                  mailMergeRecords.map((rec) => {
                    const isFocused = focusedRecord?.id === rec.id;
                    const isChecked = selectedBatchIds.includes(rec.id);
                    return (
                      <div
                        key={rec.id}
                        onClick={() => setFocusedRecordId(rec.id)}
                        className={cn(
                          "p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-colors",
                          isFocused
                            ? "border-stone-900 bg-stone-100"
                            : "border-stone-200 bg-white hover:bg-stone-50"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation();
                            setSelectedBatchIds((prev) =>
                              prev.includes(rec.id)
                                ? prev.filter((x) => x !== rec.id)
                                : [...prev, rec.id]
                            );
                          }}
                          className="mt-0.5 rounded border-stone-300"
                          title="Include in Batch Clone"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-stone-900 truncate">{rec.label}</div>
                          <div className="text-[11px] text-stone-500 truncate">
                            {rec.sourceType} · {rec.subtitle}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right: Token Field Inspector */}
              <div className="overflow-y-auto p-4 space-y-3 bg-stone-50/50">
                {focusedRecord ? (
                  <>
                    <div>
                      <div className="text-xs font-bold text-stone-900">{focusedRecord.label}</div>
                      <div className="text-[11px] text-stone-500">
                        Click any token below to insert {"{{field}}"} into the active canvas block, or preview live values.
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {Object.entries(focusedRecord.fields).map(([key, val]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-2 bg-white border border-stone-200 rounded-lg px-2.5 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-mono font-bold text-stone-900">
                              {`{{${key}}}`}
                            </div>
                            <div className="text-[11px] text-stone-600 truncate">
                              {val || "(blank)"}
                            </div>
                          </div>
                          {isEditable && (
                            <button
                              type="button"
                              onClick={() => insertMergeToken(key)}
                              className="px-2.5 py-1 rounded-md bg-stone-900 text-white text-[10px] font-semibold hover:bg-stone-800 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              Insert Token
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-stone-200 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (isMergePreview && activeMergeRecord?.id === focusedRecord.id) {
                            setIsMergePreview(false);
                            setActiveMergeRecord(null);
                          } else {
                            setActiveMergeRecord(focusedRecord);
                            setIsMergePreview(true);
                            setMailMergeOpen(false);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-xs font-semibold text-stone-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Play className="w-3.5 h-3.5 text-emerald-700" />
                        <span>
                          {isMergePreview && activeMergeRecord?.id === focusedRecord.id
                            ? "Disable Live Preview"
                            : "Live Merge Preview"}
                        </span>
                      </button>

                      {isEditable && (
                        <button
                          type="button"
                          onClick={() => {
                            applyMergePermanently(focusedRecord);
                            setMailMergeOpen(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Apply Permanently</span>
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-xs text-stone-500">
                    Select an ERP record on the left to inspect its merge tokens.
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-stone-200 bg-white flex items-center justify-between gap-3">
              <div className="text-xs text-stone-600 font-mono tabular-nums">
                {selectedBatchIds.length} record(s) selected for batch draft generation
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setMailMergeOpen(false)}
                  variant="outline"
                  className="text-xs rounded-xl"
                >
                  Close
                </Button>
                <Button
                  disabled={selectedBatchIds.length === 0 || batchBusy}
                  onClick={async () => {
                    const selected = mailMergeRecords.filter((r) => selectedBatchIds.includes(r.id));
                    setBatchBusy(true);
                    try {
                      await batchGenerateDrafts(selected);
                      setSelectedBatchIds([]);
                    } finally {
                      setBatchBusy(false);
                    }
                  }}
                  variant="primary"
                  className="bg-stone-900 text-white text-xs rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {batchBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CopyPlus className="w-3.5 h-3.5" />
                  )}
                  <span>Batch Generate Drafts ({selectedBatchIds.length})</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. STUDIO VERSION DIFF MODAL */}
      {compareModalOpen && (
        <div
          className="fixed inset-0 z-[80] bg-stone-950/40 flex items-center justify-center p-4 print:hidden"
          onClick={() => setCompareModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-5xl max-h-[90dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitCompareArrows className="w-4 h-4 text-stone-700" />
                <h3 className="text-sm font-bold text-stone-900">
                  Deterministic Version Compare & Redline Diff
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCompareModalOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-stone-200 bg-stone-50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                  <span>Base:</span>
                  <select
                    value={baseVerKey}
                    onChange={(e) => setBaseVerKey(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white text-xs font-mono font-bold text-stone-900"
                  >
                    {(versions || []).map((v: any) => (
                      <option key={v.id || v.version} value={String(v.version)}>
                        v{v.version} ({v.created_by_username || "user"})
                      </option>
                    ))}
                    <option value="LIVE">Current Live Draft</option>
                  </select>
                </label>

                <span className="text-stone-400 text-xs">→</span>

                <label className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                  <span>Compare:</span>
                  <select
                    value={targetVerKey}
                    onChange={(e) => setTargetVerKey(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white text-xs font-mono font-bold text-stone-900"
                  >
                    <option value="LIVE">Current Live Draft</option>
                    {(versions || []).map((v: any) => (
                      <option key={v.id || v.version} value={String(v.version)}>
                        v{v.version} ({v.created_by_username || "user"})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                <span className="text-emerald-700 font-bold">+{diffCounts.added} Added</span>
                <span className="text-amber-700 font-bold">~{diffCounts.modified} Modified</span>
                <span className="text-rose-700 font-bold">-{diffCounts.removed} Removed</span>
                <label className="flex items-center gap-1.5 font-sans text-stone-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={diffChangedOnly}
                    onChange={(e) => setDiffChangedOnly(e.target.checked)}
                    className="rounded border-stone-300"
                  />
                  <span>Changed only</span>
                </label>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-stone-50/40">
              {displayedDiffItems.length === 0 ? (
                <div className="p-8 text-center bg-white border border-stone-200 rounded-xl text-xs text-stone-500">
                  No block differences found between the selected versions.
                </div>
              ) : (
                displayedDiffItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-stone-200 rounded-xl p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-stone-900">{item.label}</span>
                      <span
                        className={cn(
                          "text-[10px] font-mono font-bold",
                          item.status === "ADDED"
                            ? "text-emerald-700"
                            : item.status === "REMOVED"
                            ? "text-rose-700"
                            : item.status === "MODIFIED"
                            ? "text-amber-700"
                            : "text-stone-400"
                        )}
                      >
                        {item.status} · {item.blockType}
                      </span>
                    </div>
                    <div className="text-xs leading-relaxed text-stone-800 whitespace-pre-wrap">
                      {item.wordDiff.map((seg, i) => {
                        if (seg.kind === "added") {
                          return (
                            <ins
                              key={i}
                              className="bg-emerald-50 text-emerald-800 underline decoration-emerald-500 px-0.5 no-underline border-b border-emerald-500"
                            >
                              {seg.text}
                            </ins>
                          );
                        }
                        if (seg.kind === "removed") {
                          return (
                            <del
                              key={i}
                              className="bg-rose-50 text-rose-700 line-through px-0.5"
                            >
                              {seg.text}
                            </del>
                          );
                        }
                        return <span key={i}>{seg.text}</span>;
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. STRICT PREFLIGHT SUBMIT GUARD MODAL */}
      {preflightGuardOpen && (
        <div
          className="fixed inset-0 z-[85] bg-stone-950/45 flex items-center justify-center p-4 print:hidden"
          onClick={() => setPreflightGuardOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-lg max-h-[90dvh] overflow-y-auto p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Preflight Check Detected Blocking Issues
                </h3>
                <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                  Resolve these errors (such as unresolved {"{{tokens}}"} or #ERR! table formulas) before submitting for official authorization.
                </p>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2">
              {preflightReport.issues
                .filter((i) => i.severity === "ERROR")
                .map((issue) => (
                  <div
                    key={issue.id}
                    className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/50 text-xs text-rose-900 space-y-1"
                  >
                    <div className="font-semibold">{issue.messageEn}</div>
                    {issue.blockId && (
                      <button
                        type="button"
                        onClick={() => {
                          setPreflightGuardOpen(false);
                          openLeftReviewPanel("PREFLIGHT");
                          jumpToBlock(issue.blockId!);
                        }}
                        className="text-[11px] font-bold text-stone-900 hover:underline cursor-pointer"
                      >
                        Jump to Block & Fix →
                      </button>
                    )}
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                onClick={() => {
                  setPreflightGuardOpen(false);
                  openLeftReviewPanel("PREFLIGHT");
                }}
                variant="primary"
                className="bg-stone-900 text-white text-xs rounded-xl"
              >
                Inspect & Fix
              </Button>
              <Button
                onClick={() => {
                  setPreflightGuardOpen(false);
                  handleSave(true, true);
                }}
                variant="outline"
                className="text-xs rounded-xl border-stone-200 text-stone-700"
              >
                Submit Anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
