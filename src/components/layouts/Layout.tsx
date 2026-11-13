import { safeFetchJson } from "@/utils/api";
import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useInterval } from "@/hooks/useInterval";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ChevronDown,
  Globe,
  Smartphone,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNotifications } from "@/contexts/NotificationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { PWAInstallButton } from "@/components/pwa/PWAInstallButton";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { useMobileMonitoring } from "@/contexts/MonitoringContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DesktopModeNoticeModal,
  DesktopModeRequiredPage,
} from "@/components/mobile/DesktopModeNotice";
import { MobileAppShell } from "@/components/mobile/MobileAppShell";
import { computeFilteredNavGroups } from "@/components/layouts/header/navConfig";
import { LiveClock, HeaderClock } from "@/components/layouts/header/HeaderClocks";
import { UserMenuPopover } from "@/components/layouts/header/UserMenuPopover";
import { MobileMonitoringStrip } from "@/components/layouts/header/MobileMonitoringStrip";
import {
  ChatNotificationToast,
  type ChatNotificationData,
} from "@/components/layouts/header/ChatNotificationToast";

function playNotificationSound() {
  try {
    const audioCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const playTone = (
      freq: number,
      type: OscillatorType,
      duration: number,
      vol: number,
      startTime: number,
    ) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    playTone(1174.66, "sine", 0.4, 0.3, audioCtx.currentTime);
    playTone(1760.0, "sine", 0.6, 0.3, audioCtx.currentTime + 0.15);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { appLogo } = useTheme();
  const {
    isMobileViewport,
    isForceDesktopMode,
    isExemptInteractiveRoute,
    isDesktopHeavyRoute,
    isMobileReadOnly,
    openDesktopNotice,
    disableForceDesktopMode,
  } = useMobileMonitoring();
  const {
    notifications,
    unreadCount: historyCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();

  const [unreadCount, setUnreadCount] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [chatNotification, setChatNotification] =
    useState<ChatNotificationData | null>(null);
  const lastNotifiedRef = useRef<string | null>(null);
  const hideNotifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const desktopNavWrapperRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLElement>(null);
  const isFirstMountRef = useRef(true);
  const [canScrollDesktopLeft, setCanScrollDesktopLeft] = useState(false);
  const [canScrollDesktopRight, setCanScrollDesktopRight] = useState(false);

  const buttonRefs = useRef<{
    [key: string]: HTMLButtonElement | HTMLAnchorElement | null;
  }>({});
  const [dropdownLeft, setDropdownLeft] = useState<number | null>(null);
  const holdDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const holdRafRef = useRef<number | null>(null);
  const isHoldingScrollRef = useRef(false);

  const activeDropdownRef = useRef<string | null>(null);
  activeDropdownRef.current = activeDropdown;

  const computeDropdownLeft = useCallback((groupName: string | null) => {
    if (
      groupName &&
      buttonRefs.current[groupName] &&
      desktopNavRef.current &&
      desktopNavWrapperRef.current
    ) {
      const btn = buttonRefs.current[groupName];
      if (btn) {
        const rect = btn.getBoundingClientRect();
        const wrapperRect =
          desktopNavWrapperRef.current.getBoundingClientRect();
        const rawLeft = rect.left - wrapperRect.left;
        const dropdownWidth = 224; // w-56
        const maxLeft = Math.max(0, wrapperRect.width - dropdownWidth);
        return Math.max(0, Math.min(rawLeft, maxLeft));
      }
    }
    return null;
  }, []);

  const ensureNavButtonVisible = useCallback((groupName: string) => {
    const btn = buttonRefs.current[groupName];
    const nav = desktopNavRef.current;
    if (btn && nav) {
      const btnRect = btn.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const margin = 28;
      if (btnRect.right > navRect.right - margin) {
        nav.scrollBy({
          left: btnRect.right - navRect.right + margin,
          behavior: "smooth",
        });
      } else if (btnRect.left < navRect.left + margin) {
        nav.scrollBy({
          left: btnRect.left - navRect.left - margin,
          behavior: "smooth",
        });
      }
    }
  }, []);

  const handleDropdownClick = useCallback(
    (groupName: string) => {
      ensureNavButtonVisible(groupName);
      setActiveDropdown((prev) => {
        const next = prev === groupName ? null : groupName;
        if (next) {
          const nextLeft = computeDropdownLeft(next);
          if (nextLeft !== null) setDropdownLeft(nextLeft);
        }
        return next;
      });
    },
    [ensureNavButtonVisible, computeDropdownLeft],
  );

  const handleDropdownHover = useCallback(
    (groupName: string) => {
      if (activeDropdown !== null && activeDropdown !== groupName) {
        ensureNavButtonVisible(groupName);
        const nextLeft = computeDropdownLeft(groupName);
        if (nextLeft !== null) setDropdownLeft(nextLeft);
        setActiveDropdown(groupName);
      }
    },
    [activeDropdown, ensureNavButtonVisible, computeDropdownLeft],
  );

  const updateDropdownPosition = useCallback(() => {
    const currentGroup = activeDropdownRef.current;
    if (currentGroup) {
      const nextLeft = computeDropdownLeft(currentGroup);
      if (nextLeft !== null) {
        setDropdownLeft(nextLeft);
      }
    }
  }, [computeDropdownLeft]);

  useEffect(() => {
    if (activeDropdown) {
      updateDropdownPosition();
    }
  }, [activeDropdown, updateDropdownPosition]);

  const checkScroll = useCallback(() => {
    if (desktopNavRef.current) {
      setCanScrollDesktopLeft(desktopNavRef.current.scrollLeft > 4);
      setCanScrollDesktopRight(
        desktopNavRef.current.scrollLeft <
          desktopNavRef.current.scrollWidth -
            desktopNavRef.current.clientWidth -
            4,
      );
    }
    updateDropdownPosition();
  }, [updateDropdownPosition]);

  const stopHoldScroll = useCallback(() => {
    if (holdDelayTimeoutRef.current) {
      clearTimeout(holdDelayTimeoutRef.current);
      holdDelayTimeoutRef.current = null;
    }
    if (holdRafRef.current !== null) {
      cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = null;
    }
  }, []);

  const startHoldScroll = useCallback(
    (direction: "left" | "right") => {
      stopHoldScroll();
      isHoldingScrollRef.current = false;

      holdDelayTimeoutRef.current = setTimeout(() => {
        isHoldingScrollRef.current = true;
        const step = direction === "right" ? 6 : -6;

        const glide = () => {
          const nav = desktopNavRef.current;
          if (!nav) return;
          const prevScroll = nav.scrollLeft;
          nav.scrollLeft += step;
          checkScroll();
          if (nav.scrollLeft !== prevScroll) {
            holdRafRef.current = requestAnimationFrame(glide);
          } else {
            holdRafRef.current = null;
          }
        };

        holdRafRef.current = requestAnimationFrame(glide);
      }, 180);
    },
    [stopHoldScroll, checkScroll],
  );

  const snapScrollNav = useCallback((direction: "left" | "right") => {
    const nav = desktopNavRef.current;
    if (!nav) return;
    const navRect = nav.getBoundingClientRect();
    const children = Array.from(
      nav.querySelectorAll<HTMLElement>(":scope > a, :scope > button"),
    );
    const margin = 32;

    if (direction === "right") {
      const targetItem = children.find(
        (el) => el.getBoundingClientRect().right > navRect.right - 6,
      );
      if (targetItem) {
        const itemRect = targetItem.getBoundingClientRect();
        const step = Math.max(itemRect.right - navRect.right + margin, 140);
        nav.scrollBy({ left: step, behavior: "smooth" });
      } else {
        nav.scrollBy({ left: 180, behavior: "smooth" });
      }
    } else {
      const clippedLeftItems = children.filter(
        (el) => el.getBoundingClientRect().left < navRect.left + 6,
      );
      const targetItem = clippedLeftItems[clippedLeftItems.length - 1];
      if (targetItem) {
        const itemRect = targetItem.getBoundingClientRect();
        const step = Math.min(itemRect.left - navRect.left - margin, -140);
        nav.scrollBy({ left: step, behavior: "smooth" });
      } else {
        nav.scrollBy({ left: -180, behavior: "smooth" });
      }
    }
  }, []);

  const handleNavWheel = useCallback(
    (e: React.WheelEvent<HTMLElement>) => {
      const nav = desktopNavRef.current;
      if (!nav) return;
      if (nav.scrollWidth <= nav.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        nav.scrollLeft += e.deltaY;
        checkScroll();
      }
    },
    [checkScroll],
  );

  useEffect(() => {
    return () => {
      stopHoldScroll();
    };
  }, [stopHoldScroll]);

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);

    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
      if (
        desktopNavWrapperRef.current &&
        !desktopNavWrapperRef.current.contains(event.target as Node)
      ) {
        setActiveDropdown(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveDropdown(null);
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", checkScroll);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [user, checkScroll]);

  useEffect(() => {
    let animationFrameId: number | null = null;

    const scrollContainerToElement = (
      container: HTMLElement,
      activeEl: HTMLElement,
      isInstant: boolean,
    ) => {
      const navRect = container.getBoundingClientRect();
      const itemRect = activeEl.getBoundingClientRect();
      const margin = 28;

      // If the active item is already fully visible inside the navbar viewport,
      // preserve the user's current scroll position without resetting or jumping.
      if (
        itemRect.left >= navRect.left + margin &&
        itemRect.right <= navRect.right - margin
      ) {
        checkScroll();
        return;
      }

      const containerWidth = container.clientWidth;
      const maxScroll = Math.max(0, container.scrollWidth - containerWidth);
      let targetLeft = container.scrollLeft;

      if (itemRect.right > navRect.right - margin) {
        targetLeft =
          container.scrollLeft + (itemRect.right - navRect.right + margin);
      } else if (itemRect.left < navRect.left + margin) {
        targetLeft =
          container.scrollLeft - (navRect.left + margin - itemRect.left);
      }

      targetLeft = Math.max(0, Math.min(targetLeft, maxScroll));

      if (isInstant) {
        container.scrollLeft = targetLeft;
        checkScroll();
      } else {
        const startLeft = container.scrollLeft;
        const change = targetLeft - startLeft;

        if (Math.abs(change) <= 1) {
          checkScroll();
          return;
        }

        const startTime = performance.now();
        const duration = 300;

        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

        const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const ease = easeOutCubic(progress);

          container.scrollLeft = startLeft + change * ease;
          checkScroll();

          if (progress < 1) {
            animationFrameId = requestAnimationFrame(animate);
          }
        };

        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    const scrollToActive = (isInstant: boolean) => {
      if (desktopNavRef.current) {
        const container = desktopNavRef.current;
        const activeEl = container.querySelector<HTMLElement>(
          '[data-nav-active="true"]',
        );
        if (activeEl) {
          scrollContainerToElement(container, activeEl, isInstant);
        }
      }
      checkScroll();
    };

    scrollToActive(isFirstMountRef.current);
    isFirstMountRef.current = false;

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [location.pathname, checkScroll]);

  const sendHeartbeat = useCallback(() => {
    if (!user) return;
    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
    const deviceType = isMobile ? "Mobile" : isTablet ? "Tablet" : "Desktop";

    fetch("/api/users/heartbeat", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "remote-user": user.username,
        "x-user-email": user.username,
      },
      body: JSON.stringify({
        device_type: deviceType,
        username: user.username,
      }),
    }).catch((e) => {
      if (e.message !== "Failed to fetch" && e.name !== "AbortError") {
        console.error("Heartbeat failed", e);
      }
    });
  }, [user]);

  useEffect(() => {
    sendHeartbeat();
  }, [sendHeartbeat]);

  useInterval(sendHeartbeat, user ? 20000 : null);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/chat/unread", {
        headers: {
          "x-user-email": user.username,
          "remote-user": user.username,
        },
      });
      if (res.ok) {
        const response = await safeFetchJson(res);
        const data = response.data;
        const unread = data?.unread_count ?? data?.count ?? 0;
        setUnreadCount(unread);

        if (
          data?.latest_message &&
          data.latest_message.id !== lastNotifiedRef.current
        ) {
          const msgId = data.latest_message.id;
          if (lastNotifiedRef.current !== null) {
            playNotificationSound();
            setChatNotification({
              id: msgId,
              sender: data.latest_message.sender_username,
              content: data.latest_message.content || "Sent an attachment",
              visible: true,
            });

            addNotification(
              "CHAT",
              `New Message: ${data.latest_message.sender_username}`,
              data.latest_message.content || "Sent an attachment",
              "/forum",
            );

            if (hideNotifTimeoutRef.current)
              clearTimeout(hideNotifTimeoutRef.current);
            hideNotifTimeoutRef.current = setTimeout(() => {
              setChatNotification((prev) =>
                prev ? { ...prev, visible: false } : null,
              );
            }, 5000);
          }
          lastNotifiedRef.current = msgId;
        }
      }
    } catch {
      // Ignore transient network errors
    }
  }, [user, addNotification]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    const handleChatUpdate = () => {
      fetchUnreadCount();
    };
    window.addEventListener("chat:unread_update", handleChatUpdate);
    return () =>
      window.removeEventListener("chat:unread_update", handleChatUpdate);
  }, [fetchUnreadCount]);

  useInterval(fetchUnreadCount, user ? 4000 : null);

  const filteredNavGroups = useMemo(
    () => computeFilteredNavGroups(user, t),
    [user, t],
  );

  const nonGeneralNavGroups = useMemo(
    () => filteredNavGroups.filter((g) => g.group !== "General"),
    [filteredNavGroups],
  );

  const activeDropdownGroup = useMemo(
    () =>
      activeDropdown
        ? filteredNavGroups.find((g) => g.group === activeDropdown) || null
        : null,
    [activeDropdown, filteredNavGroups],
  );

  const handleDismissChatNotification = useCallback(() => {
    setChatNotification((prev) => (prev ? { ...prev, visible: false } : null));
  }, []);

  const handleMainClick = useCallback(() => {
    setActiveDropdown(null);
  }, []);

  const handleMainClickCapture = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!isMobileReadOnly) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest("button");
      if (!btn) return;

      const text = (
        btn.textContent ||
        btn.getAttribute("title") ||
        btn.getAttribute("aria-label") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();

      if (
        /^(refresh|muat ulang|clear|hapus pencarian|tutup|close|cancel|batal|back|kembali|detail|view|lihat|preview|cetak|print|filter|all|semua|sort|next|prev|previous|monitor|mode desktop|lanjutkan|salin)/i.test(
          text,
        )
      ) {
        return;
      }

      const isSubmit = btn.getAttribute("type") === "submit";
      const isMutationKeyword =
        /^\+\s*\w+/i.test(text) ||
        /\b(add|tambah|create|buat|new|baru|edit|ubah|update|delete|hapus|remove|save|simpan|submit|ajukan|approve|setuju|setujui|reject|tolak|authorize|otorisasi|sync|sinkron|commit|receive|terima|dispatch|issue|consume|record|catat|post|posting|import|upload|unggah|config|konfigurasi|generate|assign|alokasi|archive|arsipkan|repeat order|convert|konversi|process|proses|settle|lunasi|pay|bayar)\b/i.test(
          text,
        );

      if (isSubmit || isMutationKeyword) {
        e.preventDefault();
        e.stopPropagation();
        openDesktopNotice(
          text || "ERP Action Locked",
          `The "${text || "selected"}" action is locked in Mobile Monitoring Mode (Read-Only). Please use a desktop browser or enable Force Desktop View to modify records.`,
        );
      }
    },
    [isMobileReadOnly, openDesktopNotice],
  );

  if (isMobileViewport && !isForceDesktopMode) {
    return (
      <MobileAppShell unreadForumCount={unreadCount}>
        {children}
      </MobileAppShell>
    );
  }

  const isDashboardActive = location.pathname === "/erp";
  const isMessagesActive = location.pathname === "/forum";
  const isGeneralActive = ["/general-requests", "/document-workspace"].includes(
    location.pathname,
  );

  return (
    <div className="h-screen bg-stone-50 text-stone-900 font-sans selection:bg-stone-200 selection:text-stone-900 flex flex-col overflow-hidden">
      <header className="shrink-0 border-b border-stone-200 bg-white/95 backdrop-blur-xl z-50 sticky top-0 relative shadow-2xs">
        <div className="w-full px-3 sm:px-6 md:px-10 h-[50px] sm:h-[56px] md:h-[62px] flex items-center justify-between gap-3 relative z-10">
          {/* Column 1: Brand Logo */}
          <div className="flex items-center shrink-0">
            <Link
              to="/erp"
              onClick={handleMainClick}
              className="flex items-center gap-2 sm:gap-2.5 shrink-0 group"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 md:w-9 md:h-9 rounded-lg sm:rounded-xl bg-white border border-stone-200/70 flex items-center justify-center shadow-2xs transition-all">
                <img
                  src={appLogo}
                  alt="Paving Joss Logo"
                  onError={(e) => {
                    e.currentTarget.src = "/logo.png";
                  }}
                  className="w-4.5 h-4.5 sm:w-5 sm:h-5 md:w-6 md:h-6 object-contain drop-shadow-2xs group-hover:scale-105 transition-transform"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm sm:text-[15px] md:text-base font-bold tracking-tight text-stone-900 transition-colors">
                  FHTBS
                </h1>
                <span className="px-1.5 py-0.5 rounded border border-stone-200/60 bg-stone-50 text-stone-500 text-[8px] md:text-[9px] uppercase tracking-widest font-bold hidden sm:inline-block">
                  ERP
                </span>
              </div>
            </Link>
          </div>

          {/* Column 2: Sliding Dropdown Nav (Hidden on mobile, shown on desktop) */}
          <div
            ref={desktopNavWrapperRef}
            className="hidden md:flex items-center justify-center flex-1 h-full overflow-visible relative px-2 mx-2 min-w-0 gap-1.5"
          >
            {/* Left Scroll Button (Permanent Fixed Slot to prevent layout shift) */}
            <button
              type="button"
              aria-label="Scroll navigation left"
              aria-hidden={!canScrollDesktopLeft}
              tabIndex={canScrollDesktopLeft ? 0 : -1}
              disabled={!canScrollDesktopLeft}
              onPointerDown={() =>
                canScrollDesktopLeft && startHoldScroll("left")
              }
              onPointerUp={stopHoldScroll}
              onPointerLeave={stopHoldScroll}
              onPointerCancel={stopHoldScroll}
              onClick={() => {
                if (!canScrollDesktopLeft) return;
                if (!isHoldingScrollRef.current) {
                  snapScrollNav("left");
                }
                isHoldingScrollRef.current = false;
              }}
              className={cn(
                "w-7 h-7 shrink-0 bg-white border border-stone-200/90 rounded-lg flex items-center justify-center shadow-2xs text-stone-500 hover:text-stone-900 hover:border-stone-300 hover:bg-stone-50 active:scale-95 transition-all duration-200 ease-out z-20 select-none",
                canScrollDesktopLeft
                  ? "opacity-100 scale-100 pointer-events-auto cursor-pointer"
                  : "opacity-0 scale-90 pointer-events-none",
              )}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="relative flex items-center min-w-0 max-w-full overflow-hidden">
              {/* Left Edge Gradient Mask */}
              <div
                className={cn(
                  "pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white via-white/90 to-transparent z-10 transition-opacity duration-200",
                  canScrollDesktopLeft ? "opacity-100" : "opacity-0",
                )}
              />

              <motion.nav
                ref={desktopNavRef}
                layoutScroll
                onScroll={checkScroll}
                onWheel={handleNavWheel}
                className="flex items-center justify-start gap-1 overflow-x-auto scrollbar-hide py-1.5 px-1 relative w-fit max-w-full min-w-0"
              >
                {/* Prepend Dashboard Link */}
                <Link
                  to="/erp"
                  data-nav-active={isDashboardActive ? "true" : undefined}
                  onClick={handleMainClick}
                  className={cn(
                    "relative h-8 text-[10px] uppercase tracking-[0.08em] transition-colors px-2.5 xl:px-3 rounded-lg font-bold whitespace-nowrap shrink-0 inline-flex items-center border",
                    isDashboardActive
                      ? "text-stone-900 border-transparent"
                      : "text-stone-500 border-transparent hover:text-stone-900 hover:bg-stone-50/80",
                  )}
                >
                  {isDashboardActive && (
                    <motion.span
                      layoutId="erp-nav-active-pill"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                        mass: 0.8,
                      }}
                      className="absolute inset-0 bg-stone-100 border border-stone-200/80 rounded-lg shadow-2xs pointer-events-none"
                    />
                  )}
                  <span className="relative z-10">Dashboard</span>
                </Link>

                {/* Prepend Messages Link */}
                <Link
                  to="/forum"
                  data-nav-active={isMessagesActive ? "true" : undefined}
                  onClick={handleMainClick}
                  className={cn(
                    "relative h-8 text-[10px] uppercase tracking-[0.08em] transition-colors px-2.5 xl:px-3 rounded-lg font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 group border",
                    isMessagesActive
                      ? "text-stone-900 border-transparent"
                      : "text-stone-500 border-transparent hover:text-stone-900 hover:bg-stone-50/80",
                  )}
                >
                  {isMessagesActive && (
                    <motion.span
                      layoutId="erp-nav-active-pill"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                        mass: 0.8,
                      }}
                      className="absolute inset-0 bg-stone-100 border border-stone-200/80 rounded-lg shadow-2xs pointer-events-none"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-900 transition-colors" />
                    Messages
                    {unreadCount > 0 && (
                      <span className="ml-1 bg-stone-900 text-white rounded-md px-1.5 py-0.5 text-[8px] font-bold leading-none tracking-normal shadow-2xs">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </span>
                </Link>

                {/* Prepend General Dropdown Link next to Messages */}
                <button
                  type="button"
                  data-nav-active={isGeneralActive ? "true" : undefined}
                  ref={(el) => {
                    buttonRefs.current["General"] = el;
                  }}
                  onMouseEnter={() => handleDropdownHover("General")}
                  onClick={() => handleDropdownClick("General")}
                  aria-expanded={activeDropdown === "General"}
                  className={cn(
                    "relative h-8 text-[10px] uppercase tracking-[0.08em] transition-colors px-2.5 xl:px-3 rounded-lg font-bold inline-flex items-center gap-1.5 whitespace-nowrap outline-none cursor-pointer shrink-0 group border",
                    isGeneralActive
                      ? "text-stone-900 border-transparent"
                      : activeDropdown === "General"
                        ? "text-stone-900 bg-stone-100/70 border-stone-200/60"
                        : "text-stone-500 border-transparent hover:text-stone-900 hover:bg-stone-50/80",
                  )}
                >
                  {isGeneralActive && (
                    <motion.span
                      layoutId="erp-nav-active-pill"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                        mass: 0.8,
                      }}
                      className="absolute inset-0 bg-stone-100 border border-stone-200/80 rounded-lg shadow-2xs pointer-events-none"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-900 transition-colors" />
                    General
                    <ChevronDown
                      className={cn(
                        "w-3 h-3 shrink-0 transition-transform duration-200",
                        activeDropdown === "General"
                          ? "-rotate-180 text-stone-800"
                          : "text-stone-400",
                      )}
                    />
                  </span>
                </button>

                {/* Aesthetic Spacer Divider */}
                <div className="h-4 w-[1px] bg-stone-200/70 shrink-0 mx-1" />

                {nonGeneralNavGroups.map((group) => {
                  const isActiveGroup = group.items.some(
                    (it) => location.pathname === it.path,
                  );

                  if (group.items.length === 1) {
                    const isMessages =
                      group.group === "Messages" ||
                      group.items.some(
                        (it) =>
                          it.name === "Collaboration Forum" ||
                          it.name === "Messages",
                      );
                    return (
                      <Link
                        key={group.group}
                        to={group.items[0].path}
                        data-nav-active={isActiveGroup ? "true" : undefined}
                        ref={(el) => {
                          buttonRefs.current[group.group] = el;
                        }}
                        onClick={handleMainClick}
                        className={cn(
                          "relative h-8 text-[10px] uppercase tracking-[0.08em] transition-colors px-2.5 xl:px-3 rounded-lg font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 border",
                          isActiveGroup
                            ? "text-stone-900 border-transparent"
                            : "text-stone-500 border-transparent hover:text-stone-900 hover:bg-stone-50/80",
                        )}
                      >
                        {isActiveGroup && (
                          <motion.span
                            layoutId="erp-nav-active-pill"
                            transition={{
                              type: "spring",
                              stiffness: 420,
                              damping: 32,
                              mass: 0.8,
                            }}
                            className="absolute inset-0 bg-stone-100 border border-stone-200/80 rounded-lg shadow-2xs pointer-events-none"
                          />
                        )}
                        <span className="relative z-10 inline-flex items-center gap-1.5">
                          {group.translatedGroup}
                          {isMessages && unreadCount > 0 && (
                            <span className="ml-1 bg-stone-900 text-white rounded-md px-1.5 py-0.5 text-[8px] font-bold leading-none tracking-normal shadow-2xs">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={group.group}
                      type="button"
                      data-nav-active={isActiveGroup ? "true" : undefined}
                      ref={(el) => {
                        buttonRefs.current[group.group] = el;
                      }}
                      onMouseEnter={() => handleDropdownHover(group.group)}
                      onClick={() => handleDropdownClick(group.group)}
                      aria-expanded={activeDropdown === group.group}
                      className={cn(
                        "relative h-8 text-[10px] uppercase tracking-[0.08em] transition-colors px-2.5 xl:px-3 rounded-lg font-bold inline-flex items-center gap-1.5 whitespace-nowrap outline-none cursor-pointer shrink-0 border",
                        isActiveGroup
                          ? "text-stone-900 border-transparent"
                          : activeDropdown === group.group
                            ? "text-stone-900 bg-stone-100/70 border-stone-200/60"
                            : "text-stone-500 border-transparent hover:text-stone-900 hover:bg-stone-50/80",
                      )}
                    >
                      {isActiveGroup && (
                        <motion.span
                          layoutId="erp-nav-active-pill"
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 32,
                            mass: 0.8,
                          }}
                          className="absolute inset-0 bg-stone-100 border border-stone-200/80 rounded-lg shadow-2xs pointer-events-none"
                        />
                      )}
                      <span className="relative z-10 inline-flex items-center gap-1.5">
                        <span>{group.translatedGroup}</span>
                        <ChevronDown
                          className={cn(
                            "w-3 h-3 shrink-0 transition-transform duration-200",
                            activeDropdown === group.group
                              ? "-rotate-180 text-stone-800"
                              : "text-stone-400",
                          )}
                        />
                        {group.items.some(
                          (it) =>
                            it.name === "Collaboration Forum" ||
                            it.name === "Messages",
                        ) &&
                          unreadCount > 0 && (
                            <span className="ml-1 bg-stone-900 text-white rounded-md px-1.5 py-0.5 text-[8px] font-bold leading-none tracking-normal shadow-2xs">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                      </span>
                    </button>
                  );
                })}
              </motion.nav>

              {/* Right Edge Gradient Mask */}
              <div
                className={cn(
                  "pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white via-white/90 to-transparent z-10 transition-opacity duration-200",
                  canScrollDesktopRight ? "opacity-100" : "opacity-0",
                )}
              />
            </div>

            {/* Right Scroll Button (Permanent Fixed Slot to prevent layout shift) */}
            <button
              type="button"
              aria-label="Scroll navigation right"
              aria-hidden={!canScrollDesktopRight}
              tabIndex={canScrollDesktopRight ? 0 : -1}
              disabled={!canScrollDesktopRight}
              onPointerDown={() =>
                canScrollDesktopRight && startHoldScroll("right")
              }
              onPointerUp={stopHoldScroll}
              onPointerLeave={stopHoldScroll}
              onPointerCancel={stopHoldScroll}
              onClick={() => {
                if (!canScrollDesktopRight) return;
                if (!isHoldingScrollRef.current) {
                  snapScrollNav("right");
                }
                isHoldingScrollRef.current = false;
              }}
              className={cn(
                "w-7 h-7 shrink-0 bg-white border border-stone-200/90 rounded-lg flex items-center justify-center shadow-2xs text-stone-500 hover:text-stone-900 hover:border-stone-300 hover:bg-stone-50 active:scale-95 transition-all duration-200 ease-out z-20 select-none",
                canScrollDesktopRight
                  ? "opacity-100 scale-100 pointer-events-auto cursor-pointer"
                  : "opacity-0 scale-90 pointer-events-none",
              )}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <AnimatePresence>
              {activeDropdownGroup && (
                <motion.div
                  initial={{
                    opacity: 0,
                    y: 6,
                    scale: 0.97,
                    left: dropdownLeft !== null ? dropdownLeft : 0,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    left: dropdownLeft !== null ? dropdownLeft : 0,
                  }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 32,
                    mass: 0.8,
                  }}
                  className="absolute top-full mt-1.5 z-[100] w-56 origin-top-left"
                  style={{
                    left: dropdownLeft !== null ? dropdownLeft : 0,
                  }}
                >
                  <div className="bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_12px_32px_-8px_rgba(28,25,23,0.12)] border border-stone-200/80 py-1.5 flex flex-col relative overflow-hidden">
                    <motion.div
                      key={activeDropdownGroup.group}
                      initial="hidden"
                      animate="visible"
                      variants={{
                        hidden: { opacity: 0 },
                        visible: {
                          opacity: 1,
                          transition: {
                            staggerChildren: 0.025,
                            delayChildren: 0.01,
                          },
                        },
                      }}
                      className="flex flex-col"
                    >
                      {activeDropdownGroup.items.map((item) => {
                        const isItemActive = location.pathname === item.path;
                        return (
                          <motion.div
                            key={item.path}
                            variants={{
                              hidden: { opacity: 0, y: 4 },
                              visible: {
                                opacity: 1,
                                y: 0,
                                transition: {
                                  type: "spring",
                                  stiffness: 500,
                                  damping: 34,
                                  mass: 0.6,
                                },
                              },
                            }}
                          >
                            <Link
                              to={item.path}
                              onClick={handleMainClick}
                              className={cn(
                                "px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center justify-between gap-2.5",
                                isItemActive
                                  ? "text-stone-900 bg-stone-100/80 font-bold border-l-2 border-stone-800 pl-3.5"
                                  : "text-stone-500 hover:text-stone-900 hover:bg-stone-50/80",
                              )}
                            >
                              <span className="leading-snug">
                                {item.translatedName}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                {item.badge && (
                                  <span className="bg-stone-900 text-white rounded px-1.5 py-0.5 text-[8px] font-black leading-none tracking-normal uppercase">
                                    {item.badge}
                                  </span>
                                )}
                                {(item.name === "Collaboration Forum" ||
                                  item.name === "Messages") &&
                                  unreadCount > 0 && (
                                    <span className="bg-stone-900 text-white rounded-lg px-2 py-0.5 text-[8px] font-bold leading-none tracking-normal shadow-xs">
                                      {unreadCount > 99 ? "99+" : unreadCount}
                                    </span>
                                  )}
                              </div>
                            </Link>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Column 3: Stats, Timer & User Profile */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 justify-end">
            <PWAInstallButton />

            <div className="flex items-center gap-2 text-[11px] text-stone-500 font-medium hidden lg:flex">
              <div className="flex items-center gap-1.5 bg-stone-50 px-3 py-1.5 rounded-full border border-stone-100 shadow-inner">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                <HeaderClock />
              </div>
            </div>

            <UserMenuPopover
              user={user}
              logout={logout}
              unreadCount={unreadCount}
              historyCount={historyCount}
              notifications={notifications}
              markAsRead={markAsRead}
              markAllAsRead={markAllAsRead}
              clearAll={clearAll}
              showUserMenu={showUserMenu}
              setShowUserMenu={setShowUserMenu}
              userMenuRef={userMenuRef}
            />
          </div>
        </div>
      </header>

      {/* Mobile Monitoring & Force Desktop Status Strip */}
      <MobileMonitoringStrip
        user={user}
        isMobileReadOnly={isMobileReadOnly}
        isMobileViewport={isMobileViewport}
        isForceDesktopMode={isForceDesktopMode}
        isExemptInteractiveRoute={isExemptInteractiveRoute}
        openDesktopNotice={openDesktopNotice}
        disableForceDesktopMode={disableForceDesktopMode}
      />

      <main
        className="flex-1 overflow-y-auto overflow-x-hidden w-full"
        onClick={handleMainClick}
        onClickCapture={handleMainClickCapture}
      >
        <div
          className={cn(
            "max-w-7xl mx-auto w-full px-2.5 py-3 sm:px-4 md:px-6 lg:px-8 md:py-5",
            isMobileViewport && isForceDesktopMode && "min-w-[1024px]",
          )}
        >
          {isMobileReadOnly && isDesktopHeavyRoute ? (
            <DesktopModeRequiredPage
              moduleName={
                location.pathname
                  .replace(/^\//, "")
                  .replace(/-/g, " ")
                  .toUpperCase() || "WORKSPACE STUDIO"
              }
            />
          ) : (
            children
          )}
        </div>
      </main>

      <DesktopModeNoticeModal />

      <footer className="hidden sm:block shrink-0 border-t border-stone-100 bg-white py-2.5">
        <div className="w-full px-4 md:px-10 flex flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-stone-400 font-medium tracking-wide">
              Enterprise OS / ERP System
            </span>
            <div className="h-3 w-[1px] bg-stone-200" />
            <span className="text-[11px] text-stone-400">
              Engineered by Eghy Al Vandi
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[9.5px] text-stone-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{" "}
              Systems Operational
            </span>
            <LiveClock />
          </div>
        </div>
      </footer>

      <ChatNotificationToast
        chatNotification={chatNotification}
        onDismiss={handleDismissChatNotification}
      />

      {isMobileViewport && isForceDesktopMode && (
        <button
          onClick={() => disableForceDesktopMode()}
          className="fixed bottom-4 right-4 z-[120] inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold shadow-xl border border-stone-800 active:scale-95 transition-transform cursor-pointer"
        >
          <Smartphone className="w-4 h-4 text-white" />
          Back to Mobile App
        </button>
      )}

      <OfflineIndicator />
    </div>
  );
}
