import React, { useState } from "react";
import {
  Settings,
  ShieldAlert,
  Save,
  Trash2,
  Globe,
  Sparkles,
  Lock,
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { broadcastCmsUpdate } from "@/utils/cmsLiveSync";
import { Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface HrSettingsTabProps {
  cmsData: any;
  setCmsData: (val: any) => void;
  currentUser: any;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onRefresh: () => void;
}

export const HrSettingsTab: React.FC<HrSettingsTabProps> = React.memo(
  ({ cmsData, setCmsData, currentUser, showToast, onRefresh }) => {
    const [isSavingCms, setIsSavingCms] = useState(false);
    const [isSweeping, setIsSweeping] = useState(false);

    const handleSaveCms = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSavingCms(true);
      try {
        const payload = cmsData || {};
        // Optimistically broadcast immediately (< 5ms) so open /careers tabs update right away
        broadcastCmsUpdate("careers", payload);
        const res = await apiFetch(
          "/api/cms/careers",
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
          currentUser?.username,
        );
        if (res.ok) {
          broadcastCmsUpdate("careers", payload);
          showToast(
            "Public Careers portal CMS settings saved & synced in real time",
            "success",
          );
        } else {
          showToast(res.error || "Failed to save CMS settings", "error");
        }
      } catch (e) {
        showToast("Error saving CMS settings", "error");
      } finally {
        setIsSavingCms(false);
      }
    };

    const handleRunDataSweep = async () => {
      setIsSweeping(true);
      try {
        const res = await apiFetch(
          "/api/hr/sweep-data",
          { method: "POST" },
          currentUser?.username,
        );
        if (res.ok) {
          showToast(
            `GDPR/Privacy Sweep complete. Redacted ${(res.data as any)?.redacted_count || 0} stale rejected applications.`,
            "success",
          );
          onRefresh();
        } else {
          showToast(res.error || "Failed to run data sweep", "error");
        }
      } catch (e) {
        showToast("Error running privacy sweep", "error");
      } finally {
        setIsSweeping(false);
      }
    };

    const previewTitle =
      cmsData?.hero_title ||
      "Bangun Masa Depan Infrastruktur Beton Pracetak";
    const previewSubtitle =
      cmsData?.hero_subtitle ||
      "Bergabunglah bersama CV Batu Emas Group (Paving Joss) dan wujudkan keunggulan manufaktur presisi tinggi.";

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* STUDIO TOP: SIDE-BY-SIDE CMS EDITOR (5 COLS) + REAL-TIME /CAREERS BROWSER PREVIEW (7 COLS) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* CMS Form Editor */}
          <div className="lg:col-span-5 hris-glass-panel p-6 sm:p-7 rounded-[30px] flex flex-col justify-between space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-stone-100 text-[#121318] border border-white flex items-center justify-center">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#121318] tracking-tight">
                  Careers Page CMS (/careers)
                </h3>
                <p className="text-xs font-medium text-[#8E929F]">
                  Edit public /careers hero copy with live preview
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSaveCms}
              className="space-y-4 font-bold text-xs flex-1 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#646876] block mb-1.5">
                    Careers Hero Main Heading
                  </label>
                  <Input
                    type="text"
                    value={cmsData?.hero_title || ""}
                    onChange={(e) =>
                      setCmsData({ ...cmsData, hero_title: e.target.value })
                    }
                    placeholder="Bangun Masa Depan Infrastruktur Beton Pracetak"
                    className="w-full px-4 py-3 bg-white/90 border border-white rounded-2xl text-[#121318] outline-none focus:border-[#F25730]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-[#646876] block mb-1.5">
                    Careers Hero Subtitle Description
                  </label>
                  <Textarea
                    rows={4}
                    value={cmsData?.hero_subtitle || ""}
                    onChange={(e) =>
                      setCmsData({ ...cmsData, hero_subtitle: e.target.value })
                    }
                    placeholder="Bergabunglah bersama CV Batu Emas Group (Paving Joss)..."
                    className="w-full px-4 py-3 bg-white/90 border border-white rounded-2xl text-[#121318] outline-none focus:border-[#F25730]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={isSavingCms}
                className="w-full py-3 px-5 bg-[#121318] hover:bg-[#1E2028] text-white rounded-2xl text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
              >
                <Save className="w-4 h-4 text-emerald-400" />
                <span>
                  {isSavingCms ? "Saving..." : "Publish to /careers Portal"}
                </span>
              </Button>
            </form>
          </div>

          {/* Real-Time /careers Browser Frame Preview */}
          <div className="lg:col-span-7 hris-glass-panel p-5 sm:p-6 rounded-[30px] flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-400" />
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="ml-2 px-3 py-1 rounded-full bg-white/80 border border-white text-[11px] font-bold text-[#646876] flex items-center gap-1.5">
                  <Globe className="w-3 h-3 text-emerald-600" />
                  <span>pavingjoss.co.id/careers · Live Hero Preview</span>
                </span>
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#F25730] flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Real-Time Canvas
              </span>
            </div>

            <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#121318] via-[#1E2028] to-stone-900 text-white p-8 sm:p-10 flex-1 flex flex-col justify-center">
              <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-[#F25730]/25 blur-3xl pointer-events-none" />
              <div className="absolute -left-12 -bottom-12 w-56 h-56 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />

              <div className="relative z-10 max-w-xl space-y-4">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold text-emerald-300">
                  SDM &amp; Budaya Kerja · Portal Karir
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-white">
                  {previewTitle}
                </h2>
                <p className="text-xs sm:text-sm text-white/75 leading-relaxed font-normal">
                  {previewSubtitle}
                </p>
                <div className="pt-2 flex items-center gap-3">
                  <span className="px-4 py-2 rounded-xl bg-[#F25730] text-white text-xs font-bold">
                    Lihat Lowongan Tersedia
                  </span>
                  <span className="px-4 py-2 rounded-xl bg-white/10 text-white/80 text-xs font-semibold">
                    Lacak Status Lamaran
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM VAULT: 180-DAY GDPR DATA PRIVACY & RETENTION SWEEPER */}
        <div className="hris-glass-panel p-6 sm:p-7 rounded-[30px] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4 max-w-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-700 border border-rose-200/70 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-[#121318]">
                  180-Day GDPR Applicant Privacy Vault
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold uppercase flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Compliant
                </span>
              </div>
              <p className="text-xs text-[#646876] leading-relaxed">
                Automatically anonymizes personal names, phone numbers, and CV
                attachments of rejected candidates older than 180 days while
                preserving aggregate hiring funnel analytics.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="danger"
            disabled={isSweeping}
            onClick={handleRunDataSweep}
            className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 disabled:opacity-50 shrink-0 shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {isSweeping
                ? "Sweeping Stale PII..."
                : "Execute 180-Day Privacy Sweep"}
            </span>
          </Button>
        </div>
      </div>
    );
  },
);
