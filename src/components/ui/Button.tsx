import React, { memo } from "react";
import { cn } from "@/lib/utils";
import {
  Loader2,
  ShieldCheck,
  FileEdit,
  XCircle,
  Trash2,
  Edit2,
  Plus,
  Eye,
  CheckCircle2,
  Download,
  AlertCircle,
  Archive,
} from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "dark"
    | "brand"
    | "coral"
    | "coral_soft"
    | "glass"
    | "secondary"
    | "outline"
    | "ghost"
    | "danger"
    | "danger_soft"
    | "success"
    | "success_soft"
    | "emerald_soft"
    | "warning"
    | "warning_soft"
    | "amber_soft"
    | "info"
    | "info_soft";
  size?: "xs" | "sm" | "md" | "lg" | "icon" | "icon-xs" | "icon-sm";
  action?:
    | "authorize"
    | "revise"
    | "cancel"
    | "delete"
    | "archive"
    | "edit"
    | "create"
    | "view"
    | "approve"
    | "reject";
  isLoading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  lockKey?: string;
}

const actionMap: Record<string, { variant: any; icon: any; text: string; tooltip?: string }> = {
  authorize: { variant: "success", icon: ShieldCheck, text: "", tooltip: "Authorize" },
  approve: { variant: "success", icon: ShieldCheck, text: "Approve" },
  revise: { variant: "warning_soft", icon: FileEdit, text: "", tooltip: "Revise" },
  cancel: { variant: "secondary", icon: null, text: "Cancel" },
  delete: { variant: "danger_soft", icon: Trash2, text: "", tooltip: "Delete" },
  archive: { variant: "amber_soft", icon: Archive, text: "Archive", tooltip: "Archive" },
  edit: { variant: "secondary", icon: Edit2, text: "Edit" },
  create: { variant: "primary", icon: Plus, text: "Create" },
  view: { variant: "secondary", icon: Eye, text: "" },
  reject: { variant: "danger_soft", icon: XCircle, text: "Reject" },
};

const variants: Record<string, string> = {
  primary:
    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs border border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
  dark:
    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs border border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
  brand:
    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs border border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
  coral:
    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs border border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
  coral_soft:
    "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
  glass:
    "bg-white/80 backdrop-blur-md border border-stone-200/80 text-stone-700 hover:bg-white hover:text-stone-900 shadow-2xs focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none",
  secondary:
    "bg-white border border-stone-200/90 text-stone-700 hover:bg-stone-50 hover:text-stone-900 hover:border-stone-300 shadow-2xs focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none",
  outline:
    "bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 hover:text-stone-900 shadow-2xs focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none",
  ghost:
    "bg-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-100/80 border border-transparent focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 shadow-2xs border border-transparent focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none",
  danger_soft:
    "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/70 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs border border-transparent focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
  success_soft:
    "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/70 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
  emerald_soft:
    "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/70 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
  warning:
    "bg-amber-500 text-stone-950 hover:bg-amber-400 shadow-2xs border border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none",
  warning_soft:
    "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/70 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none",
  amber_soft:
    "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/70 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none",
  info: "bg-sky-600 text-white hover:bg-sky-700 shadow-2xs border border-transparent focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none",
  info_soft:
    "bg-stone-100 text-stone-700 hover:bg-stone-200/80 border border-stone-200/80 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none",
};

const sizes: Record<string, string> = {
  xs: "h-7 px-2.5 py-1 rounded-lg text-[10.5px] font-bold tracking-wide",
  "icon-xs": "h-7 w-7 p-1 rounded-lg",
  sm: "h-8 px-3 py-1 rounded-xl text-[11px] font-bold tracking-wide",
  "icon-sm": "h-8 w-8 p-1.5 rounded-xl",
  md: "h-9 px-3.5 py-1.5 rounded-xl text-xs font-bold tracking-wide",
  lg: "h-10 px-4 py-2 rounded-xl text-xs sm:text-[13px] font-bold tracking-wide",
  icon: "h-9 w-9 p-2 rounded-xl",
};

export const Button = memo(function Button({
  className,
  variant,
  size = "md",
  type = "button",
  action,
  isLoading,
  fullWidth,
  icon,
  leftIcon,
  rightIcon,
  lockKey: _lockKey,
  children,
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const [internalBusy, setInternalBusy] = React.useState(false);
  const clickLockRef = React.useRef(false);

  const handleGuardedClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || isLoading || internalBusy || clickLockRef.current) {
        e.preventDefault();
        return;
      }
      if (!onClick) return;

      clickLockRef.current = true;
      try {
        const result = onClick(e) as unknown;
        if (result && typeof (result as Promise<unknown>).then === "function") {
          setInternalBusy(true);
          (result as Promise<unknown>).finally(() => {
            setInternalBusy(false);
            clickLockRef.current = false;
          });
        } else {
          setTimeout(() => {
            clickLockRef.current = false;
          }, 300);
        }
      } catch (err) {
        clickLockRef.current = false;
        throw err;
      }
    },
    [disabled, isLoading, internalBusy, onClick],
  );

  const activeMapping = action ? actionMap[action] : null;
  const finalVariant = variant || activeMapping?.variant || "primary";
  const ActionIcon = activeMapping?.icon;
  const customLeftIcon = leftIcon ?? icon;
  const defaultText = activeMapping?.text;
  const finalChildren = children ?? defaultText;
  const isIconOnly = !finalChildren && (!!ActionIcon || !!customLeftIcon);
  const tooltip = props.title || activeMapping?.tooltip;
  const effectiveLoading = Boolean(isLoading || internalBusy);

  return (
    <button
      type={type}
      disabled={disabled || effectiveLoading}
      onClick={onClick ? handleGuardedClick : undefined}
      className={cn(
        "transition-all duration-150 whitespace-nowrap shrink-0 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 select-none cursor-pointer",
        variants[finalVariant],
        sizes[size],
        fullWidth && "w-full",
        className,
        isIconOnly && size === "xs" ? "!p-1 !w-7 !h-7" : "",
        isIconOnly && size === "sm" ? "!p-1.5 !w-8 !h-8" : "",
        isIconOnly && size === "md" ? "!p-2 !w-9 !h-9" : "",
      )}
      {...props}
      title={tooltip || props.title}
    >
      {effectiveLoading && (
        <Loader2
          className={cn(
            "animate-spin shrink-0",
            size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5",
          )}
        />
      )}
      {!effectiveLoading && customLeftIcon && (
        <span className="shrink-0 flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">
          {customLeftIcon}
        </span>
      )}
      {!effectiveLoading && !customLeftIcon && ActionIcon && (
        <ActionIcon
          className={cn(
            "shrink-0",
            size === "xs"
              ? "w-3 h-3"
              : size === "sm"
                ? "w-3.5 h-3.5"
                : "w-3.5 h-3.5",
          )}
        />
      )}
      {finalChildren}
      {!effectiveLoading && rightIcon && (
        <span className="shrink-0 flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">
          {rightIcon}
        </span>
      )}
    </button>
  );
});

