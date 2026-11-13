import React, { memo } from "react";
import { cn } from "@/lib/utils";

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  wrapperClassName?: string;
  compact?: boolean;
  unbordered?: boolean;
}

export const Table = memo(
  React.forwardRef<HTMLTableElement, TableProps>(
    ({ className, wrapperClassName, compact = false, unbordered = false, ...props }, ref) => (
      <div
        className={cn(
          "relative w-full overflow-x-auto custom-scrollbar bg-white",
          !unbordered && "rounded-2xl border border-stone-200/80 shadow-2xs",
          wrapperClassName,
        )}
      >
        <table
          ref={ref}
          data-compact={compact ? "true" : undefined}
          className={cn(
            "w-full caption-bottom text-xs border-collapse tabular-nums",
            compact && "[&_th]:h-8 [&_th]:px-2.5 [&_td]:px-2.5 [&_td]:py-1.5",
            className,
          )}
          {...props}
        />
      </div>
    ),
  ),
);
Table.displayName = "Table";

export const TableHeader = memo(
  React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
  >(({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn("bg-stone-50/95 border-b border-stone-200/80 sticky top-0 z-10", className)}
      {...props}
    />
  )),
);
TableHeader.displayName = "TableHeader";

export const TableBody = memo(
  React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
  >(({ className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={cn("divide-y divide-stone-100 bg-white", className)}
      {...props}
    />
  )),
);
TableBody.displayName = "TableBody";

export const TableFooter = memo(
  React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
  >(({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn(
        "border-t border-stone-200/80 bg-stone-50/80 font-bold text-stone-900 tabular-nums",
        className,
      )}
      {...props}
    />
  )),
);
TableFooter.displayName = "TableFooter";

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  hoverable?: boolean;
}

export const TableRow = memo(
  React.forwardRef<HTMLTableRowElement, TableRowProps>(
    ({ className, hoverable = true, ...props }, ref) => (
      <tr
        ref={ref}
        className={cn(
          "transition-colors data-[state=selected]:bg-stone-100/80",
          hoverable && "hover:bg-stone-50/80",
          className,
        )}
        {...props}
      />
    ),
  ),
);
TableRow.displayName = "TableRow";

export const TableHead = memo(
  React.forwardRef<
    HTMLTableCellElement,
    React.ThHTMLAttributes<HTMLTableCellElement>
  >(({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-9 px-3 sm:px-3.5 text-left align-middle font-bold text-stone-500 text-[10px] sm:text-[10.5px] uppercase tracking-wider select-none whitespace-nowrap",
        className,
      )}
      {...props}
    />
  )),
);
TableHead.displayName = "TableHead";

export const TableCell = memo(
  React.forwardRef<
    HTMLTableCellElement,
    React.TdHTMLAttributes<HTMLTableCellElement>
  >(({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        "px-3 py-2.5 sm:px-3.5 sm:py-2.5 align-middle text-stone-700 font-normal leading-snug tabular-nums",
        className,
      )}
      {...props}
    />
  )),
);
TableCell.displayName = "TableCell";

export const TableEmpty = memo(function TableEmpty({
  colSpan,
  message = "No records found",
  icon,
}: {
  colSpan: number;
  message?: string;
  icon?: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="h-28 text-center p-6 text-stone-400 font-medium select-none"
      >
        <div className="flex flex-col items-center justify-center gap-1.5">
          {icon && <div className="text-stone-300 [&>svg]:w-6 [&>svg]:h-6">{icon}</div>}
          <p className="text-xs font-semibold text-stone-500">{message}</p>
        </div>
      </td>
    </tr>
  );
});
