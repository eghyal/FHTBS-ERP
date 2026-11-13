import React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  label?: React.ReactNode;
  error?: string;
  helperText?: string;
  wrapperClassName?: string;
  options?: SelectOption[];
}

export const Select = React.memo(
  React.forwardRef<HTMLSelectElement, SelectProps>(
    (
      {
        className,
        icon,
        leftIcon,
        label,
        error,
        helperText,
        wrapperClassName,
        options,
        children,
        id,
        ...props
      },
      ref,
    ) => {
      const generatedId = React.useId();
      const selectId = id || generatedId;
      const [isFocused, setIsFocused] = React.useState(false);
      const effectiveIcon = leftIcon ?? icon;

      return (
        <div className={cn("w-full space-y-1.5 text-left", wrapperClassName)}>
          {label && (
            <label
              htmlFor={selectId}
              className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider select-none"
            >
              {label}
            </label>
          )}
          <div className="relative flex items-center w-full">
            {effectiveIcon && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">
                {effectiveIcon}
              </div>
            )}
            <select
              id={selectId}
              ref={ref}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className={cn(
                "input-elegant w-full min-w-0 truncate h-9 py-1.5 text-xs font-medium text-stone-700 rounded-xl appearance-none cursor-pointer",
                effectiveIcon ? "!pl-8.5 !pr-7" : "pl-3 !pr-7",
                error && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10",
                className,
              )}
              {...props}
            >
              {options
                ? options.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                      {opt.label}
                    </option>
                  ))
                : children}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none flex items-center justify-center">
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 transition-transform duration-200",
                  isFocused && "rotate-180 text-stone-700",
                )}
              />
            </div>
          </div>
          {error ? (
            <p className="text-[10.5px] font-medium text-rose-600 tracking-tight">
              {error}
            </p>
          ) : helperText ? (
            <p className="text-[10.5px] font-medium text-stone-400 tracking-tight">
              {helperText}
            </p>
          ) : null}
        </div>
      );
    },
  ),
);
Select.displayName = "Select";


