import React from "react";
import { createPortal } from "react-dom";
import { Briefcase, ClipboardList, ShoppingCart, FileCheck } from "lucide-react";

export interface ChatNotificationData {
  id: string;
  sender: string;
  content: string;
  visible: boolean;
}

export interface ChatNotificationToastProps {
  chatNotification: ChatNotificationData | null;
  onDismiss: () => void;
}

export const ChatNotificationToast = React.memo(function ChatNotificationToast({
  chatNotification,
  onDismiss,
}: ChatNotificationToastProps) {
  if (
    !chatNotification ||
    !chatNotification.visible ||
    typeof document === "undefined"
  ) {
    return null;
  }

  return createPortal(
    <div
      className="fixed bottom-6 left-6 w-80 bg-white border border-stone-200 rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom-5 fade-in duration-300 flex items-start gap-4 hover:shadow-xl transition-shadow cursor-pointer isolate"
      style={{ zIndex: 2147483646 }}
      onClick={onDismiss}
    >
      <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center shrink-0 border border-stone-200">
        <span className="text-stone-500 font-semibold text-sm">
          {chatNotification.sender.substring(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-semibold text-stone-900 text-sm truncate">
            {chatNotification.sender}
          </h4>
          <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">
            New
          </span>
        </div>
        <p
          className="text-xs text-stone-500 truncate mt-0.5"
          title={chatNotification.content}
        >
          {(() => {
            const contentToParse = chatNotification.content || "";
            const sharedMatch = contentToParse.match(
              /🔗 \*Shared Resource: (.*)\* \((NTP|PROJECT|PR|PO|QUOTATION|INVOICE)\) #(.*)$/s,
            );
            if (sharedMatch) {
              const [fullMatch, , type] = sharedMatch;
              const textBefore = contentToParse.replace(fullMatch, "").trim();
              return (
                <span className="flex items-center gap-1.5 font-medium">
                  {textBefore && (
                    <span className="truncate max-w-[100px]">{textBefore}</span>
                  )}
                  <span className="shrink-0 flex items-center gap-1 bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded text-[10px]">
                    {type === "NTP" && <FileCheck className="w-3 h-3 text-teal-600" />}
                    {type === "PROJECT" && <Briefcase className="w-3 h-3" />}
                    {type === "PR" && <ClipboardList className="w-3 h-3" />}
                    {type === "PO" && <ShoppingCart className="w-3 h-3" />}
                    Shared {type}
                  </span>
                </span>
              );
            }
            return contentToParse.replace(/\n/g, " ");
          })()}
        </p>
      </div>
    </div>,
    document.body,
  );
});
