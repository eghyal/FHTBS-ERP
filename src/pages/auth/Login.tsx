import { apiFetch } from "@/utils/api";
import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowRight,
  Lock,
  Unlock,
  User,
  Globe,
  Briefcase,
  Shield,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ERP_DEPARTMENT_OPTIONS,
  ERP_LEVEL_OPTIONS,
} from "@/constants/rbac";

const REGISTRATION_ROLES = ERP_DEPARTMENT_OPTIONS.filter(
  (r) => r.value !== "FC",
);

export default function Login() {
  const { appLogo } = useTheme();
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("SALES");
  const [level, setLevel] = useState("STAFF");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      if (isRegistering) {
        const res = await apiFetch("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            username: username.trim(),
            password,
            name: (name || username).trim(),
            role,
            level,
          }),
        });

        if (res.ok) {
          setSuccessMessage(
            res.data?.message ||
              "Account request submitted. Please wait for FC approval.",
          );
          setIsRegistering(false);
          setPassword("");
        } else {
          setError(res.error || "Registration failed");
        }
      } else {
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: username.trim(), password }),
        });

        if (res.ok && res.data?.user) {
          login(res.data.user, res.data.token);
          if (res.data.user.role === "PRODUCTION") {
            navigate("/production");
          } else {
            navigate("/erp");
          }
        } else {
          setError(res.error || "Invalid username or password");
        }
      }
    } catch (_err) {
      setError("A network error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] dark:bg-[#0c0e13] text-stone-900 dark:text-stone-100 flex items-center justify-center p-4 font-sans relative overflow-hidden transition-colors duration-200">
      {/* Visit Public Website top-right button */}
      <div className="absolute top-6 right-6 md:top-8 md:right-8 z-20">
        <a
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/90 dark:bg-stone-800/80 hover:bg-stone-50 dark:hover:bg-stone-700/80 border border-stone-200/80 dark:border-stone-700/80 backdrop-blur-md rounded-full text-[11px] font-bold uppercase tracking-widest text-stone-700 dark:text-stone-300 transition-all shadow-sm active:scale-95 group"
        >
          <Globe className="w-4 h-4 text-stone-400 group-hover:text-stone-600 dark:text-stone-400 dark:group-hover:text-stone-300 transition-colors" />
          <span>Visit Public Website</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-stone-400 group-hover:text-stone-600 dark:text-stone-400 dark:group-hover:text-stone-300" />
        </a>
      </div>

      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-stone-100 dark:from-stone-900/30 to-transparent -z-10" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-stone-100 dark:bg-stone-900/20 rounded-full blur-3xl opacity-50 -z-10" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-stone-100 dark:bg-stone-900/20 rounded-full blur-3xl opacity-50 -z-10" />

      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <a
            href="/"
            className="inline-flex items-center justify-center w-20 h-20 mb-6 drop-shadow-md hover:scale-105 transition-transform cursor-pointer"
          >
            <img
              src={appLogo}
              alt="Paving Joss Logo"
              onError={(e) => {
                e.currentTarget.src = "/logo.png";
              }}
              className="w-20 h-20 object-contain drop-shadow-sm"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
          </a>
          <h1 className="text-xl font-light text-stone-900 dark:text-stone-100 tracking-tight">
            {isRegistering ? "Request Access" : "Enterprise Resource Planning"}
          </h1>
          <p className="text-stone-500 dark:text-stone-400 mt-2 text-sm tracking-wide">
            {isRegistering
              ? "Register your credentials for FC approval"
              : "Secure Operational Portal"}
          </p>
        </div>

        <div className="bg-white/95 dark:bg-[#141821]/95 backdrop-blur-2xl border border-stone-100 dark:border-white/10 rounded-3xl p-8 shadow-2xl shadow-stone-200/50 dark:shadow-[0_24px_60px_rgba(0,0,0,0.65)] animate-in fade-in zoom-in duration-300">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-[#b02524] text-xs font-semibold rounded-xl text-center animate-in fade-in zoom-in duration-200">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl text-center animate-in fade-in zoom-in duration-200">
                {successMessage}
              </div>
            )}

            {isRegistering && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Full Name
                  </label>
                  <Input
                    icon={<User className="w-4 h-4" />}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Department
                  </label>
                  <Select
                    icon={<Briefcase className="w-4 h-4" />}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {REGISTRATION_ROLES.map((dept) => (
                      <option key={dept.value} value={dept.value}>
                        {dept.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Authority Level
                  </label>
                  <Select
                    icon={<Shield className="w-4 h-4" />}
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                  >
                    {ERP_LEVEL_OPTIONS.map((lvl) => (
                      <option key={lvl.value} value={lvl.value}>
                        {lvl.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                {isRegistering ? "Username" : "Employee ID"}
              </label>
              <Input
                icon={<User className="w-4 h-4" />}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={
                  isRegistering ? "Choose a username" : "Enter your username"
                }
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                {isRegistering ? "Password" : "Secure Passcode"}
              </label>
              <div className="relative">
                <Input
                  icon={<Lock className="w-4 h-4" />}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer flex items-center justify-center outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <Unlock className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="login-submit-btn w-full py-3.5 bg-stone-900 text-white font-bold text-[10px] uppercase tracking-[0.2em] rounded-xl hover:bg-stone-800 transition-all flex items-center justify-center gap-2 group shadow-xl shadow-stone-900/15 active:scale-[0.98] disabled:opacity-50 mt-4 cursor-pointer"
            >
              {isLoading
                ? isRegistering
                  ? "Submitting..."
                  : "Authenticating..."
                : isRegistering
                  ? "Request Account"
                  : "Sign In"}{" "}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-stone-100 dark:border-white/10 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError("");
                setSuccessMessage("");
              }}
              className="text-xs font-semibold text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors cursor-pointer"
            >
              {isRegistering
                ? "Already have an account? Sign In"
                : "Don't have an account? Request Access"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
