import React from "react";
import {
  MessageSquare,
  File,
  FileText,
  Download,
  Trash2,
  Reply,
  Pin,
  ExternalLink,
  Maximize2,
  ShieldCheck,
  CheckCircle2,
  CornerUpRight,
  Briefcase,
  ClipboardList,
  ShoppingCart,
  Receipt,
  Settings,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn, formatIDR } from "@/lib/utils";
import { canViewDocFinancials, maskPriceText, ConfidentialBadge } from "@/utils/rbacFinancials";
import {
  type Message,
  type UserDirectory,
  type ErpRefItem,
  getColorHash,
  isImageAttachment,
  formatMsgTime,
} from "@/pages/erp/core/forumTypes";

interface ForumMessageStreamProps {
  displayedMessages: Message[];
  inChatSearch: string;
  user: any;
  directory: UserDirectory[];
  erpRefs: ErpRefItem[];
  isCurrentUserManager: boolean;
  isLoadingNtpPreview: boolean;
  loadingDocPreviewId?: string | null;
  messageRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollToMessage: (msgId: string) => void;
  setLightboxZoom: React.Dispatch<React.SetStateAction<number>>;
  setLightboxData: React.Dispatch<
    React.SetStateAction<{
      url: string;
      name: string;
      sender?: string;
      time?: string;
    } | null>
  >;
  handleOpenNtpModal: (targetId: string) => void;
  handleOpenErpDocModal: (type: string, targetId: string) => void;
  setAuthModalDoc: React.Dispatch<React.SetStateAction<any>>;
  openShareModal: (item: any) => void;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  handleOpenForwardModal: (msg: Message) => void;
  handleTogglePin: (msg: Message) => void;
  handleDeleteMessage: (msgId: string) => void;
}

