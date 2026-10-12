import React from "react";

interface CurrencyInputProps {
  value: number | string;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  prefix?: string;
  disabled?: boolean;
  label?: string;
  error?: string;
  helperText?: string;
}

export const formatThousand = (num: number | string | undefined | null): string => {
  if (num === undefined || num === null || num === "") return "";
  const cleanStr = String(num).replace(/\D/g, "");
  if (!cleanStr) return "";
  return new Intl.NumberFormat("id-ID").format(Number(cleanStr));
};

export const parseThousand = (formattedStr: string): number => {
  if (typeof formattedStr === "number") return formattedStr;
  const cleanStr = String(formattedStr).replace(/\D/g, "");
  return cleanStr ? Number(cleanStr) : 0;
};

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  placeholder = "0",
  className = "",
  prefix = "Rp ",
  disabled = false,
  label,
  error,
  helperText,
}) => {
  const displayValue = formatThousand(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawText = e.target.value;
    const parsedNum = parseThousand(rawText);
    onChange(parsedNum);
  };

  return (
    <div className={`flex flex-col gap-1 w-full ${className}`}>
      {label && (
        <label className="text-[10px] font-bold uppercase tracking-wider text-stone-600">
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full">
        {prefix && (
          <span className="absolute left-3 text-stone-400 font-mono text-xs font-bold pointer-events-none select-none">
            {prefix}
          </span>
        )}
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-full ${prefix ? "pl-9" : "px-3"} pr-3 py-2 bg-stone-50 border rounded-xl text-xs font-mono font-bold text-stone-900 outline-none transition-all disabled:opacity-50 ${
            error
              ? "border-rose-400 focus:border-rose-600 focus:ring-1 focus:ring-rose-500/20"
              : "border-stone-200 focus:bg-white focus:border-stone-900 focus:ring-1 focus:ring-stone-900/10"
          }`}
        />
      </div>
      {error && <p className="text-[10px] font-medium text-rose-600">{error}</p>}
      {!error && helperText && <p className="text-[10px] text-stone-500">{helperText}</p>}
    </div>
  );
};
