import React from "react";
import {
  Search,
  Users,
  X,
  Trash2,
  MoreVertical,
  Pin,
  ArrowLeft,
  ShieldCheck,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Thread,
  type Message,
  type UserDirectory,
  getColorHash,
  stripMarkdown,
} from "@/pages/erp/core/forumTypes";

interface ForumChatHeaderProps {
  selectedThread: Thread;
  setSelectedThread: React.Dispatch<React.SetStateAction<Thread | null>>;
  getThreadTitle: (thread: Thread) => string;
  getPeerUser: (thread: Thread) => UserDirectory | undefined;
  showInChatSearch: boolean;
  setShowInChatSearch: React.Dispatch<React.SetStateAction<boolean>>;
  inChatSearch: string;
  setInChatSearch: React.Dispatch<React.SetStateAction<string>>;
  displayedMessagesCount: number;
  showHeaderMenu: boolean;
  setShowHeaderMenu: React.Dispatch<React.SetStateAction<boolean>>;
  headerMenuRef: React.RefObject<HTMLDivElement | null>;
  setShowMembersList: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAddMember: React.Dispatch<React.SetStateAction<boolean>>;
  setShowErpPicker: React.Dispatch<React.SetStateAction<boolean>>;
  handleDeleteThread: () => void;
  pinnedMessages: Message[];
  scrollToMessage: (msgId: string) => void;
  handleTogglePin: (msg: Message) => void;
}

export const ForumChatHeader = React.memo(function ForumChatHeader({
  selectedThread,
  setSelectedThread,
  getThreadTitle,
  getPeerUser,
  showInChatSearch,
  setShowInChatSearch,
  inChatSearch,
  setInChatSearch,
  displayedMessagesCount,
  showHeaderMenu,
  setShowHeaderMenu,
  headerMenuRef,
  setShowMembersList,
  setShowAddMember,
  setShowErpPicker,
  handleDeleteThread,
  pinnedMessages,
  scrollToMessage,
  handleTogglePin,
}: ForumChatHeaderProps) {
  const peer = getPeerUser(selectedThread);
  const isPeerMgr =
    peer &&
    (String(peer.level || "").toUpperCase() === "MANAGER" ||
      ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"].includes(
        String(peer.role || "").toUpperCase(),
      ));

  return (
    <>
      {/* Chat Header */}
      <div className="px-3.5 py-3 sm:px-5 sm:py-3.5 border-b border-stone-200/70 items-center justify-between gap-2 flex shrink-0 bg-white z-20 min-w-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setSelectedThread(null)}
            className="lg:hidden p-2 -ml-1 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors shrink-0"
            title="Back to conversation list"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div
            className={cn(
              "w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs",
              getColorHash(getThreadTitle(selectedThread)),
            )}
          >
            {selectedThread.is_group ? (
              <Users className="w-4 h-4" />
            ) : (
              getThreadTitle(selectedThread).substring(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-stone-900 text-xs sm:text-sm tracking-tight leading-tight truncate">
                {getThreadTitle(selectedThread)}
              </h3>
              {peer && (
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[9px] font-bold uppercase tracking-wider">
                    {peer.role}
                  </span>
                  {isPeerMgr && (
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200/80 text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-0.5">
                      <ShieldCheck className="w-2.5 h-2.5 text-stone-500" /> Manager
                    </span>
                  )}
                </div>
              )}
            </div>
            <p
              onClick={() => setShowMembersList(true)}
              className="text-[10px] font-bold text-stone-400 hover:text-stone-900 cursor-pointer transition-colors tracking-wider mt-0.5 flex items-center gap-1.5 truncate"
            >
              {selectedThread.is_group ? (
                <>
                  <Users className="w-3 h-3 text-stone-400 shrink-0" />
                  <span className="truncate">
                    {selectedThread.participants?.length || 0} Members • Manage Group
                  </span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
                  <span className="truncate">Click for participant info</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowInChatSearch((prev) => !prev);
              setInChatSearch("");
            }}
            className={cn(
              "p-2 rounded-xl border transition-all cursor-pointer",
              showInChatSearch
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200/70",
            )}
            title="Search messages in this conversation"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {!!selectedThread.is_group && (
            <button
              type="button"
              onClick={() => setShowAddMember(true)}
              className="px-2.5 py-1.5 bg-stone-50 hover:bg-stone-100 text-stone-700 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all border border-stone-200/70 whitespace-nowrap cursor-pointer"
            >
              + Member
            </button>
          )}

          <div className="relative" ref={headerMenuRef}>
            <button
              type="button"
              onClick={() => setShowHeaderMenu((prev) => !prev)}
              className="p-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200/70 transition-colors cursor-pointer"
              title="Conversation Options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showHeaderMenu && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl border border-stone-200 shadow-lg py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setShowMembersList(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50 flex items-center gap-2 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-stone-400" />
                  <span>Participant List</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setShowErpPicker(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-50 flex items-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Attach ERP Document</span>
                </button>
                {selectedThread.id !== "THREAD-GENERAL" && (
                  <>
                    <div className="my-1 border-t border-stone-100" />
                    <button
                      type="button"
                      onClick={handleDeleteThread}
                      className="w-full px-3.5 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Conversation</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* In-Chat Search Bar */}
      {showInChatSearch && (
        <div className="px-4 py-2 bg-stone-50 border-b border-stone-200/70 flex items-center gap-2 shrink-0">
          <Search className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={inChatSearch}
            onChange={(e) => setInChatSearch(e.target.value)}
            placeholder="Type a keyword to filter messages in this conversation..."
            className="flex-1 bg-transparent text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none"
          />
          {inChatSearch && (
            <span className="text-[10px] font-bold text-stone-500">
              {displayedMessagesCount} results
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setShowInChatSearch(false);
              setInChatSearch("");
            }}
            className="text-stone-400 hover:text-stone-700 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMessages.length > 0 && (
        <div className="px-4 py-2 bg-amber-50/80 border-b border-amber-200/70 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() =>
              scrollToMessage(pinnedMessages[pinnedMessages.length - 1].id)
            }
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Pin className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                <span>Pinned Message ({pinnedMessages.length})</span>
                <span className="text-amber-600 font-normal">
                  • by @
                  {pinnedMessages[pinnedMessages.length - 1].pinned_by ||
                    pinnedMessages[pinnedMessages.length - 1].sender_username}
                </span>
              </div>
              <p className="text-xs font-semibold text-stone-800 truncate">
                {stripMarkdown(
                  pinnedMessages[pinnedMessages.length - 1].content,
                ) ||
                  pinnedMessages[pinnedMessages.length - 1].file_name ||
                  "Pinned attachment"}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() =>
              handleTogglePin(pinnedMessages[pinnedMessages.length - 1])
            }
            className="p-1 text-amber-700 hover:bg-amber-100 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer"
            title="Unpin message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
});
