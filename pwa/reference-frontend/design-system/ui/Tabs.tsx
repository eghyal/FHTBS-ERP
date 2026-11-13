import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  count?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedTabsProps<T extends string = string> {
  items?: TabItem<T>[];
  tabs?: TabItem<T>[];
  activeId?: T;
  activeTab?: T;
  onChange: (id: any) => void;
  className?: string;
  mobileColumns?: 2 | 3 | 4;
  size?: "sm" | "md";
}

export const SegmentedTabs = memo(function SegmentedTabs<T extends string = string>({
  items,
  tabs,
  activeId,
  activeTab,
  onChange,
  className,
  mobileColumns = 2,
  size = "md",
}: SegmentedTabsProps<T>) {
  const resolvedItems = items || tabs || [];
  const currentActiveId = activeId ?? activeTab;

  const mobileGridClass =
    mobileColumns === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : mobileColumns === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2";

  return (
    <div
      role="tablist"
      className={cn(
        "grid md:inline-flex md:flex-nowrap shrink-0 items-center gap-1 p-1 bg-stone-100/90 border border-stone-200/80 rounded-xl w-full md:w-auto",
        mobileGridClass,
        className,
      )}
    >
      {resolvedItems.map((item) => {
        const isActive = item.id === currentActiveId;
        const displayBadge =
          item.badge !== undefined && item.badge !== null
            ? item.badge
            : item.count !== undefined && item.count !== null
              ? item.count
              : null;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.id)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg font-bold tracking-wide transition-all cursor-pointer select-none whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed",
              size === "sm"
                ? "h-7 px-2.5 text-[11px]"
                : "h-7 px-3 text-[11px] sm:text-xs",
              isActive
                ? "bg-white text-stone-900 border border-stone-200/90 shadow-2xs"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 border border-transparent",
            )}
          >
            {item.icon && (
              <span
                className={cn(
                  "shrink-0 flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5",
                  isActive ? "text-stone-900" : "text-stone-400",
                )}
              >
                {item.icon}
              </span>
            )}
            <span className="truncate">{item.label}</span>
            {displayBadge !== null && (
              <span
                className={cn(
                  "ml-0.5 px-1.5 py-0.2 rounded text-[9.5px] font-mono tabular-nums font-bold",
                  isActive
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-stone-200/70 text-stone-600",
                )}
              >
                {displayBadge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

export const Tabs = SegmentedTabs;
