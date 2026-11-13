import React, {
  useMemo,
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, X, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useNotifications } from "./NotificationContext";

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { addNotification } = useNotifications();

  const showToast = useCallback(
    (message: string, type: ToastType) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type }]);

      // Add to notification history
      addNotification(
        type === "success" ? "SUCCESS" : type === "error" ? "ERROR" : "INFO",
        type.charAt(0).toUpperCase() + type.slice(1),
        message,
      );

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    },
    [addNotification],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed top-4 right-4 flex flex-col gap-2 pointer-events-none isolate"
            style={{ zIndex: 2147483647 }}
          >
            <AnimatePresence>
              {toasts.map((toast) => (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, x: 30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 30, scale: 0.95 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border min-w-[320px] max-w-[420px] pointer-events-auto",
                    toast.type === "success"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                      : toast.type === "error"
                        ? "bg-rose-50 border-rose-200 text-rose-950"
                        : toast.type === "warning"
                          ? "bg-amber-50 border-amber-200 text-amber-950"
                          : "bg-blue-50 border-blue-200 text-blue-950",
                  )}
                >
                  {toast.type === "success" && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  )}
                  {toast.type === "error" && (
                    <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  )}
                  {toast.type === "warning" && (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  )}
                  {toast.type === "info" && (
                    <Info className="w-5 h-5 text-blue-600 shrink-0" />
                  )}
                  <p className="text-xs font-bold flex-1 leading-snug">
                    {toast.message}
                  </p>
                  <button
                    onClick={() => removeToast(toast.id)}
                    className="text-stone-400 hover:text-stone-700 p-1 rounded-lg transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