export const ForumMessageStream = React.memo(function ForumMessageStream({
  displayedMessages,
  inChatSearch,
  user,
  directory,
  erpRefs,
  isCurrentUserManager,
  isLoadingNtpPreview,
  loadingDocPreviewId,
  messageRefs,
  messagesEndRef,
  scrollToMessage,
  setLightboxZoom,
  setLightboxData,
  handleOpenNtpModal,
  handleOpenErpDocModal,
  setAuthModalDoc,
  openShareModal,
  setReplyingTo,
  handleOpenForwardModal,
  handleTogglePin,
  handleDeleteMessage,
}: ForumMessageStreamProps) {
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-6 space-y-4 bg-stone-50/20 relative min-h-0 custom-scrollbar">
      {displayedMessages.length === 0 && (
        <div className="text-center py-16 sm:py-24 max-w-sm mx-auto">
          <div className="w-12 h-12 bg-white border border-stone-200/60 shadow-2xs rounded-2xl flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="w-5 h-5 text-stone-500" />
          </div>
          <div className="text-xs font-bold text-stone-900 tracking-wider uppercase">
            {inChatSearch ? "No Matching Messages" : "Conversation Ready"}
          </div>
          <p className="text-[11px] text-stone-400 font-medium mt-1 leading-relaxed">
            {inChatSearch
              ? "Try searching with a different keyword."
              : "Send messages, share images with inline preview, or attach ERP documents for Manager authorization."}
          </p>
        </div>
      )}

      {displayedMessages.map((msg) => {
        const isMine = msg.sender_username === user?.username;
        const isSystemMsg = msg.sender_username === "SYSTEM";
        const senderProfile = directory.find(
          (d) => d.username === msg.sender_username,
        );
        const isImage =
          !msg.is_deleted &&
          msg.file_url &&
          isImageAttachment(msg.file_type, msg.file_name, msg.file_url);

        if (isSystemMsg && !msg.is_deleted) {
          const cleanWelcomeText = (msg.content || "")
            .replace(/^🎊\s*\*?\*?New Member Alert!\*?\*?\s*🎊\s*\n?/i, "")
            .replace(/^\*?\*?New Member Alert!\*?\*?\s*\n?/i, "")
            .replace(/\n+---\s*$/g, "")
            .replace(/\n+/g, " ")
            .trim();

          return (
            <div
              key={msg.id}
              ref={(el) => {
                messageRefs.current[msg.id] = el;
              }}
              className="flex items-center justify-center my-2 group transition-all"
            >
              <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/90 border border-stone-200/80 shadow-2xs max-w-[92%] sm:max-w-[78%] text-xs text-stone-700">
                <div className="flex-1 min-w-0 leading-relaxed">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => (
                        <span className="inline">{children}</span>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-bold text-stone-900">
                          {children}
                        </strong>
                      ),
                    }}
                  >
                    {cleanWelcomeText}
                  </ReactMarkdown>
                  <span className="ml-2 text-[9px] text-stone-400 font-bold uppercase tracking-tight whitespace-nowrap">
                    {formatMsgTime(msg.created_at)}
                  </span>
                </div>

                {isCurrentUserManager && (
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(msg.id)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-stone-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-all cursor-pointer shrink-0"
                    title="Delete message"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            ref={(el) => {
              messageRefs.current[msg.id] = el;
            }}
            className={cn(
              "flex items-start gap-2.5 sm:gap-3 max-w-[92%] sm:max-w-[82%] group transition-all min-w-0",
              isMine ? "ml-auto flex-row-reverse" : "mr-auto",
            )}
          >
            {/* Sender Avatar */}
            <div
              className={cn(
                "w-8 h-8 rounded-xl border shadow-2xs flex justify-center items-center shrink-0 font-bold text-[10px]",
                getColorHash(msg.sender_username),
              )}
            >
              {msg.sender_username.substring(0, 2).toUpperCase()}
            </div>

            <div
              className={cn(
                "flex flex-col gap-1 min-w-0 max-w-full",
                isMine ? "items-end" : "items-start",
              )}
            >
              {/* Sender Name & Role */}
              <div className="flex items-center gap-1.5 px-1">
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    isMine ? "text-stone-800" : "text-stone-600",
                  )}
                >
                  {isMine
                    ? "You"
                    : senderProfile?.name || msg.sender_username}
                </span>
                {!isMine && senderProfile?.role && (
                  <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-500 text-[8.5px] font-bold uppercase tracking-wider">
                    {senderProfile.role}
                  </span>
                )}
                {!!msg.is_pinned && !msg.is_deleted && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded">
                    <Pin className="w-2.5 h-2.5" /> Pinned
                  </span>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={cn(
                  "px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl text-xs sm:text-[13px] whitespace-pre-wrap break-words relative shadow-2xs border transition-colors max-w-full",
                  msg.is_deleted
                    ? "bg-transparent border-stone-200 text-stone-400 italic"
                    : isMine
                      ? "forum-bubble-mine bg-stone-100/90 border-stone-200/90 text-stone-900 rounded-tr-xs"
                      : "forum-bubble-peer bg-white border-stone-200/90 text-stone-900 rounded-tl-xs",
                )}
              >
                {/* 1. "Forward from XXX" Header */}
                {!msg.is_deleted && msg.forwarded_from && (
                  <div className="mb-2 pb-1.5 border-b border-stone-200/60 flex items-center gap-1.5 text-[10px] font-bold text-stone-500 italic">
                    <CornerUpRight className="w-3 h-3 text-amber-600 shrink-0" />
                    <span>Forward from {msg.forwarded_from}</span>
                  </div>
                )}

                {/* 2. Quoted Reply Preview */}
                {!msg.is_deleted && msg.reply_to_id && (
                  <button
                    type="button"
                    onClick={() =>
                      msg.reply_to_id && scrollToMessage(msg.reply_to_id)
                    }
                    className={cn(
                      "mb-2 w-full text-left px-2.5 py-1.5 rounded-xl border-l-3 text-[11px] transition-colors cursor-pointer block",
                      isMine
                        ? "bg-white/80 border-stone-400 text-stone-700 hover:bg-white"
                        : "bg-stone-50 border-stone-800 text-stone-700 hover:bg-stone-100",
                    )}
                  >
                    <div className="font-extrabold text-[10px] text-stone-900">
                      @{msg.reply_to_sender || "User"}
                    </div>
                    <div className="truncate text-stone-500 text-[10.5px]">
                      {msg.reply_to_content || "Message"}
                    </div>
                  </button>
                )}

                {/* 3. Inline Image Attachment Preview */}
                {isImage && msg.file_url && (
                  <div className="mb-2 overflow-hidden rounded-xl border border-stone-200/80 bg-stone-900/5 relative group/img">
                    <img
                      src={msg.file_url}
                      alt={msg.file_name || "Chat image"}
                      loading="lazy"
                      onClick={() => {
                        setLightboxZoom(1);
                        setLightboxData({
                          url: msg.file_url!,
                          name: msg.file_name || "Image Preview",
                          sender: msg.sender_username,
                          time: formatMsgTime(msg.created_at),
                        });
                      }}
                      className="max-h-72 sm:max-h-80 w-auto max-w-full object-contain rounded-xl cursor-zoom-in transition-transform duration-200 group-hover/img:scale-[1.01]"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-between gap-2 text-white">
                      <span className="text-[10px] font-medium truncate px-1">
                        {msg.file_name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setLightboxZoom(1);
                            setLightboxData({
                              url: msg.file_url!,
                              name: msg.file_name || "Image Preview",
                              sender: msg.sender_username,
                              time: formatMsgTime(msg.created_at),
                            });
                          }}
                          className="px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 backdrop-blur-xs text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Maximize2 className="w-3 h-3" /> Enlarge
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Non-Image File Attachment Card */}
                {msg.file_url && !msg.is_deleted && !isImage && (
                  <a
                    href={msg.file_url}
                    target="_blank"
                    rel="noreferrer"
                    download={msg.file_name || undefined}
                    className={cn(
                      "mb-2 p-2.5 rounded-xl flex items-center justify-between gap-3 border hover:opacity-95 transition-opacity",
                      isMine
                        ? "bg-white border-stone-200/80 text-stone-900"
                        : "bg-stone-50 border-stone-200 text-stone-900",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0">
                        <File className="w-4 h-4 text-stone-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate max-w-[180px] sm:max-w-[240px]">
                          {msg.file_name || "File Attachment"}
                        </p>
                        <p className="text-[10px] text-stone-400 font-mono">
                          {((msg.file_size || 0) / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <Download className="w-4 h-4 text-stone-400 shrink-0" />
                  </a>
                )}

                {/* 5. Message Text & Interactive Shared ERP Resource Card */}
                {(() => {
                  if (msg.is_deleted) return msg.content;

                  let contentToParse = msg.content || "";
                  let sharedBlock = null;
                  let attachedDocType: string | null = null;

                  const sharedMatch = contentToParse.match(
                    /🔗 \*Shared Resource: (.*?)\* \((NTP|PROJECT|PR|PO|QUOTATION|INVOICE|GRN|WO|REQ)\) #([^\n\r|]+)(?:\s*\|META:(\{.*\}))?/s,
                  );

                  if (sharedMatch) {
                    const [fullMatch, rawTitle, rawType, rawId, rawMetaJson] =
                      sharedMatch;
                    attachedDocType = rawType;
                    const cleanId = rawId.trim();
                    contentToParse = contentToParse
                      .replace(fullMatch, "")
                      .trim();

                    let parsedMeta: any = {};
                    if (rawMetaJson) {
                      try {
                        parsedMeta = JSON.parse(rawMetaJson);
                      } catch {}
                    }

                    const liveRef = erpRefs.find(
                      (r) =>
                        (r.type === rawType ||
                          (rawType === "PROJECT" && r.type === "NTP") ||
                          (rawType === "NTP" && r.type === "PROJECT")) &&
                        (r.id === cleanId || r.doc_number === cleanId),
                    );

                    const currentStatus = String(
                      liveRef?.status || parsedMeta.status || "ISSUED",
                    ).toUpperCase();
                    const currentAmount =
                      liveRef?.amount !== undefined
                        ? liveRef.amount
                        : parsedMeta.amount;
                    const currentPartner =
                      liveRef?.partner_name || parsedMeta.partnerName;
                    const currentUrgency = String(
                      liveRef?.urgency || parsedMeta.urgency || "NORMAL",
                    ).toUpperCase();

                    const isPendingApproval = [
                      "DRAFT",
                      "DRAFTED",
                      "PENDING",
                      "PENDING_NTP",
                      "REVISION",
                      "WAITING_APPROVAL",
                    ].includes(currentStatus);

                    const canDirectAuthorize =
                      ["NTP", "PR", "PO", "QUOTATION", "PROJECT"].includes(
                        rawType,
                      ) && isPendingApproval;

                    const isNtpOrProject =
                      rawType === "NTP" || rawType === "PROJECT";

                    const getDocLink = () => {
                      if (isNtpOrProject) {
                        return `/quotations?tab=ntp&ntp_id=${encodeURIComponent(cleanId)}`;
                      }
                      if (parsedMeta.url) return parsedMeta.url;
                      if (liveRef?.url) return liveRef.url;
                      switch (rawType) {
                        case "PR":
                          return `/engineering?tab=pr&highlight=${cleanId}`;
                        case "PO":
                          return `/procurement?tab=po&highlight=${cleanId}`;
                        case "QUOTATION":
                          return `/quotations?highlight=${cleanId}`;
                        case "INVOICE":
                          return `/invoices?highlight=${cleanId}`;
                        default:
                          return "/erp";
                      }
                    };

                    const getDocIcon = () => {
                      switch (rawType) {
                        case "NTP":
                        case "PROJECT":
                          return (
                            <Briefcase className="w-4 h-4 text-blue-600" />
                          );
                        case "PR":
                          return (
                            <ClipboardList className="w-4 h-4 text-amber-600" />
                          );
                        case "PO":
                          return (
                            <ShoppingCart className="w-4 h-4 text-emerald-600" />
                          );
                        case "QUOTATION":
                          return (
                            <FileText className="w-4 h-4 text-indigo-600" />
                          );
                        case "INVOICE":
                          return (
                            <Receipt className="w-4 h-4 text-purple-600" />
                          );
                        default:
                          return (
                            <ExternalLink className="w-4 h-4 text-stone-600" />
                          );
                      }
                    };

                    sharedBlock = (
                      <div
                        className={cn(
                          "mt-2.5 p-3.5 rounded-2xl border flex flex-col gap-2.5 shadow-2xs transition-all",
                          isMine
                            ? "bg-white border-stone-200/90 text-stone-800"
                            : "bg-stone-50/90 border-stone-200/90 text-stone-800",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-stone-100 border border-stone-200/70 text-[10px] font-extrabold uppercase tracking-wider text-stone-700">
                            {getDocIcon()}
                            <span>
                              {isNtpOrProject
                                ? "NOTICE TO PROCEED (NTP)"
                                : rawType}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {currentUrgency !== "NORMAL" && (
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                                  currentUrgency === "CRITICAL"
                                    ? "bg-rose-600 text-white"
                                    : "bg-amber-500 text-white",
                                )}
                              >
                                {currentUrgency}
                              </span>
                            )}
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-md text-[9.5px] font-extrabold uppercase tracking-wider border",
                                [
                                  "AUTHORIZED",
                                  "ISSUED",
                                  "APPROVED",
                                  "COMPLETED",
                                  "PAID",
                                  "ACTIVE",
                                ].includes(currentStatus)
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : isPendingApproval
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-stone-100 text-stone-600 border-stone-200",
                              )}
                            >
                              {currentStatus}
                            </span>
                          </div>
                        </div>

                        <div>
                          <div className="font-extrabold text-stone-900 text-xs sm:text-sm leading-snug">
                            {rawTitle}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[11px] text-stone-500">
                            <span className="font-mono text-[10px] font-bold text-stone-700">
                              {isNtpOrProject ? "NTP / Project ID:" : "ID:"}{" "}
                              {liveRef?.doc_number || cleanId}
                            </span>
                            {currentPartner && (
                              <span className="font-semibold text-stone-700">
                                · {currentPartner}
                              </span>
                            )}
                            {canViewDocFinancials(user, rawType) ? (
                              currentAmount !== undefined &&
                              currentAmount !== null &&
                              Number(currentAmount) > 0 ? (
                                <span className="font-mono font-bold text-emerald-700">
                                  · {formatIDR(Number(currentAmount))}
                                </span>
                              ) : null
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <span className="text-stone-400">·</span>
                                <ConfidentialBadge size="xs" />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Bar on ERP Card - Opens In-Place Preview Modal without leaving Messages */}
                        <div className="pt-2 border-t border-stone-200/60 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={
                                isLoadingNtpPreview ||
                                loadingDocPreviewId === (liveRef?.id || cleanId)
                              }
                              onClick={() =>
                                handleOpenErpDocModal(
                                  rawType,
                                  liveRef?.id || cleanId,
                                )
                              }
                              className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold text-white bg-stone-900 hover:bg-stone-800 px-3 py-1.5 rounded-xl transition-colors cursor-pointer shadow-2xs disabled:opacity-60"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>
                                {loadingDocPreviewId === (liveRef?.id || cleanId) ||
                                (isNtpOrProject && isLoadingNtpPreview)
                                  ? "Opening Preview..."
                                  : isNtpOrProject
                                    ? "Preview NTP Document"
                                    : "Open Document"}
                              </span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {canDirectAuthorize && isCurrentUserManager && (
                              <button
                                type="button"
                                onClick={() =>
                                  setAuthModalDoc({
                                    type: rawType,
                                    id: cleanId,
                                    docNumber: liveRef?.doc_number || cleanId,
                                    title: rawTitle,
                                    status: currentStatus,
                                    amount: currentAmount,
                                    partnerName: currentPartner,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-extrabold shadow-2xs transition-all cursor-pointer"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Direct Authorize</span>
                              </button>
                            )}

                            {canDirectAuthorize && !isCurrentUserManager && (
                              <button
                                type="button"
                                onClick={() =>
                                  openShareModal({
                                    type: rawType,
                                    id: cleanId,
                                    title: rawTitle,
                                    status: currentStatus,
                                    amount: currentAmount,
                                    partnerName: currentPartner,
                                    urgency: currentUrgency,
                                    requiresAuth: true,
                                    url: getDocLink(),
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 text-[10px] font-bold transition-colors cursor-pointer"
                              >
                                <ShieldCheck className="w-3 h-3 text-amber-600" />
                                <span>Forward to Manager</span>
                              </button>
                            )}

                            {!canDirectAuthorize &&
                              ["AUTHORIZED", "ISSUED", "APPROVED"].includes(
                                currentStatus,
                              ) && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 px-2 py-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />{" "}
                                  Authorized
                                </span>
                              )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const isFinancialAuthorized = attachedDocType
                    ? canViewDocFinancials(user, attachedDocType)
                    : canViewDocFinancials(user, "GENERAL");

                  const sanitizedContent = isFinancialAuthorized
                    ? contentToParse
                    : maskPriceText(contentToParse);

                  const regex =
                    /(PR-[\w\d\-]+|PO-[\w\d\-]+|PROJ-[\w\d\-]+|PRJ-[\w\d\-]+|WO-[\w\d\-]+|REQ-[\w\d\-]+)/g;

                  const processedContent = sanitizedContent.replace(
                    regex,
                    (match) => {
                      let link = "#";
                      if (
                        match.startsWith("PROJ-") ||
                        match.startsWith("PRJ-")
                      ) {
                        link = `/projects/${match}`;
                      } else if (
                        match.startsWith("PR-") ||
                        match.startsWith("REQ-")
                      ) {
                        link = `/engineering?tab=pr&highlight=${match}`;
                      } else if (match.startsWith("PO-")) {
                        link = `/procurement?tab=po&highlight=${match}`;
                      } else if (match.startsWith("WO-")) {
                        link = `/production?wo=${match}`;
                      }
                      return `[${match}](${link})`;
                    },
                  );

                  return (
                    <div className="flex flex-col">
                      {sanitizedContent && (
                        <div className="leading-relaxed prose prose-stone prose-sm max-w-none">
                          <ReactMarkdown
                            components={{
                              a: ({ node, ...props }) => {
                                const isInternalLink = (
                                  props.children as string
                                )?.match?.(regex);
                                if (isInternalLink) {
                                  let icon = null;
                                  const part = props.children as string;
                                  if (
                                    part.startsWith("PROJ-") ||
                                    part.startsWith("PRJ-")
                                  ) {
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenNtpModal(part)}
                                        title="Preview Notice to Proceed (NTP)"
                                        className={cn(
                                          "inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded border transition-colors no-underline border-stone-200 cursor-pointer",
                                          isMine
                                            ? "bg-white text-stone-700 hover:bg-stone-50"
                                            : "bg-stone-100/80 text-stone-900 hover:bg-white",
                                        )}
                                      >
                                        <span className="text-stone-500">
                                          <Briefcase className="w-3.5 h-3.5" />
                                        </span>
                                        <span className="font-semibold text-xs tracking-tight font-mono">
                                          {part}
                                        </span>
                                      </button>
                                    );
                                  }
                                  let inferredType = "PROJECT";
                                  if (
                                    part.startsWith("PR-") ||
                                    part.startsWith("REQ-")
                                  ) {
                                    inferredType = "PR";
                                    icon = (
                                      <ClipboardList className="w-3.5 h-3.5" />
                                    );
                                  } else if (part.startsWith("PO-")) {
                                    inferredType = "PO";
                                    icon = (
                                      <ShoppingCart className="w-3.5 h-3.5" />
                                    );
                                  } else if (part.startsWith("WO-")) {
                                    inferredType = "WO";
                                    icon = (
                                      <Settings className="w-3.5 h-3.5" />
                                    );
                                  }

                                  return (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenErpDocModal(inferredType, part)
                                      }
                                      title={`Preview ${part} in Messages`}
                                      className={cn(
                                        "inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded border transition-colors no-underline border-stone-200 cursor-pointer",
                                        isMine
                                          ? "bg-white text-stone-700 hover:bg-stone-50"
                                          : "bg-stone-100/80 text-stone-900 hover:bg-white",
                                      )}
                                    >
                                      <span className="text-stone-500">
                                        {icon}
                                      </span>
                                      <span className="font-semibold text-xs tracking-tight font-mono">
                                        {part}
                                      </span>
                                    </button>
                                  );
                                }
                                return (
                                  <a
                                    {...props}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 hover:underline"
                                  />
                                );
                              },
                              p: ({ children }) => (
                                <p className="mb-0 last:mb-0 whitespace-pre-wrap">
                                  {children}
                                </p>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-bold text-stone-900">
                                  {children}
                                </strong>
                              ),
                              em: ({ children }) => (
                                <em className="italic">{children}</em>
                              ),
                            }}
                          >
                            {processedContent}
                          </ReactMarkdown>
                        </div>
                      )}
                      {sharedBlock}
                    </div>
                  );
                })()}
              </div>

              {/* Timestamp & Read Receipt */}
              <div className="flex items-center gap-2 mt-0.5 px-1">
                <span className="text-[9px] text-stone-400 font-bold uppercase tracking-tight">
                  {formatMsgTime(msg.created_at)}
                </span>
                {isMine && !msg.is_deleted && (
                  <span className="shrink-0">
                    {(() => {
                      let readObj = [];
                      try {
                        readObj = JSON.parse(msg.read_by || "[]");
                      } catch (e) {}
                      const isRead = readObj.length > 0;
                      return isRead ? (
                        <svg
                          className="w-3.5 h-3.5 text-emerald-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M18 6 7 17l-5-5" />
                          <path d="m22 10-7.5 7.5L13 16" />
                        </svg>
                      ) : (
                        <svg
                          className="w-3.5 h-3.5 text-stone-300"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      );
                    })()}
                  </span>
                )}
              </div>
            </div>

            {/* Message Hover Action Controls: Reply, Forward, Pin, Delete */}
            {!msg.is_deleted && (
              <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 flex items-center gap-1 self-center pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setReplyingTo(msg)}
                  className="p-1.5 bg-white border border-stone-200 hover:border-stone-300 shadow-2xs text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-50 transition-all cursor-pointer"
                  title="Reply to message"
                >
                  <Reply className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenForwardModal(msg)}
                  className="p-1.5 bg-white border border-stone-200 hover:border-stone-300 shadow-2xs text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-50 transition-all cursor-pointer"
                  title="Forward message"
                >
                  <CornerUpRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleTogglePin(msg)}
                  className={cn(
                    "p-1.5 bg-white border shadow-2xs rounded-lg transition-all cursor-pointer",
                    msg.is_pinned
                      ? "border-amber-300 text-amber-600 bg-amber-50"
                      : "border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50",
                  )}
                  title={
                    msg.is_pinned
                      ? "Unpin message"
                      : "Pin important message"
                  }
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
                {(isMine || isCurrentUserManager) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(msg.id)}
                    className="w-7 h-7 flex items-center justify-center bg-rose-50 border border-rose-200/70 shadow-2xs text-rose-600 rounded-lg hover:bg-rose-100 hover:text-rose-700 transition-all cursor-pointer"
                    title="Delete message"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
});
