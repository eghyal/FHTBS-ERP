import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Globe,
  Save,
  RotateCcw,
  ExternalLink,
  Plus,
  Trash2,
  Eye,
  Sparkles,
  Users,
  Briefcase,
  PhoneCall,
  CheckCircle2,
  RefreshCw,
  UploadCloud,
  Palette,
  Calendar,
  Image as ImageIcon,
  Wand2,
  Move,
  Crosshair,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import {
  ANNUAL_EVENT_PRESETS,
  AnnualEventPreset,
  DEFAULT_PUBLIC_CMS,
  extractScenePaletteFromImage,
  harmonizeScenePalette,
  isAnnualEventActive,
  mergePublicCms,
  PublicCmsConfig,
  PublicExpertItem,
  PublicPortfolioItem,
} from "@/constants/cmsDefaults";
import { invalidatePublicFooterCache } from "@/components/layouts/PublicLayout";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Button,
  Input,
  Select,
  Textarea,
  Badge,
  Tabs,
  Card,
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { PublicCmsLivePreview } from "@/components/erp/admin/PublicCmsLivePreview";

type CmsSectionTab =
  | "visibility"
  | "event"
  | "hero"
  | "about"
  | "portfolio"
  | "contact";

export default function PublicCmsAdmin() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [cms, setCms] = useState<PublicCmsConfig>(DEFAULT_PUBLIC_CMS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extractingPalette, setExtractingPalette] = useState(false);
  const [detectedDimensions, setDetectedDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<CmsSectionTab>("visibility");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ornamentContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingOrnament, setIsDraggingOrnament] = useState(false);
  const [dragStart, setDragStart] = useState<{
    clientX: number;
    clientY: number;
    posX: number;
    posY: number;
  } | null>(null);

  const handleOrnamentPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cms.event_ornament_url || cms.event_ornament_fit !== "cover") return;
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDraggingOrnament(true);
    setDragStart({
      clientX: e.clientX,
      clientY: e.clientY,
      posX: typeof cms.event_ornament_pos_x === "number" ? cms.event_ornament_pos_x : 50,
      posY: typeof cms.event_ornament_pos_y === "number" ? cms.event_ornament_pos_y : 50,
    });
  };

  const handleOrnamentPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingOrnament || !dragStart || !ornamentContainerRef.current) return;
    const rect = ornamentContainerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const deltaX = e.clientX - dragStart.clientX;
    const deltaY = e.clientY - dragStart.clientY;

    // Direct physical manipulation:
    // Dragging cursor UP moves image up, revealing bottom -> Y coordinate increases towards 100%.
    // Dragging cursor DOWN moves image down, revealing top -> Y coordinate decreases towards 0%.
    const rawX = dragStart.posX - (deltaX / rect.width) * 100;
    const rawY = dragStart.posY - (deltaY / rect.height) * 100;

    const nextX = Math.round(Math.max(0, Math.min(100, rawX)));
    const nextY = Math.round(Math.max(0, Math.min(100, rawY)));

    setCms((prev) => ({
      ...prev,
      event_ornament_pos_x: nextX,
      event_ornament_pos_y: nextY,
    }));
  };

  const handleOrnamentPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingOrnament) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsDraggingOrnament(false);
      setDragStart(null);
    }
  };

  const handleResetOrnamentPosition = () => {
    setCms((prev) => ({
      ...prev,
      event_ornament_pos_x: 50,
      event_ornament_pos_y: 50,
    }));
  };

  const loadCms = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/cms/public");
      if (res.ok && res.data && typeof res.data === "object") {
        let merged = mergePublicCms(res.data);
        if (merged.event_scene_auto_theme && merged.event_ornament_url) {
          try {
            const extracted = await extractScenePaletteFromImage(merged.event_ornament_url);
            setDetectedDimensions({ width: extracted.width, height: extracted.height });
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
        setCms(merged);
      } else {
        setCms(DEFAULT_PUBLIC_CMS);
      }
    } catch {
      setCms(DEFAULT_PUBLIC_CMS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCms();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const harmonizedColors = harmonizeScenePalette({
        primary: cms.event_primary_color,
        secondary: cms.event_secondary_color,
        surfaceTint: cms.event_surface_tint,
        badgeText: cms.event_badge_text_color,
      });
      const payloadToSave: PublicCmsConfig = cms.event_scene_auto_theme
        ? {
            ...cms,
            event_primary_color: harmonizedColors.primary,
            event_secondary_color: harmonizedColors.secondary,
            event_surface_tint: harmonizedColors.surfaceTint,
            event_badge_text_color: harmonizedColors.badgeText,
          }
        : cms;

      setCms(payloadToSave);
      // Optimistically broadcast immediately (< 5ms) so all open Public, Shop & Careers tabs update right away
      invalidatePublicFooterCache(payloadToSave);
      const res = await apiFetch(
        "/api/cms/public",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadToSave),
        },
        user?.username,
      );
      if (res.ok) {
        invalidatePublicFooterCache(payloadToSave);
        showToast(
          "Public Web CMS configuration and scene theme published & synced in real time!",
          "success",
        );
      } else {
        showToast(res.error || "Failed to save Public Web CMS settings", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Network error while saving CMS", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    setCms(DEFAULT_PUBLIC_CMS);
    setDetectedDimensions(null);
    showToast(
      "Draft restored to factory defaults. Click 'Publish Changes' to apply.",
      "info",
    );
  };

  const handleOrnamentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please upload a valid image file (PNG, WebP, SVG, JPG).", "error");
      return;
    }

    setExtractingPalette(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const rawDataUrl = String(reader.result || "");
        if (!rawDataUrl) {
          setExtractingPalette(false);
          return;
        }

        // Compress / normalize large raster uploads onto a max 1920px wide canvas so Firestore payload stays lightweight
        let finalDataUrl = rawDataUrl;
        try {
          const paletteInfo = await extractScenePaletteFromImage(rawDataUrl);
          setDetectedDimensions({
            width: paletteInfo.width,
            height: paletteInfo.height,
          });

          if (!file.type.includes("svg") && paletteInfo.width > 1920) {
            const img = new Image();
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = rawDataUrl;
            });
            const scale = 1920 / (img.naturalWidth || 1920);
            const canvas = document.createElement("canvas");
            canvas.width = 1920;
            canvas.height = Math.max(60, Math.round((img.naturalHeight || 120) * scale));
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              finalDataUrl = canvas.toDataURL("image/webp", 0.88);
            }
          }

          setCms((prev) => ({
            ...prev,
            event_enabled: true,
            event_ornament_url: finalDataUrl,
            event_scene_auto_theme: true,
            event_primary_color: paletteInfo.primary,
            event_secondary_color: paletteInfo.secondary,
            event_surface_tint: paletteInfo.surfaceTint,
            event_badge_text_color: paletteInfo.badgeText,
          }));

          showToast(
            `Ornament uploaded (${paletteInfo.width}×${paletteInfo.height}px) & scene color palette extracted automatically!`,
            "success",
          );
        } catch {
          setCms((prev) => ({
            ...prev,
            event_enabled: true,
            event_ornament_url: finalDataUrl,
          }));
          showToast("Ornament banner uploaded successfully.", "success");
        } finally {
          setExtractingPalette(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setExtractingPalette(false);
      showToast("Failed to process uploaded ornament image.", "error");
    }
  };

  const handleReExtractFromCurrentUrl = async () => {
    if (!cms.event_ornament_url) {
      showToast("Please upload or provide an ornament image first.", "warning");
      return;
    }
    setExtractingPalette(true);
    try {
      const paletteInfo = await extractScenePaletteFromImage(cms.event_ornament_url);
      setDetectedDimensions({
        width: paletteInfo.width,
        height: paletteInfo.height,
      });
      setCms((prev) => ({
        ...prev,
        event_primary_color: paletteInfo.primary,
        event_secondary_color: paletteInfo.secondary,
        event_surface_tint: paletteInfo.surfaceTint,
        event_badge_text_color: paletteInfo.badgeText,
      }));
      showToast("Scene color palette re-extracted from ornament image!", "success");
    } catch {
      showToast("Could not auto-extract colors from remote URL due to CORS; use file upload or manual color pickers.", "info");
    } finally {
      setExtractingPalette(false);
    }
  };

  const applyAnnualEventPreset = (preset: AnnualEventPreset) => {
    setDetectedDimensions({ width: 1920, height: 120 });
    setCms((prev) => ({
      ...prev,
      event_enabled: true,
      event_name: preset.event_name,
      event_ornament_url: preset.ornament_svg_data_url,
      event_scene_auto_theme: true,
      event_primary_color: preset.primary_color,
      event_secondary_color: preset.secondary_color,
      event_surface_tint: preset.surface_tint,
      event_badge_text_color: preset.badge_text_color,
      announcement_ascii_style: preset.ascii_style,
    }));
    showToast(
      `Applied '${preset.label}' ornament banner (1920×120px) and scene palette!`,
      "success",
    );
  };

  const updateStat = useCallback((idx: number, field: "value" | "label", val: string) => {
    setCms((prev) => {
      const next = [...prev.stats];
      next[idx] = { ...next[idx], [field]: val };
      return { ...prev, stats: next };
    });
  }, []);

  const updateExpert = useCallback(
    (idx: number, field: keyof PublicExpertItem, val: string) => {
      setCms((prev) => {
        const next = [...prev.experts];
        next[idx] = { ...next[idx], [field]: val };
        return { ...prev, experts: next };
      });
    },
    [],
  );

  const addExpert = useCallback(() => {
    const next: PublicExpertItem = {
      id: `EXP-${Date.now()}`,
      initial: "A",
      name: "Specialist Name",
      handle: "@Specialist",
      role: "Quality & Engineering Lead",
      bio: "Brief professional summary highlighting manufacturing precision and SNI quality assurance.",
    };
    setCms((prev) => ({ ...prev, experts: [...prev.experts, next] }));
  }, []);

  const removeExpert = useCallback(
    (idx: number) => {
      setCms((prev) => {
        if (prev.experts.length <= 1) {
          showToast("At least 1 expert profile is required.", "warning");
          return prev;
        }
        return { ...prev, experts: prev.experts.filter((_, i) => i !== idx) };
      });
    },
    [showToast],
  );

  const updatePortfolio = useCallback(
    (idx: number, field: keyof PublicPortfolioItem, val: string) => {
      setCms((prev) => {
        const next = [...prev.portfolio_items];
        next[idx] = { ...next[idx], [field]: val };
        return { ...prev, portfolio_items: next };
      });
    },
    [],
  );

  const addPortfolio = useCallback(() => {
    const next: PublicPortfolioItem = {
      id: `PRJ-${Date.now().toString().slice(-4)}`,
      project_name: "",
      client_name: "",
      location: "Banyuwangi, Jawa Timur",
      supply_volume: "",
      product_used: "",
      year: new Date().getFullYear().toString(),
      image_url: "",
      testimonial_quote: "",
      testimonial_author: "",
    };
    setCms((prev) => ({
      ...prev,
      portfolio_items: [next, ...prev.portfolio_items],
    }));
  }, []);

  const removePortfolio = useCallback((idx: number) => {
    setCms((prev) => ({
      ...prev,
      portfolio_items: prev.portfolio_items.filter((_, i) => i !== idx),
    }));
  }, []);

  const eventCurrentlyActive = useMemo(() => isAnnualEventActive(cms), [cms]);
  const harmonizedPreview = useMemo(
    () =>
      eventCurrentlyActive && cms.event_scene_auto_theme
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
          },
    [
      eventCurrentlyActive,
      cms.event_scene_auto_theme,
      cms.event_primary_color,
      cms.event_secondary_color,
      cms.event_surface_tint,
      cms.event_badge_text_color,
    ],
  );
  const previewPrimaryColor = harmonizedPreview.primary;
  const previewSecondaryColor = harmonizedPreview.secondary;
  const previewSurfaceTint = harmonizedPreview.surfaceTint;
  const previewBadgeText = harmonizedPreview.badgeText;

  return (
    <div className="space-y-6 pb-16">
      {/* Standard ERP PageHeader (100% English) */}
      <PageHeader
        title="Public Web CMS"
        subtitle="Website content & portfolio manager"
        icon={<Globe className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={loadCms}
              disabled={loading || saving}
              title="Refresh CMS Content"
              aria-label="Refresh CMS Content"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleResetDefault}
              disabled={saving}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Reset Defaults
            </Button>
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-medium text-stone-700 transition-colors shadow-2xs"
            >
              <ExternalLink className="w-3.5 h-3.5 text-stone-500" />
              <span>Open Public Website</span>
            </a>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={saving}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              Publish Changes
            </Button>
          </div>
        }
      />

      {/* Standard ERP Segmented Tab Switcher (100% English) */}
      <Tabs
        activeId={activeTab}
        onChange={setActiveTab}
        mobileColumns={3}
        items={[
          {
            id: "visibility",
            label: "Visibility & Top Bar",
            icon: <Eye className="w-3.5 h-3.5" />,
          },
          {
            id: "event",
            label: "Annual Event & Scene",
            icon: <Palette className="w-3.5 h-3.5" />,
            badge: eventCurrentlyActive ? "LIVE" : undefined,
          },
          {
            id: "hero",
            label: "Hero & Factory Stats",
            icon: <Sparkles className="w-3.5 h-3.5" />,
          },
          {
            id: "about",
            label: "About & Experts",
            icon: <Users className="w-3.5 h-3.5" />,
            badge: cms.experts.length,
          },
          {
            id: "portfolio",
            label: "B2B Portfolio",
            icon: <Briefcase className="w-3.5 h-3.5" />,
            badge: cms.portfolio_items.length,
          },
          {
            id: "contact",
            label: "Contact & Footer",
            icon: <PhoneCall className="w-3.5 h-3.5" />,
          },
        ]}
      />

      {loading ? (
        <Card className="p-12 text-center text-stone-500 text-xs font-medium">
          Loading Public Web CMS configuration...
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: EDITOR FORMS (7 COLS) */}
          <div className="xl:col-span-7 space-y-4">
            {/* TAB 1: VISIBILITY & TOP BAR MARQUEE */}
            {activeTab === "visibility" && (
              <div className="bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-stone-900">
                      Section Visibility &amp; Running Top Announcement Bar
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Control landing page section visibility and configure the global light-gray scrolling announcement bar (displayed across Public, Careers, and Shop).
                    </p>
                  </div>
                  <Badge variant="neutral">Global Header Ticker</Badge>
                </div>

                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        key: "announcement_enabled",
                        label: "Running Top Announcement Bar",
                        desc: "Light-gray scrolling marquee (Plus Jakarta Sans + ASCII)",
                      },
                      {
                        key: "show_stats",
                        label: "Factory Key Statistics",
                        desc: "3 concrete strength & daily capacity cards",
                      },
                      {
                        key: "show_about",
                        label: "Company Profile & About Section",
                        desc: "Manufacturing facility & regional coverage narrative",
                      },
                      {
                        key: "show_experts",
                        label: "Quality & Engineering Experts",
                        desc: "Featured leadership and quality control specialists",
                      },
                      {
                        key: "show_capabilities",
                        label: "Manufacturing Capabilities Gallery",
                        desc: "Interactive live tile collage & product catalog",
                      },
                      {
                        key: "show_portfolio",
                        label: "B2B Project Portfolio & Testimonials",
                        desc: "Infrastructure case studies and client quotes",
                      },
                      {
                        key: "show_cta_banner",
                        label: "Bottom WhatsApp Consultation Banner",
                        desc: "Direct B2B project consultation call-to-action",
                      },
                    ].map((item) => {
                      const checked = Boolean((cms as any)[item.key]);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                            checked
                              ? "bg-stone-50/90 border-stone-300 shadow-2xs"
                              : "bg-white border-stone-200/80 opacity-75 hover:opacity-100"
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold text-stone-900">
                              {item.label}
                            </div>
                            <div className="text-[11px] text-stone-500 mt-0.5">
                              {item.desc}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setCms({ ...cms, [item.key]: e.target.checked })
                            }
                            className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                          />
                        </label>
                      );
                    })}
                  </div>

                  <div className="pt-4 border-t border-stone-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                        Top Announcement Marquee Configuration (Plus Jakarta Sans + ASCII)
                      </h3>
                      <Badge variant="info">Light Gray Theme</Badge>
                    </div>

                    <Textarea
                      label="Scrolling Announcement Text (Separate items with '·' or '//')"
                      rows={2}
                      value={cms.announcement_text}
                      onChange={(e) =>
                        setCms({ ...cms, announcement_text: e.target.value })
                      }
                      placeholder="e.g. B2B Project Supply & Contracts · 10,000 m²/Day Capacity · SNI Certified"
                    />

                    <div>
                      <Select
                        label="Marquee Scrolling Speed"
                        value={cms.announcement_speed || "normal"}
                        onChange={(e) =>
                          setCms({
                            ...cms,
                            announcement_speed: e.target.value as any,
                          })
                        }
                        options={[
                          { value: "slow", label: "Slow & Relaxed (45s cycle)" },
                          { value: "normal", label: "Standard Readable (30s cycle)" },
                          { value: "fast", label: "Dynamic Fast (20s cycle)" },
                        ]}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Pinned CTA Button Label"
                        value={cms.announcement_cta_label}
                        onChange={(e) =>
                          setCms({
                            ...cms,
                            announcement_cta_label: e.target.value,
                          })
                        }
                        placeholder="e.g. Project Sales Consultation"
                      />
                      <Input
                        label="CTA Destination URL / WhatsApp Link"
                        value={cms.announcement_cta_link}
                        onChange={(e) =>
                          setCms({
                            ...cms,
                            announcement_cta_link: e.target.value,
                          })
                        }
                        placeholder="https://wa.me/6281111113993"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ANNUAL EVENT ORNAMENT & SCENE PALETTE */}
            {activeTab === "event" && (
              <div className="bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-stone-900">
                      Annual Event Ornament Banner &amp; Dynamic Scene Theme
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Upload a seasonal or annual event ornament banner. Positioned at the very top (or directly beneath the Top Announcement Bar), it automatically synchronizes the color scene of Public, Careers, and Shop pages.
                    </p>
                  </div>
                  <Badge variant={eventCurrentlyActive ? "success" : "neutral"}>
                    {eventCurrentlyActive ? "Scene Active" : "Scene Standby"}
                  </Badge>
                </div>

                <div className="p-5 space-y-5">
                  {/* Master Activation Toggle & Schedule */}
                  <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-4">
                    <label className="flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="text-xs font-bold text-stone-900">
                          Enable Annual Event Ornament Banner
                        </div>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          When enabled (and within the optional date schedule), renders the ornament banner across Public, Careers, and Shop.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={cms.event_enabled}
                        onChange={(e) =>
                          setCms({ ...cms, event_enabled: e.target.checked })
                        }
                        className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                      />
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-stone-200/70">
                      <Input
                        label="Annual Event Title"
                        value={cms.event_name}
                        onChange={(e) =>
                          setCms({ ...cms, event_name: e.target.value })
                        }
                        placeholder="e.g. Semarak Ramadhan & Idul Fitri"
                      />
                      <Input
                        type="date"
                        label="Auto-Start Date (Optional)"
                        value={cms.event_start_date || ""}
                        onChange={(e) =>
                          setCms({ ...cms, event_start_date: e.target.value })
                        }
                      />
                      <Input
                        type="date"
                        label="Auto-End Date (Optional)"
                        value={cms.event_end_date || ""}
                        onChange={(e) =>
                          setCms({ ...cms, event_end_date: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* Quick-Load Curated Annual Event Templates */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                        <Wand2 className="w-3.5 h-3.5 text-stone-600" />
                        <span>Quick-Load Annual Event Ornament Templates (1920 × 240 px · 16:2 Ratio)</span>
                      </label>
                      <span className="text-[11px] text-stone-400">
                        Click any preset to load banner &amp; palette
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {ANNUAL_EVENT_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => applyAnnualEventPreset(preset)}
                          className="text-left p-3 rounded-xl border border-stone-200/90 hover:border-stone-400 bg-white hover:bg-stone-50/80 transition-all group flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-stone-900 group-hover:text-stone-950 truncate">
                              {preset.label}
                            </div>
                            <div className="text-[11px] text-stone-500 mt-0.5 line-clamp-1">
                              {preset.description}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 mt-0.5">
                            <span
                              className="w-4 h-4 rounded-full border border-black/10 shadow-2xs"
                              style={{ backgroundColor: preset.primary_color }}
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-black/10 shadow-2xs"
                              style={{ backgroundColor: preset.secondary_color }}
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-stone-300 shadow-2xs"
                              style={{ backgroundColor: preset.surface_tint }}
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ornament Banner Upload Window with Suggested px x px Resolution */}
                  <div className="pt-4 border-t border-stone-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-stone-600" />
                        <span>Upload Custom Ornament Banner Image</span>
                      </h3>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-900 border border-amber-200/90 text-[11px] font-mono font-bold">
                        Suggested Resolution: 1920 × 240 px (16:2 Ratio)
                      </span>
                    </div>

                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-stone-300 hover:border-stone-500 rounded-xl p-5 bg-stone-50/70 hover:bg-stone-50 transition-all cursor-pointer text-center space-y-2"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/webp,image/jpeg,image/svg+xml"
                        onChange={handleOrnamentUpload}
                        className="hidden"
                      />
                      <div className="w-10 h-10 rounded-xl bg-white border border-stone-200/90 shadow-2xs mx-auto flex items-center justify-center text-stone-700">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-stone-900">
                          Click to upload ornament banner file
                        </p>
                        <p className="text-[11px] text-stone-500 mt-0.5">
                          Recommended size: <strong className="font-mono text-stone-800">1920 × 240 px</strong> (or <strong className="font-mono text-stone-800">1920 × 120 px</strong>) · PNG, WebP, SVG, JPG · Auto-extracts scene color palette on upload
                        </p>
                      </div>
                      {detectedDimensions && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-mono font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>
                            Uploaded Resolution: {detectedDimensions.width} × {detectedDimensions.height} px
                          </span>
                        </div>
                      )}
                    </div>

                    {cms.event_ornament_url && (
                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-700">
                              Current Ornament Banner Preview:
                            </span>
                            {cms.event_ornament_fit === "cover" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-mono text-[10px] font-bold border border-stone-200">
                                <Crosshair className="w-2.5 h-2.5 text-stone-500" />
                                X: {typeof cms.event_ornament_pos_x === "number" ? cms.event_ornament_pos_x : 50}% · Y: {typeof cms.event_ornament_pos_y === "number" ? cms.event_ornament_pos_y : 50}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {cms.event_ornament_fit === "cover" && (
                              <button
                                type="button"
                                onClick={handleResetOrnamentPosition}
                                className="text-stone-600 hover:text-stone-900 font-bold inline-flex items-center gap-1 transition-colors"
                                title="Reset image focus to center (50%, 50%)"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Reset Position</span>
                              </button>
                            )}
                            <Button
                              type="button"
                              variant="danger_soft"
                              size="icon-xs"
                              onClick={() => {
                                setCms({
                                  ...cms,
                                  event_ornament_url: "",
                                  event_enabled: false,
                                });
                                setDetectedDimensions(null);
                              }}
                              title="Remove Ornament"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </Button>
                          </div>
                        </div>

                        {/* Interactive Drag Frame with True 16:2 Proportional Ratio & Seamless Mist Transition */}
                        <div
                          ref={ornamentContainerRef}
                          onPointerDown={handleOrnamentPointerDown}
                          onPointerMove={handleOrnamentPointerMove}
                          onPointerUp={handleOrnamentPointerUp}
                          onPointerCancel={handleOrnamentPointerUp}
                          className={cn(
                            "w-full aspect-[16/2] min-h-[68px] max-h-[260px] rounded-xl overflow-hidden border border-stone-300 relative select-none touch-none transition-shadow",
                            cms.event_ornament_fit === "cover"
                              ? isDraggingOrnament
                                ? "cursor-grabbing ring-2 ring-stone-900/40 shadow-md"
                                : "cursor-grab hover:border-stone-400 hover:shadow-xs"
                              : "cursor-default",
                          )}
                          style={{
                            aspectRatio: "16 / 2",
                            background: `linear-gradient(180deg, ${previewPrimaryColor}18 0%, ${previewSurfaceTint}D9 62%, ${previewSurfaceTint}66 100%)`,
                          }}
                        >
                          {cms.event_ornament_fit === "repeat-x" ? (
                            <div
                              className="w-full h-full bg-repeat-x pointer-events-none"
                              style={{
                                backgroundImage: `url("${cms.event_ornament_url}")`,
                                backgroundSize: "auto 100%",
                                backgroundPosition: `${typeof cms.event_ornament_pos_x === "number" ? cms.event_ornament_pos_x : 50}% ${typeof cms.event_ornament_pos_y === "number" ? cms.event_ornament_pos_y : 50}%`,
                                WebkitMaskImage:
                                  "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 55%, rgba(0,0,0,0.45) 82%, rgba(0,0,0,0) 100%)",
                                maskImage:
                                  "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 55%, rgba(0,0,0,0.45) 82%, rgba(0,0,0,0) 100%)",
                              }}
                            />
                          ) : (
                            <img
                              src={cms.event_ornament_url}
                              alt="Ornament Preview"
                              className={cn(
                                "w-full h-full pointer-events-none select-none",
                                cms.event_ornament_fit === "contain"
                                  ? "object-contain"
                                  : "object-cover",
                              )}
                              style={{
                                objectPosition:
                                  cms.event_ornament_fit === "contain"
                                    ? "center"
                                    : `${typeof cms.event_ornament_pos_x === "number" ? cms.event_ornament_pos_x : 50}% ${typeof cms.event_ornament_pos_y === "number" ? cms.event_ornament_pos_y : 50}%`,
                                WebkitMaskImage:
                                  "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 55%, rgba(0,0,0,0.45) 82%, rgba(0,0,0,0) 100%)",
                                maskImage:
                                  "linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 55%, rgba(0,0,0,0.45) 82%, rgba(0,0,0,0) 100%)",
                              }}
                              draggable={false}
                            />
                          )}

                          {/* Soft Feather Mist into Header preview */}
                          <div
                            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 z-10"
                            style={{
                              background: `linear-gradient(180deg, rgba(255,255,255,0) 0%, ${previewSurfaceTint}95 65%, ${previewSurfaceTint}E6 100%)`,
                            }}
                            aria-hidden="true"
                          />

                          {/* Rule of Thirds Alignment Overlay when in Cover Mode */}
                          {cms.event_ornament_fit === "cover" && (
                            <div
                              className={cn(
                                "pointer-events-none absolute inset-0 transition-opacity duration-150",
                                isDraggingOrnament ? "opacity-100" : "opacity-0 hover:opacity-100",
                              )}
                            >
                              <div className="absolute inset-x-0 top-1/3 border-b border-white/40 border-dashed" />
                              <div className="absolute inset-x-0 top-2/3 border-b border-white/40 border-dashed" />
                              <div className="absolute inset-y-0 left-1/3 border-r border-white/40 border-dashed" />
                              <div className="absolute inset-y-0 left-2/3 border-r border-white/40 border-dashed" />
                            </div>
                          )}

                          {/* Floating instruction tooltip */}
                          {cms.event_ornament_fit === "cover" && (
                            <div className="absolute top-2 left-2 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-900/85 backdrop-blur-md text-white text-[10px] font-bold shadow-sm z-20">
                              <Move className="w-3 h-3 text-amber-300 shrink-0" />
                              <span>{isDraggingOrnament ? "Repositioning..." : "16:2 Frame · Hold & Drag to Reposition"}</span>
                            </div>
                          )}
                        </div>

                        {/* Secondary Precision Sliders & Instant Presets */}
                        {cms.event_ornament_fit === "cover" && (
                          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/90 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-stone-700 flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3.5 h-3.5 text-stone-600" />
                                Precision Controls: Vertical &amp; Horizontal Focus inside 16:2 Frame
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setCms((prev) => ({ ...prev, event_ornament_pos_y: 0 }))}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 transition-colors"
                                >
                                  Top (0%)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCms((prev) => ({ ...prev, event_ornament_pos_y: 50, event_ornament_pos_x: 50 }))}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 transition-colors"
                                >
                                  Center (50%)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCms((prev) => ({ ...prev, event_ornament_pos_y: 100 }))}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 transition-colors"
                                >
                                  Bottom (100%)
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <div className="flex items-center justify-between text-[10px] font-semibold text-stone-600 mb-1">
                                  <span>Vertical Position (Y):</span>
                                  <span className="font-mono font-bold text-stone-900">{typeof cms.event_ornament_pos_y === "number" ? cms.event_ornament_pos_y : 50}%</span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={typeof cms.event_ornament_pos_y === "number" ? cms.event_ornament_pos_y : 50}
                                  onChange={(e) =>
                                    setCms((prev) => ({ ...prev, event_ornament_pos_y: Number(e.target.value) }))
                                  }
                                  className="w-full accent-stone-900 h-1.5 bg-stone-200 rounded-lg cursor-pointer"
                                />
                                <div className="flex justify-between text-[9px] text-stone-400 mt-0.5">
                                  <span>Top</span>
                                  <span>Center</span>
                                  <span>Bottom</span>
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between text-[10px] font-semibold text-stone-600 mb-1">
                                  <span>Horizontal Position (X):</span>
                                  <span className="font-mono font-bold text-stone-900">{typeof cms.event_ornament_pos_x === "number" ? cms.event_ornament_pos_x : 50}%</span>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  value={typeof cms.event_ornament_pos_x === "number" ? cms.event_ornament_pos_x : 50}
                                  onChange={(e) =>
                                    setCms((prev) => ({ ...prev, event_ornament_pos_x: Number(e.target.value) }))
                                  }
                                  className="w-full accent-stone-900 h-1.5 bg-stone-200 rounded-lg cursor-pointer"
                                />
                                <div className="flex justify-between text-[9px] text-stone-400 mt-0.5">
                                  <span>Left</span>
                                  <span>Center</span>
                                  <span>Right</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div className="sm:col-span-1">
                        <Select
                          label="Banner Display Fit"
                          value={cms.event_ornament_fit || "cover"}
                          onChange={(e) =>
                            setCms({
                              ...cms,
                              event_ornament_fit: e.target.value as any,
                            })
                          }
                          options={[
                            { value: "cover", label: "Full-Width Cover (16:2 Auto)" },
                            { value: "contain", label: "Contain Centered (16:2 Auto)" },
                            { value: "repeat-x", label: "Horizontal Pattern Repeat" },
                          ]}
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                          Container Scaling &amp; Edge Mask
                        </label>
                        <div className="h-[38px] px-3 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-between text-[11px] font-mono font-bold text-stone-700">
                          <span>Auto 16:2 Ratio</span>
                          <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[10px]">
                            Seamless Mist
                          </span>
                        </div>
                      </div>
                      <div className="sm:col-span-1 flex items-end">
                        <Button
                          variant="secondary"
                          size="md"
                          className="w-full"
                          onClick={handleReExtractFromCurrentUrl}
                          isLoading={extractingPalette}
                          leftIcon={<Palette className="w-3.5 h-3.5" />}
                        >
                          Re-Extract Palette
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Scene Color Palette Controls (Public, Careers & Shop) */}
                  <div className="pt-4 border-t border-stone-100 space-y-4">
                    <label className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-stone-50 border border-stone-200/90 cursor-pointer">
                      <div>
                        <div className="text-xs font-bold text-stone-900">
                          Synchronize Public, Careers &amp; Shop Palette with Uploaded Ornament
                        </div>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          Automatically adapts primary buttons, hero gradients, active navigation links, and badges across all 3 external pages to match the uploaded ornament scene.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={cms.event_scene_auto_theme}
                        onChange={(e) =>
                          setCms({
                            ...cms,
                            event_scene_auto_theme: e.target.checked,
                          })
                        }
                        className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                      />
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        {
                          key: "event_primary_color",
                          label: "Primary Scene Accent",
                          desc: "CTAs, active nav & marquee glyphs",
                        },
                        {
                          key: "event_secondary_color",
                          label: "Secondary / Hover Tone",
                          desc: "Button hover & hero gradient depth",
                        },
                        {
                          key: "event_surface_tint",
                          label: "Soft Surface Tint",
                          desc: "Badge backgrounds & subtle highlights",
                        },
                        {
                          key: "event_badge_text_color",
                          label: "Badge Contrast Text",
                          desc: "High-legibility label text color",
                        },
                      ].map((swatch) => {
                        const val = (cms as any)[swatch.key] || "#047857";
                        return (
                          <div
                            key={swatch.key}
                            className="p-3 rounded-xl border border-stone-200/90 bg-white space-y-2"
                          >
                            <div className="text-[11px] font-bold text-stone-800">
                              {swatch.label}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={val}
                                onChange={(e) =>
                                  setCms({
                                    ...cms,
                                    [swatch.key]: e.target.value,
                                  })
                                }
                                className="w-8 h-8 rounded-lg border border-stone-200 cursor-pointer p-0.5 bg-white shrink-0"
                              />
                              <input
                                type="text"
                                value={val}
                                onChange={(e) =>
                                  setCms({
                                    ...cms,
                                    [swatch.key]: e.target.value,
                                  })
                                }
                                className="w-full h-8 px-2 rounded-lg border border-stone-200 text-xs font-mono text-stone-800 uppercase"
                              />
                            </div>
                            <div className="text-[10px] text-stone-400">
                              {swatch.desc}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: HERO & FACTORY STATS */}
            {activeTab === "hero" && (
              <div className="bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-stone-900">
                      Hero Banner &amp; Factory Statistics
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Configure the primary value proposition headline, call-to-action buttons, and 3 key manufacturing metrics.
                    </p>
                  </div>
                  <Badge variant="neutral">Hero Section</Badge>
                </div>

                <div className="p-5 space-y-4">
                  <Input
                    label="Top Hero Badge Text"
                    value={cms.hero_badge}
                    onChange={(e) =>
                      setCms({ ...cms, hero_badge: e.target.value })
                    }
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Main Headline (Line 1 - Dark)"
                      value={cms.hero_title_line1}
                      onChange={(e) =>
                        setCms({ ...cms, hero_title_line1: e.target.value })
                      }
                    />
                    <Input
                      label="Highlighted Headline (Line 2 - Scene Accent)"
                      value={cms.hero_title_highlight}
                      onChange={(e) =>
                        setCms({ ...cms, hero_title_highlight: e.target.value })
                      }
                    />
                  </div>

                  <Textarea
                    label="Hero Value Proposition Subtitle"
                    rows={3}
                    value={cms.hero_subtitle}
                    onChange={(e) =>
                      setCms({ ...cms, hero_subtitle: e.target.value })
                    }
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Primary Button Text (To Factory Shop)"
                      value={cms.hero_primary_cta}
                      onChange={(e) =>
                        setCms({ ...cms, hero_primary_cta: e.target.value })
                      }
                    />
                    <Input
                      label="Secondary Button Text (Interactive Catalog)"
                      value={cms.hero_secondary_cta}
                      onChange={(e) =>
                        setCms({ ...cms, hero_secondary_cta: e.target.value })
                      }
                    />
                  </div>

                  <div className="pt-4 border-t border-stone-100 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      3 Factory Key Performance Cards
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {cms.stats.map((st, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-stone-50/70 border border-stone-200/80 space-y-2.5"
                        >
                          <div className="text-[10px] font-mono font-bold text-stone-400 uppercase">
                            Metric #{idx + 1}
                          </div>
                          <Input
                            label="Metric Value"
                            value={st.value}
                            onChange={(e) =>
                              updateStat(idx, "value", e.target.value)
                            }
                            placeholder="e.g. 10.000 m²"
                          />
                          <Input
                            label="Metric Label"
                            value={st.label}
                            onChange={(e) =>
                              updateStat(idx, "label", e.target.value)
                            }
                            placeholder="e.g. Kapasitas / Hari"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: ABOUT, EXPERTS & CAPABILITIES */}
            {activeTab === "about" && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-100">
                    <h2 className="text-sm font-bold text-stone-900">
                      Company Profile &amp; Manufacturing Capabilities Header
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Narrative describing CV. Batu Emas Group and the manufacturing gallery header.
                    </p>
                  </div>
                  <div className="p-5 space-y-4">
                    <Input
                      label="About Us Section Title"
                      value={cms.about_title}
                      onChange={(e) =>
                        setCms({ ...cms, about_title: e.target.value })
                      }
                    />
                    <Textarea
                      label="About Us Narrative Description"
                      rows={3}
                      value={cms.about_description}
                      onChange={(e) =>
                        setCms({ ...cms, about_description: e.target.value })
                      }
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-stone-100">
                      <Input
                        label="Gallery Badge"
                        value={cms.capabilities_badge}
                        onChange={(e) =>
                          setCms({ ...cms, capabilities_badge: e.target.value })
                        }
                      />
                      <Input
                        label="Gallery Title (Line 1)"
                        value={cms.capabilities_title}
                        onChange={(e) =>
                          setCms({ ...cms, capabilities_title: e.target.value })
                        }
                      />
                      <Input
                        label="Gallery Title (Highlight)"
                        value={cms.capabilities_title_highlight}
                        onChange={(e) =>
                          setCms({
                            ...cms,
                            capabilities_title_highlight: e.target.value,
                          })
                        }
                      />
                    </div>
                    <Textarea
                      label="Manufacturing Capabilities Subtitle"
                      rows={2}
                      value={cms.capabilities_subtitle}
                      onChange={(e) =>
                        setCms({
                          ...cms,
                          capabilities_subtitle: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-stone-900">
                        Quality &amp; Engineering Specialist Profiles
                      </h2>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Key personnel displayed on the public landing page.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={addExpert}
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Add Specialist
                    </Button>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Experts Section Title"
                        value={cms.experts_section_title}
                        onChange={(e) =>
                          setCms({
                            ...cms,
                            experts_section_title: e.target.value,
                          })
                        }
                      />
                      <Input
                        label="Experts Section Subtitle"
                        value={cms.experts_section_subtitle}
                        onChange={(e) =>
                          setCms({
                            ...cms,
                            experts_section_subtitle: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-3">
                      {cms.experts.map((exp, idx) => (
                        <div
                          key={exp.id || idx}
                          className="p-4 rounded-xl bg-stone-50/70 border border-stone-200/80 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <Badge variant="neutral">
                              Specialist #{idx + 1} — {exp.name}
                            </Badge>
                            <Button
                              variant="danger_soft"
                              size="icon-xs"
                              onClick={() => removeExpert(idx)}
                              title="Remove Specialist"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <Input
                              label="Initial"
                              maxLength={2}
                              value={exp.initial}
                              onChange={(e) =>
                                updateExpert(idx, "initial", e.target.value)
                              }
                            />
                            <Input
                              label="Full Name"
                              value={exp.name}
                              onChange={(e) =>
                                updateExpert(idx, "name", e.target.value)
                              }
                            />
                            <Input
                              label="Handle / Alias"
                              value={exp.handle}
                              onChange={(e) =>
                                updateExpert(idx, "handle", e.target.value)
                              }
                            />
                            <Input
                              label="Role / Title"
                              value={exp.role}
                              onChange={(e) =>
                                updateExpert(idx, "role", e.target.value)
                              }
                            />
                          </div>
                          <Textarea
                            label="Quality Commitment Quote / Bio"
                            rows={2}
                            value={exp.bio}
                            onChange={(e) =>
                              updateExpert(idx, "bio", e.target.value)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: B2B PROJECT PORTFOLIO */}
            {activeTab === "portfolio" && (
              <div className="bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-stone-900">
                      B2B Project Portfolio &amp; Client Testimonials
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Showcase completed infrastructure supply contracts and verified project manager testimonials.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={addPortfolio}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add Project
                  </Button>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      label="Portfolio Section Badge"
                      value={cms.portfolio_section_badge}
                      onChange={(e) =>
                        setCms({
                          ...cms,
                          portfolio_section_badge: e.target.value,
                        })
                      }
                    />
                    <div className="sm:col-span-2">
                      <Input
                        label="Portfolio Section Title"
                        value={cms.portfolio_section_title}
                        onChange={(e) =>
                          setCms({
                            ...cms,
                            portfolio_section_title: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <Textarea
                    label="Portfolio Section Subtitle"
                    rows={2}
                    value={cms.portfolio_section_subtitle}
                    onChange={(e) =>
                      setCms({
                        ...cms,
                        portfolio_section_subtitle: e.target.value,
                      })
                    }
                  />

                  <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-xs text-emerald-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Auto-Synced with ERP Completed Projects &amp; Active Shop Catalog</span>
                    </div>
                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                      The public Facility Gallery and Project Portfolio automatically display real data from Finished ERP Projects (<code className="font-mono font-bold">FINISHED / COMPLETED / CLOSED</code>), Delivered Shop Orders, and Active Published Shop Products. You can optionally add manual highlight entries below.
                    </p>
                  </div>

                  <div className="space-y-4 pt-2 border-t border-stone-100">
                    {cms.portfolio_items.length === 0 && (
                      <div className="p-6 rounded-xl bg-stone-50 border border-dashed border-stone-200 text-center text-xs text-stone-500">
                        No manual portfolio entries added. Public page automatically displays Completed ERP Projects &amp; Delivered Shop Orders.
                      </div>
                    )}
                    {cms.portfolio_items.map((prj, idx) => (
                      <div
                        key={prj.id || idx}
                        className="p-4 rounded-xl bg-stone-50/70 border border-stone-200/80 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant="neutral">
                            Project #{idx + 1} · {prj.year}
                          </Badge>
                          <Button
                            variant="danger_soft"
                            size="icon-xs"
                            onClick={() => removePortfolio(idx)}
                            title="Delete Project"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Input
                            label="Project Name"
                            value={prj.project_name}
                            onChange={(e) =>
                              updatePortfolio(
                                idx,
                                "project_name",
                                e.target.value,
                              )
                            }
                          />
                          <Input
                            label="Contractor / Client Name"
                            value={prj.client_name}
                            onChange={(e) =>
                              updatePortfolio(
                                idx,
                                "client_name",
                                e.target.value,
                              )
                            }
                          />
                          <Input
                            label="Project Location"
                            value={prj.location}
                            onChange={(e) =>
                              updatePortfolio(idx, "location", e.target.value)
                            }
                          />
                          <Input
                            label="Supply Volume & Year"
                            value={prj.supply_volume}
                            onChange={(e) =>
                              updatePortfolio(
                                idx,
                                "supply_volume",
                                e.target.value,
                              )
                            }
                          />
                          <Input
                            label="Materials Supplied"
                            value={prj.product_used}
                            onChange={(e) =>
                              updatePortfolio(
                                idx,
                                "product_used",
                                e.target.value,
                              )
                            }
                          />
                          <Input
                            label="Project Photo URL"
                            value={prj.image_url}
                            onChange={(e) =>
                              updatePortfolio(idx, "image_url", e.target.value)
                            }
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <Textarea
                              label="Client Testimonial Quote"
                              rows={2}
                              value={prj.testimonial_quote}
                              onChange={(e) =>
                                updatePortfolio(
                                  idx,
                                  "testimonial_quote",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div>
                            <Input
                              label="Testimonial Author & Title"
                              value={prj.testimonial_author}
                              onChange={(e) =>
                                updatePortfolio(
                                  idx,
                                  "testimonial_author",
                                  e.target.value,
                                )
                              }
                            />
                            <div className="mt-2">
                              <Input
                                label="Completion Year"
                                value={prj.year}
                                onChange={(e) =>
                                  updatePortfolio(idx, "year", e.target.value)
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: CONTACT, WHATSAPP & FOOTER */}
            {activeTab === "contact" && (
              <div className="bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden">
                <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-stone-900">
                      Factory Contact, Maps, WhatsApp &amp; Global Footer
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Synchronized automatically with the global footer across Public Home, Careers, and Factory Shop.
                    </p>
                  </div>
                  <Badge variant="info">Global Sync</Badge>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Company / Factory Entity Name"
                      value={cms.company_name}
                      onChange={(e) =>
                        setCms({ ...cms, company_name: e.target.value })
                      }
                    />
                    <Input
                      label="Location Headline"
                      value={cms.address_headline}
                      onChange={(e) =>
                        setCms({ ...cms, address_headline: e.target.value })
                      }
                    />
                    <div className="sm:col-span-2">
                      <Input
                        label="Full Factory Address"
                        value={cms.address_full}
                        onChange={(e) =>
                          setCms({ ...cms, address_full: e.target.value })
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        label="Google Maps Embed / Place URL"
                        value={cms.maps_url}
                        onChange={(e) =>
                          setCms({ ...cms, maps_url: e.target.value })
                        }
                      />
                    </div>
                    <Input
                      label="Display Phone Number"
                      value={cms.phone_display}
                      onChange={(e) =>
                        setCms({ ...cms, phone_display: e.target.value })
                      }
                    />
                    <Input
                      label="Active WhatsApp Number (Format: 628...)"
                      value={cms.whatsapp_number}
                      onChange={(e) =>
                        setCms({ ...cms, whatsapp_number: e.target.value })
                      }
                    />
                    <Input
                      label="Official Factory Email"
                      value={cms.email}
                      onChange={(e) =>
                        setCms({ ...cms, email: e.target.value })
                      }
                    />
                    <Input
                      label="Global Footer Copyright Text"
                      value={cms.footer_copyright}
                      onChange={(e) =>
                        setCms({ ...cms, footer_copyright: e.target.value })
                      }
                    />
                  </div>

                  <div className="pt-4 border-t border-stone-100 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      Bottom B2B Consultation CTA Banner
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="CTA Banner Headline"
                        value={cms.cta_banner_title}
                        onChange={(e) =>
                          setCms({ ...cms, cta_banner_title: e.target.value })
                        }
                      />
                      <Input
                        label="WhatsApp Button Label"
                        value={cms.cta_banner_button}
                        onChange={(e) =>
                          setCms({ ...cms, cta_banner_button: e.target.value })
                        }
                      />
                    </div>
                    <Textarea
                      label="CTA Banner Subtitle"
                      rows={2}
                      value={cms.cta_banner_subtitle}
                      onChange={(e) =>
                        setCms({ ...cms, cta_banner_subtitle: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: LIVE INTERACTIVE PREVIEW (5 COLS) */}
          <PublicCmsLivePreview
            cms={cms}
            eventCurrentlyActive={eventCurrentlyActive}
            previewPrimaryColor={previewPrimaryColor}
            previewSecondaryColor={previewSecondaryColor}
            previewSurfaceTint={previewSurfaceTint}
            previewBadgeText={previewBadgeText}
          />
        </div>
      )}
    </div>
  );
}
