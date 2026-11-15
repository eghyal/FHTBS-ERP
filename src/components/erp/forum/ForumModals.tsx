import React from "react";
import {
  Check,
  CornerUpRight,
  Download,
  Search,
  ShieldCheck,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn, formatIDR } from "@/lib/utils";
import { canViewDocFinancials, ConfidentialBadge } from "@/utils/rbacFinancials";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import {
  type Thread,
  type Message,
  type UserDirectory,
  type ErpRefItem,
  getColorHash,
} from "@/pages/erp/core/forumTypes";

export interface ForumModalsProps {
  user: any;
  threads: Thread[];
  selectedThread: Thread | null;
  directory: UserDirectory[];
  filteredDirectory: UserDirectory[];
  unreadBySender: Record<string, number>;
  availableDepts: string[];
  getThreadTitle: (thread: Thread) => string;
  stripMarkdown: (text: string | null) => string | null;

  // Lightbox
  lightboxData: {
    url: string;
    name: string;
    sender: string;
    time: string;
  } | null;
  setLightboxData: React.Dispatch<
    React.SetStateAction<{
      url: string;
      name: string;
      sender: string;
      time: string;
    } | null>
  >;
  lightboxZoom: number;
  setLightboxZoom: React.Dispatch<React.SetStateAction<number>>;

  // Forward Modal
  forwardingMsg: Message | null;
  setForwardingMsg: React.Dispatch<React.SetStateAction<Message | null>>;
  forwardTab: "USERS" | "MANAGERS" | "GROUPS";
  setForwardTab: React.Dispatch<
    React.SetStateAction<"USERS" | "MANAGERS" | "GROUPS">
  >;
  forwardSearch: string;
  setForwardSearch: React.Dispatch<React.SetStateAction<string>>;
  forwardSelectedUsers: string[];
  setForwardSelectedUsers: React.Dispatch<React.SetStateAction<string[]>>;
  forwardSelectedThreads: string[];
  setForwardSelectedThreads: React.Dispatch<React.SetStateAction<string[]>>;
  forwardNote: string;
  setForwardNote: React.Dispatch<React.SetStateAction<string>>;
  isForwarding: boolean;
  handleConfirmForward: (e: React.FormEvent) => void;

  // ERP Document Picker Modal
  showErpPicker: boolean;
  setShowErpPicker: React.Dispatch<React.SetStateAction<boolean>>;
  erpPickerTab: "ALL" | "NTP" | "QUOTATION" | "PR" | "PO" | "PROJECT" | "INVOICE";
  setErpPickerTab: React.Dispatch<
    React.SetStateAction<
      "ALL" | "NTP" | "QUOTATION" | "PR" | "PO" | "PROJECT" | "INVOICE"
    >
  >;
  erpPickerSearch: string;
  setErpPickerSearch: React.Dispatch<React.SetStateAction<string>>;
  erpRefs: ErpRefItem[];
  setAttachedErpDoc: React.Dispatch<React.SetStateAction<ErpRefItem | null>>;
  setAttachedErpNeedsAuth: React.Dispatch<React.SetStateAction<boolean>>;

  // Direct Manager Authorization Modal
  authModalDoc: {
    type: string;
    id: string;
    docNumber: string;
    title: string;
    status: string;
    amount?: number;
    partnerName?: string;
  } | null;
  setAuthModalDoc: React.Dispatch<
    React.SetStateAction<{
      type: string;
      id: string;
      docNumber: string;
      title: string;
      status: string;
      amount?: number;
      partnerName?: string;
    } | null>
  >;
  isAuthorizingDoc: boolean;
  handleAuthorizeFromChat: (pin: string) => void;

  // New Chat / User Directory Modal
  showNewChat: boolean;
  setShowNewChat: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  newChatDeptFilter: string;
  setNewChatDeptFilter: React.Dispatch<React.SetStateAction<string>>;
  selectedUsers: string[];
  setSelectedUsers: React.Dispatch<React.SetStateAction<string[]>>;
  groupName: string;
  setGroupName: React.Dispatch<React.SetStateAction<string>>;
  handleCreateChat: () => void;

