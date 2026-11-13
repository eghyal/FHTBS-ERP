import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Factory,
  FileText,
  FolderKanban,
  Globe,
  Home,
  Key,
  Landmark,
  Layers,
  LayoutGrid,
  Lock,
  LogOut,
  MessageSquare,
  Monitor,
  Package,
  ShoppingCart,
  Tag,
  Trash2,
  Truck,
  UserCheck,
  Users,
  X,
  Zap,
  Moon,
  Sun,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/contexts/ToastContext";
import { useMobileMonitoring } from "@/contexts/MonitoringContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Action,
  getRoleMonitoringProfile,
  hasDesktopPermission,
  hasGodMode,
} from "@/utils/pbac";
import { getDailyAuthKey } from "@/utils/auth";
import { copyToClipboard } from "@/utils/clipboard";
import {
  DesktopModeNoticeModal,
  DesktopModeRequiredPage,
} from "@/components/mobile/DesktopModeNotice";
import {
  MobileMonitorHub,
  HubCategory,
} from "@/components/mobile/MobileMonitorHub";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { cn } from "@/lib/utils";

interface MobileAppShellProps {
  children: React.ReactNode;
  unreadForumCount?: number;
}

export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  children,
  unreadForumCount = 0,
}) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isDark, toggleTheme, appLogo } = useTheme();
  const {
    notifications,
    unreadCount: notifUnreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();
  const {
    isDesktopHeavyRoute,
    openDesktopNotice,
    enableForceDesktopMode,
  } = useMobileMonitoring();

  const [isLauncherOpen, setIsLauncherOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [showAuthKey, setShowAuthKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const role = user?.role || "SALES";
  const isExecutive = hasGodMode(user);
  const profile = getRoleMonitoringProfile(role);

  const searchParams = new URLSearchParams(location.search);
  const isForumActive = location.pathname.startsWith("/forum");
  const isEssActive = location.pathname.startsWith("/ess");

  // Map legacy table routes directly to touch-optimized MobileMonitorHub categories (zero horizontal tables)
  const getMappedHubCategory = (pathname: string): HubCategory | null => {
    if (pathname.startsWith("/quotations")) return "QUOTATIONS";
    if (pathname.startsWith("/warehouse")) return "INVENTORY";
    if (pathname.startsWith("/production")) return "PROJECTS";
    if (pathname.startsWith("/procurement")) return "PROCUREMENT";
    if (pathname.startsWith("/deliveries")) return "DELIVERIES";
    if (pathname.startsWith("/customers") || pathname.startsWith("/vendors")) {
      return "CONTACTS";
    }
    if (pathname.startsWith("/finance")) return "FINANCE";
    return null;
  };

  const mappedHubCategory = getMappedHubCategory(location.pathname);

  const isHubTabActive =
    (location.pathname === "/erp" &&
      (searchParams.get("tab") === "hub" || Boolean(searchParams.get("cat")))) ||
    Boolean(mappedHubCategory);
  const isHomeTabActive =
    location.pathname === "/erp" && !isHubTabActive;

  const getScreenTitle = () => {
    if (isHubTabActive) return profile.hubLabelEn;
    if (isHomeTabActive) return "Paving Joss Mobile";
    if (isForumActive) return "Messages";
    if (isEssActive) return "HR Portal";
    return "ERP Mobile";
  };

  const handleCopyAuthKey = async () => {
    if (!user) return;
    const key = getDailyAuthKey(user.username);
    const ok = await copyToClipboard(key);
    if (ok) {
      setCopiedKey(true);
      showToast("Daily PIN copied", "success");
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  // Categorized modules for the App Launcher Sheet (All English, Touch-Optimized Cards)
  const mobileModules = [
    {
      name: "Home Overview",
      desc: "KPIs & Approvals",
      path: "/erp",
      icon: Home,
      show: true,
    },
    {
      name: profile.hubLabelEn,
      desc: "Action Hub",
      path: "/erp?tab=hub",
      icon: Zap,
      show: true,
    },
    {
      name: "Team Messages",
      desc: "Channels & Chat",
      path: "/forum",
      icon: MessageSquare,
      show: true,
    },
    {
      name: "HR Portal",
      desc: "Attendance & Leave",
      path: "/ess",
      icon: UserCheck,
      show: true,
    },
    {
      name: "Quotations",
      desc: "Sales Pipeline",
      path: "/erp?tab=hub&cat=QUOTATIONS",
      icon: FileText,
      show: hasDesktopPermission(user, Action.VIEW_QUOTATIONS) || isExecutive,
    },
    {
      name: "Warehouse Stock",
      desc: "SKU Lookup",
      path: "/erp?tab=hub&cat=INVENTORY",
      icon: Package,
      show: hasDesktopPermission(user, Action.VIEW_WAREHOUSE) || isExecutive,
    },
    {
      name: "Active Projects",
      desc: "NTP & Deadlines",
      path: "/erp?tab=hub&cat=PROJECTS",
      icon: Factory,
      show: true,
    },
    {
      name: "PR & PO Queue",
      desc: "Procurement Docs",
      path: "/erp?tab=hub&cat=PROCUREMENT",
      icon: ShoppingCart,
      show: hasDesktopPermission(user, Action.VIEW_PROCUREMENT) || isExecutive,
    },
    {
      name: "Deliveries",
      desc: "Outbound Notes",
      path: "/erp?tab=hub&cat=DELIVERIES",
      icon: Truck,
      show: hasDesktopPermission(user, Action.VIEW_DELIVERIES) || isExecutive,
    },
    {
      name: "Contacts",
      desc: "Clients & Vendors",
      path: "/erp?tab=hub&cat=CONTACTS",
      icon: Users,
      show:
        hasDesktopPermission(user, Action.VIEW_CUSTOMERS) ||
        hasDesktopPermission(user, Action.VIEW_VENDORS) ||
        isExecutive,
    },
    {
      name: "Finance Summary",
      desc: "Revenue & COGS",
      path: "/erp?tab=hub&cat=FINANCE",
      icon: Landmark,
      show: hasDesktopPermission(user, Action.VIEW_FINANCE) || isExecutive,
    },
  ].filter((m) => m.show);

  const desktopOnlyModules = [
    {
      name: "Document Studio",
      desc: "A4 Print Editor",
      path: "/document-workspace",
      icon: FileText,
      show: true,
    },
    {
      name: "Engineering BOM",
      desc: "BOM & BOP Studio",
      path: "/engineering",
      icon: Layers,
      show: hasDesktopPermission(user, Action.VIEW_BOM),
    },
    {
      name: "Price Matrix",
      desc: "Vendor Pricing",
      path: "/pricing",
      icon: Tag,
      show: hasDesktopPermission(user, Action.VIEW_PRICING),
    },
    {
      name: "General Ledger",
      desc: "Journals & AR/AP",
      path: "/general-ledger",
      icon: Landmark,
      show: hasDesktopPermission(user, Action.VIEW_FINANCE),
    },
    {
      name: "Master Data",
      desc: "ERP Database",
      path: "/data-center",
      icon: FolderKanban,
      show: hasDesktopPermission(user, Action.VIEW_MASTER_DATA),
    },
    {
      name: "Access Control",
      desc: "RBAC Accounts",
      path: "/manage-accounts",
      icon: Lock,
      show: hasDesktopPermission(user, Action.MANAGE_ACCOUNTS),
    },
  ].filter((m) => m.show);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900 font-sans selection:bg-stone-200 selection:text-stone-900 overflow-x-hidden">
      {/* ================================================================= */}
      {/* 1. COMPACT MOBILE TOP APP BAR (56px, Sticky, Light Theme)         */}
      {/* ================================================================= */}
      <header className="sticky top-0 z-40 h-14 bg-white/95 backdrop-blur-md border-b border-stone-200/80 px-3.5 flex items-center justify-between gap-2 shrink-0">
        {/* Left: Back Button or Brand Identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          {location.pathname !== "/erp" ? (
            <button
              type="button"
              onClick={() => navigate("/erp")}
              className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-700 shrink-0 transition-colors cursor-pointer"
              aria-label="Back to Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center shrink-0 shadow-2xs">
              <img
                src={appLogo}
                alt="Paving Joss Logo"
                onError={(e) => {
                  e.currentTarget.src = "/logo.png";
                }}
                className="w-5 h-5 object-contain"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            </div>
          )}

          <div className="min-w-0">
            <div className="text-sm font-bold text-stone-900 truncate leading-tight">
              {getScreenTitle()}
            </div>
            <div className="text-[10px] font-mono font-semibold text-stone-500 truncate">
              {role} · {isExecutive ? "EXEC" : user?.level || "STAFF"}
            </div>
          </div>
        </div>

        {/* Right: Actions (System Info & Daily Auth Key, Notifications) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsLauncherOpen(true)}
            className="h-9 px-2.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 border border-stone-200/80 text-stone-700 text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title="System Info & Daily Auth Key"
          >
            <Key className="w-3.5 h-3.5 text-stone-700" />
            <span className="hidden xs:inline">System Info</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNotifOpen(true)}
            className="relative w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-700 transition-colors cursor-pointer"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {notifUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-stone-900 text-white text-[9px] font-mono font-bold flex items-center justify-center">
                {notifUnreadCount > 9 ? "9+" : notifUnreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ================================================================= */}
      {/* 2. SCROLLABLE MOBILE APP VIEWPORT                                 */}
      {/* ================================================================= */}
      <main
        className={cn(
          "flex-1 w-full mx-auto overflow-x-hidden",
          isForumActive
            ? "max-w-3xl px-2.5 sm:px-4 pt-2.5 pb-20"
            : "max-w-lg md:max-w-2xl px-3 pt-3 pb-24",
        )}
      >
        {isDesktopHeavyRoute ? (
          <DesktopModeRequiredPage />
        ) : mappedHubCategory ? (
          <MobileMonitorHub
            defaultTab="ROLE_HUB"
            initialCategory={mappedHubCategory}
          />
        ) : (
          children
        )}
      </main>

      {/* ================================================================= */}
      {/* 3. FIXED 4-TAB BOTTOM NAVIGATION BAR (64px, No Redundant Menu)    */}
      {/* ================================================================= */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 shadow-lg">
        <div className="max-w-lg mx-auto grid grid-cols-4 items-center h-16 px-1">
          {/* Tab 1: Home Dashboard */}
          <Link
            to="/erp"
            onClick={() => setIsLauncherOpen(false)}
            className={cn(
              "min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors",
              isHomeTabActive && !isLauncherOpen
                ? "text-stone-900 font-bold"
                : "text-stone-400 hover:text-stone-700 font-medium",
            )}
          >
            <div
              className={cn(
                "px-3 py-1 rounded-full transition-colors",
                isHomeTabActive && !isLauncherOpen
                  ? "bg-stone-100 text-stone-900"
                  : "",
              )}
            >
              <Home className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight leading-none">
              Home
            </span>
          </Link>

          {/* Tab 2: Dynamic Role Hub (Exec Hub) */}
          <Link
            to="/erp?tab=hub"
            onClick={() => setIsLauncherOpen(false)}
            className={cn(
              "min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors",
              isHubTabActive && !isLauncherOpen
                ? "text-stone-900 font-bold"
                : "text-stone-400 hover:text-stone-700 font-medium",
            )}
          >
            <div
              className={cn(
                "px-3 py-1 rounded-full transition-colors",
                isHubTabActive && !isLauncherOpen
                  ? "bg-stone-100 text-stone-900"
                  : "",
              )}
            >
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight leading-none truncate max-w-[72px]">
              {profile.hubLabelEn}
            </span>
          </Link>

          {/* Tab 3: Messages / Forum */}
          <Link
            to="/forum"
            onClick={() => setIsLauncherOpen(false)}
            className={cn(
              "relative min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors",
              isForumActive && !isLauncherOpen
                ? "text-stone-900 font-bold"
                : "text-stone-400 hover:text-stone-700 font-medium",
            )}
          >
            <div
              className={cn(
                "relative px-3 py-1 rounded-full transition-colors",
                isForumActive && !isLauncherOpen
                  ? "bg-stone-100 text-stone-900"
                  : "",
              )}
            >
              <MessageSquare className="w-4 h-4" />
              {unreadForumCount > 0 && (
                <span className="absolute -top-0.5 right-1 min-w-[14px] h-3.5 px-1 rounded-full bg-stone-900 text-white text-[8px] font-mono font-bold flex items-center justify-center">
                  {unreadForumCount > 9 ? "9+" : unreadForumCount}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight leading-none">
              Messages
            </span>
          </Link>

          {/* Tab 4: HR Self-Service (ESS) */}
          <Link
            to="/ess"
            onClick={() => setIsLauncherOpen(false)}
            className={cn(
              "min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors",
              isEssActive && !isLauncherOpen
                ? "text-stone-900 font-bold"
                : "text-stone-400 hover:text-stone-700 font-medium",
            )}
          >
            <div
              className={cn(
                "px-3 py-1 rounded-full transition-colors",
                isEssActive && !isLauncherOpen
                  ? "bg-stone-100 text-stone-900"
                  : "",
              )}
            >
              <UserCheck className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight leading-none">
              HR Portal
            </span>
          </Link>
        </div>
      </nav>

      {/* ================================================================= */}
      {/* 4. SYSTEM INFO & DAILY AUTH KEY BOTTOM SHEET                      */}
      {/* ================================================================= */}
      <AnimatePresence>
        {isLauncherOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs"
              onClick={() => setIsLauncherOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="relative z-10 w-full max-w-lg bg-white rounded-t-3xl shadow-2xl border-t border-stone-200 max-h-[85vh] overflow-y-auto p-5 pb-24 space-y-4"
            >
              <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto -mt-1" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    System Info & Security
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Daily Authorization Key, account profile & viewport mode
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLauncherOpen(false)}
                  className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* User Profile Header (Monochrome Stone-900 Surface Matching Desktop) */}
              <div className="flex items-center justify-between gap-3 bg-stone-900 text-white p-3.5 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-white text-stone-900 font-black text-sm flex items-center justify-center shrink-0">
                    {(user?.name || user?.username || "U")
                      .substring(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {user?.name || user?.username}
                    </div>
                    <div className="text-[11px] font-mono text-stone-300">
                      {role} · {isExecutive ? "EXECUTIVE" : user?.level}
                    </div>
                  </div>
                </div>
              </div>

              {/* Daily Authorization Key Card (Moved to System Info) */}
              {user && (
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-stone-900 text-[#FFD700] flex items-center justify-center shrink-0">
                      <Key className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                        Daily 6-Digit Auth Key (PIN)
                      </div>
                      <div className="text-sm font-mono font-black text-stone-900 mt-0.5 tracking-widest">
                        {showAuthKey
                          ? getDailyAuthKey(user.username)
                          : "••••••"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowAuthKey((v) => !v)}
                      className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-600 cursor-pointer"
                      title={showAuthKey ? "Hide PIN" : "Show PIN"}
                    >
                      {showAuthKey ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyAuthKey}
                      className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-600 cursor-pointer"
                      title="Copy Daily PIN"
                    >
                      {copiedKey ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Appearance / Dark Mode Toggle Card */}
              <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-colors",
                      isDark
                        ? "bg-stone-800 border-stone-700 text-stone-200"
                        : "bg-white border-stone-200 text-stone-700 shadow-2xs",
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

              {/* System Mode Info */}
              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800">
                    Active Environment
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold">
                    MOBILE EXEC HUB
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  All operational modules (Quotations, Warehouse, Projects, Procurement, Deliveries, Contacts & Finance) are unified inside{" "}
                  <span className="font-bold text-stone-800">{profile.hubLabelEn}</span>.
                </p>
              </div>

              {/* Bottom Actions: Force Desktop Mode & Logout */}
              <div className="pt-2 border-t border-stone-200/70 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsLauncherOpen(false);
                    openDesktopNotice(
                      "System Info & Desktop Mode",
                      "View Daily Auth Key, role capabilities, or switch to full Desktop Web View.",
                    );
                  }}
                  className="w-full min-h-[44px] rounded-2xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Monitor className="w-4 h-4 text-stone-700" />
                  <span>Desktop Mode & Capability Details</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsLauncherOpen(false);
                    enableForceDesktopMode();
                  }}
                  className="w-full min-h-[44px] rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Monitor className="w-4 h-4 text-amber-600" />
                  <span>Force Switch to Desktop Web View</span>
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="w-full min-h-[44px] rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================================================================= */}
      {/* 5. NOTIFICATIONS BOTTOM SHEET                                     */}
      {/* ================================================================= */}
      <AnimatePresence>
        {isNotifOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs"
              onClick={() => setIsNotifOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="relative z-10 w-full max-w-lg bg-white rounded-t-3xl shadow-2xl border-t border-stone-200 max-h-[80vh] overflow-y-auto p-5 pb-10 space-y-4"
            >
              <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto -mt-1" />
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-stone-900">
                  System Notifications ({notifUnreadCount})
                </h3>
                <div className="flex items-center gap-2">
                  {notifications.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="text-xs font-semibold text-stone-900 hover:text-stone-700 cursor-pointer"
                      >
                        Mark all read
                      </button>
                      <button
                        type="button"
                        onClick={clearAll}
                        className="p-1.5 text-stone-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsNotifOpen(false)}
                    className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {notifications.length === 0 ? (
                <div className="py-12 text-center text-xs text-stone-400">
                  No new notifications.
                </div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {notifications.slice(0, 20).map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        markAsRead(n.id);
                        if (n.link) {
                          setIsNotifOpen(false);
                          navigate(n.link);
                        }
                      }}
                      className={cn(
                        "py-3 flex items-start gap-3 cursor-pointer",
                        !n.isRead && "bg-stone-50 -mx-2 px-2 rounded-xl",
                      )}
                    >
                      <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 className="w-4 h-4 text-stone-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-stone-900">
                          {n.title}
                        </div>
                        <div className="text-[11px] text-stone-600 mt-0.5 leading-relaxed">
                          {n.message}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <DesktopModeNoticeModal />
      <OfflineIndicator />
    </div>
  );
};
