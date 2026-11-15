import { apiFetch } from "@/utils/api";
import React, { createContext, useContext, useState, ReactNode, useMemo } from "react";
import {
  MessageSquare,
  Users,
  Globe,
  CheckCircle2,
  User,
  Share2,
  Send,
  Briefcase,
  ClipboardList,
  ShoppingCart,
  FileText,
  Receipt,
  ShieldCheck,
  Building2,
  Search,
  Check,
  FileCheck,
} from "lucide-react";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { Modal } from "@/components/ui/Modal";
import { formatIDR, cn } from "@/lib/utils";
import { canViewDocFinancials, ConfidentialBadge } from "@/utils/rbacFinancials";
import {
  ERP_DEPARTMENT_OPTIONS,
  normalizeDepartmentToRole,
} from "@/constants/rbac";

export type ShareDocType =
  | "PROJECT"
  | "NTP"
  | "PR"
  | "PO"
  | "QUOTATION"
  | "INVOICE"
  | "GRN"
  | "WO"
  | "REQ";

export interface ShareMeta {
  status?: string;
  amount?: number;
  partnerName?: string;
  urgency?: "NORMAL" | "URGENT" | "CRITICAL" | string;
  requiresAuth?: boolean;
  url?: string;
}

export interface ShareData extends ShareMeta {
  type: ShareDocType | string;
  id: string;
  title: string;
  content: string;
}

interface ShareContextType {
  shareToForum: (
    type: ShareDocType | string,
    id: string,
    title: string,
    content: string,
    meta?: ShareMeta,
  ) => void;
  openShareModal: (data: {
    type: ShareDocType | string;
    id: string;
    title: string;
    content?: string;
    status?: string;
    amount?: number;
    partnerName?: string;
    urgency?: string;
    requiresAuth?: boolean;
    url?: string;
  }) => void;
  closeShareModal: () => void;
}

const ShareContext = createContext<ShareContextType | undefined>(undefined);

