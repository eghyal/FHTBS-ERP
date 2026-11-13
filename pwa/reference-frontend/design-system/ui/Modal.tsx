import React, { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string; // For additional styling on the modal container
  contentClassName?: string; // For styling the content wrapper (e.g. to remove default padding)
  closeOnOverlayClick?: boolean;
  hideCloseButton?: boolean;
  maxWidth?:
    | "sm"
    | "md"
    | "lg"
    | "xl"
    | "2xl"
    | "3xl"
    | "4xl"
    | "5xl"
    | "6xl"
    | "7xl"
    | "full";
  size?:
    | "sm"
    | "md"
    | "lg"
    | "xl"
    | "2xl"
    | "3xl"
    | "4xl"
    | "5xl"
    | "6xl"
    | "7xl"
    | "full";
  uiTheme?: "auto" | "erp" | "hris";
}

export const Modal = memo(function Modal({
  isOpen,
  onClose,
  title,
  description,
  headerActions,
  footer,
  children,
  className,
  contentClassName,
  closeOnOverlayClick = true,
  hideCloseButton = false,
  maxWidth,
  size,
  uiTheme = "auto",
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const effectiveMaxWidth = maxWidth || size || "lg";
  const maxWidthClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
    full: "max-w-full m-4",
  }[effectiveMaxWidth];

  if (typeof document === "undefined") return null;

  const isHrisContext =
    uiTheme === "hris" ||
    (uiTheme === "auto" &&
      (document.documentElement.classList.contains("hris-dark") ||
        Boolean(document.querySelector(".hris-theme"))));

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <React.Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-stone-950/50 backdrop-blur-sm z-[200]"
            onClick={closeOnOverlayClick ? onClose : undefined}
          />
          <div
            className={cn(
              "fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-3 md:p-4 pointer-events-none",
              isHrisContext && "hris-theme",
            )}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.98, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 24 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "bg-white w-full flex flex-col pointer-events-auto border border-stone-200/90",
                "max-h-[90dvh] sm:max-h-[86vh]",
                isHrisContext
                  ? "rounded-t-2xl sm:rounded-2xl hris-glass-panel"
                  : "rounded-t-xl sm:rounded-xl",
                "mt-auto sm:mt-0",
                "shadow-[0_-10px_35px_-12px_rgba(0,0,0,0.18)] sm:shadow-2xl",
                maxWidthClass,
                className,
              )}
            >
              {/* Mobile Bottom-Sheet Grab Handle */}
              <div className="sm:hidden flex justify-center pt-2 pb-0.5 shrink-0">
                <div className="w-9 h-1 rounded-full bg-stone-300/80" />
              </div>

              {(title || headerActions) && (
                <div
                  className={cn(
                    "sticky top-0 bg-white z-10 flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-stone-200/80 shrink-0",
                    isHrisContext ? "rounded-t-2xl" : "rounded-t-xl",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    {typeof title === "string" ? (
                      <h3 className="text-sm sm:text-base font-bold tracking-tight text-stone-900 truncate">
                        {title}
                      </h3>
                    ) : (
                      title
                    )}
                    {description && (
                      <p className="text-[10px] sm:text-[11px] text-stone-500 font-semibold uppercase tracking-wider mt-0.5 truncate">
                        {description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {headerActions}
                    {!hideCloseButton && (
                      <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close modal"
                        className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
                      >
                        <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div
                className={cn(
                  "overflow-y-auto p-4 sm:p-5 custom-scrollbar flex-1",
                  contentClassName,
                )}
              >
                {children}
              </div>
              {footer && (
                <div
                  className={cn(
                    "sticky bottom-0 bg-stone-50/95 backdrop-blur-xs z-10 flex flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-5 sm:py-3.5 border-t border-stone-200/80 shrink-0",
                    isHrisContext ? "sm:rounded-b-2xl" : "sm:rounded-b-xl",
                  )}
                >
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </React.Fragment>
      )}
    </AnimatePresence>,
    document.body,
  );
});
