import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  label?: React.ReactNode;
  error?: string;
  errorMessage?: string;
  helperText?: string;
  wrapperClassName?: string;
}

export const Input = React.memo(
  React.forwardRef<HTMLInputElement, InputProps>(
    (
      {
        className,
        icon,
        leftIcon,
        endIcon,
        rightIcon,
        label,
        error,
        errorMessage,
        helperText,
        wrapperClassName,
        id,
        ...props
      },
      ref,
    ) => {
      const generatedId = React.useId();
      const inputId = id || generatedId;
      const effectiveLeftIcon = leftIcon ?? icon;
      const effectiveRightIcon = rightIcon ?? endIcon;
      const effectiveError = errorMessage ?? error;

      return (
        <div className={cn("w-full flex flex-col justify-end space-y-1.5 text-left", wrapperClassName)}>
          {label && (
            <label
              htmlFor={inputId}
              className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider leading-snug select-none"
            >
              {label}
            </label>
          )}
          <div className="relative flex items-center w-full">
            {effectiveLeftIcon && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">
                {effectiveLeftIcon}
              </div>
            )}
            <input
              id={inputId}
              ref={ref}
              className={cn(
                "input-elegant h-9 py-1.5 text-xs rounded-xl",
                (props.type === "number" || props.type === "date" || props.type === "tel") &&
                  "font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                effectiveLeftIcon ? "!pl-9" : "pl-3.5",
                effectiveRightIcon ? "!pr-9" : "pr-3.5",
                effectiveError && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10",
                className,
              )}
              {...props}
            />
            {effectiveRightIcon && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5">
                {effectiveRightIcon}
              </div>
            )}
          </div>
          {effectiveError ? (
            <p className="text-[10.5px] font-medium text-rose-600 tracking-tight">
              {effectiveError}
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
Input.displayName = "Input";

export { Select, type SelectProps, type SelectOption } from "./Select";
export { Textarea, type TextareaProps } from "./Textarea";

