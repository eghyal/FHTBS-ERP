import React, { useState } from "react";
import { Factory, LayoutGrid, MessageSquare, User } from "lucide-react";

/**
 * MobileAppShell — Zero-Data UI/UX Shell Reference
 * - Bottom navigation strictly ordered left-to-right:
 *   1. Dashboard (default, leftmost)
 *   2. Messages
 *   3. Shop Floor
 *   4. Profile/Hub
 * - Uses official Web ERP PJ logo in compact Top App Bar (56px)
 * - Every modular card displays structural labels & neutral empty state ("—")
 */
export type MobileTabId = "dashboard" | "messages" | "shopfloor" | "profile";

interface MobileAppShellProps {
  logoSrc?: string;
  onLogout?: () => void;
}

const TAB_ITEMS: Array<{
  id: MobileTabId;
  label: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", label: "Dashboard", title: "Dashboard", icon: LayoutGrid },
  { id: "messages", label: "Messages", title: "Messages", icon: MessageSquare },
  { id: "shopfloor", label: "Shop Floor", title: "Shop Floor", icon: Factory },
  { id: "profile", label: "Profile/Hub", title: "Profile / Hub", icon: User },
];

export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  logoSrc = "../brand-assets/logo.png",
  onLogout,
}) => {
  // Default landing tab is ALWAYS "dashboard" (leftmost tab)
  const [activeTab, setActiveTab] = useState<MobileTabId>("dashboard");

  const currentMeta =
    TAB_ITEMS.find((t) => t.id === activeTab) || TAB_ITEMS[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9] text-stone-900 font-sans">
      {/* Compact Sticky Top App Bar (56px) */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-stone-200 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={logoSrc}
            alt="Web ERP Logo"
            className="w-7 h-7 object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <h1 className="text-base font-bold tracking-tight text-stone-900 truncate">
            {currentMeta.title}
          </h1>
        </div>
      </header>

      {/* Scrollable Modular Minimalist Card Canvas */}
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-4 pb-24 space-y-3.5">
        {activeTab === "dashboard" && (
          <>
            <section className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Presensi Hari Ini
              </div>
              <div className="py-2 text-center space-y-1">
                <div className="text-2xl font-bold font-mono text-stone-900">
                  —
                </div>
                <div className="text-xs text-stone-500">Belum tercatat</div>
              </div>
              <button
                type="button"
                className="w-full h-12 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors cursor-pointer"
              >
                Catat Kehadiran
              </button>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Kuota Cuti
                </div>
                <div className="text-xl font-bold font-mono text-stone-900">
                  —
                </div>
                <div className="text-xs text-stone-500">Belum ada data</div>
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Slip Gaji
                </div>
                <div className="text-xl font-bold font-mono text-stone-900">
                  —
                </div>
                <div className="text-xs text-stone-500">Belum tersedia</div>
              </div>
            </section>

            <section className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Aktivitas Terbaru
              </div>
              <div className="py-6 text-center text-xs text-stone-500">
                Belum ada riwayat aktivitas
              </div>
            </section>
          </>
        )}

        {activeTab === "messages" && (
          <>
            <div className="bg-white border border-stone-200 rounded-2xl px-4 h-12 flex items-center text-xs text-stone-400">
              Cari percakapan...
            </div>
            <section className="bg-white border border-stone-200 rounded-2xl p-6 text-center space-y-1.5">
              <div className="text-sm font-bold text-stone-900">
                Belum ada percakapan
              </div>
              <div className="text-xs text-stone-500">
                Pesan tim akan tampil di sini setelah terhubung dengan sistem.
              </div>
            </section>
          </>
        )}

        {activeTab === "shopfloor" && (
          <>
            <section className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Workstation Aktif
              </div>
              <div className="text-sm font-medium text-stone-600">
                — · Belum ada stasiun kerja dipilih
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Target
                </div>
                <div className="text-xl font-bold font-mono text-stone-900">
                  —
                </div>
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Hasil
                </div>
                <div className="text-xl font-bold font-mono text-stone-900">
                  —
                </div>
              </div>
            </section>

            <section className="bg-white border border-stone-200 rounded-2xl p-5 text-center space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 text-left">
                Antrian Produksi
              </div>
              <div className="py-5 text-xs text-stone-500">
                Belum ada tugas produksi aktif
              </div>
            </section>
          </>
        )}

        {activeTab === "profile" && (
          <>
            <section className="bg-white border border-stone-200 rounded-2xl p-4 flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-stone-200/80 shrink-0" />
              <div className="min-w-0 space-y-0.5">
                <div className="text-base font-bold text-stone-900">—</div>
                <div className="text-xs text-stone-500">
                  Belum terhubung ke akun ERP
                </div>
              </div>
            </section>

            <section className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
              {["Preferensi Tampilan", "Informasi Aplikasi", "Tentang Sistem"].map(
                (item) => (
                  <div
                    key={item}
                    className="px-4 py-3.5 flex items-center justify-between text-sm text-stone-800"
                  >
                    <span>{item}</span>
                    <span className="text-stone-400">›</span>
                  </div>
                ),
              )}
            </section>

            <button
              type="button"
              onClick={onLogout}
              className="w-full h-12 bg-white border border-stone-200 rounded-2xl text-sm font-semibold text-[#B02524] hover:bg-stone-50 transition-colors cursor-pointer"
            >
              Keluar
            </button>
          </>
        )}
      </main>

      {/* Fixed 4-Tab Bottom Bar (64px): Dashboard | Messages | Shop Floor | Profile/Hub */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 h-16 bg-white/95 backdrop-blur-md border-t border-stone-200">
        <div className="max-w-md mx-auto h-full grid grid-cols-4">
          {TAB_ITEMS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] transition-colors cursor-pointer ${
                  isActive
                    ? "text-stone-900 font-bold"
                    : "text-stone-400 hover:text-stone-600 font-medium"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="leading-none">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
