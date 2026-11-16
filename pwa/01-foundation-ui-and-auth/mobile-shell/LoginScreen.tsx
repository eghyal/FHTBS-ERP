import React, { useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react";

/**
 * LoginScreen — UI/UX Reference (Zero-Data / Zero-Backend Shell)
 * Aligns visually with Web ERP Login card style adapted to Modular Minimalist Mobile:
 * - Warm off-white background (#FAFAF9)
 * - Centered minimalist white card (rounded-3xl, 1px hairline border)
 * - Official Web ERP PJ graphic logo (brand-assets/logo.png)
 * - Clean Username & Password inputs + primary "Masuk" button
 */
interface LoginScreenProps {
  logoSrc?: string;
  onEnterShell?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  logoSrc = "../brand-assets/logo.png",
  onEnterShell,
}) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Phase 1 (UI/UX Only): Navigates directly to default tab ("Dashboard").
    // Backend authentication & PostgreSQL session wiring occur in the Final Phase.
    onEnterShell?.();
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-stone-900 flex items-center justify-center p-5 font-sans">
      <div className="w-full max-w-sm bg-white border border-stone-200/90 rounded-3xl p-7 shadow-xl shadow-stone-200/40">
        {/* Official Web ERP Brand Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-16 h-16 flex items-center justify-center mb-4">
            <img
              src={logoSrc}
              alt="Web ERP Official Logo"
              className="w-14 h-14 object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900">
            Masuk ke Akun
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Portal Operasional Mobile
          </p>
        </div>

        {/* Minimalist Credential Inputs */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Username
            </label>
            <div className="relative flex items-center">
              <User className="w-4 h-4 text-stone-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                className="w-full h-12 pl-10 pr-3.5 rounded-xl bg-stone-50/60 border border-stone-200 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-900 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Password
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                className="w-full h-12 pl-10 pr-11 rounded-xl bg-stone-50/60 border border-stone-200 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-900 focus:bg-white transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                aria-label={showPassword ? "Sembunyikan password" : "Lihat password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-12 mt-2 bg-stone-900 hover:bg-stone-800 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
          >
            <span>Masuk</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
