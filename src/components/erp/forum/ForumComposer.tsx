import React from "react";
import {
  Reply,
  X,
  File,
  Paperclip,
  Briefcase,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message, ErpRefItem } from "@/pages/erp/core/forumTypes";

interface ForumComposerProps {
  replyingTo: Message | null;
  setReplyingTo: React.Dispatch<React.SetStateAction<Message | null>>;
  stripMarkdown: (text: string) => string;
  attachedErpDoc: ErpRefItem | null;
  setAttachedErpDoc: React.Dispatch<React.SetStateAction<ErpRefItem | null>>;
  attachedErpNeedsAuth: boolean;
  setAttachedErpNeedsAuth: React.Dispatch<React.SetStateAction<boolean>>;
  attachingFile: File | null;
  setAttachingFile: React.Dispatch<React.SetStateAction<File | null>>;
  attachingPreviewUrl: string | null;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setErpPickerSearch: React.Dispatch<React.SetStateAction<string>>;
  setShowErpPicker: React.Dispatch<React.SetStateAction<boolean>>;
  newMessage: string;
  setNewMessage: React.Dispatch<React.SetStateAction<string>>;
  handleSendMessage: (e: React.FormEvent) => void;
}

export const ForumComposer = React.memo(function ForumComposer({
  replyingTo,
  setReplyingTo,
  stripMarkdown,
  attachedErpDoc,
  setAttachedErpDoc,
  attachedErpNeedsAuth,
  setAttachedErpNeedsAuth,
  attachingFile,
  setAttachingFile,
  attachingPreviewUrl,
  uploading,
  fileInputRef,
  setErpPickerSearch,
  setShowErpPicker,
  newMessage,
  setNewMessage,
  handleSendMessage,
}: ForumComposerProps) {
  return (
    <div className="p-2.5 sm:p-3.5 bg-white border-t border-stone-200/80 shrink-0 space-y-2">
      {/* Replying To Preview Banner */}
      {replyingTo && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-stone-50 border-l-3 border-emerald-600 rounded-xl text-xs">
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-[10px] uppercase tracking-wider text-emerald-700 flex items-center gap-1">
              <Reply className="w-3 h-3" />
              <span>Replying to @{replyingTo.sender_username}</span>
            </div>
            <p className="text-stone-500 truncate text-[11px]">
              {stripMarkdown(replyingTo.content) ||
                replyingTo.file_name ||
                "Attachment"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="p-1 text-stone-400 hover:text-stone-700 rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attached ERP Document Preview in Composer */}
      {attachedErpDoc && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-stone-50 border border-stone-200/80 rounded-xl">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center shrink-0 text-stone-700 font-bold text-[10px]">
              {attachedErpDoc.type}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-stone-900 truncate">
                {attachedErpDoc.title}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-stone-500">
                  Status: {attachedErpDoc.status}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAttachedErpNeedsAuth(!attachedErpNeedsAuth)
                  }
                  className={cn(
                    "px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase tracking-wider border cursor-pointer",
                    attachedErpNeedsAuth
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-stone-600 border-stone-200",
                  )}
                >
                  {attachedErpNeedsAuth
                    ? "✓ Request Manager Auth"
                    : "+ Request Auth"}
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAttachedErpDoc(null)}
            className="p-1 text-stone-400 hover:text-stone-800 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Attached File / Image Thumbnail Preview in Composer */}
      {attachingFile && (
        <div className="flex items-center bg-stone-50 border border-stone-200/80 rounded-2xl p-2.5 max-w-full w-fit pr-3.5 gap-3 shadow-2xs">
          {attachingPreviewUrl ? (
            <img
              src={attachingPreviewUrl}
              alt={attachingFile.name}
              className="w-12 h-12 rounded-xl object-cover border border-stone-200 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
              <File className="w-4 h-4 text-stone-500" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-stone-800 truncate max-w-[220px]">
              {attachingFile.name}
            </p>
            <p className="text-[10px] text-stone-400 font-semibold uppercase font-mono">
              {(attachingFile.size / 1024).toFixed(1)} KB{" "}
              {attachingPreviewUrl ? "• Image Ready to Send" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAttachingFile(null)}
            className="p-1.5 hover:bg-stone-200 hover:text-stone-900 rounded-lg text-stone-400 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form
        onSubmit={handleSendMessage}
        className="flex items-center gap-1.5 sm:gap-2 min-w-0"
      >
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 sm:p-3 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
          title="Attach Image or File"
        >
          <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <button
          type="button"
          disabled={uploading}
          onClick={() => {
            setErpPickerSearch("");
            setShowErpPicker(true);
          }}
          className="p-2.5 sm:p-3 text-stone-700 bg-stone-100/80 hover:bg-stone-200/70 border border-stone-200/80 rounded-xl transition-colors disabled:opacity-50 shrink-0 cursor-pointer flex items-center gap-1"
          title="Attach ERP Document (PR, PO, Project, Quotation, Invoice)"
        >
          <Briefcase className="w-4 h-4" />
          <span className="hidden xl:inline text-[10px] font-extrabold uppercase tracking-wider">
            ERP Doc
          </span>
        </button>

        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Write a message, type PR-123, or attach an ERP document..."
          className="flex-1 min-w-0 bg-stone-50 border border-stone-200/80 hover:border-stone-300 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-medium text-stone-900 placeholder:text-stone-400 focus:bg-white focus:border-stone-400 outline-none transition-all"
          disabled={uploading}
        />

        <button
          type="submit"
          disabled={
            (!newMessage.trim() && !attachingFile && !attachedErpDoc) ||
            uploading
          }
          className="px-3.5 py-2.5 sm:px-5 sm:py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-all shadow-xs flex items-center justify-center shrink-0 cursor-pointer"
        >
          {uploading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4 sm:mr-1.5" />
              <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">
                Send
              </span>
            </>
          )}
        </button>
      </form>
    </div>
  );
});
