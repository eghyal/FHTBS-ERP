import React from "react";
import { MessageSquare, Plus, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  type Thread,
  type UserDirectory,
  getColorHash,
  isImageAttachment,
} from "@/pages/erp/core/forumTypes";

export interface ForumSidebarProps {
  selectedThread: Thread | null;
  setSelectedThread: (thread: Thread) => void;
  totalUnreadChats: number;
  setSearchQuery: (q: string) => void;
  setNewChatDeptFilter: (dept: string) => void;
  setShowNewChat: (show: boolean) => void;
  sidebarSearch: string;
  setSidebarSearch: (q: string) => void;
  sidebarFilter: "ALL" | "UNREAD" | "GROUPS" | "DEPT";
  setSidebarFilter: (filter: "ALL" | "UNREAD" | "GROUPS" | "DEPT") => void;
  availableDepts: string[];
  selectedDeptFilter: string;
  setSelectedDeptFilter: (dept: string) => void;
  filteredThreads: Thread[];
  getThreadTitle: (thread: Thread) => string;
  getPeerUser: (thread: Thread) => UserDirectory | undefined;
  stripMarkdown: (text: string | null) => string | null;
  formatMsgTime: (rawTime: string | null) => string;
}

export const ForumSidebar = React.memo(function ForumSidebar({
  selectedThread,
  setSelectedThread,
  totalUnreadChats,
  setSearchQuery,
  setNewChatDeptFilter,
  setShowNewChat,
  sidebarSearch,
  setSidebarSearch,
  sidebarFilter,
  setSidebarFilter,
  availableDepts,
  selectedDeptFilter,
  setSelectedDeptFilter,
  filteredThreads,
  getThreadTitle,
  getPeerUser,
  stripMarkdown,
  formatMsgTime,
}: ForumSidebarProps) {
  return (
    <div
      className={cn(
        "w-full lg:w-84 xl:w-92 lg:border-r border-stone-200/70 flex-col bg-stone-50/30 flex-shrink-0 min-w-0 min-h-0 flex-1 lg:flex-initial lg:min-h-full",
        selectedThread ? "hidden lg:flex" : "flex",
      )}
    >
      {/* Sidebar Header */}
      <div className="p-3.5 sm:p-4 border-b border-stone-200/60 bg-white space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold text-stone-900 text-xs uppercase tracking-[0.15em]">
              Conversations
            </h2>
            {totalUnreadChats > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black leading-none shadow-2xs">
                {totalUnreadChats} Unread
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="primary"
            size="xs"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              setSearchQuery("");
              setNewChatDeptFilter("ALL");
              setShowNewChat(true);
            }}
            title="Start a new conversation"
          >
            New Chat
          </Button>
        </div>

        {/* Sidebar Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            placeholder="Search teammates, groups, or messages..."
            className="w-full pl-8 pr-7 py-1.5 bg-stone-50 border border-stone-200/80 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:bg-white focus:border-stone-400 outline-none transition-all"
          />
          {sidebarSearch && (
            <button
              type="button"
              onClick={() => setSidebarSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
          {(
            [
              { id: "ALL", label: "All" },
              {
                id: "UNREAD",
                label: `Unread${totalUnreadChats > 0 ? ` (${totalUnreadChats})` : ""}`,
              },
              { id: "GROUPS", label: "Groups" },
              { id: "DEPT", label: "Depts" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSidebarFilter(tab.id)}
              className={cn(
                "flex-1 py-1 px-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap cursor-pointer",
                sidebarFilter === tab.id
                  ? "bg-white text-stone-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-800",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {sidebarFilter === "DEPT" && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {availableDepts.map((dept) => (
              <button
                key={dept}
                type="button"
                onClick={() => setSelectedDeptFilter(dept)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border transition-all cursor-pointer",
                  selectedDeptFilter === dept
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                    : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900",
                )}
              >
                {dept === "ALL" ? "All Depts" : dept}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto divide-y divide-stone-100/80 custom-scrollbar">
        {filteredThreads.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="w-12 h-12 bg-stone-100/70 border border-stone-200/60 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="w-5 h-5 text-stone-400" />
            </div>
            <p className="text-xs font-bold text-stone-800 uppercase tracking-widest">
              No Conversations Found
            </p>
            <p className="text-[11px] text-stone-400 font-medium mt-1 leading-relaxed">
              {sidebarFilter === "UNREAD"
                ? "All messages have been read."
                : "Start a new conversation with your team or another department."}
            </p>
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const isSelected = selectedThread?.id === thread.id;
            const titleStr = getThreadTitle(thread);
            const unreadCount = Number(thread.unread_count || 0);
            const isUnread = unreadCount > 0;
            const initials = titleStr.substring(0, 2).toUpperCase();
            const colorClass = getColorHash(titleStr);
            const peerUser = getPeerUser(thread);

            const lastPreview = (() => {
              if (thread.last_message) {
                const cleaned = stripMarkdown(thread.last_message) || "";
                if (cleaned.includes("🔗 Shared Resource:")) {
                  return cleaned.replace("🔗 Shared Resource:", "📄 ERP Document:");
                }
                return cleaned;
              }
              if (thread.last_message_file_name) {
                return isImageAttachment(
                  thread.last_message_file_type,
                  thread.last_message_file_name,
                )
                  ? `📷 Photo: ${thread.last_message_file_name}`
                  : `📎 Attachment: ${thread.last_message_file_name}`;
              }
              return null;
            })();

            return (
              <div
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={cn(
                  "px-4 py-3.5 flex items-center gap-3.5 cursor-pointer relative transition-all group/item",
                  isSelected
                    ? "bg-stone-100/90"
                    : isUnread
                      ? "bg-rose-50/25 hover:bg-white"
                      : "hover:bg-white bg-transparent",
                )}
              >
                {isSelected && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-600" />
                )}

                {/* Avatar with Numeric Unread Badge */}
                <div className="relative shrink-0">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-xs tracking-tight shadow-2xs transition-all",
                      isSelected ? "scale-[1.02]" : "",
                      colorClass,
                    )}
                  >
                    {thread.is_group ? <Users className="w-4 h-4" /> : initials}
                  </div>
                  {isUnread && (
                    <span
                      title={`${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}
                      className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white border-2 border-white rounded-full flex items-center justify-center text-[9px] font-black leading-none shadow-xs z-10"
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p
                        className={cn(
                          "truncate text-[13px] tracking-tight transition-colors",
                          isUnread
                            ? "font-extrabold text-stone-950"
                            : "font-bold text-stone-800",
                        )}
                      >
                        {titleStr}
                      </p>
                      {peerUser?.role && (
                        <span className="px-1.5 py-0.2 rounded bg-stone-100 border border-stone-200/70 text-stone-600 text-[8.5px] font-bold uppercase tracking-wider shrink-0">
                          {peerUser.role}
                        </span>
                      )}
                    </div>
                    {thread.last_message_time && (
                      <span
                        className={cn(
                          "text-[9px] uppercase font-bold tracking-tighter shrink-0",
                          isUnread ? "text-rose-600" : "text-stone-400",
                        )}
                      >
                        {formatMsgTime(thread.last_message_time)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "text-xs truncate h-4 flex-1 tracking-tight",
                        isUnread
                          ? "text-stone-900 font-bold"
                          : "text-stone-500 font-medium",
                      )}
                    >
                      {lastPreview || (
                        <span className="italic text-stone-400 font-normal">
                          No messages yet
                        </span>
                      )}
                    </p>
                    {isUnread && (
                      <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[9px] font-extrabold shrink-0">
                        New
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
