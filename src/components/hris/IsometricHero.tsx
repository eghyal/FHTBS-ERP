import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "@/contexts/ThemeContext";

export interface HrTabMeta {
  tag: string;
  titleLight: string;
  titleBold: string;
  subtitle: string;
  accentColor: string;
  glowClass: string;
  iconBg: string;
  icon: React.ReactNode;
}

export interface HrHeroTelemetry {
  frontLabel: string;
  frontValue: string;
  frontBadge: string;
  midLabel: string;
  midValue: string;
  backLabel: string;
  backMeta: string;
  progress: number;
  bars: number[];
}

interface HrIsometricHeroProps {
  activeTab: string;
  currentTabMeta: HrTabMeta;
  heroTelemetry: HrHeroTelemetry;
  isSyncingIntegrity: boolean;
  isRefreshing: boolean;
  onSyncIntegrity: () => void;
  onRefresh: () => void;
}

export const HrIsometricHero = memo(function HrIsometricHero({
  activeTab,
  currentTabMeta,
  heroTelemetry,
  isSyncingIntegrity,
  isRefreshing,
  onSyncIntegrity,
  onRefresh,
}: HrIsometricHeroProps) {
  const { isDark } = useTheme();
  const [rollingIndex, setRollingIndex] = useState<number>(0);
  const [isRollingPaused, setIsRollingPaused] = useState(false);
  const [mouseTilt, setMouseTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const prevIndexRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Keep track of previous index to calculate smooth swoop paths
  useEffect(() => {
    prevIndexRef.current = rollingIndex;
  }, [rollingIndex]);

  // Reset to first slide on page change
  useEffect(() => {
    setRollingIndex(0);
    prevIndexRef.current = 0;
  }, [activeTab]);

  // Resettable rolling timer that prevents double-jumps after user interaction
  const resetTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (!isRollingPaused) {
      intervalRef.current = setInterval(() => {
        setRollingIndex((prev) => (prev + 1) % 3);
      }, 4500);
    }
  }, [isRollingPaused]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [resetTimer, activeTab]);

  const handleRollStep = useCallback(
    (dir: 1 | -1) => {
      setRollingIndex((prev) => (prev + dir + 3) % 3);
      resetTimer();
    },
    [resetTimer]
  );

  // 3D Cursor Tilt Handlers
  const handleStageMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5; // -0.5 to 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5; // -0.5 to 0.5
    setMouseTilt({
      x: y * -12, // tilt rotateX
      y: x * 14,  // tilt rotateY
    });
  }, []);

  const handleStageMouseEnter = useCallback(() => {
    setIsHovered(true);
    setIsRollingPaused(true);
  }, []);

  const handleStageMouseLeave = useCallback(() => {
    setIsHovered(false);
    setMouseTilt({ x: 0, y: 0 });
    setIsRollingPaused(false);
  }, []);

  // Mobile Touch Swipe Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsRollingPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current !== null) {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      if (deltaX < -35) {
        handleRollStep(1); // Swipe left -> Next card
      } else if (deltaX > 35) {
        handleRollStep(-1); // Swipe right -> Previous card
      }
      touchStartX.current = null;
    }
    setIsRollingPaused(false);
  };

  const rollingSlides = useMemo(
    () => [
      {
        id: "primary-pulse",
        step: "01 / 03",
        kicker: currentTabMeta.tag,
        title: heroTelemetry.frontLabel,
        value: heroTelemetry.frontValue,
        badge: heroTelemetry.frontBadge,
        subLabel: heroTelemetry.midLabel,
        subValue: heroTelemetry.midValue,
        type: "BARS" as const,
      },
      {
        id: "secondary-Breakdown",
        step: "02 / 03",
        kicker: "Live Telemetry",
        title: heroTelemetry.midLabel,
        value: heroTelemetry.midValue,
        badge: heroTelemetry.backMeta,
        subLabel: heroTelemetry.frontLabel,
        subValue: `${heroTelemetry.frontValue} (${heroTelemetry.frontBadge})`,
        type: "WAVE_RING" as const,
      },
      {
        id: "saturation-index",
        step: "03 / 03",
        kicker: "Operational Index",
        title: heroTelemetry.backLabel,
        value: `${heroTelemetry.progress}%`,
        badge: heroTelemetry.backMeta,
        subLabel: "Module Readiness",
        subValue: `${heroTelemetry.frontLabel}: ${heroTelemetry.frontValue}`,
        type: "PROGRESS" as const,
      },
    ],
    [currentTabMeta.tag, heroTelemetry]
  );

  return (
    <motion.div
      key={`hero-${activeTab}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="hris-glass-panel bg-white dark:bg-[#121620]/95 relative overflow-hidden p-5 sm:p-8 md:p-10 rounded-[28px] sm:rounded-[32px] flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 sm:gap-8 border border-stone-200/90 dark:border-white/10 shadow-[0_16px_40px_-14px_rgba(18,19,24,0.07)] dark:shadow-[0_24px_60px_-15px_rgba(0,0,0,0.6)]"
    >
      {/* Vibrant Ambient Accent Glow Layer (Refracting Through Dark Frosted Glass) */}
      <div
        className={`absolute -right-16 -top-20 w-80 sm:w-96 h-80 sm:h-96 bg-gradient-to-br ${currentTabMeta.glowClass} rounded-full blur-[90px] opacity-65 dark:opacity-85 pointer-events-none z-0`}
      />
      <div className="absolute -left-20 -bottom-24 w-72 sm:w-88 h-72 sm:h-88 bg-gradient-to-tr from-[#FF7852]/14 via-emerald-300/14 to-transparent dark:from-[#FF5722]/26 dark:via-emerald-400/20 dark:to-transparent rounded-full blur-[85px] pointer-events-none z-0" />

      {/* Left Block: Pure Sans-Serif Typography (Size & Weight Contrast) */}
      <div className="relative z-20 w-full lg:max-w-xl space-y-3.5 sm:space-y-4">
        {/* Block Title Tag Pill: Dark Subtle Glass with Accent Status Dot */}
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-stone-100/90 dark:bg-white/[0.06] border border-stone-200/80 dark:border-white/12 backdrop-blur-md shadow-2xs">
          <span
            className="w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor]"
            style={{
              backgroundColor: currentTabMeta.accentColor,
              color: currentTabMeta.accentColor,
            }}
          />
          <span className="text-xs font-bold tracking-tight text-[#32353E] dark:text-stone-200">
            {currentTabMeta.tag}
          </span>
        </div>

        <div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl tracking-[-0.04em] leading-[1.08]">
            <span className="font-light text-[#646876] dark:text-stone-400">
              {currentTabMeta.titleLight}{" "}
            </span>
            <span className="font-extrabold text-[#121318] dark:text-white">
              {currentTabMeta.titleBold}
            </span>
          </h1>
          <p className="text-xs sm:text-sm md:text-base font-normal text-[#646876] dark:text-stone-400 mt-2 leading-relaxed">
            {currentTabMeta.subtitle}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onSyncIntegrity}
            disabled={isSyncingIntegrity}
            className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-white dark:bg-white/[0.06] hover:bg-[#F8F9FB] dark:hover:bg-white/[0.12] text-[#121318] dark:text-stone-200 border border-stone-200/90 dark:border-white/12 text-xs font-bold tracking-tight inline-flex items-center gap-2 shadow-[0_4px_12px_rgba(18,19,24,0.05)] dark:shadow-none transition-all cursor-pointer disabled:opacity-50"
          >
            <ShieldCheck
              className={`w-4 h-4 text-emerald-500 ${
                isSyncingIntegrity ? "animate-pulse" : ""
              }`}
            />
            <span>{isSyncingIntegrity ? "Syncing..." : "Sync HR-ERP"}</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh HRIS Data"
            aria-label="Refresh HRIS Data"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white dark:bg-white/[0.06] hover:bg-[#F8F9FB] dark:hover:bg-white/[0.12] text-[#121318] dark:text-stone-200 border border-stone-200/90 dark:border-white/12 inline-flex items-center justify-center shadow-[0_4px_12px_rgba(18,19,24,0.05)] dark:shadow-none transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw
              className={`w-4 h-4 text-[#F25730] ${
                isRefreshing ? "animate-spin" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Right Block: Dark Frosted Glass Isometric 3D Deck with Smooth Physical Roll & Responsive Fit */}
      <div
        onMouseMove={handleStageMouseMove}
        onMouseEnter={handleStageMouseEnter}
        onMouseLeave={handleStageMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-[420px] lg:max-w-[470px] h-[225px] sm:h-[245px] flex items-center justify-center lg:justify-end shrink-0 select-none cursor-pointer lg:ml-auto"
      >
        {/* Isometric 3D Floor Shadow */}
        <div
          className="absolute bottom-1 right-2 sm:right-6 lg:right-4 w-[260px] sm:w-[320px] h-[54px] sm:h-[64px] rounded-[36px] bg-[#121318]/[0.08] dark:bg-black/60 blur-2xl pointer-events-none z-0"
          style={{
            transform: "rotateX(58deg) rotateZ(-14deg) translateY(18px)",
          }}
        />

        {/* Responsive 3D Isometric Card Stage */}
        <div className="relative w-full max-w-[310px] xs:max-w-[338px] sm:max-w-[368px] h-[166px] sm:h-[176px] mt-2 sm:mt-4 mr-1 sm:mr-4 lg:mr-6 ml-auto">
          {rollingSlides.map((slide, idx) => {
            const currentSlot = (idx - rollingIndex + 3) % 3;
            const prevSlot = (idx - prevIndexRef.current + 3) % 3;

            const isFront = currentSlot === 0;
            const isMid = currentSlot === 1;
            const isBack = currentSlot === 2;

            // Check if card is cycling from Front to Back
            const isCyclingFrontToBack = prevSlot === 0 && currentSlot === 2;

            // Responsive coordinates
            const targetX = isFront ? -10 : isMid ? 14 : 34;
            const targetY = isFront ? 10 : isMid ? -10 : -26;
            const targetRotateX = isFront ? 8 + mouseTilt.x : isMid ? 10 : 12;
            const targetRotateY = isFront ? -10 + mouseTilt.y : isMid ? -13 : -15;
            const targetRotateZ = isFront ? 1.5 : isMid ? 3 : 4.5;
            const targetScale = isFront ? (isHovered ? 1.02 : 1) : isMid ? 0.94 : 0.88;
            const targetOpacity = isFront ? 1 : isMid ? (isDark ? 0.82 : 0.9) : (isDark ? 0.6 : 0.72);
            const zIndex = isFront ? 30 : isMid ? 20 : 10;

            // When card cycles from Front to Back, animate via a graceful arc so it never clips through middle card
            const animatedX = isCyclingFrontToBack ? [-10, -42, targetX] : targetX;
            const animatedY = isCyclingFrontToBack ? [10, 32, targetY] : targetY;
            const animatedRotateZ = isCyclingFrontToBack ? [1.5, -4, targetRotateZ] : targetRotateZ;
            const animatedZIndex = isCyclingFrontToBack ? [30, 25, 10] : zIndex;

            // Dark Frosted Glass Surface Colors
            const cardBg = isDark
              ? isFront
                ? "rgba(20, 25, 36, 0.94)"
                : isMid
                  ? "rgba(15, 19, 28, 0.90)"
                  : "rgba(11, 14, 21, 0.86)"
              : isFront
                ? "#FFFFFF"
                : isMid
                  ? "#F6F7FA"
                  : "#ECEEF4";

            return (
              <motion.div
                key={`iso-card-${activeTab}-${slide.id}`}
                initial={false}
                animate={{
                  x: animatedX,
                  y: animatedY,
                  rotateX: targetRotateX,
                  rotateY: targetRotateY,
                  rotateZ: animatedRotateZ,
                  scale: targetScale,
                  opacity: targetOpacity,
                  zIndex: animatedZIndex,
                }}
                transition={{
                  type: "spring",
                  stiffness: 220,
                  damping: 26,
                  mass: 0.8,
                }}
                onClick={() => {
                  if (isFront) {
                    handleRollStep(1);
                  } else {
                    setRollingIndex(idx);
                    resetTimer();
                  }
                }}
                style={{
                  backgroundColor: cardBg,
                  transformPerspective: 1200,
                }}
                title="Click or swipe to roll 3D isometric deck"
                className={`absolute inset-0 rounded-[22px] sm:rounded-[26px] p-3.5 sm:p-5 flex flex-col justify-between transition-colors duration-300 backdrop-blur-2xl ${
                  isDark
                    ? isFront
                      ? "border border-white/14 shadow-[0_24px_50px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.22),inset_0_0_24px_rgba(255,255,255,0.02)]"
                      : isMid
                        ? "border border-white/9 shadow-[0_16px_36px_-8px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.1)]"
                        : "border border-white/6 shadow-[0_10px_24px_-6px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : isFront
                      ? "border border-stone-200 border-r-[3px] border-b-[4px] border-r-stone-300/90 border-b-stone-300 shadow-[14px_22px_38px_-10px_rgba(18,19,24,0.18),0_4px_12px_rgba(18,19,24,0.06)]"
                      : isMid
                        ? "border border-stone-300/90 border-r-[2px] border-b-[3px] border-r-stone-300 border-b-stone-300 shadow-[8px_14px_26px_-8px_rgba(18,19,24,0.12)]"
                        : "border border-stone-300/90 border-r-[2px] border-b-[3px] border-r-stone-400/60 border-b-stone-400/70 shadow-[4px_8px_16px_-6px_rgba(18,19,24,0.08)]"
                }`}
              >
                {/* Architectural Grid Overlay */}
                <div
                  className="absolute inset-0 rounded-[20px] sm:rounded-[24px] pointer-events-none"
                  style={{
                    backgroundImage: isDark
                      ? "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)"
                      : "linear-gradient(to right, rgba(142,146,159,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(142,146,159,0.18) 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                    opacity: isDark ? 0.75 : 0.22,
                  }}
                />

                {/* Top Header Strip */}
                <div className="relative z-10 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    <span
                      className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full shrink-0 shadow-[0_0_6px_currentColor]"
                      style={{
                        backgroundColor: isFront
                          ? currentTabMeta.accentColor
                          : isDark
                            ? "#64748B"
                            : "#94A3B8",
                        color: currentTabMeta.accentColor,
                      }}
                    />
                    <span
                      className={`text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider truncate ${
                        isFront
                          ? "text-[#646876] dark:text-stone-300"
                          : "text-[#8E929F] dark:text-stone-500"
                      }`}
                    >
                      {slide.kicker}
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-mono font-bold text-[#646876] dark:text-stone-400">
                      · {slide.step}
                    </span>
                  </div>

                  {/* Interactive Layer Dots */}
                  <div
                    className="flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {[0, 1, 2].map((dotIdx) => (
                      <button
                        key={dotIdx}
                        type="button"
                        onClick={() => {
                          setRollingIndex(dotIdx);
                          resetTimer();
                        }}
                        className="h-1.5 rounded-full transition-all duration-300 cursor-pointer"
                        style={{
                          width: rollingIndex === dotIdx ? "16px" : "5px",
                          backgroundColor:
                            rollingIndex === dotIdx
                              ? currentTabMeta.accentColor
                              : isDark
                                ? "rgba(255, 255, 255, 0.18)"
                                : "rgba(142, 146, 159, 0.35)",
                        }}
                        aria-label={`Roll to isometric card ${dotIdx + 1}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Middle Primary Metric Plane */}
                <div
                  className={`relative z-20 flex items-center justify-between gap-2.5 sm:gap-3 my-auto transition-opacity duration-300 ${
                    isFront ? "opacity-100" : isDark ? "opacity-35" : "opacity-40"
                  }`}
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    {/* 3D Isometric Extruded Icon Cube */}
                    <div
                      className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-br ${currentTabMeta.iconBg} shadow-[0_8px_16px_-4px_rgba(0,0,0,0.3)] border border-white/20 flex items-center justify-center shrink-0 [&_svg]:w-4 sm:[&_svg]:w-5 [&_svg]:h-4 sm:[&_svg]:h-5`}
                    >
                      {currentTabMeta.icon}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] sm:text-[11px] font-semibold text-[#646876] dark:text-stone-400 block truncate">
                        {slide.title}
                      </span>
                      <div className="flex items-baseline gap-1.5 sm:gap-2 mt-0.5 flex-wrap">
                        <span className="text-lg sm:text-2xl font-extrabold tracking-[-0.04em] text-[#121318] dark:text-white font-mono tabular-nums">
                          {slide.value}
                        </span>
                        <span className="text-[9px] sm:text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/30 whitespace-nowrap">
                          {slide.badge}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3D Graphic Telemetry Module */}
                  <div className="shrink-0 scale-90 sm:scale-100 origin-right">
                    {slide.type === "BARS" && (
                      <div
                        className="flex items-end gap-1 sm:gap-1.5 h-10 sm:h-12 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl sm:rounded-2xl border shadow-xs"
                        style={{
                          backgroundColor: isDark
                            ? "rgba(18, 22, 32, 0.85)"
                            : "#F8F9FB",
                          borderColor: isDark
                            ? "rgba(255, 255, 255, 0.10)"
                            : "rgb(231 229 228)",
                        }}
                      >
                        {heroTelemetry.bars.map((ratio, bIdx) => (
                          <motion.div
                            key={bIdx}
                            animate={{
                              height: isFront
                                ? `${Math.round(ratio * 28)}px`
                                : "8px",
                            }}
                            transition={{
                              duration: 0.45,
                              delay: bIdx * 0.04,
                            }}
                            className="w-1.5 sm:w-2 rounded-full"
                            style={{
                              background:
                                bIdx === 3
                                  ? currentTabMeta.accentColor
                                  : isDark
                                    ? "rgba(255, 255, 255, 0.16)"
                                    : "rgba(142, 146, 159, 0.35)",
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {slide.type === "WAVE_RING" && (
                      <div
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl border shadow-xs flex items-center justify-center"
                        style={{
                          backgroundColor: isDark
                            ? "rgba(18, 22, 32, 0.85)"
                            : "#F8F9FB",
                          borderColor: isDark
                            ? "rgba(255, 255, 255, 0.10)"
                            : "rgb(231 229 228)",
                        }}
                      >
                        <svg
                          className="w-8 h-8 sm:w-9 sm:h-9 -rotate-90"
                          viewBox="0 0 36 36"
                        >
                          <circle
                            cx="18"
                            cy="18"
                            r="14"
                            fill="none"
                            stroke={isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(142, 146, 159, 0.22)"}
                            strokeWidth="3.5"
                          />
                          <circle
                            cx="18"
                            cy="18"
                            r="14"
                            fill="none"
                            stroke={currentTabMeta.accentColor}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeDasharray={`${Math.round(
                              (heroTelemetry.progress / 100) * 88
                            )} 88`}
                          />
                        </svg>
                      </div>
                    )}

                    {slide.type === "PROGRESS" && (
                      <div
                        className="w-20 sm:w-22 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border shadow-xs space-y-1 sm:space-y-1.5"
                        style={{
                          backgroundColor: isDark
                            ? "rgba(18, 22, 32, 0.85)"
                            : "#F8F9FB",
                          borderColor: isDark
                            ? "rgba(255, 255, 255, 0.10)"
                            : "rgb(231 229 228)",
                        }}
                      >
                        <div className="flex items-center justify-between text-[8px] sm:text-[9px] font-mono font-bold text-[#646876] dark:text-stone-400">
                          <span>INDEX</span>
                          <span>{heroTelemetry.progress}%</span>
                        </div>
                        <div className="w-full h-1.5 sm:h-2 rounded-full bg-stone-200/80 dark:bg-white/10 overflow-hidden">
                          <motion.div
                            animate={{
                              width: isFront
                                ? `${heroTelemetry.progress}%`
                                : "30%",
                            }}
                            transition={{ duration: 0.5 }}
                            className="h-full rounded-full"
                            style={{
                              backgroundColor: currentTabMeta.accentColor,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Metadata Strip */}
                <div
                  className={`relative z-10 pt-1.5 sm:pt-2 border-t border-stone-200/80 dark:border-white/10 flex items-center justify-between text-[9px] sm:text-[10px] transition-opacity duration-300 ${
                    isFront ? "opacity-100" : isDark ? "opacity-35" : "opacity-40"
                  }`}
                >
                  <span className="font-semibold text-[#8E929F] dark:text-stone-400 truncate">
                    {slide.subLabel}
                  </span>
                  <span className="font-bold text-[#32353E] dark:text-stone-200 font-mono tabular-nums truncate max-w-[170px] sm:max-w-[190px]">
                    {slide.subValue}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
});
