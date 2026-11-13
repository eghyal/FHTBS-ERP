import React, { useState } from "react";
import { AlertTriangle, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "warning" | "info" | "positive";
  isDestructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmModal = React.memo(function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "warning",
  isDestructive,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const finalVariant = isDestructive ? "destructive" : variant;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  const iconConfig = {
    destructive: {
      bg: "bg-rose-50 border-rose-100 text-rose-600",
      btn: "danger" as const,
    },
    warning: {
      bg: "bg-amber-50 border-amber-100 text-amber-600",
      btn: "primary" as const,
    },
    positive: {
      bg: "bg-emerald-50 border-emerald-100 text-emerald-600",
      btn: "primary" as const,
    },
    info: {
      bg: "bg-stone-100 border-stone-200 text-stone-700",
      btn: "primary" as const,
    },
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="sm" className="p-0" hideCloseButton>
      <div className="text-center pt-1 pb-1">
        <div
          className={cn(
            "w-11 h-11 sm:w-12 sm:h-12 rounded-xl mx-auto flex items-center justify-center mb-3.5 border",
            iconConfig[finalVariant].bg,
          )}
        >
          <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <h3 className="text-base sm:text-lg font-bold tracking-tight text-stone-900 mb-1.5">
          {title}
        </h3>
        {typeof message === "string" ? (
          <p className="text-xs sm:text-[13px] font-medium leading-relaxed text-stone-500 mb-5">
            {message}
          </p>
        ) : (
          <div className="mb-5 text-xs sm:text-[13px]">{message}</div>
        )}

        {children && <div className="mb-5 text-left">{children}</div>}

        <div className="flex gap-2.5 w-full">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            className="flex-1"
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={iconConfig[finalVariant].btn}
            size="sm"
            onClick={handleConfirm}
            className="flex-1"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
});
