import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  FolderKanban,
  MessageSquare,
  Monitor,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Zap,
} from "lucide-react";
import { cn, formatIDR } from "@/lib/utils";
import type { HubCategory, InspectorItemType } from "../monitorTypes";

interface MobileHomeDashboardProps {
  role: string;
  isExecutive: boolean;
  isManager: boolean;
  user: any;
  profile: any;
  isLoading: boolean;
  fetchMonitorData: () => void;
  setActiveMode: (mode: "HOME" | "ROLE_HUB", category?: HubCategory) => void;
  setSelectedCategory: (cat: HubCategory | null) => void;
  openDesktopNotice: (title: string, desc: string) => void;
  kpiCards: any[];
  totalPendingApprovalsCount: number;
  pendingPRs: any[];
  unapprovedPOs: any[];
  pendingQuotations: any[];
  unapprovedDeliveries: any[];
  projects: any[];
  openInspector: (type: InspectorItemType, data: any) => void;
}

export const MobileHomeDashboard: React.FC<MobileHomeDashboardProps> = React.memo(({
  role,
  isExecutive,
  isManager,
  user,
  profile,
  isLoading,
  fetchMonitorData,
  setActiveMode,
  setSelectedCategory,
  openDesktopNotice,
  kpiCards,
  totalPendingApprovalsCount,
  pendingPRs,
  unapprovedPOs,
  pendingQuotations,
  unapprovedDeliveries,
  projects,
  openInspector,
}) => {
  return (
    <div className="space-y-4">
      {/* 1. Modern App Greeting & Role Card */}
      <div className="bg-stone-900 text-white rounded-3xl p-4 shadow-md relative overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
              <span>{role}</span>
              <span>·</span>
              <span>{isExecutive ? "EXECUTIVE" : user?.level || "STAFF"}</span>
            </div>
            <h1 className="text-base font-bold tracking-tight text-white truncate">
              Hi, {user?.name || user?.username}
            </h1>
            <p className="text-xs text-stone-300 truncate">
              {isManager ? profile.managerFocusId : profile.staffFocusId}
            </p>
          </div>

          <button
            type="button"
            onClick={fetchMonitorData}
            className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white shrink-0 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw
              className={cn("w-4 h-4", isLoading && "animate-spin")}
            />
          </button>
        </div>

        <div className="mt-3.5 pt-3 border-t border-white/15 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setActiveMode("ROLE_HUB")}
            className="min-h-[36px] px-3.5 rounded-xl bg-white hover:bg-stone-100 text-stone-900 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Zap className="w-3.5 h-3.5 text-stone-900" />
            <span>Open {profile.hubLabelEn}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              openDesktopNotice(
                "System Info & Daily Auth Key",
                "View your Daily 6-Digit Authorization Key, mobile role capabilities, or switch to Desktop Mode.",
              )
            }
            className="min-h-[36px] px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Monitor className="w-3.5 h-3.5 text-[#FFD700]" />
            <span>System Info</span>
          </button>
        </div>
      </div>

      {/* 2. Role-Specific KPI 2x2 Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold text-stone-800 tracking-tight">
            Key Metrics
          </h2>
          <span className="text-[11px] text-stone-400">
            Tap to inspect
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {kpiCards.map((card, idx) => (
            <button
              key={idx}
              type="button"
              onClick={card.onClick}
              className={cn(
                "bg-white border rounded-2xl p-3.5 shadow-2xs text-left flex flex-col justify-between transition-all active:scale-[0.98] cursor-pointer min-h-[104px]",
                card.tone === "rose"
                  ? "border-rose-200/90 bg-rose-50/20"
                  : card.tone === "amber"
                    ? "border-amber-200/90 bg-amber-50/20"
                    : card.tone === "emerald"
                      ? "border-emerald-200/80"
                      : "border-stone-200/80",
              )}
            >
              <div className="flex items-center justify-between gap-2 w-full mb-2">
                <div className="w-8 h-8 rounded-xl bg-stone-50 border border-stone-200/60 flex items-center justify-center shrink-0">
                  {card.icon}
                </div>
                <ChevronRight className="w-4 h-4 text-stone-300" />
              </div>
              <div className="w-full">
                <div className="text-[11px] font-semibold text-stone-500 truncate">
                  {card.label}
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-stone-900 tracking-tight mt-0.5 truncate">
                  {isLoading ? "..." : card.value}
                </div>
                <div className="text-[10px] text-stone-400 mt-0.5 truncate">
                  {card.sub}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Manager & Executive Pending Approvals Queue Card */}
      {isManager && totalPendingApprovalsCount > 0 && (
        <div className="bg-white border border-amber-200/90 rounded-3xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-stone-900">
                  Pending Approvals
                </h2>
                <p className="text-[11px] text-stone-500">
                  Tap to authorize with Daily PIN
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory("APPROVALS");
                setActiveMode("ROLE_HUB", "APPROVALS");
              }}
              className="text-xs font-bold text-stone-900 hover:text-stone-700 cursor-pointer"
            >
              View All ({totalPendingApprovalsCount})
            </button>
          </div>

          <div className="divide-y divide-stone-100">
            {pendingPRs.slice(0, 2).map((pr) => (
              <button
                key={`pr-${pr.id}`}
                type="button"
                onClick={() => openInspector("PR", pr)}
                className="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left group cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-mono font-bold text-[10px]">
                      PR
                    </span>
                    <span className="font-mono font-bold text-stone-800">
                      {pr.pr_number || `PR #${pr.id}`}
                    </span>
                    <span>·</span>
                    <span className="truncate">
                      {pr.project_name || pr.project_id || "General"}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-stone-900 truncate mt-0.5">
                    Requested by {pr.requested_by || "Engineering"}
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div className="text-xs font-mono font-bold tabular-nums text-stone-900">
                      {pr.item_count || 1} Items
                    </div>
                    <div className="text-[10px] text-amber-600 font-semibold">
                      Authorize PR
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300" />
                </div>
              </button>
            ))}

            {unapprovedPOs.slice(0, 2).map((po) => (
              <button
                key={`po-${po.id}`}
                type="button"
                onClick={() => openInspector("PO", po)}
                className="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left group cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono font-bold text-[10px]">
                      PO
                    </span>
                    <span className="font-mono font-bold text-stone-800">
                      {po.po_number || `PO #${po.id}`}
                    </span>
                    <span>·</span>
                    <span className="truncate">
                      {po.supplier_name || "Vendor"}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-stone-900 truncate mt-0.5">
                    Procurement Purchase Order
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div className="text-xs font-mono font-bold tabular-nums text-stone-900">
                      {formatIDR(Number(po.grand_total || po.dpp || 0))}
                    </div>
                    <div className="text-[10px] text-amber-600 font-semibold">
                      Authorize PO
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300" />
                </div>
              </button>
            ))}

            {pendingQuotations.slice(0, 2).map((quo) => (
              <button
                key={`q-${quo.id}`}
                type="button"
                onClick={() => openInspector("QUOTATION", quo)}
                className="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left group cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-mono font-bold text-[10px]">
                      QTN
                    </span>
                    <span className="font-mono font-bold text-stone-800">
                      {quo.quotation_number || `QTN #${quo.id}`}
                    </span>
                    <span>·</span>
                    <span className="truncate">
                      {quo.customer_name ||
                        quo.customer_name_manual ||
                        "Client"}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-stone-900 truncate mt-0.5">
                    {quo.title || "Commercial Quotation"}
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div className="text-xs font-mono font-bold tabular-nums text-stone-900">
                      {formatIDR(
                        Number(
                          quo.grand_total ||
                            quo.total_amount ||
                            quo.amount ||
                            0,
                        ),
                      )}
                    </div>
                    <div className="text-[10px] text-amber-600 font-semibold">
                      Authorize QTN
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300" />
                </div>
              </button>
            ))}

            {unapprovedDeliveries.slice(0, 2).map((dn) => (
              <button
                key={`dn-${dn.id}`}
                type="button"
                onClick={() => openInspector("DELIVERY", dn)}
                className="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left group cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-mono font-bold text-[10px]">
                      DN
                    </span>
                    <span className="font-mono font-bold text-stone-800">
                      {dn.dn_number || dn.delivery_number || `DN #${dn.id}`}
                    </span>
                    <span>·</span>
                    <span className="truncate">
                      {dn.customer_name || dn.project_name || "Customer"}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-stone-900 truncate mt-0.5">
                    Outbound Delivery Manifest
                  </div>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div className="text-xs font-mono font-bold tabular-nums text-stone-900">
                      {dn.status || "DRAFT"}
                    </div>
                    <div className="text-[10px] text-amber-600 font-semibold">
                      Authorize DN
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Core Mobile Native Features: Messages & HR Self-Service */}
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          to="/forum"
          className="bg-white border border-stone-200/90 rounded-2xl p-3.5 flex items-center gap-3 shadow-2xs active:scale-[0.98] transition-all"
        >
          <div className="w-10 h-10 rounded-2xl bg-stone-900 text-white flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-stone-900 truncate">
              Team Messages
            </div>
            <div className="text-[11px] text-stone-500 truncate">
              Channels & Direct Chat
            </div>
          </div>
        </Link>

        <Link
          to="/ess"
          className="bg-white border border-stone-200/90 rounded-2xl p-3.5 flex items-center gap-3 shadow-2xs active:scale-[0.98] transition-all"
        >
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-stone-900 truncate">
              HR Self-Service
            </div>
            <div className="text-[11px] text-stone-500 truncate">
              Attendance & Leave
            </div>
          </div>
        </Link>
      </div>

      {/* 5. Live Active Projects Tap List */}
      <div className="bg-white border border-stone-200/90 rounded-3xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-stone-700" />
            <h2 className="text-xs font-bold text-stone-900">
              Active Projects & NTP ({projects.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("PROJECTS");
              setActiveMode("ROLE_HUB");
            }}
            className="text-xs font-bold text-stone-900 hover:text-stone-700 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>View All</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="py-6 text-center text-xs text-stone-400">
            {isLoading
              ? "Loading active projects..."
              : "No active projects recorded."}
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {projects.slice(0, 5).map((proj: any) => (
              <button
                key={proj.id}
                type="button"
                onClick={() => openInspector("PROJECT", proj)}
                className="w-full py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 text-left group cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                    <span className="font-mono font-bold text-stone-700">
                      {proj.id}
                    </span>
                    <span>·</span>
                    <span className="truncate">
                      {proj.customer || "Internal"}
                    </span>
                    {(proj.urgency === "URGENT" ||
                      proj.urgency === "CRITICAL") && (
                      <>
                        <span>·</span>
                        <span className="text-rose-600 font-bold">
                          {proj.urgency}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-xs font-bold text-stone-900 truncate mt-0.5 group-hover:text-stone-700 transition-colors">
                    {proj.name}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-mono font-semibold text-stone-500">
                    {proj.status || "ACTIVE"}
                  </span>
                  <ChevronRight className="w-4 h-4 text-stone-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
