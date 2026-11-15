import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Menu,
  X,
  ChevronDown,
  Database,
  Users,
  ShoppingBag,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PUBLIC_CMS,
  extractScenePaletteFromImage,
  formatAsciiAnnouncementSegments,
  harmonizeScenePalette,
  isAnnualEventActive,
  mergePublicCms,
  PublicCmsConfig,
} from "@/constants/cmsDefaults";
import {
  broadcastCmsUpdate,
  getLatestCmsSnapshot,
  recordServerCmsSnapshot,
  subscribeToCmsUpdates,
} from "@/utils/cmsLiveSync";

let cachedPublicCms: PublicCmsConfig | null = null;
const cmsListeners = new Set<(cms: PublicCmsConfig) => void>();
const verifiedOrnamentPalettes = new Map<
  string,
  { primary: string; secondary: string; surfaceTint: string; badgeText: string }
>();

export function usePublicCmsConfig(
  override?: Partial<PublicCmsConfig> | null,
): PublicCmsConfig {
  const [cms, setCms] = useState<PublicCmsConfig>(() => {
    if (override) return mergePublicCms(override);
    const liveSnap = getLatestCmsSnapshot<Partial<PublicCmsConfig>>("public");
    if (liveSnap) {
      const merged = mergePublicCms(liveSnap);
      cachedPublicCms = merged;
      return merged;
    }
    return cachedPublicCms || DEFAULT_PUBLIC_CMS;
  });

  useEffect(() => {
    if (override) {
      setCms(mergePublicCms(override));
      return;
    }
    const listener = (updated: PublicCmsConfig) => setCms(updated);
    cmsListeners.add(listener);

    const unsubscribeLive = subscribeToCmsUpdates<Partial<PublicCmsConfig>>(
      "public",
      (data) => {
        const merged = mergePublicCms(data);
        cachedPublicCms = merged;
        cachedFooterCms = data;
        setCms(merged);
      },
    );

    const liveSnap = getLatestCmsSnapshot<Partial<PublicCmsConfig>>("public");
    if (liveSnap) {
      const merged = mergePublicCms(liveSnap);
      cachedPublicCms = merged;
      setCms(merged);
    }

    let mounted = true;
    fetch("/api/cms/public", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (mounted && data && typeof data === "object") {
          let merged = mergePublicCms(data);
          // Self-heal auto-theme palette if an uploaded ornament banner exists
          if (merged.event_scene_auto_theme && merged.event_ornament_url) {
            const cachedPal = verifiedOrnamentPalettes.get(merged.event_ornament_url);
            if (cachedPal) {
              merged = {
                ...merged,
                event_primary_color: cachedPal.primary,
                event_secondary_color: cachedPal.secondary,
                event_surface_tint: cachedPal.surfaceTint,
                event_badge_text_color: cachedPal.badgeText,
              };
            } else {
              try {
                const extracted = await extractScenePaletteFromImage(merged.event_ornament_url);
                verifiedOrnamentPalettes.set(merged.event_ornament_url, extracted);
                merged = {
                  ...merged,
                  event_primary_color: extracted.primary,
                  event_secondary_color: extracted.secondary,
                  event_surface_tint: extracted.surfaceTint,
                  event_badge_text_color: extracted.badgeText,
                };
              } catch {
                // ignore CORS on external non-data URLs
              }
            }
          }
          if (mounted) {
            cachedPublicCms = merged;
            recordServerCmsSnapshot("public", merged);
            setCms(merged);
          }
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
      cmsListeners.delete(listener);
      unsubscribeLive();
    };
  }, [override]);

  return override ? mergePublicCms(override) : cms;
}

export function PublicTopExperience({
  cmsOverride,
  extraAnnouncementText,
  previewMode = false,
}: {
  cmsOverride?: Partial<PublicCmsConfig> | null;
  extraAnnouncementText?: string;
  previewMode?: boolean;
}) {
  const cms = usePublicCmsConfig(cmsOverride);
  const eventActive = isAnnualEventActive(cms);
  const sceneThemeActive = eventActive && cms.event_scene_auto_theme;

  const harmonizedPalette = sceneThemeActive
    ? harmonizeScenePalette({
        primary: cms.event_primary_color || "#27272a",
        secondary: cms.event_secondary_color || "#18181b",
        surfaceTint: cms.event_surface_tint || "#f4f4f5",
        badgeText: cms.event_badge_text_color || "#262626",
      })
    : {
        primary: "#b02524",
        secondary: "#8e1d1c",
        surfaceTint: "#fff1f2",
        badgeText: "#8e1d1c",
      };

  const primaryColor = harmonizedPalette.primary;
  const secondaryColor = harmonizedPalette.secondary;
  const surfaceTint = harmonizedPalette.surfaceTint;
  const badgeTextColor = harmonizedPalette.badgeText;

  useEffect(() => {
    if (previewMode) return;
    const root = document.documentElement;
    if (sceneThemeActive) {
      root.setAttribute("data-public-scene", "active");
      root.style.setProperty("--scene-primary", primaryColor);
      root.style.setProperty("--scene-secondary", secondaryColor);
      root.style.setProperty("--scene-surface", surfaceTint);
      root.style.setProperty("--scene-badge-text", badgeTextColor);
    } else {
      root.removeAttribute("data-public-scene");
      root.style.removeProperty("--scene-primary");
      root.style.removeProperty("--scene-secondary");
      root.style.removeProperty("--scene-surface");
      root.style.removeProperty("--scene-badge-text");
    }
    return () => {
      if (!previewMode) {
        root.removeAttribute("data-public-scene");
      }
    };
  }, [
    sceneThemeActive,
    primaryColor,
    secondaryColor,
    surfaceTint,
    badgeTextColor,
    previewMode,
  ]);

  const combinedAnnouncementText = [
    cms.announcement_text,
    extraAnnouncementText,
  ]
    .filter(Boolean)
    .join(" · ");

  const segments = formatAsciiAnnouncementSegments(
    combinedAnnouncementText,
    cms.announcement_ascii_style || "industrial",
  );

  const marqueeDuration =
    cms.announcement_speed === "fast"
      ? "20s"
      : cms.announcement_speed === "slow"
        ? "45s"
        : "30s";

  const cleanWaNumber = (cms.whatsapp_number || "6281111113993").replace(
    /[^0-9]/g,
    "",
  );
  const ornamentHeight = Math.max(
    56,
    Math.min(160, Number(cms.event_ornament_height) || 88),
  );
  const ornamentPosX =
    typeof cms.event_ornament_pos_x === "number" && !isNaN(cms.event_ornament_pos_x)
      ? cms.event_ornament_pos_x
      : 50;
  const ornamentPosY =
    typeof cms.event_ornament_pos_y === "number" && !isNaN(cms.event_ornament_pos_y)
      ? cms.event_ornament_pos_y
      : 50;

  const alphaMaskStyle: React.CSSProperties = {
    WebkitMaskImage:
      "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 55%, rgba(0,0,0,0.45) 82%, rgba(0,0,0,0) 100%)",
    maskImage:
      "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 55%, rgba(0,0,0,0.45) 82%, rgba(0,0,0,0) 100%)",
  };

  return (
    <div className="w-full relative z-40">
      <style>{`
        @keyframes publicAsciiMarquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-public-ascii-marquee {
          display: flex;
          width: max-content;
          animation: publicAsciiMarquee ${marqueeDuration} linear infinite;
        }
        .animate-public-ascii-marquee:hover {
          animation-play-state: paused;
        }
        ${
          sceneThemeActive
            ? `
          html[data-public-scene="active"] .bg-\\[\\#b02524\\] {
            background-color: ${primaryColor} !important;
          }
          html[data-public-scene="active"] .hover\\:bg-\\[\\#b02524\\]:hover,
          html[data-public-scene="active"] .hover\\:bg-\\[\\#8e1d1c\\]:hover,
          html[data-public-scene="active"] .hover\\:bg-\\[\\#961f1e\\]:hover,
          html[data-public-scene="active"] .hover\\:bg-\\[\\#8d1d1c\\]:hover,
          html[data-public-scene="active"] .hover\\:bg-red-800:hover {
            background-color: ${secondaryColor} !important;
          }
          html[data-public-scene="active"] .text-\\[\\#b02524\\],
          html[data-public-scene="active"] .hover\\:text-\\[\\#b02524\\]:hover,
          html[data-public-scene="active"] .group:hover .group-hover\\:text-\\[\\#b02524\\] {
            color: ${primaryColor} !important;
          }
          html[data-public-scene="active"] .fill-\\[\\#b02524\\] {
            fill: ${primaryColor} !important;
          }
          html[data-public-scene="active"] .border-\\[\\#b02524\\],
          html[data-public-scene="active"] .hover\\:border-\\[\\#b02524\\]:hover {
            border-color: ${primaryColor} !important;
          }
          html[data-public-scene="active"] .from-\\[\\#b02524\\] {
            --tw-gradient-from: ${primaryColor} var(--tw-gradient-from-position) !important;
          }
          html[data-public-scene="active"] .via-\\[\\#961f1e\\] {
            --tw-gradient-via: ${secondaryColor} var(--tw-gradient-via-position) !important;
          }
          html[data-public-scene="active"] .to-\\[\\#8d1d1c\\]\\/95,
          html[data-public-scene="active"] .to-\\[\\#8e1d1c\\],
          html[data-public-scene="active"] .to-red-600 {
            --tw-gradient-to: ${secondaryColor} var(--tw-gradient-to-position) !important;
          }
          html[data-public-scene="active"] .bg-rose-50,
          html[data-public-scene="active"] .bg-red-50\\/90,
          html[data-public-scene="active"] .bg-\\[\\#b02524\\]\\/10 {
            background-color: ${surfaceTint} !important;
          }
          html[data-public-scene="active"] .text-rose-700,
          html[data-public-scene="active"] .text-red-700 {
            color: ${badgeTextColor} !important;
          }
          html[data-public-scene="active"] .text-red-200 {
            color: ${primaryColor}38 !important;
          }
          html[data-public-scene="active"] .border-rose-200,
          html[data-public-scene="active"] .border-red-200\\/80,
          html[data-public-scene="active"] .border-\\[\\#b02524\\]\\/20 {
            border-color: ${primaryColor}30 !important;
          }
        `
            : ""
        }
      `}</style>

      {/* 1. TOP ANNOUNCEMENT BAR (Light Gray Background, Plus Jakarta Sans + ASCII, Running Ticker + Soft Seamless Edge Blending) */}
      {cms.announcement_enabled && combinedAnnouncementText && (
        <div
          className="text-stone-800 border-b border-stone-200/45 py-2.5 px-3 sm:px-6 overflow-hidden relative z-20"
          style={{
            fontFamily:
              "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
            background: sceneThemeActive
              ? `linear-gradient(180deg, #F5F5F4 0%, ${surfaceTint}95 100%)`
              : "linear-gradient(180deg, #F5F5F4 0%, #FAF9F6 100%)",
          }}
        >
          <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 relative">
            {eventActive && cms.event_name && (
              <div className="public-glass-badge hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded-md shrink-0 z-20">
                <span
                  className="public-glass-accent-blur -left-2 -top-2 w-8 h-8"
                  style={{ backgroundColor: primaryColor }}
                  aria-hidden="true"
                />
                <span className="font-mono text-[11px] font-extrabold tracking-widest uppercase text-stone-800 relative z-10">
                  [EVENT]
                </span>
              </div>
            )}

            <div className="flex-1 overflow-hidden relative">
              {/* Left & Right Seamless Edge Gradient Masks */}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#F5F5F4] to-transparent z-10"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#F5F5F4] to-transparent z-10"
                aria-hidden="true"
              />
              <div className="animate-public-ascii-marquee items-center">
                {[0, 1, 2].map((repeatIndex) => (
                  <div
                    key={repeatIndex}
                    className="flex items-center shrink-0"
                    aria-hidden={repeatIndex > 0}
                  >
                    {segments.map((seg, idx) => (
                      <div key={idx} className="inline-flex items-center">
                        <span className="mx-3.5 font-mono text-sm md:text-[15px] font-semibold select-none text-stone-400">
                          {seg.separator}
                        </span>
                        <span className="text-[13px] md:text-[14px] font-bold tracking-tight text-stone-800 whitespace-nowrap">
                          {seg.text}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {cms.announcement_cta_label && (
              <a
                href={
                  cms.announcement_cta_link || `https://wa.me/${cleanWaNumber}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs md:text-[13px] font-extrabold text-white shadow-2xs transition-transform hover:scale-[1.02] shrink-0 z-20"
                style={{ backgroundColor: primaryColor }}
              >
                <span>{cms.announcement_cta_label}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* 2. ANNUAL EVENT ORNAMENT BANNER (Auto Proportional 16:2 Ratio + Seamless Atmospheric Mist Transition) */}
      {eventActive && cms.event_ornament_url && (
        <div
          className="w-full aspect-[16/2] min-h-[68px] max-h-[260px] relative overflow-visible"
          style={{
            aspectRatio: "16 / 2",
            background: `linear-gradient(180deg, ${primaryColor}18 0%, ${surfaceTint}D9 62%, ${surfaceTint}66 100%)`,
          }}
        >
          {/* Continuous Atmospheric Backdrop Glow extending behind the navbar & top of page */}
          <div
            className="pointer-events-none absolute inset-x-0 -top-2 -bottom-16 z-0"
            style={{
              background: `radial-gradient(ellipse 90% 100% at 50% 0%, ${primaryColor}22 0%, ${surfaceTint}D9 54%, rgba(245, 245, 244, 0) 100%)`,
            }}
            aria-hidden="true"
          />

          {/* Ornament Image Layer with Seamless Multi-Stop Alpha Mask */}
          <div
            className="w-full h-full relative z-10 overflow-hidden"
            style={alphaMaskStyle}
          >
            {cms.event_ornament_fit === "repeat-x" ? (
              <div
                className="w-full h-full bg-repeat-x"
                style={{
                  backgroundImage: `url("${cms.event_ornament_url}")`,
                  backgroundSize: "auto 100%",
                  backgroundPosition: `${ornamentPosX}% ${ornamentPosY}%`,
                }}
                role="img"
                aria-label={cms.event_name || "Annual Event Ornament Banner"}
              />
            ) : (
              <img
                src={cms.event_ornament_url}
                alt={cms.event_name || "Annual Event Ornament Banner"}
                className={cn(
                  "w-full h-full select-none pointer-events-none",
                  cms.event_ornament_fit === "contain"
                    ? "object-contain"
                    : "object-cover",
                )}
                style={{
                  objectPosition:
                    cms.event_ornament_fit === "contain"
                      ? "center"
                      : `${ornamentPosX}% ${ornamentPosY}%`,
                }}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            )}
          </div>

          {/* Soft Feather Mist into Header so no hard border is ever visible */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 z-10"
            style={{
              background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, ${surfaceTint}95 65%, ${surfaceTint}E6 100%)`,
            }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

export function PublicHeader({
  cmsOverride,
}: {
  cmsOverride?: Partial<PublicCmsConfig> | null;
} = {}) {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOpOpen, setIsOpOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cms = usePublicCmsConfig(cmsOverride);
  const eventActive = isAnnualEventActive(cms);
  const sceneThemeActive = eventActive && cms.event_scene_auto_theme;
  const harmonized = sceneThemeActive
    ? harmonizeScenePalette({
        primary: cms.event_primary_color || "#047857",
        secondary: cms.event_secondary_color || "#b45309",
        surfaceTint: cms.event_surface_tint || "#ecfdf5",
        badgeText: cms.event_badge_text_color || "#065f46",
      })
    : {
        primary: "#b02524",
        secondary: "#8e1d1c",
        surfaceTint: "#fff1f2",
        badgeText: "#8e1d1c",
      };

  const activeAccent = harmonized.primary;
  const activeSurfaceTint = harmonized.surfaceTint;
  const activeBadgeText = harmonized.badgeText;

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpOpen(false);
    }, 300); // 300ms robust delay
  };

  return (
    <>
      <PublicTopExperience cmsOverride={cmsOverride} />

      <header
        className="backdrop-blur-xl border-b border-stone-200/40 sticky top-0 z-50 flex-none h-[72px] relative transition-colors duration-300"
        style={{
          background:
            eventActive && cms.event_ornament_url
              ? `linear-gradient(180deg, ${activeSurfaceTint}CC 0%, rgba(255,255,255,0.86) 100%)`
              : "rgba(255, 255, 255, 0.88)",
        }}
      >
        <div className="container mx-auto px-4 lg:px-8 h-full flex justify-between items-center max-w-[1400px] relative z-10">
          <Link
            to="/"
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
          >
            <img
              src="/logo.png"
              alt="Paving Joss Logo"
              className="h-8 md:h-10 w-auto object-contain"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
            <div className="flex items-center gap-2">
              <span className="text-xl md:text-2xl font-extrabold text-stone-800 tracking-tight">
                Paving Joss
              </span>
              {eventActive && cms.event_name && (
                <span className="public-glass-badge hidden lg:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider text-stone-800">
                  <span
                    className="public-glass-accent-blur -left-2 -top-2 w-8 h-8"
                    style={{ backgroundColor: activeAccent }}
                    aria-hidden="true"
                  />
                  <Sparkles className="w-2.5 h-2.5 text-stone-500 relative z-10" />
                  <span className="relative z-10">{cms.event_name}</span>
                </span>
              )}
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/"
              className={`text-sm font-semibold transition-colors ${location.pathname === "/" ? "text-[#b02524]" : "text-stone-600 hover:text-[#b02524]"}`}
            >
              Beranda
            </Link>
            <Link
              to="/careers"
              className={`text-sm font-semibold transition-colors ${location.pathname === "/careers" ? "text-[#b02524] font-bold" : "text-stone-600 hover:text-[#b02524]"}`}
            >
              Karir
            </Link>
            <Link
              to="/shop"
              className={`text-sm font-semibold transition-colors flex items-center gap-1.5 ${location.pathname === "/shop" ? "text-[#b02524] font-bold" : "text-stone-600 hover:text-[#b02524]"}`}
            >
              <ShoppingBag className="w-4 h-4 text-[#b02524]" />
              <span>Toko Pabrik</span>
            </Link>

            <div
              className="relative ml-2"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                type="button"
                onClick={() => setIsOpOpen((prev) => !prev)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 border rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                  isOpOpen
                    ? "bg-stone-100 border-stone-300 text-stone-900 shadow-inner"
                    : "bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-800",
                )}
              >
                Operasional
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 text-stone-400 transition-transform duration-200",
                    isOpOpen && "rotate-180",
                  )}
                />
              </button>

              {/* Invisible padding bridge so hover isn't lost */}
              <div
                className={cn(
                  "absolute top-full right-0 pt-2 w-64 transition-all duration-200 z-50",
                  isOpOpen
                    ? "opacity-100 pointer-events-auto translate-y-0"
                    : "opacity-0 pointer-events-none translate-y-2",
                )}
              >
                <div className="bg-white border border-stone-200/80 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex flex-col p-2 gap-1 relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#b02524] to-stone-200" />
                  <Link
                    to="/login"
                    onClick={() => setIsOpOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-stone-50 rounded-lg transition-all group/link mt-1"
                  >
                    <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200/80 flex items-center justify-center group-hover/link:bg-white group-hover/link:shadow-sm transition-all group-hover/link:-translate-y-0.5">
                      <Database className="w-4.5 h-4.5 text-[#b02524]" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold uppercase tracking-widest text-stone-900">
                        Portal ERP
                      </span>
                      <span className="text-[10px] text-stone-500 font-medium">
                        Perencanaan Sumber Daya Pabrik
                      </span>
                    </div>
                  </Link>
                  <div className="h-px bg-stone-100 mx-2" />
                  <Link
                    to="/hr-login"
                    onClick={() => setIsOpOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-emerald-50/50 rounded-lg transition-all group/link"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center group-hover/link:bg-white group-hover/link:shadow-sm transition-all group-hover/link:-translate-y-0.5">
                      <Users className="w-4.5 h-4.5 text-emerald-600" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[12px] font-bold uppercase tracking-widest text-emerald-800">
                        Portal SDM
                      </span>
                      <span className="text-[10px] text-emerald-600/80 font-medium">
                        Sistem Manajemen Personalia &amp; HR
                      </span>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </nav>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden inline-flex items-center justify-center p-2 text-stone-600 hover:text-[#b02524] hover:bg-stone-100 rounded-lg transition-colors"
            aria-label="Buka menu navigasi"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Seamless Bottom Gradient Bridge + Ambient Scene Glow into Public Page */}
        <div
          className="pointer-events-none absolute inset-x-0 top-full h-16 z-0"
          style={{
            background:
              location.pathname === "/careers"
                ? "linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0) 100%)"
                : sceneThemeActive
                  ? `linear-gradient(180deg, ${activeSurfaceTint}BF 0%, ${activeSurfaceTint}52 46%, rgba(245,245,244,0) 100%)`
                  : "linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,241,242,0.34) 42%, rgba(245,245,244,0) 100%)",
          }}
          aria-hidden="true"
        />
      </header>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed top-[72px] left-0 w-full bg-white border-b border-stone-200 z-40 shadow-lg animate-in slide-in-from-top-2">
          <nav className="flex flex-col p-4 gap-3">
            <Link
              to="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-lg text-sm font-bold transition-colors ${location.pathname === "/" ? "bg-rose-50 text-[#b02524]" : "text-stone-600 hover:bg-stone-50"}`}
            >
              Beranda
            </Link>
            <Link
              to="/careers"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-lg text-sm font-bold transition-colors ${location.pathname === "/careers" ? "bg-rose-50 text-[#b02524]" : "text-stone-600 hover:bg-stone-50"}`}
            >
              Karir
            </Link>
            <Link
              to="/shop"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`px-4 py-3 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${location.pathname === "/shop" ? "bg-rose-50 text-[#b02524]" : "text-stone-600 hover:bg-stone-50"}`}
            >
              <ShoppingBag className="w-4 h-4 text-[#b02524]" />
              <span>Toko Pabrik</span>
            </Link>

            <div className="mt-2 pt-4 border-t border-stone-100">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest px-4 mb-2 block">
                Portal Operasional Internal
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 flex flex-col items-center gap-1.5 bg-[#b02524] hover:bg-[#8e1d1c] text-white rounded-lg transition-colors"
                >
                  <Database className="w-4 h-4 opacity-90" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Portal ERP
                  </span>
                </Link>
                <Link
                  to="/hr-login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-4 py-3 flex flex-col items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                >
                  <Users className="w-4 h-4 opacity-90" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Portal SDM
                  </span>
                </Link>
              </div>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

let cachedFooterCms: {
  email?: string;
  phone_display?: string;
  footer_copyright?: string;
} | null = null;

export function invalidatePublicFooterCache(newConfig?: PublicCmsConfig) {
  cachedFooterCms = null;
  if (newConfig) {
    const merged = mergePublicCms(newConfig);
    cachedPublicCms = merged;
    cachedFooterCms = merged;
    cmsListeners.forEach((fn) => fn(merged));
    broadcastCmsUpdate("public", merged);
  } else {
    cachedPublicCms = null;
  }
}

export function PublicFooter({
  email,
  phoneDisplay,
  copyright,
}: {
  email?: string;
  phoneDisplay?: string;
  copyright?: string;
} = {}) {
  const currentYear = new Date().getFullYear();
  const [cmsFooter, setCmsFooter] = useState(cachedFooterCms);

  React.useEffect(() => {
    const unsubscribeLive = subscribeToCmsUpdates<Partial<PublicCmsConfig>>(
      "public",
      (data) => {
        cachedFooterCms = data;
        setCmsFooter(data);
      },
    );

    if (email && phoneDisplay && copyright) {
      return () => unsubscribeLive();
    }
    if (cachedFooterCms) {
      setCmsFooter(cachedFooterCms);
      return () => unsubscribeLive();
    }
    let mounted = true;
    fetch("/api/cms/public", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (mounted && data && typeof data === "object") {
          cachedFooterCms = data;
          setCmsFooter(data);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
      unsubscribeLive();
    };
  }, [email, phoneDisplay, copyright]);

  const resolvedEmail = email || cmsFooter?.email || "pavingjoss@gmail.com";
  const resolvedPhone = phoneDisplay || cmsFooter?.phone_display || "0811-1111-3993";
  const resolvedTelHref = `tel:${resolvedPhone.replace(/[^0-9+]/g, "")}`;
  const resolvedCopyright =
    copyright || cmsFooter?.footer_copyright || "Paving Joss - CV. Batu Emas Group";

  return (
    <footer className="bg-white text-stone-800 flex-none h-[60px] md:h-[72px] flex items-center border-t border-stone-200 z-10 relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col md:flex-row justify-between items-center max-w-[1400px] w-full gap-2">
        <div className="flex flex-row gap-4 md:gap-8 items-center text-[11px] md:text-sm font-medium text-stone-600">
          <a
            href={`mailto:${resolvedEmail}`}
            className="hover:text-[#b02524] transition-colors flex items-center gap-2"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
            <span className="hidden sm:inline">{resolvedEmail}</span>
            <span className="sm:hidden">Email</span>
          </a>
          <a
            href={resolvedTelHref}
            className="hover:text-[#b02524] transition-colors flex items-center gap-2"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24c1.12.37 2.33.57 3.57.57c.55 0 1 .45 1 1V20c0 .55-.45 1-1 1c-9.39 0-17-7.61-17-17c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1c0 1.25.2 2.45.57 3.57c.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
            {resolvedPhone}
          </a>
        </div>
        <p className="text-[10px] md:text-xs font-semibold text-stone-500 tracking-wider">
          &copy; {currentYear} {resolvedCopyright}
        </p>
      </div>
    </footer>
  );
}
