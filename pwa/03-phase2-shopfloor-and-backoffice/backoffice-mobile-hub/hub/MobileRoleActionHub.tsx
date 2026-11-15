import React from "react";
import { ChevronRight, Filter, RefreshCw, Search, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import type {
  HubCategory,
  ApprovalDocFilter,
  InspectorItemType,
} from "../monitorTypes";

interface MobileRoleActionHubProps {
  role: string;
  isExecutive: boolean;
  user: any;
  profile: any;
  isLoading: boolean;
  fetchMonitorData: () => void;
  hubCategories: Array<{
    id: HubCategory;
    label: string;
    count: number;
    icon: React.ReactNode;
  }>;
  activeCategory: HubCategory;
  setSelectedCategory: (cat: HubCategory | null) => void;
  subFilter: ApprovalDocFilter;
  setSubFilter: (f: ApprovalDocFilter) => void;
  setSearchParams: (params: Record<string, string>) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isFilterSheetOpen: boolean;
  setIsFilterSheetOpen: (open: boolean) => void;
  hubItems: any[];
  openInspector: (type: InspectorItemType, data: any) => void;
  totalPendingApprovalsCount: number;
  pendingPRsCount: number;
  unapprovedPOsCount: number;
  pendingQuotationsCount: number;
  unapprovedDeliveriesCount: number;
  purchaseRequestsCount: number;
  purchaseOrdersCount: number;
}

export const MobileRoleActionHub: React.FC<MobileRoleActionHubProps> = React.memo(({
  role,
  isExecutive,
  user,
  profile,
  isLoading,
  fetchMonitorData,
  hubCategories,
  activeCategory,
  setSelectedCategory,
  subFilter,
  setSubFilter,
  setSearchParams,
  searchQuery,
  setSearchQuery,
  isFilterSheetOpen,
  setIsFilterSheetOpen,
  hubItems,
  openInspector,
  totalPendingApprovalsCount,
  pendingPRsCount,
  unapprovedPOsCount,
  pendingQuotationsCount,
  unapprovedDeliveriesCount,
  purchaseRequestsCount,
  purchaseOrdersCount,
}) => {
  return (
    <>
      <div className="space-y-3.5">
        {/* Role Hub Header */}
        <div className="bg-white border border-stone-200/90 rounded-3xl p-4 shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">
                {role} · {isExecutive ? "EXECUTIVE" : user?.level || "STAFF"}
              </div>
              <h1 className="text-base font-bold text-stone-900 tracking-tight">
                {profile.titleEn}
              </h1>
            </div>
            <button
              type="button"
              onClick={fetchMonitorData}
              className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-700 shrink-0 cursor-pointer"
              title="Refresh Hub"
            >
              <RefreshCw
                className={cn("w-4 h-4", isLoading && "animate-spin")}
              />
            </button>
          </div>

          {/* 2-Row Wrapped Bento Grid for Categories (Zero Horizontal Scroll) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {hubCategories.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setSubFilter("ALL");
                    setSearchParams({ tab: "hub", cat: cat.id });
                  }}
                  className={cn(
                    "min-h-[44px] px-3 py-2 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer border text-left",
                    isActive
                      ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                      : "bg-stone-50 text-stone-700 border-stone-200/80 hover:bg-stone-100",
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={cn(
                        "shrink-0",
                        isActive ? "text-stone-300" : "text-stone-600",
                      )}
                    >
                      {cat.icon}
                    </span>
                    <span className="truncate">{cat.label}</span>
                  </div>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-lg text-[10px] font-mono font-extrabold shrink-0",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-white text-stone-600 border border-stone-200/70",
                    )}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input + Sub-Filter Bottom Sheet Trigger */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search document number, project, SKU, or client..."
                className="no-base-style w-full min-h-[42px] pl-10 pr-9 bg-stone-50 border border-stone-200/90 rounded-2xl text-xs font-medium text-stone-900 placeholder-stone-400 focus:bg-white focus:border-stone-400 outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {(activeCategory === "APPROVALS" ||
              activeCategory === "PROCUREMENT") && (
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(true)}
                className={cn(
                  "min-h-[42px] px-3 rounded-2xl border text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors",
                  subFilter !== "ALL"
                    ? "bg-stone-900 border-stone-900 text-white"
                    : "bg-stone-50 border-stone-200/90 text-stone-700 hover:bg-stone-100",
                )}
              >
                <Filter
                  className={cn(
                    "w-3.5 h-3.5",
                    subFilter !== "ALL" ? "text-stone-300" : "text-stone-600",
                  )}
                />
                <span>{subFilter === "ALL" ? "Filter" : subFilter}</span>
              </button>
            )}
          </div>
        </div>

        {/* Hub Items List */}
        <div className="bg-white border border-stone-200/90 rounded-3xl p-2 sm:p-3 shadow-2xs">
          {hubItems.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-1">
              <div className="text-xs font-bold text-stone-500">
                No matching records found
              </div>
              <div className="text-[11px] text-stone-400">
                Try another search keyword or switch categories above.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {hubItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openInspector(item.type, item.raw)}
                  className="w-full p-3 flex items-center justify-between gap-3 text-left hover:bg-stone-50/80 rounded-2xl transition-colors cursor-pointer min-h-[64px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                      <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-mono font-bold text-[10px]">
                        {item.docTypeLabel}
                      </span>
                      <span
                        className={cn(
                          "font-mono font-bold",
                          item.tone === "rose"
                            ? "text-rose-600"
                            : item.tone === "amber"
                              ? "text-amber-700"
                              : item.tone === "emerald"
                                ? "text-emerald-700"
                                : "text-stone-700",
                        )}
                      >
                        {item.status}
                      </span>
                      <span>·</span>
                      <span className="truncate">{item.subtitle}</span>
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-stone-900 truncate mt-0.5">
                      {item.title}
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div className="text-xs font-mono font-bold tabular-nums text-stone-900">
                      {item.meta}
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-300" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SUB-FILTER BOTTOM SHEET (FOR DOCUMENT TYPES) */}
      <AnimatePresence>
        {isFilterSheetOpen && (
          <div className="fixed inset-0 z-[140] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs"
              onClick={() => setIsFilterSheetOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="relative z-10 w-full max-w-lg bg-white rounded-t-3xl shadow-2xl border-t border-stone-200 p-5 pb-8 space-y-4"
            >
              <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto -mt-1" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500">
                    Sub-Filter Options
                  </div>
                  <h3 className="text-base font-bold text-stone-900">
                    Filter by Document Type
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFilterSheetOpen(false)}
                  className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {(activeCategory === "APPROVALS"
                  ? [
                      {
                        id: "ALL" as const,
                        label: "All Pending Documents",
                        count: totalPendingApprovalsCount,
                      },
                      {
                        id: "PR" as const,
                        label: "Purchase Requisitions (PR)",
                        count: pendingPRsCount,
                      },
                      {
                        id: "PO" as const,
                        label: "Purchase Orders (PO)",
                        count: unapprovedPOsCount,
                      },
                      {
                        id: "QUOTATION" as const,
                        label: "Sales Quotations (QTN)",
                        count: pendingQuotationsCount,
                      },
                      {
                        id: "DELIVERY" as const,
                        label: "Delivery Notes (DN)",
                        count: unapprovedDeliveriesCount,
                      },
                    ]
                  : [
                      {
                        id: "ALL" as const,
                        label: "All Procurement Docs (PR & PO)",
                        count: purchaseRequestsCount + purchaseOrdersCount,
                      },
                      {
                        id: "PR" as const,
                        label: "Purchase Requisitions (PR)",
                        count: purchaseRequestsCount,
                      },
                      {
                        id: "PO" as const,
                        label: "Purchase Orders (PO)",
                        count: purchaseOrdersCount,
                      },
                    ]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSubFilter(opt.id);
                      setIsFilterSheetOpen(false);
                    }}
                    className={cn(
                      "min-h-[46px] px-4 rounded-2xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer",
                      subFilter === opt.id
                        ? "bg-stone-900 text-white border-stone-900"
                        : "bg-stone-50 text-stone-800 border-stone-200 hover:bg-stone-100",
                    )}
                  >
                    <span>{opt.label}</span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-lg text-[11px] font-mono",
                        subFilter === opt.id
                          ? "bg-white/20 text-white"
                          : "bg-white text-stone-600 border border-stone-200",
                      )}
                    >
                      {opt.count}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
});
