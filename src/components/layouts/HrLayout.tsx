import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/contexts/NotificationContext";
import {
  Users,
  Briefcase,
  Award,
  Repeat,
  LogOut,
  Clock,
  User,
  Home,
  Bell,
  CheckCircle2,
  CheckCheck,
  AlertCircle,
  Info,
  MessageSquare,
  Trash2,
  CalendarDays,
  DollarSign,
  UserCheck,
  PieChart,
  Pencil,
  ArrowUp,
  ArrowDown,
  Settings,
  LayoutGrid,
  X,
  Moon,
  Sun,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "@/contexts/ThemeContext";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme, appLogo } = useTheme();
  const {
    notifications,
    unreadCount: historyCount,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();

  const [time, setTime] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Live WIB clock (ERP HeaderClock standard)
  const updateTime = useCallback(() => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    setTime(new Intl.DateTimeFormat("en-GB", options).format(now));
  }, []);

  useEffect(() => {
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [updateTime]);

  // Click outside to close user dropdown & dock pop-up
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
      if (
        dockRef.current &&
        !dockRef.current.contains(event.target as Node)
      ) {
        setIsGridOpen(false);
        setIsEditDrawerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = () => {
    logout();
    window.location.href = "/hr-login";
  };

  const params = new URLSearchParams(location.search);
  const currentTab = params.get("tab") || "dashboard";

  const menuItems = [
    {
      id: "dashboard",
      name: "Overview",
      hint: "Pulse & KPI",
      icon: <PieChart className="w-6 h-6" />,
      accentBg: "bg-[#FFF2EE]",
      accentText: "text-[#F25730]",
      activeGrad: "from-[#F25730] to-[#FF7852]",
      glow: "shadow-[#F25730]/25",
    },
    {
      id: "directory",
      name: "Directory",
      hint: "Team & Salary",
      icon: <Users className="w-6 h-6" />,
      accentBg: "bg-emerald-50",
      accentText: "text-emerald-600",
      activeGrad: "from-emerald-500 to-teal-600",
      glow: "shadow-emerald-500/25",
    },
    {
      id: "attendance",
      name: "Attendance",
      hint: "Shifts & GPS",
      icon: <Clock className="w-6 h-6" />,
      accentBg: "bg-sky-50",
      accentText: "text-sky-600",
      activeGrad: "from-sky-500 to-blue-600",
      glow: "shadow-sky-500/25",
    },
    {
      id: "leave",
      name: "Time Off",
      hint: "Annual Leave",
      icon: <CalendarDays className="w-6 h-6" />,
      accentBg: "bg-amber-50",
      accentText: "text-amber-600",
      activeGrad: "from-amber-500 to-orange-500",
      glow: "shadow-amber-500/25",
    },
    {
      id: "payroll",
      name: "Payroll",
      hint: "PRq & Slips",
      icon: <DollarSign className="w-6 h-6" />,
      accentBg: "bg-emerald-50",
      accentText: "text-emerald-600",
      activeGrad: "from-[#059669] to-[#0D9488]",
      glow: "shadow-emerald-600/30",
    },
    {
      id: "vacancies",
      name: "Vacancies",
      hint: "Open Roles",
      icon: <Briefcase className="w-6 h-6" />,
      accentBg: "bg-rose-50",
      accentText: "text-rose-600",
      activeGrad: "from-rose-500 to-pink-600",
      glow: "shadow-rose-500/25",
    },
    {
      id: "candidates",
      name: "Candidates",
      hint: "Hiring Funnel",
      icon: <UserCheck className="w-6 h-6" />,
      accentBg: "bg-teal-50",
      accentText: "text-teal-600",
      activeGrad: "from-teal-500 to-emerald-600",
      glow: "shadow-teal-500/25",
    },
    {
      id: "kpi",
      name: "Appraisals",
      hint: "360° Review",
      icon: <Award className="w-6 h-6" />,
      accentBg: "bg-orange-50",
      accentText: "text-orange-600",
      activeGrad: "from-orange-500 to-[#F25730]",
      glow: "shadow-orange-500/25",
    },
    {
      id: "handover",
      name: "Offboarding",
      hint: "Clearance",
      icon: <Repeat className="w-6 h-6" />,
      accentBg: "bg-amber-50",
      accentText: "text-amber-700",
      activeGrad: "from-amber-600 to-orange-600",
      glow: "shadow-amber-600/25",
    },
    {
      id: "settings",
      name: "Portal CMS",
      hint: "Brand & Privacy",
      icon: <Settings className="w-6 h-6" />,
      accentBg: "bg-sky-50",
      accentText: "text-sky-600",
      activeGrad: "from-[#0284C7] to-[#2563EB]",
      glow: "shadow-sky-500/25",
    },
  ];

  const [menuOrder, setMenuOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem("hr_menu_order");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const updated = parsed.filter((id: string) => id !== "event");
          if (!updated.includes("settings")) updated.push("settings");
          return updated;
        }
      } catch {}
    }
    return menuItems.map((m) => m.id);
  });

  useEffect(() => {
    localStorage.setItem("hr_menu_order", JSON.stringify(menuOrder));
  }, [menuOrder]);

  const tabsToDisplay = menuOrder
    .map((id) => menuItems.find((i) => i.id === id)!)
    .filter(Boolean);

  // Primary 3 modules shown in the 3-column main dock bar:
  // Always shows the first 2 pinned modules + either the 3rd pinned module OR the active module if it's outside the top 3
  const primaryThreeTabs = React.useMemo(() => {
    const topThree = tabsToDisplay.slice(0, 3);
    if (topThree.some((t) => t.id === currentTab)) {
      return topThree;
    }
    const activeItem =
      tabsToDisplay.find((t) => t.id === currentTab) || topThree[2];
    return [topThree[0], topThree[1], activeItem].filter(Boolean);
  }, [tabsToDisplay, currentTab]);

  const moveCustomItem = (index: number, direction: "up" | "down") => {
    const newOrder = [...menuOrder];
    if (direction === "up" && index > 0) {
      [newOrder[index - 1], newOrder[index]] = [
        newOrder[index],
        newOrder[index - 1],
      ];
    } else if (direction === "down" && index < newOrder.length - 1) {
      [newOrder[index + 1], newOrder[index]] = [
        newOrder[index],
        newOrder[index + 1],
      ];
    }
    setMenuOrder(newOrder);
  };

  return (
    <div className="hris-theme h-screen bg-[#F5F5F8] dark:bg-[#0c0e13] text-[#121318] dark:text-[#eaedf5] font-sans selection:bg-[#FFE3DA] selection:text-[#F25730] flex overflow-hidden relative">
      {/* Multi-Layered Ambient Frosted Glass Backlight Blobs (Apple visionOS / Amie style) with Vibrant Aurora Glow in Dark Mode */}
      <div className="fixed top-[-15%] left-[-6%] w-[600px] h-[600px] bg-gradient-to-br from-[#FF7852]/22 via-[#FFC5B3]/20 to-amber-200/16 dark:from-[#FF5722]/35 dark:via-[#FF7852]/26 dark:to-amber-500/20 rounded-full blur-[140px] hris-blob-1 pointer-events-none z-0" />
      <div className="fixed top-[12%] right-[-8%] w-[540px] h-[540px] bg-gradient-to-bl from-emerald-400/20 via-teal-200/22 to-sky-200/18 dark:from-emerald-400/32 dark:via-teal-400/26 dark:to-cyan-400/20 rounded-full blur-[135px] hris-blob-2 pointer-events-none z-0" />
      <div className="fixed bottom-[-18%] left-[25%] w-[660px] h-[660px] bg-gradient-to-tr from-[#FF7852]/14 via-amber-200/16 to-emerald-300/16 dark:from-[#FF5722]/25 dark:via-teal-500/22 dark:to-emerald-400/25 rounded-full blur-[145px] hris-blob-1 pointer-events-none z-0" />

      {/* Main Scrollable Content Area */}
      <main
        ref={mainRef}
        className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar relative z-10 w-full"
      >
        {/* Minimal Airy Top Bar (NO Redundant Navigation Bar) */}
        <header className="sticky top-0 z-30 bg-white/55 backdrop-blur-2xl border-b border-white/80 shadow-[0_4px_24px_rgba(18,19,24,0.03)] w-full px-4 py-3 sm:px-6 md:px-10">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4">
            {/* Brand Identity — FHTBS "People & Culture" */}
            <Link to="/hr" className="flex items-center gap-3.5 group">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/90 backdrop-blur-xl border border-white shadow-[0_8px_20px_rgba(18,19,24,0.06)] flex items-center justify-center group-hover:scale-105 transition-transform">
                <img
                  src={appLogo}
                  alt="Logo"
                  onError={(e) => {
                    e.currentTarget.src = "/logo.png";
                  }}
                  className="w-6 h-6 object-contain"
                />
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg sm:text-xl font-extrabold tracking-[-0.03em] text-[#121318]">
                    FHTBS
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/85 border border-white text-[10px] font-bold tracking-wider uppercase text-[#F25730] shadow-2xs">
                    People &amp; Culture
                  </span>
                </div>
              </div>
            </Link>

              {/* Right Minimal Clock (ERP Standard) & Profile Button */}
            <div
              className="flex items-center gap-3 relative shrink-0"
              ref={userMenuRef}
            >
              <Link
                to="/erp"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/85 hover:bg-white border border-stone-200/80 text-[11px] font-bold text-stone-700 hover:text-stone-950 shadow-2xs transition-all"
                title="Switch to ERP Workspace (Dashboard, Message, General, ESS)"
              >
                <Home className="w-3.5 h-3.5 text-[#F25730]" />
                <span className="hidden sm:inline">ERP Workspace</span>
              </Link>

              <div className="flex items-center gap-2 text-[11px] text-stone-500 font-medium">
                <div className="flex items-center gap-1.5 bg-stone-50 px-3 py-1.5 rounded-full border border-stone-100 shadow-inner">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                  <span className="font-mono text-stone-600">
                    {time || "--:--:--"}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-[#1E2028] to-[#121318] text-white flex items-center justify-center text-xs sm:text-sm font-extrabold shadow-[0_8px_20px_rgba(18,19,24,0.16)] hover:scale-105 transition-all relative cursor-pointer border border-white/20"
              >
                {String(user?.username || "US")
                  .substring(0, 2)
                  .toUpperCase()}
                {historyCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#F25730] border-2 border-white rounded-full z-20" />
                )}
              </button>

              {/* Frosted Glass User Menu Dropdown */}
              {showUserMenu && user && (
                <div className="absolute top-[calc(100%+12px)] right-0 w-76 sm:w-84 bg-white/88 backdrop-blur-3xl rounded-3xl border border-white shadow-[0_28px_70px_rgba(18,19,24,0.16)] z-[100] overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200">
                  <div className="p-4 flex items-center justify-between bg-gradient-to-r from-[#1E2028] to-[#121318] text-white">
                    <div>
                      <p className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                        {String(user?.name || user?.username || "User")}
                      </p>
                      <span className="inline-block mt-0.5 text-[11px] font-medium text-white/70">
                        People &amp; Culture Studio
                      </span>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="p-2.5 bg-white/10 hover:bg-rose-500 text-white rounded-2xl transition-colors cursor-pointer"
                      title="Sign Out"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="px-4 py-2.5 border-b border-stone-200/60 bg-white/70">
                    <Link
                      to="/erp"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-stone-100/80 hover:bg-stone-200/70 text-xs font-bold text-stone-800 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Home className="w-3.5 h-3.5 text-[#F25730]" />
                        <span>Open ERP Workspace</span>
                      </span>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-500">
                        /erp
                      </span>
                    </Link>
                  </div>

                  <div className="px-4 py-3.5 border-b border-stone-200/60 bg-white/50 flex items-center justify-between gap-3">
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
                        <span className="text-xs font-bold text-[#121318] tracking-tight">
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

                  <div className="px-4 py-2.5 bg-white/60 border-b border-stone-200/60 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#646876] flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-[#F25730]" />
                      <span>
                        Notifications {historyCount > 0 && `(${historyCount})`}
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      {historyCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-[11px] font-semibold text-emerald-600 hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span>Read All</span>
                        </button>
                      )}
                      {notifications && notifications.length > 0 && (
                        <button
                          onClick={clearAll}
                          className="text-[11px] font-semibold text-[#8E929F] hover:text-rose-600 cursor-pointer flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Clear</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 max-h-[280px] overflow-y-auto custom-scrollbar">
                    {!notifications || notifications.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-xs font-medium text-[#8E929F]">
                          No new notifications
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {notifications.map((notif, index) => {
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

                          return (
                            <div
                              key={safeId}
                              onClick={() => notif.id && markAsRead(notif.id)}
                              className={cn(
                                "p-3 rounded-2xl border transition-all flex gap-3 cursor-pointer",
                                notif.isRead
                                  ? "bg-transparent border-transparent opacity-60 hover:bg-white/60"
                                  : "bg-white/90 border-white shadow-xs",
                              )}
                            >
                              <div
                                className={cn(
                                  "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                                  notif.type === "SUCCESS"
                                    ? "bg-emerald-50 text-emerald-600"
                                    : notif.type === "ERROR"
                                      ? "bg-rose-50 text-rose-600"
                                      : notif.type === "CHAT"
                                        ? "bg-amber-50 text-amber-600"
                                        : "bg-[#FFF2EE] text-[#F25730]",
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
                                <p className="text-xs font-bold text-[#121318] truncate">
                                  {safeTitle}
                                </p>
                                <p className="text-[11px] text-[#646876] line-clamp-2 mt-0.5">
                                  {safeMsg}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Workspace Container */}
        <div className="flex-1 relative z-10 pt-5 pb-36 px-4 sm:px-6 md:pt-8 md:pb-40 md:px-10">
          <div className="max-w-[1440px] mx-auto w-full">{children}</div>
        </div>
      </main>

      {/* =====================================================================
          ENLARGED, ELEGANT 3-COLUMN FLOATING GLASS DOCK (WITH 3-COL POP-UP)
          ===================================================================== */}
      <div
        ref={dockRef}
        className="fixed left-1/2 -translate-x-1/2 bottom-5 sm:bottom-6 z-50 w-full max-w-[680px] px-3 sm:px-4"
      >
        {/* 3-Column Pop-up All Modules Launcher (Layered Above the Dock) */}
        <AnimatePresence>
          {isGridOpen && (
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.96 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="mb-3 bg-white/82 backdrop-blur-3xl rounded-[32px] border border-white p-4 sm:p-5 shadow-[0_30px_80px_-15px_rgba(18,19,24,0.22),inset_0_1px_1px_rgba(255,255,255,1)]"
            >
              {/* Pop-up Header */}
              <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-stone-200/60 px-1">
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold tracking-tight text-[#121318]">
                    {isEditDrawerOpen
                      ? "Customize Dock Order"
                      : "All People Modules"}
                  </h3>
                  <p className="text-xs font-normal text-[#8E929F]">
                    {isEditDrawerOpen
                      ? "Top 3 modules appear directly on your main dock"
                      : "Select any workspace module below"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditDrawerOpen(!isEditDrawerOpen)}
                    className={cn(
                      "px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer",
                      isEditDrawerOpen
                        ? "bg-[#121318] text-white shadow-sm"
                        : "bg-white/90 hover:bg-white text-[#32353E] border border-stone-200/80 shadow-2xs",
                    )}
                  >
                    {isEditDrawerOpen ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Done</span>
                      </>
                    ) : (
                      <>
                        <Pencil className="w-3.5 h-3.5 text-[#F25730]" />
                        <span>Reorder</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsGridOpen(false);
                      setIsEditDrawerOpen(false);
                    }}
                    className="w-9 h-9 rounded-2xl bg-white/90 hover:bg-white text-[#646876] hover:text-[#121318] border border-stone-200/80 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isEditDrawerOpen ? (
                /* Reorder Mode */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                  {tabsToDisplay.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 bg-white/80 rounded-2xl border border-white shadow-2xs"
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 [&_svg]:w-5 [&_svg]:h-5",
                          item.accentBg,
                          item.accentText,
                        )}
                      >
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-extrabold text-[#121318] truncate">
                          {item.name}
                        </div>
                        <div className="text-[10px] font-medium text-[#8E929F]">
                          {index < 3 ? `Primary Dock Slot #${index + 1}` : "Pop-up Grid"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveCustomItem(index, "up")}
                          disabled={index === 0}
                          className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-xl text-[#32353E] disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCustomItem(index, "down")}
                          disabled={index === tabsToDisplay.length - 1}
                          className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-xl text-[#32353E] disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* 3-Column Pop-up Grid (Strictly 3 Columns) */
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  {tabsToDisplay.map((item) => {
                    const isActive = currentTab === item.id;
                    return (
                      <Link
                        key={item.id}
                        to={`/hr?tab=${item.id}`}
                        onClick={() => setIsGridOpen(false)}
                        className={cn(
                          "group relative flex flex-col sm:flex-row items-center sm:items-center gap-2.5 sm:gap-3.5 p-3 sm:p-3.5 rounded-2xl transition-all duration-200",
                          isActive
                            ? `bg-gradient-to-br ${item.activeGrad} text-white shadow-lg ${item.glow} scale-[1.01]`
                            : "bg-white/75 hover:bg-white text-[#121318] border border-white/90 shadow-[0_4px_14px_rgba(18,19,24,0.03)] hover:shadow-[0_10px_24px_rgba(18,19,24,0.07)] hover:-translate-y-0.5",
                        )}
                      >
                        <div
                          className={cn(
                            "w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105",
                            isActive
                              ? "bg-white/20 text-white backdrop-blur-md"
                              : cn(item.accentBg, item.accentText),
                          )}
                        >
                          {item.icon}
                        </div>
                        <div className="text-center sm:text-left min-w-0">
                          <div
                            className={cn(
                              "text-xs sm:text-sm font-extrabold tracking-tight truncate",
                              isActive ? "text-white" : "text-[#121318]",
                            )}
                          >
                            {item.name}
                          </div>
                          <div
                            className={cn(
                              "text-[10px] sm:text-[11px] font-medium truncate hidden sm:block mt-0.5",
                              isActive ? "text-white/80" : "text-[#8E929F]",
                            )}
                          >
                            {item.hint}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Soft Ambient Aurora Backlight Aura for Floating Dock */}
        <div className="absolute inset-x-8 -top-2 -bottom-2 bg-gradient-to-r from-[#FF7852]/15 via-teal-400/15 to-emerald-400/15 dark:from-[#FF7852]/30 dark:via-teal-400/25 dark:to-emerald-400/30 rounded-full blur-2xl pointer-events-none -z-10" />

        {/* Main Enlarged Floating Dock Bar: 3 Primary Menus (3 Columns) + All Modules Trigger */}
        <nav className="bg-white/82 backdrop-blur-3xl p-2 sm:p-2.5 rounded-[30px] border border-white shadow-[0_24px_60px_-10px_rgba(18,19,24,0.16),0_4px_16px_rgba(18,19,24,0.06),inset_0_1px_1px_rgba(255,255,255,1)] flex items-center gap-2 sm:gap-2.5">
          {/* 3-Column Primary Menu Grid */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 flex-1">
            {primaryThreeTabs.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <Link
                  key={item.id}
                  to={`/hr?tab=${item.id}`}
                  onClick={() => setIsGridOpen(false)}
                  className={cn(
                    "group relative flex items-center justify-center sm:justify-start gap-3 px-3 sm:px-4 h-[60px] sm:h-[64px] rounded-[22px] transition-all duration-300",
                    isActive
                      ? `bg-gradient-to-r ${item.activeGrad} text-white shadow-lg ${item.glow}`
                      : "bg-white/60 hover:bg-white text-[#32353E] hover:text-[#121318] border border-white/80",
                  )}
                >
                  <div
                    className={cn(
                      "w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105",
                      isActive
                        ? "bg-white/20 text-white backdrop-blur-md"
                        : cn(item.accentBg, item.accentText),
                    )}
                  >
                    {item.icon}
                  </div>
                  <div className="min-w-0 hidden sm:block">
                    <div
                      className={cn(
                        "text-sm font-extrabold tracking-tight truncate leading-tight",
                        isActive ? "text-white" : "text-[#121318]",
                      )}
                    >
                      {item.name}
                    </div>
                    <div
                      className={cn(
                        "text-[11px] font-medium truncate leading-tight mt-0.5",
                        isActive ? "text-white/80" : "text-[#8E929F]",
                      )}
                    >
                      {item.hint}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Divider */}
          <div className="w-px h-10 bg-stone-200/80 shrink-0" />

          {/* Enlarged 3-Column Pop-up Trigger Button */}
          <button
            type="button"
            onClick={() => setIsGridOpen((prev) => !prev)}
            className={cn(
              "h-[60px] sm:h-[64px] px-4 sm:px-5 rounded-[22px] flex items-center gap-2.5 font-extrabold text-sm transition-all duration-300 shrink-0 cursor-pointer",
              isGridOpen
                ? "bg-[#121318] text-white shadow-lg shadow-stone-900/20"
                : "bg-white/80 hover:bg-white text-[#121318] border border-white shadow-xs",
            )}
            title="Open 3-Column Modules Menu"
          >
            <div
              className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center transition-transform duration-300",
                isGridOpen
                  ? "bg-white/15 text-white rotate-90"
                  : "bg-[#FFF2EE] text-[#F25730]",
              )}
            >
              <LayoutGrid className="w-5 h-5" />
            </div>
            <span className="hidden md:inline tracking-tight">Modules</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
