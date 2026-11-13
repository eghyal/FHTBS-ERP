import React from "react";
import {
  LayoutTemplate,
  ArrowRight,
  CheckCircle2,
  Building2,
  MapPin,
} from "lucide-react";
import { PublicCmsConfig } from "@/constants/cmsDefaults";
import { PublicTopExperience } from "@/components/layouts/PublicLayout";
import { Badge } from "@/components/ui";

export interface PublicCmsLivePreviewProps {
  cms: PublicCmsConfig;
  eventCurrentlyActive: boolean;
  previewPrimaryColor: string;
  previewSecondaryColor: string;
  previewSurfaceTint: string;
  previewBadgeText: string;
}

export const PublicCmsLivePreview = React.memo(function PublicCmsLivePreview({
  cms,
  eventCurrentlyActive,
  previewPrimaryColor,
  previewSecondaryColor,
  previewSurfaceTint,
  previewBadgeText,
}: PublicCmsLivePreviewProps) {
  return (
    <div className="xl:col-span-5 xl:sticky xl:top-6 space-y-4">
      <div className="bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-stone-600" />
            <span className="text-xs font-bold text-stone-800">
              Live Preview — Public, Careers &amp; Shop Scene
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full border border-black/15"
              style={{ backgroundColor: previewPrimaryColor }}
            />
            <Badge variant={eventCurrentlyActive ? "success" : "neutral"}>
              {eventCurrentlyActive ? "Event Scene" : "Default Scene"}
            </Badge>
          </div>
        </div>

        {/* Simulated Public Canvas (No hard divider between Ornament Banner & Hero) */}
        <div className="bg-[#F5F5F4] max-h-[680px] overflow-y-auto">
          {/* 1 & 2: Live Top Announcement Marquee + Annual Event Ornament Banner */}
          <PublicTopExperience cmsOverride={cms} previewMode={true} />

          {/* Hero Preview with Seamless Ambient Scene Gradient Blend */}
          <div
            className="p-5 relative overflow-hidden border-b border-stone-200/70"
            style={{
              background: `radial-gradient(ellipse 95% 90% at 50% 0%, ${previewPrimaryColor}14 0%, ${previewSurfaceTint}E6 42%, #ffffff 80%, #F5F5F4 100%)`,
            }}
          >
            <span className="public-glass-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-stone-800">
              <span
                className="public-glass-accent-blur -left-1 top-1/2 -translate-y-1/2 w-12 h-7"
                style={{ backgroundColor: previewPrimaryColor }}
                aria-hidden="true"
              />
              <span className="w-1.5 h-1.5 rounded-full bg-stone-400/70 relative z-10" />
              <span className="relative z-10">{cms.hero_badge}</span>
            </span>
            <h3 className="mt-3 text-2xl font-black tracking-tight text-stone-900 leading-tight">
              {cms.hero_title_line1}{" "}
              <span
                className="text-transparent bg-clip-text"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${previewPrimaryColor} 0%, ${previewSecondaryColor} 100%)`,
                }}
              >
                {cms.hero_title_highlight}
              </span>
            </h3>
            <p className="mt-2 text-xs text-stone-600 leading-relaxed">
              {cms.hero_subtitle}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-white text-xs font-bold shadow-xs"
                style={{ backgroundColor: previewPrimaryColor }}
              >
                {cms.hero_primary_cta}
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
              <span className="inline-flex items-center px-3.5 py-2 rounded-lg bg-white border border-stone-200 text-stone-800 text-xs font-bold">
                {cms.hero_secondary_cta}
              </span>
            </div>

            {cms.show_stats && (
              <div className="mt-4 relative">
                <div
                  className="pointer-events-none absolute -inset-x-2 -inset-y-1.5 rounded-xl blur-2xl opacity-15"
                  style={{
                    background: `radial-gradient(ellipse 80% 90% at 30% 50%, ${previewPrimaryColor}0D 0%, ${previewSurfaceTint}4D 50%, rgba(255,255,255,0) 100%)`,
                  }}
                  aria-hidden="true"
                />
                <div className="relative z-10 flex flex-wrap items-center gap-2">
                  {cms.stats.map((s, i) => (
                    <div
                      key={i}
                      className="public-glass-stat-card px-2.5 py-1.5 rounded-lg flex items-center gap-2 w-auto"
                    >
                      <span
                        className="public-glass-accent-blur left-0.5 top-1/2 -translate-y-1/2 w-9 h-7"
                        style={{ backgroundColor: previewPrimaryColor }}
                        aria-hidden="true"
                      />
                      <div className="public-glass-icon-well w-6 h-6 rounded-md flex items-center justify-center shrink-0 relative z-10">
                        <CheckCircle2 className="w-3 h-3 text-stone-600" />
                      </div>
                      <div className="flex flex-col justify-center relative z-10">
                        <div className="text-[11px] font-extrabold text-stone-900 tabular-nums leading-tight whitespace-nowrap">
                          {s.value}
                        </div>
                        <div className="text-[8.5px] text-stone-600 font-semibold uppercase tracking-wider leading-tight mt-0.5 whitespace-nowrap">
                          {s.label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* About & Experts Preview */}
          {(cms.show_about || cms.show_experts) && (
            <div className="p-5 bg-stone-50/70 space-y-3">
              {cms.show_about && (
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-stone-900">
                    {cms.about_title}
                  </div>
                  <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                    {cms.about_description}
                  </p>
                </div>
              )}
              {cms.show_experts && (
                <div className="pt-2 space-y-2">
                  <div className="text-[11px] font-bold text-stone-700">
                    {cms.experts_section_title} ({cms.experts.length})
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {cms.experts.map((ex) => (
                      <div
                        key={ex.id}
                        className="p-2.5 rounded-lg bg-white border border-stone-200/80"
                      >
                        <div className="text-xs font-bold text-stone-900">
                          {ex.name}
                        </div>
                        <div
                          className="text-[10px] font-semibold"
                          style={{ color: previewPrimaryColor }}
                        >
                          {ex.role}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Portfolio Preview */}
          {cms.show_portfolio && (
            <div className="p-5 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: previewPrimaryColor }}
                  >
                    {cms.portfolio_section_badge}
                  </span>
                  <h4 className="text-sm font-black text-stone-900">
                    {cms.portfolio_section_title}
                  </h4>
                </div>
                <Badge variant="neutral">
                  {cms.portfolio_items.length} Projects
                </Badge>
              </div>
              <div className="space-y-2">
                {cms.portfolio_items.slice(0, 2).map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] font-bold text-stone-500">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-stone-400" />
                        {item.client_name}
                      </span>
                      <span
                        className="font-mono"
                        style={{ color: previewPrimaryColor }}
                      >
                        {item.supply_volume}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-stone-900">
                      {item.project_name}
                    </div>
                    <div className="text-[11px] italic text-stone-600 line-clamp-2">
                      "{item.testimonial_quote}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact & Footer Preview */}
          <div className="p-5 bg-stone-900 text-white space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <MapPin className="w-3.5 h-3.5" />
              <span>{cms.address_headline}</span>
            </div>
            <div className="text-xs text-stone-300">{cms.address_full}</div>
            {cms.show_cta_banner && (
              <div
                className="mt-3 p-3 rounded-lg border border-white/15 flex items-center justify-between gap-2"
                style={{ backgroundColor: `${previewPrimaryColor}45` }}
              >
                <div>
                  <div className="text-xs font-bold">
                    {cms.cta_banner_title}
                  </div>
                  <div className="text-[10px] text-stone-200">
                    {cms.phone_display} · {cms.email}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-500 text-stone-950 text-[10px] font-black shrink-0">
                  {cms.cta_banner_button}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