export function ShareProvider({ children }: { children: ReactNode }) {
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [message, setMessage] = useState("");
  const [urgency, setUrgency] = useState<"NORMAL" | "URGENT" | "CRITICAL">("NORMAL");
  const [requestManagerAuth, setRequestManagerAuth] = useState(false);

  const [recipientTab, setRecipientTab] = useState<"MANAGERS" | "DEPARTMENTS" | "THREADS">("MANAGERS");
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);

  const [threads, setThreads] = React.useState<any[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user } = useAuth();
  const { showToast } = useToast();

  const normalizeDocType = (rawType: string): ShareDocType => {
    const upper = String(rawType || "").toUpperCase();
    if (upper.includes("PURCHASE REQUEST") || upper.includes("REQUISITION") || upper === "PR") return "PR";
    if (upper.includes("PURCHASE ORDER") || upper === "PO") return "PO";
    if (upper.includes("QUOTATION") || upper === "QT") return "QUOTATION";
    if (upper.includes("INVOICE") || upper === "CI") return "INVOICE";
    if (upper.includes("PROJECT") || upper === "PRJ") return "PROJECT";
    if (upper.includes("GRN") || upper.includes("RECEIPT")) return "GRN";
    if (upper.includes("WORK ORDER") || upper === "WO") return "WO";
    return "REQ";
  };

  const shareToForum = (
    type: ShareDocType | string,
    id: string,
    title: string,
    content: string,
    meta?: ShareMeta,
  ) => {
    const normalizedType = normalizeDocType(type);
    const statusUpper = String(meta?.status || "").toUpperCase();
    const inferredNeedsAuth =
      meta?.requiresAuth !== undefined
        ? meta.requiresAuth
        : ["DRAFT", "DRAFTED", "PENDING", "REVISION", "WAITING_APPROVAL"].includes(statusUpper) ||
          /draft|pending|authorize|approval|otorisasi/i.test(content);

    setShareData({
      type: normalizedType,
      id,
      title,
      content,
      ...meta,
      requiresAuth: inferredNeedsAuth,
    });
    setMessage(
      content ||
        (inferredNeedsAuth
          ? `Please review and provide Manager authorization for ${normalizedType} (${title}).`
          : `Sharing ${normalizedType} document (${title}) for team coordination.`),
    );
    setRequestManagerAuth(inferredNeedsAuth);
    setUrgency(
      (String(meta?.urgency || "NORMAL").toUpperCase() as "NORMAL" | "URGENT" | "CRITICAL") ||
        "NORMAL",
    );
    setRecipientTab(inferredNeedsAuth ? "MANAGERS" : "DEPARTMENTS");
    setSelectedDept("ALL");
    setSearchQuery("");
    setSelectedUsernames([]);
    setSelectedThreadIds([]);
  };

  const openShareModal = (data: {
    type: ShareDocType | string;
    id: string;
    title: string;
    content?: string;
    status?: string;
    amount?: number;
    partnerName?: string;
    urgency?: string;
    requiresAuth?: boolean;
    url?: string;
  }) => {
    shareToForum(data.type, data.id, data.title, data.content || "", {
      status: data.status,
      amount: data.amount,
      partnerName: data.partnerName,
      urgency: data.urgency,
      requiresAuth: data.requiresAuth,
      url: data.url,
    });
  };

  const closeShareModal = () => {
    setShareData(null);
    setMessage("");
    setSelectedUsernames([]);
    setSelectedThreadIds([]);
  };

  const getThreadTitle = (t: any) => {
    if (t.id === "THREAD-GENERAL") return "General Discussion (Forum)";
    if (t.is_group) return t.name || "Group Chat";
    return (
      t.participants?.filter((p: string) => p !== user?.username).join(", ") ||
      "Direct Message"
    );
  };

  React.useEffect(() => {
    if (shareData && user?.username) {
      apiFetch("/api/users/directory")
        .then((response) => {
          if (response.ok && Array.isArray(response.data)) {
            setUsers(
              response.data.filter(
                (u: any) =>
                  u.username &&
                  u.username.toLowerCase() !== user.username.toLowerCase(),
              ),
            );
          }
        })
        .catch(console.error);

      apiFetch("/api/chat/threads", {}, user.username)
        .then((response) => {
          if (response.ok && Array.isArray(response.data)) {
            setThreads(response.data);
          }
        })
        .catch(console.error);
    }
  }, [shareData, user?.username]);

  const departments = useMemo(() => {
    return ["ALL", ...ERP_DEPARTMENT_OPTIONS.map((d) => d.value)];
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const roleUpper = normalizeDepartmentToRole(u.role);
      const levelUpper = String(u.level || "").toUpperCase();
      const isManagerOrExec =
        levelUpper === "MANAGER" || roleUpper === "FC";

      if (recipientTab === "MANAGERS" && !isManagerOrExec) {
        return false;
      }
      if (selectedDept !== "ALL" && roleUpper !== selectedDept) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = String(u.name || "").toLowerCase().includes(q);
        const matchUser = String(u.username || "").toLowerCase().includes(q);
        const matchRole = roleUpper.toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchRole) return false;
      }
      return true;
    });
  }, [users, recipientTab, selectedDept, searchQuery]);

  const filteredThreads = useMemo(() => {
    const baseThreads = [
      { id: "THREAD-GENERAL", name: "General Discussion (All Staff)", is_group: true, participants: [] },
      ...threads.filter((t) => t.id !== "THREAD-GENERAL"),
    ];
    return baseThreads.filter((t) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return getThreadTitle(t).toLowerCase().includes(q);
    });
  }, [threads, searchQuery, user?.username]);

  const toggleUser = (username: string) => {
    setSelectedUsernames((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username],
    );
  };

  const toggleThread = (threadId: string) => {
    setSelectedThreadIds((prev) =>
      prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId],
    );
  };

  const handleShare = async () => {
    if (!shareData || !user) return;
    const totalSelected = selectedUsernames.length + selectedThreadIds.length;
    if (totalSelected === 0) {
      showToast("Please select at least 1 recipient (Manager, Department, or Discussion Group).", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const metaPayload = {
        status: shareData.status || (requestManagerAuth ? "DRAFTED" : "ACTIVE"),
        amount: shareData.amount,
        partnerName: shareData.partnerName,
        urgency,
        requiresAuth: requestManagerAuth,
        url: shareData.url,
        sharedByRole: user.role,
      };

      const resourceMarker = `🔗 *Shared Resource: ${shareData.title}* (${shareData.type}) #${shareData.id} |META:${JSON.stringify(metaPayload)}`;
      const finalMsg = message.trim()
        ? `${message.trim()}\n\n${resourceMarker}`
        : `Sharing ${shareData.type} document (${shareData.title}):\n\n${resourceMarker}`;

      const res = await apiFetch(
        "/api/chat/forward",
        {
          method: "POST",
          body: JSON.stringify({
            target_usernames: selectedUsernames,
            target_thread_ids: selectedThreadIds,
            content: finalMsg,
            forwarded_from: null,
          }),
        },
        user.username,
      );

      if (res.ok) {
        showToast(
          `${shareData.type} document shared to ${totalSelected} conversation${totalSelected === 1 ? "" : "s"}!`,
          "success",
        );
        window.dispatchEvent(new CustomEvent("chat:unread_update"));
        closeShareModal();
      } else {
        showToast(res.error || "Failed to share document", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("An error occurred while sharing the document", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "PROJECT":
        return <Briefcase className="w-5 h-5 text-blue-600" />;
      case "NTP":
        return <FileCheck className="w-5 h-5 text-teal-600" />;
      case "PR":
        return <ClipboardList className="w-5 h-5 text-amber-600" />;
      case "PO":
        return <ShoppingCart className="w-5 h-5 text-emerald-600" />;
      case "QUOTATION":
        return <FileText className="w-5 h-5 text-indigo-600" />;
      case "INVOICE":
        return <Receipt className="w-5 h-5 text-purple-600" />;
      default:
        return <Share2 className="w-5 h-5 text-stone-600" />;
    }
  };

  const totalSelected = selectedUsernames.length + selectedThreadIds.length;

  return (
    <ShareContext.Provider value={{ shareToForum, openShareModal, closeShareModal }}>
      {children}
      {shareData && (
        <Modal
          isOpen={!!shareData}
          onClose={closeShareModal}
          maxWidth="2xl"
          title={
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-2xs shrink-0">
                <Share2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-stone-900 leading-tight">
                  Share ERP Document &amp; Manager Authorization
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mt-0.5 truncate">
                  Cross-Department Collaboration &amp; Direct Approval in Messages
                </p>
              </div>
            </div>
          }
          contentClassName="p-0 flex flex-col min-h-0"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <span className="text-[11px] text-stone-500 font-medium">
                {totalSelected > 0
                  ? `Ready to send to ${totalSelected} recipient${totalSelected === 1 ? "" : "s"}`
                  : "Select at least 1 recipient above"}
              </span>
              <div className="flex flex-wrap items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={closeShareModal}
                  className="px-4 py-2 bg-white border border-stone-200 text-stone-600 rounded-xl font-bold text-xs hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={isSubmitting || totalSelected === 0}
                  className="px-5 py-2 bg-stone-900 text-white rounded-xl font-bold text-xs hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSubmitting
                    ? "Sending..."
                    : `Share to ${totalSelected > 0 ? `${totalSelected} Chat${totalSelected === 1 ? "" : "s"}` : "Messages"}`}
                </button>
              </div>
            </div>
          }
        >
          <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {/* Shared Resource Preview Card */}
            <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 flex items-start gap-3.5">
              <div className="p-2.5 bg-white rounded-xl border border-stone-200/80 shadow-2xs shrink-0">
                {getIcon(shareData.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500">
                    {shareData.type} REFERENCE
                  </span>
                  {shareData.status && (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/80">
                      {shareData.status}
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-stone-900 truncate mt-0.5">
                  {shareData.title}
                </div>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] text-stone-500">
                  <span className="font-mono text-[10px]">#{shareData.id}</span>
                  {shareData.partnerName && (
                    <span className="font-semibold text-stone-700">· {shareData.partnerName}</span>
                  )}
                  {shareData.amount !== undefined && shareData.amount !== null && (
                    canViewDocFinancials(user, shareData.type) ? (
                      <span className="font-mono font-bold text-emerald-700">
                        · {formatIDR(shareData.amount)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-stone-400">·</span>
                        <ConfidentialBadge size="xs" />
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Request Manager Authorization & Urgency Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRequestManagerAuth(!requestManagerAuth)}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all flex items-center gap-3 cursor-pointer",
                  requestManagerAuth
                    ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/10"
                    : "bg-white border-stone-200 hover:bg-stone-50",
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                    requestManagerAuth
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-stone-100 text-stone-400 border-stone-200",
                  )}
                >
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-stone-900">
                    Requires Manager Authorization
                  </div>
                  <p className="text-[10px] text-stone-500 truncate">
                    {requestManagerAuth
                      ? "Enable Direct Authorization card in chat"
                      : "Share as a discussion reference"}
                  </p>
                </div>
              </button>

              <div className="p-2.5 rounded-xl border border-stone-200 bg-white flex flex-col justify-center">
                <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 mb-1.5 px-1">
                  Urgency Level
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {(["NORMAL", "URGENT", "CRITICAL"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setUrgency(lvl)}
                      className={cn(
                        "py-1 px-2 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer",
                        urgency === lvl
                          ? lvl === "CRITICAL"
                            ? "bg-rose-600 text-white shadow-2xs"
                            : lvl === "URGENT"
                              ? "bg-amber-500 text-white shadow-2xs"
                              : "bg-stone-900 text-white shadow-2xs"
                          : "bg-stone-100 text-stone-500 hover:bg-stone-200/70",
                      )}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Recipient Selection with Manager & Department Filters */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                  Target Recipients / Channels ({totalSelected} selected)
                </label>
                {totalSelected > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUsernames([]);
                      setSelectedThreadIds([]);
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 p-1 bg-stone-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRecipientTab("MANAGERS")}
                  className={cn(
                    "flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                    recipientTab === "MANAGERS"
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-500 hover:text-stone-800",
                  )}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Managers ({users.filter((u) => String(u.level || "").toUpperCase() === "MANAGER" || ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"].includes(String(u.role || "").toUpperCase())).length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientTab("DEPARTMENTS")}
                  className={cn(
                    "flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                    recipientTab === "DEPARTMENTS"
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-500 hover:text-stone-800",
                  )}
                >
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Departments</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientTab("THREADS")}
                  className={cn(
                    "flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                    recipientTab === "THREADS"
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-500 hover:text-stone-800",
                  )}
                >
                  <Users className="w-3.5 h-3.5 text-amber-600" />
                  <span>Groups & Chats</span>
                </button>
              </div>

              {recipientTab !== "THREADS" && (
                <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
                  {departments.map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setSelectedDept(dept)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer border",
                        selectedDept === dept
                          ? "bg-stone-900 text-white border-stone-900 shadow-2xs"
                          : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50 hover:text-stone-900",
                      )}
                    >
                      {dept === "ALL" ? "All Depts" : dept}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    recipientTab === "THREADS"
                      ? "Search groups or conversations..."
                      : "Search user name, @username, or department..."
                  }
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-400"
                />
              </div>

              <div className="w-full border border-stone-200 rounded-xl overflow-hidden bg-white max-h-44 overflow-y-auto divide-y divide-stone-100 custom-scrollbar">
                {recipientTab === "THREADS" ? (
                  filteredThreads.map((t) => {
                    const isSelected = selectedThreadIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleThread(t.id)}
                        className={cn(
                          "w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer",
                          isSelected ? "bg-stone-100/80 text-stone-900" : "hover:bg-stone-50",
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {t.id === "THREAD-GENERAL" ? (
                            <Globe className="w-4 h-4 text-stone-700 shrink-0" />
                          ) : t.is_group ? (
                            <Users className="w-4 h-4 text-stone-700 shrink-0" />
                          ) : (
                            <MessageSquare className="w-4 h-4 text-stone-700 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-stone-900 truncate">
                              {getThreadTitle(t)}
                            </div>
                            <div className="text-[10px] text-stone-400">
                              {t.id === "THREAD-GENERAL"
                                ? "Public All-Staff Forum"
                                : t.is_group
                                  ? "Group Discussion"
                                  : "Direct Message"}
                            </div>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                            isSelected
                              ? "bg-stone-900 border-stone-900 text-white"
                              : "border-stone-300 bg-white",
                          )}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    );
                  })
                ) : filteredUsers.length === 0 ? (
                  <div className="p-6 text-center text-xs text-stone-400">
                    No users found for this filter.
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelected = selectedUsernames.includes(u.username);
                    const isMgr =
                      String(u.level || "").toUpperCase() === "MANAGER" ||
                      ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"].includes(
                        String(u.role || "").toUpperCase(),
                      );
                    return (
                      <button
                        key={u.username}
                        type="button"
                        onClick={() => toggleUser(u.username)}
                        className={cn(
                          "w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer",
                          isSelected ? "bg-emerald-50/50 text-stone-900" : "hover:bg-stone-50",
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-[10px] font-bold text-stone-800 shrink-0">
                            {String(u.username || "US").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-stone-900 truncate">
                                {u.name || u.username}
                              </span>
                              <span className="text-[10px] text-stone-400 font-mono">
                                @{u.username}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 text-[9px] font-bold uppercase tracking-wider">
                                {u.role}
                              </span>
                              {isMgr && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/70 text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-0.5">
                                  <ShieldCheck className="w-2.5 h-2.5" /> Manager / Approver
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                            isSelected
                              ? "bg-stone-900 border-stone-900 text-white"
                              : "border-stone-300 bg-white",
                          )}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5">
                Accompanying Message / Instructions
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-stone-400 h-20 resize-none"
                placeholder="Add collaboration notes or authorization instructions for the target department..."
              />
            </div>
          </div>
        </Modal>
      )}
    </ShareContext.Provider>
  );
}

export function useShare() {
  const context = useContext(ShareContext);
  if (context === undefined) {
    throw new Error("useShare must be used within a ShareProvider");
  }
  return context;
}

