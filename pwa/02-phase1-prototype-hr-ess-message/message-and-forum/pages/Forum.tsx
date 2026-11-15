/**
 * Forum/Chat System - Upgraded with Unread Profile Badges, Inline Image Preview & Lightbox,
 * Multi-Recipient Forwarding ("Forward from XXX"), Interactive ERP Share & Direct Manager Authorization,
 * Quoted Replies, Pinned Messages, ERP Doc Picker, and Department/Unread Filters.
 */
import { apiFetch } from "@/utils/api";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useShare } from "@/contexts/ShareContext";
import { useInterval } from "@/hooks/useInterval";
import {
  MessageSquare,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/Button";
import {
  ERP_DEPARTMENT_OPTIONS,
  normalizeDepartmentToRole,
} from "@/constants/rbac";
import {
  type Thread,
  type Message,
  type UserDirectory,
  type ErpRefItem,
  isImageAttachment,
  stripMarkdown,
  formatMsgTime,
} from "./forumTypes";

import { ForumSidebar } from "@/components/erp/forum/ForumSidebar";
import { ForumModals } from "@/components/erp/forum/ForumModals";
import { ForumComposer } from "@/components/erp/forum/ForumComposer";
import { ForumChatHeader } from "@/components/erp/forum/ForumChatHeader";
import { ForumMessageStream } from "@/components/erp/forum/ForumMessageStream";
import { NtpPreviewModal } from "@/components/erp/NtpPreviewModal";
import { QuotationPreviewModal } from "@/components/erp/QuotationPreviewModal";
import { PoDocumentModal } from "@/components/erp/procurement/PoDocumentModal";
import { PrDetailsModal } from "@/components/erp/procurement/PrDetailsModal";
import { InvoicePreviewModal } from "@/components/erp/InvoicePreviewModal";
import { generatePDF } from "@/lib/pdfGenerator";


export default function Forum() {
  const { user } = useAuth();
  const { openShareModal } = useShare();
  const { showToast } = useToast();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadBySender, setUnreadBySender] = useState<Record<string, number>>({});

  const [directory, setDirectory] = useState<UserDirectory[]>([]);
  const [erpRefs, setErpRefs] = useState<ErpRefItem[]>([]);

  // Sidebar Search & Filters
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarFilter, setSidebarFilter] = useState<"ALL" | "UNREAD" | "GROUPS" | "DEPT">("ALL");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");

  // In-chat message search & header menu
  const [inChatSearch, setInChatSearch] = useState("");
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // Modals: New Chat, Add Member, Members List
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newChatDeptFilter, setNewChatDeptFilter] = useState<string>("ALL");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [showMembersList, setShowMembersList] = useState(false);

  // Composer State: Text, File, Image Preview, Quoted Reply, ERP Doc Picker
  const [newMessage, setNewMessage] = useState("");
  const [attachingFile, setAttachingFile] = useState<File | null>(null);
  const [attachingPreviewUrl, setAttachingPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // ERP Document Picker Modal in Composer
  const [showErpPicker, setShowErpPicker] = useState(false);
  const [erpPickerTab, setErpPickerTab] = useState<"ALL" | "NTP" | "QUOTATION" | "PR" | "PO" | "PROJECT" | "INVOICE">("ALL");
  const [erpPickerSearch, setErpPickerSearch] = useState("");
  const [attachedErpDoc, setAttachedErpDoc] = useState<ErpRefItem | null>(null);
  const [attachedErpNeedsAuth, setAttachedErpNeedsAuth] = useState<boolean>(false);

  // In-Place ERP Document Preview Modal States (Stay on Message page)
  const [chatNtpPreview, setChatNtpPreview] = useState<{
    ntp: any;
    project: any;
  } | null>(null);
  const [chatQuotationPreview, setChatQuotationPreview] = useState<any | null>(null);
  const [chatPoPreview, setChatPoPreview] = useState<any | null>(null);
  const [chatPrPreview, setChatPrPreview] = useState<any | null>(null);
  const [chatInvoicePreview, setChatInvoicePreview] = useState<{
    invoice: any;
    bankAccounts: any[];
  } | null>(null);
  const [isLoadingNtpPreview, setIsLoadingNtpPreview] = useState(false);
  const [loadingDocPreviewId, setLoadingDocPreviewId] = useState<string | null>(null);
  const [isExportingPoPdf, setIsExportingPoPdf] = useState(false);
  const poDocRef = useRef<HTMLDivElement | null>(null);

  // Forward Message Modal State
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null);
  const [forwardTab, setForwardTab] = useState<"USERS" | "MANAGERS" | "GROUPS">("USERS");
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardSelectedUsers, setForwardSelectedUsers] = useState<string[]>([]);
  const [forwardSelectedThreads, setForwardSelectedThreads] = useState<string[]>([]);
  const [forwardNote, setForwardNote] = useState("");
  const [isForwarding, setIsForwarding] = useState(false);

  // Fullscreen Image Lightbox State
  const [lightboxData, setLightboxData] = useState<{
    url: string;
    name: string;
    sender: string;
    time: string;
  } | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  // Direct Manager ERP Authorization Modal State
  const [authModalDoc, setAuthModalDoc] = useState<{
    type: string;
    id: string;
    docNumber: string;
    title: string;
    status: string;
    amount?: number;
    partnerName?: string;
  } | null>(null);
  const [isAuthorizingDoc, setIsAuthorizingDoc] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, message: "", onConfirm: () => {} });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isCurrentUserManager = useMemo(() => {
    const roleUpper = String(user?.role || "").toUpperCase();
    const levelUpper = String(user?.level || "").toUpperCase();
    return (
      levelUpper === "MANAGER" ||
      ["FC", "BOD", "DIRECTOR", "ADMIN", "SUPERADMIN"].includes(roleUpper)
    );
  }, [user?.role, user?.level]);

  // Generate local object URL when attaching an image in the composer
  useEffect(() => {
    if (attachingFile && isImageAttachment(attachingFile.type, attachingFile.name)) {
      const url = URL.createObjectURL(attachingFile);
      setAttachingPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAttachingPreviewUrl(null);
    }
  }, [attachingFile]);

  // Close header dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchDirectory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/users/directory", {}, user?.username);
      if (res.ok) {
        setDirectory(Array.isArray(res.data) ? res.data : []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [user?.username]);

  const fetchUnreadStats = useCallback(async () => {
    if (!user?.username) return;
    try {
      const res = await apiFetch("/api/chat/unread", {}, user.username);
      if (res.ok && res.data) {
        setUnreadBySender(res.data.unread_by_sender || {});
      }
    } catch (e) {
      console.error(e);
    }
  }, [user?.username]);

  const fetchErpReferences = useCallback(async () => {
    if (!user?.username) return;
    try {
      const res = await apiFetch("/api/chat/erp-references", {}, user.username);
      if (res.ok && Array.isArray(res.data?.items)) {
        setErpRefs(res.data.items);
      }
    } catch (e) {
      console.error(e);
    }
  }, [user?.username]);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await apiFetch("/api/chat/threads", {}, user?.username);
      if (res.ok) {
        const data = Array.isArray(res.data) ? res.data : [];
        setThreads((prev) => {
          if (prev.length > 0) {
            data.forEach((newThread: any) => {
              const oldThread = prev.find((t) => t.id === newThread.id);
              if (
                oldThread &&
                newThread.last_message_time &&
                oldThread.last_message_time !== newThread.last_message_time
              ) {
                if (
                  newThread.last_message_sender &&
                  newThread.last_message_sender !== user?.username
                ) {
                  showToast(
                    `New message in ${newThread.is_group ? newThread.name || "Group" : newThread.name || "Chat"}`,
                    "info",
                  );
                }
              }
            });
          }
          return data;
        });
        setSelectedThread((prev) => {
          if (!prev) return prev;
          const updated = data.find((t: Thread) => t.id === prev.id);
          return updated || prev;
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, [user?.username, showToast]);

  const fetchMessages = useCallback(
    async (threadId: string, shouldScroll = false) => {
      try {
        const res = await apiFetch(
          `/api/chat/threads/${threadId}/messages`,
          {},
          user?.username,
        );
        if (res.ok) {
          if (threadId === selectedThread?.id) {
            setMessages((prev) => {
              if (
                prev.length === res.data.length &&
                prev.every(
                  (m, idx) =>
                    m.id === res.data[idx].id &&
                    m.content === res.data[idx].content &&
                    m.is_deleted === res.data[idx].is_deleted &&
                    m.is_pinned === res.data[idx].is_pinned &&
                    m.read_by === res.data[idx].read_by &&
                    m.file_url === res.data[idx].file_url,
                )
              ) {
                return prev;
              }
              return res.data;
            });
          }

          if (user?.username && shouldScroll) {
            apiFetch(
              `/api/chat/threads/${threadId}/read`,
              { method: "POST" },
              user.username,
            )
              .then(() => {
                setThreads((prev) =>
                  prev.map((t) => (t.id === threadId ? { ...t, unread_count: 0 } : t)),
                );
                fetchUnreadStats();
                window.dispatchEvent(new CustomEvent("chat:unread_update"));
              })
              .catch(console.error);
          }
        }
      } catch (e) {
        console.error(e);
      }
    },
    [user?.username, selectedThread?.id, fetchUnreadStats],
  );

  useEffect(() => {
    fetchDirectory();
    fetchThreads();
    fetchUnreadStats();
    fetchErpReferences();
  }, [user, fetchDirectory, fetchThreads, fetchUnreadStats, fetchErpReferences]);

  useInterval(() => {
    fetchThreads();
    fetchUnreadStats();
  }, 5000);

  const fetchMessagesPolling = useCallback(() => {
    if (selectedThread?.id) {
      fetchMessages(selectedThread.id, false);
    }
  }, [selectedThread?.id, fetchMessages]);

  useInterval(fetchMessagesPolling, selectedThread ? 3000 : null);

  useEffect(() => {
    setMessages([]);
    setNewMessage("");
    setAttachingFile(null);
    setReplyingTo(null);
    setAttachedErpDoc(null);
    setShowInChatSearch(false);
    setInChatSearch("");
    setShowHeaderMenu(false);
    if (selectedThread?.id) {
      fetchMessages(selectedThread.id, true);
      fetchErpReferences();
    }
  }, [selectedThread?.id, fetchMessages, fetchErpReferences]);

  const getPeerUser = useCallback(
    (thread: Thread): UserDirectory | undefined => {
      if (thread.is_group || !thread.participants) return undefined;
      const otherUsername =
        thread.participants.find((p) => p !== user?.username) || user?.username;
      return directory.find((u) => u.username === otherUsername);
    },
    [directory, user?.username],
  );

  const getThreadTitle = useCallback(
    (thread: Thread) => {
      if (thread.id === "THREAD-GENERAL") return "General Discussion";
      if (thread.is_group) return thread.name || "Group Discussion";
      if (!thread.participants) return "Unknown";
      const otherUser =
        thread.participants.find((p) => p !== user?.username) || user?.username;
      return directory.find((u) => u.username === otherUser)?.name || otherUser || "Chat";
    },
    [directory, user?.username],
  );

  // Available departments from RBAC standard
  const availableDepts = useMemo(() => {
    return ["ALL", ...ERP_DEPARTMENT_OPTIONS.map((d) => d.value)];
  }, []);

  // Filtered Threads for Sidebar
  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      const title = getThreadTitle(t).toLowerCase();
      const peer = getPeerUser(t);
      const lastMsg = (t.last_message || "").toLowerCase();

      if (sidebarSearch.trim()) {
        const q = sidebarSearch.toLowerCase();
        const matchTitle = title.includes(q);
        const matchMsg = lastMsg.includes(q);
        const matchRole = (peer?.role || "").toLowerCase().includes(q);
        if (!matchTitle && !matchMsg && !matchRole) return false;
      }

      if (sidebarFilter === "UNREAD" && !(t.unread_count && t.unread_count > 0)) {
        return false;
      }
      if (sidebarFilter === "GROUPS" && !t.is_group) {
        return false;
      }
      if (sidebarFilter === "DEPT" && selectedDeptFilter !== "ALL") {
        if (t.is_group) {
          const hasDeptMember = (t.participants || []).some((p) => {
            const u = directory.find((d) => d.username === p);
            return normalizeDepartmentToRole(u?.role) === selectedDeptFilter;
          });
          if (!hasDeptMember) return false;
        } else {
          if (normalizeDepartmentToRole(peer?.role) !== selectedDeptFilter) return false;
        }
      }
      return true;
    });
  }, [threads, sidebarSearch, sidebarFilter, selectedDeptFilter, getThreadTitle, getPeerUser, directory]);

  // Pinned messages in current thread
  const pinnedMessages = useMemo(
    () => messages.filter((m) => m.is_pinned && !m.is_deleted),
    [messages],
  );

  // Filtered messages in current thread
  const displayedMessages = useMemo(() => {
    if (!inChatSearch.trim()) return messages;
    const q = inChatSearch.toLowerCase();
    return messages.filter(
      (m) =>
        !m.is_deleted &&
        ((m.content || "").toLowerCase().includes(q) ||
          (m.file_name || "").toLowerCase().includes(q) ||
          m.sender_username.toLowerCase().includes(q)),
    );
  }, [messages, inChatSearch]);

  const scrollToMessage = useCallback((msgId: string) => {
    const el = messageRefs.current[msgId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-400", "rounded-2xl");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-amber-400", "rounded-2xl");
      }, 2000);
    }
  }, []);


  const handleCreateChat = async () => {
    if (selectedUsers.length === 0) return;
    const isGroup = selectedUsers.length > 1;
    if (isGroup && !groupName.trim()) {
      showToast("Please enter a group name first", "error");
      return;
    }

    try {
      const res = await apiFetch(
        "/api/chat/threads",
        {
          method: "POST",
          body: JSON.stringify({
            name: isGroup ? groupName.trim() : null,
            is_group: isGroup,
            participants: selectedUsers,
          }),
        },
        user?.username,
      );

      const targetId = res.data?.id;
      if (res.ok && targetId) {
        const updatedRes = await apiFetch("/api/chat/threads", {}, user?.username);
        if (updatedRes.ok && Array.isArray(updatedRes.data)) {
          setThreads(updatedRes.data);
          const found = updatedRes.data.find((t: Thread) => t.id === targetId);
          if (found) setSelectedThread(found);
        }
        setShowNewChat(false);
        setSelectedUsers([]);
        setGroupName("");
      } else {
        showToast(res.error || "Failed to create conversation", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to create conversation", "error");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !selectedThread ||
      (!newMessage.trim() && !attachingFile && !attachedErpDoc)
    )
      return;

    let fileData = null;
    if (attachingFile) {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", attachingFile);
      try {
        const uploadRes = await apiFetch(
          "/api/upload",
          {
            method: "POST",
            body: formData,
          },
          user?.username,
        );
        if (uploadRes.ok) {
          const { url } = uploadRes.data;
          fileData = {
            file_url: url,
            file_name: attachingFile.name,
            file_size: attachingFile.size,
            file_type: attachingFile.type,
          };
        } else {
          showToast(uploadRes.error || "Failed to upload file", "error");
          setUploading(false);
          return;
        }
      } catch (e) {
        showToast("Failed to upload file", "error");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    let finalContent = newMessage.trim();
    if (attachedErpDoc) {
      const metaPayload = {
        status: attachedErpDoc.status,
        amount: attachedErpDoc.amount,
        partnerName: attachedErpDoc.partner_name,
        urgency: attachedErpDoc.urgency || "NORMAL",
        requiresAuth: attachedErpNeedsAuth,
        url: attachedErpDoc.url,
        sharedByRole: user?.role,
      };
      const marker = `🔗 *Shared Resource: ${attachedErpDoc.title}* (${attachedErpDoc.type}) #${attachedErpDoc.id} |META:${JSON.stringify(metaPayload)}`;
      finalContent = finalContent ? `${finalContent}\n\n${marker}` : marker;
    }

    try {
      const res = await apiFetch(
        `/api/chat/threads/${selectedThread.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: finalContent || null,
            ...fileData,
            reply_to_id: replyingTo?.id || null,
            reply_to_sender: replyingTo?.sender_username || null,
            reply_to_content: replyingTo
              ? (replyingTo.content || replyingTo.file_name || "Attachment")
                  .replace(/\|META:\{.*\}$/s, "")
                  .slice(0, 140)
              : null,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        setNewMessage("");
        setAttachingFile(null);
        setReplyingTo(null);
        setAttachedErpDoc(null);
        setAttachedErpNeedsAuth(false);
        await fetchMessages(selectedThread.id, true);
        fetchThreads();
        window.dispatchEvent(new CustomEvent("chat:unread_update"));
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else {
        showToast(res.error || "Failed to send message", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to send message", "error");
    }
  };

  const handleTogglePin = useCallback(
    async (msg: Message) => {
      try {
        const res = await apiFetch(
          `/api/chat/messages/${msg.id}/pin`,
          { method: "POST" },
          user?.username,
        );
        if (res.ok) {
          showToast(
            res.data?.is_pinned
              ? "Message pinned to top of conversation"
              : "Message unpinned",
            "success",
          );
          if (selectedThread) fetchMessages(selectedThread.id, false);
        }
      } catch (e) {
        showToast("Failed to pin message", "error");
      }
    },
    [user?.username, showToast, selectedThread, fetchMessages],
  );

  const handleOpenForwardModal = useCallback((msg: Message) => {
    setForwardingMsg(msg);
    setForwardTab("USERS");
    setForwardSearch("");
    setForwardSelectedUsers([]);
    setForwardSelectedThreads([]);
    setForwardNote("");
  }, []);


  const handleConfirmForward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forwardingMsg || !user) return;
    const totalCount = forwardSelectedUsers.length + forwardSelectedThreads.length;
    if (totalCount === 0) {
      showToast("Please select at least 1 user or group to forward to.", "warning");
      return;
    }

    setIsForwarding(true);
    try {
      const originalSender = forwardingMsg.forwarded_from || forwardingMsg.sender_username;
      const res = await apiFetch(
        "/api/chat/forward",
        {
          method: "POST",
          body: JSON.stringify({
            target_usernames: forwardSelectedUsers,
            target_thread_ids: forwardSelectedThreads,
            content: forwardingMsg.content,
            file_url: forwardingMsg.file_url,
            file_name: forwardingMsg.file_name,
            file_size: forwardingMsg.file_size,
            file_type: forwardingMsg.file_type,
            forwarded_from: originalSender,
            note: forwardNote.trim() || null,
          }),
        },
        user.username,
      );

      if (res.ok) {
        showToast(`Message forwarded to ${totalCount} recipient${totalCount === 1 ? "" : "s"}!`, "success");
        setForwardingMsg(null);
        fetchThreads();
        if (selectedThread) fetchMessages(selectedThread.id, false);
        window.dispatchEvent(new CustomEvent("chat:unread_update"));
      } else {
        showToast(res.error || "Failed to forward message", "error");
      }
    } catch (err) {
      showToast("An error occurred while forwarding the message", "error");
    } finally {
      setIsForwarding(false);
    }
  };

  const handleAuthorizeFromChat = async (pin: string) => {
    if (!authModalDoc || !user) return;
    setIsAuthorizingDoc(true);
    try {
      const res = await apiFetch(
        "/api/chat/erp-authorize",
        {
          method: "POST",
          body: JSON.stringify({
            type: authModalDoc.type,
            id: authModalDoc.id,
            pin,
            thread_id: selectedThread?.id,
          }),
        },
        user.username,
      );

      if (res.ok) {
        showToast(
          `${authModalDoc.type} (${authModalDoc.docNumber}) authorized to ${res.data?.new_status}!`,
          "success",
        );
        setAuthModalDoc(null);
        await fetchErpReferences();
        if (selectedThread) {
          await fetchMessages(selectedThread.id, true);
        }
      } else {
        showToast(res.error || "Failed to authorize document", "error");
      }
    } catch (err) {
      showToast("An error occurred while authorizing the document", "error");
    } finally {
      setIsAuthorizingDoc(false);
    }
  };

  const handleOpenErpDocModal = useCallback(
    async (rawType: string, targetId: string) => {
      const cleanTargetId = String(targetId || "").trim();
      if (!cleanTargetId) return;
      const docType = String(rawType || "NTP").trim().toUpperCase();

      setLoadingDocPreviewId(cleanTargetId);
      if (docType === "NTP" || docType === "PROJECT" || docType === "WO") {
        setIsLoadingNtpPreview(true);
      }

      try {
        const res = await apiFetch(
          `/api/chat/erp-document-preview/${encodeURIComponent(docType)}/${encodeURIComponent(cleanTargetId)}`,
          {},
          user?.username,
        );
        if (res.ok && res.data?.success && res.data?.data) {
          const resolvedType = String(res.data.docType || docType).toUpperCase();
          const payload = res.data.data;

          if (resolvedType === "NTP") {
            setChatNtpPreview({
              ntp: payload.ntp,
              project: payload.project,
            });
          } else if (resolvedType === "QUOTATION") {
            setChatQuotationPreview(payload);
          } else if (resolvedType === "PO") {
            setChatPoPreview(payload);
          } else if (resolvedType === "PR") {
            setChatPrPreview(payload);
          } else if (resolvedType === "INVOICE") {
            setChatInvoicePreview({
              invoice: payload.invoice,
              bankAccounts: Array.isArray(payload.bankAccounts)
                ? payload.bankAccounts
                : [],
            });
          }
        } else {
          showToast(
            res.error ||
              res.data?.error ||
              `Could not load ${docType} preview for ${cleanTargetId}`,
            "error",
          );
        }
      } catch (e) {
        showToast(`Failed to load ${docType} document preview`, "error");
      } finally {
        setLoadingDocPreviewId(null);
        setIsLoadingNtpPreview(false);
      }
    },
    [user?.username, showToast],
  );

  const handleOpenNtpModal = useCallback(
    (targetId: string) => {
      handleOpenErpDocModal("NTP", targetId);
    },
    [handleOpenErpDocModal],
  );

  const handleExportPoPdfFromChat = useCallback(async () => {
    if (!poDocRef.current || !chatPoPreview) return;
    setIsExportingPoPdf(true);
    try {
      await generatePDF(
        poDocRef.current,
        `Purchase_Order_${chatPoPreview.po_number || chatPoPreview.id}`,
      );
      showToast("Purchase Order PDF generated successfully", "success");
    } catch {
      showToast("Failed to export Purchase Order PDF", "error");
    } finally {
      setIsExportingPoPdf(false);
    }
  }, [chatPoPreview, showToast]);

  const handleDeleteMessage = useCallback(
    async (msgId: string) => {
      setConfirmModal({
        isOpen: true,
        message: "Are you sure you want to delete this message?",
        onConfirm: async () => {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          try {
            const res = await apiFetch(
              `/api/chat/messages/${msgId}`,
              { method: "DELETE" },
              user?.username,
            );
            if (res.ok) {
              fetchMessages(selectedThread?.id || "", false);
              showToast("Message deleted", "success");
            } else {
              showToast(res.error || "Could not delete message", "error");
            }
          } catch (e) {
            console.error(e);
          }
        },
      });
    },
    [user?.username, selectedThread?.id, fetchMessages, showToast],
  );


  const handleAddMember = async () => {
    if (selectedUsers.length === 0 || !selectedThread) return;
    try {
      const res = await apiFetch(
        `/api/chat/threads/${selectedThread.id}/participants`,
        {
          method: "POST",
          body: JSON.stringify({ users: selectedUsers }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Members added to group", "success");
        setShowAddMember(false);
        setSelectedUsers([]);
        fetchThreads();
      } else {
        showToast(res.error || "Failed to add members", "error");
      }
    } catch (e) {
      showToast("Failed to add members", "error");
    }
  };

  const handleRemoveMember = async (usernameToRemove: string) => {
    if (!selectedThread) return;
    setConfirmModal({
      isOpen: true,
      message: `Remove ${usernameToRemove} from this group discussion?`,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await apiFetch(
            `/api/chat/threads/${selectedThread.id}/participants/${usernameToRemove}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            showToast("Member removed", "success");
            if (usernameToRemove === user?.username) {
              setSelectedThread(null);
            }
            fetchThreads();
          } else {
            showToast(res.error || "Failed to remove member", "error");
          }
        } catch (e) {
          showToast("Failed to remove member", "error");
        }
      },
    });
  };

  const handleDeleteThread = async () => {
    if (!selectedThread) return;
    setShowHeaderMenu(false);
    setConfirmModal({
      isOpen: true,
      message:
        "Permanently delete this entire conversation for all participants? This action cannot be undone.",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          const res = await apiFetch(
            `/api/chat/threads/${selectedThread.id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            showToast("Conversation deleted", "success");
            setSelectedThread(null);
            fetchThreads();
          } else {
            showToast(res.error || "Failed to delete conversation", "error");
          }
        } catch (e) {
          showToast("Failed to delete conversation", "error");
        }
      },
    });
  };

  const filteredDirectory = useMemo(() => {
    return directory.filter((u) => {
      if (u.username === user?.username) return false;
      if (
        newChatDeptFilter !== "ALL" &&
        normalizeDepartmentToRole(u.role) !== newChatDeptFilter
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.role || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [directory, user?.username, newChatDeptFilter, searchQuery]);

  const totalUnreadChats = useMemo(
    () => threads.reduce((acc, t) => acc + (Number(t.unread_count) || 0), 0),
    [threads],
  );


  return (
    <div className="space-y-3 lg:space-y-4 lg:pb-12 animate-in fade-in duration-300">
      <div className={cn(selectedThread ? "hidden lg:block" : "block")}>
        <PageHeader
          title="Messages & Collaboration"
          subtitle="Cross-department communication & approvals"
          icon={<MessageSquare className="w-5 h-5" />}
        />
      </div>

      <div
        className={cn(
          "bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs flex flex-col lg:flex-row",
          selectedThread
            ? "h-[calc(100dvh-7.5rem)] lg:h-[calc(100vh-14.5rem)] min-h-[420px]"
            : "h-[calc(100dvh-11.5rem)] lg:h-[calc(100vh-14.5rem)] min-h-[420px]",
        )}
      >
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              setAttachingFile(e.target.files[0]);
            }
            e.target.value = "";
          }}
        />

        {/* LEFT PANEL: CONVERSATIONS & FILTERS */}
        <ForumSidebar
          selectedThread={selectedThread}
          setSelectedThread={setSelectedThread}
          totalUnreadChats={totalUnreadChats}
          setSearchQuery={setSearchQuery}
          setNewChatDeptFilter={setNewChatDeptFilter}
          setShowNewChat={setShowNewChat}
          sidebarSearch={sidebarSearch}
          setSidebarSearch={setSidebarSearch}
          sidebarFilter={sidebarFilter}
          setSidebarFilter={setSidebarFilter}
          availableDepts={availableDepts}
          selectedDeptFilter={selectedDeptFilter}
          setSelectedDeptFilter={setSelectedDeptFilter}
          filteredThreads={filteredThreads}
          getThreadTitle={getThreadTitle}
          getPeerUser={getPeerUser}
          stripMarkdown={stripMarkdown}
          formatMsgTime={formatMsgTime}
        />

        {/* RIGHT PANEL: ACTIVE CONVERSATION */}
        <div
          className={cn(
            "flex-1 flex-col min-h-0 min-w-0 bg-white",
            selectedThread ? "flex" : "hidden lg:flex",
          )}
        >
          {selectedThread ? (
            <>
              <ForumChatHeader
                selectedThread={selectedThread}
                setSelectedThread={setSelectedThread}
                getThreadTitle={getThreadTitle}
                getPeerUser={getPeerUser}
                showInChatSearch={showInChatSearch}
                setShowInChatSearch={setShowInChatSearch}
                inChatSearch={inChatSearch}
                setInChatSearch={setInChatSearch}
                displayedMessagesCount={displayedMessages.length}
                showHeaderMenu={showHeaderMenu}
                setShowHeaderMenu={setShowHeaderMenu}
                headerMenuRef={headerMenuRef}
                setShowMembersList={setShowMembersList}
                setShowAddMember={setShowAddMember}
                setShowErpPicker={setShowErpPicker}
                handleDeleteThread={handleDeleteThread}
                pinnedMessages={pinnedMessages}
                scrollToMessage={scrollToMessage}
                handleTogglePin={handleTogglePin}
              />

              <ForumMessageStream
                displayedMessages={displayedMessages}
                inChatSearch={inChatSearch}
                user={user}
                directory={directory}
                erpRefs={erpRefs}
                isCurrentUserManager={isCurrentUserManager}
                isLoadingNtpPreview={isLoadingNtpPreview}
                loadingDocPreviewId={loadingDocPreviewId}
                messageRefs={messageRefs}
                messagesEndRef={messagesEndRef}
                scrollToMessage={scrollToMessage}
                setLightboxZoom={setLightboxZoom}
                setLightboxData={setLightboxData}
                handleOpenNtpModal={handleOpenNtpModal}
                handleOpenErpDocModal={handleOpenErpDocModal}
                setAuthModalDoc={setAuthModalDoc}
                openShareModal={openShareModal}
                setReplyingTo={setReplyingTo}
                handleOpenForwardModal={handleOpenForwardModal}
                handleTogglePin={handleTogglePin}
                handleDeleteMessage={handleDeleteMessage}
              />

              {/* Chat Composer Footer */}
              <ForumComposer

                replyingTo={replyingTo}
                setReplyingTo={setReplyingTo}
                stripMarkdown={stripMarkdown}
                attachedErpDoc={attachedErpDoc}
                setAttachedErpDoc={setAttachedErpDoc}
                attachedErpNeedsAuth={attachedErpNeedsAuth}
                setAttachedErpNeedsAuth={setAttachedErpNeedsAuth}
                attachingFile={attachingFile}
                setAttachingFile={setAttachingFile}
                attachingPreviewUrl={attachingPreviewUrl}
                uploading={uploading}
                fileInputRef={fileInputRef}
                setErpPickerSearch={setErpPickerSearch}
                setShowErpPicker={setShowErpPicker}
                newMessage={newMessage}
                setNewMessage={setNewMessage}
                handleSendMessage={handleSendMessage}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-stone-50 border border-stone-200/70 rounded-2xl flex items-center justify-center mb-5 shadow-2xs">
                <MessageSquare className="w-7 h-7 text-stone-400" />
              </div>
              <h2 className="text-lg font-bold text-stone-900 mb-1.5">
                ERP Collaboration & Authorization Hub
              </h2>
              <p className="text-xs text-stone-500 max-w-sm mb-6 leading-relaxed">
                Select a conversation on the left or start a new discussion to share images, forward instructions, and authorize documents across departments.
              </p>
              <Button
                variant="primary"
                onClick={() => setShowNewChat(true)}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Start New Chat
              </Button>
            </div>
          )}
        </div>
      </div>

      <ForumModals
        user={user}
        threads={threads}
        selectedThread={selectedThread}
        directory={directory}
        filteredDirectory={filteredDirectory}
        unreadBySender={unreadBySender}
        availableDepts={availableDepts}
        getThreadTitle={getThreadTitle}
        stripMarkdown={stripMarkdown}
        lightboxData={lightboxData}
        setLightboxData={setLightboxData}
        lightboxZoom={lightboxZoom}
        setLightboxZoom={setLightboxZoom}
        forwardingMsg={forwardingMsg}
        setForwardingMsg={setForwardingMsg}
        forwardTab={forwardTab}
        setForwardTab={setForwardTab}
        forwardSearch={forwardSearch}
        setForwardSearch={setForwardSearch}
        forwardSelectedUsers={forwardSelectedUsers}
        setForwardSelectedUsers={setForwardSelectedUsers}
        forwardSelectedThreads={forwardSelectedThreads}
        setForwardSelectedThreads={setForwardSelectedThreads}
        forwardNote={forwardNote}
        setForwardNote={setForwardNote}
        isForwarding={isForwarding}
        handleConfirmForward={handleConfirmForward}
        showErpPicker={showErpPicker}
        setShowErpPicker={setShowErpPicker}
        erpPickerTab={erpPickerTab}
        setErpPickerTab={setErpPickerTab}
        erpPickerSearch={erpPickerSearch}
        setErpPickerSearch={setErpPickerSearch}
        erpRefs={erpRefs}
        setAttachedErpDoc={setAttachedErpDoc}
        setAttachedErpNeedsAuth={setAttachedErpNeedsAuth}
        authModalDoc={authModalDoc}
        setAuthModalDoc={setAuthModalDoc}
        isAuthorizingDoc={isAuthorizingDoc}
        handleAuthorizeFromChat={handleAuthorizeFromChat}
        showNewChat={showNewChat}
        setShowNewChat={setShowNewChat}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        newChatDeptFilter={newChatDeptFilter}
        setNewChatDeptFilter={setNewChatDeptFilter}
        selectedUsers={selectedUsers}
        setSelectedUsers={setSelectedUsers}
        groupName={groupName}
        setGroupName={setGroupName}
        handleCreateChat={handleCreateChat}
        showMembersList={showMembersList}
        setShowMembersList={setShowMembersList}
        handleRemoveMember={handleRemoveMember}
        showAddMember={showAddMember}
        setShowAddMember={setShowAddMember}
        handleAddMember={handleAddMember}
        confirmModal={confirmModal}
        setConfirmModal={setConfirmModal}
      />

      {chatNtpPreview && (
        <NtpPreviewModal
          isOpen={!!chatNtpPreview}
          onClose={() => setChatNtpPreview(null)}
          ntp={chatNtpPreview.ntp}
          project={chatNtpPreview.project}
        />
      )}

      {chatQuotationPreview && (
        <QuotationPreviewModal
          isOpen={!!chatQuotationPreview}
          onClose={() => setChatQuotationPreview(null)}
          quotation={chatQuotationPreview}
        />
      )}

      {chatPoPreview && (
        <PoDocumentModal
          isOpen={!!chatPoPreview}
          onClose={() => setChatPoPreview(null)}
          selectedPoDetails={chatPoPreview}
          poDocRef={poDocRef}
          isSubmitting={isExportingPoPdf}
          exportPoPdf={handleExportPoPdfFromChat}
          language="en"
        />
      )}

      {chatPrPreview && (
        <PrDetailsModal
          isOpen={!!chatPrPreview}
          onClose={() => setChatPrPreview(null)}
          selectedPrDetails={chatPrPreview}
        />
      )}

      {chatInvoicePreview && (
        <InvoicePreviewModal
          isOpen={!!chatInvoicePreview}
          onClose={() => setChatInvoicePreview(null)}
          invoice={chatInvoicePreview.invoice}
          bankAccounts={chatInvoicePreview.bankAccounts}
        />
      )}
    </div>
  );
}