  // Members List & Add Member Modals
  showMembersList: boolean;
  setShowMembersList: React.Dispatch<React.SetStateAction<boolean>>;
  handleRemoveMember: (usernameToRemove: string) => void;
  showAddMember: boolean;
  setShowAddMember: React.Dispatch<React.SetStateAction<boolean>>;
  handleAddMember: () => void;

  // Confirm Modal
  confirmModal: {
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  };
  setConfirmModal: React.Dispatch<
    React.SetStateAction<{
      isOpen: boolean;
      message: string;
      onConfirm: () => void;
    }>
  >;
}

export const ForumModals = React.memo(function ForumModals({
  user,
  threads,
  selectedThread,
  directory,
  filteredDirectory,
  unreadBySender,
  availableDepts,
  getThreadTitle,
  stripMarkdown,
  lightboxData,
  setLightboxData,
  lightboxZoom,
  setLightboxZoom,
  forwardingMsg,
  setForwardingMsg,
  forwardTab,
  setForwardTab,
  forwardSearch,
  setForwardSearch,
  forwardSelectedUsers,
  setForwardSelectedUsers,
  forwardSelectedThreads,
  setForwardSelectedThreads,
  forwardNote,
  setForwardNote,
  isForwarding,
  handleConfirmForward,
  showErpPicker,
  setShowErpPicker,
  erpPickerTab,
  setErpPickerTab,
  erpPickerSearch,
  setErpPickerSearch,
  erpRefs,
  setAttachedErpDoc,
  setAttachedErpNeedsAuth,
  authModalDoc,
  setAuthModalDoc,
  isAuthorizingDoc,
  handleAuthorizeFromChat,
  showNewChat,
  setShowNewChat,
  searchQuery,
  setSearchQuery,
  newChatDeptFilter,
  setNewChatDeptFilter,
  selectedUsers,
  setSelectedUsers,
  groupName,
  setGroupName,
  handleCreateChat,
  showMembersList,
  setShowMembersList,
  handleRemoveMember,
  showAddMember,
  setShowAddMember,
  handleAddMember,
  confirmModal,
  setConfirmModal,
}: ForumModalsProps) {
  return (
    <>
      {/* FULLSCREEN IMAGE LIGHTBOX MODAL (Preview without downloading first) */}
      {lightboxData && (
        <div
          onClick={() => setLightboxData(null)}
          className="fixed inset-0 z-[150] bg-stone-950/90 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-in fade-in duration-150"
        >
          {/* Top Lightbox Controls */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-between gap-4 bg-stone-900/80 border border-white/10 rounded-2xl px-4 py-3 text-white max-w-4xl w-full mx-auto"
          >
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold truncate">
                {lightboxData.name}
              </p>
              <p className="text-[10px] text-stone-400">
                Sent by @{lightboxData.sender} • {lightboxData.time}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setLightboxZoom((z) =>
                    Math.max(0.5, Number((z - 0.25).toFixed(2))),
                  )
                }
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setLightboxZoom(1)}
                className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-mono font-bold text-white transition-colors cursor-pointer"
                title="Reset Zoom"
              >
                {Math.round(lightboxZoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() =>
                  setLightboxZoom((z) =>
                    Math.min(3, Number((z + 0.25).toFixed(2))),
                  )
                }
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <a
                href={lightboxData.url}
                download={lightboxData.name}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-white/15 text-white transition-colors"
                title="Download Image"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setLightboxData(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-rose-600 text-white transition-colors cursor-pointer ml-1"
                title="Close Preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Center Zoomable Image */}
          <div className="flex-1 flex items-center justify-center overflow-auto my-4">
            <img
              src={lightboxData.url}
              alt={lightboxData.name}
              onClick={(e) => e.stopPropagation()}
              style={{ transform: `scale(${lightboxZoom})` }}
              className="max-h-[78vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-transform duration-150"
            />
          </div>

          <div className="text-center text-[11px] text-stone-400">
            Click outside the image to close preview
          </div>
        </div>
      )}

      {/* FORWARD MESSAGE MODAL ("Forward from XXX") */}
      <Modal
        isOpen={!!forwardingMsg}
        onClose={() => setForwardingMsg(null)}
        maxWidth="xl"
        title={
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center shrink-0">
              <CornerUpRight className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900">
                Forward Message
              </h3>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider truncate">
                Automatic header: &quot;Forward from{" "}
                {forwardingMsg?.forwarded_from ||
                  forwardingMsg?.sender_username}
                &quot;
              </p>
            </div>
          </div>
        }
        footer={
          forwardingMsg ? (
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <span className="text-[11px] text-stone-500 font-medium">
                {forwardSelectedUsers.length + forwardSelectedThreads.length}{" "}
                recipient(s) selected
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setForwardingMsg(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="forward-msg-form"
                  disabled={
                    isForwarding ||
                    forwardSelectedUsers.length +
                      forwardSelectedThreads.length ===
                      0
                  }
                >
                  {isForwarding ? "Forwarding..." : "Forward Now"}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {forwardingMsg && (
          <form id="forward-msg-form" onSubmit={handleConfirmForward} className="space-y-4">
            {/* Forwarded Message Preview */}
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 italic">
                <CornerUpRight className="w-3 h-3 text-amber-600" />
                <span>
                  Forward from{" "}
                  {forwardingMsg.forwarded_from || forwardingMsg.sender_username}
                </span>
              </div>
              <p className="text-stone-800 font-medium line-clamp-3">
                {stripMarkdown(forwardingMsg.content) ||
                  forwardingMsg.file_name ||
                  "Attachment"}
              </p>
            </div>

            {/* Recipient Filter Tabs */}
            <div className="flex gap-1.5 p-1 bg-stone-100 rounded-xl">
              {(
                [
                  { id: "USERS", label: "All Teammates" },
                  { id: "MANAGERS", label: "Managers & Approvers" },
                  { id: "GROUPS", label: "Discussion Groups" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setForwardTab(t.id)}
                  className={cn(
                    "flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                    forwardTab === t.id
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-500 hover:text-stone-800",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                placeholder="Search user name, department, or group..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400"
              />
            </div>

            {/* Multi-select List */}
            <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-xl divide-y divide-stone-100 custom-scrollbar">
              {forwardTab === "GROUPS"
                ? threads
                    .filter(
                      (t) =>
                        t.is_group &&
                        (!forwardSearch.trim() ||
                          getThreadTitle(t)
                            .toLowerCase()
                            .includes(forwardSearch.toLowerCase())),
                    )
                    .map((t) => {
                      const isSel = forwardSelectedThreads.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setForwardSelectedThreads((prev) =>
                              prev.includes(t.id)
                                ? prev.filter((id) => id !== t.id)
                                : [...prev, t.id],
                            )
                          }
                          className={cn(
                            "w-full px-3.5 py-2.5 flex items-center justify-between text-left transition-colors cursor-pointer",
                            isSel ? "bg-stone-100/80" : "hover:bg-stone-50",
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center">
                              <Users className="w-3.5 h-3.5 text-stone-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-stone-900 truncate">
                                {getThreadTitle(t)}
                              </p>
                              <p className="text-[10px] text-stone-400">
                                {t.participants?.length || 0} members
                              </p>
                            </div>
                          </div>
                          <div
                            className={cn(
                              "w-5 h-5 rounded-md border flex items-center justify-center",
                              isSel
                                ? "bg-stone-900 border-stone-900 text-white"
                                : "border-stone-300 bg-white",
                            )}
                          >
                            {isSel && <Check className="w-3.5 h-3.5" />}
                          </div>
                        </button>
                      );
                    })
                : directory
                    .filter((u) => {
                      if (u.username === user?.username) return false;
                      const isMgr =
                        String(u.level || "").toUpperCase() === "MANAGER" ||
                        ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"].includes(
                          String(u.role || "").toUpperCase(),
                        );
                      if (forwardTab === "MANAGERS" && !isMgr) return false;
                      if (forwardSearch.trim()) {
                        const q = forwardSearch.toLowerCase();
                        return (
                          u.name.toLowerCase().includes(q) ||
                          u.username.toLowerCase().includes(q) ||
                          (u.role || "").toLowerCase().includes(q)
                        );
                      }
                      return true;
                    })
                    .map((u) => {
                      const isSel = forwardSelectedUsers.includes(u.username);
                      return (
                        <button
                          key={u.username}
                          type="button"
                          onClick={() =>
                            setForwardSelectedUsers((prev) =>
                              prev.includes(u.username)
                                ? prev.filter((un) => un !== u.username)
                                : [...prev, u.username],
                            )
                          }
                          className={cn(
                            "w-full px-3.5 py-2.5 flex items-center justify-between text-left transition-colors cursor-pointer",
                            isSel ? "bg-stone-100/80" : "hover:bg-stone-50",
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-[10px] font-bold text-stone-800">
                              {u.username.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-stone-900 truncate">
                                {u.name}{" "}
                                <span className="text-[10px] font-mono text-stone-400">
                                  @{u.username}
                                </span>
                              </p>
                              <p className="text-[10px] text-stone-500 uppercase font-bold">
                                {u.role}
                              </p>
                            </div>
                          </div>
                          <div
                            className={cn(
                              "w-5 h-5 rounded-md border flex items-center justify-center",
                              isSel
                                ? "bg-stone-900 border-stone-900 text-white"
                                : "border-stone-300 bg-white",
                            )}
                          >
                            {isSel && <Check className="w-3.5 h-3.5" />}
                          </div>
                        </button>
                      );
                    })}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">
                Additional Note (Optional)
              </label>
              <input
                type="text"
                value={forwardNote}
                onChange={(e) => setForwardNote(e.target.value)}
                placeholder="Add an accompanying note when forwarding..."
                className="w-full px-3 py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400"
              />
            </div>

          </form>
        )}
      </Modal>

      {/* ERP DOCUMENT PICKER MODAL IN COMPOSER */}
      <Modal
        isOpen={showErpPicker}
        onClose={() => setShowErpPicker(false)}
        maxWidth="2xl"
        title="Attach ERP Document to Chat"
        description="Select a document to share or request direct Manager authorization"
      >
        <div className="space-y-3">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide bg-stone-100 p-1 rounded-xl">
          {(["ALL", "NTP", "QUOTATION", "PR", "PO", "INVOICE"] as const).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setErpPickerTab(tab)}
                className={cn(
                  "flex-1 py-1.5 px-2.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                  erpPickerTab === tab
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-500 hover:text-stone-800",
                )}
              >
                {tab === "ALL" ? "All" : tab}
              </button>
            ),
          )}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={erpPickerSearch}
            onChange={(e) => setErpPickerSearch(e.target.value)}
            placeholder="Search NTP / Project ID, quotation number, or partner..."
            className="w-full pl-8 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400"
          />
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-xl custom-scrollbar">
          {erpRefs
            .filter((item) => {
              if (erpPickerTab === "ALL" && item.type === "PROJECT") {
                return false;
              }
              if (erpPickerTab !== "ALL" && item.type !== erpPickerTab)
                return false;
              if (erpPickerSearch.trim()) {
                const q = erpPickerSearch.toLowerCase();
                return (
                  item.title.toLowerCase().includes(q) ||
                  item.doc_number.toLowerCase().includes(q) ||
                  (item.partner_name || "").toLowerCase().includes(q)
                );
              }
              return true;
            })
            .map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="p-3 hover:bg-stone-50 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black uppercase">
                      {item.type}
                    </span>
                    <span className="text-xs font-bold text-stone-900 truncate">
                      {item.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-stone-500">
                    <span className="font-semibold uppercase">
                      {item.status}
                    </span>
                    {canViewDocFinancials(user, item.type) ? (
                      item.amount > 0 && (
                        <span className="font-mono font-bold text-emerald-700">
                          • {formatIDR(item.amount)}
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-stone-400">•</span>
                        <ConfidentialBadge size="xs" />
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="xs"
                  onClick={() => {
                    setAttachedErpDoc(item);
                    setAttachedErpNeedsAuth(item.requires_auth);
                    setShowErpPicker(false);
                  }}
                >
                  Select
                </Button>
              </div>
            ))}
        </div>
        </div>
      </Modal>

      {/* DIRECT MANAGER AUTHORIZATION MODAL IN CHAT */}
      {authModalDoc && (
        <AuthorizeDocModal
          isOpen={!!authModalDoc}
          onClose={() => setAuthModalDoc(null)}
          docType={authModalDoc.type}
          docNumber={authModalDoc.docNumber}
          docId={authModalDoc.id}
          status={authModalDoc.status}
          partnerName={authModalDoc.partnerName}
          amount={authModalDoc.amount}
          isSubmitting={isAuthorizingDoc}
          onAuthorize={handleAuthorizeFromChat}
          approvalTitle="Direct Authorization from Messages"
          approvalDescription={`Enter your 6-digit Daily Auth Key to authorize ${authModalDoc.type} (${authModalDoc.docNumber}) and post an automatic confirmation to this conversation.`}
        />
      )}

      {/* NEW CHAT / USER DIRECTORY MODAL WITH UNREAD BADGES ON AVATARS */}
      <Modal
        isOpen={showNewChat}
        onClose={() => {
          setShowNewChat(false);
          setSelectedUsers([]);
          setGroupName("");
        }}
        title="Start New Conversation"
        description="Select one teammate for a direct chat or multiple teammates to create a department group"
        maxWidth="2xl"
        contentClassName="p-0 flex flex-col min-h-0"
        footer={
          selectedUsers.length > 0 ? (
            <div className="flex flex-col gap-3 w-full">
              {selectedUsers.length > 1 && (
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter discussion group name (required)"
                  className="w-full px-3.5 py-2 border border-stone-200 bg-white rounded-xl text-xs focus:outline-none focus:border-stone-400"
                />
              )}
              <Button
                onClick={handleCreateChat}
                disabled={selectedUsers.length > 1 && !groupName.trim()}
                className="w-full"
              >
                {selectedUsers.length > 1
                  ? `Create Group Chat (${selectedUsers.length} Members)`
                  : "Start Chat"}
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="p-4 border-b border-stone-100 space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user name, @username, or department..."
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:border-stone-400 transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {availableDepts.map((dept) => (
              <button
                key={dept}
                type="button"
                onClick={() => setNewChatDeptFilter(dept)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border transition-all cursor-pointer",
                  newChatDeptFilter === dept
                    ? "bg-stone-900 text-white border-stone-900 shadow-2xs"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50 hover:text-stone-900",
                )}
              >
                {dept === "ALL" ? "All Depts" : dept}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2 custom-scrollbar">
          {filteredDirectory.map((u) => {
            const isSelected = selectedUsers.includes(u.username);
            const senderUnread = unreadBySender[u.username] || 0;
            const isMgr =
              String(u.level || "").toUpperCase() === "MANAGER" ||
              ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"].includes(
                String(u.role || "").toUpperCase(),
              );

            return (
              <div
                key={u.username}
                onClick={() => {
                  if (isSelected) {
                    setSelectedUsers((prev) =>
                      prev.filter((p) => p !== u.username),
                    );
                  } else {
                    setSelectedUsers((prev) => [...prev, u.username]);
                  }
                }}
                className="flex items-center justify-between px-3.5 py-2.5 hover:bg-stone-50 cursor-pointer rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "w-5 h-5 rounded-md border flex items-center justify-center shrink-0",
                      isSelected
                        ? "bg-stone-900 border-stone-900 text-white"
                        : "border-stone-300 bg-white",
                    )}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </div>

                  {/* User Avatar with Unread Count Badge */}
                  <div className="relative shrink-0">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full border flex items-center justify-center font-bold text-xs",
                        getColorHash(u.username),
                      )}
                    >
                      {u.username.slice(0, 2).toUpperCase()}
                    </div>
                    {senderUnread > 0 && (
                      <span
                        title={`${senderUnread} unread message${senderUnread === 1 ? "" : "s"} from ${u.name}`}
                        className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white border-2 border-white rounded-full flex items-center justify-center text-[9px] font-black leading-none shadow-xs"
                      >
                        {senderUnread > 99 ? "99+" : senderUnread}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-stone-900 truncate">
                        {u.name}
                      </p>
                      {senderUnread > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[9px] font-extrabold">
                          {senderUnread} unread
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-stone-400 font-mono">
                        @{u.username}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 text-[9px] font-bold uppercase">
                        {u.role}
                      </span>
                      {isMgr && (
                        <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 border border-stone-200/80 text-[9px] font-extrabold uppercase flex items-center gap-0.5">
                          <ShieldCheck className="w-2.5 h-2.5 text-stone-500" /> Manager
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* MEMBER LIST MODAL */}
      <Modal
        isOpen={showMembersList && selectedThread !== null}
        onClose={() => setShowMembersList(false)}
        title="Conversation Participants"
        maxWidth="md"
        contentClassName="p-2 flex flex-col min-h-0"
      >
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {selectedThread?.participants.map((pUser) => {
            const dirUser = directory.find((d) => d.username === pUser);
            const unreadFromUser = unreadBySender[pUser] || 0;
            return (
              <div
                key={pUser}
                className="flex items-center justify-between px-3.5 py-2.5 hover:bg-stone-50 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-bold",
                        getColorHash(pUser),
                      )}
                    >
                      {pUser.slice(0, 2).toUpperCase()}
                    </div>
                    {unreadFromUser > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 bg-rose-600 text-white border border-white rounded-full flex items-center justify-center text-[8px] font-black">
                        {unreadFromUser}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-900">
                      {dirUser?.name || pUser}
                    </p>
                    <p className="text-[10px] text-stone-500">
                      @{pUser} {dirUser?.role ? `• ${dirUser.role}` : ""}
                    </p>
                  </div>
                </div>
                {!!selectedThread.is_group && (
                  <button
                    onClick={() => handleRemoveMember(pUser)}
                    className="text-xs text-rose-600 hover:bg-rose-50 px-2.5 py-1 rounded-lg font-bold cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* ADD MEMBER MODAL */}
      <Modal
        isOpen={showAddMember && selectedThread !== null}
        onClose={() => {
          setShowAddMember(false);
          setSelectedUsers([]);
        }}
        title="Add Group Members"
        description="Select teammates to add to this group discussion"
        maxWidth="2xl"
        contentClassName="p-0 flex flex-col min-h-0"
        footer={
          selectedUsers.length > 0 ? (
            <Button onClick={handleAddMember} className="w-full">
              Add {selectedUsers.length} Member
              {selectedUsers.length === 1 ? "" : "s"}
            </Button>
          ) : undefined
        }
      >
        <div className="p-4 border-b border-stone-100 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user name..."
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2 custom-scrollbar">
          {selectedThread &&
            filteredDirectory
              .filter((u) => !selectedThread.participants.includes(u.username))
              .map((u) => {
                const isSelected = selectedUsers.includes(u.username);
                return (
                  <div
                    key={u.username}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedUsers((prev) =>
                          prev.filter((p) => p !== u.username),
                        );
                      } else {
                        setSelectedUsers((prev) => [...prev, u.username]);
                      }
                    }}
                    className="flex items-center px-3.5 py-2.5 hover:bg-stone-50 cursor-pointer rounded-xl transition-colors"
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-md border mr-3 flex items-center justify-center",
                        isSelected
                          ? "bg-stone-900 border-stone-900 text-white"
                          : "border-stone-300 bg-white",
                      )}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div className="w-9 h-9 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center mr-3 shrink-0 text-xs font-bold">
                      {u.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-800">
                        {u.name}
                      </p>
                      <p className="text-[10px] text-stone-500">
                        @{u.username} • {u.role}
                      </p>
                    </div>
                  </div>
                );
              })}
        </div>
      </Modal>

      {/* CONFIRM MODAL */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title="Confirm Action"
        message={confirmModal.message}
        confirmText="Yes, Proceed"
        isDestructive={true}
      />
    </>
  );
});
