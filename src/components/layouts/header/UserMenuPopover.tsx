import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  LogOut,
  MessageSquare,
  Bell,
  CheckCircle2,
  AlertCircle,
  Info,
  ExternalLink,
  Trash2,
  Briefcase,
  ClipboardList,
  ShoppingCart,
  FileCheck,
  Key,
  Eye,
  EyeOff,
  Copy,
  Check,
  ShieldCheck,
  Moon,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDailyAuthKey } from "@/utils/auth";
import { copyToClipboard } from "@/utils/clipboard";
import { useToast } from "@/contexts/ToastContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";

export interface UserMenuPopoverProps {
  user: any;
  logout: () => void;
  unreadCount: number;
  historyCount: number;
  notifications: any[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  showUserMenu: boolean;
  setShowUserMenu: React.Dispatch<React.SetStateAction<boolean>>;
  userMenuRef: React.RefObject<HTMLDivElement | null>;
}

export const UserMenuPopover = React.memo(function UserMenuPopover({
  user,
  logout,
  unreadCount,
  historyCount,
  notifications,
  markAsRead,
  markAllAsRead,
  clearAll,
  showUserMenu,
  setShowUserMenu,
  userMenuRef,
}: UserMenuPopoverProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { isDark, toggleTheme } = useTheme();
  const [showAuthKey, setShowAuthKey] = useState(false);
  const [copiedAuthKey, setCopiedAuthKey] = useState(false);

  const handleCopyAuthKey = useCallback(async () => {
    const key = getDailyAuthKey(user?.username);
    const ok = await copyToClipboard(key);
    if (ok) {
      setCopiedAuthKey(true);
      showToast("Daily Auth Key copied to clipboard", "success");
      setTimeout(() => setCopiedAuthKey(false), 2000);
    }
  }, [user?.username, showToast]);

  if (!user) return null;

  return (
    <div className="relative" ref={userMenuRef}>
      <button
        onClick={() => setShowUserMenu((prev) => !prev)}
        className={cn(
          "flex items-center gap-2 sm:gap-2.5 px-1.5 py-1 transition-all rounded-full group relative",
          showUserMenu
            ? "bg-stone-100 ring-2 ring-stone-100"
            : "hover:bg-stone-50",
        )}
      >
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white border border-stone-200/60 flex items-center justify-center shadow-2xs relative z-10">
          <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center relative">
            <div className="absolute inset-0 bg-stone-800 opacity-0 group-hover:opacity-5 transition-opacity" />
            <span className="text-[10.5px] sm:text-[11px] font-bold text-stone-800 tracking-tight relative z-20">
              {String(user?.username || "US")
                .substring(0, 2)
                .toUpperCase()}
            </span>
          </div>
          {unreadCount > 0 ? (
            <span
              title={`${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}
              className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 bg-rose-600 text-white border-2 border-white rounded-full flex items-center justify-center text-[9px] font-black leading-none shadow-xs z-30"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : historyCount > 0 ? (
            <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-stone-900 border-2 border-white rounded-full z-30" />
          ) : null}
        </div>
        <div className="hidden md:flex items-center gap-1.5 pr-3">
          <span className="text-[11px] font-bold text-stone-900 uppercase tracking-[0.1em]">
            {String(user?.username || "User")}
          </span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-rose-50 border border-rose-200/80 text-rose-700 text-[9px] font-extrabold tracking-tight leading-none">
              {unreadCount} Unread
            </span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {showUserMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-0 mt-2.5 w-72 sm:w-80 bg-white rounded-2xl border border-stone-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.12)] z-[100] overflow-hidden"
          >
            {/* User Profile Header & Unread Message Indicator */}
            <div className="px-4 py-3.5 border-b border-stone-100 bg-stone-50/70 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-stone-900 text-white flex items-center justify-center text-xs font-bold shrink-0 relative">
                    {String(user?.username || "US")
                      .substring(0, 2)
                      .toUpperCase()}
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 bg-rose-500 text-white border-2 border-white rounded-full flex items-center justify-center text-[8px] font-black leading-none">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-stone-900 truncate">
                      {user?.name || user?.username}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 truncate">
                      {user?.role} · {user?.level || "STAFF"}
                    </p>
                  </div>
                </div>
              </div>

              <Link
                to="/forum"
                onClick={() => setShowUserMenu(false)}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-xl border text-[11px] font-bold transition-all",
                  unreadCount > 0
                    ? "bg-rose-50/90 border-rose-200/80 text-rose-800 hover:bg-rose-100/80"
                    : "bg-white border-stone-200/70 text-stone-600 hover:bg-stone-100/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare
                    className={cn(
                      "w-3.5 h-3.5",
                      unreadCount > 0 ? "text-rose-600" : "text-stone-400",
                    )}
                  />
                  <span>
                    {unreadCount > 0
                      ? `${unreadCount} Unread Message${unreadCount === 1 ? "" : "s"}`
                      : "No Unread Messages"}
                  </span>
                </div>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                    unreadCount > 0
                      ? "bg-rose-600 text-white"
                      : "bg-stone-100 text-stone-500",
                  )}
                >
                  {unreadCount > 0 ? "Open Chat" : "Inbox"}
                </span>
              </Link>
            </div>

            <div className="p-5 border-b border-stone-50 bg-stone-50/30">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
                  {t("Activity & Notifications")}
                </h3>
                <div className="flex items-center gap-3">
                  {historyCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-[9px] font-bold text-stone-900 hover:text-stone-700 uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      {t("Mark all Read")}
                    </button>
                  )}
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-1.5 text-[9px] font-bold text-stone-400 hover:text-stone-900 uppercase tracking-widest transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> {t("Clear All")}
                  </button>
                </div>
              </div>

              <div className="max-h-[320px] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                {!notifications || notifications.length === 0 ? (
                  <div className="text-center py-10">
                    <Bell className="w-8 h-8 text-stone-200 mx-auto mb-3" />
                    <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">
                      {t("No activity history")}
                    </p>
                  </div>
                ) : (
                  notifications.map((notif, index) => {
                    if (!notif) return null;
                    const safeId = notif.id || `notif-${index}`;
                    const safeTitle =
                      typeof notif.title === "string"
                        ? notif.title
                        : String(notif.title || "Notification");
                    const safeMsg =
                      typeof notif.message === "string"
                        ? notif.message
                        : String(notif.message || "");

                    let formattedTime = "--:--";
                    try {
                      const d =
                        notif.timestamp instanceof Date
                          ? notif.timestamp
                          : new Date(notif.timestamp);
                      if (!isNaN(d.getTime())) {
                        formattedTime = d.toLocaleTimeString("en-US", {
                          timeZone: "Asia/Jakarta",
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                      }
                    } catch {
                      formattedTime = "--:--";
                    }

                    return (
                      <div
                        key={safeId}
                        onClick={() => notif.id && markAsRead(notif.id)}
                        className={cn(
                          "p-3 rounded-2xl border transition-all flex gap-3 group relative cursor-default",
                          notif.isRead
                            ? "bg-transparent border-transparent grayscale-[0.5] opacity-60"
                            : "bg-white border-stone-100 shadow-sm ring-1 ring-stone-900/5",
                        )}
                      >
                        {!notif.isRead && (
                          <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-stone-800 rounded-full" />
                        )}
                        <div
                          className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border",
                            notif.type === "SUCCESS"
                              ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                              : notif.type === "ERROR"
                                ? "bg-red-50 border-red-100 text-red-600"
                                : notif.type === "CHAT"
                                  ? "bg-amber-50 border-amber-100 text-amber-600"
                                  : "bg-blue-50 border-blue-100 text-blue-600",
                          )}
                        >
                          {notif.type === "SUCCESS" && (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          {notif.type === "ERROR" && (
                            <AlertCircle className="w-4 h-4" />
                          )}
                          {notif.type === "CHAT" && (
                            <MessageSquare className="w-4 h-4" />
                          )}
                          {notif.type !== "SUCCESS" &&
                            notif.type !== "ERROR" &&
                            notif.type !== "CHAT" && (
                              <Info className="w-4 h-4" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-stone-900 mb-0.5">
                            {safeTitle}
                          </p>
                          <div
                            className="text-[10px] text-stone-500 line-clamp-2 leading-relaxed mb-2"
                            title={safeMsg}
                          >
                            {(() => {
                              try {
                                const sharedMatch = safeMsg.match(
                                  /🔗 \*Shared Resource: (.*?)\* \((NTP|PROJECT|PR|PO|QUOTATION|INVOICE|GRN|WO|REQ)\) #([^\n\r|]+)/s,
                                );
                                if (sharedMatch) {
                                  const [fullMatch, title, type] = sharedMatch;
                                  const textBefore = safeMsg
                                    .replace(fullMatch, "")
                                    .trim();
                                  return (
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      {textBefore && (
                                        <span className="truncate">
                                          {textBefore}
                                        </span>
                                      )}
                                      <span className="flex items-center gap-1 font-medium bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded w-fit text-[9px] uppercase tracking-widest">
                                        {type === "NTP" && (
                                          <FileCheck className="w-2.5 h-2.5 text-teal-600" />
                                        )}
                                        {type === "PROJECT" && (
                                          <Briefcase className="w-2.5 h-2.5" />
                                        )}
                                        {type === "PR" && (
                                          <ClipboardList className="w-2.5 h-2.5" />
                                        )}
                                        {type === "PO" && (
                                          <ShoppingCart className="w-2.5 h-2.5" />
                                        )}
                                        Attached {type}: {title}
                                      </span>
                                    </div>
                                  );
                                }
                              } catch {
                                // fallback to plain text
                              }
                              return safeMsg;
                            })()}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-stone-400 font-bold uppercase tracking-tight font-mono">
                              {formattedTime}
                            </span>
                            {notif.link && (
                              <Link
                                to={String(notif.link)}
                                className="text-[9px] text-stone-900 font-bold uppercase tracking-widest hover:underline flex items-center gap-1"
                              >
                                View <ExternalLink className="w-2.5 h-2.5" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Appearance / Dark Mode Toggle */}
            <div className="px-4 py-3.5 border-t border-stone-100 bg-stone-50/40">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-colors",
                      isDark
                        ? "bg-stone-800 border-stone-700 text-stone-200"
                        : "bg-white border-stone-200/80 text-stone-700 shadow-2xs",
                    )}
                  >
                    {isDark ? (
                      <Moon className="w-4 h-4 stroke-[1.8]" />
                    ) : (
                      <Sun className="w-4 h-4 stroke-[1.8]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-stone-900 tracking-tight">
                      {isDark ? "Dark Mode" : "Light Mode"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isDark}
                  aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                  onClick={(e) => toggleTheme(e)}
                  className="theme-toggle-switch"
                >
                  <span className="theme-toggle-thumb">
                    {isDark ? (
                      <Moon
                        key="moon"
                        className="w-3.5 h-3.5 stroke-[2] theme-toggle-icon-anim"
                      />
                    ) : (
                      <Sun
                        key="sun"
                        className="w-3.5 h-3.5 stroke-[2] theme-toggle-icon-anim"
                      />
                    )}
                  </span>
                </button>
              </div>
            </div>

            <div className="px-4 py-3.5 border-t border-stone-100 bg-stone-50/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-stone-600">
                    Daily Auth Key
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-md">
                  <ShieldCheck className="w-2.5 h-2.5" /> Active
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 bg-white border border-stone-200/80 rounded-xl px-3 py-2 shadow-2xs">
                <span className="font-mono text-sm font-black tracking-[0.25em] text-stone-900 select-all">
                  {showAuthKey ? getDailyAuthKey(user?.username) : "••••••"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowAuthKey((prev) => !prev)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
                    title={showAuthKey ? "Hide Auth Key" : "Show Auth Key"}
                  >
                    {showAuthKey ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyAuthKey}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
                    title="Copy Auth Key"
                  >
                    {copiedAuthKey ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-2 border-t border-stone-50">
              <button
                onClick={logout}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-50 text-stone-600 hover:text-red-600 transition-all rounded-2xl group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-stone-50 border border-stone-100 flex items-center justify-center group-hover:bg-red-100 group-hover:border-red-200 transition-colors">
                    <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                  </div>
                  <span className="text-[13px] font-bold tracking-tight">
                    Sign Out
                  </span>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-[0.2em] opacity-30 group-hover:opacity-100 transition-opacity">
                  Session Exit
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
