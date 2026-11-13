import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  MapPin,
  Phone,
  Mail,
  ArrowRight,
  Star,
  Download,
  Sparkles,
  ShieldCheck,
  Zap,
  Award,
  Building2,
  CheckCircle2,
  Quote,
} from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/layouts/PublicLayout";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import { LiveTileCollage, CatalogProductItem } from "@/components/public/LiveTileCollage";
import { trackPageView, trackActivity } from "@/lib/tracker";
import {
  DEFAULT_PUBLIC_CMS,
  extractScenePaletteFromImage,
  harmonizeScenePalette,
  isAnnualEventActive,
  mergePublicCms,
  PublicCmsConfig,
  PublicPortfolioItem,
} from "@/constants/cmsDefaults";
import {
  getLatestCmsSnapshot,
  recordServerCmsSnapshot,
  subscribeToCmsUpdates,
} from "@/utils/cmsLiveSync";

export default function PublicHome() {
  const [products, setProducts] = useState<CatalogProductItem[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [syncedPortfolio, setSyncedPortfolio] = useState<PublicPortfolioItem[]>([]);
  const [isLoadingShowcase, setIsLoadingShowcase] = useState<boolean>(true);
  const [cms, setCms] = useState<PublicCmsConfig>(() => {
    const snap = getLatestCmsSnapshot<Partial<PublicCmsConfig>>("public");
    return snap ? mergePublicCms(snap) : DEFAULT_PUBLIC_CMS;
  });
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribeLive = subscribeToCmsUpdates<Partial<PublicCmsConfig>>(
      "public",
      (data) => {
        setCms(mergePublicCms(data));
      },
    );

    const fetchPageData = async () => {
      setIsLoadingShowcase(true);
      try {
        const [showcaseRes, cmsRes] = await Promise.all([
          apiFetch("/api/public/showcase"),
          apiFetch("/api/cms/public"),
        ]);
        if (showcaseRes.ok && showcaseRes.data) {
          const galleryList = Array.isArray(showcaseRes.data.gallery_items)
            ? showcaseRes.data.gallery_items
            : [];
          const catList = Array.isArray(showcaseRes.data.categories)
            ? showcaseRes.data.categories
            : [];
          const portfolioList = Array.isArray(showcaseRes.data.portfolio_projects)
            ? showcaseRes.data.portfolio_projects
            : [];

          setProducts(galleryList);
          setAvailableCategories(catList);
          setSyncedPortfolio(portfolioList);
        } else {
          setProducts([]);
          setAvailableCategories([]);
          setSyncedPortfolio([]);
        }
        if (cmsRes.ok && cmsRes.data && typeof cmsRes.data === "object") {
          let merged = mergePublicCms(cmsRes.data);
          if (merged.event_scene_auto_theme && merged.event_ornament_url) {
            try {
              const extracted = await extractScenePaletteFromImage(merged.event_ornament_url);
              merged = {
                ...merged,
                event_primary_color: extracted.primary,
                event_secondary_color: extracted.secondary,
                event_surface_tint: extracted.surfaceTint,
                event_badge_text_color: extracted.badgeText,
              };
            } catch {
              // ignore
            }
          }
          recordServerCmsSnapshot("public", merged);
          setCms(merged);
        }
      } catch {
        setProducts([]);
        setAvailableCategories([]);
        setSyncedPortfolio([]);
      } finally {
        setIsLoadingShowcase(false);
      }
    };
    fetchPageData();
    trackPageView("PUBLIC", "Beranda & Profil Pabrik Paving Joss", "/");

    return () => {
      unsubscribeLive();
    };
  }, []);

  const statIcons = [ShieldCheck, Zap, Award];
  const cleanPhoneHref = `tel:${(cms.phone_display || "081111113993").replace(/[^0-9+]/g, "")}`;
  const cleanWaNumber = (cms.whatsapp_number || "628111113993").replace(/[^0-9]/g, "");
  const eventActive = isAnnualEventActive(cms);
  const sceneThemeActive = eventActive && cms.event_scene_auto_theme;
  const harmonized = sceneThemeActive
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

  const activeSurfaceTint = harmonized.surfaceTint;
  const activePrimaryColor = harmonized.primary;
  const activeSecondaryColor = harmonized.secondary;
  const activeBadgeText = harmonized.badgeText;

  return (
    <div className="min-h-screen bg-[#F5F5F4] font-sans text-stone-900 overflow-x-clip selection:bg-[#b02524] selection:text-white">
      <PublicHeader cmsOverride={cms} />

      <main className="relative pb-16 lg:pb-24">
        {/* Seamless Continuous Top Atmospheric Glow from Event Banner & Glass Header into Hero Section */}
        <div
          className="pointer-events-none absolute inset-x-0 -top-6 h-80 z-0 opacity-60"
          style={{
            background: sceneThemeActive
              ? `radial-gradient(ellipse 95% 85% at 50% 0%, ${activeSurfaceTint}99 0%, ${activeSurfaceTint}4D 45%, rgba(245, 245, 244, 0) 100%)`
              : "radial-gradient(ellipse 95% 85% at 50% 0%, rgba(255, 245, 245, 0.65) 0%, rgba(254, 226, 226, 0.22) 45%, rgba(245, 245, 244, 0) 100%)",
          }}
          aria-hidden="true"
        />

        {/* Hero Section */}
        <section className="relative pt-6 pb-8 sm:pt-10 sm:pb-10 md:pt-12 md:pb-12 lg:pt-16 lg:pb-16 px-4 lg:px-8 max-w-[1400px] mx-auto z-10 overflow-hidden">
          {/* Subtle & Faint Hero Ambient Graphic Accent (Soft luminous diffused glow, tanpa bayangan gelap) */}
          <div
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-12 md:right-20 lg:right-28 w-[340px] sm:w-[460px] h-[340px] sm:h-[460px] rounded-full -z-10 blur-3xl opacity-45"
            style={{
              background: sceneThemeActive
                ? `radial-gradient(circle at center, ${activeSurfaceTint}CC 0%, ${activeSurfaceTint}66 42%, rgba(245, 245, 244, 0) 75%)`
                : "radial-gradient(circle at center, rgba(255, 241, 242, 0.75) 0%, rgba(254, 226, 226, 0.28) 42%, rgba(245, 245, 244, 0) 75%)",
            }}
            aria-hidden="true"
          />

          <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative z-20"
            >
              <div className="public-glass-badge inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest text-stone-800 mb-6">
                <span
                  className="public-glass-accent-blur -left-1 top-1/2 -translate-y-1/2 w-16 h-9"
                  style={{ backgroundColor: activePrimaryColor }}
                  aria-hidden="true"
                />
                <span className="public-glass-icon-well w-5 h-5 rounded-full flex items-center justify-center shrink-0 relative z-10">
                  <Star className="w-3 h-3 text-stone-500" />
                </span>
                <span className="relative z-10">{cms.hero_badge}</span>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-stone-900 tracking-tight leading-[1.1] mb-5 sm:mb-6 relative">
                {cms.hero_title_line1}{" "}
                <br className="hidden md:block" />
                <span
                  className="text-transparent bg-clip-text relative inline-block pb-1 sm:pb-2"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${activePrimaryColor} 0%, ${activeSecondaryColor} 100%)`,
                  }}
                >
                  {cms.hero_title_highlight}
                  <svg
                    className="absolute w-full h-3.5 sm:h-4 -bottom-3 sm:-bottom-4 left-0 pointer-events-none"
                    style={{ color: `${activePrimaryColor}38` }}
                    viewBox="0 0 100 10"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M0 5 Q 50 15 100 5"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="transparent"
                    />
                  </svg>
                </span>
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-stone-600 mb-7 sm:mb-10 max-w-2xl leading-relaxed font-medium">
                {cms.hero_subtitle}
              </p>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-8 sm:mb-10">
                <Link
                  to="/shop"
                  onClick={() => {
                    trackActivity({
                      module: "PUBLIC",
                      activity_type: "SECTION_VIEW",
                      title: "Klik Pesan Sekarang menuju Toko",
                      page_url: "/shop",
                    });
                  }}
                  className="px-6 sm:px-8 py-3.5 sm:py-4 bg-[#b02524] text-white font-bold rounded-2xl shadow-md transition-all hover:-translate-y-0.5 flex items-center gap-2 group cursor-pointer text-sm sm:text-base"
                  style={{ backgroundColor: activePrimaryColor }}
                >
                  <span>{cms.hero_primary_cta}</span>
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button
                  onClick={() => {
                    trackActivity({
                      module: "PUBLIC",
                      activity_type: "SECTION_VIEW",
                      title: "Membuka Modal Galeri Katalog Produk",
                      page_url: "/",
                    });
                    setIsCatalogModalOpen(true);
                  }}
                  className="px-6 sm:px-8 py-3.5 sm:py-4 bg-white text-stone-800 hover:text-[#b02524] font-bold rounded-2xl shadow-sm border border-stone-200 hover:border-[#b02524]/30 hover:bg-[#b02524]/5 transition-all cursor-pointer text-sm sm:text-base"
                >
                  {cms.hero_secondary_cta}
                </button>
              </div>

              {/* Key Executive Trust Badges / Factory Stats (Premium Frosted Glassmorphism) */}
              {cms.show_stats && cms.stats && cms.stats.length > 0 && (
                <div className="pt-1 sm:pt-1.5 relative">
                  {/* Faint Gaussian Ambient Diffusion Behind Glass Badges */}
                  <div
                    className="pointer-events-none absolute -inset-x-3 -inset-y-2 rounded-2xl blur-2xl opacity-15 -z-10"
                    style={{
                      background: `radial-gradient(ellipse 80% 90% at 28% 50%, ${activePrimaryColor}0D 0%, ${activeSurfaceTint}4D 48%, rgba(255,255,255,0) 100%)`,
                    }}
                    aria-hidden="true"
                  />
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-2.5 md:gap-3">
                    {cms.stats.slice(0, 3).map((stat, idx) => {
                      const IconComp = statIcons[idx % statIcons.length];
                      return (
                        <div
                          key={idx}
                          className="public-glass-stat-card group rounded-xl sm:rounded-xl px-3.5 py-2.5 sm:px-3 sm:py-2 md:px-3.5 md:py-2.5 flex items-center gap-3 sm:gap-2.5 md:gap-3 sm:w-auto"
                        >
                          {/* Faint (Samar) Gaussian-Blurred Color Accent Diffusing Through the Glass */}
                          <span
                            className="public-glass-accent-blur left-1 top-1/2 -translate-y-1/2 w-12 h-10"
                            style={{ backgroundColor: activePrimaryColor }}
                            aria-hidden="true"
                          />
                          <div className="public-glass-icon-well w-8 h-8 sm:w-7 sm:h-7 md:w-7.5 md:h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 relative z-10">
                            <IconComp
                              className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-stone-600"
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          </div>
                          <div className="flex flex-col justify-center relative z-10">
                            <div className="text-[13px] sm:text-xs md:text-[13px] font-extrabold tracking-tight text-stone-900 tabular-nums leading-tight whitespace-nowrap">
                              {stat.value}
                            </div>
                            <div className="text-[10px] sm:text-[9px] md:text-[9.5px] font-semibold text-stone-600 uppercase tracking-wider leading-tight mt-0.5 whitespace-nowrap">
                              {stat.label}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </section>

        {/* Relocated About Info / Informasi Lokasi */}
        {cms.show_about && (
          <section className="relative z-30 max-w-[1200px] mx-auto px-4 lg:px-8 mb-12 sm:mb-16 lg:mb-24">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl border border-stone-100 flex flex-col md:flex-row gap-8 lg:gap-16 items-center"
            >
              <div className="flex-1 space-y-6">
                <h2 className="text-3xl font-extrabold text-stone-900">
                  {cms.about_title}
                </h2>
                <p className="text-stone-600 leading-relaxed font-medium">
                  {cms.about_description}
                </p>
                <div className="flex flex-col gap-3">
                  <a
                    href={cleanPhoneHref}
                    className="flex items-center gap-3 text-stone-800 font-bold hover:text-[#b02524] transition-colors group w-fit"
                  >
                    <div className="w-10 h-10 rounded-full bg-stone-100 group-hover:bg-red-50 flex items-center justify-center transition-colors">
                      <Phone className="w-4 h-4" />
                    </div>
                    {cms.phone_display}
                  </a>
                  <a
                    href={`mailto:${cms.email}`}
                    className="flex items-center gap-3 text-stone-800 font-bold hover:text-[#b02524] transition-colors group w-fit"
                  >
                    <div className="w-10 h-10 rounded-full bg-stone-100 group-hover:bg-red-50 flex items-center justify-center transition-colors">
                      <Mail className="w-4 h-4" />
                    </div>
                    {cms.email}
                  </a>
                </div>
              </div>
              <div className="w-full md:w-[45%] h-64 md:h-[400px] bg-stone-100 rounded-3xl overflow-hidden relative group">
                <svg
                  className="absolute inset-0 w-full h-full object-cover transition-all duration-700 opacity-90 group-hover:opacity-100 group-hover:scale-[1.03]"
                  viewBox="0 0 800 600"
                  preserveAspectRatio="xMidYMid slice"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <pattern
                      id="grid"
                      x="0"
                      y="0"
                      width="40"
                      height="40"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 40 0 L 0 0 0 40"
                        fill="none"
                        stroke="#e5e5e5"
                        strokeWidth="1"
                      />
                      <path
                        d="M 10 0 L 10 40 M 20 0 L 20 40 M 30 0 L 30 40 M 0 10 L 40 10 M 0 20 L 40 20 M 0 30 L 40 30"
                        fill="none"
                        stroke="#f5f5f5"
                        strokeWidth="0.5"
                      />
                    </pattern>
                    <filter id="shadow">
                      <feDropShadow
                        dx="0"
                        dy="8"
                        stdDeviation="12"
                        floodOpacity="0.05"
                      />
                    </filter>
                    <filter id="shadow-sm">
                      <feDropShadow
                        dx="0"
                        dy="2"
                        stdDeviation="4"
                        floodOpacity="0.05"
                      />
                    </filter>
                  </defs>

                  <rect width="100%" height="100%" fill="#fafafa" />
                  <rect width="100%" height="100%" fill="url(#grid)" />

                  <path
                    d="M 550,-50 C 580,150 480,300 650,480 C 720,550 780,580 850,650 L 850,-50 Z"
                    fill="#f4f4f5"
                  />
                  <path
                    d="M 550,-50 C 580,150 480,300 650,480 C 720,550 780,580 850,650"
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="2"
                  />

                  <g
                    fill="#ffffff"
                    stroke="#e5e5e5"
                    strokeWidth="1"
                    filter="url(#shadow)"
                  >
                    <rect x="240" y="240" width="60" height="80" rx="6" />
                    <rect x="320" y="260" width="110" height="60" rx="6" />
                    <rect x="240" y="340" width="190" height="40" rx="6" />
                    <rect x="140" y="240" width="80" height="40" rx="6" />
                    <rect x="140" y="300" width="80" height="80" rx="6" />
                    <rect x="320" y="180" width="60" height="60" rx="6" />
                    <rect x="400" y="210" width="40" height="30" rx="4" />
                    <rect x="180" y="160" width="120" height="60" rx="6" />
                  </g>

                  <path
                    d="M -50,150 L 230,230 L 450,230 L 850,100"
                    fill="none"
                    stroke="#d4d4d8"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M 230,230 L 230,650"
                    fill="none"
                    stroke="#d4d4d8"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M 450,230 L 450,650"
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  <path
                    d="M 100,290 L 230,290"
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="4"
                  />
                  <path
                    d="M 310,230 L 310,400 L 450,400"
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="4"
                  />
                  <path
                    d="M 230,400 L -50,400"
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="4"
                  />

                  <rect
                    x="320"
                    y="260"
                    width="110"
                    height="60"
                    rx="6"
                    fill="#f4f4f5"
                    stroke="#d4d4d8"
                    strokeWidth="2"
                    filter="url(#shadow-sm)"
                  />
                  <g stroke="#e4e4e7" strokeWidth="2" strokeLinecap="round">
                    <line x1="335" y1="275" x2="415" y2="275" />
                    <line x1="335" y1="285" x2="415" y2="285" />
                    <line x1="335" y1="295" x2="415" y2="295" />
                    <line x1="335" y1="305" x2="385" y2="305" />
                  </g>

                  <circle cx="375" cy="290" r="28" fill="#fee2e2" opacity="0.4" />
                  <circle cx="375" cy="290" r="16" fill="#fca5a5" opacity="0.5" />
                  <circle cx="375" cy="290" r="5" fill="#b02524" />
                  <circle cx="375" cy="290" r="2" fill="#ffffff" />
                </svg>
                <div className="absolute inset-0 bg-gradient-to-t from-stone-100/50 via-transparent to-transparent pointer-events-none" />

                <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-xl p-4 rounded-[20px] flex items-center justify-between shadow-2xl border border-white/50 transform translate-y-2 opacity-90 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-out z-10">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0 border border-red-100 mt-0.5">
                      <MapPin className="w-4 h-4 text-[#b02524]" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-stone-900 mb-0.5">
                        {cms.address_headline}
                      </div>
                      <div className="text-[10px] text-stone-500 font-medium leading-tight max-w-[220px]">
                        {cms.address_full}
                      </div>
                    </div>
                  </div>
                  <a
                    href={cms.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-[#b02524] text-white rounded-lg text-[10px] font-bold tracking-wide hover:bg-[#8e1d1c] transition-colors shrink-0"
                  >
                    Rute <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </motion.div>
          </section>
        )}

        {/* Specialist Experts Section */}
        {cms.show_experts && cms.experts && cms.experts.length > 0 && (
          <section className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8 lg:py-16">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-black text-stone-900 tracking-tight">
                {cms.experts_section_title}
              </h2>
              <p className="text-stone-500 mt-3 font-medium max-w-2xl mx-auto leading-relaxed">
                {cms.experts_section_subtitle}
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 max-w-5xl mx-auto xl:max-w-6xl">
              {cms.experts.map((expert, idx) => (
                <motion.div
                  key={expert.id || idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white rounded-[2rem] p-8 lg:p-10 shadow-2xl shadow-stone-200/50 border border-stone-100 flex flex-col md:flex-row gap-6 items-center md:items-start group hover:-translate-y-1 transition-transform"
                >
                  <div className="w-24 h-24 lg:w-32 lg:h-32 bg-stone-50 rounded-full flex-shrink-0 flex items-center justify-center border-4 border-white shadow-inner relative overflow-hidden group-hover:border-red-50 transition-colors">
                    <span className="text-5xl font-black text-stone-300">
                      {expert.initial || expert.name?.charAt(0) || "P"}
                    </span>
                  </div>
                  <div className="text-center md:text-left">
                    <h3 className="text-2xl font-black text-stone-900 mb-1">
                      {expert.name}{" "}
                      {expert.handle && (
                        <span className="text-sm font-bold text-stone-400">
                          ({expert.handle})
                        </span>
                      )}
                    </h3>
                    <div className="public-glass-badge text-stone-800 font-bold text-xs uppercase tracking-widest mb-4 inline-flex items-center px-3 py-1 rounded-lg">
                      <span
                        className="public-glass-accent-blur left-0 top-1/2 -translate-y-1/2 w-14 h-8 bg-[#b02524]"
                        aria-hidden="true"
                      />
                      <span className="relative z-10">{expert.role}</span>
                    </div>
                    <p className="text-stone-600 leading-relaxed font-medium text-sm">
                      {expert.bio}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Kolase Foto Produk & Proyek Selesai (Read-Only Synchronized Showcase) */}
        {cms.show_capabilities && (
          <section
            id="katalog"
            className="max-w-[1400px] mx-auto px-4 lg:px-8 py-12 lg:py-20"
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 lg:mb-10">
              <div>
                <div className="public-glass-badge inline-flex items-center gap-2 px-3.5 py-1.5 text-stone-800 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
                  <span
                    className="public-glass-accent-blur left-0 top-1/2 -translate-y-1/2 w-14 h-8 bg-[#b02524]"
                    aria-hidden="true"
                  />
                  <Sparkles className="w-3.5 h-3.5 text-stone-500 relative z-10" />
                  <span className="relative z-10">{cms.capabilities_badge}</span>
                </div>
                <motion.h2
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="text-4xl md:text-5xl font-black text-stone-900 tracking-tight"
                >
                  {cms.capabilities_title}{" "}
                  <span className="text-[#b02524]">{cms.capabilities_title_highlight}</span>
                </motion.h2>
                <p className="text-stone-500 mt-3 max-w-xl font-medium text-sm md:text-base leading-relaxed">
                  {cms.capabilities_subtitle}
                </p>
              </div>
              {products.length > 0 && (
                <Link
                  to="/shop"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-stone-50 text-stone-800 border border-stone-200/90 text-xs font-bold shadow-2xs transition-all self-start md:self-auto"
                >
                  <span>Buka Katalog Toko Pabrik (<span className="font-mono tabular-nums">{products.length}</span> Item)</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#b02524]" />
                </Link>
              )}
            </div>

            {isLoadingShowcase ? (
              <div className="w-full bg-white rounded-3xl border border-stone-200/90 p-10 text-center text-stone-500 text-sm font-medium shadow-xs my-4">
                Memuat sinkronisasi data produk Toko Pabrik &amp; Proyek ERP...
              </div>
            ) : products.length === 0 ? (
              <div className="w-full bg-white rounded-3xl border border-stone-200/90 p-8 sm:p-12 text-center shadow-xs my-4">
                <div className="w-14 h-14 rounded-2xl bg-stone-100/80 text-stone-700 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-6 h-6 text-[#b02524]/70" />
                </div>
                <span className="public-glass-badge text-[10px] font-bold text-stone-800 uppercase tracking-widest px-3.5 py-1.5 rounded-full inline-flex items-center mb-3">
                  <span
                    className="public-glass-accent-blur left-1 top-1/2 -translate-y-1/2 w-14 h-8 bg-[#b02524]"
                    aria-hidden="true"
                  />
                  <span className="relative z-10">Sinkronisasi Otomatis ERP &amp; Toko Pabrik</span>
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
                  Belum Ada Produk Aktif atau Proyek Selesai
                </h3>
                <p className="text-xs sm:text-sm text-stone-500 mt-2.5 max-w-lg mx-auto leading-relaxed font-medium">
                  Galeri ini menampilkan data riil secara otomatis dari produk jadi (Finished Goods) yang dipublikasikan di Toko Pabrik serta Proyek ERP yang telah berstatus Selesai.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-8">
                  {[
                    { id: "ALL", label: "Semua Produk & Proyek" },
                    ...availableCategories.map((c) => ({ id: c, label: c })),
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeCategory === cat.id
                          ? "bg-[#b02524] text-white shadow-sm"
                          : "bg-white text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-stone-200/80"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <LiveTileCollage
                  products={products}
                  activeCategory={activeCategory}
                />
              </>
            )}
          </section>
        )}

        {/* B2B Project Portfolio & Completed ERP Projects Section */}
        {cms.show_portfolio && (() => {
          const customPortfolio = Array.isArray(cms.portfolio_items)
            ? cms.portfolio_items.filter(
                (item) => item && !["PRJ-01", "PRJ-02", "PRJ-03"].includes(String(item.id)),
              )
            : [];
          const combinedPortfolio: PublicPortfolioItem[] = [
            ...syncedPortfolio,
            ...customPortfolio.filter(
              (c) => !syncedPortfolio.some((s) => s.id === c.id || s.project_name === c.project_name),
            ),
          ];

          return (
            <section className="max-w-[1400px] mx-auto px-4 lg:px-8 py-12 lg:py-16">
              <div className="mb-10">
                <div className="public-glass-badge inline-flex items-center gap-2 px-3.5 py-1.5 text-stone-800 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
                  <span
                    className="public-glass-accent-blur left-0 top-1/2 -translate-y-1/2 w-14 h-8 bg-[#b02524]"
                    aria-hidden="true"
                  />
                  <Building2 className="w-3.5 h-3.5 text-stone-500 relative z-10" />
                  <span className="relative z-10">{cms.portfolio_section_badge}</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-stone-900 tracking-tight">
                  {cms.portfolio_section_title}
                </h2>
                <p className="text-stone-500 mt-2.5 max-w-2xl font-medium text-sm md:text-base leading-relaxed">
                  {cms.portfolio_section_subtitle}
                </p>
              </div>

              {combinedPortfolio.length === 0 ? (
                <div className="w-full bg-white rounded-3xl border border-stone-200/90 p-8 sm:p-12 text-center shadow-xs">
                  <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-600 flex items-center justify-center mx-auto mb-3">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-stone-900">
                    Belum Ada Riwayat Proyek Selesai
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-500 mt-2 max-w-lg mx-auto leading-relaxed font-medium">
                    Portofolio ini terhubung langsung dengan database Proyek ERP yang telah diselesaikan (Finished/Completed) dan riwayat pengiriman pesanan Toko Pabrik.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                  {combinedPortfolio.map((item, idx) => (
                    <motion.div
                      key={item.id || idx}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.08 }}
                      className="bg-white rounded-3xl border border-stone-200/90 overflow-hidden shadow-xs hover:shadow-xl transition-all flex flex-col justify-between group"
                    >
                      <div>
                        {item.image_url && item.image_url.trim() !== "" ? (
                          <div className="h-48 w-full bg-stone-100 overflow-hidden relative">
                            <img
                              src={item.image_url}
                              alt={item.project_name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-stone-950/75 via-stone-950/20 to-transparent" />
                            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white text-xs font-bold">
                              <span className="flex items-center gap-1.5 truncate pr-2">
                                <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                <span className="truncate">{item.location}</span>
                              </span>
                              <span className="shrink-0 font-mono tabular-nums">{item.year}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="h-32 w-full bg-gradient-to-br from-stone-900 to-stone-800 p-5 flex flex-col justify-between relative overflow-hidden">
                            <div
                              className="absolute inset-0 opacity-15 pointer-events-none"
                              style={{
                                backgroundImage:
                                  "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.35) 1px, transparent 0)",
                                backgroundSize: "18px 18px",
                              }}
                            />
                            <div className="relative z-10 flex items-center justify-between text-[11px] font-mono tabular-nums font-bold text-amber-400">
                              <span>PROYEK TERVERIFIKASI ERP</span>
                              <span>{item.year}</span>
                            </div>
                            <div className="relative z-10 flex items-center gap-1.5 text-white text-xs font-bold truncate">
                              <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                              <span className="truncate">{item.location}</span>
                            </div>
                          </div>
                        )}

                        <div className="p-6 space-y-3">
                          <div className="text-xs text-stone-500 font-semibold flex items-center gap-1.5 flex-wrap">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{item.client_name}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#b02524] font-bold font-mono tabular-nums">{item.supply_volume}</span>
                          </div>

                          <h3 className="text-lg font-black text-stone-900 leading-snug">
                            {item.project_name}
                          </h3>

                          <p className="text-xs font-bold text-stone-600">
                            Material: <span className="font-medium text-stone-500">{item.product_used}</span>
                          </p>
                        </div>
                      </div>

                      {(item.testimonial_quote || item.testimonial_author) && (
                        <div className="px-6 pb-5 pt-4 border-t border-stone-100 bg-stone-50/60">
                          {item.testimonial_quote ? (
                            <div className="flex items-start gap-2.5">
                              <Quote className="w-4 h-4 text-[#b02524] shrink-0 mt-0.5 opacity-80" />
                              <div>
                                <p className="text-xs text-stone-600 italic leading-relaxed">
                                  "{item.testimonial_quote}"
                                </p>
                                {item.testimonial_author && (
                                  <p className="text-[11px] font-bold text-stone-800 mt-2">
                                    {item.testimonial_author}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] font-mono font-bold text-stone-600">
                              {item.testimonial_author}
                            </p>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </section>
          );
        })()}

        {/* Visual Break / Call To Action Banner */}
        {cms.show_cta_banner && (
          <section className="mt-12 lg:mt-20 mb-16 lg:mb-24 px-4 lg:px-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="max-w-[1400px] mx-auto bg-white rounded-[2.5rem] border border-stone-200/90 p-10 md:p-16 lg:p-20 text-center relative overflow-hidden shadow-2xs"
            >
              <div className="relative z-10">
                <h2 className="text-3xl md:text-5xl font-black text-stone-900 mb-6 tracking-tight max-w-2xl mx-auto">
                  {cms.cta_banner_title}
                </h2>
                <p className="text-stone-600 font-medium mb-10 max-w-lg mx-auto">
                  {cms.cta_banner_subtitle}
                </p>
                <a
                  href={`https://wa.me/${cleanWaNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-[#b02524] text-white hover:bg-[#8e1d1c] font-bold rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="currentColor"
                  >
                    <path d="M16.75 13.96c.25.13.41.2.46.3.06.11.04.61-.21 1.18-.2.56-1.24 1.1-1.7 1.12-.46.02-.47.36-2.96-.73-2.49-1.09-3.99-3.75-4.11-3.92-.12-.17-.96-1.38-.92-2.61.05-1.22.69-1.8.95-2.04.24-.26.51-.29.68-.26h.47c.15 0 .36-.06.55.45l.69 1.87c.06.13.1.28.01.44l-.27.41-.39.42c-.12.12-.26.25-.12.5c.12.26.62 1.09 1.32 1.78c.91.88 1.71 1.17 1.95 1.3c.24.14.39.12.54-.04l.81-.94c.19-.25.35-.19.58-.11l1.67.88M12 2a10 10 0 0 1 10 10a10 10 0 0 1-10 10c-1.97 0-3.8-.57-5.35-1.55L2 22l1.55-4.65A9.969 9.969 0 0 1 2 12A10 10 0 0 1 12 2m0 2a8 8 0 0 0-8 8c0 1.72.54 3.31 1.46 4.61L4.5 19.5l2.89-.96A7.95 7.95 0 0 0 12 20a8 8 0 0 0 8-8a8 8 0 0 0-8-8z" />
                  </svg>
                  {cms.cta_banner_button}
                </a>
              </div>
            </motion.div>
          </section>
        )}
      </main>

      {/* Catalog Modal */}
      <Modal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        maxWidth="5xl"
        title="Katalog Produk & Profil Perusahaan"
        className="overflow-hidden rounded-[2rem]"
        contentClassName="p-0 flex flex-col h-[85vh] bg-stone-50 border-t border-stone-100"
      >
        <div className="flex-1 w-full overflow-y-auto bg-stone-100/50 flex flex-col p-6 items-center custom-scrollbar shadow-inner relative">
          <div className="w-full max-w-3xl bg-white rounded-[2rem] shadow-xl border border-stone-200 overflow-hidden relative flex flex-col mb-8 shrink-0">
            <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between z-10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
              </div>
              <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-2">
                compro-batu-emas-group.pdf
              </div>
              <div className="w-12 text-right text-xs font-bold text-stone-400">
                1 / 1
              </div>
            </div>

            <div className="flex-1 p-8 md:p-16 flex flex-col items-center text-center bg-white">
              <div className="w-full h-2 bg-[#b02524] rounded-full mb-12"></div>
              <div className="w-24 h-24 mb-8 bg-stone-50 rounded-full flex items-center justify-center border border-stone-100">
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="w-16 h-16 object-contain"
                />
              </div>
              <h1 className="text-4xl font-black text-stone-900 tracking-tighter mb-4 uppercase">
                Profil Perusahaan
              </h1>
              <h2 className="text-xl font-bold text-[#b02524] mb-4 tracking-tight">
                {cms.company_name}
              </h2>
              <p className="text-stone-500 font-medium mb-12 max-w-md mx-auto leading-relaxed">
                {cms.about_description}
              </p>

              <div className="grid grid-cols-2 gap-4 w-full mb-12">
                <div className="aspect-[4/3] bg-stone-50 rounded-xl border border-stone-100 flex items-center justify-center p-4">
                  <div className="w-full h-full border-2 border-dashed border-stone-200 rounded-lg flex items-center justify-center flex-col gap-2">
                    <div className="w-10 h-10 bg-stone-100 rounded-full"></div>
                    <div className="w-2/3 h-2 bg-stone-200 rounded-full"></div>
                  </div>
                </div>
                <div className="aspect-[4/3] bg-stone-50 rounded-xl border border-stone-100 flex items-center justify-center p-4">
                  <div className="w-full h-full border-2 border-dashed border-stone-200 rounded-lg flex items-center justify-center flex-col gap-2">
                    <div className="w-10 h-10 bg-stone-100 rounded-full"></div>
                    <div className="w-2/3 h-2 bg-stone-200 rounded-full"></div>
                  </div>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-center gap-2 text-stone-400 w-full pt-8 border-t border-stone-100">
                <Star className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  Katalog Produk 2026
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-stone-200 bg-white flex justify-center gap-4 shrink-0 rounded-b-[2rem]">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsCatalogModalOpen(false)}
          >
            Tutup
          </Button>
          <a
            href="/compro.pdf"
            download="profil-perusahaan-batu-emas.pdf"
            className="px-6 py-2.5 rounded-xl text-sm font-bold bg-[#b02524] text-white hover:bg-red-800 shadow-md flex items-center gap-2 transition-all"
          >
            <Download className="w-4 h-4" />
            Unduh PDF Resmi (A4)
          </a>
        </div>
      </Modal>

      <PublicFooter
        email={cms.email}
        phoneDisplay={cms.phone_display}
        copyright={cms.footer_copyright}
      />
    </div>
  );
}
