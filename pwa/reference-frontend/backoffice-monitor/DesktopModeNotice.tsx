import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Monitor,
  Smartphone,
  ShieldAlert,
  Lock,
  CheckCircle2,
  ArrowLeft,
  Laptop,
  Copy,
  X,
  Zap,
  Key,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "@/contexts/AuthContext";
import { useMobileMonitoring } from "@/contexts/MonitoringContext";
import {
  getDesktopRequiredRouteMeta,
  getRoleMonitoringProfile,
  hasGodMode,
} from "@/utils/pbac";
import { getDailyAuthKey } from "@/utils/auth";
import { copyToClipboard } from "@/utils/clipboard";
import { useToast } from "@/contexts/ToastContext";

interface DesktopModeContentProps {
  featureTitle?: string;
  category?: string;
  reason?: string;
  desktopFeatures?: string[];
  isModal?: boolean;
  onClose?: () => void;
}

export const DesktopModeNoticeContent: React.FC<DesktopModeContentProps> = ({
  featureTitle,
  category,
  reason,
  desktopFeatures,
  isModal = false,
  onClose,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { enableForceDesktopMode, closeDesktopNotice } = useMobileMonitoring();
  const [showAuthKey, setShowAuthKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const roleProfile = getRoleMonitoringProfile(user?.role || "SALES");
  const isExecutive = hasGodMode(user);
  const levelLabel = isExecutive
    ? "EXECUTIVE"
    : user?.level === "MANAGER"
      ? "MANAGER"
      : "STAFF";

  const handleCopyUrl = async () => {
    const ok = await copyToClipboard(window.location.href);
    if (ok) {
      showToast("Link copied for PC/Laptop", "success");
    }
  };

  const handleCopyAuthKey = async () => {
    if (!user) return;
    const key = getDailyAuthKey(user.username);
    const ok = await copyToClipboard(key);
    if (ok) {
      setCopiedKey(true);
      showToast("Daily PIN copied", "success");
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleBackToHub = () => {
    if (onClose) onClose();
    closeDesktopNotice();
    navigate("/erp");
  };

  return (
    <div className="bg-white border border-stone-200 rounded-3xl shadow-xl overflow-hidden max-w-lg w-full mx-auto">
      {/* Compact Header Banner */}
      <div className="bg-stone-900 text-white p-4 relative overflow-hidden">
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-[#FFD700] shrink-0">
              <Monitor className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                <Lock className="w-3 h-3" />
                <span>{category || "System Info"}</span>
              </div>
              <h3 className="text-sm font-bold tracking-tight text-white">
                {featureTitle || "System Info & Desktop Mode"}
              </h3>
            </div>
          </div>

          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="mt-2.5 text-xs text-stone-300 leading-snug">
          {reason || "Daily 6-Digit Authorization Key, mobile role capabilities, and desktop workstation controls."}
        </p>
      </div>

      {/* Main Content Body */}
      <div className="p-4 space-y-3">
        {/* User Role & Mobile vs Desktop Summary */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl bg-stone-50 border border-stone-200/80">
          <div className="text-xs font-bold text-stone-900 truncate">
            {user?.name || user?.username || "User"} ·{" "}
            <span className="text-stone-600">{user?.role || "STAFF"}</span>
          </div>
          <span className="px-2 py-0.5 rounded-lg bg-stone-100 border border-stone-200/80 text-stone-800 text-[10px] font-mono font-bold uppercase shrink-0">
            {levelLabel}
          </span>
        </div>

        {/* Daily 6-Digit Auth Key in System Info */}
        {user && (
          <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-stone-900 text-[#FFD700] flex items-center justify-center shrink-0">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Daily 6-Digit Auth Key (PIN)
                </div>
                <div className="text-xs font-mono font-black text-stone-900 mt-0.5 tracking-widest">
                  {showAuthKey ? getDailyAuthKey(user.username) : "••••••"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAuthKey((v) => !v)}
                className="w-8 h-8 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-600 cursor-pointer"
                title={showAuthKey ? "Hide PIN" : "Show PIN"}
              >
                {showAuthKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleCopyAuthKey}
                className="w-8 h-8 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-600 cursor-pointer"
                title="Copy Daily PIN"
              >
                {copiedKey ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {desktopFeatures && desktopFeatures.length > 0 ? (
          <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-3 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Desktop Features</span>
            </div>
            <ul className="space-y-1 text-xs text-stone-700">
              {desktopFeatures.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-600 font-bold">·</span>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Mobile App</span>
              </div>
              <ul className="space-y-1 text-[11px] text-stone-700">
                {roleProfile.mobileCapabilitiesId.map((cap, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 rounded-2xl border border-stone-200/90 bg-stone-50/70 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-800 uppercase tracking-wider">
                <Lock className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span>Desktop Only</span>
              </div>
              <ul className="space-y-1 text-[11px] text-stone-600">
                {roleProfile.lockedCapabilitiesId.map((cap, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Copy URL to open on PC */}
        <div className="p-2.5 px-3 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Laptop className="w-4 h-4 text-stone-500 shrink-0" />
            <span className="text-[11px] text-stone-600 truncate">
              Open this link on PC/Laptop
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="min-h-[34px] px-2.5 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-[11px] font-bold text-stone-800 inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-stone-500" />
            <span>Copy Link</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="pt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={isModal && onClose ? onClose : handleBackToHub}
            className="w-full min-h-[42px] rounded-2xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-stone-300" />
            <span>{isModal ? "Back to Mobile App" : "Open Mobile Hub"}</span>
          </button>

          <div className="flex items-center gap-2">
            {!isModal && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 min-h-[40px] rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}

            <button
              type="button"
              onClick={enableForceDesktopMode}
              className="flex-1 min-h-[40px] px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200/90 text-amber-900 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Force Desktop View</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const DesktopModeNoticeModal: React.FC = () => {
  const { desktopNotice, closeDesktopNotice } = useMobileMonitoring();

  return (
    <AnimatePresence>
      {desktopNotice.isOpen && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-2.5 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs"
            onClick={closeDesktopNotice}
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <DesktopModeNoticeContent
              featureTitle={desktopNotice.featureTitle}
              reason={desktopNotice.reason}
              isModal={true}
              onClose={closeDesktopNotice}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const DesktopModeRequiredPage: React.FC<{
  moduleName?: string;
}> = ({ moduleName }) => {
  const location = useLocation();
  const routeMeta = getDesktopRequiredRouteMeta(location.pathname);

  return (
    <div className="py-2 sm:py-6 px-1">
      <DesktopModeNoticeContent
        featureTitle={routeMeta?.title || moduleName || "Desktop Studio"}
        category={routeMeta?.category}
        reason={
          routeMeta?.reason ||
          "Multi-column spreadsheets and authoring tools require a desktop screen."
        }
        desktopFeatures={routeMeta?.desktopFeatures}
        isModal={false}
      />
    </div>
  );
};
