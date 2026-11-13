import React, { useState, useEffect } from "react";
import {
  Globe,
  Save,
  RotateCcw,
  Megaphone,
  Package,
  Truck,
  Plus,
  Trash2,
  ShieldCheck,
  HelpCircle,
  ArrowRight,
  FileText,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { formatIDR } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import {
  DEFAULT_SHOP_CMS,
  mergeShopCms,
  ShopCmsConfig,
  ShopBundleItem,
  ShopFleetItem,
  ShopQualityItem,
  ShopFaqItem,
} from "@/constants/cmsDefaults";
import { broadcastCmsUpdate } from "@/utils/cmsLiveSync";

type ShopEditorSubTab = "banner" | "bundles" | "logistics_faq";

export const ShopCmsEditor: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [cms, setCms] = useState<ShopCmsConfig>(DEFAULT_SHOP_CMS);
  const [subTab, setSubTab] = useState<ShopEditorSubTab>("banner");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchShopCms();
  }, []);

  const fetchShopCms = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/cms/shop");
      if (res.ok && res.data && typeof res.data === "object") {
        setCms(mergeShopCms(res.data));
      } else {
        setCms(DEFAULT_SHOP_CMS);
      }
    } catch {
      setCms(DEFAULT_SHOP_CMS);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      // Optimistically broadcast immediately (< 5ms) so open /shop tabs update right away
      broadcastCmsUpdate("shop", cms);
      const res = await apiFetch(
        "/api/cms/shop",
        {
          method: "PUT",
          body: JSON.stringify(cms),
        },
        user?.username,
      );
      if (res.ok) {
        broadcastCmsUpdate("shop", cms);
        showToast(
          "Shop storefront CMS (/shop) successfully saved and published in real-time!",
          "success",
        );
      } else {
        showToast(res.error || "Failed to save Shop Storefront CMS", "error");
      }
    } catch {
      showToast("Network error while saving Shop Storefront CMS", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setCms(DEFAULT_SHOP_CMS);
    showToast(
      "Shop UI settings reset to defaults. Click Publish to Storefront to save.",
      "info",
    );
  };

  // Bundles Helpers
  const updateBundle = (
    idx: number,
    field: keyof ShopBundleItem,
    val: string | number,
  ) => {
    const next = [...cms.bundles];
    next[idx] = { ...next[idx], [field]: val };
    setCms({ ...cms, bundles: next });
  };

  const addBundle = () => {
    setCms({
      ...cms,
      bundles: [
        ...cms.bundles,
        {
          id: `BND-${Date.now()}`,
          name: "New Project Bundle",
          target_use: "Residential & Commercial Areas",
          items_summary: "Paving Block K-300 (150 m²) + Kanstin (60 Pcs)",
          area_coverage: "Est. Coverage 150 m²",
          bundle_price: 16500000,
          saving_badge: "Save 7%",
          default_qty: 150,
        },
      ],
    });
  };

  const removeBundle = (idx: number) => {
    setCms({
      ...cms,
      bundles: cms.bundles.filter((_, i) => i !== idx),
    });
  };

  // Fleet Helpers
  const updateFleet = (idx: number, field: keyof ShopFleetItem, val: string) => {
    const next = [...cms.fleets];
    next[idx] = { ...next[idx], [field]: val };
    setCms({ ...cms, fleets: next });
  };

  const addFleet = () => {
    setCms({
      ...cms,
      fleets: [
        ...cms.fleets,
        {
          id: `FLT-${Date.now()}`,
          name: "New Delivery Fleet",
          capacity: "50 – 60 m²",
          road_access: "Min. Road Width 4.5 Meters",
          notes: "Direct factory-to-site scheduled delivery.",
        },
      ],
    });
  };

  const removeFleet = (idx: number) => {
    setCms({
      ...cms,
      fleets: cms.fleets.filter((_, i) => i !== idx),
    });
  };

  // Quality Guarantee Helpers
  const updateQuality = (
    idx: number,
    field: keyof ShopQualityItem,
    val: string,
  ) => {
    const next = [...cms.quality_guarantees];
    next[idx] = { ...next[idx], [field]: val };
    setCms({ ...cms, quality_guarantees: next });
  };

  // FAQ Helpers
  const updateFaq = (idx: number, field: keyof ShopFaqItem, val: string) => {
    const next = [...cms.faqs];
    next[idx] = { ...next[idx], [field]: val };
    setCms({ ...cms, faqs: next });
  };

  const addFaq = () => {
    setCms({
      ...cms,
      faqs: [
        ...cms.faqs,
        {
          id: `FAQ-${Date.now()}`,
          question: "New inquiry regarding material purchasing?",
          answer:
            "Comprehensive details regarding ordering process, fleet logistics, or product test specifications.",
        },
      ],
    });
  };

  const removeFaq = (idx: number) => {
    setCms({
      ...cms,
      faqs: cms.faqs.filter((_, i) => i !== idx),
    });
  };

  const bannerThemeClasses =
    cms.promo_theme === "dark"
      ? "from-stone-900 via-stone-800 to-stone-900 text-white"
      : cms.promo_theme === "emerald"
        ? "from-emerald-900 via-emerald-800 to-teal-900 text-white"
        : "from-[#b02524] via-[#961f1e] to-stone-900 text-white";

  return (
    <div className="space-y-4">
      {/* ERP Standard Controls Bar: Sub-Tab Switcher & Quick Save Actions */}
      <div className="bg-white p-3 rounded-xl border border-stone-200/90 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <Tabs
          tabs={[
            {
              id: "banner",
              label: "Campaign Banner & Announcements",
              icon: <Megaphone className="w-3.5 h-3.5" />,
            },
            {
              id: "bundles",
              label: "Project Bundling Packages",
              icon: <Package className="w-3.5 h-3.5" />,
              count: cms.bundles.length,
            },
            {
              id: "logistics_faq",
              label: "Fleet Guide, Quality & FAQ",
              icon: <Truck className="w-3.5 h-3.5" />,
            },
          ]}
          activeTab={subTab}
          onChange={(id) => setSubTab(id as ShopEditorSubTab)}
        />

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReset}
            leftIcon={<RotateCcw className="w-3.5 h-3.5 text-stone-500" />}
          >
            Reset Default
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={isSaving}
            disabled={isLoading}
            onClick={() => handleSave()}
            leftIcon={<Save className="w-3.5 h-3.5" />}
          >
            Publish to Storefront
          </Button>
        </div>
      </div>

      {/* Split Workspace: Left Editor Panel (5 Cols) + Right Live Preview Panel (7 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: ERP FORM PANEL */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-stone-200/90 shadow-2xs p-4 sm:p-5 space-y-4">
          {subTab === "banner" && (
            <div className="space-y-4">
              <div className="border-b border-stone-200/80 pb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-900">
                  Announcement Ticker, Header &amp; Promo Campaign Banner
                </h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Configure primary promotional messaging and brand trust badges at the top of the Factory Shop page (`/shop`).
                </p>
              </div>

              {/* Top Announcement Bar */}
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-stone-900 block">
                      Enable Shop Announcement Ticker
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Displayed across the top of the Storefront page
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={cms.announcement_enabled}
                    onChange={(e) =>
                      setCms({
                        ...cms,
                        announcement_enabled: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-stone-900 rounded cursor-pointer"
                  />
                </label>

                {cms.announcement_enabled && (
                  <div className="space-y-2.5 pt-2.5 border-t border-stone-200/70">
                    <Input
                      label="Ticker Badge Label"
                      value={cms.announcement_badge}
                      onChange={(e) =>
                        setCms({
                          ...cms,
                          announcement_badge: e.target.value,
                        })
                      }
                    />
                    <Input
                      label="Shop Announcement Text"
                      value={cms.announcement_text}
                      onChange={(e) =>
                        setCms({ ...cms, announcement_text: e.target.value })
                      }
                    />
                  </div>
                )}
              </div>

              {/* Header Copy */}
              <div className="space-y-3">
                <Input
                  label="Catalog Header Title"
                  value={cms.header_title}
                  onChange={(e) =>
                    setCms({ ...cms, header_title: e.target.value })
                  }
                />
                <Input
                  label="Catalog Header Subtitle"
                  value={cms.header_subtitle}
                  onChange={(e) =>
                    setCms({ ...cms, header_subtitle: e.target.value })
                  }
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <Input
                    label="Trust Indicator 1"
                    value={cms.trust_badge_1}
                    onChange={(e) =>
                      setCms({ ...cms, trust_badge_1: e.target.value })
                    }
                  />
                  <Input
                    label="Trust Indicator 2"
                    value={cms.trust_badge_2}
                    onChange={(e) =>
                      setCms({ ...cms, trust_badge_2: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Campaign Promo Banner */}
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-stone-900 block">
                      Display B2B Contract &amp; Promo Campaign Banner
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Highlighted promotional banner above catalog product list
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={cms.promo_banner_enabled}
                    onChange={(e) =>
                      setCms({
                        ...cms,
                        promo_banner_enabled: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-stone-900 rounded cursor-pointer"
                  />
                </label>

                {cms.promo_banner_enabled && (
                  <div className="space-y-2.5 pt-2.5 border-t border-stone-200/70">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <Input
                        label="Campaign Badge"
                        value={cms.promo_badge}
                        onChange={(e) =>
                          setCms({ ...cms, promo_badge: e.target.value })
                        }
                      />
                      <Select
                        label="Banner Color Theme"
                        value={cms.promo_theme}
                        onChange={(e) =>
                          setCms({
                            ...cms,
                            promo_theme: e.target.value as any,
                          })
                        }
                        options={[
                          { value: "crimson", label: "Factory Crimson Red" },
                          { value: "dark", label: "Industrial Charcoal Dark" },
                          { value: "emerald", label: "Construction Emerald Green" },
                        ]}
                      />
                    </div>

                    <Input
                      label="Promo Campaign Title"
                      value={cms.promo_title}
                      onChange={(e) =>
                        setCms({ ...cms, promo_title: e.target.value })
                      }
                    />

                    <Textarea
                      label="Promo Description / Volume Terms"
                      rows={2}
                      value={cms.promo_subtitle}
                      onChange={(e) =>
                        setCms({ ...cms, promo_subtitle: e.target.value })
                      }
                    />

                    <Input
                      label="Call to Action (CTA) Button Text"
                      value={cms.promo_cta_text}
                      onChange={(e) =>
                        setCms({ ...cms, promo_cta_text: e.target.value })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {subTab === "bundles" && (
            <div className="space-y-4">
              <div className="border-b border-stone-200/80 pb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-900">
                    Project Bundling Packages Management
                  </h3>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Curate material combination bundles to streamline contractor and residential project purchasing.
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={addBundle}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  New Bundle
                </Button>
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200/80 cursor-pointer">
                <span className="text-xs font-bold text-stone-900">
                  Display Project Bundling Section on Storefront
                </span>
                <input
                  type="checkbox"
                  checked={cms.show_bundles}
                  onChange={(e) =>
                    setCms({ ...cms, show_bundles: e.target.checked })
                  }
                  className="w-4 h-4 accent-stone-900 rounded cursor-pointer"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Input
                  label="Bundling Section Title"
                  value={cms.bundles_section_title}
                  onChange={(e) =>
                    setCms({ ...cms, bundles_section_title: e.target.value })
                  }
                />
                <Input
                  label="Bundling Section Subtitle"
                  value={cms.bundles_section_subtitle}
                  onChange={(e) =>
                    setCms({
                      ...cms,
                      bundles_section_subtitle: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {cms.bundles.map((b, idx) => (
                  <div
                    key={b.id || idx}
                    className="p-3.5 rounded-xl bg-stone-50/80 border border-stone-200/90 space-y-2.5"
                  >
                    <div className="flex items-center justify-between border-b border-stone-200/70 pb-2">
                      <span className="text-xs font-bold text-stone-900">
                        Package #{idx + 1} — {b.name}
                      </span>
                      <Button
                        variant="danger_soft"
                        size="icon-xs"
                        onClick={() => removeBundle(idx)}
                        title="Delete Bundle"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        label="Package Name"
                        value={b.name}
                        onChange={(e) =>
                          updateBundle(idx, "name", e.target.value)
                        }
                      />
                      <Input
                        label="Target Application"
                        value={b.target_use}
                        onChange={(e) =>
                          updateBundle(idx, "target_use", e.target.value)
                        }
                      />
                    </div>

                    <Input
                      label="Material Combination Details"
                      value={b.items_summary}
                      onChange={(e) =>
                        updateBundle(idx, "items_summary", e.target.value)
                      }
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        label="Estimated Coverage"
                        value={b.area_coverage}
                        onChange={(e) =>
                          updateBundle(idx, "area_coverage", e.target.value)
                        }
                      />
                      <Input
                        label="Package Price (IDR)"
                        type="number"
                        value={String(b.bundle_price)}
                        onChange={(e) =>
                          updateBundle(
                            idx,
                            "bundle_price",
                            Number(e.target.value) || 0,
                          )
                        }
                      />
                      <Input
                        label="Savings Badge"
                        value={b.saving_badge}
                        onChange={(e) =>
                          updateBundle(idx, "saving_badge", e.target.value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {subTab === "logistics_faq" && (
            <div className="space-y-4">
              <div className="border-b border-stone-200/80 pb-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-900">
                  Delivery Fleet Guide, Quality Assurance &amp; FAQ
                </h3>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Educate buyers on truck ritase capacities, SNI test standards, and customer purchasing questions.
                </p>
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200/80 cursor-pointer">
                <span className="text-xs font-bold text-stone-900">
                  Display Fleet Guide, Quality Assurance &amp; FAQ Sections on Storefront
                </span>
                <input
                  type="checkbox"
                  checked={cms.show_info_sections}
                  onChange={(e) =>
                    setCms({ ...cms, show_info_sections: e.target.checked })
                  }
                  className="w-4 h-4 accent-stone-900 rounded cursor-pointer"
                />
              </label>

              {/* Fleet Guide */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">
                    Delivery Fleet Capacity ({cms.fleets.length})
                  </span>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={addFleet}
                    leftIcon={<Plus className="w-3 h-3" />}
                  >
                    Add Fleet
                  </Button>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {cms.fleets.map((fl, idx) => (
                    <div
                      key={fl.id || idx}
                      className="p-3 rounded-xl bg-stone-50/80 border border-stone-200/80 space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-stone-200/70 pb-1.5">
                        <span className="text-xs font-bold text-stone-800">
                          {fl.name}
                        </span>
                        <Button
                          variant="danger_soft"
                          size="xs"
                          onClick={() => removeFleet(idx)}
                        >
                          Delete
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          label="Truck Type"
                          value={fl.name}
                          onChange={(e) =>
                            updateFleet(idx, "name", e.target.value)
                          }
                        />
                        <Input
                          label="Capacity (m² / Ton)"
                          value={fl.capacity}
                          onChange={(e) =>
                            updateFleet(idx, "capacity", e.target.value)
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          label="Road Width Requirement"
                          value={fl.road_access}
                          onChange={(e) =>
                            updateFleet(idx, "road_access", e.target.value)
                          }
                        />
                        <Input
                          label="Operational Notes"
                          value={fl.notes}
                          onChange={(e) =>
                            updateFleet(idx, "notes", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality Guarantees */}
              <div className="pt-3 border-t border-stone-200/80 space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600 block">
                  Factory Quality Assurance &amp; Service Standards
                </span>
                {cms.quality_guarantees.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-3 rounded-xl bg-stone-50/80 border border-stone-200/80 space-y-2"
                  >
                    <Input
                      label={`Guarantee Title #${idx + 1}`}
                      value={q.title}
                      onChange={(e) =>
                        updateQuality(idx, "title", e.target.value)
                      }
                    />
                    <Textarea
                      label="Description"
                      rows={2}
                      value={q.description}
                      onChange={(e) =>
                        updateQuality(idx, "description", e.target.value)
                      }
                    />
                  </div>
                ))}
              </div>

              {/* FAQs */}
              <div className="pt-3 border-t border-stone-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600">
                    Frequently Asked Questions / FAQ ({cms.faqs.length})
                  </span>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={addFaq}
                    leftIcon={<Plus className="w-3 h-3" />}
                  >
                    Add FAQ
                  </Button>
                </div>

                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {cms.faqs.map((fq, idx) => (
                    <div
                      key={fq.id || idx}
                      className="p-3 rounded-xl bg-stone-50/80 border border-stone-200/80 space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-stone-200/70 pb-1.5">
                        <span className="text-xs font-bold text-stone-700">
                          FAQ #{idx + 1}
                        </span>
                        <Button
                          variant="danger_soft"
                          size="xs"
                          onClick={() => removeFaq(idx)}
                        >
                          Delete
                        </Button>
                      </div>
                      <Input
                        label="Question"
                        value={fq.question}
                        onChange={(e) =>
                          updateFaq(idx, "question", e.target.value)
                        }
                      />
                      <Textarea
                        label="Answer"
                        rows={2}
                        value={fq.answer}
                        onChange={(e) =>
                          updateFaq(idx, "answer", e.target.value)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-stone-200/80 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isSaving}
              onClick={() => handleSave()}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              Publish to Storefront
            </Button>
          </div>
        </div>

        {/* RIGHT COLUMN: STANDARD ERP STOREFRONT PREVIEW CARD */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden lg:sticky lg:top-20">
          <div className="px-4 py-3 bg-stone-50 border-b border-stone-200/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-stone-600" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-stone-900">
                Live Storefront Preview (pavingjoss.co.id/shop)
              </span>
            </div>
            <Badge variant="success">Real-Time Sync</Badge>
          </div>

          <div className="bg-[#faf9f6] text-stone-900 max-h-[680px] overflow-y-auto">
            {cms.announcement_enabled && cms.announcement_text && (
              <div className="bg-stone-950 text-white px-4 py-2 text-[11px] flex items-center justify-center gap-2 text-center">
                {cms.announcement_badge && (
                  <span className="px-2 py-0.5 rounded bg-[#b02524] text-white font-black text-[9px] uppercase tracking-wider shrink-0">
                    {cms.announcement_badge}
                  </span>
                )}
                <span className="font-medium truncate">
                  {cms.announcement_text}
                </span>
              </div>
            )}

            <div className="bg-white border-b border-stone-200/80 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black text-stone-900">
                  {cms.header_title}
                </h3>
                <p className="text-xs text-stone-500">{cms.header_subtitle}</p>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-semibold text-stone-700">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  {cms.trust_badge_1}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-[#b02524]" />
                  {cms.trust_badge_2}
                </span>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {cms.promo_banner_enabled && (
                <div
                  className={`rounded-xl bg-gradient-to-r ${bannerThemeClasses} p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}
                >
                  <div className="space-y-1.5 max-w-lg">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300 block">
                      {cms.promo_badge}
                    </span>
                    <h4 className="text-base font-black leading-snug">
                      {cms.promo_title}
                    </h4>
                    <p className="text-xs text-white/80 leading-relaxed">
                      {cms.promo_subtitle}
                    </p>
                  </div>
                  <span className="px-4 py-2 rounded-xl bg-white text-stone-900 text-xs font-extrabold shrink-0 inline-flex items-center gap-1.5 shadow-2xs">
                    <FileText className="w-3.5 h-3.5 text-[#b02524]" />
                    <span>{cms.promo_cta_text}</span>
                  </span>
                </div>
              )}

              {cms.show_bundles && cms.bundles.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-900">
                      {cms.bundles_section_title}
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      {cms.bundles_section_subtitle}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {cms.bundles.map((b, i) => (
                      <div
                        key={b.id || i}
                        className="p-3.5 rounded-xl bg-white border border-stone-200/90 flex flex-col justify-between gap-2 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold">
                            <span className="text-stone-500 truncate">
                              {b.area_coverage}
                            </span>
                            <span className="text-emerald-700 font-extrabold shrink-0">
                              {b.saving_badge}
                            </span>
                          </div>
                          <p className="text-xs font-black text-stone-900 leading-snug">
                            {b.name}
                          </p>
                          <p className="text-[10px] text-stone-500 line-clamp-2">
                            {b.items_summary}
                          </p>
                        </div>
                        <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                          <span className="text-xs font-black font-mono text-stone-900">
                            {formatIDR(b.bundle_price)}
                          </span>
                          <span className="text-[10px] font-bold text-stone-700 inline-flex items-center gap-0.5">
                            Select <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cms.show_info_sections && (
                <div className="pt-4 border-t border-stone-200/80 space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-800 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-stone-600" />
                    <span>{cms.fleet_section_title}</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    {cms.fleets.slice(0, 4).map((fl, i) => (
                      <div
                        key={fl.id || i}
                        className="p-2.5 rounded-xl bg-white border border-stone-200/80 text-[11px]"
                      >
                        <p className="font-bold text-stone-900">{fl.name}</p>
                        <p className="text-stone-700 font-mono font-semibold">
                          {fl.capacity}
                        </p>
                        <p className="text-[10px] text-stone-500">
                          {fl.road_access}
                        </p>
                      </div>
                    ))}
                  </div>

                  {cms.faqs.length > 0 && (
                    <div className="p-3 rounded-xl bg-white border border-stone-200/80 space-y-1">
                      <p className="text-[11px] font-bold text-stone-800 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-stone-500" />
                        <span>{cms.faqs[0].question}</span>
                      </p>
                      <p className="text-[10px] text-stone-500">
                        {cms.faqs[0].answer}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
