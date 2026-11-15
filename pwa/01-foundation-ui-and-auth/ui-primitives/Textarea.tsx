import React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  error?: boolean | string;
  helperText?: string;
  wrapperClassName?: string;
}

export const Textarea = React.memo(
  React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, label, error, helperText, wrapperClassName, id, ...props }, ref) => {
      const generatedId = React.useId();
      const textareaId = id || generatedId;
      const textareaEl = (
        <textarea
          id={textareaId}
          ref={ref}
          className={cn(
            "input-elegant min-h-[72px] py-2 px-3.5 text-xs rounded-xl resize-y w-full",
            error && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10",
            className,
          )}
          {...props}
        />
      );

      if (!label && !helperText && typeof error !== "string") {
        return textareaEl;
      }

      return (
        <div className={cn("w-full space-y-1.5 text-left", wrapperClassName)}>
          {label && (
            <label
              htmlFor={textareaId}
              className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider select-none"
            >
              {label}
            </label>
          )}
          {textareaEl}
          {typeof error === "string" && error ? (
            <p className="text-[10.5px] font-medium text-rose-600 tracking-tight">{error}</p>
          ) : helperText ? (
            <p className="text-[10.5px] font-medium text-stone-400 tracking-tight">{helperText}</p>
          ) : null}
        </div>
      );
    },
  ),
);
Textarea.displayName = "Textarea";

